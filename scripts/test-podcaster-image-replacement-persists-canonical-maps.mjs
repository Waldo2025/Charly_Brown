import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster-media-editor.js", import.meta.url), "utf8");

if (!/const isImageMedia = mediaType === ['"]image['"]/.test(source)) {
  throw new Error("El reemplazo de escena debe distinguir explícitamente cuando el asset seleccionado es una imagen.");
}

if (!/session\.rowReferenceImageMap\.\$\{currentEditingRowId\}/.test(source)) {
  throw new Error("El reemplazo con PNG debe persistir rowReferenceImageMap para la escena.");
}

if (!/session\.rowReferenceImageListMap\.\$\{currentEditingRowId\}/.test(source)) {
  throw new Error("El reemplazo con PNG debe persistir rowReferenceImageListMap para la escena.");
}

if (!/session\.rowReferenceModeByRowId\.\$\{currentEditingRowId\}/.test(source)
  || !/isImageMedia \? ['"]image['"] : ['"]video['"]/.test(source)) {
  throw new Error("El reemplazo debe persistir rowReferenceModeByRowId con el modo correcto.");
}

if (!/deleteField\(\)/.test(source)) {
  throw new Error("El reemplazo debe limpiar los mapas incompatibles usando deleteField cuando cambie el tipo de asset.");
}

if (/session\.rowReferenceVideoMap\.\$\{currentEditingRowId\}`\]: mediaData/.test(source)) {
  throw new Error("Un PNG no debe seguir guardándose en rowReferenceVideoMap como si fuera video.");
}

console.log("Podcaster image replacement persists canonical maps OK.");
