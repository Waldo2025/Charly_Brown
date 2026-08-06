import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const execute = process.argv.includes("--execute");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireFromFunctions = createRequire(path.join(root, "functions/package.json"));
const { initializeApp, applicationDefault, deleteApp } = requireFromFunctions("firebase-admin/app");
const { getFirestore, FieldValue } = requireFromFunctions("firebase-admin/firestore");
const app = initializeApp({ projectId: "charly-brown", credential: applicationDefault() }, `reconcile-${Date.now()}`);
const db = getFirestore(app);
const staleBefore = Date.now() - 60 * 60 * 1000;

function timestampMillis(value) {
  if (typeof value?.toMillis === "function") return value.toMillis();
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

const stale = [];
for (const status of ["queued", "running"]) {
  const snapshot = await db.collection("podcaster_export_jobs").where("status", "==", status).get();
  for (const document of snapshot.docs) {
    const job = document.data() || {};
    const lastSeen = Math.max(timestampMillis(job.heartbeatAt), timestampMillis(job.updatedAt), timestampMillis(job.createdAt));
    if (lastSeen && lastSeen < staleBefore) stale.push({ document, status, stage: String(job.stage || status), lastSeen });
  }
}

console.log(`[reconcile] trabajos de montaje abandonados: ${stale.length}`);
if (!execute) {
  console.log("[reconcile] dry-run; usa --execute para marcarlos como interrumpidos.");
  await deleteApp(app);
  process.exit(0);
}

for (let offset = 0; offset < stale.length; offset += 400) {
  const batch = db.batch();
  for (const item of stale.slice(offset, offset + 400)) {
    batch.set(item.document.ref, {
      status: "error",
      stage: "interrupted",
      hint: "Exportación interrumpida antes de la migración a Google Cloud. Inicia una exportación nueva.",
      error: {
        code: "legacy_job_interrupted_by_google_cloud_migration",
        message: "El worker anterior dejó de emitir heartbeat y el trabajo no puede recuperarse de forma segura."
      },
      migrationReconciliation: {
        previousStatus: item.status,
        previousStage: item.stage,
        reconciledAt: FieldValue.serverTimestamp()
      },
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }
  await batch.commit();
}

console.log(`[reconcile] trabajos marcados interrupted: ${stale.length}`);
await deleteApp(app);
