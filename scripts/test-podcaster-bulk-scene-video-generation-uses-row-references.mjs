import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../public/podcaster/podcaster-video-generator.js", import.meta.url),
  "utf8"
);

if (!/const genAllBtn = event\.target\.closest\("\[data-action='timeline-generate-scene-video-batch'\]"\);[\s\S]*runGenerateMissingDialogueVideos\(\{ triggerButton: genAllBtn \}\);/m.test(source)) {
  throw new Error("El botón bulk normal debe delegar en runGenerateMissingDialogueVideos.");
}

if (!/const regenAllBtn = event\.target\.closest\("\[data-action='timeline-regenerate-scene-video-batch-hq'\]"\);[\s\S]*runGenerateMissingDialogueVideos\(\{ regenerateAll: true, triggerButton: regenAllBtn \}\);/m.test(source)) {
  throw new Error("El botón bulk HQ debe delegar en runGenerateMissingDialogueVideos con regenerateAll.");
}

if (!/for \(let i = 0; i < readyRows\.length; i\+\+\) \{[\s\S]*const row = readyRows\[i\];[\s\S]*const rowId = String\(row\?\.id \|\| ""\)\.trim\(\);[\s\S]*await generateDialogueVideoForRow\(rowId,\s*\{/m.test(source)) {
  throw new Error("La generación bulk debe invocar generateDialogueVideoForRow con el rowId de cada escena.");
}

if (!/const rowReferenceImages = getRowReferenceImageList\(session, key\);/.test(source)) {
  throw new Error("La generación por escena debe cargar las imágenes de referencia usando el rowId activo.");
}

if (!/const rowReferenceImage = effectiveReferenceImages\[0\] \|\| getRowReferenceImageMap\(session\)\[key\] \|\| speakerReferenceImage \|\| scenarioReferenceImage \|\| null;/.test(source)) {
  throw new Error("La generación por escena debe resolver la imagen principal de referencia con fallback por fila, locutor y escenario.");
}

if (!/referenceImageDataUrl: String\(rowReferenceImage\?\.dataUrl \|\| ""\)\.trim\(\),/.test(source)) {
  throw new Error("El payload debe incluir la imagen principal de referencia de esa escena.");
}

if (!/referenceImageNames: effectiveReferenceImages\.map\(\(item\) => String\(item\?\.name \|\| ""\)\.trim\(\)\)\.filter\(Boolean\)\.slice\(0,\s*DIALOGUE_VIDEO_MAX_REFERENCE_IMAGE_COUNT\),/.test(source)) {
  throw new Error("El payload debe incluir los nombres de las referencias efectivas de esa escena.");
}

console.log("Podcaster bulk scene video generation uses row references OK.");
