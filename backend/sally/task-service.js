const {randomUUID}=require("node:crypto");
const {investigate,hash,course,destination}=require("./agent.js");
const {failure}=require("./policy.js");
const {cleanMoodleHtml}=require("./html-policy.js");
function registerTaskRoutes({app,store,decide,sessions,ensureBrowser,authorizeSession,authenticate,certifiedCourses=[],validateCourse=()=>false,afterBrowserWork=async()=>{}}){
  const active=new Map(),instanceId=randomUUID();
  const save=t=>{t.updatedAt=new Date().toISOString();return store.save(t);};
  const stateView=t=>({...t,scope:t.scope||"legacy",destinationUrl:t.destinationUrl||t.targetUrl||"",targetUrl:t.targetUrl||t.destinationUrl||"",pendingQuestions:t.pendingQuestions||[],risk:(t.plan||[]).some(op=>op.risk==="high")?"high":t.risk||"standard",ownerId:t.ownerId});
  function validId(id){if(!/^[\w-]{1,120}$/.test(id||""))throw failure(400,"Identificador inválido.");return id;}
  function continuationRequested(text){return /^\s*(?:contin(?:ua|úa|uar|úe)|reanuda|reanudar|retoma|retomar)(?:\s+(?:la\s+)?tarea|\s+por\s+favor)?[.!]*\s*$/i.test(String(text||""));}
  async function get(req){await authorizeSession(req);const t=await store.get(validId(req.params.taskId));if(!t||t.sessionId!==req.params.id)throw failure(404,"Tarea no encontrada.");return t;}
  async function recover(t){if(["running","researching"].includes(t.status)&&t.instanceId!==instanceId){t.status="paused";t.approvedHash="";t.progress="El navegador del servidor se reinició. Reconecta Moodle y continúa explícitamente.";await save(t);}return t;}
  function safeAttachments(items,actor,sessionId){if(!Array.isArray(items)||items.length>12)throw Error("Máximo 12 complementos por tarea.");return items.map(item=>{
    if(item.kind==="template")return {kind:"template",id:String(item.id||""),name:String(item.name||""),version:Number(item.version)||0,html:cleanMoodleHtml(String(item.html||"").slice(0,150000))};
    if(item.kind==="file"){if(!String(item.path||"").startsWith(`sallyBrown/${actor.uid}/${sessionId}/attachments/`))throw Error("El archivo no pertenece a esta sesión y usuario.");return {kind:"file",name:String(item.name||""),path:item.path,type:String(item.type||""),note:"Archivo adjunto: si su contenido no está disponible, solicita texto accesible; no inventes su contenido."};}
    if(!["module","selection"].includes(item.kind))throw Error("Complemento no admitido.");return {kind:item.kind,title:String(item.title||"Referencia"),url:String(item.url||""),view:item.view==="model"?"model":"target",text:String(item.text||"").slice(0,30000),analyzedAt:String(item.analyzedAt||"")};
  });}
  async function check(t,actor){await authenticate(actor.idToken);const current=await store.get(t.id);if(current.revision!==t.revision)throw Error("La tarea cambió. Ejecución detenida.");if(t.stop)throw Error(t.stop==="cancel"?"Tarea cancelada.":"Tarea pausada.");}
  async function run(t,actor,mode){
    const key=actor.uid+":"+t.sessionId,target=t.destinationUrl||t.targetUrl,researchUrl=target||t.modelUrl;
    let item=sessions.get(key);
    if(!item?.controller)item=await ensureBrowser({actor,sessionId:t.sessionId,payload:{url:researchUrl,modelUrl:t.modelUrl,targetUrl:target,courseView:target?"target":"model",viewport:t.viewport}});
    if(item.busy||[...active.values()].some(job=>job.task.sessionId===t.sessionId))throw failure(409,"Hay otra tarea usando el navegador de este proyecto.");
    item.busy=true;t.instanceId=instanceId;t.status=mode==="execute"?"running":"researching";delete t.stop;
    try{await save(t);}catch(e){item.busy=false;throw e;}
    active.set(t.id,{task:t,item});
    const work=async()=>{
      try{
        if(mode==="execute"){
          if(!t.approvedHash||t.approvedHash!==hash(t.plan))throw Error("El plan requiere nueva aprobación.");
          await check(t,actor);
          const target=t.destinationUrl||t.targetUrl;await item.controller.start({url:target,modelUrl:t.modelUrl,targetUrl:target,courseView:"target",viewport:t.viewport},actor);
          for(const op of t.plan){
            await check(t,actor);await authorizeSession({actor,params:{id:t.sessionId}});
            if(t.steps?.some(s=>s.id===op.id&&s.status==="completed"))continue;
            if(t.steps?.some(s=>s.id===op.id&&s.status==="started"))throw Error("Un cambio anterior quedó sin verificar. Revisa Moodle antes de repetirlo.");
            const checkpoints=await item.controller.checkpoint({plan:[op],targetUrl:target},actor);
            const backup=await store.artifact(t,{kind:"checkpoint",checkpoints});t.artifacts.push({path:backup,tool:"checkpoint",title:op.intent});
            t.steps.push({id:op.id,status:"started"});await save(t);await check(t,actor);
            const expected=checkpoints.checkpoints?.find(c=>c.operationId===op.id)?.hash;
            const operation=expected?{...op,payload:{...op.payload,expectedHash:expected}}:op;
            await item.controller.approve({plan:[operation]},actor);
            const before=await item.controller.observe({},actor);const evidenceBefore=await store.artifact(t,{snapshot:before});t.artifacts.push({path:evidenceBefore,tool:"evidence",title:"Antes: "+op.intent});await save(t);
            await check(t,actor);
            const result=await item.controller.execute({plan:[operation],targetUrl:target,modelUrl:t.modelUrl},actor);
            const path=await store.artifact(t,{kind:"execution",result});t.artifacts.push({path,tool:"execution",title:op.intent});
            if(result.state!=="completed")throw Error(result.error||"El cambio no terminó correctamente.");
            const after=await item.controller.observe({},actor);const evidenceAfter=await store.artifact(t,{snapshot:after});t.artifacts.push({path:evidenceAfter,tool:"evidence",title:"Después: "+op.intent});
            t.steps.find(s=>s.id===op.id).status="completed";await save(t);
          }
          t.status="completed";t.approvedHash="";t.messages.push({id:randomUUID(),role:"assistant",text:"Plan completado. Consulta los cambios y sus evidencias.",createdAt:new Date().toISOString()});await save(t);
        }else {
          await item.controller.start({url:researchUrl,modelUrl:t.modelUrl,targetUrl:target,courseView:target?"target":"model",viewport:t.viewport},actor);
          const priorObservations=[];
          for(const artifact of t.artifacts.filter(a=>["read_course","read_section","read_module","inspect_quiz","describe_page"].includes(a.tool)).slice(-24)){
            await check(t,actor);
            const saved=await store.readArtifact(artifact.path);
            priorObservations.push({...saved,observedAt:artifact.observedAt||"Fecha no disponible",inherited:true});
          }
          await investigate({task:t,priorObservations,decide:input=>decide(input,actor.idToken),check:async()=>{await check(t,actor);await authorizeSession({actor,params:{id:t.sessionId}});},checkpoint:()=>save(t),saveArtifact:data=>store.artifact(t,data),read:async(d)=>{
          const view=d.view==="model"?"model":"target",target=t.destinationUrl||t.targetUrl,url=view==="model"?t.modelUrl:target;
          await item.controller.start({url,modelUrl:t.modelUrl,targetUrl:target,courseView:view},actor);
          if(d.action==="read_course")return item.controller.inspect({url,courseView:view},actor);
          if(d.action==="read_section")return item.controller.inspect({url,courseView:view,scope:d.query},actor);
          if(d.action==="describe_page")return item.controller.describePage({url:d.url||url},actor);
          return item.controller[d.action==="inspect_quiz"?"inspectQuiz":"readModule"]({url:d.url,courseUrl:url},actor);
        }});
        }
      }catch(error){t.status=t.stop==="cancel"?"cancelled":"paused";t.approvedHash="";t.progress=String(error.message||"Tarea interrumpida.").split("Call log:")[0].slice(0,1000);t.messages.push({id:randomUUID(),role:"assistant",text:t.progress,createdAt:new Date().toISOString()});await save(t).catch(()=>{});}
      finally{await afterBrowserWork(item);item.busy=false;item.touched=Date.now();active.delete(t.id);}
    };
    void work();return t;
  }
  const route=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
  app.get("/api/sally/:id/tasks",route(async(req,res)=>{await authorizeSession(req);res.json({tasks:await store.list(req.params.id,validId(req.query.conversationId))});}));
  app.post("/api/sally/:id/tasks",route(async(req,res)=>{
    if(String(req.body.context?.text||"").length>50000)throw failure(400,"El contexto supera 50 000 caracteres. Acótalo antes de crear la tarea.");
    await authorizeSession(req);const b=req.body,id=validId(b.id),target=b.destinationUrl||b.targetUrl||"";
    if(b.modelUrl&&!validateCourse(course(b.modelUrl)))throw failure(403,"Dominio Moodle no autorizado.");
    if(target&&!validateCourse(destination(target)))throw failure(403,"Dominio Moodle no autorizado.");
    if(b.modelUrl&&target&&new URL(b.modelUrl).origin!==new URL(target).origin)throw failure(400,"Modelo y destino deben pertenecer al mismo Moodle.");
    const existing=await store.get(id);
    if(existing){if(existing.sessionId!==req.params.id||existing.ownerId!==req.actor.uid)throw failure(409,"Identificador ocupado.");return res.json(stateView(existing));}
    const normalizedTarget=target?destination(target):"";
    const t={id,sessionId:req.params.id,conversationId:validId(b.conversationId),ownerId:req.actor.uid,title:String(b.title||"Nueva tarea Moodle").slice(0,120),scope:b.scope==="unified"?"unified":"legacy",thread:b.scope==="unified"?"unified":b.thread==="model"?"model":"target",context:{version:String(b.context?.version||""),text:String(b.context?.text||"").slice(0,50000)},modelUrl:b.modelUrl?course(b.modelUrl):"",modelDisabled:Boolean(b.modelDisabled),destinationUrl:normalizedTarget,destinationOrigin:normalizedTarget?new URL(normalizedTarget).origin:"",targetUrl:normalizedTarget,viewport:b.viewport,pendingQuestions:[],risk:"standard",status:"draft",messages:[],attachments:[],artifacts:[],steps:[],plan:[],createdAt:new Date().toISOString()};await store.create(t);res.status(201).json(stateView(t));
  }));
  app.get("/api/sally/:id/tasks/:taskId",route(async(req,res)=>res.json(stateView(await recover(await get(req))))));
  app.post("/api/sally/:id/tasks/:taskId/messages",route(async(req,res)=>{
    const t=await recover(await get(req)),id=validId(req.body.id),text=String(req.body.text||"");
    if(t.messages.some(m=>m.id===id))return res.json(stateView(t));
    if(active.has(t.id)||["researching","running"].includes(t.status))throw failure(409,"Espera a que termine o pausa la tarea.");
    if(t.steps.some(s=>s.status==="started"))throw failure(409,"Hay un cambio sin verificar. Revisa Moodle antes de iniciar otra instrucción.");
    if(!text.trim()||text.length>30000)throw Error("Mensaje vacío o demasiado largo.");
    const resumeExisting=["paused","cancelled"].includes(t.status)&&continuationRequested(text);
    const mentionedUrls=(text.match(/https:\/\/[^\s<>"']+/g)||[]).map(value=>value.replace(/[),.;]+$/,""));
    const awaiting=new Set(t.pendingQuestions||[]);
    const mentionedTarget=awaiting.has("destinationUrl")?mentionedUrls[0]:/\bdestino\b/i.test(text)?mentionedUrls.at(-1):"";
    const mentionedModel=awaiting.has("modelUrl")?mentionedUrls[0]:/\bmodelo\b/i.test(text)?mentionedUrls[0]:"";
    const suppliedTarget=req.body.destinationUrl||req.body.targetUrl||mentionedTarget||t.destinationUrl||t.targetUrl||"";
    const suppliedModel=req.body.modelUrl===undefined?(mentionedModel||t.modelUrl):req.body.modelUrl;
    if(suppliedTarget){const normalized=destination(suppliedTarget);if(!validateCourse(normalized))throw failure(403,"Dominio Moodle no autorizado.");t.destinationUrl=t.targetUrl=normalized;t.destinationOrigin=new URL(normalized).origin;}
    if(suppliedModel){const normalized=course(suppliedModel);if(!validateCourse(normalized))throw failure(403,"Dominio Moodle no autorizado.");t.modelUrl=normalized;}
    t.modelDisabled=Boolean(req.body.modelDisabled)||/\bsin\s+(?:curso\s+)?modelo\b/i.test(text)?true:Boolean(t.modelDisabled);
    if(t.modelUrl&&t.destinationUrl&&new URL(t.modelUrl).origin!==new URL(t.destinationUrl).origin)throw failure(400,"Modelo y destino deben pertenecer al mismo Moodle.");
    if(req.body.viewport)t.viewport=req.body.viewport;
    t.messages.push({id,role:"user",text,createdAt:new Date().toISOString()});t.attachments=safeAttachments(req.body.attachments||[],req.actor,t.sessionId);t.approvedHash="";t.pendingQuestions=[];
    if(resumeExisting){
      if(t.plan.length){t.planHash=hash(t.plan);t.status="awaiting_approval";t.progress=t.steps.some(step=>step.status==="completed")?"Trabajo anterior recuperado. Revisa y aprueba únicamente las acciones pendientes.":"Plan anterior recuperado. Revísalo y vuelve a aprobarlo para continuar.";t.messages.push({id:randomUUID(),role:"assistant",text:t.progress,createdAt:new Date().toISOString()});await save(t);return res.status(202).json(stateView(t));}
      t.status="draft";t.progress="Reanudando desde el último punto guardado";await save(t);res.status(202).json(stateView(t));void run(t,req.actor,"research").catch(async e=>{t.status="paused";t.progress=e.message;await save(t).catch(()=>{});});return;
    }
    t.status="draft";t.risk="standard";t.priorRuns=[...(t.priorRuns||[]),...(t.plan.length?[{plan:t.plan,steps:t.steps,endedAt:new Date().toISOString()}]:[])];t.plan=[];t.steps=[];
    if(!t.destinationUrl){t.pendingQuestions=["destinationUrl"];t.status="waiting_input";t.progress="Esperando el destino";t.messages.push({id:randomUUID(),role:"assistant",text:"¿Cuál es la URL del Moodle destino donde se aplicarán los cambios?",createdAt:new Date().toISOString()});await save(t);return res.status(202).json(stateView(t));}
    if(t.scope==="unified"&&!t.modelUrl&&!t.modelDisabled){t.pendingQuestions=["modelUrl"];t.status="waiting_input";t.progress="Esperando la referencia";t.messages.push({id:randomUUID(),role:"assistant",text:"¿Usaremos un curso modelo del mismo Moodle? Indica su URL o responde \"sin modelo\".",createdAt:new Date().toISOString()});await save(t);return res.status(202).json(stateView(t));}
    await save(t);res.status(202).json(stateView(t));
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
      const target=t.destinationUrl||t.targetUrl;
      if(!certifiedCourses.some(url=>{try{return new URL(url).origin===new URL(target).origin;}catch{return false;}}))throw Error("Este Moodle destino aún no está certificado para escrituras del agente.");
      const high=(t.plan||[]).filter(op=>op.risk==="high");
      if(high.length>1)throw Error("Las acciones de alto riesgo deben aprobarse y ejecutarse una por una.");
      if(high.length&&req.body.confirmationText!==high[0].confirmationText)throw Error(`Escribe exactamente \"${high[0].confirmationText}\" para aprobar esta acción.`);
      t.approvedHash=t.planHash;t.approvedBy=req.actor.uid;t.approvedAt=new Date().toISOString();t.status="approved";await save(t);return res.json(t);
    }
    if(action==="execute"){if(t.status!=="approved")throw Error("Aprueba el plan antes de ejecutarlo.");return res.status(202).json(await run(t,req.actor,"execute"));}
    if(action==="resume"){if(t.steps.some(s=>s.status==="started"))throw Error("Hay un cambio incierto. Verifica Moodle antes de reanudar.");t.approvedHash="";if(t.plan.length){t.planHash=hash(t.plan);t.status="awaiting_approval";t.progress=t.steps.some(step=>step.status==="completed")?"Trabajo anterior recuperado. Revisa y aprueba únicamente las acciones pendientes.":"Plan anterior recuperado. Revísalo y vuelve a aprobarlo para continuar.";await save(t);return res.status(202).json(stateView(t));}return res.status(202).json(await run(t,req.actor,"research"));}
    throw Error("Control no permitido.");
  }));
  app.get("/api/sally/:id/tasks/:taskId/artifacts/:index",route(async(req,res)=>{const t=await get(req),artifact=t.artifacts[Number(req.params.index)];if(!artifact)throw failure(404,"Resultado no encontrado.");res.json(await store.readArtifact(artifact.path));}));
  return {pauseSession(sessionId){for(const job of active.values())if(job.task.sessionId===sessionId)job.task.stop="pause";},close(){for(const job of active.values())job.task.stop="pause";}};
}
module.exports={registerTaskRoutes};
