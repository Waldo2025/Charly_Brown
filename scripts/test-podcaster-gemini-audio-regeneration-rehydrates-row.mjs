import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const audioTimelineSource = readFileSync(
  new URL("../public/podcaster/podcaster-audioGemini-timeline.js", import.meta.url),
  "utf8"
);

const playbackSource = readFileSync(
  new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url),
  "utf8"
);

const podcasterSource = readFileSync(
  new URL("../public/podcaster/podcaster.js", import.meta.url),
  "utf8"
);

assert.match(
  audioTimelineSource,
  /const previousAudioClip = window\.resolveDialogueAudioForRow\?\.\(session, key\) \|\| null;/,
  "La regeneración debe capturar el clip previo antes de mutar dialogueAudioMap."
);

assert.match(
  audioTimelineSource,
  /const previousAudioSourceKey = typeof window\.playbackController\?\.resolveAudioSourceKey === "function"[\s\S]*?window\.playbackController\.resolveAudioSourceKey\(previousAudioClip\)/,
  "La regeneración debe capturar el sourceKey previo para poder invalidar blobs stale."
);

assert.match(
  audioTimelineSource,
  /const nextAudioClip = window\.resolveDialogueAudioForRow\?\.\(nextSession, key\)[\s\S]*?\|\| window\.getDialogueAudioMap\?\.\(nextSession\)\?\.\[key\]/,
  "Tras upsert, el audio nuevo debe resolverse desde la sesión actualizada y quedar como entrada explícita."
);

assert.match(
  audioTimelineSource,
  /previousClip: previousAudioClip,[\s\S]*previousSourceKey: previousAudioSourceKey,[\s\S]*nextClip: nextAudioClip,[\s\S]*nextSourceKey: nextAudioSourceKey,/,
  "La invalidación debe recibir fuente previa y fuente nueva."
);

assert.match(
  audioTimelineSource,
  /renderPodcastVideoTimeline\?\.\(window\.getActiveSession\(\), \{ force: true, reason: "dialogue-audio-regenerated" \}\);/,
  "La regeneración debe rehidratar el timeline inmediatamente después de sincronizar el track."
);

assert.match(
  playbackSource,
  /invalidateRowAudioCache\(rowId = "", options = \{\}\)/,
  "El playback controller debe aceptar opciones explícitas de invalidación."
);

assert.match(
  playbackSource,
  /collectClipSources\(options\?\.previousClip\);[\s\S]*collectClipSources\(currentClip\);[\s\S]*collectClipSources\(options\?\.nextClip\);/,
  "La invalidación debe limpiar referencias del clip anterior, actual y nuevo."
);

assert.match(
  playbackSource,
  /addSourceCandidate\(options\?\.previousSourceKey\);[\s\S]*addSourceCandidate\(options\?\.nextSourceKey\);[\s\S]*addSourceCandidate\(this\.dialogueAudioSourceKeys\[key\]\);/,
  "La invalidación debe limpiar sourceKeys previos/nuevos y el sourceKey activo del row."
);

assert.match(
  playbackSource,
  /delete this\.dialoguePlayers\[key\];[\s\S]*delete this\.audioCache\[key\];[\s\S]*delete this\.dialogueAudioSourceKeys\[key\];/,
  "La invalidación debe eliminar player, cache y sourceKey para forzar un Audio nuevo."
);

assert.match(
  podcasterSource,
  /function hasExplicitDialogueAudioForRow\(session = null, rowId = ""\) \{[\s\S]*return Boolean\(getDialogueAudioMap\(session\)\[key\]\);[\s\S]*\}/,
  "El audio fallback del track no debe contar como explícito para escenas de biblioteca pública."
);

console.log("Podcaster Gemini audio regeneration rehydration contract OK.");
