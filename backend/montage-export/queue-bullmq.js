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
        input: job.input && typeof job.input === "object" ? job.input : null,
        baseUrl: String(job.baseUrl || "").trim()
      };
      return queue.add("montage_export", payload, {
        jobId: payload.jobId,
        removeOnComplete: true,
        removeOnFail: false
      });
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
