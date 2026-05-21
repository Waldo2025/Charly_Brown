import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster.js",
  "utf8"
);

assert.match(
  source,
  /function hasManualGeminiSegmentOffset\(segment = null, fallbackAnchorMs = 0, toleranceMs = STUDIO_TIMELINE_SNAP_MS\)/,
  "La rehidratacion debe centralizar la detección de offset manual Gemini en un helper único."
);

assert.match(
  source,
  /const hasManualStartMs = hasManualGeminiSegmentOffset\(existingSegment, automaticStartMs\);/,
  "La reconciliación debe reutilizar el helper de offset manual antes de recalcular startMs."
);

console.log("Podcaster rehydrate preserves manual Gemini offset OK.");
