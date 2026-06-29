import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../firestore.rules", import.meta.url),
  "utf8"
);

assert.match(
  source,
  /match \/podcaster_sessions\/\{sessionId\} \{[\s\S]*allow read: if isSignedIn\(\);[\s\S]*allow create: if isSignedIn\(\) && isPodcasterSessionShape\(request\.resource\.data, sessionId\);[\s\S]*allow update: if isSignedIn\(\) &&[\s\S]*request\.resource\.data\.ownerId == resource\.data\.ownerId[\s\S]*isPodcasterSessionShape\(request\.resource\.data, sessionId\);/m,
  "Firestore debe permitir sesiones Podcaster a usuarios autenticados sin exigir owner para leer/crear/actualizar."
);

console.log("Authenticated Podcaster Firestore session rules OK.");
