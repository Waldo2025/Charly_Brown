import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { db, getCurrentUser } from "./marcie-firebase.js";
import { isAidaArticleCompatible, normalizeEditorialMode, normalizeSelectedAudiences } from "../contracts/editorial-contracts.js";

export const MARCIE_COLLECTION = "MarcieBlogEditor";
const LOCAL_STORAGE_BACKUP_KEY = "marcie_blog_editor_backup_v1";
const LOCAL_STORAGE_PENDING_SAVE_KEY = "marcie_blog_editor_pending_save_v1";
const sessionSaveQueues = new Map();
const lastCommittedFingerprints = new Map();
const RETRYABLE_WRITE_CODES = new Set(["resource-exhausted", "unavailable", "deadline-exceeded", "aborted"]);

function waitForWriteRetry(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function firestoreErrorCode(error = {}) {
  return String(error?.code || "").replace(/^firestore\//, "").toLowerCase();
}

async function writeSessionWithBackoff(docRef, payload, { maxAttempts = 5 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      await setDoc(docRef, payload, { merge: true });
      return;
    } catch (error) {
      lastError = error;
      if (!RETRYABLE_WRITE_CODES.has(firestoreErrorCode(error)) || attempt === maxAttempts - 1) break;
      const exponentialDelay = Math.min(8_000, 500 * (2 ** attempt));
      const jitter = Math.floor(Math.random() * 250);
      await waitForWriteRetry(exponentialDelay + jitter);
    }
  }
  const wrapped = new Error("Firestore está temporalmente saturado. El cambio quedó respaldado en este navegador y se intentará guardar nuevamente en la próxima acción.");
  wrapped.code = firestoreErrorCode(lastError) || "write_failed";
  wrapped.cause = lastError;
  throw wrapped;
}

function toIsoString(val) {
  if (!val) return new Date().toISOString();
  if (typeof val === "object" && typeof val.toDate === "function") {
    return val.toDate().toISOString();
  }
  if (typeof val === "object" && typeof val.seconds === "number") {
    return new Date(val.seconds * 1000).toISOString();
  }
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function normalizeArticleForMode(article = {}, editorialMode = "marcie") {
  if (!article || typeof article !== "object") return article;
  if (editorialMode !== "aida") return article;
  const hasBlocks = Array.isArray(article.blocks) && article.blocks.length > 0;
  if (!hasBlocks) return { ...article, editorialMode: "aida", modeCompatibility: "empty" };
  if (isAidaArticleCompatible(article)) return { ...article, editorialMode: "aida", modeCompatibility: "compatible" };
  const incompatible = { ...article, modeCompatibility: "legacy_incompatible" };
  delete incompatible.approval;
  return incompatible;
}

/**
 * Normaliza un documento obtenido de Firestore
 */
export function normalizeSessionDoc(docSnap) {
  const data = docSnap.data() || {};
  const ownerId = data.ownerId || data.ownerUid || "";
  const ownerEmail = data.ownerEmail || "";

  const currentAudience = data.audience || "educators";
  const editorialMode = normalizeEditorialMode(data.editorialMode || "marcie");
  const rawArticle = (typeof data.article === "object" && data.article !== null) ? data.article : null;
  let articlesByAudience = (typeof data.articlesByAudience === "object" && data.articlesByAudience !== null)
    ? { ...data.articlesByAudience }
    : {};
  const publicationsByAudience = (typeof data.publicationsByAudience === "object" && data.publicationsByAudience !== null)
    ? { ...data.publicationsByAudience }
    : {};

  if (rawArticle && !articlesByAudience[currentAudience] && Array.isArray(rawArticle.blocks) && rawArticle.blocks.length > 0) {
    articlesByAudience[currentAudience] = rawArticle;
  }
  if (!data.editorialMode) {
    articlesByAudience = Object.fromEntries(Object.entries(articlesByAudience).map(([audience, article]) => [audience, {
      ...article,
      editorialMode: "marcie",
      researchSources: (article?.sources || []).map((source) => ({ ...source, retrievalStatus: "legacy_unverified", evidenceStatus: "legacy_unverified" })),
      verification: article?.verification || { status: "legacy_unverified", coverage: 0, contradictions: [], blockers: ["Las fuentes heredadas deben volver a verificarse."] }
    }]));
  }
  if (editorialMode === "aida") {
    articlesByAudience = Object.fromEntries(Object.entries(articlesByAudience).map(([audience, article]) => [audience, normalizeArticleForMode(article, editorialMode)]));
  }
  const incompatibleAidaAudiences = new Set(editorialMode === "aida"
    ? Object.entries(articlesByAudience).filter(([, article]) => article?.modeCompatibility === "legacy_incompatible").map(([audience]) => audience)
    : []);

  // Priorizar el artículo específico de la audiencia actual
  const activeArticle = normalizeArticleForMode(articlesByAudience[currentAudience] || rawArticle || {
    schemaVersion: "1.0",
    id: `art-${docSnap.id}`,
    title: data.title || "Innovación y Estrategias Pedagógicas",
    subtitle: data.subtitle || "",
    excerpt: data.excerpt || "",
    audience: currentAudience,
    category: data.category || "Educación",
    readingTimeMinutes: data.readingTimeMinutes || 6,
    publishedDateText: data.publishedDateText || "19 de agosto de 2026",
    tags: Array.isArray(data.tags) ? data.tags : ["Educación", "Innovación"],
    blocks: [],
    sources: [],
    seo: data.seo || { title: data.title || "", description: "", keywords: [] }
  }, editorialMode);

  return {
    id: docSnap.id,
    title: data.title || activeArticle.title || "Artículo educativo",
    topic: data.topic || "",
    status: incompatibleAidaAudiences.size && ["approved", "scheduled"].includes(String(data.status || "").toLowerCase()) ? "review_required" : (data.status || "drafting"),
    audience: currentAudience,
    audit: data.audit && typeof data.audit === "object" ? { ...data.audit } : null,
    ownerId: ownerId,
    ownerUid: ownerId,
    ownerEmail: ownerEmail,
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
    archived: data.archived === true,
    editorialMode,
    editorialProfileId: String(data.editorialProfileId || ""),
    editorialProfileVersion: Number(data.editorialProfileVersion || 1),
    editorialProfileSnapshot: data.editorialProfileSnapshot && typeof data.editorialProfileSnapshot === "object" ? { ...data.editorialProfileSnapshot } : null,
    selectedAudiences: normalizeSelectedAudiences(data.selectedAudiences, editorialMode),
    specifications: Array.isArray(data.specifications) ? data.specifications.map(String) : [],
    automation: data.automation && typeof data.automation === "object" ? { ...data.automation } : null,
    article: activeArticle,
    articlesByAudience: articlesByAudience,
    publicationsByAudience,
    approvedAudiences: Array.isArray(data.approvedAudiences) ? data.approvedAudiences.map(String).filter((audience) => !incompatibleAidaAudiences.has(audience)) : [],
    trends: Array.isArray(data.trends) ? data.trends : [],
    researchByAudience: data.researchByAudience && typeof data.researchByAudience === "object" ? { ...data.researchByAudience } : {},
    proposals: Array.isArray(data.proposals) ? data.proposals : [],
    log: Array.isArray(data.log) ? data.log : []
  };
}

/**
 * Escucha cambios en tiempo real en la colección MarcieBlogEditor filtrado por ownerId
 */
export function subscribeToMarcieSessions(onUpdate, onError, filterOwnerUid = "") {
  const colRef = collection(db, MARCIE_COLLECTION);
  const targetUid = filterOwnerUid || getCurrentUser()?.uid || "";

  // Query base
  let q;
  if (targetUid) {
    q = query(colRef, where("ownerId", "==", targetUid));
  } else {
    q = query(colRef);
  }

  return onSnapshot(
    q,
    (snapshot) => {
      let sessions = snapshot.docs.map((docSnap) => normalizeSessionDoc(docSnap));

      // Filtrar por ownerUid en memoria si la consulta base abarcó más
      if (targetUid) {
        sessions = sessions.filter((s) => s.ownerId === targetUid || s.ownerUid === targetUid);
      }

      // Ordenar descendente por fecha de actualización
      sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

      // Guardar en respaldo local
      try {
        localStorage.setItem(`${LOCAL_STORAGE_BACKUP_KEY}_${targetUid}`, JSON.stringify(sessions));
      } catch (_) {}

      if (typeof onUpdate === "function") {
        onUpdate(sessions);
      }
    },
    (err) => {
      console.error("[MarcieBlogEditor] Error en suscripción Firestore:", err);
      // Fallback a localStorage
      try {
        const cached = localStorage.getItem(`${LOCAL_STORAGE_BACKUP_KEY}_${targetUid}`);
        if (cached && typeof onUpdate === "function") {
          onUpdate(JSON.parse(cached));
        }
      } catch (_) {}
      if (typeof onError === "function") onError(err);
    }
  );
}

/**
 * Crea una nueva sesión en Firestore asignada al ownerId actual
 */
export async function createMarcieSession(fields = {}) {
  const user = getCurrentUser();
  if (!user?.uid) {
    throw new Error("Se requiere estar autenticado para crear una sesión.");
  }

  const now = new Date();
  const ownerId = user.uid;
  const ownerEmail = user.email || "";

  const sessionTitle = String(fields.title || fields.topic || "Artículo educativo").trim();
  const audience = fields.audience || "educators";
  const editorialMode = normalizeEditorialMode(fields.editorialMode || "marcie");
  const selectedAudiences = normalizeSelectedAudiences(fields.selectedAudiences, editorialMode);
  const initialArticle = normalizeArticleForMode(fields.article || {
    schemaVersion: "1.0",
    title: sessionTitle,
    subtitle: fields.subtitle || "",
    excerpt: "",
    audience: audience,
    category: "Educación e Innovación",
    readingTimeMinutes: 6,
    publishedDateText: now.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }),
    tags: ["Educación", "Innovación"],
    blocks: [],
    sources: [],
    editorialMode,
    modeCompatibility: editorialMode === "aida" ? "empty" : "compatible",
    seo: { title: sessionTitle, description: "", keywords: [] }
  }, editorialMode);

  const articlesByAudience = (fields.articlesByAudience && typeof fields.articlesByAudience === "object")
    ? Object.fromEntries(Object.entries(fields.articlesByAudience).map(([articleAudience, article]) => [articleAudience, normalizeArticleForMode(article, editorialMode)]))
    : { [audience]: initialArticle };

  const payload = {
    title: sessionTitle,
    topic: fields.topic || sessionTitle,
    status: fields.status || "new",
    audience: audience,
    ownerId: ownerId,
    ownerUid: ownerId,
    ownerEmail: ownerEmail,
    archived: false,
    editorialMode,
    editorialProfileId: String(fields.editorialProfileId || ""),
    editorialProfileVersion: Number(fields.editorialProfileVersion || 1),
    editorialProfileSnapshot: normalizeFirestoreJson(fields.editorialProfileSnapshot || null, null),
    selectedAudiences,
    specifications: normalizeFirestoreJson(Array.isArray(fields.specifications) ? fields.specifications : [], []),
    automation: normalizeFirestoreJson(fields.automation || null, null),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    article: initialArticle,
    articlesByAudience: articlesByAudience,
    trends: Array.isArray(fields.trends) ? fields.trends : [],
    researchByAudience: normalizeFirestoreJson(fields.researchByAudience || {}, {}),
    proposals: Array.isArray(fields.proposals) ? fields.proposals : [],
    log: [
      { id: `log-${Date.now()}`, at: now.toISOString(), message: "Sesión creada en Firebase" }
    ]
  };

  const colRef = collection(db, MARCIE_COLLECTION);
  const docRef = await addDoc(colRef, payload);
  return docRef.id;
}

/**
 * Guarda o actualiza una sesión existente en Firestore
 */
function omitUndefinedFirestoreValues(value) {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => omitUndefinedFirestoreValues(item));
  }
  if (value && typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return value;
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, omitUndefinedFirestoreValues(item)])
    );
  }
  return value;
}

function normalizeFirestoreJson(value, fallback) {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? fallback : JSON.parse(serialized);
  } catch (_) {
    return fallback;
  }
}

async function persistMarcieSession(session) {
  if (!session?.id) {
    throw new Error("ID de sesión inválido para guardar.");
  }

  const user = getCurrentUser();
  const ownerId = session.ownerId || user?.uid || "";
  const ownerEmail = session.ownerEmail || user?.email || "";
  const docRef = doc(db, MARCIE_COLLECTION, session.id);

  const currentAudience = session.audience || "educators";
  const articlesByAudience = (typeof session.articlesByAudience === "object" && session.articlesByAudience !== null)
    ? { ...session.articlesByAudience }
    : {};

  if (session.article && session.article.blocks) {
    articlesByAudience[currentAudience] = normalizeArticleForMode(session.article, normalizeEditorialMode(session.editorialMode || "marcie"));
  }

  const normalizedMode = normalizeEditorialMode(session.editorialMode || "marcie");
  const normalizedArticles = Object.fromEntries(Object.entries(articlesByAudience).map(([audience, article]) => [audience, normalizeArticleForMode(article, normalizedMode)]));
  const normalizedActiveArticle = normalizeArticleForMode(session.article || normalizedArticles[currentAudience] || {}, normalizedMode);
  if (normalizedMode === "aida" && normalizedActiveArticle.modeCompatibility === "legacy_incompatible") {
    session.approvedAudiences = (session.approvedAudiences || []).filter((audience) => audience !== currentAudience);
    if (session.status === "approved" || session.status === "scheduled") session.status = "review_required";
  }

  const persistedValues = {
    title: session.title || session.article?.title || "Artículo educativo",
    topic: session.topic || session.title || "",
    status: session.status || "drafting",
    audience: currentAudience,
    audit: session.audit && typeof session.audit === "object" ? session.audit : null,
    ownerId: ownerId,
    ownerUid: ownerId,
    ownerEmail: ownerEmail,
    archived: Boolean(session.archived),
    editorialMode: normalizedMode,
    editorialProfileId: String(session.editorialProfileId || ""),
    editorialProfileVersion: Number(session.editorialProfileVersion || 1),
    editorialProfileSnapshot: normalizeFirestoreJson(session.editorialProfileSnapshot || null, null),
    selectedAudiences: normalizeFirestoreJson(normalizeSelectedAudiences(session.selectedAudiences, session.editorialMode), []),
    specifications: normalizeFirestoreJson(Array.isArray(session.specifications) ? session.specifications : [], []),
    automation: normalizeFirestoreJson(session.automation || null, null),
    article: normalizeFirestoreJson(normalizedActiveArticle, {}),
    articlesByAudience: normalizeFirestoreJson(normalizedArticles, {}),
    approvedAudiences: normalizeFirestoreJson(Array.isArray(session.approvedAudiences) ? session.approvedAudiences : [], []),
    trends: normalizeFirestoreJson(Array.isArray(session.trends) ? session.trends : [], []),
    researchByAudience: normalizeFirestoreJson(session.researchByAudience && typeof session.researchByAudience === "object" ? session.researchByAudience : {}, {}),
    proposals: normalizeFirestoreJson(Array.isArray(session.proposals) ? session.proposals : [], []),
    log: normalizeFirestoreJson(Array.isArray(session.log) ? session.log : [], [])
  };
  const cleanValues = omitUndefinedFirestoreValues(persistedValues);
  const fingerprint = JSON.stringify(cleanValues);
  if (lastCommittedFingerprints.get(session.id) === fingerprint) return session.id;
  const pendingBackupKey = `${LOCAL_STORAGE_PENDING_SAVE_KEY}_${session.id}`;
  try { localStorage.setItem(pendingBackupKey, JSON.stringify({ savedAt: new Date().toISOString(), payload: cleanValues })); } catch (_) {}
  await writeSessionWithBackoff(docRef, { ...cleanValues, updatedAt: serverTimestamp() });
  lastCommittedFingerprints.set(session.id, fingerprint);
  try { localStorage.removeItem(pendingBackupKey); } catch (_) {}
  return session.id;
}

export function saveMarcieSession(session) {
  if (!session?.id) return Promise.reject(new Error("ID de sesión inválido para guardar."));
  const previous = sessionSaveQueues.get(session.id) || Promise.resolve();
  const queued = previous.catch(() => undefined).then(() => persistMarcieSession(session));
  sessionSaveQueues.set(session.id, queued);
  queued.then(
    () => { if (sessionSaveQueues.get(session.id) === queued) sessionSaveQueues.delete(session.id); },
    () => { if (sessionSaveQueues.get(session.id) === queued) sessionSaveQueues.delete(session.id); }
  );
  return queued;
}

/**
 * Elimina una sesión de Firestore
 */
export async function deleteMarcieSession(sessionId) {
  if (!sessionId) return;
  const docRef = doc(db, MARCIE_COLLECTION, sessionId);
  await deleteDoc(docRef);
}

/**
 * Semilla inicial para el usuario si no tiene sesiones
 */
export async function seedInitialSessionIfEmpty(ownerUid = "") {
  try {
    const user = getCurrentUser();
    const uid = ownerUid || user?.uid;
    if (!uid) return;

    const colRef = collection(db, MARCIE_COLLECTION);
    const q = query(colRef, where("ownerId", "==", uid));
    const snap = await getDocs(q);

    if (snap.empty) {
      console.log(`[MarcieBlogEditor] Creando sesión inicial para usuario ${uid}...`);
      await createMarcieSession({
        title: "IA como tutor personalizado: el futuro del aprendizaje ya está aquí",
        topic: "IA como tutor personalizado",
        status: "published",
        audience: "educators",
        subtitle: "Cómo la inteligencia artificial puede adaptar la enseñanza a cada estudiante y potenciar resultados.",
        article: {
          schemaVersion: "1.0",
          title: "IA como tutor personalizado: el futuro del aprendizaje ya está aquí",
          subtitle: "Cómo la inteligencia artificial puede adaptar la enseñanza a cada estudiante y potenciar resultados.",
          excerpt: "La inteligencia artificial está transformando la educación...",
          audience: "educators",
          category: "Tecnología educativa",
          readingTimeMinutes: 7,
          publishedDateText: "15 de mayo de 2025",
          tags: ["Tecnología educativa", "IA", "Aprendizaje personalizado"],
          blocks: [
            {
              id: "b1",
              type: "paragraph",
              text: "La inteligencia artificial (IA) está transformando la educación al permitir experiencias de aprendizaje personalizadas, accesibles y efectivas. Los sistemas de tutoría inteligente analizan el progreso, identifican necesidades y ofrecen retroalimentación en tiempo real. Esto no solo mejora los resultados académicos, sino que también impulsa la motivación y la autonomía del estudiante."
            },
            {
              id: "b2",
              type: "quote",
              text: "La IA no reemplaza al docente, lo potencia. Le da superpoderes para acompañar mejor a cada estudiante.",
              attribution: "Observatorio de Innovación Educativa, 2024"
            },
            {
              id: "b3",
              type: "heading",
              level: "h3",
              text: "Beneficios clave de la IA como tutor"
            },
            {
              id: "b4",
              type: "bulletList",
              items: [
                "Aprendizaje adaptativo según el ritmo y estilo de cada estudiante.",
                "Retroalimentación inmediata y personalizada.",
                "Identificación temprana de dificultades de aprendizaje.",
                "Mayor motivación y engagement.",
                "Acompañamiento 24/7 con recursos personalizados."
              ]
            }
          ],
          sources: [
            {
              id: "s1",
              title: "UNESCO (2023). Inteligencia artificial y educación: Guía para responsables de políticas.",
              url: "https://unesdoc.unesco.org/"
            },
            {
              id: "s2",
              title: "OECD (2021). AI and the future of skills.",
              url: "https://www.oecd.org/"
            },
            {
              id: "s3",
              title: "HolonIQ (2024). AI in Education Global Impact Report.",
              url: "https://www.holoniq.com/"
            }
          ],
          seo: {
            title: "IA como tutor personalizado",
            description: "El futuro del aprendizaje ya está aquí",
            keywords: ["IA", "educación", "tutor"]
          }
        }
      });
    }
  } catch (err) {
    console.warn("[MarcieBlogEditor] Error al inicializar semilla:", err);
  }
}
