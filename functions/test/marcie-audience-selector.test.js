const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("existing audience articles render before their Firebase selection save completes", async () => {
  const editor = read("public/MarcieBlogEditor/js/editor-app.js");
  const source = editor.slice(editor.indexOf("async function selectAudienceSafely"), editor.indexOf("async function reconfigureSession"));
  const events = [];
  let releaseSave;
  const savePending = new Promise((resolve) => { releaseSave = resolve; });
  const context = vm.createContext({
    sessionOperations: new Set(),
    saveMarcieSession: () => { events.push("save-started"); return savePending; },
    updateAudienceSelector: (audience) => events.push(`selector:${audience}`),
    renderActiveSession: () => events.push("article-rendered"),
    renderSessionList: () => events.push("list-rendered"),
    setSyncStatus: (status) => events.push(`status:${status}`),
    requestAnimationFrame: (callback) => callback(),
    chooseEditorialAction() {}, getEditorialAudienceLabel() {}, draftArticleForMode() {},
    showToast() {}, invalidateMaterialApproval() {}, window: {}
  });
  vm.runInContext(source, context);
  const session = {
    id: "session-1",
    audience: "educators",
    article: { title: "Docentes", blocks: [{ text: "Docentes" }] },
    articlesByAudience: { students: { title: "Estudiantes", blocks: [{ text: "Estudiantes" }] } },
    auditsByAudience: {}
  };

  await context.selectAudienceSafely(session, "students");
  assert.equal(session.article.title, "Estudiantes");
  assert.ok(events.indexOf("article-rendered") < events.indexOf("save-started"));
  assert.match(events.join("|"), /selector:students/);
  releaseSave();
  await savePending;
});

test("audience selectors use Estudiantes, Padres, Docentes, Coordinadores order", () => {
  const html = read("public/MarcieBlogEditor.html");
  const selector = html.slice(html.indexOf('id="audience-selector"'), html.indexOf('id="btn-cycle-view"'));
  const order = ["students", "parents", "educators", "coordinators"].map((audience) => selector.indexOf(`data-audience="${audience}"`));
  assert.ok(order.every((position) => position >= 0));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));

  const modal = read("public/MarcieBlogEditor/js/components/modals.js");
  assert.match(modal, /ALL_AUDIENCE_KEYS = \["students", "parents", "educators", "coordinators"\]/);
});
