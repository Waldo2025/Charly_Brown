const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveOnScreenTextMeasuredWrapResult,
  resolveOnScreenTextRenderSpec
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
