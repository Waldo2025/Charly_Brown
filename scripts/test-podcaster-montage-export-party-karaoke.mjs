import assert from "node:assert/strict";
import fs from "node:fs";

const podcasterSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster.js",
  "utf8"
);
const montageExportSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-montage-export.js",
  "utf8"
);

assert.match(
  podcasterSource,
  /function buildMontageOnScreenTextSegments\(session = null, runtimeEntries = \[], options = \{\}\)/,
  "El builder de texto en pantalla del montaje debe aceptar opciones."
);

assert.match(
  podcasterSource,
  /if \(\(!settings\.enabled \|\| settings\.showTrack === false\) && !includeHidden\) return \{ settings, segments: \[\] \};/,
  "El builder debe permitir incluir el track aunque esté oculto cuando se exporta party karaoke."
);

assert.match(
  montageExportSource,
  /includeHidden:\s*window\.montageExportState\.partyKaraoke !== false/,
  "La exportación debe forzar la inclusión del texto en pantalla cuando party karaoke está activo."
);

console.log("Podcaster montage export party karaoke OK.");
