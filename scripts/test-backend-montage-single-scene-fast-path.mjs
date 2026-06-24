import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/backend/server.js",
  "utf8"
);

assert.match(
  source,
  /const shouldInlineSingleSceneBrandOverlay = Boolean\([\s\S]*input\.entries\.length === 1[\s\S]*fs\.existsSync\(resolvedInlineBrandOverlayPath\)/,
  "El backend debe detectar el caso de una sola escena con logo para inlinear la marca en el render de escena."
);

assert.match(
  source,
  /if \(shouldInlineSingleSceneBrandOverlay\) \{[\s\S]*args\.push\("-loop", "1", "-i", resolvedInlineBrandOverlayPath\);[\s\S]*buildMontageBrandOverlayFilter\(input\.brandOverlay,/,
  "La escena única debe poder componer el logo durante scene_ffmpeg_render para evitar una pasada final exclusiva."
);

assert.match(
  source,
  /if \(!overlapPlan\.hasOverlap && !overlapPlan\.hasGaps && intermediatePaths\.length === 1\) \{[\s\S]*concatOutPath = intermediatePaths\[0\];/,
  "Una exportación de una sola escena sin huecos ni overlaps debe saltar el concat FFmpeg intermedio."
);

assert.match(
  source,
  /emitStage\(visualEncodeStage, 0\.84, visualEncodeMessage, \{[\s\S]*sceneSubstage: ""/,
  "Durante encode_delivery el backend debe limpiar sceneSubstage para no conservar scene_ffmpeg_render en Firestore."
);

console.log("Backend montage single scene fast path OK.");
