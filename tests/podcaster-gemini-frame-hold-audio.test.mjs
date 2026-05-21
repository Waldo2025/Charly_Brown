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
