import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-montage-export.js",
  "utf8"
);

assert.doesNotMatch(
  source,
  /function buildMontageFallbackOnScreenTextTimeline\(/,
  "El export ya no debe tener un fallback para reconstruir segmentos de texto en pantalla desde entries."
);

assert.match(
  source,
  /const effectiveOnScreenTextTimeline = onScreenTextTimeline;/,
  "El payload del export usa directamente el timeline de texto en pantalla sin reconstrucción fallback."
);

assert.match(
  source,
  /const shouldSendOnScreenTextTimeline = effectiveOnScreenTextTimeline\.segments\.length\s*\|\|\s*effectiveOnScreenTextTimeline\.suppressFallbackFromEntries === true;/,
  "El payload debe seguir enviando el timeline vacío cuando no hay segmentos o está deshabilitado."
);

assert.match(
  source,
  /onScreenTextTimeline: effectiveOnScreenTextTimeline \?/,
  "El payload final debe enviar el timeline efectivo."
);

console.log("Podcaster montage export fallback-onscreen-segments removed OK.");
