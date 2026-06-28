import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const frontendSource = readFileSync(new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url), "utf8");
const backendSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

assert.match(
  frontendSource,
  /import \{ getStorage, ref as storageRef, uploadBytes, getDownloadURL \} from "https:\/\/www\.gstatic\.com\/firebasejs\/12\.7\.0\/firebase-storage\.js";/,
  "El frontend debe subir snapshots PNG a Firebase Storage, no enviarlos como base64 largo."
);

assert.match(
  frontendSource,
  /"sessions",[\s\S]*?normalizeMontageStorageSegment\(sessionId, "session"\),[\s\S]*?"tmp",[\s\S]*?frameFileName/,
  "Los snapshots de texto en pantalla deben guardarse en la ruta temporal permitida por storage.rules."
);

assert.doesNotMatch(
  frontendSource,
  /"owners",[\s\S]*?"tmp",[\s\S]*?"onscreen-text"/,
  "Los snapshots temporales no deben usar rutas profundas que no matchean storage.rules."
);

assert.doesNotMatch(
  frontendSource,
  /decodeURIComponent\(parsed\.searchParams\.get\("url"\)\)/,
  "El fallback local del proxy no debe decodificar dos veces URLs de Firebase Storage."
);

assert.match(
  frontendSource,
  /contentType: "image\/png"[\s\S]*temporary: "true"[\s\S]*purpose: "podcaster-onscreen-text-rendered-frame"/,
  "Los snapshots temporales deben subirse como PNG y marcarse con metadata temporal."
);

assert.match(
  frontendSource,
  /prepared\.payload\.onScreenTextRenderedSegments = shouldRenderOnScreenTextFrames && timeline\?\.segments\?\.length[\s\S]*buildMontageOnScreenTextRenderedSegmentsForExport/,
  "El submit del export debe generar y adjuntar renderedFrames de texto en pantalla antes del POST."
);

assert.match(
  frontendSource,
  /buildMontageExportPayloadForSubmission\(window\.getActiveSession\(\), \{\s*renderOnScreenTextFrames: false\s*\}\)/,
  "El preview/modal de export no debe generar snapshots PNG temporales."
);

assert.match(
  frontendSource,
  /buildMontageExportPayloadForSubmission\(session, \{\s*renderOnScreenTextFrames: true\s*\}\)/,
  "Los snapshots PNG temporales deben generarse solo al confirmar/iniciar el export."
);

assert.match(
  frontendSource,
  /const hasRemoteSource = Boolean\(String\(frame\.storagePath \|\| frame\.downloadUrl \|\| frame\.url \|\| ""\)\.trim\(\)\);[\s\S]*dataUrl: ""/,
  "El payload debe borrar dataUrl cuando el frame ya tiene storagePath/downloadUrl."
);

assert.match(
  backendSource,
  /storagePath,\s*downloadUrl,\s*url: downloadUrl,\s*mimeType: clampText\(frame\?\.mimeType \|\| "image\/png"/,
  "El backend debe aceptar renderedFrames por storagePath/downloadUrl además de dataUrl."
);

assert.match(
  backendSource,
  /async function appendMontageSceneOnScreenTextRenderedFrameFilters\(/,
  "El backend debe tener un compositor de frames PNG para texto en pantalla."
);

assert.match(
  backendSource,
  /appendMontageSceneOnScreenTextRenderedFrameFilters\([\s\S]*?if \(renderedTextOverlayResult\.appliedOverlayCount > 0\)[\s\S]*?else if \(input\.onScreenTextRenderedFrameAttempted !== true\)[\s\S]*?appendMontageSceneOnScreenTextAssFilters/,
  "El backend debe usar PNGs renderizados antes de caer al fallback ASS."
);

assert.match(
  backendSource,
  /Skipping ASS fallback because frontend attempted rendered PNG frames/,
  "El backend no debe volver al ASS amarillo legacy cuando el frontend ya intentó frames PNG."
);

console.log("Podcaster on-screen text storage-frame export contract OK.");
