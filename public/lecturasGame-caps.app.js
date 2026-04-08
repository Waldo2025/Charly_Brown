import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { firebaseWebConfig, assertFirebaseWebConfig } from "./firebase-web-config.js";
import * as Phaser from "./vendor/phaser/phaser.esm.js";

const GAME_ID = "caps";
const LOCAL_PROFILE_KEY = "cb_lecturas_game_caps_profile_v1";
const LOCAL_DEVICE_KEY = "cb_lecturas_game_caps_device_v1";
const FIRESTORE_COLLECTION = "lecturas_game_profiles_caps";

const GAME_MODE = Object.freeze({
  BOOT: "boot",
  INSTRUCTION: "instruction",
  COUNTDOWN: "countdown",
  PLAYING: "playing",
  WON_MISSION: "won_mission",
  LOST: "lost",
  WON_CAMPAIGN: "won_campaign",
  PAUSED: "paused"
});

const CANVAS_W = 1280;
const CANVAS_H = 720;
const PLAYER_RADIUS = 108;
const TOKEN_RADIUS = 38;
const TOPBAR_HEIGHT = 112;
const PLAYER_BASE_Y = CANVAS_H - 142;
const CAPS_SAFE_REMOTE_HOSTS = new Set([
  "firebasestorage.googleapis.com",
  "storage.googleapis.com",
  "www.gstatic.com"
]);

function sanitizeBgUrl(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("data:image/")) return raw;
  if (/^javascript:/i.test(raw)) return "";
  if (raw.startsWith("//")) return `${window.location.protocol}${raw}`;
  if (raw.startsWith("/")) return raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw, window.location.href);
      const host = String(parsed.hostname || "").toLowerCase();
      if (parsed.origin === window.location.origin) return parsed.toString();
      if (CAPS_SAFE_REMOTE_HOSTS.has(host) || host.endsWith(".googleapis.com") || host.endsWith(".gstatic.com")) {
        return parsed.toString();
      }
      return "";
    } catch (_) {
      return "";
    }
  }
  try {
    const abs = new URL(raw, window.location.href).toString();
    if (/^https?:\/\//i.test(abs)) return abs;
  } catch (_) {
    // no-op
  }
  return raw.replace(/^\.?\//, "/");
}

function readLaunchContext() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    const fromQuery = sanitizeBgUrl(params.get("bg") || "");
    const fromCache = sanitizeBgUrl(localStorage.getItem("cb_caps_bg_url_v1") || "");
    const bgUrl = fromQuery || fromCache;
    if (fromQuery) localStorage.setItem("cb_caps_bg_url_v1", fromQuery);
    const playModeRaw = String(params.get("playMode") || "").trim().toLowerCase();
    const playMode = playModeRaw === "pair" || playModeRaw === "pareja" ? "pair" : "solo";
    return { bgUrl, playMode };
  } catch (_) {
    return { bgUrl: "", playMode: "solo" };
  }
}

const CAPS_LAUNCH_CONTEXT = readLaunchContext();

function _capsSetPairRulesOverlay(title = "", body = "") {
  const box = document.getElementById("capsPairRulesBox");
  const titleEl = document.getElementById("capsPairRulesTitle");
  const bodyEl = document.getElementById("capsPairRulesBody");
  if (!box || !titleEl || !bodyEl) return;
  titleEl.textContent = String(title || "");
  bodyEl.textContent = String(body || "");
  box.hidden = false;
}

function _capsHidePairRulesOverlay() {
  const box = document.getElementById("capsPairRulesBox");
  if (box) box.hidden = true;
}

const MISSION_DATA = Object.freeze([
  {
    id: "ortografia",
    shortTitle: "Ortografía",
    title: "Misión 1 · Ortografía",
    subtitle: "Uso de mayúsculas en nombres propios",
    expectedLearning: "Reconocer que los nombres propios inician con mayúscula.",
    content: "Convenciones de escritura cotidiana.",
    process: "Compara mayúsculas, minúsculas y variaciones de estilo.",
    goal: 14,
    baseSpeed: 140,
    durationSec: 65,
    targetPool: ["Ana", "Luis", "María", "Carlos", "Sofía", "Pedro", "Lucía", "Diego"],
    wrongPool: ["ana", "luis", "mARÍA", "carlos", "sofia", "PEDRO", "luCía", "diego"]
  },
  {
    id: "expresion_escrita",
    shortTitle: "Expresión Escrita",
    title: "Misión 2 · Expresión Escrita",
    subtitle: "Relación sonoro-gráfica",
    expectedLearning: "Relacionar cómo suena un nombre con su escritura correcta.",
    content: "Convenciones de escritura cotidiana.",
    process: "Distingue grafías válidas del mismo nombre.",
    goal: 16,
    baseSpeed: 156,
    durationSec: 65,
    targetPool: ["Camila", "Gabriel", "Valentina", "Joaquín", "Natalia", "Martín", "Renata", "Emilio"],
    wrongPool: ["camila", "gabriell", "balentina", "joakin", "nataliaa", "martin", "rrenata", "emilioo"]
  },
  {
    id: "expresion_oral",
    shortTitle: "Expresión Oral",
    title: "Misión 3 · Expresión Oral",
    subtitle: "Descripción oral de personajes",
    expectedLearning: "Expresar ideas sobre personajes con claridad.",
    content: "Convenciones de escritura cotidiana.",
    process: "Identifica descripciones que nombran correctamente al personaje.",
    goal: 14,
    baseSpeed: 170,
    durationSec: 60,
    targetPool: ["La valiente Sara", "El curioso Tomás", "La artista Paula", "El líder Mateo", "La doctora Elena"],
    wrongPool: ["la valiente sara", "el Curioso tomás", "la artista paula", "el líder mateo", "la Doctora elena"]
  },
  {
    id: "gramatica",
    shortTitle: "Gramática",
    title: "Misión 4 · Gramática",
    subtitle: "Nombres propios en contexto",
    expectedLearning: "Identificar nombres propios en diferentes contextos.",
    content: "Convenciones de escritura cotidiana.",
    process: "Diferencia nombre propio y común en frases cortas.",
    goal: 18,
    baseSpeed: 182,
    durationSec: 70,
    targetPool: ["Juan corre", "Marta lee", "Santiago canta", "Valeria escribe", "Andrés juega"],
    wrongPool: ["juan corre", "marta lee", "santiago canta", "valeria escribe", "andrés Juega"]
  }
]);

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function randomFrom(arr = []) {
  if (!Array.isArray(arr) || !arr.length) return "";
  return arr[Math.floor(Math.random() * arr.length)] || "";
}

function shuffle(arr = []) {
  const out = Array.isArray(arr) ? [...arr] : [];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

function createDeviceId() {
  try {
    const existing = String(localStorage.getItem(LOCAL_DEVICE_KEY) || "").trim();
    if (existing) return existing;
    const next = `caps-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(LOCAL_DEVICE_KEY, next);
    return next;
  } catch (_) {
    return `caps-${Date.now().toString(36)}-fallback`;
  }
}

function defaultProfile() {
  return {
    gameId: GAME_ID,
    level: 1,
    missionIndex: 0,
    score: 0,
    bestScore: 0,
    gems: 0,
    played: 0,
    updatedAt: Date.now()
  };
}

function readLocalProfile(storageKey = LOCAL_PROFILE_KEY) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return defaultProfile();
    const parsed = JSON.parse(raw);
    return {
      ...defaultProfile(),
      ...(parsed && typeof parsed === "object" ? parsed : {})
    };
  } catch (_) {
    return defaultProfile();
  }
}

function writeLocalProfile(profile = {}, storageKey = LOCAL_PROFILE_KEY) {
  const merged = { ...defaultProfile(), ...(profile || {}), updatedAt: Date.now() };
  try {
    localStorage.setItem(storageKey, JSON.stringify(merged));
  } catch (_) {
    // no-op
  }
  return merged;
}

async function createCloudPersistence(instanceKey = "solo") {
  let app = null;
  let db = null;
  let auth = null;
  let uid = "";
  let enabled = false;

  try {
    const cfg = assertFirebaseWebConfig(firebaseWebConfig);
    app = getApps().length ? getApp() : initializeApp(cfg);
    db = getFirestore(app);
    auth = getAuth(app);
    // Do not trigger anonymous sign-up requests; use cloud only when session already exists.
    uid = String(auth.currentUser?.uid || "").trim();
    enabled = !!db && !!uid;
  } catch (_) {
    enabled = false;
  }

  const profileIdBase = uid || createDeviceId();
  const profileId = `${profileIdBase}:${String(instanceKey || "solo")}`;

  return {
    enabled,
    profileId,
    async load() {
      if (!enabled || !db || !profileId) return null;
      try {
        const snap = await getDoc(doc(db, FIRESTORE_COLLECTION, profileId));
        if (!snap.exists()) return null;
        const data = snap.data() || {};
        return {
          ...defaultProfile(),
          ...data,
          profileId
        };
      } catch (_) {
        return null;
      }
    },
    async save(profile = {}) {
      if (!enabled || !db || !profileId) return false;
      try {
        await setDoc(doc(db, FIRESTORE_COLLECTION, profileId), {
          ...defaultProfile(),
          ...(profile || {}),
          profileId,
          updatedAt: Date.now(),
          updatedAtServer: serverTimestamp()
        }, { merge: true });
        return true;
      } catch (_) {
        return false;
      }
    }
  };
}

class PoseInput {
  constructor(sidePreference = "solo") {
    this.sidePreference = String(sidePreference || "solo");
    this.video = null;
    this.stream = null;
    this.poseLandmarker = null;
    this.vision = null;
    this.lastDetectAt = 0;
    this.lastSeenAt = 0;
    this.lastPoseCx = 0.5;
    this.status = "idle";
    this.source = "keyboard";
    this.normX = 0.5;
    this.normY = 0.8;
    this.pointerNormX = 0.5;
    this.pointerNormY = 0.8;
    this.hasCamera = false;
    this.hasModel = false;
    this.confidence = 0;
    this.targetNormX = 0.5;
    this.targetNormY = 0.8;
    this.armPose = {
      left: { upper: 0, lower: 0 },
      right: { upper: 0, lower: 0 }
    };
    this.skeleton = { joints: [], segments: [], confidence: 0 };
    const cores = Math.max(2, Number(navigator.hardwareConcurrency || 4));
    const mem = Math.max(2, Number(navigator.deviceMemory || 4));
    const lowEnd = cores <= 4 || mem <= 4;
    this.detectIntervalMs = lowEnd ? 86 : 58;
  }

  static async _acquireSharedVideo() {
    if (PoseInput.__sharedVideo?.video && PoseInput.__sharedVideo?.stream) {
      PoseInput.__sharedVideo.refCount = Number(PoseInput.__sharedVideo.refCount || 0) + 1;
      return PoseInput.__sharedVideo;
    }
    if (PoseInput.__sharedVideoPromise) {
      const shared = await PoseInput.__sharedVideoPromise;
      shared.refCount = Number(shared.refCount || 0) + 1;
      return shared;
    }
    PoseInput.__sharedVideoPromise = (async () => {
      const host = String(window.location.hostname || "").toLowerCase();
      const insecure = !window.isSecureContext && host !== "localhost" && host !== "127.0.0.1";
      if (insecure) throw new Error("camera_secure_context_required");
      const video = document.createElement("video");
      video.setAttribute("playsinline", "true");
      video.autoplay = true;
      video.muted = true;
      video.style.display = "none";
      document.body.appendChild(video);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640, max: 960 },
          height: { ideal: 480, max: 720 },
          frameRate: { ideal: 24, max: 30 }
        },
        audio: false
      });
      video.srcObject = stream;
      await video.play();
      const out = { video, stream, refCount: 0 };
      PoseInput.__sharedVideo = out;
      return out;
    })();
    try {
      const shared = await PoseInput.__sharedVideoPromise;
      shared.refCount = Number(shared.refCount || 0) + 1;
      return shared;
    } finally {
      PoseInput.__sharedVideoPromise = null;
    }
  }

  static async _ensureSharedPoseLandmarker() {
    if (PoseInput.__sharedPoseLandmarker) return PoseInput.__sharedPoseLandmarker;
    if (PoseInput.__sharedPoseLandmarkerPromise) return PoseInput.__sharedPoseLandmarkerPromise;
    PoseInput.__sharedPoseLandmarkerPromise = (async () => {
      const mod = await import("./vendor/mediapipe/vision_bundle.mjs");
      const filesetResolver = await mod.FilesetResolver.forVisionTasks(
        "./vendor/mediapipe/wasm"
      );
      const landmarker = await mod.PoseLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"
        },
        runningMode: "VIDEO",
        numPoses: 2,
        minPoseDetectionConfidence: 0.45,
        minTrackingConfidence: 0.45,
        minPosePresenceConfidence: 0.45
      });
      PoseInput.__sharedPoseLandmarker = landmarker;
      PoseInput.__sharedPoseState = PoseInput.__sharedPoseState || {
        lastResult: null,
        lastDetectAt: 0,
        lastVideoTime: -1
      };
      return landmarker;
    })();
    try {
      return await PoseInput.__sharedPoseLandmarkerPromise;
    } finally {
      PoseInput.__sharedPoseLandmarkerPromise = null;
    }
  }

  static _detectSharedPose(video = null, nowMs = performance.now(), intervalMs = 60) {
    const lm = PoseInput.__sharedPoseLandmarker;
    const state = PoseInput.__sharedPoseState || { lastResult: null, lastDetectAt: 0, lastVideoTime: -1 };
    PoseInput.__sharedPoseState = state;
    if (!lm || !video || video.readyState < 2) return state.lastResult || null;
    const shouldReuse = (nowMs - Number(state.lastDetectAt || 0)) < Math.max(34, Number(intervalMs || 60));
    const sameFrame = Math.abs(Number(video.currentTime || 0) - Number(state.lastVideoTime || 0)) < 0.0005;
    if (shouldReuse || sameFrame) return state.lastResult || null;
    try {
      const result = lm.detectForVideo(video, nowMs);
      state.lastResult = result || null;
      state.lastDetectAt = nowMs;
      state.lastVideoTime = Number(video.currentTime || 0);
      return state.lastResult;
    } catch (_) {
      return state.lastResult || null;
    }
  }

  _pickLandmarksBySide(list = []) {
    if (!Array.isArray(list) || !list.length) return null;
    const side = this.sidePreference;
    const decorated = list.map((lm) => {
      const ls = lm?.[11];
      const rs = lm?.[12];
      const cx = ((Number(ls?.x || 0.5) + Number(rs?.x || 0.5)) * 0.5);
      const cy = ((Number(ls?.y || 0.5) + Number(rs?.y || 0.5)) * 0.5);
      const conf = clamp(((Number(ls?.visibility || 0) + Number(rs?.visibility || 0)) * 0.5), 0, 1);
      return { lm, cx, cy, conf };
    }).filter((it) => it.lm && Number.isFinite(it.cx));
    if (!decorated.length) return null;
    decorated.sort((a, b) => a.cx - b.cx);

    if (side === "left" || side === "right") {
      const deadband = 0.07;
      const strict = decorated.filter((it) => (side === "left" ? it.cx <= (0.5 - deadband) : it.cx >= (0.5 + deadband)));
      const base = strict.length ? strict : decorated;
      const target = side === "left" ? 0.24 : 0.76;
      base.sort((a, b) => {
        const ad = Math.abs(a.cx - target) + ((1 - a.conf) * 0.18) + (Math.abs(a.cx - this.lastPoseCx) * 0.42);
        const bd = Math.abs(b.cx - target) + ((1 - b.conf) * 0.18) + (Math.abs(b.cx - this.lastPoseCx) * 0.42);
        return ad - bd;
      });
      const picked = base[0] || null;
      if (!picked) return null;
      this.lastPoseCx = Number(picked.cx || this.lastPoseCx || 0.5);
      if (!strict.length && decorated.length === 1) {
        const one = decorated[0];
        const inOtherHalf = side === "left" ? one.cx > 0.58 : one.cx < 0.42;
        if (inOtherHalf) return null;
      }
      return picked.lm;
    }

    decorated.sort((a, b) => {
      const ad = (1 - a.conf) + (Math.abs(a.cx - this.lastPoseCx) * 0.28);
      const bd = (1 - b.conf) + (Math.abs(b.cx - this.lastPoseCx) * 0.28);
      return ad - bd;
    });
    const picked = decorated[0] || null;
    if (picked) this.lastPoseCx = Number(picked.cx || this.lastPoseCx || 0.5);
    return picked?.lm || null;
  }

  setPointer(normX = 0.5, normY = 0.8) {
    this.pointerNormX = clamp(normX, 0.03, 0.97);
    this.pointerNormY = clamp(normY, 0.2, 0.97);
    if (!this.hasCamera || this.status === "blocked") {
      this.targetNormX = this.pointerNormX;
      this.targetNormY = this.pointerNormY;
      this.source = "pointer";
    }
  }

  async boot() {
    try {
      const shared = await PoseInput._acquireSharedVideo();
      this.video = shared.video;
      this.stream = shared.stream;
      this.hasCamera = true;
      this.status = "camera_ready";
      this.source = "pose";
      this.poseLandmarker = await PoseInput._ensureSharedPoseLandmarker();
      this.hasModel = true;
      this.status = "pose_ready";
    } catch (_) {
      this.status = "blocked";
      this.source = "pointer";
      this.hasCamera = false;
      this.hasModel = false;
    }
  }

  update(nowMs = performance.now()) {
    if (!this.hasCamera || !this.hasModel || !this.poseLandmarker || !this.video || this.video.readyState < 2) {
      this.targetNormX = this.pointerNormX;
      this.targetNormY = this.pointerNormY;
      this.source = "pointer";
      this._smooth();
      return;
    }

    if (nowMs - this.lastDetectAt < 16) {
      this._smooth();
      return;
    }

    this.lastDetectAt = nowMs;

    try {
      const result = PoseInput._detectSharedPose(this.video, nowMs, this.detectIntervalMs);
      const lm = this._pickLandmarksBySide(result?.landmarks || []);
      if (!lm || lm.length < 17) {
        if (nowMs - this.lastSeenAt > 900) {
          this.status = this.sidePreference === "left" || this.sidePreference === "right"
            ? "no_pose_on_side"
            : "no_pose";
          this.source = "pointer";
          this.targetNormX = this.pointerNormX;
          this.targetNormY = this.pointerNormY;
          this.armPose.left = {
            upper: Number(this.armPose?.left?.upper || 0) * 0.92,
            lower: Number(this.armPose?.left?.lower || 0) * 0.92
          };
          this.armPose.right = {
            upper: Number(this.armPose?.right?.upper || 0) * 0.92,
            lower: Number(this.armPose?.right?.lower || 0) * 0.92
          };
          this.skeleton = { joints: [], segments: [], confidence: 0 };
        }
        this._smooth();
        return;
      }

      const leftShoulder = lm[11];
      const rightShoulder = lm[12];
      const leftElbow = lm[13];
      const rightElbow = lm[14];
      const leftWrist = lm[15];
      const rightWrist = lm[16];
      const nose = lm[0];

      const conf = Number((leftShoulder?.visibility || 0) + (rightShoulder?.visibility || 0) + (nose?.visibility || 0)) / 3;
      this.confidence = clamp(conf, 0, 1);

      const shoulderX = ((leftShoulder?.x || 0.5) + (rightShoulder?.x || 0.5)) * 0.5;
      const shoulderY = ((leftShoulder?.y || 0.5) + (rightShoulder?.y || 0.5)) * 0.5;
      const aimY = clamp(shoulderY + 0.17, 0.22, 0.95);

      const segRotation = (a, b) => {
        const ax = Number(a?.x || 0.5);
        const ay = Number(a?.y || 0.5);
        const bx = Number(b?.x || ax);
        const by = Number(b?.y || ay);
        return Math.atan2(by - ay, bx - ax) - (Math.PI / 2);
      };
      const normalizeAngle = (rad = 0) => {
        let out = Number(rad || 0);
        while (out > Math.PI) out -= Math.PI * 2;
        while (out < -Math.PI) out += Math.PI * 2;
        return out;
      };
      const computeArm = (shoulder, elbow, wrist) => {
        const vis = Math.min(
          Number(shoulder?.visibility ?? 1),
          Number(elbow?.visibility ?? 1),
          Number(wrist?.visibility ?? 1)
        );
        if (!Number.isFinite(vis) || vis < 0.2) return null;
        const upper = clamp(segRotation(shoulder, elbow), -1.9, 1.9);
        const foreGlobal = clamp(segRotation(elbow, wrist), -1.9, 1.9);
        const lower = clamp(normalizeAngle(foreGlobal - upper), -1.6, 1.6);
        return { upper, lower };
      };
      const nextLeft = computeArm(leftShoulder, leftElbow, leftWrist);
      const nextRight = computeArm(rightShoulder, rightElbow, rightWrist);
      this.armPose.left = {
        upper: (Number(this.armPose?.left?.upper || 0) * (nextLeft ? 0.5 : 0.92)) + (Number(nextLeft?.upper || 0) * (nextLeft ? 0.5 : 0)),
        lower: (Number(this.armPose?.left?.lower || 0) * (nextLeft ? 0.5 : 0.92)) + (Number(nextLeft?.lower || 0) * (nextLeft ? 0.5 : 0))
      };
      this.armPose.right = {
        upper: (Number(this.armPose?.right?.upper || 0) * (nextRight ? 0.5 : 0.92)) + (Number(nextRight?.upper || 0) * (nextRight ? 0.5 : 0)),
        lower: (Number(this.armPose?.right?.lower || 0) * (nextRight ? 0.5 : 0.92)) + (Number(nextRight?.lower || 0) * (nextRight ? 0.5 : 0))
      };
      this.skeleton = this._buildSkeleton(lm, CANVAS_W, CANVAS_H);

      this.targetNormX = clamp(1 - shoulderX, 0.03, 0.97);
      this.targetNormY = clamp(aimY, 0.2, 0.97);
      this.lastSeenAt = nowMs;
      this.status = "tracking";
      this.source = "pose";
      this._smooth();
    } catch (_) {
      this.status = "pose_error";
      this.source = "pointer";
      this.targetNormX = this.pointerNormX;
      this.targetNormY = this.pointerNormY;
      this.armPose.left = {
        upper: Number(this.armPose?.left?.upper || 0) * 0.9,
        lower: Number(this.armPose?.left?.lower || 0) * 0.9
      };
      this.armPose.right = {
        upper: Number(this.armPose?.right?.upper || 0) * 0.9,
        lower: Number(this.armPose?.right?.lower || 0) * 0.9
      };
      this.skeleton = { joints: [], segments: [], confidence: 0 };
      this._smooth();
    }
  }

  _buildSkeleton(landmarks = [], width = CANVAS_W, height = CANVAS_H) {
    const mapPoint = (idx = 0) => {
      const lm = landmarks[idx];
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
    if (nose) joints.push({ x: nose.x, y: nose.y, r: 14, kind: "head" });
    if (leftWrist) joints.push({ x: leftWrist.x, y: leftWrist.y, r: 14, kind: "leftWrist" });
    if (rightWrist) joints.push({ x: rightWrist.x, y: rightWrist.y, r: 14, kind: "rightWrist" });
    if (torso) joints.push({ x: torso.x, y: torso.y, r: 18, kind: "torso" });

    const segOf = (a, b, kind = "") => (a && b ? { ax: a.x, ay: a.y, bx: b.x, by: b.y, kind } : null);
    const segments = [
      segOf(leftShoulder, leftElbow, "leftArm"),
      segOf(leftElbow, leftWrist, "leftForearm"),
      segOf(rightShoulder, rightElbow, "rightArm"),
      segOf(rightElbow, rightWrist, "rightForearm"),
      segOf(leftShoulder, rightShoulder, "shoulders"),
      segOf(shoulderMid, hipMid, "torso")
    ].filter(Boolean);

    const byKind = {};
    joints.forEach((j) => { byKind[String(j.kind || "").toLowerCase()] = j; });
    const getSeg = (kind = "") => segments.find((s) => String(s?.kind || "").toLowerCase() === String(kind || "").toLowerCase()) || null;
    const leftWristJoint = byKind.leftwrist || null;
    const rightWristJoint = byKind.rightwrist || null;
    if (leftWristJoint) {
      const forearm = getSeg("leftForearm") || getSeg("leftArm");
      const vx = Number(forearm?.bx || 0) - Number(forearm?.ax || 0);
      const vy = Number(forearm?.by || 0) - Number(forearm?.ay || 0);
      const mag = Math.hypot(vx, vy) || 1;
      joints.push({
        x: Number(leftWristJoint.x || 0) + ((vx / mag) * 16),
        y: Number(leftWristJoint.y || 0) + ((vy / mag) * 16),
        r: 12,
        kind: "leftHand"
      });
    }
    if (rightWristJoint) {
      const forearm = getSeg("rightForearm") || getSeg("rightArm");
      const vx = Number(forearm?.bx || 0) - Number(forearm?.ax || 0);
      const vy = Number(forearm?.by || 0) - Number(forearm?.ay || 0);
      const mag = Math.hypot(vx, vy) || 1;
      joints.push({
        x: Number(rightWristJoint.x || 0) + ((vx / mag) * 16),
        y: Number(rightWristJoint.y || 0) + ((vy / mag) * 16),
        r: 12,
        kind: "rightHand"
      });
    }

    return {
      joints,
      segments,
      confidence: Math.min(1, Math.max(0, (joints.length + segments.length) / 10))
    };
  }

  _smooth() {
    this.normX += (this.targetNormX - this.normX) * 0.34;
    this.normY += (this.targetNormY - this.normY) * 0.34;
  }

  getPixel(width = CANVAS_W, height = CANVAS_H) {
    return {
      x: clamp(this.normX * width, PLAYER_RADIUS, width - PLAYER_RADIUS),
      y: clamp(this.normY * height, PLAYER_RADIUS + 20, height - PLAYER_RADIUS),
      source: this.source,
      status: this.status,
      confidence: this.confidence,
      arms: {
        left: {
          upper: Number(this.armPose?.left?.upper || 0),
          lower: Number(this.armPose?.left?.lower || 0)
        },
        right: {
          upper: Number(this.armPose?.right?.upper || 0),
          lower: Number(this.armPose?.right?.lower || 0)
        }
      },
      skeleton: this.skeleton
    };
  }

  dispose() {
    try {
      if (PoseInput.__sharedVideo) {
        PoseInput.__sharedVideo.refCount = Math.max(0, Number(PoseInput.__sharedVideo.refCount || 0) - 1);
        if (PoseInput.__sharedVideo.refCount <= 0) {
          try {
            PoseInput.__sharedVideo.stream?.getTracks?.().forEach((t) => t.stop());
          } catch (_) {
            // no-op
          }
          try {
            PoseInput.__sharedVideo.video?.remove?.();
          } catch (_) {
            // no-op
          }
          PoseInput.__sharedVideo = null;
        }
      }
    } catch (_) {
      // no-op
    }
    this.video = null;
    this.stream = null;
    this.poseLandmarker = null;
  }
}

class CapsScene extends Phaser.Scene {
  constructor(instanceKey = "solo") {
    super("caps-main");
    this.instanceKey = String(instanceKey || "solo");
    this.profileStorageKey = this.instanceKey === "solo"
      ? LOCAL_PROFILE_KEY
      : `${LOCAL_PROFILE_KEY}_${this.instanceKey}`;
    this.mode = GAME_MODE.BOOT;
    this.modeTimer = 0;
    this.totalTimeLeft = 0;
    this.spawnTimer = 0;
    this.player = null;
    this.playerShadow = null;
    this.playerRig = null;
    this.playerParts = null;
    this.playerFacing = 1;
    this.walkPhase = 0;
    this.prevPlayerX = CANVAS_W / 2;
    this.playerTarget = { x: CANVAS_W / 2, y: PLAYER_BASE_Y };
    this.tokens = [];
    this.fxBursts = [];
    this.currentMissionIndex = 0;
    this.missionHits = 0;
    this.lives = 4;
    this.score = 0;
    this.combo = 0;
    this.gems = 0;
    this.debug = {};
    this.profile = defaultProfile();
    this.persistence = null;
    this.pendingCloudSave = 0;
    this.poseInput = new PoseInput(this.instanceKey);
    this.keys = null;
    this.ui = {};
    this.bgUrl = "";
    this.bgImage = null;
    this.uiBadgeStats = null;
    this.uiBadgeProgress = null;
  }

  _playRocketFailSfx() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = CapsScene.__audioCtx || new Ctx();
      CapsScene.__audioCtx = ctx;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const now = ctx.currentTime;
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
      master.connect(ctx.destination);

      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.exponentialRampToValueAtTime(920, now + 0.2);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.42);
      const filt = ctx.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.setValueAtTime(1800, now);
      filt.frequency.exponentialRampToValueAtTime(700, now + 0.42);
      osc.connect(filt);
      filt.connect(master);
      osc.start(now);
      osc.stop(now + 0.44);
    } catch (_) {
      // no-op
    }
  }

  _playCoinGoodSfx() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = CapsScene.__audioCtx || new Ctx();
      CapsScene.__audioCtx = ctx;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const now = ctx.currentTime;

      const master = ctx.createGain();
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(0.12, now + 0.008);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      master.connect(ctx.destination);

      const oscA = ctx.createOscillator();
      oscA.type = "triangle";
      oscA.frequency.setValueAtTime(880, now);
      oscA.frequency.exponentialRampToValueAtTime(1320, now + 0.09);

      const oscB = ctx.createOscillator();
      oscB.type = "sine";
      oscB.frequency.setValueAtTime(1320, now + 0.03);
      oscB.frequency.exponentialRampToValueAtTime(1760, now + 0.16);

      const gainB = ctx.createGain();
      gainB.gain.setValueAtTime(0.0001, now);
      gainB.gain.exponentialRampToValueAtTime(0.8, now + 0.04);
      gainB.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

      oscA.connect(master);
      oscB.connect(gainB);
      gainB.connect(master);

      oscA.start(now);
      oscA.stop(now + 0.14);
      oscB.start(now + 0.028);
      oscB.stop(now + 0.205);
    } catch (_) {
      // no-op
    }
  }

  preload() {
    this.bgUrl = sanitizeBgUrl(CAPS_LAUNCH_CONTEXT.bgUrl || "");
    if (this.bgUrl) {
      this.load.image("caps-reading-bg", this.bgUrl);
    }
  }

  async create() {
    this._buildStage();
    this._installInputs();
    await this._bootPersistence();
    await this.poseInput.boot();
    this._startMission(this.profile.missionIndex || 0, true);
    this._bindDebugHooks();
  }

  _buildStage() {
    this.cameras.main.setBackgroundColor("rgba(0,0,0,0)");
    this._buildBackgroundLayer();
    this._buildTopbar();

    this.ui.overlayBox = this.add.rectangle(CANVAS_W / 2, CANVAS_H / 2, 890, 270, 0x020617, 0.72)
      .setStrokeStyle(3, 0xf8fafc, 0.6)
      .setVisible(false);

    this.ui.overlayTitle = this.add.text(CANVAS_W / 2, CANVAS_H / 2 - 176, "", {
      fontFamily: "Bungee, sans-serif",
      fontSize: "34px",
      color: "#fde68a",
      align: "center"
    }).setOrigin(0.5).setVisible(false);

    this.ui.overlayBody = this.add.text(CANVAS_W / 2, CANVAS_H / 2 + 20, "", {
      fontFamily: "Nunito, sans-serif",
      fontSize: "24px",
      color: "#e2e8f0",
      align: "center",
      wordWrap: { width: 810 }
    }).setOrigin(0.5).setVisible(false);

    this.ui.hint = this.add.text(CANVAS_W / 2, CANVAS_H - 22, "Moverte con el cuerpo (cámara) o con mouse/teclas", {
      fontFamily: "Nunito, sans-serif",
      fontSize: "18px",
      color: "#dbeafe"
    }).setOrigin(0.5, 1);

    this._createPlayerRig();
  }

  _buildBackgroundLayer() {
    const hasBgTexture = !!this.textures.exists("caps-reading-bg");
    const hasBgHint = !!String(this.bgUrl || "").trim();
    if (hasBgTexture) {
      const img = this.add.image(CANVAS_W / 2, CANVAS_H / 2, "caps-reading-bg");
      const scale = Math.max(CANVAS_W / Math.max(1, img.width), CANVAS_H / Math.max(1, img.height));
      img.setScale(scale);
      this.bgImage = img;
    } else if (hasBgHint) {
      // Keep canvas transparent so stage CSS background-image remains visible.
      this.bgImage = null;
    } else {
      const bg = this.add.graphics();
      bg.fillGradientStyle(0x0b1220, 0x111827, 0x172033, 0x0f172a, 1);
      bg.fillRect(0, 0, CANVAS_W, CANVAS_H);
      this.bgImage = bg;
    }

    this.add.rectangle(
      CANVAS_W / 2,
      CANVAS_H / 2,
      CANVAS_W,
      CANVAS_H,
      0x020617,
      (hasBgTexture || hasBgHint) ? 0.02 : 0.18
    );

    for (let i = 0; i < 24; i += 1) {
      const x = Math.random() * CANVAS_W;
      const y = TOPBAR_HEIGHT + (Math.random() * (CANVAS_H - TOPBAR_HEIGHT));
      const r = 1 + Math.random() * 3;
      this.add.circle(x, y, r, 0xffffff, 0.12);
    }
  }

  _buildTopbar() {
    const bar = this.add.container(0, 0);
    const bg = this.add.rectangle(CANVAS_W / 2, TOPBAR_HEIGHT / 2, CANVAS_W, TOPBAR_HEIGHT, 0x0b1020, 0.82)
      .setStrokeStyle(2, 0x2a3348, 0.9);
    bar.add(bg);
    const gloss = this.add.rectangle(CANVAS_W / 2, 10, CANVAS_W, 16, 0xffffff, 0.08);
    const bevelBottom = this.add.rectangle(CANVAS_W / 2, TOPBAR_HEIGHT - 1, CANVAS_W, 2, 0x000000, 0.34);
    bar.add([gloss, bevelBottom]);

    const sep1 = this.add.rectangle(430, TOPBAR_HEIGHT / 2, 2, TOPBAR_HEIGHT - 24, 0xffffff, 0.14);
    const sep2 = this.add.rectangle(905, TOPBAR_HEIGHT / 2, 2, TOPBAR_HEIGHT - 24, 0xffffff, 0.14);
    bar.add([sep1, sep2]);

    this.ui.title = this.add.text(26, 14, "CAZA MAYÚSCULAS", {
      fontFamily: "Bungee, sans-serif",
      fontSize: "28px",
      color: "#f5f5f5"
    });
    this.ui.subtitle = this.add.text(26, 50, "", {
      fontFamily: "Nunito, sans-serif",
      fontSize: "18px",
      color: "#dbeafe",
      fontStyle: "800"
    });
    this.ui.stats = this.add.text(446, 20, "", {
      fontFamily: "Nunito, sans-serif",
      fontSize: "18px",
      color: "#ecf7df",
      fontStyle: "900"
    });
    this.uiBadgeStats = this.add.rectangle(672, 31, 460, 30, 0x5f73a6, 0.95).setStrokeStyle(2, 0x11170e, 0.95);
    this.uiBadgeStats.setOrigin(0.5, 0.5);
    this.ui.progress = this.add.text(446, 55, "", {
      fontFamily: "Nunito, sans-serif",
      fontSize: "18px",
      color: "#ecf7df",
      fontStyle: "900"
    });
    this.uiBadgeProgress = this.add.rectangle(672, 66, 460, 30, 0x759e5f, 0.95).setStrokeStyle(2, 0x11170e, 0.95);
    this.uiBadgeProgress.setOrigin(0.5, 0.5);
    this.ui.pose = this.add.text(CANVAS_W - 26, 22, "", {
      fontFamily: "Nunito, sans-serif",
      fontSize: "16px",
      color: "#bae6fd",
      fontStyle: "800",
      align: "right"
    }).setOrigin(1, 0);
    this.ui.pose.setShadow(0, 1, "#06101f", 1, false, true);
    this.ui.title.setShadow(0, 2, "#000000", 1, false, true);
    bar.add([this.ui.title, this.ui.subtitle, this.uiBadgeStats, this.uiBadgeProgress, this.ui.stats, this.ui.progress, this.ui.pose]);
  }

  _createPlayerRig() {
    this.playerShadow = this.add.ellipse(CANVAS_W / 2, PLAYER_BASE_Y + 12, 178, 44, 0x020617, 0.3);
    this.player = this.add.rectangle(CANVAS_W / 2, PLAYER_BASE_Y, 1, 1, 0xffffff, 0);
    this.playerRig = this.player;
    this.playerPoseGraphics = this.add.graphics();
    this.playerPoseGraphics.setDepth(25);
    this.playerParts = null;
  }

  _drawStickFigure(posePoint, swing = 0) {
    const g = this.playerPoseGraphics;
    if (!g) return;
    g.clear();

    const raw = posePoint?.skeleton;
    const joints = Array.isArray(raw?.joints) ? raw.joints : [];
    const segments = Array.isArray(raw?.segments) ? raw.segments : [];
    if (joints.length && segments.length) {
      const torso = joints.find((j) => String(j?.kind || "").toLowerCase() === "torso") || { x: this.player.x, y: PLAYER_BASE_Y - 74 };
      const head = joints.find((j) => String(j?.kind || "").toLowerCase() === "head") || null;
      const scale = 0.44;
      const anchorX = this.player.x;
      const anchorY = PLAYER_BASE_Y - 54;
      const mapX = (x) => anchorX + ((Number(x || anchorX) - Number(torso.x || anchorX)) * scale);
      const mapY = (y) => anchorY + ((Number(y || anchorY) - Number(torso.y || anchorY)) * scale);

      g.lineStyle(6, 0x07121e, 0.44);
      segments.forEach((seg) => {
        g.beginPath();
        g.moveTo(mapX(seg.ax), mapY(seg.ay));
        g.lineTo(mapX(seg.bx), mapY(seg.by));
        g.strokePath();
      });
      const torsoX = mapX(torso.x);
      const torsoY = mapY(torso.y);
      const headY = head ? mapY(head.y) : (torsoY - 30);
      const trunk = Math.max(20, Math.abs(torsoY - headY));
      const legLen = Math.max(38, Math.min(64, trunk * 1.55));
      const step = Math.sin(this.walkPhase) * 5.5;
      g.beginPath();
      g.moveTo(torsoX - 5, torsoY + 6);
      g.lineTo(torsoX - 14, torsoY + legLen + step);
      g.moveTo(torsoX + 5, torsoY + 6);
      g.lineTo(torsoX + 14, torsoY + legLen - step);
      g.strokePath();

      joints.forEach((joint) => {
        const kind = String(joint?.kind || "").toLowerCase();
        if (kind.includes("wrist")) return;
        let color = 0x5eb6ff;
        if (kind.includes("lefthand")) color = 0xffd660;
        else if (kind.includes("righthand")) color = 0xff94b6;
        else if (kind === "head") color = 0x83ec9c;
        else if (kind === "torso") color = 0x80a4ff;
        const radius = Math.max(6, Number(joint?.r || 12) * 1.06 * scale);
        g.fillStyle(color, 0.94);
        g.fillCircle(mapX(joint.x), mapY(joint.y), radius);
      });
      g.fillStyle(0x5eb6ff, 0.94);
      g.fillCircle(torsoX - 14, torsoY + legLen + step, 6);
      g.fillCircle(torsoX + 14, torsoY + legLen - step, 6);
      return;
    }

    const x = this.player.x;
    const y = PLAYER_BASE_Y - 48;
    const armSwing = swing * 0.6;
    const legSwing = swing * 0.45;
    g.lineStyle(6, 0x07121e, 0.44);
    g.beginPath();
    g.moveTo(x, y - 62);
    g.lineTo(x, y + 4);
    g.strokePath();
    g.beginPath();
    g.moveTo(x - 28, y - 24);
    g.lineTo(x + 28, y - 24);
    g.strokePath();
    g.beginPath();
    g.moveTo(x - 6, y + 4);
    g.lineTo(x - 18, y + 58);
    g.moveTo(x + 6, y + 4);
    g.lineTo(x + 18, y + 58);
    g.strokePath();
    g.beginPath();
    g.moveTo(x - 28, y - 24);
    g.lineTo(x - 42 - (armSwing * 22), y - 2 - (armSwing * 8));
    g.moveTo(x + 28, y - 24);
    g.lineTo(x + 42 + (armSwing * 22), y - 2 + (armSwing * 8));
    g.strokePath();
    g.fillStyle(0x83ec9c, 0.95);
    g.fillCircle(x, y - 56, 10);
    g.fillStyle(0x80a4ff, 0.94);
    g.fillCircle(x, y + 4, 8);
    g.fillStyle(0xffd660, 0.98);
    g.fillCircle(x - 42 - (armSwing * 22), y - 2 - (armSwing * 8), 6);
    g.fillStyle(0xff94b6, 0.98);
    g.fillCircle(x + 42 + (armSwing * 22), y - 2 + (armSwing * 8), 6);
    g.fillStyle(0x5eb6ff, 0.94);
    g.fillCircle(x - 18, y + 58 + (legSwing * 6), 6);
    g.fillCircle(x + 18, y + 58 - (legSwing * 6), 6);
  }

  _installInputs() {
    this.input.on("pointermove", (pointer) => {
      const nx = pointer.x / Math.max(1, this.scale.width);
      const ny = pointer.y / Math.max(1, this.scale.height);
      this.poseInput.setPointer(nx, ny);
    });

    this.input.keyboard?.on?.("keydown-SPACE", () => {
      if (this.mode === GAME_MODE.INSTRUCTION || this.mode === GAME_MODE.WON_MISSION) {
        this._startCountdown();
      } else if (this.mode === GAME_MODE.LOST || this.mode === GAME_MODE.WON_CAMPAIGN) {
        this._startMission(0, true);
      }
    });

    this.keys = this.input.keyboard?.addKeys?.("LEFT,RIGHT,UP,DOWN,A,D,W,S") || null;
  }

  async _bootPersistence() {
    this.persistence = await createCloudPersistence(this.instanceKey);
    const local = readLocalProfile(this.profileStorageKey);
    let merged = { ...local };

    if (this.persistence?.enabled) {
      const cloud = await this.persistence.load();
      if (cloud) {
        merged = {
          ...defaultProfile(),
          ...cloud,
          score: Math.max(Number(local.score || 0), Number(cloud.score || 0)),
          bestScore: Math.max(Number(local.bestScore || 0), Number(cloud.bestScore || 0)),
          gems: Math.max(Number(local.gems || 0), Number(cloud.gems || 0)),
          missionIndex: clamp(Math.max(Number(local.missionIndex || 0), Number(cloud.missionIndex || 0)), 0, MISSION_DATA.length - 1)
        };
      }
    }

    this.profile = writeLocalProfile(merged, this.profileStorageKey);
    this.score = Number(this.profile.score || 0);
    this.gems = Number(this.profile.gems || 0);
    this.currentMissionIndex = clamp(Number(this.profile.missionIndex || 0), 0, MISSION_DATA.length - 1);
  }

  _currentMission() {
    return MISSION_DATA[this.currentMissionIndex] || MISSION_DATA[0];
  }

  _startMission(missionIndex = 0, resetCampaign = false) {
    this.currentMissionIndex = clamp(missionIndex, 0, MISSION_DATA.length - 1);
    this.missionHits = 0;
    this.combo = 0;
    this.tokens.forEach((t) => this._destroyToken(t));
    this.tokens = [];

    if (resetCampaign) {
      this.score = 0;
      this.gems = Number(this.profile.gems || 0);
      this.lives = 4;
    } else {
      this.lives = Math.max(1, this.lives);
    }

    const mission = this._currentMission();
    this.totalTimeLeft = Math.max(1, Number(mission.durationSec || 60));
    this.spawnTimer = 0;

    this._setOverlay(
      mission.shortTitle || mission.title,
      `${mission.subtitle}\n\n${mission.expectedLearning}\n${mission.content}\n${mission.process}\n\nPresiona ESPACIO para empezar.`
    );
    this.mode = GAME_MODE.INSTRUCTION;
    this.modeTimer = 0;
    this._persistProfile({ missionIndex: this.currentMissionIndex });
  }

  _startCountdown() {
    this.mode = GAME_MODE.COUNTDOWN;
    this.modeTimer = 3;
    this._setOverlay("¡Prepárate!", "Atrapa solo las opciones correctas.");
  }

  _startPlaying() {
    this.mode = GAME_MODE.PLAYING;
    this._hideOverlay();
  }

  _setOverlay(title = "", body = "") {
    if (CAPS_LAUNCH_CONTEXT.playMode === "pair") {
      _capsSetPairRulesOverlay(title, body);
      this.ui.overlayBox.setVisible(false);
      this.ui.overlayTitle.setVisible(false);
      this.ui.overlayBody.setVisible(false);
      return;
    }
    this.ui.overlayBox.setVisible(true);
    this.ui.overlayTitle.setText(String(title || "")).setVisible(true);
    this.ui.overlayBody.setText(String(body || "")).setVisible(true);
  }

  _hideOverlay() {
    if (CAPS_LAUNCH_CONTEXT.playMode === "pair") {
      _capsHidePairRulesOverlay();
      this.ui.overlayBox.setVisible(false);
      this.ui.overlayTitle.setVisible(false);
      this.ui.overlayBody.setVisible(false);
      return;
    }
    this.ui.overlayBox.setVisible(false);
    this.ui.overlayTitle.setVisible(false);
    this.ui.overlayBody.setVisible(false);
  }

  _spawnToken() {
    const mission = this._currentMission();
    const isTarget = Math.random() < 0.52;
    const textValue = isTarget ? randomFrom(mission.targetPool) : randomFrom(mission.wrongPool);
    if (!textValue) return;

    const x = 120 + Math.random() * (CANVAS_W - 240);
    const y = -30;
    const speed = mission.baseSpeed + Math.random() * 58 + (this.currentMissionIndex * 12);

    const label = this.add.text(x, y, textValue, {
      fontFamily: "Radiora, Nunito, sans-serif",
      fontSize: "56px",
      color: "#ffffff",
      fontStyle: "700",
      stroke: "#8b5cf6",
      strokeThickness: 7
    }).setOrigin(0.5);
    label.setShadow(0, 0, "#a855f7", 8, true, true);
    const bounds = label.getBounds();
    const hitRadius = clamp(Math.max(bounds.width * 0.36, bounds.height * 0.72), 44, 150);

    this.tokens.push({
      x,
      y,
      speed,
      isTarget,
      text: textValue,
      label,
      radius: hitRadius
    });
  }

  _updateTokens(deltaSec = 0.016) {
    const remove = [];

    for (let i = 0; i < this.tokens.length; i += 1) {
      const token = this.tokens[i];
      token.y += token.speed * deltaSec;
      if (token.bubble) token.bubble.setPosition(token.x, token.y);
      token.label.setPosition(token.x, token.y);

      const dx = token.x - this.player.x;
      const dy = token.y - this.player.y;
      const d2 = (dx * dx) + (dy * dy);
      const hitDistance = PLAYER_RADIUS + token.radius;

      if (d2 <= (hitDistance * hitDistance)) {
        this._onTokenHit(token);
        remove.push(token);
        continue;
      }

      if (token.y > CANVAS_H + 80) {
        if (token.isTarget) {
          this.combo = 0;
          this.score = Math.max(0, this.score - 3);
        }
        remove.push(token);
      }
    }

    if (remove.length) {
      this.tokens = this.tokens.filter((token) => {
        const dead = remove.includes(token);
        if (dead) this._destroyToken(token);
        return !dead;
      });
    }
  }

  _destroyToken(token = null) {
    try { token?.bubble?.destroy?.(); } catch (_) {}
    try { token?.label?.destroy?.(); } catch (_) {}
  }

  _spawnBurst(x = 0, y = 0, isGood = false) {
    const color = isGood ? 0x22c55e : 0xef4444;
    for (let i = 0; i < 9; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 90 + Math.random() * 220;
      const dot = this.add.circle(x, y, 4 + Math.random() * 4, color, 0.95);
      this.fxBursts.push({
        dot,
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        t: 0,
        max: 0.42 + Math.random() * 0.18
      });
    }
  }

  _updateFx(deltaSec = 0.016) {
    if (!this.fxBursts.length) return;
    this.fxBursts = this.fxBursts.filter((fx) => {
      fx.t += deltaSec;
      fx.x += fx.vx * deltaSec;
      fx.y += fx.vy * deltaSec;
      fx.vx *= 0.95;
      fx.vy *= 0.95;
      fx.dot.setPosition(fx.x, fx.y);
      fx.dot.setAlpha(1 - (fx.t / fx.max));
      const alive = fx.t < fx.max;
      if (!alive) {
        try { fx.dot.destroy(); } catch (_) {}
      }
      return alive;
    });
  }

  _onTokenHit(token) {
    if (token.isTarget) {
      this.missionHits += 1;
      this.combo += 1;
      const delta = 8 + Math.min(12, this.combo);
      this.score += delta;
      if ((this.missionHits % 5) === 0) this.gems += 1;
      this._playCoinGoodSfx();
      this._spawnBurst(token.x, token.y, true);
    } else {
      this.combo = 0;
      this.lives -= 1;
      this.score = Math.max(0, this.score - 10);
      this._spawnBurst(token.x, token.y, false);
      this._playRocketFailSfx();
      this.cameras.main.shake(260, 0.012);
    }

    if (this.lives <= 0) {
      this._onLose("Te quedaste sin vidas.");
      return;
    }

    const mission = this._currentMission();
    if (this.missionHits >= mission.goal) {
      this._onMissionWin();
    }
  }

  _onMissionWin() {
    const isLast = this.currentMissionIndex >= (MISSION_DATA.length - 1);
    this.profile.bestScore = Math.max(Number(this.profile.bestScore || 0), this.score);
    this.profile.score = this.score;
    this.profile.gems = this.gems;
    this.profile.played = Number(this.profile.played || 0) + 1;

    if (isLast) {
      this.mode = GAME_MODE.WON_CAMPAIGN;
      this._setOverlay("¡Campeón de Caza Mayúsculas!", `Puntaje final: ${this.score}\nGemas: ${this.gems}\n\nPresiona ESPACIO para reiniciar campaña.`);
      this.profile.level = MISSION_DATA.length;
      this.profile.missionIndex = MISSION_DATA.length - 1;
      this._persistProfile();
      return;
    }

    this.mode = GAME_MODE.WON_MISSION;
    this._setOverlay(
      "¡Misión completada!",
      `${this._currentMission().title} superada.\n\nPuntaje: ${this.score}\nGemas: ${this.gems}\n\nPresiona ESPACIO para la siguiente misión.`
    );

    this.profile.level = Math.max(Number(this.profile.level || 1), this.currentMissionIndex + 2);
    this.profile.missionIndex = this.currentMissionIndex + 1;
    this.profile.score = this.score;
    this.profile.gems = this.gems;
    this._persistProfile();
  }

  _onLose(reason = "") {
    this.mode = GAME_MODE.LOST;
    this._setOverlay("Perdiste la ronda", `${reason}\n\nPuntaje: ${this.score}\nPresiona ESPACIO para reiniciar.`);
    this.profile.bestScore = Math.max(Number(this.profile.bestScore || 0), this.score);
    this.profile.score = this.score;
    this._persistProfile();
  }

  _persistProfile(patch = {}) {
    this.profile = writeLocalProfile({ ...this.profile, ...(patch || {}) }, this.profileStorageKey);
    this.pendingCloudSave = 0.1;
  }

  _maybeSaveCloud(deltaSec = 0.016) {
    if (!this.persistence?.enabled) return;
    this.pendingCloudSave -= deltaSec;
    if (this.pendingCloudSave > 0) return;
    this.pendingCloudSave = 3.5;
    this.persistence.save(this.profile).catch(() => {});
  }

  _updatePlayerFromInput(deltaSec = 0.016) {
    this.poseInput.update(performance.now());
    const posePoint = this.poseInput.getPixel(CANVAS_W, CANVAS_H);

    let tx = posePoint.x;
    let ty = PLAYER_BASE_Y;

    if (this.keys) {
      const speed = 760;
      const left = this.keys.LEFT?.isDown || this.keys.A?.isDown;
      const right = this.keys.RIGHT?.isDown || this.keys.D?.isDown;
      if (left || right) {
        tx = this.player.x + ((right ? 1 : 0) - (left ? 1 : 0)) * speed * deltaSec;
      }
    }

    this.playerTarget.x = clamp(tx, PLAYER_RADIUS, CANVAS_W - PLAYER_RADIUS);
    this.playerTarget.y = clamp(ty, PLAYER_BASE_Y, PLAYER_BASE_Y);

    this.player.x += (this.playerTarget.x - this.player.x) * 0.45;
    this.player.y += (this.playerTarget.y - this.player.y) * 0.45;

    const dx = this.player.x - this.prevPlayerX;
    this.prevPlayerX = this.player.x;
    if (Math.abs(dx) > 0.6) this.playerFacing = dx < 0 ? -1 : 1;
    const walkSpeed = Math.abs(dx) > 0.18 ? 14 : 4;
    this.walkPhase += deltaSec * walkSpeed;
    const swing = Math.sin(this.walkPhase) * Math.min(0.46, Math.abs(dx) * 0.07 + 0.12);
    this._drawStickFigure(posePoint, swing);
    if (this.playerShadow) {
      this.playerShadow.x = this.player.x;
      this.playerShadow.y = this.player.y + 8;
      this.playerShadow.scaleX = 0.88 + Math.min(0.2, Math.abs(dx) * 0.01);
      this.playerShadow.alpha = 0.28 + Math.min(0.18, Math.abs(dx) * 0.008);
    }

    return posePoint;
  }

  _updateHud(posePoint) {
    const mission = this._currentMission();
    this.ui.subtitle.setText(`${mission.title} · ${mission.subtitle}`);
    this.ui.stats.setText(`Puntaje: ${this.score}   Vidas: ${this.lives}   Gemas: ${this.gems}   Tiempo: ${Math.ceil(this.totalTimeLeft)}s`);
    this.ui.progress.setText(`Objetivo: ${this.missionHits}/${mission.goal} correctas`);
    if (this.uiBadgeStats) this.uiBadgeStats.width = Math.max(380, this.ui.stats.width + 26);
    if (this.uiBadgeProgress) this.uiBadgeProgress.width = Math.max(380, this.ui.progress.width + 26);

    const source = posePoint?.source === "pose" ? "Cámara" : "Fallback";
    const statusRaw = String(posePoint?.status || "idle").replace(/_/g, " ");
    this.ui.pose.setText(`${source} · ${statusRaw}`);
  }

  _runMode(deltaSec = 0.016) {
    if (this.mode === GAME_MODE.COUNTDOWN) {
      this.modeTimer -= deltaSec;
      const count = Math.max(1, Math.ceil(this.modeTimer));
      this.ui.overlayTitle.setText(`Empieza en ${count}`);
      if (this.modeTimer <= 0) this._startPlaying();
      return;
    }

    if (this.mode !== GAME_MODE.PLAYING) return;

    this.totalTimeLeft -= deltaSec;
    if (this.totalTimeLeft <= 0) {
      this._onLose("Se agotó el tiempo.");
      return;
    }

    this.spawnTimer -= deltaSec;
    if (this.spawnTimer <= 0) {
      this._spawnToken();
      const mission = this._currentMission();
      const intensity = clamp(this.currentMissionIndex * 0.05, 0, 0.16);
      this.spawnTimer = clamp(0.58 - intensity - (this.combo * 0.01), 0.24, 0.58);
      if (Math.random() < 0.22) this.spawnTimer *= 0.55;
    }

    this._updateTokens(deltaSec);
  }

  _bindDebugHooks() {
    window.render_game_to_text = () => JSON.stringify(this._buildDebugState());
    window.advanceTime = (ms = 16) => {
      const total = Math.max(0, Number(ms || 0));
      this._advanceTime(total);
      return JSON.stringify(this._buildDebugState());
    };
  }

  _advanceTime(ms = 0) {
    let left = Math.max(0, Number(ms || 0));
    while (left > 0) {
      const step = Math.min(16, left);
      const deltaSec = step / 1000;
      const posePoint = this._updatePlayerFromInput(deltaSec);
      this._runMode(deltaSec);
      this._updateFx(deltaSec);
      this._updateHud(posePoint);
      this._maybeSaveCloud(deltaSec);
      left -= step;
    }
    this.debug = this._buildDebugState();
  }

  _buildDebugState() {
    const mission = this._currentMission();
    const pose = this.poseInput.getPixel(CANVAS_W, CANVAS_H);
    return {
      gameId: GAME_ID,
      instance: this.instanceKey,
      mode: this.mode,
      mission: {
        index: this.currentMissionIndex,
        id: mission.id,
        title: mission.title,
        goal: mission.goal,
        hits: this.missionHits
      },
      score: this.score,
      lives: this.lives,
      gems: this.gems,
      timerSec: Number(this.totalTimeLeft.toFixed(2)),
      tokens: this.tokens.length,
      pose: {
        sidePreference: this.poseInput?.sidePreference || "solo",
        source: pose.source,
        status: pose.status,
        confidence: Number((pose.confidence || 0).toFixed(3)),
        x: Number(pose.x.toFixed(1)),
        y: Number(pose.y.toFixed(1)),
        arms: {
          left: {
            upper: Number((pose?.arms?.left?.upper || 0).toFixed(3)),
            lower: Number((pose?.arms?.left?.lower || 0).toFixed(3))
          },
          right: {
            upper: Number((pose?.arms?.right?.upper || 0).toFixed(3)),
            lower: Number((pose?.arms?.right?.lower || 0).toFixed(3))
          }
        }
      },
      profile: {
        level: Number(this.profile.level || 1),
        missionIndex: Number(this.profile.missionIndex || 0),
        bestScore: Number(this.profile.bestScore || 0),
        cloudEnabled: !!this.persistence?.enabled
      }
    };
  }

  update(_time, delta) {
    const deltaSec = Math.min(0.05, Math.max(0.001, Number(delta || 16) / 1000));
    const posePoint = this._updatePlayerFromInput(deltaSec);
    this._runMode(deltaSec);
    this._updateFx(deltaSec);
    this._updateHud(posePoint);
    this._maybeSaveCloud(deltaSec);
    this.debug = this._buildDebugState();

    if (this.mode === GAME_MODE.WON_MISSION && this.input.keyboard?.checkDown?.(this.input.keyboard.addKey("SPACE"), 250)) {
      this._startMission(this.currentMissionIndex + 1, false);
    }
    if ((this.mode === GAME_MODE.LOST || this.mode === GAME_MODE.WON_CAMPAIGN) && this.input.keyboard?.checkDown?.(this.input.keyboard.addKey("SPACE"), 250)) {
      this._startMission(0, true);
    }
  }

  shutdown() {
    this.poseInput.dispose();
    this.tokens.forEach((t) => this._destroyToken(t));
    this.tokens = [];
  }
}

function installCapsStyles() {
  if (document.getElementById("caps-game-inline-style")) return;
  const style = document.createElement("style");
  style.id = "caps-game-inline-style";
  style.textContent = `
    @font-face {
      font-family: "Radiora";
      src: url("./Radiora.ttf") format("truetype");
      font-display: swap;
    }
    .caps-game-shell {
      min-height: 100vh;
      display: grid;
      grid-template-rows: 1fr;
      background: #0a1020;
      color: #e2e8f0;
      font-family: "Nunito", sans-serif;
      padding: 14px 16px 20px;
      box-sizing: border-box;
    }
    .caps-game-btn {
      border: 0;
      border-radius: 12px;
      padding: 10px 14px;
      background: #0ea5e9;
      color: #07203f;
      font-weight: 800;
      cursor: pointer;
    }
    .caps-game-btn.is-alt {
      background: #334155;
      color: #e2e8f0;
    }
    .caps-game-stage {
      position: relative;
      width: min(1280px, calc(100vw - 32px));
      aspect-ratio: 16 / 9;
      margin: 0 auto;
      border-radius: 0;
      overflow: hidden;
      border: 1px solid rgba(148, 163, 184, 0.28);
      box-shadow: 0 16px 38px rgba(2, 6, 23, 0.45);
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      background-color: #0f172a;
    }
    .caps-game-mount {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      overflow: hidden;
    }
    .caps-game-stage.is-pair .caps-game-mount canvas {
      width: 100% !important;
      height: 100% !important;
      object-fit: cover;
      object-position: top center;
      display: block;
    }
    .caps-game-stage.is-pair {
      position: relative;
    }
    .caps-game-split {
      position: absolute;
      inset: 0;
      display: grid;
      grid-template-columns: 1fr 1fr;
      z-index: 1;
    }
    .caps-game-pane {
      position: relative;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      background: transparent;
    }
    .caps-game-divider {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 4px;
      background: linear-gradient(180deg, rgba(255,255,255,0.12), rgba(0,0,0,0.4), rgba(255,255,255,0.12));
      z-index: 2;
      pointer-events: none;
    }
    .caps-pair-rules-box {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      z-index: 8;
      width: min(720px, calc(100% - 28px));
      border: 2px solid rgba(255, 255, 255, 0.42);
      background: rgba(0, 0, 0, 0.78);
      border-radius: 10px;
      padding: 14px 16px;
      color: #e2e8f0;
      text-align: center;
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.46);
      pointer-events: none;
    }
    .caps-pair-rules-box[hidden] { display: none; }
    .caps-pair-rules-title {
      margin: 0 0 8px;
      font-family: "Bungee", sans-serif;
      font-size: 22px;
      color: #fde68a;
      text-shadow: 0 2px 0 rgba(0,0,0,0.55);
    }
    .caps-pair-rules-body {
      margin: 0;
      white-space: pre-line;
      font-size: 18px;
      line-height: 1.35;
      font-weight: 800;
      color: #f1f5f9;
    }
    @media (max-width: 900px) {
      .caps-game-shell { padding: 10px; }
      .caps-game-btn { font-size: 14px; padding: 9px 12px; }
      .caps-game-stage { width: calc(100vw - 20px); border-radius: 14px; }
      .caps-pair-rules-title { font-size: 18px; }
      .caps-pair-rules-body { font-size: 15px; }
    }
  `;
  document.head.appendChild(style);
}

function buildLayout() {
  installCapsStyles();
  const stageBg = sanitizeBgUrl(CAPS_LAUNCH_CONTEXT.bgUrl || "");
  const isPair = CAPS_LAUNCH_CONTEXT.playMode === "pair";
  document.body.innerHTML = `
    <main class="caps-game-shell">
      <section class="caps-game-stage${isPair ? " is-pair" : ""}"${stageBg ? ` style="background-image: linear-gradient(180deg, rgba(2,6,23,.18), rgba(2,6,23,.18)), url('${stageBg.replace(/'/g, "%27")}');"` : ""}>
        ${isPair ? `
          <div class="caps-game-split">
            <div class="caps-game-pane">
              <div id="capsGameMountLeft" class="caps-game-mount"></div>
            </div>
            <div class="caps-game-pane">
              <div id="capsGameMountRight" class="caps-game-mount"></div>
            </div>
          </div>
          <div class="caps-game-divider"></div>
          <div id="capsPairRulesBox" class="caps-pair-rules-box" hidden>
            <h3 id="capsPairRulesTitle" class="caps-pair-rules-title"></h3>
            <p id="capsPairRulesBody" class="caps-pair-rules-body"></p>
          </div>
        ` : `
          <div id="capsGameMount" class="caps-game-mount"></div>
        `}
      </section>
    </main>
  `;
}

async function bootCapsGame() {
  buildLayout();
  if (!Phaser) throw new Error("caps_mount_not_available");

  const isPair = CAPS_LAUNCH_CONTEXT.playMode === "pair";
  const mounts = isPair
    ? [
        { id: "capsGameMountLeft", key: "left" },
        { id: "capsGameMountRight", key: "right" }
      ]
    : [{ id: "capsGameMount", key: "solo" }];

  const games = [];
  for (const meta of mounts) {
    const mount = document.getElementById(meta.id);
    if (!mount) continue;
    class SceneForPane extends CapsScene {
      constructor() {
        super(meta.key);
      }
    }
    const config = {
      type: Phaser.AUTO,
      parent: meta.id,
      width: CANVAS_W,
      height: CANVAS_H,
      backgroundColor: "#00000000",
      transparent: true,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: isPair ? Phaser.Scale.NO_CENTER : Phaser.Scale.CENTER_BOTH
      },
      scene: [SceneForPane],
      fps: {
        target: 60,
        forceSetTimeOut: false
      },
      audio: {
        disableWebAudio: false
      }
    };
    games.push(new Phaser.Game(config));
  }

  if (!games.length) throw new Error("caps_mount_not_available");

  window.addEventListener("beforeunload", () => {
    games.forEach((game) => {
      try { game.destroy(true); } catch (_) {}
    });
  }, { once: true });
}

bootCapsGame().catch((err) => {
  try {
    console.error("[CapsGame] boot failed", err);
  } catch (_) {
    // no-op
  }
  const fallback = document.createElement("pre");
  fallback.style.whiteSpace = "pre-wrap";
  fallback.style.padding = "16px";
  fallback.style.color = "#fee2e2";
  fallback.textContent = `No se pudo iniciar Caza Mayúsculas.\n${String(err?.message || err || "unknown")}`;
  document.body.innerHTML = "";
  document.body.appendChild(fallback);
  window.render_game_to_text = () => JSON.stringify({ gameId: GAME_ID, mode: "boot_error", error: String(err?.message || err || "unknown") });
  window.advanceTime = (ms = 0) => JSON.stringify({ gameId: GAME_ID, mode: "boot_error", advancedMs: Number(ms || 0) });
});
