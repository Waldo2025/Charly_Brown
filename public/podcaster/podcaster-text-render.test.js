const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildKaraokeSubtitleMarkup,
  normalizeKaraokeWordTimings,
  buildOnScreenTextRasterSnapshotPlan,
  buildMontageOnScreenTextAss
} = require("./podcaster-text-render.js");

test("both mode keeps caption timings and shifts token indices past the headline", () => {
  const text = "UNA IDEA CENTRAL\nEste es el diálogo literal";
  const timings = normalizeKaraokeWordTimings({
    wordTimings: [
      { text: "Este", startMs: 100, endMs: 300 },
      { text: "es", startMs: 300, endMs: 450 },
      { text: "el", startMs: 450, endMs: 560 },
      { text: "diálogo", startMs: 560, endMs: 900 },
      { text: "literal", startMs: 900, endMs: 1200 }
    ]
  }, text, { tokenOffset: 3 });

  assert.deepEqual(timings, [
    { text: "Este", startMs: 100, endMs: 300, tokenIndex: 3 },
    { text: "es", startMs: 300, endMs: 450, tokenIndex: 4 },
    { text: "el", startMs: 450, endMs: 560, tokenIndex: 5 },
    { text: "diálogo", startMs: 560, endMs: 900, tokenIndex: 6 },
    { text: "literal", startMs: 900, endMs: 1200, tokenIndex: 7 }
  ]);

  const html = buildKaraokeSubtitleMarkup(text, timings, timings[0].tokenIndex, {
    karaokeHighlightStyle: "pill"
  });
  assert.match(html, /data-karaoke-index="0"[^>]*>UNA<\/span>/);
  assert.match(html, /data-karaoke-index="1"[^>]*>IDEA<\/span>/);
  assert.match(html, /data-karaoke-index="2"[^>]*>CENTRAL<\/span>/);
  assert.doesNotMatch(html, /is-active[^>]*data-karaoke-index="[012]"/);
  assert.match(html, /is-active is-highlight-pill[^>]*data-karaoke-index="3"[^>]*>Este<\/span>/);
});

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

test("karaoke markup carries highlight style variables", () => {
  const html = buildKaraokeSubtitleMarkup("Hola mundo", [
    { tokenIndex: 0, startMs: 0, endMs: 300 },
    { tokenIndex: 1, startMs: 300, endMs: 700 }
  ], 1, {
    karaokeHighlightColor: "#22c55e",
    karaokeHighlightStyle: "pill",
    karaokeHighlightOpacity: 0.7,
    karaokeHighlightPaddingXPx: 12,
    karaokeHighlightPaddingYPx: 6,
    karaokeHighlightRadiusPx: 18
  });

  assert.match(html, /podcast-karaoke-word is-active is-highlight-pill/);
  assert.match(html, /--pod-karaoke-highlight-color:#22c55e/);
  assert.match(html, /--pod-karaoke-highlight-opacity:0\.7/);
  assert.match(html, /--pod-karaoke-highlight-radius:18px/);
});

test("raster and ASS karaoke use configured highlight color", () => {
  const settings = {
    fontFamily: "Inter",
    fontSizePx: 44,
    textColor: "#f8fafc",
    strokeColor: "#0f172a",
    karaokeHighlightColor: "#22c55e",
    karaokeHighlightStyle: "rect",
    karaokeHighlightOpacity: 0.8,
    karaokeHighlightPaddingXPx: 12,
    karaokeHighlightPaddingYPx: 4,
    karaokeHighlightRadiusPx: 4
  };
  const plan = buildOnScreenTextRasterSnapshotPlan({
    text: "Hola mundo",
    settings,
    wordTimings: [
      { tokenIndex: 0, startMs: 0, endMs: 300 },
      { tokenIndex: 1, startMs: 300, endMs: 700 }
    ],
    activeWordIndex: 1
  });
  assert.match(plan.html, /is-highlight-rect/);
  assert.match(plan.svg, /#22c55e/i);

  const ass = buildMontageOnScreenTextAss({
    width: 1280,
    height: 720,
    settings,
    segments: [{
      startSec: 0,
      endSec: 2,
      spec: {
        wrappedText: "Hola mundo",
        fontFamily: "Inter",
        fontSizePx: 44,
        textAlign: "center",
        rawXPx: 200,
        boxWidthPx: 600,
        yPx: 520,
        strokeEnabled: true,
        strokeWidthPx: 2
      },
      settings,
      wordTimings: [
        { tokenIndex: 0, startMs: 0, endMs: 300 },
        { tokenIndex: 1, startMs: 300, endMs: 700 }
      ]
    }]
  });
  assert.match(ass, /&H5EC522&/i);
});

test("ASS karaoke highlight supports pill and rect styles", () => {
  const makeAss = (karaokeHighlightStyle) => buildMontageOnScreenTextAss({
    width: 1280,
    height: 720,
    settings: {
      fontFamily: "Inter",
      fontSizePx: 44,
      textColor: "#f8fafc",
      strokeColor: "#0f172a",
      karaokeHighlightStyle,
      karaokeHighlightColor: "#22c55e",
      karaokeHighlightOpacity: 0.85
    },
    segments: [{
      startSec: 0,
      endSec: 2,
      spec: {
        wrappedText: "Hola mundo",
        fontFamily: "Inter",
        fontSizePx: 44,
        textAlign: "center",
        rawXPx: 200,
        boxWidthPx: 600,
        yPx: 520,
        strokeEnabled: true,
        strokeWidthPx: 2
      },
      settings: {
        fontFamily: "Inter",
        fontSizePx: 44,
        textColor: "#f8fafc",
        strokeColor: "#0f172a",
        karaokeHighlightStyle,
        karaokeHighlightColor: "#22c55e",
        karaokeHighlightOpacity: 0.85
      },
      wordTimings: [
        { tokenIndex: 0, startMs: 0, endMs: 300 },
        { tokenIndex: 1, startMs: 300, endMs: 700 }
      ]
    }]
  });

  const assPill = makeAss("pill");
  const assRect = makeAss("rect");

  assert.match(assPill, /\\bord1/);
  assert.match(assRect, /\\bord1/);
});

test("ASS karaoke highlight supports underline style", () => {
  const ass = buildMontageOnScreenTextAss({
    width: 1280,
    height: 720,
    settings: {
      fontFamily: "Inter",
      fontSizePx: 44,
      textColor: "#f8fafc",
      strokeColor: "#0f172a",
      karaokeHighlightStyle: "underline",
      karaokeHighlightColor: "#22c55e",
      karaokeHighlightOpacity: 0.85
    },
    segments: [{
      startSec: 0,
      endSec: 2,
      spec: {
        wrappedText: "Hola mundo",
        fontFamily: "Inter",
        fontSizePx: 44,
        textAlign: "center",
        rawXPx: 200,
        boxWidthPx: 600,
        yPx: 520,
        strokeEnabled: true,
        strokeWidthPx: 2
      },
      settings: {
        fontFamily: "Inter",
        fontSizePx: 44,
        textColor: "#f8fafc",
        strokeColor: "#0f172a",
        karaokeHighlightStyle: "underline",
        karaokeHighlightColor: "#22c55e",
        karaokeHighlightOpacity: 0.85
      },
      wordTimings: [
        { tokenIndex: 0, startMs: 0, endMs: 300 },
        { tokenIndex: 1, startMs: 300, endMs: 700 }
      ]
    }]
  });

  assert.match(ass, /\\u1/);
});
