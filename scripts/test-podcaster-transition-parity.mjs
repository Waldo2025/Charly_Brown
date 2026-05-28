import { readFileSync } from "node:fs";

const front = readFileSync(new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url), "utf8");
const playback = readFileSync(new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url), "utf8");
const back = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
const podcasterHtml = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");
const podcasterJs = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

if (!/transitionOut = entry\?\.transitionOut[\s\S]*getTransitionForEdge\?\.\(activeSession, rowId, nextRowId\)/.test(front)
  || !/transitionOut,/.test(front)) {
  throw new Error("El payload de export debe enviar transitionOut por escena.");
}

if (!/function normalizeMontageTransition\(raw = null\)/.test(back)
  || !/"slide-left"/.test(back)
  || !/"flash-white"/.test(back)
  || !/"zoom-out"/.test(back)) {
  throw new Error("El backend debe normalizar todos los tipos de transición disponibles.");
}

if (!/resolveMontageOverlayTransition\(entry, previousEntry\)/.test(back)
  || !/overlayX = `\$\{canvas\.width\}\*\(1-\$\{overlayProgressExpr\}\)`/.test(back)
  || !/overlayY = `-\$\{canvas\.height\}\*\(1-\$\{overlayProgressExpr\}\)`/.test(back)
  || !/color=c=\$\{color\}@1/.test(back)
  || !/scale=w='\$\{canvas\.width\}\*\(\$\{scaleExpr\}\)'/.test(back)
  || !/transitionOut: normalizeMontageTransition\(entry\?\.transitionOut \|\| null\)/.test(back)) {
  throw new Error("La composición export debe aplicar slide, dip/flash y zoom como efectos visuales distintos.");
}

if (!/const eased = progress \* progress \* \(3 - \(2 \* progress\)\);/.test(playback)
  || !/translateX\(\$\{\(100 \* \(1 - eased\)\)\.toFixed\(2\)\}%\)/.test(playback)
  || !/brightness\(\$\{\(1 \+ flash \* 1\.8\)\.toFixed\(3\)\}\)/.test(playback)
  || !/scale\(\$\{\(0\.72 \+ \(eased \* 0\.28\)\)\.toFixed\(3\)\}\)/.test(playback)) {
  throw new Error("El preview debe hacer visibles slide, flash/dip y zoom, no sólo crossfade.");
}

if (/&& !this\.isImageStageEntry\(overlapPair\.backEntry\)[\s\S]*&& !this\.isImageStageEntry\(overlapPair\.frontEntry\)/.test(playback)
  || !/const primaryImage = this\.els\?\.podcastActiveSpeakerImage;/.test(playback)
  || !/const altImage = this\.els\?\.podcastActiveSpeakerImageAlt;/.test(playback)) {
  throw new Error("El preview debe aplicar transiciones también cuando una escena del overlap es imagen.");
}

if (!/applyEntryVisualStateToSurface\(entry, imageEl\);/.test(playback)
  || !/applyEntryVisualStateToSurface\(entry, videoEl\);/.test(playback)
  || !/resetEntryVisualStateOnSurface\(el\);/.test(playback)
  || !/style\.setProperty\("--pod-scene-media-scale", String\(state\.mediaScale\)\);/.test(playback)
  || !/style\.setProperty\("--pod-scene-media-x",/.test(playback)
  || !/style\.setProperty\("--pod-scene-media-y",/.test(playback)) {
  throw new Error("Cada superficie del overlap debe cargar su propio zoom y offsets para que la escena siguiente no herede el zoom anterior.");
}

if (!/id="podcastActiveSpeakerImageAlt"/.test(podcasterHtml)
  || !/id="montageExportPreviewVideoAlt"/.test(podcasterHtml)
  || !/id="montageExportPreviewImageAlt"/.test(podcasterHtml)
  || /podcastActiveSpeakerVideoAlt: null/.test(podcasterJs)) {
  throw new Error("El preview de Studio/export debe tener capas alternas de video e imagen para transiciones.");
}

console.log("Podcaster transition parity OK.");
