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
      activeRowId: ''
    };
    this.clockId = null;
    this.audioCtx = null;
    this.dialoguePlayers = {};
    this.audioCache = {};
    this.blobCache = new Map();
    this.fetchPromises = new Map();

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
  }

  // --- Helpers ---
  clamp01(v) { return Math.max(0, Math.min(1, Number(v) || 0)); }
  toFiniteNumber(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }

  getEntryAtMs(currentMs) {
    const entries = this.deps?.buildTimelineRuntimeEntries?.(this.state.session) || [];
    return entries.find(e => currentMs >= e.startMs && currentMs < e.endMs);
  }

  async getBlobUrl(url) {
    if (!url) return "";
    // console.log('[PlaybackController] getBlobUrl ->', url);
    if (this.blobCache.has(url)) return this.blobCache.get(url);
    if (this.fetchPromises.has(url)) return this.fetchPromises.get(url);
    
    // console.log("[PlaybackController] Fetching Blob URL:", url);

    const p = (async () => {
      try {
        let finalUrl = url;

        // "Obtain from firebase" - if we see a proxy URL, try to extract storagePath 
        // and resolve it directly via Firebase for maximum stability.
        // Detection for direct Firebase Storage URLs to force proxy if needed
        const isDirectFirebaseUrl = url.includes('firebasestorage.googleapis.com');
        
        if (url.includes('/api/assets/proxy-media') || url.includes('/api/assets/proxy-image') || isDirectFirebaseUrl) {
          try {
            const parsedUrl = new URL(url, window.location.origin);
            let storagePath = parsedUrl.searchParams.get('storagePath');
            const originalUrl = parsedUrl.searchParams.get('url');

            // If it's a direct Firebase URL, try to extract the path from the URL itself
            if (isDirectFirebaseUrl && !storagePath) {
              const pathPart = url.split('/o/')[1]?.split('?')[0];
              if (pathPart) storagePath = decodeURIComponent(pathPart);
            }

            if (storagePath && this.deps?.resolveFirebaseStorageUrl) {
              // FOR STUDIO ASSETS: skip direct resolution in the Studio to avoid 403 Forbidden console errors
              // and go straight to the authenticated proxy. In the Dashboard, always resolve
              // as it typically points to our own proxy anyway.
              const isStudioAsset = storagePath.includes('podcaster/sessions') || storagePath.includes('podcaster/library');

              if (!isStudioAsset || this.deps?.isDashboard) {
                const bucket = window.__CHARLY_CONFIG__?.firebase?.storageBucket || 'charly-brown.firebasestorage.app';
                const gsPath = storagePath.startsWith('gs://') ? storagePath : `gs://${bucket}/${storagePath}`;

                const directUrl = await this.deps.resolveFirebaseStorageUrl(gsPath);
                if (directUrl && directUrl.startsWith('http') && !directUrl.includes('/api/assets/proxy')) {
                  finalUrl = directUrl;
                } else if (directUrl && directUrl.includes('/api/assets/proxy')) {
                  // If it's a proxy URL, use it directly as the final URL
                  finalUrl = directUrl;
                }
              }
            } else if (originalUrl && originalUrl.startsWith('http') && !originalUrl.includes('/api/assets/proxy')) {
              finalUrl = originalUrl;
            }
          } catch (e) { }
        }

        // Handle Firebase Storage paths (gs://)
        if (finalUrl.startsWith("gs://")) {
          // console.log('[PlaybackController] Detected gs:// path, resolving...');
          if (this.deps?.resolveFirebaseStorageUrl) {
            finalUrl = await this.deps.resolveFirebaseStorageUrl(finalUrl);
            // console.log('[PlaybackController] Resolved to:', finalUrl);
          } else {
            console.warn('[PlaybackController] No resolveFirebaseStorageUrl dependency found for:', finalUrl);
            return "";
          }
        }

        // Try to fetch the direct URL if we resolved one
        if (finalUrl !== url && finalUrl.startsWith('http')) {
          try {
            // console.log('[PlaybackController] Attempting direct fetch:', finalUrl);
            const resp = await fetch(finalUrl);
            if (resp.ok) {
              const blob = await resp.blob();
              const objectUrl = URL.createObjectURL(blob);
              this.blobCache.set(url, objectUrl);
              return objectUrl;
            }
            console.warn('[PlaybackController] Direct fetch failed (status:', resp.status, '), falling back to proxy:', url);
          } catch (e) {
            console.warn('[PlaybackController] Direct fetch failed (CORS or Network error), falling back to proxy:', url, e);
          }
          // Reset to proxy URL for the final attempt
          finalUrl = url;
        }

        // Final attempt (using proxy URL or original URL)
        const fetchOptions = {};
        if (finalUrl.includes('/api/') && this.deps?.getAuthHeaders) {
          try {
            fetchOptions.headers = await this.deps.getAuthHeaders();
          } catch (e) {
            console.warn('[PlaybackController] Failed to get auth headers for fetch:', e.message);
          }
        }

        // console.log('[PlaybackController] Fetching blob from:', finalUrl);
        const resp = await fetch(finalUrl, fetchOptions);
        if (!resp.ok) {
          console.error('[PlaybackController] Fetch failed:', resp.status, finalUrl);
          if (resp.status === 404 && this.deps?.markStaleProxyMediaUrl) {
            this.deps.markStaleProxyMediaUrl(url, 'proxy-media-404-from-controller');
          }
          throw new Error(`Fetch failed with status ${resp.status}`);
        }
        const blob = await resp.blob();
        const objectUrl = URL.createObjectURL(blob);
        // console.log('[PlaybackController] Blob created for:', url, 'Size:', blob.size);
        this.blobCache.set(url, objectUrl);
        return objectUrl;
      } catch (e) {
        // Silent failure if we have a proxy fallback, or minimal log if it's the final failure
        return url;
      }
      finally { this.fetchPromises.delete(url); }
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
    this.state.totalDurationMs = this.deps?.getTimelineTotalDurationMs?.(this.state.session) || 0;
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
    // console.log("[PlaybackController] Play at:", fromMs);
    this.sync();
    if (fromMs !== null) this.state.currentMs = fromMs;
    this.state.isPlaying = true;
    this.initAudioContext();

    // Stop any other timers/sequences
    if (this.deps?.cancelTimelineSequence) this.deps.cancelTimelineSequence();

    if (this.state.useMse) {
      this.initMse();
    } else {
      this.startClock();
    }
    this.emit('play', { currentMs: this.state.currentMs });
  }

  pause() {
    console.log("[PlaybackController] Pause requested.");
    this.state.isPlaying = false;
    this.stopClock();

    Object.values(this.dialoguePlayers).forEach(audio => { 
      try { audio.pause(); audio.dataset.initialized = "false"; } catch (_) { } 
    });
    [this.els?.podcastActiveSpeakerVideo, this.els?.podcastActiveSpeakerVideoAlt].forEach(v => {
      if (v) try { v.pause(); v.dataset.initialized = "false"; } catch (_) { }
    });
    if (this.backgroundAudio) { 
      try { 
        this.backgroundAudio.pause(); 
        this.backgroundAudio.dataset.initialized = "false";
        console.log("[PlaybackController] Background audio paused.");
      } catch (_) { } 
    }
    if (this.mse?.engine) this.mse.engine.pause();
    this.emit('pause');
    this.deps?.setPodcastVideoStatus?.("Pausado");
    this.deps?.updatePodcastVideoTransportUi?.();
  }

  stop(opts = {}) {
    this.state.isPlaying = false;
    this.stopClock();
    if (opts.keepCursor !== true) {
      this.state.currentMs = 0;
    }
    this.stopBackgroundMusic();
    if (this.deps?.stopPanelMusic) { try { this.deps.stopPanelMusic(); } catch (_) { } }
    Object.values(this.dialoguePlayers).forEach(a => {
      try {
        a.pause();
        if (opts.keepCursor !== true) this.seekTo(a, 0);
      } catch (_) { }
    });
    [this.els?.podcastActiveSpeakerVideo, this.els?.podcastActiveSpeakerVideoAlt, this.els?.podcastActiveSpeakerBackdropVideo, this.els?.podcastActiveSpeakerBackdropVideoAlt].forEach(v => {
      if (v) try { v.pause(); if (opts.keepCursor !== true) this.seekTo(v, 0); v.style.opacity = 0; v.style.zIndex = 1; } catch (_) { }
    });

    // UI Updates
    this.deps?.setPodcastVideoStatus?.(this.state.currentMs === 0 ? 'Detenido' : 'Pausado');
    this.deps?.updatePodcastVideoTransportUi?.();

    this.tick(this.state.currentMs);
    this.emit('stop', opts);
  }

  /**
   * Helper seguro para cambiar el tiempo de reproducción
   */
  seekTo(el, seconds) {
    if (!el || !Number.isFinite(seconds)) return;
    try {
      // Solo buscar si el elemento tiene metadatos cargados
      if (el.readyState >= 1) {
        el.currentTime = seconds;
      } else {
        // Si no está listo, guardar para cuando cargue o intentar forzar
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
    // console.log("[PlaybackController] startClock called. State:", this.state);
    this.stopClock();
    let lastTime = performance.now();
    const tickLoop = async (now) => {
      if (!this.state.isPlaying) return;
      try {
        const delta = now - lastTime;
        lastTime = now;
        const speed = this.deps?.getPlaybackSpeed?.() || 1;
        const clampedDelta = Math.min(delta, 100);
        const nextMs = this.state.currentMs + (clampedDelta * speed);

        await this.tick(nextMs);

        if (this.state.currentMs >= this.state.totalDurationMs) {
          this.stop();
        } else if (this.state.isPlaying) {
          this.clockId = requestAnimationFrame(tickLoop);
        }
      } catch (error) {
        console.error("[PlaybackController] Error in tickLoop:", error);
        this.pause(); // Stop and allow recovery
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
    const current = Math.max(0, Number(this.deps?.podcastVideoState?.montageCursorMs ?? this.state.currentMs ?? 0));

    // Find previous marker (with 500ms threshold: if we are >500ms into a scene, go to start of scene, else go to prev scene)
    const targetMs = [...markers].reverse().find(ms => ms < current - 500) ?? 0;

    // console.log('[PlaybackController] Prev: current=', current, 'markers=', markers, 'target=', targetMs);
    this.stop({ keepStatus: true, keepCursor: true });
    this.state.currentMs = targetMs;
    await this.tick(targetMs);
    this.emit('seek', { currentMs: targetMs });
    this.deps?.updatePodcastVideoTransportUi?.();
  }

  async next() {
    this.sync();
    const session = this.state.session || this.deps?.getActiveSession?.();
    const entries = this.deps?.buildTimelineRuntimeEntries?.(session) || [];
    if (!entries.length) return;

    const markers = [...new Set(entries.map(e => Math.round(Number(e.startMs || 0))))].sort((a, b) => a - b);
    const current = Math.max(0, Number(this.deps?.podcastVideoState?.montageCursorMs ?? this.state.currentMs ?? 0));

    const targetMs = markers.find(ms => ms > current + 120) ?? markers[markers.length - 1];

    // console.log('[PlaybackController] Next: current=', current, 'markers=', markers, 'target=', targetMs);
    this.stop({ keepStatus: true, keepCursor: true });
    this.state.currentMs = targetMs;
    await this.tick(targetMs);
    this.emit('seek', { currentMs: targetMs });
    this.deps?.updatePodcastVideoTransportUi?.();
  }

  async seek(targetMs) {
    const ms = Math.max(0, Math.min(this.state.totalDurationMs || 9999999, Number(targetMs) || 0));
    // console.log('[PlaybackController] Seeking to:', ms);
    this.state.currentMs = ms;
    await this.tick(ms);
    this.emit('seek', { currentMs: ms });
  }

  async tick(currentMs) {
    const ms = Number.isFinite(Number(currentMs)) ? Number(currentMs) : (this.state.currentMs || 0);
    this.state.currentMs = ms;
    if (this.deps?.podcastVideoState) {
      this.deps.podcastVideoState.montageCursorMs = ms;
      this.deps.podcastVideoState.montageAudioPlayers = this.dialoguePlayers;
    }
    if (this.deps?.syncPodcastTimelinePlayhead) {
      this.deps.syncPodcastTimelinePlayhead(ms, this.state.totalDurationMs, this.state.session);
    }
    if (this.deps?.updatePodcastVideoTransportUi) this.deps.updatePodcastVideoTransportUi();
    const speed = this.deps?.getPlaybackSpeed?.() || 1;
    await Promise.all([
      this.syncAudio(ms, speed),
      this.syncVideo(ms),
      this.syncOverlay ? this.syncOverlay(ms) : null
    ]);
    this.emit('timeupdate', { currentMs: ms });
  }

  // --- Audio ---
  async syncAudio(currentMs, speed) {
    const session = this.state.session || this.deps?.getActiveSession?.();
    const config = this.deps?.getPodcastVideoConfig?.(session) || {};
    const audioTrack = config.geminiDialogueTrack || { segments: [], enabled: true };
    const segments = (audioTrack.enabled !== false) ? (audioTrack.segments || []) : [];
    const activeSegments = segments.filter(s => currentMs >= s.startMs && currentMs < (s.startMs + s.durationMs));
    const activeRowIds = new Set(activeSegments.map(s => s.rowId));

    // Pro-active pre-loading of upcoming audio
    const upcoming = segments.filter(s => s.startMs > currentMs && (s.startMs - currentMs) < 5000);
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
      if (!rawAudioSrc) {
        console.warn('[PlaybackController] No audio src for row:', rowId);
        continue;
      }

      const audioSrc = await this.getBlobUrl(rawAudioSrc);
      hasVoice = true;
      let audio = this.dialoguePlayers[rowId];
      if (!audio || (audio.dataset.originalSrc !== audioSrc)) {
        // console.log('[PlaybackController] Creating new Audio for row:', rowId, audioSrc);
        if (audio) try { audio.pause(); } catch (_) { }
        audio = new Audio();
        audio.crossOrigin = 'anonymous';
        audio.src = audioSrc;
        audio.dataset.originalSrc = audioSrc;
        audio.dataset.initialized = "false";
        this.dialoguePlayers[rowId] = audio;
        this.audioCache[rowId] = audio;
        // Capture real duration once metadata is available and update chips
        audio.addEventListener("loadedmetadata", () => {
          const measuredSec = audio.duration;
          if (Number.isFinite(measuredSec) && measuredSec > 0) {
            const pvs = this.deps?.podcastVideoState;
            if (pvs) {
              if (!pvs.montageAudioActualDurationsMs) pvs.montageAudioActualDurationsMs = {};
              const prevMs = pvs.montageAudioActualDurationsMs[rowId] || 0;
              const nextMs = Math.round(measuredSec * 1000);
              if (Math.abs(nextMs - prevMs) > 100) {
                pvs.montageAudioActualDurationsMs[rowId] = nextMs;
                // Re-render timeline so the chip width reflects the real audio length
                if (this.deps?.renderPodcastVideoTimeline && this.deps?.getActiveSession) {
                  this.deps.renderPodcastVideoTimeline(this.deps.getActiveSession(), { force: true, reason: "audio-duration-measured" });
                }
              }
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

      // Precision sync: if just started or drift > 0.2s
      const drift = Math.abs(audio.currentTime - offsetSec);
      if (audio.dataset.initialized === "false" || drift > 0.2) {
        // console.log('[PlaybackController] Syncing audio currentTime:', rowId, offsetSec);
        this.seekTo(audio, offsetSec);
        audio.dataset.initialized = "true";
      }

      if (this.state.isPlaying && audio.paused) {
        // console.log('[PlaybackController] Playing audio:', rowId);
        audio.play().catch(e => console.warn('[PlaybackController] Audio play failed:', rowId, e));
      }
    }
    this.syncBackgroundMusic(currentMs, speed, hasVoice);
  }

  async syncBackgroundMusic(currentMs, speed, hasVoice = false) {
    const session = this.state.session || this.deps?.getActiveSession?.();
    const panelCfg = this.deps?.getPanelMontageMusicConfig?.(session);
    if (!panelCfg || panelCfg.sourceType === "none") { this.stopBackgroundMusic(); return; }

    // Support for multiple segments (chips) in timeline
    const sourceItems = Array.isArray(panelCfg.sourceItems) ? panelCfg.sourceItems : [];
    let activeSegment = null;
    if (sourceItems.length > 0) {
      activeSegment = sourceItems.find(s => currentMs >= s.startOffsetMs && currentMs < s.endOffsetMs);
    }

    const rawSrc = activeSegment ? activeSegment.sourceUrl : panelCfg.sourceUrl;
    // console.log('[PlaybackController] syncBackgroundMusic rawSrc:', rawSrc);
    if (!rawSrc) {
      // if (this.backgroundAudio) console.log('[PlaybackController] No background src for background music, stopping.');
      this.stopBackgroundMusic();
      return;
    }

    if (this.backgroundSrc !== rawSrc) {
      console.log('[PlaybackController] Switching background music to:', rawSrc);
      this.stopBackgroundMusic();
      this.backgroundSrc = rawSrc;
      try {
        const blobSrc = await this.getBlobUrl(rawSrc);
        this.backgroundAudio = new Audio();
        this.backgroundAudio.crossOrigin = 'anonymous';
        this.backgroundAudio.src = blobSrc;
        this.backgroundAudio.dataset.initialized = "false";
        this.backgroundAudio.addEventListener('error', (e) => {
          console.warn('[PlaybackController] backgroundAudio error:', e, 'src:', blobSrc);
        });
        if (activeSegment ? activeSegment.loop : true) {
          this.backgroundAudio.loop = true;
        }
      } catch (e) {
        console.error('[PlaybackController] Failed to initialize background music:', e);
        this.backgroundSrc = "";
        return;
      }
    }

    const entry = this.getEntryAtMs(currentMs);
    const rowId = entry?.rowId;
    const mix = rowId ? this.deps?.resolveTimelineClipMix?.(session, rowId) : null;
    const sceneBackgroundFactor = mix ? (mix.backgroundVolume ?? 1.0) : 1.0;

    // Use property names consistent with backend and panelMusicState
    const baseVolume = activeSegment && activeSegment.volume !== undefined ? activeSegment.volume : this.toFiniteNumber(panelCfg.volume, 100);
    const duckPct = activeSegment && (activeSegment.duckingWhenGeminiPct ?? activeSegment.duckingPct) !== undefined
      ? (activeSegment.duckingWhenGeminiPct ?? activeSegment.duckingPct)
      : this.toFiniteNumber(panelCfg.duckingWhenGeminiPct, 60);

    this.backgroundDuckFactor = hasVoice ? (duckPct / 100) : 1.0;
    const finalVolume = (baseVolume / 100) * this.backgroundDuckFactor * sceneBackgroundFactor;

    if (this.backgroundAudio) {
      if (this.audioCtx) {
        this.ensureBackgroundChain();
        if (this.backgroundGain) {
          // Use a very small time constant for "instant" feel but avoid clicks
          this.backgroundGain.gain.setTargetAtTime(this.clamp01(finalVolume), this.audioCtx.currentTime, 0.04);
        } else {
          this.backgroundAudio.volume = this.clamp01(finalVolume);
        }
      } else {
        this.backgroundAudio.volume = this.clamp01(finalVolume);
      }
    }

    if (activeSegment) {
      if (!this.backgroundAudio) return;
      const trimInMs = Math.max(0, Number(activeSegment.trimInMs || 0));
      const offsetMs = currentMs - activeSegment.startOffsetMs;
      const offsetSec = (trimInMs + offsetMs) / 1000;
      const bgDrift = Math.abs(this.backgroundAudio.currentTime - offsetSec);

      if (this.backgroundAudio.dataset.initialized === "false" || bgDrift > 0.3) {
        this.seekTo(this.backgroundAudio, offsetSec);
        this.backgroundAudio.dataset.initialized = "true";
      }
    }

    if (this.state.isPlaying && this.backgroundAudio && this.backgroundAudio.paused) {
      this.backgroundAudio.play().catch(() => { });
    }
  }

  ensureBackgroundChain() {
    if (!this.audioCtx || this.backgroundGain || !this.backgroundAudio) return;
    try {
      this.backgroundSource = this.audioCtx.createMediaElementSource(this.backgroundAudio);
      this.backgroundCompressor = this.audioCtx.createDynamicsCompressor();
      this.backgroundGain = this.audioCtx.createGain();
      this.backgroundSource.connect(this.backgroundCompressor);
      this.backgroundCompressor.connect(this.backgroundGain);
      this.backgroundGain.connect(this.audioCtx.destination);
    } catch (e) { }
  }

  stopBackgroundMusic() {
    if (this.backgroundAudio) { try { this.backgroundAudio.pause(); } catch (_) { } this.backgroundAudio = null; }
    this.backgroundSrc = "";
    if (this.backgroundSource) { try { this.backgroundSource.disconnect(); } catch (_) { } }
    this.backgroundSource = null;
    this.backgroundGain = null;
    this.backgroundCompressor = null;
  }

  // --- Video ---
  syncVideo(currentMs) {
    if (this.state.useMse) return;
    const active = this.getEntryAtMs(currentMs);

    // Pro-active pre-loading of multiple upcoming scenes
    const entries = this.deps?.buildTimelineRuntimeEntries?.(this.state.session) || [];
    const upcoming = entries.filter(e => e.startMs > currentMs && (e.startMs - currentMs) < 4000);
    upcoming.forEach(e => this.getBlobUrl(e.videoSrc));

    if (active) {
      this.syncStageSwitching(active, currentMs);
    } else {
      [this.els?.podcastActiveSpeakerVideo, this.els?.podcastActiveSpeakerVideoAlt].forEach(v => {
        if (v) { v.style.opacity = 0; v.hidden = true; }
      });
    }
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
    
    // console.log("[PlaybackController] syncStageSwitching. Entry RowId:", entry.rowId, "VideoSrc:", !!entry.videoSrc, "ActiveSlot:", activeSlot);

    if (!activeEl) return;

    if (activeEl.dataset.src === entry.videoSrc) {
      // Correct element is already active
      if (Math.abs(activeEl.currentTime - offsetSec) > 0.2) {
        this.seekTo(activeEl, offsetSec);
      }
      if (this.state.isPlaying && activeEl.paused) {
        // console.log('[PlaybackController] Resuming activeEl', activeEl.id);
        activeEl.play().catch(err => console.warn('[PlaybackController] Play error:', err));
      }
      
      // console.log('[PlaybackController] Showing activeEl:', activeEl.id, 'Opacity: 1, zIndex: 2');
      activeEl.style.zIndex = "2";
      activeEl.style.opacity = "1";
      activeEl.style.visibility = "visible";
      activeEl.hidden = false;

      // Aplicar volumen del video (Veo)
      const config = this.deps?.getPodcastVideoConfig?.(this.state.session) || {};
      const masterClipVolume = Number(config.clipVolume ?? 100) / 100;
      const mix = this.deps?.resolveTimelineClipMix?.(this.state.session, entry.rowId) || { videoVolume: 1 };
      activeEl.volume = this.clamp01(masterClipVolume * (mix.videoVolume ?? 1.0));
      
      if (inactiveEl) {
        // console.log('[PlaybackController] Hiding inactiveEl:', inactiveEl.id, 'Opacity: 0');
        inactiveEl.style.zIndex = "1";
        inactiveEl.style.opacity = "0";
        if (inactiveEl.dataset.src !== entry.videoSrc) {
          inactiveEl.pause();
        }
      }
    } else {
      // We need to switch
      if (!entry.videoSrc) {
        // No video source for this scene (could be an audio-only chip or missing asset)
        // Ensure activeEl is at least visible if it's the intended placeholder
        activeEl.style.zIndex = "2";
        activeEl.style.opacity = "1";
        activeEl.style.visibility = "visible";
        activeEl.hidden = false;
        return;
      }

      if (this.stageMachine.loadingSrc === entry.videoSrc) {
        return; // Already switching to this one
      }

      // console.log('[PlaybackController] Switching scene to:', entry.videoSrc, 'at', offsetSec);
      this.stageMachine.loadingSrc = entry.videoSrc;

      try {
        const blobUrl = await this.getBlobUrl(entry.videoSrc);

        // If we don't have an inactive element (Single Video Mode, like in Export Preview),
        // we just update the active element directly.
        if (!inactiveEl) {
          if (activeEl.dataset.src !== entry.videoSrc) {
            await this.deps?.setPodcastStageVideoSourceForElement?.(activeEl, blobUrl);
            activeEl.dataset.src = entry.videoSrc;
          }
          this.seekTo(activeEl, offsetSec);
          if (this.state.isPlaying) {
            activeEl.play().catch(() => { });
          }
          this.stageMachine.loadingSrc = null;
          return;
        }

        // Seamless swap mode (requires both active and inactive elements)
        if (inactiveEl.dataset.src !== entry.videoSrc) {
          // console.log('[PlaybackController] Loading new source into inactiveEl');
          await this.deps?.setPodcastStageVideoSourceForElement?.(inactiveEl, blobUrl);
          inactiveEl.dataset.src = entry.videoSrc;
        }

        this.seekTo(inactiveEl, offsetSec);

        // SWAP VISIBILITY
        inactiveEl.style.zIndex = "2";
        inactiveEl.style.opacity = "1";
        inactiveEl.style.visibility = "visible";
        inactiveEl.hidden = false;

        if (this.state.isPlaying) {
          // console.log('[PlaybackController] Playing inactiveEl after switch');
          await inactiveEl.play().catch(err => console.warn('[PlaybackController] Inactive play failed:', err));
        }

        activeEl.style.zIndex = "1";
        activeEl.style.opacity = "0";
        activeEl.style.visibility = "hidden";
        activeEl.hidden = true;
        activeEl.pause();

        // Aplicar volumen al nuevo elemento activo
        const config = this.deps?.getPodcastVideoConfig?.(this.state.session) || {};
        const masterClipVolume = Number(config.clipVolume ?? 100) / 100;
        const mix = this.deps?.resolveTimelineClipMix?.(this.state.session, entry.rowId) || { videoVolume: 1 };
        inactiveEl.volume = this.clamp01(masterClipVolume * (mix.videoVolume ?? 1.0));

        // Swap slot globally
        const nextSlot = activeSlot === 1 ? 0 : 1;
        // console.log('[PlaybackController] Swapping slot to:', nextSlot);
        this.deps?.setActiveStageVideoSlot?.(nextSlot);
      } catch (e) {
        console.error('[PlaybackController] Scene switch failed:', e);
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
