const test = require("node:test");
const assert = require("node:assert/strict");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { InMemoryTransport } = require("@modelcontextprotocol/sdk/inMemory.js");
const {
  advanceRun,
  createMarcieEditorialMcpServer,
  createToolHandlers,
  initialRun,
  missingFields,
  normalizeKey,
  phasePrompt,
  sessionRequestFromRun,
  uniqueStrings
} = require("../src/marcie-editorial-agent.js");

test("publica las herramientas MCP editoriales de Marcie", async () => {
  const server = createMarcieEditorialMcpServer({ db: {}, uid: "user-1" });
  const client = new Client({ name: "marcie-agent-test", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const tools = await client.listTools();
  const names = tools.tools.map((tool) => tool.name);
  [
    "get_session_context", "get_trending_topics", "create_editorial_session",
    "generate_audience_proposals", "research_sources", "draft_articles",
    "verify_article_claims", "format_bibliography_apa7", "review_article",
    "revise_article", "manage_vocabulary", "prepare_wordpress_draft"
  ].forEach((name) => assert.ok(names.includes(name), `falta ${name}`));
  await client.close();
  await server.close();
});

test("inicia la conversación con tema y nombre del usuario", () => {
  const run = initialRun({ uid: "user-1", displayName: "Waldo" });
  const response = phasePrompt(run);
  assert.equal(response.phase, "topic");
  assert.match(response.speechText, /Hola, Waldo/);
  assert.equal(response.uiPrompt.options[0].action, "recommend_trend");
  assert.deepEqual(response.missingFields, ["topic", "selectedAudiences", "tone", "resources"]);
});

test("completa la configuración guiada y exige confirmación", async () => {
  const run = initialRun({ uid: "user-1", displayName: "Waldo" });
  const context = { db: {}, generateText: null };

  let response = await advanceRun(run, { text: "Aprendizaje basado en proyectos" }, context);
  assert.equal(response.phase, "audiences");
  assert.equal(response.configurationPatch.topic, "Aprendizaje basado en proyectos");

  response = await advanceRun(run, { selectedValues: ["educators", "parents"] }, context);
  assert.equal(response.phase, "proposals");
  assert.equal(response.uiPrompt.options.length, 3);

  response = await advanceRun(run, { value: "educators-1" }, context);
  assert.equal(response.phase, "proposals");
  response = await advanceRun(run, { value: "parents-1" }, context);
  assert.equal(response.phase, "tone");

  response = await advanceRun(run, { value: "warm" }, context);
  assert.equal(response.phase, "length_mode");
  response = await advanceRun(run, { value: "same" }, context);
  assert.equal(response.phase, "extension");
  response = await advanceRun(run, { value: "standard" }, context);
  assert.equal(response.phase, "sources");
  response = await advanceRun(run, { value: "all" }, context);
  assert.equal(response.phase, "resource_mode");
  response = await advanceRun(run, { value: "same" }, context);
  assert.equal(response.phase, "resources");
  response = await advanceRun(run, { selectedValues: ["apa7", "quotes", "seo"] }, context);
  assert.equal(response.phase, "vocabulary");
  response = await advanceRun(run, { value: "yes" }, context);
  assert.equal(response.phase, "vocabulary_terms");
  response = await advanceRun(run, { text: "metacognición, Metacognicion, ciudadanía digital" }, context);
  assert.equal(response.phase, "summary");
  assert.equal(response.pendingConfirmation, true);
  assert.deepEqual(run.configuration.preferredVocabulary, ["metacognición", "ciudadanía digital"]);
  assert.deepEqual(missingFields(run.configuration), []);

  response = await advanceRun(run, { action: "confirm" }, context);
  assert.equal(response.phase, "ready");
  assert.equal(run.status, "ready");
  const request = sessionRequestFromRun(run);
  assert.equal(request.mode, "automated");
  assert.deepEqual(request.selectedAudiences, ["educators", "parents"]);
  assert.ok(request.specifications.some((item) => item.startsWith("#tono[all]")));
  assert.ok(request.specifications.some((item) => item.startsWith("#extension[educators]")));
  assert.ok(request.specifications.some((item) => item.startsWith("#concepto[parents]")));
});

test("permite volver a editar un apartado desde el resumen", async () => {
  const run = initialRun({ uid: "user-1" });
  run.phase = "summary";
  run.configuration.topic = "Tema anterior";
  const response = await advanceRun(run, { action: "edit_topic" }, { db: {} });
  assert.equal(response.phase, "topic");
  assert.equal(run.status, "configuring");
});

test("normaliza vocabulario sin perder la escritura original", async () => {
  assert.equal(normalizeKey("  Educación  "), "educacion");
  assert.deepEqual(uniqueStrings(["Educación", " educacion ", "Aula"]), ["Educación", "Aula"]);
  const handlers = createToolHandlers({});
  const result = await handlers.manage_vocabulary({ current: ["Educación"], add: ["educacion", "Aula"], remove: [] });
  assert.deepEqual(result.vocabulary, ["Educación", "Aula"]);
  assert.deepEqual(result.added, ["Aula"]);
  assert.deepEqual(result.existing, ["educacion"]);
});

test("la revisión posterior requiere vista previa y detecta la revisión base", async () => {
  let stored = {
    ownerId: "user-1",
    title: "Tema",
    topic: "Tema",
    audience: "educators",
    article: { title: "Tema", blocks: [{ type: "paragraph", text: "Texto" }], revision: 0 },
    articlesByAudience: { educators: { title: "Tema", blocks: [{ type: "paragraph", text: "Texto" }], revision: 0 } },
    approvedAudiences: ["educators"]
  };
  const ref = {
    async get() { return { exists: true, id: "session-1", data: () => stored }; },
    async set(value) { stored = { ...stored, ...value }; }
  };
  const db = { collection(name) { assert.equal(name, "MarcieBlogEditor"); return { doc() { return ref; } }; } };
  const run = { ...initialRun({ uid: "user-1" }), sessionId: "session-1", phase: "completed", status: "completed" };

  let response = await advanceRun(run, { text: "Corrige la claridad del artículo" }, { db, uid: "user-1" });
  assert.equal(response.uiPrompt.type, "change_preview");
  assert.equal(run.pendingChange.baseRevision, 0);
  assert.equal(stored.articlesByAudience.educators.revision, 0);

  response = await advanceRun(run, { action: "apply_change" }, { db, uid: "user-1" });
  assert.match(response.message, /Apliqué los cambios/);
  assert.equal(stored.articlesByAudience.educators.revision, 1);
  assert.deepEqual(stored.approvedAudiences, []);
});
