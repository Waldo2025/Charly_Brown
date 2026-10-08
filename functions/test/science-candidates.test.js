const test=require('node:test'),assert=require('node:assert/strict');
const {normalizeCandidate,buildCandidateDocument}=require('../src/science-candidate-document.js');
const {createCandidateRegistry}=require('../src/science-simulator-candidates.js');
const {memoryDb}=require('./helpers/science-memory-db.js');
const candidate=()=>({title:'MRU',source:'export function measure(p){return {distance:p.velocity*p.time}}; export function draw(ctx,s,w,h){ctx.fillRect(s.measurements.distance,20,10,10)}',controls:[{id:'velocity',min:0,max:10,value:2}],tests:[0,2,5].map(time=>({params:{velocity:2,time},expected:{distance:2*time}}))});
test('candidate contracts reject missing tests, invalid controls and injected HTML',()=>{assert.throws(()=>normalizeCandidate({...candidate(),tests:[]}));assert.throws(()=>normalizeCandidate({...candidate(),controls:[{id:'x',min:0,max:0}]}));const html=buildCandidateDocument({...candidate(),title:'</title><script>bad()</script>',source:candidate().source+'\n// </script>'});assert.ok(!html.includes('<script>bad()'));assert.ok(html.includes("connect-src 'none'"));assert.ok(!html.includes('// </script>'));});
test('candidate approval requires admin, matching hash and passing immutable tests',async()=>{
 const db=memoryDb();await db.collection('users').doc('admin').set({role:'admin'});
 const registry=createCandidateRegistry({db,validateRemote:async c=>({hash:c.hash,passed:true,tests:c.tests.map(t=>({actual:t.expected}))})});
 const submitted=await registry.submit({run:{id:'run',ownerId:'owner'},candidate:candidate()});
 await assert.rejects(registry.read(submitted.candidateId,{uid:'stranger'}),{status:403});
 await assert.rejects(registry.decide(submitted.candidateId,{uid:'owner'},submitted.hash,true),{status:403});
 await assert.rejects(registry.decide(submitted.candidateId,{uid:'admin'},submitted.hash,true),{status:409});
 await registry.validate(submitted.candidateId,{uid:'owner'});await registry.decide(submitted.candidateId,{uid:'admin'},submitted.hash,true);
 assert.equal((await registry.approved(submitted.candidateId)).status,'approved');
});
test('runner cannot report success without matching numeric results',async()=>{const db=memoryDb(),registry=createCandidateRegistry({db,validateRemote:async c=>({hash:c.hash,passed:true,tests:c.tests.map(()=>({actual:{distance:999}}))})});const c=await registry.submit({run:{id:'r',ownerId:'u'},candidate:candidate()});assert.equal((await registry.validate(c.candidateId,{uid:'u'})).evidence.passed,false);});

test('runtime document does not disclose expected test outputs to candidate code',()=>{const input=candidate();input.tests[0].expected={secretExpectedMetric:98765};const html=buildCandidateDocument(input);assert.ok(!html.includes('secretExpectedMetric'));assert.ok(!html.includes('__scienceCandidateEvidence'));assert.ok(html.includes('__scienceMeasure'));});
