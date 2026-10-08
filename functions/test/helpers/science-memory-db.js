const assert = require('node:assert/strict');
const clone = value => value === undefined ? undefined : structuredClone(value);
function memoryDb() {
  const data = new Map(); let tail = Promise.resolve();
  const snap = path => ({ exists: data.has(path), data: () => clone(data.get(path)), id: path.split('/').at(-1) });
  const ref = path => ({ path, get: async () => snap(path), create: async value => { assert.ok(!data.has(path)); data.set(path, clone(value)); }, set: async (value, options) => data.set(path, options?.merge ? { ...data.get(path), ...clone(value) } : clone(value)), update: async value => { assert.ok(data.has(path)); data.set(path, { ...data.get(path), ...clone(value) }); } });
  return { data, collection: name => ({ doc: id => ref(`${name}/${id}`) }), runTransaction(fn) {
    const task = tail.then(async () => { const pending = []; const tx = { get: r => r.get(), create: (r,v) => pending.push(() => r.create(v)), set: (r,v,o) => pending.push(() => r.set(v,o)), update: (r,v) => pending.push(() => r.update(v)), delete: r => pending.push(() => data.delete(r.path)) }; const result = await fn(tx); for (const write of pending) await write(); return result; }); tail = task.catch(() => {}); return task;
  } };
}
module.exports = { memoryDb };
