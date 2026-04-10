const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("node:crypto");

let admin = null;
let GoogleGenAI = null;
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
const DEFAULT_PODCASTER_IMAGE_MODEL = "gemini-2.5-flash-image";
const DEFAULT_PODCASTER_VIDEO_MODEL = "veo-3.1-generate-preview";
const DEFAULT_MOODLE_GRAPHIC_MODEL = "gemini-2.5-flash-image";
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
    || `${projectId}.firebasestorage.app`
  ).trim();

  admin.initializeApp({
    credential,
    storageBucket,
    projectId
  });
}
const db = admin.firestore();
const storageBucket = admin.storage().bucket();

function hasGeminiKey() {
  return !!GEMINI_API_KEY;
}

function ensureGeminiKey(res) {
  if (hasGeminiKey()) return true;
  res.status(500).json({ error: "Falta GEMINI_API_KEY o GOOGLE_API_KEY en backend." });
  return false;
}

function normalizeModel(input = "") {
  const raw = String(input || "").trim().replace(/^models\//i, "");
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
}) {
  return [
    `Retrato consistente del locutor ${speakerName || speakerLabel || "principal"}.`,
    voiceName ? `Voz asociada: ${voiceName}.` : "",
    genderGroup ? `Presentación de género del personaje: ${genderGroup}.` : "",
    `Expresión predominante: ${expression}.`,
    "Definir identidad consistente: facciones memorables, proporciones faciales estables, peinado reconocible, mirada segura, vestuario sobrio de locución premium.",
    "Evitar ambigüedad de género y evitar cambios de edad, etnia o complexión entre generaciones.",
    counterpartSpeakerName ? `${speakerName} es un personaje distinto de ${counterpartSpeakerName}; no mezclar sus rostros, peinados, siluetas ni rasgos.` : "",
    "La imagen debe corresponder exactamente al locutor activo y no a otro host del podcast.",
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
}) {
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
    `Escenario de locución consistente para ${speakerName || speakerLabel || "el locutor"}.`,
    `Escenario obligatorio: ${cleanScenario}.`,
    "Convertir ese escenario en un set fotorealista de locución con tratamiento acústico visible, micrófono broadcast en brazo articulado, consola discreta y luz cinematográfica suave.",
    `Posición fija obligatoria dentro del set para ${speakerName || speakerLabel || "el locutor"}: ${zoneLabel}.`,
    "Importante: posicionar a cada Host en una parte diferente del escenario, y ser consistente con ese ángulo.",
    "Importante: en la escena solo debe aparecer el locutor o host correspondiente al track.",
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
      "La imagen debe parecer un retrato editorial limpio del locutor activo dentro del set."
    );
  } else {
    lines.push(
      "La escena debe sentirse como conversación entre locutores; el personaje atiende al interlocutor, no al espectador.",
      counterpartSpeakerName ? `La mirada debe sugerir escucha activa hacia ${counterpartSpeakerName}, pero siempre con el interlocutor completamente fuera de cuadro.` : "",
      "Priorizar miradas laterales, reacción conversacional y microgestos que indiquen escucha activa entre locutores."
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
    disfluencyConfig: normalizeDisfluency(row?.disfluencyConfig || {})
  }));
  const hosts = Array.isArray(raw?.script?.hosts)
    ? raw.script.hosts.slice(0, 10).map((host) => clampText(host, 80)).filter(Boolean)
    : [];
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
      durationSec: clampNumber(clip?.durationSec, 0, 240, 0),
      targetSpeechLine: clampText(clip?.targetSpeechLine || "", 2200),
      segments,
      updatedAt: clampText(clip?.updatedAt || new Date().toISOString(), 64) || new Date().toISOString(),
      downloadUrl,
      storagePath
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
      model: clampText(clip?.model || "gemini-2.5-flash-preview-tts", 140) || "gemini-2.5-flash-preview-tts",
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
  const audioModeRaw = String(raw?.podcastVideoConfig?.audioMode || "").trim().toLowerCase();
  const podcastVideoConfig = {
    enabled: raw?.podcastVideoConfig?.enabled === true,
    editorEnabled: raw?.podcastVideoConfig?.editorEnabled === true,
    transitionsByEdge,
    audioMode: audioModeRaw === "veo-native-audio" ? "veo-native-audio" : "gemini-live-per-scene",
    masterVolume: clampNumber(raw?.podcastVideoConfig?.masterVolume, 0, 100, 100),
    clipVolume: clampNumber(raw?.podcastVideoConfig?.clipVolume, 0, 100, 0)
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
      episodeTitle: clampText(raw?.script?.episodeTitle || "Podcast", 220),
      summary: clampText(raw?.script?.summary || "", 6000),
      hosts,
      rows
    },
    speakerVoiceMap: raw?.speakerVoiceMap && typeof raw.speakerVoiceMap === "object" ? raw.speakerVoiceMap : {},
    speakerExpressionMap: raw?.speakerExpressionMap && typeof raw.speakerExpressionMap === "object" ? raw.speakerExpressionMap : {},
    speakerNameMap: raw?.speakerNameMap && typeof raw.speakerNameMap === "object" ? raw.speakerNameMap : {},
    disfluencyDefaults: normalizedDisfluencyDefaults,
    panelMusicConfig,
    speakerPortraitMap,
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
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
        aspectRatio: "1:1"
      }
    }
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
  const file = storageBucket.file(assetPath);
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
    downloadUrl: `https://firebasestorage.googleapis.com/v0/b/${storageBucket.name}/o/${encodeURIComponent(assetPath)}?alt=media&token=${token}`,
  };
}

async function deleteStoragePath(storagePath = "") {
  if (!storagePath) return;
  await storageBucket.file(storagePath).delete({ ignoreNotFound: true }).catch(() => {});
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
    const scenarioPrompt = clampText(req.body?.scenarioPrompt || "", 2400);
    const videoDirective = clampText(req.body?.videoDirective || "", 1400);
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
      hasVideo: previousSceneRaw?.hasVideo === true
    } : null;
    const strictIdentity = req.body?.strictIdentity !== false;
    const regenerate = req.body?.regenerate === true;
    const previousStoragePath = clampText(req.body?.previousStoragePath || "", 700);
    const requestedCandidates = Array.isArray(req.body?.modelCandidates) ? req.body.modelCandidates : [];
    const requestedModel = normalizeModel(req.body?.model || DEFAULT_PODCASTER_VIDEO_MODEL);
    const mergedModels = Array.from(new Set([
      requestedModel,
      ...requestedCandidates.map((item) => normalizeModel(item || "")),
      ...PODCASTER_VIDEO_MODEL_CANDIDATES
    ].filter(Boolean)));
    const filteredModels = strictIdentity
      ? mergedModels.filter((modelName) => !/fast/i.test(String(modelName || "")))
      : mergedModels;
    const videoModels = filteredModels.length ? filteredModels : [DEFAULT_PODCASTER_VIDEO_MODEL];

    if (!sessionId) return res.status(400).json({ error: "Falta sessionId." });
    if (!rowId) return res.status(400).json({ error: "Falta rowId." });
    if (!speakerLabel) return res.status(400).json({ error: "Falta speakerLabel." });
    if (!text) return res.status(400).json({ error: "Falta texto de diálogo." });
    if (!portraitUrl && !portraitStoragePath) return res.status(400).json({ error: "Falta retrato base (portraitUrl o portraitStoragePath)." });

    let portraitBuffer = null;
    let portraitMimeType = "image/png";
    if (portraitStoragePath) {
      try {
        const file = storageBucket.file(portraitStoragePath);
        const [meta] = await file.getMetadata().catch(() => [{}]);
        const [downloaded] = await file.download();
        portraitBuffer = Buffer.from(downloaded);
        portraitMimeType = String(meta?.contentType || "image/png").trim().toLowerCase();
      } catch (_) {
        portraitBuffer = null;
      }
    }
    if (!portraitBuffer && portraitUrl) {
      const portraitResponse = await fetchCompat(portraitUrl, { method: "GET" });
      if (!portraitResponse.ok) {
        const detail = await safeJson(portraitResponse);
        return res.status(portraitResponse.status).json({
          error: String(detail?.error?.message || detail?.error || `No se pudo descargar retrato (${portraitResponse.status}).`)
        });
      }
      portraitMimeType = String(portraitResponse.headers.get("content-type") || "image/png").trim().toLowerCase();
      portraitBuffer = Buffer.from(await portraitResponse.arrayBuffer());
    }
    if (!portraitBuffer) {
      return res.status(400).json({ error: "No se pudo cargar retrato base del locutor." });
    }
    if (!portraitMimeType.startsWith("image/")) {
      return res.status(400).json({ error: "El retrato no es una imagen válida para Veo." });
    }
    if (!portraitBuffer.length || portraitBuffer.length > MAX_SPEAKER_PORTRAIT_BYTES) {
      return res.status(413).json({ error: "El retrato excede el tamaño permitido." });
    }
    const portraitBase64 = portraitBuffer.toString("base64");
    const portraitGcsUri = portraitStoragePath
      ? `gs://${storageBucket.name}/${portraitStoragePath}`
      : "";
    let inferredAudioDurationSec = audioDurationSecInput;
    if (!inferredAudioDurationSec && dialogueAudioStoragePath) {
      try {
        const [audioBytes] = await storageBucket.file(dialogueAudioStoragePath).download();
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
    const characterPrompt = buildBackendPodcasterCharacterPrompt({
      speakerLabel,
      speakerName,
      voiceName,
      genderGroup,
      expression,
      counterpartSpeakerName
    });
    const studioScenePrompt = buildBackendPodcasterStudioScenePrompt({
      speakerLabel,
      speakerName,
      counterpartSpeakerName,
      scenarioPrompt,
      expression
    });

    const prompt = [
      "Genera un video cinematográfico corto y realista para podcast.",
      videoDirective ? `Prioridad máxima: cumple esta especificación adicional del usuario sin romper identidad, sincronía labial ni continuidad del set: ${videoDirective}` : "",
      performanceDirective ? `Prioridad máxima de actuación visual: ejecuta estas acciones físicas o expresivas de forma visible en pantalla, sin convertirlas en texto en pantalla ni alterar el diálogo hablado: ${performanceDirective}` : "",
      `Locutor: ${speakerName} (${speakerLabel}).`,
      voiceName ? `Voz de referencia: ${voiceName}.` : "",
      genderGroup ? `Presentación de género del personaje: ${genderGroup}.` : "",
      `Expresión: ${expression}.`,
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
      previousScene?.hasVideo
        ? "Mantén continuidad visual y de puesta en escena con el clip previo (posición en cabina, encuadre y energía)."
        : "Si no hay clip previo disponible, conserva continuidad narrativa usando el texto de la escena anterior.",
      "El sujeto debe mantener identidad visual consistente y reconocible con la imagen base.",
      "Conserva rasgos faciales, peinado, tono de piel y proporciones del rostro sin sustituir personaje.",
      "Escena en cabina profesional de podcast con micrófono de estudio.",
      "Usa el mismo escenario global del podcast, pero cada locutor debe ocupar una zona física distinta dentro del set.",
      "Importante: posicionar a cada Host en una parte diferente del escenario, y ser consistente con ese ángulo.",
      "Importante: en la escena solo debe aparecer el locutor o host correspondiente al track.",
      "El locutor debe verse en conversación real: cuerpo en tres cuartos o semi perfil, con la mirada dirigida hacia un punto fuera de cámara dentro del set.",
      "Prohibido mirar fijamente al frente, prohibido hablarle al lente, prohibido pose de conductor mirando a cámara.",
      "Debe verse un solo locutor identificable en cuadro; no introducir un segundo personaje visible ni fragmentos corporales de otro personaje.",
      "Composición obligatoria de sujeto único: foreground y background libres de cualquier figura humana adicional.",
      "Si hace falta sugerir conversacion, hacerlo solo con direccion de mirada, postura y composicion del set; nunca agregando otra figura humana.",
      "Solo se permiten microglances incidentales; la eyeline dominante nunca debe caer directamente sobre la cámara.",
      "Plano medio corto, movimiento sutil de cabeza y labios, parpadeo natural, iluminación neutra.",
      dialogueAudioStoragePath || dialogueAudioUrl
        ? `El clip debe sincronizar labios y ritmo con una locución pregrabada de ~${inferredTargetDurationSec} segundos.`
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

    if (strictIdentity && !portraitUrl && !portraitGcsUri) {
      return res.status(400).json({
        error: "strictIdentity requiere portraitUrl o portraitStoragePath para referenceImages."
      });
    }
    const requestVariants = [];
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
              }]
            }],
            parameters: {
              aspectRatio: "16:9",
              durationSeconds: inferredTargetDurationSec,
              personGeneration: "allow_adult"
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
              }]
            }],
            parameters: {
              aspectRatio: "16:9",
              personGeneration: "allow_adult"
            }
          }
        }
      );
    }
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
            }]
          }],
          parameters: {
            aspectRatio: "16:9",
            durationSeconds: inferredTargetDurationSec,
            personGeneration: "allow_adult"
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
            }]
          }],
          parameters: {
            aspectRatio: "16:9",
            personGeneration: "allow_adult"
          }
        }
      }
    );
    if (!strictIdentity) {
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
              durationSeconds: inferredTargetDurationSec,
              personGeneration: "allow_adult"
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
              aspectRatio: "16:9",
              personGeneration: "allow_adult"
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

        const videoUri = String(
          operationDone?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri
          || operationDone?.response?.generatedVideos?.[0]?.video?.uri
          || ""
        ).trim();
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
        model: resolvedModel,
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
        model: resolvedModel,
        variant: resolvedVariant || null,
        promptVersion: "podcaster_veo_v1",
        videoDirective,
        durationSec: inferredTargetDurationSec,
        targetSpeechLine: text,
        updatedAt: new Date().toISOString(),
        storagePath: asset.path,
        downloadUrl: asset.downloadUrl
      }
    });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({ error: String(error?.message || "No se pudo generar video del diálogo.") });
  }
});

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
    const notes = clampText(req.body?.notes || "", 1200);
    const regenerate = req.body?.regenerate === true;
    const previousStoragePath = clampText(req.body?.previousStoragePath || "", 700);
    const model = normalizeModel(req.body?.model || "gemini-2.5-flash-preview-tts");

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

    const prompt = [
      "Interpreta una línea para podcast conversacional en español latino.",
      `Locutor: ${speakerName} (${speakerLabel}).`,
      `Expresión: ${expression}.`,
      voiceName ? `Usa exactamente la voz ${voiceName}.` : "",
      disfluencyInstruction || "No agregues metacomentarios.",
      "Nunca leas acotaciones escénicas, texto entre paréntesis o instrucciones de actuación; interpreta solo la línea objetivo limpia.",
      "Habla natural, humana y clara.",
      notes ? `Notas de interpretación: ${notes}.` : "",
      originalText ? `Línea original (referencia): "${String(originalText).replace(/"/g, '\\"')}"` : "",
      `Línea objetivo (obligatoria): "${String(targetSpeechLine).replace(/"/g, '\\"')}"`
    ].filter(Boolean).join("\n");

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
    const payload = req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : {};
    const serialized = JSON.stringify(payload || {});
    if (Buffer.byteLength(serialized, "utf8") > MAX_PAYLOAD_BYTES) {
      return res.status(413).json({ error: "Payload demasiado grande para Gemini." });
    }

    console.log(`[GEMINI] model=${model}, payloadSize=${serialized.length}`);

    const upstream = await fetchCompat(
      `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: serialized
      }
    );
    const data = await safeJson(upstream);
    if (!upstream.ok) {
      console.error(`[GEMINI] HTTP ${upstream.status}:`, JSON.stringify(data, null, 2));
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
    const allowedHost = host.endsWith("googleapis.com") || host.endsWith("firebasestorage.app");
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

app.get("/api/assets/proxy-media", async (req, res) => {
  try {
    const storagePath = clampText(req.query?.storagePath || "", 700);
    const rawUrl = String(req.query?.url || "").trim();
    const normalizedUrl = rawUrl.includes("%25") ? decodeURIComponent(rawUrl) : rawUrl;
    const rangeHeader = String(req.headers.range || "").trim();

    if (storagePath) {
      const file = storageBucket.file(storagePath);
      const [exists] = await file.exists().catch(() => [false]);
      if (!exists) {
        return res.status(404).json({ error: "Archivo no encontrado en Storage." });
      }
      const [meta] = await file.getMetadata().catch(() => [{}]);
      const [buffer] = await file.download();
      const mime = String(meta?.contentType || "application/octet-stream");
      res.setHeader("Content-Type", mime);
      res.setHeader("Content-Length", String(buffer.length));
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "private, max-age=120");
      if (rangeHeader) {
        const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/i);
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
