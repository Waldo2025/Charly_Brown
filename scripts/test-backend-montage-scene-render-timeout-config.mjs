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
  /timeoutMs: MONTAGE_EXPORT_SCENE_RENDER_TIMEOUT_MS,\s*[\s\S]*timeoutCode: "scene_render_timeout"/,
  "El pipeline de ffmpeg debe seguir usando el timeout configurable por escena."
);

console.log("Backend montage scene render timeout config OK.");
