import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster.playback.js", import.meta.url), "utf8");

if (!source.includes("function selectActiveGeminiVoiceEntry(")) {
  throw new Error("Falta el selector explícito del clip activo de audio Gemini.");
}

const syncBlockMatch = source.match(
  /function syncMontageVoiceAudioEl\(activeEntries = \[\], currentMs = 0, speed = 1, runtimeEntries = \[\]\) \{[\s\S]*?const rowId = String\(selected\?\.rowId \|\| ""\)\.trim\(\);/m
);

if (!syncBlockMatch) {
  throw new Error("No se encontró el bloque de syncMontageVoiceAudioEl.");
}

const syncBlock = syncBlockMatch[0];

if (!syncBlock.includes("const selected = selectActiveGeminiVoiceEntry(voiceTimelineEntries, currentMs);")) {
  throw new Error("El audio Gemini en modo single debe seguir el clip de audio activo, no la escena visual.");
}

if (/visualVoiceEntry|resolvePrimaryVisualRowId\(activeEntries\)/.test(syncBlock)) {
  throw new Error("syncMontageVoiceAudioEl todavía prioriza la escena visual sobre el clip de audio Gemini.");
}

console.log("Gemini audio follows moved chip OK.");
