import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/backend/server.js",
  "utf8"
);

assert.match(
  source,
  /stage: "montage_overlap_compose"[\s\S]*heartbeatIntervalMs: MONTAGE_EXPORT_FFMPEG_HEARTBEAT_MS[\s\S]*onHeartbeat:/m,
  "La composición overlap del montage debe emitir heartbeats para no congelar el estado en la última escena."
);

assert.match(
  source,
  /stage: "montage_concat"[\s\S]*heartbeatIntervalMs: MONTAGE_EXPORT_FFMPEG_HEARTBEAT_MS[\s\S]*onHeartbeat:/m,
  "El concat lineal del montage debe emitir heartbeats para no dejar el job pegado en la última scene_ffmpeg_render."
);

assert.match(
  source,
  /emitStage\(\s*"concat_timeline",[\s\S]*sceneSubstage: "",[\s\S]*lastHeartbeatAt: new Date\(\)\.toISOString\(\)/m,
  "Durante concat_timeline el backend debe limpiar el sceneSubstage viejo y refrescar lastHeartbeatAt."
);

console.log("Podcaster backend montage concat heartbeats OK.");
