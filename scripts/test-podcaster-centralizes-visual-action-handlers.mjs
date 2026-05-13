import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster.js", import.meta.url), "utf8");

if (!source.includes("async function handleSharedCreativeRowAction")) {
  throw new Error("Debe existir un despachador compartido para acciones de filas creativas.");
}

if (!source.includes("await handleSharedCreativeRowAction(event.target)")) {
  throw new Error("Los listeners deben delegar al despachador compartido.");
}

const duplicatedInlineHandlers = [
  "const restoreVisualBtn =",
  "const applyProposalBtn =",
  "const applyProposalTextBtn =",
  "const deleteProposalTextBtn =",
  "const rewriteVisualBtn ="
];

for (const marker of duplicatedInlineHandlers) {
  if (source.includes(marker)) {
    throw new Error(`Quedó lógica inline duplicada sin centralizar: ${marker}`);
  }
}

console.log("Creative row action handlers centralization regression OK.");
