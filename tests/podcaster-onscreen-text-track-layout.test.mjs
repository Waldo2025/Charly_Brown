import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const podcasterSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const montageExportSource = readFileSync(new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../public/podcaster.css", import.meta.url), "utf8");
const onScreenTextSource = readFileSync(new URL("../public/podcaster/podcaster-on-screen-text.js", import.meta.url), "utf8");
const textRenderSource = readFileSync(new URL("../public/podcaster/podcaster-text-render.js", import.meta.url), "utf8");
const editorSource = readFileSync(new URL("../public/podcaster/podcaster-on-screen-text-track-editor.js", import.meta.url), "utf8");
const playbackControllerSource = readFileSync(new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url), "utf8");
const backendSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

test("on-screen text drag commits a shared track anchor across layouts", () => {
  assert.match(editorSource, /function syncAnchorAcrossLayouts\(session = null, options = \{\}\)/);
  assert.match(
    editorSource,
    /endOverlayDrag\(event = null\)[\s\S]*?syncAnchorAcrossLayouts\(session,\s*\{[\s\S]*?overlayXPct:\s*nextX \+ \(safeWidthPct \/ 2\),[\s\S]*?overlayYPct:\s*nextY \+ safeHeightPct[\s\S]*?\}\);/m
  );
});

test("on-screen text width setting recomputes all layouts from the shared anchor", () => {
  assert.match(
    editorSource,
    /function syncWidthAcrossLayouts\(session = null\)[\s\S]*?return syncAnchorAcrossLayouts\(activeSession,\s*\{[\s\S]*?widthPct:\s*nextWidthPct,[\s\S]*?recomputeHeight:\s*true[\s\S]*?\}\);/m
  );
  assert.match(
    editorSource,
    /if \(key === "boxWidthPct"\) \{[\s\S]*?syncWidthAcrossLayouts\(session\);[\s\S]*?session = getActiveSession\(\);[\s\S]*?\}/m
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

test("karaoke export preserves the scaled background box and alignment from the shared on-screen text spec", () => {
  assert.match(onScreenTextSource, /const bgScale = clampNumber\(settings\.bgScale, 0\.6, 1\.8, 1\);/);
  assert.match(onScreenTextSource, /scaledBoxWidthPx/);
  assert.match(onScreenTextSource, /scaledBoxXPx/);
  assert.match(backendSource, /podcaster-text-render\.js/);
  assert.match(backendSource, /buildMontageOnScreenTextKaraokeBoxFilters/);
  assert.match(textRenderSource, /drawbox=x=\$\{safeX\}:y=\$\{safeY\}:w=\$\{safeWidth\}:h=\$\{safeHeight\}:color=\$\{boxColor\}:t=fill:enable='/);
  assert.match(backendSource, /const karaokeEnabled = input\.partyKaraoke !== false && wordTimings\.length > 0 && String\(spec\.wrappedText \|\| ""\)\.trim\(\);/);
  assert.match(backendSource, /return buildMontageOnScreenTextDrawFilters\(\{/);
  assert.doesNotMatch(backendSource, /function generateKaraokeOverlayText\(wrappedText = "", activeWordIndex = -1\)/);
  assert.doesNotMatch(backendSource, /subtitles='[^']*montage-onscreen-karaoke\.ass/);
});

test("montage export preview syncs karaoke overlay from the preview video element", () => {
  assert.match(
    podcasterSource,
    /function syncMontageExportPreviewOverlayFromMedia\(mediaEl = null\)[\s\S]*?controller\.syncOverlay\(currentMs,\s*\{[\s\S]*?forceRow: Boolean\(previewRowId\)[\s\S]*?\}\);/m
  );
  assert.match(
    podcasterSource,
    /mediaEl\.addEventListener\("timeupdate", sync\);[\s\S]*?mediaEl\.addEventListener\("ended", sync\);/m
  );
});

test("montage export preview falls back to scene index when row id is missing", () => {
  assert.match(
    montageExportSource,
    /const cleanSceneIndex = Math\.max\(0,[\s\S]*?if \(!cleanRowId && cleanSceneIndex <= 0\) return;/m
  );
  assert.ok(montageExportSource.includes("previewSceneIndex"));
  assert.ok(montageExportSource.includes("resolveMontageRenderEntryAtTime"));
  assert.ok(montageExportSource.includes("getMontageExportPreviewMediaTargets"));
  assert.ok(montageExportSource.includes("window.montageExportBusy && hasReadyPreview"));
  assert.ok(montageExportSource.includes("montageExportPreviewVideoAlt"));
  assert.ok(montageExportSource.includes("requestMontageExportCancel"));
  assert.ok(montageExportSource.includes("/api/podcaster/montage/export-cancel"));
});

test("playback controller does not re-hardcode bubble width and position outside the shared spec", () => {
  assert.doesNotMatch(playbackControllerSource, /contentNode\.style\.setProperty\("width",/);
  assert.doesNotMatch(playbackControllerSource, /contentNode\.style\.setProperty\("min-width",/);
  assert.doesNotMatch(playbackControllerSource, /contentNode\.style\.setProperty\("--pod-onscreen-text-x",/);
  assert.doesNotMatch(playbackControllerSource, /contentNode\.style\.setProperty\("--pod-onscreen-text-y",/);
});

test("preview controller renders karaoke markup when timings exist and falls back to raw text otherwise", () => {
  assert.match(playbackControllerSource, /const karaokeTokenOffset = Math\.max\(0, Number\([\s\S]*?getPodcasterSceneKaraokeTokenOffset\?\.\(row\)[\s\S]*?\) \|\| 0\);/m);
  assert.match(playbackControllerSource, /const karaokeWordTimings = normalizeKaraokeWordTimings\(audioClip, text, \{[\s\S]*?tokenOffset: karaokeTokenOffset[\s\S]*?\}\);/m);
  assert.match(playbackControllerSource, /const contentHtml = karaokeWordTimings\.length[\s\S]*?buildKaraokeSubtitleMarkup\(text,\s*karaokeWordTimings,\s*activeKaraokeWordIndex,\s*settings\)[\s\S]*?: this\.deps\.escapeHtml\(text\);/m);
  assert.doesNotMatch(playbackControllerSource, /wrappedText \|\| previewSpec\?\.metrics\?\.wrappedText/);
});

test("preview controller forces bubble width from on-screen text track settings when not dragging", () => {
  assert.match(playbackControllerSource, /resolveTrackManagedOnScreenTextLayout\(rowLayout, settings, rowId\)/);
  assert.match(
    playbackControllerSource,
    /const hasLiveOverlayInteraction = \[dragState, resizeState\]\.some\(\(item\) => String\(item\?\.rowId \|\| ""\)\.trim\(\) === String\(selected\.rowId \|\| ""\)\.trim\(\)\);[\s\S]*?const rowLayout = hasLiveOverlayInteraction\s*\? liveLayout\s*:\s*this\.resolveTrackManagedOnScreenTextLayout\(liveLayout, settings, selected\.rowId\);/m
  );
});
