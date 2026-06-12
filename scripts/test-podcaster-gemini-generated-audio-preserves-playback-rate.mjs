import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const audioTimelineSource = readFileSync(
  new URL("../public/podcaster/podcaster-audioGemini-timeline.js", import.meta.url),
  "utf8"
);
const podcasterSource = readFileSync(
  new URL("../public/podcaster/podcaster.js", import.meta.url),
  "utf8"
);

assert.match(
  audioTimelineSource,
  /const existingClip = currentAudioMap\[key\] \|\| null;[\s\S]*const preservedPlaybackRate = window\.normalizeDialogueAudioPlaybackRate\?\.\([\s\S]*existingClip\?\.playbackRate \|\| row\?\.playbackRate \|\| finalAudio\?\.playbackRate \|\| 1[\s\S]*\)\s*\|\| 1;[\s\S]*playbackRate: preservedPlaybackRate/m,
  "Generar o regenerar audio Gemini debe conservar el playbackRate previamente configurado para la escena."
);

assert.match(
  podcasterSource,
  /const existingAudioClip = getDialogueAudioMap\(current\)\?\.\[rowId\] \|\| null;[\s\S]*playbackRate: normalizeDialogueAudioPlaybackRate\(existingAudioClip\?\.playbackRate \|\| row\?\.playbackRate \|\| 1\)/m,
  "La relink/autorreparación de audios Gemini desde Storage debe preservar playbackRate existente."
);

console.log("Podcaster generated Gemini audio preserves playback rate OK.");
