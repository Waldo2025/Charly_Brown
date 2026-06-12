import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/backend/server.js",
  "utf8"
);

assert.match(
  source,
  /function applyAssetCorsHeaders\(req, res\) \{[\s\S]*Access-Control-Allow-Origin[\s\S]*Cross-Origin-Resource-Policy[\s\S]*Access-Control-Expose-Headers[\s\S]*\}/m,
  "El backend debe tener un helper explícito para marcar los assets proxy como CORS-safe."
);

assert.match(
  source,
  /app\.get\("\/api\/assets\/proxy-media", async \(req, res\) => \{[\s\S]*applyAssetCorsHeaders\(req, res\);[\s\S]*catch \(error\) \{[\s\S]*applyAssetCorsHeaders\(req, res\);[\s\S]*return res\.status\(500\)\.json\(\{ error: String\(error\?\.message \|\| "Error en proxy de media\."\) \}\);/m,
  "proxy-media debe aplicar CORS tanto en el flujo normal como en el catch."
);

assert.match(
  source,
  /app\.get\("\/api\/assets\/proxy-image", async \(req, res\) => \{[\s\S]*applyAssetCorsHeaders\(req, res\);[\s\S]*catch \(error\) \{[\s\S]*applyAssetCorsHeaders\(req, res\);[\s\S]*return res\.status\(500\)\.json\(\{ error: String\(error\?\.message \|\| "Error en proxy de imagen\."\) \}\);/m,
  "proxy-image debe aplicar CORS tanto en el flujo normal como en el catch."
);

console.log("Backend asset proxy CORS OK.");
