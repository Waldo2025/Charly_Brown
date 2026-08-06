"use strict";

const MAX_AUDIO_BASE64_CHARS = 2_800_000;

function parseClientMessage(raw) {
  let message;
  try {
    message = JSON.parse(Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw || ""));
  } catch (_) {
    throw Object.assign(new Error("invalid_live_message_json"), { code: "invalid_live_message_json" });
  }
  const type = String(message?.type || "").trim();
  if (type === "realtimeInput") {
    const data = String(message?.audio?.data || "").trim();
    const mimeType = String(message?.audio?.mimeType || "audio/pcm;rate=16000").trim();
    if (!data || data.length > MAX_AUDIO_BASE64_CHARS || !mimeType.startsWith("audio/")) {
      throw Object.assign(new Error("invalid_live_audio"), { code: "invalid_live_audio" });
    }
    return { type, audio: { data, mimeType } };
  }
  if (type === "clientContent") {
    const turns = Array.isArray(message.turns) ? message.turns.slice(0, 20) : [];
    return { type, turns, turnComplete: message.turnComplete !== false };
  }
  if (type === "toolResponse") {
    const functionResponses = Array.isArray(message.functionResponses) ? message.functionResponses.slice(0, 20) : [];
    return { type, functionResponses };
  }
  if (type === "close") return { type };
  throw Object.assign(new Error("unsupported_live_message_type"), { code: "unsupported_live_message_type" });
}

async function forwardClientMessage(session, message) {
  if (message.type === "realtimeInput") return session.sendRealtimeInput({ audio: message.audio });
  if (message.type === "clientContent") {
    return session.sendClientContent({ turns: message.turns, turnComplete: message.turnComplete });
  }
  if (message.type === "toolResponse") {
    return session.sendToolResponse({ functionResponses: message.functionResponses });
  }
  if (message.type === "close") return session.close();
  throw new Error("unsupported_live_message_type");
}

module.exports = {
  MAX_AUDIO_BASE64_CHARS,
  parseClientMessage,
  forwardClientMessage
};
