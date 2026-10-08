const test = require("node:test");
const assert = require("node:assert/strict");
const tier = require("../src/gemini-free-tier.js");
const { dayKey } = require("../src/savings-policy.js");
const { retryPolicy } = require("../src/pigpen-generation-policy.js");
const { createWorkers } = require("../src/pigpen-generation-workers.js");

const FREE_ENV = ["GEMINI_FREE_TIER_ENABLED", "GEMINI_FREE_TIER_PLAN", "GEMINI_FREE_TIER_API_KEY",
  "GEMINI_FREE_TIER_TEXT_MODEL", "PIGPEN_FREE_TIER_REVIEW", "GEMINI_FREE_TIER_DAILY_CALL_CAP"];
const ON = {
  GEMINI_FREE_TIER_ENABLED: "true",
  GEMINI_FREE_TIER_PLAN: "free",
  GEMINI_FREE_TIER_API_KEY: "test-key",
  GEMINI_FREE_TIER_TEXT_MODEL: "gemini-2.5-flash-lite"
};

async function withEnv(values, run) {
  const previous = Object.fromEntries(FREE_ENV.map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === null) delete process.env[key];
    else process.env[key] = String(value);
  }
  try {
    return await run();
  } finally {
    for (const key of FREE_ENV) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

function memoryDb() {
  const documents = new Map();
  const ref = (path) => ({ path, async get() { return { data: () => documents.get(path) }; } });
  return {
    documents,
    collection(name) { return { doc(id) { return ref(`${name}/${id}`); } }; },
    async runTransaction(callback) {
      return callback({
        async get(item) { return { data: () => documents.get(item.path) }; },
        set(item, value, options) { documents.set(item.path, options?.merge ? { ...(documents.get(item.path) || {}), ...value } : value); }
      });
    }
  };
}

function recordingClient(payloadFor) {
  const calls = [];
  return { calls, models: { generateContent: async (request) => { calls.push(request); return payloadFor(request); } } };
}

function textResponse(value) {
  return { candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(value) }] } }], usageMetadata: { promptTokenCount: 4000, candidatesTokenCount: 300 } };
}

const AUDIT = { approved: true, checks: [{ questionIndex: 0, evidence: "2 + 2 = 4, así que la clave privada es correcta", values: ["4"] }], issues: [] };

const master = { rooms: [{ title: "Sala 1", learning_focus: "fracciones", narrative_beat: { incoming_state: "inicio", next_state: "pista" } }] };
const room = {
  mission: {
    contexto: "Los alumnos reconstruyen la sala con fracciones.",
    preguntas: [{ titulo: "Suma", tipo_interaccion: "texto", reto: "2 + 2", respuesta_correcta: "4", opciones: [] }]
  },
  room: { generated_room: { mission: {} } }
};

function harness({ db, freeResponder, paidResponder, freeClient }) {
  const artifacts = {
    async get(path) {
      if (path === "master") return structuredClone(master);
      if (path === "room") return structuredClone(room);
      throw new Error(`unexpected artifact ${path}`);
    },
    async put() { return "artifact"; }
  };
  const bucket = { name: "charly-brown.firebasestorage.app", saved: [], file: (path) => ({ save: async (bytes) => { bucket.saved.push({ path, bytes }); } }) };
  const free = freeClient || recordingClient(freeResponder);
  const paid = recordingClient(paidResponder);
  const workers = createWorkers({
    bucket,
    artifacts,
    client: paid,
    db,
    freeTier: {
      isFreeTierEnabled: tier.isFreeTierEnabled,
      generateText: (args) => tier.generateText({ ...args, freeClient: free })
    }
  });
  return { bucket, free, paid, workers };
}

const run = { id: "run_1", ownerId: "owner_1", sessionId: "session_1", topicId: "topic_1", config: { tema: "Fracciones", misiones: 1, preguntasPorSala: 1, modelo: "gemini-2.5-flash" } };
const reviewTask = { id: "review-0-0-main", stage: "review", roomIndex: 0, revision: 0, input: { masterRef: "master", roomRef: "room", imageRefs: [], globalIssues: [] } };
const signal = { aborted: false, throwIfAborted() {}, reason: null };

test("review text is served by the free tier with the configured Lite model", async () => {
  const db = memoryDb();
  await withEnv(ON, async () => {
    const { free, paid, workers } = harness({ db, freeResponder: () => textResponse(AUDIT), paidResponder: () => textResponse(AUDIT) });
    const result = await workers(run, reviewTask, signal);
    assert.equal(result.approved, true);
    assert.equal(paid.calls.length, 0);
    assert.deepEqual(free.calls.map((call) => call.model), ["gemini-2.5-flash-lite"]);
    assert.equal(free.calls[0].config.responseMimeType, "application/json");
    assert.deepEqual(db.documents.get(`savings_daily_quotas/${dayKey(new Date())}_global`).freeTextCalls, 1);
  });
});

test("review is the one stage that can be sent back to Vertex by toggle", async () => {
  const db = memoryDb();
  await withEnv({ ...ON, PIGPEN_FREE_TIER_REVIEW: "false" }, async () => {
    const { free, paid, workers } = harness({ db, freeResponder: () => textResponse(AUDIT), paidResponder: () => textResponse(AUDIT) });
    const result = await workers(run, reviewTask, signal);
    assert.equal(result.approved, true);
    assert.equal(free.calls.length, 0);
    assert.equal(paid.calls.length, 1);
    assert.equal(paid.calls[0].model, "gemini-3.5-flash");
    assert.equal(db.documents.size, 0);
  });
});

test("image generation keeps using the paid client", async () => {
  const db = memoryDb();
  const sharp = require("sharp");
  const png = (await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 120, b: 40 } } }).png().toBuffer()).toString("base64");
  await withEnv(ON, async () => {
    const { free, paid, bucket, workers } = harness({
      db,
      freeResponder: () => textResponse(AUDIT),
      paidResponder: () => ({ candidates: [{ content: { role: "model", parts: [{ inlineData: { mimeType: "image/png", data: png } }] } }] })
    });
    const imageRun = { ...run, config: { ...run.config, modeloImagen: "gemini-3.1-flash-image" } };
    const task = { id: "image--1-0-cover", stage: "image", roomIndex: -1, revision: 0, token: "token_1", input: { masterRef: "master", spec: { key: "cover", prompt: "Portada del escape room", aspectRatio: "16:9" } } };
    const result = await workers(imageRun, task, signal);
    assert.match(result.url, /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/charly-brown\.firebasestorage\.app\/o\//);
    assert.equal(bucket.saved.length, 1);
    assert.equal(free.calls.length, 0);
    assert.equal(paid.calls.length, 1);
    assert.deepEqual(paid.calls[0].config.responseModalities, ["IMAGE"]);
    assert.equal(db.documents.size, 0);
  });
});

test("an exhausted free bucket stops the task instead of paying for it", async () => {
  const db = memoryDb();
  db.documents.set(`savings_daily_quotas/${dayKey(new Date())}_global`, { freeTextCalls: 0, freeTextCooldownUntil: Date.now() + 6 * 60 * 60_000 });
  await withEnv(ON, async () => {
    const { free, paid, workers } = harness({ db, freeResponder: () => textResponse(AUDIT), paidResponder: () => textResponse(AUDIT) });
    const error = await workers(run, reviewTask, signal).then(() => null, (caught) => caught);
    assert.equal(error.code, "pigpen_free_tier_exhausted");
    assert.equal(error.permanentToday, true);
    assert.equal(free.calls.length, 0);
    assert.equal(paid.calls.length, 0);
    assert.deepEqual(retryPolicy(error, 1).status, "needs_attention");
    assert.equal(retryPolicy(error, 1).dueAt, 0);
  });
});

test("a free-tier provider error falls back to the paid client", async () => {
  const db = memoryDb();
  await withEnv(ON, async () => {
    const { paid, workers } = harness({
      db,
      freeClient: { models: { generateContent: async () => { throw Object.assign(new Error("503 UNAVAILABLE"), { status: 503 }); } } },
      freeResponder: () => textResponse(AUDIT),
      paidResponder: () => textResponse(AUDIT)
    });
    const result = await workers(run, reviewTask, signal);
    assert.equal(result.approved, true);
    assert.equal(paid.calls.length, 1);
    assert.equal(db.documents.get(`savings_daily_quotas/${dayKey(new Date())}_global`).freeTextCalls, 1);
  });
});

// The content stages send the selector's id as requestedModel; the reviewer answers with a
// model the service picks, so it declares none.
test("the model the selector picked decides the provider for content stages", async () => {
  const { buildVertexGenerateRequest } = require("../src/vertex.js");
  const textRequest = buildVertexGenerateRequest({
    model: "gemini-2.5-flash-lite",
    payload: { contents: [{ role: "user", parts: [{ text: "Completa la sala" }] }], generationConfig: { responseMimeType: "application/json" } }
  });
  await withEnv(ON, async () => {
    const db = memoryDb();
    const free = recordingClient(() => textResponse({}));
    const paid = recordingClient(() => textResponse({}));
    const outcome = await tier.generateText({
      db, request: textRequest, stage: "room", requestedModel: "gemini-3.5-flash",
      vertexClient: paid, freeClient: free
    });
    assert.equal(outcome.provider, "vertex");
    assert.equal(outcome.reason, "paid_model_selected");
    assert.equal(free.calls.length, 0);
    assert.equal(paid.calls.length, 1);
    assert.equal(db.documents.size, 0);
  });
  await withEnv(ON, async () => {
    const db = memoryDb();
    const free = recordingClient(() => textResponse({}));
    const paid = recordingClient(() => textResponse({}));
    const served = await tier.generateText({
      db, request: textRequest, stage: "room", requestedModel: "gemini-2.5-flash-lite",
      vertexClient: paid, freeClient: free
    });
    assert.equal(served.provider, "aistudio-free");
    assert.equal(free.calls[0].model, "gemini-2.5-flash-lite");
  });
  // The author kept the free selection and the tier went dark: no paid call.
  await withEnv({ ...ON, GEMINI_FREE_TIER_ENABLED: null }, async () => {
    const db = memoryDb();
    const free = recordingClient(() => textResponse({}));
    const paid = recordingClient(() => textResponse({}));
    const error = await tier.generateText({
      db, request: textRequest, stage: "room", requestedModel: "gemini-2.5-flash-lite",
      vertexClient: paid, freeClient: free
    }).then(() => null, (caught) => caught);
    assert.equal(error.code, "pigpen_free_tier_unavailable");
    assert.equal(paid.calls.length, 0);
    assert.equal(db.documents.size, 0);
    assert.deepEqual(retryPolicy(error, 1).status, "pending");
  });
});
