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
  /const effectiveOnScreenTextTimeline = onScreenTextTimeline\.segments\.length\s*\?\s*onScreenTextTimeline\s*:\s*buildMontageFallbackOnScreenTextTimeline\(/,
  "Si el timeline no trae segmentos persistidos, el payload del export debe reconstruirlos desde entries."
);

assert.match(
  source,
  /onScreenTextTimeline: effectiveOnScreenTextTimeline\.segments\.length \?/,
  "El payload final debe enviar el timeline efectivo de texto en pantalla, no el timeline vacío original."
);

console.log("Podcaster montage export rebuilds missing on-screen text segments from entries OK.");
