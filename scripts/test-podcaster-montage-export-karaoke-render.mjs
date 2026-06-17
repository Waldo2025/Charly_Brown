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
  /const expectedWordIndices = input\.partyKaraoke !== false[\s\S]*normalizeKaraokeWordTimings\(/,
  "El export normal debe seguir habilitando karaoke cuando party karaoke está activo y hay timings."
);

assert.match(
  source,
  /appendMontageSceneOnScreenTextOverlays[\s\S]*karaoke-word/,
  "El render por escena debe seguir usando las capas rasterizadas de karaoke."
);

assert.doesNotMatch(
  source,
  /function generateKaraokeOverlayText\(wrappedText = "", activeWordIndex = -1\)/,
  "El backend ya no debe mantener la lógica local de karaoke."
);

console.log("Podcaster montage export karaoke render OK.");
