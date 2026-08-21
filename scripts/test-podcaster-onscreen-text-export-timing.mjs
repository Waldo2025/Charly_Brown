import { readFileSync } from "node:fs";

const exportSource = readFileSync(new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url), "utf8");
const podcasterSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const timingSource = readFileSync(new URL("../public/podcaster/podcaster-montage-audio-timing.js", import.meta.url), "utf8");

if (!/function clampMontageOnScreenTextSegmentsToSceneWindows\(/.test(exportSource)) {
  throw new Error("El export debe recortar texto en pantalla al rango real de su escena.");
}

if (!/const sceneBoundedSegments = clampMontageOnScreenTextSegmentsToSceneWindows\(nextTimeline\.segments, validEntries\);[\s\S]*clampMontageOnScreenTextSegmentsToGeminiTimeline\(sceneBoundedSegments, geminiTimelineSegments\)/.test(exportSource)) {
  throw new Error("El export debe aplicar primero la ventana de escena y luego la ventana Gemini.");
}

if (!/if \(\(endMs - startMs\) < STUDIO_TIMELINE_MIN_CLIP_MS\) return null;/.test(exportSource)) {
  throw new Error("El export no debe re-alargar colas de texto menores al mínimo técnico.");
}

if (!exportSource.includes("resolveGeminiAudioTimelineDurationMs({")
  || !timingSource.includes("remainingSourceMs")
  || !timingSource.includes("remainingSourceMs / rate")) {
  throw new Error("La duración Gemini del payload debe usar la duración real restante y playbackRate.");
}

const previewGeminiDurationBlock = podcasterSource.match(/function resolveGeminiDialogueSegmentTimelineDurationMs\(segment = null, playbackRate = 1\) \{[\s\S]*?\n\}/)?.[0] || "";
if (!previewGeminiDurationBlock.includes("trimOutMs > trimInMs")
  || !previewGeminiDurationBlock.includes("resolveRowAudioDurationMs")
  || !previewGeminiDurationBlock.includes("measuredAudioVisibleMs")) {
  throw new Error("Los segmentos de texto del montaje deben usar la misma duración efectiva de Gemini y la medición real del audio.");
}

console.log("Podcaster on-screen text export timing contract OK.");
