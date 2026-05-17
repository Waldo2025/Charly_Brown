/**
 * Podcaster Studio - Montage Export & Excel/File Utilities
 * Handles configurations, filenames, Excel review row builders, and download utilities.
 */

// --- Constants ---
const MONTAGE_EXPORT_STORAGE_KEY = "cb_podcast_montage_export_v1";

// --- Helpers & Configuration Normalization ---

function normalizeMontageExportSettings(raw = {}) {
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

function loadMontageExportSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(MONTAGE_EXPORT_STORAGE_KEY) || "{}");
    const normalized = normalizeMontageExportSettings(parsed || {});
    if (isLegacyAutoMontageFilename(normalized.filename)) normalized.filename = "";
    return normalized;
  } catch (_) {
    return normalizeMontageExportSettings({ filename: "" });
  }
}

function persistMontageExportSettings() {
  try {
    localStorage.setItem(MONTAGE_EXPORT_STORAGE_KEY, JSON.stringify(normalizeMontageExportSettings(window.montageExportState)));
  } catch (_) {
    // noop
  }
}

// --- States Initialization ---

let montageExportState = loadMontageExportSettings();
let montageExportBusy = false;

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
  logMontageExportDevtools
});
