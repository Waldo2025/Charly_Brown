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
  /if \(\(!settings\.enabled \|\| settings\.showTrack === false\) && !includeHidden\) \{\s*return \{ settings, segments: \[\], suppressFallbackFromEntries \};\s*\}/,
  "El builder debe permitir incluir el track aunque esté oculto cuando se exporta party karaoke."
);

assert.match(
  montageExportSource,
  /includeHidden:\s*window\.montageExportState\.partyKaraoke !== false/,
  "La exportación debe forzar la inclusión del texto en pantalla cuando party karaoke está activo."
);

assert.match(
  montageExportSource,
  /dialogueAudioMap,/,
  "La exportación debe enviar el mapa de audio para reconstruir el karaoke en backend."
);

assert.match(
  montageExportSource,
  /downloadUrl:\s*videoDownloadUrl \|\| ""/,
  "La exportación debe enviar downloadUrl explícito para el video de escena."
);

console.log("Podcaster montage export party karaoke OK.");
