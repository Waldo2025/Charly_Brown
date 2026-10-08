const test = require('node:test');
const assert = require('node:assert/strict');
const { ProductionStore } = require('../src/marcie-production-store.js');
const { configuration, initialTasks, task, hash, audienceSpecifications, sourceKey, retryDelay } = require('../src/marcie-production-policy.js');
const { ProductionCoordinator, nextTasks } = require('../src/marcie-production-coordinator.js');
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
function memoryDb() {
  const data = new Map(); let tail = Promise.resolve();
  const ref = path => ({ path, id: path.split('/').at(-1), collection: name => collection(`${path}/${name}`), get: async () => snap(path) });
  const snap = path => ({ id: path.split('/').at(-1), ref: ref(path), exists: data.has(path), data: () => clone(data.get(path)) });
  const collection = path => ({ doc: id => ref(`${path}/${id}`), get: async () => ({ docs: [...data.keys()].filter(key => key.startsWith(path + '/') && key.split('/').length === path.split('/').length + 1).map(snap) }) });
  const db = { data, collection, runTransaction(fn) {
    const run = tail.then(async () => {
      const writes = [];
      const tx = { get: r => r.get(), create(r, v) { writes.push(() => { assert.equal(data.has(r.path), false); data.set(r.path, clone(v)); }); },
        set(r, v) { writes.push(() => data.set(r.path, clone(v))); },
        update(r, patch) { writes.push(() => { const value = clone(data.get(r.path)); assert.ok(value); for (const [key, val] of Object.entries(patch)) { const parts = key.split('.'); let target = value; for (const part of parts.slice(0, -1)) target = target[part] ||= {}; target[parts.at(-1)] = clone(val); } data.set(r.path, value); }); } };
      const result = await fn(tx); writes.forEach(write => write()); return result;
    }); tail = run.catch(() => {}); return run;
  } }; return db;
}
const session = () => ({ ownerId: 'user', topic: 'Aprendizaje', selectedAudiences: ['educators', 'parents'], specifications: ['#tono cálido', '#titulo[parents] Familias'], automation: { startedAt: '2026-09-24T00:00:00Z' }, articlesByAudience: {} });
async function setup() { const db = memoryDb(); db.data.set('MarcieBlogEditor/session', session()); const store = new ProductionStore(db, () => 1000); const id = await store.start('user', 'session'); return { db, store, id }; }

test('configuration isolates audience instructions and chooses only required searches', () => {
  const config = configuration(session());
  assert.deepEqual(audienceSpecifications(config, 'educators'), ['#tono cálido']);
  assert.deepEqual(audienceSpecifications(config, 'parents'), ['#tono cálido', '#titulo Familias']);
  assert.equal(initialTasks(config, session()).length, 6);
  assert.equal(initialTasks({ ...config, minimum: 30 }, session()).length, 10);
  assert.equal(sourceKey({ url: 'https://example.org/paper?utm_source=test#title' }), sourceKey({ url: 'https://example.org/paper' }));
  assert.ok(retryDelay(1, { retryAfterMs: 90000 }, () => 0) >= 90000);
});

test('start is idempotent across concurrent tabs and enforces ownership', async () => {
  const { store, id } = await setup();
  assert.deepEqual(await Promise.all([store.start('user', 'session'), store.start('user', 'session')]), [id, id]);
  await assert.rejects(store.read(id, 'other'), { status: 403 });
});

test('global permits cap search work at ten across sessions, with exclusive claims', async () => {
  const { store, db, id } = await setup();
  const { run } = await store.read(id);
  const extra = Array.from({ length: 15 }, (_, i) => task('search', `extra-${i}`));
  await store.addTasks(id, run.epoch, extra);
  const claims = await Promise.all(extra.map(t => store.claim(id, t.id)));
  assert.equal(claims.filter(Boolean).length, 10);
  assert.equal(await store.claim(id, extra[0].id), null);
  assert.equal(db.data.get('MarcieProductionControl/capacity').slots.length, 10);
});

test('cancellation rejects late results and checkpoints; resume preserves completed tasks', async () => {
  const { store, id } = await setup();
  const before = await store.read(id);
  const first = await store.claim(id, before.tasks[0].id);
  await store.checkpoint(id, first.task, { completed: { 0: ['paragraph'] } });
  await store.finish(id, first.task, { sources: [] });
  const second = await store.claim(id, before.tasks[1].id);
  await store.control(id, 'user', 'cancel');
  assert.equal(await store.finish(id, second.task, { sources: ['late'] }), false);
  await assert.rejects(store.checkpoint(id, second.task, {}), { status: 409 });
  await store.control(id, 'user', 'resume');
  const after = await store.read(id);
  assert.equal(after.tasks.find(t => t.id === first.task.id).status, 'completed');
  assert.deepEqual(after.tasks.find(t => t.id === first.task.id).checkpoint, { completed: { 0: ['paragraph'] } });
});

test('retry preserves checkpoints and replaces expired attempts safely', async () => {
  const { store, id } = await setup();
  const item = (await store.read(id)).tasks[0];
  const first = await store.claim(id, item.id);
  await store.checkpoint(id, first.task, { completedGroups: 2 });
  await store.finish(id, first.task, null, Object.assign(new Error('quota'), { status: 429 }));
  store.clock = () => 999999;
  const retry = await store.claim(id, item.id);
  assert.deepEqual(retry.task.checkpoint, { completedGroups: 2 });
  assert.equal(await store.finish(id, first.task, { stale: true }), false);
  await store.finish(id, retry.task, { sources: [] });
  assert.equal((await store.read(id)).tasks.find(t => t.id === item.id).status, 'completed');
});

test('manual edits are preserved when production tries to integrate its result', async () => {
  const { store, db, id } = await setup();
  db.data.get('MarcieBlogEditor/session').articlesByAudience.parents = { blocks: [{ text: 'Manual' }] };
  await store.commitAudience(id, 'parents', { blocks: [{ text: 'Generated' }] }, {});
  assert.equal(db.data.get('MarcieBlogEditor/session').articlesByAudience.parents.blocks[0].text, 'Manual');
  assert.equal((await store.read(id)).run.status, 'needs_attention');
});

test('concurrent audiences commit without overwriting each other', async () => {
  const { store, db, id } = await setup();
  await Promise.all(['educators', 'parents'].map(a => store.commitAudience(id, a, { blocks: [{ text: a }] }, { issues: [] })));
  assert.equal(Object.keys(db.data.get('MarcieBlogEditor/session').articlesByAudience).length, 2);
  await store.complete(id);
  assert.equal((await store.read(id)).run.status, 'completed');
});

test('discovery deduplicates candidates before scheduling validation', async () => {
  const { store, id } = await setup(); const { run, tasks } = await store.read(id);
  const source = { url: 'https://example.org/a', title: 'Document' };
  const next = nextTasks(run, tasks.map(t => ({ ...t, status: 'completed', result: { sources: [source, { ...source, url: source.url + '#section' }] } })));
  assert.equal(next.filter(t => t.stage === 'validate').length, 1);
});

test('dispatch recovers transient errors and stores only its own task result', async () => {
  const { store, id } = await setup(); const taskId = (await store.read(id)).tasks[0].id;
  const queued = [];
  const coordinator = new ProductionCoordinator({ store, enqueue: async (...args) => queued.push(args), execute: async (_run, _task, save) => { await save({ completedGroups: 1 }); throw Object.assign(new Error('temporary'), { status: 503 }); } });
  await coordinator.dispatch(id, taskId);
  const item = (await store.read(id)).tasks.find(t => t.id === taskId);
  assert.equal(item.status, 'pending'); assert.equal(item.checkpoint.completedGroups, 1); assert.ok(queued.length);
});

test('complete production runs independent audiences through checkpoints and freezes completion', async () => {
  const { store, id } = await setup();
  store.clock = Date.now;
  const calls = new Map(); const pending = new Set();
  let running = 0; let peak = 0;
  const coordinator = new ProductionCoordinator({ store, enqueue: async (_id, item) => pending.add(item.id), execute: async (run, item, checkpoint) => {
    calls.set(item.id, (calls.get(item.id) || 0) + 1); running++; peak = Math.max(peak, running);
    try {
      await new Promise(resolve => setTimeout(resolve, 2));
      if (item.stage === 'propose') return { title: run.config.topic, brief: item.input.audience };
      if (item.stage === 'search') return { sources: [{ url: `https://example.org/${item.id}`, title: item.id }] };
      if (item.stage === 'validate') return { sources: [{ ...item.input.source, verificationStatus: 'verified', year: '2025', supportSummary: 'Document evidence' }] };
      if (item.stage === 'select') return Object.fromEntries(run.config.audiences.map(a => [a, { ...item.input.dossier, blockers: [], analysisStatus: 'complete' }]));
      if (item.stage === 'draft') { await checkpoint({ completedGroups: 1 }); return { audience: item.input.audience, title: run.config.topic, blocks: [{ id: 'p', text: item.input.audience }] }; }
      if (['evidence', 'correct'].includes(item.stage)) return { ...item.input.article, verification: { status: 'verified', blockers: [] } };
      if (item.stage === 'cover') return { url: 'https://example.org/cover.png' };
      return { issues: [], seoRecommendations: [] };
    } finally { running--; }
  } });
  for (let round = 0; round < 30; round++) {
    await coordinator.advance(id);
    const batch = [...pending]; pending.clear();
    await Promise.all(batch.map(taskId => coordinator.dispatch(id, taskId)));
    if ((await store.read(id)).run.status === 'completed') break;
  }
  const status = await coordinator.status('user', id);
  assert.equal(status.status, 'completed');
  assert.ok(status.completedAt);
  assert.equal(Object.keys(status.session.articlesByAudience).length, 2);
  assert.ok(peak > 1 && peak <= 10);
  assert.ok([...calls.values()].every(count => count === 1));
  const previousCalls = calls.size;
  await coordinator.advance(id);
  assert.equal(calls.size, previousCalls);
});

test('server drafting adapter stays identical to the editor core', () => {
  const fs = require('node:fs'); const path = require('node:path');
  const browser = fs.readFileSync(path.resolve(__dirname, '../../public/MarcieBlogEditor/js/services/marcie-draft-chunks.js'), 'utf8');
  const server = fs.readFileSync(path.resolve(__dirname, '../src/marcie-production-draft.generated.js'), 'utf8');
  assert.ok(server.includes(browser.replace(/^import .*\n/, '').replace('export async function generateArticleInChunks', 'async function generateArticleInChunks')));
});

test('a hung operation expires, preserves its last checkpoint and rejects late output', async () => {
  const { store, id } = await setup(); const taskId = (await store.read(id)).tasks[0].id;
  let release; let saveLater;
  const coordinator = new ProductionCoordinator({ store, timeoutMs: 10, enqueue: async () => {}, execute: async (_run, _task, save) => {
    await save({ completedGroups: 3 }); saveLater = save;
    return new Promise(resolve => { release = resolve; });
  } });
  await coordinator.dispatch(id, taskId);
  const item = (await store.read(id)).tasks.find(t => t.id === taskId);
  assert.equal(item.status, 'pending'); assert.equal(item.checkpoint.completedGroups, 3);
  await assert.rejects(saveLater({ completedGroups: 999 }));
  release({ stale: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await store.read(id)).tasks.find(t => t.id === taskId).result, undefined);
});

test('MCP production tools delegate to the same coordinator operations', async () => {
  const previous = process.env.MARCIE_PARALLEL_PRODUCTION;
  process.env.MARCIE_PARALLEL_PRODUCTION = 'true';
  try {
    const calls = [];
    const productionCoordinator = Object.fromEntries(['start', 'status', 'control'].map(name => [name, async (...args) => { calls.push([name, ...args]); return { id: 'production' }; }]));
    const { createToolHandlers } = require('../src/marcie-editorial-agent.js');
    const handlers = createToolHandlers({ uid: 'user', productionCoordinator });
    await handlers.start_production({ sessionId: 'session' });
    await handlers.get_production({ productionId: 'production' });
    await handlers.resume_production({ productionId: 'production' });
    await handlers.cancel_production({ productionId: 'production' });
    assert.deepEqual(calls, [['start', 'user', 'session'], ['status', 'user', 'production'], ['control', 'user', 'production', 'resume'], ['control', 'user', 'production', 'cancel']]);
  } finally { if (previous === undefined) delete process.env.MARCIE_PARALLEL_PRODUCTION; else process.env.MARCIE_PARALLEL_PRODUCTION = previous; }
});

for (const mode of ['marcie', 'aida', 'custom']) test(`${mode}: worker preserves editorial rules and resumes the shared drafting checkpoint`, async () => {
  const { createWorkers } = require('../src/marcie-production-workers.js');
  const prompts = [];
  const execute = createWorkers({ client: { models: { generateContent: async args => {
    const prompt = args.contents.flatMap(c => c.parts).map(p => p.text).join('\n'); prompts.push(prompt);
    const sections = prompt.match(/Secciones solicitadas: (\[.*?\])\. Produce/);
    const result = sections ? { blocks: JSON.parse(sections[1]).map(section => ({ section: section.key, type: 'paragraph', text: 'Contenido fundamentado para familias. '.repeat(65), sourceIds: ['s1'] })) }
      : { subtitle: 'Aprendizaje en familia', excerpt: 'Contexto', sections: Array.from({ length: 5 }, (_, i) => ({ heading: `Sección ${i}`, purpose: 'Explicar' })) };
    return { candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }] };
  } } } });
  const config = configuration({ ...session(), editorialMode: mode, editorialProfileSnapshot: { customRule: 'REGLA_ESPECIAL' }, specifications: ['#titulo[parents] Familias', '#titulo[educators] Docentes', '#extension 1200 a 1600 palabras'] });
  const dossier = { sources: [{ id: 's1', url: 'https://example.org/paper', title: 'Documento', verificationStatus: 'verified', authors: ['Autor'], year: '2025' }], facts: [], attributedReferences: [] };
  let saved; const run = { config, imported: { drafts: {} } };
  const item = { stage: 'draft', input: { audience: 'parents', dossier } };
  const article = await execute(run, item, async value => { saved = value; }, new AbortController().signal);
  assert.equal(article.title, 'Familias'); assert.equal(article.audience, 'parents');
  assert.ok(prompts.some(p => p.includes('REGLA_ESPECIAL')));
  assert.ok(prompts.every(p => !p.includes('#titulo Docentes')));
  const before = prompts.length;
  await execute(run, { ...item, checkpoint: saved }, async () => {}, new AbortController().signal);
  assert.equal(prompts.length, before);
  assert.ok(article.blocks.length);
});

test('waiting sessions receive capacity before one session refills all ten permits', async () => {
  const { store, db, id } = await setup();
  db.data.set('MarcieBlogEditor/second', { ...session(), automation: { startedAt: '2026-09-24T01:00:00Z' } });
  const secondId = await store.start('user', 'second');
  const firstRun = (await store.read(id)).run;
  const extra = Array.from({ length: 11 }, (_, i) => task('search', `fair-${i}`));
  await store.addTasks(id, firstRun.epoch, extra);
  const claims = await Promise.all(extra.slice(0, 10).map(t => store.claim(id, t.id)));
  const secondTask = (await store.read(secondId)).tasks[0];
  assert.equal(await store.claim(secondId, secondTask.id), null);
  await store.finish(id, claims[0].task, { sources: [] });
  assert.equal(await store.claim(id, extra[10].id), null);
  assert.ok(await store.claim(secondId, secondTask.id));
});
