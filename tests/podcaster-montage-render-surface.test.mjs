import test from "node:test";
import assert from "node:assert/strict";

await import("../public/podcaster/podcaster-text-render.js");
const renderSurfaceApi = await import("../public/podcaster/podcaster-montage-render-surface.js");

const {
  normalizeMontageRenderMode,
  resolveMontageRenderEntryAtTime,
  resolveMontageActiveOverlayCards,
  buildMontageRenderAssContent
} = renderSurfaceApi;

test("normalizeMontageRenderMode defaults unknown values to browser", () => {
  assert.equal(normalizeMontageRenderMode("browser"), "browser");
  assert.equal(normalizeMontageRenderMode("ffmpeg-legacy"), "ffmpeg-legacy");
  assert.equal(normalizeMontageRenderMode(""), "browser");
  assert.equal(normalizeMontageRenderMode("weird"), "browser");
});

test("resolveMontageRenderEntryAtTime picks the active timeline entry", () => {
  const payload = {
    entries: [
      { rowId: "row-1", sceneIndex: 1, timelineStartMs: 0, durationMs: 1000 },
      { rowId: "row-2", sceneIndex: 2, timelineStartMs: 1000, durationMs: 1200 }
    ]
  };

  assert.equal(resolveMontageRenderEntryAtTime(payload, 100)?.rowId, "row-1");
  assert.equal(resolveMontageRenderEntryAtTime(payload, 1500)?.rowId, "row-2");
  assert.equal(resolveMontageRenderEntryAtTime(payload, 99999)?.rowId, "row-2");
});

test("resolveMontageActiveOverlayCards returns only active cards sorted by z-index", () => {
  const cards = resolveMontageActiveOverlayCards([
    { id: "late", startMs: 0, durationMs: 2000, zIndex: 50, textLines: ["Late"] },
    { id: "inactive", startMs: 3000, durationMs: 1000, zIndex: 1, textLines: ["No"] },
    { id: "early", startMs: 0, durationMs: 2000, zIndex: 10, textLines: ["Early"] }
  ], 500);

  assert.deepEqual(cards.map((item) => item.card.id), ["early", "late"]);
  assert.ok(cards.every((item) => item.active === true));
});

test("buildMontageRenderAssContent builds karaoke ASS from canonical payload", () => {
  const ass = buildMontageRenderAssContent({
    payload: {
      resolution: "720p",
      partyKaraoke: true,
      onScreenTextTimeline: {
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
            rowId: "row-1",
            text: "Hola mundo",
            startMs: 0,
            durationMs: 1200,
            layout: { xPct: 0.2, yPct: 0.72, widthPct: 0.58, heightPct: 0.14 }
          }
        ]
      },
      dialogueAudioMap: {
        "row-1": {
          playbackRate: 1,
          wordTimings: [
            { text: "Hola", startMs: 0, endMs: 180 },
            { text: "mundo", startMs: 180, endMs: 420 }
          ]
        }
      }
    },
    width: 1280,
    height: 720,
    resolveSpec: ({ text }) => ({
      text,
      wrappedText: text,
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
    })
  });

  assert.match(ass, /Style: KaraokeBase,/);
  assert.match(ass, /Dialogue: 2,0:00:00\.00,0:00:00\.18,KaraokeActive,/);
  assert.match(ass, /Hola/);
  assert.match(ass, /mundo/);
});
