import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

const firstUse = source.indexOf("sceneReferenceAssets.length");
const init = source.indexOf("const sceneReferenceAssets = [...sceneReferenceImages];");

if (init === -1) {
  throw new Error("Falta la inicialización de sceneReferenceAssets en backend/server.js.");
}

if (firstUse === -1) {
  throw new Error("No se encontró el uso esperado de sceneReferenceAssets.length en backend/server.js.");
}

if (init > firstUse) {
  throw new Error("sceneReferenceAssets se usa antes de inicializarse en backend/server.js.");
}

console.log("Podcaster scene video reference init order OK.");
