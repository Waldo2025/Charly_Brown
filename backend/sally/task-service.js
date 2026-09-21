const {randomUUID}=require("node:crypto");
const {investigate,hash,course}=require("./agent.js");
const {failure}=require("./policy.js");
const {cleanMoodleHtml}=require("./html-policy.js");
function registerTaskRoutes({app,store,decide,sessions,authorizeSession,authenticate,certifiedCourses=[],validateCourse=()=>false}){
  const active=new Map(),instanceId=randomUUID();
  const save=t=>{t.updatedAt=new Date().toISOString();return store.save(t);};
  const stateView=t=>({...t,ownerId:t.ownerId});
  function validId(id){if(!/^[\w-]{1,120}$/.test(id||""))throw failure(400,"Identificador inválido.");return id;}
  async function get(req){await authorizeSession(req);const t=await store.get(validId(req.params.taskId));if(!t||t.sessionId!==req.params.id)throw failure(404,"Tarea no encontrada.");return t;}
  async function recover(t){if(["running","researching"].includes(t.status)&&t.instanceId!==instanceId){t.status="paused";t.approvedHash="";t.progress="El navegador del servidor se reinició. Reconecta Moodle y continúa explícitamente.";await save(t);}return t;}
  function safeAttachments(items,actor,sessionId){if(!Array.isArray(items)||items.length>12)throw Error("Máximo 12 complementos por tarea.");return items.map(item=>{
    if(item.kind==="template")return {kind:"template",id:String(item.id||""),name:String(item.name||""),version:Number(item.version)||0,html:cleanMoodleHtml(String(item.html||"").slice(0,150000))};
    if(item.kind==="file"){if(!String(item.path||"").startsWith(`sallyBrown/${actor.uid}/${sessionId}/attachments/`))throw Error("El archivo no pertenece a esta sesión y usuario.");return {kind:"file",name:String(item.name||""),path:item.path,type:String(item.type||""),note:"Archivo adjunto: si su contenido no está disponible, solicita texto accesible; no inventes su contenido."};}
    if(!["module","selection"].includes(item.kind))throw Error("Complemento no admitido.");return {kind:item.kind,title:String(item.title||"Referencia"),url:String(item.url||""),view:item.view==="model"?"model":"target",text:String(item.text||"").slice(0,30000),analyzedAt:String(item.analyzedAt||"")};
  });}
  async function check(t,actor){await authenticate(actor.idToken);const current=await store.get(t.id);if(current.revision!==t.revision)throw Error("La tarea cambió. Ejecución detenida.");if(t.stop)throw Error(t.stop==="cancel"?"Tarea cancelada.":"Tarea pausada.");}
  async function run(t,actor,mode){
    const key=actor.uid+":"+t.sessionId,item=sessions.get(key);
    if(!item?.controller)throw failure(409,"Abre el curso en Moodle e inicia sesión antes de continuar.");
    if(item.busy||[...active.values()].some(job=>job.task.sessionId===t.sessionId))throw failure(409,"Hay otra tarea usando el navegador de este proyecto.");
    item.busy=true;t.instanceId=instanceId;t.status=mode==="execute"?"running":"researching";delete t.stop;
    try{await save(t);}catch(e){item.busy=false;throw e;}
    active.set(t.id,{task:t,item});
    const work=async()=>{
      try{
        if(mode==="execute"){
          if(!t.approvedHash||t.approvedHash!==hash(t.plan))throw Error("El plan requiere nueva aprobación.");
          await check(t,actor);
          await item.controller.start({url:t.targetUrl,modelUrl:t.modelUrl,targetUrl:t.targetUrl,courseView:"target"},actor);
          for(const op of t.plan){
            await check(t,actor);await authorizeSession({actor,params:{id:t.sessionId}});
            if(t.steps?.some(s=>s.id===op.id&&s.status==="completed"))continue;
            if(t.steps?.some(s=>s.id===op.id&&s.status==="started"))throw Error("Un cambio anterior quedó sin verificar. Revisa Moodle antes de repetirlo.");
            const checkpoints=await item.controller.checkpoint({plan:[op],targetUrl:t.targetUrl},actor);
            const backup=await store.artifact(t,{kind:"checkpoint",checkpoints});t.artifacts.push({path:backup,tool:"checkpoint",title:op.intent});
            t.steps.push({id:op.id,status:"started"});await save(t);await check(t,actor);
            const expected=checkpoints.checkpoints?.find(c=>c.operationId===op.id)?.hash;
            const operation=expected?{...op,payload:{...op.payload,expectedHash:expected}}:op;
            await item.controller.approve({plan:[operation]},actor);
            const before=await item.controller.observe({},actor);const evidenceBefore=await store.artifact(t,{snapshot:before});t.artifacts.push({path:evidenceBefore,tool:"evidence",title:"Antes: "+op.intent});await save(t);
            await check(t,actor);
            const result=await item.controller.execute({plan:[operation],targetUrl:t.targetUrl,modelUrl:t.modelUrl},actor);
            const path=await store.artifact(t,{kind:"execution",result});t.artifacts.push({path,tool:"execution",title:op.intent});
            if(result.state!=="completed")throw Error(result.error||"El cambio no terminó correctamente.");
            const after=await item.controller.observe({},actor);const evidenceAfter=await store.artifact(t,{snapshot:after});t.artifacts.push({path:evidenceAfter,tool:"evidence",title:"Después: "+op.intent});
            t.steps.find(s=>s.id===op.id).status="completed";await save(t);
          }
          t.status="completed";t.approvedHash="";t.messages.push({id:randomUUID(),role:"assistant",text:"Plan completado. Consulta los cambios y sus evidencias.",createdAt:new Date().toISOString()});await save(t);
        }else {
          const priorObservations=[];
          for(const artifact of t.artifacts.filter(a=>["read_course","read_module","inspect_quiz"].includes(a.tool)).slice(-8)){
            await check(t,actor);
            const saved=await store.readArtifact(artifact.path);
            priorObservations.push({...saved,observedAt:artifact.observedAt||"Fecha no disponible",inherited:true});
          }
          await investigate({task:t,priorObservations,decide:input=>decide(input,actor.idToken),check:async()=>{await check(t,actor);await authorizeSession({actor,params:{id:t.sessionId}});},checkpoint:()=>save(t),saveArtifact:data=>store.artifact(t,data),read:async(d)=>{
          const view=d.view==="model"?"model":"target",url=view==="model"?t.modelUrl:t.targetUrl;
          await item.controller.start({url,modelUrl:t.modelUrl,targetUrl:t.targetUrl,courseView:view},actor);
          if(d.action==="read_course")return item.controller.inspect({url,courseView:view},actor);
          return item.controller[d.action==="inspect_quiz"?"inspectQuiz":"readModule"]({url:d.url,courseUrl:url},actor);
        }});
        }
      }catch(error){t.status=t.stop==="cancel"?"cancelled":"paused";t.approvedHash="";t.progress=String(error.message||"Tarea interrumpida.").split("Call log:")[0].slice(0,1000);t.messages.push({id:randomUUID(),role:"assistant",text:t.progress,createdAt:new Date().toISOString()});await save(t).catch(()=>{});}
      finally{item.busy=false;item.touched=Date.now();active.delete(t.id);}
    };
    void work();return t;
  }
  const route=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
  app.get("/api/sally/:id/tasks",route(async(req,res)=>{await authorizeSession(req);res.json({tasks:await store.list(req.params.id,validId(req.query.conversationId))});}));
  app.post("/api/sally/:id/tasks",route(async(req,res)=>{
    if(String(req.body.context?.text||"").length>50000)throw failure(400,"El contexto supera 50 000 caracteres. Acótalo antes de crear la tarea.");
    await authorizeSession(req);const b=req.body,id=validId(b.id);for(const url of [b.modelUrl,b.targetUrl].filter(Boolean))if(!validateCourse(course(url)))throw failure(403,"Dominio Moodle no autorizado.");const existing=await store.get(id);
    if(existing){if(existing.sessionId!==req.params.id||existing.ownerId!==req.actor.uid)throw failure(409,"Identificador ocupado.");return res.json(stateView(existing));}
    const t={id,sessionId:req.params.id,conversationId:validId(b.conversationId),ownerId:req.actor.uid,title:String(b.title||"Nueva tarea").slice(0,120),thread:b.thread==="model"?"model":"target",context:{version:String(b.context?.version||""),text:String(b.context?.text||"").slice(0,50000)},modelUrl:b.modelUrl?course(b.modelUrl):"",targetUrl:b.targetUrl?course(b.targetUrl):"",status:"draft",messages:[],attachments:[],artifacts:[],steps:[],plan:[],createdAt:new Date().toISOString()};await store.create(t);res.status(201).json(stateView(t));
  }));
  app.get("/api/sally/:id/tasks/:taskId",route(async(req,res)=>res.json(stateView(await recover(await get(req))))));
  app.post("/api/sally/:id/tasks/:taskId/messages",route(async(req,res)=>{
    const t=await recover(await get(req)),id=validId(req.body.id),text=String(req.body.text||"");
    if(t.messages.some(m=>m.id===id))return res.json(stateView(t));
    if(active.has(t.id)||["researching","running"].includes(t.status))throw failure(409,"Espera a que termine o pausa la tarea.");
    if(t.steps.some(s=>s.status==="started"))throw failure(409,"Hay un cambio sin verificar. Revisa Moodle antes de iniciar otra instrucción.");
    if(!text.trim()||text.length>30000)throw Error("Mensaje vacío o demasiado largo.");
    t.messages.push({id,role:"user",text,createdAt:new Date().toISOString()});t.attachments=safeAttachments(req.body.attachments||[],req.actor,t.sessionId);t.approvedHash="";t.status="draft";t.priorRuns=[...(t.priorRuns||[]),...(t.plan.length?[{plan:t.plan,steps:t.steps,endedAt:new Date().toISOString()}]:[])];t.plan=[];t.steps=[];await save(t);res.status(202).json(stateView(t));
    // Acceptance is durable even if the browser isn't connected yet.
    void run(t,req.actor,"research").catch(async e=>{t.status="paused";t.progress=e.message;await save(t).catch(()=>{});});
  }));
  app.post("/api/sally/:id/tasks/:taskId/context",route(async(req,res)=>{const t=await get(req);if(active.has(t.id))throw failure(409,"Pausa y espera a que termine el paso actual.");t.context={version:String(req.body.version||""),text:String(req.body.text||"").slice(0,50000)};t.approvedHash="";t.plan=[];t.status="draft";await save(t);res.json(t);}));
  app.post("/api/sally/:id/tasks/:taskId/control",route(async(req,res)=>{
    let t=await get(req);const action=req.body.action;
    if(["pause","cancel"].includes(action)){const job=active.get(t.id);if(job){job.task.stop=action;await job.item.controller.control({action},{...req.actor});return res.json({status:"stopping"});}t.status=action==="pause"?"paused":"cancelled";t.approvedHash="";await save(t);return res.json(t);}
    if(active.has(t.id))throw failure(409,"La tarea sigue ejecutándose.");
    t=await recover(t);
    if(action==="approve"){
      if(t.status!=="awaiting_approval"||req.body.planHash!==t.planHash||!t.plan.length)throw Error("Esta versión del plan no se puede aprobar.");
      if(!certifiedCourses.includes(t.targetUrl))throw Error("Este curso destino aún no está certificado para escrituras del agente.");
      t.approvedHash=t.planHash;t.approvedBy=req.actor.uid;t.approvedAt=new Date().toISOString();t.status="approved";await save(t);return res.json(t);
    }
    if(action==="execute"){if(t.status!=="approved")throw Error("Aprueba el plan antes de ejecutarlo.");return res.status(202).json(await run(t,req.actor,"execute"));}
    if(action==="resume"){if(t.steps.some(s=>s.status==="started"))throw Error("Hay un cambio incierto. Verifica Moodle antes de reanudar.");t.approvedHash="";return res.status(202).json(await run(t,req.actor,"research"));}
    throw Error("Control no permitido.");
  }));
  app.get("/api/sally/:id/tasks/:taskId/artifacts/:index",route(async(req,res)=>{const t=await get(req),artifact=t.artifacts[Number(req.params.index)];if(!artifact)throw failure(404,"Resultado no encontrado.");res.json(await store.readArtifact(artifact.path));}));
  return {pauseSession(sessionId){for(const job of active.values())if(job.task.sessionId===sessionId)job.task.stop="pause";},close(){for(const job of active.values())job.task.stop="pause";}};
}
module.exports={registerTaskRoutes};
