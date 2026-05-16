import { readFileSync } from "node:fs";

const front = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const playback = readFileSync(new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url), "utf8");

if (!/if \(event\.metaKey \|\| event\.ctrlKey \|\| event\.altKey \|\| event\.shiftKey\) return;/.test(front)) {
  throw new Error("Los shortcuts globales del reproductor deben ignorar combinaciones con modificadores.");
}

if (!/pause\(\) \{[\s\S]*Object\.values\(this\.dialoguePlayers\)\.forEach\(audio => \{[\s\S]*audio\.pause\(\);[\s\S]*\}\);[\s\S]*this\.pauseBackgroundMusic\(\);[\s\S]*if \(this\.mse\?\.engine\) this\.mse\.engine\.pause\(\);/m.test(playback)) {
  throw new Error("La pausa del montaje debe centralizar el apagado de Gemini, fondo y cualquier engine activo en el controlador vivo.");
}

if (!/pause\(\) \{[\s\S]*this\.deps\?\.updatePodcastVideoTransportUi\?\.\(\);/m.test(playback)) {
  throw new Error("La pausa del controlador debe refrescar la UI del transporte al final.");
}

console.log("Podcast player shortcuts and pause OK.");
