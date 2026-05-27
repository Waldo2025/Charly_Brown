import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const podcasterSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../public/podcaster.css", import.meta.url), "utf8");
const onScreenTextSource = readFileSync(new URL("../public/podcaster/podcaster-on-screen-text.js", import.meta.url), "utf8");
const playbackControllerSource = readFileSync(new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url), "utf8");

test("on-screen text drag commits a shared track anchor across layouts", () => {
  assert.match(podcasterSource, /function syncOnScreenTextTrackAnchorAcrossLayouts\(session = null, options = \{\}\)/);
  assert.match(
    podcasterSource,
    /endOnScreenTextOverlayDrag\(event = null\)[\s\S]*?syncOnScreenTextTrackAnchorAcrossLayouts\(session,\s*\{[\s\S]*?overlayXPct:\s*nextX \+ \(safeWidthPct \/ 2\),[\s\S]*?overlayYPct:\s*nextY \+ safeHeightPct[\s\S]*?\}\);/m
  );
});

test("on-screen text width setting recomputes all layouts from the shared anchor", () => {
  assert.match(
    podcasterSource,
    /function syncOnScreenTextTrackWidthAcrossLayouts\(session = null\)[\s\S]*?return syncOnScreenTextTrackAnchorAcrossLayouts\(activeSession,\s*\{[\s\S]*?widthPct:\s*nextWidthPct,[\s\S]*?recomputeHeight:\s*true[\s\S]*?\}\);/m
  );
  assert.match(
    podcasterSource,
    /if \(key === "boxWidthPct"\) \{[\s\S]*?syncOnScreenTextTrackWidthAcrossLayouts\(session\);[\s\S]*?session = getActiveSession\(\);[\s\S]*?\}/m
  );
  assert.match(
    podcasterSource,
    /function getOnScreenTextLayoutForRow\(session = null, rowId = ""\)[\s\S]*?const effectiveWidthPct = Math\.max\(0\.22, Math\.min\(0\.92, Number\(settings\.boxWidthPct \|\| baseLayout\.widthPct \|\| 0\.58\)\)\);[\s\S]*?widthPct:\s*effectiveWidthPct,[\s\S]*?xPct:\s*effectiveXPct,[\s\S]*?yPct:\s*effectiveYPct/m
  );
});

test("3d text without background allows a wider box and lowers the visual baseline", () => {
  assert.match(
    cssSource,
    /\.podcast-on-screen-text-content\.is-style-3d\.is-bg-none\s*\{[\s\S]*?max-width:\s*min\(96%, var\(--pod-onscreen-text-bubble-width, 1200px\)\) !important;[\s\S]*?transform:\s*translateY\(0\.16em\);[\s\S]*?\}/m
  );
});

test("shared preview spec carries bubble geometry as inline css variables", () => {
  assert.match(
    onScreenTextSource,
    /function buildOnScreenTextBubbleInlineStyle\(settings = null, options = \{\}\)[\s\S]*?--pod-onscreen-text-x:[\s\S]*?--pod-onscreen-text-y:[\s\S]*?--pod-onscreen-text-bubble-width:[\s\S]*?--pod-onscreen-text-bubble-height:[\s\S]*?--pod-onscreen-text-color:/m
  );
  assert.doesNotMatch(onScreenTextSource, /font-size:\$\{fontSizePx\}px !important/);
  assert.doesNotMatch(onScreenTextSource, /line-height:\$\{metrics\.previewLineHeightPx\}px !important/);
});

test("playback controller does not re-hardcode bubble width and position outside the shared spec", () => {
  assert.doesNotMatch(playbackControllerSource, /contentNode\.style\.setProperty\("width",/);
  assert.doesNotMatch(playbackControllerSource, /contentNode\.style\.setProperty\("min-width",/);
  assert.doesNotMatch(playbackControllerSource, /contentNode\.style\.setProperty\("min-height",/);
  assert.doesNotMatch(playbackControllerSource, /contentNode\.style\.setProperty\("--pod-onscreen-text-x",/);
  assert.doesNotMatch(playbackControllerSource, /contentNode\.style\.setProperty\("--pod-onscreen-text-y",/);
});

test("preview controller renders karaoke markup when timings exist and falls back to raw text otherwise", () => {
  assert.match(playbackControllerSource, /const karaokeWordTimings = normalizeKaraokeWordTimings\(audioClip, text\);/);
  assert.match(playbackControllerSource, /const contentHtml = karaokeWordTimings\.length[\s\S]*?buildKaraokeSubtitleMarkup\(text,\s*karaokeWordTimings,\s*activeKaraokeWordIndex\)[\s\S]*?: this\.deps\.escapeHtml\(text\);/m);
  assert.doesNotMatch(playbackControllerSource, /wrappedText \|\| previewSpec\?\.metrics\?\.wrappedText/);
});

test("preview controller forces bubble width from on-screen text track settings when not dragging", () => {
  assert.match(playbackControllerSource, /resolveTrackManagedOnScreenTextLayout\(rowLayout, settings, rowId\)/);
  assert.match(
    playbackControllerSource,
    /const hasLiveOverlayInteraction = \[dragState, resizeState\]\.some\(\(item\) => String\(item\?\.rowId \|\| ""\)\.trim\(\) === String\(selected\.rowId \|\| ""\)\.trim\(\)\);[\s\S]*?const rowLayout = hasLiveOverlayInteraction\s*\? liveLayout\s*:\s*this\.resolveTrackManagedOnScreenTextLayout\(liveLayout, settings, selected\.rowId\);/m
  );
});
