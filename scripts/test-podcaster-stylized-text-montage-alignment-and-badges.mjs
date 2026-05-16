import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const mediaEditorJs = readFileSync(new URL("../public/podcaster/podcaster-media-editor.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/podcaster.css", import.meta.url), "utf8");
const mediaEditorCss = readFileSync(new URL("../public/podcaster/css/podcaster-media-editor.css", import.meta.url), "utf8");

if (!/const STYLIZED_TEXT_STAGE_WIDTH = 1280;/.test(mediaEditorJs)
  || !/const STYLIZED_TEXT_STAGE_HEIGHT = 720;/.test(mediaEditorJs)) {
  throw new Error("El texto estilizado debe guardarse en un canvas canónico alineado al formato del montaje.");
}

if (!/function transformStylizedTextSceneData\(/.test(mediaEditorJs)
  || !/function resolveStylizedTextRenderBox\(/.test(mediaEditorJs)) {
  throw new Error("El editor debe transformar coordenadas del texto estilizado entre editor, stage y montaje.");
}

if (/fontSize\)\s*next\.fontSize\s*=/.test(mediaEditorJs) || /next\.fontSize\s*=\s*Number\(next\.fontSize\)\s*\*/.test(mediaEditorJs)) {
  throw new Error("La transformación de coordenadas no debe escalar fontSize y scaleX/scaleY al mismo tiempo.");
}

if (!/montageExportStylizedTextOverlay/.test(html)
  || !/podcastStylizedTextOverlay:\s*els\.montageExportStylizedTextOverlay/.test(js)) {
  throw new Error("El preview de montaje debe tener su propio overlay para texto estilizado.");
}

if (!/podcast-scene-stylized-text-badge/.test(js)
  || !/Contiene texto estilizado/.test(js)) {
  throw new Error("Las escenas del timeline deben mostrar un badge T cuando contienen texto estilizado.");
}

if (!/\.podcast-scene-stylized-text-badge\s*\{/.test(css)) {
  throw new Error("Falta el estilo visual del badge T en el chip de escena.");
}

if (!/\.pme-canvas-container\s*\{[\s\S]*aspect-ratio:\s*16 \/ 9;/.test(mediaEditorCss)
  || !/min-height:\s*286px;/.test(mediaEditorCss)) {
  throw new Error("El editor de texto estilizado debe compartir el framing base del preview de montaje.");
}

console.log("Podcaster stylized text montage alignment and badges OK.");
