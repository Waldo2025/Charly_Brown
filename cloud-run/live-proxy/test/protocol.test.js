const test = require("node:test");
const assert = require("node:assert/strict");
const { parseClientMessage, forwardClientMessage } = require("../protocol.js");

test("live protocol accepts bounded PCM audio", () => {
  const message = parseClientMessage(JSON.stringify({
    type: "realtimeInput",
    audio: { data: "AQID", mimeType: "audio/pcm;rate=16000" }
  }));
  assert.equal(message.type, "realtimeInput");
  assert.equal(message.audio.data, "AQID");
});

test("live protocol rejects unknown and malformed messages", () => {
  assert.throws(() => parseClientMessage("not-json"), /invalid_live_message_json/);
  assert.throws(() => parseClientMessage(JSON.stringify({ type: "unknown" })), /unsupported_live_message_type/);
  assert.throws(() => parseClientMessage(JSON.stringify({ type: "realtimeInput", audio: { data: "", mimeType: "audio/pcm" } })), /invalid_live_audio/);
});

test("live protocol forwards client content without exposing credentials", async () => {
  let received = null;
  await forwardClientMessage({
    async sendClientContent(value) { received = value; }
  }, {
    type: "clientContent",
    turns: [{ role: "user", parts: [{ text: "Hola" }] }],
    turnComplete: true
  });
  assert.equal(received.turns[0].parts[0].text, "Hola");
  assert.equal(received.turnComplete, true);
});
