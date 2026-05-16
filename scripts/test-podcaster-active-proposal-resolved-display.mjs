import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster.js",
  "utf8"
);

assert.match(
  source,
  /function resolveDisplayedVisualProposal\(row = null\)\s*\{/,
  "Debe existir un helper para mantener visible la propuesta seleccionada aunque ya esté marcada como realizada."
);

assert.match(
  source,
  /const explicit = String\(row\?\.visualNotesProposal \|\| ""\)\.trim\(\);\s*if \(explicit\) return explicit;/,
  "La propuesta visual explícitamente seleccionada debe seguir mostrándose aunque esté resuelta."
);

assert.match(
  source,
  /row-active-proposal\$\{isVisualProposalResolved\([^)]*displayedActiveVisualProposal[^)]*\) \? " is-resolved" : ""\}/,
  "La card de propuesta activa debe calcular su estado resuelto usando la propuesta mostrada."
);

console.log("Podcaster active proposal resolved display OK.");
