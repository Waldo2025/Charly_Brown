import { readFileSync } from "node:fs";

const mediaEditorJs = readFileSync(new URL("../public/podcaster/podcaster-media-editor.js", import.meta.url), "utf8");
const mediaEditorCss = readFileSync(new URL("../public/podcaster/css/podcaster-media-editor.css", import.meta.url), "utf8");

if (!/function sanitizeStylizedTextSceneData\(raw = null\)/.test(mediaEditorJs)) {
  throw new Error("El editor debe sanear el payload de texto estilizado antes de guardar o renderizar.");
}

if (!/backgroundColor:\s*''/.test(mediaEditorJs) || !/overlayColor:\s*''/.test(mediaEditorJs)) {
  throw new Error("El payload saneado debe limpiar fondos opacos del canvas estilizado.");
}

if (!/function renderStylizedTextToDataUrl\(textData = null\)/.test(mediaEditorJs)
  || !/backgroundColor:\s*'transparent'/.test(mediaEditorJs)
  || !/canvasEl\.toDataURL\('image\/png'\)/.test(mediaEditorJs)) {
  throw new Error("El render del texto estilizado debe rasterizarse sobre un canvas transparente.");
}

if (/\.pme-canvas-container\s*\{[\s\S]*background:\s*#000/.test(mediaEditorCss)) {
  throw new Error("El contenedor del editor de texto estilizado ya no debe usar fondo negro.");
}

if (!/\.pme-canvas-container canvas\s*\{[\s\S]*background:\s*transparent !important;/.test(mediaEditorCss)) {
  throw new Error("El canvas del editor debe permanecer transparente por CSS.");
}

if (!/\.pme-stylized-text-render\s*\{[\s\S]*position:\s*absolute;/.test(mediaEditorCss)) {
  throw new Error("El overlay rasterizado del texto estilizado debe conservar fondo transparente.");
}

console.log("Podcaster stylized text preview stays transparent OK.");
