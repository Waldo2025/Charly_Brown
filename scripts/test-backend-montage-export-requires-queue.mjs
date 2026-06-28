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
const versionSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/version.json",
  "utf8"
);

assert.match(
  serverSource,
  /function isMontageExportQueueRequired\(\) \{[\s\S]*if \(!EXPORT_SERVICE_ONLY\) return false;[\s\S]*MONTAGE_EXPORT_REQUIRE_QUEUE[\s\S]*IS_RENDER_RUNTIME/,
  "snoopy-export debe exigir cola en Render salvo override explicito."
);

assert.match(
  serverSource,
  /montageExportQueueRequired:\s*exportQueueRequired,[\s\S]*montageExportReady:\s*!exportQueueRequired \|\| Boolean\(montageExportQueue\)/,
  "health debe exponer si la cola es requerida y si el export esta listo."
);

assert.match(
  serverSource,
  /isMontageExportQueueRequired\(\) && !montageExportQueue[\s\S]*montage_export_queue_unavailable[\s\S]*return res\.status\(503\)\.json/,
  "el endpoint de export debe fallar rapido si Render no tiene cola disponible."
);

assert.match(
  renderSource,
  /type:\s+keyvalue\s+name:\s+charly-brown-podcaster-queue[\s\S]*ipAllowList:\s*\[\][\s\S]*maxmemoryPolicy:\s+noeviction/,
  "Render Key Value debe tener ipAllowList explicito, requerido por el blueprint de Render."
);

assert.match(
  versionSource,
  /v2026-06-28\.8/,
  "version.json debe documentar y forzar la build del fix de export."
);

console.log("Backend montage export requires queue OK.");
