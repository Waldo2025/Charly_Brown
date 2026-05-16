import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

if (!source.includes("mergeVisualProposalFieldsIntoRows(nextRows, shallowRows)")) {
  throw new Error("El listener activo no fusiona propuestas visuales nuevas hacia la sesión abierta.");
}

if (!source.includes("upsertActiveSession((current) => ({")) {
  throw new Error("El listener activo no persiste en memoria la rehidratación de propuestas.");
}

if (!source.includes("const activeVisualProposal = resolveActiveVisualProposal(activeRow);")) {
  throw new Error("El inspector de escena todavía no resuelve la propuesta activa desde historial.");
}

if (!source.includes("const activeVisualProposal = resolveActiveVisualProposal(creativeRow);")) {
  throw new Error("El editor creativo todavía no resuelve la propuesta activa desde historial.");
}

console.log("Live sync restores row-active-proposal regression OK.");
