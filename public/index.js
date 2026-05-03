import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import {
  getFirestore,
  setDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  collection
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { firebaseWebConfig, assertFirebaseWebConfig } from "./firebase-web-config.js";
import { bootstrapFirebaseAppCheck } from "./firebase-app-check.js";
import { sanitizeTextInput } from "./security-utils.js";

let app = null;
let auth = null;
let firestore = null;
let authPersistenceReady = Promise.resolve();
const AREA_ROLE_MAP = Object.freeze({
  editorial: "editor",
  autoria: "author",
  diseno: "designer",
  desarrollo: "developer"
});

try {
  const firebaseConfig = assertFirebaseWebConfig(firebaseWebConfig);
  app = initializeApp(firebaseConfig);
  void bootstrapFirebaseAppCheck(app);
  auth = getAuth(app);
  firestore = getFirestore(app);
  authPersistenceReady = setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.warn("[index] No se pudo fijar persistencia local de Firebase Auth:", err);
  });
} catch (err) {
  const msg = err?.message || "No se pudo inicializar Firebase.";
  alert(`Error de configuración: ${msg}`);
}

async function waitAuthPersistence(maxMs = 1800) {
  try {
    const timeout = new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(maxMs) || 0)));
    await Promise.race([authPersistenceReady, timeout]);
  } catch (_) {
    // ignore
  }
}

function normalizeArea(area = "") {
  return String(area || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeToken(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_-]+/g, "");
}

function canonicalRole(value = "") {
  const token = normalizeToken(value);
  if (!token) return "";
  if (["admin", "administrador", "administrator", "superadmin", "owner"].includes(token)) return "admin";
  if (["author", "autor", "autoria"].includes(token)) return "author";
  if (["editor", "editorial"].includes(token)) return "editor";
  if (["designer", "disenador", "diseno"].includes(token)) return "designer";
  if (["developer", "desarrollador", "desarrollo", "dev"].includes(token)) return "developer";
  if (["pending", "pendiente"].includes(token)) return "pending";
  return token;
}

function canonicalStatus(value = "") {
  const token = normalizeToken(value);
  if (!token) return "";
  if (["approved", "aprobado", "active", "activo"].includes(token)) return "approved";
  if (["rejected", "rechazado", "denied", "denegado", "blocked", "bloqueado"].includes(token)) return "rejected";
  if (["pending", "pendiente", "review", "revision"].includes(token)) return "pending";
  return token;
}

function isFirestorePermissionError(error) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  return code === "permission-denied"
    || code === "firestore/permission-denied"
    || message.includes("missing or insufficient permissions");
}

function buildFriendlyAuthErrorMessage(error) {
  const code = String(error?.code || "").trim();
  const message = String(error?.message || "").trim();

  switch (code) {
    case "auth/api-key-not-valid":
      return "Error de configuración de inicio de sesión. Contacta al administrador.";
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
      return "Correo o contraseña incorrectos.";
    case "auth/user-not-found":
      return "El correo no está registrado.";
    case "auth/wrong-password":
      return "Contraseña incorrecta.";
    case "auth/invalid-email":
      return "Correo inválido.";
    case "auth/operation-not-allowed":
      return "El método Email/Password no está habilitado en Firebase Auth.";
    case "auth/too-many-requests":
      return "Demasiados intentos. Espera un momento e intenta nuevamente.";
    case "auth/network-request-failed":
      return "No se pudo conectar con Firebase. Revisa tu conexión o si el navegador está bloqueando la solicitud.";
    case "auth/unauthorized-domain":
      return `Este dominio no está autorizado en Firebase Auth. Agrega "${window.location.hostname}" en Authentication > Settings > Authorized domains.`;
    case "auth/invalid-app-credential":
      return "Firebase rechazó la credencial de la app. Revisa App Check, dominio autorizado o recarga completa la página.";
    case "auth/app-deleted":
    case "auth/invalid-api-key":
      return "La configuración de Firebase Auth no es válida en esta página. Recarga y verifica la configuración.";
    case "permission-denied":
    case "firestore/permission-denied":
      return auth.currentUser
        ? ""
        : "No se pudo validar el perfil por permisos de Firestore. Intenta de nuevo.";
    default:
      if (isFirestorePermissionError(error) && auth.currentUser) return "";
      if (code) {
        return `No se pudo iniciar sesión. Código: ${code}${message ? `\nDetalle: ${message}` : ""}`;
      }
      return `No se pudo iniciar sesión. ${message || "Verifica tus datos e intenta nuevamente."}`;
  }
}

function hydrateProfile(data = {}) {
  const role = canonicalRole(data.role || data.rol || data.userRole);
  const explicitStatus = canonicalStatus(data.approvalStatus || data.status || data.estado || data.estadoAprobacion);
  const approvalStatus = explicitStatus || (role && role !== "pending" ? "approved" : "pending");
  return { ...data, role, approvalStatus };
}

function resolveRoleByArea(area = "") {
  return AREA_ROLE_MAP[normalizeArea(area)] || null;
}

async function getUserProfileByUid(uid = "") {
  if (!uid) return null;
  const snap = await getDoc(doc(firestore, "users", uid));
  if (!snap.exists()) return null;
  return hydrateProfile(snap.data() || {});
}

async function getUserProfileForAuthUser(authUser) {
  if (!authUser?.uid) return null;
  if (!auth?.currentUser || auth.currentUser.uid !== authUser.uid) return null;

  try {
    // Esperar token de sesión evita lecturas sin contexto auth en algunos navegadores/redes lentas.
    await authUser.getIdToken();

    // 1) users/{uid}
    const byUidDoc = await getUserProfileByUid(authUser.uid);
    if (byUidDoc) return byUidDoc;

    // 2) users where uid == auth.uid
    const byUidField = await getDocs(query(collection(firestore, "users"), where("uid", "==", authUser.uid), limit(1)));
    if (!byUidField.empty) {
      return hydrateProfile(byUidField.docs[0].data() || {});
    }

    // 3) users where email == auth.email / auth.email lowercase
    const email = String(authUser.email || "").trim();
    if (email) {
      const byEmail = await getDocs(query(collection(firestore, "users"), where("email", "==", email), limit(1)));
      if (!byEmail.empty) {
        return hydrateProfile(byEmail.docs[0].data() || {});
      }
      const byEmailLower = await getDocs(query(collection(firestore, "users"), where("email", "==", email.toLowerCase()), limit(1)));
      if (!byEmailLower.empty) {
        return hydrateProfile(byEmailLower.docs[0].data() || {});
      }
    }
  } catch (error) {
    if (isFirestorePermissionError(error)) {
      return null;
    }
    throw error;
  }

  return null;
}

async function routeAuthenticatedUser(user, { showAlerts = true } = {}) {
  if (!user) return false;

  await authPersistenceReady;

  try {
    await user.getIdToken();
  } catch (tokenError) {
    console.warn("[index] No se pudo obtener token de sesión:", tokenError);
  }

  let profile = null;
  try {
    profile = await getUserProfileForAuthUser(user);
  } catch (profileError) {
    if (!isFirestorePermissionError(profileError)) {
      console.warn("[index] No se pudo leer perfil de usuario:", profileError);
    }
  }

  if (profile) {
    const isAdmin = canonicalRole(profile.role) === "admin";
    
    if (profile.approvalStatus === "rejected") {
      await signOut(auth);
      if (showAlerts) {
        alert("Tu acceso fue rechazado por administración. Contacta al administrador.");
      }
      return false;
    }
    
    // Si no es admin, debe estar aprobado y tener un rol que no sea 'pending'
    if (!isAdmin && (profile.approvalStatus !== "approved" || profile.role === "pending")) {
      await signOut(auth);
      if (showAlerts) {
        alert("Tu cuenta está pendiente de aprobación por administración.");
      }
      return false;
    }
  }

  window.location.href = "home.html";
  return true;
}

// Mostrar y ocultar modales
document.addEventListener("DOMContentLoaded", () => {
  if (!auth || !firestore) {
    return;
  }
  const loginBtn = document.getElementById("loginBtn");
  const registerBtn = document.getElementById("registerBtn");
  const userLoginBtn = document.getElementById("userLoginBtn");
  const registerUserBtn = document.getElementById("registerUserBtn");

  onAuthStateChanged(auth, (user) => {
    if (!user) return;
    if (window.location.pathname.endsWith("/index.html") || window.location.pathname.endsWith("/")) {
      routeAuthenticatedUser(user, { showAlerts: false }).catch((error) => {
        console.warn("[index] No se pudo redirigir la sesión activa:", error);
      });
    }
  });

  if (loginBtn) {
    loginBtn.addEventListener("click", () => {
      const loginModal = new bootstrap.Modal(document.getElementById("loginModal"));
      loginModal.show();
    });
  }

  if (registerBtn) {
    registerBtn.addEventListener("click", () => {
      const modalEl = document.getElementById("registerModal");
      const registerModal = new bootstrap.Modal(modalEl);
      
      registerModal.show();
  
      // Asegúrate de que aria-hidden se quite después de mostrar
      modalEl.addEventListener("shown.bs.modal", () => {
        modalEl.removeAttribute("aria-hidden"); // 👈 forzamos el cambio
      });
    });
  }

  // Evento de inicio de sesión
  if (userLoginBtn) {
    userLoginBtn.addEventListener("click", async () => {
      const email = document.getElementById("loginEmail").value.trim();
      const password = document.getElementById("loginPassword").value.trim();

      if (!email || !password) {
        alert("Por favor, ingresa tu correo electrónico y contraseña.");
        return;
      }

      try {
        userLoginBtn.disabled = true;
        await waitAuthPersistence();
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        await routeAuthenticatedUser(userCredential.user);

      } catch (error) {
        console.warn("[index] Error al iniciar sesión:", error);
        if (
          error?.code === "permission-denied" ||
          error?.code === "firestore/permission-denied" ||
          (isFirestorePermissionError(error) && auth.currentUser)
        ) {
          if (auth.currentUser) {
            window.location.href = "home.html";
            return;
          }
        }
        alert(buildFriendlyAuthErrorMessage(error));
      } finally {
        userLoginBtn.disabled = false;
      }
    });
  }

  // Evento de registro de usuario
  if (registerUserBtn) {
    registerUserBtn.addEventListener("click", async () => {
      const firstName = sanitizeTextInput(document.getElementById("firstName").value, { maxLength: 80 });
      const lastName = sanitizeTextInput(document.getElementById("lastName").value, { maxLength: 80 });
      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value.trim();
      const area = document.getElementById("areaSelect").value;
      const requestedRole = resolveRoleByArea(area);

      if (!firstName || !lastName || !email || !password || !area || !requestedRole) {
        alert("Por favor, completa todos los campos.");
        return;
      }

      try {
        registerUserBtn.disabled = true;
        await waitAuthPersistence();
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid;

        await setDoc(doc(firestore, "users", uid), {
          uid,
          firstName,
          lastName,
          email: email.toLowerCase(),
          area,
          requestedRole,
          role: "pending",
          approvalStatus: "pending",
          approvalRequestedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        
        await signOut(auth);
        alert("✅ Registro enviado. Tu cuenta quedó pendiente de aprobación por administración.");
        document.getElementById("firstName").value = "";
        document.getElementById("lastName").value = "";
        document.getElementById("email").value = "";
        document.getElementById("password").value = "";
        document.getElementById("areaSelect").value = "editorial";
        const modalEl = document.getElementById("registerModal");
        const modal = modalEl ? bootstrap.Modal.getInstance(modalEl) : null;
        modal?.hide();

      } catch (error) {
        if (isFirestorePermissionError(error)) {
          await signOut(auth).catch(() => {});
          alert("Tu usuario se creó, pero no se pudo guardar el perfil por permisos de Firestore. Contacta al administrador.");
          return;
        }
        switch (error.code) {
          case "auth/api-key-not-valid":
            alert("Error de configuración de registro. Contacta al administrador.");
            break;
          case "auth/email-already-in-use":
            alert("Este correo ya está registrado.");
            break;
          case "auth/invalid-email":
            alert("El correo electrónico no es válido.");
            break;
          case "auth/weak-password":
            alert("La contraseña debe tener al menos 6 caracteres.");
            break;
          default:
            alert("No se pudo completar el registro. Intenta nuevamente.");
        }
      } finally {
        registerUserBtn.disabled = false;
      }
    });
  }
});
