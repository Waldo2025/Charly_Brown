const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const editor = fs.readFileSync(path.join(__dirname, "../../public/MarcieBlogEditor/js/editor-app.js"), "utf8");
const supervisor = editor.slice(editor.indexOf("async function runAutomatedSessionWorkflow(session,"), editor.indexOf("async function runAutomatedSessionWorkflowUnlocked("));

function createSupervisor(runAttempt) {
  const saves = [];
  const progress = [];
  const context = vm.createContext({
    AbortController, Date, Map,
    automationRecoveryRuns: new Map(), automationRecoveryControllers: new Map(),
    withMarcieAutomationLock: async (_id, action) => action(),
    runAutomatedSessionWorkflowUnlocked: runAttempt,
    automationRetryDelay: () => 0,
    waitForAutomationRetry: async () => {},
    rememberAutomation() {},
    saveMarcieSession: async session => saves.push(session.automation.status),
    updateAutomatedSessionProgress: (_stage, message) => progress.push(message),
    renderActiveSession() {}
  });
  vm.runInContext(`${supervisor}\nglobalThis.run = runAutomatedSessionWorkflow;`, context);
  return { context, saves, progress };
}

test("reanuda automáticamente una etapa fallida sin recrear la sesión", async () => {
  const session = { id: "same-session", automation: { status: "running", stage: "proposals", progress: 8 } };
  let attempts = 0;
  const { context, saves, progress } = createSupervisor(async working => {
    assert.equal(working, session);
    attempts += 1;
    if (attempts === 1) {
      working.automation.status = "failed";
      throw Object.assign(new Error("Temporarily unavailable"), { status: 503 });
    }
    working.automation.status = "completed";
  });
  await context.run(session, []);
  assert.equal(attempts, 2);
  assert.equal(session.automation.status, "completed");
  assert.deepEqual(saves, ["retrying"]);
  assert.ok(progress.some(message => message.includes("Reintentando automáticamente")));
  assert.equal(context.automationRecoveryRuns.size, 0);
});

test("cancelar durante la espera impide un nuevo intento", async () => {
  const session = { id: "cancelled-session", automation: { status: "running", stage: "articles", progress: 30 } };
  let attempts = 0;
  const { context } = createSupervisor(async working => {
    attempts += 1;
    working.automation.status = "failed";
    throw new Error("Temporary failure");
  });
  context.waitForAutomationRetry = async () => {
    session.automation.status = "cancelled";
    context.automationRecoveryControllers.get(session.id).abort();
  };
  await context.run(session, []);
  assert.equal(attempts, 1);
  assert.equal(session.automation.status, "cancelled");
  assert.equal(context.automationRecoveryRuns.size, 0);
});

test("al salir del workflow se actualiza el modal después de liberar el estado activo", () => {
  const cleanup = editor.slice(editor.indexOf("automationCancellations.delete(session.id);", editor.indexOf("async function runAutomatedSessionWorkflowUnlocked(")), editor.indexOf("async function createEditorialSessionFromModal("));
  assert.match(cleanup, /appState\.automationWorkflowActive = false;[\s\S]*updateAutomatedSessionProgress\(/);
  const expression = editor.match(/const running = (.+);/)[1];
  const context = { appState: { automationWorkflowActive: true, automationWorkflowSessionId: "other" }, session: { id: "current" }, automationRecoveryRuns: new Map(), sessionOperations: new Set(), automationCancellations: new Map() };
  assert.equal(vm.runInNewContext(expression, context), false);
  context.automationRecoveryRuns.set("current", Promise.resolve());
  assert.equal(vm.runInNewContext(expression, context), true);
});
