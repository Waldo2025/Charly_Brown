const DEFAULT_RECENT_SNAPSHOT_GRACE_MS = 5 * 60 * 1000;

function toEpochMs(value = "") {
  const parsed = Number(new Date(value).getTime() || 0) || 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function isTerminalMontageExportStatus(status = "") {
  const clean = String(status || "").trim().toLowerCase();
  return clean === "ready" || clean === "error" || clean === "completed" || clean === "failed" || clean === "cancelled";
}

function getMontageExportJobSnapshotAgeMs(job = null, nowMs = Date.now()) {
  if (!job || typeof job !== "object") return Number.POSITIVE_INFINITY;
  const timestamps = [
    job.heartbeatAt,
    job.lastHeartbeatAt,
    job.updatedAt,
    job.createdAt
  ]
    .map((value) => toEpochMs(value))
    .filter((value) => value > 0);
  if (!timestamps.length) return Number.POSITIVE_INFINITY;
  const latest = Math.max(...timestamps);
  return Math.max(0, Number(nowMs || 0) - latest);
}

function isRecentMontageExportJobSnapshot(job = null, options = {}) {
  if (!job || typeof job !== "object") return false;
  if (isTerminalMontageExportStatus(job.status)) return false;
  const graceMs = Math.max(1000, Number(options.graceMs || DEFAULT_RECENT_SNAPSHOT_GRACE_MS) || DEFAULT_RECENT_SNAPSHOT_GRACE_MS);
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  return getMontageExportJobSnapshotAgeMs(job, nowMs) <= graceMs;
}

function recoverMontageExportJobSnapshot(job = null, options = {}) {
  if (!job || typeof job !== "object") return null;
  const cleanJob = { ...job };
  if (isTerminalMontageExportStatus(cleanJob.status)) return cleanJob;
  if (!isRecentMontageExportJobSnapshot(cleanJob, options)) return null;
  const updatedAt = String(cleanJob.updatedAt || cleanJob.heartbeatAt || cleanJob.createdAt || "").trim();
  return {
    ...cleanJob,
    status: "running",
    stage: String(cleanJob.stage || "queued").trim() || "queued",
    hint: String(cleanJob.hint || "Sincronizando estado del export.").trim() || "Sincronizando estado del export.",
    degraded: true,
    heartbeatAt: String(cleanJob.heartbeatAt || updatedAt || "").trim(),
    updatedAt: updatedAt || new Date().toISOString()
  };
}

module.exports = {
  DEFAULT_RECENT_SNAPSHOT_GRACE_MS,
  toEpochMs,
  isTerminalMontageExportStatus,
  isRecentMontageExportJobSnapshot,
  recoverMontageExportJobSnapshot,
  getMontageExportJobSnapshotAgeMs
};
