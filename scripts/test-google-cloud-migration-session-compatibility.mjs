import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [firebaserc, server, exportJobStore, sessionStore, firestoreRules, storageRules] = await Promise.all([
  read(".firebaserc"),
  read("backend/server.js"),
  read("backend/montage-export/job-store-firestore.js"),
  read("public/podcaster/podcaster-session-store.js"),
  read("firestore.rules"),
  read("storage.rules")
]);

assert.equal(
  JSON.parse(firebaserc)?.projects?.default,
  "charly-brown",
  "La migración debe continuar usando el proyecto Firebase charly-brown."
);

for (const collection of [
  "podcaster_sessions",
  "podcaster_scene_library",
  "podcaster_music_library"
]) {
  assert.match(
    server,
    new RegExp(`collection\\(\\"${collection}\\"\\)`),
    `El backend debe conservar la colección ${collection}.`
  );
}
assert.match(
  exportJobStore,
  /DEFAULT_COLLECTION = "podcaster_export_jobs"/,
  "El backend debe conservar la colección podcaster_export_jobs."
);

assert.match(
  sessionStore,
  /collection\(deps\.firestoreDb, "podcaster_sessions"\)/,
  "El frontend debe seguir leyendo las sesiones desde podcaster_sessions."
);
assert.match(
  sessionStore,
  /STORAGE_KEY_BASE \|\| "cb_podcaster_sessions_v2"/,
  "La caché local v2 debe conservarse para abrir sesiones existentes."
);
assert.match(
  sessionStore,
  /LEGACY_STORAGE_KEY \|\| "cb_podcaster_sessions_v1"/,
  "La compatibilidad con sesiones locales v1 debe conservarse."
);

assert.match(
  firestoreRules,
  /match \/podcaster_sessions\/\{sessionId\}/,
  "Firestore debe mantener las reglas de podcaster_sessions."
);
assert.match(
  firestoreRules,
  /match \/podcaster_export_jobs\/\{jobId\}/,
  "Firestore debe mantener visibles los estados de exportación existentes."
);
assert.match(
  storageRules,
  /match \/podcaster\/sessions\/\{sessionId\}/,
  "Storage debe conservar el prefijo podcaster/sessions."
);

console.log("Google Cloud migration session compatibility baseline OK.");
