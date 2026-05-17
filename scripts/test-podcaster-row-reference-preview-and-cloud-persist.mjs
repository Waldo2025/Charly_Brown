import { readFileSync } from "node:fs";

const mediaReferenceSource = readFileSync(new URL("../public/podcaster/podcaster-media-reference.js", import.meta.url), "utf8");
const podcasterSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

if (!/function persistRowReferencesPatchToCloud\(session = null\)/.test(mediaReferenceSource)) {
  throw new Error("Debe existir un patch cloud específico para referencias por escena.");
}

if (!/"session\.rowReferenceImageMap": getRowReferenceImageMap\(activeSession\),[\s\S]*"session\.rowReferenceImageListMap": getRowReferenceImageListMap\(activeSession\),[\s\S]*"session\.rowReferenceVideoMap": getRowReferenceVideoMap\(activeSession\),[\s\S]*"session\.rowReferenceModeByRowId": getRowReferenceModeByRowId\(activeSession\)/m.test(mediaReferenceSource)) {
  throw new Error("El patch cloud debe persistir todos los mapas de referencia de la escena.");
}

if (!/setRowReferenceImages\(rowId = "", references = \[\]\)[\s\S]*renderPodcastVideoShell\?\.\(refreshed\);[\s\S]*void persistRowReferencesPatchToCloud\(refreshed\);/m.test(mediaReferenceSource)) {
  throw new Error("Adjuntar imágenes de referencia debe refrescar el inspector y persistir a Firebase.");
}

if (!/setRowReferenceVideo\(rowId = "", reference = null\)[\s\S]*renderPodcastVideoShell\?\.\(refreshed\);[\s\S]*void persistRowReferencesPatchToCloud\(refreshed\);/m.test(mediaReferenceSource)) {
  throw new Error("Adjuntar video de referencia debe refrescar el inspector y persistir a Firebase.");
}

if (!/function resolveReferenceImagePreviewUrl\(reference = null\)/.test(mediaReferenceSource)
  || !/resolveReferenceImagePreviewUrl\(image\)/.test(podcasterSource)
  || !/resolveReferenceImagePreviewUrl\(rowReference\)/.test(podcasterSource)) {
  throw new Error("El preview del inspector debe poder resolver imágenes locales o persistidas.");
}

if (!/createPodcasterMediaReferenceApi/.test(podcasterSource)
  || !/bindInputEvents: bindMediaReferenceInputEvents/.test(podcasterSource)
  || !/promptRowReferenceSelection\(rowId\)/.test(podcasterSource)
  || !/clearRowReference\(rowId\)/.test(podcasterSource)) {
  throw new Error("podcaster.js debe consumir el módulo compartido de referencias en vez de reimplementar la lógica.");
}

console.log("Podcaster row reference preview and cloud persist OK.");
