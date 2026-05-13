import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster.js", import.meta.url), "utf8");

if (!/function normalizeLegacyGeminiTrackOffsets\(session = null\)/.test(source)) {
  throw new Error("Debe existir normalizeLegacyGeminiTrackOffsets.");
}

if (!/function hasManualGeminiSegmentOffset\(segment = null, fallbackAnchorMs = 0, toleranceMs = STUDIO_TIMELINE_SNAP_MS\)/.test(source)) {
  throw new Error("La normalización y reconciliación deben compartir un helper de offset manual.");
}

if (!/\/\/ normalizeLegacyGeminiTrackOffsets\(nextSession\);/.test(source)) {
  throw new Error("La carga de sesión no debe reactivar la normalización legacy automáticamente.");
}

if (!/\/\/ applyGeminiSubtitleInsetForReorderedTimeline\(nextSession, STUDIO_REORDER_SUBTITLE_INSET_PX\);/.test(source)) {
  throw new Error("La carga de sesión no debe volver a insetear Gemini automáticamente.");
}

console.log("Gemini legacy offset normalization OK.");
