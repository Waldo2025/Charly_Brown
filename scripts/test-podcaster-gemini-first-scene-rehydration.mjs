import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const podcasterSource = readFileSync(
  new URL("../public/podcaster/podcaster.js", import.meta.url),
  "utf8"
);
const timelineModelSource = readFileSync(
  new URL("../public/podcaster/podcaster-timeline-model.js", import.meta.url),
  "utf8"
);
const backendSource = readFileSync(
  new URL("../backend/server.js", import.meta.url),
  "utf8"
);

assert.match(
  podcasterSource,
  /function rehydrateGeminiDialogueAudioMap\(session = null, options = \{\}\)/,
  "Debe existir un helper de rehidratación explícita para los audios Gemini faltantes."
);

assert.match(
  podcasterSource,
  /const rowId = String\(row\?\.id \?\? ""\)\.trim\(\);[\s\S]*const fallbackClip = currentClip \|\| resolveFallbackDialogueAudioForRow\(activeSession, rowId\) \|\| null;[\s\S]*playbackRate: nextPlaybackRate,/m,
  "La rehidratación debe reconstruir entradas explícitas en dialogueAudioMap usando fallback de track y conservar playbackRate."
);

assert.match(
  podcasterSource,
  /syncGeminiDialogueTrackWithRuntime\(\{\s*render: false,\s*preserveStartMs: true,\s*forceDurationFromAudio: true\s*\}\);/,
  "Al reparar audios Gemini se debe resincronizar el track para que el editor y el timeline converjan."
);

assert.match(
  timelineModelSource,
  /const rowId = String\(runtimeEntry\?\.rowId \?\? row\?\.id \?\? ""\)\.trim\(\);/,
  "El primer rowId no debe perderse por coerciones con valores falsy."
);

assert.match(
  backendSource,
  /playbackRate:\s*Math\.max\(0\.5,\s*Math\.min\(10,\s*Number\(clip\?\.playbackRate \|\| 1\) \|\| 1\)\)/,
  "El backend debe persistir playbackRate en dialogueAudioMap al sanitizar la sesión."
);

console.log("Podcaster Gemini first-scene rehydration OK.");
