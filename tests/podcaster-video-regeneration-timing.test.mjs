import test from "node:test";
import assert from "node:assert/strict";

import {
  preserveTimelineTrimAfterVideoGeneration,
  resolveGeneratedVideoDurationSec,
  resolveVideoPhysicalDurationMs
} from "../public/podcaster/podcaster-video-generation-timing.js";

test("regeneration always requests an eight-second source", () => {
  assert.equal(resolveGeneratedVideoDurationSec(), 8);
});

test("regeneration preserves a scene crop shorter than eight seconds", () => {
  const clip = {
    rowId: "row-trimmed",
    startMs: 12000,
    sourceDurationMs: 8000,
    trimInMs: 1750,
    trimOutMs: 5250
  };

  assert.deepEqual(preserveTimelineTrimAfterVideoGeneration(clip, 8000, 500), {
    ...clip,
    mediaDurationMs: 8000,
    durationMode: "manual"
  });
});

test("regeneration expands source metadata but keeps the edited scene duration", () => {
  const result = preserveTimelineTrimAfterVideoGeneration({
    rowId: "row-short-source",
    startMs: 3000,
    sourceDurationMs: 4000,
    trimInMs: 500,
    trimOutMs: 3500
  }, 8000, 500);

  assert.equal(result.sourceDurationMs, 8000);
  assert.equal(result.mediaDurationMs, 8000);
  assert.equal(result.durationMode, "manual");
  assert.equal(result.trimInMs, 500);
  assert.equal(result.trimOutMs, 3500);
  assert.equal(result.trimOutMs - result.trimInMs, 3000);
});

test("regeneration records a shorter physical source without changing a manual extension", () => {
  const result = preserveTimelineTrimAfterVideoGeneration({
    rowId: "row-extended",
    sourceDurationMs: 12000,
    mediaDurationMs: 12000,
    durationMode: "manual",
    trimInMs: 1000,
    trimOutMs: 11000
  }, 8000, 500);

  assert.equal(result.sourceDurationMs, 12000);
  assert.equal(result.mediaDurationMs, 8000);
  assert.equal(result.trimInMs, 1000);
  assert.equal(result.trimOutMs, 11000);
  assert.equal(result.durationMode, "manual");
});

test("physical video duration accepts provider aliases in canonical order", () => {
  assert.equal(resolveVideoPhysicalDurationMs({ durationSec: 7.96 }), 7960);
  assert.equal(resolveVideoPhysicalDurationMs({ durationSeconds: 8 }), 8000);
  assert.equal(resolveVideoPhysicalDurationMs({ requestedDurationSeconds: 8 }), 8000);
  assert.equal(resolveVideoPhysicalDurationMs({ mediaDurationMs: 7991, durationSec: 8 }), 7991);
  assert.equal(resolveVideoPhysicalDurationMs({ audioDurationMs: 24000, duration: 24 }), 0);
});
