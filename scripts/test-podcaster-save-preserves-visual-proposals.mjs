import assert from "node:assert/strict";
import fs from "node:fs";

const store = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-session-store.js",
  "utf8"
);

const backend = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/backend/server.js",
  "utf8"
);

assert.match(
  backend,
  /nextRow\.visualNotesProposal = clampText\(row\?\.visualNotesProposal \|\| "", 5000\);/,
  "El backend debe preservar visualNotesProposal al guardar la sesión."
);

assert.match(
  backend,
  /nextRow\.visualNotesProposals = normalizeProposalList\(row\?\.visualNotesProposals\);/,
  "El backend debe preservar el historial visualNotesProposals al guardar la sesión."
);

assert.match(
  backend,
  /nextRow\.visualNotesResolvedProposals = normalizeProposalList\(row\?\.visualNotesResolvedProposals\);/,
  "El backend debe preservar visualNotesResolvedProposals al guardar la sesión."
);

assert.match(
  store,
  /const rawPayload = deps\.buildCloudSessionPayload\(target\);[\s\S]*body: JSON\.stringify\(\{ session: payload \}\)/s,
  "El guardado manual debe enviar el payload completo de sesión al backend."
);

assert.match(
  store,
  /: await saveSessionDirectToCloud\(payload, deps\)/,
  "El fallback directo de guardado también debe vivir dentro de podcaster-session-store.js."
);

assert.match(
  store,
  /resolveStorageUidCandidates\(uid, deps\)\.forEach\(\(candidateUid\) => \{/,
  "Guardar en Firebase debe reflejar la sesión también en los scopes relevantes de localStorage."
);

assert.match(
  store,
  /\?\s*\{\s*\.\.\.payload,[\s\S]*cloudMeta:/s,
  "El estado local tras guardar debe rehidratarse desde `payload`, incluyendo las propuestas visuales."
);

console.log("Podcaster save preserves visual proposals OK.");
