const crypto = require("node:crypto");
const {
  PROJECT_ID,
  REGION,
  getAdminServices,
  resolveAuthContext,
  asyncRoute
} = require("./common.js");
const { enqueueHttpTask, QUEUES } = require("./tasks.js");
const { releaseMontageSlot } = require("./montage-dispatch.js");
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

async function uploadInlineAudioAssetsToStorage(rawBody = {}, jobId = "", bucket = null) {
  if (!rawBody || typeof rawBody !== "object" || !bucket) return rawBody;

  const processAsset = async (asset, prefix = "audio") => {
    if (!asset || typeof asset !== "object") return asset;
    const storagePath = String(asset.storagePath || "").trim();
    const downloadUrl = String(asset.downloadUrl || asset.url || "").trim();
    const isNetworkOrStorage = (val) => val.startsWith("http://") || val.startsWith("https://") || val.startsWith("gs://");
    if (storagePath || isNetworkOrStorage(downloadUrl)) return asset;

    const dataCandidate = String(asset.dataUrl || asset.localDataUrl || asset.url || asset.downloadUrl || "").trim();
    if (!dataCandidate.startsWith("data:")) return asset;

    const match = dataCandidate.match(/^data:([^;]+);base64,(.+)$/i);
    if (!match) return asset;

    const contentType = match[1] || "audio/wav";
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, "base64");
    const ext = contentType.includes("mpeg") || contentType.includes("mp3") ? "mp3" : (contentType.includes("ogg") ? "ogg" : "wav");
    const rowId = String(asset.rowId || asset.id || crypto.randomUUID()).trim();
    const destPath = `podcaster/exports/temp_audio/${jobId}/${prefix}_${rowId}.${ext}`;
    const token = crypto.randomUUID();
    const file = bucket.file(destPath);
    await file.save(buffer, {
      contentType,
      metadata: {
        metadata: {
          firebaseStorageDownloadTokens: token,
          jobId
        }
      }
    });

    const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(destPath)}?alt=media&token=${token}`;
    return {
      ...asset,
      storagePath: destPath,
      downloadUrl: publicUrl,
      url: publicUrl
    };
  };

  const rawEntries = Array.isArray(rawBody.entries) ? rawBody.entries : [];
  for (let i = 0; i < rawEntries.length; i += 1) {
    if (rawEntries[i]?.audio) {
      rawEntries[i].audio = await processAsset(rawEntries[i].audio, `entry_${i}`);
    }
  }

  if (rawBody.dialogueAudioMap && typeof rawBody.dialogueAudioMap === "object") {
    for (const [rowId, clip] of Object.entries(rawBody.dialogueAudioMap)) {
      rawBody.dialogueAudioMap[rowId] = await processAsset(clip, `dialogue_${rowId}`);
    }
  }

  if (rawBody.audioTimeline && typeof rawBody.audioTimeline === "object") {
    if (Array.isArray(rawBody.audioTimeline.geminiSegments)) {
      for (let i = 0; i < rawBody.audioTimeline.geminiSegments.length; i += 1) {
        rawBody.audioTimeline.geminiSegments[i] = await processAsset(rawBody.audioTimeline.geminiSegments[i], `gemini_${i}`);
      }
    }
    if (Array.isArray(rawBody.audioTimeline.backgroundSegments)) {
      for (let i = 0; i < rawBody.audioTimeline.backgroundSegments.length; i += 1) {
        rawBody.audioTimeline.backgroundSegments[i] = await processAsset(rawBody.audioTimeline.backgroundSegments[i], `bg_${i}`);
      }
    }
  }

  if (rawBody.backgroundMusic && typeof rawBody.backgroundMusic === "object") {
    rawBody.backgroundMusic = await processAsset(rawBody.backgroundMusic, "background_music");
  }

  return rawBody;
}

async function createMontageJob(req) {
  const authContext = await resolveAuthContext(req);
  const { db, admin, bucket } = getAdminServices();
  const jobId = crypto.randomUUID();
  const rawBody = req.body || {};
  await uploadInlineAudioAssetsToStorage(rawBody, jobId, bucket).catch((err) => {
    console.warn("[functions][montage-routes] inline audio upload to storage fallback warning:", String(err?.message || err));
  });
  const input = sanitizePersistedValue(rawBody);
  const sessionId = cleanId(input?.sessionId || "");
  const entries = Array.isArray(input?.entries) ? input.entries : [];
  if (!entries.length || entries.length > 240) throw Object.assign(new Error("invalid_montage_entries"), { status: 422 });
  const sessionSnapshot = await db.collection("podcaster_sessions").doc(sessionId).get();
  if (!sessionSnapshot.exists) throw Object.assign(new Error("podcaster_session_not_found"), { status: 404 });
  if (!sessionAccess(sessionSnapshot.data(), authContext)) throw Object.assign(new Error("podcaster_session_forbidden"), { status: 403 });
  const request = { input, baseUrl: "https://charly-brown.web.app" };
  if (Buffer.byteLength(JSON.stringify(request), "utf8") > MAX_PERSISTED_REQUEST_BYTES) {
    throw Object.assign(new Error("montage_request_requires_direct_uploads"), { status: 413 });
  }
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
    hint: "Tu proyecto está en espera y comenzará automáticamente en unos momentos.",
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
    const authContext = await resolveAuthContext(req);
    const jobId = cleanId(req.query?.jobId || "");
    const { db } = getAdminServices();
    const snapshot = await db.collection(JOB_COLLECTION).doc(jobId).get();
    if (!snapshot.exists) throw Object.assign(new Error("job_not_found"), { status: 404 });
    const job = snapshot.data() || {};
    if (String(job.ownerId || "") !== authContext.uid) throw Object.assign(new Error("job_forbidden"), { status: 403 });
    res.status(200).json(publicJob(job));
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
    await releaseMontageSlot({ db, admin, jobId }).catch((error) => {
      console.warn("[montage-cancel] could not release dispatch slot", {
        jobId,
        message: String(error?.message || error)
      });
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
