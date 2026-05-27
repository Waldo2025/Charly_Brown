import { readFileSync } from "node:fs";

const podcasterSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const panelMusicSource = readFileSync(new URL("../public/podcaster/podcaster-panel-music.js", import.meta.url), "utf8");
const timelineInteractionSource = readFileSync(new URL("../public/podcaster/podcaster-timeline-interaction.js", import.meta.url), "utf8");
const timelineUiSource = readFileSync(new URL("../public/podcaster/podcaster-timeline-ui.js", import.meta.url), "utf8");

const podcasterRequirements = [
  "panelLoopKey: \"\"",
  "event.key === \"Backspace\" || event.key === \"Delete\"",
  "excludedRowIds",
  "excludedRowIds: (geminiDialogueTrack.excludedRowIds || []).slice().sort()"
];

const missingPodcasterRequirements = podcasterRequirements.filter((snippet) => !podcasterSource.includes(snippet));
if (missingPodcasterRequirements.length) {
  throw new Error(`podcaster.js debe soportar borrado por teclado de chips de audio: ${missingPodcasterRequirements.join(" | ")}`);
}

const timelineInteractionRequirements = [
  "function buildPanelAudioSelectionKey",
  "function deleteSelectedAudioChips",
  "removeDialogueAudioForRow(rowId",
  "removeUploadedTrackAt(trackIndex)",
  "clearPanelMusicTrackByKind(trackKind)",
  "timelineAudioSelection.panelLoopKey",
  ".podcast-montage-audio-chip[data-row-id]"
];

const missingTimelineInteractionRequirements = timelineInteractionRequirements.filter((snippet) => !timelineInteractionSource.includes(snippet));
if (missingTimelineInteractionRequirements.length) {
  throw new Error(`podcaster-timeline-interaction.js debe poseer el borrado de chips de audio: ${missingTimelineInteractionRequirements.join(" | ")}`);
}

const timelineUiRequirements = [
  "excludedGeminiRowIds.has",
  "if (!hasStoredAudio) return \"\";"
];

const missingTimelineUiRequirements = timelineUiRequirements.filter((snippet) => !timelineUiSource.includes(snippet));
if (missingTimelineUiRequirements.length) {
  throw new Error(`podcaster-timeline-ui.js debe ocultar chips Gemini sin audio guardado: ${missingTimelineUiRequirements.join(" | ")}`);
}

const panelMusicRequirements = [
  "selectionState.panelLoopKey = \"\";",
  "selectionState.panelLoopKey = buildSelectionKey(trackKind, loopIndex);",
  "selectionState.geminiRowIds?.clear?.();"
];

const missingPanelMusicRequirements = panelMusicRequirements.filter((snippet) => !panelMusicSource.includes(snippet));
if (missingPanelMusicRequirements.length) {
  throw new Error(`podcaster-panel-music.js debe sincronizar la selección de chips de audio: ${missingPanelMusicRequirements.join(" | ")}`);
}

const geminiTimelineRequirements = [
  "excludedRowIds: track.excludedRowIds.filter",
  "excludedRowIds: nextExcludedRowIds",
  "window.renderPodcastVideoTimeline(window.getActiveSession(), { force: true, reason: \"structure\" });"
];

const geminiTimelineSource = readFileSync(new URL("../public/podcaster/podcaster-audioGemini-timeline.js", import.meta.url), "utf8");
const missingGeminiTimelineRequirements = geminiTimelineRequirements.filter((snippet) => !geminiTimelineSource.includes(snippet));
if (missingGeminiTimelineRequirements.length) {
  throw new Error(`podcaster-audioGemini-timeline.js debe permitir ocultar/restaurar chips Gemini vacíos: ${missingGeminiTimelineRequirements.join(" | ")}`);
}

console.log("Podcaster timeline audio backspace contract OK.");
