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
  /await hydrateMontageExportPayloadOnScreenTextRasters\(prepared\.payload\);/,
  "El submit del export ya no debe rasterizar texto en pantalla antes de enviar el job."
);

assert.doesNotMatch(
  source,
  /throw new Error\("montage_onscreen_text_raster_failed"\)/,
  "El submit del export no debe abortar por ausencia de rasters karaoke."
);

assert.doesNotMatch(
  source,
  /prepared\.payload\.onScreenTextRenderedSegments = renderedSegments;/,
  "El payload preparado ya no debe promover renderedSegments rasterizados al nivel superior."
);

console.log("Podcaster montage export no longer requires raster payload OK.");
