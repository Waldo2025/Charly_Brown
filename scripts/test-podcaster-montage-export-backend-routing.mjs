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
const videoGeneratorSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-video-generator.js",
  "utf8"
);
const backendServerSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/backend/server.js",
  "utf8"
);
const renderYamlSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/render.yaml",
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

assert.match(
  videoGeneratorSource,
  /authFetchJson\("\/api\/podcaster\/dialogue-videos\/generate",/,
  "La generación VEO debe seguir apuntando al backend Gemini/VEO."
);

assert.match(
  backendServerSource,
  /function sanitizeReferenceImageRecord\(value = null, fallbackName = "Referencia"\)/,
  "El normalizador de imágenes de referencia debe existir a nivel de módulo."
);

assert.match(
  backendServerSource,
  /const BACKEND_SERVICE_ROLE = String\(\s*process\.env\.BACKEND_SERVICE_ROLE \|\| process\.env\.CHARLY_BACKEND_ROLE \|\| "all"\s*\)\.trim\(\)\.toLowerCase\(\);/,
  "El backend debe soportar un rol explícito para separar Gemini/VEO de export."
);

assert.match(
  backendServerSource,
  /const GEMINI_SERVICE_ONLY = BACKEND_SERVICE_ROLE === "gemini";/,
  "El backend debe reconocer el modo dedicado Gemini/VEO."
);

assert.match(
  backendServerSource,
  /function isDirectMontageExportFallbackMode\(\) \{\s*if \(GEMINI_SERVICE_ONLY\) return false;/,
  "El backend Gemini/VEO no debe bloquear VEO por exportaciones directas."
);

assert.match(
  backendServerSource,
  /function ensureMontageExportServiceEnabled\(res\) \{\s*if \(!GEMINI_SERVICE_ONLY\) return true;/,
  "El backend debe rechazar endpoints de export cuando corre en modo Gemini/VEO."
);

assert.match(
  renderYamlSource,
  /name:\s+charly-brown-gemini-backend[\s\S]*?envVars:[\s\S]*?- key:\s+BACKEND_SERVICE_ROLE\s+value:\s+gemini/,
  "Render debe declarar el rol gemini para activar la separación de servicios en producción."
);

console.log("Podcaster montage export backend routing OK.");
