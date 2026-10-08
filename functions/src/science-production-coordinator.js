const { getAdminServices, PROJECT_ID, REGION } = require('./common.js');
const { enqueueHttpTask, QUEUES } = require('./tasks.js');
const { ScienceProductionStore, COLLECTION } = require('./science-production-store.js');
const { createScienceWorkers } = require('./science-production-workers.js');
const { publicRun, fail } = require('./science-production-policy.js');
const productionEnabled=()=>String(process.env.SCIENCE_PRODUCTION_ENABLED||'true').toLowerCase()!=='false';
class ScienceProductionCoordinator {
  constructor({store,execute,enqueue,now=Date.now,timeoutMs=180000,enabled=productionEnabled}){Object.assign(this,{store,execute,enqueue,now,timeoutMs});this.enabled=typeof enabled==='function'?enabled:()=>enabled;}
  requireEnabled(){if(!this.enabled())throw fail('science_production_disabled',503);}
  async plan(uid,config,activity){this.requireEnabled();const id=await this.store.create(uid,config,activity);await this.advance(id);return this.status(uid,id);}
  async status(uid,id){await this.advance(id);const {run,tasks}=await this.store.read(id,uid);const result=publicRun(run,tasks);
    if(run.status!=='completed'&&tasks.some(t=>t.stage!=='planner'&&t.status==='completed')){
      const done=Object.fromEntries(tasks.filter(t=>t.status==='completed').map(t=>[t.id,t.result]));
      const preview=structuredClone(run.activity);Object.assign(preview,done.pedagogy||{});preview.assessments=tasks.filter(t=>t.stage==='questions'&&t.status==='completed').sort((a,b)=>a.input.levelIndex-b.input.levelIndex).flatMap(t=>t.result.questions||[]);
      const images=tasks.filter(t=>t.stage==='image'&&t.status==='completed').map(t=>t.result);
      if(run.config.gameMode==='simulator'){const art=done['art-direction']||run.plan?.artDirection;preview.visualScene={...(preview.visualScene||{}),version:2,style:'illustrated-realism',status:'partial',artDirection:art||null,background:images.find(i=>i.role==='background')||{},layers:images.filter(i=>i.role==='primary').map(i=>({...i,id:i.sourceTaskId,label:i.alt,role:'primary',anchor:art?.layout?.anchor,scale:art?.layout?.scale,mobileAnchor:art?.layout?.mobileAnchor,mobileScale:art?.layout?.mobileScale,motionPreset:art?.motion?.preset,driver:art?.motion?.driver}))};}
      else{const question=preview.assessments.find(q=>q.type==='image-multiple'),image=images.find(i=>i.role==='question');if(question&&image)question.visual={...question.visual,...image};if(preview.learningGuide?.levels)preview.learningGuide.levels=preview.learningGuide.levels.map((level,index)=>{const image=images.find(i=>i.role==='background'&&i.levelIndex===index);return image?{...level,imageUrl:image.imageUrl,imageSrc:image.imageUrl}:level;});}
      if(run.plan)preview.title=run.plan.title;preview.generation={complete:false,runId:run.id,engine:'science-mcp'};result.previewActivity=preview;
    }return result;}
  async control(uid,id,action,body){if(['start','regenerate_asset','retry','validate_activity','revise'].includes(action))this.requireEnabled();await this.store.control(id,uid,action,body);await this.advance(id);return this.status(uid,id);}
  async advance(id){
    if(!this.enabled())return {disabled:true};
    const {run,tasks}=await this.store.read(id);
    if(!['planning','running'].includes(run.status))return;
    await require('./pigpen-demand-recovery.js').scheduleRecovery(this.store, id, { queue: QUEUES.science, targetUrl: `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/recoverScienceProductionTask` });
    const done=new Set(tasks.filter(t=>t.status==='completed').map(t=>t.id));
    const pending=tasks.filter(t=>(run.status==='planning'?t.id===`planner-${run.revision}`:t.stage!=='planner')&&['pending','running'].includes(t.status)&&(t.status!=='running'||t.leaseUntil<=this.now()||t.epoch!==run.epoch)&&t.dependencies.every(dep=>done.has(dep)));
    await Promise.all(pending.map(item=>this.enqueue(id,item,run.epoch)));
  }
  async dispatch(id,taskId){
    this.requireEnabled();
    const claimed=await this.store.claim(id,taskId);if(!claimed)return {skipped:true};
    const {run,task}=claimed,controller=new AbortController();let timer;
    const heartbeat=setInterval(()=>{void this.store.heartbeat(id,task).catch(error=>controller.abort(error));},30000);
    try{
      const {tasks}=await this.store.read(id);
      const inputs=Object.fromEntries(tasks.filter(t=>t.status==='completed').map(t=>[t.id,t.result]));
      const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>controller.abort(Object.assign(new Error('Tiempo del agente agotado.'),{status:504})),this.timeoutMs);controller.signal.addEventListener('abort',()=>reject(controller.signal.reason),{once:true});});
      const {invokeScienceAgent}=require('./science-mcp.js');
      const result=await Promise.race([deadline,invokeScienceAgent({stage:task.stage,subject:run.config.subject,execute:()=>this.execute(run,task,inputs,controller.signal)})]);
      await this.store.finish(id,task,result);
    }catch(error){await this.store.finish(id,task,null,error);}
    finally{clearInterval(heartbeat);clearTimeout(timer);}
    await this.advance(id);return {ok:true};
  }
}
function createScienceProductionCoordinator(dependencies={}){
  const services=dependencies.db?dependencies:getAdminServices();
  return new ScienceProductionCoordinator({enabled:dependencies.enabled??productionEnabled,store:dependencies.store||new ScienceProductionStore(services.db),execute:dependencies.execute||createScienceWorkers({...dependencies,bucket:dependencies.bucket||services.bucket}),
    enqueue:dependencies.enqueue||((id,item,epoch)=>enqueueHttpTask({queue:QUEUES.science||'science-production',kind:'science-production',jobId:`${id}:${item.id}:${epoch}:${item.attempt}:${Math.floor(Date.now()/60000)}`,
      targetUrl:`https://${REGION}-${PROJECT_ID}.cloudfunctions.net/dispatchScienceProductionTask`,serviceAccountEmail:`charly-tasks-invoker@${PROJECT_ID}.iam.gserviceaccount.com`,payload:{runId:id,taskId:item.id},scheduleDelaySeconds:Math.max(0,((item.dueAt||0)-Date.now())/1000),dispatchDeadlineSeconds:240}))});
}
async function recoverScienceProductions(dependencies={}){
  const {db}=dependencies.db?dependencies:getAdminServices(),coordinator=createScienceProductionCoordinator(dependencies);
  for(const status of ['planning','running']){const runs=await db.collection(COLLECTION).where('status','==',status).limit(100).get();await Promise.all(runs.docs.map(doc=>coordinator.advance(doc.id)));}
}
module.exports={ScienceProductionCoordinator,createScienceProductionCoordinator,recoverScienceProductions,productionEnabled};
