import assert from "node:assert/strict";
import fs from "node:fs";

const htmlSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster.html",
  "utf8"
);

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster.js",
  "utf8"
);

assert.match(
  htmlSource,
  /id="geminiAudioSpeedRange" type="range" min="0\.5" max="10"/,
  "El slider de velocidad Gemini debe permitir subir hasta 10x."
);

assert.match(
  htmlSource,
  /id="geminiAudioSpeedNumber" type="number" min="0\.5" max="10"/,
  "El input numérico de velocidad Gemini debe permitir subir hasta 10x."
);

assert.match(
  source,
  /function normalizeDialogueAudioPlaybackRate\(value = 1\) \{\s*return Math\.max\(0\.5, Math\.min\(10, Number\(value \|\| 1\) \|\| 1\)\);\s*\}/,
  "La normalización de playbackRate Gemini debe aceptar hasta 10x."
);

assert.match(
  source,
  /playbackRate:\s*Math\.max\(0\.5,\s*Math\.min\(10,\s*Number\(clip\.playbackRate \|\| 1\) \|\| 1\)\)/,
  "El mapa persistido de audio Gemini debe conservar velocidades de hasta 10x."
);

assert.match(
  source,
  /const rowPlaybackRate = Math\.max\(0\.5, Math\.min\(10, Number\(row\?\.playbackRate \|\| 1\) \|\| 1\)\);/,
  "La resolución por fila también debe aceptar hasta 10x."
);

console.log("Podcaster Gemini audio speed 10x OK.");
