import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-timeline-ui.js",
  "utf8"
);

assert.match(
  source,
  /const alignMode = segment\s*\?\s*"segment"\s*:\s*"clip";/,
  "El chip Gemini debe alinearse al segmento cuando exista, sin depender de audioMode."
);

assert.match(
  source,
  /const durationMs = alignMode === "segment"\s*\?\s*resolveGeminiSegmentVisibleDurationMs\(segment\)\s*:\s*resolveMontageAudioChipDurationMs\(timelineClip, adjustedAudioDurationSec\);/,
  "El ancho del chip Gemini debe respetar la duración del segmento cuando existe."
);

assert.match(
  source,
  /if \(alignMode === "segment"\) \{[\s\S]*chip\.style\.left = `\$\{leftPx\}px`;/,
  "El lightweight render debe reposicionar chips Gemini desde startMs del segmento."
);

console.log("Podcaster montage chip respects Gemini segment position OK.");
