import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

globalThis.window ??= {};
window.location ??= {
  origin: "https://example.test",
  href: "https://example.test/podcaster.html",
};

globalThis.HTMLMediaElement ??= {
  HAVE_NOTHING: 0,
  HAVE_METADATA: 1,
  HAVE_CURRENT_DATA: 2,
  HAVE_FUTURE_DATA: 3,
  HAVE_ENOUGH_DATA: 4,
};

globalThis.requestAnimationFrame ??= (callback) => setTimeout(
  () => callback(globalThis.performance.now()),
  16,
);
globalThis.cancelAnimationFrame ??= (id) => clearTimeout(id);

const [{ PodcasterPlaybackController }, { resolveSceneSourceStateAtTimelineMs }] = await Promise.all([
  import("../public/podcaster/podcaster-playback-controller.js"),
  import("../public/podcaster/podcaster-scene-timing.js"),
]);

class FakeClassList {
  constructor(initial = []) {
    this.values = new Set(initial);
  }

  add(...names) {
    names.forEach((name) => this.values.add(name));
  }

  remove(...names) {
    names.forEach((name) => this.values.delete(name));
  }

  contains(name) {
    return this.values.has(name);
  }

  toggle(name, force) {
    if (force === true) {
      this.values.add(name);
      return true;
    }
    if (force === false) {
      this.values.delete(name);
      return false;
    }
    if (this.values.has(name)) {
      this.values.delete(name);
      return false;
    }
    this.values.add(name);
    return true;
  }
}

function createFakeStyle() {
  return {
    setProperty(name, value) {
      this[name] = String(value);
    },
    removeProperty(name) {
      delete this[name];
    },
    getPropertyValue(name) {
      return this[name] ?? "";
    },
  };
}

class FakeVideo {
  constructor({ src = "", duration = 8, currentTime = 0, readyState = 4, autoReady = true } = {}) {
    this.tagName = "VIDEO";
    this.dataset = src ? { src } : {};
    this.style = createFakeStyle();
    this.classList = new FakeClassList();
    this.hidden = false;
    this.duration = duration;
    this.readyState = readyState;
    this.autoReady = autoReady;
    this.paused = true;
    this.ended = false;
    this.seeking = false;
    this.muted = true;
    this.volume = 0;
    this.playbackRate = 1;
    this.defaultPlaybackRate = 1;
    this.preload = "auto";
    this.videoWidth = 1920;
    this.videoHeight = 1080;
    this.loadCount = 0;
    this.playCount = 0;
    this.pauseCount = 0;
    this.seekHistory = [];
    this.assignedSources = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this._src = "";
    this._currentTime = currentTime;
    if (src) this.src = src;
  }

  get src() {
    return this._src;
  }

  set src(value) {
    this._src = String(value || "");
    this.assignedSources.push(this._src);
  }

  get currentTime() {
    return this._currentTime;
  }

  set currentTime(value) {
    this._currentTime = Number(value);
    this.seekHistory.push(this._currentTime);
  }

  getAttribute(name) {
    if (name === "src") return this._src || null;
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name, value) {
    if (name === "src") {
      this.src = value;
      return;
    }
    this.attributes.set(name, String(value));
  }

  removeAttribute(name) {
    if (name === "src") {
      this._src = "";
      return;
    }
    this.attributes.delete(name);
  }

  addEventListener(type, handler, options = {}) {
    const listeners = this.listeners.get(type) || [];
    listeners.push({ handler, once: options?.once === true });
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, handler) {
    const listeners = this.listeners.get(type) || [];
    this.listeners.set(type, listeners.filter((item) => item.handler !== handler));
  }

  dispatch(type, event = {}) {
    const listeners = [...(this.listeners.get(type) || [])];
    listeners.forEach((item) => {
      item.handler({ type, target: this, ...event });
      if (item.once) this.removeEventListener(type, item.handler);
    });
  }

  load() {
    this.loadCount += 1;
    if (!this.autoReady) return;
    this.readyState = HTMLMediaElement.HAVE_ENOUGH_DATA;
    this.dispatch("loadedmetadata");
    this.dispatch("loadeddata");
    this.dispatch("canplay");
  }

  play() {
    this.playCount += 1;
    this.paused = false;
    return Promise.resolve();
  }

  pause() {
    this.pauseCount += 1;
    this.paused = true;
  }

  closest() {
    return null;
  }
}

class FakeImage {
  constructor({ src = "", complete = true, naturalWidth = 1280, naturalHeight = 720, alternate = false } = {}) {
    this.tagName = "IMG";
    this.dataset = {};
    this.style = createFakeStyle();
    this.classList = new FakeClassList(alternate ? ["podcast-active-speaker-image-alt"] : []);
    this.className = alternate
      ? "podcast-active-speaker-image podcast-active-speaker-image-alt"
      : "podcast-active-speaker-image";
    this.id = alternate ? "podcastActiveSpeakerImageAlt" : "podcastActiveSpeakerImage";
    this.hidden = false;
    this.complete = complete;
    this.naturalWidth = naturalWidth;
    this.naturalHeight = naturalHeight;
    this.listeners = new Map();
    this.assignedSources = [];
    this._src = "";
    if (src) this.src = src;
  }

  get src() { return this._src; }
  set src(value) {
    this._src = String(value || "");
    this.assignedSources.push(this._src);
  }

  getAttribute(name) {
    if (name === "src") return this._src || null;
    return null;
  }

  removeAttribute(name) {
    if (name === "src") this._src = "";
  }

  addEventListener(type, handler) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(handler);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, handler) {
    const listeners = this.listeners.get(type) || [];
    this.listeners.set(type, listeners.filter((candidate) => candidate !== handler));
  }

  get offsetWidth() { return this.naturalWidth; }
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createSceneEntry({
  rowId = "scene-a",
  videoSrc = `https://cdn.example.test/${rowId}.mp4`,
  startMs = 0,
  endMs = 20_000,
  sourceDurationMs = 8_000,
} = {}) {
  return {
    rowId,
    startMs,
    endMs,
    durationMs: endMs - startMs,
    videoSrc,
    sourceDurationMs,
    clip: {
      rowId,
      trimInMs: 0,
      trimOutMs: sourceDurationMs,
      sourceDurationMs,
      durationMs: endMs - startMs,
    },
  };
}

function createStageController({
  activeVideo,
  inactiveVideo = new FakeVideo({ readyState: 0 }),
  resolveSourceState,
} = {}) {
  const playbackState = {
    montageActive: true,
    stageVideoSlot: 0,
  };
  const controller = new PodcasterPlaybackController();
  controller.els = {
    podcastActiveSpeakerVideo: activeVideo,
    podcastActiveSpeakerVideoAlt: inactiveVideo,
  };
  controller.state.isPlaying = true;
  controller.state.session = {};
  controller.state.audioTrack = { segments: [] };
  controller.deps = {
    podcastVideoState: playbackState,
    resolveSceneSourceStateAtTimelineMs: resolveSourceState,
    getPlaybackSpeed: () => 1,
    getPodcastVideoConfig: () => ({}),
    resolveTimelineClipMix: () => ({ videoVolume: 0 }),
    setActiveStageVideoSlot: (slot) => {
      playbackState.stageVideoSlot = Number(slot) === 1 ? 1 : 0;
    },
  };
  return { controller, playbackState, activeVideo, inactiveVideo };
}

test("an 8-second source never wraps back to zero at its end", async () => {
  const src = "https://cdn.example.test/scene-a.mp4";
  const activeVideo = new FakeVideo({ src, duration: 8, currentTime: 7.75 });
  const { controller } = createStageController({
    activeVideo,
    resolveSourceState: () => ({
      sourceMs: 8_000,
      playbackRate: 1,
      isHoldActive: true,
    }),
  });
  const entry = createSceneEntry({ videoSrc: src, endMs: 8_000 });
  activeVideo.dataset.entryKey = controller.buildStageEntryIdentity(entry);
  activeVideo.dataset.rowId = entry.rowId;

  await controller.syncStageSwitching(entry, 8_000);

  assert.ok(
    activeVideo.currentTime > 7.5,
    `expected the final frame, got ${activeVideo.currentTime}s`,
  );
  assert.equal(
    activeVideo.seekHistory.some((value) => Math.abs(value) < 0.1),
    false,
    `unexpected wrap seeks: ${activeVideo.seekHistory.join(", ")}`,
  );
});

test("manual timeline extension freezes the final frame instead of looping the source", async () => {
  const entry = createSceneEntry({ endMs: 20_000, sourceDurationMs: 8_000 });
  const activeVideo = new FakeVideo({
    src: entry.videoSrc,
    duration: 8,
    currentTime: 7.7,
  });
  const { controller } = createStageController({
    activeVideo,
    resolveSourceState: resolveSceneSourceStateAtTimelineMs,
  });
  activeVideo.dataset.entryKey = controller.buildStageEntryIdentity(entry);
  activeVideo.dataset.rowId = entry.rowId;

  await controller.syncStageSwitching(entry, 16_000);

  assert.ok(
    activeVideo.currentTime > 7.5,
    `expected the held final frame, got ${activeVideo.currentTime}s`,
  );
  assert.equal(activeVideo.paused, true, "the held video must remain paused");
  assert.equal(
    activeVideo.seekHistory.some((value) => Math.abs(value) < 0.1),
    false,
    `unexpected wrap seeks: ${activeVideo.seekHistory.join(", ")}`,
  );
});

test("scene switches load the inactive A/B slot before making it visible", async () => {
  const activeVideo = new FakeVideo({
    src: "https://cdn.example.test/scene-a.mp4",
    duration: 8,
    currentTime: 7.8,
  });
  activeVideo.style.opacity = "1";
  activeVideo.style.visibility = "visible";
  const inactiveVideo = new FakeVideo({ readyState: 0 });
  inactiveVideo.hidden = true;
  inactiveVideo.style.opacity = "0";
  const { controller, playbackState } = createStageController({
    activeVideo,
    inactiveVideo,
    resolveSourceState: () => ({ sourceMs: 0, playbackRate: 1, isHoldActive: false }),
  });
  const nextEntry = createSceneEntry({
    rowId: "scene-b",
    videoSrc: "https://cdn.example.test/scene-b.mp4",
    startMs: 8_000,
    endMs: 16_000,
  });
  const loadCalls = [];
  const incomingReady = createDeferred();
  controller.setStageVideoSourceForElement = (video, src, options = {}) => {
    loadCalls.push({ video, src, options });
    return incomingReady.promise.then(() => {
      video.dataset.src = src;
      video.dataset.entryKey = options.entryKey;
      video.dataset.mediaSourceGeneration = String(controller.getMediaSourceGeneration(src));
      video.src = src;
      video.readyState = HTMLMediaElement.HAVE_ENOUGH_DATA;
      return true;
    });
  };

  const switchPromise = controller.syncStageSwitching(nextEntry, 8_000);
  await Promise.resolve();

  assert.equal(loadCalls.length, 1);
  assert.equal(loadCalls[0].video, inactiveVideo, "the visible slot must not be reloaded");
  assert.equal(loadCalls[0].options.keepHidden, true, "the incoming slot stays hidden while loading");
  assert.equal(activeVideo.hidden, false, "the outgoing frame remains visible during hydration");
  assert.equal(activeVideo.style.opacity, "1");

  incomingReady.resolve();
  await switchPromise;

  assert.equal(playbackState.stageVideoSlot, 1, "the ready inactive slot becomes active");
  assert.equal(controller.getActiveStageVideoEl(), inactiveVideo);
  assert.equal(inactiveVideo.hidden, false);
  assert.notEqual(inactiveVideo.style.opacity, "0");
  assert.equal(activeVideo.paused, true);
});

test("consecutive scenes that share a source still cut to the next scene trim", async () => {
  const sharedSrc = "https://cdn.example.test/shared.mp4";
  const firstEntry = createSceneEntry({
    rowId: "scene-a",
    videoSrc: sharedSrc,
    startMs: 0,
    endMs: 8_000,
  });
  const secondEntry = createSceneEntry({
    rowId: "scene-b",
    videoSrc: sharedSrc,
    startMs: 8_000,
    endMs: 16_000,
  });
  const activeVideo = new FakeVideo({ src: sharedSrc, duration: 8, currentTime: 7.8 });
  const inactiveVideo = new FakeVideo({ src: sharedSrc, duration: 8, currentTime: 5 });
  const { controller, playbackState } = createStageController({
    activeVideo,
    inactiveVideo,
    resolveSourceState: () => ({ sourceMs: 0, playbackRate: 1, isHoldActive: false }),
  });
  activeVideo.dataset.entryKey = controller.buildStageEntryIdentity(firstEntry);
  activeVideo.dataset.rowId = firstEntry.rowId;
  inactiveVideo.dataset.entryKey = controller.buildStageEntryIdentity(firstEntry);
  inactiveVideo.dataset.rowId = firstEntry.rowId;
  controller.waitForStageVideoFrameReady = async () => true;

  await controller.syncStageSwitching(secondEntry, secondEntry.startMs);

  assert.equal(playbackState.stageVideoSlot, 1);
  assert.equal(inactiveVideo.dataset.entryKey, controller.buildStageEntryIdentity(secondEntry));
  assert.ok(inactiveVideo.currentTime < 0.1, `expected the second scene trim, got ${inactiveVideo.currentTime}`);
  assert.equal(activeVideo.currentTime, 7.8, "the outgoing surface is never rewound");
});

test("an image remains visible until the incoming video has a composited frame", async () => {
  const activeVideo = new FakeVideo({ src: "https://cdn.example.test/old.mp4" });
  const inactiveVideo = new FakeVideo({ readyState: 0 });
  const image = {
    id: "podcastActiveSpeakerImage",
    hidden: false,
    style: createFakeStyle(),
    classList: new FakeClassList(["podcast-active-speaker-image", "is-visible"]),
    className: "podcast-active-speaker-image is-visible",
    dataset: {},
  };
  image.style.opacity = "1";
  image.style.visibility = "visible";
  const { controller } = createStageController({
    activeVideo,
    inactiveVideo,
    resolveSourceState: () => ({ sourceMs: 0, playbackRate: 1, isHoldActive: false }),
  });
  controller.els.podcastActiveSpeakerImage = image;
  const incoming = createDeferred();
  controller.setStageVideoSourceForElement = async (video, src, options) => {
    await incoming.promise;
    video.dataset.src = src;
    video.dataset.entryKey = options.entryKey;
    video.readyState = HTMLMediaElement.HAVE_ENOUGH_DATA;
    return true;
  };
  controller.waitForStageVideoFrameReady = async () => true;
  const entry = createSceneEntry({ rowId: "scene-video" });

  const swap = controller.syncStageSwitching(entry, 0);
  await Promise.resolve();
  assert.equal(image.hidden, false);
  assert.equal(image.style.opacity, "1");

  incoming.resolve();
  await swap;
  assert.equal(image.hidden, true);
  assert.equal(inactiveVideo.hidden, false);
});

test("the current scene swaps before its released slot is reused for lookahead", async () => {
  const entries = [
    createSceneEntry({ rowId: "a", videoSrc: "A.mp4", startMs: 0, endMs: 8_000 }),
    createSceneEntry({ rowId: "b", videoSrc: "B.mp4", startMs: 8_000, endMs: 16_000 }),
    createSceneEntry({ rowId: "c", videoSrc: "C.mp4", startMs: 16_000, endMs: 24_000 }),
  ];
  const activeVideo = new FakeVideo({ src: "A.mp4" });
  const inactiveVideo = new FakeVideo({ src: "B.mp4" });
  const { controller } = createStageController({ activeVideo, inactiveVideo });
  controller.state.isPlaying = false;
  controller.cachedTickEntries = entries;
  controller.cachedTickEntriesTime = performance.now();
  controller.deps.buildTimelineRuntimeEntries = () => entries;
  controller.getBlobUrl = async () => "blob:ready";
  const order = [];
  controller.syncStageSwitching = async (entry) => {
    order.push(`swap:${entry.rowId}:${inactiveVideo.dataset.src}`);
  };
  controller.preloadUpcomingStageSlot = async (_entry, upcoming) => {
    order.push(`preload:${upcoming[0]?.rowId || "none"}`);
    inactiveVideo.dataset.src = upcoming[0]?.videoSrc || "";
    return true;
  };

  await controller.syncVideo(8_000);
  await Promise.resolve();

  assert.deepEqual(order, ["swap:b:B.mp4", "preload:c"]);
});

test("Play waits for preparation and a later Pause cannot be undone", async () => {
  const makeController = () => {
    const controller = new PodcasterPlaybackController();
    controller.sync = () => {};
    controller.initAudioContext = () => null;
    controller.getOrCreateBackgroundAudioElement = () => null;
    controller.preparePlaybackRange = async () => true;
    controller.prepareStageSlotsAtMs = async () => true;
    controller.syncAudio = async () => true;
    controller.prewarmTimelineStageVideos = async () => true;
    controller.startClockCount = 0;
    controller.startClock = () => { controller.startClockCount += 1; };
    controller.state.session = { id: "session-a" };
    controller.state.totalDurationMs = 20_000;
    controller.deps = {
      podcastVideoState: {},
      buildTimelineRuntimeEntries: () => [],
      getPlaybackSpeed: () => 1,
      updatePodcastVideoTransportUi: () => {},
      setPodcastVideoStatus: () => {},
    };
    return controller;
  };

  const successful = makeController();
  const successfulPreparation = createDeferred();
  successful.prepareSessionMedia = () => successfulPreparation.promise;
  const successfulPlay = successful.play(0);
  await Promise.resolve();
  assert.equal(successful.startClockCount, 0);
  successfulPreparation.resolve({ ready: true });
  assert.equal(await successfulPlay, true);
  assert.equal(successful.startClockCount, 1);

  const cancelled = makeController();
  const cancelledPreparation = createDeferred();
  cancelled.prepareSessionMedia = () => cancelledPreparation.promise;
  const cancelledPlay = cancelled.play(0);
  await Promise.resolve();
  cancelled.pause();
  cancelledPreparation.resolve({ ready: true });
  assert.equal(await cancelledPlay, false);
  assert.equal(cancelled.startClockCount, 0);
  assert.equal(cancelled.state.isPlaying, false);
});

test("an older asynchronous media resolution cannot overwrite the newest slot source", async () => {
  const controller = new PodcasterPlaybackController();
  const slot = new FakeVideo({ readyState: 0, autoReady: true });
  const older = createDeferred();
  const newer = createDeferred();
  controller.els = {};
  controller.deps = {
    getActiveSession: () => null,
    getPodcastVideoConfig: () => ({}),
  };
  controller.getBlobUrlSync = () => "";
  controller.getBlobUrl = (src) => {
    if (src.endsWith("older.mp4")) return older.promise;
    if (src.endsWith("newer.mp4")) return newer.promise;
    throw new Error(`unexpected source ${src}`);
  };

  const olderLoad = controller.setStageVideoSourceForElement(
    slot,
    "gs://podcaster/older.mp4",
    { timeoutMs: 50 },
  );
  const newerLoad = controller.setStageVideoSourceForElement(
    slot,
    "gs://podcaster/newer.mp4",
    { timeoutMs: 50 },
  );

  newer.resolve("https://cdn.example.test/newer.mp4");
  assert.equal(await newerLoad, true);
  older.resolve("https://cdn.example.test/older.mp4");
  assert.equal(await olderLoad, false, "the superseded request is rejected as stale");

  assert.equal(slot.dataset.src, "gs://podcaster/newer.mp4");
  assert.equal(slot.src, "https://cdn.example.test/newer.mp4");
  assert.equal(
    slot.assignedSources.includes("https://cdn.example.test/older.mp4"),
    false,
    "the late request must never touch the media element",
  );
});

test("invalidating a logical URL mounts fresh blob bytes in video and image surfaces", { concurrency: false }, async () => {
  const originalImage = globalThis.Image;
  class ReadyImageProbe {
    set src(value) {
      this._src = String(value || "");
      queueMicrotask(() => this.onload?.());
    }
    get src() { return this._src || ""; }
  }
  globalThis.Image = ReadyImageProbe;

  try {
    const logicalVideo = "https://cdn.example.test/shared-logical-video.mp4";
    const logicalImage = "https://cdn.example.test/shared-logical-image.png";
    const video = new FakeVideo({ src: "blob:OLD-VIDEO" });
    video.dataset.src = logicalVideo;
    video.dataset.mediaSourceGeneration = "0";
    video.dataset.objectUrl = "blob:OLD-VIDEO";
    const primaryImage = new FakeImage({ src: "blob:CURRENT-OTHER" });
    primaryImage.dataset.src = "https://cdn.example.test/other-image.png";
    primaryImage.dataset.mediaSourceGeneration = "0";
    primaryImage.style.opacity = "1";
    primaryImage.style.visibility = "visible";
    const alternateImage = new FakeImage({ src: "blob:OLD-IMAGE", alternate: true });
    alternateImage.dataset.src = logicalImage;
    alternateImage.dataset.mediaSourceGeneration = "0";
    alternateImage.hidden = true;
    alternateImage.style.opacity = "0";
    alternateImage.style.visibility = "hidden";
    const playbackState = { stageVideoSlot: 0 };
    const controller = new PodcasterPlaybackController();
    controller.state.session = { id: "same-logical-source", visualEffectsMap: {} };
    controller.els = {
      podcastActiveSpeakerVideo: video,
      podcastActiveSpeakerImage: primaryImage,
      podcastActiveSpeakerImageAlt: alternateImage,
    };
    controller.deps = {
      podcastVideoState: playbackState,
      setPodcastVideoPortraitFallback: () => {},
    };
    controller.applyEntryVisualStateToSurface = () => {};
    controller.syncStageMediaMotionPlaybackState = () => {};

    controller.blobCache.set(logicalVideo, "blob:OLD-VIDEO");
    await controller.invalidateBlobUrl(logicalVideo);
    controller.blobCache.set(logicalVideo, "blob:NEW-VIDEO");

    assert.equal(
      await controller.setStageVideoSourceForElement(video, logicalVideo, { noWait: true }),
      true,
    );
    assert.equal(video.src, "blob:NEW-VIDEO");
    assert.equal(video.dataset.src, logicalVideo);
    assert.equal(
      video.dataset.mediaSourceGeneration,
      String(controller.getMediaSourceGeneration(logicalVideo)),
    );

    controller.blobCache.set(logicalImage, "blob:OLD-IMAGE");
    controller.stageMachine.imagePreloadCache = new Map([
      ["blob:OLD-IMAGE", Promise.resolve("blob:OLD-IMAGE")],
    ]);
    await controller.invalidateBlobUrl(logicalImage);
    controller.blobCache.set(logicalImage, "blob:NEW-IMAGE");
    const imageEntry = createSceneEntry({
      rowId: "same-logical-image",
      videoSrc: logicalImage,
      startMs: 0,
      endMs: 8_000,
    });
    imageEntry.clip.type = "image";

    assert.equal(await controller.requestImageStageSwap(imageEntry, 0), true);
    assert.equal(alternateImage.src, "blob:NEW-IMAGE");
    assert.equal(alternateImage.dataset.src, logicalImage);
    assert.equal(
      alternateImage.dataset.mediaSourceGeneration,
      String(controller.getMediaSourceGeneration(logicalImage)),
    );
    assert.equal(alternateImage.style.visibility, "visible");
    assert.equal(alternateImage.hidden, false);
    assert.equal(playbackState.stageVideoSlot, 1);
    assert.equal(alternateImage.assignedSources.includes("blob:OLD-IMAGE"), true);
    assert.equal(alternateImage.assignedSources.at(-1), "blob:NEW-IMAGE");
  } finally {
    if (originalImage === undefined) delete globalThis.Image;
    else globalThis.Image = originalImage;
  }
});

test("an invalidated deferred OLD image preload is neither revealed nor relabeled as NEW", async () => {
  const logicalSource = "https://cdn.example.test/deferred-generation-image.png";
  const stalePreload = createDeferred();
  const preloadStarted = createDeferred();
  const primaryImage = new FakeImage({ src: "blob:CURRENT-IMAGE" });
  primaryImage.dataset.src = "https://cdn.example.test/current-image.png";
  primaryImage.dataset.mediaSourceGeneration = "0";
  primaryImage.style.opacity = "1";
  primaryImage.style.visibility = "visible";
  const alternateImage = new FakeImage({
    src: "blob:OLD-IMAGE",
    complete: false,
    naturalWidth: 0,
    naturalHeight: 0,
    alternate: true,
  });
  alternateImage.dataset.src = logicalSource;
  alternateImage.dataset.mediaSourceGeneration = "0";
  alternateImage.hidden = true;
  alternateImage.style.opacity = "0";
  alternateImage.style.visibility = "hidden";
  const playbackState = { stageVideoSlot: 0 };
  const controller = new PodcasterPlaybackController();
  controller.state.session = { id: "deferred-image-generation", visualEffectsMap: {} };
  controller.els = {
    podcastActiveSpeakerImage: primaryImage,
    podcastActiveSpeakerImageAlt: alternateImage,
  };
  controller.deps = { podcastVideoState: playbackState };
  controller.preloadImageSrc = async (source) => {
    assert.equal(source, logicalSource);
    preloadStarted.resolve();
    return stalePreload.promise;
  };
  controller.invalidateBlobUrl = async (source) => {
    assert.equal(source, logicalSource);
    controller.bumpMediaSourceGeneration(source);
    return true;
  };
  let imageAssignments = 0;
  controller.ensureStageImageReady = async () => {
    imageAssignments += 1;
    return "blob:OLD-IMAGE";
  };
  controller.syncStageMediaMotionPlaybackState = () => {};
  controller.applyEntryVisualStateToSurface = () => {};
  const entry = createSceneEntry({
    rowId: "deferred-image-row",
    videoSrc: logicalSource,
    startMs: 0,
    endMs: 8_000,
  });
  entry.clip.type = "image";

  const staleSwap = controller.requestImageStageSwap(entry, 0);
  await preloadStarted.promise;
  await controller.invalidateBlobUrl(logicalSource);
  const newGeneration = String(controller.getMediaSourceGeneration(logicalSource));

  stalePreload.resolve("blob:OLD-IMAGE");
  assert.equal(await staleSwap, false);
  assert.equal(imageAssignments, 0, "OLD bytes cannot even be assigned to the hidden slot");
  assert.equal(primaryImage.style.visibility, "visible");
  assert.equal(primaryImage.hidden, false);
  assert.equal(alternateImage.style.visibility, "hidden");
  assert.equal(alternateImage.style.opacity, "0");
  assert.notEqual(alternateImage.dataset.mediaSourceGeneration, newGeneration);
  assert.equal(playbackState.stageVideoSlot, 0);
});

test("getBlobUrl started during invalidation waits and cannot rehydrate old persistent bytes", { concurrency: false }, async () => {
  const originalCaches = globalThis.caches;
  const originalFetch = globalThis.fetch;
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  const logicalSource = "https://cdn.example.test/invalidation-race.mp4";
  const deletionGate = createDeferred();
  const deletionStarted = createDeferred();
  const oldBlob = new Blob(["OLD"], { type: "video/mp4" });
  const newBlob = new Blob(["NEW"], { type: "video/mp4" });
  const blobLabels = new WeakMap([[oldBlob, "OLD"], [newBlob, "NEW"]]);
  let oldPersistentBytesExist = true;
  let deleteCalls = 0;
  let cacheMatchCalls = 0;
  let oldCacheReads = 0;
  let fetchCalls = 0;
  const mediaCache = {
    async delete() {
      deleteCalls += 1;
      if (deleteCalls === 1) {
        deletionStarted.resolve();
        await deletionGate.promise;
        oldPersistentBytesExist = false;
      }
      return true;
    },
    async match() {
      cacheMatchCalls += 1;
      if (!oldPersistentBytesExist) return null;
      oldCacheReads += 1;
      return { blob: async () => oldBlob };
    },
    async put() { return true; },
  };
  globalThis.caches = { open: async () => mediaCache };
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return {
      ok: true,
      status: 200,
      blob: async () => newBlob,
    };
  };
  URL.createObjectURL = (blob) => `blob:${blobLabels.get(blob) || "UNKNOWN"}`;
  URL.revokeObjectURL = () => {};

  try {
    const controller = new PodcasterPlaybackController();
    controller.state.session = { id: "blob-invalidation-race" };
    controller.deps = {
      getPodcastVideoConfig: () => ({ mediaLoadMode: "persistent" }),
    };
    controller.blobCache.set(logicalSource, "blob:OLD");

    const invalidation = controller.invalidateBlobUrl(logicalSource);
    await deletionStarted.promise;
    let hydrationSettled = false;
    const hydration = controller.getBlobUrl(logicalSource, { persistent: true }).then((result) => {
      hydrationSettled = true;
      return result;
    });
    await Promise.resolve();

    assert.equal(hydrationSettled, false, "hydration must wait for cache deletion");
    assert.equal(cacheMatchCalls, 0);
    assert.equal(fetchCalls, 0);

    deletionGate.resolve();
    assert.equal(await invalidation, true);
    assert.equal(await hydration, "blob:NEW");
    assert.equal(oldCacheReads, 0, "the deleted OLD response cannot be restored into memory");
    assert.equal(cacheMatchCalls, 1);
    assert.equal(fetchCalls, 1);
    assert.equal(controller.blobCache.get(logicalSource), "blob:NEW");
  } finally {
    if (originalCaches === undefined) delete globalThis.caches;
    else globalThis.caches = originalCaches;
    if (originalFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  }
});

test("persistent media cache separates revisions at the same storagePath without keying volatile auth", { concurrency: false }, async () => {
  const originalIndexedDb = globalThis.indexedDB;
  const originalCaches = globalThis.caches;
  const originalFetch = globalThis.fetch;
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  const storagePath = "podcaster/library/versioned-scene.mp4";
  const sourceV1 = `/api/assets/proxy-media?storagePath=${encodeURIComponent(storagePath)}&u=1&token=old-token&expires=10`;
  const sourceV1WithRenewedAuth = `/api/assets/proxy-media?storagePath=${encodeURIComponent(storagePath)}&u=1&token=renewed-token&expires=999&X-Goog-Signature=volatile`;
  const sourceV2 = `/api/assets/proxy-media?storagePath=${encodeURIComponent(storagePath)}&u=2&token=new-token&expires=20`;
  const oldBlob = new Blob(["OLD"], { type: "video/mp4" });
  const newBlob = new Blob(["NEW"], { type: "video/mp4" });
  const blobLabels = new WeakMap([[oldBlob, "OLD"], [newBlob, "NEW"]]);
  const records = new Map();
  const indexedDbReads = [];
  let fetchCalls = 0;

  const createRequest = (runner) => {
    const request = {};
    queueMicrotask(() => {
      try {
        request.result = runner();
        request.onsuccess?.();
      } catch (error) {
        request.error = error;
        request.onerror?.();
      }
    });
    return request;
  };
  const database = {
    transaction() {
      const transaction = {
        objectStore() {
          return {
            get(key) {
              indexedDbReads.push(String(key));
              return createRequest(() => records.get(String(key)));
            },
            put(payload) {
              return createRequest(() => {
                records.set(String(payload.key), payload);
                return payload.key;
              });
            },
            delete(key) {
              return createRequest(() => records.delete(String(key)));
            },
          };
        },
      };
      return transaction;
    },
    close() {},
  };

  try {
    const controller = new PodcasterPlaybackController();
    controller.state.session = { id: "versioned-persistent-media" };
    controller.deps = {
      getPodcastVideoConfig: () => ({ mediaLoadMode: "persistent" }),
    };
    const cacheKeyV1 = controller.resolvePersistentMediaCacheKey(sourceV1);
    const cacheKeyV2 = controller.resolvePersistentMediaCacheKey(sourceV2);
    assert.notEqual(cacheKeyV1, cacheKeyV2, "u must participate in persistent media identity");
    assert.equal(
      controller.resolvePersistentMediaCacheKey(sourceV1WithRenewedAuth),
      cacheKeyV1,
      "renewed auth credentials must not fragment the persistent cache",
    );
    records.set(`stage-media:${cacheKeyV1}`, {
      key: `stage-media:${cacheKeyV1}`,
      blob: oldBlob,
    });

    globalThis.indexedDB = {
      open() {
        return createRequest(() => database);
      },
    };
    const mediaCache = {
      match: async () => null,
      put: async () => true,
      delete: async () => true,
    };
    globalThis.caches = { open: async () => mediaCache };
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return {
        ok: true,
        status: 200,
        blob: async () => newBlob,
      };
    };
    URL.createObjectURL = (blob) => `blob:${blobLabels.get(blob) || "UNKNOWN"}`;
    URL.revokeObjectURL = () => {};

    assert.equal(await controller.getBlobUrl(sourceV1, { persistent: true }), "blob:OLD");
    assert.equal(fetchCalls, 0, "the matching revision may use its IndexedDB entry");

    assert.equal(await controller.getBlobUrl(sourceV2, { persistent: true }), "blob:NEW");
    assert.equal(fetchCalls, 1, "a newer revision must fetch fresh bytes");
    assert.deepEqual(indexedDbReads, [
      `stage-media:${cacheKeyV1}`,
      `stage-media:${cacheKeyV2}`,
    ]);
    assert.equal(records.get(`stage-media:${cacheKeyV2}`)?.blob, newBlob);
  } finally {
    if (originalIndexedDb === undefined) delete globalThis.indexedDB;
    else globalThis.indexedDB = originalIndexedDb;
    if (originalCaches === undefined) delete globalThis.caches;
    else globalThis.caches = originalCaches;
    if (originalFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  }
});

test("purgeAllMediaCaches invalidates an in-flight getBlobUrl before it can cache bytes", { concurrency: false }, async () => {
  const originalCaches = globalThis.caches;
  const originalFetch = globalThis.fetch;
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  const source = "https://cdn.example.test/purge-pending.mp4";
  const fetchResponse = createDeferred();
  const fetchStarted = createDeferred();
  let objectUrlsCreated = 0;
  const mediaCache = {
    match: async () => null,
    put: async () => true,
    delete: async () => true,
  };
  globalThis.caches = {
    open: async () => mediaCache,
    delete: async () => true,
  };
  globalThis.fetch = async () => {
    fetchStarted.resolve();
    return fetchResponse.promise;
  };
  URL.createObjectURL = () => {
    objectUrlsCreated += 1;
    return "blob:SHOULD-NOT-BE-CREATED";
  };
  URL.revokeObjectURL = () => {};

  try {
    const controller = new PodcasterPlaybackController();
    controller.state.session = { id: "purge-pending-session" };
    controller.state.totalDurationMs = 8_000;
    controller.stopClock = () => {};
    controller.stopBackgroundMusic = () => {};
    controller.applySceneMediaScale = () => {};
    controller.syncStageMediaMotionPlaybackState = () => {};
    controller.syncOverlay = () => {};
    controller.syncStylizedText = () => {};
    controller.syncOverlayCards = () => {};
    controller.deps = {
      getPodcastVideoConfig: () => ({ mediaLoadMode: "persistent" }),
      setPodcastVideoStatus: () => {},
      updatePodcastVideoTransportUi: () => {},
      syncPodcastTimelinePlayhead: () => {},
    };

    const pendingHydration = controller.getBlobUrl(source, { persistent: true });
    await fetchStarted.promise;
    const generationBeforePurge = controller.mediaCacheGeneration;
    assert.equal(await controller.purgeAllMediaCaches(), true);
    assert.ok(controller.mediaCacheGeneration > generationBeforePurge);

    fetchResponse.resolve({
      ok: true,
      status: 200,
      blob: async () => new Blob(["obsolete-after-purge"], { type: "video/mp4" }),
    });
    assert.equal(await pendingHydration, "");
    assert.equal(objectUrlsCreated, 0);
    assert.equal(controller.blobCache.has(source), false);
    assert.equal(
      [...controller.fetchPromises.keys()].some((key) => String(key).includes(source)),
      false,
    );
  } finally {
    if (originalCaches === undefined) delete globalThis.caches;
    else globalThis.caches = originalCaches;
    if (originalFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  }
});

async function runInterruptedStageLoad(interruption) {
  const activeVideo = new FakeVideo({
    src: "https://cdn.example.test/current-scene.mp4",
    currentTime: 4,
  });
  activeVideo.style.opacity = "1";
  activeVideo.style.visibility = "visible";
  activeVideo.hidden = false;
  const inactiveVideo = new FakeVideo({ readyState: 0, autoReady: true });
  inactiveVideo.style.opacity = "0";
  inactiveVideo.style.visibility = "hidden";
  inactiveVideo.hidden = true;
  const resolvedSource = createDeferred();
  const loadStarted = createDeferred();
  const { controller, playbackState } = createStageController({
    activeVideo,
    inactiveVideo,
    resolveSourceState: () => ({ sourceMs: 0, playbackRate: 1, isHoldActive: false }),
  });
  const incomingEntry = createSceneEntry({
    rowId: `incoming-${interruption}`,
    videoSrc: `https://cdn.example.test/incoming-${interruption}.mp4`,
    startMs: 8_000,
    endMs: 16_000,
  });
  controller.state.currentMs = 8_000;
  controller.state.totalDurationMs = 16_000;
  controller.getBlobUrlSync = () => "";
  controller.getBlobUrl = async () => {
    loadStarted.resolve();
    return resolvedSource.promise;
  };
  controller.applySceneBackground = () => {};
  controller.applySceneMediaScale = () => {};
  controller.syncStageMediaMotionPlaybackState = () => {};
  controller.stopBackgroundMusic = () => {};
  controller.stopClock = () => {};
  controller.syncOverlay = () => {};
  controller.syncStylizedText = () => {};
  controller.syncOverlayCards = () => {};
  Object.assign(controller.deps, {
    setPodcastVideoPortraitFallback: () => {},
    setPodcastVideoStatus: () => {},
    updatePodcastVideoTransportUi: () => {},
    syncPodcastTimelinePlayhead: () => {},
  });

  const switching = controller.syncStageSwitching(incomingEntry, 8_000);
  await loadStarted.promise;
  if (interruption === "stop") {
    controller.stageMachine.preloadingSrc = incomingEntry.videoSrc;
    controller.stageMachine.preloadingKey = controller.buildStageEntryIdentity(incomingEntry);
    controller.stageMachine.preloadingPromise = Promise.resolve(false);
    await controller.stop({ keepCursor: true });
    assert.equal(controller.stageMachine.preloadingSrc, "");
    assert.equal(controller.stageMachine.preloadingKey, "");
    assert.equal(controller.stageMachine.preloadingPromise, null);
  } else {
    controller.pause();
  }

  resolvedSource.resolve(`blob:late-${interruption}-source`);
  assert.equal(await switching, false);
  assert.equal(inactiveVideo.src, "", "the interrupted load cannot assign its late source");
  assert.equal(
    inactiveVideo.assignedSources.includes(`blob:late-${interruption}-source`),
    false,
    "the interrupted source must never touch the alternate slot",
  );
  assert.notEqual(inactiveVideo.style.opacity, "1");
  assert.notEqual(inactiveVideo.style.visibility, "visible");
  assert.equal(inactiveVideo.hidden, true);
  assert.equal(playbackState.stageVideoSlot, 0, "the stale alternate slot cannot become active");
  assert.equal(controller.stageMachine.loadingSrc, "");
}

test("a stage load resolved after Stop cannot reveal its obsolete alternate slot", async () => {
  await runInterruptedStageLoad("stop");
});

test("a stage load resolved after Pause cannot reveal its obsolete alternate slot", async () => {
  await runInterruptedStageLoad("pause");
});

test("the playback clock stays monotonic when a tick is delayed", { concurrency: false }, async () => {
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
  const queuedFrames = [];
  let nextFrameId = 1;
  globalThis.requestAnimationFrame = (callback) => {
    const id = nextFrameId;
    nextFrameId += 1;
    queuedFrames.push({ id, callback });
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => {
    const index = queuedFrames.findIndex((frame) => frame.id === id);
    if (index >= 0) queuedFrames.splice(index, 1);
  };

  try {
    const delayedTick = createDeferred();
    const renderedTimes = [];
    const controller = new PodcasterPlaybackController();
    controller.state.isPlaying = true;
    controller.state.currentMs = 0;
    controller.state.totalDurationMs = 20_000;
    controller.deps = { getPlaybackSpeed: () => 1 };
    controller.tick = async (ms) => {
      renderedTimes.push(ms);
      if (renderedTimes.length === 1) await delayedTick.promise;
    };

    const baseNow = performance.now();
    controller.startClock();
    assert.equal(queuedFrames.length, 1);
    const firstFrame = queuedFrames.shift();
    const firstTickPromise = firstFrame.callback(baseNow + 16);
    delayedTick.resolve();
    await firstTickPromise;

    assert.equal(queuedFrames.length, 1);
    const secondFrame = queuedFrames.shift();
    await secondFrame.callback(baseNow + 1_016);
    controller.stopClock();

    assert.equal(renderedTimes.length, 2);
    assert.ok(renderedTimes[1] >= renderedTimes[0]);
    assert.ok(
      renderedTimes[1] - renderedTimes[0] >= 990,
      `expected elapsed wall-clock time to survive the delayed tick: ${renderedTimes.join(", ")}`,
    );
  } finally {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
  }
});

test("a delayed audio tick cannot play, seek, or sync old music after a seek", async () => {
  const session = { id: "audio-tick-seek-race" };
  const oldEntry = createSceneEntry({ rowId: "old-row", startMs: 0, endMs: 8_000 });
  const newEntry = createSceneEntry({ rowId: "new-row", startMs: 8_000, endMs: 16_000 });
  const entries = [oldEntry, newEntry];
  const oldClip = {
    downloadUrl: "https://cdn.example.test/old-dialogue.mp3",
    durationSec: 8,
  };
  const newClip = {
    downloadUrl: "https://cdn.example.test/new-dialogue.mp3",
    durationSec: 8,
  };
  const oldAudio = new FakeVideo({ duration: 8, currentTime: 1 });
  const newAudio = new FakeVideo({ duration: 8, currentTime: 0 });
  oldAudio.dataset.initialized = "true";
  newAudio.dataset.initialized = "true";

  const stalePreparation = createDeferred();
  const stalePreparationStarted = createDeferred();
  const newAudioSynced = createDeferred();
  let preparationCalls = 0;
  const musicSyncPositions = [];
  const controller = new PodcasterPlaybackController();
  controller.state.session = session;
  controller.state.currentMs = 1_000;
  controller.state.totalDurationMs = 16_000;
  controller.state.isPlaying = true;
  controller.dialoguePlayers = {
    "old-row": oldAudio,
    "new-row": newAudio,
  };
  controller.dialogueAudioSourceKeys = {
    "old-row": controller.resolveAudioSourceKey(oldClip),
    "new-row": controller.resolveAudioSourceKey(newClip),
  };
  controller.getEntryAtMs = (ms) => (Number(ms) < 8_000 ? oldEntry : newEntry);
  controller.prepareDialogueRow = (activeSession, rowId) => {
    assert.equal(activeSession, session);
    preparationCalls += 1;
    const player = rowId === "old-row" ? oldAudio : newAudio;
    if (preparationCalls === 2) {
      stalePreparationStarted.resolve();
      return stalePreparation.promise;
    }
    return Promise.resolve({ ready: true, rowId, player });
  };
  controller.syncVideo = async () => true;
  controller.syncOverlay = () => {};
  controller.syncStylizedText = () => {};
  controller.syncOverlayCards = () => {};
  controller.prewarmTimelineStageVideos = async () => true;
  controller.syncBackgroundMusic = async (currentMs) => {
    musicSyncPositions.push(currentMs);
    if (currentMs === 10_000) newAudioSynced.resolve();
  };
  controller.deps = {
    buildTimelineRuntimeEntries: () => entries,
    getPodcastVideoConfig: () => ({
      masterVolume: 100,
      geminiDialogueTrack: {
        enabled: true,
        segments: [
          { rowId: "old-row", startMs: 0, durationMs: 8_000, trimInMs: 0, trimOutMs: 8_000 },
          { rowId: "new-row", startMs: 8_000, durationMs: 8_000, trimInMs: 0, trimOutMs: 8_000 },
        ],
      },
    }),
    resolveDialogueAudioForRow: (_session, rowId) => (rowId === "old-row" ? oldClip : newClip),
    resolveDialogueAudioPlaybackRate: () => 1,
    resolveTimelineClipMix: () => ({ voiceVolume: 1, backgroundVolume: 1 }),
    getPlaybackSpeed: () => 1,
    setPodcastVideoRow: () => {},
    updatePodcastVideoTransportUi: () => {},
  };

  const oldRevision = controller.playheadRevision;
  const oldTick = controller.tick(1_000, { playheadRevision: oldRevision });
  await stalePreparationStarted.promise;

  await controller.seek(10_000, { allowConcurrentTick: false });
  assert.equal(controller.playheadRevision, oldRevision + 1);
  stalePreparation.resolve({ ready: true, rowId: "old-row", player: oldAudio });

  await oldTick;
  await newAudioSynced.promise;
  await Promise.resolve();

  assert.equal(oldAudio.playCount, 0, "the obsolete row must never start playback");
  assert.deepEqual(oldAudio.seekHistory, [], "the obsolete row must not be repositioned after the seek");
  assert.equal(newAudio.playCount, 1, "the queued tick must start the newly selected row");
  assert.deepEqual(musicSyncPositions, [10_000], "old-scene music synchronization must be discarded");
  assert.equal(controller.state.currentMs, 10_000);
});

test("a stale background resolution cannot claim a shared key or block the future source", async () => {
  const session = { id: "background-seek-race" };
  const sharedSource = "https://cdn.example.test/shared-background.mp3";
  const segment = {
    sourceUrl: sharedSource,
    startOffsetMs: 0,
    endOffsetMs: 16_000,
    trimInMs: 0,
    trimOutMs: 16_000,
    volume: 100,
    loop: false,
  };
  const staleResolution = createDeferred();
  const backgroundAudio = new FakeVideo({ duration: 16, currentTime: 0 });
  let resolutionCalls = 0;
  const controller = new PodcasterPlaybackController();
  controller.state.session = session;
  controller.state.currentMs = 1_000;
  controller.state.totalDurationMs = 16_000;
  controller.state.isPlaying = false;
  controller.getOrCreateBackgroundAudioElement = () => backgroundAudio;
  controller.resolveDialoguePlaybackAudioSource = () => {
    resolutionCalls += 1;
    return resolutionCalls === 1
      ? staleResolution.promise
      : Promise.resolve("blob:future-background");
  };
  controller.prewarmTimelineStageVideos = async () => true;
  controller.tick = async () => {};
  controller.getEntryAtMs = () => ({ rowId: "scene" });
  controller.deps = {
    getPanelMontageMusicConfig: () => ({
      sourceType: "upload",
      sourceUrl: sharedSource,
      sourceItems: [segment],
      loopEnabled: false,
      volume: 100,
    }),
    getPodcastVideoConfig: () => ({ masterVolume: 100 }),
    getTimelineTotalDurationMs: () => 16_000,
    resolveTimelineClipMix: () => ({ backgroundVolume: 1 }),
    buildTimelineRuntimeEntries: () => [],
  };

  const oldRevision = controller.playheadRevision;
  const staleSync = controller.syncBackgroundMusic(1_000, 1, false, {
    playheadRevision: oldRevision,
  });
  await Promise.resolve();
  assert.equal(resolutionCalls, 1);

  await controller.seek(10_000, { allowConcurrentTick: false });
  staleResolution.resolve("blob:obsolete-background");
  await staleSync;

  assert.equal(controller.backgroundSourceKey, "", "the stale resolver cannot publish the shared key");
  assert.equal(backgroundAudio.src, "", "the stale resolver cannot mount its obsolete source");

  await controller.syncBackgroundMusic(10_000, 1, false, {
    playheadRevision: controller.playheadRevision,
  });

  assert.equal(resolutionCalls, 2, "the future revision must resolve the same logical key again");
  assert.equal(controller.backgroundSourceKey, controller.resolveAudioSourceKey(segment));
  assert.equal(backgroundAudio.dataset.sourceKey, controller.resolveAudioSourceKey(segment));
  assert.equal(backgroundAudio.dataset.originalSrc, "blob:future-background");
  assert.equal(backgroundAudio.src, "blob:future-background");
  assert.equal(
    backgroundAudio.assignedSources.includes("blob:obsolete-background"),
    false,
    "the obsolete URL must never touch the media element",
  );
});

class FakeOverlay {
  constructor() {
    this.hidden = false;
    this.style = createFakeStyle();
    this.classList = new FakeClassList();
    this.dataset = {};
    this.attributes = new Map();
    this.parentElement = { clientWidth: 1280, clientHeight: 720 };
    this.innerHtmlWrites = 0;
    this._innerHTML = "";
    this.contentNode = {
      textContent: "",
      innerHTML: "",
      style: createFakeStyle(),
      classList: new FakeClassList(),
    };
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    this.innerHtmlWrites += 1;
    this._innerHTML = String(value);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  querySelector(selector) {
    if (selector === ".podcast-on-screen-text-content") return this.contentNode;
    return null;
  }
}

test("unchanged overlay state does not replace its DOM on every playback tick", () => {
  const overlay = new FakeOverlay();
  const row = { id: "row-a", onScreenText: "Texto estable" };
  const clip = {
    rowId: row.id,
    startMs: 0,
    durationMs: 5_000,
    trimOutMs: 5_000,
    text: row.onScreenText,
  };
  const config = {
    timelineOnScreenTextClipsByRowId: { [row.id]: clip },
    onScreenTextTrack: {
      enabled: true,
      showTrack: true,
      timelineOnScreenTextClipsByRowId: { [row.id]: clip },
    },
    geminiDialogueTrack: { enabled: false, segments: [] },
  };
  const controller = new PodcasterPlaybackController();
  controller.els = { podcastOnScreenTextOverlay: overlay };
  controller.state.session = { script: [row] };
  controller.deps = {
    podcastVideoState: { montageActive: true },
    getActiveSession: () => controller.state.session,
    getPodcastVideoConfig: () => config,
    normalizeOnScreenTextTrackSettings: (settings) => ({
      enabled: settings?.enabled !== false,
      showTrack: settings?.showTrack !== false,
      timelineOnScreenTextClipsByRowId: settings?.timelineOnScreenTextClipsByRowId || {},
    }),
    getOnScreenTextClipEffectiveDurationMs: () => 5_000,
    getOnScreenTextLayoutForRow: () => ({
      xPct: 0.1,
      yPct: 0.8,
      widthPct: 0.5,
      heightPct: 0.1,
    }),
    resolveOnScreenTextPreviewLayoutSpec: () => ({
      presetClass: "",
      bgClass: "",
      inlineStyle: "--ost-x: 10%; --ost-y: 80%;",
      bubbleWidthPx: 500,
      bubbleHeightPx: 80,
      xPct: 0.1,
      yPct: 0.8,
      metrics: {},
    }),
    resolveDialogueAudioForRow: () => null,
    resolveDialogueAudioPlaybackRate: () => 1,
    getPodcasterSceneKaraokeTokenOffset: () => 0,
    getOnScreenTextClipText: (_clip, sourceRow) => sourceRow?.onScreenText || "",
    getOnScreenTextStylePresetClass: () => "",
    getOnScreenTextBgPresetClass: () => "",
    escapeHtml: (value) => String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;"),
  };

  controller.syncOverlay(1_000);
  controller.syncOverlay(1_016);

  assert.equal(
    overlay.innerHtmlWrites,
    1,
    "identical consecutive frames should reuse the existing overlay DOM",
  );

  row.onScreenText = "Texto actualizado";
  clip.text = row.onScreenText;
  controller.syncOverlay(1_032);
  assert.equal(overlay.innerHtmlWrites, 2, "a real text change must still rerender");
});

test("session preparation hydrates every visual and stop-motion frame with exact progress", async () => {
  const previousStopMotion = window.PodcasterStopMotion;
  window.PodcasterStopMotion = {
    normalizeStopMotion: (value) => value,
    preloadStopMotionFrame: async () => true,
  };
  try {
    const entries = [
      createSceneEntry({ rowId: "video", videoSrc: "https://media.test/video.mp4", startMs: 0, endMs: 8_000 }),
      {
        ...createSceneEntry({ rowId: "image", videoSrc: "https://media.test/image.jpg", startMs: 8_000, endMs: 16_000 }),
        type: "image",
        stopMotion: {
          frames: [
            { downloadUrl: "https://media.test/frame-1.jpg" },
            { downloadUrl: "https://media.test/frame-2.jpg" },
          ],
        },
      },
    ];
    const requested = [];
    const progress = [];
    const controller = new PodcasterPlaybackController();
    controller.state.session = { id: "session-media", script: { rows: [] } };
    controller.deps = {
      buildTimelineRuntimeEntries: () => entries,
      resolveDialogueAudioForRow: () => null,
      getPanelMontageMusicConfig: () => ({ sourceType: "none" }),
      resolveStorageVideoUrl: (downloadUrl) => downloadUrl,
    };
    controller.getBlobUrl = async (source) => {
      requested.push(source);
      const blobUrl = `blob:${source}`;
      controller.blobCache.set(source, blobUrl);
      return blobUrl;
    };
    controller.preloadImageSrc = async (source) => controller.getBlobUrlSync(source);

    const result = await controller.prepareSessionMedia({
      onProgress: (value) => progress.push(value),
    });

    assert.equal(result.ready, true);
    assert.equal(result.total, 4);
    assert.deepEqual(new Set(requested), new Set([
      "https://media.test/video.mp4",
      "https://media.test/image.jpg",
      "https://media.test/frame-1.jpg",
      "https://media.test/frame-2.jpg",
    ]));
    assert.equal(progress.at(-1).state, "ready");
    assert.equal(progress.at(-1).completed, 4);
    assert.equal(progress.at(-1).total, 4);
  } finally {
    window.PodcasterStopMotion = previousStopMotion;
  }
});

test("a corrupt 200 video blob is evicted once and valid replacement bytes complete preparation", async () => {
  const source = "/api/assets/proxy-media?storagePath=podcaster%2Fsessions%2Fdecode%2Fscene.mp4";
  const entry = createSceneEntry({ rowId: "decode-video", videoSrc: source });
  const session = { id: "decode-video-session", script: { rows: [] } };
  const hydratedSources = ["blob:CORRUPT-200", "blob:VALID-200"];
  const hydrationOptions = [];
  const probedSources = [];
  const persistentInvalidations = [];
  const signedUrlInvalidations = [];
  const controller = new PodcasterPlaybackController();
  controller.state.session = session;
  controller.getBlobUrl = async (_source, options = {}) => {
    hydrationOptions.push({ ...options });
    return hydratedSources.shift() || "";
  };
  controller.probeHydratedMediaSource = async (hydratedSource, kind) => {
    probedSources.push({ hydratedSource, kind });
    return hydratedSource === "blob:VALID-200";
  };
  controller.invalidateAuthorizedAssetSource = (invalidatedSource) => {
    signedUrlInvalidations.push(invalidatedSource);
  };
  controller.invalidateBlobUrl = async (invalidatedSource) => {
    persistentInvalidations.push(invalidatedSource);
    controller.bumpMediaSourceGeneration(invalidatedSource);
    return true;
  };
  controller.deps = {
    buildTimelineRuntimeEntries: () => [entry],
    resolveDialogueAudioForRow: () => null,
    getPanelMontageMusicConfig: () => ({ sourceType: "none" }),
  };

  const result = await controller.prepareSessionMedia({ session });

  assert.equal(result.ready, true);
  assert.equal(result.total, 1);
  assert.deepEqual(probedSources, [
    { hydratedSource: "blob:CORRUPT-200", kind: "video" },
    { hydratedSource: "blob:VALID-200", kind: "video" },
  ]);
  assert.equal(hydrationOptions.length, 2, "decode failure receives exactly one fresh hydration");
  assert.equal(hydrationOptions[0].forceAuthorizedRefresh, false);
  assert.equal(hydrationOptions[1].forceAuthorizedRefresh, true);
  assert.deepEqual(persistentInvalidations, [source]);
  assert.deepEqual(signedUrlInvalidations, [source]);
});

test("dialogue and music retry decode once without reusing corrupt blobs or players", async () => {
  const session = { id: "audio-decode-retry", script: { rows: [{ id: "dialogue-row" }] } };
  const dialogueClip = {
    downloadUrl: "https://cdn.example.test/dialogue-decode.mp3",
    durationSec: 8,
  };
  const dialogueController = new PodcasterPlaybackController();
  dialogueController.state.session = session;
  let dialogueSourceResolutions = 0;
  let dialogueRefreshes = 0;
  const createdPlayers = [];
  const dialogueReadyChecks = [];
  dialogueController.deps = {
    resolveDialogueAudioForRow: () => dialogueClip,
  };
  dialogueController.resolveDialoguePlaybackAudioSource = async () => {
    dialogueSourceResolutions += 1;
    return "blob:CORRUPT-DIALOGUE";
  };
  dialogueController.refreshAudioClipAfterDecodeFailure = async (clip) => {
    assert.equal(clip, dialogueClip);
    dialogueRefreshes += 1;
    dialogueController.bumpMediaSourceGeneration(
      dialogueController.resolveAudioMediaGenerationKey(dialogueClip),
    );
    return "blob:VALID-DIALOGUE";
  };
  dialogueController.getOrCreateDialoguePlayer = (rowId, src, sourceKey) => {
    const player = new FakeVideo({ src, readyState: 0, autoReady: false });
    player.dataset.initialized = "false";
    player.remove = () => { player.removed = true; };
    createdPlayers.push(player);
    dialogueController.dialoguePlayers[rowId] = player;
    dialogueController.audioCache[rowId] = player;
    dialogueController.dialogueAudioSourceKeys[rowId] = sourceKey;
    return player;
  };
  dialogueController.waitForDialogueReady = async (player) => {
    dialogueReadyChecks.push(player.src);
    return player.src === "blob:VALID-DIALOGUE";
  };

  const preparedDialogue = await dialogueController.prepareDialogueRow(session, "dialogue-row");

  assert.equal(dialogueSourceResolutions, 1);
  assert.equal(dialogueRefreshes, 1);
  assert.deepEqual(dialogueReadyChecks, ["blob:CORRUPT-DIALOGUE", "blob:VALID-DIALOGUE"]);
  assert.equal(createdPlayers.length, 2);
  assert.equal(createdPlayers[0].removed, true);
  assert.equal(createdPlayers[0].src, "", "the corrupt player is detached before retry");
  assert.equal(preparedDialogue.player, createdPlayers[1]);
  assert.equal(dialogueController.dialoguePlayers["dialogue-row"], createdPlayers[1]);

  const musicClip = { downloadUrl: "https://cdn.example.test/music-decode.mp3" };
  const musicController = new PodcasterPlaybackController();
  let musicSourceResolutions = 0;
  let musicRefreshes = 0;
  const musicProbes = [];
  musicController.resolveDialoguePlaybackAudioSource = async () => {
    musicSourceResolutions += 1;
    return "blob:CORRUPT-MUSIC";
  };
  musicController.refreshAudioClipAfterDecodeFailure = async (clip) => {
    assert.equal(clip, musicClip);
    musicRefreshes += 1;
    return "blob:VALID-MUSIC";
  };
  musicController.probeHydratedMediaSource = async (src, kind) => {
    musicProbes.push({ src, kind });
    return src === "blob:VALID-MUSIC";
  };

  assert.equal(
    await musicController.resolveAndValidateAudioClipSource(musicClip),
    "blob:VALID-MUSIC",
  );
  assert.equal(musicSourceResolutions, 1);
  assert.equal(musicRefreshes, 1);
  assert.deepEqual(musicProbes, [
    { src: "blob:CORRUPT-MUSIC", kind: "audio" },
    { src: "blob:VALID-MUSIC", kind: "audio" },
  ]);
});

test("a confirmed 404 exits visual hydration without a duplicate retry", async () => {
  const source = "/api/assets/proxy-media?storagePath=podcaster%2Fsessions%2Fmissing%2Fscene.mp4";
  const controller = new PodcasterPlaybackController();
  let hydrationCalls = 0;
  let probeCalls = 0;
  let persistentInvalidations = 0;
  let signedUrlInvalidations = 0;
  controller.getBlobUrl = async () => {
    hydrationCalls += 1;
    controller.blobCache.set(source, "404");
    return "";
  };
  controller.probeHydratedMediaSource = async () => {
    probeCalls += 1;
    return false;
  };
  controller.invalidateBlobUrl = async () => {
    persistentInvalidations += 1;
    return true;
  };
  controller.invalidateAuthorizedAssetSource = () => {
    signedUrlInvalidations += 1;
  };

  await assert.rejects(
    controller.hydrateAndValidateVisualSource(source, "video", { persistent: true }),
    /No se pudo hidratar el video localmente/,
  );
  assert.equal(hydrationCalls, 1);
  assert.equal(probeCalls, 0);
  assert.equal(persistentInvalidations, 0);
  assert.equal(signedUrlInvalidations, 0);
});

test("changing the playhead reprioritizes remaining session hydration work", async () => {
  const entries = Array.from({ length: 5 }, (_, index) => createSceneEntry({
    rowId: `scene-${index + 1}`,
    videoSrc: `https://media.test/scene-${index + 1}.mp4`,
    startMs: index * 8_000,
    endMs: (index + 1) * 8_000,
  }));
  const gates = new Map();
  const started = [];
  const controller = new PodcasterPlaybackController();
  controller.state.session = { id: "priority", script: { rows: [] } };
  controller.state.currentMs = 0;
  controller.deps = {
    buildTimelineRuntimeEntries: () => entries,
    resolveDialogueAudioForRow: () => null,
    getPanelMontageMusicConfig: () => ({ sourceType: "none" }),
  };
  controller.getBlobUrl = (source) => {
    started.push(source);
    if (started.length <= 3) {
      const gate = createDeferred();
      gates.set(source, gate);
      return gate.promise.then(() => `blob:${source}`);
    }
    return Promise.resolve(`blob:${source}`);
  };

  const preparation = controller.prepareSessionMedia();
  while (started.length < 3) await Promise.resolve();
  controller.state.currentMs = 32_000;
  gates.get(started[0]).resolve();
  while (started.length < 4) await Promise.resolve();

  assert.equal(started[3], "https://media.test/scene-5.mp4");
  [...gates.values()].forEach((gate) => gate.resolve());
  assert.equal((await preparation).ready, true);
});

test("a deferred preparePlaybackRange cannot publish state after session release", async () => {
  const sessionA = { id: "range-session-a", script: { rows: [] } };
  const sessionB = { id: "range-session-b", script: { rows: [] } };
  const entryA = createSceneEntry({ rowId: "range-a", startMs: 0, endMs: 8_000 });
  const hydration = createDeferred();
  const hydrationStarted = createDeferred();
  const controller = new PodcasterPlaybackController();
  controller.state.session = sessionA;
  controller.state.currentMs = 0;
  controller.state.totalDurationMs = 8_000;
  controller.getBlobUrl = async (source) => {
    assert.equal(source, entryA.videoSrc);
    hydrationStarted.resolve();
    return hydration.promise;
  };
  controller.prewarmTimelineStageVideos = async () => true;
  controller.prepareBackgroundMusicAtMs = async () => true;
  controller.stopClock = () => {};
  controller.stopBackgroundMusic = () => {};
  controller.deps = {
    buildTimelineRuntimeEntries: (session) => (session?.id === sessionA.id ? [entryA] : []),
    getPodcastVideoConfig: () => ({ geminiDialogueTrack: { segments: [] } }),
    resolveDialogueAudioForRow: () => null,
    clearAuthorizedAssetUrls: () => {},
  };

  const stalePreparation = controller.preparePlaybackRange({
    atMs: 0,
    criticalOnly: true,
  });
  await hydrationStarted.promise;

  controller.releaseSessionRuntimeMedia();
  controller.state.session = sessionB;
  controller.state.isPreparing = true;
  controller.playbackRangePreparationSignature = "session-b-range";
  controller.playbackRangePreparationAtMs = 12_000;

  hydration.resolve("blob:range-session-a");
  assert.equal(await stalePreparation, false);
  assert.equal(controller.state.session, sessionB);
  assert.equal(
    controller.state.isPreparing,
    true,
    "session A cannot clear session B's preparation indicator",
  );
  assert.equal(controller.playbackRangePreparationSignature, "session-b-range");
  assert.equal(controller.playbackRangePreparationAtMs, 12_000);
});

test("a released prewarm neither requests A2 nor clears session B's promise", async () => {
  const sessionA = { id: "prewarm-session-a" };
  const sessionB = { id: "prewarm-session-b" };
  const entryA1 = createSceneEntry({ rowId: "prewarm-a1", videoSrc: "https://cdn.example.test/a1.mp4" });
  const entryA2 = createSceneEntry({ rowId: "prewarm-a2", videoSrc: "https://cdn.example.test/a2.mp4", startMs: 8_000, endMs: 16_000 });
  const entryB = createSceneEntry({ rowId: "prewarm-b", videoSrc: "https://cdn.example.test/b1.mp4" });
  const a1Hydration = createDeferred();
  const bHydration = createDeferred();
  const a1Started = createDeferred();
  const bStarted = createDeferred();
  const requestedSources = [];
  const controller = new PodcasterPlaybackController();
  controller.state.session = sessionA;
  controller.getBlobUrl = async (source) => {
    requestedSources.push(source);
    if (source === entryA1.videoSrc) {
      a1Started.resolve();
      return a1Hydration.promise;
    }
    if (source === entryB.videoSrc) {
      bStarted.resolve();
      return bHydration.promise;
    }
    if (source === entryA2.videoSrc) return "blob:a2-should-not-run";
    throw new Error(`unexpected prewarm source: ${source}`);
  };
  controller.stopClock = () => {};
  controller.stopBackgroundMusic = () => {};
  controller.deps = {
    buildTimelineRuntimeEntries: (session) => {
      if (session?.id === sessionA.id) return [entryA1, entryA2];
      if (session?.id === sessionB.id) return [entryB];
      return [];
    },
    clearAuthorizedAssetUrls: () => {},
  };

  const stalePrewarm = controller.prewarmTimelineStageVideos(sessionA, {
    currentMs: 0,
    concurrency: 1,
  });
  await a1Started.promise;

  controller.releaseSessionRuntimeMedia();
  controller.state.session = sessionB;
  const currentPrewarm = controller.prewarmTimelineStageVideos(sessionB, {
    currentMs: 0,
    concurrency: 1,
  });
  await bStarted.promise;

  a1Hydration.resolve("blob:a1-obsolete");
  await stalePrewarm;
  assert.equal(
    requestedSources.includes(entryA2.videoSrc),
    false,
    "the obsolete A worker must stop before requesting A2",
  );
  assert.equal(
    controller.videoPrewarmPromise,
    currentPrewarm,
    "A's finally block cannot clear B's active prewarm promise",
  );

  bHydration.resolve("blob:b-current");
  assert.equal(await currentPrewarm, true);
  assert.equal(controller.videoPrewarmPromise, null);
});

test("unexpected stage buffering freezes the playhead and resumes after an A/B recovery", async () => {
  const entry = createSceneEntry({ rowId: "buffered", startMs: 0, endMs: 8_000 });
  const activeVideo = new FakeVideo({ src: entry.videoSrc, currentTime: 4 });
  const inactiveVideo = new FakeVideo({ readyState: 0 });
  const { controller, playbackState } = createStageController({
    activeVideo,
    inactiveVideo,
    resolveSourceState: () => ({ sourceMs: 4_000, playbackRate: 1, isHoldActive: false }),
  });
  activeVideo.dataset.entryKey = controller.buildStageEntryIdentity(entry);
  controller.state.currentMs = 4_000;
  controller.state.totalDurationMs = 8_000;
  controller.cachedTickEntries = [entry];
  controller.cachedTickEntriesTime = performance.now();
  controller.deps.buildTimelineRuntimeEntries = () => [entry];
  controller.deps.resolveSceneNumberByRowId = () => 1;
  controller.deps.setPodcastVideoStatus = () => {};
  controller.deps.updatePodcastVideoTransportUi = () => {};
  controller.setStageVideoSourceForElement = async (video, src, options) => {
    video.dataset.src = src;
    video.dataset.entryKey = options.entryKey;
    video.readyState = HTMLMediaElement.HAVE_ENOUGH_DATA;
    return true;
  };
  controller.waitForStageVideoFrameReady = async () => true;
  controller.prepareBackdropForEntry = async () => true;
  controller.syncAudio = async () => true;
  controller.syncStageSwitching = async () => true;
  let clockStops = 0;
  let clockStarts = 0;
  controller.stopClock = () => { clockStops += 1; };
  controller.startClock = () => { clockStarts += 1; };

  assert.equal(await controller.recoverStageBuffering(activeVideo, "waiting"), true);
  assert.equal(controller.state.currentMs, 4_000);
  assert.equal(playbackState.stageVideoSlot, 1);
  assert.equal(activeVideo.hidden, true);
  assert.equal(inactiveVideo.hidden, false);
  assert.ok(clockStops >= 1);
  assert.equal(clockStarts, 1);
  assert.equal(controller.state.isPlaying, true);
  assert.equal(controller.state.isBuffering, false);
});

function createMissingStageTransitionHarness() {
  const oldEntry = createSceneEntry({ rowId: "transition-old", startMs: 0, endMs: 8_000 });
  const nextEntry = createSceneEntry({ rowId: "transition-next", startMs: 8_000, endMs: 16_000 });
  const activeVideo = new FakeVideo({ src: oldEntry.videoSrc, currentTime: 7.9 });
  activeVideo.dataset.entryKey = "old-entry";
  activeVideo.dataset.rowId = oldEntry.rowId;
  activeVideo.hidden = false;
  activeVideo.paused = false;
  const inactiveVideo = new FakeVideo({ readyState: 0 });
  inactiveVideo.hidden = true;
  const dialogueAudio = new FakeVideo({ duration: 8, currentTime: 7.9 });
  dialogueAudio.paused = false;
  const { controller } = createStageController({
    activeVideo,
    inactiveVideo,
    resolveSourceState: () => ({ sourceMs: 0, playbackRate: 1, isHoldActive: false }),
  });
  controller.state.session = { id: "missing-stage-transition" };
  controller.state.currentMs = 8_000;
  controller.state.totalDurationMs = 16_000;
  controller.state.isPlaying = true;
  controller.state.isBuffering = false;
  controller.dialoguePlayers = { [oldEntry.rowId]: dialogueAudio };
  controller.getEntryAtMs = () => nextEntry;
  controller.preloadUpcomingStageSlot = async () => true;
  controller.preloadUpcomingStylizedText = () => {};
  controller.pauseBackgroundMusic = () => {};
  controller.syncStageMediaMotionPlaybackState = () => {};
  const statuses = [];
  Object.assign(controller.deps, {
    buildTimelineRuntimeEntries: () => [nextEntry],
    resolveSceneNumberByRowId: () => 2,
    setPodcastVideoStatus: (status) => { statuses.push(status); },
    updatePodcastVideoTransportUi: () => {},
  });
  return { controller, nextEntry, activeVideo, dialogueAudio, statuses };
}

test("a missing stage freezes playback and reanchors the successful transition without catch-up", async () => {
  const { controller, dialogueAudio } = createMissingStageTransitionHarness();
  const stagePreparation = createDeferred();
  const stagePreparationStarted = createDeferred();
  let stageSyncCalls = 0;
  let clockStops = 0;
  const clockStartAnchors = [];
  const audioSyncs = [];
  controller.stopClock = () => { clockStops += 1; };
  controller.startClock = () => { clockStartAnchors.push(controller.state.currentMs); };
  controller.syncStageSwitching = async () => {
    stageSyncCalls += 1;
    if (stageSyncCalls === 1) {
      stagePreparationStarted.resolve();
      return stagePreparation.promise;
    }
    return true;
  };
  controller.syncAudio = async (currentMs, _speed, options) => {
    audioSyncs.push({ currentMs, options });
    return true;
  };

  const transition = controller.syncVideo(8_000, {
    playheadRevision: controller.playheadRevision,
  });
  await stagePreparationStarted.promise;

  assert.equal(controller.state.isBuffering, true);
  assert.equal(controller.stageBufferStartMs, 8_000);
  assert.equal(controller.state.currentMs, 8_000);
  assert.equal(dialogueAudio.paused, true, "voice audio freezes while the slot is missing");
  assert.ok(clockStops >= 1);

  controller.state.currentMs = 14_500;
  stagePreparation.resolve(true);
  await transition;

  assert.equal(stageSyncCalls, 2, "the prepared slot is verified while starting playback");
  assert.deepEqual(audioSyncs.map((item) => item.currentMs), [8_000]);
  assert.equal(audioSyncs[0].options.allowDuringBufferRecovery, true);
  assert.equal(controller.state.currentMs, 8_000, "wall-clock delay cannot catch the playhead up");
  assert.deepEqual(clockStartAnchors, [8_000], "the restarted clock anchors at the transition boundary");
  assert.equal(controller.state.isPlaying, true);
  assert.equal(controller.state.isBuffering, false);
  assert.equal(controller.stageBufferStartMs, null);
});

test("a missing stage preparation failure stops Play instead of advancing invisibly", async () => {
  const { controller, dialogueAudio, statuses } = createMissingStageTransitionHarness();
  const stagePreparation = createDeferred();
  const stagePreparationStarted = createDeferred();
  let clockStarts = 0;
  let audioSyncCalls = 0;
  controller.stopClock = () => {};
  controller.startClock = () => { clockStarts += 1; };
  controller.syncStageSwitching = async () => {
    stagePreparationStarted.resolve();
    return stagePreparation.promise;
  };
  controller.syncAudio = async () => {
    audioSyncCalls += 1;
    return true;
  };

  const transition = controller.syncVideo(8_000, {
    playheadRevision: controller.playheadRevision,
  });
  await stagePreparationStarted.promise;
  assert.equal(controller.state.isBuffering, true);
  assert.equal(dialogueAudio.paused, true);

  stagePreparation.resolve(false);
  assert.equal(await transition, false);
  assert.equal(controller.state.isPlaying, false);
  assert.equal(controller.state.isBuffering, false);
  assert.equal(controller.stageBufferStartMs, null);
  assert.equal(clockStarts, 0);
  assert.equal(audioSyncCalls, 0);
  assert.ok(statuses.some((status) => status.includes("No se pudo preparar")));
});

test("a precomposed B slot crosses the boundary without buffering or another frame wait", async () => {
  const entryA = createSceneEntry({ rowId: "precomposed-a", startMs: 0, endMs: 8_000 });
  const entryB = createSceneEntry({ rowId: "precomposed-b", startMs: 8_000, endMs: 16_000 });
  const activeVideo = new FakeVideo({ src: entryA.videoSrc, currentTime: 7.9 });
  activeVideo.dataset.src = entryA.videoSrc;
  activeVideo.dataset.entryKey = "entry-a";
  activeVideo.dataset.mediaSourceGeneration = "0";
  activeVideo.hidden = false;
  const inactiveVideo = new FakeVideo({ src: entryB.videoSrc, currentTime: 0 });
  const { controller, playbackState } = createStageController({
    activeVideo,
    inactiveVideo,
    resolveSourceState: () => ({ sourceMs: 0, playbackRate: 1, isHoldActive: false }),
  });
  const entryBKey = controller.buildStageEntryIdentity(entryB);
  inactiveVideo.dataset.src = entryB.videoSrc;
  inactiveVideo.dataset.entryKey = entryBKey;
  inactiveVideo.dataset.preparedEntryKey = entryBKey;
  inactiveVideo.dataset.mediaSourceGeneration = String(controller.getMediaSourceGeneration(entryB.videoSrc));
  inactiveVideo.hidden = true;
  inactiveVideo.style.opacity = "0";
  inactiveVideo.style.visibility = "hidden";
  controller.state.session = { id: "precomposed-boundary" };
  controller.state.currentMs = 8_000;
  controller.state.totalDurationMs = 16_000;
  controller.state.isPlaying = true;
  controller.state.isBuffering = false;
  controller.getEntryAtMs = () => entryB;
  controller.preloadUpcomingStageSlot = async () => true;
  controller.preloadUpcomingStylizedText = () => {};
  controller.prepareBackdropForEntry = async () => true;
  let frameWaits = 0;
  let bufferingPauses = 0;
  let clockStarts = 0;
  controller.waitForStageVideoFrameReady = async () => {
    frameWaits += 1;
    return true;
  };
  const originalPauseForBuffering = controller.pauseMediaForStageBuffering.bind(controller);
  controller.pauseMediaForStageBuffering = () => {
    bufferingPauses += 1;
    originalPauseForBuffering();
  };
  controller.startClock = () => { clockStarts += 1; };
  Object.assign(controller.deps, {
    buildTimelineRuntimeEntries: () => [entryB],
    setPodcastVideoPortraitFallback: () => {},
    setPodcastVideoStatus: () => {},
    updatePodcastVideoTransportUi: () => {},
  });

  await controller.syncVideo(8_000, { playheadRevision: controller.playheadRevision });

  assert.equal(bufferingPauses, 0);
  assert.equal(frameWaits, 0, "the already composited frame must not be awaited again");
  assert.equal(clockStarts, 0, "the continuously running clock is not restarted");
  assert.equal(controller.state.isBuffering, false);
  assert.equal(controller.state.isPlaying, true);
  assert.equal(controller.state.currentMs, 8_000);
  assert.equal(playbackState.stageVideoSlot, 1);
  assert.equal(inactiveVideo.hidden, false);
  assert.equal(activeVideo.hidden, true);
});

test("a precomposed B slot whose play rejects freezes at the cut and stops for retry", async () => {
  const entryA = createSceneEntry({ rowId: "rejected-a", startMs: 0, endMs: 8_000 });
  const entryB = createSceneEntry({ rowId: "rejected-b", startMs: 8_000, endMs: 16_000 });
  const activeVideo = new FakeVideo({ src: entryA.videoSrc, currentTime: 7.9 });
  activeVideo.dataset.src = entryA.videoSrc;
  activeVideo.dataset.entryKey = "entry-a";
  activeVideo.dataset.mediaSourceGeneration = "0";
  activeVideo.hidden = false;
  activeVideo.paused = false;
  const inactiveVideo = new FakeVideo({ src: entryB.videoSrc, currentTime: 0 });
  const { controller, playbackState } = createStageController({
    activeVideo,
    inactiveVideo,
    resolveSourceState: () => ({ sourceMs: 0, playbackRate: 1, isHoldActive: false }),
  });
  const entryBKey = controller.buildStageEntryIdentity(entryB);
  inactiveVideo.dataset.src = entryB.videoSrc;
  inactiveVideo.dataset.entryKey = entryBKey;
  inactiveVideo.dataset.preparedEntryKey = entryBKey;
  inactiveVideo.dataset.mediaSourceGeneration = String(controller.getMediaSourceGeneration(entryB.videoSrc));
  inactiveVideo.hidden = true;
  inactiveVideo.style.opacity = "0";
  inactiveVideo.style.visibility = "hidden";
  const rejectedPlay = new Error("decoder could not start the prepared slot");
  rejectedPlay.name = "NotSupportedError";
  let rejectedPlayCalls = 0;
  inactiveVideo.play = () => {
    rejectedPlayCalls += 1;
    inactiveVideo.paused = true;
    return Promise.reject(rejectedPlay);
  };

  controller.state.session = { id: "precomposed-rejected-boundary" };
  controller.state.currentMs = 8_000;
  controller.state.totalDurationMs = 16_000;
  controller.state.isPlaying = true;
  controller.state.isBuffering = false;
  controller.getEntryAtMs = () => entryB;
  controller.preloadUpcomingStageSlot = async () => true;
  controller.preloadUpcomingStylizedText = () => {};
  controller.prepareBackdropForEntry = async () => true;
  controller.syncAudio = async () => true;
  let clockStarts = 0;
  controller.startClock = () => { clockStarts += 1; };
  const statuses = [];
  Object.assign(controller.deps, {
    buildTimelineRuntimeEntries: () => [entryB],
    setPodcastVideoPortraitFallback: () => {},
    setPodcastVideoStatus: (status) => { statuses.push(status); },
    updatePodcastVideoTransportUi: () => {},
  });

  assert.equal(
    await controller.syncVideo(8_000, { playheadRevision: controller.playheadRevision }),
    false,
  );

  assert.equal(rejectedPlayCalls, 2, "the coordinated recovery retries playback exactly once");
  assert.equal(controller.state.currentMs, 8_000, "the playhead remains frozen at the scene cut");
  assert.equal(controller.state.isPlaying, false);
  assert.equal(controller.state.isBuffering, false);
  assert.equal(controller.stageBufferStartMs, null);
  assert.equal(clockStarts, 0, "a rejected prepared slot cannot restart the master clock");
  assert.equal(inactiveVideo.paused, true);
  assert.equal(activeVideo.paused, true);
  assert.equal(playbackState.stageVideoSlot, 1, "the decoded B frame remains the composed retry surface");
  assert.ok(statuses.some((status) => status.includes("No se pudo iniciar")));
});

test("a transformed private Firebase URL refreshes once after a transient 403", async () => {
  const originalFetch = globalThis.fetch;
  const fetchUrls = [];
  let signedCalls = 0;
  let invalidations = 0;
  globalThis.fetch = async (url) => {
    fetchUrls.push(String(url));
    if (fetchUrls.length === 1) return new Response("forbidden", { status: 403 });
    return new Response(new Blob(["video-bytes"], { type: "video/mp4" }), { status: 200 });
  };
  try {
    const controller = new PodcasterPlaybackController();
    controller.state.config = { mediaLoadMode: "streaming" };
    controller.deps = {
      resolveAuthorizedAssetMetadata: async (_proxyUrl, options = {}) => {
        signedCalls += 1;
        return {
          url: `https://signed.test/video-${signedCalls}.mp4`,
          expiresAt: Date.now() + 300_000,
          storagePath: "podcaster/sessions/s1/owners/u/video.mp4",
          forceRefresh: options.forceRefresh === true,
        };
      },
      invalidateAuthorizedAssetUrl: () => { invalidations += 1; },
    };
    const firebaseUrl = "https://firebasestorage.googleapis.com/v0/b/example/o/podcaster%2Fsessions%2Fs1%2Fowners%2Fu%2Fvideo.mp4?alt=media";

    const resolved = await controller.getBlobUrl(firebaseUrl, { persistent: true });

    assert.match(resolved, /^blob:/);
    assert.equal(fetchUrls.length, 2);
    assert.equal(signedCalls, 2);
    assert.equal(invalidations, 1);
    assert.match(fetchUrls[0], /video-1\.mp4$/);
    assert.match(fetchUrls[1], /video-2\.mp4$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an explicit seek invalidates late waiting recovery at the previous playhead", { concurrency: false }, async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let scheduledRecovery = null;
  const clearedTimers = [];
  globalThis.setTimeout = (callback) => {
    scheduledRecovery = callback;
    return 4_001;
  };
  globalThis.clearTimeout = (timerId) => {
    clearedTimers.push(timerId);
  };

  try {
    const entry = createSceneEntry({ rowId: "buffer-seek", startMs: 0, endMs: 20_000 });
    const activeVideo = new FakeVideo({ src: entry.videoSrc, currentTime: 4 });
    const { controller } = createStageController({
      activeVideo,
      resolveSourceState: () => ({ sourceMs: 4_000, playbackRate: 1, isHoldActive: false }),
    });
    controller.state.currentMs = 4_000;
    controller.state.totalDurationMs = 20_000;
    controller.state.isPlaying = true;
    controller.getEntryAtMs = () => entry;
    controller.deps.buildTimelineRuntimeEntries = () => [entry];
    controller.deps.setPodcastVideoStatus = () => {};
    controller.deps.updatePodcastVideoTransportUi = () => {};
    controller.prewarmTimelineStageVideos = async () => true;
    controller.pauseMediaForStageBuffering = () => { activeVideo.pause(); };
    controller.syncStageMediaMotionPlaybackState = () => {};
    const tickPositions = [];
    controller.tick = async (ms) => {
      tickPositions.push(ms);
      controller.state.currentMs = ms;
    };
    let clockStarts = 0;
    controller.startClock = () => { clockStarts += 1; };
    let staleRecoveryCalls = 0;
    controller.recoverStageBuffering = async () => {
      staleRecoveryCalls += 1;
      controller.state.currentMs = 4_000;
      return true;
    };

    assert.equal(controller.scheduleStageBufferRecovery(activeVideo, "waiting"), true);
    assert.equal(controller.state.isBuffering, true);
    assert.equal(controller.stageBufferStartMs, 4_000);
    assert.equal(typeof scheduledRecovery, "function");

    await controller.seek(10_000, { allowConcurrentTick: false });

    assert.equal(controller.state.currentMs, 10_000);
    assert.equal(controller.state.isBuffering, false);
    assert.equal(controller.stageBufferStartMs, null);
    assert.deepEqual(tickPositions, [10_000]);
    assert.equal(clockStarts, 1, "the buffered seek resumes the clock at its new position");
    assert.deepEqual(clearedTimers, [4_001]);

    const lateCanplayResult = await controller.resumeStageAfterShortBuffer(activeVideo, "canplay");
    scheduledRecovery();
    await Promise.resolve();

    assert.equal(lateCanplayResult, false);
    assert.equal(staleRecoveryCalls, 0, "the stale timer must not start recovery at 4000ms");
    assert.equal(controller.state.currentMs, 10_000);
    assert.equal(controller.state.isBuffering, false);
    assert.equal(controller.stageBufferStartMs, null);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test("Play does not start the master clock when the active video rejects play", async () => {
  const entry = createSceneEntry({ rowId: "autoplay-blocked", startMs: 0, endMs: 8_000 });
  const activeVideo = new FakeVideo({ src: entry.videoSrc, currentTime: 0 });
  const { controller } = createStageController({
    activeVideo,
    resolveSourceState: () => ({ sourceMs: 0, playbackRate: 1, isHoldActive: false }),
  });
  activeVideo.dataset.entryKey = controller.buildStageEntryIdentity(entry);
  activeVideo.dataset.rowId = entry.rowId;
  activeVideo.dataset.mediaSourceGeneration = String(controller.getMediaSourceGeneration(entry.videoSrc));
  let videoPlayCalls = 0;
  activeVideo.play = () => {
    videoPlayCalls += 1;
    const error = new Error("play() failed because the user did not interact");
    error.name = "NotAllowedError";
    return Promise.reject(error);
  };
  controller.state.isPlaying = false;
  controller.state.currentMs = 0;
  controller.state.totalDurationMs = 8_000;
  controller.sync = () => {};
  controller.initAudioContext = () => null;
  controller.getOrCreateBackgroundAudioElement = () => null;
  controller.prepareStageSlotsAtMs = async () => true;
  controller.getEntryAtMs = () => entry;
  controller.syncAudio = async () => true;
  controller.applySceneBackground = () => {};
  controller.applySceneMediaScale = () => {};
  controller.pauseMediaForStageBuffering = () => { activeVideo.pause(); };
  let clockStarts = 0;
  controller.startClock = () => { clockStarts += 1; };
  controller.deps.setPodcastVideoStatus = () => {};
  controller.deps.updatePodcastVideoTransportUi = () => {};

  const started = await controller.play(0, { prepare: false });

  assert.equal(started, false);
  assert.equal(videoPlayCalls, 1);
  assert.equal(clockStarts, 0, "the software clock cannot run without the visible video");
  assert.equal(controller.state.isPlaying, false);
});

test("a stale Play preparation cannot clear isPreparing for the newer Play request", async () => {
  const controller = new PodcasterPlaybackController();
  const firstPreparation = createDeferred();
  const secondPreparation = createDeferred();
  let preparationCalls = 0;
  let clockStarts = 0;
  controller.state.session = { id: "play-preparation-race" };
  controller.state.currentMs = 0;
  controller.state.totalDurationMs = 8_000;
  controller.sync = () => {};
  controller.initAudioContext = () => null;
  controller.getOrCreateBackgroundAudioElement = () => null;
  controller.prepareSessionMedia = () => {
    preparationCalls += 1;
    return preparationCalls === 1
      ? firstPreparation.promise
      : secondPreparation.promise;
  };
  controller.preparePlaybackRange = async () => true;
  controller.prepareStageSlotsAtMs = async () => true;
  controller.getEntryAtMs = () => null;
  controller.syncAudio = async () => true;
  controller.prewarmTimelineStageVideos = async () => true;
  controller.syncStageMediaMotionPlaybackState = () => {};
  controller.startClock = () => { clockStarts += 1; };
  controller.stopClock = () => {};
  controller.deps = {
    setPodcastVideoStatus: () => {},
    updatePodcastVideoTransportUi: () => {},
  };

  const firstPlay = controller.play(0);
  await Promise.resolve();
  assert.equal(controller.state.isPreparing, true);

  controller.pause();
  const secondPlay = controller.play(0);
  await Promise.resolve();
  assert.equal(preparationCalls, 2);
  assert.equal(controller.state.isPreparing, true);

  firstPreparation.resolve(true);
  assert.equal(await firstPlay, false);
  assert.equal(
    controller.state.isPreparing,
    true,
    "the obsolete Play finally block cannot hide the active Play preparation",
  );

  secondPreparation.resolve(true);
  assert.equal(await secondPlay, true);
  assert.equal(controller.state.isPreparing, false);
  assert.equal(controller.state.isPlaying, true);
  assert.equal(clockStarts, 1);
});

test("a late Play1 completion after Pause and successful Play2 cannot stop playback", async () => {
  const controller = new PodcasterPlaybackController();
  const firstAudioSync = createDeferred();
  let audioSyncCalls = 0;
  let clockStarts = 0;
  controller.state.session = { id: "play-completion-race" };
  controller.state.currentMs = 0;
  controller.state.totalDurationMs = 8_000;
  controller.sync = () => {};
  controller.initAudioContext = () => null;
  controller.getOrCreateBackgroundAudioElement = () => null;
  controller.prepareStageSlotsAtMs = async () => true;
  controller.getEntryAtMs = () => null;
  controller.syncAudio = () => {
    audioSyncCalls += 1;
    return audioSyncCalls === 1 ? firstAudioSync.promise : Promise.resolve(true);
  };
  controller.prewarmTimelineStageVideos = async () => true;
  controller.syncStageMediaMotionPlaybackState = () => {};
  controller.startClock = () => { clockStarts += 1; };
  controller.stopClock = () => {};
  controller.deps = {
    setPodcastVideoStatus: () => {},
    updatePodcastVideoTransportUi: () => {},
  };

  const firstPlay = controller.play(0, { prepare: false });
  await Promise.resolve();
  assert.equal(audioSyncCalls, 1, "Play1 must be waiting in its final media synchronization");

  controller.pause();
  const secondPlay = controller.play(0, { prepare: false });
  assert.equal(await secondPlay, true);
  assert.equal(controller.state.isPlaying, true);
  assert.equal(clockStarts, 1, "only Play2 may start the clock");

  firstAudioSync.resolve(true);
  assert.equal(await firstPlay, false);
  assert.equal(
    controller.state.isPlaying,
    true,
    "the obsolete Play1 completion cannot overwrite Play2's playing state",
  );
  assert.equal(clockStarts, 1);
});

test("a ready blur backdrop on the same entry and frame skips frame readiness waits", async () => {
  const entry = createSceneEntry({ rowId: "blur-ready", startMs: 0, endMs: 8_000 });
  const backdrop = new FakeVideo({
    src: entry.videoSrc,
    duration: 8,
    currentTime: 2,
    readyState: HTMLMediaElement.HAVE_ENOUGH_DATA,
  });
  const controller = new PodcasterPlaybackController();
  controller.els = { podcastActiveSpeakerBackdropVideo: backdrop };
  controller.state.session = { id: "blur-session" };
  controller.state.isPlaying = true;
  controller.deps = {
    ensureTimelineClipsByRowId: () => ({
      [entry.rowId]: { visualLayoutMode: "blur-backdrop" },
    }),
  };
  backdrop.dataset.entryKey = controller.buildStageEntryIdentity(entry);
  backdrop.dataset.rowId = entry.rowId;
  backdrop.dataset.src = entry.videoSrc;
  backdrop.dataset.mediaSourceGeneration = String(controller.getMediaSourceGeneration(entry.videoSrc));
  let sourceLoads = 0;
  controller.setStageVideoSourceForElement = async () => {
    sourceLoads += 1;
    return true;
  };
  let frameCallbackRequests = 0;
  backdrop.requestVideoFrameCallback = (callback) => {
    frameCallbackRequests += 1;
    queueMicrotask(() => callback(performance.now(), {}));
    return frameCallbackRequests;
  };
  backdrop.cancelVideoFrameCallback = () => {};

  assert.equal(await controller.prepareBackdropForEntry(entry, 0, 2), true);
  assert.equal(await controller.prepareBackdropForEntry(entry, 0, 2), true);
  assert.equal(sourceLoads, 0, "the already prepared source must not be assigned again");
  assert.equal(
    frameCallbackRequests,
    0,
    "the same composited frame must not wait on requestVideoFrameCallback again",
  );
});

test("a signed asset renews once after a transient HTTP 500", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const fetchUrls = [];
  const forceRefreshValues = [];
  let invalidations = 0;
  globalThis.fetch = async (url) => {
    fetchUrls.push(String(url));
    if (fetchUrls.length === 1) return new Response("temporary", { status: 500 });
    return new Response(new Blob(["video-after-retry"], { type: "video/mp4" }), { status: 200 });
  };

  let resolved = "";
  try {
    const controller = new PodcasterPlaybackController();
    controller.state.config = { mediaLoadMode: "streaming" };
    controller.deps = {
      resolveAuthorizedAssetMetadata: async (_proxyUrl, options = {}) => {
        forceRefreshValues.push(options.forceRefresh === true);
        return {
          url: `https://signed.test/transient-${forceRefreshValues.length}.mp4`,
          expiresAt: Date.now() + 300_000,
          storagePath: "podcaster/sessions/s500/video.mp4",
        };
      },
      invalidateAuthorizedAssetUrl: () => { invalidations += 1; },
    };
    const proxyUrl = "/api/assets/proxy-media?storagePath=podcaster%2Fsessions%2Fs500%2Fvideo.mp4";

    resolved = await controller.getBlobUrl(proxyUrl, { persistent: true });

    assert.match(resolved, /^blob:/);
    assert.deepEqual(fetchUrls, [
      "https://signed.test/transient-1.mp4",
      "https://signed.test/transient-2.mp4",
    ]);
    assert.deepEqual(forceRefreshValues, [false, true]);
    assert.equal(invalidations, 1);
  } finally {
    if (resolved.startsWith("blob:")) URL.revokeObjectURL(resolved);
    globalThis.fetch = originalFetch;
  }
});

test("a confirmed signed-asset 404 is permanent and is not renewed", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const fetchUrls = [];
  const forceRefreshValues = [];
  let invalidations = 0;
  let staleMarks = 0;
  globalThis.fetch = async (url) => {
    fetchUrls.push(String(url));
    return new Response("not found", { status: 404 });
  };

  try {
    const controller = new PodcasterPlaybackController();
    controller.state.config = { mediaLoadMode: "streaming" };
    controller.deps = {
      resolveAuthorizedAssetMetadata: async (_proxyUrl, options = {}) => {
        forceRefreshValues.push(options.forceRefresh === true);
        return {
          url: "https://signed.test/permanent-404.mp4",
          expiresAt: Date.now() + 300_000,
          storagePath: "podcaster/sessions/s404/missing.mp4",
        };
      },
      invalidateAuthorizedAssetUrl: () => { invalidations += 1; },
      markStaleProxyMediaUrl: () => { staleMarks += 1; },
    };
    const proxyUrl = "/api/assets/proxy-media?storagePath=podcaster%2Fsessions%2Fs404%2Fmissing.mp4";

    const resolved = await controller.getBlobUrl(proxyUrl, { persistent: true });

    assert.equal(resolved, "");
    assert.deepEqual(fetchUrls, ["https://signed.test/permanent-404.mp4"]);
    assert.deepEqual(forceRefreshValues, [false]);
    assert.equal(invalidations, 0);
    assert.equal(staleMarks, 1);
    assert.equal(controller.getBlobUrlSync(proxyUrl), "", "404 remains a permanent negative cache entry");

    const secondResolved = await controller.getBlobUrl(proxyUrl, { persistent: true });
    assert.equal(secondResolved, "");
    assert.deepEqual(fetchUrls, ["https://signed.test/permanent-404.mp4"]);
    assert.deepEqual(forceRefreshValues, [false]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a near-expiry signed alias derived from raw Firebase is invalidated and renewed", async () => {
  const controller = new PodcasterPlaybackController();
  controller.state.config = { mediaLoadMode: "streaming" };
  const resolverSources = [];
  const invalidatedSources = [];
  let resolutionCount = 0;
  controller.deps = {
    resolveAuthorizedAssetMetadata: async (resolverSource) => {
      resolutionCount += 1;
      resolverSources.push(String(resolverSource));
      return {
        url: `https://signed.test/near-expiry-${resolutionCount}.mp4`,
        expiresAt: Date.now() + (resolutionCount === 1 ? 30_000 : 300_000),
        storagePath: "podcaster/sessions/expiry/video.mp4",
      };
    },
    invalidateAuthorizedAssetUrl: (resolverSource) => {
      invalidatedSources.push(String(resolverSource));
    },
  };
  const rawFirebaseUrl = "https://firebasestorage.googleapis.com/v0/b/example/o/podcaster%2Fsessions%2Fexpiry%2Fvideo.mp4?alt=media";

  const first = await controller.getBlobUrl(rawFirebaseUrl);
  const firstAlias = controller.authorizedAssetMetadataBySource.get(rawFirebaseUrl);
  const second = await controller.getBlobUrl(rawFirebaseUrl);

  assert.equal(first, "https://signed.test/near-expiry-1.mp4");
  assert.equal(firstAlias?.url, first);
  assert.ok(Number(firstAlias?.expiresAt || 0) <= Date.now() + 60_000);
  assert.equal(second, "https://signed.test/near-expiry-2.mp4");
  assert.equal(resolutionCount, 2);
  assert.equal(new Set(resolverSources).size, 1, "both resolutions use the canonical proxy alias");
  assert.match(resolverSources[0], /\/api\/assets\/proxy-media\?storagePath=/);
  assert.deepEqual(invalidatedSources, [resolverSources[0]]);
  assert.equal(controller.blobCache.get(rawFirebaseUrl), second);
  assert.equal(controller.authorizedAssetMetadataBySource.get(rawFirebaseUrl)?.url, second);
});

test("a pending dialogue canplay is blocked by buffering and starts only in coordinated recovery", async () => {
  const rowId = "dialogue-buffer";
  const entry = createSceneEntry({ rowId, startMs: 0, endMs: 8_000 });
  const audioClip = {
    downloadUrl: "https://cdn.example.test/dialogue-buffer.mp3",
    durationSec: 8,
  };
  const audio = new FakeVideo({ duration: 8, readyState: 0, autoReady: false });
  audio.tagName = "AUDIO";
  audio.dataset.initialized = "true";
  const controller = new PodcasterPlaybackController();
  controller.state.session = { id: "dialogue-buffer-session" };
  controller.state.isPlaying = true;
  controller.state.isBuffering = false;
  controller.dialoguePlayers[rowId] = audio;
  controller.dialogueAudioSourceKeys[rowId] = controller.resolveAudioSourceKey(audioClip);
  controller.dialogueAudioActivePrepareSignature = `${rowId}|0|${rowId}`;
  controller.dialogueAudioActivePrepareAtMs = 1_000;
  controller.deps = {
    buildTimelineRuntimeEntries: () => [entry],
    getPodcastVideoConfig: () => ({
      geminiDialogueTrack: {
        enabled: true,
        segments: [{ rowId, startMs: 0, durationMs: 8_000, trimInMs: 0, trimOutMs: 8_000 }],
      },
    }),
    resolveDialogueAudioForRow: () => audioClip,
    resolveDialogueAudioPlaybackRate: () => 1,
    resolveTimelineClipMix: () => ({ voiceVolume: 1 }),
  };
  controller.syncBackgroundMusic = async () => {};

  await controller.syncAudio(1_000, 1);
  assert.equal(audio.playCount, 0);
  assert.ok(audio.dataset.pendingPlayIntent, "canplay must be pending before media readiness");

  controller.state.isBuffering = true;
  audio.readyState = HTMLMediaElement.HAVE_ENOUGH_DATA;
  audio.dispatch("canplay");
  await Promise.resolve();
  assert.equal(audio.playCount, 0, "late canplay cannot bypass stage buffering");
  assert.equal(audio.paused, true);

  await controller.syncAudio(1_000, 1, { allowDuringBufferRecovery: true });
  await Promise.resolve();
  assert.equal(audio.playCount, 1, "coordinated recovery is allowed to start the dialogue");
  assert.equal(audio.paused, false);
  assert.equal(audio.dataset.pendingPlayIntent, "");
});

test("blur backdrop mirrors an intermediate hold and the foreground playback rate", () => {
  const entry = createSceneEntry({ rowId: "blur-hold", startMs: 0, endMs: 8_000 });
  const foreground = new FakeVideo({ src: entry.videoSrc, duration: 8, currentTime: 2 });
  const backdrop = new FakeVideo({ src: entry.videoSrc, duration: 8, currentTime: 0 });
  foreground.playbackRate = 1.875;
  backdrop.paused = false;
  const controller = new PodcasterPlaybackController();
  controller.els = {
    podcastActiveSpeakerVideo: foreground,
    podcastActiveSpeakerBackdropVideo: backdrop,
  };
  controller.state.session = { id: "blur-hold-session" };
  controller.state.isPlaying = true;
  controller.deps = {
    ensureTimelineClipsByRowId: () => ({
      [entry.rowId]: { visualLayoutMode: "blur-backdrop" },
    }),
    getPlaybackSpeed: () => 1.25,
  };

  controller.syncBackdrop(entry, 0, 2, {
    isHoldActive: true,
    playbackRate: 1.5,
  });

  assert.equal(backdrop.currentTime, 2);
  assert.equal(backdrop.paused, true, "the backdrop freezes with the foreground hold");
  assert.equal(backdrop.playbackRate, foreground.playbackRate);
  assert.equal(backdrop.hidden, false);
  assert.equal(foreground.classList.contains("is-blur-backdrop-foreground"), true);
});

test("switching sessions invalidates pending dialogue and music preparation from the old session", { concurrency: false }, async () => {
  const originalDocument = globalThis.document;
  const createdProbes = [];
  globalThis.document = {
    createElement(tagName) {
      const probe = new FakeVideo({ readyState: HTMLMediaElement.HAVE_ENOUGH_DATA });
      probe.tagName = String(tagName || "").toUpperCase();
      createdProbes.push(probe);
      return probe;
    },
  };

  const dialogueGate = createDeferred();
  const musicGate = createDeferred();
  try {
    const sessionA = { id: "session-a", updatedAt: "a", script: { rows: [{ id: "row-a" }] } };
    const sessionB = { id: "session-b", updatedAt: "b", script: { rows: [] } };
    const entryA = createSceneEntry({ rowId: "row-a", videoSrc: "", startMs: 0, endMs: 8_000 });
    const dialogueClipA = {
      kind: "dialogue-a",
      downloadUrl: "https://cdn.example.test/session-a-dialogue.mp3",
    };
    const musicClipA = {
      kind: "music-a",
      sourceUrl: "https://cdn.example.test/session-a-music.mp3",
    };
    const startedKinds = [];
    let insertedPlayersA = 0;
    const controller = new PodcasterPlaybackController();
    controller.state.session = sessionA;
    controller.deps = {
      buildTimelineRuntimeEntries: (session) => session?.id === sessionA.id ? [entryA] : [],
      resolveDialogueAudioForRow: (session) => session?.id === sessionA.id ? dialogueClipA : null,
      getPanelMontageMusicConfig: (session) => session?.id === sessionA.id
        ? { sourceType: "upload", sourceItems: [musicClipA] }
        : { sourceType: "none" },
      getTimelineTotalDurationMs: () => 8_000,
      getPodcastVideoConfig: () => ({}),
    };
    controller.resolveDialoguePlaybackAudioSource = (item) => {
      startedKinds.push(item?.kind);
      return item?.kind === "dialogue-a" ? dialogueGate.promise : musicGate.promise;
    };
    controller.getOrCreateDialoguePlayer = () => {
      insertedPlayersA += 1;
      const player = new FakeVideo({ readyState: HTMLMediaElement.HAVE_ENOUGH_DATA });
      player.tagName = "AUDIO";
      return player;
    };

    const preparationA = controller.prepareSessionMedia({ session: sessionA });
    for (let index = 0; index < 20 && startedKinds.length < 2; index += 1) {
      await Promise.resolve();
    }
    assert.deepEqual(new Set(startedKinds), new Set(["dialogue-a", "music-a"]));

    controller.sync(sessionB, {});
    dialogueGate.resolve("blob:session-a-dialogue");
    musicGate.resolve("blob:session-a-music");

    await assert.rejects(preparationA, (error) => error?.name === "AbortError");
    assert.equal(controller.state.session, sessionB);
    assert.equal(insertedPlayersA, 0, "a late dialogue resolution cannot recreate an A player");
    assert.equal(createdProbes.length, 0, "late A music cannot mount a source probe after session B is active");
    assert.equal(controller.dialoguePlayers["row-a"], undefined);
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});

test("video-to-image lookahead decodes into the alternate DOM image before the boundary", async () => {
  const currentEntry = createSceneEntry({
    rowId: "lookahead-video",
    videoSrc: "https://cdn.example.test/lookahead-video.mp4",
    startMs: 0,
    endMs: 8_000,
  });
  const nextEntry = {
    ...createSceneEntry({
      rowId: "lookahead-image",
      videoSrc: "https://cdn.example.test/lookahead-image.png",
      startMs: 8_000,
      endMs: 16_000,
    }),
    isImageClip: true,
    type: "image",
    clip: { type: "image", trimInMs: 0, trimOutMs: 8_000, sourceDurationMs: 8_000 },
  };
  const activeVideo = new FakeVideo({ src: currentEntry.videoSrc });
  const inactiveVideo = new FakeVideo({ readyState: 0 });
  const { controller } = createStageController({ activeVideo, inactiveVideo });
  activeVideo.dataset.entryKey = controller.buildStageEntryIdentity(currentEntry);
  controller.state.session = { id: "image-lookahead-session" };
  const primaryImage = {
    dataset: {},
    style: createFakeStyle(),
    hidden: true,
    complete: false,
    naturalWidth: 0,
    naturalHeight: 0,
    src: "",
  };
  const alternateImage = {
    dataset: {},
    style: createFakeStyle(),
    hidden: true,
    complete: false,
    naturalWidth: 0,
    naturalHeight: 0,
    src: "",
  };
  controller.els.podcastActiveSpeakerImage = primaryImage;
  controller.els.podcastActiveSpeakerImageAlt = alternateImage;
  const mountedImages = [];
  controller.preloadImageSrc = async (source) => `blob:${source}`;
  controller.ensureStageImageReady = async (imageEl, resolvedSource, options = {}) => {
    mountedImages.push(imageEl);
    imageEl.src = resolvedSource;
    imageEl.dataset.src = options.sourceKey;
    imageEl.complete = true;
    imageEl.naturalWidth = 1280;
    imageEl.naturalHeight = 720;
    return resolvedSource;
  };

  const ready = await controller.preloadUpcomingStageSlot(currentEntry, [nextEntry]);

  assert.equal(ready, true);
  assert.deepEqual(mountedImages, [alternateImage]);
  assert.equal(alternateImage.dataset.src, nextEntry.videoSrc);
  assert.equal(alternateImage.src, `blob:${nextEntry.videoSrc}`);
  assert.equal(alternateImage.complete, true);
  assert.equal(alternateImage.hidden, false, "the real DOM slot is mounted for decode");
  assert.equal(alternateImage.style.visibility, "hidden");
  assert.equal(alternateImage.style.opacity, "0");
  assert.equal(primaryImage.hidden, true, "lookahead never reveals or replaces the current image slot");
});

test("a transient video error releases mediaRetrySrc so a later error can retry", async () => {
  const logicalSrc = "https://cdn.example.test/transient-stage.mp4";
  const assignedSrc = "https://signed.test/transient-stage.mp4";
  const video = new FakeVideo({ readyState: HTMLMediaElement.HAVE_ENOUGH_DATA });
  const controller = new PodcasterPlaybackController();
  controller.els = {};
  controller.deps = { podcastVideoState: {} };
  let retryAttempts = 0;
  controller.invalidateAuthorizedAssetSource = () => {};
  controller.invalidateBlobUrl = async () => {};
  controller.getBlobUrl = async () => {
    retryAttempts += 1;
    return "";
  };
  controller.assignStageVideoElementSource(video, assignedSrc, {
    logicalSrc,
    mode: "direct",
  });
  const flushRetry = async () => {
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
  };

  video.dispatch("error");
  await flushRetry();
  assert.equal(retryAttempts, 1);
  assert.equal(video.dataset.mediaRetrySrc, undefined);

  video.dispatch("error");
  await flushRetry();
  assert.equal(retryAttempts, 2, "a later transient error must start a fresh retry");
  assert.equal(video.dataset.mediaRetrySrc, undefined);
});

test("a deduplicated prepareSessionMedia forwards N/M progress to a second listener", async () => {
  const entry = createSceneEntry({ rowId: "progress-video", startMs: 0, endMs: 8_000 });
  const session = { id: "progress-session", script: { rows: [{ id: entry.rowId }] } };
  const hydration = createDeferred();
  const firstProgress = [];
  const secondProgress = [];
  let hydrationCalls = 0;
  const controller = new PodcasterPlaybackController();
  controller.state.session = session;
  controller.deps = {
    buildTimelineRuntimeEntries: () => [entry],
    resolveDialogueAudioForRow: () => null,
    getPanelMontageMusicConfig: () => ({ sourceType: "none" }),
  };
  controller.getBlobUrl = async (source) => {
    hydrationCalls += 1;
    const resolved = await hydration.promise;
    controller.blobCache.set(source, resolved);
    return resolved;
  };

  const firstPreparation = controller.prepareSessionMedia({
    onProgress: (progress) => firstProgress.push(progress),
  });
  const secondPreparation = controller.prepareSessionMedia({
    onProgress: (progress) => secondProgress.push(progress),
  });

  assert.deepEqual(
    secondProgress.map(({ state, completed, total }) => ({ state, completed, total })),
    [{ state: "loading", completed: 0, total: 1 }],
  );
  hydration.resolve(`blob:${entry.videoSrc}`);
  await Promise.all([firstPreparation, secondPreparation]);

  assert.equal(hydrationCalls, 1, "the preparation itself remains deduplicated");
  assert.ok(secondProgress.some((progress) => progress.state === "loading"
    && progress.completed === 1
    && progress.total === 1));
  assert.deepEqual(
    (({ state, completed, total }) => ({ state, completed, total }))(secondProgress.at(-1)),
    { state: "ready", completed: 1, total: 1 },
  );
  assert.deepEqual(
    (({ state, completed, total }) => ({ state, completed, total }))(firstProgress.at(-1)),
    { state: "ready", completed: 1, total: 1 },
  );
});

test("preloadImageSrc renews a signed image once and caches the successful retry", { concurrency: false }, async () => {
  const originalImage = globalThis.Image;
  const assignedSources = [];
  class RetryImage {
    set src(value) {
      this._src = String(value || "");
      assignedSources.push(this._src);
      queueMicrotask(() => {
        if (this._src.endsWith("signed-1.png")) this.onerror?.(new Error("expired"));
        else this.onload?.();
      });
    }
    get src() { return this._src || ""; }
  }
  globalThis.Image = RetryImage;

  try {
    const controller = new PodcasterPlaybackController();
    let resolutions = 0;
    let invalidations = 0;
    controller.deps = {
      resolveAuthorizedAssetMetadata: async () => {
        resolutions += 1;
        return {
          url: `https://signed.test/signed-${resolutions}.png`,
          expiresAt: Date.now() + 300_000,
          storagePath: "podcaster/sessions/image-retry/frame.png",
        };
      },
      invalidateAuthorizedAssetUrl: () => { invalidations += 1; },
    };
    const imageProxy = "/api/assets/proxy-image?storagePath=podcaster%2Fsessions%2Fimage-retry%2Fframe.png";

    const firstPreload = controller.preloadImageSrc(imageProxy);
    const resolved = await firstPreload;

    assert.equal(resolved, "https://signed.test/signed-2.png");
    assert.deepEqual(assignedSources, [
      "https://signed.test/signed-1.png",
      "https://signed.test/signed-2.png",
    ]);
    assert.equal(resolutions, 2);
    assert.equal(invalidations, 1);

    const sourcesAfterRetry = [...assignedSources];
    const resolutionsAfterRetry = resolutions;
    const invalidationsAfterRetry = invalidations;
    const cachedPreload = controller.preloadImageSrc(imageProxy);

    assert.equal(cachedPreload, firstPreload, "the refreshed preload promise remains cached");
    assert.equal(await cachedPreload, resolved);
    assert.deepEqual(assignedSources, sourcesAfterRetry, "the cache hit must not create another Image probe");
    assert.equal(resolutions, resolutionsAfterRetry, "the cache hit must not resolve another signed URL");
    assert.equal(invalidations, invalidationsAfterRetry);
  } finally {
    if (originalImage === undefined) delete globalThis.Image;
    else globalThis.Image = originalImage;
  }
});

test("a late IndexedDB read from the old session revokes its object URL and never caches it", { concurrency: false }, async () => {
  const originalIndexedDb = globalThis.indexedDB;
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  let openRequest = null;
  let readRequest = null;
  const revokedUrls = [];
  globalThis.indexedDB = {
    open() {
      openRequest = {};
      return openRequest;
    },
  };

  try {
    const sessionA = { id: "local-read-a", script: { rows: [] } };
    const sessionB = { id: "local-read-b", script: { rows: [] } };
    const controller = new PodcasterPlaybackController();
    controller.state.session = sessionA;
    controller.deps = {
      getPodcastVideoConfig: () => ({}),
      getTimelineTotalDurationMs: () => 0,
      buildTimelineRuntimeEntries: () => [],
      resolveDialogueAudioForRow: () => null,
      getPanelMontageMusicConfig: () => ({ sourceType: "none" }),
    };
    URL.createObjectURL = () => {
      controller.sync(sessionB, {});
      return "blob:late-old-session";
    };
    URL.revokeObjectURL = (url) => { revokedUrls.push(String(url)); };

    const pendingRead = controller.resolveLocalMediaObjectUrl("late-session-a");
    await Promise.resolve();
    assert.equal(typeof openRequest?.onsuccess, "function");
    const database = {
      transaction() {
        return {
          objectStore() {
            return {
              get() {
                readRequest = {};
                return readRequest;
              },
            };
          },
        };
      },
      close() {},
    };
    openRequest.result = database;
    openRequest.onsuccess();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(typeof readRequest?.onsuccess, "function");
    readRequest.result = { blob: new Blob(["late-audio"], { type: "audio/mpeg" }) };
    readRequest.onsuccess();

    const resolved = await pendingRead;

    assert.equal(resolved, "");
    assert.equal(controller.state.session, sessionB);
    assert.deepEqual(revokedUrls, ["blob:late-old-session"]);
    assert.equal(controller.blobCache.has("podcaster-local-media:late-session-a"), false);
  } finally {
    if (originalIndexedDb === undefined) delete globalThis.indexedDB;
    else globalThis.indexedDB = originalIndexedDb;
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  }
});

test("playPodcastStageVideo marks stale media only for a confirmed 404, never for 403", () => {
  const studioSource = readFileSync(
    new URL("../public/podcaster/podcaster.js", import.meta.url),
    "utf8",
  );
  const functionStart = studioSource.indexOf("async function playPodcastStageVideo(options = {})");
  const functionEnd = studioSource.indexOf("function updatePodcastVideoTransportUi()", functionStart);
  assert.ok(functionStart >= 0 && functionEnd > functionStart);
  const functionBody = studioSource.slice(functionStart, functionEnd);
  const forbiddenAt = functionBody.indexOf("if (fallbackResponse.status === 403)");
  const missingAt = functionBody.indexOf("if (fallbackResponse.status === 404)", forbiddenAt);
  const successAt = functionBody.indexOf("if (fallbackResponse.ok)", missingAt);
  assert.ok(forbiddenAt >= 0 && missingAt > forbiddenAt && successAt > missingAt);
  const forbiddenBranch = functionBody.slice(forbiddenAt, missingAt);
  const missingBranch = functionBody.slice(missingAt, successAt);

  assert.doesNotMatch(forbiddenBranch, /markStale(?:DialogueVideoSource|ProxyMediaUrl)/);
  assert.match(forbiddenBranch, /forceAuthorizedRefresh:\s*true/);
  assert.match(missingBranch, /markStaleDialogueVideoSource/);
  assert.match(missingBranch, /markStaleProxyMediaUrl/);
});
