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
  "La ruta experimental frontend puede existir solo como stub bloqueado."
);

assert.match(
  exportSource,
  /async function runFrontendMontageExport\([\s\S]*?frontend_full_video_export_disabled[\s\S]*?throw new Error\("frontend_full_video_export_disabled"\);[\s\S]*?\n\}/,
  "runFrontendMontageExport debe estar bloqueado antes de cualquier captura de video."
);

assert.doesNotMatch(
  exportSource,
  /await runFrontendMontageExport\(\{\s*payload: prepared\.payload/,
  "runMontageExport no debe intentar exportar el video completo en frontend; debe enviar el montaje a backend/FFmpeg."
);

assert.match(
  exportSource,
  /backend_ffmpeg_export_selected/,
  "runMontageExport debe registrar que el video completo usa backend FFmpeg."
);

assert.match(
  exportSource,
  /full_video_backend_ffmpeg_text_frames_frontend/,
  "El flujo debe dejar claro que frontend solo genera capturas PNG de texto/karaoke."
);

assert.match(
  exportSource,
  /const submissionPayload = stripMontageExportSubmissionPayload\(prepared\.payload\);[\s\S]*authFetchJson\(buildMontageExportEndpoint\("\/api\/podcaster\/montage\/export"\)/,
  "runMontageExport debe mandar el payload preparado al endpoint backend de FFmpeg."
);

assert.doesNotMatch(
  exportSource,
  /runFrontendMontageExport,\s*\n\s*runMontageExport/,
  "runFrontendMontageExport no debe exponerse en PodcasterMontageExportApi."
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
  exportSource,
  /const sourceWidth = Math\.max\(2, Math\.round\(Number\(containerRect\.width/,
  "La capa DOM de texto debe rasterizarse primero en coordenadas del stage real del preview."
);

assert.match(
  exportSource,
  /viewBox="0 0 \$\{sourceWidth\} \$\{sourceHeight\}"/,
  "El SVG intermedio del overlay debe usar el tamaño fuente del preview, no el tamaño final del MP4."
);

assert.match(
  exportSource,
  /ctx\.drawImage\(img, 0, 0, width, height\);/,
  "El overlay rasterizado en coordenadas del preview debe escalarse al canvas final."
);

assert.match(
  exportSource,
  /function getFrontendMontageRenderedTextSegments\(payload = \{\}\)/,
  "El export frontend debe leer los renderedFrames del timeline/payload preparado."
);

assert.match(
  exportSource,
  /function selectFrontendMontageRenderedTextFrameItems\(payload = \{\}, currentMs = 0\)/,
  "El export frontend debe seleccionar frames de texto por currentMs usando la lógica temporal del timeline."
);

assert.match(
  exportSource,
  /async function drawFrontendMontageRenderedTextFrames\(ctx = null, payload = \{\}, currentMs = 0, width = 0, height = 0\)/,
  "El export frontend debe dibujar los PNG rasterizados de karaoke en vez de reconstruir el overlay desde DOM."
);

assert.match(
  exportSource,
  /const renderedTextDrawn = await drawFrontendMontageRenderedTextFrames\(ctx, payload, currentMs, width, height\);[\s\S]*if \(!renderedTextDrawn && domOverlay/,
  "El overlay DOM debe quedar solo como fallback cuando no existan renderedFrames."
);

assert.match(
  exportSource,
  /buildFrontendMontageRenderedTextSegmentKey/,
  "El export frontend debe deduplicar renderedSegments duplicados entre payload y timeline."
);

assert.match(
  podcasterSource,
  /exportPreviewController,/,
  "El controlador de preview del montaje debe estar disponible en window para captura frame-by-frame."
);

console.log("Podcaster montage frontend export contract OK.");
