import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const frontendExportSource = readFileSync(new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url), "utf8");
const backendSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

assert.match(
  frontendExportSource,
  /kind:\s*"karaoke-word"[\s\S]*?text:\s*String\(word\?\.text \|\| ""\)\.trim\(\)/,
  "El payload del export debe conservar el texto de cada palabra karaoke en los renderedFrames."
);

assert.match(
  backendSource,
  /kind:\s*"karaoke-word"[\s\S]*?text:\s*String\(word\?\.text \|\| ""\)\.trim\(\)/,
  "La regeneración backend de renderedFrames debe conservar el texto de cada palabra karaoke."
);

assert.match(
  backendSource,
  /throw createMontageOnScreenTextExportError\(\s*"Falta el texto de una palabra karaoke renderizada para exportar esta escena\."\s*,\s*"montage_karaoke_word_text_missing"/,
  "Si falta el texto de un frame karaoke, el backend debe fallar con un error exacto."
);

console.log("ok - montage export karaoke word text is preserved");
