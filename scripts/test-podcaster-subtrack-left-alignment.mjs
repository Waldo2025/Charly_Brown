import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const podcasterSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const timelineUiSource = readFileSync(new URL("../public/podcaster/podcaster-timeline-ui.js", import.meta.url), "utf8");

assert.match(
  podcasterSource,
  /STUDIO_TIMELINE_SUBTRACK_LEFT_NUDGE_PX = -15;/,
  "El nudge horizontal de subtracks debe ser -15px."
);

assert.match(
  timelineUiSource,
  /const leftPx = Math\.max\(0, timelineMsToPx\(startMs, activeSession\) \+ STUDIO_TIMELINE_SUBTRACK_LEFT_NUDGE_PX\);[\s\S]*?podcast-montage-audio-chip/m,
  "El chip de audio debe aplicar el nudge horizontal configurado."
);

assert.match(
  timelineUiSource,
  /const clipLeftPx = timelineMsToPx\(startMs, activeSession\) \+ STUDIO_TIMELINE_SUBTRACK_LEFT_NUDGE_PX;[\s\S]*?podcast-onscreen-text-timeline-clip/m,
  "El clip de texto en tracks debe aplicar el mismo nudge horizontal que el chip de audio Gemini."
);

assert.match(
  timelineUiSource,
  /const clipLeftPx = timelineMsToPx\(Number\(clip\?\.startMs \|\| 0\), activeSession\) \+ STUDIO_TIMELINE_SUBTRACK_LEFT_NUDGE_PX;[\s\S]*?podcast-normal-onscreen-text-track-row/m,
  "El clip de texto en modo normal debe aplicar el nudge horizontal configurado."
);

assert.match(
  timelineUiSource,
  /const startMs = hasGemini[\s\S]*?Number\(segment\?\.startMs \|\| 0\)[\s\S]*?const leftPx = Math\.max\(0, timelineMsToPx\(startMs, activeSession\) \+ STUDIO_TIMELINE_SUBTRACK_LEFT_NUDGE_PX\);/m,
  "El render ligero del texto debe usar startMs del segmento Gemini y el mismo nudge que el audio."
);

console.log("Podcast subtrack left alignment OK.");
