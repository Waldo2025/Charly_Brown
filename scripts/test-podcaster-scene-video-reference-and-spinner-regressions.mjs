import { readFileSync } from "node:fs";

const generatorSource = readFileSync(new URL("../public/podcaster/podcaster-video-generator.js", import.meta.url), "utf8");

if (!/window\.PodcasterGeneration\s*=\s*\{[\s\S]*buildTimelineSceneGenerationKey[\s\S]*\};/m.test(generatorSource)) {
  throw new Error("PodcasterGeneration debe exponer buildTimelineSceneGenerationKey para que el timeline renderice el spinner de escena.");
}

if (!/const rowReferenceVideo = getRowReferenceVideoMap\(session\)\[key\] \|\| null;/.test(generatorSource)) {
  throw new Error("La generación de video debe leer el video de referencia de la escena.");
}

if (!/const referenceMode = rowReferenceVideo \? "video" : "image";/.test(generatorSource)) {
  throw new Error("La generación de video debe decidir entre referencia de imagen o video.");
}

if (!/const inlineReferenceBudget = buildDialogueVideoInlineReferenceBudget\(rowReferenceImages, rowReferenceVideo, continuityReferenceImageDataUrl\);/.test(generatorSource)) {
  throw new Error("El presupuesto inline debe incluir el video de referencia cuando exista.");
}

if (!/referenceMode,/.test(generatorSource)) {
  throw new Error("El request body debe incluir referenceMode.");
}

if (!/referenceImageDataUrls:\s*inlineReferenceBudget\.referenceImageDataUrls,/.test(generatorSource)) {
  throw new Error("El request body debe incluir las imágenes de referencia inline.");
}

if (!/referenceImageNames:\s*rowReferenceImages\.map\(\(item\) => String\(item\?\.name \|\| ""\)\.trim\(\)\)\.filter\(Boolean\)\.slice\(0,\s*DIALOGUE_VIDEO_MAX_REFERENCE_IMAGE_COUNT\),/.test(generatorSource)) {
  throw new Error("El request body debe incluir los nombres de las imágenes de referencia.");
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
