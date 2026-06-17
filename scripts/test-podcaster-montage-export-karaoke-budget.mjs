import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const textRenderSource = readFileSync(new URL("../public/podcaster/podcaster-text-render.js", import.meta.url), "utf8");
const frontendExportSource = readFileSync(new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url), "utf8");
const backendSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

assert.match(
  textRenderSource,
  /function selectKaraokeWordTimingIndicesForExport\(wordTimings = \[], \{ maxFrames = 48 \} = \{\}\)/,
  "El spec compartido debe exponer un selector de indices de karaoke para export."
);

assert.match(
  frontendExportSource,
  /const MONTAGE_EXPORT_MAX_KARAOKE_WORD_FRAMES_PER_SEGMENT = 48;/,
  "El frontend debe limitar los frames karaoke por segmento antes de enviar el payload."
);

assert.match(
  frontendExportSource,
  /selectKaraokeWordTimingIndicesForExport\(wordTimings, \{\s*maxFrames: MONTAGE_EXPORT_MAX_KARAOKE_WORD_FRAMES_PER_SEGMENT/s,
  "El frontend debe muestrear las palabras karaoke para export."
);

assert.match(
  backendSource,
  /const MONTAGE_EXPORT_MAX_KARAOKE_WORD_FRAMES_PER_SEGMENT = Math\.max\(/,
  "El backend debe tener un limite configurable de overlays karaoke por segmento."
);

assert.match(
  backendSource,
  /selectKaraokeWordTimingIndicesForExport\(wordTimings, \{\s*maxFrames: MONTAGE_EXPORT_MAX_KARAOKE_WORD_FRAMES_PER_SEGMENT/s,
  "El backend debe reutilizar el selector compartido al regenerar y aplicar karaoke."
);

console.log("ok - montage export karaoke overlay budget is enforced");
