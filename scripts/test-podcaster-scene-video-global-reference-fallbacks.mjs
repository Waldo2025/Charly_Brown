import { readFileSync } from "node:fs";

const generatorSource = readFileSync(
  new URL("../public/podcaster/podcaster-video-generator.js", import.meta.url),
  "utf8"
);
const podcasterSource = readFileSync(
  new URL("../public/podcaster/podcaster.js", import.meta.url),
  "utf8"
);

if (!/const speakerReferenceImage = typeof runtime\.getSpeakerReferenceImageMap === "function"\s*\?\s*\(runtime\.getSpeakerReferenceImageMap\(session\)\[speakerLabel\] \|\| null\)\s*:\s*null;/.test(generatorSource)) {
  throw new Error("La generación de escena Veo debe resolver la referencia global del locutor desde runtime.getSpeakerReferenceImageMap.");
}

if (!/const activeScenarioAsset = typeof runtime\.resolveActiveGlobalScenarioAsset === "function"\s*\?\s*\(runtime\.resolveActiveGlobalScenarioAsset\(session\) \|\| null\)\s*:\s*null;/.test(generatorSource)) {
  throw new Error("La generación de escena Veo debe resolver el escenario global activo para poder tomar su referencia visual.");
}

if (!/const scenarioReferenceImage = activeScenarioAsset && typeof runtime\.getScenarioReferenceImageMap === "function"\s*\?\s*\(runtime\.getScenarioReferenceImageMap\(session\)\[String\(activeScenarioAsset\?\.id \|\| ""\)\.trim\(\)\] \|\| null\)\s*:\s*null;/.test(generatorSource)) {
  throw new Error("La generación de escena Veo debe resolver la referencia global del escenario activo.");
}

if (!/const fallbackReferenceImages = \[speakerReferenceImage,\s*scenarioReferenceImage\]\.filter\(Boolean\);/.test(generatorSource)) {
  throw new Error("La generación de escena Veo debe construir un fallback de referencias globales locutor+escenario.");
}

if (!/const effectiveReferenceImages = rowReferenceImages\.length \|\| rowReferenceVideo\s*\?\s*rowReferenceImages\s*:\s*fallbackReferenceImages;/.test(generatorSource)) {
  throw new Error("La generación de escena Veo debe usar las referencias globales solo cuando la escena no tenga referencias propias.");
}

if (!/const rowReferenceImage = effectiveReferenceImages\[0\] \|\| getRowReferenceImageMap\(session\)\[key\] \|\| speakerReferenceImage \|\| scenarioReferenceImage \|\| null;/.test(generatorSource)) {
  throw new Error("La referencia primaria enviada a Veo debe poder caer a locutor o escenario cuando no haya referencia por fila.");
}

if (!/const inlineReferenceBudget = buildDialogueVideoInlineReferenceBudget\(effectiveReferenceImages,\s*rowReferenceVideo,\s*continuityReferenceImageDataUrl\);/.test(generatorSource)) {
  throw new Error("El budget inline de Veo debe construirse con las referencias efectivas, incluyendo fallback global.");
}

if (!/referenceImages:\s*effectiveReferenceImages,/.test(generatorSource)) {
  throw new Error("El trace de referencias de Veo debe reflejar las referencias efectivas enviadas.");
}

if (!/referenceImageNames:\s*effectiveReferenceImages\.map\(\(item\) => String\(item\?\.name \|\| ""\)\.trim\(\)\)\.filter\(Boolean\)\.slice\(0,\s*DIALOGUE_VIDEO_MAX_REFERENCE_IMAGE_COUNT\),/.test(generatorSource)) {
  throw new Error("Los nombres de referencias enviadas a Veo deben salir de las referencias efectivas.");
}

if (!/getSpeakerReferenceImageMap,/.test(podcasterSource) || !/getScenarioReferenceImageMap,/.test(podcasterSource) || !/resolveActiveGlobalScenarioAsset,/.test(podcasterSource)) {
  throw new Error("El runtime de generación debe exponer referencias globales de locutor, escenario y escenario activo.");
}

console.log("Podcaster scene video global reference fallbacks OK.");
