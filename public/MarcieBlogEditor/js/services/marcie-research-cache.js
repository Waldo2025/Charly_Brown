/**
 * marcie-research-cache.js
 * 
 * Persistencia en localStorage para investigaciones documentales, fuentes de consulta,
 * propuestas y contexto editorial de Marcie.
 * Evita repetir búsquedas de 8+ minutos cuando se reinicia o regenera la automatización.
 */

const RESEARCH_CACHE_PREFIX = "marcie_research_dossier_v1:";
const SESSION_RESEARCH_PREFIX = "marcie_session_research_v1:";
const LAST_RESEARCH_KEY = "marcie_last_research_snapshot_v1";
const MAX_CACHE_AGE_MS = 14 * 24 * 60 * 60 * 1000; // 14 días

function normalizeKeyPart(text = "") {
  return String(text || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function buildCacheKey(topic = "", audience = "") {
  const normTopic = normalizeKeyPart(topic);
  const normAudience = normalizeKeyPart(audience);
  return `${RESEARCH_CACHE_PREFIX}${normTopic}::${normAudience}`;
}

/**
 * Guarda el dossier de investigación de una audiencia específica en localStorage.
 */
export function saveResearchDossierToCache(topic = "", audience = "", dossier = null) {
  if (!dossier || typeof dossier !== "object") return;
  const sources = Array.isArray(dossier.sources) ? dossier.sources : [];
  if (!sources.length && dossier.verificationStatus === "blocked") return;

  const key = buildCacheKey(topic, audience);
  const payload = {
    topic: String(topic || "").trim(),
    audience: String(audience || "").trim(),
    savedAt: new Date().toISOString(),
    dossier
  };

  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch (err) {
    pruneOldResearchCache();
    try {
      localStorage.setItem(key, JSON.stringify(payload));
    } catch (_) {
      console.warn("[MarcieResearchCache] No se pudo persistir el dossier en localStorage:", err?.message);
    }
  }
}

/**
 * Recupera el dossier de investigación de una audiencia si está disponible y no expiró.
 */
export function getResearchDossierFromCache(topic = "", audience = "") {
  const key = buildCacheKey(topic, audience);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.dossier || !data.savedAt) return null;

    const age = Date.now() - new Date(data.savedAt).getTime();
    if (age > MAX_CACHE_AGE_MS) {
      localStorage.removeItem(key);
      return null;
    }

    const sources = Array.isArray(data.dossier.sources) ? data.dossier.sources : [];
    if (!sources.length && data.dossier.verificationStatus === "blocked") return null;

    return data.dossier;
  } catch (_) {
    return null;
  }
}

/**
 * Guarda en localStorage todo el estado de investigación y propuestas de una sesión.
 */
export function saveSessionResearchToCache(session = {}) {
  if (!session || typeof session !== "object") return;
  const topic = session.topic || session.title || "";
  const researchByAudience = session.researchByAudience && typeof session.researchByAudience === "object"
    ? session.researchByAudience
    : {};
  const proposals = Array.isArray(session.proposals) ? session.proposals : [];

  Object.entries(researchByAudience).forEach(([audience, dossier]) => {
    saveResearchDossierToCache(topic, audience, dossier);
    if (session.audienceTopics?.[audience]) {
      saveResearchDossierToCache(session.audienceTopics[audience], audience, dossier);
    }
  });

  const snapshot = {
    sessionId: session.id || "",
    topic: String(topic).trim(),
    savedAt: new Date().toISOString(),
    researchByAudience,
    proposals,
    specifications: session.specifications || []
  };

  try {
    if (session.id) {
      localStorage.setItem(`${SESSION_RESEARCH_PREFIX}${session.id}`, JSON.stringify(snapshot));
    }
    localStorage.setItem(LAST_RESEARCH_KEY, JSON.stringify(snapshot));
  } catch (_) {
    pruneOldResearchCache();
  }
}

/**
 * Restaura o complementa el objeto researchByAudience y proposals en la sesión si faltan.
 */
export function restoreSessionResearchFromCache(session = {}) {
  if (!session || typeof session !== "object") return session;
  const topic = session.topic || session.title || "";
  session.researchByAudience = session.researchByAudience && typeof session.researchByAudience === "object"
    ? { ...session.researchByAudience }
    : {};

  let snapshot = null;
  try {
    if (session.id) {
      const raw = localStorage.getItem(`${SESSION_RESEARCH_PREFIX}${session.id}`);
      if (raw) snapshot = JSON.parse(raw);
    }
    if (!snapshot) {
      const lastRaw = localStorage.getItem(LAST_RESEARCH_KEY);
      if (lastRaw) {
        const candidate = JSON.parse(lastRaw);
        if (candidate?.topic && normalizeKeyPart(candidate.topic) === normalizeKeyPart(topic)) {
          snapshot = candidate;
        }
      }
    }
  } catch (_) {}

  if (snapshot?.researchByAudience) {
    Object.entries(snapshot.researchByAudience).forEach(([aud, dossier]) => {
      if (!session.researchByAudience[aud] || !session.researchByAudience[aud].sources?.length) {
        session.researchByAudience[aud] = dossier;
      }
    });
  }

  if (snapshot?.proposals?.length && (!session.proposals || !session.proposals.length)) {
    session.proposals = snapshot.proposals;
  }

  const targetAudiences = Array.isArray(session.selectedAudiences) && session.selectedAudiences.length
    ? session.selectedAudiences
    : ["educators", "students", "parents", "coordinators"];

  targetAudiences.forEach((audience) => {
    if (!session.researchByAudience[audience] || !session.researchByAudience[audience].sources?.length) {
      const cached = getResearchDossierFromCache(topic, audience)
        || (session.audienceTopics?.[audience] ? getResearchDossierFromCache(session.audienceTopics[audience], audience) : null);
      if (cached && cached.sources?.length) {
        session.researchByAudience[audience] = cached;
      }
    }
  });

  return session;
}

function pruneOldResearchCache() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith(RESEARCH_CACHE_PREFIX) || key.startsWith(SESSION_RESEARCH_PREFIX))) {
        keys.push(key);
      }
    }
    if (keys.length > 20) {
      keys.slice(0, 10).forEach(k => localStorage.removeItem(k));
    }
  } catch (_) {}
}
