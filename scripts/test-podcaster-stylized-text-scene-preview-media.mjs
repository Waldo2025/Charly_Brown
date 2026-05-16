import { readFileSync } from "node:fs";

const mediaEditorJs = readFileSync(new URL("../public/podcaster/podcaster-media-editor.js", import.meta.url), "utf8");
const mediaEditorCss = readFileSync(new URL("../public/podcaster/css/podcaster-media-editor.css", import.meta.url), "utf8");

if (!/function resolveStylizedScenePreviewMedia\(session = null, rowId = ''\)/.test(mediaEditorJs)) {
  throw new Error("El editor debe resolver el asset visual actual de la escena para el preview del texto estilizado.");
}

if (!/function syncStylizedScenePreviewMedia\(session = null, rowId = ''\)/.test(mediaEditorJs)
  || !/container\.prepend\(mediaEl\);/.test(mediaEditorJs)) {
  throw new Error("El editor debe inyectar un preview real de imagen o video detrás del canvas.");
}

if (!/const mediaEl = document\.createElement\(asset\.kind === 'image' \? 'img' : 'video'\)/.test(mediaEditorJs)) {
  throw new Error("El preview de escena debe soportar tanto imágenes como videos.");
}

if (!/clearStylizedScenePreviewMedia\(\);[\s\S]*els\.textModal\.hidden = true;/.test(mediaEditorJs)) {
  throw new Error("El preview de escena debe limpiarse al cerrar o guardar el editor.");
}

if (!/\.pme-scene-preview-media\s*\{[\s\S]*position:\s*absolute;[\s\S]*object-fit:\s*cover;/.test(mediaEditorCss)) {
  throw new Error("Falta el estilo de la capa preview real de la escena detrás del canvas.");
}

console.log("Podcaster stylized text scene preview media OK.");
