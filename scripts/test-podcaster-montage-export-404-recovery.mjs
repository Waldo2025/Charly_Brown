import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-montage-export.js",
  "utf8"
);

assert.match(
  source,
  /const MONTAGE_EXPORT_JOB_NOT_FOUND_MAX_RETRIES = 4;/,
  "El polling del export debe acotar los retries de job_not_found."
);

assert.match(
  source,
  /scheduleMontageExportJobNotFoundRetry\(cleanJobId, jobNotFoundCount\);/,
  "El polling del export debe reintentar job_not_found antes de fallar."
);

assert.match(
  source,
  /El job ya no existe en el backend\. Inicia una nueva exportación\./,
  "El 404 job_not_found debe terminar con el mensaje de exportación nueva."
);

console.log("Podcaster montage export 404 recovery OK.");
