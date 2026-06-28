"use strict";

const DEFAULT_MAX_SCENES = 60;
const DEFAULT_MAX_TOTAL_SEC = 15 * 60;

function cleanText(value = "") {
  return String(value || "").trim();
}

function hasDataUrl(value = "") {
  return /^data:[^;,]+[;,]/i.test(cleanText(value));
}

function hasRenderableAssetSource(asset = null) {
  const source = asset && typeof asset === "object" ? asset : {};
  return Boolean(
    cleanText(source.storagePath)
    || cleanText(source.downloadUrl)
    || cleanText(source.url)
    || hasDataUrl(source.dataUrl)
    || hasDataUrl(source.localDataUrl)
  );
}

function hasSyntheticVisualSource(entry = null) {
  return Boolean(cleanText(entry?.backgroundColor));
}

function buildIssue({
  code = "invalid_payload",
  message = "",
  path = "",
  index = -1,
  sceneIndex = 0,
  rowId = "",
  field = ""
} = {}) {
  return {
    code: cleanText(code) || "invalid_payload",
    message: cleanText(message) || "Datos incompletos para exportar.",
    path: cleanText(path),
    index: Number.isFinite(Number(index)) ? Math.max(0, Math.round(Number(index))) : undefined,
    sceneIndex: Number.isFinite(Number(sceneIndex)) ? Math.max(0, Math.round(Number(sceneIndex))) : 0,
    rowId: cleanText(rowId),
    field: cleanText(field)
  };
}

function validateMontageExportPreflight(input = {}, options = {}) {
  const source = input && typeof input === "object" ? input : {};
  const issues = [];
  const maxScenes = Math.max(1, Math.round(Number(options.maxScenes || DEFAULT_MAX_SCENES) || DEFAULT_MAX_SCENES));
  const maxTotalSec = Math.max(1, Number(options.maxTotalSec || DEFAULT_MAX_TOTAL_SEC) || DEFAULT_MAX_TOTAL_SEC);

  if (!cleanText(source.sessionId)) {
    issues.push(buildIssue({
      code: "missing_session_id",
      message: "Falta sessionId para validar la sesión.",
      path: "sessionId",
      field: "sessionId"
    }));
  }

  const entries = Array.isArray(source.entries) ? source.entries : [];
  if (!entries.length) {
    issues.push(buildIssue({
      code: "empty_entries",
      message: "No hay escenas preparadas para exportar.",
      path: "entries",
      field: "entries"
    }));
  }

  const rawEntryCount = Number(source.entriesRaw?.length || entries.length || 0) || 0;
  if (rawEntryCount > maxScenes || entries.length > maxScenes) {
    issues.push(buildIssue({
      code: "too_many_entries",
      message: `Demasiadas escenas para exportar (max ${maxScenes}).`,
      path: "entries",
      field: "entries"
    }));
  }

  const exportMode = cleanText(source.exportMode || "normal");
  if (!new Set(["normal", "review"]).has(exportMode)) {
    issues.push(buildIssue({
      code: "invalid_export_mode",
      message: "Modo de exportación inválido.",
      path: "exportMode",
      field: "exportMode"
    }));
  }

  const format = cleanText(source.format || "mp4_h264");
  if (!new Set(["mp4_h264", "webm_vp9"]).has(format)) {
    issues.push(buildIssue({
      code: "invalid_format",
      message: "Formato de exportación inválido.",
      path: "format",
      field: "format"
    }));
  }

  const resolution = cleanText(source.resolution || "source");
  if (!new Set(["source", "1080p", "720p", "480p", "1080x1920", "720x1280", "480x854"]).has(resolution)) {
    issues.push(buildIssue({
      code: "invalid_resolution",
      message: "Resolución de exportación inválida.",
      path: "resolution",
      field: "resolution"
    }));
  }

  if (cleanText(source.renderMode || "browser") !== "browser") {
    issues.push(buildIssue({
      code: "invalid_render_mode",
      message: "Render mode inválido.",
      path: "renderMode",
      field: "renderMode"
    }));
  }

  let totalDurationMs = 0;
  entries.forEach((entry, index) => {
    const rowId = cleanText(entry?.rowId);
    const sceneIndex = Math.max(1, Math.round(Number(entry?.sceneIndex || index + 1) || index + 1));
    const durationMs = Math.max(0, Math.round(Number(entry?.durationMs || 0) || 0));
    const startMs = Number(entry?.timelineStartMs ?? entry?.startMs);
    const endMs = Number(entry?.timelineEndMs ?? entry?.endMs);
    const videoAsset = entry?.video && typeof entry.video === "object" ? entry.video : {};
    const hasVisualSource = hasRenderableAssetSource(videoAsset);
    const hasSyntheticSource = hasSyntheticVisualSource(entry);
    const usesNativeVideoAudio = entry?.useNativeVideoAudio === true || Number(entry?.veoVolumeOverridePct || 0) > 0.0001;

    totalDurationMs += durationMs;

    if (!rowId) {
      issues.push(buildIssue({
        code: "missing_row_id",
        message: `Escena ${sceneIndex} sin rowId.`,
        path: `entries.${index}.rowId`,
        index,
        sceneIndex,
        field: "rowId"
      }));
    }

    if (durationMs < 500) {
      issues.push(buildIssue({
        code: "invalid_duration",
        message: `Escena ${sceneIndex} sin duración válida.`,
        path: `entries.${index}.durationMs`,
        index,
        sceneIndex,
        rowId,
        field: "durationMs"
      }));
    }

    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs <= startMs) {
      issues.push(buildIssue({
        code: "invalid_timeline_range",
        message: `Escena ${sceneIndex} tiene un rango de timeline inválido.`,
        path: `entries.${index}.timelineEndMs`,
        index,
        sceneIndex,
        rowId,
        field: "timelineEndMs"
      }));
    }

    if (!hasVisualSource && !hasSyntheticSource) {
      issues.push(buildIssue({
        code: "missing_visual_source",
        message: `Escena ${sceneIndex} no tiene video, imagen ni fondo renderizable para el backend.`,
        path: `entries.${index}.video`,
        index,
        sceneIndex,
        rowId,
        field: "video"
      }));
    }

    if (usesNativeVideoAudio && !hasVisualSource) {
      issues.push(buildIssue({
        code: "missing_native_audio_source",
        message: `Escena ${sceneIndex} usa audio nativo pero no tiene archivo de video accesible.`,
        path: `entries.${index}.video`,
        index,
        sceneIndex,
        rowId,
        field: "video"
      }));
    }
  });

  if ((totalDurationMs / 1000) > maxTotalSec) {
    issues.push(buildIssue({
      code: "total_duration_too_long",
      message: `Montaje demasiado largo para exportar (max ${maxTotalSec} s).`,
      path: "entries",
      field: "entries"
    }));
  }

  return {
    ok: issues.length === 0,
    issueCount: issues.length,
    issues
  };
}

function createMontageExportPreflightError(result = {}) {
  const issues = Array.isArray(result?.issues) ? result.issues : [];
  const err = new Error("montage_export_preflight_failed");
  err.status = 422;
  err.code = "montage_export_preflight_failed";
  err.detail = {
    code: "montage_export_preflight_failed",
    issueCount: issues.length,
    issues,
    message: "La sesión tiene datos incompletos para exportar. Corrige las escenas marcadas antes de iniciar el render."
  };
  return err;
}

module.exports = {
  validateMontageExportPreflight,
  createMontageExportPreflightError,
  hasRenderableAssetSource
};
