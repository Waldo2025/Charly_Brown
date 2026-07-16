import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const provider = require("../backend/podcaster-video-provider.js");
const backendSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
const frontendSource = readFileSync(new URL("../public/podcaster/podcaster-video-generator.js", import.meta.url), "utf8");

assert.equal(
  provider.resolveVideoGenerator({ generator: "auto", hasReferenceImages: true }),
  "omni",
  "Las referencias de imagen generales deben permanecer en Omni."
);
assert.equal(
  provider.resolveVideoGenerator({ generator: "auto", hasReferenceVideo: true }),
  "veo",
  "Una referencia de video sí requiere Veo 3.1."
);

const veoRefConfig = provider.resolveVeoConfig({
  quality: "draft",
  durationSeconds: 4,
  hasReferences: true,
  aspectRatio: "9:16"
});
assert.equal(veoRefConfig.durationSeconds, 8);
assert.equal(veoRefConfig.resolution, "720p");
assert.equal(veoRefConfig.aspectRatio, "9:16");

assert.match(
  frontendSource,
  /hasReferenceVideo:\s*referenceMode === "video" && Boolean\(rowReferenceVideo\)/,
  "El frontend debe informar explícitamente cuándo hay una referencia de video."
);
assert.match(
  frontendSource,
  /referenceImages:[\s\S]*\.slice\(0, DIALOGUE_VIDEO_MAX_REFERENCE_IMAGE_COUNT\)/,
  "La solicitud debe transportar hasta tres referencias de imagen."
);
assert.match(
  frontendSource,
  /maxModelAttempts:\s*1/,
  "Una operación aceptada no debe iniciar un segundo modelo como fallback."
);

assert.match(
  backendSource,
  /resolvedGenerator === "omni"[\s\S]*createOmniVideo\([\s\S]*createVeoVideo\(/,
  "El endpoint debe delegar en adaptadores separados de Omni y Veo."
);
assert.match(
  backendSource,
  /hasReferenceVideo:\s*Boolean\(referenceVideoDataUrl \|\| referenceVideoProviderUri\)/,
  "El backend debe resolver las capacidades desde el request antes de elegir proveedor."
);
assert.match(
  backendSource,
  /validateVeoExtensionSource\(\{[\s\S]*referenceVideoProviderUri[\s\S]*referenceVideoProviderGeneratedAt/,
  "La extensión debe validar procedencia Veo reciente antes de llamar al proveedor."
);
assert.match(
  backendSource,
  /const videoModels = \[requestedModel\];/,
  "El backend debe ejecutar un único modelo y no iniciar fallback después de aceptar la solicitud."
);

console.log("Podcaster image/video reference routing v2 OK.");
