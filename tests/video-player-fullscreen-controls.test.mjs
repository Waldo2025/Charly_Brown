import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/video-player.html", import.meta.url), "utf8");
const fullscreenController = readFileSync(new URL("../public/podcaster/podcaster-fullscreen.js", import.meta.url), "utf8");

test("video-player fullscreen reparents controls into the native fullscreen element", () => {
  assert.match(html, /createPodcasterStageFullscreenController|id="playerStageFullscreenBtn"/);
  assert.match(fullscreenController, /controlsHost\.appendChild\(controlsEl\);/);
  assert.match(fullscreenController, /controlsEl\.classList\.add\("is-attached-to-stage-fullscreen"\);/);
});

test("video-player fullscreen controls override the non-interactive shared host", () => {
  assert.match(html, /#playerStage \.podcast-stage-fullscreen-controls-host\s*\{[\s\S]*?z-index:\s*80\s*!important;[\s\S]*?pointer-events:\s*none;/);
  assert.match(html, /#playerControls\.is-attached-to-stage-fullscreen\s*\{[\s\S]*?position:\s*relative\s*!important;[\s\S]*?pointer-events:\s*auto\s*!important;/);
  assert.match(html, /#playerControls\.is-attached-to-stage-fullscreen :is\(button, input, select, a\)\s*\{[\s\S]*?pointer-events:\s*auto;/);
  assert.match(html, /\.podcast-stage-fullscreen-btn\s*\{\s*z-index:\s*90\s*!important;/);
});
