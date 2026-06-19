const express = require("express");
const cors = require("cors");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, execSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { pipeline } = require("node:stream/promises");
const { Readable } = require("node:stream");
const {
  normalizePersistedMediaReference
} = require("./media-reference.js");
const {
  sanitizeDialogueVideoJobPublicPayload
} = require("./dialogue-video-job-state.js");
const {
  createMontageExportJobStore,
  sanitizeMontageExportPersistedRequest
} = require("./montage-export/job-store-firestore.js");
const {
  recoverMontageExportJobSnapshot,
  DEFAULT_RECENT_SNAPSHOT_GRACE_MS
} = require("./montage-export/job-snapshot.js");
const {
  sanitizeMontageExportJobPublicPayload
} = require("./montage-export/public-payload.js");
const {
  canAutoResumeInterruptedMontageExportJob,
  buildAutoResumeInterruptedMontageExportJobPatch
} = require("./montage-export/restart-recovery.js");
const {
  createProcessMontageExportJob
} = require("./montage-export/worker-runner.js");
const {
  shouldContinueVariantFallback
} = require("./podcaster-video-variant-fallback.js");
const {
  buildDialogueVideoPromptBundle
} = require("./dialogue-video-prompt.js");
const {
  buildGeminiUpstreamRetryDelays,
  fetchGeminiWithRetry,
  isRetryableGeminiUpstreamStatus
} = require("./gemini-upstream-retry.js");
const {
  createHeavyWorkCoordinator,
  validateDialogueVideoInlineReferenceBudget
} = require("./podcaster-stability.js");
const {
  normalizeDialogueAudioWordTimings,
  extractGeminiDialogueAudioWordTimings
} = require("./podcaster-dialogue-audio-alignment.js");
const {
  resolveOnScreenTextExportCanvasSize,
  resolveOnScreenTextRenderSpec,
  normalizeOnScreenTextTrackSettings,
  normalizeKaraokeWordTimings,
  scaleKaraokeWordTimingsForPlaybackRate,
  buildMontageOnScreenTextAss,
  buildMontageOnScreenTextDrawFilters,
  buildMontageOnScreenTextKaraokeBoxFilters
} = require(path.resolve(__dirname, "..", "public", "podcaster", "podcaster-text-render.js"));
const {
  resolveSceneMediaRenderSpec
} = require(path.resolve(__dirname, "..", "public", "podcaster", "podcaster-scene-media-render-spec.js"));
const {
  extractFeaturedSourceTextFromHtml
} = require("./featured-source-extractor.js");
const {
  buildStreamingMediaPayload
} = require("./proxy-media-buffer.js");
const {
  shouldDestroyProxyMediaUpstream
} = require("./proxy-media-lifecycle.js");
const {
  uploadFileToBucketNonResumable
} = require("./storage-upload.js");
const {
  resolveMontageExportVideoParams,
  resolveMontageIntermediateVideoParams
} = require("./montage-export-video-params.js");
const {
  normalizeMontageRenderMode,
  shouldUseBrowserMontageRenderer,
  renderMontageBrowserOverlayVideo
} = require("./montage-browser-render.js");
const {
  ANALIZAR_PDF_MAPPING_TOOL_NAME,
  buildResultSummary,
  buildDefaultStyleMappingSeeds,
  buildStyleMappingScopeKey,
  classifyAnalizarPdfStartupError,
  createAnalizarPdfJobStore,
  ensureDirSync,
  logAnalizarPdf,
  normalizeAnalysisStatus,
  resolveAnalyzerScript,
  sanitizeResultSummary,
  sanitizeAnalizarPdfSession,
  sanitizeStyleMapping,
  spawnAnalizarPdfPythonJob
} = require("./analizar-pdf.js");

let admin = null;
let GoogleGenAI = null;

try {
  admin = require("firebase-admin");
} catch (_) {
  throw new Error("Missing dependency: firebase-admin. Run npm install at the repo root.");
}
try {
  ({ GoogleGenAI } = require("@google/genai"));
} catch (_) {
  throw new Error("Missing dependency: @google/genai. Run npm install at the repo root.");
}

async function safePipeline(stream, destination) {
  try {
    await pipeline(stream, destination);
  } catch (error) {
    const errorText = String(error?.code || error?.message || "").trim();
    const isPrematureClose = /ERR_STREAM_PREMATURE_CLOSE|Premature close|aborted|ECONNRESET/i.test(errorText);
    if (destination.headersSent) {
      if (!isPrematureClose) {
        console.info("[backend] stream pipeline closed after headers sent:", error?.message);
      }
      if (!destination.writableEnded) {
        destination.end();
      }
      return;
    }
    if (isPrematureClose) {
      return;
    }
    throw error;
  }
}

function stripUndefinedDeep(value) {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)).filter((item) => item !== undefined);
  }
  if (!value || typeof value !== "object") {
    return value === undefined ? undefined : value;
  }
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    const clean = stripUndefinedDeep(item);
    if (clean !== undefined) {
      result[key] = clean;
    }
  }
  return result;
}

function resolveFfmpegBinaryPath() {
  let staticPath = "";
  try {
    staticPath = String(require("ffmpeg-static") || "").trim();
  } catch (_) {
    // noop
  }
  
  // Probe static path first
  if (staticPath && fs.existsSync(staticPath)) {
    try {
      const filters = execSync(`"${staticPath}" -filters`, { encoding: "utf8" });
      if (filters.includes("drawtext")) {
        console.log(`[backend] using ffmpeg-static (has drawtext): ${staticPath}`);
        return staticPath;
      }
      console.warn("[backend] ffmpeg-static is missing 'drawtext' filter. Searching for system fallback...");
    } catch (err) {
      console.warn("[backend] failed to probe ffmpeg-static:", err.message);
    }
  }

  // Fallback to system ffmpeg
  try {
    const systemPath = execSync("which ffmpeg", { encoding: "utf8" }).trim();
    if (systemPath) {
      const filters = execSync(`"${systemPath}" -filters`, { encoding: "utf8" });
      if (filters.includes("drawtext")) {
        console.log(`[backend] using system ffmpeg (has drawtext): ${systemPath}`);
        return systemPath;
      }
      console.warn(`[backend] system ffmpeg at ${systemPath} also missing 'drawtext' filter.`);
    }
  } catch (_) {
    // noop
  }

  console.error("[backend] CRITICAL: No ffmpeg binary found with 'drawtext' support!");
  return staticPath || "ffmpeg";
}

let ffmpegStaticPath = resolveFfmpegBinaryPath();

function isFfmpegAvailable() {
  return !!ffmpegStaticPath;
}

// Full Startup diagnostic
try {
  const versionInfo = execSync(`"${ffmpegStaticPath}" -version`, { encoding: "utf8" });
  console.log("[backend] selected ffmpeg version:", versionInfo.split("\n")[0]);
} catch (err) {
  console.error("[backend] final ffmpeg diagnostic error:", err.message);
}

function loadLocalEnvFile() {
  const envPath = path.resolve(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = String(line || "").trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key) continue;

    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadLocalEnvFile();

const app = express();
const PORT = Number(process.env.API_PORT || process.env.PORT || 8787);
const HOST = String(process.env.API_HOST || "0.0.0.0").trim() || "0.0.0.0";
const BACKEND_BOOT_ISO = new Date().toISOString();
const BACKEND_BOOT_SIGNATURE = `backend/server.js@${BACKEND_BOOT_ISO}`;
const GEMINI_API_KEY = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
// Montage exports can carry sizable JSON payloads when they include cached
// inline media or rendered text snapshots. Keep the global parser roomy enough
// for those requests, and fail cleanly when a payload still exceeds the limit.
const MAX_BODY = "48mb";
const MAX_PAYLOAD_BYTES = 120 * 1024;
const MAX_PODCASTER_SESSION_BYTES = 900 * 1024;
const MAX_SPEAKER_PORTRAIT_BYTES = 10 * 1024 * 1024;
const MAX_PODCASTER_MUSIC_BYTES = 12 * 1024 * 1024;
const MAX_DIALOGUE_VIDEO_BYTES = 80 * 1024 * 1024;
const MAX_DIALOGUE_AUDIO_BYTES = 24 * 1024 * 1024;
const MAX_ANALIZAR_PDF_UPLOAD_BYTES = 260 * 1024 * 1024;
const MAX_REFERENCE_FRAME_BYTES = 6 * 1024 * 1024;
const MAX_MONTAGE_EXPORT_SCENES = 40;
const MAX_MONTAGE_EXPORT_TOTAL_SEC = 10 * 60;
const DIALOGUE_VIDEO_JOB_TTL_MS = 30 * 60 * 1000;
const DEFAULT_PODCASTER_IMAGE_MODEL = "gemini-2.5-flash-image";
const DEFAULT_PODCASTER_VIDEO_MODEL = "veo-3.1-generate-preview";
const DEFAULT_MOODLE_GRAPHIC_MODEL = "gemini-2.5-flash-image";
const DEFAULT_GEMINI_IMAGE_SIZE = "2K";
const MOODLE_GRAPHIC_PROMPT_VERSION = "moodle_graphic_render_v1";
const PODCASTER_IMAGE_MODEL_CANDIDATES = Object.freeze([
  "gemini-3.1-flash-image-preview",
  "gemini-3-pro-image-preview",
  "gemini-2.5-flash-image",
  "gemini-2.0-flash-preview-image-generation"
]);
const PODCASTER_VIDEO_MODEL_CANDIDATES = Object.freeze([
  "veo-3.1-generate-preview",
  "veo-3.1-fast-generate-preview",
  "veo-3.1-lite-generate-preview",
  "veo-3.0-generate-001",
  "veo-3.0-fast-generate-001",
  "veo-2.0-generate-001"
]);
const GEMINI_LIVE_ALLOWED_VOICE_NAMES = new Set([
  "Zephyr", "Kore", "Orus", "Autonoe", "Umbriel", "Erinome",
  "Laomedeia", "Schedar", "Achird", "Sadachbia", "Puck", "Fenrir",
  "Aoede", "Enceladus", "Algieba", "Algenib", "Achernar", "Gacrux",
  "Zubenelgenubi", "Sadaltager", "Charon", "Leda", "Callirrhoe",
  "Iapetus", "Despina", "Rasalgethi", "Alnilam", "Pulcherrima",
  "Vindemiatrix", "Sulafat"
]);
const SCREENSHOT_MAX_BYTES = 6 * 1024 * 1024;
const SCREENSHOT_PERSONAL_LIMIT = 24;
const SCREENSHOT_SHARED_LIMIT = 48;
const ACTIVE_PLAYER_WINDOW_MS = 45 * 1000;
const FFMPEG_DRAWTEXT_FONT_CANDIDATES = Object.freeze([
  path.resolve(__dirname, "..", "public", "Radiora.ttf"),
  path.resolve(__dirname, "..", "public", "Balloon.ttf"),
  path.resolve(__dirname, "..", "public", "ASC-Cursive-2022.otf"),
  path.resolve(__dirname, "..", "public", "Ballooning.otf"),
  "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
  "/System/Library/Fonts/Supplemental/Arial.ttf",
  "/System/Library/Fonts/Helvetica.ttc",
  "/System/Library/Fonts/SFNS.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
  "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
  "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
  "/usr/share/fonts/truetype/freefont/FreeSans.ttf"
]);
const fetchCompat = (...args) => {
  if (typeof fetch === "function") return fetch(...args);
  return import("node-fetch").then(({ default: f }) => f(...args));
};

function applyVeoHdParameters(parameters = {}, aspectRatio = "16:9") {
  const next = parameters && typeof parameters === "object" ? { ...parameters } : {};
  next.aspectRatio = String(next.aspectRatio || aspectRatio).trim() || aspectRatio;
  next.resolution = "1080p";
  return next;
}

const dialogueVideoJobs = new Map();
const heavyWorkCoordinator = createHeavyWorkCoordinator();
const heavyWorkState = heavyWorkCoordinator.state;
const {
  tryAcquireHeavyWorkSlot,
  releaseHeavyWorkSlot,
  buildHeavyWorkBusyError
} = heavyWorkCoordinator;
let cleanupIntervalRunning = false;

function clamp01(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return Math.max(0, Math.min(1, Number(fallback) || 0));
  return Math.max(0, Math.min(1, num));
}

function clampPct01(value, fallback = 0.5) {
  return clamp01(value, fallback);
}

function isPrivateHostname(hostname = "") {
  const host = String(hostname || "").trim().toLowerCase();
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".local")) return true;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    if (host.startsWith("10.")) return true;
    if (host.startsWith("127.")) return true;
    if (host.startsWith("192.168.")) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  }
  return false;
}

function parseHexColor(value = "", fallback = "F8FAFC") {
  const raw = String(value || "").trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return raw.toUpperCase();
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return raw.split("").map((ch) => `${ch}${ch}`).join("").toUpperCase();
  }
  return fallback;
}

function toFfmpegColor(value = "", alpha = 1, fallback = "F8FAFC") {
  const hex = parseHexColor(value, fallback);
  const a = Math.max(0, Math.min(1, Number(alpha) || 0));
  return `0x${hex}@${a.toFixed(3)}`;
}

function escapeFfmpegDrawtextText(value = "") {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\r?\n/g, "\\n");
}

function escapeFfmpegExpr(value = "") {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function escapeFfmpegFilterPath(value = "") {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function buildFfmpegDuckVolumeExpr(segments = [], duckVolume = 0.46) {
  const list = Array.isArray(segments) ? segments : [];
  const windows = list
    .map((segment) => {
      const startSec = Math.max(0, Number(segment?.startMs || 0) / 1000);
      const durationSec = Math.max(0.05, Number(segment?.durationMs || 0) / 1000);
      const endSec = startSec + durationSec;
      return `between(t,${startSec.toFixed(3)},${endSec.toFixed(3)})`;
    })
    .filter(Boolean);
  if (!windows.length) return "1";
  const activeExpr = windows.join("+");
  const factor = Math.max(0, Math.min(1, Number(duckVolume) || 0.46)).toFixed(3);
  return `if(gt(${activeExpr},0),${factor},1)`;
}

function normalizeMontageBackgroundDuckVolume(input = null, fallback = 0.60) {
  if (input === null || input === undefined || input === "") {
    return Math.max(0, Math.min(1, Number(fallback) || 0.60));
  }
  const raw = Number(input);
  if (!Number.isFinite(raw)) {
    return Math.max(0, Math.min(1, Number(fallback) || 0.60));
  }
  const factor = raw > 1
    ? (raw >= 40 && raw <= 100 ? raw / 100 : Math.max(40, 100 - Math.max(0, Math.min(40, raw))) / 100)
    : raw;
  return Math.max(0, Math.min(1, Number(factor) || 0.60));
}

function parseHttpByteRange(rangeHeader = "", total = 0) {
  const raw = String(rangeHeader || "").trim();
  const totalBytes = Math.max(0, Number(total || 0) || 0);
  if (!raw || !totalBytes) return null;
  const match = raw.match(/^bytes=(\d*)-(\d*)$/i);
  if (!match) return null;
  const start = match[1] ? Math.max(0, Number(match[1] || 0)) : 0;
  const end = match[2] ? Math.min(totalBytes - 1, Number(match[2] || (totalBytes - 1))) : totalBytes - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= totalBytes) return null;
  return { start, end };
}

async function streamStorageFileToResponse(file, res, options = {}) {
  const targetFile = file && typeof file.createReadStream === "function" ? file : null;
  if (!targetFile) {
    const err = new Error("invalid_storage_file");
    err.code = "invalid_storage_file";
    throw err;
  }
  const metadata = options?.metadata && typeof options.metadata === "object" ? options.metadata : {};
  const mime = String(metadata?.contentType || "application/octet-stream").trim() || "application/octet-stream";
  const total = Math.max(0, Number(metadata?.size || 0) || 0);
  const range = parseHttpByteRange(options?.rangeHeader || "", total);
  res.setHeader("Content-Type", mime);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "private, max-age=120");
  if (range) {
    const length = Math.max(0, (range.end - range.start) + 1);
    res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${total}`);
    res.setHeader("Content-Length", String(length));
    const stream = targetFile.createReadStream({ start: range.start, end: range.end });
    await safePipeline(stream, res.status(206));
    return;
  }
  if (total > 0) {
    res.setHeader("Content-Length", String(total));
  }
  const stream = targetFile.createReadStream();
  await safePipeline(stream, res.status(200));
}

function applyAssetCorsHeaders(req, res) {
  const origin = String(req.headers?.origin || "").trim();
  res.setHeader("Access-Control-Allow-Origin", origin || "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges, ETag");
}

function resolveFfmpegDrawtextFontFile() {
  return FFMPEG_DRAWTEXT_FONT_CANDIDATES.find((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch (_) {
      return false;
    }
  }) || "";
}

function resolveMontageOnScreenTextFontFile(settings = {}) {
  const current = settings && typeof settings === "object" ? settings : {};
  const family = String(current.fontFamily || "").trim();
  const weight = String(current.fontWeight || "").trim().toLowerCase();
  const style = String(current.fontStyle || "").trim().toLowerCase();
  const fontMap = {
    AvantGardeLocal: {
      regular: path.resolve(__dirname, "..", "public", "lecturasGame-mineblox", "runtime", "avantgarde", "AVGARDN_2.TTF"),
      bold: path.resolve(__dirname, "..", "public", "lecturasGame-mineblox", "runtime", "avantgarde", "AVGARDD_2.TTF"),
      italic: path.resolve(__dirname, "..", "public", "lecturasGame-mineblox", "runtime", "avantgarde", "AVGARDN_2.TTF"),
      "bold-italic": path.resolve(__dirname, "..", "public", "lecturasGame-mineblox", "runtime", "avantgarde", "AVGARDDO_2.TTF")
    },
    Balloon: {
      regular: path.resolve(__dirname, "..", "public", "Balloon.ttf"),
      bold: path.resolve(__dirname, "..", "public", "Balloon.ttf"),
      italic: path.resolve(__dirname, "..", "public", "Balloon.ttf"),
      "bold-italic": path.resolve(__dirname, "..", "public", "Balloon.ttf")
    },
    Ballooning: {
      regular: path.resolve(__dirname, "..", "public", "Ballooning.otf"),
      bold: path.resolve(__dirname, "..", "public", "Ballooning.otf"),
      italic: path.resolve(__dirname, "..", "public", "Ballooning.otf"),
      "bold-italic": path.resolve(__dirname, "..", "public", "Ballooning.otf")
    },
    Radiora: {
      regular: path.resolve(__dirname, "..", "public", "Radiora.ttf"),
      bold: path.resolve(__dirname, "..", "public", "Radiora.ttf"),
      italic: path.resolve(__dirname, "..", "public", "Radiora.ttf"),
      "bold-italic": path.resolve(__dirname, "..", "public", "Radiora.ttf")
    },
    "ASC-Cursive-2022": {
      regular: path.resolve(__dirname, "..", "public", "ASC-Cursive-2022.otf"),
      bold: path.resolve(__dirname, "..", "public", "ASC-Cursive-2022.otf"),
      italic: path.resolve(__dirname, "..", "public", "ASC-Cursive-2022.otf"),
      "bold-italic": path.resolve(__dirname, "..", "public", "ASC-Cursive-2022.otf")
    }
  };
  const familyEntry = fontMap[family] || null;
  const styleKey = weight === "bold" && style === "italic"
    ? "bold-italic"
    : weight === "bold"
      ? "bold"
      : style === "italic"
        ? "italic"
        : "regular";
  const resolved = familyEntry
    ? familyEntry[styleKey] || familyEntry.regular
    : "";
  if (resolved && fs.existsSync(resolved)) return resolved;
  return resolveFfmpegDrawtextFontFile();
}

function roundEven(value = 0, fallback = 2) {
  const base = Number.isFinite(Number(value)) ? Math.round(Number(value)) : Math.round(Number(fallback) || 2);
  const safe = Math.max(2, base);
  return safe % 2 === 0 ? safe : safe - 1;
}

function formatTimelineClockMs(ms = 0) {
  const totalMs = Math.max(0, Math.round(Number(ms || 0) || 0));
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function formatMontageReviewTimelineRange(startMs = 0, endMs = 0, durationMs = 0) {
  const start = Math.max(0, Math.round(Number(startMs || 0) || 0));
  const end = Math.max(start, Math.round(Number(endMs || 0) || start));
  const duration = Math.max(0, Math.round(Number(durationMs || 0) || (end - start)));
  const seconds = Math.round((duration / 1000) * 10) / 10;
  return `${formatTimelineClockMs(start)} - ${formatTimelineClockMs(end)} · ${seconds.toFixed(1)} s`;
}

function buildFfmpegTimecodeExpr(secondsExpr = "t") {
  const expr = String(secondsExpr || "t").trim() || "t";
  return [
    `%{eif\\:trunc((${expr})/3600)\\:d\\:2}`,
    `%{eif\\:trunc(mod((${expr})/60\\,60))\\:d\\:2}`,
    `%{eif\\:trunc(mod(${expr}\\,60))\\:d\\:2}`,
    `%{eif\\:trunc(mod((${expr})*1000\\,1000))\\:d\\:3}`
  ].join("\\:");
}

function escapeFfmpegStaticTextFragment(value = "") {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function wrapMontageReviewText(value = "", options = {}) {
  const fallback = String(options?.fallback || "Sin definir").trim() || "Sin definir";
  const maxChars = Math.max(10, Math.round(Number(options?.maxChars || 36) || 36));
  const maxLines = Math.max(1, Math.round(Number(options?.maxLines || 3) || 3));
  const rawLines = String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim());
  const sourceLines = rawLines.some(Boolean) ? rawLines : [fallback];
  const lines = [];
  let truncated = false;

  const pushLine = (line) => {
    if (!line) return;
    if (lines.length < maxLines) {
      lines.push(line);
    } else {
      truncated = true;
    }
  };

  const wrapSingleLine = (input = "") => {
    const words = String(input || "").split(" ").filter(Boolean);
    let current = "";
    for (const word of words) {
      const chunks = [];
      if (word.length <= maxChars) {
        chunks.push(word);
      } else {
        for (let cursor = 0; cursor < word.length; cursor += maxChars) {
          chunks.push(word.slice(cursor, cursor + maxChars));
        }
      }
      for (const chunk of chunks) {
        const next = current ? `${current} ${chunk}` : chunk;
        if (next.length <= maxChars) {
          current = next;
        } else {
          pushLine(current);
          current = chunk;
        }
        if (lines.length >= maxLines) {
          truncated = true;
          return;
        }
      }
    }
    if (!truncated && current) pushLine(current);
  };

  for (const sourceLine of sourceLines) {
    wrapSingleLine(sourceLine || fallback);
    if (truncated || lines.length >= maxLines) {
      truncated = truncated || sourceLines.indexOf(sourceLine) < sourceLines.length - 1;
      break;
    }
  }
  const safeLines = lines.length ? lines.slice(0, maxLines) : [fallback];
  if (truncated) {
    const last = safeLines[safeLines.length - 1] || "";
    safeLines[safeLines.length - 1] = `${last.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
  }
  return safeLines.join("\n");
}

function countWrappedLines(value = "") {
  const lines = String(value || "").split(/\r?\n/).filter((line) => line.length || line === "");
  return Math.max(1, lines.length);
}

function extractVideoDimensionsFromFfmpegStderr(output = "") {
  const lines = String(output || "").split(/\r?\n/);
  for (const line of lines) {
    if (!/Video:/i.test(line)) continue;
    const match = line.match(/(\d{2,5})x(\d{2,5})/);
    if (!match) continue;
    const width = roundEven(match[1], 1280);
    const height = roundEven(match[2], 720);
    if (width > 0 && height > 0) {
      return { width, height };
    }
  }
  return { width: 0, height: 0 };
}

async function probeMediaVideoDimensionsWithFfmpeg(inputPath = "", label = "probe") {
  const probeResult = await runFfmpegCommand([
    "-hide_banner",
    "-i",
    String(inputPath || "").trim(),
    "-f",
    "null",
    "-"
  ], {
    stage: `${label}_probe_dimensions`,
    timeoutMs: MONTAGE_EXPORT_SCENE_PROBE_TIMEOUT_MS,
    timeoutCode: "scene_probe_timeout"
  });
  return extractVideoDimensionsFromFfmpegStderr(probeResult.stderr || "");
}

async function probeSceneMediaMetadataWithFfmpeg(inputPath = "", options = {}) {
  const source = String(inputPath || "").trim();
  const label = String(options?.label || "probe_scene").trim() || "probe_scene";
  const hasAudio = options?.hasAudio === true;
  const probeResult = await runFfmpegCommand([
    "-hide_banner",
    "-i",
    source,
    "-f",
    "null",
    "-"
  ], {
    stage: `${label}_probe_metadata`,
    timeoutMs: MONTAGE_EXPORT_SCENE_PROBE_TIMEOUT_MS,
    timeoutCode: "scene_probe_timeout"
  });
  const stderr = probeResult.stderr || "";
  return {
    dimensions: extractVideoDimensionsFromFfmpegStderr(stderr),
    hasAudio: hasAudio ? /Stream #.*: Audio:/i.test(stderr) : false
  };
}

async function probeImageDimensionsWithFfmpeg(inputPath = "", label = "probe_image") {
  return probeMediaVideoDimensionsWithFfmpeg(inputPath, label);
}

function resolveMontageReviewCanvasSize(resolution = "source", sourceWidth = 0, sourceHeight = 0) {
  const preset = String(resolution || "source").trim();
  if (preset === "1080p") return { width: 1920, height: 1080 };
  if (preset === "720p") return { width: 1280, height: 720 };
  if (preset === "480p") return { width: 854, height: 480 };
  const largestSide = Math.max(Number(sourceWidth || 0), Number(sourceHeight || 0));
  if (largestSide >= 1800) return { width: 1920, height: 1080 };
  if (largestSide >= 1100) return { width: 1280, height: 720 };
  if (largestSide >= 760) return { width: 854, height: 480 };
  return { width: 640, height: 360 };
}

function buildMontageReviewVideoFilter(entries = [], options = {}) {
  const list = Array.isArray(entries) ? entries.filter(Boolean) : [];
  const width = roundEven(options?.width || 1280, 1280);
  const height = roundEven(options?.height || 720, 720);
  const isCompactReview = height <= 500 || width <= 900;
  const isLargeReview = height >= 1000 || width >= 1800;
  const leftPaneRatio = isCompactReview ? 0.525 : (isLargeReview ? 0.56 : 0.55);
  const leftPaneW = roundEven(width * leftPaneRatio, width / 2);
  const panelX = leftPaneW;
  const panelW = Math.max(120, width - panelX);
  const panelInsetLeft = Math.max(10, Math.round(width * (isCompactReview ? 0.010 : 0.014)));
  const panelInsetRight = Math.max(10, Math.round(width * (isCompactReview ? 0.009 : 0.012)));
  const panelInnerX = panelX + panelInsetLeft;
  const panelInnerW = Math.max(80, panelW - panelInsetLeft - panelInsetRight);
  const panelInnerRight = panelX + panelW - panelInsetRight;
  const panelTop = Math.max(18, Math.round(height * (isCompactReview ? 0.048 : 0.055)));
  const panelBottom = Math.max(18, Math.round(height * (isCompactReview ? 0.048 : 0.055)));
  const headerFont = Math.max(
    isCompactReview ? 18 : 24,
    Math.min(
      Math.round(height * (isCompactReview ? 0.033 : 0.040)),
      Math.round(panelInnerW * (isCompactReview ? 0.108 : 0.095))
    )
  );
  const labelFont = Math.max(
    isCompactReview ? 11 : 13,
    Math.min(
      Math.round(height * (isCompactReview ? 0.0155 : 0.020)),
      Math.round(panelInnerW * 0.038)
    )
  );
  const bodyFont = Math.max(
    isCompactReview ? 13 : 16,
    Math.min(
      Math.round(height * (isCompactReview ? 0.0225 : 0.0265)),
      Math.round(panelInnerW * (isCompactReview ? 0.060 : 0.054))
    )
  );
  const timeFont = Math.max(bodyFont, Math.round(bodyFont * (isCompactReview ? 1.0 : 1.04)));
  const lineSpacing = Math.max(isCompactReview ? 2 : 4, Math.round(bodyFont * (isCompactReview ? 0.22 : 0.3)));
  const labelGap = Math.max(isCompactReview ? 3 : 5, Math.round(height * (isCompactReview ? 0.0055 : 0.008)));
  const sectionGap = Math.max(isCompactReview ? 8 : 12, Math.round(height * (isCompactReview ? 0.017 : 0.024)));
  const bodyLineHeight = Math.max(bodyFont + lineSpacing, Math.round(bodyFont * (isCompactReview ? 1.24 : 1.34)));
  const timeLineHeight = Math.max(timeFont + Math.round(lineSpacing * 0.7), Math.round(timeFont * (isCompactReview ? 1.18 : 1.28)));
  const bodyChars = Math.max(18, Math.floor(panelInnerW / Math.max(11, bodyFont * (isCompactReview ? 0.82 : 0.92))));
  const shortChars = Math.max(16, Math.floor(panelInnerW / Math.max(12, bodyFont * (isCompactReview ? 0.88 : 0.98))));
  const counterFont = Math.max(isCompactReview ? 12 : 16, Math.round(height * (isCompactReview ? 0.020 : 0.023)));
  const counterX = Math.max(16, Math.round(width * 0.022));
  const counterY = Math.max(isCompactReview ? 10 : 14, Math.round(height * (isCompactReview ? 0.024 : 0.030)));
  const totalDurationMs = Math.max(
    0,
    Math.round(Number(options?.montageTotalDurationMs || 0) || 0),
    ...list.map((entry) => Math.max(0, Math.round(Number(entry?.reviewEndMs || 0) || 0)))
  );
  const staticCounterMs = Math.max(0, Math.min(
    totalDurationMs,
    Math.round(Number(options?.globalCounterCurrentMs ?? 0) || 0)
  ));
  const dividerX = Math.max(0, panelX - 1);
  const enableFor = (startMs, endMs) => escapeFfmpegExpr(`between(t,${(Math.max(0, startMs) / 1000).toFixed(3)},${(Math.max(startMs, endMs) / 1000).toFixed(3)})`);
  const drawtext = (text, x, y, fontSize, color, enableExpr, options2 = {}) => {
    const shadowX = Math.max(-24, Math.min(24, Math.round(Number(options2?.shadowX ?? 1) || 1)));
    const shadowY = Math.max(-24, Math.min(24, Math.round(Number(options2?.shadowY ?? 1) || 1)));
    const borderW = Math.max(0, Math.min(6, Math.round(Number(options2?.borderW ?? 1) || 1)));
    const localLineSpacing = Math.max(0, Math.round(Number(options2?.lineSpacing ?? lineSpacing) || lineSpacing));
    const rawText = options2?.rawText === true;
    const textFilePath = typeof options?.textFileResolver === "function"
      ? (!rawText ? options.textFileResolver(String(text || "")) : "")
      : "";
    const textSource = textFilePath
      ? `textfile='${escapeFfmpegFilterPath(textFilePath)}':reload=0`
      : `text='${rawText ? String(text || "") : escapeFfmpegDrawtextText(text)}'`;
    const boxEnabled = options2?.boxEnabled === true;
    const boxColor = String(options2?.boxColor || "0x020617@0.480").trim();
    const boxBorderW = Math.max(0, Math.round(Number(options2?.boxBorderW ?? 0) || 0));
    const fontFile = resolveFfmpegDrawtextFontFile();
    const fontSource = fontFile
      ? `:fontfile='${escapeFfmpegFilterPath(fontFile)}'`
      : ":font='Sans'"; // Fallback for Linux if physical file not found
    if (fontFile) console.log(`[backend] drawtext using fontfile: ${fontFile}`);
    else console.warn("[backend] drawtext using fallback font hint: Sans");
    const enableSegment = enableExpr ? `:enable='${enableExpr}'` : "";
    return `drawtext=${textSource}${fontSource}:fontsize=${fontSize}:fontcolor=${color}:x=${Math.round(x)}:y=${Math.round(y)}:fix_bounds=1:line_spacing=${localLineSpacing}:shadowx=${shadowX}:shadowy=${shadowY}:shadowcolor=0x020617@0.420:borderw=${borderW}:bordercolor=0x020617@0.180:${boxEnabled ? "box=1" : "box=0"}:boxcolor=${boxColor}:boxborderw=${boxBorderW}${enableSegment}`;
  };

  const filterSteps = [
    `scale=w=${leftPaneW}:h=${height}:force_original_aspect_ratio=decrease`,
    "setsar=1",
    `pad=${width}:${height}:((${leftPaneW}-iw)/2):((oh-ih)/2):color=0x05070B`
  ];

  const drawFilters = [
    `drawbox=x=${panelX}:y=0:w=${panelW}:h=${height}:color=0x0F172A@0.960:t=fill`,
    `drawbox=x=${dividerX}:y=0:w=2:h=${height}:color=0xE2E8F0@0.140:t=fill`,
    `drawbox=x=${panelInnerX}:y=${Math.round(panelTop + headerFont + (isCompactReview ? 8 : 12))}:w=${Math.max(40, panelInnerW)}:h=2:color=0x38BDF8@0.800:t=fill`
  ];

  const globalCounterText = options?.globalCounterMode === "static"
    ? `${escapeFfmpegStaticTextFragment(formatTimelineClockMs(staticCounterMs))} / ${escapeFfmpegStaticTextFragment(formatTimelineClockMs(totalDurationMs))}`
    : `${buildFfmpegTimecodeExpr("t")} / ${escapeFfmpegStaticTextFragment(formatTimelineClockMs(totalDurationMs))}`;
  drawFilters.push(
    drawtext(globalCounterText, counterX, counterY, counterFont, "0xF8FAFC@0.980", "", {
      rawText: true,
      lineSpacing: 2,
      shadowX: 0,
      shadowY: 1,
      borderW: 0,
      boxEnabled: true,
      boxColor: "0x020617@0.520",
      boxBorderW: Math.max(8, Math.round(counterFont * 0.52))
    })
  );

  list.forEach((entry) => {
    const startMs = Math.max(0, Math.round(Number(entry?.reviewStartMs || 0) || 0));
    const endMs = Math.max(startMs + 50, Math.round(Number(entry?.reviewEndMs || 0) || 0));
    const enableExpr = enableFor(startMs, endMs);
    const timelineLabel = wrapMontageReviewText(String(entry?.timelineLabel || ""), {
      fallback: "Sin definir",
      maxChars: shortChars,
      maxLines: 2
    });
    const scriptText = wrapMontageReviewText(String(entry?.voiceOverText || ""), {
      fallback: "Sin texto",
      maxChars: bodyChars,
      maxLines: 5
    });
    const sceneText = wrapMontageReviewText(String(entry?.sceneDescription || ""), {
      fallback: "Sin definir",
      maxChars: bodyChars,
      maxLines: 4
    });
    const onScreenText = wrapMontageReviewText(String(entry?.onScreenText || ""), {
      fallback: "Sin texto",
      maxChars: bodyChars,
      maxLines: 3
    });
    const visualText = wrapMontageReviewText(String(entry?.visualNotes || ""), {
      fallback: "Sin definir",
      maxChars: Math.max(24, bodyChars + (isCompactReview ? 6 : 12)),
      maxLines: 5
    });
    const sections = [
      { label: "TIEMPO", value: timelineLabel, fontSize: timeFont, color: "0xE2E8F0@0.960", lineHeight: timeLineHeight },
      { label: "GUIÓN", value: scriptText, fontSize: bodyFont, color: "0xF8FAFC@0.980", lineHeight: bodyLineHeight },
      { label: "DESCRIPCIÓN DE ESCENA", value: sceneText, fontSize: bodyFont, color: "0xE2E8F0@0.960", lineHeight: bodyLineHeight },
      { label: "TEXTO EN PANTALLA", value: onScreenText, fontSize: bodyFont, color: "0xF8FAFC@0.980", lineHeight: bodyLineHeight },
      { label: "ELEMENTO VISUAL", value: visualText, fontSize: bodyFont, color: "0xE2E8F0@0.960", lineHeight: bodyLineHeight }
    ];
    let yCursor = panelTop;
    drawFilters.push(
      drawtext(`Escena ${Math.max(1, Number(entry?.sceneIndex || 1) || 1)}`, panelInnerX, yCursor, headerFont, "0xF8FAFC@1.000", enableExpr, { lineSpacing: Math.max(2, Math.round(lineSpacing * 0.6)), shadowX: 0, shadowY: 1, borderW: 1 })
    );
    yCursor += headerFont + Math.max(isCompactReview ? 10 : 18, Math.round(height * (isCompactReview ? 0.026 : 0.040)));
    sections.forEach((section, index) => {
      if (yCursor > (height - panelBottom - section.lineHeight)) return;
      drawFilters.push(
        drawtext(section.label, panelInnerX, yCursor, labelFont, "0x7DD3FC@0.950", enableExpr, { lineSpacing: 2, shadowX: 0, shadowY: 0, borderW: 0 })
      );
      yCursor += labelFont + labelGap;
      drawFilters.push(
        drawtext(section.value, panelInnerX, yCursor, section.fontSize, section.color, enableExpr, { lineSpacing, shadowX: 0, shadowY: 1, borderW: 0 })
      );
      yCursor += (countWrappedLines(section.value) * section.lineHeight);
      if (index < sections.length - 1) {
        yCursor += sectionGap;
      }
    });
    drawFilters.push(
      `drawbox=x=${panelInnerX}:y=${Math.round(panelTop + headerFont + (isCompactReview ? 8 : 12))}:w=${Math.max(40, panelInnerRight - panelInnerX)}:h=2:color=0x38BDF8@0.800:t=fill:enable='${enableExpr}'`
    );
  });

  return [...filterSteps, ...drawFilters].join(",");
}

function parseAllowedOrigins() {
  const defaults = [
    "http://127.0.0.1:*",
    "http://localhost:*",
    "https://127.0.0.1:*",
    "https://localhost:*",
    "http://127.0.0.1:5000",
    "http://localhost:5000",
    "http://127.0.0.1:5010",
    "http://localhost:5010",
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "http://127.0.0.1:5010",
    "http://localhost:5010",
    "https://charly-brown.web.app",
    "https://charly-brown.firebaseapp.com",
    "https://charly-brown-gemini-backend.onrender.com",
    "https://*.onrender.com"
  ];
  const raw = String(
    process.env.CORS_ALLOWED_ORIGINS
    || process.env.ALLOWED_ORIGINS
    || ""
  ).trim();
  const configured = raw
    ? raw.split(",")
    : [];
  return Array.from(new Set([
    ...defaults,
    ...configured
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean)));
}

const ALLOWED_ORIGINS = parseAllowedOrigins();

function matchesAllowedOrigin(origin = "", rule = "") {
  const candidate = String(origin || "").trim();
  const allowed = String(rule || "").trim();
  if (!candidate || !allowed) return false;
  if (allowed === "*") return true;
  if (allowed === candidate) return true;
  if (!allowed.includes("*")) return false;

  const escaped = allowed
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  const pattern = new RegExp(`^${escaped}$`, "i");
  return pattern.test(candidate);
}

const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }
    if (!ALLOWED_ORIGINS.length || ALLOWED_ORIGINS.some((rule) => matchesAllowedOrigin(origin, rule))) {
      callback(null, true);
      return;
    }
    callback(new Error("CORS_NOT_ALLOWED"));
  },
  credentials: false,
  allowedHeaders: [
    "Range",
    "Content-Type",
    "Authorization",
    "Accept",
    "X-Requested-With",
    "Cache-Control",
    "Pragma",
    "Expires"
  ],
  exposedHeaders: ["Content-Range", "Content-Length", "Accept-Ranges", "ETag"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  preflightContinue: false,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.use(express.json({ limit: MAX_BODY }));

app.get("/api/health", (_req, res) => {
  return res.status(200).json({
    ok: true,
    service: "gemini-backend",
    port: PORT,
    geminiConfigured: hasGeminiKey(),
    moodleShareUsersRoute: true,
    moodleModuleGraphicsRoute: true,
    podcasterDialogueAudioRoute: true,
    podcasterMusicGenerateRoute: true,
    startupSignature: BACKEND_BOOT_SIGNATURE,
  });
});

if (!admin.apps.length) {
  const serviceAccountPath = path.resolve(__dirname, "..", "charly-brown-firebase-adminsdk-fbsvc-6c32e4f96b.json");
  let credential = admin.credential.applicationDefault();
  let projectId = process.env.FIREBASE_PROJECT_ID || process.env.PROJECT_ID || "charly-brown";
  const serviceAccountJsonRaw = String(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    || process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    || ""
  ).trim();

  if (serviceAccountJsonRaw) {
    try {
      const parsed = JSON.parse(serviceAccountJsonRaw);
      credential = admin.credential.cert(parsed);
      projectId = parsed.project_id || projectId;
      console.log("[backend] using service account from env JSON");
    } catch (error) {
      console.error("[backend] invalid FIREBASE_SERVICE_ACCOUNT_JSON:", error?.message || error);
      process.exit(1);
    }
  }

  if (!serviceAccountJsonRaw && fs.existsSync(serviceAccountPath)) {
    console.log("[backend] using local service account:", serviceAccountPath);
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
    credential = admin.credential.cert(serviceAccount);
    projectId = serviceAccount.project_id || projectId;
  }

  const storageBucket = String(
    process.env.FIREBASE_STORAGE_BUCKET
    || process.env.STORAGE_BUCKET
    // Firebase/Cloud Storage default bucket is typically <projectId>.appspot.com.
    // Using <projectId>.firebasestorage.app here can break Admin SDK downloads
    // ("The specified bucket does not exist") on many projects.
    || (projectId === "charly-brown" ? "charly-brown.firebasestorage.app" : `${projectId}.appspot.com`)
  ).trim();

  admin.initializeApp({
    credential,
    storageBucket,
    projectId
  });
}
const db = admin.firestore();
const storageBucket = admin.storage().bucket();
const EXPLICIT_STORAGE_BUCKET_NAME = String(
  process.env.FIREBASE_STORAGE_BUCKET
  || process.env.STORAGE_BUCKET
  || ""
).trim();
const PRIMARY_STORAGE_BUCKET_NAME = String(admin.app()?.options?.storageBucket || "").trim();
const PRIMARY_PROJECT_ID = String(
  admin.app()?.options?.projectId
  || process.env.FIREBASE_PROJECT_ID
  || process.env.PROJECT_ID
  || ""
).trim();
const STORAGE_BUCKET_CANDIDATE_NAMES = Array.from(new Set([
  EXPLICIT_STORAGE_BUCKET_NAME,
  PRIMARY_STORAGE_BUCKET_NAME,
  // Some projects may use the newer *.firebasestorage.app bucket naming.
  // Prioritize it over *.appspot.com to avoid long misses in export downloads.
  PRIMARY_PROJECT_ID ? `${PRIMARY_PROJECT_ID}.firebasestorage.app` : "",
  PRIMARY_PROJECT_ID ? `${PRIMARY_PROJECT_ID}.appspot.com` : "",
  storageBucket?.name || ""
].map((item) => String(item || "").trim()).filter(Boolean)));
const STORAGE_BUCKET_CANDIDATES = STORAGE_BUCKET_CANDIDATE_NAMES
  .map((name) => (
    name === String(storageBucket?.name || "").trim()
      ? storageBucket
      : admin.storage().bucket(name)
  ));
const montageExportJobStore = createMontageExportJobStore({ db });

// Initialize BullMQ queue if Redis is configured
let montageExportQueue = null;
try {
  const { resolveRedisConnectionUrl, createBullMqQueue, createMontageExportQueue } = require("./montage-export/queue-bullmq.js");
  if (resolveRedisConnectionUrl()) {
    const queue = createBullMqQueue();
    montageExportQueue = createMontageExportQueue({ queue });
    console.info("[backend] BullMQ montage export queue initialized successfully using Redis connection string.");
  } else {
    console.info("[backend] RENDER_KEY_VALUE_CONNECTION_STRING not set. Using direct in-memory setImmediate fallback for export jobs.");
  }
} catch (err) {
  console.warn("[backend] Failed to initialize BullMQ queue, falling back to direct in-memory execution:", err.message || err);
}
const analizarPdfJobStore = createAnalizarPdfJobStore();
const analizarPdfGeneratedFileStore = new Map();
const ANALIZAR_PDF_COLLECTION = "analizarPDF";
const ANALIZAR_PDF_STYLE_MAPPINGS_COLLECTION = "analizarPDFStyleMappings";

function getStorageBucketCandidates() {
  return STORAGE_BUCKET_CANDIDATES.filter(Boolean);
}

let resolvedWritableStorageBucket = null;
let resolvedWritableStorageBucketPromise = null;

async function withRetry(fn, retries = 3, delayMs = 200) {
  let lastErr = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message || "").toLowerCase();
      const code = String(err?.code || "").toLowerCase();
      const isTransient = /premature close|econnreset|etimedout|epipe|enotfound|eaddrinfo|socket hang up|fetch/i.test(msg) || 
                          /econnreset|etimedout|epipe|enotfound|eaddrinfo/i.test(code);
      if (!isTransient || attempt === retries) {
        throw err;
      }
      console.warn(`[backend][storage-retry] transient error on attempt ${attempt}: ${err.message}. Retrying in ${delayMs}ms...`);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      delayMs = delayMs * 2;
    }
  }
  throw lastErr;
}

function isMissingBucketError(error) {
  const message = String(error?.message || "").toLowerCase();
  const status = Number(error?.code || error?.statusCode || error?.status || 0) || 0;
  return status === 404 || status === 403 || message.includes("bucket does not exist") || message.includes("specified bucket does not exist") || message.includes("permission") || message.includes("forbidden");
}

async function resolveWritableStorageBucket() {
  if (resolvedWritableStorageBucket) return resolvedWritableStorageBucket;
  if (resolvedWritableStorageBucketPromise) return resolvedWritableStorageBucketPromise;
  resolvedWritableStorageBucketPromise = (async () => {
    const buckets = getStorageBucketCandidates();
    for (const bucket of buckets) {
      if (!bucket) continue;
      resolvedWritableStorageBucket = bucket;
      console.info("[backend][storage] selected writable bucket candidate", {
        bucket: String(bucket.name || "").trim()
      });
      return bucket;
    }
    resolvedWritableStorageBucket = storageBucket;
    return storageBucket;
  })();
  try {
    return await resolvedWritableStorageBucketPromise;
  } finally {
    resolvedWritableStorageBucketPromise = null;
  }
}

async function downloadStorageObjectToBuffer(storagePath = "") {
  const cleanStoragePath = normalizeStorageFilePath(storagePath);
  if (!cleanStoragePath) {
    const err = new Error("missing_storage_path");
    err.code = "missing_storage_path";
    throw err;
  }
  const buckets = getStorageBucketCandidates();
  let lastError = null;
  for (const bucket of buckets) {
    if (!bucket) continue;
    try {
      const file = bucket.file(cleanStoragePath);
      let buffer = null;
      let metadata = {};

      try {
        const [signedUrl] = await file.getSignedUrl({
          version: "v4",
          action: "read",
          expires: Date.now() + 5 * 60 * 1000
        });
        const headRes = await fetchCompat(signedUrl, { method: "HEAD" });
        if (headRes.ok) {
          metadata.contentType = headRes.headers.get("content-type");
          metadata.size = Number(headRes.headers.get("content-length"));
        }
        const getRes = await fetchCompat(signedUrl, { method: "GET" });
        if (getRes.ok) {
          buffer = Buffer.from(await getRes.arrayBuffer());
        } else {
          throw new Error(`Signed URL fetch failed: ${getRes.status} ${getRes.statusText}`);
        }
      } catch (signErr) {
        // eslint-disable-next-line no-await-in-loop
        const [downloaded] = await withRetry(() => file.download());
        buffer = Buffer.from(downloaded);
        // eslint-disable-next-line no-await-in-loop
        const [meta] = await withRetry(() => file.getMetadata()).catch(() => [{}]);
        metadata = meta;
      }

      return {
        buffer,
        metadata,
        bucket
      };
    } catch (error) {
      lastError = error;
      if (!isMissingBucketError(error)) {
        throw error;
      }
    }
  }
  const err = new Error("storage_not_found");
  err.code = "storage_not_found";
  err.status = 404;
  err.detail = {
    storagePath: cleanStoragePath,
    bucketsTried: buckets.map((bucket) => String(bucket?.name || "").trim()).filter(Boolean),
    lastError: lastError ? String(lastError?.message || lastError) : ""
  };
  throw err;
}

function parseStorageObjectSize(metadata = null) {
  const rawSize = Number(metadata?.size || metadata?.metadata?.size || 0);
  return Number.isFinite(rawSize) && rawSize > 0 ? rawSize : 0;
}

async function openStorageObjectReadStream(storagePath = "", options = {}) {
  const cleanStoragePath = normalizeStorageFilePath(storagePath);
  const range = options?.range && typeof options.range === "object" ? options.range : null;
  if (!cleanStoragePath) {
    const err = new Error("missing_storage_path");
    err.code = "missing_storage_path";
    throw err;
  }
  const buckets = getStorageBucketCandidates();
  let lastError = null;
  for (const bucket of buckets) {
    if (!bucket) continue;
    const file = bucket.file(cleanStoragePath);
    try {
      // eslint-disable-next-line no-await-in-loop
      const [metadata] = await file.getMetadata();
      if (options?.metadataOnly) {
        return {
          bucket,
          file,
          metadata,
          totalBytes: parseStorageObjectSize(metadata),
          stream: null
        };
      }
      const stream = file.createReadStream(range ? {
        start: Number(range.start || 0),
        end: Number(range.end || 0)
      } : undefined);
      return {
        bucket,
        file,
        metadata,
        totalBytes: parseStorageObjectSize(metadata),
        stream
      };
    } catch (error) {
      lastError = error;
      if (!isMissingBucketError(error)) {
        throw error;
      }
    }
  }
  const err = new Error("storage_not_found");
  err.code = "storage_not_found";
  err.status = 404;
  err.detail = {
    storagePath: cleanStoragePath,
    bucketsTried: buckets.map((bucket) => String(bucket?.name || "").trim()).filter(Boolean),
    lastError: lastError ? String(lastError?.message || lastError) : ""
  };
  throw err;
}

async function streamStorageObjectToResponse(req, res, storagePath = "", rangeHeader = "", options = {}) {
  const cleanStoragePath = normalizeStorageFilePath(storagePath);
  if (!cleanStoragePath) {
    return {
      streamed: false,
      status: 400,
      code: "missing_storage_path",
      detail: { storagePath: "" }
    };
  }
  const candidateBuckets = Array.from(new Set([
    ...(Array.isArray(options?.bucketNames) ? options.bucketNames : []),
    ...(options?.bucketFromUrl ? [String(options.bucketFromUrl || "").trim()] : []),
    ...getStorageBucketCandidates().map((bucket) => String(bucket?.name || "").trim())
  ].filter(Boolean)))
    .map((name) => {
      try {
        return admin.storage().bucket(name);
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean);

  let lastError = null;
  let lastAuthError = null;
  let lastMissingError = null;

  for (const bucket of candidateBuckets) {
    if (!bucket) continue;
    const file = bucket.file(cleanStoragePath);
    try {
      let exists = null;
      let meta = {};
      let signedUrl = "";

      // Try offline signing first
      try {
        const [url] = await file.getSignedUrl({
          version: "v4",
          action: "read",
          expires: Date.now() + 5 * 60 * 1000
        });
        const headRes = await fetchCompat(url, { method: "HEAD" });
        if (headRes.ok) {
          exists = true;
          meta.contentType = headRes.headers.get("content-type");
          meta.size = Number(headRes.headers.get("content-length"));
          signedUrl = url;
        } else if (headRes.status === 404) {
          exists = false;
        } else {
          throw new Error(`HEAD request failed: ${headRes.status}`);
        }
      } catch (signErr) {
        // eslint-disable-next-line no-await-in-loop
        const [ex] = await withRetry(() => file.exists()).catch(() => [null]);
        exists = ex;
        if (exists !== false) {
          // eslint-disable-next-line no-await-in-loop
          const [metadata] = await withRetry(() => file.getMetadata());
          meta = metadata;
        }
      }

      if (exists === false) {
        lastMissingError = new Error("storage_not_found");
        continue;
      }

      const payload = buildStreamingMediaPayload(parseStorageObjectSize(meta), {
        mimeType: String(meta?.contentType || "application/octet-stream").trim() || "application/octet-stream",
        rangeHeader
      });

      Object.entries(payload.headers || {}).forEach(([name, value]) => {
        if (!name || value == null || value === "") return;
        res.setHeader(name, value);
      });

      let stream = null;
      if (signedUrl) {
        const headers = {};
        if (payload.range) {
          headers.Range = `bytes=${payload.range.start}-${payload.range.end}`;
        }
        // eslint-disable-next-line no-await-in-loop
        const getRes = await fetchCompat(signedUrl, { method: "GET", headers });
        if (getRes.ok || getRes.status === 206) {
          stream = coerceReadableStream(getRes.body);
        } else {
          throw new Error(`Signed URL GET failed: ${getRes.status}`);
        }
      } else {
        stream = file.createReadStream(payload.range ? {
          start: Number(payload.range.start || 0),
          end: Number(payload.range.end || 0)
        } : undefined);
      }

      req.once("close", () => {
        if (stream && typeof stream.destroy === "function" && !stream.destroyed) {
          stream.destroy();
        }
      });

      await safePipeline(stream, res.status(payload.status || 200));
      return { streamed: true };
    } catch (error) {
      lastError = error;
      const errorText = String(error?.code || error?.message || "").trim();
      const isClientAbort = req.destroyed || error?.code === "ERR_STREAM_PREMATURE_CLOSE";
      if (isClientAbort) {
        return {
          streamed: false,
          aborted: true,
          status: 499,
          code: "premature_close",
          detail: {
            storagePath: cleanStoragePath,
            bucket: String(bucket?.name || "").trim()
          }
        };
      }
      const status = Number(error?.statusCode || error?.status || error?.code || 0) || 0;
      if (status === 401 || status === 403 || /permission|forbidden/i.test(String(error?.message || ""))) {
        lastAuthError = error;
        continue;
      }
      if (status === 404 || String(error?.code || "").trim().toLowerCase() === "storage_not_found" || /no such object/i.test(String(error?.message || ""))) {
        lastMissingError = error;
        continue;
      }
      continue;
    }
  }

  if (lastAuthError) {
    return {
      streamed: false,
      status: 403,
      code: "storage_forbidden",
      detail: {
        storagePath: cleanStoragePath,
        lastError: String(lastAuthError?.message || lastAuthError),
        bucketsTried: candidateBuckets.map((bucket) => String(bucket?.name || "").trim()).filter(Boolean)
      }
    };
  }

  return {
    streamed: false,
    status: 404,
    code: "storage_not_found",
    detail: {
      storagePath: cleanStoragePath,
      lastError: lastError ? String(lastError?.message || lastError) : "",
      bucketsTried: candidateBuckets.map((bucket) => String(bucket?.name || "").trim()).filter(Boolean),
      lastMissingError: lastMissingError ? String(lastMissingError?.message || lastMissingError) : ""
    }
  };
}

const MONTAGE_EXPORT_CACHE_DIR = path.join(os.tmpdir(), "cb-montage-exports-cache");
const MONTAGE_EXPORT_CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2h
const MONTAGE_EXPORT_CACHE_MAX_ITEMS = 40;
const MONTAGE_EXPORT_INLINE_DATA_URL_MAX_BYTES = 2_500_000;
const MONTAGE_EXPORT_JOB_TTL_MS = 2 * 60 * 60 * 1000;
const MONTAGE_EXPORT_RECENT_SNAPSHOT_GRACE_MS = DEFAULT_RECENT_SNAPSHOT_GRACE_MS;
const MONTAGE_EXPORT_SCENE_DOWNLOAD_TIMEOUT_MS = 2 * 60 * 1000;
const MONTAGE_EXPORT_SCENE_DOWNLOAD_IDLE_TIMEOUT_MS = 90 * 1000;
const MONTAGE_EXPORT_SCENE_PROBE_TIMEOUT_MS = 30 * 1000;
const MONTAGE_EXPORT_SCENE_RENDER_TIMEOUT_MS = Math.max(
  60 * 1000,
  Number(process.env.MONTAGE_EXPORT_SCENE_RENDER_TIMEOUT_MS || 6 * 60 * 1000) || 6 * 60 * 1000
);
const MONTAGE_EXPORT_FFMPEG_HEARTBEAT_MS = Math.max(
  5 * 1000,
  Number(process.env.MONTAGE_EXPORT_FFMPEG_HEARTBEAT_MS || 15 * 1000) || 15 * 1000
);
const MONTAGE_EXPORT_STALE_HEARTBEAT_MS = Math.max(
  10 * 60 * 1000,
  MONTAGE_EXPORT_SCENE_RENDER_TIMEOUT_MS + (2 * 60 * 1000)
);
const MONTAGE_EXPORT_RESTART_INTERRUPT_GRACE_MS = Math.max(
  10 * 1000,
  Number(process.env.MONTAGE_EXPORT_RESTART_INTERRUPT_GRACE_MS || 20 * 1000) || 20 * 1000
);
const IS_RENDER_RUNTIME = Boolean(
  String(process.env.RENDER_EXTERNAL_HOSTNAME || process.env.RENDER_SERVICE_ID || "").trim()
);
const MONTAGE_EXPORT_STATUS_READ_TIMEOUT_MS = Math.max(
  2500,
  Number(process.env.MONTAGE_EXPORT_STATUS_READ_TIMEOUT_MS || 6500) || 6500
);
const montageExportJobs = new Map();

function getMontageExportJobMetaPath(jobId = "") {
  const clean = clampExportId(jobId);
  if (!clean) return "";
  return path.join(MONTAGE_EXPORT_CACHE_DIR, `job-${clean}.json`);
}

async function ensureMontageExportCacheDir() {
  await fs.promises.mkdir(MONTAGE_EXPORT_CACHE_DIR, { recursive: true });
  return MONTAGE_EXPORT_CACHE_DIR;
}

function clampExportId(value = "") {
  return clampText(String(value || "").trim(), 120).replace(/[^a-z0-9_-]/gi, "");
}

async function cleanupMontageExportCache() {
  let removedMetaCount = 0;
  let removedFileCount = 0;
  try {
    await ensureMontageExportCacheDir();
    const names = await fs.promises.readdir(MONTAGE_EXPORT_CACHE_DIR).catch(() => []);
    const metaFiles = names.filter((name) => name.endsWith(".json"));
    const now = Date.now();
    const items = [];
    for (const name of metaFiles) {
      const full = path.join(MONTAGE_EXPORT_CACHE_DIR, name);
      try {
        // eslint-disable-next-line no-await-in-loop
        const stat = await fs.promises.stat(full);
        items.push({ full, mtimeMs: stat.mtimeMs });
      } catch (_) {}
    }
    items.sort((a, b) => b.mtimeMs - a.mtimeMs);

    const removeMeta = async (metaPath) => {
      try {
        const raw = await fs.promises.readFile(metaPath, "utf8");
        const meta = JSON.parse(raw);
        const filePath = String(meta?.filePath || "").trim();
        if (filePath) {
          const fileRemoved = await fs.promises.rm(filePath, { force: true }).then(() => true).catch(() => false);
          if (fileRemoved) removedFileCount += 1;
        }
      } catch (_) {}
      const metaRemoved = await fs.promises.rm(metaPath, { force: true }).then(() => true).catch(() => false);
      if (metaRemoved) removedMetaCount += 1;
    };

    for (const item of items) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const raw = await fs.promises.readFile(item.full, "utf8");
        const meta = JSON.parse(raw);
        const expiresAt = Number(new Date(meta?.expiresAt || 0).getTime() || 0) || 0;
        if (expiresAt && expiresAt < now) {
          // eslint-disable-next-line no-await-in-loop
          await removeMeta(item.full);
        }
      } catch (_) {}
    }

    const refreshed = await fs.promises.readdir(MONTAGE_EXPORT_CACHE_DIR).catch(() => []);
    const refreshedMeta = refreshed.filter((name) => name.endsWith(".json"));
    if (refreshedMeta.length <= MONTAGE_EXPORT_CACHE_MAX_ITEMS) return;
    const stats = [];
    for (const name of refreshedMeta) {
      const full = path.join(MONTAGE_EXPORT_CACHE_DIR, name);
      try {
        // eslint-disable-next-line no-await-in-loop
        const stat = await fs.promises.stat(full);
        stats.push({ full, mtimeMs: stat.mtimeMs });
      } catch (_) {}
    }
    stats.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const toRemove = stats.slice(MONTAGE_EXPORT_CACHE_MAX_ITEMS);
    for (const item of toRemove) {
      // eslint-disable-next-line no-await-in-loop
      await removeMeta(item.full);
    }
  } catch (_) {
    // best-effort
  }
  return {
    removedMetaCount,
    removedFileCount
  };
}

function getMontageExportCacheMetaPath(exportId = "") {
  const clean = clampExportId(exportId);
  if (!clean) return "";
  return path.join(MONTAGE_EXPORT_CACHE_DIR, `${clean}.json`);
}

function getMontageExportCacheFilePath(exportId = "", outExt = "mp4") {
  const clean = clampExportId(exportId);
  if (!clean) return "";
  const safeExt = String(outExt || "mp4").trim().replace(/[^a-z0-9]+/gi, "") || "mp4";
  return path.join(MONTAGE_EXPORT_CACHE_DIR, `${clean}.${safeExt}`);
}

async function writeMontageExportCacheArtifact({
  exportId = "",
  sourcePath = "",
  token = "",
  filename = "",
  mimeType = "",
  expiresAt = "",
  outExt = "mp4"
} = {}) {
  const cleanExportId = clampExportId(exportId);
  const cleanSourcePath = String(sourcePath || "").trim();
  if (!cleanExportId || !cleanSourcePath) return null;

  await ensureMontageExportCacheDir();
  const cacheFilePath = getMontageExportCacheFilePath(cleanExportId, outExt);
  const metaPath = getMontageExportCacheMetaPath(cleanExportId);
  if (!cacheFilePath || !metaPath) return null;

  await fs.promises.rm(cacheFilePath, { force: true }).catch(() => {});
  try {
    await fs.promises.rename(cleanSourcePath, cacheFilePath);
  } catch (renameError) {
    try {
      await fs.promises.copyFile(cleanSourcePath, cacheFilePath);
    } catch (copyError) {
      throw copyError || renameError;
    }
  }

  const meta = {
    exportId: cleanExportId,
    token: String(token || "").trim(),
    filename: String(filename || "").trim(),
    mimeType: String(mimeType || "").trim(),
    expiresAt: String(expiresAt || "").trim(),
    filePath: cacheFilePath
  };
  await fs.promises.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf8");
  return meta;
}

async function tryStreamMontageExportCacheDownload(req, res, {
  exportId = "",
  token = "",
  fallbackFilename = "",
  fallbackMimeType = ""
} = {}) {
  const cleanExportId = clampExportId(exportId);
  const cleanToken = clampText(String(token || "").trim(), 180);
  if (!cleanExportId || !cleanToken) return false;

  const metaPath = getMontageExportCacheMetaPath(cleanExportId);
  const raw = await fs.promises.readFile(metaPath, "utf8").catch(() => "");
  if (!raw) return false;

  let meta = null;
  try {
    meta = JSON.parse(raw);
  } catch (_) {
    meta = null;
  }
  if (!meta || String(meta.exportId || "") !== cleanExportId) {
    return false;
  }
  if (String(meta.token || "") !== cleanToken) {
    applyAssetCorsHeaders(req, res);
    return res.status(403).json({ error: "Token inválido para descarga." });
  }
  const expiresAtMs = Number(new Date(meta.expiresAt || 0).getTime() || 0) || 0;
  if (expiresAtMs && expiresAtMs < Date.now()) {
    applyAssetCorsHeaders(req, res);
    return res.status(404).json({ error: "Export expirado." });
  }
  const filePath = String(meta.filePath || "").trim();
  if (!filePath) {
    return false;
  }
  const stat = await fs.promises.stat(filePath).catch(() => null);
  if (!stat || !stat.isFile()) {
    applyAssetCorsHeaders(req, res);
    return res.status(404).json({ error: "Export no encontrado o expirado." });
  }

  const rangeHeader = String(req.headers.range || "").trim();
  const mimeType = String(meta.mimeType || fallbackMimeType || "application/octet-stream").trim() || "application/octet-stream";
  const filename = String(meta.filename || fallbackFilename || `montage-${cleanExportId}`).trim() || `montage-${cleanExportId}`;
  applyAssetCorsHeaders(req, res);
  res.setHeader("Content-Type", mimeType);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "private, max-age=60");
  res.setHeader("Content-Disposition", `attachment; filename="${filename.replace(/\"/g, "")}"`);

  const total = Number(stat.size || 0) || 0;
  if (rangeHeader) {
    const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/i);
    if (match) {
      const start = Math.max(0, Number(match[1] || 0));
      const end = match[2] ? Math.min(total - 1, Number(match[2])) : total - 1;
      if (start <= end && end < total) {
        res.status(206);
        res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
        res.setHeader("Content-Length", String(end - start + 1));
        fs.createReadStream(filePath, { start, end }).pipe(res);
        return true;
      }
    }
  }
  res.setHeader("Content-Length", String(total));
  fs.createReadStream(filePath).pipe(res);
  return true;
}

function sanitizeMontageJobPublicPayload(job = null) {
  const source = job && typeof job === "object" ? job : {};
  const payload = {
    ok: true,
    jobId: String(source.jobId || "").trim(),
    status: String(source.status || "queued").trim() || "queued",
    stage: String(source.stage || "validate_payload").trim() || "validate_payload",
    progress: Math.max(0, Math.min(1, Number(source.progress || 0) || 0)),
    hint: String(source.hint || "").trim(),
    updatedAt: String(source.updatedAt || "").trim() || new Date().toISOString()
  };
  if (Number.isFinite(Number(source.currentSceneIndex))) payload.currentSceneIndex = Math.max(0, Math.round(Number(source.currentSceneIndex) || 0));
  if (source.currentRowId) payload.currentRowId = String(source.currentRowId || "").trim();
  if (source.sceneSubstage) payload.sceneSubstage = String(source.sceneSubstage || "").trim();
  if (source.currentStoragePath) payload.currentStoragePath = String(source.currentStoragePath || "").trim();
  if (source.currentDownloadUrl) payload.currentDownloadUrl = String(source.currentDownloadUrl || "").trim();
  if (source.lastHeartbeatAt) payload.lastHeartbeatAt = String(source.lastHeartbeatAt || "").trim();
  if (Number.isFinite(Number(source.failedSceneIndex))) payload.failedSceneIndex = Math.max(0, Math.round(Number(source.failedSceneIndex) || 0));
  if (source.failedRowId) payload.failedRowId = String(source.failedRowId || "").trim();
  if (source.failedSubstage) payload.failedSubstage = String(source.failedSubstage || "").trim();
  if (Number.isFinite(Number(source.totalScenes))) payload.totalScenes = Math.max(0, Math.round(Number(source.totalScenes) || 0));
  if (Array.isArray(source.warnings) && source.warnings.length) payload.warnings = source.warnings;
  if (source.error && typeof source.error === "object") payload.error = source.error;
  if (source.export && typeof source.export === "object") payload.export = source.export;
  if (source.downloadUrl) payload.downloadUrl = String(source.downloadUrl || "").trim();
  return payload;
}

function summarizeMemoryUsage() {
  try {
    const usage = process.memoryUsage();
    return {
      rssMb: Math.round((Number(usage?.rss || 0) / (1024 * 1024)) * 10) / 10,
      heapUsedMb: Math.round((Number(usage?.heapUsed || 0) / (1024 * 1024)) * 10) / 10,
      heapTotalMb: Math.round((Number(usage?.heapTotal || 0) / (1024 * 1024)) * 10) / 10,
      externalMb: Math.round((Number(usage?.external || 0) / (1024 * 1024)) * 10) / 10
    };
  } catch (_) {
    return null;
  }
}

function logMontageMemory(stage = "", extra = {}) {
  console.info("[backend][montage-export][memory]", {
    stage: String(stage || "").trim() || "unknown",
    ...extra,
    memory: summarizeMemoryUsage()
  });
}

function logHeavyWorkMemory(kind = "", stage = "", extra = {}) {
  console.info("[backend][heavy-work][memory]", {
    kind: String(kind || "").trim() || "unknown",
    stage: String(stage || "").trim() || "unknown",
    ...extra,
    memory: summarizeMemoryUsage()
  });
}

function getActiveHeavyWorkJobId() {
  return String(heavyWorkState.activeMontageExportJobId || heavyWorkState.activeDialogueVideoJobId || "").trim();
}

function getActiveHeavyWorkKind() {
  if (String(heavyWorkState.activeMontageExportJobId || "").trim()) return "montage_export";
  if (String(heavyWorkState.activeDialogueVideoJobId || "").trim()) return "dialogue_video";
  return "";
}

function buildBackendBusyJson(kind = "", activeJobId = "") {
  const error = buildHeavyWorkBusyError(kind, activeJobId);
  return {
    error: String(error.message || "backend_busy").trim() || "backend_busy",
    code: String(error.code || "backend_busy").trim() || "backend_busy",
    detail: error.detail && typeof error.detail === "object" ? error.detail : {
      kind: String(kind || "").trim() || "unknown",
      activeJobId: String(activeJobId || "").trim(),
      retryable: true
    }
  };
}

function buildMontageStderrPreview(value = "", maxLines = 12, maxChars = 2200) {
  return String(value || "").split(/\r?\n/).slice(-Math.max(1, Number(maxLines) || 1)).join(" | ").slice(0, Math.max(120, Number(maxChars) || 2200));
}

function buildMontageSceneTrace({
  jobId = "",
  sceneIndex = 0,
  rowId = "",
  storagePath = "",
  downloadUrl = "",
  substage = "",
  elapsedMs = 0,
  extra = {}
} = {}) {
  return {
    jobId: clampExportId(jobId),
    sceneIndex: Math.max(0, Number(sceneIndex || 0) || 0),
    rowId: clampText(rowId || "", 160),
    storagePath: clampText(storagePath || "", 900),
    downloadUrl: redactUrlForLogs(downloadUrl),
    substage: String(substage || "").trim() || undefined,
    elapsedMs: Math.max(0, Math.round(Number(elapsedMs || 0) || 0)),
    ...extra,
    memory: summarizeMemoryUsage()
  };
}

function withTimeout(task, timeoutMs = 0, buildError = null) {
  const ms = Math.max(0, Number(timeoutMs || 0) || 0);
  if (!ms) return Promise.resolve().then(() => task());
  return new Promise((resolve, reject) => {
    let settled = false;
    const finishResolve = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const finishReject = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };
    const timer = setTimeout(() => {
      const timeoutError = typeof buildError === "function"
        ? buildError(ms)
        : (() => {
            const err = new Error(`timeout_${ms}`);
            err.code = "timeout";
            err.timeoutMs = ms;
            return err;
          })();
      finishReject(timeoutError);
    }, ms);
    Promise.resolve()
      .then(() => task())
      .then(finishResolve)
      .catch(finishReject);
  });
}

async function persistMontageExportJob(job = null) {
  const source = job && typeof job === "object" ? job : null;
  const jobId = clampExportId(source?.jobId || "");
  if (!source || !jobId) return;
  await ensureMontageExportCacheDir();
  const metaPath = getMontageExportJobMetaPath(jobId);
  if (!metaPath) return;
  const cleanSource = stripUndefinedDeep(source) || {};
  await fs.promises.writeFile(metaPath, JSON.stringify(cleanSource), "utf8");
}

async function readPersistedMontageExportJob(jobId = "") {
  const clean = clampExportId(jobId);
  if (!clean) return null;
  const metaPath = getMontageExportJobMetaPath(clean);
  if (!metaPath) return null;
  const raw = await fs.promises.readFile(metaPath, "utf8").catch(() => "");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || String(parsed.jobId || "").trim() !== clean) return null;
    const recovered = recoverMontageExportJobSnapshot(parsed, {
      nowMs: Date.now(),
      graceMs: MONTAGE_EXPORT_RECENT_SNAPSHOT_GRACE_MS
    });
    if (recovered) return recovered;
    if (isMontageExportJobStale(parsed)) return parsed;
    if (Number(parsed.expiresAtMs || 0) && Number(parsed.expiresAtMs || 0) < Date.now()) {
      await fs.promises.rm(metaPath, { force: true }).catch(() => {});
      return null;
    }
    return null;
  } catch (_) {
    return null;
  }
}

async function resolveMontageExportJobSnapshot(jobId = "") {
  const cleanJobId = clampExportId(jobId);
  if (!cleanJobId) return null;

  const memoryJob = montageExportJobs.get(cleanJobId) || null;
  if (memoryJob) return memoryJob;

  const persistedJob = await readPersistedMontageExportJob(cleanJobId).catch(() => null);
  if (persistedJob) return persistedJob;

  try {
    const snapshot = await withTimeout(
      () => montageExportJobStore.getJob(cleanJobId),
      MONTAGE_EXPORT_STATUS_READ_TIMEOUT_MS,
      (timeoutMs) => {
        const err = new Error(`montage_export_status_timeout_${timeoutMs}`);
        err.code = "montage_export_status_timeout";
        err.status = 202;
        err.timeoutMs = timeoutMs;
        return err;
      }
    );
    const recovered = recoverMontageExportJobSnapshot(snapshot, {
      nowMs: Date.now(),
      graceMs: MONTAGE_EXPORT_RECENT_SNAPSHOT_GRACE_MS
    });
    if (!recovered && isMontageExportJobStale(snapshot)) return snapshot;
    return recovered;
  } catch (error) {
    const status = Number(error?.status || 500) || 500;
    if (status === 404 || String(error?.code || "").trim() === "job_not_found") {
      return null;
    }
    throw error;
  }
}

function getMontageExportJobHeartbeatAgeMs(job = null, nowMs = Date.now()) {
  const source = job && typeof job === "object" ? job : null;
  if (!source) return 0;
  const heartbeatMs = Number(new Date(source.heartbeatAt || source.lastHeartbeatAt || source.updatedAt || 0).getTime() || 0) || 0;
  if (!heartbeatMs) return 0;
  return Math.max(0, Number(nowMs || Date.now()) - heartbeatMs);
}

function isMontageExportJobInterruptedByBackendRestart(job = null, bootMs = Date.parse(BACKEND_BOOT_ISO) || Date.now()) {
  const source = job && typeof job === "object" ? job : null;
  if (!source) return false;
  const status = String(source.status || "").trim().toLowerCase();
  if (!["queued", "running"].includes(status)) return false;
  const stage = String(source.stage || "").trim().toLowerCase();
  if (!stage || stage === "queued") return false;
  const heartbeatMs = Number(new Date(source.heartbeatAt || source.lastHeartbeatAt || source.updatedAt || 0).getTime() || 0) || 0;
  if (!heartbeatMs || !Number.isFinite(heartbeatMs)) return false;
  const cleanBootMs = Number(bootMs || Date.now()) || Date.now();
  return heartbeatMs < (cleanBootMs - MONTAGE_EXPORT_RESTART_INTERRUPT_GRACE_MS);
}

function isMontageExportJobStale(job = null, nowMs = Date.now()) {
  const status = String(job?.status || "").trim().toLowerCase();
  if (!["queued", "running"].includes(status)) return false;
  const heartbeatAgeMs = getMontageExportJobHeartbeatAgeMs(job, nowMs);
  return heartbeatAgeMs > MONTAGE_EXPORT_STALE_HEARTBEAT_MS;
}

function buildStaleMontageExportJobPatch(job = null, nowMs = Date.now()) {
  const heartbeatAgeMs = getMontageExportJobHeartbeatAgeMs(job, nowMs);
  return {
    status: "error",
    stage: "error",
    progress: Math.max(0.02, Math.min(0.98, Number(job?.progress || 0) || 0)),
    hint: "El worker perdió el heartbeat del export. Inicia una nueva exportación.",
    error: {
      error: "montage_export_worker_stalled",
      code: "montage_export_worker_stalled",
      message: "El worker dejó de reportar progreso durante demasiado tiempo.",
      detail: {
        heartbeatAgeMs,
        staleThresholdMs: MONTAGE_EXPORT_STALE_HEARTBEAT_MS,
        lastHeartbeatAt: String(job?.heartbeatAt || job?.lastHeartbeatAt || job?.updatedAt || "").trim(),
        stage: String(job?.stage || "").trim(),
        sceneSubstage: String(job?.sceneSubstage || "").trim(),
        currentSceneIndex: Math.max(0, Math.round(Number(job?.currentSceneIndex || 0) || 0)),
        totalScenes: Math.max(0, Math.round(Number(job?.totalScenes || 0) || 0))
      }
    }
  };
}

function buildRestartInterruptedMontageExportJobPatch(job = null) {
  return {
    status: "error",
    stage: "error",
    progress: Math.max(0.02, Math.min(0.98, Number(job?.progress || 0) || 0)),
    hint: "El worker de export se reinició durante el render. Inicia una nueva exportación.",
    error: {
      error: "montage_export_worker_restarted",
      code: "montage_export_worker_restarted",
      message: "El backend se reinició mientras FFmpeg procesaba el export.",
      detail: {
        backendBootAt: BACKEND_BOOT_ISO,
        lastHeartbeatAt: String(job?.heartbeatAt || job?.lastHeartbeatAt || job?.updatedAt || "").trim(),
        stage: String(job?.stage || "").trim(),
        sceneSubstage: String(job?.sceneSubstage || "").trim(),
        currentSceneIndex: Math.max(0, Math.round(Number(job?.currentSceneIndex || 0) || 0)),
        totalScenes: Math.max(0, Math.round(Number(job?.totalScenes || 0) || 0))
      }
    }
  };
}

function createDirectMontageExportJobStoreBridge() {
  return {
    createJob: async (args) => {
      const job = await montageExportJobStore.createJob(args);
      upsertMontageExportJob(job.jobId, job);
      return job;
    },
    updateJob: async (id, patch) => {
      upsertMontageExportJob(id, patch);
      await montageExportJobStore.updateJob(id, patch);
    },
    getJob: async (id) => {
      return montageExportJobs.get(id) || await montageExportJobStore.getJob(id);
    }
  };
}

function runMontageExportDirectJob({
  jobId = "",
  uid = "",
  sessionId = "",
  input = null,
  baseUrl = ""
} = {}) {
  const cleanJobId = clampExportId(jobId);
  if (!cleanJobId || !input || typeof input !== "object") return false;
  setImmediate(async () => {
    try {
      const directJobStore = createDirectMontageExportJobStoreBridge();
      const processFn = createProcessMontageExportJob({
        jobStore: directJobStore,
        executeMontageExportPipeline,
        buildMontageSceneFailure
      });
      await processFn({
        data: {
          jobId: cleanJobId,
          sessionId: String(sessionId || input.sessionId || "").trim(),
          ownerId: String(uid || "").trim(),
          input,
          baseUrl: String(baseUrl || "").trim()
        }
      });
    } catch (err) {
      console.error("[backend][montage-export] direct export failed", {
        jobId: cleanJobId,
        error: String(err?.message || err),
        stack: String(err?.stack || "").trim() || null
      });
    } finally {
      releaseHeavyWorkSlot("montage_export", cleanJobId);
    }
  });
  return true;
}

function upsertDialogueVideoJob(jobId = "", patch = {}) {
  const id = clampExportId(jobId);
  if (!id) return null;
  const prev = dialogueVideoJobs.get(id) || {
    jobId: id,
    status: "queued",
    stage: "queued",
    progress: 0,
    hint: "",
    error: null,
    dialogueVideo: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    expiresAtMs: Date.now() + DIALOGUE_VIDEO_JOB_TTL_MS
  };
  const next = {
    ...prev,
    ...patch,
    jobId: id,
    progress: Math.max(0, Math.min(1, Number(patch?.progress ?? prev.progress ?? 0) || 0)),
    updatedAt: new Date().toISOString(),
    expiresAtMs: Date.now() + DIALOGUE_VIDEO_JOB_TTL_MS
  };
  dialogueVideoJobs.set(id, next);
  return next;
}

function getDialogueVideoJob(jobId = "") {
  const id = clampExportId(jobId);
  if (!id) return null;
  const job = dialogueVideoJobs.get(id) || null;
  if (!job) return null;
  if (Number(job.expiresAtMs || 0) && Number(job.expiresAtMs || 0) < Date.now()) {
    dialogueVideoJobs.delete(id);
    return null;
  }
  return job;
}

function cleanupDialogueVideoJobs() {
  const now = Date.now();
  let removedCount = 0;
  for (const [jobId, job] of dialogueVideoJobs.entries()) {
    if (Number(job?.expiresAtMs || 0) && Number(job.expiresAtMs || 0) < now) {
      dialogueVideoJobs.delete(jobId);
      removedCount += 1;
    }
  }
  return removedCount;
}

function upsertMontageExportJob(jobId = "", patch = {}) {
  const id = clampExportId(jobId);
  if (!id) return null;
  const cleanPatch = stripUndefinedDeep(patch) || {};
  const heartbeatAt = Object.prototype.hasOwnProperty.call(patch, "heartbeatAt")
    ? String(cleanPatch.heartbeatAt || "").trim() || new Date().toISOString()
    : new Date().toISOString();
  const prev = montageExportJobs.get(id) || {
    jobId: id,
    status: "queued",
    stage: "validate_payload",
    progress: 0,
    hint: "",
    warnings: [],
    export: null,
    error: null,
    createdAt: new Date().toISOString(),
    updatedAt: heartbeatAt,
    heartbeatAt,
    expiresAtMs: Date.now() + MONTAGE_EXPORT_JOB_TTL_MS
  };
  const next = {
    ...prev,
    ...cleanPatch,
    jobId: id,
    progress: Math.max(0, Math.min(1, Number(cleanPatch?.progress ?? prev.progress ?? 0) || 0)),
    updatedAt: heartbeatAt,
    heartbeatAt,
    expiresAtMs: Date.now() + MONTAGE_EXPORT_JOB_TTL_MS
  };
  if (Array.isArray(cleanPatch?.warnings)) next.warnings = cleanPatch.warnings;
  montageExportJobs.set(id, next);
  void persistMontageExportJob(next).catch((error) => {
    console.warn("[backend][montage-export] persist job failed", {
      jobId: id,
      message: String(error?.message || error)
    });
  });
  return next;
}

function getMontageExportJob(jobId = "") {
  const id = clampExportId(jobId);
  if (!id) return null;
  const job = montageExportJobs.get(id) || null;
  if (!job) return null;
  if (Number(job.expiresAtMs || 0) && Number(job.expiresAtMs || 0) < Date.now()) {
    montageExportJobs.delete(id);
    return null;
  }
  return job;
}

function cleanupMontageExportJobs() {
  const now = Date.now();
  let removedCount = 0;
  for (const [jobId, job] of montageExportJobs.entries()) {
    if (Number(job?.expiresAtMs || 0) && Number(job.expiresAtMs || 0) < now) {
      montageExportJobs.delete(jobId);
      removedCount += 1;
      const metaPath = getMontageExportJobMetaPath(jobId);
      if (metaPath) {
        void fs.promises.rm(metaPath, { force: true }).catch(() => {});
      }
    }
  }
  return removedCount;
}

function startBackendCleanupInterval() {
  setInterval(() => {
    if (cleanupIntervalRunning) return;
    cleanupIntervalRunning = true;
    const memoryBefore = summarizeMemoryUsage();
    void (async () => {
      try {
        const dialogueJobsRemoved = cleanupDialogueVideoJobs();
        const montageJobsRemoved = cleanupMontageExportJobs();
        const cacheSummary = await cleanupMontageExportCache();
        const removedMetaCount = Math.max(0, Number(cacheSummary?.removedMetaCount || 0) || 0);
        const removedFileCount = Math.max(0, Number(cacheSummary?.removedFileCount || 0) || 0);
        if (dialogueJobsRemoved || montageJobsRemoved || removedMetaCount || removedFileCount) {
          console.info("[backend][cleanup]", {
            dialogueJobsRemoved,
            montageJobsRemoved,
            removedMetaCount,
            removedFileCount,
            memoryBefore,
            memoryAfter: summarizeMemoryUsage()
          });
        }
      } catch (error) {
        console.warn("[backend][cleanup]", {
          message: String(error?.message || error || "cleanup_failed")
        });
      } finally {
        cleanupIntervalRunning = false;
      }
    })();
  }, 60 * 1000).unref?.();
}

const IS_MAIN_MODULE = require.main === module;

if (IS_MAIN_MODULE) {
  startBackendCleanupInterval();
}

function getBackendPublicBaseUrl() {
  const direct = String(process.env.PUBLIC_BACKEND_BASE_URL || "").trim();
  if (direct) return direct.replace(/\/+$/, "");
  const renderHostname = String(process.env.RENDER_EXTERNAL_HOSTNAME || "").trim();
  if (renderHostname) return `https://${renderHostname}`;
  return "";
}

function resolvePublicBaseUrl(req) {
  const xfProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const xfHost = String(req.headers["x-forwarded-host"] || "").split(",")[0].trim();
  const proto = xfProto || (req.protocol || "http");
  const host = xfHost || String(req.get("host") || "").trim();
  return host ? `${proto}://${host}` : "";
}

function redactUrlForLogs(url = "") {
  const clean = String(url || "").trim();
  if (!clean) return "";
  try {
    const parsed = new URL(clean);
    if (parsed.searchParams.has("token")) parsed.searchParams.set("token", "REDACTED");
    return parsed.toString();
  } catch (_) {
    return clean.slice(0, 400);
  }
}

function hasGeminiKey() {
  return !!GEMINI_API_KEY;
}

function ensureGeminiKey(res) {
  if (hasGeminiKey()) return true;
  res.status(500).json({ error: "Falta GEMINI_API_KEY o GOOGLE_API_KEY en backend." });
  return false;
}

function normalizeModel(input = "") {
  const raw = String(input || "")
    .trim()
    .replace(/^models\//i, "")
    // Algunos clientes mandan el endpoint (como en la REST API), pero aquí lo agregamos nosotros.
    .replace(/:(generateContent|streamGenerateContent)$/i, "");
  return raw || "gemini-2.5-flash";
}

function normalizeLiveVoiceName(input = "") {
  const raw = String(input || "").trim();
  if (!raw) return "";
  for (const candidate of GEMINI_LIVE_ALLOWED_VOICE_NAMES) {
    if (candidate.toLowerCase() === raw.toLowerCase()) return candidate;
  }
  return "";
}

function clampText(value = "", maxLen = 2000) {
  return String(value || "").trim().slice(0, Math.max(0, Number(maxLen) || 0));
}

function clampNumber(value, min = 0, max = Number.POSITIVE_INFINITY, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizePodcasterSpeakerSlotIndex(speakerLabel = "") {
  const key = String(speakerLabel || "").trim();
  const match = key.match(/(\d+)/);
  if (match) return Math.max(0, Number(match[1]) - 1);
  if (/host\s*b/i.test(key)) return 1;
  if (/host\s*c/i.test(key)) return 2;
  if (/host\s*d/i.test(key)) return 3;
  return 0;
}

function buildBackendPodcasterCharacterPrompt({
  speakerLabel = "",
  speakerName = "",
  voiceName = "",
  genderGroup = "",
  expression = "Neutral",
  counterpartSpeakerName = "",
  contentMode = "podcast",
}) {
  const educational = String(contentMode || "").trim().toLowerCase() === "educational";
  return [
    `Retrato consistente del locutor ${speakerName || speakerLabel || "principal"}.`,
    voiceName ? `Voz asociada: ${voiceName}.` : "",
    genderGroup ? `Presentación de género del personaje: ${genderGroup}.` : "",
    `Expresión predominante: ${expression}.`,
    "Definir identidad consistente: facciones memorables, proporciones faciales estables, peinado reconocible, mirada segura, vestuario sobrio de locución premium.",
    "Evitar ambigüedad de género y evitar cambios de edad, etnia o complexión entre generaciones.",
    counterpartSpeakerName ? `${speakerName} es un personaje distinto de ${counterpartSpeakerName}; no mezclar sus rostros, peinados, siluetas ni rasgos.` : "",
    educational
      ? "La imagen debe corresponder exactamente al personaje activo y no a otro personaje del video educativo."
      : "La imagen debe corresponder exactamente al locutor activo y no a otro host del podcast.",
    "No caricatura, no ilustración, no anime: retrato fotorealista de estudio."
  ].filter(Boolean).join(" ");
}

function buildBackendPodcasterStudioScenePrompt({
  speakerLabel = "",
  speakerName = "",
  counterpartSpeakerName = "",
  scenarioPrompt = "",
  expression = "Neutral",
  singleSubjectOnly = false,
  contentMode = "podcast",
}) {
  const isReel = String(contentMode || "").trim().toLowerCase() === "reel";
  const educational = isReel || String(contentMode || "").trim().toLowerCase() === "educational";
  const speakerIndex = normalizePodcasterSpeakerSlotIndex(speakerLabel);

  let stageZones;
  let eyelineDirection;

  if (isReel) {
    stageZones = [
      "zona central del encuadre, centrado en medio de la pantalla (layout vertical de red social)",
    ];
    eyelineDirection = {
      bodyAngle: "cuerpo de frente, posicionado simétricamente en el centro del encuadre",
      gaze: "mirada fija y directa al lente de la cámara, estableciendo contacto visual magnético y dinámico con la audiencia",
      cameraAngle: "cámara frontal a la altura de los ojos, encuadre vertical ideal para Reels/Shorts (9:16)"
    };
  } else {
    stageZones = educational
      ? [
        "zona izquierda del encuadre, junto a un recurso visual de apoyo",
        "zona derecha del encuadre, con composición didáctica limpia",
        "zona central con profundidad de campo suave y apoyo gráfico",
        "zona lateral secundaria con ángulo alterno del mismo entorno educativo",
      ]
      : [
        "zona izquierda del escenario, cerca del micrófono principal izquierdo",
        "zona derecha del escenario, cerca del micrófono principal derecho",
        "zona central ligeramente al fondo, junto a la consola o mesa principal",
        "zona lateral secundaria con un ángulo alterno del mismo set",
      ];
    const eyelineDirections = [
      {
        bodyAngle: "cuerpo en tres cuartos orientado hacia la derecha del set",
        gaze: "mirada dirigida lateralmente hacia la derecha del set",
        cameraAngle: "cámara desde su lado izquierdo para evitar frontalidad total",
      },
      {
        bodyAngle: "cuerpo en tres cuartos orientado hacia la izquierda del set",
        gaze: "mirada dirigida lateralmente hacia la izquierda del set",
        cameraAngle: "cámara desde su lado derecho para evitar frontalidad total",
      },
      {
        bodyAngle: "cuerpo en tres cuartos orientado hacia el interlocutor principal",
        gaze: "mirada desviada hacia un punto fuera de cámara, nunca al lente",
        cameraAngle: "ángulo lateral suave para mantener una conversación creíble",
      },
      {
        bodyAngle: "cuerpo en tres cuartos con leve giro hacia el centro del set",
        gaze: "mirada hacia el centro conversacional del estudio, sin mirar al lente",
        cameraAngle: "ángulo alterno lateral para reforzar continuidad entre locutores",
      },
    ];
    eyelineDirection = eyelineDirections[speakerIndex % eyelineDirections.length];
  }

  const zoneLabel = stageZones[speakerIndex % stageZones.length];
  const cleanScenario = String(scenarioPrompt || "Cabina de radio premium").replace(/\s+/g, " ").trim() || "Cabina de radio premium";
  const lines = [
    educational
      ? `Escenario visual consistente para ${speakerName || speakerLabel || "el presentador"}.`
      : `Escenario de locución consistente para ${speakerName || speakerLabel || "el locutor"}.`,
    `Escenario obligatorio: ${cleanScenario}.`,
    educational
      ? "Convertir ese escenario en un set fotorealista de video educativo con apoyo visual claro, elementos didácticos sutiles, iluminación limpia y composición editorial."
      : "Convertir ese escenario en un set fotorealista de locución con tratamiento acústico visible, micrófono broadcast en brazo articulado, consola discreta y luz cinematográfica suave.",
    `Posición fija obligatoria dentro del set para ${speakerName || speakerLabel || "el locutor"}: ${zoneLabel}.`,
    educational
      ? "Importante: posicionar a cada personaje en una parte diferente del encuadre y ser consistente con ese ángulo."
      : "Importante: posicionar a cada Host en una parte diferente del escenario, y ser consistente con ese ángulo.",
    educational
      ? "Importante: en la escena solo debe aparecer el personaje correspondiente al plano."
      : "Importante: en la escena solo debe aparecer el locutor o host correspondiente al track.",
    `Bloqueo corporal obligatorio: ${eyelineDirection.bodyAngle}.`,
    `Eyeline obligatorio: ${eyelineDirection.gaze}.`,
    `Ángulo de cámara sugerido: ${eyelineDirection.cameraAngle}.`,
    isReel
      ? "Directiva frontal de YouTuber: postura enérgica orientada al frente, mirando directamente a la cámara. Expresarse dinámicamente con manos y gestos entusiastas."
      : "Evitar pose frontal de presentador y evitar contacto visual directo con la cámara.",
    "Mostrar un solo locutor claramente identificable en cuadro.",
    "Composición obligatoria de sujeto único: foreground y background limpios de personas.",
    isReel
      ? "La cámara es el interlocutor principal; el presentador habla directamente al espectador a través del lente."
      : "La cámara nunca debe convertirse en el interlocutor principal; mantener la atención del locutor en la conversación.",
    isReel
      ? "Encuadre vertical (9:16), plano medio corto (MCU) o primer plano del presentador centrado, fondo de estudio estético y moderno, profundidad de campo ligera."
      : "Encuadre medio corto, cámara a la altura de los ojos, fondo elegante, profundidad de campo ligera.",
    `La puesta en escena debe acompañar una actitud ${expression}.`,
    "Mantener continuidad visual entre escenas: misma cabina, mismo set, misma dirección de luz, mismo estilo de vestuario.",
  ];
  if (singleSubjectOnly) {
    lines.push(
      "Retrato de sujeto único estricto: no agregar ninguna otra persona en el escenario.",
      "Prohibido segunda figura humana visible o parcial: no espalda, no hombro, no cabeza desenfocada, no perfil, no reflejo, no sombra humana.",
      isReel
        ? "La imagen debe parecer un retrato vertical de alta calidad de un youtuber/creador de contenido de redes sociales posando al frente."
        : (educational
          ? "La imagen debe parecer un retrato editorial limpio del personaje activo dentro del set educativo."
          : "La imagen debe parecer un retrato editorial limpio del locutor activo dentro del set.")
    );
  } else {
    lines.push(
      isReel
        ? "La escena debe sentirse como un creador de contenido dinámico (YouTuber) explicando un tema directamente a su audiencia."
        : (educational
          ? "La escena debe sentirse como explicación didáctica; el personaje atiende al contenido o a un recurso visual, no al espectador."
          : "La escena debe sentirse como conversación entre locutores; el personaje atiende al interlocutor, no al espectador."),
      counterpartSpeakerName
        ? (isReel
          ? "Aunque haya otros personajes, cada escena de reel muestra únicamente al youtuber centrado en su propio encuadre, interactuando con la audiencia."
          : (educational
            ? `La mirada debe sugerir atención a un recurso o co-presentador fuera de cuadro, sin frontalidad directa.`
            : `La mirada debe sugerir escucha activa hacia ${counterpartSpeakerName}, pero siempre con el interlocutor completamente fuera de cuadro.`))
        : "",
      isReel
        ? "Priorizar gestos expresivos con las manos, actitud entusiasta y contacto visual directo con la lente."
        : (educational
          ? "Priorizar miradas laterales, reacción didáctica y microgestos que ayuden a explicar el contenido."
          : "Priorizar miradas laterales, reacción conversacional y microgestos que indiquen escucha activa entre locutores.")
    );
  }
  return lines.filter(Boolean).join(" ");
}

async function loadOptionalImageReference({ storagePath = "", url = "", dataUrl = "" }) {
  const cleanStoragePath = clampText(storagePath || "", 700);
  const rawUrl = clampText(url || "", 3200);
  const cleanUrl = rawUrl.includes("%25") ? clampText(decodeURIComponent(rawUrl), 3200) : rawUrl;
  const cleanDataUrl = String(dataUrl || "").trim();
  let buffer = null;
  let mimeType = "image/png";
  if (cleanDataUrl.startsWith("data:image/")) {
    try {
      const decoded = decodeBase64DataUrl(cleanDataUrl, MAX_SPEAKER_PORTRAIT_BYTES);
      buffer = Buffer.from(decoded.buffer);
      mimeType = String(decoded.mimeType || "image/png").trim().toLowerCase();
    } catch (_) {
      buffer = null;
    }
  }
  if (cleanStoragePath) {
    try {
      const file = storageBucket.file(cleanStoragePath);
      const [meta] = await withRetry(() => file.getMetadata()).catch(() => [{}]);
      const [downloaded] = await withRetry(() => file.download());
      buffer = Buffer.from(downloaded);
      mimeType = String(meta?.contentType || "image/png").trim().toLowerCase();
    } catch (_) {
      buffer = null;
    }
  }
  if (!buffer && cleanUrl) {
    const response = await fetchCompat(cleanUrl, { method: "GET" }).catch(() => null);
    if (response?.ok) {
      mimeType = String(response.headers.get("content-type") || "image/png").trim().toLowerCase();
      buffer = Buffer.from(await response.arrayBuffer());
    }
  }
  if (!buffer || !buffer.length || !String(mimeType || "").startsWith("image/")) return null;
  return { buffer, mimeType };
}

async function loadScenarioReferenceFromSession({ uid = "", sessionId = "", scenarioId = "" }) {
  const cleanSessionId = clampText(sessionId || "", 140);
  const cleanScenarioId = clampText(scenarioId || "", 80);
  if (!cleanSessionId) return null;
  try {
    const snap = await db.collection("podcaster_sessions").doc(cleanSessionId).get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    const ownerId = String(data.ownerId || "").trim();
    const sharedWithIds = Array.isArray(data.sharedWithIds) ? data.sharedWithIds.map((item) => String(item || "").trim()) : [];
    if (uid && ownerId && ownerId !== uid && !sharedWithIds.includes(uid)) return null;
    const session = data.session && typeof data.session === "object" ? data.session : null;
    const deck = session?.globalScenarioDeck && typeof session.globalScenarioDeck === "object" ? session.globalScenarioDeck : null;
    const items = Array.isArray(deck?.items) ? deck.items : [];
    const activeId = clampText(deck?.activeId || "", 80);
    const match = items.find((item) => {
      const itemId = clampText(item?.id || "", 80);
      if (cleanScenarioId) return itemId === cleanScenarioId;
      return itemId === activeId;
    }) || null;
    if (!match) return null;
    return loadOptionalImageReference({
      storagePath: clampText(match?.storagePath || "", 700),
      url: clampText(match?.downloadUrl || "", 3200)
    });
  } catch (_) {
    return null;
  }
}

function parseWavDurationSeconds(buffer = null) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 44) return 0;
  const riff = buffer.toString("ascii", 0, 4);
  const wave = buffer.toString("ascii", 8, 12);
  if (riff !== "RIFF" || wave !== "WAVE") return 0;
  const byteRate = buffer.readUInt32LE(28);
  if (!byteRate) return 0;
  let offset = 12;
  let dataSize = 0;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === "data") {
      dataSize = chunkSize;
      break;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  const usableSize = dataSize > 0 ? Math.min(dataSize, Math.max(0, buffer.length - (offset + 8))) : Math.max(0, buffer.length - 44);
  if (!usableSize) return 0;
  return usableSize / byteRate;
}

function normalizeStorageSegment(value = "", fallback = "item") {
  const clean = String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return clean || fallback;
}

function normalizeRole(value = "") {
  const clean = String(value || "").trim().toLowerCase();
  if (clean === "assistant" || clean === "user" || clean === "system") return clean;
  return "assistant";
}

function sanitizePodcasterSession(raw = {}) {
  const disfluencyDefaults = {
    enabled: false,
    fillerLevel: 20,
    errorLevel: 10,
    stutterEnabled: false,
    stutterLevel: 18
  };
  const disfluencyMax = {
    fillerLevel: 300,
    errorLevel: 300,
    stutterLevel: 100
  };
  const normalizeDisfluency = (input = {}) => ({
    enabled: input?.enabled === true,
    fillerLevel: Math.max(0, Math.min(disfluencyMax.fillerLevel, Number(input?.fillerLevel ?? disfluencyDefaults.fillerLevel) || disfluencyDefaults.fillerLevel)),
    errorLevel: Math.max(0, Math.min(disfluencyMax.errorLevel, Number(input?.errorLevel ?? disfluencyDefaults.errorLevel) || disfluencyDefaults.errorLevel)),
    stutterEnabled: input?.stutterEnabled === true,
    stutterLevel: Math.max(0, Math.min(disfluencyMax.stutterLevel, Number(input?.stutterLevel ?? disfluencyDefaults.stutterLevel) || disfluencyDefaults.stutterLevel))
  });
  const normalizeProposalList = (list = []) => Array.from(new Set(
    (Array.isArray(list) ? list : [])
      .map((entry) => clampText(entry || "", 5000))
      .filter(Boolean)
  )).slice(0, 80);
  const rowsInput = Array.isArray(raw?.script?.rows) ? raw.script.rows : [];
  const rows = rowsInput.slice(0, 400).map((row, index) => {
    const nextRow = { ...row };
    
    // Asegurar campos canónicos con sanitización y fallbacks
    nextRow.id = clampText(row?.id || `row_${index + 1}`, 80) || `row_${index + 1}`;
    nextRow.speaker = clampText(row?.speaker || "Host A", 80) || "Host A";
    nextRow.expression = clampText(row?.expression || "Neutral", 80) || "Neutral";
    nextRow.durationSec = Math.max(6, Math.min(180, Number(row?.durationSec) || 18));
    nextRow.mediaCue = clampText(row?.mediaCue || "Sin media", 80) || "Sin media";
    nextRow.text = clampText(row?.text || row?.Guion || row?.guion || row?.guión || row?.voiceOverText || "", 12000);
    nextRow.voiceOverText = clampText(row?.voiceOverText || row?.text || row?.Guion || row?.guion || row?.guión || "", 12000);
    nextRow.sceneDescription = clampText(row?.sceneDescription || row?.description || row?.Descripción || row?.scenePrompt || "", 5000);
    nextRow.onScreenText = clampText(row?.onScreenText || row?.["Texto en pantalla"] || row?.["Texto en Pantalla"] || "", 1600);
    nextRow.visualNotes = clampText(row?.visualNotes || row?.visualElement || row?.["Elemento visual"] || row?.["Elemento Visual"] || "", 5000);
    nextRow.visualNotesProposal = clampText(row?.visualNotesProposal || "", 5000);
    nextRow.visualNotesProposals = normalizeProposalList(row?.visualNotesProposals);
    nextRow.visualNotesResolvedProposals = normalizeProposalList(row?.visualNotesResolvedProposals);
    
    // Sanitizar otros campos conocidos si existen
    if (nextRow.notes) nextRow.notes = clampText(nextRow.notes, 5000);
    if (nextRow.transition) nextRow.transition = clampText(nextRow.transition, 1200);
    if (nextRow.videoDirective) nextRow.videoDirective = clampText(nextRow.videoDirective, 1400);
    if (nextRow.scenePrompt) nextRow.scenePrompt = clampText(nextRow.scenePrompt, 1200);

    return nextRow;
  });
  const hosts = Array.isArray(raw?.script?.hosts)
    ? raw.script.hosts.slice(0, 10).map((host) => clampText(host, 80)).filter(Boolean)
    : [];
  const scriptVideoMode = raw?.script?.videoMode === true;
  const rowIdSet = new Set(rows.map((row) => String(row?.id || "").trim()).filter(Boolean));
  const chat = Array.isArray(raw?.chat)
    ? raw.chat.slice(-220).map((msg, index) => ({
        id: clampText(msg?.id || `msg_${index + 1}`, 80) || `msg_${index + 1}`,
        role: normalizeRole(msg?.role || "assistant"),
        text: clampText(msg?.text || "", 10000)
      }))
    : [];
  const speakerPortraitMapRaw = raw?.speakerPortraitMap && typeof raw.speakerPortraitMap === "object"
    ? raw.speakerPortraitMap
    : {};
  const speakerPortraitMap = {};
  Object.entries(speakerPortraitMapRaw).slice(0, 20).forEach(([speaker, portrait]) => {
    const key = clampText(speaker, 80);
    if (!key || !portrait || typeof portrait !== "object") return;
    const downloadUrl = clampText(portrait?.downloadUrl || "", 3000);
    const storagePath = clampText(portrait?.storagePath || "", 500);
    if (!downloadUrl && !storagePath) return;
    speakerPortraitMap[key] = {
      speaker: key,
      downloadUrl,
      storagePath,
      scenarioPrompt: clampText(portrait?.scenarioPrompt || "", 2400),
      scenarioId: clampText(portrait?.scenarioId || "", 80),
      scenarioImageUrl: clampText(portrait?.scenarioImageUrl || "", 3200),
      scenarioImageStoragePath: clampText(portrait?.scenarioImageStoragePath || "", 700),
      mimeType: clampText(portrait?.mimeType || "image/png", 120) || "image/png",
      updatedAt: clampText(portrait?.updatedAt || new Date().toISOString(), 64) || new Date().toISOString(),
      model: clampText(portrait?.model || DEFAULT_PODCASTER_IMAGE_MODEL, 140) || DEFAULT_PODCASTER_IMAGE_MODEL,
      promptVersion: clampText(portrait?.promptVersion || "podcaster_v1", 80) || "podcaster_v1"
    };
  });

  const sanitizeReferenceImageRecord = (value = null, fallbackName = "Referencia") => {
    if (!value || typeof value !== "object") return null;
    const dataUrl = clampText(String(value?.dataUrl || "").trim(), 900_000);
    const mediaRef = normalizePersistedMediaReference(
      clampText(String(value?.downloadUrl || value?.url || value?.dataUrl || "").trim(), 3000),
      clampText(String(value?.storagePath || value?.path || "").trim(), 700)
    );
    const downloadUrl = clampText(mediaRef.downloadUrl || "", 3000);
    const storagePath = clampText(mediaRef.storagePath || "", 700);
    const mimeType = clampText(value?.mimeType || "image/png", 120).trim().toLowerCase() || "image/png";
    const explicitType = String(value?.type || value?.mediaKind || "").trim().toLowerCase();
    const combinedSource = `${downloadUrl} ${storagePath}`.toLowerCase();
    const looksLikeImage = mimeType.startsWith("image/")
      || explicitType === "image"
      || /\.(png|jpe?g|webp|gif)(\?|$|\s)/i.test(combinedSource);
    if (!dataUrl.startsWith("data:image/") && !downloadUrl && !storagePath) return null;
    if (!looksLikeImage) return null;
    return {
      name: clampText(value?.name || fallbackName, 180) || fallbackName,
      dataUrl: dataUrl.startsWith("data:image/") ? dataUrl : "",
      downloadUrl,
      storagePath,
      mimeType,
      type: "image",
      updatedAt: clampText(value?.updatedAt || new Date().toISOString(), 64) || new Date().toISOString()
    };
  };

  const sanitizeReferenceImageMap = (rawMap = {}, maxEntries = 120) => {
    const source = rawMap && typeof rawMap === "object" ? rawMap : {};
    const next = {};
    Object.entries(source).slice(0, maxEntries).forEach(([rawKey, value]) => {
      const key = clampText(rawKey || "", 160);
      const normalized = sanitizeReferenceImageRecord(value, "Referencia");
      if (!key || !normalized) return;
      next[key] = normalized;
    });
    return next;
  };

  const speakerReferenceImageMap = sanitizeReferenceImageMap(raw?.speakerReferenceImageMap || {}, 40);
  const scenarioReferenceImageMap = sanitizeReferenceImageMap(raw?.scenarioReferenceImageMap || {}, 120);
  const sanitizeReferenceImageListMap = (rawMap = {}, maxEntries = 500, maxItemsPerEntry = 12) => {
    const source = rawMap && typeof rawMap === "object" ? rawMap : {};
    const next = {};
    Object.entries(source).slice(0, maxEntries).forEach(([rawKey, value]) => {
      const key = clampText(rawKey || "", 160);
      const list = Array.isArray(value) ? value : [];
      if (!key || !list.length) return;
      const normalizedList = list
        .slice(0, maxItemsPerEntry)
        .map((item) => sanitizeReferenceImageRecord(item, "Referencia"))
        .filter(Boolean);
      if (normalizedList.length) next[key] = normalizedList;
    });
    return next;
  };
  const rowReferenceImageListMap = sanitizeReferenceImageListMap(raw?.rowReferenceImageListMap || {}, 500, 12);
  const rowReferenceImageMap = sanitizeReferenceImageMap(raw?.rowReferenceImageMap || {}, 500);
  Object.entries(rowReferenceImageMap).forEach(([key, value]) => {
    if (!rowReferenceImageListMap[key] && value) rowReferenceImageListMap[key] = [value];
  });
  const sanitizeReferenceVideoMap = (rawMap = {}, maxEntries = 500) => {
    const source = rawMap && typeof rawMap === "object" ? rawMap : {};
    const next = {};
    Object.entries(source).slice(0, maxEntries).forEach(([rawKey, value]) => {
      const key = clampText(rawKey || "", 160);
      if (!key || !value || typeof value !== "object") return;
      const dataUrl = clampText(String(value?.dataUrl || "").trim(), 8_000_000);
      const mediaRef = normalizePersistedMediaReference(
        clampText(String(value?.downloadUrl || value?.url || value?.dataUrl || "").trim(), 3000),
        clampText(String(value?.storagePath || value?.path || "").trim(), 700)
      );
      const downloadUrl = clampText(mediaRef.downloadUrl || "", 3000);
      const storagePath = clampText(mediaRef.storagePath || "", 700);
      const mimeType = clampText(value?.mimeType || "video/mp4", 120).trim().toLowerCase() || "video/mp4";
      const explicitType = String(value?.type || value?.mediaKind || "").trim().toLowerCase();
      if (!dataUrl.startsWith("data:video/") && !downloadUrl && !storagePath) return;
      if (mimeType.startsWith("image/") || explicitType === "image") return;
      next[key] = {
        name: clampText(value?.name || "Referencia de video", 180) || "Referencia de video",
        dataUrl,
        downloadUrl,
        storagePath,
        mimeType,
        type: explicitType || "video",
        updatedAt: clampText(value?.updatedAt || new Date().toISOString(), 64) || new Date().toISOString()
      };
    });
    return next;
  };
  const rowReferenceVideoMap = sanitizeReferenceVideoMap(raw?.rowReferenceVideoMap || {}, 500);
  const rowReferenceModeByRowId = {};
  Object.entries(raw?.rowReferenceModeByRowId && typeof raw.rowReferenceModeByRowId === "object" ? raw.rowReferenceModeByRowId : {}).slice(0, 500).forEach(([rawKey, value]) => {
    const key = clampText(rawKey || "", 160);
    const mode = String(value || "").trim().toLowerCase() === "video" ? "video" : "image";
    if (mode === "video" && rowReferenceVideoMap[key]) rowReferenceModeByRowId[key] = "video";
    else if (mode === "image" && (rowReferenceImageMap[key] || rowReferenceImageListMap[key]?.length)) rowReferenceModeByRowId[key] = "image";
  });
  const dialogueVideoMapRaw = raw?.dialogueVideoMap && typeof raw.dialogueVideoMap === "object"
    ? raw.dialogueVideoMap
    : {};
  const dialogueVideoMap = {};
  const mediaSourceKeys = [
    "downloadUrl",
    "videoDownloadUrl",
    "videoUrl",
    "url",
    "dataUrl",
    "localDataUrl",
    "publicSceneVideoUrl",
    "publicSceneThumbUrl",
    "thumbUrl",
    "thumbnailUrl",
    "imageUrl",
    "sceneImageUrl"
  ];
  const storageSourceKeys = [
    "storagePath",
    "videoStoragePath",
    "path",
    "publicSceneVideoStoragePath",
    "publicSceneThumbStoragePath",
    "thumbStoragePath",
    "thumbnailStoragePath",
    "imageStoragePath",
    "sceneImageStoragePath"
  ];
  Object.entries(dialogueVideoMapRaw).slice(0, 800).forEach(([rowId, clip]) => {
    const key = clampText(rowId, 120);
    if (!key || !clip || typeof clip !== "object") return;
    const mediaRef = normalizePersistedMediaReference({
      downloadUrl: clampText(mediaSourceKeys.map((k) => clip?.[k] || "").find(Boolean) || "", 3000),
      storagePath: clampText(storageSourceKeys.map((k) => clip?.[k] || "").find(Boolean) || "", 700)
    });
    const downloadUrl = clampText(mediaRef.downloadUrl || "", 3000);
    const storagePath = clampText(mediaRef.storagePath || "", 700);
    const dataUrl = clampText(clip?.dataUrl || clip?.localDataUrl || "", 8_000_000);
    if (!storagePath && !downloadUrl && !dataUrl) return;
    const segmentsRaw = Array.isArray(clip?.segments) ? clip.segments : [];
    const segments = segmentsRaw.slice(0, 16).map((segment, idx) => {
      const segmentRef = normalizePersistedMediaReference({
        downloadUrl: clampText(mediaSourceKeys.map((k) => segment?.[k] || "").find(Boolean) || "", 3000),
        storagePath: clampText(storageSourceKeys.map((k) => segment?.[k] || "").find(Boolean) || "", 700)
      });
      const segUrl = clampText(segmentRef.downloadUrl || "", 3000);
      const segPath = clampText(segmentRef.storagePath || "", 700);
      if (!segPath && !segUrl) return null;
      const segMimeType = String(segment?.mimeType || "").trim().toLowerCase();
      const segType = String(segment?.type || segment?.mediaKind || "").trim().toLowerCase();
      return {
        id: clampText(segment?.id || `${key}-seg-${idx + 1}`, 120) || `${key}-seg-${idx + 1}`,
        index: Math.max(0, Number(segment?.index) || idx),
        durationSec: clampNumber(segment?.durationSec, 0, 8, 0),
        downloadUrl: segUrl,
        storagePath: segPath,
        mimeType: clampText(segMimeType || (segType === "image" ? "image/jpeg" : "video/mp4"), 120) || "video/mp4",
        variant: clampText(segment?.variant || "", 120),
        targetSpeechLine: clampText(segment?.targetSpeechLine || "", 2200)
      };
    }).filter(Boolean);
    const clipMimeType = String(clip?.mimeType || "").trim().toLowerCase();
    const clipType = String(clip?.type || clip?.mediaKind || "").trim().toLowerCase();
    const normalizedType = clipType === "image"
      ? "image"
      : (clipType === "video" ? "video" : (clipMimeType.startsWith("image/") ? "image" : "video"));
    dialogueVideoMap[key] = {
      rowId: key,
      speaker: clampText(clip?.speaker || "", 80),
      mimeType: clampText(clipMimeType || (clipType === "image" ? "image/jpeg" : "video/mp4"), 120) || "video/mp4",
      type: normalizedType,
      model: clampText(clip?.model || DEFAULT_PODCASTER_VIDEO_MODEL, 140) || DEFAULT_PODCASTER_VIDEO_MODEL,
      promptVersion: clampText(clip?.promptVersion || "podcaster_veo_v1", 80) || "podcaster_veo_v1",
      videoDirective: clampText(clip?.videoDirective || "", 1400),
      scenePrompt: clampText(clip?.scenePrompt || "", 1200),
      imagePrompts: Array.isArray(clip?.imagePrompts)
        ? clip.imagePrompts.slice(0, 3).map((prompt) => clampText(prompt || "", 1200)).filter(Boolean)
        : String(clip?.imagePrompts || "")
          .split(/\n+/)
          .map((prompt) => clampText(prompt || "", 1200))
          .filter(Boolean)
          .slice(0, 3),
      durationSec: clampNumber(clip?.durationSec, 0, 240, 0),
      targetSpeechLine: clampText(clip?.targetSpeechLine || "", 2200),
      segments,
      updatedAt: clampText(clip?.updatedAt || new Date().toISOString(), 64) || new Date().toISOString(),
      downloadUrl,
      storagePath,
      publicSceneLibraryId: clampText(clip?.publicSceneLibraryId || "", 140),
      publicScenePublishedAt: clampText(clip?.publicScenePublishedAt || "", 64),
      publicSceneTitle: clampText(clip?.publicSceneTitle || "", 220),
      publicSceneThumbUrl: clampText(clip?.publicSceneThumbUrl || "", 3000),
      publicSceneVideoUrl: clampText(clip?.publicSceneVideoUrl || "", 3000),
      dataUrl,
      localDataUrl: dataUrl
    };
  });
  const dialogueAudioMapRaw = raw?.dialogueAudioMap && typeof raw.dialogueAudioMap === "object"
    ? raw.dialogueAudioMap
    : {};
  const dialogueAudioMap = {};
  Object.entries(dialogueAudioMapRaw).slice(0, 800).forEach(([rowId, clip]) => {
    const key = clampText(rowId, 120);
    if (!key || !clip || typeof clip !== "object") return;
    const mediaRef = normalizePersistedMediaReference({
      downloadUrl: clampText(clip?.downloadUrl || "", 3000),
      storagePath: clampText(clip?.storagePath || "", 700)
    });
    const downloadUrl = clampText(mediaRef.downloadUrl || "", 3000);
    const storagePath = clampText(mediaRef.storagePath || "", 700);
    const hasTimingMetadata = Array.isArray(clip?.wordTimings)
      || Array.isArray(clip?.alignment)
      || Array.isArray(clip?.alignment?.words)
      || Array.isArray(clip?.words)
      || Number.isFinite(Number(clip?.durationSec))
      || Number.isFinite(Number(clip?.durationMs));
    if (!storagePath && !downloadUrl && !hasTimingMetadata) return;
    dialogueAudioMap[key] = {
      rowId: key,
      speaker: clampText(clip?.speaker || "", 80),
      mimeType: clampText(clip?.mimeType || "audio/wav", 120) || "audio/wav",
      model: clampText(clip?.model || "gemini-3.1-flash-tts-preview", 140) || "gemini-3.1-flash-tts-preview",
      promptVersion: clampText(clip?.promptVersion || "podcaster_live_audio_v1", 80) || "podcaster_live_audio_v1",
      durationSec: clampNumber(clip?.durationSec, 0, 180, 0),
      playbackRate: Math.max(0.5, Math.min(10, Number(clip?.playbackRate || 1) || 1)),
      targetSpeechLine: clampText(clip?.targetSpeechLine || "", 2200),
      // wordTimings: normalizeDialogueAudioWordTimings(clip?.wordTimings || clip?.alignment || [])
      wordTimings: normalizeDialogueAudioWordTimings(
        clip?.wordTimings || clip?.alignment || [],
        clampText(clip?.targetSpeechLine || "", 2200),
        clampNumber(clip?.durationSec, 0, 180, 0)
      ),
      updatedAt: clampText(clip?.updatedAt || new Date().toISOString(), 64) || new Date().toISOString(),
      downloadUrl,
      storagePath
    };
  });
  const transitionsRaw = raw?.podcastVideoConfig?.transitionsByEdge && typeof raw.podcastVideoConfig.transitionsByEdge === "object"
    ? raw.podcastVideoConfig.transitionsByEdge
    : {};
  const transitionsByEdge = {};
  Object.entries(transitionsRaw).slice(0, 1200).forEach(([edgeKey, item]) => {
    const key = clampText(edgeKey, 200);
    if (!key || !item || typeof item !== "object") return;
    const transitionType = String(item.type || "cut").trim().toLowerCase();
    transitionsByEdge[key] = {
      type: [
        "cut",
        "crossfade",
        "dip-black",
        "flash-white",
        "slide-left",
        "slide-right",
        "slide-up",
        "slide-down",
        "zoom-in",
        "zoom-out",
        "blur"
      ].includes(transitionType) ? transitionType : "cut",
      durationMs: Math.max(0, Math.min(1200, Number(item.durationMs) || 0))
    };
  });
  const sanitizeTimelineTracks = (tracksRaw = []) => {
    if (!Array.isArray(tracksRaw)) return [];
    const next = [];
    const seen = new Set();
    tracksRaw.slice(0, 40).forEach((track, index) => {
      if (!track || typeof track !== "object") return;
      const id = clampText(track?.id || "", 160);
      if (!id || seen.has(id)) return;
      seen.add(id);
      const fallbackLabel = `Track ${index + 1}`;
      const label = clampText(track?.label || fallbackLabel, 120) || fallbackLabel;
      next.push({
        id,
        label,
        order: Math.max(0, Math.min(40, Math.round(Number(track?.order ?? index) || index)))
      });
    });
    next.sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || String(a.id || "").localeCompare(String(b.id || "")));
    return next.map((item, index) => ({ ...item, order: index }));
  };
  const sanitizeTimelineTrackHeightsById = (rawHeights = {}) => {
    const source = rawHeights && typeof rawHeights === "object" ? rawHeights : {};
    const next = {};
    Object.entries(source).slice(0, 60).forEach(([trackId, value]) => {
      const id = clampText(trackId || "", 160);
      if (!id) return;
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return;
      next[id] = Math.round(Math.max(56, Math.min(520, numeric)));
    });
    return next;
  };
  const normalizeSceneVolumeOverridePct = (value) => {
    if (value == null || value === "") return null;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return Math.max(0, Math.min(100, Math.round(numeric)));
  };
  const sanitizeTimelineClipsByRowId = (rawClips = {}) => {
    const source = rawClips && typeof rawClips === "object" ? rawClips : {};
    const next = {};
    Object.entries(source).slice(0, 900).forEach(([rowIdRaw, clip]) => {
      const rowId = clampText(rowIdRaw || clip?.rowId || "", 120);
      if (!rowId || !clip || typeof clip !== "object") return;
      const sourceDurationMs = Math.max(500, Math.min(1800 * 1000, Math.round(Number(clip?.sourceDurationMs) || 8000)));
      const trimInMs = Math.max(0, Math.min(sourceDurationMs - 500, Math.round(Number(clip?.trimInMs) || 0)));
      const fallbackTrimOut = sourceDurationMs;
      const trimOutMs = Math.max(
        trimInMs + 500,
        Math.min(sourceDurationMs, Math.round(Number(clip?.trimOutMs) || fallbackTrimOut))
      );
      const startMs = Math.max(0, Math.min(3600 * 1000, Math.round(Number(clip?.startMs) || 0)));
      const zIndex = Math.max(1, Math.min(999, Math.round(Number(clip?.zIndex) || 1)));
      next[rowId] = {
        rowId,
        speakerKey: clampText(clip?.speakerKey || "", 120),
        trackId: clampText(clip?.trackId || "", 160),
        startMs,
        sourceDurationMs,
        trimInMs,
        trimOutMs,
        veoVolumeOverridePct: normalizeSceneVolumeOverridePct(
          clip?.veoVolumeOverridePct != null ? clip.veoVolumeOverridePct : clip?.veoVolumePct
        ),
        geminiVolumeOverridePct: normalizeSceneVolumeOverridePct(
          clip?.geminiVolumeOverridePct != null ? clip.geminiVolumeOverridePct : clip?.geminiVolumePct
        ),
        visualLayoutMode: String(clip?.visualLayoutMode || "").trim().toLowerCase() === "blur-backdrop"
          ? "blur-backdrop"
          : "default",
        zIndex
      };
    });
    return next;
  };
  const sanitizeOnScreenTextTrack = (trackRaw = {}) => ({
    enabled: trackRaw?.enabled !== false,
    showTrack: trackRaw?.showTrack !== false,
    fontFamily: clampText(trackRaw?.fontFamily || "unbounded", 80) || "unbounded",
    fontSizePx: clampNumber(trackRaw?.fontSizePx, 16, 96, 44),
    stylePreset: clampText(trackRaw?.stylePreset || "3d", 40) || "3d",
    fontWeight: clampText(trackRaw?.fontWeight || "bold", 24) || "bold",
    fontStyle: clampText(trackRaw?.fontStyle || "normal", 24) || "normal",
    textAlign: clampText(trackRaw?.textAlign || "center", 24) || "center",
    textColor: clampText(trackRaw?.textColor || "#FFFFFF", 24) || "#FFFFFF",
    strokeColor: clampText(trackRaw?.strokeColor || "#0f172a", 24) || "#0f172a",
    strokeWidthPx: clampNumber(trackRaw?.strokeWidthPx, 0, 12, 2),
    textOpacity: clampNumber(trackRaw?.textOpacity, 0, 1, 1),
    bgPreset: clampText(trackRaw?.bgPreset || "glass-dark", 40) || "glass-dark",
    bgOpacity: clampNumber(trackRaw?.bgOpacity, 0, 1, 0.72),
    bgScale: clampNumber(trackRaw?.bgScale, 0.6, 2.5, 1),
    shadowEnabled: trackRaw?.shadowEnabled !== false,
    shadowBlurPx: clampNumber(trackRaw?.shadowBlurPx, 0, 80, 18),
    shadowOffsetXPx: clampNumber(trackRaw?.shadowOffsetXPx, -80, 80, 0),
    shadowOffsetYPx: clampNumber(trackRaw?.shadowOffsetYPx, -80, 80, 8),
    shadowOpacity: clampNumber(trackRaw?.shadowOpacity, 0, 1, 0.48),
    boxWidthPct: clampNumber(trackRaw?.boxWidthPct, 0.22, 0.92, 0.58),
    overlayXPct: clampNumber(trackRaw?.overlayXPct, 0, 1, 0.5),
    overlayYPct: clampNumber(trackRaw?.overlayYPct, 0, 1, 0.82)
  });
  const sanitizeOnScreenTextClipsByRowId = (rawClips = {}) => {
    const source = rawClips && typeof rawClips === "object" ? rawClips : {};
    const next = {};
    Object.entries(source).slice(0, 900).forEach(([rowIdRaw, clip]) => {
      const rowId = clampText(rowIdRaw || clip?.rowId || "", 120);
      if (!rowId || !clip || typeof clip !== "object") return;
      const sourceDurationMs = Math.max(500, Math.min(1800 * 1000, Math.round(Number(clip?.sourceDurationMs) || 8000)));
      const trimInMs = Math.max(0, Math.min(sourceDurationMs - 500, Math.round(Number(clip?.trimInMs) || 0)));
      const trimOutMs = Math.max(
        trimInMs + 500,
        Math.min(sourceDurationMs, Math.round(Number(clip?.trimOutMs) || sourceDurationMs))
      );
      next[rowId] = {
        rowId,
        startMs: Math.max(0, Math.min(3600 * 1000, Math.round(Number(clip?.startMs) || 0))),
        sourceDurationMs,
        trimInMs,
        trimOutMs,
        hidden: clip?.hidden === true,
        autoHidden: clip?.autoHidden === true,
        zIndex: Math.max(1, Math.min(999, Math.round(Number(clip?.zIndex) || 1)))
      };
    });
    return next;
  };
  const sanitizeOnScreenTextLayoutByRowId = (rawLayouts = {}) => {
    const source = rawLayouts && typeof rawLayouts === "object" ? rawLayouts : {};
    const next = {};
    Object.entries(source).slice(0, 900).forEach(([rowIdRaw, layout]) => {
      const rowId = clampText(rowIdRaw || layout?.rowId || "", 120);
      if (!rowId || !layout || typeof layout !== "object") return;
      next[rowId] = {
        rowId,
        xPct: clampNumber(layout?.xPct, 0, 0.98, 0.31),
        yPct: clampNumber(layout?.yPct, 0, 0.98, 0.72),
        widthPct: clampNumber(layout?.widthPct, 0.08, 0.9, 0.38),
        heightPct: clampNumber(layout?.heightPct, 0.05, 0.6, 0.14),
        zIndex: Math.max(1, Math.min(999, Math.round(Number(layout?.zIndex) || 1)))
      };
    });
    return next;
  };
  const sanitizeGeminiDialogueTrack = (rawTrack = {}) => {
    const segments = Array.isArray(rawTrack?.segments)
      ? rawTrack.segments.slice(0, 900).map((segment, index) => {
          if (!segment || typeof segment !== "object") return null;
          const rowId = clampText(segment?.rowId || "", 120);
          const audioSrc = clampText(segment?.audioSrc || "", 3200);
          if (!rowId || !audioSrc) return null;
          const startMs = Math.max(0, Math.min(3600 * 1000, Math.round(Number(segment?.startMs) || 0)));
          const trimInMs = Math.max(0, Math.round(Number(segment?.trimInMs) || 0));
          const trimOutMs = Math.max(trimInMs + 500, Math.round(Number(segment?.trimOutMs) || trimInMs + 500));
          const durationMs = Math.max(500, Math.round(Number(segment?.durationMs) || (trimOutMs - trimInMs)));
          return {
            rowId,
            sceneIndex: Math.max(1, Math.min(999, Math.round(Number(segment?.sceneIndex) || index + 1))),
            speakerName: clampText(segment?.speakerName || "", 160),
            audioSrc,
            startMs,
            anchorStartMs: Math.max(0, Math.min(3600 * 1000, Math.round(Number(segment?.anchorStartMs) || startMs))),
            endMs: Math.max(startMs + 500, Math.min(3600 * 1000, Math.round(Number(segment?.endMs) || (startMs + durationMs)))),
            trimInMs,
            trimOutMs,
            durationMs
          };
        }).filter(Boolean)
      : [];
    return {
      enabled: rawTrack?.enabled === true && segments.length > 0,
      updatedAt: clampText(rawTrack?.updatedAt || "", 64),
      segments,
      missingRowIds: Array.isArray(rawTrack?.missingRowIds)
        ? Array.from(new Set(rawTrack.missingRowIds.map((rowId) => clampText(rowId || "", 120)).filter(Boolean))).slice(0, 900)
        : []
    };
  };
  const audioModeRaw = String(raw?.podcastVideoConfig?.audioMode || "").trim().toLowerCase();
  const timelineViewModeRaw = String(raw?.podcastVideoConfig?.timelineViewMode || "").trim().toLowerCase();
  const rawStudioUiState = raw?.podcastStudioUiState && typeof raw.podcastStudioUiState === "object"
    ? raw.podcastStudioUiState
    : {};
  const podcastStudioUiState = {
    inspectorCollapsed: rawStudioUiState?.inspectorCollapsed === true,
    inspectorWidthPx: clampNumber(rawStudioUiState?.inspectorWidthPx, 280, 960, 420),
    stageWidthRatio: rawStudioUiState?.stageWidthRatio === null
      ? null
      : clampNumber(rawStudioUiState?.stageWidthRatio, 0.1, 1, 1),
    timelineViewMode: String(rawStudioUiState?.timelineViewMode || "").trim().toLowerCase() === "normal" ? "normal" : "tracks",
    showMontageAudioSubtracks: rawStudioUiState?.showMontageAudioSubtracks === true,
    lastActiveRowId: rowIdSet.has(String(rawStudioUiState?.lastActiveRowId || "").trim())
      ? String(rawStudioUiState?.lastActiveRowId || "").trim()
      : "",
    collapsedRowIds: Array.isArray(rawStudioUiState?.collapsedRowIds)
      ? Array.from(new Set(
        rawStudioUiState.collapsedRowIds
          .map((rowId) => clampText(rowId || "", 120))
          .filter((rowId) => rowIdSet.has(String(rowId || "").trim()))
      )).slice(0, 400)
      : [],
    composerGenerationMode: String(rawStudioUiState?.composerGenerationMode || "").trim().toLowerCase() === "video" ? "video" : "script"
  };
  const podcastVideoConfig = {
    enabled: raw?.podcastVideoConfig?.enabled === true,
    editorEnabled: raw?.podcastVideoConfig?.editorEnabled === true,
    autoGenerateScenarioImages: raw?.podcastVideoConfig?.autoGenerateScenarioImages === true,
    autoGeneratePortraits: raw?.podcastVideoConfig?.autoGeneratePortraits === true,
    allowLivePreviewWithoutStoredAudio: raw?.podcastVideoConfig?.allowLivePreviewWithoutStoredAudio === true,
    cheapVideoMode: raw?.podcastVideoConfig?.cheapVideoMode !== false,
    transitionsByEdge,
    audioMode: audioModeRaw === "veo-native-audio" ? "veo-native-audio" : "gemini-live-per-scene",
    masterVolume: clampNumber(raw?.podcastVideoConfig?.masterVolume, 0, 100, 100),
    clipVolume: clampNumber(raw?.podcastVideoConfig?.clipVolume, 0, 100, 0),
    timelineVersion: Math.max(1, Math.min(99, Math.round(Number(raw?.podcastVideoConfig?.timelineVersion) || 1))),
    timelineTrackVersion: Math.max(1, Math.min(99, Math.round(Number(raw?.podcastVideoConfig?.timelineTrackVersion) || 1))),
    timelineTracks: sanitizeTimelineTracks(raw?.podcastVideoConfig?.timelineTracks || []),
    timelineClipsByRowId: sanitizeTimelineClipsByRowId(raw?.podcastVideoConfig?.timelineClipsByRowId || {}),
    timelineOnScreenTextTrackVersion: Math.max(1, Math.min(99, Math.round(Number(raw?.podcastVideoConfig?.timelineOnScreenTextTrackVersion) || 1))),
    timelineOnScreenTextClipsByRowId: sanitizeOnScreenTextClipsByRowId(raw?.podcastVideoConfig?.timelineOnScreenTextClipsByRowId || {}),
    timelineOnScreenTextLayoutByRowId: sanitizeOnScreenTextLayoutByRowId(raw?.podcastVideoConfig?.timelineOnScreenTextLayoutByRowId || {}),
    timelineOnScreenTextDefaultsVersion: Math.max(1, Math.min(99, Math.round(Number(raw?.podcastVideoConfig?.timelineOnScreenTextDefaultsVersion) || 1))),
    timelineTrackHeightsById: sanitizeTimelineTrackHeightsById(raw?.podcastVideoConfig?.timelineTrackHeightsById || {}),
    timelineViewMode: timelineViewModeRaw === "normal" ? "normal" : "tracks",
    videoModel: PODCASTER_VIDEO_MODEL_CANDIDATES.includes(String(raw?.podcastVideoConfig?.videoModel || "").trim())
      ? String(raw.podcastVideoConfig.videoModel).trim()
      : (raw?.podcastVideoConfig?.cheapVideoMode === false ? "veo-3.1-generate-preview" : "veo-3.1-lite-generate-preview"),
    onScreenTextTrack: sanitizeOnScreenTextTrack(raw?.podcastVideoConfig?.onScreenTextTrack || {}),
    geminiDialogueTrack: sanitizeGeminiDialogueTrack(raw?.podcastVideoConfig?.geminiDialogueTrack || {}),
    geminiDialogueTrackIndex: Math.max(0, Math.min(999, Math.floor(Number(raw?.podcastVideoConfig?.geminiDialogueTrackIndex) || 0))),
    montageDefaultVeoVolumePct: clampNumber(raw?.podcastVideoConfig?.montageDefaultVeoVolumePct, 0, 100, 0),
    montageDefaultGeminiVolumePct: clampNumber(raw?.podcastVideoConfig?.montageDefaultGeminiVolumePct, 0, 100, 100),
    reelModeEnabled: raw?.podcastVideoConfig?.reelModeEnabled === true
  };
  const panelMusicConfigRaw = raw?.panelMusicConfig && typeof raw.panelMusicConfig === "object" ? raw.panelMusicConfig : {};
  const panelMusicTrackRaw = panelMusicConfigRaw?.track && typeof panelMusicConfigRaw.track === "object" ? panelMusicConfigRaw.track : null;
  const panelMusicTrackLibraryRaw = panelMusicConfigRaw?.trackLibrary && typeof panelMusicConfigRaw.trackLibrary === "object"
    ? panelMusicConfigRaw.trackLibrary
    : {};
  const sanitizePanelMusicTrack = (trackRaw = null, fallbackName = "Audio") => (
    trackRaw && typeof trackRaw === "object"
      ? {
        libraryId: clampText(trackRaw?.libraryId || "", 140),
        slotLabel: clampText(trackRaw?.slotLabel || "", 80),
        enabledInSession: trackRaw?.enabledInSession !== false,
        name: clampText(trackRaw?.name || fallbackName, 180) || fallbackName,
        mimeType: clampText(trackRaw?.mimeType || "audio/mpeg", 120) || "audio/mpeg",
        size: Math.max(0, Number(trackRaw?.size) || 0),
        durationSec: clampNumber(trackRaw?.durationSec, 0, 1800, 0),
        startOffsetMs: clampNumber(trackRaw?.startOffsetMs, 0, 1800 * 1000, 0),
        trimInMs: clampNumber(trackRaw?.trimInMs, 0, 1800 * 1000, 0),
        trimOutMs: clampNumber(trackRaw?.trimOutMs, 0, 1800 * 1000, 0),
        durationMeasuredWith: clampText(trackRaw?.durationMeasuredWith || "", 32).toLowerCase(),
        downloadUrl: clampText(trackRaw?.downloadUrl || "", 3000),
        storagePath: clampText(trackRaw?.storagePath || "", 700),
        updatedAt: clampText(trackRaw?.updatedAt || new Date().toISOString(), 64) || new Date().toISOString(),
        model: clampText(trackRaw?.model || "", 140),
        prompt: clampText(trackRaw?.prompt || "", 4000),
        loopSettings: Array.isArray(trackRaw?.loopSettings)
          ? Array.from(new Map(
            trackRaw.loopSettings
              .filter((item) => item && typeof item === "object")
              .map((item) => {
                const loopIndex = Math.max(0, Math.floor(Number(item.loopIndex) || 0));
                const trimInMs = clampNumber(item.trimInMs, 0, 1800 * 1000, 0);
                const trimOutMs = clampNumber(item.trimOutMs, 0, 1800 * 1000, 0);
                const visibleDurationMs = Math.max(0, trimOutMs - trimInMs);
                const fadeInMs = clampNumber(item.fadeInMs, 0, visibleDurationMs, 0);
                const fadeOutMs = clampNumber(item.fadeOutMs, 0, visibleDurationMs, 0);
                return [loopIndex, { loopIndex, trimInMs, trimOutMs, fadeInMs, fadeOutMs }];
              })
          ).values()).sort((a, b) => a.loopIndex - b.loopIndex)
          : [],
        mutedLoopIndexes: Array.isArray(trackRaw?.mutedLoopIndexes)
          ? Array.from(new Set(
            trackRaw.mutedLoopIndexes
              .map((item) => Math.max(0, Math.floor(Number(item) || 0)))
              .filter((item) => Number.isFinite(item) && item >= 0 && item <= 999)
          )).sort((a, b) => a - b)
          : [],
        segmentStartOverrides: Array.isArray(trackRaw?.segmentStartOverrides)
          ? Array.from(new Map(
            trackRaw.segmentStartOverrides
              .filter((item) => item && typeof item === "object")
              .map((item) => {
                const loopIndex = Math.max(0, Math.floor(Number(item.loopIndex) || 0));
                const startMs = clampNumber(item.startMs, 0, 3600 * 1000, 0);
                return [loopIndex, { loopIndex, startMs }];
              })
          ).values()).sort((a, b) => a.loopIndex - b.loopIndex)
          : []
      }
      : null
  );
  const panelMusicConfig = {
    preset: ["ambient", "focus", "pulse"].includes(String(panelMusicConfigRaw?.preset || "").trim()) ? String(panelMusicConfigRaw.preset).trim() : "ambient",
    volume: Math.max(0, Math.min(100, Number(panelMusicConfigRaw?.volume) || 22)),
    montageVolume: Math.max(0, Math.min(100, Number(panelMusicConfigRaw?.montageVolume ?? panelMusicConfigRaw?.volume ?? 22))),
    stabilize: panelMusicConfigRaw?.stabilize === true || String(panelMusicConfigRaw?.stabilize || "").trim().toLowerCase() === "true",
    sourceType: String(panelMusicConfigRaw?.sourceType || "").trim() === "track" ? "track" : "preset",
    selectedTrackKind: String(panelMusicConfigRaw?.selectedTrackKind || "").trim() === "ai" ? "ai" : "uploaded",
    trackLibrary: {
      uploaded: sanitizePanelMusicTrack(panelMusicTrackLibraryRaw?.uploaded || null, "Audio"),
      uploadedTracks: Array.isArray(panelMusicTrackLibraryRaw?.uploadedTracks)
        ? panelMusicTrackLibraryRaw.uploadedTracks
            .map((trackRaw, index) => sanitizePanelMusicTrack(trackRaw, `Audio ${index + 1}`))
            .filter(Boolean)
        : [],
      ai: sanitizePanelMusicTrack(panelMusicTrackLibraryRaw?.ai || null, "Audio IA")
    },
    track: sanitizePanelMusicTrack(panelMusicTrackRaw, "Audio")
  };
  
  // Si no hay un track activo seleccionado explícitamente pero la librería tiene pistas,
  // y el modo es 'track', intentamos poblarlo para asegurar que el dashboard tenga algo que reproducir.
  if (panelMusicConfig.sourceType === "track" && !panelMusicConfig.track) {
    panelMusicConfig.track = panelMusicConfig.trackLibrary.uploaded || panelMusicConfig.trackLibrary.ai;
  }

  if (!panelMusicConfig.trackLibrary.uploaded && panelMusicConfig.trackLibrary.uploadedTracks.length) {
    panelMusicConfig.trackLibrary.uploaded = panelMusicConfig.trackLibrary.uploadedTracks[0];
  }
  const globalScenarioDeckRaw = raw?.globalScenarioDeck && typeof raw.globalScenarioDeck === "object"
    ? raw.globalScenarioDeck
    : {};
  const globalScenarioItemsRaw = Array.isArray(globalScenarioDeckRaw?.items) ? globalScenarioDeckRaw.items : [];
  const globalScenarioItems = globalScenarioItemsRaw.slice(0, 2).map((item, index) => {
    if (!item || typeof item !== "object") return null;
    const id = clampText(item?.id || `scenario_${index + 1}`, 80) || `scenario_${index + 1}`;
    return {
      id,
      revision: Math.max(0, Number(item?.revision) || 0),
      title: clampText(item?.title || `Escenario ${index + 1}`, 120) || `Escenario ${index + 1}`,
      prompt: clampText(item?.prompt || "", 4000),
      downloadUrl: clampText(item?.downloadUrl || "", 3000),
      storagePath: clampText(item?.storagePath || "", 700),
      mimeType: clampText(item?.mimeType || "image/png", 120) || "image/png",
      updatedAt: clampText(item?.updatedAt || new Date().toISOString(), 64) || new Date().toISOString(),
      model: clampText(item?.model || DEFAULT_PODCASTER_IMAGE_MODEL, 140) || DEFAULT_PODCASTER_IMAGE_MODEL
    };
  }).filter(Boolean);
  const defaultActiveScenarioId = globalScenarioItems[0]?.id || "scenario_a";
  const globalScenarioDeck = {
    activeId: clampText(globalScenarioDeckRaw?.activeId || defaultActiveScenarioId, 80) || defaultActiveScenarioId,
    items: globalScenarioItems
  };
  const normalizedDisfluencyDefaults = normalizeDisfluency(raw?.disfluencyDefaults || disfluencyDefaults);
  return {
    id: clampText(raw?.id || "", 100),
    title: clampText(raw?.title || "Sesión sin título", 180) || "Sesión sin título",
    prompt: clampText(raw?.prompt || "", 5000),
    archived: raw?.archived === true,
    publicar: raw?.publicar === true,
    updatedAt: clampText(raw?.updatedAt || new Date().toISOString(), 64),
    podcastStudioUiState,
    chat,
    script: {
      episodeTitle: clampText(raw?.script?.episodeTitle || (scriptVideoMode ? "Video educativo" : "Podcast"), 220),
      summary: clampText(raw?.script?.summary || "", 6000),
      videoMode: scriptVideoMode,
      hosts,
      rows
    },
    speakerVoiceMap: raw?.speakerVoiceMap && typeof raw.speakerVoiceMap === "object" ? raw.speakerVoiceMap : {},
    speakerExpressionMap: raw?.speakerExpressionMap && typeof raw.speakerExpressionMap === "object" ? raw.speakerExpressionMap : {},
    speakerNameMap: raw?.speakerNameMap && typeof raw.speakerNameMap === "object" ? raw.speakerNameMap : {},
    disfluencyDefaults: normalizedDisfluencyDefaults,
    panelMusicConfig,
    speakerPortraitMap,
    speakerReferenceImageMap,
    scenarioReferenceImageMap,
    rowReferenceImageListMap,
    rowReferenceImageMap,
    rowReferenceVideoMap,
    rowReferenceModeByRowId,
    globalScenarioDeck,
    dialogueVideoMap,
    dialogueAudioMap,
    podcastVideoConfig
  };
}

async function verifyFirebaseBearer(req) {
  const authHeader = String(req.headers.authorization || "");
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    const err = new Error("AUTH_REQUIRED");
    err.status = 401;
    throw err;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const uid = String(decoded?.uid || "").trim();
    if (!uid) {
      const err = new Error("AUTH_INVALID");
      err.status = 401;
      throw err;
    }
    return { uid, decoded };
  } catch (_) {
    const err = new Error("AUTH_INVALID");
    err.status = 401;
    throw err;
  }
}

async function loadAnalizarPdfSessionForOwner(uid = "", sessionId = "") {
  const cleanUid = String(uid || "").trim();
  const cleanSessionId = clampText(sessionId, 120);
  if (!cleanUid || !cleanSessionId) {
    const err = new Error("Falta uid o sessionId.");
    err.status = 400;
    throw err;
  }
  const ref = db.collection(ANALIZAR_PDF_COLLECTION).doc(cleanSessionId);
  const snap = await ref.get();
  if (!snap.exists) {
    const err = new Error("Sesión no encontrada.");
    err.status = 404;
    throw err;
  }
  const data = snap.data() || {};
  if (String(data.ownerId || "").trim() !== cleanUid) {
    const err = new Error("No puedes acceder a una sesión de otro usuario.");
    err.status = 403;
    throw err;
  }
  return {
    ref,
    data: sanitizeAnalizarPdfSession(data, {
      id: cleanSessionId,
      ownerId: cleanUid,
      createdAt: data.createdAt || new Date().toISOString()
    })
  };
}

async function persistAnalizarPdfSessionForOwner(uid = "", source = {}) {
  const cleanUid = String(uid || "").trim();
  const base = sanitizeAnalizarPdfSession(source, {
    ownerId: cleanUid,
    id: source?.id || `analizar_pdf_${randomUUID().slice(0, 12)}`,
    createdAt: source?.createdAt || new Date().toISOString()
  });
  const sessionRef = db.collection(ANALIZAR_PDF_COLLECTION).doc(base.id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(sessionRef);
    const existing = snap.exists ? (snap.data() || {}) : null;
    if (existing && String(existing.ownerId || "").trim() !== cleanUid) {
      const err = new Error("No puedes sobrescribir una sesión de otro usuario.");
      err.status = 403;
      throw err;
    }
    const merged = sanitizeAnalizarPdfSession({
      ...(existing || {}),
      ...base,
      ownerId: cleanUid,
      createdAt: existing?.createdAt || base.createdAt,
      updatedAt: new Date().toISOString()
    }, {
      ownerId: cleanUid,
      id: base.id,
      createdAt: existing?.createdAt || base.createdAt
    });
    tx.set(sessionRef, merged, { merge: true });
  });
  const saved = await sessionRef.get();
  return sanitizeAnalizarPdfSession(saved.data() || {}, {
    id: base.id,
    ownerId: cleanUid,
    createdAt: base.createdAt
  });
}

async function ensureDefaultStyleMappings() {
  const seeds = buildDefaultStyleMappingSeeds("");
  if (!Array.isArray(seeds) || !seeds.length) return [];
  const refs = seeds.map((entry) => db.collection(ANALIZAR_PDF_STYLE_MAPPINGS_COLLECTION).doc(entry.id));
  const snaps = await Promise.all(refs.map((ref) => ref.get()));
  const writes = [];
  for (let index = 0; index < seeds.length; index += 1) {
    const mapping = sanitizeStyleMapping(seeds[index], { ownerId: "", id: seeds[index].id, createdAt: seeds[index].createdAt });
    const snap = snaps[index];
    if (snap.exists) {
      const existing = snap.data() || {};
      const hasEntries = Array.isArray(existing.entries) && existing.entries.length > 0;
      if (hasEntries) {
        continue;
      }
    }
    writes.push(refs[index].set(mapping, { merge: true }));
  }
  if (writes.length) {
    await Promise.all(writes);
  }
  const saved = await db.collection(ANALIZAR_PDF_STYLE_MAPPINGS_COLLECTION).get();
  return saved.docs.map((docSnap) => sanitizeStyleMapping(docSnap.data() || {}, {
    id: docSnap.id,
    ownerId: ""
  }));
}

async function listStyleMappings() {
  await ensureDefaultStyleMappings();
  const snap = await db.collection(ANALIZAR_PDF_STYLE_MAPPINGS_COLLECTION).get();
  return snap.docs
    .map((docSnap) => sanitizeStyleMapping(docSnap.data() || {}, {
      id: docSnap.id,
      ownerId: ""
    }))
    .sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
}

async function loadStyleMapping(mappingId = "") {
  const cleanId = clampText(mappingId, 120);
  if (!cleanId) {
    const err = new Error("Falta mappingId.");
    err.status = 400;
    throw err;
  }
  const ref = db.collection(ANALIZAR_PDF_STYLE_MAPPINGS_COLLECTION).doc(cleanId);
  const snap = await ref.get();
  if (!snap.exists) {
    const err = new Error("Mapeo no encontrado.");
    err.status = 404;
    throw err;
  }
  const data = snap.data() || {};
  return {
    ref,
    data: sanitizeStyleMapping(data, {
      id: cleanId,
      ownerId: "",
      createdAt: data.createdAt || new Date().toISOString()
    })
  };
}

async function persistStyleMapping(source = {}) {
  const base = sanitizeStyleMapping(source, {
    ownerId: "",
    id: source?.id || `mapping_${randomUUID().slice(0, 12)}`,
    createdAt: source?.createdAt || new Date().toISOString()
  });
  const ref = db.collection(ANALIZAR_PDF_STYLE_MAPPINGS_COLLECTION).doc(base.id);
  const snap = await ref.get();
  const existing = snap.exists ? (snap.data() || {}) : null;
  const ownerQuery = base.isActive
    ? await db.collection(ANALIZAR_PDF_STYLE_MAPPINGS_COLLECTION).get()
    : null;
  const merged = sanitizeStyleMapping({
    ...(existing || {}),
    ...base,
    ownerId: "",
    createdAt: existing?.createdAt || base.createdAt,
    updatedAt: new Date().toISOString()
  }, {
    ownerId: "",
    id: base.id,
    createdAt: existing?.createdAt || base.createdAt
  });
  const writes = [ref.set(merged, { merge: true })];
  if (ownerQuery) {
    for (const docSnap of ownerQuery.docs) {
      const candidate = docSnap.data() || {};
      if (String(candidate.scopeKey || "").trim() !== base.scopeKey) continue;
      if (docSnap.id === base.id) continue;
      writes.push(docSnap.ref.set({ isActive: false, updatedAt: new Date().toISOString() }, { merge: true }));
    }
  }
  await Promise.all(writes);
  const saved = await ref.get();
  return sanitizeStyleMapping(saved.data() || {}, {
    id: base.id,
    ownerId: "",
    createdAt: base.createdAt
  });
}

async function activateStyleMapping(mappingId = "") {
  const { data } = await loadStyleMapping(mappingId);
  return persistStyleMapping({
    ...data,
    isActive: true
  });
}

async function resolveStyleMappingForAnalysis(uid = "", session = null, revisionId = "", fileId = "", explicitMappingId = "") {
  if (!session) return null;
  const revisions = Array.isArray(session.revisions) ? session.revisions : [];
  const revision = revisions.find((entry) => String(entry?.id || "").trim() === String(revisionId || "").trim()) || revisions[0] || null;
  const files = Array.isArray(revision?.files) ? revision.files : [];
  const file = files.find((entry) => String(entry?.id || "").trim() === String(fileId || "").trim()) || files[0] || null;
  const desiredMappingId = clampText(explicitMappingId || file?.mappingId || "", 120);
  if (desiredMappingId) {
    return loadStyleMapping(desiredMappingId).then((payload) => payload.data).catch(() => null);
  }
  const rawUnidad = clampText(revision?.unidad || session?.bibliographicInfo?.unidad || "", 80);
  const candidateUnits = [rawUnidad];
  if (/^Unidad\s+\d+/i.test(rawUnidad)) {
    candidateUnits.push("Unidad normal");
  }
  for (const unidad of candidateUnits.filter(Boolean)) {
    const scopeKey = buildStyleMappingScopeKey({
      bookType: session?.bibliographicInfo?.bookType || "",
      nivel: session?.bibliographicInfo?.nivel || "",
      grado: session?.bibliographicInfo?.grado || "",
      unidad
    });
    if (!scopeKey) {
      continue;
    }
    const mappingsSnap = await db.collection(ANALIZAR_PDF_STYLE_MAPPINGS_COLLECTION).get();
    const activeDoc = mappingsSnap.docs.find((docSnap) => {
      const data = docSnap.data() || {};
      return String(data.scopeKey || "").trim() === scopeKey && data.isActive === true;
    });
    if (activeDoc) {
      return sanitizeStyleMapping(activeDoc.data() || {}, {
        id: activeDoc.id,
        ownerId: ""
      });
    }
  }
  return null;
}

function findRevisionAndFile(session = null, revisionId = "", fileId = "") {
  const revisions = Array.isArray(session?.revisions) ? session.revisions : [];
  const revision = revisions.find((entry) => String(entry?.id || "").trim() === String(revisionId || "").trim()) || null;
  const file = Array.isArray(revision?.files) ? revision.files.find((entry) => String(entry?.id || "").trim() === String(fileId || "").trim()) || null : null;
  return { revision, file };
}

function spawnCorrectIdmlPythonJob(options = {}) {
  const pythonBin = String(options.pythonBin || process.env.PDF_ANALYZER_PYTHON_BIN || "python3").trim() || "python3";
  const scriptPath = path.join(__dirname, "python", "correct_idml.py");
  const payloadDir = path.join(os.tmpdir(), "analizar-pdf-corrected-payloads");
  ensureDirSync(payloadDir);
  const payloadPath = path.join(payloadDir, `${randomUUID()}.json`);
  fs.writeFileSync(payloadPath, JSON.stringify(options.payload || {}), "utf8");
  const args = [
    scriptPath,
    "--input",
    path.resolve(String(options.inputPath || "")),
    "--output",
    path.resolve(String(options.outputPath || "")),
    "--payload-file",
    payloadPath
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, args, { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PYTHONUNBUFFERED: "1" } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk || ""); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk || ""); });
    child.on("error", (error) => {
      try {
        fs.unlinkSync(payloadPath);
      } catch (_) {
        // noop
      }
      reject(error);
    });
    child.on("close", (code) => {
      try {
        fs.unlinkSync(payloadPath);
      } catch (_) {
        // noop
      }
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `Python exit ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`Invalid Python JSON output: ${error.message}`));
      }
    });
  });
}

function buildRevisionSummaryFromFiles(files = []) {
  return (Array.isArray(files) ? files : []).reduce((acc, file) => {
    const summary = file?.resultSummary || {};
    acc.paginationIssueCount += Number(summary.paginationIssueCount || 0) || 0;
    acc.sectionIssueCount += Number(summary.sectionIssueCount || 0) || 0;
    acc.spellingIssueCount += Number(summary.spellingIssueCount || 0) || 0;
    acc.orthotypographyIssueCount += Number(summary.orthotypographyIssueCount || 0) || 0;
    acc.colorIssueCount += Number(summary.colorIssueCount || 0) || 0;
    acc.recortableIssueCount += Number(summary.recortableIssueCount || 0) || 0;
    return acc;
  }, {
    paginationIssueCount: 0,
    sectionIssueCount: 0,
    spellingIssueCount: 0,
    orthotypographyIssueCount: 0,
    colorIssueCount: 0,
    recortableIssueCount: 0
  });
}

async function updateAnalizarPdfFileState(uid = "", sessionId = "", revisionId = "", fileId = "", patch = {}) {
  const { ref, data } = await loadAnalizarPdfSessionForOwner(uid, sessionId);
  const cleanRevisionId = clampText(revisionId, 120);
  const cleanFileId = clampText(fileId, 120);
  if (!cleanRevisionId || !cleanFileId) {
    return updateAnalizarPdfSessionState(uid, sessionId, patch);
  }
  const next = deepClone(data);
  next.revisions = Array.isArray(next.revisions) ? next.revisions : [];
  const patchDocumentName = clampText(patch?.documentName || patch?.fileName || "", 240);
  const revisionInfo = {
    unidad: clampText(next?.bibliographicInfo?.unidad || "", 80),
    revisionNumero: clampText(next?.bibliographicInfo?.revisionNumero || "", 80)
  };
  let revision = next.revisions.find((entry) => String(entry?.id || "").trim() === cleanRevisionId);
  if (!revision) {
    revision = next.revisions.find((entry) =>
      clampText(entry?.unidad || "", 80) === revisionInfo.unidad &&
      clampText(entry?.revisionNumero || "", 80) === revisionInfo.revisionNumero
    ) || null;
  }
  if (!revision) {
    revision = {
      id: cleanRevisionId,
      revisionKey: [revisionInfo.unidad.toLowerCase(), revisionInfo.revisionNumero.toLowerCase()].filter(Boolean).join("|") || cleanRevisionId,
      title: [revisionInfo.unidad, revisionInfo.revisionNumero].filter(Boolean).join(" · ") || "Revisión sin título",
      unidad: revisionInfo.unidad,
      revisionNumero: revisionInfo.revisionNumero,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      latestAnalysisAt: "",
      fileCount: 0,
      summary: {
        paginationIssueCount: 0,
        sectionIssueCount: 0,
        spellingIssueCount: 0,
        orthotypographyIssueCount: 0,
        colorIssueCount: 0,
        recortableIssueCount: 0
      },
      files: []
    };
    next.revisions.unshift(revision);
  }
  revision.files = Array.isArray(revision.files) ? revision.files : [];
  let file = revision.files.find((entry) => String(entry?.id || "").trim() === cleanFileId);
  if (!file && patchDocumentName) {
    const fileKey = patchDocumentName.toLowerCase();
    file = revision.files.find((entry) => String(entry?.fileKey || "").trim() === fileKey) || null;
  }
  if (!file) {
    file = {
      id: cleanFileId,
      fileKey: patchDocumentName.toLowerCase() || cleanFileId,
      documentName: patchDocumentName || "Archivo sin nombre",
      mappingId: clampText(patch?.mappingId || "", 120),
      mappingTitle: clampText(patch?.mappingTitle || "", 240),
      mappingUpdatedAt: clampText(patch?.mappingUpdatedAt || "", 80),
      sourceAssetPath: clampText(patch?.sourceAssetPath || "", 600),
      localBlobKey: clampText(patch?.localBlobKey || "", 240),
      hasLocalSource: patch?.hasLocalSource === true,
      fileSize: Math.max(0, Number(patch?.fileSize || 0) || 0),
      fileLastModified: Math.max(0, Number(patch?.fileLastModified || 0) || 0),
      fileMimeType: clampText(patch?.fileMimeType || "", 160),
      sourceType: String(patch?.sourceType || next.sourceType || "pdf").trim() === "idml" ? "idml" : "pdf",
      analysisStatus: "idle",
      analysisJobId: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      resultSummary: {
        paginationIssueCount: 0,
        sectionIssueCount: 0,
        spellingIssueCount: 0,
        orthotypographyIssueCount: 0,
        colorIssueCount: 0,
        recortableIssueCount: 0,
        pageCount: 0,
        analyzedAt: ""
      },
      result: {
        paginationIssues: [],
        sectionIssues: [],
        spellingIssues: [],
        orthotypographyIssues: [],
        colorIssues: [],
        recortableIssues: [],
        stats: null
      }
    };
    revision.files.push(file);
  }
  Object.assign(file, patch && typeof patch === "object" ? patch : {});
  file.updatedAt = new Date().toISOString();
  if (file.result && typeof file.result === "object") {
    file.resultSummary = sanitizeResultSummary(file.resultSummary, file.result);
  }
  revision.fileCount = revision.files.length;
  revision.updatedAt = new Date().toISOString();
  revision.latestAnalysisAt = file.resultSummary?.analyzedAt || revision.latestAnalysisAt || "";
  revision.summary = buildRevisionSummaryFromFiles(revision.files);
  next.analysisStatus = normalizeAnalysisStatus(patch?.analysisStatus || next.analysisStatus);
  next.analysisJobId = clampText(patch?.analysisJobId || next.analysisJobId || "", 160);
  next.updatedAt = new Date().toISOString();
  const sanitized = sanitizeAnalizarPdfSession(next, {
    ownerId: uid,
    id: sessionId,
    createdAt: data.createdAt
  });
  await ref.set(sanitized, { merge: true });
  return sanitized;
}

async function updateAnalizarPdfSessionState(uid = "", sessionId = "", patch = {}) {
  const { ref, data } = await loadAnalizarPdfSessionForOwner(uid, sessionId);
  const next = sanitizeAnalizarPdfSession({
    ...data,
    ...(patch && typeof patch === "object" ? patch : {}),
    ownerId: uid,
    id: sessionId,
    createdAt: data.createdAt,
    updatedAt: new Date().toISOString()
  }, {
    ownerId: uid,
    id: sessionId,
    createdAt: data.createdAt
  });
  await ref.set(next, { merge: true });
  return next;
}

async function resolveShareTarget({ targetUid = "", targetEmail = "" }) {
  const uidInput = clampText(targetUid, 140);
  const emailInput = clampText(targetEmail, 180).toLowerCase();
  if (!uidInput && !emailInput) {
    const err = new Error("Debes indicar targetUid o targetEmail.");
    err.status = 400;
    throw err;
  }
  if (uidInput) {
    const userSnap = await db.collection("users").doc(uidInput).get();
    if (!userSnap.exists) {
      const err = new Error("No se encontró el usuario destino.");
      err.status = 404;
      throw err;
    }
    const data = userSnap.data() || {};
    return {
      uid: uidInput,
      email: clampText(data?.email || "", 180).toLowerCase() || null
    };
  }
  const byEmail = await db.collection("users").where("email", "==", emailInput).limit(1).get();
  const docSnap = byEmail.docs[0] || null;
  if (!docSnap) {
    const err = new Error("No se encontró el usuario destino por email.");
    err.status = 404;
    throw err;
  }
  const data = docSnap.data() || {};
  return {
    uid: String(docSnap.id || "").trim(),
    email: clampText(data?.email || emailInput, 180).toLowerCase() || emailInput
  };
}

async function listShareableMoodleUsers(currentUid = "") {
  const uid = clampText(currentUid, 140);
  const snap = await db.collection("users").limit(300).get();
  const users = snap.docs.map((docSnap) => {
    const data = docSnap.data() || {};
    const userUid = String(data.uid || docSnap.id || "").trim();
    if (!userUid || userUid === uid) return null;
    const email = clampText(data.email || "", 180).toLowerCase();
    const displayName = clampText(
      data.displayName || data.name || data.nombre || data.fullName || email || userUid,
      180
    );
    return {
      uid: userUid,
      email: email || "",
      displayName: displayName || userUid
    };
  }).filter(Boolean);
  users.sort((a, b) => {
    const left = String(a.displayName || a.email || a.uid || "").toLowerCase();
    const right = String(b.displayName || b.email || b.uid || "").toLowerCase();
    return left.localeCompare(right, "es");
  });
  return users;
}

function canManageMoodleCourseShare(courseData = {}, uid = "") {
  const currentUid = clampText(uid, 140);
  if (!currentUid) return false;
  if (String(courseData?.userId || courseData?.uid || courseData?.ownerUid || "").trim() === currentUid) return true;
  const details = Array.isArray(courseData?.compartidoConDetalles) ? courseData.compartidoConDetalles : [];
  return details.some((detail) => (
    String(detail?.userId || "").trim() === currentUid &&
    detail?.permisos &&
    detail.permisos.compartir === true
  ));
}

function deepClone(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

async function createMoodleCourseCopy({
  courseId = "",
  requesterUid = "",
  targetUser = null,
}) {
  const cleanCourseId = clampText(courseId, 140);
  const sourceRef = db.collection("moodleCourses").doc(cleanCourseId);
  const sourceSnap = await sourceRef.get();
  if (!sourceSnap.exists) {
    const err = new Error("El curso original no existe.");
    err.status = 404;
    throw err;
  }
  const sourceData = sourceSnap.data() || {};
  if (!canManageMoodleCourseShare(sourceData, requesterUid)) {
    const err = new Error("No tienes permisos para compartir este curso.");
    err.status = 403;
    throw err;
  }

  const targetUid = clampText(targetUser?.uid || "", 140);
  const targetName = clampText(targetUser?.displayName || targetUser?.email || targetUid, 180) || targetUid;
  const duplicateName = `${String(sourceData?.nombre || "Curso").trim()} (Copia para ${targetName})`;
  const existingCopiesSnap = await db.collection("moodleCourses").where("userId", "==", targetUid).limit(100).get();
  const duplicate = existingCopiesSnap.docs.find((docSnap) => {
    const data = docSnap.data() || {};
    return String(data?.nombre || "").trim() === duplicateName &&
      String(data?.copiaDe?.cursoId || "").trim() === cleanCourseId;
  });
  if (duplicate) {
    return {
      alreadyExisted: true,
      courseId: String(duplicate.id || "").trim(),
    };
  }

  const newCourseId = randomUUID();
  const copiedCourse = deepClone(sourceData);
  copiedCourse.id = newCourseId;
  copiedCourse.cursoId = newCourseId;
  copiedCourse.nombre = duplicateName;
  copiedCourse.userId = targetUid;
  copiedCourse.uid = targetUid;
  copiedCourse.ownerUid = targetUid;
  copiedCourse.docType = "course";
  copiedCourse.esPropio = true;
  copiedCourse.creado = admin.firestore.FieldValue.serverTimestamp();
  copiedCourse.actualizado = admin.firestore.FieldValue.serverTimestamp();
  copiedCourse.copiaDe = {
    cursoId: cleanCourseId,
    nombre: String(sourceData?.nombre || "").trim() || "Curso",
    propietarioOriginal: String(sourceData?.userId || sourceData?.uid || sourceData?.ownerUid || "").trim() || requesterUid,
    fechaCopia: new Date().toISOString(),
  };
  delete copiedCourse.compartidoCon;
  delete copiedCourse.compartidoConDetalles;
  delete copiedCourse.propietarioNombre;

  const moduleIdMap = new Map();
  if (Array.isArray(copiedCourse.temas)) {
    copiedCourse.temas = copiedCourse.temas.map((tema) => {
      const nextTema = deepClone(tema || {});
      nextTema.id = randomUUID();
      if (Array.isArray(nextTema.subtemas)) {
        nextTema.subtemas = nextTema.subtemas.map((subtema) => {
          const nextSubtema = deepClone(subtema || {});
          nextSubtema.id = randomUUID();
          const sourceModuleIds = Array.isArray(nextSubtema.modulosIds) ? nextSubtema.modulosIds : [];
          nextSubtema.modulosIds = sourceModuleIds.map((oldId) => {
            const sourceId = String(oldId || "").trim();
            if (!sourceId) return sourceId;
            const newId = randomUUID();
            moduleIdMap.set(sourceId, newId);
            return newId;
          });
          return nextSubtema;
        });
      }
      return nextTema;
    });
  }

  const batch = db.batch();
  batch.set(db.collection("moodleCourses").doc(newCourseId), copiedCourse);

  for (const [sourceModuleId, newModuleId] of moduleIdMap.entries()) {
    const sourceModuleDocId = `${cleanCourseId}_${sourceModuleId}`;
    const sourceModuleSnap = await db.collection("moodleCourses").doc(sourceModuleDocId).get();
    if (!sourceModuleSnap.exists) continue;
    const sourceModuleData = deepClone(sourceModuleSnap.data() || {});
    sourceModuleData.id = newModuleId;
    sourceModuleData.cursoId = newCourseId;
    sourceModuleData.docType = "module";
    delete sourceModuleData.userId;
    delete sourceModuleData.uid;
    delete sourceModuleData.ownerUid;
    sourceModuleData.creado = admin.firestore.FieldValue.serverTimestamp();
    sourceModuleData.actualizado = admin.firestore.FieldValue.serverTimestamp();
    const newModuleDocId = `${newCourseId}_${newModuleId}`;
    batch.set(db.collection("moodleCourses").doc(newModuleDocId), sourceModuleData);
  }

  await batch.commit();
  return {
    alreadyExisted: false,
    courseId: newCourseId,
  };
}

async function shareMoodleCourseCollaboration({
  courseId = "",
  requesterUid = "",
  targetUser = null,
  permisosEditar = false,
  permisosCompartir = false,
}) {
  const cleanCourseId = clampText(courseId, 140);
  const courseRef = db.collection("moodleCourses").doc(cleanCourseId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(courseRef);
    if (!snap.exists) {
      const err = new Error("El curso no existe.");
      err.status = 404;
      throw err;
    }
    const courseData = snap.data() || {};
    if (!canManageMoodleCourseShare(courseData, requesterUid)) {
      const err = new Error("No tienes permisos para compartir este curso.");
      err.status = 403;
      throw err;
    }
    const compartidoCon = Array.isArray(courseData.compartidoCon) ? [...courseData.compartidoCon] : [];
    const compartidoConDetalles = Array.isArray(courseData.compartidoConDetalles) ? [...courseData.compartidoConDetalles] : [];
    const targetUid = clampText(targetUser?.uid || "", 140);
    const targetName = clampText(targetUser?.displayName || targetUser?.email || targetUid, 180) || targetUid;
    const targetEmail = clampText(targetUser?.email || "", 180).toLowerCase();
    const existingIndex = compartidoConDetalles.findIndex((detail) => String(detail?.userId || "").trim() === targetUid);
    const detailPayload = {
      userId: targetUid,
      userName: targetName,
      userEmail: targetEmail,
      fechaCompartido: new Date(),
      compartidoPor: requesterUid,
      permisos: {
        editar: permisosEditar === true,
        compartir: permisosCompartir === true,
      },
      modo: "colaboracion",
    };
    if (existingIndex >= 0) {
      compartidoConDetalles[existingIndex] = {
        ...compartidoConDetalles[existingIndex],
        ...detailPayload,
        fechaModificacion: new Date(),
        modificadoPor: requesterUid,
      };
    } else {
      compartidoConDetalles.push(detailPayload);
    }
    if (!compartidoCon.includes(targetUid)) compartidoCon.push(targetUid);
    tx.update(courseRef, {
      compartidoCon,
      compartidoConDetalles,
      actualizado: new Date(),
    });
  });
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch (_) {
    const txt = await response.text().catch(() => "");
    return { error: txt || "Respuesta no JSON del upstream." };
  }
}

function extractErrorText(value = null, fallback = "", seen = new Set()) {
  if (value == null) return String(fallback || "").trim();
  if (typeof value === "string") {
    const text = value.trim();
    return text && text !== "[object Object]" ? text : String(fallback || "").trim();
  }
  if (typeof value !== "object") {
    const text = String(value || "").trim();
    return text && text !== "[object Object]" ? text : String(fallback || "").trim();
  }
  if (seen.has(value)) return String(fallback || "").trim();
  seen.add(value);
  for (const candidate of [value?.error, value?.message, value?.detail, value?.reason, value?.code]) {
    const text = extractErrorText(candidate, "", seen);
    if (text) return text;
  }
  try {
    const text = JSON.stringify(value);
    return text && text !== "{}" ? text : String(fallback || "").trim();
  } catch (_) {
    return String(fallback || "").trim();
  }
}

function buildGeminiLiveClient() {
  const client = new GoogleGenAI({
    apiKey: GEMINI_API_KEY,
    httpOptions: { apiVersion: "v1alpha" }
  });
  if (!client?.authTokens || typeof client.authTokens.create !== "function") {
    throw new Error("SDK @google/genai sin authTokens.create en backend local.");
  }
  return client;
}

function summarizeGeminiLiveError(error) {
  const status = Number(
    error?.status
    || error?.code
    || error?.cause?.status
    || error?.cause?.response?.status
    || 0
  ) || 0;
  const contentType = String(
    error?.cause?.response?.headers?.get?.("content-type")
    || error?.response?.headers?.get?.("content-type")
    || ""
  ).trim();
  const bodySnippet = String(
    error?.cause?.body
    || error?.cause?.responseText
    || error?.responseText
    || error?.details
    || error?.message
    || ""
  ).trim().slice(0, 500);
  return {
    status,
    contentType,
    bodySnippet,
  };
}

function decodeDataUrl(dataUrl = "") {
  const decoded = decodeBase64DataUrl(dataUrl, SCREENSHOT_MAX_BYTES);
  if (!String(decoded.mimeType || "").startsWith("image/")) {
    throw new Error("Formato de imagen inválido.");
  }
  return decoded;
}

function decodeBase64DataUrl(dataUrl = "", maxBytes = SCREENSHOT_MAX_BYTES) {
  const raw = String(dataUrl || "").trim();
  const match = raw.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Formato base64 inválido.");
  }
  const mimeType = String(match[1] || "").trim().toLowerCase();
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > Math.max(1, Number(maxBytes) || SCREENSHOT_MAX_BYTES)) {
    throw new Error("Archivo demasiado grande.");
  }
  return { mimeType, buffer };
}

function decodeInlineDataUrl(dataUrl = "", maxBytes = MONTAGE_EXPORT_INLINE_DATA_URL_MAX_BYTES) {
  const raw = String(dataUrl || "").trim();
  const match = raw.match(/^data:([^;,]+)?((?:;[^,]+)*?),(.*)$/i);
  if (!match) {
    const err = new Error("invalid_data_url");
    err.code = "invalid_data_url";
    err.status = 400;
    throw err;
  }
  const mimeType = String(match[1] || "application/octet-stream").trim().toLowerCase() || "application/octet-stream";
  const params = String(match[2] || "");
  const payload = String(match[3] || "");
  const isBase64 = /;base64/i.test(params);
  const buffer = isBase64
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload), "utf8");
  const maxAllowed = Math.max(1, Number(maxBytes) || MONTAGE_EXPORT_INLINE_DATA_URL_MAX_BYTES);
  if (!buffer.length || buffer.length > maxAllowed) {
    const err = new Error("inline_data_too_large");
    err.code = "inline_data_too_large";
    err.status = 413;
    err.sizeBytes = Number(buffer.length || 0) || 0;
    err.maxBytes = maxAllowed;
    throw err;
  }
  return { mimeType, buffer };
}

async function writeDataUrlToFile(dataUrl = "", outPath = "") {
  const decoded = decodeInlineDataUrl(dataUrl, MONTAGE_EXPORT_INLINE_DATA_URL_MAX_BYTES);
  await fs.promises.writeFile(outPath, decoded.buffer);
  return outPath;
}

function getScreenshotExtension(mimeType = "image/jpeg") {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

function getAudioExtension(mimeType = "audio/mpeg") {
  if (mimeType === "audio/mpeg" || mimeType === "audio/mp3") return "mp3";
  if (mimeType === "audio/wav" || mimeType === "audio/x-wav") return "wav";
  if (mimeType === "audio/ogg") return "ogg";
  if (mimeType === "audio/mp4" || mimeType === "audio/aac") return "m4a";
  if (mimeType === "audio/flac" || mimeType === "audio/x-flac") return "flac";
  return "bin";
}

function sleep(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function sanitizePodcasterMusicModel(value = "") {
  const clean = String(value || "").trim();
  return clean === "lyria-3-pro-preview" ? "lyria-3-pro-preview" : "lyria-3-clip-preview";
}

function buildPodcasterMusicPrompt(prompt = "", preset = "ambient") {
  const cleanPrompt = String(prompt || "").replace(/\s+/g, " ").trim().slice(0, 1200);
  const cleanPreset = String(preset || "ambient").trim().toLowerCase();
  const styleHint = cleanPreset === "pulse"
    ? "Light electronic pulse, energetic but clean, modern rhythm section."
    : cleanPreset === "focus"
      ? "Focused instrumental groove, subtle lo-fi textures, light piano and percussion."
      : "Ambient cinematic background, warm pads, soft piano, airy textures.";
  return [
    cleanPrompt,
    styleHint,
    "Instrumental only.",
    "No vocals, no spoken words, no choir, no narration.",
    "Suitable as background music under podcast dialogue.",
    "Keep transients controlled and avoid harsh peaks.",
    "Loop-friendly and non-intrusive."
  ].filter(Boolean).join(" ");
}

function readLyriaAudioParts(response = {}) {
  const parts = Array.isArray(response?.candidates?.[0]?.content?.parts)
    ? response.candidates[0].content.parts
    : Array.isArray(response?.parts)
      ? response.parts
      : [];
  return parts
    .map((part) => ({
      data: String(part?.inlineData?.data || part?.inline_data?.data || "").trim(),
      mimeType: String(part?.inlineData?.mimeType || part?.inline_data?.mimeType || "audio/mpeg").trim() || "audio/mpeg"
    }))
    .filter((part) => part.data);
}

function readGeminiAudioParts(responseBody = {}) {
  const parts = Array.isArray(responseBody?.candidates?.[0]?.content?.parts)
    ? responseBody.candidates[0].content.parts
    : [];
  const audioParts = [];
  parts.forEach((part) => {
    const data = String(part?.inlineData?.data || part?.inline_data?.data || "").trim();
    if (!data) return;
    const mimeType = String(part?.inlineData?.mimeType || part?.inline_data?.mimeType || "audio/L16;rate=24000").trim() || "audio/L16;rate=24000";
    audioParts.push({ data, mimeType });
  });
  return audioParts;
}

function pcm16ToWavBuffer(pcmBuffer = Buffer.alloc(0), sampleRate = 24000) {
  const pcm = Buffer.isBuffer(pcmBuffer) ? pcmBuffer : Buffer.from(pcmBuffer || []);
  const safeRate = Math.max(8000, Math.min(96000, Number(sampleRate) || 24000));
  const header = Buffer.alloc(44);
  const byteRate = safeRate * 2;
  const blockAlign = 2;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(safeRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function buildFfmpegAtempoFilterChain(speedRatio = 1) {
  const target = Math.max(0.25, Math.min(4, Number(speedRatio) || 1));
  const filters = [];
  let remaining = target;
  while (remaining > 2.0001) {
    filters.push("atempo=2");
    remaining /= 2;
  }
  while (remaining < 0.4999) {
    filters.push("atempo=0.5");
    remaining /= 0.5;
  }
  filters.push(`atempo=${remaining.toFixed(5)}`);
  return filters.join(",");
}

async function retimeDialogueAudioBufferToTargetDuration(buffer = Buffer.alloc(0), {
  targetDurationSec = 0,
  measuredDurationSec = 0,
  mimeType = "audio/wav"
} = {}) {
  const source = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  const target = Math.max(0, Number(targetDurationSec || 0) || 0);
  const measured = Math.max(0, Number(measuredDurationSec || 0) || 0);
  if (!source.length || target <= 0.05 || measured <= 0.05) {
    return {
      buffer: source,
      mimeType: String(mimeType || "audio/wav").trim() || "audio/wav",
      durationSec: measured,
      applied: false,
      appliedSpeedRatio: 1
    };
  }
  const desiredSpeedRatio = Math.max(0.25, Math.min(4, measured / target));
  if (Math.abs(desiredSpeedRatio - 1) < 0.035 || !isFfmpegAvailable()) {
    return {
      buffer: source,
      mimeType: String(mimeType || "audio/wav").trim() || "audio/wav",
      durationSec: measured,
      applied: false,
      appliedSpeedRatio: desiredSpeedRatio
    };
  }

  const token = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const inputPath = path.join(os.tmpdir(), `cb-dialogue-audio-${token}.wav`);
  const outputPath = path.join(os.tmpdir(), `cb-dialogue-audio-${token}-retimed.wav`);
  try {
    await fs.promises.writeFile(inputPath, source);
    await runFfmpegCommand([
      "-hide_banner",
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-filter:a",
      buildFfmpegAtempoFilterChain(desiredSpeedRatio),
      "-ar",
      "24000",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      outputPath
    ], {
      stage: "dialogue_audio_retime",
      timeoutMs: 20000,
      timeoutCode: "dialogue_audio_retime_timeout"
    });
    const retimedBuffer = await fs.promises.readFile(outputPath);
    const retimedDurationSec = clampNumber(parseWavDurationSeconds(retimedBuffer), 0, 180, 0);
    if (!retimedBuffer.length || retimedDurationSec <= 0.05) {
      return {
        buffer: source,
        mimeType: String(mimeType || "audio/wav").trim() || "audio/wav",
        durationSec: measured,
        applied: false,
        appliedSpeedRatio: desiredSpeedRatio
      };
    }
    return {
      buffer: retimedBuffer,
      mimeType: "audio/wav",
      durationSec: retimedDurationSec,
      applied: true,
      appliedSpeedRatio: desiredSpeedRatio
    };
  } finally {
    await Promise.allSettled([
      fs.promises.unlink(inputPath),
      fs.promises.unlink(outputPath)
    ]);
  }
}

function getVideoExtension(mimeType = "video/mp4") {
  const clean = String(mimeType || "").trim().toLowerCase();
  if (clean === "video/mp4") return "mp4";
  if (clean === "video/webm") return "webm";
  if (clean === "video/quicktime") return "mov";
  return "mp4";
}

function isFfmpegAvailable() {
  try {
    return Boolean(ffmpegStaticPath && fs.existsSync(ffmpegStaticPath));
  } catch (_) {
    return false;
  }
}

function extractMediaStreamInfoFromFfmpegStderr(stderrText = "") {
  const output = String(stderrText || "");
  const videoMatch = output.match(/Video:\s*([^,\s]+)/i);
  const audioMatch = output.match(/Audio:\s*([^,\s]+)/i);
  const durationMatch = output.match(/Duration:\s*([0-9:.]+)/i);
  const normalizeCodec = (value = "") => String(value || "").trim().toLowerCase().replace(/\(.*$/, "").trim();
  return {
    videoCodec: normalizeCodec(videoMatch?.[1] || ""),
    audioCodec: normalizeCodec(audioMatch?.[1] || ""),
    duration: String(durationMatch?.[1] || "").trim()
  };
}

function parseFfmpegDurationSeconds(durationText = "") {
  const clean = String(durationText || "").trim();
  const match = clean.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
  if (!match) return 0;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  if (![hours, minutes, seconds].every(Number.isFinite)) return 0;
  return Math.max(0, (hours * 3600) + (minutes * 60) + seconds);
}

function extractRenderedVideoFrameCount(stderrText = "") {
  const source = String(stderrText || "");
  const matches = Array.from(source.matchAll(/frame=\s*([0-9]+)/g));
  if (!matches.length) return 0;
  const value = Number(matches[matches.length - 1]?.[1] || 0);
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function runFfmpegCommand(args = [], context = {}) {
  return new Promise((resolve, reject) => {
    if (!isFfmpegAvailable()) {
      const err = new Error("ffmpeg_static_missing");
      err.code = "ffmpeg_static_missing";
      err.stage = String(context?.stage || "spawn").trim() || "spawn";
      reject(err);
      return;
    }
    const stage = String(context?.stage || "run").trim() || "run";
    const previewArgs = Array.isArray(args) ? args.slice(0, 24) : [];
    console.info("[backend][ffmpeg][start]", {
      stage,
      timeoutMs: Math.max(0, Number(context?.timeoutMs || 0) || 0) || undefined,
      argCount: Array.isArray(args) ? args.length : 0,
      previewArgs,
      outputPath: Array.isArray(args) ? String(args.at(-1) || "").trim() || undefined : undefined
    });
    const ffmpegArgs = Array.isArray(args) ? args.slice() : [];
    if (!ffmpegArgs.includes("-threads")) {
      ffmpegArgs.unshift("-threads", "1");
    }
    const child = spawn(ffmpegStaticPath, ffmpegArgs, {
      stdio: ["ignore", "pipe", "pipe"]
    });
    const timeoutMs = Math.max(0, Number(context?.timeoutMs || 0) || 0);
    let timeoutId = null;
    let settled = false;
    let didTimeout = false;
    let didAbort = false;
    let abortPollTimer = null;
    let heartbeatTimer = null;
    let heartbeatInFlight = false;
    const heartbeatStartedAt = Date.now();
    let stdout = "";
    let stderr = "";
    const shouldAbort = typeof context?.shouldAbort === "function" ? context.shouldAbort : null;
    const onHeartbeat = typeof context?.onHeartbeat === "function" ? context.onHeartbeat : null;
    const finalizeReject = (error) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (abortPollTimer) clearInterval(abortPollTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      reject(error);
    };
    const finalizeResolve = (value) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (abortPollTimer) clearInterval(abortPollTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      resolve(value);
    };
    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        didTimeout = true;
        console.warn("[backend][ffmpeg][timeout]", {
          stage,
          timeoutMs,
          pid: child.pid || null
        });
        try {
          child.kill("SIGTERM");
        } catch (_) {}
        setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch (_) {}
        }, 1500).unref?.();
      }, timeoutMs);
    }
    if (shouldAbort) {
      abortPollTimer = setInterval(() => {
        if (settled || didTimeout || didAbort) return;
        let aborted = false;
        try {
          aborted = shouldAbort() === true;
        } catch (_) {
          aborted = false;
        }
        if (!aborted) return;
        didAbort = true;
        console.warn("[backend][ffmpeg][abort]", {
          stage,
          pid: child.pid || null
        });
        try {
          child.kill("SIGTERM");
        } catch (_) {}
        setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch (_) {}
        }, 1200).unref?.();
      }, 400);
      if (typeof abortPollTimer.unref === "function") abortPollTimer.unref();
    }
    if (onHeartbeat) {
      const heartbeatIntervalMs = Math.max(1000, Number(context?.heartbeatIntervalMs || MONTAGE_EXPORT_FFMPEG_HEARTBEAT_MS) || MONTAGE_EXPORT_FFMPEG_HEARTBEAT_MS);
      heartbeatTimer = setInterval(() => {
        if (settled || didTimeout || didAbort || heartbeatInFlight) return;
        heartbeatInFlight = true;
        Promise.resolve(onHeartbeat({
          stage,
          pid: child.pid || null,
          elapsedMs: Math.max(0, Date.now() - heartbeatStartedAt),
          stderr,
          stdout
        })).catch((error) => {
          console.warn("[backend][ffmpeg][heartbeat-failed]", {
            stage,
            pid: child.pid || null,
            message: String(error?.message || error)
          });
        }).finally(() => {
          heartbeatInFlight = false;
        });
      }, heartbeatIntervalMs);
      if (typeof heartbeatTimer.unref === "function") heartbeatTimer.unref();
    }
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk || "");
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });
    child.on("error", (error) => {
      const err = new Error(`ffmpeg_spawn_error: ${String(error?.message || error || "unknown")}`);
      err.code = "ffmpeg_spawn_error";
      err.stage = stage;
      err.stderr = stderr;
      console.error("[backend][ffmpeg][error]", {
        stage,
        pid: child.pid || null,
        message: String(error?.message || error || "unknown"),
        stderrPreview: buildMontageStderrPreview(stderr)
      });
      finalizeReject(err);
    });
    child.on("close", (code) => {
      const summary = {
        stage,
        pid: child.pid || null,
        code: Number(code || 0) || 0,
        didTimeout,
        didAbort,
        stderrPreview: buildMontageStderrPreview(stderr),
        stdoutPreview: buildMontageStderrPreview(stdout, 8, 1200)
      };
      if (didTimeout) {
        const err = new Error(`${String(context?.timeoutCode || "ffmpeg_timeout").trim() || "ffmpeg_timeout"}_${timeoutMs}`);
        err.code = String(context?.timeoutCode || "ffmpeg_timeout").trim() || "ffmpeg_timeout";
        err.timeoutMs = timeoutMs;
        err.stage = stage;
        err.stdout = stdout;
        err.stderr = stderr;
        err.detail = {
          stage,
          timeoutMs,
          stderrPreview: buildMontageStderrPreview(stderr),
          stdoutPreview: buildMontageStderrPreview(stdout, 8, 1200)
        };
        console.warn("[backend][ffmpeg][close]", summary);
        finalizeReject(err);
        return;
      }
      if (didAbort) {
        const err = new Error("ffmpeg_aborted");
        err.code = "ffmpeg_aborted";
        err.stage = stage;
        err.stdout = stdout;
        err.stderr = stderr;
        err.detail = {
          stage,
          stderrPreview: buildMontageStderrPreview(stderr),
          stdoutPreview: buildMontageStderrPreview(stdout, 8, 1200)
        };
        console.warn("[backend][ffmpeg][close]", summary);
        finalizeReject(err);
        return;
      }
      if (Number(code || 0) === 0) {
        console.info("[backend][ffmpeg][close]", summary);
        finalizeResolve({ stdout, stderr, code: 0 });
        return;
      }
      const err = new Error(`ffmpeg_exit_code_${code}`);
      err.code = "ffmpeg_exit_code";
      err.exitCode = Number(code || 1);
      err.stage = stage;
      err.stdout = stdout;
      err.stderr = stderr;
      err.detail = {
        stage,
        stderrPreview: buildMontageStderrPreview(stderr),
        stdoutPreview: buildMontageStderrPreview(stdout, 8, 1200)
      };
      console.warn("[backend][ffmpeg][close]", summary);
      finalizeReject(err);
    });
  });
}

async function extractLastVideoFramePng(videoBuffer = Buffer.alloc(0), sourceMimeType = "video/mp4") {
  const source = Buffer.isBuffer(videoBuffer) ? videoBuffer : Buffer.from(videoBuffer || []);
  if (!source.length) {
    const err = new Error("empty_video_buffer");
    err.code = "empty_video_buffer";
    err.stage = "input";
    throw err;
  }
  const ext = getVideoExtension(sourceMimeType);
  const token = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const inputPath = path.join(os.tmpdir(), `cb-prev-${token}.${ext}`);
  const outputPath = path.join(os.tmpdir(), `cb-prev-${token}.png`);
  try {
    await fs.promises.writeFile(inputPath, source);
    await runFfmpegCommand([
      "-hide_banner",
      "-y",
      "-sseof",
      "-0.15",
      "-i",
      inputPath,
      "-frames:v",
      "1",
      "-vf",
      "scale=1280:-1:flags=lanczos",
      outputPath
    ], { stage: "extract_last_frame" });
    const frame = await fs.promises.readFile(outputPath);
    if (!frame.length || frame.length > MAX_REFERENCE_FRAME_BYTES) {
      const err = new Error("reference_frame_too_large");
      err.code = "reference_frame_too_large";
      err.stage = "extract_last_frame";
      throw err;
    }
    return frame;
  } finally {
    await safeUnlink(inputPath);
    await safeUnlink(outputPath);
  }
}

async function extractStoryboardAndKeyframesFromVideo(videoBuffer = Buffer.alloc(0), sourceMimeType = "video/mp4") {
  const source = Buffer.isBuffer(videoBuffer) ? videoBuffer : Buffer.from(videoBuffer || []);
  if (!source.length) {
    const err = new Error("empty_video_buffer");
    err.code = "empty_video_buffer";
    err.stage = "input";
    throw err;
  }
  const ext = getVideoExtension(sourceMimeType);
  const token = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const inputPath = path.join(os.tmpdir(), `cb-storyboard-${token}.${ext}`);
  const storyboardPath = path.join(os.tmpdir(), `cb-storyboard-${token}.png`);
  const keyframePaths = [
    path.join(os.tmpdir(), `cb-storyboard-${token}-start.png`),
    path.join(os.tmpdir(), `cb-storyboard-${token}-middle.png`),
    path.join(os.tmpdir(), `cb-storyboard-${token}-end.png`)
  ];
  try {
    await fs.promises.writeFile(inputPath, source);
    const probe = await runFfmpegCommand([
      "-hide_banner",
      "-i",
      inputPath,
      "-map",
      "0:v:0",
      "-f",
      "null",
      "-"
    ], { stage: "storyboard_probe" });
    const mediaInfo = extractMediaStreamInfoFromFfmpegStderr(probe.stderr || "");
    const frameCount = Math.max(1, extractRenderedVideoFrameCount(probe.stderr || ""));
    const durationSec = Math.max(0.1, parseFfmpegDurationSeconds(mediaInfo.duration || ""));
    const tileColumns = frameCount <= 24 ? 4 : frameCount <= 64 ? 6 : frameCount <= 120 ? 8 : 10;
    const tileRows = Math.max(1, Math.ceil(frameCount / tileColumns));
    const tileWidth = frameCount > 180 ? 72 : frameCount > 120 ? 80 : frameCount > 64 ? 88 : 96;
    await runFfmpegCommand([
      "-hide_banner",
      "-y",
      "-i",
      inputPath,
      "-vsync",
      "0",
      "-vf",
      `scale=${tileWidth}:-1:flags=lanczos,tile=${tileColumns}x${tileRows}:padding=2:margin=2:color=black`,
      "-frames:v",
      "1",
      storyboardPath
    ], { stage: "storyboard_sheet" });
    const storyboardBuffer = await fs.promises.readFile(storyboardPath);
    const storyboardMimeType = "image/png";
    const keyframeTimes = [
      Math.max(0, Math.min(durationSec * 0.05, Math.max(0, durationSec - 0.05))),
      Math.max(0, Math.min(durationSec * 0.5, Math.max(0, durationSec - 0.05))),
      Math.max(0, Math.min(durationSec * 0.95, Math.max(0, durationSec - 0.05)))
    ];
    const keyframes = [];
    for (let index = 0; index < keyframeTimes.length; index += 1) {
      const seekSec = keyframeTimes[index];
      const outputPath = keyframePaths[index];
      try {
        // eslint-disable-next-line no-await-in-loop
        throwIfCancelled("mix_timeline_audio");
        await runFfmpegCommand([
          "-hide_banner",
          "-y",
          "-ss",
          String(seekSec.toFixed(3)),
          "-i",
          inputPath,
          "-frames:v",
          "1",
          "-vf",
          "scale=1280:-1:flags=lanczos",
          outputPath
        ], { stage: `storyboard_keyframe_${index}` });
        // eslint-disable-next-line no-await-in-loop
        const buffer = await fs.promises.readFile(outputPath);
        if (buffer?.length) {
          keyframes.push({
            label: index === 0 ? "inicio" : index === 1 ? "mitad" : "final",
            buffer,
            mimeType: "image/png"
          });
        }
      } catch (_) {
        // noop
      }
    }
    return {
      storyboardBuffer,
      storyboardMimeType,
      keyframes,
      durationSec,
      frameCount
    };
  } finally {
    await safeUnlink(inputPath);
    await safeUnlink(storyboardPath);
    for (const item of keyframePaths) {
      await safeUnlink(item);
    }
  }
}

async function buildDialogueVideoRegenerationAnalysis(options = {}) {
  const videoBuffer = Buffer.isBuffer(options?.videoBuffer) ? options.videoBuffer : Buffer.from(options?.videoBuffer || []);
  if (!videoBuffer.length || !hasGeminiKey()) return null;
  const sourceMimeType = String(options?.sourceMimeType || "video/mp4").trim() || "video/mp4";
  const assets = await extractStoryboardAndKeyframesFromVideo(videoBuffer, sourceMimeType);
  const prompt = [
    "Analiza un storyboard que contiene todos los frames del clip original en orden temporal y tres keyframes adicionales (inicio, mitad, final).",
    "Tu tarea es construir una guía breve para regenerar el mismo clip con mejor calidad visual, sin cambiar su intención dramática ni su contenido base.",
    options?.speakerName ? `Personaje principal: ${options.speakerName}.` : "",
    options?.scenePrompt ? `Descripcion de escena actual: ${options.scenePrompt}` : "",
    options?.videoDirective ? `Indicacion visual actual: ${options.videoDirective}` : "",
    options?.targetSpeechLine ? `Dialogo objetivo: ${options.targetSpeechLine}` : "",
    "",
    "Devuelve SOLO JSON valido con esta estructura:",
    "{",
    '  "summary": "string",',
    '  "preserve": ["string"],',
    '  "improve": ["string"],',
    '  "avoid": ["string"],',
    '  "qualityPrompt": "string"',
    "}",
    "",
    "Reglas:",
    "- preserve: rasgos clave a conservar del clip actual.",
    "- improve: mejoras concretas de calidad visual, nitidez, iluminacion, continuidad, composicion o movimiento.",
    "- avoid: defectos a evitar en la regeneracion.",
    "- qualityPrompt: un solo parrafo utilizable directamente como instruccion adicional para regenerar el video con mejor calidad."
  ].filter(Boolean).join("\n");
  const parts = [
    { text: prompt },
    {
      inline_data: {
        mime_type: assets.storyboardMimeType,
        data: assets.storyboardBuffer.toString("base64")
      }
    }
  ];
  assets.keyframes.forEach((frame) => {
    parts.push({ text: `Keyframe ${String(frame?.label || "").trim() || "escena"}.` });
    parts.push({
      inline_data: {
        mime_type: String(frame?.mimeType || "image/png").trim() || "image/png",
        data: Buffer.from(frame.buffer).toString("base64")
      }
    });
  });
  const upstream = await fetchCompat(
    `${GEMINI_BASE}/models/${encodeURIComponent("gemini-2.5-flash")}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts
        }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json"
        }
      })
    }
  );
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const err = new Error(String(data?.error?.message || data?.error || `HTTP ${upstream.status}`));
    err.status = Number(upstream.status || 502);
    throw err;
  }
  const text = String(data?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
  const parsed = parseJsonObjectFromModelTextLocal(text);
  return {
    frameCount: assets.frameCount,
    durationSec: assets.durationSec,
    summary: clampText(parsed?.summary || "", 1200),
    preserve: Array.isArray(parsed?.preserve) ? parsed.preserve.map((item) => clampText(item, 220)).filter(Boolean).slice(0, 6) : [],
    improve: Array.isArray(parsed?.improve) ? parsed.improve.map((item) => clampText(item, 220)).filter(Boolean).slice(0, 6) : [],
    avoid: Array.isArray(parsed?.avoid) ? parsed.avoid.map((item) => clampText(item, 220)).filter(Boolean).slice(0, 6) : [],
    qualityPrompt: clampText(parsed?.qualityPrompt || "", 2200)
  };
}

async function safeUnlink(filePath = "") {
  const target = String(filePath || "").trim();
  if (!target) return;
  try {
    await fs.promises.unlink(target);
  } catch (_) {
    // noop
  }
}

async function probeMediaWithFfmpeg(inputPath = "", label = "probe") {
  const source = String(inputPath || "").trim();
  if (!source) return { label, videoCodec: "", audioCodec: "", duration: "" };
  const probeResult = await runFfmpegCommand([
    "-hide_banner",
    "-i",
    source,
    "-f",
    "null",
    "-"
  ], { stage: `${label}_probe` });
  return {
    label,
    ...extractMediaStreamInfoFromFfmpegStderr(probeResult.stderr || "")
  };
}

async function transcodeDialogueVideoToMp4(inputBuffer = Buffer.alloc(0), sourceMimeType = "video/mp4") {
  const source = Buffer.isBuffer(inputBuffer) ? inputBuffer : Buffer.from(inputBuffer || []);
  if (!source.length) {
    const err = new Error("empty_video_buffer");
    err.code = "empty_video_buffer";
    err.stage = "input";
    throw err;
  }
  if (!isFfmpegAvailable()) {
    const err = new Error("ffmpeg_static_missing");
    err.code = "ffmpeg_static_missing";
    err.stage = "input";
    throw err;
  }

  const inputExt = getVideoExtension(sourceMimeType);
  const inputPath = path.join("/tmp", `cb-dialogue-video-in-${randomUUID()}.${inputExt || "mp4"}`);
  const outputPath = path.join("/tmp", `cb-dialogue-video-out-${randomUUID()}.mp4`);
  let inputProbe = { videoCodec: "", audioCodec: "", duration: "" };
  let outputProbe = { videoCodec: "", audioCodec: "", duration: "" };

  try {
    await fs.promises.writeFile(inputPath, source);
    inputProbe = await probeMediaWithFfmpeg(inputPath, "input").catch(() => ({ videoCodec: "", audioCodec: "", duration: "" }));
    const hasInputAudio = Boolean(String(inputProbe?.audioCodec || "").trim());
    const inputVideoCodec = String(inputProbe?.videoCodec || "").trim().toLowerCase();
    const inputAudioCodec = String(inputProbe?.audioCodec || "").trim().toLowerCase();
    const canCopyVideo = inputVideoCodec === "h264";
    const canCopyAudio = inputAudioCodec === "aac";
    const isMp4LikeSource = String(sourceMimeType || "").trim().toLowerCase().includes("mp4");
    const transcodeArgs = hasInputAudio
      ? canCopyVideo && canCopyAudio && isMp4LikeSource
        ? [
          "-y",
          "-hide_banner",
          "-loglevel",
          "warning",
          "-i",
          inputPath,
          "-map",
          "0:v:0",
          "-map",
          "0:a:0?",
          "-c:v",
          "copy",
          "-c:a",
          "copy",
          "-movflags",
          "+faststart",
          outputPath
        ]
        : [
          "-y",
          "-hide_banner",
          "-loglevel",
          "warning",
          "-i",
          inputPath,
          "-map",
          "0:v:0",
          "-map",
          "0:a:0?",
          "-c:v",
          canCopyVideo ? "copy" : "libx264",
          ...(canCopyVideo ? [] : ["-preset", "medium", "-crf", "14", "-pix_fmt", "yuv420p"]),
          "-c:a",
          canCopyAudio ? "copy" : "aac",
          ...(canCopyAudio ? [] : ["-ar", "48000", "-b:a", "160k"]),
          "-movflags",
          "+faststart",
          outputPath
        ]
      : [
        "-y",
        "-hide_banner",
        "-loglevel",
        "warning",
        "-i",
        inputPath,
        "-f",
        "lavfi",
        "-i",
        "anullsrc=channel_layout=stereo:sample_rate=48000",
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-shortest",
        "-c:v",
        canCopyVideo ? "copy" : "libx264",
        ...(canCopyVideo ? [] : ["-preset", "medium", "-crf", "14", "-pix_fmt", "yuv420p"]),
        "-c:a",
        "aac",
        "-ar",
        "48000",
        "-b:a",
        "160k",
        "-movflags",
        "+faststart",
        outputPath
      ];
    await runFfmpegCommand(transcodeArgs, { stage: "transcode" });
    const outputBuffer = await fs.promises.readFile(outputPath);
    if (!outputBuffer.length) {
      const err = new Error("empty_transcoded_video");
      err.code = "empty_transcoded_video";
      err.stage = "output";
      throw err;
    }
    outputProbe = await probeMediaWithFfmpeg(outputPath, "output").catch(() => ({ videoCodec: "h264", audioCodec: "aac", duration: "" }));
    return {
      buffer: outputBuffer,
      mimeType: "video/mp4",
      container: "mp4",
      transcoded: true,
      sourceMimeType: String(sourceMimeType || "video/mp4").trim() || "video/mp4",
      videoCodec: String(outputProbe?.videoCodec || "h264").trim() || "h264",
      audioCodec: String(outputProbe?.audioCodec || "aac").trim() || "aac",
      inputProbe,
      outputProbe
    };
  } finally {
    await Promise.all([
      safeUnlink(inputPath),
      safeUnlink(outputPath)
    ]);
  }
}

function getImageExtension(mimeType = "image/png") {
  const clean = String(mimeType || "").trim().toLowerCase();
  if (clean === "image/webp") return "webp";
  if (clean === "image/jpeg" || clean === "image/jpg") return "jpg";
  return "png";
}

function extractGeminiInlineImage(data = {}) {
  const parts = Array.isArray(data?.candidates?.[0]?.content?.parts) ? data.candidates[0].content.parts : [];
  const inline = parts.find((part) => part?.inlineData?.data || part?.inline_data?.data) || null;
  const imageBase64 = String(inline?.inlineData?.data || inline?.inline_data?.data || "").trim();
  const mimeType = String(inline?.inlineData?.mimeType || inline?.inline_data?.mimeType || "image/png").trim() || "image/png";
  if (!imageBase64) return null;
  return {
    buffer: Buffer.from(imageBase64, "base64"),
    mimeType
  };
}

function buildGeminiImageGenerationConfig({
  aspectRatio = "1:1",
  imageSize = DEFAULT_GEMINI_IMAGE_SIZE,
  temperature = null
} = {}) {
  const config = {
    responseModalities: ["TEXT", "IMAGE"],
    imageConfig: {
      aspectRatio: String(aspectRatio || "1:1").trim() || "1:1",
      imageSize: String(imageSize || DEFAULT_GEMINI_IMAGE_SIZE).trim() || DEFAULT_GEMINI_IMAGE_SIZE
    }
  };
  const temp = Number(temperature);
  if (Number.isFinite(temp)) config.temperature = temp;
  return config;
}

function buildMoodleModuleGraphicPrompt({
  moduleName = "",
  moduleType = "",
  languageCode = "es",
  instructions = "",
  content = "",
  hasReferenceImages = false
} = {}) {
  const isEnglish = String(languageCode || "").toLowerCase().startsWith("en");
  return [
    `Modulo: ${clampText(moduleName || "Modulo educativo", 180)}`,
    `Tipo: ${clampText(moduleType || "Modulo", 80)}`,
    `Idioma: ${isEnglish ? "English" : "Español"}`,
    instructions ? `Instrucciones: ${clampText(instructions, 2200)}` : "",
    content ? `Contenido: ${clampText(content, 2600)}` : "",
    "Primero analiza las propuestas nuevas de actividades y detecta que informacion visual de apoyo ayuda mejor a resolverlas o comprenderlas.",
    "Luego genera una sola imagen final, completa y profesional, que funcione como apoyo educativo comun del modulo.",
    "No generes escenarios de podcast, estudios, sets cinematograficos ni interfaces decorativas ajenas al contenido educativo.",
    "Elige un unico formato visual integrado: infografia, diagrama explicativo, esquema comparativo, grafica educativa u organizador visual unificado.",
    "NO conviertas cada actividad o pregunta en una tarjeta, panel, bloque o mini-infografia separada.",
    "NO escribas 'Actividad 1', 'Actividad 2', 'Pregunta 1', 'Pregunta 2' ni variantes similares dentro de la imagen.",
    "NO hagas mapas mentales con ramas que representen actividades individuales del modulo.",
    "La imagen debe sintetizar conceptos, relaciones, pasos, referencias o contexto util para contestar las actividades como una sola pieza editorial integrada.",
    hasReferenceImages ? "Hay imagenes de referencia adjuntas en las instrucciones. Sigue su misma linea visual, lenguaje grafico, composicion y atmosfera, sin copiar literalmente su texto." : "",
    "Prioriza una estetica editorial elegante con jerarquia visual fuerte, composicion refinada y una sola narrativa grafica clara.",
    "Prefiere un sistema visual coherente, no cuatro o cinco subgraficos independientes.",
    "Usa paleta armonica, profesional y atractiva; evita combinaciones infantiles pobres, ruido visual, collage desordenado o elementos sueltos sin jerarquia.",
    "Procura no colocar texto; si es indispensable, usa el minimo posible, solo labels cortos y nunca parrafos largos.",
    "Fondo claro, limpio y profesional. Usa formas, reticulas suaves, patrones sutiles o decoracion editorial discreta solo si elevan la elegancia del diagrama.",
    "El resultado debe sentirse como un unico grafico de apoyo, moderno, claro y listo para material educativo de alta calidad."
  ].filter(Boolean).join("\n");
}

function normalizeInlineInstructionImages(input = []) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => ({
      mimeType: String(item?.mimeType || "").trim().toLowerCase(),
      data: String(item?.data || "").trim()
    }))
    .filter((item) => item.mimeType.startsWith("image/") && item.data)
    .slice(0, 2);
}

function stripHtmlToPlainLocal(html = "") {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

async function fetchImageBytesWithMimeLocal(imageUrl = "") {
  const target = String(imageUrl || "").trim();
  if (!target) {
    throw new Error("Falta imageUrl.");
  }
  const upstream = await fetchCompat(target, { method: "GET" });
  if (!upstream.ok) {
    throw new Error(`No se pudo descargar la imagen (${upstream.status}).`);
  }
  const mimeType = String(upstream.headers.get("content-type") || "image/png").trim() || "image/png";
  const buffer = Buffer.from(await upstream.arrayBuffer());
  return { mimeType, buffer };
}

function parseJsonObjectFromModelTextLocal(raw = "") {
  const clean = String(raw || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const match = clean.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : clean);
}

async function generateMoodleModuleGraphicAsset({
  uid = "",
  courseId = "",
  moduleId = "",
  moduleType = "",
  moduleName = "",
  languageCode = "es",
  instructions = "",
  content = "",
  instructionImages = [],
  previousStoragePath = ""
} = {}) {
  if (!hasGeminiKey()) {
    const err = new Error("Falta GEMINI_API_KEY o GOOGLE_API_KEY en backend.");
    err.status = 500;
    throw err;
  }

  const prompt = buildMoodleModuleGraphicPrompt({
    moduleName,
    moduleType,
    languageCode,
    instructions,
    content,
    hasReferenceImages: Array.isArray(instructionImages) && instructionImages.length > 0
  });
  const promptParts = [{ text: prompt }];
  normalizeInlineInstructionImages(instructionImages).forEach((image, index) => {
    promptParts.push({ text: `Imagen de referencia ${index + 1}: usa esta referencia para mantener la misma linea grafica educativa.` });
    promptParts.push({ inline_data: { mime_type: image.mimeType, data: image.data } });
  });
  const payload = {
    contents: [{ parts: promptParts }],
    generationConfig: buildGeminiImageGenerationConfig({
      aspectRatio: "1:1",
      imageSize: DEFAULT_GEMINI_IMAGE_SIZE
    })
  };
  const modelCandidates = Array.from(new Set([
    DEFAULT_MOODLE_GRAPHIC_MODEL,
    ...PODCASTER_IMAGE_MODEL_CANDIDATES
  ].filter(Boolean)));

  let inline = null;
  let mimeType = "image/png";
  let resolvedModel = DEFAULT_MOODLE_GRAPHIC_MODEL;
  let lastError = "Gemini no devolvio una imagen utilizable para el modulo.";
  let lastStatus = 502;

  for (const modelName of modelCandidates) {
    const upstream = await fetchCompat(
      `${GEMINI_BASE}/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );
    const data = await safeJson(upstream);
    if (!upstream.ok) {
      lastStatus = Number(upstream.status || 502);
      lastError = String(data?.error?.message || data?.error || `HTTP ${upstream.status}`);
      if ([400, 401, 403, 404].includes(lastStatus)) {
        continue;
      }
      const err = new Error(lastError);
      err.status = lastStatus;
      throw err;
    }

    inline = extractGeminiInlineImage(data);
    if (inline?.buffer?.length) {
      mimeType = String(inline.mimeType || "image/png").trim() || "image/png";
      resolvedModel = modelName;
      break;
    }

    lastStatus = 502;
    lastError = `${modelName}: respuesta sin inlineData de imagen`;
  }

  if (!inline?.buffer?.length) {
    const err = new Error(lastError || "Gemini no devolvio una imagen utilizable para el modulo.");
    err.status = lastStatus >= 400 ? lastStatus : 502;
    throw err;
  }

  const ext = getImageExtension(mimeType);
  const storagePath = `images/${normalizeStorageSegment(uid, "user")}/moodle-modules/${normalizeStorageSegment(courseId, "curso")}/${normalizeStorageSegment(moduleId, "modulo")}/${Date.now()}.${ext}`;
  if (previousStoragePath && previousStoragePath !== storagePath) {
    await deleteStoragePath(previousStoragePath).catch(() => {});
  }
  const asset = await uploadScreenshotAsset({
    path: storagePath,
    buffer: inline.buffer,
    mimeType,
    metadata: {
      origin: "moodleCourse",
      courseId: String(courseId || "").trim(),
      moduleId: String(moduleId || "").trim(),
      model: resolvedModel,
      promptVersion: MOODLE_GRAPHIC_PROMPT_VERSION
    }
  });
  return {
    downloadUrl: asset.downloadUrl,
    storagePath: asset.path,
    mimeType,
    model: resolvedModel,
    promptVersion: MOODLE_GRAPHIC_PROMPT_VERSION,
    updatedAt: new Date().toISOString()
  };
}

async function generateMoodleModuleGraphicElementAsset({
  uid = "",
  courseId = "",
  moduleId = "",
  moduleType = "",
  moduleName = "",
  languageCode = "es",
  instructions = "",
  content = "",
  elementId = "",
  elementLabel = "",
  elementPrompt = "",
  previousStoragePath = ""
} = {}) {
  const enrichedInstructions = [
    stripHtmlToPlainLocal(instructions),
    `Elemento objetivo: ${clampText(elementLabel || "Elemento", 120)}`,
    `Brief del elemento: ${clampText(elementPrompt || "", 2400)}`,
    "Genera exactamente una imagen de capa para composicion manual.",
    "Usa fondo blanco uniforme y limpio en toda la imagen.",
    "No uses fondos de color distintos, degradados ni escenas completas.",
    "Conserva solo el contexto visual minimo si realmente ayuda a entender el elemento.",
    "Sin texto, sin numeros, sin etiquetas, sin UI, sin marca de agua.",
    "No mezcles varias capas distintas en una sola imagen."
  ].filter(Boolean).join("\n");

  return generateMoodleModuleGraphicAsset({
    uid,
    courseId,
    moduleId,
    moduleType,
    moduleName,
    languageCode,
    instructions: enrichedInstructions,
    content: stripHtmlToPlainLocal(content),
    previousStoragePath
  });
}

async function uploadScreenshotAsset({ path: assetPath, buffer, mimeType, metadata = {} }) {
  const targetBucket = await resolveWritableStorageBucket();
  const file = targetBucket.file(assetPath);
  const token = randomUUID();
  await file.save(buffer, {
    resumable: false,
    contentType: mimeType,
    metadata: {
      cacheControl: "public,max-age=86400",
      metadata: {
        firebaseStorageDownloadTokens: token,
        ...metadata,
      },
    },
  });
  return {
    path: assetPath,
    downloadUrl: `https://firebasestorage.googleapis.com/v0/b/${targetBucket.name}/o/${encodeURIComponent(assetPath)}?alt=media&token=${token}`,
  };
}

async function uploadBinaryFileAsset({ path: assetPath, filePath, mimeType, metadata = {} }) {
  const sourcePath = String(filePath || "").trim();
  if (!sourcePath) {
    const err = new Error("missing_filePath");
    err.code = "missing_filePath";
    throw err;
  }
  const targetBucket = await resolveWritableStorageBucket();
  const file = targetBucket.file(assetPath);
  const token = randomUUID();
  const writeStream = file.createWriteStream({
    resumable: false,
    contentType: mimeType,
    metadata: {
      cacheControl: "public,max-age=86400",
      metadata: {
        firebaseStorageDownloadTokens: token,
        ...metadata,
      },
    },
  });
  await pipeline(fs.createReadStream(sourcePath), writeStream);
  return {
    path: assetPath,
    downloadUrl: `https://firebasestorage.googleapis.com/v0/b/${targetBucket.name}/o/${encodeURIComponent(assetPath)}?alt=media&token=${token}`,
  };
}

app.post("/api/unidades/support-graphics/upload", async (req, res) => {
  try {
    const { uid } = await verifyFirebaseBearer(req);
    const storagePath = clampText(req.body?.path || "", 900);
    const mimeType = clampText(req.body?.mimeType || "image/png", 120) || "image/png";
    const dataBase64 = String(req.body?.dataBase64 || "").trim();
    const metadataRaw = req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {};

    if (!storagePath.startsWith("unidadesGeneradasAssets/")) {
      return res.status(400).json({ error: "Ruta de storage inválida." });
    }
    if (!/^image\//i.test(mimeType)) {
      return res.status(400).json({ error: "mimeType inválido para apoyo visual." });
    }
    if (!dataBase64) {
      return res.status(400).json({ error: "Falta dataBase64." });
    }
    if (!storagePath.includes(`/${uid}/`)) {
      return res.status(403).json({ error: "La ruta no corresponde al usuario autenticado." });
    }

    const buffer = Buffer.from(dataBase64, "base64");
    if (!buffer.length || buffer.length > MAX_SPEAKER_PORTRAIT_BYTES) {
      return res.status(413).json({ error: "La imagen excede el tamaño permitido." });
    }

    const metadata = {
      uid,
      feature: "unidades_support_graphic",
      subtema: clampText(metadataRaw?.subtema || "", 180),
      role: clampText(metadataRaw?.role || "", 80)
    };

    const asset = await uploadScreenshotAsset({
      path: storagePath,
      buffer,
      mimeType,
      metadata
    });

    return res.status(200).json({
      ok: true,
      storagePath: asset.path,
      path: asset.path,
      downloadUrl: asset.downloadUrl,
      mimeType
    });
  } catch (error) {
    const status = Number(error?.status || 500);
    const message = String(error?.message || "No se pudo subir el apoyo visual.").trim();
    return res.status(status >= 400 && status <= 599 ? status : 500).json({ error: message });
  }
});

async function deleteStoragePath(storagePath = "") {
  if (!storagePath) return;
  const buckets = getStorageBucketCandidates();
  await Promise.all(buckets.map((bucket) => bucket.file(storagePath).delete({ ignoreNotFound: true }).catch(() => {})));
}

async function validateActiveMinebloxPlayer({ roomId, playerId, clientSessionId }) {
  const room = String(roomId || "").trim();
  const player = String(playerId || "").trim();
  const session = String(clientSessionId || "").trim();
  if (!room || !player || !session) {
    throw new Error("Faltan datos de sesión.");
  }
  const snap = await db.collection("mineblox_rooms").doc(room).collection("players").doc(player).get();
  if (!snap.exists) {
    // Be more lenient in dev: auto-create if room exists but player sync is lagging
    const roomSnap = await db.collection("mineblox_rooms").doc(room).get();
    if (!roomSnap.exists) {
      throw new Error(`Salón '${room}' no encontrado.`);
    }
    console.log(`[backend] player '${player}' not syncing yet, but room '${room}' is active. Allowing screenshot.`);
    return { clientSessionId: session, name: "Jugador Local" };
  }
  const data = snap.data() || {};
  const lastSeen = data.lastSeen?.toMillis ? data.lastSeen.toMillis() : 0;
  if (!lastSeen || (Date.now() - lastSeen) > ACTIVE_PLAYER_WINDOW_MS) {
    // Relaxed for local dev if they are clearly the owner or just took a screenshot
    console.warn(`[backend] player '${player}' last seen more than 45s ago, proceed anyway.`);
  }
  if (String(data.clientSessionId || "").trim() && String(data.clientSessionId || "").trim() !== session) {
    console.warn(`[backend] player '${player}' session mismatch. Received: ${session}, Stored: ${data.clientSessionId}`);
  }
  return data;
}

async function pruneScreenshotScope(roomId, visibility, playerId) {
  const shotsRef = db.collection("mineblox_rooms").doc(roomId).collection("screenshots");
  const snap = await shotsRef.orderBy("createdAt", "desc").limit(200).get();
  const limit = visibility === "personal" ? SCREENSHOT_PERSONAL_LIMIT : SCREENSHOT_SHARED_LIMIT;
  const scoped = snap.docs.filter((docSnap) => {
    const data = docSnap.data() || {};
    if (String(data.visibility || "") !== visibility) return false;
    if (visibility === "personal" && String(data.authorId || "") !== playerId) return false;
    return true;
  });
  if (scoped.length <= limit) return;
  const toDelete = scoped.slice(limit);
  await Promise.all(toDelete.map(async (docSnap) => {
    const data = docSnap.data() || {};
    await Promise.all([
      deleteStoragePath(String(data.storagePath || "")),
      deleteStoragePath(String(data.thumbStoragePath || "")),
      docSnap.ref.delete().catch(() => {}),
    ]);
  }));
}

async function handleMinebloxScreenshotUpload(req, res) {
  const body = req.body || {};
  const roomId = String(body.roomId || "").trim();
  const playerId = String(body.playerId || "").trim();
  const visibility = String(body.visibility || "personal").trim() === "shared" ? "shared" : "personal";
  await validateActiveMinebloxPlayer({
    roomId,
    playerId,
    clientSessionId: body.clientSessionId,
  });
  const mainImage = decodeDataUrl(body.imageDataUrl);
  const thumbImage = decodeDataUrl(body.thumbDataUrl);
  const shotId = randomUUID();
  const ext = getScreenshotExtension(mainImage.mimeType);
  const thumbExt = getScreenshotExtension(thumbImage.mimeType);
  const scopePath = visibility === "shared"
    ? `mineblox/screenshots/rooms/${roomId}/shared/${shotId}.${ext}`
    : `mineblox/screenshots/rooms/${roomId}/players/${playerId}/${shotId}.${ext}`;
  const thumbPath = visibility === "shared"
    ? `mineblox/screenshots/rooms/${roomId}/shared/${shotId}_thumb.${thumbExt}`
    : `mineblox/screenshots/rooms/${roomId}/players/${playerId}/${shotId}_thumb.${thumbExt}`;
  const [asset, thumb] = await Promise.all([
    uploadScreenshotAsset({
      path: scopePath,
      buffer: mainImage.buffer,
      mimeType: mainImage.mimeType,
      metadata: { roomId, playerId, shotId, visibility, kind: "main" },
    }),
    uploadScreenshotAsset({
      path: thumbPath,
      buffer: thumbImage.buffer,
      mimeType: thumbImage.mimeType,
      metadata: { roomId, playerId, shotId, visibility, kind: "thumb" },
    }),
  ]);
  const createdAt = new Date().toISOString();
  const record = {
    id: shotId,
    roomId,
    authorId: playerId,
    authorName: String(body.playerName || "Jugador").trim() || "Jugador",
    visibility,
    mimeType: mainImage.mimeType,
    width: Number(body.width || 0) || 0,
    height: Number(body.height || 0) || 0,
    thumbWidth: Number(body.thumbWidth || 0) || 0,
    thumbHeight: Number(body.thumbHeight || 0) || 0,
    bodyId: String(body.bodyId || "earth").trim() || "earth",
    season: body.season || null,
    weather: body.weather || null,
    viewMode: String(body.viewMode || "").trim() || "first",
    createdAt,
    storagePath: asset.path,
    thumbStoragePath: thumb.path,
    downloadUrl: asset.downloadUrl,
    thumbUrl: thumb.downloadUrl,
  };
  await db.collection("mineblox_rooms").doc(roomId).collection("screenshots").doc(shotId).set(record);
  await pruneScreenshotScope(roomId, visibility, playerId);
  return res.json({ ok: true, record });
}

async function handleMinebloxScreenshotList(req, res) {
  const roomId = String(req.query.roomId || "").trim();
  const playerId = String(req.query.playerId || "").trim();
  await validateActiveMinebloxPlayer({
    roomId,
    playerId,
    clientSessionId: req.query.clientSessionId,
  });
  const snap = await db.collection("mineblox_rooms").doc(roomId).collection("screenshots")
    .orderBy("createdAt", "desc")
    .limit(SCREENSHOT_SHARED_LIMIT + SCREENSHOT_PERSONAL_LIMIT)
    .get();
  const records = snap.docs
    .map((docSnap) => docSnap.data() || {})
    .filter((record) => record.visibility === "shared" || record.authorId === playerId);
  return res.json({ ok: true, records });
}

app.use("/api/analizar-pdf", async (req, res, next) => {
  if (req.method === "OPTIONS") return next();
  try {
    req.authContext = await verifyFirebaseBearer(req);
    return next();
  } catch (error) {
    return res.status(Number(error?.status || 401)).json({ error: String(error?.message || "AUTH_REQUIRED") });
  }
});

app.get("/api/analizar-pdf/sessions/list", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const snap = await db.collection(ANALIZAR_PDF_COLLECTION).where("ownerId", "==", uid).limit(80).get();
    const sessions = snap.docs
      .map((docSnap) => sanitizeAnalizarPdfSession(docSnap.data() || {}, {
        id: docSnap.id,
        ownerId: uid
      }))
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    return res.status(200).json({ ok: true, sessions });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudieron listar las sesiones.") });
  }
});

app.post("/api/analizar-pdf/sessions/save", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const source = req.body?.session && typeof req.body.session === "object" ? req.body.session : null;
    if (!source) {
      return res.status(400).json({ error: "Falta payload session." });
    }
    const session = await persistAnalizarPdfSessionForOwner(uid, source);
    return res.status(200).json({ ok: true, session });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo guardar la sesión.") });
  }
});

app.post("/api/analizar-pdf/sessions/delete", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const sessionId = clampText(req.body?.sessionId || "", 120);
    if (!sessionId) {
      return res.status(400).json({ error: "Falta sessionId." });
    }
    const { ref } = await loadAnalizarPdfSessionForOwner(uid, sessionId);
    await ref.delete();
    return res.status(200).json({ ok: true, sessionId });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo eliminar la sesión.") });
  }
});

app.get("/api/analizar-pdf/style-mappings/list", async (req, res) => {
  try {
    const mappings = await listStyleMappings();
    return res.status(200).json({ ok: true, mappings });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudieron listar los mapeos.") });
  }
});

app.post("/api/analizar-pdf/style-mappings/save", async (req, res) => {
  try {
    const source = req.body?.mapping && typeof req.body.mapping === "object" ? req.body.mapping : null;
    if (!source) {
      return res.status(400).json({ error: "Falta payload mapping." });
    }
    const mapping = await persistStyleMapping(source);
    return res.status(200).json({ ok: true, mapping });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo guardar el mapeo.") });
  }
});

app.post("/api/analizar-pdf/style-mappings/delete", async (req, res) => {
  try {
    const mappingId = clampText(req.body?.mappingId || "", 120);
    if (!mappingId) {
      return res.status(400).json({ error: "Falta mappingId." });
    }
    const { ref } = await loadStyleMapping(mappingId);
    await ref.delete();
    return res.status(200).json({ ok: true, mappingId });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo eliminar el mapeo.") });
  }
});

app.post("/api/analizar-pdf/style-mappings/activate", async (req, res) => {
  try {
    const mappingId = clampText(req.body?.mappingId || "", 120);
    if (!mappingId) {
      return res.status(400).json({ error: "Falta mappingId." });
    }
    const mapping = await activateStyleMapping(mappingId);
    return res.status(200).json({ ok: true, mapping });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo activar el mapeo.") });
  }
});

app.post("/api/analizar-pdf/export-corrected-idml", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const sessionId = clampText(req.body?.sessionId || "", 120);
    const revisionId = clampText(req.body?.revisionId || "", 120);
    const fileId = clampText(req.body?.fileId || "", 120);
    if (!uid || !sessionId || !revisionId || !fileId) {
      return res.status(400).json({ error: "Faltan sessionId, revisionId o fileId." });
    }
    const { data: session } = await loadAnalizarPdfSessionForOwner(uid, sessionId);
    const { revision, file } = findRevisionAndFile(session, revisionId, fileId);
    if (!revision || !file) {
      return res.status(404).json({ error: "Archivo de revisión no encontrado." });
    }
    if (String(file.sourceType || "").trim() !== "idml") {
      return res.status(400).json({ error: "La exportación corregida solo aplica a archivos IDML." });
    }
    const inputPath = clampText(file.sourceAssetPath || "", 600);
    if (!inputPath || !fs.existsSync(inputPath)) {
      return res.status(404).json({ error: "No se encontró la copia local del IDML original para exportar." });
    }
    const outputDir = path.join(os.tmpdir(), "analizar-pdf-corrected", sessionId, revisionId);
    ensureDirSync(outputDir);
    const outputFileName = `${path.basename(String(file.documentName || "documento.idml"), ".idml")}.corrected.idml`;
    const outputPath = path.join(outputDir, outputFileName);
    const correctionSelection = req.body?.correctionSelection && typeof req.body.correctionSelection === "object"
      ? req.body.correctionSelection
      : null;
    const cleanupOptions = req.body?.cleanupOptions && typeof req.body.cleanupOptions === "object"
      ? req.body.cleanupOptions
      : null;
    const selectedIssues = Array.isArray(correctionSelection?.selectedIssues) ? correctionSelection.selectedIssues : [];
    const hasCleanupActions = cleanupOptions
      ? Object.entries(cleanupOptions).some(([key, value]) => key !== "applySelectedCorrections" && value === true)
      : false;
    if (!selectedIssues.length && !hasCleanupActions) {
      return res.status(400).json({ error: "Activa al menos una corrección o limpieza antes de exportar." });
    }
    const payload = {
      toolName: ANALIZAR_PDF_MAPPING_TOOL_NAME,
      result: file.result || {},
      correctionSelection,
      cleanupOptions
    };
    const exportResult = await spawnCorrectIdmlPythonJob({
      inputPath,
      outputPath,
      payload
    });
    const token = randomUUID();
    analizarPdfGeneratedFileStore.set(token, {
      ownerId: uid,
      path: outputPath,
      fileName: outputFileName,
      createdAt: new Date().toISOString()
    });
    return res.status(200).json({
      ok: true,
      token,
      downloadUrl: `/api/analizar-pdf/download-generated?token=${encodeURIComponent(token)}`,
      message: "IDML corregido generado.",
      exportResult: {
        ...exportResult,
        fileName: outputFileName
      }
    });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo exportar el IDML corregido.") });
  }
});

app.get("/api/analizar-pdf/download-generated", async (req, res) => {
  const uid = String(req.authContext?.uid || "").trim();
  const token = clampText(req.query?.token || "", 180);
  const entry = analizarPdfGeneratedFileStore.get(token);
  if (!uid) {
    return res.status(401).json({ error: "AUTH_REQUIRED" });
  }
  if (!entry || String(entry.ownerId || "").trim() !== uid || !fs.existsSync(String(entry.path || ""))) {
    return res.status(404).json({ error: "Archivo generado no encontrado." });
  }
  return res.download(entry.path, entry.fileName || "corrected.idml");
});

app.post("/api/analizar-pdf/analyze", async (req, res) => {
  const uid = String(req.authContext?.uid || "").trim();
  const sessionId = clampText(req.headers["x-session-id"] || req.query?.sessionId || "", 120);
  const revisionId = clampText(req.headers["x-revision-id"] || "", 120);
  const fileId = clampText(req.headers["x-file-id"] || "", 120);
  const mappingId = clampText(req.headers["x-mapping-id"] || "", 120);
  const rawFileName = clampText(req.headers["x-file-name"] || "documento.pdf", 240) || "documento.pdf";
  const contentType = String(req.headers["content-type"] || "").trim().toLowerCase();
  const declaredLength = Number(req.headers["content-length"] || 0) || 0;
  if (!uid) {
    return res.status(401).json({ error: "AUTH_REQUIRED" });
  }
  if (!sessionId) {
    return res.status(400).json({ error: "Falta sessionId." });
  }
  if (declaredLength > MAX_ANALIZAR_PDF_UPLOAD_BYTES) {
    return res.status(413).json({ error: "El PDF excede el tamaño permitido." });
  }

  let tempFilePath = "";
  try {
    logAnalizarPdf("analyze.request.received", {
      uid,
      sessionId,
      revisionId,
      fileId,
      mappingId,
      rawFileName,
      contentType,
      declaredLength
    });
    const { data: session } = await loadAnalizarPdfSessionForOwner(uid, sessionId);
    const selectedMapping = await resolveStyleMappingForAnalysis(uid, session, revisionId, fileId, mappingId);
    const expectedExt = session.sourceType === "idml" ? ".idml" : ".pdf";
    const normalizedFileName = rawFileName.toLowerCase();
    if (!normalizedFileName.endsWith(expectedExt)) {
      return res.status(400).json({ error: `El archivo debe ser ${expectedExt}.` });
    }
    if (contentType && session.sourceType !== "idml" && !contentType.includes("pdf")) {
      return res.status(400).json({ error: "El archivo debe ser PDF." });
    }
    const scriptPath = resolveAnalyzerScript(session);
    const tempDir = path.join(os.tmpdir(), "analizar-pdf-jobs", sessionId, randomUUID());
    ensureDirSync(tempDir);
    tempFilePath = path.join(tempDir, normalizedFileName.endsWith(expectedExt) ? rawFileName : `${rawFileName}${expectedExt}`);
    const stableSourceDir = path.join(os.tmpdir(), "analizar-pdf-sources", sessionId, revisionId || "default");
    ensureDirSync(stableSourceDir);
    const stableSourcePath = path.join(stableSourceDir, `${fileId || buildFileKey(rawFileName) || randomUUID()}${expectedExt}`);
    const output = fs.createWriteStream(tempFilePath);
    let bytesRead = 0;
    req.on("data", (chunk) => {
      bytesRead += Buffer.byteLength(chunk);
      if (bytesRead > MAX_ANALIZAR_PDF_UPLOAD_BYTES) {
        req.destroy(new Error("PDF_TOO_LARGE"));
      }
    });
    await pipeline(req, output);
    logAnalizarPdf("analyze.upload.saved", {
      sessionId,
      tempFilePath,
      bytesRead
    });
    const jobId = `analizar_pdf_job_${randomUUID().slice(0, 12)}`;
    analizarPdfJobStore.set(jobId, {
      sessionId,
      revisionId,
      fileId,
      ownerId: uid,
      fileName: rawFileName,
      status: "queued",
      createdAt: new Date().toISOString()
    });
    await updateAnalizarPdfFileState(uid, sessionId, revisionId, fileId, {
      analysisStatus: "queued",
      analysisJobId: jobId,
      documentName: rawFileName,
      fileName: rawFileName,
      sourceType: session.sourceType,
      mappingId: selectedMapping?.id || mappingId || "",
      mappingTitle: selectedMapping?.title || "",
      mappingUpdatedAt: selectedMapping?.updatedAt || "",
      sourceAssetPath: stableSourcePath
    });
    fs.copyFileSync(tempFilePath, stableSourcePath);
    logAnalizarPdf("job.queued", { jobId, sessionId, ownerId: uid });

    void (async () => {
      try {
        logAnalizarPdf("job.processing.start", {
          jobId,
          sessionId,
          revisionId,
          fileId,
          tempFilePath
        });
        analizarPdfJobStore.set(jobId, { status: "processing", startedAt: new Date().toISOString() });
        await updateAnalizarPdfFileState(uid, sessionId, revisionId, fileId, {
          analysisStatus: "processing",
          analysisJobId: jobId,
          documentName: rawFileName,
          fileName: rawFileName,
          sourceType: session.sourceType,
          mappingId: selectedMapping?.id || mappingId || "",
          mappingTitle: selectedMapping?.title || "",
          mappingUpdatedAt: selectedMapping?.updatedAt || "",
          sourceAssetPath: stableSourcePath
        });
        const result = await spawnAnalizarPdfPythonJob({
          scriptPath,
          pdfPath: tempFilePath,
          session: {
            ...session,
            analysisMapping: selectedMapping || null
          }
        });
        const resultSummary = buildResultSummary(result);
        const persistedSession = await updateAnalizarPdfFileState(uid, sessionId, revisionId, fileId, {
          analysisStatus: "completed",
          analysisJobId: jobId,
          documentName: rawFileName,
          fileName: rawFileName,
          sourceType: session.sourceType,
          mappingId: selectedMapping?.id || mappingId || "",
          mappingTitle: selectedMapping?.title || "",
          mappingUpdatedAt: selectedMapping?.updatedAt || "",
          sourceAssetPath: stableSourcePath,
          result,
          resultSummary
        });
        logAnalizarPdf("job.completed", {
          jobId,
          sessionId,
          resultSummary
        });
        analizarPdfJobStore.set(jobId, {
          status: "completed",
          completedAt: new Date().toISOString(),
          resultSummary,
          session: persistedSession
        });
      } catch (error) {
        logAnalizarPdf("job.failed", {
          jobId,
          sessionId,
          message: String(error?.message || error),
          stack: String(error?.stack || "")
        });
        const persistedSession = await updateAnalizarPdfFileState(uid, sessionId, revisionId, fileId, {
          analysisStatus: "failed",
          analysisJobId: jobId,
          documentName: rawFileName,
          fileName: rawFileName,
          sourceType: session.sourceType,
          mappingId: selectedMapping?.id || mappingId || "",
          mappingTitle: selectedMapping?.title || "",
          mappingUpdatedAt: selectedMapping?.updatedAt || "",
          sourceAssetPath: stableSourcePath
        }).catch(() => null);
        analizarPdfJobStore.set(jobId, {
          status: "failed",
          error: String(error?.message || error),
          session: persistedSession
        });
      } finally {
        try {
          fs.unlinkSync(tempFilePath);
          logAnalizarPdf("job.tempfile.deleted", {
            jobId,
            tempFilePath
          });
        } catch (_) {
          // noop
        }
      }
    })();

    return res.status(202).json({
      ok: true,
      jobId,
      sessionId,
      status: "queued",
      fileName: rawFileName
    });
  } catch (error) {
    logAnalizarPdf("analyze.request.failed", {
      sessionId,
      rawFileName,
      message: String(error?.message || error),
      stack: String(error?.stack || "")
    });
    if (tempFilePath) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (_) {
        // noop
      }
    }
    const message = String(error?.message || error);
    if (message === "PDF_TOO_LARGE") {
      return res.status(413).json({ error: "El PDF excede el tamaño permitido." });
    }
    if (Number(error?.status || 0) >= 400 && Number(error?.status || 0) < 500) {
      return res.status(Number(error.status)).json({
        error: String(error?.message || "Solicitud inválida."),
        code: "ANALIZAR_PDF_REQUEST_INVALID"
      });
    }
    const classified = classifyAnalizarPdfStartupError(error);
    return res.status(Number(classified?.status || 500)).json({
      error: String(classified?.error || "No se pudo iniciar el análisis."),
      code: String(classified?.code || "ANALIZAR_PDF_START_FAILED")
    });
  }
});

app.get("/api/analizar-pdf/analyze-status", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const jobId = clampText(req.query?.jobId || "", 160);
    if (!jobId) {
      return res.status(400).json({ error: "Falta jobId." });
    }
    const job = analizarPdfJobStore.get(jobId);
    if (!job) {
      return res.status(404).json({ error: "Job no encontrado." });
    }
    if (String(job.ownerId || "").trim() !== uid) {
      return res.status(403).json({ error: "No puedes consultar este job." });
    }
    const session = job.sessionId
      ? (await loadAnalizarPdfSessionForOwner(uid, job.sessionId).then((payload) => payload.data).catch(() => null))
      : null;
    return res.status(200).json({
      ok: true,
      jobId,
      status: String(job.status || "queued"),
      error: job.error || null,
      session
    });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo consultar el estado.") });
  }
});

app.use("/api/podcaster", async (req, res, next) => {
  if (req.method === "OPTIONS") return next();
  if (req.method === "GET" && String(req.path || "").trim() === "/montage/export-status") {
    return next();
  }
  if (req.method === "GET" && String(req.path || "").trim() === "/scene-library/list") {
    return next();
  }
  try {
    req.authContext = await verifyFirebaseBearer(req);
    return next();
  } catch (error) {
    return res.status(Number(error?.status || 401)).json({ error: String(error?.message || "AUTH_REQUIRED") });
  }
});

app.post("/api/podcaster/scene-library/clone-video", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    if (!uid) return res.status(401).json({ error: "AUTH_REQUIRED" });
    const sessionId = clampText(String(req.body?.sessionId || "").trim(), 180);
    const rowId = clampText(String(req.body?.rowId || "").trim(), 180);
    const speakerLabel = clampText(String(req.body?.speakerLabel || "Narrador").trim(), 120) || "Narrador";
    const sourceStoragePathRaw = clampText(String(req.body?.sourceStoragePath || "").trim(), 900);
    const sourceUrlRaw = clampText(String(req.body?.sourceUrl || "").trim(), 2000);
    const mimeType = clampText(String(req.body?.mimeType || "video/mp4").trim(), 120) || "video/mp4";
    if (!sessionId || !rowId) {
      return res.status(400).json({ error: "Falta sessionId o rowId." });
    }

    const requestedStoragePath = normalizeStorageFilePath(sourceStoragePathRaw);
    const firebaseObject = parseFirebaseStorageGoogleApisObjectUrl(sourceUrlRaw);
    const extracted = {
      bucketName: String(firebaseObject?.bucket || "").trim(),
      storagePath: requestedStoragePath || String(firebaseObject?.objectPath || "").trim()
    };
    const sourceStoragePath = String(extracted.storagePath || "").trim();
    if (!sourceStoragePath) {
      return res.status(400).json({ error: "Falta sourceStoragePath o sourceUrl válido." });
    }
    // Limita a assets de librería para evitar uso del endpoint como proxy/copy genérico.
    if (!/^podcaster\/library\//i.test(sourceStoragePath)) {
      return res.status(403).json({ error: "Solo se permite clonar assets de podcaster/library." });
    }

    const ext = getVideoExtension(mimeType);
    const sessionSlug = normalizeStorageSegment(sessionId, "session");
    const rowSlug = normalizeStorageSegment(rowId, "row");
    const speakerSlug = normalizeStorageSegment(speakerLabel, "speaker");
    const destPath = `podcaster/sessions/${sessionSlug}/owners/${normalizeStorageSegment(uid, "anon")}/videos/${rowSlug}-${speakerSlug}/${randomUUID()}.${ext}`;
    const targetBucket = await resolveWritableStorageBucket();
    const destFile = targetBucket.file(destPath);
    const token = randomUUID();

    const candidateBuckets = (() => {
      const buckets = getStorageBucketCandidates();
      const extra = extracted.bucketName ? [admin.storage().bucket(extracted.bucketName)] : [];
      const byName = new Map();
      [...extra, ...buckets].filter(Boolean).forEach((bucket) => {
        const name = String(bucket?.name || "").trim();
        if (!name || byName.has(name)) return;
        byName.set(name, bucket);
      });
      return Array.from(byName.values());
    })();

    let copied = false;
    let lastError = null;
    for (const bucket of candidateBuckets) {
      if (!bucket) continue;
      const srcFile = bucket.file(sourceStoragePath);
      const [exists] = await srcFile.exists().catch(() => [null]);
      if (exists === false) continue;
      try {
        await pipeline(
          srcFile.createReadStream(),
          destFile.createWriteStream({
            resumable: false,
            contentType: mimeType,
            metadata: {
              cacheControl: "public,max-age=86400",
              metadata: {
                firebaseStorageDownloadTokens: token,
                uid,
                sessionId,
                rowId,
                speakerLabel,
                kind: "public_scene_clone",
                sourceStoragePath
              }
            }
          })
        );
        copied = true;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!copied) {
      return res.status(502).json({
        error: "No se pudo clonar el video desde la librería.",
        detail: {
          sourceStoragePath,
          bucketsTried: candidateBuckets.map((b) => b?.name).filter(Boolean),
          lastError: lastError ? String(lastError?.message || lastError) : undefined
        }
      });
    }

    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${targetBucket.name}/o/${encodeURIComponent(destPath)}?alt=media&token=${token}`;
    return res.status(200).json({
      ok: true,
      video: {
        storagePath: destPath,
        downloadUrl,
        mimeType
      }
    });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo clonar video de la librería.") });
  }
});

app.use("/api/moodle", async (req, res, next) => {
  if (req.method === "OPTIONS") return next();
  try {
    req.authContext = await verifyFirebaseBearer(req);
    return next();
  } catch (error) {
    return res.status(Number(error?.status || 401)).json({ error: String(error?.message || "AUTH_REQUIRED") });
  }
});

app.get("/api/moodle/share-users", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const users = await listShareableMoodleUsers(uid);
    return res.status(200).json({ ok: true, users });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo cargar usuarios para compartir.") });
  }
});

app.post("/api/moodle/share-course", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const courseId = clampText(req.body?.courseId || "", 140);
    const mode = String(req.body?.mode || "").trim().toLowerCase();
    const target = await resolveShareTarget({
      targetUid: req.body?.targetUid || "",
      targetEmail: req.body?.targetEmail || ""
    });
    if (!courseId) {
      return res.status(400).json({ error: "Falta courseId." });
    }
    if (!["copy", "collaboration"].includes(mode)) {
      return res.status(400).json({ error: "Modo de compartición inválido." });
    }
    if (target.uid === uid) {
      return res.status(400).json({ error: "No puedes compartir contigo mismo." });
    }

    if (mode === "copy") {
      const result = await createMoodleCourseCopy({
        courseId,
        requesterUid: uid,
        targetUser: target,
      });
      return res.status(200).json({ ok: true, mode, result, target });
    }

    await shareMoodleCourseCollaboration({
      courseId,
      requesterUid: uid,
      targetUser: target,
      permisosEditar: req.body?.permissions?.editar === true,
      permisosCompartir: req.body?.permissions?.compartir === true,
    });
    return res.status(200).json({ ok: true, mode, target });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo compartir el curso.") });
  }
});

app.post("/api/moodle/delete-course", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const courseId = clampText(req.body?.courseId || "", 140);
    if (!courseId) {
      return res.status(400).json({ error: "Falta courseId." });
    }

    const courseRef = db.collection("moodleCourses").doc(courseId);
    const courseSnap = await courseRef.get();
    if (!courseSnap.exists) {
      return res.status(404).json({ error: "El curso no existe." });
    }

    const courseData = courseSnap.data() || {};
    const ownerUid = String(courseData?.userId || courseData?.uid || courseData?.ownerUid || "").trim();
    if (!ownerUid || ownerUid !== uid) {
      return res.status(403).json({ error: "Solo el propietario puede eliminar este curso." });
    }

    const moduleDocIds = new Set();
    const temas = Array.isArray(courseData?.temas) ? courseData.temas : [];
    temas.forEach((tema) => {
      const subtemas = Array.isArray(tema?.subtemas) ? tema.subtemas : [];
      subtemas.forEach((subtema) => {
        const modulosIds = Array.isArray(subtema?.modulosIds) ? subtema.modulosIds : [];
        modulosIds.forEach((moduloId) => {
          const normalized = clampText(moduloId, 200);
          if (!normalized) return;
          moduleDocIds.add(normalized.includes("_") ? normalized : `${courseId}_${normalized}`);
        });
      });
    });

    const batch = db.batch();
    batch.delete(courseRef);
    moduleDocIds.forEach((docId) => {
      batch.delete(db.collection("moodleCourses").doc(docId));
    });
    await batch.commit();

    return res.status(200).json({ ok: true, deletedCourseId: courseId, deletedModules: moduleDocIds.size });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo eliminar el curso.") });
  }
});

app.post("/api/moodle/instruction-images/import", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    if (!uid) {
      return res.status(401).json({ error: "AUTH_REQUIRED" });
    }

    const courseId = clampText(String(req.body?.courseId || "").trim(), 180);
    const moduleId = clampText(String(req.body?.moduleId || "").trim(), 220);
    const imageId = clampText(String(req.body?.imageId || "").trim(), 220) || `gemimg_${Date.now()}`;
    const sourceUrl = clampText(String(req.body?.sourceUrl || "").trim(), 2400);
    const requestedName = clampText(String(req.body?.name || "").trim(), 180) || `imagen_${imageId}`;
    const origin = clampText(String(req.body?.origin || "remote").trim(), 80) || "remote";

    if (!courseId || !moduleId || !sourceUrl) {
      return res.status(400).json({ error: "Faltan courseId, moduleId o sourceUrl." });
    }
    if (!isAllowedMoodleInstructionImageImportUrl(sourceUrl)) {
      return res.status(400).json({ error: "La URL de origen no está permitida para importación." });
    }

    const upstream = await fetchCompat(sourceUrl, { method: "GET", redirect: "follow" });
    if (!upstream.ok) {
      return res.status(502).json({ error: `No se pudo descargar la imagen remota (${upstream.status}).` });
    }

    const mimeType = String(upstream.headers.get("content-type") || "image/png").trim().toLowerCase();
    if (!mimeType.startsWith("image/")) {
      return res.status(415).json({ error: "La URL no devolvió una imagen válida." });
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (!buffer.length) {
      return res.status(400).json({ error: "La imagen remota llegó vacía." });
    }
    if (buffer.length > 8 * 1024 * 1024) {
      return res.status(413).json({ error: "La imagen remota supera 8 MB." });
    }

    const ext = getImageExtension(mimeType);
    const storagePath = `images/${normalizeStorageSegment(uid, "user")}/moodle-instructions/${normalizeStorageSegment(courseId, "curso")}/${normalizeStorageSegment(moduleId, "modulo")}/${normalizeStorageSegment(imageId, "imagen")}.${ext}`;
    const asset = await uploadScreenshotAsset({
      path: storagePath,
      buffer,
      mimeType,
      metadata: {
        origin: "moodleCourseInstructionsImport",
        sourceUrl: sourceUrl.slice(0, 700),
        courseId,
        moduleId,
        imageId,
        fileName: requestedName,
        requestedOrigin: origin
      }
    });

    return res.status(200).json({
      ok: true,
      image: {
        imageId,
        name: requestedName,
        mimeType,
        storagePath: asset.path,
        downloadUrl: asset.downloadUrl,
        origin,
        updatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo importar la imagen remota del módulo.") });
  }
});

app.post("/api/moodle/extract-featured-source", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    if (!uid) {
      return res.status(401).json({ error: "AUTH_REQUIRED" });
    }

    const sourceUrl = clampText(String(req.body?.url || "").trim(), 2400);
    if (!sourceUrl) {
      return res.status(400).json({ error: "Falta la URL de la fuente destacada." });
    }

    let parsed = null;
    try {
      parsed = new URL(sourceUrl);
    } catch (_) {
      return res.status(400).json({ error: "La URL de la fuente destacada no es válida." });
    }

    const protocol = String(parsed.protocol || "").toLowerCase();
    if (protocol !== "https:" && protocol !== "http:") {
      return res.status(400).json({ error: "Solo se permiten URLs http o https." });
    }
    if (isPrivateHostname(parsed.hostname)) {
      return res.status(403).json({ error: "No se permiten hosts privados o locales para esta extracción." });
    }

    const upstream = await fetchCompat(parsed.toString(), {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "CharlyBrown-FeaturedSource/1.0",
        "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5"
      }
    });

    if (!upstream.ok) {
      return res.status(502).json({ error: `No se pudo leer la fuente web (${upstream.status}).` });
    }

    const contentType = String(upstream.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      return res.status(415).json({ error: "La fuente web no devolvió contenido textual legible." });
    }

    const html = String(await upstream.text()).trim();
    if (!html) {
      return res.status(422).json({ error: "La fuente web respondió vacía." });
    }

    const extraction = extractFeaturedSourceTextFromHtml(html, String(upstream.url || parsed.toString()).trim());
    const extractedText = String(extraction?.extractedText || "").trim();
    if (!extractedText || extractedText.length < 120) {
      return res.status(422).json({ error: "No se pudo extraer suficiente contenido legible de la fuente web." });
    }

    return res.status(200).json({
      ok: true,
      source: {
        finalUrl: String(extraction?.finalUrl || upstream.url || parsed.toString()).trim(),
        title: String(extraction?.title || "").trim(),
        extractedText: extractedText.slice(0, 120000)
      }
    });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo extraer la fuente destacada.") });
  }
});

app.post("/api/podcaster/sessions/save", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const source = req.body?.session && typeof req.body.session === "object" ? req.body.session : null;
    if (!source) {
      return res.status(400).json({ error: "Falta payload session." });
    }
    const sanitized = sanitizePodcasterSession(source);
    if (!sanitized.id) {
      sanitized.id = `session_${randomUUID().slice(0, 12)}`;
    }
    const serialized = JSON.stringify(sanitized);
    if (Buffer.byteLength(serialized, "utf8") > MAX_PODCASTER_SESSION_BYTES) {
      return res.status(413).json({ error: "La sesión excede el tamaño permitido." });
    }
    const sessionRef = db.collection("podcaster_sessions").doc(sanitized.id);
    await db.runTransaction(async (tx) => {
      const existingSnap = await tx.get(sessionRef);
      const existing = existingSnap.exists ? (existingSnap.data() || {}) : null;
      if (existing && String(existing.ownerId || "") !== uid) {
        const err = new Error("No puedes sobrescribir una sesión de otro usuario.");
        err.status = 403;
        throw err;
      }
      tx.set(sessionRef, {
        ownerId: uid,
        title: sanitized.title,
        archived: sanitized.archived === true,
        publicar: sanitized.publicar === true,
        sessionUpdatedAt: sanitized.updatedAt || new Date().toISOString(),
        session: sanitized,
        sharedWithIds: Array.isArray(existing?.sharedWithIds) ? existing.sharedWithIds : [],
        sharedWith: Array.isArray(existing?.sharedWith) ? existing.sharedWith : [],
        createdAt: existing?.createdAt || admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    });
    return res.status(200).json({
      ok: true,
      sessionId: sanitized.id,
      ownerId: uid,
      savedAt: new Date().toISOString()
    });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo guardar la sesión.") });
  }
});

app.post("/api/podcaster/sessions/share", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const sessionId = clampText(req.body?.sessionId || "", 120);
    if (!sessionId) {
      return res.status(400).json({ error: "Falta sessionId." });
    }
    const target = await resolveShareTarget({
      targetUid: req.body?.targetUid || "",
      targetEmail: req.body?.targetEmail || ""
    });
    if (target.uid === uid) {
      return res.status(400).json({ error: "No puedes compartir contigo mismo." });
    }
    const sessionRef = db.collection("podcaster_sessions").doc(sessionId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(sessionRef);
      if (!snap.exists) {
        const err = new Error("Sesión no encontrada. Guarda la sesión antes de compartir.");
        err.status = 404;
        throw err;
      }
      const data = snap.data() || {};
      if (String(data.ownerId || "") !== uid) {
        const err = new Error("Solo el propietario puede compartir la sesión.");
        err.status = 403;
        throw err;
      }
      const sharedWithIds = Array.isArray(data.sharedWithIds) ? data.sharedWithIds.map((item) => String(item || "").trim()).filter(Boolean) : [];
      const nextIds = Array.from(new Set([...sharedWithIds, target.uid]));
      const sharedWith = Array.isArray(data.sharedWith) ? data.sharedWith : [];
      const withoutTarget = sharedWith.filter((entry) => String(entry?.uid || "").trim() !== target.uid);
      withoutTarget.push({
        uid: target.uid,
        email: target.email || null,
        sharedAt: new Date().toISOString(),
        sharedBy: uid
      });
      tx.update(sessionRef, {
        sharedWithIds: nextIds,
        sharedWith: withoutTarget,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });
    return res.status(200).json({
      ok: true,
      sessionId,
      target
    });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo compartir la sesión.") });
  }
});

app.get("/api/podcaster/sessions/list", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const [ownedSnap, sharedSnap] = await Promise.all([
      db.collection("podcaster_sessions").where("ownerId", "==", uid).limit(80).get(),
      db.collection("podcaster_sessions").where("sharedWithIds", "array-contains", uid).limit(80).get()
    ]);
    const merged = new Map();
    [...ownedSnap.docs, ...sharedSnap.docs].forEach((docSnap) => {
      const data = docSnap.data() || {};
      const sessionData = data.session && typeof data.session === "object" ? data.session : null;
      if (!sessionData) return;
      merged.set(docSnap.id, {
        ...sessionData,
        publicar: data.publicar === true,
        cloudMeta: {
          ownerId: String(data.ownerId || "").trim() || null,
          savedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : null
        }
      });
    });
    const sessions = Array.from(merged.values()).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    return res.status(200).json({ ok: true, sessions });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo listar sesiones.") });
  }
});

app.get("/api/podcaster/sessions/list-videos", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    if (!uid) {
      return res.status(401).json({ error: "AUTH_REQUIRED" });
    }
    const sessionId = String(req.query?.sessionId || req.query?.sessionSlug || "").trim();
    const includeAllOwners = String(req.query?.allOwners || "").trim() === "1";
    if (!sessionId) {
      return res.status(400).json({ error: "Falta sessionId." });
    }

    const sessionSlug = normalizeStorageSegment(sessionId, "session");
    const ownerSlug = normalizeStorageSegment(uid, "anon");
    const prefixes = includeAllOwners
      ? [`podcaster/sessions/${sessionSlug}/owners/`, `podcaster/sessions/${sessionSlug}/videos/`]
      : [
        `podcaster/sessions/${sessionSlug}/owners/${ownerSlug}/videos/`,
        `podcaster/sessions/${sessionSlug}/videos/`
      ];
    const allowedExts = new Set(["mp4", "webm", "mov", "mkv", "png", "jpg", "jpeg", "webp", "gif"]);

    const buckets = getStorageBucketCandidates();
    const filesByPath = new Map();

    await Promise.allSettled(buckets.map(async (bucket) => {
      if (!bucket) return;
      await Promise.allSettled(prefixes.map(async (prefix) => {
        try {
          const [files] = await bucket.getFiles({ prefix, maxResults: 200 });
          for (const file of files) {
            const filePath = String(file.name || "").trim();
            if (!filePath || filesByPath.has(filePath)) continue;
            const ext = filePath.split(".").pop().toLowerCase();
            if (!allowedExts.has(ext)) continue;
            const [metadata] = await file.getMetadata().catch(() => [{}]);
            const token = String(metadata?.metadata?.firebaseStorageDownloadTokens || "").trim();
            const mimeType = String(metadata?.contentType || "").trim().toLowerCase()
              || (["png", "jpg", "jpeg", "webp", "gif"].includes(ext) ? `image/${ext === "jpg" ? "jpeg" : ext}` : "video/mp4");
            const type = mimeType.startsWith("image/") ? "image" : "video";
            const downloadUrl = token
              ? `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media&token=${token}`
              : `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media`;
            const pathParts = filePath.split("/");
            const fileIdx = pathParts.indexOf("videos");
            const rowFolder = fileIdx >= 0 && pathParts[fileIdx + 1]
              ? pathParts[fileIdx + 1]
              : ((pathParts[pathParts.length - 1] || "").match(/^(row_[^_/]+?)(?:[-_]|$)/)?.[1] || "");
            const ownerIdx = pathParts.indexOf("owners");
            const ownerFolder = ownerIdx >= 0 && pathParts[ownerIdx + 1] ? pathParts[ownerIdx + 1] : "";
            const fileName = pathParts[pathParts.length - 1] || filePath;
            filesByPath.set(filePath, {
              name: fileName,
              ownerFolder,
              rowFolder,
              storagePath: filePath,
              downloadUrl,
              mimeType,
              type,
              size: Number(metadata?.size || 0),
              updatedAt: String(metadata?.updated || metadata?.timeCreated || "").trim() || null
            });
          }
        } catch (_) {
          // Ignore per-prefix errors and try next prefix
        }
      }));
    }));

    const videos = Array.from(filesByPath.values())
      .sort((a, b) => {
        // Sort by rowFolder first, then by updatedAt desc
        if (a.rowFolder < b.rowFolder) return -1;
        if (a.rowFolder > b.rowFolder) return 1;
        return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
      });

    return res.status(200).json({ ok: true, prefix: prefixes[0], prefixes, videos });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo listar videos de la sesión.") });
  }
});

app.get("/api/podcaster/sessions/list-audios", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    if (!uid) {
      return res.status(401).json({ error: "AUTH_REQUIRED" });
    }
    const sessionId = String(req.query?.sessionId || req.query?.sessionSlug || "").trim();
    if (!sessionId) {
      return res.status(400).json({ error: "Falta sessionId." });
    }

    const sessionSlug = normalizeStorageSegment(sessionId, "session");
    const ownerSlug = normalizeStorageSegment(uid, "anon");
    const prefix = `podcaster/sessions/${sessionSlug}/owners/${ownerSlug}/audio/`;

    const buckets = getStorageBucketCandidates();
    const filesByPath = new Map();

    await Promise.allSettled(buckets.map(async (bucket) => {
      if (!bucket) return;
      try {
        const [files] = await bucket.getFiles({ prefix, maxResults: 400 });
        for (const file of files) {
          const filePath = String(file.name || "").trim();
          if (!filePath || filesByPath.has(filePath)) continue;
          const ext = String(filePath.split(".").pop() || "").toLowerCase();
          if (!["wav", "mp3", "ogg", "m4a", "flac", "aac", "webm"].includes(ext)) continue;
          const [metadata] = await file.getMetadata().catch(() => [{}]);
          const token = String(metadata?.metadata?.firebaseStorageDownloadTokens || "").trim();
          const downloadUrl = token
            ? `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media&token=${token}`
            : `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media`;
          const pathParts = filePath.split("/");
          const audioIdx = pathParts.indexOf("audio");
          const rowFolder = audioIdx >= 0 && pathParts[audioIdx + 1] ? pathParts[audioIdx + 1] : "";
          const fileName = pathParts[pathParts.length - 1] || filePath;
          filesByPath.set(filePath, {
            name: fileName,
            rowFolder,
            storagePath: filePath,
            downloadUrl,
            contentType: String(metadata?.contentType || `audio/${ext === "wav" ? "wav" : ext}`).trim(),
            size: Number(metadata?.size || 0),
            updatedAt: String(metadata?.updated || metadata?.timeCreated || "").trim() || null
          });
        }
      } catch (_) {
        // Ignore per-bucket errors and continue.
      }
    }));

    const audios = Array.from(filesByPath.values())
      .sort((a, b) => {
        if (a.rowFolder < b.rowFolder) return -1;
        if (a.rowFolder > b.rowFolder) return 1;
        return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
      });

    return res.status(200).json({ ok: true, prefix, audios });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo listar audios de la sesión.") });
  }
});

app.post("/api/podcaster/sessions/delete", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const sessionId = clampText(req.body?.sessionId || "", 140);
    if (!sessionId) {
      return res.status(400).json({ error: "Falta sessionId." });
    }
    const sessionRef = db.collection("podcaster_sessions").doc(sessionId);
    const snap = await sessionRef.get();
    if (!snap.exists) {
      return res.status(200).json({ ok: true, sessionId, deleted: false, reason: "not_found" });
    }
    const data = snap.data() || {};
    if (String(data.ownerId || "").trim() !== uid) {
      return res.status(403).json({ error: "Solo el propietario puede eliminar la sesión." });
    }
    await sessionRef.delete();
    return res.status(200).json({ ok: true, sessionId, deleted: true });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo eliminar la sesión.") });
  }
});

app.post("/api/podcaster/speaker-portraits/generate", async (req, res) => {
  if (!ensureGeminiKey(res)) return;
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const sessionId = clampText(req.body?.sessionId || "", 140);
    const speakerLabel = clampText(req.body?.speakerLabel || req.body?.speaker || "", 80);
    const speakerName = clampText(req.body?.speakerName || req.body?.speaker || "", 120) || speakerLabel || "Locutor";
    const voiceName = clampText(req.body?.voiceName || "", 80);
    const genderGroup = clampText(req.body?.genderGroup || "", 40);
    const expression = clampText(req.body?.expression || "Neutral", 80) || "Neutral";
    const scenarioPrompt = clampText(req.body?.scenarioPrompt || "", 2400);
    const scenarioId = clampText(req.body?.scenarioId || "", 80);
    const scenarioImageUrl = clampText(req.body?.scenarioImageUrl || "", 3200);
    const scenarioImageStoragePath = clampText(req.body?.scenarioImageStoragePath || "", 700);
    const referenceImageDataUrl = String(req.body?.referenceImageDataUrl || "").trim();
    const referenceImageName = clampText(req.body?.referenceImageName || "", 180);
    const regenerate = req.body?.regenerate === true;
    const previousStoragePath = clampText(req.body?.previousStoragePath || "", 700);
    const requestedCandidates = Array.isArray(req.body?.modelCandidates) ? req.body.modelCandidates : [];
    const imageModels = Array.from(new Set([
      normalizeModel(req.body?.model || DEFAULT_PODCASTER_IMAGE_MODEL),
      ...requestedCandidates.map((item) => normalizeModel(item || "")),
      ...PODCASTER_IMAGE_MODEL_CANDIDATES
    ].filter(Boolean)));
    const contentMode = clampText(req.body?.contentMode || "podcast", 80) || "podcast";

    if (!sessionId) {
      return res.status(400).json({ error: "Falta sessionId." });
    }
    if (!speakerLabel) {
      return res.status(400).json({ error: "Falta speakerLabel." });
    }
    const normalizedGenderGroup = String(genderGroup || "").trim().toLowerCase();
    const genderMustLine = normalizedGenderGroup.startsWith("fem")
      ? "El sujeto debe ser inequívocamente una mujer adulta. English: adult female podcast host only."
      : normalizedGenderGroup.startsWith("masc")
        ? "El sujeto debe ser inequívocamente un hombre adulto. English: adult male podcast host only."
        : "";
    const genderAvoidLine = normalizedGenderGroup.startsWith("fem")
      ? "Prohibido: barba, bigote, sombra de barba, mandíbula excesivamente masculina, rasgos masculinos dominantes, apariencia andrógina."
      : normalizedGenderGroup.startsWith("masc")
        ? "Prohibido: rasgos femeninos dominantes, apariencia andrógina, maquillaje glamoroso o presentación femenina."
        : "";
    const characterPrompt = buildBackendPodcasterCharacterPrompt({
      speakerLabel,
      speakerName,
      voiceName,
      genderGroup,
      expression,
      contentMode
    });
    const studioScenePrompt = buildBackendPodcasterStudioScenePrompt({
      speakerLabel,
      speakerName,
      scenarioPrompt,
      expression,
      singleSubjectOnly: true,
      contentMode
    });
    const scenarioReference = await loadOptionalImageReference({
      storagePath: scenarioImageStoragePath,
      url: scenarioImageUrl,
    });
    const speakerReference = await loadOptionalImageReference({
      dataUrl: referenceImageDataUrl
    });
    const resolvedScenarioReference = scenarioReference || await loadScenarioReferenceFromSession({
      uid,
      sessionId,
      scenarioId
    });

    const prompt = [
      speakerReference ? "PRIORIDAD 1: conservar la identidad del locutor a partir de la imagen adjunta del rostro. Deben mantenerse facciones, estructura facial, ojos, nariz, boca, peinado, línea del cabello y edad aparente." : "Genera un retrato coherente con la identidad textual del locutor.",
      speakerReference ? "No reemplazar la cara por otra persona. No reinterpretar libremente el rostro. No cambiar género, edad aparente, rasgos centrales ni etnia percibida de la referencia del locutor." : "",
      "Edita la imagen de referencia para convertirla en un retrato fotorealista de un solo locutor dentro del mismo set.",
      resolvedScenarioReference ? "PRIORIDAD 2: usar la imagen adjunta del escenario para conservar arquitectura, fondo, materiales, distribución, iluminación base y ángulo del set." : "No hay imagen de referencia disponible; recrear el escenario solo a partir del prompt textual seleccionado.",
      resolvedScenarioReference ? "El escenario debe coincidir con la referencia del set sin alterar la identidad facial del locutor." : "Recrear de forma consistente la arquitectura, fondo, materiales, distribución e iluminación del escenario descrito.",
      "No inventar ni sustituir otra cabina, fondo o composición global.",
      `Nombre del locutor: ${speakerName}.`,
      `Etiqueta de locutor: ${speakerLabel}.`,
      scenarioId ? `Escenario seleccionado: ${scenarioId}.` : "",
      voiceName ? `Voz de referencia: ${voiceName}.` : "",
      genderGroup ? `Presentación de género objetivo: ${genderGroup}.` : "",
      genderMustLine,
      genderAvoidLine,
      `Expresion: ${expression}.`,
      characterPrompt ? `Prompt de personaje obligatorio: ${characterPrompt}` : "",
      studioScenePrompt ? `Escenario de locución obligatorio: ${studioScenePrompt}` : "",
      "Insertar solo al locutor activo dentro del set ya existente.",
      "Plano medio corto, enfoque en rostro, sin texto, sin logotipos, sin marcas de agua.",
      "Retrato en tres cuartos o semi perfil natural, evitando frontalidad total y evitando contacto visual directo con la cámara.",
      "Estilo hiperrealista, piel natural, alta definición."
    ].filter(Boolean).join("\n");

    let lastStatus = 502;
    let lastErrorDetail = "No se pudo generar retrato con los modelos disponibles.";
    let base64 = "";
    let mimeType = "image/png";
    let resolvedModel = imageModels[0] || DEFAULT_PODCASTER_IMAGE_MODEL;
    for (const imageModel of imageModels) {
      const requestUrl = `${GEMINI_BASE}/models/${encodeURIComponent(imageModel)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
      const requestWithOptionalReference = async (includeScenarioReference) => {
        const parts = [
          { text: prompt },
          ...(speakerReference ? [
            { text: `Imagen 1: referencia principal del locutor${referenceImageName ? ` (${referenceImageName})` : ""}. Usar esta imagen para identidad facial y apariencia del sujeto.` },
            {
              inlineData: {
                mimeType: speakerReference.mimeType,
                data: speakerReference.buffer.toString("base64")
              }
            }
          ] : []),
          ...(includeScenarioReference && resolvedScenarioReference ? [
            { text: "Imagen 2: referencia del escenario. Usar esta imagen para el set, fondo, iluminación y composición general." },
            {
              inlineData: {
                mimeType: resolvedScenarioReference.mimeType,
                data: resolvedScenarioReference.buffer.toString("base64")
              }
            }
          ] : [])
        ];
        const upstream = await fetchCompat(requestUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              role: "user",
              parts
            }],
            generationConfig: {
              responseModalities: ["TEXT", "IMAGE"]
            }
          })
        });
        const data = await safeJson(upstream);
        return { upstream, data };
      };

      let { upstream, data } = await requestWithOptionalReference(true);
      if (!upstream.ok && upstream.status === 400 && resolvedScenarioReference) {
        ({ upstream, data } = await requestWithOptionalReference(false));
      }
      if (!upstream.ok) {
        const detail = String(data?.error?.message || data?.error || `HTTP ${upstream.status}`).trim();
        lastStatus = Number(upstream.status || 502);
        lastErrorDetail = `${imageModel}: ${detail}`;
        if ([400, 401, 403, 404].includes(lastStatus)) {
          continue;
        }
        return res.status(lastStatus).json(data);
      }
      const parts = Array.isArray(data?.candidates?.[0]?.content?.parts) ? data.candidates[0].content.parts : [];
      const inline = parts.find((part) => part?.inlineData?.data || part?.inline_data?.data) || null;
      base64 = String(inline?.inlineData?.data || inline?.inline_data?.data || "").trim();
      mimeType = String(inline?.inlineData?.mimeType || inline?.inline_data?.mimeType || "image/png").trim() || "image/png";
      if (!base64) {
        lastStatus = 502;
        lastErrorDetail = `${imageModel}: sin inlineData de imagen`;
        continue;
      }
      resolvedModel = imageModel;
      break;
    }
    if (!base64) {
      return res.status(lastStatus >= 400 ? lastStatus : 502).json({ error: lastErrorDetail });
    }
    const buffer = Buffer.from(base64, "base64");
    if (!buffer.length || buffer.length > MAX_SPEAKER_PORTRAIT_BYTES) {
      return res.status(413).json({ error: "La imagen generada excede el tamaño permitido." });
    }

    const ext = getScreenshotExtension(mimeType);
    const speakerSlug = normalizeStorageSegment(speakerLabel, "speaker");
    const sessionSlug = normalizeStorageSegment(sessionId, "session");
    const portraitId = randomUUID();
    const storagePath = `podcaster/sessions/${sessionSlug}/owners/${normalizeStorageSegment(uid, "anon")}/speakers/${speakerSlug}/${portraitId}.${ext}`;
    const asset = await uploadScreenshotAsset({
      path: storagePath,
      buffer,
      mimeType,
      metadata: {
        uid,
        sessionId,
        speakerLabel,
        speakerName,
        voiceName,
        genderGroup,
        expression,
        scenarioId,
        scenarioImageUrl,
        scenarioImageStoragePath,
        referenceImageName,
        model: resolvedModel
      }
    });

    if (regenerate && previousStoragePath && previousStoragePath !== storagePath) {
      await deleteStoragePath(previousStoragePath).catch(() => {});
    }

    return res.status(200).json({
      ok: true,
      portrait: {
        speaker: speakerLabel,
        downloadUrl: asset.downloadUrl,
        storagePath: asset.path,
        voiceName,
        genderGroup,
        expression,
        scenarioPrompt,
        scenarioId,
        scenarioImageUrl,
        scenarioImageStoragePath,
        mimeType,
        model: resolvedModel,
        promptVersion: "podcaster_v1",
        updatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo generar retrato de locutor.") });
  }
});

app.post("/api/podcaster/scenario-images/generate", async (req, res) => {
  if (!ensureGeminiKey(res)) return;
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const sessionId = clampText(req.body?.sessionId || "", 140);
    const scenarioId = clampText(req.body?.scenarioId || "", 80);
    const title = clampText(req.body?.title || "Escenario", 120) || "Escenario";
    const promptSource = clampText(req.body?.prompt || "", 4000);
    const referenceImageDataUrl = String(req.body?.referenceImageDataUrl || "").trim();
    const referenceImageName = clampText(req.body?.referenceImageName || "", 180);
    const regenerate = req.body?.regenerate === true;
    const previousStoragePath = clampText(req.body?.previousStoragePath || "", 700);
    const requestedCandidates = Array.isArray(req.body?.modelCandidates) ? req.body.modelCandidates : [];
    const imageModels = Array.from(new Set([
      normalizeModel(req.body?.model || DEFAULT_PODCASTER_IMAGE_MODEL),
      ...requestedCandidates.map((item) => normalizeModel(item || "")),
      ...PODCASTER_IMAGE_MODEL_CANDIDATES
    ].filter(Boolean)));

    if (!sessionId) {
      return res.status(400).json({ error: "Falta sessionId." });
    }
    if (!scenarioId) {
      return res.status(400).json({ error: "Falta scenarioId." });
    }
    if (!promptSource) {
      return res.status(400).json({ error: "Falta prompt del escenario." });
    }

    const scenarioReference = await loadOptionalImageReference({
      dataUrl: referenceImageDataUrl
    });
    const prompt = [
      "Genera una imagen fotorealista de un escenario de podcast profesional.",
      scenarioReference ? `La imagen adjunta es referencia visual del set y debe guiar arquitectura, composición, materiales y layout (${referenceImageName || "referencia del usuario"}).` : "",
      `Escenario: ${title}.`,
      `Prompt base obligatorio: ${promptSource}`,
      "Debe ser un set vacío, sin personas.",
      "Debe verse como una cabina de grabación o estudio editorial premium para podcast/video podcast.",
      "Incluir elementos reales del set: micrófono broadcast, consola o mixer, monitores, iluminación cinematográfica suave, detalles acústicos visibles.",
      "Composición horizontal 16:9, lista para usarse como escenario visual de videos.",
      "Sin texto, sin tipografía, sin logos, sin marcas de agua, sin interfaz.",
      "Estilo hiperrealista, alta definición, profundidad de campo natural."
    ].join("\n");

    let lastStatus = 502;
    let lastErrorDetail = "No se pudo generar imagen del escenario con los modelos disponibles.";
    let base64 = "";
    let mimeType = "image/png";
    let resolvedModel = imageModels[0] || DEFAULT_PODCASTER_IMAGE_MODEL;
    for (const imageModel of imageModels) {
      const upstream = await fetchCompat(
        `${GEMINI_BASE}/models/${encodeURIComponent(imageModel)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              role: "user",
              parts: [
                { text: prompt },
                ...(scenarioReference ? [{
                  inlineData: {
                    mimeType: scenarioReference.mimeType,
                    data: scenarioReference.buffer.toString("base64")
                  }
                }] : [])
              ]
            }],
            generationConfig: {
              responseModalities: ["TEXT", "IMAGE"]
            }
          })
        }
      );
      const data = await safeJson(upstream);
      if (!upstream.ok) {
        const detail = String(data?.error?.message || data?.error || `HTTP ${upstream.status}`).trim();
        lastStatus = Number(upstream.status || 502);
        lastErrorDetail = `${imageModel}: ${detail}`;
        if ([400, 401, 403, 404].includes(lastStatus)) {
          continue;
        }
        return res.status(lastStatus).json(data);
      }
      const parts = Array.isArray(data?.candidates?.[0]?.content?.parts) ? data.candidates[0].content.parts : [];
      const inline = parts.find((part) => part?.inlineData?.data || part?.inline_data?.data) || null;
      base64 = String(inline?.inlineData?.data || inline?.inline_data?.data || "").trim();
      mimeType = String(inline?.inlineData?.mimeType || inline?.inline_data?.mimeType || "image/png").trim() || "image/png";
      if (!base64) {
        lastStatus = 502;
        lastErrorDetail = `${imageModel}: sin inlineData de imagen`;
        continue;
      }
      resolvedModel = imageModel;
      break;
    }
    if (!base64) {
      return res.status(lastStatus >= 400 ? lastStatus : 502).json({ error: lastErrorDetail });
    }

    const buffer = Buffer.from(base64, "base64");
    if (!buffer.length || buffer.length > MAX_SPEAKER_PORTRAIT_BYTES) {
      return res.status(413).json({ error: "La imagen generada del escenario excede el tamaño permitido." });
    }

    const ext = getScreenshotExtension(mimeType);
    const sessionSlug = normalizeStorageSegment(sessionId, "session");
    const scenarioSlug = normalizeStorageSegment(scenarioId, "scenario");
    const storagePath = `podcaster/sessions/${sessionSlug}/owners/${normalizeStorageSegment(uid, "anon")}/scenarios/${scenarioSlug}/${randomUUID()}.${ext}`;
    const asset = await uploadScreenshotAsset({
      path: storagePath,
      buffer,
      mimeType,
      metadata: {
        uid,
        sessionId,
        scenarioId,
        title,
        model: resolvedModel
      }
    });

    if (regenerate && previousStoragePath && previousStoragePath !== storagePath) {
      await deleteStoragePath(previousStoragePath).catch(() => {});
    }

    return res.status(200).json({
      ok: true,
      image: {
        id: scenarioId,
        title,
        downloadUrl: asset.downloadUrl,
        storagePath: asset.path,
        mimeType,
        model: resolvedModel,
        updatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo generar imagen del escenario.") });
  }
});

app.post("/api/podcaster/dialogue-videos/generate", async (req, res) => {
  if (!ensureGeminiKey(res)) return;
  cleanupDialogueVideoJobs();
  try {
    const uid = String(req.authContext?.uid || "").trim();
    if (!uid) {
      return res.status(401).json({ error: "AUTH_REQUIRED" });
    }
    const activeHeavyWorkKind = getActiveHeavyWorkKind();
    const activeHeavyWorkJobId = getActiveHeavyWorkJobId();
    if (activeHeavyWorkKind) {
      return res.status(503).json(buildBackendBusyJson("dialogue_video", activeHeavyWorkJobId));
    }
    const jobId = clampExportId(randomUUID());
    const initial = upsertDialogueVideoJob(jobId, {
      status: "running",
      stage: "queued",
      progress: 0.02,
      hint: "Encolando generacion de video."
    });
    const authHeader = String(req.headers.authorization || "").trim();
    const loopbackBaseUrl = `http://127.0.0.1:${PORT}`;
    const requestBody = req.body && typeof req.body === "object"
      ? { ...req.body, __job: { jobId } }
      : { __job: { jobId } };
    void (async () => {
      try {
        upsertDialogueVideoJob(jobId, {
          status: "running",
          stage: "dispatch",
          progress: 0.08,
          hint: "Iniciando generacion en backend."
        });
        const syncResponse = await fetchCompat(`${loopbackBaseUrl}/api/podcaster/dialogue-videos/generate-sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(authHeader ? { Authorization: authHeader } : {})
          },
          body: JSON.stringify(requestBody)
        });
        const data = await safeJson(syncResponse);
        if (!syncResponse.ok) {
          const errorMessage = extractErrorText(data, `HTTP ${syncResponse.status}`) || "dialogue_video_generate_failed";
          upsertDialogueVideoJob(jobId, {
            status: "error",
            stage: "error",
            progress: 1,
            hint: errorMessage,
            error: {
              error: errorMessage,
              code: String(data?.code || "").trim() || undefined,
              status: Number(syncResponse.status || 500),
              detail: data?.detail && typeof data.detail === "object" ? data.detail : data
            }
          });
          return;
        }
        upsertDialogueVideoJob(jobId, {
          status: "ready",
          stage: "ready",
          progress: 1,
          hint: "Video generado.",
          dialogueVideo: data?.dialogueVideo && typeof data.dialogueVideo === "object" ? data.dialogueVideo : null
        });
      } catch (error) {
        upsertDialogueVideoJob(jobId, {
          status: "error",
          stage: "error",
          progress: 1,
          hint: String(error?.message || "dialogue_video_generate_failed").trim() || "No se pudo generar el video.",
          error: {
            error: String(error?.message || "dialogue_video_generate_failed").trim(),
            status: Number(error?.status || 500) || 500
          }
        });
      }
    })();
    return res.status(202).json(sanitizeDialogueVideoJobPublicPayload(initial));
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({
      error: String(error?.code || error?.message || "dialogue_video_job_failed").trim()
    });
  }
});

app.get("/api/podcaster/dialogue-videos/generate-status", async (req, res) => {
  cleanupDialogueVideoJobs();
  const jobId = clampExportId(req.query?.jobId || "");
  if (!jobId) return res.status(400).json({ error: "Falta jobId." });
  const job = getDialogueVideoJob(jobId);
  if (!job) return res.status(404).json({ error: "job_not_found", code: "job_not_found" });
  return res.status(200).json(sanitizeDialogueVideoJobPublicPayload(job));
});

app.post("/api/podcaster/dialogue-videos/generate-sync", async (req, res) => {
  if (!ensureGeminiKey(res)) return;
  const jobMeta = req.body?.__job && typeof req.body.__job === "object" ? req.body.__job : null;
  const jobId = clampExportId(jobMeta?.jobId || "") || clampExportId(randomUUID());
  const slot = tryAcquireHeavyWorkSlot("dialogue_video", jobId);
  if (!slot?.ok) {
    const busyError = slot?.error || buildHeavyWorkBusyError("dialogue_video", getActiveHeavyWorkJobId());
    return res.status(Number(busyError?.status || 503)).json(buildBackendBusyJson("dialogue_video", String(busyError?.detail?.activeJobId || "").trim()));
  }
  try {
    const updateDialogueVideoJob = (patch = {}) => {
      if (!jobId) return null;
      return upsertDialogueVideoJob(jobId, patch);
    };
    const uid = String(req.authContext?.uid || "").trim();
    const sessionId = clampText(req.body?.sessionId || "", 140);
    const rowId = clampText(req.body?.rowId || "", 120);
    const speakerLabel = clampText(req.body?.speakerLabel || "", 80);
    const speakerName = clampText(req.body?.speakerName || "", 120) || speakerLabel || "Locutor";
    const counterpartSpeakerLabel = clampText(req.body?.counterpartSpeakerLabel || "", 80);
    const counterpartSpeakerName = clampText(req.body?.counterpartSpeakerName || "", 120) || counterpartSpeakerLabel;
    const voiceName = clampText(req.body?.voiceName || "", 80);
    const genderGroup = clampText(req.body?.genderGroup || "", 40);
    const expression = clampText(req.body?.expression || "Neutral", 80) || "Neutral";
    const promptProfile = clampText(req.body?.promptProfile || "", 80);
    let scenarioPrompt = clampText(req.body?.scenarioPrompt || "", 2400);
    const sceneDescription = clampText(req.body?.sceneDescription || "", 1600);
    const visualNotes = clampText(req.body?.visualNotes || "", 2200);
    const onScreenText = clampText(req.body?.onScreenText || "", 1200);
    const transition = clampText(req.body?.transition || "", 1200);
    const videoDirective = clampText(req.body?.videoDirective || "", 1400);
    const scenePrompt = clampText(req.body?.scenePrompt || "", 1200);
    const contentMode = String(req.body?.contentMode || "").trim().toLowerCase();
    const isReel = contentMode === "reel" || req.body?.isReel === true;
    const educationalVideo = req.body?.educationalVideo === true || req.body?.videoMode === true || contentMode === "educational" || isReel;
    const rewriteScenarioPromptForEducationalVideo = (prompt = "") => {
      const text = String(prompt || "").replace(/\s+/g, " ").trim();
      if (!text) return "";
      const rewritten = text
        .replace(/\bcabina premium de podcast\b/gi, "entorno visual educativo premium")
        .replace(/\bcabina de podcast\b/gi, "entorno visual educativo premium")
        .replace(/\bcabina premium de radio\b/gi, "entorno visual educativo premium")
        .replace(/\bcabina de radio\b/gi, "entorno visual educativo premium")
        .replace(/\bestudio editorial premium para podcast\/video podcast\b/gi, "entorno editorial educativo premium")
        .replace(/\bestudio (?:premium )?de podcast\b/gi, "entorno visual educativo premium")
        .replace(/\bestudio (?:premium )?de radio\b/gi, "entorno visual educativo premium")
        .replace(/\bestudio (?:premium )?de grabaci[oó]n\b/gi, "entorno visual educativo premium")
        .replace(/\bpodcast\/video podcast\b/gi, "video educativo")
        .replace(/\bpodcast\b/gi, "video educativo")
        .replace(/\bradio\b/gi, "educación");
      // Si aún huele a cabina/estudio, fuerza un set educativo para evitar “cabina de radio”.
      const lower = rewritten.toLowerCase();
      const hasBooth = /\bcabina\b/.test(lower) || /\bestudio\b/.test(lower) || /\bmicr[oó]fono\b/.test(lower);
      return hasBooth ? "Entorno visual educativo premium (aula moderna, laboratorio o set didáctico)." : rewritten;
    };
    if (educationalVideo) {
      scenarioPrompt = rewriteScenarioPromptForEducationalVideo(scenarioPrompt);
    }
    const imagePrompts = Array.isArray(req.body?.imagePrompts)
      ? req.body.imagePrompts.slice(0, 3).map((prompt) => clampText(prompt || "", 1200)).filter(Boolean)
      : String(req.body?.imagePrompts || "")
        .split(/\n+/)
        .map((prompt) => clampText(prompt || "", 1200))
        .filter(Boolean)
        .slice(0, 3);
    const performanceDirective = clampText(req.body?.performanceDirective || "", 1800);
    const originalText = clampText(req.body?.originalText || "", 1600);
    const targetSpeechLine = clampText(req.body?.targetSpeechLine || req.body?.text || "", 1600);
    const text = targetSpeechLine || clampText(req.body?.text || "", 1600);
    const dialogueAudioUrl = clampText(req.body?.dialogueAudioUrl || "", 3200);
    const dialogueAudioStoragePath = clampText(req.body?.dialogueAudioStoragePath || "", 700);
    const audioDurationSecInput = clampNumber(req.body?.audioDurationSec, 0, 180, 0);
    const requestedDurationSecInput = clampNumber(req.body?.requestedDurationSec, 4, 8, 0);
    const portraitUrl = clampText(req.body?.portraitUrl || "", 3200);
    const portraitStoragePath = clampText(req.body?.portraitStoragePath || "", 700);
    const referenceMode = String(req.body?.referenceMode || "image").trim().toLowerCase() === "video" ? "video" : "image";
    const inlineReferenceBudget = validateDialogueVideoInlineReferenceBudget(req.body || {});
    const referenceImageDataUrls = referenceMode === "image"
      ? inlineReferenceBudget.referenceImageDataUrls
      : [];
    const referenceImageNames = referenceMode === "image" && Array.isArray(req.body?.referenceImageNames)
      ? req.body.referenceImageNames.map((item) => clampText(item || "", 180)).filter(Boolean).slice(0, 4)
      : [];
    const referenceImageDataUrl = referenceMode === "image" ? String(req.body?.referenceImageDataUrl || "").trim() : "";
    const continuityReferenceImageDataUrl = String(inlineReferenceBudget?.continuityReferenceImageDataUrl || "").trim();
    const explicitForceImmediateSceneChange = req.body?.forceImmediateSceneChange === true;
    const referenceImageName = clampText(req.body?.referenceImageName || "", 180);
    const referenceVideoDataUrl = referenceMode === "video" ? String(inlineReferenceBudget?.referenceVideoDataUrl || "").trim() : "";
    const referenceVideoName = clampText(req.body?.referenceVideoName || "", 180);
    const referenceVideoMimeType = clampText(req.body?.referenceVideoMimeType || "video/mp4", 120) || "video/mp4";
    const relateWithPreviousScene = req.body?.relateWithPreviousScene === true;
    const previousSceneRaw = req.body?.previousScene && typeof req.body.previousScene === "object" ? req.body.previousScene : null;
    const previousScene = previousSceneRaw ? {
      rowId: clampText(previousSceneRaw?.rowId || "", 120),
      sceneNumber: clampNumber(previousSceneRaw?.sceneNumber, 0, 999, 0),
      speakerLabel: clampText(previousSceneRaw?.speakerLabel || "", 80),
      speakerName: clampText(previousSceneRaw?.speakerName || "", 120),
      expression: clampText(previousSceneRaw?.expression || "Neutral", 80) || "Neutral",
      text: clampText(previousSceneRaw?.text || "", 1600),
      targetSpeechLine: clampText(previousSceneRaw?.targetSpeechLine || "", 1600),
      previousVideoTargetSpeechLine: clampText(previousSceneRaw?.previousVideoTargetSpeechLine || "", 1600),
      hasVideo: previousSceneRaw?.hasVideo === true,
      videoDownloadUrl: clampText(previousSceneRaw?.videoDownloadUrl || "", 3200),
      videoStoragePath: clampText(previousSceneRaw?.videoStoragePath || "", 700),
      videoMimeType: clampText(previousSceneRaw?.videoMimeType || "video/mp4", 80) || "video/mp4"
    } : null;
    let strictIdentity = req.body?.strictIdentity !== false;
    const regenerate = req.body?.regenerate === true;
    const enhanceFromExistingVideo = req.body?.enhanceFromExistingVideo === true;
    const previousStoragePath = clampText(req.body?.previousStoragePath || "", 700);
    const analysisVideoDownloadUrl = clampText(req.body?.analysisVideoDownloadUrl || "", 3200);
    const analysisVideoStoragePath = clampText(req.body?.analysisVideoStoragePath || "", 700);
    const analysisVideoMimeType = clampText(req.body?.analysisVideoMimeType || "video/mp4", 80) || "video/mp4";
    const requestedCandidates = Array.isArray(req.body?.modelCandidates) ? req.body.modelCandidates : [];
    const requestedModel = normalizeModel(req.body?.model || DEFAULT_PODCASTER_VIDEO_MODEL);
    const mergedModels = Array.from(new Set([
      requestedModel,
      ...requestedCandidates.map((item) => normalizeModel(item || "")),
      ...PODCASTER_VIDEO_MODEL_CANDIDATES
    ].filter(Boolean)));
    const hasExplicitSceneReferenceInput = Boolean(
      referenceImageDataUrls.length
      || referenceImageDataUrl
      || referenceVideoDataUrl
      || continuityReferenceImageDataUrl
    );
    const traceReferenceVideo = (step = "", details = {}) => {
      if (!hasExplicitSceneReferenceInput) return;
      try {
        console.info(`[backend][scene-video-ref][${String(step || "").trim() || "event"}]`, {
          requestDebugTag,
          sessionId,
          rowId,
          referenceMode,
          ...details
        });
      } catch (_) { }
    };
    const canPreferFastModel = !strictIdentity && !portraitUrl && !portraitStoragePath && !hasExplicitSceneReferenceInput;
    const filteredModels = mergedModels.filter((modelName) => {
      const lowerModelName = String(modelName || "").toLowerCase();
      if ((strictIdentity || hasExplicitSceneReferenceInput) && /lite/i.test(lowerModelName)) return false;
      return true;
    });
    const prioritizedModels = strictIdentity
      ? filteredModels
      : filteredModels.slice().sort((a, b) => {
        const aFast = /fast/i.test(String(a || ""));
        const bFast = /fast/i.test(String(b || ""));
        if (aFast === bFast) return 0;
        if (canPreferFastModel) return aFast ? -1 : 1;
        return aFast ? 1 : -1;
      });
    const videoModels = prioritizedModels.length ? prioritizedModels : [DEFAULT_PODCASTER_VIDEO_MODEL];
    const requestDebugTag = `dialogue-video:${sessionId || "no-session"}:${rowId || "no-row"}`;
    updateDialogueVideoJob({
      status: "running",
      stage: "validate_payload",
      progress: 0.12,
      hint: "Validando solicitud de video.",
      rowId
    });
    logHeavyWorkMemory("dialogue_video", "validate_payload", {
      jobId,
      sessionId,
      rowId,
      totalInlineBytes: Number(inlineReferenceBudget?.totalInlineBytes || 0) || 0
    });

    if (!sessionId) {
      console.warn(`[backend][${requestDebugTag}] reject 400 missing sessionId`);
      return res.status(400).json({ error: "Falta sessionId." });
    }
    if (!rowId) {
      console.warn(`[backend][${requestDebugTag}] reject 400 missing rowId`, { sessionId });
      return res.status(400).json({ error: "Falta rowId." });
    }
    if (!speakerLabel) {
      console.warn(`[backend][${requestDebugTag}] reject 400 missing speakerLabel`, { sessionId, rowId });
      return res.status(400).json({ error: "Falta speakerLabel." });
    }
    if (!text) {
      console.warn(`[backend][${requestDebugTag}] reject 400 missing text`, { sessionId, rowId, speakerLabel });
      return res.status(400).json({ error: "Falta texto de diálogo." });
    }
    if (strictIdentity && !portraitUrl && !portraitStoragePath) {
      console.warn(`[backend][${requestDebugTag}] reject 400 strictIdentity without portrait`, {
        strictIdentity,
        educationalVideo,
        hasPortraitUrl: Boolean(portraitUrl),
        hasPortraitStoragePath: Boolean(portraitStoragePath)
      });
      return res.status(400).json({ error: "strictIdentity requiere portraitUrl o portraitStoragePath." });
    }

    let portraitBuffer = null;
    let portraitMimeType = "image/png";
    let portraitLoadedFromStorage = false;
    let portraitSourceBucketName = "";
    logHeavyWorkMemory("dialogue_video", "load_portrait", {
      jobId,
      sessionId,
      rowId
    });
    if (portraitUrl || portraitStoragePath) {
      if (portraitStoragePath) {
        try {
          const bucketForMeta = await resolveWritableStorageBucket();
          const file = bucketForMeta.file(portraitStoragePath);
          const [meta] = await file.getMetadata().catch(() => [{}]);
          const downloaded = await downloadStorageObjectToBuffer(portraitStoragePath);
          portraitBuffer = Buffer.from(downloaded.buffer);
          portraitSourceBucketName = String(downloaded?.bucket?.name || bucketForMeta?.name || "").trim();
          portraitMimeType = String(meta?.contentType || "image/png").trim().toLowerCase();
          portraitLoadedFromStorage = true;
        } catch (_) {
          portraitBuffer = null;
        }
      }
      if (!portraitBuffer && portraitUrl) {
        const portraitResponse = await fetchCompat(portraitUrl, { method: "GET" });
        if (!portraitResponse.ok) {
          if (strictIdentity) {
            const detail = await safeJson(portraitResponse);
            return res.status(portraitResponse.status).json({
              error: String(detail?.error?.message || detail?.error || `No se pudo descargar retrato (${portraitResponse.status}).`)
            });
          }
          portraitBuffer = null;
        } else {
          portraitMimeType = String(portraitResponse.headers.get("content-type") || "image/png").trim().toLowerCase();
          portraitBuffer = Buffer.from(await portraitResponse.arrayBuffer());
        }
      }
    }
    if ((portraitUrl || portraitStoragePath) && !portraitBuffer) {
      if (strictIdentity) {
        console.warn(`[backend][${requestDebugTag}] portrait unavailable, disabling strictIdentity fallback`, {
          hasPortraitUrl: Boolean(portraitUrl),
          hasPortraitStoragePath: Boolean(portraitStoragePath)
        });
      }
      strictIdentity = false;
    }
    if (portraitBuffer && !portraitMimeType.startsWith("image/")) {
      if (strictIdentity) {
        return res.status(400).json({ error: "El retrato no es una imagen válida para Veo." });
      }
      portraitBuffer = null;
      portraitMimeType = "image/png";
    }
    if (portraitBuffer && (!portraitBuffer.length || portraitBuffer.length > MAX_SPEAKER_PORTRAIT_BYTES)) {
      if (strictIdentity) {
        return res.status(413).json({ error: "El retrato excede el tamaño permitido." });
      }
      portraitBuffer = null;
      portraitMimeType = "image/png";
    }
    const portraitBase64 = portraitBuffer ? portraitBuffer.toString("base64") : "";
    const portraitGcsUri = portraitLoadedFromStorage && portraitStoragePath
      ? `gs://${portraitSourceBucketName || String((await resolveWritableStorageBucket())?.name || "").trim()}/${portraitStoragePath}`
      : "";
    const hasPortraitAsset = Boolean(portraitBase64 || portraitGcsUri);

    logHeavyWorkMemory("dialogue_video", "load_scene_references", {
      jobId,
      sessionId,
      rowId,
      imageReferenceCount: referenceImageDataUrls.length,
      videoReferenceCount: referenceVideoDataUrl ? 1 : 0
    });
    const sceneReferenceSources = referenceImageDataUrls.length ? referenceImageDataUrls : (referenceImageDataUrl ? [referenceImageDataUrl] : []);
    const sceneReferences = [];
    for (const imageDataUrl of sceneReferenceSources) {
      const sceneReference = await loadOptionalImageReference({ dataUrl: imageDataUrl });
      if (!sceneReference) continue;
      sceneReferences.push({
        buffer: sceneReference.buffer,
        mimeType: String(sceneReference.mimeType || "image/png").trim().toLowerCase() || "image/png"
      });
    }
    const sceneReferenceImages = sceneReferences.map((item) => ({
      image: {
        bytesBase64Encoded: item.buffer.toString("base64"),
        mimeType: item.mimeType
      },
      referenceType: "asset"
    }));
    const hasSceneReference = sceneReferenceImages.length > 0;
    const useSceneReferenceAsInitImage = hasSceneReference && !strictIdentity;
    let sceneReferenceVideoFrameBase64 = "";
    let sceneReferenceVideoFrameMimeType = "image/png";
    if (referenceMode === "video" && referenceVideoDataUrl) {
      logHeavyWorkMemory("dialogue_video", "extract_reference_frame", {
        jobId,
        sessionId,
        rowId
      });
      const decodedVideo = decodeBase64DataUrl(referenceVideoDataUrl, MAX_DIALOGUE_VIDEO_BYTES);
      if (!String(decodedVideo.mimeType || referenceVideoMimeType).toLowerCase().startsWith("video/")) {
        return res.status(400).json({ error: "El video de referencia no es válido." });
      }
      try {
        const frameBuffer = await extractLastVideoFramePng(decodedVideo.buffer, String(decodedVideo.mimeType || referenceVideoMimeType || "video/mp4"));
        if (frameBuffer?.length) {
          sceneReferenceVideoFrameBase64 = frameBuffer.toString("base64");
          sceneReferenceVideoFrameMimeType = "image/png";
        }
      } catch (error) {
        console.warn(`[backend][${requestDebugTag}] reference video frame extraction failed`, {
          error: String(error?.message || error || "unknown"),
          referenceVideoName
        });
      }
      strictIdentity = false;
    }
    const hasSceneReferenceVideo = Boolean(sceneReferenceVideoFrameBase64);

    const shouldForceImmediateSceneChange = (source = "") => {
      const text = String(source || "").toLowerCase();
      if (!text) return false;
      if (/\b(hard cut|jump cut|match cut)\b/.test(text)) return true;
      if (/\bmontaje\b/.test(text) && (/\br[aá]pid/.test(text) || /\bdin[aá]mic/.test(text))) return true;
      if (/\btransici[oó]n\b/.test(text) && (/\br[aá]pid/.test(text) || /\binmedi/.test(text))) return true;
      if (/\bcorte\b/.test(text) && (/\br[aá]pid/.test(text) || /\binmedi/.test(text) || /\bal inicio\b/.test(text))) return true;
      if (/\bcorte a\b/.test(text) || /\bluego[, ]+un corte\b/.test(text) || /\btransici[oó]n r[aá]pida\b/.test(text)) return true;
      if (/\b(cambio|cambiar|cambie|cambia|transici[oó]n|corte|cortar|salto)\b/.test(text) && /\b(inmedi|de inmediato|ya|al instante|al inicio|desde el inicio)\b/.test(text)) {
        return true;
      }
      if (/\b(cambia|cambie|cambiar)\b/.test(text) && /\b(escena|set|entorno|plano|composici[oó]n|visual)\b/.test(text)) {
        return true;
      }
      return false;
    };
    const forceImmediateChange = relateWithPreviousScene && (explicitForceImmediateSceneChange || shouldForceImmediateSceneChange([
      scenePrompt,
      videoDirective,
      performanceDirective,
      imagePrompts.join(" "),
      referenceImageNames.join(" "),
      referenceImageName
    ].filter(Boolean).join(" ")));

    let continuityFrameBase64 = "";
    let continuityFrameMimeType = "image/png";
    if (relateWithPreviousScene && continuityReferenceImageDataUrl && continuityReferenceImageDataUrl.startsWith("data:image/")) {
      const continuityReference = await loadOptionalImageReference({ dataUrl: continuityReferenceImageDataUrl });
      if (continuityReference?.buffer?.length) {
        continuityFrameBase64 = continuityReference.buffer.toString("base64");
        continuityFrameMimeType = String(continuityReference.mimeType || "image/png").trim().toLowerCase() || "image/png";
      }
    }
    if (!continuityFrameBase64 && relateWithPreviousScene && previousScene?.hasVideo) {
      logHeavyWorkMemory("dialogue_video", "download_previous_scene", {
        jobId,
        sessionId,
        rowId
      });
      const previousVideoStoragePath = String(previousScene?.videoStoragePath || "").trim();
      const previousVideoUrl = String(previousScene?.videoDownloadUrl || "").trim();
      const previousVideoHintMimeType = String(previousScene?.videoMimeType || "video/mp4").trim().toLowerCase() || "video/mp4";
      let previousVideoBuffer = null;
      try {
        if (previousVideoStoragePath) {
          const downloaded = await downloadStorageObjectToBuffer(previousVideoStoragePath);
          previousVideoBuffer = Buffer.from(downloaded.buffer);
        } else if (previousVideoUrl) {
          const previousVideoResponse = await fetchCompat(previousVideoUrl, { method: "GET" });
          if (previousVideoResponse.ok) {
            previousVideoBuffer = Buffer.from(await previousVideoResponse.arrayBuffer());
          }
        }
      } catch (_) {
        previousVideoBuffer = null;
      }
      if (previousVideoBuffer && previousVideoBuffer.length && previousVideoBuffer.length <= MAX_DIALOGUE_VIDEO_BYTES) {
        try {
          const frame = await extractLastVideoFramePng(previousVideoBuffer, previousVideoHintMimeType);
          continuityFrameBase64 = frame.toString("base64");
          continuityFrameMimeType = "image/png";
        } catch (_) {
          continuityFrameBase64 = "";
          continuityFrameMimeType = "image/png";
        }
      }
    }

    traceReferenceVideo("request-summary", {
      strictIdentity,
      educationalVideo,
      hasPortraitAsset,
      hasSceneReference,
      sceneReferenceCount: sceneReferenceImages.length,
      hasSceneReferenceVideo,
      useSceneReferenceAsInitImage: hasSceneReferenceVideo ? true : useSceneReferenceAsInitImage,
      relateWithPreviousScene,
      hasContinuityFrame: Boolean(continuityFrameBase64),
      hasPortraitUrl: Boolean(portraitUrl),
      hasPortraitStoragePath: Boolean(portraitStoragePath),
      textLength: String(text || "").length,
      requestedModel,
      mergedModels,
      effectiveModelCandidates: videoModels,
      imageReferenceNames: referenceImageNames,
      referenceImageName,
      referenceVideoName,
      inlineBudgetBytes: Number(inlineReferenceBudget?.totalInlineBytes || 0) || 0
    });
    let inferredAudioDurationSec = audioDurationSecInput;
    if (!inferredAudioDurationSec && dialogueAudioStoragePath) {
      try {
        const audioDownload = await downloadStorageObjectToBuffer(dialogueAudioStoragePath);
        inferredAudioDurationSec = clampNumber(parseWavDurationSeconds(Buffer.from(audioDownload.buffer)), 0, 180, 0);
      } catch (_) {
        inferredAudioDurationSec = 0;
      }
    }
    const inferredTargetDurationSec = strictIdentity
      ? 8
      : (requestedDurationSecInput > 0
      ? Math.round(clampNumber(requestedDurationSecInput, 4, 8, 8))
      : (inferredAudioDurationSec > 0
        ? Math.round(clampNumber(inferredAudioDurationSec, 5, 8, 8))
        : 8));
    const characterPrompt = (educationalVideo && !isReel)
      ? ""
      : buildBackendPodcasterCharacterPrompt({
        speakerLabel,
        speakerName,
        voiceName,
        genderGroup,
        expression,
        counterpartSpeakerName,
        contentMode
      });
    const studioScenePrompt = (educationalVideo && !isReel)
      ? ""
      : buildBackendPodcasterStudioScenePrompt({
        speakerLabel,
        speakerName,
        counterpartSpeakerName,
        scenarioPrompt,
        expression,
        contentMode
      });
    const timelineScenePromptBundle = buildDialogueVideoPromptBundle({
      promptProfile,
      educationalVideo,
      speakerName,
      speakerLabel,
      voiceName,
      genderGroup,
      expression,
      counterpartSpeakerName,
      scenarioPrompt,
      scenePrompt,
      sceneDescription,
      visualNotes,
      onScreenText,
      transition,
      videoDirective,
      imagePrompts,
      performanceDirective,
      previousScene,
      relateWithPreviousScene,
      continuityFrameBase64,
      forceImmediateChange,
      hasPortraitAsset,
      dialogueAudioStoragePath,
      dialogueAudioUrl,
      inferredTargetDurationSec,
      originalText,
      text,
      characterPrompt,
      studioScenePrompt,
      useSceneReferenceAsInitImage,
      referenceImageName,
      hasSceneReferenceVideo,
      referenceVideoName,
      regenerationAnalysis: null,
      isReel,
      contentMode
    });
    const sceneVisualPrompt = timelineScenePromptBundle?.sceneVisualPrompt || (scenePrompt || [
      educationalVideo ? "Escena educativa basada en guion técnico." : `Escena de ${speakerName}.`,
      scenarioPrompt ? `Contexto visual: ${scenarioPrompt}` : "",
      videoDirective ? `Prioridad manual: ${videoDirective}` : ""
    ].filter(Boolean).join(" ").trim());
    const sceneImagePromptList = timelineScenePromptBundle?.sceneImagePromptList || (imagePrompts.length ? imagePrompts : (sceneVisualPrompt ? [
      `${sceneVisualPrompt} Imagen principal horizontal 16:9.`,
      `${sceneVisualPrompt} Variante en plano cerrado, y otra toma de apoyo del set.`
    ] : []));

    let regenerationAnalysis = null;
    if (enhanceFromExistingVideo && (analysisVideoStoragePath || analysisVideoDownloadUrl) && hasGeminiKey() && isFfmpegAvailable()) {
      try {
        let analysisVideoBuffer = null;
        if (analysisVideoStoragePath) {
          const downloaded = await downloadStorageObjectToBuffer(analysisVideoStoragePath);
          analysisVideoBuffer = Buffer.from(downloaded.buffer);
        } else if (analysisVideoDownloadUrl) {
          const videoResponse = await fetchCompat(analysisVideoDownloadUrl, { method: "GET" });
          if (videoResponse.ok) {
            analysisVideoBuffer = Buffer.from(await videoResponse.arrayBuffer());
          }
        }
        if (analysisVideoBuffer?.length) {
          regenerationAnalysis = await buildDialogueVideoRegenerationAnalysis({
            videoBuffer: analysisVideoBuffer,
            sourceMimeType: analysisVideoMimeType,
            speakerName,
            scenePrompt,
            videoDirective,
            targetSpeechLine: text
          });
        }
      } catch (error) {
        console.warn(`[backend][${requestDebugTag}] regeneration analysis failed`, {
          error: String(error?.message || error || "unknown"),
          analysisVideoStoragePath,
          hasAnalysisVideoDownloadUrl: Boolean(analysisVideoDownloadUrl)
        });
        regenerationAnalysis = null;
      }
    }

    const sceneReferenceAssets = [...sceneReferenceImages];
    if (sceneReferenceVideoFrameBase64) {
      sceneReferenceAssets.push({
        image: {
          bytesBase64Encoded: sceneReferenceVideoFrameBase64,
          mimeType: sceneReferenceVideoFrameMimeType
        },
        referenceType: "asset"
      });
    }

    const prompt = timelineScenePromptBundle?.prompt || [
      educationalVideo
        ? "Genera un video educativo corto, claro y realista."
        : "Genera un video cinematográfico corto y realista para podcast.",
      regenerationAnalysis?.summary ? `Resumen del clip actual a conservar: ${regenerationAnalysis.summary}` : "",
      regenerationAnalysis?.preserve?.length ? `Conserva del clip existente: ${regenerationAnalysis.preserve.join(" | ")}` : "",
      regenerationAnalysis?.improve?.length ? `Mejora en la nueva version: ${regenerationAnalysis.improve.join(" | ")}` : "",
      regenerationAnalysis?.avoid?.length ? `Evita en la nueva version: ${regenerationAnalysis.avoid.join(" | ")}` : "",
      regenerationAnalysis?.qualityPrompt ? `Instruccion extra de mejora de calidad basada en todo el clip anterior: ${regenerationAnalysis.qualityPrompt}` : "",
      useSceneReferenceAsInitImage
        ? `La imagen adjunta${referenceImageName ? ` (${referenceImageName})` : ""} es referencia visual principal de la escena. Debe guiar composición, estilo, ambientación y continuidad.`
        : "",
      sceneReferenceAssets.length
        ? `Las ${sceneReferenceAssets.length === 1 ? "referencia visual adjunta es" : `referencias visuales adjuntas (${sceneReferenceAssets.length}) son`} la fuente de verdad visual de esta escena. Respeta sus elementos dominantes y no inventes objetos, vestuario, personajes, arquitectura, utilería, colores o ambientación que las contradigan.`
        : "",
      sceneReferenceAssets.length > 1
        ? "Si hay varias referencias, combínalas como el mismo universo visual y conserva únicamente los rasgos recurrentes entre ellas. Prioriza coincidencias repetidas sobre cualquier detalle ambiguo del texto."
        : "",
      sceneReferenceAssets.length
        ? "Si alguna instrucción textual contradice las referencias visuales adjuntas, prioriza las referencias adjuntas y ajusta el texto para mantener coherencia visual."
        : "",
      hasSceneReferenceVideo
        ? `El video adjunto${referenceVideoName ? ` (${referenceVideoName})` : ""} se convirtió a un frame de referencia para guiar encuadre, continuidad y estilo visual de la escena.`
        : "",
      videoDirective ? `Prioridad máxima: cumple esta especificación adicional del usuario${educationalVideo ? " para narrativa visual educativa" : " sin romper identidad, sincronía labial ni continuidad del set"}: ${videoDirective}` : "",
      sceneVisualPrompt ? `${educationalVideo ? "Dirección pedagógica de la escena" : "Dirección visual de la escena"}: ${sceneVisualPrompt}` : "",
      sceneImagePromptList.length ? `Prompts de imagen para la escena: ${sceneImagePromptList.map((item, idx) => `${idx + 1}. ${item}`).join(" | ")}` : "",
      performanceDirective ? `Prioridad máxima de actuación visual: ejecuta estas acciones físicas o expresivas de forma visible en pantalla, sin convertirlas en texto en pantalla ni alterar el diálogo hablado: ${performanceDirective}` : "",
      educationalVideo ? "" : `Locutor: ${speakerName} (${speakerLabel}).`,
      educationalVideo ? "" : (voiceName ? `Voz de referencia: ${voiceName}.` : ""),
      educationalVideo ? "" : (genderGroup ? `Presentación de género del personaje: ${genderGroup}.` : ""),
      educationalVideo ? "" : `Expresión: ${expression}.`,
      characterPrompt ? `Identidad del personaje obligatoria: ${characterPrompt}` : "",
      studioScenePrompt ? `Escenario de locución obligatorio: ${studioScenePrompt}` : "",
      previousScene?.speakerLabel
        ? `Continuidad narrativa: esta es la escena posterior a la escena ${Math.max(1, Number(previousScene.sceneNumber) || 1)} de ${previousScene.speakerName || previousScene.speakerLabel}.`
        : "",
      previousScene?.targetSpeechLine
        ? `Escena previa (texto objetivo): "${String(previousScene.targetSpeechLine).replace(/"/g, '\\"')}"`
        : "",
      previousScene?.previousVideoTargetSpeechLine
        ? `Escena previa (texto usado en video): "${String(previousScene.previousVideoTargetSpeechLine).replace(/"/g, '\\"')}"`
        : "",
      previousScene?.expression
        ? `Transición emocional: evoluciona de "${previousScene.expression}" hacia "${expression}" de forma natural y coherente.`
        : "",
      relateWithPreviousScene && continuityFrameBase64
        ? (forceImmediateChange
          ? "Continuidad solo en el primer fotograma: el primer fotograma del nuevo clip debe coincidir con el último fotograma del clip anterior (mismo encuadre, posición, iluminación). Luego, dentro de los siguientes 0.2–0.8 segundos, realiza un corte o transición visible para cumplir el nuevo Elemento visual/Descripción de escena (cambio inmediato de plano/entorno/composición). No te quedes con la imagen del frame anterior durante todo el clip."
          : "Continuidad exacta: el primer fotograma del nuevo clip debe coincidir con el último fotograma del clip anterior (mismo encuadre, posición, iluminación y continuidad de movimiento). No debe notarse corte.")
        : relateWithPreviousScene
          ? "Continuidad: intenta continuar exactamente desde el final del clip anterior (sin salto visual)."
          : "",
      previousScene?.hasVideo
        ? (forceImmediateChange
          ? "Tras el primer fotograma, prioriza el nuevo Elemento visual aunque implique un cambio claro de plano, contenido o composición respecto al clip previo."
          : (educationalVideo
            ? "Mantén continuidad visual y de estilo con el clip previo (paleta, ritmo, tipo de recurso visual y composición)."
            : "Mantén continuidad visual y de puesta en escena con el clip previo (posición en cabina, encuadre y energía)."))
        : "Si no hay clip previo disponible, conserva continuidad narrativa usando el texto de la escena anterior.",
      educationalVideo ? "" : (hasPortraitAsset ? "El sujeto debe mantener identidad visual consistente y reconocible con la imagen base." : ""),
      educationalVideo ? "" : (hasPortraitAsset ? "Conserva rasgos faciales, peinado, tono de piel y proporciones del rostro sin sustituir personaje." : ""),
      educationalVideo
        ? "Escena en entorno educativo profesional con apoyo visual limpio y composición editorial."
        : "Escena en cabina profesional de podcast con micrófono de estudio.",
      educationalVideo
        ? "La prioridad es representar fielmente la Descripción de escena y el Elemento visual del guion técnico."
        : "Usa el mismo escenario global del podcast, pero cada locutor debe ocupar una zona física distinta dentro del set.",
      educationalVideo
        ? "Puedes mostrar escenas sin personas si el recurso visual lo pide (mapas, gráficos, objetos, documentos, animaciones)."
        : "Importante: posicionar a cada Host en una parte diferente del escenario, y ser consistente con ese ángulo.",
      educationalVideo
        ? "Prohibido estilo podcast: no cabina de radio, no micrófonos, no set de entrevista, no host hablando a cámara."
        : "Importante: en la escena solo debe aparecer el locutor o host correspondiente al track.",
      educationalVideo
        ? "Si aparece una persona, debe ser secundaria al recurso didáctico y nunca parecer conductor de podcast."
        : "El locutor debe verse en conversación real: cuerpo en tres cuartos o semi perfil, con la mirada dirigida hacia un punto fuera de cámara dentro del set.",
      educationalVideo
        ? "Prioriza planos de recurso visual, detalle y contexto que refuercen la voz en off."
        : "Prohibido mirar fijamente al frente, prohibido hablarle al lente, prohibido pose de conductor mirando a cámara.",
      educationalVideo
        ? "Mantén narrativa didáctica clara y coherencia con transición solicitada."
        : "Debe verse un solo locutor identificable en cuadro; no introducir un segundo personaje visible ni fragmentos corporales de otro personaje.",
      educationalVideo ? "" : "Composición obligatoria de sujeto único: foreground y background libres de cualquier figura humana adicional.",
      educationalVideo
        ? "Si la escena exige figura humana, evitar frontalidad y mantener foco en el contenido didáctico."
        : "Si hace falta sugerir conversacion, hacerlo solo con direccion de mirada, postura y composicion del set; nunca agregando otra figura humana.",
      educationalVideo
        ? "No incluir texto incrustado; la explicación textual ocurre en voz en off y edición."
        : "Solo se permiten microglances incidentales; la eyeline dominante nunca debe caer directamente sobre la cámara.",
      educationalVideo
        ? "Plano, luz y composición deben parecer pieza educativa premium de 16:9."
        : "Plano medio corto, movimiento sutil de cabeza y labios, parpadeo natural, iluminación neutra.",
      dialogueAudioStoragePath || dialogueAudioUrl
        ? (educationalVideo
          ? `El clip debe durar ~${inferredTargetDurationSec} segundos y reforzar visualmente la locución pregrabada (sin requerir lectura labial).`
          : `El clip debe sincronizar labios y ritmo con una locución pregrabada de ~${inferredTargetDurationSec} segundos.`)
        : "",
      "Las acotaciones escénicas o instrucciones de actuación son visuales; no deben aparecer como texto en pantalla ni modificar literalmente el diálogo hablado.",
      originalText ? `Línea original (referencia): "${String(originalText).replace(/"/g, '\\"')}"` : "",
      "Sin texto, sin subtítulos, sin captions, sin closed captions, sin lower thirds, sin burned-in text, sin karaoke text, sin overlays de UI, sin logos, sin marcas de agua.",
      "Prohibido cualquier texto incrustado en imagen o video: no titulos, no nombres, no etiquetas, no transcripcion en pantalla, no texto decorativo.",
      `Diálogo objetivo: "${String(text).replace(/"/g, '\\"')}"`
    ].filter(Boolean).join("\n");

    const pollUntilDone = async (operationName = "", options = {}) => {
      const maxAttempts = Math.max(12, Math.min(54, Math.floor(Number(options?.maxAttempts || 54) || 54)));
      const delayMs = 5000;
      const requireResolvedMedia = options?.requireResolvedMedia === true;
      const resolveResult = typeof options?.resolveResult === "function" ? options.resolveResult : null;
      const postDoneGraceAttempts = Math.max(0, Math.floor(Number(options?.postDoneGraceAttempts || 0) || 0));
      const postDoneGraceDelayMs = Math.max(250, Number(options?.postDoneGraceDelayMs || delayMs) || delayMs);
      const onPoll = typeof options?.onPoll === "function" ? options.onPoll : null;
      let latest = null;
      let doneWithoutMediaAttempts = 0;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        if (onPoll) {
          onPoll({
            attempt: attempt + 1,
            maxAttempts,
            doneWithoutMediaAttempts,
            operationName
          });
        }
        // eslint-disable-next-line no-await-in-loop
        const opResponse = await fetchCompat(
          `${GEMINI_BASE}/${operationName}?key=${encodeURIComponent(GEMINI_API_KEY)}`,
          { method: "GET" }
        );
        // eslint-disable-next-line no-await-in-loop
        const opData = await safeJson(opResponse);
        latest = opData;
        if (!opResponse.ok) {
          const detail = String(opData?.error?.message || opData?.error || `HTTP ${opResponse.status}`).trim();
          const err = new Error(`Error consultando operación Veo: ${detail}`);
          err.status = Number(opResponse.status || 502);
          throw err;
        }
        if (opData?.done === true) {
          if (!requireResolvedMedia || !resolveResult) return opData;
          const resolved = resolveResult(opData);
          if (resolved?.uri || resolved?.inlineData?.data) return opData;
          if (doneWithoutMediaAttempts >= postDoneGraceAttempts) return opData;
          doneWithoutMediaAttempts += 1;
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) => setTimeout(resolve, postDoneGraceDelayMs));
          continue;
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      const err = new Error("Tiempo de espera agotado al generar video de diálogo.");
      err.status = 504;
      err.latest = latest;
      throw err;
    };

    if (strictIdentity && !hasPortraitAsset) {
      console.warn(`[backend][${requestDebugTag}] reject 400 strictIdentity without portrait asset`, {
        hasPortraitUrl: Boolean(portraitUrl),
        hasPortraitStoragePath: Boolean(portraitStoragePath),
        hasPortraitAsset
      });
      return res.status(400).json({
        error: "strictIdentity requiere portraitUrl o portraitStoragePath para referenceImages."
      });
    }
    const requestVariants = [];
    const derivedHasSceneReference = sceneReferenceAssets.length > 0;
    const derivedUseSceneReferenceAsInitImage = derivedHasSceneReference && !strictIdentity;
    const continuityReferenceImage = continuityFrameBase64
      ? {
        image: {
          bytesBase64Encoded: continuityFrameBase64,
          mimeType: continuityFrameMimeType
        },
        referenceType: "asset"
      }
      : null;
    const referenceDurationSec = (sceneReferenceAssets.length || continuityReferenceImage || hasPortraitAsset)
      ? 8
      : inferredTargetDurationSec;

    if (sceneReferenceAssets.length && derivedUseSceneReferenceAsInitImage) {
      requestVariants.push(
        {
          label: "reference-scene+aspect+duration",
          body: {
            instances: [{
              prompt,
              referenceImages: [...sceneReferenceAssets, ...(continuityReferenceImage ? [continuityReferenceImage] : [])]
            }],
            parameters: {
              aspectRatio: "16:9",
              durationSeconds: referenceDurationSec
            }
          }
        },
        {
          label: "reference-scene+aspect",
          body: {
            instances: [{
              prompt,
              referenceImages: [...sceneReferenceAssets, ...(continuityReferenceImage ? [continuityReferenceImage] : [])]
            }],
            parameters: {
              aspectRatio: "16:9"
            }
          }
        }
      );
    }

    if (continuityReferenceImage && !strictIdentity) {
      requestVariants.push(
        {
          label: "reference-continuity+aspect+duration",
          body: {
            instances: [{
              prompt,
              referenceImages: [continuityReferenceImage]
            }],
            parameters: {
              aspectRatio: "16:9",
              durationSeconds: referenceDurationSec
            }
          }
        },
        {
          label: "reference-continuity+aspect",
          body: {
            instances: [{
              prompt,
              referenceImages: [continuityReferenceImage]
            }],
            parameters: {
              aspectRatio: "16:9"
            }
          }
        }
      );
    }
    if (portraitGcsUri) {
      requestVariants.push(
        {
          label: "reference-gcs+aspect+duration",
          body: {
            instances: [{
              prompt,
              referenceImages: [{
                image: {
                  gcsUri: portraitGcsUri,
                  mimeType: portraitMimeType
                },
                referenceType: "asset"
              }, ...sceneReferenceAssets, ...(continuityReferenceImage ? [continuityReferenceImage] : [])]
            }],
            parameters: {
              aspectRatio: "16:9",
              durationSeconds: referenceDurationSec
            }
          }
        },
        {
          label: "reference-gcs+aspect",
          body: {
            instances: [{
              prompt,
              referenceImages: [{
                image: {
                  gcsUri: portraitGcsUri,
                  mimeType: portraitMimeType
                },
                referenceType: "asset"
              }, ...sceneReferenceAssets, ...(continuityReferenceImage ? [continuityReferenceImage] : [])]
            }],
            parameters: {
              aspectRatio: "16:9"
            }
          }
        }
      );
    }
    if (portraitBase64) {
      requestVariants.push(
        {
          label: "reference-bytes+aspect+duration",
          body: {
            instances: [{
              prompt,
              referenceImages: [{
                image: {
                  bytesBase64Encoded: portraitBase64,
                  mimeType: portraitMimeType
                },
                referenceType: "asset"
              }, ...sceneReferenceAssets, ...(continuityReferenceImage ? [continuityReferenceImage] : [])]
            }],
            parameters: {
              aspectRatio: "16:9",
              durationSeconds: referenceDurationSec
            }
          }
        },
        {
          label: "reference-bytes+aspect",
          body: {
            instances: [{
              prompt,
              referenceImages: [{
                image: {
                  bytesBase64Encoded: portraitBase64,
                  mimeType: portraitMimeType
                },
                referenceType: "asset"
              }, ...sceneReferenceAssets, ...(continuityReferenceImage ? [continuityReferenceImage] : [])]
            }],
            parameters: {
              aspectRatio: "16:9"
            }
          }
        }
      );
    }
    if (!strictIdentity && portraitBase64) {
      requestVariants.push(
        {
          label: "image+aspect+duration",
          body: {
            instances: [{
              prompt,
              image: {
                inlineData: {
                  mimeType: portraitMimeType,
                  data: portraitBase64
                }
              }
            }],
            parameters: {
              aspectRatio: "16:9",
              durationSeconds: inferredTargetDurationSec
            }
          }
        },
        {
          label: "image+aspect",
          body: {
            instances: [{
              prompt,
              image: {
                inlineData: {
                  mimeType: portraitMimeType,
                  data: portraitBase64
                }
              }
            }],
            parameters: {
              aspectRatio: "16:9"
            }
          }
        }
      );
    }
    if (!hasPortraitAsset) {
      requestVariants.push(
        {
          label: "text-only+aspect+duration",
          body: {
            instances: [{ prompt }],
            parameters: {
              aspectRatio: "16:9",
              durationSeconds: inferredTargetDurationSec
            }
          }
        },
        {
          label: "text-only+aspect",
          body: {
            instances: [{ prompt }],
            parameters: {
              aspectRatio: "16:9"
            }
          }
        }
      );
    }
    if (strictIdentity) {
      requestVariants.push(
        {
          label: "strict-fallback-text-only+aspect+duration",
          body: {
            instances: [{ prompt }],
            parameters: {
              aspectRatio: "16:9",
              durationSeconds: inferredTargetDurationSec
            }
          }
        },
        {
          label: "strict-fallback-text-only+aspect",
          body: {
            instances: [{ prompt }],
            parameters: {
              aspectRatio: "16:9"
            }
          }
        }
      );
    }

    let lastStatus = 502;
    let lastErrorDetail = "No se pudo generar video con los modelos y variantes disponibles.";
    const attemptErrors = [];
    let finalVideoBuffer = null;
    let finalVideoMimeType = "video/mp4";
    let resolvedModel = videoModels[0] || DEFAULT_PODCASTER_VIDEO_MODEL;
    let resolvedVariant = "";
    const resolveVeoVideoResult = (operationDone = {}) => {
      const op = operationDone && typeof operationDone === "object" ? operationDone : {};
      const response = op.response && typeof op.response === "object"
        ? op.response
        : (op.result && typeof op.result === "object"
          ? op.result
          : (op.output && typeof op.output === "object" ? op.output : op));
      const uriCandidates = [
        response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri,
        response?.generateVideoResponse?.generatedSamples?.[0]?.videoUri,
        response?.generateVideoResponse?.generatedSamples?.[0]?.uri,
        response?.generateVideoResponse?.generatedSamples?.[0]?.video?.fileUri,
        response?.generate_video_response?.generated_samples?.[0]?.video?.uri,
        response?.generate_video_response?.generated_samples?.[0]?.video_uri,
        response?.generate_video_response?.generated_samples?.[0]?.uri,
        response?.generate_video_response?.generated_samples?.[0]?.video?.file_uri,
        response?.generatedVideos?.[0]?.video?.uri,
        response?.generatedVideos?.[0]?.videoUri,
        response?.generatedVideos?.[0]?.uri,
        response?.generated_videos?.[0]?.video?.uri,
        response?.generated_videos?.[0]?.video_uri,
        response?.generated_videos?.[0]?.uri,
        response?.videos?.[0]?.video?.uri,
        response?.videos?.[0]?.uri,
        response?.video?.fileUri,
        response?.video?.file_uri,
        response?.video?.uri,
        response?.videoUri,
        response?.video_uri,
        response?.fileData?.fileUri,
        response?.fileData?.uri,
        response?.file_data?.file_uri,
        response?.file_data?.uri
      ];
      for (const candidate of uriCandidates) {
        const uri = String(candidate || "").trim();
        if (uri) return { uri };
      }
      const inlineCandidates = [
        response?.generateVideoResponse?.generatedSamples?.[0]?.video?.inlineData,
        response?.generateVideoResponse?.generatedSamples?.[0]?.inlineData,
        response?.generatedVideos?.[0]?.video?.inlineData,
        response?.generatedVideos?.[0]?.inlineData,
        response?.generate_video_response?.generated_samples?.[0]?.video?.inline_data,
        response?.generate_video_response?.generated_samples?.[0]?.inline_data,
        response?.generated_videos?.[0]?.video?.inline_data,
        response?.generated_videos?.[0]?.inline_data
      ].filter(Boolean);
      for (const inlineData of inlineCandidates) {
        const data = String(inlineData?.data || inlineData?.bytesBase64Encoded || inlineData?.bytes_base64_encoded || "").trim();
        const mimeType = String(inlineData?.mimeType || inlineData?.mime_type || "video/mp4").trim() || "video/mp4";
        if (data) return { inlineData: { data, mimeType } };
      }
      const parts = Array.isArray(response?.candidates?.[0]?.content?.parts)
        ? response.candidates[0].content.parts
        : [];
      for (const part of parts) {
        const fileUri = String(part?.fileData?.fileUri || part?.fileData?.uri || part?.file_data?.file_uri || part?.file_data?.uri || "").trim();
        if (fileUri) return { uri: fileUri };
        const partUri = String(part?.video?.uri || part?.videoUri || part?.uri || "").trim();
        if (partUri) return { uri: partUri };
        const data = String(part?.inlineData?.data || part?.inlineData?.bytesBase64Encoded || part?.inlineData?.bytes_base64_encoded || part?.inline_data?.data || part?.inline_data?.bytesBase64Encoded || part?.inline_data?.bytes_base64_encoded || "").trim();
        const mimeType = String(part?.inlineData?.mimeType || part?.inlineData?.mime_type || part?.inline_data?.mimeType || part?.inline_data?.mime_type || "").trim();
        if (data && mimeType.toLowerCase().startsWith("video/")) return { inlineData: { data, mimeType } };
      }
      return null;
    };
    if (isReel) {
      for (const variant of requestVariants) {
        if (variant?.body?.parameters) {
          variant.body.parameters.aspectRatio = "9:16";
        }
      }
    }
    for (const variant of requestVariants) {
      if (!variant?.body) continue;
      variant.body.parameters = applyVeoHdParameters(
        variant.body.parameters,
        isReel ? "9:16" : "16:9"
      );
    }
    const requestedMaxVariantAttempts = Math.max(1, Math.min(
      requestVariants.length || 1,
      Math.floor(clampNumber(req.body?.maxVariantAttempts, 1, requestVariants.length || 1, requestVariants.length || 1))
    ));
    const effectiveRequestVariants = requestVariants.slice(0, requestedMaxVariantAttempts);
    const requestedMaxOperationPollAttempts = Math.max(12, Math.min(
      54,
      Math.floor(clampNumber(req.body?.maxOperationPollAttempts, 12, 54, 54))
    ));
    const effectiveVideoModels = videoModels.slice(0, Math.max(1, Math.min(
      videoModels.length || 1,
      Math.floor(clampNumber(req.body?.maxModelAttempts, 1, videoModels.length || 1, videoModels.length || 1))
    )));
    traceReferenceVideo("execution-plan", {
      requestedMaxVariantAttempts,
      requestedMaxOperationPollAttempts,
      effectiveVideoModels,
      effectiveVariants: effectiveRequestVariants.map((variant) => String(variant?.label || "").trim())
    });

    for (const videoModel of effectiveVideoModels) {
      let modelReturnedDoneWithoutMedia = false;
      for (const [variantIndex, variant] of effectiveRequestVariants.entries()) {
        traceReferenceVideo("variant-start", {
          model: videoModel,
          variant: String(variant?.label || "").trim(),
          variantIndex: variantIndex + 1,
          variantCount: effectiveRequestVariants.length
        });
        updateDialogueVideoJob({
          status: "running",
          stage: "request_variant",
          progress: Math.max(0.18, Math.min(0.78, 0.18 + (((variantIndex + 1) / Math.max(1, effectiveRequestVariants.length)) * 0.2))),
          hint: `Probando ${videoModel} · ${String(variant?.label || "").trim() || "variant"}.`,
          model: videoModel,
          variant: String(variant?.label || "").trim(),
          segmentIndex: Number(req.body?.segmentIndex || 0) || 0,
          segmentCount: Number(req.body?.segmentCount || 0) || 0
        });
        const createOpResponse = await fetchCompat(
          `${GEMINI_BASE}/models/${encodeURIComponent(videoModel)}:predictLongRunning?key=${encodeURIComponent(GEMINI_API_KEY)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(variant.body)
          }
        );
        const createData = await safeJson(createOpResponse);
        if (!createOpResponse.ok) {
          const detail = String(createData?.error?.message || createData?.error || `HTTP ${createOpResponse.status}`).trim();
          lastStatus = Number(createOpResponse.status || 502);
          lastErrorDetail = `${videoModel} [${variant.label}]: ${detail}`;
          attemptErrors.push(lastErrorDetail);
          if ([400, 401, 403, 404].includes(lastStatus)) continue;
          return res.status(lastStatus).json(createData);
        }
        const operationName = String(createData?.name || "").trim();
        if (!operationName) {
          lastStatus = 502;
          lastErrorDetail = `${videoModel} [${variant.label}]: no devolvió nombre de operación`;
          attemptErrors.push(lastErrorDetail);
          continue;
        }
        traceReferenceVideo("variant-operation-created", {
          model: videoModel,
          variant: String(variant?.label || "").trim(),
          operationName
        });

        let operationDone = null;
        try {
          // eslint-disable-next-line no-await-in-loop
          operationDone = await pollUntilDone(operationName, {
            maxAttempts: requestedMaxOperationPollAttempts,
            requireResolvedMedia: true,
            resolveResult: resolveVeoVideoResult,
            postDoneGraceAttempts: 6,
            postDoneGraceDelayMs: 2500,
            onPoll: ({ attempt, maxAttempts }) => {
              if (attempt === 1 || attempt % 5 === 0) {
                traceReferenceVideo("variant-poll", {
                  model: videoModel,
                  variant: String(variant?.label || "").trim(),
                  operationName,
                  attempt,
                  maxAttempts
                });
              }
              logHeavyWorkMemory("dialogue_video", "poll_operation", {
                jobId,
                sessionId,
                rowId,
                attempt,
                maxAttempts
              });
              updateDialogueVideoJob({
                status: "running",
                stage: "poll_operation",
                progress: Math.max(0.22, Math.min(0.92, 0.22 + ((attempt / Math.max(1, maxAttempts)) * 0.56))),
                hint: `Esperando respuesta de Veo (${attempt}/${maxAttempts}).`,
                model: videoModel,
                variant: String(variant?.label || "").trim(),
                attempt,
                segmentIndex: Number(req.body?.segmentIndex || 0) || 0,
                segmentCount: Number(req.body?.segmentCount || 0) || 0
              });
            }
          });
        } catch (error) {
          lastStatus = Number(error?.status || 504) || 504;
          lastErrorDetail = `${videoModel} [${variant.label}]: ${String(error?.message || "Error al esperar operación Veo.")}`;
          attemptErrors.push(lastErrorDetail);
          continue;
        }

        const resolved = resolveVeoVideoResult(operationDone);
        const videoUri = String(resolved?.uri || "").trim();
        if (!videoUri && resolved?.inlineData?.data) {
          traceReferenceVideo("variant-inline-video", {
            model: videoModel,
            variant: String(variant?.label || "").trim(),
            operationName,
            mimeType: String(resolved.inlineData.mimeType || "video/mp4").trim() || "video/mp4"
          });
          const mimeType = String(resolved.inlineData.mimeType || "video/mp4").trim() || "video/mp4";
          const downloadedBuffer = Buffer.from(String(resolved.inlineData.data || ""), "base64");
          if (!downloadedBuffer.length || downloadedBuffer.length > MAX_DIALOGUE_VIDEO_BYTES) {
            lastStatus = 413;
            lastErrorDetail = `${videoModel} [${variant.label}]: video inline demasiado grande o vacío.`;
            attemptErrors.push(lastErrorDetail);
            continue;
          }
          finalVideoBuffer = downloadedBuffer;
          finalVideoMimeType = mimeType.toLowerCase().startsWith("video/") ? mimeType : "video/mp4";
          resolvedModel = videoModel;
          resolvedVariant = String(variant?.label || "").trim();
          break;
        }
        if (!videoUri) {
          lastStatus = 502;
          lastErrorDetail = `${videoModel} [${variant.label}]: operación completada sin URI de video`;
          attemptErrors.push(lastErrorDetail);
          modelReturnedDoneWithoutMedia = true;
          const fallbackDecision = shouldContinueVariantFallback({
            status: lastStatus,
            reason: "done_without_media",
            variantIndex,
            variantCount: effectiveRequestVariants.length
          });
          traceReferenceVideo("variant-finished-without-media", {
            model: videoModel,
            variant: String(variant?.label || "").trim(),
            operationName,
            remainingVariants: fallbackDecision.remainingVariants,
            continueCurrentModel: fallbackDecision.continueCurrentModel,
            logReason: fallbackDecision.logReason
          });
          if (fallbackDecision.continueCurrentModel) {
            continue;
          }
          break;
        }
        traceReferenceVideo("variant-video-uri", {
          model: videoModel,
          variant: String(variant?.label || "").trim(),
          operationName,
          videoUri
        });

        // eslint-disable-next-line no-await-in-loop
        const videoResponse = await fetchCompat(videoUri, {
          method: "GET",
          headers: {
            "x-goog-api-key": GEMINI_API_KEY
          }
        });
        logHeavyWorkMemory("dialogue_video", "download_generated_video", {
          jobId,
          sessionId,
          rowId,
          model: videoModel,
          variant: String(variant?.label || "").trim()
        });
        if (!videoResponse.ok) {
          // eslint-disable-next-line no-await-in-loop
          const detail = await safeJson(videoResponse);
          lastStatus = Number(videoResponse.status || 502) || 502;
          lastErrorDetail = `${videoModel} [${variant.label}]: no se pudo descargar video (${String(detail?.error?.message || detail?.error || `HTTP ${videoResponse.status}`)})`;
          attemptErrors.push(lastErrorDetail);
          continue;
        }

        // eslint-disable-next-line no-await-in-loop
        const downloadedBuffer = Buffer.from(await videoResponse.arrayBuffer());
        if (!downloadedBuffer.length || downloadedBuffer.length > MAX_DIALOGUE_VIDEO_BYTES) {
          lastStatus = 413;
          lastErrorDetail = `${videoModel} [${variant.label}]: video generado demasiado grande.`;
          attemptErrors.push(lastErrorDetail);
          continue;
        }

        finalVideoBuffer = downloadedBuffer;
        finalVideoMimeType = String(videoResponse.headers.get("content-type") || "video/mp4").trim() || "video/mp4";
        if (!String(finalVideoMimeType).toLowerCase().startsWith("video/")) {
          finalVideoMimeType = "video/mp4";
        }
        resolvedModel = videoModel;
        resolvedVariant = String(variant?.label || "").trim();
        break;
      }
      if (finalVideoBuffer) break;
      if (modelReturnedDoneWithoutMedia) {
        traceReferenceVideo("switch-model-after-empty-media", {
          failedModel: videoModel,
          nextCandidates: effectiveVideoModels.filter((candidate) => String(candidate || "").trim() !== String(videoModel || "").trim()),
          attemptedVariants: effectiveRequestVariants.length,
          lastErrorDetail
        });
        updateDialogueVideoJob({
          status: "running",
          stage: "switch_model",
          progress: 0.72,
          hint: `Cambiando de modelo tras respuesta vacia de ${videoModel}.`,
          model: videoModel
        });
      }
    }

    if (!finalVideoBuffer) {
      traceReferenceVideo("generation-failed", {
        strictIdentity,
        educationalVideo,
        hasPortraitAsset,
        lastStatus,
        lastErrorDetail,
        attemptErrors: attemptErrors.slice(-6)
      });
      if (strictIdentity) {
        return res.status(lastStatus >= 400 ? lastStatus : 502).json({
          error: `No se pudo mantener identidad del locutor con referenceImages. ${lastErrorDetail}`
        });
      }
      const errorPreview = attemptErrors.slice(-4).join(" | ");
      return res.status(lastStatus >= 400 ? lastStatus : 502).json({
        error: errorPreview ? `${lastErrorDetail}. Intentos: ${errorPreview}` : lastErrorDetail
      });
    }

    const sourceVideoMimeType = String(finalVideoMimeType || "video/mp4").trim() || "video/mp4";
    const sourceVideoBytes = Number(finalVideoBuffer?.length || 0);
    let transcodeMeta = null;
    try {
      logHeavyWorkMemory("dialogue_video", "transcode_video", {
        jobId,
        sessionId,
        rowId,
        sourceBytes: sourceVideoBytes
      });
      transcodeMeta = await transcodeDialogueVideoToMp4(finalVideoBuffer, sourceVideoMimeType);
      finalVideoBuffer = Buffer.from(transcodeMeta.buffer);
      finalVideoMimeType = String(transcodeMeta.mimeType || "video/mp4").trim() || "video/mp4";
    } catch (error) {
      const stage = String(error?.stage || "transcode").trim() || "transcode";
      const reason = String(error?.code || error?.message || "video_transcode_failed").trim() || "video_transcode_failed";
      console.error(`[backend][${requestDebugTag}] video_transcode_failed`, {
        model: resolvedModel,
        variant: resolvedVariant,
        sourceMimeType: sourceVideoMimeType,
        stage,
        reason
      });
      return res.status(502).json({
        error: `video_transcode_failed: ${reason}`,
        code: "video_transcode_failed",
        detail: {
          model: resolvedModel,
          sourceMimeType: sourceVideoMimeType,
          stage
        }
      });
    }
    console.info(`[backend][${requestDebugTag}] video-transcode`, {
      model: resolvedModel,
      variant: resolvedVariant,
      sourceMimeType: sourceVideoMimeType,
      outputMimeType: finalVideoMimeType,
      inputVideoCodec: String(transcodeMeta?.inputProbe?.videoCodec || "").trim() || "unknown",
      inputAudioCodec: String(transcodeMeta?.inputProbe?.audioCodec || "").trim() || "unknown",
      outputVideoCodec: String(transcodeMeta?.videoCodec || "").trim() || "h264",
      outputAudioCodec: String(transcodeMeta?.audioCodec || "").trim() || "aac",
      inputDuration: String(transcodeMeta?.inputProbe?.duration || "").trim() || null,
      outputDuration: String(transcodeMeta?.outputProbe?.duration || "").trim() || null,
      sourceBytes: sourceVideoBytes,
      outputBytes: Number(finalVideoBuffer?.length || 0)
    });
    traceReferenceVideo("generation-succeeded", {
      model: resolvedModel,
      variant: resolvedVariant,
      sourceVideoMimeType,
      outputMimeType: finalVideoMimeType,
      outputBytes: Number(finalVideoBuffer?.length || 0)
    });

    const ext = getVideoExtension(finalVideoMimeType);
    const sessionSlug = normalizeStorageSegment(sessionId, "session");
    const rowSlug = normalizeStorageSegment(rowId, "row");
    const speakerSlug = normalizeStorageSegment(speakerLabel, "speaker");
    const clipId = randomUUID();
    const storagePath = `podcaster/sessions/${sessionSlug}/owners/${normalizeStorageSegment(uid, "anon")}/videos/${rowSlug}-${speakerSlug}/${clipId}.${ext}`;
    logHeavyWorkMemory("dialogue_video", "upload_result", {
      jobId,
      sessionId,
      rowId,
      outputBytes: Number(finalVideoBuffer?.length || 0) || 0
    });
    const asset = await uploadScreenshotAsset({
      path: storagePath,
      buffer: finalVideoBuffer,
      mimeType: finalVideoMimeType,
      metadata: {
        uid,
        sessionId,
        rowId,
        speakerLabel,
        speakerName,
        referenceImageName,
        referenceMode,
        referenceVideoName,
        hasSceneReference: hasSceneReference ? "1" : "0",
        hasSceneReferenceVideo: hasSceneReferenceVideo ? "1" : "0",
        enhanceFromExistingVideo: enhanceFromExistingVideo ? "1" : "0",
        regenerationAnalysisFrames: String(Math.max(0, Number(regenerationAnalysis?.frameCount || 0) || 0)),
        usedSceneReference: (hasSceneReferenceVideo || useSceneReferenceAsInitImage) ? "1" : "0",
        model: resolvedModel,
        sourceMimeType: sourceVideoMimeType,
        videoCodec: String(transcodeMeta?.videoCodec || "h264").trim() || "h264",
        audioCodec: String(transcodeMeta?.audioCodec || "aac").trim() || "aac",
        kind: "dialogue_video"
      }
    });
    if (regenerate && previousStoragePath && previousStoragePath !== storagePath) {
      await deleteStoragePath(previousStoragePath).catch(() => {});
    }

    return res.status(200).json({
      ok: true,
      dialogueVideo: {
        rowId,
        speaker: speakerLabel,
        mimeType: finalVideoMimeType,
        sourceMimeType: sourceVideoMimeType,
        container: "mp4",
        videoCodec: String(transcodeMeta?.videoCodec || "h264").trim() || "h264",
        audioCodec: String(transcodeMeta?.audioCodec || "aac").trim() || "aac",
        transcoded: true,
        model: resolvedModel,
        variant: resolvedVariant || null,
        promptVersion: "podcaster_veo_v1",
        videoDirective,
        scenePrompt: sceneVisualPrompt,
        imagePrompts: sceneImagePromptList,
        contentMode: educationalVideo ? "educational" : "podcast",
        durationSec: inferredTargetDurationSec,
        targetSpeechLine: text,
        updatedAt: new Date().toISOString(),
        storagePath: asset.path,
        downloadUrl: asset.downloadUrl
      }
    });
  } catch (error) {
    console.error("[backend][dialogue-video] unhandled error", {
      status: Number(error?.status || 500),
      message: String(error?.message || "No se pudo generar video del diálogo."),
      stack: String(error?.stack || "").split("\n").slice(0, 3).join(" | ")
    });
    return res.status(Number(error?.status || 500)).json({
      error: String(error?.message || "No se pudo generar video del diálogo."),
      code: String(error?.code || "").trim() || undefined,
      detail: error?.detail && typeof error.detail === "object" ? error.detail : undefined
    });
  } finally {
    releaseHeavyWorkSlot("dialogue_video", jobId);
  }
});

function normalizeGeminiInlineAudioTags(value = "") {
  const source = String(value || "").trim();
  if (!source) return "";
  const explicitTags = source.match(/\[[^[\]]+\]/g);
  if (explicitTags?.length) {
    return explicitTags.map((tag) => clampText(tag.replace(/\s+/g, " ").trim(), 40)).filter(Boolean).slice(0, 6).join(" ");
  }
  return source
    .split(/[,\n;|]+/)
    .map((part) => clampText(String(part || "").replace(/[\[\]]/g, "").replace(/\s+/g, " ").trim(), 32))
    .filter(Boolean)
    .slice(0, 6)
    .map((part) => `[${part}]`)
    .join(" ");
}

function normalizeGeminiTtsDirectionConfig(input = {}) {
  return {
    stylePrompt: clampText(input?.stylePrompt || "", 260),
    pacingPrompt: clampText(input?.pacingPrompt || "", 180),
    accentPrompt: clampText(input?.accentPrompt || "", 180),
    scenePrompt: clampText(input?.scenePrompt || "", 220),
    audioTags: normalizeGeminiInlineAudioTags(input?.audioTags || "")
  };
}

function buildGeminiTtsBaseStyle(expression = "") {
  const clean = String(expression || "").trim();
  if (clean === "Enérgico") return "Enérgica y animada, pero natural y sin gritar.";
  if (clean === "Cálido") return "Cálida, cercana y tranquilizadora.";
  if (clean === "Curioso") return "Curiosa, ligeramente intrigada y conversacional.";
  if (clean === "Serio") return "Seria, enfocada y controlada.";
  if (clean === "Inspirador") return "Inspiradora, esperanzadora y convincente.";
  return "Natural, humana y creíble.";
}

function buildGeminiTtsPrompt({
  speakerName = "Locutor",
  speakerLabel = "Host A",
  voiceName = "",
  expression = "Neutral",
  targetSpeechLine = "",
  targetDurationSec = 0,
  speechRateHint = 1,
  originalText = "",
  disfluencyInstruction = "",
  notes = "",
  contentMode = "podcast",
  ttsDirection = {}
} = {}) {
  const direction = normalizeGeminiTtsDirectionConfig(ttsDirection || {});
  const transcriptBase = clampText(targetSpeechLine || "", 2200);
  const transcript = [direction.audioTags, transcriptBase].filter(Boolean).join(" ").replace(/\s+/g, " ").trim() || transcriptBase;
  const styleLine = [buildGeminiTtsBaseStyle(expression), direction.stylePrompt].filter(Boolean).join(" ");
  const pacingLine = direction.pacingPrompt || "Conversacional, fluido y con pausas naturales.";
  const accentLine = direction.accentPrompt || "Español latino neutro, dicción clara.";
  const cleanTargetDurationSec = Math.max(0, Number(targetDurationSec || 0) || 0);
  const cleanSpeechRateHint = Math.max(0.5, Math.min(1.85, Number(speechRateHint || 1) || 1));
  const sceneLine = direction.scenePrompt || (String(contentMode || "").trim().toLowerCase() === "educational"
    ? "Explicación cercana de estudio, clara y humana."
    : "Conversación de podcast en estudio, cercana y natural.");
  return [
    "Synthesize speech for the TRANSCRIPT only. Do not read section titles, notes, labels, or instructions aloud.",
    "Keep the wording of the TRANSCRIPT exact, preserving any intentional fillers, repairs, or stutters already present there.",
    "Never speak the director notes aloud.",
    "",
    "### AUDIO PROFILE",
    `Speaker: ${clampText(speakerName || "Locutor", 120)} (${clampText(speakerLabel || "Host A", 80)}).`,
    voiceName ? `Voice: ${clampText(voiceName, 80)}.` : "",
    "",
    "### SCENE",
    sceneLine,
    "",
    "### DIRECTOR'S NOTES",
    `Style: ${styleLine}`,
    `Pacing: ${pacingLine}`,
    cleanTargetDurationSec > 0 ? `Target duration: approximately ${cleanTargetDurationSec.toFixed(2)} seconds.` : "",
    `Speech rate hint: ${cleanSpeechRateHint.toFixed(2)}x relative pace. If the transcript is short for the target duration, slow down naturally; if it is long, tighten phrasing without sounding rushed.`,
    `Accent: ${accentLine}`,
    `Delivery guardrails: ${clampText(disfluencyInstruction || "Natural, clean articulation.", 1800)}`,
    notes ? `Additional notes: ${clampText(notes, 1200)}` : "",
    originalText ? `Reference only, do not read: "${String(clampText(originalText, 2000)).replace(/"/g, '\\"')}"` : "",
    "",
    "### TRANSCRIPT",
    `"${String(transcript).replace(/"/g, '\\"')}"`
  ].filter(Boolean).join("\n");
}

app.post(["/api/podcaster/dialogue-audio/generate", "/api/podcaster/dialogue-audios/generate"], async (req, res) => {
  if (!ensureGeminiKey(res)) return;
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const sessionId = clampText(req.body?.sessionId || "", 140);
    const rowId = clampText(req.body?.rowId || "", 120);
    const speakerLabel = clampText(req.body?.speakerLabel || "", 80);
    const speakerName = clampText(req.body?.speakerName || "", 120) || speakerLabel || "Locutor";
    const voiceNameInput = clampText(req.body?.voiceName || "", 80);
    const voiceName = normalizeLiveVoiceName(voiceNameInput);
    const expression = clampText(req.body?.expression || "Neutral", 80) || "Neutral";
    const text = clampText(req.body?.text || "", 2000);
    const targetSpeechLine = clampText(req.body?.targetSpeechLine || text, 2200) || text;
    const targetDurationSec = Math.max(0, Number(req.body?.targetDurationSec || 0) || 0);
    const speechRateHint = Math.max(0.5, Math.min(1.85, Number(req.body?.speechRateHint || 1) || 1));
    const originalText = clampText(req.body?.originalText || "", 2000);
    const disfluencyInstruction = clampText(req.body?.disfluencyInstruction || "", 1800);
    const ttsDirection = normalizeGeminiTtsDirectionConfig(req.body?.ttsDirection || req.body?.ttsDirectionConfig || {});
    const notes = clampText(req.body?.notes || "", 1200);
    const contentMode = String(req.body?.contentMode || "").trim().toLowerCase();
    const educationalAudio = req.body?.videoMode === true || contentMode === "educational" || contentMode === "creative";
    const regenerate = req.body?.regenerate === true;
    const previousStoragePath = clampText(req.body?.previousStoragePath || "", 700);
    const model = normalizeModel(req.body?.model || "gemini-3.1-flash-tts-preview");

    console.log(`[DialogueAudio] Generating for session ${sessionId}, row ${rowId}, regenerate: ${regenerate}, previous: ${!!previousStoragePath}`);

    if (!sessionId) return res.status(400).json({ error: "Falta sessionId." });
    if (!rowId) return res.status(400).json({ error: "Falta rowId." });
    if (!speakerLabel) return res.status(400).json({ error: "Falta speakerLabel." });
    if (!text) return res.status(400).json({ error: "Falta texto de diálogo." });
    if (!/^gemini-[a-z0-9.-]+$/i.test(String(model || ""))) {
      return res.status(400).json({ error: "Modelo inválido para diálogo de audio." });
    }
    if (voiceNameInput && !voiceName) {
      return res.status(400).json({ error: `Voz no soportada para Gemini Live: ${voiceNameInput}` });
    }

    const prompt = buildGeminiTtsPrompt({
      speakerName,
      speakerLabel,
      voiceName,
      expression,
      targetSpeechLine,
      targetDurationSec,
      speechRateHint,
      originalText,
      disfluencyInstruction,
      notes,
      contentMode: educationalAudio ? "educational" : "podcast",
      ttsDirection
    });

    const payload = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["AUDIO"]
      }
    };
    if (voiceName) {
      payload.generationConfig.speechConfig = {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName
          }
        }
      };
    }

    const upstream = await fetchCompat(
      `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );
    const data = await safeJson(upstream);
    if (!upstream.ok) {
      return res.status(Number(upstream.status || 502)).json({
        error: String(data?.error?.message || data?.error || `No se pudo generar audio (${upstream.status}).`)
      });
    }

    const audioParts = readGeminiAudioParts(data);
    if (!audioParts.length) {
      return res.status(502).json({ error: "Gemini no devolvió audio para la escena." });
    }
    const firstMime = String(audioParts[0]?.mimeType || "audio/L16;rate=24000").trim() || "audio/L16;rate=24000";
    const mimeLower = firstMime.toLowerCase();
    const pcmLike = mimeLower.includes("audio/l16") || mimeLower.includes("audio/pcm");
    const merged = Buffer.concat(audioParts.map((part) => Buffer.from(String(part.data || ""), "base64")));
    if (!merged.length || merged.length > MAX_DIALOGUE_AUDIO_BYTES) {
      return res.status(413).json({ error: "El audio generado excede el tamaño permitido." });
    }
    const sampleRateMatch = firstMime.match(/rate=(\d+)/i);
    const sampleRate = sampleRateMatch ? Number(sampleRateMatch[1]) : 24000;
    const baseBuffer = pcmLike ? pcm16ToWavBuffer(merged, sampleRate) : merged;
    const baseMime = pcmLike ? "audio/wav" : (firstMime.startsWith("audio/") ? firstMime.split(";")[0] : "audio/wav");
    const naturalDurationSec = pcmLike
      ? clampNumber(merged.length / Math.max(1, sampleRate * 2), 0, 180, 0)
      : clampNumber(parseWavDurationSeconds(baseBuffer), 0, 180, 0);
    const retimedAudio = await retimeDialogueAudioBufferToTargetDuration(baseBuffer, {
      targetDurationSec,
      measuredDurationSec: naturalDurationSec,
      mimeType: baseMime
    });
    const finalBuffer = retimedAudio?.buffer?.length ? retimedAudio.buffer : baseBuffer;
    const finalMime = String(retimedAudio?.mimeType || baseMime).trim() || baseMime;
    const durationSec = Math.max(
      0,
      Number(retimedAudio?.durationSec || 0) || clampNumber(parseWavDurationSeconds(finalBuffer), 0, 180, 0)
    );
    const wordTimings = extractGeminiDialogueAudioWordTimings(data, targetSpeechLine, durationSec);

    const ext = getAudioExtension(finalMime);
    const sessionSlug = normalizeStorageSegment(sessionId, "session");
    const rowSlug = normalizeStorageSegment(rowId, "row");
    const speakerSlug = normalizeStorageSegment(speakerLabel, "speaker");
    const storagePath = `podcaster/sessions/${sessionSlug}/owners/${normalizeStorageSegment(uid, "anon")}/audio/${rowSlug}-${speakerSlug}/${randomUUID()}.${ext}`;
    const asset = await uploadScreenshotAsset({
      path: storagePath,
      buffer: finalBuffer,
      mimeType: finalMime,
      metadata: {
        uid,
        sessionId,
        rowId,
        speakerLabel,
        speakerName,
        voiceName: voiceName || null,
        model,
        targetDurationSec: targetDurationSec > 0 ? String(targetDurationSec) : null,
        naturalDurationSec: naturalDurationSec > 0 ? String(naturalDurationSec) : null,
        appliedSpeedRatio: Number(retimedAudio?.appliedSpeedRatio || 1).toFixed(5),
        tempoAdjusted: retimedAudio?.applied ? "true" : "false",
        kind: "dialogue_audio"
      }
    });
    if (regenerate && previousStoragePath && previousStoragePath !== storagePath) {
      await deleteStoragePath(previousStoragePath).catch(() => {});
    }

    return res.status(200).json({
      ok: true,
      dialogueAudio: {
        rowId,
        speaker: speakerLabel,
        mimeType: finalMime,
        model,
        promptVersion: "podcaster_live_audio_v1",
        durationSec,
        targetDurationSec,
        naturalDurationSec,
        tempoAdjusted: retimedAudio?.applied === true,
        appliedSpeedRatio: Number(retimedAudio?.appliedSpeedRatio || 1) || 1,
        targetSpeechLine,
        wordTimings,
        updatedAt: new Date().toISOString(),
        storagePath: asset.path,
        downloadUrl: asset.downloadUrl
      }
    });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo generar audio del diálogo.") });
  }
});

function getMontageExportExtension(format = "mp4_h264") {
  const clean = String(format || "").trim().toLowerCase();
  if (clean === "webm_vp9") return "webm";
  return "mp4";
}

function getMontageExportMimeType(format = "mp4_h264") {
  const ext = getMontageExportExtension(format);
  return ext === "webm" ? "video/webm" : "video/mp4";
}

function resolveMontageExportScaleFilter(resolution = "source") {
  const key = String(resolution || "").trim().toLowerCase();
  if (key === "source") return "";
  const target = key === "1080p" ? { w: 1920, h: 1080 }
    : key === "720p" ? { w: 1280, h: 720 }
      : key === "1080x1920" ? { w: 1080, h: 1920 }
        : key === "720x1280" ? { w: 720, h: 1280 }
          : key === "480x854" ? { w: 480, h: 854 }
            : { w: 854, h: 480 };
  // Downscale-only + enforce even dims for yuv420p.
  return `scale='if(gt(iw,${target.w}),${target.w},iw)':'if(gt(ih,${target.h}),${target.h},ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2`;
}

function normalizeStorageFilePath(value = "") {
  let raw = String(value || "").trim();
  if (!raw) return "";
  try { raw = decodeURIComponent(raw); } catch (_) {}
  const shouldParseAsUrl = /^https?:\/\//i.test(raw) || raw.startsWith("/api/assets/proxy-media");
  if (shouldParseAsUrl) try {
    const parsed = new URL(raw, "http://local.invalid");
    const storagePath = String(parsed.searchParams.get("storagePath") || "").trim();
    if (storagePath) return normalizeStorageFilePath(storagePath);
    const parsedObject = parseFirebaseStorageGoogleApisObjectUrl(raw);
    if (parsedObject?.objectPath) return normalizeStorageFilePath(parsedObject.objectPath);
    const host = String(parsed.hostname || "").toLowerCase();
    if (host === "firebasestorage.googleapis.com") {
      const marker = "/o/";
      const pathname = String(parsed.pathname || "");
      const markerIndex = pathname.indexOf(marker);
      if (markerIndex >= 0) return normalizeStorageFilePath(pathname.slice(markerIndex + marker.length));
    }
    if (host === "storage.googleapis.com") {
      const parts = String(parsed.pathname || "").split("/").filter(Boolean);
      if (parts.length >= 2) return normalizeStorageFilePath(parts.slice(1).join("/"));
    }
    return "";
  } catch (_) {}
  if (raw.startsWith("gs://")) {
    raw = raw.replace(/^gs:\/\//i, "");
    const slash = raw.indexOf("/");
    raw = slash >= 0 ? raw.slice(slash + 1) : "";
  }
  const queryIndex = raw.indexOf("?");
  if (queryIndex >= 0) raw = raw.slice(0, queryIndex);
  raw = raw.replace(/^\/+/, "");
  // Algunas rutas pueden venir URL-encoded (p.ej. %2F). Decodifica best-effort.
  if (/%2f/i.test(raw) || /%25/i.test(raw)) {
    try {
      raw = decodeURIComponent(raw);
    } catch (_) {
      // noop
    }
  }
  return String(raw || "").trim();
}

function isAllowedRemoteMediaUrl(url = "") {
  const clean = String(url || "").trim();
  if (!clean) return false;
  try {
    const parsed = new URL(clean);
    const host = String(parsed.hostname || "").toLowerCase();
    return host.endsWith("googleapis.com") || host.endsWith("firebasestorage.app") || host === "storage.googleapis.com" || host === "localhost" || host === "127.0.0.1" || host.endsWith(".local");
  } catch (_) {
    return false;
  }
}

function isAllowedMoodleInstructionImageImportUrl(url = "") {
  const clean = String(url || "").trim();
  if (!clean) return false;
  try {
    const parsed = new URL(clean);
    const protocol = String(parsed.protocol || "").toLowerCase();
    const host = String(parsed.hostname || "").toLowerCase();
    if (!["https:", "http:"].includes(protocol)) return false;
    if (!host || host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) return false;
    if (/^(10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.|192\.168\.)/.test(host)) return false;
    return true;
  } catch (_) {
    return false;
  }
}

function coerceReadableStream(body = null) {
  if (!body) return null;
  if (typeof body.pipe === "function") return body;
  // Node 18+ global fetch uses WHATWG ReadableStream.
  if (typeof body.getReader === "function" && typeof Readable.fromWeb === "function") {
    return Readable.fromWeb(body);
  }
  return null;
}

function parseFirebaseStorageGoogleApisObjectUrl(url = "") {
  const clean = String(url || "").trim();
  if (!clean) return null;
  try {
    const parsed = new URL(clean);
    const host = String(parsed.hostname || "").toLowerCase();
    if (host === "firebasestorage.googleapis.com") {
      const match = String(parsed.pathname || "").match(/^\/(?:v0\/)?b\/([^/]+)\/o\/(.+)$/);
      if (!match) return null;
      const bucket = String(match[1] || "").trim();
      let objectPath = String(match[2] || "").trim();
      if (!bucket || !objectPath) return null;
      try {
        objectPath = decodeURIComponent(objectPath);
      } catch (_) {
        // noop
      }
      // Handle multi-encoded paths (common with Firebase Storage URLs in some environments)
      for (let i = 0; i < 3; i++) {
        if (/%[0-9a-f]{2}/i.test(objectPath)) {
          try {
            objectPath = decodeURIComponent(objectPath);
          } catch (_) {
            break;
          }
        } else {
          break;
        }
      }
      objectPath = String(objectPath || "").replace(/^\/+/, "").trim();
      if (!objectPath) return null;
      return { bucket, objectPath };
    }
    if (host === "storage.googleapis.com") {
      const parts = String(parsed.pathname || "").split("/").filter(Boolean);
      if (parts.length < 2) return null;
      const bucket = String(parts.shift() || "").trim();
      const objectPath = parts.join("/").replace(/^\/+/, "").trim();
      return bucket && objectPath ? { bucket, objectPath } : null;
    }
    if (host.endsWith("firebasestorage.app")) {
      const objectPath = String(parsed.pathname || "").replace(/^\/+/, "").trim();
      return objectPath ? { bucket: host, objectPath } : null;
    }
    return null;
  } catch (_) {
    return null;
  }
}

function convertGsUrlToFirebaseStorageMediaUrl(url = "") {
  const clean = String(url || "").trim();
  if (!clean.startsWith("gs://")) return "";
  const withoutScheme = clean.replace(/^gs:\/\//i, "");
  const slashIndex = withoutScheme.indexOf("/");
  if (slashIndex < 0) return "";
  const bucket = String(withoutScheme.slice(0, slashIndex) || "").trim();
  const objectPath = String(withoutScheme.slice(slashIndex + 1) || "").trim();
  if (!bucket || !objectPath) return "";
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectPath)}?alt=media`;
}

function deriveStoragePathFromMediaSource(url = "", storagePath = "") {
  const cleanStoragePath = normalizeStorageFilePath(storagePath);
  if (cleanStoragePath) return cleanStoragePath;
  return normalizeStorageFilePath(parseFirebaseStorageGoogleApisObjectUrl(url)?.objectPath || "");
}

async function downloadStoragePathToFile(storagePath = "", outPath = "", options = {}) {
  const cleanPath = normalizeStorageFilePath(storagePath);
  const targetPath = String(outPath || "").trim();
  const shouldAbort = typeof options?.shouldAbort === "function" ? options.shouldAbort : null;
  const isAborted = () => {
    if (!shouldAbort) return false;
    try {
      return shouldAbort() === true;
    } catch (_) {
      return false;
    }
  };
  if (!cleanPath || !targetPath) {
    const err = new Error("missing_download_path");
    err.code = "missing_download_path";
    err.detail = { storagePath: cleanPath, outPath: targetPath };
    throw err;
  }
  const buckets = getStorageBucketCandidates();
  let lastError = null;
  let lastMetaError = null;
  for (const bucket of buckets) {
    if (!bucket) continue;
    if (isAborted()) {
      const err = new Error("montage_export_cancelled");
      err.code = "montage_export_cancelled";
      err.status = 499;
      throw err;
    }
    const file = bucket.file(cleanPath);
    try {
      // Validate object metadata first so a wrong/missing bucket is skipped
      // before opening a potentially slow stream.
      // eslint-disable-next-line no-await-in-loop
      await file.getMetadata();
    } catch (metaError) {
      lastMetaError = metaError;
      lastError = metaError;
      const status = Number(metaError?.code || metaError?.statusCode || metaError?.status || 0) || 0;
      const metaMessage = String(metaError?.message || "").toLowerCase();
      if (status === 404 || metaMessage.includes("bucket does not exist")) {
        continue;
      }
      if (status === 401 || status === 403) {
        const err = new Error("storage_forbidden");
        err.code = "storage_forbidden";
        err.status = 502;
        err.detail = {
          storagePath: cleanPath,
          bucket: String(bucket?.name || "").trim(),
          message: String(metaError?.message || metaError),
        };
        throw err;
      }
      if (String(metaError?.code || "") === "ENOTFOUND" || String(metaError?.code || "") === "ECONNRESET") {
        const err = new Error("storage_not_available");
        err.code = "storage_not_available";
        err.status = 502;
        err.detail = {
          storagePath: cleanPath,
          bucket: String(bucket?.name || "").trim(),
          message: String(metaError?.message || metaError),
        };
        throw err;
      }
      continue;
    }
    try {
      await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
      await new Promise((resolve, reject) => {
        const readStream = file.createReadStream();
        const writeStream = fs.createWriteStream(targetPath);
        let settled = false;
        let idleTimer = null;
        let abortTimer = null;

        const clearIdleTimer = () => {
          if (idleTimer) {
            clearTimeout(idleTimer);
            idleTimer = null;
          }
        };
        const clearAbortTimer = () => {
          if (abortTimer) {
            clearInterval(abortTimer);
            abortTimer = null;
          }
        };

        const armIdleTimer = () => {
          clearIdleTimer();
          idleTimer = setTimeout(() => {
            const err = new Error("storage_download_idle_timeout");
            err.code = "storage_download_idle_timeout";
            err.status = 504;
            err.detail = {
              storagePath: cleanPath,
              bucket: String(bucket?.name || "").trim(),
              idleTimeoutMs: MONTAGE_EXPORT_SCENE_DOWNLOAD_IDLE_TIMEOUT_MS
            };
            try { readStream.destroy(err); } catch (_) {}
            try { writeStream.destroy(err); } catch (_) {}
          }, MONTAGE_EXPORT_SCENE_DOWNLOAD_IDLE_TIMEOUT_MS);
        };

        const finish = (error = null) => {
          if (settled) return;
          settled = true;
          clearIdleTimer();
          clearAbortTimer();
          if (error) {
            reject(error);
            return;
          }
          resolve(targetPath);
        };

        armIdleTimer();
        if (shouldAbort) {
          abortTimer = setInterval(() => {
            if (settled || !isAborted()) return;
            const err = new Error("montage_export_cancelled");
            err.code = "montage_export_cancelled";
            err.status = 499;
            err.detail = {
              storagePath: cleanPath,
              bucket: String(bucket?.name || "").trim()
            };
            try { readStream.destroy(err); } catch (_) {}
            try { writeStream.destroy(err); } catch (_) {}
            finish(err);
          }, 250);
          if (typeof abortTimer.unref === "function") abortTimer.unref();
        }
        readStream.on("data", () => {
          if (isAborted()) {
            const err = new Error("montage_export_cancelled");
            err.code = "montage_export_cancelled";
            err.status = 499;
            err.detail = {
              storagePath: cleanPath,
              bucket: String(bucket?.name || "").trim()
            };
            try { readStream.destroy(err); } catch (_) {}
            try { writeStream.destroy(err); } catch (_) {}
            finish(err);
            return;
          }
          armIdleTimer();
        });
        readStream.on("error", (error) => finish(error));
        writeStream.on("error", (error) => finish(error));
        writeStream.on("close", () => finish(null));
        readStream.pipe(writeStream);
      });
      return targetPath;
    } catch (error) {
      lastError = error;
      const message = String(error?.message || "").toLowerCase();
      const status = Number(error?.code || error?.statusCode || error?.status || 0) || 0;
      if (status === 404 || message.includes("no such object")) {
        continue;
      }
      if (status === 401 || status === 403 || message.includes("permission") || message.includes("forbidden")) {
        const err = new Error("storage_forbidden");
        err.code = "storage_forbidden";
        err.status = 502;
        err.detail = {
          storagePath: cleanPath,
          bucket: String(bucket?.name || "").trim(),
          message: String(error?.message || error),
        };
        throw err;
      }
      if (String(error?.code || "") === "ENOTFOUND" || String(error?.code || "") === "ECONNRESET") {
        const err = new Error("storage_not_available");
        err.code = "storage_not_available";
        err.status = 502;
        err.detail = {
          storagePath: cleanPath,
          bucket: String(bucket?.name || "").trim(),
          message: String(error?.message || error),
        };
        throw err;
      }
    }
  }
  const err = new Error("storage_not_found");
  err.code = "storage_not_found";
  err.status = 404;
  err.detail = {
    storagePath: cleanPath,
    bucketsTried: buckets.map((bucket) => bucket?.name).filter(Boolean),
    lastError: lastError ? String(lastError?.message || lastError) : undefined,
    lastMetaError: lastMetaError ? String(lastMetaError?.message || lastMetaError) : undefined
  };
  throw err;
}

async function downloadUrlToFile(url = "", outPath = "", options = {}) {
  const rawUrl = String(url || "").trim();
  const cleanUrl = convertGsUrlToFirebaseStorageMediaUrl(rawUrl) || rawUrl;
  const targetPath = String(outPath || "").trim();
  const shouldAbort = typeof options?.shouldAbort === "function" ? options.shouldAbort : null;
  const isAborted = () => {
    if (!shouldAbort) return false;
    try {
      return shouldAbort() === true;
    } catch (_) {
      return false;
    }
  };
  if (!cleanUrl || !targetPath) {
    const err = new Error("missing_download_url");
    err.code = "missing_download_url";
    err.detail = { url: cleanUrl, outPath: targetPath };
    throw err;
  }

  const isAbsoluteHttp = cleanUrl.startsWith("http://") || cleanUrl.startsWith("https://");
  if (!isAbsoluteHttp) {
    const localPath = path.resolve(process.cwd(), "public", cleanUrl.replace(/^\//, ""));
    try {
      await fs.promises.access(localPath);
      await fs.promises.copyFile(localPath, targetPath);
      return targetPath;
    } catch (_) {
      const err = new Error("local_file_not_found");
      err.code = "local_file_not_found";
      err.detail = { url: cleanUrl, sourceUrl: rawUrl, resolvedPath: localPath };
      throw err;
    }
  }

  if (!isAllowedRemoteMediaUrl(cleanUrl)) {
    const err = new Error("url_not_allowed");
    err.code = "url_not_allowed";
    err.detail = { url: cleanUrl, sourceUrl: rawUrl };
    throw err;
  }

  let firebaseAdminAttempted = false;
  let firebaseAdminFallback = "";
  if (isAborted()) {
    const err = new Error("montage_export_cancelled");
    err.code = "montage_export_cancelled";
    err.status = 499;
    throw err;
  }

  // Prefer Firebase Admin SDK for Firebase Storage object URLs to avoid
  // depending on public download tokens that may expire/return 403.
  const firebaseObject = parseFirebaseStorageGoogleApisObjectUrl(cleanUrl);
  if (firebaseObject) {
    try {
      firebaseAdminAttempted = true;
      console.info("[backend][download] firebase url -> admin download", {
        bucket: String(firebaseObject.bucket || "").trim(),
        objectPath: String(firebaseObject.objectPath || "").slice(0, 900)
      });
      await downloadStoragePathToFile(firebaseObject.objectPath, targetPath, { shouldAbort });
      console.info("[backend][download] admin download ok", {
        objectPath: String(firebaseObject.objectPath || "").slice(0, 900)
      });
      return targetPath;
    } catch (error) {
      const code = String(error?.code || error?.message || "").trim();
      const status = Number(error?.status || error?.statusCode || (typeof error?.code === "number" ? error.code : 0) || 0) || 0;
      console.warn("[backend][download] admin download failed", {
        code,
        status: status || undefined,
        objectPath: String(firebaseObject.objectPath || "").slice(0, 900)
      });
      // Only allow fallback to HTTP when the object truly doesn't exist in our buckets.
      const allowHttpFallback = code === "storage_not_found" || status === 404;
      if (!allowHttpFallback) throw error;
      firebaseAdminFallback = code || (status ? `status_${status}` : "storage_not_found");
      // Else: fallback to HTTP fetch (may succeed if token is valid, or may be an external bucket).
    }
  }

  if (firebaseAdminAttempted) {
    console.info("[backend][download] falling back to http fetch", {
      reason: firebaseAdminFallback || "storage_not_found",
      url: redactUrlForLogs(cleanUrl)
    });
  }

  const controller = shouldAbort ? new AbortController() : null;
  let abortTimer = null;
  if (controller) {
    abortTimer = setInterval(() => {
      if (!isAborted()) return;
      try { controller.abort(); } catch (_) {}
    }, 250);
    if (typeof abortTimer.unref === "function") abortTimer.unref();
  }
  let upstream = null;
  try {
    upstream = await fetchCompat(cleanUrl, { method: "GET", signal: controller?.signal });
  } catch (error) {
    if (abortTimer) clearInterval(abortTimer);
    if (String(error?.name || "").trim() === "AbortError" || isAborted()) {
      const err = new Error("montage_export_cancelled");
      err.code = "montage_export_cancelled";
      err.status = 499;
      throw err;
    }
    throw error;
  }
  if (abortTimer) clearInterval(abortTimer);
  if (!upstream.ok) {
    let bodySnippet = "";
    try {
      bodySnippet = String(await upstream.text()).trim().slice(0, 240);
    } catch (_) {
      bodySnippet = "";
    }
    const err = new Error(`download_failed_${upstream.status}`);
    err.code = "download_failed";
    // No devolver 403/401 al cliente (se confunde con auth del API).
    err.status = 502;
    err.detail = {
      url: redactUrlForLogs(cleanUrl),
      upstreamStatus: upstream.status,
      upstreamBody: bodySnippet || undefined
    };
    throw err;
  }
  const stream = coerceReadableStream(upstream.body);
  if (!stream) {
    const err = new Error("download_stream_unavailable");
    err.code = "download_stream_unavailable";
    throw err;
  }
  const writeStream = fs.createWriteStream(targetPath);
  if (controller) {
    const pipelineAbortTimer = setInterval(() => {
      if (!isAborted()) return;
      try { stream.destroy(new Error("montage_export_cancelled")); } catch (_) {}
      try { writeStream.destroy(new Error("montage_export_cancelled")); } catch (_) {}
      try { controller.abort(); } catch (_) {}
    }, 250);
    if (typeof pipelineAbortTimer.unref === "function") pipelineAbortTimer.unref();
    try {
      await pipeline(stream, writeStream, { signal: controller.signal });
    } catch (error) {
      clearInterval(pipelineAbortTimer);
      if (String(error?.name || "").trim() === "AbortError" || isAborted()) {
        const err = new Error("montage_export_cancelled");
        err.code = "montage_export_cancelled";
        err.status = 499;
        throw err;
      }
      throw error;
    }
    clearInterval(pipelineAbortTimer);
    return targetPath;
  }
  await pipeline(stream, writeStream);
  return targetPath;
}

async function findLatestSessionDialogueAudioStoragePath({ sessionId = "", uid = "", rowId = "" } = {}) {
  const sessionSlug = normalizeStorageSegment(sessionId, "session");
  const rowSlug = normalizeStorageSegment(rowId, "row");
  const ownerCandidates = Array.from(new Set([
    String(uid || "").trim(),
    String(uid || "").trim().toLowerCase(),
    normalizeStorageSegment(uid, "anon")
  ].map((value) => String(value || "").trim()).filter(Boolean)));
  if (!sessionSlug || !rowSlug || !ownerCandidates.length) return "";

  const buckets = getStorageBucketCandidates();
  let bestMatch = null;
  for (const bucket of buckets) {
    if (!bucket) continue;
    for (const ownerSlug of ownerCandidates) {
      const prefix = `podcaster/sessions/${sessionSlug}/owners/${ownerSlug}/audio/${rowSlug}-`;
      try {
        // eslint-disable-next-line no-await-in-loop
        const [files] = await bucket.getFiles({ prefix, maxResults: 50 });
        for (const file of files) {
          const filePath = String(file?.name || "").trim();
          if (!filePath) continue;
          // eslint-disable-next-line no-await-in-loop
          const [metadata] = await file.getMetadata().catch(() => [{}]);
          const updatedAtMs = Date.parse(String(metadata?.updated || metadata?.timeCreated || "").trim() || "") || 0;
          if (!bestMatch || updatedAtMs > bestMatch.updatedAtMs) {
            bestMatch = { filePath, updatedAtMs };
          }
        }
      } catch (_) {
        // Ignore per-prefix errors and continue with remaining buckets/owners.
      }
    }
  }
  return String(bestMatch?.filePath || "").trim();
}

function normalizeMontageExportRequestBody(body = {}) {
  const raw = body && typeof body === "object" ? body : {};
  const sessionId = clampText(raw?.sessionId || "", 140);
  const exportMode = String(raw?.exportMode || "normal").trim().toLowerCase();
  const requestedFormat = String(raw?.format || "mp4_h264").trim();
  const format = requestedFormat === "webm_vp9" ? "webm_vp9" : "mp4_h264";
  const qualityPreset = String(raw?.qualityPreset || "balanced").trim();
  const resolution = String(raw?.resolution || "source").trim();
  const renderMode = normalizeMontageRenderMode(raw?.renderMode || "browser");
  const reelModeEnabled = raw?.reelModeEnabled === true || isMontageReelResolution(resolution);
  const includeBackgroundMusic = raw?.includeBackgroundMusic === true;
  const partyKaraoke = raw?.partyKaraoke !== false;
  const filename = clampText(raw?.filename || "montage", 160) || "montage";
  const previewRowId = clampText(raw?.previewRowId || "", 140);
  const entriesRaw = Array.isArray(raw?.entries) ? raw.entries : [];
  const entries = entriesRaw
    .slice(0, MAX_MONTAGE_EXPORT_SCENES)
    .map((item) => (item && typeof item === "object" ? {
      ...item,
      mediaScale: normalizeMontageMediaScale(item?.mediaScale || item?.clip?.mediaScale || 1),
      mediaOffsetXPct: normalizeMontageMediaOffset(item?.mediaOffsetXPct || item?.clip?.mediaOffsetXPct || 0),
      mediaOffsetYPct: normalizeMontageMediaOffset(item?.mediaOffsetYPct || item?.clip?.mediaOffsetYPct || 0),
      mediaMotionPreset: normalizeMontageMediaMotionPreset(item?.mediaMotionPreset || item?.clip?.mediaMotionPreset || "none"),
      visualEffects: normalizeMontageVisualEffects(item?.visualEffects || null),
      transitionOut: normalizeMontageTransition(item?.transitionOut || null)
    } : null))
    .filter(Boolean);
  const audioTimelineRaw = raw?.audioTimeline && typeof raw.audioTimeline === "object" ? raw.audioTimeline : null;
  const onScreenTextTimelineRaw = raw?.onScreenTextTimeline && typeof raw.onScreenTextTimeline === "object"
    ? raw.onScreenTextTimeline
    : null;
  const overlayCards = normalizeMontageOverlayCards(raw?.overlayCards || null);
  const brandOverlayRaw = raw?.brandOverlay && typeof raw.brandOverlay === "object"
    ? raw.brandOverlay
    : null;
  const dialogueAudioMapRaw = raw?.dialogueAudioMap && typeof raw.dialogueAudioMap === "object"
    ? raw.dialogueAudioMap
    : {};
  const geminiSegmentsRaw = Array.isArray(audioTimelineRaw?.geminiSegments) ? audioTimelineRaw.geminiSegments : [];
  const backgroundSegmentsRaw = Array.isArray(audioTimelineRaw?.backgroundSegments) ? audioTimelineRaw.backgroundSegments : [];
  const repoRoot = path.resolve(__dirname, "..");

  const normalizeExportDialogueAudioMap = (sourceMap = {}) => {
    const nextMap = {};
    Object.entries(sourceMap).slice(0, 800).forEach(([rowId, clip]) => {
      const key = clampText(rowId, 120);
      if (!key || !clip || typeof clip !== "object") return;
      const targetSpeechLine = clampText(clip?.targetSpeechLine || "", 2200);
      const durationSec = clampNumber(clip?.durationSec, 0, 180, 0);
      const durationMs = Math.max(0, Math.round(Number(clip?.durationMs || (durationSec ? durationSec * 1000 : 0)) || 0));
      const alignmentWords = Array.isArray(clip?.alignment?.words) ? clip.alignment.words.slice(0, 1200) : [];
      const alignment = Array.isArray(clip?.alignment)
        ? clip.alignment.slice(0, 1200)
        : (alignmentWords.length ? { words: alignmentWords } : []);
      const words = Array.isArray(clip?.words) ? clip.words.slice(0, 1200) : alignmentWords;
      const wordTimingSource = Array.isArray(clip?.wordTimings)
        ? clip.wordTimings
        : (alignment.length ? alignment : (alignmentWords.length ? alignmentWords : words));
      const wordTimings = normalizeDialogueAudioWordTimings(
        wordTimingSource,
        targetSpeechLine,
        durationSec || (durationMs > 0 ? durationMs / 1000 : 0)
      );
      const downloadUrl = clampText(clip?.downloadUrl || clip?.url || "", 3000);
      const storagePath = clampText(clip?.storagePath || "", 900);
      if (!downloadUrl && !storagePath && !wordTimings.length && !durationSec && !durationMs) return;
      nextMap[key] = {
        rowId: key,
        targetSpeechLine,
        durationSec,
        durationMs,
        playbackRate: Math.max(0.5, Math.min(10, Number(clip?.playbackRate || 1) || 1)),
        wordTimings,
        alignment,
        words,
        downloadUrl,
        storagePath,
        mimeType: clampText(clip?.mimeType || "audio/wav", 120) || "audio/wav"
      };
    });
    return nextMap;
  };

  const normalizeTimelineAudioSegment = (segment = {}, idx = 0) => {
    if (!segment || typeof segment !== "object") return null;
    const url = String(segment?.url || segment?.downloadUrl || segment?.localDataUrl || segment?.dataUrl || "").trim();
    const storagePath = clampText(segment?.storagePath || "", 900);
    const startMs = Math.max(0, Math.round(Number(segment?.startMs || 0) || 0));
    const durationMs = Math.max(500, Math.round(Number(segment?.durationMs || 0) || 0));
    const trimInMs = Math.max(0, Math.round(Number(segment?.trimInMs || 0) || 0));
    const trimOutMs = Math.max(trimInMs + 500, Math.round(Number(segment?.trimOutMs || 0) || (trimInMs + durationMs)));
    const fadeInMs = Math.max(0, Math.min(durationMs, Math.round(Number(segment?.fadeInMs || 0) || 0)));
    const fadeOutMs = Math.max(0, Math.min(durationMs, Math.round(Number(segment?.fadeOutMs || 0) || 0)));
    const rawVolumePct = Number(segment?.volumePct ?? 100);
    const legacyScaledPct = Number.isFinite(rawVolumePct) && rawVolumePct > 0 && rawVolumePct <= 1 ? rawVolumePct * 100 : rawVolumePct;
    const volumePct = Math.max(0, Math.min(200, legacyScaledPct));
    const rawDuckPct = Number(segment?.duckingWhenGeminiPct ?? segment?.duckingPct);
    const duckingWhenGeminiPct = Number.isFinite(rawDuckPct)
      ? Math.max(40, Math.min(100, rawDuckPct))
      : null;
    if (!storagePath && !url) return null;
    if (volumePct <= 0.0001) return null;
    return {
      kind: clampText(segment?.kind || "audio", 40) || "audio",
      id: clampText(segment?.id || `${idx + 1}`, 140) || `${idx + 1}`,
      rowId: clampText(segment?.rowId || "", 140),
      trackIndex: Math.max(0, Math.floor(Number(segment?.trackIndex || 0) || 0)),
      loopIndex: Math.max(0, Math.floor(Number(segment?.loopIndex || 0) || 0)),
      url,
      storagePath,
      mimeType: clampText(segment?.mimeType || "audio/mpeg", 120) || "audio/mpeg",
      startMs,
      durationMs,
      trimInMs,
      trimOutMs,
      fadeInMs,
      fadeOutMs,
      duckingWhenGeminiPct,
      volumePct
    };
  };

  const normalizeOnScreenTextSegment = (segment = {}, idx = 0) => {
    if (!segment || typeof segment !== "object") return null;
    const text = clampText(segment?.text || "", 500);
    if (!text) return null;
    const startMs = Math.max(0, Math.round(Number(segment?.startMs || 0) || 0));
    const durationMs = Math.max(500, Math.round(Number(segment?.durationMs || 0) || 0));
    return {
      id: clampText(segment?.id || `text-${idx + 1}`, 140) || `text-${idx + 1}`,
      rowId: clampText(segment?.rowId || "", 140),
      sceneIndex: Math.max(1, Math.round(Number(segment?.sceneIndex || idx + 1) || idx + 1)),
      text,
      startMs,
      durationMs,
      zIndex: Math.max(1, Math.round(Number(segment?.zIndex || idx + 1) || idx + 1)),
      layout: {
        yPct: clampNumber(segment?.layout?.yPct, 0, 1, 0.92),
        widthPct: clampNumber(segment?.layout?.widthPct, 0.05, 1, 0.85),
        heightPct: clampNumber(segment?.layout?.heightPct, 0.05, 1, 0.14),
        xPct: clampNumber(segment?.layout?.xPct, 0, 1, 0)
      },
      renderedFrames: Array.isArray(segment?.renderedFrames)
        ? segment.renderedFrames.slice(0, 200).map((frame, frameIdx) => {
          if (!frame || typeof frame !== "object") return null;
          const dataUrl = clampText(frame?.dataUrl || "", 8_000_000);
          if (!dataUrl.startsWith("data:image/")) return null;
          return {
            kind: clampText(frame?.kind || "base", 40) || "base",
            text: clampText(frame?.text || "", 500),
            wordIndex: Number.isFinite(Number(frame?.wordIndex)) ? Math.max(-1, Math.round(Number(frame.wordIndex))) : -1,
            startMs: Math.max(0, Math.round(Number(frame?.startMs || 0) || 0)),
            endMs: Math.max(0, Math.round(Number(frame?.endMs || 0) || 0)),
            dataUrl,
            padPx: Math.max(0, Math.round(Number(frame?.padPx || 0) || 0)),
            widthPx: Math.max(1, Math.round(Number(frame?.widthPx || 0) || 1)),
            heightPx: Math.max(1, Math.round(Number(frame?.heightPx || 0) || 1)),
            offsetXPx: Math.max(0, Math.round(Number(frame?.offsetXPx || 0) || 0)),
            offsetYPx: Math.max(0, Math.round(Number(frame?.offsetYPx || 0) || 0))
          };
        }).filter(Boolean)
        : []
    };
  };

  const isTimelineBackgroundAudioKind = (kind = "") => {
    const key = String(kind || "").trim().toLowerCase();
    return key === "uploaded" || key === "background-track" || key === "background" || key === "music";
  };
  const timelineAudioSegments = [...geminiSegmentsRaw, ...backgroundSegmentsRaw]
    .slice(0, 600)
    .map((segment, idx) => normalizeTimelineAudioSegment(segment, idx))
    .filter(Boolean);
  const dialogueAudioMap = normalizeExportDialogueAudioMap(dialogueAudioMapRaw);
  const normalizedGeminiTimelineSegments = timelineAudioSegments.filter((segment) => !isTimelineBackgroundAudioKind(segment?.kind));
  const useTimelineAudio = timelineAudioSegments.length > 0 && audioTimelineRaw?.enabled !== false;
  let onScreenTextSegments = Array.isArray(onScreenTextTimelineRaw?.segments)
    ? onScreenTextTimelineRaw.segments.slice(0, 400).map((segment, idx) => normalizeOnScreenTextSegment(segment, idx)).filter(Boolean)
    : [];
  if (!onScreenTextSegments.length) {
    onScreenTextSegments = entries
      .map((entry, idx) => {
        const text = clampText(entry?.onScreenText || "", 500);
        if (!text) return null;
        const geminiSeg = normalizedGeminiTimelineSegments.find((s) => s.rowId === entry.rowId);
        const startMs = geminiSeg
          ? geminiSeg.startMs
          : Math.max(0, Math.round(Number(entry?.timelineStartMs || 0) || 0));
        const durationMs = geminiSeg
          ? geminiSeg.durationMs
          : Math.max(500, Math.round(Number(entry?.durationMs || 0) || 0));
        return {
          id: clampText(`${entry?.rowId || idx + 1}-entry-text`, 140),
          rowId: clampText(entry?.rowId || "", 140),
          sceneIndex: Math.max(1, Math.round(Number(entry?.sceneIndex || idx + 1) || idx + 1)),
          text,
          startMs,
          durationMs,
          zIndex: idx + 1,
          layout: {
            yPct: 0.72,
            widthPct: 0.58,
            heightPct: 0.14,
            xPct: 0.21
          }
        };
      })
      .filter(Boolean);
  }
  const onScreenTextSettings = onScreenTextTimelineRaw?.settings && typeof onScreenTextTimelineRaw.settings === "object"
    ? onScreenTextTimelineRaw.settings
    : (onScreenTextSegments.length ? { enabled: true, showTrack: true, fontSizePx: 44 } : null);
  const onScreenTextRenderedSegmentsRaw = Array.isArray(raw?.onScreenTextRenderedSegments)
    ? raw.onScreenTextRenderedSegments
    : (Array.isArray(onScreenTextTimelineRaw?.renderedSegments) ? onScreenTextTimelineRaw.renderedSegments : []);
  const onScreenTextRenderedSegments = onScreenTextRenderedSegmentsRaw
    .slice(0, 400)
    .map((segment, idx) => {
      const parsed = normalizeOnScreenTextSegment(segment, idx);
      return parsed && Array.isArray(parsed.renderedFrames) ? parsed : null;
    }).filter(Boolean);
  const brandOverlay = brandOverlayRaw ? (() => {
    const assetPathRaw = clampText(brandOverlayRaw?.assetPath || "", 320);
    const cleanRelativeAssetPath = assetPathRaw.replace(/^[/\\]+/g, "");
    const resolvedAssetPath = cleanRelativeAssetPath
      ? path.resolve(repoRoot, cleanRelativeAssetPath)
      : "";
    const isSafeResolvedPath = resolvedAssetPath
      && (resolvedAssetPath === repoRoot || resolvedAssetPath.startsWith(`${repoRoot}${path.sep}`));
    const position = ["top-right", "top-left", "bottom-right", "bottom-left"].includes(String(brandOverlayRaw?.position || "").trim())
      ? String(brandOverlayRaw.position).trim()
      : "top-right";
    const defaultBrandWidthPct = reelModeEnabled ? 0.09 : 0.05;
    const defaultBrandMarginPct = reelModeEnabled ? 0.03 : 0.025;
    return {
      enabled: brandOverlayRaw?.enabled !== false,
      assetPath: isSafeResolvedPath ? resolvedAssetPath : "",
      assetUrl: clampText(brandOverlayRaw?.assetUrl || "", 900),
      position,
      marginPct: clampNumber(brandOverlayRaw?.marginPct, 0, 0.2, defaultBrandMarginPct),
      widthPct: clampNumber(brandOverlayRaw?.widthPct, 0.04, 0.4, defaultBrandWidthPct),
      opacity: clampNumber(brandOverlayRaw?.opacity, 0, 1, 1)
    };
  })() : null;

  return {
    sessionId,
    renderMode,
    exportMode,
    format,
    qualityPreset,
    resolution,
    reelModeEnabled,
    includeBackgroundMusic,
    filename,
    previewRowId,
    entriesRaw,
    entries,
    audioTimelineRaw,
    onScreenTextTimelineRaw,
    timelineAudioSegments,
    normalizedGeminiTimelineSegments,
    useTimelineAudio,
    onScreenTextSegments,
    onScreenTextRenderedSegments,
    onScreenTextSettings: onScreenTextSettings || (onScreenTextSegments.length ? { enabled: true, showTrack: true, fontSizePx: 44 } : null),
    dialogueAudioMap,
    overlayCards,
    brandOverlay,
    backgroundMusic: raw?.backgroundMusic && typeof raw.backgroundMusic === "object" ? raw.backgroundMusic : null,
    backgroundMusicDuckingPct: (() => {
      const rawValue = Number(raw?.backgroundMusicDuckingPct ?? raw?.backgroundMusic?.duckingWhenGeminiPct);
      if (!Number.isFinite(rawValue)) return 60;
      if (rawValue >= 40 && rawValue <= 100) return rawValue;
      if (rawValue >= 0 && rawValue < 40) return Math.max(40, 100 - rawValue);
      return 60;
    })(),
    bitrateSettings: raw?.bitrateSettings && typeof raw.bitrateSettings === "object" ? raw.bitrateSettings : null,
    partyKaraoke
  };
}

function validateMontageExportRequest(input = {}) {
  if (!String(input?.sessionId || "").trim()) {
    const err = new Error("Falta sessionId.");
    err.status = 400;
    throw err;
  }
  if (!Array.isArray(input?.entries) || !input.entries.length) {
    const err = new Error("No hay entradas para exportar.");
    err.status = 400;
    throw err;
  }
  if (Number(input?.entriesRaw?.length || 0) > MAX_MONTAGE_EXPORT_SCENES) {
    const err = new Error(`Demasiadas escenas para exportar (máx ${MAX_MONTAGE_EXPORT_SCENES}).`);
    err.status = 413;
    throw err;
  }
  if (!new Set(["normal", "review"]).has(String(input?.exportMode || "").trim())) {
    const err = new Error("Modo de exportación inválido.");
    err.status = 400;
    throw err;
  }
  if (!new Set(["mp4_h264", "webm_vp9"]).has(String(input?.format || "").trim())) {
    const err = new Error("Formato inválido.");
    err.status = 400;
    throw err;
  }
  if (!new Set(["source", "1080p", "720p", "480p", "1080x1920", "720x1280", "480x854"]).has(String(input?.resolution || "").trim())) {
    const err = new Error("Resolución inválida.");
    err.status = 400;
    throw err;
  }
  if (!new Set(["browser", "ffmpeg-legacy"]).has(normalizeMontageRenderMode(input?.renderMode || "browser"))) {
    const err = new Error("Render mode inválido.");
    err.status = 400;
    throw err;
  }
  const totalDurationSec = (Array.isArray(input?.entries) ? input.entries : []).reduce((acc, entry) => acc + Math.max(0, Number(entry?.durationMs || 0) / 1000), 0);
  if (totalDurationSec > MAX_MONTAGE_EXPORT_TOTAL_SEC) {
    const err = new Error(`Montaje demasiado largo para exportar (máx ${MAX_MONTAGE_EXPORT_TOTAL_SEC} s).`);
    err.status = 413;
    throw err;
  }
}

function buildMontageSkippedEntry(entry = {}, index = 0, reason = "scene_asset_unavailable", detail = {}) {
  return {
    sceneIndex: Math.max(1, Number(entry?.sceneIndex || index + 1) || index + 1),
    rowId: clampText(entry?.rowId || "", 140),
    speaker: clampText(entry?.speaker || "", 120),
    sceneLabel: clampText(entry?.sceneLabel || "", 180),
    kind: clampText(detail?.kind || "video", 40) || "video",
    reason: clampText(reason || "scene_asset_unavailable", 120) || "scene_asset_unavailable",
    storagePath: clampText(detail?.storagePath || "", 900),
    url: detail?.url ? redactUrlForLogs(detail.url) : "",
    code: clampText(detail?.code || "", 80),
    index: Math.max(0, Number(detail?.index || index) || index),
    lastError: clampText(detail?.lastError || detail?.message || "", 280)
  };
}

function shouldSkipMontageEntryError(error) {
  const code = String(error?.code || error?.message || "").trim();
  return code === "storage_not_found" || code === "missing_download_source";
}

function createMontageAssetDownloader({ tmpDir = "", uid = "", sessionId = "", shouldAbort = null } = {}) {
  const isAborted = () => {
    if (typeof shouldAbort !== "function") return false;
    try {
      return shouldAbort() === true;
    } catch (_) {
      return false;
    }
  };
  const createAbortError = (stage = "download") => {
    const err = new Error("montage_export_cancelled");
    err.code = "montage_export_cancelled";
    err.status = 499;
    err.stage = String(stage || "download").trim() || "download";
    return err;
  };
  const resolveProxyMediaSource = (assetUrl = "") => {
    const initialUrl = String(assetUrl || "").trim();
    if (!initialUrl) return { url: "", storagePath: "" };
    let currentUrl = initialUrl;
    let resolvedStoragePath = "";
    for (let i = 0; i < 3; i += 1) {
      let parsed = null;
      try {
        parsed = new URL(currentUrl, "http://127.0.0.1");
      } catch (_) {
        break;
      }
      const pathname = String(parsed.pathname || "").toLowerCase();
      const isProxyMedia = pathname.includes("/api/assets/proxy-media") || pathname.includes("/api/assets/proxy-image");
      if (!isProxyMedia) break;
      const proxyStoragePath = clampText(parsed.searchParams.get("storagePath") || "", 900);
      if (proxyStoragePath) {
        resolvedStoragePath = proxyStoragePath;
        break;
      }
      const nestedUrl = String(parsed.searchParams.get("url") || "").trim();
      if (!nestedUrl) break;
      currentUrl = nestedUrl;
    }
    return {
      url: currentUrl === initialUrl ? "" : currentUrl,
      storagePath: resolvedStoragePath
    };
  };
  return async (asset = {}, kind = "video", index = 0) => {
    if (isAborted()) throw createAbortError("download_start");
    const storagePath = clampText(asset?.storagePath || "", 900);
    const rawUrl = String(asset?.downloadUrl || asset?.url || "").trim();
    const proxySource = resolveProxyMediaSource(rawUrl);
    const urlCandidate = String(proxySource.storagePath && !proxySource.url ? "" : (proxySource.url || rawUrl)).trim();
    const inlineUrlData = urlCandidate.startsWith("data:") ? urlCandidate : "";
    const url = inlineUrlData ? "" : urlCandidate;
    const resolvedStoragePath = clampText(storagePath || proxySource.storagePath || "", 900);
    const dataUrl = String(asset?.dataUrl || asset?.localDataUrl || inlineUrlData || "").trim();
    const assetTrace = {
      kind: String(kind || "video").trim() || "video",
      index: Math.max(0, Number(index || 0) || 0),
      rowId: clampText(asset?.rowId || "", 140),
      storagePath: resolvedStoragePath,
      url: url ? redactUrlForLogs(url) : "",
      hasDataUrl: Boolean(dataUrl),
      tmpDir: clampText(tmpDir || "", 220),
      uid: clampText(uid || "", 160)
    };
    console.info("[backend][montage-export][asset-download-start]", assetTrace);
    if (!resolvedStoragePath && !url && !dataUrl) {
      const err = new Error("missing_download_source");
      err.code = "missing_download_source";
      err.status = 404;
      err.detail = { kind, index, storagePath: "", url: "", dataUrl: "" };
      throw err;
    }
    const normalizedKind = kind === "audio" ? "audio" : (kind === "image" ? "image" : "video");
    const isImageKind = normalizedKind === "image";
    const isAudioKind = normalizedKind === "audio";
    const ext = isAudioKind
      ? (getAudioExtension(String(asset?.mimeType || "audio/mpeg")) || "audio")
      : isImageKind
        ? (getImageExtension(String(asset?.mimeType || "image/png")) || "png")
        : (getVideoExtension(String(asset?.mimeType || "video/mp4")) || "mp4");
    const outPath = path.join(tmpDir, `in-${normalizedKind}-${String(index + 1).padStart(3, "0")}.${ext}`);
    const validateDownloadedAsset = async (targetPath = "") => {
      if (isAborted()) throw createAbortError("download_validate");
      const stat = await fs.promises.stat(targetPath).catch(() => null);
      if (!stat || !stat.isFile() || Number(stat.size || 0) <= 0) {
        const err = new Error("downloaded_asset_invalid");
        err.code = "downloaded_asset_invalid";
        err.status = 502;
        err.detail = {
          kind,
          index,
          outPath: targetPath,
          sizeBytes: Number(stat?.size || 0) || 0
        };
        throw err;
      }
      return targetPath;
    };
    const isDirectHttpUrl = (value = "") => /^https?:\/\//i.test(String(value || "").trim());
    const downloadWithTimeout = async (task, label = "download") => withTimeout(
      task,
      MONTAGE_EXPORT_SCENE_DOWNLOAD_TIMEOUT_MS,
      (timeoutMs) => {
        const err = new Error(`${label}_timeout`);
        err.code = "scene_download_timeout";
        err.status = 504;
        err.timeoutMs = timeoutMs;
        err.detail = {
          kind,
          index,
          storagePath,
          url: url ? redactUrlForLogs(url) : "",
          dataUrl: dataUrl ? `data:${String(dataUrl.match(/^data:([^;,]+)/i)?.[1] || "").trim()}` : "",
          label
        };
        return err;
      }
    );
    const logDownloadFinish = (stage = "", detail = {}) => {
      console.info("[backend][montage-export][asset-download-finish]", {
        ...assetTrace,
        stage,
        ...detail
      });
    };
    if (isAborted()) throw createAbortError("download_preflight");
    const resolveAlternateOwnerStoragePaths = (pathInput = "", uidRaw = "") => {
      const clean = normalizeStorageFilePath(pathInput);
      const uidClean = String(uidRaw || "").trim();
      if (!clean || !uidClean) return [];
      const marker = "/owners/";
      const i = clean.indexOf(marker);
      if (i < 0) return [];
      const prefix = clean.slice(0, i + marker.length);
      const rest = clean.slice(i + marker.length);
      const slash = rest.indexOf("/");
      if (slash < 0) return [];
      const currentOwner = rest.slice(0, slash);
      const suffix = rest.slice(slash);
      const candidates = [uidClean, uidClean.toLowerCase(), normalizeStorageSegment(uidClean, "anon")]
        .map((owner) => String(owner || "").trim())
        .filter(Boolean);
      const nextOwners = Array.from(new Set(candidates)).filter((owner) => owner && owner !== currentOwner);
      return nextOwners.map((owner) => `${prefix}${owner}${suffix}`);
    };

    if (dataUrl && dataUrl.startsWith("data:")) {
      try {
        console.info("[backend][montage-export][asset-download-branch]", {
          ...assetTrace,
          branch: "inline_data"
        });
        await downloadWithTimeout(() => writeDataUrlToFile(dataUrl, outPath), "inline_data");
        const validated = await validateDownloadedAsset(outPath);
        logDownloadFinish("inline_data", { outPath: validated });
        return validated;
      } catch (inlineError) {
        const inlineCode = String(inlineError?.code || inlineError?.message || "").trim();
        if (!storagePath && !url) {
          inlineError.detail = {
            ...(inlineError?.detail && typeof inlineError.detail === "object" ? inlineError.detail : {}),
            kind,
            index,
            storagePath,
            url: "",
            dataUrl: dataUrl ? `data:${String(dataUrl.match(/^data:([^;,]+)/i)?.[1] || "").trim()}` : ""
          };
          throw inlineError;
        }
        if (inlineCode !== "inline_data_too_large" && inlineCode !== "invalid_data_url") {
          inlineError.detail = {
            ...(inlineError?.detail && typeof inlineError.detail === "object" ? inlineError.detail : {}),
            kind,
            index,
            storagePath,
            url: url ? redactUrlForLogs(url) : "",
            dataUrl: dataUrl ? `data:${String(dataUrl.match(/^data:([^;,]+)/i)?.[1] || "").trim()}` : ""
          };
          throw inlineError;
        }
      }
    }

    if (url && isDirectHttpUrl(url)) {
      try {
        console.info("[backend][montage-export][asset-download-branch]", {
          ...assetTrace,
          branch: "direct_url"
        });
        await downloadWithTimeout(() => downloadUrlToFile(url, outPath, { shouldAbort: isAborted }), "url_download");
        const validated = await validateDownloadedAsset(outPath);
        logDownloadFinish("direct_url", { outPath: validated });
        return validated;
      } catch (directUrlError) {
        const directCode = String(directUrlError?.code || directUrlError?.message || "").trim();
        if (storagePath || directCode !== "missing_download_url") {
          // Continue with storagePath fallback below.
        }
      }
    }

    if (resolvedStoragePath) {
      try {
        console.info("[backend][montage-export][asset-download-branch]", {
          ...assetTrace,
          branch: "storage_path"
        });
        await downloadWithTimeout(() => downloadStoragePathToFile(resolvedStoragePath, outPath, { shouldAbort: isAborted }), "storage_download");
        const validated = await validateDownloadedAsset(outPath);
        logDownloadFinish("storage_path", { outPath: validated });
        return validated;
      } catch (error) {
        const code = String(error?.code || error?.message || "").trim();
        if (code === "storage_not_found") {
          const altPaths = resolveAlternateOwnerStoragePaths(resolvedStoragePath, uid);
          for (const altPath of altPaths) {
            try {
              console.info("[backend][montage-export][asset-download-branch]", {
                ...assetTrace,
                branch: "alternate_storage_path",
                altPath
              });
              // eslint-disable-next-line no-await-in-loop
                await downloadWithTimeout(() => downloadStoragePathToFile(altPath, outPath, { shouldAbort: isAborted }), "storage_download");
              // eslint-disable-next-line no-await-in-loop
              const validated = await validateDownloadedAsset(outPath);
              logDownloadFinish("alternate_storage_path", { altPath, outPath: validated });
              return validated;
            } catch (altError) {
              const altCode = String(altError?.code || altError?.message || "").trim();
              if (altCode !== "storage_not_found") {
                altError.detail = {
                  ...(altError?.detail && typeof altError.detail === "object" ? altError.detail : {}),
                  kind,
                  index,
                  storagePath: altPath,
                  url: url ? redactUrlForLogs(url) : ""
                };
                throw altError;
              }
            }
          }
          const recoveredStoragePath = String(
            kind === "timeline-audio"
              ? await findLatestSessionDialogueAudioStoragePath({
                sessionId,
                uid,
                rowId: String(asset?.rowId || "").trim()
              })
              : ""
          ).trim();
          if (recoveredStoragePath) {
            try {
              console.info("[backend][montage-export][asset-download-branch]", {
                ...assetTrace,
                branch: "session_audio_recovery",
                recoveredStoragePath
              });
              await downloadWithTimeout(() => downloadStoragePathToFile(recoveredStoragePath, outPath, { shouldAbort: isAborted }), "storage_download");
              const validated = await validateDownloadedAsset(outPath);
              logDownloadFinish("session_audio_recovery", { recoveredStoragePath, outPath: validated });
              return validated;
            } catch (recoveredError) {
              if (String(recoveredError?.code || recoveredError?.message || "").trim() !== "storage_not_found") {
                throw recoveredError;
              }
            }
          }
          if (url && !parseFirebaseStorageGoogleApisObjectUrl(url) && !isDirectHttpUrl(url)) {
            const fallbackUrl = convertGsUrlToFirebaseStorageMediaUrl(url) || url;
            console.info("[backend][montage-export][asset-download-branch]", {
              ...assetTrace,
              branch: "storage_path_url_fallback",
              fallbackUrl: redactUrlForLogs(fallbackUrl)
            });
            await downloadWithTimeout(() => downloadUrlToFile(fallbackUrl, outPath, { shouldAbort: isAborted }), "url_download");
            const validated = await validateDownloadedAsset(outPath);
            logDownloadFinish("storage_path_url_fallback", { outPath: validated });
            return validated;
          }
        }
        error.detail = {
          ...(error?.detail && typeof error.detail === "object" ? error.detail : {}),
          kind,
          index,
          storagePath: resolvedStoragePath,
          url: url ? redactUrlForLogs(url) : ""
        };
        console.warn("[backend][montage-export][asset-download-error]", {
          ...assetTrace,
          branch: "storage_path",
          code: String(error?.code || error?.message || "").trim(),
          message: String(error?.message || error)
        });
        throw error;
      }
    }
    console.info("[backend][montage-export][asset-download-branch]", {
      ...assetTrace,
      branch: "fallback_direct_url"
    });
    await downloadWithTimeout(() => downloadUrlToFile(url, outPath, { shouldAbort: isAborted }), "url_download");
    const validated = await validateDownloadedAsset(outPath);
    logDownloadFinish("fallback_direct_url", { outPath: validated });
    return validated;
  };
}

function createMontageStageReporter(onStage = null) {
  return (stage = "validate_payload", progress = 0, hint = "", extra = {}) => {
    if (typeof onStage === "function") {
      onStage({
        stage: String(stage || "validate_payload").trim() || "validate_payload",
        progress: Math.max(0, Math.min(1, Number(progress || 0) || 0)),
        hint: String(hint || "").trim(),
        ...extra
      });
    }
  };
}

function buildMontageSceneFailure(error = null, fallback = {}) {
  const detail = error?.detail && typeof error.detail === "object" ? error.detail : {};
  return {
    error: String(error?.code || error?.message || fallback?.error || "montage_scene_failed").trim(),
    code: String(error?.code || fallback?.code || "").trim(),
    status: Number(error?.status || fallback?.status || 500) || 500,
    detail: {
      ...detail,
      stage: String(detail?.stage || error?.stage || fallback?.stage || "").trim() || undefined,
      failedSceneIndex: Number(fallback?.failedSceneIndex || detail?.failedSceneIndex || 0) || undefined,
      failedRowId: String(fallback?.failedRowId || detail?.failedRowId || "").trim() || undefined,
      failedSubstage: String(fallback?.failedSubstage || detail?.failedSubstage || "").trim() || undefined,
      stderrPreview: buildMontageStderrPreview(error?.stderr || detail?.stderrPreview || "", 12, 2200) || undefined,
      stdoutPreview: buildMontageStderrPreview(error?.stdout || detail?.stdoutPreview || "", 8, 1200) || undefined
    }
  };
}

function createMontageReviewTextFileResolver(tmpDir = "", prefix = "review") {
  const baseDir = String(tmpDir || "").trim();
  let counter = 0;
  return (text = "") => {
    if (!baseDir) return "";
    counter += 1;
    const filePath = path.join(baseDir, `${prefix}-text-${String(counter).padStart(3, "0")}.txt`);
    fs.writeFileSync(filePath, String(text || ""), "utf8");
    return filePath;
  };
}

function normalizeMontageOnScreenTextExportLayout(options = {}) {
  const segment = options?.segment && typeof options.segment === "object" ? options.segment : {};
  const layout = segment?.layout && typeof segment.layout === "object" ? segment.layout : {};
  const settings = options?.settings && typeof options.settings === "object" ? options.settings : {};
  const resolution = String(options?.resolution || "source").trim() || "source";
  const sourceDims = options?.sourceDims && typeof options.sourceDims === "object" ? options.sourceDims : {};
  const sourceWidth = Math.max(160, Math.round(Number(sourceDims.width || 1280) || 1280));
  const sourceHeight = Math.max(90, Math.round(Number(sourceDims.height || 720) || 720));
  const widthPct = clampNumber(layout?.widthPct, 0.08, 0.96, 0.58);
  const heightPct = clampNumber(layout?.heightPct, 0.05, 0.68, 0.14);
  const baseLayout = {
    xPct: clampNumber(layout?.xPct, 0, Math.max(0, 1 - widthPct), 0.21),
    yPct: clampNumber(layout?.yPct, 0, 0.99, 0.72),
    widthPct,
    heightPct
  };
  const spec = resolveOnScreenTextRenderSpec({
    settings,
    layout: baseLayout,
    resolution,
    sourceWidth,
    sourceHeight,
    text: segment.text || "",
    fallback: ""
  });
  const autoHeightPct = Math.max(
    heightPct,
    Math.min(0.68, Number(spec.boxHeightPx || 0) / Math.max(1, Number(spec.exportCanvasHeight || sourceHeight)))
  );
  return {
    ...baseLayout,
    heightPct: autoHeightPct,
    yPct: Math.max(0, Math.min(1 - autoHeightPct, baseLayout.yPct))
  };
}

function buildMontageOnScreenTextSegmentLookupKey(segment = {}) {
  const id = clampText(segment?.id || "", 140);
  if (id) return `id:${id}`;
  const rowId = clampText(segment?.rowId || "", 140);
  const sceneIndex = Math.max(1, Math.round(Number(segment?.sceneIndex || 1) || 1));
  const startMs = Math.max(0, Math.round(Number(segment?.startMs || 0) || 0));
  if (rowId) return `row:${rowId}:scene:${sceneIndex}:start:${startMs}`;
  const text = clampText(segment?.text || "", 180);
  return `scene:${sceneIndex}:start:${startMs}:text:${text}`;
}

function buildMontageOnScreenTextRenderedSegmentMap(renderedSegments = []) {
  const map = new Map();
  (Array.isArray(renderedSegments) ? renderedSegments : []).forEach((segment) => {
    if (!segment || typeof segment !== "object") return;
    map.set(buildMontageOnScreenTextSegmentLookupKey(segment), segment);
  });
  return map;
}

function shouldUseMontageSceneAssSubtitles(input = {}) {
  if (String(input?.exportMode || "").trim() === "review") return false;
  return Boolean(input?.onScreenTextSettings && Array.isArray(input?.onScreenTextSegments) && input.onScreenTextSegments.length);
}

function doesMontageOnScreenTextSegmentBelongToScene(segment = {}, entry = {}, sceneIndex = 1, sceneStartMs = 0, sceneEndMs = 0) {
  const segmentRowId = String(segment?.rowId || "").trim();
  const entryRowId = String(entry?.rowId || "").trim();
  if (segmentRowId && entryRowId && segmentRowId === entryRowId) return true;
  const normalizedSceneIndex = Math.max(1, Math.round(Number(sceneIndex || 1) || 1));
  const segmentSceneIndex = Math.max(1, Math.round(Number(segment?.sceneIndex || normalizedSceneIndex) || normalizedSceneIndex));
  if (segmentSceneIndex === normalizedSceneIndex) return true;
  const startMs = Math.max(0, Math.round(Number(segment?.startMs || 0) || 0));
  const endMs = Math.max(startMs + 1, Math.round(startMs + Number(segment?.durationMs || 0) || 0));
  return endMs > sceneStartMs && startMs < sceneEndMs;
}

function resolveMontageSceneOnScreenTextSegments({
  input = {},
  entry = {},
  sceneIndex = 1,
  sceneStartMs = 0,
  sceneEndMs = 0
} = {}) {
  const segments = Array.isArray(input.onScreenTextSegments) ? input.onScreenTextSegments : [];
  return segments
    .filter((segment) => doesMontageOnScreenTextSegmentBelongToScene(segment, entry, sceneIndex, sceneStartMs, sceneEndMs))
    .map((segment) => ({ ...segment }))
    .sort((a, b) => Number(a?.startMs || 0) - Number(b?.startMs || 0) || Number(a?.zIndex || 0) - Number(b?.zIndex || 0));
}

async function storeMontageExportResult(finalOutPath = "", input = {}, context = {}) {
  const exportId = clampExportId(context?.jobId || randomUUID());
  const token = randomUUID();
  const outExt = getMontageExportExtension(input?.format || "mp4_h264");
  const createdAtIso = new Date().toISOString();
  const expiresAtIso = new Date(Date.now() + MONTAGE_EXPORT_CACHE_TTL_MS).toISOString();
  const filename = `${String(input?.filename || "montage").trim() || "montage"}.${outExt}`;
  const mimeType = getMontageExportMimeType(input?.format || "mp4_h264");
  const storagePath = [
    "podcaster",
    "exports",
    normalizeStorageSegment(String(context?.uid || "").trim(), "anon"),
    normalizeStorageSegment(String(input?.sessionId || "").trim(), "session"),
    `${exportId}.${outExt}`
  ].join("/");
  const stat = await fs.promises.stat(finalOutPath).catch(() => null);
  const candidateBuckets = getStorageBucketCandidates();
  let targetBucket = await resolveWritableStorageBucket();
  let lastUploadError = null;
  for (const candidateBucket of candidateBuckets) {
    if (!candidateBucket) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      await uploadFileToBucketNonResumable({
        bucket: candidateBucket,
        destination: storagePath,
        filePath: finalOutPath,
        contentType: mimeType
      });
      targetBucket = candidateBucket;
      resolvedWritableStorageBucket = candidateBucket;
      lastUploadError = null;
      break;
    } catch (error) {
      lastUploadError = error;
      console.warn("[backend][storage] export upload failed on bucket candidate", {
        bucket: String(candidateBucket?.name || "").trim(),
        message: String(error?.message || error),
        code: String(error?.code || "").trim() || null,
        status: Number(error?.status || 0) || undefined
      });
      const status = Number(error?.status || 0) || 0;
      const code = String(error?.code || "").trim();
      const isRetryableCandidateFailure = code === "signed_url_upload_failed" && (status === 404 || status === 403);
      if (!isRetryableCandidateFailure) throw error;
    }
  }
  if (lastUploadError) throw lastUploadError;
  const base = String(context?.baseUrl || "").trim() || getBackendPublicBaseUrl() || `http://127.0.0.1:${PORT}`;
  const downloadUrl = `${base}/api/assets/montage-download?jobId=${encodeURIComponent(exportId)}&token=${encodeURIComponent(token)}`;
  let cacheArtifact = null;
  try {
    cacheArtifact = await writeMontageExportCacheArtifact({
      exportId,
      sourcePath: finalOutPath,
      token,
      filename,
      mimeType,
      expiresAt: expiresAtIso,
      outExt
    });
  } catch (cacheError) {
    console.warn("[backend][storage] export cache artifact write failed", {
      exportId,
      message: String(cacheError?.message || cacheError)
    });
  }
  return {
    exportId,
    downloadUrl,
    downloadToken: token,
    storagePath,
    createdAtIso,
    expiresAtIso,
    filename,
    mimeType,
    sizeBytes: Math.max(0, Number(stat?.size || 0) || 0),
    cacheFilePath: cacheArtifact?.filePath || ""
  };
}

function buildMontagePreviewPipelineInput(rawInput = {}) {
  const input = rawInput && typeof rawInput === "object" ? rawInput : {};
  return {
    ...input,
    format: "mp4_h264",
    qualityPreset: "small",
    resolution: input?.resolution === "1080p" || input?.resolution === "720p" ? "720p" : "480p",
    includeBackgroundMusic: false,
    backgroundMusic: null,
    useTimelineAudio: false,
    timelineAudioSegments: [],
    normalizedGeminiTimelineSegments: [],
    entries: Array.isArray(input?.entries)
      ? input.entries.map((entry) => ({
        ...entry,
        audio: null,
        useNativeVideoAudio: false
      }))
      : []
  };
}

function resolveMontageCanvasSize(sourceWidth = 1280, sourceHeight = 720, resolution = "source", reelModeEnabled = false) {
  const safeWidth = Math.max(2, Math.round(Number(sourceWidth || 1280) || 1280));
  const safeHeight = Math.max(2, Math.round(Number(sourceHeight || 720) || 720));
  const even = (value = 0) => Math.max(2, Math.round(value / 2) * 2);
  const key = String(resolution || "source").trim().toLowerCase();

  let w = even(safeWidth);
  let h = even(safeHeight);

  if (key === "1080x1920") {
    w = 1080;
    h = 1920;
  } else if (key === "720x1280") {
    w = 720;
    h = 1280;
  } else if (key === "480x854") {
    w = 480;
    h = 854;
  } else if (key === "1080p") {
    w = 1920;
    h = 1080;
  } else if (key === "720p") {
    w = 1280;
    h = 720;
  } else if (key === "480p") {
    w = 854;
    h = 480;
  }

  if (reelModeEnabled) {
    if (w > h) {
      const temp = w;
      w = h;
      h = temp;
    }
  } else {
    if (w < h) {
      const temp = w;
      w = h;
      h = temp;
    }
  }

  return { width: even(w), height: even(h) };
}

function isMontageReelResolution(resolution = "") {
  return new Set(["1080x1920", "720x1280", "480x854"]).has(String(resolution || "").trim().toLowerCase());
}

function normalizeMontageVisualEffects(raw = null) {
  const source = raw && typeof raw === "object" ? raw : {};
  const allowed = ["pan-left", "pan-right", "pan-up", "pan-down", "zoom-in", "zoom-out"];
  const effects = Array.isArray(source.effects)
    ? source.effects.map((item) => String(item || "").trim()).filter((item) => allowed.includes(item))
    : [];
  const speed = Math.max(1, Math.min(10, Math.round(Number(source.speed || 5) || 5)));
  return { effects, speed };
}

function normalizeMontageTransition(raw = null) {
  const source = raw && typeof raw === "object" ? raw : {};
  const allowed = [
    "cut",
    "crossfade",
    "dip-black",
    "flash-white",
    "slide-left",
    "slide-right",
    "slide-up",
    "slide-down",
    "zoom-in",
    "zoom-out",
    "blur"
  ];
  const requestedType = String(source.type || "cut").trim().toLowerCase();
  const type = allowed.includes(requestedType) ? requestedType : "cut";
  const durationMs = type === "cut"
    ? 0
    : Math.max(0, Math.min(1200, Math.round(Number(source.durationMs || 0) || 0)));
  return { type, durationMs };
}

function normalizeMontageMediaScale(value = 1) {
  const numeric = Math.round((Number(value) || 1) * 100) / 100;
  return Math.max(1, Math.min(2.5, numeric || 1));
}

function normalizeMontageMediaOffset(value = 0) {
  const numeric = Math.round((Number(value) || 0) * 1000) / 1000;
  return Math.max(-0.5, Math.min(0.5, numeric || 0));
}

function normalizeMontageMediaMotionPreset(value = "") {
  const preset = String(value || "none").trim().toLowerCase();
  return ["pan-left-right", "pan-right-left", "pan-up-down", "pan-down-up"].includes(preset) ? preset : "none";
}

function normalizeMontageOverlayCards(raw = null) {
  const source = raw && typeof raw === "object" ? raw : {};
  const segmentsRaw = Array.isArray(source?.segments) ? source.segments : [];
  return segmentsRaw.slice(0, 120).map((card, idx) => {
    if (!card || typeof card !== "object") return null;
    const textLines = Array.isArray(card.textLines)
      ? card.textLines.map((line) => clampText(line || "", 180)).filter(Boolean).slice(0, 4)
      : [];
    if (!textLines.length) return null;
    const position = card.position && typeof card.position === "object" ? card.position : {};
      const widthPct = clampNumber(position.widthPct, 0.48, 0.9, 0.56);
      const heightPct = clampNumber(position.heightPct, 0.18, 0.55, 0.2);
    const enterAnimation = String(card.enterAnimation || "").trim().toLowerCase();
    const exitAnimation = String(card.exitAnimation || "").trim().toLowerCase();
    return {
      id: clampText(card.id || `card-${idx + 1}`, 140),
      rowId: clampText(card.rowId || "", 140),
      startMs: Math.max(0, Math.round(Number(card.startMs || 0) || 0)),
      durationMs: Math.max(500, Math.round(Number(card.durationMs || 0) || 0)),
      exitDelayMs: Math.max(0, Math.round(Number(card.exitDelayMs ?? Math.max(0, (Number(card.durationMs || 0) || 0) - 520)) || 0)),
      preset: ["lower-third", "info-panel", "phone-cta"].includes(String(card.preset || "").trim().toLowerCase()) ? String(card.preset).trim().toLowerCase() : "lower-third",
      textLines,
      position: {
        xPct: clampNumber(position.xPct, 0, Math.max(0, 1 - widthPct), 0.06),
        yPct: clampNumber(position.yPct, 0, Math.max(0, 1 - heightPct), 0.66),
        widthPct,
        heightPct
      },
      enterAnimation: ["slide-left", "slide-right", "slide-up", "slide-down", "fade"].includes(enterAnimation) ? enterAnimation : "slide-left",
      exitAnimation: ["slide-left", "slide-right", "slide-up", "slide-down", "fade"].includes(exitAnimation) ? exitAnimation : "fade",
      style: card.style && typeof card.style === "object" ? card.style : {},
      zIndex: Math.max(1, Math.min(999, Math.round(Number(card.zIndex || idx + 20) || idx + 20)))
    };
  }).filter(Boolean);
}

function buildMontageMediaPositionFilter({
  width = 1280,
  height = 720,
  mediaOffsetXPct = 0,
  mediaOffsetYPct = 0,
  mediaMotionPreset = "none",
  durationSec = 1
} = {}) {
  const safeWidth = Math.max(2, Math.round(Number(width || 1280) || 1280));
  const safeHeight = Math.max(2, Math.round(Number(height || 720) || 720));
  const baseX = normalizeMontageMediaOffset(mediaOffsetXPct);
  const baseY = normalizeMontageMediaOffset(mediaOffsetYPct);
  const preset = normalizeMontageMediaMotionPreset(mediaMotionPreset);
  const duration = Math.max(0.2, Number(durationSec || 1) || 1);
  const progress = `(0.5-0.5*cos(2*PI*min(max(t/${duration.toFixed(3)}\\,0)\\,1)))`;
  let motionX = "0";
  let motionY = "0";
  if (preset === "pan-left-right") motionX = `((${progress})-0.5)*0.16`;
  if (preset === "pan-right-left") motionX = `(0.5-(${progress}))*0.16`;
  if (preset === "pan-up-down") motionY = `((${progress})-0.5)*0.16`;
  if (preset === "pan-down-up") motionY = `(0.5-(${progress}))*0.16`;
  const xExpr = `(iw-${safeWidth})/2+(${safeWidth})*(${baseX.toFixed(3)}+${motionX})`;
  const yExpr = `(ih-${safeHeight})/2+(${safeHeight})*(${baseY.toFixed(3)}+${motionY})`;
  return `crop=${safeWidth}:${safeHeight}:x='min(max(${xExpr}\\,0)\\,iw-${safeWidth})':y='min(max(${yExpr}\\,0)\\,ih-${safeHeight})'`;
}

function resolveMontageKenBurnsEffect(rawEffects = null) {
  return resolveSceneMediaRenderSpec({
    canvasWidth: 1280,
    canvasHeight: 720,
    sourceWidth: 1280,
    sourceHeight: 720,
    visualEffects: rawEffects,
    mediaKind: "image"
  }).kenBurns;
}

function buildSceneMediaMotionProgressExpr(durationSec = 1) {
  const duration = Math.max(0.2, Number(durationSec || 1) || 1);
  const raw = `min(max(t/${duration.toFixed(3)}\\,0)\\,1)`;
  return `((${raw})*(${raw})*(3-2*(${raw})))`;
}

function buildSceneMediaPositionCropFilter({
  inputLabel = "[0:v]",
  outputLabel = "vout",
  canvas = { width: 1280, height: 720 },
  sourceWidth = 1280,
  sourceHeight = 720,
  durationSec = 1,
  visualLayoutMode = "default",
  reelMode = false,
  mediaScale = 1,
  mediaOffsetXPct = 0,
  mediaOffsetYPct = 0,
  mediaMotionPreset = "none",
  visualEffects = null,
  mediaKind = "video",
  scaleFilter = "",
  cloneTail = false,
  backgroundLabel = "scene_bg",
  transformedLabel = "scene_fg"
} = {}) {
  const width = Math.max(2, Math.round(Number(canvas?.width || 1280) || 1280));
  const height = Math.max(2, Math.round(Number(canvas?.height || 720) || 720));
  const spec = resolveSceneMediaRenderSpec({
    canvasWidth: width,
    canvasHeight: height,
    sourceWidth: Math.max(2, Number(sourceWidth || width) || width),
    sourceHeight: Math.max(2, Number(sourceHeight || height) || height),
    reelMode,
    visualLayoutMode,
    mediaScale,
    mediaOffsetXPct,
    mediaOffsetYPct,
    mediaMotionPreset,
    visualEffects,
    mediaKind,
    durationSec
  });
  const progressExpr = buildSceneMediaMotionProgressExpr(durationSec);
  let xExpr = `${spec.leftPx.toFixed(3)}`;
  let yExpr = `${spec.topPx.toFixed(3)}`;
  if (spec.motion.preset === "pan-left-right") {
    xExpr = `${(spec.leftPx - spec.motion.amplitudeXPx).toFixed(3)}+(2*${spec.motion.amplitudeXPx.toFixed(3)}*(${progressExpr}))`;
  } else if (spec.motion.preset === "pan-right-left") {
    xExpr = `${(spec.leftPx + spec.motion.amplitudeXPx).toFixed(3)}-(2*${spec.motion.amplitudeXPx.toFixed(3)}*(${progressExpr}))`;
  } else if (spec.motion.preset === "pan-up-down") {
    yExpr = `${(spec.topPx - spec.motion.amplitudeYPx).toFixed(3)}+(2*${spec.motion.amplitudeYPx.toFixed(3)}*(${progressExpr}))`;
  } else if (spec.motion.preset === "pan-down-up") {
    yExpr = `${(spec.topPx + spec.motion.amplitudeYPx).toFixed(3)}-(2*${spec.motion.amplitudeYPx.toFixed(3)}*(${progressExpr}))`;
  }

  if (visualLayoutMode === "blur-backdrop") {
    const prepLabel = cloneTail ? "[v_padded]" : inputLabel;
    const prepFilter = cloneTail
      ? `${inputLabel}tpad=stop_mode=clone:stop_duration=${Math.max(0.2, Number(durationSec || 1) || 1).toFixed(3)}[v_padded];`
      : "";
    
    const inputChain = [
      `[vfg_src]scale=trunc(iw/2)*2:trunc(ih/2)*2${scaleFilter ? `,${scaleFilter}` : ""}`
    ];
    if (mediaKind === "image" && spec.kenBurns.effect) {
      const panScale = Number(spec.kenBurns.panScale || 1.2);
      const panDistanceXPx = spec.scaledRect.width * Number(spec.kenBurns.panDistancePct || 0.10);
      const panDistanceYPx = spec.scaledRect.height * Number(spec.kenBurns.panDistancePct || 0.10);
      if (spec.kenBurns.effect === "zoom-in" || spec.kenBurns.effect === "zoom-out") {
        const zoomFrom = spec.kenBurns.effect === "zoom-out" ? Number(spec.kenBurns.zoomTo || 1.3) : Number(spec.kenBurns.zoomFrom || 1);
        const zoomTo = spec.kenBurns.effect === "zoom-out" ? Number(spec.kenBurns.zoomFrom || 1) : Number(spec.kenBurns.zoomTo || 1.3);
        const zoomExpr = `${zoomFrom.toFixed(3)}+((${zoomTo.toFixed(3)}-${zoomFrom.toFixed(3)})*(${progressExpr}))`;
        const widthExpr = `'ceil(${spec.scaledRect.width.toFixed(3)}*(${zoomExpr})/2)*2'`;
        const heightExpr = `'ceil(${spec.scaledRect.height.toFixed(3)}*(${zoomExpr})/2)*2'`;
        xExpr = `${spec.leftPx.toFixed(3)}-((${widthExpr}-${spec.scaledRect.width.toFixed(3)})/2)`;
        yExpr = `${spec.topPx.toFixed(3)}-((${heightExpr}-${spec.scaledRect.height.toFixed(3)})/2)`;
        inputChain.push(`scale=w=${widthExpr}:h=${heightExpr}:eval=frame`);
      } else {
        const motionWidth = Math.max(2, Math.round(spec.scaledRect.width * panScale / 2) * 2);
        const motionHeight = Math.max(2, Math.round(spec.scaledRect.height * panScale / 2) * 2);
        inputChain.push(`scale=${motionWidth}:${motionHeight}:eval=frame`);
        const baseLeft = spec.leftPx - ((motionWidth - spec.scaledRect.width) / 2);
        const baseTop = spec.topPx - ((motionHeight - spec.scaledRect.height) / 2);
        if (spec.kenBurns.effect === "pan-left") {
          xExpr = `${(baseLeft - panDistanceXPx).toFixed(3)}+(${(panDistanceXPx * 2).toFixed(3)}*(${progressExpr}))`;
          yExpr = `${baseTop.toFixed(3)}`;
        } else if (spec.kenBurns.effect === "pan-right") {
          xExpr = `${(baseLeft + panDistanceXPx).toFixed(3)}-(${(panDistanceXPx * 2).toFixed(3)}*(${progressExpr}))`;
          yExpr = `${baseTop.toFixed(3)}`;
        } else if (spec.kenBurns.effect === "pan-up") {
          xExpr = `${baseLeft.toFixed(3)}`;
          yExpr = `${(baseTop + panDistanceYPx).toFixed(3)}-(${(panDistanceYPx * 2).toFixed(3)}*(${progressExpr}))`;
        } else if (spec.kenBurns.effect === "pan-down") {
          xExpr = `${baseLeft.toFixed(3)}`;
          yExpr = `${(baseTop - panDistanceYPx).toFixed(3)}+(${(panDistanceYPx * 2).toFixed(3)}*(${progressExpr}))`;
        }
      }
    } else {
      inputChain.push(`scale=${spec.evenScaledSize.width}:${spec.evenScaledSize.height}`);
    }

    return [
      `${prepFilter}${prepLabel}split=2[vbg_src][vfg_src]`,
      `[vbg_src]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=24:8,eq=saturation=1.08[${backgroundLabel}]`,
      `${inputChain.join(",")}[${transformedLabel}]`,
      `[${backgroundLabel}][${transformedLabel}]overlay=x='${xExpr}':y='${yExpr}':eval=frame:shortest=1,format=yuv420p[${outputLabel}]`
    ].filter(Boolean).join(";");
  }

  const inputChain = [
    `${inputLabel}${cloneTail ? `tpad=stop_mode=clone:stop_duration=${Math.max(0.2, Number(durationSec || 1) || 1).toFixed(3)},` : ""}scale=trunc(iw/2)*2:trunc(ih/2)*2${scaleFilter ? `,${scaleFilter}` : ""}`
  ];
  if (mediaKind === "image" && spec.kenBurns.effect) {
    const panScale = Number(spec.kenBurns.panScale || 1.2);
    const panDistanceXPx = spec.scaledRect.width * Number(spec.kenBurns.panDistancePct || 0.10);
    const panDistanceYPx = spec.scaledRect.height * Number(spec.kenBurns.panDistancePct || 0.10);
    if (spec.kenBurns.effect === "zoom-in" || spec.kenBurns.effect === "zoom-out") {
      const zoomFrom = spec.kenBurns.effect === "zoom-out" ? Number(spec.kenBurns.zoomTo || 1.3) : Number(spec.kenBurns.zoomFrom || 1);
      const zoomTo = spec.kenBurns.effect === "zoom-out" ? Number(spec.kenBurns.zoomFrom || 1) : Number(spec.kenBurns.zoomTo || 1.3);
      const zoomExpr = `${zoomFrom.toFixed(3)}+((${zoomTo.toFixed(3)}-${zoomFrom.toFixed(3)})*(${progressExpr}))`;
      const widthExpr = `'ceil(${spec.scaledRect.width.toFixed(3)}*(${zoomExpr})/2)*2'`;
      const heightExpr = `'ceil(${spec.scaledRect.height.toFixed(3)}*(${zoomExpr})/2)*2'`;
      xExpr = `${spec.leftPx.toFixed(3)}-((${widthExpr}-${spec.scaledRect.width.toFixed(3)})/2)`;
      yExpr = `${spec.topPx.toFixed(3)}-((${heightExpr}-${spec.scaledRect.height.toFixed(3)})/2)`;
      inputChain.push(`scale=w=${widthExpr}:h=${heightExpr}:eval=frame`);
    } else {
      const motionWidth = Math.max(2, Math.round(spec.scaledRect.width * panScale / 2) * 2);
      const motionHeight = Math.max(2, Math.round(spec.scaledRect.height * panScale / 2) * 2);
      inputChain.push(`scale=${motionWidth}:${motionHeight}:eval=frame`);
      const baseLeft = spec.leftPx - ((motionWidth - spec.scaledRect.width) / 2);
      const baseTop = spec.topPx - ((motionHeight - spec.scaledRect.height) / 2);
      if (spec.kenBurns.effect === "pan-left") {
        xExpr = `${(baseLeft - panDistanceXPx).toFixed(3)}+(${(panDistanceXPx * 2).toFixed(3)}*(${progressExpr}))`;
        yExpr = `${baseTop.toFixed(3)}`;
      } else if (spec.kenBurns.effect === "pan-right") {
        xExpr = `${(baseLeft + panDistanceXPx).toFixed(3)}-(${(panDistanceXPx * 2).toFixed(3)}*(${progressExpr}))`;
        yExpr = `${baseTop.toFixed(3)}`;
      } else if (spec.kenBurns.effect === "pan-up") {
        xExpr = `${baseLeft.toFixed(3)}`;
        yExpr = `${(baseTop + panDistanceYPx).toFixed(3)}-(${(panDistanceYPx * 2).toFixed(3)}*(${progressExpr}))`;
      } else if (spec.kenBurns.effect === "pan-down") {
        xExpr = `${baseLeft.toFixed(3)}`;
        yExpr = `${(baseTop - panDistanceYPx).toFixed(3)}+(${(panDistanceYPx * 2).toFixed(3)}*(${progressExpr}))`;
      }
    }
  } else {
    inputChain.push(`scale=${spec.evenScaledSize.width}:${spec.evenScaledSize.height}`);
  }
  return [
    `color=c=0x020617:s=${width}x${height}:d=${Math.max(0.2, Number(durationSec || 1) || 1).toFixed(3)}:r=24[${backgroundLabel}]`,
    `${inputChain.join(",")}[${transformedLabel}]`,
    `[${backgroundLabel}][${transformedLabel}]overlay=x='${xExpr}':y='${yExpr}':eval=frame:shortest=1,format=yuv420p[${outputLabel}]`
  ].join(";");
}

function buildMontageImageMotionVideoFilter({
  inputLabel = "[0:v]",
  outputLabel = "vout",
  canvas = { width: 1280, height: 720 },
  durationSec = 1,
  visualEffects = null,
  sourceWidth = 1280,
  sourceHeight = 720,
  reelMode = false,
  visualLayoutMode = "default",
  mediaScale = 1,
  mediaOffsetXPct = 0,
  mediaOffsetYPct = 0,
  mediaMotionPreset = "none"
} = {}) {
  return buildSceneMediaPositionCropFilter({
    inputLabel,
    outputLabel,
    canvas,
    sourceWidth,
    sourceHeight,
    durationSec,
    visualLayoutMode,
    reelMode,
    mediaScale,
    mediaOffsetXPct,
    mediaOffsetYPct,
    mediaMotionPreset,
    visualEffects,
    mediaKind: "image"
  });
}

function buildMontageVideoSceneFilter({
  inputLabel = "[0:v]",
  outputLabel = "vout",
  canvas = { width: 1280, height: 720 },
  durationSec = 1,
  scaleFilter = "",
  sourceWidth = 1280,
  sourceHeight = 720,
  reelMode = false,
  visualLayoutMode = "default",
  mediaScale = 1,
  mediaOffsetXPct = 0,
  mediaOffsetYPct = 0,
  mediaMotionPreset = "none"
} = {}) {
  return buildSceneMediaPositionCropFilter({
    inputLabel,
    outputLabel,
    canvas,
    sourceWidth,
    sourceHeight,
    durationSec,
    visualLayoutMode,
    reelMode,
    mediaScale,
    mediaOffsetXPct,
    mediaOffsetYPct,
    mediaMotionPreset,
    visualEffects: null,
    mediaKind: "video",
    scaleFilter,
    cloneTail: true
  });
}

function buildMontageOverlapCompositionPlan(exportedEntries = []) {
  const ordered = (Array.isArray(exportedEntries) ? exportedEntries : [])
    .filter(Boolean)
    .slice()
    .sort((a, b) => (
      Number(a?.timelineStartMs || 0) - Number(b?.timelineStartMs || 0)
      || Number(a?.zIndex || 0) - Number(b?.zIndex || 0)
      || Number(a?.sceneIndex || 0) - Number(b?.sceneIndex || 0)
    ));
  const planned = ordered.map((entry, index) => {
    const startMs = Math.max(0, Math.round(Number(entry?.timelineStartMs || 0) || 0));
    const endMs = Math.max(startMs + 500, Math.round(Number(entry?.timelineEndMs || (startMs + Number(entry?.durationMs || 500))) || 0));
    const durationMs = Math.max(500, Math.round(Number(entry?.durationMs || (endMs - startMs)) || (endMs - startMs) || 500));
    return {
      ...entry,
      orderIndex: index,
      timelineStartMs: startMs,
      timelineEndMs: endMs,
      durationMs
    };
  });
  let hasOverlap = false;
  let hasGaps = false;
  for (let index = 1; index < planned.length; index += 1) {
    const previous = planned[index - 1];
    const current = planned[index];
    const currentStartMs = Math.round(Number(current?.timelineStartMs || 0) || 0);
    const previousEndMs = Math.round(Number(previous?.timelineEndMs || 0) || 0);
    
    if (currentStartMs < previousEndMs - 1) {
      hasOverlap = true;
    }
    if (currentStartMs > previousEndMs + 1) {
      hasGaps = true;
    }
    if (hasOverlap && hasGaps) break;
  }
  const totalDurationMs = planned.reduce((max, entry) => Math.max(max, Number(entry?.timelineEndMs || 0)), 0);
  return { entries: planned, hasOverlap, hasGaps, totalDurationMs: Math.max(500, totalDurationMs) };
}

function buildMontageTransitionProgressExpr(startSec = 0, durationSec = 0.3) {
  const start = Math.max(0, Number(startSec || 0) || 0).toFixed(3);
  const duration = Math.max(0.001, Number(durationSec || 0.3) || 0.3).toFixed(3);
  const raw = `min(max((t-${start})/${duration}\\,0)\\,1)`;
  return `((${raw})*(${raw})*(3-2*(${raw})))`;
}

function buildMontageLocalTransitionProgressExpr(durationSec = 0.3) {
  const duration = Math.max(0.001, Number(durationSec || 0.3) || 0.3).toFixed(3);
  const raw = `min(max(t/${duration}\\,0)\\,1)`;
  return `((${raw})*(${raw})*(3-2*(${raw})))`;
}

function resolveMontageOverlayTransition(entry = null, previousEntry = null) {
  if (!entry || !previousEntry) return { type: "cut", durationMs: 0 };
  const transition = normalizeMontageTransition(previousEntry?.transitionOut || entry?.transitionIn || null);
  const overlapMs = Math.max(
    0,
    Math.min(
      Number(transition.durationMs || 0),
      Math.round(Number(previousEntry?.timelineEndMs || 0) - Number(entry?.timelineStartMs || 0))
    )
  );
  if (transition.type === "cut" || overlapMs < 20) return { type: "cut", durationMs: 0 };
  return { type: transition.type, durationMs: overlapMs };
}

async function renderMontageOverlapComposition({
  input = {},
  tmpDir = "",
  params = {},
  outExt = "mp4",
  intermediatePaths = [],
  exportedEntries = []
} = {}) {
  const plan = buildMontageOverlapCompositionPlan(exportedEntries);
  if ((!plan.hasOverlap && !plan.hasGaps) || !intermediatePaths.length || intermediatePaths.length !== plan.entries.length) {
    return "";
  }
  const firstDims = await probeMediaVideoDimensionsWithFfmpeg(intermediatePaths[0], "montage_overlap_probe").catch(() => ({ width: 1280, height: 720 }));
  const canvas = resolveMontageCanvasSize(
    firstDims?.width || 1280,
    firstDims?.height || 720,
    input?.resolution || "source",
    input?.reelModeEnabled === true
  );
  const totalSec = Math.max(0.25, plan.totalDurationMs / 1000);
  const colorInputIndex = intermediatePaths.length;
  const silentAudioInputIndex = intermediatePaths.length + 1;
  const filters = [`[${colorInputIndex}:v]format=rgba[base0]`];
  const audioLabels = [];
  let baseLabel = "base0";

  plan.entries.forEach((entry, index) => {
    const durSec = Math.max(0.2, Number(entry?.durationMs || 500) / 1000);
    const startSec = Math.max(0, Number(entry?.timelineStartMs || 0) / 1000);
    const previousEntry = index > 0 ? plan.entries[index - 1] : null;
    const transition = resolveMontageOverlayTransition(entry, previousEntry);
    const transitionType = String(transition?.type || "cut").trim().toLowerCase();
    const transitionSec = Math.max(0.02, Number(transition?.durationMs || 0) / 1000);
    const localProgressExpr = buildMontageLocalTransitionProgressExpr(transitionSec);
    const overlayProgressExpr = buildMontageTransitionProgressExpr(startSec, transitionSec);
    const videoLabel = `v${index}`;
    let videoChain = `[${index}:v]scale=${canvas.width}:${canvas.height},setsar=1,format=rgba`;
    if (transitionType === "crossfade" || transitionType === "dip-black" || transitionType === "flash-white" || transitionType === "blur") {
      videoChain += `,fade=t=in:st=0:d=${transitionSec.toFixed(3)}:alpha=1`;
    }
    if (transitionType === "zoom-in" || transitionType === "zoom-out" || transitionType === "blur") {
      const scaleExpr = transitionType === "zoom-in"
        ? `0.72+0.28*${localProgressExpr}`
        : transitionType === "zoom-out"
          ? `1.22-0.22*${localProgressExpr}`
          : `1.06-0.06*${localProgressExpr}`;
      videoChain += `,scale=w='${canvas.width}*(${scaleExpr})':h='${canvas.height}*(${scaleExpr})':eval=frame`;
    }
    videoChain += `,setpts=PTS-STARTPTS+${startSec.toFixed(3)}/TB[${videoLabel}]`;
    filters.push(videoChain);
    let overlayX = "0";
    let overlayY = "0";
    if (transitionType === "slide-left") {
      overlayX = `${canvas.width}*(1-${overlayProgressExpr})`;
    } else if (transitionType === "slide-right") {
      overlayX = `-${canvas.width}*(1-${overlayProgressExpr})`;
    } else if (transitionType === "slide-up") {
      overlayY = `${canvas.height}*(1-${overlayProgressExpr})`;
    } else if (transitionType === "slide-down") {
      overlayY = `-${canvas.height}*(1-${overlayProgressExpr})`;
    } else if (transitionType === "zoom-in" || transitionType === "zoom-out" || transitionType === "blur") {
      overlayX = `(${canvas.width}-w)/2`;
      overlayY = `(${canvas.height}-h)/2`;
    }
    const overlayOutLabel = `base${index + 1}`;
    filters.push(`[${baseLabel}][${videoLabel}]overlay=eof_action=pass:shortest=0:x='${overlayX}':y='${overlayY}':format=auto[${overlayOutLabel}]`);
    baseLabel = overlayOutLabel;
    if (transitionType === "dip-black" || transitionType === "flash-white") {
      const pulseLabel = `transition_pulse_${index}`;
      const pulseOutLabel = `base${index + 1}_pulse`;
      const color = transitionType === "flash-white" ? "white" : "black";
      const halfTransitionSec = Math.max(0.01, transitionSec / 2);
      filters.push(`color=c=${color}@1:s=${canvas.width}x${canvas.height}:d=${totalSec.toFixed(3)}:r=24,format=rgba,fade=t=in:st=${startSec.toFixed(3)}:d=${halfTransitionSec.toFixed(3)}:alpha=1,fade=t=out:st=${(startSec + halfTransitionSec).toFixed(3)}:d=${halfTransitionSec.toFixed(3)}:alpha=1[${pulseLabel}]`);
      filters.push(`[${baseLabel}][${pulseLabel}]overlay=eof_action=pass:shortest=0:x=0:y=0:format=auto[${pulseOutLabel}]`);
      baseLabel = pulseOutLabel;
    }

    const sceneVeoVolumePct = Math.max(0, Math.min(200, Number(entry?.veoVolumeOverridePct ?? 0)));
    const includeSceneAudio = input?.useTimelineAudio !== true || (entry?.useNativeVideoAudio === true && sceneVeoVolumePct > 0.0001);
    if (includeSceneAudio) {
      const audioLabel = `a${index}`;
      let audioChain = `[${index}:a]atrim=start=0:duration=${durSec.toFixed(3)},asetpts=PTS-STARTPTS`;
      const delayMs = Math.max(0, Math.round(Number(entry?.timelineStartMs || 0) || 0));
      audioChain += `,adelay=${delayMs}ms|${delayMs}ms[${audioLabel}]`;
      filters.push(audioChain);
      audioLabels.push(audioLabel);
    }
  });

  if (audioLabels.length) {
    filters.push(`${audioLabels.map((label) => `[${label}]`).join("")}amix=inputs=${audioLabels.length}:duration=longest:dropout_transition=0:normalize=0,aresample=48000[aout_mix]`);
    filters.push(`[aout_mix][${silentAudioInputIndex}:a]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[aout]`);
  } else {
    filters.push(`[${silentAudioInputIndex}:a]atrim=start=0:duration=${totalSec.toFixed(3)},asetpts=PTS-STARTPTS[aout]`);
  }

  const outPath = path.join(tmpDir, `montage-overlap.${outExt}`);
  await runFfmpegCommand([
    "-y", "-hide_banner", "-loglevel", "warning",
    ...intermediatePaths.flatMap((p) => ["-i", p]),
    "-f", "lavfi", "-i", `color=c=black:s=${canvas.width}x${canvas.height}:d=${totalSec.toFixed(3)}:r=24`,
    "-f", "lavfi", "-i", `anullsrc=channel_layout=stereo:sample_rate=48000:d=${totalSec.toFixed(3)}`,
    "-filter_complex", filters.join(";"),
    "-map", `[${baseLabel}]`,
    "-map", "[aout]",
    "-r", "24",
    "-c:v", params.vCodec,
    ...params.vArgs,
    "-pix_fmt", "yuv420p",
    "-c:a", params.aCodec,
    "-ar", "48000",
    ...params.aArgs,
    ...(outExt === "mp4" ? ["-movflags", "+faststart"] : []),
    outPath
  ], { stage: "montage_overlap_compose" });
  return outPath;
}

async function renderMontageGapFillerClip({
  tmpDir = "",
  outExt = "mp4",
  params = {},
  canvas = null,
  gapDurationMs = 0,
  gapIndex = 0
} = {}) {
  const width = Math.max(2, Math.round(Number(canvas?.width || 1280) || 1280));
  const height = Math.max(2, Math.round(Number(canvas?.height || 720) || 720));
  const durationSec = Math.max(0.08, Math.round(Number(gapDurationMs || 0) || 0) / 1000);
  const outPath = path.join(tmpDir, `montage-gap-${String(gapIndex).padStart(3, "0")}.${outExt}`);
  await runFfmpegCommand([
    "-y", "-hide_banner", "-loglevel", "warning",
    "-f", "lavfi", "-i", `color=c=black:s=${width}x${height}:d=${durationSec.toFixed(3)}:r=24`,
    "-f", "lavfi", "-i", `anullsrc=channel_layout=stereo:sample_rate=48000:d=${durationSec.toFixed(3)}`,
    "-map", "0:v:0",
    "-map", "1:a:0",
    "-r", "24",
    "-c:v", params.vCodec,
    ...params.vArgs,
    "-pix_fmt", "yuv420p",
    "-c:a", params.aCodec,
    "-ar", "48000",
    ...params.aArgs,
    ...(outExt === "mp4" ? ["-movflags", "+faststart"] : []),
    outPath
  ], { stage: "montage_gap_fill" });
  return outPath;
}

async function buildMontageGapAwareConcatSequence({
  plan = null,
  tmpDir = "",
  outExt = "mp4",
  params = {},
  canvas = null
} = {}) {
  const entries = Array.isArray(plan?.entries) ? plan.entries : [];
  if (!entries.length) return [];
  const sequence = [];
  let cursorMs = 0;
  let gapIndex = 0;
  for (const entry of entries) {
    const startMs = Math.max(0, Math.round(Number(entry?.timelineStartMs || 0) || 0));
    const endMs = Math.max(startMs, Math.round(Number(entry?.timelineEndMs || 0) || 0));
    const sourcePath = String(entry?.intermediatePath || "").trim();
    if (startMs > cursorMs + 1) {
      // Insert a lightweight black/silent filler instead of forcing a full overlay composition.
      const gapClipPath = await renderMontageGapFillerClip({
        tmpDir,
        outExt,
        params,
        canvas,
        gapDurationMs: startMs - cursorMs,
        gapIndex
      });
      gapIndex += 1;
      sequence.push(gapClipPath);
    }
    if (sourcePath) {
      sequence.push(sourcePath);
    }
    cursorMs = Math.max(cursorMs, endMs);
  }
  return sequence;
}

function buildMontageOverlayCardsFilter({
  cards = [],
  width = 1280,
  height = 720,
  tmpDir = ""
} = {}) {
  const normalizedCards = Array.isArray(cards) ? cards.filter(Boolean) : [];
  if (!normalizedCards.length) return "";
  const canvasWidth = Math.max(2, Math.round(Number(width || 1280) || 1280));
  const canvasHeight = Math.max(2, Math.round(Number(height || 720) || 720));
  const textFileResolver = createMontageReviewTextFileResolver(tmpDir, "overlay-card");
  const fontFile = resolveFfmpegDrawtextFontFile();
  const fontSource = fontFile ? `:fontfile='${escapeFfmpegFilterPath(fontFile)}'` : ":font='Sans'";
  const filters = [];

  normalizedCards
    .slice()
    .sort((a, b) => Number(a.startMs || 0) - Number(b.startMs || 0) || Number(a.zIndex || 0) - Number(b.zIndex || 0))
    .forEach((card) => {
      const startSec = Math.max(0, Number(card.startMs || 0) / 1000);
      const endSec = startSec + Math.max(0.1, Number(card.durationMs || 0) / 1000);
      const enableExpr = escapeFfmpegExpr(`between(t,${startSec.toFixed(3)},${endSec.toFixed(3)})`);
      const pos = card.position || {};
      const w = Math.max(120, Math.round(canvasWidth * clampNumber(pos.widthPct, 0.48, 0.9, 0.56)));
      const h = Math.max(72, Math.round(canvasHeight * clampNumber(pos.heightPct, 0.18, 0.55, 0.2)));
      const x = Math.round(canvasWidth * clampNumber(pos.xPct, 0, Math.max(0, 1 - (w / canvasWidth)), 0.06));
      const y = Math.round(canvasHeight * clampNumber(pos.yPct, 0, Math.max(0, 1 - (h / canvasHeight)), 0.66));
      const enterAnimation = String(card.enterAnimation || "slide-left").trim().toLowerCase();
      const exitAnimation = String(card.exitAnimation || "fade").trim().toLowerCase();
      const enterDx = enterAnimation === "slide-right" ? Math.round(w * 0.42) : enterAnimation === "slide-left" ? -Math.round(w * 0.42) : 0;
      const enterDy = enterAnimation === "slide-down" ? Math.round(h * 0.42) : enterAnimation === "slide-up" ? -Math.round(h * 0.42) : 0;
      const exitDx = exitAnimation === "slide-right" ? Math.round(w * 0.42) : exitAnimation === "slide-left" ? -Math.round(w * 0.42) : 0;
      const exitDy = exitAnimation === "slide-down" ? Math.round(h * 0.42) : exitAnimation === "slide-up" ? -Math.round(h * 0.42) : 0;
      const exitDelayMs = Math.max(0, Math.min(Number(card.durationMs || 0) || 0, Number(card.exitDelayMs ?? Math.max(0, (Number(card.durationMs || 0) || 0) - 520)) || 0));
      const exitStartSec = startSec + (exitDelayMs / 1000);
      const enterDurSec = Math.min(0.52, Math.max(0.12, (endSec - startSec) / 3));
      const exitDurSec = Math.max(0.12, Math.min(2, Math.max(0.12, endSec - exitStartSec)));
      const enterProgress = `min(max((t-${startSec.toFixed(3)})/${enterDurSec.toFixed(3)},0),1)`;
      const exitProgress = `min(max((t-${Math.max(startSec, exitStartSec).toFixed(3)})/${exitDurSec.toFixed(3)},0),1)`;
      const boxX = escapeFfmpegExpr(`${x}+(${enterDx})*(1-(${enterProgress}))+(${exitDx})*(${exitProgress})`);
      const boxY = escapeFfmpegExpr(`${y}+(${enterDy})*(1-(${enterProgress}))+(${exitDy})*(${exitProgress})`);
      const accent = toFfmpegColor(card?.style?.accentColor || "#38BDF8", 0.95, "38BDF8");
      const bg = toFfmpegColor(card?.style?.backgroundColor || "#0F172A", 0.82, "0F172A");
      const fg = toFfmpegColor(card?.style?.textColor || "#F8FAFC", 1, "F8FAFC");
      filters.push(`drawbox=x='${boxX}':y='${boxY}':w=${w}:h=${h}:color=${bg}:t=fill:enable='${enableExpr}'`);
      filters.push(`drawbox=x='${boxX}':y='${boxY}':w=${Math.max(7, Math.round(canvasWidth * 0.006))}:h=${h}:color=${accent}:t=fill:enable='${enableExpr}'`);
      const primarySize = Math.max(24, Math.round(canvasHeight * 0.058));
      const secondarySize = Math.max(16, Math.round(canvasHeight * 0.036));
      const textLines = Array.isArray(card.textLines) ? card.textLines : [];
      textLines.slice(0, 4).forEach((line, index) => {
        const textPath = textFileResolver(String(line || "").trim());
        const fontSize = index === 0 ? primarySize : secondarySize;
        const textY = `(${boxY})+${Math.round(canvasHeight * 0.032) + index * Math.round(fontSize * 1.25)}`;
        filters.push(`drawtext=textfile='${escapeFfmpegFilterPath(textPath)}'${fontSource}:reload=0:fontsize=${fontSize}:fontcolor=${fg}:x='(${boxX})+${Math.round(canvasWidth * 0.026)}':y='${textY}':fix_bounds=1:line_spacing=4:shadowx=0:shadowy=2:shadowcolor=0x020617@0.45:enable='${enableExpr}'`);
      });
    });

  return filters.join(",");
}

function renderOnScreenTextDrawFilters(input, segment, spec, wordTimings, textPath, fontSource, startSec, endSec, textFileResolver) {
  const karaokeEnabled = input.partyKaraoke !== false && wordTimings.length > 0 && String(spec.wrappedText || "").trim();
  return buildMontageOnScreenTextDrawFilters({
    spec,
    settings: input.onScreenTextSettings,
    textPath,
    fontSource,
    textColor: toFfmpegColor(input.onScreenTextSettings?.textColor || "#f8fafc", 1),
    strokeColor: toFfmpegColor(input.onScreenTextSettings?.strokeColor || "#0f172a", 1),
    startSec,
    endSec,
    wordTimings,
    textFileResolver
  });
}

function resolveMontageKaraokeAudioClip(input = {}, rowId = "") {
  const key = String(rowId || "").trim();
  if (!key) return null;
  const clip = input.dialogueAudioMap?.[key];
  return clip && typeof clip === "object" ? clip : null;
}

async function appendMontageSceneOnScreenTextAssFilters({
  input = {},
  entry = {},
  sceneIndex = 1,
  sceneTimelineStartMs = 0,
  sceneTimelineEndMs = 0,
  canvas = { width: 1280, height: 720 },
  videoFilterGraph = "",
  baseVideoMapLabel = "[vout]",
  tmpDir = ""
} = {}) {
  const sceneSegments = resolveMontageSceneOnScreenTextSegments({
    input,
    entry,
    sceneIndex,
    sceneStartMs: sceneTimelineStartMs,
    sceneEndMs: sceneTimelineEndMs,
    renderedSegmentMap: new Map()
  });
  if (!sceneSegments.length) {
    return {
      videoFilterGraph,
      finalVideoMapLabel: baseVideoMapLabel,
      appliedOverlayCount: 0
    };
  }

  const settings = input.onScreenTextSettings && typeof input.onScreenTextSettings === "object"
    ? input.onScreenTextSettings
    : {};
  const assSegments = sceneSegments.map((segment) => {
    const layout = normalizeMontageOnScreenTextExportLayout({
      segment,
      settings,
      resolution: input.resolution || "source",
      sourceDims: canvas
    });
    const spec = resolveOnScreenTextRenderSpec({
      settings,
      layout,
      resolution: input.resolution || "source",
      sourceWidth: canvas.width,
      sourceHeight: canvas.height,
      text: segment.text || "",
      fallback: ""
    });
    const startSec = Math.max(0, (Math.max(0, Number(segment.startMs || 0) || 0) - sceneTimelineStartMs) / 1000);
    const endSec = Math.max(
      startSec + 0.1,
      (Math.max(0, Number(segment.startMs || 0) || 0) + Math.max(0, Number(segment.durationMs || 0) || 0) - sceneTimelineStartMs) / 1000
    );
    const audioClip = resolveMontageKaraokeAudioClip(input, String(segment.rowId || "").trim());
    const wordTimings = input.partyKaraoke !== false
      ? normalizeKaraokeWordTimings(audioClip, String(spec.wrappedText || spec.text || "").trim())
      : [];
    return {
      startSec,
      endSec,
      wordTimings,
      playbackRate: Math.max(0.5, Math.min(10, Number(audioClip?.playbackRate || 1) || 1)),
      spec,
      settings
    };
  }).filter((segment) => String(segment?.spec?.wrappedText || segment?.spec?.text || "").trim());

  if (!assSegments.length) {
    return {
      videoFilterGraph,
      finalVideoMapLabel: baseVideoMapLabel,
      appliedOverlayCount: 0
    };
  }

  const assContent = buildMontageOnScreenTextAss({
    width: canvas.width,
    height: canvas.height,
    settings,
    segments: assSegments
  });
  if (!String(assContent || "").trim()) {
    return {
      videoFilterGraph,
      finalVideoMapLabel: baseVideoMapLabel,
      appliedOverlayCount: 0
    };
  }

  const assPath = path.join(tmpDir, `scene-${String(sceneIndex).padStart(3, "0")}-onscreen.ass`);
  await fs.promises.writeFile(assPath, assContent, "utf8");
  const outLabel = `scene_ontxt_ass_${sceneIndex}`;
  const assFilter = `${baseVideoMapLabel}ass=filename='${escapeFfmpegFilterPath(assPath)}'[${outLabel}]`;
  const newFilterGraph = videoFilterGraph ? `${videoFilterGraph};${assFilter}` : assFilter;

  console.info("[backend][montage-export][scene-text-ass]", {
    sceneIndex,
    rowId: String(entry?.rowId || "").trim() || undefined,
    segmentCount: assSegments.length,
    eventfulWordCount: assSegments.reduce((sum, segment) => sum + (Array.isArray(segment.wordTimings) ? segment.wordTimings.length : 0), 0)
  });

  return {
    videoFilterGraph: newFilterGraph,
    finalVideoMapLabel: `[${outLabel}]`,
    appliedOverlayCount: assSegments.length
  };
}

function buildMontageBrandOverlayFilter(brandOverlay = null, {
  width = 1280,
  height = 720,
  reelModeEnabled = false,
  baseInputLabel = "[0:v]",
  outputLabel = "vout"
} = {}) {
  if (!brandOverlay || typeof brandOverlay !== "object") return "";
  if (brandOverlay.enabled !== true || !brandOverlay.assetPath || !fs.existsSync(brandOverlay.assetPath)) return "";
  const sourceWidth = Math.max(2, Math.round(Number(width || 1280) || 1280));
  const defaultBrandWidthPct = reelModeEnabled ? 0.09 : 0.05;
  const defaultBrandMarginPct = reelModeEnabled ? 0.03 : 0.025;
  const overlayWidthPx = Math.max(48, Math.round(sourceWidth * Math.max(0.04, Math.min(0.4, Number(brandOverlay.widthPct || defaultBrandWidthPct) || defaultBrandWidthPct))));
  const marginPx = Math.max(8, Math.round(sourceWidth * Math.max(0, Math.min(0.2, Number(brandOverlay.marginPct || defaultBrandMarginPct) || defaultBrandMarginPct))));
  const opacity = Math.max(0, Math.min(1, Number(brandOverlay.opacity ?? 1)));
  const position = String(brandOverlay.position || "top-right").trim() || "top-right";
  const xExpr = position.includes("left")
    ? `${marginPx}`
    : `W-w-${marginPx}`;
  const yExpr = position.includes("bottom")
    ? `H-h-${marginPx}`
    : `${marginPx}`;
  return [
    `movie=filename='${escapeFfmpegFilterPath(brandOverlay.assetPath)}',format=rgba${opacity < 0.999 ? `,colorchannelmixer=aa=${opacity.toFixed(3)}` : ""},scale=${overlayWidthPx}:-1[brand]`,
    `${baseInputLabel}[brand]overlay=eof_action=pass:shortest=0:x=${xExpr}:y=${yExpr}:format=auto[${outputLabel}]`
  ].join(";");
}

async function renderMontageOverlayCards({
  input = {},
  finalOutPath = "",
  tmpDir = "",
  outExt = "mp4",
  params = {}
} = {}) {
  const cards = Array.isArray(input.overlayCards) ? input.overlayCards : [];
  if (!cards.length || !finalOutPath) return finalOutPath;
  const sourceDims = await probeMediaVideoDimensionsWithFfmpeg(finalOutPath, "montage_overlay_cards_input").catch(() => ({ width: 1280, height: 720 }));
  const width = Math.max(2, Math.round(Number(sourceDims.width || 1280) || 1280));
  const height = Math.max(2, Math.round(Number(sourceDims.height || 720) || 720));
  const filters = buildMontageOverlayCardsFilter({
    cards,
    width,
    height,
    tmpDir
  });
  if (!filters.length) return finalOutPath;
  const outPath = path.join(tmpDir, `montage-overlay-cards.${outExt}`);
  await runFfmpegCommand([
    "-y", "-hide_banner", "-loglevel", "warning",
    "-i", finalOutPath,
    "-vf", filters.join(","),
    "-map", "0:v:0",
    "-map", "0:a:0?",
    "-c:v", params.vCodec,
    ...params.vArgs,
    "-pix_fmt", "yuv420p",
    "-c:a", "copy",
    ...(outExt === "mp4" ? ["-movflags", "+faststart"] : []),
    outPath
  ], { stage: "montage_overlay_cards" });
  return outPath;
}

async function renderMontageBrowserFinalVisualPass({
  input = {},
  finalOutPath = "",
  tmpDir = "",
  outExt = "mp4",
  deliveryParams = {},
  emitStage = () => {},
  shouldAbort = () => false
} = {}) {
  const sourceDims = await probeMediaVideoDimensionsWithFfmpeg(finalOutPath, "montage_browser_visual_input").catch(() => ({ width: 1280, height: 720 }));
  const viewport = {
    width: Math.max(2, Math.round(Number(sourceDims.width || 1280) || 1280)),
    height: Math.max(2, Math.round(Number(sourceDims.height || 720) || 720))
  };
  const browserOverlayPayload = {
    ...input,
    // Export normal already burns on-screen text per scene via ASS/libass.
    // The browser visual pass should only add overlays/branding on top of that result.
    onScreenTextTimeline: null,
    onScreenTextSettings: null,
    onScreenTextSegments: [],
    onScreenTextRenderedSegments: []
  };
  const browserPayload = {
    ...browserOverlayPayload,
    renderMode: "browser",
    brandOverlay: browserOverlayPayload?.brandOverlay?.assetPath
      ? {
        ...browserOverlayPayload.brandOverlay,
        assetUrl: `file://${path.resolve(process.cwd(), String(browserOverlayPayload.brandOverlay.assetPath || "").trim()).replace(/\\/g, "/")}`
      }
      : browserOverlayPayload?.brandOverlay
  };
  const bootstrapHtmlPath = path.join(tmpDir, "montage-browser-render.html");
  const renderOutputDir = path.join(tmpDir, "montage-browser-recording");
  const totalDurationMs = Math.max(
    1000,
    Math.round((Array.isArray(input?.entries) ? input.entries : []).reduce((max, entry) => {
      const startMs = Math.max(0, Math.round(Number(entry?.timelineStartMs || 0) || 0));
      const durationMs = Math.max(0, Math.round(Number(entry?.durationMs || 0) || 0));
      return Math.max(max, startMs + durationMs);
    }, 0)) || 1000
  );
  emitStage("boot_renderer", 0.8, "Iniciando renderer fiel al preview.");
  throwIfCancelled("boot_renderer");
  const renderedVideoPath = await renderMontageBrowserOverlayVideo({
    publicRoot: path.resolve(process.cwd(), "public"),
    payload: browserPayload,
    baseVideoPath: finalOutPath,
    bootstrapHtmlPath,
    outputDir: renderOutputDir,
    viewport,
    timeoutMs: Math.max(120000, totalDurationMs + 45000)
  });
  if (!renderedVideoPath) {
    const err = new Error("browser_render_output_missing");
    err.code = "browser_render_output_missing";
    throw err;
  }
  emitStage("capture_timeline", 0.88, "Capturando montaje final en navegador.");
  throwIfCancelled("capture_timeline");
  const browserFinalOutPath = path.join(tmpDir, `montage-browser-final.${outExt}`);
  emitStage("transcode_final", 0.96, "Empaquetando video final.");
  throwIfCancelled("transcode_final");
  await runFfmpegCommand([
    "-y", "-hide_banner", "-loglevel", "warning",
    "-i", renderedVideoPath,
    "-i", finalOutPath,
    "-map", "0:v:0",
    "-map", "1:a:0?",
    "-c:v", deliveryParams.vCodec,
    ...deliveryParams.vArgs,
    "-pix_fmt", "yuv420p",
    "-c:a", deliveryParams.aCodec,
    "-ar", "48000",
    ...deliveryParams.aArgs,
    ...(outExt === "mp4" ? ["-movflags", "+faststart"] : []),
    browserFinalOutPath
  ], {
    stage: "montage_browser_transcode",
    shouldAbort: () => shouldAbort()
  });
  return browserFinalOutPath;
}

async function finalizeMontageExportAudioTrack({
  input = {},
  finalOutPath = "",
  tmpDir = "",
  outExt = "mp4",
  exportedDurationSec = 0,
  exportOffsetsByRowId = new Map(),
  emitStage = () => {},
  shouldAbort = () => false,
  downloadInput = null,
  jobId = ""
} = {}) {
  if (!finalOutPath || typeof downloadInput !== "function") return finalOutPath;

  let nextOutPath = finalOutPath;
  if (input.useTimelineAudio) {
    const segmentInputs = [];
    const configuredBackgroundDuckVolume = normalizeMontageBackgroundDuckVolume(
      input.backgroundMusic?.duckingWhenGeminiPct ?? input.backgroundMusicDuckingPct,
      0.60
    );
    emitStage("mix_timeline_audio", 0.58, "Preparando mezcla del audio del timeline.");
    logMontageMemory("mix_timeline_audio_start", {
      jobId,
      timelineSegmentCount: Array.isArray(input.timelineAudioSegments) ? input.timelineAudioSegments.length : 0
    });
    for (let i = 0; i < input.timelineAudioSegments.length; i += 1) {
      const segment = input.timelineAudioSegments[i] || {};
      try {
        // eslint-disable-next-line no-await-in-loop
        const p = await downloadInput({
          storagePath: clampText(segment?.storagePath || "", 900),
          url: String(segment?.url || "").trim(),
          mimeType: clampText(segment?.mimeType || "audio/mpeg", 120) || "audio/mpeg"
        }, "timeline-audio", i);
        if (p) segmentInputs.push({ path: p, segment });
      } catch (error) {
        if (String(error?.code || "") === "storage_not_found") continue;
        throw error;
      }
    }
    if (input.useTimelineAudio && !segmentInputs.length) {
      throw new Error("montage_timeline_audio_sources_missing");
    }
    if (segmentInputs.length) {
      const timelineMixedOutPath = path.join(tmpDir, `montage-timeline-audio-final.${outExt}`);
      const audioCodec = outExt === "webm" ? "libopus" : "aac";
      const audioBitrate = outExt === "webm" ? "128k" : "160k";
      const filters = [];
      const labels = [];
      segmentInputs.forEach((item, idx) => {
        const segment = item.segment || {};
        const startMs = Math.max(0, Math.round(Number(segment?.startMs || 0) || 0));
        const trimInSec = Math.max(0, Math.round(Number(segment?.trimInMs || 0) || 0) / 1000);
        const durationSec = Math.max(0.1, Math.round(Number(segment?.durationMs || 0) || 0) / 1000);
        const volume = Math.max(0, Math.min(2, Math.max(0, Math.min(200, Number(segment?.volumePct ?? 100))) / 100));
        const fadeInSec = Math.max(0, Math.min(durationSec, Math.round(Number(segment?.fadeInMs || 0) || 0) / 1000));
        const fadeOutSec = Math.max(0, Math.min(durationSec, Math.round(Number(segment?.fadeOutMs || 0) || 0) / 1000));
        const inputIndex = idx + 1;
        const label = `a${idx}`;
        labels.push(label);
        const exportOffset = exportOffsetsByRowId.get(String(segment?.rowId || "").trim()) || null;
        const baseTimelineStartMs = Math.max(0, Math.round(Number(exportOffset?.timelineStartMs || 0) || 0));
        const relativeStartMs = Math.max(0, startMs - baseTimelineStartMs);
        const adjustedStartMs = exportOffset ? Math.max(0, exportOffset.startMs + relativeStartMs) : startMs;
        let finalAdjustedStartMs = adjustedStartMs;
        let finalTrimInSec = trimInSec;
        let finalDurationSec = durationSec;

        if (finalAdjustedStartMs < 0) {
          const shiftSec = Math.abs(finalAdjustedStartMs) / 1000;
          finalTrimInSec += shiftSec;
          finalDurationSec = Math.max(0.1, finalDurationSec - shiftSec);
          finalAdjustedStartMs = 0;
        }

        const fadeParts = [volume.toFixed(3)];
        const effectiveFadeInSec = Math.max(0, Math.min(finalDurationSec, fadeInSec));
        const effectiveFadeOutSec = Math.max(0, Math.min(finalDurationSec, fadeOutSec));
        if (effectiveFadeInSec > 0.001) {
          fadeParts.push(`if(lt(t,${effectiveFadeInSec.toFixed(3)}),t/${effectiveFadeInSec.toFixed(3)},1)`);
        }
        if (effectiveFadeOutSec > 0.001) {
          fadeParts.push(`if(gt(t,${Math.max(0, finalDurationSec - effectiveFadeOutSec).toFixed(3)}),(${finalDurationSec.toFixed(3)}-t)/${effectiveFadeOutSec.toFixed(3)},1)`);
        }
        const localVolumeExpr = escapeFfmpegExpr(fadeParts.join("*"));
        const baseChain = `[${inputIndex}:a]atrim=start=${finalTrimInSec.toFixed(3)}:duration=${finalDurationSec.toFixed(3)},asetpts=PTS-STARTPTS,volume='${localVolumeExpr}':eval=frame,adelay=${Math.round(finalAdjustedStartMs)}ms|${Math.round(finalAdjustedStartMs)}ms`;
        const kind = String(segment?.kind || "").trim().toLowerCase();
        const isBackgroundSegment = kind === "uploaded" || kind === "background-track" || kind === "background" || kind === "music";
        if (isBackgroundSegment && input.normalizedGeminiTimelineSegments.length) {
          const segmentDuckVolume = normalizeMontageBackgroundDuckVolume(
            segment?.duckingWhenGeminiPct ?? segment?.duckingPct,
            configuredBackgroundDuckVolume
          );
          const bgDuckExprEscaped = escapeFfmpegExpr(buildFfmpegDuckVolumeExpr(input.normalizedGeminiTimelineSegments, segmentDuckVolume));
          filters.push(`${baseChain},volume='${bgDuckExprEscaped}':eval=frame[${label}]`);
        } else {
          filters.push(`${baseChain}[${label}]`);
        }
      });
      const videoDuckExprEscaped = escapeFfmpegExpr(buildFfmpegDuckVolumeExpr(input.normalizedGeminiTimelineSegments, 0.40));
      const mix = `${labels.map((label) => `[${label}]`).join("")}amix=inputs=${labels.length}:duration=longest:dropout_transition=0:normalize=0,aresample=48000[mix];[0:a]volume='${videoDuckExprEscaped}':eval=frame[v_ducked];[v_ducked][mix]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=-1.5dB[outa]`;
      await runFfmpegCommand([
        "-y", "-hide_banner", "-loglevel", "warning", "-i", nextOutPath,
        ...segmentInputs.flatMap((item) => ["-i", item.path]),
        "-filter_complex", `${filters.join(";")};${mix}`,
        "-map", "0:v:0", "-map", "[outa]", "-c:v", "copy", "-c:a", audioCodec, "-ar", "48000", "-b:a", audioBitrate,
        ...(outExt === "mp4" ? ["-movflags", "+faststart"] : []),
        timelineMixedOutPath
      ], { stage: "montage_mix_timeline_audio", shouldAbort: () => shouldAbort() });
      nextOutPath = timelineMixedOutPath;
    }
    logMontageMemory("mix_timeline_audio_after", {
      jobId,
      timelineSegmentCount: segmentInputs.length
    });
  }

  if (input.includeBackgroundMusic) {
    emitStage("mix_background_music", 0.7, "Mezclando música de fondo.");
    if (!input.backgroundMusic || typeof input.backgroundMusic !== "object") {
      const err = new Error("includeBackgroundMusic requiere backgroundMusic.");
      err.status = 400;
      throw err;
    }
    const musicPath = await downloadInput(input.backgroundMusic, "music", 0);
    const rawVolumePct = Number(input.backgroundMusic?.volumePct ?? 25);
    const volume = Math.max(0, Math.min(1, (Number.isFinite(rawVolumePct) ? rawVolumePct : 25) / 100));
    const configuredBackgroundDuckVolume = normalizeMontageBackgroundDuckVolume(
      input.backgroundMusic?.duckingWhenGeminiPct ?? input.backgroundMusicDuckingPct,
      0.60
    );
    const mixedOutPath = path.join(tmpDir, `montage-mixed-final.${outExt}`);
    const audioCodec = outExt === "webm" ? "libopus" : "aac";
    const audioBitrate = outExt === "webm" ? "128k" : "160k";
    shouldAbort() && (() => { throw new Error("montage_export_cancelled"); })();
    await runFfmpegCommand([
      "-y", "-hide_banner", "-loglevel", "warning",
      "-i", nextOutPath, "-stream_loop", "-1", "-i", musicPath, "-t", String(exportedDurationSec),
      "-filter_complex",
      input.normalizedGeminiTimelineSegments.length
        ? `[1:a]volume='${escapeFfmpegExpr(buildFfmpegDuckVolumeExpr(input.normalizedGeminiTimelineSegments, configuredBackgroundDuckVolume))}*${volume.toFixed(3)}':eval=frame[bg_ducked];[0:a][bg_ducked]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=-1.5dB[outa]`
        : `[1:a]volume=${volume.toFixed(3)}[bg];[0:a][bg]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=-1.5dB[outa]`,
      "-map", "0:v:0", "-map", "[outa]", "-c:v", "copy", "-c:a", audioCodec, "-ar", "48000", "-b:a", audioBitrate,
      ...(outExt === "mp4" ? ["-movflags", "+faststart"] : []),
      mixedOutPath
    ], { stage: "montage_mix_music", shouldAbort: () => shouldAbort() });
    nextOutPath = mixedOutPath;
  }

  return nextOutPath;
}

async function executeMontageExportPipeline(rawInput = {}, context = {}) {
  const input = rawInput && typeof rawInput === "object" ? rawInput : {};
  const uid = String(context?.uid || "").trim();
  const jobId = clampExportId(context?.jobId || "");
  const emitStage = createMontageStageReporter(context?.onStage);
  const shouldAbort = typeof context?.shouldAbort === "function" ? context.shouldAbort : () => false;
  const createCancellationError = (stage = "cancelled") => {
    const err = new Error("montage_export_cancelled");
    err.code = "montage_export_cancelled";
    err.status = 499;
    err.stage = String(stage || "cancelled").trim() || "cancelled";
    err.detail = { stage: err.stage };
    return err;
  };
  const throwIfCancelled = (stage = "cancelled") => {
    if (shouldAbort()) throw createCancellationError(stage);
  };
  let tmpDir = "";
  try {
    throwIfCancelled("validate_payload");
    if (!isFfmpegAvailable()) {
      const err = new Error("ffmpeg_static_missing");
      err.status = 500;
      throw err;
    }
    validateMontageExportRequest(input);
    emitStage("validate_payload", 0.08, "Validando escenas, pistas y formato.");

    tmpDir = path.join(os.tmpdir(), `cb-montage-export-${randomUUID()}`);
    await fs.promises.mkdir(tmpDir, { recursive: true });

    const deliveryParams = resolveMontageExportVideoParams(input.format, input.qualityPreset, input.bitrateSettings);
    const intermediateParams = resolveMontageIntermediateVideoParams(input.format);
    const outExt = getMontageExportExtension(input.format);
    const scaleFilter = resolveMontageExportScaleFilter(input.resolution);
    const shouldBurnSceneOnScreenText = input.exportMode !== "review" && Boolean(input.onScreenTextSettings && input.onScreenTextSegments.length);
    const downloadInput = createMontageAssetDownloader({ tmpDir, uid, sessionId: input.sessionId, shouldAbort });
    const intermediatePaths = [];
    const skippedEntries = [];
    const exportedEntries = [];
    let globalCanvas = null;
    const emitSceneSubstage = ({
      sceneIndex = 0,
      rowId = "",
      totalScenes = 0,
      substage = "",
      hint = "",
      progress = 0,
      storagePath = "",
      downloadUrl = ""
    } = {}) => {
      emitStage("render_scene_segments", progress, hint, {
        currentSceneIndex: sceneIndex,
        currentRowId: rowId,
        totalScenes,
        sceneSubstage: String(substage || "").trim() || undefined,
        currentStoragePath: clampText(storagePath || "", 900) || undefined,
        currentDownloadUrl: downloadUrl ? redactUrlForLogs(downloadUrl) : undefined,
        lastHeartbeatAt: new Date().toISOString()
      });
    };
    emitStage("download_assets", 0.14, "Descargando videos y audio fuente.");
    logMontageMemory("download_assets_start", {
      jobId,
      sceneCount: Array.isArray(input.entries) ? input.entries.length : 0
    });

    for (let i = 0; i < input.entries.length; i += 1) {
      throwIfCancelled("download_assets");
      const entry = input.entries[i] || {};
      const rowId = clampText(entry?.rowId || "", 140);
      const sceneIndex = Math.max(1, Number(entry?.sceneIndex || i + 1) || i + 1);
      const trimInMs = Math.max(0, Number(entry?.trimInMs || 0) || 0);
      const durationMs = Math.max(500, Number(entry?.durationMs || 0) || 0);
      const trimSec = Math.max(0, trimInMs / 1000);
      const durSec = Math.max(0.2, durationMs / 1000);
      const veoVolumePct = Math.max(0, Math.min(200, Number(entry?.veoVolumeOverridePct ?? 0)));
      const useNativeVideoAudio = entry?.useNativeVideoAudio === true || veoVolumePct > 0.0001;
      const videoAsset = entry?.video && typeof entry.video === "object" ? entry.video : {};
      const isImageAssetOriginal = (() => {
        const isImageAsset = String(videoAsset?.mediaKind || videoAsset?.type || "").trim().toLowerCase() === "image"
          || String(videoAsset?.mimeType || "").trim().toLowerCase().startsWith("image/");
        return isImageAsset;
      })();
      const isImageAsset = isImageAssetOriginal
        || /\.(jpg|jpeg|png|webp|gif|avif)(?:[?#&]|$)/i.test(videoAsset?.storagePath || videoAsset?.url || "")
        || /\/api\/assets\/proxy-image\?/i.test(videoAsset?.storagePath || videoAsset?.url || "");
      const audioAsset = entry?.audio && typeof entry.audio === "object" ? entry.audio : null;

      if (!rowId) {
        const err = new Error(`Entrada inválida (rowId) en índice ${i}.`);
        err.status = 400;
        throw err;
      }
      if (!videoAsset?.storagePath && !videoAsset?.url && !videoAsset?.dataUrl && !videoAsset?.localDataUrl) {
        skippedEntries.push(buildMontageSkippedEntry(entry, i, "missing_video_source", {
          kind: isImageAsset ? "image" : "video",
          code: "missing_download_source",
          index: i,
          lastError: `Escena ${sceneIndex} sin ${isImageAsset ? "imagen" : "video"} fuente para exportar.`
        }));
        continue;
      }

      console.info("[backend][montage-export][scene-prepare]", {
        jobId,
        sceneIndex,
        rowId,
        totalScenes: input.entries.length,
        mediaKind: isImageAsset ? "image" : "video",
        videoStoragePath: clampText(videoAsset?.storagePath || "", 900),
        videoDownloadUrl: redactUrlForLogs(String(videoAsset?.downloadUrl || videoAsset?.url || "").trim()),
        videoHasDataUrl: Boolean(String(videoAsset?.dataUrl || videoAsset?.localDataUrl || "").trim()),
        audioStoragePath: clampText(audioAsset?.storagePath || "", 900),
        audioDownloadUrl: redactUrlForLogs(String(audioAsset?.downloadUrl || audioAsset?.url || "").trim()),
        useNativeVideoAudio,
        veoVolumePct,
        trimInMs,
        durationMs
      });

      emitStage("render_scene_segments", 0.18 + ((i / Math.max(1, input.entries.length)) * 0.26), `Renderizando escena ${sceneIndex} de ${input.entries.length}.`, {
        currentSceneIndex: sceneIndex,
        currentRowId: rowId,
        totalScenes: input.entries.length
      });
      logMontageMemory("render_scene_before", { jobId, currentSceneIndex: sceneIndex, currentRowId: rowId });
      let currentSceneSubstage = isImageAsset ? "scene_download_image" : "scene_download_video";
      try {
        throwIfCancelled(`scene_${sceneIndex}_before_download`);
        const videoStoragePath = clampText(videoAsset?.storagePath || "", 900);
        const videoDownloadUrl = String(videoAsset?.downloadUrl || videoAsset?.url || "").trim();
        const sceneProgressBase = 0.18 + ((i / Math.max(1, input.entries.length)) * 0.26);
        const sceneStepStartMs = Date.now();
        emitSceneSubstage({
          sceneIndex,
          rowId,
          totalScenes: input.entries.length,
          substage: currentSceneSubstage,
          hint: `Descargando ${isImageAsset ? "imagen" : "video"} de la escena ${sceneIndex} de ${input.entries.length}.`,
          progress: sceneProgressBase,
          storagePath: videoStoragePath,
          downloadUrl: videoDownloadUrl
        });
        console.info("[backend][montage-export][scene-step-start]", buildMontageSceneTrace({
          jobId,
          sceneIndex,
          rowId,
          storagePath: videoStoragePath,
          downloadUrl: videoDownloadUrl,
          substage: currentSceneSubstage
        }));
        const inputVisualPath = await downloadInput(videoAsset, isImageAsset ? "image" : "video", i);
        throwIfCancelled(`scene_${sceneIndex}_after_download`);
        const downloadedVisualStat = await fs.promises.stat(inputVisualPath).catch(() => null);
        console.info("[backend][montage-export][scene-step-finish]", buildMontageSceneTrace({
          jobId,
          sceneIndex,
          rowId,
          storagePath: videoStoragePath,
          downloadUrl: videoDownloadUrl,
          substage: currentSceneSubstage,
          elapsedMs: Date.now() - sceneStepStartMs,
          extra: {
            localPath: inputVisualPath,
            sizeBytes: Number(downloadedVisualStat?.size || 0) || 0,
            mediaKind: isImageAsset ? "image" : "video"
          }
        }));
        const forceSilentAudio = input.useTimelineAudio === true && !useNativeVideoAudio;
        const inputAudioPath = (!forceSilentAudio && !useNativeVideoAudio && audioAsset) ? await downloadInput(audioAsset, "audio", i) : "";
        const intermediatePath = path.join(tmpDir, `scene-${String(sceneIndex).padStart(3, "0")}.${outExt}`);
        const visualLayoutMode = String(entry?.visualLayoutMode || "").trim().toLowerCase() === "blur-backdrop"
          ? "blur-backdrop"
          : "default";
        currentSceneSubstage = isImageAsset ? "scene_probe_dimensions" : "scene_probe_audio";
        emitSceneSubstage({
          sceneIndex,
          rowId,
          totalScenes: input.entries.length,
          substage: currentSceneSubstage,
          hint: isImageAsset
            ? `Analizando dimensiones de la escena ${sceneIndex} de ${input.entries.length}.`
            : `Analizando audio y dimensiones de la escena ${sceneIndex} de ${input.entries.length}.`,
          progress: sceneProgressBase + 0.015,
          storagePath: videoStoragePath,
          downloadUrl: videoDownloadUrl
        });
        console.info("[backend][montage-export][scene-step-start]", buildMontageSceneTrace({
          jobId,
          sceneIndex,
          rowId,
          storagePath: videoStoragePath,
          downloadUrl: videoDownloadUrl,
          substage: currentSceneSubstage
        }));
        const sceneProbeStartMs = Date.now();
        const sceneProbe = isImageAsset
          ? { dimensions: await probeImageDimensionsWithFfmpeg(inputVisualPath, `montage_scene_probe_image_${sceneIndex}`), hasAudio: false }
          : await probeSceneMediaMetadataWithFfmpeg(inputVisualPath, {
            label: `montage_scene_probe_${sceneIndex}`,
            hasAudio: true
          });
        throwIfCancelled(`scene_${sceneIndex}_after_probe`);
        const sourceDims = sceneProbe.dimensions;
        const videoHasAudio = sceneProbe.hasAudio;
        console.info("[backend][montage-export][scene-step-finish]", buildMontageSceneTrace({
          jobId,
          sceneIndex,
          rowId,
          storagePath: videoStoragePath,
          downloadUrl: videoDownloadUrl,
          substage: currentSceneSubstage,
          elapsedMs: Date.now() - sceneProbeStartMs,
          extra: {
            ...sourceDims,
            videoHasAudio
          }
        }));
        if (!globalCanvas) {
          globalCanvas = resolveMontageCanvasSize(
            sourceDims?.width || 1280,
            sourceDims?.height || 720,
            input?.resolution || "source",
            input?.reelModeEnabled === true
          );
        }
        const canvas = globalCanvas;
        const mediaScale = normalizeMontageMediaScale(entry?.mediaScale || entry?.clip?.mediaScale || 1);
        const mediaOffsetXPct = normalizeMontageMediaOffset(entry?.mediaOffsetXPct || entry?.clip?.mediaOffsetXPct || 0);
        const mediaOffsetYPct = normalizeMontageMediaOffset(entry?.mediaOffsetYPct || entry?.clip?.mediaOffsetYPct || 0);
        const mediaMotionPreset = normalizeMontageMediaMotionPreset(entry?.mediaMotionPreset || entry?.clip?.mediaMotionPreset || "none");
        const args = ["-y", "-hide_banner", "-loglevel", "warning"];
        if (isImageAsset) {
          args.push("-loop", "1", "-framerate", "24", "-i", inputVisualPath);
        } else {
          args.push("-i", inputVisualPath);
        }
        
        // Input 1: anullsrc como fallback universal para asegurar pista de audio
        args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000");
        
        if (!forceSilentAudio && !useNativeVideoAudio && inputAudioPath) {
          args.push("-i", inputAudioPath);
        }

        const veoVolume = (veoVolumePct / 100).toFixed(3);
        
        // Mapeo de audio dinámico para asegurar consistencia en concat
        let audioMapLabel = "[aout]";
        let audioFilterGraph = "";
        
        if (forceSilentAudio) {
          audioFilterGraph = `[1:a]volume=1.0,aresample=48000,aformat=sample_rates=48000:channel_layouts=stereo[aout]`;
        } else if (!useNativeVideoAudio && inputAudioPath) {
          audioFilterGraph = `[2:a]volume=1.0,aresample=48000,aformat=sample_rates=48000:channel_layouts=stereo[aout]`;
        } else if (useNativeVideoAudio && videoHasAudio) {
          // Normalizamos a -16 LUFS antes de aplicar el volumen del usuario para consistencia
          audioFilterGraph = `[0:a:0]loudnorm=I=-16:TP=-1.5:LRA=11,volume=${veoVolume},aresample=48000,aformat=sample_rates=48000:channel_layouts=stereo[v];[v][1:a]amix=inputs=2:duration=first:dropout_transition=0.05:normalize=0[aout]`;
        } else {
          audioFilterGraph = `[1:a]volume=1.0,aresample=48000,aformat=sample_rates=48000:channel_layouts=stereo[aout]`;
        }

        if (isImageAsset) {
          args.push("-t", String(durSec));
        } else {
          args.push("-ss", String(trimSec), "-t", String(durSec));
        }
        
        // Filtro de video para asegurar duración exacta (tpad congela el último frame si el video es corto)
        const visualEffects = normalizeMontageVisualEffects(entry?.visualEffects || null);
        const sceneTimelineStartMs = Math.max(0, Math.round(Number(entry?.timelineStartMs || 0) || 0));
        const sceneTimelineEndMs = Math.max(sceneTimelineStartMs + 1, Math.round(Number(entry?.timelineEndMs || (sceneTimelineStartMs + durationMs)) || (sceneTimelineStartMs + durationMs)));
        const sceneReelModeEnabled = input?.reelModeEnabled === true || isMontageReelResolution(input?.resolution || "");
        let videoFilterGraph = "";
        if (!isImageAsset && visualLayoutMode === "blur-backdrop") {
          videoFilterGraph = buildMontageVideoSceneFilter({
            inputLabel: "[0:v]",
            outputLabel: "vout",
            canvas,
            sourceWidth: sourceDims?.width || canvas.width,
            sourceHeight: sourceDims?.height || canvas.height,
            durationSec: durSec,
            scaleFilter,
            reelMode: sceneReelModeEnabled,
            visualLayoutMode,
            mediaScale,
            mediaOffsetXPct,
            mediaOffsetYPct,
            mediaMotionPreset
          });
        } else {
          videoFilterGraph = isImageAsset
            ? buildMontageImageMotionVideoFilter({
              inputLabel: "[0:v]",
              outputLabel: "vout",
              canvas,
              sourceWidth: sourceDims?.width || canvas.width,
              sourceHeight: sourceDims?.height || canvas.height,
              durationSec: durSec,
              reelMode: sceneReelModeEnabled,
              visualLayoutMode,
              visualEffects,
              mediaScale,
              mediaOffsetXPct,
              mediaOffsetYPct,
              mediaMotionPreset
            })
            : buildMontageVideoSceneFilter({
              inputLabel: "[0:v]",
              outputLabel: "vout",
              canvas,
              sourceWidth: sourceDims?.width || canvas.width,
              sourceHeight: sourceDims?.height || canvas.height,
              durationSec: durSec,
              scaleFilter,
              reelMode: sceneReelModeEnabled,
              visualLayoutMode,
              mediaScale,
              mediaOffsetXPct,
              mediaOffsetYPct,
              mediaMotionPreset
            });
        }

        let finalVideoMapLabel = "[vout]";
        if (shouldBurnSceneOnScreenText) {
          const textOverlayResult = await appendMontageSceneOnScreenTextAssFilters({
            input,
            entry,
            sceneIndex,
            sceneTimelineStartMs,
            sceneTimelineEndMs,
            canvas,
            videoFilterGraph,
            baseVideoMapLabel: finalVideoMapLabel,
            tmpDir
          });
          videoFilterGraph = textOverlayResult.videoFilterGraph;
          finalVideoMapLabel = textOverlayResult.finalVideoMapLabel;
        }


        args.push("-filter_complex", `${videoFilterGraph};${audioFilterGraph}`);
        args.push("-map", finalVideoMapLabel, "-map", audioMapLabel);
        args.push("-r", "24", "-c:v", intermediateParams.vCodec);
        args.push(...intermediateParams.vArgs, "-pix_fmt", "yuv420p", "-c:a", intermediateParams.aCodec, "-ar", "48000", ...intermediateParams.aArgs, intermediatePath);
        emitSceneSubstage({
          sceneIndex,
          rowId,
          totalScenes: input.entries.length,
          substage: "scene_ffmpeg_render",
          hint: `Renderizando video de la escena ${sceneIndex} de ${input.entries.length}.`,
          progress: sceneProgressBase + 0.05,
          storagePath: videoStoragePath,
          downloadUrl: videoDownloadUrl
        });
        console.info("[backend][montage-export][scene-step-start]", buildMontageSceneTrace({
          jobId,
          sceneIndex,
          rowId,
          storagePath: videoStoragePath,
          downloadUrl: videoDownloadUrl,
          substage: "scene_ffmpeg_render"
        }));
        const renderStartMs = Date.now();
        currentSceneSubstage = "scene_ffmpeg_render";
        throwIfCancelled(`scene_${sceneIndex}_before_render`);
        await runFfmpegCommand(args, {
          stage: `montage_scene_${sceneIndex}`,
          timeoutMs: MONTAGE_EXPORT_SCENE_RENDER_TIMEOUT_MS,
          timeoutCode: "scene_render_timeout",
          shouldAbort: () => shouldAbort(),
          heartbeatIntervalMs: MONTAGE_EXPORT_FFMPEG_HEARTBEAT_MS,
          onHeartbeat: ({ elapsedMs = 0, stderr = "", stdout = "" } = {}) => {
            emitSceneSubstage({
              sceneIndex,
              rowId,
              totalScenes: input.entries.length,
              substage: "scene_ffmpeg_render",
              hint: `Renderizando video de la escena ${sceneIndex} de ${input.entries.length}.`,
              progress: sceneProgressBase + 0.05,
              storagePath: videoStoragePath,
              downloadUrl: videoDownloadUrl
            });
            console.info("[backend][montage-export][scene-step-heartbeat]", buildMontageSceneTrace({
              jobId,
              sceneIndex,
              rowId,
              storagePath: videoStoragePath,
              downloadUrl: videoDownloadUrl,
              substage: "scene_ffmpeg_render",
              elapsedMs,
              extra: {
                stderrPreview: buildMontageStderrPreview(stderr),
                stdoutPreview: buildMontageStderrPreview(stdout, 4, 300)
              }
            }));
          }
        });
        throwIfCancelled(`scene_${sceneIndex}_after_render`);
        const renderedSceneStat = await fs.promises.stat(intermediatePath).catch(() => null);
        console.info("[backend][montage-export][scene-step-finish]", buildMontageSceneTrace({
          jobId,
          sceneIndex,
          rowId,
          storagePath: videoStoragePath,
          downloadUrl: videoDownloadUrl,
          substage: "scene_ffmpeg_render",
          elapsedMs: Date.now() - renderStartMs,
          extra: {
            outputPath: intermediatePath,
            outputSizeBytes: Number(renderedSceneStat?.size || 0) || 0
          }
        }));
        intermediatePaths.push(intermediatePath);
        exportedEntries.push({
          sceneIndex,
          rowId,
          intermediatePath,
          zIndex: Math.max(1, Math.round(Number(entry?.zIndex || sceneIndex) || sceneIndex)),
          durationSec: durSec,
          durationMs,
          mediaScale,
          mediaOffsetXPct,
          mediaOffsetYPct,
          mediaMotionPreset,
          visualLayoutMode,
          timelineStartMs: Math.max(0, Math.round(Number(entry?.timelineStartMs || 0) || 0)),
          timelineEndMs: Math.max(0, Math.round(Number(entry?.timelineEndMs || 0) || 0)),
          voiceOverText: clampText(entry?.voiceOverText || "", 1600),
          sceneDescription: clampText(entry?.sceneDescription || "", 1600),
          onScreenText: clampText(entry?.onScreenText || "", 600),
          visualNotes: clampText(entry?.visualNotes || "", 2200),
          videoDirective: clampText(entry?.videoDirective || "", 2200),
          useNativeVideoAudio,
          veoVolumeOverridePct: veoVolumePct,
          visualEffects,
          transitionOut: normalizeMontageTransition(entry?.transitionOut || null)
        });
        emitSceneSubstage({
          sceneIndex,
          rowId,
          totalScenes: input.entries.length,
          substage: "scene_complete",
          hint: `Escena ${sceneIndex} lista.`,
          progress: sceneProgressBase + 0.07,
          storagePath: videoStoragePath,
          downloadUrl: videoDownloadUrl
        });
        logMontageMemory("render_scene_after", { jobId, currentSceneIndex: sceneIndex, currentRowId: rowId });
      } catch (error) {
        error.detail = {
          ...(error?.detail && typeof error.detail === "object" ? error.detail : {}),
          failedSceneIndex: sceneIndex,
          failedRowId: rowId,
          failedSubstage: String(error?.detail?.failedSubstage || currentSceneSubstage || error?.code || "").trim() || undefined
        };
        if (!shouldSkipMontageEntryError(error)) throw error;
        const detail = error?.detail && typeof error.detail === "object" ? error.detail : {};
        skippedEntries.push(buildMontageSkippedEntry(entry, i, String(error?.code || error?.message || "scene_asset_unavailable"), {
          ...detail,
          code: String(error?.code || "").trim(),
          index: Number(detail?.index || i) || i,
          lastError: String(detail?.lastError || detail?.message || error?.message || "").trim()
        }));
      }
    }

    if (!intermediatePaths.length) {
      const err = new Error("No hay escenas válidas para exportar.");
      err.status = 404;
      err.code = "montage_no_valid_entries";
      err.detail = { skippedEntries };
      throw err;
    }

    let reviewCursorMs = 0;
    exportedEntries.forEach((entry) => {
      const reviewDurationMs = Math.max(500, Math.round(Number(entry?.durationMs || 0) || (Number(entry?.durationSec || 0) * 1000) || 500));
      entry.reviewStartMs = reviewCursorMs;
      entry.reviewEndMs = reviewCursorMs + reviewDurationMs;
      entry.timelineLabel = formatMontageReviewTimelineRange(entry?.timelineStartMs || 0, entry?.timelineEndMs || 0, reviewDurationMs);
      reviewCursorMs = entry.reviewEndMs;
    });
    const montageTotalDurationMs = reviewCursorMs;

    const overlapPlan = buildMontageOverlapCompositionPlan(exportedEntries);
    let concatOutPath = "";
    emitStage("concat_timeline", 0.48, (overlapPlan.hasOverlap || overlapPlan.hasGaps) ? "Componiendo escenas con transiciones o huecos en el timeline." : "Uniendo escenas en un solo timeline.");
    logMontageMemory("concat_timeline_start", { jobId, exportedSceneCount: exportedEntries.length });
    throwIfCancelled("concat_timeline");
    if (overlapPlan.hasOverlap) {
      concatOutPath = await renderMontageOverlapComposition({
        input,
        tmpDir,
        params: intermediateParams,
        outExt,
        intermediatePaths,
        exportedEntries
      });
    }
    if (!concatOutPath) {
      const concatSequencePaths = overlapPlan.hasGaps
        ? await buildMontageGapAwareConcatSequence({
          plan: overlapPlan,
          tmpDir,
          outExt,
          params: intermediateParams,
          canvas: globalCanvas
        })
        : intermediatePaths;
      const concatListPath = path.join(tmpDir, "concat-list.txt");
      await fs.promises.writeFile(concatListPath, concatSequencePaths.map((p) => `file '${String(p).replace(/'/g, "'\\''")}'`).join("\n") + "\n", "utf8");
      concatOutPath = path.join(tmpDir, `montage-concat.${outExt}`);
      await runFfmpegCommand([
        "-y", "-hide_banner", "-loglevel", "warning",
        "-fflags", "+genpts",
        "-f", "concat", "-safe", "0", "-i", concatListPath,
        "-c:v", "copy", "-c:a", "copy",
        ...(outExt === "mp4" ? ["-movflags", "+faststart"] : []),
        concatOutPath
      ], { stage: "montage_concat", shouldAbort: () => shouldAbort() });
    }
    logMontageMemory("concat_timeline_after", { jobId, exportedSceneCount: exportedEntries.length });

    const exportOffsetsByRowId = new Map();
    const overlapAwareEntries = overlapPlan.entries.length ? overlapPlan.entries : exportedEntries;
    let cursorMs = 0;
    overlapAwareEntries.forEach((entry) => {
      const rowId = String(entry?.rowId || "").trim();
      const durationMs = Math.max(500, Math.round(Number(entry?.durationMs || 0) || 0));
      if (rowId) {
        exportOffsetsByRowId.set(String(entry.rowId || "").trim(), {
          // startMs: cursorMs
          startMs: (overlapPlan.hasOverlap || overlapPlan.hasGaps)
            ? Math.max(0, Math.round(Number(entry?.timelineStartMs || 0) || 0))
            : cursorMs,
          durationMs,
          timelineStartMs: Math.max(0, Math.round(Number(entry?.timelineStartMs || 0) || 0))
        });
      }
      cursorMs += (overlapPlan.hasOverlap || overlapPlan.hasGaps) ? 0 : durationMs;
    });

    const exportedDurationSec = (overlapPlan.hasOverlap || overlapPlan.hasGaps)
      ? Math.max(0.5, overlapPlan.totalDurationMs / 1000)
      : exportedEntries.reduce((acc, item) => acc + Math.max(0, Number(item?.durationSec || 0)), 0);
    let finalOutPath = concatOutPath;

    const reviewOnScreenTextEnabled = input.exportMode === "review" && Boolean(input.onScreenTextSettings && input.onScreenTextSegments.length);
    const overlayCardSegments = Array.isArray(input.overlayCards?.segments)
      ? input.overlayCards.segments
      : (Array.isArray(input.overlayCards) ? input.overlayCards : []);
    const hasBrandOverlay = input.brandOverlay?.enabled === true && input.brandOverlay?.assetPath && fs.existsSync(path.resolve(process.cwd(), String(input.brandOverlay.assetPath || "").trim()));
    const shouldAttemptBrowserRenderer = shouldUseBrowserMontageRenderer(input);
    const hasBrowserVisualPass = false;
    const hasFinalVisualPass = Boolean(
      reviewOnScreenTextEnabled
      || overlayCardSegments.length
      || (input.exportMode === "review" && exportedEntries.length)
      || hasBrandOverlay
    );
    console.info("[backend][montage-export][visual-pass-decision]", {
      hasFinalVisualPass,
      hasBrowserVisualPass,
      renderMode: normalizeMontageRenderMode(input.renderMode || "browser"),
      browserVisualPassDisabled: shouldAttemptBrowserRenderer,
      reviewOnScreenTextEnabled,
      hasTextSegments: Boolean(input.onScreenTextSettings && input.onScreenTextSegments.length),
      overlayCardCount: overlayCardSegments.length,
      exportMode: input.exportMode,
      entryCount: Array.isArray(input.entries) ? input.entries.length : 0,
      hasBrandOverlay
    });
    let browserVisualCompleted = false;
    if (hasBrowserVisualPass) {
      try {
        finalOutPath = await renderMontageBrowserFinalVisualPass({
          input: {
            ...input,
            overlayCards: overlayCardSegments
          },
          finalOutPath,
          tmpDir,
          outExt,
          deliveryParams,
          emitStage,
          shouldAbort
        });
        browserVisualCompleted = true;
      } catch (browserRenderError) {
        console.warn("[backend][montage-export][browser-render-fallback]", {
          jobId,
          message: String(browserRenderError?.message || browserRenderError),
          code: String(browserRenderError?.code || "").trim() || null
        });
      }
    }
    if (hasFinalVisualPass && !browserVisualCompleted) {
      const sourceDims = await probeMediaVideoDimensionsWithFfmpeg(finalOutPath, "montage_final_visuals_input").catch(() => ({ width: 1280, height: 720 }));
      const visualDims = input.exportMode === "review"
        ? resolveMontageReviewCanvasSize(input.resolution, sourceDims.width, sourceDims.height)
        : sourceDims;
      const visualFilters = [];
      let useFilterComplexForVisual = false;
      let currentLabel = "[0:v]";
      let filterIndex = 0;
      const filterSegments = [];

      if (reviewOnScreenTextEnabled) {
        emitStage("apply_onscreen_text", 0.8, "Aplicando texto en pantalla y capas finales.");
        const onScreenTextSettings = {
          ...input.onScreenTextSettings,
          partyKaraoke: input.partyKaraoke !== false
        };
        const effectiveRenderedSegments = Array.isArray(input.onScreenTextSegments)
          ? input.onScreenTextSegments
          : [];
        const renderedOnScreenTextSegmentMap = buildMontageOnScreenTextRenderedSegmentMap(input.onScreenTextRenderedSegments || []);

        // Review mode: Original drawtext-based burning
        const textFileResolver = createMontageReviewTextFileResolver(tmpDir, "onscreen-drawtext");
        const boxSegments = effectiveRenderedSegments.map((segment) => {
          const layout = normalizeMontageOnScreenTextExportLayout({
            segment,
            settings: onScreenTextSettings,
            resolution: input.resolution || "source",
            sourceDims
          });
          const spec = resolveOnScreenTextRenderSpec({
            settings: onScreenTextSettings,
            layout,
            resolution: input.resolution || "source",
            sourceWidth: sourceDims.width,
            sourceHeight: sourceDims.height,
            text: segment.text || "",
            fallback: ""
          });
          return {
            startSec: Math.max(0, Number(segment.startMs || 0) / 1000),
            endSec: Math.max(0, Number(segment.startMs || 0) / 1000) + Math.max(0.1, Number(segment.durationMs || 0) / 1000),
            spec
          };
        });
        const boxFilters = buildMontageOnScreenTextKaraokeBoxFilters(boxSegments, onScreenTextSettings, {
          sourceWidth: sourceDims.width,
          sourceHeight: sourceDims.height
        });

        if (boxFilters.length) {
          for (const boxFilter of boxFilters) {
            filterIndex += 1;
            const outLabel = `[ontxt_box_${filterIndex}]`;
            filterSegments.push(`${currentLabel}${boxFilter}${outLabel}`);
            currentLabel = outLabel;
          }
        }

        const assSegments = effectiveRenderedSegments.map((segment) => {
          const layout = normalizeMontageOnScreenTextExportLayout({
            segment,
            settings: onScreenTextSettings,
            resolution: input.resolution || "source",
            sourceDims
          });
          const spec = resolveOnScreenTextRenderSpec({
            settings: onScreenTextSettings,
            layout,
            resolution: input.resolution || "source",
            sourceWidth: sourceDims.width,
            sourceHeight: sourceDims.height,
            text: segment.text || "",
            fallback: ""
          });
          const startSec = Math.max(0, Number(segment.startMs || 0) / 1000);
          const endSec = startSec + Math.max(0.1, Number(segment.durationMs || 0) / 1000);
          const audioClip = input.dialogueAudioMap?.[segment.rowId] || null;
          let wordTimings = input.partyKaraoke !== false ? normalizeKaraokeWordTimings(audioClip, String(spec.wrappedText || spec.text || "").trim()) : [];
          const playbackRate = Math.max(0.5, Math.min(10, Number(segment.playbackRate || audioClip?.playbackRate || 1) || 1));
          return {
            startSec,
            endSec,
            wordTimings,
            playbackRate,
            spec,
            settings: onScreenTextSettings
          };
        }).filter((segment) => String(segment?.spec?.wrappedText || segment?.spec?.text || "").trim());

        const assContent = buildMontageOnScreenTextAss({
          width: sourceDims.width,
          height: sourceDims.height,
          settings: onScreenTextSettings,
          segments: assSegments
        });

        if (String(assContent || "").trim()) {
          const assPath = path.join(tmpDir, `montage_onscreen_text.ass`);
          fs.writeFileSync(assPath, assContent, "utf8");
          filterIndex += 1;
          const outLabel = `[ontxt_ass_${filterIndex}]`;
          filterSegments.push(`${currentLabel}ass='${escapeFfmpegFilterPath(assPath)}'${outLabel}`);
          currentLabel = outLabel;
        }

        useFilterComplexForVisual = true;
      }

      let reviewFilter = "";
      if (input.exportMode === "review" && exportedEntries.length) {
        emitStage("apply_review_layout", 0.88, "Componiendo layout de revisión.");
        const reviewTextFileResolver = createMontageReviewTextFileResolver(tmpDir, "review-export");
        reviewFilter = buildMontageReviewVideoFilter(exportedEntries, {
          width: visualDims.width,
          height: visualDims.height,
          montageTotalDurationMs,
          globalCounterMode: "dynamic",
          textFileResolver: reviewTextFileResolver
        });
      }

      if (overlayCardSegments.length) {
        emitStage("apply_overlay_cards", 0.9, "Aplicando cards animadas.");
        const overlayCardsFilter = buildMontageOverlayCardsFilter({
          cards: overlayCardSegments,
          width: visualDims.width,
          height: visualDims.height,
          tmpDir
        });
        if (overlayCardsFilter) {
          filterIndex += 1;
          const outLabel = `[cards_${filterIndex}]`;
          filterSegments.push(`${currentLabel}${overlayCardsFilter}${outLabel}`);
          currentLabel = outLabel;
          useFilterComplexForVisual = true;
        }
      }

      if (hasBrandOverlay) {
        const brandFilterComplex = buildMontageBrandOverlayFilter(input.brandOverlay, {
          width: visualDims.width,
          height: visualDims.height,
          reelModeEnabled: input.reelModeEnabled === true,
          baseInputLabel: currentLabel,
          outputLabel: `brand_out_${filterIndex + 1}`
        });
        if (brandFilterComplex) {
          filterIndex += 1;
          filterSegments.push(brandFilterComplex);
          currentLabel = `[brand_out_${filterIndex}]`;
          useFilterComplexForVisual = true;
        }
      }

      if (useFilterComplexForVisual && filterSegments.length) {
        filterSegments.push(`${currentLabel}format=yuv420p[vout]`);
        visualFilters.push(filterSegments.join(";"));
      }

      if (reviewFilter || visualFilters.length) {
        emitStage("encode_delivery", 0.96, "Codificando archivo final con la calidad de exportación.");
        const finalVisualOutPath = path.join(tmpDir, `montage-final-visuals.${outExt}`);
        const finalVisualArgs = [
          "-y", "-hide_banner", "-loglevel", "warning",
          "-i", finalOutPath
        ];
        const isReviewVisualPass = Boolean(reviewFilter && input.exportMode === "review");
        const baseVideoChain = isReviewVisualPass
          ? reviewFilter
          : (visualFilters.join(",") || "format=rgba");
        let filterGraph = baseVideoChain;
        if (!isReviewVisualPass && useFilterComplexForVisual) {
          finalVisualArgs.push("-filter_complex", baseVideoChain);
          finalVisualArgs.push("-map", "[vout]");
        } else {
          finalVisualArgs.push("-vf", baseVideoChain);
          finalVisualArgs.push("-map", "0:v:0");
        }
        finalVisualArgs.push(
          "-map", "0:a:0?",
          "-c:v", deliveryParams.vCodec,
          ...deliveryParams.vArgs,
          "-pix_fmt", "yuv420p",
          "-c:a", deliveryParams.aCodec,
          "-ar", "48000",
          ...deliveryParams.aArgs,
          finalVisualOutPath
        );
        console.info("[backend][montage-export][final-visual-ffmpeg]", {
          hasReviewFilter: Boolean(reviewFilter),
          baseVideoChain,
          filterGraph,
          args: finalVisualArgs
        });
        throwIfCancelled("montage_final_visuals");
        await runFfmpegCommand(finalVisualArgs, {
          stage: "montage_final_visuals",
          shouldAbort: () => shouldAbort(),
          heartbeatIntervalMs: MONTAGE_EXPORT_FFMPEG_HEARTBEAT_MS,
          onHeartbeat: ({ elapsedMs = 0, stderr = "", stdout = "" } = {}) => {
            emitStage("apply_onscreen_text", 0.8, "Aplicando texto en pantalla y capas finales.", {
              lastHeartbeatAt: new Date().toISOString()
            });
            console.info("[backend][montage-export][ffmpeg-stage-heartbeat]", {
              jobId,
              stage: "montage_final_visuals",
              elapsedMs,
              stderrPreview: buildMontageStderrPreview(stderr),
              stdoutPreview: buildMontageStderrPreview(stdout, 4, 300)
            });
          }
        });
        finalOutPath = finalVisualOutPath;
      } else {
        emitStage("encode_delivery", 0.96, "Codificando archivo final con la calidad de exportación.");
        const deliveryOutPath = path.join(tmpDir, `montage-delivery.${outExt}`);
        throwIfCancelled("montage_encode_delivery");
        await runFfmpegCommand([
          "-y", "-hide_banner", "-loglevel", "warning",
          "-i", finalOutPath,
          "-map", "0:v:0",
          "-map", "0:a:0?",
          "-c:v", deliveryParams.vCodec,
          ...deliveryParams.vArgs,
          "-pix_fmt", "yuv420p",
          "-c:a", deliveryParams.aCodec,
          "-ar", "48000",
          ...deliveryParams.aArgs,
          deliveryOutPath
        ], {
          stage: "montage_encode_delivery",
          shouldAbort: () => shouldAbort(),
          heartbeatIntervalMs: MONTAGE_EXPORT_FFMPEG_HEARTBEAT_MS,
          onHeartbeat: ({ elapsedMs = 0, stderr = "", stdout = "" } = {}) => {
            emitStage("encode_delivery", 0.96, "Codificando archivo final con la calidad de exportación.", {
              lastHeartbeatAt: new Date().toISOString()
            });
            console.info("[backend][montage-export][ffmpeg-stage-heartbeat]", {
              jobId,
              stage: "montage_encode_delivery",
              elapsedMs,
              stderrPreview: buildMontageStderrPreview(stderr),
              stdoutPreview: buildMontageStderrPreview(stdout, 4, 300)
            });
          }
        });
        finalOutPath = deliveryOutPath;
      }
    } else {
      emitStage("encode_delivery", 0.96, "Codificando archivo final con la calidad de exportación.");
      const deliveryOutPath = path.join(tmpDir, `montage-delivery.${outExt}`);
      throwIfCancelled("montage_encode_delivery");
      await runFfmpegCommand([
        "-y", "-hide_banner", "-loglevel", "warning",
        "-i", finalOutPath,
        "-map", "0:v:0",
        "-map", "0:a:0?",
        "-c:v", deliveryParams.vCodec,
        ...deliveryParams.vArgs,
        "-pix_fmt", "yuv420p",
        "-c:a", deliveryParams.aCodec,
        "-ar", "48000",
        ...deliveryParams.aArgs,
        deliveryOutPath
      ], {
        stage: "montage_encode_delivery",
        shouldAbort: () => shouldAbort(),
        heartbeatIntervalMs: MONTAGE_EXPORT_FFMPEG_HEARTBEAT_MS,
        onHeartbeat: ({ elapsedMs = 0, stderr = "", stdout = "" } = {}) => {
          emitStage("encode_delivery", 0.96, "Codificando archivo final con la calidad de exportación.", {
            lastHeartbeatAt: new Date().toISOString()
          });
          console.info("[backend][montage-export][ffmpeg-stage-heartbeat]", {
            jobId,
            stage: "montage_encode_delivery",
            elapsedMs,
            stderrPreview: buildMontageStderrPreview(stderr),
            stdoutPreview: buildMontageStderrPreview(stdout, 4, 300)
          });
        }
      });
      finalOutPath = deliveryOutPath;
    }

    finalOutPath = await finalizeMontageExportAudioTrack({
      input,
      finalOutPath,
      tmpDir,
      outExt,
      exportedDurationSec,
      exportOffsetsByRowId,
      emitStage,
      shouldAbort,
      downloadInput,
      jobId
    });

    if (context?.previewOnly === true) {
      const previewBuffer = await fs.promises.readFile(finalOutPath);
      return {
        previewBuffer,
        previewMimeType: getMontageExportMimeType(input?.format || "mp4_h264"),
        exportedEntries
      };
    }

    emitStage("upload_result", 0.98, "Subiendo archivo final.");
    logMontageMemory("cache_output_start", { jobId, exportedSceneCount: exportedEntries.length });
    const stored = await storeMontageExportResult(finalOutPath, input, context);
    logMontageMemory("cache_output_after", { jobId, exportId: String(stored?.exportId || "").trim() });
    emitStage("finalize_result", 0.99, "Finalizando entrega del archivo.");
    return {
      export: {
        filename: stored.filename,
        mimeType: stored.mimeType,
        storagePath: stored.storagePath,
        downloadUrl: stored.downloadUrl,
        downloadToken: stored.downloadToken,
        sizeBytes: stored.sizeBytes,
        createdAt: stored.createdAtIso,
        expiresAt: stored.expiresAtIso,
        exportId: stored.exportId
      },
      downloadUrl: stored.downloadUrl,
      warnings: skippedEntries.length ? {
        skippedEntries,
        requestedSceneCount: input.entries.length,
        exportedSceneCount: exportedEntries.length
      } : undefined,
      exportedEntries
    };
  } finally {
    if (tmpDir) {
      await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

async function renderMontagePreviewImage(rawInput = {}, context = {}) {
  const input = rawInput && typeof rawInput === "object" ? rawInput : {};
  const uid = String(context?.uid || "").trim();
  validateMontageExportRequest(input);
  const previewEntries = Array.isArray(input.entries) ? input.entries.slice() : [];
  const targetIndex = Math.max(0, previewEntries.findIndex((entry) => String(entry?.rowId || "").trim() === String(input.previewRowId || "").trim()));
  const targetEntry = previewEntries[targetIndex] || previewEntries[0];
  const montageTotalDurationMs = previewEntries.reduce((acc, entry) => acc + Math.max(500, Math.round(Number(entry?.durationMs || 0) || 0)), 0);
  const globalCounterCurrentMs = previewEntries
    .slice(0, Math.max(0, targetIndex))
    .reduce((acc, entry) => acc + Math.max(500, Math.round(Number(entry?.durationMs || 0) || 0)), 0);
  const tmpDir = path.join(os.tmpdir(), `cb-montage-preview-${randomUUID()}`);
  await fs.promises.mkdir(tmpDir, { recursive: true });
  try {
    const downloadInput = createMontageAssetDownloader({ tmpDir, uid, sessionId: input.sessionId });
    const inputVideoPath = await downloadInput(targetEntry?.video || {}, "video", 0);
    const trimSec = Math.max(0, Number(targetEntry?.trimInMs || 0) / 1000);
    const sourceDims = await probeMediaVideoDimensionsWithFfmpeg(inputVideoPath, "montage_preview_input").catch(() => ({ width: 1280, height: 720 }));
    const previewCanvas = input.exportMode === "review"
      ? resolveMontageReviewCanvasSize(input.resolution, sourceDims.width, sourceDims.height)
      : resolveMontageCanvasSize(sourceDims.width, sourceDims.height, input.resolution, input.reelModeEnabled === true);
    const previewPath = path.join(tmpDir, "preview.jpg");
    const baseFilter = input.exportMode === "review"
      ? buildMontageReviewVideoFilter([{
        ...targetEntry,
        reviewStartMs: 0,
        reviewEndMs: Math.max(1000, Number(targetEntry?.durationMs || 4000) || 4000),
        timelineLabel: formatMontageReviewTimelineRange(targetEntry?.timelineStartMs || 0, targetEntry?.timelineEndMs || 0, targetEntry?.durationMs || 0),
        visualNotes: clampText(targetEntry?.visualNotes || "", 2200)
      }], {
        width: previewCanvas.width,
        height: previewCanvas.height,
        montageTotalDurationMs,
        globalCounterMode: "static",
        globalCounterCurrentMs,
        textFileResolver: createMontageReviewTextFileResolver(tmpDir, "review-preview")
      })
      : `scale=${previewCanvas.width}:${previewCanvas.height}:force_original_aspect_ratio=increase,crop=${previewCanvas.width}:${previewCanvas.height},setsar=1`;
    await runFfmpegCommand([
      "-y", "-hide_banner", "-loglevel", "warning",
      "-ss", String(trimSec), "-i", inputVideoPath,
      "-frames:v", "1",
      "-vf", baseFilter,
      previewPath
    ], { stage: input.exportMode === "review" ? "montage_preview_review" : "montage_preview_normal" });
    const previewBuffer = await fs.promises.readFile(previewPath);
    const imageDataUrl = `data:image/jpeg;base64,${previewBuffer.toString("base64")}`;
    return {
      ok: true,
      mode: input.exportMode,
      sceneIndex: Math.max(1, Number(targetEntry?.sceneIndex || 1) || 1),
      rowId: String(targetEntry?.rowId || "").trim(),
      mediaType: "image/jpeg",
      previewDataUrl: imageDataUrl,
      imageDataUrl
    };
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function renderMontagePreviewMedia(rawInput = {}, context = {}) {
  const input = rawInput && typeof rawInput === "object" ? rawInput : {};
  const previewInput = buildMontagePreviewPipelineInput(input);
  const targetIndex = Math.max(0, previewInput.entries.findIndex((entry) => String(entry?.rowId || "").trim() === String(input.previewRowId || "").trim()));
  const targetEntry = previewInput.entries[targetIndex] || previewInput.entries[0] || {};
  try {
    const result = await executeMontageExportPipeline(previewInput, {
      uid: String(context?.uid || "").trim(),
      baseUrl: String(context?.baseUrl || "").trim(),
      previewOnly: true
    });
    const previewDataUrl = `data:${String(result?.previewMimeType || "video/mp4").trim()};base64,${Buffer.from(result?.previewBuffer || Buffer.alloc(0)).toString("base64")}`;
    return {
      ok: true,
      mode: previewInput.exportMode,
      sceneIndex: Math.max(1, Number(targetEntry?.sceneIndex || 1) || 1),
      rowId: String(targetEntry?.rowId || "").trim(),
      mediaType: String(result?.previewMimeType || "video/mp4").trim() || "video/mp4",
      previewDataUrl
    };
  } catch (error) {
    return renderMontagePreviewImage(input, context);
  }
}

app.post("/api/podcaster/montage/export", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const input = normalizeMontageExportRequestBody(req.body || {});
    console.info("[backend][montage-export][request-body]", {
      sessionId: String(input.sessionId || "").trim(),
      renderMode: normalizeMontageRenderMode(input.renderMode || "browser"),
      entryCount: Array.isArray(input.entries) ? input.entries.length : 0,
      onScreenTextSegments: Array.isArray(input.onScreenTextSegments) ? input.onScreenTextSegments.length : 0,
      onScreenTextRenderedSegments: Array.isArray(input.onScreenTextRenderedSegments) ? input.onScreenTextRenderedSegments.length : 0,
      overlayCardCount: Array.isArray(input.overlayCards?.segments) ? input.overlayCards.segments.length : (Array.isArray(input.overlayCards) ? input.overlayCards.length : 0),
      partyKaraoke: input.partyKaraoke !== false,
      onlyAudio: input.onlyAudio === true,
      includeLogo: input.brandOverlay?.enabled === true,
      exportMode: input.exportMode
    });
    validateMontageExportRequest(input);
    const jobId = clampExportId(randomUUID());
    const baseUrl = resolvePublicBaseUrl(req) || getBackendPublicBaseUrl() || `http://127.0.0.1:${PORT}`;
    const persistedRequest = sanitizeMontageExportPersistedRequest({
      input,
      baseUrl
    });
    const initial = await montageExportJobStore.createJob({
      jobId,
      sessionId: input.sessionId,
      ownerId: uid,
      request: persistedRequest,
      totalScenes: input.entries.length
    });
    upsertMontageExportJob(jobId, initial);

    if (montageExportQueue) {
      console.info("[backend][montage-export] Enqueuing export job to BullMQ:", jobId);
      try {
        await montageExportQueue.enqueueExportJob({
          jobId,
          sessionId: input.sessionId,
          ownerId: uid,
          input,
          baseUrl
        });
        return res.status(202).json(sanitizeMontageExportJobPublicPayload(initial));
      } catch (enqueueErr) {
        console.error("[backend][montage-export] Failed to enqueue to BullMQ, falling back to direct run:", enqueueErr.message || enqueueErr);
      }
    }

    const slot = tryAcquireHeavyWorkSlot("montage_export", jobId);
    if (!slot.ok) {
      const activeJobId = String(slot.error?.detail?.activeJobId || "").trim();
      if (activeJobId) {
        const activeJob = await resolveMontageExportJobSnapshot(activeJobId).catch(() => null);
        if (!activeJob) {
          releaseHeavyWorkSlot("montage_export", activeJobId);
          const retrySlot = tryAcquireHeavyWorkSlot("montage_export", jobId);
          if (retrySlot.ok) {
            // Continue with the fresh slot below.
          } else {
            return res.status(429).json({
              error: "backend_busy_with_export",
              message: "El servidor está procesando otra tarea pesada. Intenta en un momento.",
              detail: retrySlot.error?.detail
            });
          }
        } else {
          return res.status(429).json({
            error: "backend_busy_with_export",
            message: "El servidor está procesando otra tarea pesada. Intenta en un momento.",
            detail: slot.error?.detail
          });
        }
      } else {
        return res.status(429).json({
          error: "backend_busy_with_export",
          message: "El servidor está procesando otra tarea pesada. Intenta en un momento.",
          detail: slot.error?.detail
        });
      }
    }

    if (!getActiveHeavyWorkJobId() || getActiveHeavyWorkJobId() !== jobId) {
      const refreshedSlot = tryAcquireHeavyWorkSlot("montage_export", jobId);
      if (!refreshedSlot.ok) {
        return res.status(429).json({
          error: "backend_busy_with_export",
          message: "El servidor está procesando otra tarea pesada. Intenta en un momento.",
          detail: refreshedSlot.error?.detail
        });
      }
    }

    const activeJobId = getActiveHeavyWorkJobId();
    if (!activeJobId || activeJobId !== jobId) {
      return res.status(429).json({
        error: "backend_busy_with_export",
        message: "El servidor está procesando otra tarea pesada. Intenta en un momento.",
        detail: slot.error?.detail
      });
    }

    runMontageExportDirectJob({
      jobId,
      uid,
      sessionId: input.sessionId,
      input,
      baseUrl
    });

    return res.status(202).json(sanitizeMontageExportJobPublicPayload(initial));
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({
      error: String(error?.code || error?.message || "montage_export_failed").trim(),
      code: String(error?.code || "").trim() || undefined,
      detail: error?.detail && typeof error.detail === "object" ? error.detail : undefined
    });
  }
});

app.get("/api/podcaster/montage/export-status", async (req, res) => {
  try {
    const jobId = clampExportId(req.query?.jobId || "");
    if (!jobId) return res.status(400).json({ error: "Falta jobId." });
    applyAssetCorsHeaders(req, res);
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");

    const job = await resolveMontageExportJobSnapshot(jobId).catch((error) => {
      const status = Number(error?.status || 500) || 500;
      const errorCode = String(error?.code || "").trim();
      const timeoutFallback = status === 202 || errorCode === "montage_export_status_timeout";
      if (timeoutFallback || status >= 500) {
        if (getActiveHeavyWorkKind() === "montage_export" && getActiveHeavyWorkJobId() === jobId) {
          console.warn("[backend][montage-export] export-status recovered active worker after status read failure", {
            jobId,
            status: status || null,
            code: errorCode || null,
            message: String(error?.message || error)
          });
          return {
            jobId,
            status: "running",
            stage: "render_scene_segments",
            progress: 0.23,
            hint: "Recuperando el estado del export activo.",
            degraded: true,
            degradedStatus: status >= 500 ? status : 202,
            currentSceneIndex: 1,
            totalScenes: 1,
            currentRowId: "",
            heartbeatAt: new Date().toISOString(),
            lastHeartbeatAt: new Date().toISOString()
          };
        }
        console.warn("[backend][montage-export] export-status read failed without active worker", {
          jobId,
          status: status || null,
          code: errorCode || null,
          message: String(error?.message || error)
        });
        throw error;
      }
      console.warn("[backend][montage-export] export-status fallback", {
        jobId,
        status: status || null,
        code: errorCode || null,
        message: String(error?.message || error)
      });
      return null;
    });

    if (!job) {
      if (getActiveHeavyWorkKind() === "montage_export" && getActiveHeavyWorkJobId() === jobId) {
        console.warn("[backend][montage-export] export-status recovered from active heavy-work slot", { jobId });
        return res.status(200).json(sanitizeMontageExportJobPublicPayload({
          jobId,
          status: "running",
          stage: "render_scene_segments",
          progress: 0.23,
          hint: "Recuperando el estado del export activo.",
          degraded: true,
          currentSceneIndex: 1,
          totalScenes: 1,
          currentRowId: "",
          lastHeartbeatAt: new Date().toISOString()
        }));
      }
      if (getActiveHeavyWorkKind() === "montage_export") {
        const activeJobId = getActiveHeavyWorkJobId();
        if (activeJobId === jobId) {
          releaseHeavyWorkSlot("montage_export", jobId);
          console.warn("[backend][montage-export] released stale heavy-work slot after job_not_found", { jobId });
        }
      }
      return res.status(404).json({ error: "job_not_found", code: "job_not_found" });
    }
    const hasActiveMontageWorkerForJob = getActiveHeavyWorkKind() === "montage_export" && getActiveHeavyWorkJobId() === jobId;
    if (isMontageExportJobInterruptedByBackendRestart(job) && !hasActiveMontageWorkerForJob) {
      if (canAutoResumeInterruptedMontageExportJob(job, { queueAvailable: Boolean(montageExportQueue) })) {
        const request = job.request && typeof job.request === "object" ? job.request : null;
        const input = request?.input && typeof request.input === "object" ? request.input : null;
        const slot = tryAcquireHeavyWorkSlot("montage_export", jobId);
        if (slot.ok && input) {
          const restartPatch = buildAutoResumeInterruptedMontageExportJobPatch(job);
          const resumedJob = {
            ...job,
            ...restartPatch,
            updatedAt: new Date().toISOString()
          };
          console.warn("[backend][montage-export] export-status auto-resuming interrupted direct job", {
            jobId,
            backendBootAt: BACKEND_BOOT_ISO,
            stage: String(job?.stage || "").trim() || null,
            sceneSubstage: String(job?.sceneSubstage || "").trim() || null
          });
          upsertMontageExportJob(jobId, resumedJob);
          await montageExportJobStore.updateJob(jobId, restartPatch).catch((error) => {
            console.warn("[backend][montage-export] auto-resume job persistence failed", {
              jobId,
              message: String(error?.message || error)
            });
          });
          runMontageExportDirectJob({
            jobId,
            uid: String(job?.ownerId || "").trim(),
            sessionId: String(job?.sessionId || input.sessionId || "").trim(),
            input,
            baseUrl: String(request?.baseUrl || "").trim() || getBackendPublicBaseUrl() || `http://127.0.0.1:${PORT}`
          });
          return res.status(200).json(sanitizeMontageExportJobPublicPayload(resumedJob));
        }
      }
      const restartPatch = buildRestartInterruptedMontageExportJobPatch(job);
      console.warn("[backend][montage-export] export-status marking restarted job", {
        jobId,
        backendBootAt: BACKEND_BOOT_ISO,
        lastHeartbeatAt: restartPatch.error?.detail?.lastHeartbeatAt || "",
        stage: String(job?.stage || "").trim() || null,
        sceneSubstage: String(job?.sceneSubstage || "").trim() || null
      });
      const restartedJob = {
        ...job,
        ...restartPatch,
        updatedAt: new Date().toISOString(),
        heartbeatAt: String(job?.heartbeatAt || job?.lastHeartbeatAt || job?.updatedAt || "").trim()
      };
      upsertMontageExportJob(jobId, restartedJob);
      await montageExportJobStore.updateJob(jobId, restartPatch).catch((error) => {
        console.warn("[backend][montage-export] restarted job persistence failed", {
          jobId,
          message: String(error?.message || error)
        });
      });
      return res.status(200).json(sanitizeMontageExportJobPublicPayload(restartedJob));
    }
    if (isMontageExportJobStale(job) && !hasActiveMontageWorkerForJob) {
      const stalePatch = buildStaleMontageExportJobPatch(job);
      console.warn("[backend][montage-export] export-status marking stale job", {
        jobId,
        heartbeatAgeMs: stalePatch.error?.detail?.heartbeatAgeMs || 0,
        staleThresholdMs: stalePatch.error?.detail?.staleThresholdMs || MONTAGE_EXPORT_STALE_HEARTBEAT_MS,
        stage: String(job?.stage || "").trim() || null,
        sceneSubstage: String(job?.sceneSubstage || "").trim() || null
      });
      const staleJob = {
        ...job,
        ...stalePatch,
        updatedAt: new Date().toISOString(),
        heartbeatAt: String(job?.heartbeatAt || job?.lastHeartbeatAt || job?.updatedAt || "").trim()
      };
      upsertMontageExportJob(jobId, staleJob);
      await montageExportJobStore.updateJob(jobId, stalePatch).catch((error) => {
        console.warn("[backend][montage-export] stale job persistence failed", {
          jobId,
          message: String(error?.message || error)
        });
      });
      return res.status(200).json(sanitizeMontageExportJobPublicPayload(staleJob));
    }
    return res.status(200).json(sanitizeMontageExportJobPublicPayload(job));
  } catch (error) {
    const jobId = clampExportId(req.query?.jobId || "");
    applyAssetCorsHeaders(req, res);
    console.error("[backend][montage-export] export-status unhandled error", {
      jobId: jobId || null,
      status: Number(error?.status || 500) || 500,
      code: String(error?.code || "").trim() || null,
      message: String(error?.message || error)
    });
    return res.status(503).json({
      error: "montage_export_status_unavailable",
      code: String(error?.code || "").trim() || undefined,
      degraded: true
    });
  }
});

app.post("/api/podcaster/montage/export-cancel", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const jobId = clampExportId(req.body?.jobId || "");
    if (!jobId) return res.status(400).json({ error: "Falta jobId." });
    const job = await resolveMontageExportJobSnapshot(jobId).catch(() => null);
    if (!job) return res.status(404).json({ error: "job_not_found", code: "job_not_found" });
    if (String(job.ownerId || "").trim() && String(job.ownerId || "").trim() !== uid) {
      return res.status(403).json({ error: "job_owner_mismatch", code: "job_owner_mismatch" });
    }
    const currentStatus = String(job.status || "").trim().toLowerCase();
    if (["ready", "error", "failed", "cancelled", "completed"].includes(currentStatus)) {
      return res.status(200).json({
        ok: true,
        job: sanitizeMontageExportJobPublicPayload(job),
        cancelled: currentStatus === "cancelled"
      });
    }
    const cancelledAt = new Date().toISOString();
    const cancelledJob = await montageExportJobStore.updateJob(jobId, {
      status: "cancelled",
      stage: "cancelled",
      progress: Math.max(0, Math.min(1, Number(job.progress || 0) || 0)),
      hint: "Exportación cancelada por el usuario.",
      error: null,
      updatedAt: cancelledAt,
      heartbeatAt: cancelledAt
    });
    upsertMontageExportJob(jobId, cancelledJob);
    return res.status(200).json({
      ok: true,
      cancelled: true,
      job: sanitizeMontageExportJobPublicPayload(cancelledJob)
    });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({
      error: String(error?.code || error?.message || "montage_export_cancel_failed").trim(),
      code: String(error?.code || "").trim() || undefined
    });
  }
});

app.post("/api/podcaster/montage/preview", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
    if (getActiveHeavyWorkKind()) {
      return res.status(200).json({
        ok: false,
        code: "preview_temporarily_disabled",
        hint: "El preview quedó pausado mientras corre la exportación o generación pesada.",
        degraded: true,
        mode: String(req.body?.exportMode || "normal").trim() || "normal",
        sceneIndex: 0,
        rowId: clampText(req.body?.previewRowId || "", 140),
        mediaType: "",
        previewDataUrl: ""
      });
    }
    const uid = String(req.authContext?.uid || "").trim();
    const input = normalizeMontageExportRequestBody(req.body || {});
    // Keep montage preview cheap in production so it does not compete with the
    // export pipeline and trigger platform timeouts while the user is polling.
    const preview = await renderMontagePreviewImage(input, {
      uid,
      baseUrl: resolvePublicBaseUrl(req) || `http://127.0.0.1:${PORT}`
    });
    return res.status(200).json(preview);
  } catch (error) {
    const knownPreviewFailure = [
      "ffmpeg_exit_code",
      "storage_not_found",
      "download_failed",
      "download_stream_unavailable"
    ].includes(String(error?.code || "").trim());
    if (knownPreviewFailure) {
      return res.status(200).json({
        ok: false,
        mode: String(req.body?.exportMode || "normal").trim() || "normal",
        sceneIndex: 0,
        rowId: clampText(req.body?.previewRowId || "", 140),
        mediaType: "",
        previewDataUrl: "",
        degraded: true,
        error: String(error?.code || error?.message || "montage_preview_unavailable").trim(),
        detail: error?.detail && typeof error.detail === "object"
          ? error.detail
          : {
            stderrPreview: String(error?.stderr || "").split(/\r?\n/).slice(-8).join(" | ").slice(0, 1400) || undefined
          }
      });
    }
    return res.status(Number(error?.status || 500)).json({
      error: String(error?.code || error?.message || "montage_preview_failed").trim(),
      code: String(error?.code || "").trim() || undefined,
      detail: error?.detail && typeof error.detail === "object" ? error.detail : undefined
    });
  }
});

app.post("/api/podcaster/music/upload", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const sessionId = clampText(req.body?.sessionId || "", 140);
    const fileName = clampText(req.body?.fileName || "podcast-music", 180) || "podcast-music";
    const mimeType = clampText(req.body?.mimeType || "audio/mpeg", 120) || "audio/mpeg";
    const durationSec = clampNumber(req.body?.durationSec, 0, 1800, 0);
    const previousStoragePath = clampText(req.body?.previousStoragePath || "", 700);
    const audioDataUrl = String(req.body?.audioDataUrl || "").trim();
    if (!sessionId) return res.status(400).json({ error: "Falta sessionId." });
    if (!audioDataUrl) return res.status(400).json({ error: "Falta audioDataUrl." });
    const decoded = decodeBase64DataUrl(audioDataUrl, MAX_PODCASTER_MUSIC_BYTES);
    if (!String(decoded?.mimeType || mimeType).startsWith("audio/")) {
      return res.status(400).json({ error: "El archivo seleccionado no es audio válido." });
    }
    const ext = getAudioExtension(decoded.mimeType || mimeType);
    const sessionSlug = normalizeStorageSegment(sessionId, "session");
    const fileSlug = normalizeStorageSegment(fileName, "track");
    const storagePath = `podcaster/sessions/${sessionSlug}/owners/${normalizeStorageSegment(uid, "anon")}/music/${fileSlug}-${randomUUID()}.${ext}`;
    const asset = await uploadScreenshotAsset({
      path: storagePath,
      buffer: decoded.buffer,
      mimeType: decoded.mimeType || mimeType,
      metadata: {
        uid,
        sessionId,
        fileName,
        kind: "panel_music"
      }
    });
    if (previousStoragePath && previousStoragePath !== storagePath) {
      await deleteStoragePath(previousStoragePath).catch(() => {});
    }
    return res.status(200).json({
      ok: true,
      track: {
        name: fileName,
        mimeType: decoded.mimeType || mimeType,
        size: decoded.buffer.length,
        durationSec,
        downloadUrl: asset.downloadUrl,
        storagePath: asset.path,
        updatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo subir la canción.") });
  }
});

app.post("/api/podcaster/scene-media/upload", express.raw({ type: "*/*", limit: MAX_DIALOGUE_VIDEO_BYTES }), async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const sessionId = clampText(req.headers["x-session-id"] || "", 180);
    const rowId = clampText(req.headers["x-row-id"] || "", 180);
    const originalFileName = clampText(req.headers["x-file-name"] || "scene-media", 220) || "scene-media";
    const mimeType = clampText(req.headers["x-mime-type"] || req.headers["content-type"] || "application/octet-stream", 160) || "application/octet-stream";
    const previousStoragePath = clampText(req.headers["x-previous-storage-path"] || "", 700);
    const buffer = Buffer.isBuffer(req.body) ? Buffer.from(req.body) : Buffer.alloc(0);

    if (!sessionId) return res.status(400).json({ error: "Falta sessionId." });
    if (!rowId) return res.status(400).json({ error: "Falta rowId." });
    if (!buffer.length) return res.status(400).json({ error: "No se recibió archivo." });

    const isImage = mimeType.startsWith("image/");
    const maxBytes = isImage ? MAX_SPEAKER_PORTRAIT_BYTES : MAX_DIALOGUE_VIDEO_BYTES;
    if (buffer.length > maxBytes) {
      return res.status(413).json({ error: isImage ? "La imagen excede el tamaño permitido." : "El video excede el tamaño permitido." });
    }

    const ext = isImage ? getImageExtension(mimeType || "image/png") : getVideoExtension(mimeType || "video/mp4");
    const sessionSlug = normalizeStorageSegment(sessionId, "session");
    const rowSlug = normalizeStorageSegment(rowId, "row");
    const fileBaseName = String(originalFileName || "").replace(/\.[^.]+$/, "");
    const fileSlug = normalizeStorageSegment(fileBaseName, "media");
    const storagePath = `podcaster/sessions/${sessionSlug}/owners/${normalizeStorageSegment(uid, "anon")}/videos/${rowSlug}_${Date.now()}_${fileSlug}.${ext}`;

    const asset = await uploadScreenshotAsset({
      path: storagePath,
      buffer,
      mimeType,
      metadata: {
        uid,
        sessionId,
        rowId,
        fileName: originalFileName,
        kind: isImage ? "scene_image_replacement" : "scene_video_replacement"
      }
    });
    if (previousStoragePath && previousStoragePath !== storagePath) {
      await deleteStoragePath(previousStoragePath).catch(() => {});
    }
    return res.status(200).json({
      ok: true,
      media: {
        name: originalFileName,
        mimeType,
        size: buffer.length,
        type: isImage ? "image" : "video",
        downloadUrl: asset.downloadUrl,
        storagePath: asset.path,
        updatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo subir media de escena.") });
  }
});

function normalizePodcastSceneLibraryItem(docSnap = null) {
  const data = docSnap && typeof docSnap.data === "function" ? (docSnap.data() || {}) : (docSnap || {});
  const libraryId = String(docSnap?.id || data.libraryId || data.id || "").trim();
  if (!libraryId) return null;
  return {
    libraryId,
    title: clampText(data.title || data.name || data.publicSceneTitle || "Escena pública", 180) || "Escena pública",
    sourceSessionId: clampText(data.sourceSessionId || "", 140),
    sourceRowId: clampText(data.sourceRowId || "", 120),
    sourceRowNumber: Math.max(0, Number(data.sourceRowNumber) || 0),
    ownerId: clampText(data.ownerId || "", 140),
    ownerEmail: clampText(data.ownerEmail || "", 180),
    durationSec: clampNumber(data.durationSec, 0, 240, 0),
    downloadUrl: clampText(data.downloadUrl || "", 3000),
    storagePath: clampText(data.storagePath || "", 700),
    mimeType: clampText(data.mimeType || "video/mp4", 120) || "video/mp4",
    thumbUrl: clampText(data.thumbUrl || data.thumbnailUrl || "", 3000),
    thumbStoragePath: clampText(data.thumbStoragePath || data.thumbnailStoragePath || "", 700),
    thumbMimeType: clampText(data.thumbMimeType || "image/jpeg", 120) || "image/jpeg",
    sceneDescription: clampText(data.sceneDescription || "", 1200),
    onScreenText: clampText(data.onScreenText || "", 500),
    transition: clampText(data.transition || "", 500),
    visualNotes: clampText(data.visualNotes || "", 1200),
    videoDirective: clampText(data.videoDirective || "", 1400),
    scenePrompt: clampText(data.scenePrompt || "", 1200),
    voiceOverText: clampText(data.voiceOverText || "", 4000),
    tagLabel: clampText(data.tagLabel || "", 120),
    tagColor: clampText(data.tagColor || "slate", 40) || "slate",
    imagePrompts: Array.isArray(data.imagePrompts)
      ? data.imagePrompts.slice(0, 3).map((prompt) => clampText(prompt || "", 1200)).filter(Boolean)
      : String(data.imagePrompts || "")
        .split(/\n+/)
        .map((prompt) => clampText(prompt || "", 1200))
        .filter(Boolean)
        .slice(0, 3),
    videoPreset: clampText(data.videoPreset || "creative", 40) || "creative",
    createdAt: clampText(data.createdAt || "", 64),
    updatedAt: clampText(data.updatedAt || "", 64),
    publicSceneLibraryId: libraryId,
    publicScenePublishedAt: clampText(data.publicScenePublishedAt || data.updatedAt || data.createdAt || "", 64),
  };
}

async function uploadSceneLibraryThumb(thumbSource = "", libraryId = "") {
  const source = String(thumbSource || "").trim();
  if (!source) {
    return {thumbUrl: "", thumbStoragePath: "", thumbMimeType: "image/jpeg"};
  }
  if (!source.startsWith("data:")) {
    return {thumbUrl: source, thumbStoragePath: "", thumbMimeType: "image/jpeg"};
  }
  const decoded = decodeBase64DataUrl(source, MAX_SPEAKER_PORTRAIT_BYTES);
  const mimeType = String(decoded.mimeType || "image/jpeg").trim() || "image/jpeg";
  const ext = getImageExtension(mimeType);
  const storagePath = `podcaster/library/scenes/${normalizeStorageSegment(libraryId, "scene")}/thumb.${ext}`;
  const asset = await uploadScreenshotAsset({
    path: storagePath,
    buffer: decoded.buffer,
    mimeType,
    metadata: {
      kind: "podcaster_scene_library_thumb",
      libraryId
    }
  });
  return {thumbUrl: asset.downloadUrl, thumbStoragePath: asset.path, thumbMimeType: mimeType};
}

async function uploadSceneLibraryVideo({
  downloadUrl = "",
  storagePath = "",
  mimeType = "video/mp4",
  libraryId = ""
}) {
  const sourceStoragePath = String(storagePath || "").trim();
  const sourceDownloadUrl = String(downloadUrl || "").trim();
  if (!sourceStoragePath && !sourceDownloadUrl) {
    throw new Error("Falta video de origen para publicar la escena.");
  }
  let buffer = null;
  let resolvedMimeType = String(mimeType || "video/mp4").trim() || "video/mp4";
  if (sourceStoragePath) {
    try {
      const downloaded = await downloadStorageObjectToBuffer(sourceStoragePath);
      buffer = downloaded.buffer;
    } catch (error) {
      if (!sourceDownloadUrl) throw error;
    }
  }
  if (!buffer && sourceDownloadUrl) {
    const response = await fetchCompat(sourceDownloadUrl, { method: "GET" });
    if (!response.ok) {
      throw new Error(`No se pudo descargar el video fuente (${response.status}).`);
    }
    buffer = Buffer.from(await response.arrayBuffer());
    resolvedMimeType = String(response.headers.get("content-type") || resolvedMimeType).trim() || resolvedMimeType;
  }
  if (!buffer?.length) {
    throw new Error("El video fuente está vacío.");
  }
  const ext = getVideoExtension(resolvedMimeType);
  const libraryPath = `podcaster/library/scenes/${normalizeStorageSegment(libraryId, "scene")}/video.${ext}`;
  const asset = await uploadScreenshotAsset({
    path: libraryPath,
    buffer,
    mimeType: resolvedMimeType,
    metadata: {
      kind: "podcaster_scene_library_video",
      libraryId
    }
  });
  return {
    downloadUrl: asset.downloadUrl,
    storagePath: asset.path,
    mimeType: resolvedMimeType
  };
}

app.get("/api/podcaster/scene-library/list", async (req, res) => {
  try {
    const snap = await db.collection("podcaster_scene_library").orderBy("updatedAt", "desc").limit(250).get();
    const items = snap.docs.map((docSnap) => normalizePodcastSceneLibraryItem(docSnap)).filter(Boolean);
    return res.status(200).json({ ok: true, items });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo listar la biblioteca pública de escenas.") });
  }
});

app.post("/api/podcaster/scene-library/publish", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const ownerEmail = String(req.authContext?.email || "").trim();
    if (!uid) return res.status(401).json({ error: "AUTH_REQUIRED" });
    const sessionId = clampText(req.body?.sessionId || "", 140);
    const rowId = clampText(req.body?.rowId || "", 120);
    const incomingLibraryId = clampText(req.body?.libraryId || "", 140);
    const title = clampText(req.body?.title || "Escena pública", 180) || "Escena pública";
    const durationSec = clampNumber(req.body?.durationSec, 6, 180, 6);
    const videoDownloadUrl = clampText(req.body?.downloadUrl || "", 3000);
    const videoStoragePath = clampText(req.body?.storagePath || "", 700);
    const videoMimeType = clampText(req.body?.mimeType || "video/mp4", 120) || "video/mp4";
    const thumbDataUrl = String(req.body?.thumbDataUrl || "").trim();
    const sceneDescription = clampText(req.body?.sceneDescription || "", 1200);
    const onScreenText = clampText(req.body?.onScreenText || "", 500);
    const transition = clampText(req.body?.transition || "", 500);
    const visualNotes = clampText(req.body?.visualNotes || "", 1200);
    const videoDirective = clampText(req.body?.videoDirective || "", 1400);
    const scenePrompt = clampText(req.body?.scenePrompt || "", 1200);
    const voiceOverText = clampText(req.body?.voiceOverText || "", 4000);
    const imagePrompts = Array.isArray(req.body?.imagePrompts)
      ? req.body.imagePrompts.slice(0, 3).map((prompt) => clampText(prompt || "", 1200)).filter(Boolean)
      : String(req.body?.imagePrompts || "")
        .split(/\n+/)
        .map((prompt) => clampText(prompt || "", 1200))
        .filter(Boolean)
        .slice(0, 3);
    const videoPreset = clampText(req.body?.videoPreset || "creative", 40) || "creative";
    const tagLabel = clampText(req.body?.tagLabel || "", 120);
    const tagColor = clampText(req.body?.tagColor || "slate", 40) || "slate";
    if (!sessionId) return res.status(400).json({ error: "Falta sessionId." });
    if (!rowId) return res.status(400).json({ error: "Falta rowId." });
    if (!videoDownloadUrl && !videoStoragePath) return res.status(400).json({ error: "Falta video de la escena." });

    const sourceRowSnap = await db.collection("podcaster_sessions").doc(sessionId).get();
    const sourceSession = sourceRowSnap.exists ? (sourceRowSnap.data()?.session || null) : null;
    const sourceRowIndex = Array.isArray(sourceSession?.script?.rows)
      ? sourceSession.script.rows.findIndex((item) => String(item?.id || "").trim() === rowId)
      : -1;
    const libraryId = incomingLibraryId || randomUUID();
    const libraryRef = db.collection("podcaster_scene_library").doc(libraryId);
    const existingSnap = await libraryRef.get();
    const existing = existingSnap.exists ? (existingSnap.data() || {}) : {};

    const videoAsset = await uploadSceneLibraryVideo({
      downloadUrl: videoDownloadUrl,
      storagePath: videoStoragePath,
      mimeType: videoMimeType,
      libraryId
    });
    const thumbAsset = await uploadSceneLibraryThumb(thumbDataUrl, libraryId);

    const nowIso = new Date().toISOString();
    await libraryRef.set({
      libraryId,
      sourceSessionId: sessionId,
      sourceRowId: rowId,
      sourceRowNumber: sourceRowIndex >= 0 ? sourceRowIndex + 1 : 0,
      ownerId: uid,
      ownerEmail: ownerEmail || null,
      title,
      durationSec,
      downloadUrl: videoAsset.downloadUrl,
      storagePath: videoAsset.storagePath,
      mimeType: videoAsset.mimeType,
      thumbUrl: thumbAsset.thumbUrl || thumbDataUrl,
      thumbStoragePath: thumbAsset.thumbStoragePath || "",
      thumbMimeType: thumbAsset.thumbMimeType || "image/jpeg",
      sceneDescription,
      onScreenText,
      transition,
      visualNotes,
      videoDirective,
      scenePrompt,
      voiceOverText,
      tagLabel: existing.tagLabel || tagLabel,
      tagColor: existing.tagColor || tagColor,
      imagePrompts,
      videoPreset,
      createdAt: existing.createdAt || nowIso,
      updatedAt: nowIso,
    }, { merge: true });

    const previousVideoStoragePath = clampText(existing.storagePath || "", 700);
    const previousThumbStoragePath = clampText(existing.thumbStoragePath || "", 700);
    if (previousVideoStoragePath && previousVideoStoragePath !== videoAsset.storagePath) {
      await deleteStoragePath(previousVideoStoragePath).catch(() => {});
    }
    if (previousThumbStoragePath && previousThumbStoragePath !== thumbAsset.thumbStoragePath) {
      await deleteStoragePath(previousThumbStoragePath).catch(() => {});
    }

    return res.status(200).json({
      ok: true,
      item: {
        libraryId,
        sourceSessionId: sessionId,
        sourceRowId: rowId,
        sourceRowNumber: sourceRowIndex >= 0 ? sourceRowIndex + 1 : 0,
        ownerId: uid,
        ownerEmail: ownerEmail || null,
        title,
        durationSec,
        downloadUrl: videoAsset.downloadUrl,
        storagePath: videoAsset.storagePath,
        mimeType: videoAsset.mimeType,
        thumbUrl: thumbAsset.thumbUrl || thumbDataUrl,
        thumbStoragePath: thumbAsset.thumbStoragePath || "",
        thumbMimeType: thumbAsset.thumbMimeType || "image/jpeg",
        sceneDescription,
        onScreenText,
        transition,
        visualNotes,
        videoDirective,
        scenePrompt,
        voiceOverText,
        tagLabel: existing.tagLabel || tagLabel,
        tagColor: existing.tagColor || tagColor,
        imagePrompts,
        videoPreset,
        createdAt: existing.createdAt || nowIso,
        updatedAt: nowIso,
      }
    });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo publicar la escena pública.") });
  }
});

app.post("/api/podcaster/scene-library/upload-local", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const ownerEmail = String(req.authContext?.email || "").trim();
    if (!uid) return res.status(401).json({ error: "AUTH_REQUIRED" });
    const title = clampText(req.body?.title || req.body?.originalName || "Video local", 180) || "Video local";
    const originalName = clampText(req.body?.originalName || title, 180) || title;
    const videoDataUrl = String(req.body?.videoDataUrl || "").trim();
    const requestedMimeType = clampText(req.body?.mimeType || "video/mp4", 120) || "video/mp4";
    const durationSec = clampNumber(req.body?.durationSec, 0, 240, 0);
    const size = Math.max(0, Number(req.body?.size || 0) || 0);
    const thumbDataUrl = String(req.body?.thumbDataUrl || "").trim();
    if (!videoDataUrl) return res.status(400).json({ error: "Falta videoDataUrl." });
    const decoded = decodeBase64DataUrl(videoDataUrl, MAX_DIALOGUE_VIDEO_BYTES);
    const mimeType = String(decoded.mimeType || requestedMimeType || "video/mp4").trim().toLowerCase() || "video/mp4";
    if (!mimeType.startsWith("video/")) return res.status(400).json({ error: "El archivo debe ser un video." });
    const libraryId = randomUUID();
    const ext = getVideoExtension(mimeType);
    const storagePath = `podcaster/library/scenes/${normalizeStorageSegment(libraryId, "scene")}/local-video.${ext}`;
    const videoAsset = await uploadScreenshotAsset({
      path: storagePath,
      buffer: decoded.buffer,
      mimeType,
      metadata: {
        kind: "podcaster_scene_library_video",
        source: "local_upload",
        libraryId,
        uid,
        originalName,
        size: String(size || decoded.buffer.length)
      }
    });
    const thumbAsset = await uploadSceneLibraryThumb(thumbDataUrl, libraryId);
    const nowIso = new Date().toISOString();
    const item = {
      libraryId,
      sourceSessionId: "",
      sourceRowId: "",
      sourceRowNumber: 0,
      ownerId: uid,
      ownerEmail: ownerEmail || null,
      title,
      durationSec,
      downloadUrl: videoAsset.downloadUrl,
      storagePath: videoAsset.path,
      mimeType,
      thumbUrl: thumbAsset.thumbUrl || "",
      thumbStoragePath: thumbAsset.thumbStoragePath || "",
      thumbMimeType: thumbAsset.thumbMimeType || "image/jpeg",
      sceneDescription: "",
      onScreenText: "",
      transition: "",
      visualNotes: "",
      videoDirective: "",
      scenePrompt: "",
      voiceOverText: "",
      tagLabel: "Local",
      tagColor: "sky",
      imagePrompts: [],
      videoPreset: "local",
      sourceType: "local_upload",
      originalName,
      size: size || decoded.buffer.length,
      createdAt: nowIso,
      updatedAt: nowIso
    };
    await db.collection("podcaster_scene_library").doc(libraryId).set(item, { merge: true });
    return res.status(200).json({ ok: true, item });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo subir el video local.") });
  }
});

app.post("/api/podcaster/scene-library/update", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const libraryId = clampText(req.body?.libraryId || "", 140);
    const title = clampText(req.body?.title || "", 180);
    const tagLabel = clampText(req.body?.tagLabel || "", 120);
    const tagColor = clampText(req.body?.tagColor || "slate", 40) || "slate";
    if (!uid) return res.status(401).json({ error: "AUTH_REQUIRED" });
    if (!libraryId) return res.status(400).json({ error: "Falta libraryId." });
    if (!title) return res.status(400).json({ error: "Falta title." });
    const ref = db.collection("podcaster_scene_library").doc(libraryId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "La escena pública no existe." });
    const data = snap.data() || {};
    if (String(data.ownerId || "").trim() && String(data.ownerId || "").trim() !== uid) {
      return res.status(403).json({ error: "No puedes editar esta escena." });
    }
    const nowIso = new Date().toISOString();
    await ref.set({ title, tagLabel, tagColor, updatedAt: nowIso }, { merge: true });
    return res.status(200).json({
      ok: true,
      item: {
        libraryId,
        sourceSessionId: clampText(data.sourceSessionId || "", 140),
        sourceRowId: clampText(data.sourceRowId || "", 120),
        sourceRowNumber: Math.max(0, Number(data.sourceRowNumber) || 0),
        ownerId: clampText(data.ownerId || "", 140),
        ownerEmail: clampText(data.ownerEmail || "", 180),
        title,
        durationSec: clampNumber(data.durationSec, 0, 240, 0),
        downloadUrl: clampText(data.downloadUrl || "", 3000),
        storagePath: clampText(data.storagePath || "", 700),
        mimeType: clampText(data.mimeType || "video/mp4", 120) || "video/mp4",
        thumbUrl: clampText(data.thumbUrl || data.thumbnailUrl || "", 3000),
        thumbStoragePath: clampText(data.thumbStoragePath || data.thumbnailStoragePath || "", 700),
        thumbMimeType: clampText(data.thumbMimeType || "image/jpeg", 120) || "image/jpeg",
        sceneDescription: clampText(data.sceneDescription || "", 1200),
        onScreenText: clampText(data.onScreenText || "", 500),
        transition: clampText(data.transition || "", 500),
        visualNotes: clampText(data.visualNotes || "", 1200),
        videoDirective: clampText(data.videoDirective || "", 1400),
        scenePrompt: clampText(data.scenePrompt || "", 1200),
        voiceOverText: clampText(data.voiceOverText || "", 4000),
        tagLabel,
        tagColor,
        imagePrompts: Array.isArray(data.imagePrompts) ? data.imagePrompts : [],
        videoPreset: clampText(data.videoPreset || "creative", 40) || "creative",
        createdAt: clampText(data.createdAt || nowIso, 64),
        updatedAt: nowIso
      }
    });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo actualizar la escena pública.") });
  }
});

app.post("/api/podcaster/scene-library/delete", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const libraryId = clampText(req.body?.libraryId || "", 140);
    if (!uid) return res.status(401).json({ error: "AUTH_REQUIRED" });
    if (!libraryId) return res.status(400).json({ error: "Falta libraryId." });
    const ref = db.collection("podcaster_scene_library").doc(libraryId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "La escena pública no existe." });
    const data = snap.data() || {};
    if (String(data.ownerId || "").trim() && String(data.ownerId || "").trim() !== uid) {
      return res.status(403).json({ error: "No puedes eliminar esta escena." });
    }
    await ref.delete();
    await deleteStoragePath(clampText(data.storagePath || "", 700)).catch(() => {});
    await deleteStoragePath(clampText(data.thumbStoragePath || "", 700)).catch(() => {});
    return res.status(200).json({ ok: true, libraryId });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo eliminar la escena pública.") });
  }
});

app.get("/api/podcaster/music/library/list", async (req, res) => {
  try {
    const snap = await db.collection("podcaster_music_library").orderBy("updatedAt", "desc").limit(250).get();
    const tracks = snap.docs.map((docSnap) => {
      const data = docSnap.data() || {};
      return {
        libraryId: docSnap.id,
        name: clampText(data.name || "Audio", 180) || "Audio",
        mimeType: clampText(data.mimeType || "audio/mpeg", 120) || "audio/mpeg",
        size: Math.max(0, Number(data.size || 0) || 0),
        durationSec: clampNumber(data.durationSec, 0, 1800, 0),
        downloadUrl: clampText(data.downloadUrl || "", 3000),
        storagePath: clampText(data.storagePath || "", 700),
        updatedAt: clampText(data.updatedAt || "", 64),
        ownerId: clampText(data.ownerId || "", 140),
        ownerEmail: clampText(data.ownerEmail || "", 180)
      };
    });
    return res.status(200).json({ ok: true, tracks });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo listar la biblioteca de audios.") });
  }
});

app.post("/api/podcaster/music/library/upload", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const userEmail = clampText(req.authContext?.email || "", 180);
    const fileName = clampText(req.body?.fileName || "podcast-music", 180) || "podcast-music";
    const mimeType = clampText(req.body?.mimeType || "audio/mpeg", 120) || "audio/mpeg";
    const durationSec = clampNumber(req.body?.durationSec, 0, 1800, 0);
    const previousStoragePath = clampText(req.body?.previousStoragePath || "", 700);
    const audioDataUrl = String(req.body?.audioDataUrl || "").trim();
    if (!audioDataUrl) return res.status(400).json({ error: "Falta audioDataUrl." });
    const decoded = decodeBase64DataUrl(audioDataUrl, MAX_PODCASTER_MUSIC_BYTES);
    if (!String(decoded?.mimeType || mimeType).startsWith("audio/")) {
      return res.status(400).json({ error: "El archivo seleccionado no es audio válido." });
    }
    const ext = getAudioExtension(decoded.mimeType || mimeType);
    const fileSlug = normalizeStorageSegment(fileName, "track");
    const libraryId = randomUUID();
    const storagePath = `podcaster/library/music/${fileSlug}-${libraryId}.${ext}`;
    const asset = await uploadScreenshotAsset({
      path: storagePath,
      buffer: decoded.buffer,
      mimeType: decoded.mimeType || mimeType,
      metadata: {
        uid,
        fileName,
        kind: "panel_music_library"
      }
    });
    if (previousStoragePath && previousStoragePath !== storagePath) {
      await deleteStoragePath(previousStoragePath).catch(() => {});
    }
    const updatedAt = new Date().toISOString();
    await db.collection("podcaster_music_library").doc(libraryId).set({
      name: fileName,
      mimeType: decoded.mimeType || mimeType,
      size: decoded.buffer.length,
      durationSec,
      downloadUrl: asset.downloadUrl,
      storagePath: asset.path,
      updatedAt,
      ownerId: uid,
      ownerEmail: userEmail || null
    });
    return res.status(200).json({
      ok: true,
      track: {
        libraryId,
        name: fileName,
        mimeType: decoded.mimeType || mimeType,
        size: decoded.buffer.length,
        durationSec,
        downloadUrl: asset.downloadUrl,
        storagePath: asset.path,
        updatedAt,
        ownerId: uid,
        ownerEmail: userEmail || null
      }
    });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo subir el audio a la biblioteca global.") });
  }
});

app.post("/api/podcaster/music/library/delete", async (req, res) => {
  try {
    const libraryId = clampText(req.body?.libraryId || "", 140);
    if (!libraryId) return res.status(400).json({ error: "Falta libraryId." });
    const ref = db.collection("podcaster_music_library").doc(libraryId);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ error: "El audio global ya no existe." });
    }
    const data = snap.data() || {};
    const storagePath = clampText(data.storagePath || req.body?.storagePath || "", 700);
    await ref.delete();
    if (storagePath) {
      await deleteStoragePath(storagePath).catch(() => {});
    }
    return res.status(200).json({ ok: true, libraryId });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo eliminar el audio global.") });
  }
});

app.post("/api/podcaster/music/generate", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const sessionId = clampText(req.body?.sessionId || "", 140);
    const preset = clampText(req.body?.preset || "ambient", 40) || "ambient";
    const previousStoragePath = clampText(req.body?.previousStoragePath || "", 700);
    const prompt = buildPodcasterMusicPrompt(req.body?.prompt || "", preset);
    const model = sanitizePodcasterMusicModel(req.body?.model || "lyria-3-clip-preview");
    if (!sessionId) return res.status(400).json({ error: "Falta sessionId." });
    if (!hasGeminiKey()) return res.status(500).json({ error: "Falta GEMINI_API_KEY o GOOGLE_API_KEY en backend." });

    const client = new GoogleGenAI({
      apiKey: GEMINI_API_KEY
    });
    const response = await client.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseModalities: ["AUDIO", "TEXT"]
      }
    });
    const audioParts = readLyriaAudioParts(response);
    const firstAudio = audioParts[0] || null;
    if (!firstAudio?.data) {
      return res.status(502).json({ error: "Lyria no devolvió audio." });
    }
    const mimeType = String(firstAudio.mimeType || "audio/mpeg").trim() || "audio/mpeg";
    const buffer = Buffer.from(firstAudio.data, "base64");
    if (!buffer.length) {
      return res.status(502).json({ error: "Lyria devolvió audio vacío." });
    }
    const ext = getAudioExtension(mimeType);
    const sessionSlug = normalizeStorageSegment(sessionId, "session");
    const storagePath = `podcaster/sessions/${sessionSlug}/owners/${normalizeStorageSegment(uid, "anon")}/music/ai-${randomUUID()}.${ext}`;
    const asset = await uploadScreenshotAsset({
      path: storagePath,
      buffer,
      mimeType,
      metadata: {
        uid,
        sessionId,
        kind: "panel_music_ai",
        model
      }
    });
    if (previousStoragePath && previousStoragePath !== storagePath) {
      await deleteStoragePath(previousStoragePath).catch(() => {});
    }
    await sleep(120);
    return res.status(200).json({
      ok: true,
      track: {
        name: `AI Music ${preset}`,
        mimeType,
        size: buffer.length,
        downloadUrl: asset.downloadUrl,
        storagePath: asset.path,
        updatedAt: new Date().toISOString(),
        model
      }
    });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo generar música con IA.") });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "gemini-backend",
    hasGeminiKey: hasGeminiKey(),
    moodleShareUsersRoute: true,
    moodleModuleGraphicsRoute: true,
    podcasterDialogueAudioRoute: true,
    podcasterMusicGenerateRoute: true,
    startupSignature: BACKEND_BOOT_SIGNATURE,
  });
});

app.post("/api/mineblox/screenshots/upload", async (req, res) => {
  try {
    return await handleMinebloxScreenshotUpload(req, res);
  } catch (error) {
    return res.status(400).json({ error: String(error?.message || "No se pudo subir la captura.") });
  }
});

app.post("/api/moodle/module-graphics/generate", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const courseId = clampText(req.body?.courseId || "", 180);
    const moduleId = clampText(req.body?.moduleId || "", 180);
    if (!uid || !courseId || !moduleId) {
      return res.status(400).json({ error: "Faltan uid, courseId o moduleId para generar el gráfico del módulo." });
    }
    const image = await generateMoodleModuleGraphicAsset({
      uid,
      courseId,
      moduleId,
      moduleType: clampText(req.body?.moduleType || "", 80),
      moduleName: clampText(req.body?.moduleName || "", 220),
      languageCode: clampText(req.body?.languageCode || "es", 12) || "es",
      instructions: clampText(req.body?.instructions || "", 5000),
      content: clampText(req.body?.content || "", 8000),
      instructionImages: normalizeInlineInstructionImages(req.body?.instructionImages),
      previousStoragePath: clampText(req.body?.previousStoragePath || "", 700)
    });
    return res.status(200).json({ ok: true, image });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo generar el gráfico del módulo.") });
  }
});

app.post("/api/moodle/module-graphics/generate-element", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const courseId = clampText(req.body?.courseId || "", 180);
    const moduleId = clampText(req.body?.moduleId || "", 180);
    const elementId = clampText(req.body?.elementId || "", 120) || "element";
    const elementLabel = clampText(req.body?.elementLabel || "", 180) || "Elemento";
    const elementPrompt = clampText(req.body?.elementPrompt || "", 2400);
    if (!uid || !courseId || !moduleId) {
      return res.status(400).json({ error: "Faltan uid, courseId o moduleId para generar el elemento del gráfico." });
    }
    if (!elementPrompt) {
      return res.status(400).json({ error: "Falta elementPrompt para generar el elemento del gráfico." });
    }

    const image = await generateMoodleModuleGraphicElementAsset({
      uid,
      courseId,
      moduleId,
      moduleType: clampText(req.body?.moduleType || "", 80),
      moduleName: clampText(req.body?.moduleName || "", 220),
      languageCode: clampText(req.body?.languageCode || "es", 12) || "es",
      instructions: clampText(req.body?.instructions || "", 5000),
      content: clampText(req.body?.content || "", 8000),
      elementId,
      elementLabel,
      elementPrompt,
      previousStoragePath: clampText(req.body?.previousStoragePath || "", 700)
    });
    return res.status(200).json({
      ok: true,
      image: {
        ...image,
        courseId,
        moduleId,
        elementId,
        elementLabel
      }
    });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo generar el elemento del gráfico.") });
  }
});

app.post("/api/moodle/module-graphics/analyze-element", async (req, res) => {
  try {
    const imageUrl = clampText(req.body?.imageUrl || "", 3200);
    if (!imageUrl) {
      return res.status(400).json({ error: "Falta imageUrl para analizar el elemento." });
    }
    if (!ensureGeminiKey(res)) return;
    const moduleName = clampText(req.body?.moduleName || "Modulo", 180) || "Modulo";
    const moduleType = clampText(req.body?.moduleType || "Modulo", 80) || "Modulo";
    const elementLabel = clampText(req.body?.elementLabel || "Elemento", 120) || "Elemento";
    const elementPrompt = clampText(req.body?.elementPrompt || "", 2400);
    const image = await fetchImageBytesWithMimeLocal(imageUrl);
    const prompt = [
      "Evalua una imagen PNG de un elemento para composicion grafica educativa.",
      `Modulo: ${moduleName} (${moduleType}).`,
      `Elemento esperado: ${elementLabel}.`,
      elementPrompt ? `Brief esperado: ${elementPrompt}.` : "",
      "",
      "Devuelve SOLO JSON valido con esta estructura:",
      "{",
      '  "score": 0-100,',
      '  "hasEmbeddedText": true|false,',
      '  "hasFakeTransparencyOrCheckerboard": true|false,',
      '  "matchesTarget": true|false,',
      '  "issues": ["string"],',
      '  "recommendation": "accept|regenerate"',
      "}",
      "",
      "Reglas de evaluacion:",
      "- Si ves letras, numeros, ecuaciones, etiquetas o texto incrustado: recommendation=regenerate.",
      "- Si ves patron cuadriculado, fondo de tablero o falso transparente: recommendation=regenerate.",
      "- Si la imagen mezcla demasiados elementos distintos o no corresponde al objetivo: recommendation=regenerate.",
      "- El fondo normal SI esta permitido. No penalices una imagen solo por conservar fondo."
    ].join("\n");

    const upstream = await fetchCompat(
      `${GEMINI_BASE}/models/${encodeURIComponent("gemini-2.5-flash")}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { text: prompt },
              { inline_data: { mime_type: image.mimeType, data: image.buffer.toString("base64") } }
            ]
          }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json"
          }
        })
      }
    );
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(upstream.status >= 500 ? 502 : upstream.status).json({
        error: String(data?.error?.message || data?.error || `HTTP ${upstream.status}`)
      });
    }
    const text = String(data?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
    const parsed = parseJsonObjectFromModelTextLocal(text);
    const score = clampNumber(parsed?.score, 0, 100, 0);
    const hasEmbeddedText = parsed?.hasEmbeddedText === true;
    const hasCheckerboard = parsed?.hasCheckerboardOrFakeTransparency === true || parsed?.hasFakeTransparencyOrCheckerboard === true;
    const matchesTarget = parsed?.matchesTarget === true;
    const recommendation = (
      hasEmbeddedText ||
      hasCheckerboard ||
      !matchesTarget ||
      score < 72
    ) ? "regenerate" : "accept";
    return res.status(200).json({
      ok: true,
      analysis: {
        score,
        hasEmbeddedText,
        hasCheckerboardOrFakeTransparency: hasCheckerboard,
        matchesTarget,
        issues: Array.isArray(parsed?.issues) ? parsed.issues.map((item) => clampText(item, 200)).filter(Boolean).slice(0, 6) : [],
        recommendation
      }
    });
  } catch (error) {
    return res.status(500).json({ error: String(error?.message || "No se pudo analizar el elemento del gráfico.") });
  }
});

app.get("/api/mineblox/screenshots/list", async (req, res) => {
  try {
    return await handleMinebloxScreenshotList(req, res);
  } catch (error) {
    return res.status(400).json({ error: String(error?.message || "No se pudo listar la galería.") });
  }
});

app.post("/api/gemini/generate", async (req, res) => {
  if (!ensureGeminiKey(res)) return;
  try {
    const model = normalizeModel(req.body?.model);
    const originalPayload = req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : {};

    const isCreativeVideoPayload = (payload = {}) => {
      try {
        const systemText = String(payload?.systemInstruction?.parts?.map((p) => p?.text).filter(Boolean).join(" ") || "").toLowerCase();
        const userText = String(payload?.contents?.map((c) => c?.parts?.map((p) => p?.text).filter(Boolean).join("\n")).filter(Boolean).join("\n") || "").toLowerCase();
        return (
          systemText.includes("videos cortos creativos")
          || systemText.includes("video corto creativo")
          || systemText.includes("video creativo")
          || userText.includes("video creativo")
          || userText.includes("video corto creativo")
        );
      } catch (_) {
        return false;
      }
    };

    const looksLikeEducationalTemplateText = (text = "") => {
      const lower = String(text || "").toLowerCase();
      if (!lower) return false;
      return (
        lower.includes("bienvenidos a este video educativo")
        || lower.includes("escena didáctica")
        || lower.includes("escena didactica")
        || lower.includes("conversación útil y accionable")
        || lower.includes("conversacion util y accionable")
        || lower.includes("vamos a tomar una idea y convertirla")
        || lower.includes("módulo claro, dinámico")
        || lower.includes("modulo claro, dinamico")
      );
    };

    const augmentCreativeVideoPayload = (payload = {}) => {
      const next = JSON.parse(JSON.stringify(payload || {}));
      const baseSystem = String(next?.systemInstruction?.parts?.[0]?.text || "").trim();
      if (baseSystem) {
        next.systemInstruction = next.systemInstruction || {};
        next.systemInstruction.parts = next.systemInstruction.parts || [{ text: baseSystem }];
        next.systemInstruction.parts[0].text = [
          baseSystem,
          "Reglas extra (creativo): Prohibido usar plantillas educativas.",
          "No escribas frases tipo 'Bienvenidos a este video educativo', 'Hoy abrimos una conversación útil y accionable' o 'Vamos a tomar una idea y convertirla...'.",
          "Empieza directo con acción/amenaza y usa detalles concretos del prompt desde la primera escena.",
          "Responde solo JSON válido."
        ].join(" ");
      }
      next.generationConfig = next.generationConfig && typeof next.generationConfig === "object" ? next.generationConfig : {};
      const currentTemp = Number(next.generationConfig.temperature);
      if (!Number.isFinite(currentTemp) || currentTemp < 0.55) {
        next.generationConfig.temperature = 0.85;
      }
      return next;
    };

    const shouldAugmentCreative = isCreativeVideoPayload(originalPayload);
    const payload = shouldAugmentCreative ? augmentCreativeVideoPayload(originalPayload) : originalPayload;

    const serialized = JSON.stringify(payload || {});
    if (Buffer.byteLength(serialized, "utf8") > MAX_PAYLOAD_BYTES) {
      return res.status(413).json({ error: "Payload demasiado grande para Gemini." });
    }

    if (shouldAugmentCreative) {
      console.log("[GEMINI][creative] request", {
        model,
        payloadSize: serialized.length,
        hasRowsSchema: Boolean(payload?.generationConfig?.responseJsonSchema?.properties?.rows),
        responseMimeType: String(payload?.generationConfig?.responseMimeType || ""),
        promptPreview: String(
          payload?.contents?.map((c) => c?.parts?.map((p) => p?.text).filter(Boolean).join("\n")).filter(Boolean).join("\n") || ""
        ).slice(0, 240)
      });
    } else {
      console.log(`[GEMINI] model=${model}, payloadSize=${serialized.length}`);
    }

    const endpoint = `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
    const doRequest = async (bodyJson) => {
      const upstream = await fetchCompat(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: bodyJson
      });
      const data = await safeJson(upstream);
      return { upstream, data };
    };

    let { upstream, data } = await fetchGeminiWithRetry({
      requestFn: async ({ attempt }) => {
        const result = await doRequest(serialized);
        if (!result?.upstream?.ok && isRetryableGeminiUpstreamStatus(result?.upstream?.status)) {
          console.warn("[GEMINI] transient upstream failure", {
            status: result?.upstream?.status,
            attempt: attempt + 1,
            model
          });
        }
        return result;
      },
      retryDelaysMs: buildGeminiUpstreamRetryDelays(3, 450)
    });
    if (!upstream.ok) {
      console.error(`[GEMINI] HTTP ${upstream.status}:`, JSON.stringify(data, null, 2));
    }
    if (shouldAugmentCreative) {
      const text = String(data?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
      console.log("[GEMINI][creative] response", {
        status: upstream.status,
        hasCandidates: Array.isArray(data?.candidates),
        candidateCount: Array.isArray(data?.candidates) ? data.candidates.length : 0,
        promptFeedback: data?.promptFeedback ? {
          blockReason: String(data?.promptFeedback?.blockReason || ""),
          blockReasonMessage: String(data?.promptFeedback?.blockReasonMessage || ""),
          safetyRatings: Array.isArray(data?.promptFeedback?.safetyRatings) ? data.promptFeedback.safetyRatings.length : 0
        } : null,
        textPreview: text.slice(0, 260),
        looksEducational: looksLikeEducationalTemplateText(text)
      });
    }

    if (shouldAugmentCreative && upstream.ok) {
      const text = String(data?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
      if (looksLikeEducationalTemplateText(text)) {
        try {
          const retryPayload = augmentCreativeVideoPayload(payload);
          if (retryPayload?.systemInstruction?.parts?.[0]?.text) {
            retryPayload.systemInstruction.parts[0].text = [
              String(retryPayload.systemInstruction.parts[0].text || "").trim(),
              "REINTENTO: tu salida anterior sonó a plantilla educativa y fue rechazada.",
              "Reescribe TODO el guion como video creativo para redes, sin plantilla educativa y con detalles concretos del prompt desde la escena 1."
            ].join(" ");
          }
          const retrySerialized = JSON.stringify(retryPayload || {});
          if (Buffer.byteLength(retrySerialized, "utf8") <= MAX_PAYLOAD_BYTES) {
            const retry = await doRequest(retrySerialized);
            if (retry.upstream.ok) {
              upstream = retry.upstream;
              data = retry.data;
            }
          }
        } catch (error) {
          console.error("[GEMINI] creative retry failed:", String(error?.message || error));
        }
      }
    }

    return res.status(upstream.status).json(data);
  } catch (error) {
    console.error(`[GEMINI] Error:`, error.message);
    return res.status(500).json({ error: String(error?.message || "Error interno en backend Gemini.") });
  }
});

app.get("/api/gemini/models", async (_req, res) => {
  if (!ensureGeminiKey(res)) return;
  try {
    const upstream = await fetchCompat(`${GEMINI_BASE}/models?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" }
    });
    const data = await safeJson(upstream);
    return res.status(upstream.status).json(data);
  } catch (error) {
    return res.status(500).json({ error: String(error?.message || "Error interno listando modelos Gemini.") });
  }
});

app.post("/api/gemini/live-token", async (req, res) => {
  if (!ensureGeminiKey(res)) return;
  try {
    const modelInput = normalizeModel(req.body?.model || "gemini-2.5-flash-native-audio-preview-12-2025");
    const model = modelInput;
    const requestedVoiceName = String(req.body?.voiceName || "").trim();
    const voiceName = normalizeLiveVoiceName(requestedVoiceName);
    if (requestedVoiceName && !voiceName) {
      return res.status(400).json({
        error: `Voz no soportada para Gemini Live: ${requestedVoiceName}`
      });
    }
    const systemInstruction = String(
      req.body?.systemInstruction || "Eres un asistente pedagógico útil y amable."
    ).trim();
    const liveConfig = {
      responseModalities: ["AUDIO"],
      systemInstruction,
      sessionResumption: {}
    };
    if (voiceName) {
      liveConfig.speechConfig = {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName
          }
        }
      };
    }

    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const newSessionExpireTime = new Date(Date.now() + 60 * 1000).toISOString();
    const ai = buildGeminiLiveClient();
    const data = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime,
        liveConnectConstraints: {
          model,
          config: liveConfig
        },
        lockAdditionalFields: []
      }
    });
    if (!data?.name) {
      return res.status(502).json({ error: "Respuesta inválida al crear token efímero.", raw: data });
    }
    return res.json({
      token: data.name,
      model,
      requestedVoiceName: requestedVoiceName || null,
      voiceName: voiceName || null,
      expireTime: data.expireTime || expireTime,
      newSessionExpireTime: data.newSessionExpireTime || newSessionExpireTime
    });
  } catch (error) {
    const summary = summarizeGeminiLiveError(error);
    console.error("[GEMINI_LIVE_TOKEN] Upstream error", {
      status: summary.status || null,
      contentType: summary.contentType || null,
      bodySnippet: summary.bodySnippet || null
    });
    return res.status(summary.status >= 400 ? summary.status : 502).json({
      error: "UPSTREAM_GEMINI_LIVE_TOKEN_FAILED",
      detail: summary.bodySnippet || "No se pudo crear token efímero para Gemini Live."
    });
  }
});

app.get("/api/assets/proxy-image", async (req, res) => {
  try {
    applyAssetCorsHeaders(req, res);
    const storagePath = normalizeStorageFilePath(clampText(req.query?.storagePath || "", 700));
    if (storagePath) {
      const downloaded = await downloadStorageObjectToBuffer(storagePath);
      const mimeType = String(downloaded?.metadata?.contentType || "application/octet-stream").trim() || "application/octet-stream";
      res.setHeader("Content-Type", mimeType);
      res.setHeader("Cache-Control", "private, max-age=120");
      return res.status(200).send(downloaded.buffer);
    }
    const rawUrl = String(req.query?.url || "").trim();
    const normalizedUrl = rawUrl.includes("%25") ? decodeURIComponent(rawUrl) : rawUrl;
    if (!normalizedUrl) {
      return res.status(400).json({ error: "Falta parámetro url o storagePath." });
    }
    let parsed = null;
    try {
      parsed = new URL(normalizedUrl);
    } catch (_) {
      return res.status(400).json({ error: "URL inválida." });
    }
    const protocol = String(parsed.protocol || "").toLowerCase();
    if (protocol !== "https:" && protocol !== "http:") {
      return res.status(400).json({ error: "Solo se permiten URLs http/https." });
    }
    const host = String(parsed.hostname || "").toLowerCase();
    const allowedHost = host.endsWith("googleapis.com") || host.endsWith("firebasestorage.app") || host === "storage.googleapis.com";
    if (!allowedHost) {
      return res.status(403).json({ error: "Host no permitido para proxy." });
    }

    let finalRequestUrl = normalizedUrl;
    if (req.query.token && !finalRequestUrl.includes("token=")) {
      const separator = finalRequestUrl.includes("?") ? "&" : "?";
      finalRequestUrl += `${separator}token=${req.query.token}`;
      if (req.query.alt && !finalRequestUrl.includes("alt=")) {
        finalRequestUrl += `&alt=${req.query.alt}`;
      }
    }

    const firebaseObject = parseFirebaseStorageGoogleApisObjectUrl(finalRequestUrl);
    const bucketFromUrl = String(firebaseObject?.bucket || "").trim();
    const objectPath = normalizeStorageFilePath(firebaseObject?.objectPath || "");
    const isPodcasterAsset = /^podcaster\//i.test(String(objectPath || "").trim());
    if (isPodcasterAsset && objectPath) {
      try {
        const downloaded = await downloadStorageObjectToBuffer(objectPath);
        if (downloaded && downloaded.buffer) {
          const mimeType = String(downloaded?.metadata?.contentType || "application/octet-stream").trim() || "application/octet-stream";
          res.setHeader("Content-Type", mimeType);
          res.setHeader("Cache-Control", "private, max-age=120");
          return res.status(200).send(downloaded.buffer);
        }
      } catch (e) {
        console.warn("[backend][proxy-image] admin storage download fallback failed", {
          url: redactUrlForLogs(finalRequestUrl),
          objectPath,
          error: e.message
        });
      }
    }

    const upstream = await fetchCompat(finalRequestUrl, { 
      method: "GET",
      headers: { "User-Agent": "CharlyBrown-Backend/1.0" }
    });
    if (!upstream.ok) {
      const body = await safeJson(upstream);
      return res.status(upstream.status).json(body);
    }
    const mime = String(upstream.headers.get("content-type") || "application/octet-stream");
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "private, max-age=120");
    return res.status(200).send(buffer);
  } catch (error) {
    applyAssetCorsHeaders(req, res);
    return res.status(500).json({ error: String(error?.message || "Error en proxy de imagen.") });
  }
});

app.get("/api/assets/montage-download", async (req, res) => {
  const queryJobId = req.query?.jobId || req.query?.exportId || req.query?.id || "";
  const jobId = clampExportId(queryJobId);
  const token = clampText(String(req.query?.token || "").trim(), 180);
  console.info("[backend][montage-download] incoming request", {
    queryJobId,
    resolvedJobId: jobId || null,
    hasToken: !!token
  });

  try {
    if (jobId && token) {
      let job = null;
      try {
        job = await resolveMontageExportJobSnapshot(jobId);
      } catch (lookupError) {
        console.error("[backend][montage-download] job snapshot lookup failed", {
          jobId,
          code: String(lookupError?.code || "").trim() || null,
          message: String(lookupError?.message || lookupError).trim()
        });
        applyAssetCorsHeaders(req, res);
        return res.status(503).json({
          error: "No se pudo consultar temporalmente el estado del export.",
          code: "montage_export_lookup_unavailable"
        });
      }
      console.info("[backend][montage-download] resolved job snapshot", {
        jobId,
        exists: !!job,
        status: job?.status || null
      });

      if (job) {
        const jobStatus = String(job.status || "").trim().toLowerCase();
        const result = job.result && typeof job.result === "object" ? job.result : job.export && typeof job.export === "object" ? job.export : null;
        if (!result) {
          applyAssetCorsHeaders(req, res);
          return res.status(409).json({
            error: jobStatus === "ready"
              ? "El resultado del export está incompleto."
              : "El export todavía no está listo para descarga.",
            code: jobStatus === "ready"
              ? "montage_export_result_incomplete"
              : "montage_export_not_ready",
            status: jobStatus || "running",
            stage: String(job.stage || "").trim() || undefined
          });
        }
        const storagePath = normalizeStorageFilePath(result?.storagePath || "");
        const expectedToken = clampText(String(result?.downloadToken || "").trim(), 180);
        console.info("[backend][montage-download] resolved job assets", {
          jobId,
          storagePath,
          expectedToken,
          tokenMatches: expectedToken === token
        });

        if (!storagePath || !expectedToken) {
          applyAssetCorsHeaders(req, res);
          return res.status(409).json({
            error: "El resultado del export está incompleto.",
            code: "montage_export_result_incomplete"
          });
        }
        if (expectedToken !== token) {
          return res.status(403).json({ error: "Token inválido para descarga." });
        }
        const rangeHeader = String(req.headers.range || "").trim();
        const buckets = getStorageBucketCandidates();
        let file = null;
        let meta = null;
        for (const bucket of buckets) {
          if (!bucket) continue;
          try {
            const candidateMeta = await bucket.file(storagePath).getMetadata();
            if (Array.isArray(candidateMeta) && candidateMeta[0]) {
              file = bucket.file(storagePath);
              meta = candidateMeta[0];
              console.info("[backend][montage-download] metadata match on bucket candidate", {
                jobId,
                bucketName: bucket.name,
                sizeBytes: meta.size,
                contentType: meta.contentType
              });
              break;
            }
          } catch (bucketErr) {
            console.warn("[backend][montage-download] bucket candidate metadata fetch failed", {
              jobId,
              bucketName: bucket.name,
              message: bucketErr.message
            });
          }
        }
        const filename = String(result.filename || `${jobId}.${getMontageExportExtension(job.request?.format || "mp4_h264")}`).trim() || `${jobId}.mp4`;
        const mimeType = String(result.mimeType || meta?.contentType || "application/octet-stream").trim() || "application/octet-stream";
        if (!meta || !file) {
          const localExportId = String(result?.exportId || jobId).trim();
          const localFallbackStreamed = await tryStreamMontageExportCacheDownload(req, res, {
            exportId: localExportId,
            token,
            fallbackFilename: filename,
            fallbackMimeType: mimeType
          });
          if (localFallbackStreamed) return;
          applyAssetCorsHeaders(req, res);
          return res.status(404).json({
            error: "El archivo final no está disponible en el almacenamiento.",
            code: "montage_export_storage_object_not_found"
          });
        }
        res.setHeader("Content-Type", mimeType);
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Cache-Control", "private, max-age=60");
        res.setHeader("Content-Disposition", `attachment; filename="${filename.replace(/\"/g, "")}"`);
        await streamStorageFileToResponse(file, res, {
          metadata: meta,
          rangeHeader
        });
        return;
      }
    }

    console.info("[backend][montage-download] falling back to legacy cache check", {
      jobId,
      hasToken: !!token
    });
    const exportId = clampExportId(req.query?.exportId || req.query?.jobId || req.query?.id || "");
    const legacyToken = clampText(String(req.query?.token || "").trim(), 180);
    if (!exportId || !legacyToken) {
      return res.status(400).json({ error: "Falta exportId o token." });
    }
    await cleanupMontageExportCache();
    const legacyStreamed = await tryStreamMontageExportCacheDownload(req, res, {
      exportId,
      token: legacyToken
    });
    if (legacyStreamed) return;
    return res.status(404).json({ error: "Export no encontrado o expirado." });
  } catch (error) {
    return res.status(500).json({ error: String(error?.message || "No se pudo descargar el montaje.") });
  }
});

app.get("/api/assets/proxy-media", async (req, res) => {
  const requestId = randomUUID().slice(0, 8);
  try {
    applyAssetCorsHeaders(req, res);
    const ignoreRange = String(req.query?.noRange || "").trim() === "1" || String(req.query?.noRange || "").trim().toLowerCase() === "true";
    const storagePath = normalizeStorageFilePath(clampText(req.query?.storagePath || "", 700));
    const rawUrl = String(req.query?.url || "").trim();
    const normalizedUrl = rawUrl.includes("%25") ? decodeURIComponent(rawUrl) : rawUrl;
    const rangeHeader = ignoreRange ? "" : String(req.headers.range || "").trim();
    console.info("[backend][proxy-media][request-start]", {
      requestId,
      storagePath: storagePath || undefined,
      rawUrl: rawUrl ? redactUrlForLogs(rawUrl) : undefined,
      normalizedUrl: normalizedUrl ? redactUrlForLogs(normalizedUrl) : undefined,
      hasRange: Boolean(rangeHeader),
      ignoreRange
    });

    if (storagePath) {
      console.info("[backend][proxy-media] attempting storage stream", {
        requestId,
        storagePath,
        hasRange: Boolean(rangeHeader)
      });
      const storageResult = await streamStorageObjectToResponse(req, res, storagePath, rangeHeader, {
        bucketFromUrl: ""
      });
      console.info("[backend][proxy-media][storage-result]", {
        requestId,
        storagePath,
        streamed: Boolean(storageResult?.streamed),
        aborted: Boolean(storageResult?.aborted),
        status: storageResult?.status || null
      });
      if (storageResult?.streamed || storageResult?.aborted) {
        return;
      }
      if (storageResult?.status) {
        applyAssetCorsHeaders(req, res);
        return res.status(storageResult.status).json({
          error: storageResult.status === 403 ? "Archivo no accesible en Storage." : "Archivo no encontrado en Storage.",
          detail: storageResult.detail || {
            storagePath
          }
        });
      }
      return res.status(404).json({
        error: "Archivo no encontrado en Storage.",
        detail: { storagePath }
      });
    }

    if (!normalizedUrl) {
      return res.status(400).json({ error: "Falta parámetro url o storagePath." });
    }
    let parsed = null;
    try {
      parsed = new URL(normalizedUrl);
    } catch (_) {
      return res.status(400).json({ error: "URL inválida." });
    }
    const protocol = String(parsed.protocol || "").toLowerCase();
    if (protocol !== "https:" && protocol !== "http:") {
      return res.status(400).json({ error: "Solo se permiten URLs http/https." });
    }
    const host = String(parsed.hostname || "").toLowerCase();
    const allowedHost = host.endsWith("googleapis.com") || host.endsWith("firebasestorage.app");
    if (!allowedHost) {
      return res.status(403).json({ error: "Host no permitido para proxy." });
    }
    let finalRequestUrl = normalizedUrl;
    // Reconstruct URL if query parameters were split (e.g. &token= was not encoded)
    if (req.query.token && !finalRequestUrl.includes("token=")) {
      const separator = finalRequestUrl.includes("?") ? "&" : "?";
      finalRequestUrl += `${separator}token=${req.query.token}`;
      if (req.query.alt && !finalRequestUrl.includes("alt=")) {
        finalRequestUrl += `&alt=${req.query.alt}`;
      }
    }

    const firebaseObject = parseFirebaseStorageGoogleApisObjectUrl(finalRequestUrl);
    const bucketFromUrl = String(firebaseObject?.bucket || "").trim();
    const objectPath = normalizeStorageFilePath(firebaseObject?.objectPath || "");
    const isPodcasterAsset = /^podcaster\//i.test(String(objectPath || "").trim());
    if (isPodcasterAsset && objectPath) {
      console.info("[backend][proxy-media] attempting admin storage stream", {
        requestId,
        objectPath,
        bucketFromUrl: bucketFromUrl || null,
        hasRange: !!rangeHeader
      });
      const storageResult = await streamStorageObjectToResponse(req, res, objectPath, rangeHeader, {
        bucketFromUrl
      });
      console.info("[backend][proxy-media][admin-storage-result]", {
        requestId,
        objectPath,
        bucketFromUrl: bucketFromUrl || null,
        streamed: Boolean(storageResult?.streamed),
        aborted: Boolean(storageResult?.aborted),
        status: storageResult?.status || null
      });
      if (storageResult?.streamed || storageResult?.aborted) {
        return;
      }
      if (!finalRequestUrl.includes("token=") && (storageResult?.status === 403 || storageResult?.status === 404)) {
        applyAssetCorsHeaders(req, res);
        return res.status(storageResult.status).json({
          error: storageResult.status === 403 ? "Archivo no accesible en Storage." : "Archivo no encontrado en Storage.",
          detail: storageResult.detail || {
            storagePath: objectPath,
            bucketFromUrl: bucketFromUrl || null
          }
        });
      }
    }

    const proxyHeaders = {
      "User-Agent": "CharlyBrown-Backend/1.0",
      ...(rangeHeader ? { Range: rangeHeader } : {})
    };

    console.info("[backend][proxy-media] fetching upstream", { 
      requestId,
      host, 
      hasToken: finalRequestUrl.includes("token="),
      hasRange: !!rangeHeader
    });

    const upstream = await fetchCompat(finalRequestUrl, {
      method: "GET",
      headers: proxyHeaders
    });
    if (!upstream.ok && upstream.status !== 206) {
      applyAssetCorsHeaders(req, res);
      const body = await safeJson(upstream);
      console.warn("[backend][proxy-media][upstream-nonok]", {
        requestId,
        status: upstream.status,
        host,
        hasToken: finalRequestUrl.includes("token=")
      });
      return res.status(upstream.status).json(body);
    }
    const mime = String(upstream.headers.get("content-type") || "application/octet-stream");
    const contentLength = String(upstream.headers.get("content-length") || "").trim();
    const contentRange = String(upstream.headers.get("content-range") || "").trim();
    const acceptRanges = String(upstream.headers.get("accept-ranges") || "bytes").trim() || "bytes";
    const cacheControl = String(upstream.headers.get("cache-control") || "private, max-age=120").trim();
    const stream = coerceReadableStream(upstream.body);
    if (!stream) {
      const err = new Error("proxy_media_stream_unavailable");
      err.code = "proxy_media_stream_unavailable";
      throw err;
    }
    console.info("[backend][proxy-media][upstream-ready]", {
      requestId,
      status: upstream.status,
      contentType: mime,
      contentLength: contentLength || null,
      contentRange: contentRange || null,
      acceptRanges
    });
    let responseFinished = false;
    res.once("finish", () => {
      responseFinished = true;
    });
    const maybeDestroyUpstream = (reason = "response-close") => {
      const shouldDestroy = shouldDestroyProxyMediaUpstream({
        requestAborted: req.destroyed === true || reason === "request-aborted",
        responseFinished,
        responseClosed: reason === "response-close"
      });
      if (!shouldDestroy) return;
      if (stream && typeof stream.destroy === "function" && !stream.destroyed) {
        console.info("[backend][proxy-media] closing upstream body stream", {
          requestId,
          reason
        });
        stream.destroy();
      }
    };
    req.once("aborted", () => {
      maybeDestroyUpstream("request-aborted");
    });
    res.once("close", () => {
      maybeDestroyUpstream("response-close");
    });
    res.setHeader("Content-Type", mime);
    if (contentLength) res.setHeader("Content-Length", contentLength);
    if (contentRange) res.setHeader("Content-Range", contentRange);
    if (acceptRanges) res.setHeader("Accept-Ranges", acceptRanges);
    if (cacheControl) res.setHeader("Cache-Control", cacheControl);
    await safePipeline(stream, res.status(upstream.status === 206 ? 206 : 200));
    return;
  } catch (error) {
    const errorText = String(error?.code || error?.message || "").trim();
    const isClientAbort = req.destroyed || error?.code === "ERR_STREAM_PREMATURE_CLOSE";
    if (isClientAbort) {
      console.info("[backend][proxy-media] request closed before completion", {
        requestId,
        message: String(error?.message || error)
      });
      return;
    }
    applyAssetCorsHeaders(req, res);
    console.error("[backend][proxy-media][error]", {
      requestId,
      message: String(error?.message || error),
      code: String(error?.code || "").trim() || null
    });
    return res.status(500).json({ error: String(error?.message || "Error en proxy de media.") });
  }
});

app.use((error, req, res, next) => {
  const status = Number(error?.status || error?.statusCode || 0) || 0;
  const errorType = String(error?.type || error?.code || "").trim();
  const errorName = String(error?.name || "").trim();
  if (status === 413 || errorType === "entity.too.large" || errorName === "PayloadTooLargeError") {
    applyAssetCorsHeaders(req, res);
    return res.status(413).json({
      error: "payload_too_large",
      code: "payload_too_large",
      detail: {
        limit: MAX_BODY,
        path: String(req.originalUrl || req.path || "").trim() || undefined
      }
    });
  }
  return next(error);
});

if (IS_MAIN_MODULE) {
  app.listen(PORT, HOST, () => {
    console.log("[backend] startup signature", {
      file: "backend/server.js",
      pid: process.pid,
      startedAt: BACKEND_BOOT_ISO,
      startupSignature: BACKEND_BOOT_SIGNATURE,
      montageRenderRuntime: IS_RENDER_RUNTIME ? "render" : "non-render",
      moodleModuleGraphicsRoute: true,
      podcasterDialogueAudioRoute: true
    });
    console.log(`[gemini-backend] listening on http://${HOST}:${PORT}`);
  });
}

module.exports = {
  app,
  db,
  storageBucket,
  montageExportJobStore,
  executeMontageExportPipeline,
  buildMontageSceneFailure,
  getBackendPublicBaseUrl,
  buildBackendPodcasterStudioScenePrompt,
  getMontageExportCacheMetaPath,
  getMontageExportCacheFilePath,
  writeMontageExportCacheArtifact,
  tryStreamMontageExportCacheDownload
};
