import { readFileSync } from "node:fs";

const generator = readFileSync(new URL("../public/podcaster/podcaster-video-generator.js", import.meta.url), "utf8");
const stability = readFileSync(new URL("../backend/podcaster-stability.js", import.meta.url), "utf8");
const backend = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

if (!/const DIALOGUE_VIDEO_MAX_REFERENCE_IMAGE_COUNT = 3;/.test(generator)) {
  throw new Error("El frontend debe limitar referencias de imagen al máximo real de Veo.");
}

if (!/const DIALOGUE_VIDEO_MAX_REFERENCE_IMAGE_COUNT = 3;/.test(stability)) {
  throw new Error("El backend debe validar referencias inline con el máximo real de Veo.");
}

if (!/const buildVeoReferenceImages = \(\.\.\.groups\) => groups[\s\S]*?slice\(0, DIALOGUE_VIDEO_MAX_REFERENCE_IMAGE_COUNT\);/.test(backend)) {
  throw new Error("El backend debe recortar el arreglo final referenceImages antes de llamar a Veo.");
}

if (!/const sceneContinuityReferenceImages = buildVeoReferenceImages\(\s*sceneReferenceAssets,\s*continuityReferenceImage\s*\);/.test(backend)) {
  throw new Error("Las referencias de escena y continuidad deben compartir el mismo presupuesto de Veo.");
}

if (!/referenceImages: sceneContinuityReferenceImages/.test(backend)) {
  throw new Error("Las variantes reference-scene deben usar el arreglo ya limitado.");
}

if (!/DIALOGUE_VIDEO_MAX_REFERENCE_IMAGE_COUNT - 1/.test(backend)) {
  throw new Error("Las variantes con retrato deben reservar un slot y no exceder el máximo de Veo.");
}

if (/referenceImages: \[\.\.\.sceneReferenceAssets/.test(backend) || /\.\.\.sceneReferenceAssets, \.\.\.\(continuityReferenceImage/.test(backend)) {
  throw new Error("No debe quedar una expansión directa que pueda superar el límite de referencias de Veo.");
}

console.log("Podcaster Veo reference image limit OK.");
