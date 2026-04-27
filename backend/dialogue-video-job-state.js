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
  if (source.error && typeof source.error === "object") payload.error = source.error;
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
  sanitizeDialogueVideoJobPublicPayload
};
