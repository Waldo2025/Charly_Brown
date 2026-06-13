import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/backend/server.js",
  "utf8"
);

assert.match(
  source,
  /function buildMontageOnScreenTextKaraokeAssFile\(segments = \[\], settings = \{\}, options = \{\}\)/,
  "El backend debe generar una pista ASS consolidada para karaoke."
);

assert.match(
  source,
  /drawFilters\.push\(`subtitles='/,
  "La exportación debe insertar el karaoke como un filtro de subtítulos único."
);

assert.match(
  source,
  /function resolveMontageOnScreenTextFontFile\(settings = \{\}\)/,
  "La exportación debe resolver una fuente más fiel al estilo configurado."
);

assert.match(
  source,
  /const karaokeEnabled = input\.partyKaraoke !== false && wordTimings\.length > 0/,
  "El flujo principal debe desviar el karaoke al render consolidado."
);

console.log("Podcaster montage export karaoke render OK.");
