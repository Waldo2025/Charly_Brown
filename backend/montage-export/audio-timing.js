function resolveMontageTimelineAudioPlacement({
  segmentStartMs = 0,
  segmentDurationMs = 0,
  exportStartMs = 0,
  timelineStartMs = 0,
  hasExportOffset = false,
  playbackRate = 1
} = {}) {
  const rawSegmentStartMs = Number(segmentStartMs || 0);
  const startMs = Number.isFinite(rawSegmentStartMs) ? Math.round(rawSegmentStartMs) : 0;
  const durationMs = Math.max(0, Math.round(Number(segmentDurationMs || 0) || 0));
  const mappedExportStartMs = Math.round(Number(exportStartMs || 0) || 0);
  const mappedTimelineStartMs = Math.max(0, Math.round(Number(timelineStartMs || 0) || 0));
  const adjustedStartMs = hasExportOffset
    ? mappedExportStartMs + (startMs - mappedTimelineStartMs)
    : startMs;
  const leadingTrimMs = Math.min(durationMs, Math.max(0, -adjustedStartMs));
  const rate = Math.max(0.5, Math.min(10, Number(playbackRate || 1) || 1));

  return {
    adjustedStartMs,
    startMs: Math.max(0, adjustedStartMs),
    leadingTrimMs,
    sourceLeadingTrimMs: Math.round(leadingTrimMs * rate),
    durationMs: Math.max(0, durationMs - leadingTrimMs),
    endMs: Math.max(0, adjustedStartMs) + Math.max(0, durationMs - leadingTrimMs)
  };
}

module.exports = {
  resolveMontageTimelineAudioPlacement
};
