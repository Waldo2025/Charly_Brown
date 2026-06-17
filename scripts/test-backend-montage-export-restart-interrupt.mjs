import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../backend/server.js", import.meta.url), "utf8");

assert.match(
  source,
  /const BACKEND_BOOT_ISO = new Date\(\)\.toISOString\(\);/,
  "El backend debe exponer la hora de arranque para detectar jobs previos al restart"
);

assert.match(
  source,
  /const MONTAGE_EXPORT_RESTART_INTERRUPT_GRACE_MS = Math\.max\(/,
  "Debe existir una ventana de gracia para clasificar interrupciones por restart"
);

assert.match(
  source,
  /function isMontageExportJobInterruptedByBackendRestart\(job = null/,
  "Debe existir detector de jobs interrumpidos por restart del backend"
);

assert.match(
  source,
  /heartbeatMs < \(cleanBootMs - MONTAGE_EXPORT_RESTART_INTERRUPT_GRACE_MS\)/,
  "El detector debe comparar el heartbeat contra el arranque actual del backend"
);

assert.match(
  source,
  /code: "montage_export_worker_restarted"/,
  "El error publico debe distinguir restart de worker stalled"
);

assert.match(
  source,
  /isMontageExportJobInterruptedByBackendRestart\(job\) && !hasActiveMontageWorkerForJob/,
  "export-status debe marcar inmediatamente jobs running previos al restart sin worker activo"
);

console.log("ok - montage export backend restart interruption is detected");
