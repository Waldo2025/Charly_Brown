(function () {
  const state = {
    currentAgentId: 0,
    currentMode: "listening",
    isOpen: false,
    blinkTimer: null,
    browTimer: null,
    gazeTimer: null,
    speakingTimer: null,
    rafId: 0,
    speechText: "",
    visemeFrames: [],
    visemeIndex: 0,
    nextFrameAt: 0,
    currentMouth: "closed",
    energy: 0,
    targetEnergy: 0,
    energyDecayAt: 0,
    audioWindowStartedAt: 0,
    audioWindowEndsAt: 0,
    blinkResetTimer: null,
    browResetTimer: null,
    gazeResetTimer: null,
    currentBrows: "up"
  };

  function els() {
    return {
      modal: document.getElementById("unidadAgentStageModal"),
      visual: document.getElementById("unidadAgentStageVisual"),
      layered: document.getElementById("unidadAgentStageLayered"),
      portrait: document.getElementById("unidadAgentStagePortrait"),
      status: document.getElementById("unidadAgentStageStatus"),
      name: document.getElementById("unidadAgentStageName"),
      text: document.getElementById("unidadAgentStageText")
    };
  }

  function showLayer(group = "", name = "") {
    const { layered } = els();
    if (!layered || !group) return;
    layered.querySelectorAll(`[data-layer-group="${group}"]`).forEach((node) => {
      node.classList.toggle("is-hidden", node.dataset.layerName !== name);
    });
  }

  function setBrows(name = "up") {
    const next = String(name || "up") === "down" ? "down" : "up";
    if (state.currentBrows === next) return;
    showLayer("brows", next);
    state.currentBrows = next;
  }

  function setFaceIdle() {
    showLayer("mouth", "closed");
    showLayer("eyes", "open");
    setBrows("up");
    state.currentMouth = "closed";
  }

  function stopLoop() {
    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.rafId = 0;
  }

  function clearTimers() {
    clearTimeout(state.blinkTimer);
    clearTimeout(state.browTimer);
    clearTimeout(state.gazeTimer);
    clearTimeout(state.blinkResetTimer);
    clearTimeout(state.browResetTimer);
    clearTimeout(state.gazeResetTimer);
    clearTimeout(state.speakingTimer);
    state.blinkTimer = null;
    state.browTimer = null;
    state.gazeTimer = null;
    state.blinkResetTimer = null;
    state.browResetTimer = null;
    state.gazeResetTimer = null;
    state.speakingTimer = null;
  }

  function buildVisemeFrames(text = "") {
    const clean = String(text || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const frames = [];
    const pushFrame = (name = "closed", weight = 1) => {
      const safeName = String(name || "closed").trim() || "closed";
      const safeWeight = Math.max(0.4, Number(weight) || 1);
      const prev = frames[frames.length - 1];
      if (prev && prev.name === safeName) {
        prev.weight += safeWeight;
        return;
      }
      frames.push({ name: safeName, weight: safeWeight });
    };
    for (let i = 0; i < clean.length; i += 1) {
      const ch = clean[i];
      const next = clean[i + 1] || "";
      const prev = clean[i - 1] || "";
      const isRepeatedVowel = /[aeiou]/.test(ch) && ch === next;
      const isInsideLongVowel = /[aeiou]/.test(ch) && ch === prev;
      if (/[mbpv]/.test(ch) && /[aei]/.test(next)) {
        pushFrame("m", 0.95);
        pushFrame("a", 1.05);
        i += 1;
        continue;
      }
      if (/[mbpv]/.test(ch) && /[ou]/.test(next)) {
        pushFrame("m", 0.95);
        pushFrame("uoo", 1.08);
        i += 1;
        continue;
      }
      if (ch === "m" && next === "m") {
        pushFrame("mm", 1.1);
        i += 1;
        continue;
      }
      if (ch === "m") {
        pushFrame("m", 0.9);
        continue;
      }
      if (/[aei]/.test(ch)) {
        pushFrame("a", isRepeatedVowel || isInsideLongVowel ? 1.9 : 1);
        continue;
      }
      if (/[ou]/.test(ch)) {
        pushFrame("uoo", isRepeatedVowel || isInsideLongVowel ? 2 : 1.05);
        continue;
      }
      if (/[,.!?;:]/.test(ch)) {
        pushFrame("closed", 2.8);
        continue;
      }
      if (/\s/.test(ch)) {
        pushFrame("closed", 1.45);
      }
    }
    if (!frames.length || frames[frames.length - 1]?.name !== "closed") pushFrame("closed", 1.6);
    return frames.length ? frames : [{ name: "closed", weight: 1 }];
  }

  function frameDuration(frame = "closed", energy = 0) {
    const boost = Math.max(0, Math.min(1, (energy - 0.015) / 0.05));
    if (frame === "closed") return 86 + ((1 - boost) * 34);
    if (frame === "m" || frame === "mm") return 94 + ((1 - boost) * 28);
    return 108 + ((1 - boost) * 36);
  }

  function adaptiveFrameDuration(now = 0, frameEntry = "closed") {
    const frame = typeof frameEntry === "string" ? frameEntry : frameEntry?.name || "closed";
    const weight = Math.max(0.4, Number(typeof frameEntry === "string" ? 1 : frameEntry?.weight) || 1);
    const fallback = frameDuration(frame, state.energy) * weight;
    const queuedAudioMs = Math.max(0, state.audioWindowEndsAt - now);
    if (queuedAudioMs <= 0) return fallback;

    const remainingUnits = Math.max(1, state.visemeFrames
      .slice(state.visemeIndex)
      .reduce((acc, entry) => acc + Math.max(0.4, Number(entry?.weight) || 1), 0));
    const paced = (queuedAudioMs / remainingUnits) * weight;
    const energyBias = state.energy > 0.045 ? 0.82 : state.energy > 0.024 ? 0.9 : 1;
    const minMs = frame === "closed" ? 92 : 96;
    const maxMs = frame === "closed" ? 420 : 240;
    return Math.max(minMs, Math.min(maxMs, paced * energyBias));
  }

  function pickEnergyDrivenMouth() {
    if (state.energy > 0.075) return "big";
    if (state.energy > 0.05) return Math.random() > 0.5 ? "a" : "uoo";
    if (state.energy > 0.028) return Math.random() > 0.55 ? "m" : "a";
    return Math.random() > 0.6 ? "mm" : "closed";
  }

  function resetEyesForMode(mode = state.currentMode) {
    if (mode === "thinking") {
      showLayer("eyes", Math.random() > 0.5 ? "left" : "right");
      return;
    }
    showLayer("eyes", "open");
  }

  function glanceAround() {
    if (!state.isOpen || state.currentAgentId !== 1) return;
    const roll = Math.random();
    if (state.currentMode === "thinking") {
      showLayer("eyes", roll > 0.5 ? "left" : "right");
      return;
    }
    if (state.currentMode === "speaking" && roll > 0.72) {
      showLayer("eyes", roll > 0.86 ? "right" : "left");
      if (state.gazeResetTimer) clearTimeout(state.gazeResetTimer);
      state.gazeResetTimer = setTimeout(() => {
        if (!state.isOpen || state.currentAgentId !== 1) return;
        resetEyesForMode("speaking");
      }, 180 + Math.random() * 220);
      return;
    }
    if (state.currentMode === "listening" && roll > 0.78) {
      showLayer("eyes", roll > 0.89 ? "right" : "left");
      if (state.gazeResetTimer) clearTimeout(state.gazeResetTimer);
      state.gazeResetTimer = setTimeout(() => {
        if (!state.isOpen || state.currentAgentId !== 1) return;
        resetEyesForMode("listening");
      }, 220 + Math.random() * 260);
    }
  }

  function animateLipSync(now = 0) {
    state.rafId = requestAnimationFrame(animateLipSync);
    if (!state.isOpen || state.currentAgentId !== 1) return;

    const decayFactor = now > state.energyDecayAt ? 0.84 : 0.92;
    state.energy = (state.energy * decayFactor) + (state.targetEnergy * (1 - decayFactor));
    state.targetEnergy *= 0.9;

    if (state.currentMode !== "speaking") return;
    if (now < state.nextFrameAt) return;

    if (state.energy < 0.014) {
      if (state.currentMouth !== "closed") {
        showLayer("mouth", "closed");
        state.currentMouth = "closed";
      }
      state.nextFrameAt = now + 22;
      return;
    }

    const hasFrames = state.visemeIndex < state.visemeFrames.length;
    const nextFrameEntry = hasFrames
      ? state.visemeFrames[state.visemeIndex]
      : { name: pickEnergyDrivenMouth(), weight: state.energy > 0.055 ? 1.2 : 0.8 };
    const nextFrame = typeof nextFrameEntry === "string" ? nextFrameEntry : nextFrameEntry?.name || "closed";
    if (hasFrames && state.visemeIndex < Math.max(0, state.visemeFrames.length - 1)) {
      state.visemeIndex += 1;
    } else if (hasFrames && state.visemeIndex === Math.max(0, state.visemeFrames.length - 1)) {
      state.visemeIndex += 1;
    }
    showLayer("mouth", nextFrame);
    state.currentMouth = nextFrame;
    state.nextFrameAt = now + adaptiveFrameDuration(now, nextFrameEntry);
  }

  function ensureLoop() {
    if (state.rafId) return;
    state.rafId = requestAnimationFrame(animateLipSync);
  }

  function scheduleBlink() {
    clearTimeout(state.blinkTimer);
    state.blinkTimer = setTimeout(() => {
      if (!state.isOpen || state.currentAgentId !== 1) return;
      const mode = state.currentMode;
      const doDoubleBlink = Math.random() > 0.72;
      const blinkDuration = 90 + Math.random() * 55;
      showLayer("eyes", "closed");
      if (state.blinkResetTimer) clearTimeout(state.blinkResetTimer);
      state.blinkResetTimer = setTimeout(() => {
        if (!state.isOpen || state.currentAgentId !== 1) return;
        resetEyesForMode(mode);
        if (doDoubleBlink) {
          state.blinkResetTimer = setTimeout(() => {
            if (!state.isOpen || state.currentAgentId !== 1) return;
            showLayer("eyes", "closed");
            state.blinkResetTimer = setTimeout(() => {
              if (!state.isOpen || state.currentAgentId !== 1) return;
              resetEyesForMode(mode);
            }, 70 + Math.random() * 40);
          }, 80 + Math.random() * 90);
        }
      }, blinkDuration);
      scheduleBlink();
    }, 2100 + Math.random() * 2600);
  }

  function scheduleThinkingGaze() {
    clearTimeout(state.gazeTimer);
    state.gazeTimer = setTimeout(() => {
      if (!state.isOpen || state.currentAgentId !== 1) return;
      glanceAround();
      scheduleThinkingGaze();
    }, 1300 + Math.random() * 2200);
  }

  function scheduleBrows() {
    clearTimeout(state.browTimer);
    const mode = state.currentMode;
    const delay = mode === "speaking"
      ? 170 + Math.random() * 220
      : mode === "thinking"
        ? 220 + Math.random() * 280
        : 900 + Math.random() * 1700;
    state.browTimer = setTimeout(() => {
      if (!state.isOpen || state.currentAgentId !== 1) return;
      const modeNow = state.currentMode;
      const now = performance.now();
      const queuedAudioMs = Math.max(0, state.audioWindowEndsAt - now);
      if (modeNow === "thinking") {
        const down = Math.random() > 0.45;
        setBrows(down ? "down" : "up");
        clearTimeout(state.browResetTimer);
        if (down) {
          state.browResetTimer = setTimeout(() => {
            if (!state.isOpen || state.currentAgentId !== 1 || state.currentMode !== "thinking") return;
            setBrows("up");
          }, 160 + Math.random() * 180);
        }
        scheduleBrows();
        return;
      }
      if (modeNow === "speaking") {
        const expressive = state.energy > 0.025 || queuedAudioMs > 120;
        const down = expressive ? Math.random() > 0.34 : Math.random() > 0.82;
        setBrows(down ? "down" : "up");
        clearTimeout(state.browResetTimer);
        if (down) {
          state.browResetTimer = setTimeout(() => {
            if (!state.isOpen || state.currentAgentId !== 1 || state.currentMode !== "speaking") return;
            setBrows("up");
          }, 90 + Math.random() * 120);
        }
        scheduleBrows();
        return;
      }
      const accent = Math.random() > 0.9;
      if (accent) {
        setBrows("down");
        clearTimeout(state.browResetTimer);
        state.browResetTimer = setTimeout(() => {
          if (!state.isOpen || state.currentAgentId !== 1 || state.currentMode !== "listening") return;
          setBrows("up");
        }, 100 + Math.random() * 120);
      } else {
        setBrows("up");
      }
      scheduleBrows();
    }, delay);
  }

  function setMode(mode = "listening", detail = "") {
    const { visual, status, text } = els();
    if (!visual) return;
    const safeMode = ["listening", "thinking", "speaking"].includes(mode) ? mode : "listening";
    state.currentMode = safeMode;
    visual.dataset.state = safeMode;
    if (status) {
      status.textContent = safeMode === "speaking"
        ? "Hablando"
        : safeMode === "thinking"
          ? "Pensando"
          : "Escuchando";
    }
    if (text && detail) text.textContent = detail;
    if (state.currentAgentId !== 1) return;
    if (state.browResetTimer) clearTimeout(state.browResetTimer);
    if (safeMode === "thinking") {
      showLayer("mouth", Math.random() > 0.5 ? "m" : "mm");
      resetEyesForMode("thinking");
      setBrows("down");
      state.currentMouth = "m";
      return;
    }
    if (safeMode === "speaking") {
      resetEyesForMode("speaking");
      setBrows("up");
      if (!state.visemeFrames.length) state.visemeFrames = [{ name: "closed", weight: 1 }];
      return;
    }
    setFaceIdle();
  }

  function prepareSpeech(text = "") {
    state.speechText = String(text || "").trim();
    state.visemeFrames = buildVisemeFrames(state.speechText);
    state.visemeIndex = 0;
    state.nextFrameAt = 0;
    state.audioWindowStartedAt = 0;
    state.audioWindowEndsAt = 0;
  }

  function updateSpeechText(text = "") {
    const nextText = String(text || "").trim();
    if (!nextText) return;
    const prevText = state.speechText;
    if (nextText === prevText) return;

    const prevCount = Math.max(1, state.visemeFrames.length);
    const prevIndex = Math.max(0, Math.min(state.visemeIndex, prevCount - 1));
    const progress = prevCount > 1 ? (prevIndex / prevCount) : 0;

    state.speechText = nextText;
    state.visemeFrames = buildVisemeFrames(nextText);
    const nextCount = Math.max(1, state.visemeFrames.length);

    if (prevText && nextText.startsWith(prevText)) {
      state.visemeIndex = Math.min(nextCount - 1, prevIndex);
    } else {
      state.visemeIndex = Math.min(nextCount - 1, Math.round(progress * nextCount));
    }
  }

  function onPcmSamples(samples, meta = {}) {
    if (!samples || state.currentAgentId !== 1) return;
    let sum = 0;
    const len = Math.min(samples.length, 2048);
    for (let i = 0; i < len; i += 1) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / Math.max(1, len));
    const now = performance.now();
    const durationMs = Math.max(24, Number(meta?.durationMs) || ((samples.length / 24000) * 1000));
    const startInMs = Math.max(0, Number(meta?.startInMs) || 0);
    const endInMs = Math.max(startInMs + durationMs, Number(meta?.endInMs) || (startInMs + durationMs));

    state.targetEnergy = Math.max(state.targetEnergy, rms);
    state.energyDecayAt = now + Math.max(44, Math.min(140, durationMs));
    syncSpeakingActivity(endInMs + 260);
    if (!state.audioWindowStartedAt || now > (state.audioWindowEndsAt + 120)) {
      state.audioWindowStartedAt = now + startInMs;
      state.audioWindowEndsAt = now + endInMs;
      return;
    }
    state.audioWindowStartedAt = Math.min(state.audioWindowStartedAt, now + startInMs);
    state.audioWindowEndsAt = Math.max(state.audioWindowEndsAt, now + endInMs);
  }

  function syncSpeakingActivity(ms = 900) {
    setMode("speaking");
    clearTimeout(state.speakingTimer);
    state.speakingTimer = setTimeout(() => {
      if (state.isOpen) setMode("listening");
    }, Math.max(900, Number(ms) || 900));
  }

  function open(agentId = 0, options = {}) {
    const { modal, visual, layered, portrait, name, text } = els();
    if (!modal || !visual) return false;
    const id = Number(agentId) || 0;
    state.isOpen = true;
    state.currentAgentId = id;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    visual.dataset.agentId = String(id);
    if (name) name.textContent = String(options?.name || `Agente ${id}`).trim();
    if (text) text.textContent = "Lista para trabajar contigo.";
    const useLayers = id === 1;
    layered?.classList.toggle("is-hidden", !useLayers);
    portrait?.classList.toggle("is-hidden", useLayers);
    if (portrait) {
      portrait.src = encodeURI(String(options?.portrait || "agentePrimero.png"));
      portrait.alt = String(options?.name || `Agente ${id}`).trim();
    }
    clearTimers();
    ensureLoop();
    scheduleBlink();
    scheduleThinkingGaze();
    scheduleBrows();
    setMode("listening");
    return true;
  }

  function close() {
    const { modal } = els();
    if (!modal) return false;
    state.isOpen = false;
    clearTimers();
    setFaceIdle();
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    return true;
  }

  function getMode() {
    return state.currentMode || "listening";
  }

  function init() {
    const { modal } = els();
    if (!modal || modal.dataset.ready === "true") return;
    modal.dataset.ready = "true";
    modal.addEventListener("click", (event) => {
      const target = event.target?.closest?.("[data-action='close-agent-stage']");
      if (target) close();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && state.isOpen) close();
    });
    ensureLoop();
  }

  window.UnidadAgentStage = {
    init,
    open,
    close,
    setMode,
    getMode,
    prepareSpeech,
    updateSpeechText,
    onPcmSamples,
    syncSpeakingActivity
  };
})();
