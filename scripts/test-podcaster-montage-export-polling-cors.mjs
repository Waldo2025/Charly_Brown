import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-montage-export.js",
  "utf8"
);

assert.match(
  source,
  /authFetchJson\(`\/api\/podcaster\/montage\/export-status\?jobId=\$\{encodeURIComponent\(cleanJobId\)\}`,\s*\{\s*auth:\s*false\s*\}\s*\);/m,
  "El polling del export debe omitir Authorization para evitar preflight CORS."
);

assert.doesNotMatch(
  source,
  /"Cache-Control":\s*"no-cache"/,
  "El polling del export no debe incluir Cache-Control en la petición CORS."
);

assert.doesNotMatch(
  source,
  /Pragma:\s*"no-cache"/,
  "El polling del export no debe incluir Pragma en la petición CORS."
);

console.log("Podcaster montage export polling CORS OK.");
