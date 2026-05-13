import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/home.js",
  "utf8"
);

assert.match(
  source,
  /function resolveDashboardActiveVisualProposal\(row = null\)/,
  "Home debe tener un helper para resolver propuesta activa desde historial."
);

assert.match(
  source,
  /function resolveDashboardDisplayedVisualProposal\(row = null\)/,
  "Home debe poder mostrar la propuesta seleccionada aunque esté resuelta o solo exista en historial."
);

assert.match(
  source,
  /const displayedProposal = resolveDashboardDisplayedVisualProposal\(row\);/,
  "El reproductor de Home debe leer la propuesta activa desde el helper compartido del dashboard."
);

assert.match(
  source,
  /const hasAnyProposal = rows\.some\(r => \(r\.visualNotesProposals\?\.length > 0 \|\| !!r\.visualNotesProposal\)\);[\s\S]*const hasPending = hasAnyProposal && rows\.some/,
  "La sección de videos de Home debe detectar propuestas visuales desde el historial de filas de la sesión."
);

console.log("Home displays visual proposals from history OK.");
