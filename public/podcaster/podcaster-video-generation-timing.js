export const PODCASTER_GENERATED_VIDEO_DURATION_SEC = 8;
export const PODCASTER_TIMELINE_MIN_VISIBLE_MS = 500;

export function resolveGeneratedVideoDurationSec() {
  return PODCASTER_GENERATED_VIDEO_DURATION_SEC;
}

function collectVideoDurationSources(value, target = [], seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return target;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) => collectVideoDurationSources(item, target, seen));
    return target;
  }
  target.push(value);
  collectVideoDurationSources(value.primarySegment, target, seen);
  collectVideoDurationSources(value.segments, target, seen);
  collectVideoDurationSources(value.generatedVideos, target, seen);
  collectVideoDurationSources(value.video, target, seen);
  return target;
}

/**
 * Resolve the physical duration reported for a video source. This intentionally
 * accepts only video metadata aliases; timeline/audio duration is a separate
 * concern and must never be used as a substitute here.
 */
export function resolveVideoPhysicalDurationMs(...values) {
  const sources = collectVideoDurationSources(values);
  const millisecondAliases = ["mediaDurationMs", "physicalDurationMs"];
  for (const alias of millisecondAliases) {
    for (const source of sources) {
      const value = Number(source?.[alias]);
      if (Number.isFinite(value) && value > 0) return Math.round(value);
    }
  }
  const secondAliases = [
    "durationSec",
    "durationSeconds",
    "requestedDurationSeconds",
    "requestedDurationSec"
  ];
  for (const alias of secondAliases) {
    for (const source of sources) {
      const value = Number(source?.[alias]);
      if (Number.isFinite(value) && value > 0) return Math.round(value * 1000);
    }
  }
  return 0;
}

export function preserveTimelineTrimAfterVideoGeneration(
  clip,
  generatedDurationMs,
  minVisibleMs = PODCASTER_TIMELINE_MIN_VISIBLE_MS
) {
  const current = clip && typeof clip === "object" ? clip : {};
  const safeMinVisibleMs = Math.max(1, Math.round(Number(minVisibleMs) || PODCASTER_TIMELINE_MIN_VISIBLE_MS));
  const measuredMediaDurationMs = Math.max(safeMinVisibleMs, Math.round(Number(generatedDurationMs) || 0));
  const currentTrimInMs = Math.max(0, Math.round(Number(current.trimInMs) || 0));
  const hasStoredTrimOut = Number.isFinite(Number(current.trimOutMs)) && Number(current.trimOutMs) > currentTrimInMs;
  const currentTrimOutMs = hasStoredTrimOut
    ? Math.round(Number(current.trimOutMs))
    : Math.max(currentTrimInMs + safeMinVisibleMs, measuredMediaDurationMs);
  const editableSourceDurationMs = Math.max(
    safeMinVisibleMs,
    Math.round(Number(current.sourceDurationMs) || 0),
    currentTrimOutMs,
    measuredMediaDurationMs
  );
  const durationMode = String(current.durationMode || "").trim().toLowerCase() === "auto"
    ? "auto"
    : "manual";

  if (durationMode === "auto") {
    return {
      ...current,
      sourceDurationMs: measuredMediaDurationMs,
      mediaDurationMs: measuredMediaDurationMs,
      durationMode,
      trimInMs: 0,
      trimOutMs: measuredMediaDurationMs
    };
  }

  return {
    ...current,
    sourceDurationMs: editableSourceDurationMs,
    mediaDurationMs: measuredMediaDurationMs,
    durationMode,
    // Regeneration updates source metadata only. Existing timeline edits must
    // remain byte-for-byte stable, even when the new media is shorter.
    trimInMs: currentTrimInMs,
    trimOutMs: currentTrimOutMs
  };
}
