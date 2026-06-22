import assert from "node:assert/strict";
import fs from "node:fs";

const apiClientSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/js/api-client.js",
  "utf8"
);
const runtimeConfigSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/js/runtime-config.js",
  "utf8"
);
const podcasterHtmlSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster.html",
  "utf8"
);
const montageExportSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-montage-export.js",
  "utf8"
);

assert.match(
  runtimeConfigSource,
  /exportApiBaseUrl:\s*"https:\/\/snoopy-export\.onrender\.com\/api"/,
  "El runtime config debe publicar una base separada para el backend de export."
);

assert.match(
  podcasterHtmlSource,
  /<script src="js\/runtime-config-loader\.js\?v=2026-06-22\.6" defer><\/script>/,
  "podcaster.html debe forzar la recarga del runtime-config-loader alineado con el split de backends."
);

assert.match(
  apiClientSource,
  /const DEFAULT_EXPORT_API_BASE = "https:\/\/snoopy-export\.onrender\.com\/api";/,
  "El cliente API debe tener un backend por defecto para export."
);

assert.match(
  apiClientSource,
  /export function getExportApiBase\(\)/,
  "El cliente API debe exponer el resolvedor de base de export."
);

assert.match(
  apiClientSource,
  /export function buildExportApiUrl\(path = ""\)/,
  "El cliente API debe exponer un builder dedicado para URLs de export."
);

assert.match(
  montageExportSource,
  /function buildMontageExportEndpoint\(path = ""\) \{\s*return buildExportApiUrl\(path\);\s*\}/,
  "El modal de export debe construir sus endpoints con la base dedicada de export."
);

assert.match(
  montageExportSource,
  /authFetchJson\(buildMontageExportEndpoint\("\/api\/podcaster\/montage\/export"\),/,
  "El POST de export debe ir al backend snoopy-export."
);

assert.match(
  montageExportSource,
  /const exportStatusUrl = buildMontageExportEndpoint\(`\/api\/podcaster\/montage\/export-status\?jobId=\$\{encodeURIComponent\(cleanJobId\)\}`\);/,
  "El polling de export-status debe consultar el backend snoopy-export."
);

assert.match(
  montageExportSource,
  /authFetchJson\(buildMontageExportEndpoint\("\/api\/podcaster\/montage\/export-cancel"\),/,
  "La cancelación de export debe ir al backend snoopy-export."
);

console.log("Podcaster montage export backend routing OK.");
