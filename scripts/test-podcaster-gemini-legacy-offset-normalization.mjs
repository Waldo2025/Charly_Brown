import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster.js", import.meta.url), "utf8");

if (!/function normalizeLegacyGeminiTrackOffsets\(session = null\)/.test(source)) {
  throw new Error("Debe existir normalizeLegacyGeminiTrackOffsets.");
}

if (!/currentStartMs === snapTimelineMs\(sceneStartMs \+ legacyDelayMs\)/.test(source)) {
  throw new Error("La normalización debe detectar el delay legado de 1 segundo.");
}

if (!/startMs: sceneStartMs,\s*anchorStartMs: sceneStartMs,\s*endMs: sceneStartMs \+ durationMs/s.test(source)) {
  throw new Error("La normalización debe volver a pegar audio y texto al inicio real de la escena.");
}

if (!/normalizeLegacyGeminiTrackOffsets\(getActiveSession\(\)\);\s*applyGeminiSubtitleInsetForReorderedTimeline\(getActiveSession\(\), STUDIO_REORDER_SUBTITLE_INSET_PX\);/s.test(source)) {
  throw new Error("La carga de sesión debe corregir offsets legados antes de aplicar cualquier inset.");
}

console.log("Gemini legacy offset normalization OK.");
