import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-montage-export.js",
  "utf8"
);

assert.match(
  source,
  /if \(errorStatus === 404\) \{[\s\S]*?Se perdió el estado del export en el backend\./m,
  "El polling del export debe detenerse ante cualquier 404 para no quedar en reintento infinito."
);

assert.match(
  source,
  /errorCode === "job_not_found"[\s\S]*?El backend se reinició durante la exportación\. Vuelve a exportar\./m,
  "El 404 job_not_found debe seguir mostrando el mensaje de reinicio del backend."
);

console.log("Podcaster montage export 404 recovery OK.");
