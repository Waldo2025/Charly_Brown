export function resolveGeminiAudioTimelineDurationMs({
  sourceDurationMs = 0,
  trimInMs = 0,
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

  if (sourceMs > 0) {
    const remainingSourceMs = Math.max(0, sourceMs - sourceTrimInMs);
    return Math.max(minimumMs, Math.round(remainingSourceMs / rate));
  }

  const rawStartMs = Number(startMs || 0);
  const safeStartMs = Number.isFinite(rawStartMs) ? Math.round(rawStartMs) : 0;
  const declaredMs = Math.round(
    Number(persistedDurationMs || 0)
    || (Number(persistedEndMs || 0) - safeStartMs)
    || minimumMs
  );
  return Math.max(minimumMs, declaredMs);
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
