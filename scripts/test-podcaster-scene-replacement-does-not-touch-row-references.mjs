import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster-media-replacement.js", import.meta.url), "utf8");

if (!/const isImageMedia = mediaType === ['"]image['"]/.test(source)) {
  throw new Error("El reemplazo de escena debe distinguir explícitamente cuando el asset seleccionado es una imagen.");
}

if (!/session\.dialogueVideoMap\.\$\{currentEditingRowId\}/.test(source)) {
  throw new Error("El reemplazo de escena debe persistir el media real en dialogueVideoMap.");
}

if (!/videoSrc:\s*mediaUrl,\s*mediaType,\s*updatedAt:\s*now/.test(source)) {
  throw new Error("El reemplazo de escena debe actualizar el chip de escena con videoSrc y mediaType.");
}

if (!/session\.podcastVideoConfig\.timelineClipsByRowId\.\$\{currentEditingRowId\}\.type/.test(source)) {
  throw new Error("El reemplazo de escena debe actualizar el tipo del clip del timeline.");
}

if (/session\.rowReferenceImageMap\.\$\{currentEditingRowId\}/.test(source)) {
  throw new Error("El reemplazo de escena no debe escribir rowReferenceImageMap.");
}

if (/session\.rowReferenceImageListMap\.\$\{currentEditingRowId\}/.test(source)) {
  throw new Error("El reemplazo de escena no debe escribir rowReferenceImageListMap.");
}

if (/session\.rowReferenceVideoMap\.\$\{currentEditingRowId\}/.test(source)) {
  throw new Error("El reemplazo de escena no debe escribir rowReferenceVideoMap.");
}

if (/session\.rowReferenceModeByRowId\.\$\{currentEditingRowId\}/.test(source)) {
  throw new Error("El reemplazo de escena no debe cambiar rowReferenceModeByRowId.");
}

if (!/session\.visualEffectsMap\.\$\{currentEditingRowId\}/.test(source)) {
  throw new Error("Las escenas de imagen deben seguir conservando los efectos de movimiento del montaje.");
}

console.log("Podcaster scene replacement does not touch row references OK.");
