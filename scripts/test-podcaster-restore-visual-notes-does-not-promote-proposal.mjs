import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

if (!source.includes("function resolveEffectiveVisualNotes(row = null) {\n  return resolveVisualNotesForGeneration(row);\n}")) {
  throw new Error("resolveEffectiveVisualNotes no debe priorizar visualNotesProposal.");
}

if (source.includes("visualNotesProposal: entry?.visualNotesProposal || \"\"")) {
  throw new Error("restore/rewrite de visualNotes no debe reinyectar visualNotesProposal en el payload normalizado.");
}

console.log("Restore visual notes does not promote proposal regression OK.");
