import { readFileSync } from "node:fs";

const podcasterSource = readFileSync(new URL("../public/podcaster.js", import.meta.url), "utf8");
const controllerSource = readFileSync(new URL("../public/podcaster-playback-controller.js", import.meta.url), "utf8");

if (!/return playbackController\.syncOverlay\(currentMs,\s*options\);/.test(podcasterSource)
  || !/const editorPreviewMode = this\.deps\?\.podcastVideoState\?\.montageActive !== true;/.test(controllerSource)
  || !/const shouldShowPreferredRow = forceRow \|\| \(editorPreviewMode && Boolean\(preferredRowId\)\);/.test(controllerSource)
  || !/selected = candidates\.find\(\(item\) => item\.isPreferred && \(item\.isTimeActive \|\| shouldShowPreferredRow\)\)\?\.clip/s.test(controllerSource)) {
  throw new Error("El preview del editor debe mostrar el texto de la fila activa aunque el cursor no caiga dentro del clip.");
}

console.log("Podcast onscreen editor preferred-row preview OK.");
