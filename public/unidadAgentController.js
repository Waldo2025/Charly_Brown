const PERSONAS_DEFAULT = {
  1: { id: "agente_1", nombre: "Sofia", genero: "female", portrait: "agentePrimero.png", voiceName: "Aoede", mood: "entusiasta", locale: "es-MX", speed: .92, pitch: 1.08, descripcion: "Amable, práctica y creativa para guiar actividades didácticas." },
  2: { id: "agente_2", nombre: "Valeria", genero: "female", portrait: "agenteSegundo.png", voiceName: "Kore", mood: "profesional", locale: "es-MX", speed: 1.0, pitch: 1.0, descripcion: "Ordenada y clara para organizar pasos y decisiones pedagógicas." },
  3: { id: "agente_3", nombre: "Mateo", genero: "male", portrait: "agenteTercero.png", voiceName: "Orus", mood: "analitico", locale: "es-MX", speed: 0.98, pitch: 0.92, descripcion: "Analítico y preciso para explicar criterios y estructura académica." },
  4: { id: "agente_4", nombre: "Elena", genero: "female", portrait: "agenteCuarto.png", voiceName: "Leda", mood: "empatico", locale: "es-MX", speed: 0.99, pitch: 1.06, descripcion: "Empática y motivadora para acompañar el proceso con cercanía." },
  5: { id: "agente_5", nombre: "Bruno", genero: "male", portrait: "agenteQuinto.png", voiceName: "Puck", mood: "sereno", locale: "es-MX", speed: 0.97, pitch: 0.88, descripcion: "Sereno y metódico para mantener foco y claridad en los objetivos." },
  6: { id: "agente_6", nombre: "Camila", genero: "female", portrait: "agentesexto.png", voiceName: "Zephyr", mood: "entusiasta", locale: "es-MX", speed: 1.03, pitch: 1.12, descripcion: "Energética y resolutiva para impulsar avance y creatividad." }
};

const STORAGE_KEY = "cb_unidad_agent_state_v2";
const AgentSpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
const GRADE_MAP = {
  1: "Primero",
  2: "Segundo",
  3: "Tercero",
  4: "Cuarto",
  5: "Quinto",
  6: "Sexto"
};

function createBaseState(agentId = 0) {
  return {
    agentId,
    nivel: "Primaria",
    grado: GRADE_MAP[agentId] || "",
    trimestre: "",
    unidad: "",
    flow: "idle",
    step: "await_action",
    pendingIntent: "",
    pendingReadingAction: null,
    readingTitleCache: "",
    selectedLectura: null,
    resourcePlan: {
      global: { fichas: false, anexos: false, recortables: false, videos: false },
      overrides: []
    },
    draftLectura: {
      tipo: "nueva",
      titulo: "",
      sinopsisBase: "",
      sinopsisPartes: [],
      ideas: [],
      ideaElegida: null,
      refineTargetIndex: -1,
      refineScope: "",
      especificacionesLista: [],
      especificacionesExtra: "",
      tono: "",
      palabrasObjetivo: "",
      ejeArticulador: "",
      autorReferenciaLabel: "",
      autorReferenciaValue: "",
      generatedHtml: "",
      generatedPreview: ""
    }
  };
}

export function createUnidadAgentController(deps = {}) {
  const usesExternalVoiceInput = deps.useExternalVoiceInput === true;
  const normalizeGenderLocal = (value = "") => {
    const raw = String(value || "").trim().toLowerCase();
    if (["male", "masculino", "hombre", "m", "man"].includes(raw)) return "male";
    if (["female", "femenino", "mujer", "f", "woman"].includes(raw)) return "female";
    return "neutral";
  };
  const buildIdentityText = (nombre = "", descripcion = "") => {
    const desc = String(descripcion || "").trim();
    const name = String(nombre || "Agente").trim();
    if (!desc) return `Eres ${name}, una agente pedagógica útil y concreta.`;
    return `Eres ${name}. ${desc}`;
  };
  const sanitizePersona = (agentId = 0, input = {}) => {
    const fallback = PERSONAS_DEFAULT[Number(agentId)] || {};
    const nombre = String(input?.nombre || fallback.nombre || `Agente ${agentId || ""}`).trim();
    const descripcion = String(input?.descripcion || fallback.descripcion || "").trim();
    const genero = normalizeGenderLocal(input?.genero || fallback.genero || "neutral");
    const voiceName = String(input?.voiceName || fallback.voiceName || "").trim();
    const mood = String(input?.mood || fallback.mood || "profesional").trim() || "profesional";
    const locale = String(input?.locale || fallback.locale || "es-MX").trim() || "es-MX";
    const speedRaw = Number(input?.speed ?? fallback.speed ?? 1);
    const pitchRaw = Number(input?.pitch ?? fallback.pitch ?? 1);
    const speed = Number.isFinite(speedRaw) ? Math.max(0.75, Math.min(1.35, speedRaw)) : 1;
    const pitch = Number.isFinite(pitchRaw) ? Math.max(0.75, Math.min(1.2, pitchRaw)) : 1;
    return {
      ...fallback,
      ...input,
      id: String(input?.id || fallback.id || `agente_${agentId}`),
      nombre,
      genero,
      voiceName,
      mood,
      locale,
      speed,
      pitch,
      descripcion,
      identidad: String(input?.identidad || buildIdentityText(nombre, descripcion)).trim()
    };
  };
  const normalizePersonasMap = (incoming = null) => {
    const out = {};
    for (let i = 1; i <= 6; i += 1) {
      out[i] = sanitizePersona(i, (incoming && incoming[i]) || PERSONAS_DEFAULT[i] || {});
    }
    return out;
  };
  const state = {
    activeAgentId: 0,
    states: loadStates(),
    personas: normalizePersonasMap(typeof deps.getInitialPersonas === "function" ? deps.getInitialPersonas() : null),
    userProfile: null,
    commandQueue: Promise.resolve(),
    thinkingTicker: null,
    debugLastAt: {},
    voiceInput: {
      recognition: null,
      restartTimer: null,
      warmupTimer: null,
      gestureRetryArmed: false,
      gestureRetryHandler: null,
      isListening: false,
      lastCanon: "",
      lastAt: 0,
      lastSpeechEndAt: 0,
      lastAgentSpeechAt: 0,
      selfEchoUntil: 0,
      blockAllUntil: 0,
      activeSpeechSeq: 0,
      speechSeq: 0,
      playbackStartedSeq: 0,
      realtimePlaybackSeq: 0,
      pendingTimer: null,
      pendingRaw: "",
      pendingNorm: ""
    },
    stage: {
      isOpen: false,
      currentMode: "listening",
      blinkTimer: null,
      blinkResetTimer: null,
      browTimer: null,
      browResetTimer: null,
      gazeTimer: null,
      gazeResetTimer: null,
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
      forceSpeakUntil: 0,
      currentBrows: "up",
      micActive: false,
      micSources: {}
    },
    firstTurnGuardActive: false
  };

  function log(msg) {
    if (typeof deps.log === "function") deps.log(msg);
  }

  function debug(event = "", payload = {}, minIntervalMs = 0) {
    if (typeof deps.log !== "function") return;
    const key = String(payload?.key || event || "agent").trim() || "agent";
    const now = Date.now();
    const last = Number(state.debugLastAt[key] || 0);
    if (minIntervalMs > 0 && (now - last) < minIntervalMs) return;
    state.debugLastAt[key] = now;
    const detail = Object.entries(payload || {})
      .filter(([k, v]) => k !== "key" && v !== undefined && v !== null && v !== "")
      .map(([k, v]) => `${k}=${typeof v === "number" ? v.toFixed?.(3) ?? v : v}`)
      .join(" ");
    log(`🧪 [Agent ${state.activeAgentId || 0}] ${event}${detail ? ` ${detail}` : ""}`);
  }

  function normalizeText(value = "") {
    if (typeof deps.normalizeText === "function") return deps.normalizeText(value);
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function canonText(value = "") {
    if (typeof deps.canonText === "function") return deps.canonText(value);
    return normalizeText(value);
  }

  function normalizeOrdinal(value = "") {
    if (typeof deps.normalizeOrdinal === "function") return deps.normalizeOrdinal(value);
    return "";
  }

  function els() {
    return {
      modal: document.getElementById("unidadAgentStageModal"),
      visual: document.getElementById("unidadAgentStageVisual"),
      layered: document.getElementById("unidadAgentStageLayered"),
      portrait: document.getElementById("unidadAgentStagePortrait"),
      status: document.getElementById("unidadAgentStageStatus"),
      name: document.getElementById("unidadAgentStageName"),
      text: document.getElementById("unidadAgentStageText"),
      options: document.getElementById("unidadAgentStageOptions")
    };
  }

  function showLayer(group = "", name = "") {
    const { layered } = els();
    if (!layered || !group) return;
    if (group === "mouth") {
      layered.querySelectorAll(`[data-layer-group="mouth"]`).forEach((node) => {
        node.classList.remove("is-hidden");
        node.classList.toggle("is-active", node.dataset.layerName === name);
      });
      return;
    }
    layered.querySelectorAll(`[data-layer-group="${group}"]`).forEach((node) => {
      node.classList.toggle("is-hidden", node.dataset.layerName !== name);
    });
  }

  function setFaceIdle() {
    showLayer("mouth", "closed");
    showLayer("eyes", "open");
    setBrows("up");
    state.stage.currentMouth = "closed";
    state.stage.forceSpeakUntil = 0;
  }

  function setBrows(name = "up") {
    const next = String(name || "up") === "down" ? "down" : "up";
    if (state.stage.currentBrows === next) return;
    showLayer("brows", next);
    state.stage.currentBrows = next;
  }

  function clearVoiceInput() {
    if (state.voiceInput.restartTimer) clearTimeout(state.voiceInput.restartTimer);
    state.voiceInput.restartTimer = null;
    if (state.voiceInput.warmupTimer) clearTimeout(state.voiceInput.warmupTimer);
    state.voiceInput.warmupTimer = null;
  }

  function clearVoiceGestureRetry() {
    if (!state.voiceInput.gestureRetryArmed) return;
    const handler = state.voiceInput.gestureRetryHandler;
    const events = ["pointerdown", "keydown", "touchstart"];
    if (handler) {
      events.forEach((evt) => {
        window.removeEventListener(evt, handler, true);
      });
    }
    state.voiceInput.gestureRetryArmed = false;
    state.voiceInput.gestureRetryHandler = null;
  }

  function clearPendingVoiceTranscript() {
    if (state.voiceInput.pendingTimer) clearTimeout(state.voiceInput.pendingTimer);
    state.voiceInput.pendingTimer = null;
    state.voiceInput.pendingRaw = "";
    state.voiceInput.pendingNorm = "";
  }

  function clearSpeakingFallback() {
    clearTimeout(state.stage.speakingTimer);
    state.stage.speakingTimer = null;
  }

  function estimateSpeechGuardMs(text = "") {
    const safeText = String(text || "").trim();
    const chars = Math.max(1, safeText.length);
    const words = Math.max(1, safeText.split(/\s+/).filter(Boolean).length);
    return Math.max(2200, Math.min(22000, Math.max(chars * 72, words * 460)));
  }

  function armSelfEchoGuard(text = "") {
    const ms = estimateSpeechGuardMs(text);
    const now = Date.now();
    state.voiceInput.lastAgentSpeechAt = now;
    state.voiceInput.selfEchoUntil = now + ms;
    return ms;
  }

  function armHardInputBlock(ms = 0) {
    const safeMs = Math.max(0, Number(ms) || 0);
    if (!safeMs) return 0;
    state.voiceInput.blockAllUntil = Math.max(Number(state.voiceInput.blockAllUntil || 0), Date.now() + safeMs);
    clearPendingVoiceTranscript();
    return safeMs;
  }

  function mergePendingVoiceTranscript(raw = "", norm = "") {
    const nextRaw = String(raw || "").trim();
    const nextNorm = String(norm || normalizeText(raw)).trim();
    const prevRaw = String(state.voiceInput.pendingRaw || "").trim();
    const prevNorm = String(state.voiceInput.pendingNorm || "").trim();
    if (!nextRaw || !nextNorm) return;
    if (!prevNorm) {
      state.voiceInput.pendingRaw = nextRaw;
      state.voiceInput.pendingNorm = nextNorm;
      return;
    }
    if (nextNorm === prevNorm) return;
    if (nextNorm.includes(prevNorm) || nextNorm.startsWith(prevNorm)) {
      state.voiceInput.pendingRaw = nextRaw;
      state.voiceInput.pendingNorm = nextNorm;
      return;
    }
    if (prevNorm.includes(nextNorm) || prevNorm.startsWith(nextNorm)) return;
    state.voiceInput.pendingRaw = `${prevRaw} ${nextRaw}`.replace(/\s+/g, " ").trim();
    state.voiceInput.pendingNorm = `${prevNorm} ${nextNorm}`.replace(/\s+/g, " ").trim();
  }

  function flushPendingVoiceTranscript() {
    const pendingRaw = String(state.voiceInput.pendingRaw || "").trim();
    const pendingNorm = String(state.voiceInput.pendingNorm || "").trim();
    clearPendingVoiceTranscript();
    if (!pendingRaw) return false;
    handleVoiceTranscript(pendingRaw, pendingNorm).catch(() => {});
    return true;
  }

  function schedulePendingVoiceFlush(delayMs = 920) {
    const waitMs = Math.max(80, Number(delayMs) || 0);
    if (state.voiceInput.pendingTimer) clearTimeout(state.voiceInput.pendingTimer);
    state.voiceInput.pendingTimer = setTimeout(() => {
      flushPendingVoiceTranscript();
    }, waitMs);
  }

  function clearStageTimers() {
    clearTimeout(state.stage.blinkTimer);
    clearTimeout(state.stage.blinkResetTimer);
    clearTimeout(state.stage.browTimer);
    clearTimeout(state.stage.browResetTimer);
    clearTimeout(state.stage.gazeTimer);
    clearTimeout(state.stage.gazeResetTimer);
    clearTimeout(state.stage.speakingTimer);
    state.stage.blinkTimer = null;
    state.stage.blinkResetTimer = null;
    state.stage.browTimer = null;
    state.stage.browResetTimer = null;
    state.stage.gazeTimer = null;
    state.stage.gazeResetTimer = null;
    state.stage.speakingTimer = null;
  }

  function isLikelySelfEcho(canon = "") {
    const heard = String(canon || "").trim();
    if (!heard) return false;
    const spoken = canonText(state.stage.speechText || "");
    if (!spoken) return false;
    if (heard === spoken) return true;
    const withinGuard = Date.now() < Number(state.voiceInput.selfEchoUntil || 0);
    if (withinGuard && heard.length >= 10 && spoken.includes(heard)) return true;
    const minLen = Math.min(heard.length, spoken.length);
    const maxLen = Math.max(heard.length, spoken.length);
    if (minLen < 14) return false;
    const ratio = minLen / Math.max(1, maxLen);
    if (ratio < 0.82) return false;
    return heard.includes(spoken) || spoken.includes(heard);
  }

  function buildVisemeFrames(text = "") {
    const clean = String(text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const frames = [];
    const pushFrame = (name = "closed", weight = 1) => {
      const prev = frames[frames.length - 1];
      if (prev && prev.name === name) {
        prev.weight += weight;
        return;
      }
      frames.push({ name, weight });
    };
    for (let i = 0; i < clean.length; i += 1) {
      const ch = clean[i];
      const next = clean[i + 1] || "";
      const prev = clean[i - 1] || "";
      const repeated = /[aeiou]/.test(ch) && (ch === next || ch === prev);
      if (/[mpvbc]/.test(ch) && /[aei]/.test(next)) {
        pushFrame("m", 0.9);
        pushFrame("a", repeated ? 1.45 : 1.02);
        i += 1;
        continue;
      }
      if (/[mpvbc]/.test(ch) && /[ou]/.test(next)) {
        pushFrame("m", 0.9);
        pushFrame("uoo", repeated ? 1.5 : 1.06);
        i += 1;
        continue;
      }
      if (/[mpvbc]/.test(ch)) {
        pushFrame("m", 0.72);
        continue;
      }
      if (/[aei]/.test(ch)) {
        pushFrame("a", repeated ? 1.55 : 0.88);
        continue;
      }
      if (/[ou]/.test(ch)) {
        pushFrame("uoo", repeated ? 1.6 : 0.92);
        continue;
      }
      if (/[,.!?;:]/.test(ch)) {
        pushFrame("closed", 1.65);
        continue;
      }
      if (/\s/.test(ch)) {
        pushFrame("closed", 0.9);
        continue;
      }
      if (/[a-z]/.test(ch)) pushFrame("closed", 0.56);
    }
    if (!frames.length || frames[frames.length - 1]?.name !== "closed") pushFrame("closed", 1.1);
    return frames;
  }

  function frameDuration(frame = "closed", energy = 0) {
    const boost = Math.max(0, Math.min(1, (energy - 0.015) / 0.05));
    if (frame === "closed") return 96 + ((1 - boost) * 34);
    if (frame === "m" || frame === "mm") return 108 + ((1 - boost) * 34);
    return 122 + ((1 - boost) * 36);
  }

  function adaptiveFrameDuration(now = 0, frameEntry = { name: "closed", weight: 1 }) {
    const frame = frameEntry?.name || "closed";
    const weight = Math.max(0.4, Number(frameEntry?.weight) || 1);
    const fallback = frameDuration(frame, state.stage.energy) * weight;
    const queuedAudioMs = Math.max(0, state.stage.audioWindowEndsAt - now);
    if (queuedAudioMs <= 0) return fallback;
    const remainingUnits = Math.max(1, state.stage.visemeFrames
      .slice(state.stage.visemeIndex)
      .reduce((acc, entry) => acc + Math.max(0.4, Number(entry?.weight) || 1), 0));
    const paced = (queuedAudioMs / remainingUnits) * weight;
    const energyBias = state.stage.energy > 0.045 ? 0.94 : state.stage.energy > 0.024 ? 0.98 : 1.03;
    const minMs = frame === "closed" ? 96 : 112;
    const maxMs = frame === "closed" ? 260 : 232;
    return Math.max(minMs, Math.min(maxMs, paced * energyBias));
  }

  function pickEnergyDrivenMouth(queuedAudioMs = 0) {
    if (state.stage.energy > 0.06) return Math.random() > 0.48 ? "a" : "uoo";
    if (state.stage.energy > 0.036) return Math.random() > 0.58 ? "m" : "a";
    // Cuando Live aún tiene audio pendiente, evita quedar congelada en "closed"
    // por ráfagas de baja energía o pausas cortas de red.
    if (queuedAudioMs > 320) return Math.random() > 0.45 ? "a" : "m";
    if (queuedAudioMs > 160) return Math.random() > 0.66 ? "m" : "closed";
    if (state.stage.energy > 0.02) return Math.random() > 0.65 ? "m" : "closed";
    return "closed";
  }

  function normalizeMouthFrame(frame = "closed") {
    const raw = String(frame || "closed").trim() || "closed";
    if (raw === "mm" || raw === "big") return state.stage.currentMode === "speaking" ? "a" : "closed";
    return raw;
  }

  function resetEyesForMode(mode = state.stage.currentMode) {
    if (mode === "thinking") {
      showLayer("eyes", Math.random() > 0.5 ? "left" : "right");
      return;
    }
    showLayer("eyes", "open");
  }

  function glanceAround() {
    if (!state.stage.isOpen || state.activeAgentId !== 1) return;
    const roll = Math.random();
    if (state.stage.currentMode === "thinking") {
      showLayer("eyes", roll > 0.5 ? "left" : "right");
      return;
    }
    if (state.stage.currentMode === "speaking" && roll > 0.72) {
      showLayer("eyes", roll > 0.86 ? "right" : "left");
      clearTimeout(state.stage.gazeResetTimer);
      state.stage.gazeResetTimer = setTimeout(() => resetEyesForMode("speaking"), 180 + Math.random() * 220);
      return;
    }
    if (state.stage.currentMode === "listening" && roll > 0.78) {
      showLayer("eyes", roll > 0.89 ? "right" : "left");
      clearTimeout(state.stage.gazeResetTimer);
      state.stage.gazeResetTimer = setTimeout(() => resetEyesForMode("listening"), 220 + Math.random() * 260);
    }
  }

  function animateLipSync(now = 0) {
    state.stage.rafId = requestAnimationFrame(animateLipSync);
    if (!state.stage.isOpen || state.activeAgentId !== 1) return;
    const decayFactor = now > state.stage.energyDecayAt ? 0.84 : 0.92;
    state.stage.energy = (state.stage.energy * decayFactor) + (state.stage.targetEnergy * (1 - decayFactor));
    state.stage.targetEnergy *= 0.9;
    const queuedAudioMsPre = Math.max(0, state.stage.audioWindowEndsAt - now);
    const hasPendingVisemes = state.stage.visemeIndex < state.stage.visemeFrames.length;
    const hasRealtimeSpeech = queuedAudioMsPre > 0 || state.stage.energy > 0.014;
    const activeSpeechSeq = Number(state.voiceInput.activeSpeechSeq || 0);
    const sawRealtimePlayback = !!(activeSpeechSeq && state.voiceInput.realtimePlaybackSeq === activeSpeechSeq);
    if (!activeSpeechSeq && state.stage.currentMode === "speaking" && !hasRealtimeSpeech && now > (state.stage.forceSpeakUntil + 36)) {
      setMode("listening");
      return;
    }
    if (activeSpeechSeq && state.stage.currentMode === "speaking" && sawRealtimePlayback) {
      const playbackEnded = queuedAudioMsPre <= 0 && state.stage.energy < 0.009 && now > (state.stage.forceSpeakUntil + 36);
      if (playbackEnded) {
        finishSpeakingTurn(activeSpeechSeq, "pcm-ended");
        if (state.stage.currentMouth !== "closed") showLayer("mouth", "closed");
        state.stage.currentMouth = "closed";
        state.stage.nextFrameAt = now + 36;
        return;
      }
    }
    if (state.stage.currentMode !== "speaking") {
      if (state.stage.currentMode === "thinking" || !hasRealtimeSpeech) return;
      if (!activeSpeechSeq && queuedAudioMsPre <= 0 && state.stage.energy < 0.012) return;
      setMode("speaking");
      debug("lipsync-resume-speaking", {
        key: "lipsync-resume-speaking",
        queuedAudioMs: queuedAudioMsPre,
        pending: hasPendingVisemes ? "yes" : "no",
        energy: state.stage.energy
      }, 260);
    }
    if (now < state.stage.nextFrameAt) return;
    const queuedAudioMs = Math.max(0, state.stage.audioWindowEndsAt - now);
    if (queuedAudioMs <= 0 && state.stage.energy < 0.009) {
      if (state.stage.currentMouth !== "closed") showLayer("mouth", "closed");
      state.stage.currentMouth = "closed";
      state.stage.nextFrameAt = now + 36;
      return;
    }
    if (state.stage.energy < 0.008 && queuedAudioMs <= 18 && state.stage.visemeIndex >= state.stage.visemeFrames.length) {
      if (state.stage.currentMouth !== "closed") showLayer("mouth", "closed");
      state.stage.currentMouth = "closed";
      state.stage.nextFrameAt = now + 22;
      debug("lipsync-idle", { key: "lipsync-idle", energy: state.stage.energy, queuedAudioMs }, 900);
      return;
    }
    const hasFrames = state.stage.visemeIndex < state.stage.visemeFrames.length;
    const fallbackQueuedMs = Math.max(0, state.stage.audioWindowEndsAt - now);
    const nextFrameEntry = hasFrames
      ? state.stage.visemeFrames[state.stage.visemeIndex]
      : { name: pickEnergyDrivenMouth(fallbackQueuedMs), weight: state.stage.energy > 0.055 ? 1.2 : 0.9 };
    if (hasFrames) state.stage.visemeIndex += 1;
    const nextFrame = normalizeMouthFrame(nextFrameEntry?.name || "closed");
    showLayer("mouth", nextFrame);
    state.stage.currentMouth = nextFrame;
    state.stage.nextFrameAt = now + adaptiveFrameDuration(now, nextFrameEntry);
    debug("lipsync-frame", {
      key: "lipsync-frame",
      frame: nextFrame,
      energy: state.stage.energy,
      queuedAudioMs,
      visemeIndex: state.stage.visemeIndex,
      totalVisemes: state.stage.visemeFrames.length
    }, 420);
  }

  function ensureLoop() {
    if (state.stage.rafId) return;
    state.stage.rafId = requestAnimationFrame(animateLipSync);
  }

  function scheduleBlink() {
    clearTimeout(state.stage.blinkTimer);
    state.stage.blinkTimer = setTimeout(() => {
      if (!state.stage.isOpen || state.activeAgentId !== 1) return;
      const mode = state.stage.currentMode;
      const doubleBlink = Math.random() > 0.72;
      showLayer("eyes", "closed");
      clearTimeout(state.stage.blinkResetTimer);
      state.stage.blinkResetTimer = setTimeout(() => {
        resetEyesForMode(mode);
        if (doubleBlink) {
          state.stage.blinkResetTimer = setTimeout(() => {
            showLayer("eyes", "closed");
            state.stage.blinkResetTimer = setTimeout(() => resetEyesForMode(mode), 70 + Math.random() * 40);
          }, 80 + Math.random() * 90);
        }
      }, 90 + Math.random() * 55);
      scheduleBlink();
    }, 2100 + Math.random() * 2600);
  }

  function scheduleGaze() {
    clearTimeout(state.stage.gazeTimer);
    state.stage.gazeTimer = setTimeout(() => {
      glanceAround();
      scheduleGaze();
    }, 1300 + Math.random() * 2200);
  }

  function scheduleBrows() {
    clearTimeout(state.stage.browTimer);
    const mode = state.stage.currentMode;
    const delay = mode === "speaking"
      ? 170 + Math.random() * 220
      : mode === "thinking"
        ? 220 + Math.random() * 280
        : 900 + Math.random() * 1700;
    state.stage.browTimer = setTimeout(() => {
      if (!state.stage.isOpen || state.activeAgentId !== 1) return;
      const modeNow = state.stage.currentMode;
      const now = performance.now();
      const queuedAudioMs = Math.max(0, state.stage.audioWindowEndsAt - now);
      if (modeNow === "thinking") {
        const down = Math.random() > 0.45;
        setBrows(down ? "down" : "up");
        clearTimeout(state.stage.browResetTimer);
        if (down) {
          state.stage.browResetTimer = setTimeout(() => {
            if (!state.stage.isOpen || state.activeAgentId !== 1 || state.stage.currentMode !== "thinking") return;
            setBrows("up");
          }, 160 + Math.random() * 180);
        }
        scheduleBrows();
        return;
      }
      if (modeNow === "speaking") {
        const expressive = state.stage.energy > 0.025 || queuedAudioMs > 120;
        const down = expressive ? Math.random() > 0.34 : Math.random() > 0.82;
        setBrows(down ? "down" : "up");
        clearTimeout(state.stage.browResetTimer);
        if (down) {
          state.stage.browResetTimer = setTimeout(() => {
            if (!state.stage.isOpen || state.activeAgentId !== 1 || state.stage.currentMode !== "speaking") return;
            setBrows("up");
          }, 90 + Math.random() * 120);
        }
        scheduleBrows();
        return;
      }
      const accent = Math.random() > 0.9;
      if (accent) {
        setBrows("down");
        clearTimeout(state.stage.browResetTimer);
        state.stage.browResetTimer = setTimeout(() => {
          if (!state.stage.isOpen || state.activeAgentId !== 1 || state.stage.currentMode !== "listening") return;
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
    const prevMode = state.stage.currentMode;
    const defaultDetail = safeMode === "speaking"
      ? "Hablando..."
      : safeMode === "thinking"
        ? "Pensando..."
        : "Escuchando tu instrucción.";
    state.stage.currentMode = safeMode;
    visual.dataset.state = safeMode;
    if (status) status.textContent = safeMode === "speaking" ? "Hablando" : safeMode === "thinking" ? "Pensando" : "Escuchando";
    if (text) text.textContent = detail ? String(detail) : defaultDetail;
    if (prevMode !== safeMode) debug("mode", { key: "mode", from: prevMode, to: safeMode, mic: state.stage.micActive ? "on" : "off" }, 0);
    if (safeMode === "thinking") {
      if (!usesExternalVoiceInput) stopInternalVoiceInput(false);
    } else if (!usesExternalVoiceInput) {
      const started = startInternalVoiceInput();
      if (!started || !state.voiceInput.isListening) scheduleVoiceWarmupStart(6, 160);
    }
    if (state.activeAgentId !== 1) return;
    clearTimeout(state.stage.browResetTimer);
    if (safeMode === "thinking") {
      showLayer("mouth", "m");
      resetEyesForMode("thinking");
      setBrows("down");
      return;
    }
    if (safeMode === "speaking") {
      resetEyesForMode("speaking");
      setBrows("up");
      if (!state.stage.visemeFrames.length) state.stage.visemeFrames = [{ name: "closed", weight: 1 }];
      return;
    }
    setFaceIdle();
  }

  function prepareSpeech(text = "") {
    state.stage.speechText = String(text || "").trim();
    state.stage.visemeFrames = buildVisemeFrames(state.stage.speechText);
    state.stage.visemeIndex = 0;
    state.stage.nextFrameAt = 0;
    state.stage.audioWindowStartedAt = 0;
    state.stage.audioWindowEndsAt = 0;
    state.stage.forceSpeakUntil = performance.now() + Math.max(1400, Math.min(7000, state.stage.speechText.length * 22));
  }

  function isSpeakingInterruptCommand(text = "") {
    const norm = normalizeText(text);
    if (!norm) return false;
    return /\b(cancela|cancelar|alto|deten|detener|para|parar|stop|cerrar|cierra|salir|sal del agente|terminar agente|cambiar agente)\b/.test(norm);
  }

  function finishSpeakingTurn(seq = 0, reason = "end") {
    const activeSeq = Number(state.voiceInput.activeSpeechSeq || 0);
    if (!seq || !activeSeq || seq !== activeSeq) return false;
    state.voiceInput.lastAgentSpeechAt = Date.now();
    state.voiceInput.selfEchoUntil = Math.max(Number(state.voiceInput.selfEchoUntil || 0), Date.now() + 420);
    state.voiceInput.activeSpeechSeq = 0;
    state.voiceInput.playbackStartedSeq = 0;
    state.voiceInput.realtimePlaybackSeq = 0;
    clearSpeakingFallback();
    state.stage.audioWindowStartedAt = 0;
    state.stage.audioWindowEndsAt = 0;
    state.stage.forceSpeakUntil = performance.now() + 120;
    if (state.stage.isOpen && state.stage.currentMode === "speaking") setMode("listening");
    debug("speech-finished", { key: "speech-finished", seq, reason }, 0);
    return true;
  }

  function completeSpeechPlayback(reason = "external-end") {
    const activeSeq = Number(state.voiceInput.activeSpeechSeq || 0);
    if (activeSeq) return finishSpeakingTurn(activeSeq, reason);
    if (!state.stage.isOpen) return false;
    clearSpeakingFallback();
    state.stage.audioWindowStartedAt = 0;
    state.stage.audioWindowEndsAt = 0;
    state.stage.forceSpeakUntil = performance.now() + 120;
    if (state.stage.currentMode === "speaking") {
      setMode("listening");
      debug("speech-finished", { key: "speech-finished", seq: 0, reason }, 0);
      return true;
    }
    return false;
  }

  function scheduleSpeakingFallback(seq = 0, ms = 0) {
    if (!seq) return 0;
    const waitMs = Math.max(1600, Number(ms) || 0);
    clearSpeakingFallback();
    state.stage.speakingTimer = setTimeout(() => {
      finishSpeakingTurn(seq, "fallback");
    }, waitMs);
    return waitMs;
  }

  function noteSpeechPlaybackStart(seq = 0, source = "playback") {
    const activeSeq = Number(state.voiceInput.activeSpeechSeq || 0);
    if (!seq || !activeSeq || seq !== activeSeq) return false;
    state.voiceInput.playbackStartedSeq = seq;
    state.voiceInput.lastAgentSpeechAt = Date.now();
    if (source === "realtime") state.voiceInput.realtimePlaybackSeq = seq;
    debug("speech-started", { key: "speech-started", seq, source }, 120);
    return true;
  }

  function updateSpeechText(text = "") {
    const nextText = String(text || "").trim();
    if (!nextText) return;
    const prevText = state.stage.speechText;
    if (nextText === prevText) return;
    const prevCount = Math.max(1, state.stage.visemeFrames.length);
    const prevIndex = Math.max(0, Math.min(state.stage.visemeIndex, prevCount - 1));
    const progress = prevCount > 1 ? (prevIndex / prevCount) : 0;
    const prevNorm = normalizeText(prevText);
    const nextNorm = normalizeText(nextText);
    const isAppendChunk = !!prevNorm && !!nextNorm && !nextNorm.startsWith(prevNorm) && !prevNorm.startsWith(nextNorm);
    const mergedText = isAppendChunk ? `${prevText} ${nextText}`.trim() : nextText;
    state.stage.speechText = mergedText;
    state.stage.visemeFrames = buildVisemeFrames(mergedText);
    const nextCount = Math.max(1, state.stage.visemeFrames.length);
    if (isAppendChunk) {
      state.stage.visemeIndex = Math.min(nextCount - 1, prevIndex);
    } else {
      state.stage.visemeIndex = prevText && nextText.startsWith(prevText)
        ? Math.min(nextCount - 1, prevIndex)
        : Math.min(nextCount - 1, Math.round(progress * nextCount));
    }
    const deltaChars = isAppendChunk ? nextText.length : (nextText.length - prevText.length || nextText.length);
    state.stage.forceSpeakUntil = performance.now() + Math.max(1700, Math.min(9000, deltaChars * 32));
    const activeSeq = Number(state.voiceInput.activeSpeechSeq || 0);
    if (activeSeq) scheduleSpeakingFallback(activeSeq, 2600);
    if (activeSeq && state.stage.isOpen && state.activeAgentId === 1 && state.stage.currentMode !== "thinking") {
      setMode("speaking");
    }
    debug("speech-text", {
      key: "speech-text",
      chars: mergedText.length,
      chunkMode: isAppendChunk ? "append" : "replace",
      visemes: nextCount,
      carryIndex: state.stage.visemeIndex
    }, 260);
  }

  function syncSpeakingActivity(ms = 900) {
    const requestedMs = Math.max(0, Number(ms) || 0);
    const activeSeq = Number(state.voiceInput.activeSpeechSeq || 0);
    // En lectura Live por bloques no siempre hay speechSeq activo; si el hold es muy corto
    // la boca cae a "listening" entre ráfagas y se percibe como congelada.
    const minHoldMs = activeSeq ? 680 : 1300;
    const speakingHoldMs = Math.max(minHoldMs, Math.min(18000, requestedMs || 900));
    setMode("speaking");
    state.voiceInput.lastAgentSpeechAt = Date.now();
    state.stage.forceSpeakUntil = Math.max(state.stage.forceSpeakUntil, performance.now() + speakingHoldMs + 120);
    debug("speaking-window", { key: "speaking-window", ms: requestedMs || 900, hold: speakingHoldMs }, 250);
    if (activeSeq) {
      noteSpeechPlaybackStart(activeSeq, "realtime");
      scheduleSpeakingFallback(activeSeq, speakingHoldMs + 1400);
    }
  }

  function onPcmSamples(samples, meta = {}) {
    if (!samples || state.activeAgentId !== 1) return;
    let sum = 0;
    const len = Math.min(samples.length, 2048);
    for (let i = 0; i < len; i += 1) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / Math.max(1, len));
    const now = performance.now();
    const durationMs = Math.max(24, Number(meta?.durationMs) || ((samples.length / 24000) * 1000));
    const startInMs = Math.max(0, Number(meta?.startInMs) || 0);
    const endInMs = Math.max(startInMs + durationMs, Number(meta?.endInMs) || (startInMs + durationMs));
    const activeSeq = Number(state.voiceInput.activeSpeechSeq || 0);
    state.stage.targetEnergy = Math.max(state.stage.targetEnergy, rms);
    state.stage.energyDecayAt = now + Math.max(44, Math.min(140, durationMs));
    if (activeSeq) noteSpeechPlaybackStart(activeSeq, "realtime");
    syncSpeakingActivity(endInMs + 260);
    debug("pcm", {
      key: "pcm",
      rms,
      durationMs,
      startInMs,
      endInMs
    }, 220);
    if (!state.stage.audioWindowStartedAt || now > (state.stage.audioWindowEndsAt + 120)) {
      state.stage.audioWindowStartedAt = now + startInMs;
      state.stage.audioWindowEndsAt = now + endInMs;
      debug("audio-window-reset", { key: "audio-window-reset", endInMs }, 0);
      return;
    }
    state.stage.audioWindowStartedAt = Math.min(state.stage.audioWindowStartedAt, now + startInMs);
    state.stage.audioWindowEndsAt = Math.max(state.stage.audioWindowEndsAt, now + endInMs);
  }

  function setMicState(active = false, source = "") {
    const sourceKey = String(source || "default").trim() || "default";
    state.stage.micSources[sourceKey] = active === true;
    const next = Object.values(state.stage.micSources).some(Boolean);
    const { status } = els();
    state.stage.micActive = next;
    if (status) status.dataset.mic = next ? "on" : "off";
    debug("mic", { key: `mic-${sourceKey}`, active: next ? "on" : "off", source: sourceKey }, 0);
  }

  function scheduleVoiceWarmupStart(attempts = 8, delayMs = 180) {
    if (usesExternalVoiceInput) return;
    const maxAttempts = Math.max(1, Number(attempts) || 1);
    const waitMs = Math.max(60, Number(delayMs) || 60);
    if (state.voiceInput.warmupTimer) clearTimeout(state.voiceInput.warmupTimer);
    const run = (left = maxAttempts) => {
      if (!state.stage.isOpen || !state.activeAgentId) return;
      if (state.stage.currentMode === "thinking") return;
      if (state.voiceInput.isListening) return;
      const started = startInternalVoiceInput();
      debug("agent-voice-warmup-try", { key: "agent-voice-warmup-try", left, started: started ? "yes" : "no" }, 120);
      if (state.voiceInput.isListening) return;
      if (left <= 1) {
        debug("agent-voice-warmup-giveup", { key: "agent-voice-warmup-giveup" }, 0);
        return;
      }
      state.voiceInput.warmupTimer = setTimeout(() => run(left - 1), waitMs);
    };
    state.voiceInput.warmupTimer = setTimeout(() => run(maxAttempts), 80);
  }

  function scheduleVoiceStartOnUserGesture() {
    if (usesExternalVoiceInput) return;
    if (state.voiceInput.gestureRetryArmed) return;
    const events = ["pointerdown", "keydown", "touchstart"];
    const handler = () => {
      clearVoiceGestureRetry();
      if (!state.stage.isOpen || !state.activeAgentId) return;
      if (state.stage.currentMode === "thinking") return;
      const started = startInternalVoiceInput();
      if (!started || !state.voiceInput.isListening) {
        scheduleVoiceWarmupStart(8, 180);
      }
    };
    state.voiceInput.gestureRetryArmed = true;
    state.voiceInput.gestureRetryHandler = handler;
    events.forEach((evt) => {
      window.addEventListener(evt, handler, { capture: true, once: true });
    });
    debug("agent-voice-await-gesture", { key: "agent-voice-await-gesture" }, 0);
  }

  function ensureInternalVoiceInput() {
    if (usesExternalVoiceInput) return null;
    if (!AgentSpeechRecognitionAPI) return null;
    if (state.voiceInput.recognition) return state.voiceInput.recognition;
    const isPlaybackControlCommand = (canon = "") => {
      const t = String(canon || "");
      return /\b(detener|deten|para|parar|pausa|pausar|continuar|continua|continúa|reanuda|resume|cancela|cancelar)\b/.test(t);
    };
    const recognition = new AgentSpeechRecognitionAPI();
    recognition.lang = "es-MX";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    try {
      const PhraseCtor = window.SpeechRecognitionPhrase || window.webkitSpeechRecognitionPhrase || null;
      if ("phrases" in recognition) {
        const biasPhrases = [
          ["asc", 6.5],
          ["ask", 6.2],
          ["asq", 5.8],
          ["buscar lectura asc", 6.8],
          ["buscar lectura ask", 6.6],
          ["buscar lectura nueva", 6.4],
          ["crear unidad nueva", 5.8],
          ["cancelar", 5.5],
          ["cerrar agente", 5.2]
        ];
        recognition.phrases = PhraseCtor
          ? biasPhrases.map(([phrase, boost]) => new PhraseCtor(phrase, boost))
          : biasPhrases.map(([phrase, boost]) => ({ phrase, boost }));
      }
    } catch (_) {}

    recognition.onstart = () => {
      state.voiceInput.isListening = true;
      if (state.voiceInput.warmupTimer) {
        clearTimeout(state.voiceInput.warmupTimer);
        state.voiceInput.warmupTimer = null;
      }
      clearVoiceGestureRetry();
      setMicState(true, "agent-local");
      debug("agent-voice-start", { key: "agent-voice-start" }, 0);
    };

    recognition.onend = () => {
      state.voiceInput.isListening = false;
      setMicState(false, "agent-local");
      debug("agent-voice-end", { key: "agent-voice-end" }, 0);
      const canRestart = state.stage.currentMode === "listening" || state.stage.currentMode === "speaking";
      if (!state.stage.isOpen || !state.activeAgentId || !canRestart) return;
      clearVoiceInput();
      state.voiceInput.restartTimer = setTimeout(() => {
        const started = startInternalVoiceInput();
        if (!started || !state.voiceInput.isListening) scheduleVoiceWarmupStart(6, 180);
      }, 240);
    };

    recognition.onerror = (event) => {
      const err = String(event?.error || "unknown");
      debug("agent-voice-error", { key: "agent-voice-error", err }, 0);
      if (err === "not-allowed" || err === "service-not-allowed") {
        setMicState(false, "agent-local");
        scheduleVoiceStartOnUserGesture();
        scheduleVoiceWarmupStart(8, 220);
      }
    };

    recognition.onspeechend = () => {
      state.voiceInput.lastSpeechEndAt = Date.now();
      debug("agent-voice-speechend", { key: "agent-voice-speechend" }, 140);
      schedulePendingVoiceFlush(140);
    };

    recognition.onresult = (event) => {
      if (!state.stage.isOpen || !state.activeAgentId) return;
      const result = event.results?.[event.results.length - 1];
      const transcript = String(result?.[0]?.transcript || "").trim();
      if (!transcript) return;
      const canon = canonText(transcript);
      const now = Date.now();
      const isSpeakingNow = state.stage.currentMode === "speaking";
      const justFinishedSpeaking = (now - Number(state.voiceInput.lastAgentSpeechAt || 0)) < 420;
      const likelyEcho = isLikelySelfEcho(canon);
      const withinSpeechGuard = now < Number(state.voiceInput.selfEchoUntil || 0);
      if ((withinSpeechGuard || isSpeakingNow || justFinishedSpeaking) && likelyEcho && !isPlaybackControlCommand(canon)) {
        debug("agent-voice-self-echo-ignored", { key: "agent-voice-self-echo-ignored", transcript }, 240);
        return;
      }
      if (isSpeakingNow && !isSpeakingInterruptCommand(transcript)) {
        debug("agent-voice-speaking-ignored", { key: "agent-voice-speaking-ignored", transcript }, 240);
        return;
      }
      if (canon && canon === state.voiceInput.lastCanon && (now - state.voiceInput.lastAt) < 2200) return;
      state.voiceInput.lastCanon = canon;
      state.voiceInput.lastAt = now;
      debug("agent-voice-result", { key: "agent-voice-result", transcript }, 180);
      queueVoiceTranscript(transcript, normalizeText(transcript)).catch(() => {});
    };

    state.voiceInput.recognition = recognition;
    return recognition;
  }

  function startInternalVoiceInput() {
    if (usesExternalVoiceInput) return false;
    if (!state.stage.isOpen || !state.activeAgentId) return false;
    const allowedMode = state.stage.currentMode === "listening" || state.stage.currentMode === "speaking";
    if (!allowedMode) return false;
    const recognition = ensureInternalVoiceInput();
    if (!recognition || state.voiceInput.isListening) return false;
    clearVoiceInput();
    try {
      recognition.start();
      return true;
    } catch (err) {
      const low = String(err?.message || err || "").toLowerCase();
      if (low.includes("already started") || low.includes("invalidstateerror")) return false;
      if (low.includes("not-allowed") || low.includes("service-not-allowed") || low.includes("notallowederror")) {
        scheduleVoiceStartOnUserGesture();
      }
      debug("agent-voice-start-failed", { key: "agent-voice-start-failed", err: String(err?.message || err || "unknown") }, 0);
      return false;
    }
  }

  function stopInternalVoiceInput(fullStop = false) {
    if (usesExternalVoiceInput) {
      if (fullStop) setMicState(false, "agent-local");
      return false;
    }
    clearVoiceInput();
    const recognition = state.voiceInput.recognition;
    if (!recognition || !state.voiceInput.isListening) {
      if (fullStop) setMicState(false, "agent-local");
      return false;
    }
    try { recognition.stop(); } catch (_) { }
    if (fullStop) setMicState(false, "agent-local");
    return true;
  }

  function saveStates() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.states));
    } catch (_) {}
  }

  function loadStates() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const out = {};
      for (let i = 1; i <= 6; i += 1) {
        out[i] = { ...createBaseState(i), ...(parsed?.[i] || {}) };
        out[i].agentId = i;
        out[i].nivel = "Primaria";
        out[i].grado = GRADE_MAP[i] || out[i].grado || "";
        out[i].resourcePlan = {
          global: { fichas: false, anexos: false, recortables: false, videos: false, ...(parsed?.[i]?.resourcePlan?.global || {}) },
          overrides: Array.isArray(parsed?.[i]?.resourcePlan?.overrides) ? parsed[i].resourcePlan.overrides : []
        };
        out[i].draftLectura = { ...createBaseState(i).draftLectura, ...(parsed?.[i]?.draftLectura || {}) };
      }
      return out;
    } catch (_) {
      const out = {};
      for (let i = 1; i <= 6; i += 1) out[i] = createBaseState(i);
      return out;
    }
  }

  function getAgentState(agentId = 0) {
    const id = Number(agentId) || 0;
    if (!id) return null;
    if (!state.states[id]) state.states[id] = createBaseState(id);
    return state.states[id];
  }

  function updateAgentState(agentId = 0, patch = {}) {
    const base = getAgentState(agentId);
    if (!base) return null;
    state.states[agentId] = {
      ...base,
      ...patch,
      resourcePlan: {
        ...(base.resourcePlan || {}),
        ...(patch.resourcePlan || {}),
        global: {
          ...((base.resourcePlan && base.resourcePlan.global) || {}),
          ...((patch.resourcePlan && patch.resourcePlan.global) || {})
        }
      },
      draftLectura: {
        ...(base.draftLectura || {}),
        ...(patch.draftLectura || {})
      }
    };
    saveStates();
    if (Number(agentId) === Number(state.activeAgentId || 0)) renderStageOptions();
    return state.states[agentId];
  }

  function resetWorkflow(agentId = 0, extras = {}) {
    stopThinkingTicker();
    return updateAgentState(agentId, {
      flow: "idle",
      step: "await_action",
      pendingIntent: "",
      pendingReadingAction: null,
      ...extras
    });
  }

  function clearAgentMemory(agentId = 0) {
    const id = Number(agentId) || 0;
    if (!id) return null;
    stopThinkingTicker();
    if (typeof deps.clearReadingWorkflowState === "function") {
      try { deps.clearReadingWorkflowState(); } catch (_) {}
    }
    state.states[id] = createBaseState(id);
    saveStates();
    if (id === Number(state.activeAgentId || 0)) renderStageOptions();
    setAcademicContext(id);
    return state.states[id];
  }

  function persona(agentId = 0) {
    return state.personas[Number(agentId)] || sanitizePersona(agentId, { nombre: `Agente ${agentId || ""}`, portrait: "agentePrimero.png" });
  }

  function getPersonas() {
    return normalizePersonasMap(state.personas);
  }

  function setPersonas(nextMap = null) {
    state.personas = normalizePersonasMap(nextMap);
    const currentId = Number(state.activeAgentId || 0);
    if (currentId > 0 && typeof deps.onActiveAgentChange === "function") {
      deps.onActiveAgentChange(currentId, persona(currentId));
    }
    return getPersonas();
  }

  function normalizeGender(value = "") {
    const g = normalizeText(value);
    if (["male", "masculino", "hombre", "m", "man"].includes(g)) return "male";
    if (["female", "femenino", "mujer", "f", "woman"].includes(g)) return "female";
    return "neutral";
  }

  async function ensureUserProfile() {
    if (state.userProfile) return state.userProfile;
    if (typeof deps.getUserPersona !== "function") {
      state.userProfile = { name: "", gender: "neutral" };
      return state.userProfile;
    }
    try {
      const data = await deps.getUserPersona();
      state.userProfile = {
        name: String(data?.name || "").trim(),
        gender: normalizeGender(data?.gender || "")
      };
    } catch (_) {
      state.userProfile = { name: "", gender: "neutral" };
    }
    return state.userProfile;
  }

  function userGreetingPrefix() {
    const name = String(state.userProfile?.name || "").trim();
    const gender = normalizeGender(state.userProfile?.gender || "");
    if (!name) return "";
    if (gender === "female") return `Bienvenida ${name}. `;
    if (gender === "male") return `Bienvenido ${name}. `;
    return `${name}, `;
  }

  function actionsCatalogPrompt() {
    return "Puedes pedirme Buscar lectura ASC, Buscar lectura Nueva, Crear lectura Nueva, Buscar unidad Nueva o Crear unidad nueva. Luego también puedes pedirme leer lectura.";
  }

  function actionsCatalogPromptCompact() {
    return "Elige una opción del panel o dímela.";
  }

  function readingWorkflowStepFromState(wfState = null) {
    if (!wfState || typeof wfState !== "object") return "";
    if (wfState.hasPendingAction) return "await_reading_action";
    if (wfState.hasPendingSelection) return "await_reading_selection";
    if (wfState.hasPendingSearch && String(wfState.pendingSearchStep || "").trim() === "collection") return "await_collection";
    if (wfState.hasPendingSearch) return "await_title";
    return "";
  }

  function getReadingWorkflowCandidates(wfState = null) {
    if (!wfState || typeof wfState !== "object") return [];
    const list = Array.isArray(wfState.candidates) ? wfState.candidates : [];
    return list
      .map((it, idx) => {
        const titulo = String(it?.titulo || "").trim();
        if (!titulo) return null;
        const numero = Number(it?.visualIndex || 0) || (idx + 1);
        return {
          id: String(it?.id || "").trim(),
          titulo,
          nivel: String(it?.nivel || "").trim(),
          grado: String(it?.grado || "").trim(),
          trimestre: String(it?.trimestre || "").trim(),
          unidad: String(it?.unidad || "").trim(),
          sourceCollection: String(it?.sourceCollection || it?.coleccion || "").trim(),
          visualIndex: numero,
          voiceNumberPrompt: String(it?.voiceNumberPrompt || `lectura ${numero}`).trim(),
          voiceTitlePrompt: String(it?.voiceTitlePrompt || titulo).trim()
        };
      })
      .filter(Boolean);
  }

  function looksLikeBareReadingTitle(raw = "") {
    const norm = normalizeText(raw);
    if (!norm) return false;
    if (/^(si|sí|no|ok|vale|continuar|continua|continúa|siguiente|cancelar)$/.test(norm)) return false;
    const tokens = norm.split(/\s+/).filter(Boolean);
    if (!tokens.length || tokens.length > 12) return false;
    if (/\b(listo|estoy|elige|dicta|numero|número|opcion|opción|comando|acciones|actualice|actualicé|titulo|título|dime|ahora|despues|después)\b/.test(norm)) return false;
    if (/\b(asc|ask|asq)\b/.test(norm)) return false;
    if (/^(?:lectura|lecturas)\b/.test(norm)) return false;
    return tokens.some((tk) => tk.length >= 3);
  }

  function resolveReadingCandidateFromInput(raw = "", candidates = [], options = {}) {
    const strict = options?.strict === true;
    const list = Array.isArray(candidates) ? candidates : [];
    if (!list.length) return null;
    const norm = normalizeText(raw);
    if (!norm) return null;
    const directNumber = norm.match(/\b(?:lectura|opcion|opción|numero|número)\s+([a-z0-9º°]+)\b/i);
    const numberToken = String(directNumber?.[1] || "").trim();
    const numberRaw = normalizeOrdinal(numberToken) || normalizeOrdinal(norm) || numberToken;
    const numberFallback = norm.match(/\b([1-9][0-9]{0,2})\b/)?.[1] || "";
    const strictBareNumber = /^([1-9][0-9]{0,2}|[a-z0-9º°]+)$/i.test(norm) && !!normalizeOrdinal(norm);
    const asNumber = Number(numberRaw || numberFallback || 0);
    if (Number.isFinite(asNumber) && asNumber >= 1 && asNumber <= list.length) {
      if (strict && !numberToken && !strictBareNumber && !/^[1-9][0-9]{0,2}$/.test(norm)) {
        return null;
      }
      return list[asNumber - 1];
    }
    if (strict && !looksLikeBareReadingTitle(raw)) return null;
    let best = null;
    let bestScore = 0;
    list.forEach((it) => {
      const titleNorm = normalizeText(it?.titulo || "");
      if (!titleNorm) return;
      let score = 0;
      if (titleNorm === norm) score += 20;
      if (titleNorm.includes(norm) || norm.includes(titleNorm)) score += 12;
      norm.split(/\s+/).filter((tk) => tk.length > 2).forEach((tk) => {
        if (titleNorm.includes(tk)) score += 2;
      });
      if (score > bestScore) {
        best = it;
        bestScore = score;
      }
    });
    return bestScore >= 4 ? best : null;
  }

  function syncReadingWorkflowState(agentId = 0) {
    if (typeof deps.getReadingWorkflowState !== "function") return "";
    const wfState = deps.getReadingWorkflowState();
    const nextStep = readingWorkflowStepFromState(wfState);
    if (!nextStep) return "";
    updateAgentState(agentId, {
      flow: "reading_action",
      step: nextStep
    });
    return nextStep;
  }

  function buildStageOptions(agentState = null) {
    const flow = String(agentState?.flow || "idle").trim();
    const step = String(agentState?.step || "await_action").trim();
    const readingWorkflowState = flow === "reading_action" && typeof deps.getReadingWorkflowState === "function"
      ? deps.getReadingWorkflowState()
      : null;
    const readingCandidates = getReadingWorkflowCandidates(readingWorkflowState);
    const options = [];
    const add = (label = "", prompt = "", hint = "", extra = {}) => {
      if (!label || !prompt) return;
      options.push({ label, prompt, hint: hint || `Siguiente paso: ${prompt}.`, ...(extra || {}) });
    };
    const addReadingCandidateCards = () => {
      if (!readingCandidates.length) return;
      const accents = ["cool", "mint", "sun", "violet", "rose", "cyan"];
      readingCandidates.forEach((cand, idx) => {
        add(cand.titulo, cand.voiceNumberPrompt, "Di el número o título de la lectura.", {
          section: "Lecturas disponibles",
          kind: "reading_card",
          accent: accents[idx % accents.length],
          readingTitle: cand.titulo,
          readingIndex: cand.visualIndex,
          readingCollection: cand.sourceCollection,
          readingNumberPrompt: cand.voiceNumberPrompt,
          readingTitlePrompt: cand.voiceTitlePrompt
        });
      });
    };

    if (!agentState || flow === "idle") {
      add("Buscar lectura ASC", "buscar lectura asc", "Busca lecturas ASC y luego puedes pedir leer.", {
        section: "Acciones principales",
        accent: "cool"
      });
      add("Buscar lectura Nueva", "buscar lectura nueva", "Busca lecturas nuevas y luego puedes pedir leer.", {
        section: "Acciones principales",
        accent: "mint"
      });
      add("Crear lectura Nueva", "crear una lectura nueva", "Inicia creación de lectura.", {
        section: "Acciones principales",
        accent: "sun"
      });
      add("Buscar unidad Nueva", "buscar unidad nueva", "Abre el flujo de unidad.", {
        section: "Acciones principales",
        accent: "violet"
      });
      add("Crear unidad nueva", "crear unidad nueva", "Genera una unidad desde cero.", {
        section: "Acciones principales",
        accent: "rose"
      });
      add("Limpiar memoria", "limpiar memoria del agente", "Reinicia el contexto guardado del agente.", {
        section: "Acciones principales",
        accent: "mint"
      });
      return options;
    }
    if (flow === "setup" || step === "await_context") {
      add("T1", "trimestre 1", "Selecciona el trimestre 1.", { section: "Trimestre", accent: "warm", compact: true });
      add("T2", "trimestre 2", "Selecciona el trimestre 2.", { section: "Trimestre", accent: "cool", compact: true });
      add("T3", "trimestre 3", "Selecciona el trimestre 3.", { section: "Trimestre", accent: "mint", compact: true });
      for (let unidad = 1; unidad <= 9; unidad += 1) {
        const accents = ["sun", "sky", "rose", "mint", "violet", "amber", "cyan", "peach", "lime"];
        add(`U${unidad}`, `unidad ${unidad}`, `Fija la unidad ${unidad}.`, {
          section: "Unidad",
          accent: accents[(unidad - 1) % accents.length],
          compact: true
        });
      }
      return options;
    }
    if (flow === "create_reading") {
      if (step === "await_title") {
        add("Título", "capturar titulo", "Escribe o dicta el título y presiona guardar.", {
          section: "Título de la Lectura",
          kind: "title_input"
        });
      }
      if (step === "await_words" || step === "await_words_confirm") {
        add("Palabras", "capturar palabras", "Escribe o dicta cuántas palabras debe tener la lectura.", {
          section: "Palabras Objetivo",
          kind: "words_input"
        });
        if (step === "await_words_confirm") {
          add("Siguiente", "siguiente", "Continúa al eje articulador.");
        }
      }
      if (step === "await_tone") {
        const tones = [
          { label: "Académico", prompt: "académico", accent: "cool" },
          { label: "Formal", prompt: "formal", accent: "violet" },
          { label: "Científico", prompt: "científico", accent: "cyan" },
          { label: "Narrativo", prompt: "narrativo", accent: "rose" },
          { label: "Didáctico", prompt: "didáctico", accent: "mint" },
          { label: "Motivador", prompt: "motivador", accent: "sun" },
          { label: "Descriptivo", prompt: "descriptivo", accent: "peach" }
        ];
        tones.forEach((tone) => add(tone.label, tone.prompt, `Usar tono ${tone.label.toLowerCase()}.`, {
          section: "Tonos Sugeridos",
          kind: "tone_card",
          accent: tone.accent
        }));
      }
      if (step === "await_eje") {
        const ejes = [
          { label: "Inclusión", prompt: "inclusión", accent: "mint" },
          { label: "Pensamiento Crítico", prompt: "pensamiento crítico", accent: "cool" },
          { label: "Interculturalidad", prompt: "interculturalidad crítica", accent: "rose" },
          { label: "Igualdad de Género", prompt: "igualdad de género", accent: "violet" },
          { label: "Vida Saludable", prompt: "vida saludable", accent: "sun" },
          { label: "Apropiación Cultural", prompt: "apropiación de las culturas", accent: "peach" },
          { label: "Lectura y Escritura", prompt: "fomento a la lectura y escritura", accent: "cyan" },
          { label: "Artes y Experiencias", prompt: "artes y experiencias estéticas", accent: "amber" }
        ];
        ejes.forEach((eje) => add(eje.label, eje.prompt, `Usar eje: ${eje.label}.`, {
          section: "Ejes Articuladores",
          kind: "tone_card",
          accent: eje.accent
        }));
      }
      if (step === "await_specs" || step === "await_specs_more") {
        add("Terminar", "listo", "Cierra especificaciones y avanza.");
        add("Sin especificaciones", "ninguna", "Continúa sin especificaciones.");
      }
      if (step === "await_synopsis_more") {
        add("Continuar", "listo", "Usa la sinopsis capturada y avanza.");
        add("Agregar más", "agregar más", "Sigue dictando la sinopsis.");
      }
      if (step === "await_idea_loading") {
        add("Cargando ideas", "esperando ideas", "Preparando opciones de sinopsis...", {
          section: "Ideas de Sinopsis",
          kind: "idea_loading"
        });
      }
      if (step === "await_idea_choice") {
        const ideas = Array.isArray(agentState?.draftLectura?.ideas) ? agentState.draftLectura.ideas : [];
        ideas.slice(0, 4).forEach((idea, idx) => {
          add(
            `Idea ${idx + 1}`,
            `opcion ${idx + 1}`,
            truncateIdeaText(idea?.sinopsis || ""),
            {
              section: "Ideas de Sinopsis",
              kind: "idea_card",
              ideaIndex: idx,
              applyPrompt: `opcion ${idx + 1}`,
              refinePrompt: `refinar idea ${idx + 1}`
            }
          );
        });
      }
      if (step === "await_author") {
        const candidates = authorCandidatesFromForm();
        add("Autor recomendado", "autor recomendado", "Seleccionar automáticamente según la sinopsis.", {
          section: "Autores de Referencia",
          accent: "cool",
          compact: true
        });
        candidates.slice(0, 36).forEach((candidate, idx) => {
          const authorLabel = String(candidate.autor || `Autor ${idx + 1}`).trim();
          add(`${idx + 1}. ${authorLabel}`, `autor ${idx + 1}`, candidate.tipoTexto || "Estilo sugerido", {
            section: "Autores de Referencia",
            accent: ["sun", "mint", "cool", "rose", "amber", "violet"][idx % 6],
            compact: true
          });
        });
      }
      if (step === "await_generate_confirm") {
        add("Generar así", "generar así", "Confirma y abre el formulario.");
        add("Ajustar sinopsis", "ajustar sinopsis", "Regresa al paso de ideas.");
        add("Ajustar datos", "ajustar datos", "Elige qué bloque deseas ajustar.");
      }
      if (step === "await_adjust_target") {
        add("Sinopsis", "ajustar sinopsis", "Volver a ideas.");
        add("Tono", "ajustar tono", "Volver a tono.");
        add("Palabras", "ajustar palabras", "Volver a palabras.");
        add("Eje", "ajustar eje", "Volver a eje.");
        add("Autor", "ajustar autor", "Volver a autor.");
      }
      if (step === "await_form_confirm") {
        add("Generar lectura ahora", "generar lectura ahora", "Confirma los datos y genera.");
        add("Ajustar datos", "ajustar datos", "Regresa al resumen para ajustar.");
      }
      if (step === "await_agent_generating") {
        add("Generando lectura", "esperando", "La lectura se está generando...", {
          section: "Estado de Generación",
          kind: "idea_loading"
        });
      }
      if (step === "await_agent_result") {
        add("Vista previa", "preview", agentState?.draftLectura?.generatedPreview || "Lectura generada lista.", {
          section: "Lectura Generada",
          kind: "generated_preview"
        });
        add("Guardar lectura", "guardar lectura", "Guardar en lecturas nuevas.", { section: "Lectura Generada" });
        add("Leer lectura", "leer lectura", "Leer el resultado completo.", { section: "Lectura Generada" });
      }
      return options;
    }
    if (flow === "reading_action") {
      if (step === "await_collection") {
        add("Es ASC", "asc", "Usa la colección ASC.");
        add("Es nueva", "nueva", "Usa la colección de lecturas nuevas.");
        addReadingCandidateCards();
      }
      if (step === "await_title") {
        addReadingCandidateCards();
      }
      if (step === "await_reading_selection") {
        add("Sí, esa lectura", "sí", "Confirmar lectura sugerida.");
        add("No, otra opción", "no", "Ver siguiente lectura sugerida.");
      }
      if (step === "await_reading_action") {
        add("Ver lectura", "ver lectura", "Abre el editor con la lectura.");
        add("Leer lectura", "leer lectura", "Inicia lectura en voz.");
        add("Editar lectura", "editar lectura", "Abre edición de la lectura.");
        add("Exportar Word", "exportar word lectura", "Descarga la lectura en Word.");
        add("Resumen lectura", "resumen lectura", "Escucha un resumen breve de la lectura.");
        add("Profundizar lectura", "profundizar lectura", "Inicia conversación para profundizar la lectura.");
        add("Analizar lectura", "analiza lectura", "Inicia análisis guiado en 5 preguntas: coherencia, incoherencias, punto de vista, evidencia y mejoras.");
        add("Crear unidad desde lectura", "crear unidad a partir de esta lectura", "Vincula esta lectura y pasa al flujo de unidad.");
      }
      return options;
    }
    if (flow === "generate_unit") {
      if (step === "await_global_resources") {
        add("Todos los recursos", "si", "Activa fichas, anexos, recortables y videos.");
        add("Sin recursos", "ninguno", "Desactiva recursos globales.");
      }
      if (step === "await_resource_adjustments") {
        add("Continuar", "continuar", "Pasa a la lectura de la unidad.");
      }
      if (step === "await_unit_lecture" || step === "await_unit_lecture_collection") {
        add("Buscar en ASC", "asc", "Usa la colección ASC.");
        add("Buscar en nuevas", "nueva", "Usa lecturas nuevas.");
      }
      if (step === "await_generation_mode") {
        add("Unidad completa", "unidad completa", "Genera toda la unidad.");
      }
      return options;
    }
    return options;
  }

  function renderStageOptions() {
    const { options: optionsEl, visual, text } = els();
    if (!optionsEl) return;
    if (!state.stage.isOpen || !state.activeAgentId) {
      optionsEl.innerHTML = "";
      return;
    }
    const agentState = getAgentState(state.activeAgentId);
    if (visual) {
      visual.dataset.flow = String(agentState?.flow || "idle").trim();
      visual.dataset.step = String(agentState?.step || "await_action").trim();
    }
    const options = buildStageOptions(agentState);
    if (text && state.stage.currentMode === "listening") {
      const stepHint = options.find((entry) => String(entry?.hint || "").trim())?.hint
        || "Escuchando tu instrucción.";
      text.textContent = stepHint;
    }
    optionsEl.innerHTML = "";
    const sectionMap = new Map();
    options.forEach((entry, index) => {
      const sectionName = String(entry.section || "").trim() || "__default__";
      if (!sectionMap.has(sectionName)) {
        let host = optionsEl;
        if (sectionName === "__default__") {
          const grid = document.createElement("div");
          grid.className = `unidad-agent-stage-option-grid${entry.compact ? " is-compact" : ""}`;
          grid.dataset.defaultGrid = "1";
          optionsEl.appendChild(grid);
          host = grid;
        } else {
          const section = document.createElement("section");
          section.className = "unidad-agent-stage-option-section";
        section.innerHTML = `<div class="unidad-agent-stage-option-section-title">${sectionName}</div><div class="unidad-agent-stage-option-grid${entry.compact ? " is-compact" : ""}"></div>`;
          optionsEl.appendChild(section);
          host = section.querySelector(".unidad-agent-stage-option-grid");
          if (sectionName === "Ideas de Sinopsis") host?.classList?.add("is-ideas");
          if (sectionName === "Autores de Referencia") host?.classList?.add("is-authors");
          if (sectionName === "Lecturas disponibles") host?.classList?.add("is-readings");
        }
        sectionMap.set(sectionName, host);
      }
      if (entry.kind === "reading_card") {
        const card = document.createElement("article");
        card.className = "unidad-agent-reading-card";
        if (entry.accent) card.dataset.accent = entry.accent;
        card.tabIndex = 0;
        card.setAttribute("role", "button");
        card.setAttribute("aria-label", `Elegir lectura ${Number(entry.readingIndex || index + 1)}: ${String(entry.readingTitle || entry.label || "").trim()}`);
        card.innerHTML = `<h4 class="unidad-agent-reading-card-title">${escapeHtml(entry.readingTitle || entry.label || "")}</h4>`;
        const pickByNumber = () => {
          const prompt = String(entry.readingNumberPrompt || entry.prompt || "").trim();
          if (!prompt) return;
          handleVoiceTranscript(prompt, normalizeText(prompt), { bypassBlock: true, source: "ui-reading-number" }).catch(() => {});
        };
        card.addEventListener("click", () => pickByNumber());
        card.addEventListener("keydown", (ev) => {
          if (ev.key !== "Enter" && ev.key !== " ") return;
          ev.preventDefault();
          pickByNumber();
        });
        sectionMap.get(sectionName)?.appendChild(card);
        return;
      }
      if (entry.kind === "idea_card") {
        const card = document.createElement("article");
        card.className = "unidad-agent-idea-card";
        card.innerHTML = `
          <div class="unidad-agent-idea-card-head">
            <span class="unidad-agent-idea-card-tag">Idea ${Number(entry.ideaIndex || 0) + 1}</span>
          </div>
          <p class="unidad-agent-idea-card-text">${entry.hint || ""}</p>
          <div class="unidad-agent-idea-card-actions">
            <button type="button" class="unidad-agent-idea-btn is-apply" title="Aplicar idea" aria-label="Aplicar idea">✓</button>
            <button type="button" class="unidad-agent-idea-btn is-refine" title="Refinar idea" aria-label="Refinar idea">✦</button>
            <button type="button" class="unidad-agent-idea-btn is-read" title="Leer idea completa" aria-label="Leer idea completa">🔊</button>
          </div>
        `;
        const applyBtn = card.querySelector(".unidad-agent-idea-btn.is-apply");
        const refineBtn = card.querySelector(".unidad-agent-idea-btn.is-refine");
        const readBtn = card.querySelector(".unidad-agent-idea-btn.is-read");
        applyBtn?.addEventListener("click", () => {
          const prompt = String(entry.applyPrompt || entry.prompt || "").trim();
          if (!prompt) return;
          debug("ui-idea-apply", { key: `ui-idea-apply-${index}`, prompt }, 0);
          handleVoiceTranscript(prompt, normalizeText(prompt), { bypassBlock: true, source: "ui-idea-apply" }).catch(() => {});
        });
        refineBtn?.addEventListener("click", () => {
          const prompt = String(entry.refinePrompt || "").trim();
          if (!prompt) return;
          debug("ui-idea-refine", { key: `ui-idea-refine-${index}`, prompt }, 0);
          handleVoiceTranscript(prompt, normalizeText(prompt), { bypassBlock: true, source: "ui-idea-refine" }).catch(() => {});
        });
        readBtn?.addEventListener("click", () => {
          const prompt = `leer idea ${Number(entry.ideaIndex || 0) + 1}`;
          debug("ui-idea-read", { key: `ui-idea-read-${index}`, prompt }, 0);
          handleVoiceTranscript(prompt, normalizeText(prompt), { bypassBlock: true, source: "ui-idea-read" }).catch(() => {});
        });
        sectionMap.get(sectionName)?.appendChild(card);
        return;
      }
      if (entry.kind === "idea_loading") {
        const wrap = document.createElement("article");
        wrap.className = "unidad-agent-ideas-loading";
        wrap.innerHTML = `
          <div class="unidad-agent-ideas-loading-bar"></div>
          <div class="unidad-agent-ideas-loading-grid">
            <div class="unidad-agent-ideas-loading-card"></div>
            <div class="unidad-agent-ideas-loading-card"></div>
            <div class="unidad-agent-ideas-loading-card"></div>
            <div class="unidad-agent-ideas-loading-card"></div>
          </div>
          <p class="unidad-agent-ideas-loading-text">Creando ideas creativas para tu sinopsis...</p>
        `;
        sectionMap.get(sectionName)?.appendChild(wrap);
        return;
      }
      if (entry.kind === "generated_preview") {
        const card = document.createElement("article");
        card.className = "unidad-agent-generated-preview";
        card.innerHTML = `
          <h4 class="unidad-agent-generated-preview-title">Lectura generada</h4>
          <div class="unidad-agent-generated-preview-body">${escapeHtml(entry.hint || "Sin contenido generado.")}</div>
        `;
        sectionMap.get(sectionName)?.appendChild(card);
        return;
      }
      if (entry.kind === "tone_card") {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "unidad-agent-tone-card";
        if (entry.accent) btn.dataset.accent = entry.accent;
        btn.dataset.agentPrompt = entry.prompt;
        btn.innerHTML = `<span class="unidad-agent-tone-card-label">${entry.label}</span>`;
        btn.title = entry.hint || "";
        btn.setAttribute("aria-label", entry.hint || entry.label || "Seleccionar tono");
        btn.addEventListener("click", () => {
          const prompt = String(entry.prompt || "").trim();
          if (!prompt) return;
          debug("ui-tone", { key: `ui-tone-${index}`, prompt }, 0);
          handleVoiceTranscript(prompt, normalizeText(prompt), { bypassBlock: true, source: "ui-tone" }).catch(() => {});
        });
        sectionMap.get(sectionName)?.appendChild(btn);
        return;
      }
      if (entry.kind === "title_input") {
        const card = document.createElement("article");
        card.className = "unidad-agent-stage-input-card";
        card.innerHTML = `
          <label class="unidad-agent-stage-input-label" for="unidadAgentStageTitleInput">Título</label>
          <div class="unidad-agent-stage-input-row">
            <input id="unidadAgentStageTitleInput" class="unidad-agent-stage-input" type="text" maxlength="160" placeholder="Ejemplo: El ciclo del agua en mi comunidad" />
            <button type="button" class="unidad-agent-stage-input-btn">Guardar</button>
          </div>
          <p class="unidad-agent-stage-input-hint">También puedes decir el título por voz y se escribirá aquí.</p>
        `;
        const input = card.querySelector("#unidadAgentStageTitleInput");
        const btn = card.querySelector(".unidad-agent-stage-input-btn");
        if (input) input.value = String(agentState?.draftLectura?.titulo || "");
        const submitTitle = () => {
          const value = String(input?.value || "").trim();
          if (!value) {
            input?.focus();
            return;
          }
          debug("ui-title-submit", { key: "ui-title-submit", chars: value.length }, 0);
          handleVoiceTranscript(value, normalizeText(value), { bypassBlock: true, source: "ui-title-submit" }).catch(() => {});
        };
        btn?.addEventListener("click", submitTitle);
        input?.addEventListener("keydown", (ev) => {
          if (ev.key !== "Enter") return;
          ev.preventDefault();
          submitTitle();
        });
        input?.addEventListener("input", () => {
          const current = getAgentState(state.activeAgentId || 0);
          if (!current || current.flow !== "create_reading" || current.step !== "await_title") return;
          updateAgentState(state.activeAgentId, {
            draftLectura: { ...(current.draftLectura || {}), titulo: String(input?.value || "") }
          });
        });
        sectionMap.get(sectionName)?.appendChild(card);
        return;
      }
      if (entry.kind === "words_input") {
        const card = document.createElement("article");
        card.className = "unidad-agent-stage-input-card is-words";
        card.innerHTML = `
          <label class="unidad-agent-stage-input-label" for="unidadAgentStageWordsInput">Palabras objetivo</label>
          <div class="unidad-agent-stage-input-row has-next">
            <input id="unidadAgentStageWordsInput" class="unidad-agent-stage-input" type="number" min="1" max="5000" step="1" placeholder="Ejemplo: 180" />
            <button type="button" class="unidad-agent-stage-input-btn">Guardar</button>
            <button type="button" class="unidad-agent-stage-input-btn is-next">Siguiente</button>
          </div>
          <p class="unidad-agent-stage-input-hint">También puedes dictar el número por voz y se escribirá aquí.</p>
        `;
        const input = card.querySelector("#unidadAgentStageWordsInput");
        const btnSave = card.querySelector(".unidad-agent-stage-input-btn:not(.is-next)");
        const btnNext = card.querySelector(".unidad-agent-stage-input-btn.is-next");
        if (input) input.value = String(agentState?.draftLectura?.palabrasObjetivo || "");
        const submitWords = () => {
          const value = String(input?.value || "").trim();
          if (!value) {
            input?.focus();
            return;
          }
          debug("ui-words-submit", { key: "ui-words-submit", value }, 0);
          handleVoiceTranscript(value, normalizeText(value), { bypassBlock: true, source: "ui-words-submit" }).catch(() => {});
        };
        btnSave?.addEventListener("click", submitWords);
        btnNext?.addEventListener("click", () => {
          const current = getAgentState(state.activeAgentId || 0);
          if (current?.step === "await_words") submitWords();
          handleVoiceTranscript("siguiente", "siguiente", { bypassBlock: true, source: "ui-words-next" }).catch(() => {});
        });
        input?.addEventListener("keydown", (ev) => {
          if (ev.key !== "Enter") return;
          ev.preventDefault();
          submitWords();
        });
        input?.addEventListener("input", () => {
          const current = getAgentState(state.activeAgentId || 0);
          if (!current || current.flow !== "create_reading" || !["await_words", "await_words_confirm"].includes(current.step)) return;
          updateAgentState(state.activeAgentId, {
            draftLectura: { ...(current.draftLectura || {}), palabrasObjetivo: String(input?.value || "") }
          });
        });
        sectionMap.get(sectionName)?.appendChild(card);
        return;
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `unidad-agent-stage-option${entry.compact ? " is-compact" : ""}`;
      if (entry.accent) btn.dataset.accent = entry.accent;
      btn.dataset.agentPrompt = entry.prompt;
      btn.innerHTML = `<span class="unidad-agent-stage-option-label">${entry.label}</span><span class="unidad-agent-stage-option-hint">${entry.hint}</span>`;
      btn.addEventListener("click", () => {
        const prompt = String(entry.prompt || "").trim();
        if (!prompt) return;
        debug("ui-option", { key: `ui-option-${index}`, prompt }, 0);
        const current = getAgentState(state.activeAgentId || 0);
        const isReadingStage = current?.flow === "reading_action"
          && ["await_reading_selection", "await_reading_action"].includes(String(current?.step || ""));
        const promptNorm = normalizeText(prompt);
        const isDirectReadingPrompt = [
          "si",
          "no",
          "cancelar",
          "ver lectura",
          "leer lectura",
          "editar lectura",
          "exportar word lectura",
          "resumen lectura",
          "profundizar lectura",
          "analiza lectura",
          "analizar lectura",
          "crear unidad a partir de esta lectura"
        ].includes(promptNorm);
        if (isReadingStage && isDirectReadingPrompt) {
          processReadingStagePrompt(prompt).catch(() => {});
          return;
        }
        handleVoiceTranscript(prompt, promptNorm, { bypassBlock: true, source: "ui-option" }).catch(() => {});
      });
      sectionMap.get(sectionName)?.appendChild(btn);
    });
  }

  function syncStageTitleInput(value = "") {
    const input = document.getElementById("unidadAgentStageTitleInput");
    if (!input) return;
    const next = String(value || "");
    if (input.value !== next) input.value = next;
  }

  function syncStageWordsInput(value = "") {
    const input = document.getElementById("unidadAgentStageWordsInput");
    if (!input) return;
    const next = String(value || "");
    if (input.value !== next) input.value = next;
  }

  async function processReadingStagePrompt(prompt = "") {
    const agentId = Number(state.activeAgentId || 0);
    if (!agentId || typeof deps.processReadingWorkflowInput !== "function") return false;
    const safePrompt = String(prompt || "").trim();
    const consumed = await deps.processReadingWorkflowInput(safePrompt);
    if (!consumed) {
      const pnorm = normalizeText(safePrompt);
      const stageReadingActions = new Set([
        "ver lectura",
        "leer lectura",
        "editar lectura",
        "exportar word lectura",
        "resumen lectura",
        "profundizar lectura",
        "analiza lectura",
        "analizar lectura",
        "crear unidad a partir de esta lectura"
      ]);
      if (stageReadingActions.has(pnorm)) {
        await speakCurrent("No tengo una lectura confirmada para esa acción. Primero confirma una lectura y luego elige la acción.");
        return true;
      }
      return false;
    }
    const nextStep = syncReadingWorkflowState(agentId);
    if (!nextStep) {
      updateAgentState(agentId, {
        flow: "reading_action",
        step: "await_reading_action"
      });
    }
    markConsumed(prompt);
    return true;
  }

  async function speakCurrent(text = "", options = {}) {
    if (!state.activeAgentId || !text) return false;
    const safeText = String(text || "").trim();
    prepareSpeech(safeText);
    const speechGuardMs = armSelfEchoGuard(safeText);
    const speechSeq = (Number(state.voiceInput.speechSeq || 0) + 1);
    state.voiceInput.speechSeq = speechSeq;
    state.voiceInput.activeSpeechSeq = speechSeq;
    state.voiceInput.playbackStartedSeq = 0;
    state.voiceInput.realtimePlaybackSeq = 0;
    if (options?.blockInputUntilDone === true) {
      const explicitBlockMs = Math.max(0, Number(options?.blockMs || 0));
      const computedBlockMs = Math.max(900, Math.min(3200, speechGuardMs + 420));
      armHardInputBlock(explicitBlockMs || computedBlockMs);
    }
    setMode(state.stage.currentMode === "thinking" ? "thinking" : "speaking", safeText);
    if (state.stage.currentMode !== "thinking") {
      state.stage.forceSpeakUntil = Math.max(state.stage.forceSpeakUntil, performance.now() + speechGuardMs);
      scheduleSpeakingFallback(speechSeq, speechGuardMs + 2200);
    }
    renderStageOptions();
    if (typeof deps.speakAsAgent !== "function") return false;
    const result = await deps.speakAsAgent(safeText, {
      agentId: state.activeAgentId,
      cancelarPrevio: true,
      onPlaybackStart: () => noteSpeechPlaybackStart(speechSeq, "callback"),
      onPlaybackEnd: () => finishSpeakingTurn(speechSeq, "callback-end"),
      onPlaybackError: () => finishSpeakingTurn(speechSeq, "callback-error"),
      ...(options || {})
    });
    if (result === false) finishSpeakingTurn(speechSeq, "no-playback");
    return result;
  }

  function markConsumed(transcripcion = "") {
    if (typeof deps.onCommandConsumed === "function") deps.onCommandConsumed(transcripcion);
  }

  function setAcademicContext(agentId = 0) {
    const agentState = getAgentState(agentId);
    if (!agentState || typeof deps.syncAcademicContext !== "function") return false;
    deps.syncAcademicContext(agentState);
    return true;
  }

  function summarizeContext(agentId = 0) {
    const agentState = getAgentState(agentId);
    if (!agentState) return "";
    return `${agentState.nivel}, ${agentState.grado}, trimestre ${agentState.trimestre || "sin definir"}, unidad ${agentState.unidad || "sin definir"}`;
  }

  function extractNumber(text = "") {
    const raw = String(text || "").trim();
    const m = raw.match(/\b([0-9]{1,4})\b/);
    if (m) return Number(m[1]);
    const normRaw = normalizeText(raw);
    const wordMap = {
      uno: 1,
      una: 1,
      primer: 1,
      primero: 1,
      primera: 1,
      dos: 2,
      segundo: 2,
      segunda: 2,
      tres: 3,
      tercer: 3,
      tercero: 3,
      tercera: 3,
      cuatro: 4,
      cuarto: 4,
      cuarta: 4,
      cinco: 5,
      sexto: 6,
      siete: 7,
      ocho: 8,
      nueve: 9
    };
    for (const [word, num] of Object.entries(wordMap)) {
      if (new RegExp(`\\b${word}\\b`, "i").test(normRaw)) return num;
    }
    const hundredsMap = {
      cien: 100,
      ciento: 100,
      doscientos: 200,
      trescientos: 300,
      cuatrocientos: 400,
      quinientos: 500,
      seiscientos: 600,
      setecientos: 700,
      ochocientos: 800,
      novecientos: 900,
      mil: 1000
    };
    for (const [word, num] of Object.entries(hundredsMap)) {
      if (new RegExp(`\\b${word}\\b`, "i").test(normRaw)) return num;
    }
    const norm = normalizeOrdinal(raw);
    return norm ? Number(norm) : NaN;
  }

  function isYes(text = "") { return /\b(si|sí|claro|ok|de acuerdo|correcto|adelante|vale|por supuesto)\b/i.test(String(text || "")); }
  function isNo(text = "") { return /\b(no|negativo|para nada|todavia no|todavía no|despues|después)\b/i.test(String(text || "")); }

  function extractContext(text = "") {
    const raw = String(text || "");
    const tri = raw.match(/\btrimestre\s*(?:numero\s*)?([123])\b/i) || raw.match(/\bt\s*([123])\b/i);
    const uni = raw.match(/\bunidad\s*(?:numero\s*)?([0-9]{1,2})\b/i) || raw.match(/\bu\s*([0-9]{1,2})\b/i);
    return { trimestre: tri ? String(tri[1]) : "", unidad: uni ? String(uni[1]) : "" };
  }

  function isContextInstruction(text = "", agentState = null) {
    const raw = String(text || "").trim();
    const norm = normalizeText(raw);
    if (!norm) return false;
    if (agentState?.flow === "setup" || agentState?.step === "await_context") return true;
    const contextOnly = norm
      .replace(/\b(y|e|con|del|de|para|numero|número)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (/^(?:(?:trimestre|unidad|t|u)\s*\d+\s*)+$/.test(contextOnly)) return true;
    if (/^(trimestre|unidad|t\s*\d|u\s*\d)\b/i.test(raw)) return true;
    if (/\b(busca|buscar|encuentra|localiza|lee|leer|crea|crear|genera|generar|haz|hacer|analiza|analizar|resumen|cancela|cancelar|regresa|volver)\b/.test(norm)) {
      return false;
    }
    if (/\b(actualiza|actualizar|cambia|cambiar|usa|usar|pon|poner|configura|configurar|guarda|guardar|define|definir|fija|fijar|establece|establecer)\b/.test(norm)
      && (/\btrimestre\b/.test(norm) || /\bunidad\b/.test(norm))) {
      return true;
    }
    return false;
  }

  function isSameAcademicContext(agentState = null, context = {}) {
    if (!agentState) return false;
    const tri = String(context?.trimestre || "").trim();
    const uni = String(context?.unidad || "").trim();
    if (!tri && !uni) return false;
    const sameTri = !tri || String(agentState.trimestre || "").trim() === tri;
    const sameUni = !uni || String(agentState.unidad || "").trim() === uni;
    return sameTri && sameUni;
  }

  function hasPrimaryActionIntent(text = "") {
    const norm = normalizeText(text);
    if (!norm) return false;
    return /\b(busca|buscar|encuentra|localiza|lee|leer|crea|crear|genera|generar|haz|hacer|analiza|analizar|continuar|siguiente|cancela|cancelar|regresa|volver)\b/.test(norm);
  }

  function mentionsAscCollection(text = "") {
    const original = String(text || "").toLowerCase();
    const norm = normalizeText(text);
    if (!norm) return false;
    const tokenized = norm.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
    const compact = tokenized.replace(/\s+/g, "");
    if (!tokenized) return false;
    if (compact.includes("lecturaasc") || compact.includes("lecturasasc")) return true;
    if (/\b(?:asc|ask|asq)\b/.test(tokenized)) return true;
    if (/\ba\s+s\s+[ckq]\b/.test(tokenized)) return true;
    if (/\ba\s+ese\s+(?:ce|c|que|q|ka|k)\b/.test(tokenized)) return true;
    return /\ba\W*s\W*[ckq]\b/.test(original);
  }

  function parseReadingKind(text = "") {
    const t = normalizeText(text);
    if (mentionsAscCollection(t)) return "asc";
    if (/\blecturas?\s+(?:asc|ask|asq|a\s*s\s*[ckq])\b/.test(t)) return "asc";
    if (/\bnueva(s)?\b/.test(t)) return "nueva";
    if (/\blecturas?\s+nueva(s)?\b/.test(t)) return "nueva";
    return "";
  }

  function readingCollectionAllowed(action = "", tipo = "") {
    if (tipo === "asc") return action === "buscar" || action === "leer";
    if (tipo === "nueva") return action === "buscar" || action === "leer";
    return false;
  }

  function authorCandidatesFromForm() {
    const select = document.getElementById("autorReferencia");
    if (!select) return [];
    const out = [];
    Array.from(select.options || []).forEach((opt) => {
      const value = String(opt?.value || "").trim();
      const label = String(opt?.textContent || "").trim();
      if (!value || !label || /^selecciona autor$/i.test(label)) return;
      let parsed = null;
      try { parsed = JSON.parse(value); } catch (_) {}
      out.push({
        value,
        label,
        autor: String(parsed?.autor || label).trim(),
        tipoTexto: String(parsed?.tipoTexto || "").trim(),
        ejemplo: String(parsed?.ejemplo || "").trim()
      });
    });
    return out;
  }

  function scoreAuthorForSynopsis(candidate = {}, draft = {}) {
    const synopsis = normalizeText(`${draft?.sinopsisBase || ""} ${draft?.ideaElegida?.sinopsis || ""}`);
    const tone = normalizeText(draft?.tono || "");
    const corpus = normalizeText(`${candidate?.autor || ""} ${candidate?.tipoTexto || ""} ${candidate?.ejemplo || ""}`);
    if (!corpus) return Math.random() * 0.01;
    let score = 0;
    synopsis.split(/\s+/).filter((w) => w.length > 3).slice(0, 16).forEach((w) => {
      if (corpus.includes(w)) score += 1.1;
    });
    if (tone && corpus.includes(tone)) score += 2;
    if (/\bnarrativ|cuento|histori|aventur|personaje\b/.test(synopsis) && /\bnarrativ|novela|cuento\b/.test(corpus)) score += 2.2;
    if (/\bcientif|experimento|dato|evidencia|analisis\b/.test(synopsis) && /\bcientif|ensayo|divulgacion\b/.test(corpus)) score += 2.2;
    if (/\bdidact|escuela|aprendiz|nino|nina|primaria\b/.test(synopsis) && /\binfantil|didact|pedagog\b/.test(corpus)) score += 2;
    return score;
  }

  function pickRecommendedAuthor(candidates = [], draft = {}) {
    if (!Array.isArray(candidates) || !candidates.length) return null;
    return [...candidates].sort((a, b) => scoreAuthorForSynopsis(b, draft) - scoreAuthorForSynopsis(a, draft))[0] || null;
  }

  function resolveReadingAction(text = "") {
    const t = normalizeText(text);
    const wantsSearch = /\b(buscar|busca|encuentra|localiza|trae)\b/.test(t);
    const wantsRead = /\b(leer|lee|leeme|léeme)\b/.test(t);
    if (wantsSearch) return "buscar";
    if (wantsRead) return "leer";
    return "";
  }

  function isQuickReadingSearch(text = "", kind = "") {
    const t = normalizeText(text);
    if (!t) return false;
    const compact = t.replace(/[^a-z0-9]/g, "");
    const wantsSearch = /\b(buscar|busca|encuentra|localiza|trae)\b/.test(t)
      || compact.startsWith("buscarlectura")
      || compact.includes("buscalectura")
      || compact.includes("buscarlecturas");
    const mentionsLectura = /\blecturas?\b/.test(t) || compact.includes("lectura");
    if (!wantsSearch || !mentionsLectura) return false;
    if (kind === "asc") {
      return mentionsAscCollection(t) || compact.includes("lecturaasc") || compact.includes("lecturasasc");
    }
    if (kind === "nueva") {
      return /\bnueva(s)?\b/.test(t) || compact.includes("lecturanueva") || compact.includes("lecturasnuevas");
    }
    return false;
  }

  function isExplicitReadingWorkflowCommand(text = "") {
    const norm = normalizeText(text);
    if (!norm) return false;
    const exact = new Set([
      "si",
      "sí",
      "no",
      "cancelar",
      "ver lectura",
      "leer lectura",
      "editar lectura",
      "exportar word lectura",
      "resumen lectura",
      "profundizar lectura",
      "analiza lectura",
      "analizar lectura",
      "crear unidad a partir de esta lectura"
    ]);
    if (exact.has(norm)) return true;
    if (/^(ver|leer|editar)\s+lectura\b/.test(norm)) return true;
    if (/^(resumen|profundizar|analiza|analizar)\s+lectura\b/.test(norm)) return true;
    if (/^(exportar|descargar)\s+word\s+lectura\b/.test(norm)) return true;
    if (/^(crear|genera|generar|haz)\b[\s\S]*\bunidad\b/.test(norm)) return true;
    return false;
  }

  function isExplicitReadingSelectionCommand(text = "", candidates = []) {
    const norm = normalizeText(text);
    if (!norm) return false;
    if (/\b(si|sí|no|cancelar|cancela|siguiente|otra)\b/.test(norm)) return true;
    if (resolveReadingCandidateFromInput(text, candidates)) return true;
    return false;
  }

  function isExplicitReadingTitleCommand(text = "", candidates = []) {
    const norm = normalizeText(text);
    if (!norm) return false;
    if (resolveReadingCandidateFromInput(text, candidates, { strict: true })) return true;
    if (/\b(listo|continuar|continua|continúa|siguiente|avanzar|ok)\b/.test(norm)) return true;
    if (/\b(titulo|título|nombre)\b/.test(norm)) return true;
    if (/^(selecciona|elige|escoge|usar|usa|buscar|busca|encuentra|localiza)\b/.test(norm)) return true;
    if (looksLikeBareReadingTitle(text)) return true;
    return false;
  }

  function isBackCommand(text = "") {
    const t = normalizeText(text);
    return /\b(atras|regresa|regresar|regresame|regresate|paso anterior|volver|vuelve|retrocede)\b/.test(t);
  }

  function isCloseAgentCommand(text = "", agentId = 0) {
    const t = normalizeText(text);
    if (!t) return false;
    const personaActiva = persona(agentId);
    const nombreActivo = normalizeText(String(personaActiva?.nombre || "").trim());
    const nombreActivoCorto = nombreActivo.split(/\s+/).filter(Boolean)[0] || "";
    const nombresPersonas = Object.values(state.personas || {})
      .flatMap((p) => {
        const full = normalizeText(String(p?.nombre || "").trim());
        const short = full.split(/\s+/).filter(Boolean)[0] || "";
        return [full, short].filter(Boolean);
      });
    const nombresUnicos = [...new Set(nombresPersonas)];
    const conNombre = [
      nombreActivo,
      nombreActivoCorto,
      ...nombresUnicos
    ].filter(Boolean).some((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t));

    if (/\b(cerrar|cierra|apagar|apaga|callar|calla|silenciar|silencia|mutear|mutea)\s+(?:al\s+)?(?:agente|asistente)\b/.test(t)) {
      return true;
    }
    if (/\b(cerrar|cierra)\s+(?:este\s+)?agente\b/.test(t)) return true;
    if (/\b(apagate|callate|callete|silenciate|muteate)\b/.test(t) && conNombre) return true;
    if (/^\s*(apagate|callate|callete|silenciate|muteate)\s*$/.test(t)) return true;
    return false;
  }

  function previousStepTransition(agentState = null) {
    const flow = String(agentState?.flow || "idle").trim();
    const step = String(agentState?.step || "await_action").trim();
    const hasIdeas = Array.isArray(agentState?.draftLectura?.ideas) && agentState.draftLectura.ideas.length > 0;
    if (flow === "setup" && step === "await_context") {
      return {
        reset: true,
        speech: `Listo, volvimos al inicio. ${actionsCatalogPrompt()}`
      };
    }
    if (flow === "reading_action") {
      if (step === "await_reading_action") return { patch: { step: "await_reading_selection" }, speech: "Volvimos al paso de confirmación de lectura." };
      if (step === "await_reading_selection") return { patch: { step: "await_title" }, speech: "Volvimos un paso. Dime el título de la lectura." };
      if (step === "await_collection") return { patch: { step: "await_title" }, speech: "Volvimos un paso. Dime el título de la lectura." };
      if (step === "await_title") return { reset: true, speech: `Listo, volvimos al inicio. ${actionsCatalogPrompt()}` };
    }
    if (flow === "generate_unit") {
      if (step === "await_generation_mode") return { patch: { step: "await_unit_lecture" }, speech: "Volvimos al paso de lectura para la unidad." };
      if (step === "await_unit_lecture_collection") return { patch: { step: "await_unit_lecture" }, speech: "Volvimos para que me digas otra lectura." };
      if (step === "await_unit_lecture") return { patch: { step: "await_resource_adjustments" }, speech: "Volvimos a ajustes de recursos por categoría." };
      if (step === "await_resource_adjustments") return { patch: { step: "await_global_resources" }, speech: "Volvimos a la configuración global de recursos." };
      if (step === "await_global_resources") return { reset: true, speech: `Listo, volvimos al inicio. ${actionsCatalogPrompt()}` };
    }
    if (flow === "create_reading") {
      if (step === "await_agent_result") return { patch: { step: "await_generate_confirm" }, speech: "Volvimos al resumen para ajustar antes de generar." };
      if (step === "await_agent_generating") return { patch: { step: "await_form_confirm" }, speech: "Detuve ese avance y volvimos a confirmación del formulario." };
      if (step === "await_form_confirm") return { patch: { step: "await_generate_confirm" }, speech: "Volvimos al resumen de datos para ajustar." };
      if (step === "await_adjust_target") return { patch: { step: "await_generate_confirm" }, speech: "Volvimos al resumen para decidir qué ajustar." };
      if (step === "await_generate_confirm") return { patch: { step: "await_author" }, speech: "Volvimos al paso del autor de referencia." };
      if (step === "await_author") return { patch: { step: "await_eje" }, speech: "Volvimos al eje articulador." };
      if (step === "await_eje") return { patch: { step: "await_words_confirm" }, speech: "Volvimos al número de palabras." };
      if (step === "await_words_confirm") return { patch: { step: "await_words" }, speech: "Volvimos para ajustar las palabras objetivo." };
      if (step === "await_words") return { patch: { step: "await_tone" }, speech: "Volvimos al tono de la lectura." };
      if (step === "await_tone") {
        return {
          patch: { step: hasIdeas ? "await_idea_choice" : "await_specs_more" },
          speech: hasIdeas
            ? "Volvimos a las ideas para aplicar, refinar o leer."
            : "Volvimos al bloque de especificaciones."
        };
      }
      if (step === "await_idea_choice") return { patch: { step: "await_specs_more" }, speech: "Volvimos al paso de especificaciones." };
      if (step === "await_idea_loading") return { patch: { step: "await_specs_more" }, speech: "Volvimos a especificaciones mientras se recargan ideas." };
      if (step === "await_specs_more") return { patch: { step: "await_specs" }, speech: "Volvimos para capturar otra especificación." };
      if (step === "await_specs") return { patch: { step: "await_synopsis_more" }, speech: "Volvimos a la sinopsis para ajustarla." };
      if (step === "await_synopsis_more") return { patch: { step: "await_synopsis" }, speech: "Volvimos para seguir dictando la sinopsis." };
      if (step === "await_synopsis") return { patch: { step: "await_title" }, speech: "Volvimos al título de la lectura." };
      if (step === "await_title") return { reset: true, speech: `Listo, volvimos al inicio. ${actionsCatalogPrompt()}` };
    }
    return null;
  }

  async function goToPreviousStep(agentId = 0) {
    const current = getAgentState(agentId);
    if (!current) return false;
    const transition = previousStepTransition(current);
    if (!transition) {
      if (String(current.flow || "idle") === "idle") {
        await speakCurrent("Ya estás en el paso inicial.");
        return true;
      }
      resetWorkflow(agentId);
      await speakCurrent(`No había un paso anterior claro. Volví al inicio. ${actionsCatalogPrompt()}`);
      return true;
    }
    if (transition.reset) resetWorkflow(agentId, transition.extras || {});
    else updateAgentState(agentId, transition.patch || {});
    await speakCurrent(transition.speech || "Volvimos al paso anterior.");
    return true;
  }

  function isNoise(text = "", agentState = null) {
    const raw = String(text || "").trim();
    const norm = normalizeText(raw);
    if (!norm || norm.length <= 2) return true;
    if (/^(eh|emm|mmm|aj[aá]|oye|hola|bueno)$/i.test(norm)) return true;
    const freeSteps = new Set(["await_title", "await_reading_selection", "await_reading_action", "await_synopsis", "await_specs", "await_specs_more", "await_tone", "await_words", "await_words_confirm", "await_eje", "await_unit_lecture", "await_author", "await_generate_confirm", "await_adjust_target", "await_form_confirm", "await_agent_generating", "await_agent_result"]);
    if (freeSteps.has(String(agentState?.step || "").trim())) return norm.length < 3;
    const valid = [
      /\b(si|sí|no|ok|vale|continuar|sigue|cancelar)\b/,
      /\b(buscar|busca|leer|lee|crear|crea|generar|genera)\b/,
      /\b(ajustar|ajusta|afinar|refinar|corregir|autor|estilo|guardar)\b/,
      /\b(asc|ask|asq|nueva|trimestre|unidad|categoria|categoría|contexto|memoria|opciones|ayuda|atras|regresa|volver)\b/,
      /\b(opcion|opción|idea|uno|una|dos|tres|cuatro|primero|primer|primera|segundo|segunda|tercero|tercera|cuarto|cuarta)\b/,
      /\b[0-9]{1,2}\b/
    ];
    return !valid.some((rx) => rx.test(norm));
  }

  function stopThinkingTicker() {
    if (state.thinkingTicker) clearInterval(state.thinkingTicker);
    state.thinkingTicker = null;
  }

  async function generateIdeasWithCompanion(agentState = null) {
    const helper = window.cbAgentLecturaNueva;
    if (!helper?.generarIdeas) return [];
    const prompts = [
      "La la la... voy imaginando posibilidades para tu lectura.",
      "Sigo pensando opciones creativas para la sinopsis.",
      "Estoy hilando ideas para darte buenas propuestas."
    ];
    let idx = 0;
    setMode("thinking", "Estoy imaginando ideas para la sinopsis.");
    stopThinkingTicker();
    state.thinkingTicker = setInterval(() => {
      speakCurrent(prompts[idx % prompts.length], { cancelarPrevio: false }).catch(() => {});
      idx += 1;
    }, 6500);
    try {
      const ideas = await helper.generarIdeas({
        titulo: agentState?.draftLectura?.titulo || "",
        sinopsisActual: agentState?.draftLectura?.sinopsisBase || "",
        especificacionesActuales: agentState?.draftLectura?.especificacionesExtra || "",
        nivel: agentState?.nivel || "Primaria",
        grado: agentState?.grado || "",
        tono: agentState?.draftLectura?.tono || ""
      });
      return Array.isArray(ideas) ? ideas.slice(0, 4) : [];
    } catch (err) {
      log(`⚠️ No se pudieron generar ideas de lectura: ${err?.message || "sin detalle"}`);
      return [];
    } finally {
      stopThinkingTicker();
      if (isExclusive()) setMode("listening", "Ya casi termino con las ideas.");
    }
  }

  async function simulateIdeasLoading(agentId = 0) {
    updateAgentState(agentId, { step: "await_idea_loading" });
    renderStageOptions();
    await speakCurrent("Voy cargando ideas... 🎵 la la la, la la la... un momento.");
    await new Promise((resolve) => setTimeout(resolve, 5200));
  }

  function summarizeIdeas(ideas = []) {
    return ideas.map((idea, idx) => `Opción ${idx + 1}: ${String(idea?.sinopsis || "").trim()}`).join(" ");
  }

  function truncateIdeaText(text = "", max = 92) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (!clean) return "Sin contenido de sinopsis.";
    if (clean.length <= max) return clean;
    return `${clean.slice(0, Math.max(12, max - 3)).trimEnd()}...`;
  }

  function escapeHtml(value = "") {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function toneExamples() {
    return "Académico, formal, científico, narrativo, didáctico, motivador o descriptivo.";
  }

  async function refineIdeaByIndex(agentId = 0, ideaIndex = 0, instruction = "") {
    const agentState = getAgentState(agentId);
    if (!agentState) return false;
    const helper = window.cbAgentLecturaNueva;
    const draft = { ...(agentState.draftLectura || {}) };
    const ideas = Array.isArray(draft.ideas) ? [...draft.ideas] : [];
    const idx = Math.max(0, Math.min(ideas.length - 1, Number(ideaIndex) || 0));
    const currentIdea = ideas[idx];
    if (!currentIdea) return false;
    if (!helper?.refinarIdea) {
      await speakCurrent("No tengo disponible el refinador de ideas ahora. Puedes aplicar una idea existente.");
      return true;
    }
    const instruccion = String(instruction || "").trim() || "Hazla más concreta y atractiva para primaria.";
    setMode("thinking", `Refinando idea ${idx + 1}.`);
    try {
      const refined = await helper.refinarIdea({
        ideaActual: currentIdea,
        instruccion: instruccion,
        titulo: draft.titulo || "",
        sinopsisActual: draft.sinopsisBase || "",
        especificacionesActuales: draft.especificacionesExtra || "",
        nivel: agentState.nivel || "Primaria",
        grado: agentState.grado || "",
        tono: draft.tono || "",
        historial: Array.isArray(currentIdea?._historialRefinamiento) ? currentIdea._historialRefinamiento : []
      });
      if (!refined?.sinopsis) {
        setMode("listening");
        await speakCurrent(`No pude refinar la idea ${idx + 1}. Puedes aplicar otra o volver a intentar.`);
        return true;
      }
      ideas[idx] = refined;
      updateAgentState(agentId, { draftLectura: { ...draft, ideas }, step: "await_idea_choice" });
      setMode("listening");
      await speakCurrent(`Listo. Refiné la idea ${idx + 1}. Ya puedes aplicarla o seguir refinando.`);
      return true;
    } catch (err) {
      setMode("listening");
      debug("idea-refine-error", { key: "idea-refine-error", idx: idx + 1, err: err?.message || "sin_detalle" }, 0);
      await speakCurrent(`No pude refinar la idea ${idx + 1} en este momento.`);
      return true;
    }
  }

  async function readIdeaByIndex(agentId = 0, ideaIndex = 0) {
    const agentState = getAgentState(agentId);
    if (!agentState) return false;
    const ideas = Array.isArray(agentState?.draftLectura?.ideas) ? agentState.draftLectura.ideas : [];
    const idx = Math.max(0, Math.min(ideas.length - 1, Number(ideaIndex) || 0));
    const idea = ideas[idx];
    if (!idea?.sinopsis) {
      await speakCurrent("No encontré esa idea para leerla completa.");
      return true;
    }
    await speakCurrent(`Leyendo idea ${idx + 1}. ${idea.sinopsis}`);
    return true;
  }

  async function readGeneratedReadingByCommand(raw = "") {
    const helper = window.cbAgentLecturaNueva;
    if (!helper?.extractGeneratedReadTarget) return false;
    const target = helper.extractGeneratedReadTarget(raw);
    if (!target?.text) return false;
    const intro = target?.label ? `${target.label}. ` : "";
    await speakCurrent(`${intro}${target.text}`);
    return true;
  }

  async function createReadingFromAgent(agentId = 0) {
    const agentState = getAgentState(agentId);
    if (!agentState) return false;
    const helper = window.cbAgentLecturaNueva;
    const draft = agentState.draftLectura || {};
    const idea = draft.ideaElegida || {};
    helper?.openList?.();
    helper?.openModal?.();
    const assign = (id, value = "", dispatchChange = false) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = value;
      if (dispatchChange) el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const assignSelectLikeUser = (id, value = "") => {
      const el = document.getElementById(id);
      if (!el || value === undefined || value === null) return false;
      const norm = normalizeText(String(value || ""));
      if (!norm) return false;
      let match = Array.from(el.options || []).find((opt) => normalizeText(opt.value || "") === norm);
      if (!match) match = Array.from(el.options || []).find((opt) => normalizeText(opt.textContent || "") === norm);
      if (!match) {
        match = Array.from(el.options || []).find((opt) => {
          const txt = normalizeText(opt.textContent || "");
          return txt && (txt.includes(norm) || norm.includes(txt));
        });
      }
      if (!match) return false;
      el.value = match.value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    };
    assign("tituloNuevo", draft.titulo || idea.titulo_sugerido || "");
    assign("temaNuevo", idea.sinopsis || draft.sinopsisBase || "");
    assign("especificacionesNuevo", [
      ...(Array.isArray(idea.especificaciones) ? idea.especificaciones : []),
      draft.especificacionesExtra || ""
    ].filter(Boolean).join("\n"));
    assign("palabrasNuevo", draft.palabrasObjetivo || "");
    if (typeof deps.syncReadingDraftContext === "function") deps.syncReadingDraftContext(agentState);
    assignSelectLikeUser("nivelNuevo", agentState?.nivel || "Primaria");
    assignSelectLikeUser("gradoNuevo", agentState?.grado || "");
    assignSelectLikeUser("trimestreNuevo", agentState?.trimestre || "");
    assignSelectLikeUser("unidadNuevo", agentState?.unidad || "");
    assignSelectLikeUser("ejeArticulador", draft.ejeArticulador || "");
    if (draft.autorReferenciaValue) assignSelectLikeUser("autorReferencia", draft.autorReferenciaValue);
    else if (draft.autorReferenciaLabel) assignSelectLikeUser("autorReferencia", draft.autorReferenciaLabel);
    updateAgentState(agentId, { draftLectura: draft, step: "await_form_confirm" });
    await speakCurrent("Abrí el formulario y cargué todos los datos. Revísalos y di generar lectura ahora para continuar.");
    return true;
  }

  async function startCreateReading(agentId = 0) {
    const agentState = getAgentState(agentId);
    if (!agentState) return false;
    if (!agentState.trimestre || !agentState.unidad) {
      updateAgentState(agentId, { flow: "setup", step: "await_context", pendingIntent: "crear_lectura_nueva" });
      await speakCurrent("Antes de crear la lectura, necesito que me indiques trimestre y unidad.");
      return true;
    }
    updateAgentState(agentId, {
      flow: "create_reading",
      step: "await_title",
      pendingIntent: "",
      draftLectura: { ...createBaseState(agentId).draftLectura, tipo: "nueva" }
    });
    await speakCurrent("Vamos a crear una lectura nueva. Primero dime el título.");
    return true;
  }

  async function startGenerateUnit(agentId = 0) {
    const agentState = getAgentState(agentId);
    if (!agentState) return false;
    if (!agentState.trimestre || !agentState.unidad) {
      updateAgentState(agentId, { flow: "setup", step: "await_context", pendingIntent: "generar_unidad" });
      await speakCurrent("Antes de generar la unidad, necesito trimestre y unidad.");
      return true;
    }
    if (typeof deps.openUnitSection === "function") deps.openUnitSection();
    setAcademicContext(agentId);
    updateAgentState(agentId, { flow: "generate_unit", step: "await_global_resources" });
    await speakCurrent("Para esta unidad, ¿quieres que todas las categorías lleven fichas, anexos, recortables y videos, o deseas remover algo?");
    return true;
  }

  async function executeReadingAction(agentId = 0, action = "", raw = "") {
    const explicitCollectionInRaw = parseReadingKind(raw);
    if (explicitCollectionInRaw && typeof deps.clearReadingWorkflowState === "function") {
      deps.clearReadingWorkflowState();
    }
    let preferCollection = typeof deps.preferCollectionFromText === "function" ? deps.preferCollectionFromText(raw) || "" : "";
    if (!preferCollection) {
      const kindBySpeech = parseReadingKind(raw);
      if (kindBySpeech === "asc") preferCollection = "lecturasASC";
      if (kindBySpeech === "nueva") preferCollection = "lecturasNuevas";
    }
    const extractedTitle = typeof deps.extractTitleFromCommand === "function" ? deps.extractTitleFromCommand(raw, raw) || "" : "";
    const title = String(extractedTitle || "").trim();
    if (title) updateAgentState(agentId, { readingTitleCache: title });
    if (!preferCollection) {
      updateAgentState(agentId, {
        flow: "reading_action",
        step: "await_collection",
        pendingReadingAction: { accion: action, titulo: title || "", coleccion: "" }
      });
      await speakCurrent("Antes de seguir, dime si la lectura es ASC o lectura nueva.");
      return true;
    }
    if (!title) {
      // Evita arrastrar títulos viejos cuando esta solicitud no trajo título explícito.
      const cachedTitle = "";
      if (typeof deps.executeReadingAction === "function") {
        try {
          await deps.executeReadingAction("buscar", preferCollection, "", raw);
        } catch (_) {}
      }
      updateAgentState(agentId, {
        flow: "reading_action",
        step: "await_title",
        pendingReadingAction: { accion: action, titulo: cachedTitle || "", coleccion: preferCollection }
      });
      await speakCurrent(`Listo, ya estoy en ${preferCollection === "lecturasASC" ? "lecturas ASC" : "lecturas nuevas"}. Dime el título de la lectura o elige una por número.`);
      return true;
    }
    const tipo = preferCollection === "lecturasASC" ? "asc" : "nueva";
    if (!readingCollectionAllowed(action, tipo)) {
      await speakCurrent(tipo === "asc" ? "Con lecturas ASC solo puedo buscar y leer." : "Con lecturas nuevas aquí puedo buscar y leer. Para crear, usa Crear lectura Nueva.");
      return true;
    }
    if (typeof deps.executeReadingAction !== "function") return false;
    const ok = !!(await deps.executeReadingAction(action, preferCollection, title, raw));
    if (!ok) return false;
    const nextStep = syncReadingWorkflowState(agentId);
    if (!nextStep) {
      updateAgentState(agentId, {
        flow: "reading_action",
        step: "await_reading_action"
      });
    }
    return true;
  }

  async function handleSetup(agentId = 0, raw = "", text = "") {
    const data = extractContext(raw || text);
    const patch = {};
    if (data.trimestre) patch.trimestre = data.trimestre;
    if (data.unidad) patch.unidad = data.unidad;
    if (Object.keys(patch).length) updateAgentState(agentId, patch);
    const refreshed = getAgentState(agentId);
    setAcademicContext(agentId);
    if (!refreshed.trimestre || !refreshed.unidad) {
      const missing = [];
      if (!refreshed.trimestre) missing.push("el trimestre");
      if (!refreshed.unidad) missing.push("la unidad");
      await speakCurrent(`Aún me falta ${missing.join(" y ")}. Dímelo para continuar.`);
      return true;
    }
    const pendingIntent = refreshed.pendingIntent || "";
    resetWorkflow(agentId);
    if (pendingIntent === "generar_unidad") return startGenerateUnit(agentId);
    if (pendingIntent === "crear_lectura_nueva") return startCreateReading(agentId);
    await speakCurrent(`Perfecto. Guardé ${summarizeContext(agentId)}.`);
    return true;
  }

  async function handleCreateReading(agentId = 0, raw = "") {
    const agentState = getAgentState(agentId);
    if (!agentState || agentState.flow !== "create_reading") return false;
    const draft = { ...(agentState.draftLectura || {}) };
    if (agentState.step === "await_title") {
      draft.titulo = raw.trim();
      syncStageTitleInput(draft.titulo);
      updateAgentState(agentId, { draftLectura: draft, step: "await_synopsis" });
      await speakCurrent("Ahora dime la sinopsis base o tema central de la lectura.");
      return true;
    }
    if (agentState.step === "await_synopsis") {
      draft.sinopsisPartes = Array.isArray(draft.sinopsisPartes) ? draft.sinopsisPartes : [];
      draft.sinopsisPartes.push(raw);
      draft.sinopsisBase = draft.sinopsisPartes.join(" ").trim();
      debug("synopsis-chunk", {
        key: "synopsis-chunk",
        chars: raw.length,
        parts: draft.sinopsisPartes.length
      }, 0);
      updateAgentState(agentId, { draftLectura: draft, step: "await_synopsis_more" });
      await speakCurrent("Perfecto. Capté esa parte de la sinopsis. ¿Deseas agregar más o continuamos?");
      return true;
    }
    if (agentState.step === "await_synopsis_more") {
      if (/\b(listo|continuar|continua|continúa|siguiente|avanzar)\b/i.test(raw)) {
        debug("synopsis-finish", { key: "synopsis-finish", parts: Array.isArray(draft.sinopsisPartes) ? draft.sinopsisPartes.length : 0 }, 0);
        updateAgentState(agentId, { draftLectura: draft, step: "await_specs" });
        await speakCurrent("Ahora dime las especificaciones de la lectura, una por una. Cuando termines, di listo. Si no deseas agregar ninguna, di ninguna.");
        return true;
      }
      if (/\b(agregar|mas|más|si|sí)\b/i.test(raw)) {
        debug("synopsis-more", { key: "synopsis-more", raw }, 320);
        await speakCurrent("Perfecto, dime la siguiente parte de la sinopsis.");
        return true;
      }
      draft.sinopsisPartes = Array.isArray(draft.sinopsisPartes) ? draft.sinopsisPartes : [];
      draft.sinopsisPartes.push(raw);
      draft.sinopsisBase = draft.sinopsisPartes.join(" ").trim();
      debug("synopsis-append", {
        key: "synopsis-append",
        chars: raw.length,
        parts: draft.sinopsisPartes.length
      }, 0);
      updateAgentState(agentId, { draftLectura: draft, step: "await_synopsis_more" });
      await speakCurrent("Anotado. ¿Agregar otra parte de la sinopsis o continuamos?");
      return true;
    }
    if (agentState.step === "await_specs" || agentState.step === "await_specs_more") {
      draft.especificacionesLista = Array.isArray(draft.especificacionesLista) ? draft.especificacionesLista : [];
      if ((/\b(ninguna|ninguno)\b/i.test(raw) && !draft.especificacionesLista.length) || /\b(listo|ya termine|ya terminé|eso es todo|termin[eé]|finalic[eé])\b/i.test(raw)) {
        debug("specs-finish", { key: "specs-finish", total: draft.especificacionesLista.length }, 0);
        draft.especificacionesExtra = draft.especificacionesLista.join("\n");
        await simulateIdeasLoading(agentId);
        const ideas = await generateIdeasWithCompanion({ ...agentState, draftLectura: draft });
        if (ideas.length) {
          updateAgentState(agentId, { draftLectura: { ...draft, ideas }, step: "await_idea_choice" });
          await speakCurrent("Ya generé ideas para la sinopsis. Revisa las tarjetas y elige aplicar o refinar.");
        } else {
          updateAgentState(agentId, { draftLectura: draft, step: "await_tone" });
          await speakCurrent(`No pude generar ideas ahora mismo. Continuemos con el tono. Puedes elegir por ejemplo: ${toneExamples()}`);
        }
        return true;
      }
      if (agentState.step === "await_specs_more" && isYes(raw)) {
        updateAgentState(agentId, { draftLectura: draft, step: "await_specs" });
        await speakCurrent("Perfecto. Dime la siguiente especificación.");
        return true;
      }
      draft.especificacionesLista.push(raw);
      draft.especificacionesExtra = draft.especificacionesLista.join("\n");
      debug("specs-item", {
        key: "specs-item",
        chars: raw.length,
        total: draft.especificacionesLista.length
      }, 0);
      updateAgentState(agentId, { draftLectura: draft, step: "await_specs_more" });
      if (draft.especificacionesLista.length <= 1) {
        await speakCurrent("Anotado. ¿Deseas agregar otra especificación o ya terminaste? Si faltan más, dímelas. Si no, di listo.");
      } else {
        await speakCurrent(Math.random() > 0.5 ? "¿Agregar otra?" : "¿Ya estás listo?");
      }
      return true;
    }
    if (agentState.step === "await_idea_choice") {
      const ideaCount = Array.isArray(draft.ideas) ? draft.ideas.length : 0;
      const rawNorm = normalizeText(raw);
      const extractedNumber = extractNumber(rawNorm || raw);
      const clampIdeaIndex = (num) => {
        const max = Math.max(1, Math.min(4, ideaCount || 4));
        const safe = Number.isFinite(num) ? num : 1;
        return Math.max(1, Math.min(max, safe)) - 1;
      };
      if (/\b(leer|lee|leerla|escuchar|escucha)\b/i.test(rawNorm) && /\b(idea|opcion)\b/i.test(rawNorm)) {
        const idxRead = clampIdeaIndex(extractedNumber);
        return readIdeaByIndex(agentId, idxRead);
      }
      if (/\b(refina|refinar|mejora|mejorar|ajusta|ajustar)\b/i.test(rawNorm)) {
        const idxRef = clampIdeaIndex(extractedNumber);
        const instruction = String(raw || "")
          .replace(/\b(refina|refinar|mejora|mejorar|ajusta|ajustar)\b/ig, "")
          .replace(/\b(idea|opcion|opción)\b/ig, "")
          .replace(/\b([0-9]{1,2}|uno|dos|tres|cuatro|primero|primera|segundo|segunda|tercero|tercera|cuarto|cuarta)\b/ig, "")
          .trim();
        return refineIdeaByIndex(agentId, idxRef, instruction);
      }
      if (/\b(aplica|aplicar|usar|usa|elige|elegir|selecciona|seleccionar)\b/i.test(rawNorm) && /\b(idea|opcion)\b/i.test(rawNorm)) {
        const idxApply = clampIdeaIndex(extractedNumber);
        const applyIdea = Array.isArray(draft.ideas) ? draft.ideas[idxApply] : null;
        if (!applyIdea) {
          await speakCurrent("No encontré esa idea. Elige una idea del uno al cuatro.");
          return true;
        }
        draft.ideaElegida = applyIdea;
        updateAgentState(agentId, { draftLectura: draft, step: "await_tone" });
        await speakCurrent(`Perfecto. Apliqué la idea ${idxApply + 1}. Ahora dime el tono de la lectura. Ejemplos: ${toneExamples()}`);
        return true;
      }
      const idx = clampIdeaIndex(extractedNumber);
      const idea = Array.isArray(draft.ideas) ? draft.ideas[idx] : null;
      if (!idea) {
        await speakCurrent("No capté la opción. Elige una idea del uno al cuatro.");
        return true;
      }
      draft.ideaElegida = idea;
      updateAgentState(agentId, { draftLectura: draft, step: "await_tone" });
      await speakCurrent(`Perfecto. Ahora dime el tono de la lectura. Ejemplos: ${toneExamples()}`);
      return true;
    }
    if (agentState.step === "await_tone") {
      draft.tono = raw;
      updateAgentState(agentId, { draftLectura: draft, step: "await_words" });
      await speakCurrent("¿Cuántas palabras debe tener la lectura? Dímelo con un número aproximado.");
      return true;
    }
    if (agentState.step === "await_words") {
      if (/\b(siguiente|continuar|continua|continúa|avanzar)\b/i.test(raw) && String(draft.palabrasObjetivo || "").trim()) {
        updateAgentState(agentId, { draftLectura: draft, step: "await_eje" });
        await speakCurrent("Perfecto. Ahora dime cuál eje articulador deseas usar.");
        return true;
      }
      const number = extractNumber(raw);
      draft.palabrasObjetivo = Number.isFinite(number) && number > 0 ? String(number) : String(draft.palabrasObjetivo || "").trim();
      syncStageWordsInput(draft.palabrasObjetivo);
      if (!draft.palabrasObjetivo) {
        await speakCurrent("No capté un número válido. Dímelo de nuevo o escríbelo en el campo.");
        return true;
      }
      updateAgentState(agentId, { draftLectura: draft, step: "await_words_confirm" });
      await speakCurrent(`Anoté ${draft.palabrasObjetivo} palabras aproximadas. ¿Deseas continuar al siguiente paso? Puedes decir sí o presionar Siguiente.`);
      return true;
    }
    if (agentState.step === "await_words_confirm") {
      if (/\b(siguiente|continuar|continua|continúa|avanzar)\b/i.test(raw) || isYes(raw)) {
        updateAgentState(agentId, { draftLectura: draft, step: "await_eje" });
        await speakCurrent("Perfecto. Ahora dime cuál eje articulador deseas usar.");
        return true;
      }
      if (isNo(raw)) {
        updateAgentState(agentId, { draftLectura: draft, step: "await_words" });
        await speakCurrent("De acuerdo. Ajusta el número de palabras y cuando estés listo di siguiente.");
        return true;
      }
      const number = extractNumber(raw);
      if (Number.isFinite(number) && number > 0) {
        draft.palabrasObjetivo = String(number);
        syncStageWordsInput(draft.palabrasObjetivo);
        updateAgentState(agentId, { draftLectura: draft, step: "await_words_confirm" });
        await speakCurrent(`Actualicé a ${draft.palabrasObjetivo} palabras. ¿Continuamos al siguiente paso?`);
        return true;
      }
      await speakCurrent("Respóndeme si deseas continuar, o dime un nuevo número de palabras.");
      return true;
    }
    if (agentState.step === "await_eje") {
      draft.ejeArticulador = raw;
      updateAgentState(agentId, { draftLectura: draft, step: "await_author" });
      await speakCurrent("Perfecto. Ahora dime qué autor de referencia deseas usar. Puedes decir autor recomendado o autor con número.");
      return true;
    }
    if (agentState.step === "await_author") {
      const candidates = authorCandidatesFromForm();
      const rawNorm = normalizeText(raw);
      let selected = null;
      if (/\b(recomendado|automatico|automático|random|aleatorio)\b/i.test(rawNorm)) {
        selected = pickRecommendedAuthor(candidates, draft);
      } else {
        const idx = extractNumber(rawNorm);
        if (Number.isFinite(idx) && idx > 0 && idx <= candidates.length) selected = candidates[idx - 1];
        if (!selected) selected = candidates.find((c) => normalizeText(c.autor).includes(rawNorm) || rawNorm.includes(normalizeText(c.autor)));
      }
      if (!selected && candidates.length) {
        await speakCurrent("No detecté ese autor. Puedes decir autor recomendado o autor 1, autor 2, etc.");
        return true;
      }
      draft.autorReferenciaLabel = String(selected?.autor || "").trim();
      draft.autorReferenciaValue = String(selected?.value || "").trim();
      updateAgentState(agentId, { draftLectura: draft, step: "await_generate_confirm" });
      const idea = draft.ideaElegida || {};
      await speakCurrent(`Resumen: título ${draft.titulo}; sinopsis ${idea.sinopsis || draft.sinopsisBase}; especificaciones ${draft.especificacionesExtra || "ninguna"}; tono ${draft.tono || idea.tono_sugerido || "sin definir"}; palabras ${draft.palabrasObjetivo || "libres"}; eje ${draft.ejeArticulador || "sin definir"}; autor ${draft.autorReferenciaLabel || "libre IA"}. ¿La genero así o qué deseas ajustar?`);
      return true;
    }
    if (agentState.step === "await_generate_confirm") {
      const rawNorm = normalizeText(raw);
      const wantsAdjustSynopsis = /\b(ajustar|ajusta|afinar|refinar|corregir)\b/i.test(rawNorm) && /\b(sinopsis|idea|ideas)\b/i.test(rawNorm);
      const wantsAdjust = isNo(raw) || /\b(ajustar|ajusta|ajuste|cambiar|cambia|editar|refinar|afinar|corregir)\b/i.test(rawNorm);
      const wantsGenerate = isYes(raw) || /\b(generar|genera|crear|crea|haz|ház)\b/i.test(rawNorm) || /\b(asi|así)\b/i.test(rawNorm);
      if (wantsAdjustSynopsis) {
        updateAgentState(agentId, { draftLectura: draft, step: "await_idea_choice" });
        await speakCurrent("Perfecto. Regresamos a ideas para afinar, leer o aplicar la sinopsis.");
        return true;
      }
      if (wantsAdjust) {
        updateAgentState(agentId, { draftLectura: draft, step: "await_adjust_target" });
        await speakCurrent("¿Qué deseas ajustar? Puedes decir: ajustar sinopsis, ajustar tono, ajustar palabras, ajustar eje o ajustar autor.");
        return true;
      }
      if (wantsGenerate) return createReadingFromAgent(agentId);
      await speakCurrent("Respóndeme con generar así, o dime qué deseas ajustar. Ejemplo: ajustar sinopsis.");
      return true;
    }
    if (agentState.step === "await_adjust_target") {
      const rawNorm = normalizeText(raw);
      if (/\b(sinopsis|idea|ideas)\b/i.test(rawNorm)) {
        updateAgentState(agentId, { draftLectura: draft, step: "await_idea_choice" });
        await speakCurrent("Listo. Volvemos a ideas para ajustar la sinopsis.");
        return true;
      }
      if (/\btono\b/i.test(rawNorm)) {
        updateAgentState(agentId, { draftLectura: draft, step: "await_tone" });
        await speakCurrent(`Perfecto. Dime el nuevo tono. Ejemplos: ${toneExamples()}`);
        return true;
      }
      if (/\bpalabra|extension|extensi[oó]n\b/i.test(rawNorm)) {
        updateAgentState(agentId, { draftLectura: draft, step: "await_words" });
        await speakCurrent("Dime el nuevo número de palabras objetivo.");
        return true;
      }
      if (/\beje\b/i.test(rawNorm)) {
        updateAgentState(agentId, { draftLectura: draft, step: "await_eje" });
        await speakCurrent("Perfecto. Dime el eje articulador.");
        return true;
      }
      if (/\bautor\b/i.test(rawNorm)) {
        updateAgentState(agentId, { draftLectura: draft, step: "await_author" });
        await speakCurrent("Perfecto. Dime el autor de referencia o di autor recomendado.");
        return true;
      }
      await speakCurrent("Indícame qué deseas ajustar: sinopsis, tono, palabras, eje o autor.");
      return true;
    }
    if (agentState.step === "await_form_confirm") {
      const rawNorm = normalizeText(raw);
      if ((/\b(generar|genera|confirmar|confirma|listo)\b/i.test(rawNorm) && /\b(lectura|ahora)?\b/i.test(rawNorm)) || /\bgenerar lectura ahora\b/i.test(rawNorm)) {
        const helper = window.cbAgentLecturaNueva;
        const started = typeof helper?.startAgentGeneration === "function" ? helper.startAgentGeneration() : false;
        if (!started) {
          await speakCurrent("No pude iniciar la generación desde el formulario. Verifica que siga abierto y vuelve a intentarlo.");
          return true;
        }
        updateAgentState(agentId, { draftLectura: draft, step: "await_agent_generating" });
        await speakCurrent("Perfecto. Estoy generando tu lectura ahora mismo.");
        return true;
      }
      if (/\b(ajustar|ajusta|editar|cambiar)\b/i.test(rawNorm)) {
        updateAgentState(agentId, { draftLectura: draft, step: "await_generate_confirm" });
        await speakCurrent("Regresamos al resumen para ajustar lo necesario.");
        return true;
      }
      await speakCurrent("Si confirmas los datos, di generar lectura ahora. Si no, di ajustar datos.");
      return true;
    }
    if (agentState.step === "await_agent_result") {
      const rawNorm = normalizeText(raw);
      if (/\b(guardar|guarda)\b/i.test(rawNorm)) {
        const helper = window.cbAgentLecturaNueva;
        const saved = typeof helper?.saveGeneratedReading === "function" ? await helper.saveGeneratedReading() : false;
        await speakCurrent(saved ? "Listo. Guardé la lectura en lecturas nuevas." : "No pude guardar la lectura todavía. Inténtalo de nuevo en unos segundos.");
        return true;
      }
      if (/\b(lee|leer)\b/i.test(rawNorm)) {
        const preview = String(draft.generatedPreview || "").trim();
        if (!preview) {
          await speakCurrent("Aún no tengo lectura lista para leer.");
          return true;
        }
        await speakCurrent(`Leyendo resumen de la lectura generada. ${preview}`);
        return true;
      }
      if (/\b(finalizar|cerrar|listo)\b/i.test(rawNorm)) {
        resetWorkflow(agentId, { draftLectura: { ...createBaseState(agentId).draftLectura } });
        await speakCurrent("Perfecto. Flujo de lectura completado.");
        return true;
      }
      await speakCurrent("Puedes decir guardar lectura, leer lectura o finalizar.");
      return true;
    }
    return false;
  }

  async function handleReadingAction(agentId = 0, raw = "") {
    const agentState = getAgentState(agentId);
    if (!agentState || agentState.flow !== "reading_action") return false;
    if (["await_reading_selection", "await_reading_action"].includes(agentState.step)) {
      const norm = normalizeText(raw);
      const wfState = typeof deps.getReadingWorkflowState === "function" ? deps.getReadingWorkflowState() : null;
      const wfCandidates = getReadingWorkflowCandidates(wfState);
      if (agentState.step === "await_reading_action" && /\b(crear|crea|generar|genera|haz|hacer)\b[\s\S]*\bunidad\b/.test(norm)) {
        if (typeof deps.createUnitFromCurrentReading !== "function") {
          await speakCurrent("No pude vincular la lectura actual para generar la unidad.");
          return true;
        }
        const linked = await deps.createUnitFromCurrentReading();
        if (!linked) {
          await speakCurrent("No pude usar esa lectura para crear la unidad. Intenta volver a buscarla.");
          return true;
        }
        updateAgentState(agentId, {
          flow: "generate_unit",
          step: "await_generation_mode"
        });
        await speakCurrent("Listo. Ya vinculé esta lectura para la unidad. ¿Quieres generar unidad completa o una categoría?");
        return true;
      }
      const readingConversationActive = typeof deps.isReadingConversationActive === "function"
        ? deps.isReadingConversationActive()
        : false;
      if (agentState.step === "await_reading_selection" && !isExplicitReadingSelectionCommand(raw, wfCandidates)) {
        return true;
      }
      if (agentState.step === "await_reading_action"
        && !readingConversationActive
        && !isExplicitReadingWorkflowCommand(raw)) {
        return true;
      }
      if (readingConversationActive
        && agentState.step === "await_reading_action"
        && !isExplicitReadingWorkflowCommand(raw)) {
        // Durante conversación activa (análisis/profundización), las respuestas libres
        // no deben volver al parser de comandos del flujo de lectura.
        return false;
      }
      if (typeof deps.processReadingWorkflowInput === "function") {
        let workflowInput = raw;
        if (agentState.step === "await_reading_selection") {
          if (/\b(no|negativo|esa no|ese no|siguiente|otra|pasar)\b/.test(norm)) {
            workflowInput = "no";
          } else if (/\b(si|sí|continuar|continua|continúa|sigue|adelante|esa|ese|correcto|exacto|confirmo|ok|vale|de acuerdo)\b/.test(norm)) {
            workflowInput = "si";
          }
        }
        const consumed = await deps.processReadingWorkflowInput(workflowInput);
        if (!consumed) {
          if (agentState.step === "await_reading_selection") {
            await speakCurrent("Respóndeme sí para continuar o no para ver otra opción.");
            return true;
          }
          if (agentState.step === "await_reading_action" && typeof deps.getReadingWorkflowState === "function") {
            const pendingStep = readingWorkflowStepFromState(deps.getReadingWorkflowState());
            if (pendingStep === "await_reading_action") {
              await speakCurrent("Elige una acción: ver lectura, leer lectura, editar lectura, exportar word, resumen, profundizar o analiza lectura.");
              return true;
            }
          }
          return false;
        }
        const nextStep = syncReadingWorkflowState(agentId);
        if (!nextStep) {
          updateAgentState(agentId, {
            flow: "reading_action",
            step: "await_reading_action"
          });
        }
        return true;
      }
      return false;
    }
    if (agentState.step === "await_title") {
      const pending = agentState.pendingReadingAction || {};
      const rawNorm = normalizeText(raw);
      const wfState = typeof deps.getReadingWorkflowState === "function" ? deps.getReadingWorkflowState() : null;
      const wfCandidates = getReadingWorkflowCandidates(wfState);
      const isContinue = /\b(listo|listos|continuar|continua|continúa|siguiente|avanzar|ok)\b/.test(rawNorm);
      const draftTitle = String(pending?.titulo || agentState?.readingTitleCache || "").trim();
      if (!isContinue) {
        if (!isExplicitReadingTitleCommand(raw, wfCandidates)) {
          return true;
        }
        const candidatePick = resolveReadingCandidateFromInput(raw, wfCandidates, { strict: true });
        if (candidatePick && typeof deps.processReadingWorkflowInput === "function") {
          const pickPrompt = String(candidatePick.voiceNumberPrompt || `lectura ${candidatePick.visualIndex || 1}`).trim();
          const consumedPick = await deps.processReadingWorkflowInput(pickPrompt);
          if (consumedPick) {
            const nextStep = syncReadingWorkflowState(agentId);
            if (!nextStep) {
              updateAgentState(agentId, { flow: "reading_action", step: "await_reading_selection" });
            }
            return true;
          }
        }
        const extractedTitle = typeof deps.extractTitleFromCommand === "function"
          ? deps.extractTitleFromCommand(raw, raw) || ""
          : "";
        const titleDraft = String(extractedTitle || raw || "").trim().replace(/^["“'`]+|["”'`]+$/g, "");
        const titleDraftNorm = normalizeText(titleDraft);
        const looksNoiseTitle = /\b(listo|elige|dicta|numero|número|opcion|opción|comando|acciones|titulo|título)\b/.test(titleDraftNorm);
        const words = titleDraft.split(/\s+/).filter(Boolean).length;
        if (!titleDraft || /^(asc|ask|asq|nueva|nuevas)$/.test(titleDraftNorm) || titleDraft.length < 3 || words < 1 || looksNoiseTitle) {
          await speakCurrent("No capté bien el título. Dímelo completo y luego di continuar.");
          return true;
        }
        updateAgentState(agentId, {
          pendingReadingAction: { ...pending, titulo: titleDraft },
          readingTitleCache: titleDraft,
          step: "await_title"
        });
        await speakCurrent(`Anoté: "${titleDraft}". Di continuar para el siguiente paso, o dicta el título completo de nuevo.`);
        return true;
      }
      if (!draftTitle) {
        await speakCurrent("Aún no tengo un título. Dime el título de la lectura y luego di continuar.");
        return true;
      }
      const pendingWithTitle = { ...pending, titulo: draftTitle };
      if (pendingWithTitle.coleccion) {
        const tipo = pendingWithTitle.coleccion === "lecturasASC" ? "asc" : "nueva";
        const comando = `${pendingWithTitle.accion || "buscar"} lectura ${tipo} ${pendingWithTitle.titulo || draftTitle}`.trim();
        const ok = await executeReadingAction(agentId, pendingWithTitle.accion || "buscar", comando);
        if (!ok) {
          if (typeof deps.clearReadingWorkflowState === "function") deps.clearReadingWorkflowState();
          updateAgentState(agentId, {
            flow: "reading_action",
            step: "await_title",
            pendingReadingAction: {
              accion: pendingWithTitle.accion || "buscar",
              titulo: pendingWithTitle.titulo || "",
              coleccion: pendingWithTitle.coleccion
            },
            readingTitleCache: pendingWithTitle.titulo || ""
          });
          await speakCurrent("No pude completar esa búsqueda. Dime nuevamente el título y luego di continuar.");
        } else {
          const nextStep = syncReadingWorkflowState(agentId);
          if (nextStep === "await_reading_action") {
            await speakCurrent("Lectura localizada. ¿Qué deseas hacer?");
          }
        }
        return true;
      }
      updateAgentState(agentId, {
        pendingReadingAction: pendingWithTitle,
        step: "await_collection"
      });
      await speakCurrent("Ahora dime si esa lectura es ASC o lectura nueva.");
      return true;
    }
    if (agentState.step !== "await_collection") return false;
    const wfState = typeof deps.getReadingWorkflowState === "function" ? deps.getReadingWorkflowState() : null;
    const wfCandidates = getReadingWorkflowCandidates(wfState);
    const candidatePick = resolveReadingCandidateFromInput(raw, wfCandidates);
    if (candidatePick && typeof deps.processReadingWorkflowInput === "function") {
      const pickPrompt = String(candidatePick.voiceNumberPrompt || `lectura ${candidatePick.visualIndex || 1}`).trim();
      const consumedPick = await deps.processReadingWorkflowInput(pickPrompt);
      if (consumedPick) {
        const nextStep = syncReadingWorkflowState(agentId);
        if (!nextStep) updateAgentState(agentId, { flow: "reading_action", step: "await_reading_selection" });
        return true;
      }
    }
    if (!candidatePick && !/\b(asc|ask|asq|nueva|nuevas)\b/.test(normalizeText(raw))) {
      return true;
    }
    const tipo = parseReadingKind(raw);
    if (!tipo) {
      await speakCurrent("Necesito que me confirmes si esa lectura es ASC o nueva.");
      return true;
    }
    const pending = agentState.pendingReadingAction || {};
    if (!readingCollectionAllowed(pending.accion || "", tipo)) {
      resetWorkflow(agentId);
      await speakCurrent(tipo === "asc" ? "Con lecturas ASC solo puedo buscar y leer." : "Con lecturas nuevas aquí puedo buscar y leer. Para crear, usa Crear lectura Nueva.");
      return true;
    }
    const titulo = String(pending.titulo || "").trim();
    resetWorkflow(agentId);
    const ok = await executeReadingAction(agentId, pending.accion || "buscar", `${pending.accion || "buscar"} lectura ${tipo}${titulo ? ` ${titulo}` : ""}`.trim());
    if (!ok) await speakCurrent("No pude completar esa acción con la lectura. Inténtalo de nuevo con el título.");
    return true;
  }

  async function forwardToActiveReadingConversation(raw = "") {
    if (typeof deps.isReadingConversationActive !== "function") return false;
    if (!deps.isReadingConversationActive()) return false;
    if (typeof deps.processReadingConversationInput !== "function") return false;
    try {
      const ok = await deps.processReadingConversationInput(raw);
      return ok === true;
    } catch (_) {
      return false;
    }
  }

  async function handleGenerateUnit(agentId = 0, raw = "") {
    const agentState = getAgentState(agentId);
    if (!agentState || agentState.flow !== "generate_unit") return false;
    if (agentState.step === "await_global_resources") {
      const global = typeof deps.parseGlobalResources === "function"
        ? deps.parseGlobalResources(raw)
        : { fichas: true, anexos: true, recortables: true, videos: true };
      if (typeof deps.configureGlobalResources === "function") deps.configureGlobalResources(global);
      updateAgentState(agentId, { resourcePlan: { ...(agentState.resourcePlan || {}), global }, step: "await_resource_adjustments" });
      await speakCurrent("Listo. Apliqué la configuración global de recursos. Si deseas ajustes por categoría o subtema, dímelos ahora. Si no, di continuar.");
      return true;
    }
    if (agentState.step === "await_resource_adjustments") {
      if (isYes(raw) || /\bcontinuar|sigue|listo|nada mas|nada más\b/i.test(raw)) {
        updateAgentState(agentId, { step: "await_unit_lecture" });
        await speakCurrent("Ahora dime el nombre de la lectura que deseas usar para la unidad y si la buscas en ASC o en lecturas nuevas.");
        return true;
      }
      const ok = typeof deps.applyResourceOverrideByText === "function" ? deps.applyResourceOverrideByText(raw) : false;
      if (ok) {
        const overrides = Array.isArray(agentState.resourcePlan?.overrides) ? [...agentState.resourcePlan.overrides, raw] : [raw];
        updateAgentState(agentId, { resourcePlan: { ...(agentState.resourcePlan || {}), overrides } });
        await speakCurrent("Ajuste aplicado. Si quieres otro cambio, dímelo. Si no, di continuar.");
      } else {
        await speakCurrent("No pude aplicar ese ajuste. Dímelo como por ejemplo: quita videos en matemáticas, o agrega fichas en ciencias.");
      }
      return true;
    }
    if (agentState.step === "await_unit_lecture") {
      const preferCollection = typeof deps.preferCollectionFromText === "function" ? deps.preferCollectionFromText(raw) || "" : "";
      const titulo = typeof deps.extractTitleFromCommand === "function" ? deps.extractTitleFromCommand(raw, raw) || raw : raw;
      if (!preferCollection) {
        updateAgentState(agentId, { selectedLectura: { titulo, coleccion: "" }, step: "await_unit_lecture_collection" });
        await speakCurrent("Dime si esa lectura la busco en ASC o en lecturas nuevas.");
        return true;
      }
      const ok = typeof deps.selectLectureForUnit === "function" ? deps.selectLectureForUnit(preferCollection, titulo) : false;
      if (!ok) {
        await speakCurrent("No encontré esa lectura para la unidad. Dime el título exacto y si es ASC o nueva.");
        return true;
      }
      updateAgentState(agentId, { selectedLectura: { titulo, coleccion: preferCollection }, step: "await_generation_mode" });
      await speakCurrent("Lectura seleccionada. ¿Quieres generar una categoría específica o la unidad completa?");
      return true;
    }
    if (agentState.step === "await_unit_lecture_collection") {
      const preferCollection = typeof deps.preferCollectionFromText === "function" ? deps.preferCollectionFromText(raw) || "" : "";
      const titulo = String(agentState.selectedLectura?.titulo || "").trim();
      if (!preferCollection) {
        await speakCurrent("Respóndeme si la lectura es ASC o nueva.");
        return true;
      }
      const ok = typeof deps.selectLectureForUnit === "function" ? deps.selectLectureForUnit(preferCollection, titulo) : false;
      if (!ok) {
        await speakCurrent("No encontré esa lectura con esa colección. Dime el título exacto y si es ASC o nueva.");
        return true;
      }
      updateAgentState(agentId, { selectedLectura: { titulo, coleccion: preferCollection }, step: "await_generation_mode" });
      await speakCurrent("Lectura seleccionada. ¿Quieres generar una categoría específica o la unidad completa?");
      return true;
    }
    if (agentState.step === "await_generation_mode") {
      if (/\bcompleta|toda|entera|unidad completa\b/i.test(raw)) {
        deps.generateAllUnit?.();
        deps.openUnitResult?.();
        resetWorkflow(agentId);
        await speakCurrent("Perfecto. Ya inicié la generación completa y abrí el modal de resultados.");
        return true;
      }
      const okCategoria = typeof deps.generateCategoryByVoiceText === "function" ? deps.generateCategoryByVoiceText(raw) : false;
      if (okCategoria) {
        deps.openUnitResult?.();
        resetWorkflow(agentId);
        await speakCurrent("Ya inicié la generación de esa categoría y abrí el resultado.");
        return true;
      }
      await speakCurrent("Dime la categoría exacta o bien di unidad completa.");
      return true;
    }
    return false;
  }

  async function handleVoiceTranscriptNow(transcripcion = "", normalized = "", options = {}) {
    const agentId = state.activeAgentId;
    if (!agentId) return false;
    const agentState = getAgentState(agentId);
    const raw = String(transcripcion || "").trim();
    const text = String(normalized || normalizeText(raw)).trim();
    if (!raw || !agentState) return false;
    const source = String(options?.source || "").trim();
    const fromUi = source.startsWith("ui-");
    if (fromUi && state.firstTurnGuardActive) {
      state.firstTurnGuardActive = false;
      debug("first-turn-guard-ui-release", { key: "first-turn-guard-ui-release", source }, 0);
    }
    const explicitActionIntent = resolveReadingAction(text);
    const explicitCollectionIntent = parseReadingKind(text);
    const quickSearchAsc = isQuickReadingSearch(text, "asc");
    const quickSearchNueva = isQuickReadingSearch(text, "nueva");
    const explicitRestartReadingIntent = !!((explicitActionIntent && explicitCollectionIntent) || quickSearchAsc || quickSearchNueva);
    const firstTurnGuardActive = state.firstTurnGuardActive === true
      && String(agentState.flow || "idle") === "idle"
      && String(agentState.step || "await_action") === "await_action";
    if (firstTurnGuardActive) {
      const context = extractContext(raw);
      const explicitContextUpdate = !!(isContextInstruction(raw, agentState) && (context.trimestre || context.unidad));
      const explicitCreateReading = /\b(crear|crea|haz|hacer)\s+(?:una\s+|nueva\s+|nueva\s+una\s+|una\s+nueva\s+)?lectura\b/i.test(text);
      const explicitGenerateUnit = /\b(generar|genera|crear|crea|haz|hacer)\s+(?:una\s+|nueva\s+|nueva\s+una\s+|una\s+nueva\s+)?unidad\b/i.test(text);
      const explicitSearchUnit = /\b(busca|buscar|encuentra|localiza)\s+(?:una\s+|nueva\s+|una\s+nueva\s+)?unidad\b/i.test(text);
      const explicitReadOrSearch = !!(
        (explicitActionIntent && /\blecturas?\b/.test(text))
        || quickSearchAsc
        || quickSearchNueva
        || (explicitActionIntent && explicitCollectionIntent)
      );
      const explicitControl = isCloseAgentCommand(text, agentId)
        || /\b(cambiar agente|terminar agente|salir del agente|cancelar flujo)\b/i.test(text)
        || isBackCommand(text);
      const acceptedByGuard = explicitContextUpdate
        || explicitCreateReading
        || explicitGenerateUnit
        || explicitSearchUnit
        || explicitReadOrSearch
        || explicitControl;
      if (!acceptedByGuard) {
        debug("first-turn-guard-ignored", {
          key: "first-turn-guard-ignored",
          flow: agentState.flow || "idle",
          step: agentState.step || "await_action",
          transcript: raw
        }, 120);
        markConsumed(raw);
        return true;
      }
      state.firstTurnGuardActive = false;
      debug("first-turn-guard-accepted", {
        key: "first-turn-guard-accepted",
        source: source || "voice",
        transcript: raw
      }, 0);
    }
    debug("intent", {
      key: "intent",
      flow: agentState.flow || "idle",
      step: agentState.step || "await_action",
      action: explicitActionIntent || "-",
      collection: explicitCollectionIntent || "-",
      quickAsc: quickSearchAsc ? "1" : "0",
      quickNueva: quickSearchNueva ? "1" : "0",
      transcript: raw
    }, 120);
    if (!firstTurnGuardActive && typeof deps.getReadingWorkflowState === "function") {
      const pendingStep = readingWorkflowStepFromState(deps.getReadingWorkflowState());
      const localAwaitingReadingInput = agentState.flow === "reading_action"
        && ["await_title", "await_collection"].includes(String(agentState.step || ""));
      if (pendingStep && !explicitRestartReadingIntent && !localAwaitingReadingInput) {
        if (agentState.flow !== "reading_action" || agentState.step !== pendingStep) {
          updateAgentState(agentId, { flow: "reading_action", step: pendingStep });
        }
        const consumedPending = await handleReadingAction(agentId, raw);
        if (consumedPending) {
          markConsumed(raw);
          return true;
        }
      }
    }
    if (isCloseAgentCommand(text, agentId)) {
      resetWorkflow(agentId);
      markConsumed(raw);
      close();
      return true;
    }
    if (isNoise(raw, agentState)) return true;
    if (/\b(cambiar agente|terminar agente|salir del agente)\b/i.test(text)) {
      resetWorkflow(agentId);
      markConsumed(raw);
      await speakCurrent("Listo. Dejé en pausa el flujo actual del agente.");
      close();
      return true;
    }
    if (/\b(cancelar flujo)\b/i.test(text)) {
      resetWorkflow(agentId);
      markConsumed(raw);
      await speakCurrent(`Cancelé el flujo actual. ${actionsCatalogPrompt()}`);
      return true;
    }
    if (isBackCommand(text)) {
      markConsumed(raw);
      return goToPreviousStep(agentId);
    }
    if (quickSearchAsc) {
      markConsumed(raw);
      return executeReadingAction(agentId, "buscar", "buscar lectura asc");
    }
    if (quickSearchNueva) {
      markConsumed(raw);
      return executeReadingAction(agentId, "buscar", "buscar lectura nueva");
    }
    if (explicitActionIntent && explicitCollectionIntent) {
      markConsumed(raw);
      return executeReadingAction(agentId, explicitActionIntent, raw);
    }
    if (/\b(busca|buscar|encuentra|localiza)\s+(?:una\s+|nueva\s+|una\s+nueva\s+)?unidad\b/i.test(text)) {
      markConsumed(raw);
      return startGenerateUnit(agentId);
    }
    if (/\b(busca|buscar|encuentra|localiza)\s+lecturas?\s+(?:asc|ask|asq|a\s*s\s*[ckq])\b/i.test(text)) {
      markConsumed(raw);
      return executeReadingAction(agentId, "buscar", raw);
    }
    if (/\b(busca|buscar|encuentra|localiza)\s+lecturas?\s+nueva(s)?\b/i.test(text)) {
      markConsumed(raw);
      return executeReadingAction(agentId, "buscar", raw);
    }
    if (/\b(busca|buscar)\s+lectura\s+(?:asc|ask|asq|a\s*s\s*[ckq])\b/i.test(text)) {
      markConsumed(raw);
      return executeReadingAction(agentId, "buscar", raw);
    }
    if (/\b(busca|buscar)\s+lectura\s+nueva\b/i.test(text)) {
      markConsumed(raw);
      return executeReadingAction(agentId, "buscar", raw);
    }
    if (/\b(lee|leer)\b/i.test(text) && (/\b(parrafo|párrafo)\b/i.test(text) || /\b(donde dice|que dice)\b/i.test(text))) {
      const okReadGenerated = await readGeneratedReadingByCommand(raw);
      if (okReadGenerated) {
        markConsumed(raw);
        return true;
      }
    }
    if (agentState.flow === "setup") return handleSetup(agentId, raw, text);
    if (agentState.flow === "create_reading") return handleCreateReading(agentId, raw, text);
    if (agentState.flow === "generate_unit") return handleGenerateUnit(agentId, raw, text);
    if (agentState.flow === "reading_action") {
      const handledReading = await handleReadingAction(agentId, raw, text);
      if (handledReading) return true;
      const forwardedConversation = await forwardToActiveReadingConversation(raw);
      if (forwardedConversation) {
        markConsumed(raw);
        return true;
      }
      // Si no se consumió dentro del subflujo de lectura, deja pasar al parser global.
    }

    const context = extractContext(raw);
    const explicitContextInstruction = isContextInstruction(raw, agentState);
    if ((context.trimestre || context.unidad)
      && !explicitContextInstruction
      && isSameAcademicContext(agentState, context)
      && !hasPrimaryActionIntent(text)) {
      markConsumed(raw);
      debug("context-recap-ignored", { key: "context-recap-ignored", transcript: raw }, 220);
      return true;
    }
    if ((context.trimestre || context.unidad) && explicitContextInstruction) {
      const nextTrimestre = context.trimestre || String(agentState.trimestre || "").trim();
      const nextUnidad = context.unidad || String(agentState.unidad || "").trim();
      if (nextTrimestre === String(agentState.trimestre || "").trim()
        && nextUnidad === String(agentState.unidad || "").trim()
        && agentState.flow !== "setup"
        && agentState.step !== "await_context") {
        markConsumed(raw);
        debug("context-noop-ignored", { key: "context-noop-ignored", transcript: raw }, 220);
        return true;
      }
      updateAgentState(agentId, {
        ...(context.trimestre ? { trimestre: context.trimestre } : {}),
        ...(context.unidad ? { unidad: context.unidad } : {})
      });
      setAcademicContext(agentId);
      markConsumed(raw);
      await speakCurrent(`Actualicé tu contexto a ${summarizeContext(agentId)}.`);
      return true;
    }
    if (/\b(limpiar|limpia|borrar|borra|reiniciar|reinicia|resetear|resetea|restablecer|restablece)\b/.test(text)
      && /\b(memoria|contexto|historial|estado|datos)\b/.test(text)) {
      markConsumed(raw);
      clearAgentMemory(agentId);
      await speakCurrent(`Listo. Limpié mi memoria y reinicié el agente. ${actionsCatalogPrompt()}`);
      return true;
    }
    if (/\b(crear|crea|haz|hacer)\s+(?:una\s+|nueva\s+|nueva\s+una\s+|una\s+nueva\s+)?lectura\b/i.test(text)) {
      markConsumed(raw);
      return startCreateReading(agentId);
    }
    if (/\b(generar|genera|crear|crea|haz|hacer)\s+(?:una\s+|nueva\s+|nueva\s+una\s+|una\s+nueva\s+)?unidad\b/i.test(text)) {
      markConsumed(raw);
      return startGenerateUnit(agentId);
    }
    if (!explicitActionIntent && explicitCollectionIntent && /\blecturas?\b/.test(text)) {
      markConsumed(raw);
      return executeReadingAction(agentId, "buscar", raw);
    }
    const action = explicitActionIntent;
    if (action) {
      markConsumed(raw);
      return executeReadingAction(agentId, action, raw);
    }
    if (/\b(resumen|contexto|memoria)\b/.test(text)) {
      markConsumed(raw);
      await speakCurrent(`Tengo guardado ${summarizeContext(agentId)}. ${actionsCatalogPrompt()}`);
      return true;
    }
    const forwardedConversationLate = await forwardToActiveReadingConversation(raw);
    if (forwardedConversationLate) {
      markConsumed(raw);
      return true;
    }
    markConsumed(raw);
    await speakCurrent(
      `Ese comando no forma parte de mis acciones disponibles. ${actionsCatalogPromptCompact()}`,
      { blockInputUntilDone: true, blockMs: 2600 }
    );
    return true;
  }

  async function handleVoiceTranscript(transcripcion = "", normalized = "", options = {}) {
    const raw = String(transcripcion || "").trim();
    if (!raw) return false;
    const bypassBlock = options?.bypassBlock === true;
    const blockedUntil = Number(state.voiceInput.blockAllUntil || 0);
    const now = Date.now();
    if (!bypassBlock && now < blockedUntil) {
      const mode = String(state.stage.currentMode || "listening");
      const canInterrupt = mode === "speaking" && isSpeakingInterruptCommand(raw);
      if (!canInterrupt && mode !== "listening") {
        debug("agent-voice-blocked", { key: "agent-voice-blocked", transcript: raw, mode }, 120);
        return false;
      }
      // Si ya estamos escuchando, libera bloqueo residual para no perder el primer comando.
      state.voiceInput.blockAllUntil = 0;
    }
    const norm = String(normalized || normalizeText(raw)).trim();
    const run = () => handleVoiceTranscriptNow(raw, norm, options);
    const queued = state.commandQueue.then(run, run);
    state.commandQueue = queued.catch(() => false);
    return queued;
  }

  async function queueVoiceTranscript(transcripcion = "", normalized = "") {
    const raw = String(transcripcion || "").trim();
    if (!raw) return false;
    const blockedUntil = Number(state.voiceInput.blockAllUntil || 0);
    const now = Date.now();
    if (now < blockedUntil) {
      const mode = String(state.stage.currentMode || "listening");
      const canInterrupt = mode === "speaking" && isSpeakingInterruptCommand(raw);
      if (!canInterrupt && mode !== "listening") {
        debug("agent-voice-blocked", { key: "agent-voice-blocked", transcript: raw, mode }, 120);
        return false;
      }
      state.voiceInput.blockAllUntil = 0;
    }
    mergePendingVoiceTranscript(raw, normalized);
    const justEndedSpeech = (Date.now() - Number(state.voiceInput.lastSpeechEndAt || 0)) < 260;
    const agentState = getAgentState(state.activeAgentId);
    const step = String(agentState?.step || "");
    const flow = String(agentState?.flow || "");
    const quickStep = state.firstTurnGuardActive
      || (flow === "idle" && step === "await_action")
      || (flow === "reading_action" && (step === "await_reading_selection" || step === "await_reading_action"));
    const captureTitleStep = flow === "reading_action" && step === "await_title";
    const flushDelay = justEndedSpeech
      ? 120
      : quickStep
        ? 150
        : captureTitleStep
          ? 260
          : 420;
    schedulePendingVoiceFlush(flushDelay);
    return true;
  }

  function onAgentGenerationReady(event) {
    const agentId = Number(state.activeAgentId || 0);
    if (!agentId) return;
    const agentState = getAgentState(agentId);
    if (!agentState || agentState.flow !== "create_reading") return;
    if (agentState.step !== "await_agent_generating" && agentState.step !== "await_form_confirm") return;
    const html = String(event?.detail?.html || "").trim();
    const preview = String(event?.detail?.preview || "").trim();
    const draft = { ...(agentState.draftLectura || {}), generatedHtml: html, generatedPreview: preview };
    updateAgentState(agentId, { draftLectura: draft, step: "await_agent_result" });
    speakCurrent("Lectura lista. Ya la cargué en este modal. Puedes decir guardar lectura, leer lectura o finalizar.").catch(() => {});
  }

  function onAgentGenerationError(event) {
    const agentId = Number(state.activeAgentId || 0);
    if (!agentId) return;
    const agentState = getAgentState(agentId);
    if (!agentState || agentState.flow !== "create_reading") return;
    if (agentState.step !== "await_agent_generating") return;
    const reason = String(event?.detail?.error || "").trim();
    updateAgentState(agentId, { step: "await_form_confirm" });
    speakCurrent(`No pude completar la generación${reason ? `: ${reason}` : ""}. Revisa los datos y vuelve a decir generar lectura ahora.`).catch(() => {});
  }

  async function open(agentId = 0) {
    if (typeof deps.isAgentUiEnabled === "function" && deps.isAgentUiEnabled() !== true) {
      return false;
    }
    const personaDef = persona(agentId);
    state.activeAgentId = Number(agentId) || 0;
    if (typeof deps.onActiveAgentChange === "function") deps.onActiveAgentChange(state.activeAgentId, personaDef);
    if (typeof deps.setExclusiveVoiceMode === "function") deps.setExclusiveVoiceMode(true);
    const { modal, visual, layered, portrait, name, text } = els();
    if (!modal || !visual) return false;
    try {
      if (typeof window.cbUnidadDock?.openSection === "function") {
        window.cbUnidadDock.openSection("unidadAgentStageModal");
      }
    } catch (_) {}
    state.stage.isOpen = true;
    state.voiceInput.selfEchoUntil = 0;
    state.voiceInput.blockAllUntil = 0;
    state.voiceInput.activeSpeechSeq = 0;
    state.voiceInput.playbackStartedSeq = 0;
    state.voiceInput.realtimePlaybackSeq = 0;
    state.firstTurnGuardActive = true;
    if (typeof deps.clearReadingWorkflowState === "function") {
      try { deps.clearReadingWorkflowState(); } catch (_) {}
    }
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    visual.dataset.agentId = String(agentId);
    visual.dataset.state = "listening";
    if (name) name.textContent = personaDef.nombre;
    if (text) text.textContent = "Lista para trabajar contigo.";
    layered?.classList.toggle("is-hidden", Number(agentId) !== 1);
    portrait?.classList.toggle("is-hidden", Number(agentId) === 1);
    if (portrait) {
      portrait.src = encodeURI(personaDef.portrait);
      portrait.alt = personaDef.nombre;
    }
    if (Number(agentId) === 1) setFaceIdle();
    clearStageTimers();
    clearVoiceInput();
    clearPendingVoiceTranscript();
    if (usesExternalVoiceInput) setMicState(false, "agent-local");
    ensureLoop();
    scheduleBlink();
    scheduleGaze();
    scheduleBrows();
    if (!usesExternalVoiceInput) {
      // Primer intento de escucha local en contexto cercano al click de apertura.
      // Ayuda cuando el recognizer global acaba de apagarse para modo exclusivo.
      const primedStart = startInternalVoiceInput();
      if (!primedStart || !state.voiceInput.isListening) scheduleVoiceWarmupStart(10, 180);
    }
    // Arranca el recognizer local en contexto cercano al click de apertura.
    // Luego, durante "speaking", filtramos transcripciones para evitar auto-eco.
    setMode("speaking");
    // Refuerza el modo exclusivo en el motor Live para mantener aislado
    // el flujo del agente frente a comandos globales.
    if (typeof deps.startVoiceAssistant === "function") {
      try { await deps.startVoiceAssistant({ agentExclusive: true }); } catch (_) {}
    }
    if (!usesExternalVoiceInput) scheduleVoiceWarmupStart(10, 180);
    await ensureUserProfile();
    const agentState = getAgentState(agentId);
    setAcademicContext(agentId);
    resetWorkflow(agentId);
    renderStageOptions();
    const greetPrefix = userGreetingPrefix();
    if (!agentState.trimestre || !agentState.unidad) {
      await speakCurrent(
        `${greetPrefix}Hola, soy ${personaDef.nombre}. ¿Qué vamos a hacer?`,
        { blockInputUntilDone: true, blockMs: 450 }
      );
      return true;
    }
    await speakCurrent(
      `${greetPrefix}Hola, soy ${personaDef.nombre}. Tengo guardado ${summarizeContext(agentId)}. ¿Qué vamos a hacer?`,
      { blockInputUntilDone: true, blockMs: 450 }
    );
    return true;
  }

  function close() {
    const { modal } = els();
    if (!modal) return false;
    state.stage.isOpen = false;
    clearStageTimers();
    clearSpeakingFallback();
    stopInternalVoiceInput(true);
    clearVoiceInput();
    clearVoiceGestureRetry();
    clearPendingVoiceTranscript();
    state.voiceInput.selfEchoUntil = 0;
    state.voiceInput.blockAllUntil = 0;
    state.voiceInput.activeSpeechSeq = 0;
    state.voiceInput.playbackStartedSeq = 0;
    state.voiceInput.realtimePlaybackSeq = 0;
    state.firstTurnGuardActive = false;
    state.stage.speechText = "";
    state.stage.visemeFrames = [];
    state.stage.visemeIndex = 0;
    state.stage.nextFrameAt = 0;
    state.stage.energy = 0;
    state.stage.targetEnergy = 0;
    state.stage.energyDecayAt = 0;
    state.stage.audioWindowStartedAt = 0;
    state.stage.audioWindowEndsAt = 0;
    state.stage.forceSpeakUntil = 0;
    state.stage.micSources = {};
    setMicState(false, "close");
    renderStageOptions();
    setFaceIdle();
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    if (typeof deps.stopVoiceAssistant === "function") {
      try { deps.stopVoiceAssistant({ reason: "close-agent-stage" }); } catch (_) {}
    }
    if (typeof deps.stopSpeech === "function") {
      try { deps.stopSpeech({ reason: "close-agent-stage" }); } catch (_) {}
    }
    try {
      if (typeof window.cbUnidadDock?.hideForChat === "function") {
        window.cbUnidadDock.hideForChat();
      }
    } catch (_) {}
    state.activeAgentId = 0;
    if (typeof deps.onActiveAgentChange === "function") deps.onActiveAgentChange(0, null);
    if (typeof deps.setExclusiveVoiceMode === "function") deps.setExclusiveVoiceMode(false);
    return true;
  }

  function init() {
    const { modal } = els();
    if (modal && modal.dataset.agentControllerReady !== "true") {
      modal.dataset.agentControllerReady = "true";
      modal.addEventListener("click", (event) => {
        if (event.target?.closest?.("[data-action='close-agent-stage']")) close();
      });
    }
    document.querySelectorAll(".unidad-agent-card").forEach((card) => {
      if (card.dataset.agentControllerReady === "true") return;
      card.dataset.agentControllerReady = "true";
      card.addEventListener("click", () => {
        if (typeof deps.isAgentUiEnabled === "function" && deps.isAgentUiEnabled() !== true) return;
        const agentId = Number(card.dataset.agentId || 0);
        open(agentId).catch(() => {});
      });
    });
    if (!window.__cbAgentControllerGenerationListenersBound) {
      window.__cbAgentControllerGenerationListenersBound = true;
      window.addEventListener("cb-agent-reading-ready", onAgentGenerationReady);
      window.addEventListener("cb-agent-reading-error", onAgentGenerationError);
    }
    ensureLoop();
  }

  function isExclusive() {
    return Number(state.activeAgentId || 0) > 0;
  }

  function getActiveAgentId() {
    return Number(state.activeAgentId || 0);
  }

  return {
    init,
    open,
    close,
    isExclusive,
    getActiveAgentId,
    handleVoiceTranscript,
    completeSpeechPlayback,
    onPcmSamples,
    updateSpeechText,
    syncSpeakingActivity,
    prepareSpeech,
    setMode,
    setMicState,
    getPersonas,
    setPersonas
  };
}
