export function createPodcasterStudioPlayback(deps = {}) {
  const {
    els,
    podcastVideoState,
    STUDIO_TIMELINE_MIN_CLIP_MS,
    STUDIO_TIMELINE_SNAP_MS,
    getActiveSession,
    getPodcastVideoConfig,
    toFiniteNumber,
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
    buildTimelineRuntimeEntries,
    getTimelineTotalDurationMs,
    getPanelMontageMusicConfig
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
  const MONTAGE_BACKGROUND_FADE_MS = 420;
  let montageBackgroundLoopTrimInSec = 0;
  let montageBackgroundLoopTrimOutSec = 0;

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
    const finalVolume = clamp01(targetVolume) * clamp01(envelope);
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
    const sourceType = String(panelCfg?.sourceType || "").trim() === "track" ? "track" : "preset";
    const sourceItems = Array.isArray(panelCfg?.sourceItems) ? panelCfg.sourceItems : [];
    const preset = ["ambient", "focus", "pulse"].includes(String(panelCfg?.preset || "").trim())
      ? String(panelCfg.preset).trim()
      : "ambient";
    const src = String(panelCfg?.sourceUrl || "").trim();
    if (sourceType === "track" && !src && !sourceItems.length) {
      stopMontageBackgroundMusic();
      return;
    }
    const session = getActiveSession();
    const studioCfg = getPodcastVideoConfig(session);
    const masterVolume = Math.max(0, Math.min(1, toFiniteNumber(studioCfg.masterVolume, 100) / 100));
    const panelVolume = Math.max(0, Math.min(1, toFiniteNumber(panelCfg?.volume, 22) / 100));
    const targetVolume = masterVolume * panelVolume;
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
      const finalVolume = clamp01(targetVolume) * envelope;
      if (!montageBackgroundCtx) {
        montageBackgroundAudio.volume = finalVolume;
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
      applyMontageBackgroundVolume(targetVolume, envelope);
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
        const effectiveVolume = mutedLoopIndexes.has(loopIndex) ? 0 : clamp01(targetVolume) * envelope;
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
        montageBackgroundAudio.volume = targetVolume;
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
    const keepStatus = options.keepStatus === true;
    const keepPaused = options.keepPaused === true;
    const keepCursor = options.keepCursor === true;
    const forceResetToStart = options.forceResetToStart !== false;
    podcastVideoState.montageActive = false;
    podcastVideoState.montagePaused = keepPaused;
    podcastVideoState.montageToken = 0;
    podcastVideoState.montageLastVisualRowId = "";
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
    if (els.podcastActiveSpeakerVideo) {
      try { els.podcastActiveSpeakerVideo.pause(); } catch (_) {}
      if (!keepCursor && forceResetToStart) {
        try { els.podcastActiveSpeakerVideo.currentTime = 0; } catch (_) {}
      }
    }
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

  function pausePodcastStudioMontage() {
    if (!podcastVideoState.montageActive) return;
    podcastVideoState.montageActive = false;
    podcastVideoState.montagePaused = true;
    if (podcastVideoState.montageRafId) {
      cancelAnimationFrame(podcastVideoState.montageRafId);
      podcastVideoState.montageRafId = 0;
    }
    Object.values(podcastVideoState.montageAudioPlayers || {}).forEach((audio) => {
      try { audio.pause(); } catch (_) {}
    });
    if (montageBackgroundAudio) {
      try { montageBackgroundAudio.pause(); } catch (_) {}
    }
    if (podcastVideoState.audioEl) {
      try { podcastVideoState.audioEl.pause(); } catch (_) {}
    }
    if (els.podcastActiveSpeakerVideo) {
      try { els.podcastActiveSpeakerVideo.pause(); } catch (_) {}
    }
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
      const audio = new Audio(src);
      audio.preload = "auto";
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

  function syncMontageAudioPlayers(activeEntries = [], currentMs = 0, speed = 1, runtimeEntries = []) {
    const cfg = getPodcastVideoConfig(getActiveSession());
    const masterVolume = Math.max(0, Math.min(1, toFiniteNumber(cfg.masterVolume, 100) / 100));
    const nextMap = { ...(podcastVideoState.montageAudioPlayers || {}) };
    const activeIds = new Set(activeEntries.map((entry) => entry.rowId));
    primeMontageAudioEntries(runtimeEntries, currentMs);

    activeEntries.forEach((entry) => {
      const src = String(entry.audioSrc || "").trim();
      if (!src) return;
      const rowId = String(entry.rowId || "").trim();
      if (!rowId) return;
      const trimInMs = Math.max(0, Number(entry?.clip?.trimInMs || 0));
      const trimOutMs = Math.max(trimInMs + STUDIO_TIMELINE_MIN_CLIP_MS, Number(entry?.clip?.trimOutMs || trimInMs + STUDIO_TIMELINE_MIN_CLIP_MS));
      const entryElapsedMs = Math.max(0, Number(currentMs || 0) - Number(entry.startMs || 0));
      const rawOffsetMs = trimInMs + entryElapsedMs;
      const clampedOffsetMs = Math.max(trimInMs, Math.min(Math.max(trimInMs, trimOutMs - 1), rawOffsetMs));
      const isNearSceneStart = entryElapsedMs <= Math.max(180, STUDIO_TIMELINE_SNAP_MS * 2);
      const offsetMs = isNearSceneStart ? trimInMs : clampedOffsetMs;
      const offsetSec = Math.max(0, offsetMs / 1000);
      let audio = nextMap[rowId];
      if (!audio) {
        audio = montageAudioCache[rowId] || new Audio(src);
        audio.preload = "auto";
        audio.volume = masterVolume;
        audio.playbackRate = speed;
        try {
          audio.currentTime = offsetSec;
        } catch (_) {}
        audio.play().catch(() => {});
        nextMap[rowId] = audio;
        montageAudioCache[rowId] = audio;
        return;
      }
      audio.volume = masterVolume;
      audio.playbackRate = speed;
      const drift = Math.abs((Number(audio.currentTime || 0) - offsetSec));
      if (drift > 0.22) {
        try { audio.currentTime = offsetSec; } catch (_) {}
      }
      if (audio.paused) {
        audio.play().catch(() => {});
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
  }

  async function syncStudioTimelinePreview(currentMs = 0, runtimeEntries = [], forcedActiveEntries = null) {
    const session = getActiveSession();
    let activeEntries = Array.isArray(forcedActiveEntries)
      ? forcedActiveEntries.filter(Boolean)
      : runtimeEntries.filter((entry) => currentMs >= entry.startMs && currentMs < entry.endMs);
    if (!Array.isArray(forcedActiveEntries) && !activeEntries.length) {
      const nearestUpcoming = runtimeEntries
        .filter((entry) => Number(entry.startMs || 0) >= currentMs)
        .sort((a, b) => Number(a.startMs || 0) - Number(b.startMs || 0))[0] || null;
      const gapToNextMs = nearestUpcoming ? Math.max(0, Number(nearestUpcoming.startMs || 0) - currentMs) : Number.POSITIVE_INFINITY;
      if (nearestUpcoming && gapToNextMs <= 120) {
        activeEntries = [nearestUpcoming];
      }
    }
    if (!activeEntries.length) {
      if (podcastVideoState.speaking) {
        setPodcastVideoSpeaker(session, podcastVideoState.activeSpeaker || "", { speaking: false, rowId: podcastVideoState.activeRowId });
      }
      if (els.podcastActiveSpeakerVideo && !els.podcastActiveSpeakerVideo.paused) {
        try { els.podcastActiveSpeakerVideo.pause(); } catch (_) {}
      }
      if (els.podcastStudioDipOverlay) {
        els.podcastStudioDipOverlay.classList.remove("is-active");
        els.podcastStudioDipOverlay.style.background = "#020617";
      }
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
    const nextUpcomingEntry = runtimeEntries.find((entry) => Number(entry.startMs || 0) > Number(visualEntry.startMs || 0) && String(entry.videoSrc || "").trim()) || null;
    if (nextUpcomingEntry?.videoSrc) {
      primePodcastStageVideoSource(nextUpcomingEntry.videoSrc).catch(() => {});
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
      syncPodcastStudioRuntimeUi(session, rowId, visualEntry.speakerKey, { speaking: true });
    } else {
      podcastVideoState.activeRowId = rowId;
    }

    const cfg = getPodcastVideoConfig(session);
    const clipVolume = Math.max(0, Math.min(1, toFiniteNumber(cfg.clipVolume, 0) / 100));
    const trimInMs = Math.max(0, Number(visualEntry?.clip?.trimInMs || 0));
    const trimOutMs = Math.max(trimInMs + STUDIO_TIMELINE_MIN_CLIP_MS, Number(visualEntry?.clip?.trimOutMs || trimInMs + STUDIO_TIMELINE_MIN_CLIP_MS));
    const visualElapsedMs = Math.max(0, Number(currentMs || 0) - Number(visualEntry.startMs || 0));
    const rawOffsetMs = trimInMs + visualElapsedMs;
    const clampedOffsetMs = Math.max(trimInMs, Math.min(Math.max(trimInMs, trimOutMs - 1), rawOffsetMs));
    const offsetSec = Math.max(0, clampedOffsetMs / 1000);
    const src = String(visualEntry.videoSrc || "").trim();
    if (src && els.podcastActiveSpeakerVideo) {
      const currentSrc = String(els.podcastActiveSpeakerVideo.dataset.src || "").trim();
      const shouldSwapSource = currentSrc !== src;
      if (podcastVideoState.montageActive && rowChanged && els.podcastStudioDipOverlay) {
        els.podcastStudioDipOverlay.style.background = "#020617";
        els.podcastStudioDipOverlay.classList.add("is-active");
      }
      if (shouldSwapSource) {
        await setPodcastStageVideoSource(src);
      }
      if (podcastVideoState.montageActive && rowChanged && String(previousVisualEntry?.videoSrc || "").trim()) {
        const transition = getTransitionForEdge(session, previousVisualRowId, rowId);
        if (String(transition?.type || "cut").toLowerCase() !== "cut") {
          applyStudioTransition(transition).catch(() => {});
        }
      }
      if (els.podcastStudioDipOverlay) {
        els.podcastStudioDipOverlay.classList.remove("is-active");
        els.podcastStudioDipOverlay.style.background = "#020617";
      }
      const speed = Math.max(0.5, Math.min(1.8, Number(els.podcastVideoSpeedSelect?.value || 1)));
      els.podcastActiveSpeakerVideo.playbackRate = speed;
      els.podcastActiveSpeakerVideo.volume = clipVolume;
      const videoDurationSec = Math.max(0, Number(els.podcastActiveSpeakerVideo.duration || 0));
      const safeOffsetSec = videoDurationSec > 0
        ? Math.max(0, Math.min(Math.max(0, videoDurationSec - 0.04), offsetSec))
        : offsetSec;
      const mustSeekOnSceneChange = Boolean(rowChanged);
      const currentVideoTime = Number(els.podcastActiveSpeakerVideo.currentTime || 0);
      const videoDriftSec = Math.abs(currentVideoTime - safeOffsetSec);
      const videoNeedsRecovery = els.podcastActiveSpeakerVideo.readyState < HTMLMediaElement.HAVE_FUTURE_DATA
        || els.podcastActiveSpeakerVideo.seeking
        || els.podcastActiveSpeakerVideo.paused;
      if (mustSeekOnSceneChange || (videoNeedsRecovery && videoDriftSec > 0.18) || videoDriftSec > 0.42) {
        try { els.podcastActiveSpeakerVideo.currentTime = safeOffsetSec; } catch (_) {}
      }
      if (els.podcastActiveSpeakerVideo.paused) {
        els.podcastActiveSpeakerVideo.play().catch(() => {});
      }
    } else {
      syncPodcastVideoStageMedia(session, rowId);
      if (els.podcastActiveSpeakerVideo && !els.podcastActiveSpeakerVideo.paused) {
        try { els.podcastActiveSpeakerVideo.pause(); } catch (_) {}
      }
      if (els.podcastStudioDipOverlay) {
        els.podcastStudioDipOverlay.classList.remove("is-active");
        els.podcastStudioDipOverlay.style.background = "#020617";
      }
    }
    podcastVideoState.montageLastVisualRowId = rowId;
  }

  async function playPodcastStudioMontage(startAtMs = null) {
    const session = getActiveSession();
    const allEntries = buildTimelineRuntimeEntries(session);
    const entries = allEntries;
    if (!entries.length || podcastVideoState.busy) return;
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
    podcastVideoState.montageCursorMs = initialMs;
    syncPodcastTimelinePlayhead(session);
    setPodcastVideoStatus("Reproduciendo montaje...");
    updatePodcastVideoTransportUi();

    const resolveFrameState = (cursorMs = 0) => {
      const normalizedCursor = Math.max(0, Math.min(durationMs, Number(cursorMs || 0)));
      const active = entries.filter((entry) => normalizedCursor >= entry.startMs && normalizedCursor < entry.endMs);
      if (active.length) {
        return {
          cursorMs: normalizedCursor,
          activeEntries: active,
          jumped: false,
          completed: false
        };
      }
      const nextEntry = entries.find((entry) => Number(entry.startMs || 0) > normalizedCursor) || null;
      if (nextEntry) {
        return {
          cursorMs: Math.max(0, Number(nextEntry.startMs || normalizedCursor)),
          activeEntries: [nextEntry],
          jumped: true,
          completed: false
        };
      }
      const lastEntry = entries[entries.length - 1] || null;
      if (!lastEntry) {
        return {
          cursorMs: normalizedCursor,
          activeEntries: [],
          jumped: false,
          completed: true
        };
      }
      return {
        cursorMs: Math.max(0, Number(lastEntry.endMs || normalizedCursor)),
        activeEntries: [],
        jumped: false,
        completed: true
      };
    };

    let perfStart = performance.now() - (initialMs / speed);
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
        if (frame.jumped) {
          perfStart = performance.now() - (currentMs / speed);
        }
        podcastVideoState.montageCursorMs = currentMs;
        syncPodcastTimelinePlayhead(session);
        await syncStudioTimelinePreview(currentMs, entries, activeEntries);
        if (!podcastVideoState.montageActive || podcastVideoState.montageToken !== token) return;
        syncMontageAudioPlayers(activeEntries, currentMs, speed, entries);
        await syncMontageBackgroundMusic(currentMs, speed);
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
    syncStudioTimelinePreview,
    playPodcastStudioMontage,
    refreshMontageBackgroundAudio: () => {
      if (!podcastVideoState.montageActive || podcastVideoState.montagePaused) return;
      const speed = Math.max(0.5, Math.min(1.8, Number(els.podcastVideoSpeedSelect?.value || 1)));
      syncMontageBackgroundMusic(Number(podcastVideoState.montageCursorMs || 0), speed).catch(() => {});
    }
  };
}
