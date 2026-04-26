import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster.playback.js", import.meta.url), "utf8");

const onPlayheadMatch = source.match(
  /onPlayhead: \(ms = 0\) => \{[\s\S]*?updatePodcastVideoTransportUi\(\);/m
);

if (!onPlayheadMatch) {
  throw new Error("No se encontró el callback onPlayhead del motor MSE.");
}

const onPlayheadBlock = onPlayheadMatch[0];

if (!onPlayheadBlock.includes("syncMontageAudioPlayers(activeEntries, currentMs, speed, mseRuntimeEntries);")) {
  throw new Error("El callback onPlayhead del MSE debe resincronizar el audio Gemini con la posición actual del clip.");
}

console.log("MSE Gemini audio resync OK.");
