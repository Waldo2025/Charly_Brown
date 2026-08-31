import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { auth, db } from "./marcie-firebase.js";

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
  if (["pending", "pendiente"].includes(token)) return "pending";
  if ([
    "admin",
    "administrador",
    "owner",
    "superadmin",
    "author",
    "autor",
    "editor",
    "editorial",
    "desarrollo",
    "desarrollador",
    "developer",
    "dev",
    "profe",
    "profesor",
    "docente",
    "member",
    "miembro",
    "usuario",
    "user",
    "lector",
    "reader"
  ].includes(token)) return token;
  return "";
}

function canonicalStatus(value = "") {
  const token = normalizeToken(value);
  if (!token) return "";
  if (["approved", "aprobado", "active", "activo"].includes(token)) return "approved";
  if (["rejected", "rechazado", "denied", "denegado", "blocked", "bloqueado"].includes(token)) return "rejected";
  if (["pending", "pendiente", "review", "revision"].includes(token)) return "pending";
  return "";
}

export function isApprovedProfile(data = {}) {
  const status = canonicalStatus(
    data.approvalStatus || data.status || data.estado || data.estadoAprobacion || data.aprobado
  );
  if (status === "approved") return true;
  if (status === "pending" || status === "rejected") return false;

  if (data.approved === true || data.isApproved === true || data.aprobado === true) return true;

  const role = canonicalRole(data.role || data.rol || data.userRole || data.requestedRole);
  return Boolean(role);
}

export async function findUserProfile(user) {
  if (!user?.uid) return null;

  // Búsqueda directa por ID en colección users
  const direct = await getDoc(doc(db, "users", user.uid)).catch(() => null);
  if (direct?.exists?.()) {
    return { id: direct.id, data: direct.data() || {} };
  }

  // Búsqueda por campo uid
  const byUid = await getDocs(
    query(collection(db, "users"), where("uid", "==", user.uid), limit(1))
  ).catch(() => null);
  if (byUid && !byUid.empty) {
    const d = byUid.docs[0];
    return { id: d.id, data: d.data() || {} };
  }

  // Búsqueda por email
  const email = String(user.email || "").trim();
  if (email) {
    const byEmail = await getDocs(
      query(collection(db, "users"), where("email", "==", email), limit(1))
    ).catch(() => null);
    if (byEmail && !byEmail.empty) {
      const d = byEmail.docs[0];
      return { id: d.id, data: d.data() || {} };
    }

    const byEmailLower = await getDocs(
      query(collection(db, "users"), where("email", "==", email.toLowerCase()), limit(1))
    ).catch(() => null);
    if (byEmailLower && !byEmailLower.empty) {
      const d = byEmailLower.docs[0];
      return { id: d.id, data: d.data() || {} };
    }
  }

  return null;
}

export async function isApprovedUser(user) {
  if (!user?.uid) return false;

  // 1. Revisar claims del token
  const tokenResult = await user.getIdTokenResult?.().catch(() => null);
  if (isApprovedProfile(tokenResult?.claims || {})) return true;

  // 2. Revisar perfil en Firestore
  const profile = await findUserProfile(user);
  return isApprovedProfile(profile?.data || {});
}

export async function isEditorialEditor(user) {
  if (!user?.uid) return false;
  const editorRoles = new Set([
    "admin", "administrador", "owner", "superadmin", "author", "autor",
    "editor", "editorial", "desarrollo", "desarrollador", "developer", "dev",
    "profe", "profesor", "docente"
  ]);
  const tokenResult = await user.getIdTokenResult?.().catch(() => null);
  const tokenRole = canonicalRole(tokenResult?.claims?.role || tokenResult?.claims?.rol || tokenResult?.claims?.userRole);
  if (editorRoles.has(tokenRole)) return true;
  const profile = await findUserProfile(user);
  const profileRole = canonicalRole(profile?.data?.role || profile?.data?.rol || profile?.data?.userRole || profile?.data?.requestedRole);
  return editorRoles.has(profileRole);
}

export async function waitForAuthUser(timeoutMs = 4000) {
  if (auth.currentUser) return auth.currentUser;
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (u) => {
      if (resolved) return;
      resolved = true;
      resolve(u || null);
    };
    const unsub = onAuthStateChanged(
      auth,
      (user) => {
        try { unsub(); } catch (_) {}
        finish(user);
      },
      () => finish(null)
    );
    setTimeout(() => finish(auth.currentUser || null), timeoutMs);
  });
}

export async function ensureApprovedUserAccess({ redirectTo = "/index.html" } = {}) {
  const user = await waitForAuthUser();
  if (!user) {
    console.warn("[MarcieAuthGuard] Usuario no autenticado. Redirigiendo a:", redirectTo);
    window.location.href = redirectTo;
    return { allowed: false, reason: "not-authenticated" };
  }

  const approved = await isApprovedUser(user);
  if (!approved) {
    console.warn("[MarcieAuthGuard] Usuario autenticado pero no aprobado:", user.email);
    window.location.href = redirectTo;
    return { allowed: false, reason: "not-approved", user };
  }

  return { allowed: true, user };
}

export async function logOutUser() {
  await signOut(auth);
  window.location.href = "/index.html";
}
