import test from "node:test";
import assert from "node:assert/strict";

global.window = global.window || {};

const timelineModel = await import("../public/podcaster/podcaster-timeline-model.js");

const { compactTimelineTrackClipsFromRow } = timelineModel;

test("compactTimelineTrackClipsFromRow closes gaps after a trim without overlaps", () => {
  const session = {
    script: {
      rows: [{ id: "a" }, { id: "b" }, { id: "c" }]
    },
    podcastVideoConfig: {
      transitionsByEdge: {}
    }
  };
  const clipMap = {
    a: { rowId: "a", trackId: "track-1", startMs: 0, trimInMs: 0, trimOutMs: 2000, sourceDurationMs: 2000, zIndex: 1 },
    b: { rowId: "b", trackId: "track-1", startMs: 4000, trimInMs: 0, trimOutMs: 2000, sourceDurationMs: 2000, zIndex: 2 },
    c: { rowId: "c", trackId: "track-1", startMs: 7000, trimInMs: 0, trimOutMs: 1500, sourceDurationMs: 1500, zIndex: 3 }
  };

  const compacted = compactTimelineTrackClipsFromRow(session, clipMap, "a");

  assert.equal(compacted.a.startMs, 0);
  assert.equal(compacted.b.startMs, 2000);
  assert.equal(compacted.c.startMs, 4000);
});

test("compactTimelineTrackClipsFromRow preserves transition overlap only on the transitioned edge", () => {
  const session = {
    script: {
      rows: [{ id: "a" }, { id: "b" }, { id: "c" }]
    },
    podcastVideoConfig: {
      transitionsByEdge: {
        a__b: { type: "crossfade", durationMs: 300 }
      }
    }
  };
  const clipMap = {
    a: { rowId: "a", trackId: "track-1", startMs: 0, trimInMs: 0, trimOutMs: 2000, sourceDurationMs: 2000, zIndex: 1 },
    b: { rowId: "b", trackId: "track-1", startMs: 4000, trimInMs: 0, trimOutMs: 2000, sourceDurationMs: 2000, zIndex: 2 },
    c: { rowId: "c", trackId: "track-1", startMs: 7000, trimInMs: 0, trimOutMs: 1500, sourceDurationMs: 1500, zIndex: 3 }
  };

  const compacted = compactTimelineTrackClipsFromRow(session, clipMap, "a");

  assert.equal(compacted.b.startMs, 1700);
  assert.equal(compacted.c.startMs, 3700);
});
