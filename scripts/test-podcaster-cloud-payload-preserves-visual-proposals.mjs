import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster-session-payload.js", import.meta.url), "utf8");

if (!source.includes('if (typeof nextRow.visualNotesProposal === "string") nextRow.visualNotesProposal = nextRow.visualNotesProposal.slice(0, 4000);')) {
  throw new Error("buildCloudSessionPayload no persiste visualNotesProposal.");
}

if (!source.includes('if (Array.isArray(nextRow.visualNotesProposals)) nextRow.visualNotesProposals = nextRow.visualNotesProposals.slice(0, 100);')) {
  throw new Error("buildCloudSessionPayload no persiste visualNotesProposals.");
}

if (!source.includes('if (Array.isArray(nextRow.visualNotesResolvedProposals)) nextRow.visualNotesResolvedProposals = nextRow.visualNotesResolvedProposals.slice(0, 100);')) {
  throw new Error("buildCloudSessionPayload no persiste visualNotesResolvedProposals.");
}

console.log("Cloud payload preserves visual proposals OK.");
