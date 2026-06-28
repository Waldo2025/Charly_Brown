/**
 * Podcaster Studio - Montage Export & Excel/File Utilities
 * Handles configurations, filenames, Excel review row builders, and download utilities.
 */

import { authFetchJson, buildApiUrlPreferRemote, buildExportApiUrl, getRemoteApiBase, resolveApiBase } from "../js/api-client-podcaster.js?v=2026-06-26.4";
import { doc as firestoreDoc, getDoc as firestoreGetDoc } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import JASSUB from "../vendor/jassub/jassub.js";
import {
  buildPodcasterLocalMediaKey,
  getPodcasterLocalMediaDataUrl,
  putPodcasterLocalMediaBlob,
  putPodcasterLocalMediaDataUrl
} from "./podcaster-local-media-cache.js";
import {
  buildMontageRenderAssContent,
  normalizeMontageRenderMode,
  resolveMontageRenderEntryAtTime
} from "./podcaster-montage-render-surface.js?v=2026-06-26.2";
import { resolveEffectiveExportResolution } from "./podcaster-reels.js";

const STUDIO_TIMELINE_MIN_CLIP_MS = 500;
const MONTAGE_EXPORT_POLL_MAX_MS = 0;
const MONTAGE_EXPORT_PREVIEW_REFRESH_MIN_MS = 2200;
const MONTAGE_EXPORT_ACTIVE_JOB_MAX_AGE_MS = 15 * 60 * 1000;
const MONTAGE_EXPORT_JOB_NOT_FOUND_MAX_RETRIES = 4;
const MONTAGE_EXPORT_BUSY_HANDOFF_RECOVERY_MAX_RETRIES = 1;
const MONTAGE_EXPORT_TRANSIENT_SILENT_RETRIES = 2;
const MONTAGE_EXPORT_RECENT_POLL_GRACE_MS = 45 * 1000;
const MONTAGE_EXPORT_SETTINGS_SCHEMA_VERSION = 3;

// --- Constants ---
const MONTAGE_EXPORT_STORAGE_KEY = "cb_podcast_montage_export_v2";
const MONTAGE_EXPORT_ACTIVE_JOB_KEY = "cb_podcast_montage_export_active_job_v1";
const DEFAULT_MONTAGE_BRAND_OVERLAY = Object.freeze({
  enabled: true,
  assetPath: "public/podcaster/logo.png",
  position: "top-right",
  marginPct: 0.025,
  widthPct: 0.05,
  opacity: 1
});

// --- Helpers & Configuration Normalization ---

export function normalizeMontageExportSettings(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const schemaVersion = Math.max(0, Math.floor(Number(source.schemaVersion || 0) || 0));
  const exportMode = ["normal", "review"].includes(String(source.exportMode || "").trim())
    ? String(source.exportMode).trim()
    : "normal";
  const requestedFormat = String(source.format || "").trim();
  const format = requestedFormat === "webm_vp9" ? "webm_vp9" : "mp4_h264";
  const qualityPreset = ["high", "balanced", "small"].includes(String(source.qualityPreset || "").trim())
    ? String(source.qualityPreset).trim()
    : "balanced";
  const resolution = ["source", "1080p", "720p", "480p"].includes(String(source.resolution || "").trim())
    ? String(source.resolution).trim()
    : "source";
  const filename = String(source.filename || "").trim().slice(0, 120);
  const includeReviewExcel = source.includeReviewExcel !== false;
  const bitrateMode = ["vbr", "cbr", "custom"].includes(String(source.bitrateMode || "").trim())
    ? String(source.bitrateMode).trim()
    : "vbr";
  const maxBitrate = Math.max(0.1, Math.min(50, Number(source.maxBitrate || 5) || 5));
  const minBitrate = Math.max(0, Math.min(51, Number(source.minBitrate || 20) || 20));
  const renderMode = normalizeMontageRenderMode(source.renderMode || "browser");

  return {
    exportMode,
    format,
    qualityPreset,
    resolution,
    bitrateMode,
    maxBitrate,
    minBitrate,
    renderMode,
    filename,
    includeReviewExcel,
    onlyAudio: schemaVersion >= MONTAGE_EXPORT_SETTINGS_SCHEMA_VERSION && source.onlyAudio === true,
    includeLogo: source.includeLogo !== false,
    partyKaraoke: source.partyKaraoke !== false,
    schemaVersion: MONTAGE_EXPORT_SETTINGS_SCHEMA_VERSION
  };
}

function sanitizeMontageFilenamePart(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function isLegacyAutoMontageFilename(value = "") {
  const clean = String(value || "").trim();
  return !clean || /^montage-\d{4}-\d{2}-\d{2}t/i.test(clean);
}

function defaultMontageExportFilename(session = null) {
  const activeSession = session || window.getActiveSession?.() || null;
  const preferred = sanitizeMontageFilenamePart(
    activeSession?.title
    || activeSession?.script?.episodeTitle
    || activeSession?.script?.summary
    || activeSession?.prompt
    || ""
  );
  if (preferred) return preferred;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `montage-${stamp}`;
}

function stripFileExtension(filename = "") {
  const clean = String(filename || "").trim();
  return clean.replace(/\.[a-z0-9]{2,5}$/i, "");
}

function formatMontageExportClockMs(ms = 0) {
  const safe = Math.max(0, Math.round(Number(ms || 0) || 0));
  const hours = Math.floor(safe / 3600000);
  const minutes = Math.floor((safe % 3600000) / 60000);
  const seconds = Math.floor((safe % 60000) / 1000);
  const millis = safe % 1000;
  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(seconds).padStart(2, "0")
  ].join(":") + `.${String(millis).padStart(3, "0")}`;
}

function formatMontageExportTimelineLabel(entry = null) {
  const startMs = Math.max(0, Math.round(Number(entry?.timelineStartMs || 0) || 0));
  const endMs = Math.max(startMs, Math.round(Number(entry?.timelineEndMs || 0) || 0));
  const durationMs = Math.max(0, Math.round(Number(entry?.durationMs || 0) || 0));
  const durationSec = Math.max(0, Math.round((durationMs / 100)) / 10);
  return `${formatMontageExportClockMs(startMs)} - ${formatMontageExportClockMs(endMs)} · ${durationSec.toFixed(1)} s`;
}

// --- XLSX & Review Excel Generation ---

let montageExportXlsxLoaderPromise = null;
let montageExportSubmitLocked = false;
let montageExportPreviewPaused = false;
let montageExportFirestoreDb = null;
const montageExportHydratedMediaCache = new Map();
const montageExportHydratingMediaPromises = new Map();

export function configureMontageExportRuntime({ firestoreDb = null } = {}) {
  montageExportFirestoreDb = firestoreDb || null;
}

function ensureMontageExportXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (montageExportXlsxLoaderPromise) return montageExportXlsxLoaderPromise;
  montageExportXlsxLoaderPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-role="montage-export-xlsx-loader"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.XLSX), { once: true });
      existing.addEventListener("error", () => reject(new Error("xlsx_load_failed")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "vendor/xlsx/xlsx.full.min.js";
    script.async = true;
    script.dataset.role = "montage-export-xlsx-loader";
    script.onload = () => resolve(window.XLSX);
    script.onerror = () => reject(new Error("xlsx_load_failed"));
    document.head.appendChild(script);
  }).finally(() => {
    if (!window.XLSX) montageExportXlsxLoaderPromise = null;
  });
  return montageExportXlsxLoaderPromise;
}

function buildMontageReviewExcelRows(preparedPayload = null) {
  const entries = Array.isArray(preparedPayload?.entries) ? preparedPayload.entries : [];
  return entries.map((entry, index) => ({
    Escena: Math.max(1, Number(entry?.sceneIndex || index + 1) || index + 1),
    Tiempo: String(entry?.timelineLabel || formatMontageExportTimelineLabel(entry) || "").trim(),
    "Guión": String(entry?.voiceOverText || "").trim(),
    "Descripción de escena": String(entry?.sceneDescription || "").trim(),
    "Texto en pantalla": String(entry?.onScreenText || "").trim(),
    "Elemento visual": String(entry?.visualNotes || "").trim(),
    "Cambios sugeridos": ""
  }));
}

async function downloadMontageReviewExcel(preparedPayload = null, baseFilename = "") {
  const rows = buildMontageReviewExcelRows(preparedPayload);
  if (!rows.length) throw new Error("montage_review_excel_empty");
  const XLSX = await ensureMontageExportXlsx();
  if (!XLSX?.utils?.json_to_sheet || !XLSX?.writeFile) throw new Error("xlsx_unavailable");
  const ws = XLSX.utils.json_to_sheet(rows, {
    header: ["Escena", "Tiempo", "Guión", "Descripción de escena", "Texto en pantalla", "Elemento visual", "Cambios sugeridos"]
  });
  ws["!cols"] = [
    { wch: 10 },
    { wch: 28 },
    { wch: 44 },
    { wch: 42 },
    { wch: 34 },
    { wch: 44 },
    { wch: 40 }
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "GuionRevision");
  const nameBase = stripFileExtension(baseFilename) || stripFileExtension(defaultMontageExportFilename()) || "montage";
  XLSX.writeFile(wb, `${nameBase}-revision-guion.xlsx`, { compression: true });
}

// --- Persistence ---

export function loadMontageExportSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(MONTAGE_EXPORT_STORAGE_KEY) || "{}");
    const normalized = normalizeMontageExportSettings(parsed || {});
    if (isLegacyAutoMontageFilename(normalized.filename)) normalized.filename = "";
    return normalized;
  } catch (_) {
    return normalizeMontageExportSettings({ filename: "" });
  }
}

export function persistMontageExportSettings() {
  try {
    localStorage.setItem(MONTAGE_EXPORT_STORAGE_KEY, JSON.stringify({
      ...normalizeMontageExportSettings(montageExportState),
      schemaVersion: MONTAGE_EXPORT_SETTINGS_SCHEMA_VERSION
    }));
  } catch (_) {
    // noop
  }
}

function loadPersistedMontageExportActiveJob() {
  try {
    const parsed = JSON.parse(localStorage.getItem(MONTAGE_EXPORT_ACTIVE_JOB_KEY) || "{}");
    const jobId = String(parsed?.jobId || "").trim();
    const startedAtMs = Math.max(0, Number(parsed?.startedAtMs || 0) || 0);
    if (!jobId) return null;
    if (startedAtMs > 0 && (Date.now() - startedAtMs) > MONTAGE_EXPORT_ACTIVE_JOB_MAX_AGE_MS) {
      localStorage.removeItem(MONTAGE_EXPORT_ACTIVE_JOB_KEY);
      return null;
    }
    return { jobId, startedAtMs };
  } catch (_) {
    return null;
  }
}

function persistMontageExportActiveJob(jobId = "", startedAtMs = 0) {
  const cleanJobId = String(jobId || "").trim();
  try {
    if (!cleanJobId) {
      localStorage.removeItem(MONTAGE_EXPORT_ACTIVE_JOB_KEY);
      return;
    }
    localStorage.setItem(MONTAGE_EXPORT_ACTIVE_JOB_KEY, JSON.stringify({
      jobId: cleanJobId,
      startedAtMs: Math.max(0, Number(startedAtMs || 0) || 0)
    }));
  } catch (_) {
    // noop
  }
}

// --- States Initialization ---

export let montageExportState = loadMontageExportSettings();
let montageExportBusy = false;
window.montageExportState = montageExportState;
window.montageExportBusy = montageExportBusy;
window.montageExportPreviewPaused = montageExportPreviewPaused;

function setMontageExportState(nextState = {}) {
  montageExportState = normalizeMontageExportSettings(nextState);
  window.montageExportState = montageExportState;
  return montageExportState;
}

function shouldSuspendMontagePreviewActivity() {
  return montageExportPreviewPaused === true;
}

export function setMontageExportPreviewPaused(isPaused = false) {
  montageExportPreviewPaused = Boolean(isPaused);
  window.montageExportPreviewPaused = montageExportPreviewPaused;
  return montageExportPreviewPaused;
}

let montageExportPreviewState = {
  loading: false,
  error: "",
  dataUrl: "",
  mediaType: "",
  mode: "normal",
  sceneIndex: 0,
  disabled: false,
  frontendPreview: null,
  lastSignature: "",
  debounceTimer: null,
  requestSeq: 0,
  lastJobPreviewRowId: "",
  lastJobPreviewAt: 0,
  lastReadyDataUrl: "",
  lastReadyMediaType: ""
};

const MONTAGE_EXPORT_PREVIEW_SOURCE_PROBE_TTL_MS = 8_000;
const montageExportPreviewSourceProbeCache = new Map();

function readMontageExportPreviewSourceProbe(url = "", mediaType = "") {
  const cacheKey = `${String(mediaType || "").startsWith("image/") ? "image" : "video"}::${String(url || "").trim()}`;
  const cached = montageExportPreviewSourceProbeCache.get(cacheKey) || null;
  if (!cached) return null;
  if (Date.now() - Number(cached.at || 0) > MONTAGE_EXPORT_PREVIEW_SOURCE_PROBE_TTL_MS) {
    montageExportPreviewSourceProbeCache.delete(cacheKey);
    return null;
  }
  return Boolean(cached.ok);
}

function cacheMontageExportPreviewSourceProbe(url = "", mediaType = "", ok = false) {
  const cleanUrl = String(url || "").trim();
  const key = `${String(mediaType || "").startsWith("image/") ? "image" : "video"}::${cleanUrl}`;
  if (!cleanUrl) return;
  montageExportPreviewSourceProbeCache.set(key, { at: Date.now(), ok: Boolean(ok) });
  if (montageExportPreviewSourceProbeCache.size > 300) {
    const firstKey = montageExportPreviewSourceProbeCache.keys().next().value;
    if (firstKey) montageExportPreviewSourceProbeCache.delete(firstKey);
  }
}

async function probeMontageExportPreviewSource(url = "", mediaType = "video/mp4") {
  const cleanUrl = String(url || "").trim();
  if (!cleanUrl) return false;
  if (cleanUrl.startsWith("data:") || cleanUrl.startsWith("blob:")) return true;
  const isImage = String(mediaType || "").toLowerCase().startsWith("image/");
  const cached = readMontageExportPreviewSourceProbe(cleanUrl, isImage ? "image" : "video");
  if (cached !== null) return cached;

  const result = await new Promise((resolve) => {
    const timeoutMs = 2500;
    let settled = false;
    let probeEl = null;
    const done = (ok = false) => {
      if (settled) return;
      settled = true;
      try { clearTimeout(timeoutHandle); } catch (_) { }
      if (probeEl) {
        probeEl.removeAttribute("src");
        probeEl.load?.();
      }
      resolve(Boolean(ok));
    };
    const timeoutHandle = setTimeout(() => {
      done(false);
    }, timeoutMs);
    if (isImage) {
      probeEl = new Image();
      probeEl.onload = () => done(true);
      probeEl.onerror = () => done(false);
      probeEl.src = cleanUrl;
      return;
    }

    probeEl = document.createElement("video");
    probeEl.playsInline = true;
    probeEl.muted = true;
    probeEl.preload = "auto";
    probeEl.addEventListener("loadeddata", () => done(true), { once: true });
    probeEl.addEventListener("canplay", () => done(true), { once: true });
    probeEl.addEventListener("error", () => done(false), { once: true });
    probeEl.src = cleanUrl;
    probeEl.load();
  });

  cacheMontageExportPreviewSourceProbe(cleanUrl, isImage ? "image" : "video", result);
  return result;
}

let montageExportJassubState = {
  instance: null,
  trackSignature: "",
  lastRenderSignature: "",
  loopHandle: 0,
  resizeObserver: null,
  bound: false,
  enabled: false,
  payload: null,
  rendering: false
};

let montageExportJobState = {
  jobId: "",
  pollTimer: null,
  resumeOnOnlineHandler: null,
  startedAtMs: 0,
  lastStage: "",
  lastSceneSubstage: "",
  lastHint: "",
  lastProgress: -1,
  lastPollSuccessAtMs: 0,
  lastHeartbeatAt: "",
  pollFailureCount: 0,
  jobNotFoundCount: 0,
  preferFirestorePolling: false,
  firestorePreferredMissCount: 0,
  firestorePollCount: 0,
  recoverySource: "",
  busyHandoffRecoveryCount: 0,
  reviewExcelEnabled: false,
  reviewExcelPayload: null,
  reviewExcelFilename: "",
  readyDownloadUrl: "",
  readyDownloadFilename: "",
  recentLogs: []
};

const MONTAGE_EXPORT_FLOATING_CARD_STORAGE_KEY = "cb_podcast_montage_export_floating_card_v1";
const MONTAGE_EXPORT_FLOATING_CARD_MAX_LOGS = 14;

function summarizeMontageExportLogPayload(payload = {}) {
  if (!payload || typeof payload !== "object") return "";
  const parts = [];
  const stage = String(payload.stage || "").trim();
  const substage = String(payload.substage || payload.sceneSubstage || "").trim();
  const progress = Number.isFinite(Number(payload.progress)) ? Math.round(Number(payload.progress) * 1000) / 10 : null;
  const hint = String(payload.hint || "").trim();
  if (stage) parts.push(stage);
  if (substage) parts.push(substage);
  if (progress !== null) parts.push(`${progress}%`);
  if (hint) parts.push(hint);
  return parts.join(" · ");
}

function readMontageExportFloatingCardPosition() {
  try {
    const parsed = JSON.parse(localStorage.getItem(MONTAGE_EXPORT_FLOATING_CARD_STORAGE_KEY) || "{}");
    const left = Math.max(8, Math.round(Number(parsed?.left || 0) || 0));
    const top = Math.max(8, Math.round(Number(parsed?.top || 0) || 0));
    return { left, top };
  } catch (_) {
    return { left: 24, top: 96 };
  }
}

function persistMontageExportFloatingCardPosition(left = 0, top = 0) {
  try {
    localStorage.setItem(MONTAGE_EXPORT_FLOATING_CARD_STORAGE_KEY, JSON.stringify({
      left: Math.max(0, Math.round(Number(left || 0) || 0)),
      top: Math.max(0, Math.round(Number(top || 0) || 0))
    }));
  } catch (_) {
    // noop
  }
}

function ensureMontageExportRecentLogs() {
  if (!Array.isArray(window.montageExportJobState.recentLogs)) {
    window.montageExportJobState.recentLogs = [];
  }
  return window.montageExportJobState.recentLogs;
}

function pushMontageExportRecentLog(event = "", payload = {}, level = "info") {
  const logs = ensureMontageExportRecentLogs();
  const entry = {
    at: new Date().toISOString(),
    level: ["info", "warn", "error", "debug"].includes(String(level || "").trim()) ? String(level || "").trim() : "info",
    event: String(event || "").trim() || "event",
    summary: summarizeMontageExportLogPayload(payload),
    payload: payload && typeof payload === "object" ? payload : {}
  };
  logs.push(entry);
  while (logs.length > MONTAGE_EXPORT_FLOATING_CARD_MAX_LOGS) logs.shift();
  return entry;
}

function renderMontageExportRecentLogs() {
  const container = window.els.montageExportFloatingLogs;
  if (!container) return;
  const logs = Array.isArray(window.montageExportJobState.recentLogs) ? window.montageExportJobState.recentLogs : [];
  container.innerHTML = "";
  if (!logs.length) {
    const empty = document.createElement("div");
    empty.className = "montage-export-floating-log-empty";
    empty.textContent = "Sin logs todavía.";
    container.appendChild(empty);
    return;
  }
  logs.forEach((log, index) => {
    const row = document.createElement("div");
    const isLatest = index === logs.length - 1;
    row.className = `montage-export-floating-log${isLatest ? " is-latest" : ""} is-${String(log?.level || "info").trim() || "info"}`;
    if (isLatest) {
      row.dataset.latest = "true";
      row.tabIndex = -1;
    }
    const head = document.createElement("div");
    head.className = "montage-export-floating-log-head";
    head.textContent = `${String(log?.event || "event").trim()} · ${String(log?.at || "").trim().slice(11, 19)}`;
    const body = document.createElement("div");
    body.className = "montage-export-floating-log-body";
    body.textContent = String(log?.summary || "").trim() || JSON.stringify(log?.payload || {}, null, 0);
    row.append(head, body);
    container.appendChild(row);
  });
  window.requestAnimationFrame(() => {
    if (!container) return;
    container.scrollTop = container.scrollHeight;
    const latest = container.querySelector(".montage-export-floating-log.is-latest");
    if (latest) {
      latest.scrollIntoView({ block: "end", behavior: "auto" });
    }
  });
}

function syncMontageExportFloatingCardPosition() {
  const card = window.els.montageExportFloatingCard;
  if (!card || card.hidden) return;
  const next = readMontageExportFloatingCardPosition();
  if (!card.dataset.positionApplied) {
    card.style.left = `${next.left}px`;
    card.style.top = `${next.top}px`;
    card.dataset.positionApplied = "true";
  }
}

function updateMontageExportFloatingCardVisibility() {
  const card = window.els.montageExportFloatingCard;
  if (!card) return;
  const activeJobId = String(window.montageExportJobState?.jobId || "").trim();
  const submissionInFlight = window.montageExportJobState?.submissionInFlight === true;
  const isReady = String(window.montageExportJobState?.lastStage || "").trim() === "ready";
  const shouldShow = Boolean(
    window.els.montageExportModal?.hidden === true
    && !isReady
    && (
      activeJobId
      || submissionInFlight
      || window.montageExportBusy
      || String(window.montageExportJobState?.lastStage || "").trim()
      || String(window.montageExportJobState?.lastHint || "").trim()
    )
  );
  card.hidden = !shouldShow;
  if (shouldShow) {
    card.dataset.busy = String(Boolean(window.montageExportBusy));
    card.dataset.tone = window.montageExportJobState?.lastStage === "error" ? "error" : (window.montageExportJobState?.readyDownloadUrl ? "success" : (window.montageExportBusy ? "warning" : "neutral"));
    const statusEl = window.els.montageExportFloatingStatus;
    const hintEl = window.els.montageExportFloatingHint;
    const titleEl = window.els.montageExportFloatingTitle;
    if (titleEl) {
      titleEl.textContent = window.montageExportBusy ? "Exportación en curso" : (window.montageExportJobState?.lastStage === "ready" ? "Exportación lista" : "Exportación guardada");
    }
    if (statusEl) {
      statusEl.textContent = String(window.montageExportJobState?.lastStage || "").trim()
        ? describeMontageExportStage(window.montageExportJobState.lastStage, window.montageExportState.exportMode)
        : "Exportación en seguimiento.";
    }
    if (hintEl) {
      hintEl.textContent = String(window.montageExportJobState?.lastHint || "").trim() || "Puedes reabrir el modal para recuperar los controles.";
    }
    renderMontageExportRecentLogs();
    if (window.els.montageExportFloatingProgress) {
      const progress = Number(window.montageExportJobState?.lastProgress);
      if (Number.isFinite(progress) && progress >= 0) {
        window.els.montageExportFloatingProgress.style.setProperty("--montage-export-progress", `${Math.round(Math.max(0, Math.min(1, progress)) * 1000) / 10}%`);
      } else {
        window.els.montageExportFloatingProgress.style.removeProperty("--montage-export-progress");
      }
    }
    syncMontageExportFloatingCardPosition();
  }
}

export function reopenMontageExportModalFromCard() {
  setMontageExportOpen(true);
  if (window.els.montageExportFloatingCard) {
    window.els.montageExportFloatingCard.hidden = true;
  }
  if (window.els.montageExportModal) {
    window.els.montageExportModal.dataset.restoreFromCard = "true";
  }
}

function logMontageExportDevtools(event = "", payload = {}, level = "info") {
  const cleanEvent = String(event || "").trim() || "event";
  const cleanLevel = ["info", "warn", "error", "debug"].includes(String(level || "").trim())
    ? String(level || "").trim()
    : "info";
  pushMontageExportRecentLog(cleanEvent, payload, cleanLevel);
  const prefix = `[podcaster][montage-export][${cleanEvent}]`;
  try {
    const logger = console[cleanLevel] || console.info;
    logger.call(console, prefix, payload);
  } catch (_) {
    console.info(prefix, payload);
  }
}

function isTransientMontageExportTransportError(error = null) {
  const status = Number(error?.status || error?.detail?.status || 0) || 0;
  if (status === 0) return true;
  if (status >= 500) return true;
  const message = String(
    error?.code
    || error?.detail?.error
    || error?.error
    || error?.message
    || ""
  ).trim().toLowerCase();
  if (!message) return false;
  return [
    "err_network_changed",
    "err_internet_disconnected",
    "failed to fetch",
    "networkerror",
    "network request failed",
    "load failed",
    "fetch failed"
  ].some((needle) => message.includes(needle));
}

function isMontageExportStatusRedirectFailure(error = null) {
  const message = String(
    error?.code
    || error?.detail?.error
    || error?.error
    || error?.message
    || ""
  ).trim().toLowerCase();
  const status = Number(error?.status || error?.detail?.status || 0) || 0;
  const sameOriginApiBase = String(resolveApiBase() || "").trim() === "/api";
  const remoteApiBase = String(getRemoteApiBase() || "").trim().toLowerCase();
  const pointsToRender = remoteApiBase.includes(".onrender.com/api");
  return sameOriginApiBase
    && pointsToRender
    && (status === 0 || status === 502 || status === 503)
    && (
      message.includes("failed to fetch")
      || message.includes("fetch failed")
      || message.includes("networkerror")
    );
}

function buildMontageExportEndpoint(path = "") {
  return buildExportApiUrl(path);
}

function sanitizeMontageExportJobFirestorePayload(job = null) {
  const source = job && typeof job === "object" ? job : {};
  const payload = {
    ok: true,
    jobId: String(source.jobId || "").trim(),
    status: String(source.status || "queued").trim() || "queued",
    stage: String(source.stage || "queued").trim() || "queued",
    progress: Math.max(0, Math.min(1, Number(source.progress || 0) || 0)),
    hint: String(source.hint || "").trim(),
    updatedAt: String(source.updatedAt || "").trim() || new Date().toISOString()
  };
  if (Number.isFinite(Number(source.currentSceneIndex))) payload.currentSceneIndex = Math.max(0, Math.round(Number(source.currentSceneIndex) || 0));
  if (Number.isFinite(Number(source.totalScenes))) payload.totalScenes = Math.max(0, Math.round(Number(source.totalScenes) || 0));
  if (source.currentRowId) payload.currentRowId = String(source.currentRowId || "").trim();
  if (source.sceneSubstage) payload.sceneSubstage = String(source.sceneSubstage || "").trim();
  if (source.currentStoragePath) payload.currentStoragePath = String(source.currentStoragePath || "").trim();
  if (source.currentDownloadUrl) payload.currentDownloadUrl = String(source.currentDownloadUrl || "").trim();
  if (source.heartbeatAt) payload.heartbeatAt = String(source.heartbeatAt || "").trim();
  if (source.lastHeartbeatAt) payload.heartbeatAt = String(source.lastHeartbeatAt || "").trim();
  if (source.degraded === true) payload.degraded = true;
  if (Number.isFinite(Number(source.failedSceneIndex))) payload.failedSceneIndex = Math.max(0, Math.round(Number(source.failedSceneIndex) || 0));
  if (source.failedRowId) payload.failedRowId = String(source.failedRowId || "").trim();
  if (source.failedSubstage) payload.failedSubstage = String(source.failedSubstage || "").trim();
  if (Array.isArray(source.warnings) && source.warnings.length) payload.warnings = source.warnings;
  if (source.error && typeof source.error === "object") payload.error = source.error;
  if (source.result && typeof source.result === "object") payload.result = source.result;
  if (source.export && typeof source.export === "object") payload.export = source.export;
  if (source.downloadUrl) payload.downloadUrl = String(source.downloadUrl || "").trim();
  else if (payload.result?.downloadUrl) payload.downloadUrl = String(payload.result.downloadUrl || "").trim();
  return payload;
}

async function loadMontageExportJobStatusFromFirestore(jobId = "") {
  const cleanJobId = String(jobId || "").trim();
  if (!cleanJobId || !montageExportFirestoreDb) return null;
  const snap = await firestoreGetDoc(firestoreDoc(montageExportFirestoreDb, "podcaster_export_jobs", cleanJobId));
  if (!snap.exists()) return null;
  const data = snap.data() || null;
  if (!data || typeof data !== "object") return null;
  return sanitizeMontageExportJobFirestorePayload(data);
}

async function loadMontageExportJobStatusFallback(jobId = "", error = null) {
  const cleanJobId = String(jobId || "").trim();
  if (!cleanJobId) return null;
  const redirectFailure = isMontageExportStatusRedirectFailure(error);
  if (!redirectFailure) return null;
  try {
    const fallback = await loadMontageExportJobStatusFromFirestore(cleanJobId);
    if (!fallback) return null;
    logMontageExportDevtools("poll_firestore_fallback", {
      jobId: cleanJobId,
      status: String(fallback?.status || "").trim() || undefined,
      stage: String(fallback?.stage || "").trim() || undefined,
      substage: String(fallback?.sceneSubstage || "").trim() || undefined,
      progress: Number.isFinite(Number(fallback?.progress)) ? Number(fallback.progress) : undefined
    }, "warn");
    return fallback;
  } catch (fallbackError) {
    logMontageExportDevtools("poll_firestore_fallback_failed", {
      jobId: cleanJobId,
      message: String(fallbackError?.message || fallbackError || "").trim() || undefined
    }, "warn");
    return null;
  }
}

async function applyMontageExportPolledStatus(data = null, cleanJobId = "") {
  if (String(window.montageExportJobState.jobId || "").trim() !== cleanJobId) return true;
  window.montageExportJobState.pollFailureCount = 0;
  window.montageExportJobState.jobNotFoundCount = 0;
  window.montageExportJobState.lastPollSuccessAtMs = Date.now();
  window.montageExportJobState.lastHeartbeatAt = String(data?.heartbeatAt || data?.updatedAt || "").trim();
  const stage = String(data?.stage || "").trim();
  const sceneSubstage = String(data?.sceneSubstage || "").trim();
  const hint = String(data?.hint || "").trim();
  const progress = Math.max(0, Math.min(1, Number(data?.progress || 0) || 0));
  const currentRowId = String(data?.currentRowId || "").trim();
  const currentSceneIndex = Math.max(0, Number(data?.currentSceneIndex || 0) || 0);
  const totalScenes = Math.max(0, Number(data?.totalScenes || 0) || 0);
  const failedSceneIndex = Math.max(0, Number(data?.failedSceneIndex || data?.error?.detail?.failedSceneIndex || 0) || 0);
  const failedSubstage = String(data?.failedSubstage || data?.error?.detail?.failedSubstage || "").trim();
  const changed = stage !== window.montageExportJobState.lastStage || sceneSubstage !== window.montageExportJobState.lastSceneSubstage || hint !== window.montageExportJobState.lastHint || Math.abs(progress - window.montageExportJobState.lastProgress) > 0.001;
  if (changed) {
    window.montageExportJobState.lastStage = stage;
    window.montageExportJobState.lastSceneSubstage = sceneSubstage;
    window.montageExportJobState.lastHint = hint;
    window.montageExportJobState.lastProgress = progress;
    logMontageExportDevtools("stage_transition", {
      status: String(data?.status || "").trim(),
      stage,
      substage: sceneSubstage || undefined,
      progress,
      currentSceneIndex,
      totalScenes,
      currentRowId: currentRowId || undefined,
      failedSceneIndex: failedSceneIndex || undefined,
      failedSubstage: failedSubstage || undefined,
      hint: hint || undefined
    });
    setMontageExportProgress(progress);
    const stageLabel = stage === "render_scene_segments" && sceneSubstage
      ? describeMontageExportSceneSubstage(sceneSubstage, currentSceneIndex, totalScenes) || describeMontageExportStage(stage, window.montageExportState.exportMode)
      : describeMontageExportStage(stage, window.montageExportState.exportMode);
    setMontageExportStatus(stageLabel, hint, {
      tone: stage === "ready" ? (Array.isArray(data?.warnings) && data.warnings.length ? "warning" : "success") : stage === "error" ? "error" : "neutral"
    });
  }
  if (stage === "render_scene_segments" && currentSceneIndex > 0) {
    const progressivePreview = await resolveMontageExportStatusPreviewMedia(data);
    maybeRefreshMontageExportPreviewFromJob({
      rowId: currentRowId,
      sceneIndex: currentSceneIndex,
      totalScenes,
      progressiveMedia: progressivePreview
    });
  }
  if (String(data?.status || "").trim() === "ready") {
    logMontageExportDevtools("export_ready", {
      stage,
      progress,
      warnings: Array.isArray(data?.warnings) ? data.warnings.length : 0
    });
    clearMontageExportPolling();
    persistMontageExportActiveJob("");
    setMontageExportContinueButton({ visible: false });
    const statusText = "Tu video está listo.";
    let hintText = "";
    const url = String(data?.downloadUrl || data?.export?.downloadUrl || "").trim();
    const name = String(data?.export?.filename || window.montageExportState.filename || "montage").trim() || "montage";
    setMontageExportDownloadButton({
      visible: Boolean(url),
      url,
      filename: name
    });
    persistMontageExportReferenceToSession({
      exportId: String(data?.export?.exportId || "").trim(),
      downloadUrl: url,
      storagePath: String(data?.export?.storagePath || "").trim(),
      filename: name,
      mimeType: String(data?.export?.mimeType || "").trim(),
      createdAtIso: String(data?.export?.createdAt || "").trim(),
      expiresAtIso: String(data?.export?.expiresAt || "").trim()
    });
    if (window.montageExportJobState.reviewExcelEnabled === true && window.montageExportState.exportMode === "review") {
      try {
        await downloadMontageReviewExcel(
          window.montageExportJobState.reviewExcelPayload,
          window.montageExportJobState.reviewExcelFilename || name
        );
        if (!hintText) hintText = "También descargamos el Excel de revisión por escena.";
      } catch (error) {
        void error;
        const extra = "El video sí se descargó, pero no pudimos generar el Excel de revisión.";
        hintText = hintText ? `${hintText} ${extra}` : extra;
        setMontageExportStatus(statusText, hintText, { tone: "warning" });
        window.montageExportBusy = false;
        window.setTimelinePreviewsSuspended(false);
        setMontageExportPreviewPaused(false);
        setMontageExportBusy(false);
        return true;
      }
    }
    setMontageExportStatus(statusText, hintText, { tone: "success" });
    window.montageExportBusy = false;
    window.setTimelinePreviewsSuspended(false);
    setMontageExportPreviewPaused(false);
    setMontageExportBusy(false);
    if (window.els.montageExportFloatingCard) {
      window.els.montageExportFloatingCard.hidden = true;
    }
    updateMontageExportFloatingCardVisibility();
    return true;
  }
  if (String(data?.status || "").trim() === "error") {
    const err = data?.error && typeof data.error === "object" ? data.error : null;
    logMontageExportDevtools("export_error", {
      stage,
      progress,
      failedSceneIndex: failedSceneIndex || undefined,
      failedSubstage: failedSubstage || undefined,
      error: err?.error || err?.code || undefined,
      detail: err?.detail || undefined
    }, "error");
    clearMontageExportPolling();
    persistMontageExportActiveJob("");
    setMontageExportContinueButton({ visible: false });
    setMontageExportDownloadButton({ visible: false });
    const cleanErrorCode = String(err?.code || err?.error || "").trim();
    const failedLabel = failedSubstage
      ? describeMontageExportSceneSubstage(failedSubstage, failedSceneIndex, totalScenes) || failedSubstage
      : "";
    setMontageExportProgress(null);
    setMontageExportStatus(
      "No pudimos exportar tu video.",
      cleanErrorCode === "montage_export_worker_restarted"
        ? "El backend se reinició durante el render de la escena. Inicia una nueva exportación."
        : cleanErrorCode === "montage_export_worker_stalled"
          ? "El worker dejó de reportar progreso. Inicia una nueva exportación."
          : [
            failedLabel ? `${failedLabel}` : "",
            failedSceneIndex > 0 ? `Fallo en la escena ${failedSceneIndex}.` : "",
            String(err?.detail?.stderrPreview || hint || err?.error || "Revisa la composición review y vuelve a intentar.").trim()
          ].filter(Boolean).join(" "),
      { tone: "error" }
    );
    window.montageExportBusy = false;
    window.setTimelinePreviewsSuspended(false);
    setMontageExportPreviewPaused(false);
    setMontageExportBusy(false);
    updateMontageExportFloatingCardVisibility();
    return true;
  }
  if (data?.degraded === true && String(data?.status || "").trim() === "running") {
    const degradedHint = String(data?.hint || "").trim() || "Recuperando el estado del export…";
    setMontageExportStatus(
      describeMontageExportStage(stage, window.montageExportState.exportMode),
      degradedHint,
      { tone: "warning" }
    );
    scheduleMontageExportPollRetry(cleanJobId, 0, { transient: false });
    updateMontageExportFloatingCardVisibility();
    return true;
  }
  updateMontageExportFloatingCardVisibility();
  return false;
}

function scheduleMontageExportPollRetry(jobId = "", failureCount = 0, { transient = false } = {}) {
  const cleanJobId = String(jobId || "").trim();
  if (!cleanJobId) return;
  const delayMs = transient
    ? Math.min(15000, 2500 + (Math.max(0, failureCount - 1) * 1500))
    : Math.min(8000, 2000 + (Math.max(0, failureCount) * 600));
  const shouldResumeOnOnline = transient && typeof window.addEventListener === "function" && !window.montageExportJobState.resumeOnOnlineHandler;
  if (shouldResumeOnOnline) {
    const handler = () => {
      if (window.montageExportJobState.resumeOnOnlineHandler === handler) {
        window.removeEventListener("online", handler);
        window.montageExportJobState.resumeOnOnlineHandler = null;
      }
      if (String(window.montageExportJobState.jobId || "").trim() !== cleanJobId) return;
      if (window.montageExportJobState.pollTimer) {
        window.clearTimeout(window.montageExportJobState.pollTimer);
        window.montageExportJobState.pollTimer = null;
      }
      pollMontageExportJob(cleanJobId).catch(() => { });
    };
    window.montageExportJobState.resumeOnOnlineHandler = handler;
    window.addEventListener("online", handler, { once: true });
  }
  window.montageExportJobState.pollTimer = window.setTimeout(() => {
    if (String(window.montageExportJobState.jobId || "").trim() !== cleanJobId) return;
    pollMontageExportJob(cleanJobId).catch(() => { });
  }, delayMs);
}

function scheduleMontageExportJobNotFoundRetry(jobId = "", failureCount = 0) {
  const cleanJobId = String(jobId || "").trim();
  if (!cleanJobId) return;
  const retries = Math.max(0, Number(failureCount || 0) || 0);
  if (retries >= MONTAGE_EXPORT_JOB_NOT_FOUND_MAX_RETRIES) return;
  const delayMs = Math.min(2500, 350 + (retries * 350));
  if (window.montageExportJobState.pollTimer) {
    window.clearTimeout(window.montageExportJobState.pollTimer);
    window.montageExportJobState.pollTimer = null;
  }
  window.montageExportJobState.pollTimer = window.setTimeout(() => {
    if (String(window.montageExportJobState.jobId || "").trim() !== cleanJobId) return;
    pollMontageExportJob(cleanJobId).catch(() => { });
  }, delayMs);
}

function schedulePreferredFirestorePollRetry(jobId = "", missCount = 0) {
  const cleanJobId = String(jobId || "").trim();
  if (!cleanJobId) return;
  const misses = Math.max(0, Number(missCount || 0) || 0);
  const delayMs = Math.min(6000, 1800 + (misses * 700));
  if (window.montageExportJobState.pollTimer) {
    window.clearTimeout(window.montageExportJobState.pollTimer);
    window.montageExportJobState.pollTimer = null;
  }
  window.montageExportJobState.pollTimer = window.setTimeout(() => {
    if (String(window.montageExportJobState.jobId || "").trim() !== cleanJobId) return;
    pollMontageExportJob(cleanJobId).catch(() => { });
  }, delayMs);
}

// --- Migrated Montage Export Functions ---

export function buildDefaultMontageBrandOverlay() {
  return { ...DEFAULT_MONTAGE_BRAND_OVERLAY };
}

function buildMontageBrandOverlayForExport(isReel = false) {
  return {
    ...buildDefaultMontageBrandOverlay(),
    enabled: window.montageExportState.includeLogo !== false,
    ...(isReel === true
      ? {
        marginPct: 0.03,
        widthPct: 0.09
      }
      : {})
  };
}

function isMontageExportReelModeActive() {
  const session = window.getActiveSession?.() || null;
  const cfg = window.getPodcastVideoConfig?.(session) || session?.podcastVideoConfig || {};
  return cfg?.reelModeEnabled === true;
}

function getMontageExportTextRenderApi() {
  return window.PodcasterTextRenderSpec || window.PodcasterKaraokeRenderSpec || {};
}

function getMontageExportPreviewContainer() {
  return document.getElementById("montageExportPreviewContainer");
}

function getMontageExportPreviewSubtitleCanvas() {
  return document.getElementById("montageExportPreviewSubtitleCanvas");
}

function resolveMontageExportAssFontFamily(value = "") {
  const first = String(value || "").split(",")[0]?.trim() || "";
  return first.replace(/^['"]|['"]$/g, "").trim() || "Arial";
}

function getMontageExportPreviewCanvasSize() {
  const container = getMontageExportPreviewContainer();
  return {
    width: Math.max(2, Math.round(Number(container?.clientWidth || 0) || 1280)),
    height: Math.max(2, Math.round(Number(container?.clientHeight || 0) || 720))
  };
}

function getMontageExportPreviewCurrentTimeMs() {
  const seekbarValue = Number(window.els?.montageExportPreviewSeekbar?.value || 0) || 0;
  const timelineStartMs = Math.max(
    0,
    Number(window.montageExportPreviewState?.frontendPreview?.timelineStartMs || 0) || 0
  );
  const visibleVideo = [window.els?.montageExportPreviewVideo, window.els?.montageExportPreviewVideoAlt]
    .find((video) => video && !video.hidden && String(video.getAttribute("src") || "").trim());
  if (visibleVideo && Number.isFinite(Number(visibleVideo.currentTime))) {
    return Math.max(0, timelineStartMs + Math.round(Number(visibleVideo.currentTime || 0) * 1000));
  }
  return Math.max(
    0,
    seekbarValue,
    timelineStartMs
  );
}

function isMontageExportPreviewJassubActive() {
  return montageExportJassubState.enabled === true && Boolean(montageExportJassubState.instance);
}

function shouldUseMontageExportPreviewJassub(payload = {}) {
  if (payload?.onlyAudio === true) return false;
  if (String(payload?.exportMode || "").trim() === "review") return false;
  return Boolean(Array.isArray(payload?.onScreenTextTimeline?.segments) && payload.onScreenTextTimeline.segments.length);
}

function buildMontageExportPreviewAssContent(payload = {}) {
  const resolveSpec = typeof window.resolveOnScreenTextRenderSpec === "function"
    ? window.resolveOnScreenTextRenderSpec
    : null;
  if (!resolveSpec) return "";
  const dims = getMontageExportPreviewCanvasSize();
  return buildMontageRenderAssContent({
    payload,
    width: dims.width,
    height: dims.height,
    resolveSpec,
    defaultFontFamily: resolveMontageExportAssFontFamily(payload?.onScreenTextTimeline?.settings?.fontFamily)
  });
}

async function destroyMontageExportPreviewJassub({ preserveFrame = false } = {}) {
  if (montageExportJassubState.loopHandle) {
    window.cancelAnimationFrame(montageExportJassubState.loopHandle);
    montageExportJassubState.loopHandle = 0;
  }
  if (montageExportJassubState.resizeObserver) {
    montageExportJassubState.resizeObserver.disconnect();
    montageExportJassubState.resizeObserver = null;
  }
  const current = montageExportJassubState.instance;
  montageExportJassubState.instance = null;
  montageExportJassubState.trackSignature = "";
  montageExportJassubState.lastRenderSignature = "";
  montageExportJassubState.enabled = false;
  montageExportJassubState.payload = null;
  montageExportJassubState.rendering = false;
  const canvas = getMontageExportPreviewSubtitleCanvas();
  const container = getMontageExportPreviewContainer();
  if (container) container.dataset.subtitleRenderer = "dom";
  if (canvas && preserveFrame !== true) canvas.hidden = true;
  if (current && typeof current.destroy === "function") {
    try {
      await current.destroy();
    } catch (error) {
      console.warn("[podcaster][montage-export][jassub] destroy_failed", {
        message: String(error?.message || error || "").trim()
      });
    }
  }
}

async function renderMontageExportPreviewJassub(force = false) {
  const instance = montageExportJassubState.instance;
  if (!instance || montageExportJassubState.rendering) return;
  const canvas = getMontageExportPreviewSubtitleCanvas();
  if (!canvas || canvas.hidden) return;
  const dims = getMontageExportPreviewCanvasSize();
  const currentTimeMs = getMontageExportPreviewCurrentTimeMs();
  const renderSignature = `${dims.width}x${dims.height}@${currentTimeMs}`;
  if (!force && renderSignature === montageExportJassubState.lastRenderSignature) return;
  montageExportJassubState.rendering = true;
  try {
    await instance.manualRender({
      expectedDisplayTime: performance.now(),
      width: dims.width,
      height: dims.height,
      mediaTime: currentTimeMs / 1000
    }, force);
    montageExportJassubState.lastRenderSignature = renderSignature;
  } catch (error) {
    console.warn("[podcaster][montage-export][jassub] render_failed", {
      message: String(error?.message || error || "").trim()
    });
  } finally {
    montageExportJassubState.rendering = false;
  }
}

function isMontageExportPreviewPlaying() {
  const visibleVideo = [window.els?.montageExportPreviewVideo, window.els?.montageExportPreviewVideoAlt]
    .find((video) => video && !video.hidden && String(video.getAttribute("src") || "").trim());
  if (visibleVideo) return visibleVideo.paused === false && visibleVideo.ended !== true;
  return Boolean(window.els?.montageExportPreviewPauseBtn && window.els.montageExportPreviewPauseBtn.hidden === false);
}

function scheduleMontageExportPreviewJassubLoop() {
  if (!isMontageExportPreviewJassubActive()) return;
  if (montageExportJassubState.loopHandle) return;
  const tick = () => {
    montageExportJassubState.loopHandle = 0;
    void renderMontageExportPreviewJassub().finally(() => {
      if (isMontageExportPreviewJassubActive() && isMontageExportPreviewPlaying()) {
        montageExportJassubState.loopHandle = window.requestAnimationFrame(tick);
      }
    });
  };
  montageExportJassubState.loopHandle = window.requestAnimationFrame(tick);
}

async function syncMontageExportPreviewJassub(payload = null) {
  if (!shouldUseMontageExportPreviewJassub(payload)) {
    await destroyMontageExportPreviewJassub();
    return false;
  }
  const assContent = buildMontageExportPreviewAssContent(payload);
  if (!assContent) {
    await destroyMontageExportPreviewJassub();
    return false;
  }
  const canvas = getMontageExportPreviewSubtitleCanvas();
  const container = getMontageExportPreviewContainer();
  if (!canvas || !container) return false;
  const dims = getMontageExportPreviewCanvasSize();
  canvas.width = dims.width;
  canvas.height = dims.height;
  canvas.hidden = false;
  container.dataset.subtitleRenderer = "jassub";
  const signature = JSON.stringify({
    assContent,
    width: dims.width,
    height: dims.height,
    resolution: payload?.resolution || "source",
    exportMode: payload?.exportMode || "normal",
    partyKaraoke: payload?.partyKaraoke !== false
  });
  if (!montageExportJassubState.instance) {
    const settings = payload?.onScreenTextTimeline?.settings || {};
    montageExportJassubState.instance = new JASSUB({
      canvas,
      subContent: assContent,
      defaultFont: resolveMontageExportAssFontFamily(settings.fontFamily),
      queryFonts: "local"
    });
    await montageExportJassubState.instance.ready;
    montageExportJassubState.resizeObserver = new ResizeObserver(() => {
      void renderMontageExportPreviewJassub(true);
    });
    montageExportJassubState.resizeObserver.observe(container);
  } else if (signature !== montageExportJassubState.trackSignature) {
    await montageExportJassubState.instance.ready;
    await montageExportJassubState.instance.renderer.setTrack(assContent);
  }
  montageExportJassubState.trackSignature = signature;
  montageExportJassubState.payload = payload;
  montageExportJassubState.enabled = true;
  await renderMontageExportPreviewJassub(true);
  scheduleMontageExportPreviewJassubLoop();
  return true;
}

function bindMontageExportPreviewJassub() {
  if (montageExportJassubState.bound) return;
  montageExportJassubState.bound = true;
  const syncNow = () => {
    if (!isMontageExportPreviewJassubActive()) return;
    void renderMontageExportPreviewJassub(true);
  };
  const syncLoop = () => {
    if (!isMontageExportPreviewJassubActive()) return;
    scheduleMontageExportPreviewJassubLoop();
  };
  [window.els?.montageExportPreviewVideo, window.els?.montageExportPreviewVideoAlt].forEach((video) => {
    if (!video) return;
    video.addEventListener("loadedmetadata", syncNow);
    video.addEventListener("loadeddata", syncNow);
    video.addEventListener("play", syncLoop);
    video.addEventListener("pause", syncNow);
    video.addEventListener("seeked", syncNow);
    video.addEventListener("timeupdate", syncNow);
    video.addEventListener("ended", syncNow);
  });
  window.els?.montageExportPreviewPlayBtn?.addEventListener("click", syncLoop);
  window.els?.montageExportPreviewPauseBtn?.addEventListener("click", syncNow);
  window.els?.montageExportPreviewStopBtn?.addEventListener("click", syncNow);
  window.els?.montageExportPreviewSeekbar?.addEventListener("input", syncNow);
  window.addEventListener("resize", syncNow);
}

function getMontageExportPreviewMediaTargets(mediaType = "", preferAlt = false) {
  const isImage = String(mediaType || "").startsWith("image/");
  const primary = isImage ? window.els.montageExportPreviewImage : window.els.montageExportPreviewVideo;
  const alt = isImage ? window.els.montageExportPreviewImageAlt : window.els.montageExportPreviewVideoAlt;
  const target = preferAlt && alt ? alt : (primary || alt || null);
  const fallback = target === primary ? alt : primary;
  return { isImage, primary, alt, target, fallback };
}

function applyMontageFrontendPreviewMediaLayout(frontendPreview = null, mediaEl = null) {
  const preview = frontendPreview && typeof frontendPreview === "object" ? frontendPreview : null;
  const container = document.getElementById("montageExportPreviewContainer");
  const resolver = window.resolveSceneMediaRenderSpec;
  if (!preview || !container || typeof resolver !== "function") return;
  const applyLayout = (mediaEl = null) => {
    if (!mediaEl) return;
    const sourceWidth = Number(mediaEl.tagName === "VIDEO" ? mediaEl.videoWidth : mediaEl.naturalWidth) || 0;
    const sourceHeight = Number(mediaEl.tagName === "VIDEO" ? mediaEl.videoHeight : mediaEl.naturalHeight) || 0;
    if (!(sourceWidth > 0 && sourceHeight > 0)) return;
    const spec = resolver({
      canvasWidth: Math.max(2, Number(container.clientWidth || 0) || 1280),
      canvasHeight: Math.max(2, Number(container.clientHeight || 0) || 720),
      sourceWidth,
      sourceHeight,
      reelMode: isMontageExportReelModeActive(),
      visualLayoutMode: preview.visualLayoutMode,
      mediaScale: preview.mediaScale,
      mediaOffsetXPct: preview.mediaOffsetXPct,
      mediaOffsetYPct: preview.mediaOffsetYPct,
      mediaMotionPreset: preview.mediaMotionPreset,
      visualEffects: preview.visualEffects || null,
      mediaKind: String(preview.mediaType || "").startsWith("image/") ? "image" : "video",
      durationSec: 12
    });
    mediaEl.style.setProperty("--pod-scene-media-left", `${spec.leftPx.toFixed(3)}px`);
    mediaEl.style.setProperty("--pod-scene-media-top", `${spec.topPx.toFixed(3)}px`);
    mediaEl.style.setProperty("--pod-scene-media-width", `${spec.scaledRect.width.toFixed(3)}px`);
    mediaEl.style.setProperty("--pod-scene-media-height", `${spec.scaledRect.height.toFixed(3)}px`);
    mediaEl.style.setProperty("--pod-scene-media-translate-x", "0px");
    mediaEl.style.setProperty("--pod-scene-media-translate-y", "0px");
    mediaEl.style.setProperty("--pod-scene-media-pan-x-amplitude", `${Number(spec.motion?.amplitudeXPx || 0).toFixed(3)}px`);
    mediaEl.style.setProperty("--pod-scene-media-pan-y-amplitude", `${Number(spec.motion?.amplitudeYPx || 0).toFixed(3)}px`);
  };
  const targetMediaEl = mediaEl || (String(preview.mediaType || "").startsWith("image/")
    ? window.els.montageExportPreviewImage
    : window.els.montageExportPreviewVideo);
  if (String(preview.mediaType || "").startsWith("image/") && targetMediaEl) {
    targetMediaEl.addEventListener("load", () => applyLayout(targetMediaEl), { once: true });
    applyLayout(targetMediaEl);
    return;
  }
  if (targetMediaEl) {
    targetMediaEl.addEventListener("loadedmetadata", () => applyLayout(targetMediaEl), { once: true });
    applyLayout(targetMediaEl);
  }
}

function syncMontageFrontendPreviewMediaLayout(frontendPreview = null) {
  const preview = frontendPreview && typeof frontendPreview === "object" ? frontendPreview : null;
  if (!preview) return;
  const targetMediaEl = String(preview.mediaType || "").startsWith("image/")
    ? window.els.montageExportPreviewImage
    : window.els.montageExportPreviewVideo;
  applyMontageFrontendPreviewMediaLayout(preview, targetMediaEl);
}

export function setMontageExportOpen(isOpen = false) {
  if (window.els.montageExportModal) {
    window.els.montageExportModal.hidden = !Boolean(isOpen);
  }
}

function clearMontageExportPolling() {
  if (window.montageExportJobState.pollTimer) {
    window.clearTimeout(window.montageExportJobState.pollTimer);
    window.montageExportJobState.pollTimer = null;
  }
  if (window.montageExportJobState.resumeOnOnlineHandler) {
    window.removeEventListener("online", window.montageExportJobState.resumeOnOnlineHandler);
    window.montageExportJobState.resumeOnOnlineHandler = null;
  }
}

export function setMontageExportContinueButton({ visible = false, label = "Continuar exportación" } = {}) {
  if (!window.els.continueMontageExportBtn) return;
  const hasJobId = Boolean(String(window.montageExportJobState.jobId || "").trim());
  const shouldShow = Boolean(visible) && hasJobId;
  window.els.continueMontageExportBtn.hidden = !shouldShow;
  const textEl = window.els.continueMontageExportBtn.querySelector("span");
  if (textEl) {
    textEl.textContent = String(label || "Continuar exportación").trim() || "Continuar exportación";
  }
}

function setMontageExportDownloadButton({ visible = false, url = "", filename = "" } = {}) {
  if (!window.els.montageExportDownloadBtn) return;
  const cleanUrl = String(url || "").trim();
  const cleanFilename = String(filename || "").trim() || "montage.mp4";
  const shouldShow = Boolean(visible) && Boolean(cleanUrl);
  window.montageExportJobState.readyDownloadUrl = shouldShow ? cleanUrl : "";
  window.montageExportJobState.readyDownloadFilename = shouldShow ? cleanFilename : "";
  window.els.montageExportDownloadBtn.hidden = !shouldShow;
  window.els.montageExportDownloadBtn.disabled = false;
  window.els.montageExportDownloadBtn.dataset.downloadUrl = shouldShow ? cleanUrl : "";
  window.els.montageExportDownloadBtn.dataset.filename = shouldShow ? cleanFilename : "";
  const textEl = window.els.montageExportDownloadBtn.querySelector("span");
  if (textEl) textEl.textContent = cleanFilename.toLowerCase().endsWith(".mp4") ? "Descargar MP4" : "Descargar archivo";
}

function normalizeMontageExportReference(raw = null) {
  if (!raw || typeof raw !== "object") return null;
  const downloadUrl = String(raw?.downloadUrl || raw?.url || "").trim();
  const storagePath = String(raw?.storagePath || raw?.path || "").trim();
  if (!downloadUrl && !storagePath) return null;
  return {
    exportId: String(raw?.exportId || raw?.jobId || "").trim(),
    downloadUrl,
    storagePath,
    filename: String(raw?.filename || "").trim(),
    mimeType: String(raw?.mimeType || "").trim().toLowerCase() || "video/mp4",
    createdAtIso: String(raw?.createdAtIso || raw?.createdAt || "").trim(),
    expiresAtIso: String(raw?.expiresAtIso || raw?.expiresAt || "").trim(),
    bucketName: String(raw?.bucketName || "").trim()
  };
}

function getPersistedMontageExportReference(session = null) {
  const activeSession = session || window.getActiveSession?.() || null;
  const cfg = window.normalizePodcastVideoConfig?.(activeSession?.podcastVideoConfig || {}) || {};
  return normalizeMontageExportReference(cfg?.latestMontageExport || null);
}

function persistMontageExportReferenceToSession(reference = null) {
  const normalized = normalizeMontageExportReference(reference);
  const session = window.getActiveSession?.() || null;
  if (!normalized || !session?.id || typeof window.upsertActiveSession !== "function") return normalized;
  window.upsertActiveSession((current) => ({
    ...current,
    podcastVideoConfig: {
      ...(current.podcastVideoConfig || {}),
      latestMontageExport: normalized
    }
  }), {
    persist: true,
    markDirty: false,
    render: false,
    recordHistory: false,
    autosaveReason: "ui-state"
  });
  return normalized;
}

function hydrateMontageExportDownloadButtonFromSession() {
  if (window.montageExportJobState?.jobId || window.montageExportBusy === true) return;
  const reference = getPersistedMontageExportReference();
  if (!reference?.downloadUrl) {
    if (!window.montageExportJobState?.readyDownloadUrl) {
      setMontageExportDownloadButton({ visible: false });
    }
    return;
  }
  setMontageExportDownloadButton({
    visible: true,
    url: reference.downloadUrl,
    filename: reference.filename || window.montageExportState.filename || "montage.mp4"
  });
}

export function downloadReadyMontageExport() {
  const url = String(window.montageExportJobState?.readyDownloadUrl || window.els.montageExportDownloadBtn?.dataset?.downloadUrl || "").trim();
  if (!url) return;
  const filename = String(window.montageExportJobState?.readyDownloadFilename || window.els.montageExportDownloadBtn?.dataset?.filename || "montage.mp4").trim() || "montage.mp4";
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function resetMontageExportJobState() {
  clearMontageExportPolling();
  montageExportSubmitLocked = false;
  window.montageExportJobState = {
    jobId: "",
    submissionInFlight: false,
    pollTimer: null,
    resumeOnOnlineHandler: null,
    startedAtMs: 0,
    lastStage: "",
    lastSceneSubstage: "",
    lastHint: "",
    lastProgress: -1,
    lastPollSuccessAtMs: 0,
    lastHeartbeatAt: "",
    pollFailureCount: 0,
    jobNotFoundCount: 0,
    preferFirestorePolling: false,
    firestorePreferredMissCount: 0,
    firestorePollCount: 0,
    recoverySource: "",
    busyHandoffRecoveryCount: 0,
    reviewExcelEnabled: false,
    reviewExcelPayload: null,
    reviewExcelFilename: "",
    readyDownloadUrl: "",
    readyDownloadFilename: "",
    recentLogs: []
  };
  setMontageExportContinueButton({ visible: false });
  setMontageExportDownloadButton({ visible: false });
  updateMontageExportFloatingCardVisibility();
}

export function setMontageExportPreviewState({ loading = false, error = "", dataUrl = "", mediaType = "", mode = window.montageExportState.exportMode, sceneIndex = 0, meta = "", disabled = false, frontendPreview = null } = {}) {
  const isReelPreview = isMontageExportReelModeActive();
  window.montageExportPreviewState.loading = Boolean(loading);
  window.montageExportPreviewState.error = String(error || "").trim();
  window.montageExportPreviewState.dataUrl = String(dataUrl || "").trim();
  window.montageExportPreviewState.mediaType = String(mediaType || "").trim().toLowerCase();
  window.montageExportPreviewState.mode = String(mode || window.montageExportState.exportMode || "normal").trim() || "normal";
  window.montageExportPreviewState.sceneIndex = Math.max(0, Number(sceneIndex || 0) || 0);
  window.montageExportPreviewState.disabled = Boolean(disabled);
  window.montageExportPreviewState.frontendPreview = frontendPreview && typeof frontendPreview === "object" ? frontendPreview : null;
  if (window.els.montageExportPreviewBox) {
    window.els.montageExportPreviewBox.dataset.mode = window.montageExportPreviewState.mode;
    window.els.montageExportPreviewBox.dataset.reel = isReelPreview ? "true" : "false";
    window.els.montageExportPreviewBox.dataset.state = window.montageExportPreviewState.loading
      ? "loading"
      : window.montageExportPreviewState.disabled
        ? "disabled"
        : window.montageExportPreviewState.error
          ? "error"
          : window.montageExportPreviewState.dataUrl
            ? "ready"
            : "idle";
  }
  if (window.els.montageExportPreviewBadge) {
    window.els.montageExportPreviewBadge.textContent = isReelPreview
      ? "Reel 9:16"
      : (window.montageExportPreviewState.mode === "review" ? "Revisión" : "Normal");
  }
  if (window.els.montageExportPreviewMeta) {
    const baseMeta = String(meta || (
      window.montageExportPreviewState.sceneIndex > 0
        ? `Escena ${window.montageExportPreviewState.sceneIndex} de referencia.`
        : "Así se vería tu video exportado."
    )).trim();
    window.els.montageExportPreviewMeta.textContent = isReelPreview && !/reel|9:16/i.test(baseMeta)
      ? `${baseMeta} Export reel 9:16.`
      : baseMeta;
  }

  const hasStablePreview = Boolean(window.montageExportPreviewState.dataUrl && !window.montageExportPreviewState.loading && !window.montageExportPreviewState.error);
  if (hasStablePreview) {
    window.montageExportPreviewState.lastReadyDataUrl = window.montageExportPreviewState.dataUrl;
    window.montageExportPreviewState.lastReadyMediaType = window.montageExportPreviewState.mediaType || "";
  }

  const hasReadyPreview = Boolean(window.montageExportPreviewState.dataUrl && !window.montageExportPreviewState.loading && !window.montageExportPreviewState.error);
  const isVideoPreview = hasReadyPreview && window.montageExportPreviewState.mediaType.startsWith("video/");
  const preferAltTarget = Boolean(window.montageExportBusy && hasReadyPreview);
  const mediaTargets = getMontageExportPreviewMediaTargets(window.montageExportPreviewState.mediaType, preferAltTarget);
  const targetMediaEl = mediaTargets.target;
  const fallbackMediaEl = mediaTargets.fallback;
  const mediaLoadSeq = (window.montageExportPreviewState.mediaLoadSeq || 0) + 1;
  window.montageExportPreviewState.mediaLoadSeq = mediaLoadSeq;
  const revealTargetMedia = () => {
    if (window.montageExportPreviewState.mediaLoadSeq !== mediaLoadSeq) return;
    if (fallbackMediaEl && fallbackMediaEl !== targetMediaEl) {
      try { fallbackMediaEl.pause?.(); } catch (_) { }
      fallbackMediaEl.hidden = true;
    }
    if (!targetMediaEl) return;
    targetMediaEl.hidden = false;
    if (isVideoPreview) {
      targetMediaEl.muted = true;
      const playPromise = targetMediaEl.play?.();
      if (playPromise && typeof playPromise.catch === "function") playPromise.catch(() => { });
    }
    applyMontageFrontendPreviewMediaLayout(window.montageExportPreviewState.frontendPreview, targetMediaEl);
  };
  if (isVideoPreview && targetMediaEl) {
    const currentSrc = String(targetMediaEl.getAttribute("src") || "").trim();
    if (currentSrc !== window.montageExportPreviewState.dataUrl) {
      targetMediaEl.src = window.montageExportPreviewState.dataUrl;
      targetMediaEl.load();
    }
    targetMediaEl.hidden = false;
    if (fallbackMediaEl && fallbackMediaEl !== targetMediaEl) {
      fallbackMediaEl.hidden = false;
    }
    if (targetMediaEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      revealTargetMedia();
    } else {
      targetMediaEl.addEventListener("loadeddata", revealTargetMedia, { once: true });
      targetMediaEl.addEventListener("canplay", revealTargetMedia, { once: true });
    }
  }
  if (!isVideoPreview) {
    if (targetMediaEl) {
      const currentSrc = String(targetMediaEl.getAttribute("src") || "").trim();
      if (currentSrc !== window.montageExportPreviewState.dataUrl) {
        targetMediaEl.src = window.montageExportPreviewState.dataUrl;
      }
      targetMediaEl.hidden = !hasReadyPreview;
      applyMontageFrontendPreviewMediaLayout(window.montageExportPreviewState.frontendPreview, targetMediaEl);
    }
    if (fallbackMediaEl && fallbackMediaEl !== targetMediaEl) {
      fallbackMediaEl.hidden = true;
      if (!window.montageExportPreviewState.loading) {
        fallbackMediaEl.removeAttribute("src");
      }
    }
  }
  if (window.els.montageExportPreviewPlaceholder) {
    window.els.montageExportPreviewPlaceholder.hidden = hasReadyPreview;
    window.els.montageExportPreviewPlaceholder.textContent = window.montageExportPreviewState.loading
      ? "Generando preview real del export…"
      : window.montageExportPreviewState.disabled
        ? "Preview desactivado temporalmente para priorizar la exportación."
        : window.montageExportPreviewState.error
          ? window.montageExportPreviewState.error
          : "El preview aparecerá aquí.";
  }
}

export function resetMontageExportPreviewState() {
  void destroyMontageExportPreviewJassub();
  if (window.montageExportPreviewState.debounceTimer) {
    window.clearTimeout(window.montageExportPreviewState.debounceTimer);
  }
  window.montageExportPreviewState = {
    loading: false,
    error: "",
    dataUrl: "",
    mediaType: "",
    mode: window.montageExportState.exportMode,
    sceneIndex: 0,
    disabled: false,
    frontendPreview: null,
    lastSignature: "",
    debounceTimer: null,
    requestSeq: window.montageExportPreviewState.requestSeq || 0,
    mediaLoadSeq: window.montageExportPreviewState.mediaLoadSeq || 0,
    lastJobPreviewRowId: "",
    lastJobPreviewSceneIndex: 0,
    lastJobPreviewAt: 0,
    lastReadyDataUrl: "",
    lastReadyMediaType: ""
  };
  setMontageExportPreviewState({ mode: window.montageExportState.exportMode, meta: "Así se vería tu video exportado." });
}

export async function closeMontageExportModal({ cancelActiveJob = false } = {}) {
  const activeJobId = String(window.montageExportJobState?.jobId || "").trim();
  const keepJobVisible = Boolean(
    activeJobId
    || window.montageExportJobState?.submissionInFlight === true
    || window.montageExportBusy
    || String(window.montageExportJobState?.lastStage || "").trim()
    || String(window.montageExportJobState?.lastHint || "").trim()
  );
  if (cancelActiveJob && window.montageExportBusy && activeJobId) {
    void requestMontageExportCancel(activeJobId).catch((error) => {
      console.warn("[podcaster][montage-export] cancel request failed", formatMontageExportCancelError(error));
    });
  }
  if (typeof window.exportPreviewController?.stop === "function") {
    window.exportPreviewController.stop();
  }
  setMontageExportOpen(false);
  if (!keepJobVisible) {
    resetMontageExportJobState();
    resetMontageExportPreviewState();
    setMontageExportPreviewPaused(false);
    window.montageExportBusy = false;
    window.setTimelinePreviewsSuspended(false);
    setMontageExportBusy(false);
  } else {
    setMontageExportBusy(window.montageExportBusy);
    updateMontageExportFloatingCardVisibility();
  }
  updateMontageExportFloatingCardVisibility();
}

async function requestMontageExportCancel(jobId = "") {
  const cleanJobId = String(jobId || "").trim();
  if (!cleanJobId) return false;
  await authFetchJson(buildMontageExportEndpoint("/api/podcaster/montage/export-cancel"), {
    method: "POST",
    body: { jobId: cleanJobId },
    keepalive: true
  });
  return true;
}

function formatMontageExportCancelError(error) {
  const status = Number(error?.status || error?.detail?.status || 0) || 0;
  const message = String(error?.message || error || "").trim();
  const detail = error?.detail && typeof error.detail === "object"
    ? JSON.stringify(error.detail)
    : String(error?.detail || "").trim();
  return [
    status ? `HTTP ${status}` : "",
    message,
    detail && detail !== message ? detail : ""
  ].filter(Boolean).join(" | ");
}

export async function cancelMontageExportFromModal() {
  const activeJobId = String(window.montageExportJobState?.jobId || "").trim();
  if (activeJobId) {
    setMontageExportStatus(
      "Cancelando exportación…",
      "Enviando la cancelación al backend para detener el render del MP4.",
      { tone: "warning" }
    );
    try {
      await requestMontageExportCancel(activeJobId);
    } catch (error) {
      const cancelError = formatMontageExportCancelError(error);
      setMontageExportStatus(
        "No se pudo cancelar la exportación en el backend.",
        cancelError,
        { tone: "error" }
      );
      setMontageExportBusy(false);
      throw error;
    }
  }
  await closeMontageExportModal({ cancelActiveJob: false });
}

export function setMontageExportStatus(text = "", hint = "", options = {}) {
  const safeText = String(text || "").trim() || "Listo. Presiona Exportar para generar tu video.";
  const safeHint = String(hint || "").trim();
  const tone = String(options?.tone || "").trim();
  const box = window.els.montageExportStatusBox
    || (window.els.montageExportStatus ? window.els.montageExportStatus.closest(".montage-export-status") : null);
  if (window.els.montageExportStatus) {
    window.els.montageExportStatus.textContent = safeText;
  }
  if (window.els.montageExportHint) {
    window.els.montageExportHint.textContent = safeHint;
  }
  if (box) {
    const normalized = ["neutral", "success", "warning", "error"].includes(tone) ? tone : "neutral";
    box.dataset.tone = normalized;
  }
  updateMontageExportFloatingCardVisibility();
}

function setConfirmMontageExportButtonState({
  disabled = false,
  loading = false,
  label = ""
} = {}) {
  const button = window.els.confirmMontageExportBtn;
  if (!button) return;
  const textEl = button.querySelector("span");
  const iconEl = button.querySelector("i");
  const nextLabel = String(label || "").trim() || (loading ? "Iniciando exportación…" : "Exportar");
  button.disabled = Boolean(disabled);
  button.classList.toggle("is-loading", Boolean(loading));
  button.setAttribute("aria-busy", loading ? "true" : "false");
  if (textEl) textEl.textContent = nextLabel;
  if (iconEl) {
    iconEl.className = loading
      ? "fas fa-spinner spinner-icon"
      : "fas fa-file-export";
    iconEl.setAttribute("aria-hidden", "true");
  }
}

export function setMontageExportBusy(isBusy = false) {
  montageExportBusy = Boolean(isBusy);
  window.montageExportBusy = montageExportBusy;
  setConfirmMontageExportButtonState({
    disabled: Boolean(isBusy),
    loading: Boolean(isBusy),
    label: Boolean(isBusy) ? "Exportación en curso…" : "Exportar"
  });
  if (window.els.continueMontageExportBtn) window.els.continueMontageExportBtn.disabled = Boolean(isBusy);
  if (window.els.generateAllDialogueVideosBtn) window.els.generateAllDialogueVideosBtn.disabled = Boolean(isBusy) || window.podcastVideoState.busy;
  if (window.els.regenerateAllDialogueVideosBtn) window.els.regenerateAllDialogueVideosBtn.disabled = Boolean(isBusy) || window.podcastVideoState.busy;
  if (window.els.generateDialogueVideoBtn) window.els.generateDialogueVideoBtn.disabled = Boolean(isBusy);
  if (window.els.montageExportModal) {
    window.els.montageExportModal.classList.toggle("is-busy", Boolean(isBusy));
    if (!isBusy) window.els.montageExportModal.classList.remove("is-progress");
  }
  updateMontageExportFloatingCardVisibility();
}

export function setMontageExportProgress(progress = null) {
  const bar = window.els.montageExportProgressBar || null;
  if (!bar || !window.els.montageExportModal) return;
  if (!Number.isFinite(Number(progress))) {
    bar.style.removeProperty("--montage-export-progress");
    window.els.montageExportModal.classList.remove("is-progress");
    return;
  }
  const clamped = Math.max(0, Math.min(1, Number(progress)));
  bar.style.setProperty("--montage-export-progress", `${Math.round(clamped * 1000) / 10}%`);
  window.els.montageExportModal.classList.add("is-progress");
  if (window.els.montageExportFloatingProgress) {
    window.els.montageExportFloatingProgress.style.setProperty("--montage-export-progress", `${Math.round(clamped * 1000) / 10}%`);
  }
  updateMontageExportFloatingCardVisibility();
}

export function describeMontageExportStage(stage = "", mode = window.montageExportState.exportMode) {
  const clean = String(stage || "").trim();
  const review = mode === "review";
  const map = {
    queued: "Export en cola…",
    validate_payload: review ? "Validando exportación de revisión…" : "Validando exportación…",
    download_assets: "Descargando recursos fuente…",
    render_scene_segments: "Renderizando escenas…",
    concat_timeline: "Uniendo timeline final…",
    encode_visual_pass: "Codificando capas visuales finales…",
    mix_timeline_audio: "Mezclando narración del timeline…",
    mix_background_music: "Mezclando música de fondo…",
    boot_renderer: "Iniciando renderer fiel al preview…",
    capture_timeline: "Capturando montaje final en navegador…",
    transcode_final: "Empaquetando video final…",
    apply_onscreen_text: "Aplicando texto en pantalla…",
    apply_review_layout: "Componiendo layout de revisión…",
    upload_result: "Subiendo archivo final…",
    cache_output: "Preparando descarga final…",
    ready: "Tu video está listo.",
    error: "No pudimos exportar tu video."
  };
  return map[clean] || (review ? "Creando tu video de revisión…" : "Creando tu video…");
}

export function describeMontageExportSceneSubstage(substage = "", sceneIndex = 0, totalScenes = 0) {
  const clean = String(substage || "").trim();
  const sceneLabel = sceneIndex > 0
    ? `escena ${sceneIndex}${totalScenes > 0 ? ` de ${totalScenes}` : ""}`
    : "escena actual";
  const map = {
    scene_download_video: `Descargando asset de ${sceneLabel}…`,
    scene_probe_audio: `Analizando audio de ${sceneLabel}…`,
    scene_probe_dimensions: `Analizando dimensiones de ${sceneLabel}…`,
    scene_ffmpeg_render: `Renderizando video de ${sceneLabel}…`,
    scene_complete: sceneIndex > 0 ? `Escena ${sceneIndex} lista.` : "Escena lista."
  };
  return map[clean] || "";
}

export async function pollMontageExportJob(jobId = "") {
  const cleanJobId = String(jobId || "").trim();
  if (!cleanJobId) return;
  logMontageExportDevtools("poll_start", {
    jobId: cleanJobId,
    currentStage: String(window.montageExportJobState.lastStage || "").trim() || undefined,
    currentSubstage: String(window.montageExportJobState.lastSceneSubstage || "").trim() || undefined,
    failureCount: Math.max(0, Number(window.montageExportJobState.pollFailureCount || 0) || 0),
    notFoundCount: Math.max(0, Number(window.montageExportJobState.jobNotFoundCount || 0) || 0)
  }, "debug");
  const maxPollMs = Math.max(0, Number(MONTAGE_EXPORT_POLL_MAX_MS || 0) || 0);
  const startedAtMs = Math.max(0, Number(window.montageExportJobState.startedAtMs || 0) || 0);
  if (maxPollMs > 0 && startedAtMs > 0 && (Date.now() - startedAtMs) > maxPollMs) {
    logMontageExportDevtools("poll_timeout_stop", { maxMs: maxPollMs }, "warn");
    clearMontageExportPolling();
    window.montageExportBusy = false;
    window.setTimelinePreviewsSuspended(false);
    setMontageExportBusy(false);
    setMontageExportProgress(null);
    setMontageExportStatus(
      "La exportación tardó demasiado.",
      "Detuvimos el seguimiento automático para evitar tráfico excesivo. Puedes usar \"Continuar exportación\" para retomar el seguimiento.",
      { tone: "warning" }
    );
    setMontageExportContinueButton({ visible: true });
    return;
  }
  try {
    if (window.montageExportJobState.preferFirestorePolling === true) {
      const pollCount = Math.max(0, Number(window.montageExportJobState.firestorePollCount || 0)) + 1;
      window.montageExportJobState.firestorePollCount = pollCount;
      if (pollCount % 5 === 0) {
        window.montageExportJobState.preferFirestorePolling = false;
      } else {
        const firestoreOnly = await loadMontageExportJobStatusFromFirestore(cleanJobId);
        if (firestoreOnly) {
          window.montageExportJobState.firestorePreferredMissCount = 0;
          logMontageExportDevtools("poll_firestore_preferred", {
            jobId: cleanJobId,
            status: String(firestoreOnly?.status || "").trim() || undefined,
            stage: String(firestoreOnly?.stage || "").trim() || undefined,
            substage: String(firestoreOnly?.sceneSubstage || "").trim() || undefined,
            progress: Number.isFinite(Number(firestoreOnly?.progress)) ? Number(firestoreOnly.progress) : undefined
          }, "debug");
          if (await applyMontageExportPolledStatus(firestoreOnly, cleanJobId)) return;
          window.montageExportJobState.pollTimer = window.setTimeout(() => {
            pollMontageExportJob(cleanJobId).catch(() => { });
          }, 2000);
          return;
        }
        window.montageExportJobState.firestorePreferredMissCount = Math.max(0, Number(window.montageExportJobState.firestorePreferredMissCount || 0) || 0) + 1;
        const missCount = window.montageExportJobState.firestorePreferredMissCount;
        logMontageExportDevtools("poll_firestore_preferred_miss", {
          jobId: cleanJobId,
          missCount
        }, "warn");
        setMontageExportStatus(
          describeMontageExportStage(String(window.montageExportJobState.lastStage || "").trim(), window.montageExportState.exportMode),
          missCount > 1
            ? `Seguimos consultando el export por Firestore. No llegó estado en el intento ${missCount}; reintentando…`
            : "Seguimos consultando el export por Firestore. No llegó estado en este intento; reintentando…",
          { tone: "warning" }
        );
        schedulePreferredFirestorePollRetry(cleanJobId, missCount);
        return;
      }
    }
    // IMPORTANTE: aquí usamos /api para respetar la configuración activa del runtime.
    // En Hosting esto hoy termina en un redirect 302 hacia Render, no en un reverse proxy real.
    // Si Render responde 502/503, el navegador puede terminar mostrando un Failed to fetch por CORS
    // aunque el job haya arrancado bien en el backend.
    const exportStatusUrl = buildMontageExportEndpoint(`/api/podcaster/montage/export-status?jobId=${encodeURIComponent(cleanJobId)}`);
    logMontageExportDevtools("poll_request", {
      jobId: cleanJobId,
      url: exportStatusUrl,
      auth: false
    }, "debug");
    const data = await authFetchJson(exportStatusUrl, {
      auth: false
    });
    logMontageExportDevtools("poll_response", {
      jobId: cleanJobId,
      status: String(data?.status || "").trim() || undefined,
      stage: String(data?.stage || "").trim() || undefined,
      substage: String(data?.sceneSubstage || "").trim() || undefined,
      progress: Number.isFinite(Number(data?.progress)) ? Number(data.progress) : undefined,
      degraded: data?.degraded === true
    }, "debug");
    if (await applyMontageExportPolledStatus(data, cleanJobId)) return;
  } catch (error) {
    if (String(window.montageExportJobState.jobId || "").trim() !== cleanJobId) return;
    const firestoreFallback = await loadMontageExportJobStatusFallback(cleanJobId, error);
    if (firestoreFallback) {
      if (isMontageExportStatusRedirectFailure(error)) {
        window.montageExportJobState.preferFirestorePolling = true;
        window.montageExportJobState.firestorePreferredMissCount = 0;
      }
      if (await applyMontageExportPolledStatus(firestoreFallback, cleanJobId)) return;
      window.montageExportJobState.pollTimer = window.setTimeout(() => {
        pollMontageExportJob(cleanJobId).catch(() => { });
      }, 2000);
      return;
    }
    const errorCode = String(error?.detail?.error || error?.error || error?.message || "").trim();
    const errorStatus = Number(error?.status || error?.detail?.status || 0) || 0;
    logMontageExportDevtools("poll_error", {
      jobId: cleanJobId,
      status: errorStatus || undefined,
      code: errorCode || undefined,
      message: String(error?.message || error?.error || "").trim() || undefined,
      detailStatus: Number(error?.detail?.status || 0) || undefined
    }, "warn");
    if (errorStatus === 404) {
      const jobNotFoundCount = Math.max(0, Number(window.montageExportJobState.jobNotFoundCount || 0) || 0) + 1;
      window.montageExportJobState.jobNotFoundCount = jobNotFoundCount;
      if (errorCode === "job_not_found" && jobNotFoundCount < MONTAGE_EXPORT_JOB_NOT_FOUND_MAX_RETRIES) {
        logMontageExportDevtools("poll_job_not_found_retry", {
          jobId: cleanJobId,
          jobNotFoundCount
        }, "warn");
        setMontageExportStatus(
          "Se perdió momentáneamente el estado del export.",
          `El backend todavía no confirma el job. Reintentando para verificarlo… intento ${jobNotFoundCount}.`,
          { tone: "warning" }
        );
        scheduleMontageExportJobNotFoundRetry(cleanJobId, jobNotFoundCount);
        return;
      }
      const recoverySource = String(window.montageExportJobState.recoverySource || "").trim();
      const busyHandoffRecoveryCount = Math.max(0, Number(window.montageExportJobState.busyHandoffRecoveryCount || 0) || 0);
      if (
        errorCode === "job_not_found"
        && recoverySource === "busy_handoff"
        && busyHandoffRecoveryCount < MONTAGE_EXPORT_BUSY_HANDOFF_RECOVERY_MAX_RETRIES
      ) {
        clearMontageExportPolling();
        persistMontageExportActiveJob("");
        window.montageExportJobState.jobId = "";
        window.montageExportJobState.jobNotFoundCount = 0;
        window.montageExportJobState.recoverySource = "";
        window.montageExportJobState.busyHandoffRecoveryCount = busyHandoffRecoveryCount + 1;
        window.montageExportBusy = false;
        window.setTimelinePreviewsSuspended(false);
        setMontageExportBusy(false);
        setMontageExportProgress(null);
        setMontageExportStatus(
          "El backend reportó un export activo que ya no existe.",
          "Reintentando iniciar una exportación nueva.",
          { tone: "warning" }
        );
        setMontageExportContinueButton({ visible: false });
        setMontageExportPreviewPaused(false);
        window.setTimeout(() => {
          runMontageExport().catch(() => { });
        }, 200);
        return;
      }
      clearMontageExportPolling();
      persistMontageExportActiveJob("");
      window.montageExportJobState.jobId = "";
      window.montageExportJobState.jobNotFoundCount = 0;
      window.montageExportJobState.recoverySource = "";
      window.montageExportBusy = false;
      window.setTimelinePreviewsSuspended(false);
      setMontageExportBusy(false);
      setMontageExportProgress(null);
      setMontageExportStatus(
        "Se perdió el estado del export en el backend.",
        "El job ya no existe en el backend. Inicia una nueva exportación.",
        { tone: "error" }
      );
      setMontageExportContinueButton({ visible: false });
      setMontageExportPreviewPaused(false);
      return;
    }
    const transientNetworkError = isTransientMontageExportTransportError(error);
    window.montageExportJobState.pollFailureCount = Math.max(0, Number(window.montageExportJobState.pollFailureCount || 0) || 0) + 1;
    const failureCount = window.montageExportJobState.pollFailureCount;
    const lastPollSuccessAtMs = Math.max(0, Number(window.montageExportJobState.lastPollSuccessAtMs || 0) || 0);
    const recentPollSuccess = lastPollSuccessAtMs > 0 && (Date.now() - lastPollSuccessAtMs) <= MONTAGE_EXPORT_RECENT_POLL_GRACE_MS;
    const canKeepLastProgressVisible = transientNetworkError
      && recentPollSuccess
      && failureCount <= MONTAGE_EXPORT_TRANSIENT_SILENT_RETRIES
      && String(window.montageExportJobState.lastStage || "").trim();
    const redirectFailure = isMontageExportStatusRedirectFailure(error);
    const transientHint = redirectFailure
      ? (failureCount > 1
        ? `El job sí arrancó, pero Hosting redirigió export-status a Render y la respuesta 502 quedó bloqueada por CORS. Reintentando… intento ${failureCount}.`
        : "El job sí arrancó, pero export-status fue redirigido a Render y la respuesta falló por CORS/502. Reintentando…")
      : transientNetworkError
        ? (failureCount > 1
          ? `Se perdió la conexión temporalmente. Reintentando el export… intento ${failureCount}.`
          : "Se perdió la conexión temporalmente. Reintentando el export…")
      : (failureCount > 1
        ? `Reconectando con el export… intento ${failureCount}.`
        : "Reconectando con el export…");
    logMontageExportDevtools("poll_failed", {
      failureCount,
      transient: transientNetworkError,
      status: errorStatus || undefined,
      message: String(error?.message || error?.error || "").trim() || undefined
    }, transientNetworkError ? "warn" : "error");
    logMontageExportDevtools("poll_retry_scheduled", {
      jobId: cleanJobId,
      failureCount,
      transient: transientNetworkError,
      silent: canKeepLastProgressVisible
    }, "debug");
    if (!transientNetworkError && failureCount >= 8) {
      logMontageExportDevtools("poll_failed_stop", { failureCount }, "error");
      clearMontageExportPolling();
      window.montageExportBusy = false;
      setMontageExportBusy(false);
      setMontageExportProgress(null);
      setMontageExportStatus(
        "No pudimos consultar el progreso del export.",
        "La conexión con el backend falló varias veces seguidas. Puedes usar \"Continuar exportación\" para reconectar con el job activo.",
        { tone: "error" }
      );
      window.setTimelinePreviewsSuspended(false);
      setMontageExportPreviewPaused(false);
      setMontageExportContinueButton({ visible: true });
      return;
    }
    if (canKeepLastProgressVisible) {
      scheduleMontageExportPollRetry(cleanJobId, failureCount, { transient: true });
      return;
    }
    setMontageExportStatus(
      describeMontageExportStage(String(window.montageExportJobState.lastStage || "").trim(), window.montageExportState.exportMode),
      transientHint,
      { tone: "warning" }
    );
    scheduleMontageExportPollRetry(cleanJobId, failureCount, { transient: transientNetworkError });
    return;
  }
  window.montageExportJobState.pollTimer = window.setTimeout(() => {
    pollMontageExportJob(cleanJobId).catch(() => { });
  }, 2000);
}

export async function continueMontageExportPolling() {
  const persistedJob = loadPersistedMontageExportActiveJob();
  const jobId = String(window.montageExportJobState.jobId || persistedJob?.jobId || "").trim();
  if (!jobId) {
    setMontageExportStatus(
      "No encontramos un export activo para continuar.",
      "Inicia una nueva exportación.",
      { tone: "warning" }
    );
    setMontageExportContinueButton({ visible: false });
    return;
  }
  logMontageExportDevtools("continue_polling_clicked", { jobId });
  clearMontageExportPolling();
  if (!String(window.montageExportJobState.jobId || "").trim()) {
    window.montageExportJobState.jobId = jobId;
  }
  window.montageExportBusy = true;
  setMontageExportBusy(true);
  setMontageExportContinueButton({ visible: false });
  window.montageExportJobState.pollFailureCount = 0;
  window.montageExportJobState.preferFirestorePolling = false;
  window.montageExportJobState.firestorePreferredMissCount = 0;
  window.montageExportJobState.firestorePollCount = 0;
  window.montageExportJobState.startedAtMs = Date.now();
  setMontageExportStatus(
    "Reanudando seguimiento del export…",
    "Consultando estado actual del backend.",
    { tone: "neutral" }
  );
  pollMontageExportJob(jobId).catch(() => { });
}

export function getMontagePreviewRowId() {
  return String(window.podcastVideoState.activeRowId || window.creativeVideoState.activeRowId || "").trim();
}

export function maybeRefreshMontageExportPreviewFromJob({
  rowId = "",
  sceneIndex = 0,
  totalScenes = 0,
  progressiveMedia = null
} = {}) {
  const cleanRowId = String(rowId || "").trim();
  const cleanSceneIndex = Math.max(0, Math.round(Number(sceneIndex || 0) || 0));
  if (!cleanRowId && cleanSceneIndex <= 0) return;
  if (!window.els.montageExportModal || window.els.montageExportModal.hidden) return;
  if (shouldSuspendMontagePreviewActivity() && !window.montageExportBusy) return;
  const now = Date.now();
  if (window.montageExportPreviewState.loading) return;
  const sameRow = cleanRowId && cleanRowId === String(window.montageExportPreviewState.lastJobPreviewRowId || "").trim();
  const sameScene = cleanSceneIndex > 0 && cleanSceneIndex === Math.max(0, Number(window.montageExportPreviewState.lastJobPreviewSceneIndex || 0) || 0);
  const lastRefreshAt = Math.max(0, Number(window.montageExportPreviewState.lastJobPreviewAt || 0) || 0);
  const elapsedMs = now - lastRefreshAt;
  const minDelayMs = (sameRow || sameScene) ? MONTAGE_EXPORT_PREVIEW_REFRESH_MIN_MS : 250;
  if (elapsedMs < minDelayMs) return;
  window.montageExportPreviewState.lastJobPreviewRowId = cleanRowId;
  window.montageExportPreviewState.lastJobPreviewSceneIndex = cleanSceneIndex;
  window.montageExportPreviewState.lastJobPreviewAt = now;
  const progressiveDataUrl = String(progressiveMedia?.dataUrl || "").trim();
  const progressiveMediaType = String(progressiveMedia?.mediaType || "").trim();
  refreshMontageExportPreviewNow({
    previewRowId: cleanRowId,
    previewSceneIndex: cleanSceneIndex,
    allowDuringExport: true,
    force: true,
    progressiveDataUrl,
    progressiveMediaType,
    preserveProgressiveFrame: true,
    progressiveMeta: progressiveDataUrl
      ? `Mostrando fragmento renderizado parcial de la escena ${cleanSceneIndex}.`
      : "Manteniendo el último frame renderizado en la escena anterior mientras avanza.",
    loadingMeta: totalScenes > 0 && cleanSceneIndex > 0
      ? `Actualizando preview con la escena ${cleanSceneIndex} de ${totalScenes}…`
      : "Actualizando preview de la escena en exportación…"
  }).catch(() => { });
}

async function resolveMontageExportFrontendPreview(payload = {}, previewRowId = "", previewSceneIndex = 0) {
  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  if (!entries.length) return null;
  const cleanRowId = String(previewRowId || "").trim();
  const cleanSceneIndex = Math.max(0, Math.round(Number(previewSceneIndex || 0) || 0));
  const selected = resolveMontageRenderEntryAtTime(payload, 0, {
    previewRowId: cleanRowId,
    previewSceneIndex: cleanSceneIndex
  });
  if (!selected || typeof selected !== "object") return null;
  const video = selected?.video && typeof selected.video === "object" ? selected.video : null;
  const directDataUrl = String(video?.dataUrl || video?.localDataUrl || "").trim();
  const localMediaCacheKey = String(video?.localMediaCacheKey || "").trim();
  const directDownloadUrl = String(video?.downloadUrl || "").trim();
  const rawUrl = String(video?.url || "").trim();
  const storagePath = String(video?.storagePath || "").trim();
  let src = directDataUrl;
  if (!src && localMediaCacheKey) {
    try {
      src = String(await getPodcasterLocalMediaDataUrl(localMediaCacheKey) || "").trim();
    } catch (_) {
      src = "";
    }
  }
  if (!src) src = directDownloadUrl || rawUrl;
  const shouldResolveDirectly = !src || src.startsWith("gs://");
  if (shouldResolveDirectly && typeof window.resolveFirebaseStorageUrl === "function") {
    try {
      const bucket = window.__CHARLY_CONFIG__?.firebase?.storageBucket || "charly-brown.firebasestorage.app";
      const gsUrl = src.startsWith("gs://")
        ? src
        : (storagePath.startsWith("gs://") ? storagePath : (storagePath ? `gs://${bucket}/${storagePath}` : ""));
      const resolved = gsUrl ? await window.resolveFirebaseStorageUrl(gsUrl) : "";
      if (resolved && /^https?:\/\//i.test(String(resolved)) && !String(resolved).includes("/api/assets/proxy-")) {
        src = String(resolved).trim();
      }
    } catch (_) {
      // fallback below
    }
  }
  if (!src) {
    src = String(window.resolveStorageVideoUrl(rawUrl, storagePath) || "").trim();
  }
  if (!src) return null;
  const mediaKind = String(video?.mediaKind || video?.type || "").trim().toLowerCase();
  const mimeType = String(video?.mimeType || "").trim().toLowerCase();
  const isImage = mediaKind === "image" || mimeType.startsWith("image/");
  return {
    src,
    mediaType: isImage ? (mimeType || "image/png") : (mimeType || "video/mp4"),
    mediaScale: window.normalizeTimelineClipMediaScale?.(selected?.mediaScale) || 1,
    mediaOffsetXPct: selected?.mediaOffsetXPct || 0,
    mediaOffsetYPct: selected?.mediaOffsetYPct || 0,
    mediaMotionPreset: selected?.mediaMotionPreset || "none",
    visualLayoutMode: String(selected?.visualLayoutMode || "default").trim() || "default",
    visualEffects: selected?.visualEffects || null,
    sceneIndex: Math.max(1, Number(selected?.sceneIndex || 1) || 1),
    timelineStartMs: Math.max(0, Number(selected?.timelineStartMs || selected?.startMs || 0) || 0),
    rowId: String(selected?.rowId || "").trim()
  };
}

export async function refreshMontageExportPreviewNow(options = {}) {
  const allowDuringExport = options?.allowDuringExport === true;
  const progressiveDataUrl = String(options?.progressiveDataUrl || "").trim();
  const progressiveMediaType = String(options?.progressiveMediaType || "").trim().toLowerCase();
  const preserveProgressiveFrame = options?.preserveProgressiveFrame === true;
  const progressiveMeta = String(options?.progressiveMeta || options?.loadingMeta || "").trim();
  const refreshRequestSeq = (window.montageExportPreviewState.requestSeq || 0) + 1;
  window.montageExportPreviewState.requestSeq = refreshRequestSeq;
  if (progressiveDataUrl) {
    const inferredMediaType = progressiveMediaType || inferMontageExportMediaTypeFromUrl(progressiveDataUrl) || "video/mp4";
    const canUseProgressiveSource = await probeMontageExportPreviewSource(progressiveDataUrl, inferredMediaType);
    if (window.montageExportPreviewState.requestSeq !== refreshRequestSeq) return;
    if (!canUseProgressiveSource) {
      cacheMontageExportPreviewSourceProbe(progressiveDataUrl, inferredMediaType, false);
      if (String(progressiveDataUrl).includes("/api/assets/proxy-media")) {
        window.markStaleProxyMediaUrl?.(progressiveDataUrl, "proxy-media-unready", { kind: "export-preview-progressive" });
      }
      const fallbackDataUrl = String(
        window.montageExportPreviewState.lastReadyDataUrl || window.montageExportPreviewState.dataUrl || ""
      ).trim();
      const fallbackMediaType = String(
        window.montageExportPreviewState.lastReadyMediaType || window.montageExportPreviewState.mediaType || inferredMediaType
      ).trim();
      if (fallbackDataUrl) {
        setMontageExportPreviewState({
          loading: false,
          error: "",
          dataUrl: fallbackDataUrl,
          mediaType: fallbackMediaType || inferredMediaType || "video/mp4",
          mode: window.montageExportState.exportMode,
          sceneIndex: Math.max(0, Number(options?.previewSceneIndex || 0) || 0),
          meta: progressiveMeta || "Manteniendo el último frame renderizado."
        });
        return;
      }
      setMontageExportPreviewState({
        loading: false,
        error: "",
        dataUrl: "",
        mediaType: "",
        mode: window.montageExportState.exportMode,
        sceneIndex: Math.max(0, Number(options?.previewSceneIndex || 0) || 0),
        meta: progressiveMeta || "Esperando render de la escena para mostrar el preview."
      });
      return;
    }
    setMontageExportPreviewState({
      loading: false,
      error: "",
      dataUrl: progressiveDataUrl,
      mediaType: inferredMediaType,
      mode: window.montageExportState.exportMode,
      sceneIndex: Math.max(0, Number(options?.previewSceneIndex || 0) || 0),
      meta: progressiveMeta || "Mostrando avance de render de escena."
    });
    window.montageExportPreviewState.lastReadyDataUrl = progressiveDataUrl;
    window.montageExportPreviewState.lastReadyMediaType = inferredMediaType || "video/mp4";
    await destroyMontageExportPreviewJassub();
    return;
  }
  if (!window.els.montageExportModal || window.els.montageExportModal.hidden) return;
  if (shouldSuspendMontagePreviewActivity() && !allowDuringExport) {
    if (isMontageExportPreviewJassubActive()) {
      if (montageExportJassubState.loopHandle) {
        window.cancelAnimationFrame(montageExportJassubState.loopHandle);
        montageExportJassubState.loopHandle = 0;
      }
      void renderMontageExportPreviewJassub(true);
    }
    const currentDataUrl = String(window.montageExportPreviewState.dataUrl || "").trim();
    const currentMediaType = String(window.montageExportPreviewState.mediaType || "").trim();
    setMontageExportPreviewState({
      loading: false,
      error: "",
      dataUrl: currentDataUrl,
      mediaType: currentMediaType,
      mode: window.montageExportState.exportMode,
      sceneIndex: Math.max(0, Number(window.montageExportPreviewState.sceneIndex || 0) || 0),
      disabled: true,
      meta: window.montageExportBusy
        ? "Preview pausado mientras se exporta el video. Se conserva el último frame visible."
        : "Preview desactivado temporalmente para priorizar la exportación."
    });
    return;
  }
  const prepared = await buildMontageExportPayloadForSubmission(window.getActiveSession());
  if (!prepared.ok) {
    await destroyMontageExportPreviewJassub();
    const currentDataUrl = String(window.montageExportPreviewState.dataUrl || "").trim();
    const currentMediaType = String(window.montageExportPreviewState.mediaType || "").trim();
    if (preserveProgressiveFrame && allowDuringExport && currentDataUrl) {
      setMontageExportPreviewState({
        loading: false,
        error: "",
        dataUrl: currentDataUrl,
        mediaType: currentMediaType,
        mode: window.montageExportState.exportMode,
        sceneIndex: Math.max(0, Number(options?.previewSceneIndex || 0) || 0),
        meta: progressiveMeta || "Mostrando el último frame disponible."
      });
      return;
    }
    setMontageExportPreviewState({
      error: prepared.error || "No hay suficiente material para generar preview.",
      mode: window.montageExportState.exportMode,
      dataUrl: "",
      mediaType: "",
      sceneIndex: 0,
      meta: "Ajusta el timeline para habilitar el preview."
    });
    return;
  }
  const previewRowId = String(options?.previewRowId || getMontagePreviewRowId()).trim();
  const previewSceneIndex = Math.max(0, Math.round(Number(options?.previewSceneIndex || 0) || 0));
  const payload = {
    ...prepared.payload,
    previewRowId,
    previewSceneIndex
  };
  const frontendPreview = await resolveMontageExportFrontendPreview(payload, previewRowId, previewSceneIndex);
  if (frontendPreview?.src) {
    setMontageExportPreviewState({
      loading: false,
      error: "",
      dataUrl: frontendPreview.src,
      mediaType: frontendPreview.mediaType || "video/mp4",
      mode: payload.exportMode,
      sceneIndex: frontendPreview.sceneIndex || 0,
      frontendPreview,
      meta: frontendPreview.sceneIndex
        ? `Escena ${frontendPreview.sceneIndex} de referencia (preview frontend${payload.reelModeEnabled === true ? " · Reel 9:16" : ""}).`
        : `Preview frontend de la exportación${payload.reelModeEnabled === true ? " · Reel 9:16" : ""}.`
    });
    const previewContainer = document.getElementById("montageExportPreviewContainer");
    window.applySceneMediaScaleToStage?.({
      rowId: frontendPreview.rowId,
      mediaScale: frontendPreview.mediaScale,
      mediaOffsetXPct: frontendPreview.mediaOffsetXPct,
      mediaOffsetYPct: frontendPreview.mediaOffsetYPct,
      mediaMotionPreset: frontendPreview.mediaMotionPreset,
      visualLayoutMode: frontendPreview.visualLayoutMode,
      container: previewContainer
    });
    window.renderPodcasterOverlayCardsForPreview?.({
      session: window.getActiveSession?.(),
      containerEl: previewContainer,
      currentMs: frontendPreview.timelineStartMs || 0,
      interactive: false
    });
    if (String(frontendPreview.mediaType || "").startsWith("image/") && window.els.montageExportPreviewImage) {
      const effects = frontendPreview.visualEffects;
      let className = "podcast-active-speaker-image is-visible";
      if (effects && Array.isArray(effects.effects) && effects.effects.length) {
        const speedClass = `speed-${effects.speed || 5}`;
        const effectClasses = effects.effects.map((effect) => `ken-burns-${effect}`).join(" ");
        className += ` ${effectClasses} ${speedClass}`;
      }
      window.els.montageExportPreviewImage.className = className;
    }
    await syncMontageExportPreviewJassub(payload);
    return;
  }
  const currentDataUrl = String(window.montageExportPreviewState.dataUrl || "").trim();
  const currentMediaType = String(window.montageExportPreviewState.mediaType || "").trim();
  if (preserveProgressiveFrame && allowDuringExport && currentDataUrl) {
    setMontageExportPreviewState({
      loading: false,
      error: "",
      dataUrl: currentDataUrl,
      mediaType: currentMediaType,
      mode: payload.exportMode,
      sceneIndex: Math.max(0, Number(payload.previewSceneIndex || 0) || 0),
      meta: progressiveMeta || String(options?.loadingMeta || "").trim() || "Manteniendo el último frame renderizado."
    });
    await destroyMontageExportPreviewJassub();
    return;
  }
  const signature = JSON.stringify({
    exportMode: payload.exportMode,
    format: payload.format,
    resolution: payload.resolution,
    qualityPreset: payload.qualityPreset,
    previewRowId: payload.previewRowId,
    previewSceneIndex: payload.previewSceneIndex,
    entries: (payload.entries || []).map((entry) => ({
      rowId: entry?.rowId,
      trimInMs: entry?.trimInMs,
      durationMs: entry?.durationMs,
      voiceOverText: entry?.voiceOverText,
      sceneDescription: entry?.sceneDescription,
      onScreenText: entry?.onScreenText,
      visualNotes: entry?.visualNotes,
      videoStoragePath: entry?.video?.storagePath,
      videoUrl: entry?.video?.url,
      mediaScale: entry?.mediaScale,
      mediaOffsetXPct: entry?.mediaOffsetXPct,
      mediaOffsetYPct: entry?.mediaOffsetYPct,
      mediaMotionPreset: entry?.mediaMotionPreset,
      visualLayoutMode: entry?.visualLayoutMode,
      visualEffects: entry?.visualEffects
    }))
  });
  if (signature === window.montageExportPreviewState.lastSignature && window.montageExportPreviewState.dataUrl && options?.force !== true) return;
  window.montageExportPreviewState.lastSignature = signature;
  const requestSeq = (window.montageExportPreviewState.requestSeq || 0) + 1;
  window.montageExportPreviewState.requestSeq = requestSeq;
  setMontageExportPreviewState({
    loading: true,
    mode: payload.exportMode,
    dataUrl: window.montageExportPreviewState.dataUrl,
    mediaType: window.montageExportPreviewState.mediaType,
    sceneIndex: 0,
    meta: String(options?.loadingMeta || "").trim()
  });
  if (window.montageExportPreviewState.requestSeq !== requestSeq) return;
  setMontageExportPreviewState({
    loading: false,
    error: "No hay video fuente disponible para mostrar preview frontend.",
    dataUrl: "",
    mediaType: "",
    mode: payload.exportMode,
    sceneIndex: 0,
    meta: "Puedes exportar aunque el preview no esté disponible."
  });
  await destroyMontageExportPreviewJassub();
}

export function scheduleMontageExportPreviewRefresh(delayMs = 280) {
  if (shouldSuspendMontagePreviewActivity()) {
    if (!window.els.montageExportModal || window.els.montageExportModal.hidden) return;
    const currentDataUrl = String(window.montageExportPreviewState.dataUrl || "").trim();
    const currentMediaType = String(window.montageExportPreviewState.mediaType || "").trim();
    setMontageExportPreviewState({
      loading: false,
      error: "",
      dataUrl: currentDataUrl,
      mediaType: currentMediaType,
      mode: window.montageExportState.exportMode,
      sceneIndex: Math.max(0, Number(window.montageExportPreviewState.sceneIndex || 0) || 0),
      disabled: true,
      meta: window.montageExportBusy
        ? "Preview pausado mientras se exporta el video. Se conserva el último frame visible."
        : "Preview desactivado temporalmente para priorizar la exportación."
    });
    return;
  }
  if (window.montageExportPreviewState.debounceTimer) {
    window.clearTimeout(window.montageExportPreviewState.debounceTimer);
  }
  window.montageExportPreviewState.debounceTimer = window.setTimeout(() => {
    refreshMontageExportPreviewNow().catch(() => { });
  }, Math.max(0, Number(delayMs || 0) || 0));
}

export function syncMontageExportUi() {
  const state = setMontageExportState(window.montageExportState || montageExportState);
  if (isLegacyAutoMontageFilename(state.filename)) {
    state.filename = "";
  }
  if (window.els.montageExportMode) window.els.montageExportMode.value = state.exportMode;
  if (window.els.montageExportRenderMode) window.els.montageExportRenderMode.value = state.renderMode;
  if (window.els.montageExportFormat) window.els.montageExportFormat.value = state.format;
  if (window.els.montageExportResolution) window.els.montageExportResolution.value = state.resolution;
  if (window.els.montageExportBitrateMode) window.els.montageExportBitrateMode.value = state.bitrateMode;
  if (window.els.montageExportMaxBitrate) window.els.montageExportMaxBitrate.value = state.maxBitrate;
  if (window.els.montageExportMinBitrate) window.els.montageExportMinBitrate.value = state.minBitrate;
  if (window.els.montageExportCustomBitrateBox) {
    window.els.montageExportCustomBitrateBox.hidden = state.bitrateMode !== "custom";
  }
  if (window.els.montageExportFilename) window.els.montageExportFilename.value = state.filename || defaultMontageExportFilename(window.getActiveSession());
  if (window.els.montageExportIncludeReviewExcel) {
    window.els.montageExportIncludeReviewExcel.checked = state.includeReviewExcel !== false;
  }
  if (window.els.montageExportIncludeLogo) {
    window.els.montageExportIncludeLogo.checked = state.includeLogo !== false;
  }
  if (window.els.montageExportPartyKaraoke) {
    const session = window.getActiveSession?.() || null;
    const cfg = window.getPodcastVideoConfig?.(session) || {};
    const settings = window.normalizeOnScreenTextTrackSettings?.(cfg.onScreenTextTrack || {}) || { enabled: true, showTrack: true };
    const clipMap = window.ensureOnScreenTextClipsByRowId?.(session, { persist: false }) || {};
    const clips = Object.values(clipMap);
    const allHidden = clips.length > 0 && clips.every((clip) => clip?.hidden === true);
    const trackVisible = settings.enabled !== false && settings.showTrack !== false;
    const isTextEnabled = trackVisible && !allHidden;

    const shouldBeChecked = isTextEnabled && state.partyKaraoke !== false;
    window.els.montageExportPartyKaraoke.checked = shouldBeChecked;
    window.montageExportState.partyKaraoke = shouldBeChecked;
  }
  if (window.els.montageExportReviewExcelField) {
    window.els.montageExportReviewExcelField.hidden = state.exportMode !== "review";
  }
  if (window.els.montageExportOnlyAudio) {
    window.els.montageExportOnlyAudio.checked = state.onlyAudio === true;
  }

  // Si es solo audio, ocultamos campos irrelevantes de video
  const onlyAudio = state.onlyAudio === true;
  if (window.els.montageExportFormat) window.els.montageExportFormat.closest(".row-field").hidden = onlyAudio;
  if (window.els.montageExportResolution) window.els.montageExportResolution.closest(".row-field").hidden = onlyAudio;
  if (window.els.montageExportBitrateMode) window.els.montageExportBitrateMode.closest(".row-field").hidden = onlyAudio;
  if (window.els.montageExportCustomBitrateBox) window.els.montageExportCustomBitrateBox.hidden = onlyAudio || state.bitrateMode !== "custom";
  if (window.els.montageExportIncludeLogo) window.els.montageExportIncludeLogo.closest(".row-field").hidden = onlyAudio;
  if (window.els.montageExportPartyKaraoke) window.els.montageExportPartyKaraoke.closest(".row-field").hidden = onlyAudio;

  const qualityField = window.els.montageExportModal?.querySelector(".montage-export-quality");
  if (qualityField) qualityField.hidden = onlyAudio;

  if (window.els.montageExportPreviewBox) {
    window.els.montageExportPreviewBox.hidden = onlyAudio;
  }
  if (onlyAudio) {
    void destroyMontageExportPreviewJassub();
  }

  if (!window.montageExportBusy) {
    if (onlyAudio) {
      setMontageExportStatus("Listo para exportar audio.", "Se descargará un archivo MP3 con todo el montaje.", { tone: "neutral" });
    } else {
      setMontageExportStatus(
        "Listo. Presiona Exportar para generar tu video.",
        state.exportMode === "review"
          ? "Revisión crea un split-screen con video y ficha editorial por escena."
          : "Usa el timeline tal como está (escenas + audio).",
        { tone: "neutral" }
      );
    }
  }
  if (!window.montageExportBusy && !window.montageExportJobState.jobId) {
    hydrateMontageExportDownloadButtonFromSession();
  }
  if (window.els.montageExportModal) {
    const btns = Array.from(window.els.montageExportModal.querySelectorAll("[data-quality]"));
    btns.forEach((btn) => {
      const key = String(btn?.dataset?.quality || "").trim();
      btn.classList.toggle("is-active", key === state.qualityPreset);
    });
  }
  persistMontageExportSettings();
}

export function openMontageExportModal() {
  if (typeof window.playbackController?.stop === "function") window.playbackController.stop();
  if (typeof window.exportPreviewController?.stop === "function") window.exportPreviewController.stop();

  const state = setMontageExportState(window.montageExportState || montageExportState);
  if (isLegacyAutoMontageFilename(state.filename)) state.filename = "";
  if (!state.filename) state.filename = defaultMontageExportFilename(window.getActiveSession());
  setMontageExportOpen(true);
  if (window.els.montageExportFloatingCard) {
    window.els.montageExportFloatingCard.hidden = true;
  }
  const restoringActiveJob = Boolean(String(window.montageExportJobState?.jobId || "").trim()) || window.els.montageExportModal?.dataset?.restoreFromCard === "true";
  if (!restoringActiveJob) {
    resetMontageExportJobState();
    resetMontageExportPreviewState();
    setMontageExportPreviewPaused(false);
    setMontageExportBusy(false);
    setMontageExportProgress(null);
    syncMontageExportUi();
    setConfirmMontageExportButtonState({
      disabled: false,
      loading: false,
      label: "Exportar"
    });
    bindMontageExportPreviewJassub();
  } else {
    delete window.els.montageExportModal.dataset.restoreFromCard;
    setMontageExportPreviewPaused(false);
    window.setTimelinePreviewsSuspended(false);
    bindMontageExportPreviewJassub();
    syncMontageExportUi();
    updateMontageExportFloatingCardVisibility();
    setMontageExportContinueButton({ visible: false });
    setMontageExportDownloadButton({
      visible: Boolean(window.montageExportJobState.readyDownloadUrl),
      url: window.montageExportJobState.readyDownloadUrl,
      filename: window.montageExportJobState.readyDownloadFilename
    });
  }
  if (!restoringActiveJob) {
    hydrateMontageExportDownloadButtonFromSession();
  }

  const session = window.getActiveSession();
  if (session && typeof window.exportPreviewController?.init === "function") {
    window.exportPreviewController.sync(session);
    window.exportPreviewController.seek(0);
  }
  const persistedJob = loadPersistedMontageExportActiveJob();
  if (persistedJob?.jobId) {
    window.montageExportJobState.jobId = persistedJob.jobId;
    window.montageExportJobState.startedAtMs = persistedJob.startedAtMs || Date.now();
    setMontageExportContinueButton({ visible: false });
    setMontageExportStatus(
      "Retomando exportación activa…",
      "Encontramos un job en curso y estamos consultando su estado.",
      { tone: "warning" }
    );
    continueMontageExportPolling().catch(() => { });
    return;
  }
  setMontageExportStatus(
    "Listo. Presiona Exportar para generar tu video.",
    state.exportMode === "review"
      ? "Revisión crea un split-screen con video y ficha editorial por escena."
      : "Usa el timeline tal como está (escenas + audio).",
    { tone: "neutral" }
  );
  scheduleMontageExportPreviewRefresh(60);
}

export async function handleMontageExportConfirmClick(event = null) {
  if (event && typeof event.preventDefault === "function") event.preventDefault();
  if (event && typeof event.stopPropagation === "function") event.stopPropagation();
  if (window.montageExportBusy || montageExportSubmitLocked) {
    setMontageExportStatus(
      "La exportación ya está en curso.",
      "Espera a que termine el job actual o usa \"Continuar exportación\" si quedó uno pendiente.",
      { tone: "warning" }
    );
    return;
  }
  setConfirmMontageExportButtonState({
    disabled: true,
    loading: true,
    label: "Preparando exportación…"
  });
  try {
    await runMontageExport();
  } catch (error) {
    console.error("[podcaster][montage-export] confirm click failed", error);
    setMontageExportStatus(
      "No pudimos iniciar la exportación.",
      String(error?.message || error || "Revisa el timeline e inténtalo de nuevo.").trim(),
      { tone: "error" }
    );
    if (!window.montageExportBusy && !montageExportSubmitLocked) {
      setConfirmMontageExportButtonState({
        disabled: false,
        loading: false,
        label: "Exportar"
      });
    }
  }
}

export function validateMontageExportLinearTimeline(runtimeEntries = []) {
  const entries = Array.isArray(runtimeEntries) ? runtimeEntries.slice() : [];
  entries.sort((a, b) => Number(a?.startMs || 0) - Number(b?.startMs || 0));
  let lastEndMs = 0;
  for (const entry of entries) {
    const startMs = Math.max(0, Number(entry?.startMs || 0) || 0);
    const endMs = Math.max(startMs, Number(entry?.endMs || 0) || startMs);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      return { ok: false, error: "Hay clips inválidos en el timeline para exportar." };
    }
    lastEndMs = Math.max(lastEndMs, endMs);
  }
  return { ok: true, error: "" };
}

export function formatMontageSkippedEntries(skippedEntries = [], maxItems = 3) {
  const list = Array.isArray(skippedEntries) ? skippedEntries.filter(Boolean) : [];
  if (!list.length) return "";
  const reasonLabels = {
    missing_video_source: "sin video",
    missing_audio_source: "sin audio",
    storage_not_found: "archivo no disponible"
  };
  const preview = list.slice(0, Math.max(1, maxItems)).map((item, index) => {
    const sceneIndex = Math.max(1, Number(item?.sceneIndex || index + 1) || index + 1);
    const speaker = String(item?.speaker || "").trim();
    const reasonKey = String(item?.reason || "").trim();
    const reason = reasonKey ? (reasonLabels[reasonKey] || reasonKey) : "";
    const bits = [`Escena ${sceneIndex}`];
    if (speaker) bits.push(speaker);
    if (reason) bits.push(reason);
    return bits.join(" · ");
  });
  const suffix = list.length > preview.length ? ` y ${list.length - preview.length} más` : "";
  return preview.join("; ") + suffix;
}

const MONTAGE_EXPORT_INLINE_MEDIA_MAX_BYTES = 2_500_000;
const MONTAGE_EXPORT_INLINE_AUDIO_MAX_BYTES = 12_000_000;
const MONTAGE_EXPORT_INLINE_MEDIA_MAX_TOTAL_BYTES = 18_000_000;

function getMontageInlineMediaMaxBytes(kind = "video") {
  return String(kind || "").trim().toLowerCase() === "audio"
    ? MONTAGE_EXPORT_INLINE_AUDIO_MAX_BYTES
    : MONTAGE_EXPORT_INLINE_MEDIA_MAX_BYTES;
}

function estimateMontageDataUrlBytes(dataUrl = "") {
  const cleanDataUrl = String(dataUrl || "").trim();
  if (!cleanDataUrl.startsWith("data:")) return 0;
  const commaIndex = cleanDataUrl.indexOf(",");
  if (commaIndex < 0) return 0;
  const meta = cleanDataUrl.slice(0, commaIndex);
  const payload = cleanDataUrl.slice(commaIndex + 1).replace(/\s+/g, "");
  if (!payload) return 0;
  if (/;base64/i.test(meta)) {
    const padding = payload.endsWith("==") ? 2 : (payload.endsWith("=") ? 1 : 0);
    return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
  }
  return payload.length;
}

function buildMontageMediaCacheCandidates(asset = {}) {
  const storagePath = String(asset?.storagePath || "").trim();
  const url = String(asset?.downloadUrl || asset?.url || "").trim();
  const candidates = [
    url,
    storagePath,
    storagePath ? `/${storagePath.replace(/^\/+/, "")}` : "",
    storagePath ? `__podcaster_media_cache__/${encodeURIComponent(storagePath)}` : "",
    storagePath ? `${window.location.origin}/__podcaster_media_cache__/${encodeURIComponent(storagePath)}` : ""
  ];
  return Array.from(new Set(candidates.map((item) => String(item || "").trim()).filter(Boolean)));
}

function buildMontageSceneMediaCacheKey(asset = {}, kind = "video") {
  const activeSession = window.getActiveSession?.() || null;
  const sessionId = String(asset?.sessionId || activeSession?.id || "").trim() || "session";
  const rowId = String(asset?.rowId || "").trim() || "scene";
  const sceneIndex = Math.max(0, Math.round(Number(asset?.sceneIndex || 0) || 0));
  const storagePath = String(asset?.storagePath || "").trim();
  const downloadUrl = String(asset?.downloadUrl || asset?.url || "").trim();
  const sourceId = storagePath || downloadUrl || String(asset?.id || "").trim() || `${sceneIndex || Date.now()}`;
  return buildPodcasterLocalMediaKey(`podcaster:${sessionId}:montage:${String(kind || "video").trim()}:${rowId}`, sourceId);
}

function buildMontageStorageGsUrl(storagePath = "") {
  const cleanStoragePath = String(storagePath || "").trim().replace(/^\/+/, "");
  if (!cleanStoragePath) return "";
  if (/^gs:\/\//i.test(cleanStoragePath)) return cleanStoragePath;
  const bucket = String(window.__CHARLY_CONFIG__?.firebase?.storageBucket || "charly-brown.firebasestorage.app").trim();
  if (!bucket) return "";
  return `gs://${bucket}/${cleanStoragePath}`;
}

async function readMontageCachedMediaDataUrl(cacheKey = "") {
  const cleanKey = String(cacheKey || "").trim();
  if (!cleanKey) return "";
  if (montageExportHydratedMediaCache.has(cleanKey)) {
    return String(montageExportHydratedMediaCache.get(cleanKey) || "").trim();
  }
  if (montageExportHydratingMediaPromises.has(cleanKey)) {
    return montageExportHydratingMediaPromises.get(cleanKey);
  }
  const promise = getPodcasterLocalMediaDataUrl(cleanKey)
    .then((dataUrl) => {
      const cleanDataUrl = String(dataUrl || "").trim();
      if (cleanDataUrl.startsWith("data:")) {
        montageExportHydratedMediaCache.set(cleanKey, cleanDataUrl);
      }
      return cleanDataUrl;
    })
    .catch(() => "");
  montageExportHydratingMediaPromises.set(cleanKey, promise);
  try {
    return await promise;
  } finally {
    montageExportHydratingMediaPromises.delete(cleanKey);
  }
}

async function fetchMontageMediaBlob(sourceUrl = "") {
  const cleanUrl = String(sourceUrl || "").trim();
  if (!cleanUrl) return null;
  const tryFetch = async (url) => {
    if (!url) return null;
    const response = await fetch(url, { credentials: "same-origin" });
    if (!response.ok) {
      const error = new Error(`No se pudo descargar el asset (${response.status}).`);
      error.status = response.status;
      error.url = url;
      throw error;
    }
    return response.blob();
  };
  try {
    return await tryFetch(cleanUrl);
  } catch (error) {
    const status = Number(error?.status || 0) || 0;
    const looksLikeProxy = /\/api\/assets\/proxy-(?:media|image)\?/i.test(cleanUrl);
    if (!looksLikeProxy || !(status === 404 || status === 403 || status === 0)) {
      throw error;
    }
    try {
      const parsed = new URL(cleanUrl, window.location.origin);
      const originalUrl = parsed.searchParams.get("url") ? decodeURIComponent(parsed.searchParams.get("url")) : "";
      const cleanedOriginalUrl = String(originalUrl || "").trim();
      if (!cleanedOriginalUrl) throw error;
      return await tryFetch(cleanedOriginalUrl);
    } catch (fallbackError) {
      throw fallbackError;
    }
  }
}

async function resolveMontageSceneMediaSourceUrl(asset = {}, kind = "video") {
  const directDataUrl = String(asset?.dataUrl || asset?.localDataUrl || "").trim();
  if (directDataUrl.startsWith("data:")) return directDataUrl;

  const directDownloadUrl = String(asset?.downloadUrl || asset?.url || "").trim();
  if (directDownloadUrl && !directDownloadUrl.startsWith("gs://")) {
    return normalizeMontageSubmissionMediaUrl(directDownloadUrl);
  }

  const storagePath = String(asset?.storagePath || "").trim();
  const storageGsUrl = directDownloadUrl.startsWith("gs://")
    ? directDownloadUrl
    : (storagePath.startsWith("gs://") ? storagePath : buildMontageStorageGsUrl(storagePath));
  if (storageGsUrl && typeof window.resolveFirebaseStorageUrl === "function") {
    try {
      const resolved = String(await window.resolveFirebaseStorageUrl(storageGsUrl) || "").trim();
      if (resolved) return resolved;
    } catch (_) {
      // fallback below
    }
  }

  const resolveCandidate = (value = "") => {
    const clean = String(value || "").trim();
    return clean && !clean.startsWith("gs://") ? clean : "";
  };
  const preferredResolver = kind === "audio"
    ? window.resolveStorageAudioUrl?.(directDownloadUrl, storagePath)
    : window.resolveStorageVideoUrl?.(directDownloadUrl, storagePath);
  const fallbackResolver = kind === "audio"
    ? window.resolveStorageVideoUrl?.(directDownloadUrl, storagePath)
    : window.resolveStorageAudioUrl?.(directDownloadUrl, storagePath);
  const resolvedProxyUrl = resolveCandidate(preferredResolver) || resolveCandidate(fallbackResolver);
  if (resolvedProxyUrl) return normalizeMontageSubmissionMediaUrl(resolvedProxyUrl);

  if (storageGsUrl) return storageGsUrl;
  return directDownloadUrl;
}

async function hydrateMontageSceneMediaAsset(asset = null, kind = "video") {
  if (!asset || typeof asset !== "object") return asset;
  const directDataUrl = String(asset?.dataUrl || asset?.localDataUrl || "").trim();
  const cacheKey = String(asset?.localMediaCacheKey || buildMontageSceneMediaCacheKey(asset, kind) || "").trim();
  const mimeType = String(asset?.mimeType || (kind === "audio" ? "audio/mpeg" : "video/mp4")).trim() || (kind === "audio" ? "audio/mpeg" : "video/mp4");
  const directDataUrlBytes = estimateMontageDataUrlBytes(directDataUrl);

  if (directDataUrl.startsWith("data:")) {
    if (cacheKey && !montageExportHydratedMediaCache.has(cacheKey)) {
      montageExportHydratedMediaCache.set(cacheKey, directDataUrl);
      void putPodcasterLocalMediaDataUrl(cacheKey, directDataUrl, {
        mimeType,
        sourceUrl: String(asset?.downloadUrl || asset?.url || "").trim(),
        storagePath: String(asset?.storagePath || "").trim(),
        kind
      }).catch(() => { });
    }
    if (directDataUrlBytes > 0 && directDataUrlBytes <= getMontageInlineMediaMaxBytes(kind)) {
      return {
        ...asset,
        dataUrl: directDataUrl,
        localDataUrl: directDataUrl,
        localMediaCacheKey: cacheKey || String(asset?.localMediaCacheKey || "").trim()
      };
    }
    return {
      ...asset,
      localMediaCacheKey: cacheKey || String(asset?.localMediaCacheKey || "").trim(),
      url: String(asset?.url || asset?.downloadUrl || "").trim(),
      downloadUrl: String(asset?.downloadUrl || asset?.url || "").trim()
    };
  }

  if (cacheKey) {
    const cachedDataUrl = await readMontageCachedMediaDataUrl(cacheKey);
    const cachedDataUrlBytes = estimateMontageDataUrlBytes(cachedDataUrl);
    if (cachedDataUrl.startsWith("data:") && cachedDataUrlBytes > 0 && cachedDataUrlBytes <= getMontageInlineMediaMaxBytes(kind)) {
      return {
        ...asset,
        dataUrl: cachedDataUrl,
        localDataUrl: cachedDataUrl,
        localMediaCacheKey: cacheKey,
        url: String(asset?.url || asset?.downloadUrl || "").trim(),
        downloadUrl: String(asset?.downloadUrl || asset?.url || "").trim()
      };
    }
  }

  const sourceUrl = await resolveMontageSceneMediaSourceUrl(asset, kind);
  const cachedPlaybackBlobUrl = sourceUrl && typeof window.playbackController?.getBlobUrlSync === "function"
    ? String(window.playbackController.getBlobUrlSync(sourceUrl) || "").trim()
    : "";
  const effectiveFetchUrl = cachedPlaybackBlobUrl || sourceUrl;

  if (!sourceUrl || sourceUrl.startsWith("gs://")) {
    return {
      ...asset,
      localMediaCacheKey: cacheKey || String(asset?.localMediaCacheKey || "").trim(),
      url: sourceUrl || String(asset?.url || asset?.downloadUrl || "").trim(),
      downloadUrl: sourceUrl || String(asset?.downloadUrl || asset?.url || "").trim()
    };
  }

  try {
    const blob = await fetchMontageMediaBlob(effectiveFetchUrl);
    if (!(blob instanceof Blob)) {
      return {
        ...asset,
        localMediaCacheKey: cacheKey || String(asset?.localMediaCacheKey || "").trim(),
        url: sourceUrl,
        downloadUrl: sourceUrl
      };
    }
    if (cacheKey) {
      await putPodcasterLocalMediaBlob(cacheKey, blob, {
        mimeType: String(blob.type || mimeType || "").trim() || mimeType,
        sourceUrl: effectiveFetchUrl,
        storagePath: String(asset?.storagePath || "").trim(),
        kind
      });
    }
    const sizeBytes = Math.max(0, Number(blob?.size || 0) || 0);
    if (sizeBytes > 0 && sizeBytes <= getMontageInlineMediaMaxBytes(kind)) {
      const dataUrl = await blobToDataUrl(blob, String(blob.type || mimeType || "").trim() || mimeType);
      if (dataUrl.startsWith("data:")) {
        if (cacheKey) {
          montageExportHydratedMediaCache.set(cacheKey, dataUrl);
          void putPodcasterLocalMediaDataUrl(cacheKey, dataUrl, {
            mimeType: String(blob.type || mimeType || "").trim() || mimeType,
            sourceUrl: effectiveFetchUrl,
            storagePath: String(asset?.storagePath || "").trim(),
            kind
          }).catch(() => { });
        }
        return {
          ...asset,
          dataUrl,
          localDataUrl: dataUrl,
          localMediaCacheKey: cacheKey || String(asset?.localMediaCacheKey || "").trim(),
          url: sourceUrl,
          downloadUrl: sourceUrl
        };
      }
    }
    return {
      ...asset,
      localMediaCacheKey: cacheKey || String(asset?.localMediaCacheKey || "").trim(),
      url: sourceUrl,
      downloadUrl: sourceUrl
    };
  } catch (_) {
    if (cacheKey) {
      const cachedDataUrl = await readMontageCachedMediaDataUrl(cacheKey);
      if (cachedDataUrl.startsWith("data:")) {
        return {
          ...asset,
          dataUrl: cachedDataUrl,
          localDataUrl: cachedDataUrl,
          localMediaCacheKey: cacheKey,
          url: sourceUrl || String(asset?.url || asset?.downloadUrl || "").trim(),
          downloadUrl: sourceUrl || String(asset?.downloadUrl || asset?.url || "").trim()
        };
      }
    }
    return {
      ...asset,
      localMediaCacheKey: cacheKey || String(asset?.localMediaCacheKey || "").trim(),
      url: sourceUrl || String(asset?.url || asset?.downloadUrl || "").trim(),
      downloadUrl: sourceUrl || String(asset?.downloadUrl || asset?.url || "").trim()
    };
  }
}

async function hydrateMontageExportPayloadMedia(payload = {}) {
  if (!payload || typeof payload !== "object") return payload;
  if (Array.isArray(payload.entries)) {
    for (let index = 0; index < payload.entries.length; index += 1) {
      const entry = payload.entries[index];
      if (!entry || typeof entry !== "object") continue;
      payload.entries[index] = {
        ...entry,
        video: await hydrateMontageSceneMediaAsset(entry.video, "video"),
        audio: await hydrateMontageSceneMediaAsset(entry.audio, "audio")
      };
    }
  }
  if (payload.backgroundMusic && typeof payload.backgroundMusic === "object") {
    payload.backgroundMusic = await hydrateMontageSceneMediaAsset(payload.backgroundMusic, "audio");
  }
  if (payload.dialogueAudioMap && typeof payload.dialogueAudioMap === "object") {
    const nextDialogueAudioMap = {};
    for (const [rowId, clip] of Object.entries(payload.dialogueAudioMap)) {
      nextDialogueAudioMap[rowId] = await hydrateMontageSceneMediaAsset({
        ...(clip && typeof clip === "object" ? clip : {}),
        rowId
      }, "audio");
    }
    payload.dialogueAudioMap = nextDialogueAudioMap;
  }
  if (payload.audioTimeline && typeof payload.audioTimeline === "object") {
    const nextAudioTimeline = { ...payload.audioTimeline };
    if (Array.isArray(nextAudioTimeline.geminiSegments)) {
      nextAudioTimeline.geminiSegments = await Promise.all(
        nextAudioTimeline.geminiSegments.map((segment) => hydrateMontageSceneMediaAsset(segment, "audio"))
      );
    }
    if (Array.isArray(nextAudioTimeline.backgroundSegments)) {
      nextAudioTimeline.backgroundSegments = await Promise.all(
        nextAudioTimeline.backgroundSegments.map((segment) => hydrateMontageSceneMediaAsset(segment, "audio"))
      );
    }
    payload.audioTimeline = nextAudioTimeline;
  }
  return payload;
}

async function blobToDataUrl(blob = null, mimeType = "application/octet-stream") {
  if (!blob || typeof blob.arrayBuffer !== "function") return "";
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  const encodeBase64 = typeof btoa === "function"
    ? btoa
    : (value) => Buffer.from(value, "binary").toString("base64");
  return `data:${mimeType};base64,${encodeBase64(binary)}`;
}

async function resolveCachedMontageMediaDataUrl(asset = {}, kind = "video", budget = {}) {
  const maxBytes = getMontageInlineMediaMaxBytes(kind);
  const rawDataUrl = String(asset?.dataUrl || asset?.localDataUrl || "").trim();
  if (rawDataUrl.startsWith("data:")) {
    const bytes = estimateMontageDataUrlBytes(rawDataUrl);
    if (bytes > 0 && bytes <= maxBytes && bytes <= Math.max(0, Number(budget?.remainingBytes || 0) || 0)) {
      return rawDataUrl;
    }
  }

  if (typeof caches === "undefined" || typeof caches.match !== "function") return "";

  const mimeType = String(asset?.mimeType || "").trim() || (kind === "audio" ? "audio/mpeg" : (kind === "image" ? "image/png" : "video/mp4"));
  for (const candidate of buildMontageMediaCacheCandidates(asset)) {
    let response = null;
    try {
      response = await caches.match(candidate);
    } catch (_) {
      response = null;
    }
    if (!response) continue;
    let blob = null;
    try {
      blob = await response.blob();
    } catch (_) {
      blob = null;
    }
    const sizeBytes = Math.max(0, Number(blob?.size || 0) || 0);
    if (!sizeBytes || sizeBytes > maxBytes) continue;
    if (budget && Number.isFinite(Number(budget.remainingBytes)) && sizeBytes > Number(budget.remainingBytes || 0)) continue;
    let dataUrl = "";
    try {
      dataUrl = await blobToDataUrl(blob, String(response?.headers?.get?.("content-type") || mimeType).trim() || mimeType);
    } catch (_) {
      dataUrl = "";
    }
    if (!dataUrl.startsWith("data:")) continue;
    const dataUrlBytes = estimateMontageDataUrlBytes(dataUrl);
    if (!dataUrlBytes || dataUrlBytes > maxBytes) continue;
    if (budget && Number.isFinite(Number(budget.remainingBytes)) && dataUrlBytes > Number(budget.remainingBytes || 0)) continue;
    return dataUrl;
  }

  return "";
}

async function maybeInlineMontageMediaAsset(asset = null, kind = "video", budget = {}) {
  if (!asset || typeof asset !== "object") return asset;
  const maxBytes = getMontageInlineMediaMaxBytes(kind);
  const directDataUrl = String(asset?.dataUrl || asset?.localDataUrl || "").trim();
  const inlineDataUrl = await resolveCachedMontageMediaDataUrl(asset, kind, budget);
  const dataUrl = inlineDataUrl || directDataUrl;
  if (!dataUrl.startsWith("data:")) return asset;
  const sizeBytes = estimateMontageDataUrlBytes(dataUrl);
  if (!sizeBytes || sizeBytes > maxBytes) return asset;
  if (budget && Number.isFinite(Number(budget.remainingBytes)) && sizeBytes > Number(budget.remainingBytes || 0)) return asset;
  if (budget && Number.isFinite(Number(budget.remainingBytes))) {
    budget.remainingBytes = Math.max(0, Number(budget.remainingBytes || 0) - sizeBytes);
  }
  return {
    ...asset,
    dataUrl,
    localDataUrl: dataUrl
  };
}

async function inlineMontageExportPayloadMedia(payload = {}) {
  if (!payload || typeof payload !== "object") return payload;
  const budget = { remainingBytes: MONTAGE_EXPORT_INLINE_MEDIA_MAX_TOTAL_BYTES };

  if (Array.isArray(payload.entries)) {
    for (let index = 0; index < payload.entries.length; index += 1) {
      const entry = payload.entries[index];
      if (!entry || typeof entry !== "object") continue;
      const nextVideo = await maybeInlineMontageMediaAsset(entry.video, "video", budget);
      const nextAudio = await maybeInlineMontageMediaAsset(entry.audio, "audio", budget);
      payload.entries[index] = {
        ...entry,
        video: nextVideo,
        audio: nextAudio
      };
    }
  }

  if (payload.backgroundMusic && typeof payload.backgroundMusic === "object") {
    payload.backgroundMusic = await maybeInlineMontageMediaAsset(payload.backgroundMusic, "audio", budget);
  }

  if (payload.dialogueAudioMap && typeof payload.dialogueAudioMap === "object") {
    const nextDialogueAudioMap = {};
    for (const [rowId, clip] of Object.entries(payload.dialogueAudioMap)) {
      nextDialogueAudioMap[rowId] = await maybeInlineMontageMediaAsset(clip, "audio", budget);
    }
    payload.dialogueAudioMap = nextDialogueAudioMap;
  }

  if (payload.audioTimeline && typeof payload.audioTimeline === "object") {
    const nextAudioTimeline = { ...payload.audioTimeline };
    if (Array.isArray(nextAudioTimeline.geminiSegments)) {
      const nextGeminiSegments = [];
      for (const segment of nextAudioTimeline.geminiSegments) {
        nextGeminiSegments.push(await maybeInlineMontageMediaAsset(segment, "audio", budget));
      }
      nextAudioTimeline.geminiSegments = nextGeminiSegments;
    }
    if (Array.isArray(nextAudioTimeline.backgroundSegments)) {
      const nextBackgroundSegments = [];
      for (const segment of nextAudioTimeline.backgroundSegments) {
        nextBackgroundSegments.push(await maybeInlineMontageMediaAsset(segment, "audio", budget));
      }
      nextAudioTimeline.backgroundSegments = nextBackgroundSegments;
    }
    payload.audioTimeline = nextAudioTimeline;
  }

  return payload;
}

function stripInlineMontageMediaRecord(record = null) {
  if (!record || typeof record !== "object") return record;
  const clean = { ...record };
  clean.url = normalizeMontageSubmissionMediaUrl(clean.url);
  clean.downloadUrl = normalizeMontageSubmissionMediaUrl(clean.downloadUrl);
  const hasDurableSource = Boolean(
    String(clean.storagePath || "").trim()
    || String(clean.downloadUrl || "").trim()
    || String(clean.url || "").trim()
    || String(clean.localMediaCacheKey || "").trim()
  );
  if (hasDurableSource) {
    clean.dataUrl = "";
    clean.localDataUrl = "";
  }
  return clean;
}

function normalizeMontageSubmissionMediaUrl(value = "") {
  const cleanValue = String(value || "").trim();
  if (!cleanValue) return "";
  if (/^(?:data:|gs:\/\/)/i.test(cleanValue)) return cleanValue;
  const buildExportProxyUrl = (path = "") => {
    const cleanPath = String(path || "").trim();
    if (!cleanPath) return "";
    try {
      if (typeof buildExportApiUrl === "function") {
        const absolute = String(buildExportApiUrl(cleanPath) || "").trim();
        if (absolute) return absolute;
      }
    } catch (_) {
      // fallback below
    }
    try {
      return new URL(cleanPath, window.location.origin).toString();
    } catch (_) {
      return cleanPath;
    }
  };
  try {
    const parsed = new URL(cleanValue, window.location.origin);
    const proxyPath = `${parsed.pathname || ""}${parsed.search || ""}`;
    const isProxyAssetRoute = /^\/api\/assets\/proxy-(?:media|image)\?/i.test(proxyPath);
    if (isProxyAssetRoute) return buildExportProxyUrl(proxyPath);
  } catch (_) {
    // keep legacy handling below
  }
  if (/^https?:\/\//i.test(cleanValue)) return cleanValue;
  if (!cleanValue.startsWith("/api/")) return cleanValue;
  try {
    if (typeof buildApiUrlPreferRemote === "function") {
      const absolute = String(buildApiUrlPreferRemote(cleanValue) || "").trim();
      if (absolute) return absolute;
    }
  } catch (_) {
    // fallback below
  }
  try {
    return new URL(cleanValue, window.location.origin).toString();
  } catch (_) {
    return cleanValue;
  }
}

function inferMontageExportMediaTypeFromUrl(value = "") {
  const clean = String(value || "").trim();
  if (!clean) return "";
  if (clean.startsWith("data:")) {
    const match = /^data:([^;,]+);/i.exec(clean);
    return String(match?.[1] || "").trim().toLowerCase();
  }
  const lower = clean.toLowerCase();
  if (/\.(png|jpe?g|webp|gif|avif|bmp|svg|heic)(?:[?#].*)?$/.test(lower)) return "image/png";
  return "video/mp4";
}

function normalizeMontageExportStoragePathCandidate(value = "") {
  const clean = String(value || "").trim();
  if (!clean) return "";
  let candidate = clean;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (!/%[0-9a-fA-F]{2}/.test(candidate)) break;
    try {
      const decoded = decodeURIComponent(candidate);
      if (decoded === candidate) break;
      candidate = decoded;
    } catch (_) {
      break;
    }
  }
  return candidate;
}

async function resolveMontageExportStatusPreviewMedia(data = null) {
  const source = data && typeof data === "object" ? data : {};
  const storageCandidates = [
    String(source.currentStoragePath || "").trim(),
    normalizeMontageExportStoragePathCandidate(source.currentStoragePath || ""),
    normalizeMontageExportStoragePathCandidate(source.currentDownloadUrl || "")
  ];
  const seenStorageCandidates = new Set();
  for (const storageCandidate of storageCandidates) {
    const cleanStorageCandidate = String(storageCandidate || "").trim();
    if (!cleanStorageCandidate || seenStorageCandidates.has(cleanStorageCandidate)) continue;
    seenStorageCandidates.add(cleanStorageCandidate);
    if (/^https?:\/\//i.test(cleanStorageCandidate)) {
      const normalizedStorageUrl = normalizeMontageSubmissionMediaUrl(cleanStorageCandidate);
      if (normalizedStorageUrl) {
        return {
          dataUrl: normalizedStorageUrl,
          mediaType: inferMontageExportMediaTypeFromUrl(normalizedStorageUrl) || "video/mp4"
        };
      }
      continue;
    }

    const firebaseCandidate = buildMontageStorageGsUrl(cleanStorageCandidate);
    if (firebaseCandidate && typeof window.resolveFirebaseStorageUrl === "function") {
      try {
        const resolved = String(await window.resolveFirebaseStorageUrl(firebaseCandidate) || "").trim();
        const normalizedResolved = normalizeMontageSubmissionMediaUrl(resolved);
        if (normalizedResolved) {
          return {
            dataUrl: normalizedResolved,
            mediaType: inferMontageExportMediaTypeFromUrl(normalizedResolved) || "video/mp4"
          };
        }
      } catch (_) {
        // fallback below
      }
    }

    const fallbackUrl = typeof window.resolveStorageVideoUrl === "function"
      ? String(window.resolveStorageVideoUrl(cleanStorageCandidate, cleanStorageCandidate) || "").trim()
      : "";
    const normalizedFallback = fallbackUrl ? normalizeMontageSubmissionMediaUrl(fallbackUrl) : "";
    if (normalizedFallback) {
      return {
        dataUrl: normalizedFallback,
        mediaType: inferMontageExportMediaTypeFromUrl(normalizedFallback) || "video/mp4"
      };
    }
  }

  const downloadCandidate = String(source.currentDownloadUrl || "").trim();
  const resolvedDownloadCandidate = normalizeMontageExportStoragePathCandidate(downloadCandidate);
  if (resolvedDownloadCandidate) {
    const normalizedDownload = normalizeMontageSubmissionMediaUrl(resolvedDownloadCandidate);
    if (normalizedDownload) {
      return {
        dataUrl: normalizedDownload,
        mediaType: inferMontageExportMediaTypeFromUrl(normalizedDownload) || "video/mp4"
      };
    }
  }

  return null;
}

function stripMontageExportSubmissionPayload(payload = {}) {
  if (!payload || typeof payload !== "object") return payload;
  const next = { ...payload };
  if (Array.isArray(next.entries)) {
    next.entries = next.entries.map((entry) => {
      if (!entry || typeof entry !== "object") return entry;
      return {
        ...entry,
        video: stripInlineMontageMediaRecord(entry.video),
        audio: stripInlineMontageMediaRecord(entry.audio)
      };
    });
  }
  if (next.backgroundMusic && typeof next.backgroundMusic === "object") {
    next.backgroundMusic = stripInlineMontageMediaRecord(next.backgroundMusic);
  }
  if (next.dialogueAudioMap && typeof next.dialogueAudioMap === "object") {
    const nextDialogueAudioMap = {};
    for (const [rowId, clip] of Object.entries(next.dialogueAudioMap)) {
      nextDialogueAudioMap[rowId] = stripInlineMontageMediaRecord(clip);
    }
    next.dialogueAudioMap = nextDialogueAudioMap;
  }
  if (next.audioTimeline && typeof next.audioTimeline === "object") {
    const nextAudioTimeline = { ...next.audioTimeline };
    if (Array.isArray(nextAudioTimeline.geminiSegments)) {
      nextAudioTimeline.geminiSegments = nextAudioTimeline.geminiSegments.map((segment) => stripInlineMontageMediaRecord(segment));
    }
    if (Array.isArray(nextAudioTimeline.backgroundSegments)) {
      nextAudioTimeline.backgroundSegments = nextAudioTimeline.backgroundSegments.map((segment) => stripInlineMontageMediaRecord(segment));
    }
    next.audioTimeline = nextAudioTimeline;
  }
  return next;
}

function buildMontageStylizedTextTimeline(activeSession = null, runtimeEntries = []) {
  const stylizedTextMap = activeSession?.stylizedTextMap && typeof activeSession.stylizedTextMap === "object"
    ? activeSession.stylizedTextMap
    : {};
  const entries = (Array.isArray(runtimeEntries) ? runtimeEntries : [])
    .slice()
    .sort((a, b) => Number(a?.startMs || 0) - Number(b?.startMs || 0) || Number(a?.zIndex || 0) - Number(b?.zIndex || 0));
  const seenRowIds = new Set();
  const segments = entries.map((entry, index) => {
    const rowId = String(entry?.rowId || "").trim();
    const rawTextData = rowId ? String(stylizedTextMap?.[rowId] || "").trim() : "";
    if (!rowId || !rawTextData) return null;
    if (seenRowIds.has(rowId)) return null;
    seenRowIds.add(rowId);
    const runtimeStartMs = Number(entry?.startMs || 0);
    const runtimeDurationMs = Number(
      entry?.effectiveDurationMs
      || entry?.durationMs
      || ((Number(entry?.endMs || 0) || 0) - runtimeStartMs)
    );
    const startMs = Math.max(0, Math.round(runtimeStartMs || 0));
    const durationMs = Math.max(
      STUDIO_TIMELINE_MIN_CLIP_MS,
      Math.round(Number.isFinite(runtimeDurationMs) ? runtimeDurationMs : STUDIO_TIMELINE_MIN_CLIP_MS)
    );
    return {
      id: `${rowId}-stylized-text`,
      rowId,
      sceneIndex: Math.max(1, Math.round(Number(entry?.sceneIndex || index + 1) || index + 1)),
      startMs,
      durationMs,
      zIndex: Math.max(20, Math.round(Number(entry?.zIndex || index + 1) || index + 1) + 20),
      sourceWidth: 1280,
      sourceHeight: 720,
      dataUrl: ""
    };
  }).filter(Boolean);
  return {
    enabled: segments.length > 0,
    sourceWidth: 1280,
    sourceHeight: 720,
    segments
  };
}

async function hydrateMontageStylizedTextTimeline(payload = {}, activeSession = null) {
  if (!payload || typeof payload !== "object") return payload;
  const timeline = payload.stylizedTextTimeline && typeof payload.stylizedTextTimeline === "object"
    ? payload.stylizedTextTimeline
    : null;
  if (!timeline || !Array.isArray(timeline.segments) || !timeline.segments.length) return payload;
  const editor = window.PodcasterMediaEditor || null;
  if (typeof editor?.prewarmStylizedText !== "function") return payload;
  const hydratedSegments = [];
  for (const segment of timeline.segments) {
    const rowId = String(segment?.rowId || "").trim();
    if (!rowId) continue;
    let dataUrl = String(segment?.dataUrl || "").trim();
    if (!dataUrl.startsWith("data:image/")) {
      try {
        dataUrl = String(await editor.prewarmStylizedText(rowId, activeSession) || "").trim();
      } catch (error) {
        console.warn("[podcaster][montage-export][stylized-text] prewarm_failed", {
          rowId,
          message: String(error?.message || error || "").trim()
        });
        dataUrl = "";
      }
    }
    if (!dataUrl.startsWith("data:image/")) continue;
    hydratedSegments.push({
      ...segment,
      dataUrl
    });
  }
  payload.stylizedTextTimeline = {
    ...timeline,
    enabled: hydratedSegments.length > 0,
    segments: hydratedSegments
  };
  return payload;
}

function buildMontageExportDialogueAudioMap(activeSession = null, rowIds = []) {
  const baseMap = window.getDialogueAudioMap?.(activeSession) || activeSession?.dialogueAudioMap || {};
  const resolveDialogueAudio = typeof window.resolveDialogueAudioForRow === "function"
    ? window.resolveDialogueAudioForRow
    : null;
  const normalizeWordTimings = typeof window.normalizeKaraokeWordTimings === "function"
    ? window.normalizeKaraokeWordTimings
    : null;
  const rows = Array.isArray(activeSession?.script?.rows) ? activeSession.script.rows : [];
  const nextDialogueAudioMap = {};
  Array.from(new Set((Array.isArray(rowIds) ? rowIds : []).map((rowId) => String(rowId || "").trim()).filter(Boolean))).forEach((rowId) => {
    const row = rows.find((item) => String(item?.id || "").trim() === rowId) || null;
    const clip = (resolveDialogueAudio ? resolveDialogueAudio(activeSession, rowId) : null) || baseMap?.[rowId] || null;
    if (!clip || typeof clip !== "object") return;
    const targetSpeechLine = String(
      clip.targetSpeechLine
      || row?.targetSpeechLine
      || row?.voiceOverText
      || row?.text
      || ""
    ).trim();
    nextDialogueAudioMap[rowId] = {
      ...clip,
      rowId,
      targetSpeechLine,
      playbackRate: Math.max(0.5, Math.min(10, Number(clip?.playbackRate || row?.playbackRate || 1) || 1)),
      wordTimings: normalizeWordTimings ? normalizeWordTimings(clip, targetSpeechLine) : (Array.isArray(clip?.wordTimings) ? clip.wordTimings : [])
    };
  });
  return nextDialogueAudioMap;
}

function buildMontageFallbackOnScreenTextTimeline(onScreenTextTimeline = null, entries = [], geminiTimelineSegments = []) {
  const baseTimeline = onScreenTextTimeline && typeof onScreenTextTimeline === "object"
    ? onScreenTextTimeline
    : { settings: null, segments: [] };
  const existingSegments = Array.isArray(baseTimeline.segments) ? baseTimeline.segments.filter(Boolean) : [];
  if (baseTimeline?.suppressFallbackFromEntries === true) {
    return {
      settings: baseTimeline.settings || null,
      segments: [],
      suppressFallbackFromEntries: true
    };
  }
  if (existingSegments.length) {
    return {
      settings: baseTimeline.settings || null,
      segments: existingSegments,
      suppressFallbackFromEntries: false
    };
  }
  const segmentByRowId = new Map(
    (Array.isArray(geminiTimelineSegments) ? geminiTimelineSegments : [])
      .map((segment) => [String(segment?.rowId || "").trim(), segment])
      .filter(([rowId]) => rowId)
  );
  const fallbackSegments = (Array.isArray(entries) ? entries : [])
    .map((entry, idx) => {
      const text = String(entry?.onScreenText || "").replace(/\s+/g, " ").trim();
      if (!text) return null;
      const rowId = String(entry?.rowId || "").trim();
      const geminiSeg = segmentByRowId.get(rowId) || null;
      const startMs = geminiSeg
        ? Math.max(0, Math.round(Number(geminiSeg?.startMs || 0) || 0))
        : Math.max(0, Math.round(Number(entry?.timelineStartMs || 0) || 0));
      const durationMs = geminiSeg
        ? Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Math.round(Number(geminiSeg?.durationMs || 0) || STUDIO_TIMELINE_MIN_CLIP_MS))
        : Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Math.round(Number(entry?.durationMs || 0) || STUDIO_TIMELINE_MIN_CLIP_MS));
      return {
        id: String(entry?.id || `${rowId || idx + 1}-entry-text`).trim() || `${rowId || idx + 1}-entry-text`,
        rowId,
        sceneIndex: Math.max(1, Math.round(Number(entry?.sceneIndex || idx + 1) || idx + 1)),
        text,
        startMs,
        durationMs,
        zIndex: Math.max(1, Math.round(Number(entry?.zIndex || idx + 1) || idx + 1)),
        layout: {
          yPct: 0.72,
          widthPct: 0.58,
          heightPct: 0.14,
          xPct: 0.21
        }
      };
    })
    .filter(Boolean);
  return {
    settings: baseTimeline.settings || (fallbackSegments.length ? { fontSizePx: 44 } : null),
    segments: fallbackSegments,
    suppressFallbackFromEntries: false
  };
}

function clampMontageOnScreenTextSegmentsToGeminiTimeline(segments = [], geminiTimelineSegments = []) {
  const sourceSegments = Array.isArray(segments) ? segments : [];
  const geminiByRowId = new Map(
    (Array.isArray(geminiTimelineSegments) ? geminiTimelineSegments : [])
      .map((segment) => {
        const rowId = String(segment?.rowId || "").trim();
        const startMs = Math.max(0, Math.round(Number(segment?.startMs || 0) || 0));
        const durationMs = Math.max(
          STUDIO_TIMELINE_MIN_CLIP_MS,
          Math.round(Number(segment?.durationMs || 0) || (Number(segment?.endMs || 0) - startMs) || STUDIO_TIMELINE_MIN_CLIP_MS)
        );
        return rowId ? [rowId, { startMs, endMs: startMs + durationMs, durationMs }] : null;
      })
      .filter(Boolean)
  );
  if (!geminiByRowId.size) return sourceSegments;
  return sourceSegments
    .map((segment) => {
      if (!segment || typeof segment !== "object") return null;
      const rowId = String(segment?.rowId || "").trim();
      const gemini = rowId ? geminiByRowId.get(rowId) : null;
      if (!gemini) return segment;
      const textStartMs = Math.max(0, Math.round(Number(segment?.startMs || 0) || 0));
      const textDurationMs = Math.max(
        STUDIO_TIMELINE_MIN_CLIP_MS,
        Math.round(Number(segment?.durationMs || 0) || STUDIO_TIMELINE_MIN_CLIP_MS)
      );
      const textEndMs = textStartMs + textDurationMs;
      const startMs = Math.max(textStartMs, gemini.startMs);
      const endMs = Math.min(textEndMs, gemini.endMs);
      if (endMs <= startMs) return null;
      if ((endMs - startMs) < STUDIO_TIMELINE_MIN_CLIP_MS) return null;
      return {
        ...segment,
        startMs,
        durationMs: Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, endMs - startMs)
      };
    })
    .filter(Boolean);
}

function clampMontageOnScreenTextSegmentsToSceneWindows(segments = [], entries = []) {
  const sourceSegments = Array.isArray(segments) ? segments : [];
  const validEntries = Array.isArray(entries) ? entries.filter(Boolean) : [];
  if (!validEntries.length) return sourceSegments;
  const entryByRowId = new Map(
    validEntries
      .map((entry) => {
        const rowId = String(entry?.rowId || "").trim();
        return rowId ? [rowId, entry] : null;
      })
      .filter(Boolean)
  );
  const entryBySceneIndex = new Map(
    validEntries
      .map((entry) => {
        const sceneIndex = Math.max(1, Math.round(Number(entry?.sceneIndex || 0) || 0));
        return sceneIndex ? [sceneIndex, entry] : null;
      })
      .filter(Boolean)
  );
  return sourceSegments
    .map((segment) => {
      if (!segment || typeof segment !== "object") return null;
      const rowId = String(segment?.rowId || "").trim();
      const sceneIndex = Math.max(1, Math.round(Number(segment?.sceneIndex || 0) || 0));
      const entry = (rowId ? entryByRowId.get(rowId) : null) || entryBySceneIndex.get(sceneIndex) || null;
      if (!entry) return segment;
      const textStartMs = Math.max(0, Math.round(Number(segment?.startMs || 0) || 0));
      const textDurationMs = Math.max(
        STUDIO_TIMELINE_MIN_CLIP_MS,
        Math.round(Number(segment?.durationMs || 0) || STUDIO_TIMELINE_MIN_CLIP_MS)
      );
      const textEndMs = textStartMs + textDurationMs;
      const sceneStartMs = Math.max(0, Math.round(Number(entry?.timelineStartMs ?? entry?.startMs ?? 0) || 0));
      const sceneEndMs = Math.max(
        sceneStartMs,
        Math.round(Number(entry?.timelineEndMs ?? entry?.endMs ?? (sceneStartMs + Number(entry?.durationMs || 0))) || sceneStartMs)
      );
      if (sceneEndMs <= sceneStartMs) return segment;
      const startMs = Math.max(textStartMs, sceneStartMs);
      const endMs = Math.min(textEndMs, sceneEndMs);
      if (endMs <= startMs) return null;
      if ((endMs - startMs) < STUDIO_TIMELINE_MIN_CLIP_MS) return null;
      return {
        ...segment,
        startMs,
        durationMs: Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, endMs - startMs)
      };
    })
    .filter(Boolean);
}

function resolveEffectiveMontageOnScreenTextTimeline({
  activeSession = null,
  onScreenTextTimeline = null,
  validEntries = [],
  geminiTimelineSegments = []
} = {}) {
  const baseTimeline = onScreenTextTimeline && typeof onScreenTextTimeline === "object"
    ? onScreenTextTimeline
    : { settings: null, segments: [], suppressFallbackFromEntries: false };
  const settings = baseTimeline?.settings || null;
  const clipMap = window.ensureOnScreenTextClipsByRowId?.(activeSession, { persist: false }) || {};
  const clips = Object.values(clipMap || {});
  const rows = Array.isArray(window.getSessionRows?.(activeSession)) ? window.getSessionRows(activeSession) : [];
  const trackVisible = settings?.enabled !== false && settings?.showTrack !== false;
  const allHidden = clips.length > 0 && clips.every((clip) => {
    if (clip?.hidden === true) return true;
    const rowId = String(clip?.rowId || "").trim();
    const row = rows.find((item) => String(item?.id || "").trim() === rowId) || null;
    const text = String(row?.onScreenText || row?.textoPantalla || row?.textoEnPantalla || "").trim();
    return !text;
  });
  const shouldSuppressFallback = baseTimeline?.suppressFallbackFromEntries === true || allHidden || !trackVisible;

  if (shouldSuppressFallback) {
    return {
      settings,
      segments: [],
      suppressFallbackFromEntries: true,
      debug: {
        trackVisible,
        allHidden,
        clipCount: clips.length
      }
    };
  }

  const nextTimeline = Array.isArray(baseTimeline?.segments) && baseTimeline.segments.length
    ? {
      settings,
      segments: baseTimeline.segments.filter(Boolean),
      suppressFallbackFromEntries: false
    }
    : buildMontageFallbackOnScreenTextTimeline(baseTimeline, validEntries, geminiTimelineSegments);
  const sceneBoundedSegments = clampMontageOnScreenTextSegmentsToSceneWindows(nextTimeline.segments, validEntries);
  const boundedSegments = clampMontageOnScreenTextSegmentsToGeminiTimeline(sceneBoundedSegments, geminiTimelineSegments);

  return {
    ...nextTimeline,
    segments: boundedSegments,
    debug: {
      trackVisible,
      allHidden,
      clipCount: clips.length
    }
  };
}

async function buildMontageExportPayloadForSubmission(session = null) {
  const activeSession = session || window.getActiveSession?.() || null;
  if (activeSession) {
    try {
      window.ensureOnScreenTextClipsByRowId?.(activeSession, { persist: true });
      window.ensureOnScreenTextLayoutByRowId?.(activeSession, { persist: true });
    } catch (error) {
      console.warn("[podcaster][montage-export][text-raster] preflight_sync_failed", {
        message: String(error?.message || error || "").trim()
      });
    }
  }
  const prepared = buildMontageExportPayload(session);
  if (!prepared?.ok || !prepared?.payload) return prepared;
  await hydrateMontageExportPayloadMedia(prepared.payload);
  await inlineMontageExportPayloadMedia(prepared.payload);
  await hydrateMontageStylizedTextTimeline(prepared.payload, activeSession);
  const renderedSegments = Array.isArray(prepared.payload.onScreenTextRenderedSegments)
    ? prepared.payload.onScreenTextRenderedSegments.filter(Boolean)
    : [];
  if (!renderedSegments.length && Array.isArray(prepared.payload.onScreenTextTimeline?.renderedSegments)) {
    prepared.payload.onScreenTextRenderedSegments = prepared.payload.onScreenTextTimeline.renderedSegments.filter(Boolean);
  } else {
    prepared.payload.onScreenTextRenderedSegments = renderedSegments;
  }
  return prepared;
}

export function buildMontageExportPayload(session = null) {
  const activeSession = session || window.getActiveSession?.();
  if (!activeSession) return { ok: false, error: "No hay sesión activa.", payload: null };
  const sessionId = String(activeSession?.id || "").trim();
  if (!sessionId) return { ok: false, error: "La sesión no tiene un ID válido.", payload: null };
  const runtimeEntries = Array.isArray(window.buildTimelineRuntimeEntries?.(activeSession))
    ? window.buildTimelineRuntimeEntries(activeSession)
    : [];
  if (!runtimeEntries.length) return { ok: false, error: "No hay clips en el timeline para exportar.", payload: null };
  const linear = validateMontageExportLinearTimeline(runtimeEntries);
  if (!linear.ok) return { ok: false, error: linear.error, payload: null };
  const videoCfg = window.getPodcastVideoConfig?.(activeSession) || {};
  const timelineDurationMs = Math.max(
    STUDIO_TIMELINE_MIN_CLIP_MS,
    Number(window.getTimelineTotalDurationMs?.(activeSession) || 0) || 0
  );
  const montageAudioMode = String(videoCfg?.audioMode || "gemini-live-per-scene").trim().toLowerCase();
  const runtimeByRowId = new Map(runtimeEntries.map((entry) => [String(entry?.rowId || "").trim(), entry]));
  const onScreenTextTimeline = window.buildMontageOnScreenTextSegments?.(activeSession, runtimeEntries, {}) || {
    settings: null,
    segments: []
  };
  const overlayCards = window.buildMontageOverlayCardSegments?.(activeSession, runtimeEntries) || {
    enabled: false,
    segments: []
  };
  const normalizeLegacyPct = (value, fallback = 100, max = 200) => {
    const num = window.toFiniteNumber(value, fallback);
    const ceiling = Math.max(0, Number(max) || 100);
    if (!Number.isFinite(num)) return Math.max(0, Math.min(ceiling, Number(fallback) || 0));
    const scaled = num > 0 && num <= 1 ? num * 100 : num;
    return Math.max(0, Math.min(ceiling, scaled));
  };

  const buildSceneBackgroundAutomationWindows = () => {
    const sceneEntries = runtimeEntries
      .slice()
      .sort((a, b) => Number(a?.startMs || 0) - Number(b?.startMs || 0));
    return sceneEntries.map((entry) => {
      const rowId = String(entry?.rowId || "").trim();
      if (!rowId) return null;
      const sceneVolumePct = window.getSceneBackgroundMusicVolumeOverridePct(activeSession, rowId);
      if (!Number.isFinite(sceneVolumePct)) return null;
      const startMs = Math.max(0, Math.round(Number(entry?.startMs || 0) || 0));
      const endMs = Math.max(startMs + STUDIO_TIMELINE_MIN_CLIP_MS, Math.round(Number(entry?.endMs || startMs + STUDIO_TIMELINE_MIN_CLIP_MS) || 0));
      return {
        rowId,
        startMs,
        endMs,
        volumePct: Math.max(0, Math.min(200, Number(sceneVolumePct) || 0))
      };
    }).filter(Boolean);
  };

  const resolveGeminiSegmentTimelineDurationMs = (segment = null, rowId = "", runtime = null) => {
    const startMs = Math.max(0, Math.round(Number(segment?.startMs || 0) || 0));
    const playbackRate = Math.max(0.5, Math.min(10, Number(window.resolveDialogueAudioPlaybackRate?.(activeSession, rowId) || 1) || 1));
    const trimInMs = Math.max(0, Math.round(Number((segment?.trimInMs ?? runtime?.clip?.trimInMs ?? 0)) || 0));
    const trimOutMs = Math.max(0, Math.round(Number((segment?.trimOutMs ?? runtime?.clip?.trimOutMs ?? 0)) || 0));
    const trimmedVisibleMs = trimOutMs > trimInMs ? (trimOutMs - trimInMs) : 0;
    const declaredDurationMs = Math.max(
      STUDIO_TIMELINE_MIN_CLIP_MS,
      Math.round(Number(segment?.durationMs || 0) || (Number(segment?.endMs || 0) - startMs) || STUDIO_TIMELINE_MIN_CLIP_MS)
    );
    return Math.max(
      STUDIO_TIMELINE_MIN_CLIP_MS,
      Math.round((trimmedVisibleMs || declaredDurationMs) / playbackRate)
    );
  };

  const buildGeminiTimelineSegments = () => {
    const track = window.normalizeGeminiDialogueTrack(videoCfg?.geminiDialogueTrack || {});
    if (!(track.enabled === true) || !Array.isArray(track.segments) || !track.segments.length) return [];
    const baseGeminiVolumePct = normalizeLegacyPct(track?.volumePct, normalizeLegacyPct(videoCfg?.montageDefaultGeminiVolumePct, 100));
    return track.segments
      .map((segment, idx) => {
        const rowId = String(segment?.rowId || "").trim();
        if (!rowId) return null;
        const rows = window.getSessionRows?.(activeSession) || [];
        const row = rows.find((item) => String(item?.id || "").trim() === rowId) || null;
        const clip = window.resolveDialogueVideoForRow?.(activeSession, rowId) || null;
        const checkLib = typeof window.isPublicLibrarySceneRow === "function"
          ? window.isPublicLibrarySceneRow
          : (r, c) => Boolean(r?.sourcePublicSceneLibraryId || r?.publicSceneLibraryId || c?.publicSceneLibraryId || c?.model === "public-scene-library");
        const hasExplicitAudio = typeof window.hasExplicitDialogueAudioForRow === "function"
          ? window.hasExplicitDialogueAudioForRow(activeSession, rowId)
          : false;
        if (checkLib(row, clip) && !hasExplicitAudio) {
          return null;
        }
        const runtime = runtimeByRowId.get(rowId) || null;
        // Para escenas de biblioteca con audio explícito, resolveDialogueAudioForRow
        // tiene su propio guard que las bloquea. Aquí ya sabemos que el audio existe,
        // así que lo resolvemos directamente desde el map o el fallback del track.
        const storedAudio = (
          (typeof window.getDialogueAudioMap === "function" ? window.getDialogueAudioMap(activeSession)[rowId] : null)
          || (typeof window.resolveFallbackDialogueAudioForRow === "function" ? window.resolveFallbackDialogueAudioForRow(activeSession, rowId) : null)
          || window.resolveDialogueAudioForRow(activeSession, rowId)
        );
        const src = String(
          storedAudio?.downloadUrl
          || storedAudio?.storagePath
          || storedAudio?.localDataUrl
          || storedAudio?.dataUrl
          || segment?.audioSrc
          || runtime?.audioSrc
          || ""
        ).trim();
        const effectiveSrc = src || String(storedAudio?.localMediaCacheKey || "").trim();
        if (!effectiveSrc) return null;
        const startMs = Math.max(0, Math.round(Number(segment?.startMs || 0) || 0));
        const durationMs = resolveGeminiSegmentTimelineDurationMs(segment, rowId, runtime);
        const trimInMs = Math.max(0, Math.round(Number((segment?.trimInMs ?? runtime?.clip?.trimInMs ?? 0)) || 0));
        const trimOutMsRaw = Math.round(Number((segment?.trimOutMs ?? runtime?.clip?.trimOutMs ?? 0)) || 0);
        // En export, el segmento debe durar `durationMs` dentro del timeline.
        // Si `trimOutMs` es mayor, FFmpeg recortaría demasiado tarde y el audio se encimaría.
        const trimOutMs = Math.min(
          Math.max(trimInMs + STUDIO_TIMELINE_MIN_CLIP_MS, trimOutMsRaw || (trimInMs + durationMs)),
          trimInMs + durationMs
        );
        const overridePctRaw = window.toFiniteNumber(runtime?.clip?.geminiVolumeOverridePct, Number.NaN);
        const volumePct = Number.isFinite(overridePctRaw)
          ? normalizeLegacyPct(overridePctRaw, baseGeminiVolumePct)
          : baseGeminiVolumePct;
        if (volumePct <= 0.0001) return null;
        return {
          kind: "gemini",
          id: String(segment?.id || `${rowId}-seg-${idx + 1}`).trim() || `${rowId}-seg-${idx + 1}`,
          rowId,
          sceneIndex: Math.max(1, Math.round(Number(segment?.sceneIndex || 0) || 0)),
          url: effectiveSrc,
          storagePath: String(storedAudio?.storagePath || "").trim(),
          downloadUrl: String(storedAudio?.downloadUrl || "").trim(),
          dataUrl: String(storedAudio?.dataUrl || storedAudio?.localDataUrl || "").trim(),
          localDataUrl: String(storedAudio?.localDataUrl || storedAudio?.dataUrl || "").trim(),
          localMediaCacheKey: String(storedAudio?.localMediaCacheKey || "").trim(),
          mimeType: String(storedAudio?.mimeType || "").trim(),
          startMs,
          durationMs,
          trimInMs,
          trimOutMs,
          fadeInMs: Math.max(0, Math.min(durationMs, Number(segment?.fadeInMs || 0) || 0)),
          fadeOutMs: Math.max(0, Math.min(durationMs, Number(segment?.fadeOutMs || 0) || 0)),
          volumePct
        };
      })
      .filter(Boolean);
  };

  const buildUploadedBackgroundSegments = () => {
    const segments = window.buildUploadedPanelMusicSegments(activeSession);
    const panelMusic = window.getPanelMontageMusicConfig();
    if (!Array.isArray(segments) || !segments.length) return [];
    return segments
      .map((segment, idx) => {
        const src = String(segment?.downloadUrl || segment?.storagePath || segment?.localDataUrl || segment?.dataUrl || "").trim();
        if (!src) return null;
        const startMs = Math.max(0, Math.round(Number(segment?.startMs || 0) || 0));
        const endMs = Math.max(startMs + STUDIO_TIMELINE_MIN_CLIP_MS, Math.round(Number(segment?.endMs || 0) || 0));
        const durationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, endMs - startMs);
        const trimInMs = Math.max(0, Math.round(Number(segment?.trimInMs || 0) || 0));
        const trimOutMs = Math.min(
          Math.max(trimInMs + STUDIO_TIMELINE_MIN_CLIP_MS, Math.round(Number(segment?.trimOutMs || 0) || (trimInMs + durationMs))),
          trimInMs + durationMs
        );
        const volumePct = normalizeLegacyPct(
          segment?.montageVolume ?? segment?.volume ?? panelMusic?.montageVolume ?? panelMusic?.volume ?? 0,
          0
        );
        if (volumePct <= 0.0001) return null;
        return {
          kind: "uploaded",
          id: String(segment?.id || `uploaded-${idx + 1}`).trim() || `uploaded-${idx + 1}`,
          trackIndex: Math.max(0, Math.floor(Number(segment?.trackIndex || 0) || 0)),
          loopIndex: Math.max(0, Math.floor(Number(segment?.loopIndex || 0) || 0)),
          slotLabel: String(segment?.slotLabel || "").trim(),
          url: src,
          storagePath: String(segment?.storagePath || "").trim(),
          downloadUrl: String(segment?.downloadUrl || "").trim(),
          dataUrl: String(segment?.dataUrl || segment?.localDataUrl || "").trim(),
          localDataUrl: String(segment?.localDataUrl || segment?.dataUrl || "").trim(),
          localMediaCacheKey: String(segment?.localMediaCacheKey || "").trim(),
          mimeType: String(segment?.mimeType || "").trim(),
          startMs,
          endMs,
          durationMs,
          trimInMs,
          trimOutMs,
          fadeInMs: Math.max(0, Math.min(durationMs, Number(segment?.fadeInMs || 0) || 0)),
          fadeOutMs: Math.max(0, Math.min(durationMs, Number(segment?.fadeOutMs || 0) || 0)),
          duckingWhenGeminiPct: Math.max(40, Math.min(100, Number(segment?.duckingWhenGeminiPct ?? segment?.duckingPct ?? panelMusic?.duckingWhenGeminiPct ?? 60))),
          volumePct
        };
      })
      .filter(Boolean);
  };

  const buildTrackBackgroundSegments = () => {
    const panelMusic = window.getPanelMontageMusicConfig();
    const src = String(panelMusic?.downloadUrl || panelMusic?.storagePath || panelMusic?.sourceUrl || panelMusic?.localDataUrl || panelMusic?.dataUrl || "").trim();
    const volumePct = normalizeLegacyPct(panelMusic?.volume ?? 0, 0);
    if (panelMusic?.sourceType !== "track" || !src || volumePct <= 0.0001) return [];
    if (Array.isArray(panelMusic?.sourceItems) && panelMusic.sourceItems.length) return [];
    const trimInMs = Math.max(0, Math.round(Number(panelMusic?.trimInMs || 0) || 0));
    const rawTrimOutMs = Math.max(0, Math.round(Number(panelMusic?.trimOutMs || 0) || 0));
    const configuredDurationMs = Math.max(0, Math.round(Number(panelMusic?.durationSec || 0) * 1000));
    const effectiveLoopMs = Math.max(
      STUDIO_TIMELINE_MIN_CLIP_MS,
      (rawTrimOutMs > trimInMs ? rawTrimOutMs - trimInMs : configuredDurationMs) || STUDIO_TIMELINE_MIN_CLIP_MS
    );
    const startOffsetMs = Math.max(0, Math.round(Number(panelMusic?.startOffsetMs || 0) || 0));
    const segments = [];
    let cursorMs = Math.max(0, startOffsetMs);
    const loopEnabled = panelMusic?.loopEnabled !== false;
    while (cursorMs < timelineDurationMs) {
      const relativeMs = Math.max(0, cursorMs - startOffsetMs);
      const loopIndex = Math.max(0, Math.floor(relativeMs / effectiveLoopMs));
      if (!loopEnabled && loopIndex > 0) break;
      const loopPositionMs = relativeMs % effectiveLoopMs;
      const chunkDurationMs = Math.max(
        STUDIO_TIMELINE_MIN_CLIP_MS,
        Math.min(timelineDurationMs - cursorMs, effectiveLoopMs - loopPositionMs)
      );
      const loopSetting = panelMusic?.loopSettings?.find?.((item) => Math.max(0, Math.floor(Number(item?.loopIndex || 0) || 0)) === loopIndex) || null;
      const loopFadeInMs = Math.max(0, Number(loopSetting?.fadeInMs || 0) || 0);
      const loopFadeOutMs = Math.max(0, Number(loopSetting?.fadeOutMs || 0) || 0);
      segments.push({
        kind: "background-track",
        id: `track-bg-loop-${loopIndex}-${cursorMs}`,
        rowId: "",
        url: src,
        storagePath: String(panelMusic?.storagePath || "").trim(),
        downloadUrl: String(panelMusic?.downloadUrl || src || "").trim(),
        dataUrl: String(panelMusic?.dataUrl || panelMusic?.localDataUrl || "").trim(),
        localDataUrl: String(panelMusic?.localDataUrl || panelMusic?.dataUrl || "").trim(),
        mimeType: "audio/mpeg",
        startMs: cursorMs,
        endMs: cursorMs + chunkDurationMs,
        durationMs: chunkDurationMs,
        trimInMs: trimInMs + loopPositionMs,
        trimOutMs: trimInMs + loopPositionMs + chunkDurationMs,
        fadeInMs: Math.max(0, Math.min(chunkDurationMs, loopFadeInMs)),
        fadeOutMs: Math.max(0, Math.min(chunkDurationMs, loopFadeOutMs)),
        duckingWhenGeminiPct: Math.max(40, Math.min(100, Number(panelMusic?.duckingWhenGeminiPct ?? 60))),
        volumePct
      });
      cursorMs += chunkDurationMs;
    }
    return segments;
  };

  const geminiTimelineSegments = montageAudioMode === "gemini-live-per-scene" ? buildGeminiTimelineSegments() : [];
  const backgroundAutomationWindows = buildSceneBackgroundAutomationWindows();
  const uploadedBackgroundSegments = buildUploadedBackgroundSegments();
  const trackBackgroundSegments = buildTrackBackgroundSegments();
  const useTimelineAudio = geminiTimelineSegments.length > 0 || uploadedBackgroundSegments.length > 0 || trackBackgroundSegments.length > 0;

  const orderedRuntimeEntries = runtimeEntries
    .slice()
    .sort((a, b) => Number(a?.startMs || 0) - Number(b?.startMs || 0));

  const entries = orderedRuntimeEntries
    .map((entry, index) => {
      const rowId = String(entry?.rowId || "").trim();
      const nextEntry = orderedRuntimeEntries[index + 1] || null;
      const nextRowId = String(nextEntry?.rowId || "").trim();
      const rows = Array.isArray(window.getSessionRows?.(activeSession)) ? window.getSessionRows(activeSession) : [];
      const row = rows.find((item) => String(item?.id || "").trim() === rowId) || null;
      const clip = window.resolveDialogueVideoForRow?.(activeSession, rowId) || null;
      const primarySegment = window.resolvePrimaryDialogueVideoSegment?.(clip) || null;
      const audio = window.resolveDialogueAudioForRow?.(activeSession, rowId) || null;
      const videoStoragePath = String(primarySegment?.storagePath || clip?.storagePath || "").trim();
      const videoDownloadUrl = String(primarySegment?.downloadUrl || clip?.downloadUrl || "").trim();
      const videoDataUrl = String(primarySegment?.dataUrl || clip?.dataUrl || primarySegment?.localDataUrl || clip?.localDataUrl || "").trim();
      const videoMimeType = String(primarySegment?.mimeType || clip?.mimeType || "video/mp4").trim() || "video/mp4";
      const audioStoragePath = String(audio?.storagePath || "").trim();
      const audioDownloadUrl = String(audio?.downloadUrl || "").trim();
      const audioDataUrl = String(audio?.dataUrl || audio?.localDataUrl || "").trim();
      const audioMimeType = String(audio?.mimeType || "audio/ogg").trim() || "audio/ogg";
      const videoCacheKey = buildMontageSceneMediaCacheKey({
        sessionId,
        rowId,
        sceneIndex: index + 1,
        storagePath: videoStoragePath,
        downloadUrl: videoDownloadUrl,
        id: primarySegment?.id || clip?.id || rowId
      }, "video");
      const audioCacheKey = buildMontageSceneMediaCacheKey({
        sessionId,
        rowId,
        sceneIndex: index + 1,
        storagePath: audioStoragePath,
        downloadUrl: audioDownloadUrl,
        id: audio?.id || rowId
      }, "audio");
      const durationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Number(entry?.effectiveDurationMs || 0) || STUDIO_TIMELINE_MIN_CLIP_MS);
      const trimInMs = Math.max(0, Number(entry?.clip?.trimInMs || 0) || 0);
      const sceneMix = window.resolveTimelineClipMix?.(activeSession, rowId) || null;
      const resolvedVeoVolumePct = Number.isFinite(Number(sceneMix?.veoPct))
        ? Math.max(0, Math.min(100, Math.round(Number(sceneMix.veoPct))))
        : normalizeLegacyPct(entry?.clip?.veoVolumeOverridePct, normalizeLegacyPct(videoCfg?.montageDefaultVeoVolumePct, 100));
      const resolvedGeminiVolumePct = Number.isFinite(Number(sceneMix?.geminiPct))
        ? Math.max(0, Math.min(100, Math.round(Number(sceneMix.geminiPct))))
        : normalizeLegacyPct(entry?.clip?.geminiVolumeOverridePct, normalizeLegacyPct(videoCfg?.montageDefaultGeminiVolumePct, 100));
      const useNativeVideoAudio = window.shouldKeepNativeVideoAudioForRow?.(activeSession, rowId) || resolvedVeoVolumePct > 0.0001;
      const transitionOut = entry?.transitionOut
        || (rowId && nextRowId ? window.getTransitionForEdge?.(activeSession, rowId, nextRowId) : null)
        || null;
      const hasCustomBg = entry?.clip?.backgroundColor && String(entry.clip.backgroundColor).trim() !== "";
      if (!rowId || (!(videoStoragePath || videoDownloadUrl || videoDataUrl) && !hasCustomBg)) {
        return {
          ok: false,
          error: `La escena ${index + 1} no tiene video ni color de fondo seleccionado.`,
          entry: null,
          skippedEntry: {
            sceneIndex: index + 1,
            rowId,
            speaker: String(row?.speaker || "").trim(),
            sceneLabel: `Escena ${index + 1}`,
            reason: "missing_video_source"
          }
        };
      }
      return {
        ok: true,
        error: "",
        entry: {
          rowId,
          sceneIndex: index + 1,
          speaker: String(row?.speaker || "").trim(),
          sceneLabel: `Escena ${index + 1}`,
          backgroundColor: entry?.clip?.backgroundColor || "",
          zIndex: Math.max(1, Number(entry?.zIndex || entry?.clip?.zIndex || index + 1) || (index + 1)),
          timelineStartMs: Math.max(0, Number(entry?.startMs || 0) || 0),
          timelineEndMs: Math.max(0, Number(entry?.endMs || 0) || 0),
          trimInMs,
          durationMs,
          mediaScale: window.normalizeTimelineClipMediaScale?.(entry?.clip?.mediaScale) || 1,
          mediaOffsetXPct: entry?.clip?.mediaOffsetXPct || 0,
          mediaOffsetYPct: entry?.clip?.mediaOffsetYPct || 0,
          mediaMotionPreset: entry?.clip?.mediaMotionPreset || "none",
          visualLayoutMode: window.normalizeTimelineClipVisualLayoutMode?.(entry?.clip?.visualLayoutMode) || "default",
          voiceOverText: String(row?.voiceOverText || row?.text || "").replace(/\s+/g, " ").trim(),
          sceneDescription: String(row?.sceneDescription || row?.scenePrompt || "").replace(/\s+/g, " ").trim(),
          onScreenText: String(row?.onScreenText || "").replace(/\s+/g, " ").trim(),
          visualNotes: String(row?.visualNotes || "").replace(/\s+/g, " ").trim(),
          videoDirective: String(row?.videoDirective || "").replace(/\s+/g, " ").trim(),
          visualEffects: activeSession?.visualEffectsMap?.[rowId] || null,
          transitionOut,
          video: {
            storagePath: videoStoragePath || "",
            url: videoDownloadUrl || "",
            downloadUrl: videoDownloadUrl || "",
            dataUrl: videoDataUrl || "",
            localDataUrl: videoDataUrl || "",
            mimeType: videoMimeType,
            type: String(primarySegment?.type || clip?.type || (videoMimeType.startsWith("image/") ? "image" : "video")).trim().toLowerCase() || (videoMimeType.startsWith("image/") ? "image" : "video"),
            mediaKind: String(primarySegment?.type || clip?.type || (videoMimeType.startsWith("image/") ? "image" : "video")).trim().toLowerCase() || (videoMimeType.startsWith("image/") ? "image" : "video"),
            localMediaCacheKey: videoCacheKey
          },
          // When the montage timeline audio is active, Gemini voice is mixed in the
          // final audio pass together with background tracks. Keeping the per-scene
          // clip here would duplicate Gemini over the same scene.
          audio: useTimelineAudio
            ? null
            : (audioStoragePath || audioDownloadUrl || audioDataUrl) ? {
              storagePath: audioStoragePath || "",
              url: audioDownloadUrl || "",
              downloadUrl: audioDownloadUrl || "",
              dataUrl: audioDataUrl || "",
              localDataUrl: audioDataUrl || "",
              mimeType: audioMimeType,
              localMediaCacheKey: audioCacheKey
            } : null,
          useNativeVideoAudio: useNativeVideoAudio === true,
          veoVolumeOverridePct: resolvedVeoVolumePct,
          geminiVolumeOverridePct: resolvedGeminiVolumePct
        }
      };
    });
  const validEntries = entries.filter((item) => item.ok === true && item.entry).map((item) => item.entry);
  const skippedEntries = entries.filter((item) => item.ok !== true).map((item) => item.skippedEntry).filter(Boolean);
  if (skippedEntries.length) {
    return {
      ok: false,
      error: `Hay escenas sin fuente válida: ${formatMontageSkippedEntries(skippedEntries, 3)}. Corrige esas escenas antes de exportar.`,
      payload: null,
      warnings: null
    };
  }
  if (!validEntries.length) {
    return {
      ok: false,
      error: "No se pudo preparar exportación.",
      payload: null,
      warnings: null
    };
  }
  const dialogueAudioMap = buildMontageExportDialogueAudioMap(
    activeSession,
    validEntries.map((entry) => entry?.rowId)
  );
  // Revalidate the effective visibility at submit time so hidden text never leaks into
  // export, even if the timeline DOM or cached segments are stale.
  const effectiveOnScreenTextTimeline = resolveEffectiveMontageOnScreenTextTimeline({
    activeSession,
    onScreenTextTimeline,
    validEntries,
    geminiTimelineSegments
  });
  const shouldSendOnScreenTextTimeline = effectiveOnScreenTextTimeline.segments.length
    || effectiveOnScreenTextTimeline.suppressFallbackFromEntries === true;
  const stylizedTextTimeline = buildMontageStylizedTextTimeline(activeSession, runtimeEntries);

  const panelMusic = window.getPanelMontageMusicConfig();
  const canUseTrackMusic = panelMusic?.sourceType === "track" && (panelMusic?.sourceItems || []).length === 0;
  const trackUrl = String(panelMusic?.downloadUrl || panelMusic?.storagePath || panelMusic?.sourceUrl || panelMusic?.localDataUrl || panelMusic?.dataUrl || "").trim();
  const trackVolumePct = normalizeLegacyPct(panelMusic?.volume ?? 0, 0);
  const includeBackgroundMusic = Boolean(canUseTrackMusic && trackUrl && trackVolumePct > 0 && trackBackgroundSegments.length === 0);
  const backgroundMusic = includeBackgroundMusic ? {
    storagePath: String(panelMusic?.storagePath || "").trim(),
    downloadUrl: String(panelMusic?.downloadUrl || "").trim(),
    url: trackUrl,
    localDataUrl: String(panelMusic?.localDataUrl || "").trim(),
    dataUrl: String(panelMusic?.dataUrl || panelMusic?.localDataUrl || "").trim(),
    volumePct: trackVolumePct,
    duckingWhenGeminiPct: Math.max(40, Math.min(100, Number(panelMusic?.duckingWhenGeminiPct ?? 60)))
  } : null;

  const requestedFormat = String(window.montageExportState.format || "mp4_h264").trim();
  const effectiveFormat = requestedFormat === "webm_vp9" ? "webm_vp9" : "mp4_h264";

  const reelModeEnabled = videoCfg?.reelModeEnabled === true;
  const payload = {
    sessionId,
    renderMode: normalizeMontageRenderMode(window.montageExportState.renderMode || "browser"),
    exportMode: window.montageExportState.exportMode,
    onlyAudio: window.montageExportState.onlyAudio === true,
    format: effectiveFormat,
    qualityPreset: window.montageExportState.qualityPreset,
    resolution: resolveEffectiveExportResolution(window.montageExportState.resolution, reelModeEnabled),
    reelModeEnabled,
    includeBackgroundMusic,
    backgroundMusic,
    backgroundMusicDuckingPct: Math.max(40, Math.min(100, Number(panelMusic?.duckingWhenGeminiPct ?? 60))),
    filename: String(window.montageExportState.filename || defaultMontageExportFilename()).trim(),
    onScreenTextTimeline: effectiveOnScreenTextTimeline ? {
      enabled: effectiveOnScreenTextTimeline.settings?.enabled !== false && effectiveOnScreenTextTimeline.settings?.showTrack !== false && effectiveOnScreenTextTimeline.segments.length > 0,
      settings: effectiveOnScreenTextTimeline.settings,
      segments: effectiveOnScreenTextTimeline.segments,
      suppressFallbackFromEntries: effectiveOnScreenTextTimeline.suppressFallbackFromEntries === true
    } : null,
    onScreenTextRenderedSegments: [],
    stylizedTextTimeline,
    dialogueAudioMap,
    overlayCards: window.buildMontageOverlayCardSegments?.(activeSession, runtimeEntries) || overlayCards,
    audioTimeline: useTimelineAudio ? {
      enabled: true,
      durationMs: timelineDurationMs,
      mode: "timeline",
      geminiSegments: geminiTimelineSegments,
      backgroundSegments: [...uploadedBackgroundSegments, ...trackBackgroundSegments],
      sceneBackgroundAutomation: backgroundAutomationWindows
    } : null,
    bitrateSettings: {
      mode: window.montageExportState.bitrateMode,
      maxBitrateMbps: window.montageExportState.maxBitrate,
      minBitrateCrf: window.montageExportState.minBitrate
    },
    brandOverlay: buildMontageBrandOverlayForExport(reelModeEnabled),
    partyKaraoke: window.montageExportState.partyKaraoke !== false
  };

  return {
    ok: true,
    error: "",
    warnings: null,
    payload: {
      ...payload,
      entries: validEntries
    }
  };
}

export async function runMontageExport() {
  if (window.montageExportBusy || montageExportSubmitLocked) return;
  montageExportSubmitLocked = true;
  setMontageExportBusy(true);
  const previousJobId = String(window.montageExportJobState.jobId || "").trim();
  try {
    window.montageExportJobState.submissionInFlight = true;
    setConfirmMontageExportButtonState({
      disabled: true,
      loading: true,
      label: "Preparando exportación…"
    });
    const session = window.getActiveSession?.() || null;
    const prepared = await buildMontageExportPayloadForSubmission(session);
    if (!window.montageExportBusy) return;
    logMontageExportDevtools("submit_clicked", {
      hasSession: Boolean(session),
      preparedOk: Boolean(prepared?.ok),
      entries: Array.isArray(prepared?.payload?.entries) ? prepared.payload.entries.length : 0,
      onScreenTextSegments: Array.isArray(prepared?.payload?.onScreenTextTimeline?.segments) ? prepared.payload.onScreenTextTimeline.segments.length : 0,
      onScreenTextRenderedSegments: Array.isArray(prepared?.payload?.onScreenTextRenderedSegments) ? prepared.payload.onScreenTextRenderedSegments.length : 0,
      stylizedTextSegments: Array.isArray(prepared?.payload?.stylizedTextTimeline?.segments) ? prepared.payload.stylizedTextTimeline.segments.length : 0,
      onScreenTextSuppressFallback: prepared?.payload?.onScreenTextTimeline?.suppressFallbackFromEntries === true,
      onScreenTextEnabled: prepared?.payload?.onScreenTextTimeline?.enabled === true,
      exportMode: String(window.montageExportState.exportMode || "").trim() || undefined,
      onlyAudio: window.montageExportState.onlyAudio === true,
      includeLogo: window.montageExportState.includeLogo !== false,
      partyKaraoke: window.montageExportState.partyKaraoke !== false,
      activeRowId: String(window.podcastVideoState?.activeRowId || "").trim() || undefined,
      sessionRowCount: Array.isArray(session?.script?.rows) ? session.script.rows.length : 0,
      runtimeEntryCount: Array.isArray(prepared?.payload?.entries) ? prepared.payload.entries.length : 0
    });
    if (!prepared?.ok) {
      setMontageExportProgress(null);
      setMontageExportStatus(prepared?.error || "No pudimos preparar la exportación.", "Revisa que el timeline tenga clips válidos.", { tone: "error" });
      setMontageExportBusy(false);
      return;
    }
    setMontageExportBusy(true);
    setMontageExportPreviewPaused(true);
    window.setTimelinePreviewsSuspended(true);
    if (window.montageExportPreviewState?.debounceTimer) {
      window.clearTimeout(window.montageExportPreviewState.debounceTimer);
      window.montageExportPreviewState.debounceTimer = null;
    }
    resetMontageExportJobState();
    setMontageExportContinueButton({ visible: false });
    setMontageExportProgress(0.08);
    setMontageExportStatus("Preparando exportación…", "Enviando job al backend.", { tone: "neutral" });
    setConfirmMontageExportButtonState({
      disabled: true,
      loading: true,
      label: "Iniciando exportación…"
    });
    refreshMontageExportPreviewNow({
      force: true,
      preserveProgressiveFrame: true,
      loadingMeta: "Manteniendo el preview del montaje mientras inicia la exportación…"
    }).catch(() => { });
    const submissionPayload = stripMontageExportSubmissionPayload(prepared.payload);
    const data = await authFetchJson(buildMontageExportEndpoint("/api/podcaster/montage/export"), {
      method: "POST",
      body: submissionPayload
    });
    window.montageExportJobState.submissionInFlight = false;
    if (!window.montageExportBusy) {
      console.warn("[podcaster][montage-export] submit returned but export is no longer busy (cancelled)");
      const newJobId = String(data?.jobId || "").trim();
      if (newJobId) {
        void requestMontageExportCancel(newJobId).catch(() => {});
      }
      return;
    }
    const jobId = String(data?.jobId || "").trim();
    if (!jobId) throw new Error("montage_export_job_missing");
    window.montageExportJobState.jobId = jobId;
    persistMontageExportActiveJob(jobId, Date.now());
    window.montageExportJobState.lastStage = String(data?.stage || "").trim();
    window.montageExportJobState.lastHint = String(data?.hint || "").trim();
    window.montageExportJobState.lastProgress = Math.max(0, Math.min(1, Number(data?.progress || 0) || 0));
    window.montageExportJobState.lastPollSuccessAtMs = Date.now();
    window.montageExportJobState.lastHeartbeatAt = String(data?.heartbeatAt || data?.updatedAt || "").trim();
    window.montageExportJobState.preferFirestorePolling = false;
    window.montageExportJobState.firestorePreferredMissCount = 0;
    window.montageExportJobState.firestorePollCount = 0;
    window.montageExportJobState.recoverySource = "";
    window.montageExportJobState.busyHandoffRecoveryCount = 0;
    window.montageExportJobState.reviewExcelEnabled = window.montageExportState.exportMode === "review" && window.montageExportState.includeReviewExcel !== false;
    window.montageExportJobState.reviewExcelPayload = prepared.payload;
    window.montageExportJobState.reviewExcelFilename = String(prepared.payload?.filename || window.montageExportState.filename || "").trim();
    logMontageExportDevtools("submit_accepted", {
      jobId,
      stage: String(data?.stage || "").trim() || undefined,
      progress: Math.max(0, Math.min(1, Number(data?.progress || 0) || 0)),
      hint: String(data?.hint || "").trim() || undefined
    });
    setMontageExportProgress(window.montageExportJobState.lastProgress);
    setMontageExportStatus(
      describeMontageExportStage(window.montageExportJobState.lastStage, window.montageExportState.exportMode),
      window.montageExportJobState.lastHint,
      { tone: "neutral" }
    );
    window.montageExportJobState.startedAtMs = Date.now();
    pollMontageExportJob(jobId).catch(() => { });
  } catch (error) {
    window.montageExportJobState.submissionInFlight = false;
    if (!window.montageExportBusy) return;
    const apiPayload = error?.detail && typeof error.detail === "object" ? error.detail : null;
    const detail = apiPayload?.detail && typeof apiPayload.detail === "object" ? apiPayload.detail : null;
    const activeJobId = String(detail?.activeJobId || apiPayload?.activeJobId || "").trim();
    const activeJobKind = String(detail?.kind || apiPayload?.kind || "").trim();
    const status = Number(apiPayload?.status || error?.status || 0) || 0;
    const code = String(apiPayload?.error || error?.error || error?.message || "").trim();
    try {
      if (status === 429 || code === "backend_busy_with_export") {
        console.warn("[podcaster][montage-export] export already active or backend busy", {
          status: status || undefined,
          code: code || undefined,
          kind: activeJobKind || undefined,
          activeJobId: activeJobId || undefined
        });
      } else {
        console.error("[podcaster][montage-export] runMontageExport failed", error);
      }
    } catch (_) {
      // noop
    }
    logMontageExportDevtools("submit_failed", {
      status: status || undefined,
      code: code || undefined
    }, "error");
    const hintParts = [];
    if (status === 429 || code === "backend_busy_with_export") {
      if (activeJobId && activeJobKind === "montage_export") {
        window.montageExportJobState.jobId = activeJobId;
        window.montageExportJobState.recoverySource = "busy_handoff";
        persistMontageExportActiveJob(activeJobId, Date.now());
        setMontageExportContinueButton({ visible: true, label: "Seguir exportación" });
        setMontageExportStatus(
          "Ya hay una exportación activa.",
          "Estamos retomando el seguimiento del job en curso.",
          { tone: "warning" }
        );
        await continueMontageExportPolling();
        return;
      }
      if (activeJobId) {
        hintParts.push(activeJobKind === "dialogue_video"
          ? "Hay una generación de video en curso."
          : "Hay otra tarea pesada en curso.");
      } else {
        hintParts.push("El servidor está ocupado con otra exportación.");
      }
      hintParts.push(previousJobId
        ? "Usa \"Continuar exportación\" para retomar el job activo."
        : "Intenta de nuevo manualmente en unos segundos.");
      if (previousJobId) {
        window.montageExportJobState.jobId = previousJobId;
        persistMontageExportActiveJob(previousJobId, Date.now());
        setMontageExportContinueButton({ visible: true });
      }
    } else if (status === 503 && code === "montage_export_queue_unavailable") {
      hintParts.push("El backend no pudo iniciar la exportación en este momento.");
      hintParts.push("Intenta de nuevo manualmente.");
    } else if (status === 503 && String(apiPayload?.code || "").trim() === "backend_busy") {
      hintParts.push("El backend está ocupado con otra exportación o generación de video.");
      hintParts.push("Reintenta en unos segundos.");
    } else if (String(code).includes("storage_not_found")) {
      hintParts.push("Hay escenas que ya no tienen su archivo de video/audio.");
      hintParts.push("Regenera esas escenas y vuelve a exportar.");
    } else if (status >= 500) {
      hintParts.push("Intenta de nuevo en unos segundos.");
    } else {
      hintParts.push(String(code || "Revisa tu timeline y vuelve a intentar."));
    }
    setMontageExportProgress(null);
    setMontageExportStatus("No pudimos exportar tu video.", hintParts.join(" "), { tone: "error" });
    window.setTimelinePreviewsSuspended?.(false);
    setMontageExportPreviewPaused(false);
    setMontageExportBusy(false);
  } finally {
    montageExportSubmitLocked = false;
    if (!window.montageExportBusy) {
      setConfirmMontageExportButtonState({
        disabled: false,
        loading: false,
        label: "Exportar"
      });
    }
  }
}

// --- Bind to window for global access ---
Object.assign(window, {
  MONTAGE_EXPORT_STORAGE_KEY,
  normalizeMontageExportSettings,
  sanitizeMontageFilenamePart,
  isLegacyAutoMontageFilename,
  defaultMontageExportFilename,
  stripFileExtension,
  formatMontageExportClockMs,
  formatMontageExportTimelineLabel,
  ensureMontageExportXlsx,
  buildMontageReviewExcelRows,
  downloadMontageReviewExcel,
  loadMontageExportSettings,
  persistMontageExportSettings,
  montageExportState,
  montageExportBusy,
  shouldSuspendMontagePreviewActivity,
  montageExportPreviewState,
  montageExportJobState,
  logMontageExportDevtools,
  setMontageExportOpen,
  clearMontageExportPolling,
  setMontageExportContinueButton,
  setMontageExportDownloadButton,
  downloadReadyMontageExport,
  resetMontageExportJobState,
  setMontageExportPreviewState,
  resetMontageExportPreviewState,
  closeMontageExportModal,
  cancelMontageExportFromModal,
  setMontageExportStatus,
  setMontageExportBusy,
  setMontageExportPreviewPaused,
  setMontageExportProgress,
  describeMontageExportStage,
  describeMontageExportSceneSubstage,
  pollMontageExportJob,
  continueMontageExportPolling,
  getMontagePreviewRowId,
  maybeRefreshMontageExportPreviewFromJob,
  resolveMontageExportFrontendPreview,
  refreshMontageExportPreviewNow,
  scheduleMontageExportPreviewRefresh,
  syncMontageExportUi,
  openMontageExportModal,
  validateMontageExportLinearTimeline,
  formatMontageSkippedEntries,
  buildMontageExportPayload,
  runMontageExport
});
