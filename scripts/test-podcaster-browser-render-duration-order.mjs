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

const browserInputHelperIndex = source.indexOf("async function prepareMontageBrowserVisualInput");
if (browserInputHelperIndex < 0) {
  throw new Error("El pass browser debe preparar una entrada compatible para Chromium.");
}

if (!source.includes('"montage-browser-input.mp4"') || !source.includes('"-c:v", "libx264"')) {
  throw new Error("La entrada del browser pass debe transcodificarse a MP4/H.264 compatible con Chromium.");
}

for (const requiredSnippet of ['"-preset", "ultrafast"', '"-tune", "zerolatency"', '"-profile:v", "baseline"', '"-movflags", "+faststart"']) {
  if (!source.includes(requiredSnippet)) {
    throw new Error(`La entrada MP4 del browser pass debe conservar la optimizacion: ${requiredSnippet}`);
  }
}

const browserInputUsageIndex = functionBody.indexOf("const browserInputPath = await prepareMontageBrowserVisualInput");
const baseVideoUsageIndex = functionBody.indexOf("baseVideoPath: browserInputPath");
if (browserInputUsageIndex < 0 || baseVideoUsageIndex < 0 || browserInputUsageIndex > baseVideoUsageIndex) {
  throw new Error("renderMontageBrowserOverlayVideo debe recibir browserInputPath, no el MP4 intermedio directo.");
}

console.log("Podcaster browser render duration and input compatibility OK.");
