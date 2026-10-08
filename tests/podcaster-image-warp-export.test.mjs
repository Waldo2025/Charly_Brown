import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const ffmpeg = require('ffmpeg-static');
const { normalizeImageWarp, buildMontageImageWarpFilter } = require('../backend/montage-export/image-warp-filter.js');

test('image warp settings accept only bounded effects and values', () => {
  const normalized = normalizeImageWarp({ type: 'unknown', intensity: 999, speed: -4 });
  assert.equal(normalized.type, 'none');
  assert.equal(normalized.intensity, 100);
  assert.equal(normalized.speed, 0.25);
  assert.equal(buildMontageImageWarpFilter({ type: 'none' }), '');
});

test('multiple image areas keep independent settings and are bounded', () => {
  const spots = Array.from({ length: 8 }, (_, index) => ({ id: `area-${index}`, centerX: index / 7, radius: 0.1 + index / 20 }));
  const normalized = normalizeImageWarp({ type: 'wave', region: { mode: 'focus', spots } });
  assert.equal(normalized.region.spots.length, 6);
  assert.equal(normalized.region.spots[0].centerX, 0);
  assert.equal(normalized.region.spots[1].centerX, 1 / 7);
  assert.notEqual(normalized.region.spots[0].radius, normalized.region.spots[1].radius);
});

test('different effects remain attached to individual spots and render together', () => {
  const effect = {
    type: 'wave', intensity: 65, region: { mode: 'focus', spots: [
      { id: 'left', type: 'wave', centerX: 0.25, centerY: 0.5, radius: 0.2 },
      { id: 'right', type: 'twist', centerX: 0.75, centerY: 0.5, radius: 0.2 },
      { id: 'center', type: 'particles', centerX: 0.5, centerY: 0.35, radius: 0.12 }
    ] }, particles: { count: 3 }
  };
  const normalized = normalizeImageWarp(effect);
  assert.deepEqual(normalized.region.spots.map((spot) => spot.type), ['wave', 'twist', 'particles']);
  const filter = buildMontageImageWarpFilter(effect, { durationSec: 1, sourceWidth: 64, sourceHeight: 64 });
  assert.match(filter, /image_warp_spot_0/);
  assert.match(filter, /image_warp_spot_1/);
  const result = spawnSync(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=64x64:r=5:d=1',
    '-filter_complex', filter, '-map', '[image_warp]', '-frames:v', '2', '-f', 'null', '-'
  ], { encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 0, result.stderr);
});

test('all image warp filters render animated FFmpeg frames', () => {
  assert.ok(ffmpeg, 'ffmpeg-static is required for the montage export');
  for (const type of ['wave', 'bend', 'ripple', 'pulse', 'flag', 'liquid', 'twist', 'shear', 'jelly', 'particles']) {
    const filter = buildMontageImageWarpFilter({ type, intensity: 60, speed: 1.2, startSec: 0.1, endSec: 0.8, region: { mode: 'focus', spots: [{ id: 'left', centerX: 0.25, centerY: 0.4, radius: 0.2, feather: 0.1 }, { id: 'right', centerX: 0.75, centerY: 0.6, radius: 0.2, feather: 0.1 }] }, particles: { count: 4, size: 7, color: '#ff6600', direction: 'up-right' } }, { durationSec: 1, sourceWidth: 64, sourceHeight: 64 });
    const result = spawnSync(ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=64x64:r=5:d=1',
      '-filter_complex', filter, '-map', '[image_warp]', '-frames:v', '2', '-f', 'null', '-'
    ], { encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 0, `${type}: ${result.stderr}`);
  }
});

test('particle export varies sprite size for depth while respecting the overall size', () => {
  const settings = { type: 'particles', particles: { count: 10, size: 12 } };
  const filter = buildMontageImageWarpFilter(settings, { durationSec: 1, sourceWidth: 960, sourceHeight: 540 });
  const sizes = [...filter.matchAll(/color=c=0x[0-9a-f]+:s=(\d+)x\d+/g)].map((match) => Number(match[1]));
  assert.equal(sizes.length, 10);
  assert.ok(new Set(sizes).size >= 4);
  const smaller = buildMontageImageWarpFilter({ type: 'particles', particles: { count: 10, size: 4 } }, { durationSec: 1, sourceWidth: 960, sourceHeight: 540 });
  const smallSizes = [...smaller.matchAll(/color=c=0x[0-9a-f]+:s=(\d+)x\d+/g)].map((match) => Number(match[1]));
  assert.ok(Math.max(...smallSizes) < Math.max(...sizes));
});

test('particle export changes frames over time on a still image', () => {
  const filter = buildMontageImageWarpFilter({ type: 'particles', speed: 1.5, startSec: 0, endSec: 2, particles: { count: 8, size: 14, color: '#ff6600', direction: 'right' } }, { durationSec: 2, sourceWidth: 64, sourceHeight: 64 });
  const result = spawnSync(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=64x64:r=5:d=2',
    '-filter_complex', `${filter};[image_warp]format=rgb24[out]`, '-map', '[out]',
    '-frames:v', '7', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'
  ], { timeout: 15000 });
  assert.equal(result.status, 0, String(result.stderr || ''));
  const frameBytes = 64 * 64 * 3;
  const first = result.stdout.subarray(frameBytes * 2, frameBytes * 3);
  const later = result.stdout.subarray(frameBytes * 6, frameBytes * 7);
  assert.equal(first.length, frameBytes);
  assert.equal(later.length, frameBytes);
  assert.notDeepEqual(first, later);
});
