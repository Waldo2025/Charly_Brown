import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PodcasterPlaybackController } from "../public/podcaster/podcaster-playback-controller.js";

const source = readFileSync(
  new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url),
  "utf8"
);

test("Stop always resets the montage cursor to the timeline origin", () => {
  const stopBlock = source.slice(source.indexOf("async stop(opts = {})"), source.indexOf("seekTo(el, seconds)"));
  assert.match(stopBlock, /const stopTargetMs = 0;/);
  assert.doesNotMatch(stopBlock, /sceneStartMs|shouldReturnToTimelineStart/);
  assert.match(stopBlock, /pendingTimelineSeekTick = null;/);
  assert.doesNotMatch(stopBlock, /this\.state\.isTickProcessing = false;/);
});

test("an async clock tick cannot restore an old playhead after Stop", async () => {
  let releaseVideoSync;
  const videoSyncGate = new Promise((resolve) => { releaseVideoSync = resolve; });
  const emittedTimes = [];
  const controller = new PodcasterPlaybackController();
  controller.state.session = { id: "session-a" };
  controller.state.totalDurationMs = 10_000;
  controller.state.isPlaying = true;
  controller.playheadRevision = 1;
  controller.deps = {
    podcastVideoState: {},
    buildTimelineRuntimeEntries: () => [],
    getPlaybackSpeed: () => 1,
    syncPodcastTimelinePlayhead: () => {},
    updatePodcastVideoTransportUi: () => {},
    setPodcastVideoStatus: () => {},
  };
  controller.ensureDialogueReadyAtMs = async () => true;
  controller.syncVideo = async () => videoSyncGate;
  controller.syncAudio = async () => true;
  controller.on("timeupdate", ({ currentMs }) => emittedTimes.push(currentMs));

  const staleTick = controller.tick(5_000, { playheadRevision: 1 });
  await Promise.resolve();
  await controller.stop();
  releaseVideoSync();
  await staleTick;

  assert.equal(controller.state.currentMs, 0);
  assert.deepEqual(emittedTimes, []);
});

test("explicit background fades apply the timeline gain directly", () => {
  assert.match(source, /const hasExplicitBackgroundFade = segmentFadeInMs > 0 \|\| segmentFadeOutMs > 0;/);
  assert.match(
    source,
    /if \(hasExplicitBackgroundFade\) \{[\s\S]*?gain\.setValueAtTime\(clampedFinalVolume, now\);[\s\S]*?\} else \{/
  );
  const explicitFadeBlock = source.slice(
    source.indexOf("if (hasExplicitBackgroundFade)"),
    source.indexOf("} else {", source.indexOf("if (hasExplicitBackgroundFade)"))
  );
  assert.doesNotMatch(explicitFadeBlock, /setTargetAtTime/);
});
