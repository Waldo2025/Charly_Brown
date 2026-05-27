import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const timelineUiSource = readFileSync(new URL("../public/podcaster/podcaster-timeline-ui.js", import.meta.url), "utf8");
test("Gemini montage chips apply left nudge with the correct sign", () => {
  assert.match(
    timelineUiSource,
    /timelineMsToPx\(Number\(segment\?\.startMs \|\| 0\) \|\| 0, activeSession\) \+ STUDIO_TIMELINE_SUBTRACK_LEFT_NUDGE_PX/
  );
  assert.match(
    timelineUiSource,
    /timelineMsToPx\(startMs, activeSession\) \+ STUDIO_TIMELINE_SUBTRACK_LEFT_NUDGE_PX/
  );
});
