import { readFileSync } from "node:fs";

const jsSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const timelineModelSource = readFileSync(new URL("../public/podcaster/podcaster-timeline-model.js", import.meta.url), "utf8");
const clipDurationSource = readFileSync(new URL("../public/podcaster/podcaster-timeline-clip-duration.js", import.meta.url), "utf8");
const montageExportSource = readFileSync(new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url), "utf8");
const htmlSource = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");
const playbackSource = readFileSync(new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url), "utf8");

if (!/id="timelineClipBackgroundVolumeRange"/.test(htmlSource) || !/id="timelineClipBackgroundVolumeNumber"/.test(htmlSource)) {
  throw new Error("El modal debe exponer controles para volumen de audio de fondo por escena.");
}

if (!/timelineSceneAudioMixByRowId: normalizeTimelineSceneAudioMixByRowId/.test(timelineModelSource)) {
  throw new Error("La configuración debe normalizar el mix de audio de fondo por escena.");
}

if (!/function getSceneBackgroundMusicVolumeOverridePct/.test(jsSource)) {
  throw new Error("Debe existir un helper para leer el override de volumen de fondo por escena.");
}

if (!/timelineClipBackgroundVolumeRange/.test(jsSource) || !/timelineClipBackgroundVolumeNumber/.test(jsSource)) {
  throw new Error("El JS debe enlazar los nuevos controles de volumen de fondo.");
}

if (!/timelineSceneAudioMixByRowId:\s*\{[\s\S]*backgroundMusicVolumePct/s.test(clipDurationSource)) {
  throw new Error("El modal debe persistir el volumen de fondo en timelineSceneAudioMixByRowId.");
}

if (!/buildTrackBackgroundSegments/.test(montageExportSource) || !/backgroundSegments: \[\.\.\.uploadedBackgroundSegments, \.\.\.trackBackgroundSegments\]/.test(montageExportSource)) {
  throw new Error("El export debe incluir segmentos de fondo por escena en audioTimeline.");
}

if (!/effectiveVolumePct = baseVolumePct \* \(Number\.isFinite\(sceneVolumePct\) \? \(sceneVolumePct \/ 100\) : 1\)/.test(montageExportSource)
  || !/const shouldApplyFadeIn = Math\.abs\(overlapStartMs - segmentStartMs\) <= 1;/.test(montageExportSource)
  || !/const shouldApplyFadeOut = Math\.abs\(overlapEndMs - segmentEndMs\) <= 1;/.test(montageExportSource)
  || !/fadeOutMs: shouldApplyFadeOut \? Math\.max\(0, Math\.min\(overlapDurationMs, Number\(segment\?\.fadeOutMs \|\| 0\) \|\| 0\)\) : 0/.test(montageExportSource)
  || !/id: `track-bg-loop-\$\{loopIndex\}-\$\{cursorMs\}`/.test(montageExportSource)
  || !/duckingWhenGeminiPct: Math\.max\(40, Math\.min\(100, Number\(segment\?\.duckingWhenGeminiPct \?\? segment\?\.duckingPct \?\? panelMusic\?\.duckingWhenGeminiPct \?\? 60\)\)\)/.test(montageExportSource)
  || !/duckingWhenGeminiPct: Math\.max\(40, Math\.min\(100, Number\(panelMusic\?\.duckingWhenGeminiPct \?\? 60\)\)\)/.test(montageExportSource)) {
  throw new Error("El payload de export debe conservar volumen por escena, ducking y fades solo en bordes reales del audio de fondo.");
}

if (!/const mix = entry\?\.rowId \? this\.deps\?\.resolveTimelineClipMix\?\.\(session, entry\.rowId\) : null;/.test(playbackSource)
  || !/const sceneBackgroundFactor = mix \? \(mix\.backgroundVolume \?\? 1\.0\) : 1\.0;/.test(playbackSource)
  || !/const finalVolume = \(baseVolume \/ 100\) \* this\.backgroundDuckFactor \* sceneBackgroundFactor(?: \* fadeInFactor \* fadeOutFactor)?;/.test(playbackSource)) {
  throw new Error("El playback vivo debe aplicar el override de fondo de la escena activa mediante resolveTimelineClipMix.");
}

if (!/const volumePct = Math\.max\(0, Math\.min\(200, legacyScaledPct\)\)/.test(readFileSync(new URL("../backend/server.js", import.meta.url), "utf8"))
  || !/fadeInMs/.test(readFileSync(new URL("../backend/server.js", import.meta.url), "utf8"))
  || !/segmentDuckVolume = normalizeMontageBackgroundDuckVolume/.test(readFileSync(new URL("../backend/server.js", import.meta.url), "utf8"))) {
  throw new Error("El backend debe preservar volumen 0-200, fades y ducking por segmento para el audio de fondo.");
}

console.log("Podcast scene background volume override OK.");
