import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-timeline-interaction.js",
  "utf8"
);
const uiSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-timeline-ui.js",
  "utf8"
);
const podcasterSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster.js",
  "utf8"
);

assert.doesNotMatch(
  source,
  /minStartMs:\s*sceneStartMs,/,
  "El drag Gemini no debe bloquear el segmento al inicio de la escena."
);

assert.match(
  source,
  /minStartMs:\s*0,/,
  "El drag Gemini debe permitir mover el segmento a la izquierda hasta 0 ms del timeline."
);

assert.doesNotMatch(
  source,
  /sceneStartMs \+ sceneDurationMs - durationMs/,
  "El drag Gemini no debe bloquear el movimiento derecho al final de la escena original."
);

assert.match(
  source,
  /const totalMs = Math\.max\(STUDIO_TIMELINE_MIN_CLIP_MS, getTimelineTotalDurationMs\(session\)\);[\s\S]*const maxStartMs = Math\.max\(0, totalMs - durationMs\);/m,
  "El drag Gemini debe permitir mover el segmento a la derecha hasta el final real del timeline."
);

assert.doesNotMatch(
  source,
  /const selected = Array\.from\(podcastVideoState\.timelineAudioSelection\.geminiRowIds\);[\s\S]*selected\.includes/,
  "El drag manual de Gemini no debe mover todos los chips seleccionados; solo el chip bajo el puntero."
);

assert.match(
  source,
  /\.filter\(\(segment\) => String\(segment\?\.rowId \|\| ""\)\.trim\(\) === rowId\)/,
  "El snapshot de drag Gemini debe limitarse al rowId activo."
);

assert.doesNotMatch(
  source,
  /anchorStartMs:\s*Number\(segment\.minStartMs \|\| 0\)/,
  "El drag Gemini no debe reemplazar anchorStartMs por minStartMs=0; eso provoca saltos al soltar."
);

assert.match(
  source,
  /if \(dragMode === "gemini-segment-move"\) \{[\s\S]*scheduleSessionLocalPersist\("timeline-gemini-audio"\);[\s\S]*return true;[\s\S]*\}/m,
  "Al soltar un chip Gemini se debe persistir el movimiento sin reconciliarlo como posición automática de escena."
);

assert.match(
  uiSource,
  /activeGeminiDragRows[\s\S]*segmentsSnapshot[\s\S]*if \(activeGeminiDragRows && !activeGeminiDragRows\.has\(rowId\)\) return;/m,
  "Durante el drag Gemini, el preview del timeline solo debe mover el chip activo."
);

const alignStart = uiSource.indexOf("const syncMontageAudioSubtrackAlignment = () => {");
assert.notEqual(alignStart, -1, "Debe existir syncMontageAudioSubtrackAlignment.");
const alignEnd = uiSource.indexOf("const originalRows", alignStart);
assert.notEqual(alignEnd, -1, "Debe poder aislarse el bloque syncMontageAudioSubtrackAlignment.");
const alignmentSource = uiSource.slice(alignStart, alignEnd);

assert.doesNotMatch(
  alignmentSource,
  /const leftPx = Math\.max\(0, timelineMsToPx\(Number\(segment\?\.startMs \|\| 0\) \|\| 0, activeSession\)\);/,
  "La alineación posterior al render no debe omitir STUDIO_TIMELINE_SUBTRACK_LEFT_NUDGE_PX porque desplaza el chip al soltar."
);

assert.match(
  alignmentSource,
  /timelineMsToPx\(Number\(segment\?\.startMs \|\| 0\) \|\| 0, activeSession\) \+ STUDIO_TIMELINE_SUBTRACK_LEFT_NUDGE_PX/m,
  "La alineación posterior al render debe usar el mismo nudge que el render y el preview del drag."
);

const buildTrackStart = podcasterSource.indexOf("function buildGeminiDialogueTimelineTrack");
const reconcileStart = podcasterSource.indexOf("function reconcileGeminiDialogueTrackWithRuntime");
const reorderStart = podcasterSource.indexOf("function buildReorderedGeminiDialogueTrack");
assert.notEqual(buildTrackStart, -1, "Debe existir buildGeminiDialogueTimelineTrack.");
assert.notEqual(reconcileStart, -1, "Debe existir reconcileGeminiDialogueTrackWithRuntime.");
assert.notEqual(reorderStart, -1, "Debe existir buildReorderedGeminiDialogueTrack.");
const reorderEnd = podcasterSource.indexOf("function buildReorderedOnScreenTextClips", reorderStart);
assert.notEqual(reorderEnd, -1, "Debe poder aislarse buildReorderedGeminiDialogueTrack.");
const reorderSource = podcasterSource.slice(reorderStart, reorderEnd);
const buildTrackSource = podcasterSource.slice(buildTrackStart, reconcileStart);
const reconcileEnd = podcasterSource.indexOf("function syncGeminiDialogueTrackWithRuntime", reconcileStart);
assert.notEqual(reconcileEnd, -1, "Debe poder aislarse reconcileGeminiDialogueTrackWithRuntime.");
const reconcileSource = podcasterSource.slice(reconcileStart, reconcileEnd);

assert.doesNotMatch(
  buildTrackSource,
  /clampGeminiSegmentStartToScene\(/,
  "La construcción del track Gemini no debe volver a limitar el audio a la escena VEO."
);

assert.doesNotMatch(
  reconcileSource,
  /clampGeminiSegmentStartToScene\(/,
  "La reconciliación del track Gemini no debe volver a limitar el audio a la escena VEO."
);

assert.doesNotMatch(
  reorderSource,
  /clampGeminiSegmentStartToScene\(|Math\.min\([\s\S]*sceneDurationMs/,
  "El reordenamiento no debe recortar ni reubicar Gemini dentro de la duración de la escena VEO."
);

assert.match(
  buildTrackSource,
  /clampGeminiSegmentStartToTimeline\([\s\S]*desiredStartMs \+ durationMs[\s\S]*durationMs[\s\S]*desiredStartMs/m,
  "La construcción del track Gemini debe limitar por timeline, expandiéndolo si el audio se sale del video."
);

assert.match(
  reconcileSource,
  /clampGeminiSegmentStartToTimeline\([\s\S]*desiredStartMs \+ durationMs[\s\S]*durationMs[\s\S]*desiredStartMs/m,
  "La reconciliación del track Gemini debe limitar por timeline, expandiéndolo si el audio se sale del video."
);

assert.match(
  reorderSource,
  /clampGeminiSegmentStartToTimeline\([\s\S]*desiredStartMs \+ durationMs[\s\S]*durationMs[\s\S]*desiredStartMs/m,
  "El reordenamiento de Gemini debe conservar el offset relativo sin atarlo a los bordes del video."
);

console.log("Podcaster Gemini segment move allows left offset OK.");
