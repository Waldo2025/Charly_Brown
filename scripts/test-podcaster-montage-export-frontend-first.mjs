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
  /const MONTAGE_FRONTEND_EXPORT_FPS = 60;/,
  "El export frontend de MP4 debe capturar a 60fps."
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
  exportSource,
  /function decodeFrontendMontageDataUrlToArrayBuffer\(/,
  "Los audios data: del timeline deben decodificarse localmente sin pasar por fetch."
);

assert.match(
  exportSource,
  /if \(cleanSrc\.startsWith\("data:"\)\) \{\s*const arrayBuffer = decodeFrontendMontageDataUrlToArrayBuffer\(cleanSrc\);/s,
  "decodeFrontendMontageAudioBuffer debe evitar fetch(data:) porque CSP bloquea data: en connect-src."
);

assert.match(
  exportSource,
  /async function waitFrontendMontageVisibleMediaReady\(\{/,
  "Cada frame debe sincronizar los videos visibles antes de dibujar el canvas."
);

assert.match(
  exportSource,
  /await waitFrontendMontageVisibleMediaReady\(\{\s*payload,\s*currentMs\s*\}\);/,
  "drawFrontendMontageFrame debe esperar el seek del video visible por frame."
);

assert.match(
  exportSource,
  /frontend_export_video_scene_change/,
  "El export frontend debe registrar cambios de escena para diagnosticar capturas pegadas."
);

assert.match(
  exportSource,
  /async function playFrontendMontageVideoForExport\(/,
  "El export frontend debe reproducir el video entre cambios de escena en vez de seekear cada frame."
);

assert.match(
  exportSource,
  /MONTAGE_FRONTEND_EXPORT_DRIFT_SEEK_THRESHOLD_SEC/,
  "El export frontend debe limitar los seeks a cambios de escena o drift real."
);

assert.match(
  exportSource,
  /const resolution = resolveEffectiveExportResolution\(requestedResolution, reel\);/,
  "El export frontend debe resolver source a una resolución de export real, no al tamaño del modal."
);

assert.doesNotMatch(
  exportSource,
  /getBoundingClientRect\?\.\(\)[\s\S]{0,260}return \{\s*width,\s*height\s*\};/,
  "El tamaño de salida frontend no debe salir del rect DOM del preview."
);

assert.match(
  exportSource,
  /const elapsedMs = Math\.max\(0, performance\.now\(\) - startedAt\);[\s\S]*const currentMs = Math\.min\(durationMs, Math\.round\(elapsedMs\)\);/,
  "El loop de captura debe usar tiempo real para que el video no quede lento respecto al audio."
);

assert.match(
  exportSource,
  /syncMedia = frameIndex === 0 \|\| window\.montageExportJobState\?\.frontendVideoSceneKey !== sceneKey/,
  "El export frontend no debe hacer sync/seek bloqueante en cada frame."
);

assert.match(
  exportSource,
  /window\.montageExportJobState\?\.frontendExportCapturing === true/,
  "Durante el export frontend debe existir un flag que desactive JASSUB en la captura."
);

assert.match(
  exportSource,
  /await prepareFrontendMontageDomSubtitleCapture\(payload\)/,
  "El export frontend debe preparar captura DOM de subtítulos antes de grabar."
);

assert.match(
  exportSource,
  /restoreFrontendMontageDomSubtitleCapture\(payload,/,
  "El export frontend debe restaurar el renderer de subtítulos al terminar o fallar."
);

assert.match(
  podcasterSource,
  /exportPreviewController,/,
  "El controlador de preview del montaje debe estar disponible en window para captura frame-by-frame."
);

console.log("Podcaster montage frontend export contract OK.");
