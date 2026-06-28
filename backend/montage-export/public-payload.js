function sanitizeMontageExportJobPublicPayload(job = null) {
  const source = job && typeof job === "object" ? job : {};
  const exportBlock = source.export && typeof source.export === "object" ? source.export : null;
  const resultBlock = source.result && typeof source.result === "object" ? source.result : null;
  const resolvedDownloadUrl = String(
    source.downloadUrl
    || exportBlock?.downloadUrl
    || resultBlock?.downloadUrl
    || ""
  ).trim();
  const hasReadyExport = Boolean(resolvedDownloadUrl || exportBlock?.storagePath || resultBlock?.storagePath);
  const payload = {
    ok: true,
    jobId: String(source.jobId || "").trim(),
    status: hasReadyExport ? "ready" : (String(source.status || "queued").trim() || "queued"),
    stage: hasReadyExport ? "ready" : (String(source.stage || "queued").trim() || "queued"),
    progress: hasReadyExport ? 1 : Math.max(0, Math.min(1, Number(source.progress || 0) || 0)),
    hint: hasReadyExport ? "Export listo para descargar." : String(source.hint || "").trim(),
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
  if (source.degraded === true) payload.degraded = true;
  if (Number.isFinite(Number(source.failedSceneIndex))) payload.failedSceneIndex = Math.max(0, Math.round(Number(source.failedSceneIndex) || 0));
  if (source.failedRowId) payload.failedRowId = String(source.failedRowId || "").trim();
  if (source.failedSubstage) payload.failedSubstage = String(source.failedSubstage || "").trim();
  if (Array.isArray(source.warnings) && source.warnings.length) payload.warnings = source.warnings;
  if (!hasReadyExport && source.error && typeof source.error === "object") payload.error = source.error;
  if (resultBlock) payload.result = resultBlock;
  if (exportBlock) payload.export = exportBlock;
  if (resolvedDownloadUrl) payload.downloadUrl = resolvedDownloadUrl;
  return payload;
}

module.exports = {
  sanitizeMontageExportJobPublicPayload
};
