import { readFileSync } from "node:fs";

const backendSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

if (!/async function renderMontageGapFillerClip\(\{/.test(backendSource)) {
  throw new Error("Falta el helper para generar clips negros de relleno en gaps.");
}

if (!/const concatSequencePaths = overlapPlan\.hasGaps[\s\S]*buildMontageGapAwareConcatSequence\(/m.test(backendSource)) {
  throw new Error("El export debe construir una secuencia de concat con fillers cuando hay huecos sin overlap.");
}

if (!/if \(overlapPlan\.hasOverlap\) \{[\s\S]*renderMontageOverlapComposition\(/m.test(backendSource)) {
  throw new Error("La recomposición completa debe reservarse para overlaps reales.");
}

console.log("Podcaster gap timeline export OK.");
