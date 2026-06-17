import test from "node:test";
import assert from "node:assert/strict";

const karaokeApi = (await import("../public/podcaster/podcaster-text-render.js")).default;
const {
  buildMontageOnScreenTextAss,
  normalizeKaraokeWordTimings
} = karaokeApi;

test("buildMontageOnScreenTextAss creates ASS subtitle content with base and per-word karaoke events", () => {
  const wordTimings = normalizeKaraokeWordTimings({
    wordTimings: [
      { text: "Hola", startMs: 0, endMs: 180 },
      { text: "mundo", startMs: 180, endMs: 420 }
    ]
  }, "Hola mundo");

  const ass = buildMontageOnScreenTextAss({
    width: 1280,
    height: 720,
    segments: [
      {
        startSec: 0,
        endSec: 1.2,
        wordTimings,
        spec: {
          text: "Hola mundo",
          wrappedText: "Hola mundo",
          fontFamily: "Sora",
          fontSizePx: 44,
          lineSpacingPx: 6,
          strokeEnabled: true,
          strokeWidthPx: 2,
          shadowEnabled: true,
          shadowX: 0,
          shadowY: 4,
          shadowOpacity: 0.5,
          textAlign: "center",
          rawXPx: 256,
          boxWidthPx: 768,
          yPx: 520,
          boxEnabled: true,
          bgScale: 1,
          bgOpacity: 0.82
        }
      }
    ]
  });

  assert.match(ass, /\[Script Info\]/);
  assert.match(ass, /PlayResX: 1280/);
  assert.match(ass, /Style: KaraokeBase,/);
  assert.match(ass, /Style: KaraokeActive,/);
  assert.match(ass, /Dialogue: 0,0:00:00\.00,0:00:01\.20,KaraokeBase,/);
  assert.match(ass, /Dialogue: 1,0:00:00\.00,0:00:00\.18,KaraokeActive,/);
  assert.match(ass, /Dialogue: 1,0:00:00\.18,0:00:00\.42,KaraokeActive,/);
});
