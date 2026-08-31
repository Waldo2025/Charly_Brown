import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const htmlSource = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../public/podcaster.css", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

const portraitDockStart = htmlSource.indexOf('<div class="podcast-studio-footer snoopy-portrait-dock">');
const transportStart = htmlSource.indexOf('<div class="podcast-video-transport snoopy-transport-grid"');
const transportEnd = htmlSource.indexOf('<input id="speakerReferenceImageInput"', transportStart);
const transportHtml = htmlSource.slice(transportStart, transportEnd);

const canonicalMarker = "Canonical Snoopy shell:";
const canonicalStart = cssSource.lastIndexOf(canonicalMarker);
const canonicalEnd = cssSource.indexOf("/* Reference media uses", canonicalStart);
const canonicalCss = cssSource.slice(canonicalStart, canonicalEnd);

test("Snoopy transport preserves the six direct functional groups in visual order", () => {
  assert.ok(transportStart >= 0 && transportEnd > transportStart, "Debe existir el footer del transporte.");
  assert.ok(portraitDockStart >= 0 && portraitDockStart < transportStart, "Retratos debe quedar antes del transporte.");

  const selectors = [
    "is-left is-tools",
    "podcast-timeline-footer-zoom is-zoom",
    "is-playback",
    "is-view-controls",
    "podcast-timeline-footer-summary is-summary",
    "is-output"
  ];

  let previousIndex = -1;
  for (const selector of selectors) {
    const index = transportHtml.indexOf(selector);
    assert.ok(index > previousIndex, `El grupo ${selector} debe conservar su posición y ser hijo directo.`);
    previousIndex = index;
  }

  assert.doesNotMatch(transportHtml, /is-primary|podcast-video-transport-group is-middle/);

  const controlIds = [
    "importGeminiDialogueTrackBtn",
    "reorderTimelineTracksBtn",
    "autoLinkStorageVideosBtn",
    "podcastTimelineZoomOutRange",
    "podcastVideoPrevBtn",
    "podcastVideoPlayBtn",
    "podcastVideoPauseBtn",
    "podcastVideoStopBtn",
    "podcastVideoNextBtn",
    "podcastVideoSpeedSelect",
    "podcastVideoZoomBtn",
    "podcastTimelineNormalModeBtn",
    "podcastTimelineTracksModeBtn",
    "exportMontageBtn",
    "saveSessionFloatingBtn"
  ];

  for (const id of controlIds) {
    assert.equal(transportHtml.match(new RegExp(`id="${id}"`, "g"))?.length, 1, `Debe conservarse #${id}.`);
  }

  assert.match(transportHtml, /id="reorderTimelineTracksBtn"[\s\S]*?aria-keyshortcuts="Meta\+Shift\+O Control\+Shift\+O"/);
  assert.match(transportHtml, /id="podcastVideoSpeedSelect" aria-label="Velocidad de reproducción"/);
});

test("Snoopy shell reserves the bottom row for a non-shrinking transport", () => {
  assert.ok(canonicalStart >= 0 && canonicalEnd > canonicalStart, "Debe existir el grid canónico del transporte.");
  assert.match(canonicalCss, /grid-template-areas:\s*"editor-header"\s*"editor-workspace"\s*"editor-portraits"\s*"editor-transport";/);
  assert.match(canonicalCss, /grid-template-rows:\s*max-content minmax\(0, 1fr\) auto max-content;/);
  assert.match(canonicalCss, /height:\s*100dvh !important;/);
  assert.match(canonicalCss, /overflow:\s*hidden !important;/);
  assert.match(canonicalCss, /flex-shrink:\s*0 !important;/);
  assert.doesNotMatch(canonicalCss, /position:\s*fixed|bottom:\s*calc\([^;]*100px/);
});

test("portrait dock is rendered only for podcast-with-video mode", () => {
  assert.match(
    appSource,
    /const shouldShowPortraitDock = isVideoPodcastMode\(activeSession\) && !isCurrentModeVideo\(activeSession\);[\s\S]*?footer\.hidden = !shouldShowPortraitDock;[\s\S]*?if \(!shouldShowPortraitDock\) \{/
  );
  assert.match(canonicalCss, /\.snoopy-portrait-dock\[hidden\]\s*\{\s*display:\s*none !important;/);
  assert.doesNotMatch(appSource, /footer\.style\.display\s*=\s*"none"/);
});

test("Snoopy transport declares one-row desktop and balanced two-row intermediate grids", () => {
  assert.match(canonicalCss, /grid-template-areas:\s*"tools zoom playback view summary output";/);
  assert.match(canonicalCss, /@container snoopy-editor \(max-width: 1320px\) and \(min-width: 769px\)/);
  assert.match(
    canonicalCss,
    /grid-template-areas:\s*"tools tools tools zoom zoom zoom"\s*"playback playback playback view summary output";/
  );
  assert.match(canonicalCss, /grid-template-columns:\s*repeat\(6, minmax\(0, 1fr\)\) !important;/);
  assert.match(canonicalCss, /@supports not \(container-type: inline-size\)/);
});

test("Snoopy transport stacks readable functional rows on mobile", () => {
  assert.match(canonicalCss, /@container snoopy-editor \(max-width: 768px\)/);
  assert.match(
    canonicalCss,
    /grid-template-areas:\s*"tools tools tools"\s*"zoom zoom zoom"\s*"playback playback playback"\s*"view summary output";/
  );
  assert.match(canonicalCss, /> :is\(\.is-summary, \.is-output\) \{[\s\S]*?border-inline-start: 1px solid var\(--pod-border\) !important;/);
  assert.match(canonicalCss, /> \.is-output \{[\s\S]*?justify-content: flex-end;/);
  assert.match(canonicalCss, /@container snoopy-editor \(max-width: 420px\)/);
});
