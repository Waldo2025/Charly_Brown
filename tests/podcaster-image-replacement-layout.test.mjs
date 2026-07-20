import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const replacement = readFileSync(new URL("../public/podcaster/podcaster-media-replacement.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/podcaster.css", import.meta.url), "utf8");
const podcasterHtml = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");
const videoPlayerHtml = readFileSync(new URL("../public/video-player.html", import.meta.url), "utf8");
const backend = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
const renderSpec = readFileSync(new URL("../public/podcaster/podcaster-scene-media-render-spec.js", import.meta.url), "utf8");
const playbackController = readFileSync(new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url), "utf8");
const homePlayer = readFileSync(new URL("../public/js/home.js", import.meta.url), "utf8");

test("image replacement persists a stable source and resets geometry for the new image", () => {
  assert.match(replacement, /resolveStableReplacementMediaUrl/);
  assert.match(replacement, /\^\(\?:blob\|data\):/);
  assert.match(replacement, /mediaScale:\s*1,[\s\S]*?mediaOffsetXPct:\s*0,[\s\S]*?mediaOffsetYPct:\s*0,[\s\S]*?visualLayoutMode:\s*"default"/m);
  assert.match(replacement, /includeAudio:\s*false/);
  assert.doesNotMatch(replacement, /else if \(typeof playbackController\?\.invalidateRowAudioCache/);
});

test("Render rejects browser-only blob URLs before treating them as local files", () => {
  assert.match(backend, /if \(\/\^blob:\/i\.test\(cleanUrl\)\)/);
  assert.match(backend, /browser_blob_url_not_persistable/);
});

test("Render returns width-fitted vertical image motion to the top anchor", () => {
  assert.match(backend, /const topAlignedImageMotion = spec\.fitMode === "width"/);
  assert.match(backend, /const returnToAnchorExpr = `\(4\*\(\$\{progressExpr\}\)\*\(1-\(\$\{progressExpr\}\)\)\)`/);
  assert.match(backend, /topAlignedImageMotion[\s\S]*?baseTop\.toFixed\(3\)[\s\S]*?returnToAnchorExpr/m);
});

test("shared Ken Burns pan effects finish at the top-aligned base frame", () => {
  for (const effect of ["left", "right", "up", "down"]) {
    const match = css.match(new RegExp(`@keyframes ken-burns-pan-${effect} \\{([\\s\\S]*?)\\n\\}`));
    assert.ok(match, `missing ${effect} keyframes`);
    assert.match(match[1], /to \{ transform: scale\(1\) translate[XY]\(0\); \}/);
  }
  assert.match(css, /transform-origin:\s*top center/);
  assert.doesNotMatch(podcasterHtml, /@keyframes ken-burns-pan-left/);
  assert.doesNotMatch(videoPlayerHtml, /scale:\s*var\(--pod-scene-media-scale/);
});

test("vertical image motion traverses the complete overflow in preview, player and Render", () => {
  assert.match(renderSpec, /startOffsetYPx = frameRect\.y - topPx/);
  assert.match(renderSpec, /endOffsetYPx = \(frameRect\.y - overflowY\) - topPx/);
  assert.match(css, /var\(--pod-scene-media-motion-start-y, 0px\)/);
  assert.match(css, /var\(--pod-scene-media-motion-end-y, 0px\)/);
  assert.match(playbackController, /--pod-scene-media-motion-start-y/);
  assert.match(playbackController, /--pod-scene-media-motion-end-y/);
  assert.match(backend, /spec\.motion\.startOffsetYPx/);
  assert.match(backend, /spec\.motion\.endOffsetYPx/);
});

test("scene motion runs once for the effective trimmed duration and holds its final frame", () => {
  assert.doesNotMatch(css, /pod-scene-media-pan-(?:left-right|right-left|up-down|down-up)[^;]*infinite\s+alternate/);
  assert.match(css, /var\(--pod-scene-media-motion-duration, 12s\) ease-in-out 1 both/);
  assert.match(playbackController, /entry\?\.effectiveDurationMs/);
  assert.match(playbackController, /entry\?\.clip\?\.trimOutMs/);
  assert.match(playbackController, /entry\?\.clip\?\.trimInMs/);
  assert.doesNotMatch(playbackController, /const targetDelay = offsetSec/);
  assert.match(homePlayer, /durationSec:\s*safeMotionDurationSec/);
  assert.match(homePlayer, /--pod-scene-media-motion-duration/);
});
