import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/home.js",
  "utf8"
);

assert.match(
  source,
  /import \{ authFetchJson, buildApiUrl, hasAvailableApiBase \} from "\.\/api-client\.js";/,
  "home.js debe importar buildApiUrl y hasAvailableApiBase para resolver media sin filtrar gs://."
);

assert.match(
  source,
  /const staleProxyMediaUrls = new Set\(\);[\s\S]*function markStaleProxyMediaUrl\(url = "", reason = "proxy-media-404", payload = \{\}\)/,
  "home.js debe mantener estado local de proxy-media stale para fallback del dashboard."
);

assert.match(
  source,
  /function resolveStorageVideoUrl\(downloadUrl, storagePath\) \{[\s\S]*const cleanStoragePath = deriveStoragePathFromMediaSource\(clean, storagePath \|\| ""\);[\s\S]*if \(cleanStoragePath\) \{[\s\S]*return resolveStaleAwareProxyMediaUrl\(clean, cleanStoragePath, "media"\);[\s\S]*return buildApiUrl\(`\/api\/assets\/proxy-media\?url=\$\{encodeURIComponent\(parsed\.toString\(\)\)\}`\);/,
  "El video del dashboard debe usar proxy-media y fallback por URL en lugar de devolver gs://."
);

assert.match(
  source,
  /function resolveStorageAudioUrl\(downloadUrl, storagePath\) \{[\s\S]*const staleStorageProxyUrl = buildApiUrl\(`\/api\/assets\/proxy-media\?storagePath=\$\{encodeURIComponent\(cleanStoragePath\)\}`\);[\s\S]*if \(isMarkedStaleProxyMediaUrl\(staleStorageProxyUrl\) && clean\) \{[\s\S]*return buildApiUrl\(`\/api\/assets\/proxy-media\?url=\$\{encodeURIComponent\(parsed\.toString\(\)\)\}`\);/,
  "El audio del dashboard debe caer al proxy por URL cuando el storagePath ya falló."
);

assert.match(
  source,
  /resolveStorageAudioUrl: \(url, path\) => resolveStorageAudioUrl\(url, path\),[\s\S]*markStaleProxyMediaUrl,/,
  "El playback controller del dashboard debe poder marcar proxies stale para evitar loops con la misma URL rota."
);

console.log("Home media proxy fallback OK.");
