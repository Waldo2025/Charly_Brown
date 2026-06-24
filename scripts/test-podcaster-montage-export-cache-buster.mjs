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

const htmlBusterMatch = htmlSource.match(/src="podcaster\/podcaster\.js\?v=([\d.-]+)"/);
const htmlExportBusterMatch = htmlSource.match(/src="podcaster\/podcaster-montage-export\.js\?v=([\d.-]+)"/);
const jsExportBusterMatch = podcasterSource.match(/from "\.\/podcaster-montage-export\.js\?v=([\d.-]+)";/);

assert.ok(htmlBusterMatch, "Debe tener cache-buster para podcaster.js");
assert.ok(htmlExportBusterMatch, "Debe tener cache-buster para podcaster-montage-export.js");
assert.ok(jsExportBusterMatch, "Debe tener import cache-buster en podcaster.js");

assert.equal(htmlBusterMatch[1], htmlExportBusterMatch[1], "El módulo de export debe usar el mismo cache-buster que el bundle principal.");
assert.equal(htmlBusterMatch[1], jsExportBusterMatch[1], "El bundle principal debe importar la versión nueva del módulo de export.");

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
