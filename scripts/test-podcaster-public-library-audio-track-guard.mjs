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

assert.match(
  podcasterSource,
  /function hasExplicitDialogueAudioForRow\(session = null, rowId = ""\) \{[\s\S]*return Boolean\(getDialogueAudioMap\(session\)\[key\]\);[\s\S]*\}/,
  "Debe existir un helper para distinguir audio de diálogo realmente guardado del fallback del track Gemini."
);

assert.match(
  podcasterSource,
  /if \(isPublicLibrarySceneRow\(row, sceneClip\) && !explicitStoredAudio\) return "";/,
  "Las escenas insertadas desde la librería pública no deben renderizar chips Gemini en el subtrack si no tienen audio explícito."
);

assert.match(
  timelineModelSource,
  /const usedTrackIds = new Set\(\);[\s\S]*Object\.values\(existingClipMap\)\.forEach\(\(clip\) => \{[\s\S]*usedTrackIds\.add\(trackId\);[\s\S]*\}\);[\s\S]*\.filter\(\(track\) => track\.id && usedTrackIds\.has\(track\.id\)\)/,
  "Los tracks vacíos deben podarse cuando ya no tienen clips ni filas asociadas."
);

console.log("Podcaster public-library audio-track guard OK.");
