import { readFileSync } from "node:fs";

const stageSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const controllerSource = readFileSync(new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url), "utf8");
const replacementSource = readFileSync(new URL("../public/podcaster/podcaster-media-replacement.js", import.meta.url), "utf8");

if (!/function preloadStageImageSource\(src = "", fallbackUrl = ""\)/.test(replacementSource)
  && !/function preloadStageImageSource\(src = ""\)/.test(replacementSource)) {
  throw new Error("El stage debe precargar imágenes antes de reemplazar la escena actual.");
}

if (!/function swapStageToImagePreview\(src = "", options = \{\}\)/.test(replacementSource)) {
  throw new Error("El stage debe precargar imágenes antes de reemplazar la escena actual.");
}

if (!/function ensureStageImagePreviewReady\(src = ""\)/.test(replacementSource)
  || !/preloadStageImageSource\(cleanSrc,\s*fallbackUrl\)\.then\(\(\)\s*=>\s*ensureStageImagePreviewReady\(cleanSrc\)\)/.test(replacementSource)
  || !/ensureStageImagePreviewReady\(cleanSrc\)[\s\S]*afterSwap/.test(replacementSource)) {
  throw new Error("La ruta PNG del stage debe esperar a que el <img> real del preview esté listo antes de ocultar los videos previos.");
}

if (!/async ensureStageImageReady\(imageEl, src = "", options = \{\}\)/.test(controllerSource)
  || !/preloadImageSrc\(cleanSrc\)[\s\S]*ensureStageImageReady\(imageEl,\s*resolvedSrc,\s*\{ sourceKey: cleanSrc \}\)[\s\S]*revealImage/.test(controllerSource)
  || !/revealImage\s*=\s*\(\)\s*=>\s*\{[\s\S]*hideAllVideos\(\)/.test(controllerSource)) {
  throw new Error("El playback controller debe esperar a que el <img> real esté listo antes de esconder el frame anterior.");
}

if (!/await playbackController\.stop\(\{ keepStatus: true, keepCursor: true \}\);[\s\S]*setPodcastVideoRow\(rowId, \{ syncStage: false \}\);[\s\S]*await playSceneInStudio\(row, \{ allowGenerateAudio: true \}\);/.test(stageSource)) {
  throw new Error("El flujo timeline-play-scene-video debe detener la reproducción previa antes de rehidratar la escena nueva.");
}

console.log("Podcaster image scene preload avoids black flash OK.");
