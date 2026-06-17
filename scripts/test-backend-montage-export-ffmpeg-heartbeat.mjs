import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../backend/server.js", import.meta.url), "utf8");

assert.match(
  source,
  /const MONTAGE_EXPORT_FFMPEG_HEARTBEAT_MS = Math\.max\(/,
  "backend/server.js debe definir un intervalo de heartbeat para FFmpeg"
);

assert.match(
  source,
  /const onHeartbeat = typeof context\?\.onHeartbeat === "function" \? context\.onHeartbeat : null;/,
  "runFfmpegCommand debe aceptar context.onHeartbeat"
);

assert.match(
  source,
  /if \(onHeartbeat\) \{[\s\S]*setInterval\(\(\) => \{[\s\S]*Promise\.resolve\(onHeartbeat\(/,
  "runFfmpegCommand debe emitir heartbeats periodicos mientras FFmpeg esta vivo"
);

assert.match(
  source,
  /stage: `montage_scene_\$\{sceneIndex\}`,[\s\S]*heartbeatIntervalMs: MONTAGE_EXPORT_FFMPEG_HEARTBEAT_MS,[\s\S]*onHeartbeat: \(\{ elapsedMs = 0 \} = \{\}\) => \{/,
  "el render de escenas debe conectar el heartbeat de FFmpeg al reporter de montaje"
);

assert.match(
  source,
  /scene-step-heartbeat/,
  "el heartbeat de escenas debe dejar evidencia en logs para diagnostico"
);

assert.match(
  source,
  /stage: "montage_final_visuals",[\s\S]*onHeartbeat: \(\{ elapsedMs = 0 \} = \{\}\) => \{/,
  "la fase de capas finales debe mantener heartbeat durante FFmpeg"
);

assert.match(
  source,
  /stage: "montage_encode_delivery",[\s\S]*onHeartbeat: \(\{ elapsedMs = 0 \} = \{\}\) => \{/,
  "la fase de codificacion final debe mantener heartbeat durante FFmpeg"
);

assert.match(
  source,
  /ffmpeg-stage-heartbeat/,
  "los heartbeats de fases finales deben dejar evidencia en logs"
);

console.log("ok - montage export scene FFmpeg heartbeat is wired");
