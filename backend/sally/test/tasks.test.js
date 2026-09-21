const test=require('node:test');
const assert=require('node:assert/strict');
const {createService}=require('../server.js');
const {randomUUID}=require('node:crypto');
const target='https://aprende.asc.education/course/view.php?id=496';
function memoryStore(){
 const data=new Map(),files=new Map();
 const write=async(t,creating=false)=>{const old=data.get(t.id);if(creating?old:!old||old.revision!==t.revision)throw Error('revision conflict');t.revision=randomUUID();data.set(t.id,structuredClone(t));};
 return {data,get:async id=>structuredClone(data.get(id)),create:t=>write(t,true),save:t=>write(t),list:async(s,c)=>[...data.values()].filter(t=>t.sessionId===s&&t.conversationId===c),artifact:async(t,v)=>{const id=randomUUID();files.set(id,structuredClone(v));return id;},readArtifact:async p=>files.get(p)};
}
test('Task HTTP workflow: durable messages, investigation, approval, execution, isolation and revocation',async()=>{
 const store=memoryStore();let writes=0,revoked=false,releaseDecision,observedDecision;
 const service=createService({taskStore:store,certifiedCourses:[target],
 verifyToken:async token=>({uid:token}),getProfile:async()=>({role:'teacher',approved:!revoked}),getSession:async id=>id==='project'?{ownerId:'alice',collaborators:[]}:null,networkPolicy:async()=>true,
 decide:async input=>{if(!input.observations.length){observedDecision=true;await new Promise(r=>releaseDecision=r);return {action:'read_course',view:'target'};}return {action:'propose',text:'Crear una nota, sin tocar otros recursos.',operations:[{type:'create_or_update_resource',target,payload:{title:'Prueba',kind:'page',html:'<p>Texto de prueba</p>',visibility:'hidden'}}]};},
 makeController:()=>({start:async()=>({}),inspect:async()=>({sections:[],coverage:{complete:true},title:'Destino'}),checkpoint:async()=>({checkpoints:[]}),approve:async()=>({}),observe:async()=>({image:'data:image/jpeg;base64,eA=='}),execute:async()=>{writes++;return {state:'completed',results:[]};},control:async()=>({}),close:async()=>({})})});
 const listener=service.app.listen(0,'127.0.0.1');await new Promise(r=>listener.once('listening',r));
 const call=async(path,body,user='alice')=>{const r=await fetch(`http://127.0.0.1:${listener.address().port}/api/sally`+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+user,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
 const wait=async condition=>{for(let i=0;i<200;i++){if(condition())return;await new Promise(r=>setTimeout(r,5));}throw Error('condition timed out');};
 try{
  assert.equal((await call('/project/command',{command:'start',payload:{url:target}})).status,200);
  const draft={id:'task1',conversationId:'chat1',thread:'target',targetUrl:target,context:{version:'v1',text:'Contexto original'}};
  assert.equal((await call('/project/tasks',draft)).status,201);
  assert.equal((await call('/project/tasks/task1',undefined,'bob')).status,403);
  assert.equal((await call('/project/tasks/task1/messages',{id:'message1',text:'Crea una nota'})).status,202);
  await wait(()=>observedDecision);
  assert.equal(store.data.get('task1').messages[0].text,'Crea una nota');assert.equal(writes,0);
  assert.equal((await call('/project/tasks/task1/messages',{id:'message1',text:'Crea una nota'})).status,200);
  assert.equal(store.data.get('task1').messages.length,1);
  assert.equal((await call('/project/tasks/task1/control',{action:'execute'})).status,409);
  releaseDecision();await wait(()=>store.data.get('task1').status==='awaiting_approval');
  const proposed=store.data.get('task1');assert.equal(writes,0);assert.equal(proposed.artifacts.length,1);
  assert.equal((await call('/project/tasks/task1/control',{action:'approve',planHash:'wrong'})).status,400);
  assert.equal((await call('/project/tasks/task1/control',{action:'approve',planHash:proposed.planHash})).status,200);
  assert.equal((await call('/project/tasks/task1/control',{action:'execute'})).status,202);
  await wait(()=>store.data.get('task1').status==='completed');assert.equal(writes,1);
  assert.equal(store.data.get('task1').steps[0].status,'completed');
  assert.equal((await call('/project/tasks/task1/control',{action:'execute'})).status,400);assert.equal(writes,1);
  revoked=true;assert.equal((await call('/project/tasks/task1')).status,403);
 }finally{releaseDecision?.();await service.close();await new Promise(r=>listener.close(r));}
});
