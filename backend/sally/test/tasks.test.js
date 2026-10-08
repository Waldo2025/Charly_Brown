const test=require('node:test');
const assert=require('node:assert/strict');
const {createService}=require('../server.js');
const {investigate}=require('../agent.js');
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

test('Unified MCP chat asks for destination and model before starting Moodle research',async()=>{
 const store=memoryStore();let starts=0,openedViewport;
 const service=createService({taskStore:store,verifyToken:async token=>({uid:token}),getProfile:async()=>({role:'teacher',approved:true}),getSession:async id=>id==='project'?{ownerId:'alice',collaborators:[]}:null,networkPolicy:async()=>true,decide:async()=>({action:'answer',text:'ok'}),makeController:()=>({start:async payload=>{starts++;openedViewport=payload.viewport;return {};},close:async()=>({})})});
 const listener=service.app.listen(0,'127.0.0.1');await new Promise(r=>listener.once('listening',r));
 const call=async(path,body)=>{const response=await fetch(`http://127.0.0.1:${listener.address().port}/api/sally`+path,{method:'POST',headers:{Authorization:'Bearer alice','Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
 try{
  const created=await call('/project/tasks',{id:'unified1',conversationId:'chat1',scope:'unified',context:{text:''},viewport:{width:920,height:1080}});assert.equal(created.status,201);assert.equal(created.data.scope,'unified');
  const destinationQuestion=await call('/project/tasks/unified1/messages',{id:'m1',text:'Crea un curso'});assert.equal(destinationQuestion.data.status,'waiting_input');assert.deepEqual(destinationQuestion.data.pendingQuestions,['destinationUrl']);
  const modelQuestion=await call('/project/tasks/unified1/messages',{id:'m2',text:'El destino es https://aprende.asc.education/course/view.php?id=496'});assert.equal(modelQuestion.data.status,'waiting_input');assert.deepEqual(modelQuestion.data.pendingQuestions,['modelUrl']);assert.equal(modelQuestion.data.destinationOrigin,'https://aprende.asc.education');
  const wrongOrigin=await call('/project/tasks/unified1/messages',{id:'m3',text:'El modelo es https://otro.example/course/view.php?id=2',modelUrl:'https://otro.example/course/view.php?id=2'});assert.equal(wrongOrigin.status,403);
  const noModel=await call('/project/tasks/unified1/messages',{id:'m4',text:'Trabaja sin modelo',modelUrl:'',modelDisabled:true});assert.equal(noModel.status,202);
  for(let i=0;i<100&&store.data.get('unified1').status!=='completed';i++)await new Promise(r=>setTimeout(r,5));
  assert.equal(store.data.get('unified1').status,'completed');assert.equal(starts,1,'The chat opens Moodle automatically before research');assert.deepEqual(openedViewport,{width:920,height:1080});
 }finally{await service.close();await new Promise(r=>listener.close(r));}
});

test('Continue preserves the saved plan and completed steps instead of restarting',async()=>{
 const store=memoryStore();let decisions=0;
 const service=createService({taskStore:store,certifiedCourses:[target],verifyToken:async token=>({uid:token}),getProfile:async()=>({role:'teacher',approved:true}),getSession:async id=>id==='project'?{ownerId:'alice',collaborators:[]}:null,networkPolicy:async()=>true,decide:async()=>{decisions++;return {action:'answer',text:'unexpected restart'};},makeController:()=>({start:async()=>({}),close:async()=>({})})});
 const listener=service.app.listen(0,'127.0.0.1');await new Promise(r=>listener.once('listening',r));
 const call=async(path,body)=>{const response=await fetch(`http://127.0.0.1:${listener.address().port}/api/sally`+path,{method:'POST',headers:{Authorization:'Bearer alice','Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
 try{
  await call('/project/tasks',{id:'resume1',conversationId:'chat1',scope:'unified',destinationUrl:target,modelDisabled:true,context:{text:''}});
  const saved=store.data.get('resume1');saved.status='paused';saved.plan=[{id:'done',type:'browser_workflow',target,intent:'Paso terminado',risk:'standard',payload:{steps:[]}},{id:'pending',type:'browser_workflow',target,intent:'Paso pendiente',risk:'standard',payload:{steps:[]}}];saved.steps=[{id:'done',status:'completed'}];store.data.set(saved.id,structuredClone(saved));
  const resumed=await call('/project/tasks/resume1/messages',{id:'continue1',text:'Continúa',destinationUrl:target,modelDisabled:true});
  assert.equal(resumed.status,202);assert.equal(resumed.data.status,'awaiting_approval');assert.equal(resumed.data.plan.length,2);assert.deepEqual(resumed.data.steps,[{id:'done',status:'completed'}]);assert.match(resumed.data.progress,/acciones pendientes/);assert.equal(decisions,0);
 }finally{await service.close();await new Promise(r=>listener.close(r));}
});

test('Agent can reason about a scoped request and read only the selected section',async()=>{
 const reads=[],task={context:{},thread:'unified',modelUrl:'',targetUrl:target,messages:[{role:'user',text:'Analiza Chapter 5'}],attachments:[],pendingQuestions:[],artifacts:[],plan:[]};let decisions=0;
 await investigate({task,check:async()=>{},checkpoint:async()=>{},saveArtifact:async()=>`artifact-${reads.length}`,read:async decision=>{reads.push(decision);return {title:'Chapter 5',sections:[{title:'Chapter 5',modules:[]}],coverage:{complete:true}};},decide:async input=>{decisions++;if(!input.observations.length)return {action:'read_section',view:'target',query:'Chapter 5'};return {action:'answer',text:'Análisis focalizado terminado.'};}});
 assert.equal(decisions,2);assert.deepEqual(reads,[{action:'read_section',view:'target',query:'Chapter 5'}]);assert.equal(task.status,'completed');assert.match(task.messages.at(-1).text,/focalizado/);
});

test('Agent cannot present an incomplete tab scan as a complete inventory',async()=>{
 const task={context:{},thread:'unified',modelUrl:'',targetUrl:target,messages:[{role:'user',text:'Revisa Chapter 5 y todas sus subpestañas'}],attachments:[],pendingQuestions:[],artifacts:[],plan:[]};let decisions=0;
 await investigate({task,check:async()=>{},checkpoint:async()=>{},saveArtifact:async()=>`artifact-${decisions}`,read:async()=>({title:'Chapter 5',sections:[{title:'Chapter 5',modules:[]}],tabs:[{title:'Digital Book',status:'unread'}],tabCoverage:{complete:false},coverage:{complete:false},warnings:[{message:'Digital Book: la pestaña no terminó de cargar.'}]}),decide:async input=>{decisions++;return input.observations.length?{action:'answer',text:'No existen más recursos.'}:{action:'read_section',view:'target',query:'Chapter 5'};}});
 assert.match(task.messages.at(-1).text,/Resultado parcial/);assert.match(task.messages.at(-1).text,/No es válido concluir/);assert.match(task.messages.at(-1).text,/Digital Book/);assert.equal(task.progress,'Investigación parcial terminada');
});
