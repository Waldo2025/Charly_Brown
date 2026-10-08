"use strict";

// Routes PigPen's text generation to the Google AI Studio (Gemini Developer API)
// free tier so text costs nothing. Anything the free tier cannot serve must fail
// closed back to the paid Vertex client, except quota exhaustion, which stops
// rather than spending money.
const { GoogleGenAI } = require("@google/genai");
const { dayKey, quotaRef } = require("./savings-policy.js");

const GLOBAL_UID = "global";
// Attested 2026-10-03 against the free-tier key (docs/validation/gemini-free-tier-2026-10-03.md):
// gemini-2.5-flash-lite answers 404 "no longer available to new users", so the free default is
// the id the Developer API actually serves. Override with GEMINI_FREE_TIER_TEXT_MODEL.
const FALLBACK_TEXT_MODEL = "gemini-3.5-flash-lite";
const COOLDOWN_FLOOR_MS = 60_000;
const COOLDOWN_CEILING_MS = 15 * 60_000;
// America/Cancun, the timezone savings-policy.js keys its daily docs by (UTC-5 year round).
const DAY_TZ_OFFSET_MS = -5 * 60 * 60_000;

function envFlag(name, fallback = false) {
  const raw = String(process.env[name] || "").trim().toLowerCase();
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw);
}

function envNumber(name, fallback) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

// Deliberately not normalizeModel(): vertex.js aliases ids onto the paid registry, and
// rewriting the id verified in Phase 0 would send the free request to a model that may
// only exist on Vertex.
function freeTierTextModel() {
  return String(process.env.GEMINI_FREE_TIER_TEXT_MODEL || FALLBACK_TEXT_MODEL).trim();
}

function isFreeTierEnabled() {
  return envFlag("GEMINI_FREE_TIER_ENABLED", false)
    && String(process.env.GEMINI_FREE_TIER_PLAN || "").trim().toLowerCase() === "free";
}

// What the model selectors may offer. The key is part of the offer because a turn sent to
// the free model id stops instead of paying, and without a key it could never be served.
function describeFreeTierOffer() {
  return {
    enabled: isFreeTierEnabled() && Boolean(String(process.env.GEMINI_FREE_TIER_API_KEY || "").trim()),
    model: freeTierTextModel()
  };
}

// The id the caller asked for, split into what PigPen's selector means:
//   - a name other than the free model is an explicit paid choice, so Vertex serves it;
//   - the free model's own id is an explicit free choice, so nothing may be paid for it;
//   - no id at all is the service's own default, which is free whenever the tier is on and
//     paid while it is off, so legacy callers keep working during the dark rollout.
function classifyModelSelection(rawModel) {
  if (rawModel == null) return { paidModelSelected: false, explicitFreeSelection: false };
  const clean = String(rawModel).trim()
    .replace(/^(?:.*\/)?models\//i, "")
    .replace(/:(?:generateContent|streamGenerateContent)$/i, "");
  if (!clean || clean.toLowerCase() === "auto") return { paidModelSelected: false, explicitFreeSelection: false };
  return clean === freeTierTextModel()
    ? { paidModelSelected: false, explicitFreeSelection: true }
    : { paidModelSelected: true, explicitFreeSelection: false };
}

function createFreeTierClient() {
  const apiKey = String(process.env.GEMINI_FREE_TIER_API_KEY || "").trim();
  if (!apiKey) return null;
  return require("./research/budget.js").guardClient(new GoogleGenAI({
    apiKey,
    vertexai: false,
    httpOptions: { retryOptions: { attempts: 1 } }
  }));
}

// Inspects the built provider request instead of trusting a caller-supplied flag.
function inspectTextRequest(request = {}) {
  const config = request && typeof request.config === "object" ? request.config : {};
  const modalities = Array.isArray(config.responseModalities)
    ? config.responseModalities.map((value) => String(value || "").toUpperCase())
    : null;
  if (modalities && !modalities.every((value) => value === "TEXT")) return { ok: false, reason: "capability_modality" };
  if (config.imageConfig) return { ok: false, reason: "capability_image_config" };
  if (config.speechConfig) return { ok: false, reason: "capability_speech_config" };
  const tools = Array.isArray(config.tools) ? config.tools : [];
  if (tools.some((tool) => tool && (tool.googleSearch || tool.retrieval || tool.urlContext))) {
    return { ok: false, reason: "capability_grounding" };
  }
  if (tools.some((tool) => tool && Array.isArray(tool.functionDeclarations) && tool.functionDeclarations.length)) {
    return { ok: false, reason: "capability_tools" };
  }
  if (config.toolConfig) return { ok: false, reason: "capability_tool_config" };
  if (config.cachedContent) return { ok: false, reason: "capability_cached_content" };
  return { ok: true, reason: "text_only" };
}

function nextDayResetAt(now = Date.now()) {
  const [year, month, day] = String(dayKey(new Date(now))).split("-").map(Number);
  // dayKey() already reads the instant in the quota timezone, so the UTC midnight it
  // returns has to be shifted back by that offset to be the real rollover instant.
  const resetUtcMs = Date.UTC(year, month - 1, day + 1) - DAY_TZ_OFFSET_MS;
  return Math.max(resetUtcMs, now + COOLDOWN_FLOOR_MS);
}

function exhaustionError(nextRetryAt, now = Date.now()) {
  return Object.assign(new Error("pigpen_free_tier_exhausted"), {
    status: 429,
    code: "pigpen_free_tier_exhausted",
    permanentToday: nextRetryAt - now > COOLDOWN_CEILING_MS,
    // The queue reads retryAfterMs to schedule the next attempt; without it a 60 s rate
    // cooldown would be spent as three failed attempts inside half a minute.
    retryAfterMs: Math.max(1, nextRetryAt - now),
    detail: { nextRetryAt, retryAfterSeconds: Math.max(1, Math.ceil((nextRetryAt - now) / 1000)) }
  });
}

// The caller named the free model and the free tier cannot serve it right now. Paying for
// that turn is not a fallback, it is the thing the selection exists to prevent.
function unavailableError(reason) {
  return Object.assign(new Error("El modelo gratuito seleccionado no pudo responder y no se usó ningún modelo de cobro."), {
    status: 503,
    code: "pigpen_free_tier_unavailable",
    permanentToday: false,
    freeTierReason: String(reason || "unavailable")
  });
}

function isTerminalFreeTierError(error) {
  return ["pigpen_free_tier_exhausted", "pigpen_free_tier_unavailable"].includes(error?.code)
    || String(error?.code || error?.message || "") === "gemini_upstream_timeout";
}

async function readBudget(db, now = Date.now()) {
  const snapshot = await quotaRef(db, GLOBAL_UID, new Date(now)).get();
  const data = snapshot.data() || {};
  const cap = envNumber("GEMINI_FREE_TIER_DAILY_CALL_CAP", 850);
  return {
    day: dayKey(new Date(now)),
    calls: Number(data.freeTextCalls || 0),
    promptTokens: Number(data.freeTextPromptTokens || 0),
    outputTokens: Number(data.freeTextOutputTokens || 0),
    savedMxn: Number(data.freeTextSavedMxn || 0),
    cooldownUntil: Number(data.freeTextCooldownUntil || 0),
    dailyCallCap: cap,
    exhausted: Number(data.freeTextCalls || 0) >= cap || Number(data.freeTextCooldownUntil || 0) > now
  };
}

async function claimTextCall(db, { now = Date.now() } = {}) {
  const ref = quotaRef(db, GLOBAL_UID, new Date(now));
  const cap = envNumber("GEMINI_FREE_TIER_DAILY_CALL_CAP", 850);
  return db.runTransaction(async (tx) => {
    const data = (await tx.get(ref)).data() || {};
    const cooldownUntil = Number(data.freeTextCooldownUntil || 0);
    if (cooldownUntil > now) throw exhaustionError(cooldownUntil, now);
    const calls = Number(data.freeTextCalls || 0);
    if (calls >= cap) throw exhaustionError(nextDayResetAt(now), now);
    tx.set(ref, {
      ownerId: GLOBAL_UID,
      day: dayKey(new Date(now)),
      freeTextCalls: calls + 1,
      freeTextLastAt: now
    }, { merge: true });
    return { allowed: true, calls: calls + 1, cap };
  });
}

// Records the outcome of one attempt. A provider 429 cools the shared project
// bucket down; anything else only accumulates usage counters.
async function settleTextCall(db, { ok, usage = null, cooldownMs = 0, now = Date.now(), savedMxn = 0 } = {}) {
  const ref = quotaRef(db, GLOBAL_UID, new Date(now));
  await db.runTransaction(async (tx) => {
    const data = (await tx.get(ref)).data() || {};
    const patch = {
      ownerId: GLOBAL_UID,
      day: dayKey(new Date(now)),
      freeTextPromptTokens: Number(data.freeTextPromptTokens || 0) + Number(usage?.promptTokenCount || 0),
      freeTextOutputTokens: Number(data.freeTextOutputTokens || 0) + Number(usage?.candidatesTokenCount || 0) + Number(usage?.thoughtsTokenCount || 0),
      freeTextSavedMxn: Number(data.freeTextSavedMxn || 0) + Number(savedMxn || 0),
      freeTextLastAt: now
    };
    if (!ok && cooldownMs > 0) {
      const floor = envNumber("GEMINI_FREE_TIER_COOLDOWN_MS", COOLDOWN_FLOOR_MS);
      patch.freeTextCooldownUntil = Math.min(
        now + Math.max(Number(cooldownMs) || 0, floor),
        now + COOLDOWN_CEILING_MS
      );
    } else if (ok && Number(data.freeTextCooldownUntil || 0) <= now) {
      patch.freeTextCooldownUntil = 0;
    }
    tx.set(ref, patch, { merge: true });
  });
}

// Rough estimate only: the free tier bills nothing, so this reports what the same
// tokens would have cost at the paid Lite-class rates configured per deployment.
function estimateSavedMxn(usage = null) {
  const inputRate = envNumber("GEMINI_FREE_TIER_SAVED_USD_PER_MTOK_INPUT", 0.3);
  const outputRate = envNumber("GEMINI_FREE_TIER_SAVED_USD_PER_MTOK_OUTPUT", 2.5);
  const fxRate = envNumber("GEMINI_FREE_TIER_MXN_PER_USD", 18);
  const inputTokens = Number(usage?.promptTokenCount || 0);
  const outputTokens = Number(usage?.candidatesTokenCount || 0) + Number(usage?.thoughtsTokenCount || 0);
  return Math.round(((inputTokens / 1e6) * inputRate + (outputTokens / 1e6) * outputRate) * fxRate * 100) / 100;
}

function isQuotaError(error) {
  const detail = [error?.status, error?.code, error?.message, error?.response?.status, error?.response?.body?.error?.message]
    .filter(Boolean).join(" ");
  return Number(error?.status || error?.code || error?.response?.status || 0) === 429
    || /RESOURCE_EXHAUSTED|resource has been exhausted|quota/i.test(detail);
}

// Google sheds load on the free bucket with intermittent 503 "high demand" responses. They are
// not quota, and the browser may not answer one with a paid model, so the same free request is
// re-issued a few times before the turn is refused.
function isTransientFreeTierError(error) {
  if (isQuotaError(error)) return false;
  const status = Number(error?.status || error?.code || error?.response?.status || 0);
  const detail = [error?.message, error?.response?.body?.error?.message, error?.code]
    .filter(Boolean).join(" ");
  return status === 500 || status === 503 || /UNAVAILABLE|high demand|try again later|overload|saturated/i.test(detail);
}

function providerRetryDelayMs(error) {
  const raw = error?.response?.headers?.["retry-after"] ?? error?.retryAfterMs;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? (parsed > 1000 ? parsed : parsed * 1000) : 0;
}

function logRoute(fields = {}) {
  console.log(JSON.stringify({
    severity: "INFO",
    event: "gemini_provider_route",
    ...fields
  }));
}

// Gate order: env kill switch + plan attestation, key, stage toggle, the model the caller
// selected, request shape. A failure anywhere falls back to the paid Vertex client, except
// an exhausted bucket or a turn that explicitly named the free model, which stop.
function resolveTextRoute({ request, stage = "text", requestedModel = null } = {}) {
  const selection = classifyModelSelection(requestedModel);
  if (!isFreeTierEnabled()) return { useFreeTier: false, reason: "env_disabled", ...selection };
  if (!String(process.env.GEMINI_FREE_TIER_API_KEY || "").trim()) return { useFreeTier: false, reason: "key_missing", ...selection };
  if (stage === "review" && !envFlag("PIGPEN_FREE_TIER_REVIEW", true)) return { useFreeTier: false, reason: "stage_disabled", ...selection };
  if (selection.paidModelSelected) return { useFreeTier: false, reason: "paid_model_selected", ...selection };
  const inspected = inspectTextRequest(request);
  if (!inspected.ok) return { useFreeTier: false, reason: inspected.reason, ...selection };
  return { useFreeTier: true, reason: inspected.reason, model: freeTierTextModel(), ...selection };
}

async function describeFreeTierState(db, now = Date.now()) {
  const budget = db ? await readBudget(db, now) : null;
  return {
    enabled: isFreeTierEnabled(),
    keyConfigured: Boolean(String(process.env.GEMINI_FREE_TIER_API_KEY || "").trim()),
    planVerified: String(process.env.GEMINI_FREE_TIER_PLAN || "").trim().toLowerCase() === "free",
    model: freeTierTextModel(),
    dailyCallCap: envNumber("GEMINI_FREE_TIER_DAILY_CALL_CAP", 850),
    reviewOnFreeTier: envFlag("PIGPEN_FREE_TIER_REVIEW", true),
    usedToday: budget ? budget.calls : 0,
    promptTokensToday: budget ? budget.promptTokens : 0,
    outputTokensToday: budget ? budget.outputTokens : 0,
    estimatedSavedMxnToday: budget ? budget.savedMxn : 0,
    cooldownUntil: budget ? budget.cooldownUntil : 0,
    exhausted: budget ? budget.exhausted : false
  };
}

// Attempts one free-tier call. Returns served:false with the reason the free tier is not
// applicable (the caller then uses the paid client) when the caller left the model to the
// service or picked a paid model itself. Throws when the free tier was selected on purpose
// and cannot answer, when the shared bucket is exhausted, or when the caller's own deadline
// expired, because none of those may be answered by spending money.
async function attemptFreeText({ db, request, stage = "text", requestedModel = null, requestId = null, service = "pigpen-generation", execute = null, freeClient = null } = {}) {
  const route = resolveTextRoute({ request, stage, requestedModel });
  if (!route.useFreeTier) {
    if (route.explicitFreeSelection) throw unavailableError(route.reason);
    return { served: false, reason: route.reason, explicitFreeSelection: false, paidModelSelected: route.paidModelSelected };
  }
  const client = freeClient || createFreeTierClient();
  if (!client) {
    if (route.explicitFreeSelection) throw unavailableError("key_missing");
    return { served: false, reason: "key_missing", explicitFreeSelection: false, paidModelSelected: route.paidModelSelected };
  }
  const startedAt = Date.now();
  let claim = null;
  try {
    claim = await claimTextCall(db);
  } catch (error) {
    if (error?.code === "pigpen_free_tier_exhausted") throw error;
    if (route.explicitFreeSelection) throw unavailableError("budget_unavailable");
    return { served: false, reason: "budget_unavailable", explicitFreeSelection: false, paidModelSelected: false };
  }
  const freeRequest = { ...request, model: route.model };
  const run = execute || ((client, prepared) => client.models.generateContent(prepared));
  // One turn stays one claimed call: the retries below are the same turn, not extra work the
  // author asked for, and they only happen on an error that produced no answer.
  const maxAttempts = Math.max(1, envNumber("GEMINI_FREE_TIER_TRANSIENT_ATTEMPTS", 3));
  let attemptIndex = 0;
  while (true) {
    attemptIndex += 1;
    try {
      // The client resolved above, not the caller's argument: a caller that leaves freeClient
      // unset gets the module-built one, and handing the executor a null client would fail
      // every free-tier call before it reached the provider.
      const response = await run(client, freeRequest);
      const usage = response?.usageMetadata || null;
      const savedMxn = estimateSavedMxn(usage);
      await settleTextCall(db, { ok: true, usage, savedMxn });
      logRoute({
        service, requestId, stage, provider: "aistudio-free", reason: "served", model: route.model,
        vertexModel: request.model, durationMs: Date.now() - startedAt,
        promptTokens: Number(usage?.promptTokenCount || 0), outputTokens: Number(usage?.candidatesTokenCount || 0),
        thoughtTokens: Number(usage?.thoughtsTokenCount || 0), estimatedSavedMxn: savedMxn,
        freeTierCallsToday: claim.calls, attempts: attemptIndex
      });
      return { served: true, response, model: route.model, savedMxn, callsToday: claim.calls, reason: "served", explicitFreeSelection: route.explicitFreeSelection, paidModelSelected: false };
    } catch (error) {
      // A caller-side deadline is terminal: repeating it on the paid client would
      // spend money on work the browser was already told did not finish.
      if (isTerminalFreeTierError(error)) throw error;
      if (isTransientFreeTierError(error) && attemptIndex < maxAttempts) {
        logRoute({
          severity: "NOTICE", service, requestId, stage, provider: "aistudio-free",
          reason: "free_tier_retry", model: route.model, vertexModel: request.model,
          durationMs: Date.now() - startedAt, attempts: attemptIndex,
          error: String(error?.message || error).slice(0, 300)
        });
        await new Promise((resolve) => setTimeout(resolve, providerRetryDelayMs(error)
          || attemptIndex * envNumber("GEMINI_FREE_TIER_RETRY_BACKOFF_MS", 2_000)));
        continue;
      }
      if (isQuotaError(error)) {
        await settleTextCall(db, { ok: false, cooldownMs: providerRetryDelayMs(error) });
        const budget = await readBudget(db);
        logRoute({
          severity: "WARNING", service, requestId, stage, provider: "aistudio-free",
          reason: "quota_exhausted", model: route.model, durationMs: Date.now() - startedAt,
          cooldownUntil: budget.cooldownUntil
        });
        throw exhaustionError(budget.cooldownUntil || Date.now() + COOLDOWN_CEILING_MS);
      }
      await settleTextCall(db, { ok: false });
      logRoute({
        severity: "WARNING", service, requestId, stage, provider: route.explicitFreeSelection ? "aistudio-free" : "vertex",
        reason: route.explicitFreeSelection ? "free_tier_stopped" : "free_tier_error",
        model: request.model, durationMs: Date.now() - startedAt, attempts: attemptIndex,
        error: String(error?.message || error).slice(0, 300)
      });
      if (route.explicitFreeSelection) throw unavailableError("free_tier_error");
      return { served: false, reason: "free_tier_error", explicitFreeSelection: false, paidModelSelected: false };
    }
  }
}

// One text attempt: free tier when eligible, paid Vertex otherwise. An exhausted bucket,
// an expired deadline and a turn that named the free model are terminal; every other
// free-tier failure falls closed to the paid client.
async function generateText({
  db,
  request,
  stage = "text",
  requestedModel = null,
  vertexClient,
  requestId = null,
  service = "pigpen-generation",
  freeClient = null,
  metric = () => {}
} = {}) {
  const startedAt = Date.now();
  try {
    const attempt = await attemptFreeText({ db, request, stage, requestedModel, requestId, service, freeClient });
    if (attempt.served) {
      metric({ model: attempt.model, durationMs: Date.now() - startedAt, usage: attempt.response?.usageMetadata || null });
      return { response: attempt.response, provider: "aistudio-free", reason: "served", model: attempt.model };
    }
    const response = await vertexClient.models.generateContent(request);
    if (routeLogNeeded(attempt.reason)) {
      logRoute({ service, requestId, stage, provider: "vertex", reason: attempt.reason, model: request.model, durationMs: Date.now() - startedAt });
    }
    return { response, provider: "vertex", reason: attempt.reason, model: request.model };
  } catch (error) {
    if (isTerminalFreeTierError(error)) throw error;
    const response = await vertexClient.models.generateContent(request);
    logRoute({
      severity: "WARNING", service, requestId, stage, provider: "vertex", reason: "free_tier_unavailable",
      model: request.model, durationMs: Date.now() - startedAt, error: String(error?.message || error).slice(0, 300)
    });
    return { response, provider: "vertex", reason: "free_tier_unavailable", model: request.model };
  }
}

// env_disabled is the normal state for every other editor; logging it per call
// would bury the useful events.
function routeLogNeeded(reason) {
  return !["env_disabled"].includes(reason);
}

module.exports = {
  GLOBAL_UID,
  FALLBACK_TEXT_MODEL,
  isFreeTierEnabled,
  freeTierTextModel,
  describeFreeTierOffer,
  classifyModelSelection,
  createFreeTierClient,
  inspectTextRequest,
  resolveTextRoute,
  attemptFreeText,
  generateText,
  claimTextCall,
  settleTextCall,
  readBudget,
  describeFreeTierState,
  estimateSavedMxn,
  isQuotaError,
  isTransientFreeTierError,
  providerRetryDelayMs,
  exhaustionError,
  unavailableError,
  isTerminalFreeTierError,
  logRoute
};
