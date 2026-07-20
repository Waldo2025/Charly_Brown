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
const { createPodcasterPanelMusicApi } = await import("../public/podcaster/podcaster-panel-music.js");

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

test("normalizePodcastVideoConfig preserves modern automatic video routing", () => {
  const automatic = normalizePodcastVideoConfig({
    videoRoutingVersion: 2,
    videoGenerator: "auto",
    videoModel: "auto"
  });
  assert.equal(automatic.videoGenerator, "auto");
  assert.equal(automatic.videoModel, "auto");

  const explicitOmni = normalizePodcastVideoConfig({
    videoRoutingVersion: 2,
    videoGenerator: "omni",
    videoModel: "auto"
  });
  assert.equal(explicitOmni.videoGenerator, "omni");
  assert.equal(explicitOmni.videoModel, "gemini-omni-flash-preview");
});

test("normalizePodcastVideoConfig migrates legacy Veo 2.0 to Veo 3.1 Standard", () => {
  const migrated = normalizePodcastVideoConfig({
    videoModel: "veo-2.0-generate-001"
  });

  assert.equal(migrated.videoModel, "veo-3.1-generate-preview");
  assert.equal(migrated.videoGenerator, "veo");
  assert.equal(migrated.videoRoutingVersion, 2);
  assert.equal(migrated.cheapVideoMode, false);
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

test("persistent video hydration does not reuse an in-flight streaming resolver", async () => {
  const controller = new PodcasterPlaybackController();
  controller.state.config = { mediaLoadMode: "streaming" };
  const gsUrl = "gs://bucket/podcaster/sessions/s1/videos/replaced.mp4";
  const directUrl = "https://firebasestorage.googleapis.com/v0/b/bucket/o/podcaster%2Fsessions%2Fs1%2Fvideos%2Freplaced.mp4?alt=media&token=test";
  const originalFetch = globalThis.fetch;
  let releaseStorageUrl;
  let fetchCount = 0;
  const storageUrlReady = new Promise((resolve) => {
    releaseStorageUrl = () => resolve(directUrl);
  });

  controller.deps = {
    resolveFirebaseStorageUrl: async () => storageUrlReady
  };
  globalThis.fetch = async (url) => {
    assert.equal(url, directUrl);
    fetchCount += 1;
    return new Response(new Blob(["video-bytes"], { type: "video/mp4" }), { status: 200 });
  };

  try {
    const streamingPromise = controller.getBlobUrl(gsUrl);
    const persistentPromise = controller.getBlobUrl(gsUrl, { persistent: true });
    releaseStorageUrl();

    const [streamingUrl, persistentUrl] = await Promise.all([streamingPromise, persistentPromise]);
    assert.equal(streamingUrl, directUrl);
    assert.match(persistentUrl, /^blob:/);
    assert.equal(fetchCount, 1);
    assert.equal(controller.getBlobUrlSync(gsUrl), persistentUrl);
  } finally {
    globalThis.fetch = originalFetch;
  }
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

test("PodcasterPlaybackController falls back to Firebase Storage when local audio cache key is empty", async () => {
  const controller = new PodcasterPlaybackController();
  const remoteUrl = "https://example.test/api/assets/proxy-media?storagePath=podcaster%2Fsessions%2Fs1%2Faudio%2Frow-1.wav";
  const resolvedBlobUrl = "blob:remote-audio";
  let requestedUrl = "";

  controller.resolveLocalMediaObjectUrl = async () => "";
  controller.getBlobUrl = async (url, options = {}) => {
    requestedUrl = String(url || "");
    assert.equal(options.persistent, true);
    return resolvedBlobUrl;
  };
  controller.deps = {
    resolveStorageAudioUrl: (downloadUrl, storagePath) => {
      assert.equal(downloadUrl, "https://firebasestorage.googleapis.com/v0/b/bucket/o/row-1.wav?alt=media");
      assert.equal(storagePath, "podcaster/sessions/s1/audio/row-1.wav");
      return remoteUrl;
    }
  };

  const source = await controller.resolveAudioSource({
    localMediaCacheKey: "row-1-local-missing",
    localDataUrl: "podcaster-local-media:row-1-local-missing",
    downloadUrl: "https://firebasestorage.googleapis.com/v0/b/bucket/o/row-1.wav?alt=media",
    storagePath: "podcaster/sessions/s1/audio/row-1.wav"
  });

  assert.equal(source, resolvedBlobUrl);
  assert.equal(requestedUrl, remoteUrl);
  assert.equal(
    controller.resolveAudioSourceKey({
      localMediaCacheKey: "row-1-local-missing",
      downloadUrl: "https://firebasestorage.googleapis.com/v0/b/bucket/o/row-1.wav?alt=media",
      storagePath: "podcaster/sessions/s1/audio/row-1.wav"
    }),
    remoteUrl
  );
});

test("PodcasterPlaybackController treats proxy-media 404 as a failed hydration, not a playable src", async () => {
  const controller = new PodcasterPlaybackController();
  controller.state.config = { mediaLoadMode: "blob" };
  const originalFetch = globalThis.fetch;
  const sourceUrl = "http://127.0.0.1:5010/api/assets/proxy-media?storagePath=podcaster%2Fsessions%2Fs1%2Fvideos%2Fmissing.mp4";
  let staleMarked = false;

  globalThis.fetch = async () => ({
    ok: false,
    status: 404,
    clone() {
      return this;
    },
    async blob() {
      return new Blob([]);
    }
  });
  controller.deps = {
    markStaleProxyMediaUrl: (url, reason) => {
      assert.equal(url, sourceUrl);
      assert.equal(reason, "proxy-media-404-from-controller");
      staleMarked = true;
    }
  };

  try {
    const resolved = await controller.getBlobUrl(sourceUrl, { persistent: true });
    assert.equal(resolved, "");
    assert.equal(controller.getBlobUrlSync(sourceUrl), "");
    assert.equal(staleMarked, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Panel music source prefers Firebase Storage over stale local cache pointers", () => {
  const api = createPodcasterPanelMusicApi({
    resolveStorageAudioUrl: (downloadUrl, storagePath) => (
      downloadUrl || storagePath
        ? `https://example.test/api/assets/proxy-media?storagePath=${encodeURIComponent(storagePath)}`
        : ""
    )
  });

  api.setPanelMusicTrack("uploaded", {
    localDataUrl: "podcaster-local-media:missing-background-track",
    localMediaCacheKey: "missing-background-track",
    downloadUrl: "https://firebasestorage.googleapis.com/v0/b/bucket/o/music.mp3?alt=media",
    storagePath: "podcaster/sessions/s1/music/background.mp3",
    durationSec: 30
  }, { select: true });

  assert.equal(
    api.resolvePanelMusicTrackSrc(),
    "https://example.test/api/assets/proxy-media?storagePath=podcaster%2Fsessions%2Fs1%2Fmusic%2Fbackground.mp3"
  );
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
