const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createMontageExportCancelController
} = require("./cancel-controller.js");

test("cancel controller triggers registered abort handlers exactly once", () => {
  const controller = createMontageExportCancelController("job-1");
  const calls = [];
  controller.registerAbortHandler(() => calls.push("first"));
  controller.registerAbortHandler(() => calls.push("second"));

  controller.cancel();
  controller.cancel();

  assert.equal(controller.isCancelled(), true);
  assert.deepEqual(calls, ["first", "second"]);
});

test("cancel controller can unregister an abort handler before cancellation", () => {
  const controller = createMontageExportCancelController("job-2");
  const calls = [];
  const unregister = controller.registerAbortHandler(() => calls.push("removed"));
  controller.registerAbortHandler(() => calls.push("kept"));

  unregister();
  controller.cancel();

  assert.deepEqual(calls, ["kept"]);
});
