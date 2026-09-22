/**
 * Servicio de Inteligencia Editorial Gemini / Vertex AI para Marcie Blog Editor
 * Implementa las 4 operaciones con Programación Neurolingüística (PNL), Rapport, Hooks,
 * Preguntas detonantes, calibración profunda por audiencia, diversidad de fuentes y
 * estricta pureza idiomática en Español neutro (Cero Spanglish/Anglicismos).
 */

import { generateWithGemini, GEMINI_MODEL_OPTIONS, DEFAULT_GEMINI_MODEL, getConfiguredGeminiModel } from "/charly-brown/gemini-client.js";
import { buildApiUrlPreferRemote, buildMarcieApiUrl } from "/js/api-client.js";
import { getDownloadURL, ref, uploadBytes } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js";
import { getCurrentUser, storage } from "./marcie-firebase.js";
import { getActiveMarciePrompt } from "./marcie-prompt-settings.js?v=20260908r9";
import { parseMarcieJson } from "./marcie-json.js";
import "../contracts/marcie-research-policy.js?v=20260922r1";
import "../contracts/marcie-bibliography.js?v=20260922r1";

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
      journal: String(source?.journal || source?.journalTitle || ""),
      volume: String(source?.volume || ""), issue: String(source?.issue || ""), pages: String(source?.pages || ""),
      discoveredVia: source?.discoveredVia || [],
      id: String(source?.id || `source-${trusted.length + 1}`),
      title: String(source?.title || hostname),
      url: normalizedUrl,
      authors: Array.isArray(source?.authors) ? source.authors.map(author => typeof author === "object" ? author : String(author)) : String(source?.authors || source?.author || ""),
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
  return trusted;
}

function normalizedAttributionText(value = "") {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[“”„‟«»'’‘]/g, '"').replace(/[^a-z0-9\s"]/g, " ").replace(/\s+/g, " ").trim();
}

export function applyVerifiedAttributions(article = {}, dossier = {}) {
  const validDocumentIds = new Set((dossier.sources || []).filter((source) => source?.verificationStatus === "verified").map((source) => String(source.id)));
  const validVideoIds = new Set((dossier.sources || []).filter((source) => source?.sourceType === "youtube_video" && source?.verificationStatus === "attributed_only").map((source) => String(source.id)));
  const validSourceIds = new Set([...validDocumentIds, ...validVideoIds]);
  const references = (Array.isArray(dossier.attributedReferences) ? dossier.attributedReferences : [])
    .filter((reference) => reference?.verificationStatus === "verified" && validDocumentIds.has(String(reference.sourceId)))
    ;
  const directQuotes = references.filter((reference) => reference.type === "direct_quote");
  const paraphrases = references.filter((reference) => reference.type === "paraphrase");
  const selectedReferences = [...new Set([directQuotes[0], paraphrases[0], ...references].filter(Boolean))];
  const citationContext = { ...article, sources: dossier.sources || [], researchSources: dossier.sources || [], usedSources: [], supplementarySources: [], attributedReferences: references, researchDossier: { ...dossier, attributedReferences: references } };
  globalThis.MarcieBibliography.assertIntegrity(citationContext);
  const blocks = (Array.isArray(article.blocks) ? article.blocks : []).flatMap((block) => {
    const sourceIds = [...new Set(globalThis.MarcieBibliography.blockIds(citationContext, block).map(id => globalThis.MarcieBibliography.resolveId(citationContext, id)).filter(id => validSourceIds.has(id)))];
    if (block?.type !== "quote") return [{ ...block, sourceIds }];
    const videoSourceIds = sourceIds.filter((id) => validVideoIds.has(id));
    if (videoSourceIds.length && String(block.locator || "").trim()) return [{ ...block, sourceIds: videoSourceIds }];
    const normalizedText = normalizedAttributionText(block.text);
    const verifiedQuote = directQuotes.find((reference) => {
      const candidate = normalizedAttributionText(reference.text);
      return candidate && (candidate === normalizedText || normalizedText.includes(candidate));
    });
    if (verifiedQuote) {
      return [{ ...block, text: verifiedQuote.text, attribution: `${verifiedQuote.personOrInstitution} (${verifiedQuote.year || "s. f."})${verifiedQuote.locator ? `, ${verifiedQuote.locator}` : ""}`, sourceIds: [String(verifiedQuote.sourceId)] }];
    }
    throw new Error("La cita textual generada no coincide con una frase verificada del documento. Reintenta la redacción.");
  });
  return { ...article, blocks, attributedReferences: selectedReferences };
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

export async function generateGroundedJson({ prompt, model = getConfiguredGeminiModel(), urls = [], useResearchTools = true, maxOutputTokens = 8192 } = {}) {
  const tools = !useResearchTools ? [] : urls.length ? [{ urlContext: {} }] : [{ googleSearch: {} }];
  const urlInstruction = urls.length ? `\nURLs que debes recuperar y comprobar:\n${urls.join("\n")}` : "";
  const data = await authenticatedJsonRequest("/api/gemini/generate", {
    model,
    payload: {
      contents: [{ role: "user", parts: [{ text: `${prompt}${urlInstruction}` }] }],
      tools,
      generationConfig: { maxOutputTokens: Math.max(8192, Number(maxOutputTokens) || 8192) }
    }
  });
  const parsed = parseJsonSafe(extractGeminiResponseText(data));
  return { parsed, groundingSources: sanitizeTrustedSources(groundingSourcesFromResponse(data)), raw: data };
}

export async function researchArticleEvidence({
  searchPlatforms,
  researchInstructions = [],
  topic = "",
  audience = "educators",
  mode = "marcie",
  minimumSources = 6,
  region = "MX",
  period = "6m",
  videoEvidence = null
} = {}) {
  const startedAt = performance.now();
  const response = await authenticatedJsonRequest("/api/marcie/evidence/research", {
    topic: String(topic || "").trim(), audience, mode, minimumSources, region, period, searchPlatforms, researchInstructions, videoEvidence
  });
  const dossier = response?.dossier || {};
  const sources = sanitizeTrustedSources(dossier.sources || []).filter((source) => source.verificationStatus === "verified" || (source.sourceType === "youtube_video" && source.verificationStatus === "attributed_only"));
  return {
    schemaVersion: String(dossier.schemaVersion || "1.0"),
    searchPlatforms: dossier.searchPlatforms ?? searchPlatforms,
    editorialMode: String(dossier.editorialMode || mode || "marcie"),
    topic: String(dossier.topic || topic || ""),
    summary: String(dossier.summary || ""),
    currentSignals: Array.isArray(dossier.currentSignals) ? dossier.currentSignals : [],
    signals: Array.isArray(dossier.currentSignals)
      ? dossier.currentSignals.map((signal) => String(signal?.signal || signal?.text || signal)).filter(Boolean)
      : [],
    facts: Array.isArray(dossier.facts) ? dossier.facts : [],
    sources,
    analysisStatus: dossier.analysisStatus || "pending",
    analysis: dossier.analysis || null,
    researchInstructions: dossier.researchInstructions || researchInstructions,
    researchRegion: dossier.researchRegion || region,
    historicalMilestones: Array.isArray(dossier.historicalMilestones) ? dossier.historicalMilestones : [],
    platformResults: dossier.platformResults || [],
    researchPolicyVersion: dossier.researchPolicyVersion || 1,
    attributedReferences: Array.isArray(dossier.attributedReferences) ? dossier.attributedReferences : [],
    researchPeriod: String(dossier.researchPeriod || period || "6m"),
    dateWindow: dossier.dateWindow || null,
    currentSourceCount: Number(dossier.currentSourceCount || 0),
    historicalSourceCount: Number(dossier.historicalSourceCount || 0),
    rejectedSources: Array.isArray(dossier.rejectedSources) ? dossier.rejectedSources : [],
    verifiedSourceCount: Number(dossier.verifiedSourceCount ?? sources.filter((source) => source.verificationStatus === "verified" && source.sourceType !== "youtube_video").length),
    totalSourceCount: Number(dossier.totalSourceCount || sources.length),
    documentSourceCount: Number(dossier.documentSourceCount || sources.filter((source) => source.sourceType !== "youtube_video").length),
    videoSourceCount: Number(dossier.videoSourceCount || sources.filter((source) => source.sourceType === "youtube_video").length),
    institutionCount: Number(dossier.institutionCount || 0),
    blockers: Array.isArray(dossier.blockers) ? dossier.blockers.map(String) : [],
    recommendations: Array.isArray(dossier.recommendations) ? dossier.recommendations.map(String) : [],
    minimumSourceCount: Number(dossier.minimumSourceCount || 0),
    targetSourceCount: Number(dossier.targetSourceCount || minimumSources),
    verificationStatus: dossier.verificationStatus || "blocked",
    researchedAt: dossier.researchedAt || new Date().toISOString(),
    telemetry: { ...(dossier.telemetry || {}), durationMs: Math.round(performance.now() - startedAt), retrievedUrls: sources.filter((source) => source.sourceType !== "youtube_video").map((source) => source.url), videoCount: sources.filter((source) => source.sourceType === "youtube_video").length }
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
      marcie_research_timeout: "La investigación bibliográfica tardó demasiado. El artículo anterior se conservó; vuelve a intentarlo o acota el tema.",
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
  let optimizedBlob = await encode("image/webp", 0.82);
  let optimizedMimeType = "image/webp";
  if (!optimizedBlob || optimizedBlob.type !== "image/webp") {
    optimizedBlob = await encode("image/jpeg", 0.82);
    optimizedMimeType = "image/jpeg";
  }
  if (!optimizedBlob) throw new Error("No se pudo codificar la imagen optimizada.");
  for (const quality of [0.74, 0.66, 0.58]) {
    if (optimizedBlob.size <= 512 * 1024) break;
    const candidate = await encode(optimizedMimeType, quality);
    if (candidate) optimizedBlob = candidate;
  }

  return {
    blob: optimizedBlob,
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
    parents: "Enfoque para madres, padres y tutores: acompañamiento cercano, confianza, hogar y vínculo con la comunidad escolar.",
    coordinators: "Enfoque para coordinadores académicos: liderazgo institucional, acompañamiento de equipos, decisiones curriculares y mejora sostenible."
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
${articlePlainText(article).slice(0, 600)}

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

  const storageRef = ref(storage, storagePath);
  const uploadSnapshot = await uploadBytes(storageRef, image.blob, {
    contentType: image.mimeType,
    cacheControl: "public,max-age=31536000,immutable",
    customMetadata: {
      creator: "Asc",
      copyright: "© Asc"
    }
  });
  const downloadUrl = await getDownloadURL(uploadSnapshot.ref);

  return {
    url: String(downloadUrl || "").trim(),
    storagePath,
    mimeType: image.mimeType,
    width: image.width,
    height: image.height,
    byteSize: image.byteSize,
    metadataStripped: true,
    optimizedForWeb: true,
    metadata: { creator: "Asc", copyright: "© Asc" },
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
 * 2. Genera 4 propuestas editoriales diferenciadas por audiencia con PNL y Hooks
 */
export async function generateProposalsWithGemini({ topic = "", signals = [], model = getConfiguredGeminiModel() } = {}) {
  const cleanTopic = sanitizeTopicTitle(topic);

  const prompt = `
${getActiveMarciePrompt("approach_proposals")}

Eres un editor en jefe de contenidos educativos de élite internacional.
A partir del tema "${cleanTopic}" y las señales detectadas [${signals.join("; ")}], genera EXACTAMENTE cuatro propuestas editoriales diferenciadas, una para cada audiencia, aplicando técnicas de PNL (Rapport, Gancho emocional, Interruptor de estado y preguntas detonantes):

1. "educators" (Docentes):
   - Foco: Práctica de aula, superar la sobrecarga, metodologías activas y reconectar con la pasión de enseñar.
2. "students" (Estudiantes):
   - Foco: Técnicas de aprendizaje acelerado, cómo estudiar a su propio ritmo sin agotarse, vencer la procrastinación y liberar tiempo libre.
3. "parents" (Padres y tutores):
   - Foco: Cómo entender y acompañar a sus hijos en el hogar sin batallas diarias, equilibrando afecto, presencia y tecnología.
4. "coordinators" (Coordinadores académicos y directivos escolares):
   - Foco: Liderazgo institucional y neuropedagógico, acompañamiento docente, decisiones curriculares basadas en evidencia y mejora sostenible de los aprendizajes.
   - Público específico: coordinadores académicos, directores y subdirectores de colegios, jefes de estudio y líderes pedagógicos.
   - Emplea con precisión conceptos pertinentes como atención, memoria de trabajo, carga cognitiva, funciones ejecutivas, autorregulación, metacognición y neuroplasticidad, únicamente cuando las señales o la evidencia permitan sostenerlos.
   - Traduce esos conceptos en decisiones institucionales: observación de aula, formación docente, alineación curricular, inclusión, clima escolar e indicadores de implementación.
   - PROHIBIDO reutilizar el enfoque familiar de "parents", dirigirse a madres o padres, hablar de "tus hijos" o proponer rutinas domésticas.
   - Evita neuromitos, determinismo cerebral, promesas terapéuticas y vocabulario pseudocientífico.

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
      "audienceLabel": "Docentes",
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
    },
    {
      "id": "prop-coordinators",
      "audience": "coordinators",
      "audienceLabel": "Coordinadores académicos y directivos escolares",
      "title": "¿Título estratégico sobre neuropedagogía y transformación escolar para líderes académicos?",
      "angle": "Liderazgo neuropedagógico, acompañamiento docente e implementación institucional basada en evidencia",
      "brief": "Marco de decisión para que coordinación y dirección traduzcan principios sobre atención, memoria, autorregulación y carga cognitiva en prácticas docentes, acuerdos curriculares e indicadores institucionales observables.",
      "estimatedReadTimeMinutes": 7
    }
  ]
}
`.trim();

  console.log(`[MarcieGemini] Generando 4 propuestas PNL con ${model} para: "${cleanTopic}"...`);
  const raw = await generateWithGemini({
    model,
    prompt,
    payload: {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.65,
        maxOutputTokens: 1200,
        responseMimeType: "application/json"
      }
    }
  });

  return parseJsonSafe(raw);
}

export async function refineBlogTopicWithGemini({ topic = "", specifications = [], audience = "educators", model = getConfiguredGeminiModel() } = {}) {
  const cleanTopic = sanitizeTopicTitle(topic);
  const audienceLabels = {
    educators: "docentes",
    parents: "madres, padres y familias",
    students: "estudiantes",
    coordinators: "coordinadores académicos y directivos escolares"
  };
  const audienceLabel = audienceLabels[audience] || audienceLabels.educators;
  const constraints = Array.isArray(specifications) && specifications.length
    ? specifications.map((item) => `- ${String(item).trim()}`).join("\n")
    : "- Sin especificaciones adicionales.";
  const prompt = `
${getActiveMarciePrompt("topic_refinement")}

Actúa como editor jefe de un blog educativo profesional. Mantén el Tema Central ("${cleanTopic}") y genera 6 propuestas de Títulos de Artículo redactadas específicamente para ${audienceLabel}, divididas en dos categorías:
1. 3 Títulos con HOOK: Atractivos, centrados en curiosidad, beneficio directo, urgencia o gancho provocativo positivo.
2. 3 Títulos con CONTRAHOOK: Contra-intuitivos, desafiantes de un mito común, contrapuntísticos o reflexivos.

Tema Central Original: "${cleanTopic}"
Público objetivo exclusivo: ${audienceLabel}.
Cada título debe reflejar sus necesidades, vocabulario, decisiones y contexto. No reutilices títulos genéricos pensados para otro público.
Especificaciones:
${constraints}

Responde ÚNICAMENTE con un objeto JSON válido con la siguiente estructura exacta:
{
  "topic": "${cleanTopic}",
  "hookTitles": [
    { "title": "Título Hook 1", "rationale": "Explicación breve de por qué engancha" },
    { "title": "Título Hook 2", "rationale": "Explicación breve" },
    { "title": "Título Hook 3", "rationale": "Explicación breve" }
  ],
  "contrahookTitles": [
    { "title": "Título Contrahook 1", "rationale": "Explicación breve del mito o ángulo contrapuesto" },
    { "title": "Título Contrahook 2", "rationale": "Explicación breve" },
    { "title": "Título Contrahook 3", "rationale": "Explicación breve" }
  ]
}
  `.trim();

  try {
    const raw = await generateWithGemini({
      model,
      prompt,
      payload: {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.75, maxOutputTokens: 1500, responseMimeType: "application/json" }
      }
    });
    let parsed = parseJsonSafe(raw);
    if (!parsed || typeof parsed !== "object") {
      const match = String(raw || "").match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch (_) {}
      }
    }
    if (parsed && typeof parsed === "object") {
      const hooks = Array.isArray(parsed.hookTitles) && parsed.hookTitles.length
        ? parsed.hookTitles.slice(0, 3).map((h, i) => ({ title: String(h?.title || h || `Propuesta Hook ${i+1}`).trim(), rationale: String(h?.rationale || "Enfoque de gancho y curiosidad").trim() }))
        : [
          { title: `Cómo dominar ${cleanTopic} paso a paso`, rationale: "Enfoque práctico y orientado a resultados" },
          { title: `La guía de ${cleanTopic} que ${audienceLabel} necesitan`, rationale: "Gancho de autoridad y completitud para el público elegido" },
          { title: `5 claves comprobadas sobre ${cleanTopic}`, rationale: "Curiosidad y estructura ágil" }
        ];
      const contrahooks = Array.isArray(parsed.contrahookTitles) && parsed.contrahookTitles.length
        ? parsed.contrahookTitles.slice(0, 3).map((c, i) => ({ title: String(c?.title || c || `Propuesta Contrahook ${i+1}`).trim(), rationale: String(c?.rationale || "Enfoque contrapuntístico y mito desmentido").trim() }))
        : [
          { title: `Por qué casi todo lo que sabes sobre ${cleanTopic} es un error`, rationale: "Desafío a la sabiduría convencional" },
          { title: `El lado oculto de ${cleanTopic}: lo que la mayoría pasa por alto`, rationale: "Ángulo reflexivo y contraintuitivo" },
          { title: `Antes de aplicar ${cleanTopic}, deberías saber esto`, rationale: "Advertencia ética y preventiva" }
        ];
      return {
        topic: parsed.topic || cleanTopic,
        hookTitles: hooks,
        contrahookTitles: contrahooks
      };
    }
    const cleanRawTitle = String(raw || "").replace(/^```(?:json|text)?/i, "").replace(/```$/i, "").replace(/^['"]|['"]$/g, "").trim();
    return {
      topic: cleanTopic,
      hookTitles: [
        { title: cleanRawTitle || `Estrategias esenciales para ${cleanTopic}`, rationale: "Propuesta de título directo y claro" },
        { title: `Guía práctica de ${cleanTopic} con impacto real`, rationale: "Propuesta enfocada en aplicación y evidencia" },
        { title: `Innovación y futuro en ${cleanTopic}`, rationale: "Perspectiva de tendencias pedagógicas" }
      ],
      contrahookTitles: [
        { title: `Mitos y verdades sobre ${cleanTopic}`, rationale: "Cuestionamiento analítico de prácticas habituales" },
        { title: `¿Realmente funciona ${cleanTopic}? Lo que dice la evidencia`, rationale: "Contrapunto basado en rigor e investigación" },
        { title: `Los 3 errores más comunes al abordar ${cleanTopic}`, rationale: "Perspectiva crítica de prevención de fallos" }
      ]
    };
  } catch (error) {
    return {
      topic: cleanTopic,
      hookTitles: [
        { title: `Claves prácticas para dominar ${cleanTopic}`, rationale: "Propuesta de aplicación inmediata" },
        { title: `Guía completa sobre ${cleanTopic} para ${audienceLabel}`, rationale: "Estructura panorámica adaptada al público" },
        { title: `Cómo aprovechar ${cleanTopic}: decisiones para ${audienceLabel}`, rationale: "Enfoque motivador y aplicable" }
      ],
      contrahookTitles: [
        { title: `Lo que nadie te dice sobre ${cleanTopic}`, rationale: "Ángulo de revelación y análisis crítico" },
        { title: `Mitos comunes en torno a ${cleanTopic}`, rationale: "Desmitificación con evidencia" },
        { title: `¿Es ${cleanTopic} la solución definitiva? Una mirada rigurosa`, rationale: "Evaluación objetiva y matizada" }
      ]
    };
  }
}

/**
  * Limpieza y Humanización Anti-IA para eliminar clichés sintéticos y patrones detectables
  */
export function humanizeArticleContent(article = {}) {
  if (!article || !Array.isArray(article.blocks)) return article;

  const bannedPatterns = [
    { regex: /\b(en el vertiginoso mundo (de|del))\b/gi, replacement: "En" },
    { regex: /\b(un pilar fundamental|pilares fundamentales)\b/gi, replacement: "un elemento clave" },
    { regex: /\b(es fundamental destacar que|es crucial destacar que|cabe señalar que)\b/gi, replacement: "Conviene notar que" },
    { regex: /\b(en conclusión|en resumen|en resumidas cuentas)\b/gi, replacement: "Por todo ello" },
    { regex: /\b(sin duda alguna|sin lugar a dudas)\b/gi, replacement: "Ciertamente" },
    { regex: /\b(sumérgete en|adentrarse en)\b/gi, replacement: "Explora" },
    { regex: /\b(desentrañar|paradigma|holístico)\b/gi, replacement: "comprender" }
  ];

  const cleanText = (text = "") => {
    let result = String(text || "");
    bannedPatterns.forEach(({ regex, replacement }) => {
      result = result.replace(regex, replacement);
    });
    // Eliminar etiquetas residuales o metadatos de IA entre corchetes robóticos
    result = result.replace(/\[\s*(IA|AI|Generado|Metadata|Prompt)[^\]]*\]/gi, "");
    return result.trim();
  };

  const humanizedBlocks = article.blocks.map(block => {
    if (!block) return block;
    const cloned = { ...block };
    if (typeof cloned.text === "string") cloned.text = cleanText(cloned.text);
    if (typeof cloned.content === "string") cloned.content = cleanText(cloned.content);
    if (Array.isArray(cloned.items)) {
      cloned.items = cloned.items.map(item => typeof item === "string" ? cleanText(item) : item);
    }
    return cloned;
  });

  return {
    ...article,
    title: cleanText(article.title),
    subtitle: cleanText(article.subtitle),
    excerpt: cleanText(article.excerpt),
    blocks: humanizedBlocks,
    humanizedAt: new Date().toISOString()
  };
}


export function getAudienceEditorialDirective(audience = "educators") {
  const aud = String(audience || "").toLowerCase();
  if (aud === "students") {
    return `
=== DIRECTIVA INNEGOCIABLE DE ENFOQUE: ESTUDIANTES ===
- Lector objetivo: El estudiante adolescente o joven universitario.
- Persona gramatical: Dirígete DIRECTAMENTE AL ESTUDIANTE de "tú" (segunda persona singular: "cuando estudias", "tu concentración", "tus apuntes", "organiza tu tiempo", "pon a prueba tu memoria").
- Tono: Cercano, empático, ágil, motivador y respetuoso. NUNCA infantilices ni uses tono condescendiente o paternalista.
- Contexto vital: Sus métodos personales de estudio, cómo comprende su propio cerebro, autorregulación, evitar la procrastinación, técnicas prácticas de atención y bienestar mental.
- PROHIBICIÓN TOTAL: NUNCA hables en tercera persona como si le hablaras a un adulto ("los estudiantes deben...", "para los jóvenes...") ni des consejos de crianza o didáctica docente. El artículo debe ser escrito por un mentor directo PARA el estudiante.`;
  }
  if (aud === "parents") {
    return `
=== DIRECTIVA INNEGOCIABLE DE ENFOQUE: PADRES Y FAMILIAS ===
- Lector objetivo: Madres, padres y tutores familiares en el hogar.
- Persona gramatical: Dirígete a las familias con calidez, comprensión y empatía ("en casa", "con tus hijos", "el acompañamiento familiar").
- Tono: Práctico, desculpabilizador, cálido y comprensivo. Sin tecnicismos pedagógicos ni jerga curricular abrumadora.
- Contexto vital: Situaciones cotidianas en el hogar, rutinas de sueño y tareas, convivencia, apoyo emocional del aprendizaje sin convertirlo en una batalla, y diálogo constructivo con la escuela.
- PROHIBICIÓN TOTAL: Queda prohibido hablar de programación didáctica, rúbricas de evaluación escolar o dirigirte al lector como si fuera el maestro que califica al alumno.`;
  }
  if (aud === "coordinators") {
    return `
=== DIRECTIVA INNEGOCIABLE DE ENFOQUE: COORDINADORES Y DIRECTIVOS ===
- Lector objetivo: Coordinadores académicos, directores escolares, jefes de estudio y líderes pedagógicos.
- Persona gramatical: Colega directivo y líder estratégico.
    - Tono: Profesional, reflexivo, sistémico, riguroso y orientado a la toma de decisiones institucionales. Emplea una densidad científica alta pero legible.
    - Precisión científica: Integra el vocabulario editorial configurado sólo cuando el dossier lo respalde y el tema lo requiera. Define cada término especializado al introducirlo y evita jerga ornamental y neuromitos.
    - Contexto vital: Liderazgo pedagógico, acompañamiento docente, diseño y alineación curricular, implementación institucional basada en evidencia, clima escolar e indicadores observables de mejora. Traduce cada concepto científico en criterios profesionales, seguimiento e indicadores.
- PROHIBICIÓN TOTAL: Queda estrictamente prohibido dirigirse a padres de familia, hablar de "tus hijos" o centrarse únicamente en la anécdota de un aula individual.`;
  }
  return `
=== DIRECTIVA INNEGOCIABLE DE ENFOQUE: DOCENTES Y PROFESORES ===
- Lector objetivo: Maestros, profesores y docentes de aula en ejercicio.
- Persona gramatical: De colega docente a colega docente ("en nuestras clases", "en el aula", "con tus alumnos").
  - Tono: Didáctico, reflexivo, empático, riguroso y con profundo respeto por la realidad cotidiana del aula. Emplea una densidad científica moderada y accesible.
  - Precisión científica: Integra el vocabulario editorial configurado sólo cuando el dossier lo respalde y el tema lo requiera. Define cada término especializado al introducirlo y conéctalo con una decisión pedagógica concreta; evita jerga ornamental y neuromitos.
  - Contexto vital: Gestión de aula, diseño de actividades, dinámicas pedagógicas, evaluación formativa, atención a la diversidad, interacción directa con estudiantes y bienestar docente.
- PROHIBICIÓN TOTAL: No trates al lector como si fuera el padre del alumno en casa ni como un directivo que supervisa presupuestos. Enfócate 100% en la práctica pedagógica real.`;
}

/**
 * 3. Redacta el ArticleDocument estructurado completo con PNL, Rapport, Hook, Pregunta Detonante y Fuentes Diversificadas
 */
export async function draftArticleWithGemini({ title = "", topic = "", audience = "educators", brief = "", model = getConfiguredGeminiModel(), researchDossier = null, verifyEvidence = true, editorialMode = "marcie", promptOverrides = null } = {}) {
  const promptText = id => promptOverrides?.[id] ?? getActiveMarciePrompt(id);
  const startedAt = performance.now();
  const now = new Date();
  const dateStr = now.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });

  const cleanTitle = sanitizeTopicTitle(title || topic);
  const cleanTopic = sanitizeTopicTitle(topic || cleanTitle);
  const audienceDirective = getAudienceEditorialDirective(audience);
  let dossier = researchDossier;
  if (!dossier) {
    try {
      dossier = await researchArticleEvidence({ topic: cleanTopic, audience, mode: editorialMode, minimumSources: editorialMode === "aida" ? 8 : 6 });
    } catch (error) {
      console.warn("[MarcieGemini] La investigación con grounding no pudo completarse:", error);
      dossier = { facts: [], sources: [], historicalMilestones: [] };
    }
  }
  globalThis.MarcieResearchPolicy.assertReady(dossier);
  const dossierText = JSON.stringify({ facts: dossier.facts || [], sources: dossier.sources || [], historicalMilestones: dossier.historicalMilestones || [], attributedReferences: dossier.attributedReferences || [] });

  const prompt = `
${audienceDirective}

REGLAS DE PRODUCCIÓN Y ESTILO EDITORIAL:
${promptText("article_drafting")}
${promptText("source_research_policy")}
${promptText("source_citation_policy")}

Redacta un artículo completo en español natural, fiel al tema central: ${cleanTopic}.
Título asignado a este artículo: ${cleanTitle}.
Audiencia obligatoria: ${audience}.
Instrucciones específicas del usuario: ${brief || cleanTopic}.

Usa exclusivamente el dossier para afirmaciones factuales. Si hay fuentes youtube_video, trátalas solo como punto de partida: crea una estructura y redacción completamente nuevas para esta audiencia, sin copiar su secuencia, frases ni hacer paráfrasis cercanas. Amplía, contrasta y fortalece sus ideas con las fuentes documentales verificadas del dossier. Incluye sourceIds en cada bloque respaldado, también para paráfrasis y contexto. Las fuentes youtube_video solo respaldan lo que el artículo atribuye explícitamente al autor, persona o canal; no las conviertas en prueba de hechos externos. Conserva locator para cualquier cita o hallazgo de video. No inventes autores, fechas, citas ni URLs. Las citas directas documentales deben coincidir literalmente con attributedReferences; las citas de video deben ser necesarias, tener máximo 25 palabras, coincidir con un fact marcado isDirectQuote y conservar su marca de tiempo. Sin cita textual comprobada, usa una síntesis propia con atribución clara.
Organiza la estructura según el tema y la audiencia, sin rellenar plantillas fijas. Conserva la extensión solicitada. Devuelve solo JSON:
Para citas en línea utiliza [sourceId] con el ID exacto del documento del dossier; la interfaz lo mostrará como autor o autores y año. No escribas [reference-1], numeraciones ni atribuciones inventadas. Cada cita debe resolver a un artículo, página o libro concreto. Si un documento cita a otro autor que no consultaste directamente, señala la atribución secundaria (como se citó en) y enlaza el documento efectivamente consultado, no inventes una referencia al original.
{"schemaVersion":"1.0","title":"","subtitle":"","excerpt":"","audience":"${audience}","readingTimeMinutes":6,"tags":[],"blocks":[{"id":"b1","type":"paragraph|heading|quote|bulletList","text":"","level":"h2|h3","items":[],"attribution":"","locator":"","sourceIds":[]}],"seo":{"title":"","description":"","keywords":[],"slug":""}}
Dossier completo de contexto y evidencia (la bibliografía se construye desde estos registros):
${dossierText}
`.trim();

  console.log(`[MarcieGemini] Redactando artículo maestro para ${audience} con PNL, fuentes diversas y ${model}...`);
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

  let parsed = parseJsonSafe(raw);

  if (parsed.title) {
    parsed.title = sanitizeTopicTitle(parsed.title);
  }
  parsed = applyVerifiedAttributions(parsed, dossier);
  parsed.sources = sanitizeTrustedSources(dossier.sources || []).filter((source) => source.verificationStatus === "verified" || (source.sourceType === "youtube_video" && source.verificationStatus === "attributed_only"));
  parsed.researchSources = parsed.sources;
  parsed.searchPlatforms = dossier.searchPlatforms;
  parsed.researchRegion = dossier.researchRegion;
  parsed.usedSources = [...parsed.sources];
  parsed.usedSourceIds = parsed.sources.map(source => source.id);
  parsed.sourceCitationStyle = "apa";
  parsed.researchDossier = { facts: dossier.facts || [], historicalMilestones: dossier.historicalMilestones || [], attributedReferences: dossier.attributedReferences || [], researchedAt: dossier.researchedAt || new Date().toISOString(), verifiedSourceCount: dossier.verifiedSourceCount ?? parsed.sources.filter((source) => source.verificationStatus === "verified" && source.sourceType !== "youtube_video").length, totalSourceCount: dossier.totalSourceCount ?? parsed.sources.length, targetSourceCount: dossier.targetSourceCount || 6, verificationStatus: dossier.verificationStatus || "blocked" };
  parsed.editorialMode = editorialMode;
  Object.assign(parsed.researchDossier, { analysisStatus: dossier.analysisStatus, analysis: dossier.analysis, platformResults: dossier.platformResults, researchInstructions: dossier.researchInstructions, researchRegion: dossier.researchRegion, searchPlatforms: dossier.searchPlatforms, researchPolicyVersion: dossier.researchPolicyVersion });
  parsed.generationTelemetry = { model, durationMs: Math.round(performance.now() - startedAt), retrievedUrls: parsed.sources.filter((source) => source.sourceType !== "youtube_video").map((source) => source.url), videoCount: parsed.sources.filter((source) => source.sourceType === "youtube_video").length, searches: dossier.telemetry?.searches || 0 };
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
  7. Para docentes, presencia de vocabulario científico moderado, explicado y aplicado al aula; para coordinadores, precisión científica profesional conectada con currículo, acompañamiento e indicadores institucionales.
  8. Ausencia de neuromitos, tecnicismos sin respaldo o jerga científica ornamental. No exijas anatomía cerebral cuando el tema o el dossier no la justifiquen.

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
        maxOutputTokens: 1800,
        responseMimeType: "application/json"
      }
    }
  });

  return parseJsonSafe(raw);
}

function parseJsonSafe(text = "") {
  try {
    return parseMarcieJson(text);
  } catch (err) {
    console.error("[MarcieGeminiService] Error parseando JSON de Gemini:", err, "\nRespuesta cruda:", text);
    throw new Error("La respuesta de Gemini no tuvo el formato JSON esperado.");
  }
}
