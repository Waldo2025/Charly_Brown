import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const podcasterSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const moduleUrl = new URL("../public/podcaster/podcaster-timeline-clip-duration.js", import.meta.url);
const moduleSource = existsSync(moduleUrl) ? readFileSync(moduleUrl, "utf8") : "";

test("timeline clip duration module exposes the modal API", () => {
  assert.match(moduleSource, /export function createPodcasterTimelineClipDurationApi\(deps = \{\}\)/);
  assert.match(
    moduleSource,
    /return \{[\s\S]*setOpen[\s\S]*syncInputs[\s\S]*applyFromModal[\s\S]*persistVolumeOverrides[\s\S]*schedulePersistVolumeOverrides[\s\S]*open[\s\S]*resetFromModal[\s\S]*getState[\s\S]*\};/m
  );
});

test("podcaster.js imports and instantiates timeline clip duration API", () => {
  assert.match(
    podcasterSource,
    /import \{ createPodcasterTimelineClipDurationApi \} from "\.\/podcaster-timeline-clip-duration\.js";/
  );
  assert.match(podcasterSource, /const podcasterTimelineClipDurationApi = createPodcasterTimelineClipDurationApi\(/);
});

test("podcaster.js no longer owns timeline clip duration modal functions", () => {
  assert.doesNotMatch(podcasterSource, /function setTimelineClipDurationModalOpen\(/);
  assert.doesNotMatch(podcasterSource, /function syncTimelineClipDurationModalInputs\(/);
  assert.doesNotMatch(podcasterSource, /function applyTimelineClipDurationFromModal\(/);
  assert.doesNotMatch(podcasterSource, /function persistTimelineClipVolumeOverridesFromModal\(/);
  assert.doesNotMatch(podcasterSource, /function schedulePersistTimelineClipVolumeOverrides\(/);
  assert.doesNotMatch(podcasterSource, /function openTimelineClipDurationConfig\(/);
  assert.doesNotMatch(podcasterSource, /function resetTimelineClipDurationFromModal\(/);
  assert.doesNotMatch(podcasterSource, /function formatTimelineClipDurationSeconds\(/);
  assert.doesNotMatch(podcasterSource, /function getTimelineClipRestoreTarget\(/);
});
