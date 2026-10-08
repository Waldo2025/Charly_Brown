const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export function createMarcieAgentVoice({ onTranscript, onComplete, onStateChange, onError } = {}) {
  let recognition = null;
  let listening = false;
  let transcript = "";
  let autoSubmit = false;
  let submitWhenEnded = false;
  let silenceDelayMs = 1800;
  let silenceTimer = 0;
  function setState(state) {
    onStateChange?.(state);
  }

  function clearSilenceTimer() {
    window.clearTimeout(silenceTimer);
    silenceTimer = 0;
  }

  function stop({ submit = false } = {}) {
    if (!recognition) return;
    submitWhenEnded ||= submit;
    clearSilenceTimer();
    try { recognition.stop(); } catch (_) {}
  }

  function scheduleAutoSubmit() {
    clearSilenceTimer();
    if (!autoSubmit || !transcript) return;
    silenceTimer = window.setTimeout(() => stop({ submit: true }), silenceDelayMs);
  }

  function enableAutoSubmit({ silenceMs = 1800 } = {}) {
    autoSubmit = true;
    silenceDelayMs = Math.max(900, Math.min(4000, Number(silenceMs) || 1800));
    scheduleAutoSubmit();
  }

  function cancelOutput() {}

  function listen({ autoSubmit: shouldAutoSubmit = false, silenceMs = 1800 } = {}) {
    if (!Recognition) {
      onError?.(new Error("El reconocimiento de voz no está disponible en este navegador."));
      return false;
    }
    if (recognition) {
      if (shouldAutoSubmit) enableAutoSubmit({ silenceMs });
      return true;
    }
    cancelOutput();
    transcript = "";
    autoSubmit = shouldAutoSubmit;
    submitWhenEnded = false;
    silenceDelayMs = Math.max(900, Math.min(4000, Number(silenceMs) || 1800));
    recognition = new Recognition();
    recognition.lang = "es-MX";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => { listening = true; setState("listening"); };
    recognition.onresult = (event) => {
      transcript = Array.from(event.results).map((result) => result[0]?.transcript || "").join(" ").trim();
      onTranscript?.(transcript, event.results[event.results.length - 1]?.isFinal === true);
      scheduleAutoSubmit();
    };
    recognition.onerror = (event) => {
      submitWhenEnded = false;
      autoSubmit = false;
      clearSilenceTimer();
      if (event.error !== "aborted") onError?.(new Error(event.error === "not-allowed" ? "No hay permiso para usar el micrófono." : "No pude reconocer la voz."));
    };
    recognition.onend = () => {
      const completedTranscript = transcript.trim();
      const shouldSubmit = submitWhenEnded || (autoSubmit && completedTranscript);
      clearSilenceTimer();
      recognition = null;
      listening = false;
      autoSubmit = false;
      submitWhenEnded = false;
      setState("idle");
      if (shouldSubmit && completedTranscript) onComplete?.(completedTranscript);
    };
    try {
      recognition.start();
    } catch (error) {
      recognition = null;
      onError?.(error);
      return false;
    }
    return true;
  }

  return {
    get available() { return Boolean(Recognition); },
    get active() { return Boolean(recognition); },
    get listening() { return listening; },
    enableAutoSubmit,
    listen,
    stop,
    cancelSpeech: cancelOutput
  };
}
