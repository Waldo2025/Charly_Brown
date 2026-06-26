import { readFileSync } from "node:fs";

const podcasterSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const interactionSource = readFileSync(new URL("../public/podcaster/podcaster-timeline-interaction.js", import.meta.url), "utf8");

if (!/function alignOnScreenTextClipsToSceneTrack\(session = null, clipMap = \{\}\)/.test(podcasterSource)
  || !/function syncOnScreenTextClipsWithSceneTrack\(options = \{\}\)/.test(podcasterSource)) {
  throw new Error("Debe existir una sincronización de texto en pantalla anclada a escena para trims visuales.");
}

if (!/const referenceSceneStartMs = sceneStartMs - shiftSceneStartMs;[\s\S]*options\?\.isTrimStart[\s\S]*existingSegment\.startMs \|\| 0\) - referenceSceneStartMs/.test(podcasterSource)) {
  throw new Error("Gemini trim-start debe preservar offset relativo a la escena inicial, no start absoluto.");
}

if (!/const syncedText = options\.syncTextToScene === true[\s\S]*syncOnScreenTextClipsWithSceneTrack\(/.test(podcasterSource)) {
  throw new Error("syncGeminiDialogueTrackWithRuntime debe poder sincronizar texto contra escena durante trims.");
}

if (!/syncGeminiDialogueTrackWithRuntime\(\{[\s\S]*isTrimStart: dragMode === "trim-start",[\s\S]*syncTextToScene: true/.test(interactionSource)) {
  throw new Error("El final de timeline-trim-start/end debe pedir syncTextToScene para estabilizar chips ligados.");
}

console.log("Podcaster scene trim keeps linked chips stable OK.");
