const DIALOGUE_VIDEO_MAX_REFERENCE_IMAGE_COUNT = 3;
const DIALOGUE_VIDEO_MAX_REFERENCE_VIDEO_COUNT = 1;
const DIALOGUE_VIDEO_MAX_CONTINUITY_FRAME_COUNT = 1;
const DIALOGUE_VIDEO_INLINE_REFERENCE_BUDGET_BYTES = 7 * 1024 * 1024;

function createHeavyWorkCoordinator({
  montageExportMaxConcurrent = Number(process.env.MONTAGE_EXPORT_MAX_CONCURRENT || 1) || 1,
  dialogueVideoMaxConcurrent = Number(process.env.DIALOGUE_VIDEO_MAX_CONCURRENT || 1) || 1
} = {}) {
  const safeMontageExportMaxConcurrent = Math.max(1, Number(montageExportMaxConcurrent) || 2);
  const safeDialogueVideoMaxConcurrent = Math.max(1, Number(dialogueVideoMaxConcurrent) || 1);
  const state = {
    activeMontageExportJobIds: [],
    activeMontageExportJobId: "",
    activeDialogueVideoJobIds: [],
    activeDialogueVideoJobId: "",
    lastUpdatedAt: "",
    limits: {
      montage_export: safeMontageExportMaxConcurrent,
      dialogue_video: safeDialogueVideoMaxConcurrent
    }
  };

  const updateTimestamp = () => {
    state.lastUpdatedAt = new Date().toISOString();
  };

  const syncLegacyFields = () => {
    state.activeMontageExportJobId = String(state.activeMontageExportJobIds[0] || "").trim();
    state.activeDialogueVideoJobId = String(state.activeDialogueVideoJobIds[0] || "").trim();
  };

  const buildStateSnapshot = () => ({
    ...state,
    activeMontageExportJobIds: [...state.activeMontageExportJobIds],
    activeDialogueVideoJobIds: [...state.activeDialogueVideoJobIds],
    limits: { ...state.limits }
  });

  const getActiveJobIds = (kind = "") => {
    const cleanKind = String(kind || "").trim();
    if (cleanKind === "montage_export") return [...state.activeMontageExportJobIds];
    if (cleanKind === "dialogue_video") return [...state.activeDialogueVideoJobIds];
    return [
      ...state.activeMontageExportJobIds,
      ...state.activeDialogueVideoJobIds
    ];
  };

  const getActiveJobId = (kind = "") => {
    const cleanKind = String(kind || "").trim();
    return String(getActiveJobIds(cleanKind)[0] || "").trim();
  };

  const hasActiveJob = (kind = "", jobId = "") => {
    const cleanKind = String(kind || "").trim();
    const cleanJobId = String(jobId || "").trim();
    if (!cleanKind || !cleanJobId) return false;
    return getActiveJobIds(cleanKind).includes(cleanJobId);
  };

  const getActiveKind = () => {
    if (state.activeMontageExportJobIds.length) return "montage_export";
    if (state.activeDialogueVideoJobIds.length) return "dialogue_video";
    return "";
  };

  const buildHeavyWorkBusyError = (kind = "", activeJobId = "") => {
    const resolvedActiveKind = getActiveKind();
    const resolvedRequestedKind = String(kind || "").trim();
    const resolvedActiveJobIds = getActiveJobIds(resolvedRequestedKind);
    const resolvedActiveJobId = String(activeJobId || resolvedActiveJobIds[0] || "").trim();
    const error = new Error("backend_busy");
    error.code = "backend_busy";
    error.status = 503;
    error.detail = {
      kind: resolvedRequestedKind || resolvedActiveKind || "unknown",
      requestedKind: resolvedRequestedKind || undefined,
      activeJobId: resolvedActiveJobId,
      activeJobIds: resolvedActiveJobIds,
      activeCount: resolvedActiveJobIds.length,
      maxConcurrent: Number(state.limits?.[resolvedRequestedKind] || 1) || 1,
      retryable: true
    };
    return error;
  };

  const tryAcquireHeavyWorkSlot = (kind = "", jobId = "") => {
    const cleanKind = String(kind || "").trim();
    const cleanJobId = String(jobId || "").trim();
    const activeJobId = getActiveJobId(cleanKind);
    if (!cleanJobId) {
      return {
        ok: false,
        error: buildHeavyWorkBusyError(cleanKind, activeJobId)
      };
    }
    if (cleanKind === "montage_export") {
      if (hasActiveJob(cleanKind, cleanJobId)) {
        return { ok: true, state: buildStateSnapshot() };
      }
      if (state.activeMontageExportJobIds.length >= state.limits.montage_export) {
        return {
          ok: false,
          error: buildHeavyWorkBusyError(cleanKind, activeJobId)
        };
      }
      state.activeMontageExportJobIds.push(cleanJobId);
      syncLegacyFields();
      updateTimestamp();
      return { ok: true, state: buildStateSnapshot() };
    }
    if (cleanKind === "dialogue_video") {
      if (hasActiveJob(cleanKind, cleanJobId)) {
        return { ok: true, state: buildStateSnapshot() };
      }
      if (state.activeDialogueVideoJobIds.length >= state.limits.dialogue_video) {
        return {
          ok: false,
          error: buildHeavyWorkBusyError(cleanKind, activeJobId)
        };
      }
      state.activeDialogueVideoJobIds.push(cleanJobId);
      syncLegacyFields();
      updateTimestamp();
      return { ok: true, state: buildStateSnapshot() };
    }
    return {
      ok: false,
      error: buildHeavyWorkBusyError(cleanKind, activeJobId)
    };
  };

  const releaseHeavyWorkSlot = (kind = "", jobId = "") => {
    const cleanKind = String(kind || "").trim();
    const cleanJobId = String(jobId || "").trim();
    if (cleanKind === "montage_export" && hasActiveJob(cleanKind, cleanJobId)) {
      state.activeMontageExportJobIds = state.activeMontageExportJobIds.filter((activeJobId) => activeJobId !== cleanJobId);
      syncLegacyFields();
      updateTimestamp();
      return true;
    }
    if (cleanKind === "dialogue_video" && hasActiveJob(cleanKind, cleanJobId)) {
      state.activeDialogueVideoJobIds = state.activeDialogueVideoJobIds.filter((activeJobId) => activeJobId !== cleanJobId);
      syncLegacyFields();
      updateTimestamp();
      return true;
    }
    return false;
  };

  return {
    state,
    buildHeavyWorkBusyError,
    getActiveJobId,
    getActiveJobIds,
    hasActiveJob,
    tryAcquireHeavyWorkSlot,
    releaseHeavyWorkSlot
  };
}

function estimateDataUrlBytes(dataUrl = "") {
  const value = String(dataUrl || "").trim();
  if (!value.startsWith("data:")) return 0;
  const commaIndex = value.indexOf(",");
  if (commaIndex < 0) return 0;
  const header = value.slice(0, commaIndex).toLowerCase();
  const payload = value.slice(commaIndex + 1);
  if (!payload) return 0;
  if (!header.includes(";base64")) return Buffer.byteLength(payload, "utf8");
  const sanitized = payload.replace(/\s+/g, "");
  const padding = sanitized.endsWith("==") ? 2 : sanitized.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((sanitized.length * 3) / 4) - padding);
}

function normalizeInlineDataUrl(value = "") {
  const clean = String(value || "").trim();
  return clean.startsWith("data:") ? clean : "";
}

function validateDialogueVideoInlineReferenceBudget(body = {}) {
  const rawImages = Array.isArray(body?.referenceImageDataUrls) ? body.referenceImageDataUrls : [];
  const singleImageFallback = normalizeInlineDataUrl(body?.referenceImageDataUrl || "");
  const seenReferenceImages = new Set();
  const referenceImageDataUrls = [...rawImages, singleImageFallback]
    .map((item) => normalizeInlineDataUrl(item))
    .filter(Boolean)
    .filter((item) => {
      if (seenReferenceImages.has(item)) return false;
      seenReferenceImages.add(item);
      return true;
    })
    .slice(0, DIALOGUE_VIDEO_MAX_REFERENCE_IMAGE_COUNT);
  const referenceVideoDataUrl = normalizeInlineDataUrl(body?.referenceVideoDataUrl || "");
  const continuityReferenceImageDataUrl = normalizeInlineDataUrl(body?.continuityReferenceImageDataUrl || "");
  const totalInlineBytes = [
    ...referenceImageDataUrls,
    referenceVideoDataUrl,
    continuityReferenceImageDataUrl
  ].reduce((sum, item) => sum + estimateDataUrlBytes(item), 0);

  if (totalInlineBytes > DIALOGUE_VIDEO_INLINE_REFERENCE_BUDGET_BYTES) {
    const error = new Error("dialogue_video_reference_budget_exceeded");
    error.code = "payload_too_large";
    error.status = 413;
    error.detail = {
      error: "dialogue_video_reference_budget_exceeded",
      totalInlineBytes,
      maxInlineBytes: DIALOGUE_VIDEO_INLINE_REFERENCE_BUDGET_BYTES
    };
    throw error;
  }

  return {
    referenceImageDataUrls,
    referenceVideoDataUrl: referenceVideoDataUrl ? referenceVideoDataUrl.slice(0) : "",
    continuityReferenceImageDataUrl: continuityReferenceImageDataUrl ? continuityReferenceImageDataUrl.slice(0) : "",
    totalInlineBytes,
    counts: {
      imageReferences: referenceImageDataUrls.length,
      videoReferences: referenceVideoDataUrl ? DIALOGUE_VIDEO_MAX_REFERENCE_VIDEO_COUNT : 0,
      continuityFrames: continuityReferenceImageDataUrl ? DIALOGUE_VIDEO_MAX_CONTINUITY_FRAME_COUNT : 0
    }
  };
}

module.exports = {
  createHeavyWorkCoordinator,
  estimateDataUrlBytes,
  validateDialogueVideoInlineReferenceBudget,
  DIALOGUE_VIDEO_MAX_REFERENCE_IMAGE_COUNT,
  DIALOGUE_VIDEO_MAX_REFERENCE_VIDEO_COUNT,
  DIALOGUE_VIDEO_MAX_CONTINUITY_FRAME_COUNT,
  DIALOGUE_VIDEO_INLINE_REFERENCE_BUDGET_BYTES
};
