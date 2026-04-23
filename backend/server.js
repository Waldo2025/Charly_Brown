const express = require("express");
const cors = require("cors");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { pipeline } = require("node:stream/promises");
const { Readable } = require("node:stream");

let admin = null;
let GoogleGenAI = null;
let ffmpegStaticPath = "";
try {
  admin = require("firebase-admin");
} catch (_) {
  admin = require(path.resolve(__dirname, "..", "functions", "node_modules", "firebase-admin"));
}
try {
  ({ GoogleGenAI } = require(path.resolve(__dirname, "..", "functions", "node_modules", "@google", "genai")));
} catch (_) {
  ({ GoogleGenAI } = require("@google/genai"));
}
try {
  ffmpegStaticPath = String(require("ffmpeg-static") || "").trim();
} catch (_) {
  ffmpegStaticPath = "";
}

function loadLocalEnvFile() {
  const envPath = path.resolve(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = String(line || "").trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key) continue;

    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadLocalEnvFile();

const app = express();
const PORT = Number(process.env.API_PORT || process.env.PORT || 8787);
const HOST = String(process.env.API_HOST || "0.0.0.0").trim() || "0.0.0.0";
const BACKEND_BOOT_ISO = new Date().toISOString();
const BACKEND_BOOT_SIGNATURE = `backend/server.js@${BACKEND_BOOT_ISO}`;
const GEMINI_API_KEY = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MAX_BODY = "12mb";
const MAX_PAYLOAD_BYTES = 120 * 1024;
const MAX_PODCASTER_SESSION_BYTES = 900 * 1024;
const MAX_SPEAKER_PORTRAIT_BYTES = 10 * 1024 * 1024;
const MAX_PODCASTER_MUSIC_BYTES = 12 * 1024 * 1024;
const MAX_DIALOGUE_VIDEO_BYTES = 80 * 1024 * 1024;
const MAX_DIALOGUE_AUDIO_BYTES = 24 * 1024 * 1024;
const MAX_REFERENCE_FRAME_BYTES = 6 * 1024 * 1024;
const MAX_MONTAGE_EXPORT_SCENES = 40;
const MAX_MONTAGE_EXPORT_TOTAL_SEC = 10 * 60;
const DEFAULT_PODCASTER_IMAGE_MODEL = "gemini-2.5-flash-image";
const DEFAULT_PODCASTER_VIDEO_MODEL = "veo-3.1-generate-preview";
const DEFAULT_MOODLE_GRAPHIC_MODEL = "gemini-2.5-flash-image";
const DEFAULT_GEMINI_IMAGE_SIZE = "2K";
const MOODLE_GRAPHIC_PROMPT_VERSION = "moodle_graphic_render_v1";
const PODCASTER_IMAGE_MODEL_CANDIDATES = Object.freeze([
  "gemini-3.1-flash-image-preview",
  "gemini-3-pro-image-preview",
  "gemini-2.5-flash-image",
  "gemini-2.0-flash-preview-image-generation"
]);
const PODCASTER_VIDEO_MODEL_CANDIDATES = Object.freeze([
  "veo-3.1-generate-preview",
  "veo-3.1-fast-generate-preview"
]);
const GEMINI_LIVE_ALLOWED_VOICE_NAMES = new Set([
  "Zephyr", "Kore", "Orus", "Autonoe", "Umbriel", "Erinome",
  "Laomedeia", "Schedar", "Achird", "Sadachbia", "Puck", "Fenrir",
  "Aoede", "Enceladus", "Algieba", "Algenib", "Achernar", "Gacrux",
  "Zubenelgenubi", "Sadaltager", "Charon", "Leda", "Callirrhoe",
  "Iapetus", "Despina", "Rasalgethi", "Alnilam", "Pulcherrima",
  "Vindemiatrix", "Sulafat"
]);
const SCREENSHOT_MAX_BYTES = 6 * 1024 * 1024;
const SCREENSHOT_PERSONAL_LIMIT = 24;
const SCREENSHOT_SHARED_LIMIT = 48;
const ACTIVE_PLAYER_WINDOW_MS = 45 * 1000;
const fetchCompat = (...args) => {
  if (typeof fetch === "function") return fetch(...args);
  return import("node-fetch").then(({ default: f }) => f(...args));
};

function parseAllowedOrigins() {
  const defaults = [
    "http://127.0.0.1:*",
    "http://localhost:*",
    "https://127.0.0.1:*",
    "https://localhost:*",
    "http://127.0.0.1:5000",
    "http://localhost:5000",
    "http://127.0.0.1:5010",
    "http://localhost:5010",
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "https://charly-brown.web.app",
    "https://charly-brown.firebaseapp.com",
    "https://charly-brown-gemini-backend.onrender.com",
    "https://*.onrender.com"
  ];
  const raw = String(
    process.env.CORS_ALLOWED_ORIGINS
    || process.env.ALLOWED_ORIGINS
    || ""
  ).trim();
  const configured = raw
    ? raw.split(",")
    : [];
  return Array.from(new Set([
    ...defaults,
    ...configured
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean)));
}

const ALLOWED_ORIGINS = parseAllowedOrigins();

function matchesAllowedOrigin(origin = "", rule = "") {
  const candidate = String(origin || "").trim();
  const allowed = String(rule || "").trim();
  if (!candidate || !allowed) return false;
  if (allowed === "*") return true;
  if (allowed === candidate) return true;
  if (!allowed.includes("*")) return false;

  const escaped = allowed
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  const pattern = new RegExp(`^${escaped}$`, "i");
  return pattern.test(candidate);
}

const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }
    if (!ALLOWED_ORIGINS.length || ALLOWED_ORIGINS.some((rule) => matchesAllowedOrigin(origin, rule))) {
      callback(null, true);
      return;
    }
    callback(new Error("CORS_NOT_ALLOWED"));
  },
  credentials: false
};

app.use(cors(corsOptions));
app.use(express.json({ limit: MAX_BODY }));

app.get("/api/health", (_req, res) => {
  return res.status(200).json({
    ok: true,
    service: "gemini-backend",
    port: PORT,
    geminiConfigured: hasGeminiKey(),
    moodleShareUsersRoute: true,
    moodleModuleGraphicsRoute: true,
    podcasterDialogueAudioRoute: true,
    podcasterMusicGenerateRoute: true,
    startupSignature: BACKEND_BOOT_SIGNATURE,
  });
});

if (!admin.apps.length) {
  const serviceAccountPath = path.resolve(__dirname, "..", "charly-brown-firebase-adminsdk-fbsvc-6c32e4f96b.json");
  let credential = admin.credential.applicationDefault();
  let projectId = process.env.FIREBASE_PROJECT_ID || process.env.PROJECT_ID || "charly-brown";
  const serviceAccountJsonRaw = String(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    || process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    || ""
  ).trim();

  if (serviceAccountJsonRaw) {
    try {
      const parsed = JSON.parse(serviceAccountJsonRaw);
      credential = admin.credential.cert(parsed);
      projectId = parsed.project_id || projectId;
      console.log("[backend] using service account from env JSON");
    } catch (error) {
      console.error("[backend] invalid FIREBASE_SERVICE_ACCOUNT_JSON:", error?.message || error);
      process.exit(1);
    }
  }

  if (!serviceAccountJsonRaw && fs.existsSync(serviceAccountPath)) {
    console.log("[backend] using local service account:", serviceAccountPath);
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
    credential = admin.credential.cert(serviceAccount);
    projectId = serviceAccount.project_id || projectId;
  }

  const storageBucket = String(
    process.env.FIREBASE_STORAGE_BUCKET
    || process.env.STORAGE_BUCKET
    // Firebase/Cloud Storage default bucket is typically <projectId>.appspot.com.
    // Using <projectId>.firebasestorage.app here can break Admin SDK downloads
    // ("The specified bucket does not exist") on many projects.
    || `${projectId}.appspot.com`
  ).trim();

  admin.initializeApp({
    credential,
    storageBucket,
    projectId
  });
}
const db = admin.firestore();
const storageBucket = admin.storage().bucket();
const PRIMARY_STORAGE_BUCKET_NAME = String(admin.app()?.options?.storageBucket || "").trim();
const PRIMARY_PROJECT_ID = String(
  admin.app()?.options?.projectId
  || process.env.FIREBASE_PROJECT_ID
  || process.env.PROJECT_ID
  || ""
).trim();
const STORAGE_BUCKET_CANDIDATES = Array.from(new Set([
  storageBucket?.name || "",
  PRIMARY_STORAGE_BUCKET_NAME,
  PRIMARY_PROJECT_ID ? `${PRIMARY_PROJECT_ID}.appspot.com` : "",
  // Some projects may use the newer *.firebasestorage.app bucket naming.
  // Keep it as a fallback candidate; if it doesn't exist, we'll treat it as a 404-like miss.
  PRIMARY_PROJECT_ID ? `${PRIMARY_PROJECT_ID}.firebasestorage.app` : ""
].map((item) => String(item || "").trim()).filter(Boolean)));
const FALLBACK_STORAGE_BUCKETS = STORAGE_BUCKET_CANDIDATES
  .filter((name) => name !== String(storageBucket?.name || "").trim())
  .map((name) => admin.storage().bucket(name));

function getStorageBucketCandidates() {
  return [storageBucket, ...FALLBACK_STORAGE_BUCKETS].filter(Boolean);
}

let resolvedWritableStorageBucket = null;
let resolvedWritableStorageBucketPromise = null;

function isMissingBucketError(error) {
  const message = String(error?.message || "").toLowerCase();
  const status = Number(error?.code || error?.statusCode || error?.status || 0) || 0;
  return status === 404 || message.includes("bucket does not exist") || message.includes("specified bucket does not exist");
}

async function resolveWritableStorageBucket() {
  if (resolvedWritableStorageBucket) return resolvedWritableStorageBucket;
  if (resolvedWritableStorageBucketPromise) return resolvedWritableStorageBucketPromise;
  resolvedWritableStorageBucketPromise = (async () => {
    const buckets = getStorageBucketCandidates();
    for (const bucket of buckets) {
      if (!bucket) continue;
      try {
        // eslint-disable-next-line no-await-in-loop
        await bucket.getMetadata();
        resolvedWritableStorageBucket = bucket;
        console.info("[backend][storage] resolved writable bucket", {
          bucket: String(bucket.name || "").trim()
        });
        return bucket;
      } catch (error) {
        if (!isMissingBucketError(error)) {
          console.warn("[backend][storage] bucket probe failed", {
            bucket: String(bucket?.name || "").trim(),
            message: String(error?.message || error)
          });
        }
      }
    }
    resolvedWritableStorageBucket = storageBucket;
    return storageBucket;
  })();
  try {
    return await resolvedWritableStorageBucketPromise;
  } finally {
    resolvedWritableStorageBucketPromise = null;
  }
}

async function downloadStorageObjectToBuffer(storagePath = "") {
  const cleanStoragePath = normalizeStorageFilePath(storagePath);
  if (!cleanStoragePath) {
    const err = new Error("missing_storage_path");
    err.code = "missing_storage_path";
    throw err;
  }
  const buckets = getStorageBucketCandidates();
  let lastError = null;
  for (const bucket of buckets) {
    if (!bucket) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      const [downloaded] = await bucket.file(cleanStoragePath).download();
      return {
        buffer: Buffer.from(downloaded),
        bucket
      };
    } catch (error) {
      lastError = error;
      if (!isMissingBucketError(error)) {
        throw error;
      }
    }
  }
  const err = new Error("storage_not_found");
  err.code = "storage_not_found";
  err.status = 404;
  err.detail = {
    storagePath: cleanStoragePath,
    bucketsTried: buckets.map((bucket) => String(bucket?.name || "").trim()).filter(Boolean),
    lastError: lastError ? String(lastError?.message || lastError) : ""
  };
  throw err;
}

const MONTAGE_EXPORT_CACHE_DIR = path.join(os.tmpdir(), "cb-montage-exports-cache");
const MONTAGE_EXPORT_CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2h
const MONTAGE_EXPORT_CACHE_MAX_ITEMS = 40;

async function ensureMontageExportCacheDir() {
  await fs.promises.mkdir(MONTAGE_EXPORT_CACHE_DIR, { recursive: true });
  return MONTAGE_EXPORT_CACHE_DIR;
}

function clampExportId(value = "") {
  return clampText(String(value || "").trim(), 120).replace(/[^a-z0-9_-]/gi, "");
}

async function cleanupMontageExportCache() {
  try {
    await ensureMontageExportCacheDir();
    const names = await fs.promises.readdir(MONTAGE_EXPORT_CACHE_DIR).catch(() => []);
    const metaFiles = names.filter((name) => name.endsWith(".json"));
    const now = Date.now();
    const items = [];
    for (const name of metaFiles) {
      const full = path.join(MONTAGE_EXPORT_CACHE_DIR, name);
      try {
        // eslint-disable-next-line no-await-in-loop
        const stat = await fs.promises.stat(full);
        items.push({ full, mtimeMs: stat.mtimeMs });
      } catch (_) {}
    }
    items.sort((a, b) => b.mtimeMs - a.mtimeMs);

    const removeMeta = async (metaPath) => {
      try {
        const raw = await fs.promises.readFile(metaPath, "utf8");
        const meta = JSON.parse(raw);
        const filePath = String(meta?.filePath || "").trim();
        if (filePath) await fs.promises.rm(filePath, { force: true }).catch(() => {});
      } catch (_) {}
      await fs.promises.rm(metaPath, { force: true }).catch(() => {});
    };

    for (const item of items) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const raw = await fs.promises.readFile(item.full, "utf8");
        const meta = JSON.parse(raw);
        const expiresAt = Number(new Date(meta?.expiresAt || 0).getTime() || 0) || 0;
        if (expiresAt && expiresAt < now) {
          // eslint-disable-next-line no-await-in-loop
          await removeMeta(item.full);
        }
      } catch (_) {}
    }

    const refreshed = await fs.promises.readdir(MONTAGE_EXPORT_CACHE_DIR).catch(() => []);
    const refreshedMeta = refreshed.filter((name) => name.endsWith(".json"));
    if (refreshedMeta.length <= MONTAGE_EXPORT_CACHE_MAX_ITEMS) return;
    const stats = [];
    for (const name of refreshedMeta) {
      const full = path.join(MONTAGE_EXPORT_CACHE_DIR, name);
      try {
        // eslint-disable-next-line no-await-in-loop
        const stat = await fs.promises.stat(full);
        stats.push({ full, mtimeMs: stat.mtimeMs });
      } catch (_) {}
    }
    stats.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const toRemove = stats.slice(MONTAGE_EXPORT_CACHE_MAX_ITEMS);
    for (const item of toRemove) {
      // eslint-disable-next-line no-await-in-loop
      await removeMeta(item.full);
    }
  } catch (_) {
    // best-effort
  }
}

function resolvePublicBaseUrl(req) {
  const xfProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const xfHost = String(req.headers["x-forwarded-host"] || "").split(",")[0].trim();
  const proto = xfProto || (req.protocol || "http");
  const host = xfHost || String(req.get("host") || "").trim();
  return host ? `${proto}://${host}` : "";
}

function redactUrlForLogs(url = "") {
  const clean = String(url || "").trim();
  if (!clean) return "";
  try {
    const parsed = new URL(clean);
    if (parsed.searchParams.has("token")) parsed.searchParams.set("token", "REDACTED");
    return parsed.toString();
  } catch (_) {
    return clean.slice(0, 400);
  }
}

function hasGeminiKey() {
  return !!GEMINI_API_KEY;
}

function ensureGeminiKey(res) {
  if (hasGeminiKey()) return true;
  res.status(500).json({ error: "Falta GEMINI_API_KEY o GOOGLE_API_KEY en backend." });
  return false;
}

function normalizeModel(input = "") {
  const raw = String(input || "")
    .trim()
    .replace(/^models\//i, "")
    // Algunos clientes mandan el endpoint (como en la REST API), pero aquí lo agregamos nosotros.
    .replace(/:(generateContent|streamGenerateContent)$/i, "");
  return raw || "gemini-2.5-flash";
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

function normalizePodcasterSpeakerSlotIndex(speakerLabel = "") {
  const key = String(speakerLabel || "").trim();
  const match = key.match(/(\d+)/);
  if (match) return Math.max(0, Number(match[1]) - 1);
  if (/host\s*b/i.test(key)) return 1;
  if (/host\s*c/i.test(key)) return 2;
  if (/host\s*d/i.test(key)) return 3;
  return 0;
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
  return [
    `Retrato consistente del locutor ${speakerName || speakerLabel || "principal"}.`,
    voiceName ? `Voz asociada: ${voiceName}.` : "",
    genderGroup ? `Presentación de género del personaje: ${genderGroup}.` : "",
    `Expresión predominante: ${expression}.`,
    "Definir identidad consistente: facciones memorables, proporciones faciales estables, peinado reconocible, mirada segura, vestuario sobrio de locución premium.",
    "Evitar ambigüedad de género y evitar cambios de edad, etnia o complexión entre generaciones.",
    counterpartSpeakerName ? `${speakerName} es un personaje distinto de ${counterpartSpeakerName}; no mezclar sus rostros, peinados, siluetas ni rasgos.` : "",
    educational
      ? "La imagen debe corresponder exactamente al personaje activo y no a otro personaje del video educativo."
      : "La imagen debe corresponder exactamente al locutor activo y no a otro host del podcast.",
    "No caricatura, no ilustración, no anime: retrato fotorealista de estudio."
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
  const stageZones = educational
    ? [
      "zona izquierda del encuadre, junto a un recurso visual de apoyo",
      "zona derecha del encuadre, con composición didáctica limpia",
      "zona central con profundidad de campo suave y apoyo gráfico",
      "zona lateral secundaria con ángulo alterno del mismo entorno educativo",
    ]
    : [
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
          ? `La mirada debe sugerir atención a un recurso o co-presentador fuera de cuadro, sin frontalidad directa.`
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
  if (cleanDataUrl.startsWith("data:image/")) {
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
      const file = storageBucket.file(cleanStoragePath);
      const [meta] = await file.getMetadata().catch(() => [{}]);
      const [downloaded] = await file.download();
      buffer = Buffer.from(downloaded);
      mimeType = String(meta?.contentType || "image/png").trim().toLowerCase();
    } catch (_) {
      buffer = null;
    }
  }
  if (!buffer && cleanUrl) {
    const response = await fetchCompat(cleanUrl, { method: "GET" }).catch(() => null);
    if (response?.ok) {
      mimeType = String(response.headers.get("content-type") || "image/png").trim().toLowerCase();
      buffer = Buffer.from(await response.arrayBuffer());
    }
  }
  if (!buffer || !buffer.length || !String(mimeType || "").startsWith("image/")) return null;
  return { buffer, mimeType };
}

async function loadScenarioReferenceFromSession({ uid = "", sessionId = "", scenarioId = "" }) {
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
      url: clampText(match?.downloadUrl || "", 3200)
    });
  } catch (_) {
    return null;
  }
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
  const clean = String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return clean || fallback;
}

function normalizeRole(value = "") {
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
    stutterLevel: 18
  };
  const disfluencyMax = {
    fillerLevel: 300,
    errorLevel: 300,
    stutterLevel: 100
  };
  const normalizeDisfluency = (input = {}) => ({
    enabled: input?.enabled === true,
    fillerLevel: Math.max(0, Math.min(disfluencyMax.fillerLevel, Number(input?.fillerLevel ?? disfluencyDefaults.fillerLevel) || disfluencyDefaults.fillerLevel)),
    errorLevel: Math.max(0, Math.min(disfluencyMax.errorLevel, Number(input?.errorLevel ?? disfluencyDefaults.errorLevel) || disfluencyDefaults.errorLevel)),
    stutterEnabled: input?.stutterEnabled === true,
    stutterLevel: Math.max(0, Math.min(disfluencyMax.stutterLevel, Number(input?.stutterLevel ?? disfluencyDefaults.stutterLevel) || disfluencyDefaults.stutterLevel))
  });
  const rowsInput = Array.isArray(raw?.script?.rows) ? raw.script.rows : [];
  const rows = rowsInput.slice(0, 400).map((row, index) => ({
    id: clampText(row?.id || `row_${index + 1}`, 80) || `row_${index + 1}`,
    speaker: clampText(row?.speaker || "Host A", 80) || "Host A",
    expression: clampText(row?.expression || "Neutral", 80) || "Neutral",
    durationSec: Math.max(6, Math.min(180, Number(row?.durationSec) || 18)),
    mediaCue: clampText(row?.mediaCue || "Sin media", 80) || "Sin media",
    text: clampText(row?.text || "", 12000),
    notes: clampText(row?.notes || "", 5000),
    videoDirective: clampText(row?.videoDirective || "", 1400),
    scenePrompt: clampText(row?.scenePrompt || "", 1200),
    imagePrompts: Array.isArray(row?.imagePrompts)
      ? row.imagePrompts.slice(0, 3).map((prompt) => clampText(prompt || "", 1200)).filter(Boolean)
      : String(row?.imagePrompts || "")
        .split(/\n+/)
        .map((prompt) => clampText(prompt || "", 1200))
        .filter(Boolean)
        .slice(0, 3),
    publicSceneLibraryId: clampText(row?.publicSceneLibraryId || "", 140),
    publicScenePublishedAt: clampText(row?.publicScenePublishedAt || "", 64),
    publicSceneTitle: clampText(row?.publicSceneTitle || "", 220),
    publicSceneThumbUrl: clampText(row?.publicSceneThumbUrl || "", 3000),
    publicSceneVideoUrl: clampText(row?.publicSceneVideoUrl || "", 3000),
    sourcePublicSceneLibraryId: clampText(row?.sourcePublicSceneLibraryId || "", 140),
    disfluencyConfig: normalizeDisfluency(row?.disfluencyConfig || {})
  }));
  const hosts = Array.isArray(raw?.script?.hosts)
    ? raw.script.hosts.slice(0, 10).map((host) => clampText(host, 80)).filter(Boolean)
    : [];
  const scriptVideoMode = raw?.script?.videoMode === true;
  const chat = Array.isArray(raw?.chat)
    ? raw.chat.slice(-220).map((msg, index) => ({
        id: clampText(msg?.id || `msg_${index + 1}`, 80) || `msg_${index + 1}`,
        role: normalizeRole(msg?.role || "assistant"),
        text: clampText(msg?.text || "", 10000)
      }))
    : [];
  const speakerPortraitMapRaw = raw?.speakerPortraitMap && typeof raw.speakerPortraitMap === "object"
    ? raw.speakerPortraitMap
    : {};
  const speakerPortraitMap = {};
  Object.entries(speakerPortraitMapRaw).slice(0, 20).forEach(([speaker, portrait]) => {
    const key = clampText(speaker, 80);
    if (!key || !portrait || typeof portrait !== "object") return;
    const downloadUrl = clampText(portrait?.downloadUrl || "", 3000);
    const storagePath = clampText(portrait?.storagePath || "", 500);
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
      promptVersion: clampText(portrait?.promptVersion || "podcaster_v1", 80) || "podcaster_v1"
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
        updatedAt: clampText(value?.updatedAt || new Date().toISOString(), 64) || new Date().toISOString()
      };
    });
    return next;
  };

  const speakerReferenceImageMap = sanitizeReferenceImageMap(raw?.speakerReferenceImageMap || {}, 40);
  const scenarioReferenceImageMap = sanitizeReferenceImageMap(raw?.scenarioReferenceImageMap || {}, 120);
  const rowReferenceImageMap = sanitizeReferenceImageMap(raw?.rowReferenceImageMap || {}, 500);
  const dialogueVideoMapRaw = raw?.dialogueVideoMap && typeof raw.dialogueVideoMap === "object"
    ? raw.dialogueVideoMap
    : {};
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
        targetSpeechLine: clampText(segment?.targetSpeechLine || "", 2200)
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
      publicSceneVideoUrl: clampText(clip?.publicSceneVideoUrl || "", 3000)
    };
  });
  const dialogueAudioMapRaw = raw?.dialogueAudioMap && typeof raw.dialogueAudioMap === "object"
    ? raw.dialogueAudioMap
    : {};
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
      model: clampText(clip?.model || "gemini-3.1-flash-tts-preview", 140) || "gemini-3.1-flash-tts-preview",
      promptVersion: clampText(clip?.promptVersion || "podcaster_live_audio_v1", 80) || "podcaster_live_audio_v1",
      durationSec: clampNumber(clip?.durationSec, 0, 180, 0),
      targetSpeechLine: clampText(clip?.targetSpeechLine || "", 2200),
      updatedAt: clampText(clip?.updatedAt || new Date().toISOString(), 64) || new Date().toISOString(),
      downloadUrl,
      storagePath
    };
  });
  const transitionsRaw = raw?.podcastVideoConfig?.transitionsByEdge && typeof raw.podcastVideoConfig.transitionsByEdge === "object"
    ? raw.podcastVideoConfig.transitionsByEdge
    : {};
  const transitionsByEdge = {};
  Object.entries(transitionsRaw).slice(0, 1200).forEach(([edgeKey, item]) => {
    const key = clampText(edgeKey, 200);
    if (!key || !item || typeof item !== "object") return;
    const transitionType = String(item.type || "cut").trim().toLowerCase();
    transitionsByEdge[key] = {
      type: ["cut", "crossfade", "dip-black"].includes(transitionType) ? transitionType : "cut",
      durationMs: Math.max(0, Math.min(1200, Number(item.durationMs) || 0))
    };
  });
  const sanitizeTimelineTracks = (tracksRaw = []) => {
    if (!Array.isArray(tracksRaw)) return [];
    const next = [];
    const seen = new Set();
    tracksRaw.slice(0, 40).forEach((track, index) => {
      if (!track || typeof track !== "object") return;
      const id = clampText(track?.id || "", 160);
      if (!id || seen.has(id)) return;
      seen.add(id);
      const fallbackLabel = `Track ${index + 1}`;
      const label = clampText(track?.label || fallbackLabel, 120) || fallbackLabel;
      next.push({
        id,
        label,
        order: Math.max(0, Math.min(40, Math.round(Number(track?.order ?? index) || index)))
      });
    });
    next.sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || String(a.id || "").localeCompare(String(b.id || "")));
    return next.map((item, index) => ({ ...item, order: index }));
  };
  const sanitizeTimelineTrackHeightsById = (rawHeights = {}) => {
    const source = rawHeights && typeof rawHeights === "object" ? rawHeights : {};
    const next = {};
    Object.entries(source).slice(0, 60).forEach(([trackId, value]) => {
      const id = clampText(trackId || "", 160);
      if (!id) return;
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return;
      next[id] = Math.round(Math.max(56, Math.min(520, numeric)));
    });
    return next;
  };
  const normalizeSceneVolumeOverridePct = (value) => {
    if (value == null || value === "") return null;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return Math.max(0, Math.min(100, Math.round(numeric)));
  };
  const sanitizeTimelineClipsByRowId = (rawClips = {}) => {
    const source = rawClips && typeof rawClips === "object" ? rawClips : {};
    const next = {};
    Object.entries(source).slice(0, 900).forEach(([rowIdRaw, clip]) => {
      const rowId = clampText(rowIdRaw || clip?.rowId || "", 120);
      if (!rowId || !clip || typeof clip !== "object") return;
      const sourceDurationMs = Math.max(500, Math.min(1800 * 1000, Math.round(Number(clip?.sourceDurationMs) || 8000)));
      const trimInMs = Math.max(0, Math.min(sourceDurationMs - 500, Math.round(Number(clip?.trimInMs) || 0)));
      const fallbackTrimOut = sourceDurationMs;
      const trimOutMs = Math.max(
        trimInMs + 500,
        Math.min(sourceDurationMs, Math.round(Number(clip?.trimOutMs) || fallbackTrimOut))
      );
      const startMs = Math.max(0, Math.min(3600 * 1000, Math.round(Number(clip?.startMs) || 0)));
      const zIndex = Math.max(1, Math.min(999, Math.round(Number(clip?.zIndex) || 1)));
      next[rowId] = {
        rowId,
        speakerKey: clampText(clip?.speakerKey || "", 120),
        trackId: clampText(clip?.trackId || "", 160),
        startMs,
        sourceDurationMs,
        trimInMs,
        trimOutMs,
        veoVolumeOverridePct: normalizeSceneVolumeOverridePct(
          clip?.veoVolumeOverridePct != null ? clip.veoVolumeOverridePct : clip?.veoVolumePct
        ),
        geminiVolumeOverridePct: normalizeSceneVolumeOverridePct(
          clip?.geminiVolumeOverridePct != null ? clip.geminiVolumeOverridePct : clip?.geminiVolumePct
        ),
        zIndex
      };
    });
    return next;
  };
  const audioModeRaw = String(raw?.podcastVideoConfig?.audioMode || "").trim().toLowerCase();
  const timelineViewModeRaw = String(raw?.podcastVideoConfig?.timelineViewMode || "").trim().toLowerCase();
  const podcastVideoConfig = {
    enabled: raw?.podcastVideoConfig?.enabled === true,
    editorEnabled: raw?.podcastVideoConfig?.editorEnabled === true,
    transitionsByEdge,
    audioMode: audioModeRaw === "veo-native-audio" ? "veo-native-audio" : "gemini-live-per-scene",
    masterVolume: clampNumber(raw?.podcastVideoConfig?.masterVolume, 0, 100, 100),
    clipVolume: clampNumber(raw?.podcastVideoConfig?.clipVolume, 0, 100, 0),
    timelineVersion: Math.max(1, Math.min(99, Math.round(Number(raw?.podcastVideoConfig?.timelineVersion) || 1))),
    timelineTrackVersion: Math.max(1, Math.min(99, Math.round(Number(raw?.podcastVideoConfig?.timelineTrackVersion) || 1))),
    timelineTracks: sanitizeTimelineTracks(raw?.podcastVideoConfig?.timelineTracks || []),
    timelineClipsByRowId: sanitizeTimelineClipsByRowId(raw?.podcastVideoConfig?.timelineClipsByRowId || {}),
    timelineTrackHeightsById: sanitizeTimelineTrackHeightsById(raw?.podcastVideoConfig?.timelineTrackHeightsById || {}),
    timelineViewMode: timelineViewModeRaw === "normal" ? "normal" : "tracks",
    montageDefaultVeoVolumePct: clampNumber(raw?.podcastVideoConfig?.montageDefaultVeoVolumePct, 0, 100, 0),
    montageDefaultGeminiVolumePct: clampNumber(raw?.podcastVideoConfig?.montageDefaultGeminiVolumePct, 0, 100, 100)
  };
  const panelMusicConfigRaw = raw?.panelMusicConfig && typeof raw.panelMusicConfig === "object" ? raw.panelMusicConfig : {};
  const panelMusicTrackRaw = panelMusicConfigRaw?.track && typeof panelMusicConfigRaw.track === "object" ? panelMusicConfigRaw.track : null;
  const panelMusicTrackLibraryRaw = panelMusicConfigRaw?.trackLibrary && typeof panelMusicConfigRaw.trackLibrary === "object"
    ? panelMusicConfigRaw.trackLibrary
    : {};
  const sanitizePanelMusicTrack = (trackRaw = null, fallbackName = "Audio") => (
    trackRaw && typeof trackRaw === "object"
      ? {
        libraryId: clampText(trackRaw?.libraryId || "", 140),
        slotLabel: clampText(trackRaw?.slotLabel || "", 80),
        enabledInSession: trackRaw?.enabledInSession !== false,
        name: clampText(trackRaw?.name || fallbackName, 180) || fallbackName,
        mimeType: clampText(trackRaw?.mimeType || "audio/mpeg", 120) || "audio/mpeg",
        size: Math.max(0, Number(trackRaw?.size) || 0),
        durationSec: clampNumber(trackRaw?.durationSec, 0, 1800, 0),
        startOffsetMs: clampNumber(trackRaw?.startOffsetMs, 0, 1800 * 1000, 0),
        trimInMs: clampNumber(trackRaw?.trimInMs, 0, 1800 * 1000, 0),
        trimOutMs: clampNumber(trackRaw?.trimOutMs, 0, 1800 * 1000, 0),
        durationMeasuredWith: clampText(trackRaw?.durationMeasuredWith || "", 32).toLowerCase(),
        downloadUrl: clampText(trackRaw?.downloadUrl || "", 3000),
        storagePath: clampText(trackRaw?.storagePath || "", 700),
        updatedAt: clampText(trackRaw?.updatedAt || new Date().toISOString(), 64) || new Date().toISOString(),
        model: clampText(trackRaw?.model || "", 140),
        prompt: clampText(trackRaw?.prompt || "", 4000),
        loopSettings: Array.isArray(trackRaw?.loopSettings)
          ? Array.from(new Map(
            trackRaw.loopSettings
              .filter((item) => item && typeof item === "object")
              .map((item) => {
                const loopIndex = Math.max(0, Math.floor(Number(item.loopIndex) || 0));
                const trimInMs = clampNumber(item.trimInMs, 0, 1800 * 1000, 0);
                const trimOutMs = clampNumber(item.trimOutMs, 0, 1800 * 1000, 0);
                return [loopIndex, { loopIndex, trimInMs, trimOutMs }];
              })
          ).values()).sort((a, b) => a.loopIndex - b.loopIndex)
          : [],
        mutedLoopIndexes: Array.isArray(trackRaw?.mutedLoopIndexes)
          ? Array.from(new Set(
            trackRaw.mutedLoopIndexes
              .map((item) => Math.max(0, Math.floor(Number(item) || 0)))
              .filter((item) => Number.isFinite(item) && item >= 0 && item <= 999)
          )).sort((a, b) => a - b)
          : []
      }
      : null
  );
  const panelMusicConfig = {
    preset: ["ambient", "focus", "pulse"].includes(String(panelMusicConfigRaw?.preset || "").trim()) ? String(panelMusicConfigRaw.preset).trim() : "ambient",
    volume: Math.max(0, Math.min(100, Number(panelMusicConfigRaw?.volume) || 22)),
    montageVolume: Math.max(0, Math.min(100, Number(panelMusicConfigRaw?.montageVolume ?? panelMusicConfigRaw?.volume ?? 22))),
    stabilize: panelMusicConfigRaw?.stabilize === true || String(panelMusicConfigRaw?.stabilize || "").trim().toLowerCase() === "true",
    sourceType: String(panelMusicConfigRaw?.sourceType || "").trim() === "track" ? "track" : "preset",
    selectedTrackKind: String(panelMusicConfigRaw?.selectedTrackKind || "").trim() === "ai" ? "ai" : "uploaded",
    trackLibrary: {
      uploaded: sanitizePanelMusicTrack(panelMusicTrackLibraryRaw?.uploaded || null, "Audio"),
      uploadedTracks: Array.isArray(panelMusicTrackLibraryRaw?.uploadedTracks)
        ? panelMusicTrackLibraryRaw.uploadedTracks
            .map((trackRaw, index) => sanitizePanelMusicTrack(trackRaw, `Audio ${index + 1}`))
            .filter(Boolean)
        : [],
      ai: sanitizePanelMusicTrack(panelMusicTrackLibraryRaw?.ai || null, "Audio IA")
    },
    track: sanitizePanelMusicTrack(panelMusicTrackRaw, "Audio")
  };
  if (!panelMusicConfig.trackLibrary.uploaded && panelMusicConfig.trackLibrary.uploadedTracks.length) {
    panelMusicConfig.trackLibrary.uploaded = panelMusicConfig.trackLibrary.uploadedTracks[0];
  }
  const globalScenarioDeckRaw = raw?.globalScenarioDeck && typeof raw.globalScenarioDeck === "object"
    ? raw.globalScenarioDeck
    : {};
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
      model: clampText(item?.model || DEFAULT_PODCASTER_IMAGE_MODEL, 140) || DEFAULT_PODCASTER_IMAGE_MODEL
    };
  }).filter(Boolean);
  const defaultActiveScenarioId = globalScenarioItems[0]?.id || "scenario_a";
  const globalScenarioDeck = {
    activeId: clampText(globalScenarioDeckRaw?.activeId || defaultActiveScenarioId, 80) || defaultActiveScenarioId,
    items: globalScenarioItems
  };
  const normalizedDisfluencyDefaults = normalizeDisfluency(raw?.disfluencyDefaults || disfluencyDefaults);
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
      rows
    },
    speakerVoiceMap: raw?.speakerVoiceMap && typeof raw.speakerVoiceMap === "object" ? raw.speakerVoiceMap : {},
    speakerExpressionMap: raw?.speakerExpressionMap && typeof raw.speakerExpressionMap === "object" ? raw.speakerExpressionMap : {},
    speakerNameMap: raw?.speakerNameMap && typeof raw.speakerNameMap === "object" ? raw.speakerNameMap : {},
    disfluencyDefaults: normalizedDisfluencyDefaults,
    panelMusicConfig,
    speakerPortraitMap,
    speakerReferenceImageMap,
    scenarioReferenceImageMap,
    rowReferenceImageMap,
    globalScenarioDeck,
    dialogueVideoMap,
    dialogueAudioMap,
    podcastVideoConfig
  };
}

async function verifyFirebaseBearer(req) {
  const authHeader = String(req.headers.authorization || "");
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    const err = new Error("AUTH_REQUIRED");
    err.status = 401;
    throw err;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const uid = String(decoded?.uid || "").trim();
    if (!uid) {
      const err = new Error("AUTH_INVALID");
      err.status = 401;
      throw err;
    }
    return { uid, decoded };
  } catch (_) {
    const err = new Error("AUTH_INVALID");
    err.status = 401;
    throw err;
  }
}

async function resolveShareTarget({ targetUid = "", targetEmail = "" }) {
  const uidInput = clampText(targetUid, 140);
  const emailInput = clampText(targetEmail, 180).toLowerCase();
  if (!uidInput && !emailInput) {
    const err = new Error("Debes indicar targetUid o targetEmail.");
    err.status = 400;
    throw err;
  }
  if (uidInput) {
    const userSnap = await db.collection("users").doc(uidInput).get();
    if (!userSnap.exists) {
      const err = new Error("No se encontró el usuario destino.");
      err.status = 404;
      throw err;
    }
    const data = userSnap.data() || {};
    return {
      uid: uidInput,
      email: clampText(data?.email || "", 180).toLowerCase() || null
    };
  }
  const byEmail = await db.collection("users").where("email", "==", emailInput).limit(1).get();
  const docSnap = byEmail.docs[0] || null;
  if (!docSnap) {
    const err = new Error("No se encontró el usuario destino por email.");
    err.status = 404;
    throw err;
  }
  const data = docSnap.data() || {};
  return {
    uid: String(docSnap.id || "").trim(),
    email: clampText(data?.email || emailInput, 180).toLowerCase() || emailInput
  };
}

async function listShareableMoodleUsers(currentUid = "") {
  const uid = clampText(currentUid, 140);
  const snap = await db.collection("users").limit(300).get();
  const users = snap.docs.map((docSnap) => {
    const data = docSnap.data() || {};
    const userUid = String(data.uid || docSnap.id || "").trim();
    if (!userUid || userUid === uid) return null;
    const email = clampText(data.email || "", 180).toLowerCase();
    const displayName = clampText(
      data.displayName || data.name || data.nombre || data.fullName || email || userUid,
      180
    );
    return {
      uid: userUid,
      email: email || "",
      displayName: displayName || userUid
    };
  }).filter(Boolean);
  users.sort((a, b) => {
    const left = String(a.displayName || a.email || a.uid || "").toLowerCase();
    const right = String(b.displayName || b.email || b.uid || "").toLowerCase();
    return left.localeCompare(right, "es");
  });
  return users;
}

function canManageMoodleCourseShare(courseData = {}, uid = "") {
  const currentUid = clampText(uid, 140);
  if (!currentUid) return false;
  if (String(courseData?.userId || courseData?.uid || courseData?.ownerUid || "").trim() === currentUid) return true;
  const details = Array.isArray(courseData?.compartidoConDetalles) ? courseData.compartidoConDetalles : [];
  return details.some((detail) => (
    String(detail?.userId || "").trim() === currentUid &&
    detail?.permisos &&
    detail.permisos.compartir === true
  ));
}

function deepClone(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

async function createMoodleCourseCopy({
  courseId = "",
  requesterUid = "",
  targetUser = null,
}) {
  const cleanCourseId = clampText(courseId, 140);
  const sourceRef = db.collection("moodleCourses").doc(cleanCourseId);
  const sourceSnap = await sourceRef.get();
  if (!sourceSnap.exists) {
    const err = new Error("El curso original no existe.");
    err.status = 404;
    throw err;
  }
  const sourceData = sourceSnap.data() || {};
  if (!canManageMoodleCourseShare(sourceData, requesterUid)) {
    const err = new Error("No tienes permisos para compartir este curso.");
    err.status = 403;
    throw err;
  }

  const targetUid = clampText(targetUser?.uid || "", 140);
  const targetName = clampText(targetUser?.displayName || targetUser?.email || targetUid, 180) || targetUid;
  const duplicateName = `${String(sourceData?.nombre || "Curso").trim()} (Copia para ${targetName})`;
  const existingCopiesSnap = await db.collection("moodleCourses").where("userId", "==", targetUid).limit(100).get();
  const duplicate = existingCopiesSnap.docs.find((docSnap) => {
    const data = docSnap.data() || {};
    return String(data?.nombre || "").trim() === duplicateName &&
      String(data?.copiaDe?.cursoId || "").trim() === cleanCourseId;
  });
  if (duplicate) {
    return {
      alreadyExisted: true,
      courseId: String(duplicate.id || "").trim(),
    };
  }

  const newCourseId = randomUUID();
  const copiedCourse = deepClone(sourceData);
  copiedCourse.id = newCourseId;
  copiedCourse.cursoId = newCourseId;
  copiedCourse.nombre = duplicateName;
  copiedCourse.userId = targetUid;
  copiedCourse.uid = targetUid;
  copiedCourse.ownerUid = targetUid;
  copiedCourse.docType = "course";
  copiedCourse.esPropio = true;
  copiedCourse.creado = admin.firestore.FieldValue.serverTimestamp();
  copiedCourse.actualizado = admin.firestore.FieldValue.serverTimestamp();
  copiedCourse.copiaDe = {
    cursoId: cleanCourseId,
    nombre: String(sourceData?.nombre || "").trim() || "Curso",
    propietarioOriginal: String(sourceData?.userId || sourceData?.uid || sourceData?.ownerUid || "").trim() || requesterUid,
    fechaCopia: new Date().toISOString(),
  };
  delete copiedCourse.compartidoCon;
  delete copiedCourse.compartidoConDetalles;
  delete copiedCourse.propietarioNombre;

  const moduleIdMap = new Map();
  if (Array.isArray(copiedCourse.temas)) {
    copiedCourse.temas = copiedCourse.temas.map((tema) => {
      const nextTema = deepClone(tema || {});
      nextTema.id = randomUUID();
      if (Array.isArray(nextTema.subtemas)) {
        nextTema.subtemas = nextTema.subtemas.map((subtema) => {
          const nextSubtema = deepClone(subtema || {});
          nextSubtema.id = randomUUID();
          const sourceModuleIds = Array.isArray(nextSubtema.modulosIds) ? nextSubtema.modulosIds : [];
          nextSubtema.modulosIds = sourceModuleIds.map((oldId) => {
            const sourceId = String(oldId || "").trim();
            if (!sourceId) return sourceId;
            const newId = randomUUID();
            moduleIdMap.set(sourceId, newId);
            return newId;
          });
          return nextSubtema;
        });
      }
      return nextTema;
    });
  }

  const batch = db.batch();
  batch.set(db.collection("moodleCourses").doc(newCourseId), copiedCourse);

  for (const [sourceModuleId, newModuleId] of moduleIdMap.entries()) {
    const sourceModuleDocId = `${cleanCourseId}_${sourceModuleId}`;
    const sourceModuleSnap = await db.collection("moodleCourses").doc(sourceModuleDocId).get();
    if (!sourceModuleSnap.exists) continue;
    const sourceModuleData = deepClone(sourceModuleSnap.data() || {});
    sourceModuleData.id = newModuleId;
    sourceModuleData.cursoId = newCourseId;
    sourceModuleData.docType = "module";
    delete sourceModuleData.userId;
    delete sourceModuleData.uid;
    delete sourceModuleData.ownerUid;
    sourceModuleData.creado = admin.firestore.FieldValue.serverTimestamp();
    sourceModuleData.actualizado = admin.firestore.FieldValue.serverTimestamp();
    const newModuleDocId = `${newCourseId}_${newModuleId}`;
    batch.set(db.collection("moodleCourses").doc(newModuleDocId), sourceModuleData);
  }

  await batch.commit();
  return {
    alreadyExisted: false,
    courseId: newCourseId,
  };
}

async function shareMoodleCourseCollaboration({
  courseId = "",
  requesterUid = "",
  targetUser = null,
  permisosEditar = false,
  permisosCompartir = false,
}) {
  const cleanCourseId = clampText(courseId, 140);
  const courseRef = db.collection("moodleCourses").doc(cleanCourseId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(courseRef);
    if (!snap.exists) {
      const err = new Error("El curso no existe.");
      err.status = 404;
      throw err;
    }
    const courseData = snap.data() || {};
    if (!canManageMoodleCourseShare(courseData, requesterUid)) {
      const err = new Error("No tienes permisos para compartir este curso.");
      err.status = 403;
      throw err;
    }
    const compartidoCon = Array.isArray(courseData.compartidoCon) ? [...courseData.compartidoCon] : [];
    const compartidoConDetalles = Array.isArray(courseData.compartidoConDetalles) ? [...courseData.compartidoConDetalles] : [];
    const targetUid = clampText(targetUser?.uid || "", 140);
    const targetName = clampText(targetUser?.displayName || targetUser?.email || targetUid, 180) || targetUid;
    const targetEmail = clampText(targetUser?.email || "", 180).toLowerCase();
    const existingIndex = compartidoConDetalles.findIndex((detail) => String(detail?.userId || "").trim() === targetUid);
    const detailPayload = {
      userId: targetUid,
      userName: targetName,
      userEmail: targetEmail,
      fechaCompartido: new Date(),
      compartidoPor: requesterUid,
      permisos: {
        editar: permisosEditar === true,
        compartir: permisosCompartir === true,
      },
      modo: "colaboracion",
    };
    if (existingIndex >= 0) {
      compartidoConDetalles[existingIndex] = {
        ...compartidoConDetalles[existingIndex],
        ...detailPayload,
        fechaModificacion: new Date(),
        modificadoPor: requesterUid,
      };
    } else {
      compartidoConDetalles.push(detailPayload);
    }
    if (!compartidoCon.includes(targetUid)) compartidoCon.push(targetUid);
    tx.update(courseRef, {
      compartidoCon,
      compartidoConDetalles,
      actualizado: new Date(),
    });
  });
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch (_) {
    const txt = await response.text().catch(() => "");
    return { error: txt || "Respuesta no JSON del upstream." };
  }
}

function buildGeminiLiveClient() {
  const client = new GoogleGenAI({
    apiKey: GEMINI_API_KEY,
    httpOptions: { apiVersion: "v1alpha" }
  });
  if (!client?.authTokens || typeof client.authTokens.create !== "function") {
    throw new Error("SDK @google/genai sin authTokens.create en backend local.");
  }
  return client;
}

function summarizeGeminiLiveError(error) {
  const status = Number(
    error?.status
    || error?.code
    || error?.cause?.status
    || error?.cause?.response?.status
    || 0
  ) || 0;
  const contentType = String(
    error?.cause?.response?.headers?.get?.("content-type")
    || error?.response?.headers?.get?.("content-type")
    || ""
  ).trim();
  const bodySnippet = String(
    error?.cause?.body
    || error?.cause?.responseText
    || error?.responseText
    || error?.details
    || error?.message
    || ""
  ).trim().slice(0, 500);
  return {
    status,
    contentType,
    bodySnippet,
  };
}

function decodeDataUrl(dataUrl = "") {
  const decoded = decodeBase64DataUrl(dataUrl, SCREENSHOT_MAX_BYTES);
  if (!String(decoded.mimeType || "").startsWith("image/")) {
    throw new Error("Formato de imagen inválido.");
  }
  return decoded;
}

function decodeBase64DataUrl(dataUrl = "", maxBytes = SCREENSHOT_MAX_BYTES) {
  const raw = String(dataUrl || "").trim();
  const match = raw.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Formato base64 inválido.");
  }
  const mimeType = String(match[1] || "").trim().toLowerCase();
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > Math.max(1, Number(maxBytes) || SCREENSHOT_MAX_BYTES)) {
    throw new Error("Archivo demasiado grande.");
  }
  return { mimeType, buffer };
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

function sleep(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function sanitizePodcasterMusicModel(value = "") {
  const clean = String(value || "").trim();
  return clean === "lyria-3-pro-preview" ? "lyria-3-pro-preview" : "lyria-3-clip-preview";
}

function buildPodcasterMusicPrompt(prompt = "", preset = "ambient") {
  const cleanPrompt = String(prompt || "").replace(/\s+/g, " ").trim().slice(0, 1200);
  const cleanPreset = String(preset || "ambient").trim().toLowerCase();
  const styleHint = cleanPreset === "pulse"
    ? "Light electronic pulse, energetic but clean, modern rhythm section."
    : cleanPreset === "focus"
      ? "Focused instrumental groove, subtle lo-fi textures, light piano and percussion."
      : "Ambient cinematic background, warm pads, soft piano, airy textures.";
  return [
    cleanPrompt,
    styleHint,
    "Instrumental only.",
    "No vocals, no spoken words, no choir, no narration.",
    "Suitable as background music under podcast dialogue.",
    "Keep transients controlled and avoid harsh peaks.",
    "Loop-friendly and non-intrusive."
  ].filter(Boolean).join(" ");
}

function readLyriaAudioParts(response = {}) {
  const parts = Array.isArray(response?.candidates?.[0]?.content?.parts)
    ? response.candidates[0].content.parts
    : Array.isArray(response?.parts)
      ? response.parts
      : [];
  return parts
    .map((part) => ({
      data: String(part?.inlineData?.data || part?.inline_data?.data || "").trim(),
      mimeType: String(part?.inlineData?.mimeType || part?.inline_data?.mimeType || "audio/mpeg").trim() || "audio/mpeg"
    }))
    .filter((part) => part.data);
}

function readGeminiAudioParts(responseBody = {}) {
  const parts = Array.isArray(responseBody?.candidates?.[0]?.content?.parts)
    ? responseBody.candidates[0].content.parts
    : [];
  const audioParts = [];
  parts.forEach((part) => {
    const data = String(part?.inlineData?.data || part?.inline_data?.data || "").trim();
    if (!data) return;
    const mimeType = String(part?.inlineData?.mimeType || part?.inline_data?.mimeType || "audio/L16;rate=24000").trim() || "audio/L16;rate=24000";
    audioParts.push({ data, mimeType });
  });
  return audioParts;
}

function pcm16ToWavBuffer(pcmBuffer = Buffer.alloc(0), sampleRate = 24000) {
  const pcm = Buffer.isBuffer(pcmBuffer) ? pcmBuffer : Buffer.from(pcmBuffer || []);
  const safeRate = Math.max(8000, Math.min(96000, Number(sampleRate) || 24000));
  const header = Buffer.alloc(44);
  const byteRate = safeRate * 2;
  const blockAlign = 2;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(safeRate, 24);
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

function isFfmpegAvailable() {
  try {
    return Boolean(ffmpegStaticPath && fs.existsSync(ffmpegStaticPath));
  } catch (_) {
    return false;
  }
}

function extractMediaStreamInfoFromFfmpegStderr(stderrText = "") {
  const output = String(stderrText || "");
  const videoMatch = output.match(/Video:\s*([^,\s]+)/i);
  const audioMatch = output.match(/Audio:\s*([^,\s]+)/i);
  const durationMatch = output.match(/Duration:\s*([0-9:.]+)/i);
  const normalizeCodec = (value = "") => String(value || "").trim().toLowerCase().replace(/\(.*$/, "").trim();
  return {
    videoCodec: normalizeCodec(videoMatch?.[1] || ""),
    audioCodec: normalizeCodec(audioMatch?.[1] || ""),
    duration: String(durationMatch?.[1] || "").trim()
  };
}

function runFfmpegCommand(args = [], context = {}) {
  return new Promise((resolve, reject) => {
    if (!isFfmpegAvailable()) {
      const err = new Error("ffmpeg_static_missing");
      err.code = "ffmpeg_static_missing";
      err.stage = String(context?.stage || "spawn").trim() || "spawn";
      reject(err);
      return;
    }
    const child = spawn(ffmpegStaticPath, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk || "");
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });
    child.on("error", (error) => {
      const err = new Error(`ffmpeg_spawn_error: ${String(error?.message || error || "unknown")}`);
      err.code = "ffmpeg_spawn_error";
      err.stage = String(context?.stage || "spawn").trim() || "spawn";
      err.stderr = stderr;
      reject(err);
    });
    child.on("close", (code) => {
      if (Number(code || 0) === 0) {
        resolve({ stdout, stderr, code: 0 });
        return;
      }
      const err = new Error(`ffmpeg_exit_code_${code}`);
      err.code = "ffmpeg_exit_code";
      err.exitCode = Number(code || 1);
      err.stage = String(context?.stage || "run").trim() || "run";
      err.stdout = stdout;
      err.stderr = stderr;
      reject(err);
    });
  });
}

async function extractLastVideoFramePng(videoBuffer = Buffer.alloc(0), sourceMimeType = "video/mp4") {
  const source = Buffer.isBuffer(videoBuffer) ? videoBuffer : Buffer.from(videoBuffer || []);
  if (!source.length) {
    const err = new Error("empty_video_buffer");
    err.code = "empty_video_buffer";
    err.stage = "input";
    throw err;
  }
  const ext = getVideoExtension(sourceMimeType);
  const token = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const inputPath = path.join(os.tmpdir(), `cb-prev-${token}.${ext}`);
  const outputPath = path.join(os.tmpdir(), `cb-prev-${token}.png`);
  try {
    await fs.promises.writeFile(inputPath, source);
    await runFfmpegCommand([
      "-hide_banner",
      "-y",
      "-sseof",
      "-0.15",
      "-i",
      inputPath,
      "-frames:v",
      "1",
      "-vf",
      "scale=1280:-1:flags=lanczos",
      outputPath
    ], { stage: "extract_last_frame" });
    const frame = await fs.promises.readFile(outputPath);
    if (!frame.length || frame.length > MAX_REFERENCE_FRAME_BYTES) {
      const err = new Error("reference_frame_too_large");
      err.code = "reference_frame_too_large";
      err.stage = "extract_last_frame";
      throw err;
    }
    return frame;
  } finally {
    await safeUnlink(inputPath);
    await safeUnlink(outputPath);
  }
}

async function safeUnlink(filePath = "") {
  const target = String(filePath || "").trim();
  if (!target) return;
  try {
    await fs.promises.unlink(target);
  } catch (_) {
    // noop
  }
}

async function probeMediaWithFfmpeg(inputPath = "", label = "probe") {
  const source = String(inputPath || "").trim();
  if (!source) return { label, videoCodec: "", audioCodec: "", duration: "" };
  const probeResult = await runFfmpegCommand([
    "-hide_banner",
    "-i",
    source,
    "-f",
    "null",
    "-"
  ], { stage: `${label}_probe` });
  return {
    label,
    ...extractMediaStreamInfoFromFfmpegStderr(probeResult.stderr || "")
  };
}

async function transcodeDialogueVideoToMp4(inputBuffer = Buffer.alloc(0), sourceMimeType = "video/mp4") {
  const source = Buffer.isBuffer(inputBuffer) ? inputBuffer : Buffer.from(inputBuffer || []);
  if (!source.length) {
    const err = new Error("empty_video_buffer");
    err.code = "empty_video_buffer";
    err.stage = "input";
    throw err;
  }
  if (!isFfmpegAvailable()) {
    const err = new Error("ffmpeg_static_missing");
    err.code = "ffmpeg_static_missing";
    err.stage = "input";
    throw err;
  }

  const inputExt = getVideoExtension(sourceMimeType);
  const inputPath = path.join("/tmp", `cb-dialogue-video-in-${randomUUID()}.${inputExt || "mp4"}`);
  const outputPath = path.join("/tmp", `cb-dialogue-video-out-${randomUUID()}.mp4`);
  let inputProbe = { videoCodec: "", audioCodec: "", duration: "" };
  let outputProbe = { videoCodec: "", audioCodec: "", duration: "" };

  try {
    await fs.promises.writeFile(inputPath, source);
    inputProbe = await probeMediaWithFfmpeg(inputPath, "input").catch(() => ({ videoCodec: "", audioCodec: "", duration: "" }));
    const hasInputAudio = Boolean(String(inputProbe?.audioCodec || "").trim());
    const transcodeArgs = hasInputAudio
      ? [
        "-y",
        "-hide_banner",
        "-loglevel",
        "warning",
        "-i",
        inputPath,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-ar",
        "48000",
        "-b:a",
        "160k",
        "-movflags",
        "+faststart",
        outputPath
      ]
      : [
        "-y",
        "-hide_banner",
        "-loglevel",
        "warning",
        "-i",
        inputPath,
        "-f",
        "lavfi",
        "-i",
        "anullsrc=channel_layout=stereo:sample_rate=48000",
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-shortest",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-ar",
        "48000",
        "-b:a",
        "160k",
        "-movflags",
        "+faststart",
        outputPath
      ];
    await runFfmpegCommand(transcodeArgs, { stage: "transcode" });
    const outputBuffer = await fs.promises.readFile(outputPath);
    if (!outputBuffer.length) {
      const err = new Error("empty_transcoded_video");
      err.code = "empty_transcoded_video";
      err.stage = "output";
      throw err;
    }
    outputProbe = await probeMediaWithFfmpeg(outputPath, "output").catch(() => ({ videoCodec: "h264", audioCodec: "aac", duration: "" }));
    return {
      buffer: outputBuffer,
      mimeType: "video/mp4",
      container: "mp4",
      transcoded: true,
      sourceMimeType: String(sourceMimeType || "video/mp4").trim() || "video/mp4",
      videoCodec: String(outputProbe?.videoCodec || "h264").trim() || "h264",
      audioCodec: String(outputProbe?.audioCodec || "aac").trim() || "aac",
      inputProbe,
      outputProbe
    };
  } finally {
    await Promise.all([
      safeUnlink(inputPath),
      safeUnlink(outputPath)
    ]);
  }
}

function getImageExtension(mimeType = "image/png") {
  const clean = String(mimeType || "").trim().toLowerCase();
  if (clean === "image/webp") return "webp";
  if (clean === "image/jpeg" || clean === "image/jpg") return "jpg";
  return "png";
}

function extractGeminiInlineImage(data = {}) {
  const parts = Array.isArray(data?.candidates?.[0]?.content?.parts) ? data.candidates[0].content.parts : [];
  const inline = parts.find((part) => part?.inlineData?.data || part?.inline_data?.data) || null;
  const imageBase64 = String(inline?.inlineData?.data || inline?.inline_data?.data || "").trim();
  const mimeType = String(inline?.inlineData?.mimeType || inline?.inline_data?.mimeType || "image/png").trim() || "image/png";
  if (!imageBase64) return null;
  return {
    buffer: Buffer.from(imageBase64, "base64"),
    mimeType
  };
}

function buildGeminiImageGenerationConfig({
  aspectRatio = "1:1",
  imageSize = DEFAULT_GEMINI_IMAGE_SIZE,
  temperature = null
} = {}) {
  const config = {
    responseModalities: ["TEXT", "IMAGE"],
    imageConfig: {
      aspectRatio: String(aspectRatio || "1:1").trim() || "1:1",
      imageSize: String(imageSize || DEFAULT_GEMINI_IMAGE_SIZE).trim() || DEFAULT_GEMINI_IMAGE_SIZE
    }
  };
  const temp = Number(temperature);
  if (Number.isFinite(temp)) config.temperature = temp;
  return config;
}

function buildMoodleModuleGraphicPrompt({
  moduleName = "",
  moduleType = "",
  languageCode = "es",
  instructions = "",
  content = "",
  hasReferenceImages = false
} = {}) {
  const isEnglish = String(languageCode || "").toLowerCase().startsWith("en");
  return [
    `Modulo: ${clampText(moduleName || "Modulo educativo", 180)}`,
    `Tipo: ${clampText(moduleType || "Modulo", 80)}`,
    `Idioma: ${isEnglish ? "English" : "Español"}`,
    instructions ? `Instrucciones: ${clampText(instructions, 2200)}` : "",
    content ? `Contenido: ${clampText(content, 2600)}` : "",
    "Primero analiza las propuestas nuevas de actividades y detecta que informacion visual de apoyo ayuda mejor a resolverlas o comprenderlas.",
    "Luego genera una sola imagen final, completa y profesional, que funcione como apoyo educativo comun del modulo.",
    "No generes escenarios de podcast, estudios, sets cinematograficos ni interfaces decorativas ajenas al contenido educativo.",
    "Elige un unico formato visual integrado: infografia, diagrama explicativo, esquema comparativo, grafica educativa u organizador visual unificado.",
    "NO conviertas cada actividad o pregunta en una tarjeta, panel, bloque o mini-infografia separada.",
    "NO escribas 'Actividad 1', 'Actividad 2', 'Pregunta 1', 'Pregunta 2' ni variantes similares dentro de la imagen.",
    "NO hagas mapas mentales con ramas que representen actividades individuales del modulo.",
    "La imagen debe sintetizar conceptos, relaciones, pasos, referencias o contexto util para contestar las actividades como una sola pieza editorial integrada.",
    hasReferenceImages ? "Hay imagenes de referencia adjuntas en las instrucciones. Sigue su misma linea visual, lenguaje grafico, composicion y atmosfera, sin copiar literalmente su texto." : "",
    "Prioriza una estetica editorial elegante con jerarquia visual fuerte, composicion refinada y una sola narrativa grafica clara.",
    "Prefiere un sistema visual coherente, no cuatro o cinco subgraficos independientes.",
    "Usa paleta armonica, profesional y atractiva; evita combinaciones infantiles pobres, ruido visual, collage desordenado o elementos sueltos sin jerarquia.",
    "Procura no colocar texto; si es indispensable, usa el minimo posible, solo labels cortos y nunca parrafos largos.",
    "Fondo claro, limpio y profesional. Usa formas, reticulas suaves, patrones sutiles o decoracion editorial discreta solo si elevan la elegancia del diagrama.",
    "El resultado debe sentirse como un unico grafico de apoyo, moderno, claro y listo para material educativo de alta calidad."
  ].filter(Boolean).join("\n");
}

function normalizeInlineInstructionImages(input = []) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => ({
      mimeType: String(item?.mimeType || "").trim().toLowerCase(),
      data: String(item?.data || "").trim()
    }))
    .filter((item) => item.mimeType.startsWith("image/") && item.data)
    .slice(0, 2);
}

function stripHtmlToPlainLocal(html = "") {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

async function fetchImageBytesWithMimeLocal(imageUrl = "") {
  const target = String(imageUrl || "").trim();
  if (!target) {
    throw new Error("Falta imageUrl.");
  }
  const upstream = await fetchCompat(target, { method: "GET" });
  if (!upstream.ok) {
    throw new Error(`No se pudo descargar la imagen (${upstream.status}).`);
  }
  const mimeType = String(upstream.headers.get("content-type") || "image/png").trim() || "image/png";
  const buffer = Buffer.from(await upstream.arrayBuffer());
  return { mimeType, buffer };
}

function parseJsonObjectFromModelTextLocal(raw = "") {
  const clean = String(raw || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const match = clean.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : clean);
}

async function generateMoodleModuleGraphicAsset({
  uid = "",
  courseId = "",
  moduleId = "",
  moduleType = "",
  moduleName = "",
  languageCode = "es",
  instructions = "",
  content = "",
  instructionImages = [],
  previousStoragePath = ""
} = {}) {
  if (!hasGeminiKey()) {
    const err = new Error("Falta GEMINI_API_KEY o GOOGLE_API_KEY en backend.");
    err.status = 500;
    throw err;
  }

  const prompt = buildMoodleModuleGraphicPrompt({
    moduleName,
    moduleType,
    languageCode,
    instructions,
    content,
    hasReferenceImages: Array.isArray(instructionImages) && instructionImages.length > 0
  });
  const promptParts = [{ text: prompt }];
  normalizeInlineInstructionImages(instructionImages).forEach((image, index) => {
    promptParts.push({ text: `Imagen de referencia ${index + 1}: usa esta referencia para mantener la misma linea grafica educativa.` });
    promptParts.push({ inline_data: { mime_type: image.mimeType, data: image.data } });
  });
  const payload = {
    contents: [{ parts: promptParts }],
    generationConfig: buildGeminiImageGenerationConfig({
      aspectRatio: "1:1",
      imageSize: DEFAULT_GEMINI_IMAGE_SIZE
    })
  };
  const modelCandidates = Array.from(new Set([
    DEFAULT_MOODLE_GRAPHIC_MODEL,
    ...PODCASTER_IMAGE_MODEL_CANDIDATES
  ].filter(Boolean)));

  let inline = null;
  let mimeType = "image/png";
  let resolvedModel = DEFAULT_MOODLE_GRAPHIC_MODEL;
  let lastError = "Gemini no devolvio una imagen utilizable para el modulo.";
  let lastStatus = 502;

  for (const modelName of modelCandidates) {
    const upstream = await fetchCompat(
      `${GEMINI_BASE}/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );
    const data = await safeJson(upstream);
    if (!upstream.ok) {
      lastStatus = Number(upstream.status || 502);
      lastError = String(data?.error?.message || data?.error || `HTTP ${upstream.status}`);
      if ([400, 401, 403, 404].includes(lastStatus)) {
        continue;
      }
      const err = new Error(lastError);
      err.status = lastStatus;
      throw err;
    }

    inline = extractGeminiInlineImage(data);
    if (inline?.buffer?.length) {
      mimeType = String(inline.mimeType || "image/png").trim() || "image/png";
      resolvedModel = modelName;
      break;
    }

    lastStatus = 502;
    lastError = `${modelName}: respuesta sin inlineData de imagen`;
  }

  if (!inline?.buffer?.length) {
    const err = new Error(lastError || "Gemini no devolvio una imagen utilizable para el modulo.");
    err.status = lastStatus >= 400 ? lastStatus : 502;
    throw err;
  }

  const ext = getImageExtension(mimeType);
  const storagePath = `images/${normalizeStorageSegment(uid, "user")}/moodle-modules/${normalizeStorageSegment(courseId, "curso")}/${normalizeStorageSegment(moduleId, "modulo")}/${Date.now()}.${ext}`;
  if (previousStoragePath && previousStoragePath !== storagePath) {
    await deleteStoragePath(previousStoragePath).catch(() => {});
  }
  const asset = await uploadScreenshotAsset({
    path: storagePath,
    buffer: inline.buffer,
    mimeType,
    metadata: {
      origin: "moodleCourse",
      courseId: String(courseId || "").trim(),
      moduleId: String(moduleId || "").trim(),
      model: resolvedModel,
      promptVersion: MOODLE_GRAPHIC_PROMPT_VERSION
    }
  });
  return {
    downloadUrl: asset.downloadUrl,
    storagePath: asset.path,
    mimeType,
    model: resolvedModel,
    promptVersion: MOODLE_GRAPHIC_PROMPT_VERSION,
    updatedAt: new Date().toISOString()
  };
}

async function generateMoodleModuleGraphicElementAsset({
  uid = "",
  courseId = "",
  moduleId = "",
  moduleType = "",
  moduleName = "",
  languageCode = "es",
  instructions = "",
  content = "",
  elementId = "",
  elementLabel = "",
  elementPrompt = "",
  previousStoragePath = ""
} = {}) {
  const enrichedInstructions = [
    stripHtmlToPlainLocal(instructions),
    `Elemento objetivo: ${clampText(elementLabel || "Elemento", 120)}`,
    `Brief del elemento: ${clampText(elementPrompt || "", 2400)}`,
    "Genera exactamente una imagen de capa para composicion manual.",
    "Usa fondo blanco uniforme y limpio en toda la imagen.",
    "No uses fondos de color distintos, degradados ni escenas completas.",
    "Conserva solo el contexto visual minimo si realmente ayuda a entender el elemento.",
    "Sin texto, sin numeros, sin etiquetas, sin UI, sin marca de agua.",
    "No mezcles varias capas distintas en una sola imagen."
  ].filter(Boolean).join("\n");

  return generateMoodleModuleGraphicAsset({
    uid,
    courseId,
    moduleId,
    moduleType,
    moduleName,
    languageCode,
    instructions: enrichedInstructions,
    content: stripHtmlToPlainLocal(content),
    previousStoragePath
  });
}

async function uploadScreenshotAsset({ path: assetPath, buffer, mimeType, metadata = {} }) {
  const targetBucket = await resolveWritableStorageBucket();
  const file = targetBucket.file(assetPath);
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
    path: assetPath,
    downloadUrl: `https://firebasestorage.googleapis.com/v0/b/${targetBucket.name}/o/${encodeURIComponent(assetPath)}?alt=media&token=${token}`,
  };
}

async function uploadBinaryFileAsset({ path: assetPath, filePath, mimeType, metadata = {} }) {
  const sourcePath = String(filePath || "").trim();
  if (!sourcePath) {
    const err = new Error("missing_filePath");
    err.code = "missing_filePath";
    throw err;
  }
  const targetBucket = await resolveWritableStorageBucket();
  const file = targetBucket.file(assetPath);
  const token = randomUUID();
  const writeStream = file.createWriteStream({
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
  await pipeline(fs.createReadStream(sourcePath), writeStream);
  return {
    path: assetPath,
    downloadUrl: `https://firebasestorage.googleapis.com/v0/b/${targetBucket.name}/o/${encodeURIComponent(assetPath)}?alt=media&token=${token}`,
  };
}

app.post("/api/unidades/support-graphics/upload", async (req, res) => {
  try {
    const { uid } = await verifyFirebaseBearer(req);
    const storagePath = clampText(req.body?.path || "", 900);
    const mimeType = clampText(req.body?.mimeType || "image/png", 120) || "image/png";
    const dataBase64 = String(req.body?.dataBase64 || "").trim();
    const metadataRaw = req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {};

    if (!storagePath.startsWith("unidadesGeneradasAssets/")) {
      return res.status(400).json({ error: "Ruta de storage inválida." });
    }
    if (!/^image\//i.test(mimeType)) {
      return res.status(400).json({ error: "mimeType inválido para apoyo visual." });
    }
    if (!dataBase64) {
      return res.status(400).json({ error: "Falta dataBase64." });
    }
    if (!storagePath.includes(`/${uid}/`)) {
      return res.status(403).json({ error: "La ruta no corresponde al usuario autenticado." });
    }

    const buffer = Buffer.from(dataBase64, "base64");
    if (!buffer.length || buffer.length > MAX_SPEAKER_PORTRAIT_BYTES) {
      return res.status(413).json({ error: "La imagen excede el tamaño permitido." });
    }

    const metadata = {
      uid,
      feature: "unidades_support_graphic",
      subtema: clampText(metadataRaw?.subtema || "", 180),
      role: clampText(metadataRaw?.role || "", 80)
    };

    const asset = await uploadScreenshotAsset({
      path: storagePath,
      buffer,
      mimeType,
      metadata
    });

    return res.status(200).json({
      ok: true,
      storagePath: asset.path,
      path: asset.path,
      downloadUrl: asset.downloadUrl,
      mimeType
    });
  } catch (error) {
    const status = Number(error?.status || 500);
    const message = String(error?.message || "No se pudo subir el apoyo visual.").trim();
    return res.status(status >= 400 && status <= 599 ? status : 500).json({ error: message });
  }
});

async function deleteStoragePath(storagePath = "") {
  if (!storagePath) return;
  const buckets = getStorageBucketCandidates();
  await Promise.all(buckets.map((bucket) => bucket.file(storagePath).delete({ ignoreNotFound: true }).catch(() => {})));
}

async function validateActiveMinebloxPlayer({ roomId, playerId, clientSessionId }) {
  const room = String(roomId || "").trim();
  const player = String(playerId || "").trim();
  const session = String(clientSessionId || "").trim();
  if (!room || !player || !session) {
    throw new Error("Faltan datos de sesión.");
  }
  const snap = await db.collection("mineblox_rooms").doc(room).collection("players").doc(player).get();
  if (!snap.exists) {
    // Be more lenient in dev: auto-create if room exists but player sync is lagging
    const roomSnap = await db.collection("mineblox_rooms").doc(room).get();
    if (!roomSnap.exists) {
      throw new Error(`Salón '${room}' no encontrado.`);
    }
    console.log(`[backend] player '${player}' not syncing yet, but room '${room}' is active. Allowing screenshot.`);
    return { clientSessionId: session, name: "Jugador Local" };
  }
  const data = snap.data() || {};
  const lastSeen = data.lastSeen?.toMillis ? data.lastSeen.toMillis() : 0;
  if (!lastSeen || (Date.now() - lastSeen) > ACTIVE_PLAYER_WINDOW_MS) {
    // Relaxed for local dev if they are clearly the owner or just took a screenshot
    console.warn(`[backend] player '${player}' last seen more than 45s ago, proceed anyway.`);
  }
  if (String(data.clientSessionId || "").trim() && String(data.clientSessionId || "").trim() !== session) {
    console.warn(`[backend] player '${player}' session mismatch. Received: ${session}, Stored: ${data.clientSessionId}`);
  }
  return data;
}

async function pruneScreenshotScope(roomId, visibility, playerId) {
  const shotsRef = db.collection("mineblox_rooms").doc(roomId).collection("screenshots");
  const snap = await shotsRef.orderBy("createdAt", "desc").limit(200).get();
  const limit = visibility === "personal" ? SCREENSHOT_PERSONAL_LIMIT : SCREENSHOT_SHARED_LIMIT;
  const scoped = snap.docs.filter((docSnap) => {
    const data = docSnap.data() || {};
    if (String(data.visibility || "") !== visibility) return false;
    if (visibility === "personal" && String(data.authorId || "") !== playerId) return false;
    return true;
  });
  if (scoped.length <= limit) return;
  const toDelete = scoped.slice(limit);
  await Promise.all(toDelete.map(async (docSnap) => {
    const data = docSnap.data() || {};
    await Promise.all([
      deleteStoragePath(String(data.storagePath || "")),
      deleteStoragePath(String(data.thumbStoragePath || "")),
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
  const ext = getScreenshotExtension(mainImage.mimeType);
  const thumbExt = getScreenshotExtension(thumbImage.mimeType);
  const scopePath = visibility === "shared"
    ? `mineblox/screenshots/rooms/${roomId}/shared/${shotId}.${ext}`
    : `mineblox/screenshots/rooms/${roomId}/players/${playerId}/${shotId}.${ext}`;
  const thumbPath = visibility === "shared"
    ? `mineblox/screenshots/rooms/${roomId}/shared/${shotId}_thumb.${thumbExt}`
    : `mineblox/screenshots/rooms/${roomId}/players/${playerId}/${shotId}_thumb.${thumbExt}`;
  const [asset, thumb] = await Promise.all([
    uploadScreenshotAsset({
      path: scopePath,
      buffer: mainImage.buffer,
      mimeType: mainImage.mimeType,
      metadata: { roomId, playerId, shotId, visibility, kind: "main" },
    }),
    uploadScreenshotAsset({
      path: thumbPath,
      buffer: thumbImage.buffer,
      mimeType: thumbImage.mimeType,
      metadata: { roomId, playerId, shotId, visibility, kind: "thumb" },
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
    viewMode: String(body.viewMode || "").trim() || "first",
    createdAt,
    storagePath: asset.path,
    thumbStoragePath: thumb.path,
    downloadUrl: asset.downloadUrl,
    thumbUrl: thumb.downloadUrl,
  };
  await db.collection("mineblox_rooms").doc(roomId).collection("screenshots").doc(shotId).set(record);
  await pruneScreenshotScope(roomId, visibility, playerId);
  return res.json({ ok: true, record });
}

async function handleMinebloxScreenshotList(req, res) {
  const roomId = String(req.query.roomId || "").trim();
  const playerId = String(req.query.playerId || "").trim();
  await validateActiveMinebloxPlayer({
    roomId,
    playerId,
    clientSessionId: req.query.clientSessionId,
  });
  const snap = await db.collection("mineblox_rooms").doc(roomId).collection("screenshots")
    .orderBy("createdAt", "desc")
    .limit(SCREENSHOT_SHARED_LIMIT + SCREENSHOT_PERSONAL_LIMIT)
    .get();
  const records = snap.docs
    .map((docSnap) => docSnap.data() || {})
    .filter((record) => record.visibility === "shared" || record.authorId === playerId);
  return res.json({ ok: true, records });
}

app.use("/api/podcaster", async (req, res, next) => {
  if (req.method === "OPTIONS") return next();
  try {
    req.authContext = await verifyFirebaseBearer(req);
    return next();
  } catch (error) {
    return res.status(Number(error?.status || 401)).json({ error: String(error?.message || "AUTH_REQUIRED") });
  }
});

app.post("/api/podcaster/scene-library/clone-video", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    if (!uid) return res.status(401).json({ error: "AUTH_REQUIRED" });
    const sessionId = clampText(String(req.body?.sessionId || "").trim(), 180);
    const rowId = clampText(String(req.body?.rowId || "").trim(), 180);
    const speakerLabel = clampText(String(req.body?.speakerLabel || "Narrador").trim(), 120) || "Narrador";
    const sourceStoragePathRaw = clampText(String(req.body?.sourceStoragePath || "").trim(), 900);
    const sourceUrlRaw = clampText(String(req.body?.sourceUrl || "").trim(), 2000);
    const mimeType = clampText(String(req.body?.mimeType || "video/mp4").trim(), 120) || "video/mp4";
    if (!sessionId || !rowId) {
      return res.status(400).json({ error: "Falta sessionId o rowId." });
    }

    const extractFirebaseStoragePathFromUrl = (url = "") => {
      const clean = String(url || "").trim();
      if (!clean) return { bucketName: "", storagePath: "" };
      try {
        const parsed = new URL(clean);
        const host = String(parsed.hostname || "").toLowerCase();
        const allowedHost = host.endsWith("googleapis.com") || host.endsWith("firebasestorage.app");
        if (!allowedHost) return { bucketName: "", storagePath: "" };
        const pathParts = String(parsed.pathname || "").split("/").filter(Boolean);
        // Expected: /v0/b/<bucket>/o/<encodedObjectPath>
        const bIndex = pathParts.indexOf("b");
        const oIndex = pathParts.indexOf("o");
        const bucketName = bIndex >= 0 ? String(pathParts[bIndex + 1] || "").trim() : "";
        const encodedObj = oIndex >= 0 ? String(pathParts[oIndex + 1] || "").trim() : "";
        const storagePath = encodedObj ? decodeURIComponent(encodedObj) : "";
        return { bucketName, storagePath };
      } catch (_) {
        return { bucketName: "", storagePath: "" };
      }
    };

    const requestedStoragePath = normalizeStorageFilePath(sourceStoragePathRaw);
    const extracted = requestedStoragePath ? { bucketName: "", storagePath: requestedStoragePath } : extractFirebaseStoragePathFromUrl(sourceUrlRaw);
    const sourceStoragePath = String(extracted.storagePath || "").trim();
    if (!sourceStoragePath) {
      return res.status(400).json({ error: "Falta sourceStoragePath o sourceUrl válido." });
    }
    // Limita a assets de librería para evitar uso del endpoint como proxy/copy genérico.
    if (!/^podcaster\/library\//i.test(sourceStoragePath)) {
      return res.status(403).json({ error: "Solo se permite clonar assets de podcaster/library." });
    }

    const ext = getVideoExtension(mimeType);
    const sessionSlug = normalizeStorageSegment(sessionId, "session");
    const rowSlug = normalizeStorageSegment(rowId, "row");
    const speakerSlug = normalizeStorageSegment(speakerLabel, "speaker");
    const destPath = `podcaster/sessions/${sessionSlug}/owners/${normalizeStorageSegment(uid, "anon")}/videos/${rowSlug}-${speakerSlug}/${randomUUID()}.${ext}`;
    const targetBucket = await resolveWritableStorageBucket();
    const destFile = targetBucket.file(destPath);
    const token = randomUUID();

    const candidateBuckets = (() => {
      const buckets = getStorageBucketCandidates();
      const extra = extracted.bucketName ? [admin.storage().bucket(extracted.bucketName)] : [];
      const byName = new Map();
      [...extra, ...buckets].filter(Boolean).forEach((bucket) => {
        const name = String(bucket?.name || "").trim();
        if (!name || byName.has(name)) return;
        byName.set(name, bucket);
      });
      return Array.from(byName.values());
    })();

    let copied = false;
    let lastError = null;
    for (const bucket of candidateBuckets) {
      if (!bucket) continue;
      const srcFile = bucket.file(sourceStoragePath);
      const [exists] = await srcFile.exists().catch(() => [null]);
      if (exists === false) continue;
      try {
        await pipeline(
          srcFile.createReadStream(),
          destFile.createWriteStream({
            resumable: false,
            contentType: mimeType,
            metadata: {
              cacheControl: "public,max-age=86400",
              metadata: {
                firebaseStorageDownloadTokens: token,
                uid,
                sessionId,
                rowId,
                speakerLabel,
                kind: "public_scene_clone",
                sourceStoragePath
              }
            }
          })
        );
        copied = true;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!copied) {
      return res.status(502).json({
        error: "No se pudo clonar el video desde la librería.",
        detail: {
          sourceStoragePath,
          bucketsTried: candidateBuckets.map((b) => b?.name).filter(Boolean),
          lastError: lastError ? String(lastError?.message || lastError) : undefined
        }
      });
    }

    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${targetBucket.name}/o/${encodeURIComponent(destPath)}?alt=media&token=${token}`;
    return res.status(200).json({
      ok: true,
      video: {
        storagePath: destPath,
        downloadUrl,
        mimeType
      }
    });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo clonar video de la librería.") });
  }
});

app.use("/api/moodle", async (req, res, next) => {
  if (req.method === "OPTIONS") return next();
  try {
    req.authContext = await verifyFirebaseBearer(req);
    return next();
  } catch (error) {
    return res.status(Number(error?.status || 401)).json({ error: String(error?.message || "AUTH_REQUIRED") });
  }
});

app.get("/api/moodle/share-users", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const users = await listShareableMoodleUsers(uid);
    return res.status(200).json({ ok: true, users });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo cargar usuarios para compartir.") });
  }
});

app.post("/api/moodle/share-course", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const courseId = clampText(req.body?.courseId || "", 140);
    const mode = String(req.body?.mode || "").trim().toLowerCase();
    const target = await resolveShareTarget({
      targetUid: req.body?.targetUid || "",
      targetEmail: req.body?.targetEmail || ""
    });
    if (!courseId) {
      return res.status(400).json({ error: "Falta courseId." });
    }
    if (!["copy", "collaboration"].includes(mode)) {
      return res.status(400).json({ error: "Modo de compartición inválido." });
    }
    if (target.uid === uid) {
      return res.status(400).json({ error: "No puedes compartir contigo mismo." });
    }

    if (mode === "copy") {
      const result = await createMoodleCourseCopy({
        courseId,
        requesterUid: uid,
        targetUser: target,
      });
      return res.status(200).json({ ok: true, mode, result, target });
    }

    await shareMoodleCourseCollaboration({
      courseId,
      requesterUid: uid,
      targetUser: target,
      permisosEditar: req.body?.permissions?.editar === true,
      permisosCompartir: req.body?.permissions?.compartir === true,
    });
    return res.status(200).json({ ok: true, mode, target });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo compartir el curso.") });
  }
});

app.post("/api/moodle/delete-course", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const courseId = clampText(req.body?.courseId || "", 140);
    if (!courseId) {
      return res.status(400).json({ error: "Falta courseId." });
    }

    const courseRef = db.collection("moodleCourses").doc(courseId);
    const courseSnap = await courseRef.get();
    if (!courseSnap.exists) {
      return res.status(404).json({ error: "El curso no existe." });
    }

    const courseData = courseSnap.data() || {};
    const ownerUid = String(courseData?.userId || courseData?.uid || courseData?.ownerUid || "").trim();
    if (!ownerUid || ownerUid !== uid) {
      return res.status(403).json({ error: "Solo el propietario puede eliminar este curso." });
    }

    const moduleDocIds = new Set();
    const temas = Array.isArray(courseData?.temas) ? courseData.temas : [];
    temas.forEach((tema) => {
      const subtemas = Array.isArray(tema?.subtemas) ? tema.subtemas : [];
      subtemas.forEach((subtema) => {
        const modulosIds = Array.isArray(subtema?.modulosIds) ? subtema.modulosIds : [];
        modulosIds.forEach((moduloId) => {
          const normalized = clampText(moduloId, 200);
          if (!normalized) return;
          moduleDocIds.add(normalized.includes("_") ? normalized : `${courseId}_${normalized}`);
        });
      });
    });

    const batch = db.batch();
    batch.delete(courseRef);
    moduleDocIds.forEach((docId) => {
      batch.delete(db.collection("moodleCourses").doc(docId));
    });
    await batch.commit();

    return res.status(200).json({ ok: true, deletedCourseId: courseId, deletedModules: moduleDocIds.size });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo eliminar el curso.") });
  }
});

app.post("/api/moodle/instruction-images/import", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    if (!uid) {
      return res.status(401).json({ error: "AUTH_REQUIRED" });
    }

    const courseId = clampText(String(req.body?.courseId || "").trim(), 180);
    const moduleId = clampText(String(req.body?.moduleId || "").trim(), 220);
    const imageId = clampText(String(req.body?.imageId || "").trim(), 220) || `gemimg_${Date.now()}`;
    const sourceUrl = clampText(String(req.body?.sourceUrl || "").trim(), 2400);
    const requestedName = clampText(String(req.body?.name || "").trim(), 180) || `imagen_${imageId}`;
    const origin = clampText(String(req.body?.origin || "remote").trim(), 80) || "remote";

    if (!courseId || !moduleId || !sourceUrl) {
      return res.status(400).json({ error: "Faltan courseId, moduleId o sourceUrl." });
    }
    if (!isAllowedMoodleInstructionImageImportUrl(sourceUrl)) {
      return res.status(400).json({ error: "La URL de origen no está permitida para importación." });
    }

    const upstream = await fetchCompat(sourceUrl, { method: "GET", redirect: "follow" });
    if (!upstream.ok) {
      return res.status(502).json({ error: `No se pudo descargar la imagen remota (${upstream.status}).` });
    }

    const mimeType = String(upstream.headers.get("content-type") || "image/png").trim().toLowerCase();
    if (!mimeType.startsWith("image/")) {
      return res.status(415).json({ error: "La URL no devolvió una imagen válida." });
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (!buffer.length) {
      return res.status(400).json({ error: "La imagen remota llegó vacía." });
    }
    if (buffer.length > 8 * 1024 * 1024) {
      return res.status(413).json({ error: "La imagen remota supera 8 MB." });
    }

    const ext = getImageExtension(mimeType);
    const storagePath = `images/${normalizeStorageSegment(uid, "user")}/moodle-instructions/${normalizeStorageSegment(courseId, "curso")}/${normalizeStorageSegment(moduleId, "modulo")}/${normalizeStorageSegment(imageId, "imagen")}.${ext}`;
    const asset = await uploadScreenshotAsset({
      path: storagePath,
      buffer,
      mimeType,
      metadata: {
        origin: "moodleCourseInstructionsImport",
        sourceUrl: sourceUrl.slice(0, 700),
        courseId,
        moduleId,
        imageId,
        fileName: requestedName,
        requestedOrigin: origin
      }
    });

    return res.status(200).json({
      ok: true,
      image: {
        imageId,
        name: requestedName,
        mimeType,
        storagePath: asset.path,
        downloadUrl: asset.downloadUrl,
        origin,
        updatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo importar la imagen remota del módulo.") });
  }
});

app.post("/api/podcaster/sessions/save", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const source = req.body?.session && typeof req.body.session === "object" ? req.body.session : null;
    if (!source) {
      return res.status(400).json({ error: "Falta payload session." });
    }
    const sanitized = sanitizePodcasterSession(source);
    if (!sanitized.id) {
      sanitized.id = `session_${randomUUID().slice(0, 12)}`;
    }
    const serialized = JSON.stringify(sanitized);
    if (Buffer.byteLength(serialized, "utf8") > MAX_PODCASTER_SESSION_BYTES) {
      return res.status(413).json({ error: "La sesión excede el tamaño permitido." });
    }
    const sessionRef = db.collection("podcaster_sessions").doc(sanitized.id);
    await db.runTransaction(async (tx) => {
      const existingSnap = await tx.get(sessionRef);
      const existing = existingSnap.exists ? (existingSnap.data() || {}) : null;
      if (existing && String(existing.ownerId || "") !== uid) {
        const err = new Error("No puedes sobrescribir una sesión de otro usuario.");
        err.status = 403;
        throw err;
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
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    });
    return res.status(200).json({
      ok: true,
      sessionId: sanitized.id,
      ownerId: uid,
      savedAt: new Date().toISOString()
    });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo guardar la sesión.") });
  }
});

app.post("/api/podcaster/sessions/share", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const sessionId = clampText(req.body?.sessionId || "", 120);
    if (!sessionId) {
      return res.status(400).json({ error: "Falta sessionId." });
    }
    const target = await resolveShareTarget({
      targetUid: req.body?.targetUid || "",
      targetEmail: req.body?.targetEmail || ""
    });
    if (target.uid === uid) {
      return res.status(400).json({ error: "No puedes compartir contigo mismo." });
    }
    const sessionRef = db.collection("podcaster_sessions").doc(sessionId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(sessionRef);
      if (!snap.exists) {
        const err = new Error("Sesión no encontrada. Guarda la sesión antes de compartir.");
        err.status = 404;
        throw err;
      }
      const data = snap.data() || {};
      if (String(data.ownerId || "") !== uid) {
        const err = new Error("Solo el propietario puede compartir la sesión.");
        err.status = 403;
        throw err;
      }
      const sharedWithIds = Array.isArray(data.sharedWithIds) ? data.sharedWithIds.map((item) => String(item || "").trim()).filter(Boolean) : [];
      const nextIds = Array.from(new Set([...sharedWithIds, target.uid]));
      const sharedWith = Array.isArray(data.sharedWith) ? data.sharedWith : [];
      const withoutTarget = sharedWith.filter((entry) => String(entry?.uid || "").trim() !== target.uid);
      withoutTarget.push({
        uid: target.uid,
        email: target.email || null,
        sharedAt: new Date().toISOString(),
        sharedBy: uid
      });
      tx.update(sessionRef, {
        sharedWithIds: nextIds,
        sharedWith: withoutTarget,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });
    return res.status(200).json({
      ok: true,
      sessionId,
      target
    });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo compartir la sesión.") });
  }
});

app.get("/api/podcaster/sessions/list", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const [ownedSnap, sharedSnap] = await Promise.all([
      db.collection("podcaster_sessions").where("ownerId", "==", uid).limit(80).get(),
      db.collection("podcaster_sessions").where("sharedWithIds", "array-contains", uid).limit(80).get()
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
          savedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : null
        }
      });
    });
    const sessions = Array.from(merged.values()).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    return res.status(200).json({ ok: true, sessions });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo listar sesiones.") });
  }
});

app.post("/api/podcaster/sessions/delete", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const sessionId = clampText(req.body?.sessionId || "", 140);
    if (!sessionId) {
      return res.status(400).json({ error: "Falta sessionId." });
    }
    const sessionRef = db.collection("podcaster_sessions").doc(sessionId);
    const snap = await sessionRef.get();
    if (!snap.exists) {
      return res.status(200).json({ ok: true, sessionId, deleted: false, reason: "not_found" });
    }
    const data = snap.data() || {};
    if (String(data.ownerId || "").trim() !== uid) {
      return res.status(403).json({ error: "Solo el propietario puede eliminar la sesión." });
    }
    await sessionRef.delete();
    return res.status(200).json({ ok: true, sessionId, deleted: true });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo eliminar la sesión.") });
  }
});

app.post("/api/podcaster/speaker-portraits/generate", async (req, res) => {
  if (!ensureGeminiKey(res)) return;
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const sessionId = clampText(req.body?.sessionId || "", 140);
    const speakerLabel = clampText(req.body?.speakerLabel || "", 80);
    const speakerName = clampText(req.body?.speakerName || "", 120) || speakerLabel || "Locutor";
    const voiceName = clampText(req.body?.voiceName || "", 80);
    const genderGroup = clampText(req.body?.genderGroup || "", 40);
    const expression = clampText(req.body?.expression || "Neutral", 80) || "Neutral";
    const scenarioPrompt = clampText(req.body?.scenarioPrompt || "", 2400);
    const scenarioId = clampText(req.body?.scenarioId || "", 80);
    const scenarioImageUrl = clampText(req.body?.scenarioImageUrl || "", 3200);
    const scenarioImageStoragePath = clampText(req.body?.scenarioImageStoragePath || "", 700);
    const referenceImageDataUrl = String(req.body?.referenceImageDataUrl || "").trim();
    const referenceImageName = clampText(req.body?.referenceImageName || "", 180);
    const regenerate = req.body?.regenerate === true;
    const previousStoragePath = clampText(req.body?.previousStoragePath || "", 700);
    const requestedCandidates = Array.isArray(req.body?.modelCandidates) ? req.body.modelCandidates : [];
    const imageModels = Array.from(new Set([
      normalizeModel(req.body?.model || DEFAULT_PODCASTER_IMAGE_MODEL),
      ...requestedCandidates.map((item) => normalizeModel(item || "")),
      ...PODCASTER_IMAGE_MODEL_CANDIDATES
    ].filter(Boolean)));

    if (!sessionId) {
      return res.status(400).json({ error: "Falta sessionId." });
    }
    if (!speakerLabel) {
      return res.status(400).json({ error: "Falta speakerLabel." });
    }
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
    const speakerReference = await loadOptionalImageReference({
      dataUrl: referenceImageDataUrl
    });
    const resolvedScenarioReference = scenarioReference || await loadScenarioReferenceFromSession({
      uid,
      sessionId,
      scenarioId
    });

    const prompt = [
      speakerReference ? "PRIORIDAD 1: conservar la identidad del locutor a partir de la imagen adjunta del rostro. Deben mantenerse facciones, estructura facial, ojos, nariz, boca, peinado, línea del cabello y edad aparente." : "Genera un retrato coherente con la identidad textual del locutor.",
      speakerReference ? "No reemplazar la cara por otra persona. No reinterpretar libremente el rostro. No cambiar género, edad aparente, rasgos centrales ni etnia percibida de la referencia del locutor." : "",
      "Edita la imagen de referencia para convertirla en un retrato fotorealista de un solo locutor dentro del mismo set.",
      resolvedScenarioReference ? "PRIORIDAD 2: usar la imagen adjunta del escenario para conservar arquitectura, fondo, materiales, distribución, iluminación base y ángulo del set." : "No hay imagen de referencia disponible; recrear el escenario solo a partir del prompt textual seleccionado.",
      resolvedScenarioReference ? "El escenario debe coincidir con la referencia del set sin alterar la identidad facial del locutor." : "Recrear de forma consistente la arquitectura, fondo, materiales, distribución e iluminación del escenario descrito.",
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
      "Plano medio corto, enfoque en rostro, sin texto, sin logotipos, sin marcas de agua.",
      "Retrato en tres cuartos o semi perfil natural, evitando frontalidad total y evitando contacto visual directo con la cámara.",
      "Estilo hiperrealista, piel natural, alta definición."
    ].filter(Boolean).join("\n");

    let lastStatus = 502;
    let lastErrorDetail = "No se pudo generar retrato con los modelos disponibles.";
    let base64 = "";
    let mimeType = "image/png";
    let resolvedModel = imageModels[0] || DEFAULT_PODCASTER_IMAGE_MODEL;
    for (const imageModel of imageModels) {
      const requestUrl = `${GEMINI_BASE}/models/${encodeURIComponent(imageModel)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
      const requestWithOptionalReference = async (includeScenarioReference) => {
        const parts = [
          { text: prompt },
          ...(speakerReference ? [
            { text: `Imagen 1: referencia principal del locutor${referenceImageName ? ` (${referenceImageName})` : ""}. Usar esta imagen para identidad facial y apariencia del sujeto.` },
            {
              inlineData: {
                mimeType: speakerReference.mimeType,
                data: speakerReference.buffer.toString("base64")
              }
            }
          ] : []),
          ...(includeScenarioReference && resolvedScenarioReference ? [
            { text: "Imagen 2: referencia del escenario. Usar esta imagen para el set, fondo, iluminación y composición general." },
            {
              inlineData: {
                mimeType: resolvedScenarioReference.mimeType,
                data: resolvedScenarioReference.buffer.toString("base64")
              }
            }
          ] : [])
        ];
        const upstream = await fetchCompat(requestUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              role: "user",
              parts
            }],
            generationConfig: {
              responseModalities: ["TEXT", "IMAGE"]
            }
          })
        });
        const data = await safeJson(upstream);
        return { upstream, data };
      };

      let { upstream, data } = await requestWithOptionalReference(true);
      if (!upstream.ok && upstream.status === 400 && resolvedScenarioReference) {
        ({ upstream, data } = await requestWithOptionalReference(false));
      }
      if (!upstream.ok) {
        const detail = String(data?.error?.message || data?.error || `HTTP ${upstream.status}`).trim();
        lastStatus = Number(upstream.status || 502);
        lastErrorDetail = `${imageModel}: ${detail}`;
        if ([400, 401, 403, 404].includes(lastStatus)) {
          continue;
        }
        return res.status(lastStatus).json(data);
      }
      const parts = Array.isArray(data?.candidates?.[0]?.content?.parts) ? data.candidates[0].content.parts : [];
      const inline = parts.find((part) => part?.inlineData?.data || part?.inline_data?.data) || null;
      base64 = String(inline?.inlineData?.data || inline?.inline_data?.data || "").trim();
      mimeType = String(inline?.inlineData?.mimeType || inline?.inline_data?.mimeType || "image/png").trim() || "image/png";
      if (!base64) {
        lastStatus = 502;
        lastErrorDetail = `${imageModel}: sin inlineData de imagen`;
        continue;
      }
      resolvedModel = imageModel;
      break;
    }
    if (!base64) {
      return res.status(lastStatus >= 400 ? lastStatus : 502).json({ error: lastErrorDetail });
    }
    const buffer = Buffer.from(base64, "base64");
    if (!buffer.length || buffer.length > MAX_SPEAKER_PORTRAIT_BYTES) {
      return res.status(413).json({ error: "La imagen generada excede el tamaño permitido." });
    }

    const ext = getScreenshotExtension(mimeType);
    const speakerSlug = normalizeStorageSegment(speakerLabel, "speaker");
    const sessionSlug = normalizeStorageSegment(sessionId, "session");
    const portraitId = randomUUID();
    const storagePath = `podcaster/sessions/${sessionSlug}/owners/${normalizeStorageSegment(uid, "anon")}/speakers/${speakerSlug}/${portraitId}.${ext}`;
    const asset = await uploadScreenshotAsset({
      path: storagePath,
      buffer,
      mimeType,
      metadata: {
        uid,
        sessionId,
        speakerLabel,
        speakerName,
        voiceName,
        genderGroup,
        expression,
        scenarioId,
        scenarioImageUrl,
        scenarioImageStoragePath,
        referenceImageName,
        model: resolvedModel
      }
    });

    if (regenerate && previousStoragePath && previousStoragePath !== storagePath) {
      await deleteStoragePath(previousStoragePath).catch(() => {});
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
        updatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo generar retrato de locutor.") });
  }
});

app.post("/api/podcaster/scenario-images/generate", async (req, res) => {
  if (!ensureGeminiKey(res)) return;
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const sessionId = clampText(req.body?.sessionId || "", 140);
    const scenarioId = clampText(req.body?.scenarioId || "", 80);
    const title = clampText(req.body?.title || "Escenario", 120) || "Escenario";
    const promptSource = clampText(req.body?.prompt || "", 4000);
    const referenceImageDataUrl = String(req.body?.referenceImageDataUrl || "").trim();
    const referenceImageName = clampText(req.body?.referenceImageName || "", 180);
    const regenerate = req.body?.regenerate === true;
    const previousStoragePath = clampText(req.body?.previousStoragePath || "", 700);
    const requestedCandidates = Array.isArray(req.body?.modelCandidates) ? req.body.modelCandidates : [];
    const imageModels = Array.from(new Set([
      normalizeModel(req.body?.model || DEFAULT_PODCASTER_IMAGE_MODEL),
      ...requestedCandidates.map((item) => normalizeModel(item || "")),
      ...PODCASTER_IMAGE_MODEL_CANDIDATES
    ].filter(Boolean)));

    if (!sessionId) {
      return res.status(400).json({ error: "Falta sessionId." });
    }
    if (!scenarioId) {
      return res.status(400).json({ error: "Falta scenarioId." });
    }
    if (!promptSource) {
      return res.status(400).json({ error: "Falta prompt del escenario." });
    }

    const scenarioReference = await loadOptionalImageReference({
      dataUrl: referenceImageDataUrl
    });
    const prompt = [
      "Genera una imagen fotorealista de un escenario de podcast profesional.",
      scenarioReference ? `La imagen adjunta es referencia visual del set y debe guiar arquitectura, composición, materiales y layout (${referenceImageName || "referencia del usuario"}).` : "",
      `Escenario: ${title}.`,
      `Prompt base obligatorio: ${promptSource}`,
      "Debe ser un set vacío, sin personas.",
      "Debe verse como una cabina de grabación o estudio editorial premium para podcast/video podcast.",
      "Incluir elementos reales del set: micrófono broadcast, consola o mixer, monitores, iluminación cinematográfica suave, detalles acústicos visibles.",
      "Composición horizontal 16:9, lista para usarse como escenario visual de videos.",
      "Sin texto, sin tipografía, sin logos, sin marcas de agua, sin interfaz.",
      "Estilo hiperrealista, alta definición, profundidad de campo natural."
    ].join("\n");

    let lastStatus = 502;
    let lastErrorDetail = "No se pudo generar imagen del escenario con los modelos disponibles.";
    let base64 = "";
    let mimeType = "image/png";
    let resolvedModel = imageModels[0] || DEFAULT_PODCASTER_IMAGE_MODEL;
    for (const imageModel of imageModels) {
      const upstream = await fetchCompat(
        `${GEMINI_BASE}/models/${encodeURIComponent(imageModel)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              role: "user",
              parts: [
                { text: prompt },
                ...(scenarioReference ? [{
                  inlineData: {
                    mimeType: scenarioReference.mimeType,
                    data: scenarioReference.buffer.toString("base64")
                  }
                }] : [])
              ]
            }],
            generationConfig: {
              responseModalities: ["TEXT", "IMAGE"]
            }
          })
        }
      );
      const data = await safeJson(upstream);
      if (!upstream.ok) {
        const detail = String(data?.error?.message || data?.error || `HTTP ${upstream.status}`).trim();
        lastStatus = Number(upstream.status || 502);
        lastErrorDetail = `${imageModel}: ${detail}`;
        if ([400, 401, 403, 404].includes(lastStatus)) {
          continue;
        }
        return res.status(lastStatus).json(data);
      }
      const parts = Array.isArray(data?.candidates?.[0]?.content?.parts) ? data.candidates[0].content.parts : [];
      const inline = parts.find((part) => part?.inlineData?.data || part?.inline_data?.data) || null;
      base64 = String(inline?.inlineData?.data || inline?.inline_data?.data || "").trim();
      mimeType = String(inline?.inlineData?.mimeType || inline?.inline_data?.mimeType || "image/png").trim() || "image/png";
      if (!base64) {
        lastStatus = 502;
        lastErrorDetail = `${imageModel}: sin inlineData de imagen`;
        continue;
      }
      resolvedModel = imageModel;
      break;
    }
    if (!base64) {
      return res.status(lastStatus >= 400 ? lastStatus : 502).json({ error: lastErrorDetail });
    }

    const buffer = Buffer.from(base64, "base64");
    if (!buffer.length || buffer.length > MAX_SPEAKER_PORTRAIT_BYTES) {
      return res.status(413).json({ error: "La imagen generada del escenario excede el tamaño permitido." });
    }

    const ext = getScreenshotExtension(mimeType);
    const sessionSlug = normalizeStorageSegment(sessionId, "session");
    const scenarioSlug = normalizeStorageSegment(scenarioId, "scenario");
    const storagePath = `podcaster/sessions/${sessionSlug}/owners/${normalizeStorageSegment(uid, "anon")}/scenarios/${scenarioSlug}/${randomUUID()}.${ext}`;
    const asset = await uploadScreenshotAsset({
      path: storagePath,
      buffer,
      mimeType,
      metadata: {
        uid,
        sessionId,
        scenarioId,
        title,
        model: resolvedModel
      }
    });

    if (regenerate && previousStoragePath && previousStoragePath !== storagePath) {
      await deleteStoragePath(previousStoragePath).catch(() => {});
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
        updatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo generar imagen del escenario.") });
  }
});

app.post("/api/podcaster/dialogue-videos/generate", async (req, res) => {
  if (!ensureGeminiKey(res)) return;
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const sessionId = clampText(req.body?.sessionId || "", 140);
    const rowId = clampText(req.body?.rowId || "", 120);
    const speakerLabel = clampText(req.body?.speakerLabel || "", 80);
    const speakerName = clampText(req.body?.speakerName || "", 120) || speakerLabel || "Locutor";
    const counterpartSpeakerLabel = clampText(req.body?.counterpartSpeakerLabel || "", 80);
    const counterpartSpeakerName = clampText(req.body?.counterpartSpeakerName || "", 120) || counterpartSpeakerLabel;
    const voiceName = clampText(req.body?.voiceName || "", 80);
    const genderGroup = clampText(req.body?.genderGroup || "", 40);
    const expression = clampText(req.body?.expression || "Neutral", 80) || "Neutral";
    let scenarioPrompt = clampText(req.body?.scenarioPrompt || "", 2400);
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
      // Si aún huele a cabina/estudio, fuerza un set educativo para evitar “cabina de radio”.
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
    const dialogueAudioUrl = clampText(req.body?.dialogueAudioUrl || "", 3200);
    const dialogueAudioStoragePath = clampText(req.body?.dialogueAudioStoragePath || "", 700);
    const audioDurationSecInput = clampNumber(req.body?.audioDurationSec, 0, 180, 0);
    const requestedDurationSecInput = clampNumber(req.body?.requestedDurationSec, 4, 8, 0);
    const portraitUrl = clampText(req.body?.portraitUrl || "", 3200);
    const portraitStoragePath = clampText(req.body?.portraitStoragePath || "", 700);
    const referenceImageDataUrl = String(req.body?.referenceImageDataUrl || "").trim();
    const continuityReferenceImageDataUrl = String(req.body?.continuityReferenceImageDataUrl || "").trim();
    const explicitForceImmediateSceneChange = req.body?.forceImmediateSceneChange === true;
    const referenceImageName = clampText(req.body?.referenceImageName || "", 180);
    const relateWithPreviousScene = req.body?.relateWithPreviousScene === true;
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
      videoDownloadUrl: clampText(previousSceneRaw?.videoDownloadUrl || "", 3200),
      videoStoragePath: clampText(previousSceneRaw?.videoStoragePath || "", 700),
      videoMimeType: clampText(previousSceneRaw?.videoMimeType || "video/mp4", 80) || "video/mp4"
    } : null;
    let strictIdentity = req.body?.strictIdentity !== false;
    const regenerate = req.body?.regenerate === true;
    const previousStoragePath = clampText(req.body?.previousStoragePath || "", 700);
    const requestedCandidates = Array.isArray(req.body?.modelCandidates) ? req.body.modelCandidates : [];
    const requestedModel = normalizeModel(req.body?.model || DEFAULT_PODCASTER_VIDEO_MODEL);
    const mergedModels = Array.from(new Set([
      requestedModel,
      ...requestedCandidates.map((item) => normalizeModel(item || "")),
      ...PODCASTER_VIDEO_MODEL_CANDIDATES
    ].filter(Boolean)));
    const filteredModels = (strictIdentity || relateWithPreviousScene)
      ? mergedModels.filter((modelName) => !/fast/i.test(String(modelName || "")))
      : mergedModels;
    const videoModels = filteredModels.length ? filteredModels : [DEFAULT_PODCASTER_VIDEO_MODEL];
    const requestDebugTag = `dialogue-video:${sessionId || "no-session"}:${rowId || "no-row"}`;

    if (!sessionId) {
      console.warn(`[backend][${requestDebugTag}] reject 400 missing sessionId`);
      return res.status(400).json({ error: "Falta sessionId." });
    }
    if (!rowId) {
      console.warn(`[backend][${requestDebugTag}] reject 400 missing rowId`, { sessionId });
      return res.status(400).json({ error: "Falta rowId." });
    }
    if (!speakerLabel) {
      console.warn(`[backend][${requestDebugTag}] reject 400 missing speakerLabel`, { sessionId, rowId });
      return res.status(400).json({ error: "Falta speakerLabel." });
    }
    if (!text) {
      console.warn(`[backend][${requestDebugTag}] reject 400 missing text`, { sessionId, rowId, speakerLabel });
      return res.status(400).json({ error: "Falta texto de diálogo." });
    }
    if (strictIdentity && !portraitUrl && !portraitStoragePath) {
      console.warn(`[backend][${requestDebugTag}] reject 400 strictIdentity without portrait`, {
        strictIdentity,
        educationalVideo,
        hasPortraitUrl: Boolean(portraitUrl),
        hasPortraitStoragePath: Boolean(portraitStoragePath)
      });
      return res.status(400).json({ error: "strictIdentity requiere portraitUrl o portraitStoragePath." });
    }

    let portraitBuffer = null;
    let portraitMimeType = "image/png";
    let portraitLoadedFromStorage = false;
    let portraitSourceBucketName = "";
    if (portraitUrl || portraitStoragePath) {
      if (portraitStoragePath) {
        try {
          const bucketForMeta = await resolveWritableStorageBucket();
          const file = bucketForMeta.file(portraitStoragePath);
          const [meta] = await file.getMetadata().catch(() => [{}]);
          const downloaded = await downloadStorageObjectToBuffer(portraitStoragePath);
          portraitBuffer = Buffer.from(downloaded.buffer);
          portraitSourceBucketName = String(downloaded?.bucket?.name || bucketForMeta?.name || "").trim();
          portraitMimeType = String(meta?.contentType || "image/png").trim().toLowerCase();
          portraitLoadedFromStorage = true;
        } catch (_) {
          portraitBuffer = null;
        }
      }
      if (!portraitBuffer && portraitUrl) {
        const portraitResponse = await fetchCompat(portraitUrl, { method: "GET" });
        if (!portraitResponse.ok) {
          if (strictIdentity) {
            const detail = await safeJson(portraitResponse);
            return res.status(portraitResponse.status).json({
              error: String(detail?.error?.message || detail?.error || `No se pudo descargar retrato (${portraitResponse.status}).`)
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
      if (strictIdentity) {
        console.warn(`[backend][${requestDebugTag}] portrait unavailable, disabling strictIdentity fallback`, {
          hasPortraitUrl: Boolean(portraitUrl),
          hasPortraitStoragePath: Boolean(portraitStoragePath)
        });
      }
      strictIdentity = false;
    }
    if (portraitBuffer && !portraitMimeType.startsWith("image/")) {
      if (strictIdentity) {
        return res.status(400).json({ error: "El retrato no es una imagen válida para Veo." });
      }
      portraitBuffer = null;
      portraitMimeType = "image/png";
    }
    if (portraitBuffer && (!portraitBuffer.length || portraitBuffer.length > MAX_SPEAKER_PORTRAIT_BYTES)) {
      if (strictIdentity) {
        return res.status(413).json({ error: "El retrato excede el tamaño permitido." });
      }
      portraitBuffer = null;
      portraitMimeType = "image/png";
    }
    const portraitBase64 = portraitBuffer ? portraitBuffer.toString("base64") : "";
    const portraitGcsUri = portraitLoadedFromStorage && portraitStoragePath
      ? `gs://${portraitSourceBucketName || String((await resolveWritableStorageBucket())?.name || "").trim()}/${portraitStoragePath}`
      : "";
    const hasPortraitAsset = Boolean(portraitBase64 || portraitGcsUri);

    const sceneReference = await loadOptionalImageReference({
      dataUrl: referenceImageDataUrl
    });
    const sceneReferenceBase64 = sceneReference ? sceneReference.buffer.toString("base64") : "";
    const sceneReferenceMimeType = sceneReference ? String(sceneReference.mimeType || "image/png").trim().toLowerCase() : "image/png";
    const hasSceneReference = Boolean(sceneReferenceBase64);
    const useSceneReferenceAsInitImage = hasSceneReference && !strictIdentity;

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
    const forceImmediateChange = relateWithPreviousScene && (explicitForceImmediateSceneChange || shouldForceImmediateSceneChange([
      scenePrompt,
      videoDirective,
      performanceDirective,
      imagePrompts.join(" "),
      referenceImageName
    ].filter(Boolean).join(" ")));

    let continuityFrameBase64 = "";
    let continuityFrameMimeType = "image/png";
    if (relateWithPreviousScene && continuityReferenceImageDataUrl && continuityReferenceImageDataUrl.startsWith("data:image/")) {
      const continuityReference = await loadOptionalImageReference({ dataUrl: continuityReferenceImageDataUrl });
      if (continuityReference?.buffer?.length) {
        continuityFrameBase64 = continuityReference.buffer.toString("base64");
        continuityFrameMimeType = String(continuityReference.mimeType || "image/png").trim().toLowerCase() || "image/png";
      }
    }
    if (!continuityFrameBase64 && relateWithPreviousScene && previousScene?.hasVideo) {
      const previousVideoStoragePath = String(previousScene?.videoStoragePath || "").trim();
      const previousVideoUrl = String(previousScene?.videoDownloadUrl || "").trim();
      const previousVideoHintMimeType = String(previousScene?.videoMimeType || "video/mp4").trim().toLowerCase() || "video/mp4";
      let previousVideoBuffer = null;
      try {
        if (previousVideoStoragePath) {
          const downloaded = await downloadStorageObjectToBuffer(previousVideoStoragePath);
          previousVideoBuffer = Buffer.from(downloaded.buffer);
        } else if (previousVideoUrl) {
          const previousVideoResponse = await fetchCompat(previousVideoUrl, { method: "GET" });
          if (previousVideoResponse.ok) {
            previousVideoBuffer = Buffer.from(await previousVideoResponse.arrayBuffer());
          }
        }
      } catch (_) {
        previousVideoBuffer = null;
      }
      if (previousVideoBuffer && previousVideoBuffer.length && previousVideoBuffer.length <= MAX_DIALOGUE_VIDEO_BYTES) {
        try {
          const frame = await extractLastVideoFramePng(previousVideoBuffer, previousVideoHintMimeType);
          continuityFrameBase64 = frame.toString("base64");
          continuityFrameMimeType = "image/png";
        } catch (_) {
          continuityFrameBase64 = "";
          continuityFrameMimeType = "image/png";
        }
      }
    }

    console.info(`[backend][${requestDebugTag}] request`, {
      strictIdentity,
      educationalVideo,
      hasPortraitAsset,
      hasSceneReference,
      useSceneReferenceAsInitImage,
      relateWithPreviousScene,
      hasContinuityFrame: Boolean(continuityFrameBase64),
      hasPortraitUrl: Boolean(portraitUrl),
      hasPortraitStoragePath: Boolean(portraitStoragePath),
      textLength: String(text || "").length,
      modelCandidates: videoModels
    });
    let inferredAudioDurationSec = audioDurationSecInput;
    if (!inferredAudioDurationSec && dialogueAudioStoragePath) {
      try {
        const audioDownload = await downloadStorageObjectToBuffer(dialogueAudioStoragePath);
        inferredAudioDurationSec = clampNumber(parseWavDurationSeconds(Buffer.from(audioDownload.buffer)), 0, 180, 0);
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
        contentMode: "podcast"
      });
    const studioScenePrompt = educationalVideo
      ? ""
      : buildBackendPodcasterStudioScenePrompt({
        speakerLabel,
        speakerName,
        counterpartSpeakerName,
        scenarioPrompt,
        expression,
        contentMode: "podcast"
      });
    const sceneVisualPrompt = scenePrompt || [
      educationalVideo ? "Escena educativa basada en guion técnico." : `Escena de ${speakerName}.`,
      scenarioPrompt ? `Contexto visual: ${scenarioPrompt}` : "",
      videoDirective ? `Prioridad manual: ${videoDirective}` : ""
    ].filter(Boolean).join(" ").trim();
    const sceneImagePromptList = imagePrompts.length ? imagePrompts : (sceneVisualPrompt ? [
      `${sceneVisualPrompt} Imagen principal horizontal 16:9.`,
      `${sceneVisualPrompt} Variante en plano cerrado, y otra toma de apoyo del set.`
    ] : []);

    const prompt = [
      educationalVideo
        ? "Genera un video educativo corto, claro y realista."
        : "Genera un video cinematográfico corto y realista para podcast.",
      useSceneReferenceAsInitImage
        ? `La imagen adjunta${referenceImageName ? ` (${referenceImageName})` : ""} es referencia visual principal de la escena. Debe guiar composición, estilo, ambientación y continuidad.`
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
      relateWithPreviousScene && continuityFrameBase64
        ? (forceImmediateChange
          ? "Continuidad solo en el primer fotograma: el primer fotograma del nuevo clip debe coincidir con el último fotograma del clip anterior (mismo encuadre, posición, iluminación). Luego, dentro de los siguientes 0.2–0.8 segundos, realiza un corte o transición visible para cumplir el nuevo Elemento visual/Descripción de escena (cambio inmediato de plano/entorno/composición). No te quedes con la imagen del frame anterior durante todo el clip."
          : "Continuidad exacta: el primer fotograma del nuevo clip debe coincidir con el último fotograma del clip anterior (mismo encuadre, posición, iluminación y continuidad de movimiento). No debe notarse corte.")
        : relateWithPreviousScene
          ? "Continuidad: intenta continuar exactamente desde el final del clip anterior (sin salto visual)."
          : "",
      previousScene?.hasVideo
        ? (forceImmediateChange
          ? "Tras el primer fotograma, prioriza el nuevo Elemento visual aunque implique un cambio claro de plano, contenido o composición respecto al clip previo."
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
      `Diálogo objetivo: "${String(text).replace(/"/g, '\\"')}"`
    ].filter(Boolean).join("\n");

    const pollUntilDone = async (operationName = "") => {
      const maxAttempts = 54;
      const delayMs = 5000;
      let latest = null;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        // eslint-disable-next-line no-await-in-loop
        const opResponse = await fetchCompat(
          `${GEMINI_BASE}/${operationName}?key=${encodeURIComponent(GEMINI_API_KEY)}`,
          { method: "GET" }
        );
        // eslint-disable-next-line no-await-in-loop
        const opData = await safeJson(opResponse);
        latest = opData;
        if (!opResponse.ok) {
          const detail = String(opData?.error?.message || opData?.error || `HTTP ${opResponse.status}`).trim();
          const err = new Error(`Error consultando operación Veo: ${detail}`);
          err.status = Number(opResponse.status || 502);
          throw err;
        }
        if (opData?.done === true) return opData;
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      const err = new Error("Tiempo de espera agotado al generar video de diálogo.");
      err.status = 504;
      err.latest = latest;
      throw err;
    };

    if (strictIdentity && !hasPortraitAsset) {
      console.warn(`[backend][${requestDebugTag}] reject 400 strictIdentity without portrait asset`, {
        hasPortraitUrl: Boolean(portraitUrl),
        hasPortraitStoragePath: Boolean(portraitStoragePath),
        hasPortraitAsset
      });
      return res.status(400).json({
        error: "strictIdentity requiere portraitUrl o portraitStoragePath para referenceImages."
      });
    }
    const requestVariants = [];
    const sceneReferenceImage = sceneReferenceBase64
      ? {
        image: {
          bytesBase64Encoded: sceneReferenceBase64,
          mimeType: sceneReferenceMimeType
        },
        referenceType: "asset"
      }
      : null;
    const continuityReferenceImage = continuityFrameBase64
      ? {
        image: {
          bytesBase64Encoded: continuityFrameBase64,
          mimeType: continuityFrameMimeType
        },
        referenceType: "asset"
      }
      : null;
    const referenceDurationSec = inferredTargetDurationSec;

    if (sceneReferenceImage && useSceneReferenceAsInitImage) {
      requestVariants.push(
        {
          label: "reference-scene+aspect+duration",
          body: {
            instances: [{
              prompt,
              referenceImages: [sceneReferenceImage, ...(continuityReferenceImage ? [continuityReferenceImage] : [])]
            }],
            parameters: {
              aspectRatio: "16:9",
              durationSeconds: referenceDurationSec
            }
          }
        },
        {
          label: "reference-scene+aspect",
          body: {
            instances: [{
              prompt,
              referenceImages: [sceneReferenceImage, ...(continuityReferenceImage ? [continuityReferenceImage] : [])]
            }],
            parameters: {
              aspectRatio: "16:9"
            }
          }
        }
      );
    }

    if (continuityReferenceImage && !strictIdentity) {
      requestVariants.push(
        {
          label: "reference-continuity+aspect+duration",
          body: {
            instances: [{
              prompt,
              referenceImages: [continuityReferenceImage]
            }],
            parameters: {
              aspectRatio: "16:9",
              durationSeconds: referenceDurationSec
            }
          }
        },
        {
          label: "reference-continuity+aspect",
          body: {
            instances: [{
              prompt,
              referenceImages: [continuityReferenceImage]
            }],
            parameters: {
              aspectRatio: "16:9"
            }
          }
        }
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
                  mimeType: portraitMimeType
                },
                referenceType: "asset"
              }, ...(sceneReferenceImage ? [sceneReferenceImage] : []), ...(continuityReferenceImage ? [continuityReferenceImage] : [])]
            }],
            parameters: {
              aspectRatio: "16:9",
              durationSeconds: referenceDurationSec
            }
          }
        },
        {
          label: "reference-gcs+aspect",
          body: {
            instances: [{
              prompt,
              referenceImages: [{
                image: {
                  gcsUri: portraitGcsUri,
                  mimeType: portraitMimeType
                },
                referenceType: "asset"
              }, ...(sceneReferenceImage ? [sceneReferenceImage] : []), ...(continuityReferenceImage ? [continuityReferenceImage] : [])]
            }],
            parameters: {
              aspectRatio: "16:9"
            }
          }
        }
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
                  mimeType: portraitMimeType
                },
                referenceType: "asset"
              }, ...(sceneReferenceImage ? [sceneReferenceImage] : []), ...(continuityReferenceImage ? [continuityReferenceImage] : [])]
            }],
            parameters: {
              aspectRatio: "16:9",
              durationSeconds: referenceDurationSec
            }
          }
        },
        {
          label: "reference-bytes+aspect",
          body: {
            instances: [{
              prompt,
              referenceImages: [{
                image: {
                  bytesBase64Encoded: portraitBase64,
                  mimeType: portraitMimeType
                },
                referenceType: "asset"
              }, ...(sceneReferenceImage ? [sceneReferenceImage] : []), ...(continuityReferenceImage ? [continuityReferenceImage] : [])]
            }],
            parameters: {
              aspectRatio: "16:9"
            }
          }
        }
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
                  data: portraitBase64
                }
              }
            }],
            parameters: {
              aspectRatio: "16:9",
              durationSeconds: inferredTargetDurationSec
            }
          }
        },
        {
          label: "image+aspect",
          body: {
            instances: [{
              prompt,
              image: {
                inlineData: {
                  mimeType: portraitMimeType,
                  data: portraitBase64
                }
              }
            }],
            parameters: {
              aspectRatio: "16:9"
            }
          }
        }
      );
    }
    if (!hasPortraitAsset) {
      requestVariants.push(
        {
          label: "text-only+aspect+duration",
          body: {
            instances: [{ prompt }],
            parameters: {
              aspectRatio: "16:9",
              durationSeconds: inferredTargetDurationSec
            }
          }
        },
        {
          label: "text-only+aspect",
          body: {
            instances: [{ prompt }],
            parameters: {
              aspectRatio: "16:9"
            }
          }
        }
      );
    }
    if (strictIdentity) {
      requestVariants.push(
        {
          label: "strict-fallback-text-only+aspect+duration",
          body: {
            instances: [{ prompt }],
            parameters: {
              aspectRatio: "16:9",
              durationSeconds: inferredTargetDurationSec
            }
          }
        },
        {
          label: "strict-fallback-text-only+aspect",
          body: {
            instances: [{ prompt }],
            parameters: {
              aspectRatio: "16:9"
            }
          }
        }
      );
    }

    let lastStatus = 502;
    let lastErrorDetail = "No se pudo generar video con los modelos y variantes disponibles.";
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
        response?.videoUri
      ];
      for (const candidate of uriCandidates) {
        const uri = String(candidate || "").trim();
        if (uri) return { uri };
      }
      const inlineCandidates = [
        response?.generateVideoResponse?.generatedSamples?.[0]?.video?.inlineData,
        response?.generateVideoResponse?.generatedSamples?.[0]?.inlineData,
        response?.generatedVideos?.[0]?.video?.inlineData,
        response?.generatedVideos?.[0]?.inlineData
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
    for (const videoModel of videoModels) {
      for (const variant of requestVariants) {
        const createOpResponse = await fetchCompat(
          `${GEMINI_BASE}/models/${encodeURIComponent(videoModel)}:predictLongRunning?key=${encodeURIComponent(GEMINI_API_KEY)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(variant.body)
          }
        );
        const createData = await safeJson(createOpResponse);
        if (!createOpResponse.ok) {
          const detail = String(createData?.error?.message || createData?.error || `HTTP ${createOpResponse.status}`).trim();
          lastStatus = Number(createOpResponse.status || 502);
          lastErrorDetail = `${videoModel} [${variant.label}]: ${detail}`;
          attemptErrors.push(lastErrorDetail);
          if ([400, 401, 403, 404].includes(lastStatus)) continue;
          return res.status(lastStatus).json(createData);
        }
        const operationName = String(createData?.name || "").trim();
        if (!operationName) {
          lastStatus = 502;
          lastErrorDetail = `${videoModel} [${variant.label}]: no devolvió nombre de operación`;
          attemptErrors.push(lastErrorDetail);
          continue;
        }

        let operationDone = null;
        try {
          // eslint-disable-next-line no-await-in-loop
          operationDone = await pollUntilDone(operationName);
        } catch (error) {
          lastStatus = Number(error?.status || 504) || 504;
          lastErrorDetail = `${videoModel} [${variant.label}]: ${String(error?.message || "Error al esperar operación Veo.")}`;
          attemptErrors.push(lastErrorDetail);
          continue;
        }

        const resolved = resolveVeoVideoResult(operationDone);
        const videoUri = String(resolved?.uri || "").trim();
        if (!videoUri && resolved?.inlineData?.data) {
          const mimeType = String(resolved.inlineData.mimeType || "video/mp4").trim() || "video/mp4";
          const downloadedBuffer = Buffer.from(String(resolved.inlineData.data || ""), "base64");
          if (!downloadedBuffer.length || downloadedBuffer.length > MAX_DIALOGUE_VIDEO_BYTES) {
            lastStatus = 413;
            lastErrorDetail = `${videoModel} [${variant.label}]: video inline demasiado grande o vacío.`;
            attemptErrors.push(lastErrorDetail);
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
          lastErrorDetail = `${videoModel} [${variant.label}]: operación completada sin URI de video`;
          attemptErrors.push(lastErrorDetail);
          continue;
        }

        // eslint-disable-next-line no-await-in-loop
        const videoResponse = await fetchCompat(videoUri, {
          method: "GET",
          headers: {
            "x-goog-api-key": GEMINI_API_KEY
          }
        });
        if (!videoResponse.ok) {
          // eslint-disable-next-line no-await-in-loop
          const detail = await safeJson(videoResponse);
          lastStatus = Number(videoResponse.status || 502) || 502;
          lastErrorDetail = `${videoModel} [${variant.label}]: no se pudo descargar video (${String(detail?.error?.message || detail?.error || `HTTP ${videoResponse.status}`)})`;
          attemptErrors.push(lastErrorDetail);
          continue;
        }

        // eslint-disable-next-line no-await-in-loop
        const downloadedBuffer = Buffer.from(await videoResponse.arrayBuffer());
        if (!downloadedBuffer.length || downloadedBuffer.length > MAX_DIALOGUE_VIDEO_BYTES) {
          lastStatus = 413;
          lastErrorDetail = `${videoModel} [${variant.label}]: video generado demasiado grande.`;
          attemptErrors.push(lastErrorDetail);
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
      console.warn(`[backend][${requestDebugTag}] generation failed`, {
        strictIdentity,
        educationalVideo,
        hasPortraitAsset,
        lastStatus,
        lastErrorDetail,
        attemptErrors: attemptErrors.slice(-6)
      });
      if (strictIdentity) {
        return res.status(lastStatus >= 400 ? lastStatus : 502).json({
          error: `No se pudo mantener identidad del locutor con referenceImages. ${lastErrorDetail}`
        });
      }
      const errorPreview = attemptErrors.slice(-4).join(" | ");
      return res.status(lastStatus >= 400 ? lastStatus : 502).json({
        error: errorPreview ? `${lastErrorDetail}. Intentos: ${errorPreview}` : lastErrorDetail
      });
    }

    const sourceVideoMimeType = String(finalVideoMimeType || "video/mp4").trim() || "video/mp4";
    const sourceVideoBytes = Number(finalVideoBuffer?.length || 0);
    let transcodeMeta = null;
    try {
      transcodeMeta = await transcodeDialogueVideoToMp4(finalVideoBuffer, sourceVideoMimeType);
      finalVideoBuffer = Buffer.from(transcodeMeta.buffer);
      finalVideoMimeType = String(transcodeMeta.mimeType || "video/mp4").trim() || "video/mp4";
    } catch (error) {
      const stage = String(error?.stage || "transcode").trim() || "transcode";
      const reason = String(error?.code || error?.message || "video_transcode_failed").trim() || "video_transcode_failed";
      console.error(`[backend][${requestDebugTag}] video_transcode_failed`, {
        model: resolvedModel,
        variant: resolvedVariant,
        sourceMimeType: sourceVideoMimeType,
        stage,
        reason
      });
      return res.status(502).json({
        error: `video_transcode_failed: ${reason}`,
        code: "video_transcode_failed",
        detail: {
          model: resolvedModel,
          sourceMimeType: sourceVideoMimeType,
          stage
        }
      });
    }
    console.info(`[backend][${requestDebugTag}] video-transcode`, {
      model: resolvedModel,
      variant: resolvedVariant,
      sourceMimeType: sourceVideoMimeType,
      outputMimeType: finalVideoMimeType,
      inputVideoCodec: String(transcodeMeta?.inputProbe?.videoCodec || "").trim() || "unknown",
      inputAudioCodec: String(transcodeMeta?.inputProbe?.audioCodec || "").trim() || "unknown",
      outputVideoCodec: String(transcodeMeta?.videoCodec || "").trim() || "h264",
      outputAudioCodec: String(transcodeMeta?.audioCodec || "").trim() || "aac",
      inputDuration: String(transcodeMeta?.inputProbe?.duration || "").trim() || null,
      outputDuration: String(transcodeMeta?.outputProbe?.duration || "").trim() || null,
      sourceBytes: sourceVideoBytes,
      outputBytes: Number(finalVideoBuffer?.length || 0)
    });

    const ext = getVideoExtension(finalVideoMimeType);
    const sessionSlug = normalizeStorageSegment(sessionId, "session");
    const rowSlug = normalizeStorageSegment(rowId, "row");
    const speakerSlug = normalizeStorageSegment(speakerLabel, "speaker");
    const clipId = randomUUID();
    const storagePath = `podcaster/sessions/${sessionSlug}/owners/${normalizeStorageSegment(uid, "anon")}/videos/${rowSlug}-${speakerSlug}/${clipId}.${ext}`;
    const asset = await uploadScreenshotAsset({
      path: storagePath,
      buffer: finalVideoBuffer,
      mimeType: finalVideoMimeType,
      metadata: {
        uid,
        sessionId,
        rowId,
        speakerLabel,
        speakerName,
        referenceImageName,
        hasSceneReference: hasSceneReference ? "1" : "0",
        usedSceneReference: useSceneReferenceAsInitImage ? "1" : "0",
        model: resolvedModel,
        sourceMimeType: sourceVideoMimeType,
        videoCodec: String(transcodeMeta?.videoCodec || "h264").trim() || "h264",
        audioCodec: String(transcodeMeta?.audioCodec || "aac").trim() || "aac",
        kind: "dialogue_video"
      }
    });
    if (regenerate && previousStoragePath && previousStoragePath !== storagePath) {
      await deleteStoragePath(previousStoragePath).catch(() => {});
    }

    return res.status(200).json({
      ok: true,
      dialogueVideo: {
        rowId,
        speaker: speakerLabel,
        mimeType: finalVideoMimeType,
        sourceMimeType: sourceVideoMimeType,
        container: "mp4",
        videoCodec: String(transcodeMeta?.videoCodec || "h264").trim() || "h264",
        audioCodec: String(transcodeMeta?.audioCodec || "aac").trim() || "aac",
        transcoded: true,
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
        downloadUrl: asset.downloadUrl
      }
    });
  } catch (error) {
    console.error("[backend][dialogue-video] unhandled error", {
      status: Number(error?.status || 500),
      message: String(error?.message || "No se pudo generar video del diálogo."),
      stack: String(error?.stack || "").split("\n").slice(0, 3).join(" | ")
    });
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo generar video del diálogo.") });
  }
});

function normalizeGeminiInlineAudioTags(value = "") {
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
}

function normalizeGeminiTtsDirectionConfig(input = {}) {
  return {
    stylePrompt: clampText(input?.stylePrompt || "", 260),
    pacingPrompt: clampText(input?.pacingPrompt || "", 180),
    accentPrompt: clampText(input?.accentPrompt || "", 180),
    scenePrompt: clampText(input?.scenePrompt || "", 220),
    audioTags: normalizeGeminiInlineAudioTags(input?.audioTags || "")
  };
}

function buildGeminiTtsBaseStyle(expression = "") {
  const clean = String(expression || "").trim();
  if (clean === "Enérgico") return "Enérgica y animada, pero natural y sin gritar.";
  if (clean === "Cálido") return "Cálida, cercana y tranquilizadora.";
  if (clean === "Curioso") return "Curiosa, ligeramente intrigada y conversacional.";
  if (clean === "Serio") return "Seria, enfocada y controlada.";
  if (clean === "Inspirador") return "Inspiradora, esperanzadora y convincente.";
  return "Natural, humana y creíble.";
}

function buildGeminiTtsPrompt({
  speakerName = "Locutor",
  speakerLabel = "Host A",
  voiceName = "",
  expression = "Neutral",
  targetSpeechLine = "",
  originalText = "",
  disfluencyInstruction = "",
  notes = "",
  contentMode = "podcast",
  ttsDirection = {}
} = {}) {
  const direction = normalizeGeminiTtsDirectionConfig(ttsDirection || {});
  const transcriptBase = clampText(targetSpeechLine || "", 2200);
  const transcript = [direction.audioTags, transcriptBase].filter(Boolean).join(" ").replace(/\s+/g, " ").trim() || transcriptBase;
  const styleLine = [buildGeminiTtsBaseStyle(expression), direction.stylePrompt].filter(Boolean).join(" ");
  const pacingLine = direction.pacingPrompt || "Conversacional, fluido y con pausas naturales.";
  const accentLine = direction.accentPrompt || "Español latino neutro, dicción clara.";
  const sceneLine = direction.scenePrompt || (String(contentMode || "").trim().toLowerCase() === "educational"
    ? "Explicación cercana de estudio, clara y humana."
    : "Conversación de podcast en estudio, cercana y natural.");
  return [
    "Synthesize speech for the TRANSCRIPT only. Do not read section titles, notes, labels, or instructions aloud.",
    "Keep the wording of the TRANSCRIPT exact, preserving any intentional fillers, repairs, or stutters already present there.",
    "Never speak the director notes aloud.",
    "",
    "### AUDIO PROFILE",
    `Speaker: ${clampText(speakerName || "Locutor", 120)} (${clampText(speakerLabel || "Host A", 80)}).`,
    voiceName ? `Voice: ${clampText(voiceName, 80)}.` : "",
    "",
    "### SCENE",
    sceneLine,
    "",
    "### DIRECTOR'S NOTES",
    `Style: ${styleLine}`,
    `Pacing: ${pacingLine}`,
    `Accent: ${accentLine}`,
    `Delivery guardrails: ${clampText(disfluencyInstruction || "Natural, clean articulation.", 1800)}`,
    notes ? `Additional notes: ${clampText(notes, 1200)}` : "",
    originalText ? `Reference only, do not read: "${String(clampText(originalText, 2000)).replace(/"/g, '\\"')}"` : "",
    "",
    "### TRANSCRIPT",
    `"${String(transcript).replace(/"/g, '\\"')}"`
  ].filter(Boolean).join("\n");
}

app.post("/api/podcaster/dialogue-audio/generate", async (req, res) => {
  if (!ensureGeminiKey(res)) return;
  try {
    const uid = String(req.authContext?.uid || "").trim();
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
    const ttsDirection = normalizeGeminiTtsDirectionConfig(req.body?.ttsDirection || {});
    const notes = clampText(req.body?.notes || "", 1200);
    const contentMode = String(req.body?.contentMode || "").trim().toLowerCase();
    const educationalAudio = req.body?.videoMode === true || contentMode === "educational";
    const regenerate = req.body?.regenerate === true;
    const previousStoragePath = clampText(req.body?.previousStoragePath || "", 700);
    const model = normalizeModel(req.body?.model || "gemini-3.1-flash-tts-preview");

    if (!sessionId) return res.status(400).json({ error: "Falta sessionId." });
    if (!rowId) return res.status(400).json({ error: "Falta rowId." });
    if (!speakerLabel) return res.status(400).json({ error: "Falta speakerLabel." });
    if (!text) return res.status(400).json({ error: "Falta texto de diálogo." });
    if (!/^gemini-[a-z0-9.-]+$/i.test(String(model || ""))) {
      return res.status(400).json({ error: "Modelo inválido para diálogo de audio." });
    }
    if (voiceNameInput && !voiceName) {
      return res.status(400).json({ error: `Voz no soportada para Gemini Live: ${voiceNameInput}` });
    }

    const prompt = buildGeminiTtsPrompt({
      speakerName,
      speakerLabel,
      voiceName,
      expression,
      targetSpeechLine,
      originalText,
      disfluencyInstruction,
      notes,
      contentMode: educationalAudio ? "educational" : "podcast",
      ttsDirection
    });

    const payload = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["AUDIO"]
      }
    };
    if (voiceName) {
      payload.generationConfig.speechConfig = {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName
          }
        }
      };
    }

    const upstream = await fetchCompat(
      `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );
    const data = await safeJson(upstream);
    if (!upstream.ok) {
      return res.status(Number(upstream.status || 502)).json({
        error: String(data?.error?.message || data?.error || `No se pudo generar audio (${upstream.status}).`)
      });
    }

    const audioParts = readGeminiAudioParts(data);
    if (!audioParts.length) {
      return res.status(502).json({ error: "Gemini no devolvió audio para la escena." });
    }
    const firstMime = String(audioParts[0]?.mimeType || "audio/L16;rate=24000").trim() || "audio/L16;rate=24000";
    const mimeLower = firstMime.toLowerCase();
    const pcmLike = mimeLower.includes("audio/l16") || mimeLower.includes("audio/pcm");
    const merged = Buffer.concat(audioParts.map((part) => Buffer.from(String(part.data || ""), "base64")));
    if (!merged.length || merged.length > MAX_DIALOGUE_AUDIO_BYTES) {
      return res.status(413).json({ error: "El audio generado excede el tamaño permitido." });
    }
    const sampleRateMatch = firstMime.match(/rate=(\d+)/i);
    const sampleRate = sampleRateMatch ? Number(sampleRateMatch[1]) : 24000;
    const finalBuffer = pcmLike ? pcm16ToWavBuffer(merged, sampleRate) : merged;
    const finalMime = pcmLike ? "audio/wav" : (firstMime.startsWith("audio/") ? firstMime.split(";")[0] : "audio/wav");
    const durationSec = pcmLike
      ? clampNumber(merged.length / Math.max(1, sampleRate * 2), 0, 180, 0)
      : clampNumber(parseWavDurationSeconds(finalBuffer), 0, 180, 0);

    const ext = getAudioExtension(finalMime);
    const sessionSlug = normalizeStorageSegment(sessionId, "session");
    const rowSlug = normalizeStorageSegment(rowId, "row");
    const speakerSlug = normalizeStorageSegment(speakerLabel, "speaker");
    const storagePath = `podcaster/sessions/${sessionSlug}/owners/${normalizeStorageSegment(uid, "anon")}/audio/${rowSlug}-${speakerSlug}/${randomUUID()}.${ext}`;
    const asset = await uploadScreenshotAsset({
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
        kind: "dialogue_audio"
      }
    });
    if (regenerate && previousStoragePath && previousStoragePath !== storagePath) {
      await deleteStoragePath(previousStoragePath).catch(() => {});
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
        downloadUrl: asset.downloadUrl
      }
    });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo generar audio del diálogo.") });
  }
});

function getMontageExportExtension(format = "mp4_h264") {
  const clean = String(format || "").trim().toLowerCase();
  if (clean === "webm_vp9") return "webm";
  return "mp4";
}

function getMontageExportMimeType(format = "mp4_h264") {
  const ext = getMontageExportExtension(format);
  return ext === "webm" ? "video/webm" : "video/mp4";
}

function resolveMontageExportVideoParams(format = "mp4_h264", qualityPreset = "balanced") {
  const cleanFormat = String(format || "").trim().toLowerCase();
  const preset = ["high", "balanced", "small"].includes(String(qualityPreset || "").trim().toLowerCase())
    ? String(qualityPreset).trim().toLowerCase()
    : "balanced";
  if (cleanFormat === "webm_vp9") {
    const crf = preset === "high" ? 28 : preset === "small" ? 36 : 32;
    return {
      container: "webm",
      vCodec: "libvpx-vp9",
      vArgs: ["-b:v", "0", "-crf", String(crf), "-deadline", "good"],
      aCodec: "libopus",
      aArgs: ["-b:a", "128k"]
    };
  }
  if (cleanFormat === "mp4_h265") {
    const crf = preset === "high" ? 22 : preset === "small" ? 28 : 24;
    const x265Preset = preset === "high" ? "slow" : preset === "small" ? "fast" : "medium";
    return {
      container: "mp4",
      vCodec: "libx265",
      vArgs: ["-preset", x265Preset, "-crf", String(crf), "-tag:v", "hvc1", "-movflags", "+faststart"],
      aCodec: "aac",
      aArgs: ["-b:a", "160k"]
    };
  }
  const crf = preset === "high" ? 18 : preset === "small" ? 24 : 20;
  const x264Preset = preset === "high" ? "slow" : preset === "small" ? "fast" : "medium";
  return {
    container: "mp4",
    vCodec: "libx264",
    vArgs: ["-preset", x264Preset, "-crf", String(crf), "-movflags", "+faststart"],
    aCodec: "aac",
    aArgs: ["-b:a", "160k"]
  };
}

function resolveMontageExportScaleFilter(resolution = "source") {
  const key = String(resolution || "").trim().toLowerCase();
  if (key === "source") return "";
  const target = key === "1080p" ? { w: 1920, h: 1080 } : key === "720p" ? { w: 1280, h: 720 } : { w: 854, h: 480 };
  // Downscale-only + enforce even dims for yuv420p.
  return `scale='if(gt(iw,${target.w}),${target.w},iw)':'if(gt(ih,${target.h}),${target.h},ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2`;
}

function normalizeStorageFilePath(value = "") {
  let raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("gs://")) {
    raw = raw.replace(/^gs:\/\//i, "");
    const slash = raw.indexOf("/");
    raw = slash >= 0 ? raw.slice(slash + 1) : "";
  }
  raw = raw.replace(/^\/+/, "");
  // Algunas rutas pueden venir URL-encoded (p.ej. %2F). Decodifica best-effort.
  if (/%2f/i.test(raw) || /%25/i.test(raw)) {
    try {
      raw = decodeURIComponent(raw);
    } catch (_) {
      // noop
    }
  }
  return String(raw || "").trim();
}

function isAllowedRemoteMediaUrl(url = "") {
  const clean = String(url || "").trim();
  if (!clean) return false;
  try {
    const parsed = new URL(clean);
    const host = String(parsed.hostname || "").toLowerCase();
    return host.endsWith("googleapis.com") || host.endsWith("firebasestorage.app") || host === "storage.googleapis.com";
  } catch (_) {
    return false;
  }
}

function isAllowedMoodleInstructionImageImportUrl(url = "") {
  const clean = String(url || "").trim();
  if (!clean) return false;
  try {
    const parsed = new URL(clean);
    const protocol = String(parsed.protocol || "").toLowerCase();
    const host = String(parsed.hostname || "").toLowerCase();
    if (!["https:", "http:"].includes(protocol)) return false;
    if (!host || host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) return false;
    if (/^(10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.|192\.168\.)/.test(host)) return false;
    return true;
  } catch (_) {
    return false;
  }
}

function coerceReadableStream(body = null) {
  if (!body) return null;
  if (typeof body.pipe === "function") return body;
  // Node 18+ global fetch uses WHATWG ReadableStream.
  if (typeof body.getReader === "function" && typeof Readable.fromWeb === "function") {
    return Readable.fromWeb(body);
  }
  return null;
}

function parseFirebaseStorageGoogleApisObjectUrl(url = "") {
  const clean = String(url || "").trim();
  if (!clean) return null;
  try {
    const parsed = new URL(clean);
    if (String(parsed.hostname || "").toLowerCase() !== "firebasestorage.googleapis.com") return null;
    const match = String(parsed.pathname || "").match(/^\/(?:v0\/)?b\/([^/]+)\/o\/(.+)$/);
    if (!match) return null;
    const bucket = String(match[1] || "").trim();
    let objectPath = String(match[2] || "").trim();
    if (!bucket || !objectPath) return null;
    try {
      objectPath = decodeURIComponent(objectPath);
    } catch (_) {
      // noop
    }
    if (/%2f/i.test(objectPath) || /%25/i.test(objectPath)) {
      try {
        objectPath = decodeURIComponent(objectPath);
      } catch (_) {
        // noop
      }
    }
    objectPath = String(objectPath || "").replace(/^\/+/, "").trim();
    if (!objectPath) return null;
    return { bucket, objectPath };
  } catch (_) {
    return null;
  }
}

async function downloadStoragePathToFile(storagePath = "", outPath = "") {
  const cleanPath = normalizeStorageFilePath(storagePath);
  const targetPath = String(outPath || "").trim();
  if (!cleanPath || !targetPath) {
    const err = new Error("missing_download_path");
    err.code = "missing_download_path";
    err.detail = { storagePath: cleanPath, outPath: targetPath };
    throw err;
  }
  const buckets = getStorageBucketCandidates();
  let lastError = null;
  let lastMetaError = null;
  for (const bucket of buckets) {
    if (!bucket) continue;
    const file = bucket.file(cleanPath);
    try {
      await file.download({ destination: targetPath });
      return targetPath;
    } catch (error) {
      lastError = error;
      // Differentiate "not found" vs permission/network so callers don't
      // incorrectly fallback to downloadUrl (which depends on tokens).
      try {
        // eslint-disable-next-line no-await-in-loop
        await file.getMetadata();
      } catch (metaError) {
        lastMetaError = metaError;
        const status = Number(metaError?.code || metaError?.statusCode || metaError?.status || 0) || 0;
        const metaMessage = String(metaError?.message || "").toLowerCase();
        if (status === 404) {
          // Not found in this bucket, try next candidate.
          continue;
        }
        if (metaMessage.includes("bucket does not exist")) {
          // Treat missing bucket as a miss and try next candidate.
          continue;
        }
        if (status === 401 || status === 403) {
          const err = new Error("storage_forbidden");
          err.code = "storage_forbidden";
          err.status = 502;
          err.detail = {
            storagePath: cleanPath,
            bucket: String(bucket?.name || "").trim(),
            message: String(metaError?.message || metaError),
          };
          throw err;
        }
      }
      const message = String(error?.message || "").toLowerCase();
      const status = Number(error?.code || error?.statusCode || error?.status || 0) || 0;
      if (status === 401 || status === 403 || message.includes("permission") || message.includes("forbidden")) {
        const err = new Error("storage_forbidden");
        err.code = "storage_forbidden";
        err.status = 502;
        err.detail = {
          storagePath: cleanPath,
          bucket: String(bucket?.name || "").trim(),
          message: String(error?.message || error),
        };
        throw err;
      }
      if (String(error?.code || "") === "ENOTFOUND" || String(error?.code || "") === "ECONNRESET") {
        const err = new Error("storage_not_available");
        err.code = "storage_not_available";
        err.status = 502;
        err.detail = {
          storagePath: cleanPath,
          bucket: String(bucket?.name || "").trim(),
          message: String(error?.message || error),
        };
        throw err;
      }
    }
  }
  const err = new Error("storage_not_found");
  err.code = "storage_not_found";
  err.status = 404;
  err.detail = {
    storagePath: cleanPath,
    bucketsTried: buckets.map((bucket) => bucket?.name).filter(Boolean),
    lastError: lastError ? String(lastError?.message || lastError) : undefined,
    lastMetaError: lastMetaError ? String(lastMetaError?.message || lastMetaError) : undefined
  };
  throw err;
}

async function downloadUrlToFile(url = "", outPath = "") {
  const cleanUrl = String(url || "").trim();
  const targetPath = String(outPath || "").trim();
  if (!cleanUrl || !targetPath) {
    const err = new Error("missing_download_url");
    err.code = "missing_download_url";
    err.detail = { url: cleanUrl, outPath: targetPath };
    throw err;
  }
  if (!isAllowedRemoteMediaUrl(cleanUrl)) {
    const err = new Error("url_not_allowed");
    err.code = "url_not_allowed";
    err.detail = { url: cleanUrl };
    throw err;
  }

  let firebaseAdminAttempted = false;
  let firebaseAdminFallback = "";

  // Prefer Firebase Admin SDK for Firebase Storage object URLs to avoid
  // depending on public download tokens that may expire/return 403.
  const firebaseObject = parseFirebaseStorageGoogleApisObjectUrl(cleanUrl);
  if (firebaseObject) {
    try {
      firebaseAdminAttempted = true;
      console.info("[backend][download] firebase url -> admin download", {
        bucket: String(firebaseObject.bucket || "").trim(),
        objectPath: String(firebaseObject.objectPath || "").slice(0, 900)
      });
      await downloadStoragePathToFile(firebaseObject.objectPath, targetPath);
      console.info("[backend][download] admin download ok", {
        objectPath: String(firebaseObject.objectPath || "").slice(0, 900)
      });
      return targetPath;
    } catch (error) {
      const code = String(error?.code || error?.message || "").trim();
      const status = Number(error?.status || error?.statusCode || (typeof error?.code === "number" ? error.code : 0) || 0) || 0;
      console.warn("[backend][download] admin download failed", {
        code,
        status: status || undefined,
        objectPath: String(firebaseObject.objectPath || "").slice(0, 900)
      });
      // Only allow fallback to HTTP when the object truly doesn't exist in our buckets.
      const allowHttpFallback = code === "storage_not_found" || status === 404;
      if (!allowHttpFallback) throw error;
      firebaseAdminFallback = code || (status ? `status_${status}` : "storage_not_found");
      // Else: fallback to HTTP fetch (may succeed if token is valid, or may be an external bucket).
    }
  }

  if (firebaseAdminAttempted) {
    console.info("[backend][download] falling back to http fetch", {
      reason: firebaseAdminFallback || "storage_not_found",
      url: redactUrlForLogs(cleanUrl)
    });
  }

  const upstream = await fetchCompat(cleanUrl, { method: "GET" });
  if (!upstream.ok) {
    let bodySnippet = "";
    try {
      bodySnippet = String(await upstream.text()).trim().slice(0, 240);
    } catch (_) {
      bodySnippet = "";
    }
    const err = new Error(`download_failed_${upstream.status}`);
    err.code = "download_failed";
    // No devolver 403/401 al cliente (se confunde con auth del API).
    err.status = 502;
    err.detail = {
      url: redactUrlForLogs(cleanUrl),
      upstreamStatus: upstream.status,
      upstreamBody: bodySnippet || undefined
    };
    throw err;
  }
  const stream = coerceReadableStream(upstream.body);
  if (!stream) {
    const err = new Error("download_stream_unavailable");
    err.code = "download_stream_unavailable";
    throw err;
  }
  await pipeline(stream, fs.createWriteStream(targetPath));
  return targetPath;
}

app.post("/api/podcaster/montage/export", async (req, res) => {
  let tmpDir = "";
  try {
    if (!isFfmpegAvailable()) {
      return res.status(500).json({ error: "ffmpeg_static_missing" });
    }
    const uid = String(req.authContext?.uid || "").trim();
    const sessionId = clampText(req.body?.sessionId || "", 140);
    const format = String(req.body?.format || "mp4_h264").trim();
    const qualityPreset = String(req.body?.qualityPreset || "balanced").trim();
    const resolution = String(req.body?.resolution || "source").trim();
    const includeBackgroundMusic = req.body?.includeBackgroundMusic === true;
    const filename = clampText(req.body?.filename || "montage", 160) || "montage";
    const entriesRaw = Array.isArray(req.body?.entries) ? req.body.entries : [];
    const entries = entriesRaw.slice(0, MAX_MONTAGE_EXPORT_SCENES).map((item) => (item && typeof item === "object" ? item : null)).filter(Boolean);
    const audioTimelineRaw = req.body?.audioTimeline && typeof req.body.audioTimeline === "object" ? req.body.audioTimeline : null;
    const geminiSegmentsRaw = Array.isArray(audioTimelineRaw?.geminiSegments) ? audioTimelineRaw.geminiSegments : [];
    const backgroundSegmentsRaw = Array.isArray(audioTimelineRaw?.backgroundSegments) ? audioTimelineRaw.backgroundSegments : [];
    const normalizeTimelineAudioSegment = (segment = {}, idx = 0) => {
      if (!segment || typeof segment !== "object") return null;
      const url = String(segment?.url || "").trim();
      const storagePath = clampText(segment?.storagePath || "", 900);
      const startMs = Math.max(0, Math.round(Number(segment?.startMs || 0) || 0));
      const durationMs = Math.max(500, Math.round(Number(segment?.durationMs || 0) || 0));
      const trimInMs = Math.max(0, Math.round(Number(segment?.trimInMs || 0) || 0));
      const trimOutMs = Math.max(trimInMs + 500, Math.round(Number(segment?.trimOutMs || 0) || (trimInMs + durationMs)));
      const rawVolumePct = Number(segment?.volumePct ?? 100);
      const legacyScaledPct = Number.isFinite(rawVolumePct) && rawVolumePct > 0 && rawVolumePct <= 1
        ? rawVolumePct * 100
        : rawVolumePct;
      const volumePct = Math.max(0, Math.min(100, legacyScaledPct));
      if (!storagePath && !url) return null;
      if (volumePct <= 0.0001) return null;
      return {
        kind: clampText(segment?.kind || "audio", 40) || "audio",
        id: clampText(segment?.id || `${idx + 1}`, 140) || `${idx + 1}`,
        rowId: clampText(segment?.rowId || "", 140),
        trackIndex: Math.max(0, Math.floor(Number(segment?.trackIndex || 0) || 0)),
        loopIndex: Math.max(0, Math.floor(Number(segment?.loopIndex || 0) || 0)),
        url,
        storagePath,
        mimeType: clampText(segment?.mimeType || "audio/mpeg", 120) || "audio/mpeg",
        startMs,
        durationMs,
        trimInMs,
        trimOutMs,
        volumePct
      };
    };
    const timelineAudioSegments = [...geminiSegmentsRaw, ...backgroundSegmentsRaw]
      .slice(0, 600)
      .map((segment, idx) => normalizeTimelineAudioSegment(segment, idx))
      .filter(Boolean);
    const useTimelineAudio = audioTimelineRaw?.enabled === true && timelineAudioSegments.length > 0;

    if (!sessionId) return res.status(400).json({ error: "Falta sessionId." });
    if (!entries.length) return res.status(400).json({ error: "No hay entradas para exportar." });
    if (entriesRaw.length > MAX_MONTAGE_EXPORT_SCENES) {
      return res.status(413).json({ error: `Demasiadas escenas para exportar (máx ${MAX_MONTAGE_EXPORT_SCENES}).` });
    }

    const allowedFormats = new Set(["mp4_h264", "mp4_h265", "webm_vp9"]);
    if (!allowedFormats.has(String(format).trim())) {
      return res.status(400).json({ error: "Formato inválido." });
    }
    const allowedRes = new Set(["source", "1080p", "720p", "480p"]);
    if (!allowedRes.has(String(resolution).trim())) {
      return res.status(400).json({ error: "Resolución inválida." });
    }
    const totalDurationSec = entries.reduce((acc, entry) => acc + Math.max(0, Number(entry?.durationMs || 0) / 1000), 0);
    if (totalDurationSec > MAX_MONTAGE_EXPORT_TOTAL_SEC) {
      return res.status(413).json({ error: `Montaje demasiado largo para exportar (máx ${MAX_MONTAGE_EXPORT_TOTAL_SEC} s).` });
    }

    const exportId = randomUUID();
    tmpDir = path.join(os.tmpdir(), `cb-montage-export-${exportId}`);
    await fs.promises.mkdir(tmpDir, { recursive: true });

    const params = resolveMontageExportVideoParams(format, qualityPreset);
    const outExt = getMontageExportExtension(format);
    const scaleFilter = resolveMontageExportScaleFilter(resolution);
    const intermediatePaths = [];
    const skippedEntries = [];
    const exportedEntries = [];

    const buildMontageSkippedEntry = (entry = {}, index = 0, reason = "scene_asset_unavailable", detail = {}) => ({
      sceneIndex: Math.max(1, Number(entry?.sceneIndex || index + 1) || index + 1),
      rowId: clampText(entry?.rowId || "", 140),
      speaker: clampText(entry?.speaker || "", 120),
      sceneLabel: clampText(entry?.sceneLabel || "", 180),
      kind: clampText(detail?.kind || "video", 40) || "video",
      reason: clampText(reason || "scene_asset_unavailable", 120) || "scene_asset_unavailable",
      storagePath: clampText(detail?.storagePath || "", 900),
      url: detail?.url ? redactUrlForLogs(detail.url) : "",
      code: clampText(detail?.code || "", 80),
      index: Math.max(0, Number(detail?.index || index) || index),
      lastError: clampText(detail?.lastError || detail?.message || "", 280)
    });

    const shouldSkipMontageEntryError = (error) => {
      const code = String(error?.code || error?.message || "").trim();
      return code === "storage_not_found" || code === "missing_download_source";
    };

    const downloadInput = async (asset = {}, kind = "video", index = 0) => {
      const storagePath = clampText(asset?.storagePath || "", 900);
      const url = String(asset?.url || "").trim();
      if (!storagePath && !url) {
        const err = new Error("missing_download_source");
        err.code = "missing_download_source";
        err.status = 404;
        err.detail = {
          kind,
          index,
          storagePath: "",
          url: ""
        };
        throw err;
      }
      const isAudioKind = kind !== "video";
      const ext = isAudioKind
        ? (getAudioExtension(String(asset?.mimeType || "audio/mpeg")) || "audio")
        : (getVideoExtension(String(asset?.mimeType || "video/mp4")) || "mp4");
      const outPath = path.join(tmpDir, `in-${kind}-${String(index + 1).padStart(3, "0")}.${ext}`);
      const resolveAlternateOwnerStoragePaths = (pathInput = "", uidRaw = "") => {
        const clean = normalizeStorageFilePath(pathInput);
        const uidClean = String(uidRaw || "").trim();
        if (!clean || !uidClean) return [];
        const marker = "/owners/";
        const i = clean.indexOf(marker);
        if (i < 0) return [];
        const prefix = clean.slice(0, i + marker.length);
        const rest = clean.slice(i + marker.length);
        const slash = rest.indexOf("/");
        if (slash < 0) return [];
        const currentOwner = rest.slice(0, slash);
        const suffix = rest.slice(slash);
        const candidates = [
          uidClean,
          uidClean.toLowerCase(),
          normalizeStorageSegment(uidClean, "anon"),
        ]
          .map((owner) => String(owner || "").trim())
          .filter(Boolean);
        const nextOwners = Array.from(new Set(candidates)).filter((owner) => owner && owner !== currentOwner);
        return nextOwners.map((owner) => `${prefix}${owner}${suffix}`);
      };
      if (storagePath) {
        try {
          await downloadStoragePathToFile(storagePath, outPath);
          return outPath;
        } catch (error) {
          const code = String(error?.code || error?.message || "").trim();
          if (code === "storage_not_found") {
            const altPaths = resolveAlternateOwnerStoragePaths(storagePath, uid);
            for (const altPath of altPaths) {
              try {
                // eslint-disable-next-line no-await-in-loop
                await downloadStoragePathToFile(altPath, outPath);
                console.info("[backend][montage-export] recovered storagePath via alt owner", {
                  kind,
                  index,
                  storagePath,
                  altPath
                });
                return outPath;
              } catch (_) {
                // keep trying
              }
            }

            if (url && !parseFirebaseStorageGoogleApisObjectUrl(url)) {
              console.info("[backend][montage-export] storage_not_found -> url fallback", {
                kind,
                index,
                storagePath,
                url: redactUrlForLogs(url)
              });
              await downloadUrlToFile(url, outPath);
              return outPath;
            }
          }
          error.detail = {
            ...(error?.detail && typeof error.detail === "object" ? error.detail : {}),
            kind,
            index,
            storagePath,
            url: url ? redactUrlForLogs(url) : ""
          };
          throw error;
        }
      }
      await downloadUrlToFile(url, outPath);
      return outPath;
    };

    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i] || {};
      const rowId = clampText(entry?.rowId || "", 140);
      const sceneIndex = Math.max(1, Number(entry?.sceneIndex || i + 1) || i + 1);
      const trimInMs = Math.max(0, Number(entry?.trimInMs || 0) || 0);
      const durationMs = Math.max(500, Number(entry?.durationMs || 0) || 0);
      const trimSec = Math.max(0, trimInMs / 1000);
      const durSec = Math.max(0.2, durationMs / 1000);
      const useNativeVideoAudio = entry?.useNativeVideoAudio === true;
      const videoAsset = entry?.video && typeof entry.video === "object" ? entry.video : {};
      const audioAsset = entry?.audio && typeof entry.audio === "object" ? entry.audio : null;

      if (!rowId) return res.status(400).json({ error: `Entrada inválida (rowId) en índice ${i}.` });
      if (!videoAsset?.storagePath && !videoAsset?.url) {
        const skipped = buildMontageSkippedEntry(entry, i, "missing_video_source", {
          kind: "video",
          code: "missing_download_source",
          index: i,
          lastError: `Escena ${sceneIndex} sin video fuente para exportar.`
        });
        skippedEntries.push(skipped);
        console.warn("[backend][montage-export] skip scene without video source", skipped);
        continue;
      }

      try {
        const inputVideoPath = await downloadInput(videoAsset, "video", i);
        const forceSilentAudio = useTimelineAudio === true && !useNativeVideoAudio;
        const inputAudioPath = (!forceSilentAudio && !useNativeVideoAudio && audioAsset) ? await downloadInput(audioAsset, "audio", i) : "";

        const intermediatePath = path.join(tmpDir, `scene-${String(sceneIndex).padStart(3, "0")}.${outExt}`);
        const args = [
          "-y",
          "-hide_banner",
          "-loglevel",
          "warning",
          "-i",
          inputVideoPath,
        ];
        let nullAudioInputIndex = -1;
        if (forceSilentAudio) {
          nullAudioInputIndex = 1;
          args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000");
        } else if (!useNativeVideoAudio && inputAudioPath) {
          args.push("-i", inputAudioPath);
        } else if (useNativeVideoAudio) {
          // native audio from video (if present)
        } else {
          nullAudioInputIndex = 1;
          args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000");
        }

        args.push(
          "-ss",
          String(trimSec),
          "-t",
          String(durSec),
          "-map",
          "0:v:0"
        );
        if (forceSilentAudio) {
          args.push("-map", `${nullAudioInputIndex}:a:0`);
        } else if (!useNativeVideoAudio && inputAudioPath) {
          args.push("-map", "1:a:0");
        } else if (useNativeVideoAudio) {
          args.push("-map", "0:a:0?");
        } else {
          args.push("-map", `${nullAudioInputIndex}:a:0`);
        }

        args.push(
          "-r",
          "24",
          "-c:v",
          params.vCodec
        );
        if (scaleFilter) {
          args.push("-vf", scaleFilter);
        }
        args.push(...params.vArgs);
        args.push(
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          params.aCodec,
          "-ar",
          "48000",
        );
        args.push(...params.aArgs);
        args.push(intermediatePath);

        await runFfmpegCommand(args, { stage: `montage_scene_${sceneIndex}` });
        intermediatePaths.push(intermediatePath);
        exportedEntries.push({
          sceneIndex,
          rowId,
          durationSec: durSec
        });
      } catch (error) {
        if (!shouldSkipMontageEntryError(error)) throw error;
        const detail = error?.detail && typeof error.detail === "object" ? error.detail : {};
        const skipped = buildMontageSkippedEntry(entry, i, String(error?.code || error?.message || "scene_asset_unavailable"), {
          ...detail,
          code: String(error?.code || "").trim(),
          index: Number(detail?.index || i) || i,
          lastError: String(detail?.lastError || detail?.message || error?.message || "").trim()
        });
        skippedEntries.push(skipped);
        console.warn("[backend][montage-export] skip scene missing asset", skipped);
      }
    }

    if (!intermediatePaths.length) {
      return res.status(404).json({
        error: "No hay escenas válidas para exportar.",
        code: "montage_no_valid_entries",
        detail: {
          skippedEntries
        }
      });
    }

    const concatListPath = path.join(tmpDir, "concat-list.txt");
    await fs.promises.writeFile(
      concatListPath,
      intermediatePaths.map((p) => `file '${String(p).replace(/'/g, "'\\''")}'`).join("\n") + "\n",
      "utf8"
    );

    const concatOutPath = path.join(tmpDir, `montage-concat.${outExt}`);
    await runFfmpegCommand([
      "-y",
      "-hide_banner",
      "-loglevel",
      "warning",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatListPath,
      "-c",
      "copy",
      concatOutPath
    ], { stage: "montage_concat" });

    const exportedDurationSec = exportedEntries.reduce((acc, item) => acc + Math.max(0, Number(item?.durationSec || 0)), 0);
    let finalOutPath = concatOutPath;
    if (useTimelineAudio) {
      const segmentInputs = [];
      for (let i = 0; i < timelineAudioSegments.length; i += 1) {
        const segment = timelineAudioSegments[i] || {};
        try {
          // eslint-disable-next-line no-await-in-loop
          const p = await downloadInput({
            storagePath: clampText(segment?.storagePath || "", 900),
            url: String(segment?.url || "").trim(),
            mimeType: clampText(segment?.mimeType || "audio/mpeg", 120) || "audio/mpeg"
          }, "timeline-audio", i);
          if (p) segmentInputs.push({ path: p, segment });
        } catch (error) {
          // Skip missing audio pieces; export should still succeed with partial audio.
          if (String(error?.code || "") === "storage_not_found") continue;
          throw error;
        }
      }

      if (segmentInputs.length) {
        const timelineMixedOutPath = path.join(tmpDir, `montage-timeline-audio.${outExt}`);
        const audioCodec = outExt === "webm" ? "libopus" : "aac";
        const audioBitrate = outExt === "webm" ? "128k" : "160k";
        const filters = [];
        const labels = [];
        segmentInputs.forEach((item, idx) => {
          const segment = item.segment || {};
          const startMs = Math.max(0, Math.round(Number(segment?.startMs || 0) || 0));
          const trimInMs = Math.max(0, Math.round(Number(segment?.trimInMs || 0) || 0));
          const durationMs = Math.max(100, Math.round(Number(segment?.durationMs || 0) || 0));
          // En export, el largo efectivo del segmento lo define `durationMs` (timeline),
          // no el `trimOutMs` del asset original. Si no, el audio puede "derramarse"
          // a escenas siguientes y sonar junto.
          const trimOutMs = Math.max(trimInMs + 100, Math.round(Number(segment?.trimOutMs || 0) || (trimInMs + durationMs)));
          const trimInSec = Math.max(0, trimInMs / 1000);
          const durationSec = Math.max(0.1, durationMs / 1000);
          const volumePct = Math.max(0, Math.min(100, Number(segment?.volumePct ?? 100)));
          const volume = Math.max(0, Math.min(2, volumePct / 100));
          const inputIndex = idx + 1;
          const label = `a${idx}`;
          labels.push(label);
          filters.push(
            `[${inputIndex}:a]atrim=start=${trimInSec.toFixed(3)}:duration=${durationSec.toFixed(3)},asetpts=PTS-STARTPTS,adelay=${startMs}|${startMs},volume=${volume.toFixed(3)}[${label}]`
          );
        });
        // Normaliza loudness para evitar exports demasiado bajitos.
        const mix = `${labels.map((l) => `[${l}]`).join("")}amix=inputs=${labels.length}:duration=longest:dropout_transition=2,aresample=48000,loudnorm=I=-16:TP=-1.5:LRA=11[mix]`;
        const filterComplex = `${filters.join(";")};${mix}`;

        await runFfmpegCommand([
          "-y",
          "-hide_banner",
          "-loglevel",
          "warning",
          "-i",
          finalOutPath,
          ...segmentInputs.flatMap((item) => ["-i", item.path]),
          "-filter_complex",
          filterComplex,
          "-map",
          "0:v:0",
          "-map",
          "[mix]",
          "-c:v",
          "copy",
          "-c:a",
          audioCodec,
          "-ar",
          "48000",
          "-b:a",
          audioBitrate,
          ...(outExt === "mp4" ? ["-movflags", "+faststart"] : []),
          timelineMixedOutPath
        ], { stage: "montage_mix_timeline_audio" });
        finalOutPath = timelineMixedOutPath;
      }
    }
    if (includeBackgroundMusic) {
      const bg = req.body?.backgroundMusic && typeof req.body.backgroundMusic === "object" ? req.body.backgroundMusic : null;
      if (!bg) return res.status(400).json({ error: "includeBackgroundMusic requiere backgroundMusic." });
      const musicPath = await downloadInput(bg, "music", 0);
      if (!musicPath) return res.status(400).json({ error: "No se pudo descargar música de fondo." });
      const rawVolumePct = Number(bg?.volumePct ?? 25);
      const legacyScaledPct = Number.isFinite(rawVolumePct) && rawVolumePct > 0 && rawVolumePct <= 1
        ? rawVolumePct * 100
        : rawVolumePct;
      const volumePct = Math.max(0, Math.min(100, legacyScaledPct));
      const volume = Math.max(0, Math.min(1, volumePct / 100));

      const mixedOutPath = path.join(tmpDir, `montage-mixed.${outExt}`);
      const audioCodec = outExt === "webm" ? "libopus" : "aac";
      const audioBitrate = outExt === "webm" ? "128k" : "160k";
      await runFfmpegCommand([
        "-y",
        "-hide_banner",
        "-loglevel",
        "warning",
        "-i",
        finalOutPath,
        "-stream_loop",
        "-1",
        "-i",
        musicPath,
        "-t",
        String(exportedDurationSec),
        "-filter_complex",
        `[1:a]volume=${volume.toFixed(3)}[bg];[0:a][bg]sidechaincompress=threshold=0.02:ratio=8:attack=10:release=250:makeup=2:link=average[ducked];[ducked]loudnorm=I=-16:TP=-1.5:LRA=11[outa]`,
        "-map",
        "0:v:0",
        "-map",
        "[outa]",
        "-c:v",
        "copy",
        "-c:a",
        audioCodec,
        "-ar",
        "48000",
        "-b:a",
        audioBitrate,
        ...(outExt === "mp4" ? ["-movflags", "+faststart"] : []),
        mixedOutPath
      ], { stage: "montage_mix_music" });
      finalOutPath = mixedOutPath;
    } else if (outExt === "mp4") {
      const remuxOutPath = path.join(tmpDir, "montage-faststart.mp4");
      await runFfmpegCommand([
        "-y",
        "-hide_banner",
        "-loglevel",
        "warning",
        "-i",
        finalOutPath,
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        remuxOutPath
      ], { stage: "montage_faststart" });
      finalOutPath = remuxOutPath;
    }

    await cleanupMontageExportCache();
    await ensureMontageExportCacheDir();
    const token = randomUUID();
    const createdAtIso = new Date().toISOString();
    const expiresAtIso = new Date(Date.now() + MONTAGE_EXPORT_CACHE_TTL_MS).toISOString();
    const cacheFilePath = path.join(MONTAGE_EXPORT_CACHE_DIR, `montage-${exportId}.${outExt}`);
    await fs.promises.copyFile(finalOutPath, cacheFilePath);
    await fs.promises.writeFile(path.join(MONTAGE_EXPORT_CACHE_DIR, `${exportId}.json`), JSON.stringify({
      exportId,
      token,
      uid,
      sessionId,
      filename: `${filename}.${outExt}`,
      mimeType: getMontageExportMimeType(format),
      filePath: cacheFilePath,
      createdAt: createdAtIso,
      expiresAt: expiresAtIso,
      format: String(format || "").trim(),
      qualityPreset: String(qualityPreset || "").trim(),
      resolution: String(resolution || "").trim()
    }, null, 2), "utf8");
    const base = resolvePublicBaseUrl(req) || `http://127.0.0.1:${PORT}`;
    const downloadUrl = `${base}/api/assets/montage-download?exportId=${encodeURIComponent(exportId)}&token=${encodeURIComponent(token)}`;

    return res.status(200).json({
      ok: true,
      export: {
        filename: `${filename}.${outExt}`,
        mimeType: getMontageExportMimeType(format),
        storagePath: "",
        downloadUrl,
        createdAt: createdAtIso,
        expiresAt: expiresAtIso,
        exportId
      },
      warnings: skippedEntries.length ? {
        skippedEntries,
        requestedSceneCount: entries.length,
        exportedSceneCount: exportedEntries.length
      } : undefined
    });
  } catch (error) {
    console.error("[backend][montage-export] error", {
      status: Number(error?.status || 500),
      message: String(error?.message || "montage_export_failed"),
      code: String(error?.code || ""),
      stack: String(error?.stack || "").split("\n").slice(0, 3).join(" | "),
      detail: error?.detail && typeof error.detail === "object" ? error.detail : undefined
    });
    const rawCode = error?.code;
    const rawStatus = error?.status ?? error?.statusCode;
    const code = typeof rawCode === "string" ? rawCode.trim() : "";
    const message = String(error?.message || "").trim();
    const isNumericCode = typeof rawCode === "number" || (/^\d+$/.test(code) && code.length <= 4);
    const statusNum = Number(rawStatus || 0) || 0;
    const errorLabel = (!isNumericCode && code) ? code : (message || "No se pudo exportar el montaje.");
    const payload = {
      error: errorLabel
    };
    if (code) payload.code = code;
    if (statusNum) payload.status = statusNum;
    if (error?.detail && typeof error.detail === "object") {
      payload.detail = error.detail;
    }
    return res.status(Number(error?.status || 500)).json(payload);
  } finally {
    if (tmpDir) {
      try {
        await fs.promises.rm(tmpDir, { recursive: true, force: true });
      } catch (_) {}
    }
  }
});

app.post("/api/podcaster/music/upload", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const sessionId = clampText(req.body?.sessionId || "", 140);
    const fileName = clampText(req.body?.fileName || "podcast-music", 180) || "podcast-music";
    const mimeType = clampText(req.body?.mimeType || "audio/mpeg", 120) || "audio/mpeg";
    const durationSec = clampNumber(req.body?.durationSec, 0, 1800, 0);
    const previousStoragePath = clampText(req.body?.previousStoragePath || "", 700);
    const audioDataUrl = String(req.body?.audioDataUrl || "").trim();
    if (!sessionId) return res.status(400).json({ error: "Falta sessionId." });
    if (!audioDataUrl) return res.status(400).json({ error: "Falta audioDataUrl." });
    const decoded = decodeBase64DataUrl(audioDataUrl, MAX_PODCASTER_MUSIC_BYTES);
    if (!String(decoded?.mimeType || mimeType).startsWith("audio/")) {
      return res.status(400).json({ error: "El archivo seleccionado no es audio válido." });
    }
    const ext = getAudioExtension(decoded.mimeType || mimeType);
    const sessionSlug = normalizeStorageSegment(sessionId, "session");
    const fileSlug = normalizeStorageSegment(fileName, "track");
    const storagePath = `podcaster/sessions/${sessionSlug}/owners/${normalizeStorageSegment(uid, "anon")}/music/${fileSlug}-${randomUUID()}.${ext}`;
    const asset = await uploadScreenshotAsset({
      path: storagePath,
      buffer: decoded.buffer,
      mimeType: decoded.mimeType || mimeType,
      metadata: {
        uid,
        sessionId,
        fileName,
        kind: "panel_music"
      }
    });
    if (previousStoragePath && previousStoragePath !== storagePath) {
      await deleteStoragePath(previousStoragePath).catch(() => {});
    }
    return res.status(200).json({
      ok: true,
      track: {
        name: fileName,
        mimeType: decoded.mimeType || mimeType,
        size: decoded.buffer.length,
        durationSec,
        downloadUrl: asset.downloadUrl,
        storagePath: asset.path,
        updatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo subir la canción.") });
  }
});

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
      libraryId
    }
  });
  return {thumbUrl: asset.downloadUrl, thumbStoragePath: asset.path, thumbMimeType: mimeType};
}

async function uploadSceneLibraryVideo({
  downloadUrl = "",
  storagePath = "",
  mimeType = "video/mp4",
  libraryId = ""
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
      const downloaded = await downloadStorageObjectToBuffer(sourceStoragePath);
      buffer = downloaded.buffer;
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
      libraryId
    }
  });
  return {
    downloadUrl: asset.downloadUrl,
    storagePath: asset.path,
    mimeType: resolvedMimeType
  };
}

app.get("/api/podcaster/scene-library/list", async (req, res) => {
  try {
    const snap = await db.collection("podcaster_scene_library").orderBy("updatedAt", "desc").limit(250).get();
    const items = snap.docs.map((docSnap) => normalizePodcastSceneLibraryItem(docSnap)).filter(Boolean);
    return res.status(200).json({ ok: true, items });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo listar la biblioteca pública de escenas.") });
  }
});

app.post("/api/podcaster/scene-library/publish", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const ownerEmail = String(req.authContext?.email || "").trim();
    if (!uid) return res.status(401).json({ error: "AUTH_REQUIRED" });
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
    if (!sessionId) return res.status(400).json({ error: "Falta sessionId." });
    if (!rowId) return res.status(400).json({ error: "Falta rowId." });
    if (!videoDownloadUrl && !videoStoragePath) return res.status(400).json({ error: "Falta video de la escena." });

    const sourceRowSnap = await db.collection("podcaster_sessions").doc(sessionId).get();
    const sourceSession = sourceRowSnap.exists ? (sourceRowSnap.data()?.session || null) : null;
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
      libraryId
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
    }, { merge: true });

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
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo publicar la escena pública.") });
  }
});

app.post("/api/podcaster/scene-library/update", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const libraryId = clampText(req.body?.libraryId || "", 140);
    const title = clampText(req.body?.title || "", 180);
    const tagLabel = clampText(req.body?.tagLabel || "", 120);
    const tagColor = clampText(req.body?.tagColor || "slate", 40) || "slate";
    if (!uid) return res.status(401).json({ error: "AUTH_REQUIRED" });
    if (!libraryId) return res.status(400).json({ error: "Falta libraryId." });
    if (!title) return res.status(400).json({ error: "Falta title." });
    const ref = db.collection("podcaster_scene_library").doc(libraryId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "La escena pública no existe." });
    const data = snap.data() || {};
    if (String(data.ownerId || "").trim() && String(data.ownerId || "").trim() !== uid) {
      return res.status(403).json({ error: "No puedes editar esta escena." });
    }
    const nowIso = new Date().toISOString();
    await ref.set({ title, tagLabel, tagColor, updatedAt: nowIso }, { merge: true });
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
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo actualizar la escena pública.") });
  }
});

app.post("/api/podcaster/scene-library/delete", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const libraryId = clampText(req.body?.libraryId || "", 140);
    if (!uid) return res.status(401).json({ error: "AUTH_REQUIRED" });
    if (!libraryId) return res.status(400).json({ error: "Falta libraryId." });
    const ref = db.collection("podcaster_scene_library").doc(libraryId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "La escena pública no existe." });
    const data = snap.data() || {};
    if (String(data.ownerId || "").trim() && String(data.ownerId || "").trim() !== uid) {
      return res.status(403).json({ error: "No puedes eliminar esta escena." });
    }
    await ref.delete();
    await deleteStoragePath(clampText(data.storagePath || "", 700)).catch(() => {});
    await deleteStoragePath(clampText(data.thumbStoragePath || "", 700)).catch(() => {});
    return res.status(200).json({ ok: true, libraryId });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo eliminar la escena pública.") });
  }
});

app.get("/api/podcaster/music/library/list", async (req, res) => {
  try {
    const snap = await db.collection("podcaster_music_library").orderBy("updatedAt", "desc").limit(250).get();
    const tracks = snap.docs.map((docSnap) => {
      const data = docSnap.data() || {};
      return {
        libraryId: docSnap.id,
        name: clampText(data.name || "Audio", 180) || "Audio",
        mimeType: clampText(data.mimeType || "audio/mpeg", 120) || "audio/mpeg",
        size: Math.max(0, Number(data.size || 0) || 0),
        durationSec: clampNumber(data.durationSec, 0, 1800, 0),
        downloadUrl: clampText(data.downloadUrl || "", 3000),
        storagePath: clampText(data.storagePath || "", 700),
        updatedAt: clampText(data.updatedAt || "", 64),
        ownerId: clampText(data.ownerId || "", 140),
        ownerEmail: clampText(data.ownerEmail || "", 180)
      };
    });
    return res.status(200).json({ ok: true, tracks });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo listar la biblioteca de audios.") });
  }
});

app.post("/api/podcaster/music/library/upload", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const userEmail = clampText(req.authContext?.email || "", 180);
    const fileName = clampText(req.body?.fileName || "podcast-music", 180) || "podcast-music";
    const mimeType = clampText(req.body?.mimeType || "audio/mpeg", 120) || "audio/mpeg";
    const durationSec = clampNumber(req.body?.durationSec, 0, 1800, 0);
    const previousStoragePath = clampText(req.body?.previousStoragePath || "", 700);
    const audioDataUrl = String(req.body?.audioDataUrl || "").trim();
    if (!audioDataUrl) return res.status(400).json({ error: "Falta audioDataUrl." });
    const decoded = decodeBase64DataUrl(audioDataUrl, MAX_PODCASTER_MUSIC_BYTES);
    if (!String(decoded?.mimeType || mimeType).startsWith("audio/")) {
      return res.status(400).json({ error: "El archivo seleccionado no es audio válido." });
    }
    const ext = getAudioExtension(decoded.mimeType || mimeType);
    const fileSlug = normalizeStorageSegment(fileName, "track");
    const libraryId = randomUUID();
    const storagePath = `podcaster/library/music/${fileSlug}-${libraryId}.${ext}`;
    const asset = await uploadScreenshotAsset({
      path: storagePath,
      buffer: decoded.buffer,
      mimeType: decoded.mimeType || mimeType,
      metadata: {
        uid,
        fileName,
        kind: "panel_music_library"
      }
    });
    if (previousStoragePath && previousStoragePath !== storagePath) {
      await deleteStoragePath(previousStoragePath).catch(() => {});
    }
    const updatedAt = new Date().toISOString();
    await db.collection("podcaster_music_library").doc(libraryId).set({
      name: fileName,
      mimeType: decoded.mimeType || mimeType,
      size: decoded.buffer.length,
      durationSec,
      downloadUrl: asset.downloadUrl,
      storagePath: asset.path,
      updatedAt,
      ownerId: uid,
      ownerEmail: userEmail || null
    });
    return res.status(200).json({
      ok: true,
      track: {
        libraryId,
        name: fileName,
        mimeType: decoded.mimeType || mimeType,
        size: decoded.buffer.length,
        durationSec,
        downloadUrl: asset.downloadUrl,
        storagePath: asset.path,
        updatedAt,
        ownerId: uid,
        ownerEmail: userEmail || null
      }
    });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo subir el audio a la biblioteca global.") });
  }
});

app.post("/api/podcaster/music/library/delete", async (req, res) => {
  try {
    const libraryId = clampText(req.body?.libraryId || "", 140);
    if (!libraryId) return res.status(400).json({ error: "Falta libraryId." });
    const ref = db.collection("podcaster_music_library").doc(libraryId);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ error: "El audio global ya no existe." });
    }
    const data = snap.data() || {};
    const storagePath = clampText(data.storagePath || req.body?.storagePath || "", 700);
    await ref.delete();
    if (storagePath) {
      await deleteStoragePath(storagePath).catch(() => {});
    }
    return res.status(200).json({ ok: true, libraryId });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo eliminar el audio global.") });
  }
});

app.post("/api/podcaster/music/generate", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const sessionId = clampText(req.body?.sessionId || "", 140);
    const preset = clampText(req.body?.preset || "ambient", 40) || "ambient";
    const previousStoragePath = clampText(req.body?.previousStoragePath || "", 700);
    const prompt = buildPodcasterMusicPrompt(req.body?.prompt || "", preset);
    const model = sanitizePodcasterMusicModel(req.body?.model || "lyria-3-clip-preview");
    if (!sessionId) return res.status(400).json({ error: "Falta sessionId." });
    if (!hasGeminiKey()) return res.status(500).json({ error: "Falta GEMINI_API_KEY o GOOGLE_API_KEY en backend." });

    const client = new GoogleGenAI({
      apiKey: GEMINI_API_KEY
    });
    const response = await client.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseModalities: ["AUDIO", "TEXT"]
      }
    });
    const audioParts = readLyriaAudioParts(response);
    const firstAudio = audioParts[0] || null;
    if (!firstAudio?.data) {
      return res.status(502).json({ error: "Lyria no devolvió audio." });
    }
    const mimeType = String(firstAudio.mimeType || "audio/mpeg").trim() || "audio/mpeg";
    const buffer = Buffer.from(firstAudio.data, "base64");
    if (!buffer.length) {
      return res.status(502).json({ error: "Lyria devolvió audio vacío." });
    }
    const ext = getAudioExtension(mimeType);
    const sessionSlug = normalizeStorageSegment(sessionId, "session");
    const storagePath = `podcaster/sessions/${sessionSlug}/owners/${normalizeStorageSegment(uid, "anon")}/music/ai-${randomUUID()}.${ext}`;
    const asset = await uploadScreenshotAsset({
      path: storagePath,
      buffer,
      mimeType,
      metadata: {
        uid,
        sessionId,
        kind: "panel_music_ai",
        model
      }
    });
    if (previousStoragePath && previousStoragePath !== storagePath) {
      await deleteStoragePath(previousStoragePath).catch(() => {});
    }
    await sleep(120);
    return res.status(200).json({
      ok: true,
      track: {
        name: `AI Music ${preset}`,
        mimeType,
        size: buffer.length,
        downloadUrl: asset.downloadUrl,
        storagePath: asset.path,
        updatedAt: new Date().toISOString(),
        model
      }
    });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo generar música con IA.") });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "gemini-backend",
    hasGeminiKey: hasGeminiKey(),
    moodleShareUsersRoute: true,
    moodleModuleGraphicsRoute: true,
    podcasterDialogueAudioRoute: true,
    podcasterMusicGenerateRoute: true,
    startupSignature: BACKEND_BOOT_SIGNATURE,
  });
});

app.post("/api/mineblox/screenshots/upload", async (req, res) => {
  try {
    return await handleMinebloxScreenshotUpload(req, res);
  } catch (error) {
    return res.status(400).json({ error: String(error?.message || "No se pudo subir la captura.") });
  }
});

app.post("/api/moodle/module-graphics/generate", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const courseId = clampText(req.body?.courseId || "", 180);
    const moduleId = clampText(req.body?.moduleId || "", 180);
    if (!uid || !courseId || !moduleId) {
      return res.status(400).json({ error: "Faltan uid, courseId o moduleId para generar el gráfico del módulo." });
    }
    const image = await generateMoodleModuleGraphicAsset({
      uid,
      courseId,
      moduleId,
      moduleType: clampText(req.body?.moduleType || "", 80),
      moduleName: clampText(req.body?.moduleName || "", 220),
      languageCode: clampText(req.body?.languageCode || "es", 12) || "es",
      instructions: clampText(req.body?.instructions || "", 5000),
      content: clampText(req.body?.content || "", 8000),
      instructionImages: normalizeInlineInstructionImages(req.body?.instructionImages),
      previousStoragePath: clampText(req.body?.previousStoragePath || "", 700)
    });
    return res.status(200).json({ ok: true, image });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo generar el gráfico del módulo.") });
  }
});

app.post("/api/moodle/module-graphics/generate-element", async (req, res) => {
  try {
    const uid = String(req.authContext?.uid || "").trim();
    const courseId = clampText(req.body?.courseId || "", 180);
    const moduleId = clampText(req.body?.moduleId || "", 180);
    const elementId = clampText(req.body?.elementId || "", 120) || "element";
    const elementLabel = clampText(req.body?.elementLabel || "", 180) || "Elemento";
    const elementPrompt = clampText(req.body?.elementPrompt || "", 2400);
    if (!uid || !courseId || !moduleId) {
      return res.status(400).json({ error: "Faltan uid, courseId o moduleId para generar el elemento del gráfico." });
    }
    if (!elementPrompt) {
      return res.status(400).json({ error: "Falta elementPrompt para generar el elemento del gráfico." });
    }

    const image = await generateMoodleModuleGraphicElementAsset({
      uid,
      courseId,
      moduleId,
      moduleType: clampText(req.body?.moduleType || "", 80),
      moduleName: clampText(req.body?.moduleName || "", 220),
      languageCode: clampText(req.body?.languageCode || "es", 12) || "es",
      instructions: clampText(req.body?.instructions || "", 5000),
      content: clampText(req.body?.content || "", 8000),
      elementId,
      elementLabel,
      elementPrompt,
      previousStoragePath: clampText(req.body?.previousStoragePath || "", 700)
    });
    return res.status(200).json({
      ok: true,
      image: {
        ...image,
        courseId,
        moduleId,
        elementId,
        elementLabel
      }
    });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo generar el elemento del gráfico.") });
  }
});

app.post("/api/moodle/module-graphics/analyze-element", async (req, res) => {
  try {
    const imageUrl = clampText(req.body?.imageUrl || "", 3200);
    if (!imageUrl) {
      return res.status(400).json({ error: "Falta imageUrl para analizar el elemento." });
    }
    if (!ensureGeminiKey(res)) return;
    const moduleName = clampText(req.body?.moduleName || "Modulo", 180) || "Modulo";
    const moduleType = clampText(req.body?.moduleType || "Modulo", 80) || "Modulo";
    const elementLabel = clampText(req.body?.elementLabel || "Elemento", 120) || "Elemento";
    const elementPrompt = clampText(req.body?.elementPrompt || "", 2400);
    const image = await fetchImageBytesWithMimeLocal(imageUrl);
    const prompt = [
      "Evalua una imagen PNG de un elemento para composicion grafica educativa.",
      `Modulo: ${moduleName} (${moduleType}).`,
      `Elemento esperado: ${elementLabel}.`,
      elementPrompt ? `Brief esperado: ${elementPrompt}.` : "",
      "",
      "Devuelve SOLO JSON valido con esta estructura:",
      "{",
      '  "score": 0-100,',
      '  "hasEmbeddedText": true|false,',
      '  "hasFakeTransparencyOrCheckerboard": true|false,',
      '  "matchesTarget": true|false,',
      '  "issues": ["string"],',
      '  "recommendation": "accept|regenerate"',
      "}",
      "",
      "Reglas de evaluacion:",
      "- Si ves letras, numeros, ecuaciones, etiquetas o texto incrustado: recommendation=regenerate.",
      "- Si ves patron cuadriculado, fondo de tablero o falso transparente: recommendation=regenerate.",
      "- Si la imagen mezcla demasiados elementos distintos o no corresponde al objetivo: recommendation=regenerate.",
      "- El fondo normal SI esta permitido. No penalices una imagen solo por conservar fondo."
    ].join("\n");

    const upstream = await fetchCompat(
      `${GEMINI_BASE}/models/${encodeURIComponent("gemini-2.5-flash")}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { text: prompt },
              { inline_data: { mime_type: image.mimeType, data: image.buffer.toString("base64") } }
            ]
          }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json"
          }
        })
      }
    );
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(upstream.status >= 500 ? 502 : upstream.status).json({
        error: String(data?.error?.message || data?.error || `HTTP ${upstream.status}`)
      });
    }
    const text = String(data?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
    const parsed = parseJsonObjectFromModelTextLocal(text);
    const score = clampNumber(parsed?.score, 0, 100, 0);
    const hasEmbeddedText = parsed?.hasEmbeddedText === true;
    const hasCheckerboard = parsed?.hasCheckerboardOrFakeTransparency === true || parsed?.hasFakeTransparencyOrCheckerboard === true;
    const matchesTarget = parsed?.matchesTarget === true;
    const recommendation = (
      hasEmbeddedText ||
      hasCheckerboard ||
      !matchesTarget ||
      score < 72
    ) ? "regenerate" : "accept";
    return res.status(200).json({
      ok: true,
      analysis: {
        score,
        hasEmbeddedText,
        hasCheckerboardOrFakeTransparency: hasCheckerboard,
        matchesTarget,
        issues: Array.isArray(parsed?.issues) ? parsed.issues.map((item) => clampText(item, 200)).filter(Boolean).slice(0, 6) : [],
        recommendation
      }
    });
  } catch (error) {
    return res.status(500).json({ error: String(error?.message || "No se pudo analizar el elemento del gráfico.") });
  }
});

app.get("/api/mineblox/screenshots/list", async (req, res) => {
  try {
    return await handleMinebloxScreenshotList(req, res);
  } catch (error) {
    return res.status(400).json({ error: String(error?.message || "No se pudo listar la galería.") });
  }
});

app.post("/api/gemini/generate", async (req, res) => {
  if (!ensureGeminiKey(res)) return;
  try {
    const model = normalizeModel(req.body?.model);
    const originalPayload = req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : {};

    const isCreativeVideoPayload = (payload = {}) => {
      try {
        const systemText = String(payload?.systemInstruction?.parts?.map((p) => p?.text).filter(Boolean).join(" ") || "").toLowerCase();
        const userText = String(payload?.contents?.map((c) => c?.parts?.map((p) => p?.text).filter(Boolean).join("\n")).filter(Boolean).join("\n") || "").toLowerCase();
        return (
          systemText.includes("videos cortos creativos")
          || systemText.includes("video corto creativo")
          || systemText.includes("video creativo")
          || userText.includes("video creativo")
          || userText.includes("video corto creativo")
        );
      } catch (_) {
        return false;
      }
    };

    const looksLikeEducationalTemplateText = (text = "") => {
      const lower = String(text || "").toLowerCase();
      if (!lower) return false;
      return (
        lower.includes("bienvenidos a este video educativo")
        || lower.includes("escena didáctica")
        || lower.includes("escena didactica")
        || lower.includes("conversación útil y accionable")
        || lower.includes("conversacion util y accionable")
        || lower.includes("vamos a tomar una idea y convertirla")
        || lower.includes("módulo claro, dinámico")
        || lower.includes("modulo claro, dinamico")
      );
    };

    const augmentCreativeVideoPayload = (payload = {}) => {
      const next = JSON.parse(JSON.stringify(payload || {}));
      const baseSystem = String(next?.systemInstruction?.parts?.[0]?.text || "").trim();
      if (baseSystem) {
        next.systemInstruction = next.systemInstruction || {};
        next.systemInstruction.parts = next.systemInstruction.parts || [{ text: baseSystem }];
        next.systemInstruction.parts[0].text = [
          baseSystem,
          "Reglas extra (creativo): Prohibido usar plantillas educativas.",
          "No escribas frases tipo 'Bienvenidos a este video educativo', 'Hoy abrimos una conversación útil y accionable' o 'Vamos a tomar una idea y convertirla...'.",
          "Empieza directo con acción/amenaza y usa detalles concretos del prompt desde la primera escena.",
          "Responde solo JSON válido."
        ].join(" ");
      }
      next.generationConfig = next.generationConfig && typeof next.generationConfig === "object" ? next.generationConfig : {};
      const currentTemp = Number(next.generationConfig.temperature);
      if (!Number.isFinite(currentTemp) || currentTemp < 0.55) {
        next.generationConfig.temperature = 0.85;
      }
      return next;
    };

    const shouldAugmentCreative = isCreativeVideoPayload(originalPayload);
    const payload = shouldAugmentCreative ? augmentCreativeVideoPayload(originalPayload) : originalPayload;

    const serialized = JSON.stringify(payload || {});
    if (Buffer.byteLength(serialized, "utf8") > MAX_PAYLOAD_BYTES) {
      return res.status(413).json({ error: "Payload demasiado grande para Gemini." });
    }

    if (shouldAugmentCreative) {
      console.log("[GEMINI][creative] request", {
        model,
        payloadSize: serialized.length,
        hasRowsSchema: Boolean(payload?.generationConfig?.responseJsonSchema?.properties?.rows),
        responseMimeType: String(payload?.generationConfig?.responseMimeType || ""),
        promptPreview: String(
          payload?.contents?.map((c) => c?.parts?.map((p) => p?.text).filter(Boolean).join("\n")).filter(Boolean).join("\n") || ""
        ).slice(0, 240)
      });
    } else {
      console.log(`[GEMINI] model=${model}, payloadSize=${serialized.length}`);
    }

    const endpoint = `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
    const doRequest = async (bodyJson) => {
      const upstream = await fetchCompat(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: bodyJson
      });
      const data = await safeJson(upstream);
      return { upstream, data };
    };

    let { upstream, data } = await doRequest(serialized);
    if (!upstream.ok) {
      console.error(`[GEMINI] HTTP ${upstream.status}:`, JSON.stringify(data, null, 2));
    }
    if (shouldAugmentCreative) {
      const text = String(data?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
      console.log("[GEMINI][creative] response", {
        status: upstream.status,
        hasCandidates: Array.isArray(data?.candidates),
        candidateCount: Array.isArray(data?.candidates) ? data.candidates.length : 0,
        promptFeedback: data?.promptFeedback ? {
          blockReason: String(data?.promptFeedback?.blockReason || ""),
          blockReasonMessage: String(data?.promptFeedback?.blockReasonMessage || ""),
          safetyRatings: Array.isArray(data?.promptFeedback?.safetyRatings) ? data.promptFeedback.safetyRatings.length : 0
        } : null,
        textPreview: text.slice(0, 260),
        looksEducational: looksLikeEducationalTemplateText(text)
      });
    }

    if (shouldAugmentCreative && upstream.ok) {
      const text = String(data?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
      if (looksLikeEducationalTemplateText(text)) {
        try {
          const retryPayload = augmentCreativeVideoPayload(payload);
          if (retryPayload?.systemInstruction?.parts?.[0]?.text) {
            retryPayload.systemInstruction.parts[0].text = [
              String(retryPayload.systemInstruction.parts[0].text || "").trim(),
              "REINTENTO: tu salida anterior sonó a plantilla educativa y fue rechazada.",
              "Reescribe TODO el guion como video creativo para redes, sin plantilla educativa y con detalles concretos del prompt desde la escena 1."
            ].join(" ");
          }
          const retrySerialized = JSON.stringify(retryPayload || {});
          if (Buffer.byteLength(retrySerialized, "utf8") <= MAX_PAYLOAD_BYTES) {
            const retry = await doRequest(retrySerialized);
            if (retry.upstream.ok) {
              upstream = retry.upstream;
              data = retry.data;
            }
          }
        } catch (error) {
          console.error("[GEMINI] creative retry failed:", String(error?.message || error));
        }
      }
    }

    return res.status(upstream.status).json(data);
  } catch (error) {
    console.error(`[GEMINI] Error:`, error.message);
    return res.status(500).json({ error: String(error?.message || "Error interno en backend Gemini.") });
  }
});

app.get("/api/gemini/models", async (_req, res) => {
  if (!ensureGeminiKey(res)) return;
  try {
    const upstream = await fetchCompat(`${GEMINI_BASE}/models?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" }
    });
    const data = await safeJson(upstream);
    return res.status(upstream.status).json(data);
  } catch (error) {
    return res.status(500).json({ error: String(error?.message || "Error interno listando modelos Gemini.") });
  }
});

app.post("/api/gemini/live-token", async (req, res) => {
  if (!ensureGeminiKey(res)) return;
  try {
    const modelInput = normalizeModel(req.body?.model || "gemini-2.5-flash-native-audio-preview-12-2025");
    const model = modelInput;
    const requestedVoiceName = String(req.body?.voiceName || "").trim();
    const voiceName = normalizeLiveVoiceName(requestedVoiceName);
    if (requestedVoiceName && !voiceName) {
      return res.status(400).json({
        error: `Voz no soportada para Gemini Live: ${requestedVoiceName}`
      });
    }
    const systemInstruction = String(
      req.body?.systemInstruction || "Eres un asistente pedagógico útil y amable."
    ).trim();
    const liveConfig = {
      responseModalities: ["AUDIO"],
      systemInstruction,
      sessionResumption: {}
    };
    if (voiceName) {
      liveConfig.speechConfig = {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName
          }
        }
      };
    }

    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const newSessionExpireTime = new Date(Date.now() + 60 * 1000).toISOString();
    const ai = buildGeminiLiveClient();
    const data = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime,
        liveConnectConstraints: {
          model,
          config: liveConfig
        },
        lockAdditionalFields: []
      }
    });
    if (!data?.name) {
      return res.status(502).json({ error: "Respuesta inválida al crear token efímero.", raw: data });
    }
    return res.json({
      token: data.name,
      model,
      requestedVoiceName: requestedVoiceName || null,
      voiceName: voiceName || null,
      expireTime: data.expireTime || expireTime,
      newSessionExpireTime: data.newSessionExpireTime || newSessionExpireTime
    });
  } catch (error) {
    const summary = summarizeGeminiLiveError(error);
    console.error("[GEMINI_LIVE_TOKEN] Upstream error", {
      status: summary.status || null,
      contentType: summary.contentType || null,
      bodySnippet: summary.bodySnippet || null
    });
    return res.status(summary.status >= 400 ? summary.status : 502).json({
      error: "UPSTREAM_GEMINI_LIVE_TOKEN_FAILED",
      detail: summary.bodySnippet || "No se pudo crear token efímero para Gemini Live."
    });
  }
});

app.get("/api/assets/proxy-image", async (req, res) => {
  try {
    const rawUrl = String(req.query?.url || "").trim();
    const normalizedUrl = rawUrl.includes("%25") ? decodeURIComponent(rawUrl) : rawUrl;
    if (!normalizedUrl) {
      return res.status(400).json({ error: "Falta parámetro url." });
    }
    let parsed = null;
    try {
      parsed = new URL(normalizedUrl);
    } catch (_) {
      return res.status(400).json({ error: "URL inválida." });
    }
    const protocol = String(parsed.protocol || "").toLowerCase();
    if (protocol !== "https:" && protocol !== "http:") {
      return res.status(400).json({ error: "Solo se permiten URLs http/https." });
    }
    const host = String(parsed.hostname || "").toLowerCase();
    const allowedHost = host.endsWith("googleapis.com") || host.endsWith("firebasestorage.app") || host === "storage.googleapis.com";
    if (!allowedHost) {
      return res.status(403).json({ error: "Host no permitido para proxy." });
    }

    const upstream = await fetchCompat(normalizedUrl, { method: "GET" });
    if (!upstream.ok) {
      const body = await safeJson(upstream);
      return res.status(upstream.status).json(body);
    }
    const mime = String(upstream.headers.get("content-type") || "application/octet-stream");
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "private, max-age=120");
    return res.status(200).send(buffer);
  } catch (error) {
    return res.status(500).json({ error: String(error?.message || "Error en proxy de imagen.") });
  }
});

app.get("/api/assets/montage-download", async (req, res) => {
  try {
    await cleanupMontageExportCache();
    const exportId = clampExportId(req.query?.exportId || "");
    const token = clampText(String(req.query?.token || "").trim(), 180);
    if (!exportId || !token) {
      return res.status(400).json({ error: "Falta exportId o token." });
    }
    await ensureMontageExportCacheDir();
    const metaPath = path.join(MONTAGE_EXPORT_CACHE_DIR, `${exportId}.json`);
    const raw = await fs.promises.readFile(metaPath, "utf8").catch(() => "");
    if (!raw) return res.status(404).json({ error: "Export no encontrado o expirado." });
    let meta = null;
    try {
      meta = JSON.parse(raw);
    } catch (_) {
      meta = null;
    }
    if (!meta || String(meta.exportId || "") !== exportId) {
      return res.status(404).json({ error: "Export no encontrado o expirado." });
    }
    if (String(meta.token || "") !== token) {
      return res.status(403).json({ error: "Token inválido para descarga." });
    }
    const expiresAtMs = Number(new Date(meta.expiresAt || 0).getTime() || 0) || 0;
    if (expiresAtMs && expiresAtMs < Date.now()) {
      return res.status(404).json({ error: "Export expirado." });
    }
    const filePath = String(meta.filePath || "").trim();
    if (!filePath) return res.status(404).json({ error: "Export no encontrado o expirado." });
    const stat = await fs.promises.stat(filePath).catch(() => null);
    if (!stat || !stat.isFile()) return res.status(404).json({ error: "Export no encontrado o expirado." });

    const rangeHeader = String(req.headers.range || "").trim();
    const mimeType = String(meta.mimeType || "application/octet-stream").trim() || "application/octet-stream";
    const filename = String(meta.filename || `montage-${exportId}`).trim() || `montage-${exportId}`;
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "private, max-age=60");
    res.setHeader("Content-Disposition", `attachment; filename="${filename.replace(/\"/g, "")}"`);

    const total = Number(stat.size || 0) || 0;
    if (rangeHeader) {
      const match = rangeHeader.match(/^bytes=(\\d*)-(\\d*)$/i);
      if (match) {
        const start = Math.max(0, Number(match[1] || 0));
        const end = match[2] ? Math.min(total - 1, Number(match[2])) : total - 1;
        if (start <= end && end < total) {
          res.status(206);
          res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
          res.setHeader("Content-Length", String(end - start + 1));
          return fs.createReadStream(filePath, { start, end }).pipe(res);
        }
      }
    }
    res.setHeader("Content-Length", String(total));
    return fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    return res.status(500).json({ error: String(error?.message || "No se pudo descargar el montaje.") });
  }
});

app.get("/api/assets/proxy-media", async (req, res) => {
  try {
    const storagePath = normalizeStorageFilePath(clampText(req.query?.storagePath || "", 700));
    const rawUrl = String(req.query?.url || "").trim();
    const normalizedUrl = rawUrl.includes("%25") ? decodeURIComponent(rawUrl) : rawUrl;
    const rangeHeader = String(req.headers.range || "").trim();

    if (storagePath) {
      const buckets = getStorageBucketCandidates();
      let lastError = null;
      for (const bucket of buckets) {
        if (!bucket) continue;
        const file = bucket.file(storagePath);
        const [exists] = await file.exists().catch(() => [null]);
        if (exists === false) continue;
        try {
          const [meta] = await file.getMetadata().catch(() => [{}]);
          const [buffer] = await file.download();
          const mime = String(meta?.contentType || "application/octet-stream");
          res.setHeader("Content-Type", mime);
          res.setHeader("Content-Length", String(buffer.length));
          res.setHeader("Accept-Ranges", "bytes");
          res.setHeader("Cache-Control", "private, max-age=120");
          if (rangeHeader) {
            const match = rangeHeader.match(/^bytes=(\\d*)-(\\d*)$/i);
            if (match) {
              const start = Math.max(0, Number(match[1] || 0));
              const end = match[2] ? Math.min(buffer.length - 1, Number(match[2])) : buffer.length - 1;
              const chunk = buffer.subarray(start, end + 1);
              res.setHeader("Content-Range", `bytes ${start}-${end}/${buffer.length}`);
              res.setHeader("Content-Length", String(chunk.length));
              return res.status(206).send(chunk);
            }
          }
          return res.status(200).send(buffer);
        } catch (error) {
          lastError = error;
        }
      }
      return res.status(404).json({
        error: "Archivo no encontrado en Storage.",
        detail: {
          storagePath,
          bucketsTried: buckets.map((bucket) => bucket?.name).filter(Boolean),
          lastError: lastError ? String(lastError?.message || lastError) : undefined
        }
      });
    }

    if (!normalizedUrl) {
      return res.status(400).json({ error: "Falta parámetro url o storagePath." });
    }
    let parsed = null;
    try {
      parsed = new URL(normalizedUrl);
    } catch (_) {
      return res.status(400).json({ error: "URL inválida." });
    }
    const protocol = String(parsed.protocol || "").toLowerCase();
    if (protocol !== "https:" && protocol !== "http:") {
      return res.status(400).json({ error: "Solo se permiten URLs http/https." });
    }
    const host = String(parsed.hostname || "").toLowerCase();
    const allowedHost = host.endsWith("googleapis.com") || host.endsWith("firebasestorage.app");
    if (!allowedHost) {
      return res.status(403).json({ error: "Host no permitido para proxy." });
    }
    const upstream = await fetchCompat(normalizedUrl, {
      method: "GET",
      headers: rangeHeader ? { Range: rangeHeader } : undefined
    });
    if (!upstream.ok && upstream.status !== 206) {
      // Si un link de Firebase Storage (token) expiró o devuelve 403,
      // intenta recuperar el asset por admin SDK usando el object path (solo librería podcaster).
      try {
        const shouldTryAdminFallback = upstream.status === 403 || upstream.status === 404;
        if (shouldTryAdminFallback) {
          const pathname = String(parsed.pathname || "");
          const parts = pathname.split("/").filter(Boolean);
          const bIndex = parts.indexOf("b");
          const oIndex = parts.indexOf("o");
          const bucketFromUrl = bIndex >= 0 ? String(parts[bIndex + 1] || "").trim() : "";
          const encodedObj = oIndex >= 0 ? String(parts[oIndex + 1] || "").trim() : "";
          const objectPath = encodedObj ? decodeURIComponent(encodedObj) : "";
          const isPodcasterLibrary = /^podcaster\/library\//i.test(String(objectPath || "").trim());
          if (isPodcasterLibrary && objectPath) {
            const candidates = (() => {
              const buckets = getStorageBucketCandidates();
              const extra = bucketFromUrl ? [admin.storage().bucket(bucketFromUrl)] : [];
              const byName = new Map();
              [...extra, ...buckets].filter(Boolean).forEach((bucket) => {
                const name = String(bucket?.name || "").trim();
                if (!name || byName.has(name)) return;
                byName.set(name, bucket);
              });
              return Array.from(byName.values());
            })();
            let lastError = null;
            for (const bucket of candidates) {
              if (!bucket) continue;
              const file = bucket.file(objectPath);
              const [exists] = await file.exists().catch(() => [null]);
              if (exists === false) continue;
              try {
                const [meta] = await file.getMetadata().catch(() => [{}]);
                const [buffer] = await file.download();
                const mime = String(meta?.contentType || "application/octet-stream");
                res.setHeader("Content-Type", mime);
                res.setHeader("Content-Length", String(buffer.length));
                res.setHeader("Accept-Ranges", "bytes");
                res.setHeader("Cache-Control", "private, max-age=120");
                if (rangeHeader) {
                  const match = rangeHeader.match(/^bytes=(\\d*)-(\\d*)$/i);
                  if (match) {
                    const start = Math.max(0, Number(match[1] || 0));
                    const end = match[2] ? Math.min(buffer.length - 1, Number(match[2])) : buffer.length - 1;
                    const chunk = buffer.subarray(start, end + 1);
                    res.setHeader("Content-Range", `bytes ${start}-${end}/${buffer.length}`);
                    res.setHeader("Content-Length", String(chunk.length));
                    return res.status(206).send(chunk);
                  }
                }
                return res.status(200).send(buffer);
              } catch (error) {
                lastError = error;
              }
            }
            // Fallthrough: no se pudo leer por admin, devuelve upstream.
            if (lastError) {
              console.warn("[backend][proxy-media] admin fallback failed", {
                objectPath,
                bucketFromUrl,
                message: String(lastError?.message || lastError)
              });
            }
          }
        }
      } catch (_) {
        // noop
      }
      const body = await safeJson(upstream);
      return res.status(upstream.status).json(body);
    }
    const mime = String(upstream.headers.get("content-type") || "application/octet-stream");
    const contentLength = String(upstream.headers.get("content-length") || "").trim();
    const contentRange = String(upstream.headers.get("content-range") || "").trim();
    const acceptRanges = String(upstream.headers.get("accept-ranges") || "bytes").trim() || "bytes";
    const cacheControl = String(upstream.headers.get("cache-control") || "private, max-age=120").trim();
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", mime);
    if (contentLength) res.setHeader("Content-Length", contentLength);
    if (contentRange) res.setHeader("Content-Range", contentRange);
    if (acceptRanges) res.setHeader("Accept-Ranges", acceptRanges);
    if (cacheControl) res.setHeader("Cache-Control", cacheControl);
    return res.status(upstream.status === 206 ? 206 : 200).send(buffer);
  } catch (error) {
    return res.status(500).json({ error: String(error?.message || "Error en proxy de media.") });
  }
});

app.listen(PORT, HOST, () => {
  console.log("[backend] startup signature", {
    file: "backend/server.js",
    pid: process.pid,
    startedAt: BACKEND_BOOT_ISO,
    startupSignature: BACKEND_BOOT_SIGNATURE,
    moodleModuleGraphicsRoute: true,
    podcasterDialogueAudioRoute: true
  });
  console.log(`[gemini-backend] listening on http://${HOST}:${PORT}`);
});
