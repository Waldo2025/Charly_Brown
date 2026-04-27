const DIALOGUE_VIDEO_MAX_REFERENCE_IMAGE_COUNT = 2;
const DIALOGUE_VIDEO_MAX_REFERENCE_VIDEO_COUNT = 1;
const DIALOGUE_VIDEO_MAX_CONTINUITY_FRAME_COUNT = 1;
const DIALOGUE_VIDEO_INLINE_REFERENCE_BUDGET_BYTES = 7 * 1024 * 1024;

function createHeavyWorkCoordinator() {
  const state = {
    activeMontageExportJobId: "",
    activeDialogueVideoJobId: "",
    lastUpdatedAt: ""
  };

  const updateTimestamp = () => {
    state.lastUpdatedAt = new Date().toISOString();
  };

  const getActiveJobId = () => String(state.activeMontageExportJobId || state.activeDialogueVideoJobId || "").trim();

  const buildHeavyWorkBusyError = (kind = "", activeJobId = "") => {
    const error = new Error("backend_busy");
    error.code = "backend_busy";
    error.status = 503;
    error.detail = {
      kind: String(kind || "").trim() || "unknown",
      activeJobId: String(activeJobId || "").trim(),
      retryable: true
    };
    return error;
  };

  const tryAcquireHeavyWorkSlot = (kind = "", jobId = "") => {
    const cleanKind = String(kind || "").trim();
    const cleanJobId = String(jobId || "").trim();
    const activeJobId = getActiveJobId();
    if (!cleanJobId) {
      return {
        ok: false,
        error: buildHeavyWorkBusyError(cleanKind, activeJobId)
      };
    }
    if (cleanKind === "montage_export") {
      if (state.activeMontageExportJobId || state.activeDialogueVideoJobId) {
        return {
          ok: false,
          error: buildHeavyWorkBusyError(cleanKind, activeJobId)
        };
      }
      state.activeMontageExportJobId = cleanJobId;
      updateTimestamp();
      return { ok: true, state: { ...state } };
    }
    if (cleanKind === "dialogue_video") {
      if (state.activeMontageExportJobId || state.activeDialogueVideoJobId) {
        return {
          ok: false,
          error: buildHeavyWorkBusyError(cleanKind, activeJobId)
        };
      }
      state.activeDialogueVideoJobId = cleanJobId;
      updateTimestamp();
      return { ok: true, state: { ...state } };
    }
    return {
      ok: false,
      error: buildHeavyWorkBusyError(cleanKind, activeJobId)
    };
  };

  const releaseHeavyWorkSlot = (kind = "", jobId = "") => {
    const cleanKind = String(kind || "").trim();
    const cleanJobId = String(jobId || "").trim();
    if (cleanKind === "montage_export" && String(state.activeMontageExportJobId || "").trim() === cleanJobId) {
      state.activeMontageExportJobId = "";
      updateTimestamp();
      return true;
    }
    if (cleanKind === "dialogue_video" && String(state.activeDialogueVideoJobId || "").trim() === cleanJobId) {
      state.activeDialogueVideoJobId = "";
      updateTimestamp();
      return true;
    }
    return false;
  };

  return {
    state,
    buildHeavyWorkBusyError,
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
  const referenceImageDataUrls = [...rawImages, singleImageFallback]
    .map((item) => normalizeInlineDataUrl(item))
    .filter(Boolean)
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
