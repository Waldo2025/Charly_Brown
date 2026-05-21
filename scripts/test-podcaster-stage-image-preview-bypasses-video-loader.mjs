import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8") +
  "\n" +
  readFileSync(new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url), "utf8");

if (!/const isImageStageClip =/.test(source)) {
  throw new Error("syncPodcastVideoStageMedia debe detectar explícitamente escenas de imagen.");
}

if (!/if \(isImageStageClip\) \{[\s\S]*podcastActiveSpeakerImage[\s\S]*return;/.test(source)) {
  throw new Error("El preview individual debe renderizar la imagen directamente en podcastActiveSpeakerImage y salir antes del path de video.");
}

if (!/hideStageImagePreview\(\)/.test(source)) {
  throw new Error("El stage debe tener un helper para ocultar la vista previa de imagen cuando cambie la escena.");
}

if (!/showStageImagePreview\(/.test(source)) {
  throw new Error("El stage debe tener un helper para mostrar la imagen reemplazada.");
}

if (!/setPodcastStageVideoSourceForElement\(/.test(source)) {
  throw new Error("El test espera que siga existiendo la ruta de video para escenas no imagen.");
}

console.log("Podcaster stage image preview bypasses video loader OK.");
