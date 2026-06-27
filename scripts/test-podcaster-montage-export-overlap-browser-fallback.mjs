import { readFileSync } from "node:fs";

const backendSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

if (!/const hasTimelineOverlapOrGaps = overlapPlan\.hasOverlap \|\| overlapPlan\.hasGaps;/.test(backendSource)) {
  throw new Error("El export debe detectar overlaps/gaps antes de decidir la pasada visual final.");
}

if (/if \(finalShouldAttemptBrowserRenderer && hasTimelineOverlapOrGaps\) \{[\s\S]*finalShouldAttemptBrowserRenderer = false;/m.test(backendSource)) {
  throw new Error("El export no debe desactivar Chromium por overlaps/gaps; el pase browser final debe correr sobre el video ya compuesto.");
}

if (!/const hasBrowserVisualPassRequired = hasBrowserVisualPass \|\| \(forcedKaraokeBrowserVisualPass && hasFinalVisualPass\);/.test(backendSource)) {
  throw new Error("El export debe permitir la pasada browser forzada para karaoke/texto estilizado después de componer transiciones.");
}

if (!/timelineHasOverlapOrGaps: hasTimelineOverlapOrGaps/.test(backendSource)) {
  throw new Error("El log de decision visual debe reportar cuando hay overlaps/gaps.");
}

console.log("Podcaster montage export overlap browser fallback OK.");
