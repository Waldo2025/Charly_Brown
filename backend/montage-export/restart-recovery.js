function canAutoResumeInterruptedMontageExportJob(job = null, {
  queueAvailable = false
} = {}) {
  const source = job && typeof job === "object" ? job : null;
  if (!source || queueAvailable) return false;
  const status = String(source.status || "").trim().toLowerCase();
  if (!["queued", "running", "error"].includes(status)) return false;
  const request = source.request && typeof source.request === "object" ? source.request : null;
  const input = request?.input && typeof request.input === "object" ? request.input : null;
  if (!input) return false;
  const restartResumeCount = Math.max(0, Math.round(Number(source.restartResumeCount || 0) || 0));
  return restartResumeCount < 1;
}

function buildAutoResumeInterruptedMontageExportJobPatch(job = null, nowIso = new Date().toISOString()) {
  const source = job && typeof job === "object" ? job : {};
  const request = source.request && typeof source.request === "object" ? source.request : null;
  return {
    status: "running",
    stage: "restart_recovery",
    sceneSubstage: "restart_recovery",
    progress: Math.max(0.02, Math.min(0.98, Number(source.progress || 0) || 0)),
    hint: "Reanudando el export tras un reinicio del backend.",
    error: null,
    failedSceneIndex: 0,
    failedRowId: "",
    failedSubstage: "",
    request,
    restartResumeCount: Math.max(0, Math.round(Number(source.restartResumeCount || 0) || 0)) + 1,
    restartResumedAt: String(nowIso || "").trim() || new Date().toISOString(),
    heartbeatAt: String(nowIso || "").trim() || new Date().toISOString(),
    lastHeartbeatAt: String(nowIso || "").trim() || new Date().toISOString()
  };
}

module.exports = {
  canAutoResumeInterruptedMontageExportJob,
  buildAutoResumeInterruptedMontageExportJobPatch
};
