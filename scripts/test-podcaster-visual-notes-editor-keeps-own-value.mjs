import { readFileSync } from "node:fs";

const js = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

if (!/function resolveVisualNotesEditorValue\(row = null\)/.test(js)) {
  throw new Error("Falta un helper para resolver el valor exacto que debe mostrarse en el editor de visualNotes.");
}

if (!/visualNotesEditedStored === true[\s\S]*visualNotesEditedText/.test(js)
  || !/return String\(row\?\.visualNotes \|\| ""\)\.replace/.test(js)) {
  throw new Error("El valor del editor de visualNotes debe priorizar la edición guardada y luego el visualNotes oficial.");
}

if (/data-field="visualNotes"[^`]*resolveVisualNotesForGeneration\(/.test(js)) {
  throw new Error("El textarea de visualNotes no debe poblarse con fallbacks de generación derivados del guión.");
}

if (!/data-field="visualNotes"[\s\S]*resolveVisualNotesEditorValue\(/.test(js)) {
  throw new Error("El textarea de visualNotes debe usar el valor exacto del editor.");
}

console.log("Podcaster visual notes editor keeps own value OK.");
