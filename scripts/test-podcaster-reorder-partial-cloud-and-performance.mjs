import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster.js",
  "utf8"
);

assert.match(
  source,
  /async function persistReorderedTimelinePatchToCloud\(session = null, patch = \{\}\) \{/,
  "El reorder debe tener una persistencia cloud parcial dedicada."
);

assert.match(
  source,
  /const updatePayload = \{[\s\S]*"session\.podcastVideoConfig\.timelineClipsByRowId": patch\.timelineClipsByRowId,[\s\S]*"session\.podcastVideoConfig\.geminiDialogueTrack": patch\.geminiDialogueTrack,[\s\S]*"session\.podcastVideoConfig\.timelineOnScreenTextClipsByRowId": patch\.timelineOnScreenTextClipsByRowId[\s\S]*\};[\s\S]*await updateDoc\(sessionRef, updatePayload\);/m,
  "La persistencia parcial debe actualizar solo los subcampos de timeline necesarios."
);

const patchPersistMatch = source.match(
  /async function persistReorderedTimelinePatchToCloud\(session = null, patch = \{\}\) \{([\s\S]*?)\n\}/m
);

assert.ok(patchPersistMatch, "Debe existir el helper de persistencia parcial del reorder.");

assert.doesNotMatch(
  patchPersistMatch[1],
  /await setDoc\(/,
  "La persistencia parcial del reorder no debe usar setDoc."
);

assert.match(
  source,
  /void persistReorderedTimelinePatchToCloud\(refreshedSession, \{[\s\S]*timelineClipsByRowId:[\s\S]*geminiDialogueTrack:[\s\S]*timelineOnScreenTextClipsByRowId:/m,
  "El reorder debe disparar la persistencia cloud parcial con los subcampos reordenados."
);

assert.match(
  source,
  /upsertPodcastVideoConfig\(\(cfg\) => \{[\s\S]*\[isText \? "timelineOnScreenTextClipsByRowId" : "timelineClipsByRowId"\]: nextClips[\s\S]*\}, \{ autosave: false, persist: false, recordHistory: false \}\);/m,
  "El drag de escenas/chips no debe persistir ni crear snapshots de historial en cada pointermove."
);

const trimEndMatch = source.match(
  /if \(drag\.mode === "trim-end"\) \{\n\s+const session = getActiveSession\(\);[\s\S]*?const sourceDurationMs = Math\.max\(minTrimLen, Number\(drag\.sourceDurationMs \|\| current\.sourceDurationMs \|\| 0\)\);([\s\S]*?)\n  \}\n\}/m
);

assert.ok(trimEndMatch, "Debe existir el bloque trim-end del drag.");

const trimEndPreviewCalls = (trimEndMatch[1].match(/syncStudioTimelinePreview\(getActiveSession\(\), \{ currentMs, autoplay: isPreviewPlaying \}\);/g) || []).length;

assert.equal(
  trimEndPreviewCalls,
  1,
  "trim-end no debe duplicar la sincronización de preview durante el drag."
);

console.log("Podcaster reorder partial cloud + drag performance OK.");
