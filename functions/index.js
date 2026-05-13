const {onCall, onRequest, HttpsError} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const {GoogleGenAI} = require("@google/genai");
const {randomUUID} = require("node:crypto");
const lamejs = require("lamejs");
const {
  buildDialogueVideoPromptBundle,
} = require("./dialogue-video-prompt.js");

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
const MAX_PODCASTER_SESSION_BYTES = 900 * 1024;
const MAX_SPEAKER_PORTRAIT_BYTES = 10 * 1024 * 1024;
const MAX_PODCASTER_MUSIC_BYTES = 12 * 1024 * 1024;
const MAX_DIALOGUE_VIDEO_BYTES = 80 * 1024 * 1024;
const MAX_DIALOGUE_AUDIO_BYTES = 24 * 1024 * 1024;
const DEFAULT_PODCASTER_IMAGE_MODEL = "gemini-2.5-flash-image";
const DEFAULT_PODCASTER_VIDEO_MODEL = "veo-3.1-generate-preview";
const PODCASTER_IMAGE_MODEL_CANDIDATES = [
  "gemini-3.1-flash-image-preview",
  "gemini-3-pro-image-preview",
  "gemini-2.5-flash-image",
  "gemini-2.0-flash-preview-image-generation",
];
const PODCASTER_VIDEO_MODEL_CANDIDATES = [
  "veo-3.1-generate-preview",
  "veo-3.1-fast-generate-preview",
];
const MAX_TEXT_LENGTH = 4000;
const MAX_SYSTEM_INSTRUCTION_LENGTH = 6000;
const MAX_MODEL_LENGTH = 120;
const GEMINI_LIVE_ALLOWED_VOICE_NAMES = new Set([
  "Zephyr", "Kore", "Orus", "Autonoe", "Umbriel", "Erinome",
  "Laomedeia", "Schedar", "Achird", "Sadachbia", "Puck", "Fenrir",
  "Aoede", "Enceladus", "Algieba", "Algenib", "Achernar", "Gacrux",
  "Zubenelgenubi", "Sadaltager", "Charon", "Leda", "Callirrhoe",
  "Iapetus", "Despina", "Rasalgethi", "Alnilam", "Pulcherrima",
  "Vindemiatrix", "Sulafat",
]);
const SCREENSHOT_MAX_BYTES = 6 * 1024 * 1024;
const SCREENSHOT_PERSONAL_LIMIT = 24;
const SCREENSHOT_SHARED_LIMIT = 48;
const ACTIVE_PLAYER_WINDOW_MS = 45 * 1000;
const fetchCompat = (...args) => {
  if (typeof fetch === "function") return fetch(...args);
  return import("node-fetch").then(({ default: f }) => f(...args));
};
const RATE_LIMIT_COLLECTION = "_security_api_rate_limits";
const IS_FUNCTIONS_EMULATOR = String(process.env.FUNCTIONS_EMULATOR || "").trim() === "true";
const APP_CHECK_ENFORCEMENT = String(
    process.env.APP_CHECK_ENFORCEMENT || (IS_FUNCTIONS_EMULATOR ? "monitor" : "enforce"),
).trim().toLowerCase();
const APP_CHECK_REQUIRED = APP_CHECK_ENFORCEMENT === "enforce";
const APP_CHECK_VERIFY_IF_PRESENT = APP_CHECK_REQUIRED || APP_CHECK_ENFORCEMENT === "monitor";
const ROUTE_RATE_LIMITS = new Map([
  ["/api/gemini/generate", {limit: 24, windowMs: 60 * 1000}],
  ["/api/gemini/models", {limit: 30, windowMs: 60 * 1000}],
  ["/api/gemini/live-token", {limit: 8, windowMs: 60 * 1000}],
  ["/api/moodle/module-graphics/generate", {limit: 12, windowMs: 60 * 1000}],
  ["/api/moodle/module-graphics/generate-element", {limit: 20, windowMs: 60 * 1000}],
  ["/api/moodle/module-graphics/analyze-element", {limit: 28, windowMs: 60 * 1000}],
  ["/api/podcaster/sessions/save", {limit: 30, windowMs: 60 * 1000}],
  ["/api/podcaster/sessions/share", {limit: 20, windowMs: 60 * 1000}],
  ["/api/podcaster/sessions/list", {limit: 30, windowMs: 60 * 1000}],
  ["/api/podcaster/scene-library/list", {limit: 30, windowMs: 60 * 1000}],
  ["/api/podcaster/scene-library/publish", {limit: 20, windowMs: 60 * 1000}],
  ["/api/podcaster/scene-library/upload-local", {limit: 20, windowMs: 60 * 1000}],
  ["/api/moodle/share-users", {limit: 20, windowMs: 60 * 1000}],
  ["/api/podcaster/speaker-portraits/generate", {limit: 20, windowMs: 60 * 1000}],
  ["/api/podcaster/scenario-images/generate", {limit: 20, windowMs: 60 * 1000}],
  ["/api/podcaster/dialogue-videos/generate", {limit: 8, windowMs: 10 * 60 * 1000}],
  ["/api/podcaster/dialogue-audio/generate", {limit: 20, windowMs: 10 * 60 * 1000}],
  ["/api/podcaster/music/upload", {limit: 12, windowMs: 60 * 1000}],
  ["/api/gemini/lyria/generate", {limit: 4, windowMs: 10 * 60 * 1000}],
  ["/api/hf/tts", {limit: 12, windowMs: 60 * 1000}],
  ["/api/hf/image", {limit: 10, windowMs: 60 * 1000}],
  ["/api/openai/image", {limit: 8, windowMs: 60 * 1000}],
]);
const PROTECTED_API_PATHS = new Set(ROUTE_RATE_LIMITS.keys());

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

function isAllowedLocalDevOrigin(origin = "") {
  const normalized = toCleanOrigin(origin);
  if (!normalized) return false;
  let parsed = null;
  try {
    parsed = new URL(normalized);
  } catch (_) {
    return false;
  }
  const protocol = String(parsed.protocol || "").toLowerCase();
  const host = String(parsed.hostname || "").toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") return false;
  return host === "localhost" || host === "127.0.0.1";
}

function isCorsOriginAllowed(origin = "") {
  const normalized = toCleanOrigin(origin);
  if (!normalized) return false;
  if (CORS_ALLOWED_ORIGINS.has(normalized)) return true;
  if (isAllowedLocalDevOrigin(normalized)) return true;
  return isAllowedPreviewOrigin(normalized);
}

function applyCors(req, res) {
  const origin = toCleanOrigin(req.headers.origin || "");
  if (isCorsOriginAllowed(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
  }
  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Firebase-AppCheck");
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

function getClientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || String(req.ip || req.socket?.remoteAddress || "unknown").trim() || "unknown";
}

async function verifyAppCheckForRequest(req) {
  const rawToken = req.headers["x-firebase-appcheck"];
  const token = Array.isArray(rawToken) ? String(rawToken[0] || "").trim() : String(rawToken || "").trim();
  if (!token) {
    if (APP_CHECK_REQUIRED) {
      throw new HttpsError("failed-precondition", "Falta App Check.");
    }
    return {token: "", decoded: null, enforced: APP_CHECK_REQUIRED};
  }

  try {
    const decoded = await admin.appCheck().verifyToken(token);
    return {token, decoded, enforced: APP_CHECK_REQUIRED};
  } catch (_) {
    throw new HttpsError("permission-denied", "App Check inválido.");
  }
}

function getRouteRateLimit(path = "") {
  return ROUTE_RATE_LIMITS.get(normalizePath(path)) || null;
}

function buildRateLimitKey({path = "", uid = "", ip = "", windowMs = 60 * 1000, now = Date.now()}) {
  const bucket = Math.floor(now / Math.max(1000, windowMs));
  return [normalizePath(path), String(uid || "anon"), String(ip || "unknown"), String(bucket)].join(":");
}

async function enforceRouteRateLimit({path = "", uid = "", ip = ""}) {
  const config = getRouteRateLimit(path);
  if (!config) return null;
  const now = Date.now();
  const key = buildRateLimitKey({path, uid, ip, windowMs: config.windowMs, now});
  const ref = db.collection(RATE_LIMIT_COLLECTION).doc(key);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const currentCount = Number(snap.get("count") || 0);
    if (currentCount >= config.limit) {
      throw new HttpsError("resource-exhausted", "Demasiadas solicitudes. Intenta de nuevo en un momento.");
    }
    tx.set(ref, {
      path: normalizePath(path),
      uid: String(uid || ""),
      ip: String(ip || ""),
      count: currentCount + 1,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromMillis(now + config.windowMs),
    }, {merge: true});
  });

  return config;
}

async function enforceApiRequestSecurity(req, path = "") {
  const authContext = await verifyFirebaseBearer(req);
  const appCheck = APP_CHECK_VERIFY_IF_PRESENT ? await verifyAppCheckForRequest(req) : {token: "", decoded: null, enforced: false};
  const ip = getClientIp(req);
  await enforceRouteRateLimit({path, uid: authContext.uid, ip});
  return {
    uid: authContext.uid,
    decoded: authContext.decoded,
    appCheck,
    ip,
  };
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

function normalizeLiveVoiceName(input = "") {
  const raw = String(input || "").trim();
  if (!raw) return "";
  for (const candidate of GEMINI_LIVE_ALLOWED_VOICE_NAMES) {
    if (candidate.toLowerCase() === raw.toLowerCase()) return candidate;
  }
  return "";
}

function clampText(value = "", maxLen = 2000) {
  return String(value || "").trim().slice(0, Math.max(0, Number(maxLen) || 0));
}

function clampNumber(value, min = 0, max = Number.POSITIVE_INFINITY, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseWavDurationSeconds(buffer = null) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 44) return 0;
  const riff = buffer.toString("ascii", 0, 4);
  const wave = buffer.toString("ascii", 8, 12);
  if (riff !== "RIFF" || wave !== "WAVE") return 0;
  const byteRate = buffer.readUInt32LE(28);
  if (!byteRate) return 0;
  let offset = 12;
  let dataSize = 0;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === "data") {
      dataSize = chunkSize;
      break;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  const usableSize = dataSize > 0 ? Math.min(dataSize, Math.max(0, buffer.length - (offset + 8))) : Math.max(0, buffer.length - 44);
  if (!usableSize) return 0;
  return usableSize / byteRate;
}

function normalizeStorageSegment(value = "", fallback = "item") {
  const clean = String(value || "").trim().toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  return clean || fallback;
}

function normalizePodcasterRole(value = "") {
  const clean = String(value || "").trim().toLowerCase();
  if (clean === "assistant" || clean === "user" || clean === "system") return clean;
  return "assistant";
}

function sanitizePodcasterSession(raw = {}) {
  const disfluencyDefaults = {
    enabled: false,
    fillerLevel: 20,
    errorLevel: 10,
    stutterEnabled: false,
    stutterLevel: 18,
  };
  const ttsDirectionDefaults = {
    stylePrompt: "",
    pacingPrompt: "",
    accentPrompt: "",
    scenePrompt: "",
    audioTags: "",
  };
  const disfluencyMax = {
    fillerLevel: 300,
    errorLevel: 300,
    stutterLevel: 100,
  };
  const normalizeInlineAudioTags = (value = "") => {
    const source = String(value || "").trim();
    if (!source) return "";
    const explicitTags = source.match(/\[[^[\]]+\]/g);
    if (explicitTags?.length) {
      return explicitTags.map((tag) => clampText(tag.replace(/\s+/g, " ").trim(), 40)).filter(Boolean).slice(0, 6).join(" ");
    }
    return source
      .split(/[,\n;|]+/)
      .map((part) => clampText(String(part || "").replace(/[\[\]]/g, "").replace(/\s+/g, " ").trim(), 32))
      .filter(Boolean)
      .slice(0, 6)
      .map((part) => `[${part}]`)
      .join(" ");
  };
  const normalizeDisfluency = (input = {}) => ({
    enabled: input?.enabled === true,
    fillerLevel: Math.max(0, Math.min(disfluencyMax.fillerLevel, Number(input?.fillerLevel ?? disfluencyDefaults.fillerLevel) || disfluencyDefaults.fillerLevel)),
    errorLevel: Math.max(0, Math.min(disfluencyMax.errorLevel, Number(input?.errorLevel ?? disfluencyDefaults.errorLevel) || disfluencyDefaults.errorLevel)),
    stutterEnabled: input?.stutterEnabled === true,
    stutterLevel: Math.max(0, Math.min(disfluencyMax.stutterLevel, Number(input?.stutterLevel ?? disfluencyDefaults.stutterLevel) || disfluencyDefaults.stutterLevel)),
  });
  const normalizeTtsDirection = (input = {}) => ({
    stylePrompt: clampText(input?.stylePrompt || ttsDirectionDefaults.stylePrompt, 260),
    pacingPrompt: clampText(input?.pacingPrompt || ttsDirectionDefaults.pacingPrompt, 180),
    accentPrompt: clampText(input?.accentPrompt || ttsDirectionDefaults.accentPrompt, 180),
    scenePrompt: clampText(input?.scenePrompt || ttsDirectionDefaults.scenePrompt, 220),
    audioTags: normalizeInlineAudioTags(input?.audioTags || ttsDirectionDefaults.audioTags),
  });
  const rowsInput = Array.isArray(raw?.script?.rows) ? raw.script.rows : [];
  const rows = rowsInput.slice(0, 400).map((row, index) => {
    const nextRow = { ...row };
    
    // Asegurar campos canónicos con sanitización y fallbacks
    nextRow.id = clampText(row?.id || `row_${index + 1}`, 80) || `row_${index + 1}`;
    nextRow.speaker = clampText(row?.speaker || "Host A", 80) || "Host A";
    nextRow.expression = clampText(row?.expression || "Neutral", 80) || "Neutral";
    nextRow.durationSec = Math.max(6, Math.min(180, Number(row?.durationSec) || 18));
    nextRow.mediaCue = clampText(row?.mediaCue || "Sin media", 80) || "Sin media";
    nextRow.text = clampText(row?.text || row?.Guion || row?.guion || row?.guión || row?.voiceOverText || "", 12000);
    nextRow.voiceOverText = clampText(row?.voiceOverText || row?.text || row?.Guion || row?.guion || row?.guión || "", 12000);
    nextRow.sceneDescription = clampText(row?.sceneDescription || row?.description || row?.Descripción || row?.scenePrompt || "", 5000);
    nextRow.onScreenText = clampText(row?.onScreenText || row?.["Texto en pantalla"] || row?.["Texto en Pantalla"] || "", 1600);
    nextRow.visualNotes = clampText(row?.visualNotes || row?.visualElement || row?.["Elemento visual"] || row?.["Elemento Visual"] || "", 5000);
    
    // Sanitizar otros campos conocidos si existen
    if (nextRow.notes) nextRow.notes = clampText(nextRow.notes, 5000);
    if (nextRow.transition) nextRow.transition = clampText(nextRow.transition, 1200);
    if (nextRow.videoDirective) nextRow.videoDirective = clampText(nextRow.videoDirective, 1400);
    if (nextRow.scenePrompt) nextRow.scenePrompt = clampText(nextRow.scenePrompt, 1200);

    return nextRow;
  });
  const hosts = Array.isArray(raw?.script?.hosts) ?
    raw.script.hosts.slice(0, 10).map((host) => clampText(host, 80)).filter(Boolean) :
    [];
  const scriptVideoMode = raw?.script?.videoMode === true;
  const chat = Array.isArray(raw?.chat) ?
    raw.chat.slice(-220).map((msg, index) => ({
      id: clampText(msg?.id || `msg_${index + 1}`, 80) || `msg_${index + 1}`,
      role: normalizePodcasterRole(msg?.role || "assistant"),
      text: clampText(msg?.text || "", 10000),
    })) :
    [];
  const speakerPortraitMapRaw = raw?.speakerPortraitMap && typeof raw.speakerPortraitMap === "object" ?
    raw.speakerPortraitMap :
    {};
  const speakerPortraitMap = {};
  Object.entries(speakerPortraitMapRaw).slice(0, 20).forEach(([speaker, portrait]) => {
    const key = clampText(speaker, 80);
    if (!key || !portrait || typeof portrait !== "object") return;
    const downloadUrl = clampText(portrait?.downloadUrl || "", 3000);
    const storagePath = clampText(portrait?.storagePath || "", 700);
    if (!downloadUrl && !storagePath) return;
    speakerPortraitMap[key] = {
      speaker: key,
      downloadUrl,
      storagePath,
      scenarioPrompt: clampText(portrait?.scenarioPrompt || "", 2400),
      scenarioId: clampText(portrait?.scenarioId || "", 80),
      scenarioImageUrl: clampText(portrait?.scenarioImageUrl || "", 3200),
      scenarioImageStoragePath: clampText(portrait?.scenarioImageStoragePath || "", 700),
      mimeType: clampText(portrait?.mimeType || "image/png", 120) || "image/png",
      updatedAt: clampText(portrait?.updatedAt || new Date().toISOString(), 64) || new Date().toISOString(),
      model: clampText(portrait?.model || DEFAULT_PODCASTER_IMAGE_MODEL, 140) || DEFAULT_PODCASTER_IMAGE_MODEL,
      promptVersion: clampText(portrait?.promptVersion || "podcaster_v1", 80) || "podcaster_v1",
    };
  });

  const sanitizeReferenceImageMap = (rawMap = {}, maxEntries = 120) => {
    const source = rawMap && typeof rawMap === "object" ? rawMap : {};
    const next = {};
    Object.entries(source).slice(0, maxEntries).forEach(([rawKey, value]) => {
      const key = clampText(rawKey || "", 160);
      if (!key || !value || typeof value !== "object") return;
      const dataUrl = clampText(String(value?.dataUrl || "").trim(), 900_000);
      if (!dataUrl.startsWith("data:image/")) return;
      next[key] = {
        name: clampText(value?.name || "Referencia", 180) || "Referencia",
        dataUrl,
        mimeType: clampText(value?.mimeType || "image/png", 120).trim().toLowerCase() || "image/png",
        updatedAt: clampText(value?.updatedAt || new Date().toISOString(), 64) || new Date().toISOString(),
      };
    });
    return next;
  };

  const speakerReferenceImageMap = sanitizeReferenceImageMap(raw?.speakerReferenceImageMap || {}, 40);
  const scenarioReferenceImageMap = sanitizeReferenceImageMap(raw?.scenarioReferenceImageMap || {}, 120);
  const sanitizeReferenceImageListMap = (rawMap = {}, maxEntries = 500, maxItemsPerEntry = 4) => {
    const source = rawMap && typeof rawMap === "object" ? rawMap : {};
    const next = {};
    Object.entries(source).slice(0, maxEntries).forEach(([rawKey, value]) => {
      const key = clampText(rawKey || "", 160);
      const list = Array.isArray(value) ? value : [];
      if (!key || !list.length) return;
      const normalizedList = list.slice(0, maxItemsPerEntry).map((item) => {
        const dataUrl = clampText(String(item?.dataUrl || "").trim(), 900_000);
        if (!dataUrl.startsWith("data:image/")) return null;
        return {
          name: clampText(item?.name || "Referencia", 180) || "Referencia",
          dataUrl,
          mimeType: clampText(item?.mimeType || "image/png", 120).trim().toLowerCase() || "image/png",
          updatedAt: clampText(item?.updatedAt || new Date().toISOString(), 64) || new Date().toISOString(),
        };
      }).filter(Boolean);
      if (normalizedList.length) next[key] = normalizedList;
    });
    return next;
  };
  const rowReferenceImageListMap = sanitizeReferenceImageListMap(raw?.rowReferenceImageListMap || {}, 500, 4);
  const rowReferenceImageMap = sanitizeReferenceImageMap(raw?.rowReferenceImageMap || {}, 500);
  Object.entries(rowReferenceImageMap).forEach(([key, value]) => {
    if (!rowReferenceImageListMap[key] && value) rowReferenceImageListMap[key] = [value];
  });
  const sanitizeReferenceVideoMap = (rawMap = {}, maxEntries = 500) => {
    const source = rawMap && typeof rawMap === "object" ? rawMap : {};
    const next = {};
    Object.entries(source).slice(0, maxEntries).forEach(([rawKey, value]) => {
      const key = clampText(rawKey || "", 160);
      if (!key || !value || typeof value !== "object") return;
      const dataUrl = clampText(String(value?.dataUrl || "").trim(), 8_000_000);
      if (!dataUrl.startsWith("data:video/")) return;
      next[key] = {
        name: clampText(value?.name || "Referencia de video", 180) || "Referencia de video",
        dataUrl,
        mimeType: clampText(value?.mimeType || "video/mp4", 120).trim().toLowerCase() || "video/mp4",
        updatedAt: clampText(value?.updatedAt || new Date().toISOString(), 64) || new Date().toISOString(),
      };
    });
    return next;
  };
  const rowReferenceVideoMap = sanitizeReferenceVideoMap(raw?.rowReferenceVideoMap || {}, 500);
  const rowReferenceModeByRowId = {};
  Object.entries(raw?.rowReferenceModeByRowId && typeof raw.rowReferenceModeByRowId === "object" ? raw.rowReferenceModeByRowId : {}).slice(0, 500).forEach(([rawKey, value]) => {
    const key = clampText(rawKey || "", 160);
    const mode = String(value || "").trim().toLowerCase() === "video" ? "video" : "image";
    if (mode === "video" && rowReferenceVideoMap[key]) rowReferenceModeByRowId[key] = "video";
    else if (mode === "image" && (rowReferenceImageMap[key] || rowReferenceImageListMap[key]?.length)) rowReferenceModeByRowId[key] = "image";
  });
  const dialogueVideoMapRaw = raw?.dialogueVideoMap && typeof raw.dialogueVideoMap === "object" ?
    raw.dialogueVideoMap :
    {};
  const dialogueVideoMap = {};
  Object.entries(dialogueVideoMapRaw).slice(0, 800).forEach(([rowId, clip]) => {
    const key = clampText(rowId, 120);
    if (!key || !clip || typeof clip !== "object") return;
    const downloadUrl = clampText(clip?.downloadUrl || "", 3000);
    const storagePath = clampText(clip?.storagePath || "", 700);
    if (!downloadUrl && !storagePath) return;
    const segmentsRaw = Array.isArray(clip?.segments) ? clip.segments : [];
    const segments = segmentsRaw.slice(0, 16).map((segment, idx) => {
      const segUrl = clampText(segment?.downloadUrl || "", 3000);
      const segPath = clampText(segment?.storagePath || "", 700);
      if (!segUrl && !segPath) return null;
      return {
        id: clampText(segment?.id || `${key}-seg-${idx + 1}`, 120) || `${key}-seg-${idx + 1}`,
        index: Math.max(0, Number(segment?.index) || idx),
        durationSec: clampNumber(segment?.durationSec, 0, 8, 0),
        downloadUrl: segUrl,
        storagePath: segPath,
        mimeType: clampText(segment?.mimeType || "video/mp4", 120) || "video/mp4",
        variant: clampText(segment?.variant || "", 120),
        targetSpeechLine: clampText(segment?.targetSpeechLine || "", 2200),
      };
    }).filter(Boolean);
    dialogueVideoMap[key] = {
      rowId: key,
      speaker: clampText(clip?.speaker || "", 80),
      mimeType: clampText(clip?.mimeType || "video/mp4", 120) || "video/mp4",
      model: clampText(clip?.model || DEFAULT_PODCASTER_VIDEO_MODEL, 140) || DEFAULT_PODCASTER_VIDEO_MODEL,
      promptVersion: clampText(clip?.promptVersion || "podcaster_veo_v1", 80) || "podcaster_veo_v1",
      videoDirective: clampText(clip?.videoDirective || "", 1400),
      scenePrompt: clampText(clip?.scenePrompt || "", 1200),
      imagePrompts: Array.isArray(clip?.imagePrompts)
        ? clip.imagePrompts.slice(0, 3).map((prompt) => clampText(prompt || "", 1200)).filter(Boolean)
        : String(clip?.imagePrompts || "")
          .split(/\n+/)
          .map((prompt) => clampText(prompt || "", 1200))
          .filter(Boolean)
          .slice(0, 3),
      durationSec: clampNumber(clip?.durationSec, 0, 240, 0),
      targetSpeechLine: clampText(clip?.targetSpeechLine || "", 2200),
      segments,
      updatedAt: clampText(clip?.updatedAt || new Date().toISOString(), 64) || new Date().toISOString(),
      downloadUrl,
      storagePath,
      publicSceneLibraryId: clampText(clip?.publicSceneLibraryId || "", 140),
      publicScenePublishedAt: clampText(clip?.publicScenePublishedAt || "", 64),
      publicSceneTitle: clampText(clip?.publicSceneTitle || "", 220),
      publicSceneThumbUrl: clampText(clip?.publicSceneThumbUrl || "", 3000),
      publicSceneVideoUrl: clampText(clip?.publicSceneVideoUrl || "", 3000),
    };
  });
  const dialogueAudioMapRaw = raw?.dialogueAudioMap && typeof raw.dialogueAudioMap === "object" ?
    raw.dialogueAudioMap :
    {};
  const dialogueAudioMap = {};
  Object.entries(dialogueAudioMapRaw).slice(0, 800).forEach(([rowId, clip]) => {
    const key = clampText(rowId, 120);
    if (!key || !clip || typeof clip !== "object") return;
    const downloadUrl = clampText(clip?.downloadUrl || "", 3000);
    const storagePath = clampText(clip?.storagePath || "", 700);
    if (!downloadUrl && !storagePath) return;
    dialogueAudioMap[key] = {
      rowId: key,
      speaker: clampText(clip?.speaker || "", 80),
      mimeType: clampText(clip?.mimeType || "audio/wav", 120) || "audio/wav",
      model: clampText(clip?.model || "gemini-2.5-flash-preview-tts", 140) || "gemini-2.5-flash-preview-tts",
      promptVersion: clampText(clip?.promptVersion || "podcaster_live_audio_v1", 80) || "podcaster_live_audio_v1",
      durationSec: clampNumber(clip?.durationSec, 0, 180, 0),
      targetSpeechLine: clampText(clip?.targetSpeechLine || "", 2200),
      updatedAt: clampText(clip?.updatedAt || new Date().toISOString(), 64) || new Date().toISOString(),
      downloadUrl,
      storagePath,
    };
  });
  const transitionsRaw = raw?.podcastVideoConfig?.transitionsByEdge && typeof raw.podcastVideoConfig.transitionsByEdge === "object" ?
    raw.podcastVideoConfig.transitionsByEdge :
    {};
  const transitionsByEdge = {};
  Object.entries(transitionsRaw).slice(0, 1200).forEach(([edgeKey, item]) => {
    const key = clampText(edgeKey, 200);
    if (!key || !item || typeof item !== "object") return;
    const transitionType = String(item.type || "cut").trim().toLowerCase();
    transitionsByEdge[key] = {
      type: ["cut", "crossfade", "dip-black"].includes(transitionType) ? transitionType : "cut",
      durationMs: Math.max(0, Math.min(1200, Number(item.durationMs) || 0)),
    };
  });
  const audioModeRaw = String(raw?.podcastVideoConfig?.audioMode || "").trim().toLowerCase();
  const podcastVideoConfig = {
    enabled: raw?.podcastVideoConfig?.enabled === true,
    editorEnabled: raw?.podcastVideoConfig?.editorEnabled === true,
    transitionsByEdge,
    audioMode: audioModeRaw === "veo-native-audio" ? "veo-native-audio" : "gemini-live-per-scene",
    masterVolume: clampNumber(raw?.podcastVideoConfig?.masterVolume, 0, 100, 100),
    clipVolume: clampNumber(raw?.podcastVideoConfig?.clipVolume, 0, 100, 0),
  };
  const panelMusicConfigRaw = raw?.panelMusicConfig && typeof raw.panelMusicConfig === "object" ? raw.panelMusicConfig : {};
  const panelMusicTrackRaw = panelMusicConfigRaw?.track && typeof panelMusicConfigRaw.track === "object" ? panelMusicConfigRaw.track : null;
  const panelMusicConfig = {
    preset: ["ambient", "focus", "pulse"].includes(String(panelMusicConfigRaw?.preset || "").trim()) ? String(panelMusicConfigRaw.preset).trim() : "ambient",
    volume: Math.max(0, Math.min(100, Number(panelMusicConfigRaw?.volume) || 22)),
    sourceType: String(panelMusicConfigRaw?.sourceType || "").trim() === "track" ? "track" : "preset",
    track: panelMusicTrackRaw ?
      {
        name: clampText(panelMusicTrackRaw?.name || "Audio", 180) || "Audio",
        mimeType: clampText(panelMusicTrackRaw?.mimeType || "audio/mpeg", 120) || "audio/mpeg",
        size: Math.max(0, Number(panelMusicTrackRaw?.size) || 0),
        downloadUrl: clampText(panelMusicTrackRaw?.downloadUrl || "", 3000),
        storagePath: clampText(panelMusicTrackRaw?.storagePath || "", 700),
        updatedAt: clampText(panelMusicTrackRaw?.updatedAt || new Date().toISOString(), 64) || new Date().toISOString(),
      } :
      null,
  };
  const globalScenarioDeckRaw = raw?.globalScenarioDeck && typeof raw.globalScenarioDeck === "object" ?
    raw.globalScenarioDeck :
    {};
  const globalScenarioItemsRaw = Array.isArray(globalScenarioDeckRaw?.items) ? globalScenarioDeckRaw.items : [];
  const globalScenarioItems = globalScenarioItemsRaw.slice(0, 2).map((item, index) => {
    if (!item || typeof item !== "object") return null;
    const id = clampText(item?.id || `scenario_${index + 1}`, 80) || `scenario_${index + 1}`;
    return {
      id,
      revision: Math.max(0, Number(item?.revision) || 0),
      title: clampText(item?.title || `Escenario ${index + 1}`, 120) || `Escenario ${index + 1}`,
      prompt: clampText(item?.prompt || "", 4000),
      downloadUrl: clampText(item?.downloadUrl || "", 3000),
      storagePath: clampText(item?.storagePath || "", 700),
      mimeType: clampText(item?.mimeType || "image/png", 120) || "image/png",
      updatedAt: clampText(item?.updatedAt || new Date().toISOString(), 64) || new Date().toISOString(),
      model: clampText(item?.model || DEFAULT_PODCASTER_IMAGE_MODEL, 140) || DEFAULT_PODCASTER_IMAGE_MODEL,
    };
  }).filter(Boolean);
  const defaultActiveScenarioId = globalScenarioItems[0]?.id || "scenario_a";
  const globalScenarioDeck = {
    activeId: clampText(globalScenarioDeckRaw?.activeId || defaultActiveScenarioId, 80) || defaultActiveScenarioId,
    items: globalScenarioItems,
  };
  const normalizedDisfluencyDefaults = normalizeDisfluency(raw?.disfluencyDefaults || disfluencyDefaults);
  const normalizedTtsDirectionDefaults = normalizeTtsDirection(raw?.ttsDirectionDefaults || ttsDirectionDefaults);
  return {
    id: clampText(raw?.id || "", 100),
    title: clampText(raw?.title || "Sesión sin título", 180) || "Sesión sin título",
    prompt: clampText(raw?.prompt || "", 5000),
    archived: raw?.archived === true,
    updatedAt: clampText(raw?.updatedAt || new Date().toISOString(), 64),
    chat,
    script: {
      episodeTitle: clampText(raw?.script?.episodeTitle || (scriptVideoMode ? "Video educativo" : "Podcast"), 220),
      summary: clampText(raw?.script?.summary || "", 6000),
      videoMode: scriptVideoMode,
      hosts,
      rows,
    },
    speakerVoiceMap: raw?.speakerVoiceMap && typeof raw.speakerVoiceMap === "object" ? raw.speakerVoiceMap : {},
    speakerExpressionMap: raw?.speakerExpressionMap && typeof raw.speakerExpressionMap === "object" ? raw.speakerExpressionMap : {},
    speakerNameMap: raw?.speakerNameMap && typeof raw.speakerNameMap === "object" ? raw.speakerNameMap : {},
    disfluencyDefaults: normalizedDisfluencyDefaults,
    ttsDirectionDefaults: normalizedTtsDirectionDefaults,
    panelMusicConfig,
    speakerPortraitMap,
    speakerReferenceImageMap,
    scenarioReferenceImageMap,
    rowReferenceImageListMap,
    rowReferenceImageMap,
    rowReferenceVideoMap,
    rowReferenceModeByRowId,
    globalScenarioDeck,
    dialogueVideoMap,
    dialogueAudioMap,
    podcastVideoConfig,
  };
}

async function resolveShareTargetUser({targetUid = "", targetEmail = ""}) {
  const uidInput = clampText(targetUid, 140);
  const emailInput = clampText(targetEmail, 180).toLowerCase();
  if (!uidInput && !emailInput) {
    throw new HttpsError("invalid-argument", "Debes indicar targetUid o targetEmail.");
  }
  if (uidInput) {
    const userSnap = await db.collection("users").doc(uidInput).get();
    if (!userSnap.exists) {
      throw new HttpsError("not-found", "No se encontró el usuario destino.");
    }
    const data = userSnap.data() || {};
    return {
      uid: uidInput,
      email: clampText(data?.email || "", 180).toLowerCase() || null,
    };
  }
  const byEmail = await db.collection("users").where("email", "==", emailInput).limit(1).get();
  const docSnap = byEmail.docs[0] || null;
  if (!docSnap) {
    throw new HttpsError("not-found", "No se encontró el usuario destino por email.");
  }
  const data = docSnap.data() || {};
  return {
    uid: String(docSnap.id || "").trim(),
    email: clampText(data?.email || emailInput, 180).toLowerCase() || emailInput,
  };
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
  const key = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
  if (!key) {
    return res.status(500).json({error: "Falta GEMINI_API_KEY o GOOGLE_API_KEY."});
  }
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`;
  const upstream = await fetch(endpoint, {method: "GET"});
  const data = await upstream.json().catch(() => ({}));
  res.status(upstream.status).json(data);
}

async function forwardAssetsProxyMedia(req, res) {
  const storagePath = clampText(req.query?.storagePath || "", 700);
  const rawUrl = String(req.query?.url || "").trim();
  const rangeHeader = String(req.headers.range || "").trim();
  if (storagePath) {
    const bucket = admin.storage().bucket();
    const file = bucket.file(storagePath);
    const [exists] = await file.exists().catch(() => [false]);
    if (!exists) return res.status(404).json({error: "Archivo no encontrado en Storage."});
    const [meta] = await file.getMetadata().catch(() => [{}]);
    const [buffer] = await file.download();
    const mime = String(meta?.contentType || "application/octet-stream");
    res.set("Content-Type", mime);
    res.set("Content-Length", String(buffer.length));
    res.set("Accept-Ranges", "bytes");
    res.set("Cache-Control", "private, max-age=120");
    if (rangeHeader) {
      const match = rangeHeader.match(/^bytes=(\\d*)-(\\d*)$/i);
      if (match) {
        const start = Math.max(0, Number(match[1] || 0));
        const end = match[2] ? Math.min(buffer.length - 1, Number(match[2])) : buffer.length - 1;
        const chunk = buffer.subarray(start, end + 1);
        res.set("Content-Range", `bytes ${start}-${end}/${buffer.length}`);
        res.set("Content-Length", String(chunk.length));
        return res.status(206).send(chunk);
      }
    }
    return res.status(200).send(buffer);
  }

  const normalizedUrl = rawUrl.includes("%25") ? decodeURIComponent(rawUrl) : rawUrl;
  if (!normalizedUrl) return res.status(400).json({error: "Falta parámetro url o storagePath."});
  let parsed = null;
  try {
    parsed = new URL(normalizedUrl);
  } catch (_) {
    return res.status(400).json({error: "URL inválida."});
  }
  const protocol = String(parsed.protocol || "").toLowerCase();
  if (protocol !== "https:" && protocol !== "http:") {
    return res.status(400).json({error: "Solo se permiten URLs http/https."});
  }
  const host = String(parsed.hostname || "").toLowerCase();
  const allowedHost = host.endsWith("googleapis.com") || host.endsWith("firebasestorage.app");
  if (!allowedHost) return res.status(403).json({error: "Host no permitido para proxy."});

  const upstream = await fetch(normalizedUrl, {
    method: "GET",
    headers: rangeHeader ? {Range: rangeHeader} : undefined,
  });
  if (!upstream.ok && upstream.status !== 206) {
    const text = await upstream.text().catch(() => "");
    try {
      const parsedText = JSON.parse(text || "{}");
      return res.status(upstream.status).json(parsedText);
    } catch (_) {
      return res.status(upstream.status).json({error: text || `HTTP ${upstream.status}`});
    }
  }

  const mime = String(upstream.headers.get("content-type") || "application/octet-stream");
  const contentLength = String(upstream.headers.get("content-length") || "").trim();
  const contentRange = String(upstream.headers.get("content-range") || "").trim();
  const acceptRanges = String(upstream.headers.get("accept-ranges") || "bytes").trim() || "bytes";
  const cacheControl = String(upstream.headers.get("cache-control") || "private, max-age=120").trim();
  const buffer = Buffer.from(await upstream.arrayBuffer());
  res.set("Content-Type", mime);
  if (contentLength) res.set("Content-Length", contentLength);
  if (contentRange) res.set("Content-Range", contentRange);
  if (acceptRanges) res.set("Accept-Ranges", acceptRanges);
  if (cacheControl) res.set("Cache-Control", cacheControl);
  return res.status(upstream.status === 206 ? 206 : 200).send(buffer);
}

async function forwardGeminiLiveToken(req, res) {
  const key = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
  if (!key) {
    return res.status(500).json({error: "Configuración incompleta en backend."});
  }

  const modelInput = sanitizeModel(String(req.body?.model || "gemini-2.5-flash-native-audio-preview-12-2025").trim());
  if (!isAllowedGeminiModel(modelInput)) {
    return res.status(400).json({error: "Modelo Gemini inválido para Live."});
  }
  const model = modelInput;
  const requestedVoiceName = String(req.body?.voiceName || "").trim();
  const voiceName = normalizeLiveVoiceName(requestedVoiceName);
  if (requestedVoiceName && !voiceName) {
    return res.status(400).json({error: `Voz no soportada para Gemini Live: ${requestedVoiceName}`});
  }
  const systemInstruction = String(
      req.body?.systemInstruction || "Eres un asistente pedagógico útil y amable.",
  ).trim();
  if (systemInstruction.length > MAX_SYSTEM_INSTRUCTION_LENGTH) {
    return res.status(400).json({error: "systemInstruction excede el límite permitido."});
  }
  const liveConfig = {
    responseModalities: ["AUDIO"],
    systemInstruction,
    sessionResumption: {},
  };
  if (voiceName) {
    liveConfig.speechConfig = {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName,
        },
      },
    };
  }

  const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const newSessionExpireTime = new Date(Date.now() + 60 * 1000).toISOString();
  try {
    const ai = new GoogleGenAI({
      apiKey: key,
      httpOptions: {apiVersion: "v1alpha"},
    });
    const data = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime,
        liveConnectConstraints: {
          model,
          config: liveConfig,
        },
        lockAdditionalFields: [],
      },
    });

    return res.status(200).json({
      token: data?.name || "",
      model,
      requestedVoiceName: requestedVoiceName || null,
      voiceName: voiceName || null,
      expireTime: data?.expireTime || expireTime,
      newSessionExpireTime: data?.newSessionExpireTime || newSessionExpireTime,
    });
  } catch (error) {
    const status = Number(
        error?.status ||
        error?.code ||
        error?.cause?.status ||
        error?.cause?.response?.status ||
        0,
    ) || 0;
    const contentType = String(
        error?.cause?.response?.headers?.get?.("content-type") ||
        error?.response?.headers?.get?.("content-type") ||
        "",
    ).trim();
    const bodySnippet = String(
        error?.cause?.body ||
        error?.cause?.responseText ||
        error?.responseText ||
        error?.details ||
        error?.message ||
        "",
    ).trim().slice(0, 500);
    console.error("[GEMINI_LIVE_TOKEN] Upstream error", {
      status: status || null,
      contentType: contentType || null,
      bodySnippet: bodySnippet || null,
    });
    return res.status(status >= 400 ? status : 502).json({
      error: "UPSTREAM_GEMINI_LIVE_TOKEN_FAILED",
      detail: bodySnippet || "No se pudo crear token efímero para Gemini Live.",
    });
  }
}

async function forwardPodcasterSessionSave(req, res) {
  const uid = String(req.securityContext?.uid || "").trim();
  if (!uid) return res.status(401).json({error: "AUTH_REQUIRED"});
  const source = req.body?.session && typeof req.body.session === "object" ? req.body.session : null;
  if (!source) {
    return res.status(400).json({error: "Falta payload session."});
  }
  const sanitized = sanitizePodcasterSession(source);
  if (!sanitized.id) {
    sanitized.id = `session_${randomUUID().slice(0, 12)}`;
  }
  const serialized = asJson(sanitized);
  if (Buffer.byteLength(serialized, "utf8") > MAX_PODCASTER_SESSION_BYTES) {
    return res.status(413).json({error: "La sesión excede el tamaño permitido."});
  }

  const sessionRef = db.collection("podcaster_sessions").doc(sanitized.id);
  await db.runTransaction(async (tx) => {
    const existingSnap = await tx.get(sessionRef);
    const existing = existingSnap.exists ? (existingSnap.data() || {}) : null;
    if (existing && String(existing.ownerId || "") !== uid) {
      throw new HttpsError("permission-denied", "No puedes sobrescribir una sesión de otro usuario.");
    }
    tx.set(sessionRef, {
      ownerId: uid,
      title: sanitized.title,
      archived: sanitized.archived === true,
      sessionUpdatedAt: sanitized.updatedAt || new Date().toISOString(),
      session: sanitized,
      sharedWithIds: Array.isArray(existing?.sharedWithIds) ? existing.sharedWithIds : [],
      sharedWith: Array.isArray(existing?.sharedWith) ? existing.sharedWith : [],
      createdAt: existing?.createdAt || admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, {merge: true});
  });

  return res.status(200).json({
    ok: true,
    sessionId: sanitized.id,
    ownerId: uid,
    savedAt: new Date().toISOString(),
  });
}

async function forwardPodcasterSessionShare(req, res) {
  const uid = String(req.securityContext?.uid || "").trim();
  if (!uid) return res.status(401).json({error: "AUTH_REQUIRED"});
  const sessionId = clampText(req.body?.sessionId || "", 120);
  if (!sessionId) {
    return res.status(400).json({error: "Falta sessionId."});
  }
  const target = await resolveShareTargetUser({
    targetUid: req.body?.targetUid || "",
    targetEmail: req.body?.targetEmail || "",
  });
  if (target.uid === uid) {
    return res.status(400).json({error: "No puedes compartir contigo mismo."});
  }
  const sessionRef = db.collection("podcaster_sessions").doc(sessionId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(sessionRef);
    if (!snap.exists) {
      throw new HttpsError("not-found", "Sesión no encontrada. Guarda la sesión antes de compartir.");
    }
    const data = snap.data() || {};
    if (String(data.ownerId || "") !== uid) {
      throw new HttpsError("permission-denied", "Solo el propietario puede compartir la sesión.");
    }
    const sharedWithIds = Array.isArray(data.sharedWithIds) ? data.sharedWithIds.map((item) => String(item || "").trim()).filter(Boolean) : [];
    const nextIds = Array.from(new Set([...sharedWithIds, target.uid]));
    const sharedWith = Array.isArray(data.sharedWith) ? data.sharedWith : [];
    const withoutTarget = sharedWith.filter((entry) => String(entry?.uid || "").trim() !== target.uid);
    withoutTarget.push({
      uid: target.uid,
      email: target.email || null,
      sharedAt: new Date().toISOString(),
      sharedBy: uid,
    });
    tx.update(sessionRef, {
      sharedWithIds: nextIds,
      sharedWith: withoutTarget,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  return res.status(200).json({
    ok: true,
    sessionId,
    target,
  });
}

async function forwardPodcasterSessionList(req, res) {
  const uid = String(req.securityContext?.uid || "").trim();
  if (!uid) return res.status(401).json({error: "AUTH_REQUIRED"});
  const [ownedSnap, sharedSnap] = await Promise.all([
    db.collection("podcaster_sessions").where("ownerId", "==", uid).limit(80).get(),
    db.collection("podcaster_sessions").where("sharedWithIds", "array-contains", uid).limit(80).get(),
  ]);
  const merged = new Map();
  [...ownedSnap.docs, ...sharedSnap.docs].forEach((docSnap) => {
    const data = docSnap.data() || {};
    const sessionData = data.session && typeof data.session === "object" ? data.session : null;
    if (!sessionData) return;
    merged.set(docSnap.id, {
      ...sessionData,
      cloudMeta: {
        ownerId: String(data.ownerId || "").trim() || null,
        savedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : null,
      },
    });
  });
  const sessions = Array.from(merged.values()).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  return res.status(200).json({ok: true, sessions});
}

function getImageExtension(mimeType = "image/jpeg") {
  const clean = String(mimeType || "").trim().toLowerCase();
  if (clean === "image/png") return "png";
  if (clean === "image/webp") return "webp";
  if (clean === "image/gif") return "gif";
  if (clean === "image/jpeg" || clean === "image/jpg") return "jpg";
  return "jpg";
}

function normalizePodcastSceneLibraryItem(docSnap = null) {
  const data = docSnap && typeof docSnap.data === "function" ? (docSnap.data() || {}) : (docSnap || {});
  const libraryId = String(docSnap?.id || data.libraryId || data.id || "").trim();
  if (!libraryId) return null;
  return {
    libraryId,
    title: clampText(data.title || data.name || data.publicSceneTitle || "Escena pública", 180) || "Escena pública",
    sourceSessionId: clampText(data.sourceSessionId || "", 140),
    sourceRowId: clampText(data.sourceRowId || "", 120),
    sourceRowNumber: Math.max(0, Number(data.sourceRowNumber) || 0),
    ownerId: clampText(data.ownerId || "", 140),
    ownerEmail: clampText(data.ownerEmail || "", 180),
    durationSec: clampNumber(data.durationSec, 0, 240, 0),
    downloadUrl: clampText(data.downloadUrl || "", 3000),
    storagePath: clampText(data.storagePath || "", 700),
    mimeType: clampText(data.mimeType || "video/mp4", 120) || "video/mp4",
    thumbUrl: clampText(data.thumbUrl || data.thumbnailUrl || "", 3000),
    thumbStoragePath: clampText(data.thumbStoragePath || data.thumbnailStoragePath || "", 700),
    thumbMimeType: clampText(data.thumbMimeType || "image/jpeg", 120) || "image/jpeg",
    sceneDescription: clampText(data.sceneDescription || "", 1200),
    onScreenText: clampText(data.onScreenText || "", 500),
    transition: clampText(data.transition || "", 500),
    visualNotes: clampText(data.visualNotes || "", 1200),
    videoDirective: clampText(data.videoDirective || "", 1400),
    scenePrompt: clampText(data.scenePrompt || "", 1200),
    voiceOverText: clampText(data.voiceOverText || "", 4000),
    tagLabel: clampText(data.tagLabel || "", 120),
    tagColor: clampText(data.tagColor || "slate", 40) || "slate",
    imagePrompts: Array.isArray(data.imagePrompts)
      ? data.imagePrompts.slice(0, 3).map((prompt) => clampText(prompt || "", 1200)).filter(Boolean)
      : String(data.imagePrompts || "")
        .split(/\n+/)
        .map((prompt) => clampText(prompt || "", 1200))
        .filter(Boolean)
        .slice(0, 3),
    videoPreset: clampText(data.videoPreset || "creative", 40) || "creative",
    createdAt: clampText(data.createdAt || "", 64),
    updatedAt: clampText(data.updatedAt || "", 64),
    publicSceneLibraryId: libraryId,
    publicScenePublishedAt: clampText(data.publicScenePublishedAt || data.updatedAt || data.createdAt || "", 64),
  };
}

async function downloadStorageFileToBuffer(storagePath = "") {
  const cleanStoragePath = clampText(storagePath || "", 700);
  if (!cleanStoragePath) return null;
  const bucket = admin.storage().bucket();
  const [buffer] = await bucket.file(cleanStoragePath).download();
  return Buffer.from(buffer);
}

async function uploadSceneLibraryThumb(thumbSource = "", libraryId = "") {
  const source = String(thumbSource || "").trim();
  if (!source) {
    return {thumbUrl: "", thumbStoragePath: "", thumbMimeType: "image/jpeg"};
  }
  if (!source.startsWith("data:")) {
    return {thumbUrl: source, thumbStoragePath: "", thumbMimeType: "image/jpeg"};
  }
  const decoded = decodeBase64DataUrl(source, MAX_SPEAKER_PORTRAIT_BYTES);
  const mimeType = String(decoded.mimeType || "image/jpeg").trim() || "image/jpeg";
  const ext = getImageExtension(mimeType);
  const storagePath = `podcaster/library/scenes/${normalizeStorageSegment(libraryId, "scene")}/thumb.${ext}`;
  const asset = await uploadScreenshotAsset({
    path: storagePath,
    buffer: decoded.buffer,
    mimeType,
    metadata: {
      kind: "podcaster_scene_library_thumb",
      libraryId,
    },
  });
  return {thumbUrl: asset.downloadUrl, thumbStoragePath: asset.path, thumbMimeType: mimeType};
}

async function uploadSceneLibraryVideo({
  downloadUrl = "",
  storagePath = "",
  mimeType = "video/mp4",
  libraryId = "",
}) {
  const sourceStoragePath = String(storagePath || "").trim();
  const sourceDownloadUrl = String(downloadUrl || "").trim();
  if (!sourceStoragePath && !sourceDownloadUrl) {
    throw new Error("Falta video de origen para publicar la escena.");
  }
  let buffer = null;
  let resolvedMimeType = String(mimeType || "video/mp4").trim() || "video/mp4";
  if (sourceStoragePath) {
    try {
      buffer = await downloadStorageFileToBuffer(sourceStoragePath);
    } catch (error) {
      if (!sourceDownloadUrl) throw error;
    }
  }
  if (!buffer && sourceDownloadUrl) {
    const response = await fetchCompat(sourceDownloadUrl, { method: "GET" });
    if (!response.ok) {
      throw new Error(`No se pudo descargar el video fuente (${response.status}).`);
    }
    buffer = Buffer.from(await response.arrayBuffer());
    resolvedMimeType = String(response.headers.get("content-type") || resolvedMimeType).trim() || resolvedMimeType;
  }
  if (!buffer?.length) {
    throw new Error("El video fuente está vacío.");
  }
  const ext = getVideoExtension(resolvedMimeType);
  const libraryPath = `podcaster/library/scenes/${normalizeStorageSegment(libraryId, "scene")}/video.${ext}`;
  const asset = await uploadScreenshotAsset({
    path: libraryPath,
    buffer,
    mimeType: resolvedMimeType,
    metadata: {
      kind: "podcaster_scene_library_video",
      libraryId,
    },
  });
  return {
    downloadUrl: asset.downloadUrl,
    storagePath: asset.path,
    mimeType: resolvedMimeType,
  };
}

async function forwardPodcasterSceneLibraryList(req, res) {
  const uid = String(req.securityContext?.uid || "").trim();
  if (!uid) return res.status(401).json({error: "AUTH_REQUIRED"});
  try {
    const snap = await db.collection("podcaster_scene_library").orderBy("updatedAt", "desc").limit(250).get();
    const items = snap.docs.map((docSnap) => normalizePodcastSceneLibraryItem(docSnap)).filter(Boolean);
    return res.status(200).json({ok: true, items});
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({error: String(error?.message || "No se pudo listar la biblioteca pública de escenas.")});
  }
}

async function forwardPodcasterSceneLibraryPublish(req, res) {
  const uid = String(req.securityContext?.uid || "").trim();
  const ownerEmail = String(req.securityContext?.email || "").trim();
  if (!uid) return res.status(401).json({error: "AUTH_REQUIRED"});
  try {
    const sessionId = clampText(req.body?.sessionId || "", 140);
    const rowId = clampText(req.body?.rowId || "", 120);
    const incomingLibraryId = clampText(req.body?.libraryId || "", 140);
    const title = clampText(req.body?.title || "Escena pública", 180) || "Escena pública";
    const durationSec = clampNumber(req.body?.durationSec, 6, 180, 6);
    const videoDownloadUrl = clampText(req.body?.downloadUrl || "", 3000);
    const videoStoragePath = clampText(req.body?.storagePath || "", 700);
    const videoMimeType = clampText(req.body?.mimeType || "video/mp4", 120) || "video/mp4";
    const thumbDataUrl = String(req.body?.thumbDataUrl || "").trim();
    const sceneDescription = clampText(req.body?.sceneDescription || "", 1200);
    const onScreenText = clampText(req.body?.onScreenText || "", 500);
    const transition = clampText(req.body?.transition || "", 500);
    const visualNotes = clampText(req.body?.visualNotes || "", 1200);
    const videoDirective = clampText(req.body?.videoDirective || "", 1400);
    const scenePrompt = clampText(req.body?.scenePrompt || "", 1200);
    const voiceOverText = clampText(req.body?.voiceOverText || "", 4000);
    const imagePrompts = Array.isArray(req.body?.imagePrompts)
      ? req.body.imagePrompts.slice(0, 3).map((prompt) => clampText(prompt || "", 1200)).filter(Boolean)
      : String(req.body?.imagePrompts || "")
        .split(/\n+/)
        .map((prompt) => clampText(prompt || "", 1200))
        .filter(Boolean)
        .slice(0, 3);
    const videoPreset = clampText(req.body?.videoPreset || "creative", 40) || "creative";
    const tagLabel = clampText(req.body?.tagLabel || "", 120);
    const tagColor = clampText(req.body?.tagColor || "slate", 40) || "slate";
    if (!sessionId) return res.status(400).json({error: "Falta sessionId."});
    if (!rowId) return res.status(400).json({error: "Falta rowId."});
    if (!videoDownloadUrl && !videoStoragePath) return res.status(400).json({error: "Falta video de la escena."});

    const sessionSnap = await db.collection("podcaster_sessions").doc(sessionId).get();
    const sourceSession = sessionSnap.exists ? (sessionSnap.data()?.session || null) : null;
    const sourceRowIndex = Array.isArray(sourceSession?.script?.rows)
      ? sourceSession.script.rows.findIndex((item) => String(item?.id || "").trim() === rowId)
      : -1;
    const libraryId = incomingLibraryId || randomUUID();
    const libraryRef = db.collection("podcaster_scene_library").doc(libraryId);
    const existingSnap = await libraryRef.get();
    const existing = existingSnap.exists ? (existingSnap.data() || {}) : {};

    const videoAsset = await uploadSceneLibraryVideo({
      downloadUrl: videoDownloadUrl,
      storagePath: videoStoragePath,
      mimeType: videoMimeType,
      libraryId,
    });
    const thumbAsset = await uploadSceneLibraryThumb(thumbDataUrl, libraryId);
    const nowIso = new Date().toISOString();

    await libraryRef.set({
      libraryId,
      sourceSessionId: sessionId,
      sourceRowId: rowId,
      sourceRowNumber: sourceRowIndex >= 0 ? sourceRowIndex + 1 : 0,
      ownerId: uid,
      ownerEmail: ownerEmail || null,
      title,
      durationSec,
      downloadUrl: videoAsset.downloadUrl,
      storagePath: videoAsset.storagePath,
      mimeType: videoAsset.mimeType,
      thumbUrl: thumbAsset.thumbUrl || thumbDataUrl,
      thumbStoragePath: thumbAsset.thumbStoragePath || "",
      thumbMimeType: thumbAsset.thumbMimeType || "image/jpeg",
      sceneDescription,
      onScreenText,
      transition,
      visualNotes,
      videoDirective,
      scenePrompt,
      voiceOverText,
      tagLabel: existing.tagLabel || tagLabel,
      tagColor: existing.tagColor || tagColor,
      imagePrompts,
      videoPreset,
      createdAt: existing.createdAt || nowIso,
      updatedAt: nowIso,
    }, {merge: true});

    const previousVideoStoragePath = clampText(existing.storagePath || "", 700);
    const previousThumbStoragePath = clampText(existing.thumbStoragePath || "", 700);
    if (previousVideoStoragePath && previousVideoStoragePath !== videoAsset.storagePath) {
      await deleteStoragePath(previousVideoStoragePath).catch(() => {});
    }
    if (previousThumbStoragePath && previousThumbStoragePath !== thumbAsset.thumbStoragePath) {
      await deleteStoragePath(previousThumbStoragePath).catch(() => {});
    }

    return res.status(200).json({
      ok: true,
      item: {
        libraryId,
        sourceSessionId: sessionId,
        sourceRowId: rowId,
        sourceRowNumber: sourceRowIndex >= 0 ? sourceRowIndex + 1 : 0,
        ownerId: uid,
        ownerEmail: ownerEmail || null,
        title,
        durationSec,
        downloadUrl: videoAsset.downloadUrl,
        storagePath: videoAsset.storagePath,
        mimeType: videoAsset.mimeType,
        thumbUrl: thumbAsset.thumbUrl || thumbDataUrl,
        thumbStoragePath: thumbAsset.thumbStoragePath || "",
        thumbMimeType: thumbAsset.thumbMimeType || "image/jpeg",
        sceneDescription,
        onScreenText,
        transition,
        visualNotes,
        videoDirective,
        scenePrompt,
        voiceOverText,
        tagLabel: existing.tagLabel || tagLabel,
        tagColor: existing.tagColor || tagColor,
        imagePrompts,
        videoPreset,
        createdAt: existing.createdAt || nowIso,
        updatedAt: nowIso,
      }
    });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({error: String(error?.message || "No se pudo publicar la escena pública.")});
  }
}

async function forwardPodcasterSceneLibraryUploadLocal(req, res) {
  const uid = String(req.securityContext?.uid || "").trim();
  const ownerEmail = String(req.securityContext?.email || "").trim();
  if (!uid) return res.status(401).json({error: "AUTH_REQUIRED"});
  try {
    const title = clampText(req.body?.title || req.body?.originalName || "Video local", 180) || "Video local";
    const originalName = clampText(req.body?.originalName || title, 180) || title;
    const videoDataUrl = String(req.body?.videoDataUrl || "").trim();
    const requestedMimeType = clampText(req.body?.mimeType || "video/mp4", 120) || "video/mp4";
    const durationSec = clampNumber(req.body?.durationSec, 0, 240, 0);
    const size = Math.max(0, Number(req.body?.size || 0) || 0);
    const thumbDataUrl = String(req.body?.thumbDataUrl || "").trim();
    if (!videoDataUrl) return res.status(400).json({error: "Falta videoDataUrl."});
    const decoded = decodeBase64DataUrl(videoDataUrl, MAX_DIALOGUE_VIDEO_BYTES);
    const mimeType = String(decoded.mimeType || requestedMimeType || "video/mp4").trim().toLowerCase() || "video/mp4";
    if (!mimeType.startsWith("video/")) return res.status(400).json({error: "El archivo debe ser un video."});
    const libraryId = randomUUID();
    const ext = getVideoExtension(mimeType);
    const storagePath = `podcaster/library/scenes/${normalizeStorageSegment(libraryId, "scene")}/local-video.${ext}`;
    const videoAsset = await uploadScreenshotAsset({
      path: storagePath,
      buffer: decoded.buffer,
      mimeType,
      metadata: {
        kind: "podcaster_scene_library_video",
        source: "local_upload",
        libraryId,
        uid,
        originalName,
        size: String(size || decoded.buffer.length),
      },
    });
    const thumbAsset = await uploadSceneLibraryThumb(thumbDataUrl, libraryId);
    const nowIso = new Date().toISOString();
    const item = {
      libraryId,
      sourceSessionId: "",
      sourceRowId: "",
      sourceRowNumber: 0,
      ownerId: uid,
      ownerEmail: ownerEmail || null,
      title,
      durationSec,
      downloadUrl: videoAsset.downloadUrl,
      storagePath: videoAsset.path,
      mimeType,
      thumbUrl: thumbAsset.thumbUrl || "",
      thumbStoragePath: thumbAsset.thumbStoragePath || "",
      thumbMimeType: thumbAsset.thumbMimeType || "image/jpeg",
      sceneDescription: "",
      onScreenText: "",
      transition: "",
      visualNotes: "",
      videoDirective: "",
      scenePrompt: "",
      voiceOverText: "",
      tagLabel: "Local",
      tagColor: "sky",
      imagePrompts: [],
      videoPreset: "local",
      sourceType: "local_upload",
      originalName,
      size: size || decoded.buffer.length,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    await db.collection("podcaster_scene_library").doc(libraryId).set(item, {merge: true});
    return res.status(200).json({ok: true, item});
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({error: String(error?.message || "No se pudo subir el video local.")});
  }
}

async function forwardPodcasterSceneLibraryUpdate(req, res) {
  const uid = String(req.securityContext?.uid || "").trim();
  const libraryId = clampText(req.body?.libraryId || "", 140);
  const title = clampText(req.body?.title || "", 180);
  const tagLabel = clampText(req.body?.tagLabel || "", 120);
  const tagColor = clampText(req.body?.tagColor || "slate", 40) || "slate";
  if (!uid) return res.status(401).json({error: "AUTH_REQUIRED"});
  if (!libraryId) return res.status(400).json({error: "Falta libraryId."});
  if (!title) return res.status(400).json({error: "Falta title."});
  const ref = db.collection("podcaster_scene_library").doc(libraryId);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({error: "La escena pública no existe."});
  const data = snap.data() || {};
  if (String(data.ownerId || "").trim() && String(data.ownerId || "").trim() !== uid) {
    return res.status(403).json({error: "No puedes editar esta escena."});
  }
  const nowIso = new Date().toISOString();
  await ref.set({ title, tagLabel, tagColor, updatedAt: nowIso }, {merge: true});
  return res.status(200).json({
    ok: true,
    item: {
      libraryId,
      sourceSessionId: clampText(data.sourceSessionId || "", 140),
      sourceRowId: clampText(data.sourceRowId || "", 120),
      sourceRowNumber: Math.max(0, Number(data.sourceRowNumber) || 0),
      ownerId: clampText(data.ownerId || "", 140),
      ownerEmail: clampText(data.ownerEmail || "", 180),
      title,
      durationSec: clampNumber(data.durationSec, 0, 240, 0),
      downloadUrl: clampText(data.downloadUrl || "", 3000),
      storagePath: clampText(data.storagePath || "", 700),
      mimeType: clampText(data.mimeType || "video/mp4", 120) || "video/mp4",
      thumbUrl: clampText(data.thumbUrl || data.thumbnailUrl || "", 3000),
      thumbStoragePath: clampText(data.thumbStoragePath || data.thumbnailStoragePath || "", 700),
      thumbMimeType: clampText(data.thumbMimeType || "image/jpeg", 120) || "image/jpeg",
      sceneDescription: clampText(data.sceneDescription || "", 1200),
      onScreenText: clampText(data.onScreenText || "", 500),
      transition: clampText(data.transition || "", 500),
      visualNotes: clampText(data.visualNotes || "", 1200),
      videoDirective: clampText(data.videoDirective || "", 1400),
      scenePrompt: clampText(data.scenePrompt || "", 1200),
      voiceOverText: clampText(data.voiceOverText || "", 4000),
      tagLabel,
      tagColor,
      imagePrompts: Array.isArray(data.imagePrompts) ? data.imagePrompts : [],
      videoPreset: clampText(data.videoPreset || "creative", 40) || "creative",
      createdAt: clampText(data.createdAt || nowIso, 64),
      updatedAt: nowIso
    }
  });
}

async function forwardPodcasterSceneLibraryDelete(req, res) {
  const uid = String(req.securityContext?.uid || "").trim();
  const libraryId = clampText(req.body?.libraryId || "", 140);
  if (!uid) return res.status(401).json({error: "AUTH_REQUIRED"});
  if (!libraryId) return res.status(400).json({error: "Falta libraryId."});
  const ref = db.collection("podcaster_scene_library").doc(libraryId);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({error: "La escena pública no existe."});
  const data = snap.data() || {};
  if (String(data.ownerId || "").trim() && String(data.ownerId || "").trim() !== uid) {
    return res.status(403).json({error: "No puedes eliminar esta escena."});
  }
  await ref.delete();
  await deleteStoragePath(clampText(data.storagePath || "", 700)).catch(() => {});
  await deleteStoragePath(clampText(data.thumbStoragePath || "", 700)).catch(() => {});
  return res.status(200).json({ok: true, libraryId});
}

async function forwardMoodleShareUsers(req, res) {
  const uid = String(req.securityContext?.uid || "").trim();
  if (!uid) return res.status(401).json({error: "AUTH_REQUIRED"});
  const snap = await db.collection("users").limit(300).get();
  const users = snap.docs.map((docSnap) => {
    const data = docSnap.data() || {};
    const userUid = String(data.uid || docSnap.id || "").trim();
    if (!userUid || userUid === uid) return null;
    const email = clampText(data.email || "", 180).toLowerCase();
    const displayName = clampText(
        data.displayName || data.name || data.nombre || data.fullName || email || userUid,
        180,
    );
    return {
      uid: userUid,
      email: email || "",
      displayName: displayName || userUid,
    };
  }).filter(Boolean).sort((a, b) => {
    const left = String(a.displayName || a.email || a.uid || "").toLowerCase();
    const right = String(b.displayName || b.email || b.uid || "").toLowerCase();
    return left.localeCompare(right);
  });
  return res.status(200).json({ok: true, users});
}

function normalizePodcasterSpeakerSlotIndex(speakerLabel = "") {
  const clean = String(speakerLabel || "").trim().toLowerCase();
  const hostMatch = clean.match(/^host\s+([a-z])/i);
  if (hostMatch?.[1]) return Math.max(0, hostMatch[1].toUpperCase().charCodeAt(0) - 65);
  const known = ["host a", "host b", "host c", "host d", "narrador", "invitado", "patrocinador", "analista", "experto", "co-host"];
  const index = known.findIndex((item) => item === clean);
  return index >= 0 ? index : 0;
}

function buildBackendPodcasterCharacterPrompt({
  speakerLabel = "",
  speakerName = "",
  voiceName = "",
  genderGroup = "",
  expression = "Neutral",
  counterpartSpeakerName = "",
  contentMode = "podcast",
}) {
  const educational = String(contentMode || "").trim().toLowerCase() === "educational";
  const normalizedGenderGroup = String(genderGroup || "").trim().toLowerCase();
  const genderPrompt = normalizedGenderGroup.startsWith("masc")
    ? "El personaje debe ser inequívocamente un hombre adulto. Rostro claramente masculino y natural, sin androginia."
    : normalizedGenderGroup.startsWith("fem")
      ? "El personaje debe ser inequívocamente una mujer adulta. Rostro claramente femenino y natural, sin androginia."
      : "";
  return [
    `Personaje visual fijo para ${speakerName || speakerLabel || "el locutor"} (${speakerLabel || "Host"}).`,
    genderPrompt,
    voiceName ? `La voz base del personaje es ${voiceName}.` : "",
    `Expresión dominante actual: ${expression}.`,
    "Definir identidad consistente: facciones memorables, proporciones faciales estables, peinado reconocible, mirada segura, vestuario sobrio de locución premium.",
    "Evitar cambios de edad, etnia o complexión entre generaciones.",
    counterpartSpeakerName ? `${speakerName || speakerLabel} es un personaje distinto de ${counterpartSpeakerName}; no mezclar sus rostros, peinados, siluetas ni rasgos.` : "",
    educational
      ? "La imagen debe corresponder exactamente al personaje activo y no a otro personaje del video educativo."
      : "La imagen debe corresponder exactamente al locutor activo y no a otro host del podcast.",
    "No caricatura, no ilustración, no anime: retrato fotorealista de estudio.",
  ].filter(Boolean).join(" ");
}

function buildBackendPodcasterStudioScenePrompt({
  speakerLabel = "",
  speakerName = "",
  counterpartSpeakerName = "",
  scenarioPrompt = "",
  expression = "Neutral",
  singleSubjectOnly = false,
  contentMode = "podcast",
}) {
  const educational = String(contentMode || "").trim().toLowerCase() === "educational";
  const speakerIndex = normalizePodcasterSpeakerSlotIndex(speakerLabel);
  const stageZones = [
    "zona izquierda del escenario, cerca del micrófono principal izquierdo",
    "zona derecha del escenario, cerca del micrófono principal derecho",
    "zona central ligeramente al fondo, junto a la consola o mesa principal",
    "zona lateral secundaria con un ángulo alterno del mismo set",
  ];
  const eyelineDirections = [
    {
      bodyAngle: "cuerpo en tres cuartos orientado hacia la derecha del set",
      gaze: "mirada dirigida lateralmente hacia la derecha del set",
      cameraAngle: "cámara desde su lado izquierdo para evitar frontalidad total",
    },
    {
      bodyAngle: "cuerpo en tres cuartos orientado hacia la izquierda del set",
      gaze: "mirada dirigida lateralmente hacia la izquierda del set",
      cameraAngle: "cámara desde su lado derecho para evitar frontalidad total",
    },
    {
      bodyAngle: "cuerpo en tres cuartos orientado hacia el interlocutor principal",
      gaze: "mirada desviada hacia un punto fuera de cámara, nunca al lente",
      cameraAngle: "ángulo lateral suave para mantener una conversación creíble",
    },
    {
      bodyAngle: "cuerpo en tres cuartos con leve giro hacia el centro del set",
      gaze: "mirada hacia el centro conversacional del estudio, sin mirar al lente",
      cameraAngle: "ángulo alterno lateral para reforzar continuidad entre locutores",
    },
  ];
  const zoneLabel = stageZones[speakerIndex % stageZones.length];
  const eyelineDirection = eyelineDirections[speakerIndex % eyelineDirections.length];
  const cleanScenario = String(scenarioPrompt || "Cabina de radio premium").replace(/\s+/g, " ").trim() || "Cabina de radio premium";
  const lines = [
    educational
      ? `Escenario visual consistente para ${speakerName || speakerLabel || "el presentador"}.`
      : `Escenario de locución consistente para ${speakerName || speakerLabel || "el locutor"}.`,
    `Escenario obligatorio: ${cleanScenario}.`,
    educational
      ? "Convertir ese escenario en un set fotorealista de video educativo con apoyo visual claro, elementos didácticos sutiles, iluminación limpia y composición editorial."
      : "Convertir ese escenario en un set fotorealista de locución con tratamiento acústico visible, micrófono broadcast en brazo articulado, consola discreta y luz cinematográfica suave.",
    `Posición fija obligatoria dentro del set para ${speakerName || speakerLabel || "el locutor"}: ${zoneLabel}.`,
    educational
      ? "Importante: posicionar a cada personaje en una parte diferente del encuadre y ser consistente con ese ángulo."
      : "Importante: posicionar a cada Host en una parte diferente del escenario, y ser consistente con ese ángulo.",
    educational
      ? "Importante: en la escena solo debe aparecer el personaje correspondiente al plano."
      : "Importante: en la escena solo debe aparecer el locutor o host correspondiente al track.",
    `Bloqueo corporal obligatorio: ${eyelineDirection.bodyAngle}.`,
    `Eyeline obligatorio: ${eyelineDirection.gaze}.`,
    `Ángulo de cámara sugerido: ${eyelineDirection.cameraAngle}.`,
    "Evitar pose frontal de presentador y evitar contacto visual directo con la cámara.",
    "Mostrar un solo locutor claramente identificable en cuadro.",
    "Composición obligatoria de sujeto único: foreground y background limpios de personas.",
    "La cámara nunca debe convertirse en el interlocutor principal; mantener la atención del locutor en la conversación.",
    "Encuadre medio corto, cámara a la altura de los ojos, fondo elegante, profundidad de campo ligera.",
    `La puesta en escena debe acompañar una actitud ${expression}.`,
    "Mantener continuidad visual entre escenas: misma cabina, mismo set, misma dirección de luz, mismo estilo de vestuario.",
  ];
  if (singleSubjectOnly) {
    lines.push(
      "Retrato de sujeto único estricto: no agregar ninguna otra persona en el escenario.",
      "Prohibido segunda figura humana visible o parcial: no espalda, no hombro, no cabeza desenfocada, no perfil, no reflejo, no sombra humana.",
      educational
        ? "La imagen debe parecer un retrato editorial limpio del personaje activo dentro del set educativo."
        : "La imagen debe parecer un retrato editorial limpio del locutor activo dentro del set."
    );
  } else {
    lines.push(
      educational
        ? "La escena debe sentirse como explicación didáctica; el personaje atiende al contenido o a un recurso visual, no al espectador."
        : "La escena debe sentirse como conversación entre locutores; el personaje atiende al interlocutor, no al espectador.",
      counterpartSpeakerName
        ? educational
          ? "La mirada debe sugerir atención a un recurso o co-presentador fuera de cuadro, sin frontalidad directa."
          : `La mirada debe sugerir escucha activa hacia ${counterpartSpeakerName}, pero siempre con el interlocutor completamente fuera de cuadro.`
        : "",
      educational
        ? "Priorizar miradas laterales, reacción didáctica y microgestos que ayuden a explicar el contenido."
        : "Priorizar miradas laterales, reacción conversacional y microgestos que indiquen escucha activa entre locutores."
    );
  }
  return lines.filter(Boolean).join(" ");
}

async function loadOptionalImageReference({ storagePath = "", url = "", dataUrl = "" }) {
  const cleanStoragePath = clampText(storagePath || "", 700);
  const rawUrl = clampText(url || "", 3200);
  const cleanUrl = rawUrl.includes("%25") ? clampText(decodeURIComponent(rawUrl), 3200) : rawUrl;
  const cleanDataUrl = String(dataUrl || "").trim();
  let buffer = null;
  let mimeType = "image/png";
  if (cleanDataUrl) {
    try {
      const decoded = decodeBase64DataUrl(cleanDataUrl, MAX_SPEAKER_PORTRAIT_BYTES);
      buffer = Buffer.from(decoded.buffer);
      mimeType = String(decoded.mimeType || "image/png").trim().toLowerCase();
    } catch (_) {
      buffer = null;
    }
  }
  if (cleanStoragePath) {
    try {
      const bucket = admin.storage().bucket();
      const file = bucket.file(cleanStoragePath);
      const [meta] = await file.getMetadata().catch(() => [{}]);
      const [downloaded] = await file.download();
      buffer = Buffer.from(downloaded);
      mimeType = String(meta?.contentType || "image/png").trim().toLowerCase();
    } catch (_) {
      buffer = null;
    }
  }
  if (!buffer && cleanUrl) {
    const response = await fetch(cleanUrl, { method: "GET" }).catch(() => null);
    if (response?.ok) {
      mimeType = String(response.headers.get("content-type") || "image/png").trim().toLowerCase();
      buffer = Buffer.from(await response.arrayBuffer());
    }
  }
  if (!buffer || !buffer.length || !String(mimeType || "").startsWith("image/")) return null;
  return {
    buffer,
    mimeType
  };
}

async function loadScenarioReferenceFromSession({uid = "", sessionId = "", scenarioId = ""}) {
  const cleanSessionId = clampText(sessionId || "", 140);
  const cleanScenarioId = clampText(scenarioId || "", 80);
  if (!cleanSessionId) return null;
  try {
    const snap = await db.collection("podcaster_sessions").doc(cleanSessionId).get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    const ownerId = String(data.ownerId || "").trim();
    const sharedWithIds = Array.isArray(data.sharedWithIds) ? data.sharedWithIds.map((item) => String(item || "").trim()) : [];
    if (uid && ownerId && ownerId !== uid && !sharedWithIds.includes(uid)) return null;
    const session = data.session && typeof data.session === "object" ? data.session : null;
    const deck = session?.globalScenarioDeck && typeof session.globalScenarioDeck === "object" ? session.globalScenarioDeck : null;
    const items = Array.isArray(deck?.items) ? deck.items : [];
    const activeId = clampText(deck?.activeId || "", 80);
    const match = items.find((item) => {
      const itemId = clampText(item?.id || "", 80);
      if (cleanScenarioId) return itemId === cleanScenarioId;
      return itemId === activeId;
    }) || null;
    if (!match) return null;
    return loadOptionalImageReference({
      storagePath: clampText(match?.storagePath || "", 700),
      url: clampText(match?.downloadUrl || "", 3200),
    });
  } catch (_) {
    return null;
  }
}

async function forwardPodcasterSpeakerPortraitGenerate(req, res) {
  const uid = String(req.securityContext?.uid || "").trim();
  if (!uid) return res.status(401).json({error: "AUTH_REQUIRED"});
  const key = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
  if (!key) return res.status(500).json({error: "Falta GEMINI_API_KEY o GOOGLE_API_KEY."});
  const sessionId = clampText(req.body?.sessionId || "", 140);
  const speakerLabel = clampText(req.body?.speakerLabel || "", 80);
  const speakerName = clampText(req.body?.speakerName || "", 120) || speakerLabel || "Locutor";
  const voiceName = clampText(req.body?.voiceName || "", 80);
  const genderGroup = clampText(req.body?.genderGroup || "", 40);
  const expression = clampText(req.body?.expression || "Neutral", 80) || "Neutral";
  let scenarioPrompt = clampText(req.body?.scenarioPrompt || "", 2400);
  const scenarioId = clampText(req.body?.scenarioId || "", 80);
  const scenarioImageUrl = clampText(req.body?.scenarioImageUrl || "", 3200);
  const scenarioImageStoragePath = clampText(req.body?.scenarioImageStoragePath || "", 700);
  const regenerate = req.body?.regenerate === true;
  const previousStoragePath = clampText(req.body?.previousStoragePath || "", 700);
  const requestedCandidates = Array.isArray(req.body?.modelCandidates) ? req.body.modelCandidates : [];
  const imageModels = Array.from(new Set([
    sanitizeModel(req.body?.model || DEFAULT_PODCASTER_IMAGE_MODEL),
    ...requestedCandidates.map((item) => sanitizeModel(item || "")),
    ...PODCASTER_IMAGE_MODEL_CANDIDATES,
  ].filter(Boolean)));

  if (!sessionId) return res.status(400).json({error: "Falta sessionId."});
  if (!speakerLabel) return res.status(400).json({error: "Falta speakerLabel."});
  const normalizedGenderGroup = String(genderGroup || "").trim().toLowerCase();
  const genderMustLine = normalizedGenderGroup.startsWith("fem")
    ? "El sujeto debe ser inequívocamente una mujer adulta. English: adult female podcast host only."
    : normalizedGenderGroup.startsWith("masc")
      ? "El sujeto debe ser inequívocamente un hombre adulto. English: adult male podcast host only."
      : "";
  const genderAvoidLine = normalizedGenderGroup.startsWith("fem")
    ? "Prohibido: barba, bigote, sombra de barba, mandíbula excesivamente masculina, rasgos masculinos dominantes, apariencia andrógina."
    : normalizedGenderGroup.startsWith("masc")
      ? "Prohibido: rasgos femeninos dominantes, apariencia andrógina, maquillaje glamoroso o presentación femenina."
      : "";
  const characterPrompt = buildBackendPodcasterCharacterPrompt({
    speakerLabel,
    speakerName,
    voiceName,
    genderGroup,
    expression,
  });
  const studioScenePrompt = buildBackendPodcasterStudioScenePrompt({
    speakerLabel,
    speakerName,
    scenarioPrompt,
    expression,
    singleSubjectOnly: true,
  });
  const scenarioReference = await loadOptionalImageReference({
    storagePath: scenarioImageStoragePath,
    url: scenarioImageUrl,
  });
  const resolvedScenarioReference = scenarioReference || await loadScenarioReferenceFromSession({
    uid,
    sessionId,
    scenarioId,
  });

  const prompt = [
    "Edita la imagen de referencia para convertirla en un retrato fotorealista de un solo locutor dentro del mismo set.",
    resolvedScenarioReference ? "La imagen adjunta define el escenario real y tiene prioridad absoluta sobre cualquier otra instrucción." : "No hay imagen de referencia disponible; recrear el escenario solo a partir del prompt textual seleccionado.",
    resolvedScenarioReference ? "Conservar exactamente la arquitectura, fondo, materiales, distribución, iluminación base y ángulo del escenario de la imagen adjunta." : "Recrear de forma consistente la arquitectura, fondo, materiales, distribución e iluminación del escenario descrito.",
    "No inventar ni sustituir otra cabina, fondo o composición global.",
    `Nombre del locutor: ${speakerName}.`,
    `Etiqueta de locutor: ${speakerLabel}.`,
    scenarioId ? `Escenario seleccionado: ${scenarioId}.` : "",
    voiceName ? `Voz de referencia: ${voiceName}.` : "",
    genderGroup ? `Presentación de género objetivo: ${genderGroup}.` : "",
    genderMustLine,
    genderAvoidLine,
    `Expresion: ${expression}.`,
    characterPrompt ? `Prompt de personaje obligatorio: ${characterPrompt}` : "",
    studioScenePrompt ? `Escenario de locución obligatorio: ${studioScenePrompt}` : "",
    "Insertar solo al locutor activo dentro del set ya existente.",
    "Retrato en tres cuartos o semi perfil natural, evitando frontalidad total y evitando contacto visual directo con la cámara.",
    "Plano medio corto, enfoque en rostro, sin texto, sin logotipos, sin marcas de agua.",
    "Estilo hiperrealista, piel natural, alta definición.",
  ].filter(Boolean).join("\n");

  let lastStatus = 502;
  let lastError = "No se pudo generar retrato con los modelos disponibles.";
  let base64 = "";
  let mimeType = "image/png";
  let resolvedModel = imageModels[0] || DEFAULT_PODCASTER_IMAGE_MODEL;
  for (const imageModel of imageModels) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(imageModel)}:generateContent?key=${encodeURIComponent(key)}`;
    const requestWithOptionalReference = async (includeScenarioReference) => {
      const upstream = await fetch(endpoint, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              {text: prompt},
              ...(includeScenarioReference && resolvedScenarioReference ? [{
                inlineData: {
                  mimeType: resolvedScenarioReference.mimeType,
                  data: resolvedScenarioReference.buffer.toString("base64"),
                }
              }] : [])
            ]
          }],
          generationConfig: {responseModalities: ["TEXT", "IMAGE"]},
        }),
      });
      const data = await upstream.json().catch(() => ({}));
      return {upstream, data};
    };
    let {upstream, data} = await requestWithOptionalReference(true);
    if (!upstream.ok && upstream.status === 400 && resolvedScenarioReference) {
      ({upstream, data} = await requestWithOptionalReference(false));
    }
    if (!upstream.ok) {
      const detail = String(data?.error?.message || data?.error || `HTTP ${upstream.status}`).trim();
      lastStatus = Number(upstream.status || 502);
      lastError = `${imageModel}: ${detail}`;
      if ([400, 401, 403, 404].includes(lastStatus)) continue;
      return res.status(lastStatus).json(data);
    }
    const parts = Array.isArray(data?.candidates?.[0]?.content?.parts) ? data.candidates[0].content.parts : [];
    const inline = parts.find((part) => part?.inlineData?.data || part?.inline_data?.data) || null;
    base64 = String(inline?.inlineData?.data || inline?.inline_data?.data || "").trim();
    mimeType = String(inline?.inlineData?.mimeType || inline?.inline_data?.mimeType || "image/png").trim() || "image/png";
    if (!base64) {
      lastStatus = 502;
      lastError = `${imageModel}: sin inlineData de imagen`;
      continue;
    }
    resolvedModel = imageModel;
    break;
  }
  if (!base64) return res.status(lastStatus >= 400 ? lastStatus : 502).json({error: lastError});
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length || buffer.length > MAX_SPEAKER_PORTRAIT_BYTES) {
    return res.status(413).json({error: "La imagen generada excede el tamaño permitido."});
  }
  const ext = getScreenshotExtension(mimeType);
  const sessionSlug = normalizeStorageSegment(sessionId, "session");
  const speakerSlug = normalizeStorageSegment(speakerLabel, "speaker");
  const storagePath = `podcaster/sessions/${sessionSlug}/owners/${normalizeStorageSegment(uid, "anon")}/speakers/${speakerSlug}/${randomUUID()}.${ext}`;
  const bucket = admin.storage().bucket();
  const asset = await uploadScreenshotAsset({
    bucket,
    path: storagePath,
    buffer,
    mimeType,
    metadata: {uid, sessionId, speakerLabel, speakerName, voiceName, genderGroup, expression, scenarioId, scenarioImageUrl, scenarioImageStoragePath, model: resolvedModel},
  });
  if (regenerate && previousStoragePath && previousStoragePath !== storagePath) {
    await deleteStoragePath(bucket, previousStoragePath).catch(() => {});
  }
  return res.status(200).json({
    ok: true,
    portrait: {
      speaker: speakerLabel,
      downloadUrl: asset.downloadUrl,
      storagePath: asset.path,
      voiceName,
      genderGroup,
      expression,
      scenarioPrompt,
      scenarioId,
      scenarioImageUrl,
      scenarioImageStoragePath,
      mimeType,
      model: resolvedModel,
      promptVersion: "podcaster_v1",
      updatedAt: new Date().toISOString(),
    },
  });
}

async function forwardPodcasterScenarioImageGenerate(req, res) {
  const uid = String(req.securityContext?.uid || "").trim();
  if (!uid) return res.status(401).json({error: "AUTH_REQUIRED"});
  const key = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
  if (!key) return res.status(500).json({error: "Falta GEMINI_API_KEY o GOOGLE_API_KEY."});
  const sessionId = clampText(req.body?.sessionId || "", 140);
  const scenarioId = clampText(req.body?.scenarioId || "", 80);
  const title = clampText(req.body?.title || "Escenario", 120) || "Escenario";
  const promptSource = clampText(req.body?.prompt || "", 4000);
  const regenerate = req.body?.regenerate === true;
  const previousStoragePath = clampText(req.body?.previousStoragePath || "", 700);
  const requestedCandidates = Array.isArray(req.body?.modelCandidates) ? req.body.modelCandidates : [];
  const imageModels = Array.from(new Set([
    sanitizeModel(req.body?.model || DEFAULT_PODCASTER_IMAGE_MODEL),
    ...requestedCandidates.map((item) => sanitizeModel(item || "")),
    ...PODCASTER_IMAGE_MODEL_CANDIDATES,
  ].filter(Boolean)));

  if (!sessionId) return res.status(400).json({error: "Falta sessionId."});
  if (!scenarioId) return res.status(400).json({error: "Falta scenarioId."});
  if (!promptSource) return res.status(400).json({error: "Falta prompt del escenario."});

  const prompt = [
    "Genera una imagen fotorealista de un escenario de podcast profesional.",
    `Escenario: ${title}.`,
    `Prompt base obligatorio: ${promptSource}`,
    "Debe ser un set vacío, sin personas.",
    "Debe verse como una cabina de grabación o estudio editorial premium para podcast/video podcast.",
    "Incluir elementos reales del set: micrófono broadcast, consola o mixer, monitores, iluminación cinematográfica suave, detalles acústicos visibles.",
    "Composición horizontal 16:9, lista para usarse como escenario visual de videos.",
    "Sin texto, sin tipografía, sin logos, sin marcas de agua, sin interfaz.",
    "Estilo hiperrealista, alta definición, profundidad de campo natural.",
  ].join("\n");

  let lastStatus = 502;
  let lastError = "No se pudo generar imagen del escenario con los modelos disponibles.";
  let base64 = "";
  let mimeType = "image/png";
  let resolvedModel = imageModels[0] || DEFAULT_PODCASTER_IMAGE_MODEL;
  for (const imageModel of imageModels) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(imageModel)}:generateContent?key=${encodeURIComponent(key)}`;
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        contents: [{role: "user", parts: [{text: prompt}]}],
        generationConfig: {responseModalities: ["TEXT", "IMAGE"]},
      }),
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const detail = String(data?.error?.message || data?.error || `HTTP ${upstream.status}`).trim();
      lastStatus = Number(upstream.status || 502);
      lastError = `${imageModel}: ${detail}`;
      if ([400, 401, 403, 404].includes(lastStatus)) continue;
      return res.status(lastStatus).json(data);
    }
    const parts = Array.isArray(data?.candidates?.[0]?.content?.parts) ? data.candidates[0].content.parts : [];
    const inline = parts.find((part) => part?.inlineData?.data || part?.inline_data?.data) || null;
    base64 = String(inline?.inlineData?.data || inline?.inline_data?.data || "").trim();
    mimeType = String(inline?.inlineData?.mimeType || inline?.inline_data?.mimeType || "image/png").trim() || "image/png";
    if (!base64) {
      lastStatus = 502;
      lastError = `${imageModel}: sin inlineData de imagen`;
      continue;
    }
    resolvedModel = imageModel;
    break;
  }
  if (!base64) return res.status(lastStatus >= 400 ? lastStatus : 502).json({error: lastError});
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length || buffer.length > MAX_SPEAKER_PORTRAIT_BYTES) {
    return res.status(413).json({error: "La imagen generada del escenario excede el tamaño permitido."});
  }
  const ext = getScreenshotExtension(mimeType);
  const sessionSlug = normalizeStorageSegment(sessionId, "session");
  const scenarioSlug = normalizeStorageSegment(scenarioId, "scenario");
  const storagePath = `podcaster/sessions/${sessionSlug}/owners/${normalizeStorageSegment(uid, "anon")}/scenarios/${scenarioSlug}/${randomUUID()}.${ext}`;
  const bucket = admin.storage().bucket();
  const asset = await uploadScreenshotAsset({
    bucket,
    path: storagePath,
    buffer,
    mimeType,
    metadata: {uid, sessionId, scenarioId, title, model: resolvedModel},
  });
  if (regenerate && previousStoragePath && previousStoragePath !== storagePath) {
    await deleteStoragePath(bucket, previousStoragePath).catch(() => {});
  }
  return res.status(200).json({
    ok: true,
    image: {
      id: scenarioId,
      title,
      downloadUrl: asset.downloadUrl,
      storagePath: asset.path,
      mimeType,
      model: resolvedModel,
      updatedAt: new Date().toISOString(),
    },
  });
}

async function forwardMoodleModuleGraphicGenerate(req, res) {
  const uid = String(req.securityContext?.uid || "").trim();
  if (!uid) return res.status(401).json({error: "AUTH_REQUIRED"});
  const key = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
  if (!key) return res.status(500).json({error: "Falta GEMINI_API_KEY o GOOGLE_API_KEY."});

  const courseId = clampText(req.body?.courseId || "", 180);
  const moduleId = clampText(req.body?.moduleId || "", 180);
  const moduleType = clampText(req.body?.moduleType || "", 80) || "Modulo";
  const moduleName = clampText(req.body?.moduleName || "Grafico educativo", 180) || "Grafico educativo";
  const languageCode = clampText(req.body?.languageCode || "", 24).toLowerCase();
  const instructions = stripHtmlToPlain(clampText(req.body?.instructions || "", 8000));
  const content = stripHtmlToPlain(clampText(req.body?.content || "", 12000));
  const regenerate = req.body?.regenerate === true;
  const previousStoragePath = clampText(req.body?.previousStoragePath || "", 700);
  const requestedCandidates = Array.isArray(req.body?.modelCandidates) ? req.body.modelCandidates : [];
  const imageModels = Array.from(new Set([
    sanitizeModel(req.body?.model || DEFAULT_PODCASTER_IMAGE_MODEL),
    ...requestedCandidates.map((item) => sanitizeModel(item || "")),
    ...PODCASTER_IMAGE_MODEL_CANDIDATES,
  ].filter(Boolean)));

  if (!courseId) return res.status(400).json({error: "Falta courseId."});
  if (!moduleId) return res.status(400).json({error: "Falta moduleId."});
  if (!instructions && !content) return res.status(400).json({error: "Falta contexto textual del modulo."});

  const languageLabel = languageCode.startsWith("en") ? "english" : "espanol";
  const prompt = [
    "Genera una sola imagen o grafico educativo editorial para acompanar un modulo escolar digital.",
    `Titulo del modulo: ${moduleName}.`,
    `Tipo de modulo: ${moduleType}.`,
    `Idioma principal del modulo: ${languageLabel}.`,
    instructions ? `Instrucciones del autor: ${instructions}` : "",
    content ? `Contenido final del modulo: ${content}` : "",
    "La imagen debe ser coherente con el tema y servir como apoyo visual comun para responder las actividades.",
    "Debe verse clara, didactica, moderna y lista para una plataforma educativa.",
    "Debe resolverse como una sola pieza editorial integrada: infografia, diagrama explicativo, esquema visual o grafico conceptual unificado.",
    "NO conviertas cada actividad o pregunta en una tarjeta, panel, bloque o mini-infografia separada.",
    "NO escribas 'Actividad 1', 'Actividad 2', 'Pregunta 1', 'Pregunta 2' ni variantes similares dentro de la imagen.",
    "NO hagas mapas mentales con ramas que representen actividades individuales del modulo.",
    "La imagen debe sintetizar conceptos, relaciones, pasos, referencias o contexto util para resolver las actividades como un solo grafico de apoyo.",
    "No incluyas interfaz, capturas de pantalla, marcas de agua, logos ni texto largo incrustado.",
    "Si necesitas rotulos, usa solo etiquetas minimas y claras.",
    "Composicion horizontal o cuadrada, alta definicion, fondo limpio y contraste legible.",
    "La imagen debe poder introducir consignas como 'Analiza la imagen anterior y responde'.",
    "Evita cuatro o cinco subgraficos independientes; prioriza una sola narrativa visual coherente.",
  ].filter(Boolean).join("\n");

  let lastStatus = 502;
  let lastError = "No se pudo generar el grafico del modulo con los modelos disponibles.";
  let base64 = "";
  let mimeType = "image/png";
  let resolvedModel = imageModels[0] || DEFAULT_PODCASTER_IMAGE_MODEL;
  for (const imageModel of imageModels) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(imageModel)}:generateContent?key=${encodeURIComponent(key)}`;
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        contents: [{role: "user", parts: [{text: prompt}]}],
        generationConfig: {responseModalities: ["TEXT", "IMAGE"]},
      }),
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const detail = String(data?.error?.message || data?.error || `HTTP ${upstream.status}`).trim();
      lastStatus = Number(upstream.status || 502);
      lastError = `${imageModel}: ${detail}`;
      if ([400, 401, 403, 404].includes(lastStatus)) continue;
      return res.status(lastStatus).json(data);
    }
    const parts = Array.isArray(data?.candidates?.[0]?.content?.parts) ? data.candidates[0].content.parts : [];
    const inline = parts.find((part) => part?.inlineData?.data || part?.inline_data?.data) || null;
    base64 = String(inline?.inlineData?.data || inline?.inline_data?.data || "").trim();
    mimeType = String(inline?.inlineData?.mimeType || inline?.inline_data?.mimeType || "image/png").trim() || "image/png";
    if (!base64) {
      lastStatus = 502;
      lastError = `${imageModel}: sin inlineData de imagen`;
      continue;
    }
    resolvedModel = imageModel;
    break;
  }
  if (!base64) return res.status(lastStatus >= 400 ? lastStatus : 502).json({error: lastError});

  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length || buffer.length > MAX_SPEAKER_PORTRAIT_BYTES) {
    return res.status(413).json({error: "La imagen generada del modulo excede el tamano permitido."});
  }

  const ext = getScreenshotExtension(mimeType);
  const storagePath = `moodle/courses/${normalizeStorageSegment(courseId, "course")}/owners/${normalizeStorageSegment(uid, "anon")}/modules/${normalizeStorageSegment(moduleId, "module")}/graphics/${randomUUID()}.${ext}`;
  const bucket = admin.storage().bucket();
  const asset = await uploadScreenshotAsset({
    bucket,
    path: storagePath,
    buffer,
    mimeType,
    metadata: {uid, courseId, moduleId, moduleType, moduleName, model: resolvedModel, promptVersion: "moodle_graphic_v1"},
  });
  if (regenerate && previousStoragePath && previousStoragePath !== storagePath) {
    await deleteStoragePath(bucket, previousStoragePath).catch(() => {});
  }
  return res.status(200).json({
    ok: true,
    image: {
      courseId,
      moduleId,
      title: moduleName,
      downloadUrl: asset.downloadUrl,
      storagePath: asset.path,
      mimeType,
      model: resolvedModel,
      promptVersion: "moodle_graphic_v1",
      updatedAt: new Date().toISOString(),
    },
  });
}

async function forwardMoodleModuleGraphicGenerateElement(req, res) {
  const uid = String(req.securityContext?.uid || "").trim();
  if (!uid) return res.status(401).json({error: "AUTH_REQUIRED"});
  const key = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
  if (!key) return res.status(500).json({error: "Falta GEMINI_API_KEY o GOOGLE_API_KEY."});

  const courseId = clampText(req.body?.courseId || "", 180);
  const moduleId = clampText(req.body?.moduleId || "", 180);
  const moduleType = clampText(req.body?.moduleType || "", 80) || "Modulo";
  const moduleName = clampText(req.body?.moduleName || "Grafico educativo", 180) || "Grafico educativo";
  const languageCode = clampText(req.body?.languageCode || "", 24).toLowerCase();
  const instructions = stripHtmlToPlain(clampText(req.body?.instructions || "", 8000));
  const content = stripHtmlToPlain(clampText(req.body?.content || "", 12000));
  const elementId = normalizeStorageSegment(req.body?.elementId || "element", "element");
  const elementLabel = clampText(req.body?.elementLabel || "Elemento", 120) || "Elemento";
  const elementPrompt = clampText(req.body?.elementPrompt || "", 2400);
  const previousStoragePath = clampText(req.body?.previousStoragePath || "", 700);
  const regenerate = req.body?.regenerate === true;
  const requestedCandidates = Array.isArray(req.body?.modelCandidates) ? req.body.modelCandidates : [];
  const imageModels = Array.from(new Set([
    sanitizeModel(req.body?.model || DEFAULT_PODCASTER_IMAGE_MODEL),
    ...requestedCandidates.map((item) => sanitizeModel(item || "")),
    ...PODCASTER_IMAGE_MODEL_CANDIDATES,
  ].filter(Boolean)));

  if (!courseId) return res.status(400).json({error: "Falta courseId."});
  if (!moduleId) return res.status(400).json({error: "Falta moduleId."});
  if (!elementPrompt) return res.status(400).json({error: "Falta elementPrompt."});

  const languageLabel = languageCode.startsWith("en") ? "english" : "espanol";
  const contextBlock = [instructions, content].filter(Boolean).join(" ").toLowerCase();
  const isMath = /recta|numero|número|algebra|ecuacion|ecuación|fraccion|fracción|operacion|operación|lobby|piso|positivo|negativo/.test(contextBlock);
  const isLanguage = /language|grammar|vocabulary|prefijo|sufijo|word formation|clil|lenguaje/.test(contextBlock);
  const isScience = /science|cientifico|científico|proceso|experimento|energia|energía|ecosistema/.test(contextBlock);
  const styleDirective = isMath
    ? "Estilo: infografía matemática vectorial, íconos geométricos, claridad didáctica."
    : (isLanguage
      ? "Estilo: gráfico editorial de lenguaje, iconografía semántica y visual limpio."
      : (isScience
        ? "Estilo: infografía científica clara con iconos técnicos y jerarquía visual."
        : "Estilo: gráfico educativo editorial limpio, moderno y pedagógico."));
  const prompt = [
    "=== SYSTEM ART DIRECTION FOR LAYERED EDUCATIONAL GRAPHICS ===",
    "Produce exactly ONE isolated visual asset for a layered composition workflow.",
    `Module: ${moduleName} (${moduleType}).`,
    `Primary language: ${languageLabel}.`,
    `Target element: ${elementLabel}.`,
    styleDirective,
    "",
    "=== AUTHOR CONTEXT ===",
    instructions ? `Author instructions: ${instructions}` : "",
    content ? `Module content context: ${content}` : "",
    `Element brief: ${elementPrompt}.`,
    "",
    "=== HARD CONSTRAINTS (MANDATORY) ===",
    "1) Transparent background only (real alpha channel).",
    "2) No canvas/card/backdrop/checkerboard simulation.",
    "3) No text, no typography, no numbers, no labels, no logos, no watermark, no UI.",
    "4) The asset must contain only the target object(s) needed for this element.",
    "5) Clean silhouette cutout, high edge quality, no halo artifacts.",
    "6) Not a full scene; avoid room/studio/landscape backgrounds.",
    "",
    "=== COMPOSITION + READABILITY ===",
    "Single focal subject with strong shape readability.",
    "Educational clarity first: recognizable in under 2 seconds.",
    "High contrast and balanced palette suitable for school content.",
    "No clutter, no decorative noise.",
    "",
    "=== NEGATIVE PROMPT ===",
    "forbidden: text overlays, letterforms, digits, subtitles, captions, infoboxes, app chrome, posters, signs, mockup frames.",
    "forbidden: photoreal studio set, cinematic room shot, podcast booth, unrelated characters.",
  ].filter(Boolean).join("\n");

  let lastStatus = 502;
  let lastError = "No se pudo generar el elemento gráfico.";
  let base64 = "";
  let mimeType = "image/png";
  let resolvedModel = imageModels[0] || DEFAULT_PODCASTER_IMAGE_MODEL;
  for (const imageModel of imageModels) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(imageModel)}:generateContent?key=${encodeURIComponent(key)}`;
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        contents: [{role: "user", parts: [{text: prompt}]}],
        generationConfig: {responseModalities: ["TEXT", "IMAGE"]},
      }),
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const detail = String(data?.error?.message || data?.error || `HTTP ${upstream.status}`).trim();
      lastStatus = Number(upstream.status || 502);
      lastError = `${imageModel}: ${detail}`;
      if ([400, 401, 403, 404].includes(lastStatus)) continue;
      return res.status(lastStatus).json(data);
    }
    const parts = Array.isArray(data?.candidates?.[0]?.content?.parts) ? data.candidates[0].content.parts : [];
    const inline = parts.find((part) => part?.inlineData?.data || part?.inline_data?.data) || null;
    base64 = String(inline?.inlineData?.data || inline?.inline_data?.data || "").trim();
    mimeType = String(inline?.inlineData?.mimeType || inline?.inline_data?.mimeType || "image/png").trim() || "image/png";
    if (!base64) {
      lastStatus = 502;
      lastError = `${imageModel}: sin inlineData de imagen`;
      continue;
    }
    resolvedModel = imageModel;
    break;
  }
  if (!base64) return res.status(lastStatus >= 400 ? lastStatus : 502).json({error: lastError});

  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length || buffer.length > MAX_SPEAKER_PORTRAIT_BYTES) {
    return res.status(413).json({error: "La imagen generada del elemento excede el tamaño permitido."});
  }

  const ext = getScreenshotExtension(mimeType);
  const storagePath = `moodle/courses/${normalizeStorageSegment(courseId, "course")}/owners/${normalizeStorageSegment(uid, "anon")}/modules/${normalizeStorageSegment(moduleId, "module")}/graphics/elements/${elementId}-${randomUUID()}.${ext}`;
  const bucket = admin.storage().bucket();
  const asset = await uploadScreenshotAsset({
    bucket,
    path: storagePath,
    buffer,
    mimeType,
    metadata: {
      uid,
      courseId,
      moduleId,
      moduleType,
      moduleName,
      elementId,
      elementLabel,
      model: resolvedModel,
      promptVersion: "moodle_graphic_element_v2",
    },
  });
  if (regenerate && previousStoragePath && previousStoragePath !== storagePath) {
    await deleteStoragePath(bucket, previousStoragePath).catch(() => {});
  }
  return res.status(200).json({
    ok: true,
    image: {
      courseId,
      moduleId,
      elementId,
      elementLabel,
      downloadUrl: asset.downloadUrl,
      storagePath: asset.path,
      mimeType,
      model: resolvedModel,
      promptVersion: "moodle_graphic_element_v2",
      updatedAt: new Date().toISOString(),
    },
  });
}

async function forwardMoodleModuleGraphicAnalyzeElement(req, res) {
  const uid = String(req.securityContext?.uid || "").trim();
  if (!uid) return res.status(401).json({error: "AUTH_REQUIRED"});
  const key = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
  if (!key) return res.status(500).json({error: "Falta GEMINI_API_KEY o GOOGLE_API_KEY."});

  const imageUrl = clampText(req.body?.imageUrl || "", 3200);
  const moduleName = clampText(req.body?.moduleName || "Modulo", 180) || "Modulo";
  const moduleType = clampText(req.body?.moduleType || "Modulo", 80) || "Modulo";
  const elementLabel = clampText(req.body?.elementLabel || "Elemento", 120) || "Elemento";
  const elementPrompt = clampText(req.body?.elementPrompt || "", 2400);

  if (!imageUrl) return res.status(400).json({error: "Falta imageUrl."});
  const image = await fetchImageBytesWithMime(imageUrl);
  const prompt = [
    "Evalúa la calidad de una capa gráfica para composición educativa por capas.",
    `Modulo: ${moduleName} (${moduleType}).`,
    `Elemento objetivo: ${elementLabel}.`,
    elementPrompt ? `Prompt esperado: ${elementPrompt}.` : "",
    "Devuelve SOLO JSON válido con esta estructura:",
    "{",
    '  "score": 0-100,',
    '  "isTransparentBackgroundLikely": true|false,',
    '  "matchesTarget": true|false,',
    '  "issues": ["string"],',
    '  "recommendation": "accept|regenerate"',
    "}",
    "Evalúa si parece fondo transparente real (sin lienzo visible ni patrón),",
    "si el elemento corresponde al objetivo y si está limpio para superposición.",
  ].join("\n");
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent("gemini-2.5-flash")}:generateContent?key=${encodeURIComponent(key)}`;
  const upstream = await fetch(endpoint, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [
          {text: prompt},
          {inline_data: {mime_type: image.mimeType, data: image.buffer.toString("base64")}},
        ],
      }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    }),
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const detail = String(data?.error?.message || data?.error || `HTTP ${upstream.status}`).trim();
    return res.status(upstream.status >= 500 ? 502 : upstream.status).json({error: detail || "No se pudo analizar la capa."});
  }
  const text = String(data?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
  const parsed = parseJsonObjectFromModelText(text);
  const score = clampNumber(parsed?.score, 0, 100, 0);
  const recommendation = String(parsed?.recommendation || "").trim().toLowerCase() === "accept" ? "accept" : "regenerate";
  return res.status(200).json({
    ok: true,
    analysis: {
      score,
      isTransparentBackgroundLikely: parsed?.isTransparentBackgroundLikely === true,
      matchesTarget: parsed?.matchesTarget === true,
      issues: Array.isArray(parsed?.issues) ? parsed.issues.map((item) => clampText(item, 200)).filter(Boolean).slice(0, 6) : [],
      recommendation,
    },
  });
}

async function forwardPodcasterDialogueVideoGenerate(req, res) {
  const uid = String(req.securityContext?.uid || "").trim();
  if (!uid) return res.status(401).json({error: "AUTH_REQUIRED"});
  const key = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
  if (!key) return res.status(500).json({error: "Falta GEMINI_API_KEY o GOOGLE_API_KEY."});

  const sessionId = clampText(req.body?.sessionId || "", 140);
  const rowId = clampText(req.body?.rowId || "", 120);
  const speakerLabel = clampText(req.body?.speakerLabel || "", 80);
  const speakerName = clampText(req.body?.speakerName || "", 120) || speakerLabel || "Locutor";
  const counterpartSpeakerLabel = clampText(req.body?.counterpartSpeakerLabel || "", 80);
  const counterpartSpeakerName = clampText(req.body?.counterpartSpeakerName || "", 120) || counterpartSpeakerLabel;
  const voiceName = clampText(req.body?.voiceName || "", 80);
  const genderGroup = clampText(req.body?.genderGroup || "", 40);
  const expression = clampText(req.body?.expression || "Neutral", 80) || "Neutral";
  const promptProfile = clampText(req.body?.promptProfile || "", 80);
  let scenarioPrompt = clampText(req.body?.scenarioPrompt || "", 2400);
  const sceneDescription = clampText(req.body?.sceneDescription || "", 1600);
  const visualNotes = clampText(req.body?.visualNotes || "", 2200);
  const onScreenText = clampText(req.body?.onScreenText || "", 1200);
  const transition = clampText(req.body?.transition || "", 1200);
  const videoDirective = clampText(req.body?.videoDirective || "", 1400);
  const scenePrompt = clampText(req.body?.scenePrompt || "", 1200);
  const contentMode = String(req.body?.contentMode || "").trim().toLowerCase();
  const educationalVideo = req.body?.educationalVideo === true || req.body?.videoMode === true || contentMode === "educational";
  const rewriteScenarioPromptForEducationalVideo = (prompt = "") => {
    const text = String(prompt || "").replace(/\s+/g, " ").trim();
    if (!text) return "";
    const rewritten = text
      .replace(/\bcabina premium de podcast\b/gi, "entorno visual educativo premium")
      .replace(/\bcabina de podcast\b/gi, "entorno visual educativo premium")
      .replace(/\bcabina premium de radio\b/gi, "entorno visual educativo premium")
      .replace(/\bcabina de radio\b/gi, "entorno visual educativo premium")
      .replace(/\bestudio editorial premium para podcast\/video podcast\b/gi, "entorno editorial educativo premium")
      .replace(/\bestudio (?:premium )?de podcast\b/gi, "entorno visual educativo premium")
      .replace(/\bestudio (?:premium )?de radio\b/gi, "entorno visual educativo premium")
      .replace(/\bestudio (?:premium )?de grabaci[oó]n\b/gi, "entorno visual educativo premium")
      .replace(/\bpodcast\/video podcast\b/gi, "video educativo")
      .replace(/\bpodcast\b/gi, "video educativo")
      .replace(/\bradio\b/gi, "educación");
    const lower = rewritten.toLowerCase();
    const hasBooth = /\bcabina\b/.test(lower) || /\bestudio\b/.test(lower) || /\bmicr[oó]fono\b/.test(lower);
    return hasBooth ? "Entorno visual educativo premium (aula moderna, laboratorio o set didáctico)." : rewritten;
  };
  if (educationalVideo) {
    scenarioPrompt = rewriteScenarioPromptForEducationalVideo(scenarioPrompt);
  }
  const imagePrompts = Array.isArray(req.body?.imagePrompts)
    ? req.body.imagePrompts.slice(0, 3).map((prompt) => clampText(prompt || "", 1200)).filter(Boolean)
    : String(req.body?.imagePrompts || "")
      .split(/\n+/)
      .map((prompt) => clampText(prompt || "", 1200))
      .filter(Boolean)
      .slice(0, 3);
  const performanceDirective = clampText(req.body?.performanceDirective || "", 1800);
  const originalText = clampText(req.body?.originalText || "", 1600);
  const targetSpeechLine = clampText(req.body?.targetSpeechLine || req.body?.text || "", 1600);
  const text = targetSpeechLine || clampText(req.body?.text || "", 1600);
  const referenceMode = String(req.body?.referenceMode || "image").trim().toLowerCase() === "video" ? "video" : "image";
  const referenceImageDataUrls = referenceMode === "image" && Array.isArray(req.body?.referenceImageDataUrls)
    ? req.body.referenceImageDataUrls.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 4)
    : [];
  const referenceImageNames = referenceMode === "image" && Array.isArray(req.body?.referenceImageNames)
    ? req.body.referenceImageNames.map((item) => clampText(item || "", 180)).filter(Boolean).slice(0, 4)
    : [];
  const referenceImageDataUrl = referenceMode === "image" ? String(req.body?.referenceImageDataUrl || "").trim() : "";
  const referenceImageName = clampText(req.body?.referenceImageName || "", 180);
  const referenceVideoDataUrl = referenceMode === "video" ? String(req.body?.referenceVideoDataUrl || "").trim() : "";
  const referenceVideoName = clampText(req.body?.referenceVideoName || "", 180);
  const referenceVideoMimeType = clampText(req.body?.referenceVideoMimeType || "video/mp4", 120) || "video/mp4";
  const continuityReferenceImageDataUrl = String(req.body?.continuityReferenceImageDataUrl || "").trim();
  const explicitForceImmediateSceneChange = req.body?.forceImmediateSceneChange === true;
  const dialogueAudioUrl = clampText(req.body?.dialogueAudioUrl || "", 3200);
  const dialogueAudioStoragePath = clampText(req.body?.dialogueAudioStoragePath || "", 700);
  const audioDurationSecInput = clampNumber(req.body?.audioDurationSec, 0, 180, 0);
  const requestedDurationSecInput = clampNumber(req.body?.requestedDurationSec, 4, 8, 0);
  const portraitUrl = clampText(req.body?.portraitUrl || "", 3200);
  const portraitStoragePath = clampText(req.body?.portraitStoragePath || "", 700);
  const previousSceneRaw = req.body?.previousScene && typeof req.body.previousScene === "object" ? req.body.previousScene : null;
  const previousScene = previousSceneRaw ? {
    rowId: clampText(previousSceneRaw?.rowId || "", 120),
    sceneNumber: clampNumber(previousSceneRaw?.sceneNumber, 0, 999, 0),
    speakerLabel: clampText(previousSceneRaw?.speakerLabel || "", 80),
    speakerName: clampText(previousSceneRaw?.speakerName || "", 120),
    expression: clampText(previousSceneRaw?.expression || "Neutral", 80) || "Neutral",
    text: clampText(previousSceneRaw?.text || "", 1600),
    targetSpeechLine: clampText(previousSceneRaw?.targetSpeechLine || "", 1600),
    previousVideoTargetSpeechLine: clampText(previousSceneRaw?.previousVideoTargetSpeechLine || "", 1600),
    hasVideo: previousSceneRaw?.hasVideo === true,
  } : null;
  let strictIdentity = req.body?.strictIdentity !== false;
  const regenerate = req.body?.regenerate === true;
  const previousStoragePath = clampText(req.body?.previousStoragePath || "", 700);
  const requestedCandidates = Array.isArray(req.body?.modelCandidates) ? req.body.modelCandidates : [];
  const requestedModel = sanitizeModel(req.body?.model || DEFAULT_PODCASTER_VIDEO_MODEL);
  const mergedModels = Array.from(new Set([
    requestedModel,
    ...requestedCandidates.map((item) => sanitizeModel(item || "")),
    ...PODCASTER_VIDEO_MODEL_CANDIDATES,
  ].filter(Boolean)));
  const filteredModels = strictIdentity
    ? mergedModels.filter((modelName) => !/fast/i.test(String(modelName || "")))
    : mergedModels;
  const videoModels = filteredModels.length ? filteredModels : [DEFAULT_PODCASTER_VIDEO_MODEL];
  const requestDebugTag = `dialogue-video:${sessionId || "no-session"}:${rowId || "no-row"}`;

  const shouldForceImmediateSceneChange = (source = "") => {
    const text = String(source || "").toLowerCase();
    if (!text) return false;
    if (/\b(hard cut|jump cut|match cut)\b/.test(text)) return true;
    if (/\bmontaje\b/.test(text) && (/\br[aá]pid/.test(text) || /\bdin[aá]mic/.test(text))) return true;
    if (/\btransici[oó]n\b/.test(text) && (/\br[aá]pid/.test(text) || /\binmedi/.test(text))) return true;
    if (/\bcorte\b/.test(text) && (/\br[aá]pid/.test(text) || /\binmedi/.test(text) || /\bal inicio\b/.test(text))) return true;
    if (/\bcorte a\b/.test(text) || /\bluego[, ]+un corte\b/.test(text) || /\btransici[oó]n r[aá]pida\b/.test(text)) return true;
    if (/\b(cambio|cambiar|cambie|cambia|transici[oó]n|corte|cortar|salto)\b/.test(text) && /\b(inmedi|de inmediato|ya|al instante|al inicio|desde el inicio)\b/.test(text)) {
      return true;
    }
    if (/\b(cambia|cambie|cambiar)\b/.test(text) && /\b(escena|set|entorno|plano|composici[oó]n|visual)\b/.test(text)) {
      return true;
    }
    return false;
  };
  const forceImmediateChange = Boolean(req.body?.relateWithPreviousScene === true) && (explicitForceImmediateSceneChange || shouldForceImmediateSceneChange([
    scenePrompt,
    videoDirective,
    performanceDirective,
    imagePrompts.join(" "),
    referenceImageNames.join(" "),
    referenceImageName,
  ].filter(Boolean).join(" ")));

  if (!sessionId) {
    console.warn("[functions][dialogue-video] reject 400 missing sessionId");
    return res.status(400).json({error: "Falta sessionId."});
  }
  if (!rowId) {
    console.warn("[functions][dialogue-video] reject 400 missing rowId", {sessionId});
    return res.status(400).json({error: "Falta rowId."});
  }
  if (!speakerLabel) {
    console.warn("[functions][dialogue-video] reject 400 missing speakerLabel", {sessionId, rowId});
    return res.status(400).json({error: "Falta speakerLabel."});
  }
  if (!text) {
    console.warn("[functions][dialogue-video] reject 400 missing text", {sessionId, rowId, speakerLabel});
    return res.status(400).json({error: "Falta texto de diálogo."});
  }
  if (strictIdentity && !portraitUrl && !portraitStoragePath) {
    return res.status(400).json({error: "strictIdentity requiere portraitUrl o portraitStoragePath."});
  }

  let portraitBuffer = null;
  let portraitMimeType = "image/png";
  let portraitLoadedFromStorage = false;
  if (portraitUrl || portraitStoragePath) {
    if (portraitStoragePath) {
      try {
        const bucket = admin.storage().bucket();
        const file = bucket.file(portraitStoragePath);
        const [meta] = await file.getMetadata().catch(() => [{}]);
        const [downloaded] = await file.download();
        portraitBuffer = Buffer.from(downloaded);
        portraitMimeType = String(meta?.contentType || "image/png").trim().toLowerCase();
        portraitLoadedFromStorage = true;
      } catch (_) {
        portraitBuffer = null;
      }
    }
    if (!portraitBuffer && portraitUrl) {
      const portraitResponse = await fetch(portraitUrl, {method: "GET"});
      if (!portraitResponse.ok) {
        if (strictIdentity) {
          const detail = await portraitResponse.json().catch(() => ({}));
          return res.status(portraitResponse.status).json({
            error: String(detail?.error?.message || detail?.error || `No se pudo descargar retrato (${portraitResponse.status}).`),
          });
        }
        portraitBuffer = null;
      } else {
        portraitMimeType = String(portraitResponse.headers.get("content-type") || "image/png").trim().toLowerCase();
        portraitBuffer = Buffer.from(await portraitResponse.arrayBuffer());
      }
    }
  }
  if ((portraitUrl || portraitStoragePath) && !portraitBuffer) {
    strictIdentity = false;
  }
  if (portraitBuffer && !portraitMimeType.startsWith("image/")) {
    if (strictIdentity) {
      return res.status(400).json({error: "El retrato no es una imagen válida para Veo."});
    }
    portraitBuffer = null;
    portraitMimeType = "image/png";
  }
  if (portraitBuffer && (!portraitBuffer.length || portraitBuffer.length > MAX_SPEAKER_PORTRAIT_BYTES)) {
    if (strictIdentity) {
      return res.status(413).json({error: "El retrato excede el tamaño permitido."});
    }
    portraitBuffer = null;
    portraitMimeType = "image/png";
  }
  const portraitBase64 = portraitBuffer ? portraitBuffer.toString("base64") : "";
  const bucket = admin.storage().bucket();
  const portraitGcsUri = portraitLoadedFromStorage && portraitStoragePath
    ? `gs://${bucket.name}/${portraitStoragePath}`
    : "";
  const hasPortraitAsset = Boolean(portraitBase64 || portraitGcsUri);
  const sceneReferenceSources = referenceImageDataUrls.length ? referenceImageDataUrls : (referenceImageDataUrl ? [referenceImageDataUrl] : []);
  const sceneReferences = [];
  for (const imageDataUrl of sceneReferenceSources) {
    const sceneReference = await loadOptionalImageReference({ dataUrl: imageDataUrl });
    if (!sceneReference) continue;
    sceneReferences.push({
      buffer: sceneReference.buffer,
      mimeType: String(sceneReference.mimeType || "image/png").trim().toLowerCase() || "image/png",
    });
  }
  const sceneReferenceImages = sceneReferences.map((item) => ({
    image: {
      bytesBase64Encoded: item.buffer.toString("base64"),
      mimeType: item.mimeType,
    },
    referenceType: "asset",
  }));
  const hasSceneReference = sceneReferenceImages.length > 0;
  const useSceneReferenceAsInitImage = hasSceneReference && !strictIdentity;
  let sceneReferenceVideoFrameBase64 = "";
  let sceneReferenceVideoFrameMimeType = "image/png";
  if (referenceMode === "video" && referenceVideoDataUrl) {
    const decodedVideo = decodeBase64DataUrl(referenceVideoDataUrl, MAX_DIALOGUE_VIDEO_BYTES);
    if (!String(decodedVideo.mimeType || referenceVideoMimeType).toLowerCase().startsWith("video/")) {
      return res.status(400).json({error: "El video de referencia no es válido."});
    }
    try {
      const frameBuffer = await extractLastVideoFramePng(decodedVideo.buffer, String(decodedVideo.mimeType || referenceVideoMimeType || "video/mp4"));
      if (frameBuffer?.length) {
        sceneReferenceVideoFrameBase64 = frameBuffer.toString("base64");
        sceneReferenceVideoFrameMimeType = "image/png";
      }
    } catch (error) {
      console.warn(`[functions][${requestDebugTag}] reference video frame extraction failed`, {
        error: String(error?.message || error || "unknown"),
        referenceVideoName,
      });
    }
    strictIdentity = false;
  }
  const hasSceneReferenceVideo = Boolean(sceneReferenceVideoFrameBase64);

  let continuityFrameBase64 = "";
  let continuityFrameMimeType = "image/png";
  if (continuityReferenceImageDataUrl && continuityReferenceImageDataUrl.startsWith("data:image/")) {
    const continuityReference = await loadOptionalImageReference({dataUrl: continuityReferenceImageDataUrl});
    if (continuityReference?.buffer?.length) {
      continuityFrameBase64 = continuityReference.buffer.toString("base64");
      continuityFrameMimeType = String(continuityReference.mimeType || "image/png").trim().toLowerCase() || "image/png";
    }
  }
  console.info(`[functions][${requestDebugTag}] request assets`, {
    referenceMode,
    hasSceneReference,
    sceneReferenceCount: sceneReferenceImages.length,
    hasSceneReferenceVideo,
    useSceneReferenceAsInitImage: hasSceneReferenceVideo ? true : useSceneReferenceAsInitImage,
    hasContinuityReference: Boolean(continuityFrameBase64),
    hasPortraitAsset,
  });
  let inferredAudioDurationSec = audioDurationSecInput;
  if (!inferredAudioDurationSec && dialogueAudioStoragePath) {
    try {
      const [audioBytes] = await bucket.file(dialogueAudioStoragePath).download();
      inferredAudioDurationSec = clampNumber(parseWavDurationSeconds(Buffer.from(audioBytes)), 0, 180, 0);
    } catch (_) {
      inferredAudioDurationSec = 0;
    }
  }
  const inferredTargetDurationSec = strictIdentity
    ? 8
    : (requestedDurationSecInput > 0
    ? Math.round(clampNumber(requestedDurationSecInput, 4, 8, 8))
    : (inferredAudioDurationSec > 0
      ? Math.round(clampNumber(inferredAudioDurationSec, 5, 8, 8))
      : 8));
  const characterPrompt = educationalVideo
    ? ""
    : buildBackendPodcasterCharacterPrompt({
      speakerLabel,
      speakerName,
      voiceName,
      genderGroup,
      expression,
      counterpartSpeakerName,
      contentMode: "podcast",
    });
  const studioScenePrompt = educationalVideo
    ? ""
    : buildBackendPodcasterStudioScenePrompt({
      speakerLabel,
      speakerName,
      counterpartSpeakerName,
      scenarioPrompt,
      expression,
      contentMode: "podcast",
    });
  const timelineScenePromptBundle = buildDialogueVideoPromptBundle({
    promptProfile,
    educationalVideo,
    speakerName,
    speakerLabel,
    voiceName,
    genderGroup,
    expression,
    counterpartSpeakerName,
    scenarioPrompt,
    scenePrompt,
    sceneDescription,
    visualNotes,
    onScreenText,
    transition,
    videoDirective,
    imagePrompts,
    performanceDirective,
    previousScene,
    relateWithPreviousScene: req.body?.relateWithPreviousScene === true,
    continuityFrameBase64,
    forceImmediateChange,
    hasPortraitAsset,
    dialogueAudioStoragePath,
    dialogueAudioUrl,
    inferredTargetDurationSec,
    originalText,
    text,
    characterPrompt,
    studioScenePrompt,
    useSceneReferenceAsInitImage,
    referenceImageName,
    hasSceneReferenceVideo,
    referenceVideoName,
    regenerationAnalysis: null,
  });
  const sceneVisualPrompt = timelineScenePromptBundle?.sceneVisualPrompt || (scenePrompt || [
    educationalVideo ? "Escena educativa basada en guion técnico." : `Escena de ${speakerName}.`,
    scenarioPrompt ? `Contexto visual: ${scenarioPrompt}` : "",
    videoDirective ? `Prioridad manual: ${videoDirective}` : ""
  ].filter(Boolean).join(" ").trim());
  const sceneImagePromptList = timelineScenePromptBundle?.sceneImagePromptList || (imagePrompts.length ? imagePrompts : (sceneVisualPrompt ? [
    `${sceneVisualPrompt} Imagen principal horizontal 16:9.`,
    `${sceneVisualPrompt} Variante en plano cerrado, y otra toma de apoyo del set.`
  ] : []));

  const prompt = timelineScenePromptBundle?.prompt || [
    educationalVideo
      ? "Genera un video educativo corto, claro y realista."
      : "Genera un video cinematográfico corto y realista para podcast.",
    regenerate
      ? (educationalVideo
        ? "Esta solicitud es una regeneración del mismo clip educativo. Mantén la intención pedagógica y el contenido, pero crea una toma claramente distinta a cualquier versión anterior."
        : "Esta solicitud es una regeneración del mismo clip. Mantén identidad, locación y diálogo, pero crea una toma claramente distinta a cualquier versión anterior.")
      : "",
    regenerate
      ? (educationalVideo
        ? "Varía de forma visible el encuadre, distancia de cámara, ritmo de movimiento y elementos didácticos en pantalla (pizarra, gráficos, objetos). Evita cualquier set de radio/podcast o cabina."
        : "Varía de forma visible el encuadre, distancia de cámara, pose, mirada, gestos, timing corporal, bloqueo en cabina y microexpresión. No entregues una réplica ni una toma casi idéntica.")
      : "",
    videoDirective ? `Prioridad máxima: cumple esta especificación adicional del usuario${educationalVideo ? " para narrativa visual educativa" : " sin romper identidad, sincronía labial ni continuidad del set"}: ${videoDirective}` : "",
    sceneVisualPrompt ? `${educationalVideo ? "Dirección pedagógica de la escena" : "Dirección visual de la escena"}: ${sceneVisualPrompt}` : "",
    sceneImagePromptList.length ? `Prompts de imagen para la escena: ${sceneImagePromptList.map((item, idx) => `${idx + 1}. ${item}`).join(" | ")}` : "",
    performanceDirective ? `Prioridad máxima de actuación visual: ejecuta estas acciones físicas o expresivas de forma visible en pantalla, sin convertirlas en texto en pantalla ni alterar el diálogo hablado: ${performanceDirective}` : "",
    educationalVideo ? "" : `Locutor: ${speakerName} (${speakerLabel}).`,
    educationalVideo ? "" : (voiceName ? `Voz de referencia: ${voiceName}.` : ""),
    educationalVideo ? "" : (genderGroup ? `Presentación de género del personaje: ${genderGroup}.` : ""),
    educationalVideo ? "" : `Expresión: ${expression}.`,
    characterPrompt ? `Identidad del personaje obligatoria: ${characterPrompt}` : "",
    studioScenePrompt ? `Escenario de locución obligatorio: ${studioScenePrompt}` : "",
    previousScene?.speakerLabel
      ? `Continuidad narrativa: esta es la escena posterior a la escena ${Math.max(1, Number(previousScene.sceneNumber) || 1)} de ${previousScene.speakerName || previousScene.speakerLabel}.`
      : "",
    previousScene?.targetSpeechLine
      ? `Escena previa (texto objetivo): "${String(previousScene.targetSpeechLine).replace(/"/g, '\\"')}"`
      : "",
    previousScene?.previousVideoTargetSpeechLine
      ? `Escena previa (texto usado en video): "${String(previousScene.previousVideoTargetSpeechLine).replace(/"/g, '\\"')}"`
      : "",
    previousScene?.expression
      ? `Transición emocional: evoluciona de "${previousScene.expression}" hacia "${expression}" de forma natural y coherente.`
      : "",
    (req.body?.relateWithPreviousScene === true && continuityReferenceImage)
      ? (forceImmediateChange
        ? "Continuidad solo en el primer fotograma: el primer fotograma debe coincidir con el último fotograma del clip anterior (mismo encuadre/iluminación). Luego, dentro de 0.2–0.8s, realiza un corte/transición visible para cumplir el nuevo Elemento visual/Descripción de escena. No te quedes con la imagen anterior durante todo el clip."
        : "Continuidad exacta: el primer fotograma debe coincidir con el último fotograma del clip anterior (mismo encuadre/iluminación) sin notarse el corte.")
      : (req.body?.relateWithPreviousScene === true ? "Continuidad: intenta continuar desde el final del clip anterior." : ""),
    previousScene?.hasVideo
      ? (forceImmediateChange
        ? "Tras el primer fotograma, prioriza el nuevo Elemento visual aunque implique un cambio claro de plano o composición respecto al clip previo."
        : (educationalVideo
          ? "Mantén continuidad visual y de estilo con el clip previo (paleta, ritmo, tipo de recurso visual y composición)."
          : "Mantén continuidad visual y de puesta en escena con el clip previo (posición en cabina, encuadre y energía)."))
      : "Si no hay clip previo disponible, conserva continuidad narrativa usando el texto de la escena anterior.",
    educationalVideo ? "" : (hasPortraitAsset ? "El sujeto debe mantener identidad visual consistente y reconocible con la imagen base." : ""),
    educationalVideo ? "" : (hasPortraitAsset ? "Conserva rasgos faciales, peinado, tono de piel y proporciones del rostro sin sustituir personaje." : ""),
    educationalVideo
      ? "Escena en entorno educativo profesional con apoyo visual limpio y composición editorial."
      : "Escena en cabina profesional de podcast con micrófono de estudio.",
    educationalVideo
      ? "La prioridad es representar fielmente la Descripción de escena y el Elemento visual del guion técnico."
      : "Usa el mismo escenario global del podcast, pero cada locutor debe ocupar una zona física distinta dentro del set.",
    educationalVideo
      ? "Puedes mostrar escenas sin personas si el recurso visual lo pide (mapas, gráficos, objetos, documentos, animaciones)."
      : "Importante: posicionar a cada Host en una parte diferente del escenario, y ser consistente con ese ángulo.",
    educationalVideo
      ? "Prohibido estilo podcast: no cabina de radio, no micrófonos, no set de entrevista, no host hablando a cámara."
      : "Importante: en la escena solo debe aparecer el locutor o host correspondiente al track.",
    educationalVideo
      ? "Si aparece una persona, debe ser secundaria al recurso didáctico y nunca parecer conductor de podcast."
      : "El locutor debe verse en conversación real: cuerpo en tres cuartos o semi perfil, con la mirada dirigida hacia un punto fuera de cámara dentro del set.",
    educationalVideo
      ? "Prioriza planos de recurso visual, detalle y contexto que refuercen la voz en off."
      : "Prohibido mirar fijamente al frente, prohibido hablarle al lente, prohibido pose de conductor mirando a cámara.",
    educationalVideo
      ? "Mantén narrativa didáctica clara y coherencia con transición solicitada."
      : "Debe verse un solo locutor identificable en cuadro; no introducir un segundo personaje visible ni fragmentos corporales de otro personaje.",
    educationalVideo ? "" : "Composición obligatoria de sujeto único: foreground y background libres de cualquier figura humana adicional.",
    educationalVideo
      ? "Si la escena exige figura humana, evitar frontalidad y mantener foco en el contenido didáctico."
      : "Si hace falta sugerir conversacion, hacerlo solo con direccion de mirada, postura y composicion del set; nunca agregando otra figura humana.",
    educationalVideo
      ? "No incluir texto incrustado; la explicación textual ocurre en voz en off y edición."
      : "Solo se permiten microglances incidentales; la eyeline dominante nunca debe caer directamente sobre la cámara.",
    educationalVideo
      ? "Plano, luz y composición deben parecer pieza educativa premium de 16:9."
      : "Plano medio corto, movimiento sutil de cabeza y labios, parpadeo natural, iluminación neutra.",
    dialogueAudioStoragePath || dialogueAudioUrl
      ? (educationalVideo
        ? `El clip debe durar ~${inferredTargetDurationSec} segundos y reforzar visualmente la locución pregrabada (sin requerir lectura labial).`
        : `El clip debe sincronizar labios y ritmo con una locución pregrabada de ~${inferredTargetDurationSec} segundos.`)
      : "",
    "Las acotaciones escénicas o instrucciones de actuación son visuales; no deben aparecer como texto en pantalla ni modificar literalmente el diálogo hablado.",
    originalText ? `Línea original (referencia): "${String(originalText).replace(/"/g, '\\"')}"` : "",
    "Sin texto, sin subtítulos, sin captions, sin closed captions, sin lower thirds, sin burned-in text, sin karaoke text, sin overlays de UI, sin logos, sin marcas de agua.",
    "Prohibido cualquier texto incrustado en imagen o video: no titulos, no nombres, no etiquetas, no transcripcion en pantalla, no texto decorativo.",
    `Diálogo objetivo: "${String(text).replace(/"/g, '\\"')}"`,
  ].filter(Boolean).join("\n");

  const pollUntilDone = async (operationName = "", options = {}) => {
    const maxAttempts = Math.max(12, Math.min(54, Math.floor(Number(options?.maxAttempts || 54) || 54)));
    const delayMs = 5000;
    let latest = null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      const opResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${encodeURIComponent(key)}`, {
        method: "GET",
      });
      // eslint-disable-next-line no-await-in-loop
      const opData = await opResponse.json().catch(() => ({}));
      latest = opData;
      if (!opResponse.ok) {
        const detail = String(opData?.error?.message || opData?.error || `HTTP ${opResponse.status}`).trim();
        return {ok: false, status: Number(opResponse.status || 502), error: `Error consultando operación Veo: ${detail}`};
      }
      if (opData?.done === true) return {ok: true, data: opData};
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return {ok: false, status: 504, error: "Tiempo de espera agotado al generar video de diálogo.", latest};
  };

  if (strictIdentity && !hasPortraitAsset) {
    console.warn("[functions][dialogue-video] reject 400 strictIdentity without portrait asset", {
      hasPortraitUrl: Boolean(portraitUrl),
      hasPortraitStoragePath: Boolean(portraitStoragePath),
      hasPortraitAsset,
    });
    return res.status(400).json({
      error: "strictIdentity requiere portraitUrl o portraitStoragePath para referenceImages.",
    });
  }
  const requestVariants = [];
  const sceneReferenceAssets = [...sceneReferenceImages];
  if (sceneReferenceVideoFrameBase64) {
    sceneReferenceAssets.push({
      image: {
        bytesBase64Encoded: sceneReferenceVideoFrameBase64,
        mimeType: sceneReferenceVideoFrameMimeType,
      },
      referenceType: "asset",
    });
  }
  const derivedHasSceneReference = sceneReferenceAssets.length > 0;
  const derivedUseSceneReferenceAsInitImage = derivedHasSceneReference && !strictIdentity;
  const continuityReferenceImage = continuityFrameBase64
    ? {
      image: {
        bytesBase64Encoded: continuityFrameBase64,
        mimeType: continuityFrameMimeType,
      },
      referenceType: "asset",
    }
    : null;
  const referenceDurationSec = inferredTargetDurationSec;

  if (sceneReferenceAssets.length && derivedUseSceneReferenceAsInitImage) {
    requestVariants.push(
      {
        label: "reference-scene+aspect+duration",
        body: {
          instances: [{
            prompt,
            referenceImages: [...sceneReferenceAssets, ...(continuityReferenceImage ? [continuityReferenceImage] : [])],
          }],
          parameters: {
            aspectRatio: "16:9",
            durationSeconds: referenceDurationSec,
          },
        },
      },
      {
        label: "reference-scene+aspect",
        body: {
          instances: [{
            prompt,
            referenceImages: [...sceneReferenceAssets, ...(continuityReferenceImage ? [continuityReferenceImage] : [])],
          }],
          parameters: {
            aspectRatio: "16:9",
          },
        },
      },
    );
  }

  if (continuityReferenceImage && !strictIdentity) {
    requestVariants.push(
      {
        label: "reference-continuity+aspect+duration",
        body: {
          instances: [{
            prompt,
            referenceImages: [continuityReferenceImage],
          }],
          parameters: {
            aspectRatio: "16:9",
            durationSeconds: referenceDurationSec,
          },
        },
      },
      {
        label: "reference-continuity+aspect",
        body: {
          instances: [{
            prompt,
            referenceImages: [continuityReferenceImage],
          }],
          parameters: {
            aspectRatio: "16:9",
          },
        },
      },
    );
  }
  if (portraitGcsUri) {
    requestVariants.push(
      {
        label: "reference-gcs+aspect+duration",
        body: {
          instances: [{
            prompt,
            referenceImages: [{
              image: {
                gcsUri: portraitGcsUri,
                mimeType: portraitMimeType,
              },
              referenceType: "asset",
            }, ...sceneReferenceAssets, ...(continuityReferenceImage ? [continuityReferenceImage] : [])],
          }],
          parameters: {
            aspectRatio: "16:9",
            durationSeconds: referenceDurationSec,
          },
        },
      },
      {
        label: "reference-gcs+aspect",
        body: {
          instances: [{
            prompt,
            referenceImages: [{
              image: {
                gcsUri: portraitGcsUri,
                mimeType: portraitMimeType,
              },
              referenceType: "asset",
            }, ...sceneReferenceAssets, ...(continuityReferenceImage ? [continuityReferenceImage] : [])],
          }],
          parameters: {
            aspectRatio: "16:9",
          },
        },
      },
    );
  }
  if (portraitBase64) {
    requestVariants.push(
      {
        label: "reference-bytes+aspect+duration",
        body: {
          instances: [{
            prompt,
            referenceImages: [{
              image: {
                bytesBase64Encoded: portraitBase64,
                mimeType: portraitMimeType,
              },
              referenceType: "asset",
            }, ...sceneReferenceAssets, ...(continuityReferenceImage ? [continuityReferenceImage] : [])],
          }],
          parameters: {
            aspectRatio: "16:9",
            durationSeconds: referenceDurationSec,
          },
        },
      },
      {
        label: "reference-bytes+aspect",
        body: {
          instances: [{
            prompt,
            referenceImages: [{
              image: {
                bytesBase64Encoded: portraitBase64,
                mimeType: portraitMimeType,
              },
              referenceType: "asset",
            }, ...sceneReferenceAssets, ...(continuityReferenceImage ? [continuityReferenceImage] : [])],
          }],
          parameters: {
            aspectRatio: "16:9",
          },
        },
      },
    );
  }
  if (!strictIdentity && portraitBase64) {
    requestVariants.push(
      {
        label: "image+aspect+duration",
        body: {
          instances: [{
            prompt,
            image: {
              inlineData: {
                mimeType: portraitMimeType,
                data: portraitBase64,
              },
            },
          }],
          parameters: {
            aspectRatio: "16:9",
            durationSeconds: inferredTargetDurationSec,
          },
        },
      },
      {
        label: "image+aspect",
        body: {
          instances: [{
            prompt,
            image: {
              inlineData: {
                mimeType: portraitMimeType,
                data: portraitBase64,
              },
            },
          }],
          parameters: {
            aspectRatio: "16:9",
          },
        },
      },
    );
  }
  if (!hasPortraitAsset) {
    requestVariants.push(
      {
        label: "text-only+aspect+duration",
        body: {
          instances: [{
            prompt,
            ...((sceneReferenceAssets.length || continuityReferenceImage) ? {
              referenceImages: [
                ...sceneReferenceAssets,
                ...(continuityReferenceImage ? [continuityReferenceImage] : []),
              ],
            } : {}),
          }],
          parameters: {
            aspectRatio: "16:9",
            durationSeconds: referenceDurationSec,
          },
        },
      },
      {
        label: "text-only+aspect",
        body: {
          instances: [{
            prompt,
            ...((sceneReferenceAssets.length || continuityReferenceImage) ? {
              referenceImages: [
                ...sceneReferenceAssets,
                ...(continuityReferenceImage ? [continuityReferenceImage] : []),
              ],
            } : {}),
          }],
          parameters: {
            aspectRatio: "16:9",
          },
        },
      },
    );
  }
  if (strictIdentity) {
    requestVariants.push(
      {
        label: "strict-fallback-text-only+aspect+duration",
        body: {
          instances: [{prompt}],
          parameters: {
            aspectRatio: "16:9",
            durationSeconds: inferredTargetDurationSec,
          },
        },
      },
      {
        label: "strict-fallback-text-only+aspect",
        body: {
          instances: [{prompt}],
          parameters: {
            aspectRatio: "16:9",
          },
        },
      },
    );
  }

  let lastStatus = 502;
  let lastError = "No se pudo generar video con los modelos y variantes disponibles.";
  const attemptErrors = [];
  let finalVideoBuffer = null;
  let finalVideoMimeType = "video/mp4";
  let resolvedModel = videoModels[0] || DEFAULT_PODCASTER_VIDEO_MODEL;
  let resolvedVariant = "";
  const resolveVeoVideoResult = (operationDone = {}) => {
    const op = operationDone && typeof operationDone === "object" ? operationDone : {};
    const response = op.response && typeof op.response === "object"
      ? op.response
      : (op.result && typeof op.result === "object"
        ? op.result
        : (op.output && typeof op.output === "object" ? op.output : op));

    const uriCandidates = [
      response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri,
      response?.generateVideoResponse?.generatedSamples?.[0]?.videoUri,
      response?.generateVideoResponse?.generatedSamples?.[0]?.uri,
      response?.generateVideoResponse?.generatedSamples?.[0]?.video?.fileUri,
      response?.generatedVideos?.[0]?.video?.uri,
      response?.generatedVideos?.[0]?.videoUri,
      response?.generatedVideos?.[0]?.uri,
      response?.videos?.[0]?.video?.uri,
      response?.videos?.[0]?.uri,
      response?.video?.uri,
      response?.videoUri,
    ];
    for (const candidate of uriCandidates) {
      const uri = String(candidate || "").trim();
      if (uri) return { uri };
    }

    const inlineCandidates = [
      response?.generateVideoResponse?.generatedSamples?.[0]?.video?.inlineData,
      response?.generateVideoResponse?.generatedSamples?.[0]?.inlineData,
      response?.generatedVideos?.[0]?.video?.inlineData,
      response?.generatedVideos?.[0]?.inlineData,
    ].filter(Boolean);
    for (const inlineData of inlineCandidates) {
      const data = String(inlineData?.data || inlineData?.bytesBase64Encoded || "").trim();
      const mimeType = String(inlineData?.mimeType || "video/mp4").trim() || "video/mp4";
      if (data) return { inlineData: { data, mimeType } };
    }

    const parts = Array.isArray(response?.candidates?.[0]?.content?.parts)
      ? response.candidates[0].content.parts
      : [];
    for (const part of parts) {
      const fileUri = String(part?.fileData?.fileUri || part?.fileData?.uri || "").trim();
      if (fileUri) return { uri: fileUri };
      const partUri = String(part?.video?.uri || part?.videoUri || part?.uri || "").trim();
      if (partUri) return { uri: partUri };
      const data = String(part?.inlineData?.data || part?.inlineData?.bytesBase64Encoded || "").trim();
      const mimeType = String(part?.inlineData?.mimeType || "").trim();
      if (data && mimeType.toLowerCase().startsWith("video/")) return { inlineData: { data, mimeType } };
    }

    return null;
  };
  const requestedMaxVariantAttempts = Math.max(1, Math.min(
    requestVariants.length || 1,
    Math.floor(clampNumber(req.body?.maxVariantAttempts, 1, requestVariants.length || 1, requestVariants.length || 1))
  ));
  const effectiveRequestVariants = requestVariants.slice(0, requestedMaxVariantAttempts);
  const requestedMaxOperationPollAttempts = Math.max(12, Math.min(
    54,
    Math.floor(clampNumber(req.body?.maxOperationPollAttempts, 12, 54, 54))
  ));
  const effectiveVideoModels = videoModels.slice(0, Math.max(1, Math.min(
    videoModels.length || 1,
    Math.floor(clampNumber(req.body?.maxModelAttempts, 1, videoModels.length || 1, videoModels.length || 1))
  )));

  for (const videoModel of effectiveVideoModels) {
    for (const variant of effectiveRequestVariants) {
      const createEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(videoModel)}:predictLongRunning?key=${encodeURIComponent(key)}`;
      const createResponse = await fetch(createEndpoint, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(variant.body),
      });
      const createData = await createResponse.json().catch(() => ({}));
      if (!createResponse.ok) {
        const detail = String(createData?.error?.message || createData?.error || `HTTP ${createResponse.status}`).trim();
        lastStatus = Number(createResponse.status || 502);
        lastError = `${videoModel} [${variant.label}]: ${detail}`;
        attemptErrors.push(lastError);
        if ([400, 401, 403, 404].includes(lastStatus)) continue;
        return res.status(lastStatus).json(createData);
      }
      const operationName = String(createData?.name || "").trim();
      if (!operationName) {
        lastStatus = 502;
        lastError = `${videoModel} [${variant.label}]: no devolvió nombre de operación`;
        attemptErrors.push(lastError);
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const pollResult = await pollUntilDone(operationName, {
        maxAttempts: requestedMaxOperationPollAttempts,
      });
      if (!pollResult.ok) {
        lastStatus = Number(pollResult.status || 504) || 504;
        lastError = `${videoModel} [${variant.label}]: ${String(pollResult.error || "Error al esperar operación Veo.")}`;
        attemptErrors.push(lastError);
        continue;
      }
      const operationDone = pollResult.data || {};
      const resolved = resolveVeoVideoResult(operationDone);
      const videoUri = String(resolved?.uri || "").trim();
      if (!videoUri && resolved?.inlineData?.data) {
        const mimeType = String(resolved.inlineData.mimeType || "video/mp4").trim() || "video/mp4";
        const downloadedBuffer = Buffer.from(String(resolved.inlineData.data || ""), "base64");
        if (!downloadedBuffer.length || downloadedBuffer.length > MAX_DIALOGUE_VIDEO_BYTES) {
          lastStatus = 413;
          lastError = `${videoModel} [${variant.label}]: video inline demasiado grande o vacío.`;
          attemptErrors.push(lastError);
          continue;
        }
        finalVideoBuffer = downloadedBuffer;
        finalVideoMimeType = mimeType.toLowerCase().startsWith("video/") ? mimeType : "video/mp4";
        resolvedModel = videoModel;
        resolvedVariant = String(variant?.label || "").trim();
        break;
      }
      if (!videoUri) {
        lastStatus = 502;
        lastError = `${videoModel} [${variant.label}]: operación completada sin URI de video`;
        attemptErrors.push(lastError);
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const videoResponse = await fetch(videoUri, {
        method: "GET",
        headers: {"x-goog-api-key": key},
      });
      if (!videoResponse.ok) {
        // eslint-disable-next-line no-await-in-loop
        const detail = await videoResponse.json().catch(() => ({}));
        lastStatus = Number(videoResponse.status || 502) || 502;
        lastError = `${videoModel} [${variant.label}]: no se pudo descargar video (${String(detail?.error?.message || detail?.error || `HTTP ${videoResponse.status}`)})`;
        attemptErrors.push(lastError);
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const downloadedBuffer = Buffer.from(await videoResponse.arrayBuffer());
      if (!downloadedBuffer.length || downloadedBuffer.length > MAX_DIALOGUE_VIDEO_BYTES) {
        lastStatus = 413;
        lastError = `${videoModel} [${variant.label}]: video generado demasiado grande.`;
        attemptErrors.push(lastError);
        continue;
      }

      finalVideoBuffer = downloadedBuffer;
      finalVideoMimeType = String(videoResponse.headers.get("content-type") || "video/mp4").trim() || "video/mp4";
      if (!String(finalVideoMimeType).toLowerCase().startsWith("video/")) {
        finalVideoMimeType = "video/mp4";
      }
      resolvedModel = videoModel;
      resolvedVariant = String(variant?.label || "").trim();
      break;
    }
    if (finalVideoBuffer) break;
  }

  if (!finalVideoBuffer) {
    if (strictIdentity) {
      return res.status(lastStatus >= 400 ? lastStatus : 502).json({
        error: `No se pudo mantener identidad del locutor con referenceImages. ${lastError}`,
      });
    }
    const errorPreview = attemptErrors.slice(-4).join(" | ");
    return res.status(lastStatus >= 400 ? lastStatus : 502).json({
      error: errorPreview ? `${lastError}. Intentos: ${errorPreview}` : lastError,
    });
  }

  const ext = getVideoExtension(finalVideoMimeType);
  const storagePath = `podcaster/sessions/${normalizeStorageSegment(sessionId, "session")}/owners/${normalizeStorageSegment(uid, "anon")}/videos/${normalizeStorageSegment(rowId, "row")}-${normalizeStorageSegment(speakerLabel, "speaker")}/${randomUUID()}.${ext}`;
  const asset = await uploadScreenshotAsset({
    bucket,
    path: storagePath,
    buffer: finalVideoBuffer,
    mimeType: finalVideoMimeType,
    metadata: {uid, sessionId, rowId, speakerLabel, speakerName, model: resolvedModel, kind: "dialogue_video"},
  });
  if (regenerate && previousStoragePath && previousStoragePath !== storagePath) {
    await deleteStoragePath(bucket, previousStoragePath).catch(() => {});
  }
  return res.status(200).json({
    ok: true,
      dialogueVideo: {
        rowId,
        speaker: speakerLabel,
        mimeType: finalVideoMimeType,
        model: resolvedModel,
        variant: resolvedVariant || null,
        promptVersion: "podcaster_veo_v1",
        videoDirective,
        scenePrompt: sceneVisualPrompt,
        imagePrompts: sceneImagePromptList,
        contentMode: educationalVideo ? "educational" : "podcast",
        durationSec: inferredTargetDurationSec,
        targetSpeechLine: text,
        updatedAt: new Date().toISOString(),
      storagePath: asset.path,
      downloadUrl: asset.downloadUrl,
    },
  });
}

async function forwardPodcasterDialogueAudioGenerate(req, res) {
  const uid = String(req.securityContext?.uid || "").trim();
  if (!uid) return res.status(401).json({error: "AUTH_REQUIRED"});
  const key = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
  if (!key) return res.status(500).json({error: "Falta GEMINI_API_KEY o GOOGLE_API_KEY."});

  const sessionId = clampText(req.body?.sessionId || "", 140);
  const rowId = clampText(req.body?.rowId || "", 120);
  const speakerLabel = clampText(req.body?.speakerLabel || "", 80);
  const speakerName = clampText(req.body?.speakerName || "", 120) || speakerLabel || "Locutor";
  const voiceNameInput = clampText(req.body?.voiceName || "", 80);
  const voiceName = normalizeLiveVoiceName(voiceNameInput);
  const expression = clampText(req.body?.expression || "Neutral", 80) || "Neutral";
  const text = clampText(req.body?.text || "", 2000);
  const targetSpeechLine = clampText(req.body?.targetSpeechLine || text, 2200) || text;
  const originalText = clampText(req.body?.originalText || "", 2000);
  const disfluencyInstruction = clampText(req.body?.disfluencyInstruction || "", 1800);
  const notes = clampText(req.body?.notes || "", 1200);
  const contentMode = String(req.body?.contentMode || "").trim().toLowerCase();
  const educationalAudio = req.body?.videoMode === true || contentMode === "educational";
  const regenerate = req.body?.regenerate === true;
  const previousStoragePath = clampText(req.body?.previousStoragePath || "", 700);
  const model = sanitizeModel(req.body?.model || "gemini-2.5-flash-preview-tts");

  if (!sessionId) return res.status(400).json({error: "Falta sessionId."});
  if (!rowId) return res.status(400).json({error: "Falta rowId."});
  if (!speakerLabel) return res.status(400).json({error: "Falta speakerLabel."});
  if (!text) return res.status(400).json({error: "Falta texto de diálogo."});
  if (!isAllowedGeminiModel(model)) return res.status(400).json({error: "Modelo inválido para diálogo de audio."});
  if (voiceNameInput && !voiceName) {
    return res.status(400).json({error: `Voz no soportada para Gemini Live: ${voiceNameInput}`});
  }

    const prompt = [
      educationalAudio
        ? "Interpreta una línea para un video educativo en español latino, con tono claro, explicativo y natural."
        : "Interpreta una línea para podcast conversacional en español latino.",
      `Locutor: ${speakerName} (${speakerLabel}).`,
    `Expresión: ${expression}.`,
    voiceName ? `Usa exactamente la voz ${voiceName}.` : "",
    disfluencyInstruction || "No agregues metacomentarios.",
    "Nunca leas acotaciones escénicas, texto entre paréntesis o instrucciones de actuación; interpreta solo la línea objetivo limpia.",
    "Habla natural, humana y clara.",
    notes ? `Notas de interpretación: ${notes}.` : "",
    originalText ? `Línea original (referencia): "${String(originalText).replace(/"/g, '\\"')}"` : "",
    `Línea objetivo (obligatoria): "${String(targetSpeechLine).replace(/"/g, '\\"')}"`,
  ].filter(Boolean).join("\n");

  const payload = {
    contents: [{role: "user", parts: [{text: prompt}]}],
    generationConfig: {
      responseModalities: ["AUDIO"],
    },
  };
  if (voiceName) {
    payload.generationConfig.speechConfig = {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName,
        },
      },
    };
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const upstream = await fetch(endpoint, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload),
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const detail = String(data?.error?.message || data?.error || `HTTP ${upstream.status}`).trim();
    return res.status(Number(upstream.status || 502)).json({error: detail || "No se pudo generar audio de diálogo."});
  }

  const audioParts = readGeminiAudioParts(data);
  if (!audioParts.length) {
    return res.status(502).json({error: "Gemini no devolvió audio para la escena."});
  }
  const firstMime = String(audioParts[0]?.mimeType || "audio/L16;rate=24000").trim() || "audio/L16;rate=24000";
  const mimeLower = firstMime.toLowerCase();
  const pcmLike = mimeLower.includes("audio/l16") || mimeLower.includes("audio/pcm");
  const merged = Buffer.concat(audioParts.map((part) => Buffer.from(String(part.data || ""), "base64")));
  if (!merged.length || merged.length > MAX_DIALOGUE_AUDIO_BYTES) {
    return res.status(413).json({error: "El audio generado excede el tamaño permitido."});
  }
  const rateMatch = firstMime.match(/rate=(\d+)/i);
  const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;
  const finalBuffer = pcmLike ? pcm16ToWavBuffer(merged, sampleRate) : merged;
  const finalMime = pcmLike ? "audio/wav" : (firstMime.startsWith("audio/") ? firstMime.split(";")[0] : "audio/wav");
  const durationSec = pcmLike
    ? clampNumber(merged.length / Math.max(1, sampleRate * 2), 0, 180, 0)
    : clampNumber(parseWavDurationSeconds(finalBuffer), 0, 180, 0);

  const ext = getAudioExtension(finalMime);
  const storagePath = `podcaster/sessions/${normalizeStorageSegment(sessionId, "session")}/owners/${normalizeStorageSegment(uid, "anon")}/audio/${normalizeStorageSegment(rowId, "row")}-${normalizeStorageSegment(speakerLabel, "speaker")}/${randomUUID()}.${ext}`;
  const bucket = admin.storage().bucket();
  const asset = await uploadScreenshotAsset({
    bucket,
    path: storagePath,
    buffer: finalBuffer,
    mimeType: finalMime,
    metadata: {
      uid,
      sessionId,
      rowId,
      speakerLabel,
      speakerName,
      voiceName: voiceName || null,
      model,
      kind: "dialogue_audio",
    },
  });
  if (regenerate && previousStoragePath && previousStoragePath !== storagePath) {
    await deleteStoragePath(bucket, previousStoragePath).catch(() => {});
  }

  return res.status(200).json({
    ok: true,
    dialogueAudio: {
      rowId,
      speaker: speakerLabel,
      mimeType: finalMime,
      model,
      promptVersion: "podcaster_live_audio_v1",
      durationSec,
      targetSpeechLine,
      updatedAt: new Date().toISOString(),
      storagePath: asset.path,
      downloadUrl: asset.downloadUrl,
    },
  });
}

async function forwardPodcasterMusicUpload(req, res) {
  const uid = String(req.securityContext?.uid || "").trim();
  if (!uid) return res.status(401).json({error: "AUTH_REQUIRED"});
  const sessionId = clampText(req.body?.sessionId || "", 140);
  const fileName = clampText(req.body?.fileName || "podcast-music", 180) || "podcast-music";
  const mimeType = clampText(req.body?.mimeType || "audio/mpeg", 120) || "audio/mpeg";
  const previousStoragePath = clampText(req.body?.previousStoragePath || "", 700);
  const audioDataUrl = String(req.body?.audioDataUrl || "").trim();
  if (!sessionId) return res.status(400).json({error: "Falta sessionId."});
  if (!audioDataUrl) return res.status(400).json({error: "Falta audioDataUrl."});
  const decoded = decodeBase64DataUrl(audioDataUrl, MAX_PODCASTER_MUSIC_BYTES);
  if (!String(decoded?.mimeType || mimeType).startsWith("audio/")) {
    return res.status(400).json({error: "El archivo seleccionado no es audio válido."});
  }
  const ext = getAudioExtension(decoded.mimeType || mimeType);
  const storagePath = `podcaster/sessions/${normalizeStorageSegment(sessionId, "session")}/owners/${normalizeStorageSegment(uid, "anon")}/music/${normalizeStorageSegment(fileName, "track")}-${randomUUID()}.${ext}`;
  const bucket = admin.storage().bucket();
  const asset = await uploadScreenshotAsset({
    bucket,
    path: storagePath,
    buffer: decoded.buffer,
    mimeType: decoded.mimeType || mimeType,
    metadata: {uid, sessionId, fileName, kind: "panel_music"},
  });
  if (previousStoragePath && previousStoragePath !== storagePath) {
    await deleteStoragePath(bucket, previousStoragePath).catch(() => {});
  }
  return res.status(200).json({
    ok: true,
    track: {
      name: fileName,
      mimeType: decoded.mimeType || mimeType,
      size: decoded.buffer.length,
      downloadUrl: asset.downloadUrl,
      storagePath: asset.path,
      updatedAt: new Date().toISOString(),
    },
  });
}

async function forwardHfTts(req, res) {
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

function sleep(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms || 0))));
}

function sanitizeCollectionName(value = "") {
  const clean = String(value || "").trim();
  return /^[a-zA-Z0-9_-]{2,80}$/.test(clean) ? clean : "lecturasASC";
}

function stripHtmlToPlain(html = "") {
  return String(html || "")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
}

async function fetchImageBytesWithMime(imageUrl = "") {
  const url = String(imageUrl || "").trim();
  if (!url) {
    throw new HttpsError("invalid-argument", "imageUrl es obligatorio.");
  }
  const response = await fetch(url, {method: "GET"});
  if (!response.ok) {
    throw new HttpsError("invalid-argument", `No se pudo descargar imageUrl (${response.status}).`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const mimeType = String(response.headers.get("content-type") || "image/png").split(";")[0].trim().toLowerCase() || "image/png";
  if (!mimeType.startsWith("image/")) {
    throw new HttpsError("invalid-argument", "imageUrl no apunta a un recurso de imagen.");
  }
  if (!buffer.length || buffer.length > MAX_SPEAKER_PORTRAIT_BYTES) {
    throw new HttpsError("invalid-argument", "La imagen para análisis excede tamaño permitido.");
  }
  return {buffer, mimeType};
}

function parseJsonObjectFromModelText(raw = "") {
  const clean = String(raw || "").trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  const match = clean.match(/\{[\s\S]*\}/);
  const candidate = match ? match[0] : clean;
  return JSON.parse(candidate);
}

function buildLyriaReadingPrompt(input = {}) {
  const title = String(input?.title || "").trim();
  const level = String(input?.level || "").trim();
  const grade = String(input?.grade || "").trim();
  const plain = stripHtmlToPlain(input?.html || "");
  const excerpt = plain.slice(0, 1600);
  return [
    "A grand 19th-century Romantic period orchestral concerto in the style of Frederic Chopin.",
    "Features a prominent, lyrical, and melancholic solo piano melody with expressive rubato.",
    "Accompanied by a lush string section, gentle woodwinds, and subtle brass.",
    "Mid-tempo, emotional, and elegant, with intricate piano flourishes and a dramatic orchestral swell.",
    "Instrumental only. No voice, no spoken words, no choir.",
    "Avoid modern pop structures and keep classical phrasing and harmonic language.",
    title ? `Title: ${title}.` : "",
    level ? `Level: ${level}.` : "",
    grade ? `Grade: ${grade}.` : "",
    excerpt ? `Reading excerpt: ${excerpt}` : "",
  ].filter(Boolean).join(" ");
}

function buildLyriaGamePrompt(input = {}) {
  const title = String(input?.title || "").trim();
  const plain = stripHtmlToPlain(input?.html || "");
  const excerpt = plain.slice(0, 1100);
  return [
    "Instrumental only. No voice, no spoken words, no choir.",
    "Transform the reading theme into energetic electronic game music.",
    "Use synthesizers, punchy drums, bass arpeggios, and bright leads.",
    "Maintain melodic relation to the original calm theme.",
    "Rhythmic, motivating, kid-friendly, no aggression.",
    "Suitable for educational mini-game action loop.",
    title ? `Title: ${title}.` : "",
    excerpt ? `Reading context: ${excerpt}` : "",
  ].filter(Boolean).join(" ");
}

function sanitizeLyriaModel(value = "") {
  const model = String(value || "").trim();
  const allowed = new Set(["lyria-realtime-exp", "lyria-002"]);
  return allowed.has(model) ? model : "lyria-realtime-exp";
}

function sanitizeLyriaConfig(input = {}) {
  const cfg = (input && typeof input === "object") ? input : {};
  const model = sanitizeLyriaModel(cfg.model || "lyria-realtime-exp");
  const sampleCount = Math.max(1, Math.min(4, Number(cfg.sampleCount || cfg.sample_count || 1)));
  const seedRaw = Number(cfg.seed);
  const seed = sampleCount > 1 ? null : (Number.isFinite(seedRaw) ? Math.max(0, Math.floor(seedRaw)) : null);
  const negativePrompt = String(cfg.negativePrompt || cfg.negative_prompt || "").trim().slice(0, 500);
  const guidanceRaw = Number(cfg.guidance);
  const guidance = Number.isFinite(guidanceRaw) ? Math.max(0, Math.min(6, guidanceRaw)) : null;
  const bpmRaw = Number(cfg.bpm);
  const bpm = Number.isFinite(bpmRaw) ? Math.max(60, Math.min(200, Math.round(bpmRaw))) : null;
  const densityRaw = Number(cfg.density);
  const density = Number.isFinite(densityRaw) ? Math.max(0, Math.min(1, densityRaw)) : null;
  const brightnessRaw = Number(cfg.brightness);
  const brightness = Number.isFinite(brightnessRaw) ? Math.max(0, Math.min(1, brightnessRaw)) : null;
  const temperatureRaw = Number(cfg.temperature);
  const temperature = Number.isFinite(temperatureRaw) ? Math.max(0, Math.min(2.5, temperatureRaw)) : null;
  const scaleRaw = String(cfg.scale || "").trim().toUpperCase();
  const scale = /^[A-G](#|B)?_(MAJOR|MINOR)$/.test(scaleRaw) ? scaleRaw : null;
  return {model, sampleCount, seed, negativePrompt, guidance, bpm, density, brightness, temperature, scale};
}

function encodeMp3FromPcm16Mono(pcmBuffer = Buffer.alloc(0), sampleRateHz = 24000, kbps = 96) {
  const pcm = Buffer.isBuffer(pcmBuffer) ? pcmBuffer : Buffer.from(pcmBuffer || []);
  const sampleRate = Math.max(8000, Math.min(48000, Number(sampleRateHz || 24000)));
  const bitrate = Math.max(64, Math.min(192, Number(kbps || 96)));
  const totalSamples = Math.floor(pcm.length / 2);
  const pcm16 = new Int16Array(totalSamples);
  for (let i = 0; i < totalSamples; i += 1) {
    pcm16[i] = pcm.readInt16LE(i * 2);
  }
  const encoder = new lamejs.Mp3Encoder(1, sampleRate, bitrate);
  const blockSize = 1152;
  const chunks = [];
  for (let i = 0; i < pcm16.length; i += blockSize) {
    const block = pcm16.subarray(i, i + blockSize);
    const mp3buf = encoder.encodeBuffer(block);
    if (mp3buf?.length) chunks.push(Buffer.from(mp3buf));
  }
  const flush = encoder.flush();
  if (flush?.length) chunks.push(Buffer.from(flush));
  return Buffer.concat(chunks);
}

function extractAudioChunksFromLyriaMessage(message = {}) {
  const out = [];
  const serverContent = message?.serverContent || {};
  const chunks = Array.isArray(serverContent?.audioChunks) ? serverContent.audioChunks : [];
  chunks.forEach((chunk) => {
    const data = String(chunk?.data || "").trim();
    if (!data) return;
    try {
      out.push(Buffer.from(data, "base64"));
    } catch (_) {}
  });
  return out;
}

function extractSampleRateFromLyriaMessage(message = {}, fallback = 24000) {
  const serverContent = message?.serverContent || {};
  const direct = Number(
      serverContent?.sampleRateHertz ||
      serverContent?.audioMetadata?.sampleRateHertz ||
      serverContent?.audioChunks?.[0]?.sampleRateHertz ||
      fallback,
  );
  if (!Number.isFinite(direct)) return Number(fallback || 24000);
  return Math.max(8000, Math.min(96000, Math.round(direct)));
}

async function generateLyriaPcmTrack(ai, prompt, options = {}) {
  const durationMs = Math.max(6000, Math.min(70000, Number(options?.durationMs || 22000)));
  const bpm = Math.max(60, Math.min(200, Number(options?.bpm || 88)));
  const model = sanitizeLyriaModel(options?.model || "lyria-realtime-exp");
  const seedRaw = Number(options?.seed);
  const seed = Number.isFinite(seedRaw) ? Math.max(0, Math.floor(seedRaw)) : null;
  const negativePrompt = String(options?.negativePrompt || "").trim();
  const guidanceRaw = Number(options?.guidance);
  const guidance = Number.isFinite(guidanceRaw) ? Math.max(0, Math.min(6, guidanceRaw)) : null;
  const densityRaw = Number(options?.density);
  const density = Number.isFinite(densityRaw) ? Math.max(0, Math.min(1, densityRaw)) : null;
  const brightnessRaw = Number(options?.brightness);
  const brightness = Number.isFinite(brightnessRaw) ? Math.max(0, Math.min(1, brightnessRaw)) : null;
  const temperatureRaw = Number(options?.temperature);
  const temperature = Number.isFinite(temperatureRaw) ? Math.max(0, Math.min(2.5, temperatureRaw)) : null;
  const scaleRaw = String(options?.scale || "").trim().toUpperCase();
  const scale = /^[A-G](#|B)?_(MAJOR|MINOR)$/.test(scaleRaw) ? scaleRaw : null;
  const promptText = [
    String(prompt || "").trim(),
    negativePrompt ? `Negative prompt (avoid): ${negativePrompt}` : "",
    seed !== null ? `Seed: ${seed}` : "",
  ].filter(Boolean).join("\n");
  const chunks = [];
  let sampleRateHz = 24000;
  const errors = [];

  const session = await ai.live.music.connect({
    model,
    callbacks: {
      onmessage: (message) => {
        const bufs = extractAudioChunksFromLyriaMessage(message);
        if (bufs.length) chunks.push(...bufs);
        sampleRateHz = extractSampleRateFromLyriaMessage(message, sampleRateHz);
      },
      onerror: (err) => {
        const msg = String(err?.message || err || "").trim();
        if (msg) errors.push(msg);
      },
    },
  });

  try {
    await session.setWeightedPrompts({
      weightedPrompts: [{text: promptText, weight: 1}],
    });
    const musicGenerationConfig = {bpm};
    if (guidance !== null) musicGenerationConfig.guidance = guidance;
    if (density !== null) musicGenerationConfig.density = density;
    if (brightness !== null) musicGenerationConfig.brightness = brightness;
    if (temperature !== null) musicGenerationConfig.temperature = temperature;
    if (scale) musicGenerationConfig.scale = scale;
    await session.setMusicGenerationConfig({
      musicGenerationConfig,
    });
    await session.play();
    await sleep(durationMs);
    await session.stop();
    await sleep(260);
  } finally {
    try {
      await session.close?.();
    } catch (_) {}
  }

  if (!chunks.length) {
    const hint = errors.length ? ` ${errors[0]}` : "";
    throw new Error(`Lyria no devolvió audio.${hint}`);
  }

  return {
    pcm: Buffer.concat(chunks),
    sampleRateHz,
  };
}

async function generateBestLyriaPcmTrack(ai, prompt, options = {}) {
  const sampleCount = Math.max(1, Math.min(4, Number(options?.sampleCount || 1)));
  let best = null;
  for (let i = 0; i < sampleCount; i += 1) {
    const track = await generateLyriaPcmTrack(ai, prompt, {
      ...options,
      seed: Number.isFinite(Number(options?.seed)) ? Number(options.seed) + i : null,
    });
    if (!best || track.pcm.length > best.pcm.length) best = track;
  }
  return best;
}

async function uploadLyriaAudioToStorage({
  bucket = null,
  path = "",
  audioBuffer = Buffer.alloc(0),
  contentType = "audio/mpeg",
  ownerUid = "",
  lecturaId = "",
  sourceCollection = "lecturasASC",
  mode = "reading",
}) {
  const targetBucket = bucket || admin.storage().bucket();
  const file = targetBucket.file(path);
  const token = randomUUID();
  await file.save(audioBuffer, {
    resumable: false,
    contentType,
    metadata: {
      cacheControl: "public,max-age=3600",
      metadata: {
        firebaseStorageDownloadTokens: token,
        ownerUid: String(ownerUid || ""),
        lecturaId: String(lecturaId || ""),
        sourceCollection: String(sourceCollection || "lecturasASC"),
        mode: String(mode || "reading"),
      },
    },
  });
  const encodedPath = encodeURIComponent(path);
  const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${targetBucket.name}/o/${encodedPath}?alt=media&token=${token}`;
  return {path, downloadUrl};
}

function decodeBase64DataUrl(dataUrl = "", maxBytes = SCREENSHOT_MAX_BYTES) {
  const raw = String(dataUrl || "").trim();
  const match = raw.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) {
    throw new HttpsError("invalid-argument", "Formato base64 inválido.");
  }
  const mimeType = String(match[1] || "").trim().toLowerCase();
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > Math.max(1, Number(maxBytes) || SCREENSHOT_MAX_BYTES)) {
    throw new HttpsError("invalid-argument", "Archivo demasiado grande.");
  }
  return {mimeType, buffer};
}

function decodeDataUrl(dataUrl = "") {
  const decoded = decodeBase64DataUrl(dataUrl, SCREENSHOT_MAX_BYTES);
  if (!String(decoded.mimeType || "").startsWith("image/")) {
    throw new HttpsError("invalid-argument", "Formato de imagen inválido.");
  }
  return decoded;
}

function getScreenshotExtension(mimeType = "image/jpeg") {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

function getAudioExtension(mimeType = "audio/mpeg") {
  if (mimeType === "audio/mpeg" || mimeType === "audio/mp3") return "mp3";
  if (mimeType === "audio/wav" || mimeType === "audio/x-wav") return "wav";
  if (mimeType === "audio/ogg") return "ogg";
  if (mimeType === "audio/mp4" || mimeType === "audio/aac") return "m4a";
  if (mimeType === "audio/flac" || mimeType === "audio/x-flac") return "flac";
  return "bin";
}

function readGeminiAudioParts(responseBody = {}) {
  const parts = Array.isArray(responseBody?.candidates?.[0]?.content?.parts) ?
    responseBody.candidates[0].content.parts :
    [];
  const audioParts = [];
  parts.forEach((part) => {
    const data = String(part?.inlineData?.data || part?.inline_data?.data || "").trim();
    if (!data) return;
    const mimeType = String(
        part?.inlineData?.mimeType ||
        part?.inline_data?.mimeType ||
        "audio/L16;rate=24000",
    ).trim() || "audio/L16;rate=24000";
    audioParts.push({data, mimeType});
  });
  return audioParts;
}

function pcm16ToWavBuffer(pcmBuffer = Buffer.alloc(0), sampleRateHz = 24000) {
  const pcm = Buffer.isBuffer(pcmBuffer) ? pcmBuffer : Buffer.from(pcmBuffer || []);
  const sampleRate = Math.max(8000, Math.min(96000, Number(sampleRateHz) || 24000));
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * 2;
  const blockAlign = 2;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function getVideoExtension(mimeType = "video/mp4") {
  const clean = String(mimeType || "").trim().toLowerCase();
  if (clean === "video/mp4") return "mp4";
  if (clean === "video/webm") return "webm";
  if (clean === "video/quicktime") return "mov";
  return "mp4";
}

async function uploadScreenshotAsset({
  bucket = null,
  path = "",
  buffer = Buffer.alloc(0),
  mimeType = "image/jpeg",
  metadata = {},
}) {
  const targetBucket = bucket || admin.storage().bucket();
  const file = targetBucket.file(path);
  const token = randomUUID();
  await file.save(buffer, {
    resumable: false,
    contentType: mimeType,
    metadata: {
      cacheControl: "public,max-age=86400",
      metadata: {
        firebaseStorageDownloadTokens: token,
        ...metadata,
      },
    },
  });
  return {
    path,
    downloadUrl: `https://firebasestorage.googleapis.com/v0/b/${targetBucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`,
  };
}

async function deleteStoragePath(bucket, storagePath = "") {
  if (!storagePath) return;
  await bucket.file(storagePath).delete({ignoreNotFound: true}).catch(() => {});
}

async function validateActiveMinebloxPlayer({roomId, playerId, clientSessionId}) {
  const room = String(roomId || "").trim();
  const player = String(playerId || "").trim();
  const session = String(clientSessionId || "").trim();
  if (!room || !player || !session) {
    throw new HttpsError("invalid-argument", "Faltan datos de sesión.");
  }
  const snap = await db.collection("mineblox_rooms").doc(room).collection("players").doc(player).get();
  if (!snap.exists) {
    // Be more lenient in dev/staging: auto-create if room exists but player sync is lagging
    const roomSnap = await db.collection("mineblox_rooms").doc(room).get();
    if (!roomSnap.exists) {
        throw new HttpsError("not-found", `Salón '${room}' no encontrado.`);
    }
    console.log(`[functions] player '${player}' not syncing yet, but room '${room}' is active. Allowing screenshot.`);
    return {clientSessionId: session, name: "Jugador Local"};
  }
  const data = snap.data() || {};
  const lastSeen = data.lastSeen?.toMillis ? data.lastSeen.toMillis() : 0;
  if (!lastSeen || (Date.now() - lastSeen) > ACTIVE_PLAYER_WINDOW_MS) {
    console.warn(`[functions] player '${player}' last seen more than 45s ago, proceed anyway.`);
  }
  if (String(data.clientSessionId || "").trim() && String(data.clientSessionId || "").trim() !== session) {
    console.warn(`[functions] player '${player}' session mismatch. Received: ${session}, Stored: ${data.clientSessionId}`);
  }
  return data;
}

async function pruneMinebloxScreenshots({roomId, visibility, playerId, bucket}) {
  const snap = await db.collection("mineblox_rooms").doc(roomId).collection("screenshots")
      .orderBy("createdAt", "desc")
      .limit(200)
      .get();
  const limit = visibility === "personal" ? SCREENSHOT_PERSONAL_LIMIT : SCREENSHOT_SHARED_LIMIT;
  const scoped = snap.docs.filter((docSnap) => {
    const data = docSnap.data() || {};
    if (String(data.visibility || "") !== visibility) return false;
    if (visibility === "personal" && String(data.authorId || "") !== playerId) return false;
    return true;
  });
  if (scoped.length <= limit) return;
  const extraDocs = scoped.slice(limit);
  await Promise.all(extraDocs.map(async (docSnap) => {
    const data = docSnap.data() || {};
    await Promise.all([
      deleteStoragePath(bucket, String(data.storagePath || "")),
      deleteStoragePath(bucket, String(data.thumbStoragePath || "")),
      docSnap.ref.delete().catch(() => {}),
    ]);
  }));
}

async function handleMinebloxScreenshotUpload(req, res) {
  const body = req.body || {};
  const roomId = String(body.roomId || "").trim();
  const playerId = String(body.playerId || "").trim();
  const visibility = String(body.visibility || "personal").trim() === "shared" ? "shared" : "personal";
  await validateActiveMinebloxPlayer({
    roomId,
    playerId,
    clientSessionId: body.clientSessionId,
  });
  const mainImage = decodeDataUrl(body.imageDataUrl);
  const thumbImage = decodeDataUrl(body.thumbDataUrl);
  const shotId = randomUUID();
  const bucket = admin.storage().bucket();
  const ext = getScreenshotExtension(mainImage.mimeType);
  const thumbExt = getScreenshotExtension(thumbImage.mimeType);
  const storagePath = visibility === "shared" ?
    `mineblox/screenshots/rooms/${roomId}/shared/${shotId}.${ext}` :
    `mineblox/screenshots/rooms/${roomId}/players/${playerId}/${shotId}.${ext}`;
  const thumbPath = visibility === "shared" ?
    `mineblox/screenshots/rooms/${roomId}/shared/${shotId}_thumb.${thumbExt}` :
    `mineblox/screenshots/rooms/${roomId}/players/${playerId}/${shotId}_thumb.${thumbExt}`;
  const [asset, thumb] = await Promise.all([
    uploadScreenshotAsset({
      bucket,
      path: storagePath,
      buffer: mainImage.buffer,
      mimeType: mainImage.mimeType,
      metadata: {roomId, playerId, shotId, visibility, kind: "main"},
    }),
    uploadScreenshotAsset({
      bucket,
      path: thumbPath,
      buffer: thumbImage.buffer,
      mimeType: thumbImage.mimeType,
      metadata: {roomId, playerId, shotId, visibility, kind: "thumb"},
    }),
  ]);
  const createdAt = new Date().toISOString();
  const record = {
    id: shotId,
    roomId,
    authorId: playerId,
    authorName: String(body.playerName || "Jugador").trim() || "Jugador",
    visibility,
    mimeType: mainImage.mimeType,
    width: Number(body.width || 0) || 0,
    height: Number(body.height || 0) || 0,
    thumbWidth: Number(body.thumbWidth || 0) || 0,
    thumbHeight: Number(body.thumbHeight || 0) || 0,
    bodyId: String(body.bodyId || "earth").trim() || "earth",
    season: body.season || null,
    weather: body.weather || null,
    viewMode: String(body.viewMode || "first").trim() || "first",
    createdAt,
    storagePath: asset.path,
    thumbStoragePath: thumb.path,
    downloadUrl: asset.downloadUrl,
    thumbUrl: thumb.downloadUrl,
  };
  await db.collection("mineblox_rooms").doc(roomId).collection("screenshots").doc(shotId).set(record);
  await pruneMinebloxScreenshots({roomId, visibility, playerId, bucket});
  return res.status(200).json({ok: true, record});
}

async function handleMinebloxScreenshotList(req, res) {
  const roomId = String(req.query?.roomId || "").trim();
  const playerId = String(req.query?.playerId || "").trim();
  await validateActiveMinebloxPlayer({
    roomId,
    playerId,
    clientSessionId: req.query?.clientSessionId,
  });
  const snap = await db.collection("mineblox_rooms").doc(roomId).collection("screenshots")
      .orderBy("createdAt", "desc")
      .limit(SCREENSHOT_SHARED_LIMIT + SCREENSHOT_PERSONAL_LIMIT)
      .get();
  const records = snap.docs
      .map((docSnap) => docSnap.data() || {})
      .filter((record) => record.visibility === "shared" || record.authorId === playerId);
  return res.status(200).json({ok: true, records});
}

function extractMusicAssetsFromDoc(data = {}) {
  const block = data?.music || data?.musica || {};
  return {
    readingUrl: String(block?.readingUrl || block?.lecturaUrl || data?.musicReadingUrl || "").trim(),
    gameUrl: String(block?.gameUrl || block?.juegoUrl || data?.musicGameUrl || "").trim(),
    readingPath: String(block?.readingPath || block?.lecturaPath || data?.musicReadingPath || "").trim(),
    gamePath: String(block?.gamePath || block?.juegoPath || data?.musicGamePath || "").trim(),
  };
}

async function forwardGeminiLyriaGenerate(req, res) {
  const uid = String(req.securityContext?.uid || "").trim();
  if (!uid) {
    throw new HttpsError("unauthenticated", "Falta contexto autenticado para generar audio.");
  }
  const key = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
  if (!key) return res.status(500).json({error: "Falta GEMINI_API_KEY o GOOGLE_API_KEY en backend."});

  const body = req.body || {};
  const lecturaId = String(body?.lecturaId || "").trim();
  const sourceCollection = sanitizeCollectionName(body?.sourceCollection || "lecturasASC");
  const force = body?.force === true;
  if (!lecturaId) return res.status(400).json({error: "lecturaId es obligatorio."});

  const lecturaRef = db.collection(sourceCollection).doc(lecturaId);
  const lecturaSnap = await lecturaRef.get();
  if (!lecturaSnap.exists) return res.status(404).json({error: "Lectura no encontrada."});
  const lecturaData = lecturaSnap.data() || {};
  const currentAssets = extractMusicAssetsFromDoc(lecturaData);
  if (!force && currentAssets.readingUrl && currentAssets.gameUrl) {
    return res.status(200).json({
      ok: true,
      source: "storage",
      readingUrl: currentAssets.readingUrl,
      gameUrl: currentAssets.gameUrl,
      readingPath: currentAssets.readingPath,
      gamePath: currentAssets.gamePath,
    });
  }

  const title = String(body?.title || lecturaData?.titulo || "").trim();
  const level = String(body?.level || lecturaData?.nivel || "").trim();
  const grade = String(body?.grade || lecturaData?.grado || "").trim();
  const html = String(body?.html || lecturaData?.textoLectura || lecturaData?.contenidoHTML || "").trim();
  const lyriaConfig = sanitizeLyriaConfig(body?.lyriaConfig || {});
  const promptReading = String(body?.promptReading || "").trim() || buildLyriaReadingPrompt({title, level, grade, html});
  const promptGame = String(body?.promptGame || "").trim() || buildLyriaGamePrompt({title, html});

  const ai = new GoogleGenAI({apiKey: key, apiVersion: "v1alpha"});
  const [readingRaw, gameRaw] = await Promise.all([
    generateBestLyriaPcmTrack(ai, promptReading, {
      durationMs: 22000,
      bpm: lyriaConfig.bpm || 78,
      model: lyriaConfig.model,
      sampleCount: lyriaConfig.sampleCount,
      seed: lyriaConfig.seed,
      negativePrompt: lyriaConfig.negativePrompt,
      guidance: lyriaConfig.guidance,
      density: lyriaConfig.density,
      brightness: lyriaConfig.brightness,
      temperature: lyriaConfig.temperature,
      scale: lyriaConfig.scale,
    }),
    generateBestLyriaPcmTrack(ai, promptGame, {
      durationMs: 22000,
      bpm: lyriaConfig.bpm || 126,
      model: lyriaConfig.model,
      sampleCount: lyriaConfig.sampleCount,
      seed: lyriaConfig.seed,
      negativePrompt: lyriaConfig.negativePrompt,
      guidance: lyriaConfig.guidance,
      density: lyriaConfig.density,
      brightness: lyriaConfig.brightness,
      temperature: lyriaConfig.temperature,
      scale: lyriaConfig.scale,
    }),
  ]);

  const bucket = admin.storage().bucket();
  const basePath = `lecturas_music/${sourceCollection}/${lecturaId}`;
  const readingMp3 = encodeMp3FromPcm16Mono(readingRaw.pcm, readingRaw.sampleRateHz, 96);
  const gameMp3 = encodeMp3FromPcm16Mono(gameRaw.pcm, gameRaw.sampleRateHz, 112);
  const [readingUpload, gameUpload] = await Promise.all([
    uploadLyriaAudioToStorage({
      bucket,
      path: `${basePath}/reading.mp3`,
      audioBuffer: readingMp3,
      contentType: "audio/mpeg",
      ownerUid: uid,
      lecturaId,
      sourceCollection,
      mode: "reading",
    }),
    uploadLyriaAudioToStorage({
      bucket,
      path: `${basePath}/game.mp3`,
      audioBuffer: gameMp3,
      contentType: "audio/mpeg",
      ownerUid: uid,
      lecturaId,
      sourceCollection,
      mode: "game",
    }),
  ]);

  const nowIso = new Date().toISOString();
  await lecturaRef.update({
    music: {
      model: lyriaConfig.model,
      generatedAt: nowIso,
      generatedBy: uid,
      readingUrl: readingUpload.downloadUrl,
      gameUrl: gameUpload.downloadUrl,
      readingPath: readingUpload.path,
      gamePath: gameUpload.path,
      promptReading,
      promptGame,
      sampleCount: lyriaConfig.sampleCount,
      seed: lyriaConfig.seed,
      negativePrompt: lyriaConfig.negativePrompt,
      guidance: lyriaConfig.guidance,
      bpm: lyriaConfig.bpm,
      density: lyriaConfig.density,
      brightness: lyriaConfig.brightness,
      temperature: lyriaConfig.temperature,
      scale: lyriaConfig.scale,
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return res.status(200).json({
    ok: true,
    source: "generated",
    model: lyriaConfig.model,
    readingUrl: readingUpload.downloadUrl,
    gameUrl: gameUpload.downloadUrl,
    readingPath: readingUpload.path,
    gamePath: gameUpload.path,
    sampleCount: lyriaConfig.sampleCount,
    seed: lyriaConfig.seed,
    negativePrompt: lyriaConfig.negativePrompt,
    guidance: lyriaConfig.guidance,
    bpm: lyriaConfig.bpm,
    density: lyriaConfig.density,
    brightness: lyriaConfig.brightness,
    temperature: lyriaConfig.temperature,
    scale: lyriaConfig.scale,
  });
}

async function routeApi(req, res) {
  const path = normalizePath(req.path || req.url || "");
  if (PROTECTED_API_PATHS.has(path)) {
    req.securityContext = await enforceApiRequestSecurity(req, path);
  }

  if (req.method === "POST" && path === "/api/gemini/generate") {
    return forwardGeminiGenerate(req, res);
  }
  if (req.method === "GET" && path === "/api/gemini/models") {
    return forwardGeminiModels(req, res);
  }
  if (req.method === "GET" && path === "/api/assets/proxy-media") {
    return forwardAssetsProxyMedia(req, res);
  }
  if (req.method === "POST" && path === "/api/gemini/live-token") {
    return forwardGeminiLiveToken(req, res);
  }
  if (req.method === "POST" && path === "/api/podcaster/sessions/save") {
    return forwardPodcasterSessionSave(req, res);
  }
  if (req.method === "POST" && path === "/api/podcaster/sessions/share") {
    return forwardPodcasterSessionShare(req, res);
  }
  if (req.method === "GET" && path === "/api/podcaster/sessions/list") {
    return forwardPodcasterSessionList(req, res);
  }
  if (req.method === "GET" && path === "/api/podcaster/scene-library/list") {
    return forwardPodcasterSceneLibraryList(req, res);
  }
  if (req.method === "POST" && path === "/api/podcaster/scene-library/publish") {
    return forwardPodcasterSceneLibraryPublish(req, res);
  }
  if (req.method === "POST" && path === "/api/podcaster/scene-library/upload-local") {
    return forwardPodcasterSceneLibraryUploadLocal(req, res);
  }
  if (req.method === "POST" && path === "/api/podcaster/scene-library/update") {
    return forwardPodcasterSceneLibraryUpdate(req, res);
  }
  if (req.method === "POST" && path === "/api/podcaster/scene-library/delete") {
    return forwardPodcasterSceneLibraryDelete(req, res);
  }
  if (req.method === "GET" && path === "/api/moodle/share-users") {
    return forwardMoodleShareUsers(req, res);
  }
  if (req.method === "POST" && path === "/api/moodle/module-graphics/generate") {
    return forwardMoodleModuleGraphicGenerate(req, res);
  }
  if (req.method === "POST" && path === "/api/moodle/module-graphics/generate-element") {
    return forwardMoodleModuleGraphicGenerateElement(req, res);
  }
  if (req.method === "POST" && path === "/api/moodle/module-graphics/analyze-element") {
    return forwardMoodleModuleGraphicAnalyzeElement(req, res);
  }
  if (req.method === "POST" && path === "/api/podcaster/speaker-portraits/generate") {
    return forwardPodcasterSpeakerPortraitGenerate(req, res);
  }
  if (req.method === "POST" && path === "/api/podcaster/scenario-images/generate") {
    return forwardPodcasterScenarioImageGenerate(req, res);
  }
  if (req.method === "POST" && path === "/api/podcaster/dialogue-videos/generate") {
    return forwardPodcasterDialogueVideoGenerate(req, res);
  }
  if (req.method === "POST" && path === "/api/podcaster/dialogue-audio/generate") {
    return forwardPodcasterDialogueAudioGenerate(req, res);
  }
  if (req.method === "POST" && path === "/api/podcaster/music/upload") {
    return forwardPodcasterMusicUpload(req, res);
  }
  if (req.method === "POST" && path === "/api/gemini/lyria/generate") {
    return forwardGeminiLyriaGenerate(req, res);
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
  if (req.method === "POST" && path === "/api/mineblox/screenshots/upload") {
    return handleMinebloxScreenshotUpload(req, res);
  }
  if (req.method === "GET" && path === "/api/mineblox/screenshots/list") {
    return handleMinebloxScreenshotList(req, res);
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
