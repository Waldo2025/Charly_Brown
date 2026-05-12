import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster.js", import.meta.url), "utf8");

if (!source.includes("function resolveActiveVisualProposal(")) {
  throw new Error("Falta el helper para restaurar la propuesta visual activa desde el historial.");
}

if (!source.includes("visualNotesProposal: resolveActiveVisualProposal(row)")) {
  throw new Error("normalizeCreativeRow no restaura la propuesta activa desde el historial.");
}

if (source.includes('visualNotesProposal: ""')) {
  throw new Error("Editar visualNotes todavía limpia la propuesta activa automáticamente.");
}

console.log("Visual proposal persistence and restore regression OK.");
