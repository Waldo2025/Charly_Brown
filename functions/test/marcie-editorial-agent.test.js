const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { InMemoryTransport } = require("@modelcontextprotocol/sdk/inMemory.js");
const {
  advanceRun,
  createMarcieEditorialMcpServer,
  createToolHandlers,
  initialAssistantRun,
  initialRun,
  isTransientModelError,
  missingFields,
  normalizeKey,
  phasePrompt,
  processAgentTurn,
  readSessionHistory,
  sessionRequestFromRun,
  uniqueStrings,
  withModelRetry
} = require("../src/marcie-editorial-agent.js");

test("Marcie reintenta errores internos transitorios del modelo", async () => {
  let attempts = 0;
  const waits = [];
  const result = await withModelRetry(async () => {
    attempts += 1;
    if (attempts < 3) throw new Error('{"error":{"code":500,"message":"Internal error encountered.","status":"INTERNAL"}}');
    return "ok";
  }, { baseDelayMs: 5, sleep: async (ms) => waits.push(ms) });
  assert.equal(result, "ok");
  assert.equal(attempts, 3);
  assert.deepEqual(waits, [5, 10]);
  assert.equal(isTransientModelError(new Error('{"error":{"code":500,"status":"INTERNAL"}}')), true);
});

test("la creación usa la guía de voz y mantiene el chat MCP visible en el panel", () => {
  const panelSource = fs.readFileSync(path.join(__dirname, "../../public/MarcieBlogEditor/js/components/marcie-agent-panel.js"), "utf8");
  const voiceSource = fs.readFileSync(path.join(__dirname, "../../public/MarcieBlogEditor/js/services/marcie-agent-voice.js"), "utf8");
  assert.match(panelSource, /renderPanelMessages\(\);[\s\S]*openVoiceGuide\(\);/);
  assert.doesNotMatch(panelSource, /host\.hidden = true/);
  assert.match(panelSource, /Marcie te guía por voz/);
  assert.match(panelSource, /data-guide-messages/);
  assert.match(panelSource, /const panelMessages = \[\]/);
  assert.match(panelSource, /const guideMessages = \[\]/);
  assert.match(panelSource, /guide \? guideMessages : panelMessages/);
  assert.match(panelSource, /function renderGuideMessages\(\)/);
  assert.match(panelSource, /const target = guide \? "guide" : "panel"/);
  assert.match(panelSource, /showResponse\(response, \{ target \}\)/);
  assert.match(panelSource, /target === "guide" \? guideMessages : panelMessages/);
  assert.match(panelSource, /function renderOptions\(response, target = guide \? "guide" : "panel"\)/);
  assert.doesNotMatch(panelSource, /const messages = \[\]/);
  assert.match(panelSource, /Pulsar para hablar/);
  assert.match(panelSource, /pointerdown/);
  assert.match(panelSource, /pointerup/);
  assert.match(panelSource, /Suelta para enviar/);
  assert.match(panelSource, /Escuchando; enviaré al pausar/);
  assert.match(panelSource, /voice\.enableAutoSubmit\(\{ silenceMs: 1800 \}\)/);
  assert.match(panelSource, /voice\.stop\(\{ submit: true \}\)/);
  assert.match(panelSource, /Escribe una instrucción para Marcie/);
  assert.match(panelSource, /data-agent-mic title="Dictar mensaje"/);
  assert.match(panelSource, /data-agent-audio title="Activar respuestas por voz"/);
  assert.match(panelSource, /let panelAudioEnabled = false/);
  assert.match(panelSource, /target === "guide" && guide/);
  assert.match(panelSource, /target === "panel" && panelAudioEnabled/);
  assert.match(panelSource, /role="status" aria-live="polite"/);
  assert.match(panelSource, /Marcie está analizando el artículo/);
  assert.match(panelSource, /Marcie está preparando una corrección/);
  assert.match(panelSource, /Hablando con Marcie/);
  assert.doesNotMatch(panelSource, /Gemini está revisando/);
  assert.doesNotMatch(panelSource, /Conectando con Gemini/);
  assert.match(voiceSource, /speakWithGeminiLive/);
  assert.match(voiceSource, /recognition\.continuous = true/);
  assert.match(voiceSource, /scheduleAutoSubmit\(\)/);
  assert.match(voiceSource, /onComplete\?\.\(completedTranscript\)/);
  assert.match(voiceSource, /voiceName: "Aoede"/);
  assert.doesNotMatch(voiceSource, /speechSynthesis|SpeechSynthesisUtterance|speakWithBrowser/);
  assert.match(voiceSource, /cancelOutput\(\);/);
  assert.match(voiceSource, /socket\.readyState === WebSocket\.CONNECTING/);
  assert.doesNotMatch(voiceSource, /liveSocket\?\.close/);
  assert.match(panelSource, /if \(responseState\) renderOptions\(responseState\)/);
});

test("el chat permanente se asocia a la sesión activa sin iniciar el cuestionario", () => {
  const panelSource = fs.readFileSync(path.join(__dirname, "../../public/MarcieBlogEditor/js/components/marcie-agent-panel.js"), "utf8");
  const apiSource = fs.readFileSync(path.join(__dirname, "../../public/MarcieBlogEditor/js/services/marcie-agent-api.js"), "utf8");
  const run = initialAssistantRun({ uid: "user-1", sessionId: "session-1" });
  assert.equal(run.phase, "reviewing");
  assert.equal(run.status, "reviewing");
  assert.equal(run.sessionId, "session-1");
  assert.match(panelSource, /mode: guide \? "configuration" : "assistant"/);
  assert.match(panelSource, /sessionId: activeSession\?\.id/);
  assert.match(apiSource, /\{ runId, input, mode, sessionId \}/);
  assert.match(apiSource, /\/api\/marcie\/agent\/history\?sessionId=/);
  assert.match(panelSource, /async function loadSession\(session/);
  assert.match(panelSource, /history\.messages/);
  assert.match(panelSource, /return \{ loadSession, startGuidedSession \}/);
  assert.match(panelSource, /Vista previa de cambios/);
  assert.match(panelSource, />Antes</);
  assert.match(panelSource, />Después</);
  assert.match(panelSource, /Sin aplicar/);
});

test("avanza por los recursos de cada público sin quedar detenido", async () => {
  const run = initialRun({ uid: "user-1" });
  run.phase = "resources";
  run.configuration.selectedAudiences = ["educators", "parents"];
  run.configuration.resourceMode = "per_audience";

  let response = await advanceRun(run, { selectedValues: ["apa7", "quotes"] }, { db: {} });
  assert.equal(response.phase, "resources");
  assert.match(response.message, /Padres y familias/);

  response = await advanceRun(run, { selectedValues: ["lists", "seo"] }, { db: {} });
  assert.equal(response.phase, "vocabulary");
  assert.deepEqual(run.configuration.resourcesByAudience.parents, ["lists", "seo"]);
});

test("reconoce una URL de YouTube escrita al iniciar y analiza el video", async () => {
  const run = initialRun({ uid: "user-1" });
  const response = await advanceRun(run, { text: "Usa como base https://youtu.be/dQw4w9WgXcQ" }, {
    db: {},
    analyzeYoutubeVideos: async ({ urls }) => ({
      videos: [{ videoId: "dQw4w9WgXcQ", url: urls[0], title: "Video base" }],
      proposedTopics: ["Aprendizaje activo"],
      warnings: []
    })
  });
  assert.equal(response.phase, "video_topic");
  assert.equal(run.configuration.creationSource, "youtube");
  assert.deepEqual(run.configuration.sourceInputs.youtube, [{ videoId: "dQw4w9WgXcQ", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }]);
});

test("conserva la intención escrita junto al video como objetivo obligatorio", async () => {
  const run = initialRun({ uid: "user-1" });
  let receivedObjective = "";
  await advanceRun(run, { text: "Usa este video como base para explicar la evaluación formativa https://youtu.be/dQw4w9WgXcQ" }, {
    db: {},
    analyzeYoutubeVideos: async ({ urls, objective }) => {
      receivedObjective = objective;
      return { videos: [{ videoId: "dQw4w9WgXcQ", url: urls[0], title: "Evaluación" }], proposedTopics: ["Evaluación formativa"], warnings: [] };
    }
  });
  assert.match(receivedObjective, /evaluación formativa/i);
  assert.equal(run.configuration.videoObjective, receivedObjective);
  assert.equal(run.configuration.videoResearch.objective, receivedObjective);
});

test("responde preguntas durante la configuración sin avanzar ni seleccionar opciones", async () => {
  const run = initialRun({ uid: "user-1" });
  run.phase = "resources";
  run.configuration.topic = "Evaluación formativa";
  run.configuration.selectedAudiences = ["educators"];
  run.configuration.resourceMode = "same";
  const before = structuredClone(run.configuration);
  const response = await processAgentTurn(run, { text: "¿Para qué funciona la bibliografía APA 7?" }, {
    generateText: async () => JSON.stringify({
      answer: "APA 7 organiza las referencias y permite identificar de dónde proviene la información. Cuando quieras, selecciona los recursos editoriales.",
      speechText: "APA 7 ayuda a reconocer claramente las fuentes. Ahora puedes elegir los recursos que prefieras."
    })
  });
  assert.equal(run.phase, "resources");
  assert.deepEqual(run.configuration, before);
  assert.equal(response.conversationalInterruption, true);
  assert.match(response.message, /organiza las referencias/i);
  assert.equal(response.uiPrompt.type, "multi_choice");
});

test("personaliza la transición oral sin alterar el estado determinista", async () => {
  const run = initialRun({ uid: "user-1" });
  run.phase = "tone";
  run.configuration.topic = "Evaluación formativa";
  run.configuration.selectedAudiences = ["educators"];
  const response = await processAgentTurn(run, { value: "warm", text: "Cálido y cercano" }, {
    generateText: async () => JSON.stringify({ message: "Un tono cálido ayudará a acercar el tema a docentes. ¿Todos los artículos tendrán la misma extensión?", speechText: "Bien, lo contaremos con cercanía. ¿Quieres la misma extensión para todos?" })
  });
  assert.equal(run.configuration.tone, "Cálido y cercano");
  assert.equal(run.phase, "length_mode");
  assert.match(response.message, /acercar el tema/i);
  assert.match(response.speechText, /misma extensión/i);
});

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
    "generate_audience_proposals", "analyze_youtube_videos", "research_sources", "draft_articles",
    "verify_article_claims", "format_bibliography_apa7", "review_article",
    "revise_article", "manage_vocabulary", "prepare_wordpress_draft"
  ].forEach((name) => assert.ok(names.includes(name), `falta ${name}`));
  await client.close();
  await server.close();
});

test("inicia con una pregunta abierta y permite indicar una URL sin opción dedicada", () => {
  const run = initialRun({ uid: "user-1", displayName: "Waldo" });
  const response = phasePrompt(run);
  assert.equal(response.phase, "creation_source");
  assert.match(response.speechText, /Hola, Waldo/);
  assert.equal(response.uiPrompt.type, "text");
  assert.deepEqual(response.uiPrompt.options, []);
  assert.match(response.message, /URL de YouTube/);
  assert.deepEqual(response.missingFields, ["creationSource", "topic", "selectedAudiences", "tone", "resources"]);
});

test("completa la configuración guiada y exige confirmación", async () => {
  const run = initialRun({ uid: "user-1", displayName: "Waldo" });
  const context = { db: {}, generateText: null };

  let response = await advanceRun(run, { value: "topic" }, context);
  assert.equal(response.phase, "topic");
  response = await advanceRun(run, { text: "Aprendizaje basado en proyectos" }, context);
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

test("analiza YouTube antes de proponer el tema y conserva el expediente", async () => {
  const run = initialRun({ uid: "user-1", displayName: "Waldo" });
  const videoResearch = {
    analysisVersion: 1,
    videos: [{ videoId: "dQw4w9WgXcQ", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Aprender mejor" }],
    proposedTopics: ["Cómo aprende el cerebro"],
    evidenceItems: [],
    bibliographySources: []
  };
  const context = { db: {}, analyzeYoutubeVideos: async () => videoResearch };

  let response = await advanceRun(run, { value: "youtube" }, context);
  assert.equal(response.phase, "youtube_urls");
  assert.equal(response.uiPrompt.type, "url_list");

  response = await advanceRun(run, { urls: ["https://youtu.be/dQw4w9WgXcQ"] }, context);
  assert.equal(response.phase, "video_topic");
  assert.equal(response.videoResearch.videos[0].videoId, "dQw4w9WgXcQ");
  assert.deepEqual(run.configuration.sourceInputs.youtube, [{ videoId: "dQw4w9WgXcQ", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }]);

  response = await advanceRun(run, { value: "video-topic-1" }, context);
  assert.equal(response.phase, "audiences");
  assert.equal(run.configuration.topic, "Cómo aprende el cerebro");
  assert.equal(sessionRequestFromRun(run).videoResearch.analysisVersion, 1);
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
  let generationCall = 0;
  const generateText = async () => {
    generationCall += 1;
    if (generationCall === 1) return JSON.stringify({ intent: "revise", audience: "educators", instruction: "Corrige la claridad del artículo" });
    return JSON.stringify({ article: { ...stored.article, title: "Tema revisado" }, findings: ["Se aclaró la introducción."], summary: "Preparé una versión más clara." });
  };

  let response = await advanceRun(run, { text: "Corrige la claridad del artículo" }, { db, uid: "user-1", generateText });
  assert.equal(response.uiPrompt.type, "change_preview");
  assert.equal(run.pendingChange.baseRevision, 0);
  assert.equal(stored.articlesByAudience.educators.revision, 0);
  assert.equal(response.changePreview.original.title, "Tema");
  assert.equal(response.changePreview.preview.title, "Tema revisado");
  assert.deepEqual(response.changePreview.changes[0], {
    scope: "title",
    label: "Título",
    before: "Tema",
    after: "Tema revisado",
    rationale: ""
  });

  response = await advanceRun(run, { action: "apply_change" }, { db, uid: "user-1" });
  assert.match(response.message, /Apliqué los cambios/);
  assert.equal(stored.articlesByAudience.educators.revision, 1);
  assert.deepEqual(stored.approvedAudiences, []);
});

test("Marcie puede proponer la edición de un solo fragmento sin tocar el resto", async () => {
  let stored = {
    ownerId: "user-1",
    title: "Tema",
    topic: "Tema",
    audience: "educators",
    article: {
      title: "Tema",
      blocks: [
        { type: "paragraph", text: "Primer párrafo intacto." },
        { type: "paragraph", text: "Segundo párrafo por mejorar." }
      ],
      revision: 3
    },
    articlesByAudience: {}
  };
  stored.articlesByAudience.educators = stored.article;
  const ref = {
    async get() { return { exists: true, id: "session-1", data: () => stored }; },
    async set(value) { stored = { ...stored, ...value }; }
  };
  const db = { collection() { return { doc() { return ref; } }; } };
  const run = { ...initialRun({ uid: "user-1" }), sessionId: "session-1", phase: "completed", status: "completed" };
  let generationCall = 0;
  const generateText = async () => {
    generationCall += 1;
    if (generationCall === 1) return JSON.stringify({ intent: "revise", audience: "educators", instruction: "Haz más claro el segundo párrafo" });
    return JSON.stringify({
      article: {
        ...stored.article,
        blocks: [
          stored.article.blocks[0],
          { type: "paragraph", text: "Segundo párrafo explicado con mayor claridad." }
        ]
      },
      findings: ["El segundo párrafo podía ser más directo."],
      summary: "Preparé una mejora puntual.",
      changes: [{ scope: "paragraph", blockIndex: 1, label: "Segundo párrafo", before: "texto incorrecto del modelo", after: "otro texto", rationale: "Mejora la claridad." }]
    });
  };

  const response = await advanceRun(run, { text: "Haz más claro el segundo párrafo" }, { db, uid: "user-1", generateText });
  assert.equal(response.uiPrompt.type, "change_preview");
  assert.equal(response.changePreview.changes.length, 1);
  assert.deepEqual(response.changePreview.changes[0], {
    scope: "paragraph",
    label: "Segundo párrafo",
    before: "Segundo párrafo por mejorar.",
    after: "Segundo párrafo explicado con mayor claridad.",
    rationale: "Mejora la claridad."
  });
  assert.equal(response.changePreview.preview.blocks[0].text, "Primer párrafo intacto.");
  assert.equal(stored.articlesByAudience.educators.revision, 3);
});

test("restaura el historial de la sesión y conserva una propuesta pendiente", async () => {
  const session = {
    ownerId: "user-1",
    audience: "educators",
    article: { title: "Actual", blocks: [{ type: "paragraph", text: "Texto actual" }], revision: 4 },
    articlesByAudience: { educators: { title: "Actual", blocks: [{ type: "paragraph", text: "Texto actual" }], revision: 4 } }
  };
  const runs = [
    { id: "run-old", ownerId: "user-1", sessionId: "session-1", updatedAt: "2026-09-21T10:00:00.000Z" },
    {
      id: "run-new",
      ownerId: "user-1",
      sessionId: "session-1",
      updatedAt: "2026-09-22T10:00:00.000Z",
      pendingChange: {
        audience: "educators",
        baseRevision: 4,
        preview: { title: "Propuesta", blocks: [{ type: "paragraph", text: "Texto propuesto" }], revision: 4 },
        findings: ["Puede ser más claro."]
      }
    }
  ];
  const messages = [
    { id: "m2", role: "assistant", text: "Aquí está la propuesta.", createdAt: "2026-09-22T10:00:02.000Z" },
    { id: "m1", role: "user", text: "Mejora la introducción.", createdAt: "2026-09-22T10:00:01.000Z" }
  ];
  const messageSnapshot = { forEach(callback) { messages.forEach((item) => callback({ id: item.id, data: () => item })); } };
  const db = {
    collection(name) {
      if (name === "MarcieBlogEditor") return { doc() { return { async get() { return { exists: true, id: "session-1", data: () => session }; } }; } };
      if (name === "MarcieEditorialAgentRuns") return {
        where() { return { async get() { return { forEach(callback) { runs.forEach((item) => callback({ id: item.id, data: () => item })); } }; } }; },
        doc(id) {
          assert.equal(id, "run-new");
          return { collection() { return { orderBy() { return { limit() { return { async get() { return messageSnapshot; } }; } }; } }; } };
        }
      };
      throw new Error(`Colección inesperada: ${name}`);
    }
  };

  const history = await readSessionHistory({ db, uid: "user-1" }, "session-1");
  assert.equal(history.runId, "run-new");
  assert.deepEqual(history.messages.map((item) => item.text), ["Mejora la introducción.", "Aquí está la propuesta."]);
  assert.equal(history.pendingChange.original.title, "Actual");
  assert.equal(history.pendingChange.preview.title, "Propuesta");
  assert.ok(history.pendingChange.changes.some((change) => change.before === "Texto actual" && change.after === "Texto propuesto"));
});

test("analiza el artículo solicitado sin volver al flujo de configuración", async () => {
  const stored = {
    ownerId: "user-1",
    title: "Evaluación formativa",
    topic: "Evaluación formativa",
    audience: "parents",
    article: { title: "Versión familiar", blocks: [{ type: "paragraph", text: "Familias" }], revision: 0 },
    articlesByAudience: {
      parents: { title: "Versión familiar", blocks: [{ type: "paragraph", text: "Familias" }], revision: 0 },
      educators: { title: "Versión docente", blocks: [{ type: "paragraph", text: "Docentes" }], revision: 2 }
    }
  };
  const ref = { async get() { return { exists: true, id: "session-1", data: () => stored }; } };
  const db = { collection() { return { doc() { return ref; } }; } };
  const prompts = [];
  const generateText = async ({ prompt }) => {
    prompts.push(prompt);
    if (prompts.length === 1) return JSON.stringify({ intent: "analyze", audience: "educators", instruction: "Analiza claridad, rigor y adecuación para docentes." });
    return JSON.stringify({ article: stored.articlesByAudience.educators, findings: ["La estructura es clara.", "Falta respaldar una afirmación."], summary: "El artículo docente es claro, pero necesita reforzar una afirmación con evidencia." });
  };
  const run = initialAssistantRun({ uid: "user-1", sessionId: "session-1" });
  const response = await processAgentTurn(run, { text: "Analiza el artículo de docentes", audience: "parents" }, { db, uid: "user-1", generateText });
  assert.equal(response.phase, "reviewing");
  assert.equal(response.uiPrompt.type, "text");
  assert.equal(response.audience, "educators");
  assert.match(response.message, /artículo docente es claro/i);
  assert.doesNotMatch(response.message, /públicos|tono|extensión/i);
  assert.match(prompts[0], /NO inicies ni continúes el cuestionario/);
});

test("un error interno del modelo no rompe el análisis ni reinicia el cuestionario", async () => {
  const stored = {
    ownerId: "user-1",
    audience: "educators",
    article: { title: "Evaluación formativa", subtitle: "Guía docente", blocks: [{ type: "paragraph", text: "Contenido breve para docentes." }], sources: [], revision: 0 },
    articlesByAudience: {
      educators: { title: "Evaluación formativa", subtitle: "Guía docente", blocks: [{ type: "paragraph", text: "Contenido breve para docentes." }], sources: [], revision: 0 }
    }
  };
  const ref = { async get() { return { exists: true, id: "session-1", data: () => stored }; } };
  const db = { collection() { return { doc() { return ref; } }; } };
  const internalError = new Error('{"error":{"code":500,"message":"Internal error encountered.","status":"INTERNAL"}}');
  const run = initialAssistantRun({ uid: "user-1", sessionId: "session-1" });
  const response = await processAgentTurn(run, { text: "Analiza el artículo de docentes" }, {
    db,
    uid: "user-1",
    generateText: async () => { throw internalError; }
  });
  assert.equal(response.phase, "reviewing");
  assert.equal(response.audience, "educators");
  assert.match(response.message, /comprobación estructural/i);
  assert.doesNotMatch(response.message, /tema|tono|extensión/i);
});

test("el redactor MCP incluye solo videos utilizados en la bibliografía del artículo", async () => {
  const documentSource = { id: "doc-1", sourceType: "web", title: "Documento", url: "https://example.org/doc" };
  const usedVideo = { id: "youtube-dQw4w9WgXcQ", sourceType: "youtube_video", title: "Video usado", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" };
  const unusedVideo = { id: "youtube-9bZkp7q19f0", sourceType: "youtube_video", title: "Video no usado", url: "https://www.youtube.com/watch?v=9bZkp7q19f0" };
  const handlers = createToolHandlers({ generateText: async () => JSON.stringify({ title: "Artículo", blocks: [{ id: "b1", text: "La autora explica...", sourceIds: [usedVideo.id], locator: "02:14" }], seo: {} }) });
  const result = await handlers.draft_articles({ topic: "Tema", audiences: ["educators"], evidenceByAudience: { educators: { sources: [documentSource, usedVideo, unusedVideo] } } });
  assert.deepEqual(result.articles.educators.sources.map((source) => source.id), ["doc-1", usedVideo.id]);
  assert.deepEqual(result.articles.educators.researchSources.map((source) => source.id), ["doc-1", usedVideo.id, unusedVideo.id]);
});

test("las propuestas por público reciben la síntesis y los conceptos del video", async () => {
  let receivedPrompt = "";
  const handlers = createToolHandlers({ generateText: async ({ prompt }) => {
    receivedPrompt = prompt;
    return JSON.stringify({ proposals: { educators: [{ title: "Retroalimentar para aprender" }, { title: "Evaluación que orienta" }, { title: "Evidencia para ajustar la enseñanza" }] } });
  } });
  const result = await handlers.generate_audience_proposals({
    topic: "Evaluación formativa",
    audiences: ["educators"],
    videoEvidence: { objective: "Explicar evaluación formativa", combinedSynthesis: "La retroalimentación orienta el siguiente paso.", videos: [{ title: "Evaluar para aprender", summary: "La autora diferencia calificar de retroalimentar.", concepts: ["retroalimentación"] }] }
  });
  assert.match(receivedPrompt, /base conceptual obligatoria/i);
  assert.match(receivedPrompt, /La autora diferencia calificar de retroalimentar/);
  assert.equal(result.proposalsByAudience.educators.length, 3);
});

test("la interfaz ofrece YouTube en agente y configuración manual", () => {
  const panelSource = fs.readFileSync(path.join(__dirname, "../../public/MarcieBlogEditor/js/components/marcie-agent-panel.js"), "utf8");
  const modalSource = fs.readFileSync(path.join(__dirname, "../../public/MarcieBlogEditor/js/components/modals.js"), "utf8");
  assert.match(panelSource, /prompt\.type === "url_list"/);
  assert.match(panelSource, /data-analyze-youtube/);
  assert.match(panelSource, /data-video-progress/);
  assert.match(modalSource, /new-session-youtube-toggle/);
  assert.match(modalSource, /new-session-youtube-analyze/);
  assert.match(modalSource, /Analiza los videos antes de crear la sesión/);
  assert.doesNotMatch(modalSource, /data-session-choice="youtube"/);
});
