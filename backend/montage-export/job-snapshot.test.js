const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isRecentMontageExportJobSnapshot,
  recoverMontageExportJobSnapshot,
  getMontageExportJobSnapshotAgeMs
} = require("./job-snapshot.js");

test("recent running montage export snapshots can be recovered as degraded jobs", () => {
  const nowMs = Date.parse("2026-04-27T15:30:00.000Z");
  const snapshot = recoverMontageExportJobSnapshot({
    jobId: "job-1",
    status: "running",
    stage: "render_scene_segments",
    hint: "Renderizando escena 3.",
    heartbeatAt: "2026-04-27T15:29:30.000Z",
    updatedAt: "2026-04-27T15:29:20.000Z"
  }, {
    nowMs,
    graceMs: 60 * 1000
  });

  assert.equal(snapshot.jobId, "job-1");
  assert.equal(snapshot.status, "running");
  assert.equal(snapshot.degraded, true);
  assert.equal(snapshot.stage, "render_scene_segments");
  assert.equal(snapshot.hint, "Renderizando escena 3.");
});

test("stale completed montage export snapshots are not recovered", () => {
  const nowMs = Date.parse("2026-04-27T15:30:00.000Z");
  const snapshot = recoverMontageExportJobSnapshot({
    jobId: "job-2",
    status: "ready",
    stage: "ready",
    heartbeatAt: "2026-04-27T13:00:00.000Z",
    updatedAt: "2026-04-27T13:00:00.000Z"
  }, {
    nowMs,
    graceMs: 60 * 1000
  });

  assert.equal(snapshot.jobId, "job-2");
  assert.equal(snapshot.status, "ready");
  assert.equal(snapshot.degraded, undefined);
});

test("recent montage export snapshots report small age", () => {
  const nowMs = Date.parse("2026-04-27T15:30:00.000Z");
  const ageMs = getMontageExportJobSnapshotAgeMs({
    heartbeatAt: "2026-04-27T15:29:40.000Z"
  }, nowMs);

  assert.equal(ageMs, 20000);
  assert.equal(isRecentMontageExportJobSnapshot({
    status: "running",
    heartbeatAt: "2026-04-27T15:29:40.000Z"
  }, {
    nowMs,
    graceMs: 60 * 1000
  }), true);
});

test("cancelled montage export snapshots are terminal", () => {
  const snapshot = recoverMontageExportJobSnapshot({
    jobId: "job-3",
    status: "cancelled",
    stage: "cancelled",
    heartbeatAt: "2026-04-27T15:29:40.000Z",
    updatedAt: "2026-04-27T15:29:40.000Z"
  }, {
    nowMs: Date.parse("2026-04-27T15:30:00.000Z"),
    graceMs: 60 * 1000
  });

  assert.equal(snapshot.status, "cancelled");
  assert.equal(snapshot.degraded, undefined);
});
