import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster.js",
  "utf8"
);

assert.match(
  source,
  /function resolveStaleAwareProxyMediaUrl\(rawUrl = "", storagePath = "", kind = "media", options = \{\}\) \{[\s\S]*if \(cleanStoragePath\) \{[\s\S]*const proxyUrl = buildApiUrl\(`\$\{proxyPath\}\?storagePath=\$\{encodeURIComponent\(cleanStoragePath\)\}`\);/,
  "Las imágenes y videos del podcaster deben poder resolverse por storagePath en el proxy."
);

assert.doesNotMatch(
  source,
  /if \(cleanStoragePath && kind !== "image"\)/,
  "El proxy stale-aware no debe excluir imágenes cuando existe storagePath persistido."
);

console.log("Podcaster image replacement prefers storage proxy OK.");
