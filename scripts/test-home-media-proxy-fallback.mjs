import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/js/home.js",
  "utf8"
);

assert.match(
  source,
  /function buildDirectFirebaseMediaReference\(rawUrl = "", storagePath = ""\)/,
  "home.js debe normalizar todas las referencias del visor antes de cargar media."
);

assert.match(
  source,
  /function resolveStorageVideoUrl\(downloadUrl, storagePath\) \{\s*return buildDirectFirebaseMediaReference\(downloadUrl, storagePath\);\s*\}/,
  "El video del visor debe usar la referencia directa común."
);

assert.match(
  source,
  /function resolveStorageAudioUrl\(downloadUrl, storagePath\) \{\s*return buildDirectFirebaseMediaReference\(downloadUrl, storagePath\);\s*\}/,
  "El audio del visor debe usar la referencia directa común."
);

assert.match(
  source,
  /const multimediaPlaybackDeps = \{\s*preferDirectFirebaseStorage: true,/,
  "El controlador del visor debe impedir la reconstrucción de proxy-media."
);

const directResolverStart = source.indexOf("function buildDirectFirebaseMediaReference");
const directResolverEnd = source.indexOf("function resolveStaleAwareProxyMediaUrl", directResolverStart);
assert.ok(directResolverStart >= 0 && directResolverEnd > directResolverStart);
assert.doesNotMatch(
  source.slice(directResolverStart, directResolverEnd),
  /buildApiUrl|proxy-media\?storagePath|signed-url\?storagePath/,
  "La resolución directa no debe construir llamadas al backend."
);

console.log("Home direct Firebase media resolution OK.");
