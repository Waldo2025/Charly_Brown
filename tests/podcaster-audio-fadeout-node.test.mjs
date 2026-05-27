import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panelMusicSource = readFileSync(new URL("../public/podcaster/podcaster-panel-music.js", import.meta.url), "utf8");
const timelineUiSource = readFileSync(new URL("../public/podcaster/podcaster-timeline-ui.js", import.meta.url), "utf8");
const timelineInteractionSource = readFileSync(new URL("../public/podcaster/podcaster-timeline-interaction.js", import.meta.url), "utf8");
const playbackControllerSource = readFileSync(new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../public/podcaster.css", import.meta.url), "utf8");

test("panel music loop settings persist fadeInMs and fadeOutMs", () => {
  assert.match(panelMusicSource, /fadeInMs: Math\.max\(0, Math\.min\(trimOutMs - trimInMs, Math\.round\(Number\(item\.fadeInMs \|\| 0\) \|\| 0\)\)\)/m);
  assert.match(panelMusicSource, /fadeInMs: Math\.max\(0, Math\.min\(visibleDurationMs, Number\(loopSetting\?\.fadeInMs \|\| 0\) \|\| 0\)\)/m);
  assert.match(panelMusicSource, /fadeInMs: Math\.max\(0, Number\(item\?\.fadeInMs \|\| 0\) \|\| 0\)/m);
  assert.match(panelMusicSource, /fadeOutMs: Math\.max\(0, Math\.min\(trimOutMs - trimInMs, Math\.round\(Number\(item\.fadeOutMs \|\| 0\) \|\| 0\)\)\)/m);
  assert.match(panelMusicSource, /fadeOutMs: Math\.max\(0, Math\.min\(visibleDurationMs, Number\(loopSetting\?\.fadeOutMs \|\| 0\) \|\| 0\)\)/m);
  assert.match(panelMusicSource, /fadeOutMs: Math\.max\(0, Number\(item\?\.fadeOutMs \|\| 0\) \|\| 0\)/m);
});

test("timeline audio chips render draggable fadein and fadeout nodes", () => {
  assert.match(timelineUiSource, /data-action="timeline-audio-fadein-handle"/m);
  assert.match(timelineUiSource, /--audio-fadein-width:\$\{fadeInWidthPx\.toFixed\(3\)\}px;--audio-fadein-node-left:\$\{fadeInNodeLeftPx\.toFixed\(3\)\}px/m);
  assert.match(timelineUiSource, /data-action="timeline-audio-fadeout-handle"/m);
  assert.match(timelineUiSource, /--audio-fadeout-width:\$\{fadeOutWidthPx\.toFixed\(3\)\}px;--audio-fadeout-node-left:\$\{fadeOutNodeLeftPx\.toFixed\(3\)\}px/m);
  assert.match(cssSource, /\.podcast-audio-fadein-handle/m);
  assert.match(cssSource, /\.podcast-audio-timeline-chip\.has-fadein::before/m);
  assert.match(cssSource, /\.podcast-audio-fadeout-handle/m);
  assert.match(cssSource, /\.podcast-audio-timeline-chip\.has-fadeout::after/m);
});

test("audio fade nodes start their own drag modes and preserve trim behavior", () => {
  const fadeInIndex = timelineInteractionSource.indexOf("const audioFadeinHandle = event.target.closest(\"[data-action='timeline-audio-fadein-handle']\");");
  const fadeOutIndex = timelineInteractionSource.indexOf("const audioFadeoutHandle = event.target.closest(\"[data-action='timeline-audio-fadeout-handle']\");");
  const chipMoveIndex = timelineInteractionSource.indexOf("const audioChip = event.target.closest(\".podcast-audio-timeline-chip.has-audio:not(.podcast-gemini-audio-chip)\");");
  assert.ok(fadeInIndex >= 0, "timeline interaction must detect fade in handle");
  assert.ok(fadeOutIndex >= 0, "timeline interaction must detect fade out handle");
  assert.ok(chipMoveIndex >= 0, "timeline interaction must keep generic audio chip move drag");
  assert.ok(fadeInIndex < chipMoveIndex, "fade in handle must be checked before generic audio chip move");
  assert.ok(fadeOutIndex < chipMoveIndex, "fade out handle must be checked before generic audio chip move");
  assert.match(timelineInteractionSource, /beginAudioTrimDrag\("audio-fadein", event\);/m);
  assert.match(timelineInteractionSource, /beginAudioTrimDrag\("audio-fadeout", event\);/m);
  assert.match(timelineInteractionSource, /drag\.mode === "audio-trim-start" \|\| drag\.mode === "audio-trim-end" \|\| drag\.mode === "audio-fadein" \|\| drag\.mode === "audio-fadeout"/m);
  assert.match(timelineInteractionSource, /dragMode === "audio-fadein"[\s\S]*?dragMode === "audio-fadeout"[\s\S]*?dragMode === "audio-move"[\s\S]*?flushSessionLocalPersistNow\("", "background-music"\)\.catch\(\(\) => \{ \}\);/m);
});

test("background music playback applies fadein and fadeout within the active segment", () => {
  assert.match(playbackControllerSource, /const fadeInMs = Math\.max\(0, Number\(activeSegment\.fadeInMs \|\| 0\)\);/m);
  assert.match(playbackControllerSource, /const fadeInFactor = fadeInMs > 0 && segmentDurationMs > 0[\s\S]*?elapsedMs < fadeInMs[\s\S]*?elapsedMs \/ fadeInMs[\s\S]*?: 1\.0;/m);
  assert.match(playbackControllerSource, /const fadeOutMs = Math\.max\(0, Number\(activeSegment\.fadeOutMs \|\| 0\)\);/m);
  assert.match(playbackControllerSource, /const fadeOutFactor = fadeOutMs > 0 && segmentDurationMs > 0[\s\S]*?remainingMs <= fadeOutMs[\s\S]*?remainingMs \/ fadeOutMs[\s\S]*?: 1\.0;/m);
});
