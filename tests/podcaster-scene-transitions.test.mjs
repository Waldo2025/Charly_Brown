import test from "node:test";
import assert from "node:assert/strict";

import {
  getTransitionEdgeKey,
  getTransitionForEdge,
  getTransitionOverlapWindow,
  normalizeTransitionsByEdge,
  resolveTransitionPlaybackState
} from "../public/podcaster/podcaster-scene-transitions.js";

test("normalizeTransitionsByEdge keeps valid transitions and clamps duration", () => {
  const normalized = normalizeTransitionsByEdge({
    "a__b": { type: "crossfade", durationMs: 300 },
    "b__c": { type: "unknown", durationMs: 9000 }
  });

  assert.deepEqual(normalized, {
    "a__b": { type: "crossfade", durationMs: 300 },
    "b__c": { type: "cut", durationMs: 1200 }
  });
});

test("getTransitionForEdge falls back to cut", () => {
  assert.deepEqual(
    getTransitionForEdge({ transitionsByEdge: {} }, "rowA", "rowB"),
    { type: "cut", durationMs: 0 }
  );
});

test("getTransitionOverlapWindow returns the overlap interval", () => {
  const window = getTransitionOverlapWindow(
    { rowId: "a", startMs: 0, endMs: 4000 },
    { rowId: "b", startMs: 3600, endMs: 7000 },
    { type: "crossfade", durationMs: 400 }
  );

  assert.deepEqual(window, {
    startMs: 3600,
    endMs: 4000,
    durationMs: 400
  });
});

test("resolveTransitionPlaybackState marks both scenes active during overlap", () => {
  const state = resolveTransitionPlaybackState(
    3800,
    { rowId: "a", startMs: 0, endMs: 4000 },
    { rowId: "b", startMs: 3600, endMs: 7000 },
    { type: "crossfade", durationMs: 400 }
  );

  assert.equal(state.isActive, true);
  assert.equal(state.phase, "both");
  assert.equal(state.fromProgress, 0.5);
  assert.equal(state.toProgress, 0.5);
});

test("getTransitionEdgeKey builds stable keys", () => {
  assert.equal(getTransitionEdgeKey(" a ", " b "), "a__b");
});
