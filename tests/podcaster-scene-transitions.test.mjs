import test from "node:test";
import assert from "node:assert/strict";

import {
  createPodcasterSceneTransitionApi,
  getTransitionEdgeKey,
  getTransitionForEdge,
  getTransitionOverlapWindow,
  normalizeTransitionsByEdge,
  resolveTransitionPlaybackState
} from "../public/podcaster/podcaster-scene-transition.js";

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

test("shift transition range uses the same adjacent edge regardless of click order", () => {
  const state = {
    activeRowId: "b",
    timelineLastInteractedRowId: "b",
    transitionPickerOpen: false,
    transitionFromRowId: "",
    transitionToRowId: ""
  };
  const session = {
    script: {
      rows: [{ id: "a" }, { id: "b" }, { id: "c" }]
    },
    podcastVideoConfig: {
      transitionsByEdge: {}
    }
  };
  const opened = [];
  const api = createPodcasterSceneTransitionApi({
    els: {
      podcastTransitionPickerGrid: { querySelectorAll: () => [] },
      podcastTransitionPickerEdgeLabel: { textContent: "" },
      podcastTransitionPickerModal: { hidden: true }
    },
    podcastVideoState: state,
    getActiveSession: () => session,
    getSessionRows: () => session.script.rows,
    getTransitionTimelineRowOrder: () => ["a", "b", "c"],
    resolveSceneNumberByRowId: (rowId) => ({ a: "1", b: "2", c: "3" }[rowId] || "?"),
    upsertPodcastVideoConfig: (mutator) => {
      session.podcastVideoConfig = mutator(session.podcastVideoConfig);
    },
    scheduleSessionLocalPersist: () => {},
    persistReorderedTimelinePatchToCloud: () => {},
    persistCompactedTimelineTrackFromRow: () => {},
    renderPodcastVideoTimeline: () => {},
    renderPodcastTransitionTimeline: () => {},
    syncPodcastStudioInspector: () => {},
    selectTimelineSceneRow: (rowId) => {
      opened.push(rowId);
      state.activeRowId = rowId;
      state.timelineLastInteractedRowId = rowId;
    }
  });

  assert.equal(api.selectTimelineTransitionRange("c", { anchorRowId: "b" }), true);
  assert.deepEqual(api.getActiveTransitionSelection(session).edges, [{ fromRowId: "b", toRowId: "c" }]);
  api.setTransitionForActiveEdge("crossfade", 320);
  assert.deepEqual(session.podcastVideoConfig.transitionsByEdge, {
    b__c: { type: "crossfade", durationMs: 320 }
  });

  state.transitionPickerOpen = false;
  state.transitionFromRowId = "";
  state.transitionToRowId = "";
  assert.equal(api.selectTimelineTransitionRange("b", { anchorRowId: "c" }), true);
  assert.deepEqual(api.getActiveTransitionSelection(session).edges, [{ fromRowId: "b", toRowId: "c" }]);
  assert.deepEqual(session.podcastVideoConfig.transitionsByEdge, {
    b__c: { type: "crossfade", durationMs: 320 }
  });
});
