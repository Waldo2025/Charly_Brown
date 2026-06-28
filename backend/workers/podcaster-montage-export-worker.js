const {
  montageExportJobStore,
  executeMontageExportPipeline,
  buildMontageSceneFailure,
  getBackendPublicBaseUrl
} = require("../server.js");
const {
  createBullMqWorker
} = require("../montage-export/queue-bullmq.js");
const {
  createProcessMontageExportJob
} = require("../montage-export/worker-runner.js");

const workerConcurrency = Math.max(
  1,
  Number(process.env.MONTAGE_EXPORT_WORKER_CONCURRENCY || process.env.MONTAGE_EXPORT_MAX_CONCURRENT || 1) || 1
);

const processor = createProcessMontageExportJob({
  jobStore: montageExportJobStore,
  executeMontageExportPipeline,
  buildMontageSceneFailure
});

const worker = createBullMqWorker(async (job) => {
  if (!job?.data?.baseUrl) {
    job.data.baseUrl = getBackendPublicBaseUrl();
  }
  return processor(job);
}, {
  concurrency: workerConcurrency
});

worker.on("ready", () => {
  console.info("[worker][montage-export] ready", {
    concurrency: workerConcurrency
  });
});

worker.on("failed", (job, error) => {
  console.error("[worker][montage-export] failed", {
    jobId: String(job?.id || job?.data?.jobId || "").trim(),
    message: String(error?.message || error)
  });
});

worker.on("error", (error) => {
  console.error("[worker][montage-export] worker error", {
    message: String(error?.message || error)
  });
});
