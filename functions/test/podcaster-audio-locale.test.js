const assert = require("node:assert/strict");
const test = require("node:test");
const {
  normalizeTtsVoiceName,
  resolveTtsSpeechLocale
} = require("../src/ai-jobs.js");

test("Gemini TTS distingue las tres variantes de español", () => {
  const mexico = resolveTtsSpeechLocale("es-MX");
  const spain = resolveTtsSpeechLocale("es-ES");
  const neutral = resolveTtsSpeechLocale("es-419");

  assert.deepEqual([mexico.languageCode, spain.languageCode, neutral.languageCode], ["es", "es", "es"]);
  assert.match(mexico.instruction, /Mexican Spanish/i);
  assert.match(spain.instruction, /Peninsular Spanish/i);
  assert.match(neutral.instruction, /Latin American Spanish/i);
  assert.equal(resolveTtsSpeechLocale("es").speechLocale, "es-MX");
});

test("Gemini TTS acepta idiomas y voces oficiales", () => {
  assert.equal(resolveTtsSpeechLocale("ja").languageCode, "ja");
  assert.equal(normalizeTtsVoiceName("Kore"), "Kore");
});

test("Gemini TTS rechaza idioma o voz desconocidos", () => {
  assert.throws(() => resolveTtsSpeechLocale("xx-INVALID"), /unsupported_speech_locale/);
  assert.throws(() => normalizeTtsVoiceName("UnknownVoice"), /unsupported_tts_voice/);
});
