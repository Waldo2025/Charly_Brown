import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const MIGRATION_ID = "science-activities-trimester-1-2026-08-31";

export function normalizeScienceTrimester(value, fallback = "") {
  const compact = String(value ?? "")
    .trim()
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s._-]+/g, "");
  const match = compact.match(/^(?:trim|trimestre)?([123])$/);
  return match ? `Trimestre ${match[1]}` : fallback;
}

export function planScienceTrimesterMigration(documentId = "", data = {}) {
  const rootTrimester = normalizeScienceTrimester(data?.trimester);
  const activityTrimester = normalizeScienceTrimester(data?.activity?.trimester);
  if (rootTrimester && activityTrimester && rootTrimester !== activityTrimester) {
    return {
      documentId,
      action: "conflict_skipped",
      previous: { root: data?.trimester ?? null, activity: data?.activity?.trimester ?? null },
      writes: null
    };
  }
  const trimester = rootTrimester || activityTrimester || "Trimestre 1";
  const rootNeedsSync = data?.trimester !== trimester;
  const activityNeedsSync = data?.activity?.trimester !== trimester;
  if (!rootNeedsSync && !activityNeedsSync) {
    return { documentId, action: "unchanged", trimester, writes: null };
  }
  return {
    documentId,
    action: rootTrimester || activityTrimester ? "synchronized" : "assigned_trimester_1",
    trimester,
    previous: { root: data?.trimester ?? null, activity: data?.activity?.trimester ?? null },
    writes: { rootNeedsSync, activityNeedsSync }
  };
}

async function runMigration() {
  const apply = process.argv.includes("--apply");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const requireFromFunctions = createRequire(path.join(root, "functions/package.json"));
  const { initializeApp, applicationDefault, deleteApp } = requireFromFunctions("firebase-admin/app");
  const { getFirestore, FieldValue } = requireFromFunctions("firebase-admin/firestore");
  const projectArg = process.argv.find((arg) => arg.startsWith("--project="));
  const projectId = String(projectArg?.slice("--project=".length) || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || "charly-brown").trim();
  const app = initializeApp({ projectId, credential: applicationDefault() }, `science-trimester-backfill-${Date.now()}`);
  const db = getFirestore(app);
  const startedAt = new Date().toISOString();
  const snapshot = await db.collection("science_activity_sessions").get();
  const plans = snapshot.docs.map((document) => planScienceTrimesterMigration(document.id, document.data() || {}));
  const stats = plans.reduce((summary, plan) => {
    summary.total += 1;
    summary[plan.action] = (summary[plan.action] || 0) + 1;
    return summary;
  }, { total: 0, assigned_trimester_1: 0, synchronized: 0, unchanged: 0, conflict_skipped: 0, failed: 0 });
  const actionable = plans.filter((plan) => plan.writes);

  if (apply) {
    for (let offset = 0; offset < actionable.length; offset += 400) {
      const batch = db.batch();
      const batchPlans = actionable.slice(offset, offset + 400);
      for (const plan of batchPlans) {
        const patch = {
          trimester: plan.trimester,
          "activity.trimester": plan.trimester,
          trimesterMigrationId: MIGRATION_ID,
          trimesterMigratedAt: FieldValue.serverTimestamp()
        };
        batch.update(db.collection("science_activity_sessions").doc(plan.documentId), patch);
      }
      try {
        await batch.commit();
      } catch (error) {
        stats.failed += batchPlans.length;
        throw error;
      }
    }
  }

  const report = {
    migrationId: MIGRATION_ID,
    mode: apply ? "apply" : "dry-run",
    projectId,
    startedAt,
    completedAt: new Date().toISOString(),
    stats,
    changes: plans.filter((plan) => plan.action !== "unchanged")
  };
  const reportArg = process.argv.find((arg) => arg.startsWith("--report="));
  const reportPath = path.resolve(root, reportArg?.slice("--report=".length) || `migration-reports/${MIGRATION_ID}-${report.mode}-${Date.now()}.json`);
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ...stats, mode: report.mode, projectId, reportPath }, null, 2));
  if (!apply) console.log("Dry-run completado; usa --apply para escribir los cambios.");
  await deleteApp(app);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  runMigration().catch((error) => {
    console.error("[science-trimester-backfill] Error:", error);
    process.exitCode = 1;
  });
}
