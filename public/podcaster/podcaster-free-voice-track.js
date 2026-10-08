export const FREE_VOICE_MIN_CLIP_MS = 100;
const MIN_CLIP_MS = FREE_VOICE_MIN_CLIP_MS;
const MAX_CLIP_MS = 3_600_000;

const clampMs = (value, fallback = 0) => Math.max(0, Math.min(MAX_CLIP_MS, Math.round(Number(value) || fallback)));

export function normalizeFreeVoiceTrack(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const seen = new Set();
  const normalizedClips = (Array.isArray(source.clips) ? source.clips : []).slice(0, 200).map((item) => {
    const id = String(item?.id || "").trim().slice(0, 120);
    const storagePath = String(item?.storagePath || "").trim().slice(0, 900);
    const downloadUrl = String(item?.downloadUrl || item?.url || item?.localDataUrl || "").trim().slice(0, 3200);
    if (!id || seen.has(id) || (!storagePath && !downloadUrl)) return null;
    seen.add(id);
    const effectiveStoragePath = storagePath || `local://free-voice/${id}`;
    const sourceDurationMs = Math.max(MIN_CLIP_MS, clampMs(item.sourceDurationMs, MIN_CLIP_MS));
    const trimInMs = Math.min(sourceDurationMs - MIN_CLIP_MS, clampMs(item.trimInMs));
    const trimOutMs = Math.max(trimInMs + MIN_CLIP_MS, Math.min(sourceDurationMs, clampMs(item.trimOutMs, sourceDurationMs)));
    return {
      id,
      name: String(item.name || "Voz").trim().slice(0, 180) || "Voz",
      storagePath: effectiveStoragePath,
      downloadUrl,
      mimeType: String(item.mimeType || "audio/mpeg").trim().slice(0, 120),
      sourceDurationMs,
      startMs: clampMs(item.startMs),
      trimInMs,
      trimOutMs,
      isLoading: item.isLoading === true,
      waveform: Array.isArray(item.waveform)
        ? item.waveform.slice(0, 180).map((value) => Math.max(0, Math.min(255, Math.round(Number(value) || 0))))
        : [],
      waveformAnalyzed: item.waveformAnalyzed === true,
      waveformVersion: Math.max(0, Math.round(Number(item.waveformVersion) || 0)),
      phraseRanges: Array.isArray(item.phraseRanges)
        ? item.phraseRanges.slice(0, 200).map((range) => [
          clampMs(Array.isArray(range) ? range[0] : range?.startMs),
          clampMs(Array.isArray(range) ? range[1] : range?.endMs)
        ]).filter(([start, end]) => end - start >= MIN_CLIP_MS)
        : []
    };
  }).filter(Boolean);
  const analyzedSources = new Set();
  const clips = normalizedClips.map((clip) => {
    const sourceKey = clip.storagePath || clip.downloadUrl;
    if (!clip.waveform.length && !clip.phraseRanges.length && !clip.waveformAnalyzed) return clip;
    if (!analyzedSources.has(sourceKey)) {
      analyzedSources.add(sourceKey);
      return clip;
    }
    // Split fragments point to one source file, so keep its comparatively large
    // waveform/silence analysis only once per source in the session document.
    return { ...clip, waveform: [], waveformAnalyzed: false, waveformVersion: 0, phraseRanges: [] };
  });
  return { added: source.added === true || clips.length > 0, enabled: source.enabled !== false, volumePct: Math.max(0, Math.min(100, Math.round(Number(source.volumePct ?? 100) || 0))), clips };
}

export function appendFreeVoiceClip(track, media, durationMs, id) {
  const current = normalizeFreeVoiceTrack(track);
  const endMs = current.clips.reduce((max, clip) => Math.max(max, clip.startMs + clip.trimOutMs - clip.trimInMs), 0);
  return normalizeFreeVoiceTrack({ ...current, enabled: true, clips: [...current.clips, {
    id, name: media.name, storagePath: media.storagePath, downloadUrl: media.downloadUrl,
    mimeType: media.mimeType, sourceDurationMs: durationMs, startMs: endMs,
    trimInMs: 0, trimOutMs: durationMs
  }] });
}

export function splitFreeVoiceClip(track, clipId, offsetMs, newId) {
  const current = normalizeFreeVoiceTrack(track);
  const index = current.clips.findIndex((clip) => clip.id === clipId);
  if (index < 0 || current.clips.length >= 200 || !newId || current.clips.some((clip) => clip.id === newId)) return current;
  const clip = current.clips[index];
  const durationMs = clip.trimOutMs - clip.trimInMs;
  const cutMs = Math.round(Number(offsetMs));
  if (!Number.isFinite(cutMs) || cutMs < MIN_CLIP_MS || durationMs - cutMs < MIN_CLIP_MS) return current;
  const sourceCutMs = clip.trimInMs + cutMs;
  const left = { ...clip, trimOutMs: sourceCutMs };
    const right = { ...clip, id: newId, startMs: clip.startMs + cutMs, trimInMs: sourceCutMs, waveform: [], waveformAnalyzed: false, waveformVersion: 0, phraseRanges: [] };
  return normalizeFreeVoiceTrack({ ...current, clips: [
    ...current.clips.slice(0, index), left, right, ...current.clips.slice(index + 1)
  ] });
}

export function splitFreeVoiceClipAtSilences(track, clipId, createId) {
  const current = normalizeFreeVoiceTrack(track);
  const index = current.clips.findIndex((clip) => clip.id === clipId);
  if (index < 0) return { track: current, splitCount: 0, removedMs: 0 };
  const clip = current.clips[index];
  const oldDurationMs = clip.trimOutMs - clip.trimInMs;
  const sourceKey = clip.storagePath || clip.downloadUrl;
  const sourceAnalysis = current.clips.find((item) => (item.storagePath || item.downloadUrl) === sourceKey && (item.phraseRanges.length || item.waveformAnalyzed));
  const ranges = (sourceAnalysis?.phraseRanges || clip.phraseRanges).map(([start, end]) => [
    Math.max(clip.trimInMs, start),
    Math.min(clip.trimOutMs, end)
  ]).filter(([start, end]) => end - start >= MIN_CLIP_MS);
  if (!ranges.length) return { track: current, splitCount: 0, removedMs: 0 };

  const availableParts = 200 - current.clips.length + 1;
  if (ranges.length > availableParts) return { track: current, splitCount: 0, removedMs: 0 };
  const parts = ranges;
  if (parts.length === 1 && parts[0][0] === clip.trimInMs && parts[0][1] === clip.trimOutMs) {
    return { track: current, splitCount: 0, removedMs: 0 };
  }

  let nextOffsetMs = 0;
  const replacements = parts.map(([start, end], partIndex) => {
    const id = partIndex === 0 ? clip.id : String(createId?.() || "").trim();
    const durationMs = end - start;
    const replacement = {
      ...clip,
      id,
      startMs: clip.startMs + nextOffsetMs,
      trimInMs: start,
      trimOutMs: end,
      waveform: partIndex === 0 ? (sourceAnalysis?.waveform || clip.waveform) : [],
      waveformAnalyzed: partIndex === 0 ? Boolean(sourceAnalysis?.waveformAnalyzed || clip.waveformAnalyzed) : false,
      waveformVersion: partIndex === 0 ? (sourceAnalysis?.waveformVersion || clip.waveformVersion) : 0,
      phraseRanges: partIndex === 0 ? (sourceAnalysis?.phraseRanges || clip.phraseRanges) : []
    };
    nextOffsetMs += durationMs;
    return replacement;
  });
  if (replacements.some((item) => !item.id) || new Set(replacements.map((item) => item.id)).size !== replacements.length) {
    return { track: current, splitCount: 0, removedMs: 0 };
  }

  const removedMs = Math.max(0, oldDurationMs - nextOffsetMs);
  const oldTimelineEndMs = clip.startMs + oldDurationMs;
  const clips = current.clips.flatMap((item, itemIndex) => {
    if (itemIndex === index) return replacements;
    const shifted = removedMs > 0 && item.startMs >= oldTimelineEndMs
      ? { ...item, startMs: Math.max(0, item.startMs - removedMs) }
      : item;
    return [shifted];
  });
  return {
    track: normalizeFreeVoiceTrack({ ...current, clips }),
    splitCount: Math.max(0, replacements.length - 1),
    removedMs
  };
}

export function splitFreeVoiceTrackAtSilences(track, createId) {
  let current = normalizeFreeVoiceTrack(track);
  let splitCount = 0;
  let removedMs = 0;
  const clipIds = current.clips.map((clip) => clip.id);
  for (const clipId of clipIds) {
    const result = splitFreeVoiceClipAtSilences(current, clipId, createId);
    current = result.track;
    splitCount += result.splitCount;
    removedMs += result.removedMs;
  }
  return { track: current, splitCount, removedMs };
}

export function freeVoiceExportSegments(track) {
  const normalized = normalizeFreeVoiceTrack(track);
  if (!normalized.enabled || normalized.volumePct <= 0) return [];
  return normalized.clips.map((clip) => ({
    kind: "free-voice", id: clip.id, rowId: "", url: clip.downloadUrl || clip.storagePath,
    downloadUrl: clip.downloadUrl, storagePath: clip.storagePath, mimeType: clip.mimeType,
    startMs: clip.startMs, durationMs: clip.trimOutMs - clip.trimInMs,
    trimInMs: clip.trimInMs, trimOutMs: clip.trimOutMs, playbackRate: 1,
    volumePct: normalized.volumePct
  }));
}
