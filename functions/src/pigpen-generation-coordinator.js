const { scheduleRecovery } = require('./pigpen-demand-recovery.js');
const { task, hash, fail } = require('./pigpen-generation-policy.js');
const { GenerationStore, COLLECTION } = require('./pigpen-generation-store.js');
const { createWorkers, createArtifacts } = require('./pigpen-generation-workers.js');
const { createEngine } = require('./pigpen-generation-engine.js');
const { getAdminServices, PROJECT_ID, REGION } = require('./common.js');
const { enqueueHttpTask, QUEUES } = require('./tasks.js');
const engine = createEngine(() => { throw Error('Planner must not invoke the model'); });
const done = t => t?.status === 'completed';

function nextTasks(run, tasks) {
  const masterTask = tasks.find(t => t.stage === 'objective');
  if (!done(masterTask) || run.mode === 'objective') return [];
  const master = masterTask.result, masterRef = masterTask.resultRef;
  const additions = [], byId = new Map(tasks.map(t => [t.id,t]));
  const add = t => { if (!byId.has(t.id)) { byId.set(t.id,t); additions.push(t); } return byId.get(t.id); };
  const globals = engine.imageSpecs(run.config,master,null).map(spec => add(task('image',-1,0,spec.key,{masterRef,spec})));
  const roomTasks = master.rooms.map((_,i) => add(task('room',i,0,'',{masterRef})));
  const globalIssues = master.rooms.map(()=>[]);
  if (roomTasks.every(done)) {
    const previous = [];
    roomTasks.forEach((t,i) => {
      for (const issue of engine.core.findRepeatedQuestionPlans(t.result.room.question_plans,previous)) globalIssues[i].push({target:'question',questionIndex:issue.index,evidence:issue.message,correction:'Sustituye el caso repetido por uno diferente dentro del aprendizaje asignado.'});
      previous.push(...t.result.room.question_plans);
    });
  }
  const reviews = [];
  for (let i=0;i<roomTasks.length;i++) {
    const base = roomTasks[i];
    if (!done(base)) continue;
    let current = base;
    for (let revision=0;revision<=(run.maxReviewRevision || 1);revision++) {
      if (!done(current)) break;
      const specs = engine.imageSpecs(run.config,master,current.result,i);
      const priorReview = byId.get(task('review',i,revision-1).id);
      const issues = priorReview?.result?.issues || [];
      const images = specs.map(spec => {
        const affected = issues.some(f => f.target === 'brief' || (f.target === 'image' && (f.imageKey === spec.key || (Number.isInteger(f.questionIndex) && f.questionIndex === spec.questionIndex))) || (f.target === 'question' && f.questionIndex === spec.questionIndex));
        if (revision && !affected) {
          for (let prior=revision-1;prior>=0;prior--) { const existing=byId.get(task('image',i,prior,spec.key).id); if(existing)return existing; }
        }
        const guidance = revision ? issues.filter(f => f.target === 'image').map(f=>`${f.evidence}: ${f.correction}`).join('\n') : '';
        return add(task('image',i,revision,spec.key,{masterRef,spec:{...spec,prompt:spec.prompt+(guidance?'\nCORRECCIÓN VISUAL: '+guidance:'')}}));
      });
      if (!images.every(done) || !roomTasks.every(done)) break;
      const review = add(task('review',i,revision,'',{masterRef,roomRef:current.resultRef,imageRefs:images.map(t=>t.resultRef),globalIssues:revision ? [] : globalIssues[i]}));
      if (!done(review)) break;
      if (review.result.approved) { reviews.push(review); break; }
      if (revision < (run.maxReviewRevision || 1)) current = add(task('repair',i,revision+1,'',{masterRef,roomRef:current.resultRef,issues:review.result.issues}));
    }
  }
  if (reviews.length === roomTasks.length && globals.every(done)) add(task('assemble',-1,0,'',{masterRef,reviewRefs:reviews.sort((a,b)=>a.roomIndex-b.roomIndex).map(t=>t.resultRef),globalImageRefs:globals.map(t=>t.resultRef)}));
  return additions;
}

class GenerationCoordinator {
  constructor({store,enqueue,execute,timeoutMs=480000}) { Object.assign(this,{store,enqueue,execute,timeoutMs}); }
  async start(uid,input) { const id=await this.store.start(uid,input); await this.advance(id); return this.status(uid,id); }
  async status(uid,id) {
    const {run,tasks}=await this.store.read(id,uid);
    const result=run.resultRef?await this.store.artifacts.get(run.resultRef):null;
    return {runId:id,sessionId:run.sessionId,topicId:run.topicId,mode:run.mode,status:run.status,message:run.message,commitConflict:!!run.commitConflict,
      createdAt:run.createdAt,completedAt:run.completedAt||null,result,
      tasks:tasks.map(({id,stage,roomIndex,revision,key,status,attempt,startedAt,finishedAt,dueAt,error,metrics,uncertain})=>({id,stage,roomIndex,revision,key,status,attempt,startedAt,finishedAt,dueAt,error,metrics,uncertain}))};
  }
  async control(uid,id,action) { await this.store.control(uid,id,action); if(action!=='cancel')await this.advance(id); return this.status(uid,id); }
  async advance(id) {
    await this.store.expire(id);
    let {run,tasks}=await this.store.read(id);
    if(run.status!=='running')return;
    await scheduleRecovery(this.store, id);
    tasks=await this.store.results(tasks);
    const master=tasks.find(t=>t.stage==='objective');
    if(run.mode==='objective'&&done(master)) return this.store.settle(id,{status:'completed',resultRef:master.resultRef});
    const assembled=tasks.find(t=>t.stage==='assemble');
    if(done(assembled)) {
      const committed=await this.store.commit(id,assembled.result);
      return this.store.settle(id,{status:'completed',resultRef:assembled.resultRef,message:committed?'':'El resultado se conserva sin sobrescribir los cambios manuales.'});
    }
    await this.store.addTasks(id,run.epoch,nextTasks(run,tasks));
    ({run,tasks}=await this.store.read(id));
    const active=tasks.filter(t=>['pending','running'].includes(t.status));
    if(!active.length) {
      const needs=tasks.find(t=>t.status==='needs_attention');
      const finalReviews=await this.store.results(tasks.filter(t=>t.stage==='review'&&t.revision===(run.maxReviewRevision || 1)&&done(t)));
      const rejected=finalReviews.find(t=>!t.result.approved);
      if(needs||rejected) return this.store.settle(id,{status:'needs_attention',message:needs?.error||`La sala ${rejected.roomIndex+1} requiere revisión: ${rejected.result.issues.map(i=>i.evidence).join(' · ')}`});
    }
    for(const item of active.filter(t=>t.status==='pending'))await this.enqueue(id,item,run.epoch);
  }
  async dispatch(id,taskId) {
    const claim=await this.store.claim(id,taskId);
    if(!claim)return {skipped:true};
    const {run,task:item}=claim, controller=new AbortController();
    const metrics=[];
    const timer=setTimeout(()=>controller.abort(Object.assign(new Error('Tiempo de respuesta agotado; resultado del proveedor desconocido.'),{uncertain:true})),this.timeoutMs);
    const heartbeat=setInterval(()=>void this.store.heartbeat(id,item).catch(e=>controller.abort(e)),30000);
    try {
      const aborted=new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(controller.signal.reason),{once:true}));
      const result=await Promise.race([this.execute(run,item,controller.signal,m=>metrics.push(m)),aborted]);
      controller.signal.throwIfAborted();
      await this.store.finish(id,item,result,null,metrics);
    } catch(error){await this.store.finish(id,item,null,error,metrics);}
    finally{clearTimeout(timer);clearInterval(heartbeat);}
    await this.advance(id);
    return {ok:true};
  }
}
function createCoordinator(deps={}) {
  const services=deps.db?deps:getAdminServices();
  const artifacts=deps.artifacts||createArtifacts(services.bucket);
  return new GenerationCoordinator({store:deps.store||new GenerationStore(services.db,artifacts),execute:deps.execute||createWorkers({bucket:services.bucket,artifacts,client:deps.client,db:services.db}),
    enqueue:deps.enqueue||((id,item,epoch)=>enqueueHttpTask({queue:QUEUES.pigpen,kind:'pigpen',jobId:`${id}:${item.id}:${epoch}:${item.attempt}:${Math.floor(Date.now()/15000)}`,
      targetUrl:`https://${REGION}-${PROJECT_ID}.cloudfunctions.net/dispatchPigPenGenerationTask`,serviceAccountEmail:`charly-tasks-invoker@${PROJECT_ID}.iam.gserviceaccount.com`,
      payload:{runId:id,taskId:item.id},scheduleDelaySeconds:Math.max(0,((item.dueAt||0)-Date.now())/1000),dispatchDeadlineSeconds:510}))});
}
async function recoverGenerations(coordinator=createCoordinator()) {
  const runs=await coordinator.store.db.collection(COLLECTION).where('status','==','running').limit(100).get();
  for(const doc of runs.docs)await scheduleRecovery(coordinator.store, doc.id);
}
module.exports={GenerationCoordinator,createCoordinator,nextTasks,recoverGenerations};
