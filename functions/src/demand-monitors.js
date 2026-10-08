const { createHash } = require('node:crypto');
const { getAdminServices, PROJECT_ID, REGION } = require('./common.js');
const { enqueueHttpTask, QUEUES } = require('./tasks.js');
const { staleJobAge, buildStaleJobPatch, STALE_JOB_COLLECTIONS } = require('./stale-job-monitor.js');
const URL = `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/checkPendingWorkTask`;
const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stamp = value => value?.toMillis?.() || Date.parse(String(value || '')) || 0;
const calendarActive = item => ['idea','planned','researching','drafting','review','approved','scheduled'].includes(item?.status) && stamp(item.publishAtUtc) > 0;
async function schedule(kind, id, version, dueAt, { db = getAdminServices().db, enqueue = enqueueHttpTask, expectedSequence } = {}) {
  const ref = db.collection('DemandMonitorReservations').doc(fingerprint([kind,id]));
  const reservation = await db.runTransaction(async tx => {
    const old = (await tx.get(ref)).data() || {};
    if (expectedSequence !== undefined && (old.sequence !== expectedSequence || old.version !== version)) return null;
    if (old.version === version && old.dueAt > 0) return old;
    const next = { kind,id,version,sequence:Number(old.sequence || 0)+1,dueAt,enqueued:false };
    tx.set(ref,next);return next;
  });
  if (!reservation) return;
  if (!reservation.enqueued) {
    await enqueue({ queue:QUEUES.marcie,kind:'pending-work',jobId:`${kind}:${id}:${reservation.sequence}`,targetUrl:URL,
      serviceAccountEmail:`charly-tasks-invoker@${PROJECT_ID}.iam.gserviceaccount.com`,payload:{kind,id,sequence:reservation.sequence},
      scheduleDelaySeconds:Math.max(1,(reservation.dueAt-Date.now())/1000),maxScheduleDelaySeconds:28*86400,dispatchDeadlineSeconds:120 });
    await db.runTransaction(async tx=>{const current=(await tx.get(ref)).data();if(current?.sequence===reservation.sequence)tx.update(ref,{enqueued:true});});
  }
}
async function handle(payload, { db, admin, enqueue = enqueueHttpTask, monitorCalendar } = getAdminServices()) {
  const { kind,id,sequence } = payload || {};
  if (!['calendar',...STALE_JOB_COLLECTIONS.map(c=>c.name)].includes(kind) || !/^[\w.-]{1,200}$/.test(id || '') || !Number.isSafeInteger(sequence)) throw Object.assign(Error('invalid_pending_task'),{status:400});
  const reservationRef=db.collection('DemandMonitorReservations').doc(fingerprint([kind,id]));
  const claim=await db.runTransaction(async tx=>{
    const value=(await tx.get(reservationRef)).data();
    if(!value)return null;
    if(value.sequence!==sequence)return value.sequence===sequence+1&&!value.enqueued?{repair:value}:null;
    if(value.leaseUntil > Date.now()) throw Object.assign(Error('pending_work_busy'),{status:409});
    tx.update(reservationRef,{dueAt:0,enqueued:false,leaseUntil:Date.now()+150000});return value;
  });
  if(!claim)return {skipped:true};
  if(claim.repair){const r=claim.repair;await schedule(kind,id,r.version,r.dueAt,{db,enqueue,expectedSequence:r.sequence});return {repaired:true};}
  try {
  const ref=db.collection(kind==='calendar'?'MarcieEditorialCalendar':kind).doc(id), snapshot=await ref.get(), item=snapshot.data();
  if(kind==='calendar') {
    if(!calendarActive(item))return {skipped:true};
    await (monitorCalendar || require('./marcie-editorial-monitor.js').monitorMarcieEditorialCalendar)(Date.now(),{calendarId:id});
    const current=(await ref.get()).data();
    if(calendarActive(current))await schedule(kind,id,claim.version,Math.max(Date.now()+300000,stamp(current.publishAtUtc)+30000),{db,enqueue,expectedSequence:sequence});
  } else {
    if(!['queued','running'].includes(item?.status))return {skipped:true};
    if(item.videoOperation?.name)return {skipped:true}; // Persisted Veo polls own this deadline.
    const config=STALE_JOB_COLLECTIONS.find(c=>c.name===kind);
    if(staleJobAge(item)>=config.maxAgeMs) {
      await db.runTransaction(async tx=>{const latest=(await tx.get(ref)).data();if(!latest?.videoOperation?.name&&['queued','running'].includes(latest?.status)&&staleJobAge(latest)>=config.maxAgeMs)tx.set(ref,buildStaleJobPatch(kind,admin,latest),{merge:true});});
      console.warn(JSON.stringify({event:'podcaster_job_heartbeat_expired',collection:kind,jobId:id}));
    } else await schedule(kind,id,claim.version,Date.now()+300000,{db,enqueue,expectedSequence:sequence});
  }
  return {checked:true};
  } finally {
    await db.runTransaction(async tx=>{const current=(await tx.get(reservationRef)).data();if(current?.sequence===sequence)tx.update(reservationRef,{leaseUntil:0});});
  }
}
async function calendarChanged(id, before, after) {
  if(!calendarActive(after))return;
  const relevant=item=>[item?.status,item?.publishAtUtc,item?.sessionId,item?.audience,item?.lastScheduledContentHash,item?.wordpressPublicationId];
  if(fingerprint(relevant(before))===fingerprint(relevant(after)))return;
  await schedule('calendar',id,fingerprint(relevant(after)),Date.now()+1000);
}
async function sessionChanged(id,before,after) {
  const relevant=item=>[item?.approvedAudiences,item?.articlesByAudience,item?.article];
  if(fingerprint(relevant(before))===fingerprint(relevant(after)))return;
  const {db}=getAdminServices();
  let cursor;
  do {
    let query=db.collection('MarcieEditorialCalendar').where('sessionId','==',id).orderBy('__name__').limit(100);
    if(cursor)query=query.startAfter(cursor);
    const page=await query.get();
    for(const doc of page.docs)if(calendarActive(doc.data()))await schedule('calendar',doc.id,fingerprint([relevant(after),doc.data().publishAtUtc]),Date.now()+1000,{db});
    cursor=page.size===100?page.docs.at(-1):null;
  }while(cursor);
}
module.exports={schedule,handle,calendarChanged,sessionChanged,calendarActive,fingerprint,URL};
