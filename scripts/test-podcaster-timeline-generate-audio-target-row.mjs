import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster-video-generator.js", import.meta.url), "utf8");

const handlerMatch = source.match(
  /const generateAudioBtn = event\.target\.closest\("\[data-action='timeline-generate-scene-audio'\]"\);[\s\S]*?await runtime\.generateDialogueAudioForRow\(rowId, \{ regenerate: shouldRegenerate, silent: false \}\);/m
);

if (!handlerMatch) {
  throw new Error("No se encontró el handler de timeline-generate-scene-audio.");
}

const block = handlerMatch[0];

if (!/let rowId = String\(generateAudioBtn\.dataset\.rowId \|\| ""\)\.trim\(\);/.test(block)) {
  throw new Error("El handler de timeline-generate-scene-audio debe tomar primero el data-row-id del botón clicado.");
}

if (!/if \(!rowId\) \{[\s\S]*rowId = resolveTargetVideoRowId\(session\);[\s\S]*\}/m.test(block)) {
  throw new Error("El row activo solo debe usarse como fallback cuando el botón no trae data-row-id.");
}

console.log("Podcaster timeline generate-audio target row OK.");
