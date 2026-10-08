// Local workers use a separate run/control collection. Only explicitly selected test drafts are changed.
process.env.PIGPEN_LOCAL_WORKER = 'true';
const express = require('../functions/node_modules/express');
const { getAdminServices, installCommonMiddleware, installErrorHandler } = require('../functions/src/common.js');
const { createCoordinator, recoverGenerations } = require('../functions/src/pigpen-generation-coordinator.js');
const { registerGenerationRoutes } = require('../functions/src/pigpen-generation-routes.js');
const { GoogleGenAI } = require('../functions/node_modules/@google/genai');
const { OAuth2Client } = require('../functions/node_modules/google-auth-library');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);
// Firebase Admin's local key is for datastore access. Vertex uses the developer's
// existing gcloud login; no roles or service-account permissions are changed.
const authClient = new OAuth2Client();
let vertexCredentialUntil = 0, refreshing;
const requestHeaders = authClient.getRequestHeaders.bind(authClient);
authClient.getRequestHeaders = async (...args) => {
  if (Date.now() >= vertexCredentialUntil) {
    refreshing ||= execFile('gcloud',['auth','print-access-token']).then(({stdout})=>{
      authClient.setCredentials({access_token:stdout.trim()}); vertexCredentialUntil=Date.now()+45*60*1000;
    }).finally(()=>{refreshing=null;});
    await refreshing;
  }
  return requestHeaders(...args);
};
const app = express();
installCommonMiddleware(app,{service:'pigpen-local'});app.use(express.json({limit:'1mb'}));
const pending=new Map(), services=getAdminServices();
let coordinator;
const enqueue=async(id,item)=>{
  const key=id+':'+item.id;if(pending.has(key))return;
  const timer=setTimeout(async()=>{pending.delete(key);try{await coordinator.dispatch(id,item.id);}catch(error){console.error('dispatch',error.message);}},Math.max(0,(item.dueAt||0)-Date.now()));
  pending.set(key,timer);
};
coordinator=createCoordinator({...services,enqueue,client:new GoogleGenAI({vertexai:true,project:'charly-brown',location:'global',googleAuthOptions:{authClient}})});
// Text routing reads GEMINI_FREE_TIER_* from this shell, so a local run exercises the
// same decision production will make; without the vars it stays on the Vertex client above.
require('../functions/src/gemini-free-tier.js').describeFreeTierState(services.db)
  .then((state)=>console.log('pigpen_text_provider',JSON.stringify(state)))
  .catch((error)=>console.error('pigpen_text_provider',error.message));
registerGenerationRoutes(app,{coordinator});
app.get('/api/health',(_req,res)=>res.json({ok:true,local:true,rooms:4,images:2}));
app.use(express.static('public'));
installErrorHandler(app,{service:'pigpen-local'});
app.listen(Number(process.env.PIGPEN_PORT)||8793,'127.0.0.1',()=>console.log('PigPen local: http://127.0.0.1:8793/PigPenCreator.html'));
let recovering=false;
setInterval(async()=>{if(recovering)return;recovering=true;try{await recoverGenerations(coordinator);}catch(error){console.error('recovery',error.message);}finally{recovering=false;}},10000);
