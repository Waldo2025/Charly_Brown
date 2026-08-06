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

async function main() {
  const jobId = String(process.env.MONTAGE_JOB_ID || process.argv[2] || "").trim();
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
  await releaseMontageSlot(String(process.env.MONTAGE_JOB_ID || process.argv[2] || "").trim()).catch(() => {});
  process.exit(0);
}).catch(async (error) => {
  console.error("[cloud-run-job][montage-export] failed", {
    jobId: String(process.env.MONTAGE_JOB_ID || process.argv[2] || ""),
    code: String(error?.code || ""),
    message: String(error?.message || error),
    stack: String(error?.stack || "")
  });
  await releaseMontageSlot(String(process.env.MONTAGE_JOB_ID || process.argv[2] || "").trim()).catch(() => {});
  process.exit(1);
});
