import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const editorSource = readFileSync(new URL("../public/podcaster/podcaster-script-editor.js", import.meta.url), "utf8");

if (!source.includes("const activeVisualProposal = resolveActiveVisualProposal(activeRow);")) {
  throw new Error("El inspector de escena todavía no resuelve la propuesta activa desde historial.");
}

if (!editorSource.includes("const activeVisualProposal = window.resolveActiveVisualProposal(creativeRow);")
  && !editorSource.includes("const activeVisualProposal = resolveActiveVisualProposal(creativeRow);")) {
  throw new Error("El editor creativo todavía no resuelve la propuesta activa desde historial.");
}

console.log("Live sync restores row-active-proposal regression OK.");
