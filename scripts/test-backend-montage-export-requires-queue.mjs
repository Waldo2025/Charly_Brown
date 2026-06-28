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
  /function inferBackendServiceRole\(\) \{[\s\S]*snoopy-export[\s\S]*return "export";[\s\S]*gemini-veo[\s\S]*return "gemini-veo";[\s\S]*charly-brown-gemini-backend[\s\S]*return "gemini";/,
  "el backend debe inferir el rol desde Render si BACKEND_SERVICE_ROLE no esta aplicado."
);

assert.match(
  serverSource,
  /const BACKEND_SERVICE_ROLE_CONFIGURED = String\([\s\S]*process\.env\.BACKEND_SERVICE_ROLE[\s\S]*const BACKEND_SERVICE_ROLE = inferBackendServiceRole\(\);/,
  "el backend debe conservar el rol configurado y usar el rol inferido efectivo."
);

assert.match(
  serverSource,
  /function isMontageExportQueueRequired\(\) \{[\s\S]*if \(!EXPORT_SERVICE_ONLY\) return false;[\s\S]*MONTAGE_EXPORT_REQUIRE_QUEUE[\s\S]*IS_RENDER_RUNTIME/,
  "snoopy-export debe poder exigir cola en Render cuando el flag explicito este activo."
);

assert.match(
  serverSource,
  /montageExportQueueRequired:\s*exportQueueRequired,[\s\S]*montageExportReady:\s*!exportQueueRequired \|\| Boolean\(montageExportQueue\)/,
  "health debe exponer si la cola es requerida y si el export esta listo."
);

assert.match(
  serverSource,
  /function isMontageExportQueueSubmissionEnabled\(\) \{[\s\S]*MONTAGE_EXPORT_USE_QUEUE[\s\S]*isMontageExportQueueRequired\(\)/,
  "snoopy-export debe encolar en BullMQ solo si MONTAGE_EXPORT_USE_QUEUE esta activo o la cola es requerida."
);

assert.match(
  serverSource,
  /if \(montageExportQueue && isMontageExportQueueSubmissionEnabled\(\)\) \{[\s\S]*Enqueuing export job to BullMQ/,
  "el POST de export no debe encolar automaticamente solo porque Redis exista."
);

assert.match(
  serverSource,
  /isMontageExportQueueRequired\(\) && !montageExportQueue[\s\S]*montage_export_queue_unavailable[\s\S]*return res\.status\(503\)\.json/,
  "el endpoint de export debe poder fallar rapido si Render exige cola pero no la tiene disponible."
);

assert.match(
  renderSource,
  /name:\s+snoopy-export[\s\S]*MONTAGE_EXPORT_REQUIRE_QUEUE\s*\n\s*value:\s+false[\s\S]*MONTAGE_EXPORT_USE_QUEUE\s*\n\s*value:\s+false[\s\S]*RENDER_KEY_VALUE_CONNECTION_STRING/,
  "snoopy-export debe dejar la cola como opt-in hasta que exista un worker consumidor."
);

assert.match(
  renderSource,
  /type:\s+keyvalue\s+name:\s+charly-brown-podcaster-queue[\s\S]*ipAllowList:\s*\[\][\s\S]*maxmemoryPolicy:\s+noeviction/,
  "Render Key Value debe tener ipAllowList explicito, requerido por el blueprint de Render."
);

assert.match(
  versionSource,
  /v2026-06-28\.9/,
  "version.json debe documentar y forzar la build del fix de export."
);

console.log("Backend montage export requires queue OK.");
