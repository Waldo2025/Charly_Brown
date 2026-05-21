import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

if (!/const STUDIO_GEMINI_SCENE_DELAY_MS = 0;/.test(source)) {
  throw new Error("Gemini no debe aplicar un retraso fijo de 1 segundo por defecto.");
}

const fnMatch = source.match(
  /function resolveGeminiSegmentStartWithinScene\(sceneStartMs = 0, sceneDurationMs = STUDIO_TIMELINE_MIN_CLIP_MS, durationMs = STUDIO_TIMELINE_MIN_CLIP_MS\) \{[\s\S]*?return Math\.max\(0, safeSceneStartMs \+ offsetMs \+ STUDIO_GEMINI_SCENE_DELAY_MS\);[\s\S]*?\}/m
);

if (!fnMatch) {
  throw new Error("No se encontró resolveGeminiSegmentStartWithinScene.");
}

console.log("Gemini default delay removed OK.");
