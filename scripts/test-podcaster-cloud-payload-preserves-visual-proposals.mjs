import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster.js", import.meta.url), "utf8");

if (!source.includes('visualNotesProposal: String(row?.visualNotesProposal || "").slice(0, 4000)')) {
  throw new Error("buildCloudSessionPayload no persiste visualNotesProposal.");
}

if (!source.includes("visualNotesProposals: Array.isArray(row?.visualNotesProposals)")) {
  throw new Error("buildCloudSessionPayload no persiste visualNotesProposals.");
}

if (!source.includes("visualNotesResolvedProposals: normalizeVisualProposalState(row?.visualNotesResolvedProposals)")) {
  throw new Error("buildCloudSessionPayload no persiste visualNotesResolvedProposals.");
}

console.log("Cloud payload preserves visual proposals OK.");
