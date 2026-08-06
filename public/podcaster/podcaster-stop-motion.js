(function initPodcasterStopMotion(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === "object") {
    root.PodcasterStopMotion = {
      ...(root.PodcasterStopMotion || {}),
      ...api
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function buildPodcasterStopMotionApi() {
  const STOP_MOTION_VERSION = 1;
  const STOP_MOTION_MAX_FRAMES = 60;
  const imagePromiseCache = new Map();

  function resolveFrameSource(frame = {}) {
    return String(
      frame?.downloadUrl
      || frame?.url
      || frame?.dataUrl
      || frame?.localDataUrl
      || ""
    ).trim();
  }

  function normalizeStopMotionFrame(raw = {}, index = 0) {
    if (!raw || typeof raw !== "object") return null;
    const downloadUrl = String(raw.downloadUrl || raw.url || "").trim();
    const storagePath = String(raw.storagePath || "").trim();
    const dataUrl = String(raw.dataUrl || raw.localDataUrl || "").trim();
    if (!downloadUrl && !storagePath && !dataUrl) return null;
    const mimeType = String(raw.mimeType || raw.contentType || "image/jpeg").trim().toLowerCase() || "image/jpeg";
    if (!mimeType.startsWith("image/")) return null;
    return {
      id: String(raw.id || `frame-${index + 1}`).trim() || `frame-${index + 1}`,
      order: index,
      name: String(raw.name || raw.fileName || `Imagen ${index + 1}`).trim() || `Imagen ${index + 1}`,
      mimeType,
      downloadUrl,
      storagePath,
      ...(dataUrl ? { dataUrl } : {})
    };
  }

  function normalizeStopMotion(raw = null) {
    const source = raw && typeof raw === "object" ? raw : null;
    if (!source) return null;
    const frames = (Array.isArray(source.frames) ? source.frames : [])
      .slice(0, STOP_MOTION_MAX_FRAMES)
      .map((frame, index) => normalizeStopMotionFrame(frame, index))
      .filter(Boolean)
      .map((frame, index) => ({ ...frame, order: index }));
    if (frames.length < 2) return null;
    const requestedTimingMode = String(source.timingMode || "fit-scene").trim().toLowerCase();
    const beatPositions = (Array.isArray(source.beatPositions) ? source.beatPositions : [])
      .slice(0, frames.length)
      .map(Number)
      .filter(Number.isFinite);
    const hasValidBeatPositions = beatPositions.length === frames.length
      && beatPositions[0] === 0
      && beatPositions.every((value, index) => (
        value >= 0
        && value < 1
        && (index === 0 || value > beatPositions[index - 1])
      ));
    const timingMode = requestedTimingMode === "music-beat" && hasValidBeatPositions
      ? "music-beat"
      : "fit-scene";
    return {
      version: STOP_MOTION_VERSION,
      timingMode,
      ...(timingMode === "music-beat" ? {
        beatPositions,
        beatAnalysisVersion: Math.max(1, Math.round(Number(source.beatAnalysisVersion || 1) || 1))
      } : {}),
      frames
    };
  }

  function resolveStopMotionIntervalMs(durationMs = 0, frameCount = 0) {
    const safeDurationMs = Math.max(1, Number(durationMs || 0) || 1);
    const safeFrameCount = Math.max(1, Math.round(Number(frameCount || 0) || 1));
    return safeDurationMs / safeFrameCount;
  }

  function resolveStopMotionFrameIndex(localMs = 0, durationMs = 0, frameCount = 0, beatPositions = null) {
    const count = Math.max(0, Math.round(Number(frameCount || 0) || 0));
    if (!count) return -1;
    const safeDurationMs = Math.max(1, Number(durationMs || 0) || 1);
    const clampedLocalMs = Math.max(0, Math.min(safeDurationMs, Number(localMs || 0) || 0));
    if (clampedLocalMs >= safeDurationMs) return count - 1;
    const normalizedPositions = Array.isArray(beatPositions) && beatPositions.length === count
      ? beatPositions
      : null;
    if (normalizedPositions) {
      const progress = clampedLocalMs / safeDurationMs;
      let resolved = 0;
      for (let index = 1; index < normalizedPositions.length; index += 1) {
        if (progress < normalizedPositions[index]) break;
        resolved = index;
      }
      return Math.max(0, Math.min(count - 1, resolved));
    }
    return Math.max(0, Math.min(count - 1, Math.floor((clampedLocalMs / safeDurationMs) * count)));
  }

  function resolveStopMotionFrame(raw = null, localMs = 0, durationMs = 0) {
    const stopMotion = normalizeStopMotion(raw);
    if (!stopMotion) return null;
    const index = resolveStopMotionFrameIndex(
      localMs,
      durationMs,
      stopMotion.frames.length,
      stopMotion.timingMode === "music-beat" ? stopMotion.beatPositions : null
    );
    return index >= 0 ? { ...stopMotion.frames[index], index } : null;
  }

  function preloadStopMotionFrame(frame = {}) {
    const source = resolveFrameSource(frame);
    if (!source || typeof Image === "undefined") return Promise.resolve(source);
    if (imagePromiseCache.has(source)) return imagePromiseCache.get(source);
    const task = new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      try { image.crossOrigin = "anonymous"; } catch (_) { }
      image.onload = () => resolve(source);
      image.onerror = () => {
        imagePromiseCache.delete(source);
        reject(new Error(`stop_motion_frame_load_failed:${String(frame?.name || source).trim()}`));
      };
      image.src = source;
    });
    imagePromiseCache.set(source, task);
    return task;
  }

  function preloadStopMotion(raw = null) {
    const stopMotion = normalizeStopMotion(raw);
    if (!stopMotion) return Promise.resolve([]);
    return Promise.all(stopMotion.frames.map((frame) => preloadStopMotionFrame(frame)));
  }

  function clearPreloadCache() {
    imagePromiseCache.clear();
    return true;
  }

  return {
    STOP_MOTION_VERSION,
    STOP_MOTION_MAX_FRAMES,
    normalizeStopMotionFrame,
    normalizeStopMotion,
    resolveFrameSource,
    resolveStopMotionIntervalMs,
    resolveStopMotionFrameIndex,
    resolveStopMotionFrame,
    preloadStopMotionFrame,
    preloadStopMotion,
    clearPreloadCache
  };
});
