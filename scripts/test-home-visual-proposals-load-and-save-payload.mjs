import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/home.js",
  "utf8"
);

assert.match(
  source,
  /async function loadFullDashboardPodcasterSession\(sessionId = "", fallbackSession = null\)/,
  "Home debe cargar el payload completo de sesiones multimedia antes de abrir el reproductor."
);

assert.match(
  source,
  /const payloadRef = doc\(db, "podcaster_sessions_payloads", cleanId\);/,
  "Home debe consultar `podcaster_sessions_payloads` para recuperar propuestas visuales completas."
);

assert.match(
  source,
  /const sessionPlay = await loadFullDashboardPodcasterSession\(id, shallowSession\);/,
  "El botón Ver Video debe abrir la sesión completa, no solo el documento shallow."
);

assert.match(
  source,
  /async function mutateDashboardProposalSession\(activeRowId = "", mutator = null\)/,
  "Home debe centralizar los cambios de propuestas sobre el payload de la sesión."
);

assert.match(
  source,
  /writeOps\.push\(updateDoc\(payloadRef, \{\s*payload: sourceSession,/,
  "Las propuestas visuales del dashboard deben persistirse en el payload completo."
);

assert.match(
  source,
  /"session\.script\.rows": proposalRows/,
  "Home debe dejar un espejo ligero de propuestas en el documento shallow para rehidratación."
);

console.log("Home visual proposals load/save payload OK.");
