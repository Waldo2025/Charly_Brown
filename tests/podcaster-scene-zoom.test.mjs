import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const { resolveSceneMediaRenderSpec } = require("../public/podcaster/podcaster-scene-media-render-spec.js");
const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const functionSource = source.slice(
  source.indexOf("function applySceneMediaScaleToStage("),
  source.indexOf("function syncPodcastSceneZoomControls(")
);

test("scene zoom updates the visible alternate video surface", () => {
  const values = new Map();
  const style = {
    setProperty: (name, value) => values.set(name, value),
    removeProperty: (name) => values.delete(name)
  };
  const alternateVideo = {
    tagName: "VIDEO",
    hidden: false,
    videoWidth: 1920,
    videoHeight: 1080,
    dataset: {},
    style,
    offsetWidth: 100
  };
  const primaryVideo = { ...alternateVideo, hidden: true };
  const target = {
    clientWidth: 640,
    clientHeight: 360,
    dataset: {},
    style: { setProperty() {} },
    classList: { contains: () => false },
    closest: () => null,
    querySelector: (selector) => {
      if (selector.includes("speaker-image")) return null;
      return selector.includes(":not([hidden])") ? alternateVideo : primaryVideo;
    }
  };
  const context = {
    window: { resolveSceneMediaRenderSpec },
    els: { podcastVideoStage: { querySelector: () => target } },
    normalizeTimelineClipMediaScale: (value) => value,
    normalizeTimelineClipVisualLayoutMode: () => "default",
    getPodcastVideoConfig: () => ({}),
    getActiveSession: () => ({})
  };
  vm.createContext(context);
  vm.runInContext(`${functionSource}\nthis.applyZoom = applySceneMediaScaleToStage;`, context);

  context.applyZoom({ rowId: "scene-1", mediaScale: 1.2 });

  assert.equal(values.get("--pod-scene-media-width"), "768.000px");
  assert.equal(values.get("--pod-scene-media-left"), "-64.000px");
  assert.equal(alternateVideo.dataset.sceneMediaMotionSyncKey, "scene-1:0");
});
