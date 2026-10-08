const test = require('node:test');
const assert = require('node:assert/strict');
const { reserve, guardClient, withResearchContext } = require('../src/research/budget.js');
function store(config = { enabled: true, monthlyProjectCalls: 10, monthlyUserCalls: 5 }) {
  const docs = new Map([['ResearchSettings/grounding', config]]);
  const merge = (a, b) => { for (const [k,v] of Object.entries(b)) a[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(a[k] || {}, v) : v; return a; };
  const ref = path => ({ path, get: async () => ({ data: () => structuredClone(docs.get(path)) }), set: async value => docs.set(path, merge(docs.get(path) || {}, value)) });
  let tail = Promise.resolve();
  return { docs, collection: name => ({ doc: id => ref(`${name}/${id}`) }), runTransaction: work => {
    const next = tail.then(() => work({ get: r => r.get(), set: (r,v) => r.set(v) })); tail = next.catch(() => {}); return next;
  }};
}
test('paid search stays disabled without configured monthly limits', async () => {
  const db = store({ enabled: true });
  assert.equal((await reserve({ db, uid: 'u', dossierId: 'd', gap: 'missing evidence' }, 'query')).allowed, false);
});
test('parallel requests share two dossier permits and deduplicate query', async () => {
  const db = store(), context = { db, uid: 'u', dossierId: 'd', gap: 'missing evidence', reformulation: 'Refined terminology after first result' };
  const result = await Promise.all(['one','one','two','three'].map(q => reserve(context, q)));
  assert.equal(result.filter(r => r.allowed).length, 2);
});
test('monthly counters span dossiers; user limit is authoritative', async () => {
  const db = store({ enabled: true, monthlyProjectCalls: 10, monthlyUserCalls: 1 });
  assert.equal((await reserve({ db, uid: 'u', dossierId: 'a', gap: 'missing' }, 'one')).allowed, true);
  assert.equal((await reserve({ db, uid: 'u', dossierId: 'b', gap: 'missing' }, 'two')).reason, 'monthly_limit');
});
test('guard denies direct built-in search and preserves ordinary generation', async () => {
  let calls = 0;
  const client = guardClient({ models: { generateContent: async () => { calls++; return {}; } } });
  await assert.rejects(client.models.generateContent({ config: { tools: [{ googleSearch: {} }] } }), /research_context_required/);
  await client.models.generateContent({ contents: [] }); assert.equal(calls, 1);
});
test('uncertain failure consumes permit instead of resubmitting same query', async () => {
  let calls = 0;
  const db = store();
  const client = guardClient({ models: { generateContent: async () => { calls++; throw Error('transport failure'); } } });
  const context = { db, uid: 'u', dossierId: 'd', gap: 'missing' }, request = { contents: ['q'], config: { tools: [{ googleSearch: {} }] } };
  await withResearchContext(context, async () => {
    await assert.rejects(client.models.generateContent(request), /transport failure/);
    await assert.rejects(client.models.generateContent(request), /query_already_reserved/);
  }); assert.equal(calls, 1);
});
test('a second call requires a justified reformulation and cannot reset on retry',async()=>{
  const db=store(),context={db,uid:'u',dossierId:'same-article',gap:'A claim is missing primary evidence'};
  assert.equal((await reserve(context,'specific first query')).allowed,true);
  assert.equal((await reserve(context,'different query')).reason,'reformulation_required');
  assert.equal((await reserve({...context,reformulation:'Use the English clinical terminology because the first query found no primary trial'},'different query')).allowed,true);
  assert.equal((await reserve({...context,reformulation:'Another attempt'},'third query')).reason,'dossier_limit');
});
module.exports = { store };
