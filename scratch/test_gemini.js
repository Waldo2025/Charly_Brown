
const STUDIO_GEMINI_SCENE_DELAY_MS = 0;
const STUDIO_TIMELINE_MIN_CLIP_MS = 100;

function toFiniteNumber(value, fallback = 0) {
  const num = Number.parseFloat(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeGeminiDialogueTrackSegment(raw = {}, index = 0) {
  const startMs = Math.max(0, Math.round(toFiniteNumber(raw.startMs, 0)));
  const anchorStartMs = Math.max(0, Math.round(toFiniteNumber(raw.anchorStartMs, startMs)));
  const durationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Math.round(toFiniteNumber(raw.durationMs, 1000)));
  return {
    rowId: raw.rowId,
    startMs,
    anchorStartMs,
    durationMs,
    endMs: startMs + durationMs
  };
}

function resolveGeminiSegmentStartWithinScene(sceneStartMs = 0) {
  return Math.max(0, sceneStartMs + STUDIO_GEMINI_SCENE_DELAY_MS);
}

function reconcile(existingTrack, runtimeEntries, preserveStartMs = true) {
  const existingByRowId = new Map(existingTrack.segments.map(s => [s.rowId, s]));
  
  const nextSegments = runtimeEntries.map(entry => {
    const rowId = entry.rowId;
    const sceneStartMs = entry.startMs;
    const existingSegment = existingByRowId.get(rowId) || null;
    
    const delayedStartMsDefault = resolveGeminiSegmentStartWithinScene(sceneStartMs);
    const existingAnchorStartMs = existingSegment
      ? Math.max(0, Math.round(Number(existingSegment.anchorStartMs ?? existingSegment.startMs ?? delayedStartMsDefault) || 0))
      : delayedStartMsDefault;
      
    const deltaSceneStartMs = delayedStartMsDefault - existingAnchorStartMs;
    
    const startMs = (preserveStartMs && existingSegment)
      ? Math.max(0, Math.round(Number(existingSegment.startMs || 0) + deltaSceneStartMs))
      : delayedStartMsDefault;
      
    return normalizeGeminiDialogueTrackSegment({
      rowId,
      startMs,
      anchorStartMs: delayedStartMsDefault
    });
  });
  
  return { segments: nextSegments };
}

// Test case: Move chip manually
console.log("--- Test: Manual Move ---");
let track = {
  segments: [
    normalizeGeminiDialogueTrackSegment({ rowId: "1", startMs: 1000, anchorStartMs: 1000 })
  ]
};
let runtime = [{ rowId: "1", startMs: 0 }]; // Scene at 0, default is 0 (delay is 0)
// Initial state: chip at 1000, anchor at 1000 (manually moved?)
// Wait, if delay is 0, default is 0. So it was already moved by 1000.

// User moves chip to 5000
track.segments[0].startMs = 5000;
// Note: onTimelinePointerMove DOES NOT update anchorStartMs.

let reconciled = reconcile(track, runtime, true);
console.log("After sync:", reconciled.segments[0]);

// Test case: Missing anchor
console.log("\n--- Test: Missing Anchor ---");
track = {
  segments: [
    { rowId: "1", startMs: 5000 } // Missing anchorStartMs
  ]
};
// Normalize it first (as syncGeminiDialogueTrackWithRuntime does)
track.segments = track.segments.map(s => normalizeGeminiDialogueTrackSegment(s));
console.log("Before sync (normalized):", track.segments[0]);

reconciled = reconcile(track, runtime, true);
console.log("After sync (RESET!):", reconciled.segments[0]);
