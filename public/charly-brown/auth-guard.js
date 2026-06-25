import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
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
import { getDefaultFirebaseApp } from "../js/firebase-default-app.js";

const app = getDefaultFirebaseApp();
const auth = getAuth(app);
const db = getFirestore(app);

export async function ensureApprovedUserAccess({ redirectTo = "index.html" } = {}) {
  const user = await waitForAuthUser();
  if (!user) {
    redirectToIndex(redirectTo);
    return { allowed: false, reason: "not-authenticated" };
  }

  const approved = await isApprovedUser(user);
  if (!approved) {
    redirectToIndex(redirectTo);
    return { allowed: false, reason: "not-approved", user };
  }

  return { allowed: true, user };
}

export async function isApprovedUser(user) {
  if (!user?.uid) return false;

  const tokenResult = await user.getIdTokenResult?.().catch(() => null);
  if (isApprovedProfile(tokenResult?.claims || {})) return true;

  const profile = await findUserProfile(user);
  return isApprovedProfile(profile?.data || {});
}

export function isApprovedProfile(data = {}) {
  const status = canonicalStatus(data.approvalStatus || data.status || data.estado || data.estadoAprobacion || data.aprobado);
  if (status === "approved") return true;
  if (status === "pending" || status === "rejected") return false;

  if (data.approved === true || data.isApproved === true || data.aprobado === true) return true;

  const role = canonicalRole(data.role || data.rol || data.userRole || data.requestedRole);
  return !!role && role !== "pending";
}

async function waitForAuthUser() {
  if (auth.currentUser) return auth.currentUser;
  return await new Promise((resolve) => {
    let done = false;
    const finish = (user) => {
      if (done) return;
      done = true;
      resolve(user || null);
    };
    const unsub = onAuthStateChanged(auth, (user) => {
      try { unsub(); } catch (_) {}
      finish(user);
    }, () => finish(null));
    setTimeout(() => finish(auth.currentUser || null), 3500);
  });
}

async function findUserProfile(user) {
  const direct = await getDoc(doc(db, "users", user.uid)).catch(() => null);
  if (direct?.exists?.()) return { id: direct.id, data: direct.data() || {} };

  const byUid = await getDocs(query(collection(db, "users"), where("uid", "==", user.uid), limit(1))).catch(() => null);
  if (byUid && !byUid.empty) {
    const d = byUid.docs[0];
    return { id: d.id, data: d.data() || {} };
  }

  const email = String(user.email || "").trim();
  if (email) {
    const byEmail = await getDocs(query(collection(db, "users"), where("email", "==", email), limit(1))).catch(() => null);
    if (byEmail && !byEmail.empty) {
      const d = byEmail.docs[0];
      return { id: d.id, data: d.data() || {} };
    }
    const byEmailLower = await getDocs(query(collection(db, "users"), where("email", "==", email.toLowerCase()), limit(1))).catch(() => null);
    if (byEmailLower && !byEmailLower.empty) {
      const d = byEmailLower.docs[0];
      return { id: d.id, data: d.data() || {} };
    }
  }

  return null;
}

function redirectToIndex(path = "index.html") {
  if (window.location.pathname.endsWith(`/${path}`)) return;
  window.location.href = path;
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
