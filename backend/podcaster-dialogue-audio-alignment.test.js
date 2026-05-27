const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeDialogueAudioWordTimings,
  extractGeminiDialogueAudioWordTimings
} = require("./podcaster-dialogue-audio-alignment.js");

test("normalizeDialogueAudioWordTimings keeps ordered bounded karaoke timings", () => {
  const timings = normalizeDialogueAudioWordTimings([
    { text: "Hola", startMs: 0, endMs: 220 },
    { text: "mundo", startMs: 221, endMs: 540 },
    { text: "", startMs: 600, endMs: 900 },
    { text: "!", startMs: 541, endMs: 541 }
  ]);

  assert.deepEqual(timings, [
    { text: "Hola", startMs: 0, endMs: 220, tokenIndex: 0 },
    { text: "mundo", startMs: 221, endMs: 540, tokenIndex: 1 }
  ]);
});

test("extractGeminiDialogueAudioWordTimings maps inline alignment metadata into normalized word timings", () => {
  const response = {
    candidates: [{
      content: {
        parts: [{
          inlineData: { data: "UklGRg==", mimeType: "audio/L16;rate=24000" },
          alignment: {
            words: [
              { word: "Hola", startTimeMs: 0, endTimeMs: 180 },
              { text: "mundo", startMs: 181, endMs: 420 }
            ]
          }
        }]
      }
    }]
  };

  assert.deepEqual(extractGeminiDialogueAudioWordTimings(response), [
    { text: "Hola", startMs: 0, endMs: 180, tokenIndex: 0 },
    { text: "mundo", startMs: 181, endMs: 420, tokenIndex: 1 }
  ]);
});
