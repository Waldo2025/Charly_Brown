const { enqueueHttpTask, QUEUES } = require('./tasks.js');
const { PROJECT_ID, REGION } = require('./common.js');
const DELAY_SECONDS = 300;
const TARGET_URL = `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/recoverPigPenGenerationTask`;

// Durable reservation: parallel completions reuse one task for a run and epoch.
async function scheduleRecovery(store, runId, options = {}) {
  if (!store.db || typeof store.ref !== 'function') return;
  if (options.enabled !== true && !process.env.K_SERVICE && !process.env.FUNCTION_TARGET && process.env.DEMAND_RECOVERY_ENABLED !== 'true') return;
  const ref = store.ref(runId);
  const recovery = await store.db.runTransaction(async tx => {
    const run = (await tx.get(ref)).data();
    if (!['planning', 'running'].includes(run?.status)) return null;
    const previous = run.recovery || {};
    if (previous.epoch === run.epoch && previous.dueAt > Date.now()) {
      return previous.enqueued ? null : previous;
    }
    const next = { epoch: run.epoch, sequence: Number(previous.sequence || 0) + 1,
      dueAt: Date.now() + DELAY_SECONDS * 1000, enqueued: false };
    tx.update(ref, { recovery: next });
    return next;
  });
  if (!recovery) return;
  await (options.enqueue || enqueueHttpTask)({ queue: options.queue || QUEUES.pigpen, kind: `${options.queue || 'pigpen'}-recovery`,
    jobId: `${runId}:${recovery.epoch}:${recovery.sequence}`, targetUrl: options.targetUrl || TARGET_URL,
    serviceAccountEmail: `charly-tasks-invoker@${PROJECT_ID}.iam.gserviceaccount.com`,
    payload: { runId, epoch: recovery.epoch, sequence: recovery.sequence },
    scheduleDelaySeconds: Math.max(1, (recovery.dueAt - Date.now()) / 1000), dispatchDeadlineSeconds: 60 });
  await store.db.runTransaction(async tx => {
    const run = (await tx.get(ref)).data();
    if (run?.epoch === recovery.epoch && run.recovery?.sequence === recovery.sequence) {
      tx.update(ref, { 'recovery.enqueued': true });
    }
  });
}

async function recoverRun(coordinator, { runId, epoch, sequence }, options = {}) {
  const store = coordinator.store, ref = store.ref(runId);
  const claim = await store.db.runTransaction(async tx => {
    const run = (await tx.get(ref)).data();
    if (!['planning', 'running'].includes(run?.status) || run.epoch !== epoch) return false;
    const current = run.recovery;
    if (current?.epoch !== epoch) return false;
    if (current.sequence !== Number(sequence)) return current.sequence === Number(sequence) + 1 && !current.enqueued;
    // Clearing the reservation allows the next check to be scheduled first.
    tx.update(ref, { 'recovery.dueAt': 0, 'recovery.enqueued': false });
    return true;
  });
  if (!claim) return { skipped: true };
  await scheduleRecovery(store, runId, options);
  await coordinator.advance(runId);
  return { recovered: true };
}
module.exports = { scheduleRecovery, recoverRun, TARGET_URL };
