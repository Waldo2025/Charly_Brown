import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster.js", import.meta.url), "utf8");

assert.match(
  source,
  /finalSessions = await loadCloudSessions\(\);/,
  "init debe cargar sesiones desde Firebase."
);

assert.doesNotMatch(
  source,
  /const prevSessions = prevUid \? loadSessions\(prevUid\) : \[\];[\s\S]*const nextSessions = loadSessions\(nextUid\);[\s\S]*finalSessions = mergeSessionsById\(cloudSessions, localMergedSessions\);/m,
  "init no debe mezclar ni priorizar caché local sobre Firebase."
);

console.log("podcaster init prefers Firebase over local cache OK.");
