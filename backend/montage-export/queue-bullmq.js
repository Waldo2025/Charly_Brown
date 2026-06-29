function resolveRedisConnectionUrl() {
  const direct = String(
    process.env.RENDER_KEY_VALUE_CONNECTION_STRING
    || process.env.REDIS_URL
    || process.env.KV_URL
    || ""
  ).trim();
  return direct;
}

function createMontageExportQueue({
  queue,
  queueName = "podcaster-montage-export"
} = {}) {
  if (!queue || typeof queue.add !== "function") {
    throw new Error("bullmq_queue_required");
  }

  return {
    queueName,
    async enqueueExportJob(job = {}) {
      const payload = {
        jobId: String(job.jobId || "").trim(),
        sessionId: String(job.sessionId || "").trim(),
        ownerId: String(job.ownerId || "").trim(),
        baseUrl: String(job.baseUrl || "").trim()
      };
      return queue.add("montage_export", payload, {
        jobId: payload.jobId,
        removeOnComplete: true,
        removeOnFail: false
      });
    },
    async getDiagnostics() {
      const diagnostics = {
        queueName,
        workerCount: null,
        workers: [],
        jobCounts: null
      };
      if (typeof queue.getWorkers === "function") {
        const workers = await queue.getWorkers();
        diagnostics.workers = Array.isArray(workers)
          ? workers.map((worker) => ({
            name: String(worker?.name || worker?.id || "").trim() || null,
            addr: String(worker?.addr || "").trim() || null,
            flags: String(worker?.flags || "").trim() || null
          }))
          : [];
        diagnostics.workerCount = diagnostics.workers.length;
      }
      if (typeof queue.getJobCounts === "function") {
        diagnostics.jobCounts = await queue.getJobCounts("waiting", "active", "delayed", "failed", "completed", "paused");
      }
      return diagnostics;
    }
  };
}

function createBullMqConnection() {
  const connectionUrl = resolveRedisConnectionUrl();
  if (!connectionUrl) {
    throw new Error("render_key_value_connection_string_required");
  }
  // Lazy require so unit tests can run without installed runtime deps.
  const IORedis = require("ioredis");
  return new IORedis(connectionUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false
  });
}

function createBullMqQueue({
  queueName = "podcaster-montage-export",
  connection = createBullMqConnection()
} = {}) {
  const { Queue } = require("bullmq");
  return new Queue(queueName, {
    connection,
    defaultJobOptions: {
      removeOnComplete: true,
      removeOnFail: false
    }
  });
}

function createBullMqWorker(processor, {
  queueName = "podcaster-montage-export",
  connection = createBullMqConnection(),
  concurrency = 1
} = {}) {
  if (typeof processor !== "function") {
    throw new Error("bullmq_processor_required");
  }
  const { Worker } = require("bullmq");
  return new Worker(queueName, processor, {
    connection,
    concurrency
  });
}

module.exports = {
  createMontageExportQueue,
  createBullMqConnection,
  createBullMqQueue,
  createBullMqWorker,
  resolveRedisConnectionUrl
};
