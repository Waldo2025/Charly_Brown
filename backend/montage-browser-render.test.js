const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  normalizeMontageRenderMode,
  shouldUseBrowserMontageRenderer,
  buildMontageBrowserRenderBootstrap
} = require("./montage-browser-render.js");

test("normalizeMontageRenderMode defaults invalid values to browser", () => {
  assert.equal(normalizeMontageRenderMode("browser"), "browser");
  assert.equal(normalizeMontageRenderMode("ffmpeg-legacy"), "ffmpeg-legacy");
  assert.equal(normalizeMontageRenderMode("invalid"), "browser");
});

test("shouldUseBrowserMontageRenderer enables browser mode only for normal video exports", () => {
  assert.equal(shouldUseBrowserMontageRenderer({
    renderMode: "browser",
    exportMode: "normal",
    onlyAudio: false
  }), true);

  assert.equal(shouldUseBrowserMontageRenderer({
    renderMode: "browser",
    exportMode: "review",
    onlyAudio: false
  }), false);

  assert.equal(shouldUseBrowserMontageRenderer({
    renderMode: "browser",
    exportMode: "normal",
    onlyAudio: true
  }), false);
});

test("buildMontageBrowserRenderBootstrap embeds local render runtime config", () => {
  const publicRoot = path.resolve(__dirname, "..", "public");
  const html = buildMontageBrowserRenderBootstrap({
    publicRoot,
    payload: {
      sessionId: "session-1",
      renderMode: "browser",
      overlayCards: [],
      onScreenTextTimeline: null
    },
    baseVideoPath: "/tmp/base-video.mp4",
    viewport: { width: 1280, height: 720 }
  });

  assert.match(html, /__PODCASTER_MONTAGE_RENDER_CONFIG__/);
  assert.match(html, /file:\/\/\/tmp\/base-video\.mp4/);
  assert.match(html, /podcaster-render\.js/);
  assert.match(html, /podcaster-text-render\.js/);
});
