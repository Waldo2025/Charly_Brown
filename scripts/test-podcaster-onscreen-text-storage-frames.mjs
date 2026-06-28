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
  /"tmp",\s*"onscreen-text"/,
  "Los snapshots de texto en pantalla deben guardarse bajo una ruta temporal estable."
);

assert.match(
  frontendSource,
  /contentType: "image\/png"[\s\S]*temporary: "true"[\s\S]*purpose: "podcaster-onscreen-text-rendered-frame"/,
  "Los snapshots temporales deben subirse como PNG y marcarse con metadata temporal."
);

assert.match(
  frontendSource,
  /prepared\.payload\.onScreenTextRenderedSegments = timeline\?\.segments\?\.length[\s\S]*buildMontageOnScreenTextRenderedSegmentsForExport/,
  "El submit del export debe generar y adjuntar renderedFrames de texto en pantalla antes del POST."
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
  /appendMontageSceneOnScreenTextRenderedFrameFilters\([\s\S]*?if \(renderedTextOverlayResult\.appliedOverlayCount > 0\)[\s\S]*?appendMontageSceneOnScreenTextAssFilters/,
  "El backend debe usar PNGs renderizados antes de caer al fallback ASS."
);

console.log("Podcaster on-screen text storage-frame export contract OK.");
