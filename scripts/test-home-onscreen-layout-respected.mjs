import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/home.js",
  "utf8"
);

assert.match(
  source,
  /const existingOnScreenTextLayouts = normalizeSharedLayoutMap\(s\?\.podcastVideoConfig\?\.timelineOnScreenTextLayoutByRowId[\s\S]*?\|\| \{\}\);/,
  "Home debe leer los layouts guardados por fila desde podcastVideoConfig."
);

assert.match(
  source,
  /getOnScreenTextLayoutForRow:\s*\(s,\s*rowId\)\s*=>\s*\{[\s\S]*const key = String\(rowId \|\| ""\)\.trim\(\);[\s\S]*return existingOnScreenTextLayouts\?\.\[key\] \|\| null;[\s\S]*\}/m,
  "Home debe exponer un resolver de layout por fila para el reproductor compartido."
);

console.log("Home onscreen layout respected OK.");
