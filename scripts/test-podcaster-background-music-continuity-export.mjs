import { readFileSync } from "node:fs";

const exportSource = readFileSync(new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url), "utf8");
const backendSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

if (!/const buildSceneBackgroundAutomationWindows = \(\) => \{/.test(exportSource)) {
  throw new Error("El export debe construir ventanas de automatización por escena para la música de fondo continua.");
}

if (!/sceneBackgroundAutomation:\s*backgroundAutomationWindows/.test(exportSource)) {
  throw new Error("El payload de export debe incluir sceneBackgroundAutomation para aplicar overrides sin cortar el fondo.");
}

if (!/const backgroundAutomationWindows = buildSceneBackgroundAutomationWindows\(\);/.test(exportSource)) {
  throw new Error("buildMontageExportPayload debe calcular las ventanas de automatización del fondo antes de construir el audioTimeline.");
}

if (!/const shouldOffsetByScene = !isBackgroundSegment \|\| Boolean\(String\(segment\?\.rowId \|\| ""\)\.trim\(\)\);/.test(backendSource)) {
  throw new Error("El backend no debe depender de rowId para colocar segmentos continuos de fondo.");
}

if (!/const adjustedStartMs = shouldOffsetByScene && exportOffset/.test(backendSource)) {
  throw new Error("La mezcla timeline debe dejar intacto el startMs de fondo continuo cuando no pertenece a una escena.");
}

if (!/segmentAutomationWindows = isBackgroundSegment \? getSceneAutomationWindowsForSegment/.test(backendSource)) {
  throw new Error("El backend debe aplicar automatización de volumen por escena sobre segmentos continuos de fondo.");
}

console.log("Podcaster background music continuity export OK.");
