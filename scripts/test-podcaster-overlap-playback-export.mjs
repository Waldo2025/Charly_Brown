import { readFileSync } from "node:fs";

const podcasterSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const playbackSource = readFileSync(new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url), "utf8");
const backendSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

if (!/function timelineHasVisualOverlap\(session = null, runtimeEntries = null\) \{/.test(podcasterSource)) {
  throw new Error("Falta helper para detectar overlap visual en el timeline.");
}

if (!/els\.podcastVideoPlayBtn\.addEventListener\("click", async \(\) => \{[\s\S]*const startMs = Number\(podcastVideoState\.montageCursorMs \|\| 0\);[\s\S]*playbackController\.play\(startMs(?:,\s*\{[\s\S]*?\})?\);/m.test(podcasterSource)) {
  throw new Error("El botón Play debe delegar la reproducción del montaje al PodcasterPlaybackController unificado.");
}

if (!/timelineClipVisualLayoutMode/.test(podcasterSource)
  || !/visualLayoutMode: normalizeTimelineClipVisualLayoutMode\(raw\?\.visualLayoutMode\)/.test(podcasterSource)
  || !/visualLayoutMode: normalizeTimelineClipVisualLayoutMode\(entry\?\.clip\?\.visualLayoutMode\)/.test(podcasterSource)) {
  throw new Error("El modo visual por clip debe persistirse y viajar al payload de export.");
}

if (!/const upcoming = entries\.filter\(e => e\.startMs > currentMs && \(e\.startMs - currentMs\) < 4000\);/.test(playbackSource)
  || !/this\.preloadUpcomingStageSlot\(entry, upcoming\);/.test(playbackSource)
  || !/if \(activeEl\.dataset\.src === entry\.videoSrc\) \{[\s\S]*this\.seekTo\(activeEl, offsetSec\);/m.test(playbackSource)
  || !/if \(inactiveEl\.dataset\.src !== entry\.videoSrc\) \{[\s\S]*setPodcastStageVideoSourceForElement/s.test(playbackSource)
  || !/this\.deps\?\.setActiveStageVideoSlot\?\.\(activeSlot === 1 \? 0 : 1\);/.test(playbackSource)) {
  throw new Error("El preview del montaje vivo debe precargar y cambiar de escena con stage switching sin recargar de más.");
}

if (!/function buildMontageOverlapCompositionPlan\(exportedEntries = \[\]\) \{/.test(backendSource)
  || !/async function renderMontageOverlapComposition\(\{/.test(backendSource)
  || !/async function buildMontageGapAwareConcatSequence\(\{/.test(backendSource)
  || !/visualLayoutMode = String\(entry\?\.visualLayoutMode \|\| ""\)\.trim\(\)\.toLowerCase\(\) === "blur-backdrop"/.test(backendSource)
  || !/boxblur=24:8/.test(backendSource)
  || !/Number\(a\?\.zIndex \|\| 0\) - Number\(b\?\.zIndex \|\| 0\)/.test(backendSource)
  || !/renderMontageOverlapComposition\(\{/.test(backendSource)) {
  throw new Error("El export backend debe priorizar la capa superior en overlaps y soportar blur backdrop por escena.");
}

if (!/const endSec = startSec \+ durSec;/.test(backendSource)
  || !/setpts=PTS-STARTPTS,trim=start=0:duration=\$\{durSec\.toFixed\(3\)\},setpts=PTS-STARTPTS,scale=\$\{canvas\.width\}:\$\{canvas\.height\}/.test(backendSource)
  || /tpad=stop_mode=clone:stop_duration=\$\{durSec\.toFixed\(3\)\}/.test(backendSource)
  || !/overlay=eof_action=pass:shortest=0:x='\$\{overlayX\}':y='\$\{overlayY\}':format=auto:enable='between\(t,\$\{startSec\.toFixed\(3\)\},\$\{endSec\.toFixed\(3\)\}\)'/.test(backendSource)) {
  throw new Error("El compositor overlap no debe congelar el último frame; cada escena debe estar habilitada solo durante su ventana real.");
}

console.log("Podcast overlap playback/export OK.");
