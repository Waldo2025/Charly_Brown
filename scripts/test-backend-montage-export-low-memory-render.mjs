import assert from "node:assert/strict";
import fs from "node:fs";

const serverSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/backend/server.js",
  "utf8"
);
const paramsSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/backend/montage-export-video-params.js",
  "utf8"
);
const renderSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/render.yaml",
  "utf8"
);

assert.match(
  serverSource,
  /const MONTAGE_FFMPEG_LOW_MEMORY_ARGS = \["-threads", "1", "-filter_threads", "1", "-filter_complex_threads", "1"\];/,
  "FFmpeg debe limitar threads y filter threads para reducir memoria en Render."
);

assert.match(
  serverSource,
  /ffmpegArgs\.unshift\(\.\.\.MONTAGE_FFMPEG_LOW_MEMORY_ARGS\);/,
  "runFfmpegCommand debe inyectar el perfil low-memory antes de lanzar FFmpeg."
);

assert.match(
  paramsSource,
  /const x264Params = IS_RENDER_RUNTIME \? "threads=1:rc-lookahead=0:sync-lookahead=0:bframes=0:ref=1" : "";/,
  "libx264 debe usar parametros de baja memoria en Render."
);

assert.match(
  renderSource,
  /name: snoopy-export[\s\S]*key: NODE_OPTIONS\s*\n\s*value: --max-old-space-size=384/,
  "snoopy-export no debe reservar 1GB de heap en plan starter."
);

assert.match(
  renderSource,
  /name: snoopy-export[\s\S]*key: MALLOC_ARENA_MAX\s*\n\s*value: 2/,
  "snoopy-export debe limitar arenas malloc para reducir memoria nativa."
);

assert.match(
  renderSource,
  /name: charly-brown-podcaster-export-worker[\s\S]*key: NODE_OPTIONS\s*\n\s*value: --max-old-space-size=384/,
  "el worker de export debe usar el mismo heap bajo que snoopy-export."
);

console.log("Backend montage export low-memory Render profile OK.");
