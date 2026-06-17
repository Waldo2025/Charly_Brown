import assert from "node:assert/strict";
import fs from "node:fs";

const htmlSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster.html",
  "utf8"
);
const podcasterSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster.js",
  "utf8"
);
const montageExportSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-montage-export.js",
  "utf8"
);

assert.match(
  htmlSource,
  /src="podcaster\/podcaster\.js\?v=2026-06-16\.22"/,
  "El entrypoint del podcaster debe romper caché con la versión nueva."
);

assert.match(
  htmlSource,
  /src="podcaster\/podcaster-montage-export\.js\?v=2026-06-16\.22"/,
  "El módulo de export debe usar el mismo cache-buster que el bundle principal."
);

assert.match(
  podcasterSource,
  /from "\.\/podcaster-montage-export\.js\?v=2026-06-16\.22";/,
  "El bundle principal debe importar la versión nueva del módulo de export."
);

assert.match(
  montageExportSource,
  /let montageExportSubmitLocked = false;/,
  "La exportación debe tener un lock de reentrada para evitar submits duplicados."
);

assert.match(
  montageExportSource,
  /if \(window\.montageExportBusy \|\| montageExportSubmitLocked\) return;/,
  "runMontageExport debe bloquear reentradas mientras un submit está en curso."
);

console.log("Podcaster montage export cache-buster OK.");
