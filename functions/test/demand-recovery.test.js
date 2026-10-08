const test = require('node:test');
const assert = require('node:assert/strict');
const { scheduleRecovery, recoverRun } = require('../src/pigpen-demand-recovery.js');
const { scheduleOperationPoll } = require('../src/veo-operation-tasks.js');
function memory(initial) {
  let value = structuredClone(initial), tail = Promise.resolve();
  const merge = patch => { for (const [key,item] of Object.entries(patch)) { const parts = key.split('.'); if (parts.length === 2) value[parts[0]][parts[1]] = item; else value[key] = item; } };
  const ref = { get: async () => ({ data: () => structuredClone(value) }), set: async patch => merge(patch) };
  const db = { runTransaction: work => { const next = tail.then(() => work({ get: r => r.get(), update: (r,v) => r.set(v), set: (r,v) => r.set(v) })); tail = next.catch(() => {}); return next; } };
  ref.firestore = db;
  return { db, ref: () => ref, read: () => structuredClone(value), change: merge };
}
const options = enqueue => ({ enabled: true, enqueue });
test('parallel recovery scheduling reserves one deterministic task; no successor after pause', async () => {
  const store = memory({ status: 'running', epoch: 'v1' }), tasks = [];
  await Promise.all([1,2].map(() => scheduleRecovery(store, 'run', options(async task => tasks.push(task)))));
  assert.equal(new Set(tasks.map(t => t.jobId)).size, 1);
  const recovery = store.read().recovery;
  store.change({ status: 'paused' });
  const result = await recoverRun({ store, advance: () => { throw Error('must not advance'); } }, { runId: 'run', ...recovery }, options(async task => tasks.push(task)));
  assert.equal(result.skipped, true); assert.equal(store.read().recovery.sequence, 1);
});
test('failed enqueue is repaired with same sequence, and an old epoch cannot run', async () => {
  const store = memory({ status: 'planning', epoch: 'v1' });
  await assert.rejects(scheduleRecovery(store, 'run', options(async () => { throw Error('network'); })), /network/);
  const tasks = []; await scheduleRecovery(store, 'run', options(async task => tasks.push(task)));
  assert.equal(tasks[0].payload.sequence, 1);
  store.change({ epoch: 'v2' });
  assert.equal((await recoverRun({ store }, { runId: 'run', epoch: 'v1', sequence: 1 })).skipped, true);
});
test('Veo first poll is 30 seconds, later polls 60; duplicates share the reservation', async () => {
  const store = memory({ status: 'processing', videoOperation: { name: 'operation' } }), tasks = [];
  const enqueue = async task => tasks.push(task);
  await scheduleOperationPoll({ jobId: 'video' }, store.ref(), {}, { releaseLease: false, enqueue });
  assert.ok(tasks[0].scheduleDelaySeconds > 29 && tasks[0].scheduleDelaySeconds <= 30);
  await scheduleOperationPoll({ jobId: 'video' }, store.ref(), {}, { releaseLease: false, enqueue });
  assert.equal(tasks.length, 1);
  store.change({ 'videoPoll.dueAt': 0 });
  await scheduleOperationPoll({ jobId: 'video' }, store.ref(), {}, { releaseLease: false, enqueue });
  assert.equal(tasks[1].payload.sequence, 2);
  assert.ok(tasks[1].scheduleDelaySeconds > 59 && tasks[1].scheduleDelaySeconds <= 60);
  store.change({ status: 'cancelled' });
  await scheduleOperationPoll({ jobId: 'video' }, store.ref(), {}, { releaseLease: false, enqueue });
  assert.equal(tasks.length, 2);
});
