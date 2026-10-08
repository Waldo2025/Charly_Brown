import test from 'node:test';
import assert from 'node:assert/strict';
import { createScienceProductionClient } from '../public/js/science-production-client.mjs';

test('production requests preserve revisions and encode execution identity', async () => {
  const calls = [];
  const client = createScienceProductionClient(async (url, options) => { calls.push({ url, ...options }); return { run: { id: 'run/one' } }; });
  await client.plan({ topic: 'MRUA' }, { controls: [{ id: 'acceleration' }] });
  await client.revise('run/one', 2, { title: 'Movimiento' });
  await client.approve('run/one', 3);
  await client.start('run/one', 3);
  await client.retry('run/one', 'images');
  await client.cancel('run/one');
  await client.get('run/one');
  await client.regenerate('run/one', { taskId: 'visual-0' });
  assert.equal(calls[0].body.activity.controls[0].id, 'acceleration');
  assert.match(calls[1].url, /run%2Fone\/revise$/);
  assert.deepEqual(calls[1].body, { revision: 2, changes: { title: 'Movimiento' } });
  assert.deepEqual(calls[2].body, { revision: 3 });
  assert.deepEqual(calls[3].body, { revision: 3 });
  assert.deepEqual(calls[4].body, { taskId: 'images' });
  assert.equal(calls[6].method, undefined);
  assert.match(calls[7].url, /regenerate_asset$/);
  assert.deepEqual(calls[7].body, { taskId: 'visual-0' });
});

test('provider failures propagate without fallback or implicit approval', async () => {
  let calls = 0;
  const client = createScienceProductionClient(async () => { calls++; throw new Error('quota'); });
  await assert.rejects(client.plan({}, {}), /quota/);
  assert.equal(calls, 1);
});

test('approved generated simulator export retains an opaque sandbox and escapes source', async () => {
  const { buildGeneratedSimulatorExportHtml } = await import('../public/js/science-generated-export.mjs');
  const activity = { title: 'MRUA <test>', generation: { complete: true }, simulator: { generated: { candidateId: 'science-model-a', reviewStatus: 'approved', hash: 'abc', html: '<script>window.run=true</script><p>"Motion"</p>' } } };
  const html = buildGeneratedSimulatorExportHtml(activity);
  assert.match(html, /sandbox="allow-scripts"/);
  assert.doesNotMatch(html, /allow-same-origin|<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&quot;Motion&quot;/);
  assert.throws(() => buildGeneratedSimulatorExportHtml({ ...activity, generation: { complete: false } }), /aprobación/);
});
