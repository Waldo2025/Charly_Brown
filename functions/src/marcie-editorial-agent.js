const { instrumentMcpServer } = require('./mcp/runtime.js');
const { createHash, randomUUID } = require("node:crypto");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const z = require("zod/v4");
const bibliography = require("./marcie-bibliography.js");
const { normalizeArticleRevision, withoutBibliographyBlocks } = require("./marcie-article-revision.js");
const { unresolvedClaims, selectEvidenceClaim, buildEvidenceRepairPreview } = require("./marcie-evidence-repair.js");
const {
  assertEditorialAccess,
  researchArticleEvidenceServer,
  verifyArticleEvidenceServer
} = require("./marcie-editorial-research.js");
const { DEFAULT_TEXT_MODEL } = require("./vertex.js");
const {
  ANALYSIS_VERSION,
  YOUTUBE_ANALYSIS_CACHE_COLLECTION,
  analyzeYoutubeVideos,
  fetchYoutubePublicMetadata,
  normalizeYoutubeUrl,
  compactVideoAnalysisForCache,
  normalizeYoutubeUrls,
  youtubeAnalysisCacheKey
} = require("./marcie-youtube-agent.js");

const RUNS_COLLECTION = "MarcieEditorialAgentRuns";
const SESSIONS_COLLECTION = "MarcieBlogEditor";
const AUDIENCES = Object.freeze([
  { id: "educators", label: "Docentes" },
  { id: "students", label: "Estudiantes" },
  { id: "parents", label: "Padres y familias" },
  { id: "coordinators", label: "Coordinadores" }
]);
const TONES = Object.freeze([
  { id: "warm", label: "Cálido y cercano", value: "Cálido y cercano" },
  { id: "professional", label: "Profesional y claro", value: "Profesional y claro" },
  { id: "inspiring", label: "Inspirador", value: "Inspirador" },
  { id: "analytical", label: "Analítico y riguroso", value: "Analítico y riguroso" },
  { id: "custom", label: "Personalizado", value: "Personalizado" }
]);
const EXTENSIONS = Object.freeze([
  { id: "brief", label: "Breve (600–900 palabras)", value: "Breve, entre 600 y 900 palabras" },
  { id: "standard", label: "Estándar (1200–1600 palabras)", value: "Estándar, entre 1200 y 1600 palabras" },
  { id: "deep", label: "Profundo (1600–2200 palabras)", value: "Profunda, entre 1600 y 2200 palabras" },
  { id: "pillar", label: "Contenido pilar (2500–3500 palabras)", value: "Contenido pilar, entre 2500 y 3500 palabras" }
]);
const RESOURCES = Object.freeze([
  { id: "apa7", label: "Bibliografía APA 7" },
  { id: "quotes", label: "Citas verificadas" },
  { id: "lists", label: "Listas prácticas" },
  { id: "cases", label: "Casos o ejemplos" },
  { id: "analogies", label: "Analogías" },
  { id: "cta", label: "Llamado a la acción" },
  { id: "seo", label: "Optimización SEO" }
]);
const SEARCH_PLATFORMS = Object.freeze([
  { id: "ebsco", label: "EBSCO" },
  { id: "cochrane", label: "Cochrane Library" },
  { id: "redalyc", label: "Redalyc" },
  { id: "scielo", label: "SciELO" },
  { id: "dialnet", label: "Dialnet" },
  { id: "base", label: "BASE" },
  { id: "refseek", label: "RefSeek" },
  { id: "supplemental", label: "Otros sitios fiables" }
]);

function clean(value, max = 12000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeKey(value = "") {
  return clean(value, 200).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function uniqueStrings(value = [], max = 100) {
  const entries = Array.isArray(value) ? value : String(value || "").split(/[\n,;]+/);
  const seen = new Set();
  const result = [];
  for (const raw of entries) {
    const item = clean(raw, 300);
    const key = normalizeKey(item);
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= max) break;
  }
  return result;
}

function articleRepairFingerprint(article = {}) {
  return createHash("sha256").update(JSON.stringify({
    title: article.title, subtitle: article.subtitle, blocks: article.blocks,
    sources: article.researchSources || article.sources
  })).digest("hex");
}

function textResult(value) {
  return { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value };
}

function parseJson(value = "", fallback = {}) {
  try {
    return JSON.parse(String(value || "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, ""));
  } catch (_) {
    return fallback;
  }
}

function modelErrorDetails(error) {
  return [error?.status, error?.code, error?.message, error?.response?.data, error?.cause?.message]
    .filter(Boolean)
    .map((value) => typeof value === "string" ? value : JSON.stringify(value))
    .join(" ");
}

function isTransientModelError(error) {
  const details = modelErrorDetails(error);
  const status = Number(error?.status || error?.code || error?.response?.status || details.match(/"code"\s*:\s*(\d{3})/)?.[1] || 0);
  return [429, 500, 502, 503, 504].includes(status)
    || /INTERNAL|RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded|high demand|temporar|rate.?limit|quota/i.test(details);
}

async function withModelRetry(operation, { maxAttempts = 3, baseDelayMs = 500, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (!isTransientModelError(error) || attempt >= maxAttempts) throw error;
      await sleep(baseDelayMs * (2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

function logModelFallback(operation, error) {
  console.warn(JSON.stringify({
    severity: "WARNING",
    event: "marcie_model_fallback",
    operation,
    transient: isTransientModelError(error),
    code: clean(error?.code || error?.status || error?.response?.status || "", 120),
    message: clean(error?.message || error?.cause?.message || "", 240)
  }));
}

function logMarcieAgent(event, fields = {}, severity = "INFO") {
  console[severity === "WARNING" ? "warn" : "info"](JSON.stringify({
    severity,
    event,
    ...fields
  }));
}

function publicSession(session = {}) {
  return {
    id: clean(session.id, 120),
    title: clean(session.title, 300),
    topic: clean(session.topic, 600),
    status: clean(session.status, 80),
    audience: clean(session.audience, 80),
    selectedAudiences: Array.isArray(session.selectedAudiences) ? session.selectedAudiences.map(String) : [],
    specifications: Array.isArray(session.specifications) ? session.specifications.map(String) : [],
    preferredVocabulary: Array.isArray(session.preferredVocabulary) ? session.preferredVocabulary.map(String) : [],
    sourceInputs: { youtube: (session.sourceInputs?.youtube || []).slice(0, 5).map((item) => ({ videoId: clean(item?.videoId, 24), url: clean(item?.url, 3000) })) },
    videoResearch: session.videoResearch ? {
      analysisVersion: Number(session.videoResearch.analysisVersion || 0),
      videos: (session.videoResearch.videos || []).slice(0, 5).map((video) => ({ videoId: clean(video?.videoId, 24), title: clean(video?.title, 300), channel: clean(video?.channel, 200) })),
      warnings: (session.videoResearch.warnings || []).slice(0, 20).map((warning) => clean(warning, 500))
    } : null,
    revision: Number(session.storageRevision || session.configurationRevision || 0),
    articlesByAudience: Object.fromEntries(Object.entries(session.articlesByAudience || {}).map(([audience, article]) => [audience, {
      title: clean(article?.title, 300),
      revision: Number(article?.revision || 0),
      verificationStatus: clean(article?.verification?.status, 80),
      sourceCount: Array.isArray(article?.sources) ? article.sources.length : 0
    }]))
  };
}

function articlePreviewForUi(article = {}) {
  return {
    title: clean(article.title, 300),
    subtitle: clean(article.subtitle, 600),
    audience: clean(article.audience, 80),
    blocks: (Array.isArray(article.blocks) ? article.blocks : []).slice(0, 80).map((block) => ({
      type: clean(block?.type, 80),
      title: clean(block?.title || block?.heading, 300),
      text: clean(block?.text || block?.content || block?.quote || block?.html, 12000),
      items: (Array.isArray(block?.items) ? block.items : []).slice(0, 30).map((item) => clean(typeof item === "string" ? item : item?.text || item?.content, 1000)).filter(Boolean)
    })),
    sourceCount: Array.isArray(article.sources) ? article.sources.length : 0,
    revision: Number(article.revision || 0)
  };
}

function pendingChangeForUi(pending = null, currentArticle = {}) {
  if (!pending?.preview) return null;
  const verifiedChanges = deriveArticleChanges(currentArticle, pending.preview, pending.changes || []);
  return {
    audience: clean(pending.audience, 80),
    baseRevision: Number(pending.baseRevision || 0),
    findings: (pending.findings || []).slice(0, 20).map((item) => clean(item, 1000)).filter(Boolean),
    changes: verifiedChanges.slice(0, 40).map((change) => ({
      scope: clean(change?.scope, 80),
      label: clean(change?.label, 300),
      before: clean(change?.before, 12000),
      after: clean(change?.after, 12000),
      rationale: clean(change?.rationale, 1000)
    })).filter((change) => change.before !== change.after),
    original: articlePreviewForUi(currentArticle),
    preview: articlePreviewForUi(pending.preview),
    createdAt: clean(pending.createdAt, 80)
  };
}

function blockComparisonText(block = {}) {
  return clean([
    block?.title || block?.heading,
    block?.text || block?.content || block?.quote || block?.html,
    ...(Array.isArray(block?.items) ? block.items.map((item) => typeof item === "string" ? item : item?.text || item?.content) : [])
  ].filter(Boolean).join("\n"), 12000);
}

function deriveArticleChanges(original = {}, revised = {}, reported = []) {
  const changes = [];
  const add = (change) => {
    const before = clean(change.before, 12000);
    const after = clean(change.after, 12000);
    if (before === after) return;
    changes.push({
      scope: clean(change.scope || "content", 80),
      label: clean(change.label || `Cambio ${changes.length + 1}`, 300),
      before,
      after,
      rationale: clean(change.rationale, 1000),
      ...(Number.isInteger(change.blockIndex) ? { blockIndex: change.blockIndex } : {})
    });
  };
  if (clean(original.title, 300) !== clean(revised.title, 300)) add({ scope: "title", label: "Título", before: original.title, after: revised.title });
  if (clean(original.subtitle, 600) !== clean(revised.subtitle, 600)) add({ scope: "subtitle", label: "Subtítulo", before: original.subtitle, after: revised.subtitle });
  const originalBlocks = Array.isArray(original.blocks) ? original.blocks : [];
  const revisedBlocks = Array.isArray(revised.blocks) ? revised.blocks : [];
  const length = Math.max(originalBlocks.length, revisedBlocks.length);
  for (let index = 0; index < length; index += 1) {
    const before = blockComparisonText(originalBlocks[index]);
    const after = blockComparisonText(revisedBlocks[index]);
    const modelChange = (reported || []).find((change) => Number(change?.blockIndex) === index);
    add({
      scope: clean(modelChange?.scope || originalBlocks[index]?.type || revisedBlocks[index]?.type || "block", 80),
      label: clean(modelChange?.label || `Bloque ${index + 1}`, 300),
      before,
      after,
      rationale: modelChange?.rationale,
      blockIndex: index
    });
  }
  const sourceSummary = (article) => bibliography.sources(article).map((source) => `${source.id}: ${source.title}`).join("; ");
  add({ scope: "sources", label: "Fuentes bibliográficas", before: sourceSummary(original), after: sourceSummary(revised) });
  return changes.slice(0, 40);
}

async function loadOwnedSession(db, uid, sessionId) {
  const id = clean(sessionId, 120);
  if (!id) throw Object.assign(new Error("marcie_session_id_required"), { status: 400 });
  const ref = db.collection(SESSIONS_COLLECTION).doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw Object.assign(new Error("marcie_session_not_found"), { status: 404 });
  const session = { id: snapshot.id, ...(snapshot.data() || {}) };
  if (String(session.ownerId || session.ownerUid || "") !== uid) {
    throw Object.assign(new Error("marcie_session_forbidden"), { status: 403 });
  }
  return { ref, session };
}

async function listTrendingTopics(db, limit = 3) {
  const snapshot = await db.collection("MarcieTrendSnapshots").limit(12).get();
  const topics = [];
  snapshot.forEach((doc) => {
    const data = doc.data() || {};
    const candidates = Array.isArray(data.opportunities) ? data.opportunities : (data.topic ? [data] : []);
    candidates.forEach((item, index) => {
      const topic = clean(item.topic || item.title, 300);
      if (!topic) return;
      topics.push({
        id: clean(item.id || `${doc.id}-${index + 1}`, 160),
        topic,
        summary: clean(item.summary || item.whyNow, 700),
        trendScore: Number(item.trendScore || item.trendingPercent || 0),
        generatedAt: String(data.generatedAt || item.generatedAt || "")
      });
    });
  });
  return topics.sort((a, b) => b.trendScore - a.trendScore || b.generatedAt.localeCompare(a.generatedAt)).slice(0, Math.max(1, Math.min(6, Number(limit) || 3)));
}

function fallbackProposals(topic, audiences) {
  const labels = Object.fromEntries(AUDIENCES.map((item) => [item.id, item.label]));
  return Object.fromEntries(audiences.map((audience) => [audience, [
    { id: `${audience}-hook-1`, title: `${topic}: guía práctica para ${labels[audience] || audience}`, kind: "hook" },
    { id: `${audience}-hook-2`, title: `Lo que ${labels[audience] || audience} necesitan saber sobre ${topic}`, kind: "hook" },
    { id: `${audience}-hook-3`, title: `${topic} sin mitos: claves basadas en evidencia`, kind: "hook" },
    { id: `${audience}-antihook-1`, title: `Lo que no conviene hacer al abordar ${topic}`, kind: "antihook" },
    { id: `${audience}-antihook-2`, title: `Errores frecuentes sobre ${topic} que pueden confundir a ${labels[audience] || audience}`, kind: "antihook" },
    { id: `${audience}-antihook-3`, title: `${topic}: señales de alerta y decisiones que vale la pena evitar`, kind: "antihook" }
  ]]));
}

function compactVideoContext(videoResearch = null) {
  if (!videoResearch?.videos?.length) return null;
  return {
    objective: clean(videoResearch.objective, 800),
    combinedSynthesis: clean(videoResearch.combinedSynthesis, 5000),
    proposedTopics: (videoResearch.proposedTopics || []).slice(0, 3).map((item) => clean(item, 300)),
    videos: videoResearch.videos.slice(0, 5).map((video) => ({
      title: clean(video?.title, 300),
      channel: clean(video?.channel, 200),
      summary: clean(video?.summary, 1800),
      centralIdea: clean(video?.centralIdea, 1800),
      neuroeducationConnection: clean(video?.neuroeducationConnection, 1800),
      topics: (video?.topics || []).slice(0, 10).map((item) => clean(item, 200)),
      concepts: (video?.concepts || []).slice(0, 12).map((item) => clean(item, 240))
    })),
    evidenceItems: (videoResearch.evidenceItems || []).slice(0, 20).map((item) => ({
      text: clean(item?.text, 500),
      locator: clean(item?.locator || item?.timestamp, 40),
      evidenceKind: clean(item?.evidenceKind, 40)
    }))
  };
}

async function generateProposalOptions({ topic, audiences, generateText, videoResearch = null, editorialInstructions = [] }) {
  const fallback = fallbackProposals(topic, audiences);
  if (typeof generateText !== "function") return fallback;
  const videoContext = compactVideoContext(videoResearch);
  const prompt = `Genera exactamente seis títulos distintos para cada público de un artículo educativo: tres hooks y tres antihooks. Tema elegido por el usuario: ${topic}. Públicos: ${audiences.join(", ")}.
${videoContext ? `El video es la base conceptual obligatoria. Cada título debe articular con fidelidad dos ejes: la idea central comprobable del video y su relación pertinente con la neuroeducación. No copies el título ni frases del video, no introduzcas un enfoque ajeno y no fuerces afirmaciones neurocientíficas sin respaldo: ${JSON.stringify(videoContext)}` : "No hay expediente de video."}
INSTRUCCIONES EDITORIALES DEL USUARIO: ${JSON.stringify(editorialInstructions)}. Respétalas como restricciones, pero jamás las copies ni las conviertas literalmente en títulos.
Adapta el ángulo y el vocabulario a cada público. Los hooks deben plantear un beneficio, oportunidad o ruta clara. Los antihooks deben partir de error, riesgo, mito, mala práctica o advertencia sin caer en alarmismo. Evita clickbait, promesas médicas y títulos genéricos. Devuelve SOLO JSON: {"proposals":{"educators":{"hooks":[{"title":""}],"antihooks":[{"title":""}]}}}. Incluye únicamente las claves de públicos solicitadas.`;
  try {
    const raw = await generateText({ model: DEFAULT_TEXT_MODEL, prompt, json: true, thinkingLevel: "MEDIUM" });
    const parsed = parseJson(raw, {});
    return Object.fromEntries(audiences.map((audience) => {
      const source = parsed.proposals?.[audience];
      const hooks = Array.isArray(source?.hooks) ? source.hooks : (Array.isArray(source) ? source.slice(0, 3) : []);
      const antihooks = Array.isArray(source?.antihooks) ? source.antihooks : (Array.isArray(source) ? source.slice(3, 6) : []);
      const candidates = [
        ...hooks.map((item, index) => ({ id: `${audience}-hook-${index + 1}`, title: clean(item?.title || item, 240), kind: "hook" })),
        ...antihooks.map((item, index) => ({ id: `${audience}-antihook-${index + 1}`, title: clean(item?.title || item, 240), kind: "antihook" }))
      ].filter((item) => item.title).slice(0, 6);
      return [audience, candidates.length === 6 ? candidates : fallback[audience]];
    }));
  } catch (_) {
    return fallback;
  }
}

function videoObjectiveFromInput(input = {}) {
  const raw = String(input.text || input.value || "")
    .replace(/https:\/\/[^\s,;]+/gi, " ")
    .replace(/\b(?:por favor|quiero que|quiero|usa|utiliza|toma|tomando|emplea|este|el|un|video|youtube|como base|de base|para crear|crea|haz|art[ií]culos?)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return raw.length >= 8 ? clean(raw, 800) : "";
}

function audiencesFromText(value = "") {
  const text = normalizeKey(value);
  const selected = [];
  if (/\b(?:docente|docentes|maestro|maestros|profesor|profesores)\b/.test(text)) selected.push("educators");
  if (/\b(?:estudiante|estudiantes|alumno|alumnos)\b/.test(text)) selected.push("students");
  if (/\b(?:padre|padres|madre|madres|familia|familias)\b/.test(text)) selected.push("parents");
  if (/\b(?:coordinador|coordinadores|directivo|directivos)\b/.test(text)) selected.push("coordinators");
  return [...new Set(selected)];
}

function looksLikeVideoEditorialDirection(value = "") {
  const text = normalizeKey(value);
  return text.length > 150 || audiencesFromText(text).length > 0 || /\b(?:necesito|quiero|debe|deben|toma|tomar|usa|usar|utiliza|enfoca|enfocalo|evita|excluye|omite|solo los|sin contenido|como base)\b/.test(text) || /\bno\s+(?:tomar|incluy|usar|mencionar)\b/.test(text);
}

function bestVideoTopic(configuration = {}, instruction = "") {
  const proposals = (configuration.videoResearch?.proposedTopics || []).map((item) => clean(item, 300)).filter(Boolean);
  const normalizedInstruction = normalizeKey(instruction);
  const avoidsReligiousContent = /\b(?:religio|religioso|religiosa|religion|biblic|propaganda|proselit)\w*/.test(normalizedInstruction);
  const scientific = /\b(?:neuro|cerebr|plastic|aprendiz|atencion|memoria|emocion|lenguaje|autorregul|cognit|cientific)\w*/g;
  const religious = /\b(?:religio|biblic|proverb|sapiencial|espiritual|teolog|sagrado|fe)\w*/g;
  const ranked = proposals.map((topic, index) => {
    const normalized = normalizeKey(topic);
    const scienceScore = (normalized.match(scientific) || []).length * 3;
    const exclusionPenalty = avoidsReligiousContent ? (normalized.match(religious) || []).length * 20 : 0;
    return { topic, score: scienceScore - exclusionPenalty - index * 0.01 };
  }).sort((a, b) => b.score - a.score);
  if (ranked[0]?.topic) return ranked[0].topic;
  const video = configuration.videoResearch?.videos?.[0] || {};
  return clean(video.neuroeducationConnection || video.centralIdea || video.summary, 300);
}

async function interpretVideoTopicTurn(run, input, context) {
  const text = clean(input.text || input.value, 4000);
  const configuration = run.configuration || {};
  const isDirection = looksLikeVideoEditorialDirection(text);
  const deterministic = {
    topic: isDirection ? bestVideoTopic(configuration, text) : text,
    audiences: audiencesFromText(text),
    editorialInstruction: isDirection ? text : ""
  };
  if (!text || typeof context.generateText !== "function") return deterministic;
  const prompt = `Interpreta un turno del usuario después de analizar un video para crear artículos. Separa el tema editorial, los públicos y las restricciones. No conviertas una orden completa en título. Si el usuario da instrucciones pero no propone un tema breve, elige o redacta un tema de máximo 14 palabras basado estrictamente en la idea central y su relación con la neuroeducación. Devuelve los públicos solo con estos IDs: educators, students, parents, coordinators. Conserva las restricciones del usuario sin inventarlas.
TURNO: ${text}
EXPEDIENTE: ${JSON.stringify(compactVideoContext(configuration.videoResearch)).slice(0, 16000)}
TEMAS PROPUESTOS: ${JSON.stringify(configuration.videoResearch?.proposedTopics || [])}
Devuelve SOLO JSON: {"topic":"","audiences":[],"editorialInstruction":""}`;
  try {
    const parsed = parseJson(await context.generateText({ model: DEFAULT_TEXT_MODEL, prompt, json: true, thinkingLevel: "LOW" }), {});
    const topic = clean(parsed.topic, 300);
    const audiences = (Array.isArray(parsed.audiences) ? parsed.audiences : []).map(String).filter((item) => AUDIENCES.some((audience) => audience.id === item));
    const editorialInstruction = clean(parsed.editorialInstruction, 1200);
    const normalizedTopic = normalizeKey(topic);
    const excludesReligion = /\b(?:religio|religioso|religiosa|religion|biblic|propaganda|proselit)\w*/.test(normalizeKey(text));
    const reintroducesExcludedContent = excludesReligion && /\b(?:religio|biblic|proverb|sapiencial|espiritual|teolog|sagrado|fe)\w*/.test(normalizedTopic);
    const leakedInstruction = isDirection && (normalizeKey(topic) === normalizeKey(text) || looksLikeVideoEditorialDirection(topic) || topic.split(/\s+/).length > 18 || reintroducesExcludedContent);
    return {
      topic: leakedInstruction ? deterministic.topic : (topic || deterministic.topic),
      audiences: audiences.length ? [...new Set(audiences)] : deterministic.audiences,
      editorialInstruction: deterministic.editorialInstruction || editorialInstruction
    };
  } catch (_) {
    return deterministic;
  }
}

function initialRun({ uid, displayName = "" } = {}) {
  return {
    id: `marcie-agent-${randomUUID()}`,
    ownerId: uid,
    displayName: clean(displayName, 120),
    status: "configuring",
    phase: "creation_source",
    topicWasPrompted: false,
    configuration: {
      creationSource: "",
      topic: "",
      selectedAudiences: [],
      proposalsByAudience: {},
      proposalOptionsByAudience: {},
      tone: "",
      lengthMode: "same",
      extensionsByAudience: {},
      sourceMode: "all",
      specialSources: [],
      sourceInputs: { youtube: [] },
      videoResearch: null,
      resourceMode: "same",
      resources: [],
      resourcesByAudience: {},
      editorialInstructions: [],
      preferredVocabulary: [],
      searchPlatforms: []
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function initialAssistantRun({ uid, displayName = "", sessionId } = {}) {
  return {
    ...initialRun({ uid, displayName }),
    sessionId: clean(sessionId, 120),
    status: "reviewing",
    phase: "reviewing"
  };
}

function promptResponse(run, message, uiPrompt, extras = {}) {
  const { speechText: _ignoredSpeechText, ...safeExtras } = extras;
  const speechText = message;
  return {
    message,
    speechText,
    phase: run.phase,
    configurationPatch: extras.configurationPatch || {},
    missingFields: missingFields(run.configuration),
    uiPrompt: uiPrompt ? { ...uiPrompt, question: uiPrompt.question || message } : { type: "text", options: [], question: message },
    pendingConfirmation: run.phase === "summary",
    runStatus: run.status,
    runId: run.id,
    configuration: run.configuration,
    ...safeExtras
  };
}

function missingFields(configuration = {}) {
  const fields = [];
  if (!configuration.creationSource) fields.push("creationSource");
  if (configuration.creationSource === "youtube" && !configuration.videoResearch?.videos?.length) fields.push("videoResearch");
  if (!configuration.topic) fields.push("topic");
  if (!configuration.selectedAudiences?.length) fields.push("selectedAudiences");
  if (configuration.selectedAudiences?.some((audience) => !configuration.proposalsByAudience?.[audience])) fields.push("proposalsByAudience");
  if (!configuration.tone) fields.push("tone");
  if (configuration.selectedAudiences?.some((audience) => !configuration.extensionsByAudience?.[audience])) fields.push("extensionsByAudience");
  if (configuration.selectedAudiences?.length && !configuration.searchPlatforms?.length) fields.push("searchPlatforms");
  if (!configuration.selectedAudiences?.length || configuration.selectedAudiences.some((audience) => !configuration.resourcesByAudience?.[audience]?.length)) fields.push("resources");
  return fields;
}

function phasePrompt(run, configurationPatch = {}) {
  const configuration = run.configuration;
    if (run.phase === "creation_source") {
    return promptResponse(run, "Cuéntame el tema de los artículos. También puedes pegar una URL de YouTube y pedirme que la use como base.", {
      type: "text",
      options: []
    }, { configurationPatch });
  }
  if (run.phase === "topic") {
    return promptResponse(run, "¿Sobre qué tema quieres crear los artículos?", {
      type: "text",
      options: [{ id: "recommend_trend", label: "Recomiéndame una tendencia", action: "recommend_trend" }]
    }, { configurationPatch });
  }
  if (run.phase === "youtube_urls") return promptResponse(run, "Pega entre una y cinco URLs públicas de YouTube para analizarlas.", { type: "url_list", options: [] }, { configurationPatch });
  if (run.phase === "video_topic") {
    const options = (configuration.videoResearch?.proposedTopics || []).slice(0, 3).map((value, index) => ({ id: `video-topic-${index + 1}`, label: value, value }));
    return promptResponse(run, "Ya analicé los videos. Elige un tema propuesto o escribe uno diferente.", { type: "single_choice", options }, { configurationPatch, videoResearch: configuration.videoResearch });
  }
  if (run.phase === "audiences") return promptResponse(run, "¿Para qué públicos prepararemos versiones del artículo?", { type: "multi_choice", options: AUDIENCES }, { configurationPatch });
  if (run.phase === "proposals") {
    const audience = configuration.selectedAudiences.find((item) => !configuration.proposalsByAudience[item]) || configuration.selectedAudiences[0];
    const label = AUDIENCES.find((item) => item.id === audience)?.label || audience;
    const options = proposalChoiceOptions(configuration, audience);
    return promptResponse(run, `Elige una propuesta para ${label}. También puedes escribir o dictar otro título.`, { type: "single_choice", options }, { configurationPatch });
  }
  if (run.phase === "tone") return promptResponse(run, "¿Qué tono de redacción prefieres?", { type: "single_choice", options: TONES }, { configurationPatch });
  if (run.phase === "custom_tone") return promptResponse(run, "Describe con tus palabras el tono que deseas.", { type: "text", options: [] }, { configurationPatch });
  if (run.phase === "length_mode") return promptResponse(run, "¿Todos los artículos tendrán la misma extensión?", { type: "single_choice", options: [{ id: "same", label: "La misma para todos" }, { id: "per_audience", label: "Modificar por público" }] }, { configurationPatch });
  if (run.phase === "extension") {
    const audience = configuration.lengthMode === "same" ? "all" : configuration.selectedAudiences.find((item) => !configuration.extensionsByAudience[item]);
    const label = audience === "all" ? "todos los artículos" : (AUDIENCES.find((item) => item.id === audience)?.label || audience);
    return promptResponse(run, `Elige la extensión para ${label}.`, { type: "single_choice", options: EXTENSIONS }, { configurationPatch });
  }
  if (run.phase === "sources") {
    const selectedPlatforms = new Set((configuration.searchPlatforms || []).map(String));
    return promptResponse(run, "Selecciona dónde buscará Marcie. Puedes marcar varias plataformas y Otros sitios fiables para incluir documentos académicos e institucionales fuera de estos portales.", {
      type: "multi_choice",
      options: SEARCH_PLATFORMS.map((platform) => ({ ...platform, selected: selectedPlatforms.has(platform.id) }))
    }, { configurationPatch });
  }
  if (run.phase === "sources_custom") return promptResponse(run, "Escribe o dicta los sitios, instituciones, autores o URLs que deben considerarse.", { type: "text", options: [] }, { configurationPatch });
  if (run.phase === "resource_mode") return promptResponse(run, "¿Usamos los mismos recursos editoriales para todos los públicos?", { type: "single_choice", options: [{ id: "same", label: "Los mismos para todos" }, { id: "per_audience", label: "Elegir por público" }] }, { configurationPatch });
  if (run.phase === "resources") {
    const audience = configuration.resourceMode === "same" ? "all" : configuration.selectedAudiences.find((item) => !configuration.resourcesByAudience[item]?.length);
    const label = audience === "all" ? "todos los artículos" : (AUDIENCES.find((item) => item.id === audience)?.label || audience);
    return promptResponse(run, `Selecciona los recursos editoriales para ${label}.`, { type: "multi_choice", options: RESOURCES }, { configurationPatch });
  }
  if (run.phase === "vocabulary") return promptResponse(run, "¿Deseas añadir palabras al vocabulario editorial?", { type: "single_choice", options: [{ id: "no", label: "No, continuar" }, { id: "yes", label: "Sí, añadir palabras" }] }, { configurationPatch });
  if (run.phase === "vocabulary_terms") return promptResponse(run, "Di o escribe las palabras separadas por comas.", { type: "text", options: [] }, { configurationPatch });
  if (run.phase === "summary") return promptResponse(run, "Revisa la configuración. Puedes corregir cualquier apartado o crear los artículos.", { type: "summary", options: [
    ...(configuration.creationSource === "youtube" ? [{ id: "edit_videos", label: "Videos", action: "edit_videos" }] : []),
    { id: "edit_topic", label: "Tema", action: "edit_topic" },
    { id: "edit_audiences", label: "Públicos", action: "edit_audiences" },
    { id: "edit_tone", label: "Tono", action: "edit_tone" },
    { id: "edit_extension", label: "Extensión", action: "edit_extension" },
    { id: "edit_sources", label: "Fuentes", action: "edit_sources" },
    { id: "edit_resources", label: "Recursos", action: "edit_resources" },
    { id: "edit_vocabulary", label: "Vocabulario", action: "edit_vocabulary" },
    { id: "confirm", label: "Crear artículos", action: "confirm" }
  ] }, { configurationPatch });
  return promptResponse(run, "La configuración está lista para crear los artículos.", { type: "summary", options: [] }, { configurationPatch });
}

function proposalChoiceOptions(configuration = {}, audience = "") {
  const options = (configuration.proposalOptionsByAudience?.[audience] || []).map((item) => ({ id: item.id, label: item.title, value: item.title, kind: item.kind || "hook" }));
  if (configuration.creationSource === "youtube" && audience) {
    options.push({ id: `skip-${audience}`, label: "No crear artículo", value: "No crear artículo", action: "skip_audience" });
  }
  return options;
}

function hasProposalOptions(configuration = {}) {
  return (configuration.selectedAudiences || []).some((audience) => {
    const options = configuration.proposalOptionsByAudience?.[audience];
    return Array.isArray(options) && options.length > 0;
  });
}

function selectedValues(input = {}, options = []) {
  const explicit = Array.isArray(input.selectedValues) ? input.selectedValues.map(String) : [];
  if (explicit.length) return explicit;
  const text = normalizeKey(input.text);
  return options.filter((option) => text.includes(normalizeKey(option.id)) || text.includes(normalizeKey(option.label))).map((option) => option.id);
}

function selectedValue(input = {}, options = []) {
  const explicitValue = clean(input.value, 600);
  const explicitOption = options.find((option) => String(option.id) === explicitValue);
  if (explicitOption) return explicitOption.id;
  const text = normalizeKey(input.text);
  const exactLabel = options.find((option) => normalizeKey(option.label) === text);
  if (exactLabel) return exactLabel.id;
  return selectedValues(input, options)[0] || explicitValue || clean(input.text, 600);
}

function youtubeUrlsFromInput(input = {}) {
  if (Array.isArray(input.urls)) return normalizeYoutubeUrls(input.urls).valid.map((item) => item.url);
  const matches = String(input.text || input.value || "").match(/https:\/\/[^\s,;]+/gi) || [];
  return normalizeYoutubeUrls(matches.map((value) => value.replace(/[)\].!?]+$/, ""))).valid.map((item) => item.url);
}

function looksLikeYoutubeSourceRequest(value = "", detectedUrls = []) {
  if (detectedUrls.length) return true;
  const raw = clean(value, 600);
  const text = normalizeKey(raw);
  if (text === "youtube") return true;
  if (/\b(?:youtube|youtu\.be)\b/i.test(raw)) return true;
  if (/\b(?:sin|no)\s+(?:video|videos|youtube)\b/.test(text)) return false;
  return /\b(?:usa|usar|utiliza|utilizar|toma|tomar|analiza|analizar|basad[oa]s?|base)\b.{0,60}\bvideos?\b/.test(text)
    || /\bvideos?\b.{0,60}\b(?:como\s+base|de\s+base|para\s+crear)\b/.test(text);
}

function isRecoverableYoutubeAnalysisError(error = {}) {
  const code = clean(error?.code || error?.message, 160);
  return ["youtube_analysis_empty", "youtube_analysis_timeout", "youtube_urls_required", "youtube_url_limit"].includes(code)
    || /^youtube_fetch_\d+/.test(code)
    || code === "youtube_public_captions_unavailable"
    || code === "youtube_caption_analysis_unavailable";
}

function youtubeAnalysisFailureMessage(error = {}) {
  const code = clean(error?.code || error?.message, 160);
  if (code === "youtube_analysis_timeout") return "El análisis del video tardó más de lo esperado. Pega otros enlaces o escribe el tema para crear los artículos sin usar video.";
  if (code === "youtube_urls_required") return "No detecté una URL pública válida de YouTube. Pega el enlace completo o escribe el tema para continuar sin video.";
  if (code === "youtube_url_limit") return "Solo puedo analizar hasta cinco videos por sesión. Deja máximo cinco enlaces o escribe el tema para continuar sin video.";
  return "No pude analizar el contenido del video en este intento. Vuelve a probar el enlace o escribe el tema para crear los artículos sin usar video.";
}

function specificationList(configuration = {}) {
  const specifications = [];
  for (const instruction of configuration.editorialInstructions || []) specifications.push(`#instruccion[all] ${instruction}`);
  if (configuration.tone) specifications.push(`#tono[all] ${configuration.tone}`);
  for (const audience of configuration.selectedAudiences || []) {
    if (configuration.proposalsByAudience?.[audience]) specifications.push(`#titulo[${audience}] ${configuration.proposalsByAudience[audience]}`);
    if (configuration.extensionsByAudience?.[audience]) specifications.push(`#extension[${audience}] ${configuration.extensionsByAudience[audience]}`);
    for (const resource of configuration.resourcesByAudience?.[audience] || []) {
      specifications.push(`#concepto[${audience}] ${RESOURCES.find((item) => item.id === resource)?.label || resource}`);
    }
  }
  const selectedPlatforms = (configuration.searchPlatforms || [])
    .map((id) => SEARCH_PLATFORMS.find((platform) => platform.id === id)?.label || id)
    .filter(Boolean);
  if (selectedPlatforms.length) specifications.push(`#plataformas[all] ${selectedPlatforms.join(", ")}`);
  if (configuration.specialSources?.length) specifications.push(`#fuentes[all] ${configuration.specialSources.join("; ")}`);
  return specifications;
}

function titleProposalsForSession(configuration = {}) {
  return Object.fromEntries(Object.entries(configuration.proposalsByAudience || {}).map(([audience, title]) => {
    const options = configuration.proposalOptionsByAudience?.[audience] || [];
    return [audience, {
      hooks: options.filter((item) => item?.kind !== "antihook").map((item) => clean(item.title, 240)).filter(Boolean),
      contrahooks: options.filter((item) => item?.kind === "antihook").map((item) => clean(item.title, 240)).filter(Boolean),
      selected: title,
      topic: configuration.topic
    }];
  }));
}

function sessionRequestFromRun(run) {
  const configuration = run.configuration;
  return {
    mode: "automated",
    title: configuration.topic,
    topic: configuration.topic,
    topicAssignmentMode: "shared",
    audienceTopics: { all: configuration.topic },
    specifications: specificationList(configuration),
    promptProfileId: "default",
    freeMode: false,
    titleProposals: { byAudience: titleProposalsForSession(configuration) },
    searchPlatforms: Array.isArray(configuration.searchPlatforms) && configuration.searchPlatforms.length
      ? [...configuration.searchPlatforms]
      : undefined,
    researchRegion: "MX",
    researchPeriod: "6m",
    editorialMode: "marcie",
    humanizationEnabled: true,
    selectedAudiences: configuration.selectedAudiences,
    editorialProfileId: "marcie",
    editorialProfileVersion: 1,
    editorialProfileSnapshot: { name: "Marcie" },
    preferredVocabulary: configuration.preferredVocabulary,
    sourceInputs: configuration.sourceInputs || { youtube: [] },
    videoResearch: configuration.videoResearch || null
  };
}

function isConfigurationQuestion(run, input = {}) {
  if (input.action || input.selectedValues?.length || input.urls?.length) return false;
  if (input.value && phasePrompt(run).uiPrompt?.options?.some((option) => String(option.id) === String(input.value))) return false;
  const text = clean(input.text || input.value, 4000);
  if (!text) return false;
  const explicitHelp = /\b(?:para qu[eé] (?:sirve|funciona)|qu[eé] significa|qu[eé] es|puedes explicar|me explicas|no entiendo|cu[aá]l es la diferencia|c[oó]mo funciona)\b/i.test(text);
  if (run.phase === "proposals" && !/[?¿]/.test(text) && !explicitHelp) return false;
  const choicePhase = ["audiences", "proposals", "tone", "length_mode", "extension", "sources", "resource_mode", "resources", "vocabulary", "summary"].includes(run.phase);
  return explicitHelp || (choicePhase && /\?|^(?:qu[eé]|c[oó]mo|cu[aá]l|por qu[eé]|d[oó]nde|qui[eé]n)\b/i.test(text));
}

function isBackNavigationInput(run, input = {}) {
  if (input.action || input.selectedValues?.length || input.urls?.length) return false;
  const text = normalizeKey(input.text || input.value);
  return Boolean(text && /^(?:atras|volver|regresar|retroceder|paso anterior|back)$/.test(text));
}

function previousConfigurationPhase(run = {}) {
  const configuration = run.configuration || {};
  const previousByPhase = {
    topic: "creation_source",
    youtube_urls: "creation_source",
    video_topic: "youtube_urls",
    audiences: configuration.creationSource === "youtube"
      ? "video_topic"
      : (run.topicWasPrompted ? "topic" : "creation_source"),
    proposals: "audiences",
    tone: "proposals",
    custom_tone: "tone",
    length_mode: "tone",
    extension: "length_mode",
    sources: "extension",
    sources_custom: "sources",
    resource_mode: configuration.sourceMode === "special" ? "sources_custom" : "sources",
    resources: "resource_mode",
    vocabulary: "resources",
    vocabulary_terms: "vocabulary",
    summary: configuration.preferredVocabulary?.length ? "vocabulary_terms" : "vocabulary"
  };
  return previousByPhase[run.phase] || null;
}

function moveBackConfiguration(run = {}) {
  const previousPhase = previousConfigurationPhase(run);
  if (!previousPhase) {
    return promptResponse(run, "Ya estás en el primer paso. Dime el tema o pega una URL de YouTube para comenzar.", phasePrompt(run), { navigation: "back_boundary" });
  }
  run.phase = previousPhase;
  run.status = "configuring";
  run.lastOptions = [];
  run.updatedAt = new Date().toISOString();
  return promptResponse(run, "Volvamos al paso anterior. Conservé lo que ya habías indicado para que puedas corregirlo.", phasePrompt(run), { navigation: "back" });
}

function configurationEditTarget(input = {}) {
  if (input.action || input.selectedValues?.length || input.urls?.length) return "";
  const text = normalizeKey(input.text || input.value);
  if (!text || !/(?:corrig|camb|modific|edit|revis|ajust|volver a elegir|quiero elegir|prefiero cambiar|no me convence|mejorar)/.test(text)) return "";
  if (/(?:video|youtube|enlace|enlaces)/.test(text)) return "videos";
  if (/(?:public|audien|destinatari|lector|padres|familia|docent|estudiant|coordinador)/.test(text)) return "audiences";
  if (/(?:titulo|titulos|propuesta|propuestas|enfoque|encabezado)/.test(text)) return "proposals";
  if (/(?:tono|estilo|redaccion|voz|forma de escribir)/.test(text)) return "tone";
  if (/(?:extension|longitud|cantidad de palabras|numero de palabras)/.test(text)) return "extension";
  if (/(?:fuente|fuentes|plataforma|plataformas|busqueda|busquedas|sitio|sitios|academ|evidencia)/.test(text)) return "sources";
  if (/(?:recurso|recursos|apa|cita|seo|lista|analogia|ejemplo|llamado a la accion)/.test(text)) return "resources";
  if (/(?:vocabulario|palabra|palabras|termino|terminos)/.test(text)) return "vocabulary";
  return "";
}

function editConfigurationSection(run = {}, target = "") {
  const configuration = run.configuration || {};
  if (target === "videos") run.phase = "youtube_urls";
  if (target === "topic") run.phase = "topic";
  if (target === "audiences") {
    configuration.selectedAudiences = [];
    configuration.proposalsByAudience = {};
    configuration.proposalOptionsByAudience = {};
    configuration.extensionsByAudience = {};
    configuration.resourcesByAudience = {};
    run.phase = "audiences";
  }
  if (target === "proposals") {
    configuration.proposalsByAudience = {};
    configuration.proposalOptionsByAudience = {};
    run.phase = "proposals";
  }
  if (target === "tone") run.phase = "tone";
  if (target === "extension") {
    configuration.extensionsByAudience = {};
    run.phase = "length_mode";
  }
  if (target === "sources") run.phase = "sources";
  if (target === "resources") {
    configuration.resources = [];
    configuration.resourcesByAudience = {};
    run.phase = "resource_mode";
  }
  if (target === "vocabulary") run.phase = "vocabulary";
  run.status = "configuring";
  run.lastOptions = [];
  run.updatedAt = new Date().toISOString();
  return phasePrompt(run);
}

function conversationContext(run = {}) {
  const configuration = run.configuration || {};
  return {
    phase: run.phase,
    topic: configuration.topic,
    audiences: configuration.selectedAudiences,
    tone: configuration.tone,
    extensionsByAudience: configuration.extensionsByAudience,
    sourceMode: configuration.sourceMode,
    searchPlatforms: configuration.searchPlatforms,
    resourcesByAudience: configuration.resourcesByAudience,
    editorialInstructions: configuration.editorialInstructions,
    video: compactVideoContext(configuration.videoResearch)
  };
}

async function answerConfigurationQuestion(run, input, context) {
  const currentPrompt = phasePrompt(run);
  let answer = "Claro. Puedo explicártelo sin cambiar ninguna opción de la configuración.";
  if (typeof context.generateText === "function") {
    const prompt = `Eres Marcie, una agente editorial conversacional en español neutro latinoamericano. El usuario interrumpió la configuración para hacer una pregunta. Respóndela con un registro profesional, sereno, cordial y concreto en 2 a 4 oraciones. Usa español estándar; evita coloquialismos, muletillas, diminutivos, entusiasmo exagerado y expresiones como "súper", "genial", "va" o "claro que sí". Puedes explicar para qué sirve una opción, comparar alternativas o responder conocimiento general. No selecciones nada por el usuario, no avances el formulario y no inventes datos. Después de responder, retoma con naturalidad la pregunta pendiente.
PREGUNTA DEL USUARIO: ${clean(input.text || input.value, 4000)}
PREGUNTA PENDIENTE: ${currentPrompt.message}
OPCIONES VISIBLES: ${JSON.stringify(currentPrompt.uiPrompt?.options || [])}
CONTEXTO EDITORIAL: ${JSON.stringify(conversationContext(run)).slice(0, 16000)}
Devuelve SOLO JSON: {"answer":"respuesta completa que termina retomando la pregunta pendiente","speechText":"versión natural para decir en voz alta"}`;
    try {
      const parsed = parseJson(await context.generateText({ model: DEFAULT_TEXT_MODEL, prompt, json: true, thinkingLevel: "MEDIUM" }), {});
      answer = clean(parsed.answer, 2400) || answer;
      return promptResponse(run, answer, currentPrompt.uiPrompt, {
        speechText: clean(parsed.speechText, 2400) || answer,
        conversationalInterruption: true
      });
    } catch (_) {}
  }
  const message = `${answer} ${currentPrompt.message}`;
  return promptResponse(run, message, currentPrompt.uiPrompt, { speechText: message, conversationalInterruption: true });
}

async function personalizeAgentResponse(run, input, response, context, previousPhase) {
  if (typeof context.generateText !== "function" || response.conversationalInterruption) return response;
  const prompt = `Eres Marcie, una agente editorial profesional, serena y cordial en español neutro latinoamericano. Acabas de recibir una respuesta del usuario durante la configuración de artículos. Redacta una transición breve y variada con español estándar: resume en no más de 12 palabras lo que entendiste y formula la siguiente pregunta indicada. Evita coloquialismos, muletillas, diminutivos, entusiasmo exagerado y expresiones como "súper", "genial", "va", "listo" o "perfecto". Nunca repitas literalmente la instrucción completa, una URL ni una lista larga del usuario. No cambies decisiones, opciones, cifras ni el estado; no respondas por el usuario. Si existe un expediente de video, menciona detalles reales solo cuando ayuden a demostrar que lo comprendiste.
FASE ANTERIOR: ${previousPhase}
RESPUESTA DEL USUARIO: ${clean(input.text || input.value || (input.selectedValues || []).join(", "), 3000)}
MENSAJE BASE OBLIGATORIO: ${response.message}
OPCIONES VISIBLES: ${JSON.stringify(response.uiPrompt?.options || [])}
CONTEXTO EDITORIAL: ${JSON.stringify(conversationContext(run)).slice(0, 16000)}
Devuelve SOLO JSON: {"message":"texto visible","speechText":"versión conversacional para voz"}`;
  try {
    const parsed = parseJson(await context.generateText({ model: DEFAULT_TEXT_MODEL, prompt, json: true, thinkingLevel: "LOW" }), {});
    const message = clean(parsed.message, 2400);
    const speechText = clean(parsed.speechText, 2400);
    return message ? { ...response, message, speechText: speechText || message } : response;
  } catch (_) {
    return response;
  }
}

async function processAgentTurn(run, input, context) {
  if (run.status === "configuring" && isBackNavigationInput(run, input)) {
    return moveBackConfiguration(run);
  }
  if (run.status === "configuring") {
    const editTarget = configurationEditTarget(input);
    if (editTarget) return editConfigurationSection(run, editTarget);
  }
  if (run.status === "configuring" && isConfigurationQuestion(run, input)) {
    return answerConfigurationQuestion(run, input, context);
  }
  const response = await advanceRun(run, input, context);
  return response;
}

async function advanceRun(run, input, context) {
  const configuration = run.configuration;
  const patch = {};
  if (run.phase === "summary" && /^edit_/.test(String(input.action || ""))) {
    const target = String(input.action).slice(5);
    return editConfigurationSection(run, target);
  }
  if (run.sessionId && ["completed", "reviewing"].includes(String(run.status || run.phase))) {
    run.phase = "reviewing";
    run.status = "reviewing";
    const response = await handlePostProductionTurn(run, input, context);
    run.updatedAt = new Date().toISOString();
    return response;
  }
  if (run.phase === "proposals" && configuration.videoResearch?.videos?.length && looksLikeVideoEditorialDirection(configuration.topic) && !hasProposalOptions(configuration)) {
    const staleInstruction = configuration.topic;
    const interpretation = await interpretVideoTopicTurn(run, { text: staleInstruction }, context);
    configuration.topic = interpretation.topic || bestVideoTopic(configuration, staleInstruction);
    configuration.editorialInstructions = uniqueStrings([...(configuration.editorialInstructions || []), staleInstruction], 20);
    if (!configuration.selectedAudiences?.length && interpretation.audiences?.length) configuration.selectedAudiences = interpretation.audiences;
    configuration.proposalsByAudience = {};
    configuration.proposalOptionsByAudience = await generateProposalOptions({
      topic: configuration.topic,
      audiences: configuration.selectedAudiences,
      generateText: context.generateText,
      videoResearch: configuration.videoResearch,
      editorialInstructions: configuration.editorialInstructions
    });
    Object.assign(patch, {
      topic: configuration.topic,
      editorialInstructions: [...configuration.editorialInstructions],
      proposalOptionsByAudience: configuration.proposalOptionsByAudience
    });
    return phasePrompt(run, patch);
  }
  if (run.phase === "creation_source") {
    const detectedUrls = youtubeUrlsFromInput(input);
    const rawValue = clean(input.text || input.value, 600);
    const asksForVideo = looksLikeYoutubeSourceRequest(rawValue, detectedUrls);
    const resolvedSource = asksForVideo ? "youtube" : (rawValue ? "topic" : "");
    if (!["topic", "youtube"].includes(resolvedSource)) return phasePrompt(run);
    configuration.creationSource = resolvedSource;
    patch.creationSource = resolvedSource;
    run.phase = resolvedSource === "youtube" ? "youtube_urls" : (rawValue === "topic" ? "topic" : "audiences");
    if (run.phase === "topic") run.topicWasPrompted = true;
    if (resolvedSource === "youtube") {
      const videoObjective = videoObjectiveFromInput(input);
      if (videoObjective) {
        configuration.videoObjective = videoObjective;
        patch.videoObjective = videoObjective;
      }
    }
    if (resolvedSource === "topic" && rawValue !== "topic") {
      configuration.topic = rawValue;
      patch.topic = rawValue;
    }
    if (detectedUrls.length) {
      const videoObjective = videoObjectiveFromInput(input);
      let analysis;
      try {
        analysis = await context.analyzeYoutubeVideos({ urls: detectedUrls, objective: videoObjective || configuration.topic, language: "es-MX" });
      } catch (error) {
        if (!isRecoverableYoutubeAnalysisError(error)) throw error;
        run.phase = "youtube_urls";
        run.status = "configuring";
        return promptResponse(run, youtubeAnalysisFailureMessage(error), { type: "url_list", options: [] }, {
          configurationPatch: patch,
          rejectedVideos: Array.isArray(error?.rejectedVideos) ? error.rejectedVideos.slice(0, 5) : []
        });
      }
      analysis.objective = videoObjective || configuration.topic || "";
      configuration.videoObjective = analysis.objective;
      configuration.sourceInputs = { youtube: analysis.videos.map((video) => ({ videoId: video.videoId, url: video.url })) };
      configuration.videoResearch = analysis;
      patch.videoObjective = configuration.videoObjective;
      patch.sourceInputs = configuration.sourceInputs;
      patch.videoResearch = analysis;
      run.phase = "video_topic";
    }
  } else if (run.phase === "youtube_urls") {
    const rawText = clean(input.text || input.value, 600);
    const urls = Array.isArray(input.urls) ? input.urls : String(input.text || input.value || "").split(/[\n,;]+/);
    const detectedUrls = youtubeUrlsFromInput(input);
    if (!detectedUrls.length && rawText && !looksLikeYoutubeSourceRequest(rawText, [])) {
      configuration.creationSource = "topic";
      configuration.topic = rawText;
      configuration.sourceInputs = { youtube: [] };
      configuration.videoResearch = null;
      patch.creationSource = "topic";
      patch.topic = rawText;
      patch.sourceInputs = configuration.sourceInputs;
      patch.videoResearch = null;
      run.phase = "audiences";
    } else if (!detectedUrls.length) {
      return promptResponse(run, "No detecté una URL pública válida de YouTube. Pega el enlace completo o escribe el tema para continuar sin video.", { type: "url_list", options: [] }, { configurationPatch: patch });
    } else {
      let analysis;
      try {
        analysis = await context.analyzeYoutubeVideos({ urls, objective: configuration.videoObjective || configuration.topic, language: "es-MX" });
      } catch (error) {
        if (!isRecoverableYoutubeAnalysisError(error)) throw error;
        return promptResponse(run, youtubeAnalysisFailureMessage(error), { type: "url_list", options: [] }, {
          configurationPatch: patch,
          rejectedVideos: Array.isArray(error?.rejectedVideos) ? error.rejectedVideos.slice(0, 5) : []
        });
      }
    analysis.objective = configuration.videoObjective || configuration.topic || "";
    configuration.sourceInputs = { youtube: analysis.videos.map((video) => ({ videoId: video.videoId, url: video.url })) };
    configuration.videoResearch = analysis;
    patch.sourceInputs = configuration.sourceInputs;
    patch.videoResearch = analysis;
    run.phase = "video_topic";
    }
  } else if (run.phase === "video_topic") {
    const options = (configuration.videoResearch?.proposedTopics || []).slice(0, 3).map((value, index) => ({ id: `video-topic-${index + 1}`, label: value, value }));
    const optionId = selectedValues(input, options)[0] || clean(input.value, 120);
    const option = options.find((item) => item.id === optionId);
    const interpretation = option
      ? { topic: option.value, audiences: [], editorialInstruction: "" }
      : await interpretVideoTopicTurn(run, input, context);
    const topic = clean(interpretation.topic, 600);
    if (!topic) return phasePrompt(run);
    configuration.topic = topic;
    patch.topic = topic;
    if (interpretation.editorialInstruction) {
      configuration.editorialInstructions = uniqueStrings([...(configuration.editorialInstructions || []), interpretation.editorialInstruction], 20);
      patch.editorialInstructions = [...configuration.editorialInstructions];
    }
    if (interpretation.audiences?.length) {
      configuration.selectedAudiences = interpretation.audiences;
      patch.selectedAudiences = [...interpretation.audiences];
      configuration.proposalOptionsByAudience = await generateProposalOptions({
        topic,
        audiences: interpretation.audiences,
        generateText: context.generateText,
        videoResearch: configuration.videoResearch,
        editorialInstructions: configuration.editorialInstructions
      });
      run.phase = "proposals";
    } else {
      run.phase = "audiences";
    }
  } else if (run.phase === "topic") {
    if (input.action === "recommend_trend" || selectedValues(input, [{ id: "recommend_trend", label: "Recomiéndame una tendencia" }]).length) {
      const trends = await listTrendingTopics(context.db, 3);
      run.lastOptions = trends.map((item) => ({ id: `trend:${item.id}`, label: item.topic, value: item.topic, description: item.summary }));
      return promptResponse(run, trends.length ? "Estas son las tendencias con mejor oportunidad editorial." : "Todavía no hay tendencias disponibles. Dime el tema que deseas trabajar.", { type: trends.length ? "single_choice" : "text", options: run.lastOptions });
    }
    const chosenTrend = (run.lastOptions || []).find((option) => selectedValues(input, run.lastOptions).includes(option.id));
    const topic = clean(chosenTrend?.value || input.text || input.value, 600);
    if (!topic) return phasePrompt(run);
    configuration.topic = topic; patch.topic = topic; run.topicWasPrompted = true; run.phase = "audiences";
  } else if (run.phase === "audiences") {
    const audiences = selectedValues(input, AUDIENCES).filter((value) => AUDIENCES.some((item) => item.id === value));
    if (!audiences.length) return phasePrompt(run);
    configuration.selectedAudiences = audiences;
    configuration.proposalsByAudience = {};
    configuration.proposalOptionsByAudience = {};
    configuration.extensionsByAudience = {};
    configuration.resourcesByAudience = {};
    patch.selectedAudiences = audiences;
    patch.proposalsByAudience = {};
    patch.proposalOptionsByAudience = {};
    configuration.proposalOptionsByAudience = await generateProposalOptions({ topic: configuration.topic, audiences, generateText: context.generateText, videoResearch: configuration.videoResearch, editorialInstructions: configuration.editorialInstructions });
    run.phase = "proposals";
  } else if (run.phase === "proposals") {
    const audience = configuration.selectedAudiences.find((item) => !configuration.proposalsByAudience[item]);
    const options = proposalChoiceOptions(configuration, audience);
    const optionId = selectedValue(input, options);
    const option = options.find((item) => item.id === optionId);
    if (input.action === "skip_audience" || option?.action === "skip_audience") {
      configuration.selectedAudiences = configuration.selectedAudiences.filter((item) => item !== audience);
      delete configuration.proposalsByAudience[audience];
      delete configuration.proposalOptionsByAudience[audience];
      delete configuration.extensionsByAudience[audience];
      delete configuration.resourcesByAudience[audience];
      patch.selectedAudiences = [...configuration.selectedAudiences];
      patch.proposalsByAudience = { ...configuration.proposalsByAudience };
      patch.proposalOptionsByAudience = { ...configuration.proposalOptionsByAudience };
      if (!configuration.selectedAudiences.length) run.phase = "audiences";
      else if (!configuration.selectedAudiences.some((item) => !configuration.proposalsByAudience[item])) run.phase = "tone";
      run.updatedAt = new Date().toISOString();
      return phasePrompt(run, patch);
    }
    const title = clean(option?.value || input.text || input.value, 240);
    if (!title) return phasePrompt(run);
    configuration.proposalsByAudience[audience] = title;
    patch.proposalsByAudience = { [audience]: title };
    if (!configuration.selectedAudiences.some((item) => !configuration.proposalsByAudience[item])) run.phase = "tone";
  } else if (run.phase === "tone") {
    const toneId = selectedValue(input, TONES);
    if (toneId === "custom") run.phase = "custom_tone";
    else {
      const tone = TONES.find((item) => item.id === toneId)?.value || clean(input.text, 180);
      if (!tone) return phasePrompt(run);
      configuration.tone = tone; patch.tone = tone; run.phase = "length_mode";
    }
  } else if (run.phase === "custom_tone") {
    const tone = clean(input.text || input.value, 300);
    if (!tone) return phasePrompt(run);
    configuration.tone = tone; patch.tone = tone; run.phase = "length_mode";
  } else if (run.phase === "length_mode") {
    const mode = selectedValue(input, [{ id: "same", label: "La misma para todos" }, { id: "per_audience", label: "Modificar por público" }]);
    if (!['same', 'per_audience'].includes(mode)) return phasePrompt(run);
    configuration.lengthMode = mode; patch.lengthMode = mode; run.phase = "extension";
  } else if (run.phase === "extension") {
    const extensionId = selectedValue(input, EXTENSIONS);
    const extension = EXTENSIONS.find((item) => item.id === extensionId)?.value || clean(input.text, 240);
    if (!extension) return phasePrompt(run);
    if (configuration.lengthMode === "same") {
      configuration.selectedAudiences.forEach((audience) => { configuration.extensionsByAudience[audience] = extension; });
      patch.extensionsByAudience = { ...configuration.extensionsByAudience };
      run.phase = "sources";
    } else {
      const audience = configuration.selectedAudiences.find((item) => !configuration.extensionsByAudience[item]);
      configuration.extensionsByAudience[audience] = extension;
      patch.extensionsByAudience = { [audience]: extension };
      if (!configuration.selectedAudiences.some((item) => !configuration.extensionsByAudience[item])) run.phase = "sources";
    }
  } else if (run.phase === "sources") {
    const legacyMode = selectedValue(input, [{ id: "all", label: "Todas las fuentes fiables" }, { id: "special", label: "Añadir fuentes especiales" }]);
    const selectedPlatforms = selectedValues(input, SEARCH_PLATFORMS)
      .filter((value) => SEARCH_PLATFORMS.some((platform) => platform.id === value));
    if (!selectedPlatforms.length && legacyMode === "all") selectedPlatforms.push(...SEARCH_PLATFORMS.map((platform) => platform.id));
    if (legacyMode === "special" && !selectedPlatforms.length) {
      configuration.sourceMode = "special";
      patch.sourceMode = "special";
      run.phase = "sources_custom";
      return phasePrompt(run, patch);
    }
    if (!selectedPlatforms.length) return phasePrompt(run);
    configuration.searchPlatforms = [...new Set(selectedPlatforms)];
    configuration.specialSources = [];
    configuration.sourceMode = configuration.searchPlatforms.length === SEARCH_PLATFORMS.length ? "all" : "selected";
    patch.searchPlatforms = [...configuration.searchPlatforms];
    patch.specialSources = [];
    patch.sourceMode = configuration.sourceMode;
    run.phase = "resource_mode";
  } else if (run.phase === "sources_custom") {
    const sources = uniqueStrings(input.text || input.value, 30);
    if (!sources.length) return phasePrompt(run);
    configuration.specialSources = sources; patch.specialSources = sources; run.phase = "resource_mode";
  } else if (run.phase === "resource_mode") {
    const mode = selectedValue(input, [{ id: "same", label: "Los mismos para todos" }, { id: "per_audience", label: "Elegir por público" }]);
    if (!["same", "per_audience"].includes(mode)) return phasePrompt(run);
    configuration.resourceMode = mode; patch.resourceMode = mode; run.phase = "resources";
  } else if (run.phase === "resources") {
    const resources = selectedValues(input, RESOURCES).filter((value) => RESOURCES.some((item) => item.id === value));
    if (!resources.length) return phasePrompt(run);
    if (configuration.resourceMode === "same") {
      configuration.selectedAudiences.forEach((audience) => { configuration.resourcesByAudience[audience] = [...resources]; });
      configuration.resources = resources;
      patch.resources = resources;
      patch.resourcesByAudience = { ...configuration.resourcesByAudience };
      run.phase = "vocabulary";
    } else {
      const audience = configuration.selectedAudiences.find((item) => !configuration.resourcesByAudience[item]?.length);
      configuration.resourcesByAudience[audience] = resources;
      configuration.resources = uniqueStrings([...configuration.resources, ...resources], RESOURCES.length);
      patch.resources = [...configuration.resources];
      patch.resourcesByAudience = { [audience]: resources };
      if (!configuration.selectedAudiences.some((item) => !configuration.resourcesByAudience[item]?.length)) run.phase = "vocabulary";
    }
  } else if (run.phase === "vocabulary") {
    const answer = selectedValue(input, [{ id: "no", label: "No, continuar" }, { id: "yes", label: "Sí, añadir palabras" }]);
    if (answer === "yes") run.phase = "vocabulary_terms";
    else if (answer === "no") run.phase = "summary";
    else return phasePrompt(run);
  } else if (run.phase === "vocabulary_terms") {
    const incoming = uniqueStrings(input.text || input.value, 100);
    if (!incoming.length) return phasePrompt(run);
    const before = configuration.preferredVocabulary || [];
    const merged = uniqueStrings([...before, ...incoming], 250);
    const existingKeys = new Set(before.map(normalizeKey));
    configuration.preferredVocabulary = merged;
    patch.preferredVocabulary = merged;
    patch.vocabularyResult = { added: incoming.filter((item) => !existingKeys.has(normalizeKey(item))), existing: incoming.filter((item) => existingKeys.has(normalizeKey(item))) };
    run.phase = "summary";
  } else if (run.phase === "summary") {
    if (input.action !== "confirm" && !selectedValues(input, [{ id: "confirm", label: "Crear artículos" }]).length) return phasePrompt(run);
    run.phase = "ready"; run.status = "ready";
  }
  run.updatedAt = new Date().toISOString();
  return phasePrompt(run, patch);
}

async function saveRun(context, run, userInput, response) {
  const ref = context.db.collection(RUNS_COLLECTION).doc(run.id);
  await ref.set({ ...run, configuration: run.configuration, updatedAt: new Date().toISOString() }, { merge: true });
  const messages = ref.collection("messages");
  if (clean(userInput?.text || userInput?.value) || userInput?.selectedValues?.length || userInput?.action) {
    await messages.add({ role: "user", text: clean(userInput.text || userInput.value || userInput.action, 12000), selectedValues: Array.isArray(userInput.selectedValues) ? userInput.selectedValues.map(String) : [], createdAt: new Date().toISOString() });
  }
  await messages.add({
    role: "assistant",
    text: response.message,
    messageText: response.message,
    speechText: response.speechText || response.message,
    phase: response.phase,
    uiPrompt: response.uiPrompt,
    createdAt: new Date().toISOString()
  });
}

async function readRun(context, runId) {
  const id = clean(runId, 160);
  if (!id) return null;
  const snapshot = await context.db.collection(RUNS_COLLECTION).doc(id).get();
  if (!snapshot.exists) return null;
  const run = { id: snapshot.id, ...(snapshot.data() || {}) };
  if (String(run.ownerId || "") !== context.uid) throw Object.assign(new Error("marcie_agent_run_forbidden"), { status: 403 });
  return run;
}

async function readSessionHistory(context, sessionId) {
  const { session } = await loadOwnedSession(context.db, context.uid, sessionId);
  const snapshot = await context.db.collection(RUNS_COLLECTION).where("sessionId", "==", clean(sessionId, 120)).get();
  const runs = [];
  snapshot.forEach((doc) => {
    const data = doc.data() || {};
    if (String(data.ownerId || "") === context.uid) runs.push({ id: doc.id, ...data });
  });
  runs.sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
  const run = runs[0];
  if (!run) return { runId: "", messages: [], pendingChange: null };
  const messageSnapshot = await context.db.collection(RUNS_COLLECTION).doc(run.id).collection("messages").orderBy("createdAt", "desc").limit(100).get();
  const messages = [];
  messageSnapshot.forEach((doc) => {
    const data = doc.data() || {};
    const role = data.role === "user" ? "user" : "assistant";
    const text = clean(data.text, 12000);
    if (text) messages.push({ id: doc.id, role, text, createdAt: clean(data.createdAt, 80) });
  });
  messages.reverse();
  const audience = clean(run.pendingChange?.audience || session.audience || session.selectedAudiences?.[0], 80);
  const currentArticle = session.articlesByAudience?.[audience] || session.article || {};
  return { runId: run.id, messages, pendingChange: pendingChangeForUi(run.pendingChange, currentArticle) };
}

function fallbackArticleReview(article = {}) {
  const blocks = Array.isArray(article.blocks) ? article.blocks : [];
  const sources = Array.isArray(article.sources) ? article.sources : (Array.isArray(article.researchSources) ? article.researchSources : []);
  const body = blocks.map((block) => clean(block?.text || block?.content || block?.html, 20000)).join(" ");
  const wordCount = body ? body.split(/\s+/).filter(Boolean).length : 0;
  const findings = [];
  if (!clean(article.title, 300)) findings.push("El artículo no tiene un título definido.");
  if (!blocks.length || wordCount < 120) findings.push("El contenido es demasiado breve para evaluar con suficiente profundidad.");
  if (!sources.length) findings.push("No hay fuentes vinculadas al artículo para comprobar sus afirmaciones.");
  if (!clean(article.subtitle, 500)) findings.push("Conviene añadir un subtítulo que precise el enfoque editorial.");
  if (!findings.length) findings.push(`La estructura contiene ${blocks.length} bloques, aproximadamente ${wordCount} palabras y ${sources.length} fuentes vinculadas.`);
  return {
    article,
    findings,
    changes: [],
    summary: `Marcie no pudo completar el análisis profundo en este momento, pero la comprobación estructural encontró lo siguiente:\n${findings.map((item) => `• ${item}`).join("\n")}\nPuedes volver a intentarlo sin perder el artículo.`,
    fallbackPreview: true,
    modelUnavailable: false
  };
}

function isTargetedRevisionRequest(instruction = "") {
  return /\b(?:este|esta|ese|esa|el|la|un|una|primer|segundo|tercer|cuarto|quinto|[0-9]+|[uú]ltimo)\s+(?:p[aá]rrafo|bloque|secci[oó]n|fragmento|oraci[oó]n|frase|parte|afirmaci[oó]n)\b|\b(?:p[aá]rrafo|bloque|secci[oó]n|fragmento)\s+(?:[0-9]+|sobre|donde|que|de|del)\b/i.test(String(instruction || ""));
}

async function reviewWithGemini({ article, instruction, generateText }) {
  if (typeof generateText !== "function") return { article, findings: ["El servicio de revisión no está disponible."] };
  const targeted = isTargetedRevisionRequest(instruction);
  if (targeted) {
    const blocks = Array.isArray(article.blocks) ? article.blocks : [];
    const prompt = `Eres editor de español neutro latinoamericano. Corrige SOLO el fragmento solicitado; no reescribas ni devuelvas el artículo completo. No cambies hechos, citas, IDs, fuentes, imágenes ni metadatos. Si el problema requiere evidencia nueva, explica que no puedes resolverlo con una corrección de estilo.
INSTRUCCIÓN: ${clean(instruction, 4000)}
TÍTULO: ${clean(article.title, 300)}
BLOQUES: ${JSON.stringify(blocks.map((block, index) => ({ index, id: block?.id || "", type: block?.type || "", text: block?.text || "" }))).slice(0, 55000)}
Devuelve SOLO JSON: {"patches":[{"index":0,"text":"texto completo del único bloque corregido","rationale":"motivo"}],"summary":"resumen breve","findings":[]}. Incluye como máximo un parche y ningún campo article.`;
    try {
      const result = parseJson(await generateText({ model: DEFAULT_TEXT_MODEL, prompt, json: true, thinkingLevel: "LOW" }), {});
      const patch = Array.isArray(result.patches) ? result.patches[0] : null;
      const index = Number(patch?.index);
      const previous = blocks[index];
      const nextText = String(patch?.text || "").trim();
      if (!Number.isInteger(index) || !previous || !String(previous.text || "").trim() || !nextText || nextText === String(previous.text).trim()) {
        return { article, findings: ["No pude identificar un cambio puntual fiable."], modelUnavailable: true };
      }
      const previousMarkers = new Set(bibliography.markerIds(article, previous.text));
      const newMarkers = bibliography.markerIds(article, nextText).filter((id) => !previousMarkers.has(id));
      if (newMarkers.length) throw new Error("La revisión intentó añadir citas que no estaban en el fragmento original.");
      const revised = { ...article, blocks: blocks.map((block, position) => position === index ? { ...block, text: nextText } : block) };
      const existingMissing = new Set(bibliography.integrity(article).missing);
      if (bibliography.integrity(revised).missing.some((id) => !existingMissing.has(id))) throw new Error("La revisión introdujo una cita sin documento asociado.");
      return {
        article: revised,
        findings: Array.isArray(result.findings) ? result.findings : [],
        summary: clean(result.summary, 1200) || "Preparé una corrección puntual.",
        changes: deriveArticleChanges(article, revised, [{ scope: "paragraph", blockIndex: index, label: `Bloque ${index + 1}`, rationale: clean(patch.rationale, 600) }]),
        targetedPreview: true
      };
    } catch (error) {
      logModelFallback("review_targeted_article", error);
      return { article, findings: ["No pude preparar una corrección puntual segura."], modelUnavailable: true };
    }
  }
  const prompt = `Revisa el artículo educativo según esta instrucción: ${instruction || "claridad, rigor, evidencia y adecuación al público"}. Decide por el significado de la petición si debes modificar una parte concreta, varios bloques o el artículo completo. Si la petición señala un párrafo, sección o fragmento, conserva sin cambios todos los demás bloques. No inventes fuentes ni afirmaciones. La bibliografía se muestra por separado desde sources: nunca agregues un bloque de Referencias bibliográficas, bibliografía ni referencias APA dentro de blocks. Si corriges metadatos de una fuente existente, conserva su id, DOI y URL en sources. Devuelve el artículo completo revisado y describe cada cambio propuesto con el índice real del bloque, el texto anterior y el nuevo; estos cambios requerirán consentimiento humano y todavía no se aplicarán. Devuelve SOLO JSON con {"article":{...},"findings":[""],"summary":"explicación útil y concreta para el usuario","changes":[{"scope":"paragraph|section|title|full_article","blockIndex":0,"label":"descripción concreta","before":"texto exacto anterior","after":"texto exacto propuesto","rationale":"motivo"}]}. ARTÍCULO: ${JSON.stringify(article).slice(0, 80000)}`;
  try {
    const result = parseJson(await generateText({ model: DEFAULT_TEXT_MODEL, prompt, json: true, thinkingLevel: "MEDIUM" }), { article, findings: [] });
    result.article = normalizeArticleRevision(article, result.article && typeof result.article === "object" ? result.article : article);
    result.changes = deriveArticleChanges(article, result.article, Array.isArray(result.changes) ? result.changes : []);
    return result;
  } catch (error) {
    logModelFallback("review_article", error);
    return fallbackArticleReview(article);
  }
}

function fallbackPostProductionPlan({ text, requestedAudience, availableAudiences }) {
  const normalized = normalizeKey(text);
  const audienceAliases = [
    ["educators", /\b(docente|docentes|maestro|maestros|profesor|profesores)\b/],
    ["students", /\b(estudiante|estudiantes|alumno|alumnos)\b/],
    ["parents", /\b(padre|padres|madre|madres|familia|familias)\b/],
    ["coordinators", /\b(coordinador|coordinadores|directivo|directivos)\b/]
  ];
  const mentionedAudience = audienceAliases.find(([id, pattern]) => availableAudiences.includes(id) && pattern.test(normalized))?.[0];
  let intent = "chat";
  if (/\b(resuelve|resolver|repara|reparar|corrige|corregir)\b/.test(normalized) && /\b(evidencia|respaldo|afirmacion|cita|control de calidad)\b/.test(normalized)) intent = "resolve_evidence";
  else if (/\b(corrige|corregir|reescribe|reescribir|cambia|cambiar|acorta|amplia|modifica|editar)\b/.test(normalized)) intent = "revise";
  else if (/\b(analiza|analizar|evalua|evaluar|revision|revisar)\b/.test(normalized)) intent = "analyze";
  else if (/\b(verifica|verificar|comprueba|comprobar|afirmaciones|referencias)\b/.test(normalized)) intent = "verify";
  else if (/\b(investiga|investigar|fuentes|bibliografia)\b/.test(normalized)) intent = "research";
  else if (/\b(wordpress|borrador)\b/.test(normalized)) intent = "wordpress";
  return { intent, audience: mentionedAudience || (availableAudiences.includes(requestedAudience) ? requestedAudience : availableAudiences[0]) || "educators", instruction: text };
}

async function planPostProductionTurn({ text, requestedAudience, session, generateText }) {
  const availableAudiences = Object.keys(session.articlesByAudience || {}).filter(Boolean);
  if (session.article && session.audience && !availableAudiences.includes(session.audience)) availableAudiences.push(session.audience);
  if (typeof generateText !== "function") {
    return { intent: "analyze", audience: requestedAudience || availableAudiences[0] || "educators", instruction: text };
  }
  const prompt = `Eres Marcie, agente editorial de una sesión que ya contiene artículos. Interpreta libremente la petición del usuario; NO inicies ni continúes el cuestionario de creación. Decide qué capacidad necesita y qué público menciona.
INTENCIONES PERMITIDAS:
- analyze: evaluar o analizar el artículo sin cambiarlo.
- revise: corregir, reescribir, acortar, ampliar o cambiar el artículo; debe producir vista previa.
- resolve_evidence: resolver una afirmación marcada sin respaldo o contradicha en el control de calidad; debe buscar respaldo documental y preparar vista previa.
- verify: comprobar afirmaciones, referencias o evidencia.
- research: buscar más fuentes.
- wordpress: comprobar si puede prepararse como borrador.
- chat: responder preguntas, explicar el artículo o asesorar sin modificarlo.
PÚBLICOS DISPONIBLES: ${JSON.stringify(availableAudiences)}. Equivalencias: educators=docentes, students=estudiantes, parents=padres y familias, coordinators=coordinadores.
PÚBLICO ACTIVO: ${clean(requestedAudience, 80)}
SESIÓN: ${JSON.stringify(publicSession(session)).slice(0, 12000)}
PETICIÓN: ${clean(text, 4000)}
Devuelve SOLO JSON: {"intent":"analyze|revise|resolve_evidence|verify|research|wordpress|chat","audience":"id disponible","instruction":"instrucción completa","answer":"respuesta directa solo si intent es chat"}`;
  let parsed;
  try {
    parsed = parseJson(await generateText({ model: DEFAULT_TEXT_MODEL, prompt, json: true, thinkingLevel: "MEDIUM" }), {});
  } catch (error) {
    logModelFallback("plan_postproduction", error);
    return fallbackPostProductionPlan({ text, requestedAudience, availableAudiences });
  }
  const allowedIntents = new Set(["analyze", "revise", "resolve_evidence", "verify", "research", "wordpress", "chat"]);
  const audience = availableAudiences.includes(parsed.audience) ? parsed.audience : (availableAudiences.includes(requestedAudience) ? requestedAudience : availableAudiences[0]);
  return {
    intent: allowedIntents.has(parsed.intent) ? parsed.intent : "chat",
    audience: audience || requestedAudience || "educators",
    instruction: clean(parsed.instruction || text, 4000),
    answer: clean(parsed.answer, 4000)
  };
}

async function answerFromArticle({ text, session, audience, article, generateText, plannedAnswer = "" }) {
  if (plannedAnswer) return plannedAnswer;
  if (typeof generateText !== "function") return "Puedo analizar el artículo, verificar sus afirmaciones, buscar fuentes o preparar una revisión cuando el servicio editorial esté disponible.";
  const prompt = `Eres Marcie, una asistente editorial útil y conversacional. Responde en español neutro latinoamericano a la petición del usuario usando la sesión y el artículo activos. No conduzcas un formulario, no hagas preguntas de configuración y no inventes datos ni fuentes. Si falta información, dilo claramente. Responde de forma natural y concreta.
PETICIÓN: ${clean(text, 4000)}
PÚBLICO: ${clean(audience, 80)}
SESIÓN: ${JSON.stringify(publicSession(session)).slice(0, 12000)}
ARTÍCULO: ${JSON.stringify(article || {}).slice(0, 70000)}
Devuelve SOLO JSON: {"answer":"respuesta para el usuario"}`;
  try {
    const parsed = parseJson(await generateText({ model: DEFAULT_TEXT_MODEL, prompt, json: true, thinkingLevel: "MEDIUM" }), {});
    return clean(parsed.answer, 5000) || "No pude elaborar una respuesta útil sobre el artículo en este momento.";
  } catch (error) {
    logModelFallback("answer_from_article", error);
    return "Marcie no pudo consultar el análisis profundo en este momento. El artículo y tus cambios siguen intactos; puedes volver a enviar la instrucción.";
  }
}

async function handlePostProductionTurn(run, input, context) {
  const text = clean(input.text || input.value, 4000);
  const action = String(input.action || "");
  const { ref, session } = await loadOwnedSession(context.db, context.uid, run.sessionId);
  const handlers = createToolHandlers(context);

  if (action === "discard_change") {
    run.pendingChange = null;
    return promptResponse(run, "Descarté la vista previa. El artículo original no cambió.", { type: "text", options: [] });
  }

  if (action === "apply_change") {
    const pending = run.pendingChange;
    if (!pending?.preview) return promptResponse(run, "No hay cambios pendientes para aplicar.", { type: "text", options: [] });
    const fresh = await ref.get();
    const freshSession = fresh.data() || {};
    const freshArticle = freshSession.articlesByAudience?.[pending.audience] || freshSession.article;
    if (Number(freshArticle?.revision || 0) !== Number(pending.baseRevision || 0)) {
      throw Object.assign(new Error("marcie_article_revision_conflict"), { status: 409 });
    }
    if (pending.baseFingerprint && articleRepairFingerprint(freshArticle) !== pending.baseFingerprint) {
      throw Object.assign(new Error("marcie_article_revision_conflict"), { status: 409 });
    }
    const prepared = pending.kind === "evidence_repair"
      ? { ...pending.preview, blocks: withoutBibliographyBlocks(pending.preview.blocks) }
      : pending.kind === "targeted_revision"
        ? { ...pending.preview, articleClaims: [], evidenceLinks: [], verification: { status: "pending", coverage: 0, blockers: [], contradictions: [] } }
        : normalizeArticleRevision(freshArticle, pending.preview);
    if (pending.kind === "targeted_revision") delete prepared.approval;
    const revised = { ...prepared, revision: Number(pending.baseRevision || 0) + 1, updatedAt: new Date().toISOString() };
    const articlesByAudience = { ...(freshSession.articlesByAudience || {}), [pending.audience]: revised };
    await ref.set({
      articlesByAudience,
      ...(freshSession.audience === pending.audience ? { article: revised } : {}),
      status: "review_required",
      approvedAudiences: (freshSession.approvedAudiences || []).filter((item) => item !== pending.audience),
      updatedAt: new Date().toISOString()
    }, { merge: true });
    run.pendingChange = null;
    return promptResponse(run, pending.kind === "evidence_repair"
      ? "Apliqué la reparación propuesta. La comprobación factual del artículo debe ejecutarse de nuevo antes de aprobarlo."
      : pending.kind === "targeted_revision"
        ? "Apliqué únicamente el fragmento indicado. El resto del artículo sigue intacto; la comprobación factual queda pendiente."
      : "Apliqué los cambios y conservé una nueva revisión para no sobrescribir ediciones recientes.", { type: "text", options: [] });
  }

  const requestedAudience = clean(input.audience || session.audience || session.selectedAudiences?.[0] || "educators", 80);
  const plan = action === "resolve_evidence"
    ? { intent: "resolve_evidence", audience: requestedAudience, instruction: text }
    : await planPostProductionTurn({ text, requestedAudience, session, generateText: context.generateText });
  const audience = plan.audience;
  const article = session.articlesByAudience?.[audience] || (session.audience === audience ? session.article : null) || session.article;
  logMarcieAgent("marcie_postproduction_plan", {
    runId: clean(run.id, 160),
    sessionId: clean(run.sessionId, 120),
    intent: clean(plan.intent, 40),
    audience: clean(audience, 80),
    requestedAudience,
    hasArticle: Boolean(article),
    instructionLength: clean(plan.instruction || text, 4000).length
  });

  if (plan.intent === "wordpress") {
    const readiness = await handlers.prepare_wordpress_draft({ sessionId: run.sessionId, audience });
    const message = readiness.ready
      ? "El artículo está listo para preparar un borrador de WordPress. La publicación seguirá requiriendo tu confirmación."
      : `Todavía no puede prepararse: ${readiness.blockers.join(" ")}`;
    return promptResponse(run, message, { type: "text", options: [] }, { wordpressReadiness: readiness });
  }

  if (plan.intent === "resolve_evidence") {
    if (!article) return promptResponse(run, "No encuentro el artículo que debo reparar.", { type: "text", options: [] });
    const repair = await handlers.resolve_evidence_issue({
      sessionId: run.sessionId,
      audience,
      claimId: clean(input.claimId || (action === "resolve_evidence" ? input.value : plan.claimId), 120),
      requestText: text
    });
    if (repair.status === "choose") {
      return promptResponse(run, "Hay varias afirmaciones pendientes. Elige cuál quieres resolver primero.", {
        type: "single_choice",
        options: repair.claims.map((claim) => ({ id: claim.id, value: claim.id, label: clean(claim.text, 110), action: "resolve_evidence" }))
      }, { audience });
    }
    if (repair.status !== "ready") return promptResponse(run, repair.message, { type: "text", options: [] }, { audience });
    run.pendingChange = {
      kind: "evidence_repair", audience, baseRevision: repair.baseRevision,
      baseFingerprint: articleRepairFingerprint(article),
      preview: repair.preview, findings: [repair.finding],
      changes: deriveArticleChanges(article, repair.preview), createdAt: new Date().toISOString()
    };
    return promptResponse(run, repair.finding + " Revisa la vista previa antes de aplicar.", {
      type: "change_preview",
      options: [
        { id: "discard_change", label: "Descartar", action: "discard_change" },
        { id: "apply_change", label: "Aplicar cambios", action: "apply_change" }
      ]
    }, { changePreview: pendingChangeForUi(run.pendingChange, article) });
  }

  if (plan.intent === "verify") {
    const verification = await handlers.verify_article_claims({ article, topic: session.topic || session.title, additionalSearches: 1 });
    run.lastVerification = {
      status: clean(verification?.status || verification?.verification?.status, 80),
      blockers: Array.isArray(verification?.blockers) ? verification.blockers.slice(0, 20) : []
    };
    const message = run.lastVerification.blockers.length
      ? `La verificación terminó con ${run.lastVerification.blockers.length} observaciones. No modifiqué el artículo.`
      : "La verificación terminó sin bloqueos nuevos. No modifiqué el artículo.";
    return promptResponse(run, message, { type: "text", options: [] }, { verification: run.lastVerification });
  }

  if (plan.intent === "research") {
    const research = await handlers.research_sources({ topic: session.topic || session.title, audience, minimumSources: 5, region: session.researchRegion || "MX", period: session.researchPeriod || "6m", videoEvidence: session.videoResearch || null });
    const sourceCount = Number(research?.documentSourceCount ?? (Array.isArray(research?.sources) ? research.sources.filter((source) => source?.sourceType !== "youtube_video").length : 0));
    run.lastResearch = { sourceCount, researchedAt: new Date().toISOString() };
    return promptResponse(run, `Encontré ${sourceCount} fuentes verificadas para revisar. No las incorporé todavía al artículo.`, { type: "text", options: [] }, { researchSummary: run.lastResearch });
  }

  if (!article) return promptResponse(run, "No encuentro un artículo activo para revisar.", { type: "text", options: [] });
  if (plan.intent === "chat") {
    const answer = await answerFromArticle({ text, session, audience, article, generateText: context.generateText, plannedAnswer: plan.answer });
    return promptResponse(run, answer, { type: "text", options: [] }, { audience });
  }
  if (plan.intent === "analyze") {
    const review = await handlers.review_article({ article, instruction: plan.instruction || "Analiza claridad, estructura, tono, rigor, evidencia y adecuación al público sin modificar el artículo." });
    const findings = Array.isArray(review.findings) ? review.findings.map((item) => clean(item, 800)).filter(Boolean).slice(0, 12) : [];
    const message = clean(review.summary, 4000) || (findings.length ? `Análisis del artículo para ${AUDIENCES.find((item) => item.id === audience)?.label || audience}:\n${findings.map((item) => `• ${item}`).join("\n")}` : "Revisé el artículo y no encontré observaciones concretas que reportar.");
    return promptResponse(run, message, { type: "text", options: [] }, { audience, review: { findings } });
  }
  const baseRevision = Number(article.revision || 0);
  logMarcieAgent("marcie_article_revision_start", {
    runId: clean(run.id, 160),
    sessionId: clean(run.sessionId, 120),
    audience,
    baseRevision,
    instructionLength: clean(plan.instruction || text, 4000).length
  });
  const revision = await handlers.revise_article({ sessionId: run.sessionId, audience, baseRevision, instruction: (isTargetedRevisionRequest(text) ? text : plan.instruction || text) || "Revisa claridad, tono, rigor y adecuación al público." });
  logMarcieAgent(revision.fallbackPreview ? "marcie_article_revision_fallback_preview" : "marcie_article_revision_preview", {
    runId: clean(run.id, 160),
    sessionId: clean(run.sessionId, 120),
    audience,
    baseRevision,
    hasPreview: Boolean(revision.preview),
    findingCount: Array.isArray(revision.findings) ? revision.findings.length : 0,
    changeCount: Array.isArray(revision.changes) ? revision.changes.length : 0,
    fallbackPreview: revision.fallbackPreview === true
  }, revision.fallbackPreview ? "WARNING" : "INFO");
  if (revision.modelUnavailable) {
    return promptResponse(run, "Marcie no pudo preparar una revisión fiable en este momento. El artículo original sigue intacto; vuelve a intentarlo en unos instantes.", { type: "text", options: [] }, { audience });
  }
  run.pendingChange = { audience, baseRevision, kind: revision.targetedPreview ? "targeted_revision" : "revision", baseFingerprint: revision.targetedPreview ? articleRepairFingerprint(article) : "", preview: revision.preview, findings: revision.findings || [], changes: revision.changes || [], createdAt: new Date().toISOString() };
  const findingCount = run.pendingChange.findings.length;
  return promptResponse(run, findingCount
    ? `Preparé una vista previa con ${findingCount} observaciones. Revísala antes de aplicar los cambios.`
    : "Preparé una vista previa de la revisión. El artículo original sigue intacto.", {
    type: "change_preview",
    options: [
      { id: "discard_change", label: "Descartar", action: "discard_change" },
      { id: "apply_change", label: "Aplicar cambios", action: "apply_change" }
    ]
  }, { changePreview: pendingChangeForUi(run.pendingChange, article) });
}

function createToolHandlers(context) {
  const production = () => {
    const { enabled, createProductionCoordinator } = require("./marcie-production-coordinator.js");
    if (!enabled()) throw Object.assign(new Error("La producción paralela aún no está activada."), { status: 503 });
    return context.productionCoordinator || createProductionCoordinator({ db: context.db });
  };
  return {
    start_production: ({ sessionId }) => production().start(context.uid, sessionId),
    get_production: ({ productionId }) => production().status(context.uid, productionId),
    resume_production: ({ productionId }) => production().control(context.uid, productionId, "resume"),
    cancel_production: ({ productionId }) => production().control(context.uid, productionId, "cancel"),
    async get_session_context({ sessionId }) {
      const { session } = await loadOwnedSession(context.db, context.uid, sessionId);
      return publicSession(session);
    },
    async get_trending_topics({ limit }) {
      return { topics: await listTrendingTopics(context.db, limit) };
    },
    async create_editorial_session({ topic, selectedAudiences, specifications = [], preferredVocabulary = [], sourceInputs = { youtube: [] }, videoResearch = null }) {
      const ref = context.db.collection(SESSIONS_COLLECTION).doc();
      const audience = selectedAudiences[0];
      const now = new Date().toISOString();
      const article = { schemaVersion: "1.0", title: topic, subtitle: "", audience, blocks: [], sources: [], researchSources: [], editorialMode: "marcie", seo: { title: topic, description: "", keywords: [], slug: "" } };
      await ref.set({ title: topic, topic, ownerId: context.uid, ownerUid: context.uid, status: "new", audience, selectedAudiences, specifications, preferredVocabulary: uniqueStrings(preferredVocabulary, 250), sourceInputs, videoResearch, editorialMode: "marcie", article, articlesByAudience: { [audience]: article }, createdAt: now, updatedAt: now });
      return { sessionId: ref.id, status: "new" };
    },
    async generate_audience_proposals({ topic, audiences, videoEvidence = null }) {
      return { proposalsByAudience: await generateProposalOptions({ topic, audiences, generateText: context.generateText, videoResearch: videoEvidence }) };
    },
    async analyze_youtube_videos(args) {
      return context.analyzeYoutubeVideos(args);
    },
    async research_sources(args) {
      return researchArticleEvidenceServer({ topic: args.topic, audience: args.audience, mode: "marcie", minimumSources: args.minimumSources, region: args.region || "MX", period: args.period || "6m", searchPlatforms: args.searchPlatforms, researchInstructions: args.researchInstructions || [], videoEvidence: args.videoEvidence || null, dependencies: { client: context.client } });
    },
    async draft_articles({ topic, audiences, evidenceByAudience = {}, specifications = [], videoEvidence = null, sessionId = "", editorialMode = "marcie", editorialProfileSnapshot = {}, preferredVocabulary = [] }) {
      if (sessionId) return production().start(context.uid, sessionId);
      if (require("./marcie-production-coordinator.js").enabled()) {
        // Stateless compatibility callers use exactly the checkpointed drafting core.
        // Persistent callers supply sessionId and use the same coordinator as HTTP.
        const { createWorkers } = require("./marcie-production-workers.js");
        const { configuration } = require("./marcie-production-policy.js");
        const config = configuration({ topic, selectedAudiences: audiences, specifications, videoResearch: videoEvidence, editorialMode, editorialProfileSnapshot, preferredVocabulary });
        const client = context.client || { models: { generateContent: async ({ model, contents }) => ({ candidates: [{ content: { parts: [{ text: await context.generateText({ model, prompt: contents.flatMap(c => c.parts || []).map(p => p.text || "").join("\n"), json: true }) }] } }] }) } };
        const execute = createWorkers({ client });
        const articles = {};
        for (const audience of audiences) {
          const dossier = evidenceByAudience[audience] || {};
          if (!require("./marcie-research-policy.js").readiness(dossier, config.minimum).ready) throw Object.assign(new Error("Falta evidencia verificada para este público."), { status: 422 });
          articles[audience] = await execute({ config, imported: { drafts: {} } }, { stage: "draft", input: { audience, dossier } }, async () => {}, new AbortController().signal);
        }
        return { articles };
      }
      const articles = {};
      for (const audience of audiences) {
        const evidence = evidenceByAudience[audience] || {};
        const prompt = `Redacta un artículo educativo original en español neutro latinoamericano para ${audience} sobre ${topic}. Usa un registro comprensible en toda América Latina, sin localismos de un país concreto. Para varias personas usa "ustedes" y nunca "vosotros", "vosotras" ni conjugaciones como "sabéis", "podéis" o "tenéis". Conserva literalmente las citas verificadas, los títulos de fuentes y los nombres propios. Si existe evidencia de video, construye obligatoriamente el artículo alrededor de dos ejes: (1) la idea central del video y (2) su relación con la neuroeducación, adaptada al público seleccionado. El video aporta la base conceptual, no una plantilla ni texto para copiar: crea una estructura, argumentación y redacción nuevas. No reproduzcas la secuencia, frases ni paráfrasis cercanas del video. Amplía, contrasta y fortalece ambos ejes con las fuentes documentales verificadas. No atribuyas al video una relación neurocientífica que no sostenga; toda ampliación debe proceder de las fuentes documentales. Usa exclusivamente la evidencia proporcionada para afirmaciones factuales y conserva sourceIds y locators en cada bloque. Toda idea, opinión o explicación procedente del video debe atribuirse explícitamente a su autor, persona o canal; no la presentes como un hecho externo sin una fuente documental de contraste. Prioriza el respaldo y citación de las fuentes científicas más recientes de la evidencia documental (publicadas en los últimos 5 años), acudiendo a fuentes anteriores únicamente cuando la teoría científica o el hallazgo seminal no haya variado desde su publicación original. Evita citar fuentes sin fecha si existen estudios fechados. Una cita directa de video solo puede usarse si es necesaria, tiene máximo 25 palabras, coincide con shortQuotes y conserva su marca de tiempo. Especificaciones: ${specifications.join("; ")}. EVIDENCIA DOCUMENTAL: ${JSON.stringify(evidence).slice(0, 50000)}. EVIDENCIA DE VIDEO: ${JSON.stringify(videoEvidence || {}).slice(0, 30000)}. Devuelve SOLO JSON de artículo con title, subtitle, audience, blocks, sources y seo.`;
        const article = parseJson(await context.generateText({ model: DEFAULT_TEXT_MODEL, prompt, json: true, thinkingLevel: "HIGH" }), {});
        const sourcePool = Array.isArray(evidence.sources) ? evidence.sources : [];
        const usedIds = new Set((article.blocks || []).flatMap((block) => Array.isArray(block?.sourceIds) ? block.sourceIds.map(String) : []));
        article.researchSources = sourcePool;
        article.sources = sourcePool.filter((source) => source?.sourceType !== "youtube_video" || usedIds.has(String(source.id)));
        article.usedSources = article.sources;
        articles[audience] = article;
      }
      return { articles };
    },
    async verify_article_claims({ article, topic, additionalSearches = 1 }) {
      return verifyArticleEvidenceServer({ article, topic, additionalSearches, dependencies: { client: context.client } });
    },
    async resolve_evidence_issue({ sessionId, audience, claimId = "", requestText = "" }) {
      const { session } = await loadOwnedSession(context.db, context.uid, sessionId);
      const article = session.articlesByAudience?.[audience] || (session.audience === audience ? session.article : null);
      if (!article) throw Object.assign(new Error("marcie_article_missing"), { status: 404 });
      const claim = selectEvidenceClaim(article, claimId, requestText);
      if (!claim) {
        const claims = unresolvedClaims(article).map((item) => ({ id: String(item.id || ""), text: String(item.text || item.claim || "") })).filter((item) => item.id);
        return claims.length
          ? { status: "choose", claims }
          : { status: "unavailable", message: "No hay afirmaciones pendientes identificables para este artículo. Ejecuta primero el control de calidad." };
      }
      let verified = null;
      try {
        const verify = context.verifyArticleEvidence || verifyArticleEvidenceServer;
        verified = await verify({ article, topic: session.topic || session.title, additionalSearches: 1, dependencies: { client: context.client } });
      } catch (error) {
        logModelFallback("resolve_evidence_issue", error);
      }
      const repair = buildEvidenceRepairPreview(article, claim, verified);
      return repair
        ? { status: "ready", ...repair, baseRevision: Number(article.revision || 0) }
        : { status: "unavailable", message: "La afirmación se conserva como contenido de autor. Su evidencia documental sigue pendiente; puedes añadir una fuente verificable o revisar su redacción manualmente." };
    },
    async format_bibliography_apa7({ sources }) {
      return { entries: sources.map((source) => ({ id: source.id || "", apa: bibliography.format(source), metadataGaps: bibliography.metadataGaps(source) })) };
    },
    async review_article({ article, instruction }) {
      return reviewWithGemini({ article, instruction, generateText: context.generateText });
    },
    async revise_article({ sessionId, audience, baseRevision, instruction }) {
      const { session } = await loadOwnedSession(context.db, context.uid, sessionId);
      const article = session.articlesByAudience?.[audience] || (session.audience === audience ? session.article : null);
      if (!article) throw Object.assign(new Error("marcie_article_missing"), { status: 404 });
      if (Number(article.revision || 0) !== Number(baseRevision || 0)) throw Object.assign(new Error("marcie_article_revision_conflict"), { status: 409 });
      const revised = await reviewWithGemini({ article, instruction, generateText: context.generateText });
      return { preview: revised.article, findings: revised.findings || [], changes: revised.changes || [], baseRevision: Number(baseRevision || 0), requiresConfirmation: true, fallbackPreview: revised.fallbackPreview === true, modelUnavailable: revised.modelUnavailable === true, targetedPreview: revised.targetedPreview === true };
    },
    async manage_vocabulary({ current = [], add = [], remove = [] }) {
      const removeKeys = new Set(uniqueStrings(remove, 250).map(normalizeKey));
      const retained = uniqueStrings(current, 250).filter((item) => !removeKeys.has(normalizeKey(item)));
      const existingKeys = new Set(retained.map(normalizeKey));
      const incoming = uniqueStrings(add, 250);
      return { vocabulary: uniqueStrings([...retained, ...incoming], 250), added: incoming.filter((item) => !existingKeys.has(normalizeKey(item))), existing: incoming.filter((item) => existingKeys.has(normalizeKey(item))) };
    },
    async prepare_wordpress_draft({ sessionId, audience }) {
      const { session } = await loadOwnedSession(context.db, context.uid, sessionId);
      const article = session.articlesByAudience?.[audience] || session.article;
      const blockers = [];
      if (!article?.blocks?.length) blockers.push("El artículo no tiene contenido.");
      if (article?.verification?.status !== "verified") blockers.push("El artículo todavía no está verificado.");
      if (!(session.approvedAudiences || []).includes(audience)) blockers.push("Falta aprobación editorial humana.");
      return { ready: blockers.length === 0, blockers, sessionId, audience, requiresHumanConfirmation: true };
    }
  };
}

function registerTools(server, handlers) {
  const add = (name, description, inputSchema) => server.registerTool(name, { description, inputSchema }, async (args) => textResult(await handlers[name](args)));
  add("start_production", "Inicia o recupera una producción editorial persistente propia.", { sessionId: z.string().min(1).max(200) });
  for (const name of ["get_production", "resume_production", "cancel_production"]) {
    add(name, "Consulta, reanuda o cancela una producción propia sin borrar checkpoints.", { productionId: z.string().regex(/^[a-f0-9]{32}$/) });
  }
  const audience = z.enum(AUDIENCES.map((item) => item.id));
  add("get_session_context", "Lee una sesión editorial propia y sus revisiones.", { sessionId: z.string().min(1) });
  add("get_trending_topics", "Consulta las tendencias verificadas más recientes del radar editorial.", { limit: z.number().int().min(1).max(6).optional() });
  add("create_editorial_session", "Crea una sesión editorial sin publicar contenido.", { topic: z.string().min(3).max(600), selectedAudiences: z.array(audience).min(1).max(4), specifications: z.array(z.string().max(1000)).max(80).optional(), preferredVocabulary: z.array(z.string().max(100)).max(250).optional(), sourceInputs: z.any().optional(), videoResearch: z.any().optional() });
  add("generate_audience_proposals", "Genera tres propuestas de título para cada público usando el expediente de video cuando exista.", { topic: z.string().min(3).max(600), audiences: z.array(audience).min(1).max(4), videoEvidence: z.any().optional() });
  add("analyze_youtube_videos", "Analiza de uno a cinco videos públicos de YouTube sin almacenar audio ni transcripciones completas.", { urls: z.array(z.string().max(3000)).min(1).max(5), objective: z.string().max(1000).optional(), language: z.enum(["es-MX"]).optional() });
  add("research_sources", "Investiga documentos originales y contrasta evidencia de video.", { topic: z.string().min(3).max(2000), audience, minimumSources: z.number().int().min(1).max(20).optional(), region: z.string().max(80).optional(), period: z.enum(["1m", "3m", "6m", "12m"]).optional(), searchPlatforms: z.array(z.string()).max(30).optional(), researchInstructions: z.array(z.string().max(2000)).max(50).optional(), videoEvidence: z.any().optional() });
  add("draft_articles", "Redacta artículos por público usando expedientes documentales y de video.", { topic: z.string().min(3).max(600), audiences: z.array(audience).min(1).max(4), sessionId: z.string().min(1).max(200).optional(), editorialMode: z.enum(["marcie", "aida", "custom"]).optional(), editorialProfileSnapshot: z.record(z.string(), z.any()).optional(), preferredVocabulary: z.array(z.string()).max(250).optional(), evidenceByAudience: z.record(z.string(), z.any()).optional(), specifications: z.array(z.string().max(1000)).max(80).optional(), videoEvidence: z.any().optional() });
  add("verify_article_claims", "Verifica afirmaciones, citas y documentos de un artículo.", { article: z.any(), topic: z.string().max(1000).optional(), additionalSearches: z.number().int().min(0).max(2).optional() });
  add("resolve_evidence_issue", "Prepara una reparación verificable para una afirmación sin respaldo de un artículo propio; requiere confirmación antes de guardar.", { sessionId: z.string().min(1), audience, claimId: z.string().max(120).optional(), requestText: z.string().max(4000).optional() });
  add("format_bibliography_apa7", "Genera referencias APA 7 y reporta metadatos faltantes.", { sources: z.array(z.any()).max(100) });
  add("review_article", "Revisa un artículo sin guardarlo ni publicarlo.", { article: z.any(), instruction: z.string().max(4000).optional() });
  add("revise_article", "Prepara una vista previa de revisión con control optimista de versión.", { sessionId: z.string().min(1), audience, baseRevision: z.number().int().min(0), instruction: z.string().min(3).max(4000) });
  add("manage_vocabulary", "Añade o retira vocabulario detectando duplicados sin acentos.", { current: z.array(z.string()).max(250).optional(), add: z.array(z.string()).max(250).optional(), remove: z.array(z.string()).max(250).optional() });
  add("prepare_wordpress_draft", "Comprueba si un artículo puede prepararse como borrador; nunca publica.", { sessionId: z.string().min(1), audience });
}

function createMarcieEditorialMcpServer(context) {
  const server = new McpServer({ name: "marcie-editorial-agent", version: "1.0.0" });
  instrumentMcpServer(server, 'marcie-editorial-agent');
  registerTools(server, createToolHandlers(context));
  return server;
}

function registerMarcieEditorialAgentRoutes(app, dependencies = {}) {
  const resolveAuth = dependencies.resolveAuthContext || require("./common.js").resolveAuthContext;
  const getServices = dependencies.getAdminServices || require("./common.js").getAdminServices;
  const asyncRoute = dependencies.asyncRoute || require("./common.js").asyncRoute;
  const contextFor = async (req) => {
    const auth = await resolveAuth(req);
    const { db } = getServices();
    await assertEditorialAccess(auth, db);
    const profileSnapshot = await db.collection("users").doc(auth.uid).get().catch(() => null);
    const profile = profileSnapshot?.exists ? profileSnapshot.data() || {} : {};
    return {
      db,
      uid: auth.uid,
      productionCoordinator: dependencies.productionCoordinator,
      displayName: clean(profile.displayName || profile.nombre || auth.token?.name || auth.email?.split("@")[0], 120),
      generateText: typeof dependencies.generateText === "function"
        ? (args) => withModelRetry(() => dependencies.generateText(args))
        : undefined,
      client: dependencies.client,
      analyzeYoutubeVideos: async (args) => {
        const startedAt = Date.now();
        const requestedVideoCount = Math.min(5, Array.isArray(args?.urls) ? args.urls.length : 0);
        const cacheAccess = {
          async readCachedAnalysis({ source, objective, language }) {
            const key = youtubeAnalysisCacheKey({ ownerId: auth.uid, videoId: source.videoId, objective, language });
            const ref = db.collection(YOUTUBE_ANALYSIS_CACHE_COLLECTION).doc(key);
            const snapshot = await ref.get();
            if (!snapshot.exists) return null;
            const cached = snapshot.data() || {};
            if (cached.ownerId !== auth.uid || Number(cached.analysisVersion) !== ANALYSIS_VERSION) return null;
            await ref.set({ lastUsedAt: new Date() }, { merge: true }).catch(() => {});
            return compactVideoAnalysisForCache(cached.video);
          },
          async writeCachedAnalysis({ source, objective, language, video }) {
            const compact = compactVideoAnalysisForCache(video);
            if (!compact) return;
            const key = youtubeAnalysisCacheKey({ ownerId: auth.uid, videoId: source.videoId, objective, language });
            await db.collection(YOUTUBE_ANALYSIS_CACHE_COLLECTION).doc(key).set({
              ownerId: auth.uid,
              videoId: source.videoId,
              analysisVersion: ANALYSIS_VERSION,
              language: clean(language, 20),
              video: compact,
              createdAt: new Date(),
              lastUsedAt: new Date()
            });
          }
        };
        try {
          const result = await (dependencies.analyzeYoutubeVideos || analyzeYoutubeVideos)(args, {
            client: dependencies.client,
            ...cacheAccess,
            onVideoFallback({ source, model, reason }) {
              console.warn(JSON.stringify({
                severity: "WARNING",
                event: "marcie_youtube_video_fallback",
                videoId: clean(source?.videoId, 40),
                model: clean(model, 80),
                reason: clean(reason, 300)
              }));
            },
            onPublicFallback({ source, captionsAvailable, captionsReason, firstReason, fallbackReason }) {
              console.warn(JSON.stringify({
                severity: "WARNING",
                event: "marcie_youtube_public_fallback",
                videoId: clean(source?.videoId, 40),
                analysisMode: captionsAvailable ? "public_captions_fallback" : "public_captions_unavailable",
                captionsReason: clean(captionsReason, 300),
                interactionReason: clean(firstReason, 300),
                generateContentReason: clean(fallbackReason, 300)
              }));
            }
          });
          console.info(JSON.stringify({
            severity: "INFO",
            event: "marcie_youtube_analysis",
            requestedVideoCount,
            analyzedVideoCount: result.videos.length,
            rejectedVideoCount: result.rejectedVideos.length,
            analysisModes: result.videos.map((video) => clean(video?.analysisMode || "direct", 80)),
            cacheHitCount: Number(result.cache?.hitCount || 0),
            cacheMissCount: Number(result.cache?.missCount || 0),
            durationMs: Date.now() - startedAt
          }));
          return result;
        } catch (error) {
          console.warn(JSON.stringify({
            severity: "WARNING",
            event: "marcie_youtube_analysis_failed",
            requestedVideoCount,
            code: clean(error?.code || error?.message, 120),
            rejectedVideos: (Array.isArray(error?.rejectedVideos) ? error.rejectedVideos : []).slice(0, 5).map((item) => ({
              videoId: clean(item?.videoId, 40),
              reason: clean(item?.reason, 300),
              firstReason: clean(item?.firstReason, 300),
              fallbackReason: clean(item?.fallbackReason, 300),
              publicFallbackReason: clean(item?.publicFallbackReason, 300)
            })),
            durationMs: Date.now() - startedAt
          }));
          throw error;
        }
      }
    };
  };

  app.get("/api/marcie/production/capabilities", asyncRoute(async (req, res) => {
    await contextFor(req);
    res.json({ enabled: require("./marcie-production-coordinator.js").enabled() });
  }));
  for (const [action, tool] of Object.entries({ start: "start_production", status: "get_production", resume: "resume_production", cancel: "cancel_production" })) {
    app.post(`/api/marcie/production/${action}`, asyncRoute(async (req, res) => {
      const context = await contextFor(req);
      const result = await createToolHandlers(context)[tool]({ sessionId: clean(req.body?.sessionId, 200), productionId: clean(req.body?.productionId, 100) });
      res.json({ ok: true, ...result });
    }));
  }

  app.get("/api/marcie/agent/history", asyncRoute(async (req, res) => {
    const context = await contextFor(req);
    const sessionId = clean(req.query?.sessionId, 120);
    if (!sessionId) throw Object.assign(new Error("marcie_session_id_required"), { status: 400 });
    return res.status(200).json({ ok: true, ...(await readSessionHistory(context, sessionId)) });
  }));

  app.post("/api/marcie/agent/chat", asyncRoute(async (req, res) => {
    const startedAt = Date.now();
    const context = await contextFor(req);
    const assistantMode = req.body?.mode === "assistant";
    const requestedSessionId = clean(req.body?.sessionId, 120);
    let run = await readRun(context, req.body?.runId);
    if (assistantMode) {
      if (!requestedSessionId) throw Object.assign(new Error("marcie_session_id_required"), { status: 400 });
      await loadOwnedSession(context.db, context.uid, requestedSessionId);
      if (!run || run.sessionId !== requestedSessionId || !["completed", "reviewing"].includes(String(run.status || run.phase))) {
        run = initialAssistantRun({ uid: context.uid, displayName: context.displayName, sessionId: requestedSessionId });
      }
    } else if (!run) {
      run = initialRun({ uid: context.uid, displayName: context.displayName });
    }
    const input = req.body?.input && typeof req.body.input === "object" ? { ...req.body.input } : {};
    const phaseBefore = String(run.phase || "");
    const submittedValue = clean(input.value, 600);
    const selectedOptionId = /^[a-z][a-z0-9:_-]{0,159}$/i.test(submittedValue) ? submittedValue : "";
    const proposalAudience = phaseBefore === "proposals"
      ? (run.configuration?.selectedAudiences || []).find((item) => !run.configuration?.proposalsByAudience?.[item])
      : "";
    const selectedProposal = proposalAudience
      ? proposalChoiceOptions(run.configuration || {}, proposalAudience).find((option) => option.id === submittedValue)
      : null;
    console.info(JSON.stringify({
      severity: "INFO",
      event: "marcie_agent_turn_start",
      requestId: req.requestId || "",
      runId: clean(run.id, 160),
      sessionId: clean(requestedSessionId || run.sessionId, 120),
      mode: assistantMode ? "assistant" : "configuration",
      phase: phaseBefore,
      action: clean(input.action, 80),
      selectedOptionId,
      selectedOptionKind: selectedProposal?.kind || selectedProposal?.action || "",
      textLength: clean(input.text || "", 12000).length
    }));
    const response = clean(input.text || input.value) || input.action || input.selectedValues?.length || input.urls?.length
      ? await processAgentTurn(run, input, context)
      : phasePrompt(run);
    response.configurationPatch = response.configurationPatch || {};
    await saveRun(context, run, input, response);
    console.info(JSON.stringify({
      severity: "INFO",
      event: "marcie_agent_turn_complete",
      requestId: req.requestId || "",
      runId: clean(run.id, 160),
      phaseBefore,
      phaseAfter: clean(run.phase, 80),
      runStatus: clean(run.status, 80),
      durationMs: Date.now() - startedAt
    }));
    return res.status(200).json({ ok: true, ...response });
  }));

  app.post("/api/marcie/agent/run", asyncRoute(async (req, res) => {
    const context = await contextFor(req);
    const run = await readRun(context, req.body?.runId);
    if (!run) throw Object.assign(new Error("marcie_agent_run_not_found"), { status: 404 });
    if (run.phase !== "ready" && run.phase !== "running") throw Object.assign(new Error("marcie_agent_confirmation_required"), { status: 409 });
    const status = ["started", "completed", "failed", "cancelled"].includes(req.body?.event) ? req.body.event : "started";
    run.phase = status === "started" ? "running" : status;
    run.status = status === "started" ? "queued" : status;
    if (req.body?.sessionId) run.sessionId = clean(req.body.sessionId, 120);
    if (req.body?.error) run.error = clean(req.body.error, 1000);
    run.updatedAt = new Date().toISOString();
    await context.db.collection(RUNS_COLLECTION).doc(run.id).set(run, { merge: true });
    return res.status(status === "started" ? 202 : 200).json({ ok: true, runId: run.id, runStatus: run.status, sessionRequest: sessionRequestFromRun(run) });
  }));

  app.post("/api/marcie/videos/analyze", asyncRoute(async (req, res) => {
    const context = await contextFor(req);
    const result = await context.analyzeYoutubeVideos({
      urls: Array.isArray(req.body?.urls) ? req.body.urls : [],
      objective: clean(req.body?.objective, 1000),
      language: "es-MX"
    });
    return res.status(200).json({ ok: true, ...result });
  }));

  app.post("/api/marcie/videos/metadata", asyncRoute(async (req, res) => {
    await contextFor(req);
    const urls = Array.isArray(req.body?.urls) ? req.body.urls : [];
    if (!urls.length || urls.length > 5) throw Object.assign(new Error("Se requieren entre uno y cinco videos."), { status: 400 });
    const sources = [...new Map(urls.map(normalizeYoutubeUrl).filter(Boolean).map(source => [source.videoId, source])).values()];
    if (!sources.length) throw Object.assign(new Error("No se recibió una URL válida de YouTube."), { status: 400 });
    const videos = await Promise.all(sources.map(async source => ({
      ...source,
      ...await fetchYoutubePublicMetadata(source)
    })));
    return res.status(200).json({ ok: true, videos });
  }));

  app.all("/api/marcie/mcp", async (req, res) => {
    let server; let transport;
    try {
      if (req.method !== "POST") return res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
      const context = await contextFor(req);
      server = createMarcieEditorialMcpServer(context);
      transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      if (!res.headersSent) res.status(Number(error.status || 500)).json({ jsonrpc: "2.0", error: { code: -32603, message: String(error.message || "MCP error") }, id: null });
    } finally {
      res.on("close", () => { transport?.close(); server?.close(); });
    }
  });
}

module.exports = {
  AUDIENCES,
  EXTENSIONS,
  RESOURCES,
  SEARCH_PLATFORMS,
  RUNS_COLLECTION,
  TONES,
  advanceRun,
  createMarcieEditorialMcpServer,
  createToolHandlers,
  fallbackProposals,
  initialAssistantRun,
  initialRun,
  isTransientModelError,
  missingFields,
  normalizeKey,
  phasePrompt,
  processAgentTurn,
  readSessionHistory,
  registerMarcieEditorialAgentRoutes,
  sessionRequestFromRun,
  specificationList,
  uniqueStrings,
  withModelRetry
};
