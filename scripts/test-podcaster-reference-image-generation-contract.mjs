import { readFileSync } from "node:fs";

const frontendSource = readFileSync(new URL("../public/podcaster/podcaster-video-generator.js", import.meta.url), "utf8");
const backendSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

if (!/referenceImages:\s*effectiveReferenceImages/.test(frontendSource)) {
  throw new Error("El frontend debe enviar referenceImages normalizadas al generar escenas con referencia.");
}

if (!/const referenceImages = referenceMode === "image" && Array\.isArray\(req\.body\?\.referenceImages\)/.test(backendSource)
  || !/referenceImages\.forEach\(\(item\) => pushSceneReferenceSource\(item\)\);/.test(backendSource)
  || !/loadOptionalImageReference\(\{\s*dataUrl: imageSource\?\.dataUrl,\s*url: imageSource\?\.downloadUrl,\s*storagePath: imageSource\?\.storagePath\s*\}\)/s.test(backendSource)) {
  throw new Error("El backend debe consumir referenceImages remotas o inline al generar escenas con referencia.");
}

console.log("Podcaster reference image generation contract OK.");
