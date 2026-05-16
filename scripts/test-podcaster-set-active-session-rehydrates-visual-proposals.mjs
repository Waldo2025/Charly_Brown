import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const storeSource = readFileSync(new URL("../public/podcaster/podcaster-session-store.js", import.meta.url), "utf8");

if (!source.includes("async function setActiveSession(sessionId)")) {
  throw new Error("No existe setActiveSession.");
}

if (!source.includes("mergeVisualProposalFieldsIntoRows(merged, fallback);")) {
  throw new Error("La lógica de fallback visual entre filas debe seguir existiendo.");
}

if (!storeSource.includes("const resolvedRows = mergeSessionRowsWithFallback(cloudRows, localRows);")) {
  throw new Error("El merge cloud/local debe seguir pudiendo recomponer filas desde fallback local.");
}

if (!source.includes("if (nextSession?.isStub) {")) {
  throw new Error("setActiveSession solo debe ir a cloud cuando la sesión es un stub.");
}

console.log("setActiveSession keeps visual fallback while avoiding non-stub rehydrate OK.");
