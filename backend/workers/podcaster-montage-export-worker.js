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

console.info("[worker][montage-export] starting", {
  serviceRole: String(process.env.BACKEND_SERVICE_ROLE || process.env.CHARLY_BACKEND_ROLE || "").trim() || null,
  renderService: String(process.env.RENDER_SERVICE_NAME || "").trim() || null,
  concurrency: workerConcurrency,
  hasRedisConnection: Boolean(
    String(
      process.env.RENDER_KEY_VALUE_CONNECTION_STRING
      || process.env.REDIS_URL
      || process.env.KV_URL
      || ""
    ).trim()
  )
});

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

worker.on("active", (job) => {
  console.info("[worker][montage-export] active", {
    jobId: String(job?.id || job?.data?.jobId || "").trim(),
    sessionId: String(job?.data?.sessionId || "").trim(),
    ownerId: String(job?.data?.ownerId || "").trim()
  });
});

worker.on("completed", (job) => {
  console.info("[worker][montage-export] completed", {
    jobId: String(job?.id || job?.data?.jobId || "").trim()
  });
});

worker.on("stalled", (jobId) => {
  console.warn("[worker][montage-export] stalled", {
    jobId: String(jobId || "").trim()
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
