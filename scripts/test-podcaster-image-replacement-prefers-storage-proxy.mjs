import assert from "node:assert/strict";
import fs from "node:fs";

const runtimeSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-media-runtime.js",
  "utf8"
);

assert.match(
  runtimeSource,
  /function resolveStaleAwareProxyMediaUrl\(rawUrl = "", storagePath = "", kind = "media", options = \{\}\) \{[\s\S]*const proxyStoragePath = normalizeStorageProxyPath\(cleanStoragePath\);[\s\S]*if \(proxyStoragePath\) \{[\s\S]*const proxyUrl = buildMediaProxyUrl\(`\$\{proxyPath\}\?storagePath=\$\{encodeURIComponent\(proxyStoragePath\)\}/,
  "Las imágenes y videos del podcaster deben poder resolverse por storagePath en el proxy."
);

assert.doesNotMatch(
  runtimeSource,
  /if \(cleanStoragePath && kind !== "image"\)/,
  "El proxy stale-aware no debe excluir imágenes cuando existe storagePath persistido."
);

console.log("Podcaster image replacement prefers storage proxy OK.");
