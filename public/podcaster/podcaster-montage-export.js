/**
 * Podcaster Studio - Montage Export & Excel/File Utilities
 * Handles configurations, filenames, Excel review row builders, and download utilities.
 */

import { authFetchJson } from "../js/api-client.js";
import { resolveEffectiveExportResolution } from "./podcaster-reels.js";

const STUDIO_TIMELINE_MIN_CLIP_MS = 500;
const MONTAGE_EXPORT_POLL_MAX_MS = 0;

// --- Constants ---
const MONTAGE_EXPORT_STORAGE_KEY = "cb_podcast_montage_export_v1";
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
    onlyAudio: source.onlyAudio === true
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

// --- States Initialization ---

export let montageExportState = loadMontageExportSettings();
let montageExportBusy = false;
window.montageExportState = montageExportState;
window.montageExportBusy = montageExportBusy;

function setMontageExportState(nextState = {}) {
  montageExportState = normalizeMontageExportSettings(nextState);
  window.montageExportState = montageExportState;
  return montageExportState;
}

// --- Runtime & Environment Detectors ---

function isRenderBackedApiRuntime() {
  const apiBase = String(window.__CHARLY_CONFIG__?.apiBaseUrl || "").trim().toLowerCase();
  return apiBase.includes(".onrender.com/api");
}

function shouldDisableMontagePreviewInCurrentRuntime() {
  // El preview del modal se resuelve desde frontend (sin endpoint de render preview),
  // por lo que no debemos desactivarlo en runtime Render.
  return false;
}

function shouldSuspendMontagePreviewActivity() {
  return window.montageExportBusy === true || shouldDisableMontagePreviewInCurrentRuntime();
}

let montageExportPreviewState = {
  loading: false,
  error: "",
  dataUrl: "",
  mediaType: "",
  mode: "normal",
  sceneIndex: 0,
  disabled: false,
  lastSignature: "",
  debounceTimer: null,
  requestSeq: 0,
  lastJobPreviewRowId: "",
  lastJobPreviewAt: 0
};

let montageExportJobState = {
  jobId: "",
  pollTimer: null,
  startedAtMs: 0,
  lastStage: "",
  lastSceneSubstage: "",
  lastHint: "",
  lastProgress: -1,
  pollFailureCount: 0,
  reviewExcelEnabled: false,
  reviewExcelPayload: null,
  reviewExcelFilename: ""
};

function logMontageExportDevtools(event = "", payload = {}, level = "info") {
  void event;
  void payload;
  void level;
}

// Helper sleep function for loader delays
const safeSleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

// --- Migrated Montage Export Functions ---

export function buildDefaultMontageBrandOverlay() {
  return { ...DEFAULT_MONTAGE_BRAND_OVERLAY };
}

function buildMontageBrandOverlayForExport(isReel = false) {
  return {
    ...buildDefaultMontageBrandOverlay(),
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
    startedAtMs: 0,
    lastStage: "",
    lastSceneSubstage: "",
    lastHint: "",
    lastProgress: -1,
    pollFailureCount: 0,
    reviewExcelEnabled: false,
    reviewExcelPayload: null,
    reviewExcelFilename: ""
  };
  setMontageExportContinueButton({ visible: false });
}

export function setMontageExportPreviewState({ loading = false, error = "", dataUrl = "", mediaType = "", mode = window.montageExportState.exportMode, sceneIndex = 0, meta = "", disabled = false } = {}) {
  const isReelPreview = isMontageExportReelModeActive();
  window.montageExportPreviewState.loading = Boolean(loading);
  window.montageExportPreviewState.error = String(error || "").trim();
  window.montageExportPreviewState.dataUrl = String(dataUrl || "").trim();
  window.montageExportPreviewState.mediaType = String(mediaType || "").trim().toLowerCase();
  window.montageExportPreviewState.mode = String(mode || window.montageExportState.exportMode || "normal").trim() || "normal";
  window.montageExportPreviewState.sceneIndex = Math.max(0, Number(sceneIndex || 0) || 0);
  window.montageExportPreviewState.disabled = Boolean(disabled);
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
  if (window.els.montageExportPreviewVideo) {
    if (isVideoPreview) {
      const currentSrc = String(window.els.montageExportPreviewVideo.getAttribute("src") || "").trim();
      if (currentSrc !== window.montageExportPreviewState.dataUrl) {
        window.els.montageExportPreviewVideo.src = window.montageExportPreviewState.dataUrl;
        window.els.montageExportPreviewVideo.load();
      }
      window.els.montageExportPreviewVideo.hidden = false;
      window.els.montageExportPreviewVideo.muted = true;
      const playPromise = window.els.montageExportPreviewVideo.play?.();
      if (playPromise && typeof playPromise.catch === "function") playPromise.catch(() => { });
    } else {
      try { window.els.montageExportPreviewVideo.pause?.(); } catch (_) { }
      window.els.montageExportPreviewVideo.hidden = true;
      if (!window.montageExportPreviewState.loading) {
        window.els.montageExportPreviewVideo.removeAttribute("src");
        try { window.els.montageExportPreviewVideo.load?.(); } catch (_) { }
      }
    }
  }
  if (window.els.montageExportPreviewImage) {
    if (hasReadyPreview && !isVideoPreview) {
      window.els.montageExportPreviewImage.src = window.montageExportPreviewState.dataUrl;
      window.els.montageExportPreviewImage.hidden = false;
    } else {
      window.els.montageExportPreviewImage.hidden = true;
      if (!window.montageExportPreviewState.loading) window.els.montageExportPreviewImage.removeAttribute("src");
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
    lastSignature: "",
    debounceTimer: null,
    requestSeq: window.montageExportPreviewState.requestSeq || 0,
    lastJobPreviewRowId: "",
    lastJobPreviewAt: 0
  };
  setMontageExportPreviewState({ mode: window.montageExportState.exportMode, meta: "Así se vería tu video exportado." });
}

export function closeMontageExportModal() {
  if (typeof window.exportPreviewController?.stop === "function") {
    window.exportPreviewController.stop();
  }
  resetMontageExportJobState();
  resetMontageExportPreviewState();
  window.montageExportBusy = false;
  window.setTimelinePreviewsSuspended(false);
  setMontageExportBusy(false);
  setMontageExportOpen(false);
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
    const data = await authFetchJson(`/api/podcaster/montage/export-status?jobId=${encodeURIComponent(cleanJobId)}`, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache"
      }
    });
    if (String(window.montageExportJobState.jobId || "").trim() !== cleanJobId) return;
    window.montageExportJobState.pollFailureCount = 0;
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
    if (stage === "render_scene_segments" && currentRowId && !shouldSuspendMontagePreviewActivity()) {
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
          setMontageExportBusy(false);
          return;
        }
      }
      setMontageExportStatus(statusText, hintText, { tone: warningBlock?.skippedEntries?.length ? "warning" : "success" });
      window.montageExportBusy = false;
      window.setTimelinePreviewsSuspended(false);
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
      setMontageExportBusy(false);
      return;
    }
  } catch (error) {
    if (String(window.montageExportJobState.jobId || "").trim() !== cleanJobId) return;
    const errorCode = String(error?.detail?.error || error?.error || error?.message || "").trim();
    const errorStatus = Number(error?.status || error?.detail?.status || 0) || 0;
    if (errorStatus === 404 && errorCode === "job_not_found") {
      clearMontageExportPolling();
      window.montageExportBusy = false;
      window.setTimelinePreviewsSuspended(false);
      setMontageExportBusy(false);
      setMontageExportProgress(null);
      setMontageExportStatus(
        "Se perdió el estado del export en el backend.",
        "El backend se reinició durante la exportación. Vuelve a exportar.",
        { tone: "error" }
      );
      setMontageExportContinueButton({ visible: false });
      return;
    }
    window.montageExportJobState.pollFailureCount = Math.max(0, Number(window.montageExportJobState.pollFailureCount || 0) || 0) + 1;
    const failureCount = window.montageExportJobState.pollFailureCount;
    const transientHint = failureCount > 1
      ? `Reconectando con el export… intento ${failureCount}.`
      : "Reconectando con el export…";
    logMontageExportDevtools("poll_failed", {
      failureCount,
      status: errorStatus || undefined,
      message: String(error?.message || error?.error || "").trim() || undefined
    }, "warn");
    if (failureCount >= 8) {
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
      setMontageExportContinueButton({ visible: true });
      return;
    }
    setMontageExportStatus(
      describeMontageExportStage(String(window.montageExportJobState.lastStage || "").trim(), window.montageExportState.exportMode),
      transientHint,
      { tone: "warning" }
    );
    window.montageExportJobState.pollTimer = window.setTimeout(() => {
      pollMontageExportJob(cleanJobId).catch(() => { });
    }, Math.min(8000, 2000 + (failureCount * 600)));
    return;
  }
  window.montageExportJobState.pollTimer = window.setTimeout(() => {
    pollMontageExportJob(cleanJobId).catch(() => { });
  }, 2000);
}

export async function continueMontageExportPolling() {
  const jobId = String(window.montageExportJobState.jobId || "").trim();
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
  window.montageExportBusy = true;
  window.setTimelinePreviewsSuspended(true);
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
  if (shouldSuspendMontagePreviewActivity()) return;
  const cleanRowId = String(rowId || "").trim();
  if (!cleanRowId || !window.els.montageExportModal || window.els.montageExportModal.hidden) return;
  const now = Date.now();
  if (window.montageExportPreviewState.loading) return;
  if ((now - Math.max(0, Number(window.montageExportPreviewState.lastJobPreviewAt || 0) || 0)) < 12000) return;
  const sameRow = cleanRowId === String(window.montageExportPreviewState.lastJobPreviewRowId || "").trim();
  if (sameRow) return;
  window.montageExportPreviewState.lastJobPreviewRowId = cleanRowId;
  window.montageExportPreviewState.lastJobPreviewAt = now;
  refreshMontageExportPreviewNow({
    previewRowId: cleanRowId,
    force: true,
    loadingMeta: totalScenes > 0 && sceneIndex > 0
      ? `Actualizando preview con la escena ${sceneIndex} de ${totalScenes}…`
      : "Actualizando preview de la escena en exportación…"
  }).catch(() => { });
}

function resolveMontageExportFrontendPreview(payload = {}, previewRowId = "") {
  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  if (!entries.length) return null;
  const cleanRowId = String(previewRowId || "").trim();
  const selected = entries.find((entry) => String(entry?.rowId || "").trim() === cleanRowId) || entries[0];
  if (!selected || typeof selected !== "object") return null;
  const video = selected?.video && typeof selected.video === "object" ? selected.video : null;
  const src = window.resolveStorageVideoUrl(String(video?.url || "").trim(), String(video?.storagePath || "").trim());
  if (!src) return null;
  const mediaKind = String(video?.mediaKind || video?.type || "").trim().toLowerCase();
  const mimeType = String(video?.mimeType || "").trim().toLowerCase();
  const isImage = mediaKind === "image" || mimeType.startsWith("image/");
  return {
    src,
    mediaType: isImage ? (mimeType || "image/png") : (mimeType || "video/mp4"),
    mediaScale: window.normalizeTimelineClipMediaScale?.(selected?.mediaScale) || 1,
    visualLayoutMode: String(selected?.visualLayoutMode || "default").trim() || "default",
    visualEffects: selected?.visualEffects || null,
    sceneIndex: Math.max(1, Number(selected?.sceneIndex || 1) || 1),
    rowId: String(selected?.rowId || "").trim()
  };
}

export async function refreshMontageExportPreviewNow(options = {}) {
  if (!window.els.montageExportModal || window.els.montageExportModal.hidden) return;
  if (shouldSuspendMontagePreviewActivity()) {
    setMontageExportPreviewState({
      loading: false,
      error: "",
      dataUrl: "",
      mediaType: "",
      mode: window.montageExportState.exportMode,
      sceneIndex: 0,
      disabled: true,
      meta: window.montageExportBusy
        ? "Preview pausado mientras se exporta el video."
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
  const payload = {
    ...prepared.payload,
    previewRowId
  };
  const frontendPreview = resolveMontageExportFrontendPreview(payload, previewRowId);
  if (frontendPreview?.src) {
    setMontageExportPreviewState({
      loading: false,
      error: "",
      dataUrl: frontendPreview.src,
      mediaType: frontendPreview.mediaType || "video/mp4",
      mode: payload.exportMode,
      sceneIndex: frontendPreview.sceneIndex || 0,
      meta: frontendPreview.sceneIndex
        ? `Escena ${frontendPreview.sceneIndex} de referencia (preview frontend${payload.reelModeEnabled === true ? " · Reel 9:16" : ""}).`
        : `Preview frontend de la exportación${payload.reelModeEnabled === true ? " · Reel 9:16" : ""}.`
    });
    const previewContainer = document.getElementById("montageExportPreviewContainer");
    window.applySceneMediaScaleToStage?.({
      rowId: frontendPreview.rowId,
      mediaScale: frontendPreview.mediaScale,
      visualLayoutMode: frontendPreview.visualLayoutMode,
      container: previewContainer
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
    setMontageExportPreviewState({
      loading: false,
      error: "",
      dataUrl: "",
      mediaType: "",
      mode: window.montageExportState.exportMode,
      sceneIndex: 0,
      disabled: true,
      meta: window.montageExportBusy
        ? "Preview pausado mientras se exporta el video."
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
  setMontageExportBusy(false);
  setMontageExportProgress(null);

  const session = window.getActiveSession();
  if (session && typeof window.exportPreviewController?.init === "function") {
    window.exportPreviewController.sync(session);
    window.exportPreviewController.seek(0);
  }
  setMontageExportStatus(
    "Listo. Presiona Exportar para generar tu video.",
    state.exportMode === "review"
      ? "Revisión crea un split-screen con video y ficha editorial por escena."
      : "Usa el timeline tal como está (escenas + audio).",
    { tone: "neutral" }
  );
  if (shouldDisableMontagePreviewInCurrentRuntime()) {
    setMontageExportPreviewState({
      loading: false,
      error: "",
      dataUrl: "",
      mediaType: "",
      mode: window.montageExportState.exportMode,
      sceneIndex: 0,
      disabled: true,
      meta: "Preview desactivado temporalmente para priorizar la exportación."
    });
  } else {
    scheduleMontageExportPreviewRefresh(60);
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
  const onScreenTextTimeline = window.buildMontageOnScreenTextSegments?.(activeSession, runtimeEntries) || {
    settings: null,
    segments: []
  };

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
            mimeType: videoMimeType,
            type: String(primarySegment?.type || clip?.type || (videoMimeType.startsWith("image/") ? "image" : "video")).trim().toLowerCase() || (videoMimeType.startsWith("image/") ? "image" : "video"),
            mediaKind: String(primarySegment?.type || clip?.type || (videoMimeType.startsWith("image/") ? "image" : "video")).trim().toLowerCase() || (videoMimeType.startsWith("image/") ? "image" : "video")
          },
          audio: useTimelineAudio
            ? null
            : (audioStoragePath || audioDownloadUrl) ? {
              storagePath: audioStoragePath || "",
              url: audioDownloadUrl || "",
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
    brandOverlay: buildMontageBrandOverlayForExport(reelModeEnabled)
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
  if (window.montageExportBusy) return;
  try {
    const previousJobId = String(window.montageExportJobState.jobId || "").trim();
    const session = window.getActiveSession?.() || null;
    const prepared = buildMontageExportPayload(session);
    logMontageExportDevtools("submit_clicked", {
      hasSession: Boolean(session),
      preparedOk: Boolean(prepared?.ok),
      entries: Array.isArray(prepared?.payload?.entries) ? prepared.payload.entries.length : 0,
      exportMode: String(window.montageExportState.exportMode || "").trim() || undefined
    });
    if (!prepared?.ok) {
      setMontageExportProgress(null);
      setMontageExportStatus(prepared?.error || "No pudimos preparar la exportación.", "Revisa que el timeline tenga clips válidos.", { tone: "error" });
      return;
    }
    window.setTimelinePreviewsSuspended?.(true);
    setMontageExportBusy(true);
    if (window.montageExportPreviewState?.debounceTimer) {
      window.clearTimeout(window.montageExportPreviewState.debounceTimer);
      window.montageExportPreviewState.debounceTimer = null;
    }
    setMontageExportPreviewState({
      loading: false,
      error: "",
      dataUrl: "",
      mediaType: "",
      mode: window.montageExportState.exportMode,
      sceneIndex: 0,
      disabled: true,
      meta: "Preview pausado mientras se exporta el video."
    });
    resetMontageExportJobState();
    setMontageExportContinueButton({ visible: false });
    setMontageExportProgress(0.08);
    setMontageExportStatus("Preparando exportación…", "Enviando job al backend.", { tone: "neutral" });
    const data = await authFetchJson("/api/podcaster/montage/export", {
      method: "POST",
      body: prepared.payload
    });
    const jobId = String(data?.jobId || "").trim();
    if (!jobId) throw new Error("montage_export_job_missing");
    window.montageExportJobState.jobId = jobId;
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
    const status = Number(apiPayload?.status || error?.status || 0) || 0;
    const code = String(apiPayload?.error || error?.error || error?.message || "").trim();
    try {
      console.error("[podcaster][montage-export] runMontageExport failed", error);
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
      hintParts.push("El servidor está ocupado con otra exportación.");
      hintParts.push(previousJobId
        ? "Usa \"Continuar exportación\" para retomar el job activo."
        : "Intenta de nuevo manualmente en unos segundos.");
      if (previousJobId) {
        window.montageExportJobState.jobId = previousJobId;
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
  isRenderBackedApiRuntime,
  shouldDisableMontagePreviewInCurrentRuntime,
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
