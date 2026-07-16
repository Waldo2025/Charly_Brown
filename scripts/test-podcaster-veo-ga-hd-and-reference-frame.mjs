import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const provider = require("../backend/podcaster-video-provider.js");
const backendSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
const frontendSource = readFileSync(new URL("../public/podcaster/podcaster-video-generator.js", import.meta.url), "utf8");

assert.equal(provider.OMNI_VIDEO_MODEL, "gemini-omni-flash-preview");
assert.equal(provider.DEFAULT_VEO_VIDEO_MODEL, "veo-3.1-generate-preview");
assert.deepEqual(provider.resolveVeoConfig({ quality: "final", highQuality: true, durationSeconds: 4 }), {
  aspectRatio: "16:9",
  durationSeconds: 8,
  resolution: "1080p",
  numberOfVideos: 1
});

assert.equal(
  provider.resolveVideoGenerator({ generator: "auto", hasReferenceVideo: true }),
  "veo",
  "Una referencia de video debe enrutar Automático a Veo."
);
assert.equal(
  provider.resolveVideoGenerator({ generator: "auto", hasLastFrame: true }),
  "veo",
  "El control de último fotograma debe enrutar Automático a Veo."
);

assert.match(
  frontendSource,
  /if \(highQuality\) model = PODCASTER_VIDEO_MODEL_VEO_STANDARD;/,
  "HQ con Veo debe forzar Standard."
);
assert.match(
  frontendSource,
  /hasReferenceVideo:[\s\S]*requiresLastFrame:/,
  "El frontend debe declarar las capacidades que requieren Veo."
);
assert.doesNotMatch(frontendSource, /compressionQuality\s*=/);
assert.doesNotMatch(backendSource, /compressionQuality\s*=/);

console.log("Podcaster Veo 3.1 HQ and capability routing OK.");
