/**
 * Podcaster Studio - Montage Export & Excel/File Utilities
 * Handles configurations, filenames, Excel review row builders, and download utilities.
 */

import { authFetchJson, buildApiUrlPreferRemote } from "../js/api-client-podcaster.js";
import { resolveEffectiveExportResolution } from "./podcaster-reels.js";

const STUDIO_TIMELINE_MIN_CLIP_MS = 500;
const MONTAGE_EXPORT_POLL_MAX_MS = 0;
const MONTAGE_EXPORT_PREVIEW_REFRESH_MIN_MS = 2200;
const MONTAGE_EXPORT_ACTIVE_JOB_MAX_AGE_MS = 15 * 60 * 1000;
const MONTAGE_EXPORT_JOB_NOT_FOUND_MAX_RETRIES = 4;

// --- Constants ---
const MONTAGE_EXPORT_STORAGE_KEY = "cb_podcast_montage_export_v1";
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

  return {
    exportMode,
    format,
    qualityPreset,
    resolution,
    bitrateMode,
    maxBitrate,
    minBitrate,
    filename,
    includeReviewExcel,
    onlyAudio: source.onlyAudio === true,
    includeLogo: source.includeLogo !== false,
    partyKaraoke: source.partyKaraoke !== false
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
    localStorage.setItem(MONTAGE_EXPORT_STORAGE_KEY, JSON.stringify(normalizeMontageExportSettings(montageExportState)));
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
  lastJobPreviewAt: 0
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
  pollFailureCount: 0,
  jobNotFoundCount: 0,
  reviewExcelEnabled: false,
  reviewExcelPayload: null,
  reviewExcelFilename: ""
};

function logMontageExportDevtools(event = "", payload = {}, level = "info") {
  void event;
  void payload;
  void level;
}

function isTransientMontageExportTransportError(error = null) {
  const status = Number(error?.status || error?.detail?.status || 0) || 0;
  if (status === 0) return true;
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

function getMontageExportPreviewMediaTargets(mediaType = "", preferAlt = false) {
  const isImage = String(mediaType || "").startsWith("image/");
  const primary = isImage ? window.els.montageExportPreviewImage : window.els.montageExportPreviewVideo;
  const alt = isImage ? window.els.montageExportPreviewImageAlt : window.els.montageExportPreviewVideoAlt;
  const target = preferAlt && alt ? alt : (primary || alt || null);
  const fallback = target === primary ? alt : primary;
  return { isImage, primary, alt, target, fallback };
}

function syncMontageFrontendPreviewMediaLayout(frontendPreview = null, mediaEl = null) {
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

export function resetMontageExportJobState() {
  clearMontageExportPolling();
  window.montageExportJobState = {
    jobId: "",
    pollTimer: null,
    resumeOnOnlineHandler: null,
    startedAtMs: 0,
    lastStage: "",
    lastSceneSubstage: "",
    lastHint: "",
    lastProgress: -1,
    pollFailureCount: 0,
    jobNotFoundCount: 0,
    reviewExcelEnabled: false,
    reviewExcelPayload: null,
    reviewExcelFilename: ""
  };
  setMontageExportContinueButton({ visible: false });
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
    syncMontageFrontendPreviewMediaLayout(window.montageExportPreviewState.frontendPreview, targetMediaEl);
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
      syncMontageFrontendPreviewMediaLayout(window.montageExportPreviewState.frontendPreview, targetMediaEl);
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
    lastJobPreviewAt: 0
  };
  setMontageExportPreviewState({ mode: window.montageExportState.exportMode, meta: "Así se vería tu video exportado." });
}

export async function closeMontageExportModal() {
  const activeJobId = String(window.montageExportJobState?.jobId || "").trim();
  if (window.montageExportBusy && activeJobId) {
    void requestMontageExportCancel(activeJobId);
  }
  if (typeof window.exportPreviewController?.stop === "function") {
    window.exportPreviewController.stop();
  }
  resetMontageExportJobState();
  resetMontageExportPreviewState();
  setMontageExportPreviewPaused(false);
  window.montageExportBusy = false;
  window.setTimelinePreviewsSuspended(false);
  setMontageExportBusy(false);
  setMontageExportOpen(false);
}

async function requestMontageExportCancel(jobId = "") {
  const cleanJobId = String(jobId || "").trim();
  if (!cleanJobId) return false;
  try {
    await authFetchJson("/api/podcaster/montage/export-cancel", {
      method: "POST",
      body: { jobId: cleanJobId }
    });
    return true;
  } catch (error) {
    console.warn("[podcaster][montage-export] cancel request failed", String(error?.message || error || "unknown"));
    return false;
  }
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
}

export function setMontageExportBusy(isBusy = false) {
  montageExportBusy = Boolean(isBusy);
  window.montageExportBusy = montageExportBusy;
  if (window.els.confirmMontageExportBtn) window.els.confirmMontageExportBtn.disabled = Boolean(isBusy);
  if (window.els.continueMontageExportBtn) window.els.continueMontageExportBtn.disabled = Boolean(isBusy);
  if (window.els.generateAllDialogueVideosBtn) window.els.generateAllDialogueVideosBtn.disabled = Boolean(isBusy) || window.podcastVideoState.busy;
  if (window.els.regenerateAllDialogueVideosBtn) window.els.regenerateAllDialogueVideosBtn.disabled = Boolean(isBusy) || window.podcastVideoState.busy;
  if (window.els.generateDialogueVideoBtn) window.els.generateDialogueVideoBtn.disabled = Boolean(isBusy);
  if (window.els.montageExportModal) {
    window.els.montageExportModal.classList.toggle("is-busy", Boolean(isBusy));
    if (!isBusy) window.els.montageExportModal.classList.remove("is-progress");
  }
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
    mix_timeline_audio: "Mezclando narración del timeline…",
    mix_background_music: "Mezclando música de fondo…",
    apply_onscreen_text: "Aplicando texto en pantalla…",
    apply_review_layout: "Componiendo layout de revisión…",
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
    const exportStatusUrl = buildApiUrlPreferRemote(`/api/podcaster/montage/export-status?jobId=${encodeURIComponent(cleanJobId)}`);
    const data = await authFetchJson(exportStatusUrl, {
      auth: false
    });
    if (String(window.montageExportJobState.jobId || "").trim() !== cleanJobId) return;
    window.montageExportJobState.pollFailureCount = 0;
    window.montageExportJobState.jobNotFoundCount = 0;
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
    if (stage === "render_scene_segments" && currentSceneIndex > 0 && !shouldSuspendMontagePreviewActivity()) {
      maybeRefreshMontageExportPreviewFromJob({
        rowId: currentRowId,
        sceneIndex: currentSceneIndex,
        totalScenes
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
      const warningBlock = Array.isArray(data?.warnings) && data.warnings.length ? data.warnings[0] : null;
      let statusText = "Tu video está listo.";
      let hintText = "";
      if (warningBlock?.skippedEntries?.length) {
        statusText = `Tu video está listo. Omitimos ${warningBlock.skippedEntries.length} escena(s).`;
        hintText = formatMontageSkippedEntries(warningBlock.skippedEntries, 3);
      }
      const url = String(data?.downloadUrl || data?.export?.downloadUrl || "").trim();
      const name = String(data?.export?.filename || window.montageExportState.filename || "montage").trim() || "montage";
      if (url) {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = name;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      }
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
          return;
        }
      }
      setMontageExportStatus(statusText, hintText, { tone: warningBlock?.skippedEntries?.length ? "warning" : "success" });
      window.montageExportBusy = false;
      window.setTimelinePreviewsSuspended(false);
      setMontageExportPreviewPaused(false);
      setMontageExportBusy(false);
      return;
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
      const skippedEntries = Array.isArray(err?.detail?.skippedEntries) ? err.detail.skippedEntries : [];
      const failedLabel = failedSubstage
        ? describeMontageExportSceneSubstage(failedSubstage, failedSceneIndex, totalScenes) || failedSubstage
        : "";
      setMontageExportProgress(null);
      setMontageExportStatus(
        "No pudimos exportar tu video.",
        skippedEntries.length
          ? `Omitimos escenas con archivos faltantes: ${formatMontageSkippedEntries(skippedEntries, 3)}`
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
      return;
    }
    if (data?.degraded === true && String(data?.status || "").trim() === "running") {
      const hint = String(data?.hint || "").trim() || "Recuperando el estado del export…";
      setMontageExportStatus(
        describeMontageExportStage(stage, window.montageExportState.exportMode),
        hint,
        { tone: "warning" }
      );
      scheduleMontageExportPollRetry(cleanJobId, 0, { transient: false });
      return;
    }
  } catch (error) {
    if (String(window.montageExportJobState.jobId || "").trim() !== cleanJobId) return;
    const errorCode = String(error?.detail?.error || error?.error || error?.message || "").trim();
    const errorStatus = Number(error?.status || error?.detail?.status || 0) || 0;
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
      clearMontageExportPolling();
      persistMontageExportActiveJob("");
      window.montageExportJobState.jobId = "";
      window.montageExportJobState.jobNotFoundCount = 0;
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
    const transientHint = transientNetworkError
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

export function maybeRefreshMontageExportPreviewFromJob({ rowId = "", sceneIndex = 0, totalScenes = 0 } = {}) {
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
  refreshMontageExportPreviewNow({
    previewRowId: cleanRowId,
    previewSceneIndex: cleanSceneIndex,
    allowDuringExport: true,
    force: true,
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
  const selected = (cleanSceneIndex > 0 ? entries[cleanSceneIndex - 1] : null)
    || entries.find((entry) => String(entry?.rowId || "").trim() === cleanRowId)
    || entries[0];
  if (!selected || typeof selected !== "object") return null;
  const video = selected?.video && typeof selected.video === "object" ? selected.video : null;
  const directDownloadUrl = String(video?.downloadUrl || "").trim();
  const rawUrl = String(video?.url || "").trim();
  const storagePath = String(video?.storagePath || "").trim();
  let src = directDownloadUrl || rawUrl;
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
  if (!window.els.montageExportModal || window.els.montageExportModal.hidden) return;
  if (shouldSuspendMontagePreviewActivity() && !allowDuringExport) {
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
  const prepared = buildMontageExportPayload(window.getActiveSession());
  if (!prepared.ok) {
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
    window.els.montageExportPartyKaraoke.checked = state.partyKaraoke !== false;
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
  syncMontageExportUi();
  resetMontageExportJobState();
  resetMontageExportPreviewState();
  setMontageExportPreviewPaused(false);
  setMontageExportBusy(false);
  setMontageExportProgress(null);

  const session = window.getActiveSession();
  if (session && typeof window.exportPreviewController?.init === "function") {
    window.exportPreviewController.sync(session);
    window.exportPreviewController.seek(0);
  }
  const persistedJob = loadPersistedMontageExportActiveJob();
  if (persistedJob?.jobId) {
    window.montageExportJobState.jobId = persistedJob.jobId;
    window.montageExportJobState.startedAtMs = persistedJob.startedAtMs || Date.now();
    window.montageExportBusy = true;
    setMontageExportBusy(true);
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
const MONTAGE_EXPORT_INLINE_MEDIA_MAX_TOTAL_BYTES = 6_000_000;

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
  const rawDataUrl = String(asset?.dataUrl || asset?.localDataUrl || "").trim();
  if (rawDataUrl.startsWith("data:")) {
    const bytes = estimateMontageDataUrlBytes(rawDataUrl);
    if (bytes > 0 && bytes <= MONTAGE_EXPORT_INLINE_MEDIA_MAX_BYTES && bytes <= Math.max(0, Number(budget?.remainingBytes || 0) || 0)) {
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
    if (!sizeBytes || sizeBytes > MONTAGE_EXPORT_INLINE_MEDIA_MAX_BYTES) continue;
    if (budget && Number.isFinite(Number(budget.remainingBytes)) && sizeBytes > Number(budget.remainingBytes || 0)) continue;
    let dataUrl = "";
    try {
      dataUrl = await blobToDataUrl(blob, String(response?.headers?.get?.("content-type") || mimeType).trim() || mimeType);
    } catch (_) {
      dataUrl = "";
    }
    if (!dataUrl.startsWith("data:")) continue;
    const dataUrlBytes = estimateMontageDataUrlBytes(dataUrl);
    if (!dataUrlBytes || dataUrlBytes > MONTAGE_EXPORT_INLINE_MEDIA_MAX_BYTES) continue;
    if (budget && Number.isFinite(Number(budget.remainingBytes)) && dataUrlBytes > Number(budget.remainingBytes || 0)) continue;
    return dataUrl;
  }

  return "";
}

async function maybeInlineMontageMediaAsset(asset = null, kind = "video", budget = {}) {
  if (!asset || typeof asset !== "object") return asset;
  const directDataUrl = String(asset?.dataUrl || asset?.localDataUrl || "").trim();
  const inlineDataUrl = await resolveCachedMontageMediaDataUrl(asset, kind, budget);
  const dataUrl = inlineDataUrl || directDataUrl;
  if (!dataUrl.startsWith("data:")) return asset;
  const sizeBytes = estimateMontageDataUrlBytes(dataUrl);
  if (!sizeBytes || sizeBytes > MONTAGE_EXPORT_INLINE_MEDIA_MAX_BYTES) return asset;
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

async function buildMontageExportPayloadForSubmission(session = null) {
  const prepared = buildMontageExportPayload(session);
  if (!prepared?.ok || !prepared?.payload) return prepared;
  await inlineMontageExportPayloadMedia(prepared.payload);
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
  const onScreenTextTimeline = window.buildMontageOnScreenTextSegments?.(activeSession, runtimeEntries, {
    includeHidden: window.montageExportState.partyKaraoke !== false
  }) || {
    settings: null,
    segments: []
  };
  const overlayCards = window.buildMontageOverlayCardSegments?.(activeSession, runtimeEntries) || {
    enabled: false,
    segments: []
  };
  const dialogueAudioMap = window.getDialogueAudioMap?.(activeSession) || activeSession?.dialogueAudioMap || {};

  const normalizeLegacyPct = (value, fallback = 100, max = 200) => {
    const num = window.toFiniteNumber(value, fallback);
    const ceiling = Math.max(0, Number(max) || 100);
    if (!Number.isFinite(num)) return Math.max(0, Math.min(ceiling, Number(fallback) || 0));
    const scaled = num > 0 && num <= 1 ? num * 100 : num;
    return Math.max(0, Math.min(ceiling, scaled));
  };

  const splitBackgroundSegmentsByScene = (segmentList = []) => {
    const sceneEntries = runtimeEntries
      .slice()
      .sort((a, b) => Number(a?.startMs || 0) - Number(b?.startMs || 0));
    return segmentList.flatMap((segment) => {
      const segmentStartMs = Math.max(0, Math.round(Number(segment?.startMs || 0) || 0));
      const segmentEndMs = Math.max(segmentStartMs + STUDIO_TIMELINE_MIN_CLIP_MS, Math.round(Number(segment?.endMs || segmentStartMs + STUDIO_TIMELINE_MIN_CLIP_MS) || 0));
      const segmentTrimInMs = Math.max(0, Math.round(Number(segment?.trimInMs || 0) || 0));
      const baseVolumePct = Math.max(0, Math.min(200, Number(segment?.volumePct ?? 100)));
      return sceneEntries.flatMap((entry) => {
        const rowId = String(entry?.rowId || "").trim();
        const sceneStartMs = Math.max(0, Math.round(Number(entry?.startMs || 0) || 0));
        const sceneEndMs = Math.max(sceneStartMs + STUDIO_TIMELINE_MIN_CLIP_MS, Math.round(Number(entry?.endMs || sceneStartMs + STUDIO_TIMELINE_MIN_CLIP_MS) || 0));
        const overlapStartMs = Math.max(segmentStartMs, sceneStartMs);
        const overlapEndMs = Math.min(segmentEndMs, sceneEndMs);
        const overlapDurationMs = Math.max(0, overlapEndMs - overlapStartMs);
        if (overlapDurationMs < STUDIO_TIMELINE_MIN_CLIP_MS) return [];
        const sceneVolumePct = window.getSceneBackgroundMusicVolumeOverridePct(activeSession, rowId);
        const effectiveVolumePct = baseVolumePct * (Number.isFinite(sceneVolumePct) ? (sceneVolumePct / 100) : 1);
        if (effectiveVolumePct <= 0.0001) return [];
        const shouldApplyFadeIn = Math.abs(overlapStartMs - segmentStartMs) <= 1;
        const shouldApplyFadeOut = Math.abs(overlapEndMs - segmentEndMs) <= 1;
        return [{
          ...segment,
          id: String(segment?.id || "bg").trim() ? `${String(segment?.id || "bg").trim()}-${rowId}-${overlapStartMs}` : `bg-${rowId}-${overlapStartMs}`,
          rowId,
          startMs: overlapStartMs,
          durationMs: overlapDurationMs,
          trimInMs: segmentTrimInMs + (overlapStartMs - segmentStartMs),
          trimOutMs: segmentTrimInMs + (overlapStartMs - segmentStartMs) + overlapDurationMs,
          fadeInMs: shouldApplyFadeIn ? Math.max(0, Math.min(overlapDurationMs, Number(segment?.fadeInMs || 0) || 0)) : 0,
          fadeOutMs: shouldApplyFadeOut ? Math.max(0, Math.min(overlapDurationMs, Number(segment?.fadeOutMs || 0) || 0)) : 0,
          volumePct: Math.max(0, Math.min(200, effectiveVolumePct))
        }];
      });
    }).filter(Boolean);
  };

  const buildGeminiTimelineSegments = () => {
    const track = window.normalizeGeminiDialogueTrack(videoCfg?.geminiDialogueTrack || {});
    if (!(track.enabled === true) || !Array.isArray(track.segments) || !track.segments.length) return [];
    const baseGeminiVolumePct = normalizeLegacyPct(track?.volumePct, normalizeLegacyPct(videoCfg?.montageDefaultGeminiVolumePct, 100));
    return track.segments
      .map((segment, idx) => {
        const rowId = String(segment?.rowId || "").trim();
        if (!rowId) return null;
        const runtime = runtimeByRowId.get(rowId) || null;
        const storedAudio = window.resolveDialogueAudioForRow(activeSession, rowId);
        const storedSrc = window.resolveStorageAudioUrl(storedAudio?.downloadUrl || "", storedAudio?.storagePath || "");
        const src = String(storedSrc || segment?.audioSrc || runtime?.audioSrc || "").trim();
        if (!src) return null;
        const startMs = Math.max(0, Math.round(Number(segment?.startMs || 0) || 0));
        const durationMs = Math.max(
          STUDIO_TIMELINE_MIN_CLIP_MS,
          Math.round(Number(segment?.durationMs || 0) || (Number(segment?.endMs || 0) - startMs) || STUDIO_TIMELINE_MIN_CLIP_MS)
        );
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
          url: src,
          storagePath: String(storedAudio?.storagePath || "").trim(),
          downloadUrl: String(storedAudio?.downloadUrl || "").trim(),
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
    return splitBackgroundSegmentsByScene(segments
      .map((segment, idx) => {
        const src = String(window.resolveStorageAudioUrl(segment?.downloadUrl || "", segment?.storagePath || "") || "").trim();
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
      .filter(Boolean));
  };

  const buildTrackBackgroundSegments = () => {
    const panelMusic = window.getPanelMontageMusicConfig();
    const src = String(panelMusic?.sourceUrl || "").trim();
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
    while (cursorMs < timelineDurationMs) {
      const relativeMs = Math.max(0, cursorMs - startOffsetMs);
      const loopIndex = Math.max(0, Math.floor(relativeMs / effectiveLoopMs));
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
        storagePath: "",
        downloadUrl: src,
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
    return splitBackgroundSegmentsByScene(segments);
  };

  const geminiTimelineSegments = montageAudioMode === "gemini-live-per-scene" ? buildGeminiTimelineSegments() : [];
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
      const videoMimeType = String(primarySegment?.mimeType || clip?.mimeType || "video/mp4").trim() || "video/mp4";
      const audioStoragePath = String(audio?.storagePath || "").trim();
      const audioDownloadUrl = String(audio?.downloadUrl || "").trim();
      const audioMimeType = String(audio?.mimeType || "audio/ogg").trim() || "audio/ogg";
      const durationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Number(entry?.effectiveDurationMs || 0) || STUDIO_TIMELINE_MIN_CLIP_MS);
      const trimInMs = Math.max(0, Number(entry?.clip?.trimInMs || 0) || 0);
      const sceneMix = window.resolveTimelineClipMix?.(activeSession, rowId) || null;
      const resolvedVeoVolumePct = Number.isFinite(Number(sceneMix?.veoPct))
        ? Math.max(0, Math.min(100, Math.round(Number(sceneMix.veoPct))))
        : normalizeLegacyPct(entry?.clip?.veoVolumeOverridePct, normalizeLegacyPct(videoCfg?.montageDefaultVeoVolumePct, 100));
      const useNativeVideoAudio = window.shouldKeepNativeVideoAudioForRow?.(activeSession, rowId) || resolvedVeoVolumePct > 0.0001;
      const transitionOut = entry?.transitionOut
        || (rowId && nextRowId ? window.getTransitionForEdge?.(activeSession, rowId, nextRowId) : null)
        || null;
      if (!rowId || !(videoStoragePath || videoDownloadUrl)) {
        return {
          ok: false,
          error: `La escena ${index + 1} no tiene video generado.`,
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
            mimeType: videoMimeType,
            type: String(primarySegment?.type || clip?.type || (videoMimeType.startsWith("image/") ? "image" : "video")).trim().toLowerCase() || (videoMimeType.startsWith("image/") ? "image" : "video"),
            mediaKind: String(primarySegment?.type || clip?.type || (videoMimeType.startsWith("image/") ? "image" : "video")).trim().toLowerCase() || (videoMimeType.startsWith("image/") ? "image" : "video")
          },
          audio: useTimelineAudio
            ? null
            : (audioStoragePath || audioDownloadUrl) ? {
              storagePath: audioStoragePath || "",
              url: audioDownloadUrl || "",
              downloadUrl: audioDownloadUrl || "",
              mimeType: audioMimeType
            } : null,
          useNativeVideoAudio: useNativeVideoAudio === true,
          veoVolumeOverridePct: resolvedVeoVolumePct
        }
      };
    });
  const validEntries = entries.filter((item) => item.ok === true && item.entry).map((item) => item.entry);
  const skippedEntries = entries.filter((item) => item.ok !== true).map((item) => item.skippedEntry).filter(Boolean);
  if (!validEntries.length) {
    return {
      ok: false,
      error: skippedEntries.length
        ? `No hay escenas válidas para exportar. ${formatMontageSkippedEntries(skippedEntries, 2)}`
        : "No se pudo preparar exportación.",
      payload: null,
      warnings: { skippedEntries }
    };
  }

  const panelMusic = window.getPanelMontageMusicConfig();
  const canUseTrackMusic = panelMusic?.sourceType === "track" && (panelMusic?.sourceItems || []).length === 0;
  const trackUrl = String(panelMusic?.sourceUrl || "").trim();
  const trackVolumePct = Math.max(0, Math.min(200, Math.round(Number(panelMusic?.volume ?? 0))));
  const includeBackgroundMusic = Boolean(canUseTrackMusic && trackUrl && trackVolumePct > 0 && trackBackgroundSegments.length === 0);
  const backgroundMusic = includeBackgroundMusic ? {
    storagePath: "",
    url: trackUrl,
    volumePct: trackVolumePct,
    duckingWhenGeminiPct: Math.max(40, Math.min(100, Number(panelMusic?.duckingWhenGeminiPct ?? 60)))
  } : null;

  const requestedFormat = String(window.montageExportState.format || "mp4_h264").trim();
  const effectiveFormat = requestedFormat === "webm_vp9" ? "webm_vp9" : "mp4_h264";

  const reelModeEnabled = videoCfg?.reelModeEnabled === true;
  const payload = {
    sessionId,
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
    onScreenTextTimeline: onScreenTextTimeline.segments.length ? {
      enabled: true,
      settings: onScreenTextTimeline.settings,
      segments: onScreenTextTimeline.segments
    } : null,
    dialogueAudioMap,
    overlayCards: window.buildMontageOverlayCardSegments?.(activeSession, runtimeEntries) || overlayCards,
    audioTimeline: useTimelineAudio ? {
      enabled: true,
      durationMs: timelineDurationMs,
      mode: "timeline",
      geminiSegments: geminiTimelineSegments,
      backgroundSegments: [...uploadedBackgroundSegments, ...trackBackgroundSegments]
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
    warnings: { skippedEntries },
    payload: {
      ...payload,
      entries: validEntries
    }
  };
}

export async function runMontageExport() {
  if (window.montageExportBusy || montageExportSubmitLocked) return;
  montageExportSubmitLocked = true;
  try {
    const previousJobId = String(window.montageExportJobState.jobId || "").trim();
    const session = window.getActiveSession?.() || null;
    const prepared = await buildMontageExportPayloadForSubmission(session);
    logMontageExportDevtools("submit_clicked", {
      hasSession: Boolean(session),
      preparedOk: Boolean(prepared?.ok),
      entries: Array.isArray(prepared?.payload?.entries) ? prepared.payload.entries.length : 0,
      exportMode: String(window.montageExportState.exportMode || "").trim() || undefined
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
    refreshMontageExportPreviewNow({
      force: true,
      loadingMeta: "Manteniendo el preview del montaje mientras inicia la exportación…"
    }).catch(() => { });
    const data = await authFetchJson("/api/podcaster/montage/export", {
      method: "POST",
      body: prepared.payload
    });
    const jobId = String(data?.jobId || "").trim();
    if (!jobId) throw new Error("montage_export_job_missing");
    window.montageExportJobState.jobId = jobId;
    persistMontageExportActiveJob(jobId, Date.now());
    window.montageExportJobState.lastStage = String(data?.stage || "").trim();
    window.montageExportJobState.lastHint = String(data?.hint || "").trim();
    window.montageExportJobState.lastProgress = Math.max(0, Math.min(1, Number(data?.progress || 0) || 0));
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
    const apiPayload = error?.detail && typeof error.detail === "object" ? error.detail : null;
    const detail = apiPayload?.detail && typeof apiPayload.detail === "object" ? apiPayload.detail : null;
    const skippedEntries = Array.isArray(detail?.skippedEntries) ? detail.skippedEntries : [];
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
      code: code || undefined,
      skippedEntries: skippedEntries.length
    }, "error");
    const hintParts = [];
    if (skippedEntries.length) {
      hintParts.push(`Omitimos escenas con archivos faltantes: ${formatMontageSkippedEntries(skippedEntries, 3)}`);
      hintParts.push("Regenera esas escenas y vuelve a exportar.");
    } else if (status === 429 || code === "backend_busy_with_export") {
      if (activeJobId && activeJobKind === "montage_export") {
        window.montageExportJobState.jobId = activeJobId;
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
    setMontageExportBusy(false);
  } finally {
    montageExportSubmitLocked = false;
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
  resetMontageExportJobState,
  setMontageExportPreviewState,
  resetMontageExportPreviewState,
  closeMontageExportModal,
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
