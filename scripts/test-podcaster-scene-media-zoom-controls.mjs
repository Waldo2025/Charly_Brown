import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const timelineModelJs = readFileSync(new URL("../public/podcaster/podcaster-timeline-model.js", import.meta.url), "utf8");
const controllerJs = readFileSync(new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/podcaster.css", import.meta.url), "utf8");

if (!/id="podcastSceneZoomOutBtn"/.test(html) || !/id="podcastSceneZoomInBtn"/.test(html)) {
  throw new Error("El stage debe exponer botones +/- para ajustar el zoom de la escena activa.");
}

if (!/function normalizeTimelineClipMediaScale\(value = 1\)/.test(timelineModelJs)
  || !/mediaScale:\s*normalizeTimelineClipMediaScale\(raw\?\.mediaScale\)/.test(timelineModelJs)) {
  throw new Error("Cada escena debe persistir un mediaScale normalizado en timelineClipsByRowId.");
}

if (!/function applySceneMediaScaleToStage\(/.test(js)
  || !/applySceneMediaScaleToStage\(\{\s*rowId:\s*activeRowId,\s*mediaScale:\s*clip\?\.mediaScale,\s*visualLayoutMode:\s*clip\?\.visualLayoutMode\s*\}\)/.test(js)) {
  throw new Error("El stage debe aplicar el zoom uniforme guardado para imagen y video de la escena activa.");
}

if (!/applySceneMediaScale\(entry = null\)/.test(controllerJs)
  || !/this\.applySceneMediaScale\(entry\);/.test(controllerJs)) {
  throw new Error("El playback controller debe reaplicar el zoom por escena durante el montaje.");
}

if (!/\.podcast-preview-scene-zoom-controls\s*\{/.test(css)
  || !/--pod-scene-media-scale/.test(css)) {
  throw new Error("Faltan los estilos del control de zoom y la variable visual de escala uniforme.");
}

console.log("Podcaster scene media zoom controls OK.");
