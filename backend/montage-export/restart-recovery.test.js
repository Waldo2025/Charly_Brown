const test = require("node:test");
const assert = require("node:assert/strict");

const {
  canAutoResumeInterruptedMontageExportJob,
  buildAutoResumeInterruptedMontageExportJobPatch
} = require("./restart-recovery.js");

test("canAutoResumeInterruptedMontageExportJob returns true for direct-mode restarted jobs with persisted input", () => {
  const result = canAutoResumeInterruptedMontageExportJob({
    status: "running",
    stage: "apply_onscreen_text",
    request: {
      input: { sessionId: "session-1", entries: [{ rowId: "row-1" }] },
      baseUrl: "https://example.com"
    }
  }, {
    queueAvailable: false
  });

  assert.equal(result, true);
});

test("canAutoResumeInterruptedMontageExportJob returns false when the restart was already retried once", () => {
  const result = canAutoResumeInterruptedMontageExportJob({
    status: "running",
    stage: "render_scene_segments",
    restartResumeCount: 1,
    request: {
      input: { sessionId: "session-1", entries: [{ rowId: "row-1" }] }
    }
  }, {
    queueAvailable: false
  });

  assert.equal(result, false);
});

test("canAutoResumeInterruptedMontageExportJob returns false when inline rasters were redacted from persisted input", () => {
  const result = canAutoResumeInterruptedMontageExportJob({
    status: "running",
    stage: "render_scene_segments",
    request: {
      input: {
        sessionId: "session-1",
        entries: [{ rowId: "row-1" }],
        persistedInlineRastersRedacted: true
      }
    }
  }, {
    queueAvailable: false
  });

  assert.equal(result, false);
});

test("buildAutoResumeInterruptedMontageExportJobPatch keeps the request and marks the job as restarting", () => {
  const patch = buildAutoResumeInterruptedMontageExportJobPatch({
    request: {
      input: { sessionId: "session-1" },
      baseUrl: "https://example.com"
    }
  }, "2026-06-17T05:10:00.000Z");

  assert.equal(patch.status, "running");
  assert.equal(patch.stage, "restart_recovery");
  assert.equal(patch.sceneSubstage, "restart_recovery");
  assert.equal(patch.restartResumeCount, 1);
  assert.equal(patch.request.baseUrl, "https://example.com");
  assert.equal(patch.request.input.sessionId, "session-1");
  assert.equal(patch.lastHeartbeatAt, "2026-06-17T05:10:00.000Z");
});
