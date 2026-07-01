import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-montage-export.js",
  "utf8"
);

assert.match(
  source,
  /function stripMontageExportSubmissionPayload\(payload = \{\}\)/,
  "El payload final del export debe tener una rutina de limpieza explícita."
);

assert.doesNotMatch(
  source,
  /prepared\.payload\.onScreenTextRenderedSegments = \[\];/,
  "El submit del export no debe vaciar onScreenTextRenderedSegments antes del POST."
);

assert.match(
  source,
  /const renderedSegments = Array\.isArray\(prepared\.payload\.onScreenTextRenderedSegments\)[\s\S]*prepared\.payload\.onScreenTextRenderedSegments = renderedSegments;/,
  "El submit del export debe conservar los overlays rasterizados ya preparados."
);

assert.match(
  source,
  /if \(!renderedSegments\.length && Array\.isArray\(prepared\.payload\.onScreenTextTimeline\?\.renderedSegments\)\)[\s\S]*prepared\.payload\.onScreenTextRenderedSegments = prepared\.payload\.onScreenTextTimeline\.renderedSegments\.filter\(Boolean\);/,
  "El submit del export debe promover renderedSegments del timeline al nivel superior cuando falten en el payload."
);

console.log("Podcaster montage export rendered-overlay payload contract OK.");
