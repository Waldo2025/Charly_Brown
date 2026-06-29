const test = require("node:test");
const assert = require("node:assert/strict");

const {
  canAutoResumeInterruptedMontageExportJob,
  buildAutoResumeInterruptedMontageExportJobPatch,
  hasPersistedRenderedFrameSource
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

test("canAutoResumeInterruptedMontageExportJob returns true for direct-mode scene render restarts after scene 1", () => {
  const result = canAutoResumeInterruptedMontageExportJob({
    status: "running",
    stage: "render_scene_segments",
    progress: 0.32,
    currentSceneIndex: 2,
    request: {
      input: { sessionId: "session-1", entries: [{ rowId: "row-1" }, { rowId: "row-2" }, { rowId: "row-3" }] }
    }
  }, {
    queueAvailable: false
  });

  assert.equal(result, true);
});

test("canAutoResumeInterruptedMontageExportJob returns true for jobs already marked as worker restarted", () => {
  const result = canAutoResumeInterruptedMontageExportJob({
    status: "error",
    stage: "error",
    progress: 0.32,
    error: {
      code: "montage_export_worker_restarted"
    },
    request: {
      input: { sessionId: "session-1", entries: [{ rowId: "row-1" }, { rowId: "row-2" }] }
    }
  }, {
    queueAvailable: false
  });

  assert.equal(result, true);
});

test("canAutoResumeInterruptedMontageExportJob returns false for other late-stage restarted jobs", () => {
  const result = canAutoResumeInterruptedMontageExportJob({
    status: "running",
    stage: "mix_timeline_audio",
    progress: 0.48,
    currentSceneIndex: 20,
    request: {
      input: { sessionId: "session-1", entries: [{ rowId: "row-1" }] }
    }
  }, {
    queueAvailable: false
  });

  assert.equal(result, false);
});

test("canAutoResumeInterruptedMontageExportJob returns true for concat_timeline when the worker restarted and the job has persisted input", () => {
  const result = canAutoResumeInterruptedMontageExportJob({
    status: "running",
    stage: "concat_timeline",
    progress: 0.48,
    currentSceneIndex: 24,
    request: {
      input: { sessionId: "session-1", entries: [{ rowId: "row-1" }] }
    }
  }, {
    queueAvailable: false
  });

  assert.equal(result, true);
});

test("canAutoResumeInterruptedMontageExportJob returns true for concat_timeline even when the queue is configured", () => {
  const result = canAutoResumeInterruptedMontageExportJob({
    status: "running",
    stage: "concat_timeline",
    progress: 0.48,
    currentSceneIndex: 24,
    request: {
      input: { sessionId: "session-1", entries: [{ rowId: "row-1" }] }
    }
  }, {
    queueAvailable: true
  });

  assert.equal(result, true);
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

test("canAutoResumeInterruptedMontageExportJob allows redacted raster jobs when storage-backed frames remain", () => {
  const input = {
    sessionId: "session-1",
    renderPipeline: "ffmpeg-preview-runtime-v2",
    entries: [{ rowId: "row-1" }],
    persistedInlineRastersRedacted: true,
    onScreenTextRenderedSegments: [{
      rowId: "row-1",
      renderedFrames: [{
        kind: "base",
        storagePath: "podcaster/sessions/session-1/tmp/base.png"
      }]
    }]
  };
  assert.equal(hasPersistedRenderedFrameSource(input), true);
  const result = canAutoResumeInterruptedMontageExportJob({
    status: "running",
    stage: "render_scene_segments",
    request: { input }
  }, {
    queueAvailable: true
  });

  assert.equal(result, true);
});

test("canAutoResumeInterruptedMontageExportJob returns true when the persisted request was compacted but remains replayable", () => {
  const result = canAutoResumeInterruptedMontageExportJob({
    status: "running",
    stage: "render_scene_segments",
    request: {
      input: {
        sessionId: "session-1",
        entries: [{ rowId: "row-1" }],
        persistedRequestCompacted: true
      }
    }
  }, {
    queueAvailable: false
  });

  assert.equal(result, true);
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
