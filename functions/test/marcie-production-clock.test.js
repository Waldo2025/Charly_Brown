const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.resolve(__dirname, "../../public/MarcieBlogEditor/js/services/marcie-production-clock.js"), "utf8");
const clock = vm.createContext({ Date, Set, Number, Math, String });
vm.runInContext(source.replaceAll("export function", "function"), clock);

test("production clock counts retries and reloads from persisted start, without interval drift", () => {
  const automation = { startedAt: "2026-09-24T12:00:00Z", status: "retrying" };
  const reloaded = JSON.parse(JSON.stringify(automation));
  assert.equal(clock.productionElapsedMs(reloaded, Date.parse("2026-09-24T13:02:03Z")), 3723000);
  assert.equal(clock.formatProductionElapsed(3723000), "01:02:03");
  assert.equal(clock.formatProductionElapsed(25 * 3600000), "25:00:00");
});

test("completion and cancellation freeze total time", () => {
  for (const status of ["completed", "completed_with_findings", "cancelled"]) {
    assert.equal(clock.productionElapsedMs({ startedAt: 1000, completedAt: 65000, cancelledAt: 65000, status }, 999999), 64000);
  }
  assert.equal(clock.productionElapsedMs({}, 999999), 0);
  assert.equal(clock.productionElapsedMs({ startedAt: 2000 }, 1000), 0);
});

test("modal clock releases its interval on close or removal", () => {
  let tick;
  let cleared = 0;
  const node = { isConnected: true, textContent: "" };
  const context = vm.createContext({ Date, Set, Number, Math, String,
    setInterval(fn) { tick = fn; return 7; }, clearInterval(id) { assert.equal(id, 7); cleared++; }
  });
  vm.runInContext(source.replaceAll("export function", "function"), context);
  const stop = context.mountProductionClock({ querySelector: () => node }, () => ({ startedAt: 1000, completedAt: 65000, status: "completed" }));
  assert.equal(node.textContent, "00:01:04");
  node.isConnected = false;
  tick();
  assert.equal(cleared, 1);
  stop();
  assert.equal(cleared, 2);
});
