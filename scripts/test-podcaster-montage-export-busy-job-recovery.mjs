import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-montage-export.js",
  "utf8"
);

assert.match(
  source,
  /const activeJobId = String\(detail\?\.activeJobId \|\| apiPayload\?\.activeJobId \|\| ""\)\.trim\(\);/,
  "La exportación debe leer el job activo reportado por el backend busy."
);

assert.match(
  source,
  /const activeJobKind = String\(detail\?\.kind \|\| apiPayload\?\.kind \|\| ""\)\.trim\(\);/,
  "La exportación debe leer el kind del backend busy para no confundir otros jobs con montage export."
);

assert.match(
  source,
  /if \(activeJobId && activeJobKind === "montage_export"\) \{[\s\S]*window\.montageExportJobState\.jobId = activeJobId;[\s\S]*await continueMontageExportPolling\(\);[\s\S]*return;/m,
  "Cuando el backend ya tiene un export activo, el frontend debe continuar el polling en vez de fallar."
);

assert.match(
  source,
  /setMontageExportStatus\(\s*"Ya hay una exportación activa\."[\s\S]*"Estamos retomando el seguimiento del job en curso\."/m,
  "El frontend debe comunicar que está reanudando un export existente."
);

console.log("Podcaster montage export busy job recovery OK.");
