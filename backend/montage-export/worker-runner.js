function createProcessMontageExportJob({
  jobStore,
  executeMontageExportPipeline,
  buildMontageSceneFailure
} = {}) {
  if (!jobStore || typeof jobStore.updateJob !== "function") {
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
    const input = data.input && typeof data.input === "object" ? data.input : null;
    if (!jobId || !input) {
      throw new Error("invalid_montage_export_job");
    }

    await jobStore.updateJob(jobId, {
      status: "running",
      stage: "validate_payload",
      progress: 0.02,
      hint: "Preparando exportación."
    });
    console.info("[backend][montage-export][job-start]", {
      jobId,
      sessionId: String(data.sessionId || "").trim(),
      ownerId: String(data.ownerId || "").trim(),
      entries: Array.isArray(input?.entries) ? input.entries.length : 0
    });

    try {
      const result = await executeMontageExportPipeline(input, {
        uid: String(data.ownerId || "").trim(),
        jobId,
        baseUrl: String(data.baseUrl || "").trim(),
        onStage: async ({ stage, progress, hint, ...extra }) => {
          console.info("[backend][montage-export][job-stage]", {
            jobId,
            stage: String(stage || "validate_payload").trim() || "validate_payload",
            progress: Math.max(0, Math.min(1, Number(progress || 0) || 0)),
            hint: String(hint || "").trim(),
            ...extra
          });
          await jobStore.updateJob(jobId, {
            status: stage === "ready" ? "ready" : "running",
            stage,
            progress,
            hint,
            ...extra
          });
        }
      });

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
      console.error("[backend][montage-export][job-error]", {
        jobId,
        code: String(error?.code || "").trim() || null,
        message: String(error?.message || error)
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
    }
  };
}

module.exports = {
  createProcessMontageExportJob
};
