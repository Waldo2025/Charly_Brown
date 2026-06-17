import { readFileSync } from "node:fs";

const front = readFileSync(new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url), "utf8");

if (!/function getMontageExportPreviewCurrentTimeMs\(\)/.test(front)) {
  throw new Error("El preview JASSUB debe resolver explícitamente el tiempo actual del modal.");
}

if (!/const timelineStartMs = Math\.max\([\s\S]*frontendPreview\?\.timelineStartMs/s.test(front)
  || !/timelineStartMs \+ Math\.round\(Number\(visibleVideo\.currentTime \|\| 0\) \* 1000\)/.test(front)) {
  throw new Error("El preview JASSUB debe sumar el offset timelineStartMs al currentTime del video.");
}

console.log("Podcaster montage preview JASSUB timing contract OK.");
