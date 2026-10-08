// Scoped migration/verification; credentials stay in memory and are never logged.
const {execFileSync}=require('node:child_process');
const {createRequire}=require('node:module');
const req=createRequire(require('node:path').resolve('functions/package.json'));
const {OAuth2Client}=req('google-auth-library');
const {Firestore}=req('@google-cloud/firestore');
const {CloudTasksClient}=req('@google-cloud/tasks');
const {schedule,calendarActive,fingerprint,URL}=require('../functions/src/demand-monitors.js');
const {enqueueHttpTask,QUEUES}=require('../functions/src/tasks.js');
const authClient=new OAuth2Client();authClient.setCredentials({access_token:execFileSync('gcloud',['auth','print-access-token'],{encoding:'utf8'}).trim()});
const db=new Firestore({projectId:'charly-brown',authClient}),client=new CloudTasksClient({projectId:'charly-brown',authClient});
const enqueue=options=>enqueueHttpTask(options,{client});
(async()=>{
  if(process.argv.includes('--sally')) {
    const page=await db.collection('SallyBrownTasks').where('status','in',['running','researching','queued']).get();
    console.log(JSON.stringify({sallyPending:page.size,statuses:page.docs.map(d=>d.data().status)}));return;
  }
  if(process.argv.includes('--smoke')) {
    const denied=await fetch(URL,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    if(![401,403].includes(denied.status))throw Error('pending_monitor_publicly_accessible');
    await enqueue({queue:QUEUES.marcie,kind:'pending-smoke',jobId:require('node:crypto').randomUUID(),targetUrl:URL,
      serviceAccountEmail:'charly-tasks-invoker@charly-brown.iam.gserviceaccount.com',payload:{kind:'calendar',id:'smoke-missing-'+Date.now(),sequence:1}});
    console.log('Private monitor: public access denied; OIDC task queued');return;
  }
  for(const [kind,statuses] of [['podcaster_ai_jobs',['queued','running']],['podcaster_export_jobs',['queued','running']],['calendar',['idea','planned','researching','drafting','review','approved','scheduled']]]) {
    let cursor,count=0;
    do {
      let query=db.collection(kind==='calendar'?'MarcieEditorialCalendar':kind).where('status','in',statuses).orderBy('__name__').limit(100);
      if(cursor)query=query.startAfter(cursor);
      const page=await query.get();
      for(const doc of page.docs){const item=doc.data();if(kind==='calendar'&&!calendarActive(item)||item.videoOperation?.name)continue;
        await schedule(kind,doc.id,fingerprint([item.status,item.publishAtUtc,item.createdAt]),Date.now()+1000,{db,enqueue});count++;}
      cursor=page.size===100?page.docs.at(-1):null;
    }while(cursor);
    console.log(`${kind}: ${count} pending tasks prepared`);
  }
})().catch(error=>{console.error(error.code||error.message);process.exitCode=1});
