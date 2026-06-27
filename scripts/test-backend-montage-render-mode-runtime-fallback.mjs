import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/backend/server.js",
  "utf8"
);

assert.match(
  source,
  /if \(shouldUseBrowserMontageRenderer\(input\)\) \{[\s\S]*const browserRendererAvailability = getMontageBrowserRendererAvailability\(\);/,
  "El endpoint de export debe validar la disponibilidad real del browser renderer."
);

assert.match(
  source,
  /const err = new Error\("montage_browser_renderer_unavailable"\);[\s\S]*err\.status = 503;[\s\S]*throw err;/,
  "Cuando Chromium no exista, el backend debe fallar explícitamente antes de persistir o encolar el job."
);

assert.doesNotMatch(
  source,
  /render-mode-fallback|ffmpeg-legacy|resolveRuntimeMontageRenderMode/,
  "El backend no debe degradar automáticamente el export a rutas legacy."
);

console.log("Backend montage render mode fails without browser OK.");
