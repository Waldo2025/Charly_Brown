import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster.js", import.meta.url), "utf8");

if (!source.includes("lRow.visualNotesProposals = Array.from(new Set([...localProposalHistory, ...cloudProposalHistory]))")) {
  throw new Error("mergeSessionsById no preserva el historial visualNotesProposals al mezclar sesiones.");
}

if (!source.includes("lRow.visualNotesResolvedProposals = Array.from(new Set([...localResolved, ...cloudResolved]))")) {
  throw new Error("mergeSessionsById no preserva visualNotesResolvedProposals al mezclar sesiones.");
}

console.log("Session merge preserves visual proposal history OK.");
