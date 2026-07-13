import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/podcaster/podcaster-media-editor.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/podcaster/css/podcaster-media-editor.css", import.meta.url), "utf8");

if (!/function fitFabricCanvasToEditorContainer\(\)\s*\{[\s\S]*const scale = Math\.min\([\s\S]*STYLIZED_TEXT_STAGE_WIDTH[\s\S]*STYLIZED_TEXT_STAGE_HEIGHT[\s\S]*container\.style\.setProperty\('--pme-canvas-scale'/.test(js)) {
  throw new Error("El editor debe escalar visualmente el stage canónico sin cambiar las coordenadas de Fabric.");
}

if (!/fabricCanvas\.setDimensions\(\{\s*width:\s*STYLIZED_TEXT_STAGE_WIDTH,\s*height:\s*STYLIZED_TEXT_STAGE_HEIGHT\s*\}/.test(js)) {
  throw new Error("Fabric debe conservar un canvas lógico de 1280x720 para que fontSize y scaleX/scaleY se reflejen en el preview.");
}

if (!/const editorSize = fitFabricCanvasToEditorContainer\(\);[\s\S]*transformStylizedTextSceneData\([\s\S]*STYLIZED_TEXT_STAGE_WIDTH,[\s\S]*STYLIZED_TEXT_STAGE_HEIGHT[\s\S]*STYLIZED_TEXT_STAGE_WIDTH,[\s\S]*STYLIZED_TEXT_STAGE_HEIGHT/.test(js)) {
  throw new Error("El texto estilizado existente debe cargarse en el stage canónico, no en el tamaño visual del modal.");
}

if (!/const stageData = transformStylizedTextSceneData\([\s\S]*fabricCanvas\.toJSON\(\),[\s\S]*STYLIZED_TEXT_STAGE_WIDTH,[\s\S]*STYLIZED_TEXT_STAGE_HEIGHT,[\s\S]*STYLIZED_TEXT_STAGE_WIDTH,[\s\S]*STYLIZED_TEXT_STAGE_HEIGHT/.test(js)) {
  throw new Error("El guardado no debe reescalar el texto desde el tamaño visual del preview.");
}

if (!/\.pme-canvas-container \.canvas-container\s*\{[\s\S]*left:\s*50%;[\s\S]*top:\s*50%;[\s\S]*transform:\s*translate\(-50%, -50%\) scale\(var\(--pme-canvas-scale, 1\)\)/.test(css)) {
  throw new Error("El wrapper de Fabric debe quedar centrado dentro del preview del editor.");
}

if (!/data-cache-src="podcaster\/podcaster-media-editor\.js" data-cache-type="module"/.test(html)) {
  throw new Error("podcaster-media-editor.js debe cargarse por cache-version-loader para recibir el cache-buster vigente.");
}

console.log("Podcaster stylized text preview scale and center OK.");
