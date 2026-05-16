import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster.js",
  "utf8"
);
const legacyCollection = ["podcaster", "sessions", "payloads"].join("_");

assert.doesNotMatch(
  source,
  new RegExp(legacyCollection),
  "Podcaster no debe depender de la coleccion legacy duplicada."
);

assert.match(
  source,
  /await setDoc\(sessionRef, \{/,
  "El guardado directo debe persistir en podcaster_sessions."
);

assert.match(
  source,
  /session: sanitized/,
  "El documento principal debe guardar la sesion completa como fuente unica de verdad."
);

assert.doesNotMatch(
  source,
  /const legacyRef = doc\(firestoreDb,[\s\S]*await setDoc\(legacyRef,/,
  "El guardado directo ya no debe escribir un documento legacy separado."
);

console.log("Podcaster saves only main session doc OK.");
