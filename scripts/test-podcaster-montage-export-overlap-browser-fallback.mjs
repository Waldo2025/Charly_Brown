import { readFileSync } from "node:fs";

const backendSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

if (!/const hasTimelineOverlapOrGaps = overlapPlan\.hasOverlap \|\| overlapPlan\.hasGaps;/.test(backendSource)) {
  throw new Error("El export debe detectar overlaps/gaps antes de decidir la pasada visual final.");
}

if (!/if \(finalShouldAttemptBrowserRenderer && hasTimelineOverlapOrGaps\) \{[\s\S]*browser-renderer-overlap-fallback[\s\S]*finalShouldAttemptBrowserRenderer = false;/m.test(backendSource)) {
  throw new Error("El export no debe regrabar en Chromium cuando el montaje ya tiene overlaps/transiciones temporales.");
}

if (!/browserVisualPassOverlapFallback: hasTimelineOverlapOrGaps/.test(backendSource)) {
  throw new Error("El log de decision visual debe reportar cuando el fallback por overlap esta activo.");
}

console.log("Podcaster montage export overlap browser fallback OK.");
