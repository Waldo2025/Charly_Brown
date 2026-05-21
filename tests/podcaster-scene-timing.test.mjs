import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAugmentedTimelineRuntimeEntries,
  formatTrackHeadPlayheadTime,
  getSceneEffectiveDurationMs,
  normalizeFrameHoldsByRowId,
  normalizeSpeedRangesByRowId,
  resolveSceneSourceStateAtTimelineMs
} from "../public/podcaster/podcaster-scene-timing.js";

test("getSceneEffectiveDurationMs adds frame holds and rescales speed ranges", () => {
  const durationMs = getSceneEffectiveDurationMs(
    { trimInMs: 0, trimOutMs: 4000 },
    {
      frameHolds: [{ atSourceMs: 1000, holdDurationMs: 1500 }],
      speedRanges: [{ startSourceMs: 2000, endSourceMs: 3000, playbackRate: 2 }]
    },
    4000
  );

  assert.equal(durationMs, 5000);
});

test("resolveSceneSourceStateAtTimelineMs freezes and then resumes source playback", () => {
  const entry = {
    rowId: "row-1",
    startMs: 0,
    clip: { trimInMs: 0, trimOutMs: 4000 },
    sourceDurationMs: 4000,
    frameHolds: [{ atSourceMs: 1000, holdDurationMs: 1500 }],
    speedRanges: []
  };

  const duringHold = resolveSceneSourceStateAtTimelineMs(entry, 2000);
  assert.equal(duringHold.isHoldActive, true);
  assert.equal(duringHold.sourceMs, 1000);

  const afterHold = resolveSceneSourceStateAtTimelineMs(entry, 3200);
  assert.equal(afterHold.isHoldActive, false);
  assert.equal(afterHold.sourceMs, 1700);
});

test("buildAugmentedTimelineRuntimeEntries ripples later scenes and applies transition overlap", () => {
  const session = {
    script: {
      rows: [{ id: "a" }, { id: "b" }]
    },
    podcastVideoConfig: {
      timelineClipsByRowId: {
        a: { rowId: "a", startMs: 0, trimInMs: 0, trimOutMs: 4000, sourceDurationMs: 4000, zIndex: 1 },
        b: { rowId: "b", startMs: 4000, trimInMs: 0, trimOutMs: 2000, sourceDurationMs: 2000, zIndex: 2 }
      },
      frameHoldsByRowId: {
        a: [{ atSourceMs: 1000, holdDurationMs: 1000 }]
      },
      speedRangesByRowId: {},
      transitionsByEdge: {
        "a__b": { type: "crossfade", durationMs: 400 }
      }
    }
  };

  const entries = buildAugmentedTimelineRuntimeEntries(session);
  assert.equal(entries[0].effectiveDurationMs, 5000);
  assert.equal(entries[1].startMs, 4600);
});

test("formatTrackHeadPlayheadTime returns mm:ss.s", () => {
  assert.equal(formatTrackHeadPlayheadTime(65432), "01:05.4");
});

test("normalize hold and speed maps keep only valid ranges", () => {
  assert.deepEqual(
    normalizeFrameHoldsByRowId({ row1: [{ atSourceMs: 100, holdDurationMs: 500 }] }),
    { row1: [{ id: "hold-1", atSourceMs: 100, holdDurationMs: 500 }] }
  );
  assert.deepEqual(
    normalizeSpeedRangesByRowId({ row1: [{ startSourceMs: 100, endSourceMs: 600, playbackRate: 1.5 }] }),
    { row1: [{ id: "speed-1", startSourceMs: 100, endSourceMs: 600, playbackRate: 1.5 }] }
  );
});
