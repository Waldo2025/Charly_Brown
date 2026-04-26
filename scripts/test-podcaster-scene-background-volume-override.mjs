import { readFileSync } from "node:fs";

const jsSource = readFileSync(new URL("../public/podcaster.js", import.meta.url), "utf8");
const htmlSource = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");
const playbackSource = readFileSync(new URL("../public/podcaster.playback.js", import.meta.url), "utf8");

if (!/id="timelineClipBackgroundVolumeRange"/.test(htmlSource) || !/id="timelineClipBackgroundVolumeNumber"/.test(htmlSource)) {
  throw new Error("El modal debe exponer controles para volumen de audio de fondo por escena.");
}

if (!/timelineSceneAudioMixByRowId: normalizeTimelineSceneAudioMixByRowId/.test(jsSource)) {
  throw new Error("La configuración debe normalizar el mix de audio de fondo por escena.");
}

if (!/function getSceneBackgroundMusicVolumeOverridePct/.test(jsSource)) {
  throw new Error("Debe existir un helper para leer el override de volumen de fondo por escena.");
}

if (!/timelineClipBackgroundVolumeRange/.test(jsSource) || !/timelineClipBackgroundVolumeNumber/.test(jsSource)) {
  throw new Error("El JS debe enlazar los nuevos controles de volumen de fondo.");
}

if (!/timelineSceneAudioMixByRowId:\s*\{[\s\S]*backgroundMusicVolumePct/s.test(jsSource)) {
  throw new Error("El modal debe persistir el volumen de fondo en timelineSceneAudioMixByRowId.");
}

if (!/buildTrackBackgroundSegments/.test(jsSource) || !/backgroundSegments: \[\.\.\.uploadedBackgroundSegments, \.\.\.trackBackgroundSegments\]/.test(jsSource)) {
  throw new Error("El export debe incluir segmentos de fondo por escena en audioTimeline.");
}

if (!/resolveSceneBackgroundMusicVolumePctAtMs\(currentMs, panelVolumePct, mseRuntimeEntries\)/.test(playbackSource)) {
  throw new Error("El playback debe usar el override de fondo de la escena activa.");
}

console.log("Podcast scene background volume override OK.");
