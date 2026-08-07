"use strict";

process.env.BACKEND_SERVICE_ROLE = process.env.BACKEND_SERVICE_ROLE || "export";
process.env.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "charly-brown";
process.env.FIREBASE_STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || "charly-brown.firebasestorage.app";

const {
  montageExportJobStore,
  db,
  executeMontageExportPipeline,
  buildMontageSceneFailure,
  getBackendPublicBaseUrl
} = require("../server.js");
const { createProcessMontageExportJob } = require("../montage-export/worker-runner.js");
const admin = require("firebase-admin");

const activeJobId = String(process.env.MONTAGE_JOB_ID || process.argv[2] || "").trim();
let terminationPromise = null;

async function releaseMontageSlot(jobId) {
  const ref = db.collection("podcaster_runtime").doc("montage_dispatch");
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return;
    const active = snapshot.data()?.active && typeof snapshot.data().active === "object"
      ? { ...snapshot.data().active }
      : {};
    if (!Object.prototype.hasOwnProperty.call(active, jobId)) return;
    delete active[jobId];
    transaction.set(ref, {
      active,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  });
}

async function markInterruptedAndExit(signal = "SIGTERM") {
  if (terminationPromise) return terminationPromise;
  terminationPromise = (async () => {
    try {
      const current = activeJobId ? await montageExportJobStore.getJob(activeJobId).catch(() => null) : null;
      const status = String(current?.status || "").trim().toLowerCase();
      if (current && !["ready", "completed", "cancelled", "error"].includes(status)) {
        await montageExportJobStore.updateJob(activeJobId, {
          status: "error",
          stage: "interrupted",
          progress: Math.max(0, Math.min(0.98, Number(current?.progress || 0) || 0)),
          hint: "La exportación fue interrumpida por la plataforma. Puedes volver a intentarlo.",
          interruptedAt: new Date().toISOString(),
          error: {
            code: "montage_export_interrupted",
            message: `Cloud Run detuvo el worker (${signal}).`,
            retryable: true
          }
        });
      }
    } finally {
      await releaseMontageSlot(activeJobId).catch(() => {});
    }
  })();
  await Promise.race([
    terminationPromise,
    new Promise((resolve) => setTimeout(resolve, 8000))
  ]);
  process.exit(143);
}

process.once("SIGTERM", () => { void markInterruptedAndExit("SIGTERM"); });
process.once("SIGINT", () => { void markInterruptedAndExit("SIGINT"); });

async function main() {
  const jobId = activeJobId;
  if (!jobId) throw new Error("montage_job_id_required");
  const storedJob = await montageExportJobStore.getJob(jobId);
  if (!storedJob) throw new Error("montage_job_not_found");
  const processor = createProcessMontageExportJob({
    jobStore: montageExportJobStore,
    executeMontageExportPipeline,
    buildMontageSceneFailure
  });
  console.info("[cloud-run-job][montage-export] starting", {
    jobId,
    sessionId: String(storedJob.sessionId || ""),
    ownerId: String(storedJob.ownerId || ""),
    taskIndex: String(process.env.CLOUD_RUN_TASK_INDEX || "0"),
    execution: String(process.env.CLOUD_RUN_EXECUTION || "")
  });
  await processor({
    id: jobId,
    data: {
      jobId,
      sessionId: String(storedJob.sessionId || ""),
      ownerId: String(storedJob.ownerId || ""),
      baseUrl: getBackendPublicBaseUrl()
    }
  });
  console.info("[cloud-run-job][montage-export] completed", { jobId });
}

main().then(async () => {
  try {
    await releaseMontageSlot(activeJobId);
    console.info("[cloud-run-job][montage-export] capacity slot released", { jobId: activeJobId });
  } catch (error) {
    console.error("[cloud-run-job][montage-export] capacity slot release failed", {
      jobId: activeJobId,
      message: String(error?.message || error)
    });
  }
  process.exit(0);
}).catch(async (error) => {
  console.error("[cloud-run-job][montage-export] failed", {
    jobId: String(process.env.MONTAGE_JOB_ID || process.argv[2] || ""),
    code: String(error?.code || ""),
    message: String(error?.message || error),
    stack: String(error?.stack || "")
  });
  await releaseMontageSlot(activeJobId).catch((releaseError) => {
    console.error("[cloud-run-job][montage-export] capacity slot release failed", {
      jobId: activeJobId,
      message: String(releaseError?.message || releaseError)
    });
  });
  process.exit(1);
});
