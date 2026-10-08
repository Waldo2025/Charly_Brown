import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
import {
  LOCAL_VIDEO_MODEL_ID,
  ComfyClient,
  loadWorkflowTemplate,
  renderWorkflow,
  planLocalRender,
  hostTier,
  hostRamGb,
  calibrateK,
  upscaleTargetForTier,
  QUALITY_PRESETS,
  qualityPresetByIdOrMinutes,
  listInstalledArtifacts,
  selectArtifactForPreset,
  engineArtifactById,
  kForArtifact,
  kMapWith,
  BASE_ENGINE_ID,
  ENGINE_ARTIFACTS,
  SMOOTH_OUTPUT_FPS,
  extractOutputVideo,
} from "./comfy-client.mjs";
import { polishClip, getClipPolisher, smoothFpsFor } from "./clip-polish.mjs";
import { renderConsolePage } from "./console-page.mjs";

const VERSION = "0.1.0";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAIR_TTL_MS = 5 * 60 * 1000;
const PAIR_GRACE_MS = 10 * 60 * 1000;
const PORT = Number(process.env.PODCASTER_LOCAL_VIDEO_PORT || 8792);
const HOST = "127.0.0.1";
const MAX_BODY_BYTES = 12 * 1024 * 1024;
const CONFIG_FILE = process.env.PODCASTER_LOCAL_VIDEO_CONFIG
  || path.join(os.homedir(), ".charlybrown", "podcaster-local-video.json");

function loadConfig() {
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch {
    /* first run */
  }
  let token = saved.token || crypto.randomBytes(16).toString("hex");
  if (!saved.token) {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true, mode: 0o700 });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ token, createdAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
  }
  const extraOrigins = String(process.env.PODCASTER_LOCAL_VIDEO_ORIGINS || saved.origins || "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return {
    token,
    extraOrigins,
    models: saved.models && typeof saved.models === "object" ? saved.models : {},
    // Editores que emparejaron su código, para que reiniciar Snoopy no los olvide.
    pairedOrigins: Array.isArray(saved.pairedOrigins)
      ? saved.pairedOrigins
        .map((item) => ({
          origin: String(item?.origin || "").replace(/\/+$/, "").slice(0, 120),
          pairedAt: Number(item?.pairedAt) || 0,
          lastSeen: Number(item?.lastSeen) || 0,
        }))
        .filter((item) => item.origin)
      : [],
    renderBudgetMinutes: Number(saved.renderBudgetMinutes) > 0 ? Number(saved.renderBudgetMinutes) : 0,
    // Preset elegido en la consola: el que decide el motor (base o Turbo).
    qualityPresetId: String(saved.qualityPresetId || "").trim(),
    // Movimiento suave: el clip sale a 12 fps de la GPU y el afinado lo sube a 24
    // mezclando pares. Encendido por defecto; la consola puede apagarlo.
    smoothMotion: saved.smoothMotion !== false,
    // Modelos extra de la escalera de calidad (nivel Rápido), guardados aparte para
    // no pisar los del paquete base.
    ladderModels: saved.ladderModels && typeof saved.ladderModels === "object" ? saved.ladderModels : {},
    // Coste por (frame × píxel × paso) recalibrado con las escenas ya generadas.
    // Antes era un número; ahora es { motor: número }, y el número suelto se lee
    // como el coste del modelo base.
    kCalibrated: saved.kCalibrated && typeof saved.kCalibrated === "object"
      ? saved.kCalibrated
      : Number(saved.kCalibrated) > 0 ? Number(saved.kCalibrated) : 0,
  };
}

/** Guarda preferencias del usuario sin tocar el token ni los nombres de modelo. */
function saveConfigKeys(patch) {
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch {
    /* primera configuración */
  }
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true, mode: 0o700 });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...saved, ...patch }, null, 2), { mode: 0o600 });
  Object.assign(config, patch);
}

const config = loadConfig();
const COMFY_BASE = process.env.COMFY_API_BASE || "http://127.0.0.1:8188";
const comfy = new ComfyClient({ baseUrl: COMFY_BASE });

// Clave efímera de la consola: se embute solo en el HTML de /consola (servido sin
// CORS) para que únicamente la página abierta por el usuario pueda confirmar códigos.
const CONSOLE_KEY = crypto.randomBytes(16).toString("hex");

/** @type {Map<string, {id:string,code:string,origin:string,createdAt:number,expiresAt:number,confirmed:boolean}>} */
const pendingPairs = new Map();

function prunePairs() {
  const now = Date.now();
  for (const [id, pair] of pendingPairs) {
    if (now > pair.expiresAt + PAIR_GRACE_MS) pendingPairs.delete(id);
  }
}

function createPairRequest(origin) {
  prunePairs();
  const active = [...pendingPairs.values()].filter((p) => p.origin === origin && !p.confirmed && Date.now() < p.expiresAt);
  for (const stale of active) pendingPairs.delete(stale.id);
  if ([...pendingPairs.values()].filter((p) => !p.confirmed && Date.now() < p.expiresAt).length >= 4) {
    throw Object.assign(new Error("Hay muchas conexiones pendientes; confirma o espera una."), { statusCode: 429 });
  }
  const takenCodes = new Set([...pendingPairs.values()].map((p) => p.code));
  let code = "";
  do {
    code = String(crypto.randomInt(100000, 1000000));
  } while (takenCodes.has(code));
  const pair = {
    id: crypto.randomUUID(),
    code,
    origin: String(origin || "").slice(0, 120),
    createdAt: Date.now(),
    expiresAt: Date.now() + PAIR_TTL_MS,
    confirmed: false,
  };
  pendingPairs.set(pair.id, pair);
  return pair;
}

function confirmPairCode(rawCode) {
  const code = String(rawCode || "").replace(/\D/g, "");
  prunePairs();
  for (const pair of pendingPairs.values()) {
    if (pair.confirmed) continue;
    if (Date.now() > pair.expiresAt) continue;
    if (pair.code === code) {
      pair.confirmed = true;
      pair.confirmedAt = Date.now();
      return pair;
    }
  }
  return null;
}

function formatPairCode(code) {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

function normalizeOrigin(origin) {
  return String(origin || "").trim().replace(/\/+$/, "").slice(0, 120);
}

/**
 * El token sigue siendo la llave, pero sin emparejar el origen no se atiende: así
 * «Desconectar» de la consola quita el acceso de verdad y no es decorativo.
 * Sin cabecera Origin (curl, pruebas locales) manda solo el token.
 */
function originAuthorized(origin) {
  const clean = normalizeOrigin(origin);
  if (!clean) return true;
  if (config.extraOrigins.includes(clean)) return true;
  return config.pairedOrigins.some((item) => item.origin === clean);
}

function rememberPairedOrigin(origin) {
  const clean = normalizeOrigin(origin);
  if (!clean) return;
  const now = Date.now();
  const rest = config.pairedOrigins.filter((item) => item.origin !== clean);
  const next = [{ origin: clean, pairedAt: now, lastSeen: now }, ...rest].slice(0, 12);
  config.pairedOrigins = next;
  saveConfigKeys({ pairedOrigins: next });
}

function forgetPairedOrigin(origin) {
  const clean = normalizeOrigin(origin);
  const next = config.pairedOrigins.filter((item) => item.origin !== clean);
  const changed = next.length !== config.pairedOrigins.length;
  config.pairedOrigins = next;
  if (changed) saveConfigKeys({ pairedOrigins: next });
  return changed;
}

// Solo anotamos el último uso si pasó más de un minuto, para no escribir la
// configuración en cada petición del sitio.
const lastSeenWrites = new Map();
function touchPairedOrigin(origin) {
  const clean = normalizeOrigin(origin);
  if (!clean) return;
  const entry = config.pairedOrigins.find((item) => item.origin === clean);
  if (!entry) return;
  if (Date.now() - (lastSeenWrites.get(clean) || 0) < 60000) return;
  lastSeenWrites.set(clean, Date.now());
  entry.lastSeen = Date.now();
  saveConfigKeys({ pairedOrigins: config.pairedOrigins });
}

function editorsPayload() {
  return config.pairedOrigins.map((item) => ({
    origin: item.origin,
    pairedAt: item.pairedAt,
    lastSeen: item.lastSeen,
    // Un editor que pidió código en los últimos 5 min está intentando conectar.
    connected: Date.now() - (item.lastSeen || item.pairedAt) < 5 * 60 * 1000,
  }));
}

// ── Invitación de un clic (la consola abre el editor ya conectado) ──────────
// El código de 6 números sigue siendo el camino normal; la invitación es un
// enlace de un solo uso para no tener que teclear nada. Por eso lleva 128 bits
// de aleatoriedad, caduca en 5 minutos y se consume al primer canje.
const INVITE_TTL_MS = 5 * 60 * 1000;
/** @type {Map<string, {createdAt:number, expiresAt:number, used:boolean}>} */
const invites = new Map();

function pruneInvites() {
  const now = Date.now();
  for (const [invite, record] of invites) {
    if (now > record.expiresAt) invites.delete(invite);
  }
}

function createInvite() {
  pruneInvites();
  if (invites.size >= 8) throw Object.assign(new Error("Hay muchos enlaces de conexión abiertos; usa el último."), { statusCode: 429 });
  const invite = crypto.randomBytes(16).toString("hex");
  invites.set(invite, { createdAt: Date.now(), expiresAt: Date.now() + INVITE_TTL_MS, used: false });
  return invite;
}

/** Canjea la invitación a nombre del origen que la abre. */
function redeemInvite(rawInvite, origin) {
  const invite = String(rawInvite || "").trim().slice(0, 64);
  const record = invites.get(invite);
  if (!record || record.used || Date.now() > record.expiresAt) return null;
  record.used = true;
  invites.delete(invite);
  rememberPairedOrigin(origin);
  return record;
}

function editorConnectUrl(origin, invite) {
  const base = normalizeOrigin(origin) || DEFAULT_ALLOWED_ORIGINS[0];
  return `${base}/podcaster.html?snoopy=${encodeURIComponent(invite)}`;
}

// ── Instalador de un clic del motor (ComfyUI + Wan 2.2) ─────────────────────
const INSTALLER_PATH = process.env.PODCASTER_LOCAL_VIDEO_INSTALLER
  || path.join(HERE, "engine-installer.mjs");

const installState = {
  running: false,
  step: "",
  percent: 0,
  message: "",
  logTail: "",
  error: null,
  done: false,
  target: null,
  startedAt: null,
  finishedAt: null,
};

function installStatusPayload() {
  return {
    running: installState.running,
    step: installState.step,
    percent: installState.percent,
    message: installState.message,
    logTail: installState.logTail.slice(-2000),
    error: installState.error,
    done: installState.done,
    target: installState.target,
  };
}

/**
 * Un clic del instalador. `extraArgs` es lo que separa instalar el motor (todo:
 * ComfyUI + Python + modelo base) de bajar un peldaño de la escalera (solo archivos).
 */
function startEngineInstall({ extraArgs = [], message = "Preparando la instalación…", target = "engine" } = {}) {
  if (installState.running) {
    throw Object.assign(new Error("La instalación del motor ya está en curso."), { statusCode: 409 });
  }
  Object.assign(installState, {
    running: true,
    step: "arrancando",
    percent: 0,
    message,
    logTail: "",
    error: null,
    done: false,
    target,
    startedAt: Date.now(),
    finishedAt: null,
  });
  const child = spawn(process.execPath, [INSTALLER_PATH, ...extraArgs], { stdio: ["ignore", "pipe", "pipe"] });
  installState.child = child;
  let stdoutBuf = "";
  child.stdout.on("data", (chunk) => {
    stdoutBuf += chunk.toString("utf8");
    let idx;
    while ((idx = stdoutBuf.indexOf("\n")) >= 0) {
      const line = stdoutBuf.slice(0, idx).trim();
      stdoutBuf = stdoutBuf.slice(idx + 1);
      if (!line) continue;
      try {
        const event = JSON.parse(line);
        if (event.type === "step") {
          installState.step = String(event.id || installState.step);
          installState.percent = Number(event.percent) || installState.percent;
          installState.message = String(event.message || installState.message);
        } else if (event.type === "error") {
          installState.error = { message: String(event.message || "Error de instalación"), hint: event.hint || "" };
        } else if (event.type === "done") {
          installState.done = true;
          installState.percent = 100;
        }
      } catch {
        installState.logTail = (installState.logTail + line + "\n").slice(-4000);
      }
    }
  });
  child.stderr.on("data", (chunk) => {
    installState.logTail = (installState.logTail + chunk.toString("utf8")).slice(-4000);
  });
  child.on("error", (err) => {
    installState.running = false;
    installState.finishedAt = Date.now();
    installState.error = { message: `No se pudo iniciar el instalador: ${err.message}`, hint: "Reinstala Servidor Snoopy." };
  });
  child.on("close", (code) => {
    installState.running = false;
    installState.finishedAt = Date.now();
    if (code === 0) {
      installState.done = true;
      installState.percent = 100;
      // El instalador escribe los nombres de modelos en el archivo de configuración;
      // recargarlos para que el workflow use los archivos descargados. El modo
      // escalera solo añade ladderModels, nunca pisa los del paquete base.
      const fresh = loadConfig();
      config.models = fresh.models;
      config.ladderModels = fresh.ladderModels;
    } else if (!installState.error) {
      installState.error = {
        message: `El instalador terminó con código ${code}.`,
        hint: "Revisa el registro al final de la tarjeta y vuelve a intentar.",
      };
    }
  });
  return installStatusPayload();
}

const ALLOWED_HOST_ORIGINS = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
// El sitio de producción de Charly Brown se acepta por defecto para que un usuario
// sin experiencia no configure variables de entorno; PODCASTER_LOCAL_VIDEO_ORIGINS
// añade los demás.
const DEFAULT_ALLOWED_ORIGINS = ["https://charly-brown.web.app"];
function originAllowed(origin) {
  if (!origin) return false;
  if (ALLOWED_HOST_ORIGINS.test(origin)) return true;
  const clean = origin.replace(/\/+$/, "");
  return DEFAULT_ALLOWED_ORIGINS.includes(clean) || config.extraOrigins.includes(clean);
}

/** @type {Map<string, object>} */
const jobs = new Map();
let runningJobId = null;
// ffmpeg no viene instalado en macOS: lo resolvemos una vez y saber qué afinador hay
// (ffmpeg, el Python de ComfyUI, o ninguno) decide el tamaño real del archivo final.
let clipPolisher = null;
getClipPolisher().then((tool) => { clipPolisher = tool; }).catch(() => { });

// ComfyUI no responde por HTTP mientras la GPU está ocupada, así que /health nunca
// espera por él: sirve el último resultado conocido y lo refresca en segundo plano.
const COMFY_PROBE_TTL_MS = 4000;
let comfyProbe = { reachable: false, checkedAt: 0, inFlight: false, resolved: false };
let comfyProbeWaiters = [];

function refreshComfyProbe() {
  if (comfyProbe.inFlight) return Promise.resolve(comfyProbe.reachable);
  if (comfyProbe.resolved && Date.now() - comfyProbe.checkedAt < COMFY_PROBE_TTL_MS) {
    return Promise.resolve(comfyProbe.reachable);
  }
  comfyProbe.inFlight = true;
  const settled = comfy.reachable()
    .then((reachable) => {
      comfyProbe = { reachable, checkedAt: Date.now(), inFlight: false, resolved: true };
      return reachable;
    })
    .finally(() => {
      comfyProbe = { ...comfyProbe, inFlight: false };
      const waiters = comfyProbeWaiters;
      comfyProbeWaiters = [];
      for (const resolve of waiters) resolve(comfyProbe.reachable);
    });
  return settled;
}

async function comfyReachabilityForHealth() {
  if (runningJobId) return true;
  if (!comfyProbe.resolved && !comfyProbe.inFlight) {
    const timeout = new Promise((resolve) => setTimeout(() => resolve(false), 900));
    return Promise.race([refreshComfyProbe(), timeout]);
  }
  if (comfyProbe.inFlight) {
    const pending = new Promise((resolve) => comfyProbeWaiters.push(resolve));
    const timeout = new Promise((resolve) => setTimeout(() => resolve(comfyProbe.reachable), 900));
    return Promise.race([pending, timeout]);
  }
  refreshComfyProbe();
  return comfyProbe.reachable;
}

const GB = 1024 ** 3;
const LOW_RAM_HOST = os.totalmem() <= 20 * GB;

// Última vez que Snoopy devolvió memoria al Mac, para que la consola pueda
// demostrar el efecto del botón (y del auto-liberado al terminar cada video).
let lastMemoryRelease = null;

// Lee la memoria sin depender de ComfyUI (que no responde mientras genera).
function readHostMemory() {
  let swapUsedGb = 0;
  let swapTotalGb = 0;
  try {
    const raw = execFileSync("/usr/sbin/sysctl", ["-n", "vm.swapusage"], { encoding: "utf8" });
    const used = /used\s*=\s*([\d.]+)M/.exec(raw);
    const total = /total\s*=\s*([\d.]+)M/.exec(raw);
    swapUsedGb = Number(used?.[1] || 0) / 1024;
    swapTotalGb = Number(total?.[1] || 0) / 1024;
  } catch (_) { }

  let freeGb = 0;
  try {
    const raw = execFileSync("/usr/bin/vm_stat", [], { encoding: "utf8" });
    const pageSize = Number(/Page size of size (\d+)/.exec(raw)?.[1] || 16384);
    const pages = {};
    for (const line of raw.split("\n")) {
      const m = /^(.*?):\s+(\d+)\./.exec(line.trim());
      if (m) pages[m[1].trim()] = Number(m[2]);
    }
    freeGb = ((pages["Pages free"] || 0) + (pages["Pages speculative"] || 0)) * pageSize / GB;
  } catch (_) { }

  const level = swapUsedGb >= 8 ? "critica" : swapUsedGb >= 3 ? "justa" : "comoda";
  return {
    ramTotalGb: Math.round(os.totalmem() / GB),
    ramFreeGb: Math.round(freeGb * 10) / 10,
    swapUsedGb: Math.round(swapUsedGb * 10) / 10,
    swapTotalGb: Math.round(swapTotalGb * 10) / 10,
    level,
  };
}

function memoryAdvice(mem) {
  if (mem.level === "critica") {
    return `El Mac está usando ${mem.swapUsedGb} GB de disco como memoria y eso frena la generación. Pulsa «Liberar memoria» para soltar los modelos de video; si sigue alto, cierra otras apps o reinicia el equipo y vuelve a abrir Servidor Snoopy con doble clic.`;
  }
  if (mem.level === "justa") {
    return `Memoria justa (${mem.swapUsedGb} GB en disco). Si la generación avanza lenta, cierra pestañas o apps pesadas y pulsa «Liberar memoria».`;
  }
  return "Memoria cómoda: el motor tiene espacio para generar.";
}

// Suelta los modelos de ComfyUI y mide qué se recuperó, para que la consola pueda
// mostrar una prueba en vez de un botón que "no hace nada visible".
async function releaseEngineMemory({ automatic = false } = {}) {
  const before = readHostMemory();
  await comfy.freeMemory();
  await sleep(1500);
  const after = readHostMemory();
  lastMemoryRelease = {
    at: Date.now(),
    automatic,
    freedGb: Math.max(0, Math.round((before.swapUsedGb - after.swapUsedGb) * 10) / 10),
    swapUsedGb: after.swapUsedGb,
  };
  comfyProbe = { ...comfyProbe, reachable: true, checkedAt: Date.now(), resolved: true };
  return lastMemoryRelease;
}

function memoryPayload({ busy = Boolean(runningJobId) } = {}) {
  const mem = readHostMemory();
  const advice = busy
    ? "Snoopy está generando un video ahora mismo y necesita la memoria: la liberará solo en cuanto termine."
    : memoryAdvice(mem);
  return {
    ...mem,
    busy,
    advice,
    lastRelease: lastMemoryRelease
      ? {
        minutesAgo: Math.max(0, Math.round((Date.now() - lastMemoryRelease.at) / 60000)),
        freedGb: lastMemoryRelease.freedGb,
        swapUsedGb: lastMemoryRelease.swapUsedGb,
        automatic: lastMemoryRelease.automatic,
      }
      : null,
  };
}

// Biblioteca local de clips: cada video terminado se guarda con su ficha `.json`
// para que la consola los liste y los vuelva a reproducir aunque el sitio ya no los tenga.
const CLIPS_DIR = process.env.PODCASTER_LOCAL_VIDEO_CLIPS_DIR
  || path.join(path.dirname(CONFIG_FILE), "podcaster-clips");
const CLIPS_KEEP = 40;
const CLIP_ID_RE = /^[A-Za-z0-9._-]+$/;

function clipBase(createdAt, jobId) {
  return `${new Date(createdAt).toISOString().replace(/[:.]/g, "-")}-${String(jobId).slice(0, 8)}`;
}

function saveClipToLibrary(job, { buffer, mimeType, outputFps = 0, motionSmoothed = false, outputWidth = 0, outputHeight = 0 }) {
  const base = clipBase(job.createdAt, job.id);
  const nativeFps = Number(job.spec.fps) || 16;
  const frames = Number(job.spec.lengthFrames) || 0;
  const record = {
    id: base,
    jobId: job.id,
    file: `${base}.mp4`,
    createdAt: job.createdAt,
    // La duración se mide sobre los frames nativos: al duplicar la cadencia se
    // duplican también los frames, así que el video dura lo mismo a 24 fps.
    durationSec: frames > 0 ? Math.round((frames / nativeFps) * 100) / 100 : null,
    // El archivo guardado ya viene afinado: se anota su tamaño real, no el de la GPU.
    width: Number(outputWidth) > 0 ? Math.round(Number(outputWidth)) : (Number(job.spec.width) || null),
    height: Number(outputHeight) > 0 ? Math.round(Number(outputHeight)) : (Number(job.spec.height) || null),
    steps: Number(job.spec.steps) || null,
    fps: Number(outputFps) > 0 ? Math.round(Number(outputFps)) : nativeFps,
    nativeFps,
    motionSmoothed: Boolean(motionSmoothed),
    minutes: job.startedAt ? Math.round(((Date.now() - job.startedAt) / 60000) * 10) / 10 : null,
    estimatedMinutes: job.plan?.estimatedMinutes ?? null,
    bytes: buffer.length,
    mimeType,
    prompt: String(job.spec.prompt || "").slice(0, 180),
    title: null,
    storageUrl: null,
  };
  fs.mkdirSync(CLIPS_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(CLIPS_DIR, record.file), buffer);
  fs.writeFileSync(path.join(CLIPS_DIR, `${base}.json`), JSON.stringify(record, null, 2), { mode: 0o600 });
  pruneClips();
  return record;
}

function pruneClips() {
  const bases = fs.readdirSync(CLIPS_DIR).filter((name) => name.endsWith(".mp4")).sort();
  for (const name of bases.slice(0, Math.max(0, bases.length - CLIPS_KEEP))) {
    fs.rmSync(path.join(CLIPS_DIR, name), { force: true });
    fs.rmSync(path.join(CLIPS_DIR, `${name.slice(0, -4)}.json`), { force: true });
  }
}

function listClips() {
  let names = [];
  try {
    names = fs.readdirSync(CLIPS_DIR).filter((name) => name.endsWith(".json"));
  } catch {
    return [];
  }
  const clips = [];
  for (const name of names) {
    try {
      const record = JSON.parse(fs.readFileSync(path.join(CLIPS_DIR, name), "utf8"));
      if (record?.file && fs.existsSync(path.join(CLIPS_DIR, record.file))) clips.push(record);
    } catch {
      /* una ficha rota no debe tumbar la lista */
    }
  }
  return clips.sort((a, b) => b.createdAt - a.createdAt);
}

/** Une la escena del sitio (título y URL de Storage) con el clip guardado en el Mac. */
function linkClip(jobId, patch) {
  const clip = listClips().find((c) => c.jobId === jobId);
  if (!clip) return null;
  const merged = {
    ...clip,
    ...(patch.title ? { title: String(patch.title).slice(0, 120) } : {}),
    ...(patch.storageUrl ? { storageUrl: String(patch.storageUrl).slice(0, 500) } : {}),
  };
  fs.writeFileSync(path.join(CLIPS_DIR, `${clip.id}.json`), JSON.stringify(merged, null, 2), { mode: 0o600 });
  return merged;
}

// Snoopy se puede reiniciar (o cerrarse la app) justo después de terminar un clip: la
// copia en memoria desaparece, pero la biblioteca del disco sigue teniendo el video.
// Estas tres funciones son la única forma de que ese clip llegue a Storage en vez de
// quedar huérfano para siempre.
function diskClipForJob(jobId = "") {
  const key = String(jobId || "").trim();
  if (!key) return null;
  return listClips().find((record) => record?.jobId === key) || null;
}

function readDiskClip(record) {
  if (!record?.file) return null;
  if (path.basename(record.file) !== record.file || !CLIP_ID_RE.test(record.file)) return null;
  try {
    return fs.readFileSync(path.join(CLIPS_DIR, record.file));
  } catch {
    return null;
  }
}

/** La ficha de /jobs/:id armada desde el disco, para que el sitio pueda reanudar. */
function diskJobView(record) {
  return {
    jobId: record.jobId,
    status: "ready",
    stage: "listo",
    progress: 100,
    step: null,
    hint: "El clip ya está en tu Mac; solo falta guardarlo en tu biblioteca.",
    model: LOCAL_VIDEO_MODEL_ID,
    durationSec: Number(record.durationSec) || undefined,
    plan: null,
    clip: {
      id: record.id,
      file: record.file,
      bytes: Number(record.bytes) || null,
      storageUrl: record.storageUrl || null,
    },
    updatedAt: record.createdAt,
    fromDisk: true,
  };
}

function newJob(spec, plan, engine) {
  const id = crypto.randomUUID();
  jobs.set(id, {
    id,
    spec,
    plan,
    // Motor elegido al pedir la escena: si luego se cambia el preset en la consola,
    // esta escena se genera con el paquete con el que se presupuestó.
    engine,
    status: "queued",
    stage: "en cola",
    progress: 0,
    step: null,
    hint: "Esperando turno en la GPU local.",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    startedAt: 0,
    video: null,
    error: null,
  });
  if (jobs.size > 50) {
    for (const [key, job] of jobs) {
      if (job.status !== "running" && key !== runningJobId) jobs.delete(key);
    }
  }
  return id;
}

function touch(job, patch) {
  Object.assign(job, patch, { updatedAt: Date.now() });
  return job;
}

// Cancelar le quita el trabajo a ComfyUI (interrumpiendo la GPU o sacándolo de su
// propia cola), no solo marcar el estado: si no, el Mac seguiría quemando media hora.
async function cancelJob(job) {
  if (job.status !== "queued" && job.status !== "running") return job;
  touch(job, { status: "canceled", stage: "cancelado", progress: 0, step: null, hint: "Escena cancelada; tu GPU ya está libre." });
  // Interrumpir aunque el job aún no tenga promptId: si cancelan durante la
  // preparación, la escena entra en ComfyUI un segundo después y la GPU seguiría
  // gastando media hora creyendo que nadie la pidió.
  if (runningJobId === job.id) await comfy.interrupt();
  else if (job.promptId) await comfy.removeFromQueue(job.promptId);
  if (runningJobId === job.id) runningJobId = null;
  return job;
}

async function runJob(jobId) {
  const job = jobs.get(jobId);
  if (!job || job.status === "canceled") return;
  runningJobId = jobId;
  try {
    touch(job, { status: "running", stage: "preparando workflow", progress: 0.05, hint: "Cargando prompt y primer frame." });
    const template = loadWorkflowTemplate(job.spec.mode);
    let imageName = "";
    if (job.spec.mode === "i2v") {
      imageName = await comfy.uploadImage(job.spec.firstFrame);
    }
    const workflow = renderWorkflow(template, {
      ...job.spec,
      imageName,
      unetName: job.engine?.unet || config.models.unet,
      clipName: job.engine?.clip || config.models.clip,
      vaeName: config.models.vae,
      sampler: job.engine?.sampler,
      vaeDecodeClass: job.engine?.vaeDecodeClass,
      vaeTiled: job.engine?.vaeTiled,
    });
    touch(job, { stage: "preparando la escena", progress: 0.12, hint: "Wan 2.2 entra en tu GPU y arranca el muestreo; el primer paso siempre tarda más." });
    const promptId = await comfy.queuePrompt(workflow);
    job.promptId = promptId;
    // Si cancelaron durante la preparación la escena ya cayó en la cola de ComfyUI:
    // se frena aquí mismo en vez de dejar media hora de GPU generando un clip que
    // nadie quiere.
    if (job.status === "canceled") {
      await comfy.interrupt();
      return;
    }

    const startedAt = Date.now();
    touch(job, { startedAt });
    const deadline = startedAt + 1000 * 60 * 90;
    const estimatedMinutes = Number(job.plan?.estimatedMinutes) || 0;
    const stepWatcher = comfy.watchProgress();
    let entry = null;
    try {
      while (!entry) {
        if (job.status === "canceled") return;
        if (Date.now() > deadline) throw new Error("ComfyUI tardó demasiado (más de 90 min).");
        await sleep(2000);
        entry = await comfy.history(promptId).catch(() => null);
        if (entry?.status?.status_str === "error") {
          throw new Error("ComfyUI reportó un error al generar. Revisa la consola de ComfyUI.");
        }
        if (job.status === "canceled") return;
        const elapsedMin = Math.floor((Date.now() - startedAt) / 60000);
        const step = stepWatcher.stepOf(promptId);
        if (step) {
          // ComfyUI ya dio todos los pasos y sigue sin entregar el clip: es la VAE
          // comprimiendo los frames, la fase que más asusta porque no avanza por paso.
          const samplingDone = step.value >= step.max;
          touch(job, {
            stage: samplingDone ? "comprimiendo el video" : "muestreando en tu GPU",
            progress: samplingDone ? 0.88 : Math.max(0.15, Math.min(0.85, 0.15 + 0.7 * (step.value / step.max))),
            step: { value: step.value, max: step.max, phase: samplingDone ? "decode" : "sample" },
            hint: samplingDone
              ? `Muestreo terminado (${step.max} de ${step.max} pasos) · ${elapsedMin} min: Wan está comprimiendo los frames, es lo último que queda.`
              : `Paso ${step.value} de ${step.max} en tu GPU · ${elapsedLabel(elapsedMin, estimatedMinutes)}.`,
          });
        } else {
          // Sin websocket no hay pasos reales: aproximamos, y lo decimos.
          job.progress = Math.min(0.8, job.progress + 0.02);
          touch(job, {
            stage: "muestreando en tu GPU",
            step: null,
            hint: elapsedMin >= 1
              ? `Muestreando en tu GPU · ${elapsedLabel(elapsedMin, estimatedMinutes)} · avance aproximado.`
              : "Wan 2.2 muestreando los frames en tu GPU.",
          });
        }
      }
    } finally {
      stepWatcher.close();
    }

    touch(job, { stage: "descargando video", progress: 0.92, step: null, hint: "Extrayendo el clip desde ComfyUI." });
    const outFile = extractOutputVideo(entry);
    if (!outFile) throw new Error("ComfyUI terminó sin avisar dónde guardó el clip. Revisa la carpeta ~/ComfyUI/output/podcaster_local; si está ahí, Snoopy Editor puede volver a usarlo.");
    let buffer = await comfy.fetchOutput(outFile);
    let outputFps = 0;
    let outputWidth = 0;
    let outputHeight = 0;
    let motionSmoothed = false;
    const alreadyMp4 = /\.mp4$/i.test(outFile.filename || "");
    const mimeType = "video/mp4";
    // El suavizado depende de la cadencia que salió de esta escena (8, 12 o 16 fps):
    // se anuncia sólo cuando de verdad va a aplicar, para no prometer movimiento falso.
    const plannedFps = smoothFpsFor({
      sourceFps: Number(job.spec.fps) || 0,
      smoothMotion: config.smoothMotion !== false && Boolean(clipPolisher),
    });
    touch(job, { stage: "dando definición al clip", progress: 0.96, hint: clipPolisher
      ? `${clipPolisher.kind === "ffmpeg" ? "ffmpeg" : "el afinador de ComfyUI"} reescala y afina el video${plannedFps ? `, y le da movimiento suave a ${plannedFps} fps` : ""}, sin costo.`
      : "Sin afinador en este Mac: se guarda el clip tal como salió de la GPU." });
    try {
      const polished = await polishClip(buffer, {
        nativeWidth: Number(job.spec.width) || 0,
        nativeHeight: Number(job.spec.height) || 0,
        targetLongEdge: upscaleTargetForTier(),
        sourceFps: Number(job.spec.fps) || 0,
        smoothMotion: config.smoothMotion !== false,
      });
      buffer = polished.buffer;
      outputFps = Number(polished.fps) || 0;
      outputWidth = Number(polished.width) || 0;
      outputHeight = Number(polished.height) || 0;
      motionSmoothed = Boolean(polished.motionSmoothed);
    } catch (error) {
      // Sin afinador no podemos afinar, pero el clip de ComfyUI sigue siendo útil si ya es MP4.
      if (!alreadyMp4) throw error;
      console.warn("[servidor-snoopy] afinación omitida:", error.message);
    }
    // El tiempo real de esta escena corrige la estimación de la siguiente, y solo la
    // del motor usado: un Turbo de 4 pasos no debe calibrar al modelo base.
    if (job.plan) {
      const artifactId = job.engine?.artifactId || BASE_ENGINE_ID;
      const k = calibrateK({
        secondsElapsed: (Date.now() - startedAt) / 1000,
        lengthFrames: job.spec.lengthFrames,
        width: job.spec.width,
        height: job.spec.height,
        steps: job.spec.steps,
      }, kForEngine(artifactId));
      saveConfigKeys({ kCalibrated: kMapWith(config.kCalibrated, artifactId, k) });
    }
    let clip = null;
    try {
      clip = saveClipToLibrary(job, { buffer, mimeType, outputFps, motionSmoothed, outputWidth, outputHeight });
    } catch (error) {
      // Si el disco está lleno el sitio recibe igual el video; solo se pierde el historial.
      console.warn("[servidor-snoopy] no se pudo guardar en la biblioteca:", error.message);
    }
    touch(job, {
      status: "ready",
      stage: "listo",
      progress: 1,
      hint: [
        clip ? "Video generado sin costo y guardado en este Mac." : "Video generado sin costo.",
        motionSmoothed ? `Movimiento suave aplicado (${outputFps} fps).` : "",
      ].filter(Boolean).join(" "),
      clip: clip ? { id: clip.id, file: clip.file } : null,
      video: { buffer, mimeType, model: LOCAL_VIDEO_MODEL_ID },
    });
  } catch (error) {
    touch(job, { status: "error", stage: "error", hint: error.message, error: { message: error.message } });
  } finally {
    if (runningJobId === jobId) runningJobId = null;
    // En equipos de poca RAM los modelos (~9 GB) deben salir de memoria aunque
    // el video haya fallado; si no, el siguiente intento parte ya saturado.
    if (LOW_RAM_HOST) await releaseEngineMemory({ automatic: true }).catch(() => { });
    const next = [...jobs.values()].find((j) => j.status === "queued");
    if (next) runJob(next.id);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * «12 min de unos 19 estimados» mientras vamos dentro del estimado, y la verdad
 * cuando ya nos pasamos: decir «le falta 1 min» toda la tarde es lo que hace pensar
 * al usuario que la escena está colgada.
 */
function elapsedLabel(elapsedMin, estimatedMinutes) {
  const spent = `${elapsedMin} min transcurridos`;
  if (!estimatedMinutes) return spent;
  if (elapsedMin < estimatedMinutes) return `${spent} de unos ${estimatedMinutes} estimados`;
  return `${spent} (estimamos ~${estimatedMinutes} y ya vamos por delante: con la RAM justa Wan apoya trabajo en disco y tarda más)`;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendJson(res, status, data, headers = {}) {
  send(res, status, JSON.stringify(data), { "Content-Type": "application/json; charset=utf-8", ...headers });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("Cuerpo demasiado grande (máx. 12 MB)."), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function clampFps(value) {
  return Math.max(8, Math.min(30, Math.round(Number(value) || 16)));
}

function publicJob(job) {
  const fps = Number(job.spec.fps) || 16;
  const frames = Number(job.spec.lengthFrames) || 0;
  return {
    jobId: job.id,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    step: job.step || null,
    hint: job.hint,
    model: LOCAL_VIDEO_MODEL_ID,
    durationSec: frames > 0 ? Math.round((frames / fps) * 100) / 100 : undefined,
    plan: job.plan ? planWithProgress(job) : null,
    clip: job.clip || null,
    updatedAt: job.updatedAt,
    ...(job.error ? { error: job.error } : {}),
  };
}

/** El plan con el reloj puesto: «quedan X min de los ~Y que estimamos». */
function planWithProgress(job) {
  const elapsedSeconds = job.startedAt ? Math.max(0, (Date.now() - job.startedAt) / 1000) : 0;
  const running = job.status === "running" || job.status === "ready";
  const estimatedSeconds = Number(job.plan.estimatedSeconds) || 0;
  const insideEstimate = job.status === "running" && estimatedSeconds && elapsedSeconds < estimatedSeconds;
  return {
    ...job.plan,
    elapsedMinutes: running ? Math.round(elapsedSeconds / 60) : 0,
    // Pasado el estimado ya no queda nada que restar: decir «le falta 1 min»
    // eternamente era la causa de la sospecha de escena colgada.
    remainingMinutes: insideEstimate ? Math.max(1, Math.round((estimatedSeconds - elapsedSeconds) / 60)) : undefined,
    overEstimate: job.status === "running" && estimatedSeconds ? elapsedSeconds >= estimatedSeconds : false,
  };
}

function requestedDuration(body) {
  const seconds = Number(body.durationSec);
  if (Number.isFinite(seconds) && seconds > 0) return seconds;
  // Retrocompatible: quien mande frames, manda su duración en segundos.
  const frames = Number(body.lengthFrames);
  if (Number.isFinite(frames) && frames > 0) return frames / clampFps(body.fps);
  return 8;
}

function renderBudgetMinutes() {
  return config.renderBudgetMinutes || hostTier().budgetMinutes;
}

function currentQualityPresetId() {
  return config.qualityPresetId || qualityPresetByIdOrMinutes(renderBudgetMinutes())?.id || "equilibrado";
}

function engineForSelection(selection, installed = {}) {
  const artifact = selection.artifact;
  const isBase = artifact.id === BASE_ENGINE_ID;
  const state = installed[artifact.id] || {};
  return {
    artifactId: artifact.id,
    label: artifact.label,
    // El base usa los nombres que escribió el instalador; un Turbo se resuelve contra
    // los archivos que realmente hay en disco, para no apuntar a un modelo que no está.
    unet: isBase ? String(config.models.unet || "") : String(state.unet || ""),
    clip: isBase ? String(config.models.clip || "") : String(state.clip || ""),
    sampler: artifact.sampler,
    vaeDecodeClass: artifact.vaeDecodeClass,
    vaeTiled: Boolean(artifact.vaeTiled),
  };
}

function qualitySelection() {
  const tier = hostTier();
  const installed = listInstalledArtifacts({ config, tier });
  const selection = selectArtifactForPreset(currentQualityPresetId(), installed, tier);
  return { ...selection, tier, installed, engine: engineForSelection(selection, installed) };
}

/** El coste por paso es por motor: el de Turbo no puede corregir al modelo base. */
function kForEngine(artifactId = BASE_ENGINE_ID) {
  return kForArtifact(config.kCalibrated, artifactId);
}

function diskFreeGb() {
  try {
    const stat = fs.statfsSync(os.homedir());
    return Math.floor((stat.bavail * stat.bsize) / (1024 ** 3));
  } catch {
    return null;
  }
}

function qualityPayload() {
  const selection = qualitySelection();
  const { tier, installed, artifact } = selection;
  const engine = selection.engine;
  const minutes = selection.preset.minutes;
  const freeGb = diskFreeGb();
  const nextPlan = planLocalRender({
    durationSec: 8,
    budgetMinutes: minutes,
    tier,
    k: kForEngine(artifact.id),
    artifact,
  });
  return {
    tierId: tier.id,
    ramGb: Math.round(hostRamGb()),
    budgetMinutes: minutes,
    presetId: selection.preset.id,
    defaultBudgetMinutes: tier.budgetMinutes,
    presets: QUALITY_PRESETS.map((preset) => {
      const choice = selectArtifactForPreset(preset.id, installed, tier);
      return {
        id: preset.id,
        minutes: preset.minutes,
        label: preset.label,
        engineId: choice.artifact.id,
        engineLabel: choice.artifact.label,
        note: choice.fallbackNote || "",
      };
    }),
    // La escalera: qué motor es cada preset, si ya está instalado y cuánto falta.
    engines: ENGINE_ARTIFACTS.map((rung) => {
      const state = installed[rung.id] || {};
      const extraGb = Number(rung.requiredGb) || 0;
      return {
        id: rung.id,
        label: rung.label,
        presetIds: QUALITY_PRESETS.filter((p) => p.engineIds.includes(rung.id)).map((p) => p.id),
        steps: [rung.stepsMin, rung.stepsMax],
        longEdgeCap: tier.longEdge + (Number(rung.longEdgeBonus) || 0),
        extraGb,
        installed: Boolean(state.installed),
        missing: state.missing || [],
        disponibleParaElEquipo: rung.id === BASE_ENGINE_ID ? true : state.disponibleParaElEquipo !== false,
        alcanzaElDisco: !extraGb || !Number.isFinite(freeGb) ? true : freeGb >= extraGb + 3,
      };
    }),
    diskFreeGb: freeGb,
    engine: {
      artifactId: engine.artifactId,
      label: engine.label,
      unet: engine.unet || null,
      clip: engine.clip || null,
      fallbackNote: selection.fallbackNote || "",
    },
    upscaleLongEdge: upscaleTargetForTier(tier),
    clipFinish: clipPolisher?.kind || null,
    // Movimiento suave: se mezclan grupos de fotogramas al reescalar, sin GPU extra.
    smoothMotion: config.smoothMotion !== false,
    smoothTargetFps: SMOOTH_OUTPUT_FPS,
    // Cadencia real de la próxima escena mezclando (0 = no aplica, p. ej. a 16 fps).
    smoothNextFps: smoothFpsFor({
      sourceFps: Number(nextPlan.fps) || 0,
      smoothMotion: config.smoothMotion !== false && Boolean(clipPolisher),
    }),
    maxNativeLongEdge: tier.longEdge + (Number(artifact.longEdgeBonus) || 0),
    kCalibrated: config.kCalibrated || null,
    nextPlan,
  };
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || "";
  const corsHeaders = {};
  if (originAllowed(origin)) {
    corsHeaders["Access-Control-Allow-Origin"] = origin;
    corsHeaders["Vary"] = "Origin";
    corsHeaders["Access-Control-Allow-Headers"] = "Content-Type, X-Local-Video-Token";
    corsHeaders["Access-Control-Allow-Methods"] = "GET, POST, PATCH, DELETE, OPTIONS";
    corsHeaders["Access-Control-Max-Age"] = "600";
  }
  if (req.method === "OPTIONS") return send(res, 204, null, corsHeaders);

  const url = new URL(req.url, `http://${HOST}`);
  const parts = url.pathname.split("/").filter(Boolean);

  try {
    if (req.method === "GET" && url.pathname === "/health") {
      const comfyReachable = await comfyReachabilityForHealth();
      const selection = qualitySelection();
      return sendJson(res, 200, {
        ok: true,
        version: VERSION,
        model: LOCAL_VIDEO_MODEL_ID,
        models: [LOCAL_VIDEO_MODEL_ID],
        comfyReachable,
        engineInstalled: Boolean(config.models.unet),
        // Qué motor usará la próxima escena, para que el editor lo pueda decir sin
        // abrir la consola (y no prometa Turbo cuando aún no se descargó).
        engine: {
          artifactId: selection.engine.artifactId,
          label: selection.engine.label,
          unet: selection.engine.unet || null,
          presetId: selection.preset.id,
          fallbackNote: selection.fallbackNote || "",
          // Movimiento suave: se aplica al reescalar, no en la GPU. El techo es 24 fps;
          // la cadencia real de cada escena la dice /quality (smoothNextFps).
          smoothMotion: config.smoothMotion !== false,
          smoothTargetFps: SMOOTH_OUTPUT_FPS,
        },
        gpu: "apple-silicon (ComfyUI Metal)",
        busy: Boolean(runningJobId),
      }, corsHeaders);
    }

    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(302, { Location: "/consola" });
      return res.end();
    }

    // La consola se sirve sin cabeceras CORS a propósito: nadie más puede leer el
    // HTML (y su clave de consola), solo la ventana que el usuario abrió.
    if (req.method === "GET" && url.pathname === "/consola") {
      const html = renderConsolePage({ version: VERSION, consoleKey: CONSOLE_KEY, token: config.token, comfyBase: COMFY_BASE });
      return send(res, 200, html, { "Content-Type": "text/html; charset=utf-8" });
    }
    if (req.method === "GET" && url.pathname === "/consola/logo.png") {
      try {
        const logo = fs.readFileSync(path.join(HERE, "assets", "snoopy.png"));
        return send(res, 200, logo, { "Content-Type": "image/png", "Content-Length": logo.length });
      } catch {
        return send(res, 404, null);
      }
    }

    if (req.method === "POST" && url.pathname === "/pair/request") {
      const pair = createPairRequest(req.headers.origin || "");
      // Un editor ya conectado que vuelve a pedir código sigue apareciendo como activo.
      touchPairedOrigin(req.headers.origin);
      return sendJson(res, 201, { pairId: pair.id, code: formatPairCode(pair.code), expiresIn: Math.round(PAIR_TTL_MS / 1000) }, corsHeaders);
    }
    if (req.method === "POST" && url.pathname === "/pair/status") {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      prunePairs();
      const pair = pendingPairs.get(String(body.pairId || ""));
      if (!pair) return sendJson(res, 404, { error: "La solicitud de conexión expiró; pide un código nuevo." }, corsHeaders);
      if (pair.confirmed) return sendJson(res, 200, { status: "paired", token: config.token }, corsHeaders);
      if (Date.now() > pair.expiresAt) return sendJson(res, 200, { status: "expired" }, corsHeaders);
      return sendJson(res, 200, { status: "pending" }, corsHeaders);
    }
    if (req.method === "POST" && url.pathname === "/pair/confirm") {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      if (String(body.consoleKey || "") !== CONSOLE_KEY) {
        return sendJson(res, 403, { error: "El código solo puede confirmarse desde la consola de Servidor Snoopy." }, corsHeaders);
      }
      const pair = confirmPairCode(body.code);
      if (!pair) return sendJson(res, 404, { error: "Código inválido o expirado. Pide uno nuevo en el sitio." }, corsHeaders);
      // Desde aquí Snoopy recuerda este editor: reiniciar la app no lo deja fuera.
      rememberPairedOrigin(pair.origin);
      return sendJson(res, 200, { ok: true, origin: pair.origin, editors: editorsPayload() }, corsHeaders);
    }
    if (req.method === "GET" && url.pathname === "/pair/pending") {
      if (String(req.headers["x-console-key"] || "") !== CONSOLE_KEY) return sendJson(res, 403, { error: "Falta la clave de consola." }, corsHeaders);
      prunePairs();
      // Solo las solicitudes que aún esperan código. Las ya confirmadas viven en `editors`.
      const pairs = [...pendingPairs.values()]
        .filter((p) => !p.confirmed && Date.now() < p.expiresAt)
        .map((p) => ({ pairId: p.id, origin: p.origin || "origen desconocido", code: formatPairCode(p.code), secondsLeft: Math.max(0, Math.round((p.expiresAt - Date.now()) / 1000)) }));
      return sendJson(res, 200, { pairs, editors: editorsPayload() }, corsHeaders);
    }
    if (req.method === "POST" && url.pathname === "/pair/disconnect") {
      if (String(req.headers["x-console-key"] || "") !== CONSOLE_KEY) return sendJson(res, 403, { error: "Falta la clave de consola." }, corsHeaders);
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      const origin = normalizeOrigin(body.origin);
      if (!origin) return sendJson(res, 400, { error: "Dime qué editor quieres desconectar." }, corsHeaders);
      const removed = forgetPairedOrigin(origin);
      // Un editor desconectado no puede quedar esperando su propio código.
      for (const [id, pair] of pendingPairs) {
        if (normalizeOrigin(pair.origin) === origin) pendingPairs.delete(id);
      }
      if (!removed) return sendJson(res, 404, { error: "Ese editor ya no está conectado." }, corsHeaders);
      return sendJson(res, 200, { ok: true, origin, editors: editorsPayload() }, corsHeaders);
    }
    // Un clic en la consola → enlace de conexión; el editor lo canjea solo y queda listo.
    if (req.method === "POST" && url.pathname === "/pair/invite") {
      if (String(req.headers["x-console-key"] || "") !== CONSOLE_KEY) return sendJson(res, 403, { error: "Falta la clave de consola." }, corsHeaders);
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      const origin = normalizeOrigin(body.origin) || config.pairedOrigins[0]?.origin || "";
      const invite = createInvite();
      return sendJson(res, 201, {
        invite,
        origin: origin || DEFAULT_ALLOWED_ORIGINS[0],
        url: editorConnectUrl(origin, invite),
        secondsLeft: Math.round(INVITE_TTL_MS / 1000),
      }, corsHeaders);
    }
    if (req.method === "POST" && url.pathname === "/pair/redeem") {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      const origin = normalizeOrigin(req.headers.origin);
      if (!origin) return sendJson(res, 400, { error: "El enlace de conexión solo funciona abriéndolo en el navegador." }, corsHeaders);
      if (!originAllowed(origin)) {
        return sendJson(res, 403, { error: "Ese sitio no puede conectarse a Servidor Snoopy; usa charly-brown.web.app o el sitio local." }, corsHeaders);
      }
      if (!redeemInvite(body.invite, origin)) {
        return sendJson(res, 404, { error: "Ese enlace de conexión ya se usó o expiró. Pide uno nuevo en la consola." }, corsHeaders);
      }
      return sendJson(res, 200, { status: "paired", token: config.token, origin }, corsHeaders);
    }
    // El código caduca solo, pero si el editor ya no viene el usuario merece poder
    // cerrarlo ya desde la consola en vez de ver la cuenta atrás colgada.
    if (req.method === "POST" && url.pathname === "/pair/cancel-code") {
      if (String(req.headers["x-console-key"] || "") !== CONSOLE_KEY) return sendJson(res, 403, { error: "Falta la clave de consola." }, corsHeaders);
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      const wanted = String(body.pairId || "");
      const code = String(body.code || "").replace(/\D/g, "");
      let target = null;
      for (const [id, pair] of pendingPairs) {
        if (pair.confirmed) continue;
        if ((wanted && id === wanted) || (code && String(pair.code) === code)) { target = id; break; }
      }
      if (!target) return sendJson(res, 404, { error: "Ese código ya no está esperando." }, corsHeaders);
      pendingPairs.delete(target);
      return sendJson(res, 200, { ok: true }, corsHeaders);
    }

    // Cancelar una escena desde la consola. La ruta del sitio exige el token de
    // emparejamiento, pero Snoopy puede estar generando para un editor que ya cerró
    // la pestaña: la dueña de la GPU siempre debe poder detenerla.
    if (req.method === "POST" && url.pathname === "/scene/cancel") {
      if (String(req.headers["x-console-key"] || "") !== CONSOLE_KEY) return sendJson(res, 403, { error: "Falta la clave de consola." }, corsHeaders);
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      const jobId = String(body.jobId || "");
      const active = [...jobs.values()].filter((j) => j.status === "queued" || j.status === "running");
      const job = jobId ? jobs.get(jobId) : active.find((j) => j.status === "running") || active[0];
      if (!job) return sendJson(res, 404, { error: "Ahora mismo no hay ninguna escena en marcha." }, corsHeaders);
      if (job.status !== "queued" && job.status !== "running") {
        return sendJson(res, 409, { error: `Esa escena ya terminó (estado: ${job.status}).` }, corsHeaders);
      }
      await cancelJob(job);
      return sendJson(res, 200, publicJob(job), corsHeaders);
    }

    // Rutas del instalador: solo la consola (X-Console-Key) puede iniciarlas; no usan
    // el token de emparejamiento porque el motor aún no está instalado.
    if (req.method === "POST" && url.pathname === "/install/start") {
      if (String(req.headers["x-console-key"] || "") !== CONSOLE_KEY) {
        return sendJson(res, 403, { error: "La instalación solo se inicia desde la consola de Servidor Snoopy." }, corsHeaders);
      }
      if (!fs.existsSync(INSTALLER_PATH)) {
        return sendJson(res, 500, { error: "Falta el instalador del motor (engine-installer.mjs)." }, corsHeaders);
      }
      return sendJson(res, 202, startEngineInstall(), corsHeaders);
    }
    if (req.method === "GET" && url.pathname === "/install/status") {
      if (String(req.headers["x-console-key"] || "") !== CONSOLE_KEY) {
        return sendJson(res, 403, { error: "Falta la clave de consola." }, corsHeaders);
      }
      return sendJson(res, 200, installStatusPayload(), corsHeaders);
    }

    // Escalera de calidad: bajar el peldaño extra (nivel Rápido = Turbo) sin tocar el
    // paquete base ya instalado. Es el mismo instalador en modo «--ladder»: solo
    // descarga archivos, no vuelve a clonar ComfyUI ni a instalar Python.
    if (req.method === "POST" && url.pathname === "/engine/ladder/download") {
      if (String(req.headers["x-console-key"] || "") !== CONSOLE_KEY) {
        return sendJson(res, 403, { error: "Solo la consola de Servidor Snoopy descarga motores." }, corsHeaders);
      }
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      const artifact = engineArtifactById(body.artifactId);
      if (!artifact.lazyDownload) {
        return sendJson(res, 400, { error: "Ese nivel ya viene incluido en la instalación del motor; no hay nada que descargar." }, corsHeaders);
      }
      const selection = qualitySelection();
      if (selection.installed[artifact.id]?.installed) {
        return sendJson(res, 200, { ...installStatusPayload(), done: true, percent: 100, message: `${artifact.label} ya está instalado.` }, corsHeaders);
      }
      const refuse = (message) => sendJson(res, 400, { error: message }, corsHeaders);
      if (selection.tier.id === "8gb") {
        return refuse(`Tu Mac de 8 GB no aguanta ${artifact.label}: el nivel Rápido se queda en el modelo base.`);
      }
      if (!selection.installed[BASE_ENGINE_ID]?.installed) {
        return refuse("Primero instala el motor con el botón principal; en cuanto termine podrás bajar el nivel Rápido.");
      }
      if (!fs.existsSync(INSTALLER_PATH)) {
        return sendJson(res, 500, { error: "Falta el instalador del motor (engine-installer.mjs)." }, corsHeaders);
      }
      const needGb = Number(artifact.requiredGb) || 0;
      const freeGb = diskFreeGb();
      if (Number.isFinite(freeGb) && freeGb < needGb + 3) {
        return refuse(`Falta espacio: hay ~${freeGb} GB libres y este nivel pide ~${needGb + 3} GB de margen. Borra clips viejos o películas y pulsa Reintentar.`);
      }
      return sendJson(res, 202, startEngineInstall({
        extraArgs: ["--ladder", artifact.id],
        target: artifact.id,
        message: `Descargando ${artifact.label} (${needGb} GB)…`,
      }), corsHeaders);
    }
    if (req.method === "GET" && url.pathname === "/engine/ladder/status") {
      if (String(req.headers["x-console-key"] || "") !== CONSOLE_KEY) {
        return sendJson(res, 403, { error: "Falta la clave de consola." }, corsHeaders);
      }
      const payload = qualityPayload();
      return sendJson(res, 200, {
        ...installStatusPayload(),
        presetId: payload.presetId,
        engines: payload.engines,
        diskFreeGb: payload.diskFreeGb,
      }, corsHeaders);
    }

    // Memoria: solo la consola, y sin tocar ComfyUI en la lectura para no bloquear.
    if (req.method === "GET" && url.pathname === "/memory") {
      if (String(req.headers["x-console-key"] || "") !== CONSOLE_KEY) {
        return sendJson(res, 403, { error: "Falta la clave de consola." }, corsHeaders);
      }
      return sendJson(res, 200, memoryPayload(), corsHeaders);
    }
    if (req.method === "POST" && url.pathname === "/memory/free") {
      if (String(req.headers["x-console-key"] || "") !== CONSOLE_KEY) {
        return sendJson(res, 403, { error: "Solo la consola de Servidor Snoopy puede liberar memoria." }, corsHeaders);
      }
      if (runningJobId) {
        return sendJson(res, 409, { error: "Snoopy está generando un video ahora mismo y necesita toda la memoria. En cuanto termine la suelta solo; puedes seguirla viendo aquí." }, corsHeaders);
      }
      try {
        await releaseEngineMemory();
      } catch (error) {
        return sendJson(res, 502, { error: `ComfyUI no respondió: ${error.message.slice(0, 160)}` }, corsHeaders);
      }
      return sendJson(res, 200, { ...memoryPayload({ busy: false }), comfyReleased: true }, corsHeaders);
    }

    // Calidad: cuánto tiempo le pagamos a la GPU por escena. Solo desde la consola.
    if (req.method === "GET" && url.pathname === "/quality") {
      if (String(req.headers["x-console-key"] || "") !== CONSOLE_KEY) {
        return sendJson(res, 403, { error: "Falta la clave de consola." }, corsHeaders);
      }
      return sendJson(res, 200, qualityPayload(), corsHeaders);
    }
    if (req.method === "POST" && url.pathname === "/quality") {
      if (String(req.headers["x-console-key"] || "") !== CONSOLE_KEY) {
        return sendJson(res, 403, { error: "Solo la consola de Servidor Snoopy cambia la calidad." }, corsHeaders);
      }
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      const preset = qualityPresetByIdOrMinutes(body.preset ?? body.budgetMinutes);
      // El interruptor de movimiento suave puede venir solo: no obliga a reelegir preset.
      const wantsSmooth = typeof body.smoothMotion === "boolean";
      if (!preset && !wantsSmooth) {
        return sendJson(res, 400, { error: `Elige ${QUALITY_PRESETS.map((p) => `«${p.id}»`).join(", ")}.` }, corsHeaders);
      }
      const patch = {};
      if (preset) {
        patch.renderBudgetMinutes = preset.minutes;
        patch.qualityPresetId = preset.id;
      }
      if (wantsSmooth) patch.smoothMotion = body.smoothMotion;
      saveConfigKeys(patch);
      return sendJson(res, 200, qualityPayload(), corsHeaders);
    }

    // Cola para la consola: los planes con su reloj puesto, para no esperar a ciegas.
    if (req.method === "GET" && url.pathname === "/queue") {
      if (String(req.headers["x-console-key"] || "") !== CONSOLE_KEY) {
        return sendJson(res, 403, { error: "Falta la clave de consola." }, corsHeaders);
      }
      const all = [...jobs.values()];
      const done = all.filter((job) => job.status !== "queued" && job.status !== "running")
        .sort((a, b) => b.updatedAt - a.updatedAt);
      return sendJson(res, 200, {
        busy: Boolean(runningJobId),
        jobs: all.filter((job) => job.status === "queued" || job.status === "running").map(publicJob),
        last: done[0] ? publicJob(done[0]) : null,
      }, corsHeaders);
    }

    // Biblioteca de clips guardados en este Mac, para volver a verlos sin depender del sitio.
    if (req.method === "GET" && (url.pathname === "/clips" || url.pathname.startsWith("/clips/"))) {
      if (String(req.headers["x-console-key"] || "") !== CONSOLE_KEY) {
        return sendJson(res, 403, { error: "Falta la clave de consola." }, corsHeaders);
      }
      const clipId = url.pathname === "/clips" ? "" : decodeURIComponent(url.pathname.slice("/clips/".length));
      if (!clipId) return sendJson(res, 200, { dir: CLIPS_DIR, clips: listClips() }, corsHeaders);
      if (!CLIP_ID_RE.test(clipId)) return sendJson(res, 400, { error: "Nombre de clip inválido." }, corsHeaders);
      const record = listClips().find((c) => c.id === clipId);
      if (!record) return sendJson(res, 404, { error: "Ese clip ya no está en la biblioteca." }, corsHeaders);
      const buffer = fs.readFileSync(path.join(CLIPS_DIR, record.file));
      res.writeHead(200, {
        "Content-Type": record.mimeType || "video/mp4",
        "Content-Length": buffer.length,
        "Content-Disposition": `inline; filename="${record.file}"`,
        ...corsHeaders,
      });
      return res.end(buffer);
    }

    const token = req.headers["x-local-video-token"];
    if (token !== config.token) {
      return sendJson(res, 401, { error: "Falta o no coincide el token de emparejamiento. Pégalo en Ajustes de video local." }, corsHeaders);
    }
    // El token abre la puerta, pero un editor desconectado desde la consola no
    // puede seguir usando el motor aunque conserve la clave.
    if (!originAuthorized(origin)) {
      return sendJson(res, 403, { error: "Este editor está desconectado de Servidor Snoopy. Pulsa «Conectar con Snoopy» para generar el código otra vez." }, corsHeaders);
    }
    touchPairedOrigin(origin);

    if (req.method === "POST" && url.pathname === "/jobs") {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      const mode = body.mode === "t2v" ? "t2v" : "i2v";
      if (mode === "t2v") {
        return sendJson(res, 400, { error: "El modo t2v local estará disponible en una versión posterior. Usa image-to-video con un primer frame." }, corsHeaders);
      }
      if (!body.firstFrame || typeof body.prompt !== "string" || !body.prompt.trim()) {
        return sendJson(res, 400, { error: "Se requieren prompt y firstFrame (imagen base64 o data URL)." }, corsHeaders);
      }
      const durationSec = requestedDuration(body);
      const portrait = body.portrait === true
        || String(body.aspectRatio || "") === "9:16"
        || Number(body.height) > Number(body.width);
      // El plan es local: duración pedida, techo de resolución del equipo, minutos
      // disponibles y motor del preset elegido. El sitio ya no decide píxeles, así que
      // no puede prometer 1080p nativos que esta GPU no puede pagar.
      const selection = qualitySelection();
      const plan = planLocalRender({
        durationSec,
        portrait,
        budgetMinutes: selection.preset.minutes,
        tier: selection.tier,
        k: kForEngine(selection.artifact.id),
        artifact: selection.artifact,
      });
      const active = [...jobs.values()].filter((j) => j.status === "queued" || j.status === "running");
      if (active.length >= 2) {
        return sendJson(res, 429, { error: "La cola local está llena (1 en curso + 1 en espera)." }, corsHeaders);
      }
      const jobId = newJob({
        mode,
        prompt: String(body.prompt).slice(0, 4000),
        negativePrompt: String(body.negativePrompt || "").slice(0, 1000),
        firstFrame: body.firstFrame,
        width: plan.width,
        height: plan.height,
        lengthFrames: plan.lengthFrames,
        fps: plan.fps,
        steps: plan.steps,
        seed: body.seed,
      }, plan, selection.engine);
      if (!runningJobId) runJob(jobId);
      return sendJson(res, 202, { jobId, plan }, corsHeaders);
    }

    // Clips que Snoopy ya terminó pero que nunca llegaron a la biblioteca del sitio
    // (se reinició el motor o se cerró la pestaña). Van con el token de emparejamiento,
    // no con la clave de consola, porque quien los rescata es el editor.
    if (parts[0] === "jobs" && parts.length >= 2) {
      const jobId = parts[1];
      const job = jobs.get(jobId);

      // El sitio ya subió el clip a Storage: le ponemos nombre y enlace a la ficha local.
      // Va antes de buscar el job en memoria porque el enlace sirve aunque Snoopy se
      // haya reiniciado entretanto.
      if (parts.length === 2 && req.method === "PATCH") {
        const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
        const clip = linkClip(jobId, { title: body.title, storageUrl: body.storageUrl });
        if (!clip) return sendJson(res, 404, { error: "Esa escena aún no está en la biblioteca de Snoopy." }, corsHeaders);
        return sendJson(res, 200, { ok: true, clip }, corsHeaders);
      }

      if (parts[2] === "video" && req.method === "GET") {
        if (job?.status === "ready" && job.video?.buffer) {
          return send(res, 200, job.video.buffer, { "Content-Type": job.video.mimeType, "Content-Length": job.video.buffer.length, ...corsHeaders });
        }
        const buffer = readDiskClip(diskClipForJob(jobId));
        if (buffer) {
          return send(res, 200, buffer, { "Content-Type": "video/mp4", "Content-Length": buffer.length, ...corsHeaders });
        }
        if (!job) return sendJson(res, 404, { error: "Job desconocido." }, corsHeaders);
        return sendJson(res, 409, { error: `El video aún no está listo (estado: ${job.status}).` }, corsHeaders);
      }
      if (parts[2] === "cancel" && req.method === "POST") {
        if (!job) return sendJson(res, 404, { error: "Job desconocido." }, corsHeaders);
        await cancelJob(job);
        return sendJson(res, 200, publicJob(job), corsHeaders);
      }
      if (req.method === "GET") {
        if (job) return sendJson(res, 200, publicJob(job), corsHeaders);
        const record = diskClipForJob(jobId);
        if (record) return sendJson(res, 200, diskJobView(record), corsHeaders);
        return sendJson(res, 404, { error: "Job desconocido." }, corsHeaders);
      }
    }

    return sendJson(res, 404, { error: "Ruta inexistente." }, corsHeaders);
  } catch (error) {
    const status = error.statusCode || 500;
    return sendJson(res, status, { error: error.message || "Error interno del motor local." }, corsHeaders);
  }
});

export { server, jobs, config, CONSOLE_KEY, pendingPairs, installState, CLIPS_DIR, listClips };

// Se arranca solo cuando el usuario lo ejecuta directo (node server.mjs). Comparamos
// la ruta real porque macOS monta /tmp y los sitios movidos tras enlaces simbólicos:
// con la ruta lógica distinta el servidor se salía listen() y no decía nada.
function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  if (import.meta.url === pathToFileURL(entry).href) return true;
  try {
    return import.meta.url === pathToFileURL(fs.realpathSync(entry)).href;
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  server.listen(PORT, HOST, () => {
    console.log(`[servidor-snoopy] v${VERSION} escuchando en http://${HOST}:${PORT}`);
    console.log(`[servidor-snoopy] Abre la consola para conectar Snoopy Editor: http://${HOST}:${PORT}/consola`);
    console.log(`[servidor-snoopy] ComfyUI: ${COMFY_BASE}`);
    console.log(`[servidor-snoopy] (Clave manual de respaldo en ${CONFIG_FILE})`);
  });
}
