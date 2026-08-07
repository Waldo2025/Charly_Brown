import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/backend/server.js",
  "utf8"
);

assert.match(
  source,
  /const MONTAGE_EXPORT_SCENE_RENDER_TIMEOUT_MS = Math\.max\(\s*60 \* 1000,\s*Number\(process\.env\.MONTAGE_EXPORT_SCENE_RENDER_TIMEOUT_MS \|\| 6 \* 60 \* 1000\) \|\| 6 \* 60 \* 1000\s*\);/,
  "El timeout de render por escena debe ser configurable por entorno y tener un default mayor para producción."
);

assert.match(
  source,
  /const MONTAGE_EXPORT_FINAL_ENCODE_TIMEOUT_MS = Math\.max\(\s*MONTAGE_EXPORT_SCENE_RENDER_TIMEOUT_MS,\s*Number\(process\.env\.MONTAGE_EXPORT_FINAL_ENCODE_TIMEOUT_MS \|\| 15 \* 60 \* 1000\) \|\| 15 \* 60 \* 1000\s*\);/,
  "La codificación final debe tener un presupuesto independiente de al menos 15 minutos."
);

assert.match(
  source,
  /timeoutMs: MONTAGE_EXPORT_SCENE_RENDER_TIMEOUT_MS,\s*[\s\S]*timeoutCode: "scene_render_timeout"/,
  "El pipeline de ffmpeg debe seguir usando el timeout configurable por escena."
);

const finalEncodeTimeoutUses = source.match(/timeoutMs: MONTAGE_EXPORT_FINAL_ENCODE_TIMEOUT_MS,/g) || [];
assert.ok(
  finalEncodeTimeoutUses.length >= 3,
  "Todas las rutas de codificación visual y delivery deben usar el presupuesto final independiente."
);

assert.match(
  source,
  /stage: "montage_final_visuals",\s*timeoutMs: MONTAGE_EXPORT_FINAL_ENCODE_TIMEOUT_MS,\s*timeoutCode: "encode_visual_timeout"/,
  "La pasada visual final debe tener timeout y código de error explícitos."
);

console.log("Backend montage scene render timeout config OK.");
