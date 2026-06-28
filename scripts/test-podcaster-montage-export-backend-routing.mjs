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
  runtimeConfigSource,
  /veoApiBaseUrl:[\s\S]*"https:\/\/gemini-veo\.onrender\.com\/api"/,
  "El runtime config debe publicar una base separada para el backend de Veo e imagen."
);

assert.match(
  podcasterHtmlSource,
  /<script src="js\/runtime-config-loader\.js\?v=2026-06-26\.5" defer><\/script>/,
  "podcaster.html debe forzar la recarga del runtime-config-loader alineado con el split de backends."
);

assert.match(
  podcasterHtmlSource,
  /podcaster\/podcaster-montage-export\.js\?v=2026-06-28\.9/,
  "podcaster.html debe forzar la recarga del fix actual del export MP4."
);

assert.match(
  apiClientSource,
  /const DEFAULT_EXPORT_API_BASE = "https:\/\/snoopy-export\.onrender\.com\/api";/,
  "El cliente API debe tener un backend por defecto para export."
);

assert.match(
  apiClientSource,
  /const DEFAULT_VEO_API_BASE = "https:\/\/gemini-veo\.onrender\.com\/api";/,
  "El cliente API debe tener un backend por defecto para Veo e imagen."
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
  apiClientSource,
  /export function buildVeoApiUrl\(path = ""\)/,
  "El cliente API debe exponer un builder dedicado para URLs de Veo."
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
  /authFetchJson\(buildVeoApiUrl\("\/api\/podcaster\/dialogue-videos\/generate"\),/,
  "La generación VEO debe apuntar al backend gemini-veo."
);

assert.match(
  videoGeneratorSource,
  /authFetchJson\(buildVeoApiUrl\(`\/api\/podcaster\/dialogue-videos\/generate-status\?jobId=\$\{encodeURIComponent\(cleanJobId\)\}`\)\)/,
  "El polling de VEO debe consultar el backend gemini-veo."
);

assert.match(
  backendServerSource,
  /function sanitizeReferenceImageRecord\(value = null, fallbackName = "Referencia"\)/,
  "El normalizador de imágenes de referencia debe existir a nivel de módulo."
);

assert.match(
  backendServerSource,
  /function inferBackendServiceRole\(\) \{[\s\S]*snoopy-export[\s\S]*return "export";[\s\S]*\}[\s\S]*const BACKEND_SERVICE_ROLE = inferBackendServiceRole\(\);/,
  "El backend debe soportar un rol explícito o inferido para separar Gemini/VEO de export."
);

assert.match(
  backendServerSource,
  /const GEMINI_VEO_SERVICE_ONLY = BACKEND_SERVICE_ROLE === "gemini-veo";/,
  "El backend debe reconocer el modo dedicado gemini-veo."
);

assert.match(
  backendServerSource,
  /function ensureVeoGenerationServiceEnabled\(res\) \{\s*if \(GEMINI_VEO_SERVICE_ONLY \|\| BACKEND_SERVICE_ROLE === "all"\) return true;/,
  "El backend debe aceptar generación de imágenes y videos solo en el servicio gemini-veo."
);

assert.match(
  backendServerSource,
  /function ensureMontageExportServiceEnabled\(res\) \{\s*if \(EXPORT_SERVICE_ONLY \|\| BACKEND_SERVICE_ROLE === "all"\) return true;/,
  "El backend debe rechazar endpoints de export cuando no corre en el servicio de export."
);

assert.match(
  renderYamlSource,
  /name:\s+gemini-veo[\s\S]*?envVars:[\s\S]*?- key:\s+BACKEND_SERVICE_ROLE\s+value:\s+gemini-veo/,
  "Render debe declarar el rol gemini-veo para activar la separación de servicios en producción."
);

assert.match(
  renderYamlSource,
  /type:\s+web\s+name:\s+snoopy-export[\s\S]*?startCommand:\s+node backend\/server\.js[\s\S]*?envVars:[\s\S]*?- key:\s+BACKEND_SERVICE_ROLE\s+value:\s+export[\s\S]*?- key:\s+PUBLIC_BACKEND_BASE_URL\s+value:\s+https:\/\/snoopy-export\.onrender\.com[\s\S]*?- key:\s+RENDER_KEY_VALUE_CONNECTION_STRING\s+fromService:/,
  "Render debe declarar snoopy-export como backend web de export con rol export y cola Redis."
);

assert.match(
  renderYamlSource,
  /type:\s+web\s+name:\s+snoopy-export[\s\S]*?- key:\s+MONTAGE_EXPORT_REQUIRE_QUEUE\s+value:\s+true[\s\S]*?- key:\s+RENDER_KEY_VALUE_CONNECTION_STRING/,
  "snoopy-export debe exigir cola antes de volver al fallback directo."
);

assert.match(
  renderYamlSource,
  /type:\s+keyvalue\s+name:\s+charly-brown-podcaster-queue[\s\S]*?ipAllowList:\s*\[\]/,
  "Render Key Value debe declarar ipAllowList para que el blueprint sea valido y la cola se cree/sincronice."
);

assert.match(
  renderYamlSource,
  /type:\s+worker\s+name:\s+charly-brown-podcaster-export-worker[\s\S]*?envVars:[\s\S]*?- key:\s+BACKEND_SERVICE_ROLE\s+value:\s+export[\s\S]*?- key:\s+PUBLIC_BACKEND_BASE_URL\s+value:\s+https:\/\/snoopy-export\.onrender\.com/,
  "El worker de export debe usar el rol export y publicar URLs contra snoopy-export."
);

console.log("Podcaster montage export backend routing OK.");
