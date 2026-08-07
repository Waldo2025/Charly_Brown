import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

if (!process.argv.includes("--execute")) {
  console.error("Use --execute para crear y limpiar recursos temporales de smoke.");
  process.exit(2);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireFromFunctions = createRequire(path.join(root, "functions/package.json"));
const requireFromLiveProxy = createRequire(path.join(root, "cloud-run/live-proxy/package.json"));
const { initializeApp, applicationDefault, deleteApp } = requireFromFunctions("firebase-admin/app");
const { getFirestore } = requireFromFunctions("firebase-admin/firestore");
const { getStorage } = requireFromFunctions("firebase-admin/storage");
const { WebSocket } = requireFromLiveProxy("ws");

const PROJECT_ID = "charly-brown";
const BUCKET = "charly-brown.firebasestorage.app";
const PREVIEW_BASE = process.env.CHARLY_PHASE5_BASE_URL
  || "https://charly-brown--google-cloud-phase4-mucp5w2o.web.app";
const runExtendedJobs = process.argv.includes("--extended");
const jobsOnly = process.argv.includes("--jobs-only");
const montageOnly = process.argv.includes("--montage-only");
const firebaseConfigSource = fs.readFileSync(path.join(root, "public/js/firebase-web-config.js"), "utf8");
const apiKey = firebaseConfigSource.match(/apiKey:\s*["']([^"']+)["']/)?.[1] || "";
assert.ok(apiKey, "No se encontró Firebase Web API key pública.");

const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
let uid = "";
const sessionId = `phase5_${suffix}`.replace(/[^A-Za-z0-9._-]/g, "_");
const app = initializeApp({
  projectId: PROJECT_ID,
  storageBucket: BUCKET,
  credential: applicationDefault()
}, `phase5-${suffix}`);
const db = getFirestore(app);
const bucket = getStorage(app).bucket();
const cleanup = {
  storagePaths: new Set(),
  uploadIds: new Set(),
  liveTickets: new Set(),
  aiJobIds: new Set(),
  exportJobIds: new Set()
};
let idToken = "";

function logCheck(name, detail = "OK") {
  console.log(`[phase5] ${name}: ${detail}`);
}

async function api(pathname, { method = "GET", body, auth = true } = {}) {
  const response = await fetch(`${PREVIEW_BASE}${pathname}`, {
    method,
    headers: {
      ...(auth ? { Authorization: `Bearer ${idToken}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      Origin: "http://127.0.0.1:5010"
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(70_000)
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 500) }; }
  if (!response.ok) {
    const error = new Error(`${method} ${pathname} -> ${response.status}: ${JSON.stringify(data).slice(0, 600)}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return { response, data };
}

async function createTemporaryFirebaseUser() {
  const email = `codex-phase5-${suffix}@example.invalid`;
  const password = `P5-${suffix}-Aa9!`;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
    signal: AbortSignal.timeout(30_000)
  });
  const data = await response.json();
  if (!response.ok || !data.idToken || !data.localId) throw new Error(`temporary_signup_failed:${response.status}:${JSON.stringify(data).slice(0, 400)}`);
  return { idToken: data.idToken, uid: data.localId };
}

async function deleteTemporaryFirebaseUser(token) {
  if (!token) return;
  await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: token }),
    signal: AbortSignal.timeout(30_000)
  }).catch(() => {});
}

async function waitForLiveReady({ websocketUrl, ticket }) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${websocketUrl}?ticket=${encodeURIComponent(ticket)}`, {
      headers: { Origin: "http://127.0.0.1:5010" }
    });
    const timeout = setTimeout(() => {
      socket.terminate();
      reject(new Error("live_ready_timeout"));
    }, 25_000);
    socket.on("message", (raw) => {
      try {
        const message = JSON.parse(String(raw));
        if (message.type === "ready") {
          clearTimeout(timeout);
          socket.close(1000, "smoke_complete");
          resolve(message);
        } else if (message.type === "error") {
          clearTimeout(timeout);
          socket.close();
          reject(new Error(`live_error:${message.code || message.message || "unknown"}`));
        }
      } catch (error) {
        clearTimeout(timeout);
        socket.close();
        reject(error);
      }
    });
    socket.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    socket.on("unexpected-response", (_request, response) => {
      clearTimeout(timeout);
      reject(new Error(`live_handshake_failed:${response.statusCode}`));
    });
  });
}

function collectStoragePaths(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (typeof value.storagePath === "string" && value.storagePath.startsWith("podcaster/")) {
    cleanup.storagePaths.add(value.storagePath);
  }
  for (const item of Array.isArray(value) ? value : Object.values(value)) collectStoragePaths(item, seen);
}

async function pollApiJob(pathname, { timeoutMs = 12 * 60_000, intervalMs = 5000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastStage = "";
  while (Date.now() < deadline) {
    const current = await api(pathname);
    const status = String(current.data.status || "").toLowerCase();
    const stage = String(current.data.stage || status);
    if (stage && stage !== lastStage) {
      console.log(`[phase5] job stage: ${stage}`);
      lastStage = stage;
    }
    if (["ready", "completed"].includes(status)) return current.data;
    if (["error", "failed", "cancelled", "canceled"].includes(status)) {
      throw new Error(`job_terminal_${status}:${JSON.stringify(current.data.error || {}).slice(0, 500)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`job_poll_timeout:${pathname}`);
}

async function runAiJob(label, pathname, body, timeoutMs) {
  const accepted = await api(pathname, { method: "POST", body });
  const jobId = String(accepted.data.jobId || "");
  assert.ok(jobId, `${label} no devolvió jobId.`);
  cleanup.aiJobIds.add(jobId);
  const ready = await pollApiJob(`/api/podcaster/jobs/${encodeURIComponent(jobId)}`, { timeoutMs });
  collectStoragePaths(ready.result || ready);
  logCheck(label, `${ready.model || accepted.data.model || "modelo validado"}`);
  return ready;
}

try {
  const temporaryUser = await createTemporaryFirebaseUser();
  idToken = temporaryUser.idToken;
  uid = temporaryUser.uid;
  logCheck("Firebase temporary auth");

  const health = await api("/api/health", { auth: false });
  assert.equal(health.data.provider, "google-cloud");
  logCheck("Hosting base -> Functions");

  const now = new Date().toISOString();
  await api("/api/podcaster/sessions/save", {
    method: "POST",
    body: {
      session: {
        id: sessionId,
        title: "Phase 5 isolated smoke",
        updatedAt: now,
        script: { rows: [{ id: "row-1", speaker: "Smoke", text: "Hola" }], videoContentType: "video" }
      }
    }
  });
  const listed = await api("/api/podcaster/sessions/list");
  assert.ok(listed.data.sessions.some((item) => item.id === sessionId));
  const loaded = await api(`/api/podcaster/sessions/get?sessionId=${encodeURIComponent(sessionId)}`);
  assert.equal(loaded.data.session.id, sessionId);
  logCheck("Sesiones save/list/get");

  if (!jobsOnly) {
    const uploadSize = 80 * 1024 * 1024;
    const created = await api("/api/podcaster/uploads/create", {
    method: "POST",
    body: {
      kind: "scene-video",
      sessionId,
      rowId: "row-1",
      fileName: "phase5-80mb.mp4",
      contentType: "video/mp4",
      size: uploadSize
    }
  });
    const { uploadId, uploadUrl, storagePath } = created.data;
    assert.ok(uploadId && uploadUrl && storagePath);
    cleanup.uploadIds.add(uploadId);
    cleanup.storagePaths.add(storagePath);
    const uploadBody = Buffer.alloc(uploadSize);
    const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(uploadSize),
      "Content-Range": `bytes 0-${uploadSize - 1}/${uploadSize}`,
      Origin: "http://127.0.0.1:5010"
    },
    body: uploadBody,
    signal: AbortSignal.timeout(180_000)
  });
    if (!uploadResponse.ok) throw new Error(`resumable_upload_failed:${uploadResponse.status}:${(await uploadResponse.text()).slice(0, 500)}`);
    const finalized = await api("/api/podcaster/uploads/finalize", { method: "POST", body: { uploadId } });
    assert.equal(finalized.data.media.size, uploadSize);
    logCheck("Subida resumible", "80 MiB");

    const signed = await api(`/api/assets/signed-url?storagePath=${encodeURIComponent(storagePath)}`);
    const rangeResponse = await fetch(signed.data.url, {
    headers: { Range: "bytes=0-1023", Origin: "http://127.0.0.1:5010" },
    signal: AbortSignal.timeout(30_000)
  });
    assert.equal(rangeResponse.status, 206);
    assert.equal((await rangeResponse.arrayBuffer()).byteLength, 1024);
    logCheck("Storage Range", "206 / 1024 bytes");

    const gemini = await api("/api/gemini/generate", {
    method: "POST",
    body: {
      model: "gemini-3.5-flash",
      payload: {
        contents: [{ role: "user", parts: [{ text: "Responde únicamente OK" }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 8 }
      }
    }
  });
    assert.ok(Array.isArray(gemini.data.candidates) && gemini.data.candidates.length > 0);
    logCheck("Gemini texto síncrono");

    const live = await api("/api/gemini/live-token", {
    method: "POST",
    body: { voiceName: "Aoede", systemInstruction: "Responde brevemente en español." }
  });
    cleanup.liveTickets.add(live.data.ticket);
    const liveReady = await waitForLiveReady(live.data);
    assert.equal(liveReady.type, "ready");
    logCheck("Gemini Live ticket + WebSocket");
  }

  if (runExtendedJobs) {
    if (!montageOnly) {
      await runAiJob("Imagen de escenario", "/api/podcaster/scenario-images/generate", {
        sessionId,
        scenarioId: "phase5",
        title: "Phase 5 smoke",
        prompt: "Minimal editorial podcast studio, soft blue gradient, no text, no logos."
      }, 6 * 60_000);

      await runAiJob("Gemini TTS", "/api/podcaster/dialogue-audio/generate", {
        sessionId,
        rowId: "row-1",
        speakerLabel: "Smoke",
        voiceName: "Aoede",
        text: "Hola.",
        targetSpeechLine: "Hola."
      }, 6 * 60_000);

      await runAiJob("Lyria", "/api/podcaster/music/generate", {
        sessionId,
        prompt: "Very short warm ambient educational podcast sting, instrumental, no lyrics."
      }, 8 * 60_000);

      await runAiJob("Veo Fast", "/api/podcaster/dialogue-videos/generate", {
        sessionId,
        rowId: "row-1",
        model: "lite",
        durationSec: 4,
        prompt: "A blue ball rolls slowly on a plain white table, fixed camera, no text, no logos."
      }, 14 * 60_000);
    }

    const montagePayload = {
      sessionId,
      renderMode: "browser",
      exportMode: "normal",
      format: "mp4_h264",
      qualityPreset: "balanced",
      resolution: "720p",
      filename: "phase5-smoke.mp4",
      entries: [{
        rowId: "row-1",
        sceneIndex: 1,
        startMs: 0,
        timelineStartMs: 0,
        timelineEndMs: 1500,
        trimInMs: 0,
        durationMs: 1500,
        backgroundColor: "#0f172a",
        video: null,
        audio: null
      }]
    };
    const montage = await api("/api/podcaster/montage/export", { method: "POST", body: montagePayload });
    const montageJobId = String(montage.data.jobId || "");
    assert.ok(montageJobId);
    cleanup.exportJobIds.add(montageJobId);
    const montageReady = await pollApiJob(`/api/podcaster/montage/export-status?jobId=${encodeURIComponent(montageJobId)}`, {
      timeoutMs: 12 * 60_000,
      intervalMs: 7000
    });
    collectStoragePaths(montageReady);
    assert.ok(montageReady.downloadUrl || montageReady.result?.storagePath || montageReady.export?.storagePath);
    logCheck("Montaje Cloud Run Job");

    const cancellable = await api("/api/podcaster/montage/export", { method: "POST", body: montagePayload });
    const cancelJobId = String(cancellable.data.jobId || "");
    assert.ok(cancelJobId);
    cleanup.exportJobIds.add(cancelJobId);
    const cancelled = await api("/api/podcaster/montage/export-cancel", { method: "POST", body: { jobId: cancelJobId } });
    assert.equal(cancelled.data.status, "cancelled");
    logCheck("Cancelación de montaje");
  }
} finally {
  for (const storagePath of cleanup.storagePaths) {
    await bucket.file(storagePath).delete({ ignoreNotFound: true }).catch(() => {});
  }
  for (const uploadId of cleanup.uploadIds) {
    await db.collection("podcaster_upload_sessions").doc(uploadId).delete().catch(() => {});
  }
  for (const ticket of cleanup.liveTickets) {
    await db.collection("gemini_live_tickets").doc(ticket).delete().catch(() => {});
  }
  for (const jobId of cleanup.aiJobIds) {
    await db.collection("podcaster_ai_jobs").doc(jobId).delete().catch(() => {});
  }
  for (const jobId of cleanup.exportJobIds) {
    await db.collection("podcaster_export_jobs").doc(jobId).delete().catch(() => {});
  }
  await db.collection("podcaster_sessions").doc(sessionId).delete().catch(() => {});
  await deleteTemporaryFirebaseUser(idToken);
  await deleteApp(app).catch(() => {});
  logCheck("Limpieza temporal");
}
