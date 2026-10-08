import assert from "node:assert/strict";
import test from "node:test";
import { createBrowserMontageCapture, nextBrowserMontageFrameIndex } from "../public/podcaster/podcaster-browser-export-capture.js";
import { PodcasterPlaybackController } from "../public/podcaster/podcaster-playback-controller.js";

test("manual canvas capture publishes only completed frames", () => {
  const rates = [];
  let frames = 0;
  const track = { requestFrame: () => frames++ };
  const stream = { getVideoTracks: () => [track] };
  const capture = createBrowserMontageCapture({ captureStream(rate) { rates.push(rate); return stream; } }, 24);
  assert.deepEqual(rates, [0]);
  assert.equal(frames, 0);
  capture.requestFrame();
  assert.equal(frames, 1);
});

test("browsers without requestFrame use one automatic capture stream", () => {
  const rates = [];
  let stops = 0;
  const track = { stop: () => stops++ };
  const stream = { getVideoTracks: () => [track], getTracks: () => [track] };
  const capture = createBrowserMontageCapture({ captureStream(rate) { rates.push(rate); return stream; } }, 24);
  capture.requestFrame();
  assert.equal(capture.manual, false);
  assert.deepEqual(rates, [0, 24]);
  assert.equal(stops, 1);
});

test("a slow draw resumes at the next future deadline without catch-up bursts", () => {
  assert.equal(nextBrowserMontageFrameIndex(0, 12, 24), 1);
  assert.equal(nextBrowserMontageFrameIndex(1, 250, 24), 7);
  assert.equal(nextBrowserMontageFrameIndex(7, 294, 24), 8);
});

test("external video playback keeps the decoder running while the transport stays paused", () => {
  const controller = new PodcasterPlaybackController();
  const video = { currentTime: 1.06, readyState: 4, seeking: false };
  assert.equal(controller.shouldResyncStageVideo(video, 1), true, "paused preview seeks at 40 ms of drift");
  controller.setExternalVideoPlayback(true);
  assert.equal(controller.state.isPlaying, false);
  assert.equal(controller.clockId, null);
  assert.equal(controller.shouldResyncStageVideo(video, 1), false, "a late export tick must not rewind decoded video");
  assert.equal(controller.shouldResyncStageVideo(video, 1.12), false, "small forward drift must not flush the decoder");
  assert.equal(controller.shouldResyncStageVideo(video, 2), true, "genuine large forward drift still seeks");
  assert.equal(controller.shouldResyncStageVideo(video, 1, { force: true }), true);
  assert.equal(controller.shouldResyncStageVideo(video, 1, { isHoldActive: true }), true);
});

test("ending external playback restores paused preview semantics and stops video", () => {
  const controller = new PodcasterPlaybackController();
  let pauses = 0;
  controller.els = { podcastActiveSpeakerVideo: { pause: () => pauses++ } };
  controller.setExternalVideoPlayback(true);
  controller.setExternalVideoPlayback(false);
  assert.equal(pauses, 1);
  assert.equal(controller.shouldResyncStageVideo({ currentTime: 1.06, readyState: 4 }, 1), true);
});
