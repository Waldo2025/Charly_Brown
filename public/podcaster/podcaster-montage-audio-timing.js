export function resolveGeminiAudioTimelineDurationMs({
  sourceDurationMs = 0,
  trimInMs = 0,
  trimOutMs = 0,
  persistedDurationMs = 0,
  persistedEndMs = 0,
  startMs = 0,
  playbackRate = 1,
  minDurationMs = 500
} = {}) {
  const minimumMs = Math.max(1, Math.round(Number(minDurationMs || 0) || 1));
  const rate = Math.max(0.5, Math.min(10, Number(playbackRate || 1) || 1));
  const sourceMs = Math.max(0, Math.round(Number(sourceDurationMs || 0) || 0));
  const sourceTrimInMs = Math.max(0, Math.round(Number(trimInMs || 0) || 0));

  const declaredMs = Number(persistedDurationMs) || (Number(persistedEndMs) - Number(startMs)) || 0;
  const trimmedMs = Number(trimOutMs) > sourceTrimInMs ? (Number(trimOutMs) - sourceTrimInMs) / rate : 0;
  const availableMs = sourceMs > 0 ? Math.max(0, sourceMs - sourceTrimInMs) / rate : Infinity;
  const authoredMs = trimmedMs || declaredMs || availableMs;
  return Math.max(1, Math.round(Math.min(Number.isFinite(authoredMs) ? authoredMs : minimumMs, availableMs)));

}

export function resolveGeminiAudioTrimOutMs({
  trimInMs = 0,
  timelineDurationMs = 0,
  playbackRate = 1,
  sourceDurationMs = 0
} = {}) {
  const sourceTrimInMs = Math.max(0, Math.round(Number(trimInMs || 0) || 0));
  const rate = Math.max(0.5, Math.min(10, Number(playbackRate || 1) || 1));
  const visibleSourceMs = Math.max(0, Math.round(Number(timelineDurationMs || 0) * rate));
  const calculatedTrimOutMs = sourceTrimInMs + visibleSourceMs;
  const sourceMs = Math.max(0, Math.round(Number(sourceDurationMs || 0) || 0));
  return sourceMs > 0
    ? Math.min(sourceMs, calculatedTrimOutMs)
    : calculatedTrimOutMs;
}

export function reconcileGeminiAudioSegmentTiming({
  segment = {},
  sourceDurationMs = 0,
  playbackRate = 1,
  minDurationMs = 500
} = {}) {
  const rawStartMs = Number(segment?.startMs || 0);
  const startMs = Number.isFinite(rawStartMs) ? Math.round(rawStartMs) : 0;
  const trimInMs = Math.max(0, Math.round(Number(segment?.trimInMs || 0) || 0));
  const durationMs = resolveGeminiAudioTimelineDurationMs({
    sourceDurationMs,
    trimInMs,
    trimOutMs: segment?.trimOutMs,
    persistedDurationMs: segment?.durationMs,
    persistedEndMs: segment?.endMs,
    startMs,
    playbackRate,
    minDurationMs
  });
  const trimOutMs = resolveGeminiAudioTrimOutMs({
    trimInMs,
    timelineDurationMs: durationMs,
    playbackRate,
    sourceDurationMs
  });
  return {
    ...segment,
    startMs,
    endMs: startMs + durationMs,
    durationMs,
    trimInMs,
    trimOutMs,
    playbackRate: Math.max(0.5, Math.min(10, Number(playbackRate || 1) || 1))
  };
}

// Source trims are milliseconds in the file; durationMs/endMs are timeline time.
// A position edit never changes which portion of the source is selected.
export function reconcileGeminiVoiceSource({ segment = {}, sourceDurationMs = 0, playbackRate = 1 } = {}) {
  const sourceMs = Math.max(0, Math.round(Number(sourceDurationMs) || 0));
  const explicitTrim = segment.durationMode === "trim" || segment.manualTrim === true
    || segment.manualTrimIn === true || segment.manualTrimOut === true || Number(segment.trimInMs) > 0;
  // Old Snoopy-generated segments have an anchor and store duration == trimOut,
  // including after speed edits. There is no Gemini end-trim handle in that UI.
  // Keep unrecognized/imported windows and all explicit source trims intact.
  const legacyAutomatic = segment.durationMode == null && segment.anchorStartMs != null
    && Number(segment.trimInMs || 0) === 0
    && Math.abs(Number(segment.durationMs) - Number(segment.trimOutMs)) <= 1;
  const sourceBound = !explicitTrim && (segment.durationMode === "source" || legacyAutomatic);
  const next = sourceBound && sourceMs > 0
    ? { ...segment, durationMode: "source", trimInMs: 0, trimOutMs: sourceMs }
    : segment;
  return reconcileGeminiAudioSegmentTiming({ segment: next, sourceDurationMs: sourceMs, playbackRate });
}
