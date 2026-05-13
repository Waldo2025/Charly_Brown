import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster.js", import.meta.url), "utf8");

if (!source.includes("async function setActiveSession(sessionId)")) {
  throw new Error("No existe setActiveSession.");
}

if (!source.includes("mergeVisualProposalFieldsIntoRows(merged, fallback);")) {
  throw new Error("La rehidratación ya no mezcla propuestas visuales entre sesión remota y fallback.");
}

if (!source.includes("const resolvedRows = mergeSessionRowsWithFallback(hydratedRows, shallowRows);")) {
  throw new Error("setActiveSession no usa fallback shallow cuando la sesión remota llega incompleta.");
}

console.log("setActiveSession rehydrates visual proposals regression OK.");
