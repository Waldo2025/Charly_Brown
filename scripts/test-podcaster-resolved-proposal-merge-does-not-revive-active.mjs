import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

if (!source.includes("targetRow.visualNotesProposal = resolveActiveVisualProposal({")) {
  throw new Error("mergeVisualProposalFieldsIntoRows debe recomputar la propuesta activa tras mezclar historial y resueltas.");
}

if (!source.includes("if (cRow.visualNotesProposal !== undefined) {")) {
  throw new Error("mergeSessionsById debe poder propagar también el vaciado explícito de visualNotesProposal desde cloud.");
}

if (!source.includes("lRow.visualNotesProposal = resolveActiveVisualProposal(lRow);")) {
  throw new Error("mergeSessionsById debe recalcular la propuesta activa después de unir propuestas resueltas.");
}

console.log("Resolved proposal merge does not revive active state OK.");
