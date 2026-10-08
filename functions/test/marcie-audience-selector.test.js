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

test("generating a missing audience retries a fetch failure and opens the article before save finishes", async () => {
  const editor = read("public/MarcieBlogEditor/js/editor-app.js");
  const source = editor.slice(editor.indexOf("async function selectAudienceSafely"), editor.indexOf("async function reconfigureSession"));
  const events = [];
  let attempts = 0;
  let releaseSave;
  const savePending = new Promise((resolve) => { releaseSave = resolve; });
  const context = vm.createContext({
    sessionOperations: new Set(),
    chooseEditorialAction: async () => "generate",
    getEditorialAudienceLabel: () => "Docentes",
    draftArticleForMode: async ({ session }) => {
      attempts += 1;
      if (attempts === 1) throw vm.runInContext('new TypeError("Failed to fetch")', context);
      session.researchByAudience = { educators: { sources: [{ id: "s1" }] } };
      return { title: "Artículo docentes", audience: "educators", blocks: [{ text: "Contenido" }] };
    },
    hasCompleteArticle: (article) => Array.isArray(article?.blocks) && article.blocks.length > 0,
    saveMarcieSession: () => { events.push("save-started"); return savePending; },
    renderSessionList: () => events.push("list-rendered"),
    renderActiveSession: () => events.push("article-rendered"),
    setSyncStatus: () => {},
    invalidateMaterialApproval: () => {},
    showToast: () => {},
    console,
    window: { __marcieShowArticleGenerationSpinner: () => {}, __marcieHideArticleGenerationSpinner: () => events.push("spinner-hidden") }
  });
  vm.runInContext(read("public/MarcieBlogEditor/js/services/marcie-automation-recovery.js").replace(/\bexport /g, ""), context);
  const retry = vm.runInContext("retryTransientFetch", context);
  context.retryTransientFetch = (operation) => retry(operation, { wait: async () => {} });
  vm.runInContext(source, context);
  const session = { id: "s1", title: "Tema", topic: "Tema", audience: "parents", humanizationEnabled: false, articlesByAudience: {}, researchByAudience: {} };
  const generating = context.selectAudienceSafely(session, "educators");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(attempts, 2);
  assert.equal(session.articlesByAudience.educators.title, "Artículo docentes");
  assert.equal(session.audience, "educators");
  assert.ok(events.indexOf("article-rendered") > events.indexOf("save-started"));
  assert.ok(events.indexOf("spinner-hidden") < events.indexOf("article-rendered"));
  releaseSave();
  await generating;
});

test("an article remains available when its Firebase save fails", async () => {
  const editor = read("public/MarcieBlogEditor/js/editor-app.js");
  const source = editor.slice(editor.indexOf("async function selectAudienceSafely"), editor.indexOf("async function reconfigureSession"));
  const statuses = [];
  const context = vm.createContext({
    sessionOperations: new Set(),
    chooseEditorialAction: async () => "generate",
    getEditorialAudienceLabel: () => "Docentes",
    draftArticleForMode: async () => ({ title: "Artículo docentes", blocks: [{ text: "Contenido" }] }),
    retryTransientFetch: (operation) => operation(),
    hasCompleteArticle: (article) => Array.isArray(article?.blocks) && article.blocks.length > 0,
    saveMarcieSession: async () => { throw new Error("Firebase no disponible"); },
    renderSessionList: () => {}, renderActiveSession: () => {},
    setSyncStatus: (status) => statuses.push(status),
    invalidateMaterialApproval: () => {},
    showToast: () => {},
    console: { error() {} },
    window: { __marcieShowArticleGenerationSpinner() {}, __marcieHideArticleGenerationSpinner() {} }
  });
  vm.runInContext(source, context);
  const session = { id: "s2", title: "Tema", topic: "Tema", audience: "parents", humanizationEnabled: false, articlesByAudience: {} };
  await context.selectAudienceSafely(session, "educators");
  assert.equal(session.article.title, "Artículo docentes");
  assert.equal(session.articlesByAudience.educators.blocks.length, 1);
  assert.ok(statuses.includes("Artículo pendiente de sincronizar"));
});
