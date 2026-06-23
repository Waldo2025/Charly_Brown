"use strict";

const {
  spawnAnalizarPdfPythonJob
} = require("../analizar-pdf.js");

process.on("message", async (message = {}) => {
  if (message.type !== "run") return;
  const job = message.job && typeof message.job === "object" ? message.job : {};
  try {
    const result = await spawnAnalizarPdfPythonJob(job);
    if (typeof process.send === "function") {
      process.send({
        type: "completed",
        result
      });
    }
    process.exit(0);
  } catch (error) {
    if (typeof process.send === "function") {
      process.send({
        type: "failed",
        error: String(error?.message || error),
        stack: String(error?.stack || "")
      });
    }
    process.exit(1);
  }
});
