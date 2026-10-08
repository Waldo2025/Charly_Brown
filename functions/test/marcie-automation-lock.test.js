const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "../../public/MarcieBlogEditor/js/services/marcie-automation-lock.js"), "utf8").replace("export async function", "async function");

test("only one tab can generate the same session at a time", async () => {
  const held = new Set();
  const navigator = { locks: { request: async (name, options, callback) => {
    if (held.has(name)) return callback(null);
    held.add(name);
    try { return await callback({ name }); } finally { held.delete(name); }
  } } };
  const context = vm.createContext({ navigator });
  vm.runInContext(source, context);
  let release;
  const first = context.withMarcieAutomationLock("session-1", () => new Promise(resolve => { release = resolve; }));
  await assert.rejects(context.withMarcieAutomationLock("session-1", () => "second writer"), /otra pestaña/);
  assert.equal(await context.withMarcieAutomationLock("session-2", () => "other session"), "other session");
  release("finished");
  assert.equal(await first, "finished");
  assert.equal(await context.withMarcieAutomationLock("session-1", () => "retry"), "retry");
});
