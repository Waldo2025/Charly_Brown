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
      isTickProcessing: false
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


    this.backgroundAudio = null;
    this.backgroundSource = null;
    this.backgroundGain = null;
    this.backgroundCompressor = null;
    this.backgroundDuckFactor = 1.0;
    this.backgroundSrc = "";

    this.stageMachine = {
      loadingSrc: '',
      activeSlot: 0
    };
    this.activeLoopId = 0;
  }

  // --- Helpers ---
  clamp01(v) { return Math.max(0, Math.min(1, Number(v) || 0)); }
  toFiniteNumber(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }

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
    return null;
  }

  async invalidateBlobUrl(url) {
    if (!url) return;
    const blobUrl = this.blobCache.get(url);
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      this.blobCache.delete(url);
    }
    try {
      const cache = await caches.open(this.mediaCacheName);
      await cache.delete(url);
    } catch (e) { }
  }


  async getBlobUrl(url) {
    if (!url) return "";
    // 1. Check in-memory cache
    const cached = this.getBlobUrlSync(url);
    if (cached) return cached;

    if (this.fetchPromises.has(url)) return this.fetchPromises.get(url);

    const p = (async () => {
      try {
        // 2. Check persistent Cache Storage
        try {
          const mediaCache = await caches.open(this.mediaCacheName);
          const cachedResp = await mediaCache.match(url);
          if (cachedResp) {
            const blob = await cachedResp.blob();
            const objectUrl = URL.createObjectURL(blob);
            this.blobCache.set(url, objectUrl);
            return objectUrl;
          }
        } catch (e) { }

        let finalUrl = url;
        const isDirectFirebaseUrl = url.includes('firebasestorage.googleapis.com');

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

        const fetchOptions = {};
        if (finalUrl.includes('/api/') && this.deps?.getAuthHeaders) {
          try { fetchOptions.headers = await this.deps.getAuthHeaders(); } catch (e) { }
        }

        const resp = await fetch(finalUrl, fetchOptions);
        if (!resp.ok) {
          if (resp.status === 404 && this.deps?.markStaleProxyMediaUrl) {
            this.deps.markStaleProxyMediaUrl(url, 'proxy-media-404-from-controller');
          }
          throw new Error(`Fetch failed with status ${resp.status}`);
        }

        try {
          const mediaCache = await caches.open(this.mediaCacheName);
          await mediaCache.put(url, resp.clone());
        } catch (e) { }

        const blob = await resp.blob();
        const objectUrl = URL.createObjectURL(blob);
        this.blobCache.set(url, objectUrl);
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
        this.fetchPromises.delete(url);
      }
    })();
    this.fetchPromises.set(url, p);
    return p;
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
    this.state.useMse = this.state.config?.useMse === true;
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
  play(fromMs = null) {
    this.sync();
    if (fromMs !== null) this.state.currentMs = Math.max(0, fromMs);
    this.state.isPlaying = true;
    this.initAudioContext();

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
    this.deps?.updatePodcastVideoTransportUi?.();
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
    this.deps?.updatePodcastVideoTransportUi?.();
  }

  stop(opts = {}) {
    this.state.isPlaying = false;
    this.stopClock();
    
    const shouldReset = opts.keepCursor !== true;
    if (shouldReset) {
      this.state.currentMs = 0;
    }
    
    this.stopBackgroundMusic();
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
          v.dataset.src = ""; // Clear src to avoid flicker on next play
        }
        v.style.opacity = 0; 
        v.style.zIndex = 1; 
      } catch (_) { }
    });

    if (this.deps?.podcastVideoState) {
      if (shouldReset) {
        this.deps.podcastVideoState.montageCursorMs = 0;
      }
      this.deps.podcastVideoState.montageActive = false;
      this.deps.podcastVideoState.montagePaused = false;
    }

    this.deps?.setPodcastVideoStatus?.(shouldReset ? 'Detenido' : 'Pausado');
    this.deps?.updatePodcastVideoTransportUi?.();

    this.state.isTickProcessing = false;
    this.tick(this.state.currentMs);
    this.emit('stop', opts);
  }

  seekTo(el, seconds) {
    if (!el || !Number.isFinite(seconds)) return;
    try {
      if (el.readyState >= 1) {
        el.currentTime = seconds;
      } else {
        el.dataset.pendingSeek = seconds;
        const onLoaded = () => {
          el.currentTime = seconds;
          el.removeEventListener('loadedmetadata', onLoaded);
          delete el.dataset.pendingSeek;
        };
        el.addEventListener('loadedmetadata', onLoaded);
      }
    } catch (e) {
      console.warn('[PlaybackController] Error seeking:', e);
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

        if (this.state.totalDurationMs > 100 && nextMs >= this.state.totalDurationMs) {
          this.state.currentMs = this.state.totalDurationMs;
          this.tick(this.state.totalDurationMs);
          this.stop();
          return;
        }

        this.state.currentMs = nextMs;
        this.tick(nextMs);
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

  async seek(targetMs) {
    const ms = Math.max(0, Math.min(this.state.totalDurationMs || 9999999, Number(targetMs) || 0));
    this.state.currentMs = ms;
    await this.tick(ms);
    this.emit('seek', { currentMs: ms });
  }

  async tick(currentMs) {
    const ms = Number.isFinite(Number(currentMs)) ? Number(currentMs) : this.state.currentMs;
    this.state.currentMs = ms;

    if (this.deps?.podcastVideoState) {
      this.deps.podcastVideoState.montageCursorMs = ms;
    }
    if (this.deps?.syncPodcastTimelinePlayhead) {
      this.deps.syncPodcastTimelinePlayhead(this.state.session, { 
        currentMs: ms,
        totalMs: this.state.totalDurationMs, 
        lightweight: true 
      });
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
        this.syncOverlay ? this.syncOverlay(ms) : null
      ]);
      
      this.emit('timeupdate', { currentMs: ms });
    } catch (e) {
      console.warn("[PlaybackController] Tick error:", e);
    } finally {
      this.state.isTickProcessing = false;
    }
  }

  // --- Audio ---
  async syncAudio(currentMs, speed) {
    const session = this.state.session || this.deps?.getActiveSession?.();
    const config = this.deps?.getPodcastVideoConfig?.(session) || {};
    const audioTrack = config.geminiDialogueTrack || { segments: [], enabled: true };
    const segments = (audioTrack.enabled !== false) ? (audioTrack.segments || []) : [];
    const activeSegments = segments.filter(s => currentMs >= s.startMs && currentMs < (s.startMs + s.durationMs));
    const activeRowIds = new Set(activeSegments.map(s => s.rowId));

    // Upcoming pre-load
    const upcoming = segments.filter(s => s.startMs > currentMs && (s.startMs - currentMs) < 3000);
    upcoming.forEach(s => {
      const clip = this.deps?.resolveDialogueAudioForRow?.(session, s.rowId);
      const rawUrl = this.deps?.resolveStorageAudioUrl?.(clip?.downloadUrl, clip?.storagePath);
      if (rawUrl) this.getBlobUrl(rawUrl);
    });

    Object.keys(this.dialoguePlayers).forEach(rowId => {
      if (!activeRowIds.has(rowId)) {
        const audio = this.dialoguePlayers[rowId];
        if (audio && !audio.paused) try { audio.pause(); } catch (_) { }
      }
    });

    const clipMap = this.deps?.ensureTimelineClipsByRowId?.(session, { persist: false }) || {};
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
          if (pvs && Number.isFinite(nextMs)) {
            if (!pvs.montageAudioActualDurationsMs) pvs.montageAudioActualDurationsMs = {};
            if (Math.abs(nextMs - (pvs.montageAudioActualDurationsMs[rowId] || 0)) > 100) {
              pvs.montageAudioActualDurationsMs[rowId] = nextMs;
              this.pendingTimelineRender = true;
            }
          }
        }, { once: true });
      }

      audio.playbackRate = speed;
      const mix = this.deps?.resolveTimelineClipMix?.(session, rowId) || { voiceVolume: 1 };
      audio.volume = this.clamp01(mix.voiceVolume);

      const clip = clipMap[rowId];
      const trimInMs = Math.max(0, Number(clip?.trimInMs || 0));
      const offsetMs = currentMs - segment.startMs;
      const offsetSec = (trimInMs + offsetMs) / 1000;

      const drift = Math.abs(audio.currentTime - offsetSec);
      if (audio.dataset.initialized === "false" || drift > 0.15) {
        this.seekTo(audio, offsetSec);
        audio.dataset.initialized = "true";
      }

      if (this.state.isPlaying && audio.paused) {
        audio.play().catch(() => { });
      }
    }
    await this.syncBackgroundMusic(currentMs, speed, hasVoice);
  }

  async syncBackgroundMusic(currentMs, speed, hasVoice = false) {
    const session = this.state.session || this.deps?.getActiveSession?.();
    const panelCfg = this.deps?.getPanelMontageMusicConfig?.(session);
    if (!panelCfg || panelCfg.sourceType === "none") { this.stopBackgroundMusic(); return; }

    const sourceItems = Array.isArray(panelCfg.sourceItems) ? panelCfg.sourceItems : [];
    const activeSegment = sourceItems.length > 0 ? sourceItems.find(s => currentMs >= s.startOffsetMs && currentMs < s.endOffsetMs) : null;
    const rawSrc = activeSegment ? activeSegment.sourceUrl : panelCfg.sourceUrl;
    
    if (!rawSrc) { this.stopBackgroundMusic(); return; }

    if (this.backgroundSrc !== rawSrc) {
      this.stopBackgroundMusic();
      this.backgroundSrc = rawSrc;
      try {
        const blobSrc = await this.getBlobUrl(rawSrc);
        this.backgroundAudio = new Audio();
        this.backgroundAudio.crossOrigin = 'anonymous';
        this.backgroundAudio.src = blobSrc;
        this.backgroundAudio.dataset.initialized = "false";
        this.backgroundAudio.loop = activeSegment ? activeSegment.loop : true;
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

    this.backgroundDuckFactor = hasVoice ? (duckPct / 100) : 1.0;
    const finalVolume = (baseVolume / 100) * this.backgroundDuckFactor * sceneBackgroundFactor;

    if (this.audioCtx) {
      this.ensureBackgroundChain();
      if (this.backgroundGain) {
        this.backgroundGain.gain.setTargetAtTime(this.clamp01(finalVolume), this.audioCtx.currentTime, 0.05);
      } else {
        this.backgroundAudio.volume = this.clamp01(finalVolume);
      }
    } else {
      this.backgroundAudio.volume = this.clamp01(finalVolume);
    }

    if (activeSegment) {
      const trimInMs = Math.max(0, Number(activeSegment.trimInMs || 0));
      const offsetMs = currentMs - activeSegment.startOffsetMs;
      const offsetSec = (trimInMs + offsetMs) / 1000;
      if (this.backgroundAudio.dataset.initialized === "false" || Math.abs(this.backgroundAudio.currentTime - offsetSec) > 0.3) {
        this.seekTo(this.backgroundAudio, offsetSec);
        this.backgroundAudio.dataset.initialized = "true";
      }
    }

    if (this.state.isPlaying && this.backgroundAudio.paused) {
      this.backgroundAudio.play().catch(() => { });
    }
  }

  ensureBackgroundChain() {
    if (!this.audioCtx || this.backgroundGain || !this.backgroundAudio) return;
    try {
      this.backgroundSource = this.audioCtx.createMediaElementSource(this.backgroundAudio);
      this.backgroundGain = this.audioCtx.createGain();
      this.backgroundSource.connect(this.backgroundGain);
      this.backgroundGain.connect(this.audioCtx.destination);
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
    this.backgroundGain = null;
  }

  // --- Video ---
  async syncVideo(currentMs) {
    if (this.state.useMse) return;
    const entry = this.getEntryAtMs(currentMs);

    // Pre-load upcoming
    const entries = this.deps?.buildTimelineRuntimeEntries?.(this.state.session) || [];
    const upcoming = entries.filter(e => e.startMs > currentMs && (e.startMs - currentMs) < 4000);
    upcoming.forEach(e => this.getBlobUrl(e.videoSrc));

    if (entry) {
      await this.syncStageSwitching(entry, currentMs);
    } else {
      this.hideAllVideos();
    }
  }

  hideAllVideos() {
    [this.els?.podcastActiveSpeakerVideo, this.els?.podcastActiveSpeakerVideoAlt, this.els?.podcastActiveSpeakerBackdropVideo, this.els?.podcastActiveSpeakerBackdropVideoAlt].forEach(v => {
      if (v) { 
        v.style.opacity = 0; 
        v.style.visibility = "hidden";
        v.hidden = true; 
        try { v.pause(); } catch (_) { }
      }
    });
  }

  async syncStageSwitching(entry, currentMs) {
    const trimInMs = Math.max(0, Number(entry.clip?.trimInMs || 0));
    const offsetMs = currentMs - entry.startMs;
    const offsetSec = (trimInMs + offsetMs) / 1000;

    const activeSlot = Number(this.deps?.podcastVideoState?.stageVideoSlot || 0);
    const primary = this.els?.podcastActiveSpeakerVideo;
    const alt = this.els?.podcastActiveSpeakerVideoAlt;

    const activeEl = activeSlot === 1 ? alt : primary;
    const inactiveEl = activeSlot === 1 ? primary : alt;
    
    if (!activeEl) return;

    // Use current element if it matches source
    if (activeEl.dataset.src === entry.videoSrc) {
      if (Math.abs(activeEl.currentTime - offsetSec) > 0.2) {
        this.seekTo(activeEl, offsetSec);
      }
      if (this.state.isPlaying && activeEl.paused) {
        activeEl.play().catch(() => { });
      }
      
      activeEl.style.zIndex = "2";
      activeEl.style.opacity = "1";
      activeEl.style.visibility = "visible";
      activeEl.hidden = false;

      const config = this.deps?.getPodcastVideoConfig?.(this.state.session) || {};
      const masterClipVolume = Number(config.clipVolume ?? 100) / 100;
      const mix = this.deps?.resolveTimelineClipMix?.(this.state.session, entry.rowId) || { videoVolume: 1 };
      activeEl.volume = this.clamp01(masterClipVolume * (mix.videoVolume ?? 1.0));
      
      if (inactiveEl && inactiveEl.dataset.src !== entry.videoSrc) {
        inactiveEl.style.opacity = "0";
        inactiveEl.pause();
      }
    } else {
      // Switching needed
      if (!entry.videoSrc) {
        activeEl.style.opacity = "1";
        activeEl.hidden = false;
        return;
      }

      if (this.stageMachine.loadingSrc === entry.videoSrc) return;
      this.stageMachine.loadingSrc = entry.videoSrc;

      try {
        let blobUrl = this.getBlobUrlSync(entry.videoSrc);
        if (!blobUrl) blobUrl = await this.getBlobUrl(entry.videoSrc);

        if (!inactiveEl) {
          if (activeEl.dataset.src !== entry.videoSrc) {
            await this.deps?.setPodcastStageVideoSourceForElement?.(activeEl, blobUrl);
            activeEl.dataset.src = entry.videoSrc;
          }
          this.seekTo(activeEl, offsetSec);
          if (this.state.isPlaying) activeEl.play().catch(() => { });
          return;
        }

        // Seamless swap
        if (inactiveEl.dataset.src !== entry.videoSrc) {
          await this.deps?.setPodcastStageVideoSourceForElement?.(inactiveEl, blobUrl, { noWait: true });
          inactiveEl.dataset.src = entry.videoSrc;
        }

        this.seekTo(inactiveEl, offsetSec);
        
        // Final Swap
        inactiveEl.style.zIndex = "2";
        inactiveEl.style.opacity = "1";
        inactiveEl.style.visibility = "visible";
        inactiveEl.hidden = false;

        if (this.state.isPlaying) {
          inactiveEl.play().catch(() => { });
        }

        activeEl.style.zIndex = "1";
        activeEl.style.opacity = "0";
        activeEl.style.visibility = "hidden";
        activeEl.hidden = true;
        activeEl.pause();

        const config = this.deps?.getPodcastVideoConfig?.(this.state.session) || {};
        const masterClipVolume = Number(config.clipVolume ?? 100) / 100;
        const mix = this.deps?.resolveTimelineClipMix?.(this.state.session, entry.rowId) || { videoVolume: 1 };
        inactiveEl.volume = this.clamp01(masterClipVolume * (mix.videoVolume ?? 1.0));

        this.deps?.setActiveStageVideoSlot?.(activeSlot === 1 ? 0 : 1);
      } catch (e) {
        console.warn('[PlaybackController] Switch error:', e);
      } finally {
        this.stageMachine.loadingSrc = '';
      }
    }
  }

  // --- Overlays ---
  syncOverlay(currentMs) {
    const overlay = this.els?.podcastOnScreenTextOverlay;
    if (!overlay) return;

    const session = this.deps?.getActiveSession?.() || this.state.session;
    const cfg = this.deps?.getPodcastVideoConfig?.(session) || this.state.config;
    const settings = this.deps?.normalizeOnScreenTextTrackSettings?.(cfg?.onScreenTextTrack || {});

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

    // Find clip with a 1ms epsilon to handle rounding
    const selected = clipList.find(c => (currentMs + 1) >= c.startMs && currentMs < (c.startMs + this.deps.getOnScreenTextClipEffectiveDurationMs(c)));

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
    const previewWidthPx = previewEl?.clientWidth || 1280;
    const previewHeightPx = previewEl?.clientHeight || 720;
    const renderOptions = { text, previewWidthPx, previewHeightPx };

    const renderMetrics = this.deps?.resolveOnScreenTextRenderMetrics?.(settings, renderOptions) || {};
    const presetClass = this.deps?.getOnScreenTextStylePresetClass?.(settings.stylePreset) || "";
    const bgClass = this.deps?.getOnScreenTextBgPresetClass?.(settings.bgPreset) || "";
    const inlineStyle = renderMetrics.inlineStyle || (this.deps.buildOnScreenTextBubbleInlineStyle ? this.deps.buildOnScreenTextBubbleInlineStyle(settings, renderMetrics) : "");

    const contentHtml = this.deps.escapeHtml(renderMetrics.wrappedText || text);

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
      contentNode.style.setProperty('--pod-onscreen-text-color', settings.textColor || '#f8fafc');
    }

    overlay.style.setProperty("--pod-onscreen-text-x", `${(settings.overlayXPct ?? 0.5) * 100}%`);
    overlay.style.setProperty("--pod-onscreen-text-y", `${(settings.overlayYPct ?? 0.92) * 100}%`);
  }

  initMse() { if (!this.mse) this.mse = { engine: null }; }
}

function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

window.PodcasterPlaybackController = PodcasterPlaybackController;
