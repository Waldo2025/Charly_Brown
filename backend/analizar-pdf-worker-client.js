"use strict";

const path = require("node:path");
const { fork } = require("node:child_process");

function resolveAnalizarPdfWorkerTimeoutMs(job = {}, timeoutMs = null) {
  const explicitTimeout = Number(timeoutMs);
  if (Number.isFinite(explicitTimeout) && explicitTimeout > 0) {
    return explicitTimeout;
  }
  const sourceType = String(job?.session?.sourceType || job?.sourceType || "").trim().toLowerCase();
  const envKey = sourceType === "idml"
    ? "ANALIZAR_PDF_IDML_TIMEOUT_MS"
    : "ANALIZAR_PDF_PDF_TIMEOUT_MS";
  const envTimeout = Number(process.env[envKey] || process.env.ANALIZAR_PDF_WORKER_TIMEOUT_MS || 0);
  if (Number.isFinite(envTimeout) && envTimeout > 0) {
    return envTimeout;
  }
  return sourceType === "idml" ? 20 * 60 * 1000 : 8 * 60 * 1000;
}

function createAnalizarPdfWorkerRun(job = {}, options = {}) {
  const workerPath = path.resolve(__dirname, "workers", "analizar-pdf-analysis-worker.js");
  const forkProcess = typeof options.forkProcess === "function" ? options.forkProcess : fork;
  const timeoutMs = resolveAnalizarPdfWorkerTimeoutMs(job, options.timeoutMs);
  let cancel = () => false;

  const promise = new Promise((resolve, reject) => {
    let settled = false;
    let timeoutHandle = null;
    const child = forkProcess(workerPath, [], {
      stdio: ["ignore", "pipe", "pipe", "ipc"]
    });

    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      child.removeAllListeners();
      if (child.stdout) child.stdout.removeAllListeners();
      if (child.stderr) child.stderr.removeAllListeners();
      fn(value);
    };

    child.stdout?.on("data", (chunk) => {
      const text = String(chunk || "").trim();
      if (text) {
        console.log(`[analizar-pdf-worker] ${text}`);
      }
    });

    child.stderr?.on("data", (chunk) => {
      const text = String(chunk || "").trim();
      if (text) {
        console.error(`[analizar-pdf-worker] ${text}`);
      }
    });

    child.once("error", (error) => {
      settle(reject, error);
    });

    child.on("message", (message = {}) => {
      if (message.type === "completed") {
        settle(resolve, message.result || null);
        return;
      }
      if (message.type === "failed") {
        const error = new Error(String(message.error || "analizar_pdf_worker_failed"));
        error.stack = message.stack || error.stack;
        settle(reject, error);
      }
    });

    child.once("exit", (code, signal) => {
      if (settled) return;
      settle(reject, new Error(`analizar_pdf_worker_exited_before_response (code=${code ?? "null"} signal=${signal ?? "null"})`));
    });

    timeoutHandle = setTimeout(() => {
      settle(reject, new Error(`analizar_pdf_worker_timed_out_after_${timeoutMs}ms`));
      try {
        child.kill("SIGKILL");
      } catch (_) {
        // noop
      }
    }, timeoutMs);
    cancel = () => {
      settle(reject, new Error("analizar_pdf_worker_cancelled"));
      try {
        child.kill("SIGKILL");
      } catch (_) {
        // noop
      }
      return true;
    };
    child.send({
      type: "run",
      job
    });
  });
  return { promise, cancel };
}

function runAnalizarPdfJobInWorker(job = {}, options = {}) {
  return createAnalizarPdfWorkerRun(job, options).promise;
}

module.exports = {
  createAnalizarPdfWorkerRun,
  runAnalizarPdfJobInWorker
};
