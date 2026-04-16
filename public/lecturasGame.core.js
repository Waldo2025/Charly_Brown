import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getFirestore, collection, getDocs, query, where, doc, getDoc, setDoc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { getStorage, ref as storageRef, uploadString, getDownloadURL, listAll } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js";
import { firebaseWebConfig, assertFirebaseWebConfig } from "./firebase-web-config.js";
import { buildApiUrl } from "./api-client.js";
import { openLecturasGameRankingView, closeLecturasGameRankingView } from "./lecturasGame-ranking.js";
const LECTURAS_GAME_BOOT_FORCE = "";
if (LECTURAS_GAME_BOOT_FORCE) {
  window.__LECTURAS_GAME_FORCE_GAME__ = window.__LECTURAS_GAME_FORCE_GAME__ || LECTURAS_GAME_BOOT_FORCE;
}

function _svcNormalizeGameId(gameId = "") {
  const key = String(gameId || "").trim().toLowerCase();
  if (key === "order" || key === "ordena") return "order";
  if (key === "trace" || key === "trazos") return "trace";
  if (key === "caps" || key === "mayusculas" || key === "caza-mayusculas") return "caps";
  if (key === "mineblox" || key === "minecraft" || key === "roblox") return "mineblox";
  return "synonyms";
}

function resolveForcedGameId(source = "") {
  if (!source) return "";
  const key = String(source || "").trim().toLowerCase();
  if (!key) return "";
  if (["synonyms", "sinonimos", "sinonimo", "protege"].includes(key)) return "synonyms";
  if (["order", "atrapa", "atrapa-sinonimo", "atrapa-sinonimos"].includes(key)) return "order";
  if (["trace", "trazos", "trazo", "letras"].includes(key)) return "trace";
  if (["caps", "mayusculas", "caza-mayusculas", "caza-mayuscula"].includes(key)) return "caps";
  if (["mineblox", "minecraft", "roblox", "salon"].includes(key)) return "mineblox";
  return "";
}

function createLecturasGameServiceRegistry(deps = {}) {
  const buildSynonymsRound = deps.buildSynonymsRound;
  const buildOrderRound = deps.buildOrderRound;
  const buildTraceRound = deps.buildTraceRound;
  const buildCapsRound = deps.buildCapsRound;
  const applyOrderStageWords = deps.applyOrderStageWords;
  return {
    synonyms: {
      id: "synonyms",
      title: "PROTEGE AL SINÓNIMO",
      buildRound(lectura, runtime) {
        return typeof buildSynonymsRound === "function" ? buildSynonymsRound(lectura, runtime) : null;
      }
    },
    order: {
      id: "order",
      title: "ATRAPA EL SINÓNIMO",
      buildRound(lectura, runtime) {
        const round = typeof buildOrderRound === "function" ? buildOrderRound(lectura, runtime) : null;
        if (round && typeof applyOrderStageWords === "function") applyOrderStageWords(runtime);
        return round;
      }
    },
    trace: {
      id: "trace",
      title: "TRAZOS DE LETRAS",
      buildRound(lectura, runtime) {
        return typeof buildTraceRound === "function" ? buildTraceRound(lectura, runtime) : null;
      }
    },
    caps: {
      id: "caps",
      title: "CAZA MAYÚSCULAS",
      buildRound(lectura, runtime) {
        return typeof buildCapsRound === "function" ? buildCapsRound(lectura, runtime) : null;
      }
    },
    mineblox: {
      id: "mineblox",
      title: "ASCRAFT (BETA)",
      buildRound() { return null; }
    }
  };
}

function resolveLecturasGameService(gameId = "", registry = {}) {
  const id = _svcNormalizeGameId(gameId);
  return registry[id] || registry.synonyms || null;
}

const firebaseConfig = assertFirebaseWebConfig(firebaseWebConfig);
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);
window.cbFirebaseApp = app;
window.cbFirestore = db;
void auth;
void storage;

let runtimeConfigLoadPromise = null;

async function ensureRuntimeConfigLoaded() {
  if (window.__CHARLY_CONFIG__) return;
  if (runtimeConfigLoadPromise) {
    await runtimeConfigLoadPromise;
    return;
  }
  runtimeConfigLoadPromise = new Promise((resolve) => {
    (async () => {
      try {
        const host = String(window.location.hostname || "").toLowerCase();
        const isLocalHost = host === "127.0.0.1" || host === "localhost";
        const allowRuntimeConfig = isLocalHost || window.__CHARLY_ENABLE_RUNTIME_CONFIG__ === true;
        if (!allowRuntimeConfig) {
          resolve();
          return;
        }
        const stamp = Date.now();
        const candidates = [
          `./config.local.js?v=${stamp}`,
          `../config.local.js?v=${stamp}`,
          `/config.local.js?v=${stamp}`,
          `/public/config.local.js?v=${stamp}`
        ];
        const canUseJsMime = (contentType = "") => {
          const ct = String(contentType || "").toLowerCase();
          if (!ct) return true;
          return ct.includes("javascript") || ct.includes("text/plain") || ct.includes("application/octet-stream");
        };
        for (const url of candidates) {
          if (window.__CHARLY_CONFIG__) break;
          try {
            const probe = await fetch(url, { method: "GET", cache: "no-store" });
            if (!probe.ok) continue;
            if (!canUseJsMime(probe.headers.get("content-type"))) continue;
            await new Promise((done) => {
              const s = document.createElement("script");
              s.src = url;
              s.async = true;
              s.onload = () => done();
              s.onerror = () => done();
              document.head.appendChild(s);
              setTimeout(done, 1200);
            });
          } catch (_) {
            // try next
          }
        }
      } catch (_) {
        // noop
      } finally {
        resolve();
      }
    })();
  });
  await runtimeConfigLoadPromise;
}

function getRuntimeGeminiApiKey() {
  return "";
}

function hasRuntimeGeminiApiKey() {
  return false;
}

window.cbLecturasGameRuntime = {
  ensureRuntimeConfigLoaded,
  getRuntimeGeminiApiKey,
  hasRuntimeGeminiApiKey
};

const CHARLY_GLOBAL_MIC_CHANNEL = "charly-global-mic-control";
const CHARLY_GLOBAL_MIC_STORAGE_KEY = "cb_global_mic_control_v1";
const CHARLY_GLOBAL_MIC_OWNER_GAME = "lecturas-game";
let _lecturasGameGlobalMicChannel = null;

function _lecturasGameGetGlobalMicChannel() {
  if (typeof BroadcastChannel !== "function") return null;
  if (_lecturasGameGlobalMicChannel) return _lecturasGameGlobalMicChannel;
  try {
    _lecturasGameGlobalMicChannel = new BroadcastChannel(CHARLY_GLOBAL_MIC_CHANNEL);
  } catch (_) {
    _lecturasGameGlobalMicChannel = null;
  }
  return _lecturasGameGlobalMicChannel;
}

function _lecturasGameBroadcastGlobalMicRelease(reason = "order-reading") {
  const payload = {
    type: "release_mic",
    owner: CHARLY_GLOBAL_MIC_OWNER_GAME,
    reason: String(reason || "order-reading"),
    ts: Date.now()
  };
  try {
    const channel = _lecturasGameGetGlobalMicChannel();
    if (channel) channel.postMessage(payload);
  } catch (_) {
    // no-op
  }
  try {
    localStorage.setItem(CHARLY_GLOBAL_MIC_STORAGE_KEY, JSON.stringify(payload));
    localStorage.removeItem(CHARLY_GLOBAL_MIC_STORAGE_KEY);
  } catch (_) {
    // no-op
  }
}

const GRADE_TEXT_MAP = {
  primero: "1",
  segundo: "2",
  tercero: "3",
  cuarto: "4",
  quinto: "5",
  sexto: "6"
};

const GRADE_LABEL_MAP = {
  "1": "Primero",
  "2": "Segundo",
  "3": "Tercero",
  "4": "Cuarto",
  "5": "Quinto",
  "6": "Sexto",
  "7": "Séptimo",
  "8": "Octavo",
  "9": "Noveno",
  "10": "Décimo",
  "11": "Undécimo",
  "12": "Duodécimo"
};

const LECTURAS_GAME_STOP_WORDS = new Set([
  "EL", "LA", "LOS", "LAS", "UN", "UNA", "UNOS", "UNAS", "Y", "O", "U", "DE", "DEL", "AL",
  "EN", "POR", "PARA", "CON", "SIN", "SOBRE", "ENTRE", "HASTA", "DESDE", "QUE", "QUIEN",
  "QUIENES", "CUAL", "CUALES", "COMO", "CUANDO", "DONDE", "AQUI", "ALLI", "ESTE", "ESTA",
  "ESTOS", "ESTAS", "ESE", "ESA", "ESOS", "ESAS", "AQUEL", "AQUELLA", "AQUELLOS", "AQUELLAS",
  "YO", "TU", "ELLOS", "ELLAS", "NOSOTROS", "USTED", "USTEDES", "MI", "TI", "SU", "SUS",
  "SE", "ME", "TE", "LE", "LES", "LO", "HA", "HAN", "ES", "SON", "FUE", "ERAN", "SER",
  "ESTA", "ESTAN", "ESTABA", "ESTABAN", "HAY", "HABIA", "HABIAN", "MUY", "MAS", "MENOS",
  "TAMBIEN", "PERO", "AUNQUE", "SI", "NO", "YA", "A", "E", "DA", "DAN", "DIO", "DICE",
  "DICEN", "PUEDE", "PUEDEN", "FUE"
]);

const LECTURAS_GAME_BASE_SYNONYM_MAP = Object.freeze({
  RAPIDO: ["VELOZ", "LIGERO", "PRONTO"],
  LENTO: ["PAUSADO", "CALMADO"],
  FELIZ: ["ALEGRE", "CONTENTO"],
  TRISTE: ["APENADO", "MELANCOLICO"],
  BONITO: ["HERMOSO", "BELLO", "LINDO"],
  GRANDE: ["ENORME", "GIGANTE"],
  PEQUENO: ["CHICO", "MINIMO"],
  ALTO: ["ELEVADO", "SUBIDO"],
  BAJO: ["INFERIOR", "REDUCIDO"],
  FUERTE: ["ROBUSTO", "PODEROSO"],
  DEBIL: ["FRAGIL", "ENDEBLE"],
  LISTO: ["INTELIGENTE", "SAGAZ"],
  TONTO: ["NECIO", "TORPE"],
  BRILLANTE: ["LUMINOSO", "RESPLANDECIENTE"],
  OSCURO: ["SOMBRIO", "TENEBROSO"],
  CLARO: ["LIMPIDO", "NITIDO"],
  LIMPIO: ["ASEADO", "PULCRO"],
  SUCIO: ["MANCHADO", "IMPURO"],
  CALIENTE: ["ARDIENTE", "TIBIO"],
  FRIO: ["HELADO", "FRESCO"],
  NUEVO: ["RECIENTE", "MODERNO"],
  ANTIGUO: ["VIEJO", "ANCIANO"],
  AMIGO: ["COMPANERO", "ALIADO"],
  ENEMIGO: ["RIVAL", "OPONENTE"],
  CASA: ["HOGAR", "VIVIENDA"],
  CAMINO: ["SENDERO", "RUTA"],
  NIÑO: ["CHICO", "INFANTE"],
  MAESTRO: ["DOCENTE", "PROFESOR"],
  AYUDA: ["APOYO", "AUXILIO"],
  TRABAJO: ["LABOR", "TAREA"],
  IDEA: ["PENSAMIENTO", "OCURRENCIA"],
  MIEDO: ["TEMOR", "SUSTO"],
  VALIENTE: ["AUDAZ", "ATREVIDO"],
  CUIDAR: ["PROTEGER", "GUARDAR"],
  MIRAR: ["OBSERVAR", "VER"],
  HABLAR: ["CONVERSAR", "DIALOGAR"],
  CORRER: ["TROTAR", "APRESURARSE"],
  SALTAR: ["BRINCAR", "BOTAR"]
});

const LECTURAS_GAME_FALLBACK_SYNONYM_BANK = (() => {
  const out = {};
  const add = (left = "", right = "") => {
    const a = _lecturasGameNormalizeWord(left);
    const b = _lecturasGameNormalizeWord(right);
    if (!a || !b || a === b) return;
    if (!Array.isArray(out[a])) out[a] = [];
    if (!Array.isArray(out[b])) out[b] = [];
    if (!out[a].includes(b)) out[a].push(b);
    if (!out[b].includes(a)) out[b].push(a);
  };
  Object.entries(LECTURAS_GAME_BASE_SYNONYM_MAP).forEach(([target, synonyms]) => {
    (Array.isArray(synonyms) ? synonyms : []).forEach((syn) => add(target, syn));
  });
  return Object.freeze(out);
})();

const state = {
  allLecturas: [],
  searchQuery: "",
  lecturaByKey: new Map(),
  downloadStatusByKey: new Map()
};
const LECTURAS_GAME_OFFLINE_META_KEY = "cb_lecturas_game_offline_meta_v1";
const LECTURAS_GAME_OFFLINE_DB_NAME = "cb_lecturas_game_offline_v3";
const LECTURAS_GAME_OFFLINE_DB_VERSION = 3;
const LECTURAS_GAME_OFFLINE_DB_STORE = "lecturas";
const LECTURAS_GAME_OFFLINE_DB_CARDS_STORE = "offlineCards";
const LECTURAS_GAME_OFFLINE_DB_CONFIG_STORE = "offlineConfig";
const LECTURAS_GAME_OFFLINE_CACHE_NAME = "cb-lg-content-20260316a";
const LECTURAS_GAME_OFFLINE_MAX_BYTES = 157286400;
const LECTURAS_GAME_OFFLINE_SCHEMA_VERSION = "v3";
const LECTURAS_GAME_OFFLINE_MIGRATION_KEY = "cb_lecturas_game_offline_migration_v3_done";
const LECTURAS_GAME_OFFLINE_CATALOG_KEY = "__catalog__";
const LECTURAS_GAME_OFFLINE_CONTENT_VERSION = "v3";
const LECTURAS_GAME_PLAYER_PROFILES_KEY = "cb_lecturas_game_players_v1";
const LECTURAS_GAME_SCORE_QUEUE_KEY = "cb_lecturas_game_score_queue_v1";
const LECTURAS_GAME_REALTIME_SYNC_INTERVAL_MS = 12000;
const LECTURAS_GAME_REALTIME_SYNC_MIN_GAP_MS = 10000;
const LECTURAS_GAME_GEMS_PER_SCORE = 120;
const LECTURAS_GAME_GEMS_PER_SCORE_AMOUNT = 1;
const LECTURAS_GAME_LEVEL_CLEAR_GEMS = 2;
const LECTURAS_GAME_SKIP_QUIZ_GEMS_COST = 5;
const LECTURAS_GAME_CARD_COVER_CACHE_KEY = "cb_lecturas_card_cover_cache_v1";
const LECTURAS_TRACE_ACTIVE_READING_KEY = "cb_trace_active_reading_v1";
const LECTURAS_GAME_CARD_COVER_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const LECTURAS_GAME_SHARED_OFFLINE_ASSETS = Object.freeze([
  "/lecturasGame.html",
  "/lecturasGame.js",
  "/lecturasGame.webmanifest",
  "/lecturasGame-synonyms.html",
  "/lecturasGame-trace.html",
  "/lecturasGame.css",
  "/lecturasGame-order.app.js",
  "/lecturasGame-synonyms.app.js",
  "/lecturasGame-trace.app.js",
  "/lecturasGame-caps.app.js",
  "/firebase-web-config.js",
  "/api-client.js",
  "/mindmapBackground.png",
  "/agentePrimero.png",
  "/agenteSegundo.png",
  "/agenteTercero.png",
  "/agenteCuarto.png",
  "/agenteQuinto.png",
  "/agentesexto.png",
  "/logoCharly.png",
  "/favicon.ico",
  "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js",
  "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js",
  "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js",
  "https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js",
  `${window.location.origin}/vendor/phaser/phaser.esm.js`,
  `${window.location.origin}/vendor/mediapipe/vision_bundle.mjs`,
  `${window.location.origin}/vendor/mediapipe/wasm/vision_wasm_internal.js`,
  `${window.location.origin}/vendor/mediapipe/wasm/vision_wasm_internal.wasm`,
  `${window.location.origin}/vendor/mediapipe/wasm/vision_wasm_nosimd_internal.js`,
  `${window.location.origin}/vendor/mediapipe/wasm/vision_wasm_nosimd_internal.wasm`
]);
const lecturaCoverUrlCache = new Map();
const lecturaCoverFailedRefs = new Set();
const lecturaStoragePrefixCache = new Map();
const lecturasAgentDocPrefixCache = new Map();
const lecturasAgentStorageIndexState = {
  loaded: false,
  promise: null,
  byDoc: new Map(),
  byDocFile: new Map()
};
const LECTURAS_GAME_SAFE_REMOTE_HOSTS = new Set([
  "firebasestorage.googleapis.com",
  "storage.googleapis.com",
  "www.gstatic.com"
]);
const lecturaCoverResolveState = new Map();
let lecturasCardCoverCacheLoaded = false;
let lecturasGameOfflineDbPromise = null;

function _lecturasGameLoadCardCoverCache() {
  if (lecturasCardCoverCacheLoaded) return;
  lecturasCardCoverCacheLoaded = true;
  try {
    const raw = localStorage.getItem(LECTURAS_GAME_CARD_COVER_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object") return;
    const now = Date.now();
    Object.entries(parsed).forEach(([key, value]) => {
      const lecturaKeyId = String(key || "").trim();
      const url = sanitizeImageCandidate(value?.url || "");
      const updatedAt = Number(value?.updatedAt || 0);
      if (!lecturaKeyId || !url || !updatedAt) return;
      if ((now - updatedAt) > LECTURAS_GAME_CARD_COVER_CACHE_TTL_MS) return;
      lecturaCoverUrlCache.set(`card::${lecturaKeyId}`, url);
    });
  } catch (_) {
    // noop
  }
}

function _lecturasGamePersistCardCoverCache() {
  try {
    const now = Date.now();
    const payload = {};
    for (const [key, value] of lecturaCoverUrlCache.entries()) {
      if (!String(key).startsWith("card::")) continue;
      const lecturaKeyId = String(key).slice(6).trim();
      const url = sanitizeImageCandidate(value || "");
      if (!lecturaKeyId || !url) continue;
      payload[lecturaKeyId] = { url, updatedAt: now };
    }
    localStorage.setItem(LECTURAS_GAME_CARD_COVER_CACHE_KEY, JSON.stringify(payload));
  } catch (_) {
    // noop
  }
}

function _lecturasGameGetCachedCardCover(lectura = null) {
  _lecturasGameLoadCardCoverCache();
  const key = lecturaKey(lectura || {});
  if (!key) return "";
  const cached = sanitizeImageCandidate(lecturaCoverUrlCache.get(`card::${key}`) || "");
  return isDirectRenderableImageUrl(cached) ? cached : "";
}

function _lecturasGameSetCachedCardCover(lectura = null, url = "") {
  const key = lecturaKey(lectura || {});
  const clean = sanitizeImageCandidate(url);
  if (!key || !clean || !isDirectRenderableImageUrl(clean)) return;
  lecturaCoverUrlCache.set(`card::${key}`, clean);
  _lecturasGamePersistCardCoverCache();
}

function _lecturasGameDropCachedCardCoverByKey(lecturaKeyId = "") {
  const key = String(lecturaKeyId || "").trim();
  if (!key) return;
  lecturaCoverUrlCache.delete(`card::${key}`);
  _lecturasGamePersistCardCoverCache();
}

function _lecturasGameReadOfflineMeta() {
  try {
    const raw = localStorage.getItem(LECTURAS_GAME_OFFLINE_META_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return (parsed && typeof parsed === "object") ? parsed : {};
  } catch (_) {
    return {};
  }
}

function _lecturasGameWriteOfflineMeta(meta = {}) {
  try {
    localStorage.setItem(LECTURAS_GAME_OFFLINE_META_KEY, JSON.stringify(meta && typeof meta === "object" ? meta : {}));
  } catch (_) {
    // noop
  }
}

function _lecturasGameGetOfflineMetaForKey(key = "") {
  const all = _lecturasGameReadOfflineMeta();
  return (all && key && typeof all[key] === "object") ? all[key] : null;
}

function _lecturasGameSetOfflineMetaForKey(key = "", value = null) {
  if (!key) return;
  const all = _lecturasGameReadOfflineMeta();
  if (value && typeof value === "object") all[key] = value;
  else delete all[key];
  _lecturasGameWriteOfflineMeta(all);
}

function _lecturasGameReadPlayerProfiles() {
  try {
    const raw = localStorage.getItem(LECTURAS_GAME_PLAYER_PROFILES_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object") return {};
    const sanitized = {};
    Object.entries(parsed).forEach(([key, value]) => {
      if (!value || typeof value !== "object") return;
      const row = { ...value };
      if ("password" in row) delete row.password;
      sanitized[key] = row;
    });
    return sanitized;
  } catch (_) {
    return {};
  }
}

function _lecturasGameWritePlayerProfiles(profiles = {}) {
  try {
    const source = profiles && typeof profiles === "object" ? profiles : {};
    const sanitized = {};
    Object.entries(source).forEach(([key, value]) => {
      if (!value || typeof value !== "object") return;
      const row = { ...value };
      if ("password" in row) delete row.password;
      sanitized[key] = row;
    });
    localStorage.setItem(LECTURAS_GAME_PLAYER_PROFILES_KEY, JSON.stringify(sanitized));
  } catch (_) {
    // noop
  }
}

function _lecturasGameGetSessionProfileSnapshot(session = null) {
  return _lecturasGameGetSessionProfileSnapshotByGame(session, LECTURAS_GAME_IDS.SYNONYMS);
}

function _lecturasGameResolvePlayerName(source = null) {
  const alias = String(source?.alias || "").trim();
  const username = String(source?.username || "").trim();
  const displayName = String(source?.displayName || "").trim();
  return alias || username || displayName || "Invitado";
}

function _lecturasGameGetStatsBucketForGame(stored = null, gameId = LECTURAS_GAME_IDS.SYNONYMS) {
  const profile = stored && typeof stored === "object" ? stored : {};
  const gameStats = profile.gameStats && typeof profile.gameStats === "object" ? profile.gameStats : {};
  const id = _lecturasGameNormalizeGameId(gameId);
  const key = id === LECTURAS_GAME_IDS.ORDER
    ? "synonymCatch"
    : (id === LECTURAS_GAME_IDS.SYNONYMS ? "synonyms" : String(id || "synonyms"));
  const bucket = gameStats[key] && typeof gameStats[key] === "object" ? gameStats[key] : {};
  return { key, bucket };
}

function _lecturasGameGetSessionProfileSnapshotByGame(session = null, gameId = LECTURAS_GAME_IDS.SYNONYMS) {
  const alias = String(session?.alias || session?.username || "").trim();
  const key = _lecturasGamePlayerDocId(alias);
  const stored = key ? (_lecturasGameReadPlayerProfiles()[key] || null) : null;
  const byGame = _lecturasGameGetStatsBucketForGame(stored, gameId);
  const bestScore = Math.max(0, Number(byGame.bucket?.bestScore ?? 0));
  const totalScore = Math.max(0, Number(byGame.bucket?.totalScore ?? bestScore));
  const gems = Math.max(0, Number(byGame.bucket?.gems ?? 0));
  const baseScore = Math.max(bestScore, totalScore);
  const level = Math.max(1, Number(byGame.bucket?.level ?? (Math.floor(baseScore / 120) + 1)));
  return { bestScore, totalScore, gems, level };
}

function _lecturasGameReadScoreQueue() {
  try {
    const raw = localStorage.getItem(LECTURAS_GAME_SCORE_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => {
      if (!item || typeof item !== "object") return null;
      const session = item.session && typeof item.session === "object" ? { ...item.session } : {};
      if ("password" in session) delete session.password;
      return {
        session,
        payload: item.payload && typeof item.payload === "object" ? { ...item.payload } : {},
        createdAt: Number(item.createdAt || 0) || Date.now()
      };
    }).filter(Boolean);
  } catch (_) {
    return [];
  }
}

function _lecturasGameWriteScoreQueue(items = []) {
  try {
    const rows = Array.isArray(items) ? items : [];
    const sanitized = rows.map((item) => {
      if (!item || typeof item !== "object") return null;
      const session = item.session && typeof item.session === "object" ? { ...item.session } : {};
      if ("password" in session) delete session.password;
      return {
        session,
        payload: item.payload && typeof item.payload === "object" ? { ...item.payload } : {},
        createdAt: Number(item.createdAt || 0) || Date.now()
      };
    }).filter(Boolean);
    localStorage.setItem(LECTURAS_GAME_SCORE_QUEUE_KEY, JSON.stringify(sanitized));
  } catch (_) {
    // noop
  }
}

function _lecturasGamePlayerDocId(username = "") {
  const raw = String(username || "").trim().toLowerCase();
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized.slice(0, 64);
}

function _lecturasGameCurrentAuthUid() {
  try {
    return String(auth.currentUser?.uid || "").trim();
  } catch (_) {
    return "";
  }
}

function _lecturasGameResolveRemotePlayerId(session = null) {
  const fromSession = String(session?.uidOwner || "").trim();
  if (fromSession) return fromSession;
  return _lecturasGameCurrentAuthUid();
}

function _lecturasGamePlayerRef(playerId = "") {
  const id = String(playerId || "").trim();
  if (!id) return null;
  return doc(db, "lecturasGame", id);
}

async function _lecturasGameSavePlayerSnapshotToFirebase(session = null, payload = {}) {
  const alias = String(session?.alias || session?.username || "").trim();
  const fullName = String(session?.fullName || "").trim();
  const displayName = String(session?.displayName || alias || "Jugador").trim();
  if (!alias || !session?.loggedIn) return false;
  if (!navigator.onLine) return false;
  const ownerUid = _lecturasGameResolveRemotePlayerId(session);
  if (!ownerUid) return false;
  const localKey = _lecturasGamePlayerDocId(alias);
  const localProfiles = _lecturasGameReadPlayerProfiles();
  const localFullName = String(localProfiles?.[localKey]?.fullName || "").trim();
  const resolvedFullName = String(fullName || localFullName || "").trim();
  const playerRef = _lecturasGamePlayerRef(ownerUid);
  if (!playerRef) return false;
  const nowIso = new Date().toISOString();
  const baseData = {
    uidOwner: ownerUid,
    username: alias,
    alias,
    displayName,
    updatedAt: serverTimestamp(),
    lastSeenAt: nowIso,
    profileVersion: 2
  };
  if (resolvedFullName) baseData.fullName = resolvedFullName;
  const reason = String(payload?.reason || "").trim().toLowerCase();
  const shouldWriteHistory = reason === "close" || reason === "level-clear";
  const shouldWritePlayerDoc = reason !== "realtime";
  try {
    if (shouldWritePlayerDoc) {
      await setDoc(playerRef, baseData, { merge: true });
    }
    await setDoc(doc(collection(playerRef, "stats"), "global"), {
      ...payload,
      uidOwner: ownerUid,
      alias,
      displayName,
      updatedAt: serverTimestamp(),
      updatedAtIso: nowIso
    }, { merge: true });
    if (shouldWriteHistory) {
      await addDoc(collection(playerRef, "history"), {
        ...payload,
        uidOwner: ownerUid,
        alias,
        displayName,
        savedAt: serverTimestamp(),
        savedAtIso: nowIso
      });
    }
    return true;
  } catch (_) {
    return false;
  }
}

async function _lecturasGameUpsertPlayerProfile(session = null) {
  const alias = String(session?.alias || session?.username || "").trim();
  const fullName = String(session?.fullName || "").trim();
  if (!alias) return null;
  const profiles = _lecturasGameReadPlayerProfiles();
  const key = _lecturasGamePlayerDocId(alias);
  const current = profiles[key] && typeof profiles[key] === "object" ? profiles[key] : {};
  const ownerUid = String(session?.uidOwner || current.uidOwner || _lecturasGameCurrentAuthUid() || "").trim();
  const merged = {
    username: alias,
    alias,
    uidOwner: ownerUid,
    fullName: String(fullName || current.fullName || ""),
    displayName: String(alias || current.displayName || current.username || "Jugador"),
    bestScore: Math.max(Number(current.bestScore || 0), Number(session?.bestScore || 0)),
    totalScore: Number(current.totalScore || 0),
    gamesPlayed: Number(current.gamesPlayed || 0),
    gems: Number(current.gems || 0),
    updatedAt: Date.now()
  };
  profiles[key] = merged;
  _lecturasGameWritePlayerProfiles(profiles);
  return merged;
}

async function _lecturasGameLoginPlayer(username = "") {
  const user = String(username || "").trim();
  if (!user) return { ok: false, error: "missing_credentials" };
  const alias = user;
  const key = _lecturasGamePlayerDocId(alias);
  if (!key) return { ok: false, error: "invalid_alias" };
  const local = _lecturasGameReadPlayerProfiles();
  const authUid = _lecturasGameCurrentAuthUid();
  if (!authUid) return { ok: false, error: "auth_required" };
  let remoteProfile = null;
  let statsData = {};
  if (navigator.onLine) {
    try {
      const playerRef = _lecturasGamePlayerRef(authUid);
      const snap = await getDoc(playerRef);
      if (snap.exists()) {
        remoteProfile = snap.data() || {};
        try {
          const statsSnap = await getDoc(doc(collection(playerRef, "stats"), "global"));
          if (statsSnap.exists()) statsData = statsSnap.data() || {};
        } catch (_) {
          statsData = {};
        }
      } else {
        return { ok: false, error: "profile_missing" };
      }
    } catch (_) {
      if (!local[key]) return { ok: false, error: "login_failed" };
    }
  }
  const remoteAlias = String(remoteProfile?.alias || remoteProfile?.username || "").trim();
  const resolvedAlias = String(remoteAlias || alias).trim();
  const resolvedKey = _lecturasGamePlayerDocId(resolvedAlias) || key;
  const current = local[resolvedKey] || local[key] || {};
  const merged = {
    ...current,
    username: resolvedAlias,
    alias: resolvedAlias,
    uidOwner: authUid,
    fullName: String(remoteProfile?.fullName || current.fullName || ""),
    displayName: String(remoteProfile?.displayName || remoteAlias || resolvedAlias || current.displayName || "Jugador"),
    bestScore: Number(statsData?.bestScore ?? current.bestScore ?? 0),
    totalScore: Number(statsData?.totalScore ?? current.totalScore ?? 0),
    gems: Number(statsData?.gems ?? current.gems ?? 0),
    updatedAt: Date.now()
  };
  if (resolvedKey !== key && local[key]) delete local[key];
  local[resolvedKey] = merged;
  _lecturasGameWritePlayerProfiles(local);
  const profile = await _lecturasGameUpsertPlayerProfile({
    username: resolvedAlias,
    alias: resolvedAlias,
    uidOwner: authUid,
    fullName: String(merged.fullName || "")
  });
  return { ok: true, profile: profile || merged };
}

async function _lecturasGameRegisterPlayer(fullName = "", username = "") {
  const name = String(fullName || "").trim();
  const user = String(username || "").trim();
  const key = _lecturasGamePlayerDocId(user);
  if (!key || !user) return { ok: false, error: "missing_credentials" };
  if (name.length < 4) return { ok: false, error: "missing_full_name" };
  const ownerUid = _lecturasGameCurrentAuthUid();
  if (!ownerUid) return { ok: false, error: "auth_required" };
  const localProfiles = _lecturasGameReadPlayerProfiles();
  const existing = localProfiles[key] && typeof localProfiles[key] === "object" ? localProfiles[key] : null;
  const existingOwner = String(existing?.uidOwner || "").trim();
  if (existingOwner && existingOwner !== ownerUid) return { ok: false, error: "name_taken" };
  if (navigator.onLine) {
    try {
      const playerRef = _lecturasGamePlayerRef(ownerUid);
      const snap = await getDoc(playerRef);
      const current = snap.exists() ? (snap.data() || {}) : {};
      const base = {
        username: user,
        alias: user,
        uidOwner: ownerUid,
        fullName: name,
        displayName: user,
        createdAt: current?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
        profileVersion: 2
      };
      await setDoc(playerRef, base, { merge: true });
      const statsBase = {
        bestScore: 0,
        totalScore: 0,
        gamesPlayed: 0,
        gems: 0,
        uidOwner: ownerUid,
        updatedAt: serverTimestamp()
      };
      await setDoc(doc(collection(playerRef, "stats"), "global"), statsBase, { merge: true });
    } catch (_) {
      return { ok: false, error: "register_failed" };
    }
  }
  const profile = await _lecturasGameUpsertPlayerProfile({
    username: user,
    alias: user,
    uidOwner: ownerUid,
    fullName: name
  });
  return { ok: true, profile };
}

async function _lecturasGameQueueOrSyncScore(session = null, payload = {}) {
  if (!session?.loggedIn || !session?.username) return;
  const ownerUid = _lecturasGameResolveRemotePlayerId(session);
  if (!ownerUid) return;
  const record = {
    session: {
      username: String(session.username || ""),
      alias: String(session.alias || session.username || ""),
      fullName: String(session.fullName || ""),
      uidOwner: ownerUid,
      loggedIn: true,
      displayName: String(session.displayName || session.alias || session.username || "Jugador")
    },
    payload: { ...(payload || {}) },
    createdAt: Date.now()
  };
  const ok = await _lecturasGameSavePlayerSnapshotToFirebase(session, payload);
  if (ok) return;
  const queue = _lecturasGameReadScoreQueue();
  queue.push(record);
  _lecturasGameWriteScoreQueue(queue.slice(-200));
}

async function _lecturasGameFlushQueuedScores() {
  const queue = _lecturasGameReadScoreQueue();
  if (!queue.length || !navigator.onLine) return;
  const pending = [];
  for (const item of queue) {
    const ok = await _lecturasGameSavePlayerSnapshotToFirebase(item?.session || null, item?.payload || {});
    if (!ok) pending.push(item);
  }
  _lecturasGameWriteScoreQueue(pending);
}

async function _lecturasGamePersistPlayerScores(runtime = lecturasGameModeRuntime, reason = "snapshot") {
  const progress = runtime?.progress || {};
  const gameId = _lecturasGameNormalizeGameId(runtime?.selectedGameId || runtime?.challengeType || "");
  const level = Number(progress.level || 1);
  const totalScore = Number(progress.score || 0);
  const totalGems = Number(progress.gems || 0);
  const persistSession = async (session = null, side = "solo", scoreOverride = null) => {
    if (!session?.loggedIn) return;
    const score = Number(scoreOverride == null ? totalScore : scoreOverride);
    const profiles = _lecturasGameReadPlayerProfiles();
    const alias = String(session.alias || session.username || "");
    const key = _lecturasGamePlayerDocId(alias);
    const local = profiles[key] || {};
    const shouldCountGame = reason === "close";
    const byGame = _lecturasGameGetStatsBucketForGame(local, gameId);
    const gameStats = local.gameStats && typeof local.gameStats === "object" ? { ...local.gameStats } : {};
    const bestScore = Math.max(Number(byGame.bucket?.bestScore || 0), score);
    const aggTotalScore = shouldCountGame ? (Number(byGame.bucket?.totalScore || 0) + Math.max(0, score)) : Number(byGame.bucket?.totalScore || 0);
    const aggGamesPlayed = shouldCountGame ? (Number(byGame.bucket?.gamesPlayed || 0) + 1) : Number(byGame.bucket?.gamesPlayed || 0);
    gameStats[byGame.key] = {
      bestScore,
      totalScore: aggTotalScore,
      gamesPlayed: aggGamesPlayed,
      gems: Math.max(Number(byGame.bucket?.gems || 0), totalGems),
      lastScore: score,
      level: Math.max(1, Number(level || 1)),
      updatedAt: Date.now()
    };
    const payload = {
      side,
      reason,
      gameId,
      uidOwner: String(session.uidOwner || _lecturasGameCurrentAuthUid() || ""),
      level,
      score,
      gems: totalGems,
      bestScore,
      totalScore: aggTotalScore,
      gamesPlayed: aggGamesPlayed,
      gameStats,
      playMode: runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR ? "pair" : "solo",
      lecturaId: String(runtime?.lectura?.id || ""),
      lecturaTitle: String(runtime?.lectura?.titulo || "")
    };
    const legacyBest = Math.max(Number(local.bestScore || 0), score);
    const legacyTotal = shouldCountGame ? (Number(local.totalScore || 0) + Math.max(0, score)) : Number(local.totalScore || 0);
    const legacyGames = shouldCountGame ? (Number(local.gamesPlayed || 0) + 1) : Number(local.gamesPlayed || 0);
    profiles[key] = {
      ...local,
      username: String(alias || session.username || ""),
      alias: String(alias || session.username || ""),
      uidOwner: String(session.uidOwner || local.uidOwner || _lecturasGameCurrentAuthUid() || ""),
      fullName: String(session.fullName || local.fullName || ""),
      displayName: String(session.displayName || alias || session.username || ""),
      bestScore: gameId === LECTURAS_GAME_IDS.SYNONYMS ? bestScore : legacyBest,
      totalScore: gameId === LECTURAS_GAME_IDS.SYNONYMS ? aggTotalScore : legacyTotal,
      gamesPlayed: gameId === LECTURAS_GAME_IDS.SYNONYMS ? aggGamesPlayed : legacyGames,
      gems: gameId === LECTURAS_GAME_IDS.SYNONYMS ? Math.max(Number(local.gems || 0), totalGems) : Math.max(Number(local.gems || 0), Number(byGame.bucket?.gems || 0)),
      lastScore: score,
      gameStats,
      updatedAt: Date.now()
    };
    _lecturasGameWritePlayerProfiles(profiles);
    await _lecturasGameQueueOrSyncScore(session, payload);
  };
  if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR) {
    await persistSession(runtime?.playerAccounts?.left, "left", Number(progress?.sideScores?.left || 0));
    await persistSession(runtime?.playerAccounts?.right, "right", Number(progress?.sideScores?.right || 0));
  } else {
    await persistSession(runtime?.playerAccounts?.solo, "solo", totalScore);
  }
}

function _lecturasGameBuildRankingDatasetFromLocal(gameId = LECTURAS_GAME_IDS.ORDER, limit = 12) {
  const id = _lecturasGameNormalizeGameId(gameId);
  const profiles = _lecturasGameReadPlayerProfiles();
  const entries = Object.values(profiles || {})
    .map((profile) => {
      const username = String(profile?.username || "").trim();
      const alias = String(profile?.alias || "").trim();
      const displayName = String(profile?.displayName || "").trim();
      if (!username || username.toLowerCase() === "invitado") return null;
      const byGame = _lecturasGameGetStatsBucketForGame(profile, id).bucket || {};
      const bestScore = Math.max(0, Number(byGame?.bestScore || 0));
      const totalScore = Math.max(0, Number(byGame?.totalScore || 0));
      const uidOwner = String(profile?.uidOwner || "").trim();
      return {
        id: uidOwner || _lecturasGamePlayerDocId(alias || username || displayName),
        name: _lecturasGameResolvePlayerName({ alias, username, displayName }),
        alias,
        username,
        displayName,
        bestScore,
        totalScore
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (b.bestScore !== a.bestScore) return b.bestScore - a.bestScore;
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      return String(a.name || "").localeCompare(String(b.name || ""), "es", { sensitivity: "base" });
    });
  return entries.slice(0, Math.max(1, Number(limit || 12)));
}

async function _lecturasGameBuildRankingDatasetFromFirebase(gameId = LECTURAS_GAME_IDS.ORDER, limit = 12) {
  if (!navigator.onLine) return [];
  const id = _lecturasGameNormalizeGameId(gameId);
  try {
    const playersSnap = await getDocs(collection(db, "lecturasGame"));
    const rows = await Promise.all(playersSnap.docs.map(async (playerDoc) => {
      const profile = playerDoc.data() || {};
      const username = String(profile?.username || "").trim();
      const alias = String(profile?.alias || "").trim();
      const displayName = String(profile?.displayName || "").trim();
      if (!username || username.toLowerCase() === "invitado") return null;
      let globalStats = {};
      try {
        const globalSnap = await getDoc(doc(collection(playerDoc.ref, "stats"), "global"));
        globalStats = globalSnap.exists() ? (globalSnap.data() || {}) : {};
      } catch (_) {
        globalStats = {};
      }
      const globalBucket = _lecturasGameGetStatsBucketForGame({ gameStats: globalStats?.gameStats || {} }, id).bucket || {};
      const profileBucket = _lecturasGameGetStatsBucketForGame(profile, id).bucket || {};
      const bestScore = Math.max(
        0,
        Number(globalBucket?.bestScore ?? profileBucket?.bestScore ?? globalStats?.bestScore ?? 0)
      );
      const totalScore = Math.max(
        0,
        Number(globalBucket?.totalScore ?? profileBucket?.totalScore ?? globalStats?.totalScore ?? bestScore)
      );
      return {
        id: String(playerDoc.id || _lecturasGamePlayerDocId(alias || username || displayName)),
        name: _lecturasGameResolvePlayerName({ alias, username, displayName }),
        alias,
        username,
        displayName,
        bestScore,
        totalScore
      };
    }));
    return rows
      .filter(Boolean)
      .sort((a, b) => {
        if (b.bestScore !== a.bestScore) return b.bestScore - a.bestScore;
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        return String(a.name || "").localeCompare(String(b.name || ""), "es", { sensitivity: "base" });
      })
      .slice(0, Math.max(1, Number(limit || 12)));
  } catch (_) {
    return [];
  }
}

async function _lecturasGameBuildRankingDataset(gameId = LECTURAS_GAME_IDS.ORDER, limit = 12) {
  const remote = await _lecturasGameBuildRankingDatasetFromFirebase(gameId, limit);
  if (remote.length) return remote;
  return _lecturasGameBuildRankingDatasetFromLocal(gameId, limit);
}

async function _lecturasGameFinalizeMatch(runtime = lecturasGameModeRuntime) {
  if (!runtime) return;
  const gameId = _lecturasGameNormalizeGameId(runtime?.selectedGameId || runtime?.challengeType || "");
  const rankingBackgroundImageUrl = String(runtime?.gameBackgroundUrl || runtime?.gameBackgroundUrls?.[0] || "").trim();
  const isPair = runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR;
  const highlightSession = isPair ? null : (runtime?.playerAccounts?.solo || null);
  const highlightPlayerId = highlightSession?.loggedIn
    ? String(highlightSession?.uidOwner || _lecturasGameCurrentAuthUid() || _lecturasGamePlayerDocId(String(highlightSession?.alias || highlightSession?.username || "")))
    : "";
  const lecturaSnapshot = runtime?.lectura ? { ...runtime.lectura } : null;
  const entries = await _lecturasGameBuildRankingDataset(gameId, 12);
  closeGameModePlaceholder({ skipResume: true, reason: "silent" });
  openLecturasGameRankingView({
    gameId,
    title: _lecturasGameGetGameTitle(gameId),
    backgroundImageUrl: rankingBackgroundImageUrl,
    entries,
    playerHighlight: highlightPlayerId,
    onPlayAgain: () => {
      closeLecturasGameRankingView();
      if (lecturaSnapshot) {
        openGameModePlaceholder(lecturaSnapshot, { forceGameSelect: false });
      }
    },
    onBackToReading: () => {
      closeLecturasGameRankingView();
      _lecturasGameResumeNarration(runtime).finally(() => {
        _lecturasGameDispatchRoundEnded("finalize-match");
      });
    }
  });
}

async function _lecturasGameOpenRankingShortcut(runtime = lecturasGameModeRuntime) {
  const gameId = _lecturasGameNormalizeGameId(runtime?.selectedGameId || runtime?.challengeType || runtime?.forcedGameId || "");
  const rankingBackgroundImageUrl = String(runtime?.gameBackgroundUrl || runtime?.gameBackgroundUrls?.[0] || "").trim();
  const entries = await _lecturasGameBuildRankingDataset(gameId, 12);
  openLecturasGameRankingView({
    gameId,
    title: _lecturasGameGetGameTitle(gameId),
    backgroundImageUrl: rankingBackgroundImageUrl,
    entries,
    playerHighlight: "",
    onPlayAgain: () => {
      closeLecturasGameRankingView();
      _lecturasGameHandleUiAction("start-selected-mode").catch(() => { });
    },
    onBackToReading: () => {
      closeLecturasGameRankingView();
      closeGameModePlaceholder({ skipResume: false, reason: "ranking-shortcut" });
    }
  });
}

function _lecturasGameStopRealtimeSync(runtime = lecturasGameModeRuntime) {
  if (runtime.realtimeSyncTimerId) {
    clearInterval(runtime.realtimeSyncTimerId);
    runtime.realtimeSyncTimerId = 0;
  }
}

function _lecturasGameStartRealtimeSync(runtime = lecturasGameModeRuntime) {
  _lecturasGameStopRealtimeSync(runtime);
  runtime.realtimeSyncLastMs = 0;
  runtime.realtimeSyncTimerId = setInterval(() => {
    if (!runtime.active) return;
    const mode = String(runtime.mode || "");
    if (!(mode === LECTURAS_GAME_MODE.PLAYING || mode === LECTURAS_GAME_MODE.QUIZ || mode === LECTURAS_GAME_MODE.COUNTDOWN)) return;
    const now = Date.now();
    if ((now - Number(runtime.realtimeSyncLastMs || 0)) < LECTURAS_GAME_REALTIME_SYNC_MIN_GAP_MS) return;
    runtime.realtimeSyncLastMs = now;
    Promise.resolve(_lecturasGamePersistPlayerScores(runtime, "realtime")).catch(() => { });
  }, LECTURAS_GAME_REALTIME_SYNC_INTERVAL_MS);
}

function _lecturasGameOpenOfflineDb() {
  if (!("indexedDB" in window)) return Promise.resolve(null);
  if (lecturasGameOfflineDbPromise) return lecturasGameOfflineDbPromise;
  lecturasGameOfflineDbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(LECTURAS_GAME_OFFLINE_DB_NAME, LECTURAS_GAME_OFFLINE_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(LECTURAS_GAME_OFFLINE_DB_STORE)) {
          db.createObjectStore(LECTURAS_GAME_OFFLINE_DB_STORE, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(LECTURAS_GAME_OFFLINE_DB_CARDS_STORE)) {
          db.createObjectStore(LECTURAS_GAME_OFFLINE_DB_CARDS_STORE, { keyPath: "lecturaKey" });
        }
        if (!db.objectStoreNames.contains(LECTURAS_GAME_OFFLINE_DB_CONFIG_STORE)) {
          db.createObjectStore(LECTURAS_GAME_OFFLINE_DB_CONFIG_STORE, { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch (_) {
      resolve(null);
    }
  });
  return lecturasGameOfflineDbPromise;
}

async function _lecturasGameOfflineStorePut(storeName = "", record = null) {
  const db = await _lecturasGameOpenOfflineDb();
  if (!db || !storeName || !record) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      store.put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch (_) {
      resolve(false);
    }
  });
}

async function _lecturasGameOfflineStoreGetAll(storeName = "") {
  const db = await _lecturasGameOpenOfflineDb();
  if (!db || !storeName) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => resolve([]);
    } catch (_) {
      resolve([]);
    }
  });
}

async function _lecturasGameOfflineStoreGet(storeName = "", key = "") {
  const db = await _lecturasGameOpenOfflineDb();
  if (!db || !storeName || !key) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.get(String(key));
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch (_) {
      resolve(null);
    }
  });
}

async function _lecturasGameOfflineStoreDelete(storeName = "", key = "") {
  const db = await _lecturasGameOpenOfflineDb();
  if (!db || !storeName || !key) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).delete(String(key));
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch (_) {
      resolve(false);
    }
  });
}

async function _lecturasGameOfflineDbPut(record = null) {
  if (!record?.key) return false;
  return _lecturasGameOfflineStorePut(LECTURAS_GAME_OFFLINE_DB_STORE, record);
}

async function _lecturasGameOfflineDbGetAll() {
  return _lecturasGameOfflineStoreGetAll(LECTURAS_GAME_OFFLINE_DB_STORE);
}

async function _lecturasGameOfflineDbGet(key = "") {
  return _lecturasGameOfflineStoreGet(LECTURAS_GAME_OFFLINE_DB_STORE, key);
}

async function _lecturasGameOfflineCardPut(record = null) {
  if (!record?.lecturaKey) return false;
  return _lecturasGameOfflineStorePut(LECTURAS_GAME_OFFLINE_DB_CARDS_STORE, record);
}

async function _lecturasGameOfflineCardGet(lecturaKey = "") {
  return _lecturasGameOfflineStoreGet(LECTURAS_GAME_OFFLINE_DB_CARDS_STORE, lecturaKey);
}

async function _lecturasGameOfflineCardGetAll() {
  return _lecturasGameOfflineStoreGetAll(LECTURAS_GAME_OFFLINE_DB_CARDS_STORE);
}

async function _lecturasGameOfflineCardDelete(lecturaKey = "") {
  return _lecturasGameOfflineStoreDelete(LECTURAS_GAME_OFFLINE_DB_CARDS_STORE, lecturaKey);
}

async function _lecturasGameOfflineConfigSet(payload = {}) {
  return _lecturasGameOfflineStorePut(LECTURAS_GAME_OFFLINE_DB_CONFIG_STORE, {
    key: "offlineConfig",
    ...payload
  });
}

async function _lecturasGameOfflineConfigGet() {
  return _lecturasGameOfflineStoreGet(LECTURAS_GAME_OFFLINE_DB_CONFIG_STORE, "offlineConfig");
}

const els = {
  gameHero: null,
  lecturaScene: null,
  lecturaCards: null,
  lecturaEmpty: null,
  modeModal: null,
  modeModalBody: null
};

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeText(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeGrado(value = "") {
  if (value == null) return "";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  const raw = String(value).trim();
  if (!raw) return "";
  const digit = raw.match(/\d+/);
  if (digit) return String(Number(digit[0]));
  const norm = normalizeText(raw);
  if (GRADE_TEXT_MAP[norm]) return GRADE_TEXT_MAP[norm];
  return raw;
}

function gradeLabel(grado = "") {
  const clean = String(grado || "").trim();
  if (!clean) return "Sin grado";
  const n = Number(clean);
  if (Number.isFinite(n) && n > 0) {
    return GRADE_LABEL_MAP[String(n)] || `Grado ${n}`;
  }
  return `Grado ${clean}`;
}

function sortGrades(grados = []) {
  return [...grados].sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    if (Number.isFinite(na)) return -1;
    if (Number.isFinite(nb)) return 1;
    return String(a).localeCompare(String(b), "es", { sensitivity: "base", numeric: true });
  });
}

function lecturaKey(lectura = {}) {
  return `${String(lectura?.sourceCollection || "")}::${String(lectura?.id || "")}`;
}

function resolveUnidadLectura(item = {}) {
  const candidates = [
    item?.unidad,
    item?.unidadNumero,
    item?.unidad_numero,
    item?.numeroUnidad,
    item?.numUnidad,
    item?.rawData?.unidad,
    item?.rawData?.unidadNumero,
    item?.campos?.unidad,
    item?.campos?.unidadNumero
  ];
  for (const value of candidates) {
    if (value == null) continue;
    const clean = String(value).trim();
    if (clean) return clean;
  }
  return "";
}

function _lecturasHasStructuredContent(value) {
  if (value == null) return false;
  if (typeof value === "string") return String(value).trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return false;
}

function resolveLecturaSinonimos(raw = {}) {
  const nested = [raw, raw?.rawData, raw?.campos, raw?.metadata, raw?.data, raw?.payload]
    .filter((entry) => entry && typeof entry === "object");
  const directKeys = [
    "sinonimos",
    "sinónimos",
    "tablaSinonimos",
    "tabla_sinonimos",
    "sinonimosTabla",
    "tablaDeSinonimos",
    "glosario",
    "vocabulario"
  ];

  for (const source of nested) {
    for (const key of directKeys) {
      const value = source?.[key];
      if (_lecturasHasStructuredContent(value)) return value;
    }
  }

  return "";
}

function resolveLecturaMusicAssets(raw = {}) {
  const music = raw?.music || raw?.musica || {};
  return {
    readingUrl: String(music?.readingUrl || music?.lecturaUrl || raw?.musicReadingUrl || "").trim(),
    gameUrl: String(music?.gameUrl || music?.juegoUrl || raw?.musicGameUrl || "").trim(),
    readingPath: String(music?.readingPath || music?.lecturaPath || raw?.musicReadingPath || "").trim(),
    gamePath: String(music?.gamePath || music?.juegoPath || raw?.musicGamePath || "").trim()
  };
}

function normalizeLectura(docSnap, sourceCollection = "") {
  const raw = docSnap?.data?.() || {};
  const id = String(docSnap?.id || "").trim();
  const title = String(raw.titulo || raw.tema || "Lectura sin título").trim();
  const htmlLectura = String(
    raw.contenidoHTML
    || raw.textoLectura
    || raw.contenidoCompleto
    || raw.lectura
    || raw.contenido
    || raw.texto
    || "<p>(Sin contenido)</p>"
  ).trim() || "<p>(Sin contenido)</p>";
  const preguntas = Array.isArray(raw.preguntas)
    ? raw.preguntas
    : (Array.isArray(raw.preguntasComprension) ? raw.preguntasComprension : []);
  const musicAssets = resolveLecturaMusicAssets(raw);

  return {
    id,
    key: `${sourceCollection}::${id}`,
    sourceCollection,
    tipo: sourceCollection === "lecturasASC" ? "asc" : "nueva",
    titulo: title,
    tema: String(raw.tema || "").trim(),
    grado: normalizeGrado(raw.grado),
    nivel: String(raw.nivel || "").trim(),
    trimestre: String(raw.trimestre ?? "").trim(),
    unidad: String(resolveUnidadLectura(raw) || "").trim(),
    htmlLectura,
    preguntas,
    bibliografia: raw.bibliografia || "",
    sinonimos: resolveLecturaSinonimos(raw),
    userId: String(raw.userId || raw.uid || raw.ownerId || "").trim(),
    uid: String(raw.uid || raw.userId || raw.ownerId || "").trim(),
    ownerId: String(raw.ownerId || raw.userId || raw.uid || "").trim(),
    ownerUid: String(raw.ownerUid || raw.ownerId || raw.userId || raw.uid || "").trim(),
    musicAssets,
    published: raw.published === true,
    raw
  };
}

async function loadPublishedByCollection(collectionName = "") {
  let snap;
  try {
    const q = query(collection(db, collectionName), where("published", "==", true));
    snap = await getDocs(q);
  } catch (_) {
    snap = await getDocs(collection(db, collectionName));
  }

  return snap.docs
    .map((docSnap) => normalizeLectura(docSnap, collectionName))
    .filter((item) => item.published === true);
}

function matchesSearch(lectura, queryText = "") {
  const q = normalizeText(queryText);
  if (!q) return true;
  const collectionLabel = lectura.sourceCollection === "lecturasASC" ? "lecturas asc" : "lecturas nuevas";
  const haystack = normalizeText([
    lectura.titulo,
    lectura.tema,
    lectura.nivel,
    lectura.grado,
    lectura.trimestre,
    lectura.unidad,
    collectionLabel
  ].join(" | "));
  return haystack.includes(q);
}

function getSearchFilteredLecturas() {
  return state.allLecturas.filter((row) => matchesSearch(row, state.searchQuery));
}

function getAvailableGrades(items = []) {
  const grades = new Set();
  for (const item of items) {
    const g = String(item?.grado || "").trim();
    if (g) grades.add(g);
  }
  return sortGrades(Array.from(grades));
}

function lecturaCollectionClass(sourceCollection = "") {
  return sourceCollection === "lecturasASC" ? "asc" : "nuevas";
}

function lecturaCollectionLabel(sourceCollection = "") {
  return sourceCollection === "lecturasASC" ? "Lecturas ASC" : "Lecturas Nuevas";
}

function _lecturasGameIsAllowedRemoteUrl(value = "") {
  const raw = String(value || "").trim();
  if (!/^https?:/i.test(raw)) return true;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin === window.location.origin) return true;
    const host = String(url.hostname || "").toLowerCase();
    if (LECTURAS_GAME_SAFE_REMOTE_HOSTS.has(host)) return true;
    return host.endsWith(".googleapis.com") || host.endsWith(".gstatic.com");
  } catch (_) {
    return false;
  }
}

function sanitizeImageCandidate(value = "") {
  if (value == null) return "";
  let out = String(value || "").trim();
  if (!out) return "";
  const urlMatch = out.match(/^url\((.+)\)$/i);
  if (urlMatch?.[1]) {
    out = String(urlMatch[1]).trim();
  }
  out = out.replace(/^["']+|["']+$/g, "").trim();
  if (!out) return "";
  if (/^(javascript|file|about):/i.test(out)) return "";
  if (out.startsWith("//")) return `${window.location.protocol}${out}`;
  if (!_lecturasGameIsAllowedRemoteUrl(out)) return "";
  return out;
}

function looksLikeImageReference(value = "") {
  const clean = sanitizeImageCandidate(value);
  if (!clean) return false;
  if (/^data:image\//i.test(clean)) return true;
  if (/^(https?:|blob:|\/|\.{1,2}\/)/i.test(clean)) return true;
  if (/^gs:\/\//i.test(clean)) return true;
  if (/^[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)+(?:\?[^\s]*)?$/i.test(clean)) return true;
  return /(?:^|\/)[^/?#]+\.(png|jpe?g|webp|gif|svg|avif|bmp|ico)(?:[?#].*)?$/i.test(clean);
}

function parseGsPath(url = "") {
  const match = String(url || "").match(/^gs:\/\/([^/]+)\/(.+)$/i);
  if (!match) return null;
  return { bucket: String(match[1] || "").trim(), path: String(match[2] || "").trim() };
}

function buildStorageAltMediaUrl(path = "", bucket = "") {
  const cleanPath = String(path || "").replace(/^\/+/, "").trim();
  const cleanBucket = String(bucket || firebaseConfig?.storageBucket || "").trim();
  if (!cleanPath || !cleanBucket) return "";
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(cleanBucket)}/o/${encodeURIComponent(cleanPath)}?alt=media`;
}

async function _lecturasGameResolveFirstStorageImageInPrefix(prefixPath = "") {
  const cleanPrefix = String(prefixPath || "").replace(/^\/+/, "").trim();
  if (!cleanPrefix) return "";
  if (lecturaStoragePrefixCache.has(cleanPrefix)) {
    return String(lecturaStoragePrefixCache.get(cleanPrefix) || "");
  }
  try {
    const listed = await listAll(storageRef(storage, cleanPrefix));
    const itemRef = (listed?.items || []).find((it) => /(?:^|\/)[^/?#]+\.(png|jpe?g|webp|gif|svg|avif|bmp|ico)$/i.test(String(it?.name || "")));
    if (!itemRef) {
      lecturaStoragePrefixCache.set(cleanPrefix, "");
      return "";
    }
    const out = sanitizeImageCandidate(await getDownloadURL(itemRef).catch(() => ""));
    lecturaStoragePrefixCache.set(cleanPrefix, out);
    return out;
  } catch (_) {
    lecturaStoragePrefixCache.set(cleanPrefix, "");
    return "";
  }
}

function _lecturasGameParseAgentStoragePath(path = "") {
  const clean = String(path || "").replace(/^\/+/, "").trim();
  const match = clean.match(/^lecturas-agent\/([^/]+)\/([^/]+)\/([^/]+)\/([^/]+)$/i);
  if (!match) return null;
  return {
    uid: String(match[1] || "").trim(),
    sourceCollection: String(match[2] || "").trim(),
    lecturaId: String(match[3] || "").trim(),
    fileName: String(match[4] || "").trim()
  };
}

async function _lecturasGameEnsureAgentStorageIndex() {
  if (lecturasAgentStorageIndexState.loaded) return lecturasAgentStorageIndexState;
  if (lecturasAgentStorageIndexState.promise) return lecturasAgentStorageIndexState.promise;
  lecturasAgentStorageIndexState.promise = (async () => {
    lecturasAgentStorageIndexState.loaded = true;
    return lecturasAgentStorageIndexState;
  })().finally(() => {
    lecturasAgentStorageIndexState.promise = null;
  });
  return lecturasAgentStorageIndexState.promise;
}

async function _lecturasGameResolveStoredImageByDocAndFile(sourceCollection = "", lecturaId = "", fileName = "") {
  const col = String(sourceCollection || "").trim();
  const id = String(lecturaId || "").trim();
  const file = String(fileName || "").trim();
  if (!col || !id) return "";
  const bucket = String(firebaseConfig?.storageBucket || "").trim();
  if (!bucket) return "";
  const cacheKey = file ? `${col}::${id}::${file}` : `${col}::${id}`;
  if (lecturasAgentDocPrefixCache.has(cacheKey)) return String(lecturasAgentDocPrefixCache.get(cacheKey) || "");
  try {
    let pageToken = "";
    for (let i = 0; i < 40; i++) {
      const endpoint = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o?prefix=${encodeURIComponent("lecturas-agent/")}&maxResults=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
      const res = await fetch(endpoint, { method: "GET", mode: "cors", credentials: "omit" });
      if (!res.ok) break;
      const data = await res.json().catch(() => ({}));
      const items = Array.isArray(data?.items) ? data.items : [];
      const hit = items.find((it) => {
        const name = String(it?.name || "");
        if (!name.includes(`/${col}/${id}/`)) return false;
        if (file) return name.endsWith(`/${file}`);
        return /\/[^/]+\.(png|jpe?g|webp|gif|svg|avif|bmp|ico)$/i.test(name);
      });
      if (hit?.name) {
        const url = buildStorageAltMediaUrl(String(hit.name || ""), bucket);
        lecturasAgentDocPrefixCache.set(cacheKey, url);
        return url;
      }
      pageToken = String(data?.nextPageToken || "").trim();
      if (!pageToken) break;
    }
  } catch (_) {
    // noop
  }
  lecturasAgentDocPrefixCache.set(cacheKey, "");
  return "";
}

async function _lecturasGameResolveAgentImageByDoc(sourceCollection = "", lecturaId = "") {
  const col = String(sourceCollection || "").trim();
  const id = String(lecturaId || "").trim();
  if (!col || !id) return "";
  return _lecturasGameResolveStoredImageByDocAndFile(col, id, "");
}

async function _lecturasGameResolveAgentImageByDocAndFile(sourceCollection = "", lecturaId = "", fileName = "") {
  const col = String(sourceCollection || "").trim();
  const id = String(lecturaId || "").trim();
  const file = String(fileName || "").trim();
  if (!col || !id) return "";
  return _lecturasGameResolveStoredImageByDocAndFile(col, id, file);
}

function pickImageFromAny(input, depth = 0) {
  if (depth > 4 || input == null) return "";
  if (typeof input === "string") {
    const clean = sanitizeImageCandidate(input);
    return looksLikeImageReference(clean) ? clean : "";
  }
  if (Array.isArray(input)) {
    for (const item of input) {
      const found = pickImageFromAny(item, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (typeof input !== "object") return "";

  const preferredKeys = [
    "url",
    "src",
    "downloadURL",
    "downloadUrl",
    "imageUrl",
    "imagenUrl",
    "image",
    "imagen",
    "portada",
    "portadaUrl",
    "cover",
    "coverUrl",
    "coverImage",
    "thumbnail",
    "thumbnailUrl",
    "photo",
    "foto",
    "storagePath",
    "path"
  ];
  for (const key of preferredKeys) {
    const found = pickImageFromAny(input?.[key], depth + 1);
    if (found) return found;
  }

  for (const [key, value] of Object.entries(input)) {
    if (!/(img|image|imagen|cover|portada|foto|thumb|url|src|media|asset|slide|escena)/i.test(String(key))) continue;
    const found = pickImageFromAny(value, depth + 1);
    if (found) return found;
  }

  return "";
}

function isDirectRenderableImageUrl(url = "") {
  const clean = sanitizeImageCandidate(url);
  if (!clean) return false;
  const normalizedNoSlash = String(clean).replace(/^\/+/, "");
  if (!looksLikeImageReference(clean)) return false;
  if (/^gs:\/\//i.test(clean)) return false;
  if (/^(lecturas-agent|lecturasASC|lecturasNuevas)\//i.test(normalizedNoSlash)) return false;
  if (/^lecturas-agent\//i.test(clean)) return false;
  // Rutas relativas tipo "lecturasASC/x.png" o "folder/x.jpg" deben resolverse por Storage.
  if (!/^(https?:|data:|blob:|\/)/i.test(clean)) return false;
  return true;
}

function _lecturasGameIsStorageImageRef(value = "") {
  const clean = sanitizeImageCandidate(value);
  if (!clean) return false;
  const normalizedNoSlash = String(clean).replace(/^\/+/, "");
  if (/^gs:\/\//i.test(clean)) return true;
  if (/^lecturas-agent\//i.test(normalizedNoSlash)) return true;
  if (/^(lecturasASC|lecturasNuevas)\//i.test(normalizedNoSlash)) return true;
  if (/^[^./][^?#]*\/[^?#]+\.(png|jpe?g|webp|gif|svg|avif|bmp|ico)(?:[?#].*)?$/i.test(clean)) return true;
  if (/^https?:\/\/firebasestorage\.googleapis\.com\/v0\/b\//i.test(clean)) return true;
  if (/^https?:\/\/storage\.googleapis\.com\//i.test(clean)) return true;
  return false;
}

function getLecturasAgentLocalCacheIndex() {
  try {
    const cacheKey = "cb_lecturas_agent_images_v2";
    const raw = sessionStorage.getItem(cacheKey) || localStorage.getItem(cacheKey);
    const parsed = raw ? JSON.parse(raw) : {};
    return (parsed && typeof parsed === "object" && !Array.isArray(parsed)) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function resolveLecturaAgentFirstNarrativeMeta(lectura = {}) {
  const sourceCollection = String(lectura?.sourceCollection || lectura?.coleccion || "").trim();
  const lecturaId = String(lectura?.id || "").trim();
  if (!sourceCollection || !lecturaId) return null;
  try {
    const raw = lectura?.raw || {};
    const rawHtml = String(
      lectura?.htmlLectura
      || raw?.contenidoHTML
      || raw?.textoLectura
      || raw?.contenidoCompleto
      || raw?.lectura
      || raw?.contenido
      || raw?.texto
      || ""
    ).trim();
    if (!rawHtml) return "";

    const payload = {
      id: lecturaId,
      sourceCollection,
      coleccion: sourceCollection,
      titulo: String(lectura?.titulo || raw?.titulo || "").trim(),
      userId: String(lectura?.userId || raw?.userId || lectura?.uid || raw?.uid || lectura?.ownerId || raw?.ownerId || "").trim()
    };
    const prepared = typeof _lecturasAgentBuildViewerContent === "function"
      ? _lecturasAgentBuildViewerContent(rawHtml, payload)
      : { narrativeHtml: rawHtml };
    const normalized = typeof _lecturasAgentNormalizeParagraphHtml === "function"
      ? _lecturasAgentNormalizeParagraphHtml(prepared?.narrativeHtml || rawHtml)
      : [];
    const firstNarrative = Array.isArray(normalized)
      ? normalized.find((item) => String(item?.text || "").trim())
      : null;
    if (!firstNarrative?.text) return null;
    const paragraphHash = typeof _lecturasAgentHash === "function"
      ? _lecturasAgentHash(firstNarrative.text)
      : "";
    if (!paragraphHash) return null;
    return {
      sourceCollection,
      lecturaId,
      paragraphHash,
      text: firstNarrative.text,
      payload
    };
  } catch (_) {
    return null;
  }
}

function resolveLecturaAgentCachedImageUrl(lectura = {}) {
  const meta = resolveLecturaAgentFirstNarrativeMeta(lectura);
  if (!meta) return "";
  const key = `${meta.sourceCollection}:${meta.lecturaId}:${meta.paragraphHash}`;
  const cacheMap = getLecturasAgentLocalCacheIndex();
  const fromLocal = sanitizeImageCandidate(cacheMap?.[key] || "");
  if (/^lecturas-agent\//i.test(fromLocal)) return "";
  return fromLocal;
}

function resolveLecturaAgentFirstSlideStoragePath(lectura = {}) {
  const meta = resolveLecturaAgentFirstNarrativeMeta(lectura);
  if (!meta || typeof _lecturasAgentBuildStoragePath !== "function") return "";
  const coverPath = _lecturasAgentBuildStoragePath(meta.payload, {
    paragraphHash: "portada",
    text: "portada"
  });
  if (coverPath) return coverPath;
  return _lecturasAgentBuildStoragePath(meta.payload, {
    paragraphHash: meta.paragraphHash,
    text: meta.text
  });
}

function resolveLecturaCoverImage(lectura = {}) {
  const raw = lectura?.raw || {};
  const directResolved = sanitizeImageCandidate(lectura?.coverImageResolved);
  if (isDirectRenderableImageUrl(directResolved)) return directResolved;
  const cachedCardCover = _lecturasGameGetCachedCardCover(lectura);
  if (cachedCardCover) return cachedCardCover;
  if (String(lectura?.sourceCollection || "").trim()) {
    const cachedSlideUrl = resolveLecturaAgentCachedImageUrl(lectura);
    if (cachedSlideUrl) return cachedSlideUrl;
    const firstSlidePath = resolveLecturaAgentFirstSlideStoragePath(lectura);
    if (firstSlidePath) return firstSlidePath;
  }
  const directFallback = sanitizeImageCandidate(
    lectura?.coverImage
    || lectura?.imagen
    || lectura?.imagenUrl
    || lectura?.portada
    || lectura?.portadaUrl
    || raw?.coverImage
    || raw?.coverUrl
    || raw?.portada
    || raw?.portadaUrl
  );
  if (directFallback) return directFallback;
  const nestedCandidates = [
    lectura?.rawData,
    lectura?.campos,
    lectura?.metadatos,
    raw?.rawData,
    raw?.campos,
    raw?.metadatos,
    raw?.datos,
    raw?.data,
    raw?.payload
  ];
  const directCandidates = [
    lectura?.coverImageResolved,
    lectura?.coverImage,
    lectura?.imagen,
    lectura?.imagenUrl,
    lectura?.portada,
    lectura?.portadaUrl,
    lectura?.thumbnail,
    lectura?.thumbnailUrl,
    raw?.coverImage,
    raw?.cover,
    raw?.coverUrl,
    raw?.portada,
    raw?.portadaUrl,
    raw?.imagen,
    raw?.imagenUrl,
    raw?.imagenPrincipal,
    raw?.thumbnail,
    raw?.thumbnailUrl,
    raw?.image,
    raw?.imageUrl,
    raw?.foto,
    raw?.imagenesGeneradas,
    raw?.imagenesParrafos,
    raw?.imagenesParrafo,
    raw?.slides,
    raw?.storySlides,
    raw?.escenas,
    raw?.escenasGeneradas,
    raw?.assets
  ];
  for (const candidate of directCandidates) {
    const clean = pickImageFromAny(candidate);
    if (clean) return clean;
  }
  for (const candidate of nestedCandidates) {
    const clean = pickImageFromAny(candidate);
    if (clean) return clean;
  }

  const listCandidates = [
    raw?.imagenes,
    raw?.images,
    raw?.galeria,
    raw?.gallery,
    raw?.media,
    raw?.multimedia
  ];
  for (const list of listCandidates) {
    const clean = pickImageFromAny(list);
    if (clean) return clean;
  }

  const wrap = document.createElement("div");
  wrap.innerHTML = String(lectura?.htmlLectura || raw?.contenidoHTML || "");
  const mediaNode = wrap.querySelector("img[src], img[data-src], img[data-original], img[data-lazy-src], source[srcset]");
  if (mediaNode) {
    const srcset = sanitizeImageCandidate(mediaNode.getAttribute("srcset") || "").split(",")[0]?.trim().split(/\s+/)[0] || "";
    const firstHit = sanitizeImageCandidate(
      mediaNode.getAttribute("src")
      || mediaNode.getAttribute("data-src")
      || mediaNode.getAttribute("data-original")
      || mediaNode.getAttribute("data-lazy-src")
      || srcset
    );
    if (firstHit) return firstHit;
  }

  const styleNode = wrap.querySelector("[style*='background-image']");
  if (styleNode) {
    const styleRaw = String(styleNode.getAttribute("style") || "");
    const bgMatch = styleRaw.match(/background-image\s*:\s*url\(([^)]+)\)/i);
    const bgUrl = sanitizeImageCandidate(bgMatch?.[1] || "");
    if (bgUrl) return bgUrl;
  }
  return "";
}

function resolveLecturaCoverFallbackImage(lectura = {}) {
  const raw = lectura?.raw || {};
  const directCandidates = [
    lectura?.coverImage,
    lectura?.imagen,
    lectura?.imagenUrl,
    lectura?.portada,
    lectura?.portadaUrl,
    lectura?.thumbnail,
    lectura?.thumbnailUrl,
    raw?.coverImage,
    raw?.cover,
    raw?.coverUrl,
    raw?.portada,
    raw?.portadaUrl,
    raw?.imagen,
    raw?.imagenUrl,
    raw?.imagenPrincipal,
    raw?.thumbnail,
    raw?.thumbnailUrl,
    raw?.image,
    raw?.imageUrl,
    raw?.foto,
    raw?.imagenesGeneradas,
    raw?.imagenesParrafos,
    raw?.imagenesParrafo,
    raw?.slides,
    raw?.storySlides,
    raw?.escenas,
    raw?.escenasGeneradas,
    raw?.assets
  ];
  for (const candidate of directCandidates) {
    const clean = pickImageFromAny(candidate);
    if (clean) return clean;
  }
  const wrap = document.createElement("div");
  wrap.innerHTML = String(lectura?.htmlLectura || raw?.contenidoHTML || "");
  const mediaNode = wrap.querySelector("img[src], img[data-src], img[data-original], img[data-lazy-src], source[srcset]");
  if (mediaNode) {
    const srcset = sanitizeImageCandidate(mediaNode.getAttribute("srcset") || "").split(",")[0]?.trim().split(/\s+/)[0] || "";
    return sanitizeImageCandidate(
      mediaNode.getAttribute("src")
      || mediaNode.getAttribute("data-src")
      || mediaNode.getAttribute("data-original")
      || mediaNode.getAttribute("data-lazy-src")
      || srcset
    );
  }
  return "";
}

async function resolveCoverUrlForDisplay(rawUrl = "") {
  const clean = sanitizeImageCandidate(rawUrl);
  if (!clean) return "";
  if (lecturaCoverFailedRefs.has(clean)) return "";
  const normalizedNoSlash = String(clean).replace(/^\/+/, "");
  const hasStoragePrefix = /^(lecturas-agent|lecturasASC|lecturasNuevas)\//i.test(normalizedNoSlash);
  const storageCandidate = hasStoragePrefix ? normalizedNoSlash : clean;
  if (!looksLikeImageReference(clean)) return "";
  if (lecturaCoverUrlCache.has(clean)) {
    return String(lecturaCoverUrlCache.get(clean) || "");
  }
  if (/^(https?:|data:|blob:)/i.test(clean)) return clean;
  if (clean.startsWith("/") && !hasStoragePrefix) return clean;
  if (_lecturasGameIsStorageImageRef(storageCandidate)) {
    if (/^lecturas-agent\//i.test(storageCandidate)) {
      const parsed = _lecturasGameParseAgentStoragePath(storageCandidate);
      if (String(parsed?.uid || "").toLowerCase() === "anon") {
        const authUid = String(auth?.currentUser?.uid || "").trim();
        if (authUid) {
          const uidPath = storageCandidate.replace(/^lecturas-agent\/anon\//i, `lecturas-agent/${authUid}/`);
          try {
            const authUrl = await getDownloadURL(storageRef(storage, uidPath));
            if (authUrl) {
              lecturaCoverUrlCache.set(clean, authUrl);
              return authUrl;
            }
          } catch (_) {
            // continue with generic resolution
          }
        }
      }
      const slash = storageCandidate.lastIndexOf("/");
      const prefix = slash > 0 ? `${storageCandidate.slice(0, slash + 1)}` : "";
      if (prefix) {
        const listed = await _lecturasGameResolveFirstStorageImageInPrefix(prefix);
        if (listed) {
          lecturaCoverUrlCache.set(clean, listed);
          return listed;
        }
      }
      if (parsed?.sourceCollection && parsed?.lecturaId) {
        const byDocFile = await _lecturasGameResolveAgentImageByDocAndFile(parsed.sourceCollection, parsed.lecturaId, parsed.fileName);
        if (byDocFile) {
          lecturaCoverUrlCache.set(clean, byDocFile);
          return byDocFile;
        }
        const byDoc = await _lecturasGameResolveAgentImageByDoc(parsed.sourceCollection, parsed.lecturaId);
        if (byDoc) {
          lecturaCoverUrlCache.set(clean, byDoc);
          return byDoc;
        }
      }
      // Si no hay archivo en el prefijo del doc, evitamos getDownloadURL al objeto puntual
      // para no repetir 404 por rutas antiguas/inexistentes.
      lecturaCoverUrlCache.set(clean, "");
      lecturaCoverFailedRefs.add(clean);
      return "";
    }
    try {
      const signed = await getDownloadURL(storageRef(storage, storageCandidate));
      if (signed) {
        lecturaCoverUrlCache.set(clean, signed);
        return signed;
      }
    } catch (_) {
      lecturaCoverUrlCache.set(clean, "");
      lecturaCoverFailedRefs.add(clean);
      return "";
    }
  }
  if (!/^gs:\/\//i.test(clean) && /(?:^|\/)[^/?#]+\.(png|jpe?g|webp|gif|svg|avif|bmp|ico)(?:[?#].*)?$/i.test(clean)) {
    return clean;
  }

  if (/^gs:\/\//i.test(clean)) {
    try {
      const signed = await getDownloadURL(storageRef(storage, clean));
      if (signed) {
        lecturaCoverUrlCache.set(clean, signed);
        return signed;
      }
    } catch (_) {
      lecturaCoverUrlCache.set(clean, "");
      lecturaCoverFailedRefs.add(clean);
      return "";
    }
  }

  const normalizedPath = String(clean)
    .replace(/^https?:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\//i, "")
    .replace(/\?alt=media.*$/i, "")
    .trim();
  try {
    const signed = await getDownloadURL(storageRef(storage, normalizedPath || clean));
    if (signed) {
      lecturaCoverUrlCache.set(clean, signed);
      return signed;
    }
  } catch (_) {
    lecturaCoverUrlCache.set(clean, "");
    lecturaCoverFailedRefs.add(clean);
    return "";
  }

  return clean;
}

async function _lecturasGameWithTimeout(promise, timeoutMs = 900) {
  let timerId = null;
  const timeoutPromise = new Promise((resolve) => {
    timerId = setTimeout(() => resolve(""), Math.max(120, Number(timeoutMs) || 900));
  });
  const value = await Promise.race([Promise.resolve(promise).catch(() => ""), timeoutPromise]);
  if (timerId) clearTimeout(timerId);
  return String(value || "").trim();
}

async function hydrateCoverImages(lecturas = [], options = {}) {
  const rows = Array.isArray(lecturas) ? lecturas : [];
  if (!rows.length) return;
  const timeoutMs = Math.max(180, Number(options?.timeoutMs || 900));
  const concurrency = Math.max(1, Math.min(6, Number(options?.concurrency || 4)));
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, rows.length) }).map(async () => {
    while (cursor < rows.length) {
      const idx = cursor++;
      const lectura = rows[idx];
      if (!lectura) continue;
      const baseUrl = resolveLecturaCoverImage(lectura);
      if (!baseUrl) continue;
      const resolved = await _lecturasGameWithTimeout(resolveCoverUrlForDisplay(baseUrl), timeoutMs);
      let finalUrl = resolved;
      if (!finalUrl || !isDirectRenderableImageUrl(finalUrl)) {
        const fallbackBase = sanitizeImageCandidate(resolveLecturaCoverFallbackImage(lectura));
        if (fallbackBase && fallbackBase !== baseUrl) {
          finalUrl = await _lecturasGameWithTimeout(resolveCoverUrlForDisplay(fallbackBase), timeoutMs);
        }
      }
      if (!finalUrl || !isDirectRenderableImageUrl(finalUrl)) continue;
      if (lecturaCoverFailedRefs.has(baseUrl) && baseUrl !== finalUrl) {
        // Permite usar una portada alternativa aunque la ruta de primer párrafo esté caída.
        lecturaCoverFailedRefs.delete(baseUrl);
      }
      lectura.coverImageResolved = finalUrl;
      _lecturasGameSetCachedCardCover(lectura, finalUrl);
    }
  });
  await Promise.allSettled(workers);
}

async function _lecturasGamePrimeCardCoversFromSlides(lecturas = []) {
  const rows = Array.isArray(lecturas) ? lecturas : [];
  if (!rows.length) return false;
  let mutated = false;
  const queue = rows.filter((lectura) => {
    if (!lectura) return false;
    if (String(lectura?.coverImageResolved || "").trim()) return false;
    return true;
  });
  for (const lectura of queue) {
    const meta = resolveLecturaAgentFirstNarrativeMeta(lectura);
    if (!meta || typeof meta !== "object") continue;
    const cacheKey = `${meta.sourceCollection}:${meta.lecturaId}:${meta.paragraphHash}`;
    const cachedMap = getLecturasAgentLocalCacheIndex();
    const cachedUrl = sanitizeImageCandidate(cachedMap?.[cacheKey] || "");
    if (cachedUrl && isDirectRenderableImageUrl(cachedUrl)) {
      lectura.coverImageResolved = cachedUrl;
      _lecturasGameSetCachedCardCover(lectura, cachedUrl);
      mutated = true;
      continue;
    }
    const slide = {
      storagePath: _lecturasAgentBuildStoragePath(meta.payload, {
        paragraphHash: meta.paragraphHash,
        text: meta.text
      })
    };
    const storageUrl = await _lecturasAgentTryReadStorageUrl(slide).catch(() => "");
    if (!storageUrl) continue;
    lectura.coverImageResolved = storageUrl;
    _lecturasGameSetCachedCardCover(lectura, storageUrl);
    lecturasAgentViewerState.memCache.set(cacheKey, storageUrl);
    mutated = true;
  }
  if (mutated) _lecturasAgentPersistCacheStore();
  return mutated;
}

function _lecturasGameQueueCardCoverResolve(lectura = null) {
  if (!lectura || typeof lectura !== "object") return;
  const sourceCollection = String(lectura?.sourceCollection || "").trim();
  const lecturaId = String(lectura?.id || "").trim();
  const fallbackKey = String(lecturaKey(lectura) || lectura?.titulo || "").trim();
  const resolveKey = sourceCollection && lecturaId
    ? `${sourceCollection}::${lecturaId}`
    : `fallback::${fallbackKey}`;
  if (!resolveKey || resolveKey === "fallback::") return;
  const now = Date.now();
  const currentState = lecturaCoverResolveState.get(resolveKey);
  const status = typeof currentState === "string"
    ? currentState
    : String(currentState?.status || "");
  const attempts = Math.max(0, Number(currentState?.attempts || 0));
  const retryAt = Number(currentState?.retryAt || 0);
  if (status === "pending" || status === "done") return;
  if (status === "failed" && retryAt > now) return;
  if (status === "failed" && attempts >= 6) return;
  lecturaCoverResolveState.set(resolveKey, { status: "pending", attempts, retryAt: 0 });
  Promise.resolve().then(async () => {
    let resolved = "";
    const candidate = sanitizeImageCandidate(resolveLecturaCoverImage(lectura));
    if (candidate && lecturaCoverFailedRefs.has(candidate)) {
      lecturaCoverResolveState.set(resolveKey, { status: "failed", attempts: attempts + 1, retryAt: Date.now() + 30000 });
      return;
    }
    if (candidate) {
      resolved = await resolveCoverUrlForDisplay(candidate).catch(() => "");
    }
    if (!resolved) {
      const fallbackCandidate = sanitizeImageCandidate(resolveLecturaCoverFallbackImage(lectura));
      if (fallbackCandidate && fallbackCandidate !== candidate) {
        resolved = await resolveCoverUrlForDisplay(fallbackCandidate).catch(() => "");
      }
    }
    if (!resolved && sourceCollection && lecturaId) {
      resolved = await _lecturasGameResolveAgentImageByDoc(sourceCollection, lecturaId).catch(() => "");
    }
    if (resolved) {
      lectura.coverImageResolved = resolved;
      _lecturasGameSetCachedCardCover(lectura, resolved);
      lecturaCoverResolveState.set(resolveKey, { status: "done", attempts: attempts + 1, retryAt: 0 });
      renderLecturaCards();
      return;
    }
    lecturaCoverResolveState.set(resolveKey, {
      status: "failed",
      attempts: attempts + 1,
      retryAt: Date.now() + 2200
    });
    setTimeout(() => {
      renderLecturaCards();
    }, 2300);
  }).catch(() => {
    lecturaCoverResolveState.set(resolveKey, {
      status: "failed",
      attempts: attempts + 1,
      retryAt: Date.now() + 2200
    });
    setTimeout(() => {
      renderLecturaCards();
    }, 2300);
  });
}

function lecturaPublishedAgoLabel(lectura = {}) {
  const raw = lectura?.raw || {};
  const candidates = [
    raw?.publishedAt,
    raw?.fechaPublicacion,
    raw?.fechaPublicado,
    raw?.createdAt,
    raw?.updatedAt
  ];
  let found = null;
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (candidate instanceof Date) {
      found = candidate;
      break;
    }
    if (typeof candidate?.toDate === "function") {
      try {
        const dt = candidate.toDate();
        if (dt instanceof Date && !Number.isNaN(dt.getTime())) {
          found = dt;
          break;
        }
      } catch (_) { }
    }
    if (typeof candidate?.seconds === "number") {
      const dt = new Date(candidate.seconds * 1000);
      if (!Number.isNaN(dt.getTime())) {
        found = dt;
        break;
      }
    }
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      const ms = candidate > 1e12 ? candidate : candidate * 1000;
      const dt = new Date(ms);
      if (!Number.isNaN(dt.getTime())) {
        found = dt;
        break;
      }
    }
    if (typeof candidate === "string") {
      const dt = new Date(candidate);
      if (!Number.isNaN(dt.getTime())) {
        found = dt;
        break;
      }
    }
  }

  if (!found) return "Published";
  const diffDays = Math.max(0, Math.floor((Date.now() - found.getTime()) / 86400000));
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 7) return `${diffDays} days ago`;
  const weeks = Math.floor(diffDays / 7);
  if (weeks <= 1) return "1 week ago";
  if (weeks < 5) return `${weeks} weeks ago`;
  const months = Math.floor(diffDays / 30);
  if (months <= 1) return "1 month ago";
  return `${months} months ago`;
}

function estimateReadMinutes(lectura = {}) {
  const text = htmlToPlainText(lectura?.htmlLectura || lectura?.raw?.contenidoHTML || "");
  const words = text.split(/\s+/).filter(Boolean).length;
  if (!words) return 4;
  return Math.max(3, Math.min(15, Math.round(words / 180)));
}

function renderLecturaCards() {
  if (!els.lecturaCards || !els.lecturaEmpty) return;
  const rawPool = getSearchFilteredLecturas();
  const pool = (navigator.onLine === false
    ? rawPool.filter((lectura) => _lecturasGameIsOfflineCardAvailable(lecturaKey(lectura), lectura))
    : rawPool)
    .sort((a, b) => {
      const gA = Number(a.grado);
      const gB = Number(b.grado);
      if (Number.isFinite(gA) && Number.isFinite(gB) && gA !== gB) return gA - gB;
      if (String(a.grado || "") !== String(b.grado || "")) {
        return String(a.grado || "").localeCompare(String(b.grado || ""), "es", { sensitivity: "base", numeric: true });
      }
      return String(a.titulo || "").localeCompare(String(b.titulo || ""), "es", { sensitivity: "base" });
    });

  if (!pool.length) {
    els.lecturaCards.innerHTML = "";
    els.lecturaEmpty.hidden = false;
    if (navigator.onLine === false) {
      els.lecturaEmpty.textContent = "Modo offline: no hay cards descargadas disponibles.";
    } else {
      els.lecturaEmpty.textContent = "No hay lecturas publicadas para los filtros actuales.";
    }
    return;
  }

  els.lecturaEmpty.hidden = true;
  const byGrade = new Map();
  pool.forEach((lectura) => {
    const grade = String(lectura?.grado || "").trim() || "Sin grado";
    if (!byGrade.has(grade)) byGrade.set(grade, []);
    byGrade.get(grade).push(lectura);
  });
  const gradeOrder = sortGrades(Array.from(byGrade.keys()));

  els.lecturaCards.innerHTML = gradeOrder.map((grade) => {
    const items = byGrade.get(grade) || [];
    const cardsHtml = items.map((lectura, idx) => {
      const key = lecturaKey(lectura);
      const offlineReady = _lecturasGameIsOfflineCardAvailable(key, lectura);
      const downloadInfo = _lecturasGameDownloadStatusForKey(key);
      const updateNeeded = _lecturasGameIsUpdateNeededForLectura(lectura, key);
      const canDeleteOffline = offlineReady || (downloadInfo.status === "downloaded");
      const downloadIconSvg = downloadInfo.status === "downloading"
        ? `<svg class="lectura-svg-icon is-spin" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 1 10 10h-3.2A6.8 6.8 0 1 0 17 16.8l-2.2-2.2H22V22l-2.3-2.3A9.96 9.96 0 0 1 12 22 10 10 0 1 1 12 2z"/></svg>`
        : (canDeleteOffline
          ? `<svg class="lectura-svg-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z"/></svg>`
          : `<svg class="lectura-svg-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19 18H6.8A4.8 4.8 0 1 1 7 8.4a6 6 0 0 1 11.5 2A3.8 3.8 0 0 1 19 18zm-7-9v4.3l1.8-1.8 1.4 1.4-4.2 4.2-4.2-4.2 1.4-1.4 1.8 1.8V9H12z"/></svg>`);
      const iconStateClass = downloadInfo.status === "downloading"
        ? "is-downloading"
        : (canDeleteOffline ? "is-ready" : "is-idle");
      const downloadAction = canDeleteOffline ? "remove-offline-content" : "download-full-content";
      const downloadLabel = downloadInfo.status === "downloading"
        ? "DESCARGANDO"
        : (canDeleteOffline ? "ELIMINAR" : "DESCARGAR");
      const mediaVariant = idx % 3;
      const coverImageCandidate = sanitizeImageCandidate(resolveLecturaCoverImage(lectura));
      const coverImage = isDirectRenderableImageUrl(coverImageCandidate)
        ? coverImageCandidate
        : "";
      const publishedAgo = lecturaPublishedAgoLabel(lectura);
      return `
        <article class="lectura-card ${lecturaCollectionClass(lectura.sourceCollection)} is-reference-style" data-key="${escapeHtml(key)}" data-media-variant="${mediaVariant}" role="listitem">
          ${coverImage ? `<div class="lectura-card-media is-reference">
            ${offlineReady ? `<span class="lectura-offline-badge" aria-label="Offline">Offline</span>` : ""}
            <img class="lectura-card-cover-img" loading="lazy" decoding="async" src="${escapeHtml(coverImage)}" alt="${escapeHtml(lectura.titulo || "Lectura")}">
          </div>` : ""}
          <div class="lectura-card-body is-reference">
            <h3 class="lectura-title">${escapeHtml(lectura.titulo || "Lectura")}</h3>
          </div>
          <footer class="lectura-card-stats is-reference is-tone-${mediaVariant}">
            <button type="button" class="lectura-stat-item is-action lectura-download-btn" data-action="${downloadAction}" data-key="${escapeHtml(key)}" ${downloadInfo.status === "downloading" ? "disabled" : ""} title="${escapeHtml(publishedAgo)}">
              <span class="lectura-stat-value"><span class="lectura-download-icon ${iconStateClass}" aria-hidden="true">${downloadIconSvg}</span></span>
              <span class="lectura-stat-label">${downloadLabel}</span>
              ${(canDeleteOffline && updateNeeded) ? `<span class="lectura-download-update-tag">Actualización</span>` : ""}
            </button>
            <button type="button" class="lectura-stat-item is-action lectura-action-btn" data-action="read" data-key="${escapeHtml(key)}" ${navigator.onLine === false && !offlineReady ? "disabled" : ""}>
              <span class="lectura-action-icon-wrap"><span class="lectura-action-icon" aria-hidden="true"><svg class="lectura-svg-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M6 3h12a2 2 0 0 1 2 2v16l-4-2.4L12 21l-4-2.4L4 21V5a2 2 0 0 1 2-2zm2 4v2h8V7H8zm0 4v2h6v-2H8z"/></svg></span></span>
              <span class="lectura-stat-label">LEER</span>
            </button>
            <button type="button" class="lectura-stat-item is-action lectura-action-btn" data-action="game" data-key="${escapeHtml(key)}" ${navigator.onLine === false && !offlineReady ? "disabled" : ""}>
              <span class="lectura-action-icon-wrap"><span class="lectura-action-icon" aria-hidden="true"><svg class="lectura-svg-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M6 6h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zm1.8 2.2v7.6h8.4V8.2H7.8zm1.2 1.2H12v2.2h2.2v3H9V9.4zm8.6 1.1a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zm0 3.7a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2z"/></svg></span></span>
              <span class="lectura-stat-label">GAMES</span>
            </button>
          </footer>
        </article>
      `;
    }).join("");
    return `
      <section class="lectura-grade-group" data-grade="${escapeHtml(grade)}" role="group" aria-label="${escapeHtml(gradeLabel(grade))}">
        <h3 class="lectura-grade-group-title">${escapeHtml(gradeLabel(grade))}</h3>
        <div class="lectura-cards" role="list">
          ${cardsHtml}
        </div>
      </section>
    `;
  }).join("");
  _lecturasGameBindCardCoverErrorHandlers();
  _lecturasGameQueueVisibleCardCoverResolves();
}

function _lecturasGameQueueVisibleCardCoverResolves() {
  if (!els.lecturaCards) return;
  const cards = Array.from(els.lecturaCards.querySelectorAll(".lectura-card[data-key]"));
  const viewportTop = 0;
  const viewportBottom = window.innerHeight || document.documentElement.clientHeight || 0;
  cards.forEach((card) => {
    const key = String(card.getAttribute("data-key") || "").trim();
    if (!key) return;
    const row = state.lecturaByKey.get(key);
    if (!row || isDirectRenderableImageUrl(resolveLecturaCoverImage(row))) return;
    const rect = card.getBoundingClientRect();
    const isVisible = rect.bottom >= viewportTop - 80 && rect.top <= viewportBottom + 120;
    if (!isVisible) return;
    _lecturasGameQueueCardCoverResolve(row);
  });
}

function _lecturasGameBindCardCoverErrorHandlers() {
  if (!els.lecturaCards) return;
  const imgs = Array.from(els.lecturaCards.querySelectorAll(".lectura-card-cover-img"));
  imgs.forEach((img) => {
    if (img.dataset.coverErrBound === "1") return;
    img.dataset.coverErrBound = "1";
    img.addEventListener("error", () => {
      const card = img.closest(".lectura-card[data-key]");
      const key = String(card?.getAttribute("data-key") || "").trim();
      const failedSrc = sanitizeImageCandidate(img.getAttribute("src") || "");
      if (failedSrc) lecturaCoverFailedRefs.add(failedSrc);
      if (key) {
        const row = state.lecturaByKey.get(key);
        if (row) row.coverImageResolved = "";
        _lecturasGameDropCachedCardCoverByKey(key);
      }
      if (card) {
        const media = card.querySelector(".lectura-card-media.is-reference");
        if (media) media.remove();
      }
    }, { once: true });
  });
}

function renderScenes() {
  renderLecturaCards();
}

const LECTURAS_GAME_CROP_WORDS = ["BROTE", "RAIZ", "TALLO", "HOJA", "FLOR", "FRUTO", "SABER", "IDEA", "CONOCER"];

const LECTURAS_GAME_MODE = {
  CLOSED: "closed",
  GAME_SELECT: "game_select",
  MODE_SELECT: "mode_select",
  INSTRUCTION: "instruction",
  COUNTDOWN: "countdown",
  PLAYING: "playing",
  QUIZ: "quiz",
  WON: "won",
  LOST: "lost",
  RESUME_READING: "resume_reading"
};

const LECTURAS_GAME_PLAY_MODE = {
  SOLO: "solo",
  PAIR: "pair"
};
const LECTURAS_GAME_ORDER_DIFFICULTY = Object.freeze({
  NOVICE: "novice",
  EXPERT: "expert"
});
const LECTURAS_GAME_PAIR_SIDES = ["left", "right"];
const LECTURAS_GAME_IDS = Object.freeze({
  SYNONYMS: "synonyms",
  ORDER: "order",
  TRACE: "trace",
  CAPS: "caps",
  MINEBLOX: "mineblox"
});
const LECTURAS_GAME_ORDER_SILENCE_TIMEOUT_MS = 25000;
const LECTURAS_GAME_ORDER_RECOVER_LISTEN_DELAY_MS = 300;
const LECTURAS_GAME_ORDER_MAX_CONSECUTIVE_ERRORS = 3;
const LECTURAS_GAME_ORDER_IDLE_LOSE_MS = 300000;
const LECTURAS_GAME_ORDER_QUIZ_EVERY_PARAGRAPHS = 3;
const LECTURAS_GAME_ORDER_FAILURE_FEEDBACK_MS = 980;

const LECTURAS_GAME_ORDER_VOICE_STATE = Object.freeze({
  IDLE: "idle",
  COUNTDOWN: "countdown",
  READY_TO_LISTEN: "ready_to_listen",
  ARMING_MIC: "arming_mic",
  LISTENING: "listening",
  EVALUATING: "evaluating",
  RETRY_PHRASE: "retry_phrase",
  SUCCESS: "success",
  MIC_MANUAL_RETRY: "mic_manual_retry"
});

const LECTURAS_GAME_POWERUP_WORD = "firePow";
const LECTURAS_GAME_POWERUP_TYPES = Object.freeze({
  FIRE: "fire",
  ICE: "ice",
  PACIFIST: "pacifist",
  BOMB: "bomb",
  CHAOS: "chaos"
});
const LECTURAS_GAME_POWERUP_LABELS = Object.freeze({
  [LECTURAS_GAME_POWERUP_TYPES.FIRE]: "firePow",
  [LECTURAS_GAME_POWERUP_TYPES.ICE]: "IcePow",
  [LECTURAS_GAME_POWERUP_TYPES.PACIFIST]: "Skip",
  [LECTURAS_GAME_POWERUP_TYPES.BOMB]: "bomb",
  [LECTURAS_GAME_POWERUP_TYPES.CHAOS]: "Rush"
});
const LECTURAS_GAME_FIRE_MODE_MS = 10000;
const LECTURAS_GAME_BOMB_READY_MS = 14000;
const LECTURAS_GAME_BOMB_CHARGE_MS = 2200;
const LECTURAS_GAME_CONTINUE_PARTIDA_GEMS_COST = 1;
const LECTURAS_GAME_FIRE_THROW_COOLDOWN_MS = 240;
const LECTURAS_GAME_MAX_FIREBALLS = 8;
const LECTURAS_GAME_POWERUP_SPAWN_DELAY_MS = 2200;
const LECTURAS_GAME_POWERUP_RESPAWN_MIN_MS = 5000;
const LECTURAS_GAME_POWERUP_RESPAWN_MAX_MS = 6000;
const LECTURAS_GAME_FIREBALL_SPEED = 760;
const LECTURAS_GAME_MIN_CHARGE_MS = 150;
const LECTURAS_GAME_MAX_CHARGE_MS = 1700;
const LECTURAS_GAME_MAX_FIRE_TRAIL_POINTS = 20;

const lecturasGameServiceRegistry = createLecturasGameServiceRegistry({
  buildSynonymsRound: _lecturasGameBuildRoundFromLectura,
  buildOrderRound: _lecturasGameBuildOrderRoundFromLectura,
  buildTraceRound: _lecturasGameBuildTraceRoundFromLectura,
  buildCapsRound: null, // Caps has its own dedicated app
  applyOrderStageWords: _lecturasGameApplyOrderStageWords
});

function _lecturasGameGetPowerupSpawnDelayMs(runtime = lecturasGameModeRuntime) {
  const level = Math.max(1, Number(runtime?.progress?.level || 1));
  const burstBias = Math.max(0, Math.min(2200, (level - 1) * 240));
  const minMs = Math.max(2200, LECTURAS_GAME_POWERUP_RESPAWN_MIN_MS - burstBias);
  const maxMs = Math.max(minMs + 160, LECTURAS_GAME_POWERUP_RESPAWN_MAX_MS - burstBias);
  return Math.round(minMs + (Math.random() * Math.max(0, maxMs - minMs)));
}

function _lecturasGameNormalizeGameId(gameId = "") {
  const key = String(gameId || "").trim().toLowerCase();
  if (key === LECTURAS_GAME_IDS.ORDER || key === "ordena") return LECTURAS_GAME_IDS.ORDER;
  if (key === LECTURAS_GAME_IDS.TRACE || key === "trazos") return LECTURAS_GAME_IDS.TRACE;
  if (key === LECTURAS_GAME_IDS.CAPS || key === "mayusculas" || key === "caza-mayusculas") return LECTURAS_GAME_IDS.CAPS;
  if (key === LECTURAS_GAME_IDS.MINEBLOX || key === "minecraft" || key === "roblox") return LECTURAS_GAME_IDS.MINEBLOX;
  return LECTURAS_GAME_IDS.SYNONYMS;
}

function _lecturasGameGetGameTitle(gameId = "") {
  const id = _lecturasGameNormalizeGameId(gameId);
  if (id === LECTURAS_GAME_IDS.ORDER) return "ATRÁPALO EN ORDEN";
  if (id === LECTURAS_GAME_IDS.TRACE) return "TRAZANDO LETRAS";
  if (id === LECTURAS_GAME_IDS.CAPS) return "CAZA MAYÚSCULAS";
  if (id === LECTURAS_GAME_IDS.MINEBLOX) return "ASCraft (BETA)";
  return "PROTEGE AL SINÓNIMO";
}

function _lecturasGameReadForcedGameId() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    const debugMode = params.get("gameDebug") === "1";
    const allowGlobalForce = window.__LECTURAS_GAME_ALLOW_FORCE_GAME__ === true;
    if (allowGlobalForce) {
      const fromGlobal = resolveForcedGameId(window.__LECTURAS_GAME_FORCE_GAME__ || "");
      if (fromGlobal) return fromGlobal;
    }
    const fromParam = resolveForcedGameId(params.get("game") || "");
    if (fromParam) return fromParam;
    if (!debugMode) return "";
    return "";
  } catch (_) {
    return "";
  }
}

function _lecturasGameIsOrderChallenge(runtime = lecturasGameModeRuntime) {
  return _lecturasGameNormalizeGameId(runtime?.challengeType || runtime?.selectedGameId || "") === LECTURAS_GAME_IDS.ORDER;
}

function _lecturasGameIsTraceChallenge(runtime = lecturasGameModeRuntime) {
  return _lecturasGameNormalizeGameId(runtime?.challengeType || runtime?.selectedGameId || "") === LECTURAS_GAME_IDS.TRACE;
}

function _lecturasGameIsMinebloxChallenge(runtime = lecturasGameModeRuntime) {
  return _lecturasGameNormalizeGameId(runtime?.challengeType || runtime?.selectedGameId || "") === LECTURAS_GAME_IDS.MINEBLOX;
}

function _lecturasGameGetSpeechRecognitionCtor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function _lecturasGamePickSpeechLang() {
  const langs = Array.isArray(navigator?.languages) ? navigator.languages : [];
  const preferred = langs.map((item) => String(item || "").toLowerCase()).filter(Boolean);
  if (preferred.includes("es-mx")) return "es-MX";
  if (preferred.some((item) => item.startsWith("es-419"))) return "es-419";
  if (preferred.some((item) => item.startsWith("es-us"))) return "es-US";
  if (preferred.some((item) => item.startsWith("es"))) return "es-ES";
  return "es-MX";
}

function _lecturasGameCreatePlayerSummary(side = "left") {
  return {
    side: side === "right" ? "right" : "left",
    wrongRemaining: 0,
    fireModeActive: false,
    powerupActive: false,
    fireballsCount: 0,
    pose: { joints: [], segments: [], confidence: 0 },
    poseLastSeenMs: 0
  };
}

function _lecturasGameCreatePairSideState(side = "left", nowMs = performance.now()) {
  const baseNow = Number(nowMs || performance.now());
  return {
    side: side === "right" ? "right" : "left",
    powerup: null,
    powerupCollectedThisLevel: false,
    powerupSpawnAtMs: baseNow + LECTURAS_GAME_POWERUP_SPAWN_DELAY_MS,
    fireModeUntilMs: 0,
    fireModeType: LECTURAS_GAME_POWERUP_TYPES.FIRE,
    freezeUntilMs: 0,
    pacifistUntilMs: 0,
    chaosUntilMs: 0,
    bombReadyUntilMs: 0,
    bombActivatedAtMs: 0,
    bombChestHoldStartMs: 0,
    bombChargeNorm: 0,
    synonymsTutorialSeen: false
  };
}

const lecturasGameModeRuntime = {
  token: 0,
  active: false,
  mode: LECTURAS_GAME_MODE.CLOSED,
  lectura: null,
  ref: null,
  shouldResumeNarration: false,
  previousLiveState: "idle",
  pausedByGame: false,
  selectedGameId: "",
  forcedGameId: "",
  activeServiceId: LECTURAS_GAME_IDS.SYNONYMS,
  selectedPlayMode: LECTURAS_GAME_PLAY_MODE.SOLO,
  selectedOrderDifficulty: LECTURAS_GAME_ORDER_DIFFICULTY.NOVICE,
  menuStep: "game_select",
  challengeType: LECTURAS_GAME_IDS.SYNONYMS,
  plannedNextChallenge: null,
  round: null,
  words: [],
  particles: [],
  firePickupFx: null,
  levelTransitionFx: null,
  forceNextBackgroundTransition: false,
  silhouette: {
    enabled: false,
    preferReal: false,
    proceduralFallback: false,
    debugShowSkeleton: true,
    realAlpha: 0.88,
    maskThreshold: 0.38,
    maskUpdateIntervalMs: 85,
    maskPersistenceMs: 120,
    lastMaskUpdateMs: 0,
    bySide: { solo: null, left: null, right: null },
    tempCanvas: null,
    tempCtx: null
  },
  players: {
    left: _lecturasGameCreatePlayerSummary("left"),
    right: _lecturasGameCreatePlayerSummary("right")
  },
  pairSideState: {
    left: _lecturasGameCreatePairSideState("left"),
    right: _lecturasGameCreatePairSideState("right")
  },
  playerAccounts: {
    solo: { username: "", alias: "", fullName: "", uidOwner: "", loggedIn: false, displayName: "Invitado" },
    left: { username: "", alias: "", fullName: "", uidOwner: "", loggedIn: false, displayName: "Jugador A" },
    right: { username: "", alias: "", fullName: "", uidOwner: "", loggedIn: false, displayName: "Jugador B" }
  },
  poseRaw: { joints: [], segments: [], confidence: 0, updatedAt: 0 },
  poseStable: { joints: [], segments: [], confidence: 0, updatedAt: 0 },
  pose: { joints: [], segments: [], confidence: 0, updatedAt: 0 },
  removedWrongCount: 0,
  totalWrongCount: 0,
  touchedCorrect: false,
  cameraReady: false,
  cameraError: "",
  cameraStatus: "Cámara no iniciada",
  allowSimulatedPose: false,
  useSimulatedPose: false,
  autoStartInDebug: false,
  simAvatar: { x: 480, y: 380, vx: 0, vy: 0 },
  inputKeys: { left: false, right: false, up: false, down: false },
  countdownMs: 3000,
  roundElapsedMs: 0,
  roundTimeLimitMs: 60000,
  nextSpawnResetAt: 0,
  recentHits: new Map(),
  powerup: null,
  powerupCollectedThisLevel: false,
  powerupSpawnAtMs: 0,
  fireModeActive: false,
  fireModeUntilMs: 0,
  fireModeType: LECTURAS_GAME_POWERUP_TYPES.FIRE,
  bombReadyUntilMs: 0,
  bombActivatedAtMs: 0,
  bombChestHoldStartMs: 0,
  bombChargeNorm: 0,
  fireballs: [],
  lastThrowMs: 0,
  lastThrowVector: { x: 0, y: -1 },
  wristHistory: {},
  fireThrowCooldownMs: LECTURAS_GAME_FIRE_THROW_COOLDOWN_MS,
  simFireQueued: false,
  simFireCharging: false,
  simFireChargeStartMs: 0,
  simFireReleasePending: false,
  hands: {
    left: {
      closed: false,
      justReleased: false,
      releaseByGesture: false,
      traceDrawGesture: false,
      gestureScore: 0,
      gestureActiveFrames: 0,
      gestureInactiveFrames: 0,
      fistMetric: 1,
      chargeStartMs: 0,
      chargeMs: 0,
      chargeNorm: 0,
      confidence: 0,
      wrist: null,
      palm: null,
      aim: null,
      velocity: { x: 0, y: 0 },
      lastValidAim: { x: 0.6, y: -0.4 },
      lastReleaseMs: 0,
      lastSeenMs: 0,
      missingSinceMs: 0
    },
    right: {
      closed: false,
      justReleased: false,
      releaseByGesture: false,
      traceDrawGesture: false,
      gestureScore: 0,
      gestureActiveFrames: 0,
      gestureInactiveFrames: 0,
      fistMetric: 1,
      chargeStartMs: 0,
      chargeMs: 0,
      chargeNorm: 0,
      confidence: 0,
      wrist: null,
      palm: null,
      aim: null,
      velocity: { x: 0, y: 0 },
      lastValidAim: { x: -0.6, y: -0.4 },
      lastReleaseMs: 0,
      lastSeenMs: 0,
      missingSinceMs: 0
    }
  },
  chargeConfig: {
    minMs: LECTURAS_GAME_MIN_CHARGE_MS,
    maxMs: LECTURAS_GAME_MAX_CHARGE_MS,
    closeThreshold: 0.8,
    openThreshold: 0.95
  },
  directionFilter: {
    maxDownwardY: 0.52
  },
  handTrackingLostResetMs: 140,
  handSmoothing: {
    positionAlpha: 0.74,
    aimAlpha: 0.6,
    velocityAlpha: 0.5,
    deadzonePx: 0.24,
    maxStepPx: 64,
    speedPxWindow: 18
  },
  poseSmoothing: {
    soloAlphaMin: 0.46,
    soloAlphaMax: 0.82,
    pairAlphaMin: 0.44,
    pairAlphaMax: 0.8,
    jointDeadzonePx: 0.55,
    segmentDeadzonePx: 0.5,
    maxJointStepPx: 64,
    maxSegmentStepPx: 68,
    speedPxWindow: 24,
    confidenceHoldFloor: 0.34,
    reacquireJumpPx: 170
  },
  handInteractionRadiusPx: 8,
  useSegmentCollisions: false,
  jointRadiusConfig: {
    head: 14,
    leftWrist: 14,
    rightWrist: 14,
    torso: 18
  },
  stream: null,
  videoEl: null,
  canvasEl: null,
  poseCanvasEl: null,
  ctx: null,
  poseCtx: null,
  rafId: 0,
  lastTickMs: 0,
  viewWidth: 960,
  viewHeight: 540,
  ui: {},
  audioCtx: null,
  gameMusic: {
    audioEl: null,
    url: "",
    lastError: "",
    startedAtLevel: 0,
    baseVolume: 0.54,
    duckingActive: false,
    preDuckVolume: 0.54
  },
  realtimeSyncTimerId: 0,
  realtimeSyncLastMs: 0,
  quiz: null,
  quizPendingAfterWin: false,
  offlinePack: {
    status: "idle", // idle | downloading | ready | stale | error
    progress: 0,
    downloadedAt: 0,
    error: "",
    bytesCached: 0
  },
  poseLandmarker: null,
  handLandmarker: null,
  poseLastDetectMs: 0,
  handLastDetectMs: 0,
  poseLastSeenMs: 0,
  poseDetectStartMs: 0,
  poseDetectIntervalMs: 16,
  handDetectIntervalMs: 12,
  deterministicFrameMs: 1000 / 60,
  traceLayout: {
    baselineRatio: 0.56,
    avatarOffsetYDelta: -72
  },
  poseRenderScale: 0.58,
  poseRenderOffsetY: 86
  ,
  checkpoint: null,
  menuBackgroundTimerId: 0,
  menuBackgroundIndex: 0,
  gameBackgroundUrls: [],
  gameBackgroundUrl: "",
  gameBackgroundLastUrl: "",
  gameBackgroundImage: null,
  gameBackgroundImageReady: false,
  pencilSprite: {
    image: null,
    ready: false,
    loading: false,
    failed: false
  },
  backgroundTransition: null,
  autoNextTimerId: 0,
  handStartHoldMs: 720,
  handStartHoverSince: 0,
  handStartPending: false,
  handStartLabelDefault: "Iniciar ronda",
  handRetryHoldMs: 720,
  handRetryHoverSince: 0,
  handRetryPending: false,
  handRetryLabelDefault: "Jugar otra vez",
  handTraceResetPending: false,
  handMicPending: false,
  completionType: "",
  isChampion: false,
  championName: "",
  readingCampaign: {
    readingCursor: 0,
    totalReadingUnits: 0,
    consecutivePronunciationErrors: 0,
    idleSinceMs: 0,
    perfectRun: true,
    lastQuizCheckpoint: 0,
    pronouncedCorrectWords: 0,
    pronouncedWrongWords: 0
  },
  orderDemo: {
    awaitingPlayback: false,
    playing: false,
    completed: false,
    runId: 0,
    phraseText: "",
    phraseIndex: 0,
    lastError: "",
    pollTimerId: 0
  },
  orderVoice: {
    supported: false,
    recognition: null,
    state: LECTURAS_GAME_ORDER_VOICE_STATE.IDLE,
    attemptId: 0,
    attempt: null,
    starting: false,
    listening: false,
    listeningSince: 0,
    silenceDeadline: 0,
    hasDetectedSpeech: false,
    recoverableErrorRetries: 0,
    manualRetryRequired: false,
    processedWordCount: 0,
    lastError: "",
    lastErrorAt: 0,
    lastTransition: "",
    lastTransitionAt: 0,
    attemptSettled: false,
    recoveryInFlight: false,
    resetSamePhraseAt: 0,
    countdownStartAt: 0,
    countdownUntilMs: 0,
    expectedPhrase: "",
    lastTranscript: "",
    lastTranscriptAll: "",
    lastFinalTranscript: "",
    lastValidation: "",
    nextAutoStartAt: 0,
    validationGraceUntilMs: 0,
    listenStartedAt: 0,
    autoStopTimer: 0,
    promptVersion: 0,
    spellMode: false,
    expectedLetters: [],
    alternatives: [],
    bestAlternative: "",
    bestAltText: "",
    bestAltScore: 0,
    bestAltConfidence: 0,
    lastRejectReason: "",
    spellRetryCount: 0,
    prosodyCaptureActive: false,
    prosodyTimerId: 0,
    prosodySampleRate: 44100,
    prosodySamples: [],
    prosodyStream: null,
    prosodyUsesMainStream: false,
    prosodySource: null,
    prosodyAnalyser: null
  },
  progress: {
    level: 1,
    score: 0,
    sideScores: { left: 0, right: 0 },
    gems: 0,
    nextGemScoreMilestone: LECTURAS_GAME_GEMS_PER_SCORE,
    rewardMessage: ""
  },
  three: {
    enabled: false,
    ready: false,
    lib: null,
    container: null,
    renderer: null,
    scene: null,
    camera: null,
    popBursts: [],
    ambient: null,
    dirLight: null
  }
};

function _lecturasGameDeepClone(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return null;
  }
}

function _lecturasGameResolveCurrentGameMusicUrl(runtime = lecturasGameModeRuntime) {
  const lectura = runtime?.lectura || {};
  const assets = (lectura?.musicAssets && typeof lectura.musicAssets === "object") ? lectura.musicAssets : {};
  const raw = lectura?.raw || {};
  const music = raw?.music || raw?.musica || {};
  return String(
    assets?.gameUrl
    || music?.gameUrl
    || music?.juegoUrl
    || raw?.musicGameUrl
    || ""
  ).trim();
}

function _lecturasGameResolveCurrentGameMusicPath(runtime = lecturasGameModeRuntime) {
  const lectura = runtime?.lectura || {};
  const assets = (lectura?.musicAssets && typeof lectura.musicAssets === "object") ? lectura.musicAssets : {};
  const raw = lectura?.raw || {};
  const music = raw?.music || raw?.musica || {};
  return String(
    assets?.gamePath
    || music?.gamePath
    || music?.juegoPath
    || raw?.musicGamePath
    || ""
  ).trim();
}

async function _lecturasGameResolvePlayableGameMusicUrl(runtime = lecturasGameModeRuntime) {
  const fromUrl = String(_lecturasGameResolveCurrentGameMusicUrl(runtime) || "").trim();
  const fromPath = String(_lecturasGameResolveCurrentGameMusicPath(runtime) || "").trim();
  const rawInput = fromUrl || fromPath;
  if (!rawInput) return "";
  const clean = String(rawInput).replace(/^["']+|["']+$/g, "").trim();
  if (!clean) return "";
  if (/^(https?:|blob:|data:|\/)/i.test(clean)) return clean;
  if (/^gs:\/\//i.test(clean)) {
    const gs = parseGsPath(clean);
    try {
      return await getDownloadURL(storageRef(storage, clean));
    } catch (_) {
      return buildStorageAltMediaUrl(gs?.path || "", gs?.bucket || "");
    }
  }
  try {
    return await getDownloadURL(storageRef(storage, clean));
  } catch (_) {
    return buildStorageAltMediaUrl(clean);
  }
}

function _lecturasGameResolveCurrentGameMusicBpm(runtime = lecturasGameModeRuntime) {
  const lectura = runtime?.lectura || {};
  const assetsCfg = lectura?.musicAssets?.musicConfig || null;
  const raw = lectura?.raw || {};
  const music = raw?.music || raw?.musica || {};
  const rawCfg = music?.musicConfig || raw?.musicConfig || assetsCfg || {};
  const fromCfg = Number(rawCfg?.game?.bpm || rawCfg?.gameBpm || rawCfg?.bpm);
  if (Number.isFinite(fromCfg) && fromCfg >= 60 && fromCfg <= 220) return Math.round(fromCfg);
  const fromLocal = Number(localStorage.getItem("cb_lyria_game_bpm") || 156);
  if (Number.isFinite(fromLocal) && fromLocal >= 60 && fromLocal <= 220) return Math.round(fromLocal);
  return 156;
}

function _lecturasGameGetMusicBeatFallFactor(runtime = lecturasGameModeRuntime) {
  const audioEl = runtime?.gameMusic?.audioEl;
  if (!audioEl || audioEl.paused) return 1;
  const bpm = _lecturasGameResolveCurrentGameMusicBpm(runtime);
  const time = Number(audioEl.currentTime || 0);
  const beatPhase = (time * bpm / 60) % 1;
  const wave = Math.sin(beatPhase * Math.PI * 2);
  return 0.84 + (Math.max(0, wave) * 0.48);
}

function _lecturasGameResetGameMusic(runtime = lecturasGameModeRuntime) {
  runtime.gameMusic = runtime.gameMusic || {};
  runtime.gameMusic.audioEl = null;
  runtime.gameMusic.url = "";
  runtime.gameMusic.lastError = "";
  runtime.gameMusic.startedAtLevel = 0;
  runtime.gameMusic.baseVolume = Number(runtime.gameMusic.baseVolume || 0.54);
  runtime.gameMusic.duckingActive = false;
  runtime.gameMusic.preDuckVolume = Number(runtime.gameMusic.preDuckVolume || runtime.gameMusic.baseVolume || 0.54);
}

function _lecturasGameSetGameMusicDucking(active = false, runtime = lecturasGameModeRuntime) {
  runtime.gameMusic = runtime.gameMusic || {};
  const gm = runtime.gameMusic;
  const audioEl = gm.audioEl;
  const baseVolume = Math.max(0.05, Math.min(1, Number(gm.baseVolume || 0.54)));
  if (!(audioEl instanceof HTMLAudioElement)) return;
  if (active) {
    if (gm.duckingActive === true) return;
    gm.duckingActive = true;
    gm.preDuckVolume = Number.isFinite(Number(audioEl.volume)) ? Number(audioEl.volume) : baseVolume;
    audioEl.volume = Math.max(0.03, Math.min(0.28, baseVolume * 0.34));
    return;
  }
  if (gm.duckingActive !== true) return;
  gm.duckingActive = false;
  const restore = Number.isFinite(Number(gm.preDuckVolume)) ? Number(gm.preDuckVolume) : baseVolume;
  audioEl.volume = Math.max(0, Math.min(1, restore));
}

function _lecturasGameShouldKeepMusicPausedForOrder(runtime = lecturasGameModeRuntime) {
  if (!_lecturasGameIsOrderChallenge(runtime)) return false;
  const voice = runtime?.orderVoice || {};
  const phrase = _lecturasGameGetCurrentOrderPhrase(runtime);
  if (!phrase) return false;
  const mode = String(runtime?.mode || "");
  const trapActive = runtime?.round?.orderTrapActive === true;
  if (trapActive) return false;
  if (mode === LECTURAS_GAME_MODE.COUNTDOWN) return true;
  if (mode !== LECTURAS_GAME_MODE.PLAYING) return false;
  const state = String(voice.state || "");
  return new Set([
    LECTURAS_GAME_ORDER_VOICE_STATE.COUNTDOWN,
    LECTURAS_GAME_ORDER_VOICE_STATE.READY_TO_LISTEN,
    LECTURAS_GAME_ORDER_VOICE_STATE.ARMING_MIC,
    LECTURAS_GAME_ORDER_VOICE_STATE.LISTENING,
    LECTURAS_GAME_ORDER_VOICE_STATE.EVALUATING,
    LECTURAS_GAME_ORDER_VOICE_STATE.RETRY_PHRASE,
    LECTURAS_GAME_ORDER_VOICE_STATE.MIC_MANUAL_RETRY
  ]).has(state);
}

function _lecturasGameSetOrderReadingAudioState(reading = false, runtime = lecturasGameModeRuntime) {
  const gm = runtime?.gameMusic || {};
  const audioEl = gm.audioEl;
  if (!(audioEl instanceof HTMLAudioElement)) return;
  if (reading) {
    gm.orderPausedAt = Number(audioEl.currentTime || 0);
    gm.pausedForOrderReading = true;
    if (!audioEl.paused) {
      try { audioEl.pause(); } catch (_) { }
    }
    return;
  }
  if (_lecturasGameShouldKeepMusicPausedForOrder(runtime)) {
    gm.pausedForOrderReading = true;
    return;
  }
  if (gm.pausedForOrderReading) {
    gm.pausedForOrderReading = false;
    const resumeAt = Number(gm.orderPausedAt || 0);
    if (Number.isFinite(resumeAt) && resumeAt > 0) {
      try { audioEl.currentTime = Math.max(0, resumeAt); } catch (_) { }
    }
    Promise.resolve(audioEl.play?.()).catch(() => { });
  }
}

function _lecturasGameStopGameMusic(runtime = lecturasGameModeRuntime, _reason = "") {
  const gm = runtime.gameMusic || {};
  const audioEl = gm.audioEl || null;
  if (audioEl) {
    try { audioEl.pause(); } catch (_) { }
    try { audioEl.currentTime = 0; } catch (_) { }
    try { audioEl.src = ""; } catch (_) { }
    try { audioEl.load(); } catch (_) { }
  }
  _lecturasGameResetGameMusic(runtime);
}

function _lecturasGameEnsureGameMusicAudio(runtime = lecturasGameModeRuntime) {
  runtime.gameMusic = runtime.gameMusic || {};
  let audioEl = runtime.gameMusic.audioEl || null;
  if (!(audioEl instanceof HTMLAudioElement)) {
    audioEl = new Audio();
    audioEl.preload = "auto";
    audioEl.loop = true;
    runtime.gameMusic.audioEl = audioEl;
  }
  const baseVolume = Math.max(0.05, Math.min(1, Number(runtime.gameMusic.baseVolume || 0.54)));
  if (runtime.gameMusic.duckingActive !== true) {
    try { audioEl.volume = baseVolume; } catch (_) { }
  }
  return audioEl;
}

async function _lecturasGameStartGameMusicForLevel(runtime = lecturasGameModeRuntime, options = {}) {
  if (_lecturasGameIsMinebloxChallenge(runtime)) {
    _lecturasGameStopGameMusic(runtime, "mineblox");
    return true;
  }
  const restart = options?.restart !== false;
  const shouldPlay = options?.play !== false;
  const levelNow = Math.max(1, Number(runtime?.progress?.level || 1));
  const url = await _lecturasGameResolvePlayableGameMusicUrl(runtime);
  runtime.gameMusic = runtime.gameMusic || {};
  if (!url) {
    _lecturasGameStopGameMusic(runtime, "missing-url");
    runtime.gameMusic = runtime.gameMusic || {};
    runtime.gameMusic.lastError = "missing_or_unresolved_game_music_url";
    return false;
  }
  const audioEl = _lecturasGameEnsureGameMusicAudio(runtime);
  const urlChanged = String(runtime.gameMusic.url || "") !== url;
  if (urlChanged) {
    runtime.gameMusic.url = url;
    runtime.gameMusic.lastError = "";
    try { audioEl.pause(); } catch (_) { }
    audioEl.src = url;
    try { audioEl.load(); } catch (_) { }
  }
  if (restart || urlChanged || Number(runtime.gameMusic.startedAtLevel || 0) !== levelNow) {
    try { audioEl.currentTime = 0; } catch (_) { }
    runtime.gameMusic.startedAtLevel = levelNow;
  }
  if (runtime.gameMusic.duckingActive !== true) {
    try { audioEl.volume = Math.max(0.05, Math.min(1, Number(runtime.gameMusic.baseVolume || 0.54))); } catch (_) { }
  }
  if (!shouldPlay) {
    runtime.gameMusic.lastError = "";
    return true;
  }
  try {
    await audioEl.play();
    runtime.gameMusic.lastError = "";
    return true;
  } catch (err) {
    runtime.gameMusic.lastError = String(err?.message || err || "play_failed");
    return false;
  }
}

async function _lecturasGamePrepareCountdownAudio(runtime = lecturasGameModeRuntime) {
  if (_lecturasGameIsOrderChallenge(runtime)) {
    await _lecturasGameStartGameMusicForLevel(runtime, { restart: true, play: true });
    runtime.gameMusic = runtime.gameMusic || {};
    runtime.gameMusic.pausedForOrderReading = false;
    _lecturasGameSetGameMusicDucking(false, runtime);
    const voice = runtime.orderVoice || (runtime.orderVoice = {});
    const now = Number(performance.now() || Date.now());
    voice.countdownStartAt = now;
    voice.countdownUntilMs = now + Math.max(0, Number(runtime.countdownMs || 0));
    _lecturasGameRenderOrderPhraseUi(runtime);
    if (voice.listening !== true && voice.starting !== true && runtime?.round?.orderTrapActive !== true) {
      Promise.resolve(_lecturasGameStartOrderSpeech(runtime, { manual: true, allowCountdown: true }))
        .catch(() => false)
        .finally(() => {
          _lecturasGameRenderOrderPhraseUi(runtime);
        });
    }
    return;
  }
  await _lecturasGameStartGameMusicForLevel(runtime, { restart: true });
}

function _lecturasGameCurrentLecturaKey(runtime = lecturasGameModeRuntime) {
  const lectura = runtime?.lectura || {};
  return `${String(lectura?.sourceCollection || "").trim()}::${String(lectura?.id || "").trim()}`;
}

function _lecturasGameGetOrderDifficulty(runtime = lecturasGameModeRuntime) {
  const value = String(runtime?.selectedOrderDifficulty || "").trim().toLowerCase();
  return value === LECTURAS_GAME_ORDER_DIFFICULTY.EXPERT
    ? LECTURAS_GAME_ORDER_DIFFICULTY.EXPERT
    : LECTURAS_GAME_ORDER_DIFFICULTY.NOVICE;
}

function _lecturasGameGetOrderDifficultyLabel(runtime = lecturasGameModeRuntime) {
  return _lecturasGameGetOrderDifficulty(runtime) === LECTURAS_GAME_ORDER_DIFFICULTY.EXPERT
    ? "Experto"
    : "Novato";
}

function _lecturasGameCanContinue(runtime = lecturasGameModeRuntime) {
  const lecturaKeyNow = _lecturasGameCurrentLecturaKey(runtime);
  const cp = runtime?.checkpoint || null;
  if (!cp || !lecturaKeyNow) return false;
  if (String(cp.lecturaKey || "") !== lecturaKeyNow) return false;
  return !!cp.progress;
}

function _lecturasGameSaveCheckpoint(runtime = lecturasGameModeRuntime) {
  if (!runtime?.lectura || !runtime?.selectedGameId) return;
  const progressClone = _lecturasGameDeepClone(runtime.progress);
  if (!progressClone) return;
  runtime.checkpoint = {
    lecturaKey: _lecturasGameCurrentLecturaKey(runtime),
    selectedGameId: runtime.selectedGameId,
    challengeType: runtime.challengeType || LECTURAS_GAME_IDS.SYNONYMS,
    orderDifficulty: _lecturasGameGetOrderDifficulty(runtime),
    plannedNextChallenge: runtime.plannedNextChallenge || null,
    progress: progressClone,
    updatedAt: Date.now()
  };
}

function _lecturasGameStopMenuBackgroundRotation(runtime = lecturasGameModeRuntime) {
  if (runtime.menuBackgroundTimerId) {
    clearInterval(runtime.menuBackgroundTimerId);
    runtime.menuBackgroundTimerId = 0;
  }
  runtime.menuBackgroundIndex = 0;
}

let lecturasGamePoseLandmarkerPromise = null;
let lecturasGameHandLandmarkerPromise = null;
let lecturasGameVisionTasksPromise = null;

function _lecturasGameNormalizeWord(value = "") {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9ÑÜÁÉÍÓÚ ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function _lecturasGamePickRandom(items = []) {
  const arr = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)] || null;
}

function _lecturasGameShuffle(items = []) {
  const arr = Array.isArray(items) ? [...items] : [];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function _lecturasGameExtractWordPairsFromSinonimos(rawSinonimos = null) {
  const pairs = [];
  const addPair = (target = "", synonyms = []) => {
    const cleanTarget = _lecturasGameNormalizeWord(target);
    if (!cleanTarget) return;
    const cleanSynonyms = (Array.isArray(synonyms) ? synonyms : [synonyms])
      .map((item) => _lecturasGameNormalizeWord(item))
      .filter((item) => item && item !== cleanTarget);
    if (!cleanSynonyms.length) return;
    pairs.push({
      target: cleanTarget,
      synonyms: Array.from(new Set(cleanSynonyms))
    });
  };

  if (Array.isArray(rawSinonimos)) {
    rawSinonimos.forEach((item) => {
      if (!item || typeof item !== "object") return;
      const target = item.palabra || item.termino || item.término || item.word || "";
      const synonyms = Array.isArray(item.sinonimos)
        ? item.sinonimos
        : String(item.sinonimos || item.sinónimos || item.equivalente || "")
          .split(/[;,]/g)
          .map((s) => s.trim())
          .filter(Boolean);
      addPair(target, synonyms);
    });
    return pairs;
  }

  const raw = String(rawSinonimos || "").trim();
  if (!raw) return pairs;

  if (/<[a-z][\s\S]*>/i.test(raw)) {
    try {
      const wrap = document.createElement("div");
      wrap.innerHTML = raw;
      const rows = Array.from(wrap.querySelectorAll("table tr"));
      rows.forEach((tr) => {
        const cells = Array.from(tr.querySelectorAll("th,td"));
        if (cells.length < 2) return;
        const target = String(cells[0].textContent || "").trim();
        const synText = String(cells[1].textContent || "").trim();
        if (!target || !synText) return;
        const synonyms = synText.split(/[;,/]| y /gi).map((s) => s.trim()).filter(Boolean);
        addPair(target, synonyms);
      });
      if (pairs.length) return pairs;
      const plain = htmlToPlainText(raw);
      plain
        .split(/\n+|(?<=\.)\s+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => {
          const match = line.match(/^([^:=-]{2,})\s*[:=-]\s*(.+)$/);
          if (!match) return;
          addPair(match[1], String(match[2] || "").split(/[;,/]| y /gi));
        });
    } catch (_) {
      // fallback to plain parser
    }
  } else {
    raw
      .split(/\n+|[|]/g)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const match = line.match(/^([^:=-]{2,})\s*[:=-]\s*(.+)$/);
        if (!match) return;
        addPair(match[1], String(match[2] || "").split(/[;,/]| y /gi));
      });
  }

  return pairs;
}

function _lecturasGameExtractWordPairsFromHtmlTables(html = "") {
  const raw = String(html || "").trim();
  if (!raw) return [];
  const wrap = document.createElement("div");
  wrap.innerHTML = raw;
  const rows = Array.from(wrap.querySelectorAll("table tr"));
  const out = [];
  rows.forEach((tr) => {
    const cells = Array.from(tr.querySelectorAll("th,td"));
    if (cells.length < 2) return;
    const left = _lecturasGameNormalizeWord(String(cells[0]?.textContent || "").trim());
    const rightRaw = String(cells[1]?.textContent || "").trim();
    if (!left || !rightRaw) return;
    const synonyms = rightRaw
      .split(/[;,/]| y /gi)
      .map((s) => _lecturasGameNormalizeWord(s))
      .filter((s) => s && s !== left);
    if (!synonyms.length) return;
    out.push({ target: left, synonyms: Array.from(new Set(synonyms)) });
  });
  return out;
}

function _lecturasGameExtractNarrativeWordPool(html = "", minLen = 4) {
  const plain = htmlToPlainText(html);
  if (!plain) return [];
  const rawWords = String(plain)
    .match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{2,}/g) || [];
  const seen = new Set();
  const out = [];
  rawWords.forEach((token) => {
    const normalized = _lecturasGameNormalizeWord(token);
    if (!normalized || normalized.length < Math.max(2, Number(minLen || 4))) return;
    if (LECTURAS_GAME_STOP_WORDS.has(normalized)) return;
    if (/^\d+$/.test(normalized)) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    out.push(normalized);
  });
  return out;
}

function _lecturasGameBuildWordPairsFromNarrativeFallback(html = "") {
  const words = _lecturasGameExtractNarrativeWordPool(html, 3);
  if (!words.length) return [];
  const used = new Set();
  const pairs = [];

  const findSynonyms = (word = "") => {
    const root = _lecturasGameNormalizeWord(word);
    if (!root) return [];
    const variants = [root];
    if (root.endsWith("ES") && root.length > 4) variants.push(root.slice(0, -2));
    if (root.endsWith("S") && root.length > 3) variants.push(root.slice(0, -1));
    if (root.endsWith("A") && root.length > 3) variants.push(`${root.slice(0, -1)}O`);
    if (root.endsWith("O") && root.length > 3) variants.push(`${root.slice(0, -1)}A`);
    for (const variant of variants) {
      const hit = Array.isArray(LECTURAS_GAME_FALLBACK_SYNONYM_BANK[variant])
        ? LECTURAS_GAME_FALLBACK_SYNONYM_BANK[variant]
        : [];
      if (hit.length) return hit;
    }
    return [];
  };

  words.forEach((target) => {
    const candidates = findSynonyms(target);
    if (!candidates.length) return;
    const normalizedCandidates = candidates
      .map((syn) => _lecturasGameNormalizeWord(syn))
      .filter((syn) => syn && syn !== target);
    if (!normalizedCandidates.length) return;
    const key = [target, normalizedCandidates[0]].sort().join("|");
    if (used.has(key)) return;
    used.add(key);
    pairs.push({ target, synonyms: normalizedCandidates });
  });

  return pairs;
}

function _lecturasGameExtractSynonymPairsFromLectura(lectura = null) {
  const rawHtml = String(
    lectura?.htmlLectura
    || lectura?.raw?.contenidoHTML
    || lectura?.raw?.textoLectura
    || lectura?.raw?.contenidoCompleto
    || lectura?.raw?.lectura
    || lectura?.raw?.contenido
    || lectura?.raw?.texto
    || ""
  ).trim();
  const sinonimosSource = _lecturasHasStructuredContent(lectura?.sinonimos)
    ? lectura.sinonimos
    : resolveLecturaSinonimos(lectura?.raw || {});
  const fromSinonimos = _lecturasGameExtractWordPairsFromSinonimos(sinonimosSource || null);
  const fromHtmlTable = _lecturasGameExtractWordPairsFromHtmlTables(rawHtml);
  const fromNarrative = (fromSinonimos.length || fromHtmlTable.length)
    ? []
    : _lecturasGameBuildWordPairsFromNarrativeFallback(rawHtml);
  return [...fromSinonimos, ...fromHtmlTable, ...fromNarrative]
    .map((item) => ({
      target: _lecturasGameNormalizeWord(item?.target || ""),
      synonyms: Array.from(new Set((item?.synonyms || []).map((s) => _lecturasGameNormalizeWord(s)).filter(Boolean)))
    }))
    .filter((item) => item.target && item.synonyms.length);
}

function _lecturasGameExtractSentencesFromLecturaHtml(html = "") {
  const plain = String(htmlToPlainText(html) || "").replace(/\s+/g, " ").trim();
  if (!plain) return [];
  const parts = plain.match(/[^.!?]+[.!?]?/g) || [];
  return parts
    .map((line) => String(line || "").replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 4 && /\w/.test(line));
}

function _lecturasGameExtractOrderReadingParagraphs(html = "") {
  const raw = String(html || "").trim();
  if (!raw) return [];
  const host = document.createElement("div");
  host.innerHTML = raw;
  const blocks = Array.from(host.querySelectorAll("p, li, blockquote, h2, h3, h4"));
  const cleaned = blocks
    .map((node) => String(node?.textContent || "").replace(/\s+/g, " ").trim())
    .filter((text) => text.length >= 6 && /\w/.test(text));
  if (cleaned.length) return cleaned;
  return _lecturasGameExtractSentencesFromLecturaHtml(raw);
}

function _lecturasGameSanitizeOrderPhraseText(text = "") {
  let out = String(text || "").trim();
  if (!out) return "";
  out = out
    .replace(/[“”«»„‟]/g, "\"")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[—–]/g, "-")
    .replace(/[:;]\s*[-]+\s*/g, ": ")
    .replace(/\s*-\s*/g, " ")
    .replace(/\s*([,.;:!?])\s*/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim();
  out = out.replace(/([:;,.!?])([a-záéíóúüñ])/gi, "$1 $2");
  return out;
}

function _lecturasGameEscapeRegExp(text = "") {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function _lecturasGameNormalizeSpeechTextForCompare(text = "", keepPunctuation = true) {
  let out = String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(punto y coma)\b/g, ";")
    .replace(/\b(dos puntos)\b/g, ":")
    .replace(/\b(punto y seguido|punto seguido)\b/g, ".")
    .replace(/\b(punto y aparte|punto aparte)\b/g, ".")
    .replace(/\b(punto final)\b/g, ".")
    .replace(/\b(punto)\b/g, ".")
    .replace(/\b(coma)\b/g, ",")
    .replace(/\b(signo de pregunta|interrogacion)\b/g, "?")
    .replace(/\b(signo de exclamacion|exclamacion)\b/g, "!")
    .replace(/["'`´]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  out = out
    .replace(/\s*([,.;:!?])\s*/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim();
  if (!keepPunctuation) {
    out = out.replace(/[^a-z0-9ñáéíóúü\s]/gi, " ").replace(/\s+/g, " ").trim();
  }
  return out;
}

function _lecturasGameTokenizeSpeechWords(text = "") {
  const normalized = _lecturasGameNormalizeSpeechTextForCompare(text, false);
  return normalized ? normalized.split(/\s+/g).filter(Boolean) : [];
}

function _lecturasGameCompactSpeechWords(words = [], maxWords = 0) {
  const list = Array.isArray(words) ? words : [];
  const compact = [];
  for (let i = 0; i < list.length; i += 1) {
    const w = _lecturasGameNormalizeWord(list[i]);
    if (!w) continue;
    const prev = compact[compact.length - 1] || "";
    if (w === prev) continue;
    compact.push(w);
  }
  if (maxWords > 0 && compact.length > maxWords) {
    return compact.slice(compact.length - maxWords);
  }
  return compact;
}

function _lecturasGameExtractSpeechPunctuation(text = "") {
  const normalized = _lecturasGameNormalizeSpeechTextForCompare(text, true);
  return Array.from(normalized.match(/[,.!?;:]/g) || []);
}

function _lecturasGameEstimatePitchHz(samples = null, sampleRate = 44100) {
  if (!samples || typeof samples.length !== "number" || samples.length < 64) return 0;
  const size = samples.length;
  let rms = 0;
  for (let i = 0; i < size; i += 1) rms += samples[i] * samples[i];
  rms = Math.sqrt(rms / Math.max(1, size));
  if (rms < 0.01) return 0;
  let bestOffset = -1;
  let bestCorr = 0;
  const minHz = 75;
  const maxHz = 420;
  const minOffset = Math.floor(sampleRate / maxHz);
  const maxOffset = Math.min(Math.floor(sampleRate / minHz), size - 2);
  for (let offset = minOffset; offset <= maxOffset; offset += 1) {
    let corr = 0;
    const usable = size - offset;
    for (let i = 0; i < usable; i += 1) corr += samples[i] * samples[i + offset];
    corr /= Math.max(1, usable);
    if (corr > bestCorr) {
      bestCorr = corr;
      bestOffset = offset;
    }
  }
  if (bestOffset <= 0 || bestCorr <= 0.012) return 0;
  const hz = sampleRate / bestOffset;
  return Number.isFinite(hz) ? hz : 0;
}

function _lecturasGameLevenshteinDistance(a = "", b = "") {
  const left = String(a || "");
  const right = String(b || "");
  const n = left.length;
  const m = right.length;
  if (!n) return m;
  if (!m) return n;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = 0; i <= n; i += 1) dp[i][0] = i;
  for (let j = 0; j <= m; j += 1) dp[0][j] = j;
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return Number(dp[n][m] || 0);
}

function _lecturasGameGetOrderLetterAliasMap() {
  return {
    A: ["A"],
    B: ["B", "BE", "BEE"],
    C: ["C", "CE", "SE", "SI", "SEE"],
    D: ["D", "DE"],
    E: ["E"],
    F: ["F", "EFE"],
    G: ["G", "GE", "JE"],
    H: ["H", "HACHE", "ACHE"],
    I: ["I", "Y"],
    J: ["J", "JOTA", "HOTA"],
    K: ["K", "KA"],
    L: ["L", "ELE", "ELLE"],
    M: ["M", "EME"],
    N: ["N", "ENE"],
    Ñ: ["Ñ", "ENIE", "EÑE", "ENYE"],
    O: ["O"],
    P: ["P", "PE"],
    Q: ["Q", "CU", "KU"],
    R: ["R", "ERRE", "ERE"],
    S: ["S", "ESE", "ESSE"],
    T: ["T", "TE"],
    U: ["U"],
    V: ["V", "VE", "UVE", "UBE"],
    W: ["W", "DOBLEVE", "DOBLE U", "DOBLEU", "DOBLEV"],
    X: ["X", "EQUIS", "EKIS"],
    Y: ["Y", "YE", "I", "E", "YEGRIEGA", "YE GRIEGA"],
    Z: ["Z", "ZETA", "SETA"]
  };
}

function _lecturasGameResolveOrderSpokenLetter(token = "") {
  const aliasMap = _lecturasGameGetOrderLetterAliasMap();
  const clean = _lecturasGameNormalizeWord(token).replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if (clean.length === 1 && /^[A-ZÑ]$/.test(clean)) return clean;
  const compact = clean.replace(/\s+/g, "");
  const entries = Object.entries(aliasMap);
  for (let i = 0; i < entries.length; i += 1) {
    const [letter, aliases] = entries[i];
    if ((aliases || []).some((a) => String(a || "").replace(/\s+/g, "") === compact)) return letter;
  }
  return "";
}

function _lecturasGameSpeechWordMatch(spoken = "", expected = "") {
  const s = _lecturasGameNormalizeWord(spoken);
  const e = _lecturasGameNormalizeWord(expected);
  if (!s || !e) return false;
  if (e.length === 1 && /^[A-ZÑ]$/.test(e)) {
    const spokenLetter = _lecturasGameResolveOrderSpokenLetter(s);
    if (spokenLetter && spokenLetter === e) return true;
  }
  if ((s === "y" || s === "e" || s === "i") && (e === "y" || e === "e" || e === "i")) return true;
  if ((s === "o" || s === "u") && (e === "o" || e === "u")) return true;
  if (s === e) return true;
  if ((s.length <= 2 || e.length <= 2) && s !== e) return false;
  const dist = _lecturasGameLevenshteinDistance(s, e);
  const maxLen = Math.max(s.length, e.length);
  if (maxLen <= 5) return dist <= 1;
  if (maxLen <= 8) return dist <= 2;
  return dist <= 2 && (dist / maxLen) <= 0.28;
}

function _lecturasGameIsOrderSpelledLettersPhrase(runtime = lecturasGameModeRuntime) {
  const speakable = Array.isArray(runtime?.round?.orderPhraseSpeakable) ? runtime.round.orderPhraseSpeakable : [];
  if (speakable.length < 3) return false;
  const single = speakable.filter((item) => String(item?.norm || "").length === 1).length;
  return single >= 3 && (single / Math.max(1, speakable.length)) >= 0.6;
}

function _lecturasGameHasQuotedSingleLetterPattern(phraseText = "") {
  const phrase = String(phraseText || "");
  if (!phrase) return false;
  return /["“”«»„‟'‘’‚‛`´]\s*[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]\s*["“”«»„‟'‘’‚‛`´]/.test(phrase);
}

function _lecturasGameDetectOrderSpellMode(phraseText = "", speakable = []) {
  const list = Array.isArray(speakable) ? speakable : [];
  const single = list.filter((item) => String(item?.norm || "").length === 1).length;
  const singleByRatio = list.length >= 3 && single >= 3 && (single / Math.max(1, list.length)) >= 0.6;
  const quotedSingleLetter = _lecturasGameHasQuotedSingleLetterPattern(phraseText);
  return singleByRatio || quotedSingleLetter;
}

function _lecturasGameOrderHasSingleLetterExpected(runtime = lecturasGameModeRuntime) {
  const speakable = Array.isArray(runtime?.round?.orderPhraseSpeakable) ? runtime.round.orderPhraseSpeakable : [];
  return speakable.some((item) => String(item?.norm || "").length === 1);
}

function _lecturasGameGetOrderExpectedLetters(runtime = lecturasGameModeRuntime) {
  const speakable = Array.isArray(runtime?.round?.orderPhraseSpeakable) ? runtime.round.orderPhraseSpeakable : [];
  const out = [];
  for (let i = 0; i < speakable.length; i += 1) {
    const norm = String(speakable[i]?.norm || "").trim();
    if (!norm) continue;
    if (norm.length === 1 && /^[A-ZÑ]$/.test(norm)) {
      out.push(norm);
      continue;
    }
    if (/^[A-ZÑ]+$/.test(norm) && norm.length > 1) {
      norm.split("").forEach((ch) => out.push(ch));
    }
  }
  return out;
}

function _lecturasGameBuildOrderSpeakableFromPhraseWords(words = []) {
  const list = Array.isArray(words) ? words : [];
  const out = [];
  for (let i = 0; i < list.length; i += 1) {
    const raw = String(list[i] || "");
    const chunks = raw
      .replace(/["“”«»„‟'‘’‚‛`´]/g, " ")
      .split(/[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ]+/g)
      .map((part) => _lecturasGameNormalizeWord(part))
      .filter(Boolean);
    if (!chunks.length) continue;
    for (let j = 0; j < chunks.length; j += 1) {
      const norm = chunks[j];
      out.push({ displayIdx: i, norm });
    }
  }
  return out;
}

function _lecturasGameCreateOrderVoiceAttempt(expectedWords = [], voice = null) {
  const list = Array.isArray(expectedWords) ? expectedWords : [];
  const nextVoice = voice || {};
  return {
    id: Math.max(0, Number(nextVoice.attemptId || 0)),
    expectedWords: list.map((item, index) => ({
      displayIdx: Number(item?.displayIdx ?? index),
      norm: _lecturasGameNormalizeWord(item?.norm || item || "")
    })).filter((item) => item.norm),
    spokenWords: [],
    cursor: 0,
    mismatchIndex: -1,
    status: "idle",
    startedAt: 0,
    endedAt: 0,
    finalTranscript: "",
    resolvedAt: 0
  };
}

function _lecturasGameStrictOrderWordMatch(spoken = "", expected = "") {
  const spokenNorm = _lecturasGameNormalizeWord(spoken);
  const expectedNorm = _lecturasGameNormalizeWord(expected);
  if (!spokenNorm || !expectedNorm) return false;
  if (spokenNorm === expectedNorm) return true;
  if (expectedNorm.length === 1 && /^[A-ZÑ]$/.test(expectedNorm)) {
    return _lecturasGameResolveOrderSpokenLetter(spokenNorm) === expectedNorm;
  }
  return false;
}

function _lecturasGameBuildStrictOrderSpokenWords(transcript = "", expectedWords = []) {
  const punctuationWords = new Set([
    "PUNTO",
    "COMA",
    "PUNTOYCOMA",
    "DOSPUNTOS",
    "PUNTOSUSPENSIVOS",
    "SIGNODEINTERROGACION",
    "SIGNODEEXCLAMACION",
    "INTERROGACION",
    "EXCLAMACION",
    "COMILLAS",
    "COMILLA",
    "ABRECOMILLAS",
    "CIERRACOMILLAS",
    "ABREINTERROGACION",
    "CIERRAINTERROGACION",
    "ABREEXCLAMACION",
    "CIERRAEXCLAMACION"
  ]);
  const tokens = _lecturasGameTokenizeSpeechWords(transcript)
    .map((item) => _lecturasGameNormalizeWord(item))
    .filter((item) => item && !punctuationWords.has(item));
  if (!tokens.length) return [];
  const expectedList = Array.isArray(expectedWords) ? expectedWords : [];
  const fullySpelled = expectedList.length > 0
    && expectedList.every((item) => String(item?.norm || "").length === 1 && /^[A-ZÑ]$/.test(String(item?.norm || "")));
  const out = [];
  tokens.forEach((token) => {
    if (fullySpelled && token.length > 1 && /^[A-ZÑ]+$/.test(token)) {
      token.split("").forEach((ch) => out.push(ch));
      return;
    }
    out.push(token);
  });
  return out;
}

function _lecturasGameEvaluateOrderAttempt(transcript = "", expectedWords = []) {
  const expectedList = Array.isArray(expectedWords)
    ? expectedWords.map((item, index) => ({
      displayIdx: Number(item?.displayIdx ?? index),
      norm: _lecturasGameNormalizeWord(item?.norm || item || "")
    })).filter((item) => item.norm)
    : [];
  const normalizedSpokenWords = _lecturasGameBuildStrictOrderSpokenWords(transcript, expectedList);
  let matchedCount = 0;
  let mismatchIndex = -1;
  const limit = Math.min(expectedList.length, normalizedSpokenWords.length);
  while (matchedCount < limit) {
    if (_lecturasGameStrictOrderWordMatch(normalizedSpokenWords[matchedCount], expectedList[matchedCount]?.norm || "")) {
      matchedCount += 1;
      continue;
    }
    mismatchIndex = Number(expectedList[matchedCount]?.displayIdx ?? matchedCount);
    break;
  }
  if (mismatchIndex < 0 && normalizedSpokenWords.length > expectedList.length) {
    mismatchIndex = Number(expectedList[Math.max(0, expectedList.length - 1)]?.displayIdx ?? Math.max(0, expectedList.length - 1));
  }
  const success = expectedList.length > 0
    && mismatchIndex < 0
    && matchedCount === expectedList.length
    && normalizedSpokenWords.length === expectedList.length;
  return {
    success,
    mismatchIndex,
    matchedCount,
    normalizedSpokenWords,
    expectedWords: expectedList,
    expectedCount: expectedList.length,
    spokenCount: normalizedSpokenWords.length,
    incomplete: mismatchIndex < 0 && !success
  };
}

function _lecturasGameApplyOrderAttemptProgress(runtime = lecturasGameModeRuntime, evaluation = null, options = {}) {
  if (!_lecturasGameIsOrderChallenge(runtime) || !runtime?.round) return;
  const current = evaluation && typeof evaluation === "object" ? evaluation : null;
  const phraseWords = Array.isArray(runtime.round.orderPhraseWords) ? runtime.round.orderPhraseWords : [];
  const states = phraseWords.map(() => "pending");
  const expectedWords = Array.isArray(current?.expectedWords) ? current.expectedWords : (Array.isArray(runtime?.round?.orderPhraseSpeakable) ? runtime.round.orderPhraseSpeakable : []);
  const matchedCount = Math.max(0, Number(current?.matchedCount || 0));
  for (let i = 0; i < matchedCount; i += 1) {
    const hit = expectedWords[i];
    if (!hit) continue;
    const displayIdx = Number(hit.displayIdx);
    if (displayIdx >= 0 && displayIdx < states.length) states[displayIdx] = "correct";
  }
  if (options?.commitWrong === true) {
    const mismatchIndex = Number(current?.mismatchIndex ?? -1);
    if (mismatchIndex >= 0 && mismatchIndex < states.length) states[mismatchIndex] = "wrong";
  }
  runtime.round.orderPhraseWordStates = states;
  runtime.round.orderWordIndex = matchedCount;
  const nextExpected = expectedWords[matchedCount] || null;
  runtime.round.orderActiveDisplayIndex = Number(options?.commitWrong === true
    ? current?.mismatchIndex ?? nextExpected?.displayIdx ?? Math.max(0, states.length - 1)
    : nextExpected?.displayIdx ?? Math.max(0, states.length - 1));
  runtime.round.orderSpeechPrimed = matchedCount > 0;
  runtime.round.orderHasHardMismatch = options?.commitWrong === true && Number(current?.mismatchIndex ?? -1) >= 0;
  runtime.orderVoice.processedWordCount = Math.max(0, Number(current?.spokenCount || 0));
  const attempt = runtime.orderVoice?.attempt;
  if (attempt) {
    attempt.cursor = matchedCount;
    attempt.mismatchIndex = Number(current?.mismatchIndex ?? -1);
    attempt.spokenWords = Array.isArray(current?.normalizedSpokenWords) ? [...current.normalizedSpokenWords] : [];
  }
}

function _lecturasGameExpandOrderSpelledSpeechWords(words = []) {
  const list = Array.isArray(words) ? words : [];
  if (!list.length) return [];
  const out = [];
  for (let i = 0; i < list.length; i += 1) {
    const token = _lecturasGameNormalizeWord(list[i]).replace(/\s+/g, "");
    if (!token) continue;
    const byAlias = _lecturasGameResolveOrderSpokenLetter(token) || "";
    if (byAlias) {
      out.push(byAlias);
      continue;
    }
    if (token.length > 1 && /^[A-ZÑ]+$/.test(token)) {
      token.split("").forEach((ch) => out.push(ch));
      continue;
    }
    out.push(token);
  }
  return out;
}

function _lecturasGameCollectOrderResultAlternatives(results = null) {
  const out = [];
  const list = results && typeof results.length === "number" ? results : [];
  for (let i = 0; i < list.length; i += 1) {
    const res = list[i];
    if (!res || res.isFinal !== true) continue;
    const altLen = Math.max(0, Number(res.length || 0));
    for (let j = 0; j < altLen; j += 1) {
      const alt = res[j];
      const text = String(alt?.transcript || "").trim();
      if (!text) continue;
      out.push({
        text,
        confidence: Math.max(0, Math.min(1, Number(alt?.confidence || 0)))
      });
    }
  }
  const seen = new Set();
  return out.filter((item) => {
    const key = _lecturasGameNormalizeSpeechTextForCompare(String(item?.text || ""), false);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

function _lecturasGameScoreOrderSpellAlternative(text = "", expectedLetters = []) {
  const expected = Array.isArray(expectedLetters) ? expectedLetters.map((l) => _lecturasGameNormalizeWord(l)).filter(Boolean) : [];
  const spokenRaw = _lecturasGameTokenizeSpeechWords(text).map((item) => _lecturasGameNormalizeWord(item)).filter(Boolean);
  const spoken = _lecturasGameExpandOrderSpelledSpeechWords(spokenRaw);
  if (!expected.length || !spoken.length) {
    return { score: 0, coverage: 0, prefix: 0, jumps: 0, mismatches: 0, tokens: spoken };
  }
  let pointer = 0;
  let prefixLen = 0;
  let prefixBroken = false;
  let jumps = 0;
  let mismatches = 0;
  const maxLookAhead = 3;
  for (let i = 0; i < spoken.length; i += 1) {
    const token = spoken[i];
    if (!token) continue;
    const expectedNow = expected[pointer] || "";
    if (expectedNow && token === expectedNow) {
      if (!prefixBroken) prefixLen += 1;
      pointer += 1;
      continue;
    }
    let jumped = false;
    if (pointer < expected.length) {
      const to = Math.min(expected.length - 1, pointer + maxLookAhead);
      for (let k = pointer + 1; k <= to; k += 1) {
        if (expected[k] === token) {
          jumps += Math.max(1, k - pointer);
          pointer = k + 1;
          jumped = true;
          prefixBroken = true;
          break;
        }
      }
    }
    if (!jumped) {
      mismatches += 1;
      prefixBroken = true;
    }
  }
  const expectedLen = Math.max(1, expected.length);
  const spokenLen = Math.max(1, spoken.length);
  const coverage = Math.max(0, Math.min(1, pointer / expectedLen));
  const prefix = Math.max(0, Math.min(1, prefixLen / expectedLen));
  const jumpPenalty = Math.max(0, Math.min(1, jumps / expectedLen));
  const mismatchPenalty = Math.max(0, Math.min(1, mismatches / spokenLen));
  const lenPenalty = Math.max(0, Math.min(1, Math.abs(spoken.length - expected.length) / expectedLen));
  let score = (coverage * 0.62) + (prefix * 0.24) + ((1 - lenPenalty) * 0.14) - (jumpPenalty * 0.32) - (mismatchPenalty * 0.22);
  score = Math.max(0, Math.min(1, score));
  return { score, coverage, prefix, jumps, mismatches, tokens: spoken };
}

function _lecturasGamePickBestOrderSpellAlternative(alternatives = [], expectedLetters = []) {
  const list = Array.isArray(alternatives) ? alternatives : [];
  let best = null;
  for (let i = 0; i < list.length; i += 1) {
    const alt = list[i] || {};
    const text = String(alt.text || "").trim();
    if (!text) continue;
    const score = _lecturasGameScoreOrderSpellAlternative(text, expectedLetters);
    const candidate = {
      text,
      confidence: Math.max(0, Math.min(1, Number(alt.confidence || 0))),
      score: Number(score.score || 0),
      coverage: Number(score.coverage || 0),
      prefix: Number(score.prefix || 0),
      jumps: Number(score.jumps || 0),
      mismatches: Number(score.mismatches || 0),
      tokens: Array.isArray(score.tokens) ? score.tokens : []
    };
    if (!best) {
      best = candidate;
      continue;
    }
    if (candidate.score > best.score + 0.0001) {
      best = candidate;
      continue;
    }
    if (Math.abs(candidate.score - best.score) <= 0.0001 && candidate.confidence > best.confidence) {
      best = candidate;
    }
  }
  return best;
}

function _lecturasGameBuildOrderSpellHints(expectedLetters = []) {
  const letters = Array.isArray(expectedLetters) ? expectedLetters : [];
  if (!letters.length) return [];
  const aliasMap = _lecturasGameGetOrderLetterAliasMap();
  const out = new Set();
  letters.forEach((letter) => {
    const clean = _lecturasGameNormalizeWord(letter);
    if (!clean) return;
    out.add(clean);
    const aliases = aliasMap[clean] || [];
    aliases.forEach((a) => {
      const key = _lecturasGameNormalizeWord(a);
      if (key) out.add(key);
    });
  });
  return Array.from(out).slice(0, 80);
}

function _lecturasGameBuildProsodyMetrics(samples = [], expectedPhrase = "") {
  const out = {
    sampleCount: 0,
    peakRms: 0,
    avgRms: 0,
    lowCount: 0,
    pauseShortCount: 0,
    pauseLongCount: 0,
    headPitch: 0,
    tailPitch: 0,
    maxPitch: 0,
    hasExclamationProsody: false,
    hasQuestionProsody: false,
    pausePass: true
  };
  if (!Array.isArray(samples) || !samples.length) return out;
  out.sampleCount = samples.length;
  let rmsSum = 0;
  let shortRun = 0;
  let longRun = 0;
  const pitches = [];
  for (let i = 0; i < samples.length; i += 1) {
    const item = samples[i] || {};
    const rms = Math.max(0, Number(item.rms || 0));
    const pitch = Math.max(0, Number(item.pitch || 0));
    rmsSum += rms;
    out.peakRms = Math.max(out.peakRms, rms);
    if (pitch > 50) {
      pitches.push(pitch);
      out.maxPitch = Math.max(out.maxPitch, pitch);
    }
    const isLow = rms < 0.024;
    if (isLow) {
      shortRun += 1;
      longRun += 1;
      if (shortRun === 3) out.pauseShortCount += 1;
      if (longRun === 6) out.pauseLongCount += 1;
      out.lowCount += 1;
    } else {
      shortRun = 0;
      longRun = 0;
    }
  }
  out.avgRms = rmsSum / Math.max(1, samples.length);
  if (pitches.length) {
    const third = Math.max(1, Math.floor(pitches.length / 3));
    const head = pitches.slice(0, third);
    const tail = pitches.slice(-third);
    const avg = (arr) => arr.reduce((acc, v) => acc + v, 0) / Math.max(1, arr.length);
    out.headPitch = avg(head);
    out.tailPitch = avg(tail);
  }
  const phrase = String(expectedPhrase || "");
  const expectedCommas = (phrase.match(/[,;:]/g) || []).length;
  const expectedStops = (phrase.match(/[.]/g) || []).length;
  const expectedShortPauses = expectedCommas;
  const expectedLongPauses = expectedStops;
  const shortPass = expectedShortPauses === 0 || out.pauseShortCount >= Math.max(1, Math.floor(expectedShortPauses * 0.65));
  const longPass = expectedLongPauses === 0 || out.pauseLongCount >= Math.max(1, Math.floor(expectedLongPauses * 0.6));
  out.pausePass = shortPass && longPass;
  out.hasExclamationProsody = out.peakRms >= 0.062 && (out.maxPitch >= 200 || out.tailPitch >= out.headPitch * 1.07);
  out.hasQuestionProsody = out.tailPitch >= out.headPitch * 1.08 && out.tailPitch >= 145;
  return out;
}

async function _lecturasGameStartOrderProsodyCapture(runtime = lecturasGameModeRuntime) {
  const voice = runtime?.orderVoice || {};
  if (voice.prosodyCaptureActive) return true;
  if (!navigator?.mediaDevices?.getUserMedia) return false;
  try {
    let stream = null;
    let usesMainStream = false;
    const mainStream = runtime?.stream || null;
    const mainAudioTracks = (mainStream?.getAudioTracks?.() || []).filter((track) => track?.readyState === "live");
    if (mainAudioTracks.length) {
      stream = new MediaStream([mainAudioTracks[0]]);
      usesMainStream = true;
    } else {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });
    }
    if (!runtime.audioCtx) runtime.audioCtx = new AudioContext();
    const ctx = runtime.audioCtx;
    if (ctx.state === "suspended") {
      try { await ctx.resume(); } catch (_) { }
    }
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.22;
    source.connect(analyser);
    const sampleRate = Number(ctx.sampleRate || 44100);
    const buffer = new Float32Array(analyser.fftSize);
    voice.prosodyCaptureActive = true;
    voice.prosodyStream = stream;
    voice.prosodyUsesMainStream = usesMainStream;
    voice.prosodySource = source;
    voice.prosodyAnalyser = analyser;
    voice.prosodySampleRate = sampleRate;
    voice.prosodySamples = [];
    if (voice.prosodyTimerId) clearInterval(voice.prosodyTimerId);
    voice.prosodyTimerId = setInterval(() => {
      if (!voice.prosodyCaptureActive || !voice.prosodyAnalyser) return;
      try {
        voice.prosodyAnalyser.getFloatTimeDomainData(buffer);
        let rms = 0;
        for (let i = 0; i < buffer.length; i += 1) rms += buffer[i] * buffer[i];
        rms = Math.sqrt(rms / Math.max(1, buffer.length));
        const pitch = _lecturasGameEstimatePitchHz(buffer, voice.prosodySampleRate || sampleRate);
        const list = Array.isArray(voice.prosodySamples) ? voice.prosodySamples : [];
        list.push({ t: Date.now(), rms, pitch });
        if (list.length > 280) list.shift();
        voice.prosodySamples = list;
      } catch (_) {
        // ignore sampling glitches
      }
    }, 68);
    return true;
  } catch (_) {
    return false;
  }
}

function _lecturasGameStopOrderProsodyCapture(runtime = lecturasGameModeRuntime) {
  const voice = runtime?.orderVoice || {};
  voice.prosodyCaptureActive = false;
  if (voice.prosodyTimerId) {
    clearInterval(voice.prosodyTimerId);
    voice.prosodyTimerId = 0;
  }
  const source = voice.prosodySource || null;
  if (source?.disconnect) {
    try { source.disconnect(); } catch (_) { }
  }
  const analyser = voice.prosodyAnalyser || null;
  if (analyser?.disconnect) {
    try { analyser.disconnect(); } catch (_) { }
  }
  const stream = voice.prosodyStream || null;
  if (voice.prosodyUsesMainStream !== true) {
    (stream?.getTracks?.() || []).forEach((track) => {
      try { track.stop(); } catch (_) { }
    });
  }
  voice.prosodySource = null;
  voice.prosodyAnalyser = null;
  voice.prosodyStream = null;
  voice.prosodyUsesMainStream = false;
}

function _lecturasGameLcsLength(a = [], b = []) {
  const left = Array.isArray(a) ? a : [];
  const right = Array.isArray(b) ? b : [];
  if (!left.length || !right.length) return 0;
  const dp = Array.from({ length: left.length + 1 }, () => new Uint16Array(right.length + 1));
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      if (left[i - 1] === right[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return Number(dp[left.length][right.length] || 0);
}

function _lecturasGameOrderSpeechMatchesPhrase(spoken = "", expected = "", runtime = lecturasGameModeRuntime) {
  const expectedWords = _lecturasGameTokenizeSpeechWords(expected);
  const spokenWords = _lecturasGameCompactSpeechWords(
    _lecturasGameTokenizeSpeechWords(spoken),
    Math.max(8, (expectedWords.length * 2) + 4)
  );
  if (!spokenWords.length || !expectedWords.length) return false;
  const wordsLcs = _lecturasGameLcsLength(spokenWords, expectedWords);
  const wordCoverage = wordsLcs / Math.max(1, expectedWords.length);
  const lengthRatio = Math.min(spokenWords.length, expectedWords.length) / Math.max(1, Math.max(spokenWords.length, expectedWords.length));
  // Robust mode for web speech: punctuation/prosody are NOT required to pass.
  // This prevents false negatives caused by final "." and ASR formatting variance.
  const shortPhrase = expectedWords.length <= 5;
  const minCoverage = shortPhrase ? 0.46 : 0.58;
  const strongCoverage = wordCoverage >= 0.82;
  const coveragePass = wordCoverage >= minCoverage;
  const lengthPass = strongCoverage || lengthRatio >= 0.22;
  return coveragePass && lengthPass;
}

function _lecturasGameOrderSpeechLooseMatch(spoken = "", expected = "", runtime = lecturasGameModeRuntime) {
  return _lecturasGameOrderSpeechMatchesPhrase(spoken, expected, runtime);
}

function _lecturasGameIsOrderSkippableConnector(word = "") {
  const norm = _lecturasGameNormalizeWord(word);
  if (!norm) return false;
  return new Set([
    "y", "e", "i", "o", "u", "a", "en", "que",
    "de", "del", "la", "el", "los", "las",
    "un", "una", "unos", "unas", "al"
  ]).has(norm);
}

function _lecturasGameIsOrderImperativePhrase(text = "") {
  const raw = String(text || "").trim();
  if (!raw) return false;
  return /[!¡]/.test(raw);
}

function _lecturasGameHasOrderImperativeVoiceBoost(runtime = lecturasGameModeRuntime, expected = "") {
  if (!_lecturasGameIsOrderImperativePhrase(expected)) return false;
  const samples = Array.isArray(runtime?.orderVoice?.prosodySamples) ? runtime.orderVoice.prosodySamples : [];
  const m = _lecturasGameBuildProsodyMetrics(samples, expected);
  return m.hasExclamationProsody === true || m.peakRms >= 0.072 || m.avgRms >= 0.04;
}

function _lecturasGameBuildOrderRoundFromLectura(lectura = null, runtime = lecturasGameModeRuntime) {
  const rawHtml = String(
    lectura?.htmlLectura
    || lectura?.raw?.contenidoHTML
    || lectura?.raw?.textoLectura
    || lectura?.raw?.contenidoCompleto
    || lectura?.raw?.lectura
    || lectura?.raw?.contenido
    || lectura?.raw?.texto
    || ""
  ).trim();
  const pairs = _lecturasGameExtractSynonymPairsFromLectura(lectura);
  const paragraphs = _lecturasGameExtractOrderReadingParagraphs(rawHtml);
  if (!paragraphs.length) return null;
  const canonicalByWord = new Map();
  pairs.forEach((pair) => {
    const target = _lecturasGameNormalizeWord(pair?.target || "");
    if (!target) return;
    canonicalByWord.set(target, target);
    (pair?.synonyms || []).forEach((syn) => {
      const cleanSyn = _lecturasGameNormalizeWord(syn);
      if (!cleanSyn) return;
      canonicalByWord.set(cleanSyn, target);
    });
  });
  const chooseTargetForParagraph = (paragraphText = "") => {
    const paragraphWords = _lecturasGameTokenizeSpeechWords(paragraphText)
      .map((token) => _lecturasGameNormalizeWord(token))
      .filter(Boolean);
    for (let i = 0; i < paragraphWords.length; i += 1) {
      const token = paragraphWords[i];
      const canonical = canonicalByWord.get(token);
      if (canonical) return canonical;
    }
    for (let i = 0; i < paragraphWords.length; i += 1) {
      const token = paragraphWords[i];
      if (Array.isArray(LECTURAS_GAME_FALLBACK_SYNONYM_BANK?.[token]) && LECTURAS_GAME_FALLBACK_SYNONYM_BANK[token].length) {
        return token;
      }
    }
    const semantic = paragraphWords.find((token) => token.length >= 4 && !LECTURAS_GAME_STOP_WORDS.has(token));
    if (semantic) return semantic;
    return String(paragraphWords[0] || "PALABRA").trim() || "PALABRA";
  };
  const phrases = paragraphs.map((paragraphText, idx) => {
    const text = _lecturasGameSanitizeOrderPhraseText(String(paragraphText || "").trim());
    const targetWord = chooseTargetForParagraph(text);
    const synonymBase = String(canonicalByWord.get(targetWord) || targetWord).trim();
    return {
      id: `order_phrase_${idx}_${Date.now()}`,
      text,
      targetWord: String(targetWord || "").trim(),
      synonymBase,
      paragraphIndex: idx
    };
  }).filter((item) => item.text && item.targetWord);
  if (!phrases.length) return null;
  const first = phrases[0];
  return {
    targetWord: first.targetWord,
    correctSynonym: first.targetWord,
    distractors: [],
    words: [],
    orderPhrases: phrases,
    orderIndex: 0,
    orderTrapActive: false,
    orderLastReadResult: "",
    orderParagraphTotal: phrases.length,
    meta: {
      title: String(lectura?.titulo || "Lectura").trim() || "Lectura",
      grade: gradeLabel(String(lectura?.grado || "").trim())
    }
  };
}

function _lecturasGameBuildTraceRoundFromLectura(lectura = null, runtime = lecturasGameModeRuntime) {
  const rawHtml = String(
    lectura?.htmlLectura
    || lectura?.raw?.contenidoHTML
    || lectura?.raw?.textoLectura
    || lectura?.raw?.contenidoCompleto
    || lectura?.raw?.lectura
    || lectura?.raw?.contenido
    || lectura?.raw?.texto
    || ""
  ).trim();
  const words = _lecturasGameExtractNarrativeWordPool(rawHtml, 3)
    .map((w) => _lecturasGameNormalizeWord(w))
    .filter((w) => w && /^[A-ZÑ]+$/.test(w) && w.length >= 3);
  if (words.length < 2) return null;
  const uniqueWords = Array.from(new Set(words));
  const gradeNum = Number(normalizeGrado(lectura?.grado || runtime?.lectura?.grado || ""));
  let tokenKind = "letter";
  let tokenCandidates = [];
  if (Number.isFinite(gradeNum) && gradeNum >= 5) {
    tokenKind = "word";
    tokenCandidates = uniqueWords.filter((w) => w.length >= 5);
  } else if (gradeNum === 4) {
    tokenKind = "short";
    const shortWords = uniqueWords.filter((w) => w.length >= 2 && w.length <= 4);
    const shortChunks = [];
    uniqueWords.forEach((word) => {
      if (word.length < 4) return;
      for (let i = 0; i < word.length; i += 1) {
        const c2 = word.slice(i, i + 2);
        const c3 = word.slice(i, i + 3);
        if (/^[A-ZÑ]{2}$/.test(c2)) shortChunks.push(c2);
        if (/^[A-ZÑ]{3}$/.test(c3)) shortChunks.push(c3);
      }
    });
    tokenCandidates = Array.from(new Set([...shortWords, ...shortChunks]));
  } else {
    tokenKind = "letter";
    const letters = [];
    uniqueWords.forEach((word) => {
      Array.from(new Set(word.split(""))).forEach((ch) => {
        if (/^[A-ZÑ]$/.test(ch)) letters.push(ch);
      });
    });
    tokenCandidates = Array.from(new Set(letters));
  }
  if (!tokenCandidates.length) return null;
  const candidates = tokenCandidates
    .map((token) => {
      const withToken = uniqueWords.filter((w) => w.includes(token));
      const withoutToken = uniqueWords.filter((w) => !w.includes(token));
      return {
        token,
        withToken: Array.from(new Set(withToken)),
        withoutToken: Array.from(new Set(withoutToken))
      };
    })
    .filter((item) => item.withToken.length >= 1 && item.withoutToken.length >= 1);
  if (!candidates.length) return null;
  const picked = _lecturasGamePickRandom(candidates);
  if (!picked) return null;
  const correctWord = _lecturasGamePickRandom(picked.withToken) || "";
  const wrongWord = _lecturasGamePickRandom(picked.withoutToken) || "";
  if (!correctWord || !wrongWord) return null;
  return {
    targetWord: picked.token,
    correctSynonym: picked.token,
    distractors: [],
    words: [],
    trace: {
      token: picked.token,
      tokenKind,
      correctWord,
      wrongWord,
      wordPool: uniqueWords.slice(0, 180)
    },
    meta: {
      title: String(lectura?.titulo || "Lectura").trim() || "Lectura",
      grade: gradeLabel(String(lectura?.grado || "").trim())
    }
  };
}

function _lecturasGameBuildTraceTemplate(runtime = lecturasGameModeRuntime) {
  const token = String(runtime?.round?.trace?.token || runtime?.round?.targetWord || "").trim().toUpperCase();
  if (!token) return null;
  const width = Math.max(320, Number(runtime?.viewWidth || 960));
  const height = Math.max(220, Number(runtime?.viewHeight || 540));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, width, height);
  const units = Math.max(1, token.length);
  let fontSize = Math.max(72, Math.min(320, Math.round((width * (units <= 1 ? 0.31 : (units <= 3 ? 0.23 : 0.18))))));
  ctx.font = `400 ${fontSize}px "ASC-Cursive-2022", "Ballooning", "Nunito", sans-serif`;
  while (ctx.measureText(token).width > (width * 0.76) && fontSize > 62) {
    fontSize = Math.max(62, Math.floor(fontSize * 0.9));
    ctx.font = `400 ${fontSize}px "ASC-Cursive-2022", "Ballooning", "Nunito", sans-serif`;
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.strokeStyle = "rgba(255,255,255,1)";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(8, Math.min(13, Math.round(fontSize * 0.08)));
  const traceBaselineRatio = Math.max(0.44, Math.min(0.82, Number(runtime?.traceLayout?.baselineRatio || 0.56)));
  ctx.strokeText(token, width * 0.5, height * traceBaselineRatio);
  const img = ctx.getImageData(0, 0, width, height);
  const data = img.data;
  const cells = new Set();
  const cellSize = 12;
  let startPoint = null;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = ((y * width) + x) * 4;
      if (Number(data[idx + 3] || 0) < 20) continue;
      if (!startPoint || x < Number(startPoint.x || 0) || (x === Number(startPoint.x || 0) && y > Number(startPoint.y || 0))) {
        startPoint = { x, y };
      }
      const cx = Math.floor(x / cellSize);
      const cy = Math.floor(y / cellSize);
      cells.add(`${cx},${cy}`);
    }
  }
  return {
    canvas,
    width,
    height,
    data,
    cellSize,
    totalCells: Math.max(1, cells.size),
    cells,
    startPoint
  };
}

function _lecturasGameTraceMaskHit(template = null, x = 0, y = 0, tolerance = 10) {
  if (!template || !template.data) return false;
  const w = Math.max(1, Number(template.width || 0));
  const h = Math.max(1, Number(template.height || 0));
  const px = Math.round(Number(x || 0));
  const py = Math.round(Number(y || 0));
  const tol = Math.max(0, Math.round(Number(tolerance || 0)));
  for (let dy = -tol; dy <= tol; dy += 1) {
    for (let dx = -tol; dx <= tol; dx += 1) {
      const tx = px + dx;
      const ty = py + dy;
      if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
      const idx = ((ty * w) + tx) * 4;
      if (Number(template.data[idx + 3] || 0) >= 20) return true;
    }
  }
  return false;
}

function _lecturasGameStabilizeTracePoint(traceState = null, x = 0, y = 0, nowMs = performance.now()) {
  if (!traceState) return { x: Number(x || 0), y: Number(y || 0) };
  const rawX = Number(x || 0);
  const rawY = Number(y || 0);
  const prev = traceState.smoothedPoint && Number.isFinite(traceState.smoothedPoint.x) && Number.isFinite(traceState.smoothedPoint.y)
    ? traceState.smoothedPoint
    : null;
  if (!prev) {
    traceState.smoothedPoint = { x: rawX, y: rawY };
    traceState.sampleAtMs = Number(nowMs || performance.now());
    return traceState.smoothedPoint;
  }
  const dtMs = Math.max(1, Number(nowMs || performance.now()) - Number(traceState.sampleAtMs || 0));
  traceState.sampleAtMs = Number(nowMs || performance.now());
  const dx = rawX - Number(prev.x || 0);
  const dy = rawY - Number(prev.y || 0);
  const dist = Math.hypot(dx, dy);
  const pxPerSec = (dist * 1000) / dtMs;
  const deadZonePx = 1;
  if (dist <= deadZonePx) return prev;
  const alpha = pxPerSec <= 100
    ? 0.24
    : (pxPerSec <= 220 ? 0.36 : (pxPerSec <= 440 ? 0.5 : 0.62));
  const maxStepPx = pxPerSec <= 220
    ? 20
    : (pxPerSec <= 460 ? 30 : 40);
  const smoothed = {
    x: Number(prev.x || 0) + Math.max(-maxStepPx, Math.min(maxStepPx, dx * alpha)),
    y: Number(prev.y || 0) + Math.max(-maxStepPx, Math.min(maxStepPx, dy * alpha))
  };
  traceState.smoothedPoint = smoothed;
  return smoothed;
}

function _lecturasGameResolveTraceHandKey(kind = "", x = 0, runtime = lecturasGameModeRuntime) {
  const k = String(kind || "").toLowerCase();
  if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR) {
    if (k.endsWith("_left")) return "left";
    if (k.endsWith("_right")) return "right";
  }
  if (k.includes("left")) return "left";
  if (k.includes("right")) return "right";
  if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR) {
    return _lecturasGameGetSideByX(Number(x || 0), runtime) === "right" ? "right" : "left";
  }
  return Number(x || 0) <= (Number(runtime.viewWidth || 960) / 2) ? "left" : "right";
}

function _lecturasGameIsTraceDrawGestureActive(kind = "", x = 0, runtime = lecturasGameModeRuntime) {
  const handKey = _lecturasGameResolveTraceHandKey(kind, x, runtime);
  const hand = runtime?.hands?.[handKey] || null;
  if (!hand) return false;
  if (hand.closed === true) return true;
  const cfg = runtime?.chargeConfig || {};
  const closeThreshold = Math.max(0.38, Number(cfg.closeThreshold || 0.8));
  const traceCloseBoost = _lecturasGameIsTraceChallenge(runtime) ? 0.22 : 0.1;
  const metric = Number(hand?.fistMetric || 1);
  const confidence = Number(hand?.confidence || 0);
  return confidence >= 0.12 && metric <= (closeThreshold + traceCloseBoost);
}

function _lecturasGameBuildTraceQuizFromRound(round = null) {
  const token = String(round?.trace?.token || round?.targetWord || "").trim().toUpperCase();
  const tokenKind = String(round?.trace?.tokenKind || (token.length <= 1 ? "letter" : "short"));
  let correct = String(round?.trace?.correctWord || "").trim();
  let wrong = String(round?.trace?.wrongWord || "").trim();
  const pool = Array.isArray(round?.trace?.wordPool) ? round.trace.wordPool : [];
  if (!correct) correct = String(pool.find((w) => String(w || "").includes(token)) || "").trim();
  if (!wrong) wrong = String(pool.find((w) => w && !String(w).includes(token)) || "").trim();
  if (!token || !correct || !wrong) return null;
  const options = _lecturasGameShuffle([correct, wrong]);
  const correctIndex = options.findIndex((opt) => String(opt || "") === String(correct));
  const question = tokenKind === "letter"
    ? `¿Qué palabra contiene la letra "${token}"?`
    : `¿Qué palabra contiene "${token}"?`;
  return {
    question,
    options,
    correctIndex: Math.max(0, correctIndex),
    answered: false
  };
}

function _lecturasGameUpdateTraceChallenge(runtime = lecturasGameModeRuntime, nowMs = performance.now()) {
  if (!_lecturasGameIsTraceChallenge(runtime) || runtime.mode !== LECTURAS_GAME_MODE.PLAYING) return;
  runtime.round = runtime.round || {};
  const traceState = runtime.round.traceRuntime || (runtime.round.traceRuntime = {
    template: null,
    visited: new Set(),
    tracePath: [],
    started: false,
    completed: false,
    failUntilMs: 0,
    lastPoint: null,
    activeHandKind: "",
    activeHandKey: "",
    smoothedPoint: null,
    sampleAtMs: 0,
    offLineFrames: 0,
    penLifted: false
  });
  if (!traceState.template) traceState.template = _lecturasGameBuildTraceTemplate(runtime);
  if (!traceState.template || traceState.completed) return;
  if (Number(traceState.failUntilMs || 0) > Number(nowMs || 0)) return;
  const candidates = _lecturasGameGetHandInteractionPoints(runtime);
  const handJoints = (Array.isArray(candidates) && candidates.length)
    ? candidates
    : _lecturasGameGetHandCollisionJoints("", runtime);
  if (!handJoints.length) {
    if (traceState.started || (Array.isArray(traceState.tracePath) && traceState.tracePath.length)) {
      traceState.penLifted = true;
      traceState.lastPoint = null;
      traceState.smoothedPoint = null;
      traceState.sampleAtMs = 0;
      traceState.activeHandKind = "";
      traceState.activeHandKey = "";
    }
    traceState.offLineFrames = 0;
    return;
  }
  const lockedHandKey = String(traceState.activeHandKey || "");
  const traceCandidates = (!lockedHandKey
    ? handJoints
    : handJoints.filter((hand) => _lecturasGameResolveTraceHandKey(String(hand?.kind || ""), Number(hand?.x || 0), runtime) === lockedHandKey));
  const candidatePool = traceCandidates.length ? traceCandidates : handJoints;
  const tol = 32;
  let selected = null;
  let selectedInLine = false;
  let selectedDist = Number.POSITIVE_INFINITY;
  const ref = traceState.lastPoint && Number.isFinite(traceState.lastPoint.x) && Number.isFinite(traceState.lastPoint.y)
    ? traceState.lastPoint
    : null;
  candidatePool.forEach((hand) => {
    const hx = Number(hand?.x || 0);
    const hy = Number(hand?.y || 0);
    const drawGestureActive = _lecturasGameIsTraceDrawGestureActive(String(hand?.kind || ""), hx, runtime);
    if (!drawGestureActive) return;
    const inLine = _lecturasGameTraceMaskHit(traceState.template, hx, hy, tol);
    const dist = ref ? Math.hypot(hx - ref.x, hy - ref.y) : 0;
    if (!selected) {
      selected = { x: hx, y: hy, kind: String(hand?.kind || "") };
      selectedInLine = inLine;
      selectedDist = dist;
      return;
    }
    if (inLine && !selectedInLine) {
      selected = { x: hx, y: hy, kind: String(hand?.kind || "") };
      selectedInLine = true;
      selectedDist = dist;
      return;
    }
    if (inLine === selectedInLine && dist < selectedDist) {
      selected = { x: hx, y: hy, kind: String(hand?.kind || "") };
      selectedDist = dist;
    }
  });
  if (!selected) {
    if (traceState.started || (Array.isArray(traceState.tracePath) && traceState.tracePath.length)) {
      traceState.penLifted = true;
      traceState.lastPoint = null;
      traceState.smoothedPoint = null;
      traceState.sampleAtMs = 0;
      traceState.activeHandKind = "";
      traceState.activeHandKey = "";
    }
    traceState.offLineFrames = 0;
    return;
  }
  const selectedHandKey = _lecturasGameResolveTraceHandKey(String(selected.kind || ""), Number(selected.x || 0), runtime);
  const selectedKind = String(selected.kind || "");
  const handChanged = traceState.activeHandKey
    && selectedHandKey
    && String(traceState.activeHandKey) !== selectedHandKey;
  if (handChanged) {
    traceState.penLifted = true;
    traceState.lastPoint = null;
    traceState.smoothedPoint = null;
    traceState.sampleAtMs = 0;
  }
  const stabilized = _lecturasGameStabilizeTracePoint(traceState, Number(selected.x || 0), Number(selected.y || 0), nowMs) || selected;
  const traceX = Number(stabilized.x || 0);
  const traceY = Number(stabilized.y || 0);
  const stabilizedInLine = _lecturasGameTraceMaskHit(traceState.template, traceX, traceY, tol);
  if (stabilizedInLine) {
    traceState.started = true;
    traceState.offLineFrames = 0;
    if (traceState.penLifted) {
      const last = Array.isArray(traceState.tracePath) && traceState.tracePath.length
        ? traceState.tracePath[traceState.tracePath.length - 1]
        : null;
      if (last && !last.break) {
        traceState.tracePath.push({ break: true, t: nowMs });
      }
      traceState.penLifted = false;
    }
    const prevPath = Array.isArray(traceState.tracePath) && traceState.tracePath.length
      ? traceState.tracePath[traceState.tracePath.length - 1]
      : null;
    if (!prevPath || prevPath.break || Math.hypot(Number(prevPath.x || 0) - traceX, Number(prevPath.y || 0) - traceY) >= 3.2) {
      traceState.tracePath.push({ x: traceX, y: traceY, ok: true, t: nowMs });
    }
    const c = traceState.template.cellSize || 12;
    const cx = Math.floor(traceX / c);
    const cy = Math.floor(traceY / c);
    traceState.visited.add(`${cx},${cy}`);
    traceState.lastPoint = { x: traceX, y: traceY };
    traceState.activeHandKind = selectedKind;
    traceState.activeHandKey = selectedHandKey;
    const visitedRatio = traceState.visited.size / Math.max(1, Number(traceState.template.totalCells || 1));
    const validTracePoints = traceState.tracePath.reduce((acc, point) => (point && !point.break ? acc + 1 : acc), 0);
    if (validTracePoints >= 62 && visitedRatio >= 0.26) {
      traceState.completed = true;
      runtime.progress.rewardMessage = "¡Trazo correcto! Responde la pregunta.";
      const quiz = _lecturasGameBuildTraceQuizFromRound(runtime.round);
      if (quiz) {
        runtime.quiz = quiz;
        runtime.quizPendingAfterWin = false;
        _lecturasGameSetMode(LECTURAS_GAME_MODE.QUIZ);
      }
    }
    return;
  }
  if (traceState.started) {
    traceState.offLineFrames = Math.max(0, Number(traceState.offLineFrames || 0)) + 1;
    if (traceState.offLineFrames < 20) return;
    traceState.tracePath.push({ x: traceX, y: traceY, ok: false, t: nowMs });
    runtime.progress.rewardMessage = "Te saliste del trazo. Intenta de nuevo.";
    _lecturasGamePlayRocketStartFx(runtime);
    _lecturasGamePlayLoseSound();
    traceState.visited = new Set();
    traceState.tracePath = [];
    traceState.started = false;
    traceState.completed = false;
    traceState.failUntilMs = Number(nowMs || 0) + 420;
    traceState.lastPoint = null;
    traceState.activeHandKind = "";
    traceState.activeHandKey = "";
    traceState.smoothedPoint = null;
    traceState.sampleAtMs = 0;
    traceState.offLineFrames = 0;
    traceState.penLifted = false;
  }
}

function _lecturasGameResetTraceProgress(runtime = lecturasGameModeRuntime) {
  if (!_lecturasGameIsTraceChallenge(runtime)) return false;
  runtime.round = runtime.round || {};
  const current = runtime.round.traceRuntime || {};
  runtime.round.traceRuntime = {
    template: current.template || _lecturasGameBuildTraceTemplate(runtime),
    visited: new Set(),
    tracePath: [],
    started: false,
    completed: false,
    failUntilMs: 0,
    lastPoint: null,
    activeHandKind: "",
    activeHandKey: "",
    smoothedPoint: null,
    sampleAtMs: 0,
    offLineFrames: 0,
    penLifted: false
  };
  runtime.progress.rewardMessage = "Trazo reiniciado.";
  return true;
}

function _lecturasGameRenderTraceChallenge(ctx = null, runtime = lecturasGameModeRuntime) {
  if (!ctx || !_lecturasGameIsTraceChallenge(runtime)) return;
  const mode = String(runtime?.mode || "");
  if (!(mode === LECTURAS_GAME_MODE.INSTRUCTION || mode === LECTURAS_GAME_MODE.COUNTDOWN || mode === LECTURAS_GAME_MODE.PLAYING)) return;
  const traceState = runtime?.round?.traceRuntime || null;
  if (!traceState?.template) return;
  const tpl = traceState.template;
  const cx = (runtime.viewWidth - tpl.width) / 2;
  const cy = (runtime.viewHeight - tpl.height) / 2;
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.drawImage(tpl.canvas, cx, cy);
  ctx.restore();
  if (tpl?.startPoint) {
    const sx = cx + Number(tpl.startPoint.x || 0);
    const sy = cy + Number(tpl.startPoint.y || 0);
    const pulse = 1 + (Math.sin(performance.now() * 0.012) * 0.16);
    const r = 13 * pulse;
    ctx.save();
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 2.2);
    g.addColorStop(0, "rgba(160, 255, 196, 0.98)");
    g.addColorStop(0.58, "rgba(80, 214, 120, 0.72)");
    g.addColorStop(1, "rgba(80, 214, 120, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, r * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(165, 255, 186, 0.98)";
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(13, 56, 24, 0.85)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = "800 13px Nunito, sans-serif";
    ctx.fillStyle = "rgba(228, 255, 238, 0.96)";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("Inicio", sx + (r * 1.55), sy);
    ctx.restore();
  }
  const path = Array.isArray(traceState.tracePath) ? traceState.tracePath : [];
  if (!path.length) return;
  const smoothPointAt = (segment = [], idx = 0) => {
    if (!Array.isArray(segment) || !segment.length) return null;
    const i = Math.max(0, Math.min(segment.length - 1, Number(idx || 0)));
    const p0 = segment[Math.max(0, i - 1)] || segment[i];
    const p1 = segment[i] || p0;
    const p2 = segment[Math.min(segment.length - 1, i + 1)] || p1;
    // Weighted local smoothing to remove jitter without adding noticeable lag.
    return {
      x: ((Number(p0.x || 0) * 0.24) + (Number(p1.x || 0) * 0.52) + (Number(p2.x || 0) * 0.24)),
      y: ((Number(p0.y || 0) * 0.24) + (Number(p1.y || 0) * 0.52) + (Number(p2.y || 0) * 0.24))
    };
  };
  const drawSegment = (segment = []) => {
    if (!Array.isArray(segment) || segment.length < 2) return;
    for (let i = 1; i < segment.length; i += 1) {
      const prevRaw = segment[i - 1];
      const currRaw = segment[i];
      if (!prevRaw || !currRaw) continue;
      const pPrev = smoothPointAt(segment, i - 1) || prevRaw;
      const pCurr = smoothPointAt(segment, i) || currRaw;
      const pMid = {
        x: (Number(pPrev.x || 0) + Number(pCurr.x || 0)) * 0.5,
        y: (Number(pPrev.y || 0) + Number(pCurr.y || 0)) * 0.5
      };
      ctx.strokeStyle = currRaw.ok ? "rgba(90, 255, 150, 0.92)" : "rgba(255, 92, 92, 0.96)";
      ctx.beginPath();
      ctx.moveTo(Number(pPrev.x || 0), Number(pPrev.y || 0));
      ctx.quadraticCurveTo(Number(pPrev.x || 0), Number(pPrev.y || 0), Number(pMid.x || 0), Number(pMid.y || 0));
      ctx.quadraticCurveTo(Number(pCurr.x || 0), Number(pCurr.y || 0), Number(pCurr.x || 0), Number(pCurr.y || 0));
      ctx.stroke();
    }
  };
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 9.5;
  let currentSegment = [];
  for (let i = 0; i < path.length; i += 1) {
    const p = path[i];
    if (!p || p.break) {
      drawSegment(currentSegment);
      currentSegment = [];
      continue;
    }
    currentSegment.push(p);
  }
  drawSegment(currentSegment);
  ctx.restore();
}

function _lecturasGameBuildRoundFromLectura(lectura = null, runtime = lecturasGameModeRuntime) {
  const rawHtml = String(
    lectura?.htmlLectura
    || lectura?.raw?.contenidoHTML
    || lectura?.raw?.textoLectura
    || lectura?.raw?.contenidoCompleto
    || lectura?.raw?.lectura
    || lectura?.raw?.contenido
    || lectura?.raw?.texto
    || ""
  ).trim();
  const sinonimosSource = _lecturasHasStructuredContent(lectura?.sinonimos)
    ? lectura.sinonimos
    : resolveLecturaSinonimos(lectura?.raw || {});
  const fromSinonimos = _lecturasGameExtractWordPairsFromSinonimos(sinonimosSource || null);
  const fromHtmlTable = _lecturasGameExtractWordPairsFromHtmlTables(rawHtml);
  const fromNarrative = (fromSinonimos.length || fromHtmlTable.length)
    ? []
    : _lecturasGameBuildWordPairsFromNarrativeFallback(rawHtml);
  const pool = [...fromSinonimos, ...fromHtmlTable, ...fromNarrative];
  const cleanPool = pool
    .map((item) => ({
      target: _lecturasGameNormalizeWord(item?.target || ""),
      synonyms: Array.from(new Set((item?.synonyms || []).map((s) => _lecturasGameNormalizeWord(s)).filter(Boolean)))
    }))
    .filter((item) => item.target && item.synonyms.length);
  if (!cleanPool.length) return null;

  const picked = _lecturasGamePickRandom(cleanPool);
  if (!picked) return null;
  const targetWord = _lecturasGameNormalizeWord(picked.target || "");
  const targetSynonyms = new Set((picked.synonyms || []).map((s) => _lecturasGameNormalizeWord(s)).filter(Boolean));
  const correctSynonym = _lecturasGameNormalizeWord(_lecturasGamePickRandom(Array.from(targetSynonyms)) || "");
  if (!targetWord || !correctSynonym) return null;

  const distractorPool = new Set();
  const levelNow = Math.max(1, Number(runtime?.progress?.level || 1));
  const wrongTargetCount = Math.max(10, Math.min(96, 10 + ((levelNow - 1) * 8)));
  const narrativeWordPool = _lecturasGameExtractNarrativeWordPool(rawHtml, 3);
  cleanPool.forEach((item) => {
    const itemTarget = _lecturasGameNormalizeWord(item.target || "");
    if (itemTarget && itemTarget !== targetWord && itemTarget !== correctSynonym && !targetSynonyms.has(itemTarget)) {
      distractorPool.add(itemTarget);
    }
    (item.synonyms || []).forEach((syn) => {
      const word = _lecturasGameNormalizeWord(syn);
      if (!word) return;
      if (word === targetWord || word === correctSynonym || targetSynonyms.has(word)) return;
      distractorPool.add(word);
    });
  });
  if (distractorPool.size < wrongTargetCount) {
    narrativeWordPool.forEach((word) => {
      if (!word) return;
      if (word === targetWord || word === correctSynonym || targetSynonyms.has(word)) return;
      distractorPool.add(word);
    });
  }
  if (distractorPool.size < wrongTargetCount) {
    Object.entries(LECTURAS_GAME_FALLBACK_SYNONYM_BANK).forEach(([word, synonyms]) => {
      if (!word || word === targetWord || word === correctSynonym || targetSynonyms.has(word)) return;
      distractorPool.add(word);
      (Array.isArray(synonyms) ? synonyms : []).forEach((syn) => {
        const clean = _lecturasGameNormalizeWord(syn);
        if (!clean || clean === targetWord || clean === correctSynonym || targetSynonyms.has(clean)) return;
        distractorPool.add(clean);
      });
    });
  }
  if (distractorPool.size < wrongTargetCount) {
    const synthLimit = Math.max(120, wrongTargetCount * 8);
    for (let i = 0; i < synthLimit && distractorPool.size < wrongTargetCount; i += 1) {
      const synthetic = _lecturasGameNormalizeWord(`termino ${i + 1}`);
      if (!synthetic || synthetic === targetWord || synthetic === correctSynonym || targetSynonyms.has(synthetic)) continue;
      distractorPool.add(synthetic);
    }
  }

  const grade = String(lectura?.grado || "").trim();
  const wrongCount = wrongTargetCount;
  const distractors = _lecturasGameShuffle(Array.from(distractorPool)).slice(0, wrongCount);
  if (distractors.length < wrongTargetCount) return null;

  return {
    targetWord,
    correctSynonym,
    distractors,
    words: _lecturasGameShuffle([correctSynonym, ...distractors]),
    meta: {
      title: String(lectura?.titulo || "Lectura").trim() || "Lectura",
      grade: gradeLabel(grade || "")
    }
  };
}

function _lecturasGameDrawImageCover(ctx, img, width = 0, height = 0) {
  if (!ctx || !img) return false;
  const w = Math.max(1, Number(width || 0));
  const h = Math.max(1, Number(height || 0));
  const iw = Math.max(1, Number(img.naturalWidth || img.width || 1));
  const ih = Math.max(1, Number(img.naturalHeight || img.height || 1));
  const ratio = Math.max(w / iw, h / ih);
  const dw = iw * ratio;
  const dh = ih * ratio;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
  return true;
}

function _lecturasGameEnsurePencilSprite(runtime = lecturasGameModeRuntime) {
  const sprite = runtime.pencilSprite || (runtime.pencilSprite = {
    image: null,
    ready: false,
    loading: false,
    failed: false
  });
  if (sprite.ready && sprite.image) return sprite.image;
  if (sprite.loading || sprite.failed) return null;
  sprite.loading = true;
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    sprite.image = img;
    sprite.ready = true;
    sprite.loading = false;
    sprite.failed = false;
  };
  img.onerror = () => {
    sprite.image = null;
    sprite.ready = false;
    sprite.loading = false;
    sprite.failed = true;
  };
  img.src = "lapiz.png";
  return null;
}

function _lecturasGameStartBackgroundTransition(previousImg = null, nextImg = null, runtime = lecturasGameModeRuntime) {
  if (!previousImg || !nextImg) return;
  const width = Math.max(320, Number(runtime.viewWidth || 960));
  const height = Math.max(240, Number(runtime.viewHeight || 540));
  const snapshot = document.createElement("canvas");
  snapshot.width = Math.round(width);
  snapshot.height = Math.round(height);
  const sctx = snapshot.getContext("2d");
  if (!sctx) return;
  _lecturasGameDrawImageCover(sctx, previousImg, width, height);

  const cols = 8;
  const rows = 5;
  const pieceW = width / cols;
  const pieceH = height / rows;
  const shards = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const sx = c * pieceW;
      const sy = r * pieceH;
      shards.push({
        sx,
        sy,
        sw: pieceW,
        sh: pieceH,
        x: sx,
        y: sy,
        vx: (Math.random() - 0.5) * 220,
        vy: 20 + Math.random() * 80,
        rot: 0,
        vr: (Math.random() - 0.5) * 2.4,
        alpha: 1,
        delayMs: 120 + Math.random() * 160
      });
    }
  }
  const smoke = Array.from({ length: 22 }).map(() => ({
    x: Math.random() * width,
    y: height * (0.18 + Math.random() * 0.48),
    vx: (Math.random() - 0.5) * 34,
    vy: -(18 + Math.random() * 42),
    r: 18 + Math.random() * 36,
    growth: 22 + Math.random() * 28,
    alpha: 0.36 + Math.random() * 0.34
  }));
  runtime.backgroundTransition = {
    active: true,
    elapsedMs: 0,
    shakeMs: 260,
    breakMs: 220,
    durationMs: 1500,
    gravity: 820,
    fadeRate: 1.25,
    snapshot,
    shards,
    smoke
  };
}

function _lecturasGameUpdateBackgroundTransition(dtMs = 16, runtime = lecturasGameModeRuntime) {
  const t = runtime.backgroundTransition;
  if (!t?.active) return;
  t.elapsedMs += Math.max(1, Number(dtMs || 16));
  const sec = Math.max(0.001, Number(dtMs || 16) / 1000);
  const breakStarted = t.elapsedMs >= t.breakMs;
  if (breakStarted) {
    t.shards.forEach((piece) => {
      if (!piece || piece.alpha <= 0) return;
      if (t.elapsedMs < piece.delayMs) return;
      piece.vy += t.gravity * sec;
      piece.x += piece.vx * sec;
      piece.y += piece.vy * sec;
      piece.rot += piece.vr * sec;
      piece.alpha = Math.max(0, piece.alpha - (t.fadeRate * sec));
    });
    t.smoke.forEach((puff) => {
      if (!puff || puff.alpha <= 0) return;
      puff.x += puff.vx * sec;
      puff.y += puff.vy * sec;
      puff.r += puff.growth * sec;
      puff.alpha = Math.max(0, puff.alpha - (0.46 * sec));
    });
  }
  const allGone = t.shards.every((piece) => !piece || piece.alpha <= 0.01);
  if (t.elapsedMs >= t.durationMs || allGone) {
    runtime.backgroundTransition = null;
  }
}

function _lecturasGameStartLevelTransitionFx(runtime = lecturasGameModeRuntime, options = {}) {
  runtime.levelTransitionFx = {
    active: true,
    elapsedMs: 0,
    durationMs: Math.max(320, Number(options.durationMs || 760)),
    amplitude: Math.max(8, Number(options.amplitude || 22)),
    frequencyX: Math.max(0.05, Number(options.frequencyX || 0.123)),
    frequencyY: Math.max(0.05, Number(options.frequencyY || 0.161))
  };
  if (options?.force === true) runtime.forceNextBackgroundTransition = true;
}

function _lecturasGameUpdateLevelTransitionFx(dtMs = 16, runtime = lecturasGameModeRuntime) {
  const fx = runtime.levelTransitionFx;
  if (!fx?.active) return;
  fx.elapsedMs += Math.max(1, Number(dtMs || 16));
  if (fx.elapsedMs >= Number(fx.durationMs || 0)) {
    runtime.levelTransitionFx = null;
  }
}

function _lecturasGameGetLayerShakeOffset(runtime = lecturasGameModeRuntime) {
  const fx = runtime.levelTransitionFx;
  if (!fx?.active) return { x: 0, y: 0, scale: 1 };
  const progress = Math.max(0, Math.min(1, Number(fx.elapsedMs || 0) / Math.max(1, Number(fx.durationMs || 1))));
  const decay = Math.pow(1 - progress, 1.75);
  const amp = Number(fx.amplitude || 0) * decay;
  const t = Number(fx.elapsedMs || 0);
  return {
    x: Math.sin(t * Number(fx.frequencyX || 0.1)) * amp,
    y: Math.cos(t * Number(fx.frequencyY || 0.13)) * (amp * 0.9),
    scale: 1 + (0.0075 * decay)
  };
}

function _lecturasGameApplyLayerShake(runtime = lecturasGameModeRuntime) {
  const stage = runtime?.ui?.stageEl || runtime?.canvasEl?.parentElement || null;
  if (!stage?.style) return;
  const offset = _lecturasGameGetLayerShakeOffset(runtime);
  stage.style.setProperty("--lg-shake-x", `${Number(offset.x || 0).toFixed(2)}px`);
  stage.style.setProperty("--lg-shake-y", `${Number(offset.y || 0).toFixed(2)}px`);
  stage.style.setProperty("--lg-shake-scale", `${Number(offset.scale || 1).toFixed(4)}`);
}

function _lecturasGameResetLayerShake(runtime = lecturasGameModeRuntime) {
  const stage = runtime?.ui?.stageEl || runtime?.canvasEl?.parentElement || null;
  if (!stage?.style) return;
  stage.style.setProperty("--lg-shake-x", "0px");
  stage.style.setProperty("--lg-shake-y", "0px");
  stage.style.setProperty("--lg-shake-scale", "1");
}

function _lecturasGameCloseSegmentationMask(mask = null) {
  try { mask?.close?.(); } catch (_) { }
}

function _lecturasGameExtractSegmentationMaskData(mask = null, threshold = 0.38) {
  if (!mask) return null;
  try {
    const width = Math.max(1, Number(mask.width || mask.cols || 0));
    const height = Math.max(1, Number(mask.height || mask.rows || 0));
    if (!width || !height) return null;
    let values = null;
    if (typeof mask.getAsFloat32Array === "function") {
      values = mask.getAsFloat32Array();
    } else if (typeof mask.getAsUint8Array === "function") {
      const raw = mask.getAsUint8Array();
      if (raw?.length) {
        values = new Float32Array(raw.length);
        for (let i = 0; i < raw.length; i += 1) values[i] = raw[i] / 255;
      }
    }
    if (!values?.length) return null;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const mctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!mctx) return null;
    const imageData = mctx.createImageData(width, height);
    const data = imageData.data;
    const softThreshold = Math.max(0.02, Math.min(0.95, Number(threshold || 0.38)));
    for (let i = 0; i < values.length; i += 1) {
      const v = Math.max(0, Math.min(1, Number(values[i] || 0)));
      const alpha = v <= softThreshold ? 0 : Math.round((v - softThreshold) * (255 / Math.max(0.001, 1 - softThreshold)));
      const idx = i * 4;
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      data[idx + 3] = Math.max(0, Math.min(255, alpha));
    }
    mctx.putImageData(imageData, 0, 0);
    return { canvas, width, height };
  } catch (_) {
    return null;
  } finally {
    _lecturasGameCloseSegmentationMask(mask);
  }
}

function _lecturasGameStoreSilhouetteMask(side = "solo", mask = null, nowMs = performance.now(), runtime = lecturasGameModeRuntime) {
  const silhouette = runtime.silhouette || {};
  const baked = _lecturasGameExtractSegmentationMaskData(mask, silhouette.maskThreshold);
  if (!baked) return false;
  silhouette.bySide = silhouette.bySide || { solo: null, left: null, right: null };
  silhouette.bySide[String(side || "solo")] = {
    canvas: baked.canvas,
    width: baked.width,
    height: baked.height,
    updatedAt: Number(nowMs || performance.now())
  };
  runtime.silhouette = silhouette;
  return true;
}

function _lecturasGameGetSilhouetteMaskForSide(side = "solo", runtime = lecturasGameModeRuntime, nowMs = performance.now()) {
  const silhouette = runtime.silhouette || {};
  const bySide = silhouette.bySide || {};
  const key = String(side || "solo");
  const target = bySide[key] || null;
  if (!target) return null;
  const maxAge = Math.max(60, Number(silhouette.maskPersistenceMs || 120));
  if ((Number(nowMs || performance.now()) - Number(target.updatedAt || 0)) > maxAge) return null;
  return target;
}

function _lecturasGameEnsureSilhouetteBuffers(runtime = lecturasGameModeRuntime) {
  const silhouette = runtime.silhouette || {};
  const w = Math.max(2, Number(runtime.viewWidth || 960));
  const h = Math.max(2, Number(runtime.viewHeight || 540));
  if (!silhouette.tempCanvas) silhouette.tempCanvas = document.createElement("canvas");
  if (silhouette.tempCanvas.width !== w || silhouette.tempCanvas.height !== h) {
    silhouette.tempCanvas.width = w;
    silhouette.tempCanvas.height = h;
  }
  if (!silhouette.tempCtx) silhouette.tempCtx = silhouette.tempCanvas.getContext("2d");
  runtime.silhouette = silhouette;
  return !!silhouette.tempCtx;
}

function _lecturasGameRenderSilhouetteFromMask(ctx = null, side = "solo", runtime = lecturasGameModeRuntime, nowMs = performance.now()) {
  if (!ctx || !runtime?.silhouette?.enabled) return false;
  const maskInfo = _lecturasGameGetSilhouetteMaskForSide(side, runtime, nowMs);
  if (!maskInfo?.canvas) return false;
  if (!_lecturasGameEnsureSilhouetteBuffers(runtime)) return false;
  const w = Math.max(2, Number(runtime.viewWidth || 960));
  const h = Math.max(2, Number(runtime.viewHeight || 540));
  const tctx = runtime.silhouette.tempCtx;
  tctx.clearRect(0, 0, w, h);
  tctx.save();
  if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR) {
    const splitX = w / 2;
    if (String(side) === "left") tctx.rect(0, 0, splitX, h);
    else tctx.rect(splitX, 0, splitX, h);
    tctx.clip();
  }
  // Mirror silhouette so movement matches mirrored gameplay coordinates.
  tctx.translate(w, 0);
  tctx.scale(-1, 1);
  tctx.drawImage(maskInfo.canvas, 0, 0, w, h);
  tctx.globalCompositeOperation = "source-in";
  tctx.fillStyle = "rgba(0, 0, 0, 1)";
  tctx.fillRect(0, 0, w, h);
  tctx.globalCompositeOperation = "source-over";
  tctx.restore();
  ctx.save();
  if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR) {
    const splitX = w / 2;
    if (String(side) === "left") ctx.rect(0, 0, splitX, h);
    else ctx.rect(splitX, 0, splitX, h);
    ctx.clip();
  }
  ctx.globalAlpha = Math.max(0.35, Math.min(1, Number(runtime.silhouette.realAlpha || 0.88)));
  ctx.drawImage(runtime.silhouette.tempCanvas, 0, 0, w, h);
  ctx.restore();
  return true;
}

function _lecturasGameRenderProceduralSilhouette(ctx = null, side = "solo", runtime = lecturasGameModeRuntime) {
  if (!ctx) return false;
  const joints = _lecturasGameGetJointsForSide(side, runtime);
  const segments = _lecturasGameGetSegmentsForSide(side, runtime);
  if (!joints.length && !segments.length) return false;
  const w = Math.max(2, Number(runtime.viewWidth || 960));
  const h = Math.max(2, Number(runtime.viewHeight || 540));
  ctx.save();
  if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR) {
    const splitX = w / 2;
    if (String(side) === "left") ctx.rect(0, 0, splitX, h);
    else ctx.rect(splitX, 0, splitX, h);
    ctx.clip();
  }
  ctx.strokeStyle = "rgba(0, 0, 0, 0.82)";
  ctx.lineWidth = 52;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  segments.forEach((seg) => {
    ctx.beginPath();
    ctx.moveTo(seg.ax, seg.ay);
    ctx.lineTo(seg.bx, seg.by);
    ctx.stroke();
  });
  ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
  joints.forEach((joint) => {
    ctx.beginPath();
    ctx.arc(Number(joint.x || 0), Number(joint.y || 0), Math.max(16, Number(joint.r || 10) * 2.8), 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
  return true;
}

function _lecturasGameRenderPlayerSilhouette(ctx = null, runtime = lecturasGameModeRuntime, nowMs = performance.now()) {
  if (!ctx || !runtime?.silhouette?.enabled) return false;
  const allowFallback = runtime?.silhouette?.proceduralFallback === true;
  if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR) {
    const leftReal = runtime.silhouette.preferReal ? _lecturasGameRenderSilhouetteFromMask(ctx, "left", runtime, nowMs) : false;
    const rightReal = runtime.silhouette.preferReal ? _lecturasGameRenderSilhouetteFromMask(ctx, "right", runtime, nowMs) : false;
    const leftOk = leftReal || (allowFallback ? _lecturasGameRenderProceduralSilhouette(ctx, "left", runtime) : false);
    const rightOk = rightReal || (allowFallback ? _lecturasGameRenderProceduralSilhouette(ctx, "right", runtime) : false);
    return leftOk || rightOk;
  }
  const real = runtime.silhouette.preferReal ? _lecturasGameRenderSilhouetteFromMask(ctx, "solo", runtime, nowMs) : false;
  return real || (allowFallback ? _lecturasGameRenderProceduralSilhouette(ctx, "solo", runtime) : false);
}

function _lecturasGameBuildHarvestChallenge(runtime = lecturasGameModeRuntime) {
  const wordsCount = Math.max(20, Math.min(38, 20 + Math.round(Number(runtime?.progress?.level || 1) * 2)));
  const words = [];
  const source = _lecturasGameShuffle([...LECTURAS_GAME_CROP_WORDS, "GEMA", "RANK", "NIVEL", "RACHA"]);
  for (let i = 0; i < wordsCount; i += 1) {
    words.push(source[i % source.length] || `COSECHA ${i + 1}`);
  }
  return {
    targetWord: "COSECHA",
    correctSynonym: "",
    distractors: [...words],
    words: _lecturasGameShuffle(words),
    meta: {
      title: "Cosecha de conocimiento",
      grade: gradeLabel(runtime?.lectura?.grado || "")
    }
  };
}

function _lecturasGameApplyOrderStageWords(runtime = lecturasGameModeRuntime) {
  if (!_lecturasGameIsOrderChallenge(runtime) || !runtime?.round) return false;
  const phrases = Array.isArray(runtime.round.orderPhrases) ? runtime.round.orderPhrases : [];
  const index = Math.max(0, Number(runtime.round.orderIndex || 0));
  const phrase = phrases[index];
  if (!phrase) return false;
  const glowCycle = ["violet", "green", "orange"];
  runtime.round.orderTrapActive = false;
  runtime.round.orderLastReadResult = "";
  runtime.round.orderPhraseGlow = glowCycle[index % glowCycle.length];
  runtime.round.orderPhraseAnimVersion = Number(runtime.round.orderPhraseAnimVersion || 0) + 1;
  runtime.round.orderPhraseStartedAt = Number(performance.now() || Date.now());
  const phraseWords = String(phrase.text || "").split(/\s+/g).map((item) => String(item || "").trim()).filter(Boolean);
  const speakable = _lecturasGameBuildOrderSpeakableFromPhraseWords(phraseWords);
  runtime.round.orderPhraseWords = phraseWords;
  runtime.round.orderPhraseWordStates = phraseWords.map(() => "pending");
  runtime.round.orderPhrasePenalized = phraseWords.map(() => false);
  runtime.round.orderPhraseSpeakable = speakable;
  runtime.round.orderWordIndex = 0;
  runtime.round.orderActiveDisplayIndex = Number(speakable[0]?.displayIdx ?? 0);
  runtime.round.orderSpeechPrimed = false;
  runtime.round.orderHasHardMismatch = false;
  runtime.round.targetWord = String(phrase.targetWord || "").trim();
  runtime.round.correctSynonym = String(phrase.targetWord || "").trim();
  runtime.round.distractors = [];
  runtime.round.words = [];
  _lecturasGameClearAllWordEntities(runtime);
  const campaign = runtime.readingCampaign || (runtime.readingCampaign = {});
  campaign.totalReadingUnits = Math.max(0, Number(runtime?.round?.orderParagraphTotal || phrases.length || 0));
  campaign.readingCursor = Math.max(0, Math.min(campaign.totalReadingUnits, Number(runtime?.round?.orderIndex || 0)));
  runtime.orderVoice.processedWordCount = 0;
  runtime.orderVoice.lastTranscript = "";
  runtime.orderVoice.lastTranscriptAll = "";
  _lecturasGameResetOrderSpeechRetryState(runtime);
  const voice = runtime.orderVoice || (runtime.orderVoice = {});
  voice.attempt = _lecturasGameCreateOrderVoiceAttempt(speakable, voice);
  const spellMode = _lecturasGameDetectOrderSpellMode(String(phrase.text || ""), speakable);
  voice.spellMode = spellMode;
  voice.expectedLetters = spellMode ? _lecturasGameGetOrderExpectedLetters(runtime) : [];
  voice.alternatives = [];
  voice.bestAlternative = "";
  voice.bestAltText = "";
  voice.bestAltScore = 0;
  voice.bestAltConfidence = 0;
  voice.lastRejectReason = "";
  voice.spellRetryCount = 0;
  runtime.orderDemo = runtime.orderDemo || {};
  runtime.orderDemo.awaitingPlayback = true;
  runtime.orderDemo.playing = false;
  runtime.orderDemo.completed = false;
  runtime.orderDemo.phraseText = String(phrase.text || "");
  runtime.orderDemo.phraseIndex = index;
  runtime.orderDemo.lastError = "";
  return true;
}

function _lecturasGameOrderOnCountdownFinished(runtime = lecturasGameModeRuntime) {
  _lecturasGameSetMode(LECTURAS_GAME_MODE.PLAYING);
  const voice = runtime?.orderVoice || (runtime.orderVoice = {});
  if (voice.listening === true || voice.starting === true) {
    if (voice.listening === true) {
      voice.state = LECTURAS_GAME_ORDER_VOICE_STATE.LISTENING;
      voice.lastTransition = "ORDER_MIC_LISTENING_READY";
      voice.lastTransitionAt = Number(performance.now() || Date.now());
    } else {
      voice.state = LECTURAS_GAME_ORDER_VOICE_STATE.ARMING_MIC;
      voice.lastTransition = "ORDER_MIC_ARMING_READY";
      voice.lastTransitionAt = Number(performance.now() || Date.now());
    }
    _lecturasGameRenderOrderPhraseUi(runtime);
    return;
  }
  _lecturasGameStartOrderReadFlow(runtime, { autoStartMic: true });
}

function _lecturasGameQueueOrderSpeech(runtime = lecturasGameModeRuntime) {
  const voice = runtime.orderVoice || (runtime.orderVoice = {});
  const demo = runtime.orderDemo || (runtime.orderDemo = {});
  const phrase = _lecturasGameGetCurrentOrderPhrase(runtime);
  demo.awaitingPlayback = true;
  demo.playing = false;
  demo.completed = false;
  demo.runId = Number(demo.runId || 0);
  demo.phraseText = String(phrase?.text || "");
  demo.phraseIndex = Math.max(0, Number(runtime?.round?.orderIndex || 0));
  demo.lastError = "";
  voice.state = LECTURAS_GAME_ORDER_VOICE_STATE.IDLE;
  voice.manualRetryRequired = false;
  voice.nextAutoStartAt = 0;
  voice.recoveryInFlight = false;
  voice.lastTransition = "ORDER_DEMO_READY";
  voice.lastTransitionAt = Number(performance.now() || Date.now());
  runtime.progress.rewardMessage = "Escucha el ejemplo y luego dicta la frase.";
  _lecturasGameRenderOrderPhraseUi(runtime);
}

function _lecturasGameBeginOrderCountdown(runtime = lecturasGameModeRuntime, transition = "ORDER_COUNTDOWN_START") {
  if (!_lecturasGameIsOrderChallenge(runtime)) return false;
  _lecturasGameBroadcastGlobalMicRelease("order-countdown-start");
  runtime.orderVoice = runtime.orderVoice || {};
  runtime.orderVoice.supported = !!_lecturasGameGetSpeechRecognitionCtor();
  runtime.orderVoice.state = LECTURAS_GAME_ORDER_VOICE_STATE.COUNTDOWN;
  runtime.orderVoice.lastTransition = String(transition || "ORDER_COUNTDOWN_START");
  runtime.orderVoice.lastTransitionAt = Number(performance.now() || Date.now());
  runtime.orderVoice.nextAutoStartAt = 0;
  runtime.orderDemo = runtime.orderDemo || {};
  runtime.orderDemo.awaitingPlayback = false;
  runtime.orderDemo.playing = false;
  runtime.orderDemo.completed = true;
  runtime.countdownMs = 3000;
  _lecturasGameResetOrderSpeechRetryState(runtime);
  _lecturasGameSetMode(LECTURAS_GAME_MODE.COUNTDOWN);
  Promise.resolve(_lecturasGamePrepareCountdownAudio(runtime)).catch(() => { });
  return true;
}

function _lecturasGameStartOrderDemoPlayback(runtime = lecturasGameModeRuntime) {
  if (!_lecturasGameIsOrderChallenge(runtime) || !runtime?.round) return false;
  const demo = runtime.orderDemo || (runtime.orderDemo = {});
  const phrase = _lecturasGameGetCurrentOrderPhrase(runtime);
  const text = String(demo.phraseText || phrase?.text || "").replace(/\s+/g, " ").trim();
  if (!text) return false;
  if (demo.pollTimerId) {
    clearTimeout(demo.pollTimerId);
    demo.pollTimerId = 0;
  }
  demo.awaitingPlayback = true;
  demo.playing = true;
  demo.completed = false;
  demo.lastError = "";
  demo.phraseText = text;
  demo.phraseIndex = Math.max(0, Number(runtime?.round?.orderIndex || 0));
  const runId = Number(demo.runId || 0) + 1;
  demo.runId = runId;
  runtime.progress.rewardMessage = "Escucha el ejemplo. Al terminar, inicia el 3, 2, 1.";
  try { _detenerAudioWorkflowPlay(); } catch (_) { }
  _setLiveStateIdle({ keepRef: false });
  detenerGeminiLiveUnidad().catch(() => { });
  _lecturasGameStopOrderSpeech(runtime);
  _lecturasGameSetOrderReadingAudioState(true, runtime);
  _lecturasGameRenderOrderPhraseUi(runtime);
  const finishWithError = (reason = "gemini_live_demo_failed") => {
    if (Number(runtime?.orderDemo?.runId || 0) !== runId) return;
    if (runtime?.orderDemo?.pollTimerId) {
      clearTimeout(runtime.orderDemo.pollTimerId);
      runtime.orderDemo.pollTimerId = 0;
    }
    runtime.orderDemo.playing = false;
    runtime.orderDemo.awaitingPlayback = true;
    runtime.orderDemo.completed = false;
    runtime.orderDemo.lastError = reason;
    runtime.progress.rewardMessage = "No se pudo reproducir el ejemplo. Intenta otra vez.";
    _lecturasGameSetOrderReadingAudioState(false, runtime);
    _lecturasGameRenderOrderPhraseUi(runtime);
    _lecturasGameRenderOrderDemoPanel(runtime);
  };
  const handled = hablarAgenteUnidad(text, {
    cancelPrevious: true,
    onPlaybackStart: () => {
      if (Number(runtime?.orderDemo?.runId || 0) !== runId) return;
      runtime.orderDemo.playing = true;
      runtime.orderDemo.awaitingPlayback = true;
      runtime.orderDemo.completed = false;
      runtime.orderDemo.lastError = "";
      runtime.progress.rewardMessage = "Escucha la lectura de ejemplo. Al terminar inicia el 3, 2, 1.";
      _lecturasGameRenderOrderPhraseUi(runtime);
      _lecturasGameRenderOrderDemoPanel(runtime);
    },
    onPlaybackEnd: () => _lecturasGameFinishOrderDemoPlayback(runtime, runId),
    onPlaybackError: () => finishWithError("order_demo_gemini_live_failed")
  });
  if (!handled) {
    finishWithError("order_demo_gemini_live_unavailable");
    return false;
  }
  return true;
}

function _lecturasGameNavigateOrderPhrase(step = 0, runtime = lecturasGameModeRuntime) {
  if (!_lecturasGameIsOrderChallenge(runtime) || !runtime?.round) return false;
  const phrases = Array.isArray(runtime.round.orderPhrases) ? runtime.round.orderPhrases : [];
  if (!phrases.length) return false;
  const current = Math.max(0, Number(runtime.round.orderIndex || 0));
  const next = Math.max(0, Math.min(phrases.length - 1, current + Number(step || 0)));
  if (next === current) {
    _lecturasGameRenderOrderDemoPanel(runtime);
    return false;
  }
  if (runtime?.orderDemo?.pollTimerId) {
    clearTimeout(runtime.orderDemo.pollTimerId);
    runtime.orderDemo.pollTimerId = 0;
  }
  try { _detenerAudioWorkflowPlay(); } catch (_) { }
  _setLiveStateIdle({ keepRef: false });
  detenerGeminiLiveUnidad().catch(() => { });
  _lecturasGameStopOrderSpeech(runtime);
  runtime.round.orderTrapActive = false;
  runtime.round.orderLastReadResult = "";
  runtime.round.orderIndex = next;
  _lecturasGameClearAllWordEntities(runtime);
  const campaign = runtime.readingCampaign || (runtime.readingCampaign = {});
  campaign.readingCursor = next;
  campaign.idleSinceMs = 0;
  if (!_lecturasGameApplyOrderStageWords(runtime)) return false;
  _lecturasGameQueueOrderSpeech(runtime);
  _lecturasGameSetMode(LECTURAS_GAME_MODE.PLAYING);
  runtime.progress.rewardMessage = "Frase cambiada. Puedes escuchar la lectura o empezar de nuevo.";
  _lecturasGameSetOrderReadingAudioState(false, runtime);
  _lecturasGameSetGameMusicDucking(false, runtime);
  _lecturasGameRenderOrderPhraseUi(runtime);
  _lecturasGameRenderOrderDemoPanel(runtime);
  return true;
}

function _lecturasGameGetOrderPlayerDisplayName(runtime = lecturasGameModeRuntime) {
  if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR) {
    const left = String(runtime?.playerAccounts?.left?.alias || runtime?.playerAccounts?.left?.username || runtime?.playerAccounts?.left?.displayName || "Jugador A").trim();
    const right = String(runtime?.playerAccounts?.right?.alias || runtime?.playerAccounts?.right?.username || runtime?.playerAccounts?.right?.displayName || "Jugador B").trim();
    return `${left} / ${right}`;
  }
  return String(
    runtime?.playerAccounts?.solo?.alias
    || runtime?.playerAccounts?.solo?.username
    || runtime?.playerAccounts?.solo?.displayName
    || "Invitado"
  ).trim() || "Invitado";
}

function _lecturasGameResetOrderCampaignState(runtime = lecturasGameModeRuntime, options = {}) {
  if (!_lecturasGameIsOrderChallenge(runtime)) return;
  const resetPerfect = options?.resetPerfect !== false;
  const campaign = runtime.readingCampaign || (runtime.readingCampaign = {});
  const total = Math.max(0, Number(runtime?.round?.orderParagraphTotal || runtime?.round?.orderPhrases?.length || 0));
  campaign.readingCursor = 0;
  campaign.totalReadingUnits = total;
  campaign.consecutivePronunciationErrors = 0;
  campaign.idleSinceMs = 0;
  campaign.lastQuizCheckpoint = 0;
  campaign.pronouncedCorrectWords = 0;
  campaign.pronouncedWrongWords = 0;
  if (resetPerfect) campaign.perfectRun = true;
  runtime.completionType = "";
  runtime.isChampion = false;
  runtime.championName = "";
}

function _lecturasGameGetOrderIdleRemainingMs(runtime = lecturasGameModeRuntime, nowMs = performance.now()) {
  if (!_lecturasGameIsOrderChallenge(runtime) || runtime?.round?.orderTrapActive === true) return 0;
  const campaign = runtime.readingCampaign || {};
  const idleSince = Number(campaign.idleSinceMs || 0);
  if (!idleSince) return LECTURAS_GAME_ORDER_IDLE_LOSE_MS;
  return Math.max(0, LECTURAS_GAME_ORDER_IDLE_LOSE_MS - Math.max(0, Number(nowMs || performance.now()) - idleSince));
}

function _lecturasGameIsOrderReadingPhase(runtime = lecturasGameModeRuntime) {
  return _lecturasGameIsOrderChallenge(runtime)
    && runtime?.mode === LECTURAS_GAME_MODE.PLAYING
    && runtime?.round?.orderTrapActive !== true;
}

function _lecturasGamePauseCombatTimers(runtime = lecturasGameModeRuntime, dtMs = 0) {
  const dt = Math.max(0, Number(dtMs || 0));
  if (dt <= 0) return;
  const bump = (value = 0) => {
    const n = Number(value || 0);
    return n > 0 ? (n + dt) : n;
  };
  runtime.fireModeUntilMs = bump(runtime.fireModeUntilMs);
  runtime.freezeUntilMs = bump(runtime.freezeUntilMs);
  runtime.pacifistUntilMs = bump(runtime.pacifistUntilMs);
  runtime.chaosUntilMs = bump(runtime.chaosUntilMs);
  runtime.bombReadyUntilMs = bump(runtime.bombReadyUntilMs);
  if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR) {
    LECTURAS_GAME_PAIR_SIDES.forEach((side) => {
      const state = _lecturasGameGetPairSideState(side, runtime);
      state.fireModeUntilMs = bump(state.fireModeUntilMs);
      state.freezeUntilMs = bump(state.freezeUntilMs);
      state.pacifistUntilMs = bump(state.pacifistUntilMs);
      state.chaosUntilMs = bump(state.chaosUntilMs);
      state.bombReadyUntilMs = bump(state.bombReadyUntilMs);
    });
  }
}

function _lecturasGameHandleOrderLoseByReason(reason = "lost_by_errors", runtime = lecturasGameModeRuntime) {
  if (!_lecturasGameIsOrderChallenge(runtime) || !runtime?.active) return;
  runtime.completionType = String(reason || "lost_by_errors");
  runtime.isChampion = false;
  const campaign = runtime.readingCampaign || (runtime.readingCampaign = {});
  campaign.idleSinceMs = 0;
  runtime.touchedCorrect = false;
  _lecturasGameStopOrderSpeech(runtime, { restoreAudio: false });
  _lecturasGamePlayLoseSound();
  _lecturasGameStopGameMusic(runtime, reason);
  _lecturasGameSetMode(LECTURAS_GAME_MODE.LOST);
}

function _lecturasGameResetBombState(runtime = lecturasGameModeRuntime, side = "") {
  if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR && (side === "left" || side === "right")) {
    const state = _lecturasGameGetPairSideState(side, runtime);
    state.bombReadyUntilMs = 0;
    state.bombActivatedAtMs = 0;
    state.bombChestHoldStartMs = 0;
    state.bombChargeNorm = 0;
    return;
  }
  runtime.bombReadyUntilMs = 0;
  runtime.bombActivatedAtMs = 0;
  runtime.bombChestHoldStartMs = 0;
  runtime.bombChargeNorm = 0;
}

function _lecturasGameResetFireState(runtime = lecturasGameModeRuntime, side = "") {
  if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR && (side === "left" || side === "right")) {
    const state = _lecturasGameGetPairSideState(side, runtime);
    state.fireModeUntilMs = 0;
    state.fireModeType = LECTURAS_GAME_POWERUP_TYPES.FIRE;
    return;
  }
  runtime.fireModeActive = false;
  runtime.fireModeUntilMs = 0;
  runtime.fireModeType = LECTURAS_GAME_POWERUP_TYPES.FIRE;
}

function _lecturasGameFinalizeOrderCampaignWin(runtime = lecturasGameModeRuntime) {
  if (!_lecturasGameIsOrderChallenge(runtime) || !runtime?.active) return false;
  const campaign = runtime.readingCampaign || (runtime.readingCampaign = {});
  campaign.idleSinceMs = 0;
  const perfect = campaign.perfectRun !== false;
  runtime.completionType = "completed";
  runtime.isChampion = perfect;
  runtime.championName = perfect ? _lecturasGameGetOrderPlayerDisplayName(runtime) : "";
  runtime.progress.rewardMessage = perfect
    ? `Campeón: ${runtime.championName}. Lectura perfecta completada.`
    : "Lectura completada. Buen trabajo.";
  _lecturasGameStopOrderSpeech(runtime, { restoreAudio: false });
  _lecturasGamePlayWinSound();
  _lecturasGameStopGameMusic(runtime, "order-reading-completed");
  _lecturasGameSetMode(LECTURAS_GAME_MODE.WON);
  return true;
}

function _lecturasGameMaybeOpenOrderCheckpointQuiz(runtime = lecturasGameModeRuntime) {
  if (!_lecturasGameIsOrderChallenge(runtime) || !runtime?.round) return false;
  const campaign = runtime.readingCampaign || (runtime.readingCampaign = {});
  const completed = Math.max(0, Number(runtime?.round?.orderIndex || 0));
  if (completed <= 0) return false;
  if ((completed % LECTURAS_GAME_ORDER_QUIZ_EVERY_PARAGRAPHS) !== 0) return false;
  if (completed >= Math.max(1, Number(campaign.totalReadingUnits || runtime?.round?.orderPhrases?.length || 1))) return false;
  if (Number(campaign.lastQuizCheckpoint || 0) >= completed) return false;
  const quiz = _lecturasGameBuildLevelQuiz(runtime);
  if (!quiz) return false;
  quiz.quizKind = "order_checkpoint";
  quiz.checkpointCompleted = completed;
  runtime.quiz = quiz;
  runtime.quizPendingAfterWin = false;
  campaign.lastQuizCheckpoint = completed;
  runtime.progress.rewardMessage = `Checkpoint ${completed}/${campaign.totalReadingUnits}: responde la pregunta para ganar 1 gema.`;
  _lecturasGameSetMode(LECTURAS_GAME_MODE.QUIZ);
  return true;
}

function _lecturasGameResetOrderSpeechRetryState(runtime = lecturasGameModeRuntime) {
  const voice = runtime?.orderVoice || (runtime.orderVoice = {});
  const speakable = Array.isArray(runtime?.round?.orderPhraseSpeakable) ? runtime.round.orderPhraseSpeakable : [];
  voice.state = LECTURAS_GAME_ORDER_VOICE_STATE.IDLE;
  voice.attemptId = Math.max(0, Number(voice.attemptId || 0));
  voice.attempt = _lecturasGameCreateOrderVoiceAttempt(speakable, voice);
  voice.listeningSince = 0;
  voice.silenceDeadline = 0;
  voice.hasDetectedSpeech = false;
  voice.recoverableErrorRetries = 0;
  voice.manualRetryRequired = false;
  voice.processedWordCount = 0;
  voice.lastError = "";
  voice.lastErrorAt = 0;
  voice.lastTransition = "";
  voice.lastTransitionAt = 0;
  voice.nextAutoStartAt = 0;
  voice.validationGraceUntilMs = 0;
  voice.listenStartedAt = 0;
  voice.countdownStartAt = 0;
  voice.countdownUntilMs = 0;
  voice.attemptSettled = false;
  voice.recoveryInFlight = false;
  voice.resetSamePhraseAt = 0;
  voice.alternatives = [];
  voice.bestAlternative = "";
  voice.bestAltText = "";
  voice.bestAltScore = 0;
  voice.bestAltConfidence = 0;
  voice.lastRejectReason = "";
}

function _lecturasGameSetOrderManualMicRetry(runtime = lecturasGameModeRuntime, reason = "mic_error", message = "") {
  const voice = runtime?.orderVoice || (runtime.orderVoice = {});
  voice.state = LECTURAS_GAME_ORDER_VOICE_STATE.MIC_MANUAL_RETRY;
  voice.manualRetryRequired = true;
  voice.recoveryInFlight = false;
  voice.nextAutoStartAt = 0;
  voice.lastError = String(reason || "mic_error");
  voice.lastErrorAt = Number(performance.now() || Date.now());
  voice.lastTransition = "ORDER_MIC_MANUAL_RETRY";
  voice.lastTransitionAt = Number(performance.now() || Date.now());
  if (voice.attempt) {
    voice.attempt.status = "manual_retry";
    voice.attempt.endedAt = Number(performance.now() || Date.now());
  }
  _lecturasGameSetOrderReadingAudioState(false, runtime);
  _lecturasGameSetGameMusicDucking(false, runtime);
  runtime.progress.rewardMessage = String(message || "No se pudo activar el micrófono. Toca \"Hablar ahora\" para reintentar.");
  _lecturasGameRenderOrderPhraseUi(runtime);
}

function _lecturasGameClassifyOrderRecognitionError(errorName = "") {
  const name = String(errorName || "").toLowerCase();
  if (name.includes("not-allowed") || name.includes("service-not-allowed")) return "manual_permissions";
  if (name.includes("no-speech")) return "recover_silent";
  if (name.includes("aborted") || name.includes("audio-capture") || name.includes("network")) return "recover_once";
  return "manual_generic";
}

function _lecturasGameScheduleOrderSpeechRecovery(runtime = lecturasGameModeRuntime, delayMs = LECTURAS_GAME_ORDER_RECOVER_LISTEN_DELAY_MS) {
  if (!_lecturasGameIsOrderChallenge(runtime) || runtime.mode !== LECTURAS_GAME_MODE.PLAYING || runtime?.round?.orderTrapActive === true) {
    return false;
  }
  const voice = runtime.orderVoice || (runtime.orderVoice = {});
  if (voice.manualRetryRequired === true) return false;
  if (voice.recoveryInFlight === true) return false;
  const now = Number(performance.now() || Date.now());
  const deadline = Number(voice.silenceDeadline || 0);
  if (!deadline || now >= deadline) {
    _lecturasGameSetOrderManualMicRetry(runtime, "silence_timeout", "No detecté voz. Toca \"Hablar ahora\" para reactivar el micrófono.");
    return false;
  }
  voice.recoveryInFlight = true;
  voice.state = LECTURAS_GAME_ORDER_VOICE_STATE.ARMING_MIC;
  voice.lastTransition = "ORDER_MIC_ARMING";
  voice.lastTransitionAt = now;
  voice.nextAutoStartAt = now + Math.max(60, Number(delayMs || 0));
  if (voice.attempt) {
    voice.attempt.status = "recovering";
    voice.attempt.endedAt = now;
  }
  runtime.progress.rewardMessage = "Escuchando... pronuncia la frase completa.";
  _lecturasGameRenderOrderPhraseUi(runtime);
  return true;
}

function _lecturasGameOrderTick(runtime = lecturasGameModeRuntime, nowMs = performance.now()) {
  if (!_lecturasGameIsOrderChallenge(runtime) || runtime?.round?.orderTrapActive === true) return;
  const voice = runtime?.orderVoice || (runtime.orderVoice = {});
  const resetAt = Number(voice.resetSamePhraseAt || 0);
  if (resetAt > 0 && nowMs >= resetAt && !voice.listening && !voice.starting) {
    voice.resetSamePhraseAt = 0;
    if (_lecturasGameApplyOrderStageWords(runtime)) {
      _lecturasGameQueueOrderSpeech(runtime);
      _lecturasGameSetMode(LECTURAS_GAME_MODE.PLAYING);
    }
    _lecturasGameRenderOrderPhraseUi(runtime);
    return;
  }
  if (voice.manualRetryRequired === true) {
    voice.nextAutoStartAt = 0;
  }
  const countdownUntilMs = Number(voice.countdownUntilMs || 0);
  const countdownStartAt = Number(voice.countdownStartAt || 0);
  if (countdownUntilMs > 0 && !voice.listening && !voice.starting) {
    if (nowMs >= countdownStartAt && nowMs < countdownUntilMs) {
      _lecturasGameRenderOrderPhraseUi(runtime);
    } else if (nowMs >= countdownUntilMs) {
      voice.countdownStartAt = 0;
      voice.countdownUntilMs = 0;
      _lecturasGameStartOrderReadFlow(runtime);
    }
  }
  const autoAt = Number(voice.nextAutoStartAt || 0);
  if (autoAt > 0 && nowMs >= autoAt && !voice.listening && !voice.starting) {
    voice.nextAutoStartAt = 0;
    if (voice.recoveryInFlight !== true) {
      _lecturasGameRenderOrderPhraseUi(runtime);
      return;
    }
    Promise.resolve(_lecturasGameStartOrderSpeech(runtime)).catch(() => false);
  }
  if (voice.state === LECTURAS_GAME_ORDER_VOICE_STATE.LISTENING && voice.listening === true) {
    const silenceDeadline = Number(voice.silenceDeadline || 0);
    const hasSpeech = voice.hasDetectedSpeech === true || String(voice.lastTranscriptAll || voice.lastTranscript || "").trim().length > 0;
    if (silenceDeadline > 0 && nowMs >= silenceDeadline && !hasSpeech) {
      _lecturasGameStopOrderSpeech(runtime, { restoreAudio: false });
      _lecturasGameSetOrderManualMicRetry(runtime, "silence_timeout", "No detecté voz. Toca \"Hablar ahora\" para reactivar el micrófono.");
      _lecturasGameSetOrderReadingAudioState(false, runtime);
      _lecturasGameSetGameMusicDucking(false, runtime);
      return;
    }
  }
  const phrase = _lecturasGameGetCurrentOrderPhrase(runtime);
  if (!phrase) return;
  const campaign = runtime.readingCampaign || (runtime.readingCampaign = {});
  if (voice.listening === true || voice.starting === true) {
    campaign.idleSinceMs = 0;
    return;
  }
  if (!campaign.idleSinceMs) {
    campaign.idleSinceMs = Number(nowMs || performance.now());
  }
  const idleRemaining = _lecturasGameGetOrderIdleRemainingMs(runtime, nowMs);
  if (idleRemaining <= 0) {
    runtime.progress.rewardMessage = "Perdiste por inactividad: no leíste la frase durante 5 minutos.";
    _lecturasGameHandleOrderLoseByReason("lost_by_idle", runtime);
  }
}

function _lecturasGameResetRuntimeRound(runtime = lecturasGameModeRuntime) {
  const now = Number(performance.now() || Date.now());
  _lecturasGameClearAllWordEntities(runtime);
  runtime.removedWrongCount = 0;
  const wrongBase = Number(runtime.round?.distractors?.length || 0);
  runtime.totalWrongCount = runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR ? (wrongBase * 2) : wrongBase;
  runtime.touchedCorrect = false;
  runtime.countdownMs = 3000;
  runtime.roundElapsedMs = 0;
  runtime.nextSpawnResetAt = 0;
  runtime.particles = [];
  runtime.firePickupFx = null;
  runtime.recentHits = new Map();
  runtime.powerup = null;
  runtime.powerupCollectedThisLevel = false;
  runtime.powerupSpawnAtMs = now + LECTURAS_GAME_POWERUP_SPAWN_DELAY_MS;
  runtime.fireModeActive = false;
  runtime.fireModeUntilMs = 0;
  runtime.fireModeType = LECTURAS_GAME_POWERUP_TYPES.FIRE;
  runtime.freezeUntilMs = 0;
  runtime.pacifistUntilMs = 0;
  runtime.chaosUntilMs = 0;
  runtime.bombReadyUntilMs = 0;
  runtime.bombActivatedAtMs = 0;
  runtime.bombChestHoldStartMs = 0;
  runtime.bombChargeNorm = 0;
  runtime.fireballs = [];
  runtime.lastThrowMs = 0;
  runtime.wristHistory = {};
  runtime.lastThrowVector = { x: 0, y: -1 };
  runtime.simFireQueued = false;
  runtime.simFireCharging = false;
  runtime.simFireChargeStartMs = 0;
  runtime.simFireReleasePending = false;
  runtime.completionType = "";
  runtime.isChampion = false;
  runtime.championName = "";
  _lecturasGameResetPairStates(runtime, now);
  _lecturasGameResetHands(runtime);
  if (_lecturasGameIsOrderChallenge(runtime)) {
    runtime.round.orderIndex = 0;
    _lecturasGameResetOrderCampaignState(runtime, { resetPerfect: true });
    _lecturasGameApplyOrderStageWords(runtime);
    return;
  }
  if (_lecturasGameIsTraceChallenge(runtime)) {
    _lecturasGameResetTraceProgress(runtime);
    return;
  }
  _lecturasGameCreateWordEntities(runtime);
}

function _lecturasGameGetSideByX(x = 0, runtime = lecturasGameModeRuntime) {
  const splitX = Math.max(1, Number(runtime.viewWidth || 960)) / 2;
  return Number(x || 0) < splitX ? "left" : "right";
}

function _lecturasGameGetPanelAnchorX(side = "left", runtime = lecturasGameModeRuntime) {
  const w = Math.max(1, Number(runtime.viewWidth || 960));
  return String(side) === "right" ? (w * 0.75) : (w * 0.25);
}

function _lecturasGameResetPairStates(runtime = lecturasGameModeRuntime, nowMs = performance.now()) {
  const now = Number(nowMs || performance.now());
  runtime.players = {
    left: _lecturasGameCreatePlayerSummary("left"),
    right: _lecturasGameCreatePlayerSummary("right")
  };
  runtime.pairSideState = {
    left: _lecturasGameCreatePairSideState("left", now),
    right: _lecturasGameCreatePairSideState("right", now)
  };
}

function _lecturasGameGetPairSideState(side = "left", runtime = lecturasGameModeRuntime) {
  const key = side === "right" ? "right" : "left";
  runtime.pairSideState = runtime.pairSideState || {};
  if (!runtime.pairSideState.left || !runtime.pairSideState.right) {
    _lecturasGameResetPairStates(runtime, performance.now());
  }
  return runtime.pairSideState[key];
}

function _lecturasGameGetSideStatus(side = "", runtime = lecturasGameModeRuntime) {
  if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR && side) {
    return _lecturasGameGetPairSideState(side, runtime);
  }
  return runtime;
}

function _lecturasGameIsPacifistActive(side = "", runtime = lecturasGameModeRuntime, nowMs = performance.now()) {
  const target = _lecturasGameGetSideStatus(side, runtime);
  return Number(target?.pacifistUntilMs || 0) > Number(nowMs || performance.now());
}

function _lecturasGameIsFreezeActive(side = "", runtime = lecturasGameModeRuntime, nowMs = performance.now()) {
  const target = _lecturasGameGetSideStatus(side, runtime);
  return Number(target?.freezeUntilMs || 0) > Number(nowMs || performance.now());
}

function _lecturasGameIsChaosActive(side = "", runtime = lecturasGameModeRuntime, nowMs = performance.now()) {
  const target = _lecturasGameGetSideStatus(side, runtime);
  return Number(target?.chaosUntilMs || 0) > Number(nowMs || performance.now());
}

function _lecturasGameIsFireModeActiveForSide(side = "", runtime = lecturasGameModeRuntime, nowMs = performance.now()) {
  const now = Number(nowMs || performance.now());
  if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR && side) {
    return Number(_lecturasGameGetPairSideState(side, runtime)?.fireModeUntilMs || 0) > now;
  }
  return runtime.fireModeActive === true && Number(runtime.fireModeUntilMs || 0) > now;
}

function _lecturasGameGetFireModeMsLeft(side = "", runtime = lecturasGameModeRuntime, nowMs = performance.now()) {
  const now = Number(nowMs || performance.now());
  if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR) {
    if (side) {
      return Math.max(0, Number(_lecturasGameGetPairSideState(side, runtime)?.fireModeUntilMs || 0) - now);
    }
    return Math.max(
      Math.max(0, Number(_lecturasGameGetPairSideState("left", runtime)?.fireModeUntilMs || 0) - now),
      Math.max(0, Number(_lecturasGameGetPairSideState("right", runtime)?.fireModeUntilMs || 0) - now)
    );
  }
  return Math.max(0, Number(runtime.fireModeUntilMs || 0) - now);
}

function _lecturasGameGetFireModeTypeForSide(side = "", runtime = lecturasGameModeRuntime, nowMs = performance.now()) {
  const now = Number(nowMs || performance.now());
  if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR && (side === "left" || side === "right")) {
    const state = _lecturasGameGetPairSideState(side, runtime);
    if (Number(state?.fireModeUntilMs || 0) <= now) return "";
    return String(state?.fireModeType || LECTURAS_GAME_POWERUP_TYPES.FIRE);
  }
  if (!runtime.fireModeActive || Number(runtime.fireModeUntilMs || 0) <= now) return "";
  return String(runtime.fireModeType || LECTURAS_GAME_POWERUP_TYPES.FIRE);
}

function _lecturasGameGetFireVisualPalette(type = LECTURAS_GAME_POWERUP_TYPES.FIRE) {
  const key = String(type || LECTURAS_GAME_POWERUP_TYPES.FIRE);
  if (key === LECTURAS_GAME_POWERUP_TYPES.ICE) {
    return {
      trailA: "rgba(186, 238, 255, __A__)",
      trailB: "rgba(88, 170, 255, __A__)",
      core0: "rgba(236, 250, 255, 0.99)",
      core1: "rgba(154, 221, 255, 0.94)",
      core2: "rgba(86, 162, 255, 0.72)",
      core3: "rgba(66, 132, 245, 0)",
      coreDot: "rgba(232, 250, 255, 0.98)",
      ring: "rgba(210,241,255,0.76)",
      aura0: "rgba(216, 246, 255, 0.76)",
      aura1: "rgba(112, 192, 255, 0.62)",
      aura2: "rgba(48, 126, 234, 0)",
      charge0: "rgba(236,251,255,0.9)",
      charge1: "rgba(148,223,255,0.7)",
      charge2: "rgba(70,150,240,0)",
      chargeCore0: "rgba(245,253,255,1)",
      chargeCore1: "rgba(178,230,255,0.98)",
      chargeCore2: "rgba(84,164,245,0.92)",
      spark: "rgba(224,247,255,0.94)"
    };
  }
  return {
    trailA: "rgba(255, 190, 84, __A__)",
    trailB: "rgba(255, 78, 22, __A__)",
    core0: "rgba(255, 255, 210, 0.98)",
    core1: "rgba(255, 210, 84, 0.92)",
    core2: "rgba(255, 96, 30, 0.74)",
    core3: "rgba(255, 48, 18, 0)",
    coreDot: "rgba(255, 244, 190, 0.96)",
    ring: "rgba(255,255,228,0.7)",
    aura0: "rgba(255, 247, 184, 0.85)",
    aura1: "rgba(255, 166, 62, 0.65)",
    aura2: "rgba(255, 78, 26, 0)",
    charge0: "rgba(255, 247, 184, 0.85)",
    charge1: "rgba(255, 166, 62, 0.65)",
    charge2: "rgba(255, 78, 26, 0)",
    chargeCore0: "rgba(255,255,234,1)",
    chargeCore1: "rgba(255,204,92,0.98)",
    chargeCore2: "rgba(255,88,32,0.92)",
    spark: "rgba(255, 246, 180, 0.9)"
  };
}

function _lecturasGameIsAnyFireModeActive(runtime = lecturasGameModeRuntime, nowMs = performance.now()) {
  return _lecturasGameGetFireModeMsLeft("", runtime, nowMs) > 0;
}

function _lecturasGameGetActivePowerups(runtime = lecturasGameModeRuntime) {
  if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR) {
    const out = [];
    LECTURAS_GAME_PAIR_SIDES.forEach((side) => {
      const sideState = _lecturasGameGetPairSideState(side, runtime);
      if (sideState?.powerup?.active) out.push(sideState.powerup);
    });
    return out;
  }
  return runtime.powerup?.active ? [runtime.powerup] : [];
}

function _lecturasGameWordSideBounds(side = "left", runtime = lecturasGameModeRuntime) {
  const w = Math.max(1, Number(runtime.viewWidth || 960));
  const pad = 12;
  if (String(side) === "right") {
    return { minX: (w / 2) + pad, maxX: w - pad };
  }
  return { minX: pad, maxX: (w / 2) - pad };
}

function _lecturasGameClampWordToSide(word = null, runtime = lecturasGameModeRuntime) {
  if (!word) return;
  const side = String(word.side || _lecturasGameGetSideByX(word.x, runtime));
  const b = _lecturasGameWordSideBounds(side, runtime);
  const maxX = Math.max(b.minX, b.maxX - Math.max(1, Number(word.width || 0)));
  word.x = Math.max(b.minX, Math.min(maxX, Number(word.x || 0)));
  word.side = side;
}

function _lecturasGameSyncPlayersSummary(runtime = lecturasGameModeRuntime) {
  const leftRemain = (runtime.words || []).filter((w) => w?.active && !w?.isCorrect && (w.side || _lecturasGameGetSideByX(w.x, runtime)) === "left").length;
  const rightRemain = (runtime.words || []).filter((w) => w?.active && !w?.isCorrect && (w.side || _lecturasGameGetSideByX(w.x, runtime)) === "right").length;
  const p = runtime.players || {};
  p.left = p.left || _lecturasGameCreatePlayerSummary("left");
  p.right = p.right || _lecturasGameCreatePlayerSummary("right");
  p.left.wrongRemaining = leftRemain;
  p.right.wrongRemaining = rightRemain;
  p.left.fireModeActive = _lecturasGameIsFireModeActiveForSide("left", runtime);
  p.right.fireModeActive = _lecturasGameIsFireModeActiveForSide("right", runtime);
  const activePowerups = _lecturasGameGetActivePowerups(runtime);
  p.left.powerupActive = activePowerups.some((powerup) => String(powerup?.side || _lecturasGameGetSideByX(powerup?.x, runtime)) === "left");
  p.right.powerupActive = activePowerups.some((powerup) => String(powerup?.side || _lecturasGameGetSideByX(powerup?.x, runtime)) === "right");
  const balls = Array.isArray(runtime.fireballs) ? runtime.fireballs : [];
  p.left.fireballsCount = balls.filter((b) => String(b?.side || "") === "left").length;
  p.right.fireballsCount = balls.filter((b) => String(b?.side || "") === "right").length;
  runtime.players = p;
}

function _lecturasGameGetJointsForSide(side = "", runtime = lecturasGameModeRuntime) {
  const joints = Array.isArray(runtime.pose?.joints) ? runtime.pose.joints : [];
  if (!side || runtime.selectedPlayMode !== LECTURAS_GAME_PLAY_MODE.PAIR) return joints;
  return joints.filter((joint) => {
    const tagged = String(joint?.playerSide || "");
    if (tagged === "left" || tagged === "right") return tagged === side;
    return _lecturasGameGetSideByX(joint?.x, runtime) === side;
  });
}

function _lecturasGameGetSegmentsForSide(side = "", runtime = lecturasGameModeRuntime) {
  const segments = Array.isArray(runtime.pose?.segments) ? runtime.pose.segments : [];
  if (!side || runtime.selectedPlayMode !== LECTURAS_GAME_PLAY_MODE.PAIR) return segments;
  return segments.filter((seg) => {
    const tagged = String(seg?.playerSide || "");
    if (tagged === "left" || tagged === "right") return tagged === side;
    return _lecturasGameGetSideByX(((Number(seg?.ax || 0) + Number(seg?.bx || 0)) / 2), runtime) === side;
  });
}

function _lecturasGameGetHandCollisionJoints(side = "", runtime = lecturasGameModeRuntime) {
  const renderPose = _lecturasGameBuildPoseRenderData(runtime);
  let joints = (renderPose.joints || []).filter((joint) => String(joint?.kind || "").toLowerCase().includes("hand"));
  if (!joints.length) {
    joints = (renderPose.joints || []).filter((joint) => String(joint?.kind || "").toLowerCase().includes("wrist"));
  }
  const trackedHands = _lecturasGameGetTrackedHandInteractionPoints(runtime);
  if (!joints.length && trackedHands.length) joints = trackedHands;
  if (!joints.length) return [];
  if (side && runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR) {
    joints = joints.filter((joint) => {
      const panel = String(joint?.panelSide || joint?.playerSide || "");
      if (panel === "left" || panel === "right") return panel === side;
      return _lecturasGameGetSideByX(joint?.x, runtime) === side;
    });
  }
  if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR) {
    if (side) {
      const best = _lecturasGameSelectVisualHandNode(side, joints, runtime);
      joints = best ? [best] : [];
    } else {
      const left = _lecturasGameSelectVisualHandNode("left", joints, runtime);
      const right = _lecturasGameSelectVisualHandNode("right", joints, runtime);
      joints = [left, right].filter(Boolean);
    }
  }
  const baseR = Math.max(6, Number(runtime.handInteractionRadiusPx || 10));
  return joints.map((joint) => ({
    x: Number(joint.x || 0),
    y: Number(joint.y || 0),
    r: Math.max(baseR * 0.88, Math.min(baseR + 3, Number(joint.r || 10) * 0.46)),
    kind: joint.kind,
    panelSide: joint?.panelSide,
    playerSide: joint?.playerSide
  }));
}

function _lecturasGameGetBodyCollisionJoints(side = "", runtime = lecturasGameModeRuntime) {
  const handJoints = _lecturasGameGetHandCollisionJoints(side, runtime);
  const renderPose = _lecturasGameBuildPoseRenderData(runtime);
  let headJoints = (renderPose.joints || []).filter((joint) => String(joint?.kind || "").toLowerCase().includes("head"));
  if (side && runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR) {
    headJoints = headJoints.filter((joint) => {
      const panel = String(joint?.panelSide || joint?.playerSide || "");
      if (panel === "left" || panel === "right") return panel === side;
      return _lecturasGameGetSideByX(joint?.x, runtime) === side;
    });
  }
  const heads = headJoints.map((joint) => ({
    x: Number(joint.x || 0),
    y: Number(joint.y || 0),
    r: Math.max(8, Number(joint.r || 14) * 0.56),
    kind: joint.kind,
    panelSide: joint?.panelSide,
    playerSide: joint?.playerSide
  }));
  return [...handJoints, ...heads];
}

function _lecturasGameApplyGemMilestones(runtime = lecturasGameModeRuntime) {
  const progress = runtime.progress || {};
  let next = Math.max(LECTURAS_GAME_GEMS_PER_SCORE, Number(progress.nextGemScoreMilestone || LECTURAS_GAME_GEMS_PER_SCORE));
  let gemsEarned = 0;
  while (Number(progress.score || 0) >= next) {
    progress.gems = Math.max(0, Number(progress.gems || 0) + LECTURAS_GAME_GEMS_PER_SCORE_AMOUNT);
    next += LECTURAS_GAME_GEMS_PER_SCORE;
    gemsEarned += LECTURAS_GAME_GEMS_PER_SCORE_AMOUNT;
  }
  progress.nextGemScoreMilestone = next;
  if (gemsEarned > 0) {
    progress.rewardMessage = `Ganaste ${gemsEarned} gema${gemsEarned > 1 ? "s" : ""}.`;
  }
}

function _lecturasGameApplyScoreDelta(delta = 0, runtime = lecturasGameModeRuntime, side = "") {
  const diff = Number(delta || 0);
  if (!diff) return;
  if (_lecturasGameIsPacifistActive(side, runtime, performance.now())) return;
  const progress = runtime.progress || {};
  progress.score = Math.max(-100, Number(progress.score || 0) + diff);
  progress.sideScores = progress.sideScores || { left: 0, right: 0 };
  if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR && (side === "left" || side === "right")) {
    progress.sideScores[side] = Math.max(-100, Number(progress.sideScores[side] || 0) + diff);
  }
  _lecturasGameApplyGemMilestones(runtime);
}

function _lecturasGameGrantLevelReward(runtime = lecturasGameModeRuntime) {
  const progress = runtime.progress || {};
  const completedLevel = Math.max(1, Number(progress.level || 1));
  progress.level = completedLevel + 1;
  progress.gems = Math.max(0, Number(progress.gems || 0) + LECTURAS_GAME_LEVEL_CLEAR_GEMS);
  progress.rewardMessage = `Nivel superado. +${LECTURAS_GAME_LEVEL_CLEAR_GEMS} gemas.`;
}

function _lecturasGamePrepareChallenge(runtime = lecturasGameModeRuntime, type = LECTURAS_GAME_IDS.SYNONYMS) {
  const forcedGameId = resolveForcedGameId(runtime?.forcedGameId || "");
  const challengeType = forcedGameId || _lecturasGameNormalizeGameId(type || runtime?.selectedGameId || runtime?.challengeType || "");
  runtime.challengeType = challengeType;
  runtime.activeServiceId = challengeType;
  runtime.poseDetectIntervalMs = challengeType === LECTURAS_GAME_IDS.TRACE ? 14 : 8;
  runtime.handDetectIntervalMs = challengeType === LECTURAS_GAME_IDS.TRACE ? 10 : 8;
  _lecturasGameStopGameMusic(runtime, "prepare-challenge");
  const forceTransition = runtime.forceNextBackgroundTransition === true;
  runtime.forceNextBackgroundTransition = false;
  _lecturasGamePickGameBackground(runtime, { forceTransition });
  const service = resolveLecturasGameService(challengeType, lecturasGameServiceRegistry);
  console.log("[DEBUG] _lecturasGamePrepareChallenge service:", service?.id, "challengeType:", challengeType);
  runtime.round = service?.buildRound?.(runtime.lectura, runtime) || null;
  console.log("[DEBUG] _lecturasGamePrepareChallenge round:", !!runtime.round);
  if (!runtime.round && challengeType !== LECTURAS_GAME_IDS.MINEBLOX) return false;
  if (!runtime.round && challengeType === LECTURAS_GAME_IDS.MINEBLOX) {
    runtime.round = { isDummy: true };
  }
  _lecturasGameResetRuntimeRound(runtime);
  return true;
}

function _lecturasGameMeasureWordWidth(runtime = lecturasGameModeRuntime, text = "") {
  const ctx = runtime.ctx;
  const minBubble = Math.max(180, runtime.viewWidth * 0.18);
  const maxBubble = Math.max(minBubble + 20, runtime.viewWidth * 0.9);
  if (!ctx) return Math.max(minBubble, Math.min(maxBubble, String(text || "").length * 30 + 180));
  ctx.save();
  const fontSize = Math.max(62, Math.min(118, Math.round(runtime.viewWidth * 0.114)));
  ctx.font = `400 ${fontSize}px "Ballooning", "Nunito", sans-serif`;
  const metrics = ctx.measureText(String(text || ""));
  ctx.restore();
  return Math.max(minBubble, Math.min(maxBubble, Math.ceil(metrics.width + (fontSize * 0.92))));
}

function _lecturasGameClearAllWordEntities(runtime = lecturasGameModeRuntime) {
  (runtime.words || []).forEach((word) => _lecturasGameRemoveBalloonMesh(word, runtime));
  if (runtime?.three?.ready && runtime?.three?.scene) {
    const staleGroups = [];
    runtime.three.scene.traverse?.((obj) => {
      if (!obj?.userData?.wordId) return;
      staleGroups.push(obj);
    });
    staleGroups.forEach((group) => {
      try {
        runtime.three.scene.remove(group);
        group.traverse?.((obj) => {
          obj.geometry?.dispose?.();
          const mat = obj.material;
          if (Array.isArray(mat)) mat.forEach((m) => m?.dispose?.());
          else mat?.dispose?.();
          const map = mat?.map;
          map?.dispose?.();
        });
      } catch (_) {
        // noop
      }
    });
  }
  runtime.words = [];
}

function _lecturasGameCreateWordEntities(runtime = lecturasGameModeRuntime) {
  const sourceWords = Array.isArray(runtime.round?.words) ? runtime.round.words : [];
  if (!sourceWords.length) return;
  _lecturasGameClearAllWordEntities(runtime);
  const entityDefs = runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR
    ? sourceWords.flatMap((text) => ([{ text, side: "left" }, { text, side: "right" }]))
    : sourceWords.map((text) => ({ text, side: "" }));
  const measuredWords = entityDefs.map((entry) => ({
    text: entry.text,
    side: entry.side,
    width: _lecturasGameMeasureWordWidth(runtime, entry.text)
  }));
  const maxWidth = measuredWords.reduce((acc, item) => Math.max(acc, Number(item.width || 0)), 0);
  const laneFit = Math.max(1, Math.floor((runtime.viewWidth - 22) / Math.max(1, maxWidth + 28)));
  const laneCount = Math.max(1, Math.min(entityDefs.length, 3, laneFit));
  const laneWidth = runtime.viewWidth / laneCount;
  const level = Math.max(1, Number(runtime.progress?.level || 1));
  const speedFactor = 0.78 + (Math.max(0, level - 1) * 0.08);
  runtime.words = _lecturasGameShuffle(measuredWords).map((item, idx) => {
    const text = String(item?.text || "");
    const lane = idx % laneCount;
    const width = Math.max(160, Number(item?.width || _lecturasGameMeasureWordWidth(runtime, text)));
    const height = Math.max(104, Math.round(width * 0.3));
    const hitWidth = Math.max(56, Math.min(width * 0.48, width - 52));
    const hitHeight = Math.max(38, Math.min(height * 0.52, height - 24));
    const minX = lane * laneWidth + 14;
    const maxX = Math.max(minX + 2, (lane + 1) * laneWidth - width - 14);
    const x = minX + Math.random() * Math.max(2, maxX - minX);
    const isCorrect = _lecturasGameNormalizeWord(text) === _lecturasGameNormalizeWord(runtime.round?.correctSynonym || "");
    const entity = {
      id: `lgw_${idx}_${Date.now()}`,
      text,
      isCorrect,
      x,
      y: -80 - (idx * 90) - Math.random() * 180,
      width,
      height,
      hitWidth,
      hitHeight,
      vy: (56 + Math.random() * 40) * speedFactor,
      side: runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR ? String(item?.side || (idx % 2 === 0 ? "left" : "right")) : "",
      active: true
    };
    if (_lecturasGameIsOrderChallenge(runtime) && runtime?.round?.orderTrapActive === true && isCorrect) {
      const bounds = runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR
        ? _lecturasGameWordSideBounds(String(entity.side || "left"), runtime)
        : { minX: 10, maxX: Math.max(20, runtime.viewWidth - 10) };
      const maxXRight = Math.max(bounds.minX, bounds.maxX - width - 10);
      entity.x = maxXRight;
      entity.zigzag = {
        enabled: true,
        elapsed: 0,
        baseX: maxXRight,
        driftSpeed: 88 + (Math.random() * 72),
        ampLong: 120 + (Math.random() * 180),
        ampShort: 10 + (Math.random() * 42),
        freqLong: 0.28 + (Math.random() * 0.48),
        freqShort: 2.4 + (Math.random() * 3.4),
        kickAmp: 12 + (Math.random() * 56),
        kickFreq: 3.5 + (Math.random() * 5.2),
        phaseLong: Math.random() * Math.PI * 2,
        phaseShort: Math.random() * Math.PI * 2,
        phaseKick: Math.random() * Math.PI * 2
      };
    }
    if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR) {
      _lecturasGameClampWordToSide(entity, runtime);
    }
    return entity;
  });
  _lecturasGameSyncPlayersSummary(runtime);
}

function _lecturasGameNextPow2(value = 0) {
  let n = 1;
  const target = Math.max(1, Math.floor(Number(value || 1)));
  while (n < target) n *= 2;
  return n;
}

function _lecturasGameMeasureBallooningTextWidth(text = "", fontSize = 64) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return Math.max(1, String(text || "").length * fontSize * 0.6);
  ctx.font = `400 ${Math.max(12, Number(fontSize || 64))}px "Ballooning", "Nunito", sans-serif`;
  return Math.ceil(ctx.measureText(String(text || "")).width);
}

function _lecturasGameRenderPowTimerUi(runtime = lecturasGameModeRuntime, nowMs = performance.now()) {
  const ui = runtime?.ui || {};
  const isOrderReading = _lecturasGameIsOrderReadingPhase(runtime);
  const renderTimer = (side = "", wrapEl = null, textEl = null, fillEl = null) => {
    if (!wrapEl || !textEl || !fillEl) return;
    const sideState = side ? _lecturasGameGetPairSideState(side, runtime) : runtime;
    const collectibleActive = side ? !!sideState?.powerup?.active : !!runtime?.powerup?.active;
    const spawnAt = Number(side ? sideState?.powerupSpawnAtMs || 0 : runtime?.powerupSpawnAtMs || 0);
    const cooldownMs = Math.max(0, spawnAt - Number(nowMs || performance.now()));
    const cooldownRatio = Math.max(0, Math.min(1, 1 - (cooldownMs / Math.max(1, LECTURAS_GAME_POWERUP_SPAWN_DELAY_MS))));
    const modeType = _lecturasGameGetFireModeTypeForSide(side, runtime, nowMs);
    const msLeft = _lecturasGameGetFireModeMsLeft(side, runtime, nowMs);
    const active = !!modeType && msLeft > 0;
    wrapEl.hidden = false;
    if (active) {
      const label = LECTURAS_GAME_POWERUP_LABELS[modeType] || String(modeType || "Pow");
      const secs = Math.max(0, Math.ceil(msLeft / 1000));
      const ratio = Math.max(0, Math.min(1, msLeft / Math.max(1, LECTURAS_GAME_FIRE_MODE_MS)));
      const endingSoon = secs <= 3;
      textEl.textContent = `${label} ${secs}s${endingSoon ? " (se acaba)" : ""}${isOrderReading ? " (pausa)" : ""}`;
      fillEl.style.width = `${Math.round(ratio * 100)}%`;
      wrapEl.style.setProperty("--pow-accent", endingSoon ? "#ff8a7a" : (modeType === LECTURAS_GAME_POWERUP_TYPES.ICE ? "#8edfff" : "#ffd57a"));
      return;
    }
    if (collectibleActive) {
      textEl.textContent = "Recarga completa";
      fillEl.style.width = "100%";
      wrapEl.style.setProperty("--pow-accent", "#8cffbe");
      return;
    }
    if (cooldownMs > 0) {
      const secs = Math.max(0, Math.ceil(cooldownMs / 1000));
      textEl.textContent = `Recarga ${secs}s${isOrderReading ? " (pausa)" : ""}`;
      fillEl.style.width = `${Math.round(cooldownRatio * 100)}%`;
      wrapEl.style.setProperty("--pow-accent", "#89a5ff");
      return;
    }
    textEl.textContent = "Recarga completa";
    fillEl.style.width = "100%";
    wrapEl.style.setProperty("--pow-accent", "#8cffbe");
  };
  const isPair = runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR;
  renderTimer("", ui.powTimerSolo, ui.powTimerTextSolo, ui.powTimerFillSolo);
  renderTimer("left", ui.powTimerLeft, ui.powTimerTextLeft, ui.powTimerFillLeft);
  renderTimer("right", ui.powTimerRight, ui.powTimerTextRight, ui.powTimerFillRight);
  if (ui.powTimerSolo) ui.powTimerSolo.hidden = isPair || ui.powTimerSolo.hidden;
  if (ui.powTimerLeft) ui.powTimerLeft.hidden = !isPair || ui.powTimerLeft.hidden;
  if (ui.powTimerRight) ui.powTimerRight.hidden = !isPair || ui.powTimerRight.hidden;
}

function _lecturasGameSetMode(mode = LECTURAS_GAME_MODE.CLOSED) {
  const runtime = lecturasGameModeRuntime;
  runtime.mode = mode;
  const ui = runtime.ui || {};
  const setHidden = (el, hidden) => {
    if (!el) return;
    el.hidden = !!hidden;
  };

  const remaining = Math.max(0, Number(runtime.totalWrongCount || 0) - Number(runtime.removedWrongCount || 0));
  const progress = runtime.progress || {};
  const levelNumber = Math.max(1, Number(progress.level || 1));
  const isPair = runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR;
  const isOrderMode = _lecturasGameIsOrderChallenge(runtime);
  const isTraceMode = _lecturasGameIsTraceChallenge(runtime);
  if (ui.stageEl) ui.stageEl.classList.toggle("is-pair-mode", isPair);
  if (ui.stageTopSoloEl) ui.stageTopSoloEl.hidden = isPair;
  if (ui.stageTopPairWrapEl) ui.stageTopPairWrapEl.hidden = !isPair;
  if (ui.targetWord) ui.targetWord.textContent = runtime.round?.targetWord || "PALABRA";
  if (ui.pairTargetWordLeft) ui.pairTargetWordLeft.textContent = runtime.round?.targetWord || "PALABRA";
  if (ui.pairTargetWordRight) ui.pairTargetWordRight.textContent = runtime.round?.targetWord || "PALABRA";
  if (ui.wrongRemain) ui.wrongRemain.textContent = `Incorrectas restantes: ${remaining}`;
  if (ui.pairWrongRemainLeft) {
    const leftRemain = (runtime.words || []).filter((w) => w?.active && !w?.isCorrect && String(w.side || _lecturasGameGetSideByX(w.x, runtime)) === "left").length;
    ui.pairWrongRemainLeft.textContent = `Incorrectas restantes: ${leftRemain}`;
  }
  if (ui.pairWrongRemainRight) {
    const rightRemain = (runtime.words || []).filter((w) => w?.active && !w?.isCorrect && String(w.side || _lecturasGameGetSideByX(w.x, runtime)) === "right").length;
    ui.pairWrongRemainRight.textContent = `Incorrectas restantes: ${rightRemain}`;
  }
  if (ui.levelBadge) {
    ui.levelBadge.innerHTML = `<span class="lecturas-game-level-label">Nivel</span><strong class="lecturas-game-level-value">${levelNumber}</strong>`;
  }
  if (ui.pairLevelBadgeLeft) {
    ui.pairLevelBadgeLeft.innerHTML = `<span class="lecturas-game-level-label">Nivel</span><strong class="lecturas-game-level-value">${levelNumber}</strong>`;
  }
  if (ui.pairLevelBadgeRight) {
    ui.pairLevelBadgeRight.innerHTML = `<span class="lecturas-game-level-label">Nivel</span><strong class="lecturas-game-level-value">${levelNumber}</strong>`;
  }
  if (ui.scoreBadge) ui.scoreBadge.textContent = `Puntos: ${Math.round(Number(progress.score || 0))}`;
  if (ui.pairScoreBadgeLeft) ui.pairScoreBadgeLeft.textContent = `Puntos: ${Math.round(Number(progress?.sideScores?.left || 0))}`;
  if (ui.pairScoreBadgeRight) ui.pairScoreBadgeRight.textContent = `Puntos: ${Math.round(Number(progress?.sideScores?.right || 0))}`;
  const remainSec = Math.max(0, Math.ceil((Number(runtime.roundTimeLimitMs || 0) - Number(runtime.roundElapsedMs || 0)) / 1000));
  const orderCampaign = runtime.readingCampaign || {};
  const orderTotal = Math.max(0, Number(orderCampaign.totalReadingUnits || 0));
  const orderCompleted = Math.max(0, Number(orderCampaign.readingCursor || 0));
  const orderCurrent = Math.min(Math.max(1, orderCompleted + 1), Math.max(1, orderTotal || 1));
  const orderTimerText = (mode === LECTURAS_GAME_MODE.PLAYING && isOrderMode && runtime?.round?.orderTrapActive !== true)
    ? `Inactividad: ${Math.max(0, Math.ceil(_lecturasGameGetOrderIdleRemainingMs(runtime, performance.now()) / 1000))}s`
    : `Lectura: ${Math.min(orderCompleted, orderTotal)}/${Math.max(1, orderTotal || 1)}`;
  const orderDemoPending = runtime?.orderDemo?.awaitingPlayback === true || runtime?.orderDemo?.playing === true;
  if (ui.timerBadge) ui.timerBadge.textContent = isOrderMode ? orderTimerText : `Tiempo: ${remainSec}s`;
  if (ui.pairTimerBadgeLeft) ui.pairTimerBadgeLeft.textContent = isOrderMode ? orderTimerText : `Tiempo: ${remainSec}s`;
  if (ui.pairTimerBadgeRight) ui.pairTimerBadgeRight.textContent = isOrderMode ? orderTimerText : `Tiempo: ${remainSec}s`;
  if (ui.aliasBadgeSolo) {
    const aliasSolo = String(runtime?.playerAccounts?.solo?.alias || runtime?.playerAccounts?.solo?.displayName || runtime?.playerAccounts?.solo?.username || "Invitado");
    ui.aliasBadgeSolo.textContent = `Alias: ${aliasSolo}`;
  }
  if (ui.pairAliasLeft) {
    const aliasLeft = String(runtime?.playerAccounts?.left?.alias || runtime?.playerAccounts?.left?.displayName || runtime?.playerAccounts?.left?.username || "Jugador A");
    ui.pairAliasLeft.textContent = `Alias: ${aliasLeft}`;
  }
  if (ui.pairAliasRight) {
    const aliasRight = String(runtime?.playerAccounts?.right?.alias || runtime?.playerAccounts?.right?.displayName || runtime?.playerAccounts?.right?.username || "Jugador B");
    ui.pairAliasRight.textContent = `Alias: ${aliasRight}`;
  }
  if (ui.gemsBadge) ui.gemsBadge.textContent = `Gemas: ${Math.round(Number(progress.gems || 0))}`;
  if (ui.rankBadge) {
    if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR) {
      const lName = String(runtime?.playerAccounts?.left?.alias || runtime?.playerAccounts?.left?.displayName || runtime?.playerAccounts?.left?.username || "Jugador A");
      const rName = String(runtime?.playerAccounts?.right?.alias || runtime?.playerAccounts?.right?.displayName || runtime?.playerAccounts?.right?.username || "Jugador B");
      ui.rankBadge.textContent = `${lName} vs ${rName}`;
    } else {
      const name = String(runtime?.playerAccounts?.solo?.alias || runtime?.playerAccounts?.solo?.displayName || runtime?.playerAccounts?.solo?.username || "Invitado");
      ui.rankBadge.textContent = `Jugador: ${name}`;
    }
  }
  if (ui.pairLeftBadge) {
    ui.pairLeftBadge.hidden = runtime.selectedPlayMode !== LECTURAS_GAME_PLAY_MODE.PAIR;
    ui.pairLeftBadge.textContent = `Izquierda: ${Math.round(Number(progress?.sideScores?.left || 0))}`;
  }
  if (ui.pairRightBadge) {
    ui.pairRightBadge.hidden = runtime.selectedPlayMode !== LECTURAS_GAME_PLAY_MODE.PAIR;
    ui.pairRightBadge.textContent = `Derecha: ${Math.round(Number(progress?.sideScores?.right || 0))}`;
  }

  if (ui.overlayTitle && ui.overlayText) {
    const gameTitle = _lecturasGameGetGameTitle(runtime?.challengeType || runtime?.selectedGameId || "");
    if (mode === LECTURAS_GAME_MODE.GAME_SELECT) {
      ui.overlayTitle.textContent = "Selecciona un juego";
      ui.overlayText.textContent = "Elige una dinámica para comenzar.";
    } else if (mode === LECTURAS_GAME_MODE.MODE_SELECT) {
      ui.overlayTitle.textContent = "Elige modo";
      ui.overlayText.textContent = `Modo actual: ${runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR ? "Pareja" : "Solo"}${isOrderMode ? ` | Dificultad: ${_lecturasGameGetOrderDifficultyLabel(runtime)}` : ""}.`;
    } else if (mode === LECTURAS_GAME_MODE.INSTRUCTION) {
      ui.overlayTitle.textContent = gameTitle;
      ui.overlayText.textContent = runtime.cameraReady
        ? (isTraceMode
          ? `Cierra el puño de cualquiera de tus manos para pintar "${runtime.round?.targetWord || ""}". Al abrirla, se pausa el trazo.`
          : (isOrderMode
          ? `Lee desde el inicio hasta terminar toda la lectura. Dificultad: ${_lecturasGameGetOrderDifficultyLabel(runtime)}. Progreso: párrafo ${orderCurrent} de ${Math.max(1, orderTotal || 1)}.`
            : (_lecturasGameIsMinebloxChallenge(runtime)
              ? `Bienvenido a ASCraft. En móvil toca y arrastra sobre la pantalla para mirar; en PC usa WASD y mouse.`
              : `Elimina incorrectas y protege "${runtime.round?.correctSynonym || ""}" de tus manos y de tus bolas de fuego.`)))
        : (isOrderMode
          ? "Lee la frase. La cámara se activará cuando comience la lluvia de palabras."
          : (_lecturasGameIsMinebloxChallenge(runtime)
            ? "Carga completa. ¡Prepárate para entrar al salón digital de ASCraft!"
            : "Activa la cámara para empezar."));
      if (runtime.useSimulatedPose) {
        ui.overlayText.textContent = isTraceMode
          ? "Modo simulación activo. Usa flechas/WASD para mover el esqueleto y trazar la letra."
          : `Modo simulación activo. Usa flechas/WASD para mover y espacio para lanzar fuego cuando actives el powerup.`;
      }
    } else if (mode === LECTURAS_GAME_MODE.COUNTDOWN) {
      if (isOrderMode && runtime?.orderVoice) runtime.orderVoice.state = LECTURAS_GAME_ORDER_VOICE_STATE.COUNTDOWN;
      ui.overlayTitle.textContent = String(Math.max(1, Math.ceil(runtime.countdownMs / 1000)));
      ui.overlayText.textContent = isTraceMode
        ? `Prepárate para trazar "${runtime.round?.targetWord || ""}".`
        : (isOrderMode
          ? "Prepárate para leer en voz alta."
          : (_lecturasGameIsMinebloxChallenge(runtime)
            ? "Entrando al terreno digital..."
            : `Sinónimo de "${runtime.round?.targetWord || ""}": protege "${runtime.round?.correctSynonym || ""}".`));
    } else if (mode === LECTURAS_GAME_MODE.PLAYING) {
      ui.overlayTitle.textContent = gameTitle;
      const fireRemain = Math.max(0, Math.ceil(_lecturasGameGetFireModeMsLeft("", runtime, performance.now()) / 1000));
      const fireType = _lecturasGameGetFireModeTypeForSide("", runtime, performance.now()) || LECTURAS_GAME_POWERUP_TYPES.FIRE;
      const fireLabel = LECTURAS_GAME_POWERUP_LABELS[fireType] || LECTURAS_GAME_POWERUP_WORD;
      const pacifist = _lecturasGameIsPacifistActive("", runtime, performance.now());
      const trapActive = runtime?.round?.orderTrapActive === true;
      const countdownLeft = _lecturasGameGetOrderCountdownRemaining(runtime, performance.now());
      if (isOrderMode && countdownLeft > 0 && !trapActive) {
        ui.overlayTitle.textContent = String(countdownLeft);
      }
      ui.overlayText.textContent = isTraceMode
        ? "Cierra el puño para pintar con esa mano; al abrirla dejas de pintar."
        : (pacifist
          ? "Modo Skip activo: no puedes romper palabras ni sumar puntos."
          : (_lecturasGameIsAnyFireModeActive(runtime, performance.now())
            ? (isOrderMode
              ? (trapActive
                ? `Modo ${fireLabel} ${fireRemain}s: destruye la palabra voladora "${runtime.round?.correctSynonym || ""}".`
                : `Modo ${fireLabel} ${fireRemain}s: puedes defenderte mientras lees.`)
            : (_lecturasGameIsMinebloxChallenge(runtime)
              ? "En móvil toca y arrastra sobre la pantalla para mirar; en PC usa WASD y mouse. Haz click para entrar al salón."
              : `Modo ${fireLabel} ${fireRemain}s: lanza bolas y no golpees "${runtime.round?.correctSynonym || ""}".`))
            : (_lecturasGameIsMinebloxChallenge(runtime)
              ? "Explora el salón digital. En móvil toca y arrastra sobre la pantalla para mirar; en PC usa WASD y mouse."
              : (isOrderMode
                ? (trapActive
                  ? `Atrapa "${runtime.round?.correctSynonym || ""}" para continuar.`
                  : (countdownLeft > 0
                    ? "Cuenta regresiva para hablar."
                    : (orderDemoPending
                      ? "Escucha primero la demostración en el panel izquierdo."
                      : `Habla ahora. Dificultad: ${_lecturasGameGetOrderDifficultyLabel(runtime)}. Párrafo ${orderCurrent}/${Math.max(1, orderTotal || 1)}. Errores seguidos: ${Math.max(0, Number(orderCampaign.consecutivePronunciationErrors || 0))}/${LECTURAS_GAME_ORDER_MAX_CONSECUTIVE_ERRORS}.`)))
                : `Elimina incorrectas y deja "${runtime.round?.correctSynonym || ""}" intacta.`))));
    } else if (mode === LECTURAS_GAME_MODE.QUIZ) {
      ui.overlayTitle.textContent = runtime.quiz?.question || "Pregunta de nivel";
      ui.overlayText.textContent = isOrderMode
        ? "Checkpoint de lectura: responde bien para ganar 1 gema."
        : "Golpea la opción correcta con la mano para continuar.";
    } else if (mode === LECTURAS_GAME_MODE.WON) {
      ui.overlayTitle.textContent = runtime.isChampion ? "¡Campeón!" : "¡Lectura completada!";
      ui.overlayText.textContent = runtime.progress?.rewardMessage || "Buen trabajo.";
    } else if (mode === LECTURAS_GAME_MODE.LOST) {
      ui.overlayTitle.textContent = "¡Ups!";
      ui.overlayText.textContent = runtime.progress?.rewardMessage
        || (runtime.touchedCorrect
          ? `Tocaste "${runtime.round?.correctSynonym || ""}".`
          : "Partida terminada. Inténtalo de nuevo.");
    } else if (mode === LECTURAS_GAME_MODE.RESUME_READING) {
      ui.overlayTitle.textContent = "Listo";
      ui.overlayText.textContent = "Reanudando lectura...";
    }
  }

  if (mode === LECTURAS_GAME_MODE.PLAYING && _lecturasGameIsMinebloxChallenge(runtime)) {
    if (typeof window._lecturasGameInitMineblox === "function") {
      window._lecturasGameInitMineblox();
    }
    // Hide core overlay during 3D gameplay to let HUD take over
    setHidden(ui.overlay, true);
  } else if (_lecturasGameIsMinebloxChallenge(runtime)) {
    // Ensure overlay is shown for other states (Lost, Won, Instruction)
    setHidden(ui.overlay, false);
    if (mode === LECTURAS_GAME_MODE.LOST) {
      ui.overlayText.textContent = runtime.progress?.rewardMessage || "Saliendo del salón digital. Inténtalo de nuevo.";
    }
  }

  // Canvas visibility: Hide 2D canvas completely for ASCraft in all states so 3D is visible
  if (_lecturasGameIsMinebloxChallenge(runtime)) {
    if (runtime.canvasEl) runtime.canvasEl.style.display = "none";
  } else if (runtime.canvasEl) {
    runtime.canvasEl.style.display = ""; 
  }

  if (ui.nextBtn) {
    ui.nextBtn.textContent = "Siguiente nivel";
  }
  setHidden(ui.startBtn, mode !== LECTURAS_GAME_MODE.INSTRUCTION || isOrderMode);
  if (ui.startBtn) {
    ui.startBtn.disabled = isOrderMode && runtime?.orderDemo?.playing === true;
  }
  setHidden(ui.retryBtn, mode !== LECTURAS_GAME_MODE.LOST);
  setHidden(ui.nextBtn, true);
  setHidden(ui.micBtn, !(mode === LECTURAS_GAME_MODE.PLAYING && isOrderMode && runtime?.round?.orderTrapActive !== true));
  setHidden(ui.quizOptionABtn, mode !== LECTURAS_GAME_MODE.QUIZ);
  setHidden(ui.quizOptionBBtn, mode !== LECTURAS_GAME_MODE.QUIZ);
  setHidden(ui.quizSkipBtn, mode !== LECTURAS_GAME_MODE.QUIZ || isOrderMode);
  const canResumeOrderPhrase = isOrderMode
    && mode === LECTURAS_GAME_MODE.LOST
    && String(runtime?.completionType || "") === "lost_by_errors";
  setHidden(ui.continueBtn, !canResumeOrderPhrase);
  setHidden(ui.finalizeBtn, !(mode === LECTURAS_GAME_MODE.WON || mode === LECTURAS_GAME_MODE.LOST));
  if (ui.continueBtn) {
    ui.continueBtn.textContent = `Continuar partida (-${LECTURAS_GAME_CONTINUE_PARTIDA_GEMS_COST} gema)`;
  }
  setHidden(
    ui.traceResetBtn,
    !isTraceMode || !(
      mode === LECTURAS_GAME_MODE.INSTRUCTION
      || mode === LECTURAS_GAME_MODE.COUNTDOWN
      || mode === LECTURAS_GAME_MODE.PLAYING
    )
  );
  if (mode === LECTURAS_GAME_MODE.QUIZ) {
    const a = runtime.quiz?.options?.[0] || "Opción A";
    const b = runtime.quiz?.options?.[1] || "Opción B";
    if (ui.quizOptionABtn) ui.quizOptionABtn.textContent = a;
    if (ui.quizOptionBBtn) ui.quizOptionBBtn.textContent = b;
    if (ui.quizSkipBtn) {
      const canSkip = Number(progress.gems || 0) >= LECTURAS_GAME_SKIP_QUIZ_GEMS_COST;
      ui.quizSkipBtn.disabled = !canSkip;
      ui.quizSkipBtn.textContent = `Saltar pregunta (-${LECTURAS_GAME_SKIP_QUIZ_GEMS_COST} gemas)`;
    }
  }
  if (!isOrderMode || mode !== LECTURAS_GAME_MODE.PLAYING) {
    _lecturasGameStopOrderSpeech(runtime);
  }
  _lecturasGameRenderOrderPhraseUi(runtime);
  _lecturasGameRenderOrderDemoPanel(runtime);
  _lecturasGameRenderPowTimerUi(runtime, performance.now());
  _lecturasGameSyncStageFxClasses(runtime);
}

function _lecturasGameSyncStageFxClasses(runtime = lecturasGameModeRuntime) {
  const stageEl = runtime?.ui?.stageEl;
  if (!stageEl) return;
  const isFireMode = _lecturasGameIsAnyFireModeActive(runtime, performance.now());
  const isCharging = ["left", "right"].some((handKey) => {
    const hand = runtime?.hands?.[handKey];
    return !!hand?.closed && Number(hand?.chargeNorm || 0) > 0.01;
  });
  const now = performance.now();
  const hasPacifist = _lecturasGameIsPacifistActive("", runtime, now)
    || (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR && (LECTURAS_GAME_PAIR_SIDES.some((side) => _lecturasGameIsPacifistActive(side, runtime, now))));
  const hasChaos = _lecturasGameIsChaosActive("", runtime, now)
    || (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR && (LECTURAS_GAME_PAIR_SIDES.some((side) => _lecturasGameIsChaosActive(side, runtime, now))));
  const orderFocus = _lecturasGameIsOrderFocusActive(runtime, now);
  stageEl.classList.toggle("is-fire-mode", isFireMode);
  stageEl.classList.toggle("is-charging", isCharging);
  stageEl.classList.toggle("is-pacifist-mode", hasPacifist);
  stageEl.classList.toggle("is-chaos-mode", hasChaos);
  stageEl.classList.toggle("is-pair-mode", runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR);
  stageEl.classList.toggle("is-order-focus", orderFocus);
}

function _lecturasGameBuildShellHtml(lectura = null, round = null, runtime = lecturasGameModeRuntime) {
  const targetWord = escapeHtml(round?.targetWord || "PALABRA");
  const isOrderShell = _lecturasGameIsOrderChallenge(runtime);
  const orderCover = escapeHtml(String(resolveLecturaCoverImage(lectura) || ""));
  const orderPhraseText = escapeHtml(String(_lecturasGameGetCurrentOrderPhrase(runtime)?.text || ""));
  return `
    <div class="lecturas-game-shell${isOrderShell ? " is-order-split-shell" : ""}">
      ${isOrderShell ? `
      <aside id="lecturasGameOrderDemoPanel" class="lecturas-game-order-demo-panel">
        <div class="lecturas-game-order-demo-card">
          <div class="lecturas-game-order-demo-media${orderCover ? "" : " is-empty"}" id="lecturasGameOrderDemoMedia" style="${orderCover ? `background-image:url('${orderCover}')` : ""}">
            <div class="lecturas-game-order-demo-scrim"></div>
            <div id="lecturasGameOrderDemoMediaState" class="lecturas-game-order-demo-media-state">${orderCover ? "" : "<span>Imagen no disponible</span>"}</div>
          </div>
          <div class="lecturas-game-order-demo-copy" data-action="play-order-demo">
            <span class="lecturas-game-order-demo-kicker">Demostración</span>
            <h3 class="lecturas-game-order-demo-title">Así se debe leer</h3>
            <p id="lecturasGameOrderDemoPhrase" class="lecturas-game-order-demo-phrase">${orderPhraseText}</p>
            <div class="lecturas-game-order-demo-nav">
              <button type="button" id="lecturasGameOrderPrevBtn" class="lecturas-game-btn lecturas-game-order-nav-btn" data-action="order-prev-phrase">Frase anterior</button>
              <button type="button" id="lecturasGameOrderNextBtn" class="lecturas-game-btn lecturas-game-order-nav-btn" data-action="order-next-phrase">Siguiente frase</button>
            </div>
            <button type="button" id="lecturasGameOrderDemoBtn" class="lecturas-game-btn is-primary lecturas-game-order-demo-btn" data-action="play-order-demo">Escuchar lectura</button>
            <p id="lecturasGameOrderDemoHint" class="lecturas-game-order-demo-hint">Reproduce el ejemplo. Cuando termine, el juego de la derecha comenzará con 3, 2, 1.</p>
          </div>
        </div>
      </aside>
      <div class="lecturas-game-order-game-panel">
      ` : ""}
      <div class="lecturas-game-stage${isOrderShell ? " is-order-split" : ""}" id="lecturasGameStage">
        <video id="lecturasGameCameraFeed" class="lecturas-game-camera-feed" autoplay playsinline muted></video>
        <canvas id="lecturasGameCanvas" class="lecturas-game-canvas" width="960" height="540"></canvas>
        <div id="lecturasGameWords3D" class="lecturas-game-words3d" aria-hidden="true"></div>
        <canvas id="lecturasGamePoseOverlay" class="lecturas-game-pose-overlay" width="960" height="540" aria-hidden="true"></canvas>
        <div class="lecturas-game-stage-top lecturas-game-stage-top--solo" data-stage-top="solo">
          <div class="lecturas-game-stage-top-main">
            <div class="lecturas-game-top-left">
              <span id="lecturasGameAliasBadgeSolo" class="lecturas-game-plants-badge">Alias: Invitado</span>
              <span id="lecturasGameLevelBadge" class="lecturas-game-level-badge"></span>
              <span id="lecturasGameScoreBadge" class="lecturas-game-score-badge">Puntos: 0</span>
              <span id="lecturasGameTimerBadge" class="lecturas-game-score-badge">Tiempo: 60s</span>
              <span id="lecturasGameWrongRemain" class="lecturas-game-remaining-badge">Incorrectas restantes: 0</span>
            </div>
            <div class="lecturas-game-target-wrap">
              <span class="lecturas-game-target-label">Objetivo</span>
              <strong id="lecturasGameTargetWord">${targetWord}</strong>
            </div>
            <div class="lecturas-game-top-controls">
              <div id="lecturasGamePowTimerSolo" class="lecturas-game-pow-timer" hidden>
                <div class="lecturas-game-pow-timer-head">
                  <span class="lecturas-game-pow-timer-title">Pow</span>
                  <span id="lecturasGamePowTimerTextSolo" class="lecturas-game-pow-timer-text">--</span>
                </div>
                <div class="lecturas-game-pow-timer-track">
                  <span id="lecturasGamePowTimerFillSolo" class="lecturas-game-pow-timer-fill"></span>
                </div>
              </div>
              <button type="button" id="lecturasGameFullscreenBtn" class="lecturas-game-stage-btn" data-action="toggle-fullscreen" aria-label="Pantalla completa">Pantalla completa</button>
            </div>
          </div>
          <div class="lecturas-game-stage-bottom">
            <div class="lecturas-game-status-row is-bottom">
              <span id="lecturasGameGemsBadge" class="lecturas-game-seeds-badge">Gemas: 0</span>
              <span id="lecturasGameRankBadge" class="lecturas-game-water-badge">Ranking local</span>
              <span id="lecturasGamePairLeftBadge" class="lecturas-game-plants-badge" hidden>Izquierda: 0</span>
              <span id="lecturasGamePairRightBadge" class="lecturas-game-plants-badge" hidden>Derecha: 0</span>
            </div>
          </div>
        </div>
        <div id="lecturasGameStageTopPairWrap" class="lecturas-game-stage-top-pair-wrap" hidden>
          <div class="lecturas-game-stage-top lecturas-game-stage-top--pair is-left" data-stage-top="pair-left">
            <div class="lecturas-game-stage-top-main">
              <div class="lecturas-game-top-left">
                <span id="lecturasGamePairAliasLeft" class="lecturas-game-plants-badge">Alias: Jugador A</span>
                <span id="lecturasGamePairLevelBadgeLeft" class="lecturas-game-level-badge"></span>
                <span id="lecturasGamePairScoreBadgeLeft" class="lecturas-game-score-badge">Puntos: 0</span>
                <span id="lecturasGamePairTimerBadgeLeft" class="lecturas-game-score-badge">Tiempo: 60s</span>
                <span id="lecturasGamePairWrongRemainLeft" class="lecturas-game-remaining-badge">Incorrectas restantes: 0</span>
              </div>
              <div class="lecturas-game-target-wrap">
                <span class="lecturas-game-target-label">Objetivo</span>
                <strong id="lecturasGamePairTargetWordLeft" class="lecturas-game-target-word">${targetWord}</strong>
              </div>
              <div class="lecturas-game-top-controls">
                <div id="lecturasGamePowTimerLeft" class="lecturas-game-pow-timer" hidden>
                  <div class="lecturas-game-pow-timer-head">
                    <span class="lecturas-game-pow-timer-title">Pow</span>
                    <span id="lecturasGamePowTimerTextLeft" class="lecturas-game-pow-timer-text">--</span>
                  </div>
                  <div class="lecturas-game-pow-timer-track">
                    <span id="lecturasGamePowTimerFillLeft" class="lecturas-game-pow-timer-fill"></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="lecturas-game-stage-top lecturas-game-stage-top--pair is-right" data-stage-top="pair-right">
            <div class="lecturas-game-stage-top-main">
              <div class="lecturas-game-top-left">
                <span id="lecturasGamePairAliasRight" class="lecturas-game-plants-badge">Alias: Jugador B</span>
                <span id="lecturasGamePairLevelBadgeRight" class="lecturas-game-level-badge"></span>
                <span id="lecturasGamePairScoreBadgeRight" class="lecturas-game-score-badge">Puntos: 0</span>
                <span id="lecturasGamePairTimerBadgeRight" class="lecturas-game-score-badge">Tiempo: 60s</span>
                <span id="lecturasGamePairWrongRemainRight" class="lecturas-game-remaining-badge">Incorrectas restantes: 0</span>
              </div>
              <div class="lecturas-game-target-wrap">
                <span class="lecturas-game-target-label">Objetivo</span>
                <strong id="lecturasGamePairTargetWordRight" class="lecturas-game-target-word">${targetWord}</strong>
              </div>
              <div class="lecturas-game-top-controls">
                <div id="lecturasGamePowTimerRight" class="lecturas-game-pow-timer" hidden>
                  <div class="lecturas-game-pow-timer-head">
                    <span class="lecturas-game-pow-timer-title">Pow</span>
                    <span id="lecturasGamePowTimerTextRight" class="lecturas-game-pow-timer-text">--</span>
                  </div>
                  <div class="lecturas-game-pow-timer-track">
                    <span id="lecturasGamePowTimerFillRight" class="lecturas-game-pow-timer-fill"></span>
                  </div>
                </div>
                <button type="button" id="lecturasGameFullscreenBtnPair" class="lecturas-game-stage-btn" data-action="toggle-fullscreen" aria-label="Pantalla completa">Pantalla completa</button>
              </div>
            </div>
          </div>
        </div>
        <div id="lecturasGameOrderPhraseWrap" class="lecturas-game-order-phrase" hidden>
          <span id="lecturasGameOrderPhraseLabel" class="lecturas-game-order-label">Frase</span>
          <p id="lecturasGameOrderPhraseText" class="lecturas-game-order-text"></p>
        </div>
        <button
          type="button"
          id="lecturasGameTraceResetBtn"
          class="lecturas-game-stage-btn lecturas-game-trace-reset-btn"
          data-action="trace-reset"
          hidden
        >Reiniciar trazo</button>
        <div class="lecturas-game-overlay" id="lecturasGameOverlay">
          <h4 id="lecturasGameOverlayTitle">Protege al sinónimo</h4>
          <p id="lecturasGameOverlayText">Elimina palabras incorrectas y protege el sinónimo correcto.</p>
          <div class="lecturas-game-overlay-actions">
            <button type="button" class="lecturas-game-btn is-primary" id="lecturasGameStartBtn" data-action="start-round">Iniciar ronda</button>
            <button type="button" class="lecturas-game-btn is-primary" id="lecturasGameRetryBtn" data-action="retry-round" hidden>Jugar otra vez</button>
            <button type="button" class="lecturas-game-btn is-primary" id="lecturasGameNextBtn" data-action="next-level" hidden>Siguiente nivel</button>
            <button type="button" class="lecturas-game-btn is-primary" id="lecturasGameMicBtn" data-action="start-mic-read" hidden>Leer con micrófono</button>
            <button type="button" class="lecturas-game-btn is-primary" id="lecturasGameQuizOptionA" data-action="quiz-option-a" hidden>Opción A</button>
            <button type="button" class="lecturas-game-btn is-primary" id="lecturasGameQuizOptionB" data-action="quiz-option-b" hidden>Opción B</button>
            <button type="button" class="lecturas-game-btn is-ghost" id="lecturasGameQuizSkipBtn" data-action="quiz-skip" hidden>Saltar pregunta (-5 gemas)</button>
            <button type="button" class="lecturas-game-btn is-read" id="lecturasGameContinueBtn" data-action="continue-reading" hidden>Continuar partida</button>
            <button type="button" class="lecturas-game-btn is-primary" id="lecturasGameFinalizeBtn" data-action="finalize-match" hidden>Finalizar partida</button>
          </div>
        </div>
      </div>
      ${isOrderShell ? "</div>" : ""}

      <!-- Tutorial Modal para Sinónimos -->
      ${(runtime.challengeType === 'synonyms' && !runtime.synonymsTutorialSeen) ? `
      <div id="synonymsTutorialModal" class="trace-intro-modal">
        <div class="trace-modal-content">
          <div class="trace-modal-header">
            <div class="trace-modal-icon">🛡️</div>
            <h2>Protege al Sinónimo</h2>
          </div>
          <div class="trace-modal-body">
            <div class="trace-tutorial-grid">
              <div class="trace-tutorial-step">
                <div class="trace-step-num">1</div>
                <p>Mueve tus manos para golpear las <b>palabras incorrectas</b>.</p>
              </div>
              <div class="trace-tutorial-step">
                <div class="trace-step-num">2</div>
                <p>¡CUIDADO! No toques el <b>sinónimo correcto</b> o perderás la ronda.</p>
              </div>
              <div class="trace-tutorial-step">
                <div class="trace-step-num">3</div>
                <p><b>Super Bomba:</b> Junta el índice y pulgar para cargar energía y suéltalo para limpiar la pantalla.</p>
                <img src="pinch_gesture_tutorial.png" alt="Gesto de pinza" class="trace-gesture-img">
              </div>
            </div>
          </div>
          <div class="trace-modal-footer">
            <button type="button" class="lecturas-game-pixel-btn is-gold" data-action="dismiss-tutorial">¡Entendido! Comenzar</button>
          </div>
        </div>
      </div>
      ` : ''}
    </div>
  `;
}

function _lecturasGameExtractMenuBackgroundCandidates(lectura = null) {
  const raw = lectura?.raw || {};
  const set = new Set();
  const push = (value = "") => {
    const clean = sanitizeImageCandidate(value);
    if (!clean || !looksLikeImageReference(clean) || !_lecturasGameIsStorageImageRef(clean)) return;
    set.add(clean);
  };
  push(lectura?.coverImageResolved || "");
  push(lectura?.coverImage || "");
  [
    raw?.imagenes,
    raw?.images,
    raw?.gallery,
    raw?.galeria,
    raw?.slides,
    raw?.storySlides,
    raw?.escenas,
    raw?.assets
  ].forEach((item) => {
    if (Array.isArray(item)) {
      item.forEach((entry) => push(pickImageFromAny(entry)));
    } else {
      push(pickImageFromAny(item));
    }
  });
  const html = String(
    lectura?.htmlLectura
    || raw?.contenidoHTML
    || raw?.textoLectura
    || raw?.contenidoCompleto
    || ""
  ).trim();
  if (html) {
    const wrap = document.createElement("div");
    wrap.innerHTML = html;
    wrap.querySelectorAll("img[src], img[data-src], img[data-original], img[data-lazy-src], source[srcset]").forEach((node) => {
      const srcset = sanitizeImageCandidate(node.getAttribute("srcset") || "").split(",")[0]?.trim().split(/\s+/)[0] || "";
      push(
        node.getAttribute("src")
        || node.getAttribute("data-src")
        || node.getAttribute("data-original")
        || node.getAttribute("data-lazy-src")
        || srcset
      );
    });
  }
  return Array.from(set).slice(0, 8);
}

async function _lecturasGameApplyMenuBackgroundSlides(runtime = lecturasGameModeRuntime) {
  if (!els.modeModalBody) return;
  _lecturasGameStopMenuBackgroundRotation(runtime);
  const track = els.modeModalBody.querySelector(".lecturas-game-mainmenu-bg-track");
  if (!track) return;
  const candidates = _lecturasGameExtractMenuBackgroundCandidates(runtime.lectura);
  const resolved = [];
  for (const candidate of candidates) {
    try {
      const url = await resolveCoverUrlForDisplay(candidate);
      if (url) resolved.push(url);
      if (resolved.length >= 6) break;
    } catch (_) {
      // try next
    }
  }
  const finalList = resolved;
  if (!finalList.length) {
    track.innerHTML = "";
    return;
  }
  track.innerHTML = finalList.map((url, idx) => `
    <div class="lecturas-game-mainmenu-bg-slide${idx === 0 ? " is-active" : ""}" style="background-image:url('${escapeHtml(url)}')"></div>
  `).join("");
  if (finalList.length <= 1) return;
  runtime.menuBackgroundIndex = 0;
  runtime.menuBackgroundTimerId = setInterval(() => {
    const slides = Array.from(track.querySelectorAll(".lecturas-game-mainmenu-bg-slide"));
    if (!slides.length) return;
    runtime.menuBackgroundIndex = (runtime.menuBackgroundIndex + 1) % slides.length;
    slides.forEach((slide, idx) => slide.classList.toggle("is-active", idx === runtime.menuBackgroundIndex));
  }, 5200);
}

function _lecturasGameOfflineKeyFromLectura(lectura = null) {
  if (!lectura) return "";
  return `${String(lectura.sourceCollection || "").trim()}::${String(lectura.id || "").trim()}`;
}

function _lecturasGameOfflineLabel(runtime = lecturasGameModeRuntime) {
  const pack = runtime?.offlinePack || {};
  const status = String(pack.status || "idle");
  if (status === "downloading") {
    const pct = Math.max(0, Math.min(100, Math.round(Number(pack.progress || 0))));
    return `Descargando... ${pct}%`;
  }
  if (status === "ready") {
    return navigator.onLine === false ? "Listo offline" : "Re-descargar juego offline";
  }
  if (status === "stale") {
    return navigator.onLine === false ? "Offline desactualizado" : "Actualizar descarga offline";
  }
  if (status === "error") return "Reintentar descarga offline";
  return "Descargar juego offline";
}

async function _lecturasGameSyncOfflinePackState(runtime = lecturasGameModeRuntime) {
  const key = _lecturasGameOfflineKeyFromLectura(runtime?.lectura || null);
  const meta = _lecturasGameGetOfflineMetaForKey(key);
  const stale = meta?.offlineReady && _lecturasGameIsUpdateNeededForLectura(runtime?.lectura || null, key);
  runtime.offlinePack = {
    status: meta?.offlineReady ? (stale ? "stale" : "ready") : "idle",
    progress: 0,
    downloadedAt: Number(meta?.lastUpdated || 0),
    error: "",
    bytesCached: Number(meta?.bytesCached || 0)
  };
}

async function _lecturasGameBuildOfflineManifest(runtime = lecturasGameModeRuntime) {
  const lectura = runtime?.lectura || null;
  const manifest = new Set();
  const bgCandidates = _lecturasGameExtractMenuBackgroundCandidates(lectura);
  for (const candidate of bgCandidates) {
    try {
      const url = await resolveCoverUrlForDisplay(candidate);
      if (url) manifest.add(url);
    } catch (_) {
      // continue
    }
  }
  try {
    const musicUrl = await _lecturasGameResolvePlayableGameMusicUrl(runtime);
    if (musicUrl) manifest.add(musicUrl);
  } catch (_) {
    // continue
  }
  const html = String(
    lectura?.htmlLectura
    || lectura?.raw?.contenidoHTML
    || lectura?.raw?.textoLectura
    || lectura?.raw?.contenidoCompleto
    || ""
  ).trim();
  if (html) {
    try {
      const wrap = document.createElement("div");
      wrap.innerHTML = html;
      wrap.querySelectorAll("img[src], img[data-src], img[data-original], img[data-lazy-src], source[srcset]").forEach((node) => {
        const srcset = sanitizeImageCandidate(node.getAttribute("srcset") || "").split(",")[0]?.trim().split(/\s+/)[0] || "";
        const rawSrc = node.getAttribute("src")
          || node.getAttribute("data-src")
          || node.getAttribute("data-original")
          || node.getAttribute("data-lazy-src")
          || srcset;
        const clean = sanitizeImageCandidate(rawSrc);
        if (clean) manifest.add(clean);
      });
    } catch (_) {
      // noop
    }
  }
  try {
    const liveAudioUrls = await _lecturasGameResolveLecturaLiveAudioUrls(lectura);
    liveAudioUrls.forEach((url) => manifest.add(url));
  } catch (_) {
    // noop
  }
  return Array.from(manifest).filter(Boolean);
}

async function _lecturasGameEnsureSharedOfflineAssetsCached() {
  if (!("caches" in window)) return { total: 0, cached: 0, bytes: 0 };
  const cache = await caches.open(LECTURAS_GAME_OFFLINE_CACHE_NAME);
  let cached = 0;
  let bytes = 0;
  for (const url of LECTURAS_GAME_SHARED_OFFLINE_ASSETS) {
    const res = await _lecturasGameCacheOfflineAsset(cache, url);
    if (res.ok) {
      cached += 1;
      bytes += Number(res.bytes || 0);
    }
  }
  return { total: LECTURAS_GAME_SHARED_OFFLINE_ASSETS.length, cached, bytes };
}

async function _lecturasGameResolveLecturaLiveAudioUrls(lectura = null) {
  const raw = lectura?.raw || {};
  const buckets = [
    raw?.liveParagraphAudio,
    raw?.audioParagraphs,
    raw?.paragraphAudio,
    raw?.paragraphAudios,
    raw?.audiosLive,
    raw?.audioPorParrafo,
    raw?.lecturaAudio?.paragraphs,
    raw?.lecturaAudio?.items
  ];
  const urls = new Set();
  const pushAny = async (value = "") => {
    const clean = String(value || "").trim();
    if (!clean) return;
    if (/^(https?:|blob:|data:|\/)/i.test(clean)) {
      urls.add(clean);
      return;
    }
    if (/^gs:\/\//i.test(clean)) {
      const gs = parseGsPath(clean);
      try {
        const signed = await getDownloadURL(storageRef(storage, clean));
        if (signed) urls.add(signed);
      } catch (_) {
        const alt = buildStorageAltMediaUrl(gs?.path || "", gs?.bucket || "");
        if (alt) urls.add(alt);
      }
      return;
    }
    try {
      const signed = await getDownloadURL(storageRef(storage, clean));
      if (signed) urls.add(signed);
    } catch (_) {
      const alt = buildStorageAltMediaUrl(clean);
      if (alt) urls.add(alt);
    }
  };
  for (const bucket of buckets) {
    const list = Array.isArray(bucket) ? bucket : [];
    for (const item of list) {
      if (typeof item === "string") {
        await pushAny(item);
      } else {
        await pushAny(item?.url || item?.audioUrl || item?.downloadURL || "");
        await pushAny(item?.path || item?.storagePath || "");
      }
    }
  }
  return Array.from(urls);
}

function _lecturasGameBuildCatalogSnapshot() {
  return (Array.isArray(state.allLecturas) ? state.allLecturas : [])
    .filter((item) => item && item.id && item.sourceCollection)
    .map((item) => ({
      id: String(item.id || "").trim(),
      key: String(item.key || `${item.sourceCollection || ""}::${item.id || ""}`).trim(),
      sourceCollection: String(item.sourceCollection || "").trim(),
      tipo: String(item.tipo || "").trim(),
      titulo: String(item.titulo || "").trim(),
      tema: String(item.tema || "").trim(),
      grado: String(item.grado || "").trim(),
      nivel: String(item.nivel || "").trim(),
      trimestre: String(item.trimestre || "").trim(),
      unidad: String(item.unidad || "").trim(),
      htmlLectura: String(item.htmlLectura || "").trim(),
      preguntas: Array.isArray(item.preguntas) ? item.preguntas : [],
      bibliografia: item.bibliografia || "",
      sinonimos: item.sinonimos || "",
      musicAssets: item.musicAssets || {},
      published: item.published === true,
      raw: item.raw || {}
    }));
}

function _lecturasGameHashString(value = "") {
  const s = String(value || "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `h${(h >>> 0).toString(16)}`;
}

function _lecturasGameBuildLecturaContentTag(lectura = null) {
  const raw = lectura?.raw || {};
  const music = lectura?.musicAssets || {};
  const updatedMark = String(
    raw?.updatedAt?.seconds
    || raw?.updatedAt
    || raw?.publishedAt?.seconds
    || raw?.publishedAt
    || raw?.fechaPublicacion
    || ""
  );
  const base = [
    String(lectura?.sourceCollection || ""),
    String(lectura?.id || ""),
    String(lectura?.titulo || ""),
    String(lectura?.tema || ""),
    String(lectura?.htmlLectura || ""),
    String(lectura?.sinonimos ? JSON.stringify(lectura.sinonimos) : ""),
    String(music?.gameUrl || ""),
    String(music?.gamePath || ""),
    updatedMark
  ].join("|");
  return _lecturasGameHashString(base);
}

function _lecturasGameIsUpdateNeededForLectura(lectura = null, key = "") {
  const meta = _lecturasGameGetOfflineMetaForKey(key);
  if (!meta?.offlineReady) return false;
  if (String(meta.offlineVersion || "") !== LECTURAS_GAME_OFFLINE_CONTENT_VERSION) return true;
  const currentTag = _lecturasGameBuildLecturaContentTag(lectura);
  const savedTag = String(meta.contentTag || "");
  if (!savedTag) return true;
  return currentTag !== savedTag;
}

function _lecturasGameIsOfflineCardAvailable(lecturaKey = "", lectura = null) {
  const key = String(lecturaKey || "").trim();
  if (!key) return false;
  const meta = _lecturasGameGetOfflineMetaForKey(key);
  if (!meta?.offlineReady) return false;
  if (_lecturasGameIsUpdateNeededForLectura(lectura, key)) return false;
  return true;
}

function _lecturasGameTouchOfflineCard(lecturaKey = "") {
  const key = String(lecturaKey || "").trim();
  if (!key) return;
  const meta = _lecturasGameGetOfflineMetaForKey(key);
  if (!meta?.offlineReady) return;
  _lecturasGameSetOfflineMetaForKey(key, {
    ...meta,
    lastAccessAt: Date.now()
  });
}

async function _lecturasGameRemoveOfflineCard(lecturaKey = "") {
  const key = String(lecturaKey || "").trim();
  if (!key) return false;
  const meta = _lecturasGameGetOfflineMetaForKey(key);
  const card = await _lecturasGameOfflineCardGet(key).catch(() => null);
  const assets = Array.isArray(card?.assets) ? card.assets : [];
  const allCards = await _lecturasGameOfflineCardGetAll().catch(() => []);
  const inUseByOthers = new Set();
  (Array.isArray(allCards) ? allCards : []).forEach((item) => {
    if (!item || String(item.lecturaKey || "") === key) return;
    if (String(item.status || "") !== "downloaded") return;
    const list = Array.isArray(item.assets) ? item.assets : [];
    list.forEach((assetUrl) => {
      const clean = String(assetUrl || "").trim();
      if (clean) inUseByOthers.add(clean);
    });
  });
  try {
    if ("caches" in window) {
      const cache = await caches.open(LECTURAS_GAME_OFFLINE_CACHE_NAME);
      for (const url of assets) {
        const clean = String(url || "").trim();
        if (!clean) continue;
        if (LECTURAS_GAME_SHARED_OFFLINE_ASSETS.includes(clean)) continue;
        if (inUseByOthers.has(clean)) continue;
        try {
          await cache.delete(clean, { ignoreSearch: true });
        } catch (_) {
          // no-op
        }
      }
    }
  } catch (_) {
    // no-op
  }
  _lecturasGameSetOfflineMetaForKey(key, null);
  await _lecturasGameOfflineCardDelete(key).catch(() => false);
  await _lecturasGameOfflineDbPut({ key, lectura: null, updatedAt: Date.now(), removed: true }).catch(() => false);
  if (meta?.offlineReady) state.downloadStatusByKey.set(key, { status: "not_downloaded", progress: 0, error: "" });
  return true;
}

async function _lecturasGamePruneOfflineStorageIfNeeded(maxBytes = LECTURAS_GAME_OFFLINE_MAX_BYTES) {
  const allMeta = _lecturasGameReadOfflineMeta();
  const entries = Object.entries(allMeta || {})
    .map(([key, value]) => ({ key, ...(value && typeof value === "object" ? value : {}) }))
    .filter((it) => it?.offlineReady);
  let used = entries.reduce((acc, it) => acc + Math.max(0, Number(it.bytesCached || 0)), 0);
  if (used <= maxBytes) return { usedBytes: used, evicted: [] };
  entries.sort((a, b) => Number(a.lastAccessAt || a.lastUpdated || 0) - Number(b.lastAccessAt || b.lastUpdated || 0));
  const evicted = [];
  for (const item of entries) {
    if (used <= maxBytes) break;
    const ok = await _lecturasGameRemoveOfflineCard(item.key);
    if (!ok) continue;
    used = Math.max(0, used - Math.max(0, Number(item.bytesCached || 0)));
    evicted.push(String(item.key || ""));
  }
  return { usedBytes: used, evicted };
}

async function _lecturasGameRunOfflineMigrationV3Once() {
  try {
    const already = localStorage.getItem(LECTURAS_GAME_OFFLINE_MIGRATION_KEY);
    if (String(already || "") === "1") return true;
  } catch (_) {
    // no-op
  }
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      const deletions = keys
        .filter((k) => {
          const name = String(k || "");
          return name.startsWith("cb-lecturas-game-") || name.startsWith("cb-lg-");
        })
        .map((k) => caches.delete(k));
      await Promise.allSettled(deletions);
    }
  } catch (_) {
    // no-op
  }
  try {
    const dbs = ["cb_lecturas_game_offline_v1", "cb_lecturas_game_offline_v2"];
    dbs.forEach((name) => {
      try { indexedDB.deleteDatabase(name); } catch (_) { }
    });
  } catch (_) {
    // no-op
  }
  try {
    localStorage.removeItem(LECTURAS_GAME_OFFLINE_META_KEY);
  } catch (_) {
    // no-op
  }
  await _lecturasGameOfflineConfigSet({
    schemaVersion: LECTURAS_GAME_OFFLINE_SCHEMA_VERSION,
    maxBytes: LECTURAS_GAME_OFFLINE_MAX_BYTES,
    migrationDone: true,
    migratedAt: Date.now()
  }).catch(() => false);
  try {
    localStorage.setItem(LECTURAS_GAME_OFFLINE_MIGRATION_KEY, "1");
  } catch (_) {
    // no-op
  }
  return true;
}

async function _lecturasGameCacheOfflineAsset(cache = null, url = "") {
  const target = String(url || "").trim();
  if (!cache || !target) return { ok: false, bytes: 0 };
  if (!_lecturasGameIsAllowedRemoteUrl(target)) return { ok: false, bytes: 0 };
  if (/\/wasm\/?$/i.test(target)) return { ok: false, bytes: 0 };
  try {
    const isExternal = /^https?:/i.test(target) && !target.startsWith(window.location.origin);
    const existing = await cache.match(target, { ignoreSearch: false });
    if (existing) return { ok: true, bytes: 0 };
    const req = new Request(target, {
      method: "GET",
      mode: isExternal ? "no-cors" : "same-origin",
      credentials: "omit",
      cache: "no-store"
    });
    const resp = await fetch(req);
    if (!resp || (!resp.ok && resp.type !== "opaque")) return { ok: false, bytes: 0 };
    const copy = resp.clone();
    await cache.put(req, resp);
    if (copy.type === "opaque") return { ok: true, bytes: 0 };
    const buf = await copy.arrayBuffer().catch(() => new ArrayBuffer(0));
    const bytes = Number(buf?.byteLength || 0);
    if (bytes > (24 * 1024 * 1024)) {
      try { await cache.delete(req, { ignoreSearch: true }); } catch (_) { }
      return { ok: false, bytes: 0 };
    }
    return { ok: true, bytes };
  } catch (_) {
    return { ok: false, bytes: 0 };
  }
}

async function _lecturasGameDownloadOfflinePack(runtime = lecturasGameModeRuntime) {
  if (!runtime?.lectura) throw new Error("lectura_missing");
  if (!navigator.onLine) throw new Error("offline_no_network");
  if (!("caches" in window)) throw new Error("cache_api_not_supported");
  runtime.offlinePack = {
    status: "downloading",
    progress: 0,
    downloadedAt: 0,
    error: "",
    bytesCached: 0
  };
  _lecturasGameRenderMenuStep(runtime);
  const urls = await _lecturasGameBuildOfflineManifest(runtime);
  const total = Math.max(1, LECTURAS_GAME_SHARED_OFFLINE_ASSETS.length + urls.length + 1);
  let done = 0;
  let bytes = 0;
  const shared = await _lecturasGameEnsureSharedOfflineAssetsCached();
  done += Number(shared.cached || 0);
  bytes += Number(shared.bytes || 0);
  runtime.offlinePack.progress = Math.round((done / total) * 100);
  _lecturasGameRenderMenuStep(runtime);
  const cache = await caches.open(LECTURAS_GAME_OFFLINE_CACHE_NAME);
  for (const url of urls) {
    const res = await _lecturasGameCacheOfflineAsset(cache, url);
    if (res.ok) bytes += Number(res.bytes || 0);
    done += 1;
    runtime.offlinePack.progress = Math.round((done / total) * 100);
    _lecturasGameRenderMenuStep(runtime);
  }
  const key = _lecturasGameOfflineKeyFromLectura(runtime.lectura);
  const baseLectura = runtime.lectura || {};
  const snapshot = {
    id: baseLectura.id,
    key: lecturaKey(baseLectura),
    sourceCollection: baseLectura.sourceCollection,
    titulo: baseLectura.titulo,
    tema: baseLectura.tema,
    grado: baseLectura.grado,
    nivel: baseLectura.nivel,
    trimestre: baseLectura.trimestre,
    unidad: baseLectura.unidad,
    htmlLectura: String(baseLectura.htmlLectura || ""),
    preguntas: Array.isArray(baseLectura.preguntas) ? baseLectura.preguntas : [],
    sinonimos: baseLectura.sinonimos || "",
    bibliografia: baseLectura.bibliografia || "",
    userId: String(baseLectura.userId || baseLectura.raw?.userId || baseLectura.raw?.uid || baseLectura.raw?.ownerId || "").trim(),
    uid: String(baseLectura.uid || baseLectura.raw?.uid || baseLectura.raw?.userId || baseLectura.raw?.ownerId || "").trim(),
    ownerId: String(baseLectura.ownerId || baseLectura.raw?.ownerId || baseLectura.raw?.userId || baseLectura.raw?.uid || "").trim(),
    ownerUid: String(baseLectura.ownerUid || baseLectura.raw?.ownerUid || baseLectura.raw?.ownerId || baseLectura.raw?.userId || baseLectura.raw?.uid || "").trim(),
    musicAssets: baseLectura.musicAssets || {}
  };
  const savedAt = Date.now();
  await _lecturasGameOfflineDbPut({
    key,
    lectura: snapshot,
    updatedAt: savedAt
  });
  _lecturasGameSetOfflineMetaForKey(key, {
    offlineReady: true,
    offlineVersion: LECTURAS_GAME_OFFLINE_CONTENT_VERSION,
    contentTag: _lecturasGameBuildLecturaContentTag(runtime.lectura),
    lastUpdated: savedAt,
    lastAccessAt: savedAt,
    bytesCached: bytes,
    assetsTotal: urls.length
  });
  await _lecturasGameOfflineCardPut({
    lecturaKey: key,
    status: "downloaded",
    gameIds: ["synonyms", "order", "trace", "caps"],
    assets: urls,
    bytes,
    downloadedAt: savedAt,
    lastAccessAt: savedAt,
    contentTag: _lecturasGameBuildLecturaContentTag(runtime.lectura)
  }).catch(() => false);
  await _lecturasGamePruneOfflineStorageIfNeeded(LECTURAS_GAME_OFFLINE_MAX_BYTES).catch(() => null);
  done += 1;
  runtime.offlinePack = {
    status: "ready",
    progress: Math.round((done / total) * 100),
    downloadedAt: savedAt,
    error: "",
    bytesCached: bytes
  };
  renderScenes();
  _lecturasGameRenderMenuStep(runtime);
}

function _lecturasGameDownloadStatusForKey(key = "") {
  const live = state.downloadStatusByKey.get(String(key || ""));
  if (live && typeof live === "object") return live;
  const meta = _lecturasGameGetOfflineMetaForKey(String(key || ""));
  if (meta?.offlineReady) return { status: "downloaded", progress: 100, error: "", needsUpdate: false };
  return { status: "not_downloaded", progress: 0, error: "" };
}

async function _lecturasGameDownloadAllContentForLectura(lectura = null, gameId = "") {
  if (!lectura?.id || !lectura?.sourceCollection) throw new Error("lectura_missing");
  if (!navigator.onLine) throw new Error("offline_no_network");
  if (!("caches" in window)) throw new Error("cache_api_not_supported");
  const key = _lecturasGameOfflineKeyFromLectura(lectura);
  state.downloadStatusByKey.set(key, { status: "downloading", progress: 0, error: "" });
  renderScenes();

  const runtimeLike = { lectura };
  const urls = await _lecturasGameBuildOfflineManifest(runtimeLike);
  const total = Math.max(1, LECTURAS_GAME_SHARED_OFFLINE_ASSETS.length + urls.length + 1);
  let done = 0;
  let bytes = 0;
  const shared = await _lecturasGameEnsureSharedOfflineAssetsCached();
  done += Number(shared.cached || 0);
  bytes += Number(shared.bytes || 0);
  state.downloadStatusByKey.set(key, { status: "downloading", progress: Math.round((done / total) * 100), error: "" });
  renderScenes();
  const cache = await caches.open(LECTURAS_GAME_OFFLINE_CACHE_NAME);
  for (const url of urls) {
    const res = await _lecturasGameCacheOfflineAsset(cache, url);
    if (res.ok) bytes += Number(res.bytes || 0);
    done += 1;
    state.downloadStatusByKey.set(key, { status: "downloading", progress: Math.round((done / total) * 100), error: "" });
    renderScenes();
  }

  const snapshot = {
    id: lectura.id,
    key: lecturaKey(lectura),
    sourceCollection: lectura.sourceCollection,
    titulo: lectura.titulo,
    tema: lectura.tema,
    grado: lectura.grado,
    nivel: lectura.nivel,
    trimestre: lectura.trimestre,
    unidad: lectura.unidad,
    htmlLectura: String(lectura.htmlLectura || ""),
    preguntas: Array.isArray(lectura.preguntas) ? lectura.preguntas : [],
    sinonimos: lectura.sinonimos || "",
    bibliografia: lectura.bibliografia || "",
    userId: String(lectura.userId || lectura.raw?.userId || lectura.raw?.uid || lectura.raw?.ownerId || "").trim(),
    uid: String(lectura.uid || lectura.raw?.uid || lectura.raw?.userId || lectura.raw?.ownerId || "").trim(),
    ownerId: String(lectura.ownerId || lectura.raw?.ownerId || lectura.raw?.userId || lectura.raw?.uid || "").trim(),
    ownerUid: String(lectura.ownerUid || lectura.raw?.ownerUid || lectura.raw?.ownerId || lectura.raw?.userId || lectura.raw?.uid || "").trim(),
    musicAssets: lectura.musicAssets || {}
  };
  const savedAt = Date.now();
  await _lecturasGameOfflineDbPut({ key, lectura: snapshot, updatedAt: savedAt });
  _lecturasGameSetOfflineMetaForKey(key, {
    offlineReady: true,
    offlineVersion: LECTURAS_GAME_OFFLINE_CONTENT_VERSION,
    contentTag: _lecturasGameBuildLecturaContentTag(lectura),
    lastUpdated: savedAt,
    lastAccessAt: savedAt,
    bytesCached: bytes,
    assetsTotal: urls.length
  });
  const normalizedGame = _lecturasGameNormalizeGameId(gameId || "");
  const gameIds = normalizedGame
    ? [normalizedGame]
    : ["synonyms", "order", "trace", "caps"];
  await _lecturasGameOfflineCardPut({
    lecturaKey: key,
    status: "downloaded",
    gameIds,
    assets: urls,
    bytes,
    downloadedAt: savedAt,
    lastAccessAt: savedAt,
    contentTag: _lecturasGameBuildLecturaContentTag(lectura)
  }).catch(() => false);
  await _lecturasGamePruneOfflineStorageIfNeeded(LECTURAS_GAME_OFFLINE_MAX_BYTES).catch(() => null);
  state.downloadStatusByKey.set(key, { status: "downloaded", progress: 100, error: "" });
  renderScenes();
}

async function _lecturasGameLoadOfflineLecturas() {
  const cards = await _lecturasGameOfflineCardGetAll().catch(() => []);
  const downloaded = new Set(
    (Array.isArray(cards) ? cards : [])
      .filter((it) => String(it?.status || "") === "downloaded")
      .map((it) => String(it?.lecturaKey || "").trim())
      .filter(Boolean)
  );
  const metaAll = _lecturasGameReadOfflineMeta();
  const rows = await _lecturasGameOfflineDbGetAll();
  const out = [];
  for (const row of rows) {
    const lectura = row?.lectura || null;
    if (row?.removed) continue;
    const key = String(row?.key || _lecturasGameOfflineKeyFromLectura(lectura || null));
    const meta = (metaAll && typeof metaAll[key] === "object") ? metaAll[key] : null;
    if (!lectura || !key || !meta?.offlineReady) continue;
    if (downloaded.size && !downloaded.has(key)) continue;
    out.push(lectura);
  }
  return out;
}

function _lecturasGameBuildMenuHtml(lectura = null, runtime = lecturasGameModeRuntime) {
  const title = escapeHtml(String(lectura?.titulo || "Lectura").trim() || "Lectura");
  const canContinue = _lecturasGameCanContinue(runtime);
  const offlineLabel = escapeHtml(_lecturasGameOfflineLabel(runtime));
  const offlineDisabled = runtime?.offlinePack?.status === "downloading" ? "disabled" : "";
  const menuStep = String(runtime?.menuStep || "game_select");
  const forcedGameId = resolveForcedGameId(runtime?.forcedGameId || "");
  const gameLocked = !!forcedGameId;
  const selectedGameId = _lecturasGameNormalizeGameId(runtime?.selectedGameId || runtime?.challengeType || "");
  const effectiveGameId = gameLocked ? forcedGameId : selectedGameId;
  const playMode = runtime?.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR ? LECTURAS_GAME_PLAY_MODE.PAIR : LECTURAS_GAME_PLAY_MODE.SOLO;
  const orderDifficulty = _lecturasGameGetOrderDifficulty(runtime);
  const orderDifficultyLabel = _lecturasGameGetOrderDifficultyLabel(runtime);
  const isOrderGame = effectiveGameId === LECTURAS_GAME_IDS.ORDER;
  const soloSession = runtime?.playerAccounts?.solo || {};
  const leftSession = runtime?.playerAccounts?.left || {};
  const rightSession = runtime?.playerAccounts?.right || {};
  const readSessionStats = (session = null) => {
    const profile = _lecturasGameGetSessionProfileSnapshotByGame(session, effectiveGameId);
    const totalScore = Math.max(0, Number(profile?.totalScore || 0));
    const gems = Math.max(0, Number(profile?.gems || 0));
    const level = Math.max(1, Number(profile?.level || 1));
    return { level, totalScore, gems };
  };
  const buildAuthCard = (session = null, options = {}) => {
    const side = String(options?.side || "solo");
    const heading = escapeHtml(String(options?.heading || "Jugador"));
    const isRight = side === "right";
    const readFullNameId = isRight ? "lecturasGameAuthFullNameRight" : "lecturasGameAuthFullNameLeft";
    const readUserId = isRight ? "lecturasGameAuthAliasRight" : "lecturasGameAuthAliasLeft";
    const loginAction = isRight ? "login-player-right" : (side === "left" ? "login-player-left" : "login-player-solo");
    const createAction = isRight ? "create-player-right" : (side === "left" ? "create-player-left" : "create-player-solo");
    const logoutAction = isRight ? "logout-player-right" : (side === "left" ? "logout-player-left" : "logout-player-solo");
    const displayName = escapeHtml(String(session?.displayName || session?.alias || session?.username || "Jugador"));
    if (session?.loggedIn) {
      const stats = readSessionStats(session);
      return `
        <div class="lecturas-game-auth-card">
          <strong>${heading}</strong>
          <p class="lecturas-game-auth-welcome">Hola ${displayName}!</p>
          <p class="lecturas-game-auth-stats">Nivel ${Math.round(Number(stats.level || 1))}</p>
          <p class="lecturas-game-auth-stats">Puntos (monedas): ${Math.round(Number(stats.totalScore || 0))}</p>
          <p class="lecturas-game-auth-stats">Diamantes: ${Math.round(Number(stats.gems || 0))}</p>
          <div class="lecturas-game-auth-actions">
            <button type="button" class="lecturas-game-pixel-btn" data-action="${logoutAction}">Cambiar usuario</button>
          </div>
        </div>
      `;
    }
    return `
      <div class="lecturas-game-auth-card">
        <strong>${heading}</strong>
        <input type="text" id="${readFullNameId}" class="lecturas-game-auth-input" placeholder="Nombre completo" value="${escapeHtml(String(session?.fullName || ""))}">
        <input type="text" id="${readUserId}" class="lecturas-game-auth-input" placeholder="Alias de usuario" value="${escapeHtml(String(session?.alias || session?.username || ""))}">
        <div class="lecturas-game-auth-actions">
          <button type="button" class="lecturas-game-pixel-btn" data-action="${loginAction}">Iniciar sesión</button>
          <button type="button" class="lecturas-game-pixel-btn" data-action="${createAction}">Crear usuario</button>
        </div>
      </div>
    `;
  };
  const gameSelectHtml = `
    <header class="lecturas-game-mainmenu-head">
      <h2>LECTURAS GAME</h2>
      <p>${title}</p>
      <span class="lecturas-game-mainmenu-splash">Selecciona un juego</span>
    </header>
    <div class="lecturas-game-mainmenu-actions">
      ${gameLocked
      ? `<button type="button" class="lecturas-game-pixel-btn is-primary" data-action="select-game-${escapeHtml(forcedGameId)}">${escapeHtml(_lecturasGameGetGameTitle(forcedGameId))}</button>`
      : `
      <button type="button" class="lecturas-game-pixel-btn ${selectedGameId === LECTURAS_GAME_IDS.SYNONYMS ? "is-primary" : ""}" data-action="select-game-synonyms">Protege al sinónimo</button>
      <button type="button" class="lecturas-game-pixel-btn ${selectedGameId === LECTURAS_GAME_IDS.ORDER ? "is-primary" : ""}" data-action="select-game-order">Atrapa el sinónimo</button>
      <button type="button" class="lecturas-game-pixel-btn ${selectedGameId === LECTURAS_GAME_IDS.TRACE ? "is-primary" : ""}" data-action="select-game-trace">Trazos de letras</button>
      <button type="button" class="lecturas-game-pixel-btn ${selectedGameId === LECTURAS_GAME_IDS.CAPS ? "is-primary" : ""}" data-action="select-game-caps">Caza mayúsculas</button>
      <button type="button" class="lecturas-game-pixel-btn ${selectedGameId === LECTURAS_GAME_IDS.MINEBLOX ? "is-primary" : ""}" data-action="select-game-mineblox">ASCraft (Beta)</button>
      `}
      <button type="button" class="lecturas-game-pixel-btn" data-action="download-game-offline" ${offlineDisabled}>${offlineLabel}</button>
      <button type="button" class="lecturas-game-pixel-btn" data-action="continue-game" ${canContinue ? "" : "disabled"}>Continuar jugando</button>
      <button type="button" class="lecturas-game-pixel-btn" data-action="open-ranking">Ver ranking</button>
      <button type="button" class="lecturas-game-pixel-btn" data-action="show-how-to-play">Cómo jugar</button>
      <button type="button" class="lecturas-game-pixel-btn is-danger" data-action="close-game-mode">Salir</button>
    </div>
    <footer class="lecturas-game-mainmenu-foot">
      <small>${runtime?.offlinePack?.status === "error" ? escapeHtml(String(runtime?.offlinePack?.error || "No se pudo descargar offline.")) : (gameLocked ? "Juego bloqueado por esta vista. Elige modo y jugador." : "Primero elige el juego. Después eliges Solo o Pareja.")}</small>
    </footer>
  `;
  const modeSelectHtml = `
    <header class="lecturas-game-mainmenu-head">
      <h2>${escapeHtml(_lecturasGameGetGameTitle(effectiveGameId))}</h2>
      <p>${title}</p>
      <span class="lecturas-game-mainmenu-splash">Elige modo de juego</span>
    </header>
    <div class="lecturas-game-mainmenu-actions">
      <button type="button" class="lecturas-game-pixel-btn ${playMode === LECTURAS_GAME_PLAY_MODE.SOLO ? "is-primary" : ""}" data-action="select-mode-solo">Modo Solo</button>
      <button type="button" class="lecturas-game-pixel-btn ${playMode === LECTURAS_GAME_PLAY_MODE.PAIR ? "is-primary" : ""}" data-action="select-mode-pair">Modo Pareja</button>
      ${isOrderGame ? `
      <button type="button" class="lecturas-game-pixel-btn ${orderDifficulty === LECTURAS_GAME_ORDER_DIFFICULTY.NOVICE ? "is-primary" : ""}" data-action="select-order-difficulty-novice">Novato</button>
      <button type="button" class="lecturas-game-pixel-btn ${orderDifficulty === LECTURAS_GAME_ORDER_DIFFICULTY.EXPERT ? "is-primary" : ""}" data-action="select-order-difficulty-expert">Experto</button>
      ` : ""}
      <div class="lecturas-game-auth-grid is-span-2">
        ${buildAuthCard(
    playMode === LECTURAS_GAME_PLAY_MODE.PAIR ? leftSession : soloSession,
    { side: playMode === LECTURAS_GAME_PLAY_MODE.PAIR ? "left" : "solo", heading: playMode === LECTURAS_GAME_PLAY_MODE.PAIR ? "Jugador Izquierdo" : "Jugador" }
  )}
        ${playMode === LECTURAS_GAME_PLAY_MODE.PAIR ? `
          ${buildAuthCard(rightSession, { side: "right", heading: "Jugador Derecho" })}
        ` : ""}
      </div>
      <button type="button" class="lecturas-game-pixel-btn is-primary" data-action="start-selected-mode">Jugar</button>
      <button type="button" class="lecturas-game-pixel-btn" data-action="open-ranking">Ver ranking</button>
      ${gameLocked ? "" : `<button type="button" class="lecturas-game-pixel-btn" data-action="back-to-game-select">Cambiar juego</button>`}
    </div>
    <footer class="lecturas-game-mainmenu-foot">
      <small>Modo elegido: ${playMode === LECTURAS_GAME_PLAY_MODE.PAIR ? "Pareja" : "Solo"}${isOrderGame ? ` | Dificultad: ${orderDifficultyLabel}` : ""}.</small>
    </footer>
  `;
  return `
    <div class="lecturas-game-mainmenu">
      <div class="lecturas-game-mainmenu-bg">
        <div class="lecturas-game-mainmenu-bg-track"></div>
      </div>
      <div class="lecturas-game-mainmenu-vignette"></div>
      <div class="lecturas-game-mainmenu-content">
        ${(gameLocked || menuStep === "mode_select") ? modeSelectHtml : gameSelectHtml}
      </div>
      <div id="lecturasGameHowToModal" class="lecturas-game-howto-modal" hidden>
        <div class="lecturas-game-howto-backdrop" data-action="close-how-to-play"></div>
        <article class="lecturas-game-howto-card">
          <h4>Cómo jugar</h4>
          <p>Protege al sinónimo: elimina palabras incorrectas y no toques la palabra protegida.</p>
          <p>Atrapa el sinónimo: lee la frase con puntuación; si fallas, atrapa la palabra voladora marcada.</p>
          <p>Powerups: firePow (fuego), IcePow (fuego helado), Skip (invencible sin puntaje), bomb (carga con manos cerradas y suelta al abrir), Rush (más palabras).</p>
          <p>Controles: en móvil toca y arrastra para mirar; en PC usa mouse y WASD. En simulación usa flechas/WASD y espacio para disparar.</p>
          <p>Regla clave: si tú o tu fuego tocan el sinónimo correcto, pierdes la ronda.</p>
          <div class="lecturas-game-howto-actions">
            <button type="button" class="lecturas-game-pixel-btn is-primary" data-action="close-how-to-play">Entendido</button>
          </div>
        </article>
      </div>
    </div>
  `;
}

function _lecturasGameCacheUiRefs() {
  const runtime = lecturasGameModeRuntime;
  runtime.videoEl = document.getElementById("lecturasGameCameraFeed");
  runtime.canvasEl = document.getElementById("lecturasGameCanvas");
  runtime.poseCanvasEl = document.getElementById("lecturasGamePoseOverlay");
  runtime.ctx = runtime.canvasEl?.getContext?.("2d") || null;
  runtime.poseCtx = runtime.poseCanvasEl?.getContext?.("2d") || null;
  runtime.three.container = document.getElementById("lecturasGameWords3D");
  runtime.ui = {
    stageEl: document.getElementById("lecturasGameStage"),
    orderDemoPanel: document.getElementById("lecturasGameOrderDemoPanel"),
    orderDemoMedia: document.getElementById("lecturasGameOrderDemoMedia"),
    orderDemoMediaState: document.getElementById("lecturasGameOrderDemoMediaState"),
    orderDemoPhrase: document.getElementById("lecturasGameOrderDemoPhrase"),
    orderPrevBtn: document.getElementById("lecturasGameOrderPrevBtn"),
    orderNextBtn: document.getElementById("lecturasGameOrderNextBtn"),
    orderDemoBtn: document.getElementById("lecturasGameOrderDemoBtn"),
    orderDemoHint: document.getElementById("lecturasGameOrderDemoHint"),
    stageTopEl: document.querySelector("#lecturasGameStage .lecturas-game-stage-top"),
    stageTopEls: Array.from(document.querySelectorAll("#lecturasGameStage [data-stage-top]")),
    stageTopSoloEl: document.querySelector("#lecturasGameStage [data-stage-top='solo']"),
    stageTopPairWrapEl: document.getElementById("lecturasGameStageTopPairWrap"),
    targetWord: document.getElementById("lecturasGameTargetWord"),
    aliasBadgeSolo: document.getElementById("lecturasGameAliasBadgeSolo"),
    pairAliasLeft: document.getElementById("lecturasGamePairAliasLeft"),
    pairAliasRight: document.getElementById("lecturasGamePairAliasRight"),
    pairTargetWordLeft: document.getElementById("lecturasGamePairTargetWordLeft"),
    pairTargetWordRight: document.getElementById("lecturasGamePairTargetWordRight"),
    wrongRemain: document.getElementById("lecturasGameWrongRemain"),
    pairWrongRemainLeft: document.getElementById("lecturasGamePairWrongRemainLeft"),
    pairWrongRemainRight: document.getElementById("lecturasGamePairWrongRemainRight"),
    levelBadge: document.getElementById("lecturasGameLevelBadge"),
    pairLevelBadgeLeft: document.getElementById("lecturasGamePairLevelBadgeLeft"),
    pairLevelBadgeRight: document.getElementById("lecturasGamePairLevelBadgeRight"),
    scoreBadge: document.getElementById("lecturasGameScoreBadge"),
    pairScoreBadgeLeft: document.getElementById("lecturasGamePairScoreBadgeLeft"),
    pairScoreBadgeRight: document.getElementById("lecturasGamePairScoreBadgeRight"),
    timerBadge: document.getElementById("lecturasGameTimerBadge"),
    pairTimerBadgeLeft: document.getElementById("lecturasGamePairTimerBadgeLeft"),
    pairTimerBadgeRight: document.getElementById("lecturasGamePairTimerBadgeRight"),
    powTimerSolo: document.getElementById("lecturasGamePowTimerSolo"),
    powTimerLeft: document.getElementById("lecturasGamePowTimerLeft"),
    powTimerRight: document.getElementById("lecturasGamePowTimerRight"),
    powTimerTextSolo: document.getElementById("lecturasGamePowTimerTextSolo"),
    powTimerTextLeft: document.getElementById("lecturasGamePowTimerTextLeft"),
    powTimerTextRight: document.getElementById("lecturasGamePowTimerTextRight"),
    powTimerFillSolo: document.getElementById("lecturasGamePowTimerFillSolo"),
    powTimerFillLeft: document.getElementById("lecturasGamePowTimerFillLeft"),
    powTimerFillRight: document.getElementById("lecturasGamePowTimerFillRight"),
    gemsBadge: document.getElementById("lecturasGameGemsBadge"),
    rankBadge: document.getElementById("lecturasGameRankBadge"),
    pairLeftBadge: document.getElementById("lecturasGamePairLeftBadge"),
    pairRightBadge: document.getElementById("lecturasGamePairRightBadge"),
    fullscreenBtn: document.getElementById("lecturasGameFullscreenBtn") || document.getElementById("lecturasGameFullscreenBtnPair"),
    overlay: document.getElementById("lecturasGameOverlay"),
    overlayTitle: document.getElementById("lecturasGameOverlayTitle"),
    overlayText: document.getElementById("lecturasGameOverlayText"),
    orderPhraseWrap: document.getElementById("lecturasGameOrderPhraseWrap"),
    orderPhraseLabel: document.getElementById("lecturasGameOrderPhraseLabel"),
    orderPhraseText: document.getElementById("lecturasGameOrderPhraseText"),
    startBtn: document.getElementById("lecturasGameStartBtn"),
    retryBtn: document.getElementById("lecturasGameRetryBtn"),
    nextBtn: document.getElementById("lecturasGameNextBtn"),
    micBtn: document.getElementById("lecturasGameMicBtn"),
    quizOptionABtn: document.getElementById("lecturasGameQuizOptionA"),
    quizOptionBBtn: document.getElementById("lecturasGameQuizOptionB"),
    quizSkipBtn: document.getElementById("lecturasGameQuizSkipBtn"),
    continueBtn: document.getElementById("lecturasGameContinueBtn"),
    finalizeBtn: document.getElementById("lecturasGameFinalizeBtn"),
    traceResetBtn: document.getElementById("lecturasGameTraceResetBtn"),
    tutorialModal: document.getElementById("synonymsTutorialModal")
  };
  runtime.handStartLabelDefault = String(runtime.ui.startBtn?.textContent || "Iniciar ronda").trim() || "Iniciar ronda";
  runtime.handRetryLabelDefault = String(runtime.ui.retryBtn?.textContent || "Jugar otra vez").trim() || "Jugar otra vez";
  runtime.handStartHoverSince = 0;
  runtime.handStartPending = false;
  runtime.handRetryHoverSince = 0;
  runtime.handRetryPending = false;
  runtime.handTraceResetPending = false;
  runtime.handMicPending = false;
  _lecturasGameSyncFullscreenButton(runtime);
}

function _lecturasGameResizeCanvas(runtime = lecturasGameModeRuntime) {
  const canvas = runtime.canvasEl;
  const ctx = runtime.ctx;
  if (!canvas || !ctx) return;
  const stage = canvas.parentElement;
  if (!stage) return;
  const rect = stage.getBoundingClientRect();
  const width = Math.max(320, Math.floor(rect.width || 960));
  const viewportHeight = Math.max(240, Math.floor(window.innerHeight || rect.height || Math.round(width * 0.56)));
  const height = viewportHeight;
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = "100vh";
  if (runtime.poseCanvasEl && runtime.poseCtx) {
    runtime.poseCanvasEl.width = Math.round(width * dpr);
    runtime.poseCanvasEl.height = Math.round(height * dpr);
    runtime.poseCanvasEl.style.width = `${width}px`;
    runtime.poseCanvasEl.style.height = "100vh";
    runtime.poseCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  runtime.viewWidth = width;
  runtime.viewHeight = height;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const threeState = runtime.three;
  if (threeState?.ready && threeState.renderer && threeState.camera) {
    threeState.renderer.setSize(width, height, false);
    threeState.camera.left = -width / 2;
    threeState.camera.right = width / 2;
    threeState.camera.top = height / 2;
    threeState.camera.bottom = -height / 2;
    threeState.camera.updateProjectionMatrix();
  }
}

function _lecturasGameCircleRectCollision(circle = null, rect = null) {
  if (!circle || !rect) return false;
  const cx = Number(circle.x || 0);
  const cy = Number(circle.y || 0);
  const r = Math.max(1, Number(circle.r || 0));
  const rx = Number(rect.x || 0);
  const ry = Number(rect.y || 0);
  const rw = Number(rect.width || 0);
  const rh = Number(rect.height || 0);
  const nearestX = Math.max(rx, Math.min(cx, rx + rw));
  const nearestY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nearestX;
  const dy = cy - nearestY;
  return (dx * dx + dy * dy) <= (r * r);
}

function _lecturasGameLineRectCollision(seg = null, rect = null) {
  if (!seg || !rect) return false;
  const x1 = Number(seg.ax || 0);
  const y1 = Number(seg.ay || 0);
  const x2 = Number(seg.bx || 0);
  const y2 = Number(seg.by || 0);
  const rx = Number(rect.x || 0);
  const ry = Number(rect.y || 0);
  const rw = Number(rect.width || 0);
  const rh = Number(rect.height || 0);
  const inside = (x, y) => x >= rx && x <= rx + rw && y >= ry && y <= ry + rh;
  if (inside(x1, y1) || inside(x2, y2)) return true;
  const edges = [
    { ax: rx, ay: ry, bx: rx + rw, by: ry },
    { ax: rx + rw, ay: ry, bx: rx + rw, by: ry + rh },
    { ax: rx + rw, ay: ry + rh, bx: rx, by: ry + rh },
    { ax: rx, ay: ry + rh, bx: rx, by: ry }
  ];
  const ccw = (ax, ay, bx, by, cx, cy) => (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
  const intersects = (a1, a2, b1, b2) => ccw(a1.x, a1.y, b1.x, b1.y, b2.x, b2.y) !== ccw(a2.x, a2.y, b1.x, b1.y, b2.x, b2.y)
    && ccw(a1.x, a1.y, a2.x, a2.y, b1.x, b1.y) !== ccw(a1.x, a1.y, a2.x, a2.y, b2.x, b2.y);
  const s1 = { x: x1, y: y1 };
  const s2 = { x: x2, y: y2 };
  return edges.some((edge) => intersects(s1, s2, { x: edge.ax, y: edge.ay }, { x: edge.bx, y: edge.by }));
}

function _lecturasGameGetWordCollisionRect(word = null, options = {}) {
  const x = Number(word?.x || 0);
  const y = Number(word?.y || 0);
  const width = Math.max(1, Number(word?.width || 0));
  const height = Math.max(1, Number(word?.height || 0));
  const mode = String(options?.mode || "touch");
  const isCorrect = !!word?.isCorrect;
  const hitWidthBase = Math.max(1, Number(word?.hitWidth || (width * 0.46)));
  const hitHeightBase = Math.max(1, Number(word?.hitHeight || (height * 0.48)));
  const padX = Math.max(12, Math.min(36, width * 0.17));
  const padY = Math.max(10, Math.min(30, height * 0.2));
  let hitWidth = Math.max(22, Math.min(width - (padX * 2), hitWidthBase));
  let hitHeight = Math.max(20, Math.min(height - (padY * 2), hitHeightBase));
  let scaleX = isCorrect ? 0.66 : 0.8;
  let scaleY = isCorrect ? 0.62 : 0.78;
  if (mode === "fireball") {
    scaleX *= isCorrect ? 0.78 : 0.9;
    scaleY *= isCorrect ? 0.76 : 0.9;
  }
  hitWidth = Math.max(18, Math.min(width - 6, hitWidth * scaleX));
  hitHeight = Math.max(18, Math.min(height - 6, hitHeight * scaleY));
  const baseY = y + ((height - hitHeight) * 0.5) + Math.max(6, Math.min(20, height * 0.16));
  return {
    x: x + ((width - hitWidth) / 2),
    y: Math.max(y + 3, Math.min(y + height - hitHeight - 3, baseY)),
    width: hitWidth,
    height: hitHeight
  };
}

function _lecturasGameGetWordActivationY(runtime = lecturasGameModeRuntime, nowMs = performance.now()) {
  const now = Number(nowMs || performance.now());
  const cachedAt = Number(runtime.wordActivationYUpdatedAt || 0);
  if ((now - cachedAt) < 90 && Number.isFinite(Number(runtime.wordActivationY))) {
    return Math.max(0, Number(runtime.wordActivationY || 0));
  }
  const canvasEl = runtime?.canvasEl || null;
  const stageTopEls = Array.isArray(runtime?.ui?.stageTopEls)
    ? runtime.ui.stageTopEls.filter((el) => el && !el.hidden && el.getClientRects().length > 0)
    : [];
  let activationY = 0;
  if (canvasEl && stageTopEls.length) {
    const canvasRect = canvasEl.getBoundingClientRect();
    const overlapBottom = stageTopEls.reduce((maxBottom, stageTopEl) => {
      const stageTopRect = stageTopEl.getBoundingClientRect();
      const candidate = Math.max(
        Number(canvasRect.top || 0),
        Math.min(Number(stageTopRect.bottom || 0), Number(canvasRect.bottom || 0))
      );
      return Math.max(maxBottom, candidate);
    }, Number(canvasRect.top || 0));
    const canvasHeightPx = Math.max(1, Number(canvasRect.height || runtime.viewHeight || 540));
    const scaleY = Math.max(0.001, Number(runtime.viewHeight || 540) / canvasHeightPx);
    const relPx = Math.max(0, overlapBottom - Number(canvasRect.top || 0));
    activationY = Math.max(0, Math.min(Number(runtime.viewHeight || 540), relPx * scaleY));
  }
  runtime.wordActivationY = activationY;
  runtime.wordActivationYUpdatedAt = now;
  return activationY;
}

function _lecturasGamePlayTone(freq = 440, ms = 120, type = "sine", gain = 0.08) {
  const runtime = lecturasGameModeRuntime;
  try {
    if (!runtime.audioCtx) runtime.audioCtx = new AudioContext();
    const now = runtime.audioCtx.currentTime;
    const osc = runtime.audioCtx.createOscillator();
    const amp = runtime.audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    amp.gain.setValueAtTime(gain, now);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(0.05, ms / 1000));
    osc.connect(amp);
    amp.connect(runtime.audioCtx.destination);
    osc.start(now);
    osc.stop(now + Math.max(0.06, ms / 1000));
  } catch (_) {
    // audio optional
  }
}

function _lecturasGamePlayHitSound() {
  _lecturasGamePlayTone(680, 90, "triangle", 0.07);
}

function _lecturasGamePlayWinSound() {
  _lecturasGamePlayTone(740, 120, "triangle", 0.07);
  setTimeout(() => _lecturasGamePlayTone(920, 140, "triangle", 0.07), 120);
}

function _lecturasGamePlayLoseSound() {
  _lecturasGamePlayTone(180, 170, "sawtooth", 0.08);
}

function _lecturasGamePlayRocketStartFx(runtime = lecturasGameModeRuntime) {
  _lecturasGameStartLevelTransitionFx(runtime, { force: true, amplitude: 19, durationMs: 460 });
  try {
    if (!runtime.audioCtx) runtime.audioCtx = new AudioContext();
    const ctx = runtime.audioCtx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(980, now + 0.22);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.32);
  } catch (_) {
    _lecturasGamePlayTone(220, 100, "square", 0.1);
    setTimeout(() => _lecturasGamePlayTone(820, 140, "square", 0.08), 60);
  }
}

function _lecturasGameSpawnHitParticles(word = null) {
  const runtime = lecturasGameModeRuntime;
  if (!word) return;
  const cx = Number(word.x || 0) + Number(word.width || 0) / 2;
  const cy = Number(word.y || 0) + Number(word.height || 0) / 2;
  const colors = ["#f8b400", "#4bd6ff", "#ff7a91", "#ffe26d"];
  for (let i = 0; i < 14; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 150;
    runtime.particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 2 + Math.random() * 5,
      life: 0,
      maxLife: 380 + Math.random() * 460,
      color: colors[Math.floor(Math.random() * colors.length)]
    });
  }
}

function _lecturasGameHandleLoseByCorrectHit(runtime = lecturasGameModeRuntime, source = "body") {
  runtime.touchedCorrect = true;
  _lecturasGameStopGameMusic(runtime, "lose-by-correct-hit");
  runtime.fireModeActive = false;
  runtime.fireModeUntilMs = 0;
  runtime.fireModeType = LECTURAS_GAME_POWERUP_TYPES.FIRE;
  runtime.powerup = null;
  runtime.bombChargeNorm = 0;
  runtime.bombChestHoldStartMs = 0;
  runtime.bombReadyUntilMs = 0;
  runtime.bombActivatedAtMs = 0;
  if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR) {
    LECTURAS_GAME_PAIR_SIDES.forEach((side) => {
      const sideState = _lecturasGameGetPairSideState(side, runtime);
      sideState.powerup = null;
      sideState.fireModeUntilMs = 0;
      sideState.fireModeType = LECTURAS_GAME_POWERUP_TYPES.FIRE;
      sideState.bombChargeNorm = 0;
      sideState.bombChestHoldStartMs = 0;
      sideState.bombReadyUntilMs = 0;
      sideState.bombActivatedAtMs = 0;
    });
  }
  runtime.fireballs = [];
  runtime.simFireCharging = false;
  runtime.simFireReleasePending = false;
  _lecturasGameResetHands(runtime);
  _lecturasGameApplyScoreDelta(-10, runtime);
  runtime.progress.rewardMessage = source === "fireball"
    ? `Tu fuego tocó "${runtime.round?.correctSynonym || "el sinónimo"}".`
    : `Tocaste "${runtime.round?.correctSynonym || "el sinónimo"}".`;
  _lecturasGamePlayLoseSound();
  _lecturasGameStopGameMusic(runtime, "lose-by-synonym");
  _lecturasGameSetMode(LECTURAS_GAME_MODE.LOST);
}

function _lecturasGameGetCurrentOrderPhrase(runtime = lecturasGameModeRuntime) {
  const phrases = Array.isArray(runtime?.round?.orderPhrases) ? runtime.round.orderPhrases : [];
  const idx = Math.max(0, Number(runtime?.round?.orderIndex || 0));
  return phrases[idx] || null;
}

function _lecturasGameBuildOrderPhraseColor(glowKey = "violet") {
  if (glowKey === "green") return "#5dff8a";
  if (glowKey === "orange") return "#ffb347";
  return "#b98cff";
}

function _lecturasGameGetOrderKaraokeIndex(phraseText = "", runtime = lecturasGameModeRuntime, nowMs = performance.now()) {
  void nowMs;
  const words = Array.isArray(runtime?.round?.orderPhraseWords)
    ? runtime.round.orderPhraseWords
    : String(phraseText || "").split(/\s+/g).map((item) => String(item || "").trim()).filter(Boolean);
  if (!words.length) return -1;
  if (runtime?.round?.orderTrapActive === true) return -1;
  const voice = runtime?.orderVoice || {};
  const speakable = Array.isArray(runtime?.round?.orderPhraseSpeakable) ? runtime.round.orderPhraseSpeakable : [];
  if (!speakable.length) return -1;
  const state = String(voice.state || "");
  const listeningLike = voice.listening === true
    || voice.starting === true
    || state === LECTURAS_GAME_ORDER_VOICE_STATE.LISTENING
    || state === LECTURAS_GAME_ORDER_VOICE_STATE.ARMING_MIC
    || state === LECTURAS_GAME_ORDER_VOICE_STATE.EVALUATING
    || state === LECTURAS_GAME_ORDER_VOICE_STATE.RETRY_PHRASE;
  let pointer = Math.max(0, Number(runtime?.round?.orderWordIndex || 0));
  const transcript = String(voice.lastTranscriptAll || voice.lastTranscript || "").trim();
  if (listeningLike && transcript) {
    const preview = _lecturasGameEvaluateOrderAttempt(transcript, speakable);
    pointer = Math.max(pointer, Number(preview?.matchedCount || 0));
  }
  if (pointer >= speakable.length) return Math.max(0, words.length - 1);
  return Number(speakable[Math.max(0, pointer)]?.displayIdx ?? 0);
}

function _lecturasGameBuildOrderPhraseHtml(phraseText = "", targetWord = "", glowKey = "violet", animVersion = 0, activeWordIndex = -1) {
  const phrase = String(phraseText || "").trim();
  const target = String(targetWord || "").trim();
  if (!phrase) return "";
  const targetNorm = _lecturasGameNormalizeWord(target);
  const runtime = lecturasGameModeRuntime;
  const words = Array.isArray(runtime?.round?.orderPhraseWords)
    ? runtime.round.orderPhraseWords
    : phrase.split(/\s+/g).map((item) => String(item || "").trim()).filter(Boolean);
  const states = Array.isArray(runtime?.round?.orderPhraseWordStates) ? runtime.round.orderPhraseWordStates : [];
  const wordCount = Math.max(1, words.length);
  const cycleMs = Math.max(2200, wordCount * 280);
  const htmlParts = [];
  words.forEach((word, idx) => {
    const rawWord = String(word || "");
    const leadPunct = (rawWord.match(/^[¡¿"“”«»„‟'‘’‚‛`´]+/u)?.[0] || "");
    const tailPunct = (rawWord.match(/[!?,.;:…¡¿"“”«»„‟'‘’‚‛`´]+$/u)?.[0] || "");
    const coreWord = rawWord
      .replace(/^[¡¿"“”«»„‟'‘’‚‛`´]+/u, "")
      .replace(/[!?,.;:…¡¿"“”«»„‟'‘’‚‛`´]+$/u, "");
    const isHit = _lecturasGameNormalizeWord(word) === targetNorm;
    const isActive = idx === Number(activeWordIndex);
    const isPast = Number(activeWordIndex) > 0 && idx < Number(activeWordIndex);
    const state = String(states[idx] || "pending");
    const delay = idx * 280;
    const punctHtml = (text = "") => text
      ? `<span class="lecturas-game-order-punct">${escapeHtml(text)}</span>`
      : "";
    const normalizedBody = coreWord.trim();
    const bodyHtml = normalizedBody
      ? `<span class="lecturas-game-order-word-core">${escapeHtml(normalizedBody)}</span>`
      : "";
    const punctuationOnlyHtml = !normalizedBody && rawWord
      ? `<span class="lecturas-game-order-word-tail">${punctHtml(rawWord)}</span>`
      : "";
    htmlParts.push(
      `<span class="lecturas-game-order-word${isHit ? " is-hit" : ""}${isActive ? " is-karaoke-active" : ""}${isPast ? " is-karaoke-past" : ""}${state === "correct" ? " is-correct" : ""}${state === "wrong" ? " is-wrong" : ""}" style="--lg-word-delay:${delay}ms;--lg-seed-ms:${Number(animVersion || 0) * 27}ms;--lg-word-cycle:${cycleMs}ms">${punctuationOnlyHtml || `${punctHtml(leadPunct)}${bodyHtml}${tailPunct ? `<span class="lecturas-game-order-word-tail">${punctHtml(tailPunct)}</span>` : ""}`}</span>`
    );
    if (idx < words.length - 1) htmlParts.push('<span class="lecturas-game-order-space">&nbsp;</span>');
  });
  const phraseColor = _lecturasGameBuildOrderPhraseColor(glowKey);
  return `<span class="lecturas-game-order-line glow-${escapeHtml(glowKey)}" style="--lg-order-glow:${phraseColor}">${htmlParts.join("")}</span>`;
}

function _lecturasGameRenderOrderPhraseUi(runtime = lecturasGameModeRuntime) {
  const ui = runtime?.ui || {};
  if (!ui.orderPhraseWrap || !ui.orderPhraseText) return;
  const isOrder = _lecturasGameIsOrderChallenge(runtime);
  const mode = String(runtime?.mode || "");
  const phrase = _lecturasGameGetCurrentOrderPhrase(runtime);
  const shouldShow = isOrder && !!phrase && (mode === LECTURAS_GAME_MODE.INSTRUCTION || mode === LECTURAS_GAME_MODE.COUNTDOWN || mode === LECTURAS_GAME_MODE.PLAYING);
  ui.orderPhraseWrap.hidden = !shouldShow;
  if (!shouldShow) return;
  const now = Number(performance.now() || Date.now());
  const voiceState = String(runtime?.orderVoice?.state || LECTURAS_GAME_ORDER_VOICE_STATE.IDLE);
  const listening = runtime?.orderVoice?.listening === true;
  const starting = runtime?.orderVoice?.starting === true;
  const manualRetry = runtime?.orderVoice?.manualRetryRequired === true;
  const trapActive = runtime?.round?.orderTrapActive === true;
  const countdownLeft = _lecturasGameGetOrderCountdownRemaining(runtime, now);
  ui.orderPhraseWrap.classList.toggle("is-countdown", countdownLeft > 0 && !trapActive && !listening && !starting);
  const karaokeIndex = _lecturasGameGetOrderKaraokeIndex(phrase.text, runtime, now);
  ui.orderPhraseText.innerHTML = _lecturasGameBuildOrderPhraseHtml(
    phrase.text,
    phrase.targetWord,
    String(runtime?.round?.orderPhraseGlow || "violet"),
    Number(runtime?.round?.orderPhraseAnimVersion || 0),
    karaokeIndex
  );
  if (ui.orderPhraseLabel) {
    ui.orderPhraseLabel.textContent = trapActive
      ? "Atrapala"
      : (manualRetry || voiceState === LECTURAS_GAME_ORDER_VOICE_STATE.MIC_MANUAL_RETRY ? "Reintenta micrófono"
        : (voiceState === LECTURAS_GAME_ORDER_VOICE_STATE.COUNTDOWN ? `${Math.max(1, countdownLeft || 3)}`
          : (voiceState === LECTURAS_GAME_ORDER_VOICE_STATE.ARMING_MIC || starting ? "Activando micrófono..."
            : (voiceState === LECTURAS_GAME_ORDER_VOICE_STATE.READY_TO_LISTEN ? "Hablar ahora"
              : (voiceState === LECTURAS_GAME_ORDER_VOICE_STATE.EVALUATING ? "Validando..."
                : (voiceState === LECTURAS_GAME_ORDER_VOICE_STATE.RETRY_PHRASE ? "Repite la frase"
                  : (listening ? "Habla ahora" : "Listo")))))));
  }
  if (ui.micBtn) {
    const demoPending = runtime?.orderDemo?.awaitingPlayback === true || runtime?.orderDemo?.playing === true;
    const showManualMicBtn = mode === LECTURAS_GAME_MODE.PLAYING
      && !trapActive
      && !demoPending
      && (
        manualRetry
        || voiceState === LECTURAS_GAME_ORDER_VOICE_STATE.MIC_MANUAL_RETRY
        || voiceState === LECTURAS_GAME_ORDER_VOICE_STATE.READY_TO_LISTEN
      );
    ui.micBtn.hidden = !showManualMicBtn;
    ui.micBtn.disabled = starting || listening || countdownLeft > 0 || !runtime?.orderVoice?.supported;
    ui.micBtn.textContent = manualRetry
      ? "Reintentar micrófono"
      : "Hablar ahora";
  }
}

function _lecturasGameRenderOrderDemoPanel(runtime = lecturasGameModeRuntime) {
  const ui = runtime?.ui || {};
  if (!ui.orderDemoPanel) return;
  const isOrder = _lecturasGameIsOrderChallenge(runtime);
  const phrase = _lecturasGameGetCurrentOrderPhrase(runtime);
  ui.orderDemoPanel.hidden = !(isOrder && phrase);
  if (!isOrder || !phrase) return;
  const cover = String(resolveLecturaCoverImage(runtime?.lectura || {}) || "").trim();
  const demo = runtime.orderDemo || {};
  const phrases = Array.isArray(runtime?.round?.orderPhrases) ? runtime.round.orderPhrases : [];
  const currentIndex = Math.max(0, Number(runtime?.round?.orderIndex || 0));
  if (ui.orderDemoMedia) {
    ui.orderDemoMedia.classList.toggle("is-empty", !cover);
    ui.orderDemoMedia.style.backgroundImage = cover ? `url("${cover.replace(/"/g, '\\"')}")` : "";
  }
  if (ui.orderDemoMediaState) {
    ui.orderDemoMediaState.innerHTML = cover ? "" : "<span>Imagen no disponible</span>";
  }
  if (ui.orderDemoPhrase) ui.orderDemoPhrase.textContent = String(phrase.text || "");
  if (ui.orderPrevBtn) ui.orderPrevBtn.disabled = currentIndex <= 0 || demo.playing === true;
  if (ui.orderNextBtn) ui.orderNextBtn.disabled = currentIndex >= Math.max(0, phrases.length - 1) || demo.playing === true;
  if (ui.orderDemoBtn) {
    const trapActive = runtime?.round?.orderTrapActive === true;
    const countdownLeft = _lecturasGameGetOrderCountdownRemaining(runtime, performance.now());
    ui.orderDemoBtn.disabled = demo.playing === true || trapActive || countdownLeft > 0;
    ui.orderDemoBtn.textContent = demo.playing === true
      ? "Reproduciendo ejemplo..."
      : "Escuchar lectura";
  }
  if (ui.orderDemoHint) {
    ui.orderDemoHint.textContent = demo.lastError
      ? "No se pudo reproducir el ejemplo. Intenta otra vez."
      : (demo.completed === true
        ? "Ejemplo completado. La frase ya puede dictarse en el panel derecho."
        : "Reproduce el ejemplo. Cuando termine, el panel derecho arrancará con 3, 2, 1.");
  }
}

function _lecturasGameSpawnOrderFlyingWord(runtime = lecturasGameModeRuntime) {
  if (!_lecturasGameIsOrderChallenge(runtime)) return false;
  const phrase = _lecturasGameGetCurrentOrderPhrase(runtime);
  const target = String(phrase?.targetWord || runtime?.round?.correctSynonym || "").trim();
  if (!target) return false;
  (runtime.words || []).forEach((word) => _lecturasGameRemoveBalloonMesh(word, runtime));
  const width = Math.max(180, _lecturasGameMeasureWordWidth(runtime, target));
  const height = Math.max(104, Math.round(width * 0.3));
  runtime.words = [{
    id: `lgw_order_trap_${Date.now()}`,
    text: target,
    isCorrect: true,
    x: Math.random() * Math.max(20, runtime.viewWidth - width - 20),
    y: Math.random() * Math.max(20, runtime.viewHeight - height - 120) + 60,
    width,
    height,
    hitWidth: Math.max(66, Math.min(width * 0.52, width - 42)),
    hitHeight: Math.max(42, Math.min(height * 0.56, height - 20)),
    vy: (Math.random() > 0.5 ? 1 : -1) * (320 + Math.random() * 220),
    vx: (Math.random() > 0.5 ? 1 : -1) * (340 + Math.random() * 240),
    orderFlying: true,
    side: runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR ? (Math.random() > 0.5 ? "right" : "left") : "",
    active: true
  }];
  runtime.removedWrongCount = 0;
  runtime.totalWrongCount = 1;
  runtime.silhouette = {
    ...(runtime.silhouette || {}),
    enabled: true,
    preferReal: true,
    proceduralFallback: true,
    debugShowSkeleton: true
  };
  if (!_lecturasGameHasPoseData(runtime?.pose) && runtime.allowSimulatedPose) {
    runtime.useSimulatedPose = true;
    runtime.cameraStatus = "Modo captura: esqueleto y nodos activos";
  }
  return true;
}

function _lecturasGameStopOrderSpeech(runtime = lecturasGameModeRuntime, options = {}) {
  const voice = runtime?.orderVoice || {};
  const recognition = voice.recognition || null;
  const restoreAudio = options?.restoreAudio !== false;
  if (voice.autoStopTimer) {
    clearTimeout(voice.autoStopTimer);
    voice.autoStopTimer = 0;
  }
  if (recognition && (voice.listening || voice.starting)) {
    voice.skipNextOnEnd = true;
    try { recognition.stop(); } catch (_) { }
  }
  voice.recognition = null;
  voice.starting = false;
  voice.listening = false;
  voice.recoveryInFlight = false;
  voice.listeningSince = 0;
  voice.countdownStartAt = 0;
  voice.countdownUntilMs = 0;
  if (voice.attempt && !voice.attempt.endedAt) {
    voice.attempt.endedAt = Number(performance.now() || Date.now());
  }
  _lecturasGameStopOrderProsodyCapture(runtime);
  if (restoreAudio) {
    _lecturasGameSetOrderReadingAudioState(false, runtime);
    _lecturasGameSetGameMusicDucking(false, runtime);
  }
}

function _lecturasGameStartOrderReadFlow(runtime = lecturasGameModeRuntime, options = {}) {
  if (!_lecturasGameIsOrderChallenge(runtime)) return;
  const voice = runtime.orderVoice || (runtime.orderVoice = {});
  voice.state = LECTURAS_GAME_ORDER_VOICE_STATE.READY_TO_LISTEN;
  voice.manualRetryRequired = false;
  voice.recoveryInFlight = false;
  voice.resetSamePhraseAt = 0;
  voice.promptVersion = Number(voice.promptVersion || 0) + 1;
  voice.nextAutoStartAt = 0;
  voice.validationGraceUntilMs = 0;
  voice.countdownStartAt = 0;
  voice.countdownUntilMs = 0;
  voice.attempt = _lecturasGameCreateOrderVoiceAttempt(runtime?.round?.orderPhraseSpeakable || [], voice);
  if (voice.attempt) voice.attempt.status = "ready";
  voice.lastTransition = "ORDER_READY_TO_LISTEN";
  voice.lastTransitionAt = Number(performance.now() || Date.now());
  runtime.progress.rewardMessage = "Toca \"Hablar ahora\" y pronuncia la frase completa.";
  _lecturasGameSetOrderReadingAudioState(true, runtime);
  _lecturasGameSetGameMusicDucking(false, runtime);
  const campaign = runtime.readingCampaign || (runtime.readingCampaign = {});
  campaign.idleSinceMs = Number(performance.now() || Date.now());
  _lecturasGameRenderOrderPhraseUi(runtime);
  if (options?.autoStartMic === true && runtime.mode === LECTURAS_GAME_MODE.PLAYING) {
    voice.state = LECTURAS_GAME_ORDER_VOICE_STATE.ARMING_MIC;
    voice.lastTransition = "ORDER_MIC_ARMING";
    voice.lastTransitionAt = Number(performance.now() || Date.now());
    Promise.resolve(_lecturasGameStartOrderSpeech(runtime, { manual: true }))
      .catch(() => false)
      .finally(() => {
        _lecturasGameRenderOrderPhraseUi(runtime);
      });
  }
}

function _lecturasGameGetOrderCountdownRemaining(runtime = lecturasGameModeRuntime, nowMs = performance.now()) {
  const voice = runtime?.orderVoice || {};
  const startAt = Number(voice.countdownStartAt || 0);
  const until = Number(voice.countdownUntilMs || 0);
  const now = Number(nowMs || performance.now());
  if (!until || now < startAt || now >= until) return 0;
  return Math.max(1, Math.ceil((until - now) / 1000));
}

function _lecturasGameIsOrderFocusActive(runtime = lecturasGameModeRuntime, nowMs = performance.now()) {
  if (!_lecturasGameIsOrderChallenge(runtime)) return false;
  if (runtime?.round?.orderTrapActive === true) return false;
  const voice = runtime?.orderVoice || {};
  const countdown = _lecturasGameGetOrderCountdownRemaining(runtime, nowMs) > 0;
  const state = String(voice.state || "");
  return countdown
    || voice.listening === true
    || voice.starting === true
    || state === LECTURAS_GAME_ORDER_VOICE_STATE.READY_TO_LISTEN
    || state === LECTURAS_GAME_ORDER_VOICE_STATE.ARMING_MIC
    || state === LECTURAS_GAME_ORDER_VOICE_STATE.EVALUATING;
}

async function _lecturasGamePrimeMicrophonePermission(runtime = lecturasGameModeRuntime) {
  if (!_lecturasGameIsOrderChallenge(runtime)) return false;
  const mainAudioTracks = (runtime?.stream?.getAudioTracks?.() || []).filter((track) => track?.readyState === "live");
  if (mainAudioTracks.length) return true;
  if (!navigator?.mediaDevices?.getUserMedia) return false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    (stream?.getTracks?.() || []).forEach((track) => {
      try { track.stop(); } catch (_) { }
    });
    runtime.cameraStatus = "Micrófono activo para lectura";
    return true;
  } catch (_) {
    runtime.cameraStatus = "Micrófono no disponible";
    return false;
  }
}

function _lecturasGameSummarizeOrderAttempt(evaluation = null) {
  const correctWords = Math.max(0, Number(evaluation?.matchedCount || 0));
  const spokenCount = Math.max(0, Number(evaluation?.spokenCount || 0));
  const wrongWords = Math.max(0, spokenCount - correctWords);
  return { correctWords, wrongWords };
}

function _lecturasGameAnnounceOrderPhraseScore(correctWords = 0, wrongWords = 0, runtime = lecturasGameModeRuntime) {
  const synth = window?.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === "undefined") return false;
  const ok = Math.max(0, Number(correctWords || 0));
  const wrong = Math.max(0, Number(wrongWords || 0));
  const message = `${ok} palabra${ok === 1 ? "" : "s"} bien y ${wrong} palabra${wrong === 1 ? "" : "s"} mal.`;
  runtime.orderVoice = runtime.orderVoice || {};
  const prev = runtime.orderVoice.resultUtterance || null;
  try {
    if (prev) prev.onend = prev.onerror = null;
  } catch (_) { }
  try { synth.cancel(); } catch (_) { }
  const utter = new SpeechSynthesisUtterance(message);
  utter.lang = "es-MX";
  utter.rate = 0.96;
  utter.pitch = 1.03;
  utter.volume = 1;
  runtime.orderVoice.resultUtterance = utter;
  utter.onend = utter.onerror = () => {
    if (runtime?.orderVoice?.resultUtterance === utter) runtime.orderVoice.resultUtterance = null;
  };
  try {
    synth.speak(utter);
    return true;
  } catch (_) {
    if (runtime?.orderVoice?.resultUtterance === utter) runtime.orderVoice.resultUtterance = null;
    return false;
  }
}

function _lecturasGameSpeakOrderDemoFallback(text = "", callbacks = {}) {
  const synth = window?.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === "undefined") return false;
  const phrase = String(text || "").replace(/\s+/g, " ").trim();
  if (!phrase) return false;
  const utter = new SpeechSynthesisUtterance(phrase);
  utter.lang = "es-MX";
  utter.rate = 0.92;
  utter.pitch = 1.0;
  utter.volume = 1;
  utter.onstart = () => {
    if (typeof callbacks?.onPlaybackStart === "function") callbacks.onPlaybackStart();
  };
  utter.onend = () => {
    if (typeof callbacks?.onPlaybackEnd === "function") callbacks.onPlaybackEnd();
  };
  utter.onerror = (err) => {
    if (typeof callbacks?.onPlaybackError === "function") callbacks.onPlaybackError(err);
  };
  try {
    synth.cancel();
    synth.speak(utter);
    return true;
  } catch (_) {
    return false;
  }
}

function _lecturasGameFinishOrderDemoPlayback(runtime = lecturasGameModeRuntime, runId = 0) {
  if (Number(runtime?.orderDemo?.runId || 0) !== Number(runId || 0)) return;
  if (runtime?.orderDemo?.pollTimerId) {
    clearTimeout(runtime.orderDemo.pollTimerId);
    runtime.orderDemo.pollTimerId = 0;
  }
  runtime.orderDemo.playing = false;
  runtime.orderDemo.awaitingPlayback = false;
  runtime.orderDemo.completed = true;
  runtime.orderDemo.lastError = "";
  runtime.progress.rewardMessage = "Lectura terminada. Prepárate para 3, 2, 1.";
  _lecturasGameRenderOrderPhraseUi(runtime);
  _lecturasGameRenderOrderDemoPanel(runtime);
  const settleMs = Math.max(220, Math.min(900, _geminiLivePendingPlaybackMs() + 260));
  runtime.orderDemo.pollTimerId = window.setTimeout(() => {
    if (Number(runtime?.orderDemo?.runId || 0) !== Number(runId || 0)) return;
    runtime.orderDemo.pollTimerId = 0;
    if (runtime?.orderDemo?.playing === true) return;
    _lecturasGameBeginOrderCountdown(runtime, "ORDER_COUNTDOWN_AFTER_DEMO");
    _lecturasGameRenderOrderDemoPanel(runtime);
  }, settleMs);
}

function _lecturasGameApplyOrderNoviceWordStates(runtime = lecturasGameModeRuntime, evaluation = null) {
  if (!_lecturasGameIsOrderChallenge(runtime) || !runtime?.round) return;
  const phraseWords = Array.isArray(runtime.round.orderPhraseWords) ? runtime.round.orderPhraseWords : [];
  const states = phraseWords.map(() => "pending");
  const expectedWords = Array.isArray(evaluation?.expectedWords) ? evaluation.expectedWords : [];
  const spokenWords = Array.isArray(evaluation?.normalizedSpokenWords) ? evaluation.normalizedSpokenWords : [];
  const limit = Math.min(expectedWords.length, spokenWords.length);
  let correctWords = 0;
  let wrongWords = 0;
  for (let i = 0; i < limit; i += 1) {
    const expected = expectedWords[i];
    const displayIdx = Number(expected?.displayIdx ?? i);
    if (!(displayIdx >= 0 && displayIdx < states.length)) continue;
    if (_lecturasGameStrictOrderWordMatch(spokenWords[i], expected?.norm || "")) {
      states[displayIdx] = "correct";
      correctWords += 1;
    } else {
      states[displayIdx] = "wrong";
      wrongWords += 1;
    }
  }
  runtime.round.orderPhraseWordStates = states;
  runtime.round.orderWordIndex = correctWords;
  runtime.round.orderActiveDisplayIndex = Math.max(0, states.findIndex((item) => item === "wrong"));
  if (runtime.round.orderActiveDisplayIndex < 0 || Number.isNaN(runtime.round.orderActiveDisplayIndex)) {
    runtime.round.orderActiveDisplayIndex = Number(expectedWords[Math.min(correctWords, Math.max(0, expectedWords.length - 1))]?.displayIdx ?? 0);
  }
  runtime.round.orderSpeechPrimed = spokenWords.length > 0;
  runtime.round.orderHasHardMismatch = wrongWords > 0;
}

function _lecturasGameHandleOrderSpeechNoviceResolution(transcript = "", evaluation = null, runtime = lecturasGameModeRuntime) {
  if (!_lecturasGameIsOrderChallenge(runtime) || !runtime?.round) return false;
  const spoken = String(transcript || "").trim();
  const summary = _lecturasGameSummarizeOrderAttempt(evaluation);
  _lecturasGameApplyOrderNoviceWordStates(runtime, evaluation);
  _lecturasGameStopOrderSpeech(runtime);
  const now = Number(performance.now() || Date.now());
  runtime.orderVoice.state = LECTURAS_GAME_ORDER_VOICE_STATE.SUCCESS;
  runtime.orderVoice.lastTransition = "ORDER_ATTEMPT_NOVICE_PARTIAL";
  runtime.orderVoice.lastTransitionAt = now;
  runtime.orderVoice.lastTranscript = spoken;
  runtime.orderVoice.lastValidation = "partial";
  runtime.orderVoice.starting = false;
  runtime.orderVoice.nextAutoStartAt = 0;
  runtime.orderVoice.resetSamePhraseAt = 0;
  runtime.orderVoice.countdownStartAt = 0;
  runtime.orderVoice.countdownUntilMs = 0;
  runtime.round.orderTrapActive = false;
  runtime.round.orderLastReadResult = "partial";
  runtime.round.orderSpeechPrimed = false;
  const campaign = runtime.readingCampaign || (runtime.readingCampaign = {});
  campaign.perfectRun = false;
  campaign.consecutivePronunciationErrors = 0;
  campaign.idleSinceMs = 0;
  campaign.pronouncedCorrectWords = Math.max(0, Number(campaign.pronouncedCorrectWords || 0)) + summary.correctWords;
  campaign.pronouncedWrongWords = Math.max(0, Number(campaign.pronouncedWrongWords || 0)) + summary.wrongWords;
  if (runtime.orderVoice?.attempt) {
    runtime.orderVoice.attempt.status = "resolved_partial";
    runtime.orderVoice.attempt.endedAt = now;
    runtime.orderVoice.attempt.resolvedAt = now;
    runtime.orderVoice.attempt.finalTranscript = spoken;
    runtime.orderVoice.attempt.cursor = Math.max(0, Number(evaluation?.matchedCount || 0));
    runtime.orderVoice.attempt.mismatchIndex = Number(evaluation?.mismatchIndex ?? -1);
    runtime.orderVoice.attempt.spokenWords = Array.isArray(evaluation?.normalizedSpokenWords) ? [...evaluation.normalizedSpokenWords] : [];
  }
  runtime.progress.rewardMessage = `Novato: ${summary.correctWords} bien, ${summary.wrongWords} mal. Atrapa "${runtime.round?.correctSynonym || ""}".`;
  _lecturasGameAnnounceOrderPhraseScore(summary.correctWords, summary.wrongWords, runtime);
  _lecturasGameSetMode(LECTURAS_GAME_MODE.PLAYING);
  const rainStarted = _lecturasGameStartOrderRainPhase(runtime);
  if (rainStarted) {
    _lecturasGameSetOrderReadingAudioState(false, runtime);
    Promise.resolve(_lecturasGameStartGameMusicForLevel(runtime, { restart: false, play: true })).catch(() => { });
  }
  return true;
}

function _lecturasGameHandleOrderSpeechFailure(transcript = "", runtime = lecturasGameModeRuntime) {
  if (!_lecturasGameIsOrderChallenge(runtime) || !runtime?.round) return;
  _lecturasGameStopOrderSpeech(runtime);
  const now = Number(performance.now() || Date.now());
  runtime.orderVoice.state = LECTURAS_GAME_ORDER_VOICE_STATE.RETRY_PHRASE;
  runtime.orderVoice.lastTransition = "ORDER_ATTEMPT_RETRY";
  runtime.orderVoice.lastTransitionAt = now;
  runtime.orderVoice.lastTranscript = String(transcript || "").trim();
  runtime.orderVoice.lastValidation = "no-match";
  runtime.orderVoice.starting = false;
  runtime.orderVoice.nextAutoStartAt = 0;
  runtime.orderVoice.resetSamePhraseAt = now + LECTURAS_GAME_ORDER_FAILURE_FEEDBACK_MS;
  runtime.round.orderTrapActive = false;
  runtime.round.orderLastReadResult = "incorrect";
  runtime.progress.rewardMessage = "Lectura incorrecta. Repite la frase completa.";
  runtime.orderVoice.countdownStartAt = 0;
  runtime.orderVoice.countdownUntilMs = 0;
  runtime.orderVoice.processedWordCount = 0;
  runtime.orderVoice.lastTranscriptAll = "";
  runtime.round.orderSpeechPrimed = false;
  _lecturasGameClearAllWordEntities(runtime);
  if (runtime.orderVoice?.attempt) {
    runtime.orderVoice.attempt.status = "resolved_failure";
    runtime.orderVoice.attempt.endedAt = now;
    runtime.orderVoice.attempt.resolvedAt = now;
    runtime.orderVoice.attempt.finalTranscript = String(transcript || "").trim();
  }
  const campaign = runtime.readingCampaign || (runtime.readingCampaign = {});
  campaign.perfectRun = false;
  campaign.consecutivePronunciationErrors = Math.max(0, Number(campaign.consecutivePronunciationErrors || 0)) + 1;
  campaign.idleSinceMs = now;
  if (campaign.consecutivePronunciationErrors >= LECTURAS_GAME_ORDER_MAX_CONSECUTIVE_ERRORS) {
    runtime.progress.rewardMessage = `Perdiste: ${LECTURAS_GAME_ORDER_MAX_CONSECUTIVE_ERRORS} errores consecutivos de pronunciación. Puedes continuar la partida con ${LECTURAS_GAME_CONTINUE_PARTIDA_GEMS_COST} gema.`;
    runtime.orderVoice.resetSamePhraseAt = 0;
    _lecturasGameHandleOrderLoseByReason("lost_by_errors", runtime);
    return;
  }
  _lecturasGamePlayRocketStartFx(runtime);
  _lecturasGamePlayLoseSound();
  _lecturasGameSetMode(LECTURAS_GAME_MODE.PLAYING);
  _lecturasGameRenderOrderPhraseUi(runtime);
}

function _lecturasGameTryAdvanceOrderPhrase(runtime = lecturasGameModeRuntime) {
  if (!_lecturasGameIsOrderChallenge(runtime) || !runtime?.round) return false;
  const speakable = Array.isArray(runtime.round.orderPhraseSpeakable) ? runtime.round.orderPhraseSpeakable : [];
  const idx = Math.max(0, Number(runtime.round.orderWordIndex || 0));
  if (idx < speakable.length) return false;
  runtime.round.orderIndex = Math.max(0, Number(runtime.round.orderIndex || 0)) + 1;
  const campaign = runtime.readingCampaign || (runtime.readingCampaign = {});
  campaign.readingCursor = Math.max(0, Number(runtime.round.orderIndex || 0));
  campaign.idleSinceMs = 0;
  if (!_lecturasGameApplyOrderStageWords(runtime)) {
    _lecturasGameFinalizeOrderCampaignWin(runtime);
    return true;
  }
  if (_lecturasGameMaybeOpenOrderCheckpointQuiz(runtime)) return true;
  runtime.progress.rewardMessage = "Continúa con la siguiente frase.";
  _lecturasGameQueueOrderSpeech(runtime);
  _lecturasGameSetMode(LECTURAS_GAME_MODE.PLAYING);
  return true;
}

function _lecturasGameConsumeOrderSpeechWords(transcript = "", runtime = lecturasGameModeRuntime, options = {}) {
  if (!_lecturasGameIsOrderChallenge(runtime) || !runtime?.round) return { failed: false };
  const speakable = Array.isArray(runtime.round.orderPhraseSpeakable) ? runtime.round.orderPhraseSpeakable : [];
  const evaluation = _lecturasGameEvaluateOrderAttempt(transcript, speakable);
  _lecturasGameApplyOrderAttemptProgress(runtime, evaluation, { commitWrong: options?.commitWrong === true });
  runtime.orderVoice.lastTranscript = String(transcript || "").trim();
  if (runtime.orderVoice?.attempt) {
    runtime.orderVoice.attempt.finalTranscript = String(transcript || "").trim();
  }
  return {
    failed: Number(evaluation?.mismatchIndex ?? -1) >= 0,
    mismatchDisplayIdx: Number(evaluation?.mismatchIndex ?? -1),
    evaluation
  };
}

function _lecturasGameHandleOrderSpeechSuccess(transcript = "", runtime = lecturasGameModeRuntime, options = {}) {
  if (!_lecturasGameIsOrderChallenge(runtime) || !runtime?.round) return;
  _lecturasGameResetOrderSpeechRetryState(runtime);
  runtime.orderVoice.state = LECTURAS_GAME_ORDER_VOICE_STATE.EVALUATING;
  runtime.orderVoice.lastTransition = "ORDER_ATTEMPT_EVALUATING";
  runtime.orderVoice.lastTransitionAt = Number(performance.now() || Date.now());
  runtime.orderVoice.lastValidation = "ok";
  runtime.orderVoice.starting = false;
  runtime.round.orderTrapActive = false;
  runtime.round.orderLastReadResult = "ok";
  runtime.orderVoice.countdownStartAt = 0;
  runtime.orderVoice.countdownUntilMs = 0;
  return _lecturasGameConsumeOrderSpeechWords(transcript, runtime, options);
}

function _lecturasGameBuildOrderRainWords(runtime = lecturasGameModeRuntime) {
  const phrase = _lecturasGameGetCurrentOrderPhrase(runtime);
  const target = _lecturasGameNormalizeWord(String(phrase?.targetWord || runtime?.round?.correctSynonym || "").trim());
  if (!target) return [];
  const level = Math.max(1, Number(runtime?.progress?.level || 1));
  const wrongCount = Math.max(8, Math.min(24, 8 + (level * 2)));
  const pool = new Set();
  const phraseWords = (String(phrase?.text || "").split(/\s+/g) || [])
    .map((w) => _lecturasGameNormalizeWord(w))
    .filter((w) => w && w !== target);
  phraseWords.forEach((w) => pool.add(w));
  const narrative = _lecturasGameExtractNarrativeWordPool(
    String(runtime?.lectura?.htmlLectura || runtime?.lectura?.raw?.contenidoHTML || ""),
    3
  )
    .map((w) => _lecturasGameNormalizeWord(w))
    .filter((w) => w && w !== target);
  narrative.forEach((w) => pool.add(w));
  if (pool.size < wrongCount) {
    Object.keys(LECTURAS_GAME_FALLBACK_SYNONYM_BANK || {}).forEach((w) => {
      const clean = _lecturasGameNormalizeWord(w);
      if (clean && clean !== target) pool.add(clean);
    });
  }
  const distractors = _lecturasGameShuffle(Array.from(pool)).slice(0, wrongCount);
  return _lecturasGameShuffle([target, ...distractors]);
}

function _lecturasGameStartOrderRainPhase(runtime = lecturasGameModeRuntime) {
  if (!_lecturasGameIsOrderChallenge(runtime) || !runtime?.round) return false;
  if (!runtime.cameraReady) {
    Promise.resolve(_lecturasGameStartCamera(runtime))
      .then((ok) => {
        if (!ok) {
          runtime.progress.rewardMessage = "No se pudo activar la cámara para atrapar palabras.";
          _lecturasGameSetMode(runtime.mode);
        }
      })
      .catch(() => {
        runtime.progress.rewardMessage = "No se pudo activar la cámara para atrapar palabras.";
        _lecturasGameSetMode(runtime.mode);
      });
  }
  const rainWords = _lecturasGameBuildOrderRainWords(runtime);
  if (!rainWords.length) return false;
  runtime.round.orderTrapActive = true;
  runtime.round.words = rainWords;
  runtime.round.distractors = rainWords.filter((w) => _lecturasGameNormalizeWord(w) !== _lecturasGameNormalizeWord(runtime.round?.correctSynonym || ""));
  runtime.removedWrongCount = 0;
  runtime.totalWrongCount = runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR
    ? (Math.max(0, rainWords.length - 1) * 2)
    : Math.max(0, rainWords.length - 1);
  _lecturasGameCreateWordEntities(runtime);
  return true;
}

function _lecturasGameFinalizeOrderSpeechAttempt(runtime = lecturasGameModeRuntime, transcript = "") {
  if (!_lecturasGameIsOrderChallenge(runtime) || !runtime?.round || runtime?.round?.orderTrapActive === true) return false;
  const voice = runtime.orderVoice || (runtime.orderVoice = {});
  const attempt = voice.attempt || (voice.attempt = _lecturasGameCreateOrderVoiceAttempt(runtime?.round?.orderPhraseSpeakable || [], voice));
  if (attempt.status === "resolved_success" || attempt.status === "resolved_failure" || attempt.status === "resolved_partial") return true;
  const spoken = String(transcript || voice.lastFinalTranscript || voice.lastTranscriptAll || voice.lastTranscript || "").trim();
  attempt.finalTranscript = spoken;
  const evaluation = _lecturasGameEvaluateOrderAttempt(spoken, attempt.expectedWords);
  _lecturasGameApplyOrderAttemptProgress(runtime, evaluation, { commitWrong: false });
  if (!spoken) {
    attempt.status = "waiting";
    return false;
  }
  if (evaluation.success) {
    const now = Number(performance.now() || Date.now());
    _lecturasGameApplyOrderAttemptProgress(runtime, evaluation, { commitWrong: false });
    _lecturasGameStopOrderSpeech(runtime);
    voice.state = LECTURAS_GAME_ORDER_VOICE_STATE.SUCCESS;
    voice.lastTransition = "ORDER_ATTEMPT_SUCCESS";
    voice.lastTransitionAt = now;
    voice.lastValidation = "ok";
    voice.lastRejectReason = "";
    voice.spellRetryCount = 0;
    runtime.round.orderLastReadResult = "ok";
    attempt.status = "resolved_success";
    attempt.cursor = Number(evaluation.matchedCount || 0);
    attempt.mismatchIndex = -1;
    attempt.spokenWords = Array.isArray(evaluation.normalizedSpokenWords) ? [...evaluation.normalizedSpokenWords] : [];
    attempt.endedAt = now;
    attempt.resolvedAt = now;
    const campaign = runtime.readingCampaign || (runtime.readingCampaign = {});
    campaign.consecutivePronunciationErrors = 0;
    campaign.idleSinceMs = 0;
    _lecturasGameAnnounceOrderPhraseScore(Number(evaluation.matchedCount || 0), 0, runtime);
    runtime.progress.rewardMessage = `Bien leído. Atrapa "${runtime.round?.correctSynonym || ""}".`;
    _lecturasGameSetMode(LECTURAS_GAME_MODE.PLAYING);
    const rainStarted = _lecturasGameStartOrderRainPhase(runtime);
    if (rainStarted) {
      _lecturasGameSetOrderReadingAudioState(false, runtime);
      Promise.resolve(_lecturasGameStartGameMusicForLevel(runtime, { restart: false, play: true })).catch(() => { });
    }
    return true;
  }
  if (Number(evaluation.mismatchIndex ?? -1) >= 0) {
    const noviceMode = _lecturasGameGetOrderDifficulty(runtime) === LECTURAS_GAME_ORDER_DIFFICULTY.NOVICE;
    const penalized = Array.isArray(runtime.round.orderPhrasePenalized)
      ? runtime.round.orderPhrasePenalized
      : (runtime.round.orderPhraseWords || []).map(() => false);
    const mismatchDisplayIdx = Number(evaluation.mismatchIndex || 0);
    if (!noviceMode && !penalized[mismatchDisplayIdx]) {
      penalized[mismatchDisplayIdx] = true;
      _lecturasGameApplyScoreDelta(-6, runtime);
    }
    runtime.round.orderPhrasePenalized = penalized;
    _lecturasGameApplyOrderAttemptProgress(runtime, evaluation, { commitWrong: true });
    voice.lastRejectReason = "strict_word_mismatch";
    if (noviceMode) {
      return _lecturasGameHandleOrderSpeechNoviceResolution(spoken, evaluation, runtime);
    }
    _lecturasGameHandleOrderSpeechFailure(spoken, runtime);
    return true;
  }
  attempt.status = "waiting";
  attempt.cursor = Number(evaluation.matchedCount || 0);
  attempt.mismatchIndex = -1;
  attempt.spokenWords = Array.isArray(evaluation.normalizedSpokenWords) ? [...evaluation.normalizedSpokenWords] : [];
  return false;
}

async function _lecturasGameStartOrderSpeech(runtime = lecturasGameModeRuntime, options = {}) {
  const allowCountdown = options?.allowCountdown === true;
  if (!_lecturasGameIsOrderChallenge(runtime) || (runtime.mode !== LECTURAS_GAME_MODE.PLAYING && !(allowCountdown && runtime.mode === LECTURAS_GAME_MODE.COUNTDOWN))) return false;
  if (runtime?.round?.orderTrapActive) return false;
  const campaign = runtime.readingCampaign || (runtime.readingCampaign = {});
  campaign.idleSinceMs = 0;
  const manual = options?.manual === true;
  if (!manual
    && runtime?.orderVoice?.recoveryInFlight !== true
    && runtime?.orderVoice?.state !== LECTURAS_GAME_ORDER_VOICE_STATE.ARMING_MIC) {
    return false;
  }
  if (runtime?.orderVoice?.manualRetryRequired === true && !manual) return false;
  const phrase = _lecturasGameGetCurrentOrderPhrase(runtime);
  if (!phrase) return false;
  const Ctor = _lecturasGameGetSpeechRecognitionCtor();
  runtime.orderVoice.supported = !!Ctor;
  if (!Ctor) return false;
  _lecturasGameBroadcastGlobalMicRelease("order-reading-start");
  const micReady = await _lecturasGamePrimeMicrophonePermission(runtime);
  if (!micReady) {
    runtime.orderVoice.manualRetryRequired = true;
    runtime.progress.rewardMessage = "Permite el micrófono para continuar la lectura.";
    _lecturasGameRenderOrderPhraseUi(runtime);
    return false;
  }
  if (manual) _lecturasGameResetOrderSpeechRetryState(runtime);
  _lecturasGameStopOrderSpeech(runtime, { restoreAudio: false });
  const attemptId = Math.max(0, Number(runtime.orderVoice.attemptId || 0)) + 1;
  runtime.orderVoice.attemptId = attemptId;
  runtime.orderVoice.state = LECTURAS_GAME_ORDER_VOICE_STATE.ARMING_MIC;
  runtime.orderVoice.recoveryInFlight = false;
  runtime.orderVoice.manualRetryRequired = false;
  runtime.orderVoice.hasDetectedSpeech = false;
  runtime.orderVoice.silenceDeadline = 0;
  runtime.orderVoice.listeningSince = 0;
  runtime.orderVoice.lastError = "";
  runtime.orderVoice.lastErrorAt = 0;
  runtime.orderVoice.lastTransition = "ORDER_MIC_ARMING";
  runtime.orderVoice.lastTransitionAt = Number(performance.now() || Date.now());
  const rec = new Ctor();
  runtime.orderVoice.recognition = rec;
  runtime.orderVoice.expectedPhrase = String(phrase.text || "");
  runtime.orderVoice.processedWordCount = 0;
  runtime.orderVoice.lastTranscriptAll = "";
  runtime.orderVoice.lastFinalTranscript = "";
  runtime.orderVoice.alternatives = [];
  runtime.orderVoice.bestAlternative = "";
  runtime.orderVoice.bestAltText = "";
  runtime.orderVoice.bestAltScore = 0;
  runtime.orderVoice.bestAltConfidence = 0;
  runtime.orderVoice.lastRejectReason = "";
  runtime.orderVoice.resetSamePhraseAt = 0;
  runtime.orderVoice.attempt = _lecturasGameCreateOrderVoiceAttempt(runtime?.round?.orderPhraseSpeakable || [], runtime.orderVoice);
  runtime.orderVoice.attempt.id = attemptId;
  runtime.orderVoice.attempt.status = "arming_mic";
  const speechLang = _lecturasGamePickSpeechLang();
  runtime.orderVoice.lang = speechLang;
  rec.lang = speechLang;
  rec.interimResults = true;
  rec.maxAlternatives = 5;
  rec.continuous = true;
  try {
    const expectedLetters = Array.isArray(runtime?.orderVoice?.expectedLetters) ? runtime.orderVoice.expectedLetters : [];
    const hints = _lecturasGameBuildOrderSpellHints(expectedLetters);
    if (hints.length && "phrases" in rec) {
      try {
        rec.phrases = hints.map((phrase) => ({ phrase, boost: 8.0 }));
      } catch (_) {
        rec.phrases = hints;
      }
    }
  } catch (_) {
    // optional contextual biasing
  }
  let attemptSettled = false;
  const settleAttempt = () => {
    if (attemptSettled) return false;
    attemptSettled = true;
    runtime.orderVoice.attemptSettled = true;
    return true;
  };
  runtime.orderVoice.attemptSettled = false;
  runtime.orderVoice.starting = true;
  _lecturasGameRenderOrderPhraseUi(runtime);
  // Keep WebSpeech isolated from extra audio graph taps; this avoids start/end flapping on some browsers.
  _lecturasGameStopOrderProsodyCapture(runtime);
  rec.onstart = () => {
    if (runtime?.orderVoice?.recognition !== rec || Number(runtime?.orderVoice?.attemptId || 0) !== attemptId) return;
    runtime.orderVoice.starting = false;
    runtime.orderVoice.listening = true;
    runtime.orderVoice.state = runtime.mode === LECTURAS_GAME_MODE.COUNTDOWN
      ? LECTURAS_GAME_ORDER_VOICE_STATE.COUNTDOWN
      : LECTURAS_GAME_ORDER_VOICE_STATE.LISTENING;
    runtime.orderVoice.recoveryInFlight = false;
    runtime.orderVoice.lastTransition = runtime.mode === LECTURAS_GAME_MODE.COUNTDOWN
      ? "ORDER_MIC_LISTENING_COUNTDOWN"
      : "ORDER_MIC_LISTENING";
    runtime.orderVoice.lastTransitionAt = Number(performance.now() || Date.now());
    runtime.orderVoice.listeningSince = Number(performance.now() || Date.now());
    runtime.orderVoice.silenceDeadline = runtime.orderVoice.listeningSince + LECTURAS_GAME_ORDER_SILENCE_TIMEOUT_MS;
    runtime.orderVoice.listenStartedAt = Number(performance.now() || Date.now());
    runtime.orderVoice.validationGraceUntilMs = runtime.orderVoice.listenStartedAt + 2200;
    if (runtime.orderVoice?.attempt) {
      runtime.orderVoice.attempt.status = "listening";
      runtime.orderVoice.attempt.startedAt = runtime.orderVoice.listenStartedAt;
    }
    Promise.resolve(_lecturasGameStartOrderProsodyCapture(runtime)).catch(() => false);
    if (runtime.orderVoice.autoStopTimer) {
      clearTimeout(runtime.orderVoice.autoStopTimer);
      runtime.orderVoice.autoStopTimer = 0;
    }
    runtime.orderVoice.autoStopTimer = setTimeout(() => {
      if (runtime?.orderVoice?.recognition === rec && runtime?.orderVoice?.listening) {
        try { rec.stop(); } catch (_) { }
      }
    }, 300000);
    _lecturasGameSetOrderReadingAudioState(true, runtime);
    _lecturasGameSetGameMusicDucking(false, runtime);
    const liveCampaign = runtime.readingCampaign || (runtime.readingCampaign = {});
    liveCampaign.idleSinceMs = 0;
    _lecturasGameRenderOrderPhraseUi(runtime);
  };
  rec.onerror = (event) => {
    if (runtime?.orderVoice?.recognition !== rec || Number(runtime?.orderVoice?.attemptId || 0) !== attemptId) return;
    if (!settleAttempt()) {
      _lecturasGameRenderOrderPhraseUi(runtime);
      return;
    }
    runtime.orderVoice.starting = false;
    runtime.orderVoice.listening = false;
    if (runtime.orderVoice.autoStopTimer) {
      clearTimeout(runtime.orderVoice.autoStopTimer);
      runtime.orderVoice.autoStopTimer = 0;
    }
    _lecturasGameStopOrderProsodyCapture(runtime);
    const errName = String(event?.error || "").toLowerCase();
    runtime.orderVoice.lastError = errName || "recognition_error";
    runtime.orderVoice.lastErrorAt = Number(performance.now() || Date.now());
    runtime.orderVoice.lastTransition = "ORDER_ATTEMPT_ERROR";
    runtime.orderVoice.lastTransitionAt = Number(performance.now() || Date.now());
    if (runtime.orderVoice?.attempt) {
      runtime.orderVoice.attempt.status = "error";
      runtime.orderVoice.attempt.endedAt = Number(performance.now() || Date.now());
    }
    const action = _lecturasGameClassifyOrderRecognitionError(errName);
    if (action === "recover_silent") {
      _lecturasGameScheduleOrderSpeechRecovery(runtime, LECTURAS_GAME_ORDER_RECOVER_LISTEN_DELAY_MS);
      _lecturasGameRenderOrderPhraseUi(runtime);
      return;
    }
    if (action === "recover_once") {
      const retries = Math.max(0, Number(runtime?.orderVoice?.recoverableErrorRetries || 0));
      if (retries < 1) {
        runtime.orderVoice.recoverableErrorRetries = retries + 1;
        _lecturasGameScheduleOrderSpeechRecovery(runtime, LECTURAS_GAME_ORDER_RECOVER_LISTEN_DELAY_MS);
        _lecturasGameRenderOrderPhraseUi(runtime);
        return;
      }
      _lecturasGameSetOrderManualMicRetry(runtime, errName || "recognition_error", "No se pudo mantener el micrófono activo. Toca \"Hablar ahora\" para reintentar.");
      return;
    }
    if (action === "manual_permissions") {
      _lecturasGameSetOrderManualMicRetry(runtime, errName || "recognition_not_allowed", "Permite el micrófono para continuar la lectura.");
      return;
    }
    _lecturasGameSetOrderManualMicRetry(runtime, errName || "recognition_error", "No se pudo activar el micrófono. Toca \"Hablar ahora\" para reintentar.");
  };
  rec.onend = () => {
    if ((runtime?.orderVoice?.recognition !== rec && runtime?.orderVoice?.skipNextOnEnd !== true) || Number(runtime?.orderVoice?.attemptId || 0) !== attemptId) return;
    if (!settleAttempt()) {
      _lecturasGameRenderOrderPhraseUi(runtime);
      return;
    }
    runtime.orderVoice.starting = false;
    runtime.orderVoice.listening = false;
    runtime.orderVoice.recoveryInFlight = false;
    if (runtime.orderVoice.autoStopTimer) {
      clearTimeout(runtime.orderVoice.autoStopTimer);
      runtime.orderVoice.autoStopTimer = 0;
    }
    if (runtime.orderVoice?.skipNextOnEnd) {
      runtime.orderVoice.skipNextOnEnd = false;
      _lecturasGameRenderOrderPhraseUi(runtime);
      return;
    }
    _lecturasGameStopOrderProsodyCapture(runtime);
    if (runtime.mode === LECTURAS_GAME_MODE.COUNTDOWN) {
      runtime.orderVoice.state = LECTURAS_GAME_ORDER_VOICE_STATE.COUNTDOWN;
      runtime.orderVoice.lastTransition = "ORDER_MIC_ENDED_DURING_COUNTDOWN";
      runtime.orderVoice.lastTransitionAt = Number(performance.now() || Date.now());
      _lecturasGameRenderOrderPhraseUi(runtime);
      return;
    }
    const finalized = _lecturasGameFinalizeOrderSpeechAttempt(
      runtime,
      runtime?.orderVoice?.lastFinalTranscript || runtime?.orderVoice?.lastTranscriptAll || ""
    );
    if (finalized) {
      _lecturasGameSetOrderReadingAudioState(false, runtime);
      _lecturasGameSetGameMusicDucking(false, runtime);
      _lecturasGameRenderOrderPhraseUi(runtime);
      return;
    }
    const heardAnyTranscript = runtime?.orderVoice?.hasDetectedSpeech === true
      || String(runtime?.orderVoice?.lastTranscriptAll || runtime?.orderVoice?.lastTranscript || "").trim().length > 0;
    if (!heardAnyTranscript
      && _lecturasGameIsOrderChallenge(runtime)
      && runtime.mode === LECTURAS_GAME_MODE.PLAYING
      && runtime?.round?.orderTrapActive !== true
      && _lecturasGameGetCurrentOrderPhrase(runtime)) {
      _lecturasGameScheduleOrderSpeechRecovery(runtime, LECTURAS_GAME_ORDER_RECOVER_LISTEN_DELAY_MS);
      _lecturasGameRenderOrderPhraseUi(runtime);
      return;
    }
    if (_lecturasGameIsOrderChallenge(runtime)
      && runtime.mode === LECTURAS_GAME_MODE.PLAYING
      && runtime?.round?.orderTrapActive !== true
      && _lecturasGameGetCurrentOrderPhrase(runtime)) {
      _lecturasGameScheduleOrderSpeechRecovery(runtime, LECTURAS_GAME_ORDER_RECOVER_LISTEN_DELAY_MS);
      _lecturasGameRenderOrderPhraseUi(runtime);
      return;
    }
    _lecturasGameSetOrderReadingAudioState(false, runtime);
    _lecturasGameSetGameMusicDucking(false, runtime);
    _lecturasGameRenderOrderPhraseUi(runtime);
  };
  rec.onresult = (event) => {
    if (runtime?.orderVoice?.recognition !== rec || Number(runtime?.orderVoice?.attemptId || 0) !== attemptId) return;
    const results = event?.results;
    if (!results?.length) return;
    const allParts = [];
    const finalParts = [];
    for (let i = 0; i < results.length; i += 1) {
      const text = String(results[i]?.[0]?.transcript || "").trim();
      if (!text) continue;
      allParts.push(text);
      if (results[i]?.isFinal) finalParts.push(text);
    }
    runtime.orderVoice.lastTranscriptAll = String(allParts.join(" ").trim() || "");
    if (runtime.orderVoice.lastTranscriptAll) {
      const now = Number(performance.now() || Date.now());
      runtime.orderVoice.hasDetectedSpeech = true;
      runtime.orderVoice.recoverableErrorRetries = 0;
      runtime.orderVoice.silenceDeadline = now + LECTURAS_GAME_ORDER_SILENCE_TIMEOUT_MS;
      const liveCampaign = runtime.readingCampaign || (runtime.readingCampaign = {});
      liveCampaign.idleSinceMs = 0;
    }
    const finalTranscript = String(finalParts.join(" ").trim() || "");
    if (!finalTranscript) {
      _lecturasGameRenderOrderPhraseUi(runtime);
      return;
    }
    const voice = runtime.orderVoice || (runtime.orderVoice = {});
    const spellMode = voice.spellMode === true;
    const alternatives = _lecturasGameCollectOrderResultAlternatives(results);
    voice.alternatives = alternatives;
    let chosenTranscript = finalTranscript;
    if (spellMode) {
      const expectedLetters = Array.isArray(voice.expectedLetters) ? voice.expectedLetters : _lecturasGameGetOrderExpectedLetters(runtime);
      const best = _lecturasGamePickBestOrderSpellAlternative(alternatives.length ? alternatives : [{ text: finalTranscript, confidence: 0 }], expectedLetters);
      if (best?.text) {
        chosenTranscript = String(best.text || "").trim() || finalTranscript;
        voice.bestAlternative = chosenTranscript;
        voice.bestAltText = chosenTranscript;
        voice.bestAltScore = Number(best.score || 0);
        voice.bestAltConfidence = Number(best.confidence || 0);
      } else {
        voice.bestAlternative = finalTranscript;
        voice.bestAltText = finalTranscript;
        voice.bestAltScore = 0;
        voice.bestAltConfidence = 0;
      }
    } else {
      voice.bestAlternative = finalTranscript;
      voice.bestAltText = finalTranscript;
      voice.bestAltScore = 0;
      voice.bestAltConfidence = Number(alternatives[0]?.confidence || 0);
    }
    runtime.orderVoice.lastFinalTranscript = chosenTranscript;
    const provisional = _lecturasGameConsumeOrderSpeechWords(runtime.orderVoice.lastTranscriptAll || chosenTranscript, runtime, { commitWrong: false });
    if (runtime.orderVoice?.attempt) {
      runtime.orderVoice.attempt.finalTranscript = chosenTranscript;
      runtime.orderVoice.attempt.status = runtime.mode === LECTURAS_GAME_MODE.COUNTDOWN ? "countdown_buffering" : "evaluating";
    }
    if (runtime.mode === LECTURAS_GAME_MODE.COUNTDOWN) {
      _lecturasGameRenderOrderPhraseUi(runtime);
      return;
    }
    if (provisional?.evaluation?.success === true || provisional?.failed === true) {
      const finalized = _lecturasGameFinalizeOrderSpeechAttempt(runtime, chosenTranscript);
      if (finalized) {
        _lecturasGameRenderOrderPhraseUi(runtime);
        return;
      }
    }
    if (runtime?.round?.orderTrapActive !== true) {
      _lecturasGameRenderOrderPhraseUi(runtime);
      return;
    }
    _lecturasGameRenderOrderPhraseUi(runtime);
  };
  try {
    rec.start();
    return true;
  } catch (_) {
    runtime.orderVoice.starting = false;
    runtime.orderVoice.listening = false;
    runtime.orderVoice.lastError = "recognition_start_failed";
    runtime.orderVoice.lastErrorAt = Number(performance.now() || Date.now());
    _lecturasGameStopOrderProsodyCapture(runtime);
    _lecturasGameSetOrderReadingAudioState(false, runtime);
    _lecturasGameSetGameMusicDucking(false, runtime);
    _lecturasGameSetOrderManualMicRetry(runtime, "recognition_start_failed", "No se pudo iniciar el micrófono. Toca \"Hablar ahora\" para reintentar.");
    return false;
  }
}

function _lecturasGameHandleOrderCorrectHit(word = null, runtime = lecturasGameModeRuntime, source = "body") {
  if (!word?.active || !_lecturasGameIsOrderChallenge(runtime) || !runtime?.round) return;
  const phrase = _lecturasGameGetCurrentOrderPhrase(runtime);
  if (!phrase) return;
  _lecturasGameSpawnBalloonPop(word, runtime, { explosionScale: source === "fireball" ? 1.36 : 1.2 });
  _lecturasGameRemoveBalloonMesh(word, runtime);
  word.active = false;
  _lecturasGameSpawnHitParticles(word);
  _lecturasGamePlayHitSound();
  _lecturasGameApplyScoreDelta(10, runtime, String(word.side || ""));
  runtime.round.orderTrapActive = false;
  runtime.round.orderLastReadResult = "caught";
  runtime.round.orderIndex = Math.max(0, Number(runtime.round.orderIndex || 0)) + 1;
  const campaign = runtime.readingCampaign || (runtime.readingCampaign = {});
  campaign.readingCursor = Math.max(0, Number(runtime.round.orderIndex || 0));
  campaign.idleSinceMs = 0;
  if (!_lecturasGameApplyOrderStageWords(runtime)) {
    _lecturasGameFinalizeOrderCampaignWin(runtime);
    return;
  }
  if (_lecturasGameMaybeOpenOrderCheckpointQuiz(runtime)) {
    return;
  }
  runtime.progress.rewardMessage = "Palabra atrapada. Lee la siguiente frase.";
  _lecturasGameQueueOrderSpeech(runtime);
  _lecturasGameClearAllWordEntities(runtime);
  _lecturasGameSetMode(LECTURAS_GAME_MODE.PLAYING);
}

function _lecturasGameHandleWrongWordDestroyed(word = null, runtime = lecturasGameModeRuntime, scoreDelta = 10, options = {}) {
  if (!word?.active) return;
  if (runtime.quizPendingAfterWin === true) return;
  const popOptions = { explosionScale: 1.22, ...(options && typeof options === "object" ? options : {}) };
  _lecturasGameSpawnBalloonPop(word, runtime, popOptions);
  _lecturasGameRemoveBalloonMesh(word, runtime);
  word.active = false;
  runtime.removedWrongCount += 1;
  _lecturasGameApplyScoreDelta(scoreDelta, runtime, String(word.side || ""));
  _lecturasGameSpawnHitParticles(word);
  _lecturasGamePlayHitSound();
  const wrongRemaining = Math.max(0, runtime.totalWrongCount - runtime.removedWrongCount);
  if (wrongRemaining <= 0 && !_lecturasGameIsOrderChallenge(runtime)) {
    runtime.progress.rewardMessage = "Ronda limpia. Responde la prueba para subir de nivel.";
    runtime.quiz = _lecturasGameBuildLevelQuiz(runtime);
    runtime.quizPendingAfterWin = true;
    _lecturasGameSetMode(LECTURAS_GAME_MODE.QUIZ);
  }
}

function _lecturasGameBuildLevelQuiz(runtime = lecturasGameModeRuntime) {
  if (_lecturasGameIsOrderChallenge(runtime)) {
    const phrases = Array.isArray(runtime?.round?.orderPhrases) ? runtime.round.orderPhrases : [];
    const completed = Math.max(1, Number(runtime?.round?.orderIndex || 1));
    const lastPhrase = phrases[Math.max(0, completed - 1)] || phrases[Math.max(0, phrases.length - 1)] || null;
    const correct = String(lastPhrase?.targetWord || runtime?.round?.correctSynonym || "").trim() || "PALABRA";
    const wrongPool = _lecturasGameExtractNarrativeWordPool(String(runtime?.lectura?.htmlLectura || runtime?.lectura?.raw?.contenidoHTML || ""), 3)
      .filter((w) => _lecturasGameNormalizeWord(w) !== _lecturasGameNormalizeWord(correct));
    let wrong = String(_lecturasGamePickRandom(wrongPool) || "Nube").trim();
    if (_lecturasGameNormalizeWord(wrong) === _lecturasGameNormalizeWord(correct)) wrong = "Cambio";
    const options = _lecturasGameShuffle([correct, wrong]);
    const correctIndex = options.findIndex((item) => _lecturasGameNormalizeWord(item) === _lecturasGameNormalizeWord(correct));
    return {
      question: `Checkpoint ${completed}: ¿Cuál fue la palabra clave del párrafo leído?`,
      options,
      correctIndex: Math.max(0, correctIndex),
      answered: false
    };
  }
  const target = String(runtime?.round?.targetWord || "").trim() || "PALABRA";
  const correct = String(runtime?.round?.correctSynonym || "").trim() || "SINÓNIMO";
  const wrongPool = (runtime?.round?.distractors || []).filter((w) => _lecturasGameNormalizeWord(w) !== _lecturasGameNormalizeWord(correct));
  const wrong = String(_lecturasGamePickRandom(wrongPool) || "Nube").trim();
  const options = _lecturasGameShuffle([correct, wrong]);
  const correctIndex = options.findIndex((item) => _lecturasGameNormalizeWord(item) === _lecturasGameNormalizeWord(correct));
  return {
    question: `¿Cuál es el sinónimo de ${target}?`,
    options,
    correctIndex: Math.max(0, correctIndex),
    answered: false
  };
}

function _lecturasGameContinueAfterQuizSuccess(runtime = lecturasGameModeRuntime) {
  if (_lecturasGameIsOrderChallenge(runtime)) {
    const campaign = runtime.readingCampaign || (runtime.readingCampaign = {});
    runtime.progress.gems = Math.max(0, Number(runtime.progress?.gems || 0) + 1);
    runtime.quiz = null;
    runtime.quizPendingAfterWin = false;
    campaign.idleSinceMs = 0;
    runtime.progress.rewardMessage = "Respuesta correcta. +1 gema. Continúa la lectura.";
    const hasPreparedPhrase = Array.isArray(runtime?.round?.orderPhraseWords) && runtime.round.orderPhraseWords.length > 0;
    if (!hasPreparedPhrase && !_lecturasGameApplyOrderStageWords(runtime)) {
      _lecturasGameFinalizeOrderCampaignWin(runtime);
      return;
    }
    _lecturasGameQueueOrderSpeech(runtime);
    _lecturasGameSetMode(LECTURAS_GAME_MODE.PLAYING);
    return;
  }
  _lecturasGameGrantLevelReward(runtime);
  runtime.quiz = null;
  runtime.quizPendingAfterWin = false;
  Promise.resolve(_lecturasGamePersistPlayerScores(runtime, "level-clear")).catch(() => { });
  _lecturasGamePlayWinSound();
  _lecturasGameStartLevelTransitionFx(runtime, { force: true, amplitude: 24, durationMs: 900 });
  const ok = _lecturasGamePrepareChallenge(runtime, runtime.challengeType || runtime.selectedGameId || LECTURAS_GAME_IDS.SYNONYMS);
  if (!ok) {
    runtime.progress.rewardMessage = "No hay suficientes datos para continuar el juego.";
    _lecturasGameSetMode(LECTURAS_GAME_MODE.LOST);
    return;
  }
  runtime.plannedNextChallenge = null;
  runtime.countdownMs = 3000;
  _lecturasGameSetMode(LECTURAS_GAME_MODE.COUNTDOWN);
  Promise.resolve(_lecturasGamePrepareCountdownAudio(runtime)).catch(() => { });
}

function _lecturasGameSpawnPowerup(runtime = lecturasGameModeRuntime) {
  const now = Number(performance.now() || Date.now());
  if (runtime.mode !== LECTURAS_GAME_MODE.PLAYING) return;
  const pickType = () => {
    const roll = Math.random();
    if (roll < 0.34) return LECTURAS_GAME_POWERUP_TYPES.FIRE;
    if (roll < 0.52) return LECTURAS_GAME_POWERUP_TYPES.ICE;
    if (roll < 0.68) return LECTURAS_GAME_POWERUP_TYPES.PACIFIST;
    if (roll < 0.84) return LECTURAS_GAME_POWERUP_TYPES.BOMB;
    return LECTURAS_GAME_POWERUP_TYPES.CHAOS;
  };
  const buildPowerup = (side = "") => {
    const type = pickType();
    const text = LECTURAS_GAME_POWERUP_LABELS[type] || LECTURAS_GAME_POWERUP_WORD;
    const depthScale = 0.6 + (Math.random() * 0.65);
    const baseWidth = Math.max(120, _lecturasGameMeasureWordWidth(runtime, text) * 0.72);
    const width = Math.max(118, Math.round(baseWidth * depthScale));
    const height = Math.max(62, Math.round(width * 0.28));
    const bounds = side ? _lecturasGameWordSideBounds(side, runtime) : { minX: 18, maxX: runtime.viewWidth - 18 };
    const xMax = Math.max(bounds.minX + 2, bounds.maxX - width);
    const x = bounds.minX + (Math.random() * Math.max(2, xMax - bounds.minX));
    const y = -height - (40 + Math.random() * 120);
    return {
      id: `lg_power_${Date.now()}_${side || "solo"}`,
      text,
      x,
      y,
      width,
      height,
      side,
      type,
      scale: depthScale,
      hitWidth: Math.max(56, Math.min(width * 0.72, width - 16)),
      hitHeight: Math.max(44, Math.min(height * 0.84, height - 8)),
      vy: 120 + Math.random() * 110,
      pulse: Math.random() * Math.PI * 2,
      active: true
    };
  };
  if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR) {
    LECTURAS_GAME_PAIR_SIDES.forEach((side) => {
      const sideState = _lecturasGameGetPairSideState(side, runtime);
      if (sideState.powerup?.active) return;
      if (now < Number(sideState.powerupSpawnAtMs || 0)) return;
      sideState.powerup = buildPowerup(side);
      sideState.powerupSpawnAtMs = now + _lecturasGameGetPowerupSpawnDelayMs(runtime);
    });
    return;
  }
  if (runtime.powerup) return;
  if (now < Number(runtime.powerupSpawnAtMs || 0)) return;
  runtime.powerup = buildPowerup("");
  runtime.powerupSpawnAtMs = now + _lecturasGameGetPowerupSpawnDelayMs(runtime);
}

function _lecturasGameGetPlayerJoints(runtime = lecturasGameModeRuntime) {
  return Array.isArray(runtime.pose?.joints) ? runtime.pose.joints : [];
}

function _lecturasGameGetPowerupCollisionRect(powerup = null) {
  if (!powerup) return null;
  const width = Math.max(1, Number(powerup.width || 0));
  const height = Math.max(1, Number(powerup.height || 0));
  const baseW = Math.max(1, Number(powerup.hitWidth || width * 0.72));
  const baseH = Math.max(1, Number(powerup.hitHeight || height * 0.72));
  const hitWidth = Math.max(26, Math.min(width - 4, baseW * 1.1));
  const hitHeight = Math.max(24, Math.min(height - 4, baseH * 1.1));
  return {
    x: Number(powerup.x || 0) + ((width - hitWidth) / 2),
    y: Number(powerup.y || 0) + ((height - hitHeight) / 2),
    width: hitWidth,
    height: hitHeight
  };
}

function _lecturasGameActivateFireMode(runtime = lecturasGameModeRuntime, nowMs = performance.now(), side = "", type = LECTURAS_GAME_POWERUP_TYPES.FIRE) {
  const now = Number(nowMs || performance.now());
  const modeType = String(type || LECTURAS_GAME_POWERUP_TYPES.FIRE);
  _lecturasGameResetBombState(runtime, side || "");
  if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR && side) {
    const sideState = _lecturasGameGetPairSideState(side, runtime);
    sideState.fireModeUntilMs = now + LECTURAS_GAME_FIRE_MODE_MS;
    sideState.fireModeType = modeType;
    return;
  }
  runtime.fireModeActive = true;
  runtime.fireModeUntilMs = now + LECTURAS_GAME_FIRE_MODE_MS;
  runtime.fireModeType = modeType;
}

function _lecturasGameDetonateChestBomb(side = "", runtime = lecturasGameModeRuntime) {
  (runtime.words || []).forEach((word) => {
    if (!word?.active || word?.isCorrect) return;
    _lecturasGameHandleWrongWordDestroyed(word, runtime, 8, { explosionScale: 1.65 });
  });
  _lecturasGameStartLevelTransitionFx(runtime, { force: true, amplitude: 16, durationMs: 500 });
}

function _lecturasGameActivatePowerupEffect(powerup = null, runtime = lecturasGameModeRuntime, nowMs = performance.now(), side = "") {
  const kind = String(powerup?.type || LECTURAS_GAME_POWERUP_TYPES.FIRE);
  const now = Number(nowMs || performance.now());
  const status = _lecturasGameGetSideStatus(side || powerup?.side || "", runtime);
  if (!status) return;
  if (kind === LECTURAS_GAME_POWERUP_TYPES.FIRE) {
    _lecturasGameActivateFireMode(runtime, now, side || powerup?.side || "", LECTURAS_GAME_POWERUP_TYPES.FIRE);
    return;
  }
  if (kind === LECTURAS_GAME_POWERUP_TYPES.ICE) {
    _lecturasGameActivateFireMode(runtime, now, side || powerup?.side || "", LECTURAS_GAME_POWERUP_TYPES.ICE);
    return;
  }
  if (kind === LECTURAS_GAME_POWERUP_TYPES.PACIFIST) {
    status.pacifistUntilMs = now + 7000;
    return;
  }
  if (kind === LECTURAS_GAME_POWERUP_TYPES.BOMB) {
    _lecturasGameResetFireState(runtime, side || powerup?.side || "");
    status.bombReadyUntilMs = now + LECTURAS_GAME_BOMB_READY_MS;
    status.bombActivatedAtMs = now;
    status.bombChestHoldStartMs = 0;
    status.bombChargeNorm = 0;
    return;
  }
  if (kind === LECTURAS_GAME_POWERUP_TYPES.CHAOS) {
    status.chaosUntilMs = now + 6500;
    const levelNow = Math.max(1, Number(runtime.progress?.level || 1));
    const bonusWords = Math.max(4, Math.min(48, 4 + Math.round((levelNow - 1) * 3.5)));
    const rushSpeedFactor = Math.min(2.2, 0.88 + ((levelNow - 1) * 0.14));
    for (let i = 0; i < bonusWords; i += 1) {
      const source = _lecturasGamePickRandom(runtime.round?.distractors || []) || `RUSH ${i + 1}`;
      runtime.words.push({
        id: `lgw_chaos_${now}_${i}_${Math.round(Math.random() * 9999)}`,
        text: String(source),
        isCorrect: false,
        x: Math.random() * Math.max(24, runtime.viewWidth - 220),
        y: -40 - Math.random() * 140,
        width: Math.max(160, _lecturasGameMeasureWordWidth(runtime, source)),
        height: 96,
        hitWidth: 96,
        hitHeight: 62,
        vy: (200 + Math.random() * 170) * rushSpeedFactor,
        side: runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR ? (side || (Math.random() > 0.5 ? "right" : "left")) : "",
        active: true
      });
    }
  }
}

function _lecturasGameTryCollectPowerup(runtime = lecturasGameModeRuntime, nowMs = performance.now()) {
  const collect = (powerup = null, side = "", onCollected = () => { }) => {
    if (!powerup?.active) return false;
    const rect = _lecturasGameGetPowerupCollisionRect(powerup);
    if (!rect) return false;
    const joints = _lecturasGameGetHandCollisionJoints(side || powerup.side || "", runtime);
    const touchedByJoint = joints.some((joint) => {
      const probe = {
        ...joint,
        r: Math.max(4, Number(joint?.r || 0) * 0.92)
      };
      return _lecturasGameCircleRectCollision(probe, rect);
    });
    if (!touchedByJoint) return false;
    powerup.active = false;
    onCollected();
    _lecturasGameSpawnHitParticles({
      x: powerup.x,
      y: powerup.y,
      width: powerup.width,
      height: powerup.height
    });
    _lecturasGamePlayTone(1040, 110, "triangle", 0.08);
    _lecturasGamePlayTone(1320, 140, "triangle", 0.08);
    runtime.firePickupFx = {
      active: true,
      elapsedMs: 0,
      maxMs: 1450,
      side: side || powerup.side || "",
      spin: Math.random() * Math.PI * 2
    };
    _lecturasGameActivatePowerupEffect(powerup, runtime, nowMs, side || powerup.side || "");
    return true;
  };
  if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR) {
    for (const side of LECTURAS_GAME_PAIR_SIDES) {
      const sideState = _lecturasGameGetPairSideState(side, runtime);
      if (!sideState.powerup?.active) continue;
      const collected = collect(sideState.powerup, side, () => {
        sideState.powerup = null;
        sideState.powerupCollectedThisLevel = false;
        sideState.powerupSpawnAtMs = Number(nowMs || performance.now()) + _lecturasGameGetPowerupSpawnDelayMs(runtime);
      });
      if (collected) return true;
    }
    return false;
  }
  return collect(runtime.powerup, "", () => {
    runtime.powerup = null;
    runtime.powerupCollectedThisLevel = false;
    runtime.powerupSpawnAtMs = Number(nowMs || performance.now()) + _lecturasGameGetPowerupSpawnDelayMs(runtime);
  });
}

function _lecturasGameSpawnFireball(origin = null, direction = null, runtime = lecturasGameModeRuntime, options = {}) {
  const side = String(options.side || _lecturasGameGetSideByX(origin?.x, runtime));
  if (!_lecturasGameIsFireModeActiveForSide(side, runtime)) return false;
  if (_lecturasGameIsPacifistActive(side, runtime, performance.now())) return false;
  if (!origin || !direction) return false;
  if ((runtime.fireballs || []).length >= LECTURAS_GAME_MAX_FIREBALLS) return false;
  const dx = Number(direction.x || 0);
  const dy = Number(direction.y || 0);
  const mag = Math.hypot(dx, dy);
  if (mag < 0.001) return false;
  const chargeScale = Math.max(0.45, Math.min(2.5, Number(options.chargeScale || 1)));
  const nx = dx / mag;
  const ny = dy / mag;
  runtime.lastThrowVector = { x: nx, y: ny };
  const isSuper = Number(options.chargeNorm || 0) >= 0.88;
  const radius = isSuper
    ? Math.max(34, 36 + Math.round(chargeScale * 16))
    : Math.max(10, 14 + Math.round(chargeScale * 10));
  const launchSpeedScale = Math.max(0.72, Math.min(1.85, Number(options.launchSpeedScale || 1)));
  const launchSpeed = LECTURAS_GAME_FIREBALL_SPEED * launchSpeedScale;
  let vx = nx * launchSpeed;
  let vy = ny * launchSpeed;
  vx += Number(options.motionBoost?.x || 0);
  vy += Number(options.motionBoost?.y || 0);
  const cap = LECTURAS_GAME_FIREBALL_SPEED * (isSuper ? 2.3 : 2);
  const vMag = Math.hypot(vx, vy);
  if (vMag > cap) {
    const ratio = cap / Math.max(0.001, vMag);
    vx *= ratio;
    vy *= ratio;
  }
  const penetrationLeft = isSuper ? Number.POSITIVE_INFINITY : Math.max(1, Math.floor(radius / 14));
  const elementType = _lecturasGameGetFireModeTypeForSide(side, runtime, performance.now()) || LECTURAS_GAME_POWERUP_TYPES.FIRE;
  runtime.fireballs.push({
    id: `lg_fire_${Date.now()}_${Math.round(Math.random() * 9999)}`,
    x: Number(origin.x || 0),
    y: Number(origin.y || 0),
    vx,
    vy,
    radius,
    chargeScale,
    isSuper,
    bounceX: !isSuper,
    penetrationLeft,
    side,
    elementType,
    spawnHand: String(options.spawnHand || ""),
    trail: [{ x: Number(origin.x || 0), y: Number(origin.y || 0), age: 0 }],
    lifeMs: 0,
    maxLifeMs: isSuper ? 1900 : 1100
  });
  _lecturasGamePlayTone(560, 70, "sawtooth", 0.06);
  return true;
}

function _lecturasGameNormalizeVec(vec = null, fallback = { x: 0, y: -1 }) {
  const dx = Number(vec?.x || 0);
  const dy = Number(vec?.y || 0);
  const mag = Math.hypot(dx, dy);
  if (mag < 0.0001) return { x: Number(fallback?.x || 0), y: Number(fallback?.y || -1) };
  return { x: dx / mag, y: dy / mag };
}

function _lecturasGameGetPoseAimFallback(handKey = "right", runtime = lecturasGameModeRuntime) {
  const segments = Array.isArray(runtime.pose?.segments) ? runtime.pose.segments : [];
  let candidates = [];
  if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR) {
    const sideKey = handKey === "right" ? "right" : "left";
    candidates = segments.filter((item) => {
      const kind = String(item?.kind || "").toLowerCase();
      if (!(kind.includes("forearm") || kind.includes("arm"))) return false;
      const tagged = String(item?.playerSide || "");
      if (tagged === "left" || tagged === "right") return tagged === sideKey;
      const midX = (Number(item?.ax || 0) + Number(item?.bx || 0)) / 2;
      return _lecturasGameGetSideByX(midX, runtime) === sideKey;
    });
  } else {
    const lower = handKey === "left" ? "leftforearm" : "rightforearm";
    const upper = handKey === "left" ? "leftarm" : "rightarm";
    candidates = segments.filter((item) => {
      const kind = String(item?.kind || "").toLowerCase();
      return kind === lower || kind === upper;
    });
  }
  let seg = candidates[0] || null;
  if (candidates.length > 1) {
    const hand = _lecturasGameGetHandState(handKey, runtime);
    const refX = Number(hand?.wrist?.x || hand?.palm?.x || _lecturasGameGetPanelAnchorX(handKey, runtime));
    seg = [...candidates].sort((a, b) => {
      const ax = (Number(a?.ax || 0) + Number(a?.bx || 0)) / 2;
      const bx = (Number(b?.ax || 0) + Number(b?.bx || 0)) / 2;
      return Math.abs(ax - refX) - Math.abs(bx - refX);
    })[0] || candidates[0];
  }
  if (seg) {
    return _lecturasGameNormalizeVec({ x: Number(seg.bx || 0) - Number(seg.ax || 0), y: Number(seg.by || 0) - Number(seg.ay || 0) }, handKey === "left" ? { x: 0.58, y: -0.42 } : { x: -0.58, y: -0.42 });
  }
  return handKey === "left" ? { x: 0.58, y: -0.42 } : { x: -0.58, y: -0.42 };
}

function _lecturasGameGetHandState(handKey = "right", runtime = lecturasGameModeRuntime) {
  const key = handKey === "left" ? "left" : "right";
  runtime.hands = runtime.hands || {};
  if (!runtime.hands[key]) {
    runtime.hands[key] = {
      closed: false,
      justReleased: false,
      releaseByGesture: false,
      traceDrawGesture: false,
      gestureScore: 0,
      gestureActiveFrames: 0,
      gestureInactiveFrames: 0,
      fistMetric: 1,
      chargeStartMs: 0,
      chargeMs: 0,
      chargeNorm: 0,
      confidence: 0,
      wrist: null,
      palm: null,
      aim: null,
      velocity: { x: 0, y: 0 },
      lastValidAim: key === "left" ? { x: 0.6, y: -0.4 } : { x: -0.6, y: -0.4 },
      lastReleaseMs: 0,
      lastSeenMs: 0,
      missingSinceMs: 0
    };
  }
  return runtime.hands[key];
}

function _lecturasGameResetHands(runtime = lecturasGameModeRuntime) {
  ["left", "right"].forEach((handKey) => {
    const hand = _lecturasGameGetHandState(handKey, runtime);
    hand.closed = false;
    hand.justReleased = false;
    hand.releaseByGesture = false;
    hand.traceDrawGesture = false;
    hand.gestureScore = 0;
    hand.gestureActiveFrames = 0;
    hand.gestureInactiveFrames = 0;
    hand.fistMetric = 1;
    hand.chargeStartMs = 0;
    hand.chargeMs = 0;
    hand.chargeNorm = 0;
    hand.confidence = 0;
    hand.wrist = null;
    hand.palm = null;
    hand.aim = null;
    hand.velocity = { x: 0, y: 0 };
    hand.lastSeenMs = 0;
    hand.missingSinceMs = 0;
  });
}

function _lecturasGameMapHandPointToScreen(raw = null, width = 0, height = 0) {
  if (!raw) return null;
  return {
    x: (1 - Number(raw.x || 0)) * width,
    y: Number(raw.y || 0) * height,
    z: Number(raw.z || 0)
  };
}

function _lecturasGameResolveHandKey(h = null, fallbackIdx = 0) {
  const label = String(h?.label || h?.categoryName || "").trim().toLowerCase();
  if (label.includes("left") || label === "izquierda") return "left";
  if (label.includes("right") || label === "derecha") return "right";
  return fallbackIdx % 2 === 0 ? "right" : "left";
}

function _lecturasGameLerpPoint(prev = null, next = null, alpha = 0.5) {
  if (!next) return prev ? { x: Number(prev.x || 0), y: Number(prev.y || 0) } : null;
  if (!prev) return { x: Number(next.x || 0), y: Number(next.y || 0) };
  const t = Math.max(0, Math.min(1, Number(alpha || 0.5)));
  return {
    x: Number(prev.x || 0) + ((Number(next.x || 0) - Number(prev.x || 0)) * t),
    y: Number(prev.y || 0) + ((Number(next.y || 0) - Number(prev.y || 0)) * t)
  };
}

function _lecturasGameComputeAdaptiveAlpha(distance = 0, minAlpha = 0.14, maxAlpha = 0.3, motionWindowPx = 48) {
  const minA = Math.max(0.02, Math.min(0.96, Number(minAlpha || 0.14)));
  const maxA = Math.max(minA, Math.min(0.98, Number(maxAlpha || 0.3)));
  const windowPx = Math.max(6, Number(motionWindowPx || 48));
  const d = Math.max(0, Number(distance || 0));
  const t = _lecturasGameClamp01(d / windowPx);
  return minA + ((maxA - minA) * t);
}

function _lecturasGameSmoothAxis(raw = 0, prevV = 0, alpha = 0.22, deadzonePx = 0, maxStepPx = 0) {
  const rawNum = Number(raw || 0);
  const prevNum = Number(prevV || 0);
  if (!Number.isFinite(rawNum)) return Number.isFinite(prevNum) ? prevNum : 0;
  if (!Number.isFinite(prevNum)) return rawNum;
  const delta = rawNum - prevNum;
  const deadzone = Math.max(0, Number(deadzonePx || 0));
  if (Math.abs(delta) <= deadzone) return prevNum;
  const t = Math.max(0.02, Math.min(1, Number(alpha || 0.22)));
  let step = delta * t;
  const cap = Math.max(0, Number(maxStepPx || 0));
  if (cap > 0) step = Math.max(-cap, Math.min(cap, step));
  return prevNum + step;
}

function _lecturasGameResolveHandKeyByPosition(mappedPoints = [], fallbackKey = "right", usedKeys = new Set(), runtime = lecturasGameModeRuntime) {
  const candidates = ["left", "right"].filter((key) => !usedKeys.has(key));
  if (!candidates.length) return fallbackKey === "left" ? "left" : "right";
  const wrist = mappedPoints[0] || null;
  if (!wrist) return candidates.includes(fallbackKey) ? fallbackKey : candidates[0];

  const freshThresholdMs = Math.max(180, Number(runtime.handTrackingLostResetMs || 140) * 2.2);
  const nowMs = performance.now();
  const nearbyState = candidates
    .map((key) => {
      const hand = _lecturasGameGetHandState(key, runtime);
      if (!hand?.wrist) return null;
      if ((nowMs - Number(hand.lastSeenMs || 0)) > freshThresholdMs) return null;
      const dist = Math.hypot(Number(wrist.x || 0) - Number(hand.wrist.x || 0), Number(wrist.y || 0) - Number(hand.wrist.y || 0));
      return { key, dist };
    })
    .filter(Boolean)
    .sort((a, b) => Number(a.dist || 0) - Number(b.dist || 0));
  if (nearbyState.length && Number(nearbyState[0].dist || Infinity) <= 260) {
    return nearbyState[0].key;
  }

  const torso = (Array.isArray(runtime.pose?.joints) ? runtime.pose.joints : [])
    .find((joint) => String(joint?.kind || "").toLowerCase() === "torso");
  if (torso) {
    const byTorso = Number(wrist.x || 0) < Number(torso.x || 0) ? "left" : "right";
    if (candidates.includes(byTorso)) return byTorso;
  }
  const splitX = Math.max(1, Number(runtime.viewWidth || 960)) / 2;
  const byScreen = Number(wrist.x || 0) < splitX ? "left" : "right";
  if (candidates.includes(byScreen)) return byScreen;
  if (candidates.includes(fallbackKey)) return fallbackKey;
  return candidates[0];
}

function _lecturasGamePickPairHandCandidate(side = "left", candidates = [], nowMs = 0, runtime = lecturasGameModeRuntime) {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  const sideKey = side === "right" ? "right" : "left";
  const tracked = _lecturasGameGetHandState(sideKey, runtime);
  const anchorX = _lecturasGameGetPanelAnchorX(sideKey, runtime);
  const anchorY = Number(runtime.viewHeight || 540) * 0.66;
  const hasRecentTracked = tracked?.wrist && (Number(nowMs || performance.now()) - Number(tracked?.lastSeenMs || 0)) <= 320;
  const refX = hasRecentTracked ? Number(tracked.wrist.x || anchorX) : anchorX;
  const refY = hasRecentTracked ? Number(tracked.wrist.y || anchorY) : anchorY;
  return [...candidates]
    .map((candidate) => {
      const wrist = candidate?.wrist || null;
      const conf = Math.max(0, Math.min(1, Number(candidate?.confidence || 0)));
      const dist = wrist ? Math.hypot(Number(wrist.x || 0) - refX, Number(wrist.y || 0) - refY) : 9999;
      const centerPenalty = wrist ? Math.abs(Number(wrist.x || 0) - anchorX) : 9999;
      const score = (conf * 620) - (dist * 0.82) - (centerPenalty * 0.28);
      return { candidate, score, conf };
    })
    .sort((a, b) => {
      if (Math.abs(Number(b.score || 0) - Number(a.score || 0)) > 0.001) return Number(b.score || 0) - Number(a.score || 0);
      return Number(b.conf || 0) - Number(a.conf || 0);
    })[0]?.candidate || null;
}

function _lecturasGameComputeFistMetric(pts = []) {
  if (!Array.isArray(pts) || pts.length < 21) return 1;
  const get = (idx) => pts[idx] || null;
  const wrist = get(0);
  const mcp5 = get(5);
  const mcp9 = get(9);
  const mcp13 = get(13);
  const mcp17 = get(17);
  const tips = [get(4), get(8), get(12), get(16), get(20)].filter(Boolean);
  if (!wrist || !mcp5 || !mcp9 || !mcp13 || !mcp17 || tips.length < 4) return 1;
  const palm = {
    x: (wrist.x + mcp5.x + mcp9.x + mcp13.x + mcp17.x) / 5,
    y: (wrist.y + mcp5.y + mcp9.y + mcp13.y + mcp17.y) / 5
  };
  const span = Math.max(0.01, Math.hypot(mcp5.x - mcp17.x, mcp5.y - mcp17.y));
  const avgTipDistance = tips.reduce((acc, tip) => acc + Math.hypot(tip.x - palm.x, tip.y - palm.y), 0) / tips.length;
  return avgTipDistance / span;
}

function _lecturasGameDist2D(a = null, b = null) {
  if (!a || !b) return 0;
  return Math.hypot(Number(a.x || 0) - Number(b.x || 0), Number(a.y || 0) - Number(b.y || 0));
}

function _lecturasGameClamp01(value = 0) {
  return Math.max(0, Math.min(1, Number(value || 0)));
}

function _lecturasGameComputeTraceIndexGestureScore(pts = []) {
  if (!Array.isArray(pts) || pts.length < 21) return { raw: 0, active: false };
  const get = (idx) => pts[idx] || null;
  const wrist = get(0);
  const mcp2 = get(2);
  const mcp5 = get(5);
  const mcp9 = get(9);
  const mcp13 = get(13);
  const mcp17 = get(17);
  const tip4 = get(4);
  const tip8 = get(8);
  const tip12 = get(12);
  const tip16 = get(16);
  const tip20 = get(20);
  if (!wrist || !mcp2 || !mcp5 || !mcp9 || !mcp13 || !mcp17 || !tip4 || !tip8 || !tip12 || !tip16 || !tip20) {
    return { raw: 0, active: false };
  }
  const span = Math.max(0.01, _lecturasGameDist2D(mcp5, mcp17));
  const normDist = (a = null, b = null) => _lecturasGameDist2D(a, b) / span;

  const indexOpenScore = _lecturasGameClamp01((normDist(tip8, mcp5) - 0.56) / 0.42);
  const middleClosedScore = _lecturasGameClamp01((0.94 - normDist(tip12, mcp9)) / 0.58);
  const ringClosedScore = _lecturasGameClamp01((0.94 - normDist(tip16, mcp13)) / 0.58);
  const pinkyClosedScore = _lecturasGameClamp01((0.92 - normDist(tip20, mcp17)) / 0.56);
  const thumbCloseA = _lecturasGameClamp01((0.92 - normDist(tip4, mcp2)) / 0.56);
  const thumbCloseB = _lecturasGameClamp01((0.96 - normDist(tip4, mcp5)) / 0.62);
  const thumbClosedScore = _lecturasGameClamp01((thumbCloseA * 0.62) + (thumbCloseB * 0.38));

  const raw = _lecturasGameClamp01(
    (indexOpenScore * 0.38)
    + (thumbClosedScore * 0.22)
    + (middleClosedScore * 0.14)
    + (ringClosedScore * 0.14)
    + (pinkyClosedScore * 0.12)
  );
  const active = indexOpenScore >= 0.58
    && thumbClosedScore >= 0.56
    && middleClosedScore >= 0.46
    && ringClosedScore >= 0.46
    && pinkyClosedScore >= 0.42
    && raw >= 0.62;

  return {
    raw,
    active,
    indexOpenScore,
    thumbClosedScore,
    middleClosedScore,
    ringClosedScore,
    pinkyClosedScore
  };
}

function _lecturasGameUpdateHandFromLandmarks(handKey = "right", landmarks = [], confidence = 0, nowMs = performance.now(), runtime = lecturasGameModeRuntime) {
  const hand = _lecturasGameGetHandState(handKey, runtime);
  const now = Number(nowMs || performance.now());
  const smooth = runtime.handSmoothing || {};
  const posAlphaBase = Math.max(0.08, Math.min(1, Number(smooth.positionAlpha || 0.44)));
  const aimAlphaBase = Math.max(0.06, Math.min(1, Number(smooth.aimAlpha || 0.34)));
  const velocityAlpha = Math.max(0.06, Math.min(1, Number(smooth.velocityAlpha || 0.24)));
  const handDeadzonePx = Math.max(0.4, Number(smooth.deadzonePx || 1.1));
  const handMaxStepPx = Math.max(6, Number(smooth.maxStepPx || 24));
  const speedPxWindow = Math.max(14, Number(smooth.speedPxWindow || 34));
  const prevSeenMs = Number(hand.lastSeenMs || now);
  const dtMs = Math.max(1, now - prevSeenMs);
  hand.justReleased = false;
  hand.releaseByGesture = false;
  hand.confidence = Math.max(0, Math.min(1, Number(confidence || 0)));
  if (!Array.isArray(landmarks) || landmarks.length < 21) {
    if (!hand.missingSinceMs) hand.missingSinceMs = now;
    const missingMs = Math.max(0, now - Number(hand.missingSinceMs || now));
    if (missingMs <= Math.max(80, Number(runtime.handTrackingLostResetMs || 140))) return;
    hand.closed = false;
    hand.chargeStartMs = 0;
    hand.chargeMs = 0;
    hand.chargeNorm = 0;
    hand.traceDrawGesture = false;
    hand.gestureScore = 0;
    hand.gestureActiveFrames = 0;
    hand.gestureInactiveFrames = 0;
    hand.fistMetric = 1;
    hand.wrist = null;
    hand.palm = null;
    hand.aim = null;
    hand.velocity = { x: 0, y: 0 };
    hand.lastSeenMs = 0;
    return;
  }
  hand.missingSinceMs = 0;
  hand.lastSeenMs = now;

  const wrist = landmarks[0] || null;
  const mcp5 = landmarks[5] || null;
  const mcp9 = landmarks[9] || null;
  const mcp13 = landmarks[13] || null;
  const mcp17 = landmarks[17] || null;
  const palm = (wrist && mcp5 && mcp9 && mcp13 && mcp17)
    ? {
      x: (wrist.x + mcp5.x + mcp9.x + mcp13.x + mcp17.x) / 5,
      y: (wrist.y + mcp5.y + mcp9.y + mcp13.y + mcp17.y) / 5
    }
    : null;

  const tip8 = landmarks[8] || null;
  const tip12 = landmarks[12] || null;
  const tip16 = landmarks[16] || null;
  const tip20 = landmarks[20] || null;
  const tips = [tip8, tip12, tip16, tip20].filter(Boolean);
  const fingerCenter = (wrist && tips.length)
    ? {
      x: tips.reduce((acc, pt) => acc + Number(pt.x || 0), 0) / tips.length,
      y: tips.reduce((acc, pt) => acc + Number(pt.y || 0), 0) / tips.length
    }
    : null;
  const aimRaw = (wrist && fingerCenter)
    ? { x: Number(fingerCenter.x || 0) - Number(wrist.x || 0), y: Number(fingerCenter.y || 0) - Number(wrist.y || 0) }
    : ((wrist && palm)
      ? { x: Number(palm.x || 0) - Number(wrist.x || 0), y: Number(palm.y || 0) - Number(wrist.y || 0) }
      : ((wrist && mcp9)
        ? { x: Number(mcp9.x || 0) - Number(wrist.x || 0), y: Number(mcp9.y || 0) - Number(wrist.y || 0) }
        : null));
  const aimPoseFallback = _lecturasGameGetPoseAimFallback(handKey, runtime);
  const wristRaw = wrist ? { x: Number(wrist.x || 0), y: Number(wrist.y || 0) } : null;
  const palmRaw = palm ? { x: Number(palm.x || 0), y: Number(palm.y || 0) } : null;
  const priorWrist = hand.wrist ? { x: Number(hand.wrist.x || 0), y: Number(hand.wrist.y || 0) } : null;
  const priorPalm = hand.palm ? { x: Number(hand.palm.x || 0), y: Number(hand.palm.y || 0) } : null;
  const wristDist = (priorWrist && wristRaw) ? Math.hypot(wristRaw.x - priorWrist.x, wristRaw.y - priorWrist.y) : 0;
  const wristAlpha = _lecturasGameComputeAdaptiveAlpha(
    wristDist,
    posAlphaBase * 0.52,
    Math.min(0.72, posAlphaBase * 1.42),
    speedPxWindow
  );
  if (priorWrist && wristRaw) {
    hand.wrist = {
      x: _lecturasGameSmoothAxis(wristRaw.x, priorWrist.x, wristAlpha, handDeadzonePx, handMaxStepPx),
      y: _lecturasGameSmoothAxis(wristRaw.y, priorWrist.y, wristAlpha, handDeadzonePx, handMaxStepPx)
    };
  } else {
    hand.wrist = _lecturasGameLerpPoint(priorWrist, wristRaw, wristAlpha);
  }
  const palmDist = (priorPalm && palmRaw) ? Math.hypot(palmRaw.x - priorPalm.x, palmRaw.y - priorPalm.y) : 0;
  const palmAlpha = _lecturasGameComputeAdaptiveAlpha(
    palmDist,
    posAlphaBase * 0.48,
    Math.min(0.74, posAlphaBase * 1.46),
    speedPxWindow
  );
  if (priorPalm && palmRaw) {
    hand.palm = {
      x: _lecturasGameSmoothAxis(palmRaw.x, priorPalm.x, palmAlpha, handDeadzonePx * 0.9, handMaxStepPx * 1.08),
      y: _lecturasGameSmoothAxis(palmRaw.y, priorPalm.y, palmAlpha, handDeadzonePx * 0.9, handMaxStepPx * 1.08)
    };
  } else {
    hand.palm = _lecturasGameLerpPoint(priorPalm, palmRaw, palmAlpha);
  }
  const aimInstant = _lecturasGameNormalizeVec(aimRaw, aimPoseFallback);
  const priorAim = _lecturasGameNormalizeVec(hand.aim || hand.lastValidAim, aimPoseFallback);
  const aimDot = Math.max(-1, Math.min(1, (Number(priorAim.x || 0) * Number(aimInstant.x || 0)) + (Number(priorAim.y || 0) * Number(aimInstant.y || 0))));
  const aimTurnSignal = (1 - aimDot) * speedPxWindow;
  const aimAlpha = _lecturasGameComputeAdaptiveAlpha(
    aimTurnSignal,
    aimAlphaBase * 0.52,
    Math.min(0.62, aimAlphaBase * 1.54),
    speedPxWindow * 0.9
  );
  hand.aim = _lecturasGameNormalizeVec({
    x: (priorAim.x * (1 - aimAlpha)) + (aimInstant.x * aimAlpha),
    y: (priorAim.y * (1 - aimAlpha)) + (aimInstant.y * aimAlpha)
  }, aimPoseFallback);
  if (priorWrist && hand.wrist) {
    const instVelocity = {
      x: ((Number(hand.wrist.x || 0) - Number(priorWrist.x || 0)) / dtMs) * 1000,
      y: ((Number(hand.wrist.y || 0) - Number(priorWrist.y || 0)) / dtMs) * 1000
    };
    hand.velocity = _lecturasGameLerpPoint(hand.velocity, instVelocity, velocityAlpha) || instVelocity;
  }

  const metricRaw = _lecturasGameComputeFistMetric(landmarks);
  hand.fistMetric = Number.isFinite(Number(hand.fistMetric))
    ? ((Number(hand.fistMetric || 1) * 0.72) + (Number(metricRaw || 1) * 0.28))
    : Number(metricRaw || 1);
  const metric = Number(hand.fistMetric || metricRaw || 1);
  const cfg = runtime.chargeConfig || {};
  const closeThreshold = Math.max(0.4, Number(cfg.closeThreshold || 0.8));
  const openThreshold = Math.max(closeThreshold + 0.04, Number(cfg.openThreshold || 0.95));
  const wasClosed = !!hand.closed;
  let isClosed = wasClosed;
  if (wasClosed) isClosed = metric <= openThreshold;
  else isClosed = metric <= closeThreshold;

  if (isClosed) {
    if (!wasClosed) hand.chargeStartMs = now;
    hand.closed = true;
    hand.chargeMs = Math.max(0, now - Number(hand.chargeStartMs || now));
    const maxMs = Math.max(300, Number(cfg.maxMs || LECTURAS_GAME_MAX_CHARGE_MS));
    hand.chargeNorm = Math.max(0, Math.min(1, hand.chargeMs / maxMs));
    hand.justReleased = false;
    hand.releaseByGesture = false;
  } else {
    hand.closed = false;
    hand.justReleased = wasClosed;
    hand.releaseByGesture = wasClosed;
    if (!wasClosed) {
      hand.chargeMs = 0;
      hand.chargeNorm = 0;
      hand.chargeStartMs = 0;
    }
  }

  const gestureEval = _lecturasGameComputeTraceIndexGestureScore(landmarks);
  const rawScore = Number(gestureEval?.raw || 0);
  const priorScore = Number(hand.gestureScore || 0);
  const smoothedScore = _lecturasGameClamp01((priorScore * 0.72) + (rawScore * 0.28));
  hand.gestureScore = smoothedScore;
  if (gestureEval?.active) {
    hand.gestureActiveFrames = Math.min(12, Number(hand.gestureActiveFrames || 0) + 1);
    hand.gestureInactiveFrames = 0;
  } else {
    hand.gestureInactiveFrames = Math.min(12, Number(hand.gestureInactiveFrames || 0) + 1);
    hand.gestureActiveFrames = 0;
  }
  const wasTraceGesture = hand.traceDrawGesture === true;
  if (wasTraceGesture) {
    hand.traceDrawGesture = !(hand.gestureInactiveFrames >= 3 && smoothedScore < 0.54);
  } else {
    hand.traceDrawGesture = hand.gestureActiveFrames >= 2 && smoothedScore >= 0.62;
  }
}

function _lecturasGameApplyAimDirectionFilter(hand = null, handKey = "right", runtime = lecturasGameModeRuntime) {
  if (!hand) return handKey === "left" ? { x: 0.62, y: -0.4 } : { x: -0.62, y: -0.4 };
  const downLimit = Number(runtime.directionFilter?.maxDownwardY || 0.52);
  const currentBase = _lecturasGameNormalizeVec(hand.aim || null, _lecturasGameGetPoseAimFallback(handKey, runtime));
  let current = { ...currentBase };
  if (hand?.wrist && hand?.palm) {
    const palmDir = _lecturasGameNormalizeVec({
      x: Number(hand.palm.x || 0) - Number(hand.wrist.x || 0),
      y: Number(hand.palm.y || 0) - Number(hand.wrist.y || 0)
    }, null);
    const palmMag = Math.hypot(
      Number(hand.palm.x || 0) - Number(hand.wrist.x || 0),
      Number(hand.palm.y || 0) - Number(hand.wrist.y || 0)
    );
    if (Number.isFinite(palmDir?.x) && Number.isFinite(palmDir?.y) && palmMag > 0.0001) {
      current = _lecturasGameNormalizeVec({
        x: (currentBase.x * 0.42) + (palmDir.x * 0.58),
        y: (currentBase.y * 0.42) + (palmDir.y * 0.58)
      }, currentBase);
    }
  }
  const velocity = hand?.velocity || null;
  const speed = Math.hypot(Number(velocity?.x || 0), Number(velocity?.y || 0));
  if (speed > 110) {
    const velDir = _lecturasGameNormalizeVec(velocity, current);
    current = _lecturasGameNormalizeVec({
      x: (current.x * 0.7) + (velDir.x * 0.3),
      y: (current.y * 0.7) + (velDir.y * 0.3)
    }, current);
  }
  if (current.y > downLimit) {
    const last = _lecturasGameNormalizeVec(hand.lastValidAim || null, handKey === "left" ? { x: 0.62, y: -0.4 } : { x: -0.62, y: -0.4 });
    if (last.y <= downLimit) return last;
    return handKey === "left" ? { x: 0.62, y: -0.4 } : { x: -0.62, y: -0.4 };
  }
  hand.lastValidAim = { x: current.x, y: current.y };
  return current;
}

function _lecturasGameSelectVisualHandNode(handKey = "right", joints = [], runtime = lecturasGameModeRuntime) {
  const key = String(handKey || "right").toLowerCase();
  const all = Array.isArray(joints) ? joints : [];
  const isPair = runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR;
  let handNodes = all.filter((joint) => String(joint?.kind || "").toLowerCase().startsWith(`${key}hand`));
  if (isPair) {
    handNodes = all.filter((joint) => {
      if (!String(joint?.kind || "").toLowerCase().includes("hand")) return false;
      const panel = String(joint?.panelSide || joint?.playerSide || "");
      if (panel === "left" || panel === "right") return panel === key;
      return _lecturasGameGetSideByX(joint?.x, runtime) === key;
    });
  }
  if (!handNodes.length) {
    const wrists = all.filter((joint) => String(joint?.kind || "").toLowerCase() === `${key}wrist`);
    if (isPair) {
      return wrists.find((joint) => {
        const panel = String(joint?.panelSide || joint?.playerSide || "");
        if (panel === "left" || panel === "right") return panel === key;
        return _lecturasGameGetSideByX(joint?.x, runtime) === key;
      }) || null;
    }
    return wrists[0] || null;
  }
  if (handNodes.length === 1) return handNodes[0];
  const tracked = _lecturasGameGetHandState(key, runtime);
  const refX = Number(tracked?.wrist?.x || tracked?.palm?.x || _lecturasGameGetPanelAnchorX(key, runtime));
  const refSide = isPair ? key : _lecturasGameGetSideByX(refX, runtime);
  const sideMatches = handNodes.filter((joint) => {
    const panel = String(joint?.panelSide || joint?.playerSide || "");
    if (panel === "left" || panel === "right") return panel === refSide;
    return _lecturasGameGetSideByX(joint?.x, runtime) === refSide;
  });
  const pool = sideMatches.length ? sideMatches : handNodes;
  return [...pool].sort((a, b) => Math.abs(Number(a?.x || 0) - refX) - Math.abs(Number(b?.x || 0) - refX))[0] || pool[0] || null;
}

function _lecturasGameGetFireLaunchPoint(handKey = "right", runtime = lecturasGameModeRuntime) {
  const renderPose = _lecturasGameBuildPoseRenderData(runtime);
  const visualHand = _lecturasGameSelectVisualHandNode(handKey, renderPose.joints || [], runtime);
  if (visualHand) return { x: Number(visualHand.x || 0), y: Number(visualHand.y || 0) };
  const key = String(handKey || "right").toLowerCase();
  const hand = _lecturasGameGetHandState(key, runtime);
  return hand?.palm || hand?.wrist || { x: runtime.viewWidth * 0.5, y: runtime.viewHeight * 0.62 };
}

function _lecturasGameTryThrowByHandRelease(runtime = lecturasGameModeRuntime, nowMs = performance.now()) {
  if (!_lecturasGameIsAnyFireModeActive(runtime, nowMs) || runtime.mode !== LECTURAS_GAME_MODE.PLAYING) return;
  ["left", "right"].forEach((handKey) => {
    const hand = _lecturasGameGetHandState(handKey, runtime);
    if (!hand?.justReleased || hand.releaseByGesture !== true) return;
    hand.justReleased = false;
    hand.releaseByGesture = false;
    const minMs = Math.max(80, Number(runtime.chargeConfig?.minMs || LECTURAS_GAME_MIN_CHARGE_MS));
    if (Number(hand.chargeMs || 0) < minMs) {
      hand.chargeMs = 0;
      hand.chargeNorm = 0;
      hand.chargeStartMs = 0;
      return;
    }
    if ((Number(nowMs || performance.now()) - Number(hand.lastReleaseMs || 0)) < Math.max(120, Number(runtime.fireThrowCooldownMs || LECTURAS_GAME_FIRE_THROW_COOLDOWN_MS))) {
      hand.chargeMs = 0;
      hand.chargeNorm = 0;
      hand.chargeStartMs = 0;
      return;
    }
    const direction = _lecturasGameApplyAimDirectionFilter(hand, handKey, runtime);
    const origin = _lecturasGameGetFireLaunchPoint(handKey, runtime);
    const throwSide = _lecturasGameGetSideByX(origin.x, runtime);
    if (!_lecturasGameIsFireModeActiveForSide(throwSide, runtime, nowMs)) {
      hand.chargeMs = 0;
      hand.chargeNorm = 0;
      hand.chargeStartMs = 0;
      return;
    }
    const chargeNorm = Math.max(0, Math.min(1, Number(hand.chargeNorm || 0)));
    const chargeScale = 0.8 + (chargeNorm * 1.8);
    const speed = Math.hypot(Number(hand.velocity?.x || 0), Number(hand.velocity?.y || 0));
    const launchSpeedScale = Math.max(0.78, Math.min(1.7, 0.92 + (chargeNorm * 0.42) + Math.min(0.36, speed / 1700)));
    const thrown = _lecturasGameSpawnFireball(origin, direction, runtime, {
      chargeScale,
      chargeNorm,
      side: throwSide,
      spawnHand: handKey,
      launchSpeedScale,
      motionBoost: {
        x: Number(hand.velocity?.x || 0) * 0.12,
        y: Number(hand.velocity?.y || 0) * 0.12
      }
    });
    if (thrown) {
      hand.lastReleaseMs = Number(nowMs || performance.now());
      runtime.lastThrowMs = hand.lastReleaseMs;
    }
    hand.chargeMs = 0;
    hand.chargeNorm = 0;
    hand.chargeStartMs = 0;
  });
}

function _lecturasGameTryThrowBySimulation(runtime = lecturasGameModeRuntime, nowMs = performance.now()) {
  if (!_lecturasGameIsAnyFireModeActive(runtime, nowMs) || runtime.mode !== LECTURAS_GAME_MODE.PLAYING) {
    if (runtime.simFireCharging) {
      runtime.simFireCharging = false;
      runtime.simFireReleasePending = false;
      const hand = _lecturasGameGetHandState("right", runtime);
      hand.closed = false;
      hand.chargeStartMs = 0;
      hand.chargeMs = 0;
      hand.chargeNorm = 0;
    }
    return;
  }
  const hand = _lecturasGameGetHandState("right", runtime);
  if (runtime.simFireCharging) {
    if (!hand.closed) {
      hand.closed = true;
      hand.chargeStartMs = Number(runtime.simFireChargeStartMs || nowMs);
    }
    hand.chargeMs = Math.max(0, Number(nowMs || performance.now()) - Number(hand.chargeStartMs || nowMs));
    const maxMs = Math.max(300, Number(runtime.chargeConfig?.maxMs || LECTURAS_GAME_MAX_CHARGE_MS));
    hand.chargeNorm = Math.max(0, Math.min(1, hand.chargeMs / maxMs));
    const dirX = (runtime.inputKeys.right ? 1 : 0) - (runtime.inputKeys.left ? 1 : 0);
    const dirY = (runtime.inputKeys.down ? 1 : 0) - (runtime.inputKeys.up ? 1 : 0);
    const fallback = runtime.lastThrowVector || { x: 0, y: -1 };
    hand.aim = (dirX || dirY) ? _lecturasGameNormalizeVec({ x: dirX, y: dirY }, fallback) : _lecturasGameNormalizeVec(fallback, { x: 0, y: -1 });
    const wrist = (Array.isArray(runtime.pose?.joints) ? runtime.pose.joints : []).find((joint) => String(joint?.kind || "").toLowerCase() === "rightwrist");
    hand.wrist = wrist ? { x: Number(wrist.x || 0), y: Number(wrist.y || 0) } : { x: runtime.viewWidth * 0.5, y: runtime.viewHeight * 0.66 };
    hand.palm = hand.wrist ? { ...hand.wrist } : null;
  }
  if (!runtime.simFireReleasePending) return;
  runtime.simFireReleasePending = false;
  if (!hand.closed) return;
  hand.justReleased = true;
  hand.releaseByGesture = true;
  hand.closed = false;
  _lecturasGameTryThrowByHandRelease(runtime, nowMs);
}

function _lecturasGameUpdateFireballs(dtMs = 16, runtime = lecturasGameModeRuntime) {
  const dtSec = Math.max(1, Number(dtMs || 16)) / 1000;
  const nowMs = performance.now();
  const wordActivationY = _lecturasGameGetWordActivationY(runtime, nowMs);
  runtime.fireballs = (runtime.fireballs || []).filter((ball) => {
    ball.lifeMs = Number(ball.lifeMs || 0) + Number(dtMs || 16);
    ball.x += Number(ball.vx || 0) * dtSec;
    ball.y += Number(ball.vy || 0) * dtSec;
    if (!Array.isArray(ball.trail)) ball.trail = [];
    ball.trail.unshift({ x: Number(ball.x || 0), y: Number(ball.y || 0), age: 0 });
    if (ball.trail.length > LECTURAS_GAME_MAX_FIRE_TRAIL_POINTS) ball.trail.length = LECTURAS_GAME_MAX_FIRE_TRAIL_POINTS;
    ball.trail.forEach((pt) => { pt.age = Number(pt.age || 0) + Number(dtMs || 16); });
    if (ball.lifeMs > Number(ball.maxLifeMs || 1000)) return false;
    const radius = Math.max(2, Number(ball.radius || 8));
    let minX = 0;
    let maxX = runtime.viewWidth;
    if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR) {
      const side = String(ball.side || _lecturasGameGetSideByX(ball.x, runtime));
      const bounds = _lecturasGameWordSideBounds(side, runtime);
      minX = bounds.minX;
      maxX = bounds.maxX;
      ball.side = side;
    }
    if (ball.bounceX !== false) {
      if ((ball.x - radius) <= minX && Number(ball.vx || 0) < 0) {
        ball.x = minX + radius + 1;
        ball.vx = Math.abs(Number(ball.vx || 0));
      } else if ((ball.x + radius) >= maxX && Number(ball.vx || 0) > 0) {
        ball.x = maxX - radius - 1;
        ball.vx = -Math.abs(Number(ball.vx || 0));
      }
    }
    if (ball.x < -120 || ball.x > runtime.viewWidth + 120 || ball.y < -120 || ball.y > runtime.viewHeight + 120) return false;
    let keepBall = true;
    for (const word of runtime.words) {
      if (!word?.active) continue;
      if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR) {
        const wordSide = String(word.side || _lecturasGameGetSideByX(word.x, runtime));
        if (wordSide !== String(ball.side || "")) continue;
      }
      if (_lecturasGameIsPacifistActive(String(ball.side || ""), runtime, nowMs)) continue;
      const rect = _lecturasGameGetWordCollisionRect(word, { mode: "fireball" });
      // Words above the stage-top HUD are not yet active targets for fireballs.
      if ((Number(rect.y || 0) + (Number(rect.height || 0) * 0.72)) < wordActivationY) continue;
      const touched = _lecturasGameCircleRectCollision({ x: ball.x, y: ball.y, r: ball.radius }, rect);
      if (!touched) continue;
      runtime.recentHits.set(word.id, performance.now());
      if (word.isCorrect) {
        if (_lecturasGameIsOrderChallenge(runtime)) {
          _lecturasGameHandleOrderCorrectHit(word, runtime, "fireball");
        } else {
          _lecturasGameSpawnBalloonPop(word, runtime);
          _lecturasGameRemoveBalloonMesh(word, runtime);
          word.active = false;
          _lecturasGameHandleLoseByCorrectHit(runtime, "fireball");
        }
      } else {
        _lecturasGameHandleWrongWordDestroyed(word, runtime, 10);
      }
      if (Number.isFinite(Number(ball.penetrationLeft))) {
        ball.penetrationLeft = Math.max(0, Number(ball.penetrationLeft || 0) - 1);
        if (ball.penetrationLeft <= 0) {
          keepBall = false;
          break;
        }
      }
    }
    return keepBall && runtime.mode === LECTURAS_GAME_MODE.PLAYING;
  });
}

async function _lecturasGameEnsureVisionTasks() {
  if (lecturasGameVisionTasksPromise) return lecturasGameVisionTasksPromise;
  lecturasGameVisionTasksPromise = import("./vendor/mediapipe/vision_bundle.mjs")
    .then((mod) => mod || null)
    .catch((err) => {
      console.warn("[LecturasGame] tasks-vision no disponible:", err);
      return null;
    });
  return lecturasGameVisionTasksPromise;
}

async function _lecturasGameEnsurePoseLandmarker() {
  if (lecturasGamePoseLandmarkerPromise) return lecturasGamePoseLandmarkerPromise;
  lecturasGamePoseLandmarkerPromise = (async () => {
    try {
      const mp = await _lecturasGameEnsureVisionTasks();
      const { FilesetResolver, PoseLandmarker } = mp || {};
      if (!FilesetResolver || !PoseLandmarker) return null;
      const vision = await FilesetResolver.forVisionTasks("./vendor/mediapipe/wasm");
      const pose = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numPoses: 2,
        outputSegmentationMasks: true,
        minPoseDetectionConfidence: 0.45,
        minPosePresenceConfidence: 0.45,
        minTrackingConfidence: 0.45
      });
      return pose || null;
    } catch (err) {
      console.warn("[LecturasGame] PoseLandmarker no disponible:", err);
      return null;
    }
  })();
  return lecturasGamePoseLandmarkerPromise;
}

async function _lecturasGameEnsureHandLandmarker() {
  if (lecturasGameHandLandmarkerPromise) return lecturasGameHandLandmarkerPromise;
  lecturasGameHandLandmarkerPromise = (async () => {
    try {
      const mp = await _lecturasGameEnsureVisionTasks();
      const { FilesetResolver, HandLandmarker } = mp || {};
      if (!FilesetResolver || !HandLandmarker) return null;
      const vision = await FilesetResolver.forVisionTasks("./vendor/mediapipe/wasm");
      const hand = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 4,
        minHandDetectionConfidence: 0.45,
        minHandPresenceConfidence: 0.45,
        minTrackingConfidence: 0.45
      });
      return hand || null;
    } catch (err) {
      console.warn("[LecturasGame] HandLandmarker no disponible:", err);
      return null;
    }
  })();
  return lecturasGameHandLandmarkerPromise;
}

function _lecturasGameMapPoseToCollision(points = [], width = 0, height = 0) {
  const runtime = lecturasGameModeRuntime;
  const radii = runtime.jointRadiusConfig || {};
  const mapPoint = (idx) => {
    const lm = points[idx];
    if (!lm) return null;
    const vis = Number(lm.visibility ?? lm.presence ?? 0.8);
    if (vis < 0.25) return null;
    return {
      x: (1 - Number(lm.x || 0)) * width,
      y: Number(lm.y || 0) * height,
      v: vis
    };
  };
  const nose = mapPoint(0);
  const leftShoulder = mapPoint(11);
  const rightShoulder = mapPoint(12);
  const leftElbow = mapPoint(13);
  const rightElbow = mapPoint(14);
  const leftWrist = mapPoint(15);
  const rightWrist = mapPoint(16);
  const leftHip = mapPoint(23);
  const rightHip = mapPoint(24);

  const shoulderMid = (leftShoulder && rightShoulder)
    ? { x: (leftShoulder.x + rightShoulder.x) / 2, y: (leftShoulder.y + rightShoulder.y) / 2 }
    : null;
  const hipMid = (leftHip && rightHip)
    ? { x: (leftHip.x + rightHip.x) / 2, y: (leftHip.y + rightHip.y) / 2 }
    : null;
  const torso = (shoulderMid && hipMid)
    ? { x: (shoulderMid.x + hipMid.x) / 2, y: (shoulderMid.y + hipMid.y) / 2 }
    : null;

  const joints = [];
  if (nose) joints.push({ x: nose.x, y: nose.y, r: Number(radii.head || 14), kind: "head" });
  if (leftWrist) joints.push({ x: leftWrist.x, y: leftWrist.y, r: Number(radii.leftWrist || 14), kind: "leftWrist" });
  if (rightWrist) joints.push({ x: rightWrist.x, y: rightWrist.y, r: Number(radii.rightWrist || 14), kind: "rightWrist" });
  if (torso) joints.push({ x: torso.x, y: torso.y, r: Number(radii.torso || 18), kind: "torso" });

  const segOf = (a, b, kind = "") => (a && b ? { ax: a.x, ay: a.y, bx: b.x, by: b.y, kind } : null);
  const segments = [
    segOf(leftShoulder, leftElbow, "leftArm"),
    segOf(leftElbow, leftWrist, "leftForearm"),
    segOf(rightShoulder, rightElbow, "rightArm"),
    segOf(rightElbow, rightWrist, "rightForearm"),
    segOf(leftShoulder, rightShoulder, "shoulders"),
    segOf(shoulderMid, hipMid, "torso")
  ].filter(Boolean);

  return {
    joints,
    segments,
    confidence: Math.min(1, Math.max(0, (joints.length + segments.length) / 10))
  };
}

function _lecturasGameGetPoseCenterX(pose = null) {
  const torso = (pose?.joints || []).find((joint) => String(joint?.kind || "").toLowerCase() === "torso");
  if (torso) return Number(torso.x || 0);
  const head = (pose?.joints || []).find((joint) => String(joint?.kind || "").toLowerCase() === "head");
  if (head) return Number(head.x || 0);
  const segments = Array.isArray(pose?.segments) ? pose.segments : [];
  if (!segments.length) return 0;
  const avg = segments.reduce((acc, seg) => acc + ((Number(seg.ax || 0) + Number(seg.bx || 0)) / 2), 0) / segments.length;
  return Number(avg || 0);
}

function _lecturasGameTagPoseWithSide(pose = null, side = "left") {
  const sideKey = side === "right" ? "right" : "left";
  return {
    joints: (pose?.joints || []).map((joint) => ({ ...joint, playerSide: sideKey })),
    segments: (pose?.segments || []).map((seg) => ({ ...seg, playerSide: sideKey })),
    confidence: Number(pose?.confidence || 0)
  };
}

function _lecturasGameHasPoseData(pose = null) {
  return ((pose?.joints?.length || 0) > 0 || (pose?.segments?.length || 0) > 0);
}

function _lecturasGameStabilizePose(rawPose = null, runtime = lecturasGameModeRuntime) {
  const base = rawPose || { joints: [], segments: [], confidence: 0, updatedAt: performance.now() };
  const prev = runtime.poseStable || { joints: [], segments: [] };
  const smoothCfg = runtime.poseSmoothing || {};
  const isPairMode = runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR;
  const isTraceMode = _lecturasGameIsTraceChallenge(runtime);
  const stabilityFactor = isTraceMode ? 0.94 : 1;
  const responsivenessBoost = isTraceMode ? 1 : (_lecturasGameIsOrderChallenge(runtime) ? 1.14 : 1.2);
  const alphaMinBase = isPairMode
    ? Number(smoothCfg.pairAlphaMin || 0.22)
    : Number(smoothCfg.soloAlphaMin || 0.24);
  const alphaMaxBase = isPairMode
    ? Number(smoothCfg.pairAlphaMax || 0.42)
    : Number(smoothCfg.soloAlphaMax || 0.46);
  const alphaMin = Math.max(0.05, Math.min(0.92, alphaMinBase * stabilityFactor * responsivenessBoost));
  const alphaMax = Math.max(alphaMin, Math.min(0.97, alphaMaxBase * stabilityFactor * responsivenessBoost));
  const speedPxWindow = Math.max(10, Number(smoothCfg.speedPxWindow || 42));
  const confidence = Math.max(0, Math.min(1, Number(base.confidence || 0)));
  const confidenceHoldFloor = Math.max(0.08, Math.min(0.95, Number(smoothCfg.confidenceHoldFloor || 0.34)));
  const lowConfidence = confidence > 0 && confidence < confidenceHoldFloor;
  const jointDeadzonePx = Math.max(0.6, Number(smoothCfg.jointDeadzonePx || 1.25) * (isTraceMode ? 1.16 : 0.82) * (lowConfidence ? 1.18 : 1));
  const segmentDeadzonePx = Math.max(0.6, Number(smoothCfg.segmentDeadzonePx || 1.1) * (isTraceMode ? 1.16 : 0.82) * (lowConfidence ? 1.18 : 1));
  const maxJointStepPx = Math.max(8, Number(smoothCfg.maxJointStepPx || 32) * (isTraceMode ? 0.94 : 1.32) * (lowConfidence ? 0.84 : 1));
  const maxSegmentStepPx = Math.max(8, Number(smoothCfg.maxSegmentStepPx || 34) * (isTraceMode ? 0.94 : 1.34) * (lowConfidence ? 0.84 : 1));
  const reacquireJumpPx = Math.max(60, Number(smoothCfg.reacquireJumpPx || 140));
  const jointKeyOf = (joint = null) => {
    const kind = String(joint?.kind || "").toLowerCase();
    let side = String(joint?.playerSide || "");
    if (!side && runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR) {
      side = _lecturasGameGetSideByX(Number(joint?.x || 0), runtime);
    }
    return `${kind}::${side || "solo"}`;
  };
  const segmentKeyOf = (seg = null) => {
    const kind = String(seg?.kind || "").toLowerCase();
    let side = String(seg?.playerSide || "");
    if (!side && runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR) {
      side = _lecturasGameGetSideByX((Number(seg?.ax || 0) + Number(seg?.bx || 0)) / 2, runtime);
    }
    return `${kind}::${side || "solo"}`;
  };
  const stableByKind = new Map((prev.joints || []).map((j) => [jointKeyOf(j), j]));
  const stableJoints = (base.joints || []).map((joint) => {
    const key = jointKeyOf(joint);
    const prior = stableByKind.get(key);
    const rawX = Number(joint.x || 0);
    const rawY = Number(joint.y || 0);
    const prevX = Number(prior?.x || rawX);
    const prevY = Number(prior?.y || rawY);
    const dx = rawX - prevX;
    const dy = rawY - prevY;
    const dist = Math.hypot(dx, dy);
    if (prior && lowConfidence && dist >= reacquireJumpPx) {
      return {
        kind: joint.kind,
        x: prevX,
        y: prevY,
        r: Number(runtime.jointRadiusConfig?.[joint.kind] || prior.r || joint.r || 14),
        playerSide: joint?.playerSide || prior?.playerSide
      };
    }
    const alpha = _lecturasGameComputeAdaptiveAlpha(dist, alphaMin, alphaMax, speedPxWindow);
    const x = !prior
      ? rawX
      : _lecturasGameSmoothAxis(rawX, prevX, alpha, jointDeadzonePx, maxJointStepPx);
    const y = !prior
      ? rawY
      : _lecturasGameSmoothAxis(rawY, prevY, alpha, jointDeadzonePx, maxJointStepPx);
    return {
      kind: joint.kind,
      x,
      y,
      r: Number(runtime.jointRadiusConfig?.[joint.kind] || joint.r || 14),
      playerSide: joint?.playerSide
    };
  });
  const segmentByKind = new Map((prev.segments || []).map((s) => [segmentKeyOf(s), s]));
  const stableSegments = (base.segments || []).map((seg) => {
    const key = segmentKeyOf(seg);
    const prior = segmentByKind.get(key);
    if (!prior) {
      return {
        ...seg,
        playerSide: seg?.playerSide
      };
    }
    const rawAx = Number(seg.ax || 0);
    const rawAy = Number(seg.ay || 0);
    const rawBx = Number(seg.bx || 0);
    const rawBy = Number(seg.by || 0);
    const prevAx = Number(prior.ax || rawAx);
    const prevAy = Number(prior.ay || rawAy);
    const prevBx = Number(prior.bx || rawBx);
    const prevBy = Number(prior.by || rawBy);
    const distA = Math.hypot(rawAx - prevAx, rawAy - prevAy);
    const distB = Math.hypot(rawBx - prevBx, rawBy - prevBy);
    if (lowConfidence && Math.max(distA, distB) >= reacquireJumpPx) {
      return {
        kind: seg.kind,
        ax: prevAx,
        ay: prevAy,
        bx: prevBx,
        by: prevBy,
        playerSide: seg?.playerSide || prior?.playerSide
      };
    }
    const alphaA = _lecturasGameComputeAdaptiveAlpha(distA, alphaMin, alphaMax, speedPxWindow);
    const alphaB = _lecturasGameComputeAdaptiveAlpha(distB, alphaMin, alphaMax, speedPxWindow);
    return {
      kind: seg.kind,
      ax: _lecturasGameSmoothAxis(rawAx, prevAx, alphaA, segmentDeadzonePx, maxSegmentStepPx),
      ay: _lecturasGameSmoothAxis(rawAy, prevAy, alphaA, segmentDeadzonePx, maxSegmentStepPx),
      bx: _lecturasGameSmoothAxis(rawBx, prevBx, alphaB, segmentDeadzonePx, maxSegmentStepPx),
      by: _lecturasGameSmoothAxis(rawBy, prevBy, alphaB, segmentDeadzonePx, maxSegmentStepPx),
      playerSide: seg?.playerSide
    };
  });
  return {
    joints: stableJoints,
    segments: stableSegments,
    confidence: Number(base.confidence || 0),
    updatedAt: Number(base.updatedAt || performance.now())
  };
}

function _lecturasGameTryDetectPose(nowMs = 0) {
  const runtime = lecturasGameModeRuntime;
  if (!runtime.poseLandmarker || !runtime.cameraReady || !runtime.videoEl) return;
  if ((nowMs - Number(runtime.poseLastDetectMs || 0)) < runtime.poseDetectIntervalMs) return;
  if (runtime.videoEl.readyState < 2) return;
  runtime.poseLastDetectMs = nowMs;
  if (!runtime.poseDetectStartMs) runtime.poseDetectStartMs = nowMs;
  let detected = false;
  let rawMasks = [];
  try {
    const result = runtime.poseLandmarker.detectForVideo(runtime.videoEl, nowMs);
    const allLandmarks = Array.isArray(result?.landmarks) ? result.landmarks : [];
    rawMasks = Array.isArray(result?.segmentationMasks) ? result.segmentationMasks : [];
    const entries = allLandmarks
      .map((landmarks, idx) => ({
        idx,
        mapped: _lecturasGameMapPoseToCollision(landmarks, runtime.viewWidth, runtime.viewHeight),
        mask: rawMasks[idx] || null
      }))
      .filter((entry) => ((entry?.mapped?.joints?.length || 0) > 0 || (entry?.mapped?.segments?.length || 0) > 0));
    const maskUpdateMinMs = Math.max(66, Number(runtime.silhouette?.maskUpdateIntervalMs || 85));
    const shouldUpdateMasks = (Number(nowMs || 0) - Number(runtime.silhouette?.lastMaskUpdateMs || 0)) >= maskUpdateMinMs;
    const consumedMaskIdx = new Set();
    if (entries.length) {
      let merged = entries[0].mapped;
      if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR) {
        const panelCenterX = {
          left: _lecturasGameGetPanelAnchorX("left", runtime),
          right: _lecturasGameGetPanelAnchorX("right", runtime)
        };
        const prevCenter = {
          left: _lecturasGameHasPoseData(runtime?.players?.left?.pose) ? _lecturasGameGetPoseCenterX(runtime.players.left.pose) : panelCenterX.left,
          right: _lecturasGameHasPoseData(runtime?.players?.right?.pose) ? _lecturasGameGetPoseCenterX(runtime.players.right.pose) : panelCenterX.right
        };
        const scoredEntries = entries.map((entry) => ({
          entry,
          centerX: _lecturasGameGetPoseCenterX(entry?.mapped),
          confidence: Number(entry?.mapped?.confidence || 0)
        }));
        let leftEntry = null;
        let rightEntry = null;
        if (scoredEntries.length === 1) {
          const single = scoredEntries[0];
          const distLeft = Math.abs(Number(single.centerX || 0) - Number(prevCenter.left || 0));
          const distRight = Math.abs(Number(single.centerX || 0) - Number(prevCenter.right || 0));
          if (distLeft <= distRight) leftEntry = single.entry;
          else rightEntry = single.entry;
        } else {
          let best = null;
          for (let i = 0; i < scoredEntries.length; i += 1) {
            for (let j = i + 1; j < scoredEntries.length; j += 1) {
              const a = scoredEntries[i];
              const b = scoredEntries[j];
              const normalCost = Math.abs(a.centerX - prevCenter.left) + Math.abs(b.centerX - prevCenter.right);
              const swappedCost = Math.abs(b.centerX - prevCenter.left) + Math.abs(a.centerX - prevCenter.right);
              const normal = {
                leftEntry: a.entry,
                rightEntry: b.entry,
                cost: normalCost,
                confidence: a.confidence + b.confidence
              };
              const swapped = {
                leftEntry: b.entry,
                rightEntry: a.entry,
                cost: swappedCost,
                confidence: a.confidence + b.confidence
              };
              [normal, swapped].forEach((candidate) => {
                if (!best) {
                  best = candidate;
                  return;
                }
                if (candidate.cost < best.cost - 0.001) {
                  best = candidate;
                  return;
                }
                if (Math.abs(candidate.cost - best.cost) <= 0.001 && candidate.confidence > best.confidence) {
                  best = candidate;
                }
              });
            }
          }
          if (best) {
            leftEntry = best.leftEntry;
            rightEntry = best.rightEntry;
          } else {
            const byX = [...scoredEntries].sort((a, b) => Number(a.centerX || 0) - Number(b.centerX || 0));
            leftEntry = byX[0]?.entry || null;
            rightEntry = byX[1]?.entry || null;
          }
        }
        const persistWindowMs = 240;
        let leftPose = leftEntry?.mapped || { joints: [], segments: [], confidence: 0 };
        let rightPose = rightEntry?.mapped || { joints: [], segments: [], confidence: 0 };
        if (!_lecturasGameHasPoseData(leftPose)) {
          const prevLeft = runtime?.players?.left;
          if ((Number(nowMs || 0) - Number(prevLeft?.poseLastSeenMs || 0)) <= persistWindowMs && _lecturasGameHasPoseData(prevLeft?.pose)) {
            leftPose = prevLeft.pose;
          }
        }
        if (!_lecturasGameHasPoseData(rightPose)) {
          const prevRight = runtime?.players?.right;
          if ((Number(nowMs || 0) - Number(prevRight?.poseLastSeenMs || 0)) <= persistWindowMs && _lecturasGameHasPoseData(prevRight?.pose)) {
            rightPose = prevRight.pose;
          }
        }
        runtime.players.left = {
          ...(runtime.players.left || _lecturasGameCreatePlayerSummary("left")),
          side: "left",
          pose: leftPose,
          poseLastSeenMs: _lecturasGameHasPoseData(leftEntry?.mapped) ? Number(nowMs || performance.now()) : Number(runtime?.players?.left?.poseLastSeenMs || 0)
        };
        runtime.players.right = {
          ...(runtime.players.right || _lecturasGameCreatePlayerSummary("right")),
          side: "right",
          pose: rightPose,
          poseLastSeenMs: _lecturasGameHasPoseData(rightEntry?.mapped) ? Number(nowMs || performance.now()) : Number(runtime?.players?.right?.poseLastSeenMs || 0)
        };
        const leftTagged = _lecturasGameTagPoseWithSide(leftPose, "left");
        const rightTagged = _lecturasGameTagPoseWithSide(rightPose, "right");
        merged = {
          joints: [...(leftTagged.joints || []), ...(rightTagged.joints || [])],
          segments: [...(leftTagged.segments || []), ...(rightTagged.segments || [])],
          confidence: Math.min(1, (Number(leftPose.confidence || 0) + Number(rightPose.confidence || 0)) / 2)
        };
        if (shouldUpdateMasks) {
          if (leftEntry?.mask) {
            _lecturasGameStoreSilhouetteMask("left", leftEntry.mask, nowMs, runtime);
            consumedMaskIdx.add(Number(leftEntry.idx || 0));
          }
          if (rightEntry?.mask) {
            _lecturasGameStoreSilhouetteMask("right", rightEntry.mask, nowMs, runtime);
            consumedMaskIdx.add(Number(rightEntry.idx || 0));
          }
          runtime.silhouette.lastMaskUpdateMs = Number(nowMs || performance.now());
        }
      } else {
        const bestEntry = [...entries]
          .sort((a, b) => Number(b?.mapped?.confidence || 0) - Number(a?.mapped?.confidence || 0))[0] || null;
        merged = bestEntry?.mapped || merged;
        if (shouldUpdateMasks && bestEntry?.mask) {
          _lecturasGameStoreSilhouetteMask("solo", bestEntry.mask, nowMs, runtime);
          consumedMaskIdx.add(Number(bestEntry.idx || 0));
          runtime.silhouette.lastMaskUpdateMs = Number(nowMs || performance.now());
        }
      }
      runtime.poseRaw = {
        joints: merged.joints || [],
        segments: merged.segments || [],
        confidence: Number(merged.confidence || 0),
        updatedAt: nowMs
      };
      runtime.poseStable = _lecturasGameStabilizePose(runtime.poseRaw, runtime);
      runtime.pose = runtime.poseStable;
      runtime.poseLastSeenMs = nowMs;
      runtime.poseDetectStartMs = nowMs;
      detected = true;
      rawMasks.forEach((mask, idx) => {
        if (!mask || consumedMaskIdx.has(Number(idx || 0))) return;
        _lecturasGameCloseSegmentationMask(mask);
      });
    } else {
      rawMasks.forEach((mask) => _lecturasGameCloseSegmentationMask(mask));
    }
  } catch (_) {
    rawMasks.forEach((mask) => _lecturasGameCloseSegmentationMask(mask));
    // silent fallback
  }
  if (!detected && runtime.allowSimulatedPose && !runtime.useSimulatedPose) {
    const base = Number(runtime.poseLastSeenMs || runtime.poseDetectStartMs || nowMs);
    const idleMs = Math.max(0, nowMs - base);
    if (idleMs >= 1800) {
      runtime.useSimulatedPose = true;
      runtime.cameraStatus = "Modo simulación (sin detección de pose)";
      _lecturasGameSetMode(runtime.mode);
    }
  }
  if (detected && runtime.useSimulatedPose) {
    runtime.useSimulatedPose = false;
    runtime.cameraStatus = "Cámara activa";
    _lecturasGameSetMode(runtime.mode);
  }
}

function _lecturasGameTryDetectHands(nowMs = 0) {
  const runtime = lecturasGameModeRuntime;
  if (!runtime.handLandmarker || !runtime.cameraReady || !runtime.videoEl) return;
  if ((nowMs - Number(runtime.handLastDetectMs || 0)) < Number(runtime.handDetectIntervalMs || 34)) return;
  if (runtime.videoEl.readyState < 2) return;
  runtime.handLastDetectMs = nowMs;
  try {
    const result = runtime.handLandmarker.detectForVideo(runtime.videoEl, nowMs);
    const handLandmarks = Array.isArray(result?.landmarks) ? result.landmarks : [];
    const handedness = Array.isArray(result?.handednesses) ? result.handednesses : [];
    if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR) {
      const bySide = { left: [], right: [] };
      for (let i = 0; i < handLandmarks.length; i += 1) {
        const rawPoints = Array.isArray(handLandmarks[i]) ? handLandmarks[i] : [];
        if (!rawPoints.length) continue;
        const mappedPoints = rawPoints.map((pt) => _lecturasGameMapHandPointToScreen(pt, runtime.viewWidth, runtime.viewHeight));
        const wrist = mappedPoints[0] || null;
        if (!wrist) continue;
        const confidence = Number(handedness?.[i]?.[0]?.score || handedness?.[i]?.score || 0.7);
        const side = _lecturasGameGetSideByX(Number(wrist.x || 0), runtime);
        bySide[side].push({ mappedPoints, wrist, confidence });
      }
      LECTURAS_GAME_PAIR_SIDES.forEach((side) => {
        const best = _lecturasGamePickPairHandCandidate(side, bySide[side], nowMs, runtime);
        if (best) {
          _lecturasGameUpdateHandFromLandmarks(side, best.mappedPoints, best.confidence, nowMs, runtime);
          return;
        }
        _lecturasGameUpdateHandFromLandmarks(side, [], 0, nowMs, runtime);
      });
      return;
    }
    const seen = new Set();
    for (let i = 0; i < handLandmarks.length; i += 1) {
      const rawPoints = Array.isArray(handLandmarks[i]) ? handLandmarks[i] : [];
      if (!rawPoints.length) continue;
      const mappedPoints = rawPoints.map((pt) => _lecturasGameMapHandPointToScreen(pt, runtime.viewWidth, runtime.viewHeight));
      const fallbackKey = _lecturasGameResolveHandKey(handedness?.[i]?.[0] || handedness?.[i], i);
      const handKey = _lecturasGameResolveHandKeyByPosition(mappedPoints, fallbackKey, seen, runtime);
      seen.add(handKey);
      const confidence = Number(handedness?.[i]?.[0]?.score || handedness?.[i]?.score || 0.7);
      _lecturasGameUpdateHandFromLandmarks(handKey, mappedPoints, confidence, nowMs, runtime);
    }
    ["left", "right"].forEach((handKey) => {
      if (seen.has(handKey)) return;
      _lecturasGameUpdateHandFromLandmarks(handKey, [], 0, nowMs, runtime);
    });
  } catch (_) {
    // ignore and keep last hand state
  }
}

function _lecturasGameUpdateSimulatedPose(dtMs = 16) {
  const runtime = lecturasGameModeRuntime;
  if (!runtime.useSimulatedPose) return;
  const radii = runtime.jointRadiusConfig || {};
  const dt = Math.max(1, Number(dtMs || 16)) / 1000;
  const speed = 420;
  const dx = (runtime.inputKeys.right ? 1 : 0) - (runtime.inputKeys.left ? 1 : 0);
  const dy = (runtime.inputKeys.down ? 1 : 0) - (runtime.inputKeys.up ? 1 : 0);
  runtime.simAvatar.x += dx * speed * dt;
  runtime.simAvatar.y += dy * speed * dt;
  runtime.simAvatar.x = Math.max(80, Math.min(runtime.viewWidth - 80, runtime.simAvatar.x));
  runtime.simAvatar.y = Math.max(120, Math.min(runtime.viewHeight - 60, runtime.simAvatar.y));
  const cx = runtime.simAvatar.x;
  const cy = runtime.simAvatar.y;
  const simulatedPose = {
    confidence: 1,
    updatedAt: performance.now(),
    joints: [
      { kind: "head", x: cx, y: cy - 78, r: Number(radii.head || 14) },
      { kind: "leftWrist", x: cx - 66, y: cy - 18, r: Number(radii.leftWrist || 14) },
      { kind: "rightWrist", x: cx + 66, y: cy - 18, r: Number(radii.rightWrist || 14) },
      { kind: "torso", x: cx, y: cy - 22, r: Number(radii.torso || 18) }
    ],
    segments: [
      { kind: "leftArm", ax: cx - 16, ay: cy - 52, bx: cx - 72, by: cy - 24 },
      { kind: "rightArm", ax: cx + 16, ay: cy - 52, bx: cx + 72, by: cy - 24 },
      { kind: "shoulders", ax: cx - 26, ay: cy - 58, bx: cx + 26, by: cy - 58 },
      { kind: "torso", ax: cx, ay: cy - 60, bx: cx, by: cy + 14 }
    ]
  };
  if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR) {
    const mirrorX = Math.max(runtime.viewWidth * 0.52, runtime.viewWidth - cx);
    const companionPose = {
      confidence: 1,
      updatedAt: performance.now(),
      joints: [
        { kind: "head", x: mirrorX, y: cy - 78, r: Number(radii.head || 14) },
        { kind: "leftWrist", x: mirrorX - 66, y: cy - 18, r: Number(radii.leftWrist || 14) },
        { kind: "rightWrist", x: mirrorX + 66, y: cy - 18, r: Number(radii.rightWrist || 14) },
        { kind: "torso", x: mirrorX, y: cy - 22, r: Number(radii.torso || 18) }
      ],
      segments: [
        { kind: "leftArm", ax: mirrorX - 16, ay: cy - 52, bx: mirrorX - 72, by: cy - 24 },
        { kind: "rightArm", ax: mirrorX + 16, ay: cy - 52, bx: mirrorX + 72, by: cy - 24 },
        { kind: "shoulders", ax: mirrorX - 26, ay: cy - 58, bx: mirrorX + 26, by: cy - 58 },
        { kind: "torso", ax: mirrorX, ay: cy - 60, bx: mirrorX, by: cy + 14 }
      ]
    };
    const leftTagged = _lecturasGameTagPoseWithSide(simulatedPose, "left");
    const rightTagged = _lecturasGameTagPoseWithSide(companionPose, "right");
    runtime.poseRaw = {
      confidence: 1,
      updatedAt: performance.now(),
      joints: [...(leftTagged.joints || []), ...(rightTagged.joints || [])],
      segments: [...(leftTagged.segments || []), ...(rightTagged.segments || [])]
    };
  } else {
    runtime.poseRaw = simulatedPose;
  }
  runtime.poseStable = _lecturasGameStabilizePose(runtime.poseRaw, runtime);
  runtime.pose = runtime.poseStable;
}

function _lecturasGameCheckWordCollisions(nowMs = 0) {
  const runtime = lecturasGameModeRuntime;
  if (runtime.mode !== LECTURAS_GAME_MODE.PLAYING) return;
  const wordActivationY = _lecturasGameGetWordActivationY(runtime, nowMs);
  const allBodyJoints = _lecturasGameGetBodyCollisionJoints("", runtime);
  if (!allBodyJoints.length) return;
  const jointSide = (joint = null) => {
    const panel = String(joint?.panelSide || joint?.playerSide || "");
    if (panel === "left" || panel === "right") return panel;
    return _lecturasGameGetSideByX(joint?.x, runtime);
  };
  const leftHandJoints = runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR
    ? allBodyJoints.filter((joint) => jointSide(joint) === "left")
    : allBodyJoints;
  const rightHandJoints = runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR
    ? allBodyJoints.filter((joint) => jointSide(joint) === "right")
    : allBodyJoints;

  for (const word of runtime.words) {
    if (!word?.active) continue;
    const hitAt = Number(runtime.recentHits.get(word.id) || 0);
    if (hitAt && (nowMs - hitAt) < 180) continue;

    const wordSide = runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR
      ? String(word.side || _lecturasGameGetSideByX(word.x, runtime))
      : "";
    if (_lecturasGameIsPacifistActive(wordSide, runtime, nowMs)) continue;
    const joints = wordSide === "left" ? leftHandJoints : (wordSide === "right" ? rightHandJoints : allBodyJoints);
    let rect = _lecturasGameGetWordCollisionRect(word, { mode: "touch" });
    if (_lecturasGameIsOrderChallenge(runtime) && word.orderFlying) {
      const shrinkX = Number(rect.width || 0) * 0.32;
      const shrinkY = Number(rect.height || 0) * 0.34;
      rect = {
        ...rect,
        x: Number(rect.x || 0) + shrinkX,
        y: Number(rect.y || 0) + shrinkY,
        width: Math.max(24, Number(rect.width || 0) - (shrinkX * 2)),
        height: Math.max(18, Number(rect.height || 0) - (shrinkY * 2))
      };
    }
    if ((Number(rect.y || 0) + (Number(rect.height || 0) * 0.72)) < wordActivationY) continue;
    const touchedByJoint = joints.some((joint) => {
      const hitScale = word.isCorrect ? 0.42 : 0.52;
      const probe = {
        ...joint,
        r: Math.max(3, Number(joint?.r || 0) * hitScale)
      };
      return _lecturasGameCircleRectCollision(probe, rect);
    });
    const touchedBySegment = false;
    if (!touchedByJoint && !touchedBySegment) continue;

    runtime.recentHits.set(word.id, nowMs);
    if (word.isCorrect) {
      if (_lecturasGameIsOrderChallenge(runtime)) {
        _lecturasGameHandleOrderCorrectHit(word, runtime, "body");
      } else {
        _lecturasGameSpawnBalloonPop(word, runtime);
        _lecturasGameRemoveBalloonMesh(word, runtime);
        word.active = false;
        _lecturasGameHandleLoseByCorrectHit(runtime, "body");
      }
      return;
    }
    _lecturasGameHandleWrongWordDestroyed(word, runtime, 10);
    return;
  }
}

function _lecturasGameSetStartBtnHoverState(active = false, progress = 0, runtime = lecturasGameModeRuntime) {
  const btn = runtime?.ui?.startBtn;
  if (!btn) return;
  const label = String(runtime.handStartLabelDefault || "Iniciar ronda");
  if (!active) {
    btn.classList.remove("is-hand-hover");
    btn.textContent = label;
    return;
  }
  btn.classList.add("is-hand-hover");
  btn.textContent = label;
}

function _lecturasGameSetRetryBtnHoverState(active = false, progress = 0, runtime = lecturasGameModeRuntime) {
  const btn = runtime?.ui?.retryBtn;
  if (!btn) return;
  const label = String(runtime.handRetryLabelDefault || "Jugar otra vez");
  if (!active) {
    btn.classList.remove("is-hand-hover");
    btn.textContent = label;
    return;
  }
  btn.classList.add("is-hand-hover");
  btn.textContent = label;
}

function _lecturasGameTryHandStart(nowMs = 0, runtime = lecturasGameModeRuntime) {
  const btn = runtime?.ui?.startBtn;
  if (!btn) return;
  const available = runtime.mode === LECTURAS_GAME_MODE.INSTRUCTION && !btn.hidden && runtime.handStartPending !== true;
  if (!available) {
    runtime.handStartHoverSince = 0;
    _lecturasGameSetStartBtnHoverState(false, 0, runtime);
    return;
  }
  const handPoints = _lecturasGameGetHandInteractionPoints(runtime);
  if (!handPoints.length || !runtime.canvasEl || !runtime.viewWidth || !runtime.viewHeight) {
    runtime.handStartHoverSince = 0;
    _lecturasGameSetStartBtnHoverState(false, 0, runtime);
    return;
  }
  const canvasRect = runtime.canvasEl.getBoundingClientRect();
  const btnRect = btn.getBoundingClientRect();
  const scaleX = canvasRect.width / Math.max(1, runtime.viewWidth);
  const scaleY = canvasRect.height / Math.max(1, runtime.viewHeight);
  const margin = 6;
  const onButton = handPoints.some((joint) => {
    const x = canvasRect.left + (Number(joint.x || 0) * scaleX);
    const y = canvasRect.top + (Number(joint.y || 0) * scaleY);
    return x >= (btnRect.left - margin)
      && x <= (btnRect.right + margin)
      && y >= (btnRect.top - margin)
      && y <= (btnRect.bottom + margin);
  });
  if (!onButton) {
    runtime.handStartHoverSince = 0;
    _lecturasGameSetStartBtnHoverState(false, 0, runtime);
    return;
  }
  _lecturasGameSetStartBtnHoverState(true, 1, runtime);
  runtime.handStartPending = true;
  runtime.handStartHoverSince = 0;
  _lecturasGameSetStartBtnHoverState(false, 0, runtime);
  Promise.resolve(_lecturasGameHandleUiAction("start-round"))
    .catch(() => { })
    .finally(() => {
      runtime.handStartPending = false;
    });
}

function _lecturasGameTryHandRetry(nowMs = 0, runtime = lecturasGameModeRuntime) {
  const btn = runtime?.ui?.retryBtn;
  if (!btn) return;
  const available = runtime.mode === LECTURAS_GAME_MODE.LOST && !btn.hidden && runtime.handRetryPending !== true;
  if (!available) {
    runtime.handRetryHoverSince = 0;
    _lecturasGameSetRetryBtnHoverState(false, 0, runtime);
    return;
  }
  const handPoints = _lecturasGameGetHandInteractionPoints(runtime);
  if (!handPoints.length || !runtime.canvasEl || !runtime.viewWidth || !runtime.viewHeight) {
    runtime.handRetryHoverSince = 0;
    _lecturasGameSetRetryBtnHoverState(false, 0, runtime);
    return;
  }
  const canvasRect = runtime.canvasEl.getBoundingClientRect();
  const btnRect = btn.getBoundingClientRect();
  const scaleX = canvasRect.width / Math.max(1, runtime.viewWidth);
  const scaleY = canvasRect.height / Math.max(1, runtime.viewHeight);
  const margin = 6;
  const onButton = handPoints.some((joint) => {
    const x = canvasRect.left + (Number(joint.x || 0) * scaleX);
    const y = canvasRect.top + (Number(joint.y || 0) * scaleY);
    return x >= (btnRect.left - margin)
      && x <= (btnRect.right + margin)
      && y >= (btnRect.top - margin)
      && y <= (btnRect.bottom + margin);
  });
  if (!onButton) {
    runtime.handRetryHoverSince = 0;
    _lecturasGameSetRetryBtnHoverState(false, 0, runtime);
    return;
  }
  _lecturasGameSetRetryBtnHoverState(true, 1, runtime);
  runtime.handRetryPending = true;
  runtime.handRetryHoverSince = 0;
  _lecturasGameSetRetryBtnHoverState(false, 0, runtime);
  Promise.resolve(_lecturasGameHandleUiAction("retry-round"))
    .catch(() => { })
    .finally(() => {
      runtime.handRetryPending = false;
    });
}

function _lecturasGameTryHandQuiz(nowMs = 0, runtime = lecturasGameModeRuntime) {
  if (runtime.mode !== LECTURAS_GAME_MODE.QUIZ) return;
  const handPoints = _lecturasGameGetHandInteractionPoints(runtime);
  if (!handPoints.length || !runtime.canvasEl) return;
  const buttons = [
    { el: runtime?.ui?.quizOptionABtn, action: "quiz-option-a" },
    { el: runtime?.ui?.quizOptionBBtn, action: "quiz-option-b" },
    { el: runtime?.ui?.quizSkipBtn, action: "quiz-skip" }
  ].filter((item) => item.el && !item.el.hidden && !item.el.disabled);
  if (!buttons.length) return;
  const canvasRect = runtime.canvasEl.getBoundingClientRect();
  const scaleX = canvasRect.width / Math.max(1, runtime.viewWidth);
  const scaleY = canvasRect.height / Math.max(1, runtime.viewHeight);
  const margin = 10;
  for (const item of buttons) {
    const btnRect = item.el.getBoundingClientRect();
    const onButton = handPoints.some((joint) => {
      const x = canvasRect.left + (Number(joint.x || 0) * scaleX);
      const y = canvasRect.top + (Number(joint.y || 0) * scaleY);
      return x >= (btnRect.left - margin)
        && x <= (btnRect.right + margin)
        && y >= (btnRect.top - margin)
        && y <= (btnRect.bottom + margin);
    });
    if (!onButton) continue;
    Promise.resolve(_lecturasGameHandleUiAction(item.action)).catch(() => { });
    return;
  }
}

function _lecturasGameTryHandTraceReset(nowMs = 0, runtime = lecturasGameModeRuntime) {
  const btn = runtime?.ui?.traceResetBtn;
  if (!btn) return;
  const available = _lecturasGameIsTraceChallenge(runtime)
    && (runtime.mode === LECTURAS_GAME_MODE.INSTRUCTION
      || runtime.mode === LECTURAS_GAME_MODE.COUNTDOWN
      || runtime.mode === LECTURAS_GAME_MODE.PLAYING)
    && !btn.hidden
    && runtime.handTraceResetPending !== true;
  if (!available) return;
  const handPoints = _lecturasGameGetHandInteractionPoints(runtime);
  if (!handPoints.length || !runtime.canvasEl || !runtime.viewWidth || !runtime.viewHeight) return;
  const canvasRect = runtime.canvasEl.getBoundingClientRect();
  const btnRect = btn.getBoundingClientRect();
  const scaleX = canvasRect.width / Math.max(1, runtime.viewWidth);
  const scaleY = canvasRect.height / Math.max(1, runtime.viewHeight);
  const margin = 8;
  const onButton = handPoints.some((joint) => {
    const x = canvasRect.left + (Number(joint.x || 0) * scaleX);
    const y = canvasRect.top + (Number(joint.y || 0) * scaleY);
    return x >= (btnRect.left - margin)
      && x <= (btnRect.right + margin)
      && y >= (btnRect.top - margin)
      && y <= (btnRect.bottom + margin);
  });
  if (!onButton) return;
  runtime.handTraceResetPending = true;
  Promise.resolve(_lecturasGameHandleUiAction("trace-reset"))
    .catch(() => { })
    .finally(() => {
      runtime.handTraceResetPending = false;
    });
}

function _lecturasGameTryHandMicRead(nowMs = 0, runtime = lecturasGameModeRuntime) {
  void nowMs;
  const btn = runtime?.ui?.micBtn;
  if (!btn) return;
  const available = _lecturasGameIsOrderChallenge(runtime)
    && runtime.mode === LECTURAS_GAME_MODE.PLAYING
    && runtime?.round?.orderTrapActive !== true
    && !btn.hidden
    && !btn.disabled
    && runtime.handMicPending !== true;
  if (!available) return;
  const trackedHands = _lecturasGameGetTrackedHandInteractionPoints(runtime);
  const renderPose = _lecturasGameBuildPoseRenderData(runtime);
  const poseHands = (renderPose.joints || []).filter((joint) => {
    const kind = String(joint?.kind || "").toLowerCase();
    return kind.includes("hand") || kind.includes("wrist");
  });
  const handPoints = [...trackedHands, ...poseHands];
  if (!handPoints.length || !runtime.canvasEl || !runtime.viewWidth || !runtime.viewHeight) return;
  const canvasRect = runtime.canvasEl.getBoundingClientRect();
  const btnRect = btn.getBoundingClientRect();
  const scaleX = canvasRect.width / Math.max(1, runtime.viewWidth);
  const scaleY = canvasRect.height / Math.max(1, runtime.viewHeight);
  const margin = 14;
  const onButton = handPoints.some((joint) => {
    const x = canvasRect.left + (Number(joint.x || 0) * scaleX);
    const y = canvasRect.top + (Number(joint.y || 0) * scaleY);
    const hitR = Math.max(6, Number(joint?.r || 0) * 0.9);
    return x >= (btnRect.left - margin - hitR)
      && x <= (btnRect.right + margin + hitR)
      && y >= (btnRect.top - margin - hitR)
      && y <= (btnRect.bottom + margin + hitR);
  });
  if (!onButton) return;
  runtime.handMicPending = true;
  _lecturasGamePlayRocketStartFx(runtime);
  Promise.resolve(_lecturasGameHandleUiAction("start-mic-read"))
    .catch(() => { })
    .finally(() => {
      runtime.handMicPending = false;
    });
}

function _lecturasGameGetHandInteractionPoints(runtime = lecturasGameModeRuntime) {
  const trackedHands = _lecturasGameGetTrackedHandInteractionPoints(runtime);
  if (trackedHands.length) {
    if (runtime.selectedPlayMode !== LECTURAS_GAME_PLAY_MODE.PAIR) return trackedHands;
    const leftTracked = trackedHands.find((joint) => String(joint?.panelSide || "") === "left") || null;
    const rightTracked = trackedHands.find((joint) => String(joint?.panelSide || "") === "right") || null;
    return [leftTracked, rightTracked].filter(Boolean);
  }
  const renderPose = _lecturasGameBuildPoseRenderData(runtime);
  let hands = (renderPose.joints || []).filter((joint) => String(joint?.kind || "").toLowerCase().includes("hand"));
  if (!hands.length) {
    hands = (renderPose.joints || []).filter((joint) => String(joint?.kind || "").toLowerCase().includes("wrist"));
  }
  if (runtime.selectedPlayMode !== LECTURAS_GAME_PLAY_MODE.PAIR) return hands;
  const left = _lecturasGameSelectVisualHandNode("left", hands, runtime);
  const right = _lecturasGameSelectVisualHandNode("right", hands, runtime);
  return [left, right].filter(Boolean);
}

function _lecturasGameGetTrackedHandInteractionPoints(runtime = lecturasGameModeRuntime) {
  const now = Number(performance.now() || Date.now());
  const freshThresholdMs = Math.max(180, Number(runtime?.handTrackingLostResetMs || 140) * 2.8);
  const minConfidence = 0.12;
  const baseR = Math.max(6, Number(runtime?.handInteractionRadiusPx || 10));
  const points = [];
  ["left", "right"].forEach((handKey) => {
    const hand = runtime?.hands?.[handKey];
    if (!hand) return;
    const seenAt = Number(hand.lastSeenMs || 0);
    if (!seenAt || (now - seenAt) > freshThresholdMs) return;
    if (Number(hand.confidence || 0) < minConfidence) return;
    const palm = hand.palm ? { x: Number(hand.palm.x || 0), y: Number(hand.palm.y || 0) } : null;
    const wrist = hand.wrist ? { x: Number(hand.wrist.x || 0), y: Number(hand.wrist.y || 0) } : null;
    const addPoint = (pt = null, suffix = "palm", scale = 0.82) => {
      if (!pt) return;
      points.push({
        x: Number(pt.x || 0),
        y: Number(pt.y || 0),
        r: Math.max(4, baseR * scale),
        kind: `trackedhand_${handKey}_${suffix}`,
        panelSide: handKey,
        playerSide: handKey
      });
    };
    addPoint(palm, "palm", 0.82);
    addPoint(wrist, "wrist", 0.72);
  });
  return points;
}

function _lecturasGameBuildPoseRenderData(runtime = lecturasGameModeRuntime) {
  const srcJoints = Array.isArray(runtime.pose?.joints) ? runtime.pose.joints : [];
  const srcSegments = Array.isArray(runtime.pose?.segments) ? runtime.pose.segments : [];
  const scale = Math.max(0.42, Math.min(1, Number(runtime.poseRenderScale || 0.58)));
  if (!srcJoints.length && !srcSegments.length) return { joints: [], segments: [] };
  if (scale >= 0.999) return { joints: srcJoints, segments: srcSegments };

  const anchors = { solo: null, left: null, right: null };
  const splitX = Math.max(1, Number(runtime.viewWidth || 960)) / 2;
  const sideForX = (x = 0) => (Number(x || 0) < splitX ? "left" : "right");
  runtime.poseRenderAnchors = runtime.poseRenderAnchors || {};
  const poseSmoothCfg = runtime.poseSmoothing || {};
  const isTraceMode = _lecturasGameIsTraceChallenge(runtime);
  const anchorDeadzonePx = Math.max(0.35, Number(poseSmoothCfg.jointDeadzonePx || 1.25) * (isTraceMode ? 0.9 : 0.66));
  const anchorMaxStepPx = Math.max(10, Number(poseSmoothCfg.maxJointStepPx || 32) * (isTraceMode ? 0.92 : 1.34));
  const anchorWindowPx = Math.max(10, Number(poseSmoothCfg.speedPxWindow || 42) * (isTraceMode ? 0.9 : 0.7));
  const anchorAlphaMin = isTraceMode ? 0.22 : 0.3;
  const anchorAlphaMax = isTraceMode ? 0.46 : 0.64;
  const smoothAnchor = (key = "solo", rawAnchor = null) => {
    if (!rawAnchor) return null;
    const prevAnchor = runtime.poseRenderAnchors?.[key] || null;
    if (!prevAnchor) {
      const seeded = { x: Number(rawAnchor.x || 0), y: Number(rawAnchor.y || 0) };
      runtime.poseRenderAnchors[key] = seeded;
      return seeded;
    }
    const dx = Number(rawAnchor.x || 0) - Number(prevAnchor.x || 0);
    const dy = Number(rawAnchor.y || 0) - Number(prevAnchor.y || 0);
    const dist = Math.hypot(dx, dy);
    const alpha = _lecturasGameComputeAdaptiveAlpha(dist, anchorAlphaMin, anchorAlphaMax, anchorWindowPx);
    const next = {
      x: _lecturasGameSmoothAxis(rawAnchor.x, prevAnchor.x, alpha, anchorDeadzonePx, anchorMaxStepPx),
      y: _lecturasGameSmoothAxis(rawAnchor.y, prevAnchor.y, alpha, anchorDeadzonePx, anchorMaxStepPx)
    };
    runtime.poseRenderAnchors[key] = next;
    return next;
  };
  const collectAnchor = (side = "solo") => {
    const inSide = side === "solo"
      ? srcJoints
      : srcJoints.filter((joint) => {
        const tagged = String(joint?.playerSide || "");
        if (tagged === "left" || tagged === "right") return tagged === side;
        return sideForX(joint?.x) === side;
      });
    if (!inSide.length) return { x: runtime.viewWidth * 0.5, y: runtime.viewHeight * 0.62 };
    const torso = inSide.find((joint) => String(joint?.kind || "").toLowerCase() === "torso");
    if (torso) return { x: Number(torso.x || 0), y: Number(torso.y || 0) };
    const avgX = inSide.reduce((acc, joint) => acc + Number(joint?.x || 0), 0) / inSide.length;
    const avgY = inSide.reduce((acc, joint) => acc + Number(joint?.y || 0), 0) / inSide.length;
    return { x: avgX, y: avgY };
  };

  if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR) {
    anchors.left = smoothAnchor("left", collectAnchor("left"));
    anchors.right = smoothAnchor("right", collectAnchor("right"));
  } else {
    anchors.solo = smoothAnchor("solo", collectAnchor("solo"));
  }

  const mapPoint = (x = 0, y = 0, sourceSide = "") => {
    const side = runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR
      ? (sourceSide || sideForX(x))
      : "solo";
    const anchor = anchors[side] || anchors.solo || { x: runtime.viewWidth * 0.5, y: runtime.viewHeight * 0.62 };
    const traceAvatarDelta = _lecturasGameIsTraceChallenge(runtime)
      ? Number(runtime?.traceLayout?.avatarOffsetYDelta || 0)
      : 0;
    const offsetY = Number(runtime.poseRenderOffsetY || 0) + traceAvatarDelta;
    let mappedX = Number(anchor.x || 0) + ((Number(x || 0) - Number(anchor.x || 0)) * scale);
    const mappedY = Number(anchor.y || 0) + ((Number(y || 0) - Number(anchor.y || 0)) * scale) + offsetY;
    if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR && (side === "left" || side === "right")) {
      const bounds = _lecturasGameWordSideBounds(side, runtime);
      const safetyPad = 24;
      mappedX = Math.max(bounds.minX + safetyPad, Math.min(bounds.maxX - safetyPad, mappedX));
    }
    return {
      x: mappedX,
      y: mappedY
    };
  };

  const joints = srcJoints.map((joint) => {
    const p = mapPoint(joint.x, joint.y, String(joint?.playerSide || ""));
    return {
      ...joint,
      x: p.x,
      y: p.y,
      r: Math.max(8, Number(joint.r || 12) * 0.9)
    };
  });
  const segments = srcSegments.map((seg) => {
    const segSide = String(seg?.playerSide || "");
    const a = mapPoint(seg.ax, seg.ay, segSide);
    const b = mapPoint(seg.bx, seg.by, segSide);
    return {
      ...seg,
      ax: a.x,
      ay: a.y,
      bx: b.x,
      by: b.y
    };
  });
  const isPairMode = runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR;
  const panelTargetX = (panelSide = "") => {
    if (panelSide === "left") return splitX * 0.5;
    if (panelSide === "right") return splitX + (splitX * 0.5);
    return Number(runtime.viewWidth || 960) * 0.5;
  };
  const pickJointForPanel = (items = [], panelSide = "") => {
    if (!items.length) return null;
    if (!panelSide) return items[0];
    const tx = panelTargetX(panelSide);
    return [...items].sort((a, b) => Math.abs(Number(a?.x || 0) - tx) - Math.abs(Number(b?.x || 0) - tx))[0] || items[0];
  };
  const pickSegmentForPanel = (items = [], panelSide = "") => {
    if (!items.length) return null;
    if (!panelSide) return items[0];
    const tx = panelTargetX(panelSide);
    return [...items].sort((a, b) => {
      const am = (Number(a?.ax || 0) + Number(a?.bx || 0)) / 2;
      const bm = (Number(b?.ax || 0) + Number(b?.bx || 0)) / 2;
      return Math.abs(am - tx) - Math.abs(bm - tx);
    })[0] || items[0];
  };
  const getJointByKind = (kind = "", panelSide = "") => {
    const key = String(kind || "").toLowerCase();
    const matches = joints.filter((joint) => {
      if (String(joint?.kind || "").toLowerCase() !== key) return false;
      if (!panelSide) return true;
      const tagged = String(joint?.playerSide || "");
      if (tagged === "left" || tagged === "right") return tagged === panelSide;
      return sideForX(joint?.x) === panelSide;
    });
    return pickJointForPanel(matches, panelSide);
  };
  const getSegmentByKind = (kind = "", panelSide = "") => {
    const key = String(kind || "").toLowerCase();
    const matches = segments.filter((seg) => {
      if (String(seg?.kind || "").toLowerCase() !== key) return false;
      if (!panelSide) return true;
      const tagged = String(seg?.playerSide || "");
      if (tagged === "left" || tagged === "right") return tagged === panelSide;
      return sideForX((Number(seg?.ax || 0) + Number(seg?.bx || 0)) / 2) === panelSide;
    });
    return pickSegmentForPanel(matches, panelSide);
  };
  const buildHandNode = (side = "left", panelSide = "") => {
    const sideKey = side === "right" ? "right" : "left";
    const panel = panelSide === "right" ? "right" : (panelSide === "left" ? "left" : "");
    const wrist = getJointByKind(`${sideKey}wrist`, panel);
    if (!wrist) return null;
    const handState = !isPairMode ? (runtime?.hands?.[sideKey] || null) : null;
    let p = null;
    const palm = handState?.palm;
    if (palm && Number.isFinite(Number(palm.x)) && Number.isFinite(Number(palm.y))) {
      const mappedPalm = mapPoint(Number(palm.x || 0), Number(palm.y || 0));
      const vx = Number(mappedPalm.x || 0) - Number(wrist.x || 0);
      const vy = Number(mappedPalm.y || 0) - Number(wrist.y || 0);
      const mag = Math.hypot(vx, vy);
      const desired = Math.max(20, 34 * scale);
      const maxAllowed = Math.max(42, 108 * scale);
      if (mag > maxAllowed) {
        p = null;
      } else if (mag > 0.001 && mag < desired) {
        p = {
          x: Number(wrist.x || 0) + ((vx / mag) * desired),
          y: Number(wrist.y || 0) + ((vy / mag) * desired)
        };
      } else {
        p = mappedPalm;
      }
    }
    if (!p) {
      const forearm = getSegmentByKind(`${sideKey}forearm`, panel) || getSegmentByKind(`${sideKey}arm`, panel);
      if (forearm) {
        const vx = Number(forearm.bx || 0) - Number(forearm.ax || 0);
        const vy = Number(forearm.by || 0) - Number(forearm.ay || 0);
        const mag = Math.hypot(vx, vy);
        if (mag > 0.001) {
          const d = Math.max(20, 34 * scale);
          p = {
            x: Number(wrist.x || 0) + ((vx / mag) * d),
            y: Number(wrist.y || 0) + ((vy / mag) * d)
          };
        }
      }
    }
    if (!p) {
      p = {
        x: Number(wrist.x || 0) + (sideKey === "left" ? -22 : 22) * scale,
        y: Number(wrist.y || 0) + (4 * scale)
      };
    }
    return {
      kind: panel ? `${sideKey}Hand_${panel}` : `${sideKey}Hand`,
      x: Number(p.x || 0),
      y: Number(p.y || 0),
      r: Math.max(10, Number(wrist.r || 10) * 0.95),
      panelSide: panel || undefined
    };
  };
  const attachHandNode = (handNode = null, side = "left", panelSide = "") => {
    if (!handNode) return;
    const sideKey = side === "right" ? "right" : "left";
    const forearm = getSegmentByKind(`${sideKey}forearm`, panelSide) || getSegmentByKind(`${sideKey}arm`, panelSide);
    if (forearm) {
      forearm.bx = Number(handNode.x || 0);
      forearm.by = Number(handNode.y || 0);
    }
    joints.push(handNode);
  };
  if (isPairMode) {
    ["left", "right"].forEach((panelSide) => {
      attachHandNode(buildHandNode("left", panelSide), "left", panelSide);
      attachHandNode(buildHandNode("right", panelSide), "right", panelSide);
    });
  } else {
    attachHandNode(buildHandNode("left"), "left", "");
    attachHandNode(buildHandNode("right"), "right", "");
  }
  return { joints, segments };
}

function _lecturasGameRenderPoseOverlay(runtime = lecturasGameModeRuntime) {
  const ctx = runtime.poseCtx;
  if (!ctx) return;
  const w = runtime.viewWidth;
  const h = runtime.viewHeight;
  const renderPose = _lecturasGameBuildPoseRenderData(runtime);
  ctx.clearRect(0, 0, w, h);
  _lecturasGameDrawFireballs(ctx, runtime);
  if (runtime.mode === LECTURAS_GAME_MODE.PLAYING) {
    _lecturasGameGetActivePowerups(runtime).forEach((powerup) => {
      _lecturasGameDrawPowerup(ctx, powerup, runtime);
    });
  }
  if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR) {
    const splitX = runtime.viewWidth / 2;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(splitX, 0);
    ctx.lineTo(splitX, runtime.viewHeight);
    ctx.stroke();
    ctx.restore();
  }
  if (!renderPose.segments.length && !renderPose.joints.length) return;
  const nowMs = performance.now();
  const pacifistOverlay = _lecturasGameIsPacifistActive("", runtime, nowMs)
    || (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR && LECTURAS_GAME_PAIR_SIDES.some((side) => _lecturasGameIsPacifistActive(side, runtime, nowMs)));
  const overlayAlpha = pacifistOverlay ? 0.1 : 1;
  ctx.save();
  ctx.globalAlpha = overlayAlpha;
  ctx.strokeStyle = "rgba(7, 18, 30, 0.44)";
  ctx.lineWidth = 10;
  ctx.lineCap = "butt";
  ctx.lineJoin = "round";
  renderPose.segments.forEach((seg) => {
    ctx.beginPath();
    ctx.moveTo(seg.ax, seg.ay);
    ctx.lineTo(seg.bx, seg.by);
    ctx.stroke();
  });
  renderPose.joints.forEach((joint) => {
    const kind = String(joint?.kind || "").toLowerCase();
    if (kind.includes("wrist")) return;
    let nodeColor = "rgba(94, 182, 255, 0.94)";
    if (kind.includes("lefthand")) nodeColor = "rgba(255, 214, 96, 0.98)";
    else if (kind.includes("righthand")) nodeColor = "rgba(255, 148, 182, 0.98)";
    else if (kind === "head") nodeColor = "rgba(131, 236, 156, 0.95)";
    else if (kind === "torso") nodeColor = "rgba(128, 164, 255, 0.94)";
    const radius = Math.max(12, joint.r * 1.22);
    ctx.beginPath();
    ctx.arc(joint.x, joint.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = nodeColor;
    ctx.fill();
  });
  if (_lecturasGameIsTraceChallenge(runtime)) {
    const pencilImg = _lecturasGameEnsurePencilSprite(runtime);
    if (pencilImg) {
      const bySideForearm = {};
      (renderPose.segments || []).forEach((seg) => {
        const kind = String(seg?.kind || "").toLowerCase();
        if (!kind.includes("forearm") && !kind.includes("arm")) return;
        const side = kind.includes("left") ? "left" : (kind.includes("right") ? "right" : _lecturasGameGetSideByX((Number(seg?.ax || 0) + Number(seg?.bx || 0)) / 2, runtime));
        if (!bySideForearm[side]) bySideForearm[side] = seg;
      });
      (renderPose.joints || []).forEach((joint) => {
        const kind = String(joint?.kind || "").toLowerCase();
        if (!kind.includes("hand")) return;
        if (!_lecturasGameIsTraceDrawGestureActive(kind, Number(joint?.x || 0), runtime)) return;
        const side = kind.includes("left") ? "left" : (kind.includes("right") ? "right" : _lecturasGameGetSideByX(joint?.x, runtime));
        const seg = bySideForearm[side] || null;
        const vx = seg ? (Number(seg.bx || 0) - Number(seg.ax || 0)) : (side === "left" ? -1 : 1);
        const vy = seg ? (Number(seg.by || 0) - Number(seg.ay || 0)) : 0;
        const ang = Math.atan2(vy, vx) + (Math.PI * 0.5);
        const h = Math.max(38, Number(joint?.r || 12) * 5.2);
        const wP = h * 0.26;
        ctx.save();
        ctx.globalAlpha = 0.96;
        ctx.translate(Number(joint.x || 0), Number(joint.y || 0));
        ctx.rotate(ang);
        ctx.drawImage(pencilImg, -wP * 0.5, -h * 0.82, wP, h);
        ctx.restore();
      });
    }
  }
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = overlayAlpha;
  if (_lecturasGameIsAnyFireModeActive(runtime, nowMs)) {
    const now = nowMs * 0.0085;
    renderPose.joints.forEach((joint) => {
      if (!joint || !String(joint.kind || "").toLowerCase().includes("hand")) return;
      const sideKey = runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR
        ? (_lecturasGameGetSideByX(joint?.x, runtime) || "left")
        : "";
      const activeType = _lecturasGameGetFireModeTypeForSide(sideKey, runtime, nowMs) || LECTURAS_GAME_POWERUP_TYPES.FIRE;
      const palette = _lecturasGameGetFireVisualPalette(activeType);
      const pulse = 1 + (Math.sin(now + joint.x * 0.01) * 0.24);
      const auraR = Math.max(18, Number(joint.r || 12) * 1.9 * pulse);
      const g = ctx.createRadialGradient(joint.x, joint.y, 0, joint.x, joint.y, auraR);
      g.addColorStop(0, String(palette.aura0 || "rgba(255, 244, 174, 0.74)"));
      g.addColorStop(0.4, String(palette.aura1 || "rgba(255, 146, 58, 0.56)"));
      g.addColorStop(1, String(palette.aura2 || "rgba(255, 64, 24, 0)"));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(joint.x, joint.y, auraR, 0, Math.PI * 2);
      ctx.fill();
      const shimmerAngle = now * 1.7;
      const sx = joint.x + Math.cos(shimmerAngle) * (auraR * 0.42);
      const sy = joint.y + Math.sin(shimmerAngle) * (auraR * 0.42);
      const shimmer = ctx.createRadialGradient(sx, sy, 0, sx, sy, auraR * 0.45);
      shimmer.addColorStop(0, String(palette.spark || "rgba(255, 255, 220, 0.44)"));
      shimmer.addColorStop(1, String(palette.charge2 || "rgba(255, 255, 220, 0)"));
      ctx.fillStyle = shimmer;
      ctx.beginPath();
      ctx.arc(sx, sy, auraR * 0.45, 0, Math.PI * 2);
      ctx.fill();
    });
    _lecturasGameDrawChargeOrbs(ctx, runtime, renderPose.joints);
    _lecturasGameDrawFireAuraParticles(ctx, runtime, renderPose.joints);
  }
  _lecturasGameDrawBombChargeFx(ctx, runtime, nowMs);
  if (runtime.firePickupFx?.active) {
    const spin = Number(runtime.firePickupFx.spin || 0);
    renderPose.joints.forEach((joint) => {
      const kind = String(joint?.kind || "").toLowerCase();
      if (!kind.includes("hand")) return;
      const side = _lecturasGameGetSideByX(joint.x, runtime);
      if (runtime.firePickupFx.side && runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR && side !== runtime.firePickupFx.side) return;
      const ringR = Math.max(18, Number(joint.r || 12) * 2.2);
      for (let i = 0; i < 6; i += 1) {
        const ang = spin + ((Math.PI * 2 * i) / 6);
        const px = Number(joint.x || 0) + (Math.cos(ang) * ringR * 0.85);
        const py = Number(joint.y || 0) + (Math.sin(ang) * ringR * 0.6);
        ctx.fillStyle = "rgba(255, 176, 74, 0.9)";
        ctx.beginPath();
        ctx.arc(px, py, 2.8 + (Math.sin(spin + i) * 0.8), 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }
  ctx.restore();
}

function _lecturasGameUpdate(dtMs = 16) {
  const runtime = lecturasGameModeRuntime;
  const dt = Math.max(1, Number(dtMs || 16));
  const nowMs = performance.now();
  const orderReadingPhase = _lecturasGameIsOrderReadingPhase(runtime);
  if (orderReadingPhase) _lecturasGamePauseCombatTimers(runtime, dt);
  const hadFireBefore = _lecturasGameIsAnyFireModeActive(runtime, nowMs);
  _lecturasGameUpdateBackgroundTransition(dt, runtime);
  _lecturasGameUpdateLevelTransitionFx(dt, runtime);
  _lecturasGameUpdateSimulatedPose(dt);
  if (runtime.fireModeActive && Number(runtime.fireModeUntilMs || 0) <= nowMs) {
    runtime.fireModeActive = false;
    runtime.fireModeUntilMs = 0;
    runtime.fireModeType = LECTURAS_GAME_POWERUP_TYPES.FIRE;
  }
  if (Number(runtime.freezeUntilMs || 0) <= nowMs) runtime.freezeUntilMs = 0;
  if (Number(runtime.pacifistUntilMs || 0) <= nowMs) runtime.pacifistUntilMs = 0;
  if (Number(runtime.chaosUntilMs || 0) <= nowMs) runtime.chaosUntilMs = 0;
  if (Number(runtime.bombReadyUntilMs || 0) <= nowMs) {
    runtime.bombReadyUntilMs = 0;
    runtime.bombActivatedAtMs = 0;
    runtime.bombChestHoldStartMs = 0;
    runtime.bombChargeNorm = 0;
  }
  if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR) {
    LECTURAS_GAME_PAIR_SIDES.forEach((side) => {
      const sideState = _lecturasGameGetPairSideState(side, runtime);
      if (Number(sideState.fireModeUntilMs || 0) <= nowMs) {
        sideState.fireModeUntilMs = 0;
        sideState.fireModeType = LECTURAS_GAME_POWERUP_TYPES.FIRE;
      }
      if (Number(sideState.freezeUntilMs || 0) <= nowMs) sideState.freezeUntilMs = 0;
      if (Number(sideState.pacifistUntilMs || 0) <= nowMs) sideState.pacifistUntilMs = 0;
      if (Number(sideState.chaosUntilMs || 0) <= nowMs) sideState.chaosUntilMs = 0;
      if (Number(sideState.bombReadyUntilMs || 0) <= nowMs) {
        sideState.bombReadyUntilMs = 0;
        sideState.bombActivatedAtMs = 0;
        sideState.bombChestHoldStartMs = 0;
        sideState.bombChargeNorm = 0;
      }
    });
  }
  _lecturasGameRenderPowTimerUi(runtime, nowMs);
  if (hadFireBefore && !_lecturasGameIsAnyFireModeActive(runtime, nowMs)) {
    _lecturasGameResetHands(runtime);
  }
  _lecturasGameTryThrowBySimulation(runtime, nowMs);
  _lecturasGameTryThrowByHandRelease(runtime, nowMs);
  if (runtime.mode === LECTURAS_GAME_MODE.COUNTDOWN) {
    runtime.countdownMs = Math.max(0, runtime.countdownMs - dt);
    if (runtime.countdownMs <= 0) {
      if (_lecturasGameIsOrderChallenge(runtime)) {
        _lecturasGameOrderOnCountdownFinished(runtime);
      } else {
        _lecturasGameSetMode(LECTURAS_GAME_MODE.PLAYING);
      }
    }
  } else if (runtime.mode === LECTURAS_GAME_MODE.PLAYING) {
    runtime.roundElapsedMs += dt;
    const dtSeconds = dt / 1000;
    const beatFallFactor = _lecturasGameGetMusicBeatFallFactor(runtime);
    const isOrderMode = _lecturasGameIsOrderChallenge(runtime);
    const isTraceMode = _lecturasGameIsTraceChallenge(runtime);
    const orderFocusActive = _lecturasGameIsOrderFocusActive(runtime, nowMs);
    if (isTraceMode) _lecturasGameUpdateTraceChallenge(runtime, nowMs);
    if (isOrderMode) _lecturasGameOrderTick(runtime, nowMs);
    const orderRepellers = (isOrderMode && runtime?.round?.orderTrapActive === true)
      ? _lecturasGameGetHandCollisionJoints("", runtime)
      : [];
    runtime.words.forEach((word) => {
      if (!word.active) return;
      if (isOrderMode && orderFocusActive) return;
      if (isOrderMode && word.orderFlying) {
        const radiusPad = 10;
        if (orderRepellers.length) {
          const cx = Number(word.x || 0) + (Number(word.width || 0) * 0.5);
          const cy = Number(word.y || 0) + (Number(word.height || 0) * 0.5);
          orderRepellers.forEach((joint) => {
            const jx = Number(joint?.x || 0);
            const jy = Number(joint?.y || 0);
            const repelR = Math.max(132, Number(joint?.r || 14) * 7.8);
            const dx = cx - jx;
            const dy = cy - jy;
            const dist = Math.max(1, Math.hypot(dx, dy));
            if (dist >= repelR) return;
            const nx = dx / dist;
            const ny = dy / dist;
            const strength = (1 - (dist / repelR)) * 1920;
            const turbo = dist < (repelR * 0.48) ? 1.8 : 1;
            word.vx = Number(word.vx || 0) + (nx * strength * dtSeconds);
            word.vy = Number(word.vy || 0) + (ny * strength * dtSeconds);
            if (dist < (repelR * 0.62)) {
              word.vx += ((Math.random() - 0.5) * 180) * dtSeconds * turbo;
              word.vy += ((Math.random() - 0.5) * 180) * dtSeconds * turbo;
            }
          });
          const speed = Math.hypot(Number(word.vx || 0), Number(word.vy || 0));
          const maxSpeed = 1260;
          if (speed > maxSpeed && speed > 0.001) {
            const scale = maxSpeed / speed;
            word.vx *= scale;
            word.vy *= scale;
          }
        }
        word.x += Number(word.vx || 0) * dtSeconds;
        word.y += Number(word.vy || 0) * dtSeconds;
        if (word.x <= radiusPad || (word.x + word.width) >= (runtime.viewWidth - radiusPad)) {
          word.vx = -Number(word.vx || 0) * (0.92 + Math.random() * 0.12);
          word.x = Math.max(radiusPad, Math.min(runtime.viewWidth - word.width - radiusPad, Number(word.x || 0)));
        }
        if (word.y <= 56 || (word.y + word.height) >= (runtime.viewHeight - radiusPad)) {
          word.vy = -Number(word.vy || 0) * (0.92 + Math.random() * 0.12);
          word.y = Math.max(56, Math.min(runtime.viewHeight - word.height - radiusPad, Number(word.y || 0)));
        }
        return;
      }
      if (isOrderMode && runtime?.round?.orderTrapActive === true) {
        // Rain words safety: recover motion if any entity gets an invalid/near-zero velocity.
        const vy = Number(word.vy || 0);
        if (!Number.isFinite(vy) || Math.abs(vy) < 8) {
          word.vy = 210 + Math.random() * 160;
        }
      }
      const sideKey = runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR ? String(word.side || _lecturasGameGetSideByX(word.x, runtime)) : "";
      const chaosFactor = _lecturasGameIsChaosActive(sideKey, runtime, nowMs) ? 1.65 : 1;
      if (_lecturasGameIsFreezeActive(sideKey, runtime, nowMs) && !word.isCorrect) {
        word.vy = Math.max(Number(word.vy || 0), 420 + (Math.random() * 80));
      }
      if (isOrderMode && runtime?.round?.orderTrapActive === true && word.isCorrect && word?.zigzag?.enabled === true) {
        const zz = word.zigzag;
        zz.elapsed = Number(zz.elapsed || 0) + dtSeconds;
        const bounds = runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR
          ? _lecturasGameWordSideBounds(String(word.side || sideKey || "left"), runtime)
          : { minX: 10, maxX: Math.max(20, runtime.viewWidth - 10) };
        const minX = Math.max(bounds.minX, 10);
        const maxX = Math.max(minX + 2, bounds.maxX - Math.max(1, Number(word.width || 0)));
        const elapsed = Number(zz.elapsed || 0);
        const drift = Number(zz.driftSpeed || 120) * elapsed;
        const zigLong = Math.sin((Number(zz.phaseLong || 0) + (elapsed * Number(zz.freqLong || 0.52) * Math.PI * 2))) * Number(zz.ampLong || 180);
        const zigShort = Math.sin((Number(zz.phaseShort || 0) + (elapsed * Number(zz.freqShort || 3.2) * Math.PI * 2))) * Number(zz.ampShort || 24);
        const kickWave = Math.sin((Number(zz.phaseKick || 0) + (elapsed * Number(zz.kickFreq || 6.2) * Math.PI * 2)));
        const kickGate = Math.max(0, Math.pow(Math.abs(kickWave), 4.2) - 0.52);
        const kick = Math.sign(kickWave) * kickGate * Number(zz.kickAmp || 28);
        let nextX = Number(zz.baseX || maxX) - drift + zigLong + zigShort + kick;
        if (nextX < (minX - 16)) {
          // Restart at right side with new random zig pattern.
          zz.elapsed = 0;
          zz.baseX = maxX;
          zz.driftSpeed = 88 + (Math.random() * 72);
          zz.ampLong = 120 + (Math.random() * 180);
          zz.ampShort = 10 + (Math.random() * 42);
          zz.freqLong = 0.28 + (Math.random() * 0.48);
          zz.freqShort = 2.4 + (Math.random() * 3.4);
          zz.kickAmp = 12 + (Math.random() * 56);
          zz.kickFreq = 3.5 + (Math.random() * 5.2);
          zz.phaseLong = Math.random() * Math.PI * 2;
          zz.phaseShort = Math.random() * Math.PI * 2;
          zz.phaseKick = Math.random() * Math.PI * 2;
          nextX = maxX;
        }
        word.x = Math.max(minX, Math.min(maxX, nextX));
      }
      word.y += (word.vy * beatFallFactor * chaosFactor) * dtSeconds;
      if (word.y > runtime.viewHeight + 80) {
        if (_lecturasGameIsFreezeActive(sideKey, runtime, nowMs) && !word.isCorrect) {
          _lecturasGameHandleWrongWordDestroyed(word, runtime, 6);
          return;
        }
        word.y = -60 - Math.random() * 220;
        if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR) {
          const side = String(word.side || (Math.random() > 0.5 ? "right" : "left"));
          const b = _lecturasGameWordSideBounds(side, runtime);
          const maxX = Math.max(b.minX, b.maxX - Math.max(1, Number(word.width || 0)));
          word.x = b.minX + Math.random() * Math.max(2, maxX - b.minX);
          word.side = side;
        } else {
          word.x = 10 + Math.random() * Math.max(20, runtime.viewWidth - word.width - 20);
        }
        if (isOrderMode && runtime?.round?.orderTrapActive === true && word.isCorrect && word?.zigzag?.enabled === true) {
          const b = runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR
            ? _lecturasGameWordSideBounds(String(word.side || sideKey || "left"), runtime)
            : { minX: 10, maxX: Math.max(20, runtime.viewWidth - 10) };
          const maxX = Math.max(b.minX, b.maxX - Math.max(1, Number(word.width || 0)));
          word.x = maxX;
          word.zigzag.elapsed = 0;
          word.zigzag.baseX = maxX;
        }
      }
    });
    if (!isTraceMode) {
      _lecturasGameSpawnPowerup(runtime);
    }
    const advancePowerup = (powerup = null, onDrop = () => { }) => {
      if (!powerup?.active) return;
      powerup.pulse = Number(powerup.pulse || 0) + (dt * 0.012);
      powerup.y += Number(powerup.vy || 0) * dtSeconds;
      if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR) {
        _lecturasGameClampWordToSide(powerup, runtime);
      }
      if (powerup.y > runtime.viewHeight + 80) onDrop();
    };
    if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR) {
      LECTURAS_GAME_PAIR_SIDES.forEach((side) => {
        const sideState = _lecturasGameGetPairSideState(side, runtime);
        if (Number(sideState.bombReadyUntilMs || 0) > nowMs) {
          const hand = _lecturasGameGetHandState(side, runtime);
          const canTrack = !!hand?.wrist;
          const isClosed = canTrack && !!hand.closed;
          const isOpen = canTrack && !hand.closed;

          if (isOpen && Number(sideState.bombChargeNorm || 0) >= 1) {
            sideState.bombReadyUntilMs = 0;
            sideState.bombActivatedAtMs = 0;
            sideState.bombChestHoldStartMs = 0;
            sideState.bombChargeNorm = 0;
            _lecturasGameDetonateChestBomb(side, runtime);
          } else if (isClosed) {
            if (!sideState.bombChestHoldStartMs) sideState.bombChestHoldStartMs = nowMs;
            const heldMs = Math.max(0, nowMs - sideState.bombChestHoldStartMs);
            sideState.bombChargeNorm = Math.max(0, Math.min(1, heldMs / 1800));
          } else if (isOpen) {
            sideState.bombChestHoldStartMs = 0;
            sideState.bombChargeNorm = 0;
          }
        } else {
          sideState.bombChestHoldStartMs = 0;
          sideState.bombChargeNorm = 0;
        }
        
        advancePowerup(sideState.powerup, () => {
          sideState.powerup = null;
          sideState.powerupSpawnAtMs = nowMs + _lecturasGameGetPowerupSpawnDelayMs(runtime);
        });
      });
    } else {

      if (Number(runtime.bombReadyUntilMs || 0) > nowMs) {
        const left = _lecturasGameGetHandState("left", runtime);
        const right = _lecturasGameGetHandState("right", runtime);
        const canTrackLeft = !!left?.wrist;
        const canTrackRight = !!right?.wrist;
        const isLeftClosed = canTrackLeft && !!left.closed;
        const isRightClosed = canTrackRight && !!right.closed;
        const bothClosed = isLeftClosed && isRightClosed;
        const isLeftOpen = canTrackLeft && !left.closed;
        const isRightOpen = canTrackRight && !right.closed;
        const bothOpen = isLeftOpen && isRightOpen;
        const anyOpen = isLeftOpen || isRightOpen;

        if (anyOpen && Number(runtime.bombChargeNorm || 0) >= 1) {
          runtime.bombReadyUntilMs = 0;
          runtime.bombActivatedAtMs = 0;
          runtime.bombChestHoldStartMs = 0;
          runtime.bombChargeNorm = 0;
          _lecturasGameDetonateChestBomb("", runtime);
        } else if (bothClosed) {
          if (!runtime.bombChestHoldStartMs) runtime.bombChestHoldStartMs = nowMs;
          const heldMs = Math.max(0, nowMs - runtime.bombChestHoldStartMs);
          runtime.bombChargeNorm = Math.max(0, Math.min(1, heldMs / 1800));
        } else if (anyOpen) {
          runtime.bombChestHoldStartMs = 0;
          runtime.bombChargeNorm = 0;
        }
      } else {
        runtime.bombChestHoldStartMs = 0;
        runtime.bombChargeNorm = 0;
      }
      
      advancePowerup(runtime.powerup, () => {
        runtime.powerup = null;
        runtime.powerupSpawnAtMs = nowMs + _lecturasGameGetPowerupSpawnDelayMs(runtime);
      });
    }
    
    if (!isTraceMode) _lecturasGameTryCollectPowerup(runtime, nowMs);
    _lecturasGameCheckWordCollisions(nowMs);
    
    if (!isTraceMode) _lecturasGameUpdateFireballs(dt, runtime);
    if (!isOrderMode && runtime.roundElapsedMs >= runtime.roundTimeLimitMs && runtime.mode === LECTURAS_GAME_MODE.PLAYING) {
      runtime.touchedCorrect = false;
      _lecturasGamePlayLoseSound();
      _lecturasGameStopGameMusic(runtime, "timeout");
      _lecturasGameSetMode(LECTURAS_GAME_MODE.LOST);
    }
  } else {
    runtime.fireballs = [];
    if (!runtime.simFireCharging) _lecturasGameResetHands(runtime);
  }

  runtime.particles = runtime.particles.filter((p) => {
    p.life += dt;
    const ds = dt / 1000;
    p.x += p.vx * ds;
    p.y += p.vy * ds;
    p.vy += 210 * ds;
    return p.life < p.maxLife;
  });
  if (runtime.firePickupFx?.active) {
    runtime.firePickupFx.elapsedMs = Number(runtime.firePickupFx.elapsedMs || 0) + dt;
    runtime.firePickupFx.spin = Number(runtime.firePickupFx.spin || 0) + (dt * 0.008);
    if (runtime.firePickupFx.elapsedMs >= Number(runtime.firePickupFx.maxMs || 0)) {
      runtime.firePickupFx = null;
    }
  }
  _lecturasGameSyncPlayersSummary(runtime);
  _lecturasGameApplyLayerShake(runtime);
}

function _lecturasGameDrawRoundedRect(ctx, x, y, w, h, radius = 14) {
  const r = Math.max(2, Math.min(radius, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function _lecturasGameDrawBallooningText(ctx, text = "", x = 0, y = 0, options = {}) {
  const value = String(text || "").trim();
  if (!value) return;
  const fontSize = Math.max(20, Number(options.fontSize || 64));
  const family = options.fontFamily || '"Ballooning", "Nunito", sans-serif';
  const singleColor = String(options.color || "").trim();
  const palette = singleColor
    ? [singleColor]
    : (Array.isArray(options.palette) && options.palette.length
      ? options.palette
      : ["#ff4f9a", "#ff9f1c", "#ffe74c", "#2ec4b6", "#5b8cff", "#9b5de5"]);
  const stroke = String(options.stroke || "#1f2a44");
  const shadow = String(options.shadow || "rgba(0,0,0,0.26)");
  const glowColor = String(options.glowColor || "").trim();
  const glowBlur = Math.max(0, Number(options.glowBlur || 0));
  const highlightColor = String(options.highlightColor || "rgba(255,255,255,0.35)");
  const letterSpacing = Number(options.letterSpacing || Math.max(1, fontSize * 0.02));
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `400 ${fontSize}px ${family}`;
  const widths = Array.from(value).map((ch) => ctx.measureText(ch).width);
  const totalWidth = widths.reduce((acc, w) => acc + w, 0) + Math.max(0, value.length - 1) * letterSpacing;
  let cursor = x - totalWidth / 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.shadowColor = glowColor || shadow;
  ctx.shadowBlur = glowColor ? glowBlur : Math.max(8, fontSize * 0.18);
  ctx.lineWidth = Math.max(5, fontSize * 0.1);
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    const w = widths[i] || 0;
    const color = palette[i % palette.length];
    ctx.shadowColor = shadow;
    ctx.shadowBlur = Math.max(4, fontSize * 0.12);
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = Math.max(2, fontSize * 0.12);
    ctx.strokeText(ch, cursor + Math.max(1, fontSize * 0.015), y + Math.max(1, fontSize * 0.03));
    if (glowColor) {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = glowBlur;
    } else {
      ctx.shadowColor = shadow;
      ctx.shadowBlur = Math.max(8, fontSize * 0.16);
    }
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(4, fontSize * 0.08);
    ctx.strokeText(ch, cursor, y);
    ctx.fillStyle = color;
    ctx.fillText(ch, cursor, y);
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.fillStyle = highlightColor;
    ctx.fillText(ch, cursor, y - Math.max(1, fontSize * 0.06));
    cursor += w + letterSpacing;
  }
  ctx.restore();
}

async function _lecturasGameEnsureThree(runtime = lecturasGameModeRuntime) {
  const threeState = runtime.three;
  if (threeState.ready && threeState.renderer && threeState.scene && threeState.camera) return true;
  const mount = threeState.container;
  if (!mount) return false;
  try {
    if (!threeState.lib) {
      threeState.lib = await import("./vendor/three/three.module.js");
    }
    const THREE = threeState.lib;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.max(1, Math.min(2, window.devicePixelRatio || 1)));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    renderer.domElement.style.pointerEvents = "none";
    mount.innerHTML = "";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-runtime.viewWidth / 2, runtime.viewWidth / 2, runtime.viewHeight / 2, -runtime.viewHeight / 2, 0.1, 4000);
    camera.position.set(0, 0, 1000);
    camera.lookAt(0, 0, 0);

    const ambient = new THREE.AmbientLight(0xffffff, 0.84);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.86);
    dirLight.position.set(320, 420, 600);
    scene.add(dirLight);

    threeState.renderer = renderer;
    threeState.scene = scene;
    threeState.camera = camera;
    threeState.ambient = ambient;
    threeState.dirLight = dirLight;
    threeState.popBursts = [];
    threeState.ready = true;
    threeState.enabled = true;
    return true;
  } catch (error) {
    console.warn("[LecturasGame] Three.js no disponible, fallback 2D:", error);
    threeState.enabled = false;
    threeState.ready = false;
    return false;
  }
}

function _lecturasGameDisposeThree(runtime = lecturasGameModeRuntime) {
  const threeState = runtime.three;
  try {
    const scene = threeState.scene;
    if (scene) {
      scene.traverse((obj) => {
        if (obj?.geometry?.dispose) obj.geometry.dispose();
        if (obj?.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m?.dispose?.());
          else obj.material.dispose?.();
        }
        const tex = obj?.material?.map || obj?.material?.alphaMap;
        tex?.dispose?.();
      });
    }
    if (threeState.renderer) {
      threeState.renderer.dispose();
      const dom = threeState.renderer.domElement;
      dom?.parentElement?.removeChild(dom);
    }
  } catch (_) {
    // noop
  } finally {
    if (threeState.container) threeState.container.innerHTML = "";
    threeState.ready = false;
    threeState.enabled = false;
    threeState.renderer = null;
    threeState.scene = null;
    threeState.camera = null;
    threeState.popBursts = [];
  }
}

function _lecturasGameCreateBalloonTextMaterial(text = "", isCorrect = false, runtime = lecturasGameModeRuntime) {
  const THREE = runtime.three.lib;
  if (!THREE) return null;
  const fontSize = 380;
  const measured = _lecturasGameMeasureBallooningTextWidth(text, fontSize);
  const width = Math.min(4096, Math.max(1024, _lecturasGameNextPow2(measured + 420)));
  const height = Math.min(1024, Math.max(512, _lecturasGameNextPow2(Math.round(fontSize * 1.9))));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, width, height);
  const textColor = "#ffd44d";
  _lecturasGameDrawBallooningText(ctx, String(text || ""), width / 2, height / 2 + 10, {
    fontSize,
    color: textColor,
    stroke: "#8f5300",
    shadow: "rgba(0,0,0,0.24)",
    glowColor: isCorrect ? "rgba(86,255,124,0.98)" : "",
    glowBlur: isCorrect ? 70 : 0,
    highlightColor: "rgba(255,255,255,0.38)"
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return {
    material: new THREE.MeshBasicMaterial({ map: texture, transparent: true }),
    aspect: width / Math.max(1, height)
  };
}

function _lecturasGameCreateBalloonMesh(word = null, runtime = lecturasGameModeRuntime) {
  const threeState = runtime.three;
  const THREE = threeState.lib;
  if (!threeState.ready || !threeState.scene || !THREE || !word) return;
  const group = new THREE.Group();
  const textTexture = _lecturasGameCreateBalloonTextMaterial(word.text, word.isCorrect, runtime);
  if (textTexture?.material) {
    const planeHeight = 98;
    const planeWidth = Math.max(160, Math.round(planeHeight * Math.max(1, Number(textTexture.aspect || 2))));
    const planeGeometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
    const textPlane = new THREE.Mesh(planeGeometry, textTexture.material);
    textPlane.position.z = 24;
    group.add(textPlane);
  }

  group.userData.wordId = word.id;
  threeState.scene.add(group);
  word.three = { group };
}

function _lecturasGameSyncBalloonMesh(word = null, runtime = lecturasGameModeRuntime) {
  if (!word?.three?.group) return;
  const group = word.three.group;
  const px = Number(word.x || 0) + Number(word.width || 0) / 2;
  const py = Number(word.y || 0) + Number(word.height || 0) / 2;
  group.position.set(px - runtime.viewWidth / 2, runtime.viewHeight / 2 - py, 0);
  const sx = Math.max(0.74, Math.min(1.34, Math.max(180, word.width) / 238));
  const sy = Math.max(0.72, Math.min(1.26, Math.max(90, word.height) / 142));
  group.scale.set(sx, sy, 1);
  group.visible = !!word.active;
}

function _lecturasGameRemoveBalloonMesh(word = null, runtime = lecturasGameModeRuntime) {
  const group = word?.three?.group;
  if (!group) return;
  try {
    runtime.three.scene?.remove(group);
    group.traverse((obj) => {
      obj.geometry?.dispose?.();
      const mat = obj.material;
      if (Array.isArray(mat)) mat.forEach((m) => m?.dispose?.());
      else mat?.dispose?.();
      const map = mat?.map;
      map?.dispose?.();
    });
  } catch (_) {
    // noop
  }
  word.three = null;
}

function _lecturasGameSpawnBalloonPop(word = null, runtime = lecturasGameModeRuntime, options = {}) {
  const threeState = runtime.three;
  const THREE = threeState.lib;
  if (!threeState.ready || !THREE || !word) return;
  const scale = Math.max(0.85, Math.min(2.4, Number(options?.explosionScale || 1)));
  const centerX = (Number(word.x || 0) + Number(word.width || 0) / 2) - runtime.viewWidth / 2;
  const centerY = runtime.viewHeight / 2 - (Number(word.y || 0) + Number(word.height || 0) / 2);
  const particleCount = Math.round(34 * scale);
  const positions = new Float32Array(particleCount * 3);
  const velocities = [];
  const colors = new Float32Array(particleCount * 3);
  const hueBase = word.isCorrect ? [1, 0.7, 0.2] : [0.72, 0.82, 1];
  for (let i = 0; i < particleCount; i += 1) {
    const i3 = i * 3;
    positions[i3] = centerX;
    positions[i3 + 1] = centerY;
    positions[i3 + 2] = (Math.random() - 0.5) * 22;
    const angle = Math.random() * Math.PI * 2;
    const speed = (60 + Math.random() * 220) * Math.max(1, scale * 0.94);
    velocities.push({ x: Math.cos(angle) * speed, y: Math.sin(angle) * speed, z: (Math.random() - 0.5) * 28 });
    colors[i3] = Math.min(1, hueBase[0] + (Math.random() - 0.5) * 0.1);
    colors[i3 + 1] = Math.min(1, hueBase[1] + (Math.random() - 0.5) * 0.1);
    colors[i3 + 2] = Math.min(1, hueBase[2] + (Math.random() - 0.5) * 0.1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: Math.max(8, 8 * scale),
    transparent: true,
    opacity: 0.96,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const points = new THREE.Points(geometry, material);
  threeState.scene.add(points);
  threeState.popBursts.push({ points, velocities, age: 0, maxAge: Math.max(0.58, 0.58 + ((scale - 1) * 0.22)) });
}

function _lecturasGameUpdateThree(dtMs = 16, runtime = lecturasGameModeRuntime) {
  const threeState = runtime.three;
  if (!threeState.ready || !threeState.scene || !threeState.renderer || !threeState.camera) return;
  const dt = Math.max(1, Number(dtMs || 16)) / 1000;
  runtime.words.forEach((word) => {
    if (!word.three?.group && word.active) _lecturasGameCreateBalloonMesh(word, runtime);
    if (word.three?.group) _lecturasGameSyncBalloonMesh(word, runtime);
  });
  threeState.popBursts = (threeState.popBursts || []).filter((burst) => {
    burst.age += dt;
    const posAttr = burst.points.geometry.getAttribute("position");
    const alpha = Math.max(0, 1 - (burst.age / burst.maxAge));
    burst.points.material.opacity = alpha;
    for (let i = 0; i < burst.velocities.length; i += 1) {
      const i3 = i * 3;
      const vel = burst.velocities[i];
      vel.y -= 280 * dt;
      posAttr.array[i3] += vel.x * dt;
      posAttr.array[i3 + 1] += vel.y * dt;
      posAttr.array[i3 + 2] += vel.z * dt;
    }
    posAttr.needsUpdate = true;
    if (burst.age >= burst.maxAge) {
      threeState.scene.remove(burst.points);
      burst.points.geometry?.dispose?.();
      burst.points.material?.dispose?.();
      return false;
    }
    return true;
  });
  threeState.renderer.render(threeState.scene, threeState.camera);
}

function _lecturasGameDrawPowerup(ctx = null, powerup = null, runtime = lecturasGameModeRuntime) {
  if (!ctx || !powerup?.active) return;
  const pulse = Math.sin(Number(powerup.pulse || 0));
  const type = String(powerup?.type || LECTURAS_GAME_POWERUP_TYPES.FIRE);
  const palette = type === LECTURAS_GAME_POWERUP_TYPES.ICE
    ? { a: "rgba(172, 235, 255, 0.58)", b: "rgba(86, 180, 255, 0.34)", c: "#6be7ff", d: "#155ea8", glow: "rgba(138,231,255,0.96)" }
    : (type === LECTURAS_GAME_POWERUP_TYPES.PACIFIST
      ? { a: "rgba(214, 214, 214, 0.56)", b: "rgba(140, 140, 140, 0.34)", c: "#f4f4f4", d: "#545454", glow: "rgba(240,240,240,0.88)" }
      : (type === LECTURAS_GAME_POWERUP_TYPES.BOMB
        ? { a: "rgba(255, 196, 120, 0.58)", b: "rgba(255, 114, 52, 0.34)", c: "#ffb143", d: "#8f2e00", glow: "rgba(255,182,96,0.96)" }
        : (type === LECTURAS_GAME_POWERUP_TYPES.CHAOS
          ? { a: "rgba(255, 132, 225, 0.58)", b: "rgba(170, 96, 255, 0.34)", c: "#ff69f5", d: "#5a168b", glow: "rgba(255,120,245,0.96)" }
          : { a: "rgba(255, 243, 120, 0.5)", b: "rgba(255, 189, 58, 0.26)", c: "#ffca33", d: "#915100", glow: "rgba(255,225,98,0.96)" })));
  const centerX = Number(powerup.x || 0) + Number(powerup.width || 0) / 2;
  const centerY = Number(powerup.y || 0) + Number(powerup.height || 0) / 2;
  const scale = Math.max(0.55, Math.min(1.4, Number(powerup.scale || 1)));
  const glowR = (Math.max(42, Number(powerup.width || 160) * 0.38) + (pulse * 6)) * scale;
  ctx.save();
  const radial = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, glowR);
  radial.addColorStop(0, palette.a);
  radial.addColorStop(0.6, palette.b);
  radial.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = radial;
  ctx.beginPath();
  ctx.arc(centerX, centerY, glowR, 0, Math.PI * 2);
  ctx.fill();

  const sparkCount = 8;
  ctx.strokeStyle = String(palette.glow || "rgba(255, 255, 190, 0.85)");
  ctx.lineWidth = 2.4;
  for (let i = 0; i < sparkCount; i += 1) {
    const angle = (Math.PI * 2 * i) / sparkCount + (Number(powerup.pulse || 0) * 0.35);
    const r1 = glowR * 0.58;
    const r2 = glowR * (0.86 + (Math.sin(Number(powerup.pulse || 0) + i) * 0.06));
    const x1 = centerX + Math.cos(angle) * r1;
    const y1 = centerY + Math.sin(angle) * r1;
    const x2 = centerX + Math.cos(angle) * r2;
    const y2 = centerY + Math.sin(angle) * r2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  _lecturasGameDrawBallooningText(ctx, powerup.text || LECTURAS_GAME_POWERUP_WORD, centerX, centerY + 1, {
    fontSize: Math.max(52, Math.min(88, Math.round(runtime.viewWidth * 0.072 * scale))),
    color: palette.c,
    stroke: palette.d,
    shadow: "rgba(0,0,0,0.35)",
    glowColor: palette.glow,
    glowBlur: 24,
    highlightColor: "rgba(255,255,255,0.52)"
  });
  ctx.restore();
}

function _lecturasGameDrawFireballs(ctx = null, runtime = lecturasGameModeRuntime) {
  if (!ctx || !Array.isArray(runtime.fireballs) || !runtime.fireballs.length) return;
  runtime.fireballs.forEach((ball) => {
    const x = Number(ball.x || 0);
    const y = Number(ball.y || 0);
    const r = Math.max(4, Number(ball.radius || 14));
    const isSuper = !!ball.isSuper;
    const palette = _lecturasGameGetFireVisualPalette(String(ball?.elementType || LECTURAS_GAME_POWERUP_TYPES.FIRE));
    const trail = Array.isArray(ball.trail) ? ball.trail : [];
    if (trail.length > 1) {
      for (let i = 1; i < trail.length; i += 1) {
        const from = trail[i - 1];
        const to = trail[i];
        const t = i / Math.max(1, trail.length - 1);
        const alpha = Math.max(0, (isSuper ? 0.82 : 0.68) * (1 - t));
        const width = Math.max(1.4, (r * (isSuper ? 1.05 : 0.82)) * (1 - t));
        const grad = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
        grad.addColorStop(0, String(palette.trailA || "").replace("__A__", String(alpha)));
        grad.addColorStop(1, String(palette.trailB || "").replace("__A__", String(Math.max(0, alpha * 0.35))));
        ctx.strokeStyle = grad;
        ctx.lineWidth = width;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
    }
    ctx.save();
    const outer = ctx.createRadialGradient(x, y, 0, x, y, r * 2.1);
    outer.addColorStop(0, String(palette.core0 || ""));
    outer.addColorStop(0.38, String(palette.core1 || ""));
    outer.addColorStop(0.72, String(palette.core2 || ""));
    outer.addColorStop(1, String(palette.core3 || ""));
    ctx.fillStyle = outer;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = String(palette.coreDot || "rgba(255, 244, 190, 0.96)");
    ctx.beginPath();
    ctx.arc(x, y, r * 0.64, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = String(palette.ring || "rgba(255,255,228,0.7)");
    ctx.lineWidth = Math.max(1, r * 0.11);
    ctx.beginPath();
    ctx.arc(x - (r * 0.18), y - (r * 0.2), r * 0.42, Math.PI * 1.1, Math.PI * 1.85);
    ctx.stroke();
    ctx.restore();
  });
}

function _lecturasGameDrawChargeOrbs(ctx = null, runtime = lecturasGameModeRuntime, jointsOverride = null) {
  if (!ctx || !_lecturasGameIsAnyFireModeActive(runtime, performance.now())) return;
  const t = performance.now() * 0.01;
  const visualJoints = Array.isArray(jointsOverride) ? jointsOverride : [];
  ["left", "right"].forEach((handKey, idx) => {
    const sideKey = runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR ? handKey : "";
    if (!_lecturasGameIsFireModeActiveForSide(sideKey, runtime, performance.now())) return;
    const hand = runtime?.hands?.[handKey];
    if (!hand?.closed) return;
    const charge = Math.max(0, Math.min(1, Number(hand.chargeNorm || 0)));
    const visualHand = _lecturasGameSelectVisualHandNode(handKey, visualJoints, runtime);
    const sourcePos = visualHand || null;
    if (!sourcePos) return;
    const activeType = runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR
      ? _lecturasGameGetFireModeTypeForSide(handKey, runtime, performance.now())
      : _lecturasGameGetFireModeTypeForSide("", runtime, performance.now());
    const palette = _lecturasGameGetFireVisualPalette(activeType || LECTURAS_GAME_POWERUP_TYPES.FIRE);
    const cx = Number(sourcePos.x || 0);
    const cy = Number(sourcePos.y || 0);
    const baseR = 14 + (charge * 24);
    const pulse = 1 + (Math.sin(t * 1.2 + idx) * 0.12);
    const r = baseR * pulse;
    const aura = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.1);
    aura.addColorStop(0, String(palette.charge0 || "rgba(255, 247, 184, 0.85)"));
    aura.addColorStop(0.45, String(palette.charge1 || "rgba(255, 166, 62, 0.65)"));
    aura.addColorStop(1, String(palette.charge2 || "rgba(255, 78, 26, 0)"));
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 2.1, 0, Math.PI * 2);
    ctx.fill();

    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    core.addColorStop(0, String(palette.chargeCore0 || "rgba(255,255,234,1)"));
    core.addColorStop(0.45, String(palette.chargeCore1 || "rgba(255,204,92,0.98)"));
    core.addColorStop(1, String(palette.chargeCore2 || "rgba(255,88,32,0.92)"));
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 4; i += 1) {
      const ang = (t * 1.6) + (i * (Math.PI / 2));
      const rx = cx + Math.cos(ang) * (r * 1.35);
      const ry = cy + Math.sin(ang) * (r * 1.35);
      ctx.fillStyle = String(palette.spark || "rgba(255, 246, 180, 0.9)");
      ctx.beginPath();
      ctx.arc(rx, ry, Math.max(2, r * 0.16), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function _lecturasGameDrawFireAuraParticles(ctx = null, runtime = lecturasGameModeRuntime, jointsOverride = null) {
  if (!ctx || !_lecturasGameIsAnyFireModeActive(runtime, performance.now())) return;
  const joints = Array.isArray(jointsOverride) ? jointsOverride : (Array.isArray(runtime.pose?.joints) ? runtime.pose.joints : []);
  const t = performance.now() * 0.01;
  joints.forEach((joint, idx) => {
    if (!joint) return;
    const kind = String(joint.kind || "").toLowerCase();
    if (!kind.includes("hand")) return;
    const sideKey = runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR
      ? (_lecturasGameGetSideByX(joint?.x, runtime) || "left")
      : "";
    if (!_lecturasGameIsFireModeActiveForSide(sideKey, runtime, performance.now())) return;
    const activeType = _lecturasGameGetFireModeTypeForSide(sideKey, runtime, performance.now());
    if (!activeType) return;
    const palette = _lecturasGameGetFireVisualPalette(activeType);
    const baseR = Math.max(12, Number(joint.r || 12) * 1.1);
    for (let i = 0; i < 5; i += 1) {
      const phase = t + (idx * 0.9) + i;
      const ring = baseR * (0.55 + (i * 0.18));
      const px = Number(joint.x || 0) + (Math.cos(phase * 1.7) * ring * 0.45);
      const py = Number(joint.y || 0) + (Math.sin(phase * 2.1) * ring * 0.4);
      const pr = Math.max(1.3, baseR * (0.09 + (0.02 * i)));
      const g = ctx.createRadialGradient(px, py, 0, px, py, pr * 2.4);
      g.addColorStop(0, String(palette.chargeCore0 || "rgba(255, 255, 214, 0.92)"));
      g.addColorStop(0.4, String(palette.chargeCore1 || "rgba(255, 176, 72, 0.74)"));
      g.addColorStop(1, String(palette.charge2 || "rgba(255, 66, 22, 0)"));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, pr * 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function _lecturasGameDrawBombChargeFx(ctx = null, runtime = lecturasGameModeRuntime, nowMs = performance.now()) {
  if (!ctx) return;
  const t = Number(nowMs || performance.now()) * 0.007;
  const drawCore = (cx = 0, cy = 0, chargeNorm = 0) => {
    const norm = Math.max(0, Math.min(1, Number(chargeNorm || 0)));
    if (norm <= 0.01) return;
    const baseR = 18 + (norm * 44);
    const pulse = 1 + (Math.sin(t * 1.8) * 0.08);
    const r = baseR * pulse;
    const aura = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.15);
    aura.addColorStop(0, "rgba(246, 255, 255, 0.9)");
    aura.addColorStop(0.26, "rgba(185, 235, 255, 0.82)");
    aura.addColorStop(0.62, "rgba(86, 168, 255, 0.58)");
    aura.addColorStop(1, "rgba(44, 102, 236, 0)");
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 2.15, 0, Math.PI * 2);
    ctx.fill();

    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    core.addColorStop(0, "rgba(255,255,255,1)");
    core.addColorStop(0.45, "rgba(203,240,255,0.98)");
    core.addColorStop(1, "rgba(95,173,255,0.95)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    const particles = 16;
    for (let i = 0; i < particles; i += 1) {
      const phase = (t * 1.4) + ((i / particles) * Math.PI * 2);
      const orbit = r * (1.8 + ((i % 4) * 0.22));
      const px = cx + (Math.cos(phase) * orbit);
      const py = cy + (Math.sin(phase * 1.1) * orbit * 0.75);
      const pull = 0.18 + ((Math.sin((t * 2.1) + i) + 1) * 0.09);
      const inX = px + ((cx - px) * pull);
      const inY = py + ((cy - py) * pull);
      const pr = Math.max(1.8, 2.2 + (norm * 2.8));
      const g = ctx.createRadialGradient(inX, inY, 0, inX, inY, pr * 2.3);
      g.addColorStop(0, "rgba(236, 251, 255, 0.96)");
      g.addColorStop(0.48, "rgba(131, 214, 255, 0.82)");
      g.addColorStop(1, "rgba(76, 154, 255, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(inX, inY, pr * 2.3, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR) {
    LECTURAS_GAME_PAIR_SIDES.forEach((side) => {
      const sideState = _lecturasGameGetPairSideState(side, runtime);
      if (Number(sideState?.bombReadyUntilMs || 0) <= Number(nowMs || 0)) return;
      const hand = _lecturasGameGetHandState(side, runtime);
      const cx = Number(hand?.wrist?.x || _lecturasGameGetPanelAnchorX(side, runtime));
      const cy = Number(hand?.wrist?.y || (Number(runtime.viewHeight || 540) * 0.62));
      drawCore(cx, cy, Number(sideState?.bombChargeNorm || 0));
    });
    return;
  }

  if (Number(runtime?.bombReadyUntilMs || 0) <= Number(nowMs || 0)) return;
  const left = _lecturasGameGetHandState("left", runtime);
  const right = _lecturasGameGetHandState("right", runtime);
  const cx = left?.wrist && right?.wrist
    ? (Number(left.wrist.x || 0) + Number(right.wrist.x || 0)) / 2
    : Number(runtime.viewWidth || 960) * 0.5;
  const cy = left?.wrist && right?.wrist
    ? (Number(left.wrist.y || 0) + Number(right.wrist.y || 0)) / 2
    : Number(runtime.viewHeight || 540) * 0.6;
  drawCore(cx, cy, Number(runtime?.bombChargeNorm || 0));
}

function _lecturasGameRender() {
  const runtime = lecturasGameModeRuntime;
  const ctx = runtime.ctx;
  if (!ctx) return;
  const w = runtime.viewWidth;
  const h = runtime.viewHeight;

  ctx.clearRect(0, 0, w, h);
  if (runtime.gameBackgroundImageReady && runtime.gameBackgroundImage) {
    if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR) {
      const img = runtime.gameBackgroundImage;
      const iw = Math.max(1, Number(img.naturalWidth || img.width || w));
      const ih = Math.max(1, Number(img.naturalHeight || img.height || h));
      const srcW = Math.max(1, Math.round(iw * 0.65));
      const srcH = ih;
      const leftSx = Math.max(0, Math.round(iw * 0.02));
      const rightSx = Math.max(0, Math.round(iw * 0.28));
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w / 2, h);
      ctx.clip();
      ctx.drawImage(img, leftSx, 0, srcW, srcH, 0, 0, w / 2, h);
      ctx.fillStyle = "rgba(10, 34, 80, 0.18)";
      ctx.fillRect(0, 0, w / 2, h);
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.rect(w / 2, 0, w / 2, h);
      ctx.clip();
      ctx.drawImage(img, rightSx, 0, srcW, srcH, w / 2, 0, w / 2, h);
      ctx.fillStyle = "rgba(96, 38, 8, 0.18)";
      ctx.fillRect(w / 2, 0, w / 2, h);
      ctx.restore();
    } else {
      _lecturasGameDrawImageCover(ctx, runtime.gameBackgroundImage, w, h);
      const scrim = ctx.createLinearGradient(0, 0, 0, h);
      scrim.addColorStop(0, "rgba(6, 14, 26, 0.44)");
      scrim.addColorStop(1, "rgba(8, 18, 30, 0.22)");
      ctx.fillStyle = scrim;
      ctx.fillRect(0, 0, w, h);
    }
  } else {
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#163c7a");
    bg.addColorStop(1, "#1f8ec7");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(10, 16, 30, 0.08)";
    ctx.fillRect(0, 0, w, h);
    if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR) {
      ctx.fillStyle = "rgba(11, 36, 82, 0.14)";
      ctx.fillRect(0, 0, w / 2, h);
      ctx.fillStyle = "rgba(96, 46, 10, 0.12)";
      ctx.fillRect(w / 2, 0, w / 2, h);
    }
  }
  const transition = runtime.backgroundTransition;
  if (transition?.active && transition.snapshot) {
    const shakeProgress = Math.max(0, 1 - (transition.elapsedMs / Math.max(1, transition.shakeMs)));
    const shakeX = Math.sin(transition.elapsedMs * 0.16) * 10 * shakeProgress;
    const shakeY = Math.cos(transition.elapsedMs * 0.22) * 7 * shakeProgress;
    if (transition.elapsedMs < transition.breakMs) {
      ctx.save();
      ctx.drawImage(transition.snapshot, shakeX, shakeY, w, h);
      ctx.restore();
    } else {
      transition.shards.forEach((piece) => {
        if (!piece || piece.alpha <= 0.01 || transition.elapsedMs < piece.delayMs) return;
        const cx = piece.x + piece.sw / 2;
        const cy = piece.y + piece.sh / 2;
        ctx.save();
        ctx.globalAlpha = piece.alpha;
        ctx.translate(cx, cy);
        ctx.rotate(piece.rot);
        ctx.drawImage(
          transition.snapshot,
          piece.sx,
          piece.sy,
          piece.sw,
          piece.sh,
          -piece.sw / 2,
          -piece.sh / 2,
          piece.sw,
          piece.sh
        );
        ctx.restore();
      });
      transition.smoke.forEach((puff) => {
        if (!puff || puff.alpha <= 0.01) return;
        const g = ctx.createRadialGradient(puff.x, puff.y, 0, puff.x, puff.y, Math.max(6, puff.r));
        g.addColorStop(0, `rgba(230, 234, 240, ${Math.min(0.42, puff.alpha)})`);
        g.addColorStop(0.7, `rgba(150, 158, 170, ${Math.min(0.3, puff.alpha * 0.9)})`);
        g.addColorStop(1, "rgba(80, 90, 102, 0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(puff.x, puff.y, puff.r, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }

  if (!runtime.three?.ready) {
    const fontSize = Math.max(100, Math.min(166, Math.round(runtime.viewWidth * 0.14)));
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    runtime.words.forEach((word) => {
      if (!word.active) return;
      const isCorrect = !!word.isCorrect;
      const x = word.x;
      const y = word.y;
      const ww = word.width;
      const wh = word.height;
      ctx.save();
      ctx.shadowBlur = 0;
      _lecturasGameDrawBallooningText(ctx, word.text, x + ww / 2, y + wh / 2 + 1, {
        fontSize,
        color: "#ffd44d",
        stroke: "#7f4900",
        shadow: "rgba(0,0,0,0.22)",
        glowColor: isCorrect ? "rgba(86,255,124,0.98)" : "",
        glowBlur: isCorrect ? 28 : 0,
        highlightColor: "rgba(255,255,255,0.4)"
      });
      ctx.restore();
    });
  }

  if (_lecturasGameIsTraceChallenge(runtime)) {
    _lecturasGameRenderTraceChallenge(ctx, runtime);
  }

  if (runtime.mode === LECTURAS_GAME_MODE.COUNTDOWN) {
    const num = Math.max(1, Math.ceil(runtime.countdownMs / 1000));
    const countdownY = _lecturasGameIsOrderChallenge(runtime) ? (h * 0.34) : (h / 2);
    ctx.save();
    ctx.fillStyle = "rgba(13, 23, 44, 0.35)";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 132px Nunito, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(num), w / 2, countdownY);
    ctx.restore();
  }

  if (runtime.mode === LECTURAS_GAME_MODE.PLAYING) {
    const remainSec = Math.max(0, Math.ceil((runtime.roundTimeLimitMs - runtime.roundElapsedMs) / 1000));
    const fireRemainSec = Math.max(0, Math.ceil(_lecturasGameGetFireModeMsLeft("", runtime, performance.now()) / 1000));
    const isOrderMode = _lecturasGameIsOrderChallenge(runtime);
    const campaign = runtime.readingCampaign || {};
    const total = Math.max(1, Number(campaign.totalReadingUnits || runtime?.round?.orderPhrases?.length || 1));
    const done = Math.max(0, Number(campaign.readingCursor || 0));
    const idleSecs = Math.max(0, Math.ceil(_lecturasGameGetOrderIdleRemainingMs(runtime, performance.now()) / 1000));
    ctx.save();
    ctx.font = "800 24px Nunito, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.textAlign = "left";
    ctx.fillText(isOrderMode ? `Lectura: ${Math.min(done, total)}/${total}` : `Tiempo: ${remainSec}s`, 14, 30);
    if (isOrderMode && runtime?.round?.orderTrapActive !== true) {
      ctx.font = "800 20px Nunito, sans-serif";
      ctx.fillStyle = "rgba(255, 220, 140, 0.98)";
      ctx.fillText(`Inactividad: ${idleSecs}s`, 14, 56);
    }
    if (_lecturasGameIsAnyFireModeActive(runtime, performance.now()) && fireRemainSec > 0) {
      ctx.fillStyle = "rgba(255, 214, 76, 0.98)";
      ctx.textAlign = "right";
      ctx.fillText(`Fuego: ${fireRemainSec}s`, Math.max(120, w - 16), 30);
    }
    ctx.restore();
  }
}

function _lecturasGameTick(nowMs = 0) {
  const runtime = lecturasGameModeRuntime;
  if (!runtime.active) return;
  if (!runtime.lastTickMs) runtime.lastTickMs = nowMs;
  const dt = Math.max(1, Math.min(80, nowMs - runtime.lastTickMs));
  runtime.lastTickMs = nowMs;
  _lecturasGameTryDetectPose(nowMs);
  _lecturasGameTryDetectHands(nowMs);
  _lecturasGameUpdate(dt);
  _lecturasGameRender();
  _lecturasGameRenderPoseOverlay(runtime);
  _lecturasGameUpdateThree(dt, runtime);
  _lecturasGameTryHandStart(nowMs, runtime);
  _lecturasGameTryHandRetry(nowMs, runtime);
  _lecturasGameTryHandQuiz(nowMs, runtime);
  _lecturasGameTryHandTraceReset(nowMs, runtime);
  _lecturasGameTryHandMicRead(nowMs, runtime);
  _lecturasGameSetMode(runtime.mode);
  runtime.rafId = requestAnimationFrame(_lecturasGameTick);
}

function _lecturasGameStopLoop(runtime = lecturasGameModeRuntime) {
  if (runtime.rafId) cancelAnimationFrame(runtime.rafId);
  runtime.rafId = 0;
  runtime.lastTickMs = 0;
  if (runtime.poseCtx) runtime.poseCtx.clearRect(0, 0, runtime.viewWidth, runtime.viewHeight);
  _lecturasGameResetLayerShake(runtime);
}

function _lecturasGameStartLoop(runtime = lecturasGameModeRuntime) {
  _lecturasGameStopLoop(runtime);
  runtime.rafId = requestAnimationFrame(_lecturasGameTick);
}

async function _lecturasGameStartCamera(runtime = lecturasGameModeRuntime) {
  if (!runtime.videoEl) return false;
  runtime.cameraError = "";
  runtime.cameraStatus = "Solicitando permiso de cámara...";
  _lecturasGameSetMode(runtime.mode);
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("getusermedia_not_supported");
    if (runtime.stream) {
      runtime.stream.getTracks().forEach((track) => {
        try { track.stop(); } catch (_) { }
      });
    }
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 540 } }
      });
    } catch (_) {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: true
      });
    }
    runtime.stream = stream;
    runtime.videoEl.srcObject = stream;
    await new Promise((resolve) => {
      const done = () => resolve(true);
      runtime.videoEl.onloadedmetadata = done;
      setTimeout(done, 850);
    });
    try { await runtime.videoEl.play(); } catch (_) { }
    runtime.cameraReady = true;
    runtime.cameraStatus = "Cámara activa";
    _lecturasGameSetMode(runtime.mode);
    return true;
  } catch (err) {
    if (runtime.allowSimulatedPose) {
      runtime.cameraReady = true;
      runtime.useSimulatedPose = true;
      runtime.cameraError = "";
      runtime.cameraStatus = "Modo simulación (sin cámara)";
      _lecturasGameSetMode(runtime.mode);
      return true;
    }
    runtime.cameraReady = false;
    runtime.cameraError = err?.message || "camera_error";
    runtime.cameraStatus = "No se pudo activar la cámara";
    _lecturasGameSetMode(runtime.mode);
    return false;
  }
}

function _lecturasGameStopCamera(runtime = lecturasGameModeRuntime) {
  runtime.cameraReady = false;
  runtime.cameraStatus = "Cámara detenida";
  if (runtime.videoEl) {
    try { runtime.videoEl.pause(); } catch (_) { }
    try { runtime.videoEl.srcObject = null; } catch (_) { }
  }
  if (runtime.stream) {
    runtime.stream.getTracks().forEach((track) => {
      try { track.stop(); } catch (_) { }
    });
  }
  runtime.stream = null;
}

function _lecturasGameResetForRetry() {
  const runtime = lecturasGameModeRuntime;
  _lecturasGameClearAutoNext(runtime);
  _lecturasGameStopGameMusic(runtime, "retry-round");
  runtime.quiz = null;
  runtime.quizPendingAfterWin = false;
  _lecturasGameResetRuntimeRound(runtime);
  _lecturasGameSetMode(LECTURAS_GAME_MODE.INSTRUCTION);
}

function _lecturasGameBuildStateText(runtime = lecturasGameModeRuntime) {
  const nowForState = performance.now();
  const renderPose = _lecturasGameBuildPoseRenderData(runtime);
  const activeWords = runtime.words
    .filter((item) => item.active)
    .map((item) => ({
      text: item.text,
      isCorrect: !!item.isCorrect,
      x: Math.round(item.x),
      y: Math.round(item.y),
      width: Math.round(item.width),
      height: Math.round(item.height)
    }));
  const activePowerups = _lecturasGameGetActivePowerups(runtime).map((powerup) => ({
    text: powerup.text,
    side: String(powerup.side || ""),
    x: Math.round(powerup.x || 0),
    y: Math.round(powerup.y || 0),
    active: !!powerup.active
  }));
  const payload = {
    mode: runtime.mode,
    playMode: runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR ? "pair" : "solo",
    orderDifficulty: _lecturasGameGetOrderDifficulty(runtime),
    challengeType: runtime.challengeType,
    coordinate_system: "origin top-left, +x right, +y down",
    targetWord: runtime.round?.targetWord || "",
    correctWord: runtime.round?.correctSynonym || "",
    wrongRemaining: Math.max(0, runtime.totalWrongCount - runtime.removedWrongCount),
    touchedCorrect: runtime.touchedCorrect === true,
    fireModeActive: _lecturasGameIsAnyFireModeActive(runtime, nowForState),
    fireModeMsLeft: _lecturasGameGetFireModeMsLeft("", runtime, nowForState),
    cameraReady: runtime.cameraReady === true,
    pose: {
      confidence: Number(runtime.pose?.confidence || 0),
      joints: (runtime.pose?.joints || []).map((j) => ({ kind: j.kind, x: Math.round(j.x), y: Math.round(j.y), r: Math.round(j.r) })),
      segments: (runtime.pose?.segments || []).map((s) => ({ kind: s.kind, ax: Math.round(s.ax), ay: Math.round(s.ay), bx: Math.round(s.bx), by: Math.round(s.by) }))
    },
    hands: {
      left: {
        closed: !!runtime?.hands?.left?.closed,
        chargeNorm: Number(runtime?.hands?.left?.chargeNorm || 0),
        aim: runtime?.hands?.left?.aim ? { x: Number(runtime.hands.left.aim.x || 0), y: Number(runtime.hands.left.aim.y || 0) } : null
      },
      right: {
        closed: !!runtime?.hands?.right?.closed,
        chargeNorm: Number(runtime?.hands?.right?.chargeNorm || 0),
        aim: runtime?.hands?.right?.aim ? { x: Number(runtime.hands.right.aim.x || 0), y: Number(runtime.hands.right.aim.y || 0) } : null
      }
    },
    progress: {
      level: Number(runtime.progress?.level || 1),
      score: Number(runtime.progress?.score || 0),
      gems: Number(runtime.progress?.gems || 0),
      sideScores: {
        left: Number(runtime.progress?.sideScores?.left || 0),
        right: Number(runtime.progress?.sideScores?.right || 0)
      }
    },
    completion: {
      type: String(runtime?.completionType || ""),
      isChampion: runtime?.isChampion === true,
      championName: String(runtime?.championName || "")
    },
    readingCampaign: {
      readingCursor: Number(runtime?.readingCampaign?.readingCursor || 0),
      totalReadingUnits: Number(runtime?.readingCampaign?.totalReadingUnits || 0),
      consecutivePronunciationErrors: Number(runtime?.readingCampaign?.consecutivePronunciationErrors || 0),
      idleRemainingMs: _lecturasGameGetOrderIdleRemainingMs(runtime, nowForState),
      perfectRun: runtime?.readingCampaign?.perfectRun !== false,
      lastQuizCheckpoint: Number(runtime?.readingCampaign?.lastQuizCheckpoint || 0),
      pronouncedCorrectWords: Number(runtime?.readingCampaign?.pronouncedCorrectWords || 0),
      pronouncedWrongWords: Number(runtime?.readingCampaign?.pronouncedWrongWords || 0)
    },
    order: {
      enabled: _lecturasGameIsOrderChallenge(runtime),
      phraseIndex: Number(runtime?.round?.orderIndex || 0),
      phraseWordIndex: Number(runtime?.round?.orderWordIndex || 0),
      phraseWords: Array.isArray(runtime?.round?.orderPhraseWords) ? runtime.round.orderPhraseWords : [],
      phraseWordStates: Array.isArray(runtime?.round?.orderPhraseWordStates) ? runtime.round.orderPhraseWordStates : [],
      trapActive: runtime?.round?.orderTrapActive === true,
      mic: {
        state: String(runtime?.orderVoice?.state || LECTURAS_GAME_ORDER_VOICE_STATE.IDLE),
        attemptId: Number(runtime?.orderVoice?.attemptId || 0),
        attemptStatus: String(runtime?.orderVoice?.attempt?.status || ""),
        cursor: Number(runtime?.orderVoice?.attempt?.cursor || 0),
        mismatchIndex: Number(runtime?.orderVoice?.attempt?.mismatchIndex ?? -1),
        finalTranscript: String(runtime?.orderVoice?.attempt?.finalTranscript || runtime?.orderVoice?.lastFinalTranscript || ""),
        supported: runtime?.orderVoice?.supported === true,
        starting: runtime?.orderVoice?.starting === true,
        listening: runtime?.orderVoice?.listening === true,
        listeningSince: Number(runtime?.orderVoice?.listeningSince || 0),
        silenceDeadlineInMs: Math.max(0, Number(runtime?.orderVoice?.silenceDeadline || 0) - nowForState),
        hasDetectedSpeech: runtime?.orderVoice?.hasDetectedSpeech === true,
        manualRetryRequired: runtime?.orderVoice?.manualRetryRequired === true,
        attemptSettled: runtime?.orderVoice?.attemptSettled === true,
        recoveryInFlight: runtime?.orderVoice?.recoveryInFlight === true,
        resetSamePhraseInMs: Math.max(0, Number(runtime?.orderVoice?.resetSamePhraseAt || 0) - nowForState),
        countdownLeft: _lecturasGameGetOrderCountdownRemaining(runtime, nowForState),
        nextAutoStartInMs: Math.max(0, Number(runtime?.orderVoice?.nextAutoStartAt || 0) - nowForState),
        lastError: String(runtime?.orderVoice?.lastError || ""),
        lastErrorAt: Number(runtime?.orderVoice?.lastErrorAt || 0),
        lastTransition: String(runtime?.orderVoice?.lastTransition || ""),
        lastTransitionAt: Number(runtime?.orderVoice?.lastTransitionAt || 0),
        lastTranscript: String(runtime?.orderVoice?.lastTranscript || ""),
        lastTranscriptAll: String(runtime?.orderVoice?.lastTranscriptAll || ""),
        lastFinalTranscript: String(runtime?.orderVoice?.lastFinalTranscript || ""),
        lastValidation: String(runtime?.orderVoice?.lastValidation || ""),
        spellMode: runtime?.orderVoice?.spellMode === true,
        expectedLetters: Array.isArray(runtime?.orderVoice?.expectedLetters) ? runtime.orderVoice.expectedLetters : [],
        alternatives: Array.isArray(runtime?.orderVoice?.alternatives)
          ? runtime.orderVoice.alternatives.map((item) => ({
            text: String(item?.text || ""),
            confidence: Number(item?.confidence || 0)
          }))
          : [],
        bestAlternative: String(runtime?.orderVoice?.bestAlternative || runtime?.orderVoice?.bestAltText || ""),
        bestAltText: String(runtime?.orderVoice?.bestAltText || runtime?.orderVoice?.bestAlternative || ""),
        bestAltScore: Number(runtime?.orderVoice?.bestAltScore || 0),
        bestAltConfidence: Number(runtime?.orderVoice?.bestAltConfidence || 0),
        lastRejectReason: String(runtime?.orderVoice?.lastRejectReason || "")
      }
    },
    background: {
      url: String(runtime.gameBackgroundUrl || ""),
      ready: runtime.gameBackgroundImageReady === true,
      transitionActive: !!runtime.backgroundTransition
    },
    effects: {
      levelTransitionActive: !!runtime.levelTransitionFx,
      levelTransitionMsLeft: Math.max(0, Number(runtime.levelTransitionFx?.durationMs || 0) - Number(runtime.levelTransitionFx?.elapsedMs || 0))
    },
    music: {
      gameUrl: String(runtime?.gameMusic?.url || _lecturasGameResolveCurrentGameMusicUrl(runtime) || ""),
      sourceUrl: String(_lecturasGameResolveCurrentGameMusicUrl(runtime) || ""),
      sourcePath: String(_lecturasGameResolveCurrentGameMusicPath(runtime) || ""),
      playing: !!runtime?.gameMusic?.audioEl && !runtime.gameMusic.audioEl.paused,
      currentTime: Number(runtime?.gameMusic?.audioEl?.currentTime || 0),
      lastError: String(runtime?.gameMusic?.lastError || ""),
      startedAtLevel: Number(runtime?.gameMusic?.startedAtLevel || 0)
    },
    offlinePack: {
      status: String(runtime?.offlinePack?.status || "idle"),
      progress: Number(runtime?.offlinePack?.progress || 0),
      error: String(runtime?.offlinePack?.error || ""),
      ready: String(runtime?.offlinePack?.status || "") === "ready"
    },
    silhouette: {
      enabled: runtime.silhouette?.enabled !== false,
      preferReal: runtime.silhouette?.preferReal !== false,
      hasRecentMask: {
        solo: !!_lecturasGameGetSilhouetteMaskForSide("solo", runtime, nowForState),
        left: !!_lecturasGameGetSilhouetteMaskForSide("left", runtime, nowForState),
        right: !!_lecturasGameGetSilhouetteMaskForSide("right", runtime, nowForState)
      }
    },
    powerup: activePowerups[0] || null,
    powerups: activePowerups,
    fireballs: (runtime.fireballs || []).map((ball) => ({
      x: Math.round(ball.x || 0),
      y: Math.round(ball.y || 0),
      radius: Math.round(ball.radius || 0),
      side: String(ball.side || ""),
      isSuper: !!ball.isSuper,
      penetrationLeft: Number.isFinite(Number(ball.penetrationLeft)) ? Math.round(Number(ball.penetrationLeft || 0)) : "inf",
      trailLen: Array.isArray(ball.trail) ? ball.trail.length : 0
    })),
    players: {
      left: {
        wrongRemaining: Number(runtime?.players?.left?.wrongRemaining || 0),
        fireModeActive: !!runtime?.players?.left?.fireModeActive,
        powerupActive: !!runtime?.players?.left?.powerupActive,
        fireballsCount: Number(runtime?.players?.left?.fireballsCount || 0)
      },
      right: {
        wrongRemaining: Number(runtime?.players?.right?.wrongRemaining || 0),
        fireModeActive: !!runtime?.players?.right?.fireModeActive,
        powerupActive: !!runtime?.players?.right?.powerupActive,
        fireballsCount: Number(runtime?.players?.right?.fireballsCount || 0)
      }
    },
    renderPoseHands: (renderPose.joints || [])
      .filter((joint) => String(joint?.kind || "").toLowerCase().includes("hand"))
      .map((joint) => ({
        kind: String(joint?.kind || ""),
        x: Math.round(Number(joint?.x || 0)),
        y: Math.round(Number(joint?.y || 0)),
        sideByX: _lecturasGameGetSideByX(Number(joint?.x || 0), runtime)
      })),
    activeWords
  };
  return JSON.stringify(payload);
}

function _lecturasGameAdvanceTime(ms = 16) {
  const runtime = lecturasGameModeRuntime;
  const total = Math.max(1, Number(ms || 16));
  const step = runtime.deterministicFrameMs;
  const frames = Math.max(1, Math.round(total / step));
  for (let i = 0; i < frames; i += 1) {
    _lecturasGameUpdate(step);
  }
  _lecturasGameRender();
  _lecturasGameSetMode(runtime.mode);
  return _lecturasGameBuildStateText(runtime);
}

async function _lecturasGamePauseNarration(runtime = lecturasGameModeRuntime) {
  const ref = runtime.ref;
  if (!ref || typeof window.cbGetLecturaGeminiLiveState !== "function" || typeof window.cbControlLecturaGeminiLive !== "function") return;
  try {
    const status = window.cbGetLecturaGeminiLiveState(ref);
    const liveState = String(status?.state || "idle");
    runtime.previousLiveState = liveState;
    runtime.shouldResumeNarration = liveState === "playing" || liveState === "starting" || liveState === "paused";
    runtime.pausedByGame = false;
    if (liveState === "playing" || liveState === "starting") {
      const result = await window.cbControlLecturaGeminiLive(ref, {});
      runtime.pausedByGame = String(result?.state || "") === "paused";
      runtime.cameraStatus = runtime.pausedByGame ? "Narración pausada" : runtime.cameraStatus;
    }
  } catch (_) {
    // no-op
  }
}

async function _lecturasGameResumeNarration(runtime = lecturasGameModeRuntime) {
  const ref = runtime.ref;
  if (!runtime.shouldResumeNarration || !ref) return false;
  try {
    if (typeof window.cbControlLecturaGeminiLive === "function") {
      const result = await window.cbControlLecturaGeminiLive(ref, {});
      const st = String(result?.state || "");
      if (st === "playing" || st === "starting") return true;
    }
    if (typeof window.cbLeerLecturaConGeminiLive === "function") {
      await window.cbLeerLecturaConGeminiLive(ref);
      return true;
    }
  } catch (_) {
    // fallback silenced
  }
  return false;
}

function _lecturasGameDispatchRoundEnded(reason = "") {
  const runtime = lecturasGameModeRuntime;
  try {
    window.dispatchEvent(new CustomEvent("cb:lecturas-game-round-ended", {
      detail: {
        reason: String(reason || ""),
        lecturaRef: runtime.ref ? { ...runtime.ref } : null,
        round: runtime.round ? {
          targetWord: runtime.round.targetWord,
          correctSynonym: runtime.round.correctSynonym,
          wrongTotal: runtime.totalWrongCount,
          wrongRemoved: runtime.removedWrongCount
        } : null
      }
    }));
  } catch (_) {
    // noop
  }
}

function _lecturasGameOpenShell(lectura = null, round = null) {
  console.log("[DEBUG] _lecturasGameOpenShell called", { modeModal: !!els.modeModal, modeModalBody: !!els.modeModalBody, modalClass: els.modeModal?.className, hasRound: !!round });
  if (!els.modeModal || !els.modeModalBody) {
    console.warn("[DEBUG] _lecturasGameOpenShell returning false - missing elements!");
    return false;
  }
  console.log("[DEBUG] _lecturasGameOpenShell building shell HTML...");
  _lecturasGameStopMenuBackgroundRotation();
  
  let shellHtml = "";
  if (_lecturasGameIsMinebloxChallenge(lecturasGameModeRuntime)) {
    shellHtml = `
      <div class="lecturas-game-mode-panel ascraft-container mineblox-container">
        <div id="lecturasGameWords3D" class="mineblox-three-container"></div>
        <div id="lecturasGameCanvasContainer" style="width:100%; height:100%;"></div>
        
        <div id="lecturasGameOverlay" class="lecturas-game-overlay">
          <div class="lecturas-game-overlay-content">
            <h2 id="lecturasGameOverlayTitle"></h2>
            <p id="lecturasGameOverlayText"></p>
            <button type="button" id="lecturasGameStartBtn" class="lecturas-game-pixel-btn is-primary" data-action="start-round">¡ENTRAR!</button>
          </div>
        </div>
      </div>
    `;
  } else {
    shellHtml = _lecturasGameBuildShellHtml(lectura, round, lecturasGameModeRuntime);
  }
  
  console.log("[DEBUG] Shell HTML length:", shellHtml?.length, "isMineblox:", _lecturasGameIsMinebloxChallenge(lecturasGameModeRuntime));
  if (!shellHtml || shellHtml.length < 10) {
    console.error("[DEBUG] Shell HTML is empty or too short!");
    return false;
  }
  els.modeModalBody.innerHTML = shellHtml;
  console.log("[DEBUG] Shell HTML inserted, checking panel...");
  document.documentElement.classList.add("is-game-modal-open");
  const panel = els.modeModal.querySelector(".lecturas-game-mode-panel");
  console.log("[DEBUG] Panel found:", !!panel);
  if (!panel) {
    console.warn("[DEBUG] Panel not found! Modal HTML structure may be wrong.");
    return false;
  }
  panel?.classList?.add("is-game-active");
  console.log("[DEBUG] Adding is-open class to modal...");
  els.modeModal.classList.add("is-open");
  els.modeModal.setAttribute("aria-hidden", "false");
  els.modeModal.scrollIntoView({ behavior: "smooth", block: "start" });
  _lecturasGameInjectTutorialStyles();
  _lecturasGameCacheUiRefs();
  _lecturasGameResizeCanvas();
  console.log("[DEBUG] _lecturasGameOpenShell completed successfully!");
  return true;
}

function _lecturasGameOpenMenu(lectura = null) {
  if (!els.modeModal || !els.modeModalBody) return false;
  const runtime = lecturasGameModeRuntime;
  els.modeModalBody.innerHTML = _lecturasGameBuildMenuHtml(lectura, runtime);
  const panel = els.modeModal.querySelector(".lecturas-game-mode-panel");
  panel?.classList?.remove("is-game-active");
  document.documentElement.classList.add("is-game-modal-open");
  els.modeModal.classList.add("is-open");
  els.modeModal.setAttribute("aria-hidden", "false");
  els.modeModal.scrollIntoView({ behavior: "smooth", block: "start" });
  _lecturasGameApplyMenuBackgroundSlides(runtime).catch(() => { });
  return true;
}

function _lecturasGameRenderMenuStep(runtime = lecturasGameModeRuntime) {
  if (!runtime?.lectura) return false;
  return _lecturasGameOpenMenu(runtime.lectura);
}

async function _lecturasGameStartSelectedGame(options = {}) {
  const runtime = lecturasGameModeRuntime;
  console.log("[DEBUG] _lecturasGameStartSelectedGame called", { lecture: !!runtime.lectura, modeModal: !!els.modeModal, modeModalBody: !!els.modeModalBody, selectedGameId: runtime.selectedGameId, challengeType: runtime.challengeType });
  if (!runtime.lectura || !els.modeModal || !els.modeModalBody) {
    console.warn("[DEBUG] _lecturasGameStartSelectedGame early return - missing runtime.lectura or modal elements");
    return;
  }
  const continueFromCheckpoint = options?.continueFromCheckpoint === true;
  const selectedGameId = _lecturasGameNormalizeGameId(runtime.forcedGameId || runtime.selectedGameId || runtime.challengeType || "");
  runtime.active = true;
  runtime.selectedGameId = selectedGameId;
  runtime.menuStep = "mode_select";
  const canContinue = continueFromCheckpoint && _lecturasGameCanContinue(runtime);
  runtime.roundTimeLimitMs = (selectedGameId === "order") ? 300000 : 60000;
  await _lecturasGamePrepareGameBackgrounds(runtime);
  const buildProfileSeedProgress = () => ({
    level: 1,
    score: 0,
    sideScores: { left: 0, right: 0 },
    gems: 0
  });
  const normalizeProgress = (input = null) => {
    const src = input && typeof input === "object" ? input : {};
    const seed = buildProfileSeedProgress();
    const score = Number(src.score ?? seed.score ?? 0);
    const nextMilestoneDefault = Math.max(
      LECTURAS_GAME_GEMS_PER_SCORE,
      (Math.floor(Math.max(0, score) / LECTURAS_GAME_GEMS_PER_SCORE) + 1) * LECTURAS_GAME_GEMS_PER_SCORE
    );
    return {
      level: Math.max(1, Number(src.level || seed.level || 1)),
      score,
      sideScores: {
        left: Number(src?.sideScores?.left ?? seed?.sideScores?.left ?? 0),
        right: Number(src?.sideScores?.right ?? seed?.sideScores?.right ?? 0)
      },
      gems: Number(src.gems ?? seed.gems ?? 0),
      nextGemScoreMilestone: Math.max(LECTURAS_GAME_GEMS_PER_SCORE, Number(src.nextGemScoreMilestone || nextMilestoneDefault)),
      rewardMessage: String(src.rewardMessage || "Comienza a proteger sinónimos.")
    };
  };
  if (canContinue) {
    const cp = runtime.checkpoint || {};
    const cpType = _lecturasGameNormalizeGameId(cp.challengeType || runtime.selectedGameId || runtime.challengeType || "");
    runtime.challengeType = cpType;
    runtime.selectedGameId = cpType;
    runtime.selectedOrderDifficulty = String(cp.orderDifficulty || runtime.selectedOrderDifficulty || "").toLowerCase() === LECTURAS_GAME_ORDER_DIFFICULTY.EXPERT
      ? LECTURAS_GAME_ORDER_DIFFICULTY.EXPERT
      : _lecturasGameGetOrderDifficulty(runtime);
    runtime.plannedNextChallenge = cpType;
    runtime.progress = normalizeProgress(_lecturasGameDeepClone(cp.progress));
  } else {
    runtime.challengeType = selectedGameId;
    runtime.plannedNextChallenge = null;
    runtime.progress = normalizeProgress(null);
  }
  runtime.orderVoice = {
    ...(runtime.orderVoice || {}),
    supported: !!_lecturasGameGetSpeechRecognitionCtor(),
    recognition: null,
    state: LECTURAS_GAME_ORDER_VOICE_STATE.IDLE,
    attemptId: Math.max(0, Number(runtime?.orderVoice?.attemptId || 0)),
    attempt: null,
    starting: false,
    listening: false,
    listeningSince: 0,
    silenceDeadline: 0,
    hasDetectedSpeech: false,
    recoverableErrorRetries: 0,
    manualRetryRequired: false,
    processedWordCount: 0,
    lastError: "",
    lastErrorAt: 0,
    lastTransition: "",
    lastTransitionAt: 0,
    attemptSettled: false,
    recoveryInFlight: false,
    resetSamePhraseAt: 0,
    countdownStartAt: 0,
    countdownUntilMs: 0,
    expectedPhrase: "",
    lastTranscript: "",
    lastTranscriptAll: "",
    lastFinalTranscript: "",
    lastValidation: "",
    nextAutoStartAt: 0,
    validationGraceUntilMs: 0,
    listenStartedAt: 0,
    autoStopTimer: 0,
    promptVersion: Number((runtime?.orderVoice?.promptVersion || 0) + 1),
    spellMode: false,
    expectedLetters: [],
    alternatives: [],
    bestAlternative: "",
    bestAltText: "",
    bestAltScore: 0,
    bestAltConfidence: 0,
    lastRejectReason: "",
    spellRetryCount: 0,
    prosodyCaptureActive: false,
    prosodyTimerId: 0,
    prosodySampleRate: 44100,
    prosodySamples: [],
    prosodyStream: null,
    prosodyUsesMainStream: false,
    prosodySource: null,
    prosodyAnalyser: null
  };
  runtime.completionType = "";
  runtime.isChampion = false;
  runtime.championName = "";
  runtime.readingCampaign = {
    readingCursor: 0,
    totalReadingUnits: Math.max(0, Number(runtime?.round?.orderParagraphTotal || runtime?.round?.orderPhrases?.length || 0)),
    consecutivePronunciationErrors: 0,
    idleSinceMs: 0,
    perfectRun: true,
    lastQuizCheckpoint: 0,
    pronouncedCorrectWords: 0,
    pronouncedWrongWords: 0
  };
  const ok = _lecturasGamePrepareChallenge(runtime, runtime.challengeType || runtime.selectedGameId || LECTURAS_GAME_IDS.SYNONYMS);
  if (!ok) {
    if (els.modeModalBody) {
      els.modeModalBody.innerHTML = `
        <div class="lecturas-game-mainmenu">
          <div class="lecturas-game-mainmenu-vignette"></div>
          <div class="lecturas-game-mainmenu-content">
            <header class="lecturas-game-mainmenu-head">
              <h2>LECTURAS GAME</h2>
              <p>No hay palabras suficientes para esta ronda</p>
            </header>
            <footer class="lecturas-game-mainmenu-foot">
              <small>Esta lectura tiene muy poco texto útil para crear la ronda.</small>
            </footer>
          </div>
        </div>
      `;
    }
    return;
  }
  console.log("[DEBUG] About to call _lecturasGameOpenShell, round:", runtime.round ? "exists" : "null");
  console.log("[DEBUG] runtime.lectura:", !!runtime.lectura, "runtime.round:", !!runtime.round);
  try {
    const shellResult = _lecturasGameOpenShell(runtime.lectura, runtime.round);
    console.log("[DEBUG] OpenShell result:", shellResult);
    if (!shellResult) {
      console.error("[DEBUG] OpenShell returned false!");
      return;
    }
  } catch(e) {
    console.error("[DEBUG] Error in OpenShell:", e);
    return;
  }
  console.log("[DEBUG] _lecturasGameOpenShell success, proceeding to EnsureThree...");
  await _lecturasGameEnsureThree(runtime);
  console.log("[DEBUG] _lecturasGameEnsureThree completed");
  _lecturasGameResizeCanvas(runtime);
  _lecturasGameSetMode(LECTURAS_GAME_MODE.INSTRUCTION);
  console.log("[DEBUG] Mode set to INSTRUCTION");
  _lecturasGameStartLoop(runtime);
  console.log("[DEBUG] Game loop started");
  _lecturasGameStartRealtimeSync(runtime);
  window.render_game_to_text = () => _lecturasGameBuildStateText(runtime);
  window.advanceTime = (ms) => _lecturasGameAdvanceTime(ms);
  window.isOfflineCardAvailable = (lecturaKeyValue = "", lecturaLike = null) => _lecturasGameIsOfflineCardAvailable(lecturaKeyValue, lecturaLike);
  window.downloadOfflineCard = (lecturaKeyValue = "", gameId = "") => {
    const key = String(lecturaKeyValue || "").trim();
    const lectura = key ? state.lecturaByKey.get(key) : null;
    if (!lectura) return Promise.resolve(false);
    return _lecturasGameDownloadAllContentForLectura(lectura, gameId).then(() => true).catch(() => false);
  };
  window.pruneOfflineStorageIfNeeded = (maxBytes = LECTURAS_GAME_OFFLINE_MAX_BYTES) => _lecturasGamePruneOfflineStorageIfNeeded(maxBytes);
  window.runOfflineMigrationV3Once = () => _lecturasGameRunOfflineMigrationV3Once();
  await _lecturasGamePauseNarration(runtime);
  await _lecturasGameStartCamera(runtime);
  runtime.poseLandmarker = await _lecturasGameEnsurePoseLandmarker();
  runtime.handLandmarker = await _lecturasGameEnsureHandLandmarker();
  _lecturasGameSetMode(runtime.mode);
}

async function _lecturasGameStartSynonymsGame(options = {}) {
  const runtime = lecturasGameModeRuntime;
  runtime.selectedGameId = LECTURAS_GAME_IDS.SYNONYMS;
  runtime.challengeType = LECTURAS_GAME_IDS.SYNONYMS;
  return _lecturasGameStartSelectedGame(options);
}

async function openGameModePlaceholder(lectura = null, options = {}) {
  if (!lectura || !els.modeModal || !els.modeModalBody) return;
  const key = lecturaKey(lectura);
  if (navigator.onLine === false && !_lecturasGameIsOfflineCardAvailable(key, lectura)) {
    alert("Esta card no está descargada para modo offline.");
    return;
  }
  _lecturasGameTouchOfflineCard(key);
  const runtime = lecturasGameModeRuntime;
  const forceGameSelect = options?.forceGameSelect === true;
  runtime.token += 1;
  const token = runtime.token;

  closeGameModePlaceholder({ skipResume: true, reason: "silent" });
  runtime.token = token;
  runtime.active = false;
  runtime.lectura = lectura;
  runtime.ref = { id: String(lectura.id || ""), coleccion: String(lectura.sourceCollection || "") };
  runtime.round = null;
  runtime.selectedGameId = "";
  runtime.forcedGameId = forceGameSelect ? "" : _lecturasGameReadForcedGameId();
  runtime.selectedPlayMode = LECTURAS_GAME_PLAY_MODE.SOLO;
  runtime.menuStep = runtime.forcedGameId ? "mode_select" : "game_select";
  runtime.challengeType = runtime.forcedGameId || LECTURAS_GAME_IDS.SYNONYMS;
  runtime.selectedGameId = runtime.challengeType;
  runtime.plannedNextChallenge = runtime.challengeType;
  runtime.levelTransitionFx = null;
  runtime.forceNextBackgroundTransition = false;
  runtime.poseRaw = { joints: [], segments: [], confidence: 0, updatedAt: 0 };
  runtime.poseStable = { joints: [], segments: [], confidence: 0, updatedAt: 0 };
  runtime.pose = { joints: [], segments: [], confidence: 0, updatedAt: 0 };
  runtime.poseRenderAnchors = {};
  runtime.silhouette = {
    ...(runtime.silhouette || {}),
    bySide: { solo: null, left: null, right: null },
    lastMaskUpdateMs: 0
  };
  _lecturasGameResetPairStates(runtime, performance.now());
  runtime.handLastDetectMs = 0;
  runtime.poseLastSeenMs = 0;
  runtime.poseDetectStartMs = 0;
  runtime.cameraReady = false;
  runtime.cameraError = "";
  runtime.cameraStatus = "Preparando cámara...";
  runtime.shouldResumeNarration = false;
  runtime.previousLiveState = "idle";
  runtime.pausedByGame = false;
  runtime.useSimulatedPose = false;
  runtime.allowSimulatedPose = true;
  runtime.autoStartInDebug = false;
  runtime.roundTimeLimitMs = 60000;
  runtime.inputKeys = { left: false, right: false, up: false, down: false };
  runtime.simAvatar = { x: runtime.viewWidth / 2, y: runtime.viewHeight * 0.72, vx: 0, vy: 0 };
  runtime.powerup = null;
  runtime.powerupCollectedThisLevel = false;
  runtime.powerupSpawnAtMs = Number(performance.now() || Date.now()) + LECTURAS_GAME_POWERUP_SPAWN_DELAY_MS;
  runtime.firePickupFx = null;
  runtime.fireModeActive = false;
  runtime.fireModeUntilMs = 0;
  runtime.fireModeType = LECTURAS_GAME_POWERUP_TYPES.FIRE;
  runtime.freezeUntilMs = 0;
  runtime.pacifistUntilMs = 0;
  runtime.chaosUntilMs = 0;
  runtime.bombReadyUntilMs = 0;
  runtime.bombActivatedAtMs = 0;
  runtime.bombChestHoldStartMs = 0;
  runtime.bombChargeNorm = 0;
  runtime.fireballs = [];
  _lecturasGameStopGameMusic(runtime, "open-game");
  runtime.lastThrowMs = 0;
  runtime.lastThrowVector = { x: 0, y: -1 };
  runtime.wristHistory = {};
  runtime.simFireQueued = false;
  runtime.simFireCharging = false;
  runtime.simFireChargeStartMs = 0;
  runtime.simFireReleasePending = false;
  _lecturasGameResetHands(runtime);
  const localProfiles = _lecturasGameReadPlayerProfiles();
  const firstProfile = Object.values(localProfiles || {})[0] || null;
  runtime.playerAccounts = {
    solo: {
      username: String(firstProfile?.username || ""),
      alias: String(firstProfile?.alias || firstProfile?.username || ""),
      fullName: String(firstProfile?.fullName || ""),
      uidOwner: String(firstProfile?.uidOwner || ""),
      loggedIn: !!firstProfile,
      displayName: String(firstProfile?.displayName || firstProfile?.alias || firstProfile?.username || "Invitado"),
      bestScore: Number(firstProfile?.bestScore || 0)
    },
    left: {
      username: String(firstProfile?.username || ""),
      alias: String(firstProfile?.alias || firstProfile?.username || ""),
      fullName: String(firstProfile?.fullName || ""),
      uidOwner: String(firstProfile?.uidOwner || ""),
      loggedIn: !!firstProfile,
      displayName: String(firstProfile?.displayName || firstProfile?.alias || firstProfile?.username || "Jugador A"),
      bestScore: Number(firstProfile?.bestScore || 0)
    },
    right: {
      username: "",
      alias: "",
      fullName: "",
      uidOwner: "",
      loggedIn: false,
      displayName: "Jugador B",
      bestScore: 0
    }
  };
  try {
    const params = new URLSearchParams(window.location.search || "");
    const debugMode = params.get("gameDebug") === "1";
    const simPoseParam = params.get("simPose");
    const playModeParam = String(params.get("playMode") || "").toLowerCase();
    console.log("[DEBUG] Reading playMode from URL:", playModeParam);
    const forcedFromUrl = resolveForcedGameId(params.get("game") || "");
    if (simPoseParam === "0") runtime.allowSimulatedPose = false;
    if (simPoseParam === "1" || debugMode) runtime.allowSimulatedPose = true;
    if (playModeParam === "pair" || playModeParam === "pareja") {
      console.log("[DEBUG] Setting mode to PAIR from URL");
      runtime.selectedPlayMode = LECTURAS_GAME_PLAY_MODE.PAIR;
    } else {
      console.log("[DEBUG] Setting mode to SOLO (default)");
    }
    const difficultyParam = String(params.get("difficulty") || params.get("orderDifficulty") || "").toLowerCase();
    if (difficultyParam === "expert" || difficultyParam === "experto") {
      runtime.selectedOrderDifficulty = LECTURAS_GAME_ORDER_DIFFICULTY.EXPERT;
    } else if (difficultyParam === "novice" || difficultyParam === "novato") {
      runtime.selectedOrderDifficulty = LECTURAS_GAME_ORDER_DIFFICULTY.NOVICE;
    }
    if (forcedFromUrl && !forceGameSelect) {
      runtime.forcedGameId = forcedFromUrl;
      runtime.selectedGameId = forcedFromUrl;
      runtime.challengeType = forcedFromUrl;
      runtime.plannedNextChallenge = forcedFromUrl;
      runtime.menuStep = "mode_select";
    }
    runtime.autoStartInDebug = forceGameSelect ? false : (params.get("autoStart") === "1");
  } catch (_) {
    // noop
  }

  await _lecturasGameSyncOfflinePackState(runtime);
  if (!_lecturasGameOpenMenu(lectura)) return;
  runtime.mode = LECTURAS_GAME_MODE.GAME_SELECT;
  if (runtime.autoStartInDebug) {
    const autoSelectAction = runtime.forcedGameId === LECTURAS_GAME_IDS.ORDER
      ? "select-game-order"
      : (runtime.forcedGameId === LECTURAS_GAME_IDS.TRACE
        ? "select-game-trace"
        : (runtime.forcedGameId === LECTURAS_GAME_IDS.CAPS
          ? "select-game-caps"
          : (runtime.forcedGameId === LECTURAS_GAME_IDS.MINEBLOX ? "select-game-mineblox" : "select-game-synonyms")));
    setTimeout(() => {
      if (!els.modeModal?.classList?.contains("is-open")) return;
      _lecturasGameHandleUiAction(autoSelectAction)
        .then(() => (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR
          ? _lecturasGameHandleUiAction("select-mode-pair")
          : Promise.resolve()))
        .then(() => _lecturasGameHandleUiAction("start-selected-mode"))
        .catch(() => { });
    }, 180);
  }
}

function closeGameModePlaceholder(options = {}) {
  const runtime = lecturasGameModeRuntime;
  _lecturasGameStopOrderSpeech(runtime);
  if (runtime?.orderDemo?.pollTimerId) {
    clearTimeout(runtime.orderDemo.pollTimerId);
    runtime.orderDemo.pollTimerId = 0;
  }
  try { _detenerAudioWorkflowPlay(); } catch (_) { }
  _setLiveStateIdle({ keepRef: false });
  detenerGeminiLiveUnidad().catch(() => { });
  _lecturasGameClearAutoNext(runtime);
  _lecturasGameSaveCheckpoint(runtime);
  Promise.resolve(_lecturasGamePersistPlayerScores(runtime, "close")).catch(() => { });
  _lecturasGameStopRealtimeSync(runtime);
  _lecturasGameStopMenuBackgroundRotation(runtime);
  const skipResume = options?.skipResume === true;
  const closeReason = String(options?.reason || "closed").trim() || "closed";
  const token = runtime.token;
  runtime.token += 1;
  runtime.active = false;
  runtime.mode = LECTURAS_GAME_MODE.CLOSED;
  _lecturasGameStopLoop(runtime);
  _lecturasGameStopCamera(runtime);
  _lecturasGameStopGameMusic(runtime, "close-game");
  _lecturasGameDisposeThree(runtime);
  _lecturasGameClearAllWordEntities(runtime);
  runtime.particles = [];
  runtime.firePickupFx = null;
  runtime.levelTransitionFx = null;
  runtime.forceNextBackgroundTransition = false;
  _lecturasGameResetPairStates(runtime, performance.now());
  runtime.poseRaw = { joints: [], segments: [], confidence: 0, updatedAt: 0 };
  runtime.poseStable = { joints: [], segments: [], confidence: 0, updatedAt: 0 };
  runtime.pose = { joints: [], segments: [], confidence: 0, updatedAt: 0 };
  runtime.poseRenderAnchors = {};
  runtime.silhouette = {
    ...(runtime.silhouette || {}),
    bySide: { solo: null, left: null, right: null },
    lastMaskUpdateMs: 0
  };
  runtime.handLastDetectMs = 0;
  runtime.poseLastSeenMs = 0;
  runtime.poseDetectStartMs = 0;
  runtime.ui = {};
  runtime.lastTickMs = 0;
  runtime.cameraStatus = "Cámara detenida";
  runtime.inputKeys = { left: false, right: false, up: false, down: false };
  runtime.powerup = null;
  runtime.powerupCollectedThisLevel = false;
  runtime.powerupSpawnAtMs = Number(performance.now() || Date.now()) + LECTURAS_GAME_POWERUP_SPAWN_DELAY_MS;
  runtime.fireModeActive = false;
  runtime.fireModeUntilMs = 0;
  runtime.freezeUntilMs = 0;
  runtime.pacifistUntilMs = 0;
  runtime.chaosUntilMs = 0;
  runtime.bombReadyUntilMs = 0;
  runtime.bombActivatedAtMs = 0;
  runtime.bombChestHoldStartMs = 0;
  runtime.bombChargeNorm = 0;
  runtime.fireballs = [];
  runtime.lastThrowMs = 0;
  runtime.lastThrowVector = { x: 0, y: -1 };
  runtime.wristHistory = {};
  runtime.simFireQueued = false;
  runtime.simFireCharging = false;
  runtime.simFireChargeStartMs = 0;
  runtime.simFireReleasePending = false;
  _lecturasGameResetHands(runtime);
  runtime.handStartHoverSince = 0;
  runtime.handStartPending = false;
  runtime.handRetryHoverSince = 0;
  runtime.handRetryPending = false;
  runtime.handTraceResetPending = false;
  runtime.handMicPending = false;
  runtime.completionType = "";
  runtime.isChampion = false;
  runtime.championName = "";
  runtime.readingCampaign = {
    readingCursor: 0,
    totalReadingUnits: 0,
    consecutivePronunciationErrors: 0,
    idleSinceMs: 0,
    perfectRun: true,
    lastQuizCheckpoint: 0,
    pronouncedCorrectWords: 0,
    pronouncedWrongWords: 0
  };
  if (!skipResume) {
    _lecturasGameResumeNarration(runtime).finally(() => {
      if (runtime.token !== token + 1) return;
      _lecturasGameDispatchRoundEnded(closeReason);
    });
  } else if (closeReason !== "silent") {
    _lecturasGameDispatchRoundEnded(closeReason);
  }
  if (els.modeModal) {
    const panel = els.modeModal.querySelector(".lecturas-game-mode-panel");
    panel?.classList?.remove("is-game-active");
    els.modeModal.classList.remove("is-open");
    els.modeModal.setAttribute("aria-hidden", "true");
    document.documentElement.classList.remove("is-dedicated-game-mode");
    document.documentElement.classList.remove("is-game-modal-open");
  }
  if (els.modeModalBody) els.modeModalBody.innerHTML = "";
  if (typeof window.render_game_to_text !== "function" || String(window.render_game_to_text()).includes("\"mode\":\"closed\"") === false) {
    window.render_game_to_text = () => JSON.stringify({ mode: "closed" });
  }
  window.advanceTime = (ms = 16) => JSON.stringify({ mode: "closed", advancedMs: Number(ms || 0) });
}

function _lecturasGameReadAuthInput(id = "") {
  const el = document.getElementById(id);
  return String(el?.value || "").trim();
}

async function _lecturasGameTryLoginPlayerAction(target = "solo", runtime = lecturasGameModeRuntime, mode = "login") {
  const side = target === "left" || target === "right" ? target : "solo";
  const fullNameId = side === "right" ? "lecturasGameAuthFullNameRight" : "lecturasGameAuthFullNameLeft";
  const userId = side === "right" ? "lecturasGameAuthAliasRight" : "lecturasGameAuthAliasLeft";
  const fullName = _lecturasGameReadAuthInput(fullNameId);
  const username = _lecturasGameReadAuthInput(userId);
  const newKey = _lecturasGamePlayerDocId(username);
  if (!newKey) {
    runtime.offlinePack.error = "Alias de usuario inválido.";
    _lecturasGameRenderMenuStep(runtime);
    return;
  }
  if (mode === "create" && fullName.length < 4) {
    runtime.offlinePack.error = "Ingresa nombre completo (mínimo 4 caracteres).";
    _lecturasGameRenderMenuStep(runtime);
    return;
  }
  if (runtime.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR && (side === "left" || side === "right")) {
    const otherSide = side === "left" ? "right" : "left";
    const otherName = String(runtime?.playerAccounts?.[otherSide]?.alias || runtime?.playerAccounts?.[otherSide]?.username || "").trim();
    const otherKey = _lecturasGamePlayerDocId(otherName);
    if (otherKey && otherKey === newKey) {
      runtime.offlinePack.error = "Ese alias ya está en uso por el otro jugador.";
      _lecturasGameRenderMenuStep(runtime);
      return;
    }
  }
  const result = mode === "create"
    ? await _lecturasGameRegisterPlayer(fullName, username)
    : await _lecturasGameLoginPlayer(username);
  if (!result?.ok) {
    if (result?.error === "name_taken") runtime.offlinePack.error = "Ese alias ya existe.";
    else if (result?.error === "missing_full_name") runtime.offlinePack.error = "Debes indicar nombre completo.";
    else if (result?.error === "auth_required") runtime.offlinePack.error = "Necesitas iniciar sesión en la plataforma para guardar progreso.";
    else if (result?.error === "profile_missing") runtime.offlinePack.error = "No existe perfil cloud para tu cuenta. Crea usuario primero.";
    else if (result?.error === "register_failed") runtime.offlinePack.error = "No se pudo crear el usuario en Firebase.";
    else runtime.offlinePack.error = "Alias inválido o sesión no disponible.";
    _lecturasGameRenderMenuStep(runtime);
    return;
  }
  runtime.playerAccounts = runtime.playerAccounts || {};
  runtime.playerAccounts[side] = {
    username: String(result?.profile?.username || result?.profile?.alias || username),
    alias: String(result?.profile?.alias || result?.profile?.username || username),
    fullName: String(result?.profile?.fullName || fullName || ""),
    uidOwner: String(result?.profile?.uidOwner || _lecturasGameCurrentAuthUid() || ""),
    loggedIn: true,
    displayName: String(result?.profile?.displayName || result?.profile?.alias || result?.profile?.username || username),
    bestScore: Number(result?.profile?.bestScore || 0),
    totalScore: Number(result?.profile?.totalScore || 0),
    gems: Number(result?.profile?.gems || 0)
  };
  runtime.offlinePack.error = "";
  _lecturasGameRenderMenuStep(runtime);
}

async function _lecturasGameHandleUiAction(action = "") {
  const runtime = lecturasGameModeRuntime;
  const kind = String(action || "").trim();
  const forcedGameId = resolveForcedGameId(runtime?.forcedGameId || "");
  const gameLocked = !!forcedGameId;
  if (kind === "select-game-synonyms") {
    if (gameLocked && forcedGameId !== LECTURAS_GAME_IDS.SYNONYMS) return;
    await _lecturasGameNavigateToDedicatedPage(LECTURAS_GAME_IDS.SYNONYMS, runtime);
    return;
  }
  if (kind === "dismiss-tutorial") {
    runtime.synonymsTutorialSeen = true;
    if (runtime.ui && runtime.ui.tutorialModal) {
      runtime.ui.tutorialModal.hidden = true;
    }
    return;
  }
  if (kind === "select-game-order") {
    await _lecturasGameNavigateToDedicatedPage(LECTURAS_GAME_IDS.ORDER, runtime);
    return;
  }
  if (kind === "select-game-trace") {
    await _lecturasGameNavigateToDedicatedPage(LECTURAS_GAME_IDS.TRACE, runtime);
    return;
  }
  if (kind === "select-game-caps") {
    if (gameLocked && forcedGameId !== LECTURAS_GAME_IDS.CAPS) return;
    await _lecturasGameNavigateToDedicatedPage(LECTURAS_GAME_IDS.CAPS, runtime);
    return;
  }
  if (kind === "select-game-mineblox") {
    if (gameLocked && forcedGameId !== LECTURAS_GAME_IDS.MINEBLOX) return;
    await _lecturasGameNavigateToDedicatedPage(LECTURAS_GAME_IDS.MINEBLOX, runtime);
    return;
  }
  if (kind === "back-to-game-select") {
    if (gameLocked) {
      runtime.menuStep = "mode_select";
      runtime.mode = LECTURAS_GAME_MODE.MODE_SELECT;
      _lecturasGameRenderMenuStep(runtime);
      return;
    }
    runtime.menuStep = "game_select";
    runtime.mode = LECTURAS_GAME_MODE.GAME_SELECT;
    _lecturasGameRenderMenuStep(runtime);
    return;
  }
  if (kind === "select-mode-solo") {
    runtime.selectedPlayMode = LECTURAS_GAME_PLAY_MODE.SOLO;
    runtime.mode = LECTURAS_GAME_MODE.MODE_SELECT;
    _lecturasGameRenderMenuStep(runtime);
    return;
  }
  if (kind === "select-mode-pair") {
    runtime.selectedPlayMode = LECTURAS_GAME_PLAY_MODE.PAIR;
    runtime.mode = LECTURAS_GAME_MODE.MODE_SELECT;
    _lecturasGameRenderMenuStep(runtime);
    return;
  }
  if (kind === "select-order-difficulty-novice") {
    runtime.selectedOrderDifficulty = LECTURAS_GAME_ORDER_DIFFICULTY.NOVICE;
    runtime.mode = LECTURAS_GAME_MODE.MODE_SELECT;
    _lecturasGameRenderMenuStep(runtime);
    return;
  }
  if (kind === "select-order-difficulty-expert") {
    runtime.selectedOrderDifficulty = LECTURAS_GAME_ORDER_DIFFICULTY.EXPERT;
    runtime.mode = LECTURAS_GAME_MODE.MODE_SELECT;
    _lecturasGameRenderMenuStep(runtime);
    return;
  }
  if (kind === "login-player-solo") {
    await _lecturasGameTryLoginPlayerAction("solo", runtime, "login");
    return;
  }
  if (kind === "login-player-left") {
    await _lecturasGameTryLoginPlayerAction("left", runtime, "login");
    return;
  }
  if (kind === "login-player-right") {
    await _lecturasGameTryLoginPlayerAction("right", runtime, "login");
    return;
  }
  if (kind === "create-player-solo") {
    await _lecturasGameTryLoginPlayerAction("solo", runtime, "create");
    return;
  }
  if (kind === "create-player-left") {
    await _lecturasGameTryLoginPlayerAction("left", runtime, "create");
    return;
  }
  if (kind === "create-player-right") {
    await _lecturasGameTryLoginPlayerAction("right", runtime, "create");
    return;
  }
  if (kind === "logout-player-solo" || kind === "logout-player-left" || kind === "logout-player-right") {
    const side = kind.includes("right") ? "right" : (kind.includes("left") ? "left" : "solo");
    runtime.playerAccounts = runtime.playerAccounts || {};
    const defaults = side === "right"
      ? { username: "", alias: "", fullName: "", uidOwner: "", loggedIn: false, displayName: "Jugador B", bestScore: 0, totalScore: 0, gems: 0 }
      : side === "left"
        ? { username: "", alias: "", fullName: "", uidOwner: "", loggedIn: false, displayName: "Jugador A", bestScore: 0, totalScore: 0, gems: 0 }
        : { username: "", alias: "", fullName: "", uidOwner: "", loggedIn: false, displayName: "Invitado", bestScore: 0, totalScore: 0, gems: 0 };
    runtime.playerAccounts[side] = defaults;
    runtime.offlinePack.error = "";
    _lecturasGameRenderMenuStep(runtime);
    return;
  }
  if (kind === "start-selected-mode" || kind === "start-new-game") {
    console.log("[DEBUG] start-selected-mode clicked", { selectedGameId: runtime?.selectedGameId, challengeType: runtime?.challengeType, selectedPlayMode: runtime?.selectedPlayMode });
    if (_lecturasGameNormalizeGameId(runtime?.selectedGameId || runtime?.challengeType || "") === LECTURAS_GAME_IDS.TRACE) {
      await _lecturasGameNavigateToDedicatedPage(LECTURAS_GAME_IDS.TRACE, runtime, { reload: true });
      return;
    }
    if (_lecturasGameNormalizeGameId(runtime?.selectedGameId || runtime?.challengeType || "") === LECTURAS_GAME_IDS.CAPS) {
      await _lecturasGameNavigateToDedicatedPage(LECTURAS_GAME_IDS.CAPS, runtime, { reload: true });
      return;
    }
    await _lecturasGameStartSelectedGame({ continueFromCheckpoint: false });
    return;
  }
  if (kind === "continue-game") {
    runtime.selectedPlayMode = LECTURAS_GAME_PLAY_MODE.SOLO;
    runtime.selectedGameId = forcedGameId || _lecturasGameNormalizeGameId(runtime?.checkpoint?.challengeType || runtime.selectedGameId || runtime.challengeType || "");
    runtime.challengeType = runtime.selectedGameId;
    if (_lecturasGameNormalizeGameId(runtime.selectedGameId) === LECTURAS_GAME_IDS.TRACE) {
      await _lecturasGameNavigateToDedicatedPage(LECTURAS_GAME_IDS.TRACE, runtime, { reload: true });
      return;
    }
    if (_lecturasGameNormalizeGameId(runtime.selectedGameId) === LECTURAS_GAME_IDS.CAPS) {
      await _lecturasGameNavigateToDedicatedPage(LECTURAS_GAME_IDS.CAPS, runtime, { reload: true });
      return;
    }
    await _lecturasGameStartSelectedGame({ continueFromCheckpoint: true });
    return;
  }
  if (kind === "download-game-offline") {
    try {
      await _lecturasGameDownloadOfflinePack(runtime);
    } catch (err) {
      runtime.offlinePack = {
        ...(runtime.offlinePack || {}),
        status: "error",
        progress: 0,
        error: String(err?.message || err || "offline_download_failed")
      };
      _lecturasGameRenderMenuStep(runtime);
    }
    return;
  }
  if (kind === "show-how-to-play") {
    const modal = document.getElementById("lecturasGameHowToModal");
    if (modal) modal.hidden = false;
    return;
  }
  if (kind === "close-how-to-play") {
    const modal = document.getElementById("lecturasGameHowToModal");
    if (modal) modal.hidden = true;
    return;
  }
  if (kind === "toggle-fullscreen") {
    _lecturasGameToggleFullscreen();
    return;
  }
  if (kind === "open-ranking") {
    await _lecturasGameOpenRankingShortcut(runtime);
    return;
  }
  if (kind === "trace-reset") {
    if (_lecturasGameResetTraceProgress(runtime)) {
      _lecturasGamePlayTone(740, 70, "triangle", 0.06);
      _lecturasGameSetMode(runtime.mode);
    }
    return;
  }
  if (!runtime.active) return;
  if (kind === "start-round") {
    if (_lecturasGameIsOrderChallenge(runtime) && runtime?.orderDemo?.playing === true) return;
    _lecturasGamePlayRocketStartFx(runtime);
    if (_lecturasGameIsOrderChallenge(runtime)) {
      _lecturasGameStartOrderDemoPlayback(runtime);
      return;
    }
    const isMineblox = _lecturasGameIsMinebloxChallenge(runtime);
    const requiresCameraAtStart = !isMineblox;
    if (requiresCameraAtStart && !runtime.cameraReady) {
      await _lecturasGameStartCamera(runtime);
      if (!runtime.cameraReady) {
        _lecturasGameSetMode(LECTURAS_GAME_MODE.INSTRUCTION);
        return;
      }
    }
    if (isMineblox && !runtime.cameraReady) {
       // Just set ready so we can proceed
       runtime.cameraReady = true;
    }
    if (!runtime.round) {
  const ok = _lecturasGamePrepareChallenge(runtime, runtime.challengeType || runtime.selectedGameId || LECTURAS_GAME_IDS.SYNONYMS);
  console.log("[DEBUG] _lecturasGamePrepareChallenge result:", ok, { challengeType: runtime.challengeType, selectedGameId: runtime.selectedGameId, hasRound: !!runtime.round });
  if (!ok) {
    console.warn("[DEBUG] _lecturasGamePrepareChallenge returned false - not enough words in reading!");
        runtime.progress.rewardMessage = "No se pudo preparar el nivel con el contenido de la lectura.";
        _lecturasGameSetMode(LECTURAS_GAME_MODE.LOST);
        return;
      }
    }
    _lecturasGameResetRuntimeRound(runtime);
    if (_lecturasGameIsOrderChallenge(runtime)) {
      _lecturasGameBroadcastGlobalMicRelease("order-round-start");
      runtime.orderVoice.supported = !!_lecturasGameGetSpeechRecognitionCtor();
      runtime.orderVoice.state = LECTURAS_GAME_ORDER_VOICE_STATE.COUNTDOWN;
      runtime.orderVoice.lastTransition = "ORDER_COUNTDOWN_START";
      runtime.orderVoice.lastTransitionAt = Number(performance.now() || Date.now());
      runtime.orderVoice.nextAutoStartAt = 0;
      _lecturasGameResetOrderSpeechRetryState(runtime);
      runtime.orderVoice.state = LECTURAS_GAME_ORDER_VOICE_STATE.COUNTDOWN;
      runtime.orderVoice.lastTransition = "ORDER_COUNTDOWN_START";
      runtime.orderVoice.lastTransitionAt = Number(performance.now() || Date.now());
    }
    _lecturasGameSetMode(LECTURAS_GAME_MODE.COUNTDOWN);
    await _lecturasGamePrepareCountdownAudio(runtime);
    return;
  }
  if (kind === "play-order-demo") {
    if (_lecturasGameIsOrderChallenge(runtime)) _lecturasGameStartOrderDemoPlayback(runtime);
    return;
  }
  if (kind === "order-prev-phrase") {
    if (_lecturasGameIsOrderChallenge(runtime)) _lecturasGameNavigateOrderPhrase(-1, runtime);
    return;
  }
  if (kind === "order-next-phrase") {
    if (_lecturasGameIsOrderChallenge(runtime)) _lecturasGameNavigateOrderPhrase(1, runtime);
    return;
  }
  if (kind === "start-mic-read") {
    if (_lecturasGameIsOrderChallenge(runtime)) {
      const state = String(runtime?.orderVoice?.state || "");
      const allowed = state === LECTURAS_GAME_ORDER_VOICE_STATE.READY_TO_LISTEN
        || state === LECTURAS_GAME_ORDER_VOICE_STATE.MIC_MANUAL_RETRY;
      if (!allowed) return;
      _lecturasGamePlayRocketStartFx(runtime);
      runtime.orderVoice.manualRetryRequired = false;
      runtime.orderVoice.state = LECTURAS_GAME_ORDER_VOICE_STATE.ARMING_MIC;
      runtime.orderVoice.lastTransition = "ORDER_MIC_ARMING";
      runtime.orderVoice.lastTransitionAt = Number(performance.now() || Date.now());
      runtime.orderVoice.nextAutoStartAt = 0;
      await _lecturasGameStartOrderSpeech(runtime, { manual: true });
      _lecturasGameRenderOrderPhraseUi(runtime);
    }
    return;
  }
  if (kind === "retry-round") {
    _lecturasGamePlayRocketStartFx(runtime);
    _lecturasGameClearAutoNext(runtime);
    _lecturasGameResetForRetry();
    return;
  }
  if (kind === "quiz-option-a" || kind === "quiz-option-b") {
    if (runtime.mode !== LECTURAS_GAME_MODE.QUIZ || !runtime.quiz) return;
    const idx = kind === "quiz-option-a" ? 0 : 1;
    if (idx === Number(runtime.quiz.correctIndex || 0)) {
      runtime.progress.rewardMessage = "Respuesta correcta.";
      _lecturasGameContinueAfterQuizSuccess(runtime);
    } else {
      _lecturasGameApplyScoreDelta(-15, runtime);
      runtime.progress.rewardMessage = "Respuesta incorrecta. Intenta otra vez.";
      _lecturasGamePlayLoseSound();
      _lecturasGameSetMode(LECTURAS_GAME_MODE.QUIZ);
    }
    return;
  }
  if (kind === "quiz-skip") {
    if (runtime.mode !== LECTURAS_GAME_MODE.QUIZ) return;
    if (_lecturasGameIsOrderChallenge(runtime)) return;
    const gems = Number(runtime.progress?.gems || 0);
    if (gems < LECTURAS_GAME_SKIP_QUIZ_GEMS_COST) {
      runtime.progress.rewardMessage = "No tienes gemas suficientes.";
      _lecturasGameSetMode(LECTURAS_GAME_MODE.QUIZ);
      return;
    }
    runtime.progress.gems = gems - LECTURAS_GAME_SKIP_QUIZ_GEMS_COST;
    runtime.progress.rewardMessage = "Pregunta saltada con gemas.";
    _lecturasGameContinueAfterQuizSuccess(runtime);
    return;
  }
  if (kind === "next-level") {
    _lecturasGameClearAutoNext(runtime);
    _lecturasGameStopGameMusic(runtime, "next-level");
    _lecturasGameStartLevelTransitionFx(runtime, { force: true, amplitude: 24, durationMs: 840 });
    const ok = _lecturasGamePrepareChallenge(runtime, runtime.challengeType || runtime.selectedGameId || LECTURAS_GAME_IDS.SYNONYMS);
    if (!ok) {
      runtime.progress.rewardMessage = "No hay suficientes datos para continuar el juego.";
      _lecturasGameSetMode(LECTURAS_GAME_MODE.LOST);
      return;
    }
    runtime.plannedNextChallenge = null;
    _lecturasGameSetMode(LECTURAS_GAME_MODE.INSTRUCTION);
    return;
  }
  if (kind === "continue-reading") {
    if (_lecturasGameIsOrderChallenge(runtime)
      && runtime.mode === LECTURAS_GAME_MODE.LOST
      && !!runtime.round
      && String(runtime?.completionType || "") === "lost_by_errors") {
      const cost = LECTURAS_GAME_CONTINUE_PARTIDA_GEMS_COST;
      const gems = Math.max(0, Number(runtime?.progress?.gems || 0));
      if (gems < cost) {
        runtime.progress.rewardMessage = `Necesitas ${cost} gema para continuar la partida.`;
        _lecturasGameSetMode(LECTURAS_GAME_MODE.LOST);
        return;
      }
      runtime.progress.gems = gems - cost;
      const campaign = runtime.readingCampaign || (runtime.readingCampaign = {});
      campaign.consecutivePronunciationErrors = 0;
      campaign.idleSinceMs = Number(performance.now() || Date.now());
      runtime.touchedCorrect = false;
      runtime.completionType = "";
      runtime.round.orderTrapActive = false;
      runtime.round.orderLastReadResult = "";
      _lecturasGameStopOrderSpeech(runtime, { restoreAudio: false });
      const ok = _lecturasGameApplyOrderStageWords(runtime);
      if (!ok) {
        runtime.progress.rewardMessage = "No se pudo reiniciar la frase actual.";
        _lecturasGameSetMode(LECTURAS_GAME_MODE.LOST);
        return;
      }
      runtime.progress.rewardMessage = `Frase reiniciada. -${cost} gema.`;
      _lecturasGameSetMode(LECTURAS_GAME_MODE.PLAYING);
      _lecturasGameStartOrderReadFlow(runtime);
      return;
    }
    const finalMode = runtime.mode;
    const reason = finalMode === LECTURAS_GAME_MODE.WON ? "won" : "lost";
    _lecturasGameSetMode(LECTURAS_GAME_MODE.RESUME_READING);
    closeGameModePlaceholder({ skipResume: false, reason });
    return;
  }
  if (kind === "finalize-match") {
    if (!(runtime.mode === LECTURAS_GAME_MODE.WON || runtime.mode === LECTURAS_GAME_MODE.LOST)) return;
    await _lecturasGameFinalizeMatch(runtime);
  }
}

async function _lecturasGamePrepareGameBackgrounds(runtime = lecturasGameModeRuntime) {
  const candidates = _lecturasGameExtractMenuBackgroundCandidates(runtime.lectura);
  const resolved = [];
  for (const candidate of candidates) {
    try {
      const url = await resolveCoverUrlForDisplay(candidate);
      if (!url) continue;
      if (resolved.includes(url)) continue;
      resolved.push(url);
      if (resolved.length >= 8) break;
    } catch (_) {
      // continue
    }
  }
  runtime.gameBackgroundUrls = resolved.length
    ? resolved
    : [];
}

function _lecturasGameSetBackgroundImage(url = "", runtime = lecturasGameModeRuntime, options = {}) {
  const nextUrl = String(url || "").trim();
  const forceTransition = options?.forceTransition === true;
  const prevUrl = String(runtime.gameBackgroundUrl || "").trim();
  const prevImg = runtime.gameBackgroundImageReady ? runtime.gameBackgroundImage : null;
  let prevSnapshot = null;
  if (!prevImg && runtime.canvasEl) {
    try {
      const sw = Math.max(2, Number(runtime.viewWidth || runtime.canvasEl.width || 960));
      const sh = Math.max(2, Number(runtime.viewHeight || runtime.canvasEl.height || 540));
      const snap = document.createElement("canvas");
      snap.width = Math.round(sw);
      snap.height = Math.round(sh);
      const sctx = snap.getContext("2d");
      if (sctx) {
        sctx.drawImage(runtime.canvasEl, 0, 0, snap.width, snap.height);
        prevSnapshot = snap;
      }
    } catch (_) {
      prevSnapshot = null;
    }
  }
  runtime.gameBackgroundUrl = nextUrl;
  runtime.gameBackgroundImage = null;
  runtime.gameBackgroundImageReady = false;
  runtime.backgroundTransition = null;
  if (!nextUrl) return;
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    if (runtime.gameBackgroundUrl !== nextUrl) return;
    const previousVisual = prevImg || prevSnapshot;
    const shouldAnimate = !!previousVisual && (!!prevUrl || !!prevSnapshot) && (forceTransition || prevUrl !== nextUrl);
    runtime.gameBackgroundImage = img;
    runtime.gameBackgroundImageReady = true;
    if (shouldAnimate) {
      _lecturasGameStartBackgroundTransition(previousVisual, img, runtime);
    }
  };
  img.onerror = () => {
    if (runtime.gameBackgroundUrl !== nextUrl) return;
    runtime.gameBackgroundImage = null;
    runtime.gameBackgroundImageReady = false;
  };
  img.src = nextUrl;
}

function _lecturasGamePickGameBackground(runtime = lecturasGameModeRuntime, options = {}) {
  const list = Array.isArray(runtime.gameBackgroundUrls) ? runtime.gameBackgroundUrls.filter(Boolean) : [];
  if (!list.length) {
    _lecturasGameSetBackgroundImage("", runtime, options);
    return;
  }
  const current = String(runtime.gameBackgroundUrl || "").trim();
  const last = String(runtime.gameBackgroundLastUrl || "").trim();
  let pool = list;
  if (list.length > 1) {
    const filtered = list.filter((url) => {
      const clean = String(url || "").trim();
      if (!clean) return false;
      if (current && clean === current) return false;
      if (last && clean === last) return false;
      return true;
    });
    if (filtered.length) pool = filtered;
  }
  const next = pool[Math.floor(Math.random() * pool.length)] || list[0] || "";
  runtime.gameBackgroundLastUrl = next;
  _lecturasGameSetBackgroundImage(next, runtime, options);
}

function _lecturasGameClearAutoNext(runtime = lecturasGameModeRuntime) {
  if (runtime.autoNextTimerId) {
    clearTimeout(runtime.autoNextTimerId);
    runtime.autoNextTimerId = 0;
  }
}

function _lecturasGameScheduleAutoNextLevel(runtime = lecturasGameModeRuntime) {
  _lecturasGameClearAutoNext(runtime);
  runtime.autoNextTimerId = setTimeout(() => {
    runtime.autoNextTimerId = 0;
    if (runtime.mode !== LECTURAS_GAME_MODE.WON || !runtime.active) return;
    _lecturasGameStartLevelTransitionFx(runtime, { force: true, amplitude: 24, durationMs: 840 });
    const ok = _lecturasGamePrepareChallenge(runtime, runtime.challengeType || runtime.selectedGameId || LECTURAS_GAME_IDS.SYNONYMS);
    if (!ok) {
      runtime.progress.rewardMessage = "No hay suficientes datos para continuar el juego.";
      _lecturasGameSetMode(LECTURAS_GAME_MODE.LOST);
      return;
    }
    runtime.plannedNextChallenge = null;
    runtime.countdownMs = 3000;
    _lecturasGameSetMode(LECTURAS_GAME_MODE.COUNTDOWN);
    Promise.resolve(_lecturasGamePrepareCountdownAudio(runtime)).catch(() => { });
  }, 680);
}

function _lecturasGameForceWinForDebug(runtime = lecturasGameModeRuntime) {
  if (!runtime?.active) return false;
  runtime.removedWrongCount = Math.max(runtime.removedWrongCount, runtime.totalWrongCount);
  runtime.progress.rewardMessage = "Ronda limpia. Responde la prueba para subir de nivel.";
  runtime.quiz = _lecturasGameBuildLevelQuiz(runtime);
  runtime.quizPendingAfterWin = true;
  _lecturasGameSetMode(LECTURAS_GAME_MODE.QUIZ);
  return true;
}

function _lecturasGameToggleFullscreen() {
  if (!els.modeModal?.classList?.contains("is-open")) return;
  const panel = els.modeModal.querySelector(".lecturas-game-mode-panel");
  if (!panel) return;
  if (document.fullscreenElement === panel) {
    document.exitFullscreen?.().catch(() => { });
  } else if (!document.fullscreenElement) {
    panel.requestFullscreen?.().catch(() => { });
  }
}

function _lecturasGameSyncFullscreenButton(runtime = lecturasGameModeRuntime) {
  const btns = Array.from(document.querySelectorAll("#lecturasGameFullscreenBtn, #lecturasGameFullscreenBtnPair"));
  if (!btns.length) return;
  const panel = els.modeModal?.querySelector?.(".lecturas-game-mode-panel");
  const isFullscreen = !!panel && document.fullscreenElement === panel;
  const label = isFullscreen ? "Salir pantalla completa" : "Pantalla completa";
  btns.forEach((btn) => {
    btn.textContent = label;
    btn.setAttribute("aria-label", label);
  });
}

function toReaderPayload(lectura = {}) {
  const raw = lectura?.raw || {};
  return {
    id: lectura.id,
    coleccion: lectura.sourceCollection,
    sourceCollection: lectura.sourceCollection,
    titulo: lectura.titulo,
    userId: String(lectura.userId || raw.userId || raw.uid || raw.ownerId || "").trim(),
    uid: String(lectura.uid || raw.uid || raw.userId || raw.ownerId || "").trim(),
    ownerId: String(lectura.ownerId || raw.ownerId || raw.userId || raw.uid || "").trim(),
    ownerUid: String(lectura.ownerUid || raw.ownerUid || raw.ownerId || raw.userId || raw.uid || "").trim(),
    htmlLectura: lectura.htmlLectura,
    preguntas: Array.isArray(lectura.preguntas) ? lectura.preguntas : [],
    bibliografia: lectura.bibliografia || "",
    sinonimos: lectura.sinonimos || "",
    metadatos: {
      nivel: lectura.nivel || "",
      grado: lectura.grado || "",
      trimestre: lectura.trimestre || "",
      unidad: lectura.unidad || ""
    }
  };
}

async function _lecturasGameBuildTraceReadingPayload(runtime = lecturasGameModeRuntime) {
  const lectura = runtime?.lectura || null;
  if (!lectura) return null;
  const raw = lectura?.raw || {};
  const resolvedMusicAssets = (lectura?.musicAssets && typeof lectura.musicAssets === "object")
    ? lectura.musicAssets
    : resolveLecturaMusicAssets(raw);
  let coverImage = "";
  try {
    const coverRef = resolveLecturaCoverImage(lectura);
    coverImage = await resolveCoverUrlForDisplay(coverRef || "");
  } catch (_) {
    coverImage = "";
  }
  return {
    id: String(lectura?.id || "").trim(),
    titulo: String(lectura?.titulo || raw?.titulo || "Lectura").trim() || "Lectura",
    grado: String(lectura?.grado || raw?.grado || "").trim(),
    sourceCollection: String(lectura?.sourceCollection || lectura?.coleccion || raw?.coleccion || "").trim(),
    htmlLectura: String(
      lectura?.htmlLectura
      || raw?.contenidoHTML
      || raw?.textoLectura
      || raw?.contenidoCompleto
      || raw?.lectura
      || raw?.contenido
      || raw?.texto
      || ""
    ),
    musicAssets: resolvedMusicAssets,
    coverImage: String(coverImage || "").trim(),
    imagenUrl: String(coverImage || lectura?.imagenUrl || raw?.imagenUrl || "").trim()
  };
}

function openReaderMode(lectura = null) {
  if (!lectura) return;
  const key = lecturaKey(lectura);
  if (navigator.onLine === false && !_lecturasGameIsOfflineCardAvailable(key, lectura)) {
    alert("Esta lectura no está disponible offline. Descárgala primero cuando estés en línea.");
    return;
  }
  _lecturasGameTouchOfflineCard(key);
  if (typeof window.cbOpenLecturasAgentViewer !== "function") {
    alert("El modo lectura no está disponible en este momento.");
    return;
  }
  window.cbOpenLecturasAgentViewer(toReaderPayload(lectura));
}

async function _lecturasGameResolveCapsBackgroundUrl(runtime = lecturasGameModeRuntime) {
  const lectura = runtime?.lectura || null;
  const candidates = [];
  const seen = new Set();
  const push = (value = "") => {
    const clean = sanitizeImageCandidate(value);
    if (!clean || seen.has(clean)) return;
    seen.add(clean);
    candidates.push(clean);
  };
  push(resolveLecturaCoverImage(lectura || {}));
  (Array.isArray(runtime?.gameBackgroundUrls) ? runtime.gameBackgroundUrls : []).forEach((item) => push(item));
  push(runtime?.gameBackgroundUrl || "");
  _lecturasGameExtractMenuBackgroundCandidates(lectura).forEach((item) => push(item));
  for (const candidate of candidates) {
    try {
      const url = await resolveCoverUrlForDisplay(candidate);
      if (!url) continue;
      if (isDirectRenderableImageUrl(url) || /^(https?:|data:|blob:|\/)/i.test(url)) return String(url).trim();
    } catch (_) {
      // try next
    }
  }
  return "";
}

async function _lecturasGameNavigateToDedicatedPage(gameId = "", runtime = lecturasGameModeRuntime, options = {}) {
  const id = _lecturasGameNormalizeGameId(gameId);
  const forcedGameId = resolveForcedGameId(runtime?.forcedGameId || "");
  const shouldReload = true; // Force reload to ensure different entry points are used
  if (forcedGameId && forcedGameId !== id) return;

  runtime.selectedGameId = id;
  runtime.challengeType = id;
  runtime.menuStep = "mode_select";
  runtime.mode = LECTURAS_GAME_MODE.MODE_SELECT;
  runtime.autoStartInDebug = false;

  try {
    const params = new URLSearchParams(window.location.search || "");
    const grade = String(runtime?.lectura?.grado || params.get("grade") || "1").trim() || "1";
    params.set("grade", grade);
    params.set("game", id);
    if (runtime?.lectura?.id) params.set("readingId", String(runtime.lectura.id));
    if (runtime?.lectura?.sourceCollection) params.set("collection", String(runtime.lectura.sourceCollection));
    if (id === LECTURAS_GAME_IDS.CAPS) {
      const pm = runtime?.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR ? "pair" : "solo";
      console.log("[DEBUG] Setting CAPS playMode in URL:", pm);
      params.set("playMode", pm);
    }
    if (id === LECTURAS_GAME_IDS.TRACE) {
      const isCouple = runtime?.selectedPlayMode === LECTURAS_GAME_PLAY_MODE.PAIR;
      params.set("couple", isCouple ? "1" : "0");
    }
    if (id === LECTURAS_GAME_IDS.CAPS) {
      const bgCandidate = await _lecturasGameResolveCapsBackgroundUrl(runtime);
      if (bgCandidate) params.set("bg", bgCandidate);
      else params.delete("bg");
    }
    if (id === LECTURAS_GAME_IDS.TRACE) {
      const tracePayload = await _lecturasGameBuildTraceReadingPayload(runtime);
      if (tracePayload) {
        try {
          sessionStorage.setItem(LECTURAS_TRACE_ACTIVE_READING_KEY, JSON.stringify(tracePayload));
        } catch (_) {
          // no-op
        }
        try {
          localStorage.setItem(LECTURAS_TRACE_ACTIVE_READING_KEY, JSON.stringify(tracePayload));
        } catch (_) {
          // no-op
        }
        try {
          window.__LECTURAS_GAME_ACTIVE_READING__ = tracePayload;
        } catch (_) {
          // no-op
        }
        if (tracePayload.id) params.set("readingId", tracePayload.id);
        if (tracePayload.titulo) params.set("readingTitle", tracePayload.titulo.slice(0, 120));
        if (tracePayload.imagenUrl) params.set("readingImage", tracePayload.imagenUrl);
        const traceMusic = (tracePayload.musicAssets && typeof tracePayload.musicAssets === "object") ? tracePayload.musicAssets : {};
        if (traceMusic.gameUrl) params.set("musicGameUrl", String(traceMusic.gameUrl));
        if (traceMusic.gamePath) params.set("musicGamePath", String(traceMusic.gamePath));
        if (traceMusic.readingUrl) params.set("musicReadingUrl", String(traceMusic.readingUrl));
        if (traceMusic.readingPath) params.set("musicReadingPath", String(traceMusic.readingPath));
      }
    }
    params.delete("autoStart");
    const query = params.toString();
    const hash = String(window.location.hash || "");
    const next = `${window.location.pathname}${query ? `?${query}` : ""}${hash}`;
    if (shouldReload) {
      window.location.assign(next);
      return;
    }
    window.history.replaceState({}, "", next);
  } catch (_) {
    // noop
  }

  if (!shouldReload) _lecturasGameRenderMenuStep(runtime);
}

function bindMainUiEvents() {
  els.lecturaCards?.addEventListener("click", (event) => {
    const btn = event.target?.closest?.("button[data-action][data-key]");
    if (!btn) return;
    const key = String(btn.dataset.key || "").trim();
    if (!key) return;
    const lectura = state.lecturaByKey.get(key) || null;
    if (!lectura) return;
    const offlineReady = _lecturasGameIsOfflineCardAvailable(key, lectura);
    const action = String(btn.dataset.action || "").trim();
    const downloadState = _lecturasGameDownloadStatusForKey(key);
    const isDownloadedAnyState = downloadState.status === "downloaded" || !!_lecturasGameGetOfflineMetaForKey(key)?.offlineReady;
    if (navigator.onLine === false && !["download-full-content", "remove-offline-content"].includes(action) && !offlineReady) {
      if (els.lecturaEmpty) {
        els.lecturaEmpty.hidden = false;
        els.lecturaEmpty.textContent = "Esa card no está descargada. Conéctate y descárgala para usarla offline.";
      }
      return;
    }

    if (btn.dataset.action === "read") {
      _lecturasGameTouchOfflineCard(key);
      openReaderMode(lectura);
      return;
    }
    if (btn.dataset.action === "game") {
      _lecturasGameTouchOfflineCard(key);
      openGameModePlaceholder(lectura, { forceGameSelect: true }).catch(() => { });
      return;
    }
    if (action === "download-full-content") {
      _lecturasGameDownloadAllContentForLectura(lectura).catch((err) => {
        const k = _lecturasGameOfflineKeyFromLectura(lectura);
        state.downloadStatusByKey.set(k, {
          status: "error",
          progress: 0,
          error: String(err?.message || err || "offline_download_failed")
        });
        renderScenes();
      });
      return;
    }
    if (action === "remove-offline-content") {
      if (!isDownloadedAnyState) return;
      _lecturasGameRemoveOfflineCard(key).then(() => {
        renderScenes();
      }).catch(() => {
        state.downloadStatusByKey.set(key, { status: "error", progress: 0, error: "offline_remove_failed" });
        renderScenes();
      });
    }
  });

  els.modeModal?.addEventListener("click", (event) => {
    const gameActionBtn = event.target?.closest?.("#lecturasGameModeBody [data-action]");
    console.log("[DEBUG] Modal click", { target: event.target, gameActionBtn: !!gameActionBtn, action: gameActionBtn?.dataset?.action });
    if (gameActionBtn) {
      const action = String(gameActionBtn.dataset.action || "").trim();
      if (action && action !== "close-game-mode") {
        event.preventDefault();
        _lecturasGameHandleUiAction(action).catch(() => { });
        return;
      }
    }
    const closeBtn = event.target?.closest?.("[data-action='close-game-mode']");
    if (closeBtn) closeGameModePlaceholder();
  });

  document.addEventListener("keydown", (event) => {
    if (els.modeModal?.classList.contains("is-open")) {
      const key = String(event.key || "").toLowerCase();
      if (key === "arrowleft" || key === "a") lecturasGameModeRuntime.inputKeys.left = true;
      if (key === "arrowright" || key === "d") lecturasGameModeRuntime.inputKeys.right = true;
      if (key === "arrowup" || key === "w") lecturasGameModeRuntime.inputKeys.up = true;
      if (key === "arrowdown" || key === "s") lecturasGameModeRuntime.inputKeys.down = true;
      if (key === " " || key === "space" || key === "spacebar") {
        event.preventDefault();
        if (!lecturasGameModeRuntime.simFireCharging) {
          lecturasGameModeRuntime.simFireCharging = true;
          lecturasGameModeRuntime.simFireChargeStartMs = performance.now();
        }
      }
    }
    if (!els.modeModal?.classList.contains("is-open")) return;
    if (event.key === "f" || event.key === "F") {
      event.preventDefault();
      _lecturasGameToggleFullscreen();
      return;
    }
    if (event.key !== "Escape") return;
    if (document.fullscreenElement && els.modeModal.contains(document.fullscreenElement)) return;
    closeGameModePlaceholder();
  });
  document.addEventListener("keyup", (event) => {
    if (!els.modeModal?.classList.contains("is-open")) return;
    const key = String(event.key || "").toLowerCase();
    if (key === "arrowleft" || key === "a") lecturasGameModeRuntime.inputKeys.left = false;
    if (key === "arrowright" || key === "d") lecturasGameModeRuntime.inputKeys.right = false;
    if (key === "arrowup" || key === "w") lecturasGameModeRuntime.inputKeys.up = false;
    if (key === "arrowdown" || key === "s") lecturasGameModeRuntime.inputKeys.down = false;
    if (key === " " || key === "space" || key === "spacebar") {
      if (lecturasGameModeRuntime.simFireCharging) {
        lecturasGameModeRuntime.simFireCharging = false;
        lecturasGameModeRuntime.simFireReleasePending = true;
      }
    }
  });

  window.addEventListener("resize", () => {
    if (!lecturasGameModeRuntime.active) return;
    _lecturasGameResizeCanvas();
  });
  document.addEventListener("fullscreenchange", () => {
    if (!lecturasGameModeRuntime.active) return;
    _lecturasGameSyncFullscreenButton(lecturasGameModeRuntime);
    setTimeout(() => _lecturasGameResizeCanvas(), 120);
  });
  window.addEventListener("online", () => {
    _lecturasGameFlushQueuedScores().catch(() => { });
  });
}

/* ===== APIs Live (copiadas para funcionar dentro de lecturasGame.js) ===== */
const CHARLY_LECTURA_LIVE_STATE_EVENT = "cb:lectura-live-state";
const GEMINI_LIVE_MODEL_DEFAULT = "gemini-2.5-flash-native-audio-preview-12-2025";
const GEMINI_LIVE_VOICE_DEFAULT = "Charon";

let googleGenAiLiveModule = null;
let geminiLiveSessionUnidad = null;
let geminiLiveConnectPromise = null;
let geminiLiveIsOpen = false;
let geminiLiveSessionClosing = false;
let geminiLiveAudioCtx = null;
let geminiLivePlayAt = 0;
let geminiLiveActivePcmSources = new Set();
let geminiLiveSessionEpoch = 0;

const liveReaderState = {
  ref: null,
  state: "idle", // idle | starting | playing | paused
  startPromise: null,
  plan: null // { mode, chunks, index, token, waitingTurn, turnToken, chunkHadAudio, turnCompleteReceived, title }
};

const liveAgentSpeechState = {
  token: 0,
  active: false,
  safetyTimer: null,
  onEnd: null,
  onError: null
};

function normalizeLiveRef(ref = {}) {
  const id = String(ref?.id || "").trim();
  const coleccion = String(ref?.coleccion || ref?.sourceCollection || "").trim();
  if (!id || !coleccion) return null;
  return { id, coleccion };
}

function sameLiveRef(a = null, b = null) {
  return !!(
    a?.id
    && a?.coleccion
    && b?.id
    && b?.coleccion
    && String(a.id) === String(b.id)
    && String(a.coleccion) === String(b.coleccion)
  );
}

function emitLecturaLiveState(ref = null) {
  try {
    const liveRef = ref ? normalizeLiveRef(ref) : liveReaderState.ref;
    window.dispatchEvent(new CustomEvent(CHARLY_LECTURA_LIVE_STATE_EVENT, {
      detail: {
        ref: liveRef ? { ...liveRef } : null,
        state: String(liveReaderState.state || "idle")
      }
    }));
  } catch (_) {
    // noop
  }
}

function htmlToPlainText(html = "") {
  const wrap = document.createElement("div");
  wrap.innerHTML = String(html || "");
  wrap.querySelectorAll("script, style, iframe, object, embed").forEach((n) => n.remove());
  return String(wrap.textContent || "").replace(/\s+/g, " ").trim();
}

function _splitLongParagraphForLive(paragraph = "", maxLen = 980) {
  const clean = String(paragraph || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= maxLen) return [clean];
  const sentences = clean.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean);
  if (!sentences.length) return [clean.slice(0, maxLen)];
  const chunks = [];
  let current = "";
  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence}` : sentence;
    if (next.length > maxLen && current.trim()) {
      chunks.push(current);
      current = sentence;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks.filter(Boolean);
}

function _extractParagraphsFromHtmlForLive(html = "") {
  const wrap = document.createElement("div");
  wrap.innerHTML = String(html || "");
  wrap.querySelectorAll("script, style, iframe, object, embed").forEach((n) => n.remove());
  const out = [];

  const skipHeading = (text = "") => /^(preguntas?(?: de)?(?: comprension)?|cuestionario|actividades?(?: de)?(?: comprension)?|bibliografia|fuentes consultadas|referencias(?: bibliograficas)?|tabla de sinonimos|sinonimos|glosario|vocabulario)$/i
    .test(String(text || "").replace(/\s+/g, " ").trim());

  const blocks = Array.from(wrap.querySelectorAll("p, li, blockquote, h2, h3, h4"));
  blocks.forEach((node) => {
    const text = String(node.textContent || "").replace(/\s+/g, " ").trim();
    if (!text) return;
    if (skipHeading(text) && text.length <= 180) return;
    out.push(text);
  });

  if (out.length) return out;

  const plain = String(wrap.textContent || "").replace(/\r/g, "").trim();
  if (!plain) return [];
  return plain
    .split(/\n{2,}|(?<=[.!?…])\s+(?=[A-ZÁÉÍÓÚÑ])/)
    .map((chunk) => String(chunk || "").replace(/\s+/g, " ").trim())
    .filter((chunk) => chunk.length > 8);
}

function _trocearLecturaParaLive(paragraphs = [], maxLen = 980) {
  const items = Array.isArray(paragraphs) ? paragraphs : [];
  const chunks = [];
  items.forEach((paragraph) => {
    _splitLongParagraphForLive(paragraph, maxLen).forEach((part) => {
      const clean = String(part || "").trim();
      if (clean) chunks.push(clean);
    });
  });
  return chunks;
}

function _acelerarPrimerBloqueLectura(chunks = []) {
  const items = Array.isArray(chunks) ? chunks.filter(Boolean) : [];
  if (!items.length) return [];
  const first = String(items[0] || "").trim();
  if (!first || first.length <= 420) return items;
  const sentences = first.split(/(?<=[.!?…])\s+/).filter(Boolean);
  if (sentences.length < 2) return items;
  let primerBloque = "";
  let idxCorte = 0;
  for (let i = 0; i < sentences.length; i += 1) {
    const next = primerBloque ? `${primerBloque} ${sentences[i]}` : sentences[i];
    if (next.length > 420 && primerBloque) break;
    primerBloque = next;
    idxCorte = i + 1;
    if (primerBloque.length >= 280) break;
  }
  const resto = sentences.slice(idxCorte).join(" ").trim();
  if (!primerBloque || !resto) return items;
  return [primerBloque.trim(), resto, ...items.slice(1)].filter(Boolean);
}

function _base64ToUint8(base64 = "") {
  const binary = atob(String(base64 || ""));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function _pcm16Base64ToFloat32(base64 = "") {
  const bytes = _base64ToUint8(base64);
  const dataView = new DataView(bytes.buffer);
  const out = new Float32Array(bytes.byteLength / 2);
  for (let i = 0; i < out.length; i++) {
    const s = dataView.getInt16(i * 2, true);
    out[i] = Math.max(-1, Math.min(1, s / 32768));
  }
  return out;
}

function _geminiLivePendingPlaybackMs() {
  if (!geminiLiveAudioCtx) return 0;
  const playAt = Number(geminiLivePlayAt || 0);
  const now = Number(geminiLiveAudioCtx.currentTime || 0);
  return Math.max(0, (playAt - now) * 1000);
}

function _reproducirPcmGemini(base64Chunk = "") {
  if (!base64Chunk) return;
  if (!geminiLiveAudioCtx) geminiLiveAudioCtx = new AudioContext({ sampleRate: 24000 });
  const samples = _pcm16Base64ToFloat32(base64Chunk);
  if (!samples.length) return;

  const buffer = geminiLiveAudioCtx.createBuffer(1, samples.length, 24000);
  buffer.copyToChannel(samples, 0);
  const source = geminiLiveAudioCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(geminiLiveAudioCtx.destination);
  geminiLiveActivePcmSources.add(source);
  source.onended = () => {
    geminiLiveActivePcmSources.delete(source);
    _tryAdvanceReadingWhenAudioDrained();
    _tryFinishAgentSpeechWhenAudioDrained();
  };

  geminiLivePlayAt = Math.max(geminiLivePlayAt || geminiLiveAudioCtx.currentTime, geminiLiveAudioCtx.currentTime + 0.01);
  source.start(geminiLivePlayAt);
  geminiLivePlayAt += buffer.duration;
}

function _limpiarAudioGeminiProgramado() {
  if (!geminiLiveAudioCtx) return;
  geminiLiveActivePcmSources.forEach((source) => {
    try { source.stop(0); } catch (_) { }
  });
  geminiLiveActivePcmSources.clear();
  geminiLivePlayAt = geminiLiveAudioCtx.currentTime + 0.01;
}

function _clearLivePlanTimer(plan = null) {
  const target = plan || liveReaderState.plan;
  if (!target) return;
  if (target.turnTimer) clearTimeout(target.turnTimer);
  target.turnTimer = null;
}

function _isGeminiLiveAudioDrained() {
  return (geminiLiveActivePcmSources?.size || 0) === 0 && _geminiLivePendingPlaybackMs() <= 28;
}

function _clearAgentSpeechSafetyTimer() {
  if (liveAgentSpeechState.safetyTimer) clearTimeout(liveAgentSpeechState.safetyTimer);
  liveAgentSpeechState.safetyTimer = null;
}

function _notifyAgentSpeechPlaybackEnd(reason = "") {
  if (!liveAgentSpeechState.active) return;
  liveAgentSpeechState.active = false;
  _clearAgentSpeechSafetyTimer();
  const cb = liveAgentSpeechState.onEnd;
  liveAgentSpeechState.onEnd = null;
  liveAgentSpeechState.onError = null;
  if (typeof cb === "function") {
    try { cb(reason); } catch (_) { }
  }
}

function _notifyAgentSpeechPlaybackError(err = null) {
  if (!liveAgentSpeechState.active) return;
  liveAgentSpeechState.active = false;
  _clearAgentSpeechSafetyTimer();
  const cb = liveAgentSpeechState.onError;
  liveAgentSpeechState.onEnd = null;
  liveAgentSpeechState.onError = null;
  if (typeof cb === "function") {
    try { cb(err); } catch (_) { }
  }
}

function _tryFinishAgentSpeechWhenAudioDrained() {
  if (!liveAgentSpeechState.active) return;
  if (!_isGeminiLiveAudioDrained()) return;
  _notifyAgentSpeechPlaybackEnd("audio-drained");
}

function _buildGeminiLiveReadPrompt(chunk = "", index = 0, total = 1, title = "", options = {}) {
  const announceTitle = options?.announceTitle === true;
  const lines = [
    `Lee en voz alta este bloque ${index + 1} de ${total} de forma literal.`,
    "No resumas, no omitas frases y no cambies palabras.",
    "Habla en espanol latino, tono claro y narrativo.",
    "Detente al terminar este bloque y no agregues comentarios."
  ];
  const cleanTitle = String(title || "Lectura").trim() || "Lectura";
  if (announceTitle) {
    lines.push(`Antes del bloque, di el titulo UNA sola vez: "${cleanTitle}".`);
    lines.push("No repitas el titulo.");
  }
  lines.push(`Bloque:\n${chunk}`);
  return lines.join("\n");
}

function _syncAgentViewerSlideWithLivePlan() {
  try {
    if (typeof _lecturasAgentViewerIsOpen !== "function" || !_lecturasAgentViewerIsOpen()) return;
    if (typeof _lecturasAgentSetSlide !== "function") return;
    const plan = liveReaderState.plan;
    const ref = liveReaderState.ref;
    if (!plan || !ref) return;
    const payload = lecturasAgentViewerState?.payload || null;
    if (!payload?.id || !payload?.sourceCollection) return;
    if (String(payload.id) !== String(ref.id) || String(payload.sourceCollection) !== String(ref.coleccion)) return;
    const totalSlides = Number(lecturasAgentViewerState?.slides?.length || 0);
    if (!totalSlides) return;
    const offset = Number(plan?.viewerOffset || 0);
    const target = Math.max(0, Math.min(Number(plan.index || 0) + offset, totalSlides - 1));
    if (Number(lecturasAgentViewerState.currentIndex || 0) === target) return;
    _lecturasAgentSetSlide(target, { manual: false });
  } catch (_) {
    // noop
  }
}

function _dedupeSequentialParagraphs(paragraphs = []) {
  const out = [];
  let lastCanon = "";
  for (const raw of (Array.isArray(paragraphs) ? paragraphs : [])) {
    const text = String(raw || "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const canon = _normalizarTexto(text).replace(/\s+/g, " ").trim();
    if (!canon) continue;
    if (canon === lastCanon) continue;
    out.push(text);
    lastCanon = canon;
  }
  return out;
}

function _stripDuplicatedTitleParagraphs(paragraphs = [], title = "") {
  const titleCanon = _normalizarTexto(String(title || "").replace(/\s+/g, " ").trim());
  if (!titleCanon) return Array.isArray(paragraphs) ? [...paragraphs] : [];
  return (Array.isArray(paragraphs) ? paragraphs : []).filter((text, idx) => {
    const canon = _normalizarTexto(String(text || "").replace(/\s+/g, " ").trim());
    if (!canon) return false;
    if (canon === titleCanon) return false;
    if (idx < 3 && (canon.startsWith(`${titleCanon} `) || titleCanon.startsWith(`${canon} `))) {
      return false;
    }
    return true;
  });
}

function _resolveGeminiLiveModel() {
  const fromCfg = String(
    window.__CHARLY_CONFIG__?.geminiLiveModel
    || window.__CHARLY_CONFIG__?.geminiModelLive
    || GEMINI_LIVE_MODEL_DEFAULT
  ).trim();
  return fromCfg
    .replace(/^models\//i, "")
    .replace(/:generateContent$/i, "")
    .replace(/:streamGenerateContent$/i, "")
    .trim()
    .toLowerCase() || GEMINI_LIVE_MODEL_DEFAULT;
}

function _resolveGeminiLiveVoice() {
  const voice = String(
    window.__CHARLY_CONFIG__?.charlyVoiceName
    || localStorage.getItem("cb_charly_voice_name")
    || GEMINI_LIVE_VOICE_DEFAULT
  ).trim();
  return voice || GEMINI_LIVE_VOICE_DEFAULT;
}

async function requestGeminiLiveTokenViaApi(_modelLive = "", _systemInstruction = "") {
  await ensureRuntimeConfigLoaded();
  const user = auth.currentUser;
  const token = user ? await user.getIdToken() : "";
  const headers = {
    "Content-Type": "application/json"
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const payload = JSON.stringify({
    model: _resolveGeminiLiveModel(),
    systemInstruction: String(_systemInstruction || "").trim()
  });
  const initialUrl = buildApiUrl("/api/gemini/live-token");
  const candidates = [];
  const pushCandidate = (value = "") => {
    const url = String(value || "").trim();
    if (!url || candidates.includes(url)) return;
    candidates.push(url);
  };
  pushCandidate(initialUrl);
  if (/^http:\/\/127\.0\.0\.1:8787\//i.test(initialUrl)) {
    pushCandidate(initialUrl.replace("http://127.0.0.1:8787", "http://localhost:8787"));
  }
  if (window.location?.origin) {
    pushCandidate(`${window.location.origin.replace(/\/+$/, "")}/api/gemini/live-token`);
  }

  let lastError = null;
  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: payload
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) return data;
      if (response.status === 404) {
        lastError = new Error(`HTTP 404 @ ${url}`);
        continue;
      }
      throw new Error(String(data?.detail || data?.error || `HTTP ${response.status}`));
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err || "gemini_live_token_error"));
      const message = String(lastError?.message || "");
      const isNetworkError = /Failed to fetch|NetworkError|Load failed|ERR_CONNECTION_REFUSED/i.test(message);
      const isRouteMissing = /HTTP 404 @/i.test(message);
      if (!isNetworkError && !isRouteMissing) break;
    }
  }
  throw lastError || new Error("No se pudo obtener token de Gemini Live.");
}

async function _loadGoogleGenAiLiveModule() {
  if (window.__cbGoogleGenAiLiveModule?.GoogleGenAI && window.__cbGoogleGenAiLiveModule?.Modality) {
    return window.__cbGoogleGenAiLiveModule;
  }
  if (window.__cbGoogleGenAiLiveModulePromise) {
    return window.__cbGoogleGenAiLiveModulePromise;
  }
  const candidateUrls = [
    String(window.__RUNTIME_CONFIG__?.googleGenAiBrowserModuleUrl || "").trim(),
    String(window.cbGoogleGenAiBrowserModuleUrl || "").trim()
  ].filter(Boolean);
  window.__cbGoogleGenAiLiveModulePromise = (async () => {
    let lastError = null;
    for (const url of candidateUrls) {
      try {
        const mod = await import(url);
        if (mod?.GoogleGenAI && mod?.Modality) {
          window.__cbGoogleGenAiLiveModule = mod;
          return mod;
        }
        lastError = new Error(`Modulo invalido de Gemini Live: ${url}`);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err || "gemini_live_module_load_failed"));
      }
    }
    throw lastError || new Error("No se pudo cargar el modulo web de Gemini Live.");
  })();
  try {
    return await window.__cbGoogleGenAiLiveModulePromise;
  } finally {
    if (!window.__cbGoogleGenAiLiveModule?.GoogleGenAI) {
      window.__cbGoogleGenAiLiveModulePromise = null;
    }
  }
}

function _safeSendClientContent(payload = null) {
  if (!payload) return false;
  if (!geminiLiveSessionUnidad || !geminiLiveIsOpen || geminiLiveSessionClosing) return false;
  try {
    const maybe = geminiLiveSessionUnidad.sendClientContent(payload);
    if (maybe && typeof maybe.then === "function") {
      maybe.catch(() => { });
    }
    return true;
  } catch (_) {
    return false;
  }
}

function _setLiveStateIdle({ keepRef = true } = {}) {
  _clearLivePlanTimer();
  _limpiarAudioGeminiProgramado();
  liveReaderState.state = "idle";
  liveReaderState.startPromise = null;
  liveReaderState.plan = null;
  try {
    if (typeof lecturasAgentViewerState !== "undefined") {
      lecturasAgentViewerState.autoReadActive = false;
      lecturasAgentViewerState.autoReadSpeaking = false;
    }
  } catch (_) {
    // noop
  }
  if (!keepRef) liveReaderState.ref = null;
  emitLecturaLiveState();
}

function _setLiveStatePaused() {
  const plan = liveReaderState.plan;
  if (plan) {
    _clearLivePlanTimer(plan);
    plan.waitingTurn = false;
  }
  _limpiarAudioGeminiProgramado();
  liveReaderState.state = "paused";
  emitLecturaLiveState();
}

function _handleLiveTurnComplete() {
  const plan = liveReaderState.plan;
  if (!plan || plan.mode !== "reading" || plan.waitingTurn !== true) return;
  if (liveReaderState.state === "paused" || liveReaderState.state === "idle") return;
  plan.turnCompleteReceived = true;
  plan.turnCompletedAt = Date.now();
  _tryAdvanceReadingWhenAudioDrained();
}

function _tryAdvanceReadingWhenAudioDrained() {
  const plan = liveReaderState.plan;
  if (!plan || plan.mode !== "reading") return;
  if (!plan.waitingTurn || plan.turnCompleteReceived !== true) return;
  if (liveReaderState.state === "paused" || liveReaderState.state === "idle") return;
  if (!_isGeminiLiveAudioDrained()) return;
  _advanceLiveReading("turnComplete");
}

function _handleLiveServerMessage(message = null) {
  if (!message?.serverContent) return;

  if (message.serverContent.interrupted) {
    _limpiarAudioGeminiProgramado();
  }

  const parts = message?.serverContent?.modelTurn?.parts || [];
  parts.forEach((part) => {
    const data = String(part?.inlineData?.data || "").trim();
    if (!data) return;
    if (liveReaderState.plan?.mode === "reading") {
      liveReaderState.plan.chunkHadAudio = true;
    }
    _reproducirPcmGemini(data);
  });

  if (message?.serverContent?.turnComplete === true) {
    _handleLiveTurnComplete();
    if (liveAgentSpeechState.active) {
      const token = Number(liveAgentSpeechState.token || 0);
      const wait = Math.max(120, Math.min(1800, _geminiLivePendingPlaybackMs() + 140));
      setTimeout(() => {
        if (Number(liveAgentSpeechState.token || 0) !== token) return;
        _tryFinishAgentSpeechWhenAudioDrained();
      }, wait);
    }
  }
}

async function detenerGeminiLiveUnidad() {
  try {
    _clearLivePlanTimer();
    _limpiarAudioGeminiProgramado();
    geminiLiveSessionClosing = true;
    geminiLiveIsOpen = false;
    if (geminiLiveSessionUnidad) {
      geminiLiveSessionUnidad.close();
      geminiLiveSessionUnidad = null;
    }
  } catch (_) {
    // noop
  }
}

async function iniciarGeminiLiveUnidad(options = {}) {
  const forceRestart = options?.forceRestart === true;
  if (geminiLiveConnectPromise) return geminiLiveConnectPromise;
  if (!forceRestart && geminiLiveSessionUnidad && geminiLiveIsOpen) return geminiLiveSessionUnidad;

  const epoch = Date.now();
  geminiLiveSessionEpoch = epoch;
  const modelLive = _resolveGeminiLiveModel();

  geminiLiveConnectPromise = (async () => {
    if (forceRestart || geminiLiveSessionUnidad || geminiLiveIsOpen) {
      await detenerGeminiLiveUnidad();
    }
    geminiLiveSessionClosing = true;

    const tokenJson = await requestGeminiLiveTokenViaApi(modelLive, "");
    const liveApiKey = String(tokenJson?.token || "").trim();
    if (!liveApiKey) throw new Error("Token efimero vacio para Gemini Live.");

    const { GoogleGenAI, Modality } = await _loadGoogleGenAiLiveModule();
    const ai = new GoogleGenAI({
      apiKey: liveApiKey,
      apiVersion: "v1alpha",
      httpOptions: { apiVersion: "v1alpha" }
    });

    geminiLiveSessionUnidad = await ai.live.connect({
      model: modelLive,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: _resolveGeminiLiveVoice()
            }
          }
        },
        outputAudioTranscription: {},
        thinkingConfig: {
          thinkingBudget: 0
        }
      },
      callbacks: {
        onopen: () => {
          if (geminiLiveSessionEpoch !== epoch) return;
          geminiLiveIsOpen = true;
          geminiLiveSessionClosing = false;
        },
        onmessage: (message) => {
          if (geminiLiveSessionEpoch !== epoch) return;
          _handleLiveServerMessage(message);
        },
        onerror: () => {
          if (geminiLiveSessionEpoch !== epoch) return;
          geminiLiveIsOpen = false;
          geminiLiveSessionClosing = true;
          geminiLiveSessionUnidad = null;
          _notifyAgentSpeechPlaybackError(new Error("gemini_live_error"));
          if (liveReaderState.state === "playing" || liveReaderState.state === "starting") {
            _setLiveStatePaused();
          }
        },
        onclose: () => {
          if (geminiLiveSessionEpoch !== epoch) return;
          geminiLiveIsOpen = false;
          geminiLiveSessionClosing = true;
          geminiLiveSessionUnidad = null;
          _notifyAgentSpeechPlaybackError(new Error("gemini_live_closed"));
          if (liveReaderState.state === "playing" || liveReaderState.state === "starting") {
            _setLiveStatePaused();
          }
        }
      }
    });

    return geminiLiveSessionUnidad;
  })();

  try {
    return await geminiLiveConnectPromise;
  } finally {
    geminiLiveConnectPromise = null;
  }
}

function _sendCurrentLiveChunk() {
  const plan = liveReaderState.plan;
  if (!plan || plan.mode !== "reading") return false;
  if (!Array.isArray(plan.chunks) || !plan.chunks.length) return false;
  if (plan.index >= plan.chunks.length) {
    _setLiveStateIdle({ keepRef: true });
    return true;
  }
  if (!geminiLiveSessionUnidad || !geminiLiveIsOpen) return false;

  const chunk = String(plan.chunks[plan.index] || "").trim();
  if (!chunk) {
    plan.index += 1;
    return _sendCurrentLiveChunk();
  }
  _syncAgentViewerSlideWithLivePlan();

  const turnToken = Number((plan.turnToken || 0) + 1);
  plan.turnToken = turnToken;
  plan.waitingTurn = true;
  plan.chunkHadAudio = false;
  plan.turnCompleteReceived = false;
  plan.turnCompletedAt = 0;
  plan.lastChunkSentAt = Date.now();

  const prompt = _buildGeminiLiveReadPrompt(chunk, plan.index, plan.chunks.length, plan.title, {
    announceTitle: plan.announceTitle === true && Number(plan.index || 0) === 0
  });
  const sent = _safeSendClientContent({
    turns: [{
      role: "user",
      parts: [{ text: prompt }]
    }],
    turnComplete: true
  });
  if (!sent) {
    plan.waitingTurn = false;
    _clearLivePlanTimer(plan);
    return false;
  }

  liveReaderState.state = "playing";
  emitLecturaLiveState();
  return true;
}

function _advanceLiveReading(source = "") {
  const plan = liveReaderState.plan;
  if (!plan || plan.mode !== "reading") return;
  if (liveReaderState.state === "paused" || liveReaderState.state === "idle") return;
  const now = Date.now();
  if ((now - Number(plan.lastAdvanceAt || 0)) < 700) return;
  plan.lastAdvanceAt = now;
  plan.waitingTurn = false;
  plan.turnCompleteReceived = false;
  plan.turnCompletedAt = 0;
  _clearLivePlanTimer(plan);
  plan.index += 1;
  if (plan.index >= plan.chunks.length) {
    _setLiveStateIdle({ keepRef: true });
    return;
  }
  const wait = source === "turnComplete" ? 90 : 200;
  setTimeout(() => {
    if (liveReaderState.state === "paused" || liveReaderState.state === "idle") return;
    _sendCurrentLiveChunk();
  }, wait);
}

async function loadLecturaByLiveRef(ref = null) {
  const normalized = normalizeLiveRef(ref);
  if (!normalized) return null;
  const key = `${normalized.coleccion}::${normalized.id}`;
  const local = state.lecturaByKey.get(key) || null;
  if (local) return local;

  try {
    const snap = await getDoc(doc(db, normalized.coleccion, normalized.id));
    if (!snap.exists()) return null;
    return normalizeLectura(snap, normalized.coleccion);
  } catch (_) {
    return null;
  }
}

window.cbLeerLecturaConGeminiLive = async function cbLeerLecturaConGeminiLive(ref = {}) {
  const normalized = normalizeLiveRef(ref);
  if (!normalized) return false;
  if (liveReaderState.startPromise) return liveReaderState.startPromise;

  liveReaderState.ref = { ...normalized };
  liveReaderState.state = "starting";
  emitLecturaLiveState(normalized);

  liveReaderState.startPromise = (async () => {
    try {
      const lectura = await loadLecturaByLiveRef(normalized);
      if (!lectura) {
        _setLiveStateIdle({ keepRef: true });
        return false;
      }

      const rawHtml = String(lectura.htmlLectura || lectura.raw?.contenidoHTML || "");
      const preparedViewer = typeof _lecturasAgentBuildViewerContent === "function"
        ? _lecturasAgentBuildViewerContent(rawHtml, {
          preguntas: lectura.preguntas || [],
          bibliografia: lectura.bibliografia || "",
          sinonimos: lectura.sinonimos || ""
        })
        : null;
      const narrativeHtml = String(preparedViewer?.narrativeHtml || rawHtml || "").trim();
      const normalizedForRead = typeof _lecturasAgentNormalizeParagraphHtml === "function"
        ? _lecturasAgentNormalizeParagraphHtml(narrativeHtml)
        : [];
      const tituloPortada = String(lectura.titulo || lectura.tema || "Lectura").trim();
      const rawParagraphs = normalizedForRead.length
        ? normalizedForRead.map((item) => String(item?.text || "").trim()).filter(Boolean)
        : _extractParagraphsFromHtmlForLive(narrativeHtml);
      const cleanedParagraphs = _dedupeSequentialParagraphs(_stripDuplicatedTitleParagraphs(rawParagraphs, tituloPortada));
      const chunksNarrativa = _trocearLecturaParaLive(cleanedParagraphs, 980);
      const chunks = _acelerarPrimerBloqueLectura(chunksNarrativa);
      if (!chunks.length) {
        _setLiveStateIdle({ keepRef: true });
        return false;
      }

      liveReaderState.plan = {
        mode: "reading",
        title: lectura.titulo || lectura.tema || "Lectura",
        chunks,
        index: 0,
        token: Date.now(),
        waitingTurn: false,
        turnToken: 0,
        turnTimer: null,
        chunkHadAudio: false,
        turnCompleteReceived: false,
        turnCompletedAt: 0,
        lastChunkSentAt: 0,
        lastAdvanceAt: 0,
        viewerOffset: 1,
        announceTitle: true
      };

      await iniciarGeminiLiveUnidad({ withMic: false });
      let ok = _sendCurrentLiveChunk();
      if (!ok) {
        await iniciarGeminiLiveUnidad({ withMic: false, forceRestart: true });
        ok = _sendCurrentLiveChunk();
      }
      if (!ok) {
        _setLiveStateIdle({ keepRef: true });
        return false;
      }
      return true;
    } catch (_) {
      _setLiveStateIdle({ keepRef: true });
      return false;
    } finally {
      liveReaderState.startPromise = null;
      emitLecturaLiveState(normalized);
    }
  })();

  return liveReaderState.startPromise;
};

/* ===== Tutorial Styles Injection ===== */
function _lecturasGameInjectTutorialStyles() {
  if (document.getElementById("lecturasGameTutorialStyles")) return;
  const style = document.createElement("style");
  style.id = "lecturasGameTutorialStyles";
  style.textContent = `
    .trace-intro-modal {
      position: absolute;
      inset: 0;
      z-index: 2500;
      background: rgba(8, 17, 38, 0.85);
      backdrop-filter: blur(14px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      animation: trace-fade-in 0.45s ease-out;
      font-family: 'Nunito', sans-serif;
    }

    [hidden] {
      display: none !important;
    }

    @keyframes trace-fade-in {
      from { opacity: 0; transform: scale(0.97); }
      to { opacity: 1; transform: scale(1); }
    }

    .trace-modal-content {
      background: #ffffff;
      border-radius: 32px;
      width: 100%;
      max-width: 640px;
      max-height: 90vh;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      box-shadow: 0 40px 80px rgba(0,0,0,0.6);
      border: 5px solid #1c84aa;
    }

    .trace-modal-header {
      padding: 32px 32px 12px;
      text-align: center;
    }

    .trace-modal-icon {
      font-size: 3.5rem;
      margin-bottom: 12px;
    }

    .trace-modal-header h2 {
      margin: 0;
      font-size: 2.2rem;
      color: #122047;
      font-weight: 900;
    }

    .trace-modal-body {
      padding: 12px 32px 32px;
    }

    .trace-tutorial-grid {
      display: grid;
      gap: 20px;
    }

    .trace-tutorial-step {
      display: flex;
      gap: 18px;
      align-items: center;
      background: #f0f7ff;
      padding: 20px;
      border-radius: 20px;
      border: 2px solid #d9e8ff;
    }

    .trace-step-num {
      flex-shrink: 0;
      width: 40px;
      height: 40px;
      background: #1c84aa;
      color: #fff;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      font-size: 1.3rem;
    }

    .trace-tutorial-step p {
      margin: 0;
      font-size: 1.15rem;
      color: #1a2a50;
      line-height: 1.5;
    }

    .trace-gesture-img {
      width: 130px;
      height: 130px;
      object-fit: contain;
      border-radius: 16px;
      background: #fff;
      padding: 6px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.12);
    }

    .trace-modal-footer {
      padding: 0 32px 40px;
      display: flex;
      justify-content: center;
    }

    .lecturas-game-pixel-btn.is-gold {
      background: linear-gradient(180deg, #ffdb5e, #f7941d);
      color: #122047 !important;
      border: 4px solid #fff;
      box-shadow: 0 8px 0 #b36e00, 0 15px 30px rgba(247, 148, 29, 0.4) !important;
      padding: 18px 48px;
      font-size: 1.5rem;
      font-weight: 900;
      border-radius: 24px;
      min-width: 300px;
      transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }

    .lecturas-game-pixel-btn.is-gold:hover {
      transform: translateY(-3px) scale(1.02);
      box-shadow: 0 10px 0 #b36e00, 0 20px 40px rgba(247, 148, 29, 0.5) !important;
    }
  `;
  document.head.appendChild(style);
}

window.cbGetLecturaGeminiLiveState = function cbGetLecturaGeminiLiveState(ref = {}) {
  const normalized = normalizeLiveRef(ref);
  if (!normalized) {
    return {
      ref: liveReaderState.ref ? { ...liveReaderState.ref } : null,
      state: String(liveReaderState.state || "idle")
    };
  }
  return {
    ref: { ...normalized },
    state: sameLiveRef(liveReaderState.ref, normalized) ? String(liveReaderState.state || "idle") : "idle"
  };
};

window.cbControlLecturaGeminiLive = async function cbControlLecturaGeminiLive(ref = {}, options = {}) {
  const normalized = normalizeLiveRef(ref);
  if (!normalized) return { ok: false, state: "idle" };

  const isSame = sameLiveRef(liveReaderState.ref, normalized);
  const stateNow = isSame ? String(liveReaderState.state || "idle") : "idle";
  const stopOnly = options?.stop === true;

  if (!isSame && (liveReaderState.state === "playing" || liveReaderState.state === "starting" || liveReaderState.state === "paused")) {
    _setLiveStateIdle({ keepRef: false });
    await detenerGeminiLiveUnidad();
  }

  if (stopOnly) {
    if (isSame) {
      _setLiveStateIdle({ keepRef: true });
      await detenerGeminiLiveUnidad();
    } else {
      emitLecturaLiveState(normalized);
    }
    return { ok: true, state: "idle" };
  }

  if (stateNow === "starting") return { ok: true, state: "starting" };

  if (stateNow === "playing") {
    _setLiveStatePaused();
    await detenerGeminiLiveUnidad();
    return { ok: true, state: "paused" };
  }

  if (stateNow === "paused") {
    liveReaderState.ref = { ...normalized };
    liveReaderState.state = "starting";
    emitLecturaLiveState(normalized);
    try {
      await iniciarGeminiLiveUnidad({ withMic: false, forceRestart: true });
      const ok = _sendCurrentLiveChunk();
      if (!ok) {
        _setLiveStateIdle({ keepRef: true });
        return { ok: false, state: "idle" };
      }
      return { ok: true, state: "playing" };
    } catch (_) {
      _setLiveStateIdle({ keepRef: true });
      return { ok: false, state: "idle" };
    }
  }

  const ok = await window.cbLeerLecturaConGeminiLive(normalized);
  return { ok, state: ok ? "playing" : "idle" };
};


/* ===== Adaptadores para bloque reciclado de lecturasASCAgent ===== */
function _normalizarTexto(value = "") {
  return normalizeText(value);
}

function sanitizeHtml(html = "") {
  try {
    if (window.DOMPurify && typeof window.DOMPurify.sanitize === "function") {
      const sanitized = window.DOMPurify.sanitize(String(html || ""), {
        ALLOW_UNKNOWN_PROTOCOLS: false,
        FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "link", "meta", "form", "input", "textarea", "button", "select", "option"],
        FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "style"]
      });
      if (window.trustedTypes && !window.__cbLecturasTrustedPolicy) {
        try {
          window.__cbLecturasTrustedPolicy = window.trustedTypes.createPolicy("cb-lecturas-html", {
            createHTML: (input) => String(input || "")
          });
        } catch (_) {
          // no-op
        }
      }
      if (window.__cbLecturasTrustedPolicy) {
        return String(window.__cbLecturasTrustedPolicy.createHTML(sanitized));
      }
      return String(sanitized || "");
    }
  } catch (_) {
    // fallback sanitizer below
  }
  const wrapper = document.createElement("div");
  wrapper.innerHTML = String(html || "");
  const allowedTags = new Set([
    "A", "P", "DIV", "SPAN", "STRONG", "EM", "B", "I", "U", "BR",
    "UL", "OL", "LI", "H1", "H2", "H3", "H4", "H5", "H6",
    "TABLE", "THEAD", "TBODY", "TR", "TH", "TD", "CAPTION",
    "IMG", "FIGURE", "FIGCAPTION", "BLOCKQUOTE", "CODE", "PRE"
  ]);
  const allowedAttrs = new Set([
    "href", "src", "alt", "title", "class", "id", "role",
    "aria-label", "aria-hidden", "colspan", "rowspan"
  ]);
  wrapper.querySelectorAll("script, style, iframe, object, embed, link, meta, form, input, textarea, button, select, option").forEach((node) => node.remove());
  wrapper.querySelectorAll("*").forEach((node) => {
    if (!allowedTags.has(String(node.tagName || "").toUpperCase())) {
      node.replaceWith(...Array.from(node.childNodes || []));
      return;
    }
    Array.from(node.attributes || []).forEach((attr) => {
      const name = String(attr.name || "").toLowerCase();
      const value = String(attr.value || "").trim();
      if (name.startsWith("on")) {
        node.removeAttribute(attr.name);
        return;
      }
      if (!allowedAttrs.has(name)) {
        node.removeAttribute(attr.name);
        return;
      }
      if (name === "href" || name === "src") {
        const lowered = value.toLowerCase();
        if (
          lowered.startsWith("javascript:")
          || lowered.startsWith("data:text/html")
          || lowered.startsWith("vbscript:")
        ) {
          node.removeAttribute(attr.name);
          return;
        }
        if (value && !_lecturasGameIsAllowedRemoteUrl(value)) {
          node.removeAttribute(attr.name);
          return;
        }
      }
    });
    if (String(node.tagName || "").toUpperCase() === "A") {
      const href = String(node.getAttribute("href") || "").trim();
      if (!href) {
        node.removeAttribute("target");
        node.removeAttribute("rel");
      } else {
        node.setAttribute("rel", "noopener noreferrer nofollow");
        if (/^https?:/i.test(href)) node.setAttribute("target", "_blank");
      }
    }
  });
  return wrapper.innerHTML || "";
}

function _agenteUnidadEnModoExclusivo() {
  return false;
}

function _clearAgentSpeechPlaybackTimer() {
  _clearAgentSpeechSafetyTimer();
}

function _resetAgentSpeechPlaybackCallbacks() {
  liveAgentSpeechState.onEnd = null;
  liveAgentSpeechState.onError = null;
}

function _detenerAudioWorkflowPlay() {
  _limpiarAudioGeminiProgramado();
  if (liveReaderState.state === "playing" || liveReaderState.state === "starting") {
    _setLiveStatePaused();
  }
  detenerGeminiLiveUnidad().catch(() => { });
}

async function geminiGenerateViaApi(model = "", payload = {}, signal = null) {
  await ensureRuntimeConfigLoaded();
  const user = auth.currentUser;
  const token = user ? await user.getIdToken() : "";
  const headers = {
    "Content-Type": "application/json"
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(buildApiUrl("/api/gemini/generate"), {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: String(model || "gemini-2.5-flash-lite"),
      payload: payload || {}
    }),
    ...(signal ? { signal } : {})
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

function hablarAgenteUnidad(texto = "", options = {}) {
  const textoPlano = String(texto || "").trim();
  if (!textoPlano) return false;

  const {
    cancelPrevious = true,
    onPlaybackStart = null,
    onPlaybackEnd = null,
    onPlaybackError = null
  } = options || {};

  const token = Number((liveAgentSpeechState.token || 0) + 1);
  liveAgentSpeechState.token = token;
  liveAgentSpeechState.active = true;
  liveAgentSpeechState.onEnd = typeof onPlaybackEnd === "function" ? onPlaybackEnd : null;
  liveAgentSpeechState.onError = typeof onPlaybackError === "function" ? onPlaybackError : null;
  _clearAgentSpeechSafetyTimer();

  (async () => {
    try {
      if (cancelPrevious) _limpiarAudioGeminiProgramado();
      await iniciarGeminiLiveUnidad({ withMic: false });
      const prompt = [
        "Di exactamente este texto en espanol latino, sin agregar ni quitar palabras.",
        `Texto: "${textoPlano.replace(/"/g, '\\"')}"`
      ].join("\n");
      const sent = _safeSendClientContent({
        turns: [{
          role: "user",
          parts: [{ text: prompt }]
        }],
        turnComplete: true
      });
      if (!sent) throw new Error("gemini_live_send_failed");
      if (typeof onPlaybackStart === "function") onPlaybackStart();
      liveAgentSpeechState.safetyTimer = setTimeout(() => {
        if (Number(liveAgentSpeechState.token || 0) !== token) return;
        _notifyAgentSpeechPlaybackError(new Error("gemini_live_turn_timeout"));
      }, 120000);
    } catch (err) {
      if (Number(liveAgentSpeechState.token || 0) !== token) return;
      _notifyAgentSpeechPlaybackError(err);
    }
  })();

  return true;
}

const LECTURAS_AGENT_VIEWER_CACHE_KEY = "cb_lecturas_agent_images_v2";
const lecturasAgentViewerState = {
  token: 0,
  payload: null,
  slides: [],
  sections: { preguntas: "", bibliografia: "", sinonimos: "" },
  visibleSections: { preguntas: false, bibliografia: false, sinonimos: false },
  menuOpen: false,
  currentIndex: 0,
  refs: null,
  keyHandler: null,
  memCache: new Map(),
  storeLoaded: false,
  storageUrlCache: new Map(),
  autoReadActive: false,
  autoReadUtterance: null,
  autoReadLockedUntil: 0,
  autoReadRunId: 0,
  autoReadAdvanceTimer: null,
  autoReadSpeaking: false,
  autoReadSpeakSeq: 0,
  manualReadSpeaking: false,
  manualNavToken: 0,
  fullscreenHandler: null,
  liveStateHandler: null
};

const LECTURAS_AGENT_SECTION_META = [
  { key: "preguntas", label: "Preguntas comprensión", icon: "fa-circle-question" },
  { key: "bibliografia", label: "Bibliografía", icon: "fa-book" },
  { key: "sinonimos", label: "Tabla de sinónimos", icon: "fa-language" }
];

const LECTURAS_AGENT_SECTION_HEADING_REGEX = {
  preguntas: /^(preguntas?(?: de)?(?: comprension)?|cuestionario|actividades?(?: de)?(?: comprension)?)$/i,
  bibliografia: /^(bibliografia|fuentes consultadas|referencias(?: bibliograficas)?)$/i,
  sinonimos: /^(tabla de sinonimos|sinonimos|glosario|vocabulario)$/i
};

function _lecturasAgentIsAutoReadSpeaking() {
  const refs = lecturasAgentViewerState.refs;
  const open = refs?.modal?.getAttribute?.("aria-hidden") === "false";
  return open && (
    (lecturasAgentViewerState.autoReadActive === true && lecturasAgentViewerState.autoReadSpeaking === true)
    || lecturasAgentViewerState.manualReadSpeaking === true
  );
}

function _lecturasAgentViewerIsOpen() {
  const refs = lecturasAgentViewerState.refs;
  return refs?.modal?.getAttribute?.("aria-hidden") === "false";
}

function _lecturasAgentSafeHtml(text = "") {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function _lecturasAgentHash(value = "") {
  const text = String(value || "");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(36);
}

function _lecturasAgentSafePathPart(value = "") {
  return String(value || "").trim().replace(/[^\w.-]+/g, "_").slice(0, 80) || "sin_valor";
}

function _lecturasAgentBuildStoragePath(payload = {}, slide = {}) {
  const uid = String(
    payload?.ownerUid
    || payload?.ownerId
    || payload?.userId
    || payload?.uid
    || auth?.currentUser?.uid
    || "anon"
  ).trim();
  const sourceCollection = _lecturasAgentSafePathPart(payload?.sourceCollection || payload?.coleccion || "lecturasNuevas");
  const lecturaId = _lecturasAgentSafePathPart(payload?.id || "sin_id");
  const paragraphHash = _lecturasAgentSafePathPart(slide?.paragraphHash || _lecturasAgentHash(slide?.text || "s"));
  return `lecturas-agent/${uid}/${sourceCollection}/${lecturaId}/${paragraphHash}.png`;
}

function _lecturasAgentLoadCacheStore() {
  if (lecturasAgentViewerState.storeLoaded) return;
  lecturasAgentViewerState.storeLoaded = true;
  try {
    const raw = sessionStorage.getItem(LECTURAS_AGENT_VIEWER_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;
    Object.entries(parsed).forEach(([key, value]) => {
      const k = String(key || "").trim();
      const v = String(value || "").trim();
      if (!k || !v) return;
      if (/^lecturas-agent\//i.test(v)) return;
      lecturasAgentViewerState.memCache.set(k, v);
    });
  } catch (_) { }
}

function _lecturasAgentPersistCacheStore() {
  try {
    const entries = Array.from(lecturasAgentViewerState.memCache.entries()).slice(-200);
    const out = {};
    entries.forEach(([k, v]) => { out[k] = v; });
    sessionStorage.setItem(LECTURAS_AGENT_VIEWER_CACHE_KEY, JSON.stringify(out));
  } catch (_) { }
}

function _lecturasAgentSyncCardCover(payload = {}, imageUrl = "") {
  const src = sanitizeImageCandidate(imageUrl);
  if (!src) return;
  const id = String(payload?.id || "").trim();
  const sourceCollection = String(payload?.sourceCollection || payload?.coleccion || "").trim();
  if (!id || !sourceCollection) return;
  const key = `${sourceCollection}::${id}`;
  const row = state?.lecturaByKey?.get?.(key);
  if (!row) return;
  row.coverImageResolved = src;
  renderLecturaCards();
}

function _lecturasAgentNormalizeParagraphHtml(html = "") {
  const wrap = document.createElement("div");
  wrap.innerHTML = String(html || "").trim();
  const blocks = Array.from(wrap.querySelectorAll("p, li, blockquote, h2, h3, h4"));
  const out = [];
  blocks.forEach((node) => {
    const text = String(node.textContent || "").replace(/\s+/g, " ").trim();
    if (!text || text.length < 24) return;
    const sectionKey = _lecturasAgentSectionKeyFromText(text);
    if (sectionKey && text.length <= 220) return;
    out.push({
      html: node.outerHTML,
      text
    });
  });
  if (out.length) return out;
  const plain = String(wrap.textContent || "").replace(/\r/g, "").trim();
  if (!plain) return [];
  return plain
    .split(/\n{2,}|(?<=[.!?…])\s+(?=[A-ZÁÉÍÓÚÑ])/)
    .map((chunk) => String(chunk || "").replace(/\s+/g, " ").trim())
    .filter((chunk) => chunk.length > 18)
    .map((chunk) => ({ html: `<p>${_lecturasAgentSafeHtml(chunk)}</p>`, text: chunk }));
}

function _lecturasAgentNormalizeKey(text = "") {
  const raw = String(text || "").trim();
  if (!raw) return "";
  if (typeof _normalizarTexto === "function") return _normalizarTexto(raw);
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function _lecturasAgentSectionKeyFromText(text = "") {
  const norm = _lecturasAgentNormalizeKey(text);
  if (!norm) return "";
  if (/\b(preguntas|cuestionario|actividades)\b/.test(norm) && /\b(comprension|reflexion)\b/.test(norm)) return "preguntas";
  if (/\b(bibliografia|fuentes consultadas|referencias bibliograficas)\b/.test(norm)) return "bibliografia";
  if (/\b(tabla de sinonimos|sinonimos|glosario|vocabulario)\b/.test(norm)) return "sinonimos";
  return "";
}

function _lecturasAgentSectionKeyFromElement(el) {
  if (!el) return "";
  const text = String(el.textContent || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const key = _lecturasAgentSectionKeyFromText(text);
  if (!key) return "";
  const tag = String(el.tagName || "").toUpperCase();
  if (/^H[1-6]$/.test(tag)) return key;
  if (text.length <= 150 && /^(P|DIV|SPAN|STRONG|B)$/.test(tag)) return key;
  return "";
}

function _lecturasAgentBuildPreguntasHtml(items = []) {
  const arr = Array.isArray(items) ? items : [];
  const normalized = arr
    .map((item) => {
      if (typeof item === "string") {
        const tx = String(item || "").trim();
        return tx ? { texto: tx, respuesta: "" } : null;
      }
      const texto = String(item?.texto || item?.pregunta || "").trim();
      if (!texto) return null;
      return { texto, respuesta: String(item?.respuesta || "").trim() };
    })
    .filter(Boolean);
  if (!normalized.length) return "";
  const list = normalized.map((item, idx) =>
    `<li><strong>${idx + 1}.</strong> ${_lecturasAgentSafeHtml(item.texto)}${item.respuesta ? `<br><em>${_lecturasAgentSafeHtml(item.respuesta)}</em>` : ""}</li>`
  ).join("");
  return `<ol class="lecturas-asc-agent-section-list">${list}</ol>`;
}

function _lecturasAgentBuildBibliografiaHtml(value = null) {
  if (value == null) return "";
  if (typeof value === "string") {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/<[a-z][\s\S]*>/i.test(raw)) return raw;
    return `<p>${_lecturasAgentSafeHtml(raw)}</p>`;
  }
  if (Array.isArray(value)) {
    const items = value
      .map((item) => {
        if (typeof item === "string") return String(item || "").trim();
        if (item && typeof item === "object") return String(item?.texto || item?.referencia || item?.fuente || "").trim();
        return "";
      })
      .filter(Boolean);
    if (!items.length) return "";
    return `<ul class="lecturas-asc-agent-section-list">${items.map((it) => `<li>${_lecturasAgentSafeHtml(it)}</li>`).join("")}</ul>`;
  }
  if (typeof value === "object") {
    const items = Object.values(value)
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    if (!items.length) return "";
    return `<ul class="lecturas-asc-agent-section-list">${items.map((it) => `<li>${_lecturasAgentSafeHtml(it)}</li>`).join("")}</ul>`;
  }
  return "";
}

function _lecturasAgentBuildSinonimosHtml(value = null) {
  if (value == null) return "";
  if (typeof value === "string") {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/<[a-z][\s\S]*>/i.test(raw)) return raw;
    return `<p>${_lecturasAgentSafeHtml(raw)}</p>`;
  }
  let sourceRows = [];
  if (Array.isArray(value)) {
    sourceRows = value;
  } else if (value && typeof value === "object") {
    if (Array.isArray(value?.rows)) {
      sourceRows = value.rows;
    } else if (Array.isArray(value?.items)) {
      sourceRows = value.items;
    } else if (Array.isArray(value?.data)) {
      sourceRows = value.data;
    } else if (value?.palabra || value?.termino || value?.término || value?.sinonimos || value?.sinónimos) {
      sourceRows = [value];
    } else {
      sourceRows = Object.entries(value).map(([palabra, sinonimos]) => ({ palabra, sinonimos }));
    }
  }
  if (!sourceRows.length) return "";
  const rows = sourceRows
    .map((item) => {
      if (typeof item === "string") {
        const line = String(item || "").trim();
        if (!line) return null;
        const match = line.match(/^([^:=-]{2,})\s*[:=-]\s*(.+)$/);
        if (!match) return `<tr><td>${_lecturasAgentSafeHtml(line)}</td><td>—</td></tr>`;
        return `<tr><td>${_lecturasAgentSafeHtml(String(match[1] || "").trim())}</td><td>${_lecturasAgentSafeHtml(String(match[2] || "").trim())}</td></tr>`;
      }
      const palabra = String(item?.palabra || item?.termino || item?.término || "").trim();
      const sinon = Array.isArray(item?.sinonimos)
        ? item.sinonimos.join(", ")
        : String(item?.sinonimos || item?.sinónimos || item?.equivalente || "").trim();
      if (!palabra && !sinon) return null;
      return `<tr><td>${_lecturasAgentSafeHtml(palabra || "—")}</td><td>${_lecturasAgentSafeHtml(sinon || "—")}</td></tr>`;
    })
    .filter(Boolean);
  if (!rows.length) return "";
  return `
    <table class="lecturas-asc-agent-section-table">
      <thead><tr><th>Palabra</th><th>Sinónimos</th></tr></thead>
      <tbody>${rows.join("")}</tbody>
    </table>
  `;
}

function _lecturasAgentSanitizeRichHtml(html = "") {
  const raw = String(html || "").trim();
  if (!raw) return "";
  if (typeof sanitizeHtml === "function") {
    try { return sanitizeHtml(raw); } catch (_) { }
  }
  return raw.replace(/<script[\s\S]*?<\/script>/gi, "");
}

function _lecturasAgentIsSectionHeadingDuplicate(text = "", key = "") {
  const sectionKey = String(key || "").trim();
  if (!sectionKey) return false;
  const pattern = LECTURAS_AGENT_SECTION_HEADING_REGEX[sectionKey];
  if (!pattern) return false;
  const normalized = _lecturasAgentNormalizeKey(text).replace(/^[\s:;,.¡!¿?\-]+|[\s:;,.¡!¿?\-]+$/g, "").trim();
  if (!normalized) return false;
  return pattern.test(normalized);
}

function _lecturasAgentStripLeadingSectionHeading(html = "", key = "") {
  const raw = String(html || "").trim();
  if (!raw) return "";
  const wrap = document.createElement("div");
  wrap.innerHTML = raw;
  let removedAny = false;
  for (let i = 0; i < 4; i++) {
    while (wrap.firstChild && (
      (wrap.firstChild.nodeType === 3 && !String(wrap.firstChild.textContent || "").trim())
      || wrap.firstChild.nodeType === 8
    )) {
      wrap.removeChild(wrap.firstChild);
      removedAny = true;
    }
    const first = wrap.firstElementChild;
    if (!first) break;
    const tag = String(first.tagName || "").toUpperCase();
    const canBeHeading = /^H[1-6]$/.test(tag) || /^(P|DIV|SPAN|STRONG|B)$/.test(tag);
    const text = String(first.textContent || "").replace(/\s+/g, " ").trim();
    if (!canBeHeading || !_lecturasAgentIsSectionHeadingDuplicate(text, key)) break;
    first.remove();
    removedAny = true;
  }
  return removedAny ? String(wrap.innerHTML || "").trim() : raw;
}

function _lecturasAgentPrepareSectionHtml(key = "", html = "") {
  const sectionKey = String(key || "").trim();
  const cleaned = _lecturasAgentStripLeadingSectionHeading(html, sectionKey);
  if (!cleaned) return "";
  if (sectionKey !== "sinonimos") return cleaned;

  const wrap = document.createElement("div");
  wrap.innerHTML = cleaned;
  const tables = Array.from(wrap.querySelectorAll("table"));
  tables.forEach((table) => {
    table.classList.add("lecturas-asc-agent-section-table");
    const caption = table.querySelector("caption");
    if (caption && _lecturasAgentIsSectionHeadingDuplicate(caption.textContent || "", sectionKey)) {
      caption.remove();
    }
  });
  return String(wrap.innerHTML || "").trim();
}

function _lecturasAgentTableLooksLikeSinonimos(table) {
  if (!table || typeof table.querySelectorAll !== "function") return false;
  const tableId = _lecturasAgentNormalizeKey(`${table.id || ""} ${table.className || ""}`);
  if (/(sinonim|glosari|vocabular)/.test(tableId)) return true;

  const parts = [];
  const caption = String(table.querySelector("caption")?.textContent || "").trim();
  if (caption) parts.push(caption);
  parts.push(...Array.from(table.querySelectorAll("thead th")).map((th) => String(th.textContent || "").trim()).filter(Boolean));
  const firstRowCells = Array.from(table.querySelectorAll("tr:first-child th, tr:first-child td"))
    .map((cell) => String(cell.textContent || "").trim())
    .filter(Boolean);
  parts.push(...firstRowCells);
  const normalizedJoined = _lecturasAgentNormalizeKey(parts.join(" "));
  if (/(sinonim|equivalente|vocabular|glosari)/.test(normalizedJoined)) return true;

  const left = _lecturasAgentNormalizeKey(firstRowCells[0] || "");
  const right = _lecturasAgentNormalizeKey(firstRowCells[1] || "");
  if (!left || !right) return false;
  const leftLooksWord = /(palabra|termino|concepto|vocabulario|expresion)/.test(left);
  const rightLooksSyn = /(sinonim|equivalente|similar|alternativa)/.test(right);
  return leftLooksWord && rightLooksSyn;
}

function _lecturasAgentExtractOptionalSections(html = "") {
  const wrap = document.createElement("div");
  wrap.innerHTML = String(html || "").trim();
  const sections = { preguntas: "", bibliografia: "", sinonimos: "" };

  const pullBySelector = (selector, key) => {
    const nodes = Array.from(wrap.querySelectorAll(selector));
    if (!nodes.length) return;
    sections[key] += nodes.map((node) => node.outerHTML).join("");
    nodes.forEach((node) => node.remove());
  };

  pullBySelector("table.lectura-tabla-sinonimos", "sinonimos");
  pullBySelector("table.tabla-sinonimos, .tabla-sinonimos table", "sinonimos");
  pullBySelector("table[data-section='sinonimos'], table[data-section='sinónimos'], table[data-lectura-section='sinonimos']", "sinonimos");
  const heuristicSinonimosTables = Array.from(wrap.querySelectorAll("table")).filter((table) => _lecturasAgentTableLooksLikeSinonimos(table));
  if (heuristicSinonimosTables.length) {
    sections.sinonimos += heuristicSinonimosTables.map((node) => node.outerHTML).join("");
    heuristicSinonimosTables.forEach((node) => node.remove());
  }
  pullBySelector(".lectura-bibliografia-lista", "bibliografia");

  const children = Array.from(wrap.children);
  let idx = 0;
  while (idx < children.length) {
    const node = children[idx];
    if (!node || node.parentElement !== wrap) {
      idx += 1;
      continue;
    }
    const key = _lecturasAgentSectionKeyFromElement(node);
    if (!key) {
      idx += 1;
      continue;
    }
    const chunk = [];
    while (idx < children.length) {
      const current = children[idx];
      if (!current || current.parentElement !== wrap) {
        idx += 1;
        continue;
      }
      const currentKey = _lecturasAgentSectionKeyFromElement(current);
      const isHeading = /^H[1-6]$/.test(String(current.tagName || "").toUpperCase());
      if (current !== node && (currentKey || isHeading)) break;
      chunk.push(current.outerHTML);
      current.remove();
      idx += 1;
    }
    sections[key] += chunk.join("");
  }

  return {
    narrativeHtml: String(wrap.innerHTML || "").trim(),
    sections
  };
}

function _lecturasAgentBuildViewerContent(rawHtml = "", payload = {}) {
  const extracted = _lecturasAgentExtractOptionalSections(rawHtml);
  const payloadSinonimosSource = _lecturasHasStructuredContent(payload?.sinonimos)
    ? payload.sinonimos
    : resolveLecturaSinonimos(payload || {});
  const payloadQuestions = _lecturasAgentBuildPreguntasHtml(payload?.preguntas || payload?.preguntasComprension || []);
  const payloadBibliografia = _lecturasAgentBuildBibliografiaHtml(payload?.bibliografia || null);
  const payloadSinonimos = _lecturasAgentBuildSinonimosHtml(payloadSinonimosSource || null);
  const sections = {
    preguntas: String(extracted.sections.preguntas || "").trim() || payloadQuestions,
    bibliografia: String(extracted.sections.bibliografia || "").trim() || payloadBibliografia,
    sinonimos: String(extracted.sections.sinonimos || "").trim() || payloadSinonimos
  };
  const hasSectionContent = Object.values(sections).some((v) => String(v || "").trim().length > 0);
  const narrativeHtml = String(extracted.narrativeHtml || "").trim();
  return {
    narrativeHtml: narrativeHtml || (hasSectionContent ? "<p>(Sin contenido narrativo en esta vista.)</p>" : (String(rawHtml || "").trim() || "<p>(Sin contenido)</p>")),
    sections
  };
}

function _lecturasAgentRenderSectionsUi() {
  const refs = lecturasAgentViewerState.refs;
  if (!refs?.sectionsMenu || !refs?.sectionsPanel) return;

  const sections = lecturasAgentViewerState.sections || {};
  const visible = lecturasAgentViewerState.visibleSections || {};
  const preparedByKey = {};
  const menuItems = LECTURAS_AGENT_SECTION_META.map((meta) => {
    preparedByKey[meta.key] = _lecturasAgentPrepareSectionHtml(meta.key, sections[meta.key]);
    const hasContent = String(preparedByKey[meta.key] || "").trim().length > 0;
    const isActive = visible[meta.key] === true;
    return `
      <button type="button" class="lecturas-asc-agent-section-menu-btn${isActive ? " is-active" : ""}" data-action="toggle-section" data-section="${meta.key}" ${hasContent ? "" : "disabled"}>
        <i class="fas ${meta.icon}" aria-hidden="true"></i>
        <span>${meta.label}</span>
      </button>
    `;
  }).join("");
  refs.sectionsMenu.innerHTML = menuItems || `<p class="lecturas-asc-agent-section-empty">Sin opciones disponibles.</p>`;

  const visibleCards = LECTURAS_AGENT_SECTION_META
    .filter((meta) => visible[meta.key] === true && String(preparedByKey[meta.key] || "").trim().length > 0)
    .map((meta) => `
      <section class="lecturas-asc-agent-section-card" data-section-key="${meta.key}">
        ${meta.key === "sinonimos" ? "" : `<h4 class="lecturas-asc-agent-section-title">${meta.label}</h4>`}
        <div class="lecturas-asc-agent-section-body">${_lecturasAgentSanitizeRichHtml(preparedByKey[meta.key])}</div>
      </section>
    `);
  refs.sectionsMenu.hidden = lecturasAgentViewerState.menuOpen !== true || visibleCards.length > 0;

  if (!visibleCards.length) {
    refs.sectionsPanel.innerHTML = "";
    refs.sectionsPanel.hidden = true;
    return;
  }
  refs.sectionsPanel.innerHTML = `
    <button type="button" class="lecturas-asc-agent-sections-panel-close" data-action="close-sections-panel" aria-label="Cerrar panel de secciones">&times;</button>
    ${visibleCards.join("")}
  `;
  refs.sectionsPanel.hidden = false;
}

function _lecturasAgentSetVisibleSection(nextKey = "") {
  const key = String(nextKey || "").trim();
  const map = lecturasAgentViewerState.visibleSections || {};
  const keys = Object.keys(map);
  if (!keys.length) return false;

  let changed = false;
  const currentActive = keys.find((k) => map[k] === true) || "";
  const targetIsValid = key && Object.prototype.hasOwnProperty.call(map, key);
  const openTarget = targetIsValid && currentActive !== key;

  for (const sectionKey of keys) {
    const nextValue = openTarget && sectionKey === key;
    if (map[sectionKey] !== nextValue) {
      map[sectionKey] = nextValue;
      changed = true;
    }
  }

  return changed;
}

async function _lecturasAgentTryReadStorageUrl(slide = {}) {
  const path = String(slide?.storagePath || "").trim();
  if (!path) return "";
  if (lecturaCoverFailedRefs.has(path)) return "";
  const cached = lecturasAgentViewerState.storageUrlCache.get(path);
  if (cached) return cached;
  const parsed = _lecturasGameParseAgentStoragePath(path);
  if (parsed?.sourceCollection && parsed?.lecturaId) {
    const byDocFile = await _lecturasGameResolveAgentImageByDocAndFile(parsed.sourceCollection, parsed.lecturaId, parsed.fileName);
    if (byDocFile) {
      lecturasAgentViewerState.storageUrlCache.set(path, byDocFile);
      return byDocFile;
    }
    // Si la ruta viene como anon y no hubo match exacto, evitamos getDownloadURL 404.
    if (String(parsed.uid || "").toLowerCase() === "anon") {
      lecturasAgentViewerState.storageUrlCache.set(path, "");
      lecturaCoverFailedRefs.add(path);
      return "";
    }
    const prefix = `lecturas-agent/${parsed.uid}/${parsed.sourceCollection}/${parsed.lecturaId}/`;
    const byPrefix = await _lecturasGameResolveFirstStorageImageInPrefix(prefix).catch(() => "");
    if (byPrefix) {
      lecturasAgentViewerState.storageUrlCache.set(path, byPrefix);
      return byPrefix;
    }
    lecturasAgentViewerState.storageUrlCache.set(path, "");
    lecturaCoverFailedRefs.add(path);
    return "";
  }
  try {
    const url = await getDownloadURL(storageRef(storage, path));
    if (url) {
      lecturasAgentViewerState.storageUrlCache.set(path, url);
      return url;
    }
  } catch (_) {
    lecturaCoverFailedRefs.add(path);
  }
  return "";
}

function _lecturasAgentRenderDots() {
  const refs = lecturasAgentViewerState.refs;
  if (!refs?.dots) return;
  const dots = lecturasAgentViewerState.slides.map((slide, idx) => {
    const active = idx === lecturasAgentViewerState.currentIndex ? " is-active" : "";
    const label = slide?.kind === "cover" ? "Ir a portada" : `Ir al párrafo ${idx + 1}`;
    return `<button type="button" class="lecturas-asc-agent-dot${active}" data-dot-index="${idx}" aria-label="${label}"></button>`;
  }).join("");
  refs.dots.innerHTML = dots;
}

function _lecturasAgentCssUrl(url = "") {
  return String(url || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, "");
}

function _lecturasAgentResolveBubbleSizeClass(text = "") {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  const words = cleaned ? cleaned.split(" ").length : 0;
  const chars = cleaned.length;
  if (words <= 22 && chars <= 160) return "is-short";
  if (words >= 70 || chars >= 420) return "is-long";
  return "is-medium";
}

function _lecturasAgentResolveBubbleVariant(index = 0, text = "") {
  const seed = parseInt(_lecturasAgentHash(`${Number(index) || 0}:${text}`), 36) || 0;
  const tones = ["is-tone-1", "is-tone-2", "is-tone-3", "is-tone-4", "is-tone-5", "is-tone-6"];
  const shapes = [
    "is-shape-rounded",
    "is-shape-square",
    "is-shape-cloud",
    "is-shape-star",
    "is-shape-organic",
    "is-shape-pill"
  ];
  const accents = ["is-accent-1", "is-accent-2", "is-accent-3"];
  const tone = tones[seed % tones.length];
  return {
    tone,
    shape: shapes[(seed >> 2) % shapes.length],
    accent: accents[(seed >> 4) % accents.length],
    contrast: tone === "is-tone-3" ? "is-light-bubble" : "is-dark-bubble"
  };
}

function _lecturasAgentResolveTextMode(text = "", index = 0, partIndex = 0, totalParts = 1) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "bubble";
  const seed = parseInt(_lecturasAgentHash(`mode:${index}:${partIndex}:${cleaned}`), 36) || 0;
  if (cleaned.length <= 90 && /[¡!¿?]/.test(cleaned)) return "highlight";
  if (totalParts > 1 && partIndex === 0 && cleaned.length >= 110) return "plain";
  if (totalParts === 1 && cleaned.length >= 210 && (seed % 3 === 0)) return "plain";
  if (cleaned.length >= 80 && (seed % 5 === 0)) return "plain";
  return "bubble";
}

function _lecturasAgentSplitBubbleText(text = "") {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const sentences = (cleaned.match(/[^.!?]+(?:[.!?]+|$)/g) || [])
    .map((item) => String(item || "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (sentences.length < 2) return [cleaned];
  if (cleaned.length < 110) return [cleaned];

  const total = sentences.reduce((acc, item) => acc + item.length, 0);
  let splitAt = 1;
  let running = 0;
  for (let i = 1; i < sentences.length; i++) {
    running += sentences[i - 1].length;
    splitAt = i;
    if (running >= total * 0.46) break;
  }
  const left = sentences.slice(0, splitAt).join(" ").trim();
  const right = sentences.slice(splitAt).join(" ").trim();
  if (!left || !right) return [cleaned];
  if (left.length < 26 || right.length < 26) return [cleaned];
  return [left, right];
}

function _lecturasAgentIsFullscreenActive() {
  const refs = lecturasAgentViewerState.refs;
  const fsElement = document.fullscreenElement;
  if (!refs?.modal || !fsElement) return false;
  return fsElement === refs.modal || refs.modal.contains(fsElement);
}

async function _lecturasAgentToggleFullscreen() {
  const refs = lecturasAgentViewerState.refs;
  const target = refs?.panel || refs?.modal || null;
  if (!target || !document.fullscreenEnabled) return false;
  try {
    if (_lecturasAgentIsFullscreenActive()) {
      await document.exitFullscreen();
    } else {
      await target.requestFullscreen();
    }
  } catch (_) {
    return false;
  }
  return true;
}

function _lecturasAgentRenderCurrentSlide() {
  const refs = lecturasAgentViewerState.refs;
  if (!refs) return;
  const slide = lecturasAgentViewerState.slides[lecturasAgentViewerState.currentIndex];
  if (!slide) return;
  const isCover = slide?.kind === "cover";
  refs.counter.textContent = `${lecturasAgentViewerState.currentIndex + 1} / ${lecturasAgentViewerState.slides.length}`;
  const bubbleParts = _lecturasAgentSplitBubbleText(slide.text || "");
  const fallbackParts = bubbleParts.length ? bubbleParts : [String(slide.text || "").trim() || "(Sin contenido)"];
  refs.pageText.className = `lecturas-asc-agent-page-text ${fallbackParts.length > 1 ? "is-multi" : "is-single"}`;
  const storyTextHtml = fallbackParts.map((partText, partIdx) => {
    const _idx = partIdx; // conserva firma por compatibilidad
    void _idx;
    const classes = [
      "lecturas-asc-agent-story-text-block",
      "is-side-left",
      "is-accent-3",
      "is-text-plain"
    ];
    return `
      <section class="${classes.join(" ")}">
        <p>${_lecturasAgentSafeHtml(partText)}</p>
      </section>
    `;
  }).join("");
  refs.pageText.innerHTML = isCover
    ? `<section class="lecturas-asc-agent-story-text-block is-side-left is-accent-3 is-text-plain"><p><strong>${_lecturasAgentSafeHtml(String(lecturasAgentViewerState.payload?.titulo || "Portada"))}</strong></p></section>`
    : storyTextHtml;
  refs.prev.disabled = lecturasAgentViewerState.currentIndex <= 0;
  refs.next.disabled = lecturasAgentViewerState.currentIndex >= lecturasAgentViewerState.slides.length - 1;
  const canvas = refs.storyCanvas;
  if (canvas) canvas.classList.remove("is-cover-slide");
  const status = String(slide.imageStatus || "idle");
  if (status === "ready" && slide.imageUrl) {
    if (canvas) {
      canvas.style.setProperty("--lecturas-asc-agent-story-image", `url("${_lecturasAgentCssUrl(slide.imageUrl)}")`);
      canvas.classList.remove("is-loading", "is-error");
    }
    refs.imageWrap.innerHTML = "";
  } else if (status === "error") {
    if (canvas) {
      canvas.style.setProperty("--lecturas-asc-agent-story-image", "none");
      canvas.classList.remove("is-loading");
      canvas.classList.add("is-error");
    }
    refs.imageWrap.innerHTML = `<div class="lecturas-asc-agent-image-state is-error"><p>Imagen no disponible en storage para este párrafo.</p></div>`;
  } else {
    if (canvas) {
      canvas.style.setProperty("--lecturas-asc-agent-story-image", "none");
      canvas.classList.remove("is-error");
      canvas.classList.add("is-loading");
    }
    refs.imageWrap.innerHTML = `<div class="lecturas-asc-agent-image-state"><span class="lecturas-asc-agent-spinner"></span><p>Buscando imagen en storage...</p></div>`;
  }
  const liveState = _lecturasAgentGetLiveStateForCurrent();
  const liveReading = liveState === "playing" || liveState === "starting";
  const autoReadActive = lecturasAgentViewerState.autoReadActive === true || liveReading;
  const fullscreenActive = _lecturasAgentIsFullscreenActive();
  const fullscreenSupported = document.fullscreenEnabled && typeof refs?.panel?.requestFullscreen === "function";
  const menuExpanded = lecturasAgentViewerState.menuOpen === true;
  refs.imageActions.innerHTML = `
    <button type="button" class="lecturas-asc-agent-read ${autoReadActive ? "is-active" : ""}" data-action="auto-read" aria-label="${autoReadActive ? "Pausar lectura con Gemini Live" : "Leer con Gemini Live"}">
      <i class="fas ${autoReadActive ? "fa-pause" : "fa-play"}" aria-hidden="true"></i>
    </button>
    <button type="button" class="lecturas-asc-agent-fullscreen" data-action="toggle-fullscreen" aria-label="${fullscreenActive ? "Salir de pantalla completa" : "Pantalla completa"}" ${fullscreenSupported ? "" : "disabled"}>
      <i class="fas ${fullscreenActive ? "fa-compress" : "fa-expand"}" aria-hidden="true"></i>
    </button>
    <button type="button" class="lecturas-asc-agent-sections-toggle" data-action="toggle-sections-menu" aria-label="Mostrar menú de secciones" aria-expanded="${menuExpanded ? "true" : "false"}">
      <i class="fas fa-layer-group" aria-hidden="true"></i>
    </button>
  `;
  _lecturasAgentRenderDots();
  _lecturasAgentRenderSectionsUi();
}

function _lecturasAgentSetSlide(index = 0, options = {}) {
  const total = lecturasAgentViewerState.slides.length;
  if (!total) return;
  const manualChange = options?.manual === true;
  const hasLiveController = typeof window.cbControlLecturaGeminiLive === "function";
  const shouldRestartLiveAndSpeak = manualChange && lecturasAgentViewerState.autoReadActive === true && !hasLiveController;
  if (options?.manual === true) {
    _lecturasAgentInterruptPlaybackForManualNavigation();
  }
  const next = Math.max(0, Math.min(Number(index) || 0, total - 1));
  lecturasAgentViewerState.currentIndex = next;
  _lecturasAgentRenderCurrentSlide();
  if (shouldRestartLiveAndSpeak) {
    const navToken = Number((lecturasAgentViewerState.manualNavToken || 0) + 1);
    const expectedIndex = next;
    lecturasAgentViewerState.manualNavToken = navToken;
    _lecturasAgentRestartLiveForManualNavigation(navToken).finally(() => {
      if (Number(navToken || 0) !== Number(lecturasAgentViewerState.manualNavToken || 0)) return;
      if (!_lecturasAgentViewerIsOpen()) return;
      if (Number(lecturasAgentViewerState.currentIndex || 0) !== Number(expectedIndex || 0)) return;
      if (lecturasAgentViewerState.autoReadActive !== true) return;
      _lecturasAgentSpeakCurrentSlide({ restart: true });
    });
  }
}

function _lecturasAgentGetLiveStateForCurrent() {
  const getter = window.cbGetLecturaGeminiLiveState;
  const payload = lecturasAgentViewerState.payload;
  if (typeof getter !== "function" || !payload?.id || !payload?.sourceCollection) return "idle";
  try {
    return String(getter({ id: payload.id, coleccion: payload.sourceCollection })?.state || "idle");
  } catch (_) {
    return "idle";
  }
}

function _lecturasAgentClearAutoReadTimer() {
  if (lecturasAgentViewerState.autoReadAdvanceTimer) clearTimeout(lecturasAgentViewerState.autoReadAdvanceTimer);
  lecturasAgentViewerState.autoReadAdvanceTimer = null;
}

function _lecturasAgentInterruptPlaybackForManualNavigation() {
  lecturasAgentViewerState.manualReadSpeaking = false;
  lecturasAgentViewerState.autoReadSpeaking = false;
  lecturasAgentViewerState.autoReadSpeakSeq += 1;
  lecturasAgentViewerState.autoReadLockedUntil = 0;
  _lecturasAgentClearAutoReadTimer();
  _clearAgentSpeechPlaybackTimer();
  _resetAgentSpeechPlaybackCallbacks();
  try { _detenerAudioWorkflowPlay(); } catch (_) { }
}

async function _lecturasAgentRestartLiveForManualNavigation(expectedToken = 0) {
  if (!_lecturasAgentViewerIsOpen()) return false;
  if (lecturasAgentViewerState.autoReadActive !== true) return false;
  try {
    await iniciarGeminiLiveUnidad({ withMic: false, forceRestart: true });
  } catch (_) {
    return false;
  }
  return Number(expectedToken || 0) === Number(lecturasAgentViewerState.manualNavToken || 0);
}

function _lecturasAgentStopAutoRead(options = {}) {
  const silent = options?.silent === true;
  lecturasAgentViewerState.autoReadActive = false;
  lecturasAgentViewerState.autoReadRunId += 1;
  lecturasAgentViewerState.autoReadSpeaking = false;
  lecturasAgentViewerState.manualReadSpeaking = false;
  lecturasAgentViewerState.autoReadSpeakSeq += 1;
  lecturasAgentViewerState.autoReadLockedUntil = 0;
  _lecturasAgentClearAutoReadTimer();
  // Corta inmediatamente cualquier audio en curso (Gemini Live)
  // para que el botón pause detenga la lectura al instante.
  try { _detenerAudioWorkflowPlay(); } catch (_) { }
  const utter = lecturasAgentViewerState.autoReadUtterance;
  lecturasAgentViewerState.autoReadUtterance = null;
  try { if (utter) utter.onend = utter.onerror = utter.onstart = null; } catch (_) { }
  _clearAgentSpeechPlaybackTimer();
  _resetAgentSpeechPlaybackCallbacks();
  try {
    const controller = window.cbControlLecturaGeminiLive;
    const payload = lecturasAgentViewerState.payload;
    if (typeof controller === "function" && payload?.id && payload?.sourceCollection) {
      controller({ id: payload.id, coleccion: payload.sourceCollection }, { stop: true }).catch(() => { });
    }
  } catch (_) { }
  if (!silent) _lecturasAgentRenderCurrentSlide();
}

function _lecturasAgentSpeakViewerText(text = "", options = {}) {
  const textoPlano = String(text || "").replace(/\s+/g, " ").trim();
  if (!textoPlano) return false;
  const {
    cancelarPrevio = true,
    onPlaybackStart = null,
    onPlaybackEnd = null,
    onPlaybackError = null
  } = options || {};
  let finished = false;
  let safetyTimer = null;
  const clearSafety = () => {
    if (!safetyTimer) return;
    clearTimeout(safetyTimer);
    safetyTimer = null;
  };
  const finishOk = () => {
    if (finished) return;
    finished = true;
    clearSafety();
    if (typeof onPlaybackEnd === "function") {
      try { onPlaybackEnd(); } catch (_) { }
    }
  };
  const finishError = (err = null) => {
    if (finished) return;
    finished = true;
    clearSafety();
    if (typeof onPlaybackError === "function") {
      try { onPlaybackError(err); } catch (_) { }
    }
  };
  // Safety net amplio: no decide fin por longitud de párrafo, solo evita bloqueo infinito.
  safetyTimer = setTimeout(() => {
    finishError(new Error("gemini_live_turn_timeout"));
  }, 120000);
  const handled = hablarAgenteUnidad(textoPlano, {
    cancelarPrevio,
    withMic: false,
    forceRestart: false,
    onPlaybackStart: () => {
      if (typeof onPlaybackStart === "function") {
        try { onPlaybackStart(); } catch (_) { }
      }
    },
    onPlaybackEnd: () => finishOk(),
    onPlaybackError: (err) => finishError(err)
  });
  if (handled === false) {
    finishError(new Error("gemini_live_unavailable"));
    return false;
  }
  return true;
}

function _lecturasAgentSpeakSlideOnce() {
  if (!_lecturasAgentViewerIsOpen()) return false;
  const slide = lecturasAgentViewerState.slides[lecturasAgentViewerState.currentIndex];
  const text = String(slide?.text || "").replace(/\s+/g, " ").trim();
  if (!text) return false;
  lecturasAgentViewerState.manualReadSpeaking = true;
  const handled = _lecturasAgentSpeakViewerText(text, {
    cancelarPrevio: true,
    onPlaybackStart: () => {
      lecturasAgentViewerState.manualReadSpeaking = true;
    },
    onPlaybackEnd: () => {
      lecturasAgentViewerState.manualReadSpeaking = false;
    },
    onPlaybackError: () => {
      lecturasAgentViewerState.manualReadSpeaking = false;
    }
  });
  if (handled === false) {
    lecturasAgentViewerState.manualReadSpeaking = false;
    return false;
  }
  return true;
}

function _lecturasAgentHandleViewerVoiceCommand(transcripcion = "") {
  if (!_lecturasAgentViewerIsOpen()) return false;
  const norm = _normalizarTexto(transcripcion);
  if (!norm) return false;

  if (/\b(cerrar|cierra|salir|terminar)\b/.test(norm) && /\b(visor|lectura|modal|pantalla|agente)?\b/.test(norm)) {
    window.cbCloseLecturasAgentViewer?.();
    return true;
  }
  if (/\b(pausa|pausar|deten|detener|alto|stop)\b/.test(norm)) {
    _lecturasAgentStopAutoRead();
    return true;
  }
  if (/\b(anterior|previo|atras|atrás|retrocede|regresa)\b/.test(norm)) {
    _lecturasAgentSetSlide(lecturasAgentViewerState.currentIndex - 1, { manual: true });
    return true;
  }
  if (/\b(siguiente|avanza|adelante)\b/.test(norm)) {
    _lecturasAgentSetSlide(lecturasAgentViewerState.currentIndex + 1, { manual: true });
    return true;
  }
  if (/\b(releer|repite|repetir)\b/.test(norm) || (/^(leer|lee)$/.test(norm) && !/\blectura\b/.test(norm))) {
    return true;
  }
  if (/\b(leer|lee)\b/.test(norm) && /\b(parrafo|párrafo|actual)\b/.test(norm)) {
    return true;
  }
  if ((/\b(lectura|lectura completa)\b/.test(norm) && /\b(lee|leer|inicia|iniciar)\b/.test(norm)) || /\blectura automatica\b/.test(norm)) {
    return true;
  }
  return false;
}

function _lecturasAgentAdvanceAfterPlayback(runId = 0) {
  if (!lecturasAgentViewerState.autoReadActive) return;
  if (Number(runId || 0) !== Number(lecturasAgentViewerState.autoReadRunId || 0)) return;
  if (lecturasAgentViewerState.currentIndex >= lecturasAgentViewerState.slides.length - 1) {
    _lecturasAgentStopAutoRead();
    return;
  }
  _lecturasAgentClearAutoReadTimer();
  lecturasAgentViewerState.autoReadAdvanceTimer = setTimeout(() => {
    if (!lecturasAgentViewerState.autoReadActive) return;
    if (Number(runId || 0) !== Number(lecturasAgentViewerState.autoReadRunId || 0)) return;
    _lecturasAgentSetSlide(lecturasAgentViewerState.currentIndex + 1, { manual: false });
    _lecturasAgentSpeakCurrentSlide({ restart: true });
  }, 360);
}

function _lecturasAgentSpeakCurrentSlide(options = {}) {
  if (lecturasAgentViewerState.autoReadActive !== true) return;
  const restart = options?.restart === true;
  if (!restart && lecturasAgentViewerState.autoReadSpeaking) return;
  const runId = Number(lecturasAgentViewerState.autoReadRunId || 0);
  const expectedIndex = Number(lecturasAgentViewerState.currentIndex || 0);
  const speakSeq = Number((lecturasAgentViewerState.autoReadSpeakSeq || 0) + 1);
  lecturasAgentViewerState.autoReadSpeakSeq = speakSeq;
  const slide = lecturasAgentViewerState.slides[lecturasAgentViewerState.currentIndex];
  if (!slide) return;
  const text = String(slide.text || "").replace(/\s+/g, " ").trim();
  if (!text) {
    _lecturasAgentAdvanceAfterPlayback(runId);
    return;
  }
  lecturasAgentViewerState.autoReadSpeaking = true;
  const handled = _lecturasAgentSpeakViewerText(text, {
    cancelarPrevio: true,
    onPlaybackStart: () => {
      if (!lecturasAgentViewerState.autoReadActive) return;
      if (Number(runId || 0) !== Number(lecturasAgentViewerState.autoReadRunId || 0)) return;
      if (Number(speakSeq || 0) !== Number(lecturasAgentViewerState.autoReadSpeakSeq || 0)) return;
      if (Number(expectedIndex || 0) !== Number(lecturasAgentViewerState.currentIndex || 0)) return;
      lecturasAgentViewerState.autoReadLockedUntil = Date.now() + 180;
    },
    onPlaybackEnd: () => {
      if (!lecturasAgentViewerState.autoReadActive) return;
      if (Number(runId || 0) !== Number(lecturasAgentViewerState.autoReadRunId || 0)) return;
      if (Number(speakSeq || 0) !== Number(lecturasAgentViewerState.autoReadSpeakSeq || 0)) return;
      if (Number(expectedIndex || 0) !== Number(lecturasAgentViewerState.currentIndex || 0)) return;
      lecturasAgentViewerState.autoReadSpeaking = false;
      _lecturasAgentAdvanceAfterPlayback(runId);
    },
    onPlaybackError: () => {
      if (!lecturasAgentViewerState.autoReadActive) return;
      if (Number(runId || 0) !== Number(lecturasAgentViewerState.autoReadRunId || 0)) return;
      if (Number(speakSeq || 0) !== Number(lecturasAgentViewerState.autoReadSpeakSeq || 0)) return;
      lecturasAgentViewerState.autoReadSpeaking = false;
      _lecturasAgentStopAutoRead();
    }
  });
  if (handled === false) {
    lecturasAgentViewerState.autoReadSpeaking = false;
    _lecturasAgentStopAutoRead();
  }
}

async function _lecturasAgentToggleAutoRead() {
  const controller = window.cbControlLecturaGeminiLive;
  const payload = lecturasAgentViewerState.payload;
  if (typeof controller !== "function" || !payload?.id || !payload?.sourceCollection) {
    alert("La lectura con Gemini Flash Live no está disponible en este momento.");
    return;
  }
  const liveState = _lecturasAgentGetLiveStateForCurrent();
  try {
    if (liveState === "playing" || liveState === "starting") {
      await controller({ id: payload.id, coleccion: payload.sourceCollection }, { stop: true });
      lecturasAgentViewerState.autoReadActive = false;
      _lecturasAgentRenderCurrentSlide();
      return;
    }
    const result = await controller({ id: payload.id, coleccion: payload.sourceCollection });
    lecturasAgentViewerState.autoReadActive = !!result?.ok && (result?.state === "playing" || result?.state === "starting");
    _lecturasAgentRenderCurrentSlide();
  } catch (_) {
    alert("No se pudo iniciar la lectura con Gemini Flash Live.");
  }
}

function _lecturasAgentUpdateSlideFromCached(slide = {}, cachedUrl = "") {
  const url = String(cachedUrl || "").trim();
  if (!url) return false;
  slide.imageUrl = url;
  slide.imageStatus = "ready";
  return true;
}

async function _lecturasAgentEnsureSlideImage(slide = {}, idx = 0, token = 0, options = {}) {
  const forceRegenerate = options?.forceRegenerate === true;
  const cacheKey = String(slide?.cacheKey || "").trim();
  if (!forceRegenerate && cacheKey) {
    const fromCache = String(lecturasAgentViewerState.memCache.get(cacheKey) || "").trim();
    if (_lecturasAgentUpdateSlideFromCached(slide, fromCache)) return true;
  }
  if (!forceRegenerate) {
    const storageUrl = await _lecturasAgentTryReadStorageUrl(slide);
    if (storageUrl) {
      slide.imageUrl = storageUrl;
      slide.imageStatus = "ready";
      if (cacheKey) {
        lecturasAgentViewerState.memCache.set(cacheKey, storageUrl);
        _lecturasAgentPersistCacheStore();
      }
      return true;
    }
  }
  // En Lecturas Game no se generan imágenes: solo se muestran si ya existen en cache/storage.
  slide.imageStatus = "error";
  slide.imageUrl = "";
  if (idx === lecturasAgentViewerState.currentIndex) _lecturasAgentRenderCurrentSlide();
  return false;
}

async function _lecturasAgentGenerateQueue(token = 0, options = {}) {
  const slides = lecturasAgentViewerState.slides;
  if (!Array.isArray(slides) || !slides.length) return;
  let pending = slides
    .map((slide, idx) => ({ slide, idx }))
    .filter((it) => options?.onlyIndex == null
      ? !it.slide.imageUrl || options?.forceRegenerate === true
      : it.idx === Number(options.onlyIndex));
  if (options?.onlyIndex == null) {
    const current = Number(lecturasAgentViewerState.currentIndex || 0);
    pending = pending.sort((a, b) => {
      const aCur = a.idx === current ? 1 : 0;
      const bCur = b.idx === current ? 1 : 0;
      return bCur - aCur;
    });
  }
  if (!pending.length) return;
  const concurrency = options?.onlyIndex != null ? 1 : 2;
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, pending.length) }).map(async () => {
    while (cursor < pending.length) {
      if (token !== lecturasAgentViewerState.token) return;
      const pos = cursor++;
      const { slide, idx } = pending[pos];
      try {
        await _lecturasAgentEnsureSlideImage(slide, idx, token, {
          forceRegenerate: options?.forceRegenerate === true
        });
      } catch (_) {
        if (token !== lecturasAgentViewerState.token) return;
        slide.imageStatus = "error";
      }
      if (idx === lecturasAgentViewerState.currentIndex) _lecturasAgentRenderCurrentSlide();
    }
  });
  await Promise.allSettled(workers);
}

function _lecturasAgentEnsureModal() {
  if (lecturasAgentViewerState.refs?.modal) return lecturasAgentViewerState.refs;
  let modal = document.getElementById("lecturasASCAgent");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "lecturasASCAgent";
    modal.className = "lecturas-asc-agent-modal";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <div class="lecturas-asc-agent-backdrop" data-action="close"></div>
      <section class="lecturas-asc-agent-panel" role="dialog" aria-modal="true" aria-label="Lector de lecturas del agente">
        <header class="lecturas-asc-agent-head">
          <div class="lecturas-asc-agent-head-meta">
            <h3 id="lecturasASCAgentTitle" class="lecturas-asc-agent-title">Lectura</h3>
          </div>
          <button type="button" class="lecturas-asc-agent-close" data-action="close" aria-label="Cerrar modal">&times;</button>
        </header>
        <div class="lecturas-asc-agent-story-shell">
          <div id="lecturasASCAgentStoryCanvas" class="lecturas-asc-agent-story-canvas">
            <div class="lecturas-asc-agent-story-scrim" aria-hidden="true"></div>
            <div id="lecturasASCAgentImageWrap" class="lecturas-asc-agent-story-image-state" aria-live="polite"></div>
            <div class="lecturas-asc-agent-story-hud lecturas-asc-agent-story-hud-top">
              <span id="lecturasASCAgentCounter" class="lecturas-asc-agent-counter"></span>
              <div id="lecturasASCAgentImageActions" class="lecturas-asc-agent-image-actions"></div>
            </div>
            <div id="lecturasASCAgentSectionsMenu" class="lecturas-asc-agent-sections-menu" hidden></div>
            <aside id="lecturasASCAgentSectionsPanel" class="lecturas-asc-agent-sections-panel" hidden></aside>
            <article class="lecturas-asc-agent-story-content">
              <div id="lecturasASCAgentPageText" class="lecturas-asc-agent-page-text"></div>
            </article>
            <footer class="lecturas-asc-agent-foot">
              <div id="lecturasASCAgentDots" class="lecturas-asc-agent-dots"></div>
            </footer>
          </div>
          <button type="button" id="lecturasASCAgentPrev" class="lecturas-asc-agent-nav is-prev" aria-label="Párrafo anterior"><i class="fas fa-chevron-left" aria-hidden="true"></i></button>
          <button type="button" id="lecturasASCAgentNext" class="lecturas-asc-agent-nav is-next" aria-label="Párrafo siguiente"><i class="fas fa-chevron-right" aria-hidden="true"></i></button>
        </div>
      </section>
    `;
    document.body.appendChild(modal);
  }
  const refs = {
    modal,
    panel: modal.querySelector(".lecturas-asc-agent-panel"),
    title: modal.querySelector("#lecturasASCAgentTitle"),
    storyCanvas: modal.querySelector("#lecturasASCAgentStoryCanvas"),
    close: modal.querySelector(".lecturas-asc-agent-close"),
    prev: modal.querySelector("#lecturasASCAgentPrev"),
    next: modal.querySelector("#lecturasASCAgentNext"),
    imageWrap: modal.querySelector("#lecturasASCAgentImageWrap"),
    imageActions: modal.querySelector("#lecturasASCAgentImageActions"),
    counter: modal.querySelector("#lecturasASCAgentCounter"),
    pageText: modal.querySelector("#lecturasASCAgentPageText"),
    dots: modal.querySelector("#lecturasASCAgentDots"),
    sectionsMenu: modal.querySelector("#lecturasASCAgentSectionsMenu"),
    sectionsPanel: modal.querySelector("#lecturasASCAgentSectionsPanel")
  };
  if (refs.prev) refs.prev.innerHTML = `<i class="fas fa-chevron-left" aria-hidden="true"></i>`;
  if (refs.next) refs.next.innerHTML = `<i class="fas fa-chevron-right" aria-hidden="true"></i>`;
  modal.addEventListener("click", (e) => {
    const closeAction = e.target?.closest?.("[data-action='close']");
    if (closeAction) {
      window.cbCloseLecturasAgentViewer?.();
      return;
    }
    const dot = e.target?.closest?.("[data-dot-index]");
    if (dot) {
      _lecturasAgentSetSlide(Number(dot.dataset.dotIndex || 0), { manual: true });
      return;
    }
    const autoReadBtn = e.target?.closest?.("[data-action='auto-read']");
    if (autoReadBtn) {
      Promise.resolve(_lecturasAgentToggleAutoRead()).catch(() => { });
      return;
    }
    const fullscreenBtn = e.target?.closest?.("[data-action='toggle-fullscreen']");
    if (fullscreenBtn) {
      _lecturasAgentToggleFullscreen().then(() => {
        if (_lecturasAgentViewerIsOpen()) _lecturasAgentRenderCurrentSlide();
      }).catch(() => { });
      return;
    }
    const menuBtn = e.target?.closest?.("[data-action='toggle-sections-menu']");
    if (menuBtn) {
      const nextOpen = lecturasAgentViewerState.menuOpen !== true;
      lecturasAgentViewerState.menuOpen = nextOpen;
      _lecturasAgentSetVisibleSection("");
      _lecturasAgentRenderCurrentSlide();
      return;
    }
    const closeSectionsPanelBtn = e.target?.closest?.("[data-action='close-sections-panel']");
    if (closeSectionsPanelBtn) {
      _lecturasAgentSetVisibleSection("");
      _lecturasAgentRenderCurrentSlide();
      return;
    }
    const sectionBtn = e.target?.closest?.("[data-action='toggle-section']");
    if (sectionBtn) {
      const key = String(sectionBtn.dataset.section || "").trim();
      if (key && Object.prototype.hasOwnProperty.call(lecturasAgentViewerState.visibleSections, key)) {
        const hasContent = String(lecturasAgentViewerState.sections?.[key] || "").trim().length > 0;
        if (hasContent) {
          _lecturasAgentSetVisibleSection(key);
          lecturasAgentViewerState.menuOpen = false;
          _lecturasAgentRenderCurrentSlide();
        }
      }
      return;
    }
    if (lecturasAgentViewerState.menuOpen) {
      const insideMenu = e.target?.closest?.("#lecturasASCAgentSectionsMenu, [data-action='toggle-sections-menu'], #lecturasASCAgentSectionsPanel");
      if (!insideMenu) {
        lecturasAgentViewerState.menuOpen = false;
        _lecturasAgentRenderCurrentSlide();
      }
    }
  });
  refs.prev?.addEventListener("click", () => _lecturasAgentSetSlide(lecturasAgentViewerState.currentIndex - 1, { manual: true }));
  refs.next?.addEventListener("click", () => _lecturasAgentSetSlide(lecturasAgentViewerState.currentIndex + 1, { manual: true }));
  if (!lecturasAgentViewerState.keyHandler) {
    lecturasAgentViewerState.keyHandler = (e) => {
      if (lecturasAgentViewerState.refs?.modal?.getAttribute("aria-hidden") !== "false") return;
      if (e.key === "Escape") {
        e.preventDefault();
        window.cbCloseLecturasAgentViewer?.();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        _lecturasAgentSetSlide(lecturasAgentViewerState.currentIndex - 1, { manual: true });
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        _lecturasAgentSetSlide(lecturasAgentViewerState.currentIndex + 1, { manual: true });
      }
    };
    document.addEventListener("keydown", lecturasAgentViewerState.keyHandler);
  }
  if (!lecturasAgentViewerState.fullscreenHandler) {
    lecturasAgentViewerState.fullscreenHandler = () => {
      if (_lecturasAgentViewerIsOpen()) _lecturasAgentRenderCurrentSlide();
    };
    document.addEventListener("fullscreenchange", lecturasAgentViewerState.fullscreenHandler);
  }
  if (!lecturasAgentViewerState.liveStateHandler) {
    lecturasAgentViewerState.liveStateHandler = () => {
      if (_lecturasAgentViewerIsOpen()) _lecturasAgentRenderCurrentSlide();
    };
    window.addEventListener("cb:lectura-live-state", lecturasAgentViewerState.liveStateHandler);
  }
  lecturasAgentViewerState.refs = refs;
  return refs;
}

window.cbIsAgentExclusiveMode = function cbIsAgentExclusiveMode() {
  return _agenteUnidadEnModoExclusivo();
};

window.cbOpenLecturasAgentViewer = function cbOpenLecturasAgentViewer(payload = {}) {
  const refs = _lecturasAgentEnsureModal();
  _lecturasAgentLoadCacheStore();
  const rawHtml = String(payload?.htmlLectura || payload?.contenidoHTML || "").trim() || "<p>(Sin contenido)</p>";
  const prepared = _lecturasAgentBuildViewerContent(rawHtml, payload || {});
  const normalized = _lecturasAgentNormalizeParagraphHtml(prepared.narrativeHtml || rawHtml);
  const sourceCollection = String(payload?.sourceCollection || payload?.coleccion || "").trim() || "lecturasNuevas";
  const title = String(payload?.titulo || payload?.tema || "Lectura sin título").trim();
  lecturasAgentViewerState.token += 1;
  const token = lecturasAgentViewerState.token;
  lecturasAgentViewerState.payload = {
    id: String(payload?.id || "").trim(),
    sourceCollection,
    titulo: title,
    userId: String(payload?.userId || payload?.uid || payload?.ownerId || "").trim(),
    uid: String(payload?.uid || payload?.userId || payload?.ownerId || "").trim(),
    ownerId: String(payload?.ownerId || payload?.userId || payload?.uid || "").trim(),
    ownerUid: String(payload?.ownerUid || payload?.ownerId || payload?.userId || payload?.uid || "").trim()
  };
  const narrativeSlides = normalized.length
    ? normalized.map((item, idx) => {
      const paragraphHash = _lecturasAgentHash(item.text);
      const cacheKey = `${sourceCollection}:${lecturasAgentViewerState.payload.id}:${paragraphHash}`;
      const cached = String(lecturasAgentViewerState.memCache.get(cacheKey) || "").trim();
      return {
        id: `${idx + 1}`,
        kind: "paragraph",
        html: item.html,
        text: item.text,
        paragraphHash,
        cacheKey,
        storagePath: _lecturasAgentBuildStoragePath(lecturasAgentViewerState.payload, { paragraphHash, text: item.text }),
        imageUrl: cached,
        imageStatus: cached ? "ready" : "idle"
      };
    })
    : [{
      id: "1",
      kind: "paragraph",
      html: "<p>(Sin contenido)</p>",
      text: "",
      paragraphHash: "sin_parrafo",
      cacheKey: "",
      storagePath: "",
      imageUrl: "",
      imageStatus: "error"
    }];
  const coverTitle = title || "Lectura";
  const coverParagraphHash = "portada";
  const coverCacheKey = `${sourceCollection}:${lecturasAgentViewerState.payload.id}:${coverParagraphHash}`;
  const coverCached = String(lecturasAgentViewerState.memCache.get(coverCacheKey) || "").trim();
  const coverSlide = {
    id: "cover",
    kind: "cover",
    html: `<h2>${_lecturasAgentSafeHtml(coverTitle)}</h2>`,
    text: coverTitle,
    coverTitle,
    paragraphHash: coverParagraphHash,
    cacheKey: coverCacheKey,
    storagePath: _lecturasAgentBuildStoragePath(lecturasAgentViewerState.payload, { paragraphHash: coverParagraphHash, text: "portada" }),
    imageUrl: coverCached,
    imageStatus: coverCached ? "ready" : "idle"
  };
  lecturasAgentViewerState.slides = [coverSlide, ...narrativeSlides];
  lecturasAgentViewerState.sections = {
    preguntas: String(prepared.sections?.preguntas || "").trim(),
    bibliografia: String(prepared.sections?.bibliografia || "").trim(),
    sinonimos: String(prepared.sections?.sinonimos || "").trim()
  };
  lecturasAgentViewerState.visibleSections = { preguntas: false, bibliografia: false, sinonimos: false };
  lecturasAgentViewerState.menuOpen = false;
  lecturasAgentViewerState.currentIndex = 0;
  if (refs.sectionsPanel) {
    refs.sectionsPanel.hidden = true;
    refs.sectionsPanel.innerHTML = "";
  }
  if (refs.sectionsMenu) refs.sectionsMenu.hidden = true;
  _lecturasAgentStopAutoRead({ silent: true });
  refs.title.textContent = title;
  refs.modal.classList.add("is-open");
  refs.modal.setAttribute("aria-hidden", "false");
  _lecturasAgentRenderCurrentSlide();
  _lecturasAgentGenerateQueue(token).catch(() => { });
  return true;
};

window.cbCloseLecturasAgentViewer = function cbCloseLecturasAgentViewer() {
  const refs = _lecturasAgentEnsureModal();
  lecturasAgentViewerState.token += 1;
  _lecturasAgentStopAutoRead({ silent: true });
  lecturasAgentViewerState.menuOpen = false;
  lecturasAgentViewerState.visibleSections = { preguntas: false, bibliografia: false, sinonimos: false };
  if (refs.sectionsPanel) {
    refs.sectionsPanel.hidden = true;
    refs.sectionsPanel.innerHTML = "";
  }
  if (refs.sectionsMenu) refs.sectionsMenu.hidden = true;
  if (_lecturasAgentIsFullscreenActive()) {
    document.exitFullscreen().catch(() => { });
  }
  refs.modal.classList.remove("is-open");
  refs.modal.setAttribute("aria-hidden", "true");
  return true;
};

async function loadInitialData() {
  const [ascRows, nuevasRows] = await Promise.all([
    loadPublishedByCollection("lecturasASC"),
    loadPublishedByCollection("lecturasNuevas")
  ]);

  state.allLecturas = [...ascRows, ...nuevasRows]
    .filter((item) => item.published === true && item.id && item.sourceCollection)
    .sort((a, b) => {
      const gA = Number(a.grado);
      const gB = Number(b.grado);
      if (Number.isFinite(gA) && Number.isFinite(gB) && gA !== gB) return gA - gB;
      return String(a.titulo || "").localeCompare(String(b.titulo || ""), "es", { sensitivity: "base" });
    });

  state.lecturaByKey = new Map(state.allLecturas.map((row) => [lecturaKey(row), row]));
}

function bindDomRefs() {
  els.gameHero = document.getElementById("gameHero");
  els.lecturaScene = document.getElementById("lecturaScene");
  els.lecturaCards = document.getElementById("lecturaCards");
  els.lecturaEmpty = document.getElementById("lecturaEmpty");
  els.modeModal = document.getElementById("lecturasGameModeModal");
  els.modeModalBody = document.getElementById("lecturasGameModeBody");
}

function maybeAutoOpenGameDebug() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    if (params.get("gameDebug") !== "1") return;
    window.__lecturasGameDebug = {
      forceWin: () => _lecturasGameForceWinForDebug(lecturasGameModeRuntime),
      getState: () => _lecturasGameBuildStateText(lecturasGameModeRuntime),
      forceFireMode: () => {
        _lecturasGameActivateFireMode(lecturasGameModeRuntime, performance.now());
        return _lecturasGameBuildStateText(lecturasGameModeRuntime);
      },
      queueSimFire: () => {
        lecturasGameModeRuntime.simFireCharging = true;
        lecturasGameModeRuntime.simFireChargeStartMs = performance.now();
        return _lecturasGameBuildStateText(lecturasGameModeRuntime);
      },
      releaseSimFire: () => {
        lecturasGameModeRuntime.simFireCharging = false;
        lecturasGameModeRuntime.simFireReleasePending = true;
        return _lecturasGameBuildStateText(lecturasGameModeRuntime);
      }
    };
    const sample = state.allLecturas[0] || {
      id: "debug-mini",
      sourceCollection: "lecturasASC",
      titulo: "Demo Protege al sinónimo",
      grado: "3",
      coverImage: "",
      raw: {
        imagenes: []
      },
      htmlLectura: `
        <p>En el bosque, una liebre feliz corría junto al río y miraba las montañas.</p>
        <p>La escuela del pueblo tenía una biblioteca con cuentos de animales, barcos y flores.</p>
      `,
      sinonimos: [
        { palabra: "RAPIDO", sinonimos: ["VELOZ", "LIGERO"] },
        { palabra: "FELIZ", sinonimos: ["ALEGRE", "CONTENTO"] }
      ]
    };
    setTimeout(() => {
      openGameModePlaceholder(sample).catch(() => { });
    }, 220);
  } catch (_) {
    // noop
  }
}

function maybeAutoOpenGameFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    const gameId = resolveForcedGameId(params.get("game") || "");
    if (!gameId) return false;

    const readingId = String(params.get("readingId") || "").trim();
    const collection = String(params.get("collection") || "").trim();
    const grade = String(params.get("grade") || "").trim();

    let lectura = null;
    if (readingId && collection) {
      const key = `${collection}:${readingId}`;
      lectura = state.lecturaByKey.get(key) || null;
    }

    if (!lectura && grade) {
      lectura = state.allLecturas.find((item) => String(item?.grado || "").trim() === grade) || null;
    }

    if (!lectura) {
      const autoStart = params.get("autoStart") === "1" || params.get("gameDebug") === "1";
      if (!autoStart) return false;
      lectura = state.allLecturas[0] || null;
    }

    if (!lectura) return false;

    setTimeout(() => {
      openGameModePlaceholder(lectura).catch(() => { });
    }, 250);
    return true;
  } catch (_) {
    return false;
  }
}

function maybeAutoOpenReaderFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    const mode = String(params.get("mode") || "").trim().toLowerCase();
    if (mode !== "asc") return false;

    const grade = String(params.get("grade") || "").trim();
    let lectura = null;
    if (grade) {
      lectura = state.allLecturas.find((item) => String(item?.grado || "").trim() === grade) || null;
    }
    if (!lectura) lectura = state.allLecturas[0] || null;
    if (!lectura) return false;

    setTimeout(() => {
      openReaderMode(lectura);
    }, 180);
    return true;
  } catch (_) {
    return false;
  }
}

async function _lecturasGamePrimeInitialCardCovers(lecturas = []) {
  const rows = Array.isArray(lecturas) ? lecturas : [];
  if (!rows.length) return;
  _lecturasGameLoadCardCoverCache();
  const initialRows = rows.slice(0, 24);
  await _lecturasGameEnsureAgentStorageIndex().catch(() => null);
  await hydrateCoverImages(initialRows, { concurrency: 4, timeoutMs: 850 });
  await _lecturasGamePrimeCardCoversFromSlides(initialRows).catch(() => false);
}

async function bootLecturasGame() {
  bindDomRefs();
  bindMainUiEvents();
  _lecturasGameRunOfflineMigrationV3Once().catch(() => { });
  _lecturasGameFlushQueuedScores().catch(() => { });
  _lecturasGameLoadCardCoverCache();

  try {
    await ensureRuntimeConfigLoaded();
  } catch (_) {
    // noop
  }

  try {
    if (navigator.onLine === false) throw new Error("offline_mode");
    await loadInitialData();
  } catch (error) {
    console.warn("[LecturasGame] Error cargando lecturas:", error);
    const offlineRows = await _lecturasGameLoadOfflineLecturas().catch(() => []);
    if (offlineRows.length) {
      state.allLecturas = offlineRows
        .filter((item) => item && item.id && item.sourceCollection)
        .sort((a, b) => String(a.titulo || "").localeCompare(String(b.titulo || ""), "es", { sensitivity: "base" }));
      state.lecturaByKey = new Map(state.allLecturas.map((row) => [lecturaKey(row), row]));
      renderScenes();
      if (els.lecturaEmpty) {
        els.lecturaEmpty.hidden = false;
        els.lecturaEmpty.textContent = "Modo offline: mostrando lecturas descargadas.";
      }
      return;
    }
    if (els.lecturaCards) els.lecturaCards.innerHTML = "";
    if (els.lecturaEmpty) {
      els.lecturaEmpty.hidden = false;
      els.lecturaEmpty.textContent = "No se pudieron cargar lecturas online ni offline.";
    }
    maybeAutoOpenGameDebug();
    return;
  }

  await _lecturasGamePrimeInitialCardCovers(state.allLecturas).catch((error) => {
    console.warn("[LecturasGame] Portadas iniciales sin priming completo:", error);
  });
  renderScenes();
  const openedFromUrl = maybeAutoOpenGameFromUrl();
  if (!openedFromUrl) {
    const openedReaderFromUrl = maybeAutoOpenReaderFromUrl();
    if (!openedReaderFromUrl) maybeAutoOpenGameDebug();
  }

  Promise.resolve()
    .then(() => hydrateCoverImages(state.allLecturas, { concurrency: 3, timeoutMs: 950 }))
    .then(() => _lecturasGamePrimeCardCoversFromSlides(state.allLecturas))
    .then(() => {
      renderScenes();
    })
    .catch((error) => {
      console.warn("[LecturasGame] No se pudieron hidratar portadas:", error);
    });
}

export function startLecturasGameBoot(options = {}) {
  bootLecturasGame(options).catch((err) => {
    console.error("[LecturasGame] Falló el arranque:", err);
  });
}

if (!window.__LECTURAS_GAME_NO_AUTO_BOOT__) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => startLecturasGameBoot(), { once: true });
  } else {
    startLecturasGameBoot();
  }
}
