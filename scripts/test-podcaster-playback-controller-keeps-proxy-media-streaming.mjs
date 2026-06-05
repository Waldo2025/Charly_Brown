import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-playback-controller.js",
  "utf8"
);

assert.match(
  source,
  /const isProxyMediaUrl = String\(finalUrl \|\| ""\)\.includes\('\/api\/assets\/proxy-media'\);[\s\S]*const isDirectRemoteImage = isImageLikeFinalUrl && !String\(finalUrl \|\| ""\)\.includes\('\/api\/'\);/,
  "El loader debe distinguir explícitamente cuando la reproducción usa proxy-media del backend."
);

assert.match(
  source,
  /if \(isProxyMediaUrl && !isImageLikeFinalUrl\) \{[\s\S]*this\.blobCache\.set\(url,\s*finalUrl\);[\s\S]*if \(cacheKey !== url\) this\.blobCache\.set\(cacheKey,\s*finalUrl\);[\s\S]*return finalUrl;[\s\S]*\}/,
  "Los videos servidos por proxy-media deben mantenerse como URL HTTP directa para aprovechar Range y streaming del navegador."
);

console.log("Podcaster playback controller keeps proxy-media videos streaming OK.");
