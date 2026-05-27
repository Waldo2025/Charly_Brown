import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const htmlSource = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../public/podcaster.css", import.meta.url), "utf8");
const podcasterSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const sessionRailSource = readFileSync(new URL("../public/podcaster/podcaster-session-rail.js", import.meta.url), "utf8");
const fullscreenSource = readFileSync(new URL("../public/podcaster/podcaster-fullscreen.js", import.meta.url), "utf8");

test("studio sidepanel shell keeps the edge-tab contract", () => {
  assert.match(htmlSource, /<aside id="podcasterSidepanel" class="sidepanel" aria-label="Panel lateral de guión">/);
  assert.match(htmlSource, /id="openSidepanelBtn" class="panel-icon-btn sidepanel-edge-tab"/);
  const openButtonIndex = htmlSource.indexOf('id="openSidepanelBtn"');
  const sidepanelIndex = htmlSource.indexOf('<aside id="podcasterSidepanel"');
  assert.ok(openButtonIndex > -1 && sidepanelIndex > -1 && openButtonIndex < sidepanelIndex);
  assert.match(cssSource, /\.sidepanel-toggle-btn\s*\{\s*display:\s*none;\s*\}/);
  assert.match(podcasterSource, /els\.sidepanel\.classList\.toggle\("is-open", !!isOpen\);/);
  assert.match(podcasterSource, /els\.podcasterLayout\?\.classList\.toggle\("has-sidepanel", !!isOpen\);/);
});

test("session rail module owns rail filters, archive toggle, and card actions", () => {
  assert.match(sessionRailSource, /function bindEvents\(\) \{/);
  assert.match(sessionRailSource, /els\.sessionsRailFilter\.addEventListener\("click"/);
  assert.match(sessionRailSource, /els\.toggleArchivedSessionsBtn\.addEventListener\("click"/);
  assert.match(sessionRailSource, /els\.sessionList\.addEventListener\("click", async \(event\) => \{/);
  assert.match(sessionRailSource, /els\.sessionList\.addEventListener\("keydown"/);
  assert.match(sessionRailSource, /dataset\.sessionRailBound !== "true"/);
  assert.match(sessionRailSource, /shareSessionWithUser\(sessionId\);/);
  assert.match(sessionRailSource, /return \{[\s\S]*render: renderSessions,[\s\S]*bindEvents,[\s\S]*\};/m);
  assert.match(podcasterSource, /bindEvents: bindSessionRailEvents/);
  assert.match(podcasterSource, /shareSessionWithUser\s*\n\}\);/);
  assert.match(podcasterSource, /bindSessionRailEvents\(\);/);
  assert.doesNotMatch(podcasterSource, /els\.sessionList\.addEventListener\("click"/);
  assert.doesNotMatch(podcasterSource, /els\.sessionsRailFilter\?\.addEventListener\("click"/);
});

test("preview fullscreen uses the shared controller on visual containers", () => {
  assert.match(fullscreenSource, /function mountControls\(\) \{/);
  assert.match(fullscreenSource, /function restoreControls\(\) \{/);
  assert.match(fullscreenSource, /document\.addEventListener\("fullscreenchange", onFullscreenChange\);/);
  assert.match(fullscreenSource, /targetEl\.classList\.add\(fallbackClass\);/);
  assert.match(podcasterSource, /createPodcasterStageFullscreenController\(\{[\s\S]*?targetEl: podcastPreviewStageEl,[\s\S]*?buttonEl: els\.podcastPreviewFullscreenBtn[\s\S]*?\}\);/);
  assert.match(podcasterSource, /const montageExportPreviewStageEl = document\.getElementById\("montageExportPreviewContainer"\);/);
  assert.match(podcasterSource, /createPodcasterStageFullscreenController\(\{[\s\S]*?targetEl: montageExportPreviewStageEl,[\s\S]*?buttonEl: els\.montageExportFullscreenBtn[\s\S]*?\}\);/);
});

test("playback stop guards timeline stage sync when no session is active", () => {
  assert.match(podcasterSource, /const session = getActiveSession\(\);[\s\S]*?else if \(session\) \{[\s\S]*?setPodcastVideoSpeaker\(session, "", \{ speaking: false \}\);[\s\S]*?\}/);
  assert.match(podcasterSource, /const session = getActiveSession\(\);[\s\S]*?if \(session\) \{[\s\S]*?setPodcastVideoRow\("", \{ syncStage: true, preserveMontageCursor: true \}\);[\s\S]*?setPodcastVideoSpeaker\(session, "", \{ speaking: false \}\);[\s\S]*?\}/);
});
