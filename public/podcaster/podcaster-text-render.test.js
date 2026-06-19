const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildMontageOnScreenTextAss
} = require("./podcaster-text-render.js");

test("buildMontageOnScreenTextAss preserves bold italic and negative letter spacing for export parity", () => {
  const ass = buildMontageOnScreenTextAss({
    width: 1280,
    height: 720,
    settings: {
      fontFamily: "Inter",
      fontSizePx: 44,
      fontWeight: "bold",
      fontStyle: "italic",
      stylePreset: "glow",
      bgPreset: "none",
      textColor: "#f8fafc",
      strokeColor: "#0f172a"
    },
    segments: [{
      startSec: 0,
      endSec: 3,
      spec: {
        wrappedText: "Linea uno\nLinea dos",
        fontFamily: "Inter",
        fontSizePx: 44,
        textAlign: "center",
        rawXPx: 269,
        boxWidthPx: 742,
        yPx: 518,
        strokeEnabled: true,
        strokeWidthPx: 2,
        shadowEnabled: true,
        shadowX: 0,
        shadowY: 8,
        fontWeight: "bold",
        fontStyle: "italic",
        letterSpacingPx: -1.32
      },
      settings: {
        fontFamily: "Inter",
        fontWeight: "bold",
        fontStyle: "italic",
        stylePreset: "glow",
        bgPreset: "none",
        textColor: "#f8fafc",
        strokeColor: "#0f172a"
      },
      wordTimings: []
    }]
  });

  assert.match(ass, /\\b1/);
  assert.match(ass, /\\i1/);
  assert.match(ass, /\\fsp-1\.32/);
});
