import test from "node:test";
import assert from "node:assert/strict";

class FakeAudio {
  constructor() {
    this.currentTime = 0;
    this.duration = 4;
    this.paused = true;
    this.volume = 1;
    this.playbackRate = 1;
    this.defaultPlaybackRate = 1;
    this.crossOrigin = "";
    this.src = "";
    this.dataset = {};
  }

  addEventListener() {}

  pause() {
    this.paused = true;
  }

  play() {
    this.paused = false;
    return Promise.resolve();
  }

  load() {}
}

test("syncAudio keeps Gemini dialogue playing during a frame hold", async () => {
  globalThis.window = globalThis.window || {};
  globalThis.Audio = FakeAudio;
  const { PodcasterPlaybackController } = await import("../public/podcaster/podcaster-playback-controller.js");

  const controller = new PodcasterPlaybackController();
  controller.state.session = { id: "session-hold-audio" };
  controller.state.isPlaying = true;
  controller.getBlobUrlSync = () => "blob:audio-row-1";
  controller.getBlobUrl = async () => "blob:audio-row-1";
  controller.seekTo = (audio, offsetSec) => {
    audio.currentTime = offsetSec;
  };
  controller.syncBackgroundMusic = async () => {};

  const entry = {
    rowId: "row-1",
    startMs: 0,
    endMs: 5000,
    effectiveDurationMs: 5000
  };
  const audioClip = {
    downloadUrl: "https://example.test/audio-row-1.wav",
    durationSec: 4
  };

  controller.deps = {
    getActiveSession: () => controller.state.session,
    buildTimelineRuntimeEntries: () => [entry],
    resolveSceneSourceStateAtTimelineMs: () => ({
      sourceMs: 1000,
      isHoldActive: true,
      playbackRate: 0,
      progressMs: 2000
    }),
    getPodcastVideoConfig: () => ({
      geminiDialogueTrack: {
        enabled: true,
        segments: [{
          rowId: "row-1",
          startMs: 0,
          durationMs: 4000,
          trimInMs: 0,
          trimOutMs: 4000
        }]
      }
    }),
    resolveDialogueAudioForRow: () => audioClip,
    resolveStorageAudioUrl: () => "https://example.test/audio-row-1.wav",
    resolveDialogueAudioPlaybackRate: () => 1,
    resolveTimelineClipMix: () => ({ voiceVolume: 1 }),
    ensureTimelineClipsByRowId: () => ({})
  };

  await controller.syncAudio(2000, 1);

  assert.ok(controller.dialoguePlayers["row-1"]);
  assert.equal(controller.dialoguePlayers["row-1"].paused, false);
  assert.equal(controller.dialoguePlayers["row-1"].currentTime, 2);
});

test("syncAudio re-seeks Gemini dialogue when audible drift exceeds visible tolerance", async () => {
  globalThis.window = globalThis.window || {};
  globalThis.Audio = FakeAudio;
  const { PodcasterPlaybackController } = await import("../public/podcaster/podcaster-playback-controller.js");

  const controller = new PodcasterPlaybackController();
  controller.state.session = { id: "session-drift-audio" };
  controller.state.isPlaying = true;
  controller.getBlobUrlSync = () => "blob:audio-row-1";
  controller.getBlobUrl = async () => "blob:audio-row-1";
  controller.seekTo = (audio, offsetSec) => {
    audio.currentTime = offsetSec;
  };
  controller.syncBackgroundMusic = async () => {};

  const drifted = new FakeAudio();
  drifted.src = "blob:audio-row-1";
  drifted.dataset.originalSrc = "blob:audio-row-1";
  drifted.dataset.initialized = "true";
  drifted.currentTime = 0.32;
  drifted.paused = false;
  controller.dialoguePlayers["row-1"] = drifted;
  controller.audioCache["row-1"] = drifted;

  controller.deps = {
    getActiveSession: () => controller.state.session,
    buildTimelineRuntimeEntries: () => [{
      rowId: "row-1",
      startMs: 0,
      endMs: 5000,
      effectiveDurationMs: 5000
    }],
    resolveSceneSourceStateAtTimelineMs: () => ({
      sourceMs: 500,
      isHoldActive: false,
      playbackRate: 1,
      progressMs: 500
    }),
    getPodcastVideoConfig: () => ({
      geminiDialogueTrack: {
        enabled: true,
        segments: [{
          rowId: "row-1",
          startMs: 0,
          durationMs: 4000,
          trimInMs: 0,
          trimOutMs: 4000
        }]
      }
    }),
    resolveDialogueAudioForRow: () => ({
      downloadUrl: "https://example.test/audio-row-1.wav",
      durationSec: 4
    }),
    resolveStorageAudioUrl: () => "https://example.test/audio-row-1.wav",
    resolveDialogueAudioPlaybackRate: () => 1,
    resolveTimelineClipMix: () => ({ voiceVolume: 1 }),
    ensureTimelineClipsByRowId: () => ({})
  };

  await controller.syncAudio(500, 1);

  assert.equal(controller.dialoguePlayers["row-1"].currentTime, 0.5);
});
