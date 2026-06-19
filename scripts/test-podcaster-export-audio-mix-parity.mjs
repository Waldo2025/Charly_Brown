import { readFileSync } from "node:fs";

const podcasterSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const playbackSource = readFileSync(new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url), "utf8");
const exportSource = readFileSync(new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url), "utf8");
const backendSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

if (!/Object\.assign\(window,[\s\S]*shouldKeepNativeVideoAudioForRow/.test(podcasterSource)) {
  throw new Error("shouldKeepNativeVideoAudioForRow debe exponerse en window para el payload de export.");
}

if (!/shouldKeepNativeVideoAudioForRow/.test(exportSource)
  || !/useNativeVideoAudio:\s*useNativeVideoAudio === true/.test(exportSource)) {
  throw new Error("El export debe conservar audio VEO cuando el mix de la escena lo activa.");
}

if (!/const src = String\(\s*storedAudio\?\.downloadUrl\s*\|\|\s*storedAudio\?\.storagePath\s*(?:\|\|\s*storedAudio\?\.localDataUrl\s*\|\|\s*storedAudio\?\.dataUrl\s*)?\|\|\s*segment\?\.audioSrc\s*\|\|\s*runtime\?\.audioSrc\s*\|\|\s*""\s*\)\.trim\(\);/.test(exportSource)) {
  throw new Error("Los segmentos Gemini exportados deben preservar fuentes durables antes de construir el timeline de audio.");
}

if (!exportSource.includes("storagePath: String(panelMusic?.storagePath || \"\").trim(),")
  || !exportSource.includes("downloadUrl: String(panelMusic?.downloadUrl || \"\").trim(),")
  || !exportSource.includes("localDataUrl: String(panelMusic?.localDataUrl || \"\").trim(),")) {
  throw new Error("La configuración de música de export debe preservar downloadUrl/storagePath/localDataUrl explícitos.");
}

if (!/const trackUrl = String\(panelMusic\?\.downloadUrl \|\| panelMusic\?\.storagePath \|\| panelMusic\?\.sourceUrl\s*(?:\|\|\s*panelMusic\?\.localDataUrl\s*\|\|\s*panelMusic\?\.dataUrl\s*)?\|\|\s*""\s*\)\.trim\(\);/.test(exportSource)
  || !exportSource.includes("backgroundMusic = includeBackgroundMusic ? {")
  || !exportSource.includes("storagePath: String(panelMusic?.storagePath || \"\").trim(),")
  || !exportSource.includes("downloadUrl: String(panelMusic?.downloadUrl || \"\").trim(),")) {
  throw new Error("El background music de export debe exponer fuentes durables para el mezclador.");
}

if (!/const sceneMix = window\.resolveTimelineClipMix\?\.\(activeSession, rowId\) \|\| null;/.test(exportSource)
  || !/veoVolumeOverridePct: resolvedVeoVolumePct/.test(exportSource)) {
  throw new Error("El export debe usar el mix efectivo de escena para el volumen VEO, no solo el runtime clip cacheado.");
}

if (!/const preserveManualVeo = Number\.isFinite\(currentVeoOverride\) && Math\.round\(currentVeoOverride\) !== previousVeoPct;/.test(podcasterSource)
  || !/veoVolumeOverridePct: preserveManualVeo \? current\.veoVolumeOverridePct : veoPct/.test(podcasterSource)) {
  throw new Error("montageSceneVeoVolumeRange no debe pisar overrides manuales de timelineClipVeoVolumeRange.");
}

if (!/shouldKeepNativeVideoAudioForRow/.test(playbackSource)
  || !/shouldUseNativeVideoAudioForRow/.test(playbackSource)) {
  throw new Error("El playback vivo/home debe preferir el mix de escena y conservar el fallback de librería pública.");
}

if (!/function normalizeMontageExportRequestBody/.test(backendSource)
  || !/isTimelineBackgroundAudioKind/.test(backendSource)
  || !/normalizedGeminiTimelineSegments = timelineAudioSegments\.filter\(\(segment\) => !isTimelineBackgroundAudioKind\(segment\?\.kind\)\)/.test(backendSource)) {
  throw new Error("El backend debe separar segmentos Gemini reales de segmentos de fondo.");
}

if (!/kind === "uploaded" \|\| kind === "background-track" \|\| kind === "background" \|\| kind === "music"/.test(backendSource)
  || !/isBackgroundSegment && input\.normalizedGeminiTimelineSegments\.length/.test(backendSource)) {
  throw new Error("El ducking de export debe aplicarse a todos los segmentos de fondo, incluidos background-track.");
}

if (!/const veoVolumePct = Math\.max\(0, Math\.min\(200, Number\(entry\?\.veoVolumeOverridePct \?\? 0\)\)\);/.test(backendSource)
  || !/const useNativeVideoAudio = entry\?\.useNativeVideoAudio === true \|\| veoVolumePct > 0\.0001;/.test(backendSource)) {
  throw new Error("El backend debe inferir audio VEO activo desde veoVolumeOverridePct aunque falte useNativeVideoAudio.");
}

if (!/const sceneVeoVolumePct = Math\.max\(0, Math\.min\(200, Number\(entry\?\.veoVolumeOverridePct \?\? 0\)\)\);/.test(backendSource)
  || !/const includeSceneAudio = input\?\.useTimelineAudio !== true \|\| \(entry\?\.useNativeVideoAudio === true && sceneVeoVolumePct > 0\.0001\);/.test(backendSource)) {
  throw new Error("La composición con overlap/gaps debe conservar audio VEO por escena aunque exista audioTimeline.");
}

console.log("Podcaster export audio mix parity OK.");
