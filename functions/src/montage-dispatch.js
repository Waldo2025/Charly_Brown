const { v2 } = require("@google-cloud/run");
const { PROJECT_ID, REGION, getAdminServices } = require("./common.js");

const MONTAGE_JOB_NAME = "podcaster-montage-export";
const DISPATCH_LEASE_MS = 40 * 60 * 1000;
const MAX_ACTIVE_MONTAGE_JOBS = 2;
const RUNTIME_COLLECTION = "podcaster_runtime";
const MONTAGE_SEMAPHORE_ID = "montage_dispatch";
const ACTIVE_MONTAGE_STATUSES = new Set(["dispatching", "running"]);

function shouldRetainMontageLease(lease = {}, job = null, now = Date.now()) {
  const activeLeaseMs = lease?.leaseUntil?.toMillis?.() || Number(lease?.leaseUntilMs || 0) || 0;
  const status = String(job?.status || "").trim().toLowerCase();
  return activeLeaseMs > now && Boolean(job) && ACTIVE_MONTAGE_STATUSES.has(status);
}

function buildRunJobRequest({
  projectId = PROJECT_ID,
  region = REGION,
  jobName = MONTAGE_JOB_NAME,
  jobId,
  publicBaseUrl = "https://charly-brown.web.app"
} = {}) {
  const cleanJobId = String(jobId || "").trim();
  if (!cleanJobId) throw new Error("montage_job_id_required");
  return {
    name: `projects/${projectId}/locations/${region}/jobs/${jobName}`,
    overrides: {
      taskCount: 1,
      timeout: { seconds: 1800 },
      containerOverrides: [{
        env: [
          { name: "MONTAGE_JOB_ID", value: cleanJobId },
          { name: "PUBLIC_BACKEND_BASE_URL", value: String(publicBaseUrl || "https://charly-brown.web.app") },
          { name: "BACKEND_SERVICE_ROLE", value: "export" }
        ]
      }]
    }
  };
}

async function claimMontageDispatch({ db, admin, jobId, taskName = "" }) {
  const ref = db.collection("podcaster_export_jobs").doc(jobId);
  const semaphoreRef = db.collection(RUNTIME_COLLECTION).doc(MONTAGE_SEMAPHORE_ID);
  return db.runTransaction(async (transaction) => {
    const [snapshot, semaphoreSnapshot] = await Promise.all([
      transaction.get(ref),
      transaction.get(semaphoreRef)
    ]);
    if (!snapshot.exists) throw Object.assign(new Error("montage_job_not_found"), { status: 404 });
    const job = snapshot.data() || {};
    const status = String(job.status || "").toLowerCase();
    if (["ready", "completed", "cancelled", "canceled"].includes(status)) {
      return { claimed: false, terminal: true, status };
    }
    const leaseUntilMs = job.dispatchLeaseUntil?.toMillis?.() || 0;
    if (["dispatching", "running"].includes(status) && leaseUntilMs > Date.now()) {
      return { claimed: false, duplicate: true, status, executionName: String(job.executionName || "") };
    }
    const storedActive = semaphoreSnapshot.exists && semaphoreSnapshot.data()?.active && typeof semaphoreSnapshot.data().active === "object"
      ? semaphoreSnapshot.data().active
      : {};
    const candidates = Object.entries(storedActive)
      .filter(([activeJobId]) => activeJobId !== jobId);
    const candidateSnapshots = await Promise.all(candidates.map(([activeJobId]) => (
      transaction.get(db.collection("podcaster_export_jobs").doc(activeJobId))
    )));
    const active = {};
    candidates.forEach(([activeJobId, lease], index) => {
      const activeJobSnapshot = candidateSnapshots[index];
      const activeJob = activeJobSnapshot?.exists ? activeJobSnapshot.data() : null;
      if (shouldRetainMontageLease(lease, activeJob)) active[activeJobId] = lease;
    });
    if (Object.keys(active).length !== candidates.length) {
      console.warn("[montage-dispatch] pruned stale capacity leases", {
        previousCount: candidates.length,
        activeCount: Object.keys(active).length
      });
    }
    if (Object.keys(active).length >= MAX_ACTIVE_MONTAGE_JOBS) {
      throw Object.assign(new Error("montage_capacity_busy"), { status: 429 });
    }
    const attempt = Math.max(0, Number(job.dispatchAttempt || 0) || 0) + 1;
    const leaseUntil = admin.firestore.Timestamp.fromMillis(Date.now() + DISPATCH_LEASE_MS);
    active[jobId] = { leaseUntil, taskName: String(taskName || ""), attempt };
    transaction.set(semaphoreRef, {
      active,
      maxActive: MAX_ACTIVE_MONTAGE_JOBS,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    transaction.set(ref, {
      status: "dispatching",
      stage: "dispatch_cloud_run",
      hint: "Reservando los recursos necesarios para crear tu video.",
      dispatchAttempt: attempt,
      dispatchTaskName: String(taskName || ""),
      dispatchLeaseUntil: leaseUntil,
      heartbeatAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return { claimed: true, attempt };
  });
}

async function releaseMontageSlot({ db, admin, jobId }) {
  const semaphoreRef = db.collection(RUNTIME_COLLECTION).doc(MONTAGE_SEMAPHORE_ID);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(semaphoreRef);
    if (!snapshot.exists) return;
    const active = snapshot.data()?.active && typeof snapshot.data().active === "object"
      ? { ...snapshot.data().active }
      : {};
    if (!Object.prototype.hasOwnProperty.call(active, jobId)) return;
    delete active[jobId];
    transaction.set(semaphoreRef, {
      active,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  });
}

async function dispatchMontageToCloudRun({ jobId, taskName = "", jobsClient = new v2.JobsClient() } = {}) {
  const { db, admin } = getAdminServices();
  let claim;
  try {
    claim = await claimMontageDispatch({ db, admin, jobId, taskName });
  } catch (error) {
    if (String(error?.message || "") === "montage_capacity_busy") {
      await db.collection("podcaster_export_jobs").doc(jobId).set({
        status: "queued",
        stage: "waiting_capacity",
        hint: "Hay otras exportaciones en curso. La tuya comenzará automáticamente en cuanto haya un turno disponible.",
        heartbeatAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true }).catch(() => {});
    }
    throw error;
  }
  if (!claim.claimed) return claim;
  const request = buildRunJobRequest({ jobId });
  try {
    const [operation] = await jobsClient.runJob(request);
    const executionName = String(operation?.name || "").trim();
    await db.collection("podcaster_export_jobs").doc(jobId).set({
      status: "running",
      stage: "worker_starting",
      hint: "El motor de exportación está arrancando y enseguida comenzará con las escenas.",
      executionName,
      heartbeatAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return { claimed: true, executionName, attempt: claim.attempt };
  } catch (error) {
    await releaseMontageSlot({ db, admin, jobId }).catch(() => {});
    await db.collection("podcaster_export_jobs").doc(jobId).set({
      status: "retrying",
      stage: "dispatch_retry",
      hint: "No pudimos iniciar el motor todavía. Volveremos a intentarlo automáticamente.",
      dispatchError: String(error?.message || error).slice(0, 500),
      dispatchLeaseUntil: admin.firestore.Timestamp.fromMillis(Date.now()),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).catch(() => {});
    throw error;
  }
}

module.exports = {
  MONTAGE_JOB_NAME,
  DISPATCH_LEASE_MS,
  MAX_ACTIVE_MONTAGE_JOBS,
  shouldRetainMontageLease,
  buildRunJobRequest,
  claimMontageDispatch,
  releaseMontageSlot,
  dispatchMontageToCloudRun
};
