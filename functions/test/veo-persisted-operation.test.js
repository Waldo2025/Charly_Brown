const test = require('node:test');
const assert = require('node:assert/strict');
const common = require('../src/common.js'), vertex = require('../src/vertex.js'), tasks = require('../src/tasks.js');
let current, submitted, polled, uncertain;
const ref = { get: async () => ({ exists: true, data: () => ({ ...current }), ref }), set: async patch => {
  for (const [key,value] of Object.entries(patch)) { if (key.includes('.')) { const [a,b]=key.split('.');current[a][b]=value; } else current[key]=value; }
}};
const db = { collection: () => ({ doc: () => ref }), runTransaction: async work => work({ get:r=>r.get(),set:(r,p)=>r.set(p),update:(r,p)=>r.set(p) }) }; ref.firestore=db;
common.getAdminServices=()=>({db,bucket:{name:'test'},admin:{firestore:{Timestamp:{fromMillis:ms=>({toMillis:()=>ms})},FieldValue:{serverTimestamp:()=>new Date().toISOString()}}}});
vertex.createVertexClient=()=>({models:{generateVideos:async()=>{submitted++;if(uncertain)throw Error('connection lost');return {name:'operation-1',done:false};}},operations:{getVideosOperation:async({operation})=>{assert.equal(operation.name,'operation-1');polled++;return {name:operation.name,done:false};}}});
tasks.enqueueHttpTask=async()=>({name:'task'});
const {dispatchAiJob}=require('../src/ai-jobs.js');
const reset=()=>{current={jobId:'video-test',type:'dialogue_video',status:'queued',sessionId:'session',ownerId:'owner',input:{text:'Hola, esta es una narración.',rowId:'row'},model:'veo-3.1-generate-001'};submitted=polled=0;uncertain=false;};
test('persisted operation survives dispatch retries without generating another video',async()=>{
  reset();assert.equal((await dispatchAiJob('video-test')).pending,true);
  assert.equal(current.videoOperation.name,'operation-1');assert.equal(submitted,1);
  assert.equal((await dispatchAiJob('video-test',1)).pending,true);
  assert.equal(submitted,1);assert.equal(polled,1);assert.equal(current.videoPoll.sequence,2);
  assert.equal((await dispatchAiJob('video-test',1)).duplicate,true);assert.equal(polled,1);
});
test('uncertain submission is terminal for automatic retries',async()=>{
  reset();uncertain=true;
  assert.equal((await dispatchAiJob('video-test')).retryable,false);
  assert.ok(current.videoSubmissionStartedAt);assert.equal(submitted,1);
  assert.equal((await dispatchAiJob('video-test')).duplicate,true);assert.equal(submitted,1);
});
