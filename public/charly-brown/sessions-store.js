import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  runTransaction,
  setDoc,
  deleteDoc,
  query,
  where
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { getDefaultFirebaseApp } from "../js/firebase-default-app.js";
import { createEmptySession, normalizeSession } from "./state.js";

const app = getDefaultFirebaseApp();
const auth = getAuth(app);
const db = getFirestore(app);
const COLLECTION = "charlyBrownUnitSessions";
const FIRESTORE_SAVE_ATTEMPTS = 4;

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const isRetryableSaveConflict = (error = {}) => {
  const code = String(error.code || error.name || "").toLowerCase();
  const message = String(error.message || "").toLowerCase();
  // Firestore ya reintenta internamente las transacciones. Un ABORTED final
  // todavía puede recuperarse con una nueva transacción; FAILED_PRECONDITION
  // también representa errores permanentes y no debe repetirse a ciegas.
  return code.includes("aborted") || message.includes("transaction") && message.includes("contention");
};

export function removeUndefinedRecursively(val) {
  if (val === undefined) return null;
  if (val === null || typeof val !== "object") return val;
  if (Array.isArray(val)) {
    return val.map(removeUndefinedRecursively).filter((item) => item !== undefined);
  }
  const clean = {};
  for (const [key, value] of Object.entries(val)) {
    if (value !== undefined) {
      const sanitized = removeUndefinedRecursively(value);
      if (sanitized !== undefined) {
        clean[key] = sanitized;
      }
    }
  }
  return clean;
}

function compactReadingForStorage(reading) {
  if (!reading || typeof reading !== "object") return reading || null;
  const { raw, rawData, ...compact } = reading;
  const assetUrl = String(compact.illustrationAsset?.url || "").trim();
  const cleanHtml = (value = "") => String(value || "")
    .replace(/<figure\b[^>]*class\s*=\s*["'][^"']*cb-reading-illustration[^"']*["'][^>]*>[\s\S]*?<svg\b[\s\S]*?<\/svg>[\s\S]*?<\/figure>/gi,
      assetUrl ? `<figure class="cb-reading-illustration" aria-hidden="true"><img src="${assetUrl}" alt="Ilustración de la lectura" loading="lazy"></figure>` : "")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, "");
  if (compact.html) compact.html = cleanHtml(compact.html);
  if (compact.sections && typeof compact.sections === "object") {
    compact.sections = { ...compact.sections };
    for (const key of ["narrativeHtml", "synonymsHtml", "questionsHtml"]) {
      if (compact.sections[key]) compact.sections[key] = cleanHtml(compact.sections[key]);
    }
    if (JSON.stringify(compact.sections.questions || null) === JSON.stringify(compact.questions || null)) delete compact.sections.questions;
    if (JSON.stringify(compact.sections.synonyms || null) === JSON.stringify(compact.synonyms || null)) delete compact.sections.synonyms;
  }
  return compact;
}

function compactAcceptedItemForStorage(item = {}) {
  if (!item || typeof item !== "object") return item;
  const compact = { ...item };
  if (compact.artifact && typeof compact.artifact === "object") {
    const { html, pdfBase64, bytes, base64, ...artifact } = compact.artifact;
    if (Array.isArray(compact.assets) && compact.assets.length) delete artifact.assets;
    if (Array.isArray(compact.resourceSpecifications)) delete artifact.resourceSpecifications;
    compact.artifact = artifact;
  }
  return compact;
}

export async function getCurrentUserId() {
  if (typeof window !== "undefined" && window.__CHARLY_TEST_USER__?.uid) {
    return window.__CHARLY_TEST_USER__.uid;
  }
  const user = await getCurrentUser();
  return user?.uid || "";
}

export async function listSessions() {
  const uid = await getCurrentUserId();
  if (!uid) return [];
  const baseQuery = query(collection(db, COLLECTION), where("ownerUid", "==", uid));
  const snap = await getDocs(baseQuery);
  return snap.docs
    .map((item) => {
      const serverSession = normalizeSession({ id: item.id, ...(item.data() || {}) });
      try {
        const localRaw = localStorage.getItem(`cb_session_cache_${item.id}`);
        if (localRaw) {
          const localParsed = JSON.parse(localRaw);
          if (localParsed && Number(localParsed.storageRevision || 0) >= Number(serverSession.storageRevision || 0)) {
            return normalizeSession(localParsed);
          }
        }
      } catch (_) {}
      return serverSession;
    })
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

export function serializeSessionForFirestore(normalized = {}) {
  const clean = {
    schemaVersion: Number(normalized.schemaVersion || 3),
    id: String(normalized.id || ""),
    title: String(normalized.title || "Nueva sesión"),
    createdAt: normalized.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    activeUnitId: String(normalized.activeUnitId || ""),
    academicMeta: normalized.academicMeta || {},
    meta: normalized.meta || {},
    units: (Array.isArray(normalized.units) ? normalized.units : []).map((u) => {
      const proposals = (Array.isArray(u.proposals) ? u.proposals : []).slice(0, 10).map((p) => {
        let cleanArtifact = p.artifact;
        if (p.artifact && typeof p.artifact === "object") {
          const { pdfBase64, ...artRest } = p.artifact;
          cleanArtifact = artRest;
        }
        return {
          id: p.id,
          status: p.status,
          title: p.title,
          action: p.action,
          contentType: p.contentType,
          section: p.section,
          sectionId: p.sectionId,
          category: p.category,
          subtopic: p.subtopic,
          targetUnitId: p.targetUnitId,
          targetContentId: p.targetContentId,
          targetActivityId: p.targetActivityId,
          baseRevision: p.baseRevision,
          readingStage: p.readingStage,
          html: p.html || "",
          artifact: cleanArtifact || null,
          validation: p.validation || null,
          citations: p.citations || [],
          researchRunIds: p.researchRunIds || [],
          createdBy: p.createdBy || "",
          createdAt: p.createdAt
        };
      });
      const messages = (Array.isArray(u.messages) ? u.messages : []).slice(-25);
      return {
        id: String(u.id || ""),
        title: String(u.title || ""),
        createdAt: u.createdAt || new Date().toISOString(),
        updatedAt: u.updatedAt || new Date().toISOString(),
        revision: Math.max(0, Number(u.revision || 0)),
        meta: u.meta || {},
        automation: u.automation || null,
        // accepted.* es la copia canónica. normalizeUnit reconstruye estos
        // alias al cargar para no guardar dos veces lectura y secuencia.
        reading: null,
        sya: null,
        syaOriginal: null,
        syaContextKey: String(u.syaContextKey || ""),
        workflow: u.workflow || null,
        accepted: {
          activities: Array.isArray(u.accepted?.activities) ? u.accepted.activities.map(compactAcceptedItemForStorage) : [],
          resources: Array.isArray(u.accepted?.resources) ? u.accepted.resources.map(compactAcceptedItemForStorage) : [],
          teacherNotes: Array.isArray(u.accepted?.teacherNotes) ? u.accepted.teacherNotes.map(compactAcceptedItemForStorage) : [],
          reading: compactReadingForStorage(u.accepted?.reading),
          sya: u.accepted?.sya || null,
          syaOriginal: u.accepted?.syaOriginal || null
        },
        preferences: Array.isArray(u.preferences) ? u.preferences.slice(-20) : [],
        researchRuns: Array.isArray(u.researchRuns) ? u.researchRuns.slice(-10) : [],
        messages,
        proposals
      };
    })
  };
  return clean;
}

export async function saveSession(session = {}, { create = false } = {}) {
  const uid = await getCurrentUserId();
  const normalized = normalizeSession(session.id ? session : createEmptySession(session));
  if (!uid) throw new Error("No hay usuario autenticado para guardar la sesión.");

  const serialized = removeUndefinedRecursively(serializeSessionForFirestore(normalized));
  const payload = removeUndefinedRecursively({
    ...serialized,
    ownerUid: uid,
    ownerId: uid,
    userId: uid,
    updatedAt: new Date().toISOString()
  });
  const ref = doc(db, COLLECTION, normalized.id);
  if (create) {
    const { claimSavings } = await import("../js/savings-client.js");
    const savings = await claimSavings("charlySessions", normalized.id);
    if (savings.permit) payload.savingsPermit = savings.permit;
    payload.storageRevision = 1;
    const safeCreatePayload = removeUndefinedRecursively(payload);
    await setDoc(ref, safeCreatePayload);
    try {
      localStorage.setItem(`cb_session_cache_${normalized.id}`, JSON.stringify(safeCreatePayload));
    } catch (_) {}
    return normalizeSession(safeCreatePayload);
  }
  let lastError = null;
  for (let attempt = 1; attempt <= FIRESTORE_SAVE_ATTEMPTS; attempt += 1) {
    try {
      await runTransaction(db, async transaction => {
        const latest = await transaction.get(ref);
        const serverRev = Number(latest.data()?.storageRevision || 0);
        const clientRev = Number(normalized.storageRevision || 0);
        if (latest.exists() && serverRev !== clientRev) {
          const conflict = new Error("La sesión cambió en el servidor. Se recargará la versión más reciente para no sobrescribir recursos generados.");
          conflict.code = "REVISION_CONFLICT";
          throw conflict;
        }
        payload.storageRevision = serverRev + 1;
        const safePayload = removeUndefinedRecursively(payload);
        transaction.set(ref, safePayload, { merge: true });
      });
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      if (!isRetryableSaveConflict(error) || attempt === FIRESTORE_SAVE_ATTEMPTS) throw error;
      await wait(180 * (2 ** (attempt - 1)) + Math.floor(Math.random() * 120));
    }
  }
  if (lastError) throw lastError;

  // Persistir respaldo local en localStorage para disponibilidad inmediata tras recarga
  try {
    localStorage.setItem(`cb_session_cache_${normalized.id}`, JSON.stringify(payload));
  } catch (_) {}

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
  return saveSession(copy, { create: true });
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
