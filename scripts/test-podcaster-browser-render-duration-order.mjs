import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
const functionIndex = source.indexOf("async function renderMontageBrowserFinalVisualPass");
if (functionIndex < 0) {
  throw new Error("No se encontro renderMontageBrowserFinalVisualPass en backend/server.js");
}

const functionBody = source.slice(functionIndex, source.indexOf("async function executeMontageExportPipeline", functionIndex));
const declarationIndex = functionBody.indexOf("const totalDurationMs = Math.max(");
const usageIndex = functionBody.indexOf("expectedDurationMs: totalDurationMs");

if (declarationIndex < 0 || usageIndex < 0) {
  throw new Error("El pass browser debe declarar totalDurationMs y pasarlo como expectedDurationMs.");
}

if (declarationIndex > usageIndex) {
  throw new Error("totalDurationMs debe declararse antes de usarse en browserPayload.expectedDurationMs.");
}

console.log("Podcaster browser render duration order OK.");
