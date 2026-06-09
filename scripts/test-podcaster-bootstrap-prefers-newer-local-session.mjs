import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster.js",
  "utf8"
);
const sessionStoreSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-session-store.js",
  "utf8"
);

assert.match(
  sessionStoreSource,
  /const localSessions = loadSessionsFromLocalCache\(uid, deps, nextStorage\);[\s\S]*cloudSessions = await loadSessionsFromCloud\(uid, deps\);[\s\S]*mergeCloudVsLocalSessions\(cloudSessions, localSessions, deps\)/,
  "El bootstrap debe mezclar sesiones locales y cloud prefiriendo la más nueva, no reemplazar local ciegamente."
);

assert.match(
  source,
  /function mergeSessionsById\(primary = \[\], secondary = \[\]\)/,
  "La mezcla local/cloud debe pasar por un helper único de deduplicación por id."
);

console.log("Podcaster bootstrap prefers newer local session OK.");
