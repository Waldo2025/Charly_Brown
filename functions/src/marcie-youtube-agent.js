const crypto = require("node:crypto");
const { buildVertexGenerateRequest, DEFAULT_TEXT_MODEL } = require("./vertex.js");

const ANALYSIS_VERSION = 1;
const MAX_YOUTUBE_VIDEOS = 5;
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const ANALYSIS_TIMEOUT_MS = 105_000;

function clean(value, max = 1200) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);
}

function list(value, max = 20, itemMax = 500) {
  return (Array.isArray(value) ? value : []).map((item) => clean(item, itemMax)).filter(Boolean).slice(0, max);
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
  return String(response?.text || response?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "")
    .replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
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
Devuelve SOLO JSON: {"title":"","channel":"","publishedAt":"YYYY-MM-DD o vacío","summary":"","topics":[""],"concepts":[""],"proposedTopics":[""],"evidenceItems":[{"id":"","text":"","timestamp":"MM:SS","evidenceKind":"video_attribution|external_fact","needsCorroboration":true}],"shortQuotes":[{"text":"","timestamp":"MM:SS"}],"warnings":[""]}.`;
}

async function analyzeSingleYoutubeVideo(source, options = {}) {
  const client = options.client;
  if (!client?.models?.generateContent) throw Object.assign(new Error("youtube_analysis_client_unavailable"), { status: 503 });
  const request = buildVertexGenerateRequest({
    model: options.model || DEFAULT_TEXT_MODEL,
    payload: {
      contents: [{ role: "user", parts: [
        { fileData: { fileUri: source.url, mimeType: "video/mp4" } },
        { text: videoPrompt(options) }
      ] }],
      generationConfig: {
        maxOutputTokens: 16384,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingLevel: "HIGH" },
        mediaResolution: "MEDIA_RESOLUTION_LOW"
      }
    }
  });
  const response = await withDeadline(client.models.generateContent(request), options.timeoutMs);
  return normalizeVideoAnalysis(parseJson(responseText(response)), source);
}

async function analyzeYoutubeVideos({ urls = [], objective = "", language = "es-MX" } = {}, options = {}) {
  if (Array.isArray(urls) && urls.filter((value) => clean(value)).length > MAX_YOUTUBE_VIDEOS) {
    throw Object.assign(new Error("Solo puedes analizar hasta cinco videos por sesión."), { status: 400, code: "youtube_url_limit" });
  }
  const normalized = normalizeYoutubeUrls(urls);
  if (!normalized.valid.length) throw Object.assign(new Error("Agrega al menos una URL pública válida de YouTube."), { status: 400, code: "youtube_urls_required" });
  const videos = [];
  const rejectedVideos = [...normalized.invalid];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(2, normalized.valid.length) }, async () => {
    while (cursor < normalized.valid.length) {
      const source = normalized.valid[cursor++];
      try {
        videos.push(await (options.analyzeVideo || analyzeSingleYoutubeVideo)(source, { ...options, objective, language }));
      } catch (error) {
        rejectedVideos.push({ videoId: source.videoId, url: source.url, reason: clean(error?.code || error?.message || "youtube_analysis_failed", 160) });
      }
    }
  });
  await Promise.all(workers);
  videos.sort((a, b) => normalized.valid.findIndex((item) => item.videoId === a.videoId) - normalized.valid.findIndex((item) => item.videoId === b.videoId));
  if (!videos.length) throw Object.assign(new Error("No pude analizar ninguno de los videos. Verifica que sean públicos e inténtalo de nuevo."), { status: 422, code: "youtube_analysis_empty", rejectedVideos });
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
    combinedSynthesis: videos.map((video) => `${video.title}: ${video.summary}`).join("\n\n").slice(0, 12000),
    proposedTopics,
    evidenceItems: videos.flatMap((video) => video.evidenceItems),
    bibliographySources: videos.map((video) => video.bibliographySource),
    warnings,
    rejectedVideos,
    analyzedAt: new Date().toISOString()
  };
}

module.exports = {
  ANALYSIS_VERSION,
  MAX_YOUTUBE_VIDEOS,
  analyzeSingleYoutubeVideo,
  analyzeYoutubeVideos,
  normalizeYoutubeUrl,
  normalizeYoutubeUrls,
  normalizeVideoAnalysis,
  videoPrompt
};
