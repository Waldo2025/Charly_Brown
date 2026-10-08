const { getAdminServices } = require("./common.js");

const STALE_JOB_COLLECTIONS = [
  { name: "podcaster_export_jobs", maxAgeMs: 10 * 60 * 1000 },
  { name: "podcaster_ai_jobs", maxAgeMs: 15 * 60 * 1000 }
];
const REPEAT_ALERT_MS = 60 * 60 * 1000;

function timestampMillis(value) {
  if (typeof value?.toMillis === "function") return value.toMillis();
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function staleJobAge(job = {}, now = Date.now()) {
  const lastSeen = Math.max(
    timestampMillis(job.heartbeatAt),
    timestampMillis(job.updatedAt),
    timestampMillis(job.startedAt),
    timestampMillis(job.createdAt)
  );
  return lastSeen ? Math.max(0, now - lastSeen) : Number.POSITIVE_INFINITY;
}

function buildStaleJobPatch(collectionName = "", admin = null, job = {}) {
  const cleanCollectionName = String(collectionName || "");
  const serverTimestamp = admin?.firestore?.FieldValue?.serverTimestamp?.();
  if (cleanCollectionName === "podcaster_export_jobs") {
    const wasWaitingForWorker = ["worker_starting", "worker_booting"].includes(String(job?.stage || "").trim());
    return {
      status: "error",
      stage: "stale",
      retryable: false,
      hint: wasWaitingForWorker
        ? "Cloud Run aceptó la exportación, pero el worker no confirmó su inicio. No la vuelvas a enviar hasta confirmar en Cloud Run que la ejecución anterior terminó."
        : "La exportación dejó de enviar actividad y se cerró. Confirma que la ejecución anterior terminó antes de volver a intentarlo.",
      error: {
        code: wasWaitingForWorker ? "export_worker_start_timeout" : "export_job_heartbeat_expired",
        message: wasWaitingForWorker
          ? "No se recibió confirmación de inicio del worker antes de expirar el heartbeat."
          : "La exportación dejó de enviar señales de actividad y fue cerrada de forma segura."
      },
      ...(serverTimestamp ? {
        heartbeatAt: serverTimestamp,
        updatedAt: serverTimestamp
      } : {})
    };
  }
  if (cleanCollectionName !== "podcaster_ai_jobs") return null;
  return {
    status: "error",
    stage: "stale",
    retryable: false,
    hint: "La generación se interrumpió porque dejó de responder. Puedes intentarlo nuevamente.",
    error: {
      code: "ai_job_heartbeat_expired",
      message: "El trabajo de generación dejó de enviar señales de actividad y fue cerrado de forma segura."
    },
    ...(serverTimestamp ? { updatedAt: serverTimestamp } : {})
  };
}

async function monitorStalePodcasterJobs(now = Date.now()) {
  const { db, admin } = getAdminServices();
  let staleCount = 0;
  for (const collection of STALE_JOB_COLLECTIONS) {
    const snapshot = await db.collection(collection.name).where("status", "==", "running").limit(100).get();
    for (const document of snapshot.docs) {
      const job = document.data() || {};
      const ageMs = staleJobAge(job, now);
      // Durable Veo polling owns its deadline; an idle worker is expected between checks.
      if (job.videoOperation?.name && Number(job.videoOperation.deadlineAt) > now) continue;
      if (ageMs < collection.maxAgeMs) continue;
      const lastAlertAt = timestampMillis(job.monitoring?.lastStaleAlertAt);
      if (lastAlertAt && now - lastAlertAt < REPEAT_ALERT_MS) continue;
      const stalePatch = buildStaleJobPatch(collection.name, admin, job);
      if (!stalePatch) {
        console.error(JSON.stringify({
          severity: "ERROR",
          event: "podcaster_job_heartbeat_expired",
          collection: collection.name,
          jobId: document.id,
          type: String(job.type || "montage"),
          stage: String(job.stage || "running"),
          ageSeconds: Math.round(ageMs / 1000),
          recoveryFailed: true
        }));
        continue;
      }
      await document.ref.set({
        ...stalePatch,
        monitoring: { lastStaleAlertAt: admin.firestore.FieldValue.serverTimestamp() }
      }, { merge: true });
      console.warn(JSON.stringify({
        severity: "WARNING",
        event: "podcaster_stale_job_closed",
        collection: collection.name,
        jobId: document.id,
        type: String(job.type || "montage"),
        previousStage: String(job.stage || "running"),
        ageSeconds: Math.round(ageMs / 1000)
      }));
      staleCount += 1;
    }
  }
  return { staleCount };
}

module.exports = {
  STALE_JOB_COLLECTIONS,
  timestampMillis,
  staleJobAge,
  buildStaleJobPatch,
  monitorStalePodcasterJobs
};
