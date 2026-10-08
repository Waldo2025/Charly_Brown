const test = require("node:test");
const assert = require("node:assert/strict");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { InMemoryTransport } = require("@modelcontextprotocol/sdk/inMemory.js");
const { createServer, createToolHandlers, normalizeSession, selectAgentTools } = require("./charly-brown-mcp.js");
const { buildActivityPrompt, buildResourcePrompt, formatApa7, getProjectDefinition, validateProjectArtifact, validateResourceArtifact } = require("./charly-brown-agent-tools.js");

function fixture() {
  const session = normalizeSession({
    id: "session-1", schemaVersion: 2, ownerUid: "user-1", activeUnitId: "unit-2",
    academicMeta: { level: "Primaria", grade: "Tercero", trimester: "2", model: "gemini-2.5-flash" },
    units: [
      { id: "unit-1", title: "Unidad 1. Animales", revision: 2, meta: { unit: "1" }, messages: [{ role: "user", text: "chat uno" }], accepted: { activities: [{ id: "a1", title: "Clasificación", html: "<p>Clasifica.</p>", revision: 1 }] } },
      { id: "unit-2", title: "Unidad 2. Plantas", revision: 4, meta: { unit: "2" }, messages: [{ role: "user", text: "chat dos" }], accepted: { activities: [] } }
    ]
  });
  let stored = { ...session };
  const ref = {
    async get() { return { exists: true, id: "session-1", data: () => stored }; },
    async set(value) { stored = { ...stored, ...JSON.parse(JSON.stringify(value)) }; }
  };
  const db = { collection: () => ({ doc: () => ref }) };
  return { db, read: () => normalizeSession(stored) };
}

function memoryFixture() {
  const base = fixture();
  const memories = new Map();
  const memoryCollection = {
    doc(id) {
      return {
        async get() {
          const row = memories.get(id);
          return { exists: Boolean(row), id, data: () => row };
        },
        async set(value, options = {}) {
          const current = memories.get(id) || {};
          memories.set(id, options.merge ? { ...current, ...clone(value) } : clone(value));
        }
      };
    },
    async get() {
      return {
        forEach(callback) {
          memories.forEach((row, id) => callback({ id, data: () => clone(row) }));
        }
      };
    }
  };
  const db = {
    collection(name) {
      return name === "charlyBrownTeachingMemory" ? memoryCollection : base.db.collection(name);
    }
  };
  return { db, memories };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("normaliza una sesión heredada como una unidad independiente", () => {
  const session = normalizeSession({ id: "legacy", ownerUid: "user-1", meta: { unit: "3", grade: "Tercero" }, messages: [{ role: "user", text: "hola" }], accepted: { activities: [] } });
  assert.equal(session.schemaVersion, 3);
  assert.equal(session.units.length, 1);
  assert.equal(session.units[0].meta.unit, "3");
  assert.equal(session.activeUnitId, session.units[0].id);
});

test("lee unidades anteriores sin mezclar sus chats", async () => {
  const data = fixture();
  const handlers = createToolHandlers({ db: data.db, uid: "user-1" });
  const unit = await handlers.read_unit({ sessionId: "session-1", targetUnitId: "unit-1" });
  assert.equal(unit.id, "unit-1");
  assert.equal(unit.accepted[0].id, "a1");
  assert.equal(JSON.stringify(unit).includes("chat uno"), false);
});

test("el MCP resuelve la secuencia y alcance por nivel, grado, trimestre y unidad", async () => {
  const data = fixture();
  const filters = [];
  const curriculumRows = [
    { id: "sya-1", nivel: "Primaria", grado: "Tercero", trimestre: 2, unidad: 2, Ciencias_T: "Crecimiento de las plantas", Ciencias_AE: "Registra cambios observables" },
    { id: "sya-2", nivel: "Primaria", grado: "Cuarto", trimestre: 2, unidad: 2, Ciencias_T: "Materia" }
  ];
  const snapshot = (rows) => ({ forEach(callback) { rows.forEach((row) => callback({ id: row.id, data: () => clone(row) })); } });
  const exactQuery = {
    where(field, operator, value) { filters.push([field, operator, value]); return this; },
    async get() { return snapshot([]); }
  };
  const curriculumCollection = {
    where(field, operator, value) { filters.push([field, operator, value]); return exactQuery; },
    async get() { return snapshot(curriculumRows); }
  };
  const db = {
    collection(name) {
      return name === "secuenciaAlcance" ? curriculumCollection : data.db.collection(name);
    }
  };
  const handlers = createToolHandlers({ db, uid: "user-1" });
  const result = await handlers.get_unit_curriculum({ sessionId: "session-1", targetUnitId: "unit-2" });
  assert.equal(result.source, "secuenciaAlcance");
  assert.equal(result.contextKey, "Primaria|Tercero|2|2");
  assert.equal(result.sya.Ciencias_T, "Crecimiento de las plantas");
  assert.deepEqual(filters.map(([field]) => field), ["nivel", "grado", "trimestre", "unidad"]);
});

test("rechaza una propuesta con revisión obsoleta", async () => {
  const data = fixture();
  const handlers = createToolHandlers({ db: data.db, uid: "user-1", generateText: async () => "{}" });
  await assert.rejects(() => handlers.propose_content_change({ sessionId: "session-1", targetUnitId: "unit-2", baseRevision: 3, action: "create", contentType: "activity", title: "Prueba", html: "<p>Texto</p>" }), (error) => error.code === "REVISION_CONFLICT");
});

test("la propuesta revisada queda pendiente y no altera aprobados", async () => {
  const data = fixture();
  const handlers = createToolHandlers({ db: data.db, uid: "user-1", generateText: async () => JSON.stringify({ html: "<p>Observa las hojas.</p>", corrections: ["Instrucción directa"] }) });
  const result = await handlers.propose_content_change({ sessionId: "session-1", targetUnitId: "unit-2", baseRevision: 4, action: "create", contentType: "activity", title: "Hojas", section: "Ciencias", html: "<p>Exploremos juntos las hojas.</p>" });
  assert.equal(result.proposal.status, "pending");
  assert.equal(result.proposal.html, "<p>Observa las hojas.</p>");
  assert.equal(data.read().units[1].accepted.activities.length, 0);
  assert.equal(data.read().units[1].proposals.length, 1);
});

test("la investigación permanece en la unidad de origen", async () => {
  const data = fixture();
  const handlers = createToolHandlers({
    db: data.db, uid: "user-1",
    research: async () => ({ summary: "Las plantas realizan fotosíntesis.", facts: [{ claim: "Hecho", sourceIds: ["s1"] }], sources: [{ id: "s1", title: "Fuente", url: "https://scielo.org.mx/articulo", verificationStatus: "verified" }], rejectedSources: [], blockers: [], verifiedSourceCount: 3, searchPlatforms: ["scielo"], verificationStatus: "verified" })
  });
  const result = await handlers.research_topic({ sessionId: "session-1", targetUnitId: "unit-2", topic: "Fotosíntesis", depth: "standard" });
  const session = data.read();
  assert.equal(result.verifiedSourceCount, 3);
  assert.equal(session.units[0].researchRuns.length, 0);
  assert.equal(session.units[1].researchRuns[0].id, result.researchRunId);
});

test("publica el contrato MCP completo", async () => {
  const data = fixture();
  const server = createServer({ db: data.db, uid: "user-1" });
  const client = new Client({ name: "test", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const tools = await client.listTools();
  const names = tools.tools.map((tool) => tool.name);
  ["get_session_context", "get_unit_curriculum", "list_readings", "get_unit_workflow", "list_activity_sections", "draft_activity_section", "create_activity_section", "update_activity_section", "restore_activity_section", "design_reading_stage", "design_activity", "design_worksheet", "design_annex", "design_cutout", "design_video_script", "create_teacher_notes", "list_unit_citations", "format_bibliography_apa7", "search_teaching_memory", "propose_teaching_memory", "confirm_teaching_memory"].forEach((name) => assert.ok(names.includes(name), `falta ${name}`));
  assert.equal(names.includes("render_cutout"), false);
  await client.close();
  await server.close();
});

test("el agente selecciona el MCP de notas del maestro", () => {
  const tools = [
    { name: "create_teacher_notes" },
    { name: "design_activity" },
    { name: "get_unit_curriculum" }
  ];
  const selected = selectAgentTools(tools, "Crea las notas del maestro con create_teacher_notes");
  assert.deepEqual(selected.map((tool) => tool.name), ["create_teacher_notes", "get_unit_curriculum"]);
});

test("formatea APA 7 y rechaza el recortable vectorial heredado", () => {
  const apa = formatApa7({ authors: ["López, W."], year: 2025, title: "Aprender con materiales", publication: "Revista Escolar", doi: "10.1000/demo" });
  assert.match(apa, /López, W\. \(2025\)/);
  assert.match(apa, /https:\/\/doi\.org\/10\.1000\/demo/);
  const document = { title: "Clasificar animales", instructions: "Recorta y clasifica.", pieces: [{ id: "p1", label: "Águila", interactionRole: "clasificar", targetId: "aves" }] };
  const legacy = validateResourceArtifact({ title: document.title, activityId: "a1", cutoutDocument: document, html: '<img src="https://example.test/legacy.svg">', assets: [{ mimeType: "image/svg+xml", url: "https://example.test/legacy.svg", storagePath: "legacy.svg" }] }, "cutout");
  assert.equal(legacy.ok, false);
  assert.match(legacy.errors.join(" "), /imagen terminada generada por Gemini/);
  const raster = validateResourceArtifact({ title: document.title, activityId: "a1", cutoutDocument: document, generatedImage: true, visualReview: { ok: true }, html: '<img src="https://example.test/cutout.png">', assets: [{ mimeType: "image/png", url: "https://example.test/cutout.png", storagePath: "cutout.png" }] }, "cutout");
  assert.equal(raster.ok, true);
});

test("los prompts de actividades y recursos incluyen la secuencia y alcance exacta", () => {
  const unit = {
    title: "Unidad 2. Plantas",
    meta: { level: "Primaria", grade: "Tercero", trimester: "2", unit: "2" },
    syaContextKey: "Primaria|Tercero|2|2",
    sya: {
      Ciencias_T: "Cambios en las plantas",
      Ciencias_AE: "Explica el crecimiento a partir de observaciones",
      __subtopics: { Ciencias: { name: "Ciencias", category: "Ciencias experimentales" } }
    }
  };
  const activity = { id: "a1", title: "Diario de crecimiento", section: "Ciencias experimentales", html: "<p>Observa una planta.</p>" };
  const activityPrompt = buildActivityPrompt({ unit, activity, sectionDefinition: {}, brief: "Registrar durante una semana" });
  const resourcePrompt = buildResourcePrompt({ type: "worksheet", unit, activity });
  for (const prompt of [activityPrompt, resourcePrompt]) {
    assert.match(prompt, /trimestre 2, unidad 2/i);
    assert.match(prompt, /Cambios en las plantas/);
    assert.match(prompt, /Explica el crecimiento a partir de observaciones/);
    assert.doesNotMatch(prompt, /__subtopics|\[object Object\]/);
  }
});

test("el MCP aplica el contrato específico de Trazos de letras", () => {
  const unit = {
    title: "Unidad 1",
    meta: { level: "Primaria", grade: "Primero", trimester: "1", unit: "1", subtopic: "TrazosDeLetras" },
    sya: {
      TrazosDeLetras_T: "Trazo de la letra M",
      TrazosDeLetras_AE: "Traza mayúscula y minúscula con direccionalidad"
    }
  };
  const prompt = buildActivityPrompt({
    unit,
    activity: { title: "Trazos de letras", section: "Lenguaje y comunicación · Trazos de letras" }
  });
  assert.match(prompt, /exactamente cuatro <div class="activity">/i);
  assert.match(prompt, /presentación de mayúscula\/minúscula y direccionalidad/i);
  assert.match(prompt, /repetición o completado en renglón/i);
  assert.match(prompt, /No uses <ol>, <ul>, <li>/i);
  assert.match(prompt, /<div class="trace-model">/i);
});

test("el MCP permite una estructura de actividad distinta cuando el usuario la solicita", () => {
  const unit = {
    title: "Unidad 2",
    meta: { level: "Primaria", grade: "Tercero", trimester: "2", unit: "2" },
    sya: { Matematicas_T: "Comparación de fracciones", Matematicas_AE: "Justifica comparaciones" }
  };
  const activity = { title: "Laboratorio de fracciones", section: "Matemáticas" };
  const custom = buildActivityPrompt({
    unit,
    activity,
    structureMode: "custom",
    structureInstructions: "Usa una tabla de tres columnas: Reto, Estrategia y Evidencia. Termina con una rúbrica breve."
  });
  assert.match(custom, /Contrato estructural solicitado explícitamente por el usuario/);
  assert.match(custom, /Reto, Estrategia y Evidencia/);
  assert.match(custom, /No fuerces <div class="activity">/);
  assert.match(custom, /"structureMode":"custom"/);
  assert.match(custom, /Comparación de fracciones/);

  const standard = buildActivityPrompt({ unit, activity, structureMode: "default" });
  assert.match(standard, /un único <div class="activity">/);
  assert.doesNotMatch(standard, /Contrato estructural solicitado explícitamente/);
});

test("los proyectos usan una metodología diferente en cada trimestre", () => {
  const expected = { "1": "ABP", "2": "STEAM", "3": "AS" };
  Object.entries(expected).forEach(([trimester, methodology]) => {
    const definition = getProjectDefinition(trimester);
    const unit = { title: "Proyecto", meta: { level: "Primaria", grade: "Tercero", trimester, unit: "proyecto" }, sya: { Proyectos_T: "Cuidado de la comunidad" } };
    const activity = { id: "", title: "Proyecto", section: "Proyectos", sectionId: "projects", html: "" };
    const prompt = buildActivityPrompt({ unit, activity });
    assert.equal(definition.methodology, methodology);
    assert.match(prompt, new RegExp(`metodología ${methodology}`));
    definition.phases.forEach((phase) => assert.match(prompt, new RegExp(phase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
  });
});

test("el validador de proyectos exige fases, actividades, metadatos y rúbricas", () => {
  const unit = { meta: { trimester: "3", unit: "proyecto" } };
  const activity = { section: "Proyectos", sectionId: "projects" };
  const definition = getProjectDefinition("3");
  const phaseHtml = definition.phases.map((phase) => `<section><h3>${phase}</h3><div class="activity"></div><div class="activity"></div><div class="phase-meta"></div><div class="phase-rubric"></div></section>`).join("");
  const valid = validateProjectArtifact({ projectMethodology: "AS", projectPhases: definition.phases, html: `${phaseHtml}<section class="project-evaluation"></section>` }, unit, activity);
  assert.equal(valid.ok, true);
  const invalid = validateProjectArtifact({ projectMethodology: "ABP", projectPhases: [], html: "<div class=\"activity\"></div>" }, unit, activity);
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join(" "), /metodología debe ser AS|fases/i);
});

test("design_cutout conserva unidad y actividad de destino", async () => {
  const data = fixture();
  const generated = {
    title: "Animales por hábitat",
    html: "<section><h3>Animales por hábitat</h3><p>Recorta y clasifica.</p></section>",
    citations: [],
    cutoutDocument: {
      title: "Animales por hábitat", instructions: "Recorta y pega cada animal en su hábitat.",
      pieces: [{ id: "p1", label: "Jaguar", interactionRole: "clasificar", targetId: "selva" }]
    }
  };
  const handlers = createToolHandlers({ db: data.db, uid: "user-1", generateText: async () => JSON.stringify(generated) });
  const result = await handlers.design_cutout({ sessionId: "session-1", targetUnitId: "unit-1", targetActivityId: "a1", baseRevision: 2, brief: "Clasificación" });
  assert.equal(result.proposal.targetUnitId, "unit-1");
  assert.equal(result.proposal.targetActivityId, "a1");
  assert.equal(result.proposal.contentType, "cutout");
  assert.equal(result.validation.ok, true);
  assert.match(result.proposal.artifact.svg, /data-piece-id="p1"/);
});

test("design_reading_stage crea una propuesta MCP sin aprobar la lectura", async () => {
  const data = fixture();
  const handlers = createToolHandlers({
    db: data.db,
    uid: "user-1",
    generateText: async ({ prompt }) => prompt.includes("Revisa el siguiente material")
      ? JSON.stringify({ html: "<article><h2>Las plantas</h2><p>Una semilla comienza a crecer.</p></article>", corrections: [] })
      : JSON.stringify({ title: "Las plantas", html: "<article><h2>Las plantas</h2><p>Una semilla comienza a crecer.</p></article>", citations: [] })
  });
  const result = await handlers.design_reading_stage({
    sessionId: "session-1", targetUnitId: "unit-2", baseRevision: 4,
    readingStage: "reading", brief: "Texto breve para tercer grado"
  });
  const unit = data.read().units.find((item) => item.id === "unit-2");
  assert.equal(result.proposal.status, "pending");
  assert.equal(result.proposal.readingStage, "reading");
  assert.equal(unit.accepted.reading, null);
  assert.equal(unit.workflow.stages.reading.status, "proposed");
});

test("create_teacher_notes genera y guarda notas globales del maestro", async () => {
  const data = fixture();
  const session = data.read();
  session.units[1].accepted.activities.push({ id: "a2", title: "Observar plantas", section: "Ciencias", html: "<div class=\"activity\"><p>Observa una planta.</p></div>" });
  await data.db.collection().doc().set(session);
  const handlers = createToolHandlers({
    db: data.db,
    uid: "user-1",
    generateText: async ({ prompt }) => prompt.includes("Revisa el siguiente material")
      ? JSON.stringify({ html: "<section><h3>Orientaciones</h3><p>Prepare una planta.</p></section>", corrections: [] })
      : JSON.stringify({ title: "Notas del maestro", html: "<section><h3>Orientaciones</h3><p>Prepare una planta.</p></section>" })
  });
  const result = await handlers.create_teacher_notes({
    sessionId: "session-1", targetUnitId: "unit-2", baseRevision: 4, mode: "global", confirm: true
  });
  const unit = data.read().units.find((item) => item.id === "unit-2");
  assert.equal(result.saved, true);
  assert.equal(result.revision, 5);
  assert.equal(unit.accepted.teacherNotes.length, 1);
  assert.equal(unit.accepted.teacherNotes[0].createdBy, "charly-mcp");
  assert.match(unit.accepted.teacherNotes[0].html, /Prepare una planta/);
});

test("create_teacher_notes exige explicar cada recurso dentro de su actividad", async () => {
  const data = fixture();
  const session = data.read();
  session.units[1].accepted.activities.push({ id: "a2", title: "Diario de crecimiento", section: "Ciencias", html: "<div class=\"activity\"><p>Registra el crecimiento.</p></div>" });
  session.units[1].accepted.resources.push({ id: "r1", activityId: "a2", type: "ficha", code: "Ficha 2a", title: "Registro semanal", html: "<table><tr><td>Día</td><td>Altura</td></tr></table>" });
  await data.db.collection().doc().set(session);
  let calls = 0;
  const completeHtml = "<section><h3>Diario de crecimiento</h3><h4>Uso de Ficha 2a</h4><p>Entréguela al registrar la altura; el estudiante anota datos y usted observa la precisión. Si no está disponible, use una tabla trazada en el cuaderno.</p></section>";
  const handlers = createToolHandlers({
    db: data.db,
    uid: "user-1",
    generateText: async ({ prompt }) => {
      calls += 1;
      if (prompt.includes("REINTENTO OBLIGATORIO")) return JSON.stringify({ title: "Notas del maestro", html: completeHtml });
      if (prompt.includes("Revisa el siguiente material")) return JSON.stringify({ html: completeHtml, corrections: [] });
      return JSON.stringify({ title: "Notas del maestro", html: "<p>Use el material de apoyo.</p>" });
    }
  });
  const result = await handlers.create_teacher_notes({
    sessionId: "session-1", targetUnitId: "unit-2", baseRevision: 4, mode: "global", confirm: true
  });
  const note = data.read().units.find((item) => item.id === "unit-2").accepted.teacherNotes[0];
  assert.equal(result.saved, true);
  assert.equal(calls, 3);
  assert.match(note.html, /Ficha 2a/);
  assert.match(note.html, /Diario de crecimiento/);
  assert.deepEqual(note.resourceUsage.map((item) => [item.resourceLabel, item.activityLabel]), [["Ficha 2a", "Diario de crecimiento"]]);
});

test("una enseñanza no influye hasta que un usuario aprobado la confirma", async () => {
  const data = memoryFixture();
  const handlers = createToolHandlers({ db: data.db, uid: "editor-1", approvedUser: true });
  const candidate = await handlers.propose_teaching_memory({
    rule: "Las fichas de tercero deben incluir un ejemplo resuelto antes del ejercicio.",
    resourceType: "worksheet", grade: "Tercero", section: "Matemáticas",
    sessionId: "session-1", targetUnitId: "unit-2"
  });

  assert.equal(candidate.memory.status, "candidate");
  assert.equal((await handlers.search_teaching_memory({ resourceType: "worksheet", grade: "Tercero", section: "Matemáticas" })).memories.length, 0);

  const confirmed = await handlers.confirm_teaching_memory({ memoryId: candidate.memory.id, confirm: true });
  assert.equal(confirmed.status, "active");
  const active = await handlers.search_teaching_memory({ resourceType: "worksheet", grade: "Tercero", section: "Matemáticas" });
  assert.equal(active.memories.length, 1);
  assert.equal(active.memories[0].confirmedBy, "editor-1");
});
