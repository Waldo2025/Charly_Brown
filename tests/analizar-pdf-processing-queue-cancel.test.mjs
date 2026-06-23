import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createAnalizarPdfProcessingQueue } = require("../backend/analizar-pdf-processing-queue.js");

test("analizar pdf processing queue cancels pending jobs by id", async () => {
  let releaseFirst = null;
  const queue = createAnalizarPdfProcessingQueue({
    runJob: (job) => new Promise((resolve) => {
      if (job.jobId === "job_1") {
        releaseFirst = () => resolve("job_1");
      }
    })
  });

  const first = queue.enqueue({ jobId: "job_1" });
  const second = queue.enqueue({ jobId: "job_2" });

  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(queue.cancel("job_2"), true);
  await assert.rejects(second, /analizar_pdf_job_cancelled/);

  releaseFirst();
  assert.equal(await first, "job_1");
});
