function canAutoResumeInterruptedMontageExportJob(job = null, {
  queueAvailable = false
} = {}) {
  const source = job && typeof job === "object" ? job : null;
  if (!source) return false;
  const status = String(source.status || "").trim().toLowerCase();
  if (!["queued", "running", "error"].includes(status)) return false;
  const request = source.request && typeof source.request === "object" ? source.request : null;
  const input = request?.input && typeof request.input === "object" ? request.input : null;
  if (!input) return false;
  if (input.persistedInlineRastersRedacted === true) return false;
  const renderPipeline = String(input.renderPipeline || input.previewRuntime?.pipeline || "").trim();
  const isPreviewRuntimeV2 = renderPipeline === "ffmpeg-preview-runtime-v2";
  const restartResumeCount = Math.max(0, Math.round(Number(source.restartResumeCount || 0) || 0));
  if (restartResumeCount >= 1) return false;
  const stage = String(source.stage || "").trim().toLowerCase();
  const progress = Math.max(0, Math.min(1, Number(source.progress || 0) || 0));
  const currentSceneIndex = Math.max(0, Math.round(Number(source.currentSceneIndex || 0) || 0));
  if (queueAvailable && !isPreviewRuntimeV2 && stage !== "concat_timeline") return false;
  if (progress >= 0.48 && stage !== "concat_timeline") return false;
  if ([
    "concat_timeline",
    "encode_visual_pass",
    "encode_delivery",
    "mix_timeline_audio",
    "mix_background_music",
    "cache_output",
    "ready",
    "completed"
  ].includes(stage)) {
    return stage === "concat_timeline";
  }
  return true;
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
