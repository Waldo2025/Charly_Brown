import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster.js", import.meta.url), "utf8");

if (!source.includes("async function rewriteVisualNotesWithGemini(")) {
  throw new Error("No existe rewriteVisualNotesWithGemini.");
}

if (!source.includes("visualNotes: entry?.visualNotes || \"\",")) {
  throw new Error("La regeneración visual debe conservar el visual oficial y no sobrescribirlo.");
}

if (!source.includes("visualNotesEditedText: normalizedRewrite,")) {
  throw new Error("La regeneración visual debe guardar el rewrite como override editado.");
}

if (!source.includes("visualNotesEditedStored: true")) {
  throw new Error("La regeneración visual debe marcar que existe override editado.");
}

if (source.includes("visualNotesOriginalText")) {
  throw new Error("La regeneración visual ya no debe depender del respaldo de restore.");
}

if (source.includes("visualNotes: normalizedRewrite,")) {
  throw new Error("La regeneración visual no debe sustituir el visual oficial directamente.");
}

if (!source.includes("scheduleCloudAutosave(\"script-edit\");")) {
  throw new Error("La regeneración visual no agenda autosave de la sesión.");
}

console.log("Rewrite visual notes preserves proposal state regression OK.");
