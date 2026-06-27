const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");

const {
  normalizeMontageRenderMode,
  shouldUseBrowserMontageRenderer,
  getMontageBrowserRendererAvailability,
  buildMontageBrowserRenderBootstrap,
  preflightMontageBrowserRenderer
} = require("./montage-browser-render.js");

test("normalizeMontageRenderMode defaults invalid values to browser", () => {
  assert.equal(normalizeMontageRenderMode("browser"), "browser");
  assert.equal(normalizeMontageRenderMode("ffmpeg-legacy"), "browser");
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

test("getMontageBrowserRendererAvailability reports a stable availability shape", () => {
  const availability = getMontageBrowserRendererAvailability();
  assert.equal(typeof availability, "object");
  assert.equal(typeof availability.available, "boolean");
  assert.equal(typeof availability.playwrightModuleAvailable, "boolean");
  assert.equal(typeof availability.playwrightChromiumExecutablePresent, "boolean");
  if (availability.available) {
    assert.ok(availability.playwright?.chromium);
    assert.equal(availability.playwrightModuleAvailable, true);
    assert.equal(availability.playwrightChromiumExecutablePresent, true);
  } else {
    assert.ok(String(availability.code || "").trim());
    assert.ok(String(availability.message || "").trim());
  }
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
  assert.match(html, /podcaster\.css/);
  assert.match(html, /podcaster-render\.js/);
  assert.match(html, /podcaster-text-render\.js/);
});

test("preflightMontageBrowserRenderer validates the browser runtime before scene rendering", async () => {
  assert.equal(typeof preflightMontageBrowserRenderer, "function");
  const availability = getMontageBrowserRendererAvailability();
  if (availability.available !== true) return;

  await preflightMontageBrowserRenderer({
    publicRoot: path.resolve(__dirname, "..", "public"),
    payload: {
      sessionId: "session-1",
      renderMode: "browser",
      exportMode: "normal",
      preflightOnly: true,
      overlayCards: [],
      onScreenTextTimeline: null,
      brandOverlay: null
    },
    bootstrapHtmlPath: path.join(os.tmpdir(), `podcaster-browser-preflight-${Date.now()}.html`),
    viewport: { width: 640, height: 360 },
    timeoutMs: 15000
  });
});
