import assert from "node:assert/strict";

globalThis.window ??= {};
window.location ??= {
  origin: "https://example.test",
  href: "https://example.test/podcaster.html",
};
globalThis.HTMLMediaElement ??= {
  HAVE_METADATA: 1,
  HAVE_CURRENT_DATA: 2,
  HAVE_FUTURE_DATA: 3,
  HAVE_ENOUGH_DATA: 4,
};

const { PodcasterPlaybackController } = await import(
  "../public/podcaster/podcaster-playback-controller.js"
);

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function fakeImage({ src = "", ready = false, hidden = false } = {}) {
  return {
    dataset: src ? { src } : {},
    style: {
      opacity: hidden ? "0" : "1",
      visibility: hidden ? "hidden" : "visible",
      removeProperty(name) { delete this[name]; },
    },
    className: "",
    hidden,
    complete: ready,
    naturalWidth: ready ? 1280 : 0,
    naturalHeight: ready ? 720 : 0,
    _src: src,
    get src() { return this._src; },
    set src(value) { this._src = String(value || ""); },
    getAttribute(name) { return name === "src" ? (this._src || null) : null; },
  };
}

const primaryImage = fakeImage({
  src: "https://cdn.example.test/scene-a.png",
  ready: true,
});
const alternateImage = fakeImage({ hidden: true });
const activeVideo = {
  dataset: { src: "https://cdn.example.test/scene-a.mp4" },
  style: {},
  hidden: false,
};
const alternateVideo = {
  dataset: {},
  style: {},
  hidden: true,
};
const videoState = { montageActive: true, stageVideoSlot: 0 };
const imageBytesReady = deferred();
let hideVideoCalls = 0;

const controller = new PodcasterPlaybackController();
controller.els = {
  podcastActiveSpeakerVideo: activeVideo,
  podcastActiveSpeakerVideoAlt: alternateVideo,
  podcastActiveSpeakerImage: primaryImage,
  podcastActiveSpeakerImageAlt: alternateImage,
};
controller.state.isPlaying = true;
controller.state.session = { visualEffectsMap: {} };
controller.deps = {
  podcastVideoState: videoState,
  getActiveSession: () => controller.state.session,
  resolveSceneSourceStateAtTimelineMs: () => ({
    sourceMs: 0,
    playbackRate: 1,
    isHoldActive: false,
  }),
};
controller.applySceneBackground = () => {};
controller.applySceneMediaScale = () => {};
controller.applyEntryVisualStateToSurface = () => {};
controller.syncStageMediaMotionPlaybackState = () => {};
controller.hideAllVideos = () => { hideVideoCalls += 1; };
controller.preloadImageSrc = () => imageBytesReady.promise;
controller.ensureStageImageReady = async (image, resolvedSrc, options = {}) => {
  image.src = resolvedSrc;
  image.dataset.src = String(options.sourceKey || resolvedSrc);
  image.complete = true;
  image.naturalWidth = 1280;
  image.naturalHeight = 720;
  return resolvedSrc;
};

const incomingSrc = "https://cdn.example.test/scene-b.png";
const syncPromise = controller.syncStageSwitching({
  rowId: "scene-b",
  videoSrc: incomingSrc,
  isImageClip: true,
  startMs: 8_000,
  endMs: 16_000,
  durationMs: 8_000,
  clip: { type: "image", trimInMs: 0, trimOutMs: 8_000 },
}, 8_000);

const syncReturnedWithoutImage = await Promise.race([
  syncPromise.then(() => true),
  new Promise((resolve) => setTimeout(() => resolve(false), 30)),
]);
assert.equal(
  syncReturnedWithoutImage,
  true,
  "la rama de imagen no debe bloquear el tick esperando red o decodificación",
);
assert.equal(hideVideoCalls, 0, "el frame anterior debe conservarse mientras carga la imagen");
assert.equal(primaryImage.hidden, false);
assert.equal(alternateImage.style.opacity, "0", "la imagen entrante debe seguir transparente");
assert.equal(videoState.stageVideoSlot, 0);
assert.ok(controller.stageMachine.imageLoadingPromise, "la carga debe continuar en background");

imageBytesReady.resolve(incomingSrc);
await controller.stageMachine.imageLoadingPromise;
assert.equal(hideVideoCalls, 1, "los videos se ocultan solo cuando la imagen está lista");
assert.equal(primaryImage.hidden, true);
assert.equal(primaryImage.style.opacity, "0");
assert.equal(alternateImage.hidden, false);
assert.equal(alternateImage.style.opacity, "1");
assert.equal(alternateImage.dataset.src, incomingSrc);
assert.equal(videoState.stageVideoSlot, 1);

console.log("Podcaster image stage swap is nonblocking OK.");
