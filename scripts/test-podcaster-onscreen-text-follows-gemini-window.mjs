import { readFileSync } from "node:fs";

const playbackSource = readFileSync(
  new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url),
  "utf8"
);
const exportSource = readFileSync(
  new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url),
  "utf8"
);

if (!/resolveGeminiSegmentWindowForRow\(session = null, cfg = null, rowId = "", currentMs = 0\)/.test(playbackSource)) {
  throw new Error("El preview debe resolver la ventana real del chip Gemini por fila.");
}

if (!/const geminiWindow = this\.resolveGeminiSegmentWindowForRow\(session, cfg, rowId, currentMs\);/.test(playbackSource)) {
  throw new Error("syncOverlay debe consultar la ventana Gemini antes de decidir si el texto está activo.");
}

if (!/const effectiveStartMs = geminiWindow \? Math\.max\(clipStartMs, geminiWindow\.startMs\) : clipStartMs;/.test(playbackSource)
  || !/const effectiveEndMs = geminiWindow \? geminiWindow\.endMs : clipEndMs;/.test(playbackSource)) {
  throw new Error("El overlay debe mantener el texto hasta el fin real del chip Gemini.");
}

if (!/currentMs >= geminiWindow\.startMs && currentMs < geminiWindow\.endMs/.test(playbackSource)) {
  throw new Error("La fila preferida no debe mantener visible el texto fuera del chip Gemini.");
}

if (!/function clampMontageOnScreenTextSegmentsToGeminiTimeline\(segments = \[\], geminiTimelineSegments = \[\]\)/.test(exportSource)) {
  throw new Error("El export debe recortar los segmentos de texto contra la línea de audio Gemini.");
}

if (!/const sceneBoundedSegments = clampMontageOnScreenTextSegmentsToSceneWindows\(nextTimeline\.segments, validEntries\);[\s\S]*const boundedSegments = clampMontageOnScreenTextSegmentsToGeminiTimeline\(sceneBoundedSegments, geminiTimelineSegments\);/.test(exportSource)
  || !/segments: boundedSegments,/.test(exportSource)) {
  throw new Error("resolveEffectiveMontageOnScreenTextTimeline debe enviar segmentos de texto ya recortados.");
}

console.log("Podcaster onscreen text follows Gemini window OK.");
