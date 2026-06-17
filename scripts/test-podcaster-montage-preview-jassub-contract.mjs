import { readFileSync } from "node:fs";

const front = readFileSync(new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/podcaster.css", import.meta.url), "utf8");
const vendor = readFileSync(new URL("../public/vendor/jassub/jassub.js", import.meta.url), "utf8");

if (!/import JASSUB from "\.\.\/vendor\/jassub\/jassub\.js";/.test(front)) {
  throw new Error("El preview del modal debe importar JASSUB localmente.");
}

if (!/id="montageExportPreviewSubtitleCanvas"/.test(html)) {
  throw new Error("El modal de export debe incluir un canvas dedicado para subtítulos ASS.");
}

if (!/function buildMontageExportPreviewAssContent\(payload = \{\}\)/.test(front)
  || !/new JASSUB\(\{[\s\S]*canvas,[\s\S]*subContent: assContent/s.test(front)
  || !/await montageExportJassubState\.instance\.renderer\.setTrack\(assContent\);/.test(front)) {
  throw new Error("El preview debe construir un track ASS y reutilizar la instancia de JASSUB.");
}

if (!/function bindMontageExportPreviewJassub\(\)/.test(front)
  || !/scheduleMontageExportPreviewJassubLoop\(\)/.test(front)
  || !/manualRender\(\{[\s\S]*mediaTime: currentTimeMs \/ 1000/s.test(front)) {
  throw new Error("El preview debe sincronizar el canvas ASS con el tiempo del modal.");
}

if (!/\.montage-export-preview-subtitle-canvas\s*\{[\s\S]*position: absolute[\s\S]*pointer-events: none[\s\S]*z-index: 10/s.test(css)
  || !/data-subtitle-renderer="jassub"\] #montageExportPreviewOverlay[\s\S]*display: none !important/s.test(css)) {
  throw new Error("El CSS del preview debe superponer el canvas ASS y ocultar el overlay DOM cuando JASSUB está activo.");
}

if (!/\.\.\/jassub-deps\/rvfc-polyfill\.js/.test(vendor)
  || !/\.\.\/jassub-deps\/abslink\/abslink\.js/.test(vendor)) {
  throw new Error("La build vendorizada de JASSUB debe resolver dependencias locales, no bare imports.");
}

console.log("Podcaster montage preview JASSUB contract OK.");
