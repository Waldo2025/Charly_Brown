import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  resolveOnScreenTextRenderSpec
} = require("../public/on-screen-text-render-spec.js");

const baseInput = {
  settings: {
    fontSizePx: 44,
    strokeWidthPx: 0,
    shadowEnabled: false,
    shadowOpacity: 0,
    textAlign: "center"
  },
  layout: {
    widthPct: 0.38,
    heightPct: 0.14,
    xPct: 0.12,
    yPct: 0.88
  },
  resolution: "1080p",
  sourceWidth: 1920,
  sourceHeight: 1080,
  previewWidthPx: 960,
  previewHeightPx: 540,
  text: "Francisco Mora, desde la neuroeducacion, lo dejo claro.",
  fallback: ""
};

const plain = resolveOnScreenTextRenderSpec(baseInput);
if (plain.strokeEnabled !== false || plain.shadowEnabled !== false || plain.boxEnabled !== false) {
  throw new Error("Plain text debe salir sin stroke, sombra ni caja.");
}

const strokeOnly = resolveOnScreenTextRenderSpec({
  ...baseInput,
  settings: {
    ...baseInput.settings,
    strokeWidthPx: 3,
    shadowEnabled: false,
    shadowOpacity: 0
  }
});
if (strokeOnly.strokeEnabled !== true || strokeOnly.shadowEnabled !== false || strokeOnly.boxEnabled !== false) {
  throw new Error("Stroke only debe activar solo el contorno.");
}

const shadowOnly = resolveOnScreenTextRenderSpec({
  ...baseInput,
  settings: {
    ...baseInput.settings,
    strokeWidthPx: 0,
    shadowEnabled: true,
    shadowOpacity: 0.6,
    shadowBlurPx: 18,
    shadowOffsetXPx: 0,
    shadowOffsetYPx: 8
  }
});
if (shadowOnly.strokeEnabled !== false || shadowOnly.shadowEnabled !== true || shadowOnly.boxEnabled !== false) {
  throw new Error("Shadow only debe activar solo la sombra.");
}

if (!(plain.bottomSafetyPx > 0) || !(plain.yPx < Math.round(1080 * 0.88))) {
  throw new Error("La spec debe clamp el texto para respetar el margen inferior.");
}

if (!(plain.previewFontSizePx < plain.fontSizePx) || !(plain.previewLineHeightPx < plain.lineHeightPx)) {
  throw new Error("El preview debe escalar contra la altura del canvas de export.");
}

if (!(plain.boxHeightPx >= (plain.lineHeightPx * 2)) || !(plain.maxLines >= 2)) {
  throw new Error("La spec compartida debe reservar al menos dos lineas utiles para evitar cortes en la segunda linea.");
}

console.log("Podcast onscreen shared render spec OK.");
