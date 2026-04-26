import { readFileSync } from "node:fs";

const front = readFileSync(new URL("../public/podcaster.js", import.meta.url), "utf8");
const playback = readFileSync(new URL("../public/podcaster.playback.js", import.meta.url), "utf8");

if (!/if \(event\.metaKey \|\| event\.ctrlKey \|\| event\.altKey \|\| event\.shiftKey\) return;/.test(front)) {
  throw new Error("Los shortcuts globales del reproductor deben ignorar combinaciones con modificadores.");
}

if (!/function pauseAllMontageMedia\(\) \{[\s\S]*stopPreviewSceneAudio\(\);[\s\S]*montageBackgroundAudio\.pause\(\);[\s\S]*podcastVideoState\.audioEl\.pause\(\);[\s\S]*video\.pause\(\);/m.test(playback)) {
  throw new Error("La pausa del montaje debe centralizar el apagado de video, Gemini y audio de fondo.");
}

if (/podcastVideoState\.mseEngineActive === true[\s\S]*updatePodcastVideoTransportUi\(\);\s*return;/.test(playback)) {
  throw new Error("La rama MSE no debe salir antes de pausar todos los medios del montaje.");
}

console.log("Podcast player shortcuts and pause OK.");
