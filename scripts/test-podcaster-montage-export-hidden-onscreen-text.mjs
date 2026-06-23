import assert from "node:assert/strict";
import fs from "node:fs";

const frontendSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-montage-export.js",
  "utf8"
);
const backendSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/backend/server.js",
  "utf8"
);

assert.match(
  frontendSource,
  /suppressFallbackFromEntries:\s*effectiveOnScreenTextTimeline\.suppressFallbackFromEntries === true/,
  "El frontend debe enviar una marca explícita para bloquear la reconstrucción del texto oculto."
);

assert.doesNotMatch(
  backendSource,
  /const hasExplicitOnScreenTextTimeline =/,
  "El backend ya no debe calcular hasExplicitOnScreenTextTimeline."
);

assert.doesNotMatch(
  backendSource,
  /const suppressOnScreenTextFallbackFromEntries =/,
  "El backend ya no debe calcular suppressOnScreenTextFallbackFromEntries."
);

assert.doesNotMatch(
  backendSource,
  /if \(!onScreenTextSegments\.length && !hasExplicitOnScreenTextTimeline && !suppressOnScreenTextFallbackFromEntries\) \{/,
  "El backend ya no debe contener el bloque de fallback para reconstruir texto desde entries."
);

console.log("Podcaster montage export hidden onscreen text suppression OK.");
