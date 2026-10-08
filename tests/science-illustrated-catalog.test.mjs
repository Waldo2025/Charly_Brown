import test from 'node:test';
import assert from 'node:assert/strict';
import { SCIENCE_TOPIC_CATALOG, createCurriculumRegistry, applyCurriculumProfile } from '../public/js/science-curriculum-profiles.mjs';
import { getScienceSceneArtDirection, createScienceIllustratedScene, normalizeScienceIllustratedScene, SCIENCE_SCENE_FAMILIES } from '../public/js/science-scene-art-direction.mjs';
import { simulatorUsesFullyProgrammaticScene, simulatorUsesProgrammaticPrimary, validateLocalizedSimulatorExportContract } from '../public/js/science-export-contract.mjs';

const profiles = [...createCurriculumRegistry(SCIENCE_TOPIC_CATALOG).values()];
test('every curricular profile has a complete, deterministic commercial scene brief', () => {
  assert.equal(profiles.length, 180);
  const used = new Set();
  for (const profile of profiles) {
    const a = applyCurriculumProfile({ subject: profile.subject, topic: profile.topic, gameMode: 'simulator' }, profile);
    const before = structuredClone(a), d = getScienceSceneArtDirection(a), scene = createScienceIllustratedScene(a);
    assert.deepEqual(a, before, 'visual planning must not mutate scientific controls or saved activity');
    assert.equal(d.version, 2); assert.equal(d.style, 'illustrated-realism');
    assert.ok(SCIENCE_SCENE_FAMILIES[d.familyId]); used.add(d.familyId);
    assert.ok(d.backgroundPrompt.includes(profile.topic));
    assert.equal(d.effects.length, a.controls.length);
    assert.equal(scene.layers.length, d.representation === 'object' ? 1 : 0);
    assert.ok(scene.background.imageSrc.startsWith('/assets/science-scenes/v2/'));
    assert.deepEqual(scene, createScienceIllustratedScene(a));
    assert.ok(['ready', 'needs_attention'].includes(normalizeScienceIllustratedScene(a, scene).status));
  }
  assert.equal(used.size, 8);
});
test('physical heroes match the model; exact structures are never baked into art', () => {
  for (const [subject, topic, family, representation] of [
    ['physics', 'Movimiento rectilíneo uniformemente acelerado (MRUA)', 'rail', 'object'],
    ['physics', 'Flotación', 'harbor', 'object'],
    ['physics', 'Circuitos en paralelo', 'workbench', 'code'],
    ['physics', 'Refracción', 'optics', 'code'],
    ['biology', 'Fotosíntesis', 'living', 'object'],
    ['biology', 'ADN', 'micro', 'code'],
    ['math', 'Factorización', 'math', 'code']
  ]) {
    const d = getScienceSceneArtDirection({ subject, topic });
    assert.equal(d.familyId, family); assert.equal(d.representation, representation);
  }
});
test('scene normalizer preserves provenance and does not invent missing mandatory art', () => {
  const activity = {subject: 'physics', topic: 'Flotación'};
  const scene = createScienceIllustratedScene(activity);
  scene.layers[0].anchor = {x: 25, y: -9};
  const normalized = normalizeScienceIllustratedScene(activity, scene);
  assert.deepEqual(normalized.layers[0].anchor, {x: .95, y: .08});
  assert.equal(normalized.provenance.assetVersion, 2);
  scene.layers = [];
  assert.equal(normalizeScienceIllustratedScene(activity, scene).status, 'needs_attention');
  const old = {version: 1, background: {imageSrc: 'saved.png'}};
  assert.equal(normalizeScienceIllustratedScene(activity, old), null);
  assert.equal(old.background.imageSrc, 'saved.png');
});
test('offline v2 mathematics requires its background but not a raster mathematical answer', () => {
  const a = {gameMode: 'simulator', subject: 'math', topic: 'Factorización', simulator: {modelId: 'quadratic-factorization-rectangle'}};
  assert.equal(simulatorUsesFullyProgrammaticScene(a), true, 'legacy exports remain compatible');
  a.visualScene = createScienceIllustratedScene(a);
  assert.equal(simulatorUsesFullyProgrammaticScene(a), false);
  assert.equal(simulatorUsesProgrammaticPrimary(a), true);
  assert.throws(() => validateLocalizedSimulatorExportContract(a, a), /fondo/);
  const runtime = structuredClone(a);
  a.visualScene.background.imageSrc = 'assets/simulator/background.webp';
  runtime.visualScene.background.dataUrl = 'data:image/webp;base64,AAAA';
  assert.doesNotThrow(() => validateLocalizedSimulatorExportContract(a, runtime));
});
