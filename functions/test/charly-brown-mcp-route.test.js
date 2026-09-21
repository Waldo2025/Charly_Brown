const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { InMemoryTransport } = require("@modelcontextprotocol/sdk/inMemory.js");
const {
  buildAgentHistory,
  createServer,
  ensureUserTurn,
  isTransientGeminiError,
  listEffectiveActivitySections,
  proposalCompletion,
  readableGeminiError,
  registerCharlyBrownMcpRoutes,
  restoreActivitySectionRecord,
  saveActivitySectionRecord,
  selectAgentTools,
  withGeminiRetry
} = require("../src/charly-brown-mcp.js");

test("geminiApi registra el chat de Charly con Vertex ADC", () => {
  const index = fs.readFileSync(path.join(__dirname, "../src/index.js"), "utf8");
  const mcp = fs.readFileSync(path.join(__dirname, "../src/charly-brown-mcp.js"), "utf8");

  assert.match(index, /registerCharlyBrownMcpRoutes\(geminiApp/);
  assert.match(index, /createVertexClient\(\{ location: "global" \}\)/);
  assert.match(index, /generateContent:\s*async/);
  assert.match(index, /tools: sanitizeVertexSchema\(tools\)/);
  assert.match(mcp, /app\.post\("\/api\/charly-brown\/chat"/);
  assert.match(mcp, /app\.all\("\/api\/charly-brown\/mcp"/);
  assert.doesNotMatch(mcp, /GEMINI_API_KEY|GOOGLE_API_KEY/);
});

test("el servidor MCP desplegable publica herramientas editoriales", async () => {
  const server = createServer({ db: {}, uid: "test-user" });
  const client = new Client({ name: "functions-route-test", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const tools = await client.listTools();
  const names = tools.tools.map((tool) => tool.name);

  [
    "get_session_context",
    "list_activity_sections",
    "draft_activity_section",
    "create_activity_section",
    "update_activity_section",
    "restore_activity_section",
    "propose_content_change",
    "design_activity",
    "design_worksheet",
    "design_annex",
    "design_cutout",
    "design_video_script",
    "research_topic"
  ].forEach((name) => assert.ok(names.includes(name), `falta ${name}`));

  await client.close();
  await server.close();
});

test("POST /api/charly-brown/chat responde mediante el agente MCP", async (t) => {
  let agentConfig = null;
  let agentModel = null;
  let stored = {
    id: "session-1",
    ownerUid: "user-1",
    schemaVersion: 3,
    activeUnitId: "unit-1",
    academicMeta: { level: "Primaria", grade: "Tercero" },
    units: [{ id: "unit-1", title: "Unidad 1", revision: 0, meta: { unit: "1" }, messages: [], proposals: [], accepted: { activities: [], resources: [] } }]
  };
  const sessionRef = {
    async get() { return { exists: true, id: "session-1", data: () => stored }; },
    async set(value) { stored = JSON.parse(JSON.stringify(value)); }
  };
  const db = {
    collection(name) {
      if (name === "users") return { doc: () => ({ get: async () => ({ exists: false, data: () => ({}) }) }) };
      return { doc: () => sessionRef };
    }
  };
  const app = express();
  app.use(express.json());
  registerCharlyBrownMcpRoutes(app, {
    db,
    verifyFirebaseBearer: async () => ({ uid: "user-1", decoded: { role: "editor" } }),
    generateText: async () => "{}",
    generateContent: async (request) => {
      agentConfig = request.config;
      agentModel = request.model;
      return { candidates: [{ content: { parts: [{ text: "Trabajemos la unidad paso a paso.\n<cb-specifications>## Criterios\n- Alineación curricular.</cb-specifications>" }] } }] };
    }
  });
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once("listening", resolve));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/charly-brown/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
    body: JSON.stringify({ sessionId: "session-1", targetUnitId: "unit-1", text: "Ayúdame a planearla." })
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.text, "Trabajemos la unidad paso a paso.");
  assert.match(body.specifications, /Alineación curricular/);
  assert.equal(stored.units[0].messages.at(-1).role, "assistant");
  assert.match(stored.units[0].messages.at(-1).specifications, /## Criterios/);
  assert.match(agentConfig.systemInstruction, /Datos académicos generales de la sesión/);
  assert.match(agentConfig.systemInstruction, /Primaria/);
  assert.match(agentConfig.systemInstruction, /Tercero/);
  assert.equal(agentModel, "gemini-3.8-flash");
  assert.equal(agentConfig.thinkingConfig.thinkingLevel, "MEDIUM");
  assert.equal(agentConfig.maxOutputTokens, 8192);
});

test("el agente reduce herramientas y reintenta cuota transitoria con espera exponencial", async () => {
  const tools = ["get_unit_workflow", "design_activity", "design_cutout", "research_topic", "render_cutout"]
    .map((name) => ({ name }));
  assert.deepEqual(
    selectAgentTools(tools, "Crea una actividad de Matemáticas").map((tool) => tool.name),
    ["get_unit_workflow", "design_activity"]
  );
  assert.deepEqual(
    selectAgentTools(tools, "Diseña un recortable tipo puzzle").map((tool) => tool.name),
    ["get_unit_workflow", "design_cutout", "render_cutout"]
  );

  let attempts = 0;
  const waits = [];
  const result = await withGeminiRetry(async () => {
    attempts += 1;
    if (attempts < 3) throw Object.assign(new Error("RESOURCE_EXHAUSTED"), { status: 429 });
    return "ok";
  }, { baseDelayMs: 10, sleep: async (ms) => waits.push(ms) });
  assert.equal(result, "ok");
  assert.equal(attempts, 3);
  assert.deepEqual(waits, [10, 20]);
  assert.equal(isTransientGeminiError(Object.assign(new Error("quota"), { status: 429 })), true);
  assert.equal(
    readableGeminiError(new Error('{"error":{"code":400,"message":"Turno inválido","status":"INVALID_ARGUMENT"}}')),
    "Turno inválido"
  );
});

test("una propuesta MCP termina el turno con un mensaje específico", () => {
  const result = proposalCompletion({ proposal: { contentType: "activity", title: "Mapa del barrio", section: "Ciencias sociales", baseRevision: 4 } });
  assert.match(result.text, /Mapa del barrio/);
  assert.match(result.specifications, /Ciencias sociales/);
  assert.match(result.specifications, /pendiente de aprobación/);
});

test("el historial Gemini alterna roles, omite tarjetas HTML y termina con usuario", () => {
  const history = buildAgentHistory([
    { role: "assistant", text: "Respuesta anterior" },
    { role: "user", text: "Primera pregunta" },
    { role: "assistant", text: "Primer análisis" },
    { role: "assistant", text: "Comentario de propuesta" },
    { role: "assistant", html: "<div data-proposal-id='p1'>Propuesta</div>", text: "" },
    { role: "user", text: "Rehaz el proyecto" }
  ], "Rehaz el proyecto");
  assert.deepEqual(history.map((turn) => turn.role), ["user", "model", "user"]);
  assert.match(history[1].parts[0].text, /Primer análisis/);
  assert.match(history[1].parts[0].text, /Comentario de propuesta/);
  assert.equal(history.at(-1).parts[0].text, "Rehaz el proyecto");

  const contents = [{ role: "user", parts: [{ text: "Pregunta" }] }, { role: "model", parts: [{ text: "Respuesta" }] }];
  ensureUserTurn(contents, "Continúa");
  assert.equal(contents.at(-1).role, "user");
  assert.equal(contents.at(-1).parts[0].text, "Continúa");
});

test("las secciones conservan original, personalización y restablecimiento", async () => {
  const rows = new Map();
  const db = {
    collection() {
      return {
        async get() {
          return { forEach(callback) { rows.forEach((value, id) => callback({ id, data: () => structuredClone(value) })); } };
        },
        doc(id) {
          return {
            async set(value, options = {}) {
              rows.set(id, options.merge ? { ...(rows.get(id) || {}), ...structuredClone(value) } : structuredClone(value));
            }
          };
        }
      };
    }
  };
  const edited = {
    name: "Proyectos comunitarios",
    description: "Producto útil para el entorno.",
    objective: "Resolver una necesidad cercana con evidencia.",
    agentInstructions: "Organiza diagnóstico, fases, producto y criterios de logro.",
    levels: ["Primaria"],
    grades: ["Tercero"]
  };

  await saveActivitySectionRecord({ db, uid: "user-1", canManageGlobal: false, targetId: "projects", scope: "personal", current: edited });
  const personalized = await listEffectiveActivitySections(db, "user-1", { level: "Primaria", grade: "Tercero" });
  assert.equal(personalized.find((item) => item.id === "projects").name, "Proyectos comunitarios");
  assert.equal(personalized.find((item) => item.id === "projects").original.name, "Proyectos");
  assert.equal((await listEffectiveActivitySections(db, "user-2")).find((item) => item.id === "projects").name, "Proyectos");

  await restoreActivitySectionRecord({ db, uid: "user-1", canManageGlobal: false, targetId: "projects", scope: "personal" });
  const restored = await listEffectiveActivitySections(db, "user-1");
  assert.equal(restored.find((item) => item.id === "projects").name, "Proyectos");
  assert.equal(rows.size, 1, "restablecer conserva el documento y su historial");
});
