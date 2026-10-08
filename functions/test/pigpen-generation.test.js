const test = require('node:test');
const assert = require('node:assert/strict');
const { GenerationStore } = require('../src/pigpen-generation-store.js');
const { task, hash, retryPolicy } = require('../src/pigpen-generation-policy.js');
const { nextTasks } = require('../src/pigpen-generation-coordinator.js');
const { createEngine } = require('../src/pigpen-generation-engine.js');
function memoryDb() {
  const data=new Map();let tail=Promise.resolve();
  const clone=v=>v===undefined?undefined:structuredClone(v);
  const ref=path=>({path,id:path.split('/').at(-1),collection:n=>collection(path+'/'+n),get:async()=>snap(path),update:async patch=>{Object.assign(data.get(path),clone(patch));}});
  const snap=path=>({id:path.split('/').at(-1),ref:ref(path),exists:data.has(path),data:()=>clone(data.get(path))});
  const collection=path=>({doc:id=>ref(path+'/'+id),get:async()=>({docs:[...data.keys()].filter(k=>k.startsWith(path+'/')&&k.split('/').length===path.split('/').length+1).map(snap)})});
  return {data,collection,runTransaction(fn){const result=tail.then(async()=>{const writes=[];const value=await fn({get:r=>r.get(),create:(r,v)=>writes.push(()=>{assert.ok(!data.has(r.path));data.set(r.path,clone(v));}),set:(r,v)=>writes.push(()=>data.set(r.path,clone(v))),update:(r,v)=>writes.push(()=>{assert.ok(data.has(r.path));Object.assign(data.get(r.path),clone(v));})});writes.forEach(f=>f());return value;});tail=result.catch(()=>{});return result;}};
}
async function setup() {
  const db=memoryDb(),objects=new Map();
  db.data.set('escapeRoom/session',{ownerId:'user'});db.data.set('escapeRoom/session/topics/topic',{project:null,formState:{tema:'Probabilidad'}});
  const artifacts={put:async(k,v)=>{objects.set(k,structuredClone(v));return k;},get:async k=>structuredClone(objects.get(k))};
  const store=new GenerationStore(db,artifacts,()=>1000);
  const input={sessionId:'session',topicId:'topic',mode:'full',idempotencyKey:'same',config:{tema:'Probabilidad',misiones:4,preguntasPorSala:4}};
  const id=await store.start('user',input);return {store,db,id,input,artifacts};
}
test('idempotent start and owner isolation',async()=>{const {store,id,input}=await setup();assert.equal(await store.start('user',input),id);await assert.rejects(store.read(id,'other'),{status:403});await assert.rejects(store.start('other',input),{status:403});});
test('four text permits and two image permits are shared across tasks',async()=>{
  const {store,id}=await setup(),{run}=await store.read(id);
  const tasks=[...Array.from({length:8},(_,i)=>task('room',i)),...Array.from({length:5},(_,i)=>task('image',i))];
  await store.addTasks(id,run.epoch,tasks);const claimed=await Promise.all(tasks.map(t=>store.claim(id,t.id)));
  assert.equal(claimed.filter(c=>c?.task.stage==='room').length,4);assert.equal(claimed.filter(c=>c?.task.stage==='image').length,2);
  assert.equal(await store.claim(id,tasks[0].id),null);
});
test('cancellation rejects late results and resuming preserves completed tasks',async()=>{
  const {store,id}=await setup(),{run}=await store.read(id);await store.addTasks(id,run.epoch,[task('room',0),task('room',1)]);
  const first=await store.claim(id,task('room',0).id);await store.finish(id,first.task,{mission:'ready'});
  const second=await store.claim(id,task('room',1).id);await store.control('user',id,'cancel');assert.equal(await store.finish(id,second.task,{mission:'late'}),false);
  await store.control('user',id,'resume');const {tasks}=await store.read(id);assert.equal(tasks.find(t=>t.id===first.task.id).status,'completed');assert.equal(tasks.find(t=>t.id===second.task.id).status,'pending');
});
test('expired provider calls require explicit retry instead of duplicating usage',async()=>{
  const {store,id}=await setup();const claimed=await store.claim(id,task('objective').id);store.now=()=>999999;await store.expire(id);
  assert.equal((await store.read(id)).tasks[0].status,'needs_attention');assert.equal(await store.finish(id,claimed.task,{late:true}),false);
});
test('quota failures cool the shared gate and retain results',async()=>{
  const {store,id,db}=await setup();const claimed=await store.claim(id,task('objective').id);await store.finish(id,claimed.task,null,Object.assign(Error('quota'),{status:429}));
  assert.equal((await store.read(id)).tasks[0].status,'pending');assert.ok(db.data.get('PigPenGenerationControl/capacity').cooldownUntil>1000);
  assert.equal(retryPolicy(Object.assign(Error('timeout'),{status:503}),1).status,'needs_attention');
  assert.equal(retryPolicy(Object.assign(Error('quota'),{status:429}),3).status,'needs_attention');
});
test('manual project changes prevent automatic replacement',async()=>{
  const {store,id,db}=await setup();db.data.get('escapeRoom/session/topics/topic').project={titulo:'Manual'};
  assert.equal(await store.commit(id,{project:{titulo:'Generated'}}),false);assert.equal(db.data.get('escapeRoom/session/topics/topic').project.titulo,'Manual');assert.equal((await store.read(id)).run.commitConflict,true);
});
test('hash ignores property ordering after Firestore serialization',()=>assert.equal(hash({a:1,b:{c:2,d:3}}),hash({b:{d:3,c:2},a:1})));
const engine=createEngine(()=>{throw Error('Unexpected model call');});
function masterFixture(count=4) {
  const config={tema:'Probabilidad',misiones:count,preguntasPorSala:1,nivel:'Secundaria',grado:'Tercero',idioma:'es-419',experience_config:{question_types:['opcion_multiple']}};
  const master=engine.core.normalizeObjectiveBrief(engine.core.fixedSchemaValue(engine.core.buildObjectiveFoundationResponseSchema(count)));
  master.project_copy.title='Azar';master.final_unlock.code=count>4?'PROBABLE':'AZAR';master.experience_config=engine.core.experience.config(config.experience_config);
  const fragments=engine.core.partitionThematicFinalWord(master.final_unlock.code,count);
  master.rooms.forEach((r,i)=>{r.title='Sala '+i;r.question_plans=[];r.fixed_code_fragment=fragments[i];});return {config,master};
}
test('planner fans out every room without waiting for another room',()=>{for(const count of [1,4,8]){const {config,master}=masterFixture(count);const tasks=nextTasks({config,mode:'full'},[{...task('objective'),status:'completed',result:master,resultRef:'master'}]);assert.equal(tasks.filter(t=>t.stage==='room').length,count);assert.equal(tasks.filter(t=>t.stage==='image').length,2);}});
test('images start for the first completed room while other rooms are still generating',()=>{
  const {config,master}=masterFixture();const room={room:master.rooms[0],mission:{titulo:'Uno',contexto:'Datos',preguntas:[]}};
  const tasks=nextTasks({config,mode:'full'},[{...task('objective'),status:'completed',result:master,resultRef:'master'},{...task('room',0),status:'completed',result:room,resultRef:'room'}]);
  assert.ok(tasks.some(t=>t.stage==='image'&&t.roomIndex===0));assert.ok(!tasks.some(t=>t.stage==='review'));
});
test('objective-only requests never generate rooms or images',()=>{const {config,master}=masterFixture();assert.deepEqual(nextTasks({config,mode:'objective'},[{...task('objective'),status:'completed',result:master}]),[]);});
test('engine exports shared contracts without browser globals',()=>{const {config,master}=masterFixture();assert.equal(engine.core.buildDeterministicQuestionPlanTemplate(config).length,4);assert.ok(engine.core.formatObjectiveBrief({...master,parallel_plan_version:1}).includes('SALA 1'));});
