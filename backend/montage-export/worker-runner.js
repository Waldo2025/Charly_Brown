function createProcessMontageExportJob({
  jobStore,
  executeMontageExportPipeline,
  buildMontageSceneFailure,
  cancelPollIntervalMs = 500
} = {}) {
  if (!jobStore || typeof jobStore.updateJob !== "function" || typeof jobStore.getJob !== "function") {
    throw new Error("montage_export_job_store_required");
  }
  if (typeof executeMontageExportPipeline !== "function") {
    throw new Error("execute_montage_export_pipeline_required");
  }
  if (typeof buildMontageSceneFailure !== "function") {
    throw new Error("build_montage_scene_failure_required");
  }

  return async (job = {}) => {
    const data = job && typeof job === "object" ? (job.data || {}) : {};
    const jobId = String(data.jobId || "").trim();
    const storedJob = jobId ? await jobStore.getJob(jobId).catch(() => null) : null;
    const storedRequest = storedJob?.request && typeof storedJob.request === "object"
      ? storedJob.request
      : null;
    const input = data.input && typeof data.input === "object"
      ? data.input
      : (storedRequest?.input && typeof storedRequest.input === "object" ? storedRequest.input : null);
    if (!jobId || !input) {
      throw new Error("invalid_montage_export_job");
    }
    const ownerId = String(data.ownerId || storedJob?.ownerId || "").trim();
    const sessionId = String(data.sessionId || storedJob?.sessionId || input.sessionId || "").trim();
    const baseUrl = String(data.baseUrl || storedRequest?.baseUrl || "").trim();

    let cancelRequested = false;
    let cancelPollTimer = null;
    const refreshCancelRequested = async () => {
      if (cancelRequested) return true;
      const currentJob = await jobStore.getJob(jobId).catch(() => null);
      if (String(currentJob?.status || "").trim().toLowerCase() === "cancelled") {
        cancelRequested = true;
      }
      return cancelRequested;
    };
    const pollIntervalMs = Math.max(100, Math.min(2000, Number(cancelPollIntervalMs) || 500));
    cancelPollTimer = setInterval(() => {
      refreshCancelRequested().catch(() => { });
    }, pollIntervalMs);
    if (typeof cancelPollTimer?.unref === "function") cancelPollTimer.unref();

    const isCancellationError = (error = null) => {
      const code = String(error?.code || "").trim().toLowerCase();
      return code === "montage_export_cancelled" || code === "ffmpeg_aborted";
    };
    const markCancelled = async (hint = "Exportación cancelada por el usuario.") => {
      cancelRequested = true;
      await jobStore.updateJob(jobId, {
        status: "cancelled",
        stage: "cancelled",
        progress: Math.max(0, Math.min(1, Number((await jobStore.getJob(jobId).catch(() => null))?.progress || 0) || 0)),
        hint
      }).catch(() => { });
    };

    await refreshCancelRequested();
    if (cancelRequested) {
      await markCancelled();
      return null;
    }

    await jobStore.updateJob(jobId, {
      status: "running",
      stage: "validate_payload",
      progress: 0.02,
      hint: "Preparando exportación."
    });
    console.info("[backend][montage-export][job-start]", {
      jobId,
      sessionId,
      ownerId,
      entries: Array.isArray(input?.entries) ? input.entries.length : 0
    });

    try {
      const result = await executeMontageExportPipeline(input, {
        uid: ownerId,
        jobId,
        baseUrl,
        shouldAbort: () => cancelRequested,
        onStage: async ({ stage, progress, hint, ...extra }) => {
          if (cancelRequested) return;
          const normalizedStage = String(stage || "validate_payload").trim() || "validate_payload";
          const normalizedExtra = { ...extra };
          if (normalizedStage !== "render_scene_segments" && !Object.prototype.hasOwnProperty.call(normalizedExtra, "sceneSubstage")) {
            normalizedExtra.sceneSubstage = "";
          }
          console.info("[backend][montage-export][job-stage]", {
            jobId,
            stage: normalizedStage,
            progress: Math.max(0, Math.min(1, Number(progress || 0) || 0)),
            hint: String(hint || "").trim(),
            ...normalizedExtra
          });
          await jobStore.updateJob(jobId, {
            status: "running",
            stage: normalizedStage,
            progress,
            hint,
            ...normalizedExtra
          });
        }
        });

      if (cancelRequested || String((await jobStore.getJob(jobId).catch(() => null))?.status || "").trim().toLowerCase() === "cancelled") {
        await markCancelled();
        return null;
      }

      await jobStore.updateJob(jobId, {
        status: "ready",
        stage: "ready",
        sceneSubstage: "scene_complete",
        progress: 1,
        hint: "Exportación lista.",
        warnings: result?.warnings ? [result.warnings] : [],
        result: result?.export || null,
        export: result?.export || null,
        downloadUrl: String(result?.downloadUrl || "").trim()
      });
      return result;
    } catch (error) {
      if (isCancellationError(error) || cancelRequested || String((await jobStore.getJob(jobId).catch(() => null))?.status || "").trim().toLowerCase() === "cancelled") {
        await markCancelled();
        return null;
      }
      console.error("[backend][montage-export][job-error]", {
        jobId,
        code: String(error?.code || "").trim() || null,
        message: String(error?.message || error),
        detail: error?.detail && typeof error.detail === "object" ? error.detail : null,
        stack: String(error?.stack || "").trim() || null
      });
      const sceneFailure = buildMontageSceneFailure(error, {
        failedSceneIndex: Number(error?.detail?.failedSceneIndex || 0) || 0,
        failedRowId: String(error?.detail?.failedRowId || "").trim(),
        failedSubstage: String(error?.detail?.failedSubstage || "").trim(),
        stage: String(error?.detail?.stage || error?.stage || "").trim()
      });
      await jobStore.updateJob(jobId, {
        status: "error",
        stage: "error",
        progress: Math.max(0.02, Math.min(0.98, Number(error?.progress || 0) || 0)),
        hint: String(error?.message || error?.code || "No se pudo exportar el montaje.").trim(),
        failedSceneIndex: sceneFailure?.detail?.failedSceneIndex || undefined,
        failedRowId: sceneFailure?.detail?.failedRowId || undefined,
        failedSubstage: sceneFailure?.detail?.failedSubstage || undefined,
        error: sceneFailure
      });
      throw error;
    } finally {
      if (cancelPollTimer) {
        clearInterval(cancelPollTimer);
        cancelPollTimer = null;
      }
    }
  };
}

module.exports = {
  createProcessMontageExportJob
};
