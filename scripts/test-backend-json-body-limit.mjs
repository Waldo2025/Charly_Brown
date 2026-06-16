import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/backend/server.js",
  "utf8"
);

assert.match(
  source,
  /const MAX_BODY = "48mb";/,
  "El backend debe usar un límite JSON suficientemente amplio para exports de montage."
);

assert.match(
  source,
  /app\.use\(\(error, req, res, next\) => \{[\s\S]*PayloadTooLargeError[\s\S]*payload_too_large[\s\S]*\}\);/m,
  "El backend debe convertir PayloadTooLargeError en una respuesta 413 limpia y estable."
);

console.log("Backend JSON body limit OK.");
