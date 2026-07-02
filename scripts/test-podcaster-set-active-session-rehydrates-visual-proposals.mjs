import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const storeSource = readFileSync(new URL("../public/podcaster/podcaster-session-store.js", import.meta.url), "utf8");

if (!source.includes("async function setActiveSession(sessionId, options = {})")) {
  throw new Error("No existe setActiveSession.");
}

if (!source.includes("mergeVisualProposalFieldsIntoRows(merged, fallback);")) {
  throw new Error("La lógica de fallback visual entre filas debe seguir existiendo.");
}

if (!/const resolvedRows = mergeRowsByUpdatedAt\(\s*mergeSessionRowsWithFallback\(cloudRows, localRows\),\s*localRows\s*\);/.test(storeSource)) {
  throw new Error("El merge cloud/local debe seguir pudiendo recomponer filas desde fallback local.");
}

if (!source.includes("if (options.forceHydrate === true || shouldHydrateSessionFromCloud(nextSession)) {")) {
  throw new Error("setActiveSession debe ir a cloud cuando la sesión es stub, caché vacía o viene solicitada por URL.");
}

if (!source.includes("const targetSession = getActiveSession() || nextSession;")) {
  throw new Error("setActiveSession debe re-leer la sesión activa después del await de cloud.");
}

if (!source.includes("mergeCloudSessionOverLocalCache(cloudSession, targetSession)")) {
  throw new Error("La hidratación cloud debe mezclarse con la sesión activa vigente, no con una referencia vieja.");
}

if (!source.includes("Object.assign(targetSession,")) {
  throw new Error("La sesión activa vigente debe recibir los datos hidratados.");
}

console.log("setActiveSession keeps visual fallback while hydrating empty cloud cache OK.");
