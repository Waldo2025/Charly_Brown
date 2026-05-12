import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster.js",
  "utf8"
);

assert.match(
  source,
  /if \(options\.lightweight && els\.podcastVideoTimeline\) \{[\s\S]*const rows = activeSession\?\.script\?\.rows \|\| \[];/,
  "El render lightweight del timeline debe declarar rows antes de usarlo."
);

assert.match(
  source,
  /if \(cleanStoragePath\) \{[\s\S]*const staleStorageProxyUrl = buildApiUrl\(`\/api\/assets\/proxy-media\?storagePath=\$\{encodeURIComponent\(cleanStoragePath\)\}`\);[\s\S]*if \(isMarkedStaleProxyMediaUrl\(staleStorageProxyUrl\) && clean\) \{[\s\S]*return buildApiUrl\(`\/api\/assets\/proxy-media\?url=\$\{encodeURIComponent\(parsed\.toString\(\)\)\}`\);/,
  "Cuando el proxy por storagePath ya está marcado como roto, el audio debe caer a proxy por URL directa si existe."
);

console.log("Podcaster timeline rows order and audio fallback OK.");
