import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/home.js",
  "utf8"
);

assert.match(
  source,
  /initializeFirestore,\s*collection,[\s\S]*persistentLocalCache,\s*persistentMultipleTabManager/,
  "Home debe importar la caché persistente multi-tab de Firestore."
);

assert.match(
  source,
  /const db = initializeFirestore\(app,\s*\{\s*localCache:\s*persistentLocalCache\(\{\s*tabManager:\s*persistentMultipleTabManager\(\)\s*\}\)\s*\}\);/m,
  "Home debe inicializar Firestore con caché persistente multi-tab."
);

assert.doesNotMatch(
  source,
  /enableIndexedDbPersistence\(/,
  "Home ya no debe usar enableIndexedDbPersistence single-tab."
);

console.log("Home firestore multitab cache OK.");
