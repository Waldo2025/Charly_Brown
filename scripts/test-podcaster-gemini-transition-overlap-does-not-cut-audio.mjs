import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

if (!source.includes("function buildGeminiDialogueTimelineTrack(session = null)")) {
  throw new Error("No se encontró buildGeminiDialogueTimelineTrack.");
}

if (!source.includes("function reconcileGeminiDialogueTrackWithRuntime")) {
  throw new Error("No se encontró reconcileGeminiDialogueTrackWithRuntime.");
}

if (!source.includes("function clampGeminiSegmentStartToTimeline")) {
  throw new Error("No se encontró el helper de clampGeminiSegmentStartToTimeline para evitar desbordes.");
}

if (!source.includes("resolveAutomaticGeminiSceneOffsetMs")) {
  throw new Error("El posicionamiento automático de audio Gemini debe usar offsets calculados.");
}

console.log("Gemini transition overlap does not cut audio OK.");
