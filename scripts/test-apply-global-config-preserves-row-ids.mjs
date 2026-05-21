import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const match = source.match(/async function applyGlobalConfig\(\) \{([\s\S]*?)\n\}/);

if (!match) {
  throw new Error("No se encontró applyGlobalConfig en podcaster.js.");
}

const body = match[1];

if (/rows:\s*optimizeRowsForShortScenes\(/.test(body)) {
  throw new Error("applyGlobalConfig no debe reconstruir rows con optimizeRowsForShortScenes porque rompe los rowId del timeline.");
}

if (!/rows:\s*nextRows/.test(body)) {
  throw new Error("applyGlobalConfig debe persistir nextRows directamente para conservar rowId y chips.");
}

if (!/scheduleSessionLocalPersist\("global-config"\);/.test(body)) {
  throw new Error("applyGlobalConfig debe forzar persistencia local para que el usuario vea guardados sus cambios.");
}

if (!/setGlobalConfigOpen\(false\);/.test(body)) {
  throw new Error("applyGlobalConfig debe cerrar el modal al terminar de aplicar cambios.");
}

console.log("applyGlobalConfig preserves row ids OK.");
