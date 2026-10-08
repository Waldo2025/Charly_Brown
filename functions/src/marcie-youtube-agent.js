const crypto = require("node:crypto");
const { buildVertexGenerateRequest } = require("./vertex.js");

const ANALYSIS_VERSION = 4;
const MAX_YOUTUBE_VIDEOS = 5;
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const ANALYSIS_TIMEOUT_MS = 500_000;
const INTERACTION_POLL_MS = 2_000;
const PUBLIC_METADATA_TIMEOUT_MS = 15_000;
const YOUTUBE_ANALYSIS_CACHE_COLLECTION = "MarcieYoutubeAnalysisCache";
const VIDEO_ANALYSIS_MODEL = "gemini-3.8-flash";
const VIDEO_FALLBACK_MODELS = ["gemini-3.5-flash", "gemini-3.5-flash-lite"];

function clean(value, max = 1200) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);
}

function list(value, max = 20, itemMax = 500) {
  return (Array.isArray(value) ? value : []).map((item) => clean(item, itemMax)).filter(Boolean).slice(0, max);
}

function uniqueList(values = [], max = 20, itemMax = 500) {
  const seen = new Set();
  const result = [];
  for (const raw of values) {
    const item = clean(raw, itemMax);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= max) break;
  }
  return result;
}

function youtubeAnalysisCacheKey({ ownerId = "", videoId = "", objective = "", language = "es-MX" } = {}) {
  const fingerprint = [
    clean(ownerId, 200),
    `v${ANALYSIS_VERSION}`,
    clean(language, 20).toLowerCase(),
    clean(videoId, 20),
    clean(objective, 1000).toLowerCase()
  ].join("|");
  return crypto.createHash("sha256").update(fingerprint).digest("hex");
}

function compactVideoAnalysisForCache(video = {}) {
  const source = normalizeYoutubeUrl(video.url) || (VIDEO_ID_PATTERN.test(clean(video.videoId, 20))
    ? { videoId: clean(video.videoId, 20), url: `https://www.youtube.com/watch?v=${clean(video.videoId, 20)}` }
    : null);
  if (!source) return null;
  return {
    videoId: source.videoId,
    url: source.url,
    title: clean(video.title, 500),
    channel: clean(video.channel, 300),
    publishedAt: clean(video.publishedAt, 40),
    summary: clean(video.summary, 2400),
    centralIdea: clean(video.centralIdea, 1800),
    neuroeducationConnection: clean(video.neuroeducationConnection, 1800),
    topics: list(video.topics, 12, 240),
    concepts: list(video.concepts, 20, 300),
    proposedTopics: list(video.proposedTopics, 3, 300),
    evidenceItems: (Array.isArray(video.evidenceItems) ? video.evidenceItems : []).slice(0, 30).map((item) => ({
      id: clean(item?.id, 120),
      text: clean(item?.text, 1000),
      sourceIds: list(item?.sourceIds, 5, 120),
      locator: timestamp(item?.locator || item?.timestamp),
      evidenceKind: item?.evidenceKind === "external_fact" ? "external_fact" : "video_attribution",
      needsCorroboration: item?.needsCorroboration === true
    })).filter((item) => item.text),
    shortQuotes: (Array.isArray(video.shortQuotes) ? video.shortQuotes : []).slice(0, 8).map((item) => ({
      text: clean(item?.text, 220).split(/\s+/).slice(0, 25).join(" "),
      locator: timestamp(item?.locator || item?.timestamp)
    })).filter((item) => item.text && item.locator),
    warnings: list(video.warnings, 12, 500),
    bibliographySource: video.bibliographySource && typeof video.bibliographySource === "object"
      ? {
          id: clean(video.bibliographySource.id, 120),
          sourceType: "youtube_video",
          title: clean(video.bibliographySource.title, 500),
          channel: clean(video.bibliographySource.channel || video.channel, 300),
          authors: list(video.bibliographySource.authors, 10, 300),
          publisher: "YouTube",
          publishedAt: clean(video.bibliographySource.publishedAt, 40),
          url: source.url,
          videoId: source.videoId,
          verificationStatus: "attributed_only",
          evidenceRole: "video",
          supportSummary: clean(video.bibliographySource.supportSummary, 1800),
          locator: timestamp(video.bibliographySource.locator)
        }
      : null
  };
}

function normalizeYoutubeUrl(value = "") {
  let parsed;
  try { parsed = new URL(clean(value, 3000)); } catch (_) { return null; }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  let videoId = "";
  if (host === "youtu.be") videoId = parsed.pathname.split("/").filter(Boolean)[0] || "";
  else if (["youtube.com", "m.youtube.com", "music.youtube.com"].includes(host)) {
    if (parsed.pathname === "/watch") videoId = parsed.searchParams.get("v") || "";
    else {
      const match = parsed.pathname.match(/^\/(?:shorts|live)\/([^/?#]+)/i);
      videoId = match?.[1] || "";
    }
  }
  if (!VIDEO_ID_PATTERN.test(videoId)) return null;
  return { videoId, url: `https://www.youtube.com/watch?v=${videoId}` };
}

function normalizeYoutubeUrls(values = []) {
  const input = Array.isArray(values) ? values : String(values || "").split(/[\n,;]+/);
  const valid = [];
  const invalid = [];
  const seen = new Set();
  for (const raw of input.slice(0, 20)) {
    const normalized = normalizeYoutubeUrl(raw);
    if (!normalized) {
      if (clean(raw)) invalid.push({ value: clean(raw, 300), reason: "invalid_youtube_url" });
      continue;
    }
    if (seen.has(normalized.videoId)) continue;
    seen.add(normalized.videoId);
    valid.push(normalized);
    if (valid.length >= MAX_YOUTUBE_VIDEOS) break;
  }
  return { valid, invalid };
}

function responseText(response = {}) {
  return String(response?.output_text || response?.text || response?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "")
    .replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

async function fetchText(url, { timeoutMs = PUBLIC_METADATA_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        "Accept-Language": "es-MX,es;q=0.9,en;q=0.7",
        "User-Agent": "Mozilla/5.0 MarcieEditorialAgent/1.0"
      },
      signal: controller.signal
    });
    if (!response.ok) throw Object.assign(new Error(`youtube_fetch_${response.status}`), { code: `youtube_fetch_${response.status}`, status: response.status });
    return response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, options = {}) {
  return JSON.parse(await fetchText(url, options));
}

function parseJson(value = "") {
  const text = String(value || "");
  try { return JSON.parse(text); } catch (_) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw Object.assign(new Error("youtube_analysis_invalid_json"), { code: "youtube_analysis_invalid_json" });
  }
}

function withDeadline(work, timeoutMs = ANALYSIS_TIMEOUT_MS) {
  let timer;
  const deadline = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error("youtube_analysis_timeout"), { code: "youtube_analysis_timeout", status: 503 })), timeoutMs);
  });
  return Promise.race([Promise.resolve(work), deadline]).finally(() => clearTimeout(timer));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function interactionFailure(interaction = {}) {
  const detail = interaction.errors?.map((item) => item?.message || item?.code).filter(Boolean).join("; ")
    || `youtube_interaction_${interaction.status || "failed"}`;
  return Object.assign(new Error(detail), { code: "youtube_analysis_failed", status: 503 });
}

async function waitForInteraction(client, interaction, options = {}) {
  let current = interaction;
  const sleep = options.sleep || delay;
  while (["queued", "in_progress"].includes(current?.status)) {
    await sleep(options.pollMs || INTERACTION_POLL_MS);
    current = await client.interactions.get(current.id);
  }
  if (current?.status && current.status !== "completed") throw interactionFailure(current);
  return current;
}

function shouldFallbackToGenerateContent(error) {
  const details = [error?.code, error?.status, error?.message, error?.response?.data]
    .filter(Boolean).map((value) => typeof value === "string" ? value : JSON.stringify(value)).join(" ");
  return /not found|unimplemented|unsupported|unknown field|invalid argument|interactions/i.test(details);
}

function errorDetailText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch (_) { return String(value); }
}

function youtubeErrorReason(error) {
  const parts = [
    clean(error?.code || "", 80),
    clean(error?.message || "", 220),
    clean(error?.cause?.code || "", 80),
    clean(error?.cause?.message || "", 220),
    clean(errorDetailText(error?.response?.data), 300)
  ].filter(Boolean);
  const unique = [];
  for (const part of parts) {
    if (!unique.some((item) => item === part)) unique.push(part);
  }
  return clean(unique.join(": "), 500) || "youtube_analysis_failed";
}

function extractJsonArrayAfterMarker(text = "", marker = "") {
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) return null;
  const start = text.indexOf("[", markerIndex + marker.length);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === "\"") inString = false;
      continue;
    }
    if (character === "\"") inString = true;
    else if (character === "[") depth += 1;
    else if (character === "]") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

function stripCaptionText(value = "") {
  return clean(String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">"), 20000);
}

async function fetchYoutubePublicMetadata(source) {
  let page = {};
  try { page = youtubeMetadataFromHtml(await fetchText(source.url), source); } catch (_) {}
  let oembed = {};
  if (!page.title || !page.channel) {
    try { oembed = await fetchJson(`https://www.youtube.com/oembed?url=${encodeURIComponent(source.url)}&format=json`); } catch (_) {}
  }
  return {
    title: page.title || clean(oembed.title, 500),
    channel: page.channel || clean(oembed.author_name, 300),
    publishedAt: page.publishedAt || "",
    authorUrl: clean(oembed.author_url, 1000),
    thumbnailUrl: clean(oembed.thumbnail_url, 1000)
  };
}

function youtubeMetadataFromHtml(html, source) {
  const value = String(html || "");
  const expected = source?.videoId;
  const fromJsonString = key => {
    const match = value.match(new RegExp(`"${key}"\\s*:\\s*("(?:\\\\.|[^"\\\\])*")`));
    if (!match) return "";
    try { return JSON.parse(match[1]); } catch (_) { return ""; }
  };
  const pageId = fromJsonString("externalVideoId") || value.match(/<link[^>]+rel="canonical"[^>]+href="[^"]*[?&]v=([A-Za-z0-9_-]{11})/i)?.[1];
  if (!expected || pageId !== expected) return {};
  let structured = {};
  for (const match of value.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1]);
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      structured = entries.find(item => item?.["@type"] === "VideoObject" && String(item["@id"] || item.url || "").includes(expected)) || structured;
    } catch (_) {}
  }
  const date = clean(structured.uploadDate || fromJsonString("uploadDate") || fromJsonString("publishDate"), 40);
  return {
    title: clean(structured.name || fromJsonString("title"), 500),
    channel: clean(fromJsonString("ownerChannelName") || fromJsonString("author"), 300),
    publishedAt: /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : ""
  };
}

function applyPublicMetadata(video, metadata = {}) {
  if (!video) return video;
  const title = clean(metadata.title, 500) || video.title;
  const channel = clean(metadata.channel, 300) || video.channel;
  const publishedAt = clean(metadata.publishedAt, 40) || video.publishedAt;
  return {
    ...video, title, channel, publishedAt,
    bibliographySource: {
      ...(video.bibliographySource || {}), title, channel,
      authors: channel ? [channel] : video.bibliographySource?.authors || [],
      publishedAt
    }
  };
}

async function fetchYoutubePublicCaptions(source) {
  const html = await fetchText(source.url);
  const rawTracks = extractJsonArrayAfterMarker(html, "\"captionTracks\":");
  if (!rawTracks) throw Object.assign(new Error("YouTube no expuso pistas de subtítulos en la respuesta pública."), { code: "youtube_caption_tracks_missing" });
  let tracks = [];
  try { tracks = JSON.parse(rawTracks); } catch (_) {
    throw Object.assign(new Error("No se pudieron interpretar las pistas de subtítulos de YouTube."), { code: "youtube_caption_tracks_invalid" });
  }
  const preferred = tracks.find((track) => /^es(?:-|$)/i.test(track.languageCode || ""))
    || tracks.find((track) => /^en(?:-|$)/i.test(track.languageCode || ""))
    || tracks[0];
  if (!preferred?.baseUrl) throw Object.assign(new Error("La pista de subtítulos no tiene una URL de descarga."), { code: "youtube_caption_url_missing" });
  const captionUrl = new URL(preferred.baseUrl);
  captionUrl.searchParams.set("fmt", "json3");
  const raw = await fetchText(captionUrl.toString());
  if (!raw.trim()) throw Object.assign(new Error("YouTube anunció subtítulos, pero devolvió vacía su descarga pública."), { code: "youtube_caption_download_empty" });
  try {
    const parsed = JSON.parse(raw);
    const captions = stripCaptionText((parsed.events || [])
      .flatMap((event) => (event.segs || []).map((segment) => segment.utf8 || ""))
      .join(" "));
    if (captions) return captions;
  } catch (_) {
    // Una página HTML de error con estado 200 no es una transcripción.
  }
  throw Object.assign(new Error("La descarga de subtítulos no contiene segmentos legibles."), { code: "youtube_caption_content_invalid" });
}

async function analyzeWithPublicYoutubeFallback(client, source, options = {}) {
  let captions = "";
  let captionsError = null;
  try {
    captions = await fetchYoutubePublicCaptions(source);
  } catch (error) {
    captionsError = error;
  }
  if (typeof options.onPublicFallback === "function") {
    try {
      options.onPublicFallback({
        source,
        captionsAvailable: Boolean(captions),
        captionsReason: captions ? "" : youtubeErrorReason(captionsError) || "youtube_public_captions_unavailable_or_unreadable",
        firstReason: options.firstReason || "",
        fallbackReason: options.fallbackReason || ""
      });
    } catch (_) {}
  }
  if (!captions) {
    throw Object.assign(new Error("Gemini no pudo leer el video y no se pudo obtener una transcripción pública legible."), {
      code: "youtube_public_captions_unavailable",
      status: 422,
      cause: captionsError || undefined
    });
  }
  if (!client?.models?.generateContent) {
    throw Object.assign(new Error("No está disponible el modelo para analizar los subtítulos públicos."), {
      code: "youtube_caption_analysis_unavailable",
      status: 503
    });
  }

  const metadata = await fetchYoutubePublicMetadata(source);
  const request = buildVertexGenerateRequest({
    model: options.model || VIDEO_ANALYSIS_MODEL,
    payload: {
      contents: [{ role: "user", parts: [{ text: `Analiza estos subtítulos públicos de YouTube como fuente editorial. No reproduzcas ni guardes una transcripción completa. Devuelve SOLO JSON con el mismo esquema solicitado.
Título: ${metadata.title}
Canal: ${metadata.channel}
Objetivo editorial: ${clean(options.objective, 1000) || "identificar ideas utilizables para un artículo educativo"}
Subtítulos públicos parciales:
${captions.slice(0, 12000)}

JSON: {"title":"","channel":"","publishedAt":"","summary":"","centralIdea":"","neuroeducationConnection":"","topics":[""],"concepts":[""],"proposedTopics":[""],"evidenceItems":[{"id":"","text":"","timestamp":"","evidenceKind":"video_attribution","needsCorroboration":true}],"shortQuotes":[],"warnings":[""]}` }] }],
      generationConfig: { maxOutputTokens: 8192, responseMimeType: "application/json", thinkingConfig: { thinkingLevel: "MEDIUM" } }
    }
  });
  const parsed = parseJson(responseText(await client.models.generateContent(request)));
  const normalized = normalizeVideoAnalysis({
    ...parsed,
    title: metadata.title || parsed.title,
    channel: metadata.channel || parsed.channel,
    publishedAt: metadata.publishedAt || parsed.publishedAt,
    warnings: uniqueList([...(parsed.warnings || []), "Gemini no pudo ingerir directamente el video; el análisis se realizó con subtítulos públicos de YouTube."], 12, 500)
  }, source);
  normalized.analysisMode = "public_captions_fallback";
  return normalized;
}

async function analyzeWithAgenticInteraction(client, source, options = {}) {
  if (!client?.interactions?.create) throw Object.assign(new Error("youtube_interactions_unavailable"), { code: "youtube_interactions_unavailable" });
  const interaction = await client.interactions.create({
    model: options.model || VIDEO_ANALYSIS_MODEL,
    background: true,
    response_mime_type: "application/json",
    input: [
      { type: "video", uri: source.url, processing: "agentic" },
      { type: "text", text: videoPrompt(options) }
    ],
    generation_config: { max_output_tokens: 16384 }
  });
  const completed = await waitForInteraction(client, interaction, options);
  if (completed?.id && client.interactions.delete && options.deleteInteraction !== false) {
    await client.interactions.delete(completed.id).catch(() => {});
  }
  return completed;
}

async function analyzeWithGenerateContent(client, source, options = {}) {
  if (!client?.models?.generateContent) throw Object.assign(new Error("youtube_analysis_client_unavailable"), { status: 503 });
  const request = buildVertexGenerateRequest({
    model: options.model || VIDEO_ANALYSIS_MODEL,
    payload: {
      contents: [{ role: "user", parts: [
        { fileData: { fileUri: source.url, mimeType: "video/mp4" } },
        { text: videoPrompt(options) }
      ] }],
      generationConfig: {
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingLevel: "MEDIUM" },
        mediaResolution: "MEDIA_RESOLUTION_LOW"
      }
    }
  });
  return client.models.generateContent(request);
}

function timestamp(value) {
  const raw = clean(value, 24);
  if (!raw || !/^(?:\d{1,2}:)?\d{1,2}:\d{2}$/.test(raw)) return "";
  return raw;
}

function normalizeVideoAnalysis(parsed = {}, source = {}) {
  const title = clean(parsed.title, 500) || `Video de YouTube ${source.videoId}`;
  const channel = clean(parsed.channel, 300);
  const publishedAt = /^\d{4}(?:-\d{2}-\d{2})?/.test(clean(parsed.publishedAt, 40)) ? clean(parsed.publishedAt, 40) : "";
  const sourceId = `youtube-${source.videoId}`;
  const evidenceItems = (Array.isArray(parsed.evidenceItems) ? parsed.evidenceItems : []).slice(0, 30).map((item, index) => ({
    id: clean(item?.id, 120) || `${sourceId}-e${index + 1}`,
    text: clean(item?.text || item?.claim, 1000),
    sourceIds: [sourceId],
    locator: timestamp(item?.timestamp || item?.start),
    evidenceKind: item?.evidenceKind === "external_fact" ? "external_fact" : "video_attribution",
    needsCorroboration: item?.evidenceKind === "external_fact" || item?.needsCorroboration === true
  })).filter((item) => item.text);
  const shortQuotes = (Array.isArray(parsed.shortQuotes) ? parsed.shortQuotes : []).slice(0, 8).map((item) => ({
    text: clean(item?.text, 220).split(/\s+/).slice(0, 25).join(" "),
    locator: timestamp(item?.timestamp || item?.start)
  })).filter((item) => item.text && item.locator);
  const bibliographySource = {
    id: sourceId,
    sourceType: "youtube_video",
    title,
    channel,
    authors: channel ? [channel] : [],
    publisher: "YouTube",
    publishedAt,
    url: source.url,
    videoId: source.videoId,
    verificationStatus: "attributed_only",
    evidenceRole: "video",
    supportSummary: clean(parsed.summary, 1800),
    locator: evidenceItems.find((item) => item.locator)?.locator || ""
  };
  return {
    videoId: source.videoId,
    url: source.url,
    title,
    channel,
    publishedAt,
    summary: clean(parsed.summary, 2400),
    centralIdea: clean(parsed.centralIdea, 1800) || clean(parsed.summary, 1800),
    neuroeducationConnection: clean(parsed.neuroeducationConnection, 1800),
    topics: list(parsed.topics, 12, 240),
    concepts: list(parsed.concepts, 20, 300),
    proposedTopics: list(parsed.proposedTopics, 3, 300),
    evidenceItems,
    shortQuotes,
    warnings: list(parsed.warnings, 12, 500),
    bibliographySource
  };
}

function videoPrompt({ objective = "", language = "es-MX" } = {}) {
  return `Analiza este video público de YouTube como fuente para un artículo educativo en ${language}. Objetivo editorial: ${clean(objective, 1000) || "identificar el tema, las ideas y la evidencia utilizable"}.
El video es únicamente el punto de partida editorial: extrae ideas y hallazgos, pero no reproduzcas su secuencia, estructura ni redacción. No entregues una transcripción completa ni paráfrasis extensas o demasiado cercanas al original. No inventes título, canal, fecha, citas ni marcas de tiempo. Distingue lo que el autor dice o muestra (video_attribution) de afirmaciones factuales que necesitan contraste externo (external_fact). Las citas deben tener máximo 25 palabras, una marca de tiempo comprobable y usarse solo cuando sean necesarias para atribuir una idea.
Identifica obligatoriamente dos elementos separados: (1) la idea central realmente sostenida por el video y (2) su relación pertinente con la neuroeducación. Esa relación debe explicar implicaciones para aprendizaje, atención, memoria, emoción, lenguaje, autorregulación o práctica educativa solo cuando el contenido lo permita; señala como advertencia cualquier inferencia que requiera respaldo documental externo. No fuerces una relación neurocientífica que el video no sustente.
${clean(objective, 1000) ? "El objetivo indicado por el usuario es obligatorio: la síntesis y los temas propuestos deben responder directamente a él. No propongas títulos o ángulos que se aparten de esa intención, aunque el video trate otros asuntos secundarios." : "Propón temas que representen con precisión las ideas centrales del video, no temas educativos genéricos."}
Devuelve SOLO JSON: {"title":"","channel":"","publishedAt":"YYYY-MM-DD o vacío","summary":"","centralIdea":"","neuroeducationConnection":"","topics":[""],"concepts":[""],"proposedTopics":[""],"evidenceItems":[{"id":"","text":"","timestamp":"MM:SS","evidenceKind":"video_attribution|external_fact","needsCorroboration":true}],"shortQuotes":[{"text":"","timestamp":"MM:SS"}],"warnings":[""]}.`;
}

async function analyzeSingleYoutubeVideo(source, options = {}) {
  const client = options.client;
  const models = [options.model || VIDEO_ANALYSIS_MODEL, ...VIDEO_FALLBACK_MODELS]
    .filter((model, index, all) => all.indexOf(model) === index);
  const attemptTimeoutMs = Math.min(options.timeoutMs || 150_000, 150_000);
  let lastError = null;
  for (const [index, model] of models.entries()) {
    try {
      // Vertex documenta las URLs de YouTube mediante generateContent.
      // Interactions devuelve "Unsupported model interaction" para este cliente.
      const response = await withDeadline(analyzeWithGenerateContent(client, source, { ...options, model }), attemptTimeoutMs);
      const parsed = parseJson(responseText(response));
      if (!clean(parsed.summary || parsed.centralIdea)) {
        throw Object.assign(new Error("Gemini devolvió un análisis del video sin contenido verificable."), { code: "youtube_analysis_empty_response" });
      }
      const metadata = await fetchYoutubePublicMetadata(source).catch(() => null);
      const video = normalizeVideoAnalysis({
        ...parsed,
        title: metadata?.title || parsed.title,
        channel: metadata?.channel || parsed.channel,
        publishedAt: metadata?.publishedAt || parsed.publishedAt
      }, source);
      video.analysisMode = "vertex_video";
      return video;
    } catch (error) {
      lastError = error;
      if (typeof options.onVideoFallback === "function") {
        options.onVideoFallback({ source, model, reason: youtubeErrorReason(error) });
      }
      if (index < models.length - 1 && /\b429\b|RESOURCE_EXHAUSTED|resource exhausted/i.test(youtubeErrorReason(error))) {
        await (options.sleep || delay)(Math.min(4_000, 1_000 * 2 ** index));
      }
    }
  }
  try {
    return await analyzeWithPublicYoutubeFallback(client, source, {
      ...options,
      firstReason: "vertex_generate_content_exhausted",
      fallbackReason: youtubeErrorReason(lastError)
    });
  } catch (publicError) {
    throw Object.assign(new Error(youtubeErrorReason(publicError)), {
      code: clean(publicError?.code || lastError?.code || "youtube_analysis_failed", 120),
      status: publicError?.status || lastError?.status || lastError?.response?.status,
      cause: publicError,
      firstReason: "vertex_generate_content_exhausted",
      fallbackReason: youtubeErrorReason(lastError),
      publicFallbackReason: youtubeErrorReason(publicError)
    });
  }
}

async function analyzeYoutubeVideos({ urls = [], objective = "", language = "es-MX" } = {}, options = {}) {
  if (Array.isArray(urls) && urls.filter((value) => clean(value)).length > MAX_YOUTUBE_VIDEOS) {
    throw Object.assign(new Error("Solo puedes analizar hasta cinco videos por sesión."), { status: 400, code: "youtube_url_limit" });
  }
  const normalized = normalizeYoutubeUrls(urls);
  if (!normalized.valid.length) throw Object.assign(new Error("Agrega al menos una URL pública válida de YouTube."), { status: 400, code: "youtube_urls_required" });
  const videos = [];
  const rejectedVideos = [...normalized.invalid];
  let cacheHitCount = 0;
  let cacheMissCount = 0;
  let cursor = 0;
  const workers = Array.from({ length: Math.min(2, normalized.valid.length) }, async () => {
    while (cursor < normalized.valid.length) {
      const source = normalized.valid[cursor++];
      try {
        let video = null;
        if (typeof options.readCachedAnalysis === "function") {
          try {
            const cached = await options.readCachedAnalysis({ source, objective, language, analysisVersion: ANALYSIS_VERSION });
            video = compactVideoAnalysisForCache(cached);
          } catch (_) {}
        }
        if (video?.videoId === source.videoId) {
          if (!video.channel || !video.publishedAt || /^Video de YouTube [A-Za-z0-9_-]{11}$/.test(video.title)) {
            const metadata = await fetchYoutubePublicMetadata(source).catch(() => null);
            video = applyPublicMetadata(video, metadata);
            if (metadata && typeof options.writeCachedAnalysis === "function") {
              try { await options.writeCachedAnalysis({ source, objective, language, analysisVersion: ANALYSIS_VERSION, video: compactVideoAnalysisForCache(video) }); } catch (_) {}
            }
          }
          cacheHitCount += 1;
        } else {
          cacheMissCount += 1;
          video = await (options.analyzeVideo || analyzeSingleYoutubeVideo)(source, { ...options, objective, language });
          if (video?.cacheable !== false && typeof options.writeCachedAnalysis === "function") {
            try {
              await options.writeCachedAnalysis({ source, objective, language, analysisVersion: ANALYSIS_VERSION, video: compactVideoAnalysisForCache(video) });
            } catch (_) {}
          }
        }
        videos.push(video);
      } catch (error) {
        rejectedVideos.push({
          videoId: source.videoId,
          url: source.url,
          reason: youtubeErrorReason(error),
          firstReason: clean(error?.firstReason || "", 500),
          fallbackReason: clean(error?.fallbackReason || "", 500),
          publicFallbackReason: clean(error?.publicFallbackReason || "", 500)
        });
      }
    }
  });
  await Promise.all(workers);
  videos.sort((a, b) => normalized.valid.findIndex((item) => item.videoId === a.videoId) - normalized.valid.findIndex((item) => item.videoId === b.videoId));
  if (!videos.length) {
    const timedOut = rejectedVideos.length > 0 && rejectedVideos.every((item) => item.reason === "youtube_analysis_timeout");
    throw Object.assign(new Error(timedOut
      ? "El análisis del video tardó más de lo esperado. Inténtalo nuevamente; la URL sigue siendo válida."
      : "No pude analizar ninguno de los videos. Verifica que sean públicos e inténtalo de nuevo."), {
      status: timedOut ? 504 : 422,
      code: timedOut ? "youtube_analysis_timeout" : "youtube_analysis_empty",
      rejectedVideos
    });
  }
  const proposedTopics = [];
  for (const value of videos.flatMap((video) => video.proposedTopics)) {
    if (!proposedTopics.some((item) => item.toLowerCase() === value.toLowerCase())) proposedTopics.push(value);
    if (proposedTopics.length >= 3) break;
  }
  const warnings = [...videos.flatMap((video) => video.warnings), ...rejectedVideos.map((item) => `No se analizó ${item.videoId || "una URL"}: ${item.reason}.`)];
  return {
    analysisVersion: ANALYSIS_VERSION,
    analysisId: `youtube-analysis-${crypto.randomUUID()}`,
    videos,
    combinedSynthesis: videos.map((video) => `${video.title}\nIdea central: ${video.centralIdea || video.summary}\nRelación con la neuroeducación: ${video.neuroeducationConnection || "Pendiente de contraste documental"}`).join("\n\n").slice(0, 12000),
    proposedTopics,
    evidenceItems: videos.flatMap((video) => video.evidenceItems),
    bibliographySources: videos.map((video) => video.bibliographySource),
    warnings,
    rejectedVideos,
    cache: { hitCount: cacheHitCount, missCount: cacheMissCount },
    analyzedAt: new Date().toISOString()
  };
}

module.exports = {
  ANALYSIS_VERSION,
  ANALYSIS_TIMEOUT_MS,
  INTERACTION_POLL_MS,
  MAX_YOUTUBE_VIDEOS,
  YOUTUBE_ANALYSIS_CACHE_COLLECTION,
  analyzeWithAgenticInteraction,
  analyzeSingleYoutubeVideo,
  analyzeYoutubeVideos,
  fetchYoutubePublicMetadata,
  normalizeYoutubeUrl,
  normalizeYoutubeUrls,
  normalizeVideoAnalysis,
  youtubeMetadataFromHtml,
  youtubeErrorReason,
  compactVideoAnalysisForCache,
  youtubeAnalysisCacheKey,
  videoPrompt
};
