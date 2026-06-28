import assert from "node:assert/strict";
import fs from "node:fs";

const serverSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/backend/server.js",
  "utf8"
);

assert.doesNotMatch(
  serverSource,
  /projectId\s*===\s*["']charly-brown["']\s*\?\s*["']charly-brown\.firebasestorage\.app["']/,
  "backend/server.js no debe depender de un special-case de bucket para charly-brown."
);

assert.match(
  serverSource,
  /function getStorageBucketCandidatesForOptions\(options = \{\}\) \{[\s\S]*options\?\.bucketFromUrl[\s\S]*getStorageBucketCandidates\(\)/,
  "las descargas de Storage deben poder priorizar el bucket recibido desde la URL."
);

assert.match(
  serverSource,
  /await downloadStoragePathToFile\(firebaseObject\.objectPath, targetPath, \{\s*shouldAbort,\s*bucketFromUrl: firebaseObject\.bucket\s*\}\);/,
  "downloadUrlToFile debe pasar bucketFromUrl al fallback Admin SDK."
);

assert.match(
  serverSource,
  /downloadStorageObjectToBuffer\(objectPath, \{ bucketFromUrl \}\)/,
  "proxy-image debe usar el bucket parseado de la URL cuando descarga por Admin SDK."
);

assert.match(
  serverSource,
  /function isAllowedStorageProxyHost\(host = ""\) \{[\s\S]*googleapis\.com[\s\S]*firebasestorage\.app[\s\S]*storage\.googleapis\.com[\s\S]*\}/,
  "proxy-image y proxy-media deben compartir una allowlist de hosts de Storage."
);

assert.match(
  serverSource,
  /function isAllowedRemoteMediaUrl\(url = ""\) \{[\s\S]*ALLOW_LOCAL_MEDIA_URLS[\s\S]*process\.env\.RENDER[\s\S]*isAllowedStorageProxyHost\(host\)/,
  "las URLs locales para descarga remota deben quedar limitadas fuera de Render salvo override explicito."
);

assert.doesNotMatch(
  serverSource,
  /const allowedHost = host\.endsWith\("googleapis\.com"\) \|\| host\.endsWith\("firebasestorage\.app"\)/,
  "no debe quedar una allowlist inline divergente entre proxy-image y proxy-media."
);

console.log("Backend storage route hardcodes audit OK.");
