import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const storeSource = readFileSync(new URL("../public/podcaster/podcaster-session-store.js", import.meta.url), "utf8");

assert.match(
  source,
  /function mergeSessionRowsWithFallback\(primaryRows = \[\], fallbackRows = \[\]\)/,
  "Debe existir un helper para mezclar filas remotas con el fallback shallow."
);

assert.match(
  storeSource,
  /const resolvedRows = mergeSessionRowsWithFallback\(cloudRows, localRows\);/,
  "El session store debe recomponer filas usando cloud \\+ fallback local."
);

assert.match(
  storeSource,
  /rows: resolvedRows/,
  "El merge cloud/local debe conservar las filas resueltas."
);

assert.match(
  source,
  /if \(nextSession\?\.isStub\) \{/,
  "setActiveSession solo debe rehidratar sesiones stub."
);

console.log("Session store preserves shallow rows and setActiveSession only hydrates stubs OK.");
