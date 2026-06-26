const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeOnScreenTextTrackSettings,
  applyOnScreenTextTrackSettingValue,
  buildOnScreenTextTrackModalMarkup,
  resolveOnScreenTextMeasuredWrapResult,
  resolveOnScreenTextRenderSpec,
  resolveOnScreenTextClipVisibleTiming
} = require("./podcaster-on-screen-text.js");

function createFakeDocument() {
  const body = {
    children: [],
    appendChild(node) {
      node.parentNode = this;
      this.children.push(node);
      return node;
    },
    removeChild(node) {
      this.children = this.children.filter((item) => item !== node);
      node.parentNode = null;
      return node;
    }
  };

  return {
    body,
    documentElement: body,
    createElement() {
      return {
        style: {},
        textContent: "",
        parentNode: null,
        setAttribute() {},
        remove() {
          if (this.parentNode) this.parentNode.removeChild(this);
        },
        get scrollWidth() {
          let total = 0;
          for (const ch of String(this.textContent || "")) {
            if (ch === " ") total += 4;
            else if (ch === "i" || ch === "l") total += 4;
            else if (ch === "W" || ch === "M") total += 14;
            else total += 10;
          }
          return total;
        }
      };
    }
  };
}

test("measured wrap keeps narrow text on one line when browser metrics allow it", () => {
  const previousDocument = global.document;
  global.document = createFakeDocument();
  try {
    const result = resolveOnScreenTextMeasuredWrapResult("iiii iiii iiii", {
      boxWidthPx: 60,
      maxChars: 6,
      maxLines: 2,
      truncate: false,
      fontSizePx: 44,
      fontFamily: '"Inter", system-ui, sans-serif',
      fontWeight: "bold",
      fontStyle: "normal"
    });
    assert.equal(result.text, "iiii iiii iiii");
    assert.equal(result.truncated, false);
  } finally {
    global.document = previousDocument;
  }
});

test("render spec preserves frontend wrappedText for export parity", () => {
  const previousDocument = global.document;
  global.document = undefined;
  try {
    const spec = resolveOnScreenTextRenderSpec({
      settings: {
        fontFamily: "Inter",
        fontSizePx: 44,
        fontWeight: "bold",
        fontStyle: "normal"
      },
      layout: {
        xPct: 0.21,
        yPct: 0.72,
        widthPct: 0.58,
        heightPct: 0.14
      },
      sourceWidth: 1280,
      sourceHeight: 720,
      resolution: "source",
      text: "El inventor Marcos preparaba con nerviosismo el Dispositivo Beta en su laboratorio, listo para la prueba final.",
      wrappedText: "El inventor Marcos preparaba con nerviosismo el Dispositivo Beta en su laboratorio,\nlisto para la prueba final."
    });
    assert.equal(
      spec.wrappedText,
      "El inventor Marcos preparaba con nerviosismo el Dispositivo Beta en su laboratorio,\nlisto para la prueba final."
    );
    assert.equal(spec.text, "El inventor Marcos preparaba con nerviosismo el Dispositivo Beta en su laboratorio, listo para la prueba final.");
  } finally {
    global.document = previousDocument;
  }
});

test("render spec keeps 3d/bg-none tracking and vertical offset for export parity", () => {
  const previousDocument = global.document;
  global.document = undefined;
  try {
    const spec = resolveOnScreenTextRenderSpec({
      settings: {
        fontFamily: "Inter",
        fontSizePx: 44,
        fontWeight: "bold",
        fontStyle: "normal",
        stylePreset: "3d",
        bgPreset: "none"
      },
      layout: {
        xPct: 0.21,
        yPct: 0.72,
        widthPct: 0.58,
        heightPct: 0.14
      },
      sourceWidth: 1280,
      sourceHeight: 720,
      resolution: "source",
      text: "El inventor Marcos preparaba con nerviosismo el Dispositivo Beta en su laboratorio, listo para la prueba final.",
      wrappedText: "El inventor Marcos preparaba con nerviosismo el Dispositivo Beta en su laboratorio,\nlisto para la prueba final."
    });
    assert.equal(spec.letterSpacingEm, -0.03);
    assert.equal(spec.letterSpacingPx, -1.32);
    assert.equal(spec.textOffsetYPx, 7);
  } finally {
    global.document = previousDocument;
  }
});

test("clip visible timing offsets start by trimIn and shortens duration by trim window", () => {
  const timing = resolveOnScreenTextClipVisibleTiming({
    startMs: 4000,
    trimInMs: 750,
    trimOutMs: 3250
  });

  assert.equal(timing.startMs, 4750);
  assert.equal(timing.durationMs, 2500);
});

test("normalizes karaoke highlight style settings with safe defaults", () => {
  const defaults = normalizeOnScreenTextTrackSettings({});
  assert.equal(defaults.karaokeHighlightColor, "#facc15");
  assert.equal(defaults.karaokeHighlightStyle, "glow");
  assert.equal(defaults.karaokeHighlightOpacity, 0.92);
  assert.equal(defaults.karaokeHighlightPaddingXPx, 10);
  assert.equal(defaults.karaokeHighlightPaddingYPx, 4);
  assert.equal(defaults.karaokeHighlightRadiusPx, 12);

  const custom = normalizeOnScreenTextTrackSettings({
    karaokeHighlightColor: "#22c55e",
    karaokeHighlightStyle: "pill",
    karaokeHighlightOpacity: 72,
    karaokeHighlightPaddingXPx: 14,
    karaokeHighlightPaddingYPx: 5,
    karaokeHighlightRadiusPx: 10
  });
  assert.equal(custom.karaokeHighlightColor, "#22c55e");
  assert.equal(custom.karaokeHighlightStyle, "pill");
  assert.equal(custom.karaokeHighlightOpacity, 0.72);
  assert.equal(custom.karaokeHighlightPaddingXPx, 14);
  assert.equal(custom.karaokeHighlightPaddingYPx, 5);
  assert.equal(custom.karaokeHighlightRadiusPx, 10);
  assert.equal(
    normalizeOnScreenTextTrackSettings({ karaokeHighlightStyle: "invalid" }).karaokeHighlightStyle,
    "glow"
  );
});

test("applies karaoke highlight setting values and renders the karaoke modal tab", () => {
  const next = applyOnScreenTextTrackSettingValue({}, "karaokeHighlightStyle", "rect");
  assert.equal(next.karaokeHighlightStyle, "rect");
  assert.equal(applyOnScreenTextTrackSettingValue(next, "karaokeHighlightOpacity", "65").karaokeHighlightOpacity, 0.65);

  const markup = buildOnScreenTextTrackModalMarkup({
    karaokeHighlightColor: "#22c55e",
    karaokeHighlightStyle: "pill"
  });
  assert.match(markup, /data-onscreen-tab="layout"/);
  assert.match(markup, /data-onscreen-tab="appearance"/);
  assert.match(markup, /data-onscreen-tab="effects"/);
  assert.match(markup, /data-onscreen-tab="karaoke"/);
  assert.match(markup, /data-setting="karaokeHighlightColor"/);
  assert.match(markup, /data-setting="karaokeHighlightStyle"/);
});
