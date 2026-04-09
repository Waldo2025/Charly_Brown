import { firebaseWebConfig, assertFirebaseWebConfig } from "./firebase-web-config.js";
import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import {
  getFirestore, collection, collectionGroup, query, where, getDocs, doc, 
  updateDoc, arrayUnion, arrayRemove, getDoc, addDoc, deleteDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";


// Configuración de Firebase
const firebaseConfig = assertFirebaseWebConfig(firebaseWebConfig);



// Inicializa Firebase solo una vez
const app = initializeApp(firebaseConfig);

const db = getFirestore(app);


// Ahora puedes usar Firebase Auth y otros servicios
const auth = getAuth(app);

let unsubscribeSidebarUnread = null;

function setHeaderUserEmail(email = "") {
  const el = document.getElementById("headerUserEmail");
  if (!el) return;
  const safe = String(email || "").trim();
  el.textContent = safe || "Sin sesión";
  el.setAttribute("title", safe || "Usuario autenticado");
}

function getChatBadgeEl() {
  const chatLink = document.getElementById("chatLink");
  if (!chatLink) return null;
  let badge = document.getElementById("chat-notification-badge");
  if (!badge) {
    badge = document.createElement("em");
    badge.id = "chat-notification-badge";
    badge.className = "sidebar-badge";
    badge.hidden = true;
    badge.textContent = "0";
    chatLink.appendChild(badge);
  }
  return badge;
}

function updateChatBadge(totalUnread) {
  const badge = getChatBadgeEl();
  if (!badge) return;
  if (totalUnread > 0) {
    badge.textContent = totalUnread > 99 ? "99+" : String(totalUnread);
    badge.hidden = false;
    badge.classList.add("is-visible");
    return;
  }
  badge.textContent = "0";
  badge.hidden = true;
  badge.classList.remove("is-visible");
}

function getConversationId(user1, user2) {
  return user1 < user2 ? `${user1}_${user2}` : `${user2}_${user1}`;
}

function getLastReadTs(uid, conversationId) {
  const raw = localStorage.getItem(`chat_last_read:${uid}:${conversationId}`);
  const ts = Number(raw || 0);
  return Number.isFinite(ts) ? ts : 0;
}

function getMessageTs(message) {
  try {
    if (message?.timestamp?.toMillis) return message.timestamp.toMillis();
    if (message?.timestamp?.seconds) return Number(message.timestamp.seconds) * 1000;
    const n = Number(message?.timestamp || 0);
    return Number.isFinite(n) ? n : 0;
  } catch (_) {
    return 0;
  }
}

function startSidebarUnreadListener(uid) {
  if (typeof unsubscribeSidebarUnread === "function") {
    unsubscribeSidebarUnread();
    unsubscribeSidebarUnread = null;
  }
  if (!uid) {
    updateChatBadge(0);
    return;
  }

  const qUnread = query(
    collectionGroup(db, "chat"),
    where("receiverId", "==", uid)
  );

  unsubscribeSidebarUnread = onSnapshot(
    qUnread,
    (snapshot) => {
      let total = 0;
      snapshot.forEach((docSnap) => {
        const msg = docSnap.data();
        if (!msg || msg.senderId === uid || msg.receiverId !== uid) return;
        const otherUid = msg.senderId;
        if (!otherUid) return;
        const convId = getConversationId(uid, otherUid);
        const lastRead = getLastReadTs(uid, convId);
        const msgTs = getMessageTs(msg);
        if (msgTs > lastRead) total += 1;
      });
      updateChatBadge(total);
    },
    () => {
      // Si falla por reglas/indice, ocultar badge y no romper sidebar.
      updateChatBadge(0);
    }
  );
}

function applySidebarRoleVisibility(role = "") {
  const normalizedRole = canonicalRole(role);
  if (document.body) {
    document.body.setAttribute("data-user-role", normalizedRole || "");
  }
  const roleLinks = document.querySelectorAll("#sidebar .sidebar-link[data-role-visibility]");
  roleLinks.forEach((link) => {
    const allowed = String(link.dataset.roleVisibility || "")
      .split(",")
      .map((v) => canonicalRole(v))
      .filter(Boolean);
    const isVisible = allowed.length > 0 && allowed.includes(normalizedRole);
    link.classList.toggle("d-none", !isVisible);
    link.hidden = !isVisible;
    if (!isVisible) {
      link.setAttribute("aria-hidden", "true");
      link.setAttribute("tabindex", "-1");
    } else {
      link.setAttribute("aria-hidden", "false");
      link.removeAttribute("tabindex");
    }
  });

  // Hard guard por enlace para que cada opción respete su rol real.
  const roleLockedIds = {
    gestionUsuariosLink: ["admin"],
    lecturasGameLink: ["admin"]
  };
  Object.entries(roleLockedIds).forEach(([id, allowedRoles]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const roleList = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    const isVisible = roleList.includes(normalizedRole);
    el.classList.toggle("d-none", !isVisible);
    el.hidden = !isVisible;
    if (!isVisible) {
      el.style.display = "none";
      el.setAttribute("aria-hidden", "true");
      el.setAttribute("tabindex", "-1");
    } else {
      el.style.display = "";
      el.setAttribute("aria-hidden", "false");
      el.removeAttribute("tabindex");
    }
  });
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
  if (["superadmin", "superadministrator", "owner"].includes(token)) return "superAdmin";
  if (["admin", "administrador", "administrator"].includes(token)) return "admin";
  if (["author", "autor", "autoria"].includes(token)) return "author";
  if (["editor", "editorial"].includes(token)) return "editor";
  if (["designer", "disenador", "diseno"].includes(token)) return "designer";
  if (["developer", "desarrollador", "desarrollo", "dev"].includes(token)) return "developer";
  if (["pending", "pendiente"].includes(token)) return "pending";
  return token;
}

function extractUserRole(data = {}) {
  if (data?.superAdmin === true || data?.superadmin === true) return "superAdmin";
  if (data?.admin === true) return "admin";
  return canonicalRole(
    data.role
    || data.rol
    || data.userRole
    || data.user_role
    || data.userType
    || data.tipoUsuario
    || data.requestedRole
  ) || null;
}

async function resolveUserRole(user) {
  if (!user?.uid) return null;

  // 1) Ruta estándar users/{uid}
  const direct = await getDoc(doc(db, "users", user.uid));
  if (direct.exists()) {
    const data = direct.data() || {};
    return extractUserRole(data);
  }

  // 2) Compatibilidad por campo uid
  const byUid = await getDocs(query(collection(db, "users"), where("uid", "==", user.uid)));
  if (!byUid.empty) {
    const data = byUid.docs[0].data() || {};
    return extractUserRole(data);
  }

  // 3) Compatibilidad por email
  const email = String(user.email || "").trim();
  if (email) {
    const byEmail = await getDocs(query(collection(db, "users"), where("email", "==", email)));
    if (!byEmail.empty) {
      const data = byEmail.docs[0].data() || {};
      return extractUserRole(data);
    }
    const byEmailLower = await getDocs(query(collection(db, "users"), where("email", "==", email.toLowerCase())));
    if (!byEmailLower.empty) {
      const data = byEmailLower.docs[0].data() || {};
      return extractUserRole(data);
    }
  }

  return null;
}

async function resolveRoleFromToken(user) {
  if (!user?.getIdTokenResult) return null;
  try {
    const tokenResult = await user.getIdTokenResult();
    return extractUserRole(tokenResult?.claims || {});
  } catch (_) {
    return null;
  }
}





onAuthStateChanged(auth, async user => {
  if (!user) {
    if (typeof unsubscribeSidebarUnread === "function") unsubscribeSidebarUnread();
    unsubscribeSidebarUnread = null;
    updateChatBadge(0);
    setHeaderUserEmail("");
    applySidebarRoleVisibility("");
    return;
  }
  setHeaderUserEmail(user.email || "");
  let role = null;
  // 1) priorizar claims/token, igual que el backend de seguridad
  if (!role) {
    role = await resolveRoleFromToken(user);
  }
  if (!role) {
    try {
      // 2) fallback a Firestore (compatibilidad con docs legacy)
      role = await resolveUserRole(user);
    } catch (_) {
      role = null;
    }
  }
  // 2) aplicar visibilidad por rol para enlaces del sidebar
  applySidebarRoleVisibility(role);
  // 3) compatibilidad legacy por id (si falta data-role-visibility)
  const analisisLink = document.getElementById("analisisEditorialLink");
  if (analisisLink && !analisisLink.dataset.roleVisibility) {
    const permitidos = ["admin","author","developer"];
    analisisLink.classList.toggle("d-none", !permitidos.includes(canonicalRole(role)));
  }
  const gestionUsuariosLink = document.getElementById("gestionUsuariosLink");
  if (gestionUsuariosLink && !gestionUsuariosLink.dataset.roleVisibility) {
    gestionUsuariosLink.classList.toggle("d-none", canonicalRole(role) !== "admin");
  }

  startSidebarUnreadListener(user.uid);
});


document.addEventListener("DOMContentLoaded", () => {
  setHeaderUserEmail(auth.currentUser?.email || "");
  applySidebarRoleVisibility("");
  const sidebar = document.getElementById("sidebar");
  const toggleBtn = document.getElementById("menuToggle");
  if (!sidebar) return;

  const toggleSidebar = () => {
    sidebar.classList.toggle("show");

    if (sidebar.classList.contains("show")) {
      document.body.classList.remove("sidebar-collapsed");
    } else {
      document.body.classList.add("sidebar-collapsed");
    }
  };

  if (toggleBtn) {
    toggleBtn.addEventListener("click", toggleSidebar);
  }

  // Sidebar colapsado por defecto
  sidebar.classList.remove("show");
  document.body.classList.add("sidebar-collapsed");

  // Navegación SPA con fallback offline
  document.querySelectorAll(".sidebar-link[data-page]").forEach(link => {
    link.addEventListener("click", async (e) => {
      e.preventDefault();
      const page = link.dataset.page;
  
      try {
        const res = await fetch(page);
        const html = await res.text();
  
        // Guarda en localStorage para navegación offline
        localStorage.setItem(`page:${page}`, html);
  
        // Si quieres cargar lógica JS específica:
        if (page === "unidadHome.html") {
          import("./unidadHome.js");
        } else if (page === "home.html") {
          import("./home.js");
        }
  
      } catch (error) {
        // Cargar desde cache si está disponible
        const cached = localStorage.getItem(`page:${page}`);
        if (cached) {
          document.getElementById("app").innerHTML = cached;
        }
      }
    });
  });

  // Cerrar sesión
// Cerrar sesión y redirigir a index.html
const logoutLink = document.getElementById("logoutLink");
if (logoutLink) {
  logoutLink.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      const auth = getAuth(); // Obtener instancia de auth
      await signOut(auth); // Cerrar sesión
      localStorage.clear(); // Limpiar todo el almacenamiento local

      // Redirigir a la página index.html dentro de la app Electron
      window.location.href = "index.html"; // Redirige a la página index.html de la app local
    } catch (err) {
      alert("Error al cerrar sesión.");
    }
  });
}

});
