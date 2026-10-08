import test from "node:test";
import assert from "node:assert/strict";

global.window = global.window || {};

await import("../public/podcaster/podcaster-timeline-model.js");

const { normalizePodcastVideoConfig } = window;

test("normalizePodcastVideoConfig keeps the free local Wan 2.2 model instead of resetting to auto", () => {
  const cfg = normalizePodcastVideoConfig({
    videoModel: "local-wan-2.2",
    videoGenerator: "local",
    videoRoutingVersion: 2
  });
  assert.equal(cfg.videoModel, "local-wan-2.2");
  assert.equal(cfg.videoGenerator, "local");
});

test("normalizePodcastVideoConfig derives the local generator when only the model is saved", () => {
  const cfg = normalizePodcastVideoConfig({ videoModel: "local-wan-2.2", videoRoutingVersion: 2 });
  assert.equal(cfg.videoModel, "local-wan-2.2");
  assert.equal(cfg.videoGenerator, "local");
});

test("normalizePodcastVideoConfig still migrates paid legacy models to their generators", () => {
  const veo = normalizePodcastVideoConfig({ videoModel: "veo-3.1-generate-001", videoRoutingVersion: 2 });
  assert.equal(veo.videoGenerator, "veo");
  const auto = normalizePodcastVideoConfig({ videoModel: "not-a-real-model", videoRoutingVersion: 2 });
  assert.equal(auto.videoModel, "auto");
  assert.equal(auto.videoGenerator, "auto");
});
