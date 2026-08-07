import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const timelineUiSource = readFileSync(
  new URL("../public/podcaster/podcaster-timeline-ui.js", import.meta.url),
  "utf8"
);
const podcasterSource = readFileSync(
  new URL("../public/podcaster/podcaster.js", import.meta.url),
  "utf8"
);

test("lane offset cache is invalidated when the canvas or label width changes", () => {
  assert.match(timelineUiSource, /cachedLaneOffsetCanvas === canvas/);
  assert.match(timelineUiSource, /cachedLaneTrackLabelWidth === trackLabelWidth/);
  assert.match(timelineUiSource, /cachedLaneOffsetCanvas = canvas;/);
  assert.match(timelineUiSource, /cachedLaneTrackLabelWidth = trackLabelWidth;/);
});

test("persisted track label width immediately resynchronizes the playhead", () => {
  const resizeBlock = podcasterSource.slice(
    podcasterSource.indexOf("function setPodcastTrackLabelWidth"),
    podcasterSource.indexOf("function ensurePodcastTrackLabelColumnResizeHandle")
  );
  assert.match(resizeBlock, /syncPodcastTimelineLaneOffsetFromDom\(getActiveSession\(\)\);/);
  assert.match(resizeBlock, /syncPodcastTimelinePlayhead\(getActiveSession\(\), \{/);
  assert.match(resizeBlock, /currentMs: Math\.max\(0, Number\(podcastVideoState\.montageCursorMs \|\| 0\)\)/);
});
