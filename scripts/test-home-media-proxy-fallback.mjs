import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/js/home.js",
  "utf8"
);

assert.match(
  source,
  /import \{[\s\S]*buildApiUrl[\s\S]*hasAvailableApiBase[\s\S]*\} from "\.\/api-client\.js";/,
  "home.js debe importar buildApiUrl y hasAvailableApiBase para resolver media del dashboard."
);

assert.match(
  source,
  /const staleProxyMediaUrls = new Set\(\);[\s\S]*function markStaleProxyMediaUrl\(url = "", reason = "proxy-media-404", payload = \{\}\)/,
  "home.js debe mantener estado local de proxy-media stale para fallback del dashboard."
);

assert.match(
  source,
  /function resolveStorageVideoUrl\(downloadUrl, storagePath\) \{[\s\S]*const cleanStoragePath = deriveStoragePathFromMediaSource\(clean, storagePath \|\| ""\);[\s\S]*if \(clean && cleanIsStorageUrl && hasFirebaseDownloadToken\(clean\)\) \{[\s\S]*return resolveStaleAwareProxyMediaUrl\(clean, cleanStoragePath, "media"\);[\s\S]*if \(cleanStoragePath\) \{[\s\S]*return resolveStaleAwareProxyMediaUrl\(clean, cleanStoragePath, "media"\);[\s\S]*if \(isStorageUrl \|\| hasVideoExt\) \{[\s\S]*return resolveStaleAwareProxyMediaUrl\(parsed\.toString\(\), "", "media"\);/s,
  "El video del dashboard debe preferir URLs tokenizadas directas y usar proxy-media same-origin solo como fallback."
);

assert.match(
  source,
  /function resolveStaleAwareProxyMediaUrl\(rawUrl = "", storagePath = "", kind = "media"\) \{[\s\S]*const storageProxyUrl = buildApiUrl\(`\$\{proxyPath\}\?storagePath=\$\{encodeURIComponent\(proxyStoragePath\)\}`\);[\s\S]*return buildApiUrl\(`\$\{proxyPath\}\?url=\$\{encodeURIComponent\(parsed\.toString\(\)\)\}`\);/s,
  "Los fallbacks proxy-media del dashboard deben quedar same-origin con buildApiUrl."
);

assert.match(
  source,
  /async function resolveFirebaseStorageUrl\(gsPath = ""\) \{[\s\S]*return await getDownloadURL\(ref\(storage, objectPath\)\);[\s\S]*\}/s,
  "home.js debe resolver rutas gs:// con Firebase Storage SDK directo."
);

assert.match(
  source,
  /resolveFirebaseStorageUrl: async \(gsPath\) => \{\s*return resolveFirebaseStorageUrl\(gsPath\);\s*\}/,
  "El playback controller del dashboard debe delegar la resolución de Storage al helper directo por SDK."
);

console.log("Home media proxy fallback OK.");
