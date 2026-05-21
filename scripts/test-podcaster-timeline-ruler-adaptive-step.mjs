import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster-timeline-ui.js", import.meta.url), "utf8");

if (!/function\s+resolveTimelineRulerStepSec\s*\(/.test(source)) {
  throw new Error("podcaster-timeline-ui.js debe definir resolveTimelineRulerStepSec para escalar el ruler con el zoom.");
}

if (!/return\s+60;/.test(source) || !/return\s+30;/.test(source) || !/return\s+15;/.test(source) || !/return\s+10;/.test(source) || !/return\s+5;/.test(source) || !/return\s+2;/.test(source)) {
  throw new Error("resolveTimelineRulerStepSec debe contemplar steps de 2, 5, 10, 15, 30 y 60 segundos.");
}

if (!/for\s*\(let sec = 0; sec <= totalSec; sec \+= rulerStepSec\)/.test(source)) {
  throw new Error("El ruler debe iterar usando rulerStepSec en lugar de pintar una marca por segundo.");
}

console.log("Podcaster timeline ruler adaptive step OK.");
