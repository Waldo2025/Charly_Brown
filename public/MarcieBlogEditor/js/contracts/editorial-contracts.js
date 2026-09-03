const SESSION_STATUSES = ["new", "researching", "trends_ready", "proposal_ready", "drafting", "review_required", "approved", "exported", "published", "failed", "archived"];

const SESSION_AUDIENCES = ["students", "educators", "parents", "coordinators"];

const EDITORIAL_MODES = ["marcie", "aida", "custom"];

const EVIDENCE_STATUSES = ["supported", "partially_supported", "unsupported", "contradicted", "legacy_unverified"];

const CALENDAR_STATUSES = [
  "idea", "planned", "researching", "drafting", "review", "approved",
  "scheduled", "published", "blocked", "failed", "cancelled", "archived"
];

const ARTICLE_BLOCK_TYPES = [
  "heading",
  "paragraph",
  "bulletList",
  "numberedList",
  "quote",
  "callout",
  "statistic",
  "definition",
  "question",
  "image",
  "sourceList"
];

const JOB_STATUSES = ["queued", "running", "succeeded", "failed"];

const JOB_TYPES = ["search", "analyze", "generate", "review", "publish"];

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function toStringTrim(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTimestamps(value) {
  if (!value) return new Date().toISOString();
  if (typeof value === "object" && "toDate" in value) {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : new Date().toISOString();
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function validateEvidence(value = {}) {
  if (!value || typeof value !== "object") return false;
  if (!isNonEmptyString(value.id)) return false;
  if (!isNonEmptyString(value.sourceId)) return false;
  if (!isNonEmptyString(value.claim)) return false;
  return true;
}

function validateSource(value = {}) {
  if (!value || typeof value !== "object") return false;
  if (!isNonEmptyString(value.id)) return false;
  if (!isNonEmptyString(value.canonicalUrl)) return false;
  if (!isNonEmptyString(value.title)) return false;
  return true;
}

function validateBlock(value = {}) {
  if (!value || typeof value !== "object") return false;
  if (!ARTICLE_BLOCK_TYPES.includes(value.type)) return false;
  if (!isNonEmptyString(value.id)) return false;
  if (value.type === "heading") return isNonEmptyString(value.text) && isNonEmptyString(value.level);
  if (value.type === "paragraph") return isNonEmptyString(value.text);
  if (value.type === "bulletList" || value.type === "numberedList") return Array.isArray(value.items);
  if (value.type === "quote") return isNonEmptyString(value.text);
  if (value.type === "callout") return isNonEmptyString(value.text) && isNonEmptyString(value.variant);
  if (value.type === "statistic") return isNonEmptyString(value.value) && isNonEmptyString(value.label);
  if (value.type === "definition") return isNonEmptyString(value.term) && isNonEmptyString(value.text);
  if (value.type === "question") return isNonEmptyString(value.text);
  if (value.type === "image") return isNonEmptyString(value.assetId);
  if (value.type === "sourceList") return Array.isArray(value.sourceIds);
  return false;
}

function validateArticle(value = {}) {
  if (!value || typeof value !== "object") return false;
  if (toStringTrim(value.schemaVersion) !== "1.0") return false;
  if (!isNonEmptyString(value.id)) return false;
  if (!isNonEmptyString(value.title)) return false;
  if (!SESSION_AUDIENCES.includes(value.audience)) return false;
  if (!Array.isArray(value.blocks) || !value.blocks.every(validateBlock)) return false;
  if (!Array.isArray(value.sourceIds)) return false;
  if (!Array.isArray(value.provenance?.generationRunIds)) return false;
  return true;
}

function normalizeEditorialMode(value = "marcie") {
  const normalized = String(value || "").trim().toLowerCase();
  return EDITORIAL_MODES.includes(normalized) ? normalized : "marcie";
}

function normalizeSelectedAudiences(value, mode = "marcie") {
  const defaults = normalizeEditorialMode(mode) === "aida"
    ? ["parents", "educators"]
    : ["educators", "students", "parents", "coordinators"];
  const selected = Array.isArray(value)
    ? value.map(String).filter((audience) => SESSION_AUDIENCES.includes(audience))
    : defaults;
  return [...new Set(selected.length ? selected : defaults)];
}

const AIDA_REQUIRED_PHASES = ["headline", "problem", "deepen", "agitate", "turn", "why", "change", "close"];

function isAidaArticleCompatible(article = {}) {
  const hasContent = Boolean(String(article?.title || "").trim()) && Array.isArray(article?.blocks) && article.blocks.length > 0;
  if (!hasContent) return true;
  if (String(article.editorialMode || "").toLowerCase() !== "aida") return false;
  const phases = Array.isArray(article.aida?.phases) ? article.aida.phases.map(String) : [];
  const orderedBlockPhases = article.blocks.map((block) => String(block?.phase || "")).filter((phase) => AIDA_REQUIRED_PHASES.includes(phase));
  const blockPhases = new Set(orderedBlockPhases);
  let previousIndex = -1;
  const ordered = AIDA_REQUIRED_PHASES.filter((phase) => phase !== "headline").every((phase) => {
    const index = orderedBlockPhases.indexOf(phase);
    if (index <= previousIndex) return false;
    previousIndex = index;
    return true;
  });
  return AIDA_REQUIRED_PHASES.every((phase) => phases.includes(phase))
    && AIDA_REQUIRED_PHASES.filter((phase) => phase !== "headline").every((phase) => blockPhases.has(phase))
    && ordered;
}

function articleVerificationBlockers(article = {}, context = {}) {
  const claims = Array.isArray(article.articleClaims) ? article.articleClaims : [];
  const sources = Array.isArray(article.researchSources || article.sources) ? (article.researchSources || article.sources) : [];
  const verification = article.verification && typeof article.verification === "object" ? article.verification : {};
  const blockers = [];
  const blockerKeys = new Set();
  const blockerKey = (reason) => {
    const text = String(reason || "").trim();
    if (/^Aida requiere (?:al menos )?\d+ páginas (?:actuales )?concretas verificadas\.?$/i.test(text)) return "aida-source-count";
    if (/^Aida requiere (?:al menos tres|cuatro) publicaciones o instituciones (?:independientes|diferentes)\.?$/i.test(text)) return "aida-institution-count";
    return text.toLowerCase();
  };
  const addBlocker = (reason, key = blockerKey(reason)) => {
    const text = String(reason || "").trim();
    if (!text || blockerKeys.has(key)) return;
    blockerKeys.add(key);
    blockers.push(text);
  };
  const expectedMode = normalizeEditorialMode(context.editorialMode || article.editorialMode || "marcie");
  const evidenceOnly = context.scope === "evidence";
  if (!evidenceOnly && expectedMode === "aida" && !isAidaArticleCompatible(article)) {
    addBlocker("El artículo no tiene una estructura Aida compatible; debe corregirse o regenerarse con el motor Aida.", "aida-structure");
  }
  if (expectedMode === "aida") {
    const verifiedSources = sources.filter((source) => source?.verificationStatus === "verified" && source?.evidenceRole !== "historical");
    const institutions = new Set(verifiedSources.map((source) => String(source?.publisher || source?.domain || "").trim().toLowerCase()).filter(Boolean));
    if (verifiedSources.length < 3) addBlocker(`Aida: ${verifiedSources.length} de 3 páginas mínimas verificadas.`, "aida-source-count");
    if (institutions.size < 3) addBlocker(`Aida: ${institutions.size} de 3 publicaciones o instituciones independientes.`, "aida-institution-count");
    if (!evidenceOnly) {
      const closingText = String([...(Array.isArray(article.blocks) ? article.blocks : [])].reverse().find((block) => block?.phase === "close")?.text || "").trim();
      const brandLine = String(article.aida?.brandLine || "").trim();
      if (brandLine && !closingText.endsWith(brandLine)) addBlocker("El cierre no contiene la frase de marca Aida exacta.", "aida-brand");
      if (/\b(?:compra|contrata|suscr[ií]bete|inscr[ií]bete|agenda (?:una )?(?:llamada|asesor[ií]a)|cont[aá]ctanos|adquiere)\b/i.test(closingText)) addBlocker("El cierre contiene un CTA comercial no permitido en Aida.", "aida-cta");
    }
  }
  if (!sources.length) addBlocker("El artículo no tiene fuentes recuperadas y verificadas.", "sources-empty");
  if (sources.some((source) => source?.verificationStatus !== "verified")) addBlocker("Existen fuentes que no superaron la verificación de contenido.", "sources-unverified");
  if (!claims.length) addBlocker("El artículo todavía no tiene una comprobación de afirmaciones factuales.", "claims-empty");
  claims.forEach((claim) => {
    const status = String(claim?.status || "unsupported");
    if (!["supported"].includes(status)) {
      addBlocker(String(claim?.text || claim?.claim || "Afirmación sin respaldo").slice(0, 220));
    }
  });
  if (Array.isArray(verification.contradictions) && verification.contradictions.length) {
    addBlocker("Existen contradicciones de evidencia pendientes de resolver.", "evidence-contradictions");
  }
  if (Array.isArray(verification.blockers)) verification.blockers.forEach((reason) => addBlocker(reason));
  if (!evidenceOnly && expectedMode === "aida" && article.aidaCompliance?.status !== "verified" && !blockers.length) {
    addBlocker("La revisión editorial Aida todavía no está completa.", "aida-review");
  }
  if (verification.status && verification.status !== "verified" && !blockers.length) {
    addBlocker("La verificación factual no está completa.", "verification-incomplete");
  }
  return blockers;
}

function isArticleFullyVerified(article = {}, context = {}) {
  return articleVerificationBlockers(article, context).length === 0;
}

function validateProposal(value = {}) {
  if (!value || typeof value !== "object") return false;
  if (!isNonEmptyString(value.id)) return false;
  if (!isNonEmptyString(value.trendId)) return false;
  if (!SESSION_AUDIENCES.includes(value.audience)) return false;
  if (!isNonEmptyString(value.title)) return false;
  if (!isNonEmptyString(value.angle)) return false;
  if (!isNonEmptyString(value.hook)) return false;
  if (!Array.isArray(value.sources)) return false;
  return true;
}

function validateTrend(value = {}) {
  if (!value || typeof value !== "object") return false;
  if (!isNonEmptyString(value.id)) return false;
  if (!isNonEmptyString(value.sessionId)) return false;
  if (!isNonEmptyString(value.label)) return false;
  if (!Number.isFinite(Number(value.score))) return false;
  if (!Array.isArray(value.sourceIds)) return false;
  return true;
}

function validateSession(value = {}) {
  if (!value || typeof value !== "object") return false;
  if (!isNonEmptyString(value.id)) return false;
  if (!isNonEmptyString(value.title)) return false;
  if (!SESSION_STATUSES.includes(value.status)) return false;
  return true;
}

function buildSeed(id, title) {
  return {
    id,
    title,
    status: "new",
    createdBy: "editorial",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function makeJob(type, stage) {
  if (!JOB_TYPES.includes(type) || !JOB_STATUSES.includes(stage)) {
    return null;
  }
  return {
    id: `job-${Date.now()}`,
    type,
    status: stage,
    progress: stage === "succeeded" ? 1 : 0,
    stage,
    startedAt: normalizeTimestamps(new Date())
  };
}

function normalizeSource(value = {}) {
  return {
    id: isNonEmptyString(value.id) ? value.id.trim() : `source-${Date.now()}`,
    canonicalUrl: isNonEmptyString(value.canonicalUrl) ? value.canonicalUrl.trim() : "",
    title: isNonEmptyString(value.title) ? value.title.trim() : "Sin titulo",
    publisher: isNonEmptyString(value.publisher) ? value.publisher.trim() : undefined,
    publishedAt: isNonEmptyString(value.publishedAt) ? value.publishedAt.trim() : undefined,
    retrievedAt: normalizeTimestamps(value.retrievedAt || new Date()),
    language: isNonEmptyString(value.language) ? value.language.trim() : undefined,
    sourceType: isNonEmptyString(value.sourceType) ? value.sourceType : "media",
    snippet: isNonEmptyString(value.snippet) ? value.snippet.trim() : undefined,
    duplicateGroup: isNonEmptyString(value.duplicateGroup) ? value.duplicateGroup.trim() : undefined,
    qualitySignals: typeof value.qualitySignals === "object" ? {
      authority: Number(value.qualitySignals.authority || 0),
      recency: Number(value.qualitySignals.recency || 0),
      primary: Boolean(value.qualitySignals.primary)
    } : {}
  };
}

function makeTrendId(topic, index = 0) {
  return `${topic.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${index}`;
}

function buildTrendScore({ freshness = 0, sourceDiversity = 0, educationalRelevance = 0, signalGrowth = 0, sourceAuthority = 0, editorialPotential = 0 }) {
  return (0.25 * Number(freshness) + 0.2 * Number(sourceDiversity) + 0.2 * Number(educationalRelevance) + 0.15 * Number(signalGrowth) + 0.1 * Number(sourceAuthority) + 0.1 * Number(editorialPotential));
}

function blockTextFromType(type, fallback = "") {
  const map = {
    heading: "Encabezado",
    paragraph: "Párrafo",
    bulletList: "Lista con viñetas",
    numberedList: "Lista numerada",
    quote: "Cita",
    callout: "Llamado de atencion",
    statistic: "Dato",
    definition: "Definicion",
    question: "Pregunta",
    image: "Imagen",
    sourceList: "Fuentes"
  };
  return isNonEmptyString(fallback) ? fallback : map[type] || "Bloque";
}

export {
  SESSION_STATUSES,
  SESSION_AUDIENCES,
  EDITORIAL_MODES,
  EVIDENCE_STATUSES,
  CALENDAR_STATUSES,
  ARTICLE_BLOCK_TYPES,
  JOB_STATUSES,
  JOB_TYPES,
  validateSource,
  validateEvidence,
  validateProposal,
  validateTrend,
  validateArticle,
  validateSession,
  normalizeEditorialMode,
  normalizeSelectedAudiences,
  isAidaArticleCompatible,
  articleVerificationBlockers,
  isArticleFullyVerified,
  normalizeSource,
  buildSeed,
  buildTrendScore,
  makeTrendId,
  makeJob,
  normalizeTimestamps,
  blockTextFromType
};
