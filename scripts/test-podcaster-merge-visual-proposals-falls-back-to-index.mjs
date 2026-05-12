import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster.js", import.meta.url), "utf8");

if (!source.includes("const targetRowByIndex = nextTargetRows[sourceIndex] || null;")) {
  throw new Error("El merge de propuestas visuales no tiene fallback por índice.");
}

if (!source.includes("const targetRow = targetRowById || targetRowByIndex;")) {
  throw new Error("El merge de propuestas visuales no usa fallback por índice cuando el rowId no coincide.");
}

console.log("Visual proposal merge index fallback regression OK.");
