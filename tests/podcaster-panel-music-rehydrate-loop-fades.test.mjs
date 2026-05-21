import test from "node:test";
import assert from "node:assert/strict";
import { createPodcasterPanelMusicApi } from "../public/podcaster/podcaster-panel-music.js";

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    }
  };
}

function createQuotaStorage(maxLen = Infinity) {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      const serialized = String(value);
      if (serialized.length > maxLen) {
        const error = new Error("Quota exceeded");
        error.name = "QuotaExceededError";
        throw error;
      }
      store.set(key, serialized);
    },
    removeItem(key) {
      store.delete(key);
    }
  };
}

test("rehydrates uploaded audio loop fades even when durationSec is missing", () => {
  const storage = createMemoryStorage();
  globalThis.localStorage = storage;
  globalThis.window = {
    localStorage: storage,
    AudioContext: null,
    webkitAudioContext: null
  };

  const activeSession = {
    id: "session-1",
    panelMusicConfig: null
  };

  const api = createPodcasterPanelMusicApi({
    resolveCurrentUid: () => "uid-1",
    getActiveSession: () => activeSession,
    getSessionRows: () => [],
    studioTimelineMinClipMs: 500,
    getTimelineTotalDurationMs: () => 7000,
    buildTimelineRuntimeEntries: () => [
      { startMs: 0, endMs: 3500 },
      { startMs: 3500, endMs: 7000 }
    ],
    upsertActiveSession: (mutator) => {
      Object.assign(activeSession, mutator(activeSession));
    },
    scheduleSessionLocalPersist: () => {},
    resolveStorageAudioUrl: () => "",
    getPlaybackController: () => ({ syncBackgroundMusic: () => {} }),
    getPodcastVideoState: () => ({ montageCursorMs: 0 }),
    renderPodcastVideoTimeline: () => {}
  });

  api.setPanelMusicUploadedTracks([{
    slotLabel: "Audio 1",
    name: "Audio 1",
    durationSec: 0,
    trimInMs: 0,
    trimOutMs: 3200,
    loopSettings: [
      { loopIndex: 0, trimInMs: 0, trimOutMs: 3200, fadeInMs: 500, fadeOutMs: 900 },
      { loopIndex: 1, trimInMs: 100, trimOutMs: 3000, fadeInMs: 700, fadeOutMs: 800 }
    ],
    enabledInSession: true
  }], { selectIndex: 0 });

  const restoredTrack = api.getPanelMusicUploadedTracks()[0];
  const segments = api.buildUploadedPanelMusicSegments(activeSession);

  assert.equal(api.getPanelMusicTrackDurationSec(restoredTrack), 3.2);
  assert.equal(segments.length, 2);
  assert.equal(segments[0].fadeInMs, 500);
  assert.equal(segments[0].fadeOutMs, 900);
  assert.equal(segments[1].fadeInMs, 700);
  assert.equal(segments[1].fadeOutMs, 800);
});

test("keeps loop segmentation stable after restart when decoded source duration is longer than the trimmed loop", () => {
  const storage = createMemoryStorage();
  globalThis.localStorage = storage;
  globalThis.window = {
    localStorage: storage,
    AudioContext: null,
    webkitAudioContext: null
  };

  const activeSession = {
    id: "session-1",
    panelMusicConfig: null
  };

  const api = createPodcasterPanelMusicApi({
    resolveCurrentUid: () => "uid-1",
    getActiveSession: () => activeSession,
    getSessionRows: () => [],
    studioTimelineMinClipMs: 500,
    getTimelineTotalDurationMs: () => 7000,
    buildTimelineRuntimeEntries: () => [
      { startMs: 0, endMs: 3500 },
      { startMs: 3500, endMs: 7000 }
    ],
    upsertActiveSession: (mutator) => {
      Object.assign(activeSession, mutator(activeSession));
    },
    scheduleSessionLocalPersist: () => {},
    resolveStorageAudioUrl: () => "",
    getPlaybackController: () => ({ syncBackgroundMusic: () => {} }),
    getPodcastVideoState: () => ({ montageCursorMs: 0 }),
    renderPodcastVideoTimeline: () => {}
  });

  api.setPanelMusicUploadedTracks([{
    slotLabel: "Audio 1",
    name: "Audio 1",
    durationSec: 120,
    trimInMs: 0,
    trimOutMs: 3200,
    loopSettings: [
      { loopIndex: 0, trimInMs: 0, trimOutMs: 3200, fadeInMs: 500, fadeOutMs: 900 },
      { loopIndex: 1, trimInMs: 100, trimOutMs: 3000, fadeInMs: 700, fadeOutMs: 800 }
    ],
    enabledInSession: true
  }], { selectIndex: 0 });

  const segments = api.buildUploadedPanelMusicSegments(activeSession);

  assert.equal(segments.length, 2);
  assert.equal(segments[0].loopIndex, 0);
  assert.equal(segments[1].loopIndex, 1);
  assert.equal(segments[0].fadeInMs, 500);
  assert.equal(segments[1].fadeInMs, 700);
});

test("persists compact panel music payload under quota pressure without losing loop fades", () => {
  const storage = createQuotaStorage(1900);
  globalThis.localStorage = storage;
  globalThis.window = {
    localStorage: storage,
    AudioContext: null,
    webkitAudioContext: null
  };

  const activeSession = {
    id: "session-1",
    panelMusicConfig: null
  };

  const deps = {
    resolveCurrentUid: () => "uid-1",
    getActiveSession: () => activeSession,
    getSessionRows: () => [],
    studioTimelineMinClipMs: 500,
    getTimelineTotalDurationMs: () => 7000,
    buildTimelineRuntimeEntries: () => [
      { startMs: 0, endMs: 3500 },
      { startMs: 3500, endMs: 7000 }
    ],
    upsertActiveSession: (mutator) => {
      Object.assign(activeSession, mutator(activeSession));
    },
    scheduleSessionLocalPersist: () => {},
    resolveStorageAudioUrl: () => "",
    getPlaybackController: () => ({ syncBackgroundMusic: () => {} }),
    getPodcastVideoState: () => ({ montageCursorMs: 0 }),
    renderPodcastVideoTimeline: () => {}
  };

  const api = createPodcasterPanelMusicApi(deps);
  api.setPanelMusicUploadedTracks([
    {
      slotLabel: "Audio 1",
      name: "Audio 1",
      durationSec: 3.2,
      trimInMs: 0,
      trimOutMs: 3200,
      loopSettings: [
        { loopIndex: 0, trimInMs: 0, trimOutMs: 3200, fadeInMs: 500, fadeOutMs: 900 }
      ],
      enabledInSession: true
    },
    {
      slotLabel: "Audio 2",
      name: "Audio 2",
      durationSec: 3.2,
      trimInMs: 100,
      trimOutMs: 3000,
      prompt: "x".repeat(5000),
      loopSettings: [
        { loopIndex: 1, trimInMs: 100, trimOutMs: 3000, fadeInMs: 700, fadeOutMs: 800 }
      ],
      enabledInSession: true
    }
  ], { selectIndex: 1 });

  assert.doesNotThrow(() => api.persistPanelMusicSettings());

  const storageKey = api.resolvePanelMusicStorageKey();
  const persisted = JSON.parse(storage.getItem(storageKey) || "{}");

  assert.equal(persisted.version, 2);
  assert.equal(persisted.selectedTrackRef?.slotLabel, "Audio 2");
  assert.equal(Array.isArray(persisted.trackLibrary?.uploadedTracks), true);
  assert.equal(persisted.trackLibrary.uploadedTracks[1].loopSettings[0].fadeInMs, 700);
  assert.equal(persisted.trackLibrary.uploadedTracks[1].prompt, "");
  assert.equal("track" in persisted, false);
  assert.equal("uploaded" in (persisted.trackLibrary || {}), false);

  const rehydratedApi = createPodcasterPanelMusicApi(deps);
  const rehydratedTrack = rehydratedApi.getPanelMusicUploadedTracks()[1];
  const rehydratedSelected = rehydratedApi.panelMusicState.track;

  assert.equal(rehydratedTrack.loopSettings[0].fadeInMs, 700);
  assert.equal(rehydratedTrack.loopSettings[0].fadeOutMs, 800);
  assert.equal(rehydratedSelected.slotLabel, "Audio 2");
});
