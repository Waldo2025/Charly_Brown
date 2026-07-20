import test from "node:test";
import assert from "node:assert/strict";

class MockAudioElement {
  constructor() {
    this.tagName = "AUDIO";
    this.id = "";
    this.src = "";
    this.dataset = {};
    this.listeners = new Map();
    this.paused = true;
    this.readyState = 4;
    this.duration = 30;
    this.currentTime = 0;
    this.volume = 1;
    this.playbackRate = 1;
    this.defaultPlaybackRate = 1;
    this.error = null;
  }
  addEventListener(name, listener) {
    const current = this.listeners.get(name) || [];
    current.push(listener);
    this.listeners.set(name, current);
  }
  removeEventListener(name, listener) {
    this.listeners.set(name, (this.listeners.get(name) || []).filter((item) => item !== listener));
  }
  dispatch(name) {
    (this.listeners.get(name) || []).slice().forEach((listener) => listener({ type: name, target: this }));
  }
  setAttribute() {}
  removeAttribute(name) {
    if (name === "src") this.src = "";
  }
  load() {}
  async play() {
    this.paused = false;
    this.dispatch("playing");
  }
  pause() {
    this.paused = true;
  }
}

const audioElements = new Map();
globalThis.HTMLAudioElement = MockAudioElement;
globalThis.HTMLMediaElement = {
  HAVE_CURRENT_DATA: 2,
  HAVE_FUTURE_DATA: 3
};
globalThis.Audio = MockAudioElement;
globalThis.document = {
  getElementById: (id) => audioElements.get(id) || null,
  body: {
    appendChild: (element) => {
      audioElements.set(element.id, element);
    }
  }
};
globalThis.window = {
  location: { origin: "http://localhost:8787" },
  setTimeout,
  AudioContext: null,
  webkitAudioContext: null
};
globalThis.caches = {
  open: async () => ({ delete: async () => true })
};

await import("../public/podcaster/podcaster-text-render.js");
const { PodcasterPlaybackController } = await import("../public/podcaster/podcaster-playback-controller.js");

function createAudioNode() {
  return {
    connect() {},
    disconnect() {}
  };
}

test("background source changes reuse one MediaElementSource node", async () => {
  const controller = new PodcasterPlaybackController();
  let activeSource = "https://example.test/music-a.mp3";
  let createMediaElementSourceCalls = 0;
  controller.audioCtx = {
    currentTime: 0,
    destination: createAudioNode(),
    createMediaElementSource: () => {
      createMediaElementSourceCalls += 1;
      if (createMediaElementSourceCalls > 1) throw new Error("HTMLMediaElement already connected");
      return createAudioNode();
    },
    createGain: () => ({
      ...createAudioNode(),
      gain: { setTargetAtTime() {} }
    })
  };
  controller.state.session = { id: "session-a" };
  controller.state.config = { masterVolume: 100 };
  controller.deps = {
    getActiveSession: () => controller.state.session,
    getPanelMontageMusicConfig: () => ({
      sourceType: "track",
      sourceUrl: activeSource,
      sourceItems: [{
        sourceUrl: activeSource,
        startOffsetMs: 0,
        endOffsetMs: 10_000,
        trimInMs: 0,
        trimOutMs: 10_000,
        loop: true,
        volume: 50
      }],
      loopEnabled: true,
      volume: 50
    }),
    getPodcastVideoConfig: () => controller.state.config,
    resolveTimelineClipMix: () => null,
    buildTimelineRuntimeEntries: () => [],
    getPlaybackSpeed: () => 1
  };
  controller.resolveAudioSource = async (clip) => String(clip?.sourceUrl || "");
  controller.getBlobUrlSync = (source) => source;

  await controller.syncBackgroundMusic(1000, 1, false);
  assert.equal(createMediaElementSourceCalls, 1);
  const originalSourceNode = controller.backgroundSource;

  activeSource = "https://example.test/music-b.mp3";
  await controller.syncBackgroundMusic(1000, 1, false);

  assert.equal(createMediaElementSourceCalls, 1);
  assert.equal(controller.backgroundSource, originalSourceNode);
  assert.equal(controller.backgroundSourceKey, activeSource);
});

test("stop and replay preserve the MediaElementSource association", async () => {
  const controller = new PodcasterPlaybackController();
  let createMediaElementSourceCalls = 0;
  controller.audioCtx = {
    currentTime: 0,
    destination: createAudioNode(),
    createMediaElementSource: () => {
      createMediaElementSourceCalls += 1;
      if (createMediaElementSourceCalls > 1) throw new Error("HTMLMediaElement already connected");
      return createAudioNode();
    },
    createGain: () => ({
      ...createAudioNode(),
      gain: { setTargetAtTime() {} }
    })
  };
  const audio = controller.getOrCreateBackgroundAudioElement();
  controller.ensureBackgroundChain(false, false);
  const sourceNode = controller.backgroundSource;

  controller.stopBackgroundMusic();
  assert.equal(controller.backgroundAudio, audio);
  assert.equal(controller.backgroundSource, sourceNode);

  controller.ensureBackgroundChain(false, false);
  assert.equal(createMediaElementSourceCalls, 1);
  assert.equal(controller.backgroundSource, sourceNode);
});

test("a background media error clears the poisoned source and retries without reload", async () => {
  const controller = new PodcasterPlaybackController();
  const audio = controller.getOrCreateBackgroundAudioElement();
  audio.src = "https://proxy.test/audio.mp3";
  audio.dataset.originalSrc = audio.src;
  audio.dataset.sourceKey = "storage:music.mp3";
  audio.error = { code: 2 };
  audio.readyState = 0;
  controller.backgroundAudio = audio;
  controller.backgroundSrc = "https://proxy.test/audio.mp3";
  controller.backgroundResolvedSource = "blob:stale-audio";
  controller.backgroundSourceKey = "storage:music.mp3";
  controller.state.currentMs = 2500;
  controller.state.isPlaying = true;
  controller.deps = { getPlaybackSpeed: () => 1 };
  const invalidated = [];
  let retries = 0;
  controller.invalidateBlobUrl = async (source) => invalidated.push(source);
  controller.syncBackgroundMusic = async () => {
    retries += 1;
  };

  audio.dispatch("error");
  await new Promise((resolve) => setTimeout(resolve, 260));

  assert.deepEqual(invalidated.sort(), ["blob:stale-audio", "https://proxy.test/audio.mp3"].sort());
  assert.equal(controller.backgroundSourceKey, "");
  assert.equal(audio.src, "");
  assert.equal(retries, 1);
});

test("background recovery stops after four failed attempts for one source", () => {
  const controller = new PodcasterPlaybackController();
  const audio = controller.getOrCreateBackgroundAudioElement();
  controller.backgroundAudio = audio;
  controller.backgroundSourceKey = "storage:music.mp3";
  controller.backgroundRecoverySourceKey = "storage:music.mp3";
  controller.backgroundRecoveryAttempts = 4;

  assert.equal(controller.scheduleBackgroundAudioRecovery("media-error"), false);
  assert.equal(controller.backgroundRecoveryTimer, null);
  assert.equal(controller.backgroundRecoveryAttempts, 4);
});

test("visual scene replacement never evicts row audio unless explicitly requested", () => {
  const controller = new PodcasterPlaybackController();
  let audioInvalidations = 0;
  controller.invalidateRowAudioCache = () => {
    audioInvalidations += 1;
  };

  controller.invalidateRowMediaCache("row-1", { dialogueVideoMap: {} });
  assert.equal(audioInvalidations, 0);

  controller.invalidateRowMediaCache("row-1", { dialogueVideoMap: {} }, { includeAudio: true });
  assert.equal(audioInvalidations, 1);
});

test("scene motion duration uses effective trim length while progress stays timeline-local", () => {
  const controller = new PodcasterPlaybackController();
  let applied = null;
  controller.deps = {
    applySceneMediaScaleToStage: (params) => {
      applied = params;
    }
  };
  controller.state.currentMs = 7000;
  controller.applySceneMediaScale({
    rowId: "scene-trimmed",
    startMs: 5000,
    endMs: 11000,
    effectiveDurationMs: 6000,
    durationMs: 10000,
    clip: {
      trimInMs: 4000,
      trimOutMs: 10000,
      mediaMotionPreset: "pan-up-down"
    }
  });

  assert.equal(applied.durationSec, 6);
  assert.equal(applied.motionOffsetSec, 2);
});
