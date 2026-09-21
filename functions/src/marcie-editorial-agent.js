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

async function generateProposalOptions({ topic, audiences, generateText }) {
  const fallback = fallbackProposals(topic, audiences);
  if (typeof generateText !== "function") return fallback;
  const prompt = `Genera exactamente tres títulos distintos para cada público de un artículo educativo. Tema: ${topic}. Públicos: ${audiences.join(", ")}. Evita clickbait, promesas médicas y títulos genéricos. Devuelve SOLO JSON: {"proposals":{"educators":[{"title":""}]}}. Incluye únicamente las claves de públicos solicitadas.`;
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

function initialRun({ uid, displayName = "" } = {}) {
  return {
    id: `marcie-agent-${randomUUID()}`,
    ownerId: uid,
    displayName: clean(displayName, 120),
    status: "configuring",
    phase: "topic",
    configuration: {
      topic: "",
      selectedAudiences: [],
      proposalsByAudience: {},
      proposalOptionsByAudience: {},
      tone: "",
      lengthMode: "same",
      extensionsByAudience: {},
      sourceMode: "all",
      specialSources: [],
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
  if (run.phase === "topic") {
    return promptResponse(run, "¿Sobre qué tema quieres crear los artículos?", {
      type: "text",
      options: [{ id: "recommend_trend", label: "Recomiéndame una tendencia", action: "recommend_trend" }]
    }, { configurationPatch, speechText: `Hola${run.displayName ? `, ${run.displayName}` : ""}. Vamos a preparar tus artículos. ¿Sobre qué tema quieres escribir?` });
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
    preferredVocabulary: configuration.preferredVocabulary
  };
}

async function advanceRun(run, input, context) {
  const configuration = run.configuration;
  const patch = {};
  if (run.phase === "summary" && /^edit_/.test(String(input.action || ""))) {
    const target = String(input.action).slice(5);
    if (target === "topic") run.phase = "topic";
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
  if (run.phase === "topic") {
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
    configuration.proposalOptionsByAudience = await generateProposalOptions({ topic: configuration.topic, audiences, generateText: context.generateText });
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

async function reviewWithGemini({ article, instruction, generateText }) {
  if (typeof generateText !== "function") return { article, findings: ["El servicio de revisión no está disponible."] };
  const prompt = `Revisa el artículo educativo según esta instrucción: ${instruction || "claridad, rigor, evidencia y adecuación al público"}. No inventes fuentes. Devuelve SOLO JSON con {"article":{...},"findings":[""]}. ARTÍCULO: ${JSON.stringify(article).slice(0, 80000)}`;
  return parseJson(await generateText({ model: DEFAULT_TEXT_MODEL, prompt, json: true, thinkingLevel: "MEDIUM" }), { article, findings: [] });
}

async function handlePostProductionTurn(run, input, context) {
  const text = clean(input.text || input.value, 4000);
  const action = String(input.action || "");
  const { ref, session } = await loadOwnedSession(context.db, context.uid, run.sessionId);
  const audience = clean(input.audience || session.audience || session.selectedAudiences?.[0] || "educators", 80);
  const article = session.articlesByAudience?.[audience] || session.article;
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

  if (/wordpress|borrador/i.test(text)) {
    const readiness = await handlers.prepare_wordpress_draft({ sessionId: run.sessionId, audience });
    const message = readiness.ready
      ? "El artículo está listo para preparar un borrador de WordPress. La publicación seguirá requiriendo tu confirmación."
      : `Todavía no puede prepararse: ${readiness.blockers.join(" ")}`;
    return promptResponse(run, message, { type: "text", options: [] }, { wordpressReadiness: readiness });
  }

  if (/verific|afirmaci[oó]n|referencia/i.test(text)) {
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

  if (/m[aá]s fuentes|buscar fuentes|investiga/i.test(text)) {
    const research = await handlers.research_sources({ topic: session.topic || session.title, audience, minimumSources: 5, region: session.researchRegion || "MX", period: session.researchPeriod || "6m" });
    const sourceCount = Array.isArray(research?.sources) ? research.sources.length : 0;
    run.lastResearch = { sourceCount, researchedAt: new Date().toISOString() };
    return promptResponse(run, `Encontré ${sourceCount} fuentes verificadas para revisar. No las incorporé todavía al artículo.`, { type: "text", options: [] }, { researchSummary: run.lastResearch });
  }

  if (!article) return promptResponse(run, "No encuentro un artículo activo para revisar.", { type: "text", options: [] });
  const baseRevision = Number(article.revision || 0);
  const revision = await handlers.revise_article({ sessionId: run.sessionId, audience, baseRevision, instruction: text || "Revisa claridad, tono, rigor y adecuación al público." });
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
    async create_editorial_session({ topic, selectedAudiences, specifications = [], preferredVocabulary = [] }) {
      const ref = context.db.collection(SESSIONS_COLLECTION).doc();
      const audience = selectedAudiences[0];
      const now = new Date().toISOString();
      const article = { schemaVersion: "1.0", title: topic, subtitle: "", audience, blocks: [], sources: [], researchSources: [], editorialMode: "marcie", seo: { title: topic, description: "", keywords: [], slug: "" } };
      await ref.set({ title: topic, topic, ownerId: context.uid, ownerUid: context.uid, status: "new", audience, selectedAudiences, specifications, preferredVocabulary: uniqueStrings(preferredVocabulary, 250), editorialMode: "marcie", article, articlesByAudience: { [audience]: article }, createdAt: now, updatedAt: now });
      return { sessionId: ref.id, status: "new" };
    },
    async generate_audience_proposals({ topic, audiences }) {
      return { proposalsByAudience: await generateProposalOptions({ topic, audiences, generateText: context.generateText }) };
    },
    async research_sources(args) {
      return researchArticleEvidenceServer({ topic: args.topic, audience: args.audience, mode: "marcie", minimumSources: args.minimumSources, region: args.region || "MX", period: args.period || "6m", searchPlatforms: args.searchPlatforms, researchInstructions: args.researchInstructions || [], dependencies: { client: context.client } });
    },
    async draft_articles({ topic, audiences, evidenceByAudience = {}, specifications = [] }) {
      const articles = {};
      for (const audience of audiences) {
        const prompt = `Redacta un artículo educativo en español para ${audience} sobre ${topic}. Usa exclusivamente la evidencia proporcionada y conserva sourceIds en cada bloque. Especificaciones: ${specifications.join("; ")}. EVIDENCIA: ${JSON.stringify(evidenceByAudience[audience] || {}).slice(0, 60000)}. Devuelve SOLO JSON de artículo con title, subtitle, audience, blocks, sources y seo.`;
        articles[audience] = parseJson(await context.generateText({ model: DEFAULT_TEXT_MODEL, prompt, json: true, thinkingLevel: "HIGH" }), {});
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
      return { preview: revised.article, findings: revised.findings || [], baseRevision: Number(baseRevision || 0), requiresConfirmation: true };
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
  add("create_editorial_session", "Crea una sesión editorial sin publicar contenido.", { topic: z.string().min(3).max(600), selectedAudiences: z.array(audience).min(1).max(4), specifications: z.array(z.string().max(1000)).max(80).optional(), preferredVocabulary: z.array(z.string().max(100)).max(250).optional() });
  add("generate_audience_proposals", "Genera tres propuestas de título para cada público.", { topic: z.string().min(3).max(600), audiences: z.array(audience).min(1).max(4) });
  add("research_sources", "Investiga y verifica documentos originales para un público.", { topic: z.string().min(3).max(2000), audience, minimumSources: z.number().int().min(1).max(20).optional(), region: z.string().max(80).optional(), period: z.enum(["1m", "3m", "6m", "12m"]).optional(), searchPlatforms: z.array(z.string()).max(30).optional(), researchInstructions: z.array(z.string().max(2000)).max(50).optional() });
  add("draft_articles", "Redacta artículos por público usando expedientes de evidencia.", { topic: z.string().min(3).max(600), audiences: z.array(audience).min(1).max(4), evidenceByAudience: z.record(z.string(), z.any()).optional(), specifications: z.array(z.string().max(1000)).max(80).optional() });
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
      generateText: dependencies.generateText,
      client: dependencies.client
    };
  };

  app.post("/api/marcie/agent/chat", asyncRoute(async (req, res) => {
    const context = await contextFor(req);
    let run = await readRun(context, req.body?.runId);
    if (!run) run = initialRun({ uid: context.uid, displayName: context.displayName });
    const input = req.body?.input && typeof req.body.input === "object" ? req.body.input : {};
    const response = clean(input.text || input.value) || input.action || input.selectedValues?.length
      ? await advanceRun(run, input, context)
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
  initialRun,
  missingFields,
  normalizeKey,
  phasePrompt,
  registerMarcieEditorialAgentRoutes,
  sessionRequestFromRun,
  specificationList,
  uniqueStrings
};
