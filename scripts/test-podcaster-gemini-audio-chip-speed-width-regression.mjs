import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../public/podcaster/podcaster.js", import.meta.url),
  "utf8"
);
const timelineUiSource = readFileSync(
  new URL("../public/podcaster/podcaster-timeline-ui.js", import.meta.url),
  "utf8"
);

assert.match(
  source,
  /function resolveDialogueAudioPlaybackRate\(session = null, rowId = ""\)\s*\{[\s\S]*const rowPlaybackRate = Math\.max\(0\.5, Math\.min\(2\.25, Number\(row\?\.playbackRate \|\| 1\) \|\| 1\)\);[\s\S]*return normalizeDialogueAudioPlaybackRate\(audioClip\?\.playbackRate \|\| rowPlaybackRate \|\| 1\);[\s\S]*\}/,
  "resolveDialogueAudioPlaybackRate debe caer al playbackRate persistido en la fila cuando no exista entrada explícita en dialogueAudioMap."
);

assert.match(
  source,
  /const fallbackClip = currentClip \|\| resolveDialogueAudioForRow\(current, rowId\) \|\| \{\};[\s\S]*nextMap\[rowId\] = \{[\s\S]*\.\.\.fallbackClip,[\s\S]*playbackRate: nextPlaybackRate,[\s\S]*rowId,[\s\S]*updatedAt: nowIso\(\)[\s\S]*\};/,
  "applyGeminiAudioSpeedModal debe crear o actualizar una entrada en dialogueAudioMap incluso cuando el audio Gemini exista solo por fallback del track."
);

assert.match(
  timelineUiSource,
  /const resolveGeminiSegmentVisibleDurationMs = \(segment = null\) => \{[\s\S]*const trimmedVisibleMs = trimOutMs > trimInMs \? \(trimOutMs - trimInMs\) : 0;[\s\S]*const playbackRate = rowId[\s\S]*Math\.round\(rawVisibleMs \/ playbackRate\)/,
  "El timeline debe reducir el ancho visible del chip Gemini según trimOutMs - trimInMs y el playbackRate activo."
);

console.log("Podcaster Gemini audio chip speed width regression OK.");
