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
const MAX_CACHE_SOURCES = 30;
const MAX_CACHE_FACTS = 20;
const MAX_CACHE_REFERENCES = 20;
const MAX_CACHE_PENDING = 256;
const MAX_CACHE_REJECTED = 12;
const MAX_CACHE_PROPOSALS = 6;

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

function trimText(value = "", max = 800) {
  const text = String(value || "").trim();
  return text.length > max ? `${text.slice(0, max).trim()}...` : text;
}

function compactSourceForCache(source = {}) {
  return {
    id: String(source.id || "").trim(),
    title: trimText(source.title, 220),
    url: String(source.url || "").trim(),
    landingUrl: String(source.landingUrl || "").trim(),
    sourceType: String(source.sourceType || "").trim(),
    verificationStatus: String(source.verificationStatus || "").trim(),
    evidenceRole: String(source.evidenceRole || "").trim(),
    qualityTier: String(source.qualityTier || "").trim(),
    publisher: trimText(source.publisher, 220),
    author: trimText(source.author, 160),
    authors: Array.isArray(source.authors) ? source.authors.slice(0, 6).map((author) => trimText(author, 160)).filter(Boolean) : [],
    publishedAt: String(source.publishedAt || source.date || "").trim(),
    year: String(source.year || "").trim(),
    doi: trimText(source.doi, 180),
    citation: trimText(source.citation, 600),
    citationApa: trimText(source.citationApa || source.apa || "", 600),
    // Contexto comprobado por el verificador: permite reutilizar la fuente
    // sin guardar el texto bruto completo de la página.
    supportSummary: trimText(source.supportSummary || source.context || source.summary, 900),
    supports: Array.isArray(source.supports) ? source.supports.slice(0, 12).map((item) => trimText(item, 160)).filter(Boolean) : [],
    locator: trimText(source.locator, 160),
    retrievalStatus: String(source.retrievalStatus || "").trim()
  };
}

function compactFactForCache(fact = {}) {
  return {
    id: String(fact.id || "").trim(),
    text: trimText(fact.text || fact.claim || fact.summary, 500),
    sourceIds: Array.isArray(fact.sourceIds) ? fact.sourceIds.slice(0, 6).map(String) : [],
    locator: trimText(fact.locator, 160),
    isDirectQuote: fact.isDirectQuote === true
  };
}

function compactReferenceForCache(reference = {}) {
  return {
    id: String(reference.id || "").trim(),
    sourceId: String(reference.sourceId || "").trim(),
    text: trimText(reference.text || reference.quote, 400),
    locator: trimText(reference.locator, 160)
  };
}

function compactCandidateForCache(candidate = {}) {
  return {
    id: String(candidate.id || "").trim(),
    title: trimText(candidate.title, 180),
    url: String(candidate.url || candidate.requestedUrl || "").trim(),
    landingUrl: String(candidate.landingUrl || "").trim(),
    sourceType: String(candidate.sourceType || "").trim(),
    discoveredVia: Array.isArray(candidate.discoveredVia) ? candidate.discoveredVia.slice(0, 6).map(String) : [],
    verificationAttempts: Number(candidate.verificationAttempts || 0),
    reason: trimText(candidate.reason, 180),
    httpStatus: Number(candidate.httpStatus || 0)
  };
}

function compactRejectedSourceForCache(source = {}) {
  return {
    id: String(source.id || "").trim(),
    title: trimText(source.title, 180),
    url: String(source.url || source.requestedUrl || "").trim(),
    domain: trimText(source.domain, 120),
    reason: trimText(source.reason, 180),
    metadataGaps: Array.isArray(source.metadataGaps) ? source.metadataGaps.slice(0, 6).map((gap) => trimText(gap, 40)) : [],
    httpStatus: Number(source.httpStatus || 0),
    discoveredVia: Array.isArray(source.discoveredVia) ? source.discoveredVia.slice(0, 6).map(String) : []
  };
}

function compactSignalForCache(signal = {}) {
  if (typeof signal === "string") return trimText(signal, 280);
  if (!signal || typeof signal !== "object") return "";
  return {
    id: String(signal.id || "").trim(),
    signal: trimText(signal.signal || signal.text || signal.title || signal.summary, 280),
    sourceIds: Array.isArray(signal.sourceIds) ? signal.sourceIds.slice(0, 4).map(String) : [],
    url: String(signal.url || "").trim()
  };
}

function compactProposalForCache(proposal = {}) {
  return {
    id: String(proposal.id || "").trim(),
    audience: String(proposal.audience || "").trim(),
    audienceLabel: trimText(proposal.audienceLabel, 100),
    title: trimText(proposal.title, 220),
    angle: trimText(proposal.angle, 360),
    brief: trimText(proposal.brief, 600),
    sourceIds: Array.isArray(proposal.sourceIds) ? proposal.sourceIds.slice(0, 12).map(String) : [],
    researchStatus: String(proposal.researchStatus || "").trim(),
    verifiedSourceCount: Number(proposal.verifiedSourceCount || 0),
    targetSourceCount: Number(proposal.targetSourceCount || 0)
  };
}

function compactDossierForCache(dossier = {}) {
  dossier = dossier && typeof dossier === "object" ? dossier : {};
  return {
    sources: (Array.isArray(dossier.sources) ? dossier.sources : []).slice(0, MAX_CACHE_SOURCES).map(compactSourceForCache),
    facts: (Array.isArray(dossier.facts) ? dossier.facts : []).slice(0, MAX_CACHE_FACTS).map(compactFactForCache),
    attributedReferences: (Array.isArray(dossier.attributedReferences) ? dossier.attributedReferences : []).slice(0, MAX_CACHE_REFERENCES).map(compactReferenceForCache),
    currentSignals: (Array.isArray(dossier.currentSignals) ? dossier.currentSignals : []).slice(0, 6).map(compactSignalForCache).filter(Boolean),
    historicalMilestones: (Array.isArray(dossier.historicalMilestones) ? dossier.historicalMilestones : []).slice(0, 6).map(compactSignalForCache).filter(Boolean),
    analysis: dossier.analysis ? {
      summary: trimText(dossier.analysis.summary, 900),
      sourceIds: Array.isArray(dossier.analysis.sourceIds) ? dossier.analysis.sourceIds.slice(0, 12).map(String) : []
    } : null,
    audience: String(dossier.audience || "").trim(),
    analysisStatus: String(dossier.analysisStatus || "").trim(),
    verificationStatus: String(dossier.verificationStatus || "").trim(),
    verifiedSourceCount: Number(dossier.verifiedSourceCount || 0),
    targetSourceCount: Number(dossier.targetSourceCount || 0),
    sharedSourceIds: Array.isArray(dossier.sharedSourceIds) ? dossier.sharedSourceIds.slice(0, 6).map(String) : [],
    specificSourceIds: Array.isArray(dossier.specificSourceIds) ? dossier.specificSourceIds.slice(0, 8).map(String) : [],
    sharedSourceCount: Number(dossier.sharedSourceCount || 0),
    specificSourceCount: Number(dossier.specificSourceCount || 0),
    sharedSourceTarget: Number(dossier.sharedSourceTarget || 0),
    specificSourceTarget: Number(dossier.specificSourceTarget || 0),
    totalSourceCount: Number(dossier.totalSourceCount || 0),
    researchFingerprint: String(dossier.researchFingerprint || "").trim(),
    researchedAt: String(dossier.researchedAt || "").trim(),
    researchRegion: String(dossier.researchRegion || "").trim(),
    researchPolicyVersion: String(dossier.researchPolicyVersion || "").trim(),
    searchPlatforms: Array.isArray(dossier.searchPlatforms) ? dossier.searchPlatforms.slice(0, 8).map(String) : [],
    researchInstructions: Array.isArray(dossier.researchInstructions) ? dossier.researchInstructions.slice(0, 8).map((item) => trimText(item, 300)).filter(Boolean) : [],
    pendingCandidates: (Array.isArray(dossier.pendingCandidates) ? dossier.pendingCandidates : []).slice(0, MAX_CACHE_PENDING).map(compactCandidateForCache),
    rejectedSources: (Array.isArray(dossier.rejectedSources) ? dossier.rejectedSources : []).slice(-MAX_CACHE_REJECTED).map(compactRejectedSourceForCache),
    blockers: Array.isArray(dossier.blockers) ? dossier.blockers.slice(0, 8).map((item) => trimText(item, 300)).filter(Boolean) : [],
    recommendations: Array.isArray(dossier.recommendations) ? dossier.recommendations.slice(0, 6).map((item) => trimText(item, 300)).filter(Boolean) : [],
    quotaLimited: dossier.quotaLimited === true,
    selectionComplete: dossier.selectionComplete === true,
    dateSearchComplete: dossier.dateSearchComplete === true,
    datedSourceCount: Number(dossier.datedSourceCount || 0),
    nextPlatformOffset: Number(dossier.nextPlatformOffset || 0),
    dateWindow: dossier.dateWindow && typeof dossier.dateWindow === "object" ? {
      from: String(dossier.dateWindow.from || "").slice(0, 30),
      to: String(dossier.dateWindow.to || "").slice(0, 30),
      label: trimText(dossier.dateWindow.label, 120)
    } : null
  };
}

function safeSetLocalStorage(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (_) {
    pruneOldResearchCache({ aggressive: true });
    try {
      localStorage.removeItem(key);
      localStorage.setItem(key, value);
      return true;
    } catch (_) {
      return false;
    }
  }
}

/**
 * Guarda el dossier de investigación de una audiencia específica en localStorage.
 */
export function saveResearchDossierToCache(topic = "", audience = "", dossier = null) {
  if (!dossier || typeof dossier !== "object") return;
  const sources = Array.isArray(dossier.sources) ? dossier.sources : [];
  if (!sources.length && dossier.verificationStatus === "blocked") return;

  const key = buildCacheKey(topic, audience);
  const compactDossier = compactDossierForCache(dossier);
  const payload = {
    topic: String(topic || "").trim(),
    audience: String(audience || "").trim(),
    savedAt: new Date().toISOString(),
    dossier: compactDossier
  };

  safeSetLocalStorage(key, JSON.stringify(payload));
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
    researchByAudience: Object.fromEntries(Object.entries(researchByAudience).map(([audience, dossier]) => [audience, compactDossierForCache(dossier)])),
    researchGlobal: session.researchGlobal ? compactDossierForCache(session.researchGlobal) : null,
    researchGlobalFingerprint: String(session.researchGlobalFingerprint || ""),
    researchShared: session.researchShared ? compactDossierForCache(session.researchShared) : null,
    proposals: proposals.slice(0, MAX_CACHE_PROPOSALS).map(compactProposalForCache),
    specifications: Array.isArray(session.specifications) ? session.specifications.slice(0, 12).map((item) => trimText(item, 500)).filter(Boolean) : []
  };

  const serialized = JSON.stringify(snapshot);
  if (session.id) safeSetLocalStorage(`${SESSION_RESEARCH_PREFIX}${session.id}`, serialized);
  safeSetLocalStorage(LAST_RESEARCH_KEY, serialized);
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

  if (snapshot?.researchShared && (!session.researchShared || !session.researchShared.sources?.length)) {
    session.researchShared = snapshot.researchShared;
  }
  if (snapshot?.researchGlobal && !session.researchGlobal) {
    session.researchGlobal = snapshot.researchGlobal;
    session.researchGlobalFingerprint = snapshot.researchGlobalFingerprint || "";
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

function pruneOldResearchCache({ aggressive = false } = {}) {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith(RESEARCH_CACHE_PREFIX) || key.startsWith(SESSION_RESEARCH_PREFIX))) {
        let savedAt = 0;
        try {
          const raw = localStorage.getItem(key);
          savedAt = raw ? new Date(JSON.parse(raw)?.savedAt || 0).getTime() || 0 : 0;
        } catch (_) {}
        keys.push({ key, savedAt });
      }
    }
    keys.sort((a, b) => a.savedAt - b.savedAt);
    const removeCount = aggressive
      ? Math.max(1, Math.ceil(keys.length * 0.75))
      : Math.max(0, keys.length - 16);
    if (removeCount > 0) {
      keys.slice(0, removeCount).forEach(({ key }) => localStorage.removeItem(key));
    }
  } catch (_) {}
}
