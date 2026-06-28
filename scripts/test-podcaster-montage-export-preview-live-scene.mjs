import { readFileSync } from "node:fs";

const exportSource = readFileSync(new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url), "utf8");
const podcasterSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

if (!/if \(stage === "render_scene_segments" && currentSceneIndex > 0\) \{[\s\S]*maybeRefreshMontageExportPreviewFromJob\(/.test(exportSource)) {
  throw new Error("El polling debe refrescar el preview conforme cambia currentSceneIndex durante render_scene_segments.");
}

if (/stage === "render_scene_segments" && currentSceneIndex > 0 && !shouldSuspendMontagePreviewActivity\(\)/.test(exportSource)) {
  throw new Error("Regresión: el preview por escena no debe bloquearse por montageExportPreviewPaused durante export.");
}

if (!/function playMontageExportPreviewMedia\(\)/.test(podcasterSource)
  || !/function seekMontageExportPreviewMedia\(targetMs = 0\)/.test(podcasterSource)) {
  throw new Error("El preview del export debe controlar directamente el media visible.");
}

if (/montageExportPreviewPlayBtn\.addEventListener\("click", \(\) => exportPreviewController\.play\(\)\)/.test(podcasterSource)
  || /montageExportPreviewSeekbar\.addEventListener\("input", \(\) => \{\s*exportPreviewController\.seek/.test(podcasterSource)) {
  throw new Error("Regresión: los controles del modal no deben reiniciar el PodcasterPlaybackController del studio.");
}

if (!/const timelineStartMs = Math\.max\(0, Number\(frontendPreview\?\.timelineStartMs \|\| 0\) \|\| 0\);[\s\S]*timelineStartMs \+ \(Math\.round\(Number\(mediaEl\?\.currentTime \|\| 0\) \* 1000\) \|\| 0\)/.test(podcasterSource)) {
  throw new Error("El overlay/seekbar del preview debe sumar timelineStartMs al tiempo local del video.");
}

console.log("Podcaster montage export live preview contract OK.");
