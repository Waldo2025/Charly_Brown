import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const textRenderSource = readFileSync(new URL("../public/podcaster/podcaster-text-render.js", import.meta.url), "utf8");
const frontendExportSource = readFileSync(new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url), "utf8");
const backendSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

assert.match(
  textRenderSource,
  /if \(!Number\.isFinite\(cleanMaxFrames\) \|\| cleanMaxFrames <= 0\) \{\s*return safeWordTimings\.map\(\(_, index\) => index\);\s*\}/s,
  "El selector compartido debe permitir cobertura completa cuando maxFrames es 0 o no es finito."
);

assert.match(
  frontendExportSource,
  /const MONTAGE_EXPORT_MAX_KARAOKE_WORD_FRAMES_PER_SEGMENT = 0;/,
  "El frontend debe exportar karaoke completo por defecto."
);

assert.match(
  backendSource,
  /const MONTAGE_EXPORT_MAX_KARAOKE_WORD_FRAMES_PER_SEGMENT = Math\.max\(\s*0,/s,
  "El backend debe permitir desactivar el muestreo de karaoke con 0."
);

console.log("ok - montage export karaoke full coverage is enabled");
