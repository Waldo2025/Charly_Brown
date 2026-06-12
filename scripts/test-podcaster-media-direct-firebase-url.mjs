import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster.js",
  "utf8"
);

assert.match(
  source,
  /const isFirebaseStorageUrl = host\.endsWith\("googleapis\.com"\) \|\| host\.endsWith\("firebasestorage\.app"\);\s*if \(isFirebaseStorageUrl\) return clean;/m,
  "Una URL pública de Firebase debe preferir la descarga directa en vez del proxy."
);

console.log("Podcaster media direct Firebase URL OK.");
