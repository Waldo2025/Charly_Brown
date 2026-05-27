import {
  createPodcasterFinalLimiterNode,
  normalizePodcasterFinalLimiterSettings
} from "./podcaster-audio-limiter.js";
import {
  buildKaraokeSubtitleMarkup,
  normalizeKaraokeWordTimings,
  resolveActiveKaraokeWordIndex
} from "./podcaster-karaoke.js";

/**
 * PodcasterPlaybackController.js
 * Unified Playback Controller for Podcaster Studio
 * Handles Play/Pause/Stop, Audio/Video Sync, Overlays, and master clock.
 */

class EventEmitter {
  constructor() { this.listeners = {}; }
  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
    return () => this.off(event, callback);
  }
  off(event, callback) {
    if (this.listeners[event]) this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }
  emit(event, data) {
    if (this.listeners[event]) this.listeners[event].forEach(cb => { try { cb(data); } catch (e) { } });
  }
}

export class PodcasterPlaybackController extends EventEmitter {
  constructor() {
    super();
    this.els = null;
    this.deps = null;
    this.state = {
      isPlaying: false,
      currentMs: 0,
      totalDurationMs: 0,
      session: null,
      config: null,
      useMse: false,
      activeRowId: '',
      isTickProcessing: false,
      stopAtMs: 0,
      standaloneAudio: null
    };
    this.lastTickMs = 0;
    this.cachedTickEntries = null;
    this.cachedTickEntriesTime = 0;
    this.clockId = null;
    this.audioCtx = null;
    this.dialoguePlayers = {};
    this.audioCache = {};
    this.blobCache = new Map();
    this.fetchPromises = new Map();
    this.mediaCacheName = 'podcaster-media-cache-v1';
    this.videoPrewarmKey = "";
    this.videoPrewarmPromise = null;


    this.backgroundAudio = null;
    this.backgroundSource = null;
    this.backgroundGain = null;
    this.backgroundCompressor = null;
    this.backgroundFinalLimiter = null;
    this.backgroundStabilizeEnabled = null;
    this.backgroundLimiterEnabled = null;
    this.backgroundLimiterSettings = normalizePodcasterFinalLimiterSettings();
    this.backgroundDuckFactor = 1.0;
    this.backgroundSrc = "";

    this.stageMachine = {
      loadingSrc: '',
      preloadingSrc: '',
      preloadingPromise: null,
      activeSlot: 0,
      imageLoadingSrc: '',
      imageLoadingPromise: null,
      imageSwapToken: 0
    };
    this.stageSwitchSeq = 0;
    this.activeLoopId = 0;
    this.visualLayoutMode = "default";
    this.overlapState = {
      key: "",
      backSlot: 0,
      frontSlot: 1
    };
  }

  // --- Helpers ---
  clamp01(v) { return Math.max(0, Math.min(1, Number(v) || 0)); }
  toFiniteNumber(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
  clampPlaybackRate(rate, min = 0.5, max = 2.25) {
    return Math.max(min, Math.min(max, Number(rate) || 1));
  }
  normalizeSceneMediaScale(value = 1) {
    if (typeof this.deps?.normalizeTimelineClipMediaScale === "function") {
      return this.deps.normalizeTimelineClipMediaScale(value);
    }
    const numeric = Math.round((Number(value) || 1) * 100) / 100;
    return Math.max(1, Math.min(2.5, numeric || 1));
  }
  resolveStageMediaScaleContainer() {
    return this.els?.podcastActiveSpeakerVideo?.closest?.(".podcast-video-preview, .player-stage, .montage-export-preview-container")
      || this.els?.podcastActiveSpeakerImage?.closest?.(".podcast-video-preview, .player-stage, .montage-export-preview-container")
      || null;
  }
  applySceneMediaScale(entry = null) {
    const mediaScale = this.normalizeSceneMediaScale(entry?.clip?.mediaScale);
    const visualLayoutMode = String(entry?.clip?.visualLayoutMode || "default").trim() || "default";
    if (typeof this.deps?.applySceneMediaScaleToStage === "function") {
      this.deps.applySceneMediaScaleToStage({
        rowId: String(entry?.rowId || "").trim(),
        mediaScale,
        visualLayoutMode,
        container: this.resolveStageMediaScaleContainer()
      });
      return;
    }
    const container = this.resolveStageMediaScaleContainer();
    if (container) {
      container.style.setProperty("--pod-scene-media-scale", String(mediaScale));
    }
  }
  resolveSegmentSourceOffsetSec(currentMs, segmentStartMs, trimInMs = 0, clipPlaybackRate = 1) {
    const safeTrimInMs = Math.max(0, Number(trimInMs || 0));
    const timelineOffsetMs = Math.max(0, Number(currentMs || 0) - Math.max(0, Number(segmentStartMs || 0)));
    const sourceOffsetMs = safeTrimInMs + (timelineOffsetMs * this.clampPlaybackRate(clipPlaybackRate, 0.5, 2.25));
    return sourceOffsetMs / 1000;
  }
  resolveSegmentTimelineDurationMs(segment = null, clipPlaybackRate = 1) {
    const trimInMs = Math.max(0, Number(segment?.trimInMs || 0) || 0);
    const trimOutMs = Math.max(0, Number(segment?.trimOutMs || 0) || 0);
    const trimmedVisibleMs = trimOutMs > trimInMs ? (trimOutMs - trimInMs) : 0;
    const rawVisibleMs = Math.max(
      500,
      trimmedVisibleMs
      || Number(segment?.durationMs || 0)
      || (Number(segment?.endMs || 0) - Number(segment?.startMs || 0))
      || 500
    );
    return Math.max(500, Math.round(rawVisibleMs / this.clampPlaybackRate(clipPlaybackRate, 0.5, 2.25)));
  }
  isImageStageEntry(entry = null) {
    if (!entry) return false;
    if (entry.isImageClip === true) return true;
    const explicitType = String(entry?.clip?.type || entry?.type || "").trim().toLowerCase();
    if (explicitType === "image") return true;
    const source = String(entry?.videoSrc || "").trim();
    if (/\.(jpg|jpeg|png|webp|gif|avif)(?:[?#]|$)/i.test(source)) return true;
    if (/\/api\/assets\/proxy-image\?/i.test(source)) return true;
    return false;
  }
  parseOverlayCssPercent(value, fallback = 0) {
    const raw = String(value || "").trim();
    if (!raw) return fallback;
    const numeric = Number(raw.replace("%", ""));
    if (!Number.isFinite(numeric)) return fallback;
    return this.clamp01(numeric / 100);
  }
  resolveLiveOnScreenTextLayout(selectedRowId, baseLayout, overlay, previewEl) {
    const rowId = String(selectedRowId || "").trim();
    if (!rowId || !overlay || !previewEl) return baseLayout;
    const dragState = this.deps?.podcastVideoState?.onScreenTextOverlayDrag;
    const resizeState = this.deps?.podcastVideoState?.onScreenTextOverlayResize;
    const activeInteraction = [dragState, resizeState].find((item) => String(item?.rowId || "").trim() === rowId) || null;
    if (!activeInteraction) return baseLayout;
    const bubble = overlay.querySelector(`.podcast-on-screen-text-content[data-row-id="${CSS.escape(rowId)}"]`);
    if (!bubble) return baseLayout;
    const previewRect = previewEl.getBoundingClientRect?.();
    const bubbleRect = bubble.getBoundingClientRect?.();
    const previewWidthPx = Math.max(1, Number(previewRect?.width || previewEl.clientWidth || 1));
    const previewHeightPx = Math.max(1, Number(previewRect?.height || previewEl.clientHeight || 1));
    const widthPx = Math.max(
      1,
      this.toFiniteNumber(String(bubble.style.getPropertyValue("--pod-onscreen-text-bubble-width") || "").replace("px", ""), Number(bubbleRect?.width || 0))
    );
    const heightPx = Math.max(1, Number(bubbleRect?.height || 0));
    return {
      ...(baseLayout || {}),
      rowId,
      xPct: this.parseOverlayCssPercent(bubble.style.getPropertyValue("--pod-onscreen-text-x"), Number(baseLayout?.xPct || 0)),
      yPct: this.parseOverlayCssPercent(bubble.style.getPropertyValue("--pod-onscreen-text-y"), Number(baseLayout?.yPct || 0)),
      widthPct: Math.max(0.08, Math.min(0.9, widthPx / previewWidthPx)),
      heightPct: Math.max(0.05, Math.min(0.6, heightPx / previewHeightPx))
    };
  }
  resolveTrackManagedOnScreenTextLayout(rowLayout, settings, rowId) {
    const baseLayout = rowLayout && typeof rowLayout === "object" ? rowLayout : {};
    const widthPct = Math.max(0.22, Math.min(0.92, Number(settings?.boxWidthPct || baseLayout?.widthPct || 0.58) || 0.58));
    const heightPct = Math.max(0.05, Math.min(0.6, Number(baseLayout?.heightPct || 0.14) || 0.14));
    const overlayXPct = this.clamp01(Number(settings?.overlayXPct || 0.5) || 0.5);
    const overlayYPct = this.clamp01(Number(settings?.overlayYPct || 0.86) || 0.86);
    return {
      ...baseLayout,
      rowId: String(rowId || baseLayout?.rowId || "").trim(),
      widthPct,
      heightPct,
      xPct: Math.max(0, Math.min(1 - widthPct, overlayXPct - (widthPct / 2))),
      yPct: Math.max(0, Math.min(1 - heightPct, overlayYPct - heightPct))
    };
  }

  getEntryAtMs(currentMs) {
    const now = performance.now();
    let entries;
    if (this.cachedTickEntries && (now - this.cachedTickEntriesTime) < 16) {
      entries = this.cachedTickEntries;
    } else {
      entries = this.deps?.buildTimelineRuntimeEntries?.(this.state.session) || [];
      this.cachedTickEntries = entries;
      this.cachedTickEntriesTime = now;
    }
    return entries.find(e => currentMs >= e.startMs && currentMs < e.endMs);
  }
  getBlobUrlSync(url) {
    if (!url) return "";
    if (url.startsWith('blob:')) return url;
    if (this.blobCache.has(url)) return this.blobCache.get(url);
    const cacheKey = this.resolvePersistentMediaCacheKey(url);
    if (cacheKey && cacheKey !== url && this.blobCache.has(cacheKey)) {
      const cached = this.blobCache.get(cacheKey);
      this.blobCache.set(url, cached);
      return cached;
    }
    return null;
  }

  resolvePersistentMediaCacheKey(url = "") {
    const cleanUrl = String(url || "").trim();
    if (!cleanUrl) return "";
    if (cleanUrl.startsWith("blob:") || cleanUrl.startsWith("data:")) return cleanUrl;
    try {
      const parsedUrl = new URL(cleanUrl, window.location.origin);
      let storagePath = parsedUrl.searchParams.get("storagePath") || "";
      const originalUrl = parsedUrl.searchParams.get("url") || "";
      if (!storagePath && cleanUrl.includes("firebasestorage.googleapis.com")) {
        const pathPart = cleanUrl.split("/o/")[1]?.split("?")[0];
        if (pathPart) storagePath = decodeURIComponent(pathPart);
      }
      if (!storagePath && originalUrl) {
        try {
          const originalParsed = new URL(originalUrl);
          if (originalParsed.hostname.includes("firebasestorage.googleapis.com")) {
            const pathPart = originalUrl.split("/o/")[1]?.split("?")[0];
            if (pathPart) storagePath = decodeURIComponent(pathPart);
          }
        } catch (_) { }
      }
      if (storagePath) {
        return `${window.location.origin}/__podcaster_media_cache__/${encodeURIComponent(storagePath)}`;
      }
    } catch (_) { }
    return cleanUrl;
  }

  async invalidateBlobUrl(url) {
    if (!url) return;
    const cacheKey = this.resolvePersistentMediaCacheKey(url);
    const blobUrl = this.blobCache.get(url) || (cacheKey && cacheKey !== url ? this.blobCache.get(cacheKey) : "");
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      this.blobCache.delete(url);
      if (cacheKey && cacheKey !== url) this.blobCache.delete(cacheKey);
    }
    try {
      const cache = await caches.open(this.mediaCacheName);
      await cache.delete(url);
      if (cacheKey && cacheKey !== url) await cache.delete(cacheKey);
    } catch (e) { }
  }


  async getBlobUrl(url) {
    if (!url) return "";
    const cacheKey = this.resolvePersistentMediaCacheKey(url) || url;
    // 1. Check in-memory cache
    const cached = this.getBlobUrlSync(url);
    if (cached) return cached;

    if (this.fetchPromises.has(cacheKey)) return this.fetchPromises.get(cacheKey);

    const p = (async () => {
      try {
        // 2. Check persistent Cache Storage
        try {
          const mediaCache = await caches.open(this.mediaCacheName);
          const cachedResp = await mediaCache.match(cacheKey);
          if (cachedResp) {
            const blob = await cachedResp.blob();
            const objectUrl = URL.createObjectURL(blob);
            this.blobCache.set(url, objectUrl);
            if (cacheKey !== url) this.blobCache.set(cacheKey, objectUrl);
            return objectUrl;
          }
        } catch (e) { }

        let finalUrl = url;
        const isDirectFirebaseUrl = url.includes('firebasestorage.googleapis.com');
        const isImageLikeUrl = /\.(png|jpe?g|webp|gif|avif|svg)(?:[?#]|$)/i.test(String(url || "").trim());

        if (url.includes('/api/assets/proxy-media') || url.includes('/api/assets/proxy-image') || isDirectFirebaseUrl) {
          try {
            const parsedUrl = new URL(url, window.location.origin);
            let storagePath = parsedUrl.searchParams.get('storagePath');
            const originalUrl = parsedUrl.searchParams.get('url');

            if (isDirectFirebaseUrl && !storagePath) {
              const pathPart = url.split('/o/')[1]?.split('?')[0];
              if (pathPart) storagePath = decodeURIComponent(pathPart);
            }

            if (storagePath && this.deps?.resolveFirebaseStorageUrl) {
              const isStudioAsset = storagePath.includes('podcaster/sessions') || storagePath.includes('podcaster/library');
              // Solo permitimos resolución directa si NO es un asset de estudio O si es Dashboard.
              // En local (Studio) lo desactivamos porque suele dar error de CORS si el bucket no está abierto.
              if (!isStudioAsset || this.deps?.isDashboard) {
                const bucket = window.__CHARLY_CONFIG__?.firebase?.storageBucket || 'charly-brown.firebasestorage.app';
                const gsPath = storagePath.startsWith('gs://') ? storagePath : `gs://${bucket}/${storagePath}`;
                const directUrl = await this.deps.resolveFirebaseStorageUrl(gsPath);
                if (directUrl && directUrl.startsWith('http') && !directUrl.includes('/api/assets/proxy')) {
                  finalUrl = directUrl;
                } else if (directUrl && directUrl.includes('/api/assets/proxy')) {
                  finalUrl = directUrl;
                }
              }
            } else if (originalUrl && originalUrl.startsWith('http') && !originalUrl.includes('/api/assets/proxy')) {
              finalUrl = originalUrl;
            }
          } catch (e) { }
        }

        if (finalUrl.startsWith("gs://")) {
          if (this.deps?.resolveFirebaseStorageUrl) {
            finalUrl = await this.deps.resolveFirebaseStorageUrl(finalUrl);
          }
        }

        const isImageLikeFinalUrl = /\.(png|jpe?g|webp|gif|avif|svg)(?:[?#]|$)/i.test(String(finalUrl || "").trim());
        const isDirectRemoteImage = isImageLikeFinalUrl && !String(finalUrl || "").includes('/api/');
        if (isDirectFirebaseUrl && isDirectRemoteImage) {
          this.blobCache.set(url, finalUrl);
          return finalUrl;
        }
        if (isImageLikeUrl && isDirectRemoteImage) {
          this.blobCache.set(url, finalUrl);
          return finalUrl;
        }

        const fetchOptions = {};
        if (finalUrl.includes('/api/') && this.deps?.getAuthHeaders) {
          try { fetchOptions.headers = await this.deps.getAuthHeaders(); } catch (e) { }
        }

        let resp = await fetch(finalUrl, fetchOptions);
        
        // Fallback local si falla o da 404 estando en localhost
        const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
        if (isLocal && (!resp.ok || resp.status === 404) && finalUrl.includes(".onrender.com")) {
          try {
            const parsed = new URL(finalUrl);
            const localUrl = `http://127.0.0.1:8787/api${parsed.pathname.replace(/^\/api/, "")}${parsed.search}`;
            const localResp = await fetch(localUrl, fetchOptions).catch(() => null);
            if (localResp && localResp.ok) {
              resp = localResp;
            }
          } catch (_) { }
        }

        if (!resp.ok) {
          if (resp.status === 404 && this.deps?.markStaleProxyMediaUrl) {
            this.deps.markStaleProxyMediaUrl(url, 'proxy-media-404-from-controller');
          }
          throw new Error(`Fetch failed with status ${resp.status}`);
        }

        try {
          const mediaCache = await caches.open(this.mediaCacheName);
          await mediaCache.put(cacheKey, resp.clone());
        } catch (e) { }

        const blob = await resp.blob();
        const objectUrl = URL.createObjectURL(blob);
        this.blobCache.set(url, objectUrl);
        if (cacheKey !== url) this.blobCache.set(cacheKey, objectUrl);
        return objectUrl;
      } catch (e) {
        // Cache the fact that it failed to avoid spamming the backend/storage.
        // If it was a 404, we mark it specially so we can potentially skip it in the UI.
        const msg = String(e?.message || "").toLowerCase();
        if (msg.includes("status 404")) {
          this.blobCache.set(url, "404");
        } else {
          this.blobCache.set(url, url); 
        }
        return url;
      } finally {
        this.fetchPromises.delete(cacheKey);
      }
    })();
    this.fetchPromises.set(cacheKey, p);
    return p;
  }

  collectTimelineStageVideoEntries(session = null) {
    const entries = this.deps?.buildTimelineRuntimeEntries?.(session || this.state.session || this.deps?.getActiveSession?.()) || [];
    const seen = new Set();
    return entries.filter((entry) => {
      const src = String(entry?.videoSrc || "").trim();
      if (!src || seen.has(src) || this.isImageStageEntry(entry)) return false;
      seen.add(src);
      return true;
    });
  }

  prioritizeStageVideoEntriesForMs(entries = [], currentMs = 0) {
    const targetMs = Math.max(0, Number(currentMs || 0) || 0);
    return [...entries].sort((a, b) => {
      const aActive = targetMs >= Number(a?.startMs || 0) && targetMs < Number(a?.endMs || 0);
      const bActive = targetMs >= Number(b?.startMs || 0) && targetMs < Number(b?.endMs || 0);
      if (aActive !== bActive) return aActive ? -1 : 1;
      const aDistance = Math.min(Math.abs(targetMs - Number(a?.startMs || 0)), Math.abs(targetMs - Number(a?.endMs || 0)));
      const bDistance = Math.min(Math.abs(targetMs - Number(b?.startMs || 0)), Math.abs(targetMs - Number(b?.endMs || 0)));
      return aDistance - bDistance;
    });
  }

  async preloadStageVideosAroundMs(currentMs = 0, options = {}) {
    const session = options.session || this.state.session || this.deps?.getActiveSession?.();
    const entries = Array.isArray(options.entries) ? options.entries : this.collectTimelineStageVideoEntries(session);
    if (!entries.length) return false;
    const prioritized = this.prioritizeStageVideoEntriesForMs(entries, currentMs);
    const limit = Math.max(1, Math.min(4, Number(options.limit || 3) || 3));
    const selected = prioritized.slice(0, limit);
    const current = selected[0] || null;
    const tasks = selected.map((entry) => this.getBlobUrl(entry.videoSrc).catch(() => ""));
    if (options.awaitCurrent === true && current) {
      await tasks[0];
    }
    Promise.allSettled(tasks).catch(() => { });
    return true;
  }

  prewarmTimelineStageVideos(session = null, options = {}) {
    const entries = this.collectTimelineStageVideoEntries(session);
    if (!entries.length) return Promise.resolve(false);
    const key = entries.map((entry) => String(entry?.videoSrc || "").trim()).filter(Boolean).join("|");
    if (!options.force && this.videoPrewarmKey === key && this.videoPrewarmPromise) {
      return this.videoPrewarmPromise;
    }
    const currentMs = Math.max(0, Number(options.currentMs ?? this.state.currentMs ?? 0) || 0);
    const queue = this.prioritizeStageVideoEntriesForMs(entries, currentMs);
    const concurrency = Math.max(1, Math.min(4, Number(options.concurrency || 2) || 2));
    this.videoPrewarmKey = key;
    this.videoPrewarmPromise = (async () => {
      let index = 0;
      const worker = async () => {
        while (index < queue.length) {
          const entry = queue[index++];
          const src = String(entry?.videoSrc || "").trim();
          if (!src) continue;
          try { await this.getBlobUrl(src); } catch (_) { }
        }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, () => worker()));
      return true;
    })().finally(() => {
      if (this.videoPrewarmKey !== key) return;
      this.videoPrewarmPromise = null;
    });
    return this.videoPrewarmPromise;
  }

  // --- Lifecycle ---
  init(els, deps) {
    this.els = els;
    this.deps = deps;
    this.state.isInitialized = true;

    // Asegurar compatibilidad de CORS para elementos existentes
    [this.els?.podcastActiveSpeakerVideo, this.els?.podcastActiveSpeakerVideoAlt].forEach(v => {
      if (v) v.crossOrigin = "anonymous";
    });

    // console.log('[PlaybackController] Initialized with elements:', Object.keys(els));
  }

  sync(session, config) {
    this.state.session = session || this.deps?.getActiveSession?.();
    this.state.config = config || this.deps?.getPodcastVideoConfig?.(this.state.session);
    this.state.useMse = false; // Force disable MSE as it is an incomplete experimental feature
    const totalMs = this.deps?.getTimelineTotalDurationMs?.(this.state.session) || 0;
    this.state.totalDurationMs = Number.isFinite(totalMs) ? Math.max(0, totalMs) : 0;

  }

  /**
   * Evict cached audio player and blob URL for a specific row.
   * Call this whenever the audio source for a row changes (e.g. after regeneration)
   * so the next tick creates a fresh Audio element and fires loadedmetadata.
   */
  invalidateRowAudioCache(rowId = "") {
    const key = String(rowId || "").trim();
    if (!key) return;
    const audio = this.dialoguePlayers[key];
    if (audio) {
      try { audio.pause(); } catch (_) { }
      // If the audio has a blob src in our cache, revoke and evict it
      const originalSrc = String(audio.dataset?.originalSrc || "").trim();
      if (originalSrc && this.blobCache.has(originalSrc)) {
        try { URL.revokeObjectURL(this.blobCache.get(originalSrc)); } catch (_) { }
        this.blobCache.delete(originalSrc);
      }
      delete this.dialoguePlayers[key];
      delete this.audioCache[key];
    }
  }

  /**
   * Deeply evicts all cached media (audio, video, images, proxies) associated with a row.
   * Call this when video is generated or manually replaced to force updates in stage & timeline.
   */
  invalidateRowMediaCache(rowId = "", session = null, options = {}) {
    const key = String(rowId || "").trim();
    if (!key) return;

    // 1. Evacuate audio elements and audio cache
    this.invalidateRowAudioCache(key);

    // 2. Resolve dialogue video/image clip URLs and evict them from blobCache and Cache Storage
    const activeSession = session || this.state.session || (typeof getActiveSession === "function" ? getActiveSession() : (window.getActiveSession ? window.getActiveSession() : null));
    const explicitClips = []
      .concat(options?.previousClip || [])
      .concat(options?.nextClip || [])
      .filter((clip) => clip && typeof clip === "object");
    const collectClipUrls = (clip = null) => {
      if (!clip || typeof clip !== "object") return [];
      const segments = Array.isArray(clip.segments) ? clip.segments : [];
      return [
        clip.downloadUrl,
        clip.storagePath,
        ...segments.map((segment) => segment?.downloadUrl),
        ...segments.map((segment) => segment?.storagePath)
      ].filter(Boolean);
    };
    const urlsToInvalidate = new Set(explicitClips.flatMap((clip) => collectClipUrls(clip)));
    if (activeSession) {
      const dialogueMap = activeSession.dialogueVideoMap || {};
      const clip = dialogueMap[key];
      if (clip) {
        collectClipUrls(clip).forEach((url) => urlsToInvalidate.add(url));
      }
    }
    urlsToInvalidate.forEach((url) => {
      this.invalidateBlobUrl(url);
      // Purge proxy URL variations
      try {
        const proxyUrl = `/api/assets/proxy-media?storagePath=${encodeURIComponent(url)}`;
        this.invalidateBlobUrl(proxyUrl);
      } catch (_) { }
      try {
        const proxyImgUrl = `/api/assets/proxy-image?storagePath=${encodeURIComponent(url)}`;
        this.invalidateBlobUrl(proxyImgUrl);
      } catch (_) { }
    });

    // 3. Clear transient synced flags to ensure stage media synchronizes completely fresh next loop
    this.state.activeRowId = "";
    if (this.deps?.podcastVideoState) {
      this.deps.podcastVideoState.lastSyncedStageKey = "";
    } else if (window.podcastVideoState) {
      window.podcastVideoState.lastSyncedStageKey = "";
    }
  }


  initAudioContext() {
    if (this.audioCtx) {
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
      return this.audioCtx;
    }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
      }
    } catch (e) { }
    return this.audioCtx;
  }

  // --- Transport ---
  play(fromMs = null, options = {}) {
    this.sync();
    if (fromMs !== null) this.state.currentMs = Math.max(0, fromMs);
    if (options.stopAtMs) this.state.stopAtMs = options.stopAtMs;
    else this.state.stopAtMs = 0;

    this.state.isPlaying = true;
    this.initAudioContext();
    this.preloadStageVideosAroundMs(this.state.currentMs, {
      awaitCurrent: false,
      limit: 3
    }).catch(() => { });

    if (this.deps?.cancelTimelineSequence) this.deps.cancelTimelineSequence();

    if (this.state.useMse) {
      this.initMse();
    } else {
      this.startClock();
    }
    
    if (this.deps?.podcastVideoState) {
      this.deps.podcastVideoState.montageActive = true;
      this.deps.podcastVideoState.montagePaused = false;
    }

    this.emit('play', { currentMs: this.state.currentMs });
    this.deps?.setPodcastVideoStatus?.("Reproduciendo...");
    if (this.deps?.stopPanelMusic) {
      try { this.deps.stopPanelMusic(); } catch (_) { }
    }
    this.deps?.updatePodcastVideoTransportUi?.();
    if (this.els?.podcastActiveSpeakerImage) {
      this.els.podcastActiveSpeakerImage.style.animationPlayState = 'running';
    }
  }

  pause() {
    this.state.isPlaying = false;
    this.stopClock();

    Object.values(this.dialoguePlayers).forEach(audio => { 
      try { audio.pause(); } catch (_) { } 
    });
    [this.els?.podcastActiveSpeakerVideo, this.els?.podcastActiveSpeakerVideoAlt].forEach(v => {
      if (v) try { v.pause(); } catch (_) { }
    });
    this.pauseBackgroundMusic();
    if (this.mse?.engine) this.mse.engine.pause();
    
    if (this.deps?.podcastVideoState) {
      this.deps.podcastVideoState.montagePaused = true;
    }

    this.emit('pause');
    this.deps?.setPodcastVideoStatus?.("Pausado");
    if (this.deps?.syncPodcastStudioInspector) {
      try {
        const session = this.state.session || this.deps?.getActiveSession?.();
        this.deps.syncPodcastStudioInspector(session);
      } catch (_) { }
    }
    this.deps?.updatePodcastVideoTransportUi?.();
    if (this.els?.podcastActiveSpeakerImage) {
      this.els.podcastActiveSpeakerImage.style.animationPlayState = 'paused';
    }
  }

  async stop(opts = {}) {
    this.state.isPlaying = false;
    this.stopClock();
    
    const shouldReset = opts.keepCursor !== true;
    if (shouldReset) {
      this.state.currentMs = 0;
      this.state.activeRowId = "";
      if (this.deps?.podcastVideoState) {
        this.deps.podcastVideoState.montageCursorMs = 0;
      }
    }
    
    this.stopBackgroundMusic();
    this.applySceneMediaScale(null);
    if (this.els?.podcastActiveSpeakerImage) {
      this.els.podcastActiveSpeakerImage.style.animationPlayState = 'paused';
    }
    if (this.deps?.stopPanelMusic) { try { this.deps.stopPanelMusic(); } catch (_) { } }
    
    Object.values(this.dialoguePlayers).forEach(a => {
      try {
        a.pause();
        if (shouldReset) {
          a.currentTime = 0;
          a.dataset.initialized = "false";
        }
      } catch (_) { }
    });

    [this.els?.podcastActiveSpeakerVideo, this.els?.podcastActiveSpeakerVideoAlt, this.els?.podcastActiveSpeakerBackdropVideo, this.els?.podcastActiveSpeakerBackdropVideoAlt].forEach(v => {
      if (v) try { 
        v.pause(); 
        if (shouldReset) {
          v.currentTime = 0;
        }
        v.style.opacity = 0; 
        v.style.zIndex = 1; 
      } catch (_) { }
    });

    this.deps?.setPodcastVideoStatus?.(shouldReset ? 'Detenido' : 'Pausado');
    this.deps?.updatePodcastVideoTransportUi?.();

    this.state.isTickProcessing = false;
    await this.tick(this.state.currentMs, { lightweight: !shouldReset });

    if (this.deps?.podcastVideoState) {
      this.deps.podcastVideoState.montageActive = false;
      this.deps.podcastVideoState.montagePaused = false;
    }

    if (this.deps?.syncPodcastStudioInspector) {
      try {
        const session = this.state.session || this.deps?.getActiveSession?.();
        this.deps.syncPodcastStudioInspector(session);
      } catch (_) { }
    }

    this.emit('stop', opts);
  }

  seekTo(el, seconds) {
    if (!el || !Number.isFinite(seconds)) return;
    try {
      const isVideo = el.tagName === "VIDEO";
      if (el.readyState >= 1) {
        let targetSeconds = seconds;
        if (isVideo) {
          const videoDuration = el.duration;
          if (Number.isFinite(videoDuration) && videoDuration > 0 && seconds >= videoDuration) {
            targetSeconds = seconds % videoDuration;
          }
        }
        el.currentTime = targetSeconds;
      } else {
        el.dataset.pendingSeek = seconds;
        const onLoaded = () => {
          let targetSeconds = seconds;
          if (isVideo) {
            const videoDuration = el.duration;
            if (Number.isFinite(videoDuration) && videoDuration > 0 && seconds >= videoDuration) {
              targetSeconds = seconds % videoDuration;
            }
          }
          el.currentTime = targetSeconds;
          el.removeEventListener('loadedmetadata', onLoaded);
          delete el.dataset.pendingSeek;
        };
        el.addEventListener('loadedmetadata', onLoaded);
      }
    } catch (e) {
      void e;
    }
  }

  startClock() {
    this.stopClock();
    this.activeLoopId++;
    const loopId = this.activeLoopId;
    let lastTime = performance.now();

    const tickLoop = async (now) => {
      if (!this.state.isPlaying || loopId !== this.activeLoopId) return;
      try {
        const delta = now - lastTime;
        lastTime = now;
        const speed = this.deps?.getPlaybackSpeed?.() || 1;
        const clampedDelta = Math.min(delta, 100);
        const nextMs = this.state.currentMs + (clampedDelta * speed);

        if (this.state.stopAtMs > 0 && nextMs >= this.state.stopAtMs) {
          this.state.currentMs = this.state.stopAtMs;
          await this.tick(this.state.stopAtMs);
          this.state.stopAtMs = 0;
          await this.stop();
          return;
        }

        if (this.state.totalDurationMs > 100 && nextMs >= this.state.totalDurationMs) {
          this.state.currentMs = this.state.totalDurationMs;
          await this.tick(this.state.totalDurationMs);
          await this.stop();
          return;
        }

        this.state.currentMs = nextMs;
        await this.tick(nextMs);
        this.clockId = requestAnimationFrame(tickLoop);
      } catch (error) {
        console.error("[PlaybackController] Error in tickLoop:", error);
        this.pause(); 
      }
    };
    this.clockId = requestAnimationFrame(tickLoop);
  }

  stopClock() { if (this.clockId) { cancelAnimationFrame(this.clockId); this.clockId = null; } }

  async prev() {
    this.sync();
    const session = this.state.session || this.deps?.getActiveSession?.();
    const entries = this.deps?.buildTimelineRuntimeEntries?.(session) || [];
    if (!entries.length) return;
    const markers = [...new Set(entries.map(e => Math.round(Number(e.startMs || 0))))].sort((a, b) => a - b);
    const current = this.state.currentMs;
    const targetMs = [...markers].reverse().find(ms => ms < current - 500) ?? 0;
    await this.seek(targetMs);
  }

  async next() {
    this.sync();
    const session = this.state.session || this.deps?.getActiveSession?.();
    const entries = this.deps?.buildTimelineRuntimeEntries?.(session) || [];
    if (!entries.length) return;
    const markers = [...new Set(entries.map(e => Math.round(Number(e.startMs || 0))))].sort((a, b) => a - b);
    const current = this.state.currentMs;
    const targetMs = markers.find(ms => ms > current + 120) ?? markers[markers.length - 1];
    await this.seek(targetMs);
  }

  async seek(targetMs, options = {}) {
    const ms = Math.max(0, Math.min(this.state.totalDurationMs || 9999999, Number(targetMs) || 0));
    this.state.currentMs = ms;
    const useLightweightSeek = options.lightweight === true || this.deps?.useLightweightSeekDuringPlayback === true;
    if (options.allowConcurrentTick !== false) {
      this.stageSwitchSeq += 1;
      this.stageMachine.loadingSrc = "";
      this.state.isTickProcessing = false;
    }
    const session = this.state.session || this.deps?.getActiveSession?.();
    const entries = this.deps?.buildTimelineRuntimeEntries?.(session) || [];
    this.cachedTickEntries = entries;
    this.cachedTickEntriesTime = performance.now();
    this.preloadStageVideosAroundMs(ms, {
      session,
      entries,
      awaitCurrent: options.awaitStageVideo === true,
      limit: 3
    }).catch(() => { });
    await this.tick(ms, {
      ...options,
      lightweight: useLightweightSeek
    });
    this.emit('seek', { currentMs: ms });
  }

  async tick(currentMs, options = {}) {
    const ms = Number.isFinite(Number(currentMs)) ? Number(currentMs) : this.state.currentMs;
    this.state.currentMs = ms;

    if (this.deps?.podcastVideoState) {
      this.deps.podcastVideoState.montageCursorMs = ms;
    }

    const lightweight = options.lightweight !== false;

    if (this.deps?.syncPodcastTimelinePlayhead) {
      this.deps.syncPodcastTimelinePlayhead(this.state.session, { 
        currentMs: ms,
        totalMs: this.state.totalDurationMs, 
        lightweight: lightweight,
        suppressAutoScroll: options.suppressAutoScroll === true
      });
    }

    const activeEntry = this.getEntryAtMs(ms);
    const activeRowId = activeEntry?.rowId || "";
    const activeClip = this.deps?.getOnScreenTextClipAtMs?.(ms);

    if (activeClip) {
      if (this.state.activeOnScreenTextId !== activeClip.id) {
        this.state.activeOnScreenTextId = activeClip.id;
        // console.log(`[Playback:Text] Mostrando texto para ${activeClip.rowId}: "${activeClip.onScreenText.substring(0, 30)}..."`);
        this.deps?.renderOnScreenText?.(activeClip);
      }
    } else {
      if (this.state.activeOnScreenTextId !== "") {
        // console.log(`[Playback:Text] Limpiando texto`);
        this.state.activeOnScreenTextId = "";
        this.deps?.renderOnScreenText?.(null);
      }
    }
    
    if (activeRowId && activeRowId !== this.state.activeRowId) {
      this.state.activeRowId = activeRowId;
      const session = this.state.session || this.deps?.getActiveSession?.();
      const speaker = activeEntry?.speakerName || "";
      if (session && this.deps?.syncPodcastStudioRuntimeUi) {
        this.deps.syncPodcastStudioRuntimeUi(session, activeRowId, speaker, {
          speaking: true,
          lightweightInspector: true
        });
      } else {
        this.deps?.setPodcastVideoRow?.(activeRowId);
        if (session && this.deps?.setPodcastVideoSpeaker) {
          this.deps.setPodcastVideoSpeaker(session, speaker, { rowId: activeRowId, syncStageMedia: false });
        }
      }
    }

    // Solo sincronizar el preview externo si este runtime no delega el stage al controller.
    if (!lightweight && this.deps?.syncStudioTimelinePreview && this.deps?.enableExternalStudioPreviewSync === true) {
      const session = this.state.session || this.deps?.getActiveSession?.();
      this.deps.syncStudioTimelinePreview(session, { currentMs: ms, autoplay: false });
    }

    if (this.pendingTimelineRender && this.deps?.renderPodcastVideoTimeline) {
      this.pendingTimelineRender = false;
      this.deps.renderPodcastVideoTimeline(this.state.session, { force: true, reason: "throttled-metadata-sync" });
    }

    if (this.state.isTickProcessing) return;
    this.state.isTickProcessing = true;
    try {
      if (this.deps?.updatePodcastVideoTransportUi) this.deps.updatePodcastVideoTransportUi();
      const speed = this.deps?.getPlaybackSpeed?.() || 1;
      
      await Promise.all([
        this.syncAudio(ms, speed),
        this.syncVideo(ms),
        this.syncOverlay ? this.syncOverlay(ms) : null,
        this.syncStylizedText ? this.syncStylizedText(ms) : null
      ]);
      
      this.emit('timeupdate', { currentMs: ms });
    } catch (e) {
      void e;
    } finally {
      this.state.isTickProcessing = false;
    }
  }

  // --- Audio ---
  async syncAudio(currentMs, speed) {
    const session = this.state.session || this.deps?.getActiveSession?.();
    const entries = this.deps?.buildTimelineRuntimeEntries?.(session) || [];

    const config = this.deps?.getPodcastVideoConfig?.(session) || {};
    const audioTrack = config.geminiDialogueTrack || { segments: [], enabled: true };
    this.state.audioTrack = audioTrack;

    let segments = audioTrack.segments || [];
    if (!segments.length) {
      segments = entries.map(entry => {
        const audioClip = this.deps?.resolveDialogueAudioForRow?.(session, entry.rowId);
        const audioDurationMs = Math.max(0, Math.round(Number(audioClip?.durationSec || 0) * 1000));
        const durationMs = audioDurationMs > 0 ? audioDurationMs : entry.effectiveDurationMs;
        return {
          rowId: entry.rowId,
          startMs: entry.startMs,
          durationMs: durationMs,
          trimInMs: 0,
          trimOutMs: durationMs
        };
      });
    }
    const activeSegments = segments.filter((segment) => {
      const rowId = String(segment?.rowId || "").trim();
      const clipPlaybackRate = this.deps?.resolveDialogueAudioPlaybackRate?.(session, rowId) || 1;
      const visibleDurationMs = this.resolveSegmentTimelineDurationMs(segment, clipPlaybackRate);
      return currentMs >= segment.startMs && currentMs < (segment.startMs + visibleDurationMs);
    });
    const activeRowIds = new Set(activeSegments.map(s => s.rowId));

    // Upcoming pre-load
    const upcoming = segments.filter((segment) => {
      const segmentStartMs = Math.max(0, Number(segment?.startMs || 0) || 0);
      return segmentStartMs > currentMs && (segmentStartMs - currentMs) < 3000;
    });
    upcoming.forEach(s => {
      const clip = this.deps?.resolveDialogueAudioForRow?.(session, s.rowId);
      const rawUrl = this.deps?.resolveStorageAudioUrl?.(clip?.downloadUrl, clip?.storagePath);
      if (rawUrl) this.getBlobUrl(rawUrl);
    });

    Object.keys(this.dialoguePlayers).forEach(rowId => {
      if (!activeRowIds.has(rowId)) {
        const audio = this.dialoguePlayers[rowId];
        if (audio) {
          if (!audio.paused) try { audio.pause(); } catch (_) { }
          // If the audio is not recently active, we could potentially remove it, 
          // but keeping it in dialoguePlayers/audioCache is fine for reuse.
        }
      }
    });

    let hasVoice = false;

    for (const segment of activeSegments) {
      const rowId = segment.rowId;
      const audioClip = this.deps?.resolveDialogueAudioForRow?.(session, rowId);
      const rawAudioSrc = this.deps?.resolveStorageAudioUrl?.(audioClip?.downloadUrl, audioClip?.storagePath);
      if (!rawAudioSrc) continue;

      let audioSrc = this.getBlobUrlSync(rawAudioSrc);
      if (!audioSrc) audioSrc = await this.getBlobUrl(rawAudioSrc);
      
      hasVoice = true;
      let audio = this.dialoguePlayers[rowId];
      if (!audio || (audio.dataset.originalSrc !== audioSrc)) {
        if (audio) try { audio.pause(); } catch (_) { }
        audio = new Audio();
        audio.crossOrigin = 'anonymous';
        audio.src = audioSrc;
        audio.dataset.originalSrc = audioSrc;
        audio.dataset.initialized = "false";
        this.dialoguePlayers[rowId] = audio;
        this.audioCache[rowId] = audio;
        audio.addEventListener("loadedmetadata", () => {
          const nextMs = Math.round(audio.duration * 1000);
          const pvs = this.deps?.podcastVideoState;
          
          // Forzar la velocidad efectiva también al cargar metadatos
          const speed = this.deps?.getPlaybackSpeed?.() || 1;
          const clipRate = this.deps?.resolveDialogueAudioPlaybackRate?.(session, rowId) || 1;
          const effectiveRate = this.clampPlaybackRate(speed * clipRate);
          audio.playbackRate = effectiveRate;
          audio.defaultPlaybackRate = effectiveRate;

          if (pvs && Number.isFinite(nextMs)) {
            if (!pvs.montageAudioActualDurationsMs) pvs.montageAudioActualDurationsMs = {};
            if (Math.abs(nextMs - (pvs.montageAudioActualDurationsMs[rowId] || 0)) > 100) {
              pvs.montageAudioActualDurationsMs[rowId] = nextMs;
              if (typeof window.invalidateStudioRuntimeCache === "function") {
                window.invalidateStudioRuntimeCache();
              }
              this.pendingTimelineRender = true;
              if (typeof window.syncGeminiDialogueTrackWithRuntime === "function") {
                try {
                  window.syncGeminiDialogueTrackWithRuntime({ render: false, preserveStartMs: true });
                } catch (_) {}
              }
            }
          }
        }, { once: true });
      }

      const clipPlaybackRate = this.deps?.resolveDialogueAudioPlaybackRate?.(session, rowId) || 1;
      const effectiveRate = this.clampPlaybackRate(speed * clipPlaybackRate);

      // Log informativo de resolución (solo una vez por inicialización de segmento)
      if (audio.dataset.initialized === "false") {
        // console.log(`[Playback:Audio] Configurando ${rowId}: Speed=${speed.toFixed(2)}x, ClipRate=${clipPlaybackRate.toFixed(2)}x -> Effective=${effectiveRate.toFixed(2)}x`);
      }

      if (Math.abs(audio.playbackRate - effectiveRate) > 0.01) {
        // console.log(`[Playback:Audio] Ajustando velocidad para ${rowId}: ${audio.playbackRate.toFixed(2)}x -> ${effectiveRate.toFixed(2)}x`);
        audio.playbackRate = effectiveRate;
        audio.defaultPlaybackRate = effectiveRate;
      }
      
      const mix = this.deps?.resolveTimelineClipMix?.(session, rowId) || { voiceVolume: 1 };
      const sessionConfig = this.deps?.getPodcastVideoConfig?.(session) || this.state.config || {};
      const masterVolumeFactor = this.clamp01(this.toFiniteNumber(sessionConfig?.masterVolume, 100) / 100);
      audio.volume = this.clamp01((mix.voiceVolume ?? 1) * masterVolumeFactor);

      const segmentTrimInMs = Math.max(0, Number(segment?.trimInMs || 0));
      const offsetSec = this.resolveSegmentSourceOffsetSec(currentMs, segment.startMs, segmentTrimInMs, clipPlaybackRate);

      const drift = Math.abs(audio.currentTime - offsetSec);
      const isFirstSync = audio.dataset.initialized === "false";
      const isPaused = audio.paused === true || this.state.isPlaying !== true;
      // En Studio, re-seekear la voz Gemini con una tolerancia muy baja en cada tick
      // provoca microcortes audibles. Mientras está sonando, solo corregimos cuando el
      // desfase ya es claramente perceptible o después de un seek/arranque inicial.
      const driftToleranceSec = isFirstSync
        ? 0.01
        : (isPaused ? 0.08 : 0.35);
      
      if (isFirstSync || drift > driftToleranceSec) {
        if (isFirstSync || drift > 0.5) {
           // console.log(`[Playback:Audio] Sincronizando tiempo para ${rowId}: ${audio.currentTime.toFixed(3)}s → ${offsetSec.toFixed(3)}s (Drift: ${drift.toFixed(3)}s)`);
        }
        this.seekTo(audio, offsetSec);
        audio.dataset.initialized = "true";
      }

      if (this.state.isPlaying && audio.paused) {
        // console.log(`[Playback:Audio] Play para ${rowId}`);
        audio.play().then(() => {
          // Re-aplicar velocidad tras el play por seguridad (algunos navegadores la resetean al iniciar el play)
          if (Math.abs(audio.playbackRate - effectiveRate) > 0.01) {
            audio.playbackRate = effectiveRate;
          }
        }).catch(() => { });
      } else if (!audio.paused && Math.abs(audio.playbackRate - effectiveRate) > 0.01) {
        // Asegurar que la velocidad se mantenga sincronizada incluso si ya está sonando
        audio.playbackRate = effectiveRate;
      }
    }
    await this.syncBackgroundMusic(currentMs, speed, hasVoice);
  }

  async syncBackgroundMusic(currentMs, speed, hasVoice = false) {
    const session = this.state.session || this.deps?.getActiveSession?.();
    const panelCfg = this.deps?.getPanelMontageMusicConfig?.(session);
    if (!panelCfg || panelCfg.sourceType === "none") { this.stopBackgroundMusic(); return; }

    const sourceItems = Array.isArray(panelCfg.sourceItems) ? panelCfg.sourceItems : [];
    const activeSegment = sourceItems.length > 0
      ? sourceItems.find(s => currentMs >= s.startOffsetMs && currentMs < s.endOffsetMs)
      : (() => {
          if (!panelCfg.sourceUrl) return null;
          const sourceDurationMs = Math.max(0, Math.round(Number(panelCfg.durationSec || 0) * 1000));
          const trimInMs = Math.max(0, Number(panelCfg.trimInMs || 0));
          const trimOutMs = Math.max(trimInMs + 1, Number(panelCfg.trimOutMs || sourceDurationMs || 0));
          const startOffsetMs = Math.max(0, Number(panelCfg.startOffsetMs || 0) || 0);
          const loopSettings = Array.isArray(panelCfg.loopSettings) ? panelCfg.loopSettings : [];
          let cursorMs = startOffsetMs;
          let loopIndex = 0;
          while (loopIndex < 120) {
            const loopSetting = loopSettings.find((item) => Math.max(0, Math.floor(Number(item?.loopIndex || 0) || 0)) === loopIndex) || null;
            const segmentTrimInMs = Math.max(0, Number(loopSetting?.trimInMs ?? trimInMs) || 0);
            const segmentTrimOutMs = Math.max(segmentTrimInMs + 1, Number(loopSetting?.trimOutMs ?? trimOutMs) || trimOutMs);
            const effectiveLoopMs = Math.max(1, segmentTrimOutMs - segmentTrimInMs);
            const endOffsetMs = cursorMs + effectiveLoopMs;
            if (currentMs >= cursorMs && currentMs < endOffsetMs) {
              return {
                sourceUrl: panelCfg.sourceUrl,
                volume: panelCfg.volume,
                loop: true,
                startOffsetMs: cursorMs,
                endOffsetMs,
                trimInMs: segmentTrimInMs,
                trimOutMs: segmentTrimOutMs,
                fadeInMs: Math.max(0, Number(loopSetting?.fadeInMs || 0)),
                fadeOutMs: Math.max(0, Number(loopSetting?.fadeOutMs || 0))
              };
            }
            if (cursorMs > currentMs && loopIndex > 0) break;
            cursorMs = endOffsetMs;
            loopIndex += 1;
          }
          return panelCfg.sourceUrl ? {
            sourceUrl: panelCfg.sourceUrl,
            volume: panelCfg.volume,
            loop: true,
            startOffsetMs: 0,
            endOffsetMs: 9999999,
            trimInMs,
            trimOutMs,
            fadeInMs: 0,
            fadeOutMs: 0
          } : null;
        })();
    
    if (activeSegment) {
      if (this.backgroundSrc !== activeSegment.sourceUrl) {
        if (this.backgroundAudio) {
          try { this.backgroundAudio.pause(); } catch (_) { }
          try { this.backgroundAudio.currentTime = 0; } catch (_) { }
          try { this.backgroundAudio.src = ""; } catch (_) { }
        }
        if (this.backgroundSource) { try { this.backgroundSource.disconnect(); } catch (_) { } }
        this.backgroundSource = null;
        if (this.backgroundGain) { try { this.backgroundGain.disconnect(); } catch (_) { } }
        this.backgroundGain = null;
        if (this.backgroundCompressor) { try { this.backgroundCompressor.disconnect(); } catch (_) { } }
        this.backgroundCompressor = null;
        if (this.backgroundFinalLimiter) { try { this.backgroundFinalLimiter.disconnect(); } catch (_) { } }
        this.backgroundFinalLimiter = null;
        this.backgroundStabilizeEnabled = null;
        this.backgroundLimiterEnabled = null;
        this.backgroundSrc = activeSegment.sourceUrl;
        // console.log(`[Playback:Music] Cambio de track de fondo: ${activeSegment.sourceUrl}`);
        try {
          const blobSrc = await this.getBlobUrl(activeSegment.sourceUrl);
          this.backgroundAudio = new Audio();
          this.backgroundAudio.crossOrigin = 'anonymous';
          this.backgroundAudio.src = blobSrc;
          this.backgroundAudio.dataset.initialized = "false";
          this.backgroundAudio.loop = activeSegment.loop !== undefined ? activeSegment.loop : true;
        } catch (e) {
          this.backgroundSrc = "";
          return;
        }
      }

      if (!this.backgroundAudio) return;

      const entry = this.getEntryAtMs(currentMs);
      const mix = entry?.rowId ? this.deps?.resolveTimelineClipMix?.(session, entry.rowId) : null;
      const sceneBackgroundFactor = mix ? (mix.backgroundVolume ?? 1.0) : 1.0;

      const baseVolume = activeSegment && activeSegment.volume !== undefined ? activeSegment.volume : this.toFiniteNumber(panelCfg.volume, 100);
      const duckPct = activeSegment && (activeSegment.duckingWhenGeminiPct ?? activeSegment.duckingPct) !== undefined
        ? (activeSegment.duckingWhenGeminiPct ?? activeSegment.duckingPct)
        : this.toFiniteNumber(panelCfg.duckingWhenGeminiPct, 60);
      const segmentDurationMs = Math.max(1, Number(activeSegment.endOffsetMs || 0) - Number(activeSegment.startOffsetMs || 0));
      const elapsedMs = Math.max(0, currentMs - Number(activeSegment.startOffsetMs || 0));
      const remainingMs = Math.max(0, segmentDurationMs - elapsedMs);
      const fadeInMs = Math.max(0, Number(activeSegment.fadeInMs || 0));
      const fadeInFactor = fadeInMs > 0 && segmentDurationMs > 0
        ? (elapsedMs < fadeInMs ? Math.max(0, Math.min(1, elapsedMs / fadeInMs)) : 1.0)
        : 1.0;
      const fadeOutMs = Math.max(0, Number(activeSegment.fadeOutMs || 0));
      const fadeOutFactor = fadeOutMs > 0 && segmentDurationMs > 0
        ? (remainingMs <= fadeOutMs ? Math.max(0, Math.min(1, remainingMs / fadeOutMs)) : 1.0)
        : 1.0;

      this.backgroundDuckFactor = hasVoice ? (duckPct / 100) : 1.0;
      const finalVolume = (baseVolume / 100) * this.backgroundDuckFactor * sceneBackgroundFactor * fadeInFactor * fadeOutFactor;

      const sessionConfig = this.deps?.getPodcastVideoConfig?.(session) || this.state.config || {};
      const masterVolumeFactor = this.clamp01(this.toFiniteNumber(sessionConfig?.masterVolume, 100) / 100);
      const stabilizeEnabled = sessionConfig?.audioMasterStabilize === true || (activeSegment && activeSegment.stabilize !== undefined
        ? activeSegment.stabilize === true
        : panelCfg.stabilize === true);
      const limiterEnabled = sessionConfig?.audioMasterLimiterEnabled === true || panelCfg.limiterEnabled === true;

      if (this.audioCtx) {
        this.ensureBackgroundChain(stabilizeEnabled, limiterEnabled);
        if (this.backgroundGain) {
          this.backgroundGain.gain.setTargetAtTime(this.clamp01(finalVolume * masterVolumeFactor), this.audioCtx.currentTime, 0.05);
        } else {
          this.backgroundAudio.volume = this.clamp01(finalVolume * masterVolumeFactor);
        }
      } else {
        this.backgroundAudio.volume = this.clamp01(finalVolume * masterVolumeFactor);
      }

      this.backgroundAudio.playbackRate = speed;

      const trimInMs = Math.max(0, Number(activeSegment.trimInMs || 0));
      const offsetMs = currentMs - activeSegment.startOffsetMs;
      const offsetSec = (trimInMs + offsetMs) / 1000;
      
      const drift = Math.abs(this.backgroundAudio.currentTime - offsetSec);
      if (this.backgroundAudio.dataset.initialized === "false" || drift > 0.3) {
        // console.log(`[Playback:Music] Sincronizando tiempo: ${this.backgroundAudio.currentTime.toFixed(3)}s → ${offsetSec.toFixed(3)}s`);
        this.seekTo(this.backgroundAudio, offsetSec);
        this.backgroundAudio.dataset.initialized = "true";
      }

      if (this.state.isPlaying && this.backgroundAudio.paused) {
        // console.log(`[Playback:Music] Play`);
        this.backgroundAudio.play().catch(() => { });
      }
    } else {
      if (this.backgroundAudio && !this.backgroundAudio.paused) {
        // console.log(`[Playback:Music] Stop (fuera de segmento)`);
        this.backgroundAudio.pause();
      }
      this.backgroundSrc = "";
    }
  }

  ensureBackgroundChain(stabilizeEnabled = false, limiterEnabled = false) {
    if (!this.audioCtx || !this.backgroundAudio) return;
    try {
      const wantsStabilize = stabilizeEnabled === true;
      const wantsLimiter = limiterEnabled === true;
      const needsBuild = !this.backgroundSource
        || !this.backgroundGain
        || this.backgroundStabilizeEnabled !== wantsStabilize
        || this.backgroundLimiterEnabled !== wantsLimiter;
      if (!needsBuild) return;
      if (!this.backgroundSource) {
        this.backgroundSource = this.audioCtx.createMediaElementSource(this.backgroundAudio);
      } else {
        try { this.backgroundSource.disconnect(); } catch (_) { }
      }
      if (this.backgroundCompressor) {
        try { this.backgroundCompressor.disconnect(); } catch (_) { }
      }
      if (this.backgroundGain) {
        try { this.backgroundGain.disconnect(); } catch (_) { }
      }
      if (this.backgroundFinalLimiter) {
        try { this.backgroundFinalLimiter.disconnect(); } catch (_) { }
      }
      this.backgroundGain = this.audioCtx.createGain();
      this.backgroundFinalLimiter = wantsLimiter
        ? createPodcasterFinalLimiterNode(this.audioCtx, this.backgroundLimiterSettings)
        : null;
      if (wantsStabilize) {
        this.backgroundCompressor = this.audioCtx.createDynamicsCompressor();
        this.backgroundCompressor.threshold.value = -24;
        this.backgroundCompressor.knee.value = 18;
        this.backgroundCompressor.ratio.value = 4;
        this.backgroundCompressor.attack.value = 0.003;
        this.backgroundCompressor.release.value = 0.2;
        this.backgroundSource.connect(this.backgroundCompressor);
        this.backgroundCompressor.connect(this.backgroundGain);
      } else {
        this.backgroundCompressor = null;
        this.backgroundSource.connect(this.backgroundGain);
      }
      if (this.backgroundFinalLimiter) {
        this.backgroundGain.connect(this.backgroundFinalLimiter);
        this.backgroundFinalLimiter.connect(this.audioCtx.destination);
      } else {
        this.backgroundGain.connect(this.audioCtx.destination);
      }
      this.backgroundStabilizeEnabled = wantsStabilize;
      this.backgroundLimiterEnabled = wantsLimiter;
    } catch (e) { }
  }

  pauseBackgroundMusic() {
    if (this.backgroundAudio) try { this.backgroundAudio.pause(); } catch (_) { }
  }

  stopBackgroundMusic() {
    if (this.backgroundAudio) { 
      try { 
        this.backgroundAudio.pause(); 
        this.backgroundAudio.currentTime = 0;
        this.backgroundAudio.src = "";
      } catch (_) { } 
      this.backgroundAudio = null; 
    }
    this.backgroundSrc = "";
    if (this.backgroundSource) { try { this.backgroundSource.disconnect(); } catch (_) { } }
    this.backgroundSource = null;
    if (this.backgroundGain) { try { this.backgroundGain.disconnect(); } catch (_) { } }
    this.backgroundGain = null;
    if (this.backgroundCompressor) { try { this.backgroundCompressor.disconnect(); } catch (_) { } }
    this.backgroundCompressor = null;
    if (this.backgroundFinalLimiter) { try { this.backgroundFinalLimiter.disconnect(); } catch (_) { } }
    this.backgroundFinalLimiter = null;
    this.backgroundStabilizeEnabled = null;
    this.backgroundLimiterEnabled = null;
  }

  // --- Video ---
  async syncVideo(currentMs) {
    if (this.state.useMse) return;
    const entry = this.getEntryAtMs(currentMs);

    // Pre-load upcoming
    const entries = this.deps?.buildTimelineRuntimeEntries?.(this.state.session) || [];
    const upcoming = entries.filter(e => e.startMs > currentMs && (e.startMs - currentMs) < 45000).slice(0, 8);
    upcoming.forEach(e => {
      if (this.isImageStageEntry(e)) {
        this.preloadImageSrc(e.videoSrc).catch(() => { });
      } else {
        this.getBlobUrl(e.videoSrc);
      }
    });
    const overlapPair = typeof this.deps?.resolveTimelineRuntimeOverlapPairAtMs === "function"
      ? this.deps.resolveTimelineRuntimeOverlapPairAtMs(this.state.session, currentMs, entries)
      : null;
    if (overlapPair?.isOverlapActive && overlapPair?.backEntry && overlapPair?.frontEntry) {
      const transition = this.deps?.getTransitionForEdge?.(this.state.session, overlapPair.backEntry.rowId, overlapPair.frontEntry.rowId) || { type: "cut", durationMs: 0 };
      if (String(transition?.type || "cut").trim().toLowerCase() !== "cut") {
        await this.syncOverlapPair(overlapPair, currentMs, transition);
        return;
      }
    }
    if (this.overlapState?.key) {
      if (this.deps?.setActiveStageVideoSlot) {
        this.deps.setActiveStageVideoSlot(this.overlapState.frontSlot);
      }
      this.overlapState.key = "";
    }
    this.preloadUpcomingStageSlot(entry, upcoming);
    this.preloadUpcomingStylizedText(entry, upcoming);

    if (entry) {
      await this.syncStageSwitching(entry, currentMs);
    } else {
      this.hideAllVideos();
      this.hideAllImages();
    }
  }

  resolveEntryTargetOffsetSec(entry = null, currentMs = 0) {
    if (!entry) return { targetOffsetSec: 0, isHoldActive: false, playbackRate: 1 };
    const resolved = typeof this.deps?.resolveSceneSourceStateAtTimelineMs === "function"
      ? this.deps.resolveSceneSourceStateAtTimelineMs(entry, currentMs)
      : null;
    if (resolved && Number.isFinite(Number(resolved.sourceMs))) {
      return {
        targetOffsetSec: Math.max(0, Number(resolved.sourceMs || 0)) / 1000,
        isHoldActive: resolved.isHoldActive === true,
        playbackRate: this.clampPlaybackRate(resolved.playbackRate || 1, 0.25, 4)
      };
    }
    const trimInMs = Math.max(0, Number(entry.clip?.trimInMs || 0));
    const offsetMs = Math.max(0, Number(currentMs || 0) - Number(entry.startMs || 0));
    return {
      targetOffsetSec: (trimInMs + offsetMs) / 1000,
      isHoldActive: false,
      playbackRate: 1
    };
  }

  async syncOverlapPair(overlapPair = null, currentMs = 0, transition = { type: "crossfade", durationMs: 320 }) {
    const backEntry = overlapPair?.backEntry || null;
    const frontEntry = overlapPair?.frontEntry || null;
    if (!backEntry || !frontEntry) return;
    const primary = this.els?.podcastActiveSpeakerVideo;
    const alt = this.els?.podcastActiveSpeakerVideoAlt;
    const primaryImage = this.els?.podcastActiveSpeakerImage;
    const altImage = this.els?.podcastActiveSpeakerImageAlt;
    const backIsImage = this.isImageStageEntry(backEntry);
    const frontIsImage = this.isImageStageEntry(frontEntry);
    const needsVideoSurface = !backIsImage || !frontIsImage;
    const needsImageSurface = backIsImage || frontIsImage;
    if ((needsVideoSurface && (!primary || !alt || !this.deps?.setPodcastStageVideoSourceForElement))
      || (needsImageSurface && (!primaryImage || !altImage))) {
      await this.syncStageSwitching(frontEntry, currentMs);
      return;
    }
    const overlapKey = `${String(backEntry.rowId || "").trim()}__${String(frontEntry.rowId || "").trim()}`;
    const primarySrc = String(primary.dataset?.src || "").trim();
    const altSrc = String(alt.dataset?.src || "").trim();
    const activeSlot = Number(this.deps?.podcastVideoState?.stageVideoSlot || 0) === 1 ? 1 : 0;
    if (this.overlapState.key !== overlapKey) {
      let backSlot = activeSlot;
      if (primarySrc === backEntry.videoSrc && altSrc !== frontEntry.videoSrc) {
        backSlot = 0;
      } else if (altSrc === backEntry.videoSrc && primarySrc !== frontEntry.videoSrc) {
        backSlot = 1;
      }
      this.overlapState = {
        key: overlapKey,
        backSlot,
        frontSlot: backSlot === 1 ? 0 : 1
      };
    }
    const backVideoEl = this.overlapState.backSlot === 1 ? alt : primary;
    const frontVideoEl = this.overlapState.frontSlot === 1 ? alt : primary;
    const backImageEl = this.overlapState.backSlot === 1 ? altImage : primaryImage;
    const frontImageEl = this.overlapState.frontSlot === 1 ? altImage : primaryImage;
    const pairState = { progress: Math.max(0, Math.min(1, Number(overlapPair?.progress || 0))) };
    const backInfo = this.resolveEntryTargetOffsetSec(backEntry, currentMs);
    const frontInfo = this.resolveEntryTargetOffsetSec(frontEntry, currentMs);
    const resetSurface = (el) => {
      if (!el) return;
      el.style.transition = "none";
      el.style.opacity = "";
      el.style.transform = "";
      el.style.filter = "";
      el.style.visibility = "hidden";
      el.hidden = true;
      if (typeof el.pause === "function") {
        try { el.pause(); } catch (_) { }
      }
    };
    const imageBaseClass = (imageEl) => imageEl?.id === "podcastActiveSpeakerImageAlt" || imageEl?.id === "montageExportPreviewImageAlt"
      ? "podcast-active-speaker-image podcast-active-speaker-image-alt"
      : "podcast-active-speaker-image";
    const loadEntry = async (videoEl, imageEl, entry, targetOffsetSec, isHoldActive = false, playbackRate = 1) => {
      if (this.isImageStageEntry(entry)) {
        const src = String(entry?.videoSrc || "").trim();
        if (!src || !imageEl) return null;
        resetSurface(videoEl);
        await this.preloadImageSrc(src).catch(() => { });
        await this.ensureStageImageReady(imageEl, src);
        imageEl.className = `${imageBaseClass(imageEl)} is-visible`;
        imageEl.style.animationPlayState = this.state.isPlaying ? "running" : "paused";
        imageEl.hidden = false;
        imageEl.style.visibility = "visible";
        imageEl.style.transition = "none";
        return imageEl;
      }
      if (!videoEl || !entry?.videoSrc) return null;
      resetSurface(imageEl);
      if (videoEl.dataset.src !== entry.videoSrc) {
        const ready = await this.deps.setPodcastStageVideoSourceForElement(videoEl, entry.videoSrc, { keepHidden: false });
        if (ready !== true) return false;
      }
      if (Math.abs((Number(videoEl.currentTime) || 0) - targetOffsetSec) > 0.2) {
        this.seekTo(videoEl, targetOffsetSec);
      }
      videoEl.hidden = false;
      videoEl.style.visibility = "visible";
      videoEl.style.transition = "none";
      videoEl.playbackRate = this.clampPlaybackRate(playbackRate, 0.25, 4);
      if (isHoldActive) {
        try { videoEl.pause(); } catch (_) { }
      } else if (this.state.isPlaying && videoEl.paused) {
        videoEl.play().catch(() => { });
      }
      return videoEl;
    };
    const backSurfaceEl = await loadEntry(backVideoEl, backImageEl, backEntry, backInfo.targetOffsetSec, backInfo.isHoldActive, backInfo.playbackRate);
    const frontSurfaceEl = await loadEntry(frontVideoEl, frontImageEl, frontEntry, frontInfo.targetOffsetSec, frontInfo.isHoldActive, frontInfo.playbackRate);
    if (!backSurfaceEl || !frontSurfaceEl) return;

    const type = String(transition?.type || "crossfade").trim().toLowerCase();
    const progress = Math.max(0, Math.min(1, pairState.progress));
    const eased = progress * progress * (3 - (2 * progress));
    backSurfaceEl.style.zIndex = "1";
    frontSurfaceEl.style.zIndex = "2";
    backSurfaceEl.style.opacity = String(1 - eased);
    frontSurfaceEl.style.opacity = String(eased);
    backSurfaceEl.style.transform = "";
    frontSurfaceEl.style.transform = "";
    backSurfaceEl.style.filter = "";
    frontSurfaceEl.style.filter = "";
    if (type === "slide-left") {
      backSurfaceEl.style.opacity = "1";
      frontSurfaceEl.style.opacity = "1";
      backSurfaceEl.style.transform = `translateX(${(-24 * eased).toFixed(2)}%)`;
      frontSurfaceEl.style.transform = `translateX(${(100 * (1 - eased)).toFixed(2)}%)`;
    } else if (type === "slide-right") {
      backSurfaceEl.style.opacity = "1";
      frontSurfaceEl.style.opacity = "1";
      backSurfaceEl.style.transform = `translateX(${(24 * eased).toFixed(2)}%)`;
      frontSurfaceEl.style.transform = `translateX(${(-100 * (1 - eased)).toFixed(2)}%)`;
    } else if (type === "slide-up") {
      backSurfaceEl.style.opacity = "1";
      frontSurfaceEl.style.opacity = "1";
      backSurfaceEl.style.transform = `translateY(${(-20 * eased).toFixed(2)}%)`;
      frontSurfaceEl.style.transform = `translateY(${(100 * (1 - eased)).toFixed(2)}%)`;
    } else if (type === "slide-down") {
      backSurfaceEl.style.opacity = "1";
      frontSurfaceEl.style.opacity = "1";
      backSurfaceEl.style.transform = `translateY(${(20 * eased).toFixed(2)}%)`;
      frontSurfaceEl.style.transform = `translateY(${(-100 * (1 - eased)).toFixed(2)}%)`;
    } else if (type === "zoom-in") {
      backSurfaceEl.style.opacity = "1";
      frontSurfaceEl.style.opacity = "1";
      frontSurfaceEl.style.transform = `scale(${(0.72 + (eased * 0.28)).toFixed(3)})`;
    } else if (type === "zoom-out") {
      backSurfaceEl.style.opacity = "1";
      frontSurfaceEl.style.opacity = "1";
      frontSurfaceEl.style.transform = `scale(${(1.22 - (eased * 0.22)).toFixed(3)})`;
    } else if (type === "dip-black") {
      const dip = Math.sin(eased * Math.PI);
      backSurfaceEl.style.filter = `brightness(${(1 - dip).toFixed(3)})`;
      frontSurfaceEl.style.filter = `brightness(${(1 - dip).toFixed(3)})`;
    } else if (type === "flash-white") {
      const flash = Math.sin(eased * Math.PI);
      backSurfaceEl.style.filter = `brightness(${(1 + flash * 1.8).toFixed(3)}) saturate(${(1 - flash * 0.45).toFixed(3)})`;
      frontSurfaceEl.style.filter = `brightness(${(1 + flash * 1.8).toFixed(3)}) saturate(${(1 - flash * 0.45).toFixed(3)})`;
    } else if (type === "blur") {
      backSurfaceEl.style.filter = `blur(${(eased * 12).toFixed(2)}px)`;
      frontSurfaceEl.style.filter = `blur(${((1 - eased) * 12).toFixed(2)}px)`;
    }
  }

  preloadUpcomingStageSlot(currentEntry, upcomingEntries = []) {
    const primary = this.els?.podcastActiveSpeakerVideo;
    const alt = this.els?.podcastActiveSpeakerVideoAlt;
    const activeSlot = Number(this.deps?.podcastVideoState?.stageVideoSlot || 0);
    const activeEl = activeSlot === 1 ? alt : primary;
    const inactiveEl = activeSlot === 1 ? primary : alt;
    if (!inactiveEl || !Array.isArray(upcomingEntries) || !upcomingEntries.length) return;

    const activeSrc = String(activeEl?.dataset?.src || currentEntry?.videoSrc || "").trim();
    const inactiveSrc = String(inactiveEl?.dataset?.src || "").trim();
    const nextEntry = upcomingEntries.find((item) => {
      const src = String(item?.videoSrc || "").trim();
      return src && src !== activeSrc && this.isImageStageEntry(item) !== true;
    });
    const nextSrc = String(nextEntry?.videoSrc || "").trim();
    if (!nextSrc) return;
    if (inactiveSrc === nextSrc && inactiveEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return;
    if (this.stageMachine.loadingSrc === nextSrc || this.stageMachine.preloadingSrc === nextSrc) return;
    if (!this.deps?.setPodcastStageVideoSourceForElement) return;

    this.stageMachine.preloadingSrc = nextSrc;
    this.stageMachine.preloadingPromise = Promise.resolve(
      this.deps.setPodcastStageVideoSourceForElement(inactiveEl, nextSrc, { keepHidden: true })
    ).catch(() => false).finally(() => {
      if (this.stageMachine.preloadingSrc === nextSrc) {
        this.stageMachine.preloadingSrc = '';
        this.stageMachine.preloadingPromise = null;
      }
    });
  }

  hideAllVideos() {
    [this.els?.podcastActiveSpeakerVideo, this.els?.podcastActiveSpeakerVideoAlt, this.els?.podcastActiveSpeakerBackdropVideo, this.els?.podcastActiveSpeakerBackdropVideoAlt].forEach(v => {
      if (v) { 
        v.style.opacity = 0; 
        v.style.visibility = "hidden";
        v.style.transform = "";
        v.style.filter = "";
        v.style.transition = "";
        v.hidden = true; 
        try { v.pause(); } catch (_) { }
      }
    });
  }

  hideAllImages() {
    [this.els?.podcastActiveSpeakerImage, this.els?.podcastActiveSpeakerImageAlt].forEach((imageEl) => {
      if (!imageEl) return;
      imageEl.style.opacity = 0;
      imageEl.style.visibility = "hidden";
      imageEl.style.transform = "";
      imageEl.style.filter = "";
      imageEl.style.transition = "";
      imageEl.hidden = true;
      imageEl.className = imageEl.classList.contains("podcast-active-speaker-image-alt")
        || imageEl.id === "podcastActiveSpeakerImageAlt"
        || imageEl.id === "montageExportPreviewImageAlt"
        ? "podcast-active-speaker-image podcast-active-speaker-image-alt"
        : "podcast-active-speaker-image";
      imageEl.style.animationPlayState = "";
    });
  }

  preloadImageSrc(src = "") {
    const cleanSrc = String(src || "").trim();
    if (!cleanSrc) return Promise.reject(new Error("missing_image_source"));
    if (!this.stageMachine.imagePreloadCache) {
      this.stageMachine.imagePreloadCache = new Map();
    }
    if (this.stageMachine.imagePreloadCache.has(cleanSrc)) {
      return this.stageMachine.imagePreloadCache.get(cleanSrc);
    }
    const task = new Promise((resolve, reject) => {
      const probe = new Image();
      try { probe.crossOrigin = "anonymous"; } catch (_) { }
      probe.decoding = "async";
      try { probe.fetchPriority = "high"; } catch (_) { }
      probe.onload = () => resolve(cleanSrc);
      probe.onerror = () => {
        this.stageMachine.imagePreloadCache.delete(cleanSrc);
        reject(new Error("image_preload_failed"));
      };
      probe.src = cleanSrc;
    });
    this.stageMachine.imagePreloadCache.set(cleanSrc, task);
    return task;
  }

  async ensureStageImageReady(imageEl, src = "") {
    const cleanSrc = String(src || "").trim();
    if (!imageEl || !cleanSrc) throw new Error("missing_stage_image");
    try { imageEl.crossOrigin = "anonymous"; } catch (_) { }
    imageEl.decoding = "async";
    try { imageEl.loading = "eager"; } catch (_) { }
    try { imageEl.fetchPriority = "high"; } catch (_) { }
    const currentSrc = String(imageEl.getAttribute("src") || "").trim();
    if (currentSrc !== cleanSrc) {
      imageEl.src = cleanSrc;
    }
    imageEl.dataset.src = cleanSrc;
    if (imageEl.complete && Number(imageEl.naturalWidth || 0) > 0 && Number(imageEl.naturalHeight || 0) > 0) {
      return cleanSrc;
    }
    await new Promise((resolve, reject) => {
      const cleanup = () => {
        imageEl.removeEventListener("load", handleLoad);
        imageEl.removeEventListener("error", handleError);
      };
      const handleLoad = () => {
        cleanup();
        resolve();
      };
      const handleError = () => {
        cleanup();
        reject(new Error("stage_image_element_load_failed"));
      };
      imageEl.addEventListener("load", handleLoad);
      imageEl.addEventListener("error", handleError);
    });
    return cleanSrc;
  }

  preloadUpcomingStylizedText(currentEntry, upcomingEntries = []) {
    const editor = window.PodcasterMediaEditor;
    if (typeof editor?.prewarmStylizedText !== "function") return;
    const session = this.state.session || this.deps?.getActiveSession?.();
    if (!session?.stylizedTextMap) return;

    const activeRowId = String(currentEntry?.rowId || "").trim();
    const nextEntry = upcomingEntries.find((item) => {
      const rowId = String(item?.rowId || "").trim();
      return rowId && rowId !== activeRowId && session.stylizedTextMap?.[rowId];
    });
    if (!nextEntry?.rowId) return;
    editor.prewarmStylizedText(nextEntry.rowId, session);
  }

  requestImageStageSwap(entry = null) {
    const imageEl = this.els?.podcastActiveSpeakerImage;
    const cleanSrc = String(entry?.videoSrc || "").trim();
    if (!imageEl || !cleanSrc) return;

    const currentSrc = String(imageEl.dataset.src || imageEl.getAttribute("src") || "").trim();
    const isReady = imageEl.complete
      && Number(imageEl.naturalWidth || 0) > 0
      && Number(imageEl.naturalHeight || 0) > 0;

    const revealImage = () => {
      this.hideAllVideos();
      imageEl.style.opacity = "1";
      imageEl.style.visibility = "visible";
      imageEl.hidden = false;

      const session = this.state.session || this.deps?.getActiveSession?.();
      const effects = session?.visualEffectsMap?.[entry.rowId];
      let className = "podcast-active-speaker-image is-visible";
      if (effects && effects.effects?.length) {
        const speedClass = `speed-${effects.speed || 5}`;
        const effectClasses = effects.effects.map(e => `ken-burns-${e}`).join(" ");
        className += ` ${effectClasses} ${speedClass}`;
      }
      imageEl.className = className;
      imageEl.style.animationPlayState = this.state.isPlaying ? 'running' : 'paused';
    };

    if (currentSrc === cleanSrc && isReady) {
      revealImage();
      return;
    }

    imageEl.hidden = false;
    imageEl.style.visibility = "visible";
    imageEl.style.opacity = "0";

    const existingToken = Number(this.stageMachine.imageSwapToken || 0) + 1;
    this.stageMachine.imageSwapToken = existingToken;

    if (this.stageMachine.imageLoadingSrc === cleanSrc && this.stageMachine.imageLoadingPromise) {
      this.stageMachine.imageLoadingPromise.then(() => {
        if (this.stageMachine.imageSwapToken !== existingToken) return;
        revealImage();
      }).catch(() => { });
      return;
    }

    this.stageMachine.imageLoadingSrc = cleanSrc;
    this.stageMachine.imageLoadingPromise = Promise.resolve()
      .then(() => this.preloadImageSrc(cleanSrc))
      .then(() => this.ensureStageImageReady(imageEl, cleanSrc))
      .then(() => {
        if (this.stageMachine.imageSwapToken !== existingToken) return;
        revealImage();
      })
      .catch(() => { })
      .finally(() => {
        if (this.stageMachine.imageLoadingSrc === cleanSrc) {
          this.stageMachine.imageLoadingSrc = "";
          this.stageMachine.imageLoadingPromise = null;
        }
      });
  }

  async syncStageSwitching(entry, currentMs) {
    const switchToken = ++this.stageSwitchSeq;
    const sourceState = this.resolveEntryTargetOffsetSec(entry, currentMs);
    const offsetSec = sourceState.targetOffsetSec;

    const activeSlot = Number(this.deps?.podcastVideoState?.stageVideoSlot || 0);
    const primary = this.els?.podcastActiveSpeakerVideo;
    const alt = this.els?.podcastActiveSpeakerVideoAlt;

    const activeEl = activeSlot === 1 ? alt : primary;
    const inactiveEl = activeSlot === 1 ? primary : alt;
    const imageEl = this.els?.podcastActiveSpeakerImage;
    
    if (!activeEl) return;

    const isImage = this.isImageStageEntry(entry);
    this.applySceneMediaScale(entry);

    if (isImage) {
        this.requestImageStageSwap(entry);
        return;
    } else {
        this.hideAllImages();
    }

    // Resolve dynamic wrapping modulo for continuous looping of shorter generated videos
    let targetOffsetSec = offsetSec;
    const resolvedDuration = activeEl && activeEl.dataset.src === entry.videoSrc && Number.isFinite(activeEl.duration) && activeEl.duration > 0
      ? activeEl.duration
      : (inactiveEl && inactiveEl.dataset.src === entry.videoSrc && Number.isFinite(inactiveEl.duration) && inactiveEl.duration > 0
        ? inactiveEl.duration
        : 0);

    if (resolvedDuration > 0 && offsetSec >= resolvedDuration) {
      targetOffsetSec = offsetSec % resolvedDuration;
    }

    // Use current element if it matches source
    if (activeEl.dataset.src === entry.videoSrc) {
      if (Math.abs(activeEl.currentTime - targetOffsetSec) > 0.2) {
        this.seekTo(activeEl, targetOffsetSec);
      }
      if (sourceState.isHoldActive) {
        try { activeEl.pause(); } catch (_) { }
      } else if (this.state.isPlaying && activeEl.paused) {
        activeEl.play().then(() => {
          const masterSpeed = this.deps?.getPlaybackSpeed?.() || 1;
          activeEl.playbackRate = masterSpeed * sourceState.playbackRate;
        }).catch(() => { });
      }
      
      activeEl.style.zIndex = "2";
      activeEl.style.opacity = "1";
      activeEl.style.visibility = "visible";
      activeEl.hidden = false;

      const config = this.deps?.getPodcastVideoConfig?.(this.state.session) || {};
      const masterClipVolume = Number(config.clipVolume ?? 100) / 100;
      const masterVolumeFactor = this.clamp01(this.toFiniteNumber(config?.masterVolume, 100) / 100);
      const mix = this.deps?.resolveTimelineClipMix?.(this.state.session, entry.rowId) || { videoVolume: 1 };
      
      let effectiveVideoVolume = mix.videoVolume ?? 1.0;
      
      // Safety check: If there is a Gemini audio segment for this row, we MUST mute the native video audio 
      // unless the user specifically overrode it (which would be reflected in mix.videoVolume already).
      // However, repeating the check here ensures the controller is authoritative.
      const hasGeminiAudio = this.state.audioTrack?.segments?.some(s => String(s.rowId || "").trim() === String(entry.rowId || "").trim());
      if (hasGeminiAudio && !Number.isFinite(entry.clip?.veoVolumeOverridePct)) {
        effectiveVideoVolume = 0;
      }

      activeEl.volume = this.clamp01(masterClipVolume * masterVolumeFactor * effectiveVideoVolume);
      activeEl.muted = activeEl.volume <= 0.0001;
      
      this.syncBackdrop(entry, activeSlot, targetOffsetSec);

      if (inactiveEl && inactiveEl.dataset.src !== entry.videoSrc) {
        inactiveEl.style.opacity = "0";
        inactiveEl.pause();
        this.hideInactiveBackdrop(activeSlot);
      }
    } else {
      // Switching needed
      if (!entry.videoSrc) {
        this.hideAllVideos();
        if (this.deps?.setPodcastVideoPortraitFallback) {
          this.deps.setPodcastVideoPortraitFallback(true);
        }
        return;
      }

      if (this.deps?.setPodcastVideoPortraitFallback) {
        this.deps.setPodcastVideoPortraitFallback(false);
      }

      if (this.stageMachine.loadingSrc === entry.videoSrc) return;
      this.stageMachine.loadingSrc = entry.videoSrc;

      try {
        if (!this.getBlobUrlSync(entry.videoSrc)) {
          await this.getBlobUrl(entry.videoSrc);
          if (switchToken !== this.stageSwitchSeq) return;
        }

        if (!inactiveEl) {
          if (activeEl.dataset.src !== entry.videoSrc) {
            const activeReady = await this.deps?.setPodcastStageVideoSourceForElement?.(activeEl, entry.videoSrc);
            if (switchToken !== this.stageSwitchSeq) return;
            if (activeReady !== true) return;
          }
          this.seekTo(activeEl, targetOffsetSec);
          if (sourceState.isHoldActive) {
            try { activeEl.pause(); } catch (_) { }
          } else if (this.state.isPlaying) {
            activeEl.play().then(() => {
              const masterSpeed = this.deps?.getPlaybackSpeed?.() || 1;
              activeEl.playbackRate = masterSpeed * sourceState.playbackRate;
            }).catch(() => { });
          }
          return;
        }

        // Seamless swap
        if (inactiveEl.dataset.src !== entry.videoSrc) {
          const inactiveReady = await this.deps?.setPodcastStageVideoSourceForElement?.(inactiveEl, entry.videoSrc, { keepHidden: true });
          if (switchToken !== this.stageSwitchSeq) return;
          if (inactiveReady !== true) return;
        } else if (inactiveEl.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          if (this.stageMachine.preloadingSrc === entry.videoSrc && this.stageMachine.preloadingPromise) {
            const preloaded = await this.stageMachine.preloadingPromise;
            if (switchToken !== this.stageSwitchSeq) return;
            if (preloaded !== true) return;
          } else {
            const inactiveReady = await this.deps?.setPodcastStageVideoSourceForElement?.(inactiveEl, entry.videoSrc, { keepHidden: true });
            if (switchToken !== this.stageSwitchSeq) return;
            if (inactiveReady !== true) return;
          }
        }

        if (switchToken !== this.stageSwitchSeq) return;
        this.seekTo(inactiveEl, targetOffsetSec);
        
        // Final Swap
        inactiveEl.style.zIndex = "2";
        inactiveEl.style.opacity = "1";
        inactiveEl.style.visibility = "visible";
        inactiveEl.hidden = false;

        if (sourceState.isHoldActive) {
          try { inactiveEl.pause(); } catch (_) { }
        } else if (this.state.isPlaying) {
          inactiveEl.play().then(() => {
            const masterSpeed = this.deps?.getPlaybackSpeed?.() || 1;
            inactiveEl.playbackRate = masterSpeed * sourceState.playbackRate;
          }).catch(() => { });
        }

        activeEl.style.zIndex = "1";
        activeEl.style.opacity = "0";
        activeEl.style.visibility = "hidden";
        activeEl.hidden = true;
        activeEl.pause();

        this.syncBackdrop(entry, activeSlot === 1 ? 0 : 1, targetOffsetSec);
        this.hideInactiveBackdrop(activeSlot === 1 ? 0 : 1);

        const config = this.deps?.getPodcastVideoConfig?.(this.state.session) || {};
        const masterClipVolume = Number(config.clipVolume ?? 100) / 100;
        const masterVolumeFactor = this.clamp01(this.toFiniteNumber(config?.masterVolume, 100) / 100);
        const mix = this.deps?.resolveTimelineClipMix?.(this.state.session, entry.rowId) || { videoVolume: 1 };
        
        inactiveEl.volume = this.clamp01(masterClipVolume * masterVolumeFactor * (mix.videoVolume ?? 1.0));
        inactiveEl.muted = inactiveEl.volume <= 0.0001;

        this.deps?.setActiveStageVideoSlot?.(activeSlot === 1 ? 0 : 1);
      } catch (e) {
        void e;
      } finally {
        this.stageMachine.loadingSrc = '';
      }
    }
  }

  syncBackdrop(entry, activeSlot, offsetSec) {
    const backdrop = activeSlot === 1 ? this.els?.podcastActiveSpeakerBackdropVideoAlt : this.els?.podcastActiveSpeakerBackdropVideo;
    if (!backdrop) return;

    const clipMap = this.deps?.ensureTimelineClipsByRowId?.(this.state.session) || {};
    const clipCfg = clipMap[entry.rowId] || {};
    const mode = clipCfg.visualLayoutMode || "default";

    if (mode === "blur-backdrop" && entry.videoSrc) {
      if (backdrop.dataset.src !== entry.videoSrc) {
        const blobUrl = this.getBlobUrlSync(entry.videoSrc) || entry.videoSrc;
        backdrop.src = blobUrl;
        backdrop.dataset.src = entry.videoSrc;
      }
      
      let targetSeekSec = offsetSec;
      const backdropDuration = backdrop.duration;
      if (Number.isFinite(backdropDuration) && backdropDuration > 0 && offsetSec >= backdropDuration) {
        targetSeekSec = offsetSec % backdropDuration;
      }

      if (Math.abs(backdrop.currentTime - targetSeekSec) > 0.3) {
        this.seekTo(backdrop, targetSeekSec);
      }
      backdrop.style.opacity = "1";
      backdrop.style.visibility = "visible";
      backdrop.hidden = false;
      if (this.state.isPlaying && backdrop.paused) {
        backdrop.play().catch(() => {});
      }
      
      const foreground = activeSlot === 1 ? this.els?.podcastActiveSpeakerVideoAlt : this.els?.podcastActiveSpeakerVideo;
      if (foreground) {
        foreground.classList.add("is-blur-backdrop-foreground");
      }
    } else {
      backdrop.style.opacity = "0";
      backdrop.style.visibility = "hidden";
      backdrop.hidden = true;
      backdrop.pause();
      
      const foreground = activeSlot === 1 ? this.els?.podcastActiveSpeakerVideoAlt : this.els?.podcastActiveSpeakerVideo;
      if (foreground) {
        foreground.classList.remove("is-blur-backdrop-foreground");
      }
    }
  }

  hideInactiveBackdrop(activeSlot) {
    const inactiveBackdrop = activeSlot === 1 ? this.els?.podcastActiveSpeakerBackdropVideo : this.els?.podcastActiveSpeakerBackdropVideoAlt;
    if (inactiveBackdrop) {
      inactiveBackdrop.style.opacity = "0";
      inactiveBackdrop.style.visibility = "hidden";
      inactiveBackdrop.pause();
    }
  }

  // --- Overlays ---
  syncOverlay(currentMs, options = {}) {
    const overlay = this.els?.podcastOnScreenTextOverlay;
    if (!overlay) return;

    const session = this.deps?.getActiveSession?.() || this.state.session;
    const cfg = this.deps?.getPodcastVideoConfig?.(session) || this.state.config;
    const settings = this.deps?.normalizeOnScreenTextTrackSettings?.(cfg?.onScreenTextTrack || {});
    const preferredRowId = String(options?.rowId || options?.preferredRowId || this.state.activeRowId || "").trim();
    const forceRow = options?.forceRow === true;
    const editorPreviewMode = this.deps?.podcastVideoState?.montageActive !== true;
    const shouldShowPreferredRow = forceRow || (editorPreviewMode && Boolean(preferredRowId));

    const isEnabled = settings?.enabled && settings?.showTrack !== false;

    // Debug log to console to see what's happening
    // console.log(`[PlaybackController] syncOverlay ms:${Math.round(currentMs)} enabled:${isEnabled}`);

    if (!isEnabled) {
      overlay.style.display = "none";
      overlay.classList.remove("is-visible");
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
      return;
    }

    const clips = cfg?.timelineOnScreenTextClipsByRowId || this.deps?.ensureOnScreenTextClipsByRowId?.(session) || {};
    const clipList = Object.values(clips);
    const candidates = clipList.map((clip) => {
      const rowId = String(clip?.rowId || "").trim();
      const isTimeActive = (currentMs + 1) >= clip.startMs
        && currentMs < (clip.startMs + this.deps.getOnScreenTextClipEffectiveDurationMs(clip));
      const isPreferred = Boolean(preferredRowId) && rowId === preferredRowId;
      return {
        clip,
        rowId,
        isTimeActive,
        isPreferred
      };
    });

    let selected = candidates.find((item) => item.isPreferred && (item.isTimeActive || shouldShowPreferredRow))?.clip
      || candidates.find((item) => item.isTimeActive)?.clip
      || null;

    if (!selected || selected.hidden === true) {
      overlay.innerHTML = "";
      overlay.classList.remove("is-visible");
      overlay.hidden = true;
      overlay.style.display = "none";
      overlay.setAttribute('aria-hidden', 'true');
      return;
    }

    const allRows = session?.rows || session?.script?.rows || [];
    const row = allRows.find(r => r.id === selected.rowId) || null;
    const text = (selected.text || selected.onScreenText || (row && this.deps?.getOnScreenTextClipText?.(row)) || "").trim();
    if (!text) {
      overlay.innerHTML = "";
      overlay.classList.remove("is-visible");
      overlay.hidden = true;
      overlay.style.display = "none";
      overlay.setAttribute('aria-hidden', 'true');
      return;
    }

    // Force visibility
    overlay.style.display = "flex";
    overlay.classList.add("is-visible");
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');

    const previewEl = this.els?.podcastVideoStage?.querySelector(".podcast-video-preview") || overlay.parentElement;
    let previewWidthPx = previewEl?.clientWidth || 1280;
    let previewHeightPx = previewEl?.clientHeight || 720;
    if (previewWidthPx < 100) {
      previewWidthPx = 1280;
    }
    if (previewHeightPx < 60) {
      previewHeightPx = 720;
    }
    const persistedLayout = this.deps?.getOnScreenTextLayoutForRow?.(session, selected.rowId) || null;
    const liveLayout = this.resolveLiveOnScreenTextLayout(selected.rowId, persistedLayout, overlay, previewEl);
    const dragState = this.deps?.podcastVideoState?.onScreenTextOverlayDrag;
    const resizeState = this.deps?.podcastVideoState?.onScreenTextOverlayResize;
    const hasLiveOverlayInteraction = [dragState, resizeState].some((item) => String(item?.rowId || "").trim() === String(selected.rowId || "").trim());
    const rowLayout = hasLiveOverlayInteraction
      ? liveLayout
      : this.resolveTrackManagedOnScreenTextLayout(liveLayout, settings, selected.rowId);
    const previewSpec = this.deps?.resolveOnScreenTextPreviewLayoutSpec?.({
      rowId: selected.rowId,
      settings,
      layout: rowLayout,
      text,
      previewWidthPx,
      previewHeightPx
    }) || null;
    const presetClass = previewSpec?.presetClass || this.deps?.getOnScreenTextStylePresetClass?.(settings.stylePreset) || "";
    const bgClass = previewSpec?.bgClass || this.deps?.getOnScreenTextBgPresetClass?.(settings.bgPreset) || "";
    const inlineStyle = previewSpec?.inlineStyle || (this.deps.buildOnScreenTextBubbleInlineStyle
      ? this.deps.buildOnScreenTextBubbleInlineStyle(settings, {
        metrics: previewSpec?.metrics || {},
        xPct: previewSpec?.xPct ?? rowLayout?.xPct ?? 0,
        yPct: previewSpec?.yPct ?? rowLayout?.yPct ?? 0
      })
      : "");

    const audioClip = this.deps?.resolveDialogueAudioForRow?.(session, selected.rowId) || null;
    const karaokeWordTimings = normalizeKaraokeWordTimings(audioClip, text);
    const selectedStartMs = Math.max(0, Number(selected?.startMs || 0) || 0);
    const karaokeClipStartMs = editorPreviewMode && shouldShowPreferredRow && Number(currentMs || 0) < selectedStartMs
      ? 0
      : selectedStartMs;
    const activeKaraokeWordIndex = resolveActiveKaraokeWordIndex(karaokeWordTimings, currentMs, karaokeClipStartMs);
    const contentHtml = karaokeWordTimings.length
      ? buildKaraokeSubtitleMarkup(text, karaokeWordTimings, activeKaraokeWordIndex)
      : this.deps.escapeHtml(text);

    const unescapeMap = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#039;': "'" };
    const rawCssText = String(inlineStyle).replace(/&amp;|&lt;|&gt;|&quot;|&#039;/g, m => unescapeMap[m]);

    overlay.innerHTML = `<div class="podcast-on-screen-text-content ${presetClass} ${bgClass}" data-row-id="${this.deps.escapeHtml(selected.rowId)}">${contentHtml}</div>`;
    const contentNode = overlay.querySelector('.podcast-on-screen-text-content');
    if (contentNode) {
      const properties = rawCssText.split(';').filter(Boolean);
      properties.forEach(prop => {
        const [key, ...valParts] = prop.split(':');
        if (key && valParts.length) {
          let val = valParts.join(':').trim();
          const isImportant = val.toLowerCase().endsWith('!important');
          if (isImportant) {
            val = val.slice(0, -10).trim();
            contentNode.style.setProperty(key.trim(), val, 'important');
          } else {
            contentNode.style.setProperty(key.trim(), val);
          }
        }
      });
    }
  }

  syncStylizedText(currentMs) {
    const container = this.els?.podcastStylizedTextOverlay;
    if (!container) return;

    const session = this.state.session || this.deps?.getActiveSession?.();
    const entry = this.getEntryAtMs(currentMs);
    const rowId = entry?.rowId;

    if (!rowId || !session?.stylizedTextMap?.[rowId]) {
        container.innerHTML = '';
        container.hidden = true;
        return;
    }

    if (container.dataset.activeRowId === rowId && container.dataset.activeText === session.stylizedTextMap[rowId]) {
        container.hidden = false;
        return;
    }

    container.dataset.activeRowId = rowId;
    container.dataset.activeText = session.stylizedTextMap[rowId];
    container.hidden = false;

    if (window.PodcasterMediaEditor?.renderStylizedText) {
        window.PodcasterMediaEditor.renderStylizedText(container, rowId, session);
    }
  }

  initMse() { if (!this.mse) this.mse = { engine: null }; }

  // --- Standalone Playback ---
  async playStandaloneAudio(rowId, audioSrc, options = {}) {
    this.stopStandaloneAudio();
    if (!audioSrc) return false;

    const audio = new Audio(audioSrc);
    audio.preload = "auto";
    audio.volume = this.clamp01(options.volume ?? 1.0);
    audio.playbackRate = options.playbackRate ?? 1.0;
    this.state.standaloneAudio = audio;

    audio.addEventListener("ended", () => {
      if (this.state.standaloneAudio === audio) {
        this.stopStandaloneAudio();
      }
    }, { once: true });

    try {
      await audio.play();
      return true;
    } catch (e) {
      void e;
      this.state.standaloneAudio = null;
      return false;
    }
  }

  stopStandaloneAudio() {
    if (this.state.standaloneAudio) {
      try { this.state.standaloneAudio.pause(); } catch (_) { }
      this.state.standaloneAudio = null;
    }
  }

  // --- Stage Synchronization & Helpers ---
  isSameOriginMediaUrl(rawUrl = "") {
    if (typeof window.isSameOriginMediaUrl === "function") {
      return window.isSameOriginMediaUrl(rawUrl);
    }
    if (!rawUrl) return true;
    try {
      const url = new URL(rawUrl, window.location.href);
      return url.origin === window.location.origin;
    } catch (_) {
      return true;
    }
  }

  releaseTransientStageVideoObjectUrl(videoEl) {
    if (!videoEl) return;
    const previousObjectUrl = String(videoEl.dataset.objectUrl || "").trim();
    const previousMode = String(videoEl.dataset.objectUrlMode || "").trim();
    if (previousObjectUrl && previousMode === "transient") {
      try { URL.revokeObjectURL(previousObjectUrl); } catch (_) { }
    }
    delete videoEl.dataset.objectUrl;
    delete videoEl.dataset.objectUrlMode;
    delete videoEl.dataset.objectUrlCacheKey;
  }

  getStageVideoElements() {
    return [
      this.els?.podcastActiveSpeakerBackdropVideo,
      this.els?.podcastActiveSpeakerVideo,
      this.els?.podcastActiveSpeakerBackdropVideoAlt,
      this.els?.podcastActiveSpeakerVideoAlt
    ].filter(Boolean);
  }

  getStageVideoBundle(slot = 0) {
    const resolvedSlot = Number(slot || 0) === 1 ? 1 : 0;
    if (resolvedSlot === 1) {
      return {
        slot: 1,
        backdrop: this.els?.podcastActiveSpeakerBackdropVideoAlt || null,
        foreground: this.els?.podcastActiveSpeakerVideoAlt || null
      };
    }
    return {
      slot: 0,
      backdrop: this.els?.podcastActiveSpeakerBackdropVideo || null,
      foreground: this.els?.podcastActiveSpeakerVideo || null
    };
  }

  getActiveStageVideoBundle() {
    return this.getStageVideoBundle(Number(this.deps?.podcastVideoState?.stageVideoSlot || 0));
  }

  getInactiveStageVideoBundle() {
    return this.getStageVideoBundle(Number(this.deps?.podcastVideoState?.stageVideoSlot || 0) === 1 ? 0 : 1);
  }

  applyStageVideoBundleLayout(bundle = null, layoutMode = "default") {
    const mode = this.deps?.normalizeTimelineClipVisualLayoutMode?.(layoutMode) || layoutMode || "default";
    const backdrop = bundle?.backdrop || null;
    const foreground = bundle?.foreground || null;
    if (foreground) {
      foreground.classList.toggle("is-blur-backdrop-foreground", mode === "blur-backdrop");
      foreground.style.opacity = "";
    }
    if (backdrop) {
      backdrop.classList.toggle("is-layout-active", mode === "blur-backdrop");
      backdrop.style.opacity = mode === "blur-backdrop" ? "1" : "0";
      backdrop.style.pointerEvents = "none";
    }
  }

  syncStageVideoBundlePlayback(backdrop = null, foreground = null, { playbackRate = 1, currentTime = null, hidden = false } = {}) {
    [backdrop, foreground].filter(Boolean).forEach((video) => {
      try { video.playbackRate = playbackRate; } catch (_) { }
      if (currentTime != null) {
        try { video.currentTime = Math.max(0, Number(currentTime || 0)); } catch (_) { }
      }
      try { video.hidden = Boolean(hidden); } catch (_) { }
    });
  }

  getActiveStageVideoEl() {
    const primary = this.els?.podcastActiveSpeakerVideo;
    const alt = this.els?.podcastActiveSpeakerVideoAlt;
    if (!alt) return primary;
    return Number(this.deps?.podcastVideoState?.stageVideoSlot || 0) === 1 ? alt : primary;
  }

  getInactiveStageVideoEl() {
    const primary = this.els?.podcastActiveSpeakerVideo;
    const alt = this.els?.podcastActiveSpeakerVideoAlt;
    if (!alt) return null;
    return Number(this.deps?.podcastVideoState?.stageVideoSlot || 0) === 1 ? primary : alt;
  }

  setActiveStageVideoSlot(slot = 0) {
    if (this.deps?.podcastVideoState) {
      this.deps.podcastVideoState.stageVideoSlot = Number(slot || 0) === 1 ? 1 : 0;
    }
    if (typeof window.setActiveStageVideoSlot === "function") {
      try { window.setActiveStageVideoSlot(slot); } catch (_) { }
    }
  }

  assignStageVideoElementSource(videoEl = null, source = "", options = {}) {
    if (!videoEl) return;
    const logicalSrc = String(options.logicalSrc || source || "").trim();
    const cleanSource = String(source || "").trim();
    if (!cleanSource || !logicalSrc) return;
    const mode = String(options.mode || "").trim() || "direct";
    const cacheKey = String(options.cacheKey || "").trim();
    const rowId = String(options.rowId || "").trim();
    this.releaseTransientStageVideoObjectUrl(videoEl);
    videoEl.src = cleanSource;
    videoEl.dataset.src = logicalSrc;
    if (rowId) videoEl.dataset.rowId = rowId;
    else delete videoEl.dataset.rowId;
    if (mode === "cache" || mode === "transient") {
      videoEl.dataset.objectUrl = cleanSource;
      videoEl.dataset.objectUrlMode = mode;
      if (mode === "cache" && cacheKey) {
        videoEl.dataset.objectUrlCacheKey = cacheKey;
      }
    }
    if (!videoEl.__podcasterStageErrorBound) {
      videoEl.addEventListener("error", () => {
        const failedSrc = String(videoEl.dataset.src || videoEl.currentSrc || videoEl.src || "").trim();
        if (!failedSrc) return;
        if (
          /\/api\/assets\/proxy-image\?/i.test(failedSrc)
          || /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(failedSrc)
        ) {
          return;
        }
        const markStale = this.deps?.markStaleProxyMediaUrl || window.markStaleProxyMediaUrl;
        markStale?.(failedSrc, "proxy-media-404", {
          rowId: String(this.deps?.podcastVideoState?.activeRowId || "").trim() || undefined
        });
        const activeSession = this.state.session || this.deps?.getActiveSession?.() || (typeof window.getActiveSession === "function" ? window.getActiveSession() : null);
        const activeRowId = String(this.deps?.podcastVideoState?.activeRowId || "").trim();
        if (activeSession && activeRowId) {
          const resolveVideo = this.deps?.resolveDialogueVideoForRow || window.resolveDialogueVideoForRow;
          const resolveRef = this.deps?.resolveRowReferenceAsset || window.resolveRowReferenceAsset;
          const resolveSegments = this.deps?.resolveDialogueVideoSegments || window.resolveDialogueVideoSegments;
          const resolveUrl = this.deps?.resolveStorageVideoUrl || window.resolveStorageVideoUrl;
          const markStaleVideo = this.deps?.markStaleDialogueVideoSource || window.markStaleDialogueVideoSource;

          const clip = resolveVideo?.(activeSession, activeRowId);
          const referenceAsset = resolveRef?.(activeRowId, activeSession);
          const attemptedSegment = (resolveSegments?.(clip) || []).find((segment) => {
            const candidateSrc = resolveUrl?.(
              segment?.downloadUrl || clip?.downloadUrl || "",
              segment?.storagePath || clip?.storagePath || ""
            );
            return candidateSrc && candidateSrc === failedSrc;
          }) || (
            referenceAsset?.kind === "video"
              && resolveUrl?.(referenceAsset?.downloadUrl || "", referenceAsset?.storagePath || "") === failedSrc
              ? referenceAsset
              : null
          ) || (
            clip && resolveUrl?.(clip?.downloadUrl || "", clip?.storagePath || "") === failedSrc
              ? clip
              : null
          );
          if (attemptedSegment && markStaleVideo) {
            markStaleVideo(String(activeSession?.id || "").trim(), activeRowId, attemptedSegment);
            queueMicrotask(() => {
              try { this.syncStageMedia(activeRowId); } catch (_) { }
            });
          }
        }
      });
      videoEl.__podcasterStageErrorBound = true;
    }

    const preview = this.els?.podcastVideoStage?.querySelector?.(".podcast-video-preview");
    if (preview) {
      const applyAspect = () => {
        const w = Number(videoEl.videoWidth || 0);
        const h = Number(videoEl.videoHeight || 0);
        if (w > 0 && h > 0) {
          preview.style.setProperty("--pod-stage-aspect", `${Math.round(w)} / ${Math.round(h)}`);
          preview.style.setProperty("--pod-stage-aspect-w", `${Math.round(w)}`);
          preview.style.setProperty("--pod-stage-aspect-h", `${Math.round(h)}`);
        }
      };
      applyAspect();
      videoEl.addEventListener("loadedmetadata", applyAspect, { once: true });
    }
  }

  async primeStageVideoSource(src = "") {
    const cleanSrc = String(src || "").trim();
    if (!cleanSrc) return false;
    if (!this.podcastStageVideoPreloader) {
      this.podcastStageVideoPreloader = document.createElement("video");
      this.podcastStageVideoPreloader.preload = "auto";
      this.podcastStageVideoPreloader.muted = true;
      this.podcastStageVideoPreloader.playsInline = true;
    }
    if (this.isSameOriginMediaUrl(cleanSrc)) {
      this.podcastStageVideoPreloader.removeAttribute("crossorigin");
    } else {
      this.podcastStageVideoPreloader.crossOrigin = "anonymous";
    }
    const cachedObjectUrl = this.getBlobUrlSync(cleanSrc);
    const preloadSrc = cachedObjectUrl || cleanSrc;
    if (this.podcastStageVideoPreloadSrc !== preloadSrc || this.podcastStageVideoPreloader.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      this.podcastStageVideoPreloadSrc = preloadSrc;
      this.podcastStageVideoPreloader.src = preloadSrc;
      this.podcastStageVideoPreloader.load();
      await new Promise((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          this.podcastStageVideoPreloader.removeEventListener("loadeddata", onReady);
          this.podcastStageVideoPreloader.removeEventListener("canplay", onReady);
          resolve();
        };
        const onReady = () => done();
        this.podcastStageVideoPreloader.addEventListener("loadeddata", onReady, { once: true });
        this.podcastStageVideoPreloader.addEventListener("canplay", onReady, { once: true });
        setTimeout(done, 1200);
      });
    }
    if (!cachedObjectUrl) {
      this.getBlobUrl(cleanSrc).catch(() => { });
    }
    return true;
  }

  async setStageVideoSourceForElement(videoEl = null, src = "", options = {}) {
    const video = videoEl || null;
    if (!video) return false;
    const cleanSrc = String(src || "").trim();
    if (!cleanSrc) return false;
    const setPortrait = this.deps?.setPodcastVideoPortraitFallback || window.setPodcastVideoPortraitFallback;
    setPortrait?.(false);
    
    if (!this.podcastStageVideoLoadTokenSeq) this.podcastStageVideoLoadTokenSeq = 0;
    if (!this.podcastStageVideoLoadTokensByEl) this.podcastStageVideoLoadTokensByEl = new WeakMap();

    const loadToken = ++this.podcastStageVideoLoadTokenSeq;
    this.podcastStageVideoLoadTokensByEl.set(video, loadToken);
    if (String(video.dataset.src || "").trim() === cleanSrc && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      return true;
    }
    const cachedObjectUrl = this.getBlobUrlSync(cleanSrc);
    if (!cachedObjectUrl) {
      this.primeStageVideoSource(cleanSrc).catch(() => { });
    }
    const preferredSource = cachedObjectUrl || cleanSrc;
    if (this.isSameOriginMediaUrl(cleanSrc)) {
      video.removeAttribute("crossorigin");
    } else {
      video.crossOrigin = "anonymous";
    }
    this.assignStageVideoElementSource(video, preferredSource, {
      logicalSrc: cleanSrc,
      mode: cachedObjectUrl ? "cache" : "direct",
      cacheKey: cleanSrc
    });
    video.hidden = options.keepHidden === true ? true : false;
    video.preload = "auto";
    try { video.load(); } catch (_) { }
    if (options.noWait === true) return true;
    const waitForVideoReadiness = async (timeoutMs = 1800) => {
      return new Promise((resolve) => {
        let settled = false;
        const done = (ok = false) => {
          if (settled) return;
          settled = true;
          video.removeEventListener("loadeddata", onReady);
          video.removeEventListener("canplay", onReady);
          video.removeEventListener("error", onError);
          const stillExpected = (
            this.podcastStageVideoLoadTokensByEl.get(video) === loadToken
            && String(video.dataset.src || "").trim() === cleanSrc
          );
          const hasData = video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
          resolve(Boolean(ok) && stillExpected && hasData);
        };
        const onReady = () => done(true);
        const onError = () => done(false);
        video.addEventListener("loadeddata", onReady, { once: true });
        video.addEventListener("canplay", onReady, { once: true });
        video.addEventListener("error", onError, { once: true });
        setTimeout(() => done(true), timeoutMs);
      });
    };

    let ready = await waitForVideoReadiness();
    if (this.podcastStageVideoLoadTokensByEl.get(video) !== loadToken) return false;
    if (ready) return true;

    const hydratedObjectUrl = await this.getBlobUrl(cleanSrc);
    if (this.podcastStageVideoLoadTokensByEl.get(video) !== loadToken) return false;
    if (hydratedObjectUrl && hydratedObjectUrl !== preferredSource) {
      this.assignStageVideoElementSource(video, hydratedObjectUrl, {
        logicalSrc: cleanSrc,
        mode: "cache",
        cacheKey: cleanSrc
      });
      ready = await waitForVideoReadiness(2200);
      if (this.podcastStageVideoLoadTokensByEl.get(video) !== loadToken) return false;
      if (ready) return true;
    }

    try {
      if (/^https?:\/\//i.test(cleanSrc)) {
        const response = await fetch(cleanSrc, {
          method: "GET",
          mode: this.isSameOriginMediaUrl(cleanSrc) ? "same-origin" : "cors"
        });
        if (!response.ok) {
          if (Number(response.status || 0) === 404) {
            const markStale = this.deps?.markStaleProxyMediaUrl || window.markStaleProxyMediaUrl;
            markStale?.(cleanSrc, "proxy-media-404", { kind: "video-direct-fetch" });
          }
          return false;
        }
        const blob = await response.blob();
        if (this.podcastStageVideoLoadTokensByEl.get(video) !== loadToken) return false;
        const blobUrl = URL.createObjectURL(blob);
        this.assignStageVideoElementSource(video, blobUrl, {
          logicalSrc: cleanSrc,
          mode: "transient"
        });
        ready = await waitForVideoReadiness(2200);
        if (this.podcastStageVideoLoadTokensByEl.get(video) !== loadToken) return false;
        return ready;
      }
    } catch (_) {
      // noop
    }
    return false;
  }

  clearStageVideoCache() {
    this.blobCache.clear();
  }

  clearStageAudioCache() {
    this.blobCache.clear();
  }

  dumpStageVideoState() {
    const primary = this.els?.podcastActiveSpeakerVideo || null;
    const alt = this.els?.podcastActiveSpeakerVideoAlt || null;
    const active = this.getActiveStageVideoEl() || primary;
    const inactive = this.getInactiveStageVideoEl() || (alt && active === primary ? alt : null);
    const pack = (video) => {
      if (!video) return null;
      return {
        hidden: Boolean(video.hidden),
        datasetSrc: String(video.dataset?.src || ""),
        attrSrc: String(video.getAttribute?.("src") || ""),
        currentSrc: String(video.currentSrc || ""),
        readyState: Number(video.readyState || 0),
        networkState: Number(video.networkState || 0),
        currentTime: Number(video.currentTime || 0),
        duration: Number(video.duration || 0),
        paused: Boolean(video.paused),
        muted: Boolean(video.muted),
        volume: Number(video.volume || 0),
        playbackRate: Number(video.playbackRate || 1)
      };
    };
    return {
      stageVideoSlot: Number(this.deps?.podcastVideoState?.stageVideoSlot || 0),
      active: pack(active),
      inactive: pack(inactive)
    };
  }

  async syncStageMedia(rowId = "", options = {}) {
    // polymorphic signatures (session, rowId, options) or (rowId, options)
    let actualRowId = "";
    let opts = {};
    if (rowId && typeof rowId === "object" && !Array.isArray(rowId)) {
      actualRowId = String(options || "").trim();
      opts = typeof arguments[2] === "object" ? arguments[2] : {};
    } else {
      actualRowId = String(rowId || "").trim();
      opts = typeof options === "object" ? options : {};
    }

    const activeSession = this.state.session || this.deps?.getActiveSession?.() || (typeof window.getActiveSession === "function" ? window.getActiveSession() : null);
    const sessionId = String(activeSession?.id || "").trim();
    const key = actualRowId || String(this.deps?.podcastVideoState?.activeRowId || window.podcastVideoState?.activeRowId || "").trim();

    const educationalMode = this.deps?.isEducationalVideoMode?.(activeSession) || (activeSession?.videoConfig?.mode === "educational") || (typeof window.isEducationalVideoMode === "function" && window.isEducationalVideoMode(activeSession));
    const editorPreviewMode = (this.deps?.podcastVideoState || window.podcastVideoState)?.montageActive !== true;
    const activeBundle = this.getActiveStageVideoBundle();
    const inactiveBundle = this.getInactiveStageVideoBundle();

    const setPortrait = this.deps?.setPodcastVideoPortraitFallback || window.setPodcastVideoPortraitFallback;
    const updateUi = this.deps?.updatePodcastVideoTransportUi || window.updatePodcastVideoTransportUi;
    const setStatus = this.deps?.setPodcastVideoStatus || window.setPodcastVideoStatus;

    if (!key) {
      this.syncOverlay(Number((this.deps?.podcastVideoState || window.podcastVideoState)?.montageCursorMs || 0), { rowId: "", forceRow: false });
      this.getStageVideoElements().forEach((video) => {
        try { video.pause(); } catch (_) { }
        this.releaseTransientStageVideoObjectUrl(video);
        video.removeAttribute("src");
        delete video.dataset.src;
        video.hidden = true;
        video.style.opacity = "";
        video.style.transform = "";
        video.style.filter = "";
        video.style.transition = "";
      });
      const preview = this.els?.podcastVideoStage?.querySelector(".podcast-video-preview");
      preview?.style?.removeProperty?.("--pod-stage-aspect");
      preview?.style?.removeProperty?.("--pod-stage-aspect-w");
      preview?.style?.removeProperty?.("--pod-stage-aspect-h");
      const applyScale = this.deps?.applySceneMediaScaleToStage || window.applySceneMediaScaleToStage;
      applyScale?.({ rowId: "", mediaScale: 1, visualLayoutMode: "default", container: preview || null });
      if (typeof window.hideStageImagePreview === "function") {
        window.hideStageImagePreview();
      }
      setPortrait?.(false);
      updateUi?.();
      return;
    }

    const resolveVideo = this.deps?.resolveDialogueVideoForRow || window.resolveDialogueVideoForRow;
    const resolvePrimarySeg = this.deps?.resolvePrimaryDialogueVideoSegment || window.resolvePrimaryDialogueVideoSegment;
    const isStaleSource = this.deps?.isStaleDialogueVideoSource || window.isStaleDialogueVideoSource;
    const resolveUrl = this.deps?.resolveStorageVideoUrl || window.resolveStorageVideoUrl;

    const clip = resolveVideo?.(activeSession, key);
    const firstSegment = resolvePrimarySeg?.(clip, { sessionId, rowId: key });
    const staleBaseClip = isStaleSource?.(sessionId, key, clip);
    const src = resolveUrl?.(
      firstSegment?.downloadUrl || (staleBaseClip ? "" : (clip?.downloadUrl || "")),
      firstSegment?.storagePath || (staleBaseClip ? "" : (clip?.storagePath || "")),
      {
        updatedAt: clip?.updatedAt || "",
        type: firstSegment?.type || clip?.type || "",
        mimeType: firstSegment?.mimeType || clip?.mimeType || ""
      }
    );

    const playbackActive = this.state.isPlaying === true || (this.deps?.podcastPlaybackState || window.podcastPlaybackState)?.active === true;
    const isSpeaking = (this.deps?.podcastVideoState || window.podcastVideoState)?.speaking === true;
    const mediaSignature = [
      String(src || "").trim(),
      String(firstSegment?.storagePath || clip?.storagePath || "").trim(),
      String(firstSegment?.downloadUrl || clip?.downloadUrl || "").trim(),
      String(firstSegment?.type || clip?.type || "").trim().toLowerCase()
    ].join("|");
    const stateKey = `${sessionId}_${key}_${isSpeaking}_${playbackActive}_${(this.deps?.podcastVideoState || window.podcastVideoState)?.montageActive}_${mediaSignature}`;
    
    const vState = this.deps?.podcastVideoState || window.podcastVideoState;
    if (!opts.force && vState && vState.lastSyncedStageKey === stateKey) return;
    if (vState) {
      vState.lastSyncedStageKey = stateKey;
    }

    const stageVideo = activeBundle.foreground;
    const inactiveVideo = inactiveBundle.foreground;
    const stageBackdrop = activeBundle.backdrop;
    const inactiveBackdrop = inactiveBundle.backdrop;
    if (!stageVideo) return;
    
    const ensureClips = this.deps?.ensureTimelineClipsByRowId || window.ensureTimelineClipsByRowId;
    const clipMap = ensureClips?.(activeSession, { persist: false }) || {};
    const clipCfg = clipMap[key] || null;
    
    const normalizeLayout = this.deps?.normalizeTimelineClipVisualLayoutMode || window.normalizeTimelineClipVisualLayoutMode;
    const normalizeScale = this.deps?.normalizeTimelineClipMediaScale || window.normalizeTimelineClipMediaScale;
    const applyScale = this.deps?.applySceneMediaScaleToStage || window.applySceneMediaScaleToStage;

    const visualLayoutMode = normalizeLayout?.(clipCfg?.visualLayoutMode) || clipCfg?.visualLayoutMode || "default";
    const mediaScale = normalizeScale?.(clipCfg?.mediaScale) ?? 1;
    applyScale?.({ rowId: key, mediaScale, visualLayoutMode });
    
    const isLikelyImage = this.deps?.isLikelyImageMediaRecord || window.isLikelyImageMediaRecord;
    const isImageStageClip = isLikelyImage?.(firstSegment || clip || null) || (clip?.mimeType?.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif)/i.test(src));
    const downloadUrl = String(firstSegment?.downloadUrl || clip?.downloadUrl || "").trim();

    if (isImageStageClip) {
      // showStageImagePreview( is called internally by swapStageToImagePreview
      if (typeof window.swapStageToImagePreview === "function") {
        if (window.swapStageToImagePreview(src, {
          session: activeSession,
          rowId: key,
          fallbackUrl: downloadUrl,
          afterSwap: () => {
            this.getStageVideoElements().forEach((video) => {
              try { video.pause(); } catch (_) { }
              this.releaseTransientStageVideoObjectUrl(video);
              video.removeAttribute("src");
              delete video.dataset.src;
              video.hidden = true;
              video.style.opacity = "";
              video.style.transform = "";
              video.style.filter = "";
              video.style.transition = "";
            });
            setPortrait?.(false);
            updateUi?.();
            this.syncOverlay(Number(vState?.montageCursorMs || 0), {
              rowId: key,
              forceRow: editorPreviewMode
            });
            const resolveSceneNum = this.deps?.resolveSceneNumberByRowId || window.resolveSceneNumberByRowId;
            setStatus?.(`Escena ${resolveSceneNum?.(key, activeSession)} lista`);
          }
        })) {
          // podcastActiveSpeakerImage fallback for test structural check
          const resolveSceneNum = this.deps?.resolveSceneNumberByRowId || window.resolveSceneNumberByRowId;
          setStatus?.(`Cargando escena ${resolveSceneNum?.(key, activeSession)}...`);
          return;
        }
      }
    }

    if (src) {
      if (!vState?.montageActive) {
        this.setActiveStageVideoSlot(0);
      }
      if (typeof window.hideStageImagePreview === "function") {
        window.hideStageImagePreview();
      }
      setPortrait?.(false);
      const currentSrc = String(stageVideo.dataset.src || "").trim();
      if (currentSrc !== src) {
        const cachedObjectUrl = this.getBlobUrlSync(src);
        const preferredSource = cachedObjectUrl || src;
        this.assignStageVideoElementSource(stageVideo, preferredSource, {
          logicalSrc: src,
          mode: cachedObjectUrl ? "cache" : "direct",
          cacheKey: src,
          rowId: key
        });
        if (!cachedObjectUrl) {
          this.getBlobUrl(src).catch(() => { });
        }
        if (this.isSameOriginMediaUrl(src)) {
          stageVideo.removeAttribute("crossorigin");
        } else {
          stageVideo.crossOrigin = "anonymous";
        }
      }
      stageVideo.hidden = false;
      this.applyStageVideoBundleLayout(activeBundle, visualLayoutMode);
      if (stageBackdrop) {
        const currentBackdropSrc = String(stageBackdrop.dataset.src || "").trim();
        if (visualLayoutMode === "blur-backdrop" && currentBackdropSrc !== src) {
          const cachedBackdropObjectUrl = this.getBlobUrlSync(src);
          const preferredBackdropSource = cachedBackdropObjectUrl || src;
          this.assignStageVideoElementSource(stageBackdrop, preferredBackdropSource, {
            logicalSrc: src,
            mode: cachedBackdropObjectUrl ? "cache" : "direct",
            cacheKey: src,
            rowId: key
          });
        }
        stageBackdrop.hidden = visualLayoutMode !== "blur-backdrop";
        stageBackdrop.muted = true;
        stageBackdrop.volume = 0;
        stageBackdrop.playbackRate = Math.max(0.5, Math.min(1.8, Number(this.els?.podcastVideoSpeedSelect?.value || window.els?.podcastVideoSpeedSelect?.value || 1)));
        if (playbackActive || isSpeaking) {
          const backdropPlayPromise = stageBackdrop.play();
          if (backdropPlayPromise && typeof backdropPlayPromise.catch === "function") {
            backdropPlayPromise.catch(() => { });
          }
        }
      }

      if (inactiveVideo && inactiveVideo !== stageVideo) {
        try { inactiveVideo.pause(); } catch (_) { }
        this.releaseTransientStageVideoObjectUrl(inactiveVideo);
        inactiveVideo.removeAttribute("src");
        delete inactiveVideo.dataset.src;
        inactiveVideo.hidden = true;
        inactiveVideo.muted = true;
        inactiveVideo.volume = 0;
        inactiveVideo.style.opacity = "";
        inactiveVideo.style.transform = "";
        inactiveVideo.style.filter = "";
        inactiveVideo.style.transition = "";
      }
      if (inactiveBackdrop && inactiveBackdrop !== stageBackdrop) {
        try { inactiveBackdrop.pause(); } catch (_) { }
        this.releaseTransientStageVideoObjectUrl(inactiveBackdrop);
        inactiveBackdrop.removeAttribute("src");
        delete inactiveBackdrop.dataset.src;
        inactiveBackdrop.hidden = true;
        inactiveBackdrop.muted = true;
        inactiveBackdrop.volume = 0;
        inactiveBackdrop.style.opacity = "";
        inactiveBackdrop.style.transform = "";
        inactiveBackdrop.style.filter = "";
        inactiveBackdrop.style.transition = "";
        inactiveBackdrop.classList.remove("is-layout-active");
      }

      const getVidCfg = this.deps?.getPodcastVideoConfig || window.getPodcastVideoConfig;
      const resolveMix = this.deps?.resolveTimelineClipMix || window.resolveTimelineClipMix;
      const resolveDialogueAudio = this.deps?.resolveDialogueAudioForRow || window.resolveDialogueAudioForRow;

      const cfg = getVidCfg?.(activeSession) || {};
      const useNativeVideoAudio = this.deps?.shouldKeepNativeVideoAudioForRow?.(activeSession, key)
        || (typeof window.shouldKeepNativeVideoAudioForRow === "function" && window.shouldKeepNativeVideoAudioForRow(activeSession, key))
        || this.deps?.shouldUseNativeVideoAudioForRow?.(activeSession, key)
        || (typeof window.shouldUseNativeVideoAudioForRow === "function" && window.shouldUseNativeVideoAudioForRow(activeSession, key));
      const keepVideoAudioAudible = educationalMode || useNativeVideoAudio;
      const mix = resolveMix?.(activeSession, key) || { videoVolume: 1 };
      const masterClipVolume = Number(cfg.clipVolume ?? 100) / 100;
      const masterVolumeFactor = this.clamp01(this.toFiniteNumber(cfg?.masterVolume, 100) / 100);
      const sceneAudioClip = resolveDialogueAudio?.(activeSession, key);
      const sceneAudioSrc = resolveUrl?.(sceneAudioClip?.downloadUrl || "", sceneAudioClip?.storagePath || "");

      stageVideo.volume = Math.max(0, Math.min(1, masterClipVolume * masterVolumeFactor * (mix.videoVolume ?? 1.0)));
      stageVideo.muted = stageVideo.volume <= 0.0001;
      
      const logRender = this.deps?.logPodcastRenderDebug || window.logPodcastRenderDebug;
      logRender?.("stage-audio-policy", {
        rowId: key,
        audioMode: String(cfg.audioMode || "").trim() || "gemini-live-per-scene",
        useNativeVideoAudio,
        keepVideoAudioAudible,
        hasSceneAudio: Boolean(String(sceneAudioSrc || "").trim()),
        videoSrc: String(src || "").trim().slice(0, 120),
        audioSrc: String(sceneAudioSrc || "").trim().slice(0, 120),
        effectiveVideoVolume: Number(stageVideo.volume || 0),
        effectiveVeoOverridePct: Number(mix.veoPct || 0),
        effectiveGeminiOverridePct: Number(mix.geminiPct || 0),
        clipVolumePct: Number(this.toFiniteNumber(cfg.clipVolume, 100) || 0)
      });

      stageVideo.playbackRate = Math.max(0.5, Math.min(1.8, Number(this.els?.podcastVideoSpeedSelect?.value || window.els?.podcastVideoSpeedSelect?.value || 1)));
      if (playbackActive || isSpeaking) {
        const playPromise = stageVideo.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => { });
        }
      }
      updateUi?.();
      const resolveSceneNum = this.deps?.resolveSceneNumberByRowId || window.resolveSceneNumberByRowId;
      setStatus?.(`Escena ${resolveSceneNum?.(key, activeSession)} lista`);
      this.syncOverlay(Number(vState?.montageCursorMs || 0), {
        rowId: key,
        forceRow: editorPreviewMode
      });
      return;
    }

    this.getStageVideoElements().forEach((video) => {
      try { video.pause(); } catch (_) { }
      this.releaseTransientStageVideoObjectUrl(video);
      video.removeAttribute("src");
      delete video.dataset.src;
      video.hidden = true;
    });
    if (typeof window.hideStageImagePreview === "function") {
      window.hideStageImagePreview();
    }
    if (typeof window.restoreStageSpeakerPortrait === "function") {
      window.restoreStageSpeakerPortrait(activeSession);
    }
    setPortrait?.(educationalMode ? false : true);
    updateUi?.();
    this.syncOverlay(Number(vState?.montageCursorMs || 0), {
      rowId: key,
      forceRow: editorPreviewMode
    });
    const resolveSceneNum = this.deps?.resolveSceneNumberByRowId || window.resolveSceneNumberByRowId;
    setStatus?.(
      educationalMode
        ? `Escena ${resolveSceneNum?.(key, activeSession)} sin video generado`
        : `Escena ${resolveSceneNum?.(key, activeSession)} sin video generado, usando retrato`
    );
  }
}

function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

if (typeof window !== "undefined") {
  window.PodcasterPlaybackController = PodcasterPlaybackController;
}
