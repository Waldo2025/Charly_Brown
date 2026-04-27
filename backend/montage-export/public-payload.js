function sanitizeMontageExportJobPublicPayload(job = null) {
  const source = job && typeof job === "object" ? job : {};
  const payload = {
    ok: true,
    jobId: String(source.jobId || "").trim(),
    status: String(source.status || "queued").trim() || "queued",
    stage: String(source.stage || "queued").trim() || "queued",
    progress: Math.max(0, Math.min(1, Number(source.progress || 0) || 0)),
    hint: String(source.hint || "").trim(),
    updatedAt: String(source.updatedAt || "").trim() || new Date().toISOString()
  };
  if (Number.isFinite(Number(source.currentSceneIndex))) payload.currentSceneIndex = Math.max(0, Math.round(Number(source.currentSceneIndex) || 0));
  if (Number.isFinite(Number(source.totalScenes))) payload.totalScenes = Math.max(0, Math.round(Number(source.totalScenes) || 0));
  if (source.currentRowId) payload.currentRowId = String(source.currentRowId || "").trim();
  if (source.sceneSubstage) payload.sceneSubstage = String(source.sceneSubstage || "").trim();
  if (source.currentStoragePath) payload.currentStoragePath = String(source.currentStoragePath || "").trim();
  if (source.currentDownloadUrl) payload.currentDownloadUrl = String(source.currentDownloadUrl || "").trim();
  if (source.heartbeatAt) payload.heartbeatAt = String(source.heartbeatAt || "").trim();
  if (source.lastHeartbeatAt) payload.heartbeatAt = String(source.lastHeartbeatAt || "").trim();
  if (Number.isFinite(Number(source.failedSceneIndex))) payload.failedSceneIndex = Math.max(0, Math.round(Number(source.failedSceneIndex) || 0));
  if (source.failedRowId) payload.failedRowId = String(source.failedRowId || "").trim();
  if (source.failedSubstage) payload.failedSubstage = String(source.failedSubstage || "").trim();
  if (Array.isArray(source.warnings) && source.warnings.length) payload.warnings = source.warnings;
  if (source.error && typeof source.error === "object") payload.error = source.error;
  if (source.result && typeof source.result === "object") payload.result = source.result;
  if (source.export && typeof source.export === "object") payload.export = source.export;
  if (source.downloadUrl) payload.downloadUrl = String(source.downloadUrl || "").trim();
  else if (payload.result?.downloadUrl) payload.downloadUrl = String(payload.result.downloadUrl || "").trim();
  return payload;
}

module.exports = {
  sanitizeMontageExportJobPublicPayload
};
