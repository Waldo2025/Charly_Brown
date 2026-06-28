import test from "node:test";
import assert from "node:assert/strict";

const karaokeApi = (await import("../public/podcaster/podcaster-text-render.js")).default;
const {
  buildMontageOnScreenTextAss,
  normalizeKaraokeWordTimings,
  scaleKaraokeWordTimingsForPlaybackRate
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
    settings: {
      fontFamily: "Unbounded",
      stylePreset: "3d",
      bgPreset: "none",
      textColor: "#f8fafc",
      strokeColor: "#0f172a",
      textOpacity: 1,
      karaokeHighlightOpacity: 1
    },
    segments: [
      {
        startSec: 0,
        endSec: 1.2,
        wordTimings,
        settings: {
          fontFamily: "Unbounded",
          stylePreset: "3d",
          bgPreset: "none",
          textColor: "#f8fafc",
          strokeColor: "#0f172a",
          textOpacity: 1,
          karaokeHighlightOpacity: 1
        },
        spec: {
          text: "Hola mundo",
          wrappedText: "Hola mundo",
          fontFamily: "Unbounded",
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
          boxEnabled: false,
          bgScale: 1,
          bgOpacity: 0
        }
      }
    ]
  });

  assert.match(ass, /\[Script Info\]/);
  assert.match(ass, /PlayResX: 1280/);
  assert.match(ass, /Style: KaraokeBase,/);
  assert.match(ass, /Style: KaraokeActive,/);
  assert.match(ass, /Dialogue: 0,0:00:00\.00,0:00:01\.20,KaraokeBase,/);
  assert.match(ass, /Dialogue: 1,0:00:00\.00,0:00:01\.20,KaraokeBase,/);
  assert.match(ass, /Dialogue: 2,0:00:00\.00,0:00:00\.18,KaraokeActive,/);
  assert.match(ass, /Dialogue: 2,0:00:00\.18,0:00:00\.42,KaraokeActive,/);
  assert.match(ass, /\\1c&HFCFAF8&/);
  assert.match(ass, /\\1c&H15CCFA&/);
  assert.match(ass, /\\4a&HFF&/);
  assert.match(ass, /\{\\1c&H15CCFA&\\1a&H00&\\2c&H15CCFA&\\2a&H00&\}Hola/);
  assert.match(ass, /\{\\1c&HFCFAF8&\\1a&H00&\\2c&HFCFAF8&\\2a&H00&\}mundo/);
  assert.doesNotMatch(ass, /\\4c&H[0-9A-F]{8}/, "bg-none no debe inyectar caja opaca en los eventos");
});

test("buildMontageOnScreenTextAss scales karaoke word events using playbackRate", () => {
  const baseWordTimings = normalizeKaraokeWordTimings({
    wordTimings: [
      { text: "Hola", startMs: 0, endMs: 200 },
      { text: "mundo", startMs: 200, endMs: 400 }
    ]
  }, "Hola mundo");
  const scaledWordTimings = scaleKaraokeWordTimingsForPlaybackRate(baseWordTimings, 2);

  assert.deepEqual(scaledWordTimings.map((item) => [item.startMs, item.endMs]), [
    [0, 100],
    [100, 200]
  ]);

  const ass = buildMontageOnScreenTextAss({
    width: 1280,
    height: 720,
    settings: {
      fontFamily: "Unbounded",
      stylePreset: "3d",
      bgPreset: "none",
      textColor: "#f8fafc",
      strokeColor: "#0f172a",
      textOpacity: 1
    },
    segments: [
      {
        startSec: 0,
        endSec: 1,
        wordTimings: baseWordTimings,
        playbackRate: 2,
        settings: {
          fontFamily: "Unbounded",
          stylePreset: "3d",
          bgPreset: "none",
          textColor: "#f8fafc",
          strokeColor: "#0f172a",
          textOpacity: 1
        },
        spec: {
          text: "Hola mundo",
          wrappedText: "Hola mundo",
          fontFamily: "Unbounded",
          fontSizePx: 44,
          lineSpacingPx: 6,
          strokeEnabled: true,
          strokeWidthPx: 2,
          shadowEnabled: true,
          shadowX: 0,
          shadowY: 4,
          textAlign: "center",
          rawXPx: 256,
          boxWidthPx: 768,
          yPx: 520,
          boxEnabled: false,
          bgOpacity: 0
        }
      }
    ]
  });

  assert.match(ass, /Dialogue: 2,0:00:00\.00,0:00:00\.10,KaraokeActive,/);
  assert.match(ass, /Dialogue: 2,0:00:00\.10,0:00:00\.20,KaraokeActive,/);
});

test("buildMontageOnScreenTextAss preserves selected karaoke highlight shape", () => {
  const wordTimings = normalizeKaraokeWordTimings({
    wordTimings: [
      { text: "Hola", startMs: 0, endMs: 180 },
      { text: "mundo", startMs: 180, endMs: 420 }
    ]
  }, "Hola mundo");

  const ass = buildMontageOnScreenTextAss({
    width: 1280,
    height: 720,
    settings: {
      fontFamily: "Unbounded",
      stylePreset: "3d",
      bgPreset: "none",
      textColor: "#f8fafc",
      strokeColor: "#0f172a",
      textOpacity: 1,
      karaokeHighlightColor: "#22c55e",
      karaokeHighlightStyle: "pill",
      karaokeHighlightOpacity: 0.72,
      karaokeHighlightPaddingXPx: 14,
      karaokeHighlightPaddingYPx: 5,
      karaokeHighlightRadiusPx: 10
    },
    segments: [
      {
        startSec: 0,
        endSec: 1,
        wordTimings,
        settings: {
          fontFamily: "Unbounded",
          stylePreset: "3d",
          bgPreset: "none",
          textColor: "#f8fafc",
          strokeColor: "#0f172a",
          textOpacity: 1,
          karaokeHighlightColor: "#22c55e",
          karaokeHighlightStyle: "pill",
          karaokeHighlightOpacity: 0.72,
          karaokeHighlightPaddingXPx: 14,
          karaokeHighlightPaddingYPx: 5,
          karaokeHighlightRadiusPx: 10
        },
        spec: {
          text: "Hola mundo",
          wrappedText: "Hola mundo",
          fontFamily: "Unbounded",
          fontSizePx: 44,
          lineSpacingPx: 6,
          strokeEnabled: true,
          strokeWidthPx: 2,
          shadowEnabled: true,
          shadowX: 0,
          shadowY: 4,
          textAlign: "center",
          rawXPx: 256,
          boxWidthPx: 768,
          yPx: 520,
          boxEnabled: false
        }
      }
    ]
  });

  assert.match(ass, /Style: KaraokeActiveBox,/);
  assert.match(ass, /Dialogue: 2,0:00:00\.00,0:00:00\.18,KaraokeActiveBox,/);
  assert.match(ass, /\\1c&H170602&/);
  assert.match(ass, /\\4c&H5EC522&/);
  assert.match(ass, /\\3c&H5EC522&/);
  assert.match(ass, /\\1a&HFF&\\2a&HFF&\\3a&HFF&\\4a&HFF&\\bord0\\shad0/);
  assert.match(ass, /\\bord8\\shad0/);
});
