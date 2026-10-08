const test=require('node:test');
const assert=require('node:assert/strict');
const {ScienceProductionStore,COLLECTION}=require('../src/science-production-store.js');
const {ScienceProductionCoordinator}=require('../src/science-production-coordinator.js');
const {configuration,validatePlan,initialTasks,publicRun}=require('../src/science-production-policy.js');
const {validateQuestions,createScienceWorkers,removeBorderMatte}=require('../src/science-production-workers.js');
const {invokeScienceAgent,createScienceMcpServer}=require('../src/science-mcp.js');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {InMemoryTransport}=require('@modelcontextprotocol/sdk/inMemory.js');
function memoryDb(){
  const data=new Map();let tail=Promise.resolve();const clone=v=>v===undefined?undefined:structuredClone(v);
  const ref=path=>({path,id:path.split('/').at(-1),collection:name=>collection(`${path}/${name}`),get:async()=>snap(path)});
  const snap=path=>({id:path.split('/').at(-1),ref:ref(path),exists:data.has(path),data:()=>clone(data.get(path))});
  const collection=path=>({doc:id=>ref(`${path}/${id}`),get:async()=>({docs:[...data.keys()].filter(k=>k.startsWith(path+'/')&&k.split('/').length===path.split('/').length+1).map(snap)})});
  return {data,collection,runTransaction(fn){const next=tail.then(async()=>{const writes=[];const tx={get:r=>r.get(),create(r,v){writes.push(()=>{assert.equal(data.has(r.path),false);data.set(r.path,clone(v));});},set(r,v){writes.push(()=>data.set(r.path,clone(v)));},update(r,patch){writes.push(()=>{const value=clone(data.get(r.path));for(const[key,v]of Object.entries(patch)){const parts=key.split('.');let node=value;for(const part of parts.slice(0,-1))node=node[part]||={};node[parts.at(-1)]=clone(v);}data.set(r.path,value);});}};const result=await fn(tx);writes.forEach(f=>f());return result;});tail=next.catch(()=>{});return next;}};
}
const config={subject:'physics',topic:'MRUA',trimester:'1',levelCount:3,questionsPerLevel:2};
const plan={title:'Movimiento',objective:'Medir aceleración',levels:[0,1,2].map(i=>({title:`Nivel ${i}`,objective:`Objetivo ${i}`})),visuals:[{role:'background',prompt:'Pista horizontal'},{role:'question',prompt:'Carrito'}]};
async function setup(){const db=memoryDb(),store=new ScienceProductionStore(db,()=>1000),id=await store.create('user',config,{simulator:{modelId:'friction'},controls:[]});return{db,store,id};}
async function ready(){const result=await setup();const claim=await result.store.claim(result.id,'planner-1');await result.store.finish(result.id,claim.task,plan);await result.store.control(result.id,'user','approve',{revision:1});await result.store.control(result.id,'user','start',{revision:1});return result;}
test('planning, revision approval and start are ordered and owner restricted',async()=>{
  const {store,id}=await setup();await assert.rejects(store.read(id,'other'),{status:403});await assert.rejects(store.control(id,'user','start',{revision:1}),{status:409});
  const claim=await store.claim(id,'planner-1');await store.finish(id,claim.task,plan);await store.control(id,'user','approve',{revision:1});
  await store.control(id,'user','revise',{revision:1,changes:{title:'Nuevo título'}});await assert.rejects(store.control(id,'user','start',{revision:1}),{status:409});await assert.rejects(store.control(id,'user','start',{revision:2}),{status:409});
  await store.control(id,'user','approve',{revision:2});await store.control(id,'user','start',{revision:2});assert.equal((await store.read(id)).run.status,'running');
});
test('parallel claims enforce pool capacities and dependencies',async()=>{
  const {store,id}=await ready();const claims=await Promise.all(['pedagogy','level-0','level-1','level-2'].map(t=>store.claim(id,t)));assert.equal(claims.filter(Boolean).length,4);assert.equal(await store.claim(id,'validate'),null);assert.equal(await store.claim(id,'visual-1'),null);
  assert.equal(await store.claim(id,'background-0'),null);assert.equal(await store.claim(id,'pedagogy'),null);
});
test('cancellation rejects late writes and heartbeat',async()=>{
  const {store,id}=await ready(),claim=await store.claim(id,'pedagogy');await store.control(id,'user','cancel');assert.equal(await store.finish(id,claim.task,{mission:'late'}),false);await assert.rejects(store.heartbeat(id,claim.task),{status:409});assert.equal((await store.read(id)).run.result,null);
});
test('leases can be reclaimed but stale tokens cannot commit',async()=>{
  const {store,id}=await ready(),old=await store.claim(id,'pedagogy');store.clock=()=>999999;const fresh=await store.claim(id,'pedagogy');assert.ok(fresh);assert.equal(await store.finish(id,old.task,{old:true}),false);assert.equal(await store.finish(id,fresh.task,{fresh:true}),true);
});
test('approval wait fails durably and targeted retry preserves candidate',async()=>{
  const {store,id}=await ready();const claim=await store.claim(id,'pedagogy');await store.finish(id,claim.task,null,Object.assign(new Error('candidate_approval_required'),{status:409}));assert.equal((await store.read(id)).run.status,'needs_attention');await store.control(id,'user','retry',{taskId:'pedagogy'});assert.equal((await store.read(id)).tasks.find(t=>t.id==='pedagogy').status,'pending');
});
test('coordinator does not execute activity before approval and respects dependencies',async()=>{
  const {store,id}=await setup(),queued=[];const coordinator=new ScienceProductionCoordinator({store,enqueue:async(id,t)=>queued.push(t.id),execute:async()=>plan});await coordinator.advance(id);assert.deepEqual(queued,['planner-1']);await coordinator.dispatch(id,'planner-1');assert.equal((await store.read(id)).run.status,'awaiting_approval');assert.deepEqual(queued,['planner-1']);
});
test('question contracts reject wrong counts and preserve planned numeric questions',()=>{
  const c=configuration({...config,questionTypeSchedule:['image-multiple','numeric-answer']});const q={type:'image-multiple',prompt:'Qué objeto',context:'Carro',feedback:'Explicación',options:['a','b','c','d'],correct:1,visual:{target:'b',imagePrompt:'Carro azul'}};
  assert.throws(()=>validateQuestions([q],c,0));const result=validateQuestions([q,{type:'numeric-answer',prompt:'Cuánto',context:'Fuerza',feedback:'Masa por aceleración',correctValue:3,tolerance:0,unit:'N'}],c,0);assert.equal(result[1].correctValue,3);assert.equal(result[0].generationSource,'gemini');
});
test('MCP agents expose only their capability and preserve provider status',async()=>{
  assert.deepEqual(await invokeScienceAgent({stage:'planner',execute:async()=>({ok:true})}),{ok:true});await assert.rejects(invokeScienceAgent({stage:'image',execute:async()=>{throw Object.assign(new Error('quota'),{status:429});}}),{status:429});await assert.rejects(invokeScienceAgent({stage:'shell',execute:async()=>({})}));
});
test('external MCP scope rejects mutations but permits reads',async()=>{
  let writes=0;const server=createScienceMcpServer({auth:{uid:'user',external:true,scopes:['science:read']},coordinator:{store:{list:async()=>[]},plan:async()=>{writes++;}}}),client=new Client({name:'test',version:'1.0'}),[a,b]=InMemoryTransport.createLinkedPair();try{await server.connect(a);await client.connect(b);assert.equal((await client.callTool({name:'list_generations',arguments:{}})).isError,undefined);assert.equal((await client.callTool({name:'plan_activity',arguments:{config:{},activity:{}}})).isError,true);assert.equal(writes,0);}finally{await client.close();await server.close();}
});
test('public run exposes candidate receipt without internal token or draft',()=>{const run=publicRun({ownerId:'x',epoch:'secret',activity:{secret:true}},[{stage:'candidate',token:'secret',result:{candidateId:'c'}}]);assert.equal(run.activity,undefined);assert.equal(run.tasks[0].token,undefined);assert.equal(run.tasks[0].result.candidateId,'c');});
test('invalid plans do not silently drop required levels or image',()=>{assert.throws(()=>validatePlan({...plan,levels:[]},configuration(config)));assert.throws(()=>validatePlan({...plan,visuals:[]},configuration(config)));});
test('existing trimester labels and fifteen-question levels are accepted',()=>{const value=configuration({...config,trimester:'Trimestre 2',questionsPerLevel:15});assert.equal(value.trimester,'Trimestre 2');assert.equal(value.questionsPerLevel,15);});
test('old revision work cannot be claimed after replanning',async()=>{
  const {store,id}=await ready(),claim=await store.claim(id,'pedagogy');await store.finish(id,claim.task,null,Object.assign(new Error('repair'),{status:400}));await store.control(id,'user','revise',{revision:1,changes:'Nuevo enfoque'});assert.equal(await store.claim(id,'level-1'),null);assert.deepEqual((await store.read(id)).tasks.map(t=>t.id),['planner-2']);
});
test('image permits cap at two while text work continues',async()=>{const {store,id}=await ready();const claim=await store.claim(id,'pedagogy');await store.finish(id,claim.task,{});assert.ok(await store.claim(id,'background-0'));assert.ok(await store.claim(id,'background-1'));assert.equal(await store.claim(id,'background-2'),null);assert.ok(await store.claim(id,'level-0'));});
test('only background pixels connected to border are removed',()=>{
  const width=5,height=5,data=Buffer.alloc(100);for(let p=0;p<25;p++){data[p*4+1]=255;data[p*4+3]=255;}
  for(let y=1;y<4;y++)for(let x=1;x<4;x++){if(x===2&&y===2)continue;const i=(y*width+x)*4;data[i]=255;data[i+1]=0;}
  assert.equal(removeBorderMatte(data,width,height),16/25);assert.equal(data[(2*width+2)*4+3],255);assert.equal(data[3],0);
});
test('regeneration preserves previous questions and resets only dependencies',async()=>{
  const {store,id,db}=await ready();const questions=[{prompt:'original0'},{prompt:'original1'}];db.data.get(`${COLLECTION}/${id}`).status='completed';
  for(const [path,value]of db.data)if(path.startsWith(`${COLLECTION}/${id}/tasks/`)&&value.stage!=='planner'){value.status='completed';value.result=value.stage==='questions'?{questions}:{};}
  await store.control(id,'user','regenerate_asset',{taskId:'level-0',questionIndex:1});const state=await store.read(id);const target=state.tasks.find(t=>t.id==='level-0');assert.deepEqual(target.input.previousQuestions,questions);assert.equal(target.input.questionIndex,1);assert.equal(state.tasks.find(t=>t.id==='level-1').status,'completed');assert.equal(state.tasks.find(t=>t.id==='validate').status,'pending');assert.equal(state.run.result,null);
});
test('targeted worker generates one question and preserves siblings',async()=>{
  const q={type:'image-multiple',prompt:'Original visual',context:'Pista',feedback:'Observa',options:['a','b','c','d'],correct:1,visual:{target:'b',imagePrompt:'carro'}};
  const replacement={type:'multiple',prompt:'Nueva pregunta',context:'Aceleración',feedback:'F=ma',options:['1','2','3','4'],correct:2};let prompt='';
  const worker=createScienceWorkers({client:{models:{generateContent:async request=>{prompt=request.contents[0].parts[0].text;return {candidates:[{content:{parts:[{text:JSON.stringify({questions:[replacement]})}]}}]};}}}});
  const result=await worker({config:configuration(config),activity:{},plan},{stage:'questions',input:{levelIndex:0,level:plan.levels[0],questionIndex:1,previousQuestions:[q,{...replacement,prompt:'Vieja'}]}});
  assert.equal(result.questions[0].prompt,'Original visual');assert.equal(result.questions[1].prompt,'Nueva pregunta');assert.match(prompt,/exactamente 1 preguntas/);
});
test('client supplied generated executable is removed and catalog IDs validated',async()=>{
  const db=memoryDb(),store=new ScienceProductionStore(db);const id=await store.create('user',config,{simulator:{generated:{html:'malicious',reviewStatus:'approved'}}});assert.equal((await store.read(id)).run.activity.simulator.generated,undefined);assert.throws(()=>configuration({...config,simulatorMode:'approved',modelId:'user-code'}));
});
test('programmatic math requires a generated background but no raster representation',async()=>{
  const {getScienceSceneArtDirection}=await import('../src/science-scene-art-direction.mjs');
  const base={subject:'math',topic:'Factorización',simulator:{modelId:'quadratic-factorization-rectangle'}};base.artDirection=getScienceSceneArtDirection(base);
  const c=configuration({...config,subject:'math',gameMode:'simulator'},base);const value=validatePlan({title:'Factores',objective:'Factorizar',levels:[],visuals:[]},c);assert.deepEqual(value.visuals.map(v=>v.role),['background']);assert.equal(value.artDirection.representation,'code');
});
test('deployed curriculum, guide and visual contracts match their browser source',()=>{
  const fs=require('node:fs'),path=require('node:path');for(const name of ['science-curriculum-policy.mjs','science-learning-guide-contract.mjs','science-image-prompt-contract.mjs','science-curriculum-profiles.mjs','science-chemistry-profiles.mjs','science-biology-profiles.mjs','science-model-math.mjs','science-model-physics.mjs','science-model-common.mjs','science-scene-art-direction.mjs'])assert.equal(fs.readFileSync(path.join(__dirname,'../src',name),'utf8').split('\n').slice(1).join('\n'),fs.readFileSync(path.join(__dirname,'../../public/js',name),'utf8'));
});
test('guide contract rejects missing applied examples and math formulas',async()=>{
  const {validateScienceLearningGuide}=await import('../src/science-learning-guide-contract.mjs');const activity={subject:'physics',levelCount:1};const guide={title:'Movimiento',introduction:'Aprender aceleración',levels:[{title:'Pista',narrative:'Un carro avanza',objective:'Medir',hint:'Observa',imagePrompt:'carro',concepts:[{term:'Fuerza',definition:'Interacción'}],example:{title:'Carro',text:'¿Qué sucede?',formula:'F=ma',explanation:'Fuerza'}}]};assert.equal(validateScienceLearningGuide(activity,guide).valid,false);
});
test('validation never produces a finished activity before candidate approval',async()=>{
  const worker=createScienceWorkers({client:{models:{generateContent:async()=>{throw Error('Must not reach provider');}}},candidateRegistry:{approved:async()=>{throw Object.assign(new Error('candidate_approval_required'),{status:409});}}});
  await assert.rejects(worker({config:{...configuration(config),simulatorMode:'new'},activity:{},plan},{stage:'validate'}, {simulator:{candidateId:'candidate'}}),{status:409});
});
test('assembler keeps curated runtime and applies all assets before marking complete',async()=>{
  const c=configuration({...config,levelCount:1,questionsPerLevel:1});const p=validatePlan({...plan,levels:plan.levels.slice(0,1)},c);
  const q={type:'image-multiple',prompt:'Qué objeto',context:'Carro',feedback:'Explicación',options:['a','b','c','d'],correct:1,visual:{target:'b',imagePrompt:'Carro azul'}};
  const inputs={pedagogy:{mission:'Medir aceleración',scientificPrinciple:'F=ma',learningGuide:{levels:[{title:'Pista'}]}},'level-0':{questions:[q]}};
  for(const image of p.visuals)inputs[image.id]={...image,imageUrl:`https://example.test/${image.id}.png`,sourceTaskId:image.id};
  const worker=createScienceWorkers({client:{models:{generateContent:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({valid:true,warnings:[]})}]}}]})}}});
  const result=await worker({id:'run',revision:1,config:c,plan:p,activity:{simulator:{modelId:'friction'},controls:[{id:'mass',value:2}],generation:{curriculumPolicyVersion:0}}},{stage:'validate'},inputs);
  assert.equal(result.activity.generation.complete,true);assert.equal(result.activity.simulator.modelId,'friction');assert.equal(result.activity.controls[0].value,2);assert.equal(result.activity.assessments[0].visual.imageUrl,inputs['visual-1'].imageUrl);assert.equal(result.activity.learningGuide.levels[0].imageUrl,inputs['background-0'].imageUrl);
});
test('external MCP discovers a template and plans without browser activity payload',async()=>{
  const db=memoryDb(),store=new ScienceProductionStore(db),coordinator=new ScienceProductionCoordinator({store,enqueue:async()=>{},execute:async()=>plan});
  const server=createScienceMcpServer({auth:{uid:'user',external:true,scopes:['science:read','science:plan']},coordinator}),client=new Client({name:'external',version:'1.0'}),[a,b]=InMemoryTransport.createLinkedPair();
  try{await server.connect(a);await client.connect(b);const parse=r=>JSON.parse(r.content[0].text);
    const topics=parse(await client.callTool({name:'list_science_topics',arguments:{subject:'physics'}})).topics;assert.ok(topics.length>20);
    const template=parse(await client.callTool({name:'get_activity_template',arguments:{subject:'physics',topic:'MRUA'}})).activity;assert.equal(template.subject,'physics');assert.ok(template.controls.length);
    const response=parse(await client.callTool({name:'plan_activity',arguments:{config:{...config,topic:template.topic}}}));assert.equal(response.run.status,'planning');const saved=(await store.read(response.run.id,'user')).run;assert.equal(saved.activity.simulator.modelId,template.simulator.modelId);
  }finally{await client.close();await server.close();}
});
test('curated input cannot override model or ranges, custom topics require new mode',async()=>{
  const {prepareActivityTemplate}=require('../src/science-production-templates.js');
  const activity=await prepareActivityTemplate({subject:'physics',topic:'MRUA'},{controls:[{id:'mass',min:-999,max:999,value:999}],simulator:{modelId:'invented',generated:{html:'bad'}}});assert.equal(activity.simulator.modelId,'friction');assert.equal(activity.simulator.generated,undefined);for(const control of activity.controls)assert.ok(control.value>=control.min&&control.value<=control.max);
  await assert.rejects(prepareActivityTemplate({subject:'physics',topic:'Nuevo fenómeno',gameMode:'simulator'}),{status:422});const custom=await prepareActivityTemplate({subject:'physics',topic:'Nuevo fenómeno',gameMode:'simulator',simulatorMode:'new'});assert.equal(custom.simulator.modelId,'pending');
});
test('kill switch blocks spending while read and cancel remain available',async()=>{
  const {store,id}=await setup();const coordinator=new ScienceProductionCoordinator({store,enqueue:async()=>{throw Error('must not enqueue');},execute:async()=>{},enabled:false});await assert.rejects(coordinator.plan('user',config),{status:503});await assert.rejects(coordinator.dispatch(id,'planner-1'),{status:503});assert.deepEqual(await coordinator.advance(id),{disabled:true});assert.equal((await coordinator.status('user',id)).status,'planning');assert.equal((await coordinator.control('user',id,'cancel')).status,'cancelled');
});
test('run list orders newest before limiting and excludes heavy activity artifacts',async()=>{
  const calls=[],query={where(...a){calls.push(['where',...a]);return this;},orderBy(...a){calls.push(['orderBy',...a]);return this;},limit(n){calls.push(['limit',n]);return this;},select(...fields){calls.push(['select',...fields]);return this;},async get(){return{docs:[]};}};
  await new ScienceProductionStore({collection:()=>query}).list('user');assert.deepEqual(calls.slice(0,3),[['where','ownerId','==','user'],['orderBy','updatedAt','desc'],['limit',100]]);assert.equal(calls[3].includes('activity'),false);assert.equal(calls[3].includes('result'),false);
});
test('free topic games keep a real reusable engine without claiming curated topic support',async()=>{
  const {prepareActivityTemplate}=require('../src/science-production-templates.js');
  const activity=await prepareActivityTemplate({subject:'physics',topic:'Ciencia en mi barrio',gameMode:'game'},{subject:'physics',topic:'Ciencia en mi barrio',gameMode:'game',simulator:{modelId:'friction'}});
  assert.equal(activity.topic,'Ciencia en mi barrio');assert.equal(activity.simulator.modelId,'friction');assert.equal(activity.customTopic,true);assert.ok(activity.runtimeTemplateTopic);assert.ok(activity.controls.length);
});
test('visual question QA checks observed image against marked answer before publishing',async()=>{
  const data=await require('sharp')({create:{width:8,height:8,channels:3,background:'#ff0000'}}).png().toBuffer();let qaPrompt='',calls=0,saved=false;
  const worker=createScienceWorkers({bucket:{name:'test',file:()=>({save:async()=>{saved=true;}})},client:{models:{generateContent:async request=>{calls++;if(calls===1)return{candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:data.toString('base64')}}]}}]};qaPrompt=request.contents[0].parts[0].text;return{candidates:[{content:{parts:[{text:'{"valid":false,"issue":"La imagen muestra rojo y la respuesta marcada dice azul"}'}]}}]};}}}});
  const question={prompt:'¿Qué color tiene el carro?',context:'Movimiento',options:['verde','azul','rojo','negro'],correct:1,visual:{target:'carro azul',imagePrompt:'Un carro'}};
  await assert.rejects(worker({config:configuration(config),activity:{}},{id:'visual-0',stage:'image',input:{role:'question',prompt:'Un carro',alt:'carro'}},{'level-0':{questions:[question]}}),{status:422});assert.match(qaPrompt,/Qué color tiene el carro/);assert.match(qaPrompt,/"expectedAnswer":"azul"/);assert.match(qaPrompt,/carro azul/);assert.equal(saved,false);
});
