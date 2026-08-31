import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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

function style() {
  return {
    setProperty(name, value) { this[name] = String(value); },
    removeProperty(name) { delete this[name]; },
  };
}

function classList() {
  const values = new Set();
  return {
    add: (...names) => names.forEach((name) => values.add(name)),
    remove: (...names) => names.forEach((name) => values.delete(name)),
    toggle(name, force) {
      if (force === true) values.add(name);
      else if (force === false) values.delete(name);
      else if (values.has(name)) values.delete(name);
      else values.add(name);
      return values.has(name);
    },
  };
}

function fakeVideo(src = "") {
  return {
    dataset: src ? { src } : {},
    style: style(),
    classList: classList(),
    hidden: false,
    paused: true,
    duration: 8,
    currentTime: 0,
    readyState: src ? HTMLMediaElement.HAVE_ENOUGH_DATA : 0,
    volume: 0,
    muted: true,
    playbackRate: 1,
    play() {
      this.paused = false;
      return Promise.resolve();
    },
    pause() { this.paused = true; },
  };
}

const outgoingSrc = "https://cdn.example.test/scene-a.mp4";
const incomingSrc = "https://cdn.example.test/scene-b.mp4";
const outgoing = fakeVideo(outgoingSrc);
outgoing.style.opacity = "1";
outgoing.style.visibility = "visible";
outgoing.currentTime = 7.8;
const incoming = fakeVideo();
incoming.hidden = true;
incoming.style.opacity = "0";
incoming.style.visibility = "hidden";

const videoState = { montageActive: true, stageVideoSlot: 0 };
const controller = new PodcasterPlaybackController();
controller.els = {
  podcastActiveSpeakerVideo: outgoing,
  podcastActiveSpeakerVideoAlt: incoming,
};
controller.state.isPlaying = true;
controller.state.session = {};
controller.state.audioTrack = { segments: [] };
controller.deps = {
  podcastVideoState: videoState,
  getPodcastVideoConfig: () => ({}),
  getPlaybackSpeed: () => 1,
  resolveTimelineClipMix: () => ({ videoVolume: 0 }),
  resolveSceneSourceStateAtTimelineMs: () => ({
    sourceMs: 0,
    playbackRate: 1,
    isHoldActive: false,
  }),
};
controller.applySceneBackground = () => {};
controller.applySceneMediaScale = () => {};

const mediaReady = deferred();
const frameReady = deferred();
const loadCalls = [];
const frameCalls = [];
controller.setStageVideoSourceForElement = (video, src, options = {}) => {
  loadCalls.push({ video, src, options });
  return mediaReady.promise.then(() => {
    video.dataset.src = src;
    video.readyState = HTMLMediaElement.HAVE_ENOUGH_DATA;
    return true;
  });
};
controller.waitForStageVideoFrameReady = (video, src) => {
  frameCalls.push({ video, src });
  return frameReady.promise;
};

const switchPromise = controller.syncStageSwitching({
  rowId: "scene-b",
  videoSrc: incomingSrc,
  startMs: 8_000,
  endMs: 16_000,
  durationMs: 8_000,
  mediaDurationMs: 8_000,
  clip: { trimInMs: 0, trimOutMs: 8_000, sourceDurationMs: 8_000 },
}, 8_000);

await Promise.resolve();
assert.equal(loadCalls.length, 1, "el cambio debe iniciar una sola hidratación");
assert.equal(loadCalls[0].video, incoming, "la hidratación debe ocurrir en el slot inactivo");
assert.equal(loadCalls[0].options.keepHidden, true, "el slot entrante debe cargar oculto");
assert.equal(outgoing.hidden, false, "el frame saliente debe permanecer visible mientras carga B");
assert.equal(outgoing.style.opacity, "1");
assert.equal(videoState.stageVideoSlot, 0, "no se debe conmutar antes de readiness");

mediaReady.resolve();
await Promise.resolve();
await Promise.resolve();
assert.equal(frameCalls.length, 1, "la carga de bytes debe esperar además un frame decodificado");
assert.equal(frameCalls[0].video, incoming);
assert.equal(outgoing.hidden, false, "el frame saliente sigue visible hasta frame-ready");
assert.equal(videoState.stageVideoSlot, 0);

frameReady.resolve(true);
await switchPromise;
assert.equal(videoState.stageVideoSlot, 1, "solo el slot listo puede hacerse activo");
assert.equal(incoming.hidden, false);
assert.equal(incoming.style.opacity, "1");
assert.equal(outgoing.hidden, true);
assert.equal(outgoing.style.opacity, "0");
assert.equal(outgoing.paused, true);

const controllerSource = readFileSync(
  new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url),
  "utf8",
);
const studioSource = readFileSync(
  new URL("../public/podcaster/podcaster.js", import.meta.url),
  "utf8",
);
const preloadStart = controllerSource.indexOf("preloadUpcomingStageSlot(currentEntry, upcomingEntries = [])");
const preloadEnd = controllerSource.indexOf("async preparePlaybackRange", preloadStart);
const preloadBody = controllerSource.slice(preloadStart, preloadEnd > preloadStart ? preloadEnd : undefined);
const preloadAssignAt = preloadBody.indexOf("setStageVideoSourceForElement(inactiveEl");
const preloadFrameAt = preloadBody.indexOf("waitForStageVideoFrameReady(inactiveEl");
assert.ok(preloadStart >= 0, "debe existir el helper de precarga adelantada");
assert.ok(preloadAssignAt >= 0, "la precarga debe hidratar el slot inactivo");
assert.match(preloadBody, /keepHidden:\s*true/);
assert.ok(
  preloadFrameAt > preloadAssignAt,
  "la precarga solo se considera lista después de obtener un frame decodificado",
);
assert.match(
  controllerSource,
  /this\.preloadUpcomingStageSlot\(entry, upcoming\);/,
  "el sync de video debe iniciar la precarga del siguiente slot",
);

assert.doesNotMatch(
  studioSource,
  /function (?:pause|stop)MontageBackgroundAudio\(/,
  "el audio de fondo debe conservar un único flujo en el controller",
);

console.log("Podcaster stage swap without black cut OK.");
