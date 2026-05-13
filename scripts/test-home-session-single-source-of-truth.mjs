import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/home.js",
  "utf8"
);
const legacyCollection = ["podcaster", "sessions", "payloads"].join("_");

assert.match(
  source,
  /async function loadFullDashboardPodcasterSession\(sessionId = "", fallbackSession = null\)/,
  "Home debe cargar la sesión multimedia completa antes de abrir el reproductor."
);

assert.doesNotMatch(
  source,
  new RegExp(legacyCollection),
  "Home ya no debe leer ni escribir la coleccion legacy duplicada."
);

assert.match(
  source,
  /const sessionRef = doc\(db, "podcaster_sessions", cleanId\);/,
  "Home debe consultar podcaster_sessions como unica fuente de verdad."
);

assert.match(
  source,
  /const sessionData = data\?\.session && typeof data\.session === "object" \? data\.session : data;/,
  "Home debe construir la sesion completa desde data.session del documento principal."
);

assert.match(
  source,
  /const sessionPlay = await loadFullDashboardPodcasterSession\(id, shallowSession\);/,
  "El botón Ver Video debe abrir la sesión completa, no solo el documento shallow."
);

assert.match(
  source,
  /async function mutateDashboardProposalSession\(activeRowId = "", mutator = null\)/,
  "Home debe centralizar los cambios de propuestas sobre la sesion principal."
);

assert.match(
  source,
  /writeOps\.push\(updateDoc\(sessionRef, \{/,
  "Las propuestas visuales del dashboard deben persistirse en podcaster_sessions."
);

assert.match(
  source,
  /sRowsPath = "session\.script\.rows";/,
  "Home debe escribir propuestas directamente en session.script.rows."
);

console.log("Home session single source of truth OK.");
