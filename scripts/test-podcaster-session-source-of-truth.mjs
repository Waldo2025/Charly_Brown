import assert from 'node:assert/strict';
import { loadSingleSessionFromCloud } from '../public/podcaster/podcaster-session-store.js';
let reads = 0;
const saved = { id: 'session', title: 'Interview', script: { rows: [{ id: 'row' }] }, dialogueVideoMap: { row: { storagePath: 'video.mp4', selectionRevision: 'new', localMediaCacheKey: 'cached-video' } } };
const deps = {
  firestoreDb: {},
  doc: (_db, collection, id) => { assert.equal(collection, 'podcaster_sessions'); assert.equal(id, 'session'); return id; },
  getDoc: async () => { reads++; return { exists: () => true, data: () => ({ ownerId: 'owner', session: saved }) }; }
};
const restored = await loadSingleSessionFromCloud('session', 'owner', deps);
assert.equal(reads, 1);
assert.deepEqual(restored.dialogueVideoMap, saved.dialogueVideoMap);
assert.equal(restored.script.rows[0].id, 'row');
assert.equal(await loadSingleSessionFromCloud('session', '', deps), null);
assert.equal(reads, 1, 'unauthenticated loads do not read the database');
console.log('Full media selection restored from the primary session document.');
