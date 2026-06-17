import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

if (!/const MONTAGE_EXPORT_STALE_HEARTBEAT_MS = Math\.max\(/.test(source)
  || !/MONTAGE_EXPORT_SCENE_RENDER_TIMEOUT_MS \+ \(2 \* 60 \* 1000\)/.test(source)) {
  throw new Error("El backend debe definir un umbral de heartbeat estancado para jobs de montage export.");
}

if (!/function getMontageExportJobHeartbeatAgeMs\(job = null, nowMs = Date\.now\(\)\)/.test(source)
  || !/function isMontageExportJobStale\(job = null, nowMs = Date\.now\(\)\)/.test(source)
  || !/function buildStaleMontageExportJobPatch\(job = null, nowMs = Date\.now\(\)\)/.test(source)) {
  throw new Error("El backend debe tener helpers explícitos para detectar y reportar jobs de export estancados.");
}

if (!/montage_export_worker_stalled/.test(source)
  || !/El worker perdió el heartbeat del export/.test(source)) {
  throw new Error("El error público debe explicar que el worker perdió el heartbeat del export.");
}

if (!/export-status marking stale job/.test(source)
  || !/await montageExportJobStore\.updateJob\(jobId, stalePatch\)/.test(source)
  || !/sanitizeMontageExportJobPublicPayload\(staleJob\)/.test(source)) {
  throw new Error("export-status debe persistir y devolver error cuando un job running/queued queda sin heartbeat.");
}

if (!/if \(isMontageExportJobStale\(parsed\)\) return parsed;/.test(source)
  || !/if \(!recovered && isMontageExportJobStale\(snapshot\)\) return snapshot;/.test(source)) {
  throw new Error("Los snapshots viejos no terminales deben llegar al detector stale antes de convertirse en job_not_found.");
}

console.log("Backend montage export stale heartbeat detection OK.");
