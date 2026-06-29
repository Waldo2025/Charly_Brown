import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../storage.rules", import.meta.url),
  "utf8"
);

assert.match(
  source,
  /match \/\{allPaths=\*\*\} \{[\s\S]*allow read: if isSignedIn\(\);[\s\S]*allow write: if isSignedIn\(\) && hasAllowedPublicContentType\(\);[\s\S]*\}/m,
  "Storage debe permitir lectura y subida de assets seguros a cualquier usuario autenticado."
);

console.log("Authenticated Storage asset rules OK.");
