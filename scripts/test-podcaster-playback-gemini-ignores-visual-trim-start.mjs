import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster-playback-controller.js", import.meta.url), "utf8");

const syncAudioMatch = source.match(
  /async syncAudio\(currentMs, speed\) \{[\s\S]*?await this\.syncBackgroundMusic\(currentMs, speed, hasVoice\);\n  \}/m
);

if (!syncAudioMatch) {
  throw new Error("No se encontró syncAudio en PodcasterPlaybackController.");
}

const syncAudio = syncAudioMatch[0];

if (!syncAudio.includes("const segmentTrimInMs = Math.max(0, Number(segment?.trimInMs || 0));")) {
  throw new Error("syncAudio no está usando el trim propio del segmento Gemini.");
}

if (!source.includes("resolveSegmentSourceOffsetSec(currentMs, segmentStartMs, trimInMs = 0, clipPlaybackRate = 1)")) {
  throw new Error("Falta el helper que convierte tiempo del timeline en offset real del audio Gemini.");
}

if (!syncAudio.includes("const offsetSec = this.resolveSegmentSourceOffsetSec(currentMs, segment.startMs, segmentTrimInMs, clipPlaybackRate);")) {
  throw new Error("syncAudio no calcula el seek del audio Gemini usando la velocidad real del clip.");
}

if (!syncAudio.includes("audio.playbackRate = this.clampPlaybackRate(speed * clipPlaybackRate);")) {
  throw new Error("syncAudio debe aplicar la velocidad del clip Gemini con un helper centralizado.");
}

if (syncAudio.includes("clip?.trimInMs")) {
  throw new Error("syncAudio todavía usa el trim visual del clip para seek del audio Gemini.");
}

console.log("Playback Gemini audio stays aligned to chip and clip speed.");
