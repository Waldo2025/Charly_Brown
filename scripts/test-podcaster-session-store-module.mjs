import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../public/podcaster/podcaster-session-store.js", import.meta.url),
  "utf8"
);

[
  "loadSessionsFromLocalCache",
  "persistSessionsToLocalCache",
  "loadSessionsFromCloud",
  "loadSingleSessionFromCloud",
  "mergeCloudVsLocalSessions",
  "computeSessionFingerprint",
  "loadSessionSyncMeta",
  "persistSessionSyncMeta",
  "markSessionDirty",
  "saveSessionManuallyToCloud",
  "replaceLocalSessionFromCloud",
  "bootstrapSessions",
  "createPodcasterSessionStore"
].forEach((name) => {
  assert.match(
    source,
    new RegExp(`function ${name}\\(|export \\{[\\s\\S]*\\b${name}\\b`, "m"),
    `El session store debe exponer ${name}.`
  );
});

assert.match(
  source,
  /const storageAdapter = deps\.storageAdapter \|\| createLocalStorageSessionAdapter\(/,
  "El session store debe encapsular un adapter de almacenamiento local."
);

console.log("Podcaster session store module exports the expected contract OK.");
