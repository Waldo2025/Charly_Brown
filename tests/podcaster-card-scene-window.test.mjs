import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCardSceneWindow, cardSceneWindowFromTimeline } from '../public/podcaster/podcaster-card-scene-window.js';

test('scene entry and exit become an exact timeline start and duration', () => {
  const scene = { startMs: 12000, durationMs: 8000 };
  const window = normalizeCardSceneWindow({ sceneDurationMs: scene.durationMs, enterSec: 1.5, exitSec: 6.7 });
  assert.equal(scene.startMs + window.enterMs, 13500);
  assert.equal(window.durationMs, 5200);
  assert.deepEqual(cardSceneWindowFromTimeline({ startMs: 13500, durationMs: 5200 }, scene.startMs, scene.durationMs), window);
});

test('card timing stays inside its scene with at least half a second visible', () => {
  assert.deepEqual(normalizeCardSceneWindow({ sceneDurationMs: 8000, enterSec: 9, exitSec: 10 }), {
    enterMs: 7500, exitMs: 8000, durationMs: 500, sceneDurationMs: 8000
  });
  assert.equal(normalizeCardSceneWindow({ sceneDurationMs: 8000, enterSec: 4, exitSec: 3 }).exitMs, 4500);
});
