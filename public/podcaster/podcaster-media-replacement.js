import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getFirestore, doc, updateDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { getStorage, ref, getMetadata } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js";
import { firebaseWebConfig } from "../js/firebase-web-config.js";
import { buildApiUrl, authFetchJson } from "../js/api-client-podcaster.js?v=2026-1.0.10.537";
import { uploadPodcasterAsset } from "./podcaster-resumable-upload.js?v=2026-10-01.scene-replacement-2";
import { requirePodcasterGenerationRuntime } from "./podcaster-runtime-registry.js";
import { normalizeAssetStoragePath } from "./podcaster-authorized-asset-resolver.js?v=2026-10-05.gs-path-normalize-1";
import { optimizeRasterImage } from "../js/escape-room-image-optimizer.mjs?v=2026-1.0.10.546";

function escapeHtml(unsafe = "") {
    return String(unsafe || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

const mediaCreationDates = new Map();
const mediaDateLabels = new WeakMap();
const mediaCreationDateFormatter = new Intl.DateTimeFormat("es-MX", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
});

function parseMediaCreationDate(value) {
    if (value == null || value === "") return null;
    const seconds = value?.seconds ?? value?._seconds;
    const date = typeof value?.toDate === "function" ? value.toDate()
        : new Date(seconds != null ? Number(seconds) * 1000 : value);
    return Number.isFinite(date.getTime()) ? date : null;
}

function renderMediaCreationDate(element, media = {}) {
    if (!element) return;
    const token = {};
    mediaDateLabels.set(element, token);
    const showDate = (date) => {
        if (mediaDateLabels.get(element) !== token) return;
        element.textContent = date ? mediaCreationDateFormatter.format(date) : "Fecha no disponible";
        element.title = date ? `Fecha de creación: ${mediaCreationDateFormatter.format(date)}` : "Fecha de creación no disponible";
    };
    const knownDate = parseMediaCreationDate(media.createdAt || media.timeCreated);
    if (knownDate) { showDate(knownDate); return; }
    const source = String(media.storagePath || media.path || media.downloadUrl || "").trim();
    if (!source || /^(blob:|data:)/i.test(source)) { showDate(null); return; }
    element.textContent = "Consultando fecha…";
    // Older list-videos APIs only return updatedAt. Read creation metadata once;
    // a later replacement/update date must not be presented as file creation.
    if (!mediaCreationDates.has(source)) {
        mediaCreationDates.set(source, Promise.resolve().then(() => getMetadata(ref(getStorage(getApp()), source)))
            .then(metadata => parseMediaCreationDate(metadata.timeCreated)).catch(() => null));
    }
    mediaCreationDates.get(source).then(date => {
        if (date) media.createdAt = date.toISOString();
        showDate(date);
    });
}

function replaceFileExtension(fileName = "", extension = "webp") {
    const safeName = String(fileName || "scene-media").trim() || "scene-media";
    const stem = safeName.replace(/\.[^.]+$/, "") || "scene-media";
    return `${stem}.${extension}`;
}

async function prepareSceneImageForUpload(file) {
    if (!(file instanceof Blob) || !String(file.type || "").toLowerCase().startsWith("image/")) return file;
    const result = await optimizeRasterImage(file, {
        targetWidth: 1280,
        forceReencode: true,
        outputMimeType: "image/webp",
        quality: 0.86
    });
    if (result.status !== "optimized") {
        const detail = result.reason === "unsupported-format"
            ? "Usa una imagen PNG, JPG o WebP."
            : `No se pudo procesar la imagen (${result.reason || "error desconocido"}).`;
        throw new Error(`La imagen no se subió. ${detail}`);
    }
    const cleanName = replaceFileExtension(file.name, result.extension || "webp");
    return new File([result.bytes], cleanName, {
        type: result.mimeType || "image/webp",
        lastModified: Number(file.lastModified || Date.now())
    });
}

async function uploadSceneReplacementAsset(file, options = {}) {
    try {
        return await uploadPodcasterAsset(file, options);
    } catch (error) {
        const sessionMissing = Number(error?.status || 0) === 404
            || /podcaster_session_not_found/.test(String(error?.message || ""));
        if (!sessionMissing) throw error;

        // A collaborator can open a locally hydrated shared session before its
        // cloud document is present. Persist it first so the upload endpoint can
        // authorize and place replacement images and stop-motion frames.
        const sessionId = String(options.sessionId || "").trim();
        if (!sessionId) throw error;
        const runtime = requirePodcasterGenerationRuntime();
        await runtime.saveSessionToCloud(sessionId, { render: false, silent: true });
        return uploadPodcasterAsset(file, options);
    }
}

let db;
let pond = null;
let currentEditingRowId = null;
let replacementModalRevision = 0;
let uploadedMediaUrl = null;
let uploadedStoragePath = null;
let uploadedMediaType = null;
let currentReplacementRequestMeta = { triggerSource: "unknown" };
let replacementImageMode = "single";
let stopMotionFrames = [];
let stopMotionSortable = null;
let stopMotionFrameSequence = 0;
let existingSingleMedia = null;
let stopMotionTimingMode = "fit-scene";
let stopMotionBeatPositions = [];
let stopMotionBeatAnalysisPending = false;
const STOP_MOTION_MAX_FRAMES = 60;
const SCENE_MEDIA_UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;

// La biblioteca se consulta al abrir el selector; si un video termina con el
// modal abierto hay que volver a consultarla sin cerrarlo.
const LIBRARY_RETRY_DELAYS_MS = [1200, 2500, 5000];
let selectorLibraryContext = { rowId: "", sessionSlug: "", revision: 0 };
let selectorGeneratedListenerAttached = false;

let els = {};

function getActivePodcasterSession() {
    return (typeof window.getActiveSession === "function"
        ? window.getActiveSession()
        : window.PodcasterState?.activeSession) || null;
}

function resolveStableReplacementMediaUrl(downloadUrl = "", storagePath = "") {
    const rawUrl = String(downloadUrl || "").trim();
    // `gs://<bucket>/<ruta>` es como llegan los archivos generados. La API de
    // assets lo recorta antes de firmar, y el controlador sólo autoriza URLs
    // cuyo storagePath empiece con `podcaster/sessions/`; dejar el esquema en
    // la URL persistida apaga esa autorización y produce 400/404 al cargar.
    const cleanStoragePath = normalizeAssetStoragePath(storagePath);
    if (rawUrl && !/^(?:blob|data):/i.test(rawUrl)) return rawUrl;
    if (!cleanStoragePath) return "";
    return buildApiUrl(`/api/assets/proxy-media?storagePath=${encodeURIComponent(cleanStoragePath)}`);
}

function resolveReplacementPreviewUrl(downloadUrl = "", storagePath = "") {
    const rawUrl = String(downloadUrl || "").trim();
    const cleanStoragePath = normalizeAssetStoragePath(storagePath);
    if (cleanStoragePath) {
        return buildApiUrl(`/api/assets/proxy-media?storagePath=${encodeURIComponent(cleanStoragePath)}`);
    }
    return rawUrl;
}

async function resolveAuthorizedReplacementPreviewUrl(previewUrl = "", mediaKind = "image") {
    const logicalUrl = String(previewUrl || "").trim();
    if (!logicalUrl || !/\/api\/assets\/proxy-(?:image|media)\?/i.test(logicalUrl)) return logicalUrl;
    const controller = window.playbackController;
    if (mediaKind === "image" && typeof controller?.resolveStageImageSource === "function") {
        return String(await controller.resolveStageImageSource(logicalUrl) || "").trim();
    }
    if (typeof controller?.getBlobUrl === "function") {
        return String(await controller.getBlobUrl(logicalUrl, { persistent: false }) || "").trim();
    }
    const parsed = new URL(logicalUrl, window.location.origin);
    const storagePath = String(parsed.searchParams.get("storagePath") || "").trim();
    if (!storagePath) return logicalUrl;
    const data = await authFetchJson(`/api/assets/signed-url?storagePath=${encodeURIComponent(storagePath)}`);
    return String(data?.url || "").trim();
}

function loadReplacementPreviewElement(element = null, previewUrl = "", mediaKind = "image") {
    if (!element) return;
    const logicalUrl = String(previewUrl || "").trim();
    if (!logicalUrl) {
        element.removeAttribute("src");
        return;
    }
    element.dataset.previewSrc = logicalUrl;
    element.removeAttribute("src");
    resolveAuthorizedReplacementPreviewUrl(logicalUrl, mediaKind).then((resolvedUrl) => {
        if (!resolvedUrl || element.dataset.previewSrc !== logicalUrl) return;
        element.src = resolvedUrl;
        if (mediaKind === "video") prepareSceneReplacementPreview(element);
    }).catch(() => {
        if (element.dataset.previewSrc === logicalUrl) element.removeAttribute("src");
    });
}

function getSceneReplacementPreviewVideos() {
    return Array.from(els.modal?.querySelectorAll?.(".scene-video-selector-card video") || []);
}

function pauseSceneReplacementPreview(videoEl = null, { keepFrame = true } = {}) {
    if (!(videoEl instanceof HTMLVideoElement)) return;
    videoEl.pause();
    videoEl.autoplay = false;
    if (!keepFrame) {
        try {
            videoEl.currentTime = 0;
        } catch (_) {
            // The media may not have metadata yet.
        }
    }
}

function stopSceneReplacementPreviews({ keepFrames = true } = {}) {
    getSceneReplacementPreviewVideos().forEach((videoEl) => {
        pauseSceneReplacementPreview(videoEl, { keepFrame: keepFrames });
    });
}

function prepareSceneReplacementPreview(videoEl = null) {
    if (!(videoEl instanceof HTMLVideoElement)) return;
    videoEl.muted = true;
    videoEl.defaultMuted = true;
    videoEl.volume = 0;
    videoEl.playsInline = true;
    videoEl.loop = true;
    const revealFirstFrame = () => {
        if (!Number.isFinite(Number(videoEl.duration)) || Number(videoEl.duration) <= 0.08) return;
        if (Number(videoEl.currentTime || 0) > 0.01) return;
        try {
            videoEl.currentTime = Math.min(0.15, Math.max(0.04, Number(videoEl.duration) / 20));
        } catch (_) {
            // Some browsers delay seeking until enough media data is buffered.
        }
    };
    if (videoEl.readyState >= HTMLMediaElement.HAVE_METADATA) {
        revealFirstFrame();
    } else {
        videoEl.addEventListener("loadedmetadata", revealFirstFrame, { once: true });
    }
}

function playSceneReplacementPreview(videoEl = null) {
    if (!(videoEl instanceof HTMLVideoElement)) return;
    getSceneReplacementPreviewVideos().forEach((candidate) => {
        if (candidate !== videoEl) pauseSceneReplacementPreview(candidate, { keepFrame: true });
    });
    prepareSceneReplacementPreview(videoEl);
    videoEl.autoplay = true;
    const playPromise = videoEl.play();
    if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {
            // Keep the decoded preview frame when autoplay is restricted.
        });
    }
}

function resolveSceneNumber(rowId = "", session = null) {
    const key = String(rowId || "").trim();
    const activeSession = session || getActivePodcasterSession();
    if (!key || typeof window.resolveSceneNumberByRowId !== "function") return 0;
    try {
        return Number(window.resolveSceneNumberByRowId(key, activeSession) || 0) || 0;
    } catch (_) {
        return 0;
    }
}

function collectSceneChipSnapshot(rowId = "") {
    const key = String(rowId || "").trim();
    if (!key) return { rowId: key, rowChips: [], timeline: null };
    const escapedRowId = typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(key) : key;
    const rowEl = document.querySelector(`.script-row[data-row-id="${escapedRowId}"]`);
    const rowChips = Array.from(rowEl?.querySelectorAll?.(".row-chip") || []).map((chip) => String(chip.textContent || "").trim()).filter(Boolean);
    const timelineClip = document.querySelector(`.podcast-video-timeline-clip[data-row-id="${escapedRowId}"]`);
    const timelineCard = document.querySelector(`.podcast-video-timeline-item[data-row-id="${escapedRowId}"] .podcast-video-scene-card`);
    return {
        rowId: key,
        rowChips,
        timeline: {
            clipFound: !!timelineClip,
            cardFound: !!timelineCard,
            clipClasses: timelineClip ? String(timelineClip.className || "").trim() : "",
            cardClasses: timelineCard ? String(timelineCard.className || "").trim() : "",
            clipTitle: timelineClip ? String(timelineClip.getAttribute("title") || "").trim() : "",
            cardTitle: timelineCard ? String(timelineCard.getAttribute("title") || "").trim() : ""
        }
    };
}

function buildSceneReplacementContext(rowId = "", extra = {}) {
    const key = String(rowId || "").trim();
    const session = extra.session || getActivePodcasterSession();
    const rows = Array.isArray(session?.script?.rows) ? session.script.rows : [];
    const row = rows.find((item) => String(item?.id || "").trim() === key) || null;
    return {
        rowId: key,
        sessionId: String(session?.id || "").trim(),
        sceneNumber: resolveSceneNumber(key, session),
        speaker: String(row?.speaker || "").trim(),
        currentVideoSrc: String(row?.videoSrc || "").trim(),
        currentMediaType: String(row?.mediaType || "").trim(),
        triggerSource: String(extra.triggerSource || currentReplacementRequestMeta?.triggerSource || "unknown").trim(),
        chip: collectSceneChipSnapshot(key)
    };
}

function logSceneReplacement(step = "", rowId = "", details = {}) {
    void step;
    void rowId;
    void details;
}

function initFirebase() {
    try {
        const app = !getApps().length ? initializeApp(firebaseWebConfig) : getApp();
        db = getFirestore();
    } catch (e) {
        void e;
    }
}

function initElements() {
    els = {
        modal: document.getElementById('podcastSceneVideoSelectorModal'),
        formatTab: document.getElementById('sceneReplacementFormatTab'),
        sourceTab: document.getElementById('sceneReplacementSourceTab'),
        formatPanel: document.getElementById('sceneReplacementFormatPanel'),
        sourcePanel: document.getElementById('sceneReplacementSourcePanel'),
        uploadTabBtn: document.getElementById('sceneVideoTabUploadBtn'),
        libraryTabBtn: document.getElementById('sceneVideoTabGeneratedBtn'),
        othersTabBtn: document.getElementById('sceneVideoTabOthersBtn'),
        uploadContainer: document.getElementById('sceneMediaUploadContainer'),
        uploadStatus: document.getElementById('sceneMediaUploadStatus'),
        uploadError: document.getElementById('sceneMediaUploadError'),
        videoUploadHelp: document.getElementById('sceneVideoUploadHelp'),
        referenceImageOptions: document.getElementById('sceneReferenceImageOptions'),
        referenceImageGrid: document.getElementById('sceneReferenceImageGrid'),
        libraryContainer: document.getElementById('sceneVideoSelectorLibraryContainer'),
        confirmBtn: document.getElementById('confirmSceneMediaReplacementBtn'),
        movementSettings: document.getElementById('image-movement-settings'),
        speedRange: document.getElementById('movement-speed-range'),
        speedLabel: document.getElementById('movement-speed-label'),
        stopMotionModeButtons: Array.from(document.querySelectorAll('[data-stop-motion-mode]')),
        stopMotionPanel: document.querySelector('.pme-stop-motion-panel'),
        stopMotionTray: document.querySelector('.pme-stop-motion-tray'),
        stopMotionEmpty: document.querySelector('.pme-stop-motion-empty'),
        stopMotionStats: document.querySelector('.pme-stop-motion-stats'),
        stopMotionSyncToMusic: document.getElementById("stopMotionSyncToMusic"),
        analyzeStopMotionMusicBtn: document.getElementById("analyzeStopMotionMusicBtn"),
        stopMotionMusicStatus: document.getElementById("stopMotionMusicStatus"),
        existingMediaSelection: document.getElementById("sceneExistingMediaSelection"),
        existingMediaPreview: document.getElementById("sceneExistingMediaPreview"),
        existingVideoPreview: document.getElementById("sceneExistingVideoPreview"),
        existingMediaLabel: document.getElementById("sceneExistingMediaLabel"),
        existingMediaName: document.getElementById("sceneExistingMediaName"),
        removeExistingMediaBtn: document.getElementById("removeSceneExistingMediaBtn"),
        // Stage elements
        podcastActiveSpeakerImage: document.getElementById('podcastActiveSpeakerImage'),
        podcastVideoStage: document.getElementById('podcastVideoStage'),
        sceneVideoSelectorGeneratedGrid: document.getElementById('sceneVideoSelectorGeneratedGrid'),
        sceneVideoSelectorOthersGrid: document.getElementById('sceneVideoSelectorOthersGrid')
    };
}

function isStopMotionMode() {
    return replacementImageMode === "stop-motion";
}

function isVideoReplacementMode() {
    return replacementImageMode === "video";
}

function setReplacementSectionTab(section = "format") {
    const showFormat = section !== "source";
    if (els.formatPanel) els.formatPanel.hidden = !showFormat;
    if (els.sourcePanel) els.sourcePanel.hidden = showFormat;
    [[els.formatTab, showFormat], [els.sourceTab, !showFormat]].forEach(([button, selected]) => {
        if (!button) return;
        button.classList.toggle("is-active", selected);
        button.setAttribute("aria-selected", String(selected));
        button.tabIndex = selected ? 0 : -1;
    });
}

function resolveSceneVideoFileKind(file = null) {
    const mimeType = String(file?.type || "").trim().toLowerCase();
    const fileName = String(file?.name || "").trim().toLowerCase();
    if (mimeType === "video/mp4" || mimeType === "application/mp4" || fileName.endsWith(".mp4")) return "mp4";
    if (mimeType === "video/quicktime" || fileName.endsWith(".mov")) return "mov";
    return "";
}

function isSupportedSceneVideoFile(file = null) {
    return Boolean(resolveSceneVideoFileKind(file));
}

function normalizeSceneVideoFileForUpload(file = null) {
    if (!(file instanceof Blob)) return file;
    const kind = resolveSceneVideoFileKind(file);
    if (!kind) return file;
    const expectedMimeType = kind === "mov" ? "video/quicktime" : "video/mp4";
    if (String(file.type || "").trim().toLowerCase() === expectedMimeType) return file;
    return new File([file], String(file?.name || `scene-video.${kind}`).trim(), {
        type: expectedMimeType,
        lastModified: Number(file?.lastModified || Date.now())
    });
}

function showSceneMediaUploadError(message = "") {
    if (!els.uploadError) return;
    const clean = String(message || "").trim();
    els.uploadError.textContent = clean;
    els.uploadError.hidden = !clean;
}

function showSceneMediaUploadStatus(message = "") {
    if (!els.uploadStatus) return;
    const clean = String(message || "").trim();
    els.uploadStatus.textContent = clean;
    els.uploadStatus.hidden = !clean;
}

function applyRequestHeaders(xhr, headers = {}) {
    if (headers && typeof headers.forEach === "function") {
        headers.forEach((value, name) => xhr.setRequestHeader(String(name), String(value)));
        return;
    }
    Object.entries(headers || {}).forEach(([name, value]) => {
        if (value !== undefined && value !== null) xhr.setRequestHeader(String(name), String(value));
    });
}

function uploadSceneMediaRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        let settled = false;
        const finishReject = (error) => {
            if (settled) return;
            settled = true;
            reject(error);
        };
        const finishResolve = (value) => {
            if (settled) return;
            settled = true;
            resolve(value);
        };
        xhr.open("POST", url, true);
        xhr.timeout = SCENE_MEDIA_UPLOAD_TIMEOUT_MS;
        applyRequestHeaders(xhr, options.headers);
        xhr.upload.onprogress = (event) => {
            const total = event.lengthComputable
                ? Number(event.total || 0)
                : Number(options.body?.size || 0);
            options.onProgress?.(Number(event.loaded || 0), total);
        };
        xhr.upload.onload = () => options.onUploadComplete?.();
        xhr.onload = () => {
            let data = {};
            try { data = xhr.responseText ? JSON.parse(xhr.responseText) : {}; } catch (_) { }
            finishResolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data });
        };
        xhr.onerror = () => {
            const error = new Error("No se pudo conectar con el servidor de carga.");
            error.code = "scene_media_network_error";
            finishReject(error);
        };
        xhr.ontimeout = () => {
            const error = new Error("La subida o conversión tardó demasiado. Intenta con un video más corto o conviértelo a MP4.");
            error.code = "scene_media_upload_timeout";
            finishReject(error);
        };
        xhr.onabort = () => {
            const error = new DOMException("Carga cancelada.", "AbortError");
            finishReject(error);
        };
        const signal = options.signal;
        const handleAbort = () => xhr.abort();
        if (signal?.aborted) {
            handleAbort();
            return;
        }
        signal?.addEventListener?.("abort", handleAbort, { once: true });
        xhr.onloadend = () => signal?.removeEventListener?.("abort", handleAbort);
        xhr.send(options.body);
    });
}

function releaseDetachedObjectUrl(url = "") {
    const cleanUrl = String(url || "").trim();
    if (!cleanUrl.startsWith("blob:")) return;
    const release = () => {
        try { URL.revokeObjectURL(cleanUrl); } catch (_) { }
    };
    if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(release);
    } else {
        setTimeout(release, 0);
    }
}

function resolveCurrentSceneDurationMs() {
    const session = getActivePodcasterSession();
    const key = String(currentEditingRowId || els.modal?.dataset?.rowId || "").trim();
    if (!session || !key) return 0;
    if (typeof window.buildTimelineRuntimeEntries === "function") {
        const entry = (window.buildTimelineRuntimeEntries(session) || [])
            .find((item) => String(item?.rowId || "").trim() === key);
        if (entry) {
            return Math.max(1, Number(entry.effectiveDurationMs || 0)
                || (Number(entry.endMs || 0) - Number(entry.startMs || 0))
                || 1);
        }
    }
    const clip = session?.podcastVideoConfig?.timelineClipsByRowId?.[key] || null;
    return Math.max(1, Number(clip?.trimOutMs || 0) - Number(clip?.trimInMs || 0) || Number(clip?.sourceDurationMs || 0) || 8000);
}

function resolveCurrentSceneRuntime() {
    const session = getActivePodcasterSession();
    const key = String(currentEditingRowId || els.modal?.dataset?.rowId || "").trim();
    const entries = typeof window.buildTimelineRuntimeEntries === "function"
        ? (window.buildTimelineRuntimeEntries(session) || [])
        : [];
    const entry = entries.find((item) => String(item?.rowId || "").trim() === key) || null;
    return {
        startMs: Math.max(0, Number(entry?.startMs || 0) || 0),
        durationMs: resolveCurrentSceneDurationMs()
    };
}

function updateStopMotionMusicControls(message = "") {
    const readyCount = getReadyStopMotionFrames().length;
    if (els.stopMotionSyncToMusic) els.stopMotionSyncToMusic.checked = stopMotionTimingMode === "music-beat";
    if (els.analyzeStopMotionMusicBtn) {
        els.analyzeStopMotionMusicBtn.disabled = readyCount < 2 || stopMotionBeatAnalysisPending;
        els.analyzeStopMotionMusicBtn.textContent = stopMotionBeatAnalysisPending ? "Analizando…" : "Analizar ritmo";
    }
    if (els.stopMotionMusicStatus) {
        els.stopMotionMusicStatus.textContent = String(message || (
            stopMotionTimingMode === "music-beat"
                ? (stopMotionBeatPositions.length === readyCount
                    ? `${Math.max(0, readyCount - 1)} cambios sincronizados con la música.`
                    : "Cambió la secuencia: vuelve a analizar el ritmo.")
                : "Distribución uniforme durante toda la escena."
        )).trim();
    }
}

async function resolveStopMotionBackgroundAudio() {
    const config = typeof window.getPanelMontageMusicConfig === "function"
        ? window.getPanelMontageMusicConfig()
        : null;
    if (!config || config.sourceType !== "track") {
        throw new Error("Agrega o selecciona una pista de música de fondo antes de analizar el ritmo.");
    }
    const scene = resolveCurrentSceneRuntime();
    const sourceItems = Array.isArray(config.sourceItems) ? config.sourceItems : [];
    const segment = sourceItems.find((item) => (
        Number(item?.startOffsetMs || 0) < scene.startMs + scene.durationMs
        && Number(item?.endOffsetMs || 0) > scene.startMs
        && item?.muted !== true
    )) || sourceItems.find((item) => item?.muted !== true) || null;
    const media = segment || config;
    const storagePath = normalizeAssetStoragePath(media?.storagePath);
    const directSource = String(
        media?.sourceUrl
        || media?.downloadUrl
        || media?.localDataUrl
        || (storagePath ? buildApiUrl(`/api/assets/proxy-media?storagePath=${encodeURIComponent(storagePath)}`) : "")
    ).trim();
    if (!directSource && !media?.localMediaCacheKey) {
        throw new Error("La pista de fondo no tiene una fuente accesible para analizar.");
    }
    const controller = window.playbackController;
    let resolvedSource = directSource;
    if (controller && typeof controller.resolveAudioSource === "function") {
        resolvedSource = String(await controller.resolveAudioSource({
            ...media,
            sourceUrl: directSource,
            localMediaCacheKey: String(media?.localMediaCacheKey || "").trim()
        }) || directSource).trim();
    }
    if (controller && typeof controller.getBlobUrl === "function" && resolvedSource) {
        resolvedSource = String(controller.getBlobUrlSync?.(resolvedSource) || await controller.getBlobUrl(resolvedSource) || resolvedSource).trim();
    }
    if (!resolvedSource) throw new Error("No se pudo abrir la pista de fondo.");
    const segmentStartMs = Math.max(0, Number(segment?.startOffsetMs || 0) || 0);
    const trimInMs = Math.max(0, Number(segment?.trimInMs || config?.trimInMs || 0) || 0);
    const rawTrimOutMs = Math.max(0, Number(segment?.trimOutMs || config?.trimOutMs || 0) || 0);
    return {
        source: resolvedSource,
        durationMs: scene.durationMs,
        startOffsetMs: trimInMs + Math.max(0, scene.startMs - segmentStartMs),
        loopStartMs: trimInMs,
        loopEndMs: rawTrimOutMs > trimInMs ? rawTrimOutMs : undefined
    };
}

async function analyzeStopMotionMusicRhythm() {
    const beatApi = window.PodcasterStopMotionBeats;
    const readyCount = getReadyStopMotionFrames().length;
    if (readyCount < 2) throw new Error("Agrega al menos dos imágenes antes de analizar el ritmo.");
    if (typeof beatApi?.analyzeAudioBuffer !== "function") throw new Error("El analizador de ritmo no está disponible.");
    stopMotionBeatAnalysisPending = true;
    updateStopMotionMusicControls("Cargando y analizando la música…");
    updateStopMotionConfirmState();
    let audioContext = null;
    try {
        const audio = await resolveStopMotionBackgroundAudio();
        const response = await fetch(audio.source);
        if (!response.ok) throw new Error(`No se pudo descargar la música (status ${response.status}).`);
        const bytes = await response.arrayBuffer();
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) throw new Error("Este navegador no permite analizar audio.");
        audioContext = new AudioContextClass();
        const buffer = await audioContext.decodeAudioData(bytes.slice(0));
        const result = beatApi.analyzeAudioBuffer(buffer, {
            durationMs: audio.durationMs,
            frameCount: readyCount,
            startOffsetMs: audio.startOffsetMs,
            loopStartMs: audio.loopStartMs,
            loopEndMs: audio.loopEndMs
        });
        if (!Array.isArray(result?.beatPositions) || result.beatPositions.length !== readyCount) {
            throw new Error("No se pudieron calcular suficientes cambios musicales.");
        }
        stopMotionTimingMode = "music-beat";
        stopMotionBeatPositions = result.beatPositions;
        updateStopMotionMusicControls(`${Math.max(0, result.peaksMs.length)} golpes detectados · ${readyCount - 1} cambios ajustados.`);
        renderStopMotionTray();
        return result;
    } finally {
        stopMotionBeatAnalysisPending = false;
        if (audioContext) audioContext.close().catch(() => {});
        updateStopMotionMusicControls();
        updateStopMotionConfirmState();
    }
}

function getReadyStopMotionFrames() {
    return stopMotionFrames.filter((frame) => frame?.status === "ready" && (frame.downloadUrl || frame.storagePath));
}

function normalizeStopMotionFramesForPersistence() {
    return getReadyStopMotionFrames().slice(0, STOP_MOTION_MAX_FRAMES).map((frame, index) => ({
        id: String(frame.id || `frame-${index + 1}`).trim(),
        order: index,
        name: String(frame.name || `Imagen ${index + 1}`).trim(),
        mimeType: String(frame.mimeType || "image/jpeg").trim().toLowerCase() || "image/jpeg",
        downloadUrl: String(frame.downloadUrl || "").trim(),
        storagePath: String(frame.storagePath || "").trim()
    }));
}

// Las duraciones relativas que el usuario ajustó en el chip viajan como peso por
// foto. Al reordenar en la charola el peso se mueve con su imagen, así confirmar
// el reemplazo no borra el ritmo editado a mano.
function normalizeStopMotionFrameWeightsForPersistence() {
    const weights = getReadyStopMotionFrames().slice(0, STOP_MOTION_MAX_FRAMES)
        .map((frame) => Number(frame?.weight));
    if (weights.length < 2 || !weights.every((weight) => Number.isFinite(weight) && weight > 0)) return null;
    const sum = weights.reduce((total, value) => total + value, 0);
    if (!(sum > 0)) return null;
    return weights.map((weight) => weight / sum);
}

function updateStopMotionConfirmState() {
    if (!els.confirmBtn || !isStopMotionMode()) return;
    const readyCount = getReadyStopMotionFrames().length;
    const hasPending = stopMotionFrames.some((frame) => frame?.status === "uploading");
    const hasError = stopMotionFrames.some((frame) => frame?.status === "error");
    els.confirmBtn.style.display = readyCount >= 2 ? "inline-block" : "none";
    const beatMapInvalid = stopMotionTimingMode === "music-beat" && stopMotionBeatPositions.length !== readyCount;
    els.confirmBtn.disabled = readyCount < 2 || hasPending || hasError || stopMotionBeatAnalysisPending || beatMapInvalid;
}

function renderStopMotionTray() {
    if (!els.stopMotionTray) return;
    const durationMs = resolveCurrentSceneDurationMs();
    const readyCount = getReadyStopMotionFrames().length;
    const intervalMs = readyCount ? durationMs / readyCount : 0;
    if (els.stopMotionStats) {
        els.stopMotionStats.textContent = readyCount
            ? stopMotionTimingMode === "music-beat" && stopMotionBeatPositions.length === readyCount
                ? `${readyCount} imágenes · ${(durationMs / 1000).toFixed(2)} s · sincronizadas con música`
                : `${readyCount} imágenes · ${(durationMs / 1000).toFixed(2)} s · cambio cada ${(intervalMs / 1000).toFixed(3)} s`
            : "0 imágenes";
    }
    if (els.stopMotionEmpty) els.stopMotionEmpty.hidden = stopMotionFrames.length > 0;
    els.stopMotionTray.innerHTML = stopMotionFrames.map((frame, index) => {
        const previewUrl = String(frame.previewUrl || resolveReplacementPreviewUrl(frame.downloadUrl, frame.storagePath) || "").trim();
        const statusLabel = frame.status === "uploading" ? "Subiendo…" : frame.status === "error" ? "Error" : `${index + 1}`;
        return `
          <article class="pme-stop-motion-frame${frame.status === "error" ? " is-error" : ""}" role="listitem" data-stop-motion-frame-id="${escapeHtml(frame.id)}">
            ${previewUrl ? `<img data-preview-src="${escapeHtml(previewUrl)}" alt="${escapeHtml(frame.name || `Imagen ${index + 1}`)}">` : '<div style="height:72px;background:#111827"></div>'}
            <span class="pme-stop-motion-frame-status">${escapeHtml(statusLabel)}</span>
            <div class="pme-stop-motion-frame-meta">
              <span class="pme-stop-motion-frame-name" title="${escapeHtml(frame.name || "")}">${escapeHtml(frame.name || `Imagen ${index + 1}`)}</span>
              <button class="pme-stop-motion-frame-remove" type="button" data-remove-stop-motion-frame="${escapeHtml(frame.id)}" aria-label="Quitar ${escapeHtml(frame.name || `imagen ${index + 1}`)}"><i class="fas fa-times" aria-hidden="true"></i></button>
            </div>
          </article>
        `;
    }).join("");
    els.stopMotionTray.querySelectorAll("[data-remove-stop-motion-frame]").forEach((button) => {
        button.addEventListener("click", (event) => {
            event.stopPropagation();
            const id = String(button.dataset.removeStopMotionFrame || "").trim();
            const frame = stopMotionFrames.find((item) => item.id === id);
            const detachedPreviewUrl = String(frame?.previewUrl || "").trim();
            stopMotionFrames = stopMotionFrames.filter((item) => item.id !== id);
            els.modal?.querySelectorAll?.(`[data-stop-motion-library-id="${CSS.escape(id)}"]`).forEach((card) => card.classList.remove("is-selected"));
            renderStopMotionTray();
            releaseDetachedObjectUrl(detachedPreviewUrl);
        });
    });
    els.stopMotionTray.querySelectorAll("img[data-preview-src]").forEach((imageEl) => {
        loadReplacementPreviewElement(imageEl, imageEl.dataset.previewSrc, "image");
    });
    updateStopMotionMusicControls();
    updateStopMotionConfirmState();
}

function initializeStopMotionSortable() {
    if (!els.stopMotionTray || stopMotionSortable || typeof Sortable === "undefined") return;
    stopMotionSortable = Sortable.create(els.stopMotionTray, {
        animation: 140,
        draggable: ".pme-stop-motion-frame",
        onEnd: ({ oldIndex, newIndex }) => {
            if (oldIndex == null || newIndex == null || oldIndex === newIndex) return;
            const [moved] = stopMotionFrames.splice(oldIndex, 1);
            if (moved) stopMotionFrames.splice(newIndex, 0, moved);
            renderStopMotionTray();
        }
    });
}

function resetStopMotionSelection() {
    const detachedPreviewUrls = stopMotionFrames.map((frame) => String(frame?.previewUrl || "").trim());
    stopMotionFrames = [];
    stopMotionTimingMode = "fit-scene";
    stopMotionBeatPositions = [];
    els.modal?.querySelectorAll?.(".scene-video-selector-card").forEach((card) => {
        card.classList.remove("is-selected");
        delete card.dataset.stopMotionLibraryId;
    });
    renderStopMotionTray();
    detachedPreviewUrls.forEach(releaseDetachedObjectUrl);
}

function normalizeExistingSceneMedia(rowId = "", session = null) {
    const key = String(rowId || "").trim();
    const activeSession = session || getActivePodcasterSession();
    const clip = resolvePersistedSceneClip(key, activeSession);
    if (!clip || typeof clip !== "object") return null;
    const downloadUrl = String(
        clip.downloadUrl
        || clip.videoDownloadUrl
        || clip.imageUrl
        || clip.dataUrl
        || clip.localDataUrl
        || ""
    ).trim();
    const storagePath = String(clip.storagePath || clip.videoStoragePath || clip.imageStoragePath || "").trim();
    if (!downloadUrl && !storagePath) return null;
    const mimeType = String(clip.mimeType || "").trim().toLowerCase();
    const isImage = clip.type === "image" || mimeType.startsWith("image/");
    return {
        id: String(clip.id || key).trim(),
        rowId: key,
        name: String(clip.name || clip.fileName || (isImage ? "Imagen actual" : "Video actual")).trim(),
        createdAt: clip.createdAt || clip.timeCreated || null,
        type: isImage ? "image" : "video",
        mimeType: mimeType || (isImage ? "image/webp" : "video/mp4"),
        downloadUrl,
        storagePath
    };
}

function getSceneReferenceImages(session, rowId) {
    const fromApi = window.PodcasterMediaReferenceApi?.getRowReferenceImageList?.(session, rowId);
    if (Array.isArray(fromApi)) return fromApi;
    const list = session?.rowReferenceImageListMap?.[rowId];
    return Array.isArray(list) && list.length ? list : session?.rowReferenceImageMap?.[rowId] ? [session.rowReferenceImageMap[rowId]] : [];
}

function renderSceneReferenceImages(rowId = "", session = null) {
    const container = els.referenceImageOptions;
    const grid = els.referenceImageGrid;
    if (!container || !grid) return;
    grid.replaceChildren();
    const references = getSceneReferenceImages(session || getActivePodcasterSession(), rowId);
    container.hidden = replacementImageMode !== "single" || !references.length;
    if (container.hidden) return;
    references.forEach((reference, index) => {
        const preview = String(window.PodcasterMediaReferenceApi?.resolveReferenceImagePreviewUrl?.(reference)
            || reference?.downloadUrl || reference?.dataUrl || "").trim();
        const card = document.createElement("div");
        card.className = "pme-reference-image-card";
        const image = document.createElement("img");
        image.alt = String(reference?.name || `Referencia ${index + 1}`);
        if (preview) loadReplacementPreviewElement(image, preview, "image");
        const info = document.createElement("div");
        info.className = "pme-reference-image-info";
        const name = document.createElement("strong");
        name.textContent = String(reference?.name || `Referencia ${index + 1}`);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "pme-btn pme-btn-ghost";
        button.textContent = "Usar como escena";
        button.addEventListener("click", async () => {
            const revision = replacementModalRevision;
            const sessionId = String(getActivePodcasterSession()?.id || "");
            button.disabled = true;
            try {
                await window.PodcasterMediaReferenceApi?.waitForRowReferenceUploads?.(rowId);
                await window.PodcasterMediaReferenceApi?.hydrateSessionReferenceMedia?.(getActivePodcasterSession());
                const latest = getActivePodcasterSession();
                if (revision !== replacementModalRevision || !latest || String(latest.id || "") !== sessionId || currentEditingRowId !== rowId) return;
                const currentReferences = getSceneReferenceImages(latest, rowId);
                const referenceKey = String(reference?.storagePath || reference?.downloadUrl || reference?.localMediaCacheKey || reference?.id || "");
                const selected = currentReferences.find(item => referenceKey && referenceKey === String(item?.storagePath || item?.downloadUrl || item?.localMediaCacheKey || item?.id || "")) || currentReferences[index];
                if (!selected) throw new Error("La imagen de referencia ya no está disponible.");
                if (typeof window.PodcasterSceneMedia?.applyReference !== "function") throw new Error("El editor de escenas aún no está listo.");
                const saved = await window.PodcasterSceneMedia.applyReference(latest, rowId, selected);
                if (saved?.status !== "applied") throw new Error("No se pudo guardar la imagen de referencia en la sesión.");
                window.PodcasterUI?.renderPodcastVideoTimeline?.(getActivePodcasterSession(), { force: true, reason: "structure" });
                document.getElementById("closeSceneVideoSelectorBtn")?.click();
            } catch (error) {
                alert(error?.message || "No se pudo usar la imagen de referencia.");
            } finally {
                button.disabled = false;
            }
        });
        info.append(name, button);
        card.append(image, info);
        grid.append(card);
    });
}

function renderExistingSingleMedia(media = existingSingleMedia) {
    const mediaType = String(media?.type || "").trim().toLowerCase();
    const isImage = mediaType === "image" || String(media?.mimeType || "").toLowerCase().startsWith("image/");
    const isVideo = mediaType === "video" || String(media?.mimeType || "").toLowerCase() === "video/mp4";
    const modeMatches = isVideoReplacementMode() ? isVideo : isImage;
    const isVisible = !isStopMotionMode() && modeMatches && (media?.downloadUrl || media?.storagePath);
    if (els.existingMediaSelection) els.existingMediaSelection.hidden = !isVisible;
    if (!isVisible) {
        if (els.existingMediaPreview) els.existingMediaPreview.removeAttribute("src");
        if (els.existingVideoPreview) {
            pauseSceneReplacementPreview(els.existingVideoPreview, { keepFrame: false });
            els.existingVideoPreview.removeAttribute("src");
            els.existingVideoPreview.style.display = "none";
        }
        if (els.existingMediaName) els.existingMediaName.textContent = "";
        return;
    }
    const previewUrl = resolveReplacementPreviewUrl(media.downloadUrl, media.storagePath);
    if (els.existingMediaPreview) {
        els.existingMediaPreview.style.display = isImage ? "block" : "none";
        if (isImage) loadReplacementPreviewElement(els.existingMediaPreview, previewUrl, "image");
        else els.existingMediaPreview.removeAttribute("src");
    }
    if (els.existingVideoPreview) {
        els.existingVideoPreview.style.display = isVideo ? "block" : "none";
        if (isVideo) {
            loadReplacementPreviewElement(els.existingVideoPreview, previewUrl, "video");
        } else {
            pauseSceneReplacementPreview(els.existingVideoPreview, { keepFrame: false });
            els.existingVideoPreview.removeAttribute("src");
        }
    }
    if (els.existingMediaLabel) els.existingMediaLabel.textContent = isVideo ? "Video MP4 actual" : "Imagen actual";
    renderMediaCreationDate(els.existingMediaName, media);
}

function hydrateExistingSingleMedia(rowId = "", session = null) {
    const media = normalizeExistingSceneMedia(rowId, session);
    if (!media) return false;
    existingSingleMedia = media;
    window._selectedLibraryVideo = { ...media };
    uploadedMediaUrl = null;
    uploadedStoragePath = null;
    uploadedMediaType = null;
    setReplacementImageMode(media.type === "video" ? "video" : "single");
    hydrateMovementControls(rowId, session);
    renderExistingSingleMedia(media);
    if (els.movementSettings) els.movementSettings.style.display = media.type === "image" ? "block" : "none";
    if (els.confirmBtn) {
        els.confirmBtn.disabled = false;
        els.confirmBtn.style.display = "inline-block";
    }
    return true;
}

function updateMovementSpeedLabel(value = 5) {
    const speed = Number(value) || 5;
    let label = "Normal";
    if (speed < 4) label = "Lento";
    if (speed > 7) label = "Rápido";
    if (els.speedLabel) els.speedLabel.textContent = label;
}

function hydrateMovementControls(rowId = "", session = null) {
    const key = String(rowId || "").trim();
    const activeSession = session || getActivePodcasterSession();
    const stored = activeSession?.visualEffectsMap?.[key] || {};
    const selectedEffects = new Set(
        Array.isArray(stored)
            ? stored.map(String)
            : (Array.isArray(stored?.effects) ? stored.effects.map(String) : [])
    );
    document.querySelectorAll(".movement-option").forEach((option) => {
        option.classList.toggle("is-selected", selectedEffects.has(String(option.dataset.effect || "")));
    });
    const speed = Math.min(10, Math.max(1, Number(stored?.speed) || 5));
    if (els.speedRange) els.speedRange.value = String(speed);
    updateMovementSpeedLabel(speed);
}

// El clip de una escena puede llegar en cualquiera de las formas de sesión que
// Snoopy y el reproductor ya aceptan. Leer sólo session.dialogueVideoMap dejaba
// el modal vacío al reabrir una secuencia que venía de la nube o de otro hilo.
function resolvePersistedSceneClip(rowId = "", session = null) {
    const key = String(rowId || "").trim();
    const activeSession = session || getActivePodcasterSession();
    if (!key || !activeSession) return null;
    return [
        activeSession?.dialogueVideoMap?.[key],
        activeSession?.session?.dialogueVideoMap?.[key],
        activeSession?.podcastStudioUiState?.dialogueVideosByRowId?.[key],
        activeSession?.script?.dialogueVideoMap?.[key]
    ].find((clip) => clip && typeof clip === "object") || null;
}

// La entrada de timeline es la misma fuente que pinta las divisiones del chip:
// si ahí se ve la secuencia, el modal también tiene que poder rehidratarla.
function resolvePersistedStopMotion(rowId = "", session = null) {
    const key = String(rowId || "").trim();
    const activeSession = session || getActivePodcasterSession();
    if (!key || !activeSession) return null;
    const normalize = window.PodcasterStopMotion?.normalizeStopMotion;
    const candidates = [
        activeSession?.dialogueVideoMap?.[key]?.stopMotion,
        activeSession?.session?.dialogueVideoMap?.[key]?.stopMotion,
        activeSession?.podcastStudioUiState?.dialogueVideosByRowId?.[key]?.stopMotion,
        activeSession?.script?.dialogueVideoMap?.[key]?.stopMotion
    ];
    const entries = typeof window.buildTimelineRuntimeEntries === "function"
        ? (window.buildTimelineRuntimeEntries(activeSession) || [])
        : [];
    const entry = entries.find((item) => String(item?.rowId || "").trim() === key) || null;
    if (entry) candidates.push(entry?.video?.stopMotion || entry?.stopMotion || entry?.clip?.stopMotion);
    const usable = candidates.filter(Boolean);
    if (typeof normalize === "function") {
        return usable.find((raw) => normalize(raw)) || null;
    }
    return usable[0] || null;
}

function hydrateExistingStopMotion(rowId = "", session = null) {
    const key = String(rowId || "").trim();
    const activeSession = session || getActivePodcasterSession();
    const persistedStopMotion = window.PodcasterStopMotion?.normalizeStopMotion?.(
        resolvePersistedStopMotion(key, activeSession)
    ) || null;
    const persistedFrames = persistedStopMotion?.frames || [];
    if (persistedFrames.length < 2) return false;

    existingSingleMedia = normalizeExistingSceneMedia(key, activeSession);
    const usedIds = new Set();
    stopMotionFrames = persistedFrames
        .slice()
        .sort((a, b) => (Number(a?.order) || 0) - (Number(b?.order) || 0))
        .slice(0, STOP_MOTION_MAX_FRAMES)
        .map((frame, index) => {
            const sourceId = String(frame?.id || `frame-${index + 1}`).trim() || `frame-${index + 1}`;
            let id = sourceId;
            while (usedIds.has(id)) id = `${sourceId}-${index + 1}`;
            usedIds.add(id);
            const downloadUrl = String(frame?.downloadUrl || "").trim();
            const storagePath = String(frame?.storagePath || "").trim();
            return {
                id,
                libraryKey: String(storagePath || downloadUrl || id).trim(),
                name: String(frame?.name || `Imagen ${index + 1}`).trim(),
                mimeType: String(frame?.mimeType || "image/webp").trim().toLowerCase(),
                downloadUrl,
                storagePath,
                ...(Number(persistedStopMotion?.frameWeights?.[index]) > 0
                    ? { weight: Number(persistedStopMotion.frameWeights[index]) }
                    : {}),
                previewUrl: resolveReplacementPreviewUrl(downloadUrl, storagePath),
                status: downloadUrl || storagePath ? "ready" : "error"
            };
        });
    stopMotionTimingMode = persistedStopMotion?.timingMode === "music-beat" ? "music-beat" : "fit-scene";
    stopMotionBeatPositions = stopMotionTimingMode === "music-beat"
        ? [...(persistedStopMotion?.beatPositions || [])]
        : [];
    setReplacementImageMode("stop-motion");
    hydrateMovementControls(key, activeSession);
    if (els.movementSettings) els.movementSettings.style.display = "block";
    renderStopMotionTray();
    return true;
}

function setReplacementImageMode(mode = "single") {
    const nextMode = mode === "stop-motion" ? "stop-motion" : (mode === "video" ? "video" : "single");
    const leavingStopMotion = replacementImageMode === "stop-motion" && nextMode !== "stop-motion";
    replacementImageMode = nextMode;
    if (leavingStopMotion && stopMotionFrames.length) {
        if (pond) pond.removeFiles();
        resetStopMotionSelection();
    }
    const active = isStopMotionMode();
    if (els.uploadContainer) {
        els.uploadContainer.style.display = "block";
        initFilePond();
    }
    els.stopMotionModeButtons?.forEach((button) => {
        const selected = String(button.dataset.stopMotionMode || "") === replacementImageMode;
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
    if (els.stopMotionPanel) els.stopMotionPanel.hidden = !active;
    if (pond) {
        pond.setOptions({
            allowMultiple: active,
            maxFiles: active ? STOP_MOTION_MAX_FRAMES : 1,
            maxParallelUploads: 1,
            acceptedFileTypes: active || nextMode === "single"
                ? ["image/*"]
                : ["video/mp4", "application/mp4", "video/quicktime"],
            labelIdle: nextMode === "video"
                ? 'Arrastra un MP4 o MOV, o <span class="filepond--label-action">elige desde tu dispositivo</span>'
                : 'Arrastra tus imágenes o <span class="filepond--label-action">elige desde tu dispositivo</span>'
        });
    }
    if (els.videoUploadHelp) els.videoUploadHelp.hidden = nextMode !== "video";
    renderSceneReferenceImages(currentEditingRowId, getActivePodcasterSession());
    showSceneMediaUploadError("");
    showSceneMediaUploadStatus("");
    if (active) {
        if (!stopMotionFrames.length && existingSingleMedia?.type === "image") {
            const downloadUrl = String(existingSingleMedia.downloadUrl || "").trim();
            const storagePath = String(existingSingleMedia.storagePath || "").trim();
            stopMotionFrames.push({
                id: String(existingSingleMedia.id || `existing-${Date.now()}`).trim(),
                libraryKey: String(storagePath || downloadUrl).trim(),
                name: String(existingSingleMedia.name || "Imagen actual").trim(),
                mimeType: String(existingSingleMedia.mimeType || "image/webp").trim().toLowerCase(),
                downloadUrl,
                storagePath,
                previewUrl: resolveReplacementPreviewUrl(downloadUrl, storagePath),
                status: downloadUrl || storagePath ? "ready" : "error"
            });
        }
        window._selectedLibraryVideo = null;
        uploadedMediaUrl = null;
        uploadedStoragePath = null;
        uploadedMediaType = null;
        if (els.movementSettings) els.movementSettings.style.display = "block";
        initializeStopMotionSortable();
        renderStopMotionTray();
        renderExistingSingleMedia();
    } else {
        const existingTypeMatches = existingSingleMedia
            && (nextMode === "video" ? existingSingleMedia.type === "video" : existingSingleMedia.type === "image");
        if (existingTypeMatches) {
            window._selectedLibraryVideo = { ...existingSingleMedia };
        } else {
            window._selectedLibraryVideo = null;
        }
        renderExistingSingleMedia();
        if (els.movementSettings) els.movementSettings.style.display = nextMode === "single" ? "block" : "none";
        if (els.confirmBtn) {
            els.confirmBtn.disabled = false;
            els.confirmBtn.style.display = existingTypeMatches ? "inline-block" : "none";
        }
    }
}

function addStopMotionLibraryFrame(media = null, card = null) {
    if (!isStopMotionMode() || !media) return false;
    const isImage = media.type === "image" || String(media.mimeType || "").startsWith("image/");
    if (!isImage) return false;
    const stableKey = String(media.storagePath || media.downloadUrl || media.id || "").trim();
    const existing = stopMotionFrames.find((frame) => frame.libraryKey === stableKey);
    if (existing) {
        stopMotionFrames = stopMotionFrames.filter((frame) => frame.id !== existing.id);
        card?.classList.remove("is-selected");
        if (card) delete card.dataset.stopMotionLibraryId;
        renderStopMotionTray();
        return true;
    }
    if (stopMotionFrames.length >= STOP_MOTION_MAX_FRAMES) {
        alert(`La secuencia admite un máximo de ${STOP_MOTION_MAX_FRAMES} imágenes.`);
        return true;
    }
    const id = `library-${Date.now()}-${++stopMotionFrameSequence}`;
    stopMotionFrames.push({
        id,
        libraryKey: stableKey,
        name: String(media.name || `Imagen ${stopMotionFrames.length + 1}`).trim(),
        mimeType: String(media.mimeType || "image/jpeg").trim().toLowerCase(),
        downloadUrl: String(media.downloadUrl || "").trim(),
        storagePath: String(media.storagePath || "").trim(),
        previewUrl: resolveReplacementPreviewUrl(media.downloadUrl, media.storagePath),
        status: "ready"
    });
    if (card) {
        card.classList.add("is-selected");
        card.dataset.stopMotionLibraryId = id;
    }
    renderStopMotionTray();
    return true;
}

const stageImagePreloadPromiseCache = new Map();
let stageImagePreviewRequestToken = 0;

function preloadStageImageSource(src = "", fallbackUrl = "") {
    const cleanSrc = String(src || "").trim();
    if (!cleanSrc) return Promise.resolve("");
    if (stageImagePreloadPromiseCache.has(cleanSrc)) return stageImagePreloadPromiseCache.get(cleanSrc);
    // console.log("[MediaReplacement] Preloading stage image:", cleanSrc);
    const task = new Promise((resolve) => {
        const probe = new Image();
        probe.crossOrigin = "anonymous";
        const cleanup = () => {
            probe.onload = null;
            probe.onerror = null;
        };
        probe.onload = () => {
            // console.log("[MediaReplacement] Preload success:", cleanSrc);
            cleanup();
            resolve(cleanSrc);
        };
        probe.onerror = (e) => {
            void e;
            cleanup();
            if (fallbackUrl && fallbackUrl !== cleanSrc) {
                // console.log("[MediaReplacement] Trying fallback URL:", fallbackUrl);
                preloadStageImageSource(fallbackUrl).then(resolve).catch(() => resolve(cleanSrc));
            } else {
                resolve(cleanSrc);
            }
        };
        probe.src = cleanSrc;
    });
    stageImagePreloadPromiseCache.set(cleanSrc, task);
    return task;
}

function ensureStageImagePreviewReady(src = "") {
    const cleanSrc = String(src || "").trim();
    if (!cleanSrc) return Promise.reject(new Error("missing_image_source"));
    const imageEl = els.podcastActiveSpeakerImage || null;
    if (!imageEl) return Promise.reject(new Error("missing_stage_image_element"));
    // console.log("[MediaReplacement] ensureStageImagePreviewReady start:", cleanSrc);
    imageEl.decoding = "async";
    const currentSrc = String(imageEl.getAttribute("src") || "").trim();
    if (currentSrc !== cleanSrc) {
        imageEl.src = cleanSrc;
    }
    imageEl.dataset.src = cleanSrc;
    if (imageEl.complete && Number(imageEl.naturalWidth || 0) > 0 && Number(imageEl.naturalHeight || 0) > 0) {
        // console.log("[MediaReplacement] Image already complete:", cleanSrc);
        return Promise.resolve(cleanSrc);
    }
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            imageEl.removeEventListener("load", handleLoad);
            imageEl.removeEventListener("error", handleError);
        };
        const handleLoad = () => {
            // console.log("[MediaReplacement] Image loaded via event:", cleanSrc);
            cleanup();
            resolve(cleanSrc);
        };
        const handleError = (e) => {
            console.error("[MediaReplacement] ensureStageImagePreviewReady error:", e, "Src:", cleanSrc);
            cleanup();
            reject(new Error("stage_image_element_load_failed"));
        };
        imageEl.addEventListener("load", handleLoad);
        imageEl.addEventListener("error", handleError);
    });
}

function showStageImagePreview(src = "", options = {}) {
    if (!els.podcastActiveSpeakerImage) return false;
    // console.log("[MediaReplacement] showStageImagePreview execution:", { src, currentSrc: els.podcastActiveSpeakerImage.src });

    els.podcastActiveSpeakerImage.style.opacity = "1";
    els.podcastActiveSpeakerImage.style.visibility = "visible";
    const cleanSrc = String(src || "").trim();

    // We assume getActiveSession and resolveSceneNumberByRowId are available globally or we use fallback
    const activeSession = options.session || (typeof window.getActiveSession === 'function' ? window.getActiveSession() : window.PodcasterState?.activeSession);
    const rowId = String(options.rowId || "").trim();
    const sceneNumber = (rowId && typeof window.resolveSceneNumberByRowId === 'function') ? window.resolveSceneNumberByRowId(rowId, activeSession) : 0;

    els.podcastActiveSpeakerImage.dataset.src = cleanSrc;
    els.podcastActiveSpeakerImage.alt = sceneNumber > 0 ? `Escena ${sceneNumber}` : "Escena";
    els.podcastActiveSpeakerImage.dataset.stageMode = "image";
    els.podcastActiveSpeakerImage.hidden = false;

    const preview = els.podcastVideoStage?.querySelector?.(".podcast-video-preview");
    if (preview) {
        const applyAspect = () => {
            const w = Number(els.podcastActiveSpeakerImage.naturalWidth || 0);
            const h = Number(els.podcastActiveSpeakerImage.naturalHeight || 0);
            if (w > 0 && h > 0) {
                preview.style.setProperty("--pod-stage-aspect", `${Math.round(w)} / ${Math.round(h)}`);
                preview.style.setProperty("--pod-stage-aspect-w", `${Math.round(w)}`);
                preview.style.setProperty("--pod-stage-aspect-h", `${Math.round(h)}`);
            }
        };
        applyAspect();
        els.podcastActiveSpeakerImage.addEventListener("load", applyAspect, { once: true });
    }
    return true;
}

function swapStageToImagePreview(src = "", options = {}) {
    const cleanSrc = String(src || "").trim();
    if (!cleanSrc) return false;
    const requestToken = ++stageImagePreviewRequestToken;
    logSceneReplacement("stage-image-preview:start", options.rowId, {
        src: cleanSrc,
        fallbackUrl: String(options.fallbackUrl || "").trim(),
        requestToken
    });
    const fallbackUrl = String(options.fallbackUrl || "").trim();

    preloadStageImageSource(cleanSrc, fallbackUrl).then(() => ensureStageImagePreviewReady(cleanSrc)).then(() => {
        if (requestToken !== stageImagePreviewRequestToken) return;
        if (!showStageImagePreview(cleanSrc, options)) return;
        logSceneReplacement("stage-image-preview:ready", options.rowId, {
            src: cleanSrc,
            requestToken
        });
        if (typeof options.afterSwap === "function") {
            options.afterSwap();
        }
    }).catch((err) => {
        console.error("[MediaReplacement] swapStageToImagePreview error:", err);
        if (requestToken !== stageImagePreviewRequestToken) return;
        if (typeof options.onError === "function") {
            options.onError();
        }
    });
    return true;
}

function registerPodcasterMediaReplacementApi() {
    window.PodcasterMediaReplacement = {
        ...(window.PodcasterMediaReplacement || {}),
        swapStageToImagePreview,
        onLibraryMediaSelected,
        openSceneVideoSelectorModal,
        refreshSceneVideoSelectorLibrary,
        stopLibraryPreviews: stopSceneReplacementPreviews,
        isStopMotionMode,
        addStopMotionLibraryFrame
    };
}

registerPodcasterMediaReplacementApi();

function initFilePond() {
    if (pond) return;
    if (typeof FilePond === 'undefined') {
        return;
    }

    if (typeof FilePondPluginImagePreview !== 'undefined') {
        FilePond.registerPlugin(FilePondPluginImagePreview);
    }

    const inputEl = document.getElementById('podcast-media-upload-input');
    if (!inputEl) return;

    pond = FilePond.create(inputEl, {
        allowMultiple: isStopMotionMode(),
        maxFiles: isStopMotionMode() ? STOP_MOTION_MAX_FRAMES : 1,
        maxParallelUploads: 1,
        name: 'filepond',
        labelIdle: 'Arrastra tus archivos o <span class="filepond--label-action">Explora</span>',
        acceptedFileTypes: isVideoReplacementMode()
            ? ['video/mp4', 'application/mp4', 'video/quicktime']
            : ['image/*'],
        labelFileProcessing: 'Subiendo',
        labelFileProcessingComplete: 'Listo',
        labelTapToCancel: 'toca para cancelar',
        labelTapToRetry: 'toca para reintentar',
        labelFileProcessingError: 'No se pudo subir el archivo',
        server: {
            process: (fieldName, file, metadata, load, error, progress, abort) => {
                const session = window.PodcasterState?.activeSession || {};
                const sessionId = session.id || 'unknown';
                const controller = new AbortController();
                let uploadCancelled = false;
                let stopMotionFrameId = "";
                showSceneMediaUploadError("");
                showSceneMediaUploadStatus("");
                if (isVideoReplacementMode() && !isSupportedSceneVideoFile(file)) {
                    const message = "Selecciona un video MP4 o MOV válido.";
                    showSceneMediaUploadError(message);
                    error(message);
                    return { abort: () => abort() };
                }
                if (!isVideoReplacementMode() && !String(file?.type || "").startsWith("image/")) {
                    const message = isStopMotionMode()
                        ? "El modo stop motion sólo acepta imágenes."
                        : "El modo Una imagen sólo acepta imágenes.";
                    showSceneMediaUploadError(message);
                    error(message);
                    return { abort: () => abort() };
                }
                if (isStopMotionMode()) {
                    const uploadKey = [
                        String(file?.name || "").trim(),
                        Number(file?.size || 0) || 0,
                        Number(file?.lastModified || 0) || 0
                    ].join(":");
                    const retryFrame = stopMotionFrames.find((frame) => frame.uploadKey === uploadKey && frame.status === "error");
                    if (!retryFrame && stopMotionFrames.length >= STOP_MOTION_MAX_FRAMES) {
                        error(`Máximo ${STOP_MOTION_MAX_FRAMES} imágenes.`);
                        return { abort: () => abort() };
                    }
                    if (retryFrame) {
                        stopMotionFrameId = retryFrame.id;
                        retryFrame.status = "uploading";
                    } else {
                        stopMotionFrameId = `upload-${Date.now()}-${++stopMotionFrameSequence}`;
                        let previewUrl = "";
                        try { previewUrl = URL.createObjectURL(file); } catch (_) { }
                        stopMotionFrames.push({
                            id: stopMotionFrameId,
                            uploadKey,
                            name: String(file?.name || `Imagen ${stopMotionFrames.length + 1}`).trim(),
                            mimeType: String(file?.type || "image/jpeg").trim().toLowerCase(),
                            downloadUrl: "",
                            storagePath: "",
                            previewUrl,
                            status: "uploading"
                        });
                    }
                    renderStopMotionTray();
                }
                progress(true, 0, file.size || 1);
                logSceneReplacement("upload:start", currentEditingRowId, {
                    fileName: String(file?.name || "").trim(),
                    fileType: String(file?.type || "").trim(),
                    fileSize: Number(file?.size || 0) || 0,
                    sessionId
                });

                (async () => {
                    try {
                        const normalizedInputFile = isVideoReplacementMode()
                            ? normalizeSceneVideoFileForUpload(file)
                            : file;
                        showSceneMediaUploadStatus(
                            String(normalizedInputFile?.type || "").startsWith("image/")
                                ? "Preparando imagen y eliminando metadatos…"
                                : "Preparando video…"
                        );
                        const uploadFile = await prepareSceneImageForUpload(normalizedInputFile);
                        const uploadSize = Number(uploadFile.size || 0) || 1;
                        progress(true, 0, uploadSize);
                        const isMovUpload = resolveSceneVideoFileKind(uploadFile) === "mov";
                        const uploadResult = await uploadSceneReplacementAsset(uploadFile, {
                            kind: String(uploadFile.type || "").startsWith("image/") ? "scene-image" : "scene-video",
                            sessionId: String(sessionId || "").trim(),
                            rowId: String(currentEditingRowId || "").trim(),
                            // En stop motion cada imagen es un recurso nuevo: la subida
                            // anterior no es su reemplazo y enviarla hacía borrar el archivo
                            // de otro frame, que luego responde 404 al cargar la escena.
                            previousStoragePath: isStopMotionMode() ? "" : String(uploadedStoragePath || "").trim(),
                            signal: controller.signal,
                            onProgress: (loaded, total) => {
                                const safeTotal = Math.max(1, Number(total || uploadSize));
                                const safeLoaded = Math.min(safeTotal, Math.max(0, Number(loaded || 0)));
                                const percent = Math.min(100, Math.round((safeLoaded / safeTotal) * 100));
                                progress(true, safeLoaded, safeTotal);
                                showSceneMediaUploadStatus(`Subiendo ${uploadFile.name || "archivo"}… ${percent}%`);
                            }
                        });
                        progress(true, uploadSize, uploadSize);
                        showSceneMediaUploadStatus(isMovUpload
                            ? "Archivo MOV guardado. Se conservará para el render compatible."
                            : "Archivo guardado en Cloud Storage.");
                        const media = uploadResult?.media && typeof uploadResult.media === "object" ? uploadResult.media : null;
                        if (!media?.downloadUrl) {
                            console.error("[MediaReplacement] Scene media upload response missing downloadUrl.", uploadResult);
                            throw new Error("Upload sin downloadUrl.");
                        }
                        uploadedMediaUrl = String(media.downloadUrl || "").trim();
                        uploadedStoragePath = String(media.storagePath || "").trim();
                        uploadedMediaType = String(media.type || (String(uploadFile.type || "").startsWith("image/") ? "image" : "video")).trim();
                        if (stopMotionFrameId) {
                            let detachedPreviewUrl = "";
                            stopMotionFrames = stopMotionFrames.map((frame) => (
                                frame.id === stopMotionFrameId
                                    ? (() => {
                                        detachedPreviewUrl = String(frame.previewUrl || "").trim();
                                        return {
                                            ...frame,
                                            name: String(uploadFile.name || frame.name || "").trim(),
                                            downloadUrl: uploadedMediaUrl,
                                            storagePath: uploadedStoragePath,
                                            previewUrl: resolveReplacementPreviewUrl(uploadedMediaUrl, uploadedStoragePath),
                                            mimeType: String(media.mimeType || uploadFile.type || frame.mimeType || "image/webp").trim().toLowerCase(),
                                            status: "ready"
                                        };
                                    })()
                                    : frame
                            ));
                            renderStopMotionTray();
                            releaseDetachedObjectUrl(detachedPreviewUrl);
                        } else {
                            const uploadedIsImage = String(uploadFile.type || "").startsWith("image/");
                            existingSingleMedia = {
                                id: String(media.id || currentEditingRowId || "").trim(),
                                rowId: String(currentEditingRowId || "").trim(),
                                name: String(uploadFile.name || (uploadedIsImage ? "Imagen actual" : "Video actual.mp4")).trim(),
                                type: uploadedIsImage ? "image" : "video",
                                mimeType: String(media.mimeType || uploadFile.type || (uploadedIsImage ? "image/webp" : "video/mp4")).trim().toLowerCase(),
                                downloadUrl: uploadedMediaUrl,
                                storagePath: uploadedStoragePath
                            };
                            renderExistingSingleMedia(existingSingleMedia);
                        }
                        logSceneReplacement("upload:success", currentEditingRowId, {
                            uploadedMediaUrl,
                            uploadedStoragePath,
                            uploadedMediaType
                        });
                        progress(true, uploadSize, uploadSize);
                        showSceneMediaUploadError("");
                        showSceneMediaUploadStatus(uploadResult?.media?.transcoded
                            ? "MOV convertido a MP4 y guardado correctamente."
                            : "Archivo guardado correctamente.");
                        load(uploadedMediaUrl);

                        if (uploadedMediaType === 'image' || uploadedMediaType.startsWith('image/')) {
                            if (els.movementSettings) els.movementSettings.style.display = 'block';
                        } else {
                            if (els.movementSettings) els.movementSettings.style.display = 'none';
                        }
                        if (els.confirmBtn && !isStopMotionMode()) els.confirmBtn.style.display = 'inline-block';
                    } catch (err) {
                        if (uploadCancelled || err?.name === "AbortError") return;
                        console.error("[MediaReplacement] Exception in FilePond upload process:", err);
                        showSceneMediaUploadStatus("");
                        showSceneMediaUploadError(err?.message || "No se pudo subir el archivo.");
                        // Las subidas van serializadas (maxParallelUploads: 1), así que estas
                        // variables describen el archivo que acaba de fallar. Dejarlas llenas
                        // hacía que Confirmar aplicara la subida anterior exitosa: el recurso
                        // ya no estaba en la escena y el guardado terminaba en
                        // "ruta de almacenamiento válida" o "archivo no está disponible".
                        uploadedMediaUrl = null;
                        uploadedStoragePath = null;
                        uploadedMediaType = null;
                        if (stopMotionFrameId) {
                            stopMotionFrames = stopMotionFrames.map((frame) => (
                                frame.id === stopMotionFrameId ? { ...frame, status: "error" } : frame
                            ));
                            renderStopMotionTray();
                        }
                        error(err?.message || 'Upload failed');
                    }
                })();

                return {
                    abort: () => {
                        uploadCancelled = true;
                        controller.abort();
                        showSceneMediaUploadStatus("");
                        showSceneMediaUploadError("");
                        if (stopMotionFrameId) {
                            stopMotionFrames = stopMotionFrames.map((frame) => (
                                frame.id === stopMotionFrameId ? { ...frame, status: "error" } : frame
                            ));
                            renderStopMotionTray();
                        }
                        abort();
                    }
                };
            }
        }
    });
}

function initMovementOptions() {
    const options = document.querySelectorAll('.movement-option');
    options.forEach(opt => {
        opt.addEventListener('click', () => {
            opt.classList.toggle('is-selected');
        });
    });

    if (els.speedRange) {
        els.speedRange.addEventListener('input', (e) => {
            updateMovementSpeedLabel(parseInt(e.target.value));
        });
    }
}

function getSelectedEffects() {
    const selected = [];
    document.querySelectorAll('.movement-option.is-selected').forEach(opt => {
        selected.push(opt.dataset.effect);
    });
    return {
        effects: selected,
        speed: els.speedRange ? parseInt(els.speedRange.value) : 5
    };
}

function setupEventListeners() {
    if (!els.uploadTabBtn || !els.confirmBtn) return;

    els.formatTab?.addEventListener("click", () => setReplacementSectionTab("format"));
    els.sourceTab?.addEventListener("click", () => {
        if (els.uploadTabBtn?.classList.contains("is-active")) els.libraryTabBtn?.click();
        setReplacementSectionTab("source");
    });
    [els.formatTab, els.sourceTab].filter(Boolean).forEach((tab) => {
        tab.addEventListener("keydown", (event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            const next = tab === els.formatTab ? els.sourceTab : els.formatTab;
            next?.click();
            next?.focus();
        });
    });


    els.stopMotionModeButtons?.forEach((button) => {
        button.addEventListener("click", () => {
            setReplacementImageMode(button.dataset.stopMotionMode);
        });
    });
    els.stopMotionSyncToMusic?.addEventListener("change", () => {
        if (!els.stopMotionSyncToMusic.checked) {
            stopMotionTimingMode = "fit-scene";
            stopMotionBeatPositions = [];
            renderStopMotionTray();
            return;
        }
        analyzeStopMotionMusicRhythm().catch((error) => {
            stopMotionTimingMode = "fit-scene";
            stopMotionBeatPositions = [];
            if (els.stopMotionSyncToMusic) els.stopMotionSyncToMusic.checked = false;
            updateStopMotionMusicControls(error?.message || "No se pudo analizar la música.");
        });
    });
    els.analyzeStopMotionMusicBtn?.addEventListener("click", () => {
        analyzeStopMotionMusicRhythm().catch((error) => {
            updateStopMotionMusicControls(error?.message || "No se pudo analizar la música.");
        });
    });
    els.removeExistingMediaBtn?.addEventListener("click", () => {
        existingSingleMedia = null;
        window._selectedLibraryVideo = null;
        uploadedMediaUrl = null;
        uploadedStoragePath = null;
        uploadedMediaType = null;
        els.modal?.querySelectorAll?.(".scene-video-selector-card.is-selected").forEach((card) => card.classList.remove("is-selected"));
        renderExistingSingleMedia();
        if (els.confirmBtn) els.confirmBtn.style.display = "none";
        if (els.movementSettings) els.movementSettings.style.display = isVideoReplacementMode() ? "none" : "block";
    });
    [
        document.getElementById("closeSceneVideoSelectorBtn"),
        document.getElementById("cancelSceneVideoSelectorBtn")
    ].filter(Boolean).forEach((button) => {
        button.addEventListener("click", () => {
            if (pond) pond.removeFiles();
            resetStopMotionSelection();
            setReplacementImageMode("single");
        });
    });

    // Modal Tabs
    els.uploadTabBtn.addEventListener('click', () => {
        els.uploadTabBtn.classList.add('is-active');
        els.uploadTabBtn.setAttribute('aria-selected', 'true');

        if (els.libraryTabBtn) {
            els.libraryTabBtn.classList.remove('is-active');
            els.libraryTabBtn.setAttribute('aria-selected', 'false');
        }
        if (els.othersTabBtn) {
            els.othersTabBtn.classList.remove('is-active');
            els.othersTabBtn.setAttribute('aria-selected', 'false');
        }

        els.uploadContainer.style.display = 'block';
        els.libraryContainer.style.display = 'none';
        initFilePond();
        setReplacementSectionTab("format");
    });

    const deactivateUploadTab = () => {
        els.uploadTabBtn.classList.remove('is-active');
        els.uploadTabBtn.setAttribute('aria-selected', 'false');
        els.uploadContainer.style.display = 'block';
        els.libraryContainer.style.display = 'block';
    };

    if (els.libraryTabBtn) {
        els.libraryTabBtn.addEventListener('click', deactivateUploadTab);
    }
    if (els.othersTabBtn) {
        els.othersTabBtn.addEventListener('click', deactivateUploadTab);
    }

    // Replacement logic
    els.confirmBtn.addEventListener('click', async () => {
        currentEditingRowId = String(els.modal?.dataset?.rowId || currentEditingRowId || '').trim();
        const stopMotionFrameRecords = isStopMotionMode() ? normalizeStopMotionFramesForPersistence() : [];
        if (isStopMotionMode() && stopMotionFrameRecords.length < 2) {
            alert("Selecciona al menos dos imágenes para crear el stop motion.");
            return;
        }
        if (isStopMotionMode() && stopMotionFrames.some((frame) => frame.status !== "ready")) {
            alert("Espera a que todas las imágenes terminen de subir o elimina las que tienen error.");
            return;
        }
        if (isStopMotionMode() && stopMotionTimingMode === "music-beat" && stopMotionBeatPositions.length !== stopMotionFrameRecords.length) {
            alert("La cantidad de imágenes cambió. Analiza nuevamente el ritmo antes de confirmar.");
            return;
        }
        const selectedLibrary = window._selectedLibraryVideo;
        const firstStopMotionFrame = stopMotionFrameRecords[0] || null;
        const finalStoragePath = normalizeAssetStoragePath(
            firstStopMotionFrame?.storagePath || uploadedStoragePath || selectedLibrary?.storagePath
        );
        const mediaUrl = resolveStableReplacementMediaUrl(
            firstStopMotionFrame?.downloadUrl || uploadedMediaUrl || selectedLibrary?.downloadUrl,
            finalStoragePath
        );
        let mediaType = firstStopMotionFrame ? "image" : (uploadedMediaType || selectedLibrary?.type || 'video');

        const isUrlImage = /\.(jpg|jpeg|png|webp|gif)(\?|$|\s)/i.test(mediaUrl);
        if (isUrlImage && mediaType === 'video') {
            // console.log("[MediaReplacement] Correcting mediaType to image based on URL");
            mediaType = 'image';
        }
        logSceneReplacement("confirm:start", currentEditingRowId, {
            selectedLibrary,
            mediaUrl,
            mediaType,
            uploadedMediaUrl,
            uploadedStoragePath,
            uploadedMediaType
        });

        if (!currentEditingRowId) {
            alert("La escena cambió mientras preparabas el archivo. Abre nuevamente el selector para aplicar el recurso.");
            return;
        }
        if (!mediaUrl) {
            alert("El archivo no terminó de subirse. Reintenta la subida antes de confirmar el reemplazo.");
            return;
        }
        // commitSceneMediaSelection hidrata el recurso desde Storage antes de
        // escribir la selección: sin ruta de objeto ni URL http no hay nada que
        // verificar y la transacción fallaría a la mitad.
        if (!finalStoragePath && !/^https?:/i.test(mediaUrl)) {
            alert("El archivo no quedó guardado en la nube. Vuelve a subirlo y luego confirma el reemplazo.");
            return;
        }

        const session = window.PodcasterState?.activeSession;
        if (!session) {
            console.error("[MediaReplacement] No active session found");
            return;
        }

        const effects = getSelectedEffects();
        // console.log("[MediaReplacement] Effects:", effects);

        const targetRowId = currentEditingRowId;
        const targetModalRevision = replacementModalRevision;
        const context = window.PodcasterSceneMedia.capture(session, targetRowId);
        context.effects = effects;
        // El reemplazo manual siempre es la intención más nueva del usuario: el
        // archivo se subió en este momento. Autoriza a adoptar la revisión remota
        // si la copia local y la de la nube divergieron para esta escena.
        context.manualReplacement = true;
        try {
            const isImageMedia = mediaType === 'image' || mediaType.startsWith('image/');
            const mediaData = {
                id: targetRowId,
                rowId: targetRowId,
                downloadUrl: mediaUrl,
                storagePath: finalStoragePath,
                mimeType: firstStopMotionFrame?.mimeType || selectedLibrary?.mimeType || (isImageMedia ? 'image/jpeg' : 'video/mp4'),
                type: mediaType,
                sourceType: 'manual-replacement',
                createdAt: selectedLibrary?.createdAt || null,
                manuallyReplaced: true,
                updatedAt: new Date().toISOString(),
                model: mediaType === 'video' ? 'veo' : null,
                segments: null,
                variants: null
            };
            if (stopMotionFrameRecords.length >= 2) {
                const frameWeights = normalizeStopMotionFrameWeightsForPersistence();
                mediaData.stopMotion = {
                    version: 1,
                    timingMode: stopMotionTimingMode,
                    ...(stopMotionTimingMode === "music-beat" ? {
                        beatPositions: stopMotionBeatPositions,
                        beatAnalysisVersion: 1
                    } : {}),
                    ...(frameWeights ? { frameWeights } : {}),
                    frames: stopMotionFrameRecords
                };
            }
            const application = await window.PodcasterSceneMedia.apply(context, mediaData);
            if (application.status !== "applied") throw new Error(application.reason === "selection-changed"
                ? "Otra edición cambió esta escena mientras se aplicaba el reemplazo. Vuelve a abrir el selector y confirma de nuevo."
                : "La escena o su versión ya no está disponible. El archivo creado sigue en la biblioteca.");
            if (replacementModalRevision !== targetModalRevision || currentEditingRowId !== targetRowId || window.PodcasterState?.activeSession?.id !== session.id) return;
            // Cleanup
            window._selectedLibraryVideo = null;
            existingSingleMedia = null;
            uploadedMediaUrl = null;
            uploadedStoragePath = null;
            uploadedMediaType = null;
            if (pond) pond.removeFiles();
            resetStopMotionSelection();
            setReplacementImageMode("single");
            renderExistingSingleMedia();
            currentEditingRowId = "";
            if (els.modal) delete els.modal.dataset.rowId;
            stopSceneReplacementPreviews({ keepFrames: true });
            els.modal.hidden = true;
            currentReplacementRequestMeta = { triggerSource: "unknown" };

        } catch (err) {
            console.error('[MediaReplacement] Error saving replacement:', err);
            alert(err.message || 'Error al guardar el reemplazo.');
        }
    });

    document.addEventListener('podcaster:scene-media-selector-open', (event) => {
        replacementModalRevision += 1;
        currentEditingRowId = String(event?.detail?.rowId || '').trim();
        currentReplacementRequestMeta = {
            triggerSource: String(event?.detail?.triggerSource || currentReplacementRequestMeta?.triggerSource || "unknown").trim()
        };
        logSceneReplacement("modal:open", currentEditingRowId, {
            triggerSource: currentReplacementRequestMeta.triggerSource
        });
        window._selectedLibraryVideo = null;
        existingSingleMedia = null;
        uploadedMediaUrl = null;
        uploadedStoragePath = null;
        uploadedMediaType = null;
        if (pond) pond.removeFiles();
        resetStopMotionSelection();
        setReplacementImageMode("single");
        setReplacementSectionTab("format");
        if (els.modal && currentEditingRowId) {
            els.modal.dataset.rowId = currentEditingRowId;
        }
        const session = getActivePodcasterSession();
        renderSceneReferenceImages(currentEditingRowId, session);
        const openedRevision = replacementModalRevision;
        Promise.resolve(window.PodcasterMediaReferenceApi?.hydrateSessionReferenceMedia?.(session)).then(() => {
            if (openedRevision === replacementModalRevision && currentEditingRowId) {
                renderSceneReferenceImages(currentEditingRowId, getActivePodcasterSession());
            }
        }).catch(() => {});
        const restoredStopMotion = hydrateExistingStopMotion(currentEditingRowId, session);
        const restoredSingleMedia = !restoredStopMotion && hydrateExistingSingleMedia(currentEditingRowId, session);
        if (!restoredStopMotion && !restoredSingleMedia) {
            hydrateMovementControls(currentEditingRowId, session);
            if (els.confirmBtn) els.confirmBtn.style.display = 'none';
            if (els.movementSettings) els.movementSettings.style.display = 'block';
        }
        if (restoredStopMotion) {
            // La charola rehidratada vive en "Formato de escena": sin esto el modal
            // quedaba en la pestaña de biblioteca y las fotos ya subidas no se veían.
            setReplacementSectionTab("format");
            els.stopMotionPanel?.scrollIntoView?.({ block: "nearest" });
            return;
        }
        els.libraryTabBtn?.click();
    });
}

function onLibraryMediaSelected(media = null) {
    if (!media) return;
    const isImage = media.type === 'image' || String(media.mimeType || '').startsWith('image/');
    logSceneReplacement("library-media:selected", currentEditingRowId, {
        isImage,
        media
    });

    existingSingleMedia = { ...media, type: isImage ? "image" : "video" };
    setReplacementImageMode(isImage ? "single" : "video");
    renderExistingSingleMedia(existingSingleMedia);
    if (els.movementSettings) els.movementSettings.style.display = isImage ? 'block' : 'none';
    if (isImage) setReplacementSectionTab("format");

    if (els.confirmBtn && !isStopMotionMode()) els.confirmBtn.style.display = 'inline-block';
}

async function openSceneVideoSelectorModal(rowId = "", options = {}) {
  // Use global fallback for session
  const session = getActivePodcasterSession();
  const key = String(rowId || "").trim();
  if (!session || !key) return;
  if (!els.modal) {
    initElements();
  }
  const sessionSlug = String(session.slug || session.id || "").trim();
  currentReplacementRequestMeta = {
    triggerSource: String(options?.triggerSource || "unknown").trim() || "unknown"
  };
  logSceneReplacement("open-selector:start", key, {
    triggerSource: currentReplacementRequestMeta.triggerSource,
    sessionSlug
  });

  if (els.modal) {
    els.modal.hidden = false;
    els.modal.dataset.rowId = key;
  }
  window._selectedLibraryVideo = null;
  document.dispatchEvent(new CustomEvent("podcaster:scene-media-selector-open", {
    detail: { rowId: key, triggerSource: currentReplacementRequestMeta.triggerSource }
  }));
  const setSceneVideoTab = (tab = "generated") => {
    const showGenerated = tab !== "others";
    if (els.sceneVideoSelectorGeneratedGrid) els.sceneVideoSelectorGeneratedGrid.hidden = !showGenerated;
    if (els.sceneVideoSelectorOthersGrid) els.sceneVideoSelectorOthersGrid.hidden = showGenerated;
    if (els.libraryTabBtn) {
      els.libraryTabBtn.classList.toggle("is-active", showGenerated);
      els.libraryTabBtn.setAttribute("aria-selected", showGenerated ? "true" : "false");
    }
    if (els.othersTabBtn) {
      els.othersTabBtn.classList.toggle("is-active", !showGenerated);
      els.othersTabBtn.setAttribute("aria-selected", showGenerated ? "false" : "true");
    }
  };
  setSceneVideoTab("generated");
  if (!sessionSlug) {
    if (els.sceneVideoSelectorGeneratedGrid) {
      els.sceneVideoSelectorGeneratedGrid.innerHTML = '<div style="text-align: center; grid-column: 1 / -1; padding: 2rem;">No se encontró el identificador de la sesión para buscar videos.</div>';
    }
    return;
  }

  selectorLibraryContext = { rowId: key, sessionSlug, revision: replacementModalRevision };
  attachSceneVideoGeneratedListener();
  await refreshSceneVideoSelectorLibrary({ rowId: key, sessionSlug });
}

/**
 * Vuelve a consultar la biblioteca de la sesión. Se usa al abrir el modal y también
 * cuando Snoopy termina una escena con el modal ya abierto, para no obligar a
 * cerrarlo y volverlo a abrir.
 */
async function refreshSceneVideoSelectorLibrary({ rowId = "", sessionSlug = "", expectedStoragePath = "", spinner = true } = {}) {
  const key = String(rowId || selectorLibraryContext.rowId || "").trim();
  const slug = String(sessionSlug || selectorLibraryContext.sessionSlug || "").trim();
  if (!key || !slug) return { ok: false, totalVideos: 0, rowVideos: 0, expectedFound: false };
  const revision = selectorLibraryContext.revision;
  // Un refresco tardío no debe pintar un modal ya cerrado o de otra escena.
  const isCurrentView = () => revision === replacementModalRevision
    && selectorLibraryContext.rowId === key
    && selectorLibraryContext.sessionSlug === slug
    && els.modal?.hidden !== true
    && String(els.modal?.dataset?.rowId || "").trim() === key;
  const emptyResult = { ok: false, totalVideos: 0, rowVideos: 0, expectedFound: false };
  if (spinner && els.sceneVideoSelectorGeneratedGrid) {
    els.sceneVideoSelectorGeneratedGrid.innerHTML = '<div style="text-align: center; grid-column: 1 / -1; padding: 2rem;"><i class="fas fa-spinner fa-spin"></i> Buscando videos de esta sesión...</div>';
  }
  if (spinner && els.sceneVideoSelectorOthersGrid) {
    els.sceneVideoSelectorOthersGrid.innerHTML = '<div style="text-align: center; grid-column: 1 / -1; padding: 2rem;"><i class="fas fa-spinner fa-spin"></i> Buscando videos de esta sesión...</div>';
  }
  let data = { videos: [] };
  const maxAttempts = expectedStoragePath ? LIBRARY_RETRY_DELAYS_MS.length + 1 : 1;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    data = await authFetchJson(`/api/podcaster/sessions/list-videos?sessionSlug=${encodeURIComponent(slug)}`)
      .catch((error) => ({ videos: [], fetchError: error }));
    const alreadyIndexed = expectedStoragePath
      && (Array.isArray(data?.videos) ? data.videos : [])
        .some((item) => String(item?.storagePath || item?.path || "").trim() === expectedStoragePath);
    if (alreadyIndexed || attempt >= maxAttempts - 1) break;
    // Storage tarda algo en indexar el clip que el motor local acaba de subir.
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, LIBRARY_RETRY_DELAYS_MS[attempt]));
    if (!isCurrentView()) return { ...emptyResult, stale: true };
  }
  if (!isCurrentView()) return { ...emptyResult, stale: true };
  const session = getActivePodcasterSession();

  try {
    const rawVideos = Array.isArray(data?.videos) ? data.videos : (Array.isArray(data) ? data : []);
    const currentSceneVideo = normalizeExistingSceneMedia(key, session);
    const videoCandidates = currentSceneVideo?.type === "video"
      ? [currentSceneVideo, ...rawVideos]
      : rawVideos;
    const seenVideoKeys = new Set();
    const allVideos = videoCandidates.filter((v) => {
      const path = String(v?.storagePath || v?.path || "").toLowerCase();
      const mime = String(v?.mimeType || v?.type || "").toLowerCase();
      if (path.includes("/references/") || path.includes("/reference/")) return false;
      if (mime.startsWith("image/") && !mime.startsWith("video/")) return false;
      const identity = String(v?.storagePath || v?.path || v?.downloadUrl || v?.videoDownloadUrl || v?.url || "").trim();
      if (identity && seenVideoKeys.has(identity)) return false;
      if (identity) seenVideoKeys.add(identity);
      return true;
    });

    const normalizedRowId = key.toLowerCase();
    const hasRowIdInText = (value = "") => String(value || "").trim().toLowerCase().includes(normalizedRowId);
    const rowVideos = allVideos.filter((v) => {
      if (!normalizedRowId) return false;
      if (String(v?.rowId || "").trim().toLowerCase() === normalizedRowId) return true;
      return hasRowIdInText(v.path) || hasRowIdInText(v.storagePath) || hasRowIdInText(v.rowFolder) || hasRowIdInText(v.name) || hasRowIdInText(v.downloadUrl);
    });

    const sortedRowVideos = rowVideos.slice().sort((a, b) => new Date(b.updatedAt || b.updated || 0).getTime() - new Date(a.updatedAt || a.updated || 0).getTime());
    const rowVideoPathSet = new Set(sortedRowVideos.map((video) => String(video?.storagePath || video?.path || "").trim()).filter(Boolean));
    const sortedOtherVideos = allVideos
      .filter((video) => !rowVideoPathSet.has(String(video?.storagePath || video?.path || "").trim()))
      .sort((a, b) => new Date(b.updatedAt || b.updated || 0).getTime() - new Date(a.updatedAt || a.updated || 0).getTime());
    logSceneReplacement("library:loaded", key, {
      totalVideos: allVideos.length,
      rowVideos: sortedRowVideos.length,
      otherVideos: sortedOtherVideos.length
    });

    const renderCard = (video) => {
      const card = document.createElement("div");
      card.className = "scene-video-selector-card";

      const downloadUrl = String(video.downloadUrl || video.videoDownloadUrl || video.url || video.videoUrl || "").trim();
      const mimeType = String(video.contentType || video.mimeType || "").trim().toLowerCase();
      const storagePath = String(video.storagePath || video.path || "").trim();
      const isImg = mimeType.startsWith("image/") || video.type === 'image' || /\.(jpg|jpeg|png|webp|gif)/i.test(downloadUrl) || /\.(jpg|jpeg|png|webp|gif)$/i.test(storagePath) || /\.(jpg|jpeg|png|webp|gif)$/i.test(String(video.name || "").trim());
      const stableLibraryKey = String(storagePath || downloadUrl || video.id || "").trim();

      const previewUrl = resolveReplacementPreviewUrl(downloadUrl, storagePath);
      const mediaHtml = isImg
        ? `<img data-preview-src="${escapeHtml(previewUrl)}" style="width: 100%; height: 120px; object-fit: cover; background: #000;" loading="lazy">`
        : `<video data-preview-src="${escapeHtml(previewUrl)}" preload="metadata" style="width: 100%; height: 120px; object-fit: cover; background: #000;" muted playsinline loop aria-label="Preview sin audio"></video>`;

      card.innerHTML = `
        ${mediaHtml}
        <div class="scene-video-creation-date" style="padding: 0.5rem; font-size: 0.8rem; overflow-wrap: anywhere;"></div>
      `;
      renderMediaCreationDate(card.querySelector(".scene-video-creation-date"), video);
      const hydratedFrame = isStopMotionMode()
        ? stopMotionFrames.find((frame) => frame.libraryKey === stableLibraryKey)
        : null;
      const selectedSingleKey = String(existingSingleMedia?.storagePath || existingSingleMedia?.downloadUrl || "").trim();
      if (hydratedFrame || (!isStopMotionMode() && selectedSingleKey && selectedSingleKey === stableLibraryKey)) {
        card.classList.add("is-selected");
        if (hydratedFrame) card.dataset.stopMotionLibraryId = hydratedFrame.id;
      }
      const previewVideo = card.querySelector("video");
      if (previewVideo) {
        loadReplacementPreviewElement(previewVideo, previewUrl, "video");
        previewVideo.addEventListener("pointerenter", () => playSceneReplacementPreview(previewVideo));
        previewVideo.addEventListener("pointerleave", () => {
          if (!card.classList.contains("is-selected")) {
            pauseSceneReplacementPreview(previewVideo, { keepFrame: true });
          }
        });
      }
      const previewImage = card.querySelector("img[data-preview-src]");
      if (previewImage) loadReplacementPreviewElement(previewImage, previewUrl, "image");
      card.addEventListener("click", () => {
        stopSceneReplacementPreviews({ keepFrames: true });
        const selectedMedia = {
          id: video.id,
          downloadUrl: downloadUrl,
          storagePath: storagePath,
          mimeType: String(video.contentType || video.mimeType || (isImg ? "image/jpeg" : "video/mp4")).trim(),
          type: isImg ? 'image' : 'video',
          name: video.name,
          createdAt: video.createdAt || video.timeCreated || null
        };
        if (isStopMotionMode()) {
          if (!isImg) {
            alert("El modo stop motion sólo admite imágenes.");
            return;
          }
          addStopMotionLibraryFrame(selectedMedia, card);
          return;
        }
        window._selectedLibraryVideo = selectedMedia;
        logSceneReplacement("library-card:clicked", key, {
          selectedMedia: window._selectedLibraryVideo
        });

        els.sceneVideoSelectorGeneratedGrid?.querySelectorAll('.scene-video-selector-card').forEach(c => c.classList.remove('is-selected'));
        els.sceneVideoSelectorOthersGrid?.querySelectorAll('.scene-video-selector-card').forEach(c => c.classList.remove('is-selected'));

        card.classList.add('is-selected');
        if (previewVideo) playSceneReplacementPreview(previewVideo);

        if (typeof window.PodcasterMediaReplacement?.onLibraryMediaSelected === "function") {
          window.PodcasterMediaReplacement.onLibraryMediaSelected(window._selectedLibraryVideo);
        } else if (els.confirmBtn) {
          els.confirmBtn.style.display = 'inline-block';
        }
      });
      return card;
    };

    const buildLibraryNotice = (messageHtml) => {
      const notice = document.createElement("div");
      notice.className = "pme-replacement-loading";
      notice.innerHTML = messageHtml;
      const retryBtn = document.createElement("button");
      retryBtn.type = "button";
      retryBtn.className = "pme-tab-btn";
      retryBtn.textContent = "Reintentar";
      retryBtn.addEventListener("click", () => {
        refreshSceneVideoSelectorLibrary({ rowId: key, sessionSlug: slug });
      });
      notice.appendChild(document.createElement("br"));
      notice.appendChild(retryBtn);
      return notice;
    };

    if (els.sceneVideoSelectorGeneratedGrid) {
      els.sceneVideoSelectorGeneratedGrid.innerHTML = "";
      if (!sortedRowVideos.length) {
        if (data?.fetchError) {
          els.sceneVideoSelectorGeneratedGrid.appendChild(buildLibraryNotice(
            `No se pudo cargar la biblioteca: ${escapeHtml(data.fetchError.message || "error de conexión")}`
          ));
        } else if (!rawVideos.length) {
          // La biblioteca respondió vacía: puede que la lista haya fallado en
          // silencio, así que no afirmamos que no exista el video.
          els.sceneVideoSelectorGeneratedGrid.appendChild(buildLibraryNotice(
            `Busqué en la sesión ${escapeHtml(slug)} y la biblioteca devolvió 0 videos. Si Servidor Snoopy ya lo generó, espera a que termine o usa la pestaña «Subir archivo» con el clip de la consola.`
          ));
        } else {
          els.sceneVideoSelectorGeneratedGrid.appendChild(buildLibraryNotice(
            `Ninguno de los ${rawVideos.length} videos de la sesión pertenece a esta escena.`
          ));
        }
      } else {
        sortedRowVideos.forEach((video) => els.sceneVideoSelectorGeneratedGrid.appendChild(renderCard(video)));
      }
    }
    if (els.sceneVideoSelectorOthersGrid) {
      els.sceneVideoSelectorOthersGrid.innerHTML = "";
      if (!sortedOtherVideos.length) {
        els.sceneVideoSelectorOthersGrid.innerHTML = data?.fetchError
          ? '<div class="pme-replacement-loading">No se pudieron cargar los videos de otras escenas.</div>'
          : '<div class="pme-replacement-loading">No hay otros videos en esta sesión.</div>';
      } else {
        sortedOtherVideos.forEach((video) => els.sceneVideoSelectorOthersGrid.appendChild(renderCard(video)));
      }
    }
    const expectedFound = expectedStoragePath
      ? sortedRowVideos.some((video) => String(video?.storagePath || video?.path || "").trim() === expectedStoragePath)
      : false;
    logSceneReplacement("library:rendered", key, {
      sessionSlug: slug,
      rowVideos: sortedRowVideos.length,
      expectedStoragePath: expectedStoragePath || "",
      expectedFound
    });
    return {
      ok: !data?.fetchError,
      totalVideos: rawVideos.length,
      rowVideos: sortedRowVideos.length,
      expectedFound
    };
  } catch (error) {
    if (els.sceneVideoSelectorGeneratedGrid) {
      els.sceneVideoSelectorGeneratedGrid.innerHTML = `<div style="text-align: center; grid-column: 1 / -1; padding: 2rem; color: var(--error-color);">Error: ${escapeHtml(error.message)}</div>`;
    }
    if (els.sceneVideoSelectorOthersGrid) {
      els.sceneVideoSelectorOthersGrid.innerHTML = "";
    }
    return { ok: false, totalVideos: 0, rowVideos: 0, expectedFound: false, error };
  }
}

function attachSceneVideoGeneratedListener() {
  if (selectorGeneratedListenerAttached) return;
  selectorGeneratedListenerAttached = true;
  document.addEventListener("podcaster:scene-video-generated", (event) => {
    const detail = event?.detail || {};
    const key = String(detail.rowId || "").trim();
    if (!key || !els.modal || els.modal.hidden) return;
    if (String(els.modal.dataset.rowId || "").trim() !== key) return;
    const sessionId = String(detail.sessionId || "").trim();
    if (sessionId && selectorLibraryContext.sessionSlug && sessionId !== selectorLibraryContext.sessionSlug) return;
    refreshSceneVideoSelectorLibrary({
      rowId: key,
      sessionSlug: selectorLibraryContext.sessionSlug,
      expectedStoragePath: String(detail.storagePath || "").trim()
    });
  });
}

function initPodcasterMediaReplacementDom() {
    initElements();
    registerPodcasterMediaReplacementApi();
    if (!els.modal) return;
    initFirebase();
    initMovementOptions();
    setupEventListeners();
    registerPodcasterMediaReplacementApi();
}

if (document.readyState === "loading") {
    document.addEventListener('DOMContentLoaded', initPodcasterMediaReplacementDom, { once: true });
} else {
    initPodcasterMediaReplacementDom();
}
