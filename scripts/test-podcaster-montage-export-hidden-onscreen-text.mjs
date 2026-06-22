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

assert.match(
  backendSource,
  /const suppressOnScreenTextFallbackFromEntries = onScreenTextTimelineRaw\?\.suppressFallbackFromEntries === true;/,
  "El backend debe reconocer la marca que bloquea el fallback del texto en pantalla."
);

assert.match(
  backendSource,
  /if \(!onScreenTextSegments\.length && !suppressOnScreenTextFallbackFromEntries\) \{/,
  "El backend no debe reinyectar texto desde entries cuando el frontend lo mandó oculto."
);

console.log("Podcaster montage export hidden onscreen text suppression OK.");
