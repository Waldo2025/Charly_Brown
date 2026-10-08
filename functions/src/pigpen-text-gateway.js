"use strict";

// Browser-side half of the free-tier routing: every PigPenCreator text turn is answered by
// AI Studio before it reaches the paid Vertex route. The browser tags each of them with one
// of these profiles and sends the model the author picked in #objetivoModeloSelect, which is
// the free model unless it was changed on purpose. Anything untagged (another editor, or
// PigPen's own image turns) keeps its current paid behaviour.
// Registered with app.use() so the existing POST handler stays byte-identical.
const { getAdminServices, resolveAuthContext } = require("./common.js");
const { buildVertexGenerateRequest } = require("./vertex.js");
const freeTier = require("./gemini-free-tier.js");

const PIGPEN_FIXED_CONTENT_PROFILE = "pigpen-fixed-content";
const PIGPEN_TEXT_PROFILE = "pigpen-text";
const TEXT_PROFILES = new Set([PIGPEN_FIXED_CONTENT_PROFILE, PIGPEN_TEXT_PROFILE]);

// The paid route grants the long window only to a single-attempt fixed-content turn
// (index.js); a JSON turn keeps the provider deadline. Free tier must not change that,
// otherwise a browser tab would hold a request open for a model that was never scheduled
// for a 8-minute turn.
function textDeadlineMs({ profile, singleAttempt, contentTimeoutMs, providerTimeoutMs }) {
  return singleAttempt === true && profile === PIGPEN_FIXED_CONTENT_PROFILE
    ? contentTimeoutMs : providerTimeoutMs;
}

function exhaustionResponse(res, error, requestId) {
  const seconds = Math.max(1, Math.min(86400, Number(error?.detail?.retryAfterSeconds || 60)));
  res.set("Retry-After", String(seconds));
  res.set("X-Charly-Provider", "aistudio-free");
  res.set("X-Charly-Provider-Reason", "quota_exhausted");
  return res.status(429).json({
    error: "gemini_quota_exhausted",
    freeTier: true,
    // The browser's model ladder would switch to a paid Gemini model on a 429; this flag is
    // how it learns that the turn belongs to the free tier and must stop instead.
    permanentToday: error?.permanentToday === true,
    message: "El plan gratuito de Gemini agotó su cupo diario de texto. Las salas terminadas se conservan; reintenta cuando se renueve el cupo.",
    retryAfterSeconds: seconds,
    freeTierNextRetryAt: error?.detail?.nextRetryAt || null,
    requestId: requestId || undefined
  });
}

function unavailableResponse(res, error, requestId) {
  res.set("X-Charly-Provider", "aistudio-free");
  res.set("X-Charly-Provider-Reason", String(error?.freeTierReason || "unavailable"));
  return res.status(503).json({
    error: "pigpen_free_tier_unavailable",
    freeTier: true,
    reason: error?.freeTierReason || "unavailable",
    message: "El modelo gratuito seleccionado no pudo responder y no se usó ningún modelo de cobro. Reintenta más tarde o cambia el modelo en el selector de IA.",
    requestId: requestId || undefined
  });
}

// Same deadline contract as the paid route: one attempt, no silent retry, and a
// distinguishable gemini_upstream_timeout so the browser stops instead of re-firing.
function withDeadline(client, request, timeoutMs, signal) {
  let timeoutId;
  const deadline = new Promise((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error("gemini_upstream_timeout");
      error.code = "gemini_upstream_timeout";
      error.status = 503;
      reject(error);
    }, timeoutMs);
  });
  return Promise.race([
    signal ? client.models.generateContent({ ...request, config: { ...request.config, abortSignal: signal } })
      : client.models.generateContent(request),
    deadline
  ]).finally(() => clearTimeout(timeoutId));
}

function createPigPenTextGateway({
  contentTimeoutMs = 480_000,
  providerTimeoutMs = 105_000,
  tier = freeTier,
  services = getAdminServices,
  resolveAuth = resolveAuthContext,
  payloadLimitBytes = 8 * 1024 * 1024
} = {}) {
  return async (req, res, next) => {
    if (req.method !== "POST" || req.path !== "/api/gemini/generate") return next();
    const profile = String(req.body?.generationProfile || "");
    if (!TEXT_PROFILES.has(profile)) return next();
    const timeoutMs = textDeadlineMs({ profile, singleAttempt: req.body?.singleAttempt, contentTimeoutMs, providerTimeoutMs });
    const payload = req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : {};
    // Same guards as the paid route, before anything is claimed: a caller without a
    // verified token cannot drain the shared daily bucket, and an oversized payload
    // must keep failing the way it does today.
    try {
      await resolveAuth(req);
    } catch (error) {
      return next(error);
    }
    if (Buffer.byteLength(JSON.stringify(payload), "utf8") > payloadLimitBytes) {
      return next(Object.assign(new Error("gemini_payload_too_large"), { status: 413 }));
    }
    const request = buildVertexGenerateRequest({ model: String(req.body?.model || "").trim(), payload });
    const abort = new AbortController();
    req.on("close", () => abort.abort());
    const attempt = await tier.attemptFreeText({
      db: services().db,
      request: { ...request, config: { ...request.config, httpOptions: { retryOptions: { attempts: 1 } } } },
      stage: profile === PIGPEN_FIXED_CONTENT_PROFILE ? "browser_content" : "browser_json",
      // The raw id is the user's selector value; the built request has already been aliased
      // onto the paid registry, so intent has to travel beside it.
      requestedModel: String(req.body?.model || "").trim(),
      requestId: req.requestId || null,
      service: "gemini-api",
      execute: (client, prepared) => withDeadline(client, prepared, timeoutMs, abort.signal)
    }).catch((error) => ({ thrown: error }));
    if (attempt?.thrown?.code === "pigpen_free_tier_exhausted") return exhaustionResponse(res, attempt.thrown, req.requestId);
    if (attempt?.thrown) {
      if (attempt.thrown?.code === "pigpen_free_tier_unavailable") return unavailableResponse(res, attempt.thrown, req.requestId);
      if (String(attempt.thrown?.code || attempt.thrown?.message || "") === "gemini_upstream_timeout") {
        res.set("Retry-After", "2");
        res.set("X-Charly-Provider", "aistudio-free");
        return res.status(503).json({
          error: "gemini_upstream_timeout",
          message: "El plan gratuito de Gemini no terminó dentro del tiempo de espera. No se lanzó otra solicitud.",
          requestId: req.requestId || undefined
        });
      }
      return next(attempt.thrown);
    }
    // A turn that named a paid model is the user's own choice and belongs to the paid route
    // below; an untagged eligibility failure (kill switch off, key missing) keeps falling
    // through so PigPen keeps working while the free tier is dark.
    if (!attempt?.served) return next();
    res.set("X-Charly-Provider", "aistudio-free");
    res.set("X-Charly-Provider-Reason", String(attempt.reason || "served"));
    // Same serialization as the paid route: `.text` is a prototype getter and is
    // dropped here, so browsers keep reading candidates[0].content.parts[].text.
    const body = JSON.parse(JSON.stringify(attempt.response));
    // Lets the browser tell that this answer came from the free tier, so its own model
    // ladder cannot switch a free turn to a model of cobro.
    body.charlyProvider = "aistudio-free";
    return res.status(200).json(body);
  };
}

module.exports = {
  createPigPenTextGateway,
  exhaustionResponse,
  unavailableResponse,
  withDeadline,
  textDeadlineMs,
  PIGPEN_FIXED_CONTENT_PROFILE,
  PIGPEN_TEXT_PROFILE
};
