import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../public/podcaster/podcaster.js", import.meta.url),
  "utf8"
);
const timelineUiSource = readFileSync(
  new URL("../public/podcaster/podcaster-timeline-ui.js", import.meta.url),
  "utf8"
);
const audioGeminiSource = readFileSync(
  new URL("../public/podcaster/podcaster-audioGemini-timeline.js", import.meta.url),
  "utf8"
);
const playbackControllerSource = readFileSync(
  new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url),
  "utf8"
);

assert.match(
  source,
  /function resolveDialogueAudioPlaybackRate\(session = null, rowId = ""\)\s*\{[\s\S]*const rowPlaybackRate = Math\.max\(0\.5, Math\.min\(2\.25, Number\(row\?\.playbackRate \|\| 1\) \|\| 1\)\);[\s\S]*return normalizeDialogueAudioPlaybackRate\(audioClip\?\.playbackRate \|\| rowPlaybackRate \|\| 1\);[\s\S]*\}/,
  "resolveDialogueAudioPlaybackRate debe caer al playbackRate persistido en la fila cuando no exista entrada explícita en dialogueAudioMap."
);

assert.match(
  source,
  /const fallbackClip = currentClip \|\| resolveDialogueAudioForRow\(current, rowId\) \|\| \{\};[\s\S]*const updatedAt = nowIso\(\);[\s\S]*nextMap\[rowId\] = \{[\s\S]*\.\.\.fallbackClip,[\s\S]*rowId,[\s\S]*playbackRate: nextPlaybackRate,[\s\S]*updatedAt[\s\S]*\};/,
  "applyGeminiAudioSpeedModal debe crear o actualizar una entrada en dialogueAudioMap incluso cuando el audio Gemini exista solo por fallback del track."
);

assert.match(
  timelineUiSource,
  /const resolveGeminiSegmentVisibleDurationMs = \(segment = null\) => \{[\s\S]*const trimmedVisibleMs = trimOutMs > trimInMs \? \(trimOutMs - trimInMs\) : 0;[\s\S]*const playbackRate = rowId[\s\S]*Math\.round\(rawVisibleMs \/ playbackRate\)/,
  "El timeline debe reducir el ancho visible del chip Gemini según trimOutMs - trimInMs y el playbackRate activo."
);

assert.match(
  timelineUiSource,
  /const measuredAudioVisibleMs = rowId[\s\S]*resolveRowAudioDurationMs\?\.\(rowId, activeSession\)[\s\S]*return Math\.max\(STUDIO_TIMELINE_MIN_CLIP_MS, segmentVisibleMs, measuredAudioVisibleMs\);/,
  "El ancho del chip Gemini debe usar como mínimo la duración real medida del audio, aunque el segmento guardado siga en 8s."
);

assert.match(
  timelineUiSource,
  /const measuredAudioVisibleMs = Math\.max\(0, Math\.round\(Number\(resolveRowAudioDurationMs\?\.\(rowId, activeSession\)[\s\S]*const visibleDurationMs = Math\.max\(STUDIO_TIMELINE_MIN_CLIP_MS, segmentVisibleMs, measuredAudioVisibleMs\);/,
  "El preview ligero del drag Gemini también debe usar la duración real medida del audio."
);

assert.match(
  readFileSync(new URL("../public/podcaster/podcaster-timeline-model.js", import.meta.url), "utf8"),
  /const measuredAudioVisibleMs = rowId[\s\S]*resolveRowAudioDurationMs\(rowId, session \|\| getActiveSession\(\)\)[\s\S]*measuredAudioVisibleMs,[\s\S]*Number\(segment\?\.durationMs \|\| 0\)/,
  "El ancho total del canvas debe contemplar la duración real del audio Gemini, no solo segment.durationMs."
);

assert.match(
  source,
  /function invalidateStudioRuntimeCache\(\)\s*\{[\s\S]*window\.studioRuntimeEntriesCache = null;[\s\S]*window\.studioRuntimeEntriesCacheKey = null;[\s\S]*\}/,
  "invalidateStudioRuntimeCache debe limpiar también el cache global usado por podcaster-timeline-model.js."
);

assert.match(
  source,
  /window\.invalidateStudioRuntimeCache = invalidateStudioRuntimeCache;/,
  "invalidateStudioRuntimeCache debe quedar expuesto para los módulos que miden metadata de audio."
);

assert.match(
  audioGeminiSource,
  /montageAudioActualDurationsMs\[rowId\] = nextMs;[\s\S]*window\.invalidateStudioRuntimeCache\?\.\(\);[\s\S]*window\.syncGeminiDialogueTrackWithRuntime\(\{ render: false, preserveStartMs: true \}\);/,
  "Al medir metadata Gemini en preload se debe invalidar el runtime antes de resincronizar el track."
);

assert.match(
  playbackControllerSource,
  /montageAudioActualDurationsMs\[rowId\] = nextMs;[\s\S]*window\.invalidateStudioRuntimeCache\(\);[\s\S]*window\.syncGeminiDialogueTrackWithRuntime\(\{ render: false, preserveStartMs: true \}\);/,
  "Al medir metadata Gemini durante playback se debe invalidar el runtime antes de resincronizar el track."
);

console.log("Podcaster Gemini audio chip speed width regression OK.");
