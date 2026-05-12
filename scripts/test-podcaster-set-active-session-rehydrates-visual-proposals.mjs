import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster.js", import.meta.url), "utf8");

if (!source.includes("async function setActiveSession(sessionId)")) {
  throw new Error("No existe setActiveSession.");
}

if (!source.includes("mergeVisualProposalFieldsIntoRows(nextSession.script.rows, cloudRows)")) {
  throw new Error("setActiveSession no rehidrata propuestas visuales para sesiones locales no-stub.");
}

console.log("setActiveSession rehydrates visual proposals regression OK.");
