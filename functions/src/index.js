const express = require("express");
const { onRequest } = require("firebase-functions/v2/https");
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

function createApp(service) {
  const app = express();
  installCommonMiddleware(app, { service });
  app.use(express.json({ limit: "1mb" }));
  app.get("/api/health", (_req, res) => res.status(200).json({ ok: true, service, provider: "google-cloud" }));
  return app;
}

const podcasterApp = createApp("podcaster-api");
registerUploadRoutes(podcasterApp);
installErrorHandler(podcasterApp, { service: "podcaster-api" });

const geminiApp = createApp("gemini-api");
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
installErrorHandler(geminiApp, { service: "gemini-api" });

const veoApp = createApp("veo-api");
installErrorHandler(veoApp, { service: "veo-api" });

const assetApp = createApp("asset-api");
registerAssetRoutes(assetApp);
installErrorHandler(assetApp, { service: "asset-api" });

exports.podcasterApi = onRequest({
  region: REGION,
  memory: "1GiB",
  timeoutSeconds: 60,
  minInstances: 1,
  maxInstances: 20,
  concurrency: 40
}, podcasterApp);

exports.geminiApi = onRequest({
  region: REGION,
  memory: "1GiB",
  timeoutSeconds: 60,
  minInstances: 0,
  maxInstances: 10,
  concurrency: 10
}, geminiApp);

exports.veoApi = onRequest({
  region: REGION,
  memory: "2GiB",
  timeoutSeconds: 60,
  minInstances: 0,
  maxInstances: 4,
  concurrency: 2
}, veoApp);

exports.assetApi = onRequest({
  region: REGION,
  memory: "512MiB",
  timeoutSeconds: 30,
  minInstances: 0,
  maxInstances: 20,
  concurrency: 80
}, assetApp);
