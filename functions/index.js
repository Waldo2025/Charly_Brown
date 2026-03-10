const {onCall, onRequest, HttpsError} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const ALLOWED_ROLES = new Set(["admin", "superAdmin"]);
const MAX_COLLECTIONS = 25;
const MAX_DOCS_PER_COLLECTION = 60;
const PROJECT_ID = String(process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "charly-brown").trim();
const DEFAULT_LOCAL_ORIGINS = [
  "http://127.0.0.1:5502",
  "http://localhost:5502",
  "http://127.0.0.1:3000",
  "http://localhost:3000",
];
const DEFAULT_PROD_ORIGINS = [
  `https://${PROJECT_ID}.web.app`,
  `https://${PROJECT_ID}.firebaseapp.com`,
];
const MAX_GEMINI_PAYLOAD_BYTES = 120 * 1024;
const MAX_TEXT_LENGTH = 4000;
const MAX_SYSTEM_INSTRUCTION_LENGTH = 6000;
const MAX_MODEL_LENGTH = 120;

function toCleanOrigin(origin = "") {
  return String(origin || "").trim().replace(/\/+$/, "");
}

function parseCsvList(input = "") {
  return String(input || "")
      .split(",")
      .map((item) => toCleanOrigin(item))
      .filter(Boolean);
}

function buildCorsAllowList() {
  const configured = parseCsvList(process.env.CORS_ALLOWED_ORIGINS || "");
  return new Set([
    ...DEFAULT_LOCAL_ORIGINS,
    ...DEFAULT_PROD_ORIGINS,
    ...configured,
  ].map((origin) => toCleanOrigin(origin)));
}

const CORS_ALLOWED_ORIGINS = buildCorsAllowList();

function isAllowedPreviewOrigin(origin = "") {
  const normalized = toCleanOrigin(origin);
  if (!normalized) return false;
  let host = "";
  try {
    host = String(new URL(normalized).hostname || "").toLowerCase();
  } catch (_) {
    return false;
  }
  const escapedProject = PROJECT_ID.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const previewPatterns = [
    new RegExp(`^[a-z0-9-]+--${escapedProject}\\.web\\.app$`, "i"),
    new RegExp(`^${escapedProject}--[a-z0-9-]+\\.web\\.app$`, "i"),
  ];
  return previewPatterns.some((rx) => rx.test(host));
}

function isCorsOriginAllowed(origin = "") {
  const normalized = toCleanOrigin(origin);
  if (!normalized) return false;
  if (CORS_ALLOWED_ORIGINS.has(normalized)) return true;
  return isAllowedPreviewOrigin(normalized);
}

function applyCors(req, res) {
  const origin = toCleanOrigin(req.headers.origin || "");
  if (isCorsOriginAllowed(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
  }
  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.set("Access-Control-Max-Age", "3600");
}

function normalizePath(path = "") {
  return `/${String(path || "").replace(/^\/+/, "")}`;
}

function toHttpStatus(err) {
  const code = Number(err?.httpErrorCode?.status || 500);
  if (Number.isFinite(code) && code >= 100 && code <= 599) return code;
  return 500;
}

async function getUserRoleFromFirestore(uid) {
  if (!uid) return "";
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) return "";
  const data = snap.data() || {};
  return String(data.role || "").trim();
}

async function ensurePrivilegedUser(context) {
  const uid = context?.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión para usar este endpoint.");
  }

  const tokenRole = String(context?.auth?.token?.role || "").trim();
  const dbRole = await getUserRoleFromFirestore(uid);
  const role = tokenRole || dbRole;

  if (!ALLOWED_ROLES.has(role)) {
    throw new HttpsError(
        "permission-denied",
        "No tienes permisos para consultar datos globales con Charly.",
    );
  }

  return {uid, role};
}

async function verifyFirebaseBearer(req) {
  const authHeader = String(req.headers.authorization || "");
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    throw new HttpsError("unauthenticated", "Falta token de autenticación.");
  }

  let decoded = null;
  try {
    decoded = await admin.auth().verifyIdToken(token);
  } catch (_) {
    throw new HttpsError("unauthenticated", "Token inválido.");
  }

  const uid = String(decoded?.uid || "").trim();
  if (!uid) {
    throw new HttpsError("unauthenticated", "Token sin UID.");
  }

  return {uid, decoded};
}

async function ensurePrivilegedHttp(req) {
  const {uid, decoded} = await verifyFirebaseBearer(req);

  const tokenRole = String(decoded?.role || "").trim();
  const dbRole = await getUserRoleFromFirestore(uid);
  const role = tokenRole || dbRole;
  if (!ALLOWED_ROLES.has(role)) {
    throw new HttpsError(
        "permission-denied",
        "No tienes permisos para consultar datos globales con Charly.",
    );
  }
  return {uid, role};
}

async function readCollectionsPayload(data = {}) {
  const incomingCollections = Array.isArray(data?.collections) ? data.collections : [];
  const requestedLimit = Number(data?.limitPerCollection || 20);
  const limitPerCollection = Math.max(1, Math.min(MAX_DOCS_PER_COLLECTION, requestedLimit));

  let targetCollections = incomingCollections
      .map((name) => String(name || "").trim())
      .filter(Boolean)
      .slice(0, MAX_COLLECTIONS);

  if (!targetCollections.length) {
    const listed = await db.listCollections();
    targetCollections = listed
        .map((c) => String(c.id || "").trim())
        .filter(Boolean)
        .slice(0, MAX_COLLECTIONS);
  }

  const out = {};

  await Promise.all(targetCollections.map(async (collectionName) => {
    try {
      const snap = await db.collection(collectionName).limit(limitPerCollection).get();
      out[collectionName] = snap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
    } catch (error) {
      out[collectionName] = {
        error: error?.message || "No se pudo leer la colección",
      };
    }
  }));

  return {
    collections: out,
    meta: {
      totalCollections: targetCollections.length,
      limitPerCollection,
      readAt: new Date().toISOString(),
    },
  };
}

function mustEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new HttpsError("failed-precondition", `Falta variable de entorno: ${name}`);
  }
  return value;
}

function asJson(value) {
  try {
    return JSON.stringify(value);
  } catch (_) {
    return "{}";
  }
}

function sanitizeModel(model = "") {
  return String(model || "")
      .replace(/^models\//i, "")
      .replace(/:generateContent$/i, "")
      .replace(/:streamGenerateContent$/i, "")
      .trim();
}

function isAllowedGeminiModel(model = "") {
  const clean = sanitizeModel(model);
  if (!clean || clean.length > MAX_MODEL_LENGTH) return false;
  return /^gemini-[a-z0-9.-]+$/i.test(clean);
}

function safeErrorBody(status = 500, err = null) {
  const statusCode = Number(status || 500);
  if (statusCode >= 500) {
    return {error: "Error interno del servidor."};
  }
  const message = String(err?.message || "").trim();
  if (!message) return {error: "Solicitud inválida."};
  return {error: message.slice(0, 220)};
}

function validateGeminiPayload(model = "", payload = null) {
  if (!isAllowedGeminiModel(model)) {
    throw new HttpsError("invalid-argument", "Modelo Gemini inválido.");
  }
  if (!payload || typeof payload !== "object") {
    throw new HttpsError("invalid-argument", "Payload inválido.");
  }
  if (!Array.isArray(payload.contents) || payload.contents.length === 0) {
    throw new HttpsError("invalid-argument", "Payload inválido: contents es obligatorio.");
  }
  if (payload.systemInstruction) {
    const rawInstruction = typeof payload.systemInstruction === "string" ?
      payload.systemInstruction :
      payload?.systemInstruction?.parts?.map((p) => p?.text || "").join(" ");
    if (String(rawInstruction || "").length > MAX_SYSTEM_INSTRUCTION_LENGTH) {
      throw new HttpsError("invalid-argument", "systemInstruction excede el límite permitido.");
    }
  }
  const serialized = asJson(payload);
  if (Buffer.byteLength(serialized, "utf8") > MAX_GEMINI_PAYLOAD_BYTES) {
    throw new HttpsError("invalid-argument", "Payload demasiado grande.");
  }
}

async function forwardGeminiGenerate(req, res) {
  await verifyFirebaseBearer(req);
  const key = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
  if (!key) {
    return res.status(500).json({error: "Configuración incompleta en backend."});
  }
  const body = req.body || {};
  const model = sanitizeModel(body?.model || "gemini-2.5-flash");
  const payload = body?.payload && typeof body.payload === "object" ? body.payload : null;

  const outPayload = payload || {
    contents: Array.isArray(body?.contents) ? body.contents : [],
    ...(body?.generationConfig && typeof body.generationConfig === "object" ? {generationConfig: body.generationConfig} : {}),
    ...(Array.isArray(body?.safetySettings) ? {safetySettings: body.safetySettings} : {}),
    ...(Array.isArray(body?.tools) ? {tools: body.tools} : {}),
    ...(body?.systemInstruction ? {systemInstruction: body.systemInstruction} : {}),
  };

  validateGeminiPayload(model, outPayload);

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const bodyJson = asJson(outPayload);

  const upstream = await fetch(endpoint, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: bodyJson,
  });

  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const detail = String(data?.error?.message || data?.error || "").slice(0, 220);
    return res.status(upstream.status >= 500 ? 502 : upstream.status).json({
      error: detail || "No se pudo generar contenido con Gemini.",
    });
  }
  return res.status(200).json(data);
}

async function forwardGeminiModels(req, res) {
  await verifyFirebaseBearer(req);
  const key = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
  if (!key) {
    return res.status(500).json({error: "Falta GEMINI_API_KEY o GOOGLE_API_KEY."});
  }
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`;
  const upstream = await fetch(endpoint, {method: "GET"});
  const data = await upstream.json().catch(() => ({}));
  res.status(upstream.status).json(data);
}

async function forwardGeminiLiveToken(req, res) {
  await verifyFirebaseBearer(req);
  const key = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
  if (!key) {
    return res.status(500).json({error: "Configuración incompleta en backend."});
  }

  const modelInput = sanitizeModel(String(req.body?.model || "gemini-2.5-flash-native-audio-preview-12-2025").trim());
  if (!isAllowedGeminiModel(modelInput)) {
    return res.status(400).json({error: "Modelo Gemini inválido para Live."});
  }
  const model = `models/${modelInput}`;
  const systemInstruction = String(
      req.body?.systemInstruction || "Eres un asistente pedagógico útil y amable.",
  ).trim();
  if (systemInstruction.length > MAX_SYSTEM_INSTRUCTION_LENGTH) {
    return res.status(400).json({error: "systemInstruction excede el límite permitido."});
  }

  const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const newSessionExpireTime = new Date(Date.now() + 60 * 1000).toISOString();

  const payload = {
    authToken: {
      uses: 1,
      expireTime,
      newSessionExpireTime,
      bidiGenerateContentSetup: {
        model,
        generationConfig: {
          responseModalities: ["AUDIO"],
        },
        systemInstruction: {
          parts: [{text: systemInstruction}],
        },
      },
    },
  };

  const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/authTokens?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload),
  });
  const data = await upstream.json().catch(() => ({}));

  if (!upstream.ok) {
    return res.status(upstream.status).json({error: data?.error?.message || "No se pudo crear token efímero."});
  }

  return res.status(200).json({
    token: data?.name || "",
    model,
    expireTime: data?.expireTime || expireTime,
    newSessionExpireTime: data?.newSessionExpireTime || newSessionExpireTime,
  });
}

async function forwardHfTts(req, res) {
  await verifyFirebaseBearer(req);
  const key = mustEnv("HF_API_KEY");
  const text = String(req.body?.text || "").trim();
  const model = String(req.body?.model || "facebook/fastspeech2-en-ljspeech").trim();
  const parameters = req.body?.parameters && typeof req.body.parameters === "object" ? req.body.parameters : {};

  if (!text || text.length > MAX_TEXT_LENGTH) {
    return res.status(400).json({error: "Texto inválido para TTS."});
  }

  const endpoint = `https://api-inference.huggingface.co/models/${encodeURIComponent(model)}`;
  const upstream = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({inputs: text, parameters}),
  });

  const ab = await upstream.arrayBuffer();
  const mimeType = String(upstream.headers.get("content-type") || "audio/wav");
  if (!upstream.ok) {
    const errText = Buffer.from(ab).toString("utf8").slice(0, 500);
    return res.status(upstream.status).json({error: errText || "HF TTS error"});
  }

  return res.status(200).json({
    mimeType,
    audioBase64: Buffer.from(ab).toString("base64"),
  });
}

async function forwardHfImage(req, res) {
  await verifyFirebaseBearer(req);
  const key = mustEnv("HF_API_KEY");
  const prompt = String(req.body?.prompt || "").trim();
  const model = String(req.body?.model || "stabilityai/stable-diffusion-3.5-large").trim();

  if (!prompt || prompt.length > MAX_TEXT_LENGTH) {
    return res.status(400).json({error: "Prompt inválido."});
  }

  const endpoint = `https://api-inference.huggingface.co/models/${encodeURIComponent(model)}`;
  const upstream = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({inputs: prompt}),
  });

  const ab = await upstream.arrayBuffer();
  const mimeType = String(upstream.headers.get("content-type") || "image/png");
  if (!upstream.ok) {
    const errText = Buffer.from(ab).toString("utf8").slice(0, 500);
    return res.status(upstream.status).json({error: errText || "HF Image error"});
  }

  return res.status(200).json({
    mimeType,
    imageBase64: Buffer.from(ab).toString("base64"),
  });
}

async function forwardOpenAiImage(req, res) {
  await verifyFirebaseBearer(req);
  const key = mustEnv("OPENAI_API_KEY");
  const prompt = String(req.body?.prompt || "").trim();
  const model = String(req.body?.model || "gpt-image-1").trim();
  const size = String(req.body?.size || "1024x1024").trim();

  if (!prompt || prompt.length > MAX_TEXT_LENGTH) {
    return res.status(400).json({error: "Prompt inválido."});
  }

  const upstream = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({model, prompt, size}),
  });
  const data = await upstream.json().catch(() => ({}));
  res.status(upstream.status).json(data);
}

async function routeApi(req, res) {
  const path = normalizePath(req.path || req.url || "");

  if (req.method === "POST" && path === "/api/gemini/generate") {
    return forwardGeminiGenerate(req, res);
  }
  if (req.method === "GET" && path === "/api/gemini/models") {
    return forwardGeminiModels(req, res);
  }
  if (req.method === "POST" && path === "/api/gemini/live-token") {
    return forwardGeminiLiveToken(req, res);
  }
  if (req.method === "POST" && path === "/api/hf/tts") {
    return forwardHfTts(req, res);
  }
  if (req.method === "POST" && path === "/api/hf/image") {
    return forwardHfImage(req, res);
  }
  if (req.method === "POST" && path === "/api/openai/image") {
    return forwardOpenAiImage(req, res);
  }

  return res.status(404).json({error: "Ruta API no encontrada."});
}

exports.api = onRequest(async (req, res) => {
  applyCors(req, res);
  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  try {
    return await routeApi(req, res);
  } catch (err) {
    const status = toHttpStatus(err);
    return res.status(status).json(safeErrorBody(status, err));
  }
});

exports.generarImagen = onCall(async (request) => {
  const prompt = String(request?.data?.prompt || request?.prompt || "").trim();
  const apiKey = mustEnv("OPENAI_API_KEY");

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024",
      n: 1,
    }),
  });

  const dataResponse = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMessage = (dataResponse && dataResponse.error && dataResponse.error.message) ||
      "Error generando imagen";
    throw new HttpsError("internal", errorMessage);
  }

  return {imageUrl: dataResponse?.data?.[0]?.url || ""};
});

exports.charlyReadData = onCall(async (request) => {
  await ensurePrivilegedUser(request);
  return readCollectionsPayload(request?.data || {});
});

exports.charlyReadDataHttp = onRequest(async (req, res) => {
  applyCors(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({error: "Método no permitido"});
    return;
  }
  try {
    await ensurePrivilegedHttp(req);
    const payload = await readCollectionsPayload(req.body || {});
    res.status(200).json(payload);
  } catch (err) {
    const code = toHttpStatus(err);
    res.status(code).json({error: err?.message || "Error interno"});
  }
});
