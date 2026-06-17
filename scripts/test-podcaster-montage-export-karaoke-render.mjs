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
  /buildMontageOnScreenTextAss/,
  "La exportación debe reutilizar el builder compartido de ASS."
);

assert.match(
  source,
  /const wordTimings = input\.partyKaraoke !== false[\s\S]*normalizeKaraokeWordTimings\(/,
  "El export normal debe seguir habilitando karaoke palabra por palabra cuando party karaoke está activo."
);

assert.match(
  source,
  /async function appendMontageSceneOnScreenTextAssFilters\([\s\S]*?const assContent = buildMontageOnScreenTextAss\(/,
  "El render por escena debe generar subtítulos ASS compartidos."
);

assert.match(
  source,
  /await appendMontageSceneOnScreenTextAssFilters\(\{/,
  "El export normal debe usar ASS/libass para texto en pantalla."
);

assert.doesNotMatch(
  source,
  /appendMontageSceneOnScreenTextOverlays\(/,
  "El backend ya no debe mantener la ruta rasterizada del karaoke por escena."
);

console.log("Podcaster montage export karaoke render OK.");
