const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createProcessMontageExportJob
} = require("./worker-runner.js");

test("worker runner writes ready result after pipeline success", async () => {
  const updates = [];
  const processor = createProcessMontageExportJob({
    jobStore: {
      async getJob() {
        return { status: "running", progress: 0.5 };
      },
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

test("worker runner loads persisted request input when BullMQ payload is thin", async () => {
  const updates = [];
  let receivedInput = null;
  let receivedOptions = null;
  const processor = createProcessMontageExportJob({
    jobStore: {
      async getJob() {
        return {
          status: "queued",
          progress: 0,
          sessionId: "session-persisted",
          ownerId: "user-persisted",
          request: {
            baseUrl: "https://persisted.example.com",
            input: {
              sessionId: "session-persisted",
              entries: [{ id: "row-1" }]
            }
          }
        };
      },
      async updateJob(jobId, patch) {
        updates.push({ jobId, patch });
        return patch;
      }
    },
    executeMontageExportPipeline: async (input, options) => {
      receivedInput = input;
      receivedOptions = options;
      return {
        export: {
          storagePath: "podcaster/exports/u/s/job-thin.mp4",
          downloadUrl: "https://example.com/video.mp4"
        },
        downloadUrl: "https://example.com/video.mp4"
      };
    },
    buildMontageSceneFailure: (error) => ({ error: error.message })
  });

  await processor({
    data: {
      jobId: "job-thin",
      sessionId: "session-thin",
      ownerId: "user-thin"
    }
  });

  assert.deepEqual(receivedInput.entries, [{ id: "row-1" }]);
  assert.equal(receivedOptions.uid, "user-thin");
  assert.equal(receivedOptions.baseUrl, "https://persisted.example.com");
  assert.equal(updates.at(-1).patch.status, "ready");
});

test("worker runner does not publish ready before the durable result exists", async () => {
  const updates = [];
  const processor = createProcessMontageExportJob({
    jobStore: {
      async getJob() {
        return { status: "running", progress: 0.98 };
      },
      async updateJob(jobId, patch) {
        updates.push({ jobId, patch });
        return patch;
      }
    },
    executeMontageExportPipeline: async (_input, { onStage }) => {
      await onStage({
        stage: "ready",
        progress: 1,
        hint: "Exportación lista."
      });
      return {
        export: {
          storagePath: "podcaster/exports/u/s/job-early-ready.mp4",
          downloadUrl: "https://example.com/video.mp4",
          downloadToken: "token-1"
        },
        downloadUrl: "https://example.com/video.mp4"
      };
    },
    buildMontageSceneFailure: (error) => ({ error: error.message })
  });

  await processor({
    data: {
      jobId: "job-early-ready",
      ownerId: "user-1",
      baseUrl: "https://example.com",
      input: { sessionId: "session-1" }
    }
  });

  const readyUpdates = updates.filter(({ patch }) => patch.status === "ready");
  assert.equal(readyUpdates.length, 1);
  assert.equal(readyUpdates[0].patch.result.storagePath, "podcaster/exports/u/s/job-early-ready.mp4");
  assert.equal(readyUpdates[0].patch.downloadUrl, "https://example.com/video.mp4");
});

test("worker runner writes durable error details after pipeline failure", async () => {
  const updates = [];
  const processor = createProcessMontageExportJob({
    jobStore: {
      async getJob() {
        return { status: "running", progress: 0.5 };
      },
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

test("worker runner clears stale sceneSubstage outside render_scene_segments", async () => {
  const updates = [];
  const processor = createProcessMontageExportJob({
    jobStore: {
      async getJob() {
        return { status: "running", progress: 0.5, sceneSubstage: "scene_ffmpeg_render" };
      },
      async updateJob(jobId, patch) {
        updates.push({ jobId, patch });
        return patch;
      }
    },
    executeMontageExportPipeline: async (_input, { onStage }) => {
      await onStage({
        stage: "concat_timeline",
        progress: 0.48,
        hint: "Uniendo escenas."
      });
      return {
        export: {
          storagePath: "podcaster/exports/u/s/job-concat.mp4",
          downloadUrl: "https://example.com/video.mp4"
        },
        downloadUrl: "https://example.com/video.mp4"
      };
    },
    buildMontageSceneFailure: (error) => ({ error: error.message })
  });

  await processor({
    data: {
      jobId: "job-concat",
      ownerId: "user-1",
      baseUrl: "https://example.com",
      input: { sessionId: "session-1" }
    }
  });

  const concatUpdate = updates.find(({ patch }) => patch.stage === "concat_timeline");
  assert.ok(concatUpdate);
  assert.equal(concatUpdate.patch.sceneSubstage, "");
});

test("worker runner aborts when the persisted job is cancelled while rendering", async () => {
  const updates = [];
  let status = "running";
  let observedAbort = false;
  const processor = createProcessMontageExportJob({
    jobStore: {
      async getJob() { return { status, progress: 0.5 }; },
      async updateJob(jobId, patch) {
        updates.push({ jobId, patch });
        if (patch.status) status = patch.status;
        return { status, ...patch };
      }
    },
    cancelPollIntervalMs: 10,
    executeMontageExportPipeline: async (_input, { shouldAbort }) => {
      await new Promise((_resolve, reject) => {
        const timer = setInterval(() => {
          if (!shouldAbort()) return;
          observedAbort = true;
          clearInterval(timer);
          const error = new Error("montage_export_cancelled");
          error.code = "montage_export_cancelled";
          reject(error);
        }, 5);
      });
    },
    buildMontageSceneFailure: (error) => ({ error: error.message })
  });

  const pending = processor({ data: { jobId: "job-cancelled", ownerId: "user-1", baseUrl: "https://example.com", input: { sessionId: "session-1" } } });
  await new Promise((resolve) => setTimeout(resolve, 20));
  status = "cancelled";
  await pending;

  assert.equal(observedAbort, true);
  assert.equal(updates.at(-1).patch.status, "cancelled");
  assert.equal(updates.some(({ patch }) => patch.status === "ready"), false);
});
