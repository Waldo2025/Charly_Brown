import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

if (!source.includes("lRow.visualNotesProposals = Array.from(new Set([...localProposalHistory, ...cloudProposalHistory]))")) {
  throw new Error("mergeSessionsById no preserva el historial visualNotesProposals al mezclar sesiones.");
}

if (!source.includes("lRow.visualNotesResolvedProposals = Array.from(new Set([...localResolved, ...cloudResolved]))")) {
  throw new Error("mergeSessionsById no preserva visualNotesResolvedProposals al mezclar sesiones.");
}

if (!source.includes("if (cRow.visualNotesProposal !== undefined) {")) {
  throw new Error("mergeSessionsById debe permitir que la nube limpie visualNotesProposal cuando ya no hay propuesta activa.");
}

console.log("Session merge preserves visual proposal history OK.");
