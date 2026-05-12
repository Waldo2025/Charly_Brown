import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster.js", import.meta.url), "utf8");

if (!source.includes("async function rewriteVisualNotesWithGemini(")) {
  throw new Error("No existe rewriteVisualNotesWithGemini.");
}

if (!source.includes("visualNotesProposal: entry?.visualNotesProposal || \"\"")) {
  throw new Error("La regeneración visual no preserva explícitamente la propuesta activa.");
}

if (!source.includes("visualNotesProposals: Array.isArray(entry?.visualNotesProposals) ? [...entry.visualNotesProposals] : []")) {
  throw new Error("La regeneración visual no preserva explícitamente el historial de propuestas.");
}

if (!source.includes("visualNotesResolvedProposals: normalizeVisualProposalState(entry?.visualNotesResolvedProposals)")) {
  throw new Error("La regeneración visual no preserva explícitamente las propuestas resueltas.");
}

if (!source.includes("visualNotes: normalizedRewrite,")) {
  throw new Error("La regeneración visual debe actualizar el campo visualNotes directamente.");
}

if (!source.includes("visualNotesOriginalText: originalBackup,")) {
  throw new Error("La regeneración visual debe seguir guardando respaldo del elemento visual original.");
}

if (!source.includes("scheduleCloudAutosave(\"script-edit\");")) {
  throw new Error("La regeneración visual no agenda autosave de la sesión.");
}

console.log("Rewrite visual notes preserves proposal state regression OK.");
