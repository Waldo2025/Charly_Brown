import test from 'node:test';
import assert from 'node:assert/strict';
import {createGenerationClient,generationApiBase,generationSummary} from '../public/js/pigpen-generation-client.mjs';
test('local generation never falls through to production and retains request idempotency',async()=>{
  const requests=[];const client=createGenerationClient({base:generationApiBase({}, {hostname:'localhost'}),fetchJson:async(url,options)=>{requests.push({url,...options});return {runId:'run'};}});
  await client.start({mode:'full',idempotencyKey:'same'});await client.control('run','resume');
  assert.equal(requests[0].url,'http://127.0.0.1:8793/api/pigpen/generation');
  assert.ok(requests.every(r=>r.allowFallback===false));assert.equal(requests[0].body.idempotencyKey,'same');
});
test('completed objectives have an actionable progress message',()=>assert.match(generationSummary({status:'completed',mode:'objective',tasks:[]}).detail,/Plan maestro listo/));
test('watch resumes polling and stops on completion',async()=>{
  const updates=[];const client=createGenerationClient({interval:1,fetchJson:async()=>({runId:'run',status:'completed'}),onProgress:r=>updates.push(r.status)});
  assert.equal((await client.watch({runId:'run',status:'running'})).status,'completed');assert.deepEqual(updates,['running','completed']);
});
