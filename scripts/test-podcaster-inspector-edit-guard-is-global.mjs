import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster.js", import.meta.url), "utf8");

if (!source.includes("function isPodcasterEditingTextField(target = null)")) {
  throw new Error("Debe existir un helper global simple para detectar edición de campos.");
}

if (!source.includes("function isPodcastStudioInspectorEditing()")) {
  throw new Error("Debe existir un helper global simple para detectar edición activa del inspector.");
}

if (!source.includes("const isEditing = isPodcastStudioInspectorEditing();")) {
  throw new Error("syncPodcastStudioInspector debe usar el helper global de edición activa.");
}

if (!source.includes("if (!isPodcastStudioInspectorEditing()) {")) {
  throw new Error("El listener remoto no debe re-renderizar el inspector mientras se escribe.");
}

if (source.includes("const isEditingTextField = (target) => {")) {
  throw new Error("No debe quedar un helper local duplicado dentro de attachEvents.");
}

if (source.includes("const isInspectorEditing = () => {")) {
  throw new Error("No debe quedar un helper local duplicado de edición del inspector.");
}

console.log("Inspector edit guard global regression OK.");
