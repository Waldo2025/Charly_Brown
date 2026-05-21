import { readFileSync } from "node:fs";

const podcasterSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const panelMusicSource = readFileSync(new URL("../public/podcaster/podcaster-panel-music.js", import.meta.url), "utf8");

const podcasterRequirements = [
  "panelLoopKey: \"\"",
  "function buildTimelinePanelAudioSelectionKey",
  "function deleteSelectedTimelineAudioChips",
  "event.key === \"Backspace\" || event.key === \"Delete\"",
  "removeDialogueAudioForRow(rowId",
  "removeUploadedTrackAt(trackIndex)",
  "clearTimelinePanelMusicTrackByKind(trackKind)",
  "timelineAudioSelection.panelLoopKey",
  ".podcast-montage-audio-chip[data-row-id]",
  "excludedRowIds",
  "excludedGeminiRowIds.has",
  "excludedRowIds: (geminiDialogueTrack.excludedRowIds || []).slice().sort()",
  "if (!hasStoredAudio) return \"\";"
];

const missingPodcasterRequirements = podcasterRequirements.filter((snippet) => !podcasterSource.includes(snippet));
if (missingPodcasterRequirements.length) {
  throw new Error(`podcaster.js debe soportar borrado por teclado de chips de audio: ${missingPodcasterRequirements.join(" | ")}`);
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
