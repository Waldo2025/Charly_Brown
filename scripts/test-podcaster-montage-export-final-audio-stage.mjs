import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/backend/server.js",
  "utf8"
);

assert.match(
  source,
  /async function finalizeMontageExportAudioTrack\(\{[\s\S]*input = \{\},[\s\S]*finalOutPath = "",[\s\S]*tmpDir = "",[\s\S]*outExt = "mp4"/,
  "El backend debe centralizar la mezcla final de audio en una etapa dedicada."
);

assert.match(
  source,
  /let finalOutPath = concatOutPath;[\s\S]*finalOutPath = await finalizeMontageExportAudioTrack\(\{/,
  "La mezcla de audio final debe correr después de las pasadas visuales y del encode de delivery."
);

assert.match(
  source,
  /if \(input\.useTimelineAudio && !segmentInputs\.length\) \{[\s\S]*throw new Error\("montage_timeline_audio_sources_missing"\)/,
  "Si el timeline esperaba audio y no encontró fuentes válidas, el export debe fallar explícitamente."
);

assert.match(
  source,
  /const buildTimelineAudioDownloadAsset = \(segment = \{\}\) => \{[\s\S]*const fallbackClip = rowId \? \(input\.dialogueAudioMap\?\.\[rowId\] \|\| null\) : null;[\s\S]*dataUrl: segmentDataUrl \|\| fallbackDataUrl,[\s\S]*localDataUrl: String\(segment\?\.localDataUrl \|\| ""\)\.trim\(\) \|\| fallbackDataUrl,[\s\S]*localMediaCacheKey: String\(segment\?\.localMediaCacheKey \|\| fallbackClip\?\.localMediaCacheKey \|\| ""\)\.trim\(\),[\s\S]*const p = await downloadInput\(segmentAsset, "timeline-audio", i\);/,
  "La mezcla final debe combinar el segmento del timeline con el clip de dialogueAudioMap para reutilizar dataUrl/cache local y los fallbacks por fila."
);

console.log("Podcaster montage export final audio stage OK.");
