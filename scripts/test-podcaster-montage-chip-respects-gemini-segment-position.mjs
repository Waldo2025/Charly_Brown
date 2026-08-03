import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL("../public/podcaster/podcaster-timeline-ui.js", import.meta.url),
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
  /const resolveGeminiSegmentTimelineStartMs = \(segment = null, rowId = ""\) => \{[\s\S]*return Math\.max\(sceneStartMs, segmentStartMs\);/,
  "Los chips Gemini automáticos no deben iniciar antes de la escena runtime."
);

assert.match(
  source,
  /timelineMsToPx\(resolveGeminiSegmentTimelineStartMs\(segment, rowId\), activeSession\)/,
  "El render de chips Gemini debe usar el inicio protegido contra desfases persistidos."
);

console.log("Podcaster montage chip respects Gemini segment position OK.");
