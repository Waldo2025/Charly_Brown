const test = require('node:test');
const assert = require('node:assert/strict');
const { activityDynamics } = require('../src/charly-exercise-dynamics.js');
const { buildActivityPrompt } = require('../src/charly-brown-agent-tools.js');

test('server uses the browser catalog as the source of exercise templates', async () => {
  const dynamics = await activityDynamics(['sopa_letras'], '<div class="cb-word-search-wrap"></div>');
  assert.deepEqual(dynamics.enabled, ['sopa_letras']);
  assert.deepEqual(dynamics.detected, ['sopa_letras']);
  assert.match(dynamics.directive, /cb-word-search-wrap/);
  assert.doesNotMatch(dynamics.directive, /cb-matching-columns/);
});

test('activity prompt preserves extracted exercises while offering matching catalog styles', async () => {
  const dynamics = await activityDynamics(['banco_palabras']);
  const prompt = buildActivityPrompt({
    unit: { meta: { grade: 'Tercero' } },
    activity: { section: 'Matemáticas' },
    sourceContent: 'Resuelve 2 + 2.',
    exerciseDynamicsDirective: dynamics.directive
  });
  assert.match(prompt, /Conserva las mecánicas originales del archivo/);
  assert.match(prompt, /cb-activity-bank/);
  assert.match(prompt, /Resuelve 2 \+ 2/);
});
