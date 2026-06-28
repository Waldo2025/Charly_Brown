import assert from "node:assert/strict";
import fs from "node:fs";

const serverSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/backend/server.js",
  "utf8"
);
const renderSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/render.yaml",
  "utf8"
);

const closeHandlerIndex = serverSource.indexOf('child.on("close", (code) => {');
assert.ok(closeHandlerIndex >= 0, "runFfmpegCommand debe tener handler close para FFmpeg.");

const successIndex = serverSource.indexOf("Number(code || 0) === 0", closeHandlerIndex);
const timeoutIndex = serverSource.indexOf("if (didTimeout)", closeHandlerIndex);

assert.ok(successIndex >= 0, "El handler close debe reconocer salida exitosa de FFmpeg.");
assert.ok(timeoutIndex >= 0, "El handler close debe reconocer timeout de FFmpeg.");
assert.ok(
  successIndex < timeoutIndex,
  "Si FFmpeg cierra con code 0, debe resolverse como éxito aunque el timer haya disparado en la misma carrera."
);

assert.match(
  renderSource,
  /name: snoopy-export[\s\S]*key: MONTAGE_EXPORT_SCENE_RENDER_TIMEOUT_MS\s*\n\s*value: 900000/,
  "snoopy-export debe tener timeout mayor para el perfil low-memory de Render."
);

assert.match(
  renderSource,
  /name: charly-brown-podcaster-export-worker[\s\S]*key: MONTAGE_EXPORT_SCENE_RENDER_TIMEOUT_MS\s*\n\s*value: 900000/,
  "el worker de export debe tener el mismo timeout mayor."
);

console.log("Backend montage export timeout race handling OK.");
