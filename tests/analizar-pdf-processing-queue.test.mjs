import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createAnalizarPdfProcessingQueue } = require("../backend/analizar-pdf-processing-queue.js");

test("analizar pdf processing queue runs one job at a time in enqueue order", async () => {
  const starts = [];
  const finishes = [];
  const releases = new Map();

  const queue = createAnalizarPdfProcessingQueue({
    runJob: (job) => new Promise((resolve) => {
      starts.push(job.jobId);
      releases.set(job.jobId, () => {
        finishes.push(job.jobId);
        resolve(job.jobId);
      });
    })
  });

  const firstJob = queue.enqueue({ jobId: "job_1" });
  const secondJob = queue.enqueue({ jobId: "job_2" });

  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(starts, ["job_1"]);

  releases.get("job_1")();
  assert.equal(await firstJob, "job_1");

  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(starts, ["job_1", "job_2"]);

  releases.get("job_2")();
  assert.equal(await secondJob, "job_2");
  assert.deepEqual(finishes, ["job_1", "job_2"]);
});
