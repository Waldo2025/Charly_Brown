import { authFetchJson, buildExportApiUrl } from "../js/api-client-podcaster.js?v=2026-06-26.10";
import {
  buildMontageExportPayloadForSubmission,
  clearMontageExportPolling,
  continueMontageExportPolling,
  getMontagePreviewRowId,
  logMontageExportDevtools,
  pollMontageExportJob,
  resetMontageExportJobState,
  setMontageExportBusy,
  setMontageExportContinueButton,
  setMontageExportDownloadButton,
  setMontageExportProgress,
  setMontageExportStatus
} from "./podcaster-montage-export.js?v=2026-06-29.19";

let montageExportV2SubmitLocked = false;

function buildMontageExportV2Endpoint(path = "") {
  const input = String(path || "").trim();
  return buildExportApiUrl(input || "/api/podcaster/montage/export-v2");
}

function normalizePreviewRuntimeSegment(segment = {}) {
  const source = segment && typeof segment === "object" ? segment : {};
  const kind = String(source.kind || "play").trim().toLowerCase() === "hold" ? "hold" : "play";
  const startSourceMs = Math.max(0, Math.round(Number(source.startSourceMs || 0) || 0));
  const endSourceMs = Math.max(startSourceMs, Math.round(Number(source.endSourceMs || startSourceMs) || startSourceMs));
  const timelineDurationMs = Math.max(0, Math.round(Number(source.timelineDurationMs || 0) || 0));
  if (kind === "play" && endSourceMs <= startSourceMs) return null;
  if (timelineDurationMs < 1) return null;
  return {
    kind,
    startSourceMs,
    endSourceMs: kind === "hold" ? startSourceMs : endSourceMs,
    playbackRate: kind === "hold" ? 0 : Math.max(0.25, Math.min(4, Number(source.playbackRate || 1) || 1)),
    timelineDurationMs
  };
}

function buildTimingSegmentsFromRuntimeEntry(entry = null) {
  if (!entry || typeof entry !== "object") return [];
  const resolver = window.resolveSceneSourceStateAtTimelineMs;
  const durationMs = Math.max(500, Math.round(Number(entry?.effectiveDurationMs || entry?.durationMs || 0) || 0));
  if (typeof resolver !== "function" || durationMs <= 0) return [];
  const segments = [];
  let cursorMs = 0;
  let active = null;
  const sampleStepMs = 20;
  while (cursorMs <= durationMs) {
    const timelineMs = Math.max(0, Number(entry.startMs || 0) || 0) + cursorMs;
    const state = resolver(entry, timelineMs) || {};
    const kind = state.isHoldActive === true ? "hold" : "play";
    const playbackRate = kind === "hold" ? 0 : Math.max(0.25, Math.min(4, Number(state.playbackRate || 1) || 1));
    const sourceMs = Math.max(0, Math.round(Number(state.sourceMs || 0) || 0));
    const signature = `${kind}:${playbackRate}:${sourceMs}`;
    const shouldStartNew = !active
      || active.kind !== kind
      || Math.abs(active.playbackRate - playbackRate) > 0.001
      || (kind === "hold" && active.startSourceMs !== sourceMs)
      || (kind === "play" && Math.abs(sourceMs - active.lastSourceMs) > Math.max(80, sampleStepMs * playbackRate * 3));
    if (shouldStartNew) {
      if (active) segments.push(active);
      active = {
        kind,
        startTimelineMs: cursorMs,
        endTimelineMs: cursorMs,
        startSourceMs: sourceMs,
        endSourceMs: sourceMs,
        lastSourceMs: sourceMs,
        playbackRate,
        signature
      };
    } else if (active) {
      active.endTimelineMs = cursorMs;
      active.endSourceMs = kind === "hold" ? active.startSourceMs : sourceMs;
      active.lastSourceMs = sourceMs;
    }
    cursorMs += sampleStepMs;
  }
  if (active) {
    active.endTimelineMs = durationMs;
    segments.push(active);
  }
  return segments
    .map((segment) => normalizePreviewRuntimeSegment({
      kind: segment.kind,
      startSourceMs: segment.startSourceMs,
      endSourceMs: segment.kind === "hold" ? segment.startSourceMs : Math.max(segment.startSourceMs + 1, segment.endSourceMs),
      playbackRate: segment.playbackRate,
      timelineDurationMs: Math.max(1, segment.endTimelineMs - segment.startTimelineMs)
    }))
    .filter(Boolean);
}

export function buildPreviewRuntimeSnapshot(session = null, runtimeEntries = []) {
  const activeSession = session || window.getActiveSession?.() || null;
  const entries = Array.isArray(runtimeEntries) ? runtimeEntries.filter(Boolean) : [];
  return {
    pipeline: "ffmpeg-preview-runtime-v2",
    timelineVersion: Number(window.STUDIO_TIMELINE_VERSION || activeSession?.podcastVideoConfig?.timelineVersion || 3) || 3,
    generatedAt: new Date().toISOString(),
    entries: entries.map((entry, index) => {
      const rowId = String(entry?.rowId || "").trim();
      return {
        rowId,
        sceneIndex: index + 1,
        startMs: Math.max(0, Math.round(Number(entry?.startMs || 0) || 0)),
        endMs: Math.max(0, Math.round(Number(entry?.endMs || 0) || 0)),
        durationMs: Math.max(500, Math.round(Number(entry?.effectiveDurationMs || 0) || 0)),
        sourceDurationMs: Math.max(500, Math.round(Number(entry?.sourceDurationMs || entry?.clip?.sourceDurationMs || 0) || 0)),
        frameHolds: Array.isArray(entry?.frameHolds) ? entry.frameHolds : [],
        speedRanges: Array.isArray(entry?.speedRanges) ? entry.speedRanges : [],
        timingSegments: buildTimingSegmentsFromRuntimeEntry(entry)
      };
    }).filter((entry) => entry.rowId)
  };
}

function mergePreviewRuntimeIntoPayload(payload = {}, previewRuntime = {}) {
  const runtimeByRowId = new Map((Array.isArray(previewRuntime?.entries) ? previewRuntime.entries : [])
    .map((entry) => [String(entry?.rowId || "").trim(), entry])
    .filter(([rowId]) => rowId));
  return {
    ...payload,
    renderPipeline: "ffmpeg-preview-runtime-v2",
    previewRuntime,
    entries: (Array.isArray(payload?.entries) ? payload.entries : []).map((entry) => {
      const rowId = String(entry?.rowId || "").trim();
      const runtime = runtimeByRowId.get(rowId) || null;
      if (!runtime) return entry;
      return {
        ...entry,
        sourceDurationMs: runtime.sourceDurationMs || entry.sourceDurationMs,
        frameHolds: runtime.frameHolds,
        speedRanges: runtime.speedRanges,
        previewRuntime: {
          ...(entry.previewRuntime || {}),
          ...runtime
        }
      };
    })
  };
}

export async function runMontageExportV2() {
  if (window.montageExportBusy || montageExportV2SubmitLocked) return;
  montageExportV2SubmitLocked = true;
  try {
    const session = window.getActiveSession?.() || null;
    const builtRuntimeEntries = window.buildTimelineRuntimeEntries?.(session);
    const runtimeEntries = Array.isArray(builtRuntimeEntries) ? builtRuntimeEntries : [];
    resetMontageExportJobState();
    clearMontageExportPolling();
    setMontageExportBusy(true, {
      progress: 0.03,
      label: "Preparando exportación…"
    });
    setMontageExportDownloadButton({ visible: false });
    setMontageExportContinueButton({ visible: false });
    setMontageExportStatus(
      "Preparando exportación FFmpeg v2…",
      "Usando el runtime del preview: escenas, holds, velocidades, transiciones, texto y audio.",
      { tone: "neutral" }
    );

    const prepared = await buildMontageExportPayloadForSubmission(session, { renderOnScreenTextFrames: true });
    if (!prepared?.ok || !prepared?.payload) {
      setMontageExportStatus(prepared?.error || "No pudimos preparar la exportación.", "Revisa que el timeline tenga clips válidos.", { tone: "error" });
      setMontageExportBusy(false, { label: "Exportar" });
      return;
    }
    const onScreenTextSegmentCount = Array.isArray(prepared.payload.onScreenTextTimeline?.segments)
      ? prepared.payload.onScreenTextTimeline.segments.length
      : 0;
    const renderedTextSegments = Array.isArray(prepared.payload.onScreenTextRenderedSegments)
      ? prepared.payload.onScreenTextRenderedSegments
      : [];
    const renderedTextFrameCount = renderedTextSegments.reduce((total, segment) => {
      return total + (Array.isArray(segment?.renderedFrames) ? segment.renderedFrames.length : 0);
    }, 0);
    if (onScreenTextSegmentCount > 0 && renderedTextFrameCount < 1) {
      setMontageExportStatus(
        "No pudimos preparar el karaoke para exportar.",
        "No se generaron las capturas PNG del texto en pantalla; se detuvo para no exportar un MP4 sin el highlight seleccionado.",
        { tone: "error" }
      );
      setMontageExportBusy(false, { label: "Exportar" });
      return;
    }
    const previewRuntime = buildPreviewRuntimeSnapshot(session, runtimeEntries);
    const payload = mergePreviewRuntimeIntoPayload(prepared.payload, previewRuntime);
    payload.previewRowId = getMontagePreviewRowId();
    payload.renderMode = "browser";
    payload.renderPipeline = "ffmpeg-preview-runtime-v2";
    payload.clientBuild = {
      module: "podcaster-montage-export-v2.js",
      route: "/api/podcaster/montage/export-v2"
    };

    logMontageExportDevtools("ffmpeg_preview_runtime_v2_submit", {
      entries: Array.isArray(payload.entries) ? payload.entries.length : 0,
      timingEntries: previewRuntime.entries.length,
      timingSegments: previewRuntime.entries.reduce((acc, entry) => acc + (Array.isArray(entry.timingSegments) ? entry.timingSegments.length : 0), 0),
      onScreenTextSegments: onScreenTextSegmentCount,
      renderedTextSegments: renderedTextSegments.length,
      renderedTextFrames: renderedTextFrameCount,
      onScreenTextMode: "rendered_png_overlay"
    });

    const exportV2Endpoint = buildMontageExportV2Endpoint("/api/podcaster/montage/export-v2");
    logMontageExportDevtools("ffmpeg_preview_runtime_v2_request", {
      endpoint: exportV2Endpoint,
      renderPipeline: payload.renderPipeline,
      entries: Array.isArray(payload.entries) ? payload.entries.length : 0
    });
    const data = await authFetchJson(exportV2Endpoint, {
      method: "POST",
      preferRemote: false,
      body: payload
    });
    logMontageExportDevtools("ffmpeg_preview_runtime_v2_response", {
      jobId: String(data?.jobId || data?.id || "").trim(),
      status: String(data?.status || "").trim(),
      stage: String(data?.stage || "").trim(),
      renderPipeline: String(data?.renderPipeline || "").trim()
    });
    const jobId = String(data?.jobId || data?.id || "").trim();
    if (!jobId) throw new Error("montage_export_v2_job_missing");
    const activeJobState = window.montageExportJobState || {};
    activeJobState.jobId = jobId;
    activeJobState.startedAtMs = Date.now();
    activeJobState.lastStage = String(data?.stage || "").trim();
    activeJobState.lastHint = String(data?.hint || "").trim();
    activeJobState.lastProgress = Math.max(0, Math.min(1, Number(data?.progress || 0) || 0));
    window.montageExportJobState = activeJobState;
    setMontageExportProgress(activeJobState.lastProgress);
    setMontageExportStatus("Exportación FFmpeg v2 iniciada…", activeJobState.lastHint || "Renderizando con la ruta nueva.", { tone: "neutral" });
    pollMontageExportJob(jobId).catch(() => {});
  } catch (error) {
    console.error("[podcaster][montage-export-v2] failed", error);
    setMontageExportStatus(
      "No pudimos exportar tu video con FFmpeg v2.",
      String(error?.message || error || "Revisa el timeline y vuelve a intentar.").trim(),
      { tone: "error" }
    );
    setMontageExportBusy(false, { label: "Exportar" });
  } finally {
    montageExportV2SubmitLocked = false;
  }
}

export async function handleMontageExportConfirmClickV2(event = null) {
  if (event && typeof event.preventDefault === "function") event.preventDefault();
  if (event && typeof event.stopPropagation === "function") event.stopPropagation();
  if (window.montageExportBusy || montageExportV2SubmitLocked) {
    setMontageExportStatus(
      "La exportación ya está en curso.",
      "Espera a que termine el job actual o usa Continuar exportación si quedó uno pendiente.",
      { tone: "warning" }
    );
    return;
  }
  await runMontageExportV2();
}

window.PodcasterMontageExportV2 = Object.freeze({
  buildPreviewRuntimeSnapshot,
  runMontageExportV2,
  handleMontageExportConfirmClickV2,
  continueMontageExportPolling
});
