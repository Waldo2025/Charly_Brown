const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildMontageBrowserFinalVisualPayload
} = require("./montage-browser-render.js");

test("browser final visual payload preserves on-screen text timeline and brand asset url", () => {
  const payload = buildMontageBrowserFinalVisualPayload({
    renderMode: "browser",
    onScreenTextSettings: {
      enabled: true,
      fontFamily: "Inter"
    },
    onScreenTextSegments: [
      {
        id: "row-1-onscreen",
        rowId: "row-1",
        text: "Linea uno linea dos",
        wrappedText: "Linea uno\nlinea dos",
        startMs: 0,
        durationMs: 2400,
        layout: { xPct: 0.21, yPct: 0.72, widthPct: 0.58, heightPct: 0.14 }
      }
    ],
    overlayCards: [{ id: "card-1" }],
    brandOverlay: {
      enabled: true,
      assetPath: "public/podcaster/logo.png",
      position: "top-right"
    }
  }, "/Users/waldolopez/Documents/CharlyBrown");

  assert.equal(payload.renderMode, "browser");
  assert.equal(payload.onScreenTextTimeline.enabled, true);
  assert.equal(payload.onScreenTextTimeline.settings.fontFamily, "Inter");
  assert.equal(payload.onScreenTextTimeline.segments.length, 1);
  assert.equal(payload.onScreenTextTimeline.segments[0].wrappedText, "Linea uno\nlinea dos");
  assert.equal(payload.onScreenTextSegments.length, 1);
  assert.equal(payload.overlayCards.length, 1);
  assert.match(payload.brandOverlay.assetUrl, /^file:\/\/\/Users\/waldolopez\/Documents\/CharlyBrown\/public\/podcaster\/logo\.png$/);
});
