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
  /let finalOutPath = concatOutPath;[\s\S]*if \(hasFinalVisualPass && !browserVisualCompleted\) \{[\s\S]*finalOutPath = finalVisualOutPath;[\s\S]*\} else \{[\s\S]*finalOutPath = deliveryOutPath;[\s\S]*\}[\s\S]*finalOutPath = await finalizeMontageExportAudioTrack\(\{/,
  "La mezcla de audio final debe correr después de las pasadas visuales y del encode de delivery."
);

assert.match(
  source,
  /if \(input\.useTimelineAudio && !segmentInputs\.length\) \{[\s\S]*throw new Error\("montage_timeline_audio_sources_missing"\)/,
  "Si el timeline esperaba audio y no encontró fuentes válidas, el export debe fallar explícitamente."
);

assert.match(
  source,
  /const p = await downloadInput\(\{[\s\S]*rowId: clampText\(segment\?\.rowId \|\| "", 140\),[\s\S]*storagePath: clampText\(segment\?\.storagePath \|\| "", 900\),[\s\S]*url: String\(segment\?\.url \|\| ""\)\.trim\(\),[\s\S]*downloadUrl: String\(segment\?\.downloadUrl \|\| ""\)\.trim\(\),[\s\S]*dataUrl: String\(segment\?\.dataUrl \|\| ""\)\.trim\(\),[\s\S]*localDataUrl: String\(segment\?\.localDataUrl \|\| ""\)\.trim\(\),[\s\S]*mimeType: clampText\(segment\?\.mimeType \|\| "audio\/mpeg", 120\)/,
  "La mezcla final debe pasar rowId y todas las fuentes de audio al downloader para que funcionen la recuperación por fila y los fallbacks."
);

console.log("Podcaster montage export final audio stage OK.");
