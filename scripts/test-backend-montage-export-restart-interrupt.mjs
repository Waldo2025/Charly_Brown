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
  /const MONTAGE_EXPORT_STATUS_READ_TIMEOUT_MS = Math\.max\(/,
  "La lectura de estado debe tener timeout configurable y suficientemente amplio para Firestore"
);

assert.match(
  source,
  /MONTAGE_EXPORT_STATUS_READ_TIMEOUT_MS,\s*\n\s*\(timeoutMs\) =>/,
  "resolveMontageExportJobSnapshot debe usar el timeout configurable al leer Firestore"
);

assert.match(
  source,
  /function isMontageExportJobInterruptedByBackendRestart\(job = null/,
  "Debe existir detector de jobs interrumpidos por restart del backend"
);

assert.match(
  source,
  /heartbeatMs <= \(cleanBootMs \+ MONTAGE_EXPORT_RESTART_INTERRUPT_GRACE_MS\)/,
  "El detector debe tolerar reinicios con heartbeat apenas anterior al arranque actual"
);

assert.match(
  source,
  /const isRestartError = status === "error" && restartCode === "montage_export_worker_restarted";/,
  "El detector debe reconocer jobs ya marcados como restart para permitir recuperacion"
);

assert.match(
  source,
  /source\?\.error\?\.detail\?\.lastHeartbeatAt/,
  "La recuperacion de restart debe usar el heartbeat original guardado en error.detail"
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

assert.doesNotMatch(
  source,
  /status:\s*"running",\s*\n\s*stage:\s*"queued",\s*\n\s*progress:\s*0,\s*\n\s*hint:\s*"Sincronizando estado del export\."/,
  "export-status no debe inventar un job running/queued cuando la lectura de Firestore falla"
);

assert.match(
  source,
  /export-status read failed without active worker/,
  "Si falla la lectura de estado sin worker vivo, debe propagarse el error en vez de ocultar el estado real"
);

console.log("ok - montage export backend restart interruption is detected");
