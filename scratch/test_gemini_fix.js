
const STUDIO_GEMINI_SCENE_DELAY_MS = 0;
const STUDIO_TIMELINE_MIN_CLIP_MS = 100;

function toFiniteNumber(value, fallback = 0) {
  const num = Number.parseFloat(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeGeminiDialogueTrackSegment(raw = {}, index = 0) {
  const startMs = Math.max(0, Math.round(toFiniteNumber(raw.startMs, 0)));
  const anchorStartMs = raw.anchorStartMs != null ? Math.max(0, Math.round(toFiniteNumber(raw.anchorStartMs, startMs))) : undefined;
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
    
    // THE FIX: Prefer delayedStartMsDefault over existingSegment.startMs as fallback for anchor
    const existingAnchorStartMs = existingSegment
      ? Math.max(0, Math.round(Number(existingSegment.anchorStartMs ?? delayedStartMsDefault ?? existingSegment.startMs) || 0))
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

console.log("--- Test: Missing Anchor (Fixed) ---");
let track = {
  segments: [
    { rowId: "1", startMs: 5000 } // Missing anchorStartMs
  ]
};
let runtime = [{ rowId: "1", startMs: 0 }]; // Scene at 0, default is 0

let reconciled = reconcile(track, runtime, true);
console.log("After sync:", reconciled.segments[0]);

console.log("\n--- Test: Scene Move with Manual Offset (Anchor Preserved) ---");
track = {
  segments: [
    { rowId: "1", startMs: 5000, anchorStartMs: 0 } // Manual offset of 5000
  ]
};
runtime = [{ rowId: "1", startMs: 2000 }]; // Scene moves to 2000

reconciled = reconcile(track, runtime, true);
console.log("After sync (should be 7000):", reconciled.segments[0]);
