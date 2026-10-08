const test = require("node:test");
const assert = require("node:assert/strict");
const { buildTeacherNotesPrompt } = require("../src/charly-brown-agent-tools.js");
const { selectAgentTools, teacherNotePlacementQuestion, groupCreationSetup, isApprovedActivityEditRequest, createServer, createToolHandlers } = require("../src/charly-brown-mcp.js");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { InMemoryTransport } = require("@modelcontextprotocol/sdk/inMemory.js");

test("teacher note from supplied activity treats the text as activity source", () => {
  const prompt = buildTeacherNotesPrompt({
    unit: { meta: { subtopic: "El agua" }, accepted: { activities: [], resources: [] } },
    items: [{ title: "Explorar el agua", subtopic: "El agua" }], mode: "source",
    sourceKind: "activity", sourceContent: "Los alumnos comparan dos recipientes de agua."
  });
  assert.match(prompt, /ACTIVIDAD O TEXTO DE ORIGEN/);
  assert.match(prompt, /Los alumnos comparan dos recipientes/);
  assert.doesNotMatch(prompt, /\[ACTIVIDAD APROBADA/);
});

test("chat with attached activity for teacher note selects note tool only", () => {
  const names = ["design_activity", "design_worksheet", "design_annex", "design_cutout", "design_teacher_note", "get_unit_curriculum", "read_content_item"];
  const tools = names.map((name) => ({ name }));
  const chosen = selectAgentTools(tools, "Crea una nota del maestro a partir de la actividad de este PDF").map((tool) => tool.name);
  assert.ok(chosen.includes("design_teacher_note"));
  assert.ok(!chosen.includes("design_activity"));
  assert.ok(!chosen.includes("design_worksheet"));
});

test("un tema nuevo pone disponible la herramienta de SyA", () => {
  const tools = ["design_activity", "get_unit_curriculum", "design_sya_change"].map((name) => ({ name }));
  const chosen = selectAgentTools(tools, "Quiero crear ejercicios de un nuevo subtema para esta unidad").map((tool) => tool.name);
  assert.ok(chosen.includes("design_sya_change"));
});

test("free text asks for missing unit and subtopic before note generation", () => {
  const unit = { title: "Unidad 4", meta: { unit: "4", subtopic: "El agua" } };
  const request = "Crea una nota del maestro a partir de este texto: los alumnos observan el río.";
  const question = teacherNotePlacementQuestion(request, { unit, requestedTools: ["create_teacher_notes"] });
  assert.match(question, /la unidad y el subtema/);
  assert.equal(teacherNotePlacementQuestion(`${request} Unidad 4, subtema: El agua`, { unit }), "");
  assert.match(teacherNotePlacementQuestion(`${request} Unidad 5, subtema: El agua`, { unit }), /unidad abierta es la 4/);
});

test("a resource choice resumes a group after a note placement prompt", () => {
  const original = "Crea una actividad y nota del maestro en Unidad 1, subtema: Gramática, con ficha.";
  const messages = [
    { role: "user", text: original },
    { role: "assistant", text: "Antes de crear el grupo de actividad, recursos y nota, elige recursos." },
    { role: "user", text: "Elijo ficha." },
    { role: "assistant", text: "Para preparar la nota del maestro, indícame el subtema." }
  ];
  const result = groupCreationSetup("Unidad 1, subtema: Gramática. Elijo ficha. Añadir todas.", {
    unit: { meta: { unit: "1" }, accepted: { activities: [], resources: [], teacherNotes: [] } },
    messages
  });
  assert.equal(result.question, undefined);
  assert.deepEqual(result.selected, ["worksheet"]);
  assert.match(result.request, /subtema: Gramática/);
});

test("a new activity page is not mistaken for an edit because it mentions correcting errors", () => {
  assert.equal(isApprovedActivityEditRequest("Crea una actividad nueva para detectar y corregir errores; pagePlacement=add, operation=create"), false);
  assert.equal(isApprovedActivityEditRequest("Añade una página con ejercicios para mejorar la concordancia"), false);
  assert.equal(isApprovedActivityEditRequest("Corrige la actividad aprobada de Gramática"), true);
});

test("MCP exposes pending activity links and approvable SyA changes", async () => {
  const server = createServer({ db: {}, uid: "test-user" });
  const client = new Client({ name: "group-contract-test", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
    assert.ok(byName.design_sya_change);
    assert.ok(byName.design_activity.inputSchema.properties.pagePlacement);
    assert.ok(byName.design_worksheet.inputSchema.properties.sourceActivityProposalId);
    assert.ok(byName.design_cutout.inputSchema.properties.sourceActivityProposalId);
    assert.ok(!byName.design_cutout.inputSchema.required?.includes("targetActivityId"));
    assert.ok(byName.design_teacher_note.inputSchema.properties.sourceActivityProposalId);
  } finally {
    await client.close();
    await server.close();
  }
});

test("design_sya_change guarda una propuesta sin aplicar la SyA", async () => {
  const original = { Agua_T: "Agua", Agua_AE: "Observa", Agua_C: "Estados", Agua_P: "Compara" };
  const record = { ownerUid: "test-user", activeUnitId: "unit-1", units: [{ id: "unit-1", revision: 0, meta: { unit: "1", category: "Ciencias" }, accepted: { activities: [], resources: [], teacherNotes: [], sya: original }, proposals: [] }] };
  const ref = { get: async () => ({ id: "session-1", exists: true, data: () => record }), set: async (next) => Object.assign(record, next) };
  const db = { collection: () => ({ doc: () => ref }) };
  const handlers = createToolHandlers({ db, uid: "test-user" });
  const result = await handlers.design_sya_change({ sessionId: "session-1", targetUnitId: "unit-1", baseRevision: 0, operation: "add-subtopic", subtopic: "Ríos", category: "Ciencias", fields: { T: "Ríos", AE: "Explora", C: "Cauce", P: "Observa" } });
  assert.equal(result.proposal.contentType, "sya");
  assert.equal(record.units[0].accepted.sya.Ríos_T, undefined);
  assert.equal(result.proposal.artifact.sya.Ríos_T, "Ríos");
  assert.deepEqual(result.proposal.artifact.previousSya, original);
});
