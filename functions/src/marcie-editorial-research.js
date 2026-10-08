const { scheduleResearch, researchClient, requestDeadline } = require("./marcie-research-runtime.js");
const researchPolicy = require("./marcie-research-policy.js");
const bibliography = require("./marcie-bibliography.js");
const crypto = require("node:crypto");
const { getAdminServices } = require("./common.js");
const {
  createVertexClient,
  buildVertexGenerateRequest,
  DEFAULT_TEXT_MODEL,
  MARCIE_FALLBACK_MODELS,
  normalizeTextModel
} = require("./vertex.js");
const { verifyCandidateSources } = require("./marcie-source-verifier.js");
const { searchScientificCatalogs } = require("./marcie-catalog-search.js");
const { normalizeYoutubeUrl } = require("./marcie-youtube-agent.js");
const { autoRepairEvidence } = require("./marcie-evidence-repair.js");

const TREND_SCHEMA_VERSION = 6;
const DEFAULT_SETTINGS = { cadence: "weekly", region: "MX", timezone: "America/Cancun", discoveryMode: "general_education_brain" };
const AIDA_PHASES = ["headline", "problem", "deepen", "agitate", "turn", "why", "change", "close"];
const RESEARCH_DEADLINE_MS = 210_000;
const EVIDENCE_VERIFY_DEADLINE_MS = 240_000;
const RESEARCH_PERIOD_DAYS = Object.freeze({ "24h": 1, "7d": 7, "1m": 30, "3m": 90, "6m": 180, "12m": 365, "5y": 1825 });
const SHARED_PAGE_TTL_MS = 10 * 60 * 1000;
const sharedPageEntries = new Map();
const sharedPageCache = {
  get(url) {
    const entry = sharedPageEntries.get(url);
    if (!entry) return undefined;
    if (Date.now() - entry.createdAt > SHARED_PAGE_TTL_MS) { sharedPageEntries.delete(url); return undefined; }
    return entry.promise;
  },
  set(url, promise) {
    if (sharedPageEntries.size >= 150) sharedPageEntries.delete(sharedPageEntries.keys().next().value);
    sharedPageEntries.set(url, { promise, createdAt: Date.now() });
    promise.catch(() => { if (sharedPageEntries.get(url)?.promise === promise) sharedPageEntries.delete(url); });
  }
};

function clampText(value, max = 1000) { return String(value == null ? "" : value).trim().slice(0, max); }
function hasVerifiedPublicationYear(source = {}) { return bibliography.year(source) !== "s. f."; }
function isGenericLandingUrl(value = "") {
  try {
    const url = new URL(value);
    return url.pathname === "/" && !url.search;
  } catch (_) { return false; }
}
function normalizeVideoEvidence(value = {}) {
  const sources = [];
  const allowedIds = new Set();
  for (const item of Array.isArray(value?.bibliographySources) ? value.bibliographySources.slice(0, 5) : []) {
    const normalized = normalizeYoutubeUrl(item?.url);
    if (!normalized) continue;
    const id = `youtube-${normalized.videoId}`;
    allowedIds.add(id);
    sources.push({
      id,
      sourceType: "youtube_video",
      title: clampText(item?.title, 500) || `Video de YouTube ${normalized.videoId}`,
      channel: clampText(item?.channel || item?.authors?.[0], 300),
      authors: (Array.isArray(item?.authors) ? item.authors : []).map((author) => clampText(author, 300)).filter(Boolean).slice(0, 3),
      publisher: "YouTube",
      publishedAt: /^\d{4}(?:-\d{2}-\d{2})?/.test(clampText(item?.publishedAt, 40)) ? clampText(item.publishedAt, 40) : "",
      url: normalized.url,
      videoId: normalized.videoId,
      verificationStatus: "attributed_only",
      evidenceRole: "video",
      supportSummary: clampText(item?.supportSummary, 1800),
      locator: clampText(item?.locator, 24)
    });
  }
  const facts = (Array.isArray(value?.evidenceItems) ? value.evidenceItems : []).slice(0, 150).map((item, index) => ({
    id: clampText(item?.id, 120) || `video-finding-${index + 1}`,
    claim: clampText(item?.text || item?.claim, 1000),
    sourceIds: (Array.isArray(item?.sourceIds) ? item.sourceIds : []).map(String).filter((id) => allowedIds.has(id)),
    locator: clampText(item?.locator, 24),
    evidenceKind: item?.evidenceKind === "external_fact" ? "external_fact" : "video_attribution",
    needsCorroboration: item?.evidenceKind === "external_fact" || item?.needsCorroboration === true
  })).filter((item) => item.claim && item.sourceIds.length);
  const quotes = (Array.isArray(value?.videos) ? value.videos : []).flatMap((video) => {
    const normalized = normalizeYoutubeUrl(video?.url);
    if (!normalized || !allowedIds.has(`youtube-${normalized.videoId}`)) return [];
    return (Array.isArray(video?.shortQuotes) ? video.shortQuotes : []).slice(0, 8).map((quote, index) => ({
      id: `youtube-${normalized.videoId}-quote-${index + 1}`,
      claim: clampText(quote?.text, 220),
      sourceIds: [`youtube-${normalized.videoId}`],
      locator: clampText(quote?.locator, 24),
      evidenceKind: "video_attribution",
      needsCorroboration: false,
      isDirectQuote: true
    })).filter((quote) => quote.claim && quote.locator);
  });
  const videoAxes = (Array.isArray(value?.videos) ? value.videos : []).map((video) => ({
    centralIdea: clampText(video?.centralIdea || video?.summary, 1800),
    neuroeducationConnection: clampText(video?.neuroeducationConnection, 1800)
  })).filter((item) => item.centralIdea || item.neuroeducationConnection);
  return { sources, facts: [...facts, ...quotes], summary: clampText(value?.combinedSynthesis, 12000), videoAxes, warnings: (Array.isArray(value?.warnings) ? value.warnings : []).map((item) => clampText(item, 500)).filter(Boolean).slice(0, 30) };
}
function stableSourceId(url) {
  let key = String(url || "").trim();
  try {
    const parsed = new URL(key); parsed.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"].forEach(name => parsed.searchParams.delete(name));
    parsed.searchParams.sort(); key = parsed.toString();
  } catch (_) {}
  return "source-" + crypto.createHash("sha256").update(key).digest("hex").slice(0, 20);
}
function withDeadline(work, timeoutMs, code) {
  let timer;
  const deadline = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(code), { status: 503, code })), timeoutMs);
  });
  return Promise.race([Promise.resolve(work), deadline]).finally(() => clearTimeout(timer));
}
function hasAidaStructure(article = {}) {
  const phases = Array.isArray(article.aida?.phases) ? article.aida.phases.map(String) : [];
  const orderedBlockPhases = (Array.isArray(article.blocks) ? article.blocks : []).map((block) => String(block?.phase || "")).filter((phase) => AIDA_PHASES.includes(phase));
  const blockPhases = new Set(orderedBlockPhases);
  let previousIndex = -1;
  const ordered = AIDA_PHASES.filter((phase) => phase !== "headline").every((phase) => {
    const index = orderedBlockPhases.indexOf(phase);
    if (index <= previousIndex) return false;
    previousIndex = index;
    return true;
  });
  return String(article.editorialMode || "").toLowerCase() === "aida"
    && AIDA_PHASES.every((phase) => phases.includes(phase))
    && AIDA_PHASES.filter((phase) => phase !== "headline").every((phase) => blockPhases.has(phase))
    && ordered;
}
function normalizeToken(value = "") { return String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s_-]+/g, ""); }
function researchDateWindow(period = "6m", now = new Date()) {
  const normalizedPeriod = Object.hasOwn(RESEARCH_PERIOD_DAYS, period) ? period : "6m";
  const to = new Date(now);
  const from = new Date(to.getTime() - (RESEARCH_PERIOD_DAYS[normalizedPeriod] * 86400000));
  return { period: normalizedPeriod, from: from.toISOString(), to: to.toISOString(), days: RESEARCH_PERIOD_DAYS[normalizedPeriod] };
}
function responseText(response = {}) { return (response.candidates?.[0]?.content?.parts || []).map((part) => part.text || "").join("\n").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim(); }
function invalidJsonError(cause) {
  return Object.assign(new Error("marcie_research_invalid_json"), { status: 502, code: "marcie_research_invalid_json", cause });
}
function repairAdjacentJsonContainers(value = "") {
  let output = "";
  let inString = false;
  let escaped = false;
  for (const character of String(value)) {
    if (inString) {
      output += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      output += character;
      continue;
    }
    if (character === "{" || character === "[") {
      let previous = output.length - 1;
      while (previous >= 0 && /\s/.test(output[previous])) previous -= 1;
      if (previous >= 0 && (output[previous] === "}" || output[previous] === "]")) {
        output = `${output.slice(0, previous + 1)},${output.slice(previous + 1)}`;
      }
    }
    output += character;
  }
  return output;
}
function parseJsonResponse(response = {}) {
  const text = responseText(response);
  try { return JSON.parse(text); } catch (_) {
    const start = text.indexOf("{"); const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const candidate = text.slice(start, end + 1);
      try { return JSON.parse(candidate); }
      catch (cause) {
        try { return JSON.parse(repairAdjacentJsonContainers(candidate)); }
        catch (_) { throw invalidJsonError(cause); }
      }
    }
    throw invalidJsonError(_);
  }
}

function waitMs(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, delayMs)));
}

function isTransientResearchError(error) {
  const status = Number(error?.status || error?.code || error?.response?.status || 0);
  const text = String(error?.message || error?.response?.data || error || "");
  return [408, 429, 500, 502, 503, 504].includes(status)
    || /RESOURCE_EXHAUSTED|UNAVAILABLE|Too Many Requests|quota|overloaded|capacity/i.test(text);
}

async function generateResearchContent({ client, model = DEFAULT_TEXT_MODEL, fallbackModels = MARCIE_FALLBACK_MODELS, payload }) {
  const primaryModel = normalizeTextModel(model);
  const models = [...new Set([
    primaryModel,
    ...(Array.isArray(fallbackModels) ? fallbackModels : MARCIE_FALLBACK_MODELS)
      .map((candidate) => normalizeTextModel(candidate))
  ])];
  let lastError;
  for (const candidate of models) {
    try {
      const generate = () => client.models.generateContent(buildVertexGenerateRequest({ model: candidate, payload }));
      const response = await (client.productionManaged ? generate() : scheduleResearch(generate, client.researchSignal));
      return { response, model: candidate };
    } catch (error) {
      lastError = error;
      if (client.researchSignal?.aborted || error?.code === "marcie_research_call_timeout" || !isTransientResearchError(error) || candidate === models.at(-1)) throw error;
      console.warn(JSON.stringify({ severity: "WARNING", event: "marcie_research_model_fallback", fromModel: candidate, toModel: models[models.indexOf(candidate) + 1], status: Number(error?.status || error?.code || 0) || null }));
    }
  }
  throw lastError || new Error("marcie_research_generation_failed");
}

async function generateJson({ client, prompt, tools = [], maxOutputTokens = 8192, model = DEFAULT_TEXT_MODEL, fallbackModels = MARCIE_FALLBACK_MODELS, researchQuery, researchDomains = [], excludedDomains = [], evidenceGap, reformulation }) {
  let discovery;
  if (require('./research/budget.js').hasSearch(tools)) {
    const query = researchQuery || prompt.match(/Investiga(?: el tema)? ["“]([^"”]+)["”]/i)?.[1] || prompt.match(/Investiga ([^.\n]+)/i)?.[1] || 'educación pedagogía aprendizaje investigaciones recientes';
    discovery = await require('./research/search.js').prepareResearch({ prompt, client, model, query, domains: researchDomains, excludedDomains, evidenceGap, reformulation });
    prompt = discovery.prompt;
    tools = tools.filter(tool => !require('./research/budget.js').hasSearch([tool]));
  }

  let lastError;
  let activeModel = normalizeTextModel(model);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const startedAt = Date.now();
    const retryInstruction = attempt
      ? "\n\nREINTENTO DE FORMATO: la respuesta anterior no fue JSON válido. Devuelve un único objeto JSON completo, sin Markdown, comentarios ni texto antes o después. Revisa comas, corchetes y llaves antes de responder."
      : "";
    const generated = (attempt === 0 && discovery?.preparedGeneration) || await generateResearchContent({
      client,
      model: activeModel,
      fallbackModels,
      payload: {
        contents: [{ role: "user", parts: [{ text: `${prompt}${retryInstruction}` }] }],
        ...(tools.length ? { tools } : {}),
        generationConfig: { maxOutputTokens, ...(tools.length ? {} : { responseMimeType: "application/json" }) }
      }
    });
    const response = generated.response;
    activeModel = generated.model;
    const finishReason = String(response?.candidates?.[0]?.finishReason || "").toUpperCase();
    console.info(JSON.stringify({ event: "marcie_research_generation", model: activeModel, durationMs: Date.now() - startedAt, finishReason: finishReason || "unknown", promptTokens: response?.usageMetadata?.promptTokenCount || 0, outputTokens: response?.usageMetadata?.candidatesTokenCount || 0, attempt: attempt + 1 }));
    if (finishReason && finishReason !== "STOP") {
      lastError = Object.assign(new Error(`marcie_research_response_${finishReason.toLowerCase()}`), { status: 502, code: "marcie_research_response_truncated", finishReason });
      continue;
    }
    try {
      const parsed = parseJsonResponse(response);
      if (discovery && Array.isArray(parsed.sources)) {
        const urls = new Set(discovery.sources.map(s => s.url));
        parsed.sources = parsed.sources.filter(s => urls.has(s.url));
      }
      return { parsed, response, discovery };
    } catch (error) {
      if (error?.code !== "marcie_research_invalid_json") throw error;
      console.warn(JSON.stringify({ severity: "WARNING", event: "marcie_json_retry", model: activeModel, attempt: attempt + 1 }));
      lastError = error;
    }
  }
  throw lastError || invalidJsonError();
}

function createUrlContextReader(client, maxUrls = 2, { model = DEFAULT_TEXT_MODEL, fallbackModels = MARCIE_FALLBACK_MODELS } = {}) {
  let attempted = 0;
  return async ({ url }) => {
    if (attempted >= maxUrls) return null;
    attempted += 1;
    const { response } = await generateResearchContent({
      client,
      model,
      fallbackModels,
      payload: {
        contents: [{ role: "user", parts: [{ text: `Lee esta página pública: ${url}. Devuelve SOLO JSON con {"title":"","authors":[],"publishedAt":"","publisher":"","doi":"","text":""}. El campo text debe contener hasta 1800 palabras factuales extraídas de la página. Usa publishedAt únicamente cuando la página indique fecha de publicación; no uses fechas de creación del archivo. Deja vacíos los metadatos que no se puedan comprobar. No uses conocimiento externo ni inventes datos.` }] }],
        tools: [{ urlContext: {} }], generationConfig: { maxOutputTokens: 2600 }
      }
    });
    const candidate = response?.candidates?.[0];
    const retrieved = candidate?.urlContextMetadata?.urlMetadata?.some((item) =>
      item?.urlRetrievalStatus === "URL_RETRIEVAL_STATUS_SUCCESS" && item?.retrievedUrl && new URL(item.retrievedUrl).hostname === new URL(url).hostname);
    if (!retrieved || String(candidate?.finishReason || "").toUpperCase() !== "STOP") return null;
    const rawText = candidate.content?.parts?.map((part) => part.text || "").join("\n") || "";
    let extracted;
    try { extracted = parseJsonResponse(response); } catch (_) { extracted = null; }
    return {
      retrieved: true, finalUrl: url,
      text: typeof extracted?.text === "string" ? extracted.text : rawText,
      title: typeof extracted?.title === "string" ? extracted.title : "",
      authors: Array.isArray(extracted?.authors) ? extracted.authors.filter((author) => typeof author === "string") : [],
      publishedAt: typeof extracted?.publishedAt === "string" ? extracted.publishedAt : "",
      publisher: typeof extracted?.publisher === "string" ? extracted.publisher : "",
      doi: typeof extracted?.doi === "string" ? extracted.doi : ""
    };
  };
}

function sourceRetrieveOptions({ client, model = DEFAULT_TEXT_MODEL, fallbackModels = MARCIE_FALLBACK_MODELS, maxUrls = 2, overrides = {} } = {}) {
  return {
    enablePlaywrightFallback: process.env.MARCIE_PLAYWRIGHT_FALLBACK === "1",
    maxBrowserFallbacks: 3,
    maxUrlContextFallbacks: Math.min(8, maxUrls),
    urlContextReader: createUrlContextReader(client, maxUrls, { model, fallbackModels }),
    ...overrides
  };
}

function groundingSources(response = {}) {
  return (response.candidates?.[0]?.groundingMetadata?.groundingChunks || []).map((chunk, index) => ({
    id: `ground-${index + 1}`, title: chunk.web?.title || "Fuente recuperada", url: chunk.web?.uri || "", sourceType: "grounded_web"
  })).filter((source) => /^https:\/\//i.test(source.url));
}

function pageAssessmentPrompt(context, pages) {
  return `Actúa como verificador documental estricto. Decide si cada página recuperada respalda de forma directa al menos una afirmación, señal o antecedente concreto del CONTEXTO; no necesita respaldar el artículo completo. No valides por título, dominio o reputación. Si el texto no contiene ningún dato pertinente, es tangencial o contradice el contexto, recházalo. No inventes citas ni localizadores.\nCONTEXTO:\n${clampText(context, 12000)}\nPÁGINAS RECUPERADAS:\n${pages.map((page) => `ID ${page.id}\nTÍTULO: ${page.retrievedTitle}\nURL FINAL: ${page.finalUrl}\nTEXTO: ${page.text.slice(0, 6000)}`).join("\n\n")}\nDevuelve SOLO JSON: {"assessments":[{"id":"ID","status":"verified|rejected","reason":"content_mismatch|verification_error","supportSummary":"qué información concreta respalda","locator":"encabezado o sección identificable","supports":["summary","signal:0"]}]}`;
}

function createSourceAssessor(client, { model = DEFAULT_TEXT_MODEL, fallbackModels = MARCIE_FALLBACK_MODELS } = {}) {
  return async ({ context, pages }) => {
    const { parsed } = await generateJson({ client, prompt: pageAssessmentPrompt(context, pages), maxOutputTokens: 2048, model, fallbackModels });
    return Array.isArray(parsed.assessments) ? parsed.assessments : [];
  };
}

function normalizedComparableText(value = "") {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[“”„‟«»'’‘]/g, '"').replace(/[^a-z0-9\s"]/g, " ").replace(/\s+/g, " ").trim();
}

async function extractAttributedReferences({ client, verifiedSources = [], retrievedPages = [], model = DEFAULT_TEXT_MODEL, fallbackModels = MARCIE_FALLBACK_MODELS } = {}) {
  const pagesById = new Map(retrievedPages.map((page) => [String(page.id), page]));
  const usable = verifiedSources.map((source) => ({ source, page: pagesById.get(String(source.id)) })).filter(({ page }) => page);
  if (!usable.length) return [];
  const prompt = `Extrae referencias atribuibles para un artículo educativo. Devuelve frases textuales solo cuando aparezcan literalmente en la página y limita cada una a 25 palabras. También puedes proponer paráfrasis fieles iniciables como "Según X". La persona o institución debe aparecer en la página o en sus metadatos. No inventes cargos, autores ni frases.\nFUENTES:\n${usable.map(({ source, page }) => `ID ${source.id}\nAUTORÍA: ${(Array.isArray(source.authors) ? source.authors : [source.authors]).filter(Boolean).join(", ")}\nINSTITUCIÓN: ${source.publisher || source.domain}\nTEXTO: ${page.text.slice(0, 2800)}`).join("\n\n")}\nSOLO JSON: {"attributedReferences":[{"personOrInstitution":"","role":"","text":"","type":"direct_quote|paraphrase","sourceId":"","locator":""}]}`;
  const parsed = (await generateJson({ client, prompt, maxOutputTokens: 2048, model, fallbackModels })).parsed;
  const sourcesById = new Map(verifiedSources.map((source) => [String(source.id), source]));
  const quotedWords = new Map();
  return (Array.isArray(parsed.attributedReferences) ? parsed.attributedReferences : []).map((item, index) => {
    const sourceId = String(item?.sourceId || "");
    const source = sourcesById.get(sourceId);
    const page = pagesById.get(sourceId);
    if (!source || !page) return null;
    const personOrInstitution = clampText(item.personOrInstitution, 300);
    const text = clampText(item.text, 800);
    const type = item.type === "direct_quote" ? "direct_quote" : "paraphrase";
    const knownNames = [...(Array.isArray(source.authors) ? source.authors : [source.authors]), source.publisher, source.domain].filter(Boolean).map(normalizedComparableText);
    const normalizedPerson = normalizedComparableText(personOrInstitution);
    const pageText = normalizedComparableText(page.text);
    if (!personOrInstitution || !text || (!knownNames.some((name) => name && (name.includes(normalizedPerson) || normalizedPerson.includes(name))) && !pageText.includes(normalizedPerson))) return null;
    if (type === "direct_quote" && (text.split(/\s+/).filter(Boolean).length > 25 || !pageText.includes(normalizedComparableText(text)))) return null;
    if (type === "direct_quote") {
      const count = (quotedWords.get(sourceId) || 0) + text.split(/\s+/).length;
      if (count > 25) return null;
      quotedWords.set(sourceId, count);
    }
    const rawRole = clampText(item.role, 200);
    const role = rawRole && pageText.includes(normalizedComparableText(rawRole)) ? rawRole : "";
    return { id: `reference-${index + 1}`, personOrInstitution, year: source.year || "s. f.", role, text, type, sourceId, locator: clampText(item.locator || source.locator, 300), verificationStatus: "verified" };
  }).filter(Boolean);
}

function audienceResearchLenses(audience = "educators") {
  const specific = {
    educators: "práctica docente, didáctica, carga profesional, evaluación formativa y aprendizaje en el aula",
    students: "hábitos de estudio, motivación, autonomía, atención, bienestar y experiencia directa del estudiante",
    parents: "acompañamiento familiar, desarrollo, bienestar, comunicación y límites en el hogar",
    coordinators: "liderazgo neuropedagógico, acompañamiento docente, currículo, inclusión, clima escolar e indicadores institucionales"
  }[audience] || "educación y aprendizaje";
  return [
    `Evidencia académica, oficial y educativa actual sobre ${specific}. Prioriza páginas concretas y datos directamente aplicables a esta audiencia.`,
    `Voces influyentes y referencias documentales relacionadas con ${specific}. Busca entrevistas, discursos, libros accesibles, artículos institucionales o académicos que permitan atribuir una frase breve o una paráfrasis real. Marca como historical cualquier fuente anterior a la ventana actual.`,
    `Perspectivas independientes, implementación y casos verificables sobre ${specific}. Evita repetir dominios y prioriza universidades, organismos públicos y publicaciones profesionales.`
  ];
}

function periodKey(cadence, now = new Date()) {
  const iso = now.toISOString().slice(0, 10);
  if (cadence === "monthly") return iso.slice(0, 7);
  if (cadence === "weekly") {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return `${date.getUTCFullYear()}-W${String(Math.ceil((((date - yearStart) / 86400000) + 1) / 7)).padStart(2, "0")}`;
  }
  return iso;
}

async function assertEditorialAccess(authContext, db, { editor = false } = {}) {
  const acceptedRoles = editor
    ? ["admin", "administrator", "administrador", "superadmin", "owner", "editor", "editorial", "author", "autor", "developer", "desarrollo", "dev", "profe", "profesor", "docente"]
    : ["admin", "administrator", "administrador", "superadmin", "owner", "editor", "editorial", "author", "autor", "developer", "desarrollo", "dev", "member", "miembro", "user", "usuario", "reader", "lector", "teacher", "docente", "profesor"];
  const status = normalizeToken(authContext?.token?.approvalStatus || authContext?.token?.status || "");
  const role = normalizeToken(authContext?.role || authContext?.token?.role || authContext?.token?.rol || "");
  if (!["pending", "pendiente", "rejected", "rechazado", "blocked", "bloqueado"].includes(status) && acceptedRoles.includes(role)) return;
  const profile = await db.collection("users").doc(authContext.uid).get();
  const data = profile.exists ? profile.data() || {} : {};
  const profileStatus = normalizeToken(data.approvalStatus || data.status || data.estadoAprobacion || data.estado || "");
  const profileRole = normalizeToken(data.role || data.rol || data.userRole || data.requestedRole || "");
  if (!["pending", "pendiente", "rejected", "rechazado", "blocked", "bloqueado"].includes(profileStatus) && acceptedRoles.includes(profileRole)) return;
  throw Object.assign(new Error(editor ? "marcie_editor_role_required" : "marcie_user_not_approved"), { status: 403, code: editor ? "marcie_editor_role_required" : "marcie_user_not_approved" });
}

function rankTrendOpportunities(opportunities = []) {
  const momentumScores = { breakout: 100, rising: 78, steady: 52, emerging: 72 };
  const freshnessScores = { immediate: 100, recent: 76, monthly: 52 };
  const scored = opportunities.map((opportunity, discoveryIndex) => {
    const signals = Array.isArray(opportunity.signals) ? opportunity.signals : [];
    const momentumScore = momentumScores[normalizeToken(opportunity.momentum)] || 45;
    const freshnessScore = freshnessScores[normalizeToken(opportunity.freshness)] || 45;
    const signalScore = Math.min(100, Math.max(25, (signals.length / 4) * 100));
    const discoveryProminence = Math.max(35, 100 - (discoveryIndex * 7));
    const trendScore = Math.max(1, Math.round((momentumScore * 0.35) + (freshnessScore * 0.25) + (signalScore * 0.25) + (discoveryProminence * 0.15)));
    return {
      ...opportunity,
      sources: [],
      verificationStatus: "signal_based",
      trendScore,
      rankingFactors: {
        momentum: momentumScore,
        freshness: freshnessScore,
        signalStrength: Math.round(signalScore),
        discoveryProminence
      }
    };
  }).sort((left, right) => right.trendScore - left.trendScore);
  const totalScore = scored.reduce((total, opportunity) => total + opportunity.trendScore, 0);
  const exactUnits = scored.map((opportunity) => totalScore ? (opportunity.trendScore / totalScore) * 1000 : 0);
  const shareUnits = exactUnits.map(Math.floor);
  let remainingUnits = totalScore ? 1000 - shareUnits.reduce((total, value) => total + value, 0) : 0;
  exactUnits.map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((left, right) => right.remainder - left.remainder)
    .forEach(({ index }) => {
      if (remainingUnits <= 0) return;
      shareUnits[index] += 1;
      remainingUnits -= 1;
    });
  return scored.map((opportunity, index) => {
    const trendingPercent = shareUnits[index] / 10;
    return { ...opportunity, rank: index + 1, trendingPercent, viewPotentialPercent: trendingPercent };
  });
}

async function generateTrendCandidates({ client, region, cadence, model = DEFAULT_TEXT_MODEL, fallbackModels = MARCIE_FALLBACK_MODELS }) {
  const windows = { daily: "últimas 24 horas", weekly: "últimos 7 días", monthly: "últimos 30 días" };
  const prompt = `Realiza una exploración ABIERTA con Google Search de trending topics en ${region} durante ${windows[cadence]}. Descubre de qué se está hablando ahora dentro del ecosistema amplio de educación, pedagogía, neuroeducación, cerebro humano, neurociencia cognitiva, aprendizaje, memoria, atención, desarrollo infantil y adolescente, psicología educativa, bienestar socioemocional, inclusión, PNL aplicada a educación, tecnología educativa, inteligencia artificial y formación docente. No partas de una lista fija ni repitas temas genéricos: identifica conversaciones concretas que estén apareciendo, creciendo o conectándose con noticias, debates, preguntas o cambios recientes. Agrupa duplicados y devuelve entre 6 y 12 temas distintos, ordenados desde la conversación con mayor impulso hasta la menor. No inventes porcentajes, conteos ni volumen. Clasifica únicamente momentum como breakout, rising, emerging o steady; y freshness como immediate, recent o monthly. Devuelve SOLO JSON: {"opportunities":[{"topic":"tema específico descubierto","summary":"por qué está en conversación ahora","signals":["señal concreta observada en la búsqueda"],"momentum":"breakout|rising|emerging|steady","freshness":"immediate|recent|monthly","whyNow":"detonante actual"}]}`;
  const generated = await generateJson({ client, prompt, tools: [{ googleSearch: {} }], model, fallbackModels });
  const opportunities = (Array.isArray(generated.parsed.opportunities) ? generated.parsed.opportunities : [])
    .map((item) => ({
      ...item,
      topic: clampText(item?.topic, 300),
      summary: clampText(item?.summary, 2000),
      signals: Array.isArray(item?.signals) ? item.signals.map((signal) => clampText(signal, 600)).filter(Boolean).slice(0, 6) : [],
      momentum: ["breakout", "rising", "emerging", "steady"].includes(normalizeToken(item?.momentum)) ? normalizeToken(item.momentum) : "emerging",
      freshness: ["immediate", "recent", "monthly"].includes(normalizeToken(item?.freshness)) ? normalizeToken(item.freshness) : "recent",
      whyNow: clampText(item?.whyNow, 800),
      sources: []
    }))
    .filter((item) => item.topic)
    .slice(0, 10);
  return { opportunities, groundedSourceCount: groundingSources(generated.response).length };
}

async function refreshMarcieTrends({ now = new Date(), force = false, settingsOverride = {}, dependencies = {} } = {}) {
  const { db } = dependencies.db ? dependencies : getAdminServices();
  const client = researchClient(dependencies.client || createVertexClient({ location: "global" }), dependencies.signal);
  const settingsSnapshot = await db.collection("MarcieEditorialSettings").doc("global").get();
  const stored = settingsSnapshot.exists ? settingsSnapshot.data() || {} : {};
  const settings = { ...DEFAULT_SETTINGS, ...stored, ...settingsOverride };
  const cadence = ["daily", "weekly", "monthly"].includes(settings.cadence) ? settings.cadence : "weekly";
  const key = periodKey(cadence, now);
  const snapshotRef = db.collection("MarcieTrendSnapshots").doc(`${cadence}-${key}`);
  const existing = await snapshotRef.get();
  if (!force && existing.exists && Number(existing.data()?.schemaVersion) === TREND_SCHEMA_VERSION && existing.data()?.verificationStatus === "signal_based") {
    return { skipped: true, cadence, periodKey: key, snapshot: existing.data() };
  }
  const generated = await generateTrendCandidates({ client, region: settings.region || "MX", cadence, model: dependencies.model || DEFAULT_TEXT_MODEL });
  console.info(JSON.stringify({ severity: "INFO", event: "marcie_trend_discovery", cadence, region: settings.region || "MX", discovered: generated.opportunities.length, groundingChunks: generated.groundedSourceCount }));
  const opportunities = rankTrendOpportunities(generated.opportunities).map((item) => ({ ...item, region: settings.region || "MX", periodKey: key, generatedAt: now.toISOString() }));
  console.info(JSON.stringify({ severity: "INFO", event: "marcie_trend_ranking", cadence, region: settings.region || "MX", discovered: generated.opportunities.length, ranked: opportunities.length, topTopic: opportunities[0]?.topic || "", topTrendingPercent: opportunities[0]?.trendingPercent || 0 }));
  const snapshot = {
    id: snapshotRef.id, cadence, periodKey: key, region: settings.region || "MX", timezone: settings.timezone || "America/Cancun",
    opportunities, discoveryMode: "general_education_brain", generatedAt: now.toISOString(), verifiedAt: now.toISOString(), model: DEFAULT_TEXT_MODEL,
    report: {
      topTopic: opportunities[0]?.topic || "",
      topTrendingPercent: opportunities[0]?.trendingPercent || 0,
      topTrendScore: opportunities[0]?.trendScore || 0,
      methodology: "Estimación editorial comparativa basada en impulso, frescura, cantidad de señales y prominencia dentro de la exploración abierta de Google Search.",
      disclaimer: "El potencial de vistas es comparativo y no garantiza tráfico real."
    },
    schemaVersion: TREND_SCHEMA_VERSION, verificationStatus: opportunities.length ? "signal_based" : "blocked",
    pipelineStats: {
      discoveredTopicCount: generated.opportunities.length,
      rankedTopicCount: opportunities.length,
      groundingChunkCount: generated.groundedSourceCount
    },
    rejectedOpportunities: [], rejectionStats: {}, sourceAudit: []
  };
  await snapshotRef.set(snapshot, { merge: false });
  return { skipped: false, cadence, periodKey: key, snapshot };
}

async function researchArticleEvidenceServer(options = {}) {
  const dependencies = options.dependencies || {};
  // End provider work at the slice boundary, but let the verifier return its
  // completed evidence and pending candidates during the HTTP deadline grace.
  if (!(Number(options.timeBudgetMs) > 0) || dependencies.clock) return researchArticleEvidenceSlice(options);
  const controller = new AbortController();
  const parent = dependencies.signal;
  const abort = () => controller.abort(parent.reason);
  parent?.addEventListener("abort", abort, { once: true });
  if (parent?.aborted) abort();
  const timer = setTimeout(() => controller.abort(Object.assign(new Error("marcie_research_budget"), { code: "marcie_research_budget", status: 503 })), Number(options.timeBudgetMs));
  try {
    return await researchArticleEvidenceSlice({ ...options, dependencies: { ...dependencies, signal: controller.signal } });
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", abort);
  }
}

async function researchArticleEvidenceSlice({
  searchPlatforms,
  researchInstructions = [],
  topic = "",
  audience = "educators",
  audiences = [],
  mode = "marcie",
  minimumSources,
  region = "MX",
  period = "6m",
  model = "",
  videoEvidence = null,
  timeBudgetMs = 0,
  excludeUrls = [],
  startPlatformOffset = 0,
  pendingCandidates: previousPendingCandidates = [],
  dependencies = {}
} = {}) {
  const clockNow = dependencies.clock || Date.now;
  const startedAt = clockNow();
  const budgetExpired = () => dependencies.signal?.aborted || (timeBudgetMs > 0 && clockNow() - startedAt >= timeBudgetMs);
  const excludedUrls = new Set((Array.isArray(excludeUrls) ? excludeUrls : []).slice(0, 256).map((url) => String(url).trim().toLowerCase()).filter(Boolean));
  const client = researchClient(dependencies.client || createVertexClient({ location: "global" }), dependencies.signal);
  const researchModel = normalizeTextModel(model || dependencies.model || DEFAULT_TEXT_MODEL);
  const researchFallbackModels = Array.isArray(dependencies.fallbackModels)
    ? dependencies.fallbackModels.map((candidate) => normalizeTextModel(candidate)).filter((candidate) => candidate !== researchModel)
    : MARCIE_FALLBACK_MODELS;
  const now = dependencies.now instanceof Date ? dependencies.now : new Date();
  const dateWindow = researchDateWindow(period, now);
  const normalizedVideo = normalizeVideoEvidence(videoEvidence || {});
  const videoResearchFocus = normalizedVideo.sources.length
    ? `BASE DE VIDEO OBLIGATORIA: investiga y contrasta la idea central y su relación con la neuroeducación. Amplía esa relación con documentos verificables sin atribuir al video afirmaciones que no contiene. EJES: ${JSON.stringify(normalizedVideo.videoAxes)}. SÍNTESIS: ${normalizedVideo.summary}`
    : "";
  const editorialMode = normalizeToken(mode) === "aida" ? "aida" : "marcie";
  const requestedMinimum = researchPolicy.target({ editorialMode, editorialProfileSnapshot: { minimumSources } });
  const platformResults = [];
  const selectedPlatforms = researchPolicy.selection({ searchPlatforms });
  if (!selectedPlatforms.length) throw new Error("Selecciona al menos una plataforma o activa Otros sitios fiables.");
  const audienceFocus = audiences.length
    ? audiences.map((id) => `${id}: ${audienceResearchLenses(id)[0]}`).join("; ")
    : audienceResearchLenses(audience)[0];
  const researchLenses = researchPolicy.platforms.filter(platform => selectedPlatforms.includes(platform.id)).map(platform => ({
    ...platform,
    instruction: "Busca explícitamente en " + platform.name + " mediante " + platform.domains.map(domain => "site:" + domain).join(" OR ") + ". Sigue registros hacia documentos originales accesibles. No incluyas páginas comerciales ni buscadores como evidencia. Para estudios anteriores o sin fecha comprobada utiliza historical. " + audienceFocus
  }));
  // Broad discovery is optional and follows the saved selection.
  if (selectedPlatforms.includes("supplemental")) researchLenses.push({ ...researchPolicy.supplemental, instruction: researchPolicy.supplemental.instruction + " " + audienceFocus + " Excluye de esta búsqueda las plataformas desmarcadas: " + researchPolicy.platforms.filter(platform => !selectedPlatforms.includes(platform.id)).flatMap(platform => platform.domains).map(domain => "-site:" + domain).join(" ") });
  const platformPriority = ["supplemental", "scielo", "redalyc", "cochrane", "dialnet", "base", "ebsco", "refseek"];
  researchLenses.sort((left, right) => platformPriority.indexOf(left.id) - platformPriority.indexOf(right.id));
  const platformOffset = Math.max(0, Math.floor(Number(startPlatformOffset) || 0)) % researchLenses.length;
  if (platformOffset) researchLenses.push(...researchLenses.splice(0, platformOffset));
  let nextPlatformOffset = platformOffset;
  let quotaLimited = false;
  const currentYear = now.getUTCFullYear();
  const recentThresholdYear = currentYear - 5;
  const getRecencyScore = (source) => {
    const y = Number(bibliography.year(source));
    if (!Number.isFinite(y) || y < 1800) return { tier: 2, year: 0 };
    if (y >= recentThresholdYear && y <= currentYear + 1) return { tier: 0, year: y };
    return { tier: 1, year: y };
  };
  const sourceRank = (source) => {
    const { tier, year } = getRecencyScore(source);
    const invertedYear = String(9999 - year).padStart(4, "0");
    return [tier, invertedYear, Number(source.qualityTier || 9), String(source.publisher || source.title || "")].join(":");
  };

  const discoverPlatform = async (round, feedback, platform) => {
    const lens = platform.instruction;
    const prompt = `Investiga el tema "${clampText(topic, 2000)}" para ${audience}, región ${clampText(region, 80)}, perfil ${editorialMode}. El tema completo indicado por el usuario es el centro de la investigación: no lo reemplaces por ciencia o historia.
CRITERIO DE ACTUALIDAD CIENTÍFICA (ÚLTIMOS 5 AÑOS):
- Para referencias científicas y bibliografía académica, debes buscar y PREFERIR ACTIVAMENTE el hallazgo más reciente de los ÚLTIMOS 5 AÑOS (${recentThresholdYear} a ${currentYear}).
- Prioriza meta-análisis, revisiones sistemáticas y artículos de revistas científicas indexadas publicados entre ${recentThresholdYear} y ${currentYear}.
- EXCEPCIÓN VÁLIDA: Solo se admiten fuentes anteriores a ${recentThresholdYear} cuando la información científica o teoría fundacional no haya cambiado desde que se hizo el hallazgo o se publicó el artículo seminal original (por ejemplo: descubrimientos pioneros clásicos de Piaget, Vygotsky, Bowlby, Teicher, etc.). Cuando uses un estudio seminal clásico, complementa siempre con revisiones recientes que ratifiquen su vigencia.
- OBLIGACIÓN DE FECHA: Toda referencia científica debe incluir su fecha o año exacto de publicación comprobable (publishedAt en formato YYYY o YYYY-MM-DD). Prioriza siempre artículos que cuenten con fecha de publicación explícita para evitar referencias sin fecha (s. f.).
La ventana de actualidad ${dateWindow.from.slice(0, 10)} a ${dateWindow.to.slice(0, 10)} solo clasifica las señales recientes; no excluye estudios pertinentes anteriores. Los documentos anteriores o sin fecha comprobada se marcan historical y se pueden usar para explicar conocimientos y contexto, sin presentarlos como novedades.
ENFOQUE: ${lens}
PREFERENCIAS DE INVESTIGACIÓN: ${JSON.stringify(researchInstructions)}
${videoResearchFocus}
Las preferencias de tipo de fuente orientan la búsqueda; no cambian las plataformas seleccionadas ni permiten inventar evidencia. Región GLOBAL significa todas las regiones, sin restricción geográfica. Diversifica autorías y publicaciones; pueden coexistir varios documentos distintos en el mismo repositorio. Prioriza HTML o PDF accesible y sigue las referencias hacia documentos originales.
OBJETIVO TOTAL: ${requestedMinimum} documentos verificados. En esta búsqueda encuentra hasta ${Math.max(8, Math.min(20, Math.ceil(requestedMinimum / researchLenses.length) * 2))} documentos pertinentes.
RONDA ${round}: ${feedback}
Documentos ya comprobados en otra ejecución; busca otros distintos: ${[...excludedUrls].slice(-40).join("; ")}
No devuelvas portadas de buscadores ni inventes rutas, fechas, autores o frases. Si la URL lleva directamente a un PDF, incluye landingUrl solo cuando hayas encontrado la página HTML que enlaza ese PDF. Incluye dos consultas breves en inglés o español para catálogos científicos, con los conceptos centrales y sin instrucciones editoriales; en al menos una consulta enfoca hallazgos recientes. SOLO JSON: {"summary":"síntesis","searchQueries":["consulta científica concreta"],"sources":[{"id":"s1","title":"","url":"https://documento-concreto","landingUrl":"https://pagina-que-enlaza-el-pdf","authors":[],"publishedAt":"","publisher":"","doi":"","sourceType":"paper|book|official|report|dataset|other","evidenceRole":"current|historical"}],"facts":[{"id":"f1","claim":"","sourceIds":["s1"],"risk":"low|high"}],"currentSignals":[{"id":"signal-1","signal":"","sourceIds":["s1"]}],"historicalMilestones":[{"year":"","personOrInstitution":"","contribution":"","sourceIds":["s1"]}]}`;
    let generated;
    try {
      generated = await generateJson({ client, prompt, tools: [{ googleSearch: {} }], model: researchModel, fallbackModels: researchFallbackModels,
        researchQuery: topic, researchDomains: researchPolicy.platforms.find(p => p.id === platform.id)?.domains || [],
        excludedDomains: platform.id === 'supplemental' ? researchPolicy.platforms.filter(p => !selectedPlatforms.includes(p.id)).flatMap(p => p.domains) : [] });
      platformResults.push({ id: platform.id, name: `Búsqueda web en ${platform.name}`, round, query: lens, status: "searched", discoveryMethod: "open_search", candidateCount: generated.parsed.sources?.length || 0 });
    } catch (error) {
      platformResults.push({ id: platform.id, name: `Búsqueda web en ${platform.name}`, round, query: lens, status: "error", error: error.code || error.message });
      if (Number(error?.status || error?.code) === 429 || /RESOURCE_EXHAUSTED|Too Many Requests|"code"\s*:\s*429/i.test(String(error?.message || ""))) quotaLimited = true;
      generated = { parsed: { sources: [], facts: [], currentSignals: [], historicalMilestones: [] }, response: {} };
    }
    let catalogSources = [];
    if (platform.id === "supplemental" && round <= 2 && !quotaLimited && !budgetExpired()) {
      const queries = (Array.isArray(generated.parsed.searchQueries) ? generated.parsed.searchQueries : []).filter(Boolean).slice(0, 2);
      const catalog = await (dependencies.searchScientificCatalogs || searchScientificCatalogs)({ queries: queries.length ? queries : [clampText(topic, 120)] });
      catalogSources = catalog.sources;
      for (const result of catalog.results) platformResults.push({ ...result, name: `${result.id === "europe_pmc" ? "Europe PMC" : "Crossref"} (API)`, round, discoveryMethod: "catalog_api" });
    }
    const idMap = new Map();
    const candidates = [...catalogSources, ...(generated.parsed.sources || []), ...groundingSources(generated.response)].map((source, sourceIndex) => {
      const originalId = clampText(source.id, 120) || `source-${sourceIndex + 1}`;
      const id = stableSourceId(source.url);
      idMap.set(originalId, id);
      return { ...source, id, discoveredVia: [...new Set([platform.id, ...(source.discoveredVia || [])])] };
    });
    candidates.sort((a, b) => {
      const yearA = Number(String(a.year || a.publishedAt || "").match(/\b(?:18|19|20)\d{2}\b/)?.[0] || 0);
      const yearB = Number(String(b.year || b.publishedAt || "").match(/\b(?:18|19|20)\d{2}\b/)?.[0] || 0);
      const recentA = yearA >= recentThresholdYear ? 1 : 0;
      const recentB = yearB >= recentThresholdYear ? 1 : 0;
      if (recentA !== recentB) return recentB - recentA;
      return yearB - yearA;
    });
    const remapEvidence = (items) => (Array.isArray(items) ? items : []).map((item) => ({
      ...item,
      sourceIds: (item.sourceIds || []).map((id) => idMap.get(String(id))).filter(Boolean)
    }));
    return {
      summary: clampText(generated.parsed.summary, 1600),
      facts: remapEvidence(generated.parsed.facts),
      currentSignals: remapEvidence(generated.parsed.currentSignals),
      historicalMilestones: remapEvidence(generated.parsed.historicalMilestones),
      candidates
    };
  };
  const discover = async (round, feedback, platforms) => {
    if (budgetExpired() || quotaLimited || dependencies.signal?.aborted) return [];
    return Promise.all(platforms.map(platform => discoverPlatform(round, feedback, platform)));
  };
  const generatedBatches = [];
  const verified = { verifiedSources: [], rejectedSources: [], retrievedPages: [] };
  const datedSourceCount = () => verified.verifiedSources.filter(hasVerifiedPublicationYear).length;
  const attempted = new Map();
  const skippedLandingUrls = new Set();
  const sourceAliases = new Map();
  const retrievalCache = dependencies.retrieveOptions ? new Map() : sharedPageCache;
  const retrieveOptions = sourceRetrieveOptions({ client, model: researchModel, fallbackModels: researchFallbackModels, maxUrls: 2, overrides: dependencies.retrieveOptions });
  const verificationBatchSize = timeBudgetMs > 0 ? Math.min(8, researchPolicy.searchBudget.verificationBatchSize) : researchPolicy.searchBudget.verificationBatchSize;
  const maxPendingCandidates = researchPolicy.searchBudget.maxCandidates;
  let pendingCandidates = (Array.isArray(previousPendingCandidates) ? previousPendingCandidates : []).slice(0, maxPendingCandidates).filter((candidate) =>
    candidate && typeof candidate === "object" && /^https?:\/\//i.test(String(candidate.url || "")) && !excludedUrls.has(String(candidate.url).toLowerCase()));
  let pendingCandidateCount = 0;
  const verifyNewCandidates = async (candidates) => {
    let processedCandidates = 0;
    for (let offset = 0; offset < candidates.length && datedSourceCount() < requestedMinimum && !budgetExpired(); offset += verificationBatchSize) {
      const batch = await (dependencies.verifyCandidateSources || verifyCandidateSources)({
        candidates: candidates.slice(offset, offset + verificationBatchSize),
        context: `${topic}\nPreferencias: ${JSON.stringify(researchInstructions)}`,
        assessSources: createSourceAssessor(client, { model: researchModel, fallbackModels: researchFallbackModels }), retrievalCache,
        maxCandidates: verificationBatchSize,
        retrievalConcurrency: 6,
        retrieveOptions,
        dateWindow, allowHistorical: true
      });
      for (const source of batch.verifiedSources) {
        const key = String(source.doi || source.url).toLowerCase();
        const previous = verified.verifiedSources.find(item => String(item.doi || item.url).toLowerCase() === key);
        sourceAliases.set(source.id, previous?.id || source.id);
        if (previous) previous.discoveredVia = [...new Set([...(previous.discoveredVia || []), ...(source.discoveredVia || [])])];
        else verified.verifiedSources.push(source);
      }
      verified.rejectedSources.push(...batch.rejectedSources);
      quotaLimited ||= batch.quotaLimited === true;
      verified.retrievedPages.push(...batch.retrievedPages);
      processedCandidates += Math.min(verificationBatchSize, candidates.length - offset);
      if (quotaLimited) break;
    }
    const retryableIds = new Set(verified.rejectedSources.filter((source) => source.reason === "verification_error" || (source.reason === "unreachable" && !source.httpStatus)).map((source) => String(source.id)));
    const verifiedIds = new Set(verified.verifiedSources.map((source) => String(source.id)));
    return datedSourceCount() >= requestedMinimum ? [] : [
      ...candidates.slice(0, processedCandidates)
        .filter((source) => retryableIds.has(String(source.id)) && !verifiedIds.has(String(source.id)))
        .map((source) => ({ ...source, verificationAttempts: Number(source.verificationAttempts || 0) + (quotaLimited ? 0 : 1) }))
        .filter((source) => quotaLimited || source.verificationAttempts < 2),
      ...candidates.slice(processedCandidates)
    ].slice(0, maxPendingCandidates);
  };
  if (pendingCandidates.length) pendingCandidates = await verifyNewCandidates(pendingCandidates);
  const processDiscoveredBatches = async (batches, lensOffset) => {
    generatedBatches.push(...batches);
    const newCandidates = [];
    const deferredCandidates = [];
    for (const candidate of batches.flatMap(batch => batch.candidates)) {
      if (excludedUrls.has(String(candidate.url || "").trim().toLowerCase())) continue;
      if (isGenericLandingUrl(candidate.url)) {
        const url = String(candidate.url).toLowerCase();
        if (!skippedLandingUrls.has(url)) {
          skippedLandingUrls.add(url);
          verified.rejectedSources.push({ id: candidate.id, url: candidate.url, title: candidate.title, discoveredVia: candidate.discoveredVia || [], reason: "generic_homepage" });
        }
        continue;
      }
      const previous = attempted.get(candidate.id);
      if (previous) {
        previous.discoveredVia = [...new Set([...previous.discoveredVia, ...candidate.discoveredVia])];
        const accepted = verified.verifiedSources.find(source => source.id === (sourceAliases.get(candidate.id) || candidate.id));
        if (accepted) accepted.discoveredVia = [...new Set([...(accepted.discoveredVia || []), ...candidate.discoveredVia])];
        continue;
      }
      if (attempted.size >= researchPolicy.searchBudget.maxCandidates) {
        deferredCandidates.push(candidate);
        continue;
      }
      attempted.set(candidate.id, candidate);
      newCandidates.push(candidate);
    }
    const unresolved = await verifyNewCandidates(newCandidates);
    const verifiedUrls = new Set(verified.verifiedSources.map((source) => String(source.requestedUrl || source.url || "").toLowerCase()));
    pendingCandidates = [...new Map([...pendingCandidates, ...unresolved, ...deferredCandidates]
      .filter((candidate) => !verifiedUrls.has(String(candidate.url || "").toLowerCase()))
      .map((candidate) => [String(candidate.url).toLowerCase(), candidate])).values()].slice(0, maxPendingCandidates);
    pendingCandidateCount = pendingCandidates.length;
    nextPlatformOffset = (platformOffset + lensOffset + batches.length) % researchLenses.length;
  };
  // Only fan out across selected platforms and the sources still required.
  const parallelBudget = timeBudgetMs > 0 ? Math.max(1, Math.ceil(timeBudgetMs / 15_000)) : 10;
  const platformStride = Math.min(10, parallelBudget, Math.max(1, requestedMinimum - datedSourceCount()));
  for (let round = 1; round <= researchPolicy.searchBudget.maxRounds && datedSourceCount() < requestedMinimum && !quotaLimited && !budgetExpired(); round++) {
    for (let lensOffset = 0; lensOffset < researchLenses.length && datedSourceCount() < requestedMinimum && !quotaLimited && !budgetExpired(); lensOffset += platformStride) {
      const strategies = [
        "Busca el tema y la audiencia con términos exactos; pide artículos o informes con título, autor, fecha y enlace directo.",
        "Reformula con sinónimos en español y variantes del contexto educativo; considera autores, instituciones y estudios que conozcas, busca su DOI o página canónica y comprueba el documento, no portadas ni fichas de buscador.",
        "Traduce los conceptos principales al inglés y combina revisiones sistemáticas, guías institucionales y estudios originales; prueba autores y publicaciones reconocidos que recuerdes, pero comprueba cada enlace."
      ];
      const feedback = `${strategies[Math.min(round - 1, strategies.length - 1)]} Faltan ${Math.max(0, requestedMinimum - datedSourceCount())} fuentes con fecha comprobada. Conserva los documentos sin fecha ya verificados como respaldo. Ya comprobados: ${[...attempted.values()].map(source => source.url).join("; ")}. Problemas previos: ${[...new Set(verified.rejectedSources.map(source => source.reason))].join(", ")}.`;
      const batches = await discover(round, feedback, researchLenses.slice(lensOffset, lensOffset + platformStride));
      await processDiscoveredBatches(batches, lensOffset);
      if (round === 1 && datedSourceCount() < requestedMinimum && !pendingCandidateCount && !quotaLimited && !budgetExpired()) {
        const retryFeedback = `${strategies[1]} Cambia las palabras de la consulta anterior y busca documentos distintos. URLs ya descartadas: ${verified.rejectedSources.slice(-20).map(source => source.url).filter(Boolean).join("; ")}.`;
        await processDiscoveredBatches(await discover(2, retryFeedback, researchLenses.slice(lensOffset, lensOffset + platformStride)), lensOffset);
      }
      if (quotaLimited) break;
    }
    if (attempted.size >= researchPolicy.searchBudget.maxCandidates || quotaLimited) break;
  }
  // Paid discovery runs only after accessible candidates have actually been verified.
  if (require('./research/budget.js').currentContext()?.dossierId && datedSourceCount() < requestedMinimum && !pendingCandidates.length && !quotaLimited && !budgetExpired() && await require('./research/budget.js').groundingConfigured()) {
    const { prepareResearch } = require('./research/search.js');
    const permittedDomains = selectedPlatforms.includes('supplemental') ? [] : researchLenses.flatMap(p => p.domains || []);
    const excludedDomains = researchPolicy.platforms.filter(p => !selectedPlatforms.includes(p.id)).flatMap(p => p.domains);
    for (let attempt = 0; attempt < 2 && datedSourceCount() < requestedMinimum && !budgetExpired(); attempt++) {
      const query = `${topic} ${attempt ? 'systematic review original research' : 'revisión sistemática estudio original'} ${currentYear}`.slice(0, 300);
      const discovery = await prepareResearch({ prompt: '', client, model: researchModel, query, domains: permittedDomains, excludedDomains,
        evidenceGap: `Solo ${datedSourceCount()} documentos verificados con fecha para ${topic}; se requieren ${requestedMinimum}.`,
        reformulation: attempt ? 'La primera consulta no completó la evidencia; cambiar a terminología académica inglesa.' : undefined });
      const paid = discovery.sources.filter(source => source.discoveredVia?.includes('grounding'));
      platformResults.push({ id: 'grounding', status: paid.length ? 'searched' : 'unavailable_or_budget_disabled', round: attempt + 1, candidateCount: paid.length });
      if (!paid.length) break;
      await processDiscoveredBatches([{ summary: '', facts: [], currentSignals: [], historicalMilestones: [],
        candidates: paid.map(source => ({ ...source, id: stableSourceId(source.url) })) }], 0);
    }
  }
  pendingCandidateCount = pendingCandidates.length;
  const dateSearchComplete = datedSourceCount() >= requestedMinimum
    || (!quotaLimited && !budgetExpired() && !pendingCandidateCount && platformResults.filter((platform) => platform.discoveryMethod !== "catalog_api").every((platform) => platform.status === "searched"));
  verified.verifiedSources.sort((left, right) => sourceRank(left).localeCompare(sourceRank(right)));
  const generated = { parsed: {
    summary: generatedBatches.map((batch) => batch.summary).filter(Boolean).join(" "),
    facts: generatedBatches.flatMap((batch) => batch.facts),
    currentSignals: generatedBatches.flatMap((batch) => batch.currentSignals),
    historicalMilestones: generatedBatches.flatMap((batch) => batch.historicalMilestones)
  } };
  const currentSourceIds = new Set(verified.verifiedSources.filter((source) => source.evidenceRole !== "historical").map((source) => String(source.id)));
  const historicalSourceIds = new Set(verified.verifiedSources.filter((source) => source.evidenceRole === "historical").map((source) => String(source.id)));
  const ids = new Set([...currentSourceIds, ...historicalSourceIds]);
  const sourcesById = new Map(verified.verifiedSources.map((source) => [String(source.id), source]));
  const currentSources = verified.verifiedSources.filter((source) => source.evidenceRole !== "historical");
  const filterEvidence = items => {
    const seen = new Set();
    return (Array.isArray(items) ? items : []).map(item => ({ ...item, sourceIds: [...new Set((item.sourceIds || []).map(id => sourceAliases.get(String(id)) || String(id)).filter(id => ids.has(id)))] })).filter(item => {
      const key = normalizedComparableText(item.claim || item.signal || item.text || item.contribution || "") + ":" + [...item.sourceIds].sort().join(",");
      if (!item.sourceIds.length || seen.has(key)) return false;
      seen.add(key); return true;
    });
  };
  // Findings come from retrieved-document analysis, not unverified search snippets.
  const facts = verified.verifiedSources.map(source => ({
    id: `finding-${source.id}`, claim: source.supportSummary, sourceIds: [source.id],
    locator: source.locator, evidenceRole: source.evidenceRole, year: source.year
  }));
  const historicalMilestones = filterEvidence(generated.parsed.historicalMilestones).map((milestone) => ({
    ...milestone,
    sourceIds: milestone.sourceIds.filter((id) => historicalSourceIds.has(id))
  })).filter((milestone) => {
    if (editorialMode !== "aida") return true;
    const domains = new Set(milestone.sourceIds.map((id) => sourcesById.get(id)?.domain).filter(Boolean));
    return milestone.sourceIds.length >= 2 && domains.size >= 2 && milestone.sourceIds.some((id) => Number(sourcesById.get(id)?.qualityTier) === 1);
  }).slice(0, 4);
  const currentSignals = filterEvidence(generated.parsed.currentSignals).map((signal) => ({
    ...signal,
    sourceIds: signal.sourceIds.filter((id) => currentSourceIds.has(id))
  })).filter((signal) => signal.sourceIds.length).map((signal, index) => ({
    ...signal,
    id: clampText(signal.id, 120) || `signal-${index + 1}`,
    signal: clampText(signal.signal || signal.text, 800)
  })).filter((signal) => signal.signal).slice(0, 8);
  const institutionCount = new Set(verified.verifiedSources.map((source) => clampText(source.publisher || source.domain, 300).toLowerCase()).filter(Boolean)).size;
  const verifiedSummary = facts.map(fact => fact.claim).join(" ");
  const blockers = [];
  const requiredMinimum = requestedMinimum;
  if (!verified.verifiedSources.length) blockers.push("La investigación no encontró ninguna fuente verificable después de completar las rondas de búsqueda.");
  if (verified.verifiedSources.length && verified.verifiedSources.length < requestedMinimum) blockers.push(`Se verificaron ${verified.verifiedSources.length} de ${requestedMinimum} fuentes requeridas.`);
  if (pendingCandidateCount && verified.verifiedSources.length < requestedMinimum) blockers.push(`Quedan ${pendingCandidateCount} resultados sin analizar por el límite técnico de esta ejecución. Acota el tema y reintenta.`);
  if (quotaLimited) blockers.push("Gemini alcanzó temporalmente su cuota de investigación. Reanuda cuando el servicio esté disponible.");
  if (!dateSearchComplete && datedSourceCount() < requestedMinimum) blockers.push(`La búsqueda de fuentes fechadas quedó pendiente: ${datedSourceCount()} de ${requestedMinimum} con fecha comprobada. Reanuda antes de usar fuentes sin fecha como respaldo.`);
  const recommendations = institutionCount < 2 ? ["Conviene contrastar con otras autorías o publicaciones independientes."] : [];
  if (verified.verifiedSources.length > 0 && verified.verifiedSources.length < requiredMinimum) recommendations.push(`Se encontraron ${verified.verifiedSources.length} de ${requiredMinimum} fuentes requeridas; amplía la investigación antes de redactar.`);
  let attributedReferences = [];
  try { if (!budgetExpired() && verified.verifiedSources.length >= requestedMinimum) attributedReferences = await extractAttributedReferences({ client, verifiedSources: verified.verifiedSources, retrievedPages: verified.retrievedPages, model: researchModel, fallbackModels: researchFallbackModels }); }
  catch (_) { recommendations.push("No se pudieron extraer citas textuales; utiliza paráfrasis de los hallazgos verificados."); }
  const combinedSources = [...verified.verifiedSources, ...normalizedVideo.sources];
  const combinedFacts = [...facts, ...normalizedVideo.facts];
  return {
    schemaVersion: "2.0",
    editorialMode,
    topic: clampText(topic, 500),
    summary: [normalizedVideo.summary, verifiedSummary].filter(Boolean).join(" ") || "No se recuperó evidencia documental pertinente y verificable.",
    currentSignals,
    facts: combinedFacts,
    sources: combinedSources,
    analysisStatus: pendingCandidateCount && verified.verifiedSources.length < requestedMinimum ? "incomplete" : "complete",
    analysis: { sourceIds: combinedSources.map(source => source.id), examinedCandidateCount: attempted.size, rejectedCount: verified.rejectedSources.length, pendingCandidateCount },
    researchInstructions,
    researchRegion: region,
    researchPolicyVersion: researchPolicy.version,
    searchPlatforms: selectedPlatforms,
    platformResults: platformResults.map(platform => ({
      ...platform,
      verifiedCount: verified.verifiedSources.filter(source => source.discoveredVia?.includes(platform.id)).length,
      rejected: verified.rejectedSources.filter(source => source.discoveredVia?.includes(platform.id))
    })),
    pendingCandidates: pendingCandidates.slice(0, maxPendingCandidates).map(({ id, url, landingUrl, title, authors, publishedAt, publisher, doi, sourceType, evidenceRole, discoveredVia, verificationAttempts }) => ({ id, url, landingUrl, title, authors, publishedAt, publisher, doi, sourceType, evidenceRole, discoveredVia, verificationAttempts: Number(verificationAttempts || 0) })),
    dateSearchComplete,
    datedSourceCount: datedSourceCount(),
    quotaLimited,
    nextPlatformOffset,
    researchPeriod: dateWindow.period,
    dateWindow,
    currentSourceCount: currentSources.length,
    historicalSourceCount: verified.verifiedSources.length - currentSources.length,
    historicalMilestones,
    attributedReferences,
    rejectedSources: verified.rejectedSources,
    verifiedSourceCount: verified.verifiedSources.length,
    totalSourceCount: combinedSources.length,
    documentSourceCount: verified.verifiedSources.length,
    videoSourceCount: normalizedVideo.sources.length,
    institutionCount,
    blockers,
    recommendations: [...recommendations, ...normalizedVideo.warnings],
    minimumSourceCount: 1,
    targetSourceCount: requestedMinimum,
    verificationStatus: blockers.length ? "blocked" : "verified",
    researchedAt: now.toISOString(),
    telemetry: { modeUsed: editorialMode, model: researchModel, fallbackModels: researchFallbackModels, durationMs: clockNow() - startedAt, searches: generatedBatches.length, retrievedUrls: verified.verifiedSources.map((source) => source.url), videoCount: normalizedVideo.sources.length }
  };
}

async function researchArticleEvidenceBundleServer({ audiences = [], audienceBriefs = {}, minimumSources = 4, ...options } = {}) {
  const selected = [...new Set(audiences.map(String))].filter((id) => ["educators", "students", "parents", "coordinators"].includes(id));
  if (!selected.length) throw Object.assign(new Error("Selecciona al menos un público."), { status: 400 });
  const target = researchPolicy.target({ editorialProfileSnapshot: { minimumSources } });
  const sharedTarget = researchPolicy.sharedTarget({ editorialProfileSnapshot: { sharedMinimumSources: 2 } });
  const specificTarget = Math.max(
    researchPolicy.specificTarget({ editorialProfileSnapshot: { specificMinimumSources: 2 } }),
    target - sharedTarget
  );
  const shared = await researchArticleEvidenceServer({
    ...options, audiences: selected, audience: selected.join(", "),
    topic: `${clampText(options.topic, 600)}. ${selected.map((id) => `${id}: ${clampText(audienceBriefs[id], 300)}`).join("; ")}`,
    minimumSources: Math.min(30, Math.max(target, sharedTarget + (specificTarget * selected.length)))
  });
  return selectArticleEvidenceServer({ dossier: shared, audiences: selected, audienceBriefs, minimumSources, topic: options.topic, dependencies: options.dependencies });
}

async function selectArticleEvidenceServer({ dossier: shared = {}, audiences = [], audienceBriefs = {}, minimumSources = 4, topic = "", dependencies = {} } = {}) {
  const selected = [...new Set((Array.isArray(audiences) ? audiences : []).map(String))].filter((id) => ["educators", "students", "parents", "coordinators"].includes(id));
  if (!selected.length) throw Object.assign(new Error("Selecciona al menos un público."), { status: 400 });
  const target = researchPolicy.target({ editorialProfileSnapshot: { minimumSources } });
  const sharedTarget = researchPolicy.sharedTarget({ editorialProfileSnapshot: { sharedMinimumSources: 2 } });
  const specificTarget = Math.max(researchPolicy.specificTarget({ editorialProfileSnapshot: { specificMinimumSources: 2 } }), target - sharedTarget);
  if (!Array.isArray(shared.sources) || shared.sources.length > 80 || JSON.stringify(shared).length > 1_000_000) throw Object.assign(new Error("El expediente de investigación no es válido."), { status: 400 });
  const documents = shared.sources.filter((source) => source.verificationStatus === "verified");
  const videoSources = shared.sources.filter((source) => source.sourceType === "youtube_video" && source.verificationStatus === "attributed_only");
  const client = researchClient(dependencies.client || createVertexClient({ location: "global" }), dependencies.signal);
  let matches = [];
  let requestedSharedIds = [];
  let classificationFailed = false;
  if (documents.length) {
    try {
      const prompt = `Clasifica la pertinencia DIRECTA de documentos ya verificados para cada público y selecciona fuentes transversales. No inventes hallazgos. Tema: ${clampText(topic, 600)}. Públicos y enfoques: ${JSON.stringify(audienceBriefs)}. Documentos: ${JSON.stringify(documents.map((source) => ({ id: source.id, title: source.title, finding: source.supportSummary })).slice(0, 30))}. Devuelve SOLO JSON {"sharedIds":["ID"],"matches":[{"id":"ID","audiences":["educators"]}]}. sharedIds debe contener al menos ${sharedTarget} documentos pertinentes para TODOS los públicos; matches debe incluir cada documento pertinente para cada público.`;
      const parsed = (await generateJson({ client, prompt, maxOutputTokens: 2048 })).parsed || {};
      if (!Array.isArray(parsed.matches)) throw new Error("La clasificación no devolvió coincidencias válidas.");
      matches = parsed.matches;
      requestedSharedIds = Array.isArray(parsed.sharedIds) ? parsed.sharedIds.map(String) : [];
    } catch (error) {
      classificationFailed = true;
      console.warn("[MarcieResearch] No se completó la clasificación de fuentes compartidas", error?.code || error?.message);
    }
  }
  const documentById = new Map(documents.map((source) => [String(source.id), source]));
  const relevance = new Map(documents.map((source) => [String(source.id), new Set()]));
  matches.forEach((item) => {
    const id = String(item?.id || "");
    if (!relevance.has(id)) return;
    (Array.isArray(item?.audiences) ? item.audiences : []).map(String).forEach((audience) => {
      if (selected.includes(audience)) relevance.get(id).add(audience);
    });
  });
  // Keep documents available for provisional drafts if classification fails,
  // but never treat a valid empty classification as audience relevance.
  if (classificationFailed) documents.forEach((source) => selected.forEach((audience) => relevance.get(String(source.id)).add(audience)));
  const selectCurrentYear = new Date().getUTCFullYear();
  const selectRecentThresholdYear = selectCurrentYear - 5;
  const selectRecencyScore = (source) => {
    const y = Number(bibliography.year(source));
    if (!Number.isFinite(y) || y < 1800) return { tier: 2, year: 0 };
    if (y >= selectRecentThresholdYear && y <= selectCurrentYear + 1) return { tier: 0, year: y };
    return { tier: 1, year: y };
  };
  const sourceRank = (source) => {
    const { tier, year } = selectRecencyScore(source);
    const invertedYear = String(9999 - year).padStart(4, "0");
    return [tier, invertedYear, Number(source.qualityTier || 9), String(source.publisher || source.title || "")].join(":");
  };
  const rankedDocuments = [...documents].sort((left, right) => sourceRank(left).localeCompare(sourceRank(right)));
  const universalPool = rankedDocuments.filter((source) => selected.every((audience) => relevance.get(String(source.id))?.has(audience)));
  const requestedShared = requestedSharedIds.map((id) => documentById.get(id)).filter((source) => source && universalPool.some((item) => item.id === source.id));
  const sharedSources = [...new Map([...requestedShared, ...universalPool].map((source) => [String(source.id), source])).values()]
    .sort((left, right) => sourceRank(left).localeCompare(sourceRank(right))).slice(0, sharedTarget);
  const sharedIds = new Set(sharedSources.map((source) => String(source.id)));
  const byAudience = {};
  for (const audience of selected) {
    const specificPool = rankedDocuments.filter((source) => !sharedIds.has(String(source.id)) && relevance.get(String(source.id))?.has(audience));
    const fallbackSpecific = classificationFailed ? rankedDocuments.filter((source) => !sharedIds.has(String(source.id)) && !specificPool.some((item) => item.id === source.id)) : [];
    const specificSources = [...specificPool, ...fallbackSpecific].slice(0, specificTarget);
    const sources = [...sharedSources, ...specificSources, ...videoSources];
    const ids = new Set(sources.map((source) => String(source.id)));
    const facts = (Array.isArray(shared.facts) ? shared.facts : []).filter((fact) => fact.sourceIds?.some((id) => ids.has(String(id))));
    const count = sources.filter((source) => source.verificationStatus === "verified").length;
    const specificIds = specificSources.map((source) => String(source.id));
    const blockers = [];
    if (classificationFailed) blockers.push("No se pudo confirmar la pertinencia de los documentos para este público.");
    if (sharedSources.length < sharedTarget) blockers.push(`Faltan fuentes comunes reutilizables: ${sharedSources.length} de ${sharedTarget}.`);
    if (specificSources.length < specificTarget) blockers.push(`Faltan fuentes específicas del artículo: ${specificSources.length} de ${specificTarget}.`);
    if (!shared.dateSearchComplete && sources.filter(hasVerifiedPublicationYear).length < sharedTarget + specificTarget) {
      blockers.push(`La búsqueda de fuentes fechadas quedó pendiente: ${sources.filter(hasVerifiedPublicationYear).length} de ${sharedTarget + specificTarget} con fecha comprobada. Reanuda antes de usar fuentes sin fecha como respaldo.`);
    }
    byAudience[audience] = {
      ...shared, audience, sources, facts,
      attributedReferences: (Array.isArray(shared.attributedReferences) ? shared.attributedReferences : []).filter((item) => ids.has(String(item.sourceId))),
      analysis: { ...(shared.analysis || {}), sourceIds: sources.map((source) => String(source.id)) },
      sharedSourceIds: [...sharedIds], specificSourceIds: specificIds,
      sharedSourceCount: sharedSources.length, specificSourceCount: specificSources.length,
      sharedSourceTarget: sharedTarget, specificSourceTarget: specificTarget,
      verifiedSourceCount: count, targetSourceCount: sharedTarget + specificTarget,
      blockers, verificationStatus: blockers.length ? "blocked" : "verified"
    };
  }
  return { byAudience, sharedSourceCount: sharedSources.length };
}

function articleText(article = {}, topic = "") {
  return `${article.title || topic}\n${article.subtitle || ""}\n${(Array.isArray(article.blocks) ? article.blocks : []).map((block) => block?.text || (Array.isArray(block?.items) ? block.items.join(". ") : "")).filter(Boolean).join("\n")}`.slice(0, 16000);
}

async function verifyArticleEvidenceServer({ article = {}, topic = "", additionalSearches = 0, dependencies = {} } = {}) {
  const client = researchClient(dependencies.client || createVertexClient({ location: "global" }), dependencies.signal);
  const retrieveOptions = sourceRetrieveOptions({ client, maxUrls: 8, overrides: dependencies.retrieveOptions });
  const text = articleText(article, topic);
  const uniqueCandidates = new Map();
  for (const source of [...(article.researchSources || []), ...(article.sources || []), ...(article.usedSources || []), ...bibliography.sources(article), ...(article.sourceCandidates || [])]) {
    if (source?.url && !uniqueCandidates.has(source.url)) uniqueCandidates.set(source.url, source);
  }
  const videoSources = [...uniqueCandidates.values()].filter((source) => source?.sourceType === "youtube_video");
  let candidates = [...uniqueCandidates.values()].filter((source) => source?.sourceType !== "youtube_video");
  const verified = { verifiedSources: [], rejectedSources: [], retrievedPages: [] };
  for (let offset = 0; offset < candidates.length; offset += 8) {
    // La comprobación documental valida que el documento sea pertinente al
    // tema. Las afirmaciones concretas se contrastan después con su contenido.
    // Pasar el artículo entero aquí hacía que una fuente válida se descartara
    // por no respaldar cada sección del borrador.
    const documentContext = `${topic || article.title || ""}. ${article.subtitle || ""}`.trim();
    const batch = await verifyCandidateSources({ candidates: candidates.slice(offset, offset + 8), maxCandidates: 8, retrievalConcurrency: dependencies.retrievalConcurrency || 4, context: documentContext, assessSources: createSourceAssessor(client), retrievalCache: dependencies.retrievalCache || (dependencies.retrieveOptions ? new Map() : sharedPageCache), retrieveOptions, allowHistorical: true });
    for (const field of Object.keys(verified)) verified[field].push(...batch[field]);
  }
  const pagesById = new Map(verified.retrievedPages.map((page) => [page.id, page]));
  const usablePages = verified.verifiedSources.map((source) => ({ source, page: pagesById.get(source.id) })).filter((item) => item.page);
  let result = { claims: [], contradictions: [] };
  if (usablePages.length || videoSources.length) {
    const prompt = `Extrae las afirmaciones del artículo y comprueba su respaldo. Distingue video_attribution (lo que el artículo atribuye explícitamente al autor, persona o canal) de external_fact (hechos independientes). Una fuente de video puede respaldar solo video_attribution; nunca basta para verificar external_fact. Marca como unsupported cualquier idea del video presentada sin atribución clara. Detecta citas o paráfrasis demasiado extensas o cercanas al video: el artículo debe tener estructura y redacción originales y ampliar la idea con documentos verificados. Opiniones y preguntas no son afirmaciones. No supongas respaldo. Marca contradicciones.\nARTÍCULO:\n${text}\nDOCUMENTOS:\n${usablePages.map(({ source, page }) => `ID ${source.id} (${source.qualityTier}) ${source.title}\n${page.text.slice(0, 4200)}`).join("\n\n") || "Sin documentos recuperados"}\nVIDEOS (solo atribución):\n${videoSources.map((source) => `ID ${source.id} ${source.title} ${source.locator || ""}\n${source.supportSummary || "Sin resumen"}`).join("\n\n") || "Sin videos"}\nSOLO JSON: {"claims":[{"id":"claim-1","blockId":"","text":"afirmación exacta","evidenceKind":"video_attribution|external_fact","risk":"low|medium|high","status":"supported|partially_supported|unsupported|contradicted","sourceIds":["source-1"],"supportSummary":"","locator":""}],"contradictions":[""]}`;
    result = (await generateJson({ client, prompt })).parsed;
  }
  const preservedSources = [...verified.verifiedSources, ...videoSources];
  const sourcesById = new Map(preservedSources.map((source) => [source.id, source]));
  const claims = (Array.isArray(result.claims) ? result.claims : []).map((claim, index) => {
    const historicalClaim = /\b(?:1[5-9]\d{2}|20\d{2})\b|\b(?:descubri[oó]|investigador|cient[ií]fic|hist[oó]ric|en el siglo)\b/i.test(String(claim.text || ""));
    const risk = historicalClaim ? "high" : (["low", "medium", "high"].includes(claim.risk) ? claim.risk : "medium");
    const evidenceKind = claim.evidenceKind === "video_attribution" ? "video_attribution" : "external_fact";
    const sourceIds = [...new Set((claim.sourceIds || []).map(String).filter((id) => {
      const source = sourcesById.get(id);
      return source && (evidenceKind === "video_attribution" || source.sourceType !== "youtube_video");
    }))];
    const independentDomains = new Set(sourceIds.map((id) => sourcesById.get(id)?.domain).filter(Boolean));
    const hasAttributedVideo = evidenceKind === "video_attribution" && sourceIds.some((id) => sourcesById.get(id)?.sourceType === "youtube_video");
    const strongEnough = hasAttributedVideo || risk !== "high" || (sourceIds.length >= 2 && independentDomains.size >= 2 && sourceIds.some((id) => Number(sourcesById.get(id)?.qualityTier) === 1));
    let status = ["supported", "partially_supported", "unsupported", "contradicted"].includes(claim.status) ? claim.status : "unsupported";
    if (status === "supported" && (!sourceIds.length || !strongEnough)) status = "partially_supported";
    return { id: clampText(claim.id, 120) || `claim-${index + 1}`, blockId: clampText(claim.blockId, 120), text: clampText(claim.text, 1200), evidenceKind, risk, status, sourceIds, supportSummary: clampText(claim.supportSummary, 600), locator: clampText(claim.locator, 300) };
  }).filter((claim) => claim.text);
  const blockers = claims.filter((claim) => claim.status !== "supported").map((claim) => claim.text);
  const articleWithPreservedVideos = { ...article, sources: preservedSources, researchSources: preservedSources };
  const missingCitations = bibliography.integrity(articleWithPreservedVideos).missing;
  if (missingCitations.length) blockers.push("Hay citas sin documento bibliográfico asociado: " + missingCitations.join(", "));
  const videoSourceIds = new Set(videoSources.map((source) => String(source.id)));
  const attributionPattern = /\b(?:seg[uú]n|explica|se[nñ]ala|afirma|describe|propone|muestra|sostiene|comenta|indica|en el video)\b/i;
  for (const block of Array.isArray(article.blocks) ? article.blocks : []) {
    const usesVideo = (Array.isArray(block?.sourceIds) ? block.sourceIds : []).some((id) => videoSourceIds.has(String(id)));
    if (!usesVideo) continue;
    const blockText = String(block.text || "").trim();
    if (!String(block.locator || "").trim()) blockers.push(`El bloque ${block.id || "de video"} necesita una marca de tiempo.`);
    if (block.type === "quote") {
      if (blockText.split(/\s+/).filter(Boolean).length > 25) blockers.push(`La cita de video ${block.id || ""} supera 25 palabras.`.trim());
      if (!String(block.attribution || "").trim()) blockers.push(`La cita de video ${block.id || ""} necesita atribución explícita.`.trim());
    } else if (!String(block.attribution || "").trim() && !attributionPattern.test(blockText)) {
      blockers.push(`El bloque ${block.id || "de video"} presenta una idea del video sin atribución explícita.`);
    }
  }
  if (verified.rejectedSources.length) blockers.push(`${verified.rejectedSources.length} fuente(s) fueron descartadas al comprobar su contenido.`);
  const requiredSources = article.researchDossier?.targetSourceCount || (article.editorialMode === "aida" ? researchPolicy.target({ editorialMode: "aida" }) : 0);
  if (requiredSources > 0 && verified.verifiedSources.length < requiredSources) {
    blockers.push(`La investigación conserva ${verified.verifiedSources.length} de ${requiredSources} documentos verificados.`);
  }
  if (!verified.verifiedSources.length) blockers.push("El artículo no conserva ninguna fuente verificable.");
  const contradictions = Array.isArray(result.contradictions) ? result.contradictions.map((value) => clampText(value, 800)).filter(Boolean) : [];
  if ((blockers.length || !claims.length) && additionalSearches > 0) {
    const supplemental = await researchArticleEvidenceServer({ searchPlatforms: article.searchPlatforms ?? article.researchDossier?.searchPlatforms, topic: `${topic || article.title}. Evidencia faltante: ${blockers.slice(0, 5).join("; ")}`, audience: article.audience || "educators", mode: article.editorialMode || "marcie", minimumSources: requiredSources || researchPolicy.target({ editorialMode: article.editorialMode }), researchInstructions: article.researchDossier?.researchInstructions || [], region: article.researchDossier?.researchRegion || "MX", period: article.researchPeriod || article.researchDossier?.researchPeriod || "6m", dependencies: { client, retrieveOptions: dependencies.retrieveOptions } });
    const combined = [...candidates, ...supplemental.sources, ...videoSources];
    if (combined.length > candidates.length + videoSources.length) return verifyArticleEvidenceServer({ article: { ...article, sources: combined, researchSources: combined }, topic, additionalSearches: additionalSearches - 1, dependencies: { client, retrieveOptions: dependencies.retrieveOptions } });
  }
  const supportedIds = new Set(claims.filter(claim => claim.status === 'supported').flatMap(claim => claim.sourceIds));
  await require('./research/budget.js').recordEvidence(verified.verifiedSources.filter(source => supportedIds.has(source.id)), { used: true });
  const coverage = claims.length ? Math.round((claims.filter((claim) => claim.status === "supported").length / claims.length) * 100) : 0;
  const contentHash = crypto.createHash("sha256").update(JSON.stringify({ title: article.title, subtitle: article.subtitle, blocks: article.blocks, sources: preservedSources, seo: article.seo })).digest("hex");
  return {
    ...article, usedSources: article.usedSources || article.sources || [], sourceCandidates: [...uniqueCandidates.values()], sources: preservedSources, researchSources: preservedSources, articleClaims: claims,
    evidenceLinks: claims.flatMap((claim) => claim.sourceIds.map((sourceId) => ({ claimId: claim.id, sourceId, url: sourcesById.get(sourceId)?.url || "", title: sourcesById.get(sourceId)?.title || "", supportSummary: claim.supportSummary, locator: claim.locator }))),
    sourceAudit: verified.rejectedSources,
    verification: { status: blockers.length || contradictions.length || !claims.length ? "blocked" : "verified", coverage, blockers, contradictions, verifiedAt: new Date().toISOString(), contentHash, model: DEFAULT_TEXT_MODEL, checkedUrls: verified.verifiedSources.map((source) => source.url), videoSources: videoSources.map((source) => ({ id: source.id, url: source.url, verificationStatus: "attributed_only" })) }
  };
}

async function verifyAndRepairArticleEvidenceServer(options = {}) {
  const verify = options.dependencies?.verifyArticleEvidence || verifyArticleEvidenceServer;
  const verified = await verify(options);
  const repaired = autoRepairEvidence(verified);
  if (!repaired.changed) return verified;
  if (!(repaired.article.blocks || []).some((block) => String(block?.text || "").trim())) {
    return {
      ...options.article,
      articleClaims: verified.articleClaims || [],
      sourceAudit: verified.sourceAudit || [],
      verification: { ...verified.verification, status: "blocked", blockers: [...(verified.verification?.blockers || []), "La corrección automática retiraría todo el contenido; se conservó el borrador original para revisión."] }
    };
  }
  const result = await verify({ ...options, article: repaired.article, additionalSearches: 0 });
  const originalWords = articleText(verified).split(/\s+/).filter(Boolean).length;
  const remainingWords = articleText(result).split(/\s+/).filter(Boolean).length;
  if (originalWords >= 100 && remainingWords < originalWords * 0.6) {
    return {
      ...options.article,
      articleClaims: verified.articleClaims || [],
      sourceAudit: verified.sourceAudit || [],
      verification: {
        ...verified.verification,
        status: "blocked",
        blockers: [...(verified.verification?.blockers || []), "La corrección automática retiraría demasiado contenido; se conservó el borrador original para revisión."]
      }
    };
  }
  return result;
}

function registerMarcieEditorialResearchRoutes(app, dependencies = {}) {
  const resolveRequestAuth = dependencies.resolveAuthContext || require("./common.js").resolveAuthContext;
  const getServices = dependencies.getAdminServices || getAdminServices;
  const wrapAsync = dependencies.asyncRoute || require("./common.js").asyncRoute;
  app.post("/api/marcie/trends/refresh", wrapAsync(async (req, res) => {
    const authContext = await resolveRequestAuth(req); const { db } = getServices();
    await assertEditorialAccess(authContext, db, { editor: true });
    const cadence = ["daily", "weekly", "monthly"].includes(req.body?.cadence) ? req.body.cadence : "weekly";
    const settings = { cadence, region: clampText(req.body?.region || "MX", 80), timezone: "America/Cancun", discoveryMode: "general_education_brain", updatedBy: authContext.uid, updatedAt: new Date().toISOString() };
    await db.collection("MarcieEditorialSettings").doc("global").set(settings, { merge: true });
    const result = await refreshMarcieTrends({ force: req.body?.force === true, settingsOverride: settings, dependencies: { db, client: dependencies.client, model: normalizeTextModel(req.body?.model) } });
    return res.status(200).json({ ok: true, ...result });
  }));
  app.post(["/api/marcie/evidence/research", "/api/marcie/evidence/research-global"], wrapAsync(async (req, res) => {
    const authContext = await resolveRequestAuth(req); const { db } = getServices();
    await assertEditorialAccess(authContext, db);
    let dossier;
    try {
      dossier = await requestDeadline(req, res, signal => researchArticleEvidenceServer({
        topic: req.body?.topic,
        searchPlatforms: req.body?.searchPlatforms,
        researchInstructions: Array.isArray(req.body?.researchInstructions) ? req.body.researchInstructions.slice(0, 50).map(value => clampText(value, 2000)) : [],
        audience: req.body?.audience,
        audiences: Array.isArray(req.body?.audiences) ? req.body.audiences.slice(0, 4) : [],
        mode: req.body?.mode,
        minimumSources: req.body?.minimumSources,
        region: req.body?.region,
        period: req.body?.period,
        model: normalizeTextModel(req.body?.model),
        videoEvidence: req.body?.videoEvidence || null,
        timeBudgetMs: Math.max(60_000, Math.min(180_000, Number(req.body?.timeBudgetMs) || 150_000)),
        excludeUrls: req.body?.excludeUrls,
        startPlatformOffset: req.body?.startPlatformOffset,
        pendingCandidates: req.body?.pendingCandidates,
        dependencies: { client: dependencies.client, signal }
      }), RESEARCH_DEADLINE_MS, "marcie_research_timeout");
    } catch (error) {
      if (error?.code !== "marcie_research_timeout") throw error;
      return res.status(503).json({
        error: {
          code: error.code,
          message: "La investigación bibliográfica tardó demasiado. El artículo anterior se conservó; vuelve a intentarlo o acota el tema."
        },
        requestId: req.requestId || undefined
      });
    }
    return res.status(200).json({ ok: true, dossier });
  }));
  app.post("/api/marcie/evidence/select", wrapAsync(async (req, res) => {
    const authContext = await resolveRequestAuth(req); const { db } = getServices();
    await assertEditorialAccess(authContext, db);
    const result = await requestDeadline(req, res, signal => selectArticleEvidenceServer({
      dossier: req.body?.dossier, audiences: req.body?.audiences, audienceBriefs: req.body?.audienceBriefs,
      minimumSources: req.body?.minimumSources, topic: req.body?.topic,
      dependencies: { client: dependencies.client, signal }
    }), RESEARCH_DEADLINE_MS, "marcie_selection_timeout");
    return res.status(200).json({ ok: true, ...result });
  }));
  app.post("/api/marcie/evidence/research-bundle", wrapAsync(async (req, res) => {
    const authContext = await resolveRequestAuth(req); const { db } = getServices();
    await assertEditorialAccess(authContext, db);
    const result = await requestDeadline(req, res, signal => researchArticleEvidenceBundleServer({
      ...req.body, timeBudgetMs: Math.max(60_000, Math.min(180_000, Number(req.body?.timeBudgetMs) || 180_000)), researchInstructions: Array.isArray(req.body?.researchInstructions) ? req.body.researchInstructions.slice(0, 50).map((value) => clampText(value, 2000)) : [],
      dependencies: { client: dependencies.client, signal }
    }), RESEARCH_DEADLINE_MS, "marcie_research_timeout");
    return res.status(200).json({ ok: true, ...result });
  }));
  app.post("/api/marcie/evidence/verify", wrapAsync(async (req, res) => {
    const authContext = await resolveRequestAuth(req); const { db } = getServices();
    await assertEditorialAccess(authContext, db);
    const article = await withDeadline(
      (req.body?.autoRepair === true ? verifyAndRepairArticleEvidenceServer : verifyArticleEvidenceServer)({ article: req.body?.article || {}, topic: req.body?.topic, additionalSearches: Math.max(0, Math.min(2, Number(req.body?.additionalSearches) || 0)), dependencies: { client: dependencies.client } }),
      EVIDENCE_VERIFY_DEADLINE_MS,
      "marcie_verification_timeout"
    );
    return res.status(200).json({ ok: true, article });
  }));
}

module.exports = {
  normalizeVideoEvidence, DEFAULT_SETTINGS, TREND_SCHEMA_VERSION, RESEARCH_DEADLINE_MS, EVIDENCE_VERIFY_DEADLINE_MS, RESEARCH_PERIOD_DAYS, assertEditorialAccess, createSourceAssessor, periodKey, researchDateWindow,
  parseJsonResponse, repairAdjacentJsonContainers, generateJson, generateResearchContent,
  rankTrendOpportunities, refreshMarcieTrends, researchArticleEvidenceServer, researchArticleEvidenceBundleServer, selectArticleEvidenceServer, verifyArticleEvidenceServer, verifyAndRepairArticleEvidenceServer, extractAttributedReferences,
  registerMarcieEditorialResearchRoutes
};
