const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { InMemoryTransport } = require("@modelcontextprotocol/sdk/inMemory.js");
const { normalizeArticleRevision, withoutBibliographyBlocks } = require("../src/marcie-article-revision.js");
const bibliography = require("../src/marcie-bibliography.js");
const researchPolicy = require("../src/marcie-research-policy.js");
const { autoRepairEvidence, buildEvidenceRepairPreview, selectEvidenceClaim } = require("../src/marcie-evidence-repair.js");
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
  SEARCH_PLATFORMS,
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
  assert.match(panelSource, /Agente Marcie/);
  assert.doesNotMatch(panelSource, /Agente editorial MCP/);
  assert.match(panelSource, /data-guide-messages/);
  assert.match(panelSource, /const panelMessages = \[\]/);
  assert.match(panelSource, /const guideMessages = \[\]/);
  assert.match(panelSource, /guide \? guideMessages : panelMessages/);
  assert.match(panelSource, /function renderGuideMessages\(\)/);
  assert.match(panelSource, /data-agent-message-action="copy"/);
  assert.match(panelSource, /data-agent-message-action="edit"/);
  assert.match(panelSource, /navigator\.clipboard\?\.writeText/);
  assert.match(panelSource, /Mensaje listo para editar y volver a enviar/);
  assert.match(panelSource, /const target = options\.target \|\| \(guide \? "guide" : "panel"\)/);
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
  assert.match(panelSource, /voice\.cancelSpeech\(\);\s*busy = true/);
  assert.match(panelSource, /const queuedTurns = \[\]/);
  assert.match(panelSource, /function drainQueue\(\)/);
  assert.match(panelSource, /message\.queued = true/);
  assert.match(panelSource, /historyMessages = guideMessages\.filter\(\(message\) => !message\.queued\)/);
  assert.match(panelSource, /class="marcie-voice-guide__transcript" aria-live="polite" hidden/);
  assert.match(panelSource, />Mensajes en cola</);
  assert.match(panelSource, /pending = queuedTurns\.filter/);
  assert.match(panelSource, /guide\.transcriptContainer\.hidden = pending\.length === 0/);
  assert.doesNotMatch(panelSource, /Lo que entendí|data-guide-transcript/);
  assert.match(panelSource, /target === "guide" \? "configuration" : "assistant"/);
  assert.match(panelSource, /Marcie está analizando/);
  assert.match(panelSource, /tus mensajes quedarán en cola/);
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
  assert.match(voiceSource, /tono profesional, sereno y cordial/);
  assert.match(voiceSource, /respuesta final del agente MCP/);
  assert.match(voiceSource, /parts: \[\{ text: String\(text \|\| ""\)\.trim\(\) \}\]/);
  assert.doesNotMatch(voiceSource, /onSpokenText/);
  assert.match(panelSource, /const visibleText = response\.message/);
  assert.match(panelSource, /ignoredSpeechText: Boolean\(response\.speechText && response\.speechText !== visibleText\)/);
  assert.doesNotMatch(voiceSource, /speechSynthesis|SpeechSynthesisUtterance|speakWithBrowser/);
  assert.match(voiceSource, /cancelOutput\(\);/);
  assert.match(voiceSource, /socket\.readyState === WebSocket\.CONNECTING/);
  assert.doesNotMatch(voiceSource, /liveSocket\?\.close/);
  assert.match(panelSource, /if \(responseState\) renderOptions\(responseState\)/);
});

test("el modal de opciones muestra la pregunta concreta de la fase", () => {
  const run = initialRun({ uid: "user-1" });
  run.phase = "proposals";
  run.configuration.selectedAudiences = ["parents"];
  const response = phasePrompt(run);
  assert.match(response.uiPrompt.question, /Elige una propuesta para Padres y familias/);
  const panelSource = fs.readFileSync(path.join(__dirname, "../../public/MarcieBlogEditor/js/components/marcie-agent-panel.js"), "utf8");
  assert.match(panelSource, /data-options-question/);
  assert.match(panelSource, /prompt\.question \|\| response\.message/);
});

test("el chat permanente se asocia a la sesión activa sin iniciar el cuestionario", () => {
  const panelSource = fs.readFileSync(path.join(__dirname, "../../public/MarcieBlogEditor/js/components/marcie-agent-panel.js"), "utf8");
  const editorSource = fs.readFileSync(path.join(__dirname, "../../public/MarcieBlogEditor/js/editor-app.js"), "utf8");
  const apiSource = fs.readFileSync(path.join(__dirname, "../../public/MarcieBlogEditor/js/services/marcie-agent-api.js"), "utf8");
  const run = initialAssistantRun({ uid: "user-1", sessionId: "session-1" });
  assert.equal(run.phase, "reviewing");
  assert.equal(run.status, "reviewing");
  assert.equal(run.sessionId, "session-1");
  assert.match(panelSource, /const mode = target === "guide" \? "configuration" : "assistant"/);
  assert.match(panelSource, /const sessionId = activeSession\?\.id \|\| ""/);
  assert.match(panelSource, /sendAgentTurn\(runId, contextualInput,[\s\S]*sessionId/);
  assert.match(apiSource, /\{ runId, input, mode, sessionId \}/);
  assert.match(apiSource, /\/api\/marcie\/agent\/history\?sessionId=/);
  assert.match(panelSource, /async function loadSession\(session/);
  assert.match(panelSource, /history\.messages/);
  assert.match(panelSource, /return \{ loadSession, startGuidedSession, resolveEvidenceClaim \}/);
  assert.match(panelSource, /action: "resolve_evidence", value: id/);
  assert.match(editorSource, /data-review-evidence-claim=.*Resolver con Marcie/);
  assert.match(editorSource, /marcieAgentPanel\?\.resolveEvidenceClaim\(claim\)/);
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

test("recupera la guía cuando YouTube no entrega contenido analizable", async () => {
  const run = initialRun({ uid: "user-1" });
  const error = Object.assign(new Error("No pude analizar ninguno de los videos."), {
    code: "youtube_analysis_empty",
    status: 422,
    rejectedVideos: [{ videoId: "dQw4w9WgXcQ", reason: "youtube_public_captions_unavailable" }]
  });
  const response = await advanceRun(run, { text: "Usa este video como base https://youtu.be/dQw4w9WgXcQ" }, {
    db: {},
    analyzeYoutubeVideos: async () => { throw error; }
  });

  assert.equal(response.phase, "youtube_urls");
  assert.equal(response.uiPrompt.type, "url_list");
  assert.match(response.message, /No pude analizar el contenido del video/);
  assert.equal(response.rejectedVideos[0].videoId, "dQw4w9WgXcQ");
  assert.equal(run.status, "configuring");
});

test("permite continuar con tema escrito después de un bloqueo de YouTube", async () => {
  const run = initialRun({ uid: "user-1" });
  run.phase = "youtube_urls";
  run.configuration.creationSource = "youtube";

  const response = await advanceRun(run, { text: "Estrategias de evaluación formativa para docentes" }, { db: {} });

  assert.equal(response.phase, "audiences");
  assert.equal(run.configuration.creationSource, "topic");
  assert.equal(run.configuration.topic, "Estrategias de evaluación formativa para docentes");
  assert.deepEqual(run.configuration.sourceInputs.youtube, []);
  assert.equal(run.configuration.videoResearch, null);
});

test("no activa YouTube por menciones negadas o ambiguas de video", async () => {
  const run = initialRun({ uid: "user-1" });
  let called = false;
  const response = await advanceRun(run, { text: "Crea un artículo nuevo sin video sobre aprendizaje activo" }, {
    db: {},
    analyzeYoutubeVideos: async () => { called = true; }
  });

  assert.equal(response.phase, "audiences");
  assert.equal(run.configuration.creationSource, "topic");
  assert.equal(called, false);
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
  assert.equal(response.speechText, response.message);
  assert.equal(response.uiPrompt.type, "multi_choice");
});

test("un título que empieza por Cómo avanza la configuración en vez de repetirse como pregunta", async () => {
  const run = initialRun({ uid: "user-1" });
  run.phase = "proposals";
  run.configuration.topic = "Diálogo interno";
  run.configuration.selectedAudiences = ["parents"];
  run.configuration.proposalOptionsByAudience = { parents: [{ id: "parents-hook-1", title: "Cómo fomentar el diálogo interno en casa", kind: "hook" }] };
  const response = await processAgentTurn(run, { value: "parents-hook-1", text: "Cómo fomentar el diálogo interno en casa" }, {});
  assert.equal(response.phase, "tone");
  assert.equal(run.configuration.proposalsByAudience.parents, "Cómo fomentar el diálogo interno en casa");

  run.phase = "proposals";
  run.configuration.proposalsByAudience = {};
  const custom = await processAgentTurn(run, { text: "Cómo promover un diálogo saludable en casa" }, {});
  assert.equal(custom.phase, "tone");
  assert.equal(run.configuration.proposalsByAudience.parents, "Cómo promover un diálogo saludable en casa");
});

test("avanza con la respuesta base sin alterar el estado determinista", async () => {
  const run = initialRun({ uid: "user-1" });
  run.phase = "tone";
  run.configuration.topic = "Evaluación formativa";
  run.configuration.selectedAudiences = ["educators"];
  const response = await processAgentTurn(run, { value: "warm", text: "Cálido y cercano" }, {
    generateText: async () => JSON.stringify({ message: "Un tono cálido ayudará a acercar el tema a docentes. ¿Todos los artículos tendrán la misma extensión?", speechText: "Bien, lo contaremos con cercanía. ¿Quieres la misma extensión para todos?" })
  });
  assert.equal(run.configuration.tone, "Cálido y cercano");
  assert.equal(run.phase, "length_mode");
  assert.match(response.message, /misma extensión/i);
  assert.equal(response.speechText, response.message);
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
    "revise_article", "resolve_evidence_issue", "manage_vocabulary", "prepare_wordpress_draft"
  ].forEach((name) => assert.ok(names.includes(name), `falta ${name}`));
  await client.close();
  await server.close();
});

test("persiste en Firebase los análisis reutilizables de YouTube", () => {
  const agentSource = fs.readFileSync(path.join(__dirname, "../src/marcie-editorial-agent.js"), "utf8");
  assert.match(agentSource, /MarcieYoutubeAnalysisCache|YOUTUBE_ANALYSIS_CACHE_COLLECTION/);
  assert.match(agentSource, /readCachedAnalysis/);
  assert.match(agentSource, /writeCachedAnalysis/);
  assert.match(agentSource, /ownerId: auth\.uid/);
  assert.match(agentSource, /analysisVersion: ANALYSIS_VERSION/);
  assert.doesNotMatch(agentSource, /expiresAt:/);
});

test("inicia con una pregunta abierta y permite indicar una URL sin opción dedicada", () => {
  const run = initialRun({ uid: "user-1", displayName: "Waldo" });
  const response = phasePrompt(run);
  assert.equal(response.phase, "creation_source");
  assert.equal(response.speechText, response.message);
  assert.equal(response.uiPrompt.type, "text");
  assert.deepEqual(response.uiPrompt.options, []);
  assert.match(response.message, /URL de YouTube/);
  assert.deepEqual(response.missingFields, ["creationSource", "topic", "selectedAudiences", "tone", "resources"]);
});

test("el chat ofrece las mismas plataformas que el formulario manual y conserva la selección", async () => {
  const run = initialRun({ uid: "user-1" });
  run.phase = "sources";
  const prompt = phasePrompt(run);
  assert.equal(prompt.uiPrompt.type, "multi_choice");
  assert.deepEqual(prompt.uiPrompt.options.map((option) => option.id), SEARCH_PLATFORMS.map((platform) => platform.id));
  assert.deepEqual(SEARCH_PLATFORMS.map((platform) => platform.id), [...researchPolicy.platforms.map((platform) => platform.id), researchPolicy.supplemental.id]);
  assert.deepEqual(prompt.uiPrompt.options.map((option) => option.label), SEARCH_PLATFORMS.map((platform) => platform.label));
  assert.ok(prompt.uiPrompt.options.some((option) => option.id === "supplemental" && option.label === "Otros sitios fiables"));

  const selected = ["ebsco", "cochrane", "redalyc", "scielo", "dialnet", "base", "refseek", "supplemental"];
  const response = await advanceRun(run, { selectedValues: selected }, { db: {} });
  assert.equal(response.phase, "resource_mode");
  assert.deepEqual(run.configuration.searchPlatforms, selected);
  assert.deepEqual(sessionRequestFromRun(run).searchPlatforms, selected);
  assert.ok(sessionRequestFromRun(run).specifications.some((item) => item.startsWith("#plataformas[all]")));
});

test("Atrás vuelve a la fase anterior y las peticiones naturales abren la sección que se desea corregir", async () => {
  const run = initialRun({ uid: "user-1" });
  run.phase = "tone";
  run.configuration.selectedAudiences = ["educators"];
  run.configuration.proposalOptionsByAudience = { educators: [{ id: "educators-hook-1", title: "Título" }] };

  let response = await processAgentTurn(run, { text: "Atrás" }, { db: {} });
  assert.equal(response.navigation, "back");
  assert.equal(response.phase, "proposals");
  assert.equal(run.phase, "proposals");

  run.phase = "sources";
  response = await processAgentTurn(run, { text: "Quiero cambiar el tono y hacerlo más profesional" }, { db: {} });
  assert.equal(response.phase, "tone");
  assert.equal(run.phase, "tone");
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
  assert.equal(response.uiPrompt.options.length, 6);

  response = await advanceRun(run, { value: "educators-hook-1" }, context);
  assert.equal(response.phase, "proposals");
  response = await advanceRun(run, { value: "parents-hook-1" }, context);
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

test("separa instrucciones y públicos del tema después de analizar un video", async () => {
  const run = initialRun({ uid: "user-1" });
  run.phase = "video_topic";
  run.configuration.creationSource = "youtube";
  run.configuration.videoResearch = {
    proposedTopics: [
      "Bases neurobiológicas del diálogo interno y su correlación con la literatura sapiencial",
      "El impacto del lenguaje verbal y la rumiación en la plasticidad cerebral",
      "Convergencias entre terapia cognitivo-conductual y textos de Proverbios"
    ],
    videos: [{
      centralIdea: "El diálogo interno influye en la experiencia.",
      neuroeducationConnection: "El lenguaje se relaciona con emoción y autorregulación."
    }]
  };
  const instruction = "Necesito un artículo para docentes y padres de familia; toma como base el video, usa solo los datos científicos y no incluyas contenido religioso ni propaganda.";
  const response = await advanceRun(run, { text: instruction }, {
    db: {},
    generateText: async () => { throw new Error("modelo temporalmente no disponible"); }
  });

  assert.equal(response.phase, "proposals");
  assert.equal(run.configuration.topic, "El impacto del lenguaje verbal y la rumiación en la plasticidad cerebral");
  assert.deepEqual(run.configuration.selectedAudiences, ["educators", "parents"]);
  assert.deepEqual(run.configuration.editorialInstructions, [instruction]);
  assert.ok(response.uiPrompt.options.every((option) => !/necesito un artículo/i.test(option.label)));
  assert.ok(sessionRequestFromRun(run).specifications.some((item) => item === `#instruccion[all] ${instruction}`));
});

test("repara una sesión de video que ya guardó la instrucción completa como tema", async () => {
  const run = initialRun({ uid: "user-1" });
  const staleInstruction = "Necesito un artículo para docentes y padres de familia; usa solo datos científicos y evita contenido religioso.";
  run.phase = "proposals";
  run.configuration.creationSource = "youtube";
  run.configuration.topic = staleInstruction;
  run.configuration.selectedAudiences = ["educators", "parents"];
  run.configuration.videoResearch = {
    proposedTopics: [
      "Neurobiología y literatura sapiencial",
      "Lenguaje, emoción y plasticidad cerebral"
    ],
    videos: [{ centralIdea: "El lenguaje influye en la experiencia.", neuroeducationConnection: "Se relaciona con emoción y aprendizaje." }]
  };

  const response = await advanceRun(run, { value: "educators-1", text: `${staleInstruction}: guía práctica` }, {
    db: {},
    generateText: async () => { throw new Error("modelo temporalmente no disponible"); }
  });

  assert.equal(response.phase, "proposals");
  assert.equal(run.configuration.topic, "Lenguaje, emoción y plasticidad cerebral");
  assert.deepEqual(run.configuration.proposalsByAudience, {});
  assert.ok(response.uiPrompt.options.every((option) => !option.label.includes(staleInstruction)));
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

test("la revisión actualiza fuentes existentes sin insertar otra bibliografía en el cuerpo", async () => {
  const source = { id: "source-1", title: "Título anterior", authors: ["Ana Pérez"], year: "2024", url: "https://example.org/estudio", verified: true };
  const article = {
    title: "Tema", revision: 0,
    blocks: [{ type: "paragraph", text: "Contenido original." }],
    sources: [source], usedSources: [source]
  };
  let stored = {
    ownerId: "user-1", title: "Tema", topic: "Tema", audience: "parents",
    article, articlesByAudience: { parents: article }, approvedAudiences: ["parents"]
  };
  const ref = {
    async get() { return { exists: true, id: "session-1", data: () => stored }; },
    async set(value) { stored = { ...stored, ...value }; }
  };
  const db = { collection() { return { doc() { return ref; } }; } };
  const run = { ...initialRun({ uid: "user-1" }), sessionId: "session-1", phase: "completed", status: "completed" };
  let calls = 0;
  const generateText = async () => {
    calls += 1;
    if (calls === 1) return JSON.stringify({ intent: "revise", audience: "parents", instruction: "Corrige el artículo" });
    return JSON.stringify({
      article: {
        ...article,
        blocks: [
          { type: "paragraph", text: "Contenido corregido." },
          { type: "heading", text: "Referencias bibliográficas" },
          { type: "paragraph", text: "Ana Pérez (2024). Estudio. https://example.org/estudio" }
        ],
        sources: [{ ...source, title: "Título corregido" }, { id: "inventada", title: "Fuente no verificada", url: "https://example.org/falsa" }]
      },
      findings: []
    });
  };
  const preview = await advanceRun(run, { text: "Corrige el artículo" }, { db, uid: "user-1", generateText });
  assert.equal(preview.uiPrompt.type, "change_preview");
  assert.deepEqual(preview.changePreview.preview.blocks.map((block) => block.text), ["Contenido corregido."]);
  await advanceRun(run, { action: "apply_change" }, { db, uid: "user-1" });
  const revised = stored.articlesByAudience.parents;
  assert.deepEqual(revised.blocks.map((block) => block.text), ["Contenido corregido."]);
  assert.deepEqual(bibliography.sources(revised).map((item) => item.title), ["Título corregido"]);
  assert.equal(revised.sources[0].id, "source-1");
  assert.equal(revised.sources[0].url, source.url);
  assert.equal(revised.sources[0].verified, true);
  assert.equal(revised.revision, 1);
});

test("una vista previa pendiente anterior tampoco puede duplicar la bibliografía al aplicarse", async () => {
  const original = { title: "Tema", revision: 2, blocks: [{ type: "paragraph", text: "Texto" }], sources: [{ id: "source-1", title: "Documento", url: "https://example.org/documento" }] };
  let stored = { ownerId: "user-1", audience: "parents", article: original, articlesByAudience: { parents: original } };
  const ref = {
    async get() { return { exists: true, id: "session-1", data: () => stored }; },
    async set(value) { stored = { ...stored, ...value }; }
  };
  const run = { ...initialRun({ uid: "user-1" }), sessionId: "session-1", phase: "completed", status: "completed",
    pendingChange: { audience: "parents", baseRevision: 2, preview: { ...original, blocks: [{ type: "paragraph", text: "Texto mejorado.\n\nReferencias bibliográficas\nDocumento (2024)." }] } } };
  await advanceRun(run, { action: "apply_change" }, { db: { collection() { return { doc() { return ref; } }; } }, uid: "user-1" });
  assert.deepEqual(stored.article.blocks.map((block) => block.text), ["Texto mejorado."]);
  assert.equal(stored.article.sources.length, 1);
});

test("el agente repara una afirmación científica citada solo con video usando documentos comprobados", async () => {
  const claimText = "El rechazo activa una región cerebral relacionada con el dolor físico.";
  const video = { id: "youtube-video-1", title: "Video", sourceType: "youtube_video", url: "https://youtube.com/watch?v=demo", verificationStatus: "attributed_only" };
  const document = { id: "source-paper-1", title: "Estudio de rechazo social", authors: ["Autora, N."], year: "2024", url: "https://example.org/paper", verificationStatus: "verified" };
  const article = {
    title: "Tema", audience: "parents", revision: 2,
    blocks: [
      { id: "intro", type: "paragraph", text: "Introducción conservada." },
      { id: "claim-block", type: "paragraph", text: `${claimText} [youtube-video-1]`, sourceIds: [video.id] }
    ],
    sources: [video], researchSources: [video], usedSources: [video],
    articleClaims: [{ id: "claim-1", blockId: "claim-block", text: claimText, evidenceKind: "external_fact", status: "unsupported", sourceIds: [], supportSummary: "El video no respalda hechos independientes." }],
    verification: { status: "blocked", blockers: [claimText] }
  };
  let stored = { ownerId: "user-1", title: "Tema", topic: "Tema", audience: "parents", article, articlesByAudience: { parents: article }, approvedAudiences: ["parents"] };
  const ref = {
    async get() { return { exists: true, id: "session-1", data: () => stored }; },
    async set(value) { stored = { ...stored, ...value }; }
  };
  const db = { collection() { return { doc() { return ref; } }; } };
  const run = { ...initialRun({ uid: "user-1" }), sessionId: "session-1", phase: "completed", status: "completed" };
  let verificationCalls = 0;
  const verifyArticleEvidence = async () => {
    verificationCalls += 1;
    return { ...article, sources: [video, document], researchSources: [video, document], articleClaims: [{ ...article.articleClaims[0], status: "supported", sourceIds: [document.id] }] };
  };
  const response = await advanceRun(run, { action: "resolve_evidence", value: "claim-1", audience: "parents", text: "Resuelve la afirmación sin respaldo" }, { db, uid: "user-1", verifyArticleEvidence });
  assert.equal(response.uiPrompt.type, "change_preview");
  assert.equal(verificationCalls, 1);
  assert.deepEqual(response.changePreview.preview.blocks.map((block) => block.text), ["Introducción conservada.", claimText]);
  assert.equal(run.pendingChange.kind, "evidence_repair");
  assert.deepEqual(run.pendingChange.preview.blocks[1].sourceIds, [document.id]);
  assert.equal(run.pendingChange.preview.verification.status, "pending");
  assert.deepEqual(stored.article.sources, [video]);
  assert.match(JSON.stringify(response.changePreview.changes), /Estudio de rechazo social/);
  stored.article.blocks[0].text = "Introducción editada mientras Marcie investigaba.";
  await assert.rejects(
    advanceRun(run, { action: "apply_change" }, { db, uid: "user-1" }),
    (error) => error.status === 409
  );
  assert.equal(stored.article.revision, 2);
  stored.article.blocks[0].text = "Introducción conservada.";
  await advanceRun(run, { action: "apply_change" }, { db, uid: "user-1" });
  assert.equal(stored.article.revision, 3);
  assert.deepEqual(stored.article.blocks[1].sourceIds, [document.id]);
  assert.equal(stored.article.sources.some((source) => source.id === document.id), true);
  assert.equal(bibliography.integrity(stored.article).valid, true);
  assert.equal(stored.article.verification.status, "pending");
  assert.deepEqual(stored.approvedAudiences, []);
});

test("sin documento comprobado conserva la afirmación del autor", async () => {
  const claim = { id: "claim-1", text: "El video demuestra que el rechazo activa el dolor físico.", status: "unsupported" };
  const article = { title: "Tema", revision: 1, blocks: [
    { id: "intro", type: "paragraph", text: "Contexto válido." },
    { id: "claim-block", type: "paragraph", text: claim.text, sourceIds: ["youtube-video-1"] }
  ], articleClaims: [claim], sources: [{ id: "youtube-video-1", title: "Video", sourceType: "youtube_video", url: "https://youtube.com/watch?v=demo" }] };
  const repair = buildEvidenceRepairPreview(article, claim, { ...article, articleClaims: [{ ...claim, status: "unsupported", sourceIds: [] }] });
  assert.equal(repair, null);
  assert.equal(article.blocks.length, 2);
  assert.equal(selectEvidenceClaim(article, "claim-1"), claim);
  assert.equal(selectEvidenceClaim({ ...article, articleClaims: [claim, { id: "claim-2", text: "Otra afirmación.", status: "unsupported" }] }), null);
});

test("un documento sin verificación no respalda una afirmación externa", () => {
  const claim = { id: "claim-1", text: "Una afirmación científica sin respaldo.", status: "unsupported" };
  const article = { blocks: [
    { id: "intro", type: "paragraph", text: "Introducción conservada." },
    { id: "claim-block", type: "paragraph", text: claim.text, sourceIds: ["youtube-video-1"] }
  ], articleClaims: [claim] };
  const source = { id: "paper-unverified", title: "Estudio sin verificar", sourceType: "journal_article", verificationStatus: "unverified" };
  const repair = buildEvidenceRepairPreview(article, claim, {
    sources: [source], articleClaims: [{ ...claim, status: "supported", sourceIds: [source.id] }]
  });
  assert.equal(repair, null);
  assert.deepEqual(article.blocks.map((block) => block.text), ["Introducción conservada.", claim.text]);
});

test("la comprobación conserva afirmaciones y secciones aunque la evidencia quede pendiente", () => {
  const document = { id: "source-valid", title: "Documento", authors: ["Autora, Ana"], year: "2024", publisher: "Universidad", url: "https://example.org/documento", verificationStatus: "verified" };
  const video = { id: "youtube-demo", title: "Video", channel: "Canal", url: "https://youtube.com/watch?v=demo", sourceType: "youtube_video", verificationStatus: "attributed_only" };
  const article = {
    title: "Artículo", sources: [document, video], researchSources: [document, video],
    blocks: [
      { id: "intro", type: "paragraph", text: "Introducción respaldada.", sourceIds: [document.id] },
      { id: "fact", type: "paragraph", text: "El rechazo activa un circuito cerebral específico.", sourceIds: [video.id] },
      { id: "orphan", type: "paragraph", text: "Dato sin documento [source-missing]." },
      { id: "video", type: "paragraph", text: "El video propone una estrategia.", sourceIds: [video.id] }
    ],
    articleClaims: [{ id: "claim-1", blockId: "fact", text: "El rechazo activa un circuito cerebral específico.", status: "unsupported", evidenceKind: "external_fact" }],
    verification: { status: "blocked", blockers: ["Falta evidencia"] }
  };
  const result = autoRepairEvidence(article);
  assert.equal(result.changed, false);
  assert.equal(result.article, article);
  assert.deepEqual(result.article.blocks.map((block) => block.id), ["intro", "fact", "orphan", "video"]);
  assert.deepEqual(result.corrections, []);
  assert.equal(result.article.verification.status, "blocked");
});

test("la corrección automática no sustituye las palabras del autor por un documento", () => {
  const claimText = "La investigación describe una respuesta al rechazo.";
  const document = { id: "source-paper", title: "Estudio", authors: ["Autora, Ana"], year: "2024", publisher: "Universidad", url: "https://example.org/paper", verificationStatus: "verified" };
  const video = { id: "youtube-demo", title: "Video", channel: "Canal", url: "https://youtube.com/watch?v=demo", sourceType: "youtube_video", verificationStatus: "attributed_only" };
  const article = {
    title: "Artículo", sources: [document, video], researchSources: [document, video],
    blocks: [{ id: "intro", type: "paragraph", text: "Introducción." }, { id: "claim", type: "paragraph", text: `${claimText} [youtube-demo]`, sourceIds: [video.id] }],
    articleClaims: [{ id: "c1", blockId: "claim", text: claimText, evidenceKind: "external_fact", status: "supported", sourceIds: [document.id] }]
  };
  const result = autoRepairEvidence(article);
  assert.equal(result.changed, false);
  assert.equal(result.article.blocks[1].text, `${claimText} [youtube-demo]`);
  assert.deepEqual(result.article.blocks[1].sourceIds, [video.id]);
  assert.deepEqual(result.corrections, []);
  assert.equal(autoRepairEvidence(result.article).changed, false);
});

test("conserva bloques normales y recorta solo la sección bibliográfica", () => {
  const blocks = [{ type: "heading", text: "Conclusiones" }, { type: "paragraph", text: "Texto final.\n\n## Bibliografía\nFuente APA" }];
  assert.deepEqual(withoutBibliographyBlocks(blocks).map((block) => block.text), ["Conclusiones", "Texto final."]);
  assert.deepEqual(normalizeArticleRevision({ blocks }, { blocks }).blocks.map((block) => block.text), ["Conclusiones", "Texto final."]);
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
      patches: [{ index: 1, text: "Segundo párrafo explicado con mayor claridad.", rationale: "Mejora la claridad." }],
      findings: ["El segundo párrafo podía ser más directo."],
      summary: "Preparé una mejora puntual.",
      article: { blocks: [{ text: "Intento de reemplazar todo el artículo" }] }
    });
  };

  const response = await advanceRun(run, { text: "Haz más claro el segundo párrafo" }, { db, uid: "user-1", generateText });
  assert.equal(response.uiPrompt.type, "change_preview");
  assert.equal(response.changePreview.changes.length, 1);
  assert.deepEqual(response.changePreview.changes[0], {
    scope: "paragraph",
    label: "Bloque 2",
    before: "Segundo párrafo por mejorar.",
    after: "Segundo párrafo explicado con mayor claridad.",
    rationale: "Mejora la claridad."
  });
  assert.equal(response.changePreview.preview.blocks[0].text, "Primer párrafo intacto.");
  assert.equal(stored.articlesByAudience.educators.revision, 3);
  assert.equal(run.pendingChange.kind, "targeted_revision");
  stored.article.blocks[0].text = "Edición concurrente.";
  await assert.rejects(advanceRun(run, { action: "apply_change" }, { db, uid: "user-1" }), (error) => error.status === 409);
  stored.article.blocks[0].text = "Primer párrafo intacto.";
  await advanceRun(run, { action: "apply_change" }, { db, uid: "user-1" });
  assert.equal(stored.articlesByAudience.educators.blocks[0].text, "Primer párrafo intacto.");
  assert.equal(stored.articlesByAudience.educators.blocks[1].text, "Segundo párrafo explicado con mayor claridad.");
  assert.equal(stored.articlesByAudience.educators.verification.status, "pending");
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
    return JSON.stringify({ proposals: { educators: {
      hooks: [{ title: "Retroalimentar para aprender" }, { title: "Evaluación que orienta" }, { title: "Evidencia para ajustar la enseñanza" }],
      antihooks: [{ title: "Cuando evaluar no ayuda" }, { title: "Errores que frenan la retroalimentación" }, { title: "Señales de una evaluación poco útil" }]
    } } });
  } });
  const result = await handlers.generate_audience_proposals({
    topic: "Evaluación formativa",
    audiences: ["educators"],
    videoEvidence: { objective: "Explicar evaluación formativa", combinedSynthesis: "La retroalimentación orienta el siguiente paso.", videos: [{ title: "Evaluar para aprender", summary: "La autora diferencia calificar de retroalimentar.", centralIdea: "Evaluar debe orientar el aprendizaje.", neuroeducationConnection: "La retroalimentación favorece metacognición y autorregulación.", concepts: ["retroalimentación"] }] }
  });
  assert.match(receivedPrompt, /base conceptual obligatoria/i);
  assert.match(receivedPrompt, /idea central comprobable del video y su relación pertinente con la neuroeducación/i);
  assert.match(receivedPrompt, /metacognición y autorregulación/);
  assert.match(receivedPrompt, /La autora diferencia calificar de retroalimentar/);
  assert.equal(result.proposalsByAudience.educators.length, 6);
  assert.deepEqual(result.proposalsByAudience.educators.map((item) => item.kind), ["hook", "hook", "hook", "antihook", "antihook", "antihook"]);
});

test("el redactor MCP exige idea central y relación con neuroeducación", async () => {
  let receivedPrompt = "";
  const handlers = createToolHandlers({ generateText: async ({ prompt }) => {
    receivedPrompt = prompt;
    return JSON.stringify({ title: "Artículo", blocks: [], seo: {} });
  } });
  await handlers.draft_articles({
    topic: "Lenguaje y aprendizaje",
    audiences: ["educators"],
    videoEvidence: { videos: [{ centralIdea: "Las palabras influyen en la experiencia.", neuroeducationConnection: "Relación con emoción y autorregulación." }] }
  });
  assert.match(receivedPrompt, /dos ejes/i);
  assert.match(receivedPrompt, /idea central del video/i);
  assert.match(receivedPrompt, /relación con la neuroeducación/i);
  assert.match(receivedPrompt, /No atribuyas al video una relación neurocientífica que no sostenga/i);
});

test("el flujo automático del editor conserva los dos ejes del video", () => {
  const modeSource = fs.readFileSync(path.join(__dirname, "../../public/MarcieBlogEditor/js/services/marcie-mode-service.js"), "utf8");
  assert.match(modeSource, /BASE DE VIDEO OBLIGATORIA PARA LA REDACCIÓN/);
  assert.match(modeSource, /idea central del video y su relación con la neuroeducación/);
  assert.match(modeSource, /videoEditorialInstruction\(session\.videoResearch/);
  assert.match(modeSource, /No atribuyas al video explicaciones neurocientíficas añadidas por las fuentes/);
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
