import test from "node:test";
import assert from "node:assert/strict";

// Mock global window objects needed for runtime bindings
globalThis.window = {
  location: {
    origin: "http://localhost:8787"
  }
};

// Mock HTML5 Audio class for Node.js test environment
globalThis.Audio = class {
  constructor() {
    this.src = "";
    this.dataset = {};
    this.paused = true;
    this.volume = 1.0;
    this.playbackRate = 1.0;
    this.defaultPlaybackRate = 1.0;
    this.preload = "";
    this.readyState = 4; // HAVE_ENOUGH_DATA
    this.duration = 2.5;
    this.currentTime = 0;
    this.listeners = {};
  }
  addEventListener(event, cb, options) {
    this.listeners[event] = cb;
  }
  removeEventListener(event, cb) {
    if (this.listeners[event] === cb) {
      delete this.listeners[event];
    }
  }
  load() {}
  async play() {
    this.paused = false;
  }
  pause() {
    this.paused = true;
  }
};

await import("../public/podcaster/podcaster-timeline-model.js");
const { normalizePodcastVideoConfig } = window;

await import("../public/podcaster/podcaster-text-render.js");
const { PodcasterPlaybackController } = await import("../public/podcaster/podcaster-playback-controller.js");

test("normalizePodcastVideoConfig parses and defaults mediaLoadMode correctly", () => {
  // 1. Defaults to "streaming" when not provided
  const config1 = normalizePodcastVideoConfig({});
  assert.equal(config1.mediaLoadMode, "streaming");

  // 2. Preserves valid values
  const config2 = normalizePodcastVideoConfig({ mediaLoadMode: "blob" });
  assert.equal(config2.mediaLoadMode, "blob");

  const config3 = normalizePodcastVideoConfig({ mediaLoadMode: "auto" });
  assert.equal(config3.mediaLoadMode, "auto");

  const config4 = normalizePodcastVideoConfig({ mediaLoadMode: "STREAMING " });
  assert.equal(config4.mediaLoadMode, "streaming");

  // 3. Fallbacks to "streaming" on invalid values
  const config5 = normalizePodcastVideoConfig({ mediaLoadMode: "invalid-mode" });
  assert.equal(config5.mediaLoadMode, "streaming");
});

test("PodcasterPlaybackController.resolveActiveMediaLoadMode behaves correctly", () => {
  const controller = new PodcasterPlaybackController();
  controller.state.config = { mediaLoadMode: "streaming" };
  
  // Streaming mode always yields streaming
  assert.equal(controller.resolveActiveMediaLoadMode("scene.mp4"), "streaming");
  assert.equal(controller.resolveActiveMediaLoadMode("audio.mp3"), "streaming");

  // Blob mode always yields blob
  controller.state.config = { mediaLoadMode: "blob" };
  assert.equal(controller.resolveActiveMediaLoadMode("scene.mp4"), "blob");
  assert.equal(controller.resolveActiveMediaLoadMode("audio.mp3"), "blob");

  // Auto mode differentiates based on file extension
  controller.state.config = { mediaLoadMode: "auto" };
  assert.equal(controller.resolveActiveMediaLoadMode("scene.mp4"), "streaming");
  assert.equal(controller.resolveActiveMediaLoadMode("scene.webm"), "streaming");
  assert.equal(controller.resolveActiveMediaLoadMode("audio.mp3"), "blob");
  assert.equal(controller.resolveActiveMediaLoadMode("audio.wav"), "blob");
});

test("PodcasterPlaybackController.getBlobUrlSync returns correct streaming proxy URL", () => {
  const controller = new PodcasterPlaybackController();
  controller.state.config = { mediaLoadMode: "streaming" };

  const fbUrl = "https://firebasestorage.googleapis.com/v0/b/bucket/o/video.mp4?alt=media";
  const proxyUrl = controller.getBlobUrlSync(fbUrl);

  // Direct Firebase URLs are wrapped in same-origin proxy in streaming mode
  assert.match(proxyUrl, /^\/api\/assets\/proxy-media\?url=/);
  assert.equal(proxyUrl, `/api/assets/proxy-media?url=${encodeURIComponent(fbUrl)}`);

  // Subsequent calls return the cached proxy URL
  assert.equal(controller.getBlobUrlSync(fbUrl), proxyUrl);
});

test("PodcasterPlaybackController prefers the remote proxy-media base when available", () => {
  const controller = new PodcasterPlaybackController();
  controller.state.config = { mediaLoadMode: "streaming" };
  controller.deps = {
    buildApiUrlPreferRemote: (path) => `https://example.test${path}`
  };

  const fbUrl = "https://firebasestorage.googleapis.com/v0/b/bucket/o/video.mp4?alt=media";
  assert.equal(
    controller.getBlobUrlSync(fbUrl),
    `https://example.test/api/assets/proxy-media?url=${encodeURIComponent(fbUrl)}`
  );
});

test("PodcasterPlaybackController.getBlobUrl resolves gs:// and proxies correctly in streaming mode", async () => {
  const controller = new PodcasterPlaybackController();
  controller.state.config = { mediaLoadMode: "streaming" };
  
  // Mock dependencies
  controller.deps = {
    resolveFirebaseStorageUrl: async (gsUrl) => {
      assert.equal(gsUrl, "gs://bucket/o/video.mp4");
      return "https://firebasestorage.googleapis.com/v0/b/bucket/o/video.mp4?alt=media";
    }
  };

  const gsUrl = "gs://bucket/o/video.mp4";
  const resolvedUrl = await controller.getBlobUrl(gsUrl);

  // It should resolve gs:// -> Firebase https URL -> wrapped proxy URL
  assert.equal(resolvedUrl, `/api/assets/proxy-media?url=${encodeURIComponent("https://firebasestorage.googleapis.com/v0/b/bucket/o/video.mp4?alt=media")}`);

  // It should cache the resolved URL so synchronous calls now work
  assert.equal(controller.getBlobUrlSync(gsUrl), resolvedUrl);
});

test("PodcasterPlaybackController prewarms dialogue URLs successfully", () => {
  const controller = new PodcasterPlaybackController();
  controller.state.config = { mediaLoadMode: "streaming" };

  controller.deps = {
    resolveDialogueAudioForRow: (session, rowId) => ({
      downloadUrl: `https://firebasestorage.googleapis.com/v0/b/bucket/o/audio-${rowId}.mp3?alt=media`,
      storagePath: `podcaster/audio-${rowId}.mp3`
    }),
    resolveStorageAudioUrl: (downloadUrl) => downloadUrl
  };

  const session = {
    script: {
      rows: [{ id: "row-1" }, { id: "row-2" }]
    }
  };

  controller.prewarmDialogueAudios(session);

  // Check that the cache now contains the resolved urls synchronously
  const url1 = "https://firebasestorage.googleapis.com/v0/b/bucket/o/audio-row-1.mp3?alt=media";
  const url2 = "https://firebasestorage.googleapis.com/v0/b/bucket/o/audio-row-2.mp3?alt=media";
  
  assert.equal(controller.getBlobUrlSync(url1), `/api/assets/proxy-media?url=${encodeURIComponent(url1)}`);
  assert.equal(controller.getBlobUrlSync(url2), `/api/assets/proxy-media?url=${encodeURIComponent(url2)}`);
});

test("PodcasterPlaybackController preloads upcoming dialogue player without deleting it", async () => {
  const controller = new PodcasterPlaybackController();
  controller.state.config = { mediaLoadMode: "streaming" };

  const resolvedUrls = {};
  controller.deps = {
    resolveDialogueAudioForRow: (session, rowId) => ({
      downloadUrl: `https://firebasestorage.googleapis.com/v0/b/bucket/o/${rowId}.mp3`,
      storagePath: `${rowId}.mp3`
    }),
    resolveStorageAudioUrl: (downloadUrl) => downloadUrl,
    buildTimelineRuntimeEntries: () => [
      { rowId: "row-1", startMs: 0, effectiveDurationMs: 4000 },
      { rowId: "row-2", startMs: 4000, effectiveDurationMs: 4000 }
    ],
    getPodcastVideoConfig: () => ({
      geminiDialogueTrack: {
        enabled: true,
        segments: [
          { rowId: "row-1", startMs: 0, durationMs: 4000, trimInMs: 0, trimOutMs: 4000 },
          { rowId: "row-2", startMs: 4000, durationMs: 4000, trimInMs: 0, trimOutMs: 4000 }
        ]
      }
    }),
    resolveDialogueAudioPlaybackRate: () => 1.0,
    resolveTimelineClipMix: () => ({ voiceVolume: 1.0 }),
    getPlaybackSpeed: () => 1.0,
    syncBackgroundMusic: async () => {}
  };

  // Prewarm all URLs first
  const session = {
    script: {
      rows: [{ id: "row-1" }, { id: "row-2" }]
    }
  };
  controller.sync(session, controller.state.config);

  // Tick at currentMs = 0 (row-1 is active, row-2 is upcoming because startMs=4000, difference is 4000ms < 5000ms)
  await controller.syncAudio(0, 1.0);

  // Both row-1 and row-2 players should be instantiated
  assert.ok(controller.dialoguePlayers["row-1"], "active row player should exist");
  assert.ok(controller.dialoguePlayers["row-2"], "preloaded upcoming row player should exist");

  // Upcoming player should have preload set to auto and dataset.initialized is false
  assert.equal(controller.dialoguePlayers["row-2"].preload, "auto");
  assert.equal(controller.dialoguePlayers["row-2"].dataset.initialized, "false");
});
