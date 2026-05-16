import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

const forbiddenMarkers = [
  "data-action=\"restore-visual-notes\"",
  "aria-label=\"Restaurar elemento visual anterior\"",
  "function restoreVisualNotesOriginalText(",
  "visualNotesOriginalText",
  "visualNotesOriginalStored"
];

for (const marker of forbiddenMarkers) {
  if (source.includes(marker)) {
    throw new Error(`Debe eliminarse toda la lógica de restore visual: ${marker}`);
  }
}

console.log("Visual restore flow removal regression OK.");
