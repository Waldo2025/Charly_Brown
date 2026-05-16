import assert from "node:assert/strict";
import fs from "node:fs";

const podcasterSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster.js",
  "utf8"
);
const storeSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-session-store.js",
  "utf8"
);

assert.match(
  podcasterSource,
  /function adjustActiveTimelineSceneMediaScale\(direction = 0\) \{[\s\S]*void persistReorderedTimelinePatchToCloud\(refreshed,\s*\{[\s\S]*timelineClipsByRowId:\s*ensureTimelineClipsByRowId\(refreshed,\s*\{\s*persist:\s*false\s*\}\)/,
  "El zoom de escena debe persistir el clip actualizado a cloud para sobrevivir reinicios y otros dispositivos."
);

assert.match(
  storeSource,
  /const localUpdatedAt = Date\.parse\(String\(localSession\?\.updatedAt \|\| ""\)\);[\s\S]*const cloudUpdatedAt = Date\.parse\(String\(cloudSession\?\.updatedAt \|\| ""\)\);[\s\S]*const preferLocalVideoConfig = Number\.isFinite\(localUpdatedAt\) && \(!Number\.isFinite\(cloudUpdatedAt\) \|\| localUpdatedAt > cloudUpdatedAt\);[\s\S]*podcastVideoConfig:\s*preferLocalVideoConfig\s*\?\s*\(localSession\?\.podcastVideoConfig \|\| cloudSession\?\.podcastVideoConfig \|\| \{\}\)\s*:\s*\(cloudSession\?\.podcastVideoConfig \|\| localSession\?\.podcastVideoConfig \|\| \{\}\)/,
  "El bootstrap debe conservar podcastVideoConfig local cuando la sesión local es más nueva que la cloud."
);

console.log("Podcaster scene media zoom persistence OK.");
