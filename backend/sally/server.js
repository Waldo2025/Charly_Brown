const express=require("express");
const admin=require("firebase-admin");
const {mkdtemp,rm}=require("node:fs/promises");
const {tmpdir}=require("node:os");
const path=require("node:path");
const {cleanMoodleHtml}=require("./html-policy.js");
const {createSallyBrownController}=require("./controller.js");
const {failure,permittedProfile,createNetworkPolicy,assertSession}=require("./policy.js");
const {registerTaskRoutes}=require("./task-service.js");
const {createTaskStore}=require("./task-store.js");
const {createDecisionClient}=require("./agent.js");

function createService({verifyToken,getProfile,getSession,makeController=createSallyBrownController,maxBrowsers=3,networkPolicy,taskStore,decide=createDecisionClient(),certifiedCourses=[]}){
  const app=express(),sessions=new Map();
  app.disable("x-powered-by");
  const origins=new Set((process.env.SALLY_WEB_ORIGINS||"https://charly-brown.web.app,https://charly-brown.firebaseapp.com,http://localhost:3000,http://127.0.0.1:3000,http://localhost:5010,http://127.0.0.1:5010").split(",").map(origin=>origin.trim()).filter(Boolean));
  const moodleOrigins=(process.env.SALLY_MOODLE_ORIGINS||"https://aprende.asc.education").split(",");
  const requestAllowed=networkPolicy||createNetworkPolicy([...moodleOrigins,"https://fonts.googleapis.com","https://fonts.gstatic.com","https://cdn.jsdelivr.net"]);
  app.use((req,res,next)=>{
    res.set("Cache-Control","no-store");
    const origin=req.headers.origin;
    if(origin&&!origins.has(origin))return res.status(403).json({error:"Origen no autorizado."});
    if(origin){res.set("Access-Control-Allow-Origin",origin);res.set("Vary","Origin");}
    res.set("Access-Control-Allow-Headers","Authorization,Content-Type");
    res.set("Access-Control-Allow-Methods","GET,POST,OPTIONS");
    res.set("Access-Control-Max-Age","600");
    if(req.method==="OPTIONS")return res.sendStatus(204);
    next();
  });
  app.use(express.json({limit:"2mb"}));
  app.get("/health",(_req,res)=>res.json({ok:true,service:"sally-browser"}));
  const authenticate=async token=>{
    if(!token)throw failure(401,"Inicia sesión en CharlyBrown.");
    let claims;
    try{claims=await verifyToken(token);}catch{throw failure(401,"La sesión expiró. Inicia sesión de nuevo.");}
    const profile=await getProfile(claims.uid);
    if(!permittedProfile(profile,claims))throw failure(403,"Tu cuenta debe estar aprobada y tener un rol.");
    return {uid:claims.uid,email:claims.email||"",role:(profile||claims).role||"",idToken:token};
  };
  app.use("/api/sally",async(req,res,next)=>{
    try{req.actor=await authenticate(String(req.headers.authorization||"").replace(/^Bearer\s+/i,""));next();}
    catch(e){next(e);}
  });
  app.get("/api/sally/availability",(_req,res)=>res.json({automationAvailable:true,agentAvailable:Boolean(taskStore),transport:"server",viewport:{width:1440,height:900}}));
  const authorizedSession=async req=>{
    const id=String(req.params.id||"");
    if(!/^[\w-]{1,120}$/.test(id))throw failure(400,"Sesión inválida.");
    assertSession(await getSession(id),req.actor.uid);
    return req.actor.uid+":"+id;
  };
  const tasks=taskStore?registerTaskRoutes({app,store:taskStore,decide,sessions,authorizeSession:authorizedSession,authenticate,certifiedCourses,validateCourse:url=>moodleOrigins.includes(new URL(url).origin)}):null;
  async function dispose(key){
    const item=sessions.get(key);if(!item)return;
    sessions.delete(key);
    if(item.controller)await item.controller.close({},item.actor).catch(()=>{});
    if(item.directory)await rm(item.directory,{recursive:true,force:true});
  }
  app.get("/api/sally/:id/events",async(req,res,next)=>{
    try{
      const key=await authorizedSession(req),item=sessions.get(key);
      if(!item)return res.json({connected:false,events:[],snapshot:null});
      item.touched=Date.now();
      if(req.query.heartbeat==="1")return res.json({connected:true,events:[],snapshot:null});
      const after=Number(req.query.after)||0;
      res.json({connected:true,revision:item.revision,snapshot:item.revision>after?item.snapshot:null,events:item.events.filter(event=>event.sequence>after)});
    }catch(e){next(e);}
  });
  app.post("/api/sally/:id/command",async(req,res,next)=>{
    let item,locked=false;
    try{
      const key=await authorizedSession(req),command=String(req.body.command||"");
      if(!["start","close","navigate","input","inspect","selection","approve","execute","control","checkpoint"].includes(command))throw failure(400,"Comando no permitido.");
      const payload=req.body.payload||{};
      item=sessions.get(key);
      if(command==="close"){await dispose(key);return res.json({closed:true});}
      if(command==="start"){
        if(item?.busy)throw failure(409,"Espera a que termine la operación actual.");
        for(const field of ["url","modelUrl","targetUrl"]){
          if(!payload[field])continue;
          let url;try{url=new URL(payload[field]);}catch{throw failure(400,"URL inválida.");}
          if(!moodleOrigins.includes(url.origin)||!(await requestAllowed(url.href)))throw failure(403,"Este dominio Moodle no está habilitado.");
        }
        if(!payload.url)throw failure(400,"Indica la URL de Moodle.");
        item=sessions.get(key); // Network validation yielded: recheck the reservation.
        if(item?.busy)throw failure(409,"Espera a que termine la operación actual.");
        if(!item){
          if(sessions.size>=maxBrowsers)throw failure(429,"Todos los navegadores están ocupados. Intenta de nuevo en unos minutos.");
          item={actor:req.actor,busy:true,touched:Date.now(),events:[],snapshot:null,revision:0};
          sessions.set(key,item);
          try{
            item.directory=await mkdtemp(path.join(tmpdir(),"sally-browser-"));
            item.controller=makeController({getPath:()=>item.directory,reauthorize:async token=>{
              const actor=await authenticate(token);assertSession(await getSession(req.params.id),actor.uid);return actor;
            },requestAllowed,
              sendEvent:event=>{
                const sequence=++item.revision;
                if(event.type==="snapshot")item.snapshot=event.payload;
                else{item.events.push({...event,sequence});if(item.events.length>30)item.events.shift();}
              }});
          }catch(e){sessions.delete(key);throw e;}
          item.busy=false;
        }
      }
      if(!item)throw failure(409,"El navegador se cerró por inactividad. Vuelve a abrir el curso.");
      if(item.busy&&command==="input"){tasks?.pauseSession(req.params.id);await item.controller.control({action:"cancel"},req.actor);throw failure(409,"Pausando el agente para devolver el control manual. Intenta de nuevo cuando termine el paso actual.");}
      if(command==="control"&&["pause","cancel"].includes(payload.action))tasks?.pauseSession(req.params.id);
      if(item.busy&&command!=="control")throw failure(409,"Hay una operación en curso.");
      if(command==="approve"||command==="execute"){
        for(const op of payload.plan||[]){
          if(op.payload?.localPath||op.payload?.assets?.some(asset=>asset.localPath))throw failure(400,"No se admiten rutas locales.");
          for(const asset of op.payload?.assets||[op.payload||{}]){
            if(!asset.url)continue;
            let url;try{url=new URL(asset.url);}catch{throw failure(400,"Adjunto inválido.");}
            const prefix="/v0/b/charly-brown.firebasestorage.app/o/";
            const legacy="/v0/b/charly-brown.appspot.com/o/";
            const matching=[prefix,legacy].find(p=>url.pathname.startsWith(p));
            const object=matching?decodeURIComponent(url.pathname.slice(matching.length)):"";
            if(url.protocol!=="https:"||url.hostname!=="firebasestorage.googleapis.com"||!object.startsWith("sallyBrown/"+req.actor.uid+"/"+req.params.id+"/attachments/"))
              throw failure(400,"El adjunto debe pertenecer a esta sesión y usuario.");
          }
          if(op.payload?.html)op.payload.html=cleanMoodleHtml(op.payload.html);
        }
      }
      if(command!=="control"){item.busy=true;locked=true;}
      item.actor=req.actor;item.touched=Date.now();
      const result=await item.controller[command](payload,req.actor);
      res.json(result||{ok:true});
    }catch(e){next(e);}
    finally{if(item&&locked){item.busy=false;item.touched=Date.now();}}
  });
  app.use((error,_req,res,_next)=>{
    const message=String(error.message||"No fue posible completar la operación.").split("Call log:")[0].replace(/https?:\/\/[^\s]+/g,"[sitio]").slice(0,350);
    res.status(error.status||400).json({error:message});
  });
  const timer=setInterval(()=>{
    for(const [key,item] of sessions)if(!item.busy&&Date.now()-item.touched>10*60*1000)void dispose(key);
  },30000);timer.unref();
  return {app,close:async()=>{clearInterval(timer);tasks?.close();await Promise.all([...sessions.keys()].map(dispose));}};
}
if(require.main===module){
  admin.initializeApp({projectId:process.env.GOOGLE_CLOUD_PROJECT||"charly-brown"});
  const db=admin.firestore();
  const service=createService({
    taskStore:createTaskStore(db,admin.storage().bucket(process.env.SALLY_STORAGE_BUCKET||"charly-brown.firebasestorage.app")),
    certifiedCourses:(process.env.SALLY_CERTIFIED_COURSES||"").split(",").filter(Boolean),
    verifyToken:token=>admin.auth().verifyIdToken(token,true),
    getProfile:async uid=>{const doc=await db.collection("users").doc(uid).get();return doc.exists?doc.data():null;},
    getSession:async id=>{const doc=await db.collection("SallyBrownSessions").doc(id).get();return doc.exists?doc.data():null;}
  });
  const listener=service.app.listen(process.env.PORT||8080,"0.0.0.0",()=>console.log("Sally browser service ready"));
  process.on("SIGTERM",()=>{void service.close().finally(()=>listener.close(()=>process.exit(0)));});
}
module.exports={createService};
