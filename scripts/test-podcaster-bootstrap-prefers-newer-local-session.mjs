import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster.js",
  "utf8"
);

assert.match(
  source,
  /let finalSessions = loadSessions\(nextUid\);[\s\S]*const cloud = await loadCloudSessions\(\);[\s\S]*finalSessions = mergeSessionsById\(finalSessions, cloud\);/,
  "El bootstrap debe mezclar sesiones locales y cloud prefiriendo la más nueva, no reemplazar local ciegamente."
);

assert.match(
  source,
  /function mergeSessionsById\(primary = \[\], secondary = \[\]\)/,
  "La mezcla local/cloud debe pasar por un helper único de deduplicación por id."
);

console.log("Podcaster bootstrap prefers newer local session OK.");
