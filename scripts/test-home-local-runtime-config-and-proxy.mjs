import assert from "node:assert/strict";
import fs from "node:fs";

const runtimeConfig = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/runtime-config.js",
  "utf8"
);

const homeSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/home.js",
  "utf8"
);

assert.match(
  runtimeConfig,
  /const __charlyIsLocalRuntime = __charlyHost === "127\.0\.0\.1" \|\| __charlyHost === "localhost";/,
  "runtime-config.js debe detectar localhost para no forzar Render durante pruebas locales."
);

assert.match(
  runtimeConfig,
  /apiBaseUrl: __charlyIsLocalRuntime\s*\?\s*"http:\/\/127\.0\.0\.1:8787\/api"\s*:\s*"https:\/\/charly-brown-gemini-backend\.onrender\.com\/api"/,
  "runtime-config.js debe usar el backend local por defecto cuando la app corre en localhost."
);

assert.doesNotMatch(
  homeSource,
  /window\.__CHARLY_CONFIG__\?\.apiBaseUrl[^\\n]*proxy-media/,
  "home.js no debe construir proxy-media pegándose directo a window.__CHARLY_CONFIG__.apiBaseUrl."
);

assert.match(
  homeSource,
  /const proxyUrl = buildApiUrl\(`\/api\/assets\/proxy-media\?storagePath=\$\{encodeURIComponent\(gsPath\)\}`\);/,
  "home.js debe resolver gs:// usando buildApiUrl para respetar local vs producción."
);

console.log("Home local runtime config and proxy OK.");
