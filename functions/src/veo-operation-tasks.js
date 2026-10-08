const { enqueueHttpTask, QUEUES } = require('./tasks.js');
const { REGION, PROJECT_ID } = require('./common.js');
const POLL_URL = `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/pollVeoOperationTask`;
async function scheduleOperationPoll(job, ref, admin, { releaseLease = true, db = ref.firestore, enqueue = enqueueHttpTask } = {}) {
  const reservation = await db.runTransaction(async tx => {
    const current = (await tx.get(ref)).data();
    if (!current || ['ready', 'cancelled'].includes(current.status) || (current.status === 'error' && current.retryable === false)) return null;
    if (current.videoPoll?.dueAt > 0) return current.videoPoll;
    const next = { sequence: Number(current.videoPoll?.sequence || 0) + 1,
      dueAt: Date.now() + (Number(current.videoPoll?.sequence || 0) === 0 ? 30000 : 60000), enqueued: false };
    tx.set(ref, { videoPoll: next }, { merge: true });
    return next;
  });
  if (!reservation) return;
  if (!reservation.enqueued) {
    await enqueue({ queue: QUEUES.veo, kind: 'veo-operation', jobId: `${job.jobId}:${reservation.sequence}`, targetUrl: POLL_URL,
      serviceAccountEmail: `charly-tasks-invoker@${PROJECT_ID}.iam.gserviceaccount.com`,
      payload: { jobId: job.jobId, sequence: reservation.sequence },
      scheduleDelaySeconds: Math.max(1, (reservation.dueAt - Date.now()) / 1000), dispatchDeadlineSeconds: 60 });
    await db.runTransaction(async tx => {
      const current = (await tx.get(ref)).data();
      if (current?.videoPoll?.sequence === reservation.sequence) tx.update(ref, { 'videoPoll.enqueued': true });
    });
  }
  if (releaseLease) await ref.set({ leaseUntil: admin.firestore.Timestamp.fromMillis(0),
    stage: 'vertex_video_generation', hint: 'Vertex AI está generando el video.',
    heartbeatAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
}
module.exports = { scheduleOperationPoll, POLL_URL };
