const test = require("node:test");
const assert = require("node:assert/strict");

const {
  sanitizeMontageExportJobPublicPayload
} = require("./public-payload.js");

test("sanitizeMontageExportJobPublicPayload keeps durable job status fields", () => {
  const payload = sanitizeMontageExportJobPublicPayload({
    jobId: "job-1",
    status: "running",
    stage: "render_scene_segments",
    sceneSubstage: "scene_download_video",
    progress: 0.25,
    hint: "Descargando asset de escena 3.",
    currentSceneIndex: 3,
    totalScenes: 10,
    heartbeatAt: "2026-04-27T15:10:00.000Z",
    result: null
  });

  assert.equal(payload.ok, true);
  assert.equal(payload.jobId, "job-1");
  assert.equal(payload.status, "running");
  assert.equal(payload.stage, "render_scene_segments");
  assert.equal(payload.sceneSubstage, "scene_download_video");
  assert.equal(payload.currentSceneIndex, 3);
  assert.equal(payload.totalScenes, 10);
  assert.equal(payload.heartbeatAt, "2026-04-27T15:10:00.000Z");
});

test("sanitizeMontageExportJobPublicPayload lets a downloadable result win over stale error metadata", () => {
  const payload = sanitizeMontageExportJobPublicPayload({
    jobId: "job-2",
    status: "error",
    stage: "error",
    degraded: true,
    error: { code: "scene_download_timeout" },
    result: {
      storagePath: "podcaster/exports/u1/s1/job-2/video.mp4",
      downloadUrl: "https://example.com/video.mp4"
    }
  });

  assert.equal(payload.status, "ready");
  assert.equal(payload.stage, "ready");
  assert.equal(payload.error, undefined);
  assert.equal(payload.result.storagePath, "podcaster/exports/u1/s1/job-2/video.mp4");
  assert.equal(payload.downloadUrl, "https://example.com/video.mp4");
  assert.equal(payload.degraded, true);
});

test("sanitizeMontageExportJobPublicPayload treats completed exports as ready even after restart error metadata", () => {
  const payload = sanitizeMontageExportJobPublicPayload({
    jobId: "job-3",
    status: "error",
    stage: "error",
    progress: 0.98,
    hint: "El worker de export se reinició durante el render.",
    error: { code: "montage_export_worker_restarted" },
    export: {
      storagePath: "podcaster/exports/u1/s1/latest.mp4",
      downloadUrl: "https://example.com/latest.mp4",
      sizeBytes: 7551195
    }
  });

  assert.equal(payload.status, "ready");
  assert.equal(payload.stage, "ready");
  assert.equal(payload.progress, 1);
  assert.equal(payload.downloadUrl, "https://example.com/latest.mp4");
  assert.equal(payload.error, undefined);
  assert.match(payload.hint, /Export listo/);
});
