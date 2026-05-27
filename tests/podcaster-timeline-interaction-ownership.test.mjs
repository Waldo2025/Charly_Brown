import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const uiSource = readFileSync(new URL("../public/podcaster/podcaster-timeline-ui.js", import.meta.url), "utf8");
const podcasterSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const interactionSource = readFileSync(new URL("../public/podcaster/podcaster-timeline-interaction.js", import.meta.url), "utf8");

function readDependencyNames(source) {
  const match = source.match(/const \{([\s\S]*?)\n  \} = deps;/);
  assert.ok(match, "expected interaction module to destructure deps");
  return [...match[1].matchAll(/\n\s*([A-Za-z_$][\w$]*)\s*(?:,|$)/g)].map((item) => item[1]);
}

function readPassedDependencyNames(source) {
  const match = source.match(/podcasterTimelineInteractionApi = createPodcasterTimelineInteractionApi\(\{([\s\S]*?)\n\}\);/);
  assert.ok(match, "expected podcaster.js to instantiate timeline interaction api");
  return [...match[1].matchAll(/\n\s*([A-Za-z_$][\w$]*)\s*(?::|,|$)/g)].map((item) => item[1]);
}

test("timeline ui api exposes pointer interaction surface", () => {
  assert.match(
    uiSource,
    /return \{[\s\S]*handlePointerDown[\s\S]*handlePointerMove[\s\S]*handlePointerUp[\s\S]*cancelActiveDrag[\s\S]*renderTimeline[\s\S]*syncPlayheadFromPointer[\s\S]*\};/m
  );
});

test("timeline interaction api owns pointer interaction handlers", () => {
  assert.match(
    interactionSource,
    /return \{[\s\S]*handlePointerDown[\s\S]*handleClick[\s\S]*handlePointerMove[\s\S]*handlePointerUp[\s\S]*cancelActiveDrag[\s\S]*applyClipDrag[\s\S]*finalizeClipDrag[\s\S]*finalizeLinkedGeminiDrag[\s\S]*beginClipDrag[\s\S]*beginAudioTrimDrag[\s\S]*beginAudioMoveDrag[\s\S]*beginGeminiSegmentMoveDrag[\s\S]*beginUploadedAudioSegmentMoveDrag[\s\S]*beginGeminiTrackReorderDrag[\s\S]*deleteSelectedAudioChips[\s\S]*\};/m
  );
});

test("podcaster.js passes every declared timeline interaction dependency explicitly", () => {
  const required = readDependencyNames(interactionSource);
  const passed = readPassedDependencyNames(podcasterSource);
  assert.deepEqual(
    required.filter((name) => !passed.includes(name)),
    []
  );
});

test("podcaster.js delegates timeline pointer handlers to the timeline ui api", () => {
  assert.match(podcasterSource, /document\.addEventListener\("mousemove",\s*\(event\)\s*=>\s*podcasterTimelineUiApi\?\.handlePointerMove\?\.?\(event\)\);/);
  assert.match(podcasterSource, /document\.addEventListener\("mouseup",\s*\(event\)\s*=>\s*podcasterTimelineUiApi\?\.handlePointerUp\?\.?\(event\)\);/);
  assert.match(podcasterSource, /els\.podcastVideoTimeline\.addEventListener\("mousedown",\s*\(event\)\s*=>\s*podcasterTimelineUiApi\?\.handlePointerDown\?\.?\(event\)\);/);
});

test("podcaster.js no longer owns inline timeline drag helper functions", () => {
  assert.doesNotMatch(podcasterSource, /function beginTimelineClipDrag\(/);
  assert.doesNotMatch(podcasterSource, /function beginTimelineAudioTrimDrag\(/);
  assert.doesNotMatch(podcasterSource, /function applyTimelineClipDrag\(/);
  assert.doesNotMatch(podcasterSource, /function finalizeTimelineClipDrag\(/);
  assert.doesNotMatch(podcasterSource, /function timelineInteractionApplyClipDrag\(/);
  assert.doesNotMatch(podcasterSource, /function timelineInteractionFinalizeClipDrag\(/);
  assert.doesNotMatch(podcasterSource, /function timelineInteractionFinalizeLinkedGeminiDrag\(/);
  assert.doesNotMatch(podcasterSource, /function timelineInteractionBeginClipDrag\(/);
  assert.doesNotMatch(podcasterSource, /function timelineInteractionBeginAudioTrimDrag\(/);
  assert.doesNotMatch(podcasterSource, /function timelineInteractionBeginAudioMoveDrag\(/);
  assert.doesNotMatch(podcasterSource, /function timelineInteractionBeginGeminiSegmentMoveDrag\(/);
  assert.doesNotMatch(podcasterSource, /function timelineInteractionBeginUploadedAudioSegmentMoveDrag\(/);
  assert.doesNotMatch(podcasterSource, /function timelineInteractionBeginGeminiTrackReorderDrag\(/);
  assert.doesNotMatch(podcasterSource, /function deleteSelectedTimelineAudioChips\(/);
  assert.doesNotMatch(podcasterSource, /function buildTimelinePanelAudioSelectionKey\(/);
  assert.doesNotMatch(podcasterSource, /function clearTimelinePanelMusicTrackByKind\(/);
  assert.doesNotMatch(podcasterSource, /timelineInteractionApplyClipDrag,/);
  assert.doesNotMatch(podcasterSource, /timelineInteractionFinalizeClipDrag,/);
  assert.doesNotMatch(podcasterSource, /timelineInteractionFinalizeLinkedGeminiDrag,/);
  assert.doesNotMatch(podcasterSource, /timelineInteractionBeginClipDrag,/);
  assert.doesNotMatch(podcasterSource, /timelineInteractionBeginAudioTrimDrag,/);
  assert.doesNotMatch(podcasterSource, /timelineInteractionBeginAudioMoveDrag,/);
  assert.doesNotMatch(podcasterSource, /timelineInteractionBeginGeminiSegmentMoveDrag,/);
  assert.doesNotMatch(podcasterSource, /timelineInteractionBeginUploadedAudioSegmentMoveDrag,/);
  assert.doesNotMatch(podcasterSource, /timelineInteractionBeginGeminiTrackReorderDrag,/);
  assert.doesNotMatch(podcasterSource, /timelinePointerHandlerBridge/);
  assert.doesNotMatch(podcasterSource, /function handleTimelinePointerDownImpl\(/);
  assert.doesNotMatch(podcasterSource, /function handleTimelinePointerMoveImpl\(/);
  assert.doesNotMatch(podcasterSource, /function handleTimelinePointerUpImpl\(/);
  assert.doesNotMatch(podcasterSource, /function cancelTimelineActiveDragImpl\(/);
});

test("timeline interaction owns Gemini audio chip click and drag behavior", () => {
  assert.match(interactionSource, /function handleClick\(event = null\) \{/);
  assert.match(interactionSource, /const montageAudioChip = event\.target\.closest\("\.podcast-montage-audio-chip\.is-stored\[data-row-id\]"\);[\s\S]*beginGeminiSegmentMoveDrag\(event\);/m);
  assert.match(interactionSource, /if \(getTimelineViewMode\(getActiveSession\(\)\) !== "tracks"\) return;[\s\S]*const resizeHandle/m);
  assert.doesNotMatch(podcasterSource, /const selectAllGeminiBtn = event\.target\.closest\("\[data-action='timeline-select-all-gemini-audio'\]"\);/);
  assert.doesNotMatch(podcasterSource, /const geminiChip = event\.target\.closest\("\[data-action='timeline-select-gemini-audio'\]\[data-row-id\]"\);/);
  assert.doesNotMatch(podcasterSource, /const montageAudioChip = event\.target\.closest\("\.podcast-montage-audio-chip\[data-row-id\]"\);/);
});
