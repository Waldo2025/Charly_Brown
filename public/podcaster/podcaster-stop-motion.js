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
  const STOP_MOTION_VERSION = 2;
  const STOP_MOTION_MAX_FRAMES = 60;
  const STOP_MOTION_MIN_FRAME_MS = 500;
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

  function uniformStopMotionWeights(count = 0) {
    const safeCount = Math.max(1, Math.round(Number(count || 0) || 0));
    return Array.from({ length: safeCount }, () => 1 / safeCount);
  }

  function normalizeStopMotionWeights(values = null, count = 0) {
    const list = Array.isArray(values) ? values : [];
    if (list.length !== count) return null;
    const nums = list.map(Number);
    if (!nums.every((value) => Number.isFinite(value) && value > 0)) return null;
    const sum = nums.reduce((total, value) => total + value, 0);
    if (!(sum > 0)) return null;
    return nums.map((value) => value / sum);
  }

  function stopMotionWeightsFromBeatPositions(beatPositions = null, count = 0) {
    const positions = Array.isArray(beatPositions) ? beatPositions : [];
    if (positions.length !== count) return null;
    const weights = positions.map((position, index) => {
      const next = index + 1 < count ? positions[index + 1] : 1;
      return Math.max(0, Number(next) - Number(position));
    });
    const sum = weights.reduce((total, value) => total + value, 0);
    if (!(sum > 0)) return null;
    return weights.map((value) => value / sum);
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
    const explicitWeights = normalizeStopMotionWeights(source.frameWeights, frames.length)
      || normalizeStopMotionWeights(source.frameDurationsMs, frames.length);
    const frameWeights = explicitWeights
      || (timingMode === "music-beat" && hasValidBeatPositions
        ? stopMotionWeightsFromBeatPositions(beatPositions, frames.length)
        : null)
      || uniformStopMotionWeights(frames.length);
    return {
      version: STOP_MOTION_VERSION,
      timingMode,
      frameWeights,
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

  function resolveStopMotionFrameIndex(localMs = 0, durationMs = 0, frameCount = 0, beatPositions = null, frameWeights = null) {
    const count = Math.max(0, Math.round(Number(frameCount || 0) || 0));
    if (!count) return -1;
    const safeDurationMs = Math.max(1, Number(durationMs || 0) || 1);
    const clampedLocalMs = Math.max(0, Math.min(safeDurationMs, Number(localMs || 0) || 0));
    if (clampedLocalMs >= safeDurationMs) return count - 1;
    const weights = normalizeStopMotionWeights(frameWeights, count);
    const normalizedPositions = Array.isArray(beatPositions) && beatPositions.length === count
      ? beatPositions
      : null;
    if (weights || normalizedPositions) {
      const progress = clampedLocalMs / safeDurationMs;
      let resolved = 0;
      if (weights) {
        let accumulated = 0;
        for (let index = 0; index < count; index += 1) {
          accumulated += weights[index];
          if (progress < accumulated) {
            resolved = index;
            break;
          }
          resolved = index;
        }
      } else {
        for (let index = 1; index < normalizedPositions.length; index += 1) {
          if (progress < normalizedPositions[index]) break;
          resolved = index;
        }
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
      stopMotion.timingMode === "music-beat" ? stopMotion.beatPositions : null,
      stopMotion.frameWeights
    );
    return index >= 0 ? { ...stopMotion.frames[index], index } : null;
  }

  function resolveStopMotionFrameDurationsMs(raw = null, durationMs = 0) {
    const stopMotion = normalizeStopMotion(raw);
    if (!stopMotion) return [];
    const safeDurationMs = Math.max(0, Number(durationMs || 0) || 0);
    return stopMotion.frameWeights.map((weight) => safeDurationMs * weight);
  }

  function reorderStopMotionFrames(raw = null, fromIndex = 0, toIndex = 0) {
    const stopMotion = normalizeStopMotion(raw);
    if (!stopMotion) return null;
    const count = stopMotion.frames.length;
    const from = Math.max(0, Math.min(count - 1, Math.round(Number(fromIndex || 0) || 0)));
    const to = Math.max(0, Math.min(count - 1, Math.round(Number(toIndex || 0) || 0)));
    if (from === to) return stopMotion;
    const frames = stopMotion.frames.slice();
    const weights = stopMotion.frameWeights.slice();
    const [movedFrame] = frames.splice(from, 1);
    const [movedWeight] = weights.splice(from, 1);
    frames.splice(to, 0, movedFrame);
    weights.splice(to, 0, movedWeight);
    return {
      ...stopMotion,
      frameWeights: weights,
      frames: frames.map((frame, index) => ({ ...frame, order: index }))
    };
  }

  function resizeStopMotionSegment(raw = null, index = 0, deltaMs = 0, durationMs = 0, minMs = STOP_MOTION_MIN_FRAME_MS) {
    const stopMotion = normalizeStopMotion(raw);
    if (!stopMotion) return null;
    const weights = stopMotion.frameWeights.slice();
    const count = weights.length;
    const safeDurationMs = Math.max(1, Number(durationMs || 0) || 1);
    const minWeight = Math.max(0.0005, Math.min(0.9, (Math.max(0, Number(minMs || 0) || 0) / safeDurationMs)));
    const target = Math.max(0, Math.min(count - 1, Math.round(Number(index || 0) || 0)));
    const partner = target < count - 1 ? target + 1 : target - 1;
    if (partner < 0 || partner >= count) return stopMotion;
    const delta = (Number(deltaMs || 0) || 0) / safeDurationMs;
    const low = minWeight - weights[target];
    const high = weights[partner] - minWeight;
    if (low > high) return stopMotion;
    const clampedDelta = Math.max(low, Math.min(delta, high));
    if (!clampedDelta) return stopMotion;
    weights[target] += clampedDelta;
    weights[partner] -= clampedDelta;
    return { ...stopMotion, frameWeights: weights };
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
    STOP_MOTION_MIN_FRAME_MS,
    normalizeStopMotionFrame,
    normalizeStopMotion,
    normalizeStopMotionWeights,
    resolveFrameSource,
    resolveStopMotionIntervalMs,
    resolveStopMotionFrameIndex,
    resolveStopMotionFrame,
    resolveStopMotionFrameDurationsMs,
    reorderStopMotionFrames,
    resizeStopMotionSegment,
    preloadStopMotionFrame,
    preloadStopMotion,
    clearPreloadCache
  };
});
