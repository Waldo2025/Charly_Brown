import { readFileSync } from "node:fs";

const replacementSource = readFileSync(
  new URL("../public/podcaster/podcaster-media-replacement.js", import.meta.url),
  "utf8"
);
const podcasterSource = readFileSync(
  new URL("../public/podcaster/podcaster.js", import.meta.url),
  "utf8"
);

if (!/firebase-storage\.js/.test(replacementSource) || !/listAll/.test(replacementSource) || !/getDownloadURL/.test(replacementSource)) {
  throw new Error("podcaster-media-replacement.js debe listar medios de sesión directo con Firebase Storage SDK.");
}

if (!/uploadBytesResumable/.test(replacementSource)) {
  throw new Error("podcaster-media-replacement.js debe subir reemplazos directo con Firebase Storage SDK.");
}

if (/scene-media\/upload/.test(replacementSource) || /getAuthHeaders/.test(replacementSource) || /buildApiUrl\("\/api\/podcaster\/scene-media\/upload"\)/.test(replacementSource)) {
  throw new Error("El modal de reemplazo no debe subir archivos por /api/podcaster/scene-media/upload.");
}

if (!/async function listSessionStorageMediaDirect\(/.test(replacementSource)) {
  throw new Error("podcaster-media-replacement.js debe centralizar el listado SDK directo en listSessionStorageMediaDirect.");
}

if (!/`podcaster\/sessions\/\$\{cleanSessionId\}\/owners`/.test(replacementSource)) {
  throw new Error("El listado SDK debe recorrer owners/ completo para encontrar videos de cualquier owner de la sesión.");
}

if (!/isSessionStorageMediaPath\(fullPath,\s*cleanSessionId,\s*mediaKind\)/.test(replacementSource)) {
  throw new Error("El listado SDK debe filtrar archivos por carpeta real videos/audio al recorrer owners/ completo.");
}

if (!/maxDepth:\s*prefix\.endsWith\("\/owners"\)\s*\?\s*5\s*:\s*3/.test(replacementSource)) {
  throw new Error("El listado desde owners/ debe tener profundidad suficiente para llegar hasta owners/{uid}/videos/{rowFolder}/{file}.");
}

if (/authFetchJson\(`?\/api\/podcaster\/sessions\/list-videos/.test(replacementSource)) {
  throw new Error("El modal de reemplazo no debe llamar /api/podcaster/sessions/list-videos.");
}

if (/authFetchJson\(`?\/api\/podcaster\/sessions\/list-(?:videos|audios)/.test(podcasterSource)) {
  throw new Error("La recuperación profunda no debe llamar /api/podcaster/sessions/list-videos/list-audios.");
}

if (!/listSessionStorageVideos/.test(replacementSource) || !/listSessionStorageAudios/.test(replacementSource)) {
  throw new Error("PodcasterMediaReplacement debe exponer listSessionStorageVideos y listSessionStorageAudios.");
}

if (!/requirePodcasterMediaReplacementApiFunction\("listSessionStorageVideos"\)/.test(podcasterSource)
  || !/requirePodcasterMediaReplacementApiFunction\("listSessionStorageAudios"\)/.test(podcasterSource)) {
  throw new Error("podcaster.js debe usar los helpers SDK directos para vincular videos/audios.");
}

console.log("Podcaster media replacement Firebase Storage SDK listing OK.");
