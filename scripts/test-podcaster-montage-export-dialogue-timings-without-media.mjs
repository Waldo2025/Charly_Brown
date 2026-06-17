import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/backend/server.js",
  "utf8"
);

assert.match(
  source,
  /const hasTimingMetadata = Array\.isArray\(clip\?\.wordTimings\)[\s\S]*?clip\?\.durationSec/,
  "El normalizador debe detectar clips con timings aunque no traigan media."
);

assert.match(
  source,
  /if \(!storagePath && !downloadUrl && !hasTimingMetadata\) return;/,
  "El backend debe conservar metadata de karaoke aunque el audio viva en audioTimeline."
);

console.log("ok - montage export preserves dialogue timings without media refs");
