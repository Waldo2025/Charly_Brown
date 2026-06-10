import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster.js",
  "utf8"
);

// Verify that expectedSegmentDuration falls back to existingDurationMs instead of collapsing to clipPlayableMs
assert.match(
  source,
  /expectedSegmentDuration\s*=\s*audioSuggestedDurationMs\s*>\s*0\s*\?\s*audioSuggestedDurationMs\s*:\s*\(\s*preserveStartMs\s*&&\s*existingSegment\s*&&\s*existingDurationMs\s*>\s*0\s*\?\s*existingDurationMs\s*:\s*clipPlayableMs\s*\)/,
  "El cálculo de expectedSegmentDuration debe usar existingDurationMs como fallback para evitar que el offset colapse a 0 al inicio."
);

console.log("Podcaster Gemini layout stability test OK.");
