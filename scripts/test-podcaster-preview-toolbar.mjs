import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");
const scenePositionSource = readFileSync(new URL("../public/podcaster/podcaster-scene-media-position.js", import.meta.url), "utf8");
const overlayCardsSource = readFileSync(new URL("../public/podcaster/podcaster-overlay-cards.js", import.meta.url), "utf8");
const resizeSource = readFileSync(new URL("../public/podcaster/podcaster-resize.js", import.meta.url), "utf8");

if (!/class="podcast-preview-left-toolbar"/.test(html)) {
  throw new Error("El preview debe renderizar un toolbar vertical izquierdo.");
}

for (const id of [
  "podcastVideoLibraryCollapsedHandle",
  "togglePodcastVideoLibraryBtn",
  "addStylizedTextBtn",
  "podcastSceneZoomInBtn",
  "podcastSceneZoomOutBtn",
  "podcastScenePositionToggleBtn"
]) {
  if (!html.includes(`id="${id}"`)) {
    throw new Error(`Falta ${id} dentro del toolbar del preview.`);
  }
}

if (!/id="togglePodcastVideoLibraryBtn"[\s\S]*fa-chevron-left/.test(html)) {
  throw new Error("El control visible para librería abierta debe usar icono de cerrar hacia la izquierda.");
}

if (!/id="podcastVideoLibraryCollapsedHandle"[\s\S]*fa-chevron-right/.test(html)) {
  throw new Error("El control para librería colapsada debe usar icono de abrir hacia la derecha.");
}

if (!/updatePodcastVideoLibraryToggleUi/.test(resizeSource)
  || !/fa-chevron-right/.test(resizeSource)
  || !/fa-chevron-left/.test(resizeSource)) {
  throw new Error("La UI del toggle de librería debe actualizar icono y etiqueta según el estado.");
}

if (!/data-action="overlay-card-open"/.test(html) || !/fa-id-card/.test(html)) {
  throw new Error("El botón de cards debe vivir en el toolbar y usar icono de card.");
}

if (!/podcastScenePositionToggleBtn/.test(scenePositionSource)
  || !/podcast-scene-position-toolbar-panel/.test(scenePositionSource)
  || !/data-action="scene-media-position-x"/.test(scenePositionSource)
  || !/data-action="scene-media-position-y"/.test(scenePositionSource)
  || !/data-action="scene-media-motion-preset"/.test(scenePositionSource)) {
  throw new Error("Los controles de posición de escena deben abrirse desde el nuevo toolbar.");
}

if (/collapsedHandle\.insertAdjacentHTML\("afterend"/.test(overlayCardsSource)) {
  throw new Error("El botón de cards ya no debe inyectarse junto al handle colapsado.");
}

console.log("Podcaster preview toolbar OK.");
