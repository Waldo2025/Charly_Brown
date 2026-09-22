import { buildMarcieApiUrl } from "/js/api-client.js";
import { getCurrentUser } from "./marcie-firebase.js";

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export function createMarcieAgentVoice({ onTranscript, onStateChange, onError } = {}) {
  let recognition = null;
  let listening = false;
  let liveConnection = null;
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

  function closeLiveSocket(connection, reason = "finished") {
    const socket = connection?.socket;
    if (!socket) return;
    const closeOpenSocket = () => {
      if (socket.readyState !== WebSocket.OPEN) return;
      try { socket.send(JSON.stringify({ type: "close" })); } catch (_) {}
      try { socket.close(1000, reason); } catch (_) {}
    };
    if (socket.readyState === WebSocket.CONNECTING) {
      socket.addEventListener("open", closeOpenSocket, { once: true });
      return;
    }
    closeOpenSocket();
  }

  function cancelOutput() {
    speechEpoch += 1;
    if (liveConnection) {
      const connection = liveConnection;
      liveConnection = null;
      connection.cancel();
    }
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

  async function speakWithGeminiLive(text, epoch) {
    const user = getCurrentUser();
    if (!user || typeof WebSocket === "undefined" || !(window.AudioContext || window.webkitAudioContext)) throw new Error("LIVE_UNAVAILABLE");
    const token = await user.getIdToken();
    const response = await fetch(buildMarcieApiUrl("/api/gemini/live-token"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        voiceName: "Aoede",
        systemInstruction: "Eres la voz de Marcie, una agente editorial cálida, atenta y natural. Comunica el mensaje recibido en español de México como parte de una conversación real, con entonación expresiva y ritmo pausado. Puedes reformular levemente conectores para que suene espontáneo, pero conserva todas las preguntas, opciones y decisiones; no agregues hechos ni elijas por el usuario."
      })
    });
    const ticket = await response.json().catch(() => ({}));
    if (!response.ok || !ticket.websocketUrl || !ticket.ticket) throw new Error("LIVE_TICKET_UNAVAILABLE");
    if (epoch !== speechEpoch) return false;

    return new Promise((resolve, reject) => {
      const target = new URL(ticket.websocketUrl, window.location.href);
      target.searchParams.set("ticket", ticket.ticket);
      const socket = new WebSocket(target.toString());
      let receivedAudio = false;
      const connection = {
        socket,
        epoch,
        cancelled: false,
        settled: false,
        timeout: 0,
        finishTimer: 0,
        cancel() {
          connection.cancelled = true;
          clearTimeout(connection.timeout);
          clearTimeout(connection.finishTimer);
          closeLiveSocket(connection, "cancelled");
          settle(resolve, false);
        }
      };
      liveConnection = connection;

      function isCurrent() {
        return !connection.cancelled && connection.epoch === speechEpoch && liveConnection === connection;
      }

      function settle(callback, value) {
        if (connection.settled) return;
        connection.settled = true;
        clearTimeout(connection.timeout);
        clearTimeout(connection.finishTimer);
        if (liveConnection === connection) liveConnection = null;
        callback(value);
      }

      function fail(error) {
        if (connection.cancelled || connection.epoch !== speechEpoch) {
          settle(resolve, false);
          return;
        }
        closeLiveSocket(connection, "error");
        settle(reject, error);
      }

      connection.timeout = window.setTimeout(() => fail(new Error("LIVE_TIMEOUT")), 15000);
      socket.addEventListener("message", (event) => {
        if (!isCurrent()) return;
        let envelope;
        try { envelope = JSON.parse(String(event.data || "{}")); } catch (_) { return; }
        if (envelope.type === "ready") {
          setState("speaking");
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
              type: "clientContent",
              turns: [{ role: "user", parts: [{ text: String(text || "").trim() }] }],
              turnComplete: true
            }));
          }
          return;
        }
        if (envelope.type === "error") {
          fail(new Error(String(envelope.message || "LIVE_ERROR")));
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
          clearTimeout(connection.timeout);
          const remainingMs = audioContext ? Math.max(0, (nextAudioAt - audioContext.currentTime) * 1000) : 0;
          connection.finishTimer = window.setTimeout(() => {
            if (!isCurrent()) return settle(resolve, false);
            closeLiveSocket(connection);
            setState("idle");
            if (receivedAudio) settle(resolve, true); else fail(new Error("LIVE_AUDIO_EMPTY"));
          }, remainingMs + 80);
        }
      });
      socket.addEventListener("error", () => fail(new Error("LIVE_SOCKET_ERROR")));
      socket.addEventListener("close", () => {
        if (!connection.settled && isCurrent()) fail(new Error("LIVE_SOCKET_CLOSED"));
      });
    });
  }

  function speak(text) {
    const content = String(text || "").trim();
    if (!content) return false;
    cancelOutput();
    const epoch = speechEpoch;
    void speakWithGeminiLive(content, epoch).catch(() => {
      if (epoch === speechEpoch) {
        setState("idle");
        onError?.(new Error("No pude reproducir la voz de Marcie Live. Puedes continuar por escrito."));
      }
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
