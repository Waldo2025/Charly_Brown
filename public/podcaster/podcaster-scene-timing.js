import { getTransitionForEdge } from "./podcaster-scene-transition.js";

const MIN_CLIP_MS = 500;

function clampMs(value = 0) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function clampPlaybackRate(value = 1) {
  return Math.max(0.25, Math.min(4, Number(value) || 1));
}

function normalizeId(prefix = "item", index = 0) {
  return `${prefix}-${index + 1}`;
}

function clipRangeToVisible(rawStartMs = 0, rawEndMs = 0, trimInMs = 0, trimOutMs = MIN_CLIP_MS) {
  const startMs = Math.max(trimInMs, clampMs(rawStartMs));
  const endMs = Math.max(startMs, Math.min(clampMs(rawEndMs), trimOutMs));
  return endMs > startMs ? { startMs, endMs } : null;
}

export function normalizeFrameHoldsByRowId(raw = {}) {
  const next = {};
  if (!raw || typeof raw !== "object") return next;
  Object.entries(raw).forEach(([rowId, items]) => {
    const key = String(rowId || "").trim();
    if (!key || !Array.isArray(items)) return;
    const normalized = items.map((item, index) => {
      const atSourceMs = clampMs(item?.atSourceMs);
      const holdDurationMs = clampMs(item?.holdDurationMs);
      if (holdDurationMs < MIN_CLIP_MS) return null;
      return {
        id: String(item?.id || normalizeId("hold", index)).trim() || normalizeId("hold", index),
        atSourceMs,
        holdDurationMs
      };
    }).filter(Boolean).sort((a, b) => a.atSourceMs - b.atSourceMs);
    if (normalized.length) next[key] = normalized;
  });
  return next;
}

export function normalizeSpeedRangesByRowId(raw = {}) {
  const next = {};
  if (!raw || typeof raw !== "object") return next;
  Object.entries(raw).forEach(([rowId, items]) => {
    const key = String(rowId || "").trim();
    if (!key || !Array.isArray(items)) return;
    const normalized = items.map((item, index) => {
      const range = clipRangeToVisible(item?.startSourceMs, item?.endSourceMs, 0, Number.MAX_SAFE_INTEGER);
      if (!range || (range.endMs - range.startMs) < MIN_CLIP_MS) return null;
      return {
        id: String(item?.id || normalizeId("speed", index)).trim() || normalizeId("speed", index),
        startSourceMs: range.startMs,
        endSourceMs: range.endMs,
        playbackRate: clampPlaybackRate(item?.playbackRate)
      };
    }).filter(Boolean).sort((a, b) => a.startSourceMs - b.startSourceMs);
    if (normalized.length) next[key] = normalized;
  });
  return next;
}

function getVisibleSourceBounds(clip = null, sourceDurationMs = 0) {
  const maxMs = Math.max(MIN_CLIP_MS, clampMs(sourceDurationMs || clip?.sourceDurationMs || clip?.trimOutMs || clip?.durationMs || MIN_CLIP_MS));
  const trimInMs = Math.max(0, Math.min(maxMs - MIN_CLIP_MS, clampMs(clip?.trimInMs)));
  const trimOutMs = Math.max(trimInMs + MIN_CLIP_MS, Math.min(maxMs, clampMs(clip?.trimOutMs || maxMs)));
  return { trimInMs, trimOutMs, sourceDurationMs: maxMs };
}

function getNormalizedEdits(clip = null, edits = {}, sourceDurationMs = 0) {
  const bounds = getVisibleSourceBounds(clip, sourceDurationMs);
  const frameHolds = (Array.isArray(edits?.frameHolds) ? edits.frameHolds : [])
    .map((item, index) => {
      const atSourceMs = Math.max(bounds.trimInMs, Math.min(bounds.trimOutMs, clampMs(item?.atSourceMs)));
      const holdDurationMs = clampMs(item?.holdDurationMs);
      if (holdDurationMs < MIN_CLIP_MS) return null;
      return {
        id: String(item?.id || normalizeId("hold", index)).trim() || normalizeId("hold", index),
        atSourceMs,
        holdDurationMs
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.atSourceMs - b.atSourceMs);
  const speedRanges = (Array.isArray(edits?.speedRanges) ? edits.speedRanges : [])
    .map((item, index) => {
      const clipped = clipRangeToVisible(item?.startSourceMs, item?.endSourceMs, bounds.trimInMs, bounds.trimOutMs);
      if (!clipped || (clipped.endMs - clipped.startMs) < MIN_CLIP_MS) return null;
      return {
        id: String(item?.id || normalizeId("speed", index)).trim() || normalizeId("speed", index),
        startSourceMs: clipped.startMs,
        endSourceMs: clipped.endMs,
        playbackRate: clampPlaybackRate(item?.playbackRate)
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.startSourceMs - b.startSourceMs);
  return { ...bounds, frameHolds, speedRanges };
}

function buildSegmentsForEntry(clip = null, edits = {}, sourceDurationMs = 0) {
  const { trimInMs, trimOutMs, frameHolds, speedRanges, sourceDurationMs: resolvedSourceDurationMs } = getNormalizedEdits(clip, edits, sourceDurationMs);
  const boundaries = new Set([trimInMs, trimOutMs]);
  frameHolds.forEach((hold) => boundaries.add(hold.atSourceMs));
  speedRanges.forEach((range) => {
    boundaries.add(range.startSourceMs);
    boundaries.add(range.endSourceMs);
  });
  const points = [...boundaries].sort((a, b) => a - b);
  const segments = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const startSourceMs = points[index];
    const endSourceMs = points[index + 1];
    if (endSourceMs <= startSourceMs) continue;
    const speedRange = speedRanges.find((range) => startSourceMs >= range.startSourceMs && endSourceMs <= range.endSourceMs) || null;
    const playbackRate = speedRange ? speedRange.playbackRate : 1;
    segments.push({
      kind: "play",
      startSourceMs,
      endSourceMs,
      playbackRate,
      timelineDurationMs: Math.max(0, (endSourceMs - startSourceMs) / Math.max(0.0001, playbackRate))
    });
    frameHolds
      .filter((hold) => hold.atSourceMs === endSourceMs && hold.atSourceMs < trimOutMs)
      .forEach((hold) => {
        segments.push({
          kind: "hold",
          startSourceMs: hold.atSourceMs,
          endSourceMs: hold.atSourceMs,
          playbackRate: 0,
          timelineDurationMs: hold.holdDurationMs
        });
      });
  }
  return {
    trimInMs,
    trimOutMs,
    sourceDurationMs: resolvedSourceDurationMs,
    frameHolds,
    speedRanges,
    segments
  };
}

export function getSceneEffectiveDurationMs(clip = null, edits = {}, sourceDurationMs = 0) {
  const built = buildSegmentsForEntry(clip, edits, sourceDurationMs);
  const durationMs = built.segments.reduce((acc, segment) => acc + Math.max(0, Number(segment.timelineDurationMs || 0)), 0);
  return Math.max(MIN_CLIP_MS, Math.round(durationMs || 0));
}

export function resolveSceneSourceStateAtTimelineMs(entry = null, currentMs = 0) {
  if (!entry) {
    return {
      sourceMs: 0,
      isHoldActive: false,
      playbackRate: 1,
      progressMs: 0
    };
  }
  const clip = entry.clip || entry;
  const built = buildSegmentsForEntry(clip, {
    frameHolds: entry.frameHolds || entry.edits?.frameHolds || [],
    speedRanges: entry.speedRanges || entry.edits?.speedRanges || []
  }, entry.sourceDurationMs || clip?.sourceDurationMs || clip?.trimOutMs || 0);
  const relativeMs = Math.max(0, Number(currentMs || 0) - Math.max(0, Number(entry.startMs || 0)));
  let elapsedMs = 0;
  for (const segment of built.segments) {
    const segmentDurationMs = Math.max(0, Number(segment.timelineDurationMs || 0));
    if (relativeMs <= elapsedMs + segmentDurationMs || segment === built.segments[built.segments.length - 1]) {
      const offsetMs = Math.max(0, relativeMs - elapsedMs);
      if (segment.kind === "hold") {
        return {
          sourceMs: segment.startSourceMs,
          isHoldActive: true,
          playbackRate: 0,
          progressMs: relativeMs
        };
      }
      return {
        sourceMs: Math.max(
          segment.startSourceMs,
          Math.min(segment.endSourceMs, segment.startSourceMs + (offsetMs * segment.playbackRate))
        ),
        isHoldActive: false,
        playbackRate: segment.playbackRate,
        progressMs: relativeMs
      };
    }
    elapsedMs += segmentDurationMs;
  }
  return {
    sourceMs: built.trimOutMs,
    isHoldActive: false,
    playbackRate: 1,
    progressMs: relativeMs
  };
}

export function buildAugmentedTimelineRuntimeEntries(session = null, options = {}) {
  const activeSession = session || {};
  const rows = Array.isArray(activeSession?.script?.rows)
    ? activeSession.script.rows.filter(Boolean)
    : Array.isArray(activeSession?.rows)
      ? activeSession.rows.filter(Boolean)
      : [];
  const config = activeSession?.podcastVideoConfig || {};
  const clipMap = options?.clipMap || config.timelineClipsByRowId || {};
  const holdMap = normalizeFrameHoldsByRowId(config.frameHoldsByRowId || {});
  const speedMap = normalizeSpeedRangesByRowId(config.speedRangesByRowId || {});
  const entries = [];
  let cumulativeShiftMs = 0;
  rows.forEach((row, index) => {
    const rowId = String(row?.id || "").trim();
    if (!rowId) return;
    const clip = clipMap[rowId];
    if (!clip) return;
    const sourceDurationMs = Math.max(MIN_CLIP_MS, clampMs(clip?.sourceDurationMs || clip?.trimOutMs || clip?.durationMs || MIN_CLIP_MS));
    const frameHolds = holdMap[rowId] || [];
    const speedRanges = speedMap[rowId] || [];
    const baseDurationMs = Math.max(MIN_CLIP_MS, clampMs((clip?.trimOutMs || 0) - (clip?.trimInMs || 0)));
    const effectiveDurationMs = getSceneEffectiveDurationMs(clip, { frameHolds, speedRanges }, sourceDurationMs);
    const startMs = Math.max(0, clampMs(clip?.startMs) + cumulativeShiftMs);
    const endMs = startMs + effectiveDurationMs;
    const entry = {
      row,
      rowId,
      index,
      clip,
      sourceDurationMs,
      frameHolds,
      speedRanges,
      baseDurationMs,
      effectiveDurationMs,
      startMs,
      endMs
    };
    entries.push(entry);
    const nextRow = rows[index + 1] || null;
    if (!nextRow) return;
    const transition = getTransitionForEdge(activeSession, rowId, String(nextRow?.id || "").trim());
    entry.transitionOut = transition;
    const overlapMs = Math.max(0, Math.min(effectiveDurationMs, clampMs(transition?.durationMs)));
    cumulativeShiftMs += (effectiveDurationMs - baseDurationMs) - overlapMs;
  });
  return entries;
}

export function formatTrackHeadPlayheadTime(currentMs = 0, context = {}) {
  const safe = Math.max(0, Number(currentMs || 0) || 0);
  const minutes = Math.floor(safe / 60000);
  const seconds = Math.floor((safe % 60000) / 1000);
  const tenths = Math.floor((safe % 1000) / 100);
  const label = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
  if (String(context?.mode || "").trim() === "relative" && Number.isFinite(Number(context?.offsetMs))) {
    const relativeMs = Math.max(0, safe - Math.max(0, Number(context.offsetMs || 0)));
    const relativeMinutes = Math.floor(relativeMs / 60000);
    const relativeSeconds = Math.floor((relativeMs % 60000) / 1000);
    const relativeTenths = Math.floor((relativeMs % 1000) / 100);
    return `${String(relativeMinutes).padStart(2, "0")}:${String(relativeSeconds).padStart(2, "0")}.${relativeTenths}`;
  }
  return label;
}

if (typeof window !== "undefined") {
  const api = {
    normalizeFrameHoldsByRowId,
    normalizeSpeedRangesByRowId,
    getSceneEffectiveDurationMs,
    resolveSceneSourceStateAtTimelineMs,
    buildAugmentedTimelineRuntimeEntries,
    formatTrackHeadPlayheadTime
  };
  window.PodcasterSceneTiming = api;
  Object.assign(window, api);
}
