"use strict";

const {
  spawnAnalizarPdfPythonJob
} = require("../analizar-pdf.js");

function sendMessageAndExit(message = {}, exitCode = 0) {
  const finalize = () => {
    if (typeof process.disconnect === "function") {
      try {
        process.disconnect();
      } catch (_) {
        // noop
      }
    }
    setImmediate(() => {
      process.exit(exitCode);
    });
  };

  if (typeof process.send !== "function") {
    finalize();
    return;
  }

  try {
    process.send(message, (error) => {
      if (error) {
        console.error("[analizar-pdf-worker] ipc send failed:", String(error?.message || error));
      }
      finalize();
    });
  } catch (error) {
    console.error("[analizar-pdf-worker] ipc send threw:", String(error?.message || error));
    finalize();
  }
}

process.on("message", async (message = {}) => {
  if (message.type !== "run") return;
  const job = message.job && typeof message.job === "object" ? message.job : {};
  try {
    const result = await spawnAnalizarPdfPythonJob(job);
    sendMessageAndExit({
      type: "completed",
      result
    }, 0);
  } catch (error) {
    sendMessageAndExit({
      type: "failed",
      error: String(error?.message || error),
      stack: String(error?.stack || "")
    }, 1);
  }
});
