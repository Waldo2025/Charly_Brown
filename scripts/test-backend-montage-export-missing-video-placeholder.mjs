import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/backend/server.js",
  "utf8"
);

assert.match(
  source,
  /const writeGeneratedSceneBackground = \(\) => \{[\s\S]*generateSolidPpm\(backgroundColor, bgCanvas\.width, bgCanvas\.height\)[\s\S]*return inputVisualPath;/,
  "El backend debe tener un helper local para generar un fondo visual cuando falta el asset de escena."
);

assert.match(
  source,
  /catch \(downloadError\) \{[\s\S]*const canUseMissingVideoPlaceholder = !isImageAsset && missingVisualCode === "storage_not_found";[\s\S]*scene-missing-video-placeholder[\s\S]*isImageAsset = true;[\s\S]*currentSceneSubstage = "scene_missing_video_placeholder";[\s\S]*writeGeneratedSceneBackground\(\);/,
  "Si falta un video de escena por storage_not_found, el export debe generar placeholder y continuar en vez de fallar todo el job."
);

console.log("Backend montage export missing video placeholder OK.");
