const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../public/MarcieBlogEditor/js/services/marcie-production-client.js'), 'utf8').replace(/^import .*;\n/gm, '').replaceAll('export ', '');
function client(overrides = {}) {
  const context = vm.createContext({ AbortController, Date, Error, Number, Math, Promise, setTimeout, clearTimeout,
    getCurrentUser: () => ({ getIdToken: async () => 'token' }), buildMarcieApiUrl: value => value,
    fetch: async () => ({ ok: true, json: async () => ({ id: 'run' }) }), ...overrides });
  vm.runInContext(source, context); return context;
}
test('client reads persisted progress without resetting the production start', async () => {
  const context = client();
  const startedAt = '2026-09-24T00:00:00Z';
  const value = context.productionProgress({ id: 'run', startedAt, status: 'running', tasks: [{ stage: 'draft', status: 'running' }, { stage: 'search', status: 'completed' }] });
  assert.equal(value.startedAt, startedAt); assert.equal(value.productionId, 'run'); assert.equal(value.stage, 'articles');
  assert.equal(context.productionProgress({ id: 'run', startedAt, status: 'needs_attention' }).status, 'failed');
});
test('client deadlines cover stalled authentication, and surface authorization failures', async () => {
  let expire;
  const context = client({ getCurrentUser: () => ({ getIdToken: () => new Promise(() => {}) }), setTimeout: callback => { expire = callback; return 1; }, clearTimeout() {} });
  const pending = context.productionRequest('status', { productionId: 'run' });
  expire(); await assert.rejects(pending, { status: 504 });
  await assert.rejects(client({ getCurrentUser: () => null }).productionRequest('start'), { status: 401 });
});
test('client cancellation aborts the active request and does not start another', async () => {
  let calls = 0;
  const context = client({ fetch: async () => { calls++; return new Promise(() => {}); } });
  const controller = new AbortController();
  const pending = context.productionRequest('status', {}, controller.signal);
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  await assert.rejects(pending);
  assert.equal(calls, 1);
});

test('a pending checkpoint save cannot trap the UI indefinitely', async () => {
  let expire;
  const context = client({ setTimeout: callback => { expire = callback; return 1; }, clearTimeout() {} });
  let commit;
  const pendingSave = new Promise(resolve => { commit = resolve; });
  const waiting = context.waitForProductionSave(pendingSave, new AbortController().signal);
  expire(); await assert.rejects(waiting, { status: 504 });
  commit('saved');
  assert.equal(await context.waitForProductionSave(pendingSave, new AbortController().signal), 'saved');
});
