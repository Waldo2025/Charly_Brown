import assert from 'node:assert/strict';
import { saveSessionDirectToCloud } from '../public/podcaster/podcaster-session-store.js';
const writes = [];
const deps = {
  resolveCurrentUid: () => 'owner', firestoreDb: {},
  doc: (_db, collection, id) => ({ collection, id }),
  serverTimestamp: () => 'server-time',
  runTransaction: async (_db, body) => body({
    get: async () => ({ exists: () => true, data: () => ({ ownerId: 'owner', session: { id: 'session', script: { rows: [] } } }) }),
    update: (ref, data) => writes.push({ ref, data }),
    set: () => assert.fail('an existing session must be updated atomically')
  })
};
const result = await saveSessionDirectToCloud({ id: 'session', title: 'Interview', script: { rows: [{ id: 'row' }] } }, deps);
assert.equal(result.ok, true);
assert.equal(writes.length, 1);
assert.deepEqual(writes[0].ref, { collection: 'podcaster_sessions', id: 'session' });
assert.equal(writes[0].data.session.script.rows[0].id, 'row');
console.log('Single document transaction verified.');
