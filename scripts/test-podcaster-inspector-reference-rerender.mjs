import { readFileSync } from "node:fs";

const podcasterSource = readFileSync(
  new URL("../public/podcaster/podcaster.js", import.meta.url),
  "utf8"
);

const mediaReferenceSource = readFileSync(
  new URL("../public/podcaster/podcaster-media-reference.js", import.meta.url),
  "utf8"
);

if (!/function syncPodcastStudioInspector\(session = null, options = \{\}\)/.test(podcasterSource)) {
  throw new Error("syncPodcastStudioInspector debe aceptar opciones para permitir re-render forzado.");
}

if (!/const forceRender = options\.forceRender === true;/.test(podcasterSource)) {
  throw new Error("syncPodcastStudioInspector debe reconocer forceRender.");
}

if (!/if \(!forceRender && isEditing && activeRowId === currentDomRowId/.test(podcasterSource)) {
  throw new Error("El guard de edición del inspector debe poder saltarse con forceRender.");
}

if (!/deps\.syncPodcastStudioInspector\?\.\(refreshed,\s*\{\s*forceRender:\s*true\s*\}\);/.test(mediaReferenceSource)) {
  throw new Error("Adjuntar referencias de fila debe forzar el re-render del inspector.");
}

console.log("Podcaster inspector reference rerender OK.");
