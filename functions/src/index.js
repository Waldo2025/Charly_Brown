const express = require("express");
const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const {
  REGION,
  resolveAuthContext,
  asyncRoute,
  installCommonMiddleware,
  installErrorHandler
} = require("./common.js");
const {
  createVertexClient,
  buildVertexGenerateRequest
} = require("./vertex.js");
const { registerUploadRoutes } = require("./uploads.js");
const { registerAssetRoutes } = require("./assets.js");
const { registerPodcasterDataRoutes } = require("./podcaster-data.js");
const { registerMontageRoutes } = require("./montage-routes.js");
const { createLiveTicket } = require("./live-tickets.js");
const { dispatchMontageToCloudRun } = require("./montage-dispatch.js");
const { registerVeoRoutes, registerGeminiJobRoutes, registerAiJobStatusRoute, dispatchAiJob } = require("./ai-jobs.js");
const { monitorStalePodcasterJobs } = require("./stale-job-monitor.js");

function createApp(service, health = {}) {
  const app = express();
  installCommonMiddleware(app, { service });
  app.use(express.json({ limit: "1mb" }));
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

const geminiApp = createApp("gemini-api", {
  podcasterDialogueAudioRoute: true,
  geminiLiveProxy: true,
  providerAuth: "adc"
});
registerGeminiJobRoutes(geminiApp);
geminiApp.get("/api/gemini/generate", (_req, res) => res.status(405).json({
  error: "method_not_allowed",
  message: "Usa POST /api/gemini/generate con JSON { model, payload }."
}));
geminiApp.post("/api/gemini/generate", asyncRoute(async (req, res) => {
  await resolveAuthContext(req);
  const payload = req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : {};
  const serialized = JSON.stringify(payload);
  if (Buffer.byteLength(serialized, "utf8") > 120 * 1024) {
    throw Object.assign(new Error("gemini_payload_too_large"), { status: 413 });
  }
  const client = createVertexClient({ location: "global" });
  const response = await client.models.generateContent(buildVertexGenerateRequest({
    model: req.body?.model,
    payload
  }));
  return res.status(200).json(JSON.parse(JSON.stringify(response)));
}));
geminiApp.post("/api/gemini/live-token", asyncRoute(async (req, res) => {
  return res.status(201).json(await createLiveTicket(req));
}));
installErrorHandler(geminiApp, { service: "gemini-api" });

const veoApp = createApp("veo-api");
registerVeoRoutes(veoApp);
installErrorHandler(veoApp, { service: "veo-api" });

const assetApp = createApp("asset-api");
registerAssetRoutes(assetApp);
installErrorHandler(assetApp, { service: "asset-api" });

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
  timeoutSeconds: 60,
  minInstances: 0,
  maxInstances: 10,
  concurrency: 10
}, geminiApp);

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
  timeoutSeconds: 30,
  minInstances: 0,
  maxInstances: 20,
  concurrency: 80
}, assetApp);

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
  invoker: "private"
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
  invoker: "private"
}, veoTaskApp);

exports.monitorStalePodcasterJobs = onSchedule({
  schedule: "every 5 minutes",
  region: REGION,
  serviceAccount: "charly-functions-core@charly-brown.iam.gserviceaccount.com",
  memory: "256MiB",
  timeoutSeconds: 60,
  retryCount: 0
}, async () => monitorStalePodcasterJobs());
