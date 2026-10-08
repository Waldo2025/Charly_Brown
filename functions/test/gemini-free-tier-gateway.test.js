const test = require("node:test");
const assert = require("node:assert/strict");
const tier = require("../src/gemini-free-tier.js");
const { dayKey } = require("../src/savings-policy.js");
const { createPigPenTextGateway, textDeadlineMs } = require("../src/pigpen-text-gateway.js");

const FREE_ENV = ["GEMINI_FREE_TIER_ENABLED", "GEMINI_FREE_TIER_PLAN", "GEMINI_FREE_TIER_API_KEY",
  "GEMINI_FREE_TIER_TEXT_MODEL", "GEMINI_FREE_TIER_DAILY_CALL_CAP",
  "GEMINI_FREE_TIER_TRANSIENT_ATTEMPTS", "GEMINI_FREE_TIER_RETRY_BACKOFF_MS"];
const ON = {
  GEMINI_FREE_TIER_ENABLED: "true",
  GEMINI_FREE_TIER_PLAN: "free",
  GEMINI_FREE_TIER_API_KEY: "test-key",
  GEMINI_FREE_TIER_TEXT_MODEL: "gemini-2.5-flash-lite",
  // Transient retries are real behaviour, their backoff is not something a suite should sleep on.
  GEMINI_FREE_TIER_RETRY_BACKOFF_MS: "1"
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

// Mirrors the SDK shape: `.text` is a prototype getter that JSON serialization drops.
class ServedResponse {
  constructor(parts) {
    this.candidates = [{ content: { role: "model", parts }, finishReason: "STOP" }];
    this.usageMetadata = { promptTokenCount: 5000, candidatesTokenCount: 800 };
  }

  get text() { return this.candidates[0].content.parts.map((part) => part.text || "").join(""); }
}

function fakeRes() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    set(key, value) { this.headers[key] = value; return this; }
  };
}

function fakeReq(body, { path = "/api/gemini/generate", method = "POST" } = {}) {
  return { method, path, body, requestId: "req_1", on() {} };
}

function harness({ freeResponse, freeError, freeErrors = null, db = memoryDb(), resolveAuth = async () => ({ uid: "owner_1" }), payloadLimitBytes = 200 } = {}) {
  const freeCalls = [];
  let attempts = 0;
  const client = {
    models: {
      generateContent: async (request) => {
        freeCalls.push(request);
        const error = Array.isArray(freeErrors) ? (freeErrors[attempts++] ?? null) : freeError;
        if (error) throw error;
        return freeResponse;
      }
    }
  };
  let nextCalls = 0;
  let nextError = null;
  const gateway = createPigPenTextGateway({
    contentTimeoutMs: 50,
    providerTimeoutMs: 5_000,
    payloadLimitBytes,
    services: () => ({ db }),
    resolveAuth,
    tier: { ...tier, attemptFreeText: (args) => tier.attemptFreeText({ ...args, freeClient: client }) }
  });
  const next = (error) => { nextCalls += 1; nextError = error || null; };
  return { db, freeCalls, next, get nextCalls() { return nextCalls; }, get nextError() { return nextError; }, gateway };
}

// What the browser sends when the author never touched the selector: the free model the
// catalog offered, not the built-in paid id.
const PIGPEN_BODY = {
  model: "gemini-2.5-flash-lite",
  generationProfile: "pigpen-fixed-content",
  singleAttempt: true,
  payload: { contents: [{ role: "user", parts: [{ text: "Genera la sala 1 en JSON." }] }], generationConfig: { responseMimeType: "application/json" } }
};

test("PigPen browser text is answered before the paid route runs", async () => {
  await withEnv(ON, async () => {
    const h = harness({ freeResponse: new ServedResponse([{ text: '{"sala":1}' }]) });
    const res = fakeRes();
    await h.gateway(fakeReq(PIGPEN_BODY), res, h.next);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["X-Charly-Provider"], "aistudio-free");
    assert.equal(h.nextCalls, 0);
    assert.equal(h.freeCalls[0].model, "gemini-2.5-flash-lite");
    assert.equal(JSON.parse(res.body.candidates[0].content.parts[0].text).sala, 1);
    // The browser contract reads candidates[].content.parts[].text, never `.text`.
    assert.equal(Object.hasOwn(res.body, "text"), false);
    // The marker is how the browser knows its model ladder must not switch to a paid model.
    assert.equal(res.body.charlyProvider, "aistudio-free");
    assert.equal(h.db.documents.get(`savings_daily_quotas/${dayKey(new Date())}_global`).freeTextCalls, 1);
  });
});

test("PigPen JSON turns reach the free tier with the profile the browser now sends", async () => {
  await withEnv(ON, async () => {
    const h = harness({ freeResponse: new ServedResponse([{ text: '{"plans":[]}' }]), payloadLimitBytes: 4096 });
    const res = fakeRes();
    await h.gateway(fakeReq({
      model: "gemini-2.5-flash-lite",
      generationProfile: "pigpen-text",
      payload: {
        systemInstruction: { parts: [{ text: "Responde solo JSON valido." }] },
        contents: [{ role: "user", parts: [{ text: "Completa la plantilla de la sala 1." }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: { type: "object" }, temperature: 0.24, maxOutputTokens: 16384 }
      }
    }), res, h.next);
    assert.equal(res.statusCode, 200);
    assert.equal(h.nextCalls, 0);
    assert.equal(h.freeCalls[0].model, "gemini-2.5-flash-lite");
    assert.equal(res.headers["X-Charly-Provider-Reason"], "served");
    assert.equal(h.db.documents.get(`savings_daily_quotas/${dayKey(new Date())}_global`).freeTextCalls, 1);
  });
});

test("the free tier keeps the paid route deadline for each profile", () => {
  const base = { contentTimeoutMs: 480_000, providerTimeoutMs: 105_000 };
  assert.equal(textDeadlineMs({ ...base, profile: "pigpen-fixed-content", singleAttempt: true }), 480_000);
  assert.equal(textDeadlineMs({ ...base, profile: "pigpen-fixed-content", singleAttempt: false }), 105_000);
  assert.equal(textDeadlineMs({ ...base, profile: "pigpen-text", singleAttempt: true }), 105_000);
});

test("anything that is not PigPen text falls through untouched", async () => {
  await withEnv(ON, async () => {
    for (const [body, path] of [
      [{ ...PIGPEN_BODY, generationProfile: "imagecreator" }, "/api/gemini/generate"],
      [{ ...PIGPEN_BODY, generationProfile: "pigpen-image" }, "/api/gemini/generate"],
      [{ ...PIGPEN_BODY, generationProfile: "sya-improve" }, "/api/gemini/generate"],
      [{ generationProfile: "pigpen-fixed-content", model: "gemini-2.5-flash", payload: {} }, "/api/gemini/live"],
      [{ model: "gemini-2.5-flash", payload: {} }, "/api/gemini/generate"]
    ]) {
      const h = harness({ freeResponse: new ServedResponse([{ text: "{}" }]) });
      const res = fakeRes();
      await h.gateway(fakeReq(body, { path }), res, h.next);
      assert.equal(h.nextCalls, 1, path + " " + JSON.stringify(body.generationProfile));
      assert.equal(h.freeCalls.length, 0);
      assert.equal(res.statusCode, null);
    }
  });
});

test("an unverified plan or missing key keeps the paid route for an undeclared model", async () => {
  // The built-in id is what a browser without a free offer sends, so the dark rollout
  // still generates on Vertex instead of stopping.
  for (const values of [{ GEMINI_FREE_TIER_ENABLED: null }, { ...ON, GEMINI_FREE_TIER_PLAN: "unverified" }, { ...ON, GEMINI_FREE_TIER_API_KEY: null }]) {
    await withEnv(values, async () => {
      const h = harness({ freeResponse: new ServedResponse([{ text: "{}" }]) });
      const res = fakeRes();
      await h.gateway(fakeReq({ ...PIGPEN_BODY, model: "gemini-2.5-flash" }), res, h.next);
      assert.equal(h.nextCalls, 1);
      assert.equal(h.freeCalls.length, 0);
      assert.equal(h.db.documents.size, 0);
    });
  }
});

test("the selector decides the provider and a free choice never buys a paid model", async () => {
  await withEnv(ON, async () => {
    // A model other than the free one is the author's own decision: no claim, straight to
    // the paid route that index.js already runs.
    const paid = harness({ freeResponse: new ServedResponse([{ text: "{}" }]) });
    const paidRes = fakeRes();
    await paid.gateway(fakeReq({ ...PIGPEN_BODY, model: "gemini-3.5-flash" }), paidRes, paid.next);
    assert.equal(paid.nextCalls, 1);
    assert.equal(paid.freeCalls.length, 0);
    assert.equal(paid.db.documents.size, 0);

    // The tier is switched off while the page still carries the free selection: stopping is
    // the promised behaviour, paying is not a fallback.
    await withEnv({ ...ON, GEMINI_FREE_TIER_ENABLED: null }, async () => {
      const stopped = harness({ freeResponse: new ServedResponse([{ text: "{}" }]) });
      const res = fakeRes();
      await stopped.gateway(fakeReq(PIGPEN_BODY), res, stopped.next);
      assert.equal(res.statusCode, 503);
      assert.equal(res.body.error, "pigpen_free_tier_unavailable");
      assert.equal(res.body.freeTier, true);
      assert.equal(res.headers["X-Charly-Provider-Reason"], "env_disabled");
      assert.equal(stopped.nextCalls, 0);
      assert.equal(stopped.db.documents.size, 0);
    });

    // A free-tier outage cannot be repaired by money either, however many times the same free
    // model is asked.
    const broken = harness({ freeError: Object.assign(new Error("503 UNAVAILABLE"), { status: 503 }) });
    const brokenRes = fakeRes();
    await broken.gateway(fakeReq(PIGPEN_BODY), brokenRes, broken.next);
    assert.equal(brokenRes.statusCode, 503);
    assert.equal(brokenRes.body.error, "pigpen_free_tier_unavailable");
    assert.equal(broken.nextCalls, 0);
    assert.equal(broken.freeCalls.length, 3, "the overload is retried on the free model only");
    assert.equal(broken.freeCalls.every((call) => call.model === "gemini-2.5-flash-lite"), true);
    // The claim is spent but no provider answered, and nothing went to Vertex.
    assert.equal(broken.db.documents.get(`savings_daily_quotas/${dayKey(new Date())}_global`).freeTextCalls, 1);
  });
});

test("a temporary overload clears on the next free attempt without a second claim", async () => {
  await withEnv(ON, async () => {
    const h = harness({
      freeResponse: new ServedResponse([{ text: '{"sala":1}' }]),
      freeErrors: [
        Object.assign(new Error("This model is currently experiencing high demand. Please try again later."), { status: 503, code: "UNAVAILABLE" }),
        null
      ]
    });
    const res = fakeRes();
    await h.gateway(fakeReq(PIGPEN_BODY), res, h.next);
    assert.equal(res.statusCode, 200);
    assert.equal(h.freeCalls.length, 2);
    assert.equal(h.nextCalls, 0);
    // One turn of work is one entry in the shared daily bucket, not one per attempt.
    assert.equal(h.db.documents.get(`savings_daily_quotas/${dayKey(new Date())}_global`).freeTextCalls, 1);
  });
});

test("a rate limit is never treated as an overload to retry", async () => {
  await withEnv(ON, async () => {
    const h = harness({ freeError: Object.assign(new Error("429 RESOURCE_EXHAUSTED"), { status: 429 }) });
    const res = fakeRes();
    await h.gateway(fakeReq(PIGPEN_BODY), res, h.next);
    assert.equal(res.statusCode, 429);
    assert.equal(res.body.error, "gemini_quota_exhausted");
    assert.equal(h.freeCalls.length, 1, "the shared bucket cools down instead of hammering it");
    assert.equal(h.nextCalls, 0);
  });
});

test("exhaustion answers 429 without touching the paid route", async () => {
  const db = memoryDb();
  db.documents.set(`savings_daily_quotas/${dayKey(new Date())}_global`, { freeTextCalls: 0, freeTextCooldownUntil: Date.now() + 3 * 60 * 60_000 });
  await withEnv(ON, async () => {
    const h = harness({ db, freeResponse: new ServedResponse([{ text: "{}" }]) });
    const res = fakeRes();
    await h.gateway(fakeReq(PIGPEN_BODY), res, h.next);
    assert.equal(res.statusCode, 429);
    assert.equal(res.body.error, "gemini_quota_exhausted");
    assert.equal(res.body.freeTier, true);
    assert.equal(res.body.permanentToday, true);
    assert.equal(res.headers["Retry-After"], String(Math.ceil(3 * 60 * 60)));
    assert.equal(h.nextCalls, 0);
    assert.equal(h.freeCalls.length, 0);
  });
});

test("the shared deadline stops instead of re-firing on Vertex", async () => {
  await withEnv(ON, async () => {
    const h = harness({ freeError: Object.assign(new Error("gemini_upstream_timeout"), { code: "gemini_upstream_timeout", status: 503 }) });
    const res = fakeRes();
    await h.gateway(fakeReq(PIGPEN_BODY), res, h.next);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error, "gemini_upstream_timeout");
    assert.equal(res.headers["Retry-After"], "2");
    assert.equal(h.nextCalls, 0);
    assert.equal(h.db.documents.get(`savings_daily_quotas/${dayKey(new Date())}_global`).freeTextCalls, 1);
  });
});

test("unsigned callers and oversized payloads never claim a free call", async () => {
  await withEnv(ON, async () => {
    const unauthorized = harness({
      freeResponse: new ServedResponse([{ text: "{}" }]),
      resolveAuth: async () => { throw Object.assign(new Error("auth_required"), { status: 401 }); }
    });
    const res1 = fakeRes();
    await unauthorized.gateway(fakeReq(PIGPEN_BODY), res1, unauthorized.next);
    assert.equal(unauthorized.freeCalls.length, 0);
    assert.equal(unauthorized.nextError?.status, 401);
    assert.equal(unauthorized.db.documents.size, 0);

    const oversized = harness({ freeResponse: new ServedResponse([{ text: "{}" }]), payloadLimitBytes: 10 });
    const res2 = fakeRes();
    await oversized.gateway(fakeReq(PIGPEN_BODY), res2, oversized.next);
    assert.equal(oversized.freeCalls.length, 0);
    assert.equal(oversized.nextError?.status, 413);
  });
});
