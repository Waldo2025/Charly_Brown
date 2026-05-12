import assert from "node:assert/strict";
import fs from "node:fs";

const front = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster.js",
  "utf8"
);

const backend = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/backend/server.js",
  "utf8"
);

assert.match(
  backend,
  /visualNotesProposal: clampText\(row\?\.visualNotesProposal \|\| "", 5000\),/,
  "El backend debe preservar visualNotesProposal al guardar la sesión."
);

assert.match(
  backend,
  /visualNotesProposals: normalizeProposalList\(row\?\.visualNotesProposals\),/,
  "El backend debe preservar el historial visualNotesProposals al guardar la sesión."
);

assert.match(
  backend,
  /visualNotesResolvedProposals: normalizeProposalList\(row\?\.visualNotesResolvedProposals\),/,
  "El backend debe preservar visualNotesResolvedProposals al guardar la sesión."
);

assert.match(
  front,
  /const proposalRows = Array\.isArray\(sanitized\?\.script\?\.rows\)[\s\S]*visualNotesProposal: String\(row\?\.visualNotesProposal \|\| ""\)\.trim\(\),/,
  "El guardado directo debe dejar un espejo ligero de propuestas en el documento shallow."
);

assert.match(
  front,
  /session:\s*\{\s*id: sanitized\.id,\s*title: sanitized\.title,\s*script:\s*\{\s*rows: proposalRows\s*\}\s*\}/s,
  "El guardado directo debe rehidratar filas con propuestas en podcaster_sessions.session.script.rows."
);

console.log("Podcaster save preserves visual proposals OK.");
