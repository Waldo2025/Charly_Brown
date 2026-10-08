import test from "node:test";
import assert from "node:assert/strict";

test("random image effect excludes particles and creates editable spots", async () => {
  globalThis.window = {};
  const { randomImageWarp, normalizeImageWarp } = await import("../public/podcaster/podcaster-image-warp.js");
  const spots = [{ id: "selected-area", centerX: 0.2, centerY: 0.7, radius: 0.18, feather: 0.08 }];
  for (let index = 0; index <= 100; index++) {
    const effect = randomImageWarp({ type: "particles", region: { mode: "focus", spots } }, () => index / 100);
    assert.notEqual(effect.type, "particles");
    assert.notEqual(effect.type, "none");
    assert.equal(effect.region.mode, "focus");
    assert.ok(effect.region.spots.length >= 2 && effect.region.spots.length <= 4);
    assert.deepEqual({ ...effect.region.spots[0], type: undefined }, { ...spots[0], type: undefined });
    assert.ok(effect.region.spots.every((spot) => spot.type !== 'particles'));
    assert.equal(new Set(effect.region.spots.map((spot) => spot.id)).size, effect.region.spots.length);
    assert.ok(effect.intensity >= 35 && effect.intensity <= 65);
    assert.ok(effect.speed >= 0.75 && effect.speed <= 1.35);
  }
  const fresh = randomImageWarp(null, () => 0.5);
  assert.equal(fresh.region.mode, "focus");
  assert.equal(fresh.region.spots.length, 3);
  assert.deepEqual(normalizeImageWarp(JSON.parse(JSON.stringify(fresh))).region.spots, fresh.region.spots);
  delete globalThis.window;
});

test("a selected area changes its image samples while playing", async () => {
  const samples = [];
  globalThis.window = {};
  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ drawImage() {} })
    })
  };
  const { drawImageWarpFrame } = await import("../public/podcaster/podcaster-image-warp.js");
  const canvas = {
    width: 320,
    height: 180,
    getContext: () => ({
      clearRect() {},
      drawImage(...args) { samples.push(args.slice(1)); }
    })
  };
  const image = { complete: true, naturalWidth: 320, naturalHeight: 180, width: 320, height: 180, currentSrc: "scene-image" };
  const effect = { type: "wave", intensity: 100, speed: 1, region: { mode: "focus", centerX: 0.5, centerY: 0.5, radius: 0.3, feather: 0.08 } };
  assert.equal(drawImageWarpFrame(canvas, image, effect, 0.5, 2), true);
  const first = JSON.stringify(samples);
  samples.length = 0;
  assert.equal(drawImageWarpFrame(canvas, image, effect, 1.2, 2), true);
  assert.notEqual(JSON.stringify(samples), first);
  delete globalThis.window;
  delete globalThis.document;
});
