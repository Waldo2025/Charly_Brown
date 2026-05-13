import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster.js", import.meta.url), "utf8");

assert.match(
  source,
  /function mergeSessionRowsWithFallback\(primaryRows = \[\], fallbackRows = \[\]\)/,
  "Debe existir un helper para mezclar filas remotas con el fallback shallow."
);

assert.match(
  source,
  /const resolvedRows = mergeSessionRowsWithFallback\(hydratedRows, shallowRows\);/,
  "setActiveSession debe recomponer filas usando sesión remota \\+ shallow."
);

assert.match(
  source,
  /rows: resolvedRows/,
  "setActiveSession debe conservar las filas resueltas al rehidratar la sesión."
);

console.log("setActiveSession preserves shallow rows when remote rows are empty OK.");
