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
