import assert from "node:assert/strict";
import fs from "node:fs";

const store = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-session-store.js",
  "utf8"
);

const saveStart = store.indexOf("async function saveSessionManuallyToCloud(");
const saveEnd = store.indexOf("\nfunction createPodcasterSessionStore", saveStart);
assert.ok(saveStart >= 0 && saveEnd > saveStart, "Debe existir saveSessionManuallyToCloud.");
const saveBody = store.slice(saveStart, saveEnd);

assert.match(
  saveBody,
  /const useSessionSaveApi = options\?\.useApi === true && deps\.hasAvailableApiBase\?\.\(\);/,
  "El guardado manual sólo debe intentar el endpoint API cuando se pide explícitamente con useApi:true."
);

assert.match(
  saveBody,
  /else \{\s*response = await saveSessionDirectToCloud\(payload, deps\);\s*\}/m,
  "El guardado manual por defecto debe ir directo a Firebase."
);

assert.doesNotMatch(
  saveBody,
  /preferRemote:\s*true|buildApiUrlPreferRemote|snoopy-export\.onrender\.com/,
  "El guardado de sesión no debe forzar llamadas remotas a snoopy-export."
);

assert.match(
  saveBody,
  /sameOrigin:\s*true/,
  "El endpoint API opcional de guardado debe ser same-origin para evitar 401/CORS directos contra Render."
);

console.log("Podcaster session save direct Firebase no remote 401 OK.");
