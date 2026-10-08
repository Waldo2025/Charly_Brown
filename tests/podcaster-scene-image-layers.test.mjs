import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const ffmpeg = require("ffmpeg-static");
const { normalizeSceneImageLayers: normalizeExportLayers, buildSceneImageLayerFilters } = require("../backend/montage-export/scene-image-layers.js");
globalThis.window ||= {};
const { normalizeSceneImageLayers, sceneImageLayerFrame } = await import("../public/podcaster/podcaster-scene-image-layers-model.js");
const imageLayersEditorSource = readFileSync(new URL("../public/podcaster/podcaster-scene-image-layers.js", import.meta.url), "utf8");

const original = {
  id: "person-1", name: "Persona", storagePath: "podcaster/sessions/s1/owners/u1/images/person.png",
  mimeType: "image/png", x: 0.3, y: 0.65, width: 0.4,
  startSec: 1, endSec: 5, transitionSec: 0.5,
  motion: "slide-right", exit: "fade",
  effect: { type: "wave", intensity: 40, speed: 1.2 }
};

test("image layers preserve independent assets, placement, timing and effects", () => {
  const input = [original, { ...original, id: "person-2", x: 0.8, effect: { type: "bend" } }];
  const browser = normalizeSceneImageLayers(input);
  const backend = normalizeExportLayers(input);
  assert.equal(browser.length, 2);
  assert.equal(backend.length, 2);
  assert.equal(browser[0].storagePath, backend[0].storagePath);
  assert.equal(browser[1].effect.type, "bend");
  assert.equal(backend[1].x, 0.8);
  assert.equal(sceneImageLayerFrame(browser[0], 0.5).visible, false);
  assert.equal(sceneImageLayerFrame(browser[0], 2).visible, true);
  assert.equal(sceneImageLayerFrame(browser[0], 5).visible, false);
});

test("editor keeps the authorized proxy as a browser fallback when blob hydration is unavailable", () => {
  assert.match(imageLayersEditorSource, /let source = logicalUrl;/);
  assert.match(imageLayersEditorSource, /getBlobUrl\(logicalUrl, \{ persistent: true \}\) \|\| logicalUrl/);
  assert.match(imageLayersEditorSource, /catch \(_\) \{[\s\S]*source = logicalUrl;/);
});

test("export creates a transparent animated overlay with scene-relative visibility", () => {
  const layer = normalizeExportLayers([original])[0];
  const result = buildSceneImageLayerFilters(layer, {
    index: 0, inputIndex: 2, baseLabel: "[vout]",
    canvas: { width: 1280, height: 720 }, durationSec: 8,
    sourceWidth: 1000, sourceHeight: 1200
  });
  assert.match(result.filters, /\[2:v\]scale=512:614:flags=lanczos,format=rgba/);
  assert.match(result.filters, /geq=/);
  assert.match(result.filters, /fade=t=out:st=4\.500:d=0\.500:alpha=1/);
  assert.match(result.filters, /enable='between\(t\\,1\.000\\,5\.000\)'/);
  assert.equal(result.outputLabel, "[scene_layer_0_out]");
});

test("FFmpeg renders a warped extra image with timed entrance and exit", () => {
  assert.ok(ffmpeg);
  const layer = normalizeExportLayers([original])[0];
  const rendered = buildSceneImageLayerFilters(layer, {
    index: 0, inputIndex: 1, baseLabel: "[0:v]",
    canvas: { width: 96, height: 54 }, durationSec: 6,
    sourceWidth: 64, sourceHeight: 64
  });
  const result = spawnSync(ffmpeg, [
    "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "color=c=black:s=96x54:r=5:d=6",
    "-f", "lavfi", "-i", "color=c=red@0.8:s=64x64:r=5:d=6,format=rgba",
    "-filter_complex", rendered.filters,
    "-map", rendered.outputLabel, "-frames:v", "30", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"
  ], { timeout: 15000 });
  assert.equal(result.status, 0, String(result.stderr || ""));
  const bytesPerFrame = 96 * 54 * 3;
  const frame = (index) => result.stdout.subarray(index * bytesPerFrame, (index + 1) * bytesPerFrame);
  assert.deepEqual(frame(0), frame(27));
  assert.notDeepEqual(frame(0), frame(12));
});

test("FFmpeg composes two independently animated image layers", () => {
  const first = normalizeExportLayers([original])[0];
  const second = normalizeExportLayers([{ ...original, id: "object-2", x: 0.75, startSec: 0, endSec: 3, motion: "fade", exit: "slide-up", effect: { type: "bend" } }])[0];
  const options = { canvas: { width: 96, height: 54 }, durationSec: 6, sourceWidth: 64, sourceHeight: 64 };
  const a = buildSceneImageLayerFilters(first, { ...options, index: 0, inputIndex: 1, baseLabel: "[0:v]" });
  const b = buildSceneImageLayerFilters(second, { ...options, index: 1, inputIndex: 2, baseLabel: a.outputLabel });
  const result = spawnSync(ffmpeg, [
    "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "color=c=black:s=96x54:r=5:d=6",
    "-f", "lavfi", "-i", "color=c=red@0.8:s=64x64:r=5:d=6,format=rgba",
    "-f", "lavfi", "-i", "color=c=blue@0.8:s=64x64:r=5:d=6,format=rgba",
    "-filter_complex", `${a.filters};${b.filters}`,
    "-map", b.outputLabel, "-frames:v", "15", "-f", "null", "-"
  ], { encoding: "utf8", timeout: 15000 });
  assert.equal(result.status, 0, result.stderr);
});
