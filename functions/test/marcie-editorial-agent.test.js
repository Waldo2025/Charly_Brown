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
  initialRun,
  missingFields,
  normalizeKey,
  phasePrompt,
  processAgentTurn,
  sessionRequestFromRun,
  uniqueStrings
} = require("../src/marcie-editorial-agent.js");

test("la creación usa la guía de voz y mantiene el chat MCP visible en el panel", () => {
  const panelSource = fs.readFileSync(path.join(__dirname, "../../public/MarcieBlogEditor/js/components/marcie-agent-panel.js"), "utf8");
  const voiceSource = fs.readFileSync(path.join(__dirname, "../../public/MarcieBlogEditor/js/services/marcie-agent-voice.js"), "utf8");
  assert.match(panelSource, /renderPanelMessages\(\);[\s\S]*openVoiceGuide\(\);/);
  assert.doesNotMatch(panelSource, /host\.hidden = true/);
  assert.match(panelSource, /Marcie te guía por voz/);
  assert.match(panelSource, /Pulsar para hablar/);
  assert.match(panelSource, /Escribe una instrucción para Marcie/);
  assert.match(panelSource, /Hablando con Marcie/);
  assert.doesNotMatch(panelSource, /Gemini está revisando/);
  assert.doesNotMatch(panelSource, /Conectando con Gemini/);
  assert.match(voiceSource, /speakWithGeminiLive/);
  assert.match(voiceSource, /voiceName: "Aoede"/);
  assert.match(voiceSource, /cancelOutput\(\);/);
  assert.match(voiceSource, /socket\.readyState === WebSocket\.CONNECTING/);
  assert.doesNotMatch(voiceSource, /liveSocket\?\.close/);
  assert.match(panelSource, /if \(responseState\) renderOptions\(responseState\)/);
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

  let response = await advanceRun(run, { text: "Corrige la claridad del artículo" }, { db, uid: "user-1" });
  assert.equal(response.uiPrompt.type, "change_preview");
  assert.equal(run.pendingChange.baseRevision, 0);
  assert.equal(stored.articlesByAudience.educators.revision, 0);

  response = await advanceRun(run, { action: "apply_change" }, { db, uid: "user-1" });
  assert.match(response.message, /Apliqué los cambios/);
  assert.equal(stored.articlesByAudience.educators.revision, 1);
  assert.deepEqual(stored.approvedAudiences, []);
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
