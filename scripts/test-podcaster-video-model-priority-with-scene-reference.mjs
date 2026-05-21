import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../backend/server.js", import.meta.url),
  "utf8"
);

if (!/const hasExplicitSceneReferenceInput = Boolean\(\s*referenceImageDataUrls\.length\s*\|\|\s*referenceImageDataUrl\s*\|\|\s*referenceVideoDataUrl\s*\|\|\s*continuityReferenceImageDataUrl\s*\);/.test(source)) {
  throw new Error("El backend debe detectar cuando la escena llega con referencias visuales explícitas.");
}

if (!/const filteredModels = mergedModels\.filter\(\(modelName\) => \{[\s\S]*const lowerModelName = String\(modelName \|\| ""\)\.toLowerCase\(\);[\s\S]*if \(\(strictIdentity \|\| hasExplicitSceneReferenceInput\) && \/lite\/i\.test\(lowerModelName\)\) return false;[\s\S]*return true;[\s\S]*\}\);/m.test(source)) {
  throw new Error("Con referencias visuales explícitas el backend debe excluir lite, pero no fast.");
}

if (!/const canPreferFastModel = !strictIdentity && !portraitUrl && !portraitStoragePath && !hasExplicitSceneReferenceInput;/.test(source)) {
  throw new Error("Sin referencias visuales explícitas sí puede priorizarse el modelo fast por defecto.");
}

console.log("Podcaster video model priority with scene reference OK.");
