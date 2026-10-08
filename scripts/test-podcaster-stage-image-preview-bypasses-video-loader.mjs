import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8") +
  "\n" +
  readFileSync(new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url), "utf8");

if (!/const isImageStageClip =/.test(source)) {
  throw new Error("syncPodcastVideoStageMedia debe detectar explícitamente escenas de imagen.");
}

if (!/if \(isImageStageClip\) \{[\s\S]*?resolveStopMotionEntryAtMs\([\s\S]*?requestImageStageSwap\([\s\S]*?return;/.test(source)) {
  throw new Error("El preview individual debe usar el swap interno de imagen del stage (doble slot) con el fotograma del cursor y salir antes del path de video.");
}

if (/window\.swapStageToImagePreview|window\.hideStageImagePreview/.test(source)) {
  throw new Error("El stage no puede depender de podcaster-media-replacement.js (se carga en idle): deja el video anterior en pantalla.");
}

if (!/hideAllImages\(\)/.test(source)) {
  throw new Error("El stage debe ocultar la vista previa de imagen con su propio helper cuando cambie la escena.");
}

if (!/const revealImage = \(\)/.test(source)) {
  throw new Error("El stage debe tener su propio helper para revelar la imagen de escena (doble slot con crossfade).");
}

if (!/setPodcastStageVideoSourceForElement\(/.test(source)) {
  throw new Error("El test espera que siga existiendo la ruta de video para escenas no imagen.");
}

console.log("Podcaster stage image preview bypasses video loader OK.");
