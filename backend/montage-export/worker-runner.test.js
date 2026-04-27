const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createProcessMontageExportJob
} = require("./worker-runner.js");

test("worker runner writes ready result after pipeline success", async () => {
  const updates = [];
  const processor = createProcessMontageExportJob({
    jobStore: {
      async updateJob(jobId, patch) {
        updates.push({ jobId, patch });
        return patch;
      }
    },
    executeMontageExportPipeline: async (_input, { onStage }) => {
      onStage({
        stage: "render_scene_segments",
        progress: 0.5,
        hint: "Renderizando",
        currentSceneIndex: 2,
        totalScenes: 4
      });
      return {
        export: {
          storagePath: "podcaster/exports/u/s/job-1.mp4",
          downloadUrl: "https://example.com/video.mp4"
        },
        downloadUrl: "https://example.com/video.mp4"
      };
    },
    buildMontageSceneFailure: (error) => ({ error: error.message })
  });

  await processor({
    data: {
      jobId: "job-1",
      ownerId: "user-1",
      baseUrl: "https://example.com",
      input: { sessionId: "session-1" }
    }
  });

  assert.equal(updates[0].jobId, "job-1");
  assert.equal(updates[0].patch.status, "running");
  assert.equal(updates.at(-1).patch.status, "ready");
  assert.equal(updates.at(-1).patch.result.storagePath, "podcaster/exports/u/s/job-1.mp4");
});

test("worker runner writes durable error details after pipeline failure", async () => {
  const updates = [];
  const processor = createProcessMontageExportJob({
    jobStore: {
      async updateJob(jobId, patch) {
        updates.push({ jobId, patch });
        return patch;
      }
    },
    executeMontageExportPipeline: async () => {
      const error = new Error("scene_download_timeout");
      error.code = "scene_download_timeout";
      error.detail = { failedSceneIndex: 3, failedSubstage: "scene_download_video" };
      throw error;
    },
    buildMontageSceneFailure: (error) => ({
      error: error.message,
      detail: error.detail
    })
  });

  await assert.rejects(
    () => processor({
      data: {
        jobId: "job-2",
        ownerId: "user-1",
        baseUrl: "https://example.com",
        input: { sessionId: "session-1" }
      }
    }),
    /scene_download_timeout/
  );

  assert.equal(updates.at(-1).patch.status, "error");
  assert.equal(updates.at(-1).patch.failedSceneIndex, 3);
  assert.equal(updates.at(-1).patch.failedSubstage, "scene_download_video");
});
