import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const MIGRATION_ID = "podcaster-active-trimester-1-2026-08-30";
const ACADEMIC_FIELDS = Object.freeze(["nivel", "grado", "trimestre", "unidad", "materia"]);

function clean(value = "") {
  return String(value ?? "").trim();
}

export function normalizeLegacyTrimester(value = "") {
  const compact = clean(value)
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s._-]+/g, "");
  const match = compact.match(/^(?:trim|trimestre)?([123])$/);
  return match ? match[1] : "";
}

function firstNonEmpty(values = []) {
  return values.map(clean).find(Boolean) || "";
}

export function resolveMigrationAcademicMetadata(sessionData = {}, dedicatedData = {}) {
  const nested = sessionData?.session && typeof sessionData.session === "object" ? sessionData.session : {};
  const rootAcademic = sessionData?.academicMetadata && typeof sessionData.academicMetadata === "object" ? sessionData.academicMetadata : {};
  const nestedAcademic = nested?.academicMetadata && typeof nested.academicMetadata === "object" ? nested.academicMetadata : {};
  const dedicatedAcademic = dedicatedData?.academicMetadata && typeof dedicatedData.academicMetadata === "object" ? dedicatedData.academicMetadata : {};
  const sources = [sessionData, rootAcademic, nested, nestedAcademic, dedicatedData, dedicatedAcademic];
  const metadata = Object.fromEntries(ACADEMIC_FIELDS.map((field) => [
    field,
    field === "trimestre"
      ? normalizeLegacyTrimester(firstNonEmpty(sources.map((source) => source?.[field])))
      : firstNonEmpty(sources.map((source) => source?.[field]))
  ]));
  return {
    ...metadata,
    unitLabel: firstNonEmpty(sources.map((source) => source?.unitLabel || source?.academicMetadataUnitLabel))
      || (metadata.nivel.toLocaleLowerCase("es") === "secundaria" ? "Tema" : "Unidad")
  };
}

function academicSnapshotMatches(source = {}, expected = {}) {
  const academic = source?.academicMetadata && typeof source.academicMetadata === "object" ? source.academicMetadata : {};
  return ACADEMIC_FIELDS.every((field) => clean(source?.[field]) === clean(expected[field]) && clean(academic?.[field]) === clean(expected[field]))
    && clean(academic?.unitLabel) === clean(expected.unitLabel);
}

export function planSessionTrimesterMigration(sessionId = "", sessionData = {}, dedicatedData = null) {
  if (sessionData?.archived === true) {
    return { sessionId: clean(sessionId), action: "archived_skipped", writes: null };
  }
  const dedicated = dedicatedData && typeof dedicatedData === "object" ? dedicatedData : {};
  const resolved = resolveMigrationAcademicMetadata(sessionData, dedicated);
  const assignedTrimester = !resolved.trimestre;
  const metadata = { ...resolved, trimestre: resolved.trimestre || "1" };
  const rootNeedsSync = !academicSnapshotMatches(sessionData, metadata);
  const dedicatedNeedsSync = !academicSnapshotMatches(dedicated, metadata)
    || clean(dedicated.entityId) !== clean(sessionId)
    || clean(dedicated.entityType) !== "session";
  if (!rootNeedsSync && !dedicatedNeedsSync) {
    return { sessionId: clean(sessionId), action: "unchanged", metadata, writes: null };
  }
  return {
    sessionId: clean(sessionId),
    action: assignedTrimester ? "assigned_trimester_1" : "synchronized",
    metadata,
    writes: { rootNeedsSync, dedicatedNeedsSync },
    previous: {
      root: Object.fromEntries([...ACADEMIC_FIELDS, "academicMetadata", "academicMetadataUnitLabel"].map((field) => [field, sessionData?.[field]])),
      dedicatedExists: Boolean(dedicatedData),
      dedicated: dedicatedData || null
    }
  };
}

function buildSnapshotPatch(metadata = {}, nowIso = "") {
  return {
    academicMetadata: { ...metadata },
    nivel: metadata.nivel,
    grado: metadata.grado,
    trimestre: metadata.trimestre,
    unidad: metadata.unidad,
    materia: metadata.materia,
    academicMetadataUnitLabel: metadata.unitLabel,
    academicMetadataUpdatedAt: nowIso,
    academicMetadataUpdatedAtIso: nowIso,
    academicMetadataMigrationId: MIGRATION_ID
  };
}

async function getDocumentsByRefs(db, refs = []) {
  const snapshots = [];
  for (let offset = 0; offset < refs.length; offset += 250) {
    snapshots.push(...await db.getAll(...refs.slice(offset, offset + 250)));
  }
  return snapshots;
}

async function runMigration() {
  const apply = process.argv.includes("--apply");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const requireFromFunctions = createRequire(path.join(root, "functions/package.json"));
  const { initializeApp, applicationDefault, deleteApp } = requireFromFunctions("firebase-admin/app");
  const { getFirestore, FieldValue } = requireFromFunctions("firebase-admin/firestore");
  const projectArg = process.argv.find((arg) => arg.startsWith("--project="));
  const projectId = clean(projectArg?.slice("--project=".length) || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || "charly-brown");
  const app = initializeApp({ projectId, credential: applicationDefault() }, `trimester-backfill-${Date.now()}`);
  const db = getFirestore(app);
  const startedAt = new Date().toISOString();
  const sessionSnapshot = await db.collection("podcaster_sessions").get();
  const activeDocuments = sessionSnapshot.docs.filter((document) => document.data()?.archived !== true);
  const metadataRefs = activeDocuments.map((document) => db.collection("podcaster_academic_metadata").doc(document.id));
  const metadataSnapshots = await getDocumentsByRefs(db, metadataRefs);
  const dedicatedById = new Map(metadataSnapshots.map((snapshot) => [snapshot.id, snapshot.exists ? snapshot.data() || {} : null]));
  const plans = sessionSnapshot.docs.map((document) => planSessionTrimesterMigration(
    document.id,
    document.data() || {},
    dedicatedById.get(document.id) || null
  ));
  const stats = plans.reduce((summary, plan) => {
    summary.total += 1;
    summary[plan.action] = (summary[plan.action] || 0) + 1;
    return summary;
  }, { total: 0, archived_skipped: 0, assigned_trimester_1: 0, synchronized: 0, unchanged: 0, failed: 0 });
  const actionable = plans.filter((plan) => plan.writes);

  if (apply) {
    for (let offset = 0; offset < actionable.length; offset += 190) {
      const batch = db.batch();
      const batchPlans = actionable.slice(offset, offset + 190);
      for (const plan of batchPlans) {
        const snapshotPatch = buildSnapshotPatch(plan.metadata, startedAt);
        if (plan.writes.rootNeedsSync) {
          batch.set(db.collection("podcaster_sessions").doc(plan.sessionId), snapshotPatch, { merge: true });
        }
        if (plan.writes.dedicatedNeedsSync) {
          batch.set(db.collection("podcaster_academic_metadata").doc(plan.sessionId), {
            entityId: plan.sessionId,
            entityType: "session",
            ...snapshotPatch,
            migration: {
              id: MIGRATION_ID,
              action: plan.action,
              migratedAt: startedAt
            },
            updatedAt: FieldValue.serverTimestamp(),
            updatedAtIso: startedAt
          }, { merge: true });
        }
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
    changes: actionable
  };
  const reportArg = process.argv.find((arg) => arg.startsWith("--report="));
  const reportPath = path.resolve(root, reportArg?.slice("--report=".length) || `migration-reports/${MIGRATION_ID}-${apply ? "apply" : "dry-run"}-${Date.now()}.json`);
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ...stats, mode: report.mode, projectId, reportPath }, null, 2));
  if (!apply) console.log("Dry-run completado; usa --apply para escribir los cambios.");
  await deleteApp(app);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  runMigration().catch((error) => {
    console.error("[trimester-backfill] Error:", error);
    process.exitCode = 1;
  });
}
