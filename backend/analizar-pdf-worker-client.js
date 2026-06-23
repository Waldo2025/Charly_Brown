"use strict";

const path = require("node:path");
const { fork } = require("node:child_process");

function runAnalizarPdfJobInWorker(job = {}) {
  const workerPath = path.resolve(__dirname, "workers", "analizar-pdf-analysis-worker.js");

  return new Promise((resolve, reject) => {
    let settled = false;
    const child = fork(workerPath, [], {
      stdio: ["ignore", "pipe", "pipe", "ipc"]
    });

    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
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

    child.send({
      type: "run",
      job
    });
  });
}

module.exports = {
  runAnalizarPdfJobInWorker
};
