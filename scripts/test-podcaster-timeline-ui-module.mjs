import fs from "node:fs";

const podcasterSource = fs.readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const timelineUiModulePath = new URL("../public/podcaster/podcaster-timeline-ui.js", import.meta.url);
const timelineUiModuleSource = fs.existsSync(timelineUiModulePath)
  ? fs.readFileSync(timelineUiModulePath, "utf8")
  : "";

if (!/import\s+\{\s*createPodcasterTimelineUiApi\s*\}\s+from\s+"\.\/podcaster-timeline-ui\.js";/m.test(podcasterSource)) {
  throw new Error("podcaster.js debe importar createPodcasterTimelineUiApi desde podcaster-timeline-ui.js.");
}

if (!/export\s+function\s+createPodcasterTimelineUiApi\s*\(/m.test(timelineUiModuleSource)) {
  throw new Error("podcaster-timeline-ui.js debe exportar createPodcasterTimelineUiApi.");
}

if (!/const podcasterTimelineUiApi = createPodcasterTimelineUiApi\(/m.test(podcasterSource)) {
  throw new Error("podcaster.js debe inicializar podcasterTimelineUiApi.");
}

const requiredDelegates = [
  "attachPodcastTimelineScrollSync",
  "disconnectPodcastTimelinePreviewObserver",
  "setTimelinePreviewsSuspended",
  "loadTimelinePreviewVideo",
  "attachPodcastTimelinePreviewLoading",
  "syncPodcastTimelineLaneOffsetFromDom",
  "getPodcastTimelineClipMenuPortal",
  "closePodcastTimelineClipMenu",
  "renderPodcastVideoTimeline",
  "syncPodcastTimelineSelectionUi",
  "syncPodcastTimelinePlayhead",
  "scheduleStudioTimelinePreviewSync",
  "seekStudioTimelineByClientX",
  "seekStudioTimelineByRulerClientX",
  "syncTimelineGeminiSegmentDragPreview"
];

for (const name of requiredDelegates) {
  const delegateRegex = new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*\\{\\s*return\\s+podcasterTimelineUiApi\\.${name}\\(`, "m");
  if (!delegateRegex.test(podcasterSource)) {
    throw new Error(`podcaster.js debe delegar ${name} a podcasterTimelineUiApi.`);
  }
}

console.log("Podcaster timeline UI module regression test OK.");
