import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getFirestore, doc, updateDoc, getDoc, serverTimestamp, deleteField } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { firebaseWebConfig } from "../js/firebase-web-config.js";
import { buildApiUrl, getAuthHeaders, authFetchJson } from "../js/api-client.js";

function escapeHtml(unsafe = "") {
    return String(unsafe || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

let db;
let pond = null;
let currentEditingRowId = null;
let uploadedMediaUrl = null;
let uploadedStoragePath = null;
let uploadedMediaType = null;
let currentReplacementRequestMeta = { triggerSource: "unknown" };

let els = {};

function getActivePodcasterSession() {
    return (typeof window.getActiveSession === "function"
        ? window.getActiveSession()
        : window.PodcasterState?.activeSession) || null;
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
    const context = buildSceneReplacementContext(rowId, details);
    console.log(`[SceneReplacement] ${String(step || "").trim() || "event"}`, {
        ...context,
        ...details
    });
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
        uploadTabBtn: document.getElementById('sceneVideoTabUploadBtn'),
        libraryTabBtn: document.getElementById('sceneVideoTabGeneratedBtn'),
        othersTabBtn: document.getElementById('sceneVideoTabOthersBtn'),
        uploadContainer: document.getElementById('sceneMediaUploadContainer'),
        libraryContainer: document.getElementById('sceneVideoSelectorLibraryContainer'),
        confirmBtn: document.getElementById('confirmSceneMediaReplacementBtn'),
        movementSettings: document.getElementById('image-movement-settings'),
        speedRange: document.getElementById('movement-speed-range'),
        speedLabel: document.getElementById('movement-speed-label'),
        // Stage elements
        podcastActiveSpeakerImage: document.getElementById('podcastActiveSpeakerImage'),
        podcastVideoStage: document.getElementById('podcastVideoStage'),
        sceneVideoSelectorGeneratedGrid: document.getElementById('sceneVideoSelectorGeneratedGrid'),
        sceneVideoSelectorOthersGrid: document.getElementById('sceneVideoSelectorOthersGrid')
    };
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

window.PodcasterMediaReplacement = {
    swapStageToImagePreview
};

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
        allowMultiple: false,
        name: 'filepond',
        labelIdle: 'Arrastra tus archivos o <span class="filepond--label-action">Explora</span>',
        acceptedFileTypes: ['image/*', 'video/*'],
        server: {
            process: (fieldName, file, metadata, load, error, progress, abort) => {
                const session = window.PodcasterState?.activeSession || {};
                const sessionId = session.id || 'unknown';
                const controller = new AbortController();
                progress(true, 0, file.size || 1);
                logSceneReplacement("upload:start", currentEditingRowId, {
                    fileName: String(file?.name || "").trim(),
                    fileType: String(file?.type || "").trim(),
                    fileSize: Number(file?.size || 0) || 0,
                    sessionId
                });

                (async () => {
                    try {
                        const headers = await getAuthHeaders({
                            "Content-Type": String(file.type || "application/octet-stream").trim() || "application/octet-stream",
                            "X-Session-Id": String(sessionId || "").trim(),
                            "X-Row-Id": String(currentEditingRowId || "").trim(),
                            "X-File-Name": String(file.name || "scene-media").trim() || "scene-media",
                            "X-Mime-Type": String(file.type || "application/octet-stream").trim() || "application/octet-stream"
                        });
                        const uploadUrl = buildApiUrl("/api/podcaster/scene-media/upload");
                        let response;
                        try {
                            response = await fetch(uploadUrl, {
                                method: "POST",
                                headers,
                                body: file,
                                signal: controller.signal
                            });
                        } catch (fetchErr) {
                            // Fallback para desarrollo local (127.0.0.1 vs localhost)
                            const altUrl = uploadUrl.includes("127.0.0.1") ? uploadUrl.replace("127.0.0.1", "localhost") : uploadUrl.includes("localhost") ? uploadUrl.replace("localhost", "127.0.0.1") : null;
                            if (altUrl) {
                                response = await fetch(altUrl, {
                                    method: "POST",
                                    headers,
                                    body: file,
                                    signal: controller.signal
                                });
                            } else {
                                throw fetchErr;
                            }
                        }
                        const data = await response.json().catch(() => ({}));
                        if (!response.ok) {
                            throw new Error(String(data?.error || "No se pudo subir el archivo."));
                        }
                        const media = data?.media && typeof data.media === "object" ? data.media : null;
                        if (!media?.downloadUrl) {
                            throw new Error("Upload sin downloadUrl.");
                        }
                        uploadedMediaUrl = String(media.downloadUrl || "").trim();
                        uploadedStoragePath = String(media.storagePath || "").trim();
                        uploadedMediaType = String(media.type || (String(file.type || "").startsWith("image/") ? "image" : "video")).trim();
                        logSceneReplacement("upload:success", currentEditingRowId, {
                            uploadedMediaUrl,
                            uploadedStoragePath,
                            uploadedMediaType
                        });
                        progress(true, file.size || 1, file.size || 1);
                        load(uploadedMediaUrl);

                        if (uploadedMediaType === 'image' || uploadedMediaType.startsWith('image/')) {
                            if (els.movementSettings) els.movementSettings.style.display = 'block';
                        } else {
                            if (els.movementSettings) els.movementSettings.style.display = 'none';
                        }
                        if (els.confirmBtn) els.confirmBtn.style.display = 'inline-block';
                    } catch (err) {
                        console.log("[SceneReplacement] upload:error", {
                            ...buildSceneReplacementContext(currentEditingRowId),
                            message: String(err?.message || "Upload failed").trim()
                        });
                        error(err?.message || 'Upload failed');
                    }
                })();

                return {
                    abort: () => {
                        controller.abort();
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
            const val = parseInt(e.target.value);
            let label = 'Normal';
            if (val < 4) label = 'Lento';
            if (val > 7) label = 'Rápido';
            if (els.speedLabel) els.speedLabel.textContent = label;
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
    });

    const deactivateUploadTab = () => {
        els.uploadTabBtn.classList.remove('is-active');
        els.uploadTabBtn.setAttribute('aria-selected', 'false');
        els.uploadContainer.style.display = 'none';
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
        const selectedLibrary = window._selectedLibraryVideo;
        const mediaUrl = uploadedMediaUrl || selectedLibrary?.downloadUrl;
        let mediaType = uploadedMediaType || selectedLibrary?.type || 'video';
        
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
        
        if (!mediaUrl || !currentEditingRowId) {
            console.error("[MediaReplacement] Missing mediaUrl or rowId", { mediaUrl, currentEditingRowId });
            return;
        }

        const session = window.PodcasterState?.activeSession;
        if (!session) {
            console.error("[MediaReplacement] No active session found");
            return;
        }

        const effects = getSelectedEffects();
        // console.log("[MediaReplacement] Effects:", effects);
        
        try {
            // console.log("[MediaReplacement] Updating Firestore for session:", session.id);
            const sessionRef = doc(db, 'podcaster_sessions', session.id);
            const persistedRowId = currentEditingRowId;
            
            const snap = await getDoc(sessionRef);
            if (!snap.exists()) {
                console.error("[MediaReplacement] Session document not found in Firestore");
                return;
            }
            const docData = snap.data();
            const currentSession = docData.session || {};
            const rawRows = currentSession.script?.rows || [];
            
            let rows = [];
            if (Array.isArray(rawRows)) {
                rows = [...rawRows];
            } else if (rawRows && typeof rawRows === 'object') {
                rows = Object.keys(rawRows)
                    .sort((a, b) => parseInt(a) - parseInt(b))
                    .map(k => rawRows[k]);
            }

            const rowIdx = rows.findIndex(r => String(r.id).trim() === String(currentEditingRowId).trim());
            if (rowIdx !== -1) {
                rows[rowIdx] = {
                    ...rows[rowIdx],
                    videoSrc: mediaUrl,
                    mediaType: mediaType,
                    updatedAt: new Date().toISOString()
                };
            }

            const isImageMedia = mediaType === 'image' || mediaType.startsWith('image/');
            const finalStoragePath = uploadedStoragePath || selectedLibrary?.storagePath || '';
            const mediaData = {
                id: currentEditingRowId,
                rowId: currentEditingRowId,
                downloadUrl: mediaUrl,
                storagePath: finalStoragePath,
                mimeType: selectedLibrary?.mimeType || (isImageMedia ? 'image/jpeg' : 'video/mp4'),
                type: mediaType,
                updatedAt: serverTimestamp(),
                model: mediaType === 'video' ? 'veo' : null,
                segments: null,
                variants: null
            };
            const imageReferenceData = isImageMedia ? {
                id: currentEditingRowId,
                rowId: currentEditingRowId,
                name: selectedLibrary?.name || 'Referencia de escena',
                downloadUrl: mediaUrl,
                storagePath: finalStoragePath,
                mimeType: selectedLibrary?.mimeType || 'image/jpeg',
                type: 'image',
                updatedAt: new Date().toISOString()
            } : null;

            const updatePayload = {
                [`session.dialogueVideoMap.${currentEditingRowId}`]: mediaData,
                [`session.rowReferenceModeByRowId.${currentEditingRowId}`]: isImageMedia ? 'image' : 'video',
                [`session.podcastVideoConfig.timelineClipsByRowId.${currentEditingRowId}.type`]: mediaType,
                [`session.script.rows`]: rows,
                [`session.updatedAt`]: serverTimestamp(),
                updatedAt: serverTimestamp()
            };
            logSceneReplacement("payload:prepared", currentEditingRowId, {
                nextMediaType: mediaType,
                isImageMedia,
                finalStoragePath,
                effects,
                updatePayloadKeys: Object.keys(updatePayload)
            });
            
            if (isImageMedia) {
                updatePayload[`session.rowReferenceImageMap.${currentEditingRowId}`] = imageReferenceData;
                updatePayload[`session.rowReferenceImageListMap.${currentEditingRowId}`] = [imageReferenceData];
                updatePayload[`session.rowReferenceVideoMap.${currentEditingRowId}`] = deleteField();
                updatePayload[`session.visualEffectsMap.${currentEditingRowId}`] = effects;
            } else {
                updatePayload[`session.rowReferenceVideoMap.${currentEditingRowId}`] = mediaData;
                updatePayload[`session.rowReferenceImageMap.${currentEditingRowId}`] = deleteField();
                updatePayload[`session.rowReferenceImageListMap.${currentEditingRowId}`] = deleteField();
                updatePayload[`session.visualEffectsMap.${currentEditingRowId}`] = null;
            }
            
            // 1. Local sync
            if (typeof window.upsertActiveSession === "function") {
                const now = new Date().toISOString();
                window.upsertActiveSession((current) => {
                    const next = { ...current };
                    const currentRows = Array.isArray(current?.script?.rows) ? current.script.rows : [];
                    
                    next.dialogueVideoMap = { ...(next.dialogueVideoMap || {}) };
                    next.visualEffectsMap = { ...(next.visualEffectsMap || {}) };
                    next.rowReferenceModeByRowId = { ...(next.rowReferenceModeByRowId || {}) };
                    next.rowReferenceVideoMap = { ...(next.rowReferenceVideoMap || {}) };
                    next.rowReferenceImageMap = { ...(next.rowReferenceImageMap || {}) };
                    next.rowReferenceImageListMap = { ...(next.rowReferenceImageListMap || {}) };
                    next.podcastVideoConfig = { ...(next.podcastVideoConfig || {}) };
                    next.podcastVideoConfig.timelineClipsByRowId = { ...(next.podcastVideoConfig.timelineClipsByRowId || {}) };
                    next.script = {
                        ...(next.script || {}),
                        rows: currentRows.map((row) => (
                            String(row?.id || '').trim() === currentEditingRowId
                                ? { ...row, videoSrc: mediaUrl, mediaType, updatedAt: now }
                                : row
                        ))
                    };
                    next.updatedAt = now;
                    
                    const localMediaData = { ...mediaData, updatedAt: now };
                    next.dialogueVideoMap[currentEditingRowId] = localMediaData;
                    next.podcastVideoConfig.timelineClipsByRowId[currentEditingRowId] = {
                        ...(next.podcastVideoConfig.timelineClipsByRowId[currentEditingRowId] || {}),
                        type: mediaType
                    };
                    
                    if (isImageMedia) {
                        const localImageRef = { ...imageReferenceData, updatedAt: now };
                        next.rowReferenceModeByRowId[currentEditingRowId] = "image";
                        next.rowReferenceImageMap[currentEditingRowId] = localImageRef;
                        next.rowReferenceImageListMap[currentEditingRowId] = [localImageRef];
                        delete next.rowReferenceVideoMap[currentEditingRowId];
                        next.visualEffectsMap[currentEditingRowId] = effects;
                    } else {
                        next.rowReferenceModeByRowId[currentEditingRowId] = "video";
                        next.rowReferenceVideoMap[currentEditingRowId] = localMediaData;
                        delete next.rowReferenceImageMap[currentEditingRowId];
                        delete next.rowReferenceImageListMap[currentEditingRowId];
                        next.visualEffectsMap[currentEditingRowId] = null;
                    }
                    
                    return next;
                }, { render: true });
                logSceneReplacement("local-sync:done", currentEditingRowId, {
                    mediaType,
                    isImageMedia,
                    effects
                });

                if (String(window.PodcasterState?.activeRowId || '').trim() === currentEditingRowId && typeof window.syncPodcastVideoStageMedia === "function") {
                    logSceneReplacement("stage-sync:start", currentEditingRowId, {
                        activeRowId: String(window.PodcasterState?.activeRowId || '').trim()
                    });
                    window.syncPodcastVideoStageMedia(currentEditingRowId, { force: true });
                    logSceneReplacement("stage-sync:done", currentEditingRowId, {
                        activeRowId: String(window.PodcasterState?.activeRowId || '').trim()
                    });
                }
            }

            // 2. Firestore update
            logSceneReplacement("firestore:update:start", currentEditingRowId, {
                updatePayloadKeys: Object.keys(updatePayload)
            });
            await updateDoc(sessionRef, updatePayload);
            logSceneReplacement("firestore:update:done", currentEditingRowId, {
                persistedMediaUrl: mediaUrl,
                persistedMediaType: mediaType
            });

            // Cleanup
            window._selectedLibraryVideo = null;
            uploadedMediaUrl = null;
            uploadedStoragePath = null;
            uploadedMediaType = null;
            currentEditingRowId = "";
            if (els.modal) delete els.modal.dataset.rowId;
            els.modal.hidden = true;
            currentReplacementRequestMeta = { triggerSource: "unknown" };
            console.log("[SceneReplacement] confirm:complete", {
                ...buildSceneReplacementContext(persistedRowId, { session }),
                persistedMediaUrl: mediaUrl,
                persistedMediaType: mediaType
            });

        } catch (err) {
            console.error('[MediaReplacement] Error saving replacement:', err);
            alert('Error al guardar el reemplazo.');
        }
    });

    document.addEventListener('podcaster:scene-media-selector-open', (event) => {
        currentEditingRowId = String(event?.detail?.rowId || '').trim();
        currentReplacementRequestMeta = {
            triggerSource: String(event?.detail?.triggerSource || currentReplacementRequestMeta?.triggerSource || "unknown").trim()
        };
        logSceneReplacement("modal:open", currentEditingRowId, {
            triggerSource: currentReplacementRequestMeta.triggerSource
        });
        window._selectedLibraryVideo = null;
        uploadedMediaUrl = null;
        uploadedStoragePath = null;
        uploadedMediaType = null;
        if (els.modal && currentEditingRowId) {
            els.modal.dataset.rowId = currentEditingRowId;
        }
        if (els.confirmBtn) els.confirmBtn.style.display = 'none';
        if (els.movementSettings) els.movementSettings.style.display = 'none';
        if (pond) pond.removeFiles();
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
    
    if (isImage) {
        if (els.movementSettings) els.movementSettings.style.display = 'block';
    } else {
        if (els.movementSettings) els.movementSettings.style.display = 'none';
    }
    
    if (els.confirmBtn) els.confirmBtn.style.display = 'inline-block';
}

async function openSceneVideoSelectorModal(rowId = "", options = {}) {
  // Use global fallback for session
  const session = getActivePodcasterSession();
  const key = String(rowId || "").trim();
  if (!session || !key) return;
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
  if (els.sceneVideoSelectorGeneratedGrid) {
    els.sceneVideoSelectorGeneratedGrid.innerHTML = '<div style="text-align: center; grid-column: 1 / -1; padding: 2rem;"><i class="fas fa-spinner fa-spin"></i> Buscando videos de esta sesión...</div>';
  }
  if (els.sceneVideoSelectorOthersGrid) {
    els.sceneVideoSelectorOthersGrid.innerHTML = '<div style="text-align: center; grid-column: 1 / -1; padding: 2rem;"><i class="fas fa-spinner fa-spin"></i> Buscando videos de esta sesión...</div>';
  }
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

  try {
    const data = await authFetchJson(`/api/podcaster/sessions/list-videos?sessionSlug=${encodeURIComponent(sessionSlug)}`);
    const allVideos = Array.isArray(data?.videos) ? data.videos : (Array.isArray(data) ? data : []);

    const normalizedRowId = key.toLowerCase();
    const hasRowIdInText = (value = "") => String(value || "").trim().toLowerCase().includes(normalizedRowId);
    const rowVideos = allVideos.filter((v) => {
      if (!normalizedRowId) return false;
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
      card.style.cssText = "border: 1px solid var(--border-color); border-radius: var(--border-radius); overflow: hidden; cursor: pointer; transition: border-color 0.2s;";
      
      const downloadUrl = String(video.downloadUrl || video.videoDownloadUrl || video.url || video.videoUrl || "").trim();
      const mimeType = String(video.contentType || video.mimeType || "").trim().toLowerCase();
      const storagePath = String(video.storagePath || video.path || "").trim();
      const isImg = mimeType.startsWith("image/") || video.type === 'image' || /\.(jpg|jpeg|png|webp|gif)/i.test(downloadUrl) || /\.(jpg|jpeg|png|webp|gif)$/i.test(storagePath) || /\.(jpg|jpeg|png|webp|gif)$/i.test(String(video.name || "").trim());
      
      const mediaHtml = isImg 
        ? `<img src="${escapeHtml(downloadUrl)}" style="width: 100%; height: 120px; object-fit: cover; background: #000;" loading="lazy">`
        : `<video src="${escapeHtml(downloadUrl)}" preload="metadata" style="width: 100%; height: 120px; object-fit: cover; background: #000;" muted playsinline onmouseover="this.play().catch(()=> {})" onmouseout="this.pause(); this.currentTime = 0;"></video>`;

      card.innerHTML = `
        ${mediaHtml}
        <div style="padding: 0.5rem; font-size: 0.8rem; word-break: break-all;">
          ${escapeHtml(video.name || video.id || 'Media')}
        </div>
      `;
      card.addEventListener("click", () => {
        window._selectedLibraryVideo = {
          id: video.id,
          downloadUrl: downloadUrl,
          storagePath: storagePath,
          mimeType: String(video.contentType || video.mimeType || (isImg ? "image/jpeg" : "video/mp4")).trim(),
          type: isImg ? 'image' : 'video',
          name: video.name
        };
        logSceneReplacement("library-card:clicked", key, {
          selectedMedia: window._selectedLibraryVideo
        });
        
        els.sceneVideoSelectorGeneratedGrid?.querySelectorAll('.scene-video-selector-card').forEach(c => c.style.borderColor = 'var(--border-color)');
        els.sceneVideoSelectorOthersGrid?.querySelectorAll('.scene-video-selector-card').forEach(c => c.style.borderColor = 'var(--border-color)');
        
        card.style.borderColor = '#6366f1';
        card.style.borderWidth = '2px';
        
        if (typeof window.PodcasterMediaReplacement?.onLibraryMediaSelected === "function") {
          window.PodcasterMediaReplacement.onLibraryMediaSelected(window._selectedLibraryVideo);
        } else if (els.confirmBtn) {
          els.confirmBtn.style.display = 'inline-block';
        }
      });
      return card;
    };

    if (els.sceneVideoSelectorGeneratedGrid) {
      els.sceneVideoSelectorGeneratedGrid.innerHTML = "";
      if (!sortedRowVideos.length) {
        els.sceneVideoSelectorGeneratedGrid.innerHTML = '<div style="text-align: center; grid-column: 1 / -1; padding: 2rem;">No hay videos generados para esta escena.</div>';
      } else {
        sortedRowVideos.forEach((video) => els.sceneVideoSelectorGeneratedGrid.appendChild(renderCard(video)));
      }
    }
    if (els.sceneVideoSelectorOthersGrid) {
      els.sceneVideoSelectorOthersGrid.innerHTML = "";
      if (!sortedOtherVideos.length) {
        els.sceneVideoSelectorOthersGrid.innerHTML = '<div style="text-align: center; grid-column: 1 / -1; padding: 2rem;">No hay otros videos en Storage para esta sesión.</div>';
      } else {
        sortedOtherVideos.forEach((video) => els.sceneVideoSelectorOthersGrid.appendChild(renderCard(video)));
      }
    }
  } catch (error) {
    console.log("[SceneReplacement] library:load-error", {
      ...buildSceneReplacementContext(key, { session, triggerSource: currentReplacementRequestMeta.triggerSource }),
      message: String(error?.message || "").trim()
    });
    if (els.sceneVideoSelectorGeneratedGrid) {
      els.sceneVideoSelectorGeneratedGrid.innerHTML = `<div style="text-align: center; grid-column: 1 / -1; padding: 2rem; color: var(--error-color);">Error: ${escapeHtml(error.message)}</div>`;
    }
    if (els.sceneVideoSelectorOthersGrid) {
      els.sceneVideoSelectorOthersGrid.innerHTML = "";
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
    initElements();
    if (!els.modal) return;
    initFirebase();
    initMovementOptions();
    setupEventListeners();
    
    window.PodcasterMediaReplacement = {
        swapStageToImagePreview,
        onLibraryMediaSelected,
        openSceneVideoSelectorModal
    };
});
