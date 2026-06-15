import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("/Users/waldolopez/Documents/CharlyBrown/backend/server.js", "utf8");

assert.match(
  source,
  /req\.method === "GET" && String\(req\.path \|\| ""\)\.trim\(\) === "\/scene-library\/list"/,
  "La librería pública debe saltarse el middleware auth de /api/podcaster."
);

assert.match(
  source,
  /app\.get\("\/api\/podcaster\/scene-library\/list"/,
  "Debe existir la ruta pública de scene-library/list."
);

console.log("Podcaster scene-library list public bypass OK.");
