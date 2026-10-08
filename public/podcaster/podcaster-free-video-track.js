const MIN_MS = 500;
const MAX_MS = 3_600_000;
const ms = (value, fallback = 0) => Math.max(0, Math.min(MAX_MS, Math.round(Number(value) || fallback)));

export function normalizeFreeVideoTrack(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const seen = new Set();
  const volumePct = Math.max(0, Math.min(100, Math.round(Number(source.volumePct ?? 0) || 0)));
  const clips = (Array.isArray(source.clips) ? source.clips : []).slice(0, 200).map((item) => {
    const id = String(item?.id || "").trim().slice(0, 120);
    const storagePath = String(item?.storagePath || "").trim().slice(0, 900);
    const downloadUrl = String(item?.downloadUrl || item?.url || item?.localDataUrl || "").trim().slice(0, 3200);
    if (!id || seen.has(id) || (!storagePath && !downloadUrl)) return null;
    seen.add(id);
    const effectiveStoragePath = storagePath || `local://free-video/${id}`;
    const sourceDurationMs = Math.max(MIN_MS, ms(item.sourceDurationMs, MIN_MS));
    const trimInMs = Math.min(sourceDurationMs - MIN_MS, ms(item.trimInMs));
    const trimOutMs = Math.max(trimInMs + MIN_MS, Math.min(sourceDurationMs, ms(item.trimOutMs, sourceDurationMs)));
    return {
      id, name: String(item.name || "Video").trim().slice(0, 180) || "Video",
      storagePath: effectiveStoragePath, downloadUrl,
      mimeType: String(item.mimeType || "video/mp4").trim().slice(0, 120),
      sourceDurationMs, startMs: ms(item.startMs), trimInMs, trimOutMs,
      visualLayoutMode: item.visualLayoutMode === "blur-backdrop" ? "blur-backdrop" : "default",
      mediaMotionPreset: ["none", "pan-left-right", "pan-right-left", "pan-up-down", "pan-down-up"].includes(item.mediaMotionPreset) ? item.mediaMotionPreset : "none",
      isLoading: item.isLoading === true
    };
  }).filter(Boolean);
  return { added: source.added === true || clips.length > 0, enabled: source.enabled !== false, volumePct, clips };
}

export function appendFreeVideoClip(track, media, durationMs, id) {
  const current = normalizeFreeVideoTrack(track);
  const endMs = current.clips.reduce((max, clip) => Math.max(max, clip.startMs + clip.trimOutMs - clip.trimInMs), 0);
  return normalizeFreeVideoTrack({ ...current, added: true, clips: [...current.clips, {
    id, name: media.name, storagePath: media.storagePath, downloadUrl: media.downloadUrl,
    mimeType: media.mimeType, sourceDurationMs: durationMs, startMs: endMs,
    trimInMs: 0, trimOutMs: durationMs,
    isLoading: media.isLoading === true
  }] });
}

export function freeVideoExportEntries(track) {
  const normalized = normalizeFreeVideoTrack(track);
  if (!normalized.enabled) return [];
  const volumePct = Math.max(0, Math.min(100, Math.round(Number(normalized.volumePct ?? 100) || 0)));
  const useNativeVideoAudio = volumePct > 0;
  return normalized.clips.map((clip, index) => {
    const durationMs = clip.trimOutMs - clip.trimInMs;
    return {
      rowId: `free-video-${clip.id}`, sceneIndex: index + 1, sceneLabel: clip.name,
      timelineStartMs: clip.startMs, timelineEndMs: clip.startMs + durationMs,
      freeVideoOverlay: true,
      durationMs, trimInMs: clip.trimInMs, sourceDurationMs: clip.sourceDurationMs,
      zIndex: 10000 + index, visualLayoutMode: clip.visualLayoutMode,
      mediaMotionPreset: clip.mediaMotionPreset,
      video: { storagePath: clip.storagePath, url: clip.downloadUrl, downloadUrl: clip.downloadUrl, mimeType: clip.mimeType, type: "video", mediaKind: "video" },
      audio: null, useNativeVideoAudio, veoVolumeOverridePct: volumePct, geminiVolumeOverridePct: 0
    };
  });
}

export function freeVideoExportAudioSegments(track) {
  const normalized = normalizeFreeVideoTrack(track);
  if (!normalized.enabled || normalized.volumePct <= 0) return [];
  return normalized.clips.map((clip) => ({
    kind: "free-video-audio",
    id: `free-video-audio-${clip.id}`,
    rowId: "",
    url: clip.downloadUrl || clip.storagePath,
    downloadUrl: clip.downloadUrl,
    storagePath: clip.storagePath,
    mimeType: clip.mimeType,
    startMs: clip.startMs,
    durationMs: clip.trimOutMs - clip.trimInMs,
    trimInMs: clip.trimInMs,
    trimOutMs: clip.trimOutMs,
    playbackRate: 1,
    volumePct: normalized.volumePct
  }));
}
