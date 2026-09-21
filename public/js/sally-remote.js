// Firebase-authenticated transport. Moodle cookies stay in the remote browser,
// never in Firestore or the web client.
export function createRemoteBrowser({getUser,onEvent,baseUrl="https://sally-browser-mm2qel4fka-uc.a.run.app"}) {
  let sessionId="",cursor=0,timer,disposed=false,generation=0,pollFailures=0;
  let pending=[],inputTimer,inputBusy=false,interactiveUntil=0;
  let pollingGeneration=null;
  function discardInputs(message){clearTimeout(inputTimer);inputTimer=null;for(const item of pending)item.reject(new Error(message));pending=[];}
  async function flushInputs(){
    inputTimer=null;if(inputBusy||!pending.length||disposed)return;
    const batch=pending.splice(0,64),id=sessionId,current=generation,events=[];
    for(const item of batch){const event={...item.payload},last=events.at(-1);
      if(event.kind==="scroll"&&last?.kind==="scroll"){last.deltaX=(last.deltaX||0)+(event.deltaX||0);last.deltaY=(last.deltaY||0)+(event.deltaY||0);}
      else if(event.kind==="text"&&last?.kind==="text"&&(last.text.length+event.text.length)<=4000)last.text+=event.text;
      else events.push(event);
    }
    inputBusy=true;
    try{
      const result=await request("/"+encodeURIComponent(id)+"/command",{command:"input",payload:{kind:"batch",events}});
      if(current!==generation)throw Error("La sesión cambió; se descartó la respuesta anterior.");
      for(const item of batch)item.resolve(result);
    }catch(error){for(const item of batch)item.reject(error);if(current===generation)discardInputs("Entrada detenida: "+error.message);}
    finally{inputBusy=false;if(pending.length&&!disposed)inputTimer=setTimeout(flushInputs,0);}
  }
  async function request(path,body,retry=true) {
    const user=getUser();if(!user)throw new Error("Inicia sesión en CharlyBrown.");
    const response=await fetch(baseUrl+"/api/sally"+path,{
      method:body?"POST":"GET",headers:{Authorization:"Bearer "+await user.getIdToken(),...(body?{"Content-Type":"application/json"}:{})},
      ...(body?{body:JSON.stringify(body)}:{})
    });
    if(response.status===401&&retry){await user.getIdToken(true);return request(path,body,false);}
    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      const message=typeof data.error==="string"?data.error:"No se pudo conectar con el navegador remoto.";
      if(body?.command){
        onEvent({type:"command-error",payload:{command:body.command,status:response.status,message}});
        console.warn(`[Sally] ${body.command} · HTTP ${response.status}: ${message}`);
      }
      throw new Error(message);
    }
    return data;
  }
  async function poll() {
    const current=generation;
    if(disposed||pollingGeneration===current)return;
    pollingGeneration=current;
    try {
      if(sessionId){
        const data=await request("/"+encodeURIComponent(sessionId)+"/events?after="+cursor+(document.hidden?"&heartbeat=1":""));
        if(current!==generation)return;
        pollFailures=0;
        cursor=data.revision||cursor;
        if(!data.connected)onEvent({type:"disconnected"});
        if(data.snapshot)onEvent({type:"snapshot",payload:data.snapshot});
        for(const event of data.events||[])onEvent(event);
      }
    }catch(error){if(current===generation){pollFailures++;onEvent({type:"connection-error",payload:{message:"Se interrumpió la conexión con el navegador. Reintentando… "+error.message}});}}
    finally{if(pollingGeneration===current)pollingGeneration=null;if(!disposed&&current===generation)timer=setTimeout(poll,pollFailures?Math.min(30000,2000*2**Math.min(pollFailures,4)):document.hidden?30000:Date.now()<interactiveUntil?250:1000);}
  }
  const visibilityChanged=()=>{clearTimeout(timer);if(!disposed)void poll();};
  document.addEventListener?.("visibilitychange",visibilityChanged);
  return {
    taskRequest(path,body){if(!sessionId)return Promise.reject(Error("Selecciona una sesión."));return request("/"+encodeURIComponent(sessionId)+"/tasks"+path,body);},
    availability:()=>request("/availability"),
    setSession(id){discardInputs("La sesión cambió.");sessionId=id;cursor=0;pollFailures=0;generation++;clearTimeout(timer);if(!disposed)void poll();},
    invoke(command,payload={}){
      if(!sessionId)return Promise.reject(new Error("Selecciona o crea una sesión primero."));
      const id=sessionId;
      const send=()=>request("/"+encodeURIComponent(id)+"/command",{command,payload});
      if(command!=="input")return send();
      const wasIdle=Date.now()>=interactiveUntil;interactiveUntil=Date.now()+4000;
      if(wasIdle&&!document.hidden){clearTimeout(timer);void poll();}
      if(pending.length>=512)return Promise.reject(new Error("La conexión no procesa la entrada a tiempo. Espera antes de continuar."));
      return new Promise((resolve,reject)=>{pending.push({payload,resolve,reject});if(!inputBusy&&!inputTimer)inputTimer=setTimeout(flushInputs,24);});
    },
    dispose(){disposed=true;generation++;clearTimeout(timer);document.removeEventListener?.("visibilitychange",visibilityChanged);discardInputs("Navegador desconectado.");}
  };
}
