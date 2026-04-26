import { readFileSync } from "node:fs";

const podcasterSource = readFileSync(new URL("../public/podcaster.js", import.meta.url), "utf8");
const playbackSource = readFileSync(new URL("../public/podcaster.playback.js", import.meta.url), "utf8");
const backendSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

if (!/function timelineHasVisualOverlap\(session = null, runtimeEntries = null\) \{/.test(podcasterSource)) {
  throw new Error("Falta helper para detectar overlap visual en el timeline.");
}

if (!/if \(timelineHasVisualOverlap\(session, runtimeEntries\)\) \{[\s\S]*await playPodcastStudioMontage\(startMs\);[\s\S]*return;[\s\S]*\}/m.test(podcasterSource)) {
  throw new Error("El boton Play debe usar el motor de montaje cuando detecta escenas solapadas.");
}

if (!/timelineClipVisualLayoutMode/.test(podcasterSource)
  || !/visualLayoutMode: normalizeTimelineClipVisualLayoutMode\(raw\?\.visualLayoutMode\)/.test(podcasterSource)
  || !/visualLayoutMode: normalizeTimelineClipVisualLayoutMode\(entry\?\.clip\?\.visualLayoutMode\)/.test(podcasterSource)) {
  throw new Error("El modo visual por clip debe persistirse y viajar al payload de export.");
}

if (!/const overlapCandidates = activeEntries\.filter\(\(entry\) => Boolean\(String\(entry\?\.videoSrc \|\| ""\)\.trim\(\)\)\);/.test(playbackSource)
  || !/const canOverlapPreview = Boolean\(overlapCandidates\.length >= 2\);/.test(playbackSource)
  || !/async function ensureStageBundleReady\(bundle = null, entry = null, offsetSec = 0, options = \{\}\)/.test(playbackSource)
  || !/const byPriority = \[\.\.\.overlapCandidates\]\.sort\(\(a, b\) => \(/.test(playbackSource)
  || !/setStageBundleOpacity\(incomingBundle, okTop \? 1 : 0\);/.test(playbackSource)) {
  throw new Error("El preview del montaje debe priorizar la escena superior en overlaps sin crossfade.");
}

if (!/function buildMontageOverlapCompositionPlan\(exportedEntries = \[\]\) \{/.test(backendSource)
  || !/async function renderMontageOverlapComposition\(\{/.test(backendSource)
  || !/visualLayoutMode = String\(entry\?\.visualLayoutMode \|\| ""\)\.trim\(\)\.toLowerCase\(\) === "blur-backdrop"/.test(backendSource)
  || !/boxblur=24:8/.test(backendSource)
  || !/Number\(a\?\.zIndex \|\| 0\) - Number\(b\?\.zIndex \|\| 0\)/.test(backendSource)
  || /fade=t=in/.test(backendSource)
  || !/if \(overlapPlan\.hasOverlap\) \{[\s\S]*renderMontageOverlapComposition\(/m.test(backendSource)) {
  throw new Error("El export backend debe priorizar la capa superior en overlaps y soportar blur backdrop por escena.");
}

console.log("Podcast overlap playback/export OK.");
