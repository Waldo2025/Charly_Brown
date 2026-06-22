import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-montage-export.js",
  "utf8"
);

assert.match(
  source,
  /function buildMontageFallbackOnScreenTextTimeline\(/,
  "El export debe tener un fallback para reconstruir segmentos de texto en pantalla desde entries."
);

assert.match(
  source,
  /if \(baseTimeline\?\.suppressFallbackFromEntries === true\) \{\s*return \{\s*settings: baseTimeline\.settings \|\| null,\s*segments: \[\],\s*suppressFallbackFromEntries: true\s*\};\s*\}/,
  "El fallback no debe reconstruir texto si el usuario lo ocultó explícitamente antes de exportar."
);

assert.match(
  source,
  /const effectiveOnScreenTextTimeline = onScreenTextTimeline\.segments\.length\s*\?\s*onScreenTextTimeline\s*:\s*buildMontageFallbackOnScreenTextTimeline\(/,
  "Si el timeline no trae segmentos persistidos, el payload del export debe reconstruirlos desde entries."
);

assert.match(
  source,
  /const shouldSendOnScreenTextTimeline = effectiveOnScreenTextTimeline\.segments\.length\s*\|\|\s*effectiveOnScreenTextTimeline\.suppressFallbackFromEntries === true;/,
  "El payload debe seguir enviando el timeline vacío cuando necesita bloquear el fallback por texto oculto."
);

assert.match(
  source,
  /onScreenTextTimeline: shouldSendOnScreenTextTimeline \?/,
  "El payload final debe enviar el timeline efectivo o el bloqueo explícito del fallback."
);

console.log("Podcaster montage export rebuilds missing on-screen text segments from entries OK.");
