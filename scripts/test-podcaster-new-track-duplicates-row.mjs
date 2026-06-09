import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const interactionSource = readFileSync(new URL("../public/podcaster/podcaster-timeline-interaction.js", import.meta.url), "utf8");

if (!source.includes("function duplicateSceneRowsIntoNewTrack(")) {
  throw new Error("Falta el helper para duplicar escenas al crear un track nuevo.");
}

const finalizeMatch = interactionSource.match(
  /function finalizeClipDrag\(\) \{[\s\S]*?if \(!targetTrackId && targetDropIndex === null\) return;[\s\S]*?upsertPodcastVideoConfig\(/m
);

if (!finalizeMatch) {
  throw new Error("No se encontró el bloque de finalizeClipDrag para validar el comportamiento.");
}

if (!finalizeMatch[0].includes("duplicateSceneRowsIntoNewTrack(groupIds, targetDropIndex);")) {
  throw new Error("Crear un track nuevo debe duplicar la escena en un row nuevo del timeline.");
}

console.log("New-track duplication flow OK.");
