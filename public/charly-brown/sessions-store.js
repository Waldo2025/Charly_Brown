import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { getDefaultFirebaseApp } from "../js/firebase-default-app.js";
import { createEmptySession, normalizeSession } from "./state.js";

const app = getDefaultFirebaseApp();
const auth = getAuth(app);
const db = getFirestore(app);
const COLLECTION = "charlyBrownUnitSessions";

export async function getCurrentUserId() {
  const user = await getCurrentUser();
  return user?.uid || "";
}

export async function listSessions() {
  const uid = await getCurrentUserId();
  if (!uid) return [];
  const baseQuery = query(collection(db, COLLECTION), where("ownerUid", "==", uid));
  let snap;
  try {
    snap = await getDocs(query(collection(db, COLLECTION), where("ownerUid", "==", uid), orderBy("updatedAt", "desc")));
  } catch (error) {
    console.warn("[charly-brown] listSessions orderBy fallback", error);
    snap = await getDocs(baseQuery);
  }
  return snap.docs
    .map((item) => normalizeSession({ id: item.id, ...(item.data() || {}) }))
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

export async function saveSession(session = {}) {
  const uid = await getCurrentUserId();
  const normalized = normalizeSession(session.id ? session : createEmptySession(session));
  if (!uid) throw new Error("No hay usuario autenticado para guardar la sesión.");
  const payload = {
    ...normalized,
    ownerUid: uid,
    ownerId: uid,
    userId: uid,
    updatedAt: new Date().toISOString()
  };
  await setDoc(doc(db, COLLECTION, normalized.id), payload, { merge: true });
  return normalizeSession(payload);
}

export async function deleteSession(id = "") {
  if (!id) return;
  await deleteDoc(doc(db, COLLECTION, id));
}

export async function duplicateSession(session = {}) {
  const copy = createEmptySession({
    ...normalizeSession(session),
    id: "",
    title: `${session.title || "Unidad"} copia`
  });
  return saveSession(copy);
}

async function getCurrentUser() {
  if (auth.currentUser) return auth.currentUser;
  return await new Promise((resolve) => {
    let finished = false;
    const finish = (user) => {
      if (finished) return;
      finished = true;
      resolve(user || auth.currentUser || null);
    };
    const unsub = onAuthStateChanged(auth, (user) => {
      try { unsub(); } catch (_) {}
      finish(user);
    }, () => finish(null));
    setTimeout(() => finish(auth.currentUser || null), 3500);
  });
}
