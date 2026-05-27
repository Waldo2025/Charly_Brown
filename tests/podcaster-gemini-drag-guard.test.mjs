import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const interactionSource = readFileSync(new URL("../public/podcaster/podcaster-timeline-interaction.js", import.meta.url), "utf8");
const clipDurationSource = readFileSync(new URL("../public/podcaster/podcaster-timeline-clip-duration.js", import.meta.url), "utf8");

test("scene drag handle ignores Gemini and audio chips", () => {
  const guardedDragClip = /const dragClip = event\.target\.closest\("\[data-action='timeline-drag-clip'\]\[data-row-id\]"\);[\s\S]*?!event\.target\.closest\("\.podcast-gemini-audio-chip"\)[\s\S]*?!event\.target\.closest\("\.podcast-montage-audio-chip"\)[\s\S]*?!event\.target\.closest\("\.podcast-audio-timeline-chip"\)/m;
  assert.match(interactionSource, guardedDragClip);
});

test("scene duration changes compact following clips on the same track", () => {
  assert.match(clipDurationSource, /if \(durationChanged\) \{[\s\S]*?persistCompactedTimelineTrackFromRow\(rowId, \{ render: false \}\);/m);
  assert.match(clipDurationSource, /setGenerationStatus\(`Escena restablecida a \$\{restoredSec\}s`, "is-live"\);[\s\S]*?persistCompactedTimelineTrackFromRow\(rowId, \{ render: false \}\);/m);
});

test("gemini segment drag updates only gemini chip preview instead of rerendering scene clips", () => {
  assert.match(interactionSource, /if \(drag\.mode === "gemini-segment-move"\) \{[\s\S]*?syncTimelineGeminiSegmentDragPreview\(getActiveSession\(\)\);/m);
});
