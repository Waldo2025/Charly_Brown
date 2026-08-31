const crypto = require("node:crypto");
const { getAdminServices } = require("./common.js");
const { createVertexClient, buildVertexGenerateRequest, DEFAULT_TEXT_MODEL } = require("./vertex.js");
const { verifyCandidateSources } = require("./marcie-source-verifier.js");

const TREND_SCHEMA_VERSION = 6;
const DEFAULT_SETTINGS = { cadence: "weekly", region: "MX", timezone: "America/Cancun", discoveryMode: "general_education_brain" };
const AIDA_PHASES = ["headline", "problem", "deepen", "agitate", "turn", "why", "change", "close"];
const AIDA_MINIMUM_VERIFIED_SOURCES = 3;
const AIDA_MINIMUM_INDEPENDENT_INSTITUTIONS = 3;
const AIDA_TARGET_VERIFIED_SOURCES = 8;
const EVIDENCE_VERIFY_DEADLINE_MS = 105_000;
const RESEARCH_PERIOD_DAYS = Object.freeze({ "24h": 1, "7d": 7, "1m": 30, "3m": 90, "6m": 180, "12m": 365 });

function clampText(value, max = 1000) { return String(value == null ? "" : value).trim().slice(0, max); }
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

async function generateJson({ client, prompt, tools = [] }) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const retryInstruction = attempt
      ? "\n\nREINTENTO DE FORMATO: la respuesta anterior no fue JSON válido. Devuelve un único objeto JSON completo, sin Markdown, comentarios ni texto antes o después. Revisa comas, corchetes y llaves antes de responder."
      : "";
    const response = await client.models.generateContent(buildVertexGenerateRequest({
      model: DEFAULT_TEXT_MODEL,
      payload: {
        contents: [{ role: "user", parts: [{ text: `${prompt}${retryInstruction}` }] }],
        ...(tools.length ? { tools } : {}),
        generationConfig: { maxOutputTokens: 8192, ...(tools.length ? {} : { responseMimeType: "application/json" }) }
      }
    }));
    try {
      return { parsed: parseJsonResponse(response), response };
    } catch (error) {
      if (error?.code !== "marcie_research_invalid_json") throw error;
      console.warn(JSON.stringify({ severity: "WARNING", event: "marcie_json_retry", model: DEFAULT_TEXT_MODEL, attempt: attempt + 1 }));
      lastError = error;
    }
  }
  throw lastError || invalidJsonError();
}

function groundingSources(response = {}) {
  return (response.candidates?.[0]?.groundingMetadata?.groundingChunks || []).map((chunk, index) => ({
    id: `ground-${index + 1}`, title: chunk.web?.title || "Fuente recuperada", url: chunk.web?.uri || "", sourceType: "grounded_web"
  })).filter((source) => /^https:\/\//i.test(source.url));
}

function pageAssessmentPrompt(context, pages) {
  return `Actúa como verificador documental estricto. Decide si cada página recuperada respalda de forma directa al menos una afirmación, señal o antecedente concreto del CONTEXTO; no necesita respaldar el artículo completo. No valides por título, dominio o reputación. Si el texto no contiene ningún dato pertinente, es tangencial o contradice el contexto, recházalo. No inventes citas ni localizadores.\nCONTEXTO:\n${clampText(context, 12000)}\nPÁGINAS RECUPERADAS:\n${pages.map((page) => `ID ${page.id}\nTÍTULO: ${page.retrievedTitle}\nURL FINAL: ${page.finalUrl}\nTEXTO: ${page.text.slice(0, 4200)}`).join("\n\n")}\nDevuelve SOLO JSON: {"assessments":[{"id":"ID","status":"verified|rejected","reason":"content_mismatch|verification_error","supportSummary":"qué información concreta respalda","locator":"encabezado o sección identificable","supports":["summary","signal:0"]}]}`;
}

function createSourceAssessor(client) {
  return async ({ context, pages }) => {
    const { parsed } = await generateJson({ client, prompt: pageAssessmentPrompt(context, pages) });
    return Array.isArray(parsed.assessments) ? parsed.assessments : [];
  };
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

async function generateTrendCandidates({ client, region, cadence }) {
  const windows = { daily: "últimas 24 horas", weekly: "últimos 7 días", monthly: "últimos 30 días" };
  const prompt = `Realiza una exploración ABIERTA con Google Search de trending topics en ${region} durante ${windows[cadence]}. Descubre de qué se está hablando ahora dentro del ecosistema amplio de educación, pedagogía, neuroeducación, cerebro humano, neurociencia cognitiva, aprendizaje, memoria, atención, desarrollo infantil y adolescente, psicología educativa, bienestar socioemocional, inclusión, PNL aplicada a educación, tecnología educativa, inteligencia artificial y formación docente. No partas de una lista fija ni repitas temas genéricos: identifica conversaciones concretas que estén apareciendo, creciendo o conectándose con noticias, debates, preguntas o cambios recientes. Agrupa duplicados y devuelve entre 6 y 12 temas distintos, ordenados desde la conversación con mayor impulso hasta la menor. No inventes porcentajes, conteos ni volumen. Clasifica únicamente momentum como breakout, rising, emerging o steady; y freshness como immediate, recent o monthly. Devuelve SOLO JSON: {"opportunities":[{"topic":"tema específico descubierto","summary":"por qué está en conversación ahora","signals":["señal concreta observada en la búsqueda"],"momentum":"breakout|rising|emerging|steady","freshness":"immediate|recent|monthly","whyNow":"detonante actual"}]}`;
  const generated = await generateJson({ client, prompt, tools: [{ googleSearch: {} }] });
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
  const client = dependencies.client || createVertexClient({ location: "global" });
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
  const generated = await generateTrendCandidates({ client, region: settings.region || "MX", cadence });
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

async function researchArticleEvidenceServer({
  topic = "",
  audience = "educators",
  mode = "marcie",
  minimumSources = 6,
  region = "MX",
  period = "6m",
  dependencies = {}
} = {}) {
  const client = dependencies.client || createVertexClient({ location: "global" });
  const now = dependencies.now instanceof Date ? dependencies.now : new Date();
  const dateWindow = researchDateWindow(period, now);
  const editorialMode = normalizeToken(mode) === "aida" ? "aida" : "marcie";
  const requestedMinimum = editorialMode === "aida"
    ? Math.max(8, Math.min(12, Number(minimumSources) || 8))
    : Math.max(4, Math.min(12, Number(minimumSources) || 6));
  const researchLenses = editorialMode === "aida" ? [
    "Costos familiares, precios, consumo e impacto económico en México. Prioriza páginas concretas de INEGI, Profeco, Banxico, asociaciones de consumidores y medios económicos con datos atribuibles.",
    "Contexto educativo oficial y regional. Prioriza páginas HTML específicas de SEP, gobiernos, universidades, UNICEF, UNESCO, Banco Mundial y organizaciones profesionales accesibles sin iniciar sesión.",
    "Evidencia académica, evolución documentada y perspectivas independientes directamente pertinentes. No fuerces neurociencia o historia; inclúyelas solo si respaldan una afirmación necesaria. Evita repetir dominios."
  ] : ["Fuentes oficiales, académicas y educativas directamente pertinentes al tema."];
  const generatedBatches = await Promise.all(researchLenses.map(async (lens, batchIndex) => {
    const prompt = editorialMode === "aida"
      ? `Investiga de forma integral el tema "${clampText(topic, 500)}" para ${audience}, región ${clampText(region, 80)}. VENTANA ACTUAL OBLIGATORIA: desde ${dateWindow.from.slice(0, 10)} hasta ${dateWindow.to.slice(0, 10)} (${dateWindow.period}). Toda fuente marcada current y toda señal actual debe haber sido publicada dentro de esas fechas; no presentes información anterior como actualidad. Las fuentes anteriores solo se permiten como historical para explicar un antecedente o hito explícito y nunca cuentan como evidencia reciente. El tema indicado por el usuario es el centro de la investigación: no lo reemplaces por ciencia o historia. ENFOQUE DE ESTA BÚSQUEDA: ${lens} Propón seis páginas concretas de dominios independientes. Cada URL debe apuntar a una página con contenido legible, no a una portada, buscador, visor vacío ni ruta inventada. Cubre hechos y señales pertinentes; añade ciencia o evolución histórica únicamente cuando exista evidencia. No inventes autores, fechas, métricas, científicos ni descubrimientos. SOLO JSON: {"summary":"síntesis integral","facts":[{"id":"fact-1","claim":"","sourceIds":["source-1"],"risk":"low|medium|high"}],"currentSignals":[{"id":"signal-1","signal":"cambio comprobable dentro de la ventana","sourceIds":["source-1"]}],"sources":[{"id":"source-1","title":"","url":"https://pagina-concreta","authors":[""],"publishedAt":"fecha ISO comprobable","publisher":"","doi":"","sourceType":"paper|official|science_magazine|education_blog","evidenceRole":"current|historical"}],"historicalMilestones":[{"year":"","personOrInstitution":"","contribution":"","sourceIds":["source-1","source-2"]}]}`
      : `Investiga el tema "${clampText(topic, 500)}" para ${audience}, región ${clampText(region, 80)}. VENTANA OBLIGATORIA: desde ${dateWindow.from.slice(0, 10)} hasta ${dateWindow.to.slice(0, 10)} (${dateWindow.period}). Solo acepta páginas publicadas dentro de esas fechas y no presentes datos anteriores como actuales. ${lens} Encuentra entre ${requestedMinimum} y 12 páginas específicas. No inventes rutas, autores, fechas o descubrimientos. SOLO JSON: {"summary":"síntesis editorial","facts":[{"id":"fact-1","claim":"","sourceIds":["source-1"],"risk":"low|medium|high"}],"currentSignals":[{"id":"signal-1","signal":"señal comprobable dentro de la ventana","sourceIds":["source-1"]}],"sources":[{"id":"source-1","title":"","url":"https://pagina-concreta","authors":[""],"publishedAt":"fecha ISO comprobable","publisher":"","doi":"","sourceType":"paper|official|science_magazine|education_blog","evidenceRole":"current"}],"historicalMilestones":[]}`;
    const generated = await generateJson({ client, prompt, tools: [{ googleSearch: {} }] });
    const idMap = new Map();
    const candidates = [...(generated.parsed.sources || []), ...groundingSources(generated.response)].slice(0, 10).map((source, sourceIndex) => {
      const originalId = clampText(source.id, 120) || `source-${sourceIndex + 1}`;
      const id = `search-${batchIndex + 1}-${originalId}`;
      idMap.set(originalId, id);
      return { ...source, id };
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
  }));
  const candidates = generatedBatches.flatMap((batch) => batch.candidates).slice(0, editorialMode === "aida" ? 24 : 16);
  const generated = { parsed: {
    summary: generatedBatches.map((batch) => batch.summary).filter(Boolean).join(" "),
    facts: generatedBatches.flatMap((batch) => batch.facts),
    currentSignals: generatedBatches.flatMap((batch) => batch.currentSignals),
    historicalMilestones: generatedBatches.flatMap((batch) => batch.historicalMilestones)
  } };
  const verified = await verifyCandidateSources({
    candidates,
    context: `${topic}\n${generated.parsed.summary || ""}\n${(generated.parsed.facts || []).map((fact) => fact.claim).join("\n")}\n${(generated.parsed.currentSignals || []).map((signal) => signal.signal || signal.text).join("\n")}`,
    assessSources: createSourceAssessor(client),
    distinctDomains: editorialMode === "aida",
    maxCandidates: editorialMode === "aida" ? 24 : 16,
    retrievalConcurrency: editorialMode === "aida" ? 6 : 4,
    retrieveOptions: dependencies.retrieveOptions
    , dateWindow
    , allowHistorical: editorialMode === "aida"
  });
  const currentSourceIds = new Set(verified.verifiedSources.filter((source) => source.evidenceRole !== "historical").map((source) => String(source.id)));
  const historicalSourceIds = new Set(verified.verifiedSources.filter((source) => source.evidenceRole === "historical").map((source) => String(source.id)));
  const ids = new Set([...currentSourceIds, ...historicalSourceIds]);
  const sourcesById = new Map(verified.verifiedSources.map((source) => [String(source.id), source]));
  const currentSources = verified.verifiedSources.filter((source) => source.evidenceRole !== "historical");
  const filterEvidence = (items) => (Array.isArray(items) ? items : []).map((item) => ({ ...item, sourceIds: (item.sourceIds || []).map(String).filter((id) => ids.has(id)) })).filter((item) => item.sourceIds.length);
  const facts = filterEvidence(generated.parsed.facts).map((fact) => ({
    ...fact,
    sourceIds: fact.sourceIds.filter((id) => currentSourceIds.has(id))
  })).filter((fact) => fact.sourceIds.length).filter((fact) => {
    if (String(fact.risk || "").toLowerCase() !== "high") return true;
    const domains = new Set(fact.sourceIds.map((id) => sourcesById.get(id)?.domain).filter(Boolean));
    return fact.sourceIds.length >= 2 && domains.size >= 2 && fact.sourceIds.some((id) => Number(sourcesById.get(id)?.qualityTier) === 1);
  });
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
  const institutionCount = new Set(currentSources.map((source) => clampText(source.publisher || source.domain, 300).toLowerCase()).filter(Boolean)).size;
  const verifiedSummary = [...new Set(currentSources.map((source) => clampText(source.supportSummary, 600)).filter(Boolean))].slice(0, 6).join(" ");
  const blockers = [];
  const requiredMinimum = editorialMode === "aida" ? AIDA_MINIMUM_VERIFIED_SOURCES : requestedMinimum;
  if (currentSources.length < requiredMinimum) blockers.push(`${editorialMode === "aida" ? "Aida" : "La investigación"} requiere al menos ${requiredMinimum} páginas actuales verificadas dentro del periodo ${dateWindow.from.slice(0, 10)}–${dateWindow.to.slice(0, 10)}.`);
  if (editorialMode === "aida" && institutionCount < AIDA_MINIMUM_INDEPENDENT_INSTITUTIONS) blockers.push("Aida requiere al menos tres publicaciones o instituciones independientes.");
  const recommendations = editorialMode === "aida" ? [
    ...(currentSources.length < requestedMinimum ? [`Objetivo editorial Aida: ampliar de ${currentSources.length} a ${requestedMinimum} páginas actuales verificadas cuando existan fuentes pertinentes.`] : []),
    ...(institutionCount < 4 ? [`Recomendación Aida: ampliar de ${institutionCount} a 4 publicaciones o instituciones independientes.`] : [])
  ] : [];
  return {
    schemaVersion: "2.0",
    editorialMode,
    topic: clampText(topic, 500),
    summary: clampText(verifiedSummary || "No se encontraron suficientes páginas actuales con fecha comprobable dentro de la ventana seleccionada.", 2400),
    currentSignals,
    facts,
    sources: verified.verifiedSources,
    researchPeriod: dateWindow.period,
    dateWindow,
    currentSourceCount: currentSources.length,
    historicalSourceCount: verified.verifiedSources.length - currentSources.length,
    historicalMilestones,
    rejectedSources: verified.rejectedSources,
    verifiedSourceCount: verified.verifiedSources.length,
    institutionCount,
    blockers,
    recommendations,
    minimumSourceCount: requiredMinimum,
    targetSourceCount: editorialMode === "aida" ? Math.max(AIDA_TARGET_VERIFIED_SOURCES, requestedMinimum) : requestedMinimum,
    verificationStatus: blockers.length ? "blocked" : "verified",
    researchedAt: now.toISOString(),
    telemetry: { modeUsed: editorialMode, model: DEFAULT_TEXT_MODEL, searches: generatedBatches.length, retrievedUrls: verified.verifiedSources.map((source) => source.url) }
  };
}

function articleText(article = {}, topic = "") {
  return `${article.title || topic}\n${article.subtitle || ""}\n${(Array.isArray(article.blocks) ? article.blocks : []).map((block) => block?.text || (Array.isArray(block?.items) ? block.items.join(". ") : "")).filter(Boolean).join("\n")}`.slice(0, 16000);
}

async function verifyArticleEvidenceServer({ article = {}, topic = "", additionalSearches = 0, dependencies = {} } = {}) {
  const client = dependencies.client || createVertexClient({ location: "global" });
  const text = articleText(article, topic);
  let candidates = Array.isArray(article.researchSources || article.sources) ? (article.researchSources || article.sources) : [];
  const verified = await verifyCandidateSources({ candidates, context: text, assessSources: createSourceAssessor(client), retrieveOptions: dependencies.retrieveOptions });
  const pagesById = new Map(verified.retrievedPages.map((page) => [page.id, page]));
  const usablePages = verified.verifiedSources.map((source) => ({ source, page: pagesById.get(source.id) })).filter((item) => item.page);
  let result = { claims: [], contradictions: [] };
  if (usablePages.length) {
    const prompt = `Extrae cada afirmación factual del artículo y comprueba si está respaldada por las páginas recuperadas. Opiniones y preguntas no son afirmaciones factuales. No supongas respaldo. Marca contradicciones.\nARTÍCULO:\n${text}\nFUENTES:\n${usablePages.map(({ source, page }) => `ID ${source.id} (${source.qualityTier}) ${source.title}\n${page.text.slice(0, 4200)}`).join("\n\n")}\nSOLO JSON: {"claims":[{"id":"claim-1","blockId":"","text":"afirmación exacta","risk":"low|medium|high","status":"supported|partially_supported|unsupported|contradicted","sourceIds":["source-1"],"supportSummary":"","locator":""}],"contradictions":[""]}`;
    result = (await generateJson({ client, prompt })).parsed;
  }
  const sourcesById = new Map(verified.verifiedSources.map((source) => [source.id, source]));
  const claims = (Array.isArray(result.claims) ? result.claims : []).map((claim, index) => {
    const historicalClaim = /\b(?:1[5-9]\d{2}|20\d{2})\b|\b(?:descubri[oó]|investigador|cient[ií]fic|hist[oó]ric|en el siglo)\b/i.test(String(claim.text || ""));
    const risk = historicalClaim ? "high" : (["low", "medium", "high"].includes(claim.risk) ? claim.risk : "medium");
    const sourceIds = [...new Set((claim.sourceIds || []).map(String).filter((id) => sourcesById.has(id)))];
    const independentDomains = new Set(sourceIds.map((id) => sourcesById.get(id)?.domain).filter(Boolean));
    const strongEnough = risk !== "high" || (sourceIds.length >= 2 && independentDomains.size >= 2 && sourceIds.some((id) => Number(sourcesById.get(id)?.qualityTier) === 1));
    let status = ["supported", "partially_supported", "unsupported", "contradicted"].includes(claim.status) ? claim.status : "unsupported";
    if (status === "supported" && (!sourceIds.length || !strongEnough)) status = "partially_supported";
    return { id: clampText(claim.id, 120) || `claim-${index + 1}`, blockId: clampText(claim.blockId, 120), text: clampText(claim.text, 1200), risk, status, sourceIds, supportSummary: clampText(claim.supportSummary, 600), locator: clampText(claim.locator, 300) };
  }).filter((claim) => claim.text);
  const blockers = claims.filter((claim) => claim.status !== "supported").map((claim) => claim.text);
  if (verified.rejectedSources.length) blockers.push(`${verified.rejectedSources.length} fuente(s) fueron descartadas al comprobar su contenido.`);
  if (String(article.editorialMode || "").toLowerCase() === "aida") {
    const currentSources = verified.verifiedSources.filter((source) => source.evidenceRole !== "historical");
    const institutionCount = new Set(currentSources.map((source) => clampText(source.publisher || source.domain, 300).toLowerCase()).filter(Boolean)).size;
    if (currentSources.length < AIDA_MINIMUM_VERIFIED_SOURCES) blockers.push("Aida requiere al menos 3 páginas actuales concretas verificadas.");
    if (institutionCount < AIDA_MINIMUM_INDEPENDENT_INSTITUTIONS) blockers.push("Aida requiere al menos tres publicaciones o instituciones independientes.");
  }
  const contradictions = Array.isArray(result.contradictions) ? result.contradictions.map((value) => clampText(value, 800)).filter(Boolean) : [];
  if ((blockers.length || !claims.length) && additionalSearches > 0) {
    const supplemental = await researchArticleEvidenceServer({ topic: `${topic || article.title}. Evidencia faltante: ${blockers.slice(0, 5).join("; ")}`, audience: article.audience || "educators", mode: article.editorialMode || "marcie", minimumSources: 4, period: article.researchPeriod || article.researchDossier?.researchPeriod || "6m", dependencies: { client, retrieveOptions: dependencies.retrieveOptions } });
    const combined = [...candidates, ...supplemental.sources];
    if (combined.length > candidates.length) return verifyArticleEvidenceServer({ article: { ...article, sources: combined, researchSources: combined }, topic, additionalSearches: additionalSearches - 1, dependencies: { client, retrieveOptions: dependencies.retrieveOptions } });
  }
  const coverage = claims.length ? Math.round((claims.filter((claim) => claim.status === "supported").length / claims.length) * 100) : 0;
  const contentHash = crypto.createHash("sha256").update(JSON.stringify({ title: article.title, subtitle: article.subtitle, blocks: article.blocks, sources: verified.verifiedSources, seo: article.seo })).digest("hex");
  return {
    ...article, sources: verified.verifiedSources, researchSources: verified.verifiedSources, articleClaims: claims,
    evidenceLinks: claims.flatMap((claim) => claim.sourceIds.map((sourceId) => ({ claimId: claim.id, sourceId, url: sourcesById.get(sourceId)?.url || "", title: sourcesById.get(sourceId)?.title || "", supportSummary: claim.supportSummary, locator: claim.locator }))),
    sourceAudit: verified.rejectedSources,
    verification: { status: blockers.length || contradictions.length || !claims.length ? "blocked" : "verified", coverage, blockers, contradictions, verifiedAt: new Date().toISOString(), contentHash, model: DEFAULT_TEXT_MODEL, checkedUrls: verified.verifiedSources.map((source) => source.url) }
  };
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
    const result = await refreshMarcieTrends({ force: req.body?.force === true, settingsOverride: settings, dependencies: { db, client: dependencies.client } });
    return res.status(200).json({ ok: true, ...result });
  }));
  app.post("/api/marcie/evidence/research", wrapAsync(async (req, res) => {
    const authContext = await resolveRequestAuth(req); const { db } = getServices();
    await assertEditorialAccess(authContext, db);
    const dossier = await researchArticleEvidenceServer({
      topic: req.body?.topic,
      audience: req.body?.audience,
      mode: req.body?.mode,
      minimumSources: req.body?.minimumSources,
      region: req.body?.region,
      period: req.body?.period,
      dependencies: { client: dependencies.client }
    });
    return res.status(200).json({ ok: true, dossier });
  }));
  app.post("/api/marcie/evidence/verify", wrapAsync(async (req, res) => {
    const authContext = await resolveRequestAuth(req); const { db } = getServices();
    await assertEditorialAccess(authContext, db);
    const article = await withDeadline(
      verifyArticleEvidenceServer({ article: req.body?.article || {}, topic: req.body?.topic, additionalSearches: Math.max(0, Math.min(2, Number(req.body?.additionalSearches) || 0)), dependencies: { client: dependencies.client } }),
      EVIDENCE_VERIFY_DEADLINE_MS,
      "marcie_verification_timeout"
    );
    return res.status(200).json({ ok: true, article });
  }));
}

module.exports = {
  DEFAULT_SETTINGS, TREND_SCHEMA_VERSION, AIDA_MINIMUM_VERIFIED_SOURCES, AIDA_MINIMUM_INDEPENDENT_INSTITUTIONS, AIDA_TARGET_VERIFIED_SOURCES, EVIDENCE_VERIFY_DEADLINE_MS, RESEARCH_PERIOD_DAYS, assertEditorialAccess, createSourceAssessor, periodKey, researchDateWindow,
  parseJsonResponse, repairAdjacentJsonContainers, generateJson,
  rankTrendOpportunities, refreshMarcieTrends, researchArticleEvidenceServer, verifyArticleEvidenceServer,
  registerMarcieEditorialResearchRoutes
};
