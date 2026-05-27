function extractDialogueVideoJobErrorText(value = null, fallback = "", seen = new Set()) {
  if (value == null) return String(fallback || "").trim();
  if (typeof value === "string") {
    const text = value.trim();
    return text && text !== "[object Object]" ? text : String(fallback || "").trim();
  }
  if (typeof value !== "object") {
    const text = String(value || "").trim();
    return text && text !== "[object Object]" ? text : String(fallback || "").trim();
  }
  if (seen.has(value)) return String(fallback || "").trim();
  seen.add(value);
  for (const candidate of [value?.error, value?.message, value?.detail, value?.reason, value?.code]) {
    const text = extractDialogueVideoJobErrorText(candidate, "", seen);
    if (text) return text;
  }
  try {
    const text = JSON.stringify(value);
    return text && text !== "{}" ? text : String(fallback || "").trim();
  } catch (_) {
    return String(fallback || "").trim();
  }
}

function sanitizeDialogueVideoJobError(error = null) {
  if (!error || typeof error !== "object") return null;
  const message = extractDialogueVideoJobErrorText(error, "dialogue_video_generate_failed") || "dialogue_video_generate_failed";
  const payload = {
    ...error,
    error: message
  };
  if (error.message != null) payload.message = extractDialogueVideoJobErrorText(error.message, message) || message;
  if (Number.isFinite(Number(error.status))) payload.status = Number(error.status);
  return payload;
}

function sanitizeDialogueVideoJobPublicPayload(job = null) {
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
  if (source.error && typeof source.error === "object") payload.error = sanitizeDialogueVideoJobError(source.error);
  if (source.dialogueVideo && typeof source.dialogueVideo === "object") payload.dialogueVideo = source.dialogueVideo;
  if (Number.isFinite(Number(source.segmentIndex))) payload.segmentIndex = Math.max(0, Math.round(Number(source.segmentIndex) || 0));
  if (Number.isFinite(Number(source.segmentCount))) payload.segmentCount = Math.max(0, Math.round(Number(source.segmentCount) || 0));
  if (Number.isFinite(Number(source.attempt))) payload.attempt = Math.max(0, Math.round(Number(source.attempt) || 0));
  if (source.model) payload.model = String(source.model || "").trim();
  if (source.variant) payload.variant = String(source.variant || "").trim();
  if (source.rowId) payload.rowId = String(source.rowId || "").trim();
  return payload;
}

module.exports = {
  extractDialogueVideoJobErrorText,
  sanitizeDialogueVideoJobError,
  sanitizeDialogueVideoJobPublicPayload
};
