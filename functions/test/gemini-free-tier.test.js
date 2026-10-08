const test = require("node:test");
const assert = require("node:assert/strict");
const { buildVertexGenerateRequest } = require("../src/vertex.js");
const {
  FALLBACK_TEXT_MODEL,
  inspectTextRequest,
  isFreeTierEnabled,
  freeTierTextModel,
  describeFreeTierOffer,
  resolveTextRoute,
  exhaustionError,
  estimateSavedMxn,
  isQuotaError,
  providerRetryDelayMs
} = require("../src/gemini-free-tier.js");

const FREE_KEYS = ["GEMINI_FREE_TIER_ENABLED", "GEMINI_FREE_TIER_PLAN", "GEMINI_FREE_TIER_API_KEY",
  "GEMINI_FREE_TIER_TEXT_MODEL", "PIGPEN_FREE_TIER_REVIEW"];

function withEnv(values, run) {
  const previous = Object.fromEntries(FREE_KEYS.map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === null) delete process.env[key];
    else process.env[key] = String(value);
  }
  try {
    return run();
  } finally {
    for (const key of FREE_KEYS) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

const enabled = { GEMINI_FREE_TIER_ENABLED: "true", GEMINI_FREE_TIER_PLAN: "free", GEMINI_FREE_TIER_API_KEY: "test-key" };

// Mirrors the image stage of pigpen-generation-workers.js, which must stay paid.
const imageStageRequest = () => buildVertexGenerateRequest({
  model: "gemini-3.1-flash-image",
  payload: {
    contents: [{ role: "user", parts: [{ text: "Ilustra la sala" }] }],
    generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "16:9", imageSize: "1K" } }
  }
});

// Mirrors the review stage: multimodal input, JSON text output, no tools.
const reviewStageRequest = () => buildVertexGenerateRequest({
  model: "gemini-3.5-flash",
  payload: {
    contents: [{ role: "user", parts: [
      { text: "Revisa esta sala y responde JSON." },
      { inlineData: { mimeType: "image/png", data: "AAAA" } }
    ] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: { type: "OBJECT", properties: { hallazgos: { type: "ARRAY" } } } }
  }
});

test("text-only requests are eligible on the free tier", () => {
  const plain = buildVertexGenerateRequest({
    model: "gemini-2.5-flash",
    payload: { contents: [{ role: "user", parts: [{ text: "Genera el objetivo" }] }], generationConfig: { responseMimeType: "application/json" } }
  });
  assert.deepEqual(inspectTextRequest(plain), { ok: true, reason: "text_only" });
  const thinking = buildVertexGenerateRequest({
    model: "gemini-2.5-flash",
    payload: { contents: [{ role: "user", parts: [{ text: "Piensa" }] }], generationConfig: { thinkingConfig: { thinkingLevel: "LOW" } } }
  });
  assert.equal(inspectTextRequest(thinking).ok, true);
  assert.equal(inspectTextRequest(reviewStageRequest()).ok, true);
});

test("capabilities the free tier does not serve are rejected by request shape", () => {
  assert.deepEqual(inspectTextRequest(imageStageRequest()), { ok: false, reason: "capability_modality" });
  const checks = [
    [{ responseModalities: ["TEXT", "IMAGE"] }, "capability_modality"],
    [{ imageConfig: { aspectRatio: "1:1" } }, "capability_image_config"],
    [{ speechConfig: { voiceConfig: {} } }, "capability_speech_config"],
    [{ tools: [{ googleSearch: {} }] }, "capability_grounding"],
    [{ tools: [{ urlContext: {} }] }, "capability_grounding"],
    [{ tools: [{ functionDeclarations: [{ name: "search" }] }] }, "capability_tools"],
    [{ toolConfig: {} }, "capability_tool_config"],
    [{ cachedContent: "cachedContents/abc" }, "capability_cached_content"]
  ];
  for (const [config, reason] of checks) {
    assert.deepEqual(inspectTextRequest({ model: "gemini-2.5-flash", contents: [], config }), { ok: false, reason }, JSON.stringify(config));
  }
});

test("route gates fail closed to Vertex in order", () => {
  const text = reviewStageRequest();
  assert.deepEqual(withEnv({ GEMINI_FREE_TIER_ENABLED: null }, () => resolveTextRoute({ request: text })), { useFreeTier: false, reason: "env_disabled", paidModelSelected: false, explicitFreeSelection: false });
  assert.equal(withEnv({ ...enabled, GEMINI_FREE_TIER_PLAN: "unverified" }, () => isFreeTierEnabled()), false);
  assert.equal(withEnv({ ...enabled, GEMINI_FREE_TIER_ENABLED: "on", GEMINI_FREE_TIER_PLAN: " FREE " }, () => isFreeTierEnabled()), true);
  assert.equal(withEnv({ ...enabled, GEMINI_FREE_TIER_API_KEY: "  " }, () => resolveTextRoute({ request: text })).reason, "key_missing");
  assert.equal(withEnv({ ...enabled, PIGPEN_FREE_TIER_REVIEW: "false" }, () => resolveTextRoute({ request: text, stage: "review" })).reason, "stage_disabled");
  assert.equal(withEnv(enabled, () => resolveTextRoute({ request: text, stage: "review" })).useFreeTier, true);
  assert.equal(withEnv(enabled, () => resolveTextRoute({ request: imageStageRequest(), stage: "image" })).reason, "capability_modality");
});

test("the model the author selected decides free or paid", () => {
  const text = reviewStageRequest();
  const lite = { ...enabled, GEMINI_FREE_TIER_TEXT_MODEL: "gemini-2.5-flash-lite" };
  // A name that is not the free model is an explicit choice, so it is served as paid.
  const paid = withEnv(lite, () => resolveTextRoute({ request: text, requestedModel: "gemini-3.5-flash" }));
  assert.deepEqual(paid, { useFreeTier: false, reason: "paid_model_selected", paidModelSelected: true, explicitFreeSelection: false });
  // Naming the free model means nothing may be paid if it cannot answer.
  const free = withEnv(lite, () => resolveTextRoute({ request: text, requestedModel: "models/gemini-2.5-flash-lite:generateContent" }));
  assert.equal(free.useFreeTier, true);
  assert.equal(free.explicitFreeSelection, true);
  // No declared model is the service default: free when the tier is on, and never an
  // explicit-free stop when it is off, so legacy callers keep working during the rollout.
  assert.equal(withEnv(lite, () => resolveTextRoute({ request: text, requestedModel: "" })).useFreeTier, true);
  assert.deepEqual(withEnv({ GEMINI_FREE_TIER_ENABLED: null }, () => resolveTextRoute({ request: text, requestedModel: "" })),
    { useFreeTier: false, reason: "env_disabled", paidModelSelected: false, explicitFreeSelection: false });
  assert.equal(withEnv(lite, () => resolveTextRoute({ request: text, requestedModel: "auto" })).useFreeTier, true);
  // The gate order still wins over the selection: an author cannot pick their way onto the
  // free tier with a request shape it does not serve.
  assert.equal(withEnv(lite, () => resolveTextRoute({ request: imageStageRequest(), stage: "image", requestedModel: "gemini-2.5-flash-lite" })).explicitFreeSelection, true);
});

test("describeFreeTierOffer only offers what it can actually serve", () => {
  assert.deepEqual(withEnv(enabled, () => describeFreeTierOffer()), { enabled: true, model: FALLBACK_TEXT_MODEL });
  assert.equal(withEnv({ ...enabled, GEMINI_FREE_TIER_API_KEY: "  " }, () => describeFreeTierOffer()).enabled, false);
  assert.equal(withEnv({ ...enabled, GEMINI_FREE_TIER_ENABLED: null }, () => describeFreeTierOffer()).enabled, false);
  assert.deepEqual(withEnv({ ...enabled, GEMINI_FREE_TIER_TEXT_MODEL: " gemini-2.5-flash-lite " }, () => describeFreeTierOffer()),
    { enabled: true, model: "gemini-2.5-flash-lite" });
});

test("the configured free-tier model id is used verbatim", () => {
  assert.equal(withEnv(enabled, () => freeTierTextModel()), FALLBACK_TEXT_MODEL);
  const route = withEnv({ ...enabled, GEMINI_FREE_TIER_TEXT_MODEL: "gemini-2.5-flash-lite" }, () => resolveTextRoute({ request: reviewStageRequest() }));
  assert.equal(route.model, "gemini-2.5-flash-lite");
  // vertex.js would alias 2.5 ids onto the paid registry; the free request must not.
  assert.equal(withEnv({ ...enabled, GEMINI_FREE_TIER_TEXT_MODEL: " gemini-2.5-flash-lite " }, () => freeTierTextModel()), "gemini-2.5-flash-lite");
});

test("exhaustion errors carry the browser-facing retry vocabulary", () => {
  const now = 1_800_000_000_000;
  const short = exhaustionError(now + 60_000, now);
  assert.equal(short.code, "pigpen_free_tier_exhausted");
  assert.equal(short.status, 429);
  assert.equal(short.permanentToday, false);
  assert.equal(short.detail.retryAfterSeconds, 60);
  const untilDay = exhaustionError(now + 6 * 60 * 60_000, now);
  assert.equal(untilDay.permanentToday, true);
  assert.equal(untilDay.detail.retryAfterSeconds, 6 * 3600);
});

test("quota detection and saved-cost estimate", () => {
  assert.equal(isQuotaError({ status: 429 }), true);
  assert.equal(isQuotaError(new Error("429 RESOURCE_EXHAUSTED quota exceeded")), true);
  assert.equal(isQuotaError({ status: 503, message: "Unavailable" }), false);
  assert.equal(providerRetryDelayMs({ response: { headers: { "retry-after": "30" } } }), 30_000);
  assert.equal(providerRetryDelayMs({ response: { headers: { "retry-after": "45000" } } }), 45_000);
  assert.equal(providerRetryDelayMs({}), 0);
  const saved = withEnv({ GEMINI_FREE_TIER_SAVED_USD_PER_MTOK_INPUT: "0.3", GEMINI_FREE_TIER_SAVED_USD_PER_MTOK_OUTPUT: "2.5", GEMINI_FREE_TIER_MXN_PER_USD: "18" },
    () => estimateSavedMxn({ promptTokenCount: 1_000_000, candidatesTokenCount: 100_000, thoughtsTokenCount: 100_000 }));
  assert.equal(saved, Math.round((0.3 * 1 + 2.5 * 0.2) * 18 * 100) / 100);
  assert.equal(estimateSavedMxn(null), 0);
});
