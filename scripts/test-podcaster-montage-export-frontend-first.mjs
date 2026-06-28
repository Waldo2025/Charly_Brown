import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const exportSource = readFileSync(
  new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url),
  "utf8"
);
const podcasterSource = readFileSync(
  new URL("../public/podcaster/podcaster.js", import.meta.url),
  "utf8"
);

assert.match(
  exportSource,
  /async function runFrontendMontageExport\(/,
  "Debe existir una ruta de export frontend frame-by-frame antes de enviar al backend."
);

assert.match(
  exportSource,
  /canvas\.captureStream\(fps\)/,
  "La ruta frontend debe grabar un canvas con captureStream para renderizar frames controlados."
);

assert.match(
  exportSource,
  /new MediaRecorder\(combinedStream,\s*\{\s*mimeType/,
  "La ruta frontend debe usar MediaRecorder con MIME detectado en runtime."
);

assert.match(
  exportSource,
  /selectFrontendMontageExportMimeType\(\)[\s\S]*video\/mp4/,
  "La ruta frontend debe preferir MP4 cuando el navegador lo soporte."
);

assert.match(
  exportSource,
  /await runFrontendMontageExport\(\{\s*payload: prepared\.payload/,
  "runMontageExport debe intentar primero la exportación frontend con el payload preparado."
);

assert.match(
  exportSource,
  /frontend_export_fallback_backend/,
  "Si falla la captura frontend, el flujo debe registrar fallback al backend."
);

assert.match(
  podcasterSource,
  /exportPreviewController,/,
  "El controlador de preview del montaje debe estar disponible en window para captura frame-by-frame."
);

console.log("Podcaster montage frontend export contract OK.");
