import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/js/home.js",
  "utf8"
);

assert.match(
  source,
  /suppressFallbackFromEntries = allHidden \|\| !trackVisible;/,
  "buildDashboardMontageOnScreenTextSegments debe calcular suppressFallbackFromEntries."
);

assert.match(
  source,
  /return \{ settings, segments, suppressFallbackFromEntries \};/,
  "buildDashboardMontageOnScreenTextSegments debe retornar suppressFallbackFromEntries."
);

assert.match(
  source,
  /onScreenTextTimeline: \(onScreenTextTimeline\.segments\.length \|\| onScreenTextTimeline\.suppressFallbackFromEntries === true\)/,
  "El payload de exportación debe enviar el timeline si tiene segmentos o si bloquea fallback explícitamente."
);

assert.match(
  source,
  /suppressFallbackFromEntries: onScreenTextTimeline\.suppressFallbackFromEntries === true/,
  "El payload de exportación debe enviar la marca suppressFallbackFromEntries."
);

console.log("Home export suppress fallback payload OK.");
