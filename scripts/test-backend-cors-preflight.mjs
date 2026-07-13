import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/backend/server.js",
  "utf8"
);

assert.match(
  source,
  /allowedHeaders:\s*\[[\s\S]*?"Cache-Control"[\s\S]*?"Pragma"[\s\S]*?"Expires"[\s\S]*?\]/m,
  "El backend debe permitir Cache-Control/Pragma/Expires en preflight CORS."
);

assert.match(
  source,
  /allowedHeaders:\s*\[[\s\S]*?"X-Local-Analysis-Context"[\s\S]*?\]/m,
  "El backend debe permitir X-Local-Analysis-Context en preflight CORS para analizarPDF."
);

assert.doesNotMatch(
  source,
  /app\.options\("\*",\s*cors\(corsOptions\)\);/,
  "El backend no debe usar app.options('*') porque Express 5 lo rechaza."
);

assert.match(
  source,
  /req\.method === "GET" && String\(req\.path \|\| ""\)\.trim\(\) === "\/montage\/export-status"/,
  "El backend debe permitir el polling público de montage/export-status sin bearer."
);

assert.match(
  source,
  /withTimeout\(\s*\(\) => montageExportJobStore\.getJob\(cleanJobId\),\s*MONTAGE_EXPORT_STATUS_READ_TIMEOUT_MS,/m,
  "El polling de montage/export-status debe degradar consultas lentas en vez de bloquear la respuesta."
);

console.log("Backend CORS preflight OK.");
