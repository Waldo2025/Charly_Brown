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
  textRenderSource,
  /if \(!Number\.isFinite\(cleanMaxFrames\) \|\| cleanMaxFrames <= 0\) \{\s*return safeWordTimings\.map\(\(_, index\) => index\);\s*\}/s,
  "El selector compartido debe permitir cobertura completa cuando el cap es 0 o invalido."
);

assert.match(
  frontendExportSource,
  /selectKaraokeWordTimingIndicesForExport\(wordTimings, \{\s*maxFrames: MONTAGE_EXPORT_MAX_KARAOKE_WORD_FRAMES_PER_SEGMENT/s,
  "El frontend debe delegar la cobertura karaoke al selector compartido."
);

assert.match(
  backendSource,
  /const MONTAGE_EXPORT_MAX_KARAOKE_WORD_FRAMES_PER_SEGMENT = Math\.max\(\s*0,/s,
  "El backend debe permitir desactivar el cap de overlays karaoke."
);

assert.match(
  backendSource,
  /const IS_RENDER_RUNTIME = Boolean\(\s*String\(process\.env\.RENDER_EXTERNAL_HOSTNAME \|\| process\.env\.RENDER_SERVICE_ID \|\| ""\)\.trim\(\)\s*\);/s,
  "El backend debe detectar el runtime de Render para aplicar un presupuesto seguro por defecto."
);

assert.match(
  backendSource,
  /: \(IS_RENDER_RUNTIME \? MONTAGE_EXPORT_RENDER_SAFE_KARAOKE_WORD_FRAME_CAP : 0\)/s,
  "Si no hay override explícito, Render debe usar un cap seguro para overlays karaoke."
);

assert.match(
  backendSource,
  /selectKaraokeWordTimingIndicesForExport\(wordTimings, \{\s*maxFrames: MONTAGE_EXPORT_MAX_KARAOKE_WORD_FRAMES_PER_SEGMENT/s,
  "El backend debe reutilizar el selector compartido al regenerar y aplicar karaoke."
);

console.log("ok - montage export karaoke coverage is configurable");
