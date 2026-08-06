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

async function monitorStalePodcasterJobs(now = Date.now()) {
  const { db, admin } = getAdminServices();
  let staleCount = 0;
  for (const collection of STALE_JOB_COLLECTIONS) {
    const snapshot = await db.collection(collection.name).where("status", "==", "running").limit(100).get();
    for (const document of snapshot.docs) {
      const job = document.data() || {};
      const ageMs = staleJobAge(job, now);
      if (ageMs < collection.maxAgeMs) continue;
      const lastAlertAt = timestampMillis(job.monitoring?.lastStaleAlertAt);
      if (lastAlertAt && now - lastAlertAt < REPEAT_ALERT_MS) continue;
      console.error(JSON.stringify({
        severity: "ERROR",
        event: "podcaster_job_heartbeat_expired",
        collection: collection.name,
        jobId: document.id,
        type: String(job.type || "montage"),
        stage: String(job.stage || "running"),
        ageSeconds: Math.round(ageMs / 1000)
      }));
      await document.ref.set({
        monitoring: { lastStaleAlertAt: admin.firestore.FieldValue.serverTimestamp() }
      }, { merge: true });
      staleCount += 1;
    }
  }
  return { staleCount };
}

module.exports = { STALE_JOB_COLLECTIONS, timestampMillis, staleJobAge, monitorStalePodcasterJobs };
