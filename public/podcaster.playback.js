import { createTimelinePlaybackEngineMSE } from "./podcaster.timelinePlaybackEngine.mse.js";

export function createPodcasterStudioPlayback(deps = {}) {
  const {
    els,
    podcastVideoState,
    STUDIO_TIMELINE_MIN_CLIP_MS,
    STUDIO_TIMELINE_SNAP_MS,
    getActiveSession,
    getPodcastVideoConfig,
    toFiniteNumber,
    ensureTimelineClipsByRowId,
    syncPodcastTimelinePlayhead,
    secondsToClock,
    setPodcastVideoStatus,
    updatePodcastVideoTransportUi,
    setPodcastVideoRow,
    setPodcastVideoSpeaker,
    syncPodcastStudioRuntimeUi,
    syncPodcastVideoStageMedia,
    getTransitionForEdge,
    applyStudioTransition,
    primePodcastStageVideoSource,
    setPodcastStageVideoSource,
    setPodcastStageVideoSourceForElement,
    setTimelinePreviewsSuspended,
    buildTimelineRuntimeEntries,
    getTimelineTotalDurationMs,
    getPanelMontageMusicConfig,
    getActiveStageVideoEl,
    getInactiveStageVideoEl,
    setActiveStageVideoSlot,
    shouldUseNativeVideoAudioForRow,
    resolveDialogueAudioForRow,
    resolveStorageAudioUrl,
    resolvePodcastStageAudioSrc,
    markStaleProxyMediaUrl,
    syncGeminiDialogueTrackWithRuntime,
    syncPodcastOnScreenTextOverlay
  } = deps;

  let montageBackgroundAudio = null;
  let montageBackgroundCtx = null;
  let montageBackgroundSource = null;
  let montageBackgroundCompressor = null;
  let montageBackgroundGain = null;
  let montageBackgroundSrc = "";
  let montageBackgroundPreset = "";
  let montageBackgroundFilter = null;
  let montageBackgroundLfo = null;
  let montageBackgroundLfoGain = null;
  let montageBackgroundOscillators = [];
  let montageAudioCache = {};
  let montageBackgroundDuckFactor = 1;
  const failedSceneAudioRows = new Set();
  let previewSyncRequestToken = 0;
  let previewSceneAudio = null;
  let previewSceneAudioRowId = "";
  let previewSceneAudioSrc = "";
  let pendingStageSwap = null;
  let pendingStageSwapSeq = 0;
  let pendingStageLookahead = null;
  let pendingStageLookaheadSeq = 0;
  const MONTAGE_BACKGROUND_FADE_MS = 420;
  let montageBackgroundLoopTrimInSec = 0;
  let montageBackgroundLoopTrimOutSec = 0;
  let stageVideoUnmuteToken = 0;
  // Transiciones desactivadas: el montaje hace cortes (cut) sin interpolación.

  let mseEngine = null;
  let mseLastRuntimeRowId = "";
  let mseRuntimeEntries = [];

  function resolveSceneBackgroundMusicVolumePctAtMs(currentMs = 0, fallbackPct = 100, runtimeEntries = []) {
    const session = getActiveSession();
    const entries = Array.isArray(runtimeEntries) && runtimeEntries.length
      ? runtimeEntries
      : buildTimelineRuntimeEntries(session);
    const targetMs = Math.max(0, Number(currentMs || 0) || 0);
    const activeEntry = entries
      .filter((entry) => targetMs >= Number(entry?.startMs || 0) && targetMs < Number(entry?.endMs || 0))
      .sort((a, b) => Number(b?.startMs || 0) - Number(a?.startMs || 0) || Number(b?.zIndex || 0) - Number(a?.zIndex || 0))[0] || null;
    const rowId = String(activeEntry?.rowId || "").trim();
    const cfg = getPodcastVideoConfig(session);
    const overridePct = Math.max(
      0,
      Math.min(
        200,
        toFiniteNumber(cfg?.timelineSceneAudioMixByRowId?.[rowId]?.backgroundMusicVolumePct, Number.NaN)
      )
    );
    const resolvedPct = Number.isFinite(overridePct)
      ? overridePct
      : Math.max(0, Math.min(200, toFiniteNumber(fallbackPct, 100)));
    return clamp01(resolvedPct / 100);
  }

  function getMseEngine() {
    if (mseEngine) return mseEngine;
    const stageVideo = els?.podcastActiveSpeakerVideo || null;
    if (!stageVideo) return null;
    mseEngine = createTimelinePlaybackEngineMSE({
      videoEl: stageVideo,
      onStatus: (payload = {}) => {
        const text = String(payload?.text || "").trim();
        const kind = String(payload?.kind || "").trim().toLowerCase();
        if (text) {
          // Refleja estado en el UI del montaje (sin spam).
          try {
            if (kind === "error") setPodcastVideoStatus(text);
            else if (kind === "warn") setPodcastVideoStatus(text);
          } catch (_) {}
        }
      },
      onPlayhead: (ms = 0) => {
        if (!podcastVideoState.montageActive || podcastVideoState.mseEngineActive !== true) return;
        const currentMs = Math.max(0, Number(ms || 0));
        podcastVideoState.montageCursorMs = currentMs;
        const session = getActiveSession();
        const speed = Math.max(0.5, Math.min(1.8, Number(els?.podcastVideoSpeedSelect?.value || 1)));
        const activeEntries = Array.isArray(mseRuntimeEntries)
          ? mseRuntimeEntries.filter((entry) => currentMs >= Number(entry?.startMs || 0) && currentMs < Number(entry?.endMs || 0))
          : [];
        try {
          syncMontageAudioPlayers(activeEntries, currentMs, speed, mseRuntimeEntries);
        } catch (_) {}
        try {
          syncMontageBackgroundMusic(currentMs, speed).catch(() => {});
        } catch (_) {}
        syncPodcastTimelinePlayhead(session);
        updatePodcastVideoTransportUi();
        if (els.podcastStudioScrubber && podcastVideoState.timelineDurationSec > 0) {
          const durationMs = Math.max(1, Number(podcastVideoState.timelineDurationSec || 1) * 1000);
          const ratio = Math.max(0, Math.min(1, currentMs / durationMs));
          els.podcastStudioScrubber.value = String(Math.round(ratio * 100));
        }
        if (els.podcastStudioTime) {
          const totalSec = Math.max(0, Number(podcastVideoState.timelineDurationSec || 0));
          els.podcastStudioTime.textContent = `${secondsToClock(currentMs / 1000)} / ${secondsToClock(totalSec)}`;
        }

        // Runtime UI (speaker/row) en base al playhead.
        const active = mseRuntimeEntries.find((entry) => currentMs >= entry.startMs && currentMs < entry.endMs) || null;
        const rowId = String(active?.rowId || "").trim();
        if (rowId && rowId !== mseLastRuntimeRowId) {
          mseLastRuntimeRowId = rowId;
          try {
            syncPodcastStudioRuntimeUi(session, rowId, String(active?.speakerKey || "").trim(), { speaking: true });
          } catch (_) {}
        }
      }
    });
    return mseEngine;
  }

  const montageStageMachine = {
    requestToken: 0,
    montageToken: 0,
    desiredRowId: "",
    desiredSrc: "",
    desiredOffsetSec: 0,
    desiredSpeed: 1,
    desiredVeoVolume: 0,
    allowUnmute: false,
    state: "idle",
    loadingSeq: 0,
    loadingSrc: "",
    loadingEl: null,
    lookaheadSeq: 0,
    lookaheadSrc: "",
    lookaheadEl: null,
    lastPlayAttemptAt: 0,
    lastPlayAttemptKey: "",
    lastCommitAt: 0
  };

  function stopPreviewSceneAudio() {
    if (previewSceneAudio) {
      try { previewSceneAudio.pause(); } catch (_) {}
    }
    previewSceneAudio = null;
    previewSceneAudioRowId = "";
    previewSceneAudioSrc = "";
  }

  function resolveFreshVoiceAudioSrc(segment = null, runtime = null) {
    const rowId = String(segment?.rowId || runtime?.rowId || "").trim();
    const session = getActiveSession();
    const storedAudio = rowId && typeof resolveDialogueAudioForRow === "function"
      ? resolveDialogueAudioForRow(session, rowId)
      : null;
    const storedSrc = storedAudio && typeof resolveStorageAudioUrl === "function"
      ? String(resolveStorageAudioUrl(storedAudio?.downloadUrl || "", storedAudio?.storagePath || "") || "").trim()
      : "";
    const runtimeSrc = String(runtime?.audioSrc || "").trim();
    const segmentSrc = String(segment?.audioSrc || "").trim();
    return storedSrc || runtimeSrc || segmentSrc;
  }

  function buildPreviewAudioSource(src = "") {
    const cleanSrc = String(src || "").trim();
    if (!cleanSrc) return "";
    return typeof resolvePodcastStageAudioSrc === "function"
      ? String(resolvePodcastStageAudioSrc(cleanSrc) || cleanSrc).trim()
      : cleanSrc;
  }

  function createPreviewSceneAudio(src = "", rowId = "") {
    const logicalSrc = String(src || "").trim();
    const playbackSrc = buildPreviewAudioSource(logicalSrc);
    if (!playbackSrc) return null;
    const audio = new Audio(playbackSrc);
    audio.preload = "auto";
    audio.__podcasterObjectUrlCacheKey = logicalSrc;
    audio.addEventListener("error", () => {
      try { markStaleProxyMediaUrl?.(logicalSrc, "proxy-media-404", { kind: "preview-scene-audio", rowId: String(rowId || "").trim() }); } catch (_) {}
      logMontageDebug("stale-segment-audio-src", {
        rowId: String(rowId || "").trim(),
        src: logicalSrc.slice(0, 240)
      });
      try { syncGeminiDialogueTrackWithRuntime?.({ render: false, preserveStartMs: true }); } catch (_) {}
    }, { once: true });
    return audio;
  }

  function stopScrubPreview() {
    if (podcastVideoState.montageActive) return;
    stopPreviewSceneAudio();
    const video = resolveStageVideoEl(true);
    if (video && !video.paused) {
      try { video.pause(); } catch (_) {}
    }
  }

  function isMontageDebugEnabled() {
    try {
      return window.localStorage.getItem("cb_podcast_render_debug") === "1";
    } catch (_) {
      return false;
    }
  }

  function logMontageDebug(event = "", payload = {}) {
    if (!event || !isMontageDebugEnabled()) return;
    try {
      window.__podcasterDebug = window.__podcasterDebug || {};
      window.__podcasterDebug.montage = window.__podcasterDebug.montage || {};
      window.__podcasterDebug.montage[event] = {
        event,
        at: new Date().toISOString(),
        ...payload
      };
      console.log("[podcaster][montage-debug]", event, {
        at: new Date().toISOString(),
        ...payload
      });
    } catch (_) {
      // noop
    }
  }

  function armStageVideoAudibleAfterPlay(videoEl, { isStaleRequest = null, timeoutMs = 700 } = {}) {
    if (!videoEl) return;
    const token = ++stageVideoUnmuteToken;
    const isStale = typeof isStaleRequest === "function"
      ? () => Boolean(isStaleRequest()) || token !== stageVideoUnmuteToken
      : () => token !== stageVideoUnmuteToken;
    const cleanup = () => {
      try { videoEl.removeEventListener("playing", onPlaying); } catch (_) {}
      try { videoEl.removeEventListener("canplay", onCanPlay); } catch (_) {}
    };
    const tryUnmute = () => {
      if (isStale()) return;
      try { videoEl.muted = false; } catch (_) {}
    };
    const onPlaying = () => {
      cleanup();
      tryUnmute();
    };
    const onCanPlay = () => {
      cleanup();
      if (isStale()) return;
      queueMicrotask(() => {
        tryUnmute();
      });
    };

    try { videoEl.addEventListener("playing", onPlaying, { once: true }); } catch (_) {}
    try { videoEl.addEventListener("canplay", onCanPlay, { once: true }); } catch (_) {}
    setTimeout(() => {
      cleanup();
      tryUnmute();
    }, Math.max(120, Number(timeoutMs || 0) || 700));
  }

  // Evita re-armar el auto-unmute en cada tick del montage (esto invalida timeouts/listeners
  // y puede dejar el video perpetuamente muted).
  let lastStageVideoUnmuteArmKey = "";

  function isEducationalSession(session = null) {
    const activeSession = session || getActiveSession();
    const topLevel = String(activeSession?.videoContentType || "").trim().toLowerCase();
    const scriptLevel = String(activeSession?.script?.videoContentType || "").trim().toLowerCase();
    if (topLevel === "educational" || scriptLevel === "educational") return true;
    return activeSession?.script?.videoMode === true;
  }

  function resolveStageVideoEl(isActive = true) {
    if (isActive && typeof getActiveStageVideoEl === "function") return getActiveStageVideoEl();
    if (!isActive && typeof getInactiveStageVideoEl === "function") return getInactiveStageVideoEl();
    return els.podcastActiveSpeakerVideo || null;
  }

  function normalizeVisualLayoutMode(value = "") {
    return String(value || "").trim().toLowerCase() === "blur-backdrop" ? "blur-backdrop" : "default";
  }

  function resolveStageBackdropEl(isActive = true) {
    if (isActive) {
      return Number(podcastVideoState.stageVideoSlot || 0) === 1
        ? (els.podcastActiveSpeakerBackdropVideoAlt || null)
        : (els.podcastActiveSpeakerBackdropVideo || null);
    }
    return Number(podcastVideoState.stageVideoSlot || 0) === 1
      ? (els.podcastActiveSpeakerBackdropVideo || null)
      : (els.podcastActiveSpeakerBackdropVideoAlt || null);
  }

  function resolveStageVideoBundle(isActive = true) {
    return {
      foreground: resolveStageVideoEl(isActive),
      backdrop: resolveStageBackdropEl(isActive)
    };
  }

  function resolveStageVideoBundleForForeground(videoEl = null) {
    const video = videoEl || null;
    if (!video) return { foreground: null, backdrop: null };
    if (video === els.podcastActiveSpeakerVideoAlt) {
      return {
        foreground: els.podcastActiveSpeakerVideoAlt || null,
        backdrop: els.podcastActiveSpeakerBackdropVideoAlt || null
      };
    }
    return {
      foreground: els.podcastActiveSpeakerVideo || null,
      backdrop: els.podcastActiveSpeakerBackdropVideo || null
    };
  }

  function getAllStageVideoElements() {
    return [
      els.podcastActiveSpeakerBackdropVideo,
      els.podcastActiveSpeakerVideo,
      els.podcastActiveSpeakerBackdropVideoAlt,
      els.podcastActiveSpeakerVideoAlt
    ].filter(Boolean);
  }

  function applyStageBundleLayout(bundle = null, layoutMode = "default") {
    const mode = normalizeVisualLayoutMode(layoutMode);
    const foreground = bundle?.foreground || null;
    const backdrop = bundle?.backdrop || null;
    if (foreground) {
      foreground.classList.toggle("is-blur-backdrop-foreground", mode === "blur-backdrop");
    }
    if (backdrop) {
      backdrop.classList.toggle("is-layout-active", mode === "blur-backdrop");
      backdrop.style.opacity = mode === "blur-backdrop" ? "1" : "0";
      backdrop.hidden = mode !== "blur-backdrop";
      backdrop.style.pointerEvents = "none";
    }
  }

  function resolveStageVideoSlotForEl(videoEl) {
    const video = videoEl || null;
    if (!video) return 0;
    const alt = els?.podcastActiveSpeakerVideoAlt || null;
    return alt && video === alt ? 1 : 0;
  }

  function clearStageVideoInlineStyles(videoEl) {
    if (!videoEl) return;
    try {
      videoEl.style.opacity = "";
      videoEl.style.transform = "";
      videoEl.style.filter = "";
      videoEl.style.transition = "";
      videoEl.style.clipPath = "";
      videoEl.style.zIndex = "";
      videoEl.style.pointerEvents = "";
    } catch (_) {
      // noop
    }
  }

  function clampNumber(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return Number(min);
    return Math.max(Number(min), Math.min(Number(max), num));
  }

  function resolveSafeOffsetSec(videoEl, offsetSec) {
    const video = videoEl || null;
    const raw = Math.max(0, Number(offsetSec || 0));
    if (!video) return raw;
    const duration = Number(video.duration || 0);
    if (Number.isFinite(duration) && duration > 0.05) {
      return clampNumber(raw, 0, Math.max(0, duration - 0.04));
    }
    return raw;
  }

  function logStagePlayRejection(videoEl, { rowId = "", src = "", slot = 0, error = null, phase = "" } = {}) {
    const video = videoEl || null;
    const err = error || null;
    logMontageDebug("stage-play-reject", {
      phase: String(phase || "").trim(),
      rowId: String(rowId || "").trim(),
      src: String(src || "").trim().slice(0, 180),
      slot: Number(slot || 0),
      muted: Boolean(video?.muted),
      volume: Number(video?.volume || 0),
      readyState: Number(video?.readyState || 0),
      currentTime: Number(video?.currentTime || 0),
      duration: Number(video?.duration || 0),
      name: String(err?.name || ""),
      message: String(err?.message || "").slice(0, 160)
    });
  }

  function tryPlayStageVideoMuted(videoEl, { rowId = "", src = "", slot = 0, phase = "play" } = {}) {
    const video = videoEl || null;
    if (!video) return null;
    try { video.muted = true; } catch (_) {}
    try { video.volume = 0; } catch (_) {}
    const p = video.play();
    if (p && typeof p.catch === "function") {
      p.catch((error) => {
        logStagePlayRejection(video, { rowId, src, slot, error, phase });
      });
    }
    return p;
  }

  function armStageVideoUnmuteAfterPlaying(videoEl, {
    desiredVolume = 0,
    isStale = null,
    timeoutMs = 900
  } = {}) {
    const video = videoEl || null;
    if (!video) return;
    const token = ++stageVideoUnmuteToken;
    const isStaleLocal = typeof isStale === "function"
      ? () => Boolean(isStale()) || token !== stageVideoUnmuteToken
      : () => token !== stageVideoUnmuteToken;
    const applyUnmute = () => {
      if (isStaleLocal()) return;
      try { video.volume = Math.max(0, Math.min(1, Number(desiredVolume || 0))); } catch (_) {}
      try { video.muted = false; } catch (_) {}
    };
    const cleanup = () => {
      try { video.removeEventListener("playing", onPlaying); } catch (_) {}
      try { video.removeEventListener("canplay", onCanPlay); } catch (_) {}
    };
    const onPlaying = () => {
      cleanup();
      applyUnmute();
    };
    const onCanPlay = () => {
      cleanup();
      if (isStaleLocal()) return;
      try {
        if (typeof video.requestVideoFrameCallback === "function") {
          video.requestVideoFrameCallback(() => applyUnmute());
          return;
        }
      } catch (_) {}
      setTimeout(() => applyUnmute(), 60);
    };
    try { video.addEventListener("playing", onPlaying, { once: true }); } catch (_) {}
    try { video.addEventListener("canplay", onCanPlay, { once: true }); } catch (_) {}
    setTimeout(() => {
      cleanup();
      applyUnmute();
    }, Math.max(180, Number(timeoutMs || 0) || 900));
  }

  function ensureActiveStageVideoVisible(videoEl) {
    const video = videoEl || null;
    if (!video) return;
    try { video.hidden = false; } catch (_) {}
    try {
      if (String(video.style.opacity || "").trim() === "0") {
        video.style.opacity = "";
      }
    } catch (_) {}
    try { video.style.pointerEvents = ""; } catch (_) {}
  }

  async function ensureStageBundleReady(bundle = null, entry = null, offsetSec = 0, options = {}) {
    const foreground = bundle?.foreground || null;
    const backdrop = bundle?.backdrop || null;
    const nextSrc = String(entry?.videoSrc || "").trim();
    if (!foreground || !nextSrc) return false;
    const layoutMode = normalizeVisualLayoutMode(entry?.clip?.visualLayoutMode);
    const keepHidden = options.keepHidden === true;
    const playbackRate = Math.max(0.5, Math.min(1.8, Number(options.playbackRate || 1) || 1));
    const seekToleranceSec = Math.max(0.01, Number(options.seekToleranceSec || 0.05) || 0.05);
    const forceSeek = options.forceSeek === true;
    const safeOffsetFor = (video) => {
      const durationSec = Math.max(0, Number(video?.duration || 0));
      return durationSec > 0
        ? Math.max(0, Math.min(Math.max(0, durationSec - 0.04), Number(offsetSec || 0)))
        : Math.max(0, Number(offsetSec || 0));
    };
    const ensureVideoSource = async (video, src, hidden = false) => {
      if (!video || !src) return false;
      const alreadyLoaded = String(video.dataset?.src || "").trim() === src
        && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
      if (!alreadyLoaded && typeof setPodcastStageVideoSourceForElement === "function") {
        const ok = await setPodcastStageVideoSourceForElement(video, src, { keepHidden: hidden });
        if (!ok) return false;
      } else {
        video.hidden = hidden;
      }
      return true;
    };

    const okForeground = await ensureVideoSource(foreground, nextSrc, keepHidden);
    if (!okForeground) return false;
    foreground.hidden = keepHidden;
    foreground.style.pointerEvents = "none";
    foreground.playbackRate = playbackRate;
    const foregroundOffset = safeOffsetFor(foreground);
    if (forceSeek || Math.abs(Number(foreground.currentTime || 0) - foregroundOffset) > seekToleranceSec) {
      try { foreground.currentTime = foregroundOffset; } catch (_) {}
    }

    applyStageBundleLayout(bundle, layoutMode);
    if (backdrop) {
      backdrop.muted = true;
      backdrop.volume = 0;
      backdrop.playbackRate = playbackRate;
      if (layoutMode === "blur-backdrop") {
        const okBackdrop = await ensureVideoSource(backdrop, nextSrc, keepHidden);
        if (okBackdrop) {
          backdrop.hidden = keepHidden;
          const backdropOffset = safeOffsetFor(backdrop);
          if (forceSeek || Math.abs(Number(backdrop.currentTime || 0) - backdropOffset) > seekToleranceSec) {
            try { backdrop.currentTime = backdropOffset; } catch (_) {}
          }
        }
      } else {
        try { backdrop.pause(); } catch (_) {}
        backdrop.hidden = true;
      }
    }
    return true;
  }

  function setStageBundleOpacity(bundle = null, opacity = 1) {
    const value = Math.max(0, Math.min(1, Number(opacity || 0)));
    [bundle?.backdrop, bundle?.foreground].filter(Boolean).forEach((video) => {
      video.style.opacity = String(value);
      video.hidden = value <= 0.0001;
      video.style.pointerEvents = "none";
    });
  }

  function clearStageBundleOpacity(bundle = null) {
    [bundle?.backdrop, bundle?.foreground].filter(Boolean).forEach((video) => {
      video.style.opacity = "";
      video.style.pointerEvents = "none";
      video.hidden = false;
    });
  }

  function resetPendingStageWork() {
    pendingStageSwap = null;
    pendingStageLookahead = null;
    pendingStageSwapSeq += 1;
    pendingStageLookaheadSeq += 1;
    montageStageMachine.requestToken = 0;
    montageStageMachine.montageToken = 0;
    montageStageMachine.desiredRowId = "";
    montageStageMachine.desiredSrc = "";
    montageStageMachine.state = "idle";
    montageStageMachine.loadingSeq += 1;
    montageStageMachine.loadingSrc = "";
    montageStageMachine.loadingEl = null;
    montageStageMachine.lookaheadSeq += 1;
    montageStageMachine.lookaheadSrc = "";
    montageStageMachine.lookaheadEl = null;
  }

  function cancelPendingStageSwap(reason = "") {
    const state = pendingStageSwap;
    pendingStageSwap = null;
    pendingStageSwapSeq += 1;
    if (!state) return;
    const toEl = state.toEl || null;
    if (toEl && toEl !== resolveStageVideoEl(true)) {
      try { toEl.style.opacity = ""; } catch (_) {}
      try { toEl.style.pointerEvents = ""; } catch (_) {}
      try { toEl.hidden = true; } catch (_) {}
      clearStageVideoInlineStyles(toEl);
    }
    logMontageDebug("stage-swap-cancel", {
      reason: String(reason || "").slice(0, 80),
      src: String(state?.src || "").trim().slice(0, 120)
    });
  }

  function requestNonBlockingStageSwap({
    requestToken = 0,
    montageToken = 0,
    rowId = "",
    src = "",
    fromEl = null,
    toEl = null
  } = {}) {
    const cleanSrc = String(src || "").trim();
    const fromVideo = fromEl || null;
    const toVideo = toEl || null;
    if (!cleanSrc || !fromVideo || !toVideo) return false;
    if (fromVideo === toVideo) return false;
    const seq = ++pendingStageSwapSeq;
    pendingStageSwap = {
      seq,
      requestToken: Number(requestToken || 0),
      montageToken: Number(montageToken || 0),
      rowId: String(rowId || "").trim(),
      src: cleanSrc,
      fromEl: fromVideo,
      toEl: toVideo,
      startedAt: Date.now(),
      loadDone: false,
      loadOk: false
    };
    try {
      clearStageVideoInlineStyles(toVideo);
      toVideo.hidden = false;
      toVideo.style.opacity = "0";
      toVideo.style.pointerEvents = "none";
      toVideo.style.transform = "translateZ(0)";
      toVideo.style.zIndex = "2";
    } catch (_) {}
    try {
      // No escondas el video saliente mientras se carga el nuevo;
      // evita "pantalla negra" durante cambios de escena.
      clearStageVideoInlineStyles(fromVideo);
      fromVideo.style.opacity = "";
      fromVideo.style.pointerEvents = "";
    } catch (_) {}
    // Silencia el video saliente para evitar traslapes de audio mientras el swap termina.
    try { fromVideo.volume = 0; } catch (_) {}
    try { fromVideo.muted = true; } catch (_) {}

    Promise.resolve()
      .then(() => setPodcastStageVideoSourceForElement(toVideo, cleanSrc))
      .then((ok) => {
        if (!pendingStageSwap || pendingStageSwap.seq !== seq) return;
        pendingStageSwap.loadDone = true;
        pendingStageSwap.loadOk = Boolean(ok);
      })
      .catch(() => {
        if (!pendingStageSwap || pendingStageSwap.seq !== seq) return;
        pendingStageSwap.loadDone = true;
        pendingStageSwap.loadOk = false;
      });

    logMontageDebug("stage-swap-requested", {
      rowId: String(rowId || "").trim(),
      src: cleanSrc.slice(0, 140)
    });
    return true;
  }

  function scheduleStageLookaheadLoad({
    requestToken = 0,
    montageToken = 0,
    src = "",
    videoEl = null
  } = {}) {
    const cleanSrc = String(src || "").trim();
    const video = videoEl || null;
    if (!cleanSrc || !video) return;
    const seq = ++pendingStageLookaheadSeq;
    pendingStageLookahead = {
      seq,
      requestToken: Number(requestToken || 0),
      montageToken: Number(montageToken || 0),
      src: cleanSrc,
      videoEl: video,
      startedAt: Date.now()
    };
    try {
      video.hidden = false;
      video.style.opacity = "0";
      video.style.pointerEvents = "none";
      video.style.transform = "translateZ(0)";
      video.style.zIndex = "1";
    } catch (_) {}
    Promise.resolve()
      .then(() => setPodcastStageVideoSourceForElement(video, cleanSrc))
      .catch(() => {});
  }

  function syncMontageStageVideo({
    requestToken = 0,
    montageToken = 0,
    rowId = "",
    src = "",
    offsetSec = 0,
    speed = 1,
    shouldAutoplay = true,
    scrubMuteVideo = false,
    desiredVeoVolume = 0,
    allowUnmute = false,
    nextSrc = ""
  } = {}) {
    if (!podcastVideoState.montageActive) return;
    const cleanSrc = String(src || "").trim();
    if (!cleanSrc) return;
    const activeEl = resolveStageVideoEl(true);
    const inactiveEl = resolveStageVideoEl(false);
    if (!activeEl) return;

    const isStale = () => !podcastVideoState.montageActive
      || Number(podcastVideoState.montageToken || 0) !== Number(montageToken || 0)
      || Number(previewSyncRequestToken || 0) !== Number(requestToken || 0);

    // State init / rollover.
    if (
      montageStageMachine.requestToken !== Number(requestToken || 0)
      || montageStageMachine.montageToken !== Number(montageToken || 0)
    ) {
      montageStageMachine.requestToken = Number(requestToken || 0);
      montageStageMachine.montageToken = Number(montageToken || 0);
      montageStageMachine.desiredRowId = "";
      montageStageMachine.desiredSrc = "";
      montageStageMachine.state = "idle";
      montageStageMachine.loadingSeq += 1;
      montageStageMachine.loadingSrc = "";
      montageStageMachine.loadingEl = null;
      montageStageMachine.lookaheadSeq += 1;
      montageStageMachine.lookaheadSrc = "";
      montageStageMachine.lookaheadEl = null;
    }

    montageStageMachine.desiredRowId = String(rowId || "").trim();
    montageStageMachine.desiredSrc = cleanSrc;
    montageStageMachine.desiredOffsetSec = Math.max(0, Number(offsetSec || 0));
    montageStageMachine.desiredSpeed = Math.max(0.5, Math.min(1.8, Number(speed || 1)));
    montageStageMachine.desiredVeoVolume = Math.max(0, Math.min(1, Number(desiredVeoVolume || 0)));
    montageStageMachine.allowUnmute = Boolean(allowUnmute);

    ensureActiveStageVideoVisible(activeEl);

    // Lookahead: precarga el siguiente clip en el slot inactivo si no está ocupado cargando el actual.
    const cleanNextSrc = String(nextSrc || "").trim();
    if (inactiveEl && cleanNextSrc) {
      const alreadyLoaded = String(inactiveEl.dataset?.src || "").trim() === cleanNextSrc
        && inactiveEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
      const loadingThisEl = montageStageMachine.state === "loading" && montageStageMachine.loadingEl === inactiveEl;
      const canLookahead = !loadingThisEl || montageStageMachine.loadingSrc === cleanNextSrc;
      if (!alreadyLoaded && canLookahead && montageStageMachine.lookaheadSrc !== cleanNextSrc) {
        montageStageMachine.lookaheadSeq += 1;
        montageStageMachine.lookaheadSrc = cleanNextSrc;
        montageStageMachine.lookaheadEl = inactiveEl;
        scheduleStageLookaheadLoad({
          requestToken,
          montageToken,
          src: cleanNextSrc,
          videoEl: inactiveEl
        });
      }
    }

    const activeSrc = String(activeEl.dataset?.src || "").trim();
    const inactiveSrc = inactiveEl ? String(inactiveEl.dataset?.src || "").trim() : "";
    const inactiveReady = inactiveEl && inactiveEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
    const desiredSafeOffset = resolveSafeOffsetSec(inactiveEl && inactiveSrc === cleanSrc ? inactiveEl : activeEl, montageStageMachine.desiredOffsetSec);

    const commitTo = (targetEl) => {
      const target = targetEl || null;
      if (!target) return;
      const targetSlot = resolveStageVideoSlotForEl(target);
      try { setActiveStageVideoSlot(targetSlot); } catch (_) {}
      const nowActive = resolveStageVideoEl(true) || target;
      const nowInactive = resolveStageVideoEl(false) || null;
      ensureActiveStageVideoVisible(nowActive);
      clearStageVideoInlineStyles(nowActive);
      try { nowActive.playbackRate = montageStageMachine.desiredSpeed; } catch (_) {}
      try { nowActive.muted = true; } catch (_) {}
      try { nowActive.volume = 0; } catch (_) {}
      try { nowActive.currentTime = resolveSafeOffsetSec(nowActive, montageStageMachine.desiredOffsetSec); } catch (_) {}
      if (shouldAutoplay && !scrubMuteVideo) {
        const slot = resolveStageVideoSlotForEl(nowActive);
        tryPlayStageVideoMuted(nowActive, { rowId, src: cleanSrc, slot, phase: "commit-play" });
        const wantsAudio = montageStageMachine.allowUnmute && montageStageMachine.desiredVeoVolume > 0;
        if (wantsAudio) {
          armStageVideoUnmuteAfterPlaying(nowActive, {
            desiredVolume: montageStageMachine.desiredVeoVolume,
            isStale,
            timeoutMs: 900
          });
        }
      } else {
        try { nowActive.pause(); } catch (_) {}
      }
      if (nowInactive && nowInactive !== nowActive) {
        try { nowInactive.pause(); } catch (_) {}
        try { nowInactive.hidden = true; } catch (_) {}
        clearStageVideoInlineStyles(nowInactive);
      }
      montageStageMachine.state = "idle";
      montageStageMachine.loadingSrc = "";
      montageStageMachine.loadingEl = null;
      montageStageMachine.lastCommitAt = Date.now();
    };

    // If already on desired src, keep it synced and playing (muted-first).
    if (activeSrc === cleanSrc) {
      try { activeEl.playbackRate = montageStageMachine.desiredSpeed; } catch (_) {}
      try { activeEl.currentTime = resolveSafeOffsetSec(activeEl, montageStageMachine.desiredOffsetSec); } catch (_) {}
      if (shouldAutoplay && !scrubMuteVideo) {
        const key = `${cleanSrc}:${resolveStageVideoSlotForEl(activeEl)}`;
        const now = Date.now();
        const canAttempt = activeEl.paused && (now - montageStageMachine.lastPlayAttemptAt > 250 || montageStageMachine.lastPlayAttemptKey !== key);
        if (canAttempt) {
          montageStageMachine.lastPlayAttemptAt = now;
          montageStageMachine.lastPlayAttemptKey = key;
          tryPlayStageVideoMuted(activeEl, { rowId, src: cleanSrc, slot: resolveStageVideoSlotForEl(activeEl), phase: "steady-play" });
        }
        const wantsAudio = montageStageMachine.allowUnmute && montageStageMachine.desiredVeoVolume > 0;
        if (wantsAudio) {
          armStageVideoUnmuteAfterPlaying(activeEl, {
            desiredVolume: montageStageMachine.desiredVeoVolume,
            isStale,
            timeoutMs: 900
          });
        }
      } else if (!activeEl.paused) {
        try { activeEl.pause(); } catch (_) {}
      }
      return;
    }

    // If inactive already has desired src ready, commit immediately.
    if (inactiveEl && inactiveSrc === cleanSrc && inactiveReady) {
      try { inactiveEl.currentTime = desiredSafeOffset; } catch (_) {}
      commitTo(inactiveEl);
      return;
    }

    // Start loading desired src into inactive slot (preferred) or active if no inactive.
    const loadTarget = inactiveEl || activeEl;
    if (!loadTarget) return;
    const loadingSeq = ++montageStageMachine.loadingSeq;
    montageStageMachine.state = "loading";
    montageStageMachine.loadingSrc = cleanSrc;
    montageStageMachine.loadingEl = loadTarget;
    Promise.resolve()
      .then(() => setPodcastStageVideoSourceForElement(loadTarget, cleanSrc))
      .then((ok) => {
        if (isStale()) return;
        if (montageStageMachine.loadingSeq !== loadingSeq) return;
        if (montageStageMachine.loadingEl !== loadTarget) return;
        if (montageStageMachine.loadingSrc !== cleanSrc) return;
        if (!ok) {
          montageStageMachine.state = "idle";
          return;
        }
        // Commit on next tick (non-blocking).
        queueMicrotask(() => {
          if (isStale()) return;
          if (String(loadTarget.dataset?.src || "").trim() !== cleanSrc) return;
          commitTo(loadTarget);
        });
      })
      .catch((error) => {
        if (isStale()) return;
        if (montageStageMachine.loadingSeq !== loadingSeq) return;
        logMontageDebug("stage-load-error", {
          rowId: String(rowId || "").trim(),
          src: cleanSrc.slice(0, 160),
          name: String(error?.name || ""),
          message: String(error?.message || "").slice(0, 160)
        });
        montageStageMachine.state = "idle";
      });
  }

  function waitForStageVideoReady(videoEl, timeoutMs = 900) {
    const video = videoEl || null;
    if (!video) return Promise.resolve(false);
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return Promise.resolve(true);
    return new Promise((resolve) => {
      let settled = false;
      const done = (ok = false) => {
        if (settled) return;
        settled = true;
        try { video.removeEventListener("loadeddata", onReady); } catch (_) {}
        try { video.removeEventListener("canplay", onReady); } catch (_) {}
        try { video.removeEventListener("error", onError); } catch (_) {}
        resolve(ok);
      };
      const onReady = () => done(true);
      const onError = () => done(false);
      try { video.addEventListener("loadeddata", onReady, { once: true }); } catch (_) {}
      try { video.addEventListener("canplay", onReady, { once: true }); } catch (_) {}
      try { video.addEventListener("error", onError, { once: true }); } catch (_) {}
      setTimeout(() => done(video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA), Math.max(120, Number(timeoutMs || 0) || 900));
    });
  }

  function waitForStageVideoSeek(videoEl, timeoutMs = 520) {
    const video = videoEl || null;
    if (!video) return Promise.resolve(false);
    if (!video.seeking) return Promise.resolve(true);
    return new Promise((resolve) => {
      let settled = false;
      const done = (ok = false) => {
        if (settled) return;
        settled = true;
        try { video.removeEventListener("seeked", onSeeked); } catch (_) {}
        resolve(ok);
      };
      const onSeeked = () => done(true);
      try { video.addEventListener("seeked", onSeeked, { once: true }); } catch (_) {}
      setTimeout(() => done(!video.seeking), Math.max(120, Number(timeoutMs || 0) || 520));
    });
  }

  function waitForStageVideoFrame(videoEl, timeoutMs = 320) {
    const video = videoEl || null;
    if (!video) return Promise.resolve(false);
    if (typeof video.requestVideoFrameCallback !== "function") return Promise.resolve(false);
    return new Promise((resolve) => {
      let settled = false;
      let cbId = 0;
      const done = (ok = false) => {
        if (settled) return;
        settled = true;
        if (cbId) {
          try { video.cancelVideoFrameCallback(cbId); } catch (_) {}
        }
        resolve(ok);
      };
      try {
        cbId = video.requestVideoFrameCallback(() => done(true));
      } catch (_) {
        done(false);
        return;
      }
      setTimeout(() => done(false), Math.max(120, Number(timeoutMs || 0) || 320));
    });
  }

  function findAdjacentNextVisualEntry(entries = [], current = null) {
    const list = Array.isArray(entries) ? entries : [];
    const base = current || null;
    const trackId = String(base?.clip?.trackId || "").trim();
    if (!trackId) return null;
    const endMs = Number(base?.endMs || 0);
    if (!Number.isFinite(endMs) || endMs <= 0) return null;
    const tolerance = Math.max(2, Math.min(12, Number(STUDIO_TIMELINE_SNAP_MS || 0) || 6));
    let best = null;
    let bestDelta = Number.POSITIVE_INFINITY;
    list.forEach((entry) => {
      if (!entry || !String(entry?.videoSrc || "").trim()) return;
      if (String(entry?.clip?.trackId || "").trim() !== trackId) return;
      const startMs = Number(entry?.startMs || 0);
      const delta = Math.abs(startMs - endMs);
      if (delta > tolerance) return;
      if (delta < bestDelta) {
        best = entry;
        bestDelta = delta;
      }
    });
    return best;
  }

  function findNextVisualEntryByTime(entries = [], current = null) {
    const list = Array.isArray(entries) ? entries : [];
    const base = current || null;
    const anchorEndMs = Number(base?.endMs || 0);
    const anchorStartMs = Number(base?.startMs || 0);
    const anchorMs = Number.isFinite(anchorEndMs) && anchorEndMs > 0
      ? anchorEndMs
      : Number.isFinite(anchorStartMs) && anchorStartMs >= 0
        ? anchorStartMs
        : 0;
    let best = null;
    let bestStart = Number.POSITIVE_INFINITY;
    list.forEach((entry) => {
      if (!entry || !String(entry?.videoSrc || "").trim()) return;
      const startMs = Number(entry?.startMs || 0);
      if (!Number.isFinite(startMs)) return;
      if (startMs < anchorMs - 1) return;
      if (startMs < bestStart) {
        best = entry;
        bestStart = startMs;
      }
    });
    return best;
  }

  function resolveNextUpcomingVisualEntry(entries = [], current = null) {
    return findAdjacentNextVisualEntry(entries, current) || findNextVisualEntryByTime(entries, current);
  }

  function disconnectMontageBackgroundChain() {
    if (montageBackgroundSource) {
      try { montageBackgroundSource.disconnect(); } catch (_) {}
    }
    if (montageBackgroundCompressor) {
      try { montageBackgroundCompressor.disconnect(); } catch (_) {}
    }
    if (montageBackgroundGain) {
      try { montageBackgroundGain.disconnect(); } catch (_) {}
    }
    montageBackgroundSource = null;
    montageBackgroundCompressor = null;
    montageBackgroundGain = null;
  }

  function disconnectMontageBackgroundSynth() {
    montageBackgroundOscillators.forEach((node) => {
      try {
        if (typeof node?.stop === "function") node.stop();
      } catch (_) {}
      try {
        if (typeof node?.disconnect === "function") node.disconnect();
      } catch (_) {}
    });
    montageBackgroundOscillators = [];
    if (montageBackgroundFilter) {
      try { montageBackgroundFilter.disconnect(); } catch (_) {}
    }
    if (montageBackgroundLfo) {
      try { montageBackgroundLfo.stop(); } catch (_) {}
      try { montageBackgroundLfo.disconnect(); } catch (_) {}
    }
    if (montageBackgroundLfoGain) {
      try { montageBackgroundLfoGain.disconnect(); } catch (_) {}
    }
    montageBackgroundFilter = null;
    montageBackgroundLfo = null;
    montageBackgroundLfoGain = null;
    montageBackgroundPreset = "";
  }

  function stopMontageBackgroundMusic() {
    if (montageBackgroundAudio) {
      try { montageBackgroundAudio.pause(); } catch (_) {}
    }
    montageBackgroundAudio = null;
    montageBackgroundSrc = "";
    montageBackgroundLoopTrimInSec = 0;
    montageBackgroundLoopTrimOutSec = 0;
    setMontageBackgroundDuckFactor(1);
    disconnectMontageBackgroundChain();
    disconnectMontageBackgroundSynth();
  }

  function applyMontageBackgroundDynamics(stabilize = false) {
    if (!montageBackgroundCompressor) return;
    if (stabilize) {
      montageBackgroundCompressor.threshold.value = -24;
      montageBackgroundCompressor.knee.value = 16;
      montageBackgroundCompressor.ratio.value = 8;
      montageBackgroundCompressor.attack.value = 0.005;
      montageBackgroundCompressor.release.value = 0.22;
      return;
    }
    montageBackgroundCompressor.threshold.value = 0;
    montageBackgroundCompressor.knee.value = 0;
    montageBackgroundCompressor.ratio.value = 1;
    montageBackgroundCompressor.attack.value = 0;
    montageBackgroundCompressor.release.value = 0.06;
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
  }

  function getConfiguredMontageBackgroundDuckFactor() {
    const panelCfg = typeof getPanelMontageMusicConfig === "function"
      ? getPanelMontageMusicConfig()
      : null;
    const duckingPct = Math.max(0, Math.min(40, Number(panelCfg?.duckingWhenGeminiPct ?? 40) || 0));
    return clamp01(1 - (duckingPct / 100));
  }

  function setMontageBackgroundDuckFactor(value = 1) {
    montageBackgroundDuckFactor = Math.max(0.18, Math.min(1, Number(value) || 1));
  }

  function getMontageBackgroundLoopEnvelope(positionSec = 0, audioDurationSec = 0) {
    const durationSec = Math.max(0, Number(audioDurationSec || 0));
    if (!durationSec) return 1;
    const fadeSec = Math.min(durationSec / 3, MONTAGE_BACKGROUND_FADE_MS / 1000);
    if (fadeSec <= 0.001) return 1;
    const safePosition = Math.max(0, Math.min(durationSec, Number(positionSec || 0)));
    const fadeIn = clamp01(safePosition / fadeSec);
    const fadeOut = clamp01((durationSec - safePosition) / fadeSec);
    return Math.max(0.08, Math.min(fadeIn, fadeOut));
  }

  function applyMontageBackgroundVolume(targetVolume = 0, envelope = 1) {
    const finalVolume = clamp01(targetVolume) * clamp01(envelope) * clamp01(montageBackgroundDuckFactor);
    if (montageBackgroundGain) {
      const now = montageBackgroundCtx?.currentTime || 0;
      try {
        montageBackgroundGain.gain.cancelScheduledValues(now);
        montageBackgroundGain.gain.setValueAtTime(Number(montageBackgroundGain.gain.value || 0), now);
        montageBackgroundGain.gain.linearRampToValueAtTime(finalVolume, now + 0.08);
        return;
      } catch (_) {
        try {
          montageBackgroundGain.gain.value = finalVolume;
          return;
        } catch (_) {}
      }
    }
    if (montageBackgroundAudio) {
      montageBackgroundAudio.volume = finalVolume;
    }
  }

  function applyMontageBackgroundLoopWindow(trimInSec = 0, trimOutSec = 0) {
    montageBackgroundLoopTrimInSec = Math.max(0, Number(trimInSec || 0) || 0);
    montageBackgroundLoopTrimOutSec = Math.max(montageBackgroundLoopTrimInSec, Number(trimOutSec || 0) || 0);
  }

  function resolveMontageBackgroundLoopState(relativeSec = 0, panelCfg = null) {
    const configuredDurationSec = Math.max(0, Number(panelCfg?.durationSec || 0) || 0);
    const defaultTrimInSec = Math.max(0, Number(panelCfg?.trimInMs || 0) || 0) / 1000;
    const rawTrimOutSec = Math.max(0, Number(panelCfg?.trimOutMs || 0) || 0) / 1000;
    const loopSettings = Array.isArray(panelCfg?.loopSettings) ? panelCfg.loopSettings : [];
    const safeDurationSec = Math.max(0.05, configuredDurationSec || rawTrimOutSec || defaultTrimInSec || 0.05);
    const defaultTrimOutSec = rawTrimOutSec > defaultTrimInSec ? Math.min(safeDurationSec, rawTrimOutSec) : safeDurationSec;
    let consumedSec = 0;
    let loopIndex = 0;
    while (loopIndex < 240) {
      const override = loopSettings.find((item) => Math.max(0, Math.floor(Number(item?.loopIndex || 0) || 0)) === loopIndex) || null;
      const trimInSec = Math.max(0, Number(override?.trimInMs || panelCfg?.trimInMs || 0) || 0) / 1000;
      const overrideTrimOutSec = Math.max(0, Number(override?.trimOutMs || panelCfg?.trimOutMs || 0) || 0) / 1000;
      const trimOutSec = overrideTrimOutSec > trimInSec ? Math.min(safeDurationSec, overrideTrimOutSec) : defaultTrimOutSec;
      const effectiveLoopSec = Math.max(0.05, trimOutSec - trimInSec);
      if (relativeSec < consumedSec + effectiveLoopSec || loopIndex >= loopSettings.length + 8) {
        return {
          loopIndex,
          trimInSec,
          trimOutSec,
          effectiveLoopSec,
          positionSec: Math.max(0, relativeSec - consumedSec)
        };
      }
      consumedSec += effectiveLoopSec;
      loopIndex += 1;
    }
    return {
      loopIndex: 0,
      trimInSec: defaultTrimInSec,
      trimOutSec: defaultTrimOutSec,
      effectiveLoopSec: Math.max(0.05, defaultTrimOutSec - defaultTrimInSec),
      positionSec: 0
    };
  }

  function attachMontageBackgroundLoopListeners(audio) {
    if (!audio || audio.__podcasterLoopBindingsAttached) return;
    const wrapToLoopStart = () => {
      logMontageDebug("background-wrap", {
        currentTime: Number(audio.currentTime || 0),
        trimInSec: montageBackgroundLoopTrimInSec,
        trimOutSec: montageBackgroundLoopTrimOutSec,
        src: montageBackgroundSrc
      });
      try {
        audio.currentTime = montageBackgroundLoopTrimInSec;
        audio.play().catch(() => {});
      } catch (_) {}
    };
    audio.addEventListener("ended", wrapToLoopStart);
    audio.addEventListener("timeupdate", () => {
      const trimOutSec = Math.max(montageBackgroundLoopTrimInSec, Number(montageBackgroundLoopTrimOutSec || 0) || 0);
      if (trimOutSec <= montageBackgroundLoopTrimInSec + 0.04) return;
      if (Number(audio.currentTime || 0) >= trimOutSec - 0.02) {
        wrapToLoopStart();
      }
    });
    audio.__podcasterLoopBindingsAttached = true;
  }

  async function syncMontageBackgroundMusic(currentMs = 0, speed = 1) {
    const panelCfg = typeof getPanelMontageMusicConfig === "function"
      ? getPanelMontageMusicConfig()
      : null;
    const sourceTypeRaw = String(panelCfg?.sourceType || "").trim().toLowerCase();
    const sourceType = sourceTypeRaw === "track" ? "track" : "none";
    const sourceItems = Array.isArray(panelCfg?.sourceItems) ? panelCfg.sourceItems : [];
    const preset = ["ambient", "focus", "pulse"].includes(String(panelCfg?.preset || "").trim())
      ? String(panelCfg.preset).trim()
      : "ambient";
    const src = String(panelCfg?.sourceUrl || "").trim();
    if (sourceType !== "track" || (!src && !sourceItems.length)) {
      stopMontageBackgroundMusic();
      return;
    }
	    const session = getActiveSession();
	    const studioCfg = getPodcastVideoConfig(session);
	    const panelVolumePct = Math.max(0, Math.min(200, toFiniteNumber(panelCfg?.volume, 0)));
	    const panelVolume = resolveSceneBackgroundMusicVolumePctAtMs(currentMs, panelVolumePct, mseRuntimeEntries);
	    const duckFactor = clamp01(montageBackgroundDuckFactor);
	    // El volumen del track de audio (MP3/locked lane) se controla desde `audioTrackMixModal`
	    // (`audioTrackMontageVolume`). No lo escalamos por `masterVolume` (Gemini/voz) para que
	    // al bajar Gemini a 0 no silencie el track de audio del montaje.
	    const targetVolume = panelVolume;
    const stabilize = panelCfg?.stabilize === true;
    const configuredDurationSec = Math.max(0, Number(panelCfg?.durationSec || 0) || 0);
    const startOffsetSec = Math.max(0, Number(panelCfg?.startOffsetMs || 0) || 0) / 1000;
    const trimInSec = Math.max(0, Number(panelCfg?.trimInMs || 0) || 0) / 1000;
    const rawTrimOutSec = Math.max(0, Number(panelCfg?.trimOutMs || 0) || 0) / 1000;
    const mutedLoopIndexes = new Set(Array.isArray(panelCfg?.mutedLoopIndexes) ? panelCfg.mutedLoopIndexes : []);
    applyMontageBackgroundLoopWindow(trimInSec, rawTrimOutSec);
    logMontageDebug("background-sync-input", {
      currentMs: Number(currentMs || 0),
      sourceType,
      sourceItems: sourceItems.map((item) => ({
        slotLabel: item?.slotLabel,
        startOffsetMs: item?.startOffsetMs,
        endOffsetMs: item?.endOffsetMs,
        loop: item?.loop === true
      })),
      preset,
      src,
      configuredDurationSec,
      startOffsetSec,
      trimInSec,
      trimOutSec: rawTrimOutSec,
      mutedLoopIndexes: Array.from(mutedLoopIndexes)
    });

	    if (sourceType === "track" && sourceItems.length) {
	      const currentSec = Math.max(0, Number(currentMs || 0) / 1000);
	      const activeItem = sourceItems.find((item) => (
	        currentSec >= (Math.max(0, Number(item?.startOffsetMs || 0) || 0) / 1000)
	        && currentSec < (Math.max(0, Number(item?.endOffsetMs || 0) || 0) / 1000)
	      )) || null;
	      if (!activeItem) {
	        stopMontageBackgroundMusic();
	        return;
	      }
      const itemSrc = String(activeItem?.sourceUrl || "").trim();
      if (!itemSrc) {
        stopMontageBackgroundMusic();
        return;
      }
      const itemStartSec = Math.max(0, Number(activeItem?.startOffsetMs || 0) || 0) / 1000;
      const itemDurationSec = Math.max(0.05, Number(activeItem?.durationSec || 0) || 0.05);
      const itemTrimInSec = Math.max(0, Number(activeItem?.trimInMs || 0) || 0) / 1000;
      const rawItemTrimOutSec = Math.max(0, Number(activeItem?.trimOutMs || 0) || 0) / 1000;
      const itemTrimOutSec = rawItemTrimOutSec > itemTrimInSec ? rawItemTrimOutSec : itemDurationSec;
      const itemEffectiveLoopSec = Math.max(0.05, itemTrimOutSec - itemTrimInSec);
      const itemRelativeSec = Math.max(0, currentSec - itemStartSec);
      const itemLoopPositionSec = activeItem?.loop === true
        ? (itemRelativeSec % itemEffectiveLoopSec)
        : Math.min(itemEffectiveLoopSec, itemRelativeSec);
      const itemCurrentTime = itemTrimInSec + itemLoopPositionSec;
      applyMontageBackgroundLoopWindow(itemTrimInSec, itemTrimOutSec);
      if (!montageBackgroundAudio || montageBackgroundSrc !== itemSrc) {
        if (montageBackgroundAudio) {
          try { montageBackgroundAudio.pause(); } catch (_) {}
        }
        disconnectMontageBackgroundChain();
        montageBackgroundAudio = new Audio(itemSrc);
        montageBackgroundAudio.crossOrigin = "anonymous";
        montageBackgroundAudio.loop = false;
        montageBackgroundAudio.preload = "auto";
        attachMontageBackgroundLoopListeners(montageBackgroundAudio);
        montageBackgroundSrc = itemSrc;
      }
	      montageBackgroundAudio.playbackRate = speed;
	      const drift = Math.abs(Number(montageBackgroundAudio.currentTime || 0) - itemCurrentTime);
	      if (drift > 0.35) {
	        try { montageBackgroundAudio.currentTime = itemCurrentTime; } catch (_) {}
	      }
	      const envelope = getMontageBackgroundLoopEnvelope(itemLoopPositionSec, itemEffectiveLoopSec);
	      const isMutedItem = activeItem?.muted === true;
	      const finalVolume = isMutedItem ? 0 : (clamp01(targetVolume) * envelope * duckFactor);
	      if (!montageBackgroundCtx) {
	        montageBackgroundAudio.volume = finalVolume;
	        if (isMutedItem) {
	          try { montageBackgroundAudio.pause(); } catch (_) {}
	          return;
	        }
	        if (montageBackgroundAudio.paused) {
	          montageBackgroundAudio.play().catch(() => {});
	        }
	        return;
	      }
	      if (montageBackgroundCtx.state === "suspended") {
	        await montageBackgroundCtx.resume().catch(() => {});
	      }
      if (!montageBackgroundGain || !montageBackgroundCompressor || !montageBackgroundSource) {
        disconnectMontageBackgroundChain();
        try {
          montageBackgroundSource = montageBackgroundCtx.createMediaElementSource(montageBackgroundAudio);
          montageBackgroundCompressor = montageBackgroundCtx.createDynamicsCompressor();
          montageBackgroundGain = montageBackgroundCtx.createGain();
          montageBackgroundSource.connect(montageBackgroundCompressor);
          montageBackgroundCompressor.connect(montageBackgroundGain);
          montageBackgroundGain.connect(montageBackgroundCtx.destination);
        } catch (_) {
          montageBackgroundAudio.volume = finalVolume;
          if (montageBackgroundAudio.paused) {
            montageBackgroundAudio.play().catch(() => {});
          }
          return;
        }
	      }
	      applyMontageBackgroundDynamics(stabilize);
	      applyMontageBackgroundVolume(isMutedItem ? 0 : targetVolume, envelope);
	      if (isMutedItem) {
	        try { montageBackgroundAudio.pause(); } catch (_) {}
	        return;
	      }
	      if (montageBackgroundAudio.paused) {
	        montageBackgroundAudio.play().catch(() => {});
	      }
	      return;
	    }

    if (!montageBackgroundCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        if (sourceType !== "track") return;
        if (!montageBackgroundAudio || montageBackgroundSrc !== src) {
          montageBackgroundAudio = new Audio(src);
          montageBackgroundAudio.crossOrigin = "anonymous";
          montageBackgroundAudio.loop = true;
          montageBackgroundAudio.preload = "auto";
          attachMontageBackgroundLoopListeners(montageBackgroundAudio);
          montageBackgroundSrc = src;
        }
        montageBackgroundAudio.playbackRate = speed;
        const relativeSec = Math.max(0, (Number(currentMs || 0) / 1000) - startOffsetSec);
        const shouldPlay = relativeSec >= 0 && Number(currentMs || 0) / 1000 >= startOffsetSec;
        if (!shouldPlay) {
          montageBackgroundAudio.volume = 0;
          try { montageBackgroundAudio.pause(); } catch (_) {}
          return;
        }
        const loopState = resolveMontageBackgroundLoopState(relativeSec, panelCfg);
        const loopOffset = loopState.trimInSec + loopState.positionSec;
        const envelope = getMontageBackgroundLoopEnvelope(loopState.positionSec, loopState.effectiveLoopSec);
        const loopIndex = loopState.loopIndex;
        applyMontageBackgroundLoopWindow(loopState.trimInSec, loopState.trimOutSec);
        const effectiveVolume = mutedLoopIndexes.has(loopIndex) ? 0 : clamp01(targetVolume) * envelope * duckFactor;
        const audioDuration = Math.max(0, Number(montageBackgroundAudio.duration || configuredDurationSec || 0));
        if (audioDuration > 0 && Math.abs(Number(montageBackgroundAudio.currentTime || 0) - loopOffset) > 0.5) {
          try { montageBackgroundAudio.currentTime = loopOffset; } catch (_) {}
        }
        montageBackgroundAudio.volume = effectiveVolume;
        if (montageBackgroundAudio.paused) {
          montageBackgroundAudio.play().catch(() => {});
        }
        return;
      }
      montageBackgroundCtx = new AudioCtx();
    }
    if (montageBackgroundCtx.state === "suspended") {
      await montageBackgroundCtx.resume().catch(() => {});
    }
    if (sourceType !== "track") {
      if (montageBackgroundAudio) {
        try { montageBackgroundAudio.pause(); } catch (_) {}
      }
      montageBackgroundAudio = null;
      montageBackgroundSrc = "";
      disconnectMontageBackgroundChain();
      if (!montageBackgroundGain || !montageBackgroundCompressor || montageBackgroundPreset !== preset) {
        disconnectMontageBackgroundSynth();
        try {
          montageBackgroundCompressor = montageBackgroundCtx.createDynamicsCompressor();
          montageBackgroundGain = montageBackgroundCtx.createGain();
          montageBackgroundFilter = montageBackgroundCtx.createBiquadFilter();
          montageBackgroundFilter.type = "lowpass";
          montageBackgroundFilter.frequency.value = preset === "pulse" ? 1200 : 900;
          montageBackgroundFilter.Q.value = 0.9;
          montageBackgroundFilter.connect(montageBackgroundCompressor);
          montageBackgroundCompressor.connect(montageBackgroundGain);
          montageBackgroundGain.connect(montageBackgroundCtx.destination);
          const pushOsc = (type, freq, gainValue, detune = 0) => {
            const osc = montageBackgroundCtx.createOscillator();
            const gain = montageBackgroundCtx.createGain();
            osc.type = type;
            osc.frequency.value = freq;
            osc.detune.value = detune;
            gain.gain.value = gainValue;
            osc.connect(gain);
            gain.connect(montageBackgroundFilter);
            osc.start();
            montageBackgroundOscillators.push(osc, gain);
          };
          if (preset === "focus") {
            pushOsc("triangle", 180, 0.21);
            pushOsc("sine", 270, 0.13, 4);
          } else if (preset === "pulse") {
            pushOsc("sawtooth", 92, 0.14);
            pushOsc("square", 184, 0.08, -3);
          } else {
            pushOsc("sine", 146.83, 0.18);
            pushOsc("sine", 220, 0.11, 6);
          }
          montageBackgroundLfo = montageBackgroundCtx.createOscillator();
          montageBackgroundLfoGain = montageBackgroundCtx.createGain();
          montageBackgroundLfo.type = "sine";
          montageBackgroundLfo.frequency.value = preset === "pulse" ? 0.22 : 0.08;
          montageBackgroundLfoGain.gain.value = preset === "pulse" ? 0.04 : 0.02;
          montageBackgroundLfo.connect(montageBackgroundLfoGain);
          montageBackgroundLfoGain.connect(montageBackgroundGain.gain);
          montageBackgroundLfo.start();
          montageBackgroundPreset = preset;
        } catch (_) {
          disconnectMontageBackgroundSynth();
          disconnectMontageBackgroundChain();
          return;
        }
      }
      applyMontageBackgroundDynamics(stabilize);
      applyMontageBackgroundVolume(targetVolume * 0.22, 1);
      return;
    }
    disconnectMontageBackgroundSynth();
    if (!montageBackgroundAudio || montageBackgroundSrc !== src) {
      if (montageBackgroundAudio) {
        try { montageBackgroundAudio.pause(); } catch (_) {}
      }
      disconnectMontageBackgroundChain();
      montageBackgroundAudio = new Audio(src);
      montageBackgroundAudio.crossOrigin = "anonymous";
      montageBackgroundAudio.loop = true;
      montageBackgroundAudio.preload = "auto";
      attachMontageBackgroundLoopListeners(montageBackgroundAudio);
      montageBackgroundSrc = src;
    }
    montageBackgroundAudio.playbackRate = speed;
    if (!montageBackgroundGain || !montageBackgroundCompressor || !montageBackgroundSource) {
      disconnectMontageBackgroundChain();
      try {
        montageBackgroundSource = montageBackgroundCtx.createMediaElementSource(montageBackgroundAudio);
        montageBackgroundCompressor = montageBackgroundCtx.createDynamicsCompressor();
        montageBackgroundGain = montageBackgroundCtx.createGain();
        montageBackgroundSource.connect(montageBackgroundCompressor);
        montageBackgroundCompressor.connect(montageBackgroundGain);
        montageBackgroundGain.connect(montageBackgroundCtx.destination);
      } catch (_) {
        montageBackgroundAudio.volume = clamp01(targetVolume) * duckFactor;
        if (montageBackgroundAudio.paused) {
          montageBackgroundAudio.play().catch(() => {});
        }
        return;
      }
    }
    applyMontageBackgroundDynamics(stabilize);
    const currentSec = Math.max(0, Number(currentMs || 0) / 1000);
    const relativeSec = Math.max(0, currentSec - startOffsetSec);
    const shouldPlay = currentSec >= startOffsetSec;
    if (!shouldPlay) {
      applyMontageBackgroundVolume(0, 0);
      if (!montageBackgroundAudio.paused) {
        try { montageBackgroundAudio.pause(); } catch (_) {}
      }
      return;
    }
    const loopState = resolveMontageBackgroundLoopState(relativeSec, panelCfg);
    const loopOffset = loopState.trimInSec + loopState.positionSec;
    const loopIndex = loopState.loopIndex;
    applyMontageBackgroundLoopWindow(loopState.trimInSec, loopState.trimOutSec);
    const drift = Math.abs(Number(montageBackgroundAudio.currentTime || 0) - loopOffset);
    if (drift > 0.5) {
      try { montageBackgroundAudio.currentTime = loopOffset; } catch (_) {}
    }
    if (montageBackgroundAudio.ended || Number(montageBackgroundAudio.currentTime || 0) >= Math.max(loopState.trimInSec, loopState.trimOutSec) - 0.05) {
      try { montageBackgroundAudio.currentTime = loopOffset; } catch (_) {}
    }
    const envelope = getMontageBackgroundLoopEnvelope(loopState.positionSec, loopState.effectiveLoopSec);
    applyMontageBackgroundVolume(mutedLoopIndexes.has(loopIndex) ? 0 : targetVolume, envelope);
    if (montageBackgroundAudio.paused) {
      montageBackgroundAudio.play().catch(() => {});
    }
  }

  function stopPodcastStudioMontage(options = {}) {
    previewSyncRequestToken += 1;
    resetPendingStageWork();
    if (podcastVideoState.mseEngineActive === true) {
      podcastVideoState.mseEngineActive = false;
      mseLastRuntimeRowId = "";
      try { mseEngine?.destroy?.(); } catch (_) {}
      mseEngine = null;
    }
    try { setTimelinePreviewsSuspended?.(false); } catch (_) {}
    const keepStatus = options.keepStatus === true;
    const keepPaused = options.keepPaused === true;
    const keepCursor = options.keepCursor === true;
    const forceResetToStart = options.forceResetToStart !== false;
    podcastVideoState.montageActive = false;
    podcastVideoState.montagePaused = keepPaused;
    podcastVideoState.montageToken = 0;
    podcastVideoState.montageLastVisualRowId = "";
    podcastVideoState.montageStageMode = "";
    podcastVideoState.montageStageDoubleBuffer = false;
    if (!keepCursor && forceResetToStart) {
      podcastVideoState.timelineLastInteractedRowId = "";
    }
    if (podcastVideoState.montageRafId) {
      cancelAnimationFrame(podcastVideoState.montageRafId);
      podcastVideoState.montageRafId = 0;
    }
    Object.values(podcastVideoState.montageAudioPlayers || {}).forEach((audio) => {
      try { audio.pause(); } catch (_) {}
    });
    podcastVideoState.montageAudioPlayers = {};
    Object.values(montageAudioCache || {}).forEach((audio) => {
      try { audio.pause(); } catch (_) {}
    });
    montageAudioCache = {};
    stopMontageBackgroundMusic();
    if (podcastVideoState.audioEl) {
      try { podcastVideoState.audioEl.pause(); } catch (_) {}
      podcastVideoState.audioEl.src = "";
    }
    podcastVideoState.audioEl = null;
    getAllStageVideoElements().forEach((video) => {
      try { video.pause(); } catch (_) {}
      if (!keepCursor && forceResetToStart) {
        try { video.currentTime = 0; } catch (_) {}
      }
    });
    if (!keepCursor && forceResetToStart) {
      podcastVideoState.montageCursorMs = 0;
    }
    if (els.podcastStudioScrubber) {
      if (!keepCursor && forceResetToStart) {
        els.podcastStudioScrubber.value = "0";
      }
    }
    syncPodcastTimelinePlayhead(getActiveSession());
    if (els.podcastStudioTime) {
      const totalSec = Math.max(0, Number(podcastVideoState.timelineDurationSec || 0));
      const currentSec = Math.max(0, Number(podcastVideoState.montageCursorMs || 0) / 1000);
      els.podcastStudioTime.textContent = `${secondsToClock(currentSec)} / ${secondsToClock(totalSec)}`;
    }
    if (!keepStatus) {
      setPodcastVideoStatus("Studio detenido");
    }
    if (!keepCursor && forceResetToStart) {
      const session = getActiveSession();
      const firstRow = session?.script?.rows?.[0] || null;
      const firstRowId = String(firstRow?.id || "").trim();
      if (firstRowId) {
        syncPodcastStudioRuntimeUi(session, firstRowId, String(firstRow?.speaker || "").trim(), { speaking: false });
        syncPodcastVideoStageMedia(session, firstRowId);
      }
      if (podcastVideoState.speaking) {
        setPodcastVideoSpeaker(getActiveSession(), podcastVideoState.activeSpeaker || "", {
          speaking: false,
          rowId: String(podcastVideoState.activeRowId || "").trim(),
          syncStageMedia: false
        });
      }
    }
    updatePodcastVideoTransportUi();
  }

  function pauseAllMontageMedia() {
    stageVideoUnmuteToken += 1;
    if (podcastVideoState.montageRafId) {
      cancelAnimationFrame(podcastVideoState.montageRafId);
      podcastVideoState.montageRafId = 0;
    }
    Object.values(podcastVideoState.montageAudioPlayers || {}).forEach((audio) => {
      try { audio.pause(); } catch (_) {}
    });
    Object.values(montageAudioCache || {}).forEach((audio) => {
      try { audio.pause(); } catch (_) {}
    });
    stopPreviewSceneAudio();
    if (montageBackgroundAudio) {
      try { montageBackgroundAudio.pause(); } catch (_) {}
    }
    if (podcastVideoState.audioEl) {
      try { podcastVideoState.audioEl.pause(); } catch (_) {}
    }
    getAllStageVideoElements().forEach((video) => {
      try { video.pause(); } catch (_) {}
    });
  }

  function pausePodcastStudioMontage() {
    if (!podcastVideoState.montageActive) return;
    previewSyncRequestToken += 1;
    resetPendingStageWork();
    if (podcastVideoState.mseEngineActive === true) {
      try { mseEngine?.pause?.(); } catch (_) {}
    }
    try { setTimelinePreviewsSuspended?.(false); } catch (_) {}
    podcastVideoState.montageActive = false;
    podcastVideoState.montagePaused = true;
    pauseAllMontageMedia();
    // Mantén visible el video activo (evita quedarnos con opacity=0 tras un swap pendiente).
    try { ensureActiveStageVideoVisible(resolveStageVideoEl(true)); } catch (_) {}
    setPodcastVideoStatus("Montaje en pausa");
    updatePodcastVideoTransportUi();
  }

  function primeMontageAudioEntries(runtimeEntries = [], currentMs = 0) {
    const preloadWindowMs = 2400;
    const keepIds = new Set();
    runtimeEntries.forEach((entry) => {
      const rowId = String(entry?.rowId || "").trim();
      const src = String(entry?.audioSrc || "").trim();
      if (!rowId || !src) return;
      const deltaMs = Number(entry?.startMs || 0) - Number(currentMs || 0);
      if (deltaMs < -200 || deltaMs > preloadWindowMs) return;
      keepIds.add(rowId);
      if (montageAudioCache[rowId]) return;
      const audio = new Audio(typeof resolvePodcastStageAudioSrc === "function" ? resolvePodcastStageAudioSrc(src) : src);
      audio.preload = "auto";
      if (!audio.__podcasterDurationBound) {
        audio.addEventListener("loadedmetadata", () => {
          const durSec = Number(audio.duration || 0);
          if (!Number.isFinite(durSec) || durSec <= 0) return;
          const durMs = Math.round(Math.max(0, durSec * 1000));
          if (!podcastVideoState.montageAudioActualDurationsMs || typeof podcastVideoState.montageAudioActualDurationsMs !== "object") {
            podcastVideoState.montageAudioActualDurationsMs = {};
          }
          const prev = Math.max(0, Number(podcastVideoState.montageAudioActualDurationsMs[rowId] || 0) || 0);
          if (durMs <= prev + 20) return;
          podcastVideoState.montageAudioActualDurationsMs[rowId] = durMs;
          if (typeof syncGeminiDialogueTrackWithRuntime === "function") {
            try { syncGeminiDialogueTrackWithRuntime({ render: true, preserveStartMs: true }); } catch (_) {}
          }
        }, { once: true });
        audio.__podcasterDurationBound = true;
      }
      try { audio.load(); } catch (_) {}
      montageAudioCache[rowId] = audio;
    });
    Object.keys(montageAudioCache).forEach((rowId) => {
      if (keepIds.has(rowId) || podcastVideoState.montageAudioPlayers?.[rowId]) return;
      const audio = montageAudioCache[rowId];
      try { audio.pause(); } catch (_) {}
      delete montageAudioCache[rowId];
    });
  }

  function buildMontageVoiceTimelineEntries(cfg = {}, runtimeEntries = []) {
    const runtimeByRowId = new Map(
      Array.isArray(runtimeEntries)
        ? runtimeEntries.map((entry) => [String(entry?.rowId || "").trim(), entry]).filter(([rowId]) => rowId)
        : []
    );
    const track = cfg?.geminiDialogueTrack && typeof cfg.geminiDialogueTrack === "object" ? cfg.geminiDialogueTrack : null;
    const segments = Array.isArray(track?.segments) ? track.segments : [];
    if (!(track?.enabled === true) || !segments.length) {
      return Array.isArray(runtimeEntries) ? runtimeEntries : [];
    }
    return segments.map((segment) => {
      const rowId = String(segment?.rowId || "").trim();
      if (!rowId) return null;
      const runtime = runtimeByRowId.get(rowId) || null;
      const audioSrc = resolveFreshVoiceAudioSrc(segment, runtime);
      if (!audioSrc) return null;
      const startMs = Math.max(0, Number(segment?.startMs || 0) || 0);
      const durationMs = Math.max(
        STUDIO_TIMELINE_MIN_CLIP_MS,
        Number(segment?.durationMs || 0) || (Number(segment?.endMs || 0) - startMs) || STUDIO_TIMELINE_MIN_CLIP_MS
      );
      const audioAlign = "segment";
      // Importante: cuando el usuario mueve el chip (segment.startMs),
      // NO debemos "sumar" trimInMs del clip visual, o cortaríamos el inicio del audio.
      const baseTrimInMs = Math.max(0, Number(segment?.trimInMs || runtime?.clip?.trimInMs || 0) || 0);
      const trimInMs = audioAlign === "segment" ? 0 : baseTrimInMs;
      const baseTrimOutMsRaw = Number(segment?.trimOutMs || runtime?.clip?.trimOutMs || 0) || 0;
      const trimOutMs = audioAlign === "segment"
        ? Math.max(trimInMs + STUDIO_TIMELINE_MIN_CLIP_MS, trimInMs + durationMs)
        : Math.max(trimInMs + STUDIO_TIMELINE_MIN_CLIP_MS, baseTrimOutMsRaw || (trimInMs + durationMs));
      return {
        ...(runtime || {}),
        rowId,
        audioSrc,
        startMs,
        endMs: startMs + durationMs,
        effectiveDurationMs: durationMs,
        audioAlign,
        clip: {
          ...(runtime?.clip || {}),
          trimInMs,
          trimOutMs
        }
      };
    }).filter(Boolean);
  }

  function resolvePrimaryVisualRowId(activeEntries = []) {
    const entries = Array.isArray(activeEntries) ? activeEntries.filter(Boolean) : [];
    const visual = entries
      .filter((entry) => Boolean(String(entry?.videoSrc || "").trim()))
      .sort((a, b) => (
        Number(b.startMs || 0) - Number(a.startMs || 0)
        || Number(b.zIndex || 0) - Number(a.zIndex || 0)
        || Number(b.index || 0) - Number(a.index || 0)
      ))[0] || null;
    return String(visual?.rowId || "").trim();
  }

  function selectActiveGeminiVoiceEntry(voiceTimelineEntries = [], currentMs = 0) {
    const activeVoiceEntries = Array.isArray(voiceTimelineEntries)
      ? voiceTimelineEntries.filter((entry) => (
        Number(currentMs || 0) >= Number(entry?.startMs || 0)
        && Number(currentMs || 0) < Number(entry?.endMs || 0)
        && String(entry?.audioSrc || "").trim()
      ))
      : [];
    return activeVoiceEntries
      .slice()
      .sort((a, b) => (
        Number(b.startMs || 0) - Number(a.startMs || 0)
        || Number(b.zIndex || 0) - Number(a.zIndex || 0)
        || Number(b.index || 0) - Number(a.index || 0)
      ))[0] || null;
  }

  function syncMontageVoiceAudioEl(activeEntries = [], currentMs = 0, speed = 1, runtimeEntries = []) {
    const session = getActiveSession();
    const cfg = getPodcastVideoConfig(session);
    const baseGeminiVolumePct = Math.max(0, Math.min(100, toFiniteNumber(cfg.montageDefaultGeminiVolumePct, 100)));

    const voiceTimelineEntries = buildMontageVoiceTimelineEntries(cfg, runtimeEntries);
    // En modo "single", Gemini debe seguir el timeline de su propio clip de audio.
    // Si el chip se mueve, el audio también se mueve; no debe priorizar la escena visual.
    const selected = selectActiveGeminiVoiceEntry(voiceTimelineEntries, currentMs);
    const rowId = String(selected?.rowId || "").trim();
    const src = String(selected?.audioSrc || "").trim();
    const clip = selected?.clip && typeof selected.clip === "object" ? selected.clip : null;

    const overridePctRaw = toFiniteNumber(clip?.geminiVolumeOverridePct, Number.NaN);
    const effectivePct = Number.isFinite(overridePctRaw)
      ? Math.max(0, Math.min(100, overridePctRaw))
      : baseGeminiVolumePct;
    const effectiveVolume = Math.max(0, Math.min(1, effectivePct / 100));

    if (!rowId || !src || effectiveVolume <= 0.0001) {
      if (podcastVideoState.audioEl) {
        try { podcastVideoState.audioEl.pause(); } catch (_) {}
      }
      return;
    }

    const trimInMs = Math.max(0, Number(clip?.trimInMs || 0));
    const trimOutMs = Math.max(trimInMs + STUDIO_TIMELINE_MIN_CLIP_MS, Number(clip?.trimOutMs || trimInMs + STUDIO_TIMELINE_MIN_CLIP_MS));
    const entryElapsedMs = Math.max(0, Number(currentMs || 0) - Number(selected.startMs || 0));
    const rawOffsetMs = trimInMs + entryElapsedMs;
    const clampedOffsetMs = Math.max(trimInMs, Math.min(Math.max(trimInMs, trimOutMs - 1), rawOffsetMs));
    const offsetSec = Math.max(0, clampedOffsetMs / 1000);

    let audio = podcastVideoState.audioEl || null;
    const currentSrc = audio ? String(audio.currentSrc || audio.src || "").trim() : "";
    const needsSwap = !audio || currentSrc !== src;
    if (needsSwap) {
      if (audio) {
        try { audio.pause(); } catch (_) {}
      }
      audio = new Audio(typeof resolvePodcastStageAudioSrc === "function" ? resolvePodcastStageAudioSrc(src) : src);
      audio.preload = "auto";
      audio.__podcasterObjectUrlCacheKey = src;
      podcastVideoState.audioEl = audio;
      try { audio.load(); } catch (_) {}
      try { audio.currentTime = offsetSec; } catch (_) {}
      audio.volume = effectiveVolume;
      audio.playbackRate = speed;
      audio.play().catch((error) => {
        const err = error || null;
        logMontageDebug("scene-audio-play-reject", {
          rowId,
          src: String(src || "").trim().slice(0, 200),
          name: String(err?.name || ""),
          message: String(err?.message || "").slice(0, 160)
        });
      });
      return;
    }

    // Mantén vivo el objectURL en caché para evitar que se revoque mientras el audio aún se usa.
    try {
      if (typeof resolvePodcastStageAudioSrc === "function" && audio && audio.__podcasterObjectUrlCacheKey) {
        resolvePodcastStageAudioSrc(audio.__podcasterObjectUrlCacheKey);
      }
    } catch (_) {}

    try { audio.volume = effectiveVolume; } catch (_) {}
    try { audio.playbackRate = speed; } catch (_) {}
    const drift = Math.abs((Number(audio.currentTime || 0) - offsetSec));
    if (drift > 0.4) {
      try { audio.currentTime = offsetSec; } catch (_) {}
    }
    if (audio.paused) {
      audio.play().catch((error) => {
        const err = error || null;
        logMontageDebug("scene-audio-play-reject", {
          rowId,
          src: String(src || "").trim().slice(0, 200),
          name: String(err?.name || ""),
          message: String(err?.message || "").slice(0, 160)
        });
      });
    }
  }

  function syncMontageAudioPlayers(activeEntries = [], currentMs = 0, speed = 1, runtimeEntries = []) {
    if (podcastVideoState.montageActive && String(podcastVideoState.montageStageMode || "").trim().toLowerCase() === "single") {
      // En modo "single": evita múltiples <audio> simultáneos (autoplay/estado) y sigue la escena visual.
      // También evita que queden "players" viejos en background.
      Object.values(podcastVideoState.montageAudioPlayers || {}).forEach((audio) => {
        try { audio.pause(); } catch (_) {}
      });
      podcastVideoState.montageAudioPlayers = {};
      syncMontageVoiceAudioEl(activeEntries, currentMs, speed, runtimeEntries);
      const voiceVolume = Number(podcastVideoState.audioEl?.volume || 0);
      setMontageBackgroundDuckFactor(voiceVolume > 0.0001 ? getConfiguredMontageBackgroundDuckFactor() : 1);
      return;
    }
    const session = getActiveSession();
    const cfg = getPodcastVideoConfig(getActiveSession());
    const baseGeminiVolumePct = Math.max(0, Math.min(100, toFiniteNumber(cfg.montageDefaultGeminiVolumePct, 100)));
    const nextMap = { ...(podcastVideoState.montageAudioPlayers || {}) };
    const voiceTimelineEntries = buildMontageVoiceTimelineEntries(cfg, runtimeEntries);
    const clipMap = typeof ensureTimelineClipsByRowId === "function"
      ? ensureTimelineClipsByRowId(session, { persist: false })
      : {};
    const activeVoiceEntries = Array.isArray(voiceTimelineEntries)
      ? voiceTimelineEntries.filter((entry) => Number(currentMs || 0) >= Number(entry?.startMs || 0) && Number(currentMs || 0) < Number(entry?.endMs || 0))
      : [];
    const activeIds = new Set(activeVoiceEntries.map((entry) => entry.rowId));
    let activeVoicePeak = 0;
    primeMontageAudioEntries(voiceTimelineEntries, currentMs);

	    activeVoiceEntries.forEach((entry) => {
	      const src = String(entry.audioSrc || "").trim();
	      if (!src) return;
	      const rowId = String(entry.rowId || "").trim();
	      if (!rowId) return;
	      const clipCfg = clipMap?.[rowId] || null;
	      const trimInMs = Math.max(0, Number(entry?.clip?.trimInMs || 0));
	      const trimOutMs = Math.max(trimInMs + STUDIO_TIMELINE_MIN_CLIP_MS, Number(entry?.clip?.trimOutMs || trimInMs + STUDIO_TIMELINE_MIN_CLIP_MS));
	      // El override debe salir del clip efectivo del runtime (entry.clip) cuando exista,
	      // y solo caer a clipMap si hace falta. Esto evita desajustes cuando la pista de voz
	      // usa geminiDialogueTrack (segmentos) y el lookup por rowId no trae el clip esperado.
	      const overrideFromEntry = toFiniteNumber(entry?.clip?.geminiVolumeOverridePct, Number.NaN);
	      const overrideFromCfg = toFiniteNumber(clipCfg?.geminiVolumeOverridePct, Number.NaN);
	      const overridePctRaw = Number.isFinite(overrideFromEntry) ? overrideFromEntry : overrideFromCfg;
	      const effectivePct = Number.isFinite(overridePctRaw)
	        ? Math.max(0, Math.min(100, overridePctRaw))
	        : baseGeminiVolumePct;
	      const effectiveVolume = Math.max(0, Math.min(1, effectivePct / 100));
	      activeVoicePeak = Math.max(activeVoicePeak, effectiveVolume);
	      // Si el usuario puso Gemini=0, garantizamos silencio pausando el elemento (no solo volume=0).
	      // Esto evita casos raros donde el audio queda sonando por estado previo.
	      if (effectiveVolume <= 0.0001) {
	        const existing = nextMap[rowId];
	        if (existing) {
	          try { existing.pause(); } catch (_) {}
	          delete nextMap[rowId];
	        }
	        activeIds.delete(rowId);
	        return;
	      }
	      const entryElapsedMs = Math.max(0, Number(currentMs || 0) - Number(entry.startMs || 0));
	      const rawOffsetMs = trimInMs + entryElapsedMs;
	      const clampedOffsetMs = Math.max(trimInMs, Math.min(Math.max(trimInMs, trimOutMs - 1), rawOffsetMs));
	      const isNearSceneStart = entryElapsedMs <= Math.max(180, STUDIO_TIMELINE_SNAP_MS * 2);
	      const offsetMs = isNearSceneStart ? trimInMs : clampedOffsetMs;
      const offsetSec = Math.max(0, offsetMs / 1000);
	      let audio = nextMap[rowId];
      if (!audio) {
	        audio = montageAudioCache[rowId] || new Audio(typeof resolvePodcastStageAudioSrc === "function" ? resolvePodcastStageAudioSrc(src) : src);
	        audio.preload = "auto";
          audio.__podcasterObjectUrlCacheKey = src;
          if (!audio.__podcasterDurationBound) {
            audio.addEventListener("loadedmetadata", () => {
              const durSec = Number(audio.duration || 0);
              if (!Number.isFinite(durSec) || durSec <= 0) return;
              const durMs = Math.round(Math.max(0, durSec * 1000));
              if (!podcastVideoState.montageAudioActualDurationsMs || typeof podcastVideoState.montageAudioActualDurationsMs !== "object") {
                podcastVideoState.montageAudioActualDurationsMs = {};
              }
              const prev = Math.max(0, Number(podcastVideoState.montageAudioActualDurationsMs[rowId] || 0) || 0);
              if (durMs <= prev + 20) return;
              podcastVideoState.montageAudioActualDurationsMs[rowId] = durMs;
              if (typeof syncGeminiDialogueTrackWithRuntime === "function") {
                try { syncGeminiDialogueTrackWithRuntime({ render: true, preserveStartMs: true }); } catch (_) {}
              }
            }, { once: true });
            audio.__podcasterDurationBound = true;
          }
	        if (!audio.__podcasterSceneAudioErrorBound) {
          audio.addEventListener("error", () => {
            failedSceneAudioRows.add(rowId);
            audio.__podcasterErrored = true;
            try { markStaleProxyMediaUrl?.(src, "proxy-media-404", { kind: "montage-scene-audio", rowId }); } catch (_) {}
            logMontageDebug("scene-audio-error", { rowId, src: String(src || "").trim().slice(0, 240) });
          });
          audio.__podcasterSceneAudioErrorBound = true;
        }
	        audio.addEventListener("playing", () => {
	          failedSceneAudioRows.delete(rowId);
            audio.__podcasterErrored = false;
	        }, { once: true });
	        audio.volume = effectiveVolume;
	        audio.playbackRate = speed;
        try {
          audio.currentTime = offsetSec;
        } catch (_) {}
        audio.play().catch(() => {
          failedSceneAudioRows.add(rowId);
        });
        nextMap[rowId] = audio;
        montageAudioCache[rowId] = audio;
        return;
      }
      // Si el elemento entró en estado de error, recrea (a veces el browser queda "pegado" y no recupera).
      if (audio.__podcasterErrored === true || audio.error) {
        try { audio.pause(); } catch (_) {}
        delete nextMap[rowId];
        delete montageAudioCache[rowId];
        failedSceneAudioRows.add(rowId);
        return;
      }

      // Mantén vivo el objectURL en caché para evitar que se revoque mientras está en reproducción.
      try {
        if (typeof resolvePodcastStageAudioSrc === "function" && audio.__podcasterObjectUrlCacheKey) {
          resolvePodcastStageAudioSrc(audio.__podcasterObjectUrlCacheKey);
        }
      } catch (_) {}

      audio.volume = effectiveVolume;
      audio.playbackRate = speed;
      const drift = Math.abs((Number(audio.currentTime || 0) - offsetSec));
      const now = Number(performance.now() || 0);
      const lastHardSyncAt = Number(audio.__podcasterLastHardSyncAt || 0);
      if (drift > 0.4 && now - lastHardSyncAt > 220) {
        try {
          audio.currentTime = offsetSec;
          audio.__podcasterLastHardSyncAt = now;
        } catch (_) {}
      }
      if (audio.paused) {
        audio.play().catch(() => {
          failedSceneAudioRows.add(rowId);
        });
      }
    });

    Object.keys(nextMap).forEach((rowId) => {
      if (activeIds.has(rowId)) return;
      const audio = nextMap[rowId];
      if (!audio) return;
      try { audio.pause(); } catch (_) {}
      delete nextMap[rowId];
    });

    podcastVideoState.montageAudioPlayers = nextMap;
    setMontageBackgroundDuckFactor(activeVoicePeak > 0.0001 ? getConfiguredMontageBackgroundDuckFactor() : 1);
  }

  async function syncStudioTimelinePreview(currentMs = 0, runtimeEntries = [], forcedActiveEntries = null, options = {}) {
    // En modo MSE no tocamos el stage video (no swaps, no opacity hacks).
    if (podcastVideoState.montageActive && podcastVideoState.mseEngineActive === true) {
      const session = getActiveSession();
      const shouldAutoplay = podcastVideoState.montageActive || options?.autoplay !== false;
      let activeEntries = Array.isArray(forcedActiveEntries)
        ? forcedActiveEntries.filter(Boolean)
        : runtimeEntries.filter((entry) => currentMs >= entry.startMs && currentMs < entry.endMs);
      if (!activeEntries.length) return;
      const sorted = [...activeEntries].sort((a, b) => Number(b.startMs || 0) - Number(a.startMs || 0) || Number(b.zIndex || 0) - Number(a.zIndex || 0));
      const visualEntry = sorted[0];
      const rowId = String(visualEntry?.rowId || "").trim();
      if (rowId) {
        try {
          syncPodcastStudioRuntimeUi(session, rowId, String(visualEntry?.speakerKey || "").trim(), { speaking: shouldAutoplay });
        } catch (_) {}
        podcastVideoState.montageLastVisualRowId = rowId;
        if (typeof syncPodcastOnScreenTextOverlay === "function") {
          try {
            syncPodcastOnScreenTextOverlay(session, {
              rowId,
              currentMs,
              forceRow: true
            });
          } catch (_) {}
        }
      }
      stopPreviewSceneAudio();
      return;
    }
    const requestToken = podcastVideoState.montageActive ? previewSyncRequestToken : ++previewSyncRequestToken;
    const isStaleRequest = () => requestToken !== previewSyncRequestToken;
    const session = getActiveSession();
    const montageStageMode = String(podcastVideoState.montageStageMode || "").trim().toLowerCase();
    // `montageStageMode` controla principalmente la política de audio (single vs multi-audio).
    // El doble buffer de video durante montaje se controla aparte con `montageStageDoubleBuffer`.
    const hasAlternateStageSlot = Boolean(resolveStageVideoEl(false));
    const disableStageDoubleBuffer = podcastVideoState.montageActive
      ? !(podcastVideoState.montageStageDoubleBuffer === true && hasAlternateStageSlot)
      : false;
    const shouldAutoplay = podcastVideoState.montageActive || options?.autoplay !== false;
    let activeEntries = Array.isArray(forcedActiveEntries)
      ? forcedActiveEntries.filter(Boolean)
      : runtimeEntries.filter((entry) => currentMs >= entry.startMs && currentMs < entry.endMs);
    if (!Array.isArray(forcedActiveEntries) && !activeEntries.length) {
      const nearestPrevious = runtimeEntries
        .filter((entry) => Number(entry?.endMs || 0) <= currentMs)
        .sort((a, b) => Number(b.endMs || 0) - Number(a.endMs || 0))[0] || null;
      const gapFromPrevMs = nearestPrevious ? Math.max(0, Number(currentMs || 0) - Number(nearestPrevious.endMs || 0)) : Number.POSITIVE_INFINITY;
      const nearestUpcoming = runtimeEntries
        .filter((entry) => Number(entry.startMs || 0) >= currentMs)
        .sort((a, b) => Number(a.startMs || 0) - Number(b.startMs || 0))[0] || null;
      const gapToNextMs = nearestUpcoming ? Math.max(0, Number(nearestUpcoming.startMs || 0) - currentMs) : Number.POSITIVE_INFINITY;
      if (nearestPrevious && gapFromPrevMs <= 200) {
        activeEntries = [nearestPrevious];
      } else if (nearestUpcoming && gapToNextMs <= 120) {
        activeEntries = [nearestUpcoming];
      }
    }
    if (isStaleRequest()) return;
    if (!activeEntries.length) {
      if (isStaleRequest()) return;
      stopPreviewSceneAudio();
      if (typeof syncPodcastOnScreenTextOverlay === "function") {
        try {
          syncPodcastOnScreenTextOverlay(session, {
            rowId: "",
            currentMs,
            forceRow: true
          });
        } catch (_) {}
      }
      if (podcastVideoState.speaking) {
        setPodcastVideoSpeaker(session, podcastVideoState.activeSpeaker || "", { speaking: false, rowId: podcastVideoState.activeRowId });
      }
      getAllStageVideoElements().forEach((video) => {
        if (video && !video.paused) {
          try { video.pause(); } catch (_) {}
        }
      });
      podcastVideoState.montageLastVisualRowId = "";
      return;
    }
    const sorted = [...activeEntries].sort((a, b) => {
      if (podcastVideoState.montageActive) {
        if (Number(b.startMs || 0) !== Number(a.startMs || 0)) {
          return Number(b.startMs || 0) - Number(a.startMs || 0);
        }
        return Number(b.zIndex || 0) - Number(a.zIndex || 0);
      }
      if (b.zIndex !== a.zIndex) return b.zIndex - a.zIndex;
      const pinned = String(podcastVideoState.timelineLastInteractedRowId || "").trim();
      if (pinned && a.rowId === pinned) return -1;
      if (pinned && b.rowId === pinned) return 1;
      return b.startMs - a.startMs;
    });
    const visualEntry = sorted[0];
    const rowId = String(visualEntry?.rowId || "").trim();
    if (!rowId) return;
    const nextUpcomingEntry = resolveNextUpcomingVisualEntry(runtimeEntries, visualEntry);
    if (nextUpcomingEntry?.videoSrc) {
      primePodcastStageVideoSource(nextUpcomingEntry.videoSrc).catch(() => {});
    }

    // Lookahead real: durante montaje, carga el siguiente clip en el slot inactivo tan pronto se conozca.
    const canDoubleBufferGlobal = Boolean(
      podcastVideoState.montageActive
      && !disableStageDoubleBuffer
      && typeof setPodcastStageVideoSourceForElement === "function"
      && typeof setActiveStageVideoSlot === "function"
      && resolveStageVideoEl(false)
    );
    const inactiveVideoGlobal = canDoubleBufferGlobal ? resolveStageVideoEl(false) : null;
    if (!disableStageDoubleBuffer && podcastVideoState.montageActive && inactiveVideoGlobal && nextUpcomingEntry?.videoSrc) {
      const nextSrc = String(nextUpcomingEntry.videoSrc || "").trim();
      if (nextSrc) {
        const alreadyLoaded = String(inactiveVideoGlobal.dataset?.src || "").trim() === nextSrc
          && inactiveVideoGlobal.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
        const hasPendingSwapLoad = pendingStageSwap
          && pendingStageSwap.toEl === inactiveVideoGlobal
          && pendingStageSwap.loadDone !== true;
        const swapWouldConflict = hasPendingSwapLoad && String(pendingStageSwap?.src || "").trim() !== nextSrc;
        const last = pendingStageLookahead;
        const sameFlight = last
          && last.videoEl === inactiveVideoGlobal
          && last.src === nextSrc
          && last.requestToken === requestToken
          && last.montageToken === Number(podcastVideoState.montageToken || 0);
        if (!alreadyLoaded && !swapWouldConflict && !sameFlight) {
          scheduleStageLookaheadLoad({
            requestToken,
            montageToken: Number(podcastVideoState.montageToken || 0),
            src: nextSrc,
            videoEl: inactiveVideoGlobal
          });
        }
      }
    }
    const previousVisualRowId = String(podcastVideoState.montageLastVisualRowId || "").trim();
    const previousVisualEntry = previousVisualRowId
      ? (runtimeEntries.find((entry) => String(entry?.rowId || "").trim() === previousVisualRowId) || null)
      : null;
    const rowChanged = Boolean(previousVisualRowId && previousVisualRowId !== rowId);
    if (
      String(podcastVideoState.activeRowId || "").trim() !== rowId
      || String(podcastVideoState.activeSpeaker || "").trim() !== String(visualEntry.speakerKey || "").trim()
      || !podcastVideoState.speaking
    ) {
      syncPodcastStudioRuntimeUi(session, rowId, visualEntry.speakerKey, { speaking: shouldAutoplay });
    } else {
      podcastVideoState.activeRowId = rowId;
    }

    const cfg = getPodcastVideoConfig(session);
    const baseClipVolumePct = podcastVideoState.montageActive
      ? Math.max(0, Math.min(100, toFiniteNumber(cfg.montageDefaultVeoVolumePct, 0)))
      : Math.max(0, Math.min(100, toFiniteNumber(cfg.clipVolume, 100)));
    const clipVolume = Math.max(0, Math.min(1, baseClipVolumePct / 100));
    const masterVolume = Math.max(0, Math.min(1, toFiniteNumber(cfg.masterVolume, 100) / 100));
    const educationalMode = isEducationalSession(session);
    const requestedNativeAudio = typeof shouldUseNativeVideoAudioForRow === "function"
      ? shouldUseNativeVideoAudioForRow(session, rowId)
      : true;
    const useNativeVideoAudio = requestedNativeAudio || failedSceneAudioRows.has(rowId);
    const hasSceneAudio = Boolean(String(visualEntry?.audioSrc || "").trim());
	    const clipMap = typeof ensureTimelineClipsByRowId === "function"
	      ? ensureTimelineClipsByRowId(session, { persist: false })
	      : {};
	    const clipCfg = clipMap?.[rowId] || null;
	    const veoOverrideFromEntry = toFiniteNumber(visualEntry?.clip?.veoVolumeOverridePct, Number.NaN);
	    const veoOverrideFromCfg = toFiniteNumber(clipCfg?.veoVolumeOverridePct, Number.NaN);
	    const veoOverridePctRaw = Number.isFinite(veoOverrideFromEntry) ? veoOverrideFromEntry : veoOverrideFromCfg;
    const baseVeoPct = podcastVideoState.montageActive
      ? Math.max(0, Math.min(100, toFiniteNumber(cfg.montageDefaultVeoVolumePct, 0)))
      : baseClipVolumePct;
    const effectiveVeoPct = Number.isFinite(veoOverridePctRaw)
      ? Math.max(0, Math.min(100, veoOverridePctRaw))
      : baseVeoPct;
    const keepVideoAudioAudible = podcastVideoState.montageActive
      ? (educationalMode || requestedNativeAudio || !hasSceneAudio || effectiveVeoPct > 0)
      : (educationalMode || useNativeVideoAudio);
    const scrubMuteVideo = Boolean(!podcastVideoState.montageActive && podcastVideoState.playheadDragging === true && effectiveVeoPct <= 0);
    const trimInMs = Math.max(0, Number(visualEntry?.clip?.trimInMs || 0));
    const trimOutMs = Math.max(trimInMs + STUDIO_TIMELINE_MIN_CLIP_MS, Number(visualEntry?.clip?.trimOutMs || trimInMs + STUDIO_TIMELINE_MIN_CLIP_MS));
    const visualElapsedMs = Math.max(0, Number(currentMs || 0) - Number(visualEntry.startMs || 0));
    const rawOffsetMs = trimInMs + visualElapsedMs;
    const clampedOffsetMs = Math.max(trimInMs, Math.min(Math.max(trimInMs, trimOutMs - 1), rawOffsetMs));
    const offsetSec = Math.max(0, clampedOffsetMs / 1000);
    const effectiveClipPct = effectiveVeoPct;
    const src = String(visualEntry.videoSrc || "").trim();
    const visualLayoutMode = normalizeVisualLayoutMode(visualEntry?.clip?.visualLayoutMode);

    // Solapamiento visual: prioriza la escena superior sin crossfade ni opacidad gradual.
    const overlapCandidates = activeEntries.filter((entry) => Boolean(String(entry?.videoSrc || "").trim()));
    const canOverlapPreview = Boolean(overlapCandidates.length >= 2);
    if (podcastVideoState.previewOverlapActive === true && !canOverlapPreview) {
      podcastVideoState.previewOverlapActive = false;
      const primaryBundle = resolveStageVideoBundle(true);
      const secondaryBundle = resolveStageVideoBundle(false);
      [primaryBundle, secondaryBundle].forEach((bundle) => {
        [bundle?.foreground, bundle?.backdrop].filter(Boolean).forEach((video) => {
          video.style.zIndex = "";
          video.style.pointerEvents = "none";
        });
      });
      clearStageBundleOpacity(primaryBundle);
      setStageBundleOpacity(secondaryBundle, 0);
      [secondaryBundle?.foreground, secondaryBundle?.backdrop].filter(Boolean).forEach((video) => {
        try { video.pause(); } catch (_) {}
      });
    }
    if (canOverlapPreview) {
      const incomingBundle = resolveStageVideoBundle(true);
      const outgoingBundle = resolveStageVideoBundle(false);
      if (incomingBundle?.foreground && outgoingBundle?.foreground) {
        const byPriority = [...overlapCandidates].sort((a, b) => (
          Number(b.zIndex || 0) - Number(a.zIndex || 0)
          || Number(b.startMs || 0) - Number(a.startMs || 0)
        ));
        const topEntry = byPriority[0] || null;
        const underEntry = byPriority[1] || null;
        if (topEntry) {
          const speed = Math.max(0.5, Math.min(1.8, Number(els.podcastVideoSpeedSelect?.value || 1)));

          const calcOffsetSecForEntry = (entry) => {
            const trimIn = Math.max(0, Number(entry?.clip?.trimInMs || 0));
            const trimOut = Math.max(trimIn + STUDIO_TIMELINE_MIN_CLIP_MS, Number(entry?.clip?.trimOutMs || trimIn + STUDIO_TIMELINE_MIN_CLIP_MS));
            const elapsedMs = Math.max(0, Number(currentMs || 0) - Number(entry?.startMs || 0));
            const raw = trimIn + elapsedMs;
            const clamped = Math.max(trimIn, Math.min(Math.max(trimIn, trimOut - 1), raw));
            return Math.max(0, clamped / 1000);
          };

          const topOffsetSec = calcOffsetSecForEntry(topEntry);
          const underOffsetSec = underEntry ? calcOffsetSecForEntry(underEntry) : 0;
          const seekToleranceSec = shouldAutoplay ? 0.14 : 0.02;
          const okTop = await ensureStageBundleReady(incomingBundle, topEntry, topOffsetSec, {
            keepHidden: false,
            playbackRate: speed,
            seekToleranceSec,
            forceSeek: !shouldAutoplay
          });
          const okUnder = underEntry
            ? await ensureStageBundleReady(outgoingBundle, underEntry, underOffsetSec, {
              keepHidden: false,
              playbackRate: speed,
              seekToleranceSec,
              forceSeek: !shouldAutoplay
            })
            : false;
          if (isStaleRequest()) return;

          [incomingBundle?.foreground, incomingBundle?.backdrop].filter(Boolean).forEach((video) => {
            video.style.zIndex = "2";
          });
          [outgoingBundle?.foreground, outgoingBundle?.backdrop].filter(Boolean).forEach((video) => {
            video.style.zIndex = "1";
          });

          if (!okTop && !okUnder) {
            podcastVideoState.previewOverlapActive = false;
            return;
          }
          setStageBundleOpacity(incomingBundle, okTop ? 1 : 0);
          setStageBundleOpacity(outgoingBundle, okTop ? 0 : (okUnder ? 1 : 0));

          [incomingBundle, outgoingBundle].forEach((bundle) => {
            [bundle?.foreground, bundle?.backdrop].filter(Boolean).forEach((video) => {
              video.playbackRate = speed;
              video.volume = 0;
              try { video.muted = true; } catch (_) {}
              if (shouldAutoplay && !scrubMuteVideo) {
                if (video.paused) video.play().catch(() => {});
              } else if (!video.paused) {
                try { video.pause(); } catch (_) {}
              }
            });
          });

          podcastVideoState.previewOverlapActive = true;
          try {
            syncPodcastStudioRuntimeUi(session, String(topEntry?.rowId || "").trim(), String(topEntry?.speakerKey || "").trim(), { speaking: shouldAutoplay });
          } catch (_) {}
          stopPreviewSceneAudio();
          podcastVideoState.montageLastVisualRowId = String(topEntry?.rowId || "").trim() || rowId;
          return;
        }
      }
    }

    if (src) {
      if (isStaleRequest()) return;
      let stageVideo = resolveStageVideoEl(true);
      if (!stageVideo) return;
      ensureActiveStageVideoVisible(stageVideo);
      const previousStageVideoEl = stageVideo;
      if (disableStageDoubleBuffer && pendingStageSwap) {
        cancelPendingStageSwap("single-slot");
      }
      let pendingDoubleBufferSwap = false;
      let skipStageVideoControls = false;
      const montageToken = Number(podcastVideoState.montageToken || 0);
      const currentSrc = String(stageVideo.dataset.src || "").trim();
      let shouldSwapSource = currentSrc !== src;
      let shouldSwapSourceForSync = shouldSwapSource;
      if (shouldSwapSource) {
        const canDoubleBuffer = Boolean(
          podcastVideoState.montageActive
          && !disableStageDoubleBuffer
          && typeof setPodcastStageVideoSourceForElement === "function"
          && typeof setActiveStageVideoSlot === "function"
          && resolveStageVideoEl(false)
        );
        const inactiveVideo = canDoubleBuffer ? resolveStageVideoEl(false) : null;

        // Swap inmediato: si el slot inactivo ya trae este `src` listo (por lookahead), corta al instante.
        if (
          podcastVideoState.montageActive
          && canDoubleBuffer
          && inactiveVideo
          && String(inactiveVideo.dataset?.src || "").trim() === src
          && inactiveVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
        ) {
          const nextSlot = resolveStageVideoSlotForEl(inactiveVideo);
          try { inactiveVideo.hidden = false; } catch (_) {}
          try { inactiveVideo.style.opacity = "0"; } catch (_) {}
          try { inactiveVideo.style.pointerEvents = "none"; } catch (_) {}
          try { inactiveVideo.playbackRate = Math.max(0.5, Math.min(1.8, Number(els.podcastVideoSpeedSelect?.value || 1))); } catch (_) {}
          try { inactiveVideo.currentTime = offsetSec; } catch (_) {}
          try { setActiveStageVideoSlot(nextSlot); } catch (_) {}
          stageVideo = resolveStageVideoEl(true) || inactiveVideo;
          shouldSwapSource = false;
          shouldSwapSourceForSync = false;
          skipStageVideoControls = false;

          try { stageVideo.hidden = false; } catch (_) {}
          try { stageVideo.style.opacity = ""; } catch (_) {}
          try { stageVideo.style.pointerEvents = ""; } catch (_) {}
          clearStageVideoInlineStyles(stageVideo);

          const nowActive = resolveStageVideoEl(true) || stageVideo;
          const nowInactive = resolveStageVideoEl(false) || null;
          if (nowInactive && nowInactive !== nowActive) {
            try { nowInactive.pause(); } catch (_) {}
            try { nowInactive.hidden = true; } catch (_) {}
            clearStageVideoInlineStyles(nowInactive);
          }
        }

        // Si existe un swap pendiente y ya está listo, comitea antes de pedir otro swap.
        if (podcastVideoState.montageActive && canDoubleBuffer && pendingStageSwap) {
          const state = pendingStageSwap;
          const canCommit = Boolean(
            state
            && state.loadDone
            && state.loadOk
            && state.requestToken === requestToken
            && state.montageToken === montageToken
            && state.src === src
          );
	          if (canCommit) {
	            const seq = state.seq;
	            const fromEl = state.fromEl;
	            const toEl = state.toEl;
              const committedEl = toEl;
	            const nextSlot = resolveStageVideoSlotForEl(toEl);
	            try { toEl.hidden = false; } catch (_) {}
	            // Mantén invisible hasta que tengamos el frame en el timestamp correcto.
	            try { toEl.style.opacity = "0"; } catch (_) {}
	            try { toEl.style.pointerEvents = "none"; } catch (_) {}
            try { toEl.playbackRate = Math.max(0.5, Math.min(1.8, Number(els.podcastVideoSpeedSelect?.value || 1))); } catch (_) {}
            const desiredOffset = resolveSafeOffsetSec(toEl, offsetSec);
            const needsSeek = Math.abs(Number(toEl.currentTime || 0) - desiredOffset) > 0.06;
            if (needsSeek) {
              try { toEl.currentTime = desiredOffset; } catch (_) {}
            }
            try { setActiveStageVideoSlot(nextSlot); } catch (_) {}
	            stageVideo = resolveStageVideoEl(true) || toEl;
	            pendingStageSwap = null;
	            shouldSwapSource = false;
	            shouldSwapSourceForSync = false;

	            const show = () => {
                const video = committedEl || null;
	              if (!video || resolveStageVideoEl(true) !== video) return;
	              if (pendingStageSwap && pendingStageSwap.seq === seq) return;
	              try { video.style.opacity = ""; } catch (_) {}
	              try { video.style.pointerEvents = ""; } catch (_) {}
	              clearStageVideoInlineStyles(video);
	            };
	            const requestShowOnFrame = () => {
                // `requestVideoFrameCallback()` puede no disparar si el video está pausado
                // (por autoplay policy) o si no llega a pintar frame a tiempo; siempre
                // dejamos un fallback con timeout para no quedar con opacity=0.
                try {
                  if (typeof committedEl?.requestVideoFrameCallback === "function") {
                    committedEl.requestVideoFrameCallback(() => show());
                  }
                } catch (_) {}
                setTimeout(show, 120);
	            };
	            if (needsSeek) {
	              let revealed = false;
	              const onSeeked = () => {
	                if (revealed) return;
	                revealed = true;
	                requestShowOnFrame();
	              };
	              try { committedEl.addEventListener("seeked", onSeeked, { once: true }); } catch (_) {}
	              setTimeout(() => {
	                if (revealed) return;
	                revealed = true;
	                requestShowOnFrame();
	              }, 260);
	            } else {
	              requestShowOnFrame();
	            }

            const nowActive = resolveStageVideoEl(true) || stageVideo;
            const nowInactive = resolveStageVideoEl(false) || null;
            if (nowInactive && nowInactive !== nowActive) {
              try { nowInactive.pause(); } catch (_) {}
              try { nowInactive.hidden = true; } catch (_) {}
              clearStageVideoInlineStyles(nowInactive);
            } else if (fromEl && fromEl !== nowActive) {
              try { fromEl.pause(); } catch (_) {}
              try { fromEl.hidden = true; } catch (_) {}
              clearStageVideoInlineStyles(fromEl);
            }
          } else if (
            state
            && (state.requestToken !== requestToken || state.montageToken !== montageToken || state.src !== src)
          ) {
            cancelPendingStageSwap("mismatch");
          }
        }

        if (!shouldSwapSource) {
          // Ya se comiteó el swap pendiente; no solicitamos otro cambio.
        } else if (canDoubleBuffer && inactiveVideo && inactiveVideo !== stageVideo) {
          // En montaje con doble buffer: NO bloquear el preview esperando el load.
          if (podcastVideoState.montageActive) {
            const started = requestNonBlockingStageSwap({
              requestToken,
              montageToken,
              rowId,
              src,
              fromEl: previousStageVideoEl,
              toEl: inactiveVideo
            });
            if (started) {
              pendingDoubleBufferSwap = true;
              skipStageVideoControls = true;
            }
          } else {
            stageVideo = inactiveVideo;
            pendingDoubleBufferSwap = true;
            clearStageVideoInlineStyles(stageVideo);
            stageVideo.hidden = false;
            // Mantén el video entrante invisible hasta que tenga el frame correcto.
            stageVideo.style.opacity = "0";
            stageVideo.style.pointerEvents = "none";
            stageVideo.style.transform = "translateZ(0)";
            stageVideo.style.zIndex = "2";
            const ready = await setPodcastStageVideoSourceForElement(stageVideo, src);
            if (isStaleRequest()) return;
            if (!ready) {
              pendingDoubleBufferSwap = false;
              stageVideo = previousStageVideoEl;
              const fallbackReady = await setPodcastStageVideoSource(src);
              if (isStaleRequest()) return;
              if (!fallbackReady) return;
              stageVideo = resolveStageVideoEl(true) || stageVideo;
              clearStageVideoInlineStyles(stageVideo);
            }
          }
        } else {
          // Sin doble buffer: no ocultamos el <video> para evitar "pantallazo" (gris/negro)
          // entre escenas; dejamos el último frame visible mientras llega el siguiente.
          const ready = await setPodcastStageVideoSource(src);
          if (isStaleRequest()) return;
          if (!ready) return;
          stageVideo = resolveStageVideoEl(true) || stageVideo;
          clearStageVideoInlineStyles(stageVideo);
        }
      }

      if (skipStageVideoControls) {
        // Swap non-blocking solicitado: mantenemos visible el video anterior (sin negro) mientras carga y
        // evitamos manipular el video saliente (seek/play) en este tick.
        if (isStaleRequest()) return;
      } else {
      const speed = Math.max(0.5, Math.min(1.8, Number(els.podcastVideoSpeedSelect?.value || 1)));
      stageVideo.playbackRate = speed;
      let desiredVeoVolume = keepVideoAudioAudible
        ? Math.max(0, Math.min(1, effectiveClipPct / 100))
        : 0;
      // Fail-safe: si no hay audio Gemini guardado para esta escena y el default Veo está en 0,
      // evita un montaje totalmente silencioso.
      if (podcastVideoState.montageActive && !hasSceneAudio && desiredVeoVolume <= 0.0001) {
        desiredVeoVolume = Math.max(0, Math.min(1, toFiniteNumber(cfg.clipVolume, 100) / 100));
      }
      stageVideo.volume = desiredVeoVolume;
      // En montaje: swaps de `src` ocurren fuera del user-gesture. Para evitar autoplay-block,
      // arrancamos `play()` en muted y desmuteamos al llegar a `playing`.
      const shouldStartMuted = Boolean(
        podcastVideoState.montageActive
        && shouldAutoplay
        && desiredVeoVolume > 0
        && (shouldSwapSourceForSync || stageVideo.paused)
      );
      if (!(desiredVeoVolume > 0)) {
        try { stageVideo.muted = true; } catch (_) {}
      } else if (!podcastVideoState.montageActive) {
        try { stageVideo.muted = false; } catch (_) {}
      } else if (shouldStartMuted) {
        try { stageVideo.muted = true; } catch (_) {}
      } else {
        // Si el usuario sube el volumen de Veo (override) y ya no estamos en el caso de
        // "start muted", aseguramos que no quede pegado en muted.
        try { stageVideo.muted = false; } catch (_) {}
      }
      logMontageDebug("veo-audio-mix", {
        rowId,
        montageActive: podcastVideoState.montageActive,
        audioMode: String(cfg.audioMode || "gemini-live-per-scene").trim(),
        montageDefaultVeoVolumePct: Number(toFiniteNumber(cfg.montageDefaultVeoVolumePct, 0) || 0),
        veoOverridePct: Number.isFinite(veoOverridePctRaw) ? Number(veoOverridePctRaw) : null,
        effectiveVeoPct: Number(effectiveClipPct || 0),
        scrubMuteVideo,
        keepVideoAudioAudible,
        muted: Boolean(stageVideo.muted),
        volume: Number(stageVideo.volume || 0),
        src: String(src || "").trim().slice(0, 140)
      });
      logMontageDebug("scene-audio-policy", {
        rowId,
        useNativeVideoAudio,
        keepVideoAudioAudible,
        educationalMode,
        requestedNativeAudio,
        sceneAudioFailed: failedSceneAudioRows.has(rowId),
        clipVolume,
        effectiveVideoVolume: Number(stageVideo.volume || 0),
        hasSceneAudio: Boolean(String(visualEntry?.audioSrc || "").trim()),
        videoSrc: String(src || "").trim().slice(0, 120),
        audioSrc: String(visualEntry?.audioSrc || "").trim().slice(0, 120)
      });
      const videoDurationSec = Math.max(0, Number(stageVideo.duration || 0));
      const safeOffsetSec = videoDurationSec > 0
        ? Math.max(0, Math.min(Math.max(0, videoDurationSec - 0.04), offsetSec))
        : offsetSec;
      const mustSeekOnSceneChange = Boolean(rowChanged || shouldSwapSource);
      const currentVideoTime = Number(stageVideo.currentTime || 0);
      const videoDriftSec = Math.abs(currentVideoTime - safeOffsetSec);
      const videoNeedsRecovery = stageVideo.readyState < HTMLMediaElement.HAVE_FUTURE_DATA
        || stageVideo.seeking
        || stageVideo.paused;
      if (mustSeekOnSceneChange || (videoNeedsRecovery && videoDriftSec > 0.18) || videoDriftSec > 0.42) {
        try { stageVideo.currentTime = safeOffsetSec; } catch (_) {}
      }
      const activeBundleForStage = resolveStageVideoBundleForForeground(stageVideo);
      await ensureStageBundleReady(activeBundleForStage, {
        ...visualEntry,
        clip: {
          ...(visualEntry?.clip || {}),
          visualLayoutMode
        }
      }, safeOffsetSec, {
        keepHidden: false,
        playbackRate: speed,
        seekToleranceSec: shouldAutoplay ? 0.14 : 0.03,
        forceSeek: mustSeekOnSceneChange || !shouldAutoplay
      });
      const inactiveBundleForStage = resolveStageVideoBundleForForeground(previousStageVideoEl === stageVideo ? resolveStageVideoEl(false) : previousStageVideoEl);
      applyStageBundleLayout(inactiveBundleForStage, "default");
      setStageBundleOpacity(inactiveBundleForStage, 0);
      [inactiveBundleForStage?.foreground, inactiveBundleForStage?.backdrop].filter(Boolean).forEach((video) => {
        try { video.pause(); } catch (_) {}
      });
      if (isStaleRequest()) return;

      // Si estamos en doble buffer pero NO autoplay (scrub/seek), hacemos el swap tras seek+frame.
      if (pendingDoubleBufferSwap && previousStageVideoEl && previousStageVideoEl !== stageVideo && !(shouldAutoplay && !scrubMuteVideo)) {
        try { await waitForStageVideoReady(stageVideo, 720); } catch (_) {}
        try { await waitForStageVideoSeek(stageVideo, 520); } catch (_) {}
        try { await Promise.race([waitForStageVideoFrame(stageVideo, 260), sleep(80)]); } catch (_) {}
        if (isStaleRequest()) return;
        const nextSlot = Number(podcastVideoState.stageVideoSlot || 0) === 1 ? 0 : 1;
        try { setActiveStageVideoSlot(nextSlot); } catch (_) {}
        stageVideo.hidden = false;
        stageVideo.style.opacity = "";
        stageVideo.style.pointerEvents = "";
        previousStageVideoEl.style.opacity = "0";
        previousStageVideoEl.style.pointerEvents = "none";
        try { previousStageVideoEl.pause(); } catch (_) {}
        previousStageVideoEl.hidden = true;
        clearStageVideoInlineStyles(previousStageVideoEl);
        clearStageVideoInlineStyles(stageVideo);
        pendingDoubleBufferSwap = false;
      }

      if (shouldAutoplay && !scrubMuteVideo) {
        if (stageVideo.paused) {
          const p = stageVideo.play();
          if (p && typeof p.catch === "function") {
            p.catch((error) => {
              logMontageDebug("stage-play-error", {
                rowId,
                src: String(src || "").trim().slice(0, 140),
                name: String(error?.name || ""),
                message: String(error?.message || "").slice(0, 160),
                muted: Boolean(stageVideo.muted),
                volume: Number(stageVideo.volume || 0),
                readyState: Number(stageVideo.readyState || 0)
              });
            });
          }
        }
        const activeBackdrop = resolveStageVideoBundleForForeground(stageVideo)?.backdrop || null;
        if (activeBackdrop && activeBackdrop.hidden !== true && activeBackdrop.paused) {
          activeBackdrop.play().catch(() => {});
        }
        if (pendingDoubleBufferSwap && previousStageVideoEl && previousStageVideoEl !== stageVideo) {
          try { await waitForStageVideoReady(stageVideo, 720); } catch (_) {}
          try { await waitForStageVideoSeek(stageVideo, 520); } catch (_) {}
          try { await waitForStageVideoFrame(stageVideo, 320); } catch (_) {}
          if (isStaleRequest()) return;
          const nextSlot = Number(podcastVideoState.stageVideoSlot || 0) === 1 ? 0 : 1;
          try { setActiveStageVideoSlot(nextSlot); } catch (_) {}
          stageVideo.hidden = false;
          stageVideo.style.opacity = "";
          stageVideo.style.pointerEvents = "";
          previousStageVideoEl.style.opacity = "0";
          previousStageVideoEl.style.pointerEvents = "none";
          try { previousStageVideoEl.pause(); } catch (_) {}
          previousStageVideoEl.hidden = true;
          clearStageVideoInlineStyles(previousStageVideoEl);
          clearStageVideoInlineStyles(stageVideo);
          pendingDoubleBufferSwap = false;
        }
        // Solo armamos el auto-unmute cuando realmente iniciamos/reiniciamos playback en muted.
        // (no en cada tick) para no invalidar el intento anterior.
        const shouldArmUnmute = Boolean(
          podcastVideoState.montageActive
          && desiredVeoVolume > 0
          && shouldStartMuted
          && stageVideo.muted === true
        );
        if (shouldArmUnmute) {
          const armKey = `${String(podcastVideoState.montageToken || "")}:${rowId}:${String(src || "").slice(0, 220)}`;
          if (armKey && armKey !== lastStageVideoUnmuteArmKey) {
            lastStageVideoUnmuteArmKey = armKey;
            armStageVideoAudibleAfterPlay(stageVideo, { isStaleRequest, timeoutMs: 750 });
          }
        }
      } else if (!stageVideo.paused) {
        try { stageVideo.pause(); } catch (_) {}
        const activeBackdrop = resolveStageVideoBundleForForeground(stageVideo)?.backdrop || null;
        if (activeBackdrop && !activeBackdrop.paused) {
          try { activeBackdrop.pause(); } catch (_) {}
        }
      }
      }
    } else {
      syncPodcastVideoStageMedia(session, rowId);
      const stageVideo = resolveStageVideoEl(true);
      if (stageVideo && !stageVideo.paused) {
        try { stageVideo.pause(); } catch (_) {}
      }
    }

    // Scrub preview: al mover el playhead (sin montaje activo), reproduce audio.
    // - En `gemini-live-per-scene`, el audio "manda" por `geminiDialogueTrack` (chips del subtrack),
    //   así que el preview debe respetar `segment.startMs` (no el `startMs` del clip visual).
    // - En otros modos, mantenemos el preview por escena (audio guardado del clip).
    if (podcastVideoState.montageActive || !shouldAutoplay) {
      stopPreviewSceneAudio();
    } else {
      const audioMode = String(cfg.audioMode || "gemini-live-per-scene").trim();
      const wantsGeminiTimelinePreview = audioMode === "gemini-live-per-scene"
        && cfg?.geminiDialogueTrack?.enabled === true
        && Array.isArray(cfg?.geminiDialogueTrack?.segments)
        && cfg.geminiDialogueTrack.segments.length > 0;

      if (wantsGeminiTimelinePreview) {
        try { syncGeminiDialogueTrackWithRuntime?.({ render: false, preserveStartMs: true }); } catch (_) {}
        const voiceEntries = buildMontageVoiceTimelineEntries(cfg, runtimeEntries);
        const activeVoiceEntries = Array.isArray(voiceEntries)
          ? voiceEntries.filter((entry) => Number(currentMs || 0) >= Number(entry?.startMs || 0) && Number(currentMs || 0) < Number(entry?.endMs || 0))
          : [];
        const selected = activeVoiceEntries
          .slice()
          .sort((a, b) => Number(b.startMs || 0) - Number(a.startMs || 0) || Number(b.zIndex || 0) - Number(a.zIndex || 0))[0] || null;
        const selectedRowId = String(selected?.rowId || "").trim();
        const srcAudio = resolveFreshVoiceAudioSrc(selected, selected);
        const clip = selected?.clip && typeof selected.clip === "object" ? selected.clip : null;
        const baseGeminiVolumePct = Math.max(0, Math.min(100, toFiniteNumber(cfg.montageDefaultGeminiVolumePct, 100)));
        const overridePctRaw = toFiniteNumber(clip?.geminiVolumeOverridePct, Number.NaN);
        const effectivePct = Number.isFinite(overridePctRaw)
          ? Math.max(0, Math.min(100, overridePctRaw))
          : baseGeminiVolumePct;
        const voiceGain = Math.max(0, Math.min(1, effectivePct / 100));
        const effectiveVolume = Math.max(0, Math.min(1, masterVolume * voiceGain));
        const isSegmentAligned = String(selected?.audioAlign || "").trim() === "segment";
        const trimInMsVoice = isSegmentAligned ? 0 : Math.max(0, Number(clip?.trimInMs || 0));
        const trimOutMsVoice = isSegmentAligned
          ? Math.max(trimInMsVoice + STUDIO_TIMELINE_MIN_CLIP_MS, trimInMsVoice + Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Number(selected?.effectiveDurationMs || 0) || (Number(selected?.endMs || 0) - Number(selected?.startMs || 0)) || 0))
          : Math.max(trimInMsVoice + STUDIO_TIMELINE_MIN_CLIP_MS, Number(clip?.trimOutMs || trimInMsVoice + STUDIO_TIMELINE_MIN_CLIP_MS));
        const entryElapsedMs = selected ? Math.max(0, Number(currentMs || 0) - Number(selected.startMs || 0)) : 0;
        const rawOffsetMs = trimInMsVoice + entryElapsedMs;
        const clampedOffsetMs = Math.max(trimInMsVoice, Math.min(Math.max(trimInMsVoice, trimOutMsVoice - 1), rawOffsetMs));
        const offsetSecVoice = Math.max(0, clampedOffsetMs / 1000);
        const audioDurationSec = Math.max(0, Number(selected?.audioDurationMs || 0) / 1000);
        const offsetWithinAudio = audioDurationSec > 0
          ? Math.max(0, Math.min(Math.max(0, audioDurationSec - 0.04), offsetSecVoice))
          : offsetSecVoice;
        const audioEndReached = audioDurationSec > 0 && offsetWithinAudio >= Math.max(0, audioDurationSec - 0.06);

        if (!selectedRowId || !srcAudio || effectiveVolume <= 0.0001 || audioEndReached) {
          stopPreviewSceneAudio();
        } else {
          const speed = Math.max(0.5, Math.min(1.8, Number(els.podcastVideoSpeedSelect?.value || 1)));
          const shouldSwap = previewSceneAudioRowId !== selectedRowId || previewSceneAudioSrc !== srcAudio || !previewSceneAudio;
          if (shouldSwap) {
            stopPreviewSceneAudio();
            previewSceneAudio = createPreviewSceneAudio(srcAudio, selectedRowId);
            if (!previewSceneAudio) {
              stopPreviewSceneAudio();
              return;
            }
            previewSceneAudioRowId = selectedRowId;
            previewSceneAudioSrc = srcAudio;
            previewSceneAudio.volume = effectiveVolume;
            previewSceneAudio.playbackRate = speed;
            try { previewSceneAudio.currentTime = offsetWithinAudio; } catch (_) {}
            previewSceneAudio.play().catch(() => {});
          } else {
            try {
              if (typeof resolvePodcastStageAudioSrc === "function" && previewSceneAudio?.__podcasterObjectUrlCacheKey) {
                resolvePodcastStageAudioSrc(previewSceneAudio.__podcasterObjectUrlCacheKey);
              }
            } catch (_) {}
            previewSceneAudio.volume = effectiveVolume;
            previewSceneAudio.playbackRate = speed;
            const currentAudioTime = Number(previewSceneAudio.currentTime || 0);
            const drift = Math.abs(currentAudioTime - offsetWithinAudio);
            if (drift > 0.35) {
              try { previewSceneAudio.currentTime = offsetWithinAudio; } catch (_) {}
            }
            if (previewSceneAudio.paused) {
              previewSceneAudio.play().catch(() => {});
            }
          }
        }
      } else if (hasSceneAudio && !useNativeVideoAudio) {
        const srcAudio = String(visualEntry?.audioSrc || "").trim();
        const audioDurationSec = Math.max(0, Number(visualEntry?.audioDurationMs || 0) / 1000);
        const offsetWithinAudio = audioDurationSec > 0
          ? Math.max(0, Math.min(Math.max(0, audioDurationSec - 0.04), offsetSec))
          : offsetSec;
        const audioEndReached = audioDurationSec > 0 && offsetWithinAudio >= Math.max(0, audioDurationSec - 0.06);
        if (!srcAudio || audioEndReached) {
          stopPreviewSceneAudio();
        } else {
          const speed = Math.max(0.5, Math.min(1.8, Number(els.podcastVideoSpeedSelect?.value || 1)));
          const shouldSwap = previewSceneAudioRowId !== rowId || previewSceneAudioSrc !== srcAudio || !previewSceneAudio;
          if (shouldSwap) {
            stopPreviewSceneAudio();
            previewSceneAudio = createPreviewSceneAudio(srcAudio, rowId);
            if (!previewSceneAudio) {
              stopPreviewSceneAudio();
              return;
            }
            previewSceneAudioRowId = rowId;
            previewSceneAudioSrc = srcAudio;
            previewSceneAudio.volume = masterVolume;
            previewSceneAudio.playbackRate = speed;
            try { previewSceneAudio.currentTime = offsetWithinAudio; } catch (_) {}
            previewSceneAudio.play().catch(() => {});
          } else {
            try {
              if (typeof resolvePodcastStageAudioSrc === "function" && previewSceneAudio?.__podcasterObjectUrlCacheKey) {
                resolvePodcastStageAudioSrc(previewSceneAudio.__podcasterObjectUrlCacheKey);
              }
            } catch (_) {}
            previewSceneAudio.volume = masterVolume;
            previewSceneAudio.playbackRate = speed;
            const currentAudioTime = Number(previewSceneAudio.currentTime || 0);
            const drift = Math.abs(currentAudioTime - offsetWithinAudio);
            if (drift > 0.35) {
              try { previewSceneAudio.currentTime = offsetWithinAudio; } catch (_) {}
            }
            if (previewSceneAudio.paused) {
              previewSceneAudio.play().catch(() => {});
            }
          }
        }
      } else {
        stopPreviewSceneAudio();
      }
    }
    podcastVideoState.montageLastVisualRowId = rowId;
  }

  async function playPodcastStudioMontage(startAtMs = null) {
    const session = getActiveSession();
    const allEntries = buildTimelineRuntimeEntries(session);
    const entries = allEntries;
    if (!entries.length) return;

    // Intento preferente: motor MSE (un solo <video>), fallback al motor actual si falla.
    const mse = getMseEngine();
	    if (mse && mse.isSupported?.()) {
	      const cfg = getPodcastVideoConfig(session);
      const speed = Math.max(0.5, Math.min(1.8, Number(els.podcastVideoSpeedSelect?.value || 1)));
      const durationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, getTimelineTotalDurationMs(session));
      const initialMs = Number.isFinite(Number(startAtMs))
        ? Math.max(0, Math.min(durationMs, Number(startAtMs)))
        : Math.max(0, Math.min(durationMs, Number(podcastVideoState.montageCursorMs || 0)));
	      try {
          mseRuntimeEntries = entries;
	        mse.loadTimeline(entries);
	        mse.setRate(speed);
        const masterVolume = Math.max(0, Math.min(1, toFiniteNumber(cfg.masterVolume, 100) / 100));
        const voiceVolume = Math.max(0, Math.min(1, toFiniteNumber(cfg.montageDefaultGeminiVolumePct, 100) / 100));
        mse.setVolumes({ master: masterVolume, voice: voiceVolume, veo: 0 });

        try { setTimelinePreviewsSuspended?.(true); } catch (_) {}
        stopPodcastStudioMontage({ keepStatus: true, keepCursor: true });
        const token = Date.now();
        podcastVideoState.montageToken = token;
        podcastVideoState.montageActive = true;
        podcastVideoState.montagePaused = false;
        podcastVideoState.mseEngineActive = true;
        mseLastRuntimeRowId = "";
        podcastVideoState.montageCursorMs = initialMs;
        syncPodcastTimelinePlayhead(session);
        setPodcastVideoStatus("Reproduciendo (MSE)...");
        updatePodcastVideoTransportUi();

        const result = await mse.play(initialMs);
        if (result?.ok) {
          return;
        }
      } catch (_) {
        // Fallback abajo.
      }
      // Si falló: limpiar y continuar con motor actual.
      podcastVideoState.mseEngineActive = false;
      mseLastRuntimeRowId = "";
      try { mse.destroy?.(); } catch (_) {}
      mseEngine = null;
    }

    try { setTimelinePreviewsSuspended?.(true); } catch (_) {}
    stopPodcastStudioMontage({ keepStatus: true, keepCursor: true });
    const durationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, getTimelineTotalDurationMs(session));
    const speed = Math.max(0.5, Math.min(1.8, Number(els.podcastVideoSpeedSelect?.value || 1)));
    const initialMs = Number.isFinite(Number(startAtMs))
      ? Math.max(0, Math.min(durationMs, Number(startAtMs)))
      : Math.max(0, Math.min(durationMs, Number(podcastVideoState.montageCursorMs || 0)));
    const token = Date.now();
    podcastVideoState.montageToken = token;
    podcastVideoState.montageActive = true;
    podcastVideoState.montagePaused = false;
    // Montaje escena-por-escena: audio de una sola escena a la vez (evita duplicados).
    podcastVideoState.montageStageMode = "single";
    // Pero habilitamos doble buffer de VIDEO si existe el slot alterno, para que el cambio de escena
    // no recargue el `src` en el mismo <video> (eso es lo que provoca el corte).
    podcastVideoState.montageStageDoubleBuffer = Boolean(els?.podcastActiveSpeakerVideoAlt);
    podcastVideoState.montageCursorMs = initialMs;
    syncPodcastTimelinePlayhead(session);
    setPodcastVideoStatus("Reproduciendo montaje...");
    updatePodcastVideoTransportUi();
    try { ensureActiveStageVideoVisible(resolveStageVideoEl(true)); } catch (_) {}

    const resolveFrameState = (cursorMs = 0) => {
      const normalizedCursor = Math.max(0, Math.min(durationMs, Number(cursorMs || 0)));
      let active = entries.filter((entry) => normalizedCursor >= entry.startMs && normalizedCursor < entry.endMs);
      // Si hay un gap pequeño entre clips (por snapping/redondeos), evita un frame "vacío" que
      // pausaría video+audio y produce un corte perceptible.
      if (!active.length) {
        const nearestPrevious = entries
          .filter((entry) => Number(entry?.endMs || 0) <= normalizedCursor)
          .sort((a, b) => Number(b.endMs || 0) - Number(a.endMs || 0))[0] || null;
        const gapFromPrevMs = nearestPrevious ? Math.max(0, normalizedCursor - Number(nearestPrevious.endMs || 0)) : Number.POSITIVE_INFINITY;
        const nearestUpcoming = entries
          .filter((entry) => Number(entry?.startMs || 0) >= normalizedCursor)
          .sort((a, b) => Number(a.startMs || 0) - Number(b.startMs || 0))[0] || null;
        const gapToNextMs = nearestUpcoming ? Math.max(0, Number(nearestUpcoming.startMs || 0) - normalizedCursor) : Number.POSITIVE_INFINITY;
        // Preferimos “congelar” el último frame del clip previo (offset clamped) para no adelantar
        // el siguiente clip. Solo si no hay previo cercano usamos el próximo.
        if (nearestPrevious && gapFromPrevMs <= 200) {
          active = [nearestPrevious];
        } else if (nearestUpcoming && gapToNextMs <= 160) {
          active = [nearestUpcoming];
        }
      }
      return {
        cursorMs: normalizedCursor,
        activeEntries: active,
        completed: normalizedCursor >= durationMs - 10
      };
    };

    // Warmup: intenta iniciar audio/video bajo el gesto del usuario (evita "primer play" trabado).
    // - Precarga 1-2 videos próximos
    // - Dispara voz + música sin awaits para no perder user-activation
    // - Dispara preview async en background
    try {
      const upcoming = entries
        .filter((entry) => Number(entry?.startMs || 0) >= initialMs)
        .slice(0, 3);
      upcoming.forEach((entry) => {
        const src = String(entry?.videoSrc || "").trim();
        if (!src) return;
        primePodcastStageVideoSource(src).catch(() => {});
      });
    } catch (_) {}

    const initialFrame = resolveFrameState(initialMs);
    try {
      syncMontageAudioPlayers(initialFrame.activeEntries, initialFrame.cursorMs, speed, entries);
    } catch (_) {}
    try {
      syncMontageBackgroundMusic(initialFrame.cursorMs, speed).catch(() => {});
    } catch (_) {}
    try {
      const firstVisual = initialFrame.activeEntries.find((entry) => String(entry?.videoSrc || "").trim()) || null;
      if (firstVisual) {
        if (typeof setActiveStageVideoSlot === "function") setActiveStageVideoSlot(0);
        const stageVideo = resolveStageVideoEl(true);
        const inactiveVideo = resolveStageVideoEl(false);
        if (!stageVideo) return;
        if (inactiveVideo && inactiveVideo !== stageVideo) {
          try { inactiveVideo.pause(); } catch (_) {}
          inactiveVideo.hidden = true;
          clearStageVideoInlineStyles(inactiveVideo);
          try { inactiveVideo.removeAttribute("src"); } catch (_) {}
          try { delete inactiveVideo.dataset.src; } catch (_) {}
        }
        const rowId = String(firstVisual?.rowId || "").trim();
        const src = String(firstVisual?.videoSrc || "").trim();
        const cfg = getPodcastVideoConfig(session);
        const clipMap = typeof ensureTimelineClipsByRowId === "function"
          ? ensureTimelineClipsByRowId(session, { persist: false })
          : {};
        const clipCfg = clipMap?.[rowId] || null;
        const veoOverridePctRaw = toFiniteNumber(clipCfg?.veoVolumeOverridePct, Number.NaN);
        const baseVeoPct = Math.max(0, Math.min(100, toFiniteNumber(cfg.montageDefaultVeoVolumePct, 0)));
        const effectiveVeoPct = Number.isFinite(veoOverridePctRaw)
          ? Math.max(0, Math.min(100, veoOverridePctRaw))
          : baseVeoPct;
        const keepVideoAudioAudible = isEducationalSession(session) || effectiveVeoPct > 0;
        const desiredVeoVolume = keepVideoAudioAudible ? Math.max(0, Math.min(1, effectiveVeoPct / 100)) : 0;
        stageVideo.preload = "auto";
        stageVideo.playbackRate = speed;
        stageVideo.volume = desiredVeoVolume;
        // Durante montaje iniciamos en muted (autoplay-friendly) y desmuteamos cuando esté en `playing`.
        try { stageVideo.muted = desiredVeoVolume > 0; } catch (_) {}
        if (String(stageVideo.dataset?.src || "").trim() !== src) {
          stageVideo.dataset.src = src;
          stageVideo.src = src;
          try { stageVideo.load(); } catch (_) {}
        }
        const trimInMs = Math.max(0, Number(firstVisual?.clip?.trimInMs || 0));
        const trimOutMs = Math.max(trimInMs + STUDIO_TIMELINE_MIN_CLIP_MS, Number(firstVisual?.clip?.trimOutMs || trimInMs + STUDIO_TIMELINE_MIN_CLIP_MS));
        const visualElapsedMs = Math.max(0, Number(initialFrame.cursorMs || 0) - Number(firstVisual.startMs || 0));
        const rawOffsetMs = trimInMs + visualElapsedMs;
        const clampedOffsetMs = Math.max(trimInMs, Math.min(Math.max(trimInMs, trimOutMs - 1), rawOffsetMs));
        const offsetSec = Math.max(0, clampedOffsetMs / 1000);
        try { stageVideo.currentTime = offsetSec; } catch (_) {}
        stageVideo.play().catch(() => {});
        if (podcastVideoState.montageActive && desiredVeoVolume > 0) {
          armStageVideoAudibleAfterPlay(stageVideo);
        }

        // El lookahead/swap del video alterno lo maneja `syncStudioTimelinePreview` durante el montaje.
      }
    } catch (_) {}
    syncStudioTimelinePreview(initialFrame.cursorMs, entries, initialFrame.activeEntries).catch(() => {});
    if (!podcastVideoState.montageActive || podcastVideoState.montageToken !== token) return;

    let perfStart = performance.now() - (initialMs / speed);
    let previewSyncBusy = false;
    let pendingPreviewSync = null;
    const flushPreviewSync = () => {
      if (previewSyncBusy || !pendingPreviewSync) return;
      const payload = pendingPreviewSync;
      pendingPreviewSync = null;
      previewSyncBusy = true;
      syncStudioTimelinePreview(payload.currentMs, entries, payload.activeEntries)
        .catch(() => {})
        .finally(() => {
          previewSyncBusy = false;
          if (pendingPreviewSync) flushPreviewSync();
        });
    };
    const schedulePreviewSync = (currentMs = 0, activeEntries = []) => {
      pendingPreviewSync = {
        currentMs: Number(currentMs || 0),
        activeEntries: Array.isArray(activeEntries) ? activeEntries : []
      };
      flushPreviewSync();
    };
    let backgroundSyncBusy = false;
    let pendingBackgroundSync = null;
    const flushBackgroundSync = () => {
      if (backgroundSyncBusy || !pendingBackgroundSync) return;
      const payload = pendingBackgroundSync;
      pendingBackgroundSync = null;
      backgroundSyncBusy = true;
      syncMontageBackgroundMusic(payload.currentMs, payload.speed)
        .catch(() => {})
        .finally(() => {
          backgroundSyncBusy = false;
          if (pendingBackgroundSync) flushBackgroundSync();
        });
    };
    const scheduleBackgroundSync = (currentMs = 0, currentSpeed = 1) => {
      pendingBackgroundSync = {
        currentMs: Number(currentMs || 0),
        speed: Math.max(0.5, Math.min(1.8, Number(currentSpeed || 1)))
      };
      flushBackgroundSync();
    };
    const tick = async () => {
      let completed = false;
      try {
        if (!podcastVideoState.montageActive || podcastVideoState.montageToken !== token) return;
        if (podcastVideoState.montagePaused) return;
        const elapsedMs = Math.max(0, (performance.now() - perfStart) * speed);
        const rawCurrentMs = Math.max(0, Math.min(durationMs, elapsedMs));
        const frame = resolveFrameState(rawCurrentMs);
        const currentMs = frame.cursorMs;
        const activeEntries = frame.activeEntries;
        podcastVideoState.montageCursorMs = currentMs;
        syncPodcastTimelinePlayhead(session);
        schedulePreviewSync(currentMs, activeEntries);
        syncMontageAudioPlayers(activeEntries, currentMs, speed, entries);
        scheduleBackgroundSync(currentMs, speed);
        if (els.podcastStudioScrubber && durationMs > 0) {
          const ratio = Math.max(0, Math.min(1, currentMs / durationMs));
          els.podcastStudioScrubber.value = String(Math.round(ratio * 100));
        }
        if (els.podcastStudioTime) {
          els.podcastStudioTime.textContent = `${secondsToClock(currentMs / 1000)} / ${secondsToClock(durationMs / 1000)}`;
        }
        if (frame.completed || currentMs >= durationMs - 10) {
          completed = true;
          stopPodcastStudioMontage({ keepStatus: true });
          setPodcastVideoStatus("Montaje completado");
        }
      } catch (error) {
        const recoverMs = Math.max(0, Math.min(durationMs, Number(podcastVideoState.montageCursorMs || 0) + STUDIO_TIMELINE_SNAP_MS));
        podcastVideoState.montageCursorMs = recoverMs;
        perfStart = performance.now() - (recoverMs / speed);
        try {
          console.warn("[podcaster][montage] tick error", error);
        } catch (_) {
          // noop
        }
      } finally {
        if (completed) return;
        if (!podcastVideoState.montageActive || podcastVideoState.montageToken !== token) return;
        podcastVideoState.montageRafId = requestAnimationFrame(() => tick().catch(() => {}));
      }
    };
    podcastVideoState.montageRafId = requestAnimationFrame(() => tick().catch(() => {}));
  }

  return {
    stopPodcastStudioMontage,
    pausePodcastStudioMontage,
    syncMontageAudioPlayers,
    syncMontageBackgroundAt: (currentMs = 0, speed = 1) => syncMontageBackgroundMusic(currentMs, speed),
    pauseMontageBackgroundAudio: () => {
      if (!montageBackgroundAudio) return;
      try { montageBackgroundAudio.pause(); } catch (_) {}
    },
    stopMontageBackgroundAudio: () => {
      stopMontageBackgroundMusic();
    },
    syncStudioTimelinePreview,
    playPodcastStudioMontage,
    stopScrubPreview,
    refreshMontageBackgroundAudio: () => {
      if (!podcastVideoState.montageActive || podcastVideoState.montagePaused) return;
      const speed = Math.max(0.5, Math.min(1.8, Number(els.podcastVideoSpeedSelect?.value || 1)));
      syncMontageBackgroundMusic(Number(podcastVideoState.montageCursorMs || 0), speed).catch(() => {});
    }
  };
}
