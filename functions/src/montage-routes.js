const crypto = require("node:crypto");
const {
  PROJECT_ID,
  REGION,
  getAdminServices,
  resolveAuthContext,
  asyncRoute
} = require("./common.js");
const { enqueueHttpTask, QUEUES } = require("./tasks.js");
const { sessionAccess } = require("./podcaster-data.js");

const JOB_COLLECTION = "podcaster_export_jobs";
const JOB_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_PERSISTED_REQUEST_BYTES = 850 * 1024;
const TASK_INVOKER = `charly-tasks-invoker@${PROJECT_ID}.iam.gserviceaccount.com`;
const DISPATCH_URL = `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/dispatchMontageTask`;

function cleanId(value = "") {
  const clean = String(value || "").trim();
  if (!clean || clean.length > 180 || !/^[A-Za-z0-9._-]+$/.test(clean)) {
    throw Object.assign(new Error("invalid_identifier"), { status: 400 });
  }
  return clean;
}

function sanitizePersistedValue(value, depth = 0) {
  if (depth > 18) return undefined;
  if (value == null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") {
    const clean = value.trim();
    if (/^data:/i.test(clean)) return undefined;
    if (/\.onrender\.com(?:\/|$)/i.test(clean)) {
      try {
        const parsed = new URL(clean);
        const storagePath = parsed.searchParams.get("storagePath");
        if (storagePath) {
          const route = parsed.pathname.includes("proxy-image") ? "proxy-image" : "proxy-media";
          return `https://charly-brown.web.app/api/assets/${route}?storagePath=${encodeURIComponent(storagePath)}`;
        }
      } catch (_) {}
      return undefined;
    }
    return value.length > 120000 ? value.slice(0, 120000) : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 1200).map((item) => sanitizePersistedValue(item, depth + 1)).filter((item) => item !== undefined);
  }
  if (typeof value !== "object") return undefined;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (["dataUrl", "localDataUrl", "audioDataUrl", "videoDataUrl", "inlineData"].includes(key)) continue;
    const sanitized = sanitizePersistedValue(item, depth + 1);
    if (sanitized !== undefined) result[key] = sanitized;
  }
  return result;
}

function publicJob(job = {}) {
  const result = job.result && typeof job.result === "object" ? job.result : null;
  const exportResult = job.export && typeof job.export === "object" ? job.export : null;
  const downloadUrl = String(job.downloadUrl || result?.downloadUrl || exportResult?.downloadUrl || "").trim();
  const ready = Boolean(downloadUrl || result?.storagePath || exportResult?.storagePath);
  const payload = {
    ok: true,
    jobId: String(job.jobId || "").trim(),
    status: ready ? "ready" : String(job.status || "queued").trim(),
    stage: ready ? "ready" : String(job.stage || "queued").trim(),
    progress: ready ? 1 : Math.max(0, Math.min(1, Number(job.progress || 0) || 0)),
    hint: ready ? "Export listo para descargar." : String(job.hint || "").trim(),
    updatedAt: String(job.updatedAt || new Date().toISOString()).trim()
  };
  for (const key of ["currentSceneIndex", "totalScenes", "failedSceneIndex"]) {
    if (Number.isFinite(Number(job[key]))) payload[key] = Math.max(0, Math.round(Number(job[key]) || 0));
  }
  for (const key of ["currentRowId", "sceneSubstage", "failedRowId", "failedSubstage", "heartbeatAt"]) {
    if (job[key]) payload[key] = String(job[key]);
  }
  if (Array.isArray(job.warnings) && job.warnings.length) payload.warnings = job.warnings;
  if (!ready && job.error && typeof job.error === "object") payload.error = job.error;
  if (result) payload.result = result;
  if (exportResult) payload.export = exportResult;
  if (downloadUrl) payload.downloadUrl = downloadUrl;
  return payload;
}

async function createMontageJob(req) {
  const authContext = await resolveAuthContext(req);
  const input = sanitizePersistedValue(req.body || {});
  const sessionId = cleanId(input?.sessionId || "");
  const entries = Array.isArray(input?.entries) ? input.entries : [];
  if (!entries.length || entries.length > 240) throw Object.assign(new Error("invalid_montage_entries"), { status: 422 });
  const { db, admin } = getAdminServices();
  const sessionSnapshot = await db.collection("podcaster_sessions").doc(sessionId).get();
  if (!sessionSnapshot.exists) throw Object.assign(new Error("podcaster_session_not_found"), { status: 404 });
  if (!sessionAccess(sessionSnapshot.data(), authContext)) throw Object.assign(new Error("podcaster_session_forbidden"), { status: 403 });
  const request = { input, baseUrl: "https://charly-brown.web.app" };
  if (Buffer.byteLength(JSON.stringify(request), "utf8") > MAX_PERSISTED_REQUEST_BYTES) {
    throw Object.assign(new Error("montage_request_requires_direct_uploads"), { status: 413 });
  }
  const jobId = crypto.randomUUID();
  const now = new Date();
  const job = {
    jobId,
    sessionId,
    ownerId: authContext.uid,
    type: "montage_export",
    status: "queued",
    stage: "queued",
    sceneSubstage: "",
    progress: 0,
    hint: "Export en cola.",
    currentSceneIndex: 0,
    totalScenes: entries.length,
    failedSceneIndex: 0,
    failedRowId: "",
    failedSubstage: "",
    warnings: [],
    result: null,
    error: null,
    request,
    heartbeatAt: now.toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + JOB_TTL_MS).toISOString()
  };
  const ref = db.collection(JOB_COLLECTION).doc(jobId);
  await ref.set(job);
  try {
    const queued = await enqueueHttpTask({
      queue: QUEUES.montage,
      kind: "montage",
      jobId,
      targetUrl: DISPATCH_URL,
      serviceAccountEmail: TASK_INVOKER
    });
    await ref.set({ taskName: queued.name, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  } catch (error) {
    await ref.set({
      status: "error",
      stage: "queue_unavailable",
      hint: "No se pudo iniciar la cola de exportación.",
      error: { code: "montage_task_enqueue_failed", message: String(error?.message || error).slice(0, 500) },
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    throw Object.assign(new Error("montage_task_enqueue_failed"), { status: 503, cause: error });
  }
  return job;
}

function registerMontageRoutes(app) {
  const createHandler = asyncRoute(async (req, res) => {
    const job = await createMontageJob(req);
    res.status(202).json({ ...publicJob(job), statusUrl: `/api/podcaster/montage/export-status?jobId=${encodeURIComponent(job.jobId)}` });
  });
  app.post("/api/podcaster/montage/export", createHandler);
  app.post("/api/podcaster/montage/export-v2", createHandler);

  app.post("/api/podcaster/montage/validate-export", asyncRoute(async (req, res) => {
    await resolveAuthContext(req);
    const input = sanitizePersistedValue(req.body || {});
    const entries = Array.isArray(input?.entries) ? input.entries : [];
    const issues = [];
    if (!input?.sessionId) issues.push({ code: "session_id_required", message: "Falta sessionId." });
    if (!entries.length) issues.push({ code: "entries_required", message: "No hay escenas para exportar." });
    if (entries.length > 240) issues.push({ code: "too_many_scenes", message: "El montaje excede 240 escenas." });
    res.status(issues.length ? 422 : 200).json({ ok: issues.length === 0, issueCount: issues.length, issues });
  }));

  app.get("/api/podcaster/montage/export-status", asyncRoute(async (req, res) => {
    const jobId = cleanId(req.query?.jobId || "");
    const { db } = getAdminServices();
    const snapshot = await db.collection(JOB_COLLECTION).doc(jobId).get();
    if (!snapshot.exists) throw Object.assign(new Error("job_not_found"), { status: 404 });
    res.status(200).json(publicJob(snapshot.data() || {}));
  }));

  app.post("/api/podcaster/montage/export-cancel", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const jobId = cleanId(req.body?.jobId || "");
    const { db, admin } = getAdminServices();
    const ref = db.collection(JOB_COLLECTION).doc(jobId);
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw Object.assign(new Error("job_not_found"), { status: 404 });
      const job = snapshot.data() || {};
      if (String(job.ownerId || "") !== authContext.uid) throw Object.assign(new Error("job_forbidden"), { status: 403 });
      if (["ready", "completed", "error", "cancelled"].includes(String(job.status || "").toLowerCase())) return;
      transaction.set(ref, { status: "cancelled", stage: "cancelled", hint: "Exportación cancelada.", dispatchLeaseUntil: admin.firestore.Timestamp.fromMillis(Date.now()), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    });
    const snapshot = await ref.get();
    res.status(200).json(publicJob(snapshot.data() || {}));
  }));
}

module.exports = {
  JOB_COLLECTION,
  MAX_PERSISTED_REQUEST_BYTES,
  TASK_INVOKER,
  DISPATCH_URL,
  sanitizePersistedValue,
  publicJob,
  registerMontageRoutes
};
