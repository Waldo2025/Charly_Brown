import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("scene visual effects and extra image layers maintain correct timing and visibility across multiple scenes in video-player", async () => {
  globalThis.window ||= {};
  globalThis.document ||= {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        clearRect() {},
        drawImage() {}
      })
    })
  };
  const { normalizeSceneImageLayers, sceneImageLayerFrame } = await import("../public/podcaster/podcaster-scene-image-layers-model.js");
  const { normalizeImageWarp, drawImageWarpFrame } = await import("../public/podcaster/podcaster-image-warp.js");

  const session = {
    id: "test-session",
    script: {
      rows: [
        { id: "row_0", durationSec: 8 },
        { id: "row_1", durationSec: 8 },
        { id: "row_2", durationSec: 8 }
      ]
    },
    visualEffectsMap: {
      row_0: {
        imageWarp: { type: "wave", intensity: 50, speed: 1 },
        imageLayers: [
          { id: "layer_0", name: "Sticker 1", storagePath: "path1.png", startSec: 0, endSec: 6 }
        ]
      },
      row_1: {
        imageWarp: { type: "ripple", intensity: 60, speed: 1.2 },
        imageLayers: [
          { id: "layer_1", name: "Sticker 2", storagePath: "path2.png", startSec: 0, endSec: 6 }
        ]
      }
    }
  };

  // Mock timeline runtime entries built for this session
  const runtimeEntries = [
    { rowId: "row_0", startMs: 0, endMs: 8000, durationMs: 8000, effectiveDurationMs: 8000 },
    { rowId: "row_1", startMs: 8000, endMs: 16000, durationMs: 8000, effectiveDurationMs: 8000 },
    { rowId: "row_2", startMs: 16000, endMs: 24000, durationMs: 8000, effectiveDurationMs: 8000 }
  ];

  function resolveClip(rowId) {
    return runtimeEntries.find(e => e.rowId === rowId) || {};
  }

  // --- SCENE 1 TEST ---
  const scene1Clock = { currentMs: 2000, isPlaying: true, activeRowId: "row_0" };
  const clip1 = resolveClip("row_0");
  const timeSecScene1 = Math.max(0, (scene1Clock.currentMs - (clip1.startMs || 0)) / 1000);
  assert.equal(timeSecScene1, 2.0, "Scene 1 timeSec must be 2.0s");

  const layer1 = normalizeSceneImageLayers(session.visualEffectsMap.row_0.imageLayers)[0];
  const frameScene1 = sceneImageLayerFrame(layer1, timeSecScene1);
  assert.equal(frameScene1.visible, true, "Scene 1 extra image layer must be visible at 2s");

  // --- SCENE 2 TEST (The core bug being addressed) ---
  const scene2Clock = { currentMs: 10000, isPlaying: true, activeRowId: "row_1" };
  
  // Buggy behavior without clip.startMs resolution:
  const buggyTimeSecScene2 = Math.max(0, (scene2Clock.currentMs - 0) / 1000);
  assert.equal(buggyTimeSecScene2, 10.0);
  const layer2 = normalizeSceneImageLayers(session.visualEffectsMap.row_1.imageLayers)[0];
  const buggyFrameScene2 = sceneImageLayerFrame(layer2, buggyTimeSecScene2);
  assert.equal(buggyFrameScene2.visible, false, "Without scene startMs offset, layer at 10s is hidden");

  // Correct behavior with resolveTimelineClip:
  const clip2 = resolveClip("row_1");
  const fixedTimeSecScene2 = Math.max(0, (scene2Clock.currentMs - Number(clip2.startMs || 0)) / 1000);
  assert.equal(fixedTimeSecScene2, 2.0, "Fixed timeSec in Scene 2 must be relative to scene start (2.0s)");
  const fixedFrameScene2 = sceneImageLayerFrame(layer2, fixedTimeSecScene2);
  assert.equal(fixedFrameScene2.visible, true, "Fixed Scene 2 extra image layer must be visible at 2s into scene 2");

  // Image warp frame check in Scene 2
  const dummyCanvas = {
    width: 320,
    height: 180,
    getContext: () => ({
      clearRect() {},
      drawImage() {}
    })
  };
  const dummyImage = { complete: true, naturalWidth: 320, naturalHeight: 180, width: 320, height: 180 };
  const warpEffect = normalizeImageWarp(session.visualEffectsMap.row_1.imageWarp);
  const durationSec2 = clip2.durationMs / 1000;
  const paintedFixed = drawImageWarpFrame(dummyCanvas, dummyImage, warpEffect, fixedTimeSecScene2, durationSec2);
  assert.equal(paintedFixed, true, "Image warp must paint successfully in Scene 2");
});

test("video-player.html and composition modules ensure proper z-index and clip resolution", () => {
  const videoPlayerHtml = readFileSync("public/video-player.html", "utf8");
  const imageWarpJs = readFileSync("public/podcaster/podcaster-image-warp.js", "utf8");
  const imageLayersJs = readFileSync("public/podcaster/podcaster-scene-image-layers.js", "utf8");
  const homeJs = readFileSync("public/js/home.js", "utf8");
  const controllerJs = readFileSync("public/podcaster/podcaster-playback-controller.js", "utf8");

  // 1. video-player.html defines display none for hidden video and z-indexes for effect canvases
  assert.match(videoPlayerHtml, /\.player-video\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/);
  assert.match(videoPlayerHtml, /\.player-stage\s+\.podcast-image-warp-stage-canvas\s*\{\s*position:\s*absolute;\s*z-index:\s*6;/);
  assert.match(videoPlayerHtml, /\.player-stage\s+\.podcast-scene-image-layers-stage\s*\{\s*position:\s*absolute;\s*z-index:\s*7;/);

  // 2. podcaster-image-warp.js uses resolveTimelineClip and resolveActiveStageImage
  assert.match(imageWarpJs, /function resolveTimelineClip/);
  assert.match(imageWarpJs, /function resolveActiveStageImage/);
  assert.match(imageWarpJs, /const clip = resolveTimelineClip\(session, stageRowId, clock\);/);

  // 3. podcaster-scene-image-layers.js uses resolveTimelineClip and resolveActiveStageMedia
  assert.match(imageLayersJs, /function resolveTimelineClip/);
  assert.match(imageLayersJs, /function resolveActiveStageMedia/);
  assert.match(imageLayersJs, /const clip = resolveTimelineClip\(session, currentRowId, clock\);/);

  // 4. home.js provides window.ensureTimelineClipsByRowId and populates homePlaybackState.runtimeEntries
  assert.match(homeJs, /window\.ensureTimelineClipsByRowId\s*=/);
  assert.match(homeJs, /homePlaybackState\.runtimeEntries\s*=/);

  // 5. podcaster-playback-controller.js maintains proper z-index and runtime entries on state
  assert.match(controllerJs, /this\.state\.runtimeEntries\s*=\s*entries;/);
  assert.match(controllerJs, /candidate\.style\.zIndex\s*=\s*isTarget\s*\?\s*"2"\s*:\s*"1";/);
  assert.match(controllerJs, /v\.style\.zIndex\s*=\s*"1";/);
});
