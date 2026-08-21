import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  reconcileGeminiAudioSegmentTiming,
  resolveGeminiAudioTimelineDurationMs,
  resolveGeminiAudioTrimOutMs
} from "../public/podcaster/podcaster-montage-audio-timing.js";
import audioTiming from "../backend/montage-export/audio-timing.js";

const { resolveMontageTimelineAudioPlacement } = audioTiming;
const require = createRequire(import.meta.url);
const ffmpegPath = require("ffmpeg-static");

test("real Gemini audio duration replaces a stale visual-scene duration", () => {
  const durationMs = resolveGeminiAudioTimelineDurationMs({
    sourceDurationMs: 10_000,
    persistedDurationMs: 8_000,
    persistedEndMs: 16_000,
    startMs: 8_000,
    playbackRate: 1
  });
  assert.equal(durationMs, 10_000);
  assert.equal(resolveGeminiAudioTrimOutMs({ timelineDurationMs: durationMs, playbackRate: 1, sourceDurationMs: 10_000 }), 10_000);

  const placement = resolveMontageTimelineAudioPlacement({
    segmentStartMs: 8_000,
    segmentDurationMs: durationMs,
    exportStartMs: 10_000,
    timelineStartMs: 10_000,
    hasExportOffset: true
  });
  assert.deepEqual(placement, {
    adjustedStartMs: 8_000,
    startMs: 8_000,
    leadingTrimMs: 0,
    sourceLeadingTrimMs: 0,
    durationMs: 10_000,
    endMs: 18_000
  });
});

test("duration uses source trim and playback rate without double-scaling persisted values", () => {
  const expectedByRate = new Map([
    [0.5, 20_000],
    [1, 10_000],
    [2, 5_000],
    [10, 1_000]
  ]);
  expectedByRate.forEach((expectedMs, playbackRate) => {
    assert.equal(resolveGeminiAudioTimelineDurationMs({ sourceDurationMs: 10_000, playbackRate }), expectedMs);
  });
  assert.equal(resolveGeminiAudioTimelineDurationMs({
    sourceDurationMs: 10_000,
    trimInMs: 2_000,
    playbackRate: 2
  }), 4_000);
  assert.equal(resolveGeminiAudioTimelineDurationMs({
    sourceDurationMs: 0,
    persistedDurationMs: 8_000,
    playbackRate: 2
  }), 8_000);
});

test("real row_hpbq73z8 metadata replaces the 96ms-short stored duration", () => {
  const reconciled = reconcileGeminiAudioSegmentTiming({
    segment: {
      rowId: "row_hpbq73z8",
      startMs: 47_520,
      durationMs: 8_755,
      trimInMs: 0,
      trimOutMs: 10_944
    },
    sourceDurationMs: 11_040,
    playbackRate: 1.25
  });
  assert.equal(reconciled.durationMs, 8_832);
  assert.equal(reconciled.endMs, 56_352);
  assert.equal(reconciled.trimOutMs, 11_040);
});

test("only the portion before timeline zero is removed", () => {
  assert.deepEqual(resolveMontageTimelineAudioPlacement({
    segmentStartMs: -2_000,
    segmentDurationMs: 10_000
  }), {
    adjustedStartMs: -2_000,
    startMs: 0,
    leadingTrimMs: 2_000,
    sourceLeadingTrimMs: 2_000,
    durationMs: 8_000,
    endMs: 8_000
  });
});

test("pre-zero timeline trim is converted to source time at every playback rate", () => {
  const expectedByRate = new Map([
    [0.5, 1_000],
    [1, 2_000],
    [2, 4_000],
    [10, 20_000]
  ]);
  expectedByRate.forEach((sourceLeadingTrimMs, playbackRate) => {
    const placement = resolveMontageTimelineAudioPlacement({
      segmentStartMs: -2_000,
      segmentDurationMs: 8_000,
      playbackRate
    });
    assert.equal(placement.leadingTrimMs, 2_000);
    assert.equal(placement.sourceLeadingTrimMs, sourceLeadingTrimMs);
    assert.equal(placement.durationMs, 6_000);
    assert.equal(placement.endMs, 6_000);
  });
});

test("ffmpeg MP4 keeps the complete 8s-18s synthetic audio window", { timeout: 30_000 }, (t) => {
  const ffmpeg = spawnSync(ffmpegPath, ["-version"], { encoding: "utf8" });
  if (ffmpeg.status !== 0) {
    t.skip("ffmpeg unavailable");
    return;
  }

  const workDir = mkdtempSync(path.join(tmpdir(), "podcaster-audio-parity-"));
  const outputPath = path.join(workDir, "parity.mp4");
  try {
    const placement = resolveMontageTimelineAudioPlacement({
      segmentStartMs: 8_000,
      segmentDurationMs: 10_000,
      exportStartMs: 10_000,
      timelineStartMs: 10_000,
      hasExportOffset: true
    });
    const render = spawnSync(ffmpegPath, [
      "-y", "-hide_banner", "-loglevel", "error",
      "-f", "lavfi", "-i", "color=c=black:s=320x180:r=24:d=18",
      "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=48000:duration=10",
      "-filter_complex", `[1:a]adelay=${placement.startMs}ms|${placement.startMs}ms[aout]`,
      "-map", "0:v:0", "-map", "[aout]",
      "-t", String(placement.endMs / 1000),
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
      outputPath
    ], { encoding: "utf8" });
    assert.equal(render.status, 0, render.stderr);

    const silence = spawnSync(ffmpegPath, [
      "-hide_banner", "-i", outputPath,
      "-af", "silencedetect=noise=-40dB:d=0.05", "-f", "null", "-"
    ], { encoding: "utf8" });
    const durationMatch = silence.stderr.match(/Duration:\s*(\d+):(\d+):([0-9.]+)/);
    assert.ok(durationMatch, silence.stderr);
    const detectedDurationSec = (Number(durationMatch[1]) * 3600) + (Number(durationMatch[2]) * 60) + Number(durationMatch[3]);
    assert.ok(Math.abs(detectedDurationSec - 18) < 0.1, `MP4 duration=${detectedDurationSec}`);
    const silenceEnd = Number(silence.stderr.match(/silence_end:\s*([0-9.]+)/)?.[1] || NaN);
    assert.ok(Math.abs(silenceEnd - 8) < 0.1, `silence_end=${silenceEnd}`);
    assert.doesNotMatch(silence.stderr, /silence_start:\s*1[0-7](?:\.|\s|$)/, "audio was cut before 18s");
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});
