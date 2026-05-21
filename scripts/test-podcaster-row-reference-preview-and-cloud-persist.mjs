import { readFileSync } from "node:fs";

const mediaReferenceSource = readFileSync(new URL("../public/podcaster/podcaster-media-reference.js", import.meta.url), "utf8");
const podcasterSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const scriptEditorSource = readFileSync(new URL("../public/podcaster/podcaster-script-editor.js", import.meta.url), "utf8");

if (!/function persistRowReferencesPatchToCloud\(session = null\)/.test(mediaReferenceSource)) {
  throw new Error("Debe existir un patch cloud específico para referencias por escena.");
}

if (!/"session\.rowReferenceImageMap": getRowReferenceImageMap\(activeSession\),[\s\S]*"session\.rowReferenceImageListMap": getRowReferenceImageListMap\(activeSession\),[\s\S]*"session\.rowReferenceVideoMap": getRowReferenceVideoMap\(activeSession\),[\s\S]*"session\.rowReferenceModeByRowId": getRowReferenceModeByRowId\(activeSession\)/m.test(mediaReferenceSource)) {
  throw new Error("El patch cloud debe persistir todos los mapas de referencia de la escena.");
}

if (!/setRowReferenceImages\(rowId = "", references = \[\]\)[\s\S]*renderPodcastVideoShell\?\.\(refreshed\);[\s\S]*void persistRowReferencesToCloud\(refreshed\);/m.test(mediaReferenceSource)) {
  throw new Error("Adjuntar imágenes de referencia debe refrescar el inspector y persistir a Firebase.");
}

if (!/setRowReferenceVideo\(rowId = "", reference = null\)[\s\S]*renderPodcastVideoShell\?\.\(refreshed\);[\s\S]*void persistRowReferencesToCloud\(refreshed\);/m.test(mediaReferenceSource)) {
  throw new Error("Adjuntar video de referencia debe refrescar el inspector y persistir a Firebase.");
}

if (!/function promptRowReferenceSelection\(rowId = ""\) \{[\s\S]*deps\.setPodcastVideoRow\?\.\(key,\s*\{[\s\S]*lightweightUi:\s*true,[\s\S]*reason:\s*"selection"[\s\S]*\}\);[\s\S]*els\.rowReferenceImageInput\.dataset\.rowId = key;[\s\S]*els\.rowReferenceImageInput\.click\(\);/m.test(mediaReferenceSource)) {
  throw new Error("Adjuntar referencia por escena debe seleccionar esa escena antes de abrir el picker para que el inspector rerenderice la fila correcta.");
}

if (!/function resolveReferenceImagePreviewUrl\(reference = null\)/.test(mediaReferenceSource)
  || !/resolveReferenceImagePreviewUrl\(image\)/.test(scriptEditorSource)
  || !/resolveReferenceImagePreviewUrl\(rowReference\)/.test(scriptEditorSource)) {
  throw new Error("El preview del inspector debe poder resolver imágenes locales o persistidas.");
}

if (!/Object\.assign\(window,\s*\{[\s\S]*resolveRowReferenceAsset:\s*\(\.\.\.args\)\s*=>\s*latestPodcasterMediaReferenceApi\?\.resolveRowReferenceAsset\?\.\(\.\.\.args\),[\s\S]*resolveReferenceImagePreviewUrl:\s*\(\.\.\.args\)\s*=>\s*latestPodcasterMediaReferenceApi\?\.resolveReferenceImagePreviewUrl\?\.\(\.\.\.args\)/m.test(mediaReferenceSource)) {
  throw new Error("podcaster-media-reference.js debe exponer los helpers de preview para el editor/inspector.");
}

if (!/createPodcasterMediaReferenceApi/.test(podcasterSource)
  || !/bindInputEvents: bindMediaReferenceInputEvents/.test(podcasterSource)
  || !/promptRowReferenceSelection\(rowId\)/.test(podcasterSource)
  || !/clearRowReference\(rowId\)/.test(podcasterSource)) {
  throw new Error("podcaster.js debe consumir el módulo compartido de referencias en vez de reimplementar la lógica.");
}

console.log("Podcaster row reference preview and cloud persist OK.");
