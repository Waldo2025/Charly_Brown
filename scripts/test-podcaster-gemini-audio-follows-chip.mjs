import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url), "utf8");

if (!source.includes("const audioTrack = config.geminiDialogueTrack || { segments: [], enabled: true };")) {
  throw new Error("El controlador vivo debe resolver el track Gemini desde geminiDialogueTrack.");
}

const syncBlockMatch = source.match(/async syncAudio\(currentMs, speed\) \{[\s\S]*?await this\.syncBackgroundMusic\(currentMs, speed, hasVoice\);\s*\}/m);
if (!syncBlockMatch) {
  throw new Error("No se encontró el bloque syncAudio del controlador vivo.");
}
const syncBlock = syncBlockMatch[0];

if (!syncBlock.includes("const activeSegments = segments.filter(s => currentMs >= s.startMs && currentMs < (s.startMs + s.durationMs));")) {
  throw new Error("El audio Gemini debe seguir los segmentos activos del timeline de audio.");
}

if (!syncBlock.includes("const rowId = segment.rowId;")) {
  throw new Error("syncAudio debe seleccionar la fila desde el segmento Gemini activo.");
}

if (!syncBlock.includes("const audioClip = this.deps?.resolveDialogueAudioForRow?.(session, rowId);")) {
  throw new Error("El audio Gemini debe resolverse por rowId del segmento activo.");
}

if (/visualVoiceEntry|resolvePrimaryVisualRowId\(activeEntries\)/.test(syncBlock)) {
  throw new Error("El controlador todavía prioriza la escena visual sobre el clip de audio Gemini.");
}

console.log("Gemini audio follows moved chip OK.");
