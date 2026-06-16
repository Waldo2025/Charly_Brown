import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/backend/server.js",
  "utf8"
);

assert.match(
  source,
  /podcaster-text-render\.js/,
  "El backend debe consumir el módulo compartido de texto/karaoke."
);

assert.match(
  source,
  /buildMontageOnScreenTextDrawFilters/,
  "La exportación debe reutilizar el builder compartido de drawtext."
);

assert.match(
  source,
  /buildMontageOnScreenTextKaraokeBoxFilters/,
  "La exportación debe reutilizar el builder compartido de la caja karaoke."
);

assert.match(
  source,
  /const karaokeEnabled = input\.partyKaraoke !== false && wordTimings\.length > 0/,
  "El flujo principal debe seguir habilitando karaoke cuando hay timings."
);

assert.doesNotMatch(
  source,
  /function generateKaraokeOverlayText\(wrappedText = "", activeWordIndex = -1\)/,
  "El backend ya no debe mantener la lógica local de karaoke."
);

console.log("Podcaster montage export karaoke render OK.");
