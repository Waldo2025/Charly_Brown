import { readFileSync } from "node:fs";

const panelMusicSource = readFileSync(new URL("../public/podcaster/podcaster-panel-music.js", import.meta.url), "utf8");
const timelineUiSource = readFileSync(new URL("../public/podcaster/podcaster-timeline-ui.js", import.meta.url), "utf8");
const timelineInteractionSource = readFileSync(new URL("../public/podcaster/podcaster-timeline-interaction.js", import.meta.url), "utf8");
const playbackSource = readFileSync(new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url), "utf8");
const exportSource = readFileSync(new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url), "utf8");
const podcasterSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const payloadSource = readFileSync(new URL("../public/podcaster/podcaster-session-payload.js", import.meta.url), "utf8");
const homeSource = readFileSync(new URL("../public/js/home.js", import.meta.url), "utf8");
const backendSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

const requirements = [
  [panelMusicSource, "loopEnabled: track.loopEnabled !== false", "normalizePanelMusicTrack must preserve loopEnabled with legacy default true."],
  [panelMusicSource, "const maxLoopCount = single.loopEnabled === false ? 1 : 120;", "Uploaded background audio must stop after one generated segment when loop is disabled."],
  [panelMusicSource, "const maxLoopCount = normalized.loopEnabled === false ? 1 : 120;", "Panel music loop segment builder must stop at one loop when disabled."],
  [panelMusicSource, "function togglePanelMusicTrackLoopEnabled", "Panel music API must expose a real loop toggle."],
  [timelineUiSource, "data-action=\"timeline-toggle-background-audio-loop\"", "Timeline audio track label must render the loop toggle button."],
  [podcasterSource, "togglePanelMusicTrackLoopEnabled(trackKind);", "Podcaster click handler must call the loop toggle."],
  [playbackSource, "const loopEnabled = panelCfg.loopEnabled !== false;", "Preview playback must read the loopEnabled flag."],
  [playbackSource, "loop: loopEnabled,", "Preview playback must carry loopEnabled into the active background segment."],
  [exportSource, "const loopEnabled = panelMusic?.loopEnabled !== false;", "Montage export must read the loopEnabled flag."],
  [exportSource, "if (!loopEnabled && loopIndex > 0) break;", "Montage export must not emit repeated background segments when disabled."],
  [payloadSource, "loopEnabled: panelMusicConfig.loopEnabled !== false,", "Cloud session payload must preserve top-level loopEnabled."],
  [payloadSource, "loopEnabled: panelMusicConfig.track.loopEnabled !== false,", "Cloud session payload must preserve track loopEnabled."],
  [homeSource, "loopEnabled: track.loopEnabled !== false,", "Home dashboard must preserve track loopEnabled while normalizing panel music."],
  [homeSource, "const maxLoopCount = single.loopEnabled === false ? 1 : 120;", "Home dashboard uploaded segments must stop after one generated segment when loop is disabled."],
  [homeSource, "loopEnabled: activeTrack?.loopEnabled !== false,", "Home dashboard montage config must expose loopEnabled for preview/export parity."],
  [backendSource, "loopEnabled: trackRaw?.loopEnabled !== false,", "Backend session sanitizer must preserve panel music track loopEnabled."],
  [timelineInteractionSource, "syncAudioMoveDragPreview(drag, nextStartOffsetMs, session);", "Audio chip drag must update the DOM preview during pointermove."],
  [timelineInteractionSource, "updatePanelMusicTrack(trackKind, (track) => ({", "Audio chip drag must persist through updatePanelMusicTrack on pointerup."],
  [timelineInteractionSource, "}), { render: false, sync: false });", "Audio chip drag pointerup must avoid an extra pre-render before final timeline render."]
];

const missing = requirements.filter(([source, snippet]) => !source.includes(snippet));
if (missing.length) {
  throw new Error(missing.map(([, snippet, message]) => `${message}\nMissing: ${snippet}`).join("\n\n"));
}

const audioMoveBlock = timelineInteractionSource.match(/if \(drag\.mode === "audio-move"\) \{[\s\S]*?return;\n    \}/)?.[0] || "";
if (!audioMoveBlock || audioMoveBlock.includes("renderPodcastVideoTimeline(") || audioMoveBlock.includes("persistPanelMusic")) {
  throw new Error("audio-move pointermove must not render or persist while dragging.");
}

console.log("Background audio loop toggle and realtime drag contract OK");
