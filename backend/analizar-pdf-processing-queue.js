"use strict";

function createAnalizarPdfProcessingQueue({ runJob } = {}) {
  if (typeof runJob !== "function") {
    throw new Error("analizar_pdf_run_job_required");
  }

  const pending = [];
  let active = false;

  async function drain() {
    if (active) return;
    const next = pending.shift();
    if (!next) return;
    active = true;
    try {
      const result = await runJob(next.job);
      next.resolve(result);
    } catch (error) {
      next.reject(error);
    } finally {
      active = false;
      if (pending.length) {
        queueMicrotask(drain);
      }
    }
  }

  return {
    enqueue(job = {}) {
      return new Promise((resolve, reject) => {
        pending.push({
          job,
          resolve,
          reject
        });
        queueMicrotask(drain);
      });
    },
    cancel(jobId = "") {
      const cleanJobId = String(jobId || "").trim();
      if (!cleanJobId) return false;
      const index = pending.findIndex((entry) => String(entry?.job?.jobId || "").trim() === cleanJobId);
      if (index === -1) return false;
      const [entry] = pending.splice(index, 1);
      const error = new Error("analizar_pdf_job_cancelled");
      error.code = "analizar_pdf_job_cancelled";
      entry.reject(error);
      return true;
    },
    getSnapshot() {
      return {
        active,
        pendingCount: pending.length
      };
    }
  };
}

module.exports = {
  createAnalizarPdfProcessingQueue
};
