// Firebase-authenticated control plane plus a one-use ticket for the binary
// browser stream. Moodle cookies never leave the remote Playwright context.
function defaultServiceUrl(){
  const host=String(window.location.hostname||"").toLowerCase();
  return host==="127.0.0.1"||host==="localhost"
    ? "http://127.0.0.1:8791"
    : "https://sally-browser-mm2qel4fka-uc.a.run.app";
}
export function createRemoteBrowser({getUser,onEvent,baseUrl=defaultServiceUrl()}) {
  let sessionId="",cursor=0,timer,disposed=false,generation=0,pollFailures=0,pollingGeneration=null;
  let pending=[],inputTimer,inputBusy=false,interactiveUntil=0,inputSequence=0;
  let inactive=false;
  let socket=null,reconnectTimer=null,reconnectFailures=0,realtimeReady=false,realtimeConnecting=false,frameMeta={},frameUrl="";
  const acknowledgements=new Map();

  function discardInputs(message){clearTimeout(inputTimer);inputTimer=null;for(const item of pending)item.reject(new Error(message));pending=[];for(const entry of acknowledgements.values())entry.reject(new Error(message));acknowledgements.clear();}
  async function request(path,body,retry=true) {
    const user=getUser();if(!user)throw new Error("Inicia sesión en CharlyBrown.");
    const response=await fetch(baseUrl+"/api/sally"+path,{method:body?"POST":"GET",headers:{Authorization:"Bearer "+await user.getIdToken(),...(body?{"Content-Type":"application/json"}:{})},signal:AbortSignal.timeout(12000),...(body?{body:JSON.stringify(body)}:{})});
    if(response.status===401&&retry){await user.getIdToken(true);return request(path,body,false);}
    const data=await response.json().catch(()=>({}));
    if(!response.ok){const message=typeof data.error==="string"?data.error:"No se pudo conectar con el navegador remoto.";if(body?.command){onEvent({type:"command-error",payload:{command:body.command,status:response.status,message}});console.warn(`[Sally] ${body.command} · HTTP ${response.status}: ${message}`);}const error=new Error(message);error.status=response.status;throw error;}
    return data;
  }
  function socketUrl(ticket){const url=new URL(baseUrl);url.protocol=url.protocol==="https:"?"wss:":"ws:";url.pathname="/api/sally/realtime";url.search="?ticket="+encodeURIComponent(ticket);return url.href;}
  function closeSocket(){clearTimeout(reconnectTimer);reconnectTimer=null;realtimeReady=false;if(socket){socket.onclose=null;socket.close();socket=null;}}
  async function connectRealtime(current=generation){
    if(disposed||inactive||!sessionId||current!==generation||realtimeConnecting)return;realtimeConnecting=true;closeSocket();
    try{
      const {ticket}=await request("/"+encodeURIComponent(sessionId)+"/realtime-ticket",{});if(current!==generation)return;
      const ws=socket=new WebSocket(socketUrl(ticket));ws.binaryType="arraybuffer";
      ws.onopen=()=>{reconnectFailures=0;ws.send(JSON.stringify({type:"visibility",hidden:document.hidden}));};
      ws.onmessage=event=>{
        if(current!==generation)return;
        if(typeof event.data==="string"){
          let message;try{message=JSON.parse(event.data);}catch{return;}
          if(message.type==="ready"){realtimeReady=true;onEvent({type:"realtime-state",payload:{state:"connected",fps:message.fps}});}
          else if(message.type==="frame-meta")frameMeta={...frameMeta,...message};
          else if(message.type==="input-ack"||message.type==="input-error"){
            const entry=acknowledgements.get(message.sequence);if(!entry)return;acknowledgements.delete(message.sequence);
            if(message.type==="input-error")entry.reject(new Error(message.message));else{entry.resolve({accepted:true});onEvent({type:"latency",payload:{milliseconds:Date.now()-entry.sentAt}});}
          }else if(message.type==="error")onEvent({type:"connection-error",payload:{message:message.message}});
          return;
        }
        const bytes=new Uint8Array(event.data);if(bytes.byteLength<=4)return;const sequence=new DataView(bytes.buffer,bytes.byteOffset,4).getUint32(0);const next=URL.createObjectURL(new Blob([bytes.slice(4)],{type:"image/jpeg"}));const previous=frameUrl;frameUrl=next;if(previous)setTimeout(()=>URL.revokeObjectURL(previous),1000);
        onEvent({type:"snapshot",payload:{image:next,sequence,capturedAt:Date.now(),url:frameMeta.url,title:frameMeta.title,viewport:frameMeta.viewport||{width:1440,height:900},reason:"realtime"}});
      };
      ws.onerror=()=>{};
      ws.onclose=event=>{if(event.code===4408){inactive=true;clearTimeout(timer);onEvent({type:"disconnected"});}
        if(socket===ws)socket=null;realtimeReady=false;onEvent({type:"realtime-state",payload:{state:"reconnecting"}});if(!disposed&&!inactive&&current===generation){reconnectFailures++;reconnectTimer=setTimeout(()=>void connectRealtime(current),Math.min(10000,500*2**Math.min(reconnectFailures,4)));}};
    }catch(error){if(current!==generation)return;if(error.status===409){reconnectFailures=0;onEvent({type:"realtime-state",payload:{state:"waiting",message:error.message}});return;}onEvent({type:"realtime-state",payload:{state:"fallback",message:error.message}});reconnectFailures++;reconnectTimer=setTimeout(()=>void connectRealtime(current),Math.min(15000,1000*2**Math.min(reconnectFailures,4)));}
    finally{realtimeConnecting=false;}
  }
  async function flushInputs(){
    inputTimer=null;if(!pending.length||disposed)return;const batch=pending.splice(0,64),events=[];
    for(const item of batch){const event={...item.payload},last=events.at(-1);if(event.kind==="scroll"&&last?.kind==="scroll"){last.deltaX=(last.deltaX||0)+(event.deltaX||0);last.deltaY=(last.deltaY||0)+(event.deltaY||0);}else if(event.kind==="text"&&last?.kind==="text"&&(last.text.length+event.text.length)<=4000)last.text+=event.text;else events.push(event);}
    if(realtimeReady&&socket?.readyState===WebSocket.OPEN){
      const sequence=++inputSequence,sentAt=Date.now();acknowledgements.set(sequence,{sentAt,resolve:value=>batch.forEach(item=>item.resolve(value)),reject:error=>batch.forEach(item=>item.reject(error))});socket.send(JSON.stringify({type:"input",sequence,events}));
      setTimeout(()=>{const entry=acknowledgements.get(sequence);if(entry){acknowledgements.delete(sequence);entry.reject(new Error("El navegador no confirmó la entrada a tiempo."));}},5000);
    }else{inputBusy=true;try{const result=await request("/"+encodeURIComponent(sessionId)+"/command",{command:"input",payload:{kind:"batch",events}});batch.forEach(item=>item.resolve(result));}catch(error){batch.forEach(item=>item.reject(error));}finally{inputBusy=false;}}
    if(pending.length&&!disposed)inputTimer=setTimeout(flushInputs,0);
  }
  async function poll(){
    const current=generation;if(disposed||inactive||pollingGeneration===current)return;pollingGeneration=current;
      try{if(sessionId){const heartbeat=document.hidden||realtimeReady;const data=await request("/"+encodeURIComponent(sessionId)+"/events?after="+cursor+(heartbeat?"&heartbeat=1":""));if(current!==generation)return;pollFailures=0;cursor=data.revision||cursor;if(!data.connected){inactive=true;closeSocket();onEvent({type:"disconnected"});}else if(!realtimeReady&&!socket)void connectRealtime(current);if(data.snapshot)onEvent({type:"snapshot",payload:data.snapshot});for(const event of data.events||[])onEvent(event);}}
    catch(error){if(current===generation){pollFailures++;onEvent({type:"connection-error",payload:{message:"Se interrumpió la conexión de control. Reintentando… "+error.message}});}}
    finally{if(pollingGeneration===current)pollingGeneration=null;if(!disposed&&!inactive&&current===generation)timer=setTimeout(poll,pollFailures?Math.min(30000,2000*2**Math.min(pollFailures,4)):realtimeReady?5000:document.hidden?30000:Date.now()<interactiveUntil?250:1000);}
  }
  const visibilityChanged=()=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:"visibility",hidden:document.hidden}));clearTimeout(timer);if(!disposed)void poll();};
  document.addEventListener?.("visibilitychange",visibilityChanged);
  return {
    async taskRequest(path,body){if(!sessionId)throw Error("Selecciona una sesión.");const result=await request("/"+encodeURIComponent(sessionId)+"/tasks"+path,body);if(body){inactive=false;clearTimeout(timer);void poll();}return result;},
    importRequest(path,body){if(!sessionId)return Promise.reject(Error("Selecciona una sesión."));return request("/"+encodeURIComponent(sessionId)+"/imports"+path,body);},
    availability:()=>request("/availability"),
    setSession(id){inactive=false;discardInputs("La sesión cambió.");closeSocket();sessionId=id;cursor=0;pollFailures=0;generation++;clearTimeout(timer);if(!disposed)void poll();},
    async invoke(command,payload={}){
      if(!sessionId)throw new Error("Selecciona o crea una sesión primero.");
      if(command!=="input"){const result=await request("/"+encodeURIComponent(sessionId)+"/command",{command,payload});if(command==="start"){inactive=false;void connectRealtime(generation);clearTimeout(timer);void poll();}if(command==="close"){inactive=true;clearTimeout(timer);closeSocket();}return result;}
      interactiveUntil=Date.now()+4000;if(pending.length>=512)throw new Error("La conexión no procesa la entrada a tiempo. Espera antes de continuar.");
      return new Promise((resolve,reject)=>{pending.push({payload,resolve,reject});if(!inputBusy&&!inputTimer)inputTimer=setTimeout(flushInputs,16);});
    },
    dispose(){disposed=true;generation++;clearTimeout(timer);closeSocket();document.removeEventListener?.("visibilitychange",visibilityChanged);discardInputs("Navegador desconectado.");if(frameUrl)URL.revokeObjectURL(frameUrl);}
  };
}
