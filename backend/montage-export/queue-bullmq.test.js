const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createMontageExportQueue
} = require("./queue-bullmq.js");

test("enqueueExportJob pushes deterministic BullMQ payload keyed by jobId", async () => {
  const calls = [];
  const fakeQueue = {
    async add(name, payload, options) {
      calls.push({ name, payload, options });
      return { id: options.jobId };
    }
  };

  const queue = createMontageExportQueue({
    queue: fakeQueue
  });

  const result = await queue.enqueueExportJob({
    jobId: "job-1",
    sessionId: "session-1",
    ownerId: "user-1"
  });

  assert.equal(result.id, "job-1");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "montage_export");
  assert.equal(calls[0].payload.jobId, "job-1");
  assert.equal(calls[0].options.jobId, "job-1");
  assert.equal(calls[0].options.removeOnComplete, true);
});
