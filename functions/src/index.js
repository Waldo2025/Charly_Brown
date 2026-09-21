const express = require("express");
const { vertexFailureDiagnostic } = require("./vertex-diagnostics.js");
const { GoogleAuth } = require("google-auth-library");
const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const {
  REGION,
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
const { createLiveTicket } = require("./live-tickets.js");
const { dispatchMontageToCloudRun } = require("./montage-dispatch.js");
const { registerVeoRoutes, registerGeminiJobRoutes, registerAiJobStatusRoute, dispatchAiJob } = require("./ai-jobs.js");
const { monitorStalePodcasterJobs } = require("./stale-job-monitor.js");
const { registerAnalizarPdfDataRoutes } = require("./analizar-pdf-data.js");
const { registerAnalizarPdfWorkerProxyRoutes } = require("./analizar-pdf-worker-proxy.js");
const { registerScienceActivitiesRoutes } = require("./science-activities.js");
const { registerPigPenShareRoutes } = require("./pigpen-share.js");
const { registerPigpenSheetsRoutes } = require("./pigpen-sheets.js");
const { registerMarcieWordPressRoutes } = require("./marcie-wordpress.js");
const { registerMarcieEditorialResearchRoutes } = require("./marcie-editorial-research.js");
const { monitorMarcieEditorialCalendar } = require("./marcie-editorial-monitor.js");
const { refreshMarcieTrendsIfDue } = require("./marcie-trend-refresh.js");

const TASK_INVOKER_EMAIL = "charly-tasks-invoker@charly-brown.iam.gserviceaccount.com";
const MARCIE_WORDPRESS_CONFIG_JSON = defineSecret("MARCIE_WORDPRESS_CONFIG_JSON");

function createApp(service, health = {}, options = {}) {
  const app = express();
  installCommonMiddleware(app, { service });
  app.use(express.json({ limit: options.jsonLimit || "1mb" }));
  app.get("/api/health", (_req, res) => res.status(200).json({ ok: true, service, provider: "google-cloud", ...health }));
  return app;
}

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
  geminiLiveProxy: true,
  providerAuth: "adc"
}, { jsonLimit: GEMINI_PROXY_JSON_LIMIT });
// Standard requests retain their existing deadline. Fixed PigPen content uses
// one sequential call for an entire room; leave 60 s inside the 540 s function
// budget to serialize the result. This profile never enables extra attempts.
const GEMINI_PROVIDER_TIMEOUT_MS = 105_000;
const PIGPEN_CONTENT_TIMEOUT_MS = 480_000;

function generateGeminiContentWithDeadline(client, request, timeoutMs = GEMINI_PROVIDER_TIMEOUT_MS) {
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
    client.models.generateContent(request),
    deadline
  ]).finally(() => clearTimeout(timeoutId));
}

registerGeminiJobRoutes(geminiApp);
geminiApp.get("/api/gemini/generate", (_req, res) => res.status(405).json({
  error: "method_not_allowed",
  message: "Usa POST /api/gemini/generate con JSON { model, payload }."
}));
geminiApp.post("/api/gemini/generate", asyncRoute(async (req, res) => {
  await resolveAuthContext(req);
  const payload = req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : {};
  const serialized = JSON.stringify(payload);
  if (Buffer.byteLength(serialized, "utf8") > GEMINI_PROXY_PAYLOAD_LIMIT_BYTES) {
    throw Object.assign(new Error("gemini_payload_too_large"), { status: 413 });
  }
  const client = createVertexClient({ location: "global" });
  const requestedModel = String(req.body?.model || "").trim();
  const primaryRequest = buildVertexGenerateRequest({ model: requestedModel, payload });
  let failedModel = primaryRequest.model;
  let response;
  try {
    const timeoutMs = req.body?.singleAttempt === true && req.body?.generationProfile === "pigpen-fixed-content"
      ? PIGPEN_CONTENT_TIMEOUT_MS : GEMINI_PROVIDER_TIMEOUT_MS;
    response = await generateGeminiContentWithDeadline(client, primaryRequest, timeoutMs);
  } catch (error) {
    let providerError = error;
    if (isVertexInvalidArgument(error)) {
      if (req.body?.singleAttempt !== true) {
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
    if (!quotaExhausted) throw providerError;
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
registerMarcieEditorialResearchRoutes(geminiApp);
registerCharlyBrownMcpRoutes(geminiApp, {
  db: getAdminServices().db,
  verifyFirebaseBearer: async (req) => {
    const auth = await resolveAuthContext(req);
    return { uid: auth.uid, decoded: auth.token || { role: auth.role } };
  },
  generateContent: async ({ model, contents, config = {} } = {}) => {
    const { systemInstruction, tools, toolConfig, ...generationConfig } = config;
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
    }));
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
geminiApp.post("/api/gemini/live-token", asyncRoute(async (req, res) => {
  return res.status(201).json(await createLiveTicket(req));
}));
installErrorHandler(geminiApp, { service: "gemini-api" });

const scienceActivitiesApp = createApp("science-activities-api", {}, { jsonLimit: "30mb" });
registerScienceActivitiesRoutes(scienceActivitiesApp);
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
  minInstances: 1,
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
  secrets: [MARCIE_WORDPRESS_CONFIG_JSON]
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

exports.monitorStalePodcasterJobs = onSchedule({
  schedule: "every 5 minutes",
  region: REGION,
  serviceAccount: "charly-functions-core@charly-brown.iam.gserviceaccount.com",
  memory: "256MiB",
  timeoutSeconds: 60,
  retryCount: 0
}, async () => monitorStalePodcasterJobs());

exports.monitorMarcieEditorialCalendar = onSchedule({
  schedule: "every 5 minutes",
  region: REGION,
  serviceAccount: "charly-functions-core@charly-brown.iam.gserviceaccount.com",
  memory: "256MiB",
  timeoutSeconds: 120,
  retryCount: 0,
  secrets: [MARCIE_WORDPRESS_CONFIG_JSON]
}, async () => monitorMarcieEditorialCalendar());

exports.refreshMarcieEditorialTrends = onSchedule({
  schedule: "every 60 minutes",
  region: REGION,
  serviceAccount: "charly-functions-ai@charly-brown.iam.gserviceaccount.com",
  memory: "256MiB",
  timeoutSeconds: 120,
  retryCount: 1
}, async () => refreshMarcieTrendsIfDue());
