import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const generator = readFileSync(new URL("../public/podcaster/podcaster-video-generator.js", import.meta.url), "utf8");
const stability = readFileSync(new URL("../backend/podcaster-stability.js", import.meta.url), "utf8");
const provider = readFileSync(new URL("../backend/podcaster-video-provider.js", import.meta.url), "utf8");
const backend = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

assert.match(generator, /const DIALOGUE_VIDEO_MAX_REFERENCE_IMAGE_COUNT = 3;/);
assert.match(stability, /const DIALOGUE_VIDEO_MAX_REFERENCE_IMAGE_COUNT = 3;/);
assert.match(
  provider,
  /config\.referenceImages = images\.slice\(0, 3\)\.map\(\(image\) => \(\{ image, referenceType: "ASSET" \}\)\);/,
  "El adaptador oficial de Veo debe limitar referenceImages a tres justo antes de enviar."
);
assert.match(
  provider,
  /veo_lite_reference_images_unsupported/,
  "Veo Lite debe rechazar referencias en lugar de ignorarlas."
);
assert.match(
  backend,
  /let firstFrame = extendVideo[\s\S]*sceneReferenceVideoFrameBase64[\s\S]*continuityFrameBase64/,
  "La continuidad/último frame debe viajar como control de frame y no consumir referencias arbitrariamente."
);
assert.match(
  backend,
  /images:\s*\(firstFrame \|\| extendVideo \|\| explicitLastFrame\) \? \[\] : providerImages,[\s\S]*video:\s*extendVideo \? sceneReferenceVideoInput : null,[\s\S]*firstFrame,/,
  "Cuando hay primer frame, el backend no debe duplicarlo también como referenceImages."
);

console.log("Podcaster Veo 3.1 official reference image limit OK.");
