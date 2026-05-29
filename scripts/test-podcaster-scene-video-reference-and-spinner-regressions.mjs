import { readFileSync } from "node:fs";

const generatorSource = readFileSync(new URL("../public/podcaster/podcaster-video-generator.js", import.meta.url), "utf8");
const sharedSource = readFileSync(new URL("../public/podcaster/podcaster-generation-shared.js", import.meta.url), "utf8");

if (!/registerPodcasterGenerationShared\(\{[\s\S]*buildTimelineSceneGenerationKey,[\s\S]*\}\);/m.test(generatorSource)) {
  throw new Error("La generación de video debe registrar buildTimelineSceneGenerationKey en el shared registry.");
}

if (!/export const podcasterGenerationShared = \{[\s\S]*timelineSceneVideoGenerationPending:\s*new Set\(\),[\s\S]*timelineSceneVideoGenerationStatus:\s*new Map\(\),/m.test(sharedSource)) {
  throw new Error("podcaster-generation-shared.js debe exponer el estado compartido para el spinner de escena.");
}

if (!/const rowReferenceVideo = getRowReferenceVideoMap\(session\)\[key\] \|\| null;/.test(generatorSource)) {
  throw new Error("La generación de video debe leer el video de referencia de la escena.");
}

if (!/const effectiveReferenceMode = explicitReferenceMode === "video" && rowReferenceVideo\s*\?\s*"video"\s*:\s*"image";/.test(generatorSource)) {
  throw new Error("La generación de video debe resolver el modo efectivo de referencia entre imagen y video.");
}

if (!/const referenceMode = effectiveReferenceMode;/.test(generatorSource)) {
  throw new Error("La generación de video debe publicar el modo efectivo de referencia en referenceMode.");
}

if (!/const inlineReferenceBudget = buildDialogueVideoInlineReferenceBudget\(effectiveReferenceImages,\s*rowReferenceVideo,\s*continuityReferenceImageDataUrl\);/.test(generatorSource)) {
  throw new Error("El presupuesto inline debe incluir las referencias efectivas de imagen y el video de referencia cuando existan.");
}

if (!/referenceMode,/.test(generatorSource)) {
  throw new Error("El request body debe incluir referenceMode.");
}

if (!/referenceImageDataUrls:\s*inlineReferenceBudget\.referenceImageDataUrls,/.test(generatorSource)) {
  throw new Error("El request body debe incluir las imágenes de referencia inline.");
}

if (!/referenceImageNames:\s*effectiveReferenceImages\.map\(\(item\) => String\(item\?\.name \|\| ""\)\.trim\(\)\)\.filter\(Boolean\)\.slice\(0,\s*DIALOGUE_VIDEO_MAX_REFERENCE_IMAGE_COUNT\),/.test(generatorSource)) {
  throw new Error("El request body debe incluir los nombres de las imágenes de referencia efectivas.");
}

if (!/referenceVideoDataUrl:\s*inlineReferenceBudget\.referenceVideoDataUrl,/.test(generatorSource)) {
  throw new Error("El request body debe incluir el video de referencia inline.");
}

if (!/referenceVideoName:\s*String\(rowReferenceVideo\?\.name \|\| ""\)\.trim\(\),/.test(generatorSource)) {
  throw new Error("El request body debe incluir el nombre del video de referencia.");
}

if (!/referenceVideoMimeType:\s*String\(rowReferenceVideo\?\.mimeType \|\| "video\/mp4"\)\.trim\(\) \|\| "video\/mp4",/.test(generatorSource)) {
  throw new Error("El request body debe incluir el mime type del video de referencia.");
}

console.log("Podcaster scene video reference and spinner regressions OK.");
