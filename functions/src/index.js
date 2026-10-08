const express = require("express");
const { vertexFailureDiagnostic } = require("./vertex-diagnostics.js");
const { GoogleAuth } = require("google-auth-library");
const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onMessagePublished } = require("firebase-functions/v2/pubsub");
const { defineSecret } = require("firebase-functions/params");
const {
  REGION, PROJECT_ID,
  getAdminServices,
  resolveAuthContext,
  asyncRoute,
  installCommonMiddleware,
  installErrorHandler
} = require("./common.js");
const {
  createVertexClient,
  buildVertexGenerateRequest,
  isVertexInvalidArgument,
  buildVertexCompatibilityPayload,
  sanitizeVertexSchema
} = require("./vertex.js");
const { registerCharlyBrownMcpRoutes } = require("./charly-brown-mcp.js");
const { registerUploadRoutes, registerSupportGraphicUploadRoute } = require("./uploads.js");
const { registerAssetRoutes } = require("./assets.js");
const { registerPodcasterDataRoutes } = require("./podcaster-data.js");
const { registerMontageRoutes } = require("./montage-routes.js");
const { dispatchMontageToCloudRun } = require("./montage-dispatch.js");
const { registerVeoRoutes, registerGeminiJobRoutes, registerAiJobStatusRoute, dispatchAiJob } = require("./ai-jobs.js");
const { monitorStalePodcasterJobs } = require("./stale-job-monitor.js");
const { registerAnalizarPdfDataRoutes } = require("./analizar-pdf-data.js");
const { registerAnalizarPdfWorkerProxyRoutes } = require("./analizar-pdf-worker-proxy.js");
const { registerScienceActivitiesRoutes } = require("./science-activities.js");
const { registerPigPenShareRoutes } = require("./pigpen-share.js");
const { registerPigpenSheetsRoutes } = require("./pigpen-sheets.js");
const { registerSavingsRoutes } = require("./savings-policy.js");
const { registerMarcieWordPressRoutes } = require("./marcie-wordpress.js");
const { registerMarcieEditorialResearchRoutes } = require("./marcie-editorial-research.js");
const { registerMarcieEditorialAgentRoutes } = require("./marcie-editorial-agent.js");
const { monitorMarcieEditorialCalendar } = require("./marcie-editorial-monitor.js");
const { refreshMarcieTrendsIfDue } = require("./marcie-trend-refresh.js");
const { createPigPenTextGateway } = require("./pigpen-text-gateway.js");

const TASK_INVOKER_EMAIL = "charly-tasks-invoker@charly-brown.iam.gserviceaccount.com";
const MARCIE_WORDPRESS_CONFIG_JSON = defineSecret("MARCIE_WORDPRESS_CONFIG_JSON");
// Lives in a billing-free project; deliberately separate from GEMINI_API_KEY, which
// ai-jobs.js uses for voice and audio and must never point at the free bucket.
const GEMINI_FREE_TIER_API_KEY = defineSecret("GEMINI_FREE_TIER_API_KEY");

function createApp(service, health = {}, options = {}) {
  const app = express();
  installCommonMiddleware(app, { service });
  app.use(express.json({ limit: options.jsonLimit || "1mb" }));
  app.get("/api/health", (_req, res) => res.status(200).json({ ok: true, service, provider: "google-cloud", ...health }));
  return app;
}

const pigpenGenerationApp = createApp('pigpen-generation', {}, { jsonLimit: '1mb' });
require('./pigpen-generation-routes.js').registerGenerationRoutes(pigpenGenerationApp);
installErrorHandler(pigpenGenerationApp, { service: 'pigpen-generation' });
exports.pigpenGenerationApi = onRequest({ region: REGION, serviceAccount: 'charly-functions-ai@charly-brown.iam.gserviceaccount.com', memory: '512MiB', timeoutSeconds: 120, maxInstances: 5, invoker: 'public', secrets: [GEMINI_FREE_TIER_API_KEY] }, pigpenGenerationApp);
const pigpenTaskApp = createApp('pigpen-generation-task');
pigpenTaskApp.post('/', asyncRoute(async (req, res) => {
  if (!req.headers['x-cloudtasks-taskname'] && process.env.FUNCTIONS_EMULATOR !== 'true') throw Object.assign(new Error('cloud_tasks_request_required'), { status: 403 });
  res.json(await require('./pigpen-generation-coordinator.js').createCoordinator().dispatch(String(req.body?.runId || ''), String(req.body?.taskId || '')));
}));
installErrorHandler(pigpenTaskApp, { service: 'pigpen-generation-task' });
exports.dispatchPigPenGenerationTask = onRequest({ region: REGION, serviceAccount: 'charly-functions-ai@charly-brown.iam.gserviceaccount.com', memory: '1GiB', timeoutSeconds: 540, maxInstances: 6, concurrency: 1, invoker: [TASK_INVOKER_EMAIL], secrets: [GEMINI_FREE_TIER_API_KEY] }, pigpenTaskApp);
const pigpenRecoveryApp = createApp('pigpen-generation-recovery');
pigpenRecoveryApp.post('/', asyncRoute(async (req, res) => {
  const { runId, epoch, sequence } = req.body || {};
  if (!/^[a-f0-9]{32}$/.test(String(runId || '')) || !epoch || !Number.isSafeInteger(sequence)) {
    throw Object.assign(new Error('invalid_recovery_task'), { status: 400 });
  }
  res.json(await require('./pigpen-demand-recovery.js').recoverRun(
    require('./pigpen-generation-coordinator.js').createCoordinator(), { runId, epoch, sequence }));
}));
installErrorHandler(pigpenRecoveryApp, { service: 'pigpen-generation-recovery' });
exports.recoverPigPenGenerationTask = onRequest({ region: REGION,
  serviceAccount: 'charly-functions-ai@charly-brown.iam.gserviceaccount.com',
  memory: '256MiB', minInstances: 0, maxInstances: 2, concurrency: 4,
  timeoutSeconds: 60, invoker: [TASK_INVOKER_EMAIL], secrets: [GEMINI_FREE_TIER_API_KEY]
}, pigpenRecoveryApp);
exports.recordSavingsBilling = onMessagePublished({ topic: "charly-savings-billing", region: REGION, serviceAccount: 'charly-functions-core@charly-brown.iam.gserviceaccount.com', retry: false }, (event) => require('./savings-billing.js').recordBillingBudget(event));

const podcasterApp = createApp("podcaster-api", {
  podcasterDialogueAudioRoute: true,
  podcasterResumableUploads: true,
  podcasterCloudTasks: true
});
registerUploadRoutes(podcasterApp);
registerPodcasterDataRoutes(podcasterApp);
registerMontageRoutes(podcasterApp);
registerAiJobStatusRoute(podcasterApp);
installErrorHandler(podcasterApp, { service: "podcaster-api" });

const GEMINI_PROXY_JSON_LIMIT = "10mb";
const GEMINI_PROXY_PAYLOAD_LIMIT_BYTES = 8 * 1024 * 1024;
const geminiApp = createApp("gemini-api", {
  podcasterDialogueAudioRoute: true,
  geminiLiveProxy: false,
  providerAuth: "adc"
}, { jsonLimit: GEMINI_PROXY_JSON_LIMIT });
registerSavingsRoutes(geminiApp);
// Standard requests retain their existing deadline. Fixed PigPen content uses
// one sequential call for an entire room; leave 60 s inside the 540 s function
// budget to serialize the result. This profile never enables extra attempts.
const GEMINI_PROVIDER_TIMEOUT_MS = 105_000;
const PIGPEN_CONTENT_TIMEOUT_MS = 480_000;

function generateGeminiContentWithDeadline(client, request, timeoutMs = GEMINI_PROVIDER_TIMEOUT_MS, signal = null) {
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
    client.models.generateContent(signal ? { ...request, config: { ...request.config, abortSignal: signal } } : request),
    deadline
  ]).finally(() => clearTimeout(timeoutId));
}

async function generateMarcieAgentText({ model, prompt = "", json = false, thinkingLevel = "MEDIUM" } = {}) {
  const client = createVertexClient({ location: "global" });
  const response = await generateGeminiContentWithDeadline(client, buildVertexGenerateRequest({
    model,
    payload: {
      contents: [{ role: "user", parts: [{ text: String(prompt || "") }] }],
      generationConfig: {
        maxOutputTokens: 32768,
        thinkingConfig: { thinkingLevel },
        ...(json ? { responseMimeType: "application/json" } : {})
      }
    }
  }));
  return String(response?.text || response?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "").trim();
}

registerGeminiJobRoutes(geminiApp);
registerAiJobStatusRoute(geminiApp);
geminiApp.get("/api/gemini/generate", (_req, res) => res.status(405).json({
  error: "method_not_allowed",
  message: "Usa POST /api/gemini/generate con JSON { model, payload }."
}));
// Every PigPen browser text turn is answered by the AI Studio free tier before the paid
// route below can run. Registered with use() rather than post() so that the POST
// handler keeps its exact source text for the timeout and alert-slice tests.
// Authenticated server scope; request-supplied flags cannot grant paid-search access.
geminiApp.use(async (req, res, next) => {
  if (!/^\/api\/(marcie|charly-brown)(?:\/|$)/.test(req.path) || req.method === 'GET') return next();
  try {
    const auth = await resolveAuthContext(req);
    const body = req.body?.method === 'tools/call' ? req.body.params?.arguments || {} : req.body || {};
    const policy = require('./research/budget.js');
    const context = await policy.sessionContext({ db: getAdminServices().db, uid: auth.uid, product: req.path.includes('charly-brown') ? 'charly' : 'marcie', sessionId: body.sessionId, unitId: body.targetUnitId });
    policy.withResearchContext(context, next);
  } catch (error) { next(error); }
});
geminiApp.use(createPigPenTextGateway({
  contentTimeoutMs: PIGPEN_CONTENT_TIMEOUT_MS,
  providerTimeoutMs: GEMINI_PROVIDER_TIMEOUT_MS,
  payloadLimitBytes: GEMINI_PROXY_PAYLOAD_LIMIT_BYTES
}));
geminiApp.post("/api/gemini/generate", asyncRoute(async (req, res) => {
  const authContext = await resolveAuthContext(req);
  const payload = req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : {};
  const serialized = JSON.stringify(payload);
  if (Buffer.byteLength(serialized, "utf8") > GEMINI_PROXY_PAYLOAD_LIMIT_BYTES) {
    throw Object.assign(new Error("gemini_payload_too_large"), { status: 413 });
  }
  // Imagen gratuita: la misma rama que sirve backend/server.js en local. Se resuelve antes
  // del bloque de ahorros porque una imagen de Cloudflare no consume ninguna bolsa de pago.
  // El require vive dentro de la rama porque varios tests de fuente cortan este handler y
  // lo ejecutan en un sandbox sin require; la comparación usa el id literal por lo mismo.
  if (String(req.body?.model || "").trim().replace(/^models\//i, "") === "cloudflare-flux-1-schnell") {
    const cloudflareImages = require("./cloudflare-images.js");
    if (!cloudflareImages.cloudflareImagesEnabled()) {
      return res.status(503).json({
        error: "cloudflare_image_disabled",
        message: "El proveedor gratuito de imágenes (Cloudflare) no está configurado en este servidor.",
        freeImage: true
      });
    }
    const prompt = cloudflareImages.extractCloudflareImagePrompt(payload);
    if (!prompt) {
      return res.status(400).json({ error: "cloudflare_image_prompt_missing", message: "El prompt de imagen llegó vacío.", freeImage: true });
    }
    let inline;
    try {
      inline = await cloudflareImages.generateCloudflareInlineImage(prompt);
    } catch (error) {
      if (Number(error?.status || 502) !== 429) {
        return res.status(502).json({
          error: "cloudflare_image_failed",
          message: "Cloudflare no devolvió una imagen válida.",
          freeImage: true
        });
      }
      res.set("Retry-After", "60");
      return res.status(429).json({
        error: "cloudflare_quota_exhausted",
        message: "La bolsa diaria gratuita de Cloudflare se agotó. Vuelve mañana o cambia el modelo de imagen.",
        retryAfterSeconds: 60,
        freeImage: true
      });
    }
    return res.status(200).json(cloudflareImages.buildGeminiShapeFromCloudflare(inline));
  }
  if (req.body?.generationProfile === "imagecreator") {
    const savings = require("./savings-policy.js");
    const { db } = getAdminServices();
    const policy = await savings.getPolicy(db);
    const kind = String(req.body?.savingsContext?.kind || "");
    const objectId = String(req.body?.savingsContext?.objectId || "");
    if (!Array.isArray(payload?.generationConfig?.responseModalities) || !payload.generationConfig.responseModalities.includes("IMAGE")) {
      throw Object.assign(new Error("savings_image_payload_required"), { status: 400 });
    }
    if (kind === "script") {
      if (policy.level !== "off") await savings.claimScript(db, authContext.uid, objectId);
    } else if (kind === "photo") {
      await savings.claimDaily(db, authContext.uid, "imagePhotos", objectId, policy.level === "off" ? null : 10, { completed: false });
      res.on("finish", () => void (res.statusCode < 300
        ? savings.completeDaily(db, authContext.uid, "imagePhotos", objectId)
        : savings.releaseDaily(db, authContext.uid, "imagePhotos", objectId)).catch((error) => console.error("savings_image_settle_failed", error)));
    } else throw Object.assign(new Error("savings_image_kind_required"), { status: 400 });
  }
  const client = createVertexClient({ location: "global" });
  const requestedModel = String(req.body?.model || "").trim();
  const primaryRequest = buildVertexGenerateRequest({ model: requestedModel, payload });
  let failedModel = primaryRequest.model;
  let response;
  const singleAttempt = req.body?.singleAttempt === true;
  const timeoutMs = singleAttempt && req.body?.generationProfile === "pigpen-fixed-content"
    ? PIGPEN_CONTENT_TIMEOUT_MS : GEMINI_PROVIDER_TIMEOUT_MS;
  const startedAt = Date.now();
  try {
    response = await generateGeminiContentWithDeadline(client, primaryRequest, timeoutMs);
  } catch (error) {
    let providerError = error;
    const providerStatus = Number(error?.status || error?.code || error?.response?.status || 0);
    const remainingMs = timeoutMs - (Date.now() - startedAt) - 1000;
    if (!singleAttempt && providerStatus === 500 && remainingMs > 5000) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      try {
        response = await generateGeminiContentWithDeadline(client, primaryRequest, remainingMs);
        res.set("X-Gemini-Internal-Retry", "recovered");
      } catch (retryError) {
        providerError = retryError;
      }
    }
    if (response) return res.status(200).json(JSON.parse(JSON.stringify(response)));
    if (isVertexInvalidArgument(providerError)) {
      if (!singleAttempt) {
        try {
          response = await generateGeminiContentWithDeadline(client, buildVertexGenerateRequest({
            model: requestedModel,
            payload: buildVertexCompatibilityPayload(payload)
          }));
          res.set("X-Gemini-Compatibility-Retry", "minimal-payload");
        } catch (compatibilityError) {
          providerError = compatibilityError;
        }
      }
    }
    if (response) return res.status(200).json(JSON.parse(JSON.stringify(response)));
    if (String(providerError?.code || providerError?.message || "") === "gemini_upstream_timeout") {
      res.set("Retry-After", "2");
    }
    const status = Number(providerError?.status || providerError?.code || providerError?.response?.status || 0);
    const errorText = String(providerError?.message || providerError?.response?.data || providerError || "");
    const quotaExhausted = status === 429
      || /RESOURCE_EXHAUSTED|resource has been exhausted|quota/i.test(errorText);
    if (!quotaExhausted) {
      let providerBody = providerError?.response?.data;
      if (typeof providerBody === "string") {
        try { providerBody = JSON.parse(providerBody); } catch { providerBody = null; }
      }
      if (!providerBody) {
        try { providerBody = JSON.parse(errorText); } catch { providerBody = null; }
      }
      const providerDetails = providerBody?.error && typeof providerBody.error === "object"
        ? providerBody.error
        : providerBody || {};
      console.warn(JSON.stringify({
        severity: "WARNING",
        event: "gemini_generation_failed",
        service: "gemini-api",
        operation: "generate_content",
        requestId: req.requestId || null,
        model: failedModel,
        status: Number(providerError?.status || providerError?.response?.status || providerDetails.code || status) || 500,
        code: String(providerDetails.status || providerDetails.code || providerError?.code || "provider_error").slice(0, 100),
        message: String(providerDetails.message || providerError?.message || "Gemini provider error").slice(0, 500)
      }));
      throw providerError;
    }
    if (req.body?.singleAttempt !== true && requestedModel === "gemini-3.1-flash-image") {
      try {
        response = await generateGeminiContentWithDeadline(client, buildVertexGenerateRequest({
          model: "gemini-3-pro-image",
          payload
        }));
        res.set("X-Gemini-Model-Fallback", "gemini-3-pro-image");
      } catch (fallbackError) {
        const fallbackStatus = Number(fallbackError?.status || fallbackError?.code || fallbackError?.response?.status || 0);
        const fallbackText = String(fallbackError?.message || fallbackError?.response?.data || fallbackError || "");
        if (fallbackStatus !== 429 && !/RESOURCE_EXHAUSTED|resource has been exhausted|quota/i.test(fallbackText)) throw fallbackError;
        providerError = fallbackError;
        failedModel = buildVertexGenerateRequest({ model: "gemini-3-pro-image", payload }).model;
      }
    }
    if (!response) {
      console.warn(JSON.stringify(vertexFailureDiagnostic(providerError, { model: failedModel, requestId: req.requestId })));
      res.set("Retry-After", "60");
      return res.status(429).json({
        error: "gemini_quota_exhausted",
        message: "Vertex rechazó la solicitud por límite de cuota o capacidad temporal (429). Intenta nuevamente más tarde.",
        retryAfterSeconds: 60,
        requestId: req.requestId || undefined
      });
    }
  }
  return res.status(200).json(JSON.parse(JSON.stringify(response)));
}));
registerSupportGraphicUploadRoute(geminiApp);
registerMarcieWordPressRoutes(geminiApp);
require("./research/routes.js").registerResearchRoutes(geminiApp);
registerMarcieEditorialResearchRoutes(geminiApp);
registerMarcieEditorialAgentRoutes(geminiApp, {
  generateText: generateMarcieAgentText,
  client: createVertexClient({ location: "global" })
});
registerCharlyBrownMcpRoutes(geminiApp, {
  db: getAdminServices().db,
  bucket: getAdminServices().bucket,
  verifyFirebaseBearer: async (req) => {
    const auth = await resolveAuthContext(req);
    return { uid: auth.uid, decoded: auth.token || { role: auth.role } };
  },
  generateContent: async ({ model, contents, config = {} } = {}) => {
    const { systemInstruction, tools, toolConfig, abortSignal, ...generationConfig } = config;
    const client = createVertexClient({ location: "global" });
    return generateGeminiContentWithDeadline(client, buildVertexGenerateRequest({
      model,
      payload: {
        contents,
        ...(systemInstruction ? { systemInstruction } : {}),
        ...(Array.isArray(tools) ? { tools: sanitizeVertexSchema(tools) } : {}),
        ...(toolConfig ? { toolConfig } : {}),
        generationConfig
      }
    }), GEMINI_PROVIDER_TIMEOUT_MS, abortSignal);
  },
  generateText: async ({ model, prompt = "", json = false, thinkingLevel = "MEDIUM" } = {}) => {
    const client = createVertexClient({ location: "global" });
    const response = await generateGeminiContentWithDeadline(client, buildVertexGenerateRequest({
      model,
      payload: {
        contents: [{ role: "user", parts: [{ text: String(prompt || "") }] }],
        generationConfig: {
          maxOutputTokens: 32768,
          thinkingConfig: { thinkingLevel },
          ...(json ? { responseMimeType: "application/json" } : {})
        }
      }
    }));
    return String(response?.text || response?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "").trim();
  }
});
geminiApp.post("/api/gemini/live-token", (_req, res) => {
  return res.status(410).json({ error: "gemini_live_retired" });
});
installErrorHandler(geminiApp, { service: "gemini-api" });

const scienceActivitiesApp = createApp("science-activities-api", {}, { jsonLimit: "30mb" });
registerScienceActivitiesRoutes(scienceActivitiesApp);
const scienceOAuth = require('./science-oauth.js').registerScienceOAuthRoutes(scienceActivitiesApp);
const scienceCoordinator = require('./science-production-routes.js').registerScienceProductionRoutes(scienceActivitiesApp);
require('./science-mcp.js').registerScienceMcpRoutes(scienceActivitiesApp, { coordinator: scienceCoordinator, resolveAuthContext: scienceOAuth.resolveMcpAuth, resourceMetadataUrl: scienceOAuth.resourceMetadataUrl });
require('./science-simulator-candidates.js').registerScienceCandidateRoutes(scienceActivitiesApp);
installErrorHandler(scienceActivitiesApp, { service: "science-activities-api" });

const veoApp = createApp("veo-api");
registerVeoRoutes(veoApp);
installErrorHandler(veoApp, { service: "veo-api" });

const assetApp = createApp("asset-api");
registerAssetRoutes(assetApp);
registerPigPenShareRoutes(assetApp);
const pigpenSheetsAuth = new GoogleAuth({
  scopes: [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/drive.readonly"
  ]
});
registerPigpenSheetsRoutes(assetApp, {
  db: getAdminServices().db,
  verifyFirebaseBearer: async (req) => {
    const context = await resolveAuthContext(req);
    return { uid: context.uid, decoded: context.token || { role: context.role } };
  },
  getAccessToken: async () => {
    const client = await pigpenSheetsAuth.getClient();
    const accessToken = await client.getAccessToken();
    const token = typeof accessToken === "string" ? accessToken : accessToken?.token;
    if (!token) throw Object.assign(new Error("google_sheets_access_token_unavailable"), { status: 502 });
    return token;
  }
});
installErrorHandler(assetApp, { service: "asset-api" });

const analizarPdfApp = createApp("analizar-pdf-api", {
  sessions: true,
  styleMappings: true,
  workerProxy: true,
  provider: "google-cloud"
}, { jsonLimit: "20mb" });
registerAnalizarPdfDataRoutes(analizarPdfApp);
registerAnalizarPdfWorkerProxyRoutes(analizarPdfApp);
installErrorHandler(analizarPdfApp, { service: "analizar-pdf-api" });

exports.podcasterApi = onRequest({
  region: REGION,
  serviceAccount: "charly-functions-core@charly-brown.iam.gserviceaccount.com",
  memory: "1GiB",
  timeoutSeconds: 60,
  minInstances: 0,
  maxInstances: 20,
  concurrency: 40
}, podcasterApp);

exports.geminiApi = onRequest({
  region: REGION,
  serviceAccount: "charly-functions-ai@charly-brown.iam.gserviceaccount.com",
  memory: "1GiB",
  timeoutSeconds: 540,
  minInstances: 0,
  maxInstances: 10,
  concurrency: 10,
  secrets: [MARCIE_WORDPRESS_CONFIG_JSON, GEMINI_FREE_TIER_API_KEY]
}, geminiApp);

exports.scienceActivitiesApi = onRequest({
  region: REGION,
  serviceAccount: "charly-functions-core@charly-brown.iam.gserviceaccount.com",
  memory: "1GiB",
  timeoutSeconds: 120,
  minInstances: 0,
  maxInstances: 10,
  concurrency: 10
}, scienceActivitiesApp);

exports.veoApi = onRequest({
  region: REGION,
  serviceAccount: "charly-functions-ai@charly-brown.iam.gserviceaccount.com",
  memory: "2GiB",
  timeoutSeconds: 60,
  minInstances: 0,
  maxInstances: 4,
  concurrency: 2
}, veoApp);

exports.assetApi = onRequest({
  region: REGION,
  serviceAccount: "charly-functions-core@charly-brown.iam.gserviceaccount.com",
  memory: "512MiB",
  timeoutSeconds: 300,
  minInstances: 0,
  maxInstances: 20,
  concurrency: 20
}, assetApp);

exports.analizarPdfApi = onRequest({
  region: REGION,
  serviceAccount: "charly-functions-core@charly-brown.iam.gserviceaccount.com",
  memory: "1GiB",
  timeoutSeconds: 120,
  minInstances: 0,
  maxInstances: 10,
  concurrency: 20
}, analizarPdfApp);

const montageTaskApp = createApp("montage-dispatch");
montageTaskApp.post("/", asyncRoute(async (req, res) => {
  const taskName = String(req.headers["x-cloudtasks-taskname"] || "").trim();
  if (!taskName && process.env.FUNCTIONS_EMULATOR !== "true") {
    throw Object.assign(new Error("cloud_tasks_request_required"), { status: 403 });
  }
  const jobId = String(req.body?.jobId || "").trim();
  const result = await dispatchMontageToCloudRun({ jobId, taskName });
  return res.status(200).json({ ok: true, ...result });
}));
installErrorHandler(montageTaskApp, { service: "montage-dispatch" });

exports.dispatchMontageTask = onRequest({
  region: REGION,
  serviceAccount: "charly-montage-dispatcher@charly-brown.iam.gserviceaccount.com",
  memory: "512MiB",
  timeoutSeconds: 60,
  minInstances: 0,
  maxInstances: 4,
  concurrency: 4,
  invoker: [TASK_INVOKER_EMAIL]
}, montageTaskApp);

const veoTaskApp = createApp("veo-dispatch");
veoTaskApp.post("/", asyncRoute(async (req, res) => {
  const taskName = String(req.headers["x-cloudtasks-taskname"] || "").trim();
  if (!taskName && process.env.FUNCTIONS_EMULATOR !== "true") {
    throw Object.assign(new Error("cloud_tasks_request_required"), { status: 403 });
  }
  const result = await dispatchAiJob(String(req.body?.jobId || "").trim());
  res.status(200).json({ ok: true, ...result });
}));
installErrorHandler(veoTaskApp, { service: "veo-dispatch" });

exports.dispatchVeoTask = onRequest({
  region: REGION,
  serviceAccount: "charly-functions-ai@charly-brown.iam.gserviceaccount.com",
  memory: "2GiB",
  timeoutSeconds: 1800,
  minInstances: 0,
  maxInstances: 2,
  concurrency: 1,
  invoker: [TASK_INVOKER_EMAIL]
}, veoTaskApp);

const veoPollApp = createApp('veo-operation-poll');
veoPollApp.post('/', asyncRoute(async (req, res) => {
  const jobId = String(req.body?.jobId || '');
  if (!/^[\w-]{1,200}$/.test(jobId)) throw Object.assign(new Error('invalid_job_id'), { status: 400 });
  const snapshot = await getAdminServices().db.collection('podcaster_ai_jobs').doc(jobId).get();
  if (!snapshot.exists || snapshot.data()?.type !== 'dialogue_video') return res.json({ skipped: true });
  const sequence = req.body?.sequence;
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw Object.assign(new Error('invalid_poll_sequence'), { status: 400 });
  const job = snapshot.data();
  if (job.videoPoll?.sequence !== sequence && job.videoPoll?.enqueued === false) {
    await require('./veo-operation-tasks.js').scheduleOperationPoll(job, snapshot.ref, getAdminServices().admin, { releaseLease: false });
  }
  res.json(await dispatchAiJob(jobId, sequence));
}));
installErrorHandler(veoPollApp, { service: 'veo-operation-poll' });
exports.pollVeoOperationTask = onRequest({ region: REGION,
  serviceAccount: 'charly-functions-ai@charly-brown.iam.gserviceaccount.com',
  memory: '512MiB', minInstances: 0, maxInstances: 2, concurrency: 1,
  timeoutSeconds: 60, invoker: [TASK_INVOKER_EMAIL]
}, veoPollApp);

const pendingWorkApp = createApp('pending-work-monitor');
pendingWorkApp.post('/', asyncRoute(async (req,res)=>res.json(await require('./demand-monitors.js').handle(req.body))));
installErrorHandler(pendingWorkApp,{service:'pending-work-monitor'});
exports.checkPendingWorkTask=onRequest({region:REGION,serviceAccount:'charly-functions-core@charly-brown.iam.gserviceaccount.com',memory:'256MiB',timeoutSeconds:120,minInstances:0,maxInstances:2,invoker:[TASK_INVOKER_EMAIL],secrets:[MARCIE_WORDPRESS_CONFIG_JSON]},pendingWorkApp);
const monitorOptions={region:REGION,serviceAccount:'charly-functions-core@charly-brown.iam.gserviceaccount.com',memory:'256MiB',timeoutSeconds:120,minInstances:0,maxInstances:2,retry:true};
const scheduleNewPending=(event,kind,delay)=>['queued','running'].includes(event.data?.data()?.status)?require('./demand-monitors.js').schedule(kind,event.params.id,event.id,Date.now()+delay):undefined;
exports.watchPendingAiJob=onDocumentCreated({...monitorOptions,document:'podcaster_ai_jobs/{id}'},event=>scheduleNewPending(event,'podcaster_ai_jobs',15*60000));
exports.watchPendingExportJob=onDocumentCreated({...monitorOptions,document:'podcaster_export_jobs/{id}'},event=>scheduleNewPending(event,'podcaster_export_jobs',10*60000));
exports.watchEditorialCalendar=onDocumentWritten({...monitorOptions,document:'MarcieEditorialCalendar/{id}'},event=>require('./demand-monitors.js').calendarChanged(event.params.id,event.data.before.data(),event.data.after.data()));
exports.watchEditorialEvidence=onDocumentWritten({...monitorOptions,document:'MarcieBlogEditor/{id}'},event=>require('./demand-monitors.js').sessionChanged(event.params.id,event.data.before.data(),event.data.after.data()));
// Trend discovery is requested by the editor; no hourly work without a user.

// Persistent Marcie workers are separate from the video queues and public API.
const marcieTaskApp = createApp("marcie-production-task");
marcieTaskApp.post("/", asyncRoute(async (req, res) => {
  if (!req.headers["x-cloudtasks-taskname"] && process.env.FUNCTIONS_EMULATOR !== "true") throw Object.assign(new Error("cloud_tasks_request_required"), { status: 403 });
  const { createProductionCoordinator, enabled } = require("./marcie-production-coordinator.js");
  if (!enabled()) return res.status(503).json({ error: "marcie_production_disabled" });
  res.json(await createProductionCoordinator().dispatch(String(req.body?.runId || ""), String(req.body?.taskId || "")));
}));
installErrorHandler(marcieTaskApp, { service: "marcie-production-task" });
exports.dispatchMarcieProductionTask = onRequest({ region: REGION, serviceAccount: "charly-functions-ai@charly-brown.iam.gserviceaccount.com", memory: "1GiB", timeoutSeconds: 300, maxInstances: 10, concurrency: 1, invoker: [TASK_INVOKER_EMAIL] }, marcieTaskApp);

// Science jobs remain durable across browser reloads and run under the AI identity.
const scienceTaskApp = createApp('science-production-task');
scienceTaskApp.post('/', asyncRoute(async (req, res) => {
  if (!req.headers['x-cloudtasks-taskname'] && process.env.FUNCTIONS_EMULATOR !== 'true') throw Object.assign(new Error('cloud_tasks_request_required'), { status: 403 });
  res.json(await require('./science-production-coordinator.js').createScienceProductionCoordinator().dispatch(String(req.body?.runId || ''), String(req.body?.taskId || '')));
}));
installErrorHandler(scienceTaskApp, { service: 'science-production-task' });
exports.dispatchScienceProductionTask = onRequest({ region: REGION, serviceAccount: 'charly-functions-ai@charly-brown.iam.gserviceaccount.com', memory: '1GiB', timeoutSeconds: 300, maxInstances: 10, concurrency: 1, invoker: [TASK_INVOKER_EMAIL] }, scienceTaskApp);

// Charly's durable orchestration uses its own queue and IAM-only worker.
const charlyTaskApp = createApp("charly-production-task");
charlyTaskApp.post("/", asyncRoute(async (req, res) => {
  const { createProduction, enabled } = require("./charly-production.js");
  if (!enabled()) return res.status(503).json({ error: "CHARLY_PRODUCTION_DISABLED" });
  res.json(await createProduction().dispatch(String(req.body?.runId || ""), String(req.body?.taskId || "")));
}));
installErrorHandler(charlyTaskApp, { service: "charly-production-task" });
exports.dispatchCharlyProductionTask = onRequest({ region: REGION, serviceAccount: "charly-functions-ai@charly-brown.iam.gserviceaccount.com", memory: "1GiB", timeoutSeconds: 300, maxInstances: 8, concurrency: 1, invoker: [TASK_INVOKER_EMAIL] }, charlyTaskApp);

// Each production schedules its own private recovery; no global periodic scan.
for (const [name, queue, moduleName, factory] of [
  ['Marcie', 'marcie', 'marcie-production-coordinator', 'createProductionCoordinator'],
  ['Science', 'science', 'science-production-coordinator', 'createScienceProductionCoordinator'],
  ['Charly', 'charly', 'charly-production', 'createProduction']
]) {
  const app = createApp(`${queue}-production-recovery`);
  app.post('/', asyncRoute(async (req, res) => {
    const { runId, epoch, sequence } = req.body || {};
    if (!/^[a-zA-Z0-9_-]{1,200}$/.test(String(runId || '')) || typeof epoch !== 'string' || !Number.isSafeInteger(sequence) || sequence < 1) {
      throw Object.assign(new Error('invalid_recovery_task'), { status: 400 });
    }
    const targetUrl = `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/recover${name}ProductionTask`;
    res.json(await require('./pigpen-demand-recovery.js').recoverRun(
      require(`./${moduleName}.js`)[factory](), { runId, epoch, sequence },
      { queue: require('./tasks.js').QUEUES[queue], targetUrl }));
  }));
  installErrorHandler(app, { service: `${queue}-production-recovery` });
  exports[`recover${name}ProductionTask`] = onRequest({ region: REGION,
    serviceAccount: 'charly-functions-ai@charly-brown.iam.gserviceaccount.com',
    memory: '256MiB', minInstances: 0, maxInstances: 2, concurrency: 4,
    timeoutSeconds: 120, invoker: [TASK_INVOKER_EMAIL]
  }, app);
}
