import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");

const headActionsMatch = html.match(/<div class="podcast-video-library-head-actions">([\s\S]*?)<\/div>/);
if (!headActionsMatch) {
  throw new Error("No se encontró el contenedor de acciones del header de la librería.");
}

const headActions = headActionsMatch[1];

for (const id of [
  "uploadLocalPodcastSceneBtn",
  "refreshPodcastSceneLibraryBtn",
  "podcastSceneLibraryClearFiltersBtn"
]) {
  if (!headActions.includes(`id="${id}"`)) {
    throw new Error(`${id} debe vivir dentro de podcast-video-library-head-actions.`);
  }
}

const filtersMatch = html.match(/<div class="podcast-video-library-filters">([\s\S]*?)<\/div>/);
if (!filtersMatch) {
  throw new Error("No se encontró el bloque de filtros de la librería.");
}

if (filtersMatch[1].includes('id="podcastSceneLibraryClearFiltersBtn"')) {
  throw new Error("podcastSceneLibraryClearFiltersBtn ya no debe vivir dentro de podcast-video-library-filters.");
}

console.log("Podcaster library head actions OK.");
