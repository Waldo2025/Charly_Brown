import { readFileSync } from "node:fs";

const stageSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const controllerSource = readFileSync(new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url), "utf8");

if (!/function preloadStageImageSource\(src = ""\)/.test(stageSource)
  || !/function swapStageToImagePreview\(src = "", options = \{\}\)/.test(stageSource)) {
  throw new Error("El stage debe precargar imágenes antes de reemplazar la escena actual.");
}

if (!/function ensureStageImagePreviewReady\(src = ""\)/.test(stageSource)
  || !/preloadStageImageSource\(cleanSrc\)\.then\(\(\)\s*=>\s*ensureStageImagePreviewReady\(cleanSrc\)\)/.test(stageSource)
  || !/ensureStageImagePreviewReady\(cleanSrc\)[\s\S]*afterSwap/.test(stageSource)) {
  throw new Error("La ruta PNG del stage debe esperar a que el <img> real del preview esté listo antes de ocultar los videos previos.");
}

if (!/async ensureStageImageReady\(imageEl, src = ""\)/.test(controllerSource)
  || !/await this\.preloadImageSrc\(entry\.videoSrc\);[\s\S]*await this\.ensureStageImageReady\(imageEl, entry\.videoSrc\);[\s\S]*this\.hideAllVideos\(\);/.test(controllerSource)) {
  throw new Error("El playback controller debe esperar a que el <img> real esté listo antes de esconder el frame anterior.");
}

if (!/await playbackController\.stop\(\{ keepStatus: true, keepCursor: true \}\);[\s\S]*setPodcastVideoRow\(rowId, \{ syncStage: true \}\);[\s\S]*await playSceneInStudio\(row, \{ allowGenerateAudio: true \}\);/.test(stageSource)) {
  throw new Error("El flujo timeline-play-scene-video debe detener la reproducción previa antes de rehidratar la escena nueva.");
}

console.log("Podcaster image scene preload avoids black flash OK.");
