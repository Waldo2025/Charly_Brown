/**
 * Servicio de Inteligencia Editorial Gemini / Vertex AI para Marcie Blog Editor
 * Implementa las 4 operaciones con Programación Neurolingüística (PNL), Rapport, Hooks,
 * Preguntas detonantes, calibración profunda por audiencia, diversidad de fuentes y
 * estricta pureza idiomática en Español neutro (Cero Spanglish/Anglicismos).
 */

import { generateWithGemini, GEMINI_MODEL_OPTIONS, DEFAULT_GEMINI_MODEL, getConfiguredGeminiModel } from "/charly-brown/gemini-client.js";
import { buildApiUrlPreferRemote, buildMarcieApiUrl } from "/js/api-client.js";
import { getCurrentUser } from "./marcie-firebase.js";
import { getActiveMarciePrompt } from "./marcie-prompt-settings.js";

export const DEFAULT_MARCIE_MODEL = DEFAULT_GEMINI_MODEL;
const MARCIE_IMAGE_MODEL = "gemini-2.5-flash-image";

const HIGH_AUTHORITY_HOST_PATTERNS = [
  /(?:^|\.)doi\.org$/i, /(?:^|\.)pubmed\.ncbi\.nlm\.nih\.gov$/i,
  /(?:^|\.)ncbi\.nlm\.nih\.gov$/i, /(?:^|\.)nature\.com$/i,
  /(?:^|\.)science\.org$/i, /(?:^|\.)thelancet\.com$/i,
  /(?:^|\.)springer\.com$/i, /(?:^|\.)wiley\.com$/i,
  /(?:^|\.)frontiersin\.org$/i, /(?:^|\.)plos\.org$/i,
  /(?:\.edu|\.gov|\.gob|\.ac)(?:\.[a-z]{2})?$/i
];

function classifyEditorialSource(url = "", source = {}) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  const declared = String(source.sourceType || "").toLowerCase();
  if (HIGH_AUTHORITY_HOST_PATTERNS.some((pattern) => pattern.test(host)) || /paper|journal|academic|government|university|book/.test(declared)) return 1;
  if (/magazine|professional|institution|education|science/.test(declared)) return 2;
  return 3;
}

export function sanitizeTrustedSources(sources = []) {
  const trusted = [];
  const seen = new Set();
  for (const source of Array.isArray(sources) ? sources : []) {
    let parsed;
    try {
      parsed = new URL(String(source?.url || "").trim());
    } catch (_) {
      continue;
    }
    if (parsed.protocol !== "https:") continue;
    if ((parsed.pathname === "/" || !parsed.pathname) && !parsed.search) continue;
    parsed.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"].forEach((key) => parsed.searchParams.delete(key));
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const normalizedUrl = parsed.toString();
    if (!String(source?.title || "").trim() || /^(home|inicio|homepage)$/i.test(String(source.title).trim())) continue;
    if (seen.has(normalizedUrl)) continue;
    seen.add(normalizedUrl);
    trusted.push({
      id: String(source?.id || `source-${trusted.length + 1}`),
      title: String(source?.title || hostname),
      url: normalizedUrl,
      authors: Array.isArray(source?.authors) ? source.authors.map(String) : String(source?.authors || source?.author || ""),
      year: String(source?.year || source?.publishedYear || ""),
      publishedAt: String(source?.publishedAt || source?.datePublished || ""),
      dateSource: String(source?.dateSource || "unknown"),
      evidenceRole: String(source?.evidenceRole || "current") === "historical" ? "historical" : "current",
      publisher: String(source?.publisher || source?.organization || ""),
      apaCitation: String(source?.apaCitation || ""),
      doi: String(source?.doi || ""),
      sourceType: String(source?.sourceType || "web"),
      qualityTier: classifyEditorialSource(normalizedUrl, source),
      retrievedAt: String(source?.retrievedAt || new Date().toISOString()),
      retrievalStatus: String(source?.retrievalStatus || "success"),
      verificationStatus: String(source?.verificationStatus || "legacy_unverified"),
      verifiedAt: String(source?.verifiedAt || ""),
      requestedUrl: String(source?.requestedUrl || normalizedUrl),
      finalUrl: String(source?.finalUrl || normalizedUrl),
      domain: String(source?.domain || hostname),
      contentHash: String(source?.contentHash || ""),
      supportSummary: String(source?.supportSummary || ""),
      locator: String(source?.locator || ""),
      supports: Array.isArray(source?.supports) ? source.supports.map(String) : [],
      verifiedInstitutionalOrigin: HIGH_AUTHORITY_HOST_PATTERNS.some((pattern) => pattern.test(hostname))
    });
  }
  return trusted.slice(0, 16);
}

function extractGeminiResponseText(data = {}) {
  return (data?.candidates?.[0]?.content?.parts || []).map((part) => part?.text || "").join("\n").trim();
}

function groundingSourcesFromResponse(data = {}) {
  const chunks = data?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  return chunks.map((chunk, index) => ({
    id: `ground-${index + 1}`,
    title: String(chunk?.web?.title || chunk?.retrievedContext?.title || "Fuente recuperada"),
    url: String(chunk?.web?.uri || chunk?.retrievedContext?.uri || ""),
    sourceType: "grounded_web",
    retrievalStatus: "success",
    retrievedAt: new Date().toISOString()
  }));
}

export async function generateGroundedJson({ prompt, model = getConfiguredGeminiModel(), urls = [] } = {}) {
  const tools = urls.length ? [{ urlContext: {} }] : [{ googleSearch: {} }];
  const urlInstruction = urls.length ? `\nURLs que debes recuperar y comprobar:\n${urls.slice(0, 16).join("\n")}` : "";
  const data = await authenticatedJsonRequest("/api/gemini/generate", {
    model,
    payload: {
      contents: [{ role: "user", parts: [{ text: `${prompt}${urlInstruction}` }] }],
      tools,
      generationConfig: { maxOutputTokens: 8192 }
    }
  });
  const parsed = parseJsonSafe(extractGeminiResponseText(data));
  return { parsed, groundingSources: sanitizeTrustedSources(groundingSourcesFromResponse(data)), raw: data };
}

export async function researchArticleEvidence({
  topic = "",
  audience = "educators",
  mode = "marcie",
  minimumSources = 6,
  region = "MX",
  period = "6m"
} = {}) {
  const startedAt = performance.now();
  const response = await authenticatedJsonRequest("/api/marcie/evidence/research", {
    topic: sanitizeTopicTitle(topic), audience, mode, minimumSources, region, period
  });
  const dossier = response?.dossier || {};
  const sources = sanitizeTrustedSources(dossier.sources || []).map((source) => ({ ...source, verificationStatus: "verified" }));
  return {
    schemaVersion: String(dossier.schemaVersion || "1.0"),
    editorialMode: String(dossier.editorialMode || mode || "marcie"),
    topic: String(dossier.topic || topic || ""),
    summary: String(dossier.summary || ""),
    currentSignals: Array.isArray(dossier.currentSignals) ? dossier.currentSignals : [],
    signals: Array.isArray(dossier.currentSignals)
      ? dossier.currentSignals.map((signal) => String(signal?.signal || signal?.text || signal)).filter(Boolean)
      : [],
    facts: Array.isArray(dossier.facts) ? dossier.facts : [],
    sources,
    historicalMilestones: Array.isArray(dossier.historicalMilestones) ? dossier.historicalMilestones : [],
    researchPeriod: String(dossier.researchPeriod || period || "6m"),
    dateWindow: dossier.dateWindow || null,
    currentSourceCount: Number(dossier.currentSourceCount || 0),
    historicalSourceCount: Number(dossier.historicalSourceCount || 0),
    rejectedSources: Array.isArray(dossier.rejectedSources) ? dossier.rejectedSources : [],
    verifiedSourceCount: Number(dossier.verifiedSourceCount || sources.length),
    institutionCount: Number(dossier.institutionCount || 0),
    blockers: Array.isArray(dossier.blockers) ? dossier.blockers.map(String) : [],
    recommendations: Array.isArray(dossier.recommendations) ? dossier.recommendations.map(String) : [],
    minimumSourceCount: Number(dossier.minimumSourceCount || 0),
    targetSourceCount: Number(dossier.targetSourceCount || minimumSources),
    verificationStatus: dossier.verificationStatus || "blocked",
    researchedAt: dossier.researchedAt || new Date().toISOString(),
    telemetry: { ...(dossier.telemetry || {}), durationMs: Math.round(performance.now() - startedAt), retrievedUrls: sources.map((source) => source.url) }
  };
}

export async function verifyArticleEvidence({ article = {}, topic = "", additionalSearches = 0, searchAttempts = 0 } = {}) {
  const response = await authenticatedJsonRequest("/api/marcie/evidence/verify", {
    article, topic: sanitizeTopicTitle(topic || article.title), additionalSearches, searchAttempts
  });
  return response?.article || { ...article, verification: { status: "blocked", coverage: 0, blockers: ["El backend no devolvió una verificación."], contradictions: [] } };
}

export async function refreshEditorialTrends({ cadence = "weekly", region = "MX", force = true } = {}) {
  return authenticatedJsonRequest("/api/marcie/trends/refresh", { cadence, region, discoveryMode: "general_education_brain", force });
}

function articlePlainText(article = {}) {
  return (Array.isArray(article.blocks) ? article.blocks : [])
    .map((block) => block?.text || (Array.isArray(block?.items) ? block.items.join(". ") : ""))
    .filter(Boolean)
    .join("\n")
    .replace(/[*_#>`]/g, "")
    .slice(0, 3200);
}

export async function articleContentHash(article = {}) {
  const material = JSON.stringify({ title: article.title, subtitle: article.subtitle, blocks: article.blocks, sources: article.researchSources || article.sources, seo: article.seo });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeStorageSegment(value = "", fallback = "asset") {
  const clean = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return clean || fallback;
}

async function authenticatedJsonRequest(path, body) {
  const url = String(path || "").startsWith("/api/marcie/")
    ? buildMarcieApiUrl(path)
    : buildApiUrlPreferRemote(path);
  if (!url) throw new Error("Backend editorial no configurado.");

  const user = getCurrentUser();
  if (!user?.getIdToken) throw new Error("Inicia sesión para usar la inteligencia editorial.");
  const token = await user.getIdToken();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = String(data?.error?.code || data?.error || data?.code || "");
    const knownMessages = {
      marcie_research_invalid_json: "La respuesta de tendencias llegó incompleta. Intenta actualizar nuevamente.",
      marcie_research_response_truncated: "La respuesta de tendencias fue demasiado extensa. Reduce los temas vigilados e inténtalo otra vez.",
      marcie_verification_timeout: "La comprobación de fuentes tardó demasiado. El artículo se conservó sin cambios; inténtalo nuevamente."
    };
    const error = new Error(String(data?.error?.message || data?.message || knownMessages[code] || code || `HTTP ${response.status}`));
    error.status = response.status;
    error.code = code;
    error.requestId = String(data?.requestId || "");
    throw error;
  }
  return data;
}

function extractGeneratedImage(data = {}) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    const inline = part?.inlineData || part?.inline_data;
    const mimeType = String(inline?.mimeType || inline?.mime_type || "").trim();
    const dataBase64 = String(inline?.data || "").trim();
    if (dataBase64 && /^image\//i.test(mimeType)) return { dataBase64, mimeType };
  }
  throw new Error("Gemini no devolvió una imagen para el artículo.");
}

function blobToBase64(blob) {
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    const chunks = [];
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)));
    }
    return btoa(chunks.join(""));
  });
}

async function optimizeImageForWeb({ dataBase64 = "", mimeType = "image/png" } = {}) {
  const sourceBlob = new Blob([
    Uint8Array.from(atob(dataBase64), (character) => character.charCodeAt(0))
  ], { type: mimeType });
  const bitmap = await createImageBitmap(sourceBlob);
  const maxWidth = 1600;
  const maxHeight = 900;
  const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    bitmap.close?.();
    throw new Error("El navegador no pudo preparar la imagen para web.");
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const encode = (type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  let optimizedBlob = await encode("image/webp", 0.84);
  let optimizedMimeType = "image/webp";
  if (!optimizedBlob || optimizedBlob.type !== "image/webp") {
    optimizedBlob = await encode("image/jpeg", 0.86);
    optimizedMimeType = "image/jpeg";
  }
  if (!optimizedBlob) throw new Error("No se pudo codificar la imagen optimizada.");

  return {
    dataBase64: await blobToBase64(optimizedBlob),
    mimeType: optimizedMimeType,
    width,
    height,
    byteSize: optimizedBlob.size
  };
}

/**
 * Genera una portada editorial y la guarda usando las rutas de imagen existentes.
 */
export async function generateArticleImageWithGemini({ article = {}, sessionId = "", approachId = "", approachLabel = "" } = {}) {
  const user = getCurrentUser();
  if (!user?.uid) throw new Error("Inicia sesión para generar imágenes.");

  const title = sanitizeTopicTitle(article.title || "Artículo educativo");
  const resolvedApproachId = String(approachId || article.audience || "educators").trim();
  const approachDirections = {
    educators: "Enfoque para docentes y directivos: práctica profesional, estrategia pedagógica, colaboración y contexto real de aula.",
    students: "Enfoque para estudiantes: participación activa, curiosidad, autonomía, diversidad y aprendizaje significativo.",
    parents: "Enfoque para madres, padres y tutores: acompañamiento cercano, confianza, hogar y vínculo con la comunidad escolar."
  };
  const approachDirection = approachDirections[resolvedApproachId] || `Enfoque editorial: ${approachLabel || resolvedApproachId}.`;
  const prompt = `
${getActiveMarciePrompt("cover_generation")}

Crea una imagen de portada editorial horizontal 16:9 para un artículo de blog educativo.

Título del artículo: "${title}"
Subtítulo: "${String(article.subtitle || "").slice(0, 500)}"
Audiencia: "${approachLabel || article.audience || "educators"}"
${approachDirection}
Contexto del artículo:
${articlePlainText(article)}

Dirección visual obligatoria:
- Fotografía editorial conceptual, humana, contemporánea y de alta calidad.
- Composición limpia con un punto focal claro y espacio visual equilibrado.
- Paleta natural con acentos verde azulado, coherente con Marcie Blog Editor.
- Representación respetuosa, inclusiva y realista del contexto educativo.
- Sin texto incrustado, letras, logotipos, marcas de agua, firmas ni interfaces.
- Evita el aspecto genérico de banco de imágenes y las composiciones infantiles.
`.trim();

  const generationData = await authenticatedJsonRequest("/api/gemini/generate", {
    model: MARCIE_IMAGE_MODEL,
    payload: {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.62,
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: { aspectRatio: "16:9", imageSize: "1K" }
      }
    }
  });
  const generatedImage = extractGeneratedImage(generationData);
  const image = await optimizeImageForWeb(generatedImage);
  const extension = image.mimeType === "image/webp" ? "webp" : "jpg";
  const storagePath = [
    "unidadesGeneradasAssets",
    safeStorageSegment(user.uid, "user"),
    "marcie-blog-editor",
    safeStorageSegment(sessionId, "session"),
    `portada-${safeStorageSegment(resolvedApproachId, "enfoque")}-${Date.now()}.${extension}`
  ].join("/");

  const uploaded = await authenticatedJsonRequest("/api/unidades/support-graphics/upload", {
    path: storagePath,
    mimeType: image.mimeType,
    dataBase64: image.dataBase64,
    metadata: {
      role: "blog_article_cover",
      subtema: title.slice(0, 180),
      approachId: resolvedApproachId,
      approachLabel: String(approachLabel || article.audience || resolvedApproachId).slice(0, 120),
      optimizedForWeb: "true"
    }
  });

  return {
    url: String(uploaded?.downloadUrl || "").trim(),
    storagePath: String(uploaded?.storagePath || uploaded?.path || storagePath).trim(),
    mimeType: image.mimeType,
    width: image.width,
    height: image.height,
    byteSize: image.byteSize,
    metadataStripped: true,
    optimizedForWeb: true,
    approachId: resolvedApproachId,
    approachLabel: String(approachLabel || article.audience || resolvedApproachId),
    model: MARCIE_IMAGE_MODEL,
    generatedAt: new Date().toISOString()
  };
}

/**
 * Limpia títulos para evitar etiquetas o placeholders genéricos
 */
function sanitizeTopicTitle(raw = "") {
  let clean = String(raw || "").trim();
  if (!clean || clean.toLowerCase().includes("nueva sesión") || clean.toLowerCase().includes("sesión editorial")) {
    return "Innovación Pedagógica y Estrategias de Aprendizaje";
  }
  return clean;
}

/**
 * 1. Descubre tendencias y fuentes educativas diversas
 */
export async function searchTrendsWithGemini({ topic = "", country = "MX", period = "6m", model = getConfiguredGeminiModel() } = {}) {
  const cleanTopic = sanitizeTopicTitle(topic);

  const prompt = `
${getActiveMarciePrompt("trend_research")}
${getActiveMarciePrompt("source_research_policy")}
${getActiveMarciePrompt("source_citation_policy")}

Eres el motor de inteligencia editorial y radar educativo de Marcie Blog Editor.
Analiza la siguiente consulta educativa y devuelve un diagnóstico exhaustivo de tendencias, señales vivas de aula y fuentes de prestigio mundial:

Consulta: "${cleanTopic}"
Región: "${country}"
Periodo: "${period}"

═══════════════════════════════════════════════════════════════════
🎯 CRITERIOS OBLIGATORIOS:
═══════════════════════════════════════════════════════════════════
1. IDIOMA ESPAÑOL IMPECABLE (100% ESPAÑOL):
   - Redacta todo en español fluido y natural. Prohibido usar anglicismos o mezclar palabras en inglés.

2. FUENTES CONCRETAS Y RECUPERADAS:
   - Cita entre 2 y 10 páginas específicas encontradas con búsqueda web; nunca una portada institucional genérica.
   - No inventes títulos, métricas, estudios, años, rutas ni enlaces.

3. SEÑALES PEDAGÓGICAS CONTEXTUALIZADAS:
   - Señales vivas que reflejen tensiones, innovaciones y realidades palpables en colegios y universidades.

Responde ÚNICAMENTE un JSON válido con esta estructura:
{
  "topic": "${cleanTopic}",
  "trendScore": null,
  "growth": null,
  "freshness": null,
  "sourceDiversity": "descripción cualitativa basada en las fuentes",
  "summary": "Diagnóstico analítico y revelador del impacto y relevancia pedagógica de esta tendencia en la educación contemporánea.",
  "signals": [
    "Señal 1: Tensión o debate metodológico detectado en la práctica docente cotidiana.",
    "Señal 2: Necesidad urgente o cambio en los hábitos cognitivos y de atención de los estudiantes.",
    "Señal 3: Oportunidad para transformar la enseñanza y fomentar el pensamiento crítico."
  ],
  "sources": [{"id":"s1","title":"título real de la página","url":"https://ruta-concreta"}]
}
`.trim();

  console.log(`[MarcieGemini] Buscando tendencias y fuentes diversas con ${model} para: "${cleanTopic}"...`);
  const { parsed, groundingSources } = await generateGroundedJson({ prompt, model });
  parsed.sources = sanitizeTrustedSources([...(parsed.sources || []), ...groundingSources]);
  parsed.growth = null;
  parsed.freshness = null;
  return parsed;
}

/**
 * 2. Genera 3 propuestas editoriales diferenciadas por audiencia con PNL y Hooks
 */
export async function generateProposalsWithGemini({ topic = "", signals = [], model = getConfiguredGeminiModel() } = {}) {
  const cleanTopic = sanitizeTopicTitle(topic);

  const prompt = `
${getActiveMarciePrompt("approach_proposals")}

Eres un editor en jefe de contenidos educativos de élite internacional.
A partir del tema "${cleanTopic}" y las señales detectadas [${signals.join("; ")}], genera EXACTAMENTE tres propuestas editoriales diferenciadas, una para cada audiencia, aplicando técnicas de PNL (Rapport, Gancho emocional, Interruptor de estado y preguntas detonantes):

1. "educators" (Docentes y directivos):
   - Foco: Liderazgo pedagógico, superar la sobrecarga, metodologías activas y reconectar con la pasión de enseñar.
2. "students" (Estudiantes):
   - Foco: Técnicas de aprendizaje acelerado, cómo estudiar a su propio ritmo sin agotarse, vencer la procrastinación y liberar tiempo libre.
3. "parents" (Padres y tutores):
   - Foco: Cómo entender y acompañar a sus hijos en el hogar sin batallas diarias, equilibrando afecto, presencia y tecnología.

REGLAS DE IDIOMA Y ESTILO:
- Redacta el 100% en ESPAÑOL IMPECABLE y natural.
- PROHIBIDO usar palabras en inglés, anglicismos innecesarios ("hacks", "tips", etc.) o "spanglish".
- PROHIBIDO usar la frase "Nueva sesión" o títulos genéricos aburridos. Cada título debe ser fascinante y despertar urgencia de lectura.

Responde ÚNICAMENTE un JSON válido con esta estructura:
{
  "proposals": [
    {
      "id": "prop-educators",
      "audience": "educators",
      "audienceLabel": "Docentes y directivos",
      "title": "¿Título magnético y provocador para docentes?",
      "angle": "Enfoque metodológico, transformador y humano",
      "brief": "Sinopsis persuasiva que detalla el problema real de aula que resuelve y el beneficio tangible para el profesor.",
      "estimatedReadTimeMinutes": 7
    },
    {
      "id": "prop-students",
      "audience": "students",
      "audienceLabel": "Estudiantes",
      "title": "¿Título fresco, directo y retador para estudiantes?",
      "angle": "Estrategias de autonomía, claves de estudio y motivación",
      "brief": "Cómo el estudiante resolverá sus dudas, evitará el estrés de las entregas y dominará el tema con confianza.",
      "estimatedReadTimeMinutes": 5
    },
    {
      "id": "prop-parents",
      "audience": "parents",
      "audienceLabel": "Padres y tutores",
      "title": "¿Título cálido, tranquilizador y orientador para familias?",
      "angle": "Guía práctica para acompañar sin generar conflicto",
      "brief": "Pautas claras para que los padres apoyen el desarrollo y bienestar de sus hijos con empatía y criterio.",
      "estimatedReadTimeMinutes": 6
    }
  ]
}
`.trim();

  console.log(`[MarcieGemini] Generando 3 propuestas PNL con ${model} para: "${cleanTopic}"...`);
  const raw = await generateWithGemini({
    model,
    prompt,
    payload: {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.65,
        maxOutputTokens: 8192,
        responseMimeType: "application/json"
      }
    }
  });

  return parseJsonSafe(raw);
}

export async function refineBlogTopicWithGemini({ topic = "", specifications = [], model = getConfiguredGeminiModel() } = {}) {
  const cleanTopic = sanitizeTopicTitle(topic);
  const constraints = Array.isArray(specifications) && specifications.length
    ? specifications.map((item) => `- ${String(item).trim()}`).join("\n")
    : "- Sin especificaciones adicionales.";
  const prompt = `
${getActiveMarciePrompt("topic_refinement")}

Actúa como editor jefe de un blog educativo profesional. Perfecciona el tema proporcionado para convertirlo en una formulación clara, específica, atractiva y útil para generar tres enfoques editoriales dirigidos a docentes, estudiantes y familias.

Tema original: "${cleanTopic}"
Especificaciones:
${constraints}

Devuelve solamente el tema perfeccionado en una sola línea, sin comillas, listas, explicaciones ni prefijos. Conserva la intención del usuario y no inventes datos.
  `.trim();
  const raw = await generateWithGemini({
    model,
    prompt,
    payload: {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 180 }
    }
  });
  return String(raw || "").replace(/^```(?:text)?/i, "").replace(/```$/i, "").replace(/^['"]|['"]$/g, "").trim();
}

/**
 * 3. Redacta el ArticleDocument estructurado completo con PNL, Rapport, Hook, Pregunta Detonante y Fuentes Diversificadas
 */
export async function draftArticleWithGemini({ title = "", topic = "", audience = "educators", brief = "", model = getConfiguredGeminiModel(), researchDossier = null, verifyEvidence = true, editorialMode = "marcie" } = {}) {
  const startedAt = performance.now();
  const now = new Date();
  const dateStr = now.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });

  const cleanTitle = sanitizeTopicTitle(title || topic);
  const cleanTopic = sanitizeTopicTitle(topic || cleanTitle);
  let dossier = researchDossier;
  if (!dossier) {
    try {
      dossier = await researchArticleEvidence({ topic: cleanTopic, audience, mode: editorialMode, minimumSources: editorialMode === "aida" ? 8 : 6 });
    } catch (error) {
      console.warn("[MarcieGemini] La investigación con grounding no pudo completarse:", error);
      dossier = { facts: [], sources: [], historicalMilestones: [] };
    }
  }
  const dossierText = JSON.stringify({ facts: dossier.facts || [], sources: dossier.sources || [], historicalMilestones: dossier.historicalMilestones || [] }).slice(0, 18000);

  const prompt = `
${getActiveMarciePrompt("article_drafting")}
${getActiveMarciePrompt("source_research_policy")}
${getActiveMarciePrompt("source_citation_policy")}

Eres un autor y ensayista editorial de clase mundial especializado en pedagogía, neuroeducación y comunicación persuasiva con Programación Neurolingüística (PNL).

Tu misión es redactar un artículo largo, elocuente, magnético, humano y de altísimo rigor sobre:
Tema central: "${cleanTopic}"
Título provisional: "${cleanTitle}"
Brief editorial: "${brief || cleanTopic}"
Audiencia objetivo: "${audience}" (donde: educators = Docentes y directivos; students = Estudiantes; parents = Padres de familia y tutores)
Dossier de evidencia recuperada (única base permitida para datos factuales):
${dossierText}

═══════════════════════════════════════════════════════════════════
🎯 REGLAS EDITORIALES, IDIOMÁTICAS Y DE PNL DE OBLIGATORIO CUMPLIMIENTO:
═══════════════════════════════════════════════════════════════════

1. 🌐 PUREZA Y CALIDAD DEL IDIOMA (100% ESPAÑOL CORRECTO Y NATURAL):
   - Redacta absolutamente TODO el artículo en ESPAÑOL IMPECABLE.
   - PROHIBICIÓN TOTAL DE SPANGLISH O ANGLICISMOS: Jamás uses palabras en inglés mezcladas en oraciones en español (como 'felt', 'tips', 'hacks', 'feelings', 'feedback', 'inputs', etc. Utiliza sus equivalentes precisos en español: 'sentido', 'consejos', 'estrategias', 'emociones', 'retroalimentación', 'aportes').
   - Para la audiencia de estudiantes: usa un tuteo cercano, empático, fresco y dinámico, pero con una prosa en español pulcra, elocuente y motivadora.

2. ⚡ GANCHO INICIAL Y PREGUNTA DETONANTE OBLIGATORIA:
   - El artículo y su primer bloque de texto DEBEN COMENZAR OBLIGATORIAMENTE con una PREGUNTA DETONANTE y disruptiva que sacuda al lector y plantee un dilema inmediato.
   - Tras la pregunta, genera un RAPPORT instantáneo validando la experiencia, las dudas, el cansancio o los anhelos reales del lector en su día a día.

3. 🧠 PNL, CALIBRACIÓN SENSORIAL (VAK) Y RETENCIÓN:
   - Emplea predicados sensoriales en español (Visual: lo que se ve en el entorno; Auditivo: lo que se escucha en las conversaciones cotidianas; Kinestésico: lo que se siente de forma tangible).
   - Maneja bucles de intriga (open loops) para que la lectura sea adictiva y fluida de principio a fin.

4. 🎭 CALIBRACIÓN RIGUROSA POR AUDIENCIA:
   - Si audience === "educators" (Docentes y directivos):
     * Tono: Colegiado, empático, motivador, profundamente reflexivo y enfocado en devolver la alegría de enseñar y transformar el aula.
   - Si audience === "students" (Estudiantes):
     * Tono: Cercano, dinámico, directo (tuteo fresco y respetuoso), cero condescendiente; enfocado en estrategias prácticas de estudio, autonomía y bienestar.
   - Si audience === "parents" (Padres y tutores):
     * Tono: Cálido, tranquilizador, orientador y cómplice; enfocado en tender puentes en el hogar sin batallas.

5. 📚 EVIDENCIA RECUPERADA:
   - Usa exclusivamente hechos y páginas concretas presentes en el dossier recuperado.
   - No inventes citas, títulos, publicaciones, años, DOI, autores ni URLs.
   - Si un dato no está en el dossier, omítelo o exprésalo como interpretación no factual.

6. 🚫 PROHIBICIÓN TOTAL DE META-LENGUAJE:
   - ESTÁ TOTALMENTE PROHIBIDO usar frases como: "En esta nueva sesión editorial", "En este artículo", "A continuación veremos", "En esta entrega", "Como IA".
   - El contenido publicable debe ser prosa editorial normal y limpia. No incluyas referencias al proceso de generación, avisos sobre IA, instrucciones del prompt, etiquetas internas, metadatos editoriales, firmas codificadas, marcas de agua, secuencias ocultas ni caracteres invisibles.
   - No alteres palabras mediante Unicode engañoso ni insertes códigos destinados a influir en clasificadores o detectores. La naturalidad debe surgir de una redacción original, específica, rigurosa y adaptada a la audiencia.
   - El esquema JSON solicitado al final es solamente el formato técnico de transporte del editor; nunca menciones esa estructura dentro del título, subtítulo, extracto o bloques del artículo.

7. 📜 ESTRUCTURA AMPLIA Y RICA (7 A 9 BLOQUES SUSTANCIALES):
   - Cada párrafo debe tener entre 4 y 7 oraciones profundas y bien argumentadas.
   - Estructura requerida en "blocks":
     1) [paragraph] Apertura obligatoria con Pregunta Detonante + Hook + Rapport PNL.
     2) [paragraph] Profundización en el dilema o punto de dolor real del lector con predicados sensoriales.
     3) [quote] Cita inspiradora y memorable con autoría de prestigio.
     4) [heading h3] Subtítulo conceptual que plantea un giro de perspectiva.
     5) [paragraph] Desarrollo profundo de la propuesta o metodología transformadora.
     6) [list] Lista de 4 a 5 estrategias prácticas y detalladas con explicaciones paso a paso.
     7) [heading h3] Subtítulo sobre el impacto tangible o caso de aplicación.
     8) [paragraph] Caso práctico o ejemplo de aplicación en la vida cotidiana.
     9) [paragraph] Cierre reflexivo inspirador con un llamado a la acción consciente que empodera al lector.

8. ✍️ ESTILO Y FORMATO DE TEXTO INLINE (MARKDOWN):
   - Dentro de los campos de texto (\`text\` e \`items\`), DEBES usar formato Markdown para dar riqueza visual a la lectura.
   - Usa **negritas** (\`**concepto clave**\`) para términos importantes, ideas centrales o pasos críticos.
   - Usa *cursivas* (\`*enfoque*\`) para enfatizar emociones, preguntas introspectivas, matices o palabras especiales.
   - Aplícalo de manera elegante y equilibrada a lo largo de todo el artículo.

Responde ÚNICAMENTE un JSON válido con esta estructura:
{
  "schemaVersion": "1.0",
  "title": "Título definitivo magnético y revelador (NUNCA incluir 'Nueva sesión')",
  "subtitle": "Subtítulo elocuente que anticipa el impacto práctico del artículo",
  "excerpt": "Resumen impactante en una frase persuasiva con gancho.",
  "audience": "${audience}",
  "category": "Educación e Innovación",
  "readingTimeMinutes": 7,
  "publishedDateText": "${dateStr}",
  "tags": ["Educación", "Innovación", "Aprendizaje", "Pedagogía"],
  "blocks": [
    {
      "id": "b1",
      "type": "paragraph",
      "text": "¿Pregunta detonante inicial?... (Párrafo inmersivo con rapport PNL y validación emocional, 100% en español)"
    },
    {
      "id": "b2",
      "type": "paragraph",
      "text": "Párrafo que explora el dilema real y conecta sensorialmente con la vivencia del lector..."
    },
    {
      "id": "b3",
      "type": "quote",
      "text": "Frase memorable y potente sobre el arte de educar y aprender...",
      "attribution": "Autoridad o Referente Educativo Internacional, 2024"
    },
    {
      "id": "b4",
      "type": "heading",
      "level": "h3",
      "text": "Subtítulo del giro de perspectiva"
    },
    {
      "id": "b5",
      "type": "paragraph",
      "text": "Desarrollo profundo del método o enfoque transformador..."
    },
    {
      "id": "b6",
      "type": "bulletList",
      "items": [
        "Estrategia 1: Explicación detallada, accionable y fundamentada.",
        "Estrategia 2: Explicación detallada, accionable y fundamentada.",
        "Estrategia 3: Explicación detallada, accionable y fundamentada.",
        "Estrategia 4: Explicación detallada, accionable y fundamentada."
      ]
    },
    {
      "id": "b7",
      "type": "heading",
      "level": "h3",
      "text": "Subtítulo de aplicación tangible en la práctica"
    },
    {
      "id": "b8",
      "type": "paragraph",
      "text": "Párrafo que ilustra la aplicación cotidiana y cómo cambia la experiencia real..."
    },
    {
      "id": "b9",
      "type": "paragraph",
      "text": "Párrafo final de cierre, empoderamiento reflexivo y llamado a la acción consciente..."
    }
  ],
  "sources": [{"id":"id exacto del dossier","title":"título recuperado","url":"URL concreta recuperada"}],
  "seo": {
    "title": "Título SEO optimizado",
    "description": "Meta descripción atractiva (máx 155 caracteres) con gancho emocional.",
    "keywords": ["educación", "aprendizaje", "innovación", "pedagogía"]
  }
}
`.trim();

  console.log(`[MarcieGemini] Redactando artículo maestro con PNL, fuentes diversas y ${model}...`);
  const raw = await generateWithGemini({
    model,
    prompt,
    payload: {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.55,
        maxOutputTokens: 8192,
        responseMimeType: "application/json"
      }
    }
  });

  const parsed = parseJsonSafe(raw);

  if (parsed.title) {
    parsed.title = sanitizeTopicTitle(parsed.title);
  }
  parsed.sources = sanitizeTrustedSources([...(dossier.sources || []), ...(parsed.sources || [])]);
  parsed.researchSources = parsed.sources;
  parsed.researchDossier = { facts: dossier.facts || [], historicalMilestones: dossier.historicalMilestones || [], researchedAt: dossier.researchedAt || new Date().toISOString() };
  parsed.editorialMode = editorialMode;
  parsed.generationTelemetry = { model, durationMs: Math.round(performance.now() - startedAt), retrievedUrls: parsed.sources.map((source) => source.url), searches: dossier.telemetry?.searches || 0 };
  return verifyEvidence ? verifyArticleEvidence({ article: parsed, topic: cleanTopic }) : parsed;
}

/**
 * 4. Audita y revisa el artículo editorialmente
 */
export async function reviewArticleWithGemini({ article = {}, model = getConfiguredGeminiModel() } = {}) {
  const articleText = `${article.title || ""}\n${article.subtitle || ""}\n${(article.blocks || []).map((b) => b.text || (b.items || []).join(". ")).join("\n")}`;

  const prompt = `
${getActiveMarciePrompt("editorial_review")}
${getActiveMarciePrompt("source_research_policy")}
${getActiveMarciePrompt("source_citation_policy")}

Eres un corrector de estilo, especialista en PNL y auditor editorial educativo.
Revisa el siguiente artículo y emite un informe estructurado:

Artículo:
"""
${articleText}
"""
Audiencia meta: "${article.audience || 'educators'}"

Evalúa:
1. Pureza del idioma español (Cero Spanglish o anglicismos como 'felt', 'tips', 'hacks').
2. Si comienza con una pregunta detonante y genera rapport inmediato.
3. Si el tono está perfectamente calibrado para ${article.audience}.
4. Si evita frases cliché o meta-lenguaje tipo "en este artículo".
5. Diversidad y pertinencia de las fuentes citadas.
6. Oportunidades de mejora en claridad y ritmo.

Responde ÚNICAMENTE un JSON válido con esta estructura:
{
  "readabilityScore": 94,
  "summary": "Evaluación experta sobre el gancho, rapport PNL, pureza del idioma español, claridad, fuentes y tono.",
  "issues": [
    {
      "id": "iss-1",
      "type": "tone",
      "message": "Observación sobre el tono, lenguaje y conexión emocional",
      "suggestion": "Recomendación accionable"
    },
    {
      "id": "iss-2",
      "type": "facts",
      "message": "Observación sobre fuentes y rigor pedagógico",
      "suggestion": "Recomendación de cita"
    }
  ],
  "seoRecommendations": [
    "Recomendación SEO 1",
    "Recomendación SEO 2"
  ]
}
`.trim();

  console.log(`[MarcieGemini] Auditando artículo con ${model}...`);
  const raw = await generateWithGemini({
    model,
    prompt,
    payload: {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.25,
        maxOutputTokens: 8192,
        responseMimeType: "application/json"
      }
    }
  });

  return parseJsonSafe(raw);
}

function parseJsonSafe(text = "") {
  let clean = String(text || "").trim();
  clean = clean.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  try {
    return JSON.parse(clean);
  } catch (err) {
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (_) {}
    }
    console.error("[MarcieGeminiService] Error parseando JSON de Gemini:", err, "\nRespuesta cruda:", text);
    throw new Error("La respuesta de Gemini no tuvo el formato JSON esperado.");
  }
}
