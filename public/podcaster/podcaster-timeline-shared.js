export const TIMELINE_LOOKUP_TOLERANCE_MS = 12;

function normalizeEntryBoundary(value = 0) {
  const numeric = Number(value || 0);
  return Math.max(0, Number.isFinite(numeric) ? numeric : 0);
}

function sortEntriesByStartDescPriority(a = null, b = null) {
  const aStart = normalizeEntryBoundary(a?.startMs || 0);
  const bStart = normalizeEntryBoundary(b?.startMs || 0);
  if (aStart !== bStart) return bStart - aStart;
  const aZIndex = Math.max(0, Number(a?.zIndex || 0) || 0);
  const bZIndex = Math.max(0, Number(b?.zIndex || 0) || 0);
  if (aZIndex !== bZIndex) return bZIndex - aZIndex;
  return 0;
}

function resolveToleranceMs(provided = TIMELINE_LOOKUP_TOLERANCE_MS) {
  const numeric = Number(provided || TIMELINE_LOOKUP_TOLERANCE_MS);
  if (Number.isFinite(numeric) && numeric >= 0) return Math.max(0, Math.floor(numeric));
  return TIMELINE_LOOKUP_TOLERANCE_MS;
}

function normalizeEntryWindow(entry = null) {
  const startMs = normalizeEntryBoundary(entry?.startMs || 0);
  const endMs = Math.max(startMs, normalizeEntryBoundary(entry?.endMs || 0));
  return { startMs, endMs };
}

export function resolveTimelineIndexAtMs(entries = [], currentMs = 0, options = {}) {
  const list = Array.isArray(entries) ? entries : [];
  const targetMs = normalizeEntryBoundary(currentMs);
  const toleranceMs = resolveToleranceMs(options?.toleranceMs);

  const strictMatchIndex = list.findIndex((entry) => {
    const { startMs, endMs } = normalizeEntryWindow(entry);
    return targetMs >= startMs && targetMs < endMs;
  });
  if (strictMatchIndex >= 0) return strictMatchIndex;

  const tolerantMatchIndex = list.findIndex((entry) => {
    const { startMs, endMs } = normalizeEntryWindow(entry);
    return targetMs >= (startMs - toleranceMs) && targetMs <= (endMs + toleranceMs);
  });
  if (tolerantMatchIndex >= 0) return tolerantMatchIndex;

  const nextIndex = list.findIndex((entry) => normalizeEntryBoundary(entry?.startMs || 0) >= targetMs);
  return nextIndex >= 0 ? nextIndex : Math.max(0, list.length - 1);
}

export function resolveTimelineEntryAtMs(entries = [], currentMs = 0, options = {}) {
  const list = Array.isArray(entries) ? entries : [];
  const targetMs = normalizeEntryBoundary(currentMs);
  const strictMatch = list.filter((entry) => {
    const { startMs, endMs } = normalizeEntryWindow(entry);
    return targetMs >= startMs && targetMs < endMs;
  });
  if (strictMatch.length) {
    return [...strictMatch].sort(sortEntriesByStartDescPriority)[0] || null;
  }

  const toleranceMs = resolveToleranceMs(options?.toleranceMs);
  return list
    .filter((entry) => {
      const { startMs, endMs } = normalizeEntryWindow(entry);
      return targetMs >= (startMs - toleranceMs) && targetMs <= (endMs + toleranceMs);
    })
    .sort(sortEntriesByStartDescPriority)[0] || null;
}

export function resolveTimelineEntriesAtMs(entries = [], currentMs = 0, options = {}) {
  const list = Array.isArray(entries) ? entries : [];
  const targetMs = normalizeEntryBoundary(currentMs);
  const toleranceMs = resolveToleranceMs(options?.toleranceMs);
  const videoOnly = options?.videoOnly === true;

  return list
    .filter((entry) => {
      const { startMs, endMs } = normalizeEntryWindow(entry);
      const inRange = targetMs >= (startMs - toleranceMs) && targetMs <= (endMs + toleranceMs);
      if (!inRange) return false;
      if (videoOnly && !String(entry?.videoSrc || "").trim()) return false;
      return true;
    })
    .sort((a, b) => {
      const aStart = normalizeEntryBoundary(a?.startMs || 0);
      const bStart = normalizeEntryBoundary(b?.startMs || 0);
      const aZIndex = Math.max(0, Number(a?.zIndex || 0) || 0);
      const bZIndex = Math.max(0, Number(b?.zIndex || 0) || 0);
      const aIndex = Math.max(0, Number(a?.index || 0) || 0);
      const bIndex = Math.max(0, Number(b?.index || 0) || 0);
      return aStart - bStart || aZIndex - bZIndex || aIndex - bIndex;
    });
}

export function resolveTimelineSequenceStartIndex(entries = [], startMs = 0, options = {}) {
  const index = resolveTimelineIndexAtMs(entries, startMs, options);
  if (index >= 0) return index;
  const list = Array.isArray(entries) ? entries : [];
  const targetMs = normalizeEntryBoundary(startMs);
  return list.findIndex((entry) => normalizeEntryBoundary(entry?.startMs || 0) >= targetMs) || 0;
}

export function isTimelineMsInRange(currentMs = 0, startMs = 0, endMs = 0, options = {}) {
  const targetMs = normalizeEntryBoundary(currentMs);
  const start = normalizeEntryBoundary(startMs);
  const end = Math.max(start, normalizeEntryBoundary(endMs));
  const toleranceMs = resolveToleranceMs(options?.toleranceMs);
  return targetMs >= (start - toleranceMs) && targetMs <= (end + toleranceMs);
}
