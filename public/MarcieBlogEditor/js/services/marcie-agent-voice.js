import { buildMarcieApiUrl } from "/js/api-client.js";
import { getCurrentUser } from "./marcie-firebase.js";

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function preferredSpanishVoice() {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  return voices.find((voice) => /^es-MX$/i.test(voice.lang) && /female|mujer|paulina|dalia|sabina/i.test(voice.name))
    || voices.find((voice) => /^es(?:-|$)/i.test(voice.lang) && /female|mujer|paulina|dalia|sabina/i.test(voice.name))
    || voices.find((voice) => /^es-MX$/i.test(voice.lang))
    || voices.find((voice) => /^es(?:-|$)/i.test(voice.lang))
    || null;
}

export function createMarcieAgentVoice({ onTranscript, onStateChange, onError } = {}) {
  let recognition = null;
  let listening = false;
  let liveSocket = null;
  let audioContext = null;
  let nextAudioAt = 0;
  let speechEpoch = 0;
  const activeSources = new Set();

  function setState(state) {
    onStateChange?.(state);
  }

  function prime() {
    if (!(window.AudioContext || window.webkitAudioContext)) return false;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
      void audioContext.resume?.();
      return true;
    } catch (_) {
      return false;
    }
  }

  function stop() {
    if (!recognition) return;
    try { recognition.stop(); } catch (_) {}
  }

  function cancelOutput() {
    speechEpoch += 1;
    window.speechSynthesis?.cancel?.();
    try { liveSocket?.close(); } catch (_) {}
    liveSocket = null;
    activeSources.forEach((source) => { try { source.stop(); } catch (_) {} });
    activeSources.clear();
    nextAudioAt = audioContext?.currentTime || 0;
  }

  function listen() {
    if (!Recognition) {
      onError?.(new Error("El reconocimiento de voz no está disponible en este navegador."));
      return false;
    }
    cancelOutput();
    recognition = new Recognition();
    recognition.lang = "es-MX";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => { listening = true; setState("listening"); };
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0]?.transcript || "").join(" ").trim();
      onTranscript?.(transcript, event.results[event.results.length - 1]?.isFinal === true);
    };
    recognition.onerror = (event) => {
      if (event.error !== "aborted") onError?.(new Error(event.error === "not-allowed" ? "No hay permiso para usar el micrófono." : "No pude reconocer la voz."));
    };
    recognition.onend = () => { listening = false; setState("idle"); };
    recognition.start();
    return true;
  }

  function speakWithBrowser(text) {
    const content = String(text || "").trim();
    if (!content || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return false;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(content);
    utterance.lang = "es-MX";
    utterance.rate = 0.92;
    utterance.pitch = 1.04;
    const voice = preferredSpanishVoice();
    if (voice) utterance.voice = voice;
    utterance.onstart = () => setState("speaking");
    utterance.onend = () => setState("idle");
    utterance.onerror = () => setState("idle");
    window.speechSynthesis.speak(utterance);
    return true;
  }

  function playPcmChunk(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const samples = new Int16Array(bytes.buffer);
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    const buffer = audioContext.createBuffer(1, samples.length, 24000);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) channel[index] = samples[index] / 32768;
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    activeSources.add(source);
    source.onended = () => activeSources.delete(source);
    nextAudioAt = Math.max(nextAudioAt, audioContext.currentTime + 0.02);
    source.start(nextAudioAt);
    nextAudioAt += buffer.duration;
  }

  async function speakWithGeminiLive(text) {
    const user = getCurrentUser();
    if (!user || typeof WebSocket === "undefined" || !(window.AudioContext || window.webkitAudioContext)) throw new Error("LIVE_UNAVAILABLE");
    const token = await user.getIdToken();
    const response = await fetch(buildMarcieApiUrl("/api/gemini/live-token"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        voiceName: "Aoede",
        systemInstruction: "Eres la voz amable de Marcie. Lee exactamente el texto recibido en español de México, con ritmo pausado. No agregues ni cambies información."
      })
    });
    const ticket = await response.json().catch(() => ({}));
    if (!response.ok || !ticket.websocketUrl || !ticket.ticket) throw new Error("LIVE_TICKET_UNAVAILABLE");

    return new Promise((resolve, reject) => {
      const target = new URL(ticket.websocketUrl, window.location.href);
      target.searchParams.set("ticket", ticket.ticket);
      const socket = new WebSocket(target.toString());
      liveSocket = socket;
      let receivedAudio = false;
      const timeout = window.setTimeout(() => { try { socket.close(); } catch (_) {} reject(new Error("LIVE_TIMEOUT")); }, 15000);
      socket.addEventListener("message", (event) => {
        let envelope;
        try { envelope = JSON.parse(String(event.data || "{}")); } catch (_) { return; }
        if (envelope.type === "ready") {
          setState("speaking");
          socket.send(JSON.stringify({
            type: "clientContent",
            turns: [{ role: "user", parts: [{ text: String(text || "").trim() }] }],
            turnComplete: true
          }));
          return;
        }
        if (envelope.type === "error") {
          clearTimeout(timeout);
          reject(new Error(String(envelope.message || "LIVE_ERROR")));
          try { socket.close(); } catch (_) {}
          return;
        }
        if (envelope.type !== "serverContent") return;
        const content = envelope.message?.serverContent || envelope.message || {};
        for (const part of content.modelTurn?.parts || []) {
          if (part?.inlineData?.data) {
            receivedAudio = true;
            playPcmChunk(part.inlineData.data);
          }
        }
        if (content.turnComplete === true) {
          clearTimeout(timeout);
          const remainingMs = audioContext ? Math.max(0, (nextAudioAt - audioContext.currentTime) * 1000) : 0;
          window.setTimeout(() => {
            try { socket.send(JSON.stringify({ type: "close" })); socket.close(); } catch (_) {}
            liveSocket = null;
            setState("idle");
            if (receivedAudio) resolve(true); else reject(new Error("LIVE_AUDIO_EMPTY"));
          }, remainingMs + 80);
        }
      });
      socket.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("LIVE_SOCKET_ERROR")); });
    });
  }

  function speak(text) {
    const content = String(text || "").trim();
    if (!content) return false;
    cancelOutput();
    const epoch = speechEpoch;
    void speakWithGeminiLive(content).catch(() => {
      if (epoch === speechEpoch) speakWithBrowser(content);
    });
    return true;
  }

  return {
    get available() { return Boolean(Recognition); },
    get listening() { return listening; },
    prime,
    listen,
    stop,
    speak,
    cancelSpeech: cancelOutput
  };
}
