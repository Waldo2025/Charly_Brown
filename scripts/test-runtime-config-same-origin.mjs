import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("/Users/waldolopez/Documents/CharlyBrown/public/js/runtime-config.js", "utf8");

assert.match(
  source,
  /apiBaseUrl:\s*__charlyIsLocalRuntime\s*\?\s*"http:\/\/127\.0\.0\.1:8787\/api"\s*:\s*"\/api"/,
  "En producción el runtime debe usar el proxy same-origin /api."
);

assert.match(
  source,
  /allowSameOriginApi:\s*true/,
  "El runtime debe permitir same-origin API en producción."
);

console.log("Runtime config same-origin OK.");
