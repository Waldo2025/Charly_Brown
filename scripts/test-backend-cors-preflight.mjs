import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/backend/server.js",
  "utf8"
);

assert.match(
  source,
  /allowedHeaders:\s*\[[\s\S]*?"Cache-Control"[\s\S]*?"Pragma"[\s\S]*?"Expires"[\s\S]*?\]/m,
  "El backend debe permitir Cache-Control/Pragma/Expires en preflight CORS."
);

assert.match(
  source,
  /app\.options\("\*",\s*cors\(corsOptions\)\);/,
  "El backend debe responder OPTIONS de forma explícita con CORS."
);

console.log("Backend CORS preflight OK.");
