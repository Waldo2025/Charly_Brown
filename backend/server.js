const express = require("express");
const cors = require("cors");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("node:child_process");
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
  createMontageExportJobStore
} = require("./montage-export/job-store-firestore.js");
const {
  sanitizeMontageExportJobPublicPayload
} = require("./montage-export/public-payload.js");
const {
  createProcessMontageExportJob
} = require("./montage-export/worker-runner.js");
const {
  shouldContinueVariantFallback
} = require("./podcaster-video-variant-fallback.js");
const {
  createHeavyWorkCoordinator,
  validateDialogueVideoInlineReferenceBudget
} = require("./podcaster-stability.js");
const {
  resolveOnScreenTextExportCanvasSize,
  resolveOnScreenTextRenderSpec
} = require(path.resolve(__dirname, "..", "public", "on-screen-text-render-spec.js"));

let admin = null;
let GoogleGenAI = null;
let ffmpegStaticPath = "";
try {
  admin = require("firebase-admin");
} catch (_) {
  admin = require(path.resolve(__dirname, "..", "functions", "node_modules", "firebase-admin"));
}
try {
  ({ GoogleGenAI } = require(path.resolve(__dirname, "..", "functions", "node_modules", "@google", "genai")));
} catch (_) {
  ({ GoogleGenAI } = require("@google/genai"));
}
try {
  ffmpegStaticPath = String(require("ffmpeg-static") || "").trim();
} catch (_) {
  ffmpegStaticPath = "";
}
console.log(`[backend] ffmpeg static path: ${ffmpegStaticPath || "not found"}`);

// Startup diagnostic for ffmpeg filters
if (ffmpegStaticPath) {
  try {
    const { execSync } = require("child_process");
    const filters = execSync(`"${ffmpegStaticPath}" -filters`, { encoding: "utf8" });
    if (filters.includes("drawtext")) {
      console.log("[backend] ffmpeg diagnostic: 'drawtext' filter IS available.");
    } else {
      console.warn("[backend] ffmpeg diagnostic WARNING: 'drawtext' filter NOT found in binary filters list.");
    }
  } catch (err) {
    console.error("[backend] ffmpeg diagnostic error:", err.message);
  }
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
const MAX_BODY = "12mb";
const MAX_PAYLOAD_BYTES = 120 * 1024;
const MAX_PODCASTER_SESSION_BYTES = 900 * 1024;
const MAX_SPEAKER_PORTRAIT_BYTES = 10 * 1024 * 1024;
const MAX_PODCASTER_MUSIC_BYTES = 12 * 1024 * 1024;
const MAX_DIALOGUE_VIDEO_BYTES = 80 * 1024 * 1024;
const MAX_DIALOGUE_AUDIO_BYTES = 24 * 1024 * 1024;
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
  "veo-3.1-fast-generate-preview"
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
  return `0x${hex}@${clamp01(alpha, 1).toFixed(3)}`;
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
    await pipeline(stream, res.status(206));
    return;
  }
  if (total > 0) {
    res.setHeader("Content-Length", String(total));
  }
  const stream = targetFile.createReadStream();
  await pipeline(stream, res.status(200));
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

async function probeMediaHasAudioWithFfmpeg(inputPath = "") {
  const probeResult = await runFfmpegCommand([
    "-hide_banner",
    "-i", String(inputPath || "").trim(),
    "-f", "null", "-"
  ], {
    stage: "probe_audio",
    timeoutMs: MONTAGE_EXPORT_SCENE_PROBE_TIMEOUT_MS,
    timeoutCode: "scene_probe_timeout"
  });
  return /Stream #.*: Audio:/i.test(probeResult.stderr || "");
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
  credentials: false
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
    || `${projectId}.appspot.com`
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

function getStorageBucketCandidates() {
  return STORAGE_BUCKET_CANDIDATES.filter(Boolean);
}

let resolvedWritableStorageBucket = null;
let resolvedWritableStorageBucketPromise = null;

function isMissingBucketError(error) {
  const message = String(error?.message || "").toLowerCase();
  const status = Number(error?.code || error?.statusCode || error?.status || 0) || 0;
  return status === 404 || message.includes("bucket does not exist") || message.includes("specified bucket does not exist");
}

async function resolveWritableStorageBucket() {
  if (resolvedWritableStorageBucket) return resolvedWritableStorageBucket;
  if (resolvedWritableStorageBucketPromise) return resolvedWritableStorageBucketPromise;
  resolvedWritableStorageBucketPromise = (async () => {
    const buckets = getStorageBucketCandidates();
    for (const bucket of buckets) {
      if (!bucket) continue;
      try {
        // eslint-disable-next-line no-await-in-loop
        await bucket.getMetadata();
        resolvedWritableStorageBucket = bucket;
        console.info("[backend][storage] resolved writable bucket", {
          bucket: String(bucket.name || "").trim()
        });
        return bucket;
      } catch (error) {
        if (!isMissingBucketError(error)) {
          console.warn("[backend][storage] bucket probe failed", {
            bucket: String(bucket?.name || "").trim(),
            message: String(error?.message || error)
          });
        }
      }
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
      // eslint-disable-next-line no-await-in-loop
      const [downloaded] = await bucket.file(cleanStoragePath).download();
      return {
        buffer: Buffer.from(downloaded),
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

const MONTAGE_EXPORT_CACHE_DIR = path.join(os.tmpdir(), "cb-montage-exports-cache");
const MONTAGE_EXPORT_CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2h
const MONTAGE_EXPORT_CACHE_MAX_ITEMS = 40;
const MONTAGE_EXPORT_JOB_TTL_MS = 2 * 60 * 60 * 1000;
const MONTAGE_EXPORT_SCENE_DOWNLOAD_TIMEOUT_MS = 2 * 60 * 1000;
const MONTAGE_EXPORT_SCENE_DOWNLOAD_IDLE_TIMEOUT_MS = 90 * 1000;
const MONTAGE_EXPORT_SCENE_PROBE_TIMEOUT_MS = 30 * 1000;
const MONTAGE_EXPORT_SCENE_RENDER_TIMEOUT_MS = 3 * 60 * 1000;
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
  await fs.promises.writeFile(metaPath, JSON.stringify(source), "utf8");
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
    if (Number(parsed.expiresAtMs || 0) && Number(parsed.expiresAtMs || 0) < Date.now()) {
      await fs.promises.rm(metaPath, { force: true }).catch(() => {});
      return null;
    }
    return parsed;
  } catch (_) {
    return null;
  }
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
    updatedAt: new Date().toISOString(),
    expiresAtMs: Date.now() + MONTAGE_EXPORT_JOB_TTL_MS
  };
  const next = {
    ...prev,
    ...patch,
    jobId: id,
    progress: Math.max(0, Math.min(1, Number(patch?.progress ?? prev.progress ?? 0) || 0)),
    updatedAt: new Date().toISOString(),
    expiresAtMs: Date.now() + MONTAGE_EXPORT_JOB_TTL_MS
  };
  if (Array.isArray(patch?.warnings)) next.warnings = patch.warnings;
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
  const educational = String(contentMode || "").trim().toLowerCase() === "educational";
  const speakerIndex = normalizePodcasterSpeakerSlotIndex(speakerLabel);
  const stageZones = educational
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
  const zoneLabel = stageZones[speakerIndex % stageZones.length];
  const eyelineDirection = eyelineDirections[speakerIndex % eyelineDirections.length];
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
    "Evitar pose frontal de presentador y evitar contacto visual directo con la cámara.",
    "Mostrar un solo locutor claramente identificable en cuadro.",
    "Composición obligatoria de sujeto único: foreground y background limpios de personas.",
    "La cámara nunca debe convertirse en el interlocutor principal; mantener la atención del locutor en la conversación.",
    "Encuadre medio corto, cámara a la altura de los ojos, fondo elegante, profundidad de campo ligera.",
    `La puesta en escena debe acompañar una actitud ${expression}.`,
    "Mantener continuidad visual entre escenas: misma cabina, mismo set, misma dirección de luz, mismo estilo de vestuario.",
  ];
  if (singleSubjectOnly) {
    lines.push(
      "Retrato de sujeto único estricto: no agregar ninguna otra persona en el escenario.",
      "Prohibido segunda figura humana visible o parcial: no espalda, no hombro, no cabeza desenfocada, no perfil, no reflejo, no sombra humana.",
      educational
        ? "La imagen debe parecer un retrato editorial limpio del personaje activo dentro del set educativo."
        : "La imagen debe parecer un retrato editorial limpio del locutor activo dentro del set."
    );
  } else {
    lines.push(
      educational
        ? "La escena debe sentirse como explicación didáctica; el personaje atiende al contenido o a un recurso visual, no al espectador."
        : "La escena debe sentirse como conversación entre locutores; el personaje atiende al interlocutor, no al espectador.",
      counterpartSpeakerName
        ? educational
          ? `La mirada debe sugerir atención a un recurso o co-presentador fuera de cuadro, sin frontalidad directa.`
          : `La mirada debe sugerir escucha activa hacia ${counterpartSpeakerName}, pero siempre con el interlocutor completamente fuera de cuadro.`
        : "",
      educational
        ? "Priorizar miradas laterales, reacción didáctica y microgestos que ayuden a explicar el contenido."
        : "Priorizar miradas laterales, reacción conversacional y microgestos que indiquen escucha activa entre locutores."
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
      const [meta] = await file.getMetadata().catch(() => [{}]);
      const [downloaded] = await file.download();
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
  const rowsInput = Array.isArray(raw?.script?.rows) ? raw.script.rows : [];
  const rows = rowsInput.slice(0, 400).map((row, index) => ({
    id: clampText(row?.id || `row_${index + 1}`, 80) || `row_${index + 1}`,
    speaker: clampText(row?.speaker || "Host A", 80) || "Host A",
    expression: clampText(row?.expression || "Neutral", 80) || "Neutral",
    durationSec: Math.max(6, Math.min(180, Number(row?.durationSec) || 18)),
    mediaCue: clampText(row?.mediaCue || "Sin media", 80) || "Sin media",
    text: clampText(row?.text || "", 12000),
    notes: clampText(row?.notes || "", 5000),
    voiceOverText: clampText(row?.voiceOverText || "", 12000),
    voiceOverOriginalText: clampText(row?.voiceOverOriginalText || "", 12000),
    sceneDescription: clampText(row?.sceneDescription || "", 5000),
    onScreenText: clampText(row?.onScreenText || "", 1600),
    onScreenTextNoSummarize: row?.onScreenTextNoSummarize === true,
    transition: clampText(row?.transition || "", 1200),
    visualNotes: clampText(row?.visualNotes || "", 5000),
    visualNotesOriginalText: clampText(row?.visualNotesOriginalText || "", 5000),
    visualNotesOriginalStored: row?.visualNotesOriginalStored === true,
    videoDirective: clampText(row?.videoDirective || "", 1400),
    scenePrompt: clampText(row?.scenePrompt || "", 1200),
    imagePrompts: Array.isArray(row?.imagePrompts)
      ? row.imagePrompts.slice(0, 3).map((prompt) => clampText(prompt || "", 1200)).filter(Boolean)
      : String(row?.imagePrompts || "")
        .split(/\n+/)
        .map((prompt) => clampText(prompt || "", 1200))
        .filter(Boolean)
        .slice(0, 3),
    publicSceneLibraryId: clampText(row?.publicSceneLibraryId || "", 140),
    publicScenePublishedAt: clampText(row?.publicScenePublishedAt || "", 64),
    publicSceneTitle: clampText(row?.publicSceneTitle || "", 220),
    publicSceneThumbUrl: clampText(row?.publicSceneThumbUrl || "", 3000),
    publicSceneVideoUrl: clampText(row?.publicSceneVideoUrl || "", 3000),
    sourcePublicSceneLibraryId: clampText(row?.sourcePublicSceneLibraryId || "", 140),
    disfluencyConfig: normalizeDisfluency(row?.disfluencyConfig || {})
  }));
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

  const sanitizeReferenceImageMap = (rawMap = {}, maxEntries = 120) => {
    const source = rawMap && typeof rawMap === "object" ? rawMap : {};
    const next = {};
    Object.entries(source).slice(0, maxEntries).forEach(([rawKey, value]) => {
      const key = clampText(rawKey || "", 160);
      if (!key || !value || typeof value !== "object") return;
      const dataUrl = clampText(String(value?.dataUrl || "").trim(), 900_000);
      if (!dataUrl.startsWith("data:image/")) return;
      next[key] = {
        name: clampText(value?.name || "Referencia", 180) || "Referencia",
        dataUrl,
        mimeType: clampText(value?.mimeType || "image/png", 120).trim().toLowerCase() || "image/png",
        updatedAt: clampText(value?.updatedAt || new Date().toISOString(), 64) || new Date().toISOString()
      };
    });
    return next;
  };

  const speakerReferenceImageMap = sanitizeReferenceImageMap(raw?.speakerReferenceImageMap || {}, 40);
  const scenarioReferenceImageMap = sanitizeReferenceImageMap(raw?.scenarioReferenceImageMap || {}, 120);
  const sanitizeReferenceImageListMap = (rawMap = {}, maxEntries = 500, maxItemsPerEntry = 4) => {
    const source = rawMap && typeof rawMap === "object" ? rawMap : {};
    const next = {};
    Object.entries(source).slice(0, maxEntries).forEach(([rawKey, value]) => {
      const key = clampText(rawKey || "", 160);
      const list = Array.isArray(value) ? value : [];
      if (!key || !list.length) return;
      const normalizedList = list.slice(0, maxItemsPerEntry).map((item) => {
        const dataUrl = clampText(String(item?.dataUrl || "").trim(), 900_000);
        if (!dataUrl.startsWith("data:image/")) return null;
        return {
          name: clampText(item?.name || "Referencia", 180) || "Referencia",
          dataUrl,
          mimeType: clampText(item?.mimeType || "image/png", 120).trim().toLowerCase() || "image/png",
          updatedAt: clampText(item?.updatedAt || new Date().toISOString(), 64) || new Date().toISOString()
        };
      }).filter(Boolean);
      if (normalizedList.length) next[key] = normalizedList;
    });
    return next;
  };
  const rowReferenceImageListMap = sanitizeReferenceImageListMap(raw?.rowReferenceImageListMap || {}, 500, 4);
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
      if (!dataUrl.startsWith("data:video/")) return;
      next[key] = {
        name: clampText(value?.name || "Referencia de video", 180) || "Referencia de video",
        dataUrl,
        mimeType: clampText(value?.mimeType || "video/mp4", 120).trim().toLowerCase() || "video/mp4",
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
  Object.entries(dialogueVideoMapRaw).slice(0, 800).forEach(([rowId, clip]) => {
    const key = clampText(rowId, 120);
    if (!key || !clip || typeof clip !== "object") return;
    const mediaRef = normalizePersistedMediaReference({
      downloadUrl: clampText(clip?.downloadUrl || "", 3000),
      storagePath: clampText(clip?.storagePath || "", 700)
    });
    const downloadUrl = clampText(mediaRef.downloadUrl || "", 3000);
    const storagePath = clampText(mediaRef.storagePath || "", 700);
    if (!storagePath && !downloadUrl) return;
    const segmentsRaw = Array.isArray(clip?.segments) ? clip.segments : [];
    const segments = segmentsRaw.slice(0, 16).map((segment, idx) => {
      const segmentRef = normalizePersistedMediaReference({
        downloadUrl: clampText(segment?.downloadUrl || "", 3000),
        storagePath: clampText(segment?.storagePath || "", 700)
      });
      const segUrl = clampText(segmentRef.downloadUrl || "", 3000);
      const segPath = clampText(segmentRef.storagePath || "", 700);
      if (!segPath && !segUrl) return null;
      return {
        id: clampText(segment?.id || `${key}-seg-${idx + 1}`, 120) || `${key}-seg-${idx + 1}`,
        index: Math.max(0, Number(segment?.index) || idx),
        durationSec: clampNumber(segment?.durationSec, 0, 8, 0),
        downloadUrl: segUrl,
        storagePath: segPath,
        mimeType: clampText(segment?.mimeType || "video/mp4", 120) || "video/mp4",
        variant: clampText(segment?.variant || "", 120),
        targetSpeechLine: clampText(segment?.targetSpeechLine || "", 2200)
      };
    }).filter(Boolean);
    dialogueVideoMap[key] = {
      rowId: key,
      speaker: clampText(clip?.speaker || "", 80),
      mimeType: clampText(clip?.mimeType || "video/mp4", 120) || "video/mp4",
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
      publicSceneVideoUrl: clampText(clip?.publicSceneVideoUrl || "", 3000)
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
    if (!storagePath && !downloadUrl) return;
    dialogueAudioMap[key] = {
      rowId: key,
      speaker: clampText(clip?.speaker || "", 80),
      mimeType: clampText(clip?.mimeType || "audio/wav", 120) || "audio/wav",
      model: clampText(clip?.model || "gemini-3.1-flash-tts-preview", 140) || "gemini-3.1-flash-tts-preview",
      promptVersion: clampText(clip?.promptVersion || "podcaster_live_audio_v1", 80) || "podcaster_live_audio_v1",
      durationSec: clampNumber(clip?.durationSec, 0, 180, 0),
      targetSpeechLine: clampText(clip?.targetSpeechLine || "", 2200),
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
      type: ["cut", "crossfade", "dip-black"].includes(transitionType) ? transitionType : "cut",
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
      : []
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
    onScreenTextTrack: sanitizeOnScreenTextTrack(raw?.podcastVideoConfig?.onScreenTextTrack || {}),
    geminiDialogueTrack: sanitizeGeminiDialogueTrack(raw?.podcastVideoConfig?.geminiDialogueTrack || {}),
    geminiDialogueTrackIndex: Math.max(0, Math.min(999, Math.floor(Number(raw?.podcastVideoConfig?.geminiDialogueTrackIndex) || 0))),
    montageDefaultVeoVolumePct: clampNumber(raw?.podcastVideoConfig?.montageDefaultVeoVolumePct, 0, 100, 0),
    montageDefaultGeminiVolumePct: clampNumber(raw?.podcastVideoConfig?.montageDefaultGeminiVolumePct, 0, 100, 100)
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
                return [loopIndex, { loopIndex, trimInMs, trimOutMs }];
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
    const child = spawn(ffmpegStaticPath, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });
    const timeoutMs = Math.max(0, Number(context?.timeoutMs || 0) || 0);
    let timeoutId = null;
    let settled = false;
    let didTimeout = false;
    let stdout = "";
    let stderr = "";
    const finalizeReject = (error) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      reject(error);
    };
    const finalizeResolve = (value) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      resolve(value);
    };
    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        didTimeout = true;
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
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk || "");
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });
    child.on("error", (error) => {
      const err = new Error(`ffmpeg_spawn_error: ${String(error?.message || error || "unknown")}`);
      err.code = "ffmpeg_spawn_error";
      err.stage = String(context?.stage || "spawn").trim() || "spawn";
      err.stderr = stderr;
      finalizeReject(err);
    });
    child.on("close", (code) => {
      if (didTimeout) {
        const err = new Error(`${String(context?.timeoutCode || "ffmpeg_timeout").trim() || "ffmpeg_timeout"}_${timeoutMs}`);
        err.code = String(context?.timeoutCode || "ffmpeg_timeout").trim() || "ffmpeg_timeout";
        err.timeoutMs = timeoutMs;
        err.stage = String(context?.stage || "run").trim() || "run";
        err.stdout = stdout;
        err.stderr = stderr;
        err.detail = {
          stage: err.stage,
          timeoutMs,
          stderrPreview: buildMontageStderrPreview(stderr),
          stdoutPreview: buildMontageStderrPreview(stdout, 8, 1200)
        };
        finalizeReject(err);
        return;
      }
      if (Number(code || 0) === 0) {
        finalizeResolve({ stdout, stderr, code: 0 });
        return;
      }
      const err = new Error(`ffmpeg_exit_code_${code}`);
      err.code = "ffmpeg_exit_code";
      err.exitCode = Number(code || 1);
      err.stage = String(context?.stage || "run").trim() || "run";
      err.stdout = stdout;
      err.stderr = stderr;
      err.detail = {
        stage: err.stage,
        stderrPreview: buildMontageStderrPreview(stderr),
        stdoutPreview: buildMontageStderrPreview(stdout, 8, 1200)
      };
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
    const transcodeArgs = hasInputAudio
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
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-ar",
        "48000",
        "-b:a",
        "160k",
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
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
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

app.use("/api/podcaster", async (req, res, next) => {
  if (req.method === "OPTIONS") return next();
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
    const prefix = includeAllOwners
      ? `podcaster/sessions/${sessionSlug}/owners/`
      : `podcaster/sessions/${sessionSlug}/owners/${ownerSlug}/videos/`;

    const buckets = getStorageBucketCandidates();
    const filesByPath = new Map();

    await Promise.allSettled(buckets.map(async (bucket) => {
      if (!bucket) return;
      try {
        // Use delimiter:"" to list all files recursively under prefix
        const [files] = await bucket.getFiles({ prefix, maxResults: 200 });
        for (const file of files) {
          const filePath = String(file.name || "").trim();
          if (!filePath || filesByPath.has(filePath)) continue;
          // Only include video files
          const ext = filePath.split(".").pop().toLowerCase();
          if (!["mp4", "webm", "mov", "mkv"].includes(ext)) continue;
          const [metadata] = await file.getMetadata().catch(() => [{}]);
          const token = String(metadata?.metadata?.firebaseStorageDownloadTokens || "").trim();
          const downloadUrl = token
            ? `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media&token=${token}`
            : `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media`;
          // Extract row slug from path: .../videos/{rowSlug}/{filename}
          const pathParts = filePath.split("/");
          const fileIdx = pathParts.indexOf("videos");
          const rowFolder = fileIdx >= 0 && pathParts[fileIdx + 1] ? pathParts[fileIdx + 1] : "";
          const ownerIdx = pathParts.indexOf("owners");
          const ownerFolder = ownerIdx >= 0 && pathParts[ownerIdx + 1] ? pathParts[ownerIdx + 1] : "";
          const fileName = pathParts[pathParts.length - 1] || filePath;
          filesByPath.set(filePath, {
            name: fileName,
            ownerFolder,
            rowFolder,
            storagePath: filePath,
            downloadUrl,
            size: Number(metadata?.size || 0),
            updatedAt: String(metadata?.updated || metadata?.timeCreated || "").trim() || null
          });
        }
      } catch (_) {
        // Ignore per-bucket errors and try next bucket
      }
    }));

    const videos = Array.from(filesByPath.values())
      .sort((a, b) => {
        // Sort by rowFolder first, then by updatedAt desc
        if (a.rowFolder < b.rowFolder) return -1;
        if (a.rowFolder > b.rowFolder) return 1;
        return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
      });

    return res.status(200).json({ ok: true, prefix, videos });
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
    const speakerLabel = clampText(req.body?.speakerLabel || "", 80);
    const speakerName = clampText(req.body?.speakerName || "", 120) || speakerLabel || "Locutor";
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
    });
    const studioScenePrompt = buildBackendPodcasterStudioScenePrompt({
      speakerLabel,
      speakerName,
      scenarioPrompt,
      expression,
      singleSubjectOnly: true,
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
          upsertDialogueVideoJob(jobId, {
            status: "error",
            stage: "error",
            progress: 1,
            hint: String(data?.error || `HTTP ${syncResponse.status}`).trim() || "No se pudo generar el video.",
            error: {
              error: String(data?.error || "dialogue_video_generate_failed").trim(),
              code: String(data?.code || "").trim() || undefined,
              status: Number(syncResponse.status || 500),
              detail: data?.detail && typeof data.detail === "object" ? data.detail : undefined
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
    let scenarioPrompt = clampText(req.body?.scenarioPrompt || "", 2400);
    const videoDirective = clampText(req.body?.videoDirective || "", 1400);
    const scenePrompt = clampText(req.body?.scenePrompt || "", 1200);
    const contentMode = String(req.body?.contentMode || "").trim().toLowerCase();
    const educationalVideo = req.body?.educationalVideo === true || req.body?.videoMode === true || contentMode === "educational";
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
    const canPreferFastModel = !strictIdentity && !portraitUrl && !portraitStoragePath;
    const filteredModels = strictIdentity
      ? mergedModels.filter((modelName) => !/fast/i.test(String(modelName || "")))
      : mergedModels;
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

    console.info(`[backend][${requestDebugTag}] request`, {
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
      modelCandidates: videoModels
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
    const characterPrompt = educationalVideo
      ? ""
      : buildBackendPodcasterCharacterPrompt({
        speakerLabel,
        speakerName,
        voiceName,
        genderGroup,
        expression,
        counterpartSpeakerName,
        contentMode: "podcast"
      });
    const studioScenePrompt = educationalVideo
      ? ""
      : buildBackendPodcasterStudioScenePrompt({
        speakerLabel,
        speakerName,
        counterpartSpeakerName,
        scenarioPrompt,
        expression,
        contentMode: "podcast"
      });
    const sceneVisualPrompt = scenePrompt || [
      educationalVideo ? "Escena educativa basada en guion técnico." : `Escena de ${speakerName}.`,
      scenarioPrompt ? `Contexto visual: ${scenarioPrompt}` : "",
      videoDirective ? `Prioridad manual: ${videoDirective}` : ""
    ].filter(Boolean).join(" ").trim();
    const sceneImagePromptList = imagePrompts.length ? imagePrompts : (sceneVisualPrompt ? [
      `${sceneVisualPrompt} Imagen principal horizontal 16:9.`,
      `${sceneVisualPrompt} Variante en plano cerrado, y otra toma de apoyo del set.`
    ] : []);

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

    const prompt = [
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
    const referenceDurationSec = inferredTargetDurationSec;

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
            instances: [{
              prompt,
              ...((sceneReferenceAssets.length || continuityReferenceImage) ? {
                referenceImages: [
                  ...sceneReferenceAssets,
                  ...(continuityReferenceImage ? [continuityReferenceImage] : [])
                ]
              } : {})
            }],
            parameters: {
              aspectRatio: "16:9",
              durationSeconds: inferredTargetDurationSec
            }
          }
        },
        {
          label: "text-only+aspect",
          body: {
            instances: [{
              prompt,
              ...((sceneReferenceAssets.length || continuityReferenceImage) ? {
                referenceImages: [
                  ...sceneReferenceAssets,
                  ...(continuityReferenceImage ? [continuityReferenceImage] : [])
                ]
              } : {})
            }],
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

    for (const videoModel of effectiveVideoModels) {
      let modelReturnedDoneWithoutMedia = false;
      for (const [variantIndex, variant] of effectiveRequestVariants.entries()) {
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
          console.warn(`[backend][${requestDebugTag}] variant-finished-without-media`, {
            model: videoModel,
            variant: String(variant?.label || "").trim(),
            remainingVariants: fallbackDecision.remainingVariants,
            continueCurrentModel: fallbackDecision.continueCurrentModel,
            logReason: fallbackDecision.logReason
          });
          if (fallbackDecision.continueCurrentModel) {
            continue;
          }
          break;
        }

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
        console.warn(`[backend][${requestDebugTag}] switching-video-model-after-empty-media`, {
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
      console.warn(`[backend][${requestDebugTag}] generation failed`, {
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
    `Accent: ${accentLine}`,
    `Delivery guardrails: ${clampText(disfluencyInstruction || "Natural, clean articulation.", 1800)}`,
    notes ? `Additional notes: ${clampText(notes, 1200)}` : "",
    originalText ? `Reference only, do not read: "${String(clampText(originalText, 2000)).replace(/"/g, '\\"')}"` : "",
    "",
    "### TRANSCRIPT",
    `"${String(transcript).replace(/"/g, '\\"')}"`
  ].filter(Boolean).join("\n");
}

app.post("/api/podcaster/dialogue-audio/generate", async (req, res) => {
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
    const originalText = clampText(req.body?.originalText || "", 2000);
    const disfluencyInstruction = clampText(req.body?.disfluencyInstruction || "", 1800);
    const ttsDirection = normalizeGeminiTtsDirectionConfig(req.body?.ttsDirection || {});
    const notes = clampText(req.body?.notes || "", 1200);
    const contentMode = String(req.body?.contentMode || "").trim().toLowerCase();
    const educationalAudio = req.body?.videoMode === true || contentMode === "educational";
    const regenerate = req.body?.regenerate === true;
    const previousStoragePath = clampText(req.body?.previousStoragePath || "", 700);
    const model = normalizeModel(req.body?.model || "gemini-3.1-flash-tts-preview");

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
    const finalBuffer = pcmLike ? pcm16ToWavBuffer(merged, sampleRate) : merged;
    const finalMime = pcmLike ? "audio/wav" : (firstMime.startsWith("audio/") ? firstMime.split(";")[0] : "audio/wav");
    const durationSec = pcmLike
      ? clampNumber(merged.length / Math.max(1, sampleRate * 2), 0, 180, 0)
      : clampNumber(parseWavDurationSeconds(finalBuffer), 0, 180, 0);

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
        targetSpeechLine,
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

function resolveMontageExportVideoParams(format = "mp4_h264", qualityPreset = "balanced", bitrateSettings = null) {
  const cleanFormat = String(format || "").trim().toLowerCase();
  const preset = ["high", "balanced", "small"].includes(String(qualityPreset || "").trim().toLowerCase())
    ? String(qualityPreset).trim().toLowerCase()
    : "balanced";

  if (cleanFormat === "webm_vp9") {
    const crf = preset === "high" ? 28 : preset === "small" ? 36 : 32;
    return {
      container: "webm",
      vCodec: "libvpx-vp9",
      vArgs: ["-b:v", "0", "-crf", String(crf), "-deadline", "good"],
      aCodec: "libopus",
      aArgs: ["-b:a", "128k"]
    };
  }

  let crf = preset === "high" ? 18 : preset === "small" ? 24 : 20;
  let x264Preset = preset === "high" ? "slow" : preset === "small" ? "fast" : "medium";
  let maxRate = preset === "high" ? "8M" : (preset === "small" ? "2M" : "5M");
  let bufSize = preset === "high" ? "16M" : (preset === "small" ? "4M" : "10M");
  let isCbr = false;

  // Apply manual settings if provided
  if (bitrateSettings && typeof bitrateSettings === "object") {
    if (bitrateSettings.mode === "custom") {
      crf = Math.max(0, Math.min(51, Number(bitrateSettings.minBitrateCrf || 23)));
      const customMax = Math.max(0.1, Math.min(100, Number(bitrateSettings.maxBitrateMbps || 5)));
      maxRate = `${customMax}M`;
      bufSize = `${customMax * 2}M`;
    } else if (bitrateSettings.mode === "cbr") {
      isCbr = true;
      const customMax = Math.max(0.1, Math.min(100, Number(bitrateSettings.maxBitrateMbps || 5)));
      maxRate = `${customMax}M`;
      bufSize = `${customMax}M`; // For CBR, maxrate and bufsize should be same or tight
    }
  }

  const vArgs = ["-preset", x264Preset];
  if (isCbr) {
    vArgs.push("-b:v", maxRate, "-maxrate", maxRate, "-bufsize", bufSize);
  } else {
    vArgs.push("-crf", String(crf), "-maxrate", maxRate, "-bufsize", bufSize);
  }
  vArgs.push("-movflags", "+faststart");

  return {
    container: "mp4",
    vCodec: "libx264",
    vArgs,
    aCodec: "aac",
    aArgs: ["-b:a", "160k"]
  };
}

function resolveMontageExportScaleFilter(resolution = "source") {
  const key = String(resolution || "").trim().toLowerCase();
  if (key === "source") return "";
  const target = key === "1080p" ? { w: 1920, h: 1080 } : key === "720p" ? { w: 1280, h: 720 } : { w: 854, h: 480 };
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
    return host.endsWith("googleapis.com") || host.endsWith("firebasestorage.app") || host === "storage.googleapis.com";
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
      if (/%2f/i.test(objectPath) || /%25/i.test(objectPath)) {
        try {
          objectPath = decodeURIComponent(objectPath);
        } catch (_) {
          // noop
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

function deriveStoragePathFromMediaSource(url = "", storagePath = "") {
  const cleanStoragePath = normalizeStorageFilePath(storagePath);
  if (cleanStoragePath) return cleanStoragePath;
  return normalizeStorageFilePath(parseFirebaseStorageGoogleApisObjectUrl(url)?.objectPath || "");
}

async function downloadStoragePathToFile(storagePath = "", outPath = "") {
  const cleanPath = normalizeStorageFilePath(storagePath);
  const targetPath = String(outPath || "").trim();
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

        const clearIdleTimer = () => {
          if (idleTimer) {
            clearTimeout(idleTimer);
            idleTimer = null;
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
          if (error) {
            reject(error);
            return;
          }
          resolve(targetPath);
        };

        armIdleTimer();
        readStream.on("data", () => {
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

async function downloadUrlToFile(url = "", outPath = "") {
  const cleanUrl = String(url || "").trim();
  const targetPath = String(outPath || "").trim();
  if (!cleanUrl || !targetPath) {
    const err = new Error("missing_download_url");
    err.code = "missing_download_url";
    err.detail = { url: cleanUrl, outPath: targetPath };
    throw err;
  }
  if (!isAllowedRemoteMediaUrl(cleanUrl)) {
    const err = new Error("url_not_allowed");
    err.code = "url_not_allowed";
    err.detail = { url: cleanUrl };
    throw err;
  }

  let firebaseAdminAttempted = false;
  let firebaseAdminFallback = "";

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
      await downloadStoragePathToFile(firebaseObject.objectPath, targetPath);
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

  const upstream = await fetchCompat(cleanUrl, { method: "GET" });
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
  await pipeline(stream, fs.createWriteStream(targetPath));
  return targetPath;
}

function normalizeMontageExportRequestBody(body = {}) {
  const raw = body && typeof body === "object" ? body : {};
  const sessionId = clampText(raw?.sessionId || "", 140);
  const exportMode = String(raw?.exportMode || "normal").trim().toLowerCase();
  const requestedFormat = String(raw?.format || "mp4_h264").trim();
  const format = requestedFormat === "webm_vp9" ? "webm_vp9" : "mp4_h264";
  const qualityPreset = String(raw?.qualityPreset || "balanced").trim();
  const resolution = String(raw?.resolution || "source").trim();
  const includeBackgroundMusic = raw?.includeBackgroundMusic === true;
  const filename = clampText(raw?.filename || "montage", 160) || "montage";
  const previewRowId = clampText(raw?.previewRowId || "", 140);
  const entriesRaw = Array.isArray(raw?.entries) ? raw.entries : [];
  const entries = entriesRaw.slice(0, MAX_MONTAGE_EXPORT_SCENES).map((item) => (item && typeof item === "object" ? item : null)).filter(Boolean);
  const audioTimelineRaw = raw?.audioTimeline && typeof raw.audioTimeline === "object" ? raw.audioTimeline : null;
  const onScreenTextTimelineRaw = raw?.onScreenTextTimeline && typeof raw.onScreenTextTimeline === "object"
    ? raw.onScreenTextTimeline
    : null;
  const geminiSegmentsRaw = Array.isArray(audioTimelineRaw?.geminiSegments) ? audioTimelineRaw.geminiSegments : [];
  const backgroundSegmentsRaw = Array.isArray(audioTimelineRaw?.backgroundSegments) ? audioTimelineRaw.backgroundSegments : [];

  const normalizeTimelineAudioSegment = (segment = {}, idx = 0) => {
    if (!segment || typeof segment !== "object") return null;
    const url = String(segment?.url || "").trim();
    const storagePath = clampText(segment?.storagePath || "", 900);
    const startMs = Math.max(0, Math.round(Number(segment?.startMs || 0) || 0));
    const durationMs = Math.max(500, Math.round(Number(segment?.durationMs || 0) || 0));
    const trimInMs = Math.max(0, Math.round(Number(segment?.trimInMs || 0) || 0));
    const trimOutMs = Math.max(trimInMs + 500, Math.round(Number(segment?.trimOutMs || 0) || (trimInMs + durationMs)));
    const rawVolumePct = Number(segment?.volumePct ?? 100);
    const legacyScaledPct = Number.isFinite(rawVolumePct) && rawVolumePct > 0 && rawVolumePct <= 1 ? rawVolumePct * 100 : rawVolumePct;
    const volumePct = Math.max(0, Math.min(100, legacyScaledPct));
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
      }
    };
  };

  const timelineAudioSegments = [...geminiSegmentsRaw, ...backgroundSegmentsRaw]
    .slice(0, 600)
    .map((segment, idx) => normalizeTimelineAudioSegment(segment, idx))
    .filter(Boolean);
  const normalizedGeminiTimelineSegments = timelineAudioSegments.filter((segment) => String(segment?.kind || "").trim().toLowerCase() !== "uploaded");
  const useTimelineAudio = audioTimelineRaw?.enabled === true && timelineAudioSegments.length > 0;
  const onScreenTextSegments = Array.isArray(onScreenTextTimelineRaw?.segments)
    ? onScreenTextTimelineRaw.segments.slice(0, 400).map((segment, idx) => normalizeOnScreenTextSegment(segment, idx)).filter(Boolean)
    : [];
  const onScreenTextSettings = onScreenTextTimelineRaw?.settings && typeof onScreenTextTimelineRaw.settings === "object"
    ? onScreenTextTimelineRaw.settings
    : null;

  return {
    sessionId,
    exportMode,
    format,
    qualityPreset,
    resolution,
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
    onScreenTextSettings,
    backgroundMusic: raw?.backgroundMusic && typeof raw.backgroundMusic === "object" ? raw.backgroundMusic : null,
    backgroundMusicDuckingPct: (() => {
      const rawValue = Number(raw?.backgroundMusicDuckingPct ?? raw?.backgroundMusic?.duckingWhenGeminiPct);
      if (!Number.isFinite(rawValue)) return 60;
      if (rawValue >= 40 && rawValue <= 100) return rawValue;
      if (rawValue >= 0 && rawValue < 40) return Math.max(40, 100 - rawValue);
      return 60;
    })(),
    bitrateSettings: raw?.bitrateSettings && typeof raw.bitrateSettings === "object" ? raw.bitrateSettings : null
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
  if (!new Set(["source", "1080p", "720p", "480p"]).has(String(input?.resolution || "").trim())) {
    const err = new Error("Resolución inválida.");
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

function createMontageAssetDownloader({ tmpDir = "", uid = "" } = {}) {
  return async (asset = {}, kind = "video", index = 0) => {
    const storagePath = clampText(asset?.storagePath || "", 900);
    const url = String(asset?.url || "").trim();
    if (!storagePath && !url) {
      const err = new Error("missing_download_source");
      err.code = "missing_download_source";
      err.status = 404;
      err.detail = { kind, index, storagePath: "", url: "" };
      throw err;
    }
    const isAudioKind = kind !== "video";
    const ext = isAudioKind
      ? (getAudioExtension(String(asset?.mimeType || "audio/mpeg")) || "audio")
      : (getVideoExtension(String(asset?.mimeType || "video/mp4")) || "mp4");
    const outPath = path.join(tmpDir, `in-${kind}-${String(index + 1).padStart(3, "0")}.${ext}`);
    const validateDownloadedAsset = async (targetPath = "") => {
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
          label
        };
        return err;
      }
    );
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

    if (storagePath) {
      try {
        await downloadWithTimeout(() => downloadStoragePathToFile(storagePath, outPath), "storage_download");
        return validateDownloadedAsset(outPath);
      } catch (error) {
        const code = String(error?.code || error?.message || "").trim();
        if (code === "storage_not_found") {
          const altPaths = resolveAlternateOwnerStoragePaths(storagePath, uid);
          for (const altPath of altPaths) {
            try {
              // eslint-disable-next-line no-await-in-loop
              await downloadWithTimeout(() => downloadStoragePathToFile(altPath, outPath), "storage_download");
              // eslint-disable-next-line no-await-in-loop
              return await validateDownloadedAsset(outPath);
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
          if (url && !parseFirebaseStorageGoogleApisObjectUrl(url)) {
            await downloadWithTimeout(() => downloadUrlToFile(url, outPath), "url_download");
            return validateDownloadedAsset(outPath);
          }
        }
        error.detail = {
          ...(error?.detail && typeof error.detail === "object" ? error.detail : {}),
          kind,
          index,
          storagePath,
          url: url ? redactUrlForLogs(url) : ""
        };
        throw error;
      }
    }
    await downloadWithTimeout(() => downloadUrlToFile(url, outPath), "url_download");
    return validateDownloadedAsset(outPath);
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
  const targetBucket = await resolveWritableStorageBucket();
  await targetBucket.upload(finalOutPath, {
    destination: storagePath,
    metadata: {
      contentType: mimeType
    }
  });
  const uploadedFile = targetBucket.file(storagePath);
  const [meta] = await uploadedFile.getMetadata().catch(() => [{}]);
  const base = String(context?.baseUrl || "").trim() || getBackendPublicBaseUrl() || `http://127.0.0.1:${PORT}`;
  const downloadUrl = `${base}/api/assets/montage-download?jobId=${encodeURIComponent(exportId)}&token=${encodeURIComponent(token)}`;
  return {
    exportId,
    downloadUrl,
    downloadToken: token,
    storagePath,
    createdAtIso,
    expiresAtIso,
    filename,
    mimeType,
    sizeBytes: Math.max(0, Number(meta?.size || 0) || 0)
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

function resolveMontageCanvasSize(sourceWidth = 1280, sourceHeight = 720, resolution = "source") {
  const safeWidth = Math.max(2, Math.round(Number(sourceWidth || 1280) || 1280));
  const safeHeight = Math.max(2, Math.round(Number(sourceHeight || 720) || 720));
  const even = (value = 0) => Math.max(2, Math.round(value / 2) * 2);
  const key = String(resolution || "source").trim().toLowerCase();
  if (key === "1080p") return { width: 1920, height: 1080 };
  if (key === "720p") return { width: 1280, height: 720 };
  if (key === "480p") return { width: 854, height: 480 };
  return { width: even(safeWidth), height: even(safeHeight) };
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
  const canvas = resolveMontageCanvasSize(firstDims?.width || 1280, firstDims?.height || 720, input?.resolution || "source");
  const totalSec = Math.max(0.25, plan.totalDurationMs / 1000);
  const scaleFilter = resolveMontageExportScaleFilter(input?.resolution || "source");
  const colorInputIndex = intermediatePaths.length;
  const silentAudioInputIndex = intermediatePaths.length + 1;
  const filters = [`[${colorInputIndex}:v]format=rgba[base0]`];
  const audioLabels = [];
  const includeSceneAudio = input?.useTimelineAudio !== true;

  plan.entries.forEach((entry, index) => {
    const durSec = Math.max(0.2, Number(entry?.durationMs || 500) / 1000);
    const startSec = Math.max(0, Number(entry?.timelineStartMs || 0) / 1000);
    const videoLabel = `v${index}`;
    let videoChain = `[${index}:v]scale=trunc(iw/2)*2:trunc(ih/2)*2`;
    if (scaleFilter) videoChain += `,${scaleFilter}`;
    videoChain += `,pad=${canvas.width}:${canvas.height}:(ow-iw)/2:(oh-ih)/2:color=0x05070B,format=rgba`;
    videoChain += `,setpts=PTS-STARTPTS+${startSec.toFixed(3)}/TB[${videoLabel}]`;
    filters.push(videoChain);
    filters.push(`[base${index}][${videoLabel}]overlay=eof_action=pass:shortest=0:x=0:y=0:format=auto[base${index + 1}]`);

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
    "-map", `[base${plan.entries.length}]`,
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

async function executeMontageExportPipeline(rawInput = {}, context = {}) {
  const input = rawInput && typeof rawInput === "object" ? rawInput : {};
  const uid = String(context?.uid || "").trim();
  const jobId = clampExportId(context?.jobId || "");
  const emitStage = createMontageStageReporter(context?.onStage);
  let tmpDir = "";
  try {
    if (!isFfmpegAvailable()) {
      const err = new Error("ffmpeg_static_missing");
      err.status = 500;
      throw err;
    }
    validateMontageExportRequest(input);
    emitStage("validate_payload", 0.08, "Validando escenas, pistas y formato.");

    tmpDir = path.join(os.tmpdir(), `cb-montage-export-${randomUUID()}`);
    await fs.promises.mkdir(tmpDir, { recursive: true });

    const params = resolveMontageExportVideoParams(input.format, input.qualityPreset, input.bitrateSettings);
    const outExt = getMontageExportExtension(input.format);
    const scaleFilter = resolveMontageExportScaleFilter(input.resolution);
    const downloadInput = createMontageAssetDownloader({ tmpDir, uid });
    const intermediatePaths = [];
    const skippedEntries = [];
    const exportedEntries = [];
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
      const entry = input.entries[i] || {};
      const rowId = clampText(entry?.rowId || "", 140);
      const sceneIndex = Math.max(1, Number(entry?.sceneIndex || i + 1) || i + 1);
      const trimInMs = Math.max(0, Number(entry?.trimInMs || 0) || 0);
      const durationMs = Math.max(500, Number(entry?.durationMs || 0) || 0);
      const trimSec = Math.max(0, trimInMs / 1000);
      const durSec = Math.max(0.2, durationMs / 1000);
      const useNativeVideoAudio = entry?.useNativeVideoAudio === true;
      const videoAsset = entry?.video && typeof entry.video === "object" ? entry.video : {};
      const audioAsset = entry?.audio && typeof entry.audio === "object" ? entry.audio : null;

      if (!rowId) {
        const err = new Error(`Entrada inválida (rowId) en índice ${i}.`);
        err.status = 400;
        throw err;
      }
      if (!videoAsset?.storagePath && !videoAsset?.url) {
        skippedEntries.push(buildMontageSkippedEntry(entry, i, "missing_video_source", {
          kind: "video",
          code: "missing_download_source",
          index: i,
          lastError: `Escena ${sceneIndex} sin video fuente para exportar.`
        }));
        continue;
      }

      emitStage("render_scene_segments", 0.18 + ((i / Math.max(1, input.entries.length)) * 0.26), `Renderizando escena ${sceneIndex} de ${input.entries.length}.`, {
        currentSceneIndex: sceneIndex,
        currentRowId: rowId,
        totalScenes: input.entries.length
      });
      logMontageMemory("render_scene_before", { jobId, currentSceneIndex: sceneIndex, currentRowId: rowId });
      let currentSceneSubstage = "scene_download_video";
      try {
        const videoStoragePath = clampText(videoAsset?.storagePath || "", 900);
        const videoDownloadUrl = String(videoAsset?.url || "").trim();
        const sceneProgressBase = 0.18 + ((i / Math.max(1, input.entries.length)) * 0.26);
        const sceneStepStartMs = Date.now();
        emitSceneSubstage({
          sceneIndex,
          rowId,
          totalScenes: input.entries.length,
          substage: currentSceneSubstage,
          hint: `Descargando asset de la escena ${sceneIndex} de ${input.entries.length}.`,
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
          substage: "scene_download_video"
        }));
        const inputVideoPath = await downloadInput(videoAsset, "video", i);
        const downloadedVideoStat = await fs.promises.stat(inputVideoPath).catch(() => null);
        console.info("[backend][montage-export][scene-step-finish]", buildMontageSceneTrace({
          jobId,
          sceneIndex,
          rowId,
          storagePath: videoStoragePath,
          downloadUrl: videoDownloadUrl,
          substage: "scene_download_video",
          elapsedMs: Date.now() - sceneStepStartMs,
          extra: {
            localPath: inputVideoPath,
            sizeBytes: Number(downloadedVideoStat?.size || 0) || 0
          }
        }));
        const forceSilentAudio = input.useTimelineAudio === true && !useNativeVideoAudio;
        const inputAudioPath = (!forceSilentAudio && !useNativeVideoAudio && audioAsset) ? await downloadInput(audioAsset, "audio", i) : "";
        const intermediatePath = path.join(tmpDir, `scene-${String(sceneIndex).padStart(3, "0")}.${outExt}`);
        const visualLayoutMode = String(entry?.visualLayoutMode || "").trim().toLowerCase() === "blur-backdrop"
          ? "blur-backdrop"
          : "default";
        emitSceneSubstage({
          sceneIndex,
          rowId,
          totalScenes: input.entries.length,
          substage: "scene_probe_audio",
          hint: `Analizando audio de la escena ${sceneIndex} de ${input.entries.length}.`,
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
          substage: "scene_probe_audio"
        }));
        const probeAudioStartMs = Date.now();
        currentSceneSubstage = "scene_probe_audio";
        const videoHasAudio = await probeMediaHasAudioWithFfmpeg(inputVideoPath);
        console.info("[backend][montage-export][scene-step-finish]", buildMontageSceneTrace({
          jobId,
          sceneIndex,
          rowId,
          storagePath: videoStoragePath,
          downloadUrl: videoDownloadUrl,
          substage: "scene_probe_audio",
          elapsedMs: Date.now() - probeAudioStartMs,
          extra: { videoHasAudio }
        }));
        emitSceneSubstage({
          sceneIndex,
          rowId,
          totalScenes: input.entries.length,
          substage: "scene_probe_dimensions",
          hint: `Analizando dimensiones de la escena ${sceneIndex} de ${input.entries.length}.`,
          progress: sceneProgressBase + 0.03,
          storagePath: videoStoragePath,
          downloadUrl: videoDownloadUrl
        });
        console.info("[backend][montage-export][scene-step-start]", buildMontageSceneTrace({
          jobId,
          sceneIndex,
          rowId,
          storagePath: videoStoragePath,
          downloadUrl: videoDownloadUrl,
          substage: "scene_probe_dimensions"
        }));
        const probeDimensionsStartMs = Date.now();
        currentSceneSubstage = "scene_probe_dimensions";
        const sourceDims = await probeMediaVideoDimensionsWithFfmpeg(inputVideoPath, `montage_scene_probe_${sceneIndex}`);
        console.info("[backend][montage-export][scene-step-finish]", buildMontageSceneTrace({
          jobId,
          sceneIndex,
          rowId,
          storagePath: videoStoragePath,
          downloadUrl: videoDownloadUrl,
          substage: "scene_probe_dimensions",
          elapsedMs: Date.now() - probeDimensionsStartMs,
          extra: sourceDims
        }));
        const canvas = resolveMontageCanvasSize(sourceDims?.width || 1280, sourceDims?.height || 720, input?.resolution || "source");
        const args = ["-y", "-hide_banner", "-loglevel", "warning", "-i", inputVideoPath];
        
        // Input 1: anullsrc como fallback universal para asegurar pista de audio
        args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000");
        
        if (!forceSilentAudio && !useNativeVideoAudio && inputAudioPath) {
          args.push("-i", inputAudioPath);
        }

        const veoVolumePct = Math.max(0, Math.min(200, Number(entry?.veoVolumeOverridePct ?? 100)));
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

        args.push("-ss", String(trimSec), "-t", String(durSec));
        
        // Filtro de video para asegurar duración exacta (tpad congela el último frame si el video es corto)
        let videoFilterGraph = "";
        if (visualLayoutMode === "blur-backdrop") {
          const fgWidth = Math.max(2, Math.round((canvas.width * 0.76) / 2) * 2);
          const fgHeight = Math.max(2, Math.round((canvas.height * 0.76) / 2) * 2);
          videoFilterGraph = [
            `[0:v]tpad=stop_mode=clone:stop_duration=${durSec},split=2[vbg_src][vfg_src]`,
            `[vbg_src]scale=${canvas.width}:${canvas.height}:force_original_aspect_ratio=increase,crop=${canvas.width}:${canvas.height},boxblur=24:8,eq=saturation=1.08[bg]`,
            `[vfg_src]scale=${fgWidth}:${fgHeight}:force_original_aspect_ratio=decrease,pad=${fgWidth}:${fgHeight}:(ow-iw)/2:(oh-ih)/2:color=0x05070B[fg]`,
            `[bg][fg]overlay=(W-w)/2:(H-h)/2:format=auto[vout]`
          ].join(";");
        } else {
          videoFilterGraph = `[0:v]tpad=stop_mode=clone:stop_duration=${durSec},scale=trunc(iw/2)*2:trunc(ih/2)*2${scaleFilter ? `,${scaleFilter}` : ""}[vout]`;
        }

        args.push("-filter_complex", `${videoFilterGraph};${audioFilterGraph}`);
        args.push("-map", "[vout]", "-map", audioMapLabel);
        args.push("-r", "24", "-c:v", params.vCodec);
        args.push(...params.vArgs, "-pix_fmt", "yuv420p", "-c:a", params.aCodec, "-ar", "48000", ...params.aArgs, intermediatePath);
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
        await runFfmpegCommand(args, {
          stage: `montage_scene_${sceneIndex}`,
          timeoutMs: MONTAGE_EXPORT_SCENE_RENDER_TIMEOUT_MS,
          timeoutCode: "scene_render_timeout"
        });
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
          zIndex: Math.max(1, Math.round(Number(entry?.zIndex || sceneIndex) || sceneIndex)),
          durationSec: durSec,
          durationMs,
          visualLayoutMode,
          timelineStartMs: Math.max(0, Math.round(Number(entry?.timelineStartMs || 0) || 0)),
          timelineEndMs: Math.max(0, Math.round(Number(entry?.timelineEndMs || 0) || 0)),
          voiceOverText: clampText(entry?.voiceOverText || "", 1600),
          sceneDescription: clampText(entry?.sceneDescription || "", 1600),
          onScreenText: clampText(entry?.onScreenText || "", 600),
          visualNotes: clampText(entry?.visualNotes || "", 2200),
          videoDirective: clampText(entry?.videoDirective || "", 2200)
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
    if (overlapPlan.hasOverlap || overlapPlan.hasGaps) {
      concatOutPath = await renderMontageOverlapComposition({
        input,
        tmpDir,
        params,
        outExt,
        intermediatePaths,
        exportedEntries
      });
    }
    if (!concatOutPath) {
      const concatListPath = path.join(tmpDir, "concat-list.txt");
      await fs.promises.writeFile(concatListPath, intermediatePaths.map((p) => `file '${String(p).replace(/'/g, "'\\''")}'`).join("\n") + "\n", "utf8");
      concatOutPath = path.join(tmpDir, `montage-concat.${outExt}`);
      await runFfmpegCommand([
        "-y", "-hide_banner", "-loglevel", "warning",
        "-fflags", "+genpts",
        "-f", "concat", "-safe", "0", "-i", concatListPath,
        "-r", "24",
        "-c:v", params.vCodec,
        ...params.vArgs,
        "-pix_fmt", "yuv420p",
        "-c:a", params.aCodec,
        "-ar", "48000",
        ...params.aArgs,
        ...(outExt === "mp4" ? ["-movflags", "+faststart"] : []),
        concatOutPath
      ], { stage: "montage_concat" });
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
      if (segmentInputs.length) {
        const timelineMixedOutPath = path.join(tmpDir, `montage-timeline-audio.${outExt}`);
        const audioCodec = outExt === "webm" ? "libopus" : "aac";
        const audioBitrate = outExt === "webm" ? "128k" : "160k";
        const filters = [];
        const bgDuckExprEscaped = escapeFfmpegExpr(buildFfmpegDuckVolumeExpr(input.normalizedGeminiTimelineSegments, configuredBackgroundDuckVolume));
        const labels = [];
        segmentInputs.forEach((item, idx) => {
          const segment = item.segment || {};
          const startMs = Math.max(0, Math.round(Number(segment?.startMs || 0) || 0));
          const trimInSec = Math.max(0, Math.round(Number(segment?.trimInMs || 0) || 0) / 1000);
          const durationSec = Math.max(0.1, Math.round(Number(segment?.durationMs || 0) || 0) / 1000);
          const volume = Math.max(0, Math.min(2, Math.max(0, Math.min(100, Number(segment?.volumePct ?? 100))) / 100));
          const inputIndex = idx + 1;
          const label = `a${idx}`;
          labels.push(label);
          const exportOffset = exportOffsetsByRowId.get(String(segment?.rowId || "").trim()) || null;
          const baseTimelineStartMs = Math.max(0, Math.round(Number(exportOffset?.timelineStartMs || startMs) || 0));
          const relativeStartMs = startMs - baseTimelineStartMs;
          
          let finalAdjustedStartMs = exportOffset ? (exportOffset.startMs + relativeStartMs) : startMs;
          let finalTrimInSec = trimInSec;
          let finalDurationSec = durationSec;
          
          if (finalAdjustedStartMs < 0) {
            const shiftSec = Math.abs(finalAdjustedStartMs) / 1000;
            finalTrimInSec += shiftSec;
            finalDurationSec = Math.max(0.1, finalDurationSec - shiftSec);
            finalAdjustedStartMs = 0;
          }

          const baseChain = `[${inputIndex}:a]atrim=start=${finalTrimInSec.toFixed(3)}:duration=${finalDurationSec.toFixed(3)},asetpts=PTS-STARTPTS,adelay=${Math.round(finalAdjustedStartMs)}ms|${Math.round(finalAdjustedStartMs)}ms`;
          const kind = String(segment?.kind || "").trim().toLowerCase();
          filters.push(kind === "uploaded" && input.normalizedGeminiTimelineSegments.length
            ? `${baseChain},volume='${bgDuckExprEscaped}*${volume.toFixed(3)}':eval=frame[${label}]`
            : `${baseChain},volume=${volume.toFixed(3)}[${label}]`);
        });
        const videoDuckExprEscaped = escapeFfmpegExpr(buildFfmpegDuckVolumeExpr(input.normalizedGeminiTimelineSegments, 0.40));
        const mix = `${labels.map((label) => `[${label}]`).join("")}amix=inputs=${labels.length}:duration=longest:dropout_transition=0:normalize=0,aresample=48000[mix];[0:a]volume='${videoDuckExprEscaped}':eval=frame[v_ducked];[v_ducked][mix]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=-1.5dB[outa]`;
        await runFfmpegCommand([
          "-y", "-hide_banner", "-loglevel", "warning", "-i", finalOutPath,
          ...segmentInputs.flatMap((item) => ["-i", item.path]),
          "-filter_complex", `${filters.join(";")};${mix}`,
          "-map", "0:v:0", "-map", "[outa]", "-c:v", "copy", "-c:a", audioCodec, "-ar", "48000", "-b:a", audioBitrate,
          ...(outExt === "mp4" ? ["-movflags", "+faststart"] : []),
          timelineMixedOutPath
        ], { stage: "montage_mix_timeline_audio" });
        finalOutPath = timelineMixedOutPath;
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
      const mixedOutPath = path.join(tmpDir, `montage-mixed.${outExt}`);
      const audioCodec = outExt === "webm" ? "libopus" : "aac";
      const audioBitrate = outExt === "webm" ? "128k" : "160k";
      await runFfmpegCommand([
        "-y", "-hide_banner", "-loglevel", "warning",
        "-i", finalOutPath, "-stream_loop", "-1", "-i", musicPath, "-t", String(exportedDurationSec),
        "-filter_complex",
        input.normalizedGeminiTimelineSegments.length
          ? `[1:a]loudnorm=I=-16:TP=-1.5:LRA=11,volume='${escapeFfmpegExpr(buildFfmpegDuckVolumeExpr(input.normalizedGeminiTimelineSegments, configuredBackgroundDuckVolume))}*${volume.toFixed(3)}':eval=frame[bg_ducked];[0:a][bg_ducked]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=-1.5dB[outa]`
          : `[1:a]loudnorm=I=-16:TP=-1.5:LRA=11,volume=${volume.toFixed(3)}[bg];[0:a][bg]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=-1.5dB[outa]`,
        "-map", "0:v:0", "-map", "[outa]", "-c:v", "copy", "-c:a", audioCodec, "-ar", "48000", "-b:a", audioBitrate,
        ...(outExt === "mp4" ? ["-movflags", "+faststart"] : []),
        mixedOutPath
      ], { stage: "montage_mix_music" });
      finalOutPath = mixedOutPath;
    } else if (outExt === "mp4") {
      const remuxOutPath = path.join(tmpDir, "montage-faststart.mp4");
      await runFfmpegCommand(["-y", "-hide_banner", "-loglevel", "warning", "-i", finalOutPath, "-c", "copy", "-movflags", "+faststart", remuxOutPath], { stage: "montage_faststart" });
      finalOutPath = remuxOutPath;
    }

    if (input.onScreenTextTimelineRaw?.enabled === true && input.onScreenTextSettings && input.onScreenTextSegments.length) {
      emitStage("apply_onscreen_text", 0.8, "Aplicando texto en pantalla.");
      const sourceDims = await probeMediaVideoDimensionsWithFfmpeg(finalOutPath, "montage_onscreen_input").catch(() => ({ width: 1280, height: 720 }));
      const textColor = toFfmpegColor(input.onScreenTextSettings?.textColor || "#F8FAFC", input.onScreenTextSettings?.textOpacity ?? 1, "F8FAFC");
      const strokeColor = toFfmpegColor(input.onScreenTextSettings?.strokeColor || "#0F172A", 1, "0F172A");
      const textFileResolver = createMontageReviewTextFileResolver(tmpDir, "onscreen-text");
      const fontFile = resolveFfmpegDrawtextFontFile();
      const fontSource = fontFile
        ? `:fontfile='${escapeFfmpegFilterPath(fontFile)}'`
        : ":font='Sans'"; // Fallback for Linux if physical file not found
      if (fontFile) console.log(`[backend] drawtext using fontfile: ${fontFile}`);
      else console.warn("[backend] drawtext using fallback font hint: Sans");
      const drawFilters = input.onScreenTextSegments
        .slice()
        .sort((a, b) => Number(a.startMs || 0) - Number(b.startMs || 0) || Number(a.zIndex || 0) - Number(b.zIndex || 0))
        .map((segment) => {
          const startSec = Math.max(0, Number(segment.startMs || 0) / 1000);
          const endSec = startSec + Math.max(0.1, Number(segment.durationMs || 0) / 1000);
          const layout = segment?.layout && typeof segment.layout === "object" ? segment.layout : {};
          const spec = resolveOnScreenTextRenderSpec({
            settings: {
              ...input.onScreenTextSettings,
              boxEnabled: false
            },
            layout,
            resolution: "source", // Use source to match probed sourceDims perfectly
            sourceWidth: sourceDims.width,
            sourceHeight: sourceDims.height,
            text: segment.text || "",
            fallback: ""
          });
          const textPath = textFileResolver(String(spec.wrappedText || "").trim());
          const shadowColor = spec.shadowEnabled
            ? `0x020617@${spec.shadowOpacity.toFixed(3)}`
            : "0x020617@0.000";
          return `drawtext=textfile='${escapeFfmpegFilterPath(textPath)}'${fontSource}:reload=0:fontsize=${spec.fontSizePx}:fontcolor=${textColor}:x='${spec.xExpr}':y=${spec.yPx}:fix_bounds=1:line_spacing=${spec.lineSpacingPx}:borderw=${spec.strokeEnabled ? spec.strokeWidthPx : 0}:bordercolor=${strokeColor}:shadowx=${spec.shadowEnabled ? spec.shadowX : 0}:shadowy=${spec.shadowEnabled ? spec.shadowY : 0}:shadowcolor=${shadowColor}:${spec.boxEnabled ? "box=1" : "box=0"}:enable='${escapeFfmpegExpr(`between(t,${startSec.toFixed(3)},${endSec.toFixed(3)})`)}'`;
        });
      if (drawFilters.length) {
        const overlayOutPath = path.join(tmpDir, `montage-onscreen-text.${outExt}`);
        await runFfmpegCommand(["-y", "-hide_banner", "-loglevel", "warning", "-i", finalOutPath, "-vf", drawFilters.join(","), "-map", "0:v:0", "-map", "0:a:0?", "-c:v", params.vCodec, ...params.vArgs, "-pix_fmt", "yuv420p", "-c:a", "copy", ...(outExt === "mp4" ? ["-movflags", "+faststart"] : []), overlayOutPath], { stage: "montage_overlay_text" });
        finalOutPath = overlayOutPath;
      }
    }

    if (input.exportMode === "review" && exportedEntries.length) {
      emitStage("apply_review_layout", 0.88, "Componiendo layout de revisión.");
      const sourceDims = await probeMediaVideoDimensionsWithFfmpeg(finalOutPath, "montage_review_input").catch(() => ({ width: 1280, height: 720 }));
      const canvas = resolveMontageReviewCanvasSize(input.resolution, sourceDims.width, sourceDims.height);
      const reviewOutPath = path.join(tmpDir, `montage-review.${outExt}`);
      const reviewTextFileResolver = createMontageReviewTextFileResolver(tmpDir, "review-export");
      const reviewFilter = buildMontageReviewVideoFilter(exportedEntries, {
        width: canvas.width,
        height: canvas.height,
        montageTotalDurationMs,
        globalCounterMode: "dynamic",
        textFileResolver: reviewTextFileResolver
      });
      await runFfmpegCommand(["-y", "-hide_banner", "-loglevel", "warning", "-i", finalOutPath, "-vf", reviewFilter, "-map", "0:v:0", "-map", "0:a:0?", "-c:v", params.vCodec, ...params.vArgs, "-pix_fmt", "yuv420p", "-c:a", "copy", ...(outExt === "mp4" ? ["-movflags", "+faststart"] : []), reviewOutPath], { stage: "montage_review_layout" });
      finalOutPath = reviewOutPath;
    }

    if (context?.previewOnly === true) {
      const previewBuffer = await fs.promises.readFile(finalOutPath);
      return {
        previewBuffer,
        previewMimeType: getMontageExportMimeType(input?.format || "mp4_h264"),
        exportedEntries
      };
    }

    emitStage("cache_output", 0.96, "Guardando archivo final para descarga.");
    logMontageMemory("cache_output_start", { jobId, exportedSceneCount: exportedEntries.length });
    const stored = await storeMontageExportResult(finalOutPath, input, context);
    logMontageMemory("cache_output_after", { jobId, exportId: String(stored?.exportId || "").trim() });
    emitStage("ready", 1, "Exportación lista.");
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
    const downloadInput = createMontageAssetDownloader({ tmpDir, uid });
    const inputVideoPath = await downloadInput(targetEntry?.video || {}, "video", 0);
    const trimSec = Math.max(0, Number(targetEntry?.trimInMs || 0) / 1000);
    const sourceDims = await probeMediaVideoDimensionsWithFfmpeg(inputVideoPath, "montage_preview_input").catch(() => ({ width: 1280, height: 720 }));
    const canvas = resolveMontageReviewCanvasSize(input.resolution, sourceDims.width, sourceDims.height);
    const previewPath = path.join(tmpDir, "preview.jpg");
    const baseFilter = input.exportMode === "review"
      ? buildMontageReviewVideoFilter([{
        ...targetEntry,
        reviewStartMs: 0,
        reviewEndMs: Math.max(1000, Number(targetEntry?.durationMs || 4000) || 4000),
        timelineLabel: formatMontageReviewTimelineRange(targetEntry?.timelineStartMs || 0, targetEntry?.timelineEndMs || 0, targetEntry?.durationMs || 0),
        visualNotes: clampText(targetEntry?.visualNotes || "", 2200)
      }], {
        width: canvas.width,
        height: canvas.height,
        montageTotalDurationMs,
        globalCounterMode: "static",
        globalCounterCurrentMs,
        textFileResolver: createMontageReviewTextFileResolver(tmpDir, "review-preview")
      })
      : `${resolveMontageExportScaleFilter(input.resolution) || "scale=trunc(iw/2)*2:trunc(ih/2)*2"},pad=${canvas.width}:${canvas.height}:(ow-iw)/2:(oh-ih)/2:color=0x05070B`;
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
    validateMontageExportRequest(input);
    const jobId = clampExportId(randomUUID());
    const baseUrl = resolvePublicBaseUrl(req) || getBackendPublicBaseUrl() || `http://127.0.0.1:${PORT}`;
    const initial = await montageExportJobStore.createJob({
      jobId,
      sessionId: input.sessionId,
      ownerId: uid,
      totalScenes: input.entries.length
    });
    upsertMontageExportJob(jobId, initial);

    const slot = tryAcquireHeavyWorkSlot("montage_export", jobId);
    if (!slot.ok) {
      return res.status(429).json({
        error: "backend_busy_with_export",
        message: "El servidor está procesando otra tarea pesada. Intenta en un momento.",
        detail: slot.error?.detail
      });
    }

    setImmediate(async () => {
      try {
        const directJobStore = {
          createJob: async (args) => {
            const job = await montageExportJobStore.createJob(args);
            upsertMontageExportJob(job.jobId, job);
            return job;
          },
          updateJob: async (id, patch) => {
            upsertMontageExportJob(id, patch);
            montageExportJobStore.updateJob(id, patch).catch(() => {});
          },
          getJob: async (id) => {
            return montageExportJobs.get(id) || await montageExportJobStore.getJob(id);
          }
        };
        const processFn = createProcessMontageExportJob({
          jobStore: directJobStore,
          executeMontageExportPipeline,
          buildMontageSceneFailure
        });
        await processFn({
          data: {
            jobId,
            sessionId: input.sessionId,
            ownerId: uid,
            input,
            baseUrl
          }
        });
      } catch (err) {
        console.error("[backend][montage-export] direct export failed", {
          jobId,
          error: String(err?.message || err)
        });
      } finally {
        releaseHeavyWorkSlot("montage_export", jobId);
      }
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
  const jobId = clampExportId(req.query?.jobId || "");
  if (!jobId) return res.status(400).json({ error: "Falta jobId." });
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");

  // Optimización: En local, preferimos la memoria interna para evitar lags de red con Firestore
  let job = montageExportJobs.get(jobId);
  if (!job) {
    job = await montageExportJobStore.getJob(jobId);
  }

  if (!job) return res.status(404).json({ error: "job_not_found", code: "job_not_found" });
  return res.status(200).json(sanitizeMontageExportJobPublicPayload(job));
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

    let { upstream, data } = await doRequest(serialized);
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
    const rawUrl = String(req.query?.url || "").trim();
    const normalizedUrl = rawUrl.includes("%25") ? decodeURIComponent(rawUrl) : rawUrl;
    if (!normalizedUrl) {
      return res.status(400).json({ error: "Falta parámetro url." });
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

    const upstream = await fetchCompat(normalizedUrl, { method: "GET" });
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
    return res.status(500).json({ error: String(error?.message || "Error en proxy de imagen.") });
  }
});

app.get("/api/assets/montage-download", async (req, res) => {
  try {
    const jobId = clampExportId(req.query?.jobId || "");
    const token = clampText(String(req.query?.token || "").trim(), 180);
    if (jobId && token) {
      const job = await montageExportJobStore.getJob(jobId);
      const result = job?.result && typeof job.result === "object" ? job.result : job?.export && typeof job.export === "object" ? job.export : null;
      const storagePath = normalizeStorageFilePath(result?.storagePath || "");
      const expectedToken = clampText(String(result?.downloadToken || "").trim(), 180);
      if (!job || !result || !storagePath || !expectedToken) {
        return res.status(404).json({ error: "Export no encontrado o expirado." });
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
        // eslint-disable-next-line no-await-in-loop
        const candidateMeta = await bucket.file(storagePath).getMetadata().catch(() => null);
        if (Array.isArray(candidateMeta) && candidateMeta[0]) {
          file = bucket.file(storagePath);
          meta = candidateMeta[0];
          break;
        }
      }
      if (!meta) return res.status(404).json({ error: "Export no encontrado o expirado." });
      const filename = String(result?.filename || `${jobId}.${getMontageExportExtension(job?.request?.format || "mp4_h264")}`).trim() || `${jobId}.mp4`;
      const mimeType = String(result?.mimeType || meta?.contentType || "application/octet-stream").trim() || "application/octet-stream";
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

    await cleanupMontageExportCache();
    const exportId = clampExportId(req.query?.exportId || "");
    const legacyToken = clampText(String(req.query?.token || "").trim(), 180);
    if (!exportId || !legacyToken) {
      return res.status(400).json({ error: "Falta exportId o token." });
    }
    await ensureMontageExportCacheDir();
    const metaPath = path.join(MONTAGE_EXPORT_CACHE_DIR, `${exportId}.json`);
    const raw = await fs.promises.readFile(metaPath, "utf8").catch(() => "");
    if (!raw) return res.status(404).json({ error: "Export no encontrado o expirado." });
    let meta = null;
    try {
      meta = JSON.parse(raw);
    } catch (_) {
      meta = null;
    }
    if (!meta || String(meta.exportId || "") !== exportId) {
      return res.status(404).json({ error: "Export no encontrado o expirado." });
    }
    if (String(meta.token || "") !== legacyToken) {
      return res.status(403).json({ error: "Token inválido para descarga." });
    }
    const expiresAtMs = Number(new Date(meta.expiresAt || 0).getTime() || 0) || 0;
    if (expiresAtMs && expiresAtMs < Date.now()) {
      return res.status(404).json({ error: "Export expirado." });
    }
    const filePath = String(meta.filePath || "").trim();
    if (!filePath) return res.status(404).json({ error: "Export no encontrado o expirado." });
    const stat = await fs.promises.stat(filePath).catch(() => null);
    if (!stat || !stat.isFile()) return res.status(404).json({ error: "Export no encontrado o expirado." });

    const rangeHeader = String(req.headers.range || "").trim();
    const mimeType = String(meta.mimeType || "application/octet-stream").trim() || "application/octet-stream";
    const filename = String(meta.filename || `montage-${exportId}`).trim() || `montage-${exportId}`;
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
          return fs.createReadStream(filePath, { start, end }).pipe(res);
        }
      }
    }
    res.setHeader("Content-Length", String(total));
    return fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    return res.status(500).json({ error: String(error?.message || "No se pudo descargar el montaje.") });
  }
});

app.get("/api/assets/proxy-media", async (req, res) => {
  try {
    const storagePath = normalizeStorageFilePath(clampText(req.query?.storagePath || "", 700));
    const rawUrl = String(req.query?.url || "").trim();
    const normalizedUrl = rawUrl.includes("%25") ? decodeURIComponent(rawUrl) : rawUrl;
    const rangeHeader = String(req.headers.range || "").trim();

    if (storagePath) {
      const buckets = getStorageBucketCandidates();
      let lastError = null;
      console.info("[backend][proxy-media] attempting storage resolution", { storagePath, bucketCount: buckets.length });
      
      for (const bucket of buckets) {
        if (!bucket) continue;
        const file = bucket.file(storagePath);
        try {
          const [exists] = await file.exists();
          if (exists === false) {
            console.debug(`[backend][proxy-media] file not in bucket: ${bucket.name}`);
            continue;
          }
          
          console.info(`[backend][proxy-media] streaming from bucket: ${bucket.name}`);
          const [meta] = await file.getMetadata().catch(() => [{}]);
          await streamStorageFileToResponse(file, res, {
            metadata: meta,
            rangeHeader
          });
          return;
        } catch (error) {
          lastError = error;
          console.warn(`[backend][proxy-media] error in bucket ${bucket?.name}:`, error?.message || error);
          if (res.headersSent) {
            console.error("[backend][proxy-media] storage stream failed after headers", {
              storagePath,
              bucket: String(bucket?.name || "").trim(),
              message: String(error?.message || error)
            });
            try { res.destroy(error); } catch (_) {}
            return;
          }
        }
      }
      return res.status(404).json({
        error: "Archivo no encontrado en Storage.",
        detail: {
          storagePath,
          bucketsTried: buckets.map((bucket) => bucket?.name).filter(Boolean),
          lastError: lastError ? String(lastError?.message || lastError) : undefined
        }
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
    const upstream = await fetchCompat(normalizedUrl, {
      method: "GET",
      headers: rangeHeader ? { Range: rangeHeader } : undefined
    });
    if (!upstream.ok && upstream.status !== 206) {
      // Si un link de Firebase Storage (token) expiró o devuelve 403/404,
      // intenta recuperar el asset por admin SDK usando el object path.
      try {
        const shouldTryAdminFallback = upstream.status === 403 || upstream.status === 404;
        if (shouldTryAdminFallback) {
          const firebaseObject = parseFirebaseStorageGoogleApisObjectUrl(normalizedUrl);
          const bucketFromUrl = String(firebaseObject?.bucket || "").trim();
          const objectPath = normalizeStorageFilePath(firebaseObject?.objectPath || "");
          const isPodcasterAsset = /^podcaster\/(?:library|sessions|videos|audio)\//i.test(String(objectPath || "").trim());
          if (isPodcasterAsset && objectPath) {
            const candidates = (() => {
              const buckets = getStorageBucketCandidates();
              const extra = bucketFromUrl ? [admin.storage().bucket(bucketFromUrl)] : [];
              const byName = new Map();
              [...extra, ...buckets].filter(Boolean).forEach((bucket) => {
                const name = String(bucket?.name || "").trim();
                if (!name || byName.has(name)) return;
                byName.set(name, bucket);
              });
              return Array.from(byName.values());
            })();
            let lastError = null;
            for (const bucket of candidates) {
              if (!bucket) continue;
              const file = bucket.file(objectPath);
              const [exists] = await file.exists().catch(() => [null]);
              if (exists === false) continue;
              try {
                const [meta] = await file.getMetadata().catch(() => [{}]);
                await streamStorageFileToResponse(file, res, {
                  metadata: meta,
                  rangeHeader
                });
                return;
              } catch (error) {
                lastError = error;
                if (res.headersSent) {
                  console.error("[backend][proxy-media] admin fallback stream failed after headers", {
                    objectPath,
                    bucket: String(bucket?.name || "").trim(),
                    message: String(error?.message || error)
                  });
                  try { res.destroy(error); } catch (_) {}
                  return;
                }
              }
            }
            // Fallthrough: no se pudo leer por admin, devuelve upstream.
            if (lastError) {
              console.warn("[backend][proxy-media] admin fallback failed", {
                objectPath,
                bucketFromUrl,
                message: String(lastError?.message || lastError)
              });
            }
          }
        }
      } catch (_) {
        // noop
      }
      const body = await safeJson(upstream);
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
    res.setHeader("Content-Type", mime);
    if (contentLength) res.setHeader("Content-Length", contentLength);
    if (contentRange) res.setHeader("Content-Range", contentRange);
    if (acceptRanges) res.setHeader("Accept-Ranges", acceptRanges);
    if (cacheControl) res.setHeader("Cache-Control", cacheControl);
    await pipeline(stream, res.status(upstream.status === 206 ? 206 : 200));
    return;
  } catch (error) {
    return res.status(500).json({ error: String(error?.message || "Error en proxy de media.") });
  }
});

if (IS_MAIN_MODULE) {
  app.listen(PORT, HOST, () => {
    console.log("[backend] startup signature", {
      file: "backend/server.js",
      pid: process.pid,
      startedAt: BACKEND_BOOT_ISO,
      startupSignature: BACKEND_BOOT_SIGNATURE,
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
  getBackendPublicBaseUrl
};
