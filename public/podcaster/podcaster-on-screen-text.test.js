const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeOnScreenTextTrackSettings,
  applyOnScreenTextTrackSettingValue,
  buildOnScreenTextTrackModalMarkup,
  resolveOnScreenTextMeasuredWrapResult,
  resolveOnScreenTextRenderSpec,
  resolveOnScreenTextClipVisibleTiming,
  normalizePodcasterSceneTextFields,
  resolvePodcasterSceneOverlayText,
  getPodcasterSceneKaraokeTokenOffset,
  getOnScreenTextClipText,
  isValidPodcasterHeadlineText
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

test("migrates legacy overlay copy to captions when it is the literal dialogue", () => {
  const normalized = normalizePodcasterSceneTextFields({
    text: "¿Cómo cambia nuestra forma de aprender?",
    onScreenText: "¿Cómo cambia nuestra forma de aprender?"
  });

  assert.equal(normalized.headlineText, "");
  assert.equal(normalized.captionText, "¿Cómo cambia nuestra forma de aprender?");
  assert.equal(normalized.overlayMode, "captions");
  assert.equal(normalized.textSource, "migrated");
  assert.equal(normalized.onScreenText, "¿Cómo cambia nuestra forma de aprender?");
});

test("migrates no-summarize legacy copy to captions and editorial copy to headline", () => {
  const caption = normalizePodcasterSceneTextFields({
    text: "Diálogo diferente",
    onScreenText: "Subtítulo literal conservado",
    onScreenTextNoSummarize: true
  });
  assert.equal(caption.headlineText, "");
  assert.equal(caption.captionText, "Subtítulo literal conservado");
  assert.equal(caption.overlayMode, "captions");

  const headline = normalizePodcasterSceneTextFields({
    text: "Este es el diálogo completo de la escena.",
    onScreenText: "UNA NUEVA MIRADA"
  });
  assert.equal(headline.headlineText, "UNA NUEVA MIRADA");
  assert.equal(headline.captionText, "");
  assert.equal(headline.overlayMode, "headline");
  assert.equal(headline.textSource, "migrated");
});

test("keeps explicit empty canonical text empty and never falls back to row.text", () => {
  const normalized = normalizePodcasterSceneTextFields({
    text: "Este diálogo no debe aparecer como overlay.",
    headlineText: "",
    captionText: "",
    onScreenText: "LEGACY QUE TAMPOCO DEBE REVIVIR",
    overlayMode: "none",
    textSource: "manual"
  });

  assert.equal(normalized.headlineText, "");
  assert.equal(normalized.captionText, "");
  assert.equal(normalized.overlayMode, "none");
  assert.equal(normalized.onScreenText, "");
  assert.equal(resolvePodcasterSceneOverlayText(normalized), "");
  assert.equal(getOnScreenTextClipText(normalized), "");

  const noEditorialFields = normalizePodcasterSceneTextFields({ text: "Sólo existe diálogo" });
  assert.equal(noEditorialFields.onScreenText, "");
  assert.equal(getOnScreenTextClipText({ text: "Sólo existe diálogo" }), "");
});

test("resolves headline and captions from the explicit overlay mode", () => {
  const row = {
    headlineText: "IDEA CENTRAL",
    captionText: "Este es el diálogo literal.",
    text: "Texto que nunca debe reemplazar las pistas.",
    textSource: "manual"
  };

  assert.equal(resolvePodcasterSceneOverlayText({ ...row, overlayMode: "none" }), "");
  assert.equal(resolvePodcasterSceneOverlayText({ ...row, overlayMode: "headline" }), "IDEA CENTRAL");
  assert.equal(resolvePodcasterSceneOverlayText({ ...row, overlayMode: "captions" }), "Este es el diálogo literal.");
  assert.equal(resolvePodcasterSceneOverlayText({ ...row, overlayMode: "both" }), "IDEA CENTRAL\nEste es el diálogo literal.");
});

test("both mode offsets karaoke by the exact number of headline words", () => {
  assert.equal(getPodcasterSceneKaraokeTokenOffset({
    headlineText: "UNA IDEA CENTRAL",
    captionText: "Este es el diálogo literal.",
    overlayMode: "both"
  }), 3);
  assert.equal(getPodcasterSceneKaraokeTokenOffset({
    headlineText: "UNA IDEA CENTRAL",
    captionText: "Este es el diálogo literal.",
    overlayMode: "captions"
  }), 0);
  assert.equal(getPodcasterSceneKaraokeTokenOffset({
    headlineText: "Texto repetido",
    captionText: "Texto repetido",
    overlayMode: "both"
  }), 0);
});

test("validates optional headlines as two to six words and at most 48 characters", () => {
  assert.equal(isValidPodcasterHeadlineText(""), true);
  assert.equal(isValidPodcasterHeadlineText("CAMBIO REAL"), true);
  assert.equal(isValidPodcasterHeadlineText("uno"), false);
  assert.equal(isValidPodcasterHeadlineText("uno dos tres cuatro cinco seis"), true);
  assert.equal(isValidPodcasterHeadlineText("uno dos tres cuatro cinco seis siete"), false);
  assert.equal(isValidPodcasterHeadlineText("X".repeat(49)), false);
  assert.equal(isValidPodcasterHeadlineText("EDUCACIÓN SIN LÍMITES"), true);
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
