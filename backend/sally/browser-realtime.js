const {randomBytes}=require("node:crypto");
const {WebSocketServer,WebSocket}=require("ws");

function createRealtimeBrowser({authenticate,getSession,sessions,pauseSession=()=>{},allowedOrigins=new Set(),ticketTtlMs=30000}){
  const tickets=new Map();
  const wss=new WebSocketServer({noServer:true,perMessageDeflate:false,maxPayload:64*1024});
  const clean=setInterval(()=>{const now=Date.now();for(const [token,ticket] of tickets)if(ticket.expiresAt<=now)tickets.delete(token);},15000);clean.unref();

  function issue({uid,sessionId,key}){
    const token=randomBytes(32).toString("base64url");tickets.set(token,{uid,sessionId,key,expiresAt:Date.now()+ticketTtlMs});return {ticket:token,expiresInMs:ticketTtlMs};
  }
  function consume(token){const ticket=tickets.get(token);tickets.delete(token);if(!ticket||ticket.expiresAt<Date.now())return null;return ticket;}
  function sendJson(socket,value){if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify(value));}
  async function handle(socket,ticket){
    const item=sessions.get(ticket.key);
    if(!item?.controller){socket.close(4404,"Browser session not found");return;}
    socket.sessionKey=ticket.key;item.touched=Date.now();let lastSentAt=0,frameSequence=0,active=true;
    const streamSpec={fps:10,quality:74,onFrame(frame,meta){
      if(!active||socket.readyState!==WebSocket.OPEN||Date.now()-lastSentAt<85||socket.bufferedAmount>1024*1024)return;
      lastSentAt=Date.now();const sequence=++frameSequence,header=Buffer.allocUnsafe(4);header.writeUInt32BE(sequence);socket.send(Buffer.concat([header,frame]),{binary:true});
      if(sequence===1||sequence%10===0)sendJson(socket,{type:"frame-meta",sequence,url:meta.url,title:meta.title,viewport:meta.viewport,capturedAt:meta.capturedAt});
    }};
    const stream=await item.controller.startScreencast(streamSpec);
    sendJson(socket,{type:"ready",viewport:stream.viewport,fps:10});
    socket.on("message",async raw=>{
      let message;try{message=JSON.parse(String(raw));}catch{return sendJson(socket,{type:"error",message:"Mensaje en tiempo real inválido."});}
      if(message.type==="visibility"){if(message.hidden)await item.controller.stopScreencast();else await item.controller.startScreencast(streamSpec);return;}
      if(message.type!=="input")return;
      const sequence=Number(message.sequence)||0;
      try{pauseSession(ticket.sessionId);await item.controller.control({action:"cancel"},item.actor).catch(()=>{});await item.controller.realtimeInput({kind:"batch",events:message.events},item.actor);item.touched=Date.now();sendJson(socket,{type:"input-ack",sequence,at:Date.now()});}
      catch(error){sendJson(socket,{type:"input-error",sequence,message:String(error.message||"No se pudo aplicar la entrada.").slice(0,350)});}
    });
    socket.once("close",()=>{active=false;void item.controller.stopScreencast({resumeSnapshots:sessions.has(ticket.key)}).catch(()=>{});});
  }
  wss.on("connection",(socket,_request,ticket)=>{void handle(socket,ticket).catch(()=>socket.close(1011,"Realtime browser failed"));});

  function attach(httpServer){
    httpServer.on("upgrade",async(request,socket,head)=>{
      try{
        const url=new URL(request.url,"http://localhost");if(url.pathname!=="/api/sally/realtime")return;
        const origin=String(request.headers.origin||"");if(origin&&!allowedOrigins.has(origin))throw Error("Origin denied");
        const ticket=consume(url.searchParams.get("ticket"));if(!ticket)throw Error("Ticket expired");
        const actor=await authenticate(url.searchParams.get("auth")||"").catch(()=>null);
        if(actor&&actor.uid!==ticket.uid)throw Error("Identity mismatch");
        const session=await getSession(ticket.sessionId);const owner=String(session?.ownerId||session?.userId||session?.uid||"");
        if(!session||owner&&owner!==ticket.uid&&!session.collaborators?.includes(ticket.uid))throw Error("Session denied");
        wss.handleUpgrade(request,socket,head,ws=>wss.emit("connection",ws,request,ticket));
      }catch{socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");socket.destroy();}
    });
  }
  return {issue,attach,closeSession:key=>{for(const socket of wss.clients)if(socket.sessionKey===key)socket.close(4408,"Browser idle or closed");},close:async()=>{clearInterval(clean);for(const socket of wss.clients)socket.close(1001,"Server closing");await new Promise(resolve=>wss.close(resolve));}};
}

module.exports={createRealtimeBrowser};
