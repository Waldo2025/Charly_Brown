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
  /next\.onScreenTextRenderedSegments = \[\];/,
  "El submit del export no debe vaciar los rasters de texto en pantalla."
);

assert.doesNotMatch(
  source,
  /renderedSegments:\s*\[\]/,
  "El submit del export no debe vaciar los renderedSegments del timeline."
);

assert.match(
  source,
  /prepared\.payload\.onScreenTextRenderedSegments = renderedSegments;/,
  "El payload preparado debe seguir promoviendo los rasters compartidos al nivel superior."
);

console.log("Podcaster montage export preserves on-screen raster payload OK.");
