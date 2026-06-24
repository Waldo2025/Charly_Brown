import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/backend/server.js",
  "utf8"
);

assert.match(
  source,
  /const renderModeDecision = resolveRuntimeMontageRenderMode\(normalizedInput\.renderMode \|\| "browser"\);/,
  "El endpoint de export debe resolver el modo efectivo según la disponibilidad real del browser renderer."
);

assert.match(
  source,
  /const input = renderModeDecision\.downgraded[\s\S]*renderMode: renderModeDecision\.renderMode/,
  "Cuando Chromium no exista, el backend debe degradar el request a ffmpeg-legacy antes de persistir o encolar el job."
);

assert.match(
  source,
  /console\.warn\("\[backend\]\[montage-export\]\[render-mode-fallback\]"/,
  "El backend debe dejar evidencia explícita cuando fuerza el fallback de browser a ffmpeg-legacy."
);

console.log("Backend montage render mode runtime fallback OK.");
