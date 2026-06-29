import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const backendSource = readFileSync(
  new URL("../backend/server.js", import.meta.url),
  "utf8"
);
const frontendSource = readFileSync(
  new URL("../public/podcaster/podcaster-video-generator.js", import.meta.url),
  "utf8"
);

assert.match(
  backendSource,
  /requestRequiresSceneReference[\s\S]*filterVeoVariantsForModel\(effectiveRequestVariants, modelName\)\.some\(\(variant\) => \/reference-\/i\.test/,
  "Cuando hay referencia de escena, el backend debe elegir modelos con variantes reference-* compatibles."
);

assert.match(
  backendSource,
  /requestRequiresSceneReference[\s\S]*\? videoModels\.filter\(\(modelName\) => filterVeoVariantsForModel\(effectiveRequestVariants, modelName\)\.some/,
  "Cuando hay referencia de escena, el backend debe conservar todos los modelos compatibles con referenceImages, no solo el limite inicial."
);

assert.match(
  backendSource,
  /filterVeoVariantsForModel\(effectiveRequestVariants, videoModel\)[\s\S]*filter\(\(variant\) => !requestRequiresSceneReference \|\| \/reference-\/i\.test/,
  "Cuando hay referencia de escena, el backend no debe continuar con variantes text-only."
);

assert.match(
  backendSource,
  /scene_reference_unavailable[\s\S]*return res\.status\(422\)\.json/,
  "Si la referencia declarada no se puede cargar, el backend debe fallar con diagnostico en vez de degradar a text-only."
);

assert.match(
  backendSource,
  /const veoPrompt = compactVeoPromptForRequest\(prompt\);[\s\S]*prompt: veoPrompt/,
  "El backend debe compactar el prompt antes de enviarlo a Veo para respetar el limite de texto del modelo."
);

assert.match(
  frontendSource,
  /hasStoragePath: Boolean\(String\(item\?\.storagePath \|\| item\?\.path \|\| ""\)\.trim\(\)\)/,
  "El trace frontend debe reportar referencias remotas por storagePath, no solo dataUrl inline."
);

console.log("Podcaster scene reference required Veo plan OK.");
