// One harmless Cloud Task per private endpoint. No production or provider operation is created.
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const requireFunctions = createRequire(require('node:path').resolve('functions/package.json'));
const { OAuth2Client } = requireFunctions('google-auth-library');
const { CloudTasksClient } = requireFunctions('@google-cloud/tasks');
const { enqueueHttpTask, QUEUES } = require('../functions/src/tasks.js');
const authClient = new OAuth2Client(); authClient.setCredentials({ access_token: execFileSync('gcloud',['auth','print-access-token'],{encoding:'utf8'}).trim() });
const client = new CloudTasksClient({ projectId:'charly-brown',authClient });
(async()=>{
  const nonce = require('node:crypto').randomBytes(16).toString('hex');
  const targets = [['PigPen','pigpen'],['Charly','charly'],['Marcie','marcie'],['Science','science'],['Veo','veo']];
  for (const [name,queue] of targets) {
    const endpoint = name==='Veo'?'pollVeoOperationTask':`recover${name}${name==='PigPen'?'Generation':'Production'}Task`;
    const targetUrl=`https://us-central1-charly-brown.cloudfunctions.net/${endpoint}`;
    const denied=await fetch(targetUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(20000)});
    if(denied.status!==403 && denied.status!==401) throw Error(`Public endpoint unexpectedly accessible: ${endpoint} ${denied.status}`);
    await enqueueHttpTask({ queue:QUEUES[queue],kind:'recovery-smoke',jobId:`${nonce}:${name}`,targetUrl,
      serviceAccountEmail:'charly-tasks-invoker@charly-brown.iam.gserviceaccount.com',payload:name==='Veo'?{jobId:nonce,sequence:1}:{runId:name==='Science'?require('node:crypto').randomUUID():nonce,epoch:'smoke',sequence:1},dispatchDeadlineSeconds:60 },{client});
    console.log(`${endpoint}: unauthenticated=${denied.status}, OIDC smoke queued`);
  }
})().catch(error=>{console.error(error.message);process.exitCode=1});
