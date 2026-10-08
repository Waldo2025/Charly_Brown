const test=require('node:test');
const assert=require('node:assert/strict');
const {memoryDb}=require('./helpers/science-memory-db.js');
const {schedule,handle,fingerprint}=require('../src/demand-monitors.js');
test('pending monitor deduplicates enqueue and ignores completed jobs',async()=>{
  const db=memoryDb(),tasks=[],enqueue=async t=>tasks.push(t);
  await Promise.all([1,2].map(()=>schedule('podcaster_ai_jobs','job','v1',Date.now()+1000,{db,enqueue})));
  assert.equal(new Set(tasks.map(t=>t.jobId)).size,1);
  db.data.set('podcaster_ai_jobs/job',{status:'ready'});
  assert.deepEqual(await handle(tasks[0].payload,{db,enqueue}),{skipped:true});
  assert.equal(db.data.get('DemandMonitorReservations/'+fingerprint(['podcaster_ai_jobs','job'])).sequence,1);
});
test('a concurrent calendar edit cannot be replaced by the old task successor',async()=>{
  const db=memoryDb(),tasks=[],enqueue=async t=>tasks.push(t);
  db.data.set('MarcieEditorialCalendar/item',{status:'scheduled',publishAtUtc:new Date(Date.now()+60000).toISOString()});
  await schedule('calendar','item','v1',Date.now()+1000,{db,enqueue});
  await handle(tasks[0].payload,{db,enqueue,monitorCalendar:()=>schedule('calendar','item','v2',Date.now()+1000,{db,enqueue})});
  const ledger=db.data.get('DemandMonitorReservations/'+fingerprint(['calendar','item']));
  assert.equal(ledger.version,'v2');assert.equal(ledger.sequence,2);
});
test('calendar callback failure clears its lease so Cloud Tasks can retry',async()=>{
  const db=memoryDb(),tasks=[],enqueue=async t=>tasks.push(t);
  db.data.set('MarcieEditorialCalendar/item',{status:'scheduled',publishAtUtc:new Date(Date.now()+60000).toISOString()});
  await schedule('calendar','item','v1',Date.now()+1000,{db,enqueue});
  await assert.rejects(handle(tasks[0].payload,{db,enqueue,monitorCalendar:async()=>{throw Error('temporary');}}),/temporary/);
  await handle(tasks[0].payload,{db,enqueue,monitorCalendar:async()=>{}});
  assert.equal(tasks.at(-1).payload.sequence,2);
});
