const { randomUUID } = require("node:crypto");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const z = require("zod/v4");
const bibliography = require("./marcie-bibliography.js");
const {
  assertEditorialAccess,
  researchArticleEvidenceServer,
  verifyArticleEvidenceServer
} = require("./marcie-editorial-research.js");
const { DEFAULT_TEXT_MODEL } = require("./vertex.js");
const { analyzeYoutubeVideos, normalizeYoutubeUrls } = require("./marcie-youtube-agent.js");

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
    code: clean(error?.code || error?.status || error?.message, 240)
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
    { id: `${audience}-1`, title: `${topic}: guía práctica para ${labels[audience] || audience}` },
    { id: `${audience}-2`, title: `Lo que ${labels[audience] || audience} necesitan saber sobre ${topic}` },
    { id: `${audience}-3`, title: `${topic} sin mitos: claves basadas en evidencia` }
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

async function generateProposalOptions({ topic, audiences, generateText, videoResearch = null }) {
  const fallback = fallbackProposals(topic, audiences);
  if (typeof generateText !== "function") return fallback;
  const videoContext = compactVideoContext(videoResearch);
  const prompt = `Genera exactamente tres títulos distintos para cada público de un artículo educativo. Tema elegido por el usuario: ${topic}. Públicos: ${audiences.join(", ")}.
${videoContext ? `El video es la base conceptual obligatoria. Cada título debe reflejar con fidelidad el tema elegido y al menos una idea central comprobable de este expediente, sin copiar el título ni frases del video y sin introducir un enfoque ajeno: ${JSON.stringify(videoContext)}` : "No hay expediente de video."}
Adapta el ángulo y el vocabulario a cada público. Evita clickbait, promesas médicas y títulos genéricos. Devuelve SOLO JSON: {"proposals":{"educators":[{"title":""}]}}. Incluye únicamente las claves de públicos solicitadas.`;
  try {
    const raw = await generateText({ model: DEFAULT_TEXT_MODEL, prompt, json: true, thinkingLevel: "MEDIUM" });
    const parsed = parseJson(raw, {});
    return Object.fromEntries(audiences.map((audience) => {
      const candidates = (parsed.proposals?.[audience] || []).map((item, index) => ({
        id: `${audience}-${index + 1}`,
        title: clean(item?.title || item, 240)
      })).filter((item) => item.title).slice(0, 3);
      return [audience, candidates.length === 3 ? candidates : fallback[audience]];
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

function initialRun({ uid, displayName = "" } = {}) {
  return {
    id: `marcie-agent-${randomUUID()}`,
    ownerId: uid,
    displayName: clean(displayName, 120),
    status: "configuring",
    phase: "creation_source",
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
      preferredVocabulary: [],
      searchPlatforms: ["all"]
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
  const name = run.displayName ? `, ${run.displayName}` : "";
  const speechText = extras.speechText || `${message}${uiPrompt?.options?.length ? ` Por favor${name}, elige una opción.` : ""}`;
  return {
    message,
    speechText,
    phase: run.phase,
    configurationPatch: extras.configurationPatch || {},
    missingFields: missingFields(run.configuration),
    uiPrompt: uiPrompt || { type: "text", options: [] },
    pendingConfirmation: run.phase === "summary",
    runStatus: run.status,
    runId: run.id,
    configuration: run.configuration,
    ...extras
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
  if (!configuration.selectedAudiences?.length || configuration.selectedAudiences.some((audience) => !configuration.resourcesByAudience?.[audience]?.length)) fields.push("resources");
  return fields;
}

function phasePrompt(run, configurationPatch = {}) {
  const configuration = run.configuration;
  if (run.phase === "creation_source") {
    return promptResponse(run, "Cuéntame el tema de los artículos. También puedes pegar una URL de YouTube y pedirme que la use como base.", {
      type: "text",
      options: []
    }, { configurationPatch, speechText: `Hola${run.displayName ? `, ${run.displayName}` : ""}. Vamos a preparar tus artículos. Dime el tema o pega una dirección de YouTube y la usaré como punto de partida.` });
  }
  if (run.phase === "topic") {
    return promptResponse(run, "¿Sobre qué tema quieres crear los artículos?", {
      type: "text",
      options: [{ id: "recommend_trend", label: "Recomiéndame una tendencia", action: "recommend_trend" }]
    }, { configurationPatch, speechText: `Hola${run.displayName ? `, ${run.displayName}` : ""}. Vamos a preparar tus artículos. ¿Sobre qué tema quieres escribir?` });
  }
  if (run.phase === "youtube_urls") return promptResponse(run, "Pega entre una y cinco URLs públicas de YouTube para analizarlas.", { type: "url_list", options: [] }, { configurationPatch, speechText: "Pega las direcciones de los videos de YouTube. Puedes agregar hasta cinco y después pulsa Analizar videos." });
  if (run.phase === "video_topic") {
    const options = (configuration.videoResearch?.proposedTopics || []).slice(0, 3).map((value, index) => ({ id: `video-topic-${index + 1}`, label: value, value }));
    return promptResponse(run, "Ya analicé los videos. Elige un tema propuesto o escribe uno diferente.", { type: "single_choice", options }, { configurationPatch, videoResearch: configuration.videoResearch });
  }
  if (run.phase === "audiences") return promptResponse(run, "¿Para qué públicos prepararemos versiones del artículo?", { type: "multi_choice", options: AUDIENCES }, { configurationPatch });
  if (run.phase === "proposals") {
    const audience = configuration.selectedAudiences.find((item) => !configuration.proposalsByAudience[item]);
    const label = AUDIENCES.find((item) => item.id === audience)?.label || audience;
    const options = (configuration.proposalOptionsByAudience[audience] || []).map((item) => ({ id: item.id, label: item.title, value: item.title }));
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
  if (run.phase === "sources") return promptResponse(run, "¿Usamos todas las fuentes fiables o quieres indicar alguna fuente especial?", { type: "single_choice", options: [{ id: "all", label: "Todas las fuentes fiables" }, { id: "special", label: "Añadir fuentes especiales" }] }, { configurationPatch });
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

function selectedValues(input = {}, options = []) {
  const explicit = Array.isArray(input.selectedValues) ? input.selectedValues.map(String) : [];
  if (explicit.length) return explicit;
  const text = normalizeKey(input.text);
  return options.filter((option) => text.includes(normalizeKey(option.id)) || text.includes(normalizeKey(option.label))).map((option) => option.id);
}

function selectedValue(input = {}, options = []) {
  return selectedValues(input, options)[0] || clean(input.value || input.text, 600);
}

function youtubeUrlsFromInput(input = {}) {
  if (Array.isArray(input.urls)) return normalizeYoutubeUrls(input.urls).valid.map((item) => item.url);
  const matches = String(input.text || input.value || "").match(/https:\/\/[^\s,;]+/gi) || [];
  return normalizeYoutubeUrls(matches.map((value) => value.replace(/[)\].!?]+$/, ""))).valid.map((item) => item.url);
}

function specificationList(configuration = {}) {
  const specifications = [];
  if (configuration.tone) specifications.push(`#tono[all] ${configuration.tone}`);
  for (const audience of configuration.selectedAudiences || []) {
    if (configuration.proposalsByAudience?.[audience]) specifications.push(`#titulo[${audience}] ${configuration.proposalsByAudience[audience]}`);
    if (configuration.extensionsByAudience?.[audience]) specifications.push(`#extension[${audience}] ${configuration.extensionsByAudience[audience]}`);
    for (const resource of configuration.resourcesByAudience?.[audience] || []) {
      specifications.push(`#concepto[${audience}] ${RESOURCES.find((item) => item.id === resource)?.label || resource}`);
    }
  }
  if (configuration.specialSources?.length) specifications.push(`#fuentes[all] ${configuration.specialSources.join("; ")}`);
  return specifications;
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
    titleProposals: { byAudience: Object.fromEntries(Object.entries(configuration.proposalsByAudience || {}).map(([audience, title]) => [audience, { hooks: [title], contrahooks: [], selected: title, topic: configuration.topic }])) },
    searchPlatforms: configuration.sourceMode === "all" ? undefined : ["supplemental"],
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
  const text = clean(input.text || input.value, 4000);
  if (!text) return false;
  const explicitHelp = /\b(?:para qu[eé] (?:sirve|funciona)|qu[eé] significa|qu[eé] es|puedes explicar|me explicas|no entiendo|cu[aá]l es la diferencia|c[oó]mo funciona)\b/i.test(text);
  const choicePhase = ["audiences", "proposals", "tone", "length_mode", "extension", "sources", "resource_mode", "resources", "vocabulary", "summary"].includes(run.phase);
  return explicitHelp || (choicePhase && /\?|^(?:qu[eé]|c[oó]mo|cu[aá]l|por qu[eé]|d[oó]nde|qui[eé]n)\b/i.test(text));
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
    resourcesByAudience: configuration.resourcesByAudience,
    video: compactVideoContext(configuration.videoResearch)
  };
}

async function answerConfigurationQuestion(run, input, context) {
  const currentPrompt = phasePrompt(run);
  let answer = "Claro. Puedo explicártelo sin cambiar ninguna opción de la configuración.";
  if (typeof context.generateText === "function") {
    const prompt = `Eres Marcie, una agente editorial conversacional en español de México. El usuario interrumpió la configuración para hacer una pregunta. Respóndela de forma clara, cálida y concreta en 2 a 4 oraciones. Puedes explicar para qué sirve una opción, comparar alternativas o responder conocimiento general. No selecciones nada por el usuario, no avances el formulario y no inventes datos. Después de responder, retoma con naturalidad la pregunta pendiente.
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
  const prompt = `Eres Marcie, una agente editorial cálida, inteligente y natural en español de México. Acabas de recibir una respuesta del usuario durante la configuración de artículos. Redacta una transición breve y variada: reconoce específicamente lo que entendiste y formula la siguiente pregunta indicada. No cambies decisiones, opciones, cifras ni el estado; no respondas por el usuario. Si existe un expediente de video, menciona detalles reales solo cuando ayuden a demostrar que lo comprendiste. Evita frases repetitivas como "Perfecto" en todos los turnos.
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
  if (run.status === "configuring" && isConfigurationQuestion(run, input)) {
    return answerConfigurationQuestion(run, input, context);
  }
  const previousPhase = run.phase;
  const response = await advanceRun(run, input, context);
  if (["configuring", "ready"].includes(run.status)) {
    return personalizeAgentResponse(run, input, response, context, previousPhase);
  }
  return response;
}

async function advanceRun(run, input, context) {
  const configuration = run.configuration;
  const patch = {};
  if (run.phase === "summary" && /^edit_/.test(String(input.action || ""))) {
    const target = String(input.action).slice(5);
    if (target === "topic") run.phase = "topic";
    if (target === "videos") run.phase = "youtube_urls";
    if (target === "audiences") {
      configuration.selectedAudiences = [];
      configuration.proposalsByAudience = {};
      configuration.proposalOptionsByAudience = {};
      configuration.extensionsByAudience = {};
      run.phase = "audiences";
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
    run.updatedAt = new Date().toISOString();
    return phasePrompt(run);
  }
  if (run.sessionId && ["completed", "reviewing"].includes(String(run.status || run.phase))) {
    run.phase = "reviewing";
    run.status = "reviewing";
    const response = await handlePostProductionTurn(run, input, context);
    run.updatedAt = new Date().toISOString();
    return response;
  }
  if (run.phase === "creation_source") {
    const detectedUrls = youtubeUrlsFromInput(input);
    const rawValue = clean(input.text || input.value, 600);
    const asksForVideo = rawValue === "youtube" || detectedUrls.length || /\b(?:youtube|video|videos)\b/i.test(rawValue);
    const resolvedSource = asksForVideo ? "youtube" : (rawValue ? "topic" : "");
    if (!["topic", "youtube"].includes(resolvedSource)) return phasePrompt(run);
    configuration.creationSource = resolvedSource;
    patch.creationSource = resolvedSource;
    run.phase = resolvedSource === "youtube" ? "youtube_urls" : (rawValue === "topic" ? "topic" : "audiences");
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
      const analysis = await context.analyzeYoutubeVideos({ urls: detectedUrls, objective: videoObjective || configuration.topic, language: "es-MX" });
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
    const urls = Array.isArray(input.urls) ? input.urls : String(input.text || input.value || "").split(/[\n,;]+/);
    const analysis = await context.analyzeYoutubeVideos({ urls, objective: configuration.videoObjective || configuration.topic, language: "es-MX" });
    analysis.objective = configuration.videoObjective || configuration.topic || "";
    configuration.sourceInputs = { youtube: analysis.videos.map((video) => ({ videoId: video.videoId, url: video.url })) };
    configuration.videoResearch = analysis;
    patch.sourceInputs = configuration.sourceInputs;
    patch.videoResearch = analysis;
    run.phase = "video_topic";
  } else if (run.phase === "video_topic") {
    const options = (configuration.videoResearch?.proposedTopics || []).slice(0, 3).map((value, index) => ({ id: `video-topic-${index + 1}`, label: value, value }));
    const optionId = selectedValue(input, options);
    const option = options.find((item) => item.id === optionId);
    const topic = clean(option?.value || input.text || input.value, 600);
    if (!topic) return phasePrompt(run);
    configuration.topic = topic;
    patch.topic = topic;
    run.phase = "audiences";
  } else if (run.phase === "topic") {
    if (input.action === "recommend_trend" || selectedValues(input, [{ id: "recommend_trend", label: "Recomiéndame una tendencia" }]).length) {
      const trends = await listTrendingTopics(context.db, 3);
      run.lastOptions = trends.map((item) => ({ id: `trend:${item.id}`, label: item.topic, value: item.topic, description: item.summary }));
      return promptResponse(run, trends.length ? "Estas son las tendencias con mejor oportunidad editorial." : "Todavía no hay tendencias disponibles. Dime el tema que deseas trabajar.", { type: trends.length ? "single_choice" : "text", options: run.lastOptions });
    }
    const chosenTrend = (run.lastOptions || []).find((option) => selectedValues(input, run.lastOptions).includes(option.id));
    const topic = clean(chosenTrend?.value || input.text || input.value, 600);
    if (!topic) return phasePrompt(run);
    configuration.topic = topic; patch.topic = topic; run.phase = "audiences";
  } else if (run.phase === "audiences") {
    const audiences = selectedValues(input, AUDIENCES).filter((value) => AUDIENCES.some((item) => item.id === value));
    if (!audiences.length) return phasePrompt(run);
    configuration.selectedAudiences = audiences; patch.selectedAudiences = audiences;
    configuration.proposalOptionsByAudience = await generateProposalOptions({ topic: configuration.topic, audiences, generateText: context.generateText, videoResearch: configuration.videoResearch });
    run.phase = "proposals";
  } else if (run.phase === "proposals") {
    const audience = configuration.selectedAudiences.find((item) => !configuration.proposalsByAudience[item]);
    const options = (configuration.proposalOptionsByAudience[audience] || []).map((item) => ({ id: item.id, label: item.title, value: item.title }));
    const optionId = selectedValue(input, options);
    const option = options.find((item) => item.id === optionId);
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
    const mode = selectedValue(input, [{ id: "all", label: "Todas las fuentes fiables" }, { id: "special", label: "Añadir fuentes especiales" }]);
    if (!['all', 'special'].includes(mode)) return phasePrompt(run);
    configuration.sourceMode = mode; patch.sourceMode = mode;
    run.phase = mode === "special" ? "sources_custom" : "resource_mode";
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
  await messages.add({ role: "assistant", text: response.message, phase: response.phase, uiPrompt: response.uiPrompt, createdAt: new Date().toISOString() });
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
    summary: `Marcie no pudo completar el análisis profundo en este momento, pero la comprobación estructural encontró lo siguiente:\n${findings.map((item) => `• ${item}`).join("\n")}\nPuedes volver a intentarlo sin perder el artículo.`,
    modelUnavailable: true
  };
}

async function reviewWithGemini({ article, instruction, generateText }) {
  if (typeof generateText !== "function") return { article, findings: ["El servicio de revisión no está disponible."] };
  const prompt = `Revisa el artículo educativo según esta instrucción: ${instruction || "claridad, rigor, evidencia y adecuación al público"}. No inventes fuentes. Devuelve SOLO JSON con {"article":{...},"findings":[""],"summary":"explicación útil y concreta para el usuario"}. ARTÍCULO: ${JSON.stringify(article).slice(0, 80000)}`;
  try {
    return parseJson(await generateText({ model: DEFAULT_TEXT_MODEL, prompt, json: true, thinkingLevel: "MEDIUM" }), { article, findings: [] });
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
  if (/\b(corrige|corregir|reescribe|reescribir|cambia|cambiar|acorta|amplia|modifica|editar)\b/.test(normalized)) intent = "revise";
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
- verify: comprobar afirmaciones, referencias o evidencia.
- research: buscar más fuentes.
- wordpress: comprobar si puede prepararse como borrador.
- chat: responder preguntas, explicar el artículo o asesorar sin modificarlo.
PÚBLICOS DISPONIBLES: ${JSON.stringify(availableAudiences)}. Equivalencias: educators=docentes, students=estudiantes, parents=padres y familias, coordinators=coordinadores.
PÚBLICO ACTIVO: ${clean(requestedAudience, 80)}
SESIÓN: ${JSON.stringify(publicSession(session)).slice(0, 12000)}
PETICIÓN: ${clean(text, 4000)}
Devuelve SOLO JSON: {"intent":"analyze|revise|verify|research|wordpress|chat","audience":"id disponible","instruction":"instrucción completa","answer":"respuesta directa solo si intent es chat"}`;
  let parsed;
  try {
    parsed = parseJson(await generateText({ model: DEFAULT_TEXT_MODEL, prompt, json: true, thinkingLevel: "MEDIUM" }), {});
  } catch (error) {
    logModelFallback("plan_postproduction", error);
    return fallbackPostProductionPlan({ text, requestedAudience, availableAudiences });
  }
  const allowedIntents = new Set(["analyze", "revise", "verify", "research", "wordpress", "chat"]);
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
  const prompt = `Eres Marcie, una asistente editorial útil y conversacional. Responde en español de México a la petición del usuario usando la sesión y el artículo activos. No conduzcas un formulario, no hagas preguntas de configuración y no inventes datos ni fuentes. Si falta información, dilo claramente. Responde de forma natural y concreta.
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
    delete run.pendingChange;
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
    const revised = { ...pending.preview, revision: Number(pending.baseRevision || 0) + 1, updatedAt: new Date().toISOString() };
    const articlesByAudience = { ...(freshSession.articlesByAudience || {}), [pending.audience]: revised };
    await ref.set({
      articlesByAudience,
      ...(freshSession.audience === pending.audience ? { article: revised } : {}),
      status: "review_required",
      approvedAudiences: (freshSession.approvedAudiences || []).filter((item) => item !== pending.audience),
      updatedAt: new Date().toISOString()
    }, { merge: true });
    delete run.pendingChange;
    return promptResponse(run, "Apliqué los cambios y conservé una nueva revisión para no sobrescribir ediciones recientes.", { type: "text", options: [] });
  }

  const requestedAudience = clean(input.audience || session.audience || session.selectedAudiences?.[0] || "educators", 80);
  const plan = await planPostProductionTurn({ text, requestedAudience, session, generateText: context.generateText });
  const audience = plan.audience;
  const article = session.articlesByAudience?.[audience] || (session.audience === audience ? session.article : null) || session.article;

  if (plan.intent === "wordpress") {
    const readiness = await handlers.prepare_wordpress_draft({ sessionId: run.sessionId, audience });
    const message = readiness.ready
      ? "El artículo está listo para preparar un borrador de WordPress. La publicación seguirá requiriendo tu confirmación."
      : `Todavía no puede prepararse: ${readiness.blockers.join(" ")}`;
    return promptResponse(run, message, { type: "text", options: [] }, { wordpressReadiness: readiness });
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
  const revision = await handlers.revise_article({ sessionId: run.sessionId, audience, baseRevision, instruction: plan.instruction || text || "Revisa claridad, tono, rigor y adecuación al público." });
  if (revision.modelUnavailable) {
    return promptResponse(run, "Marcie no pudo preparar una revisión fiable en este momento. El artículo original sigue intacto; vuelve a intentarlo en unos instantes.", { type: "text", options: [] }, { audience });
  }
  run.pendingChange = { audience, baseRevision, preview: revision.preview, findings: revision.findings || [], createdAt: new Date().toISOString() };
  const findingCount = run.pendingChange.findings.length;
  return promptResponse(run, findingCount
    ? `Preparé una vista previa con ${findingCount} observaciones. Revísala antes de aplicar los cambios.`
    : "Preparé una vista previa de la revisión. El artículo original sigue intacto.", {
    type: "change_preview",
    options: [
      { id: "discard_change", label: "Descartar", action: "discard_change" },
      { id: "apply_change", label: "Aplicar cambios", action: "apply_change" }
    ]
  }, { changePreview: { audience, baseRevision, title: clean(revision.preview?.title, 300), findings: run.pendingChange.findings } });
}

function createToolHandlers(context) {
  return {
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
    async draft_articles({ topic, audiences, evidenceByAudience = {}, specifications = [], videoEvidence = null }) {
      const articles = {};
      for (const audience of audiences) {
        const evidence = evidenceByAudience[audience] || {};
        const prompt = `Redacta un artículo educativo original en español para ${audience} sobre ${topic}. El video aporta la idea inicial, no una plantilla ni texto para copiar: crea una estructura, argumentación y redacción nuevas, adaptadas específicamente a este público. No reproduzcas la secuencia, frases ni paráfrasis cercanas del video. Amplía, contrasta y fortalece la idea con las fuentes documentales verificadas. Usa exclusivamente la evidencia proporcionada para afirmaciones factuales y conserva sourceIds y locators en cada bloque. Toda idea, opinión o explicación procedente del video debe atribuirse explícitamente a su autor, persona o canal; no la presentes como un hecho externo sin una fuente documental de contraste. Una cita directa de video solo puede usarse si es necesaria, tiene máximo 25 palabras, coincide con shortQuotes y conserva su marca de tiempo. Especificaciones: ${specifications.join("; ")}. EVIDENCIA DOCUMENTAL: ${JSON.stringify(evidence).slice(0, 50000)}. EVIDENCIA DE VIDEO: ${JSON.stringify(videoEvidence || {}).slice(0, 30000)}. Devuelve SOLO JSON de artículo con title, subtitle, audience, blocks, sources y seo.`;
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
      return { preview: revised.article, findings: revised.findings || [], baseRevision: Number(baseRevision || 0), requiresConfirmation: true, modelUnavailable: revised.modelUnavailable === true };
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
  const audience = z.enum(AUDIENCES.map((item) => item.id));
  add("get_session_context", "Lee una sesión editorial propia y sus revisiones.", { sessionId: z.string().min(1) });
  add("get_trending_topics", "Consulta las tendencias verificadas más recientes del radar editorial.", { limit: z.number().int().min(1).max(6).optional() });
  add("create_editorial_session", "Crea una sesión editorial sin publicar contenido.", { topic: z.string().min(3).max(600), selectedAudiences: z.array(audience).min(1).max(4), specifications: z.array(z.string().max(1000)).max(80).optional(), preferredVocabulary: z.array(z.string().max(100)).max(250).optional(), sourceInputs: z.any().optional(), videoResearch: z.any().optional() });
  add("generate_audience_proposals", "Genera tres propuestas de título para cada público usando el expediente de video cuando exista.", { topic: z.string().min(3).max(600), audiences: z.array(audience).min(1).max(4), videoEvidence: z.any().optional() });
  add("analyze_youtube_videos", "Analiza de uno a cinco videos públicos de YouTube sin almacenar audio ni transcripciones completas.", { urls: z.array(z.string().max(3000)).min(1).max(5), objective: z.string().max(1000).optional(), language: z.enum(["es-MX"]).optional() });
  add("research_sources", "Investiga documentos originales y contrasta evidencia de video.", { topic: z.string().min(3).max(2000), audience, minimumSources: z.number().int().min(1).max(20).optional(), region: z.string().max(80).optional(), period: z.enum(["1m", "3m", "6m", "12m"]).optional(), searchPlatforms: z.array(z.string()).max(30).optional(), researchInstructions: z.array(z.string().max(2000)).max(50).optional(), videoEvidence: z.any().optional() });
  add("draft_articles", "Redacta artículos por público usando expedientes documentales y de video.", { topic: z.string().min(3).max(600), audiences: z.array(audience).min(1).max(4), evidenceByAudience: z.record(z.string(), z.any()).optional(), specifications: z.array(z.string().max(1000)).max(80).optional(), videoEvidence: z.any().optional() });
  add("verify_article_claims", "Verifica afirmaciones, citas y documentos de un artículo.", { article: z.any(), topic: z.string().max(1000).optional(), additionalSearches: z.number().int().min(0).max(2).optional() });
  add("format_bibliography_apa7", "Genera referencias APA 7 y reporta metadatos faltantes.", { sources: z.array(z.any()).max(100) });
  add("review_article", "Revisa un artículo sin guardarlo ni publicarlo.", { article: z.any(), instruction: z.string().max(4000).optional() });
  add("revise_article", "Prepara una vista previa de revisión con control optimista de versión.", { sessionId: z.string().min(1), audience, baseRevision: z.number().int().min(0), instruction: z.string().min(3).max(4000) });
  add("manage_vocabulary", "Añade o retira vocabulario detectando duplicados sin acentos.", { current: z.array(z.string()).max(250).optional(), add: z.array(z.string()).max(250).optional(), remove: z.array(z.string()).max(250).optional() });
  add("prepare_wordpress_draft", "Comprueba si un artículo puede prepararse como borrador; nunca publica.", { sessionId: z.string().min(1), audience });
}

function createMarcieEditorialMcpServer(context) {
  const server = new McpServer({ name: "marcie-editorial-agent", version: "1.0.0" });
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
      displayName: clean(profile.displayName || profile.nombre || auth.token?.name || auth.email?.split("@")[0], 120),
      generateText: typeof dependencies.generateText === "function"
        ? (args) => withModelRetry(() => dependencies.generateText(args))
        : undefined,
      client: dependencies.client,
      analyzeYoutubeVideos: async (args) => {
        const startedAt = Date.now();
        const requestedVideoCount = Math.min(5, Array.isArray(args?.urls) ? args.urls.length : 0);
        try {
          const result = await (dependencies.analyzeYoutubeVideos || analyzeYoutubeVideos)(args, { client: dependencies.client });
          console.info(JSON.stringify({ severity: "INFO", event: "marcie_youtube_analysis", requestedVideoCount, analyzedVideoCount: result.videos.length, rejectedVideoCount: result.rejectedVideos.length, durationMs: Date.now() - startedAt }));
          return result;
        } catch (error) {
          console.warn(JSON.stringify({ severity: "WARNING", event: "marcie_youtube_analysis_failed", requestedVideoCount, code: clean(error?.code || error?.message, 120), durationMs: Date.now() - startedAt }));
          throw error;
        }
      }
    };
  };

  app.post("/api/marcie/agent/chat", asyncRoute(async (req, res) => {
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
    const response = clean(input.text || input.value) || input.action || input.selectedValues?.length || input.urls?.length
      ? await processAgentTurn(run, input, context)
      : phasePrompt(run);
    response.configurationPatch = response.configurationPatch || {};
    await saveRun(context, run, input, response);
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
  registerMarcieEditorialAgentRoutes,
  sessionRequestFromRun,
  specificationList,
  uniqueStrings,
  withModelRetry
};
