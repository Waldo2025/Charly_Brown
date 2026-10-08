const test=require("node:test");
const assert=require("node:assert/strict");
const http=require("node:http");
const {WebSocket}=require("ws");
const {createRealtimeBrowser}=require("../browser-realtime.js");

test("Realtime browser streams binary JPEG frames and acknowledges input independently",async()=>{
  let inputs=0,stopped=0;
  const controller={
    async startScreencast(spec){setTimeout(()=>spec.onFrame(Buffer.from([0xff,0xd8,0xff,0xd9]),{url:"https://aprende.asc.education/course/view.php?id=1",title:"Curso",viewport:{width:1440,height:900},capturedAt:Date.now()}),15);return {onFrame:spec.onFrame};},
    async stopScreencast(){stopped++;},async control(){},async realtimeInput(payload){inputs+=payload.events.length;}
  };
  const sessions=new Map([["alice:project",{controller,actor:{uid:"alice"},touched:Date.now()}]]);
  const realtime=createRealtimeBrowser({authenticate:async()=>({uid:"alice"}),getSession:async()=>({ownerId:"alice"}),sessions,allowedOrigins:new Set()});
  const server=http.createServer((_req,res)=>res.writeHead(404).end());realtime.attach(server);server.listen(0,"127.0.0.1");await new Promise(resolve=>server.once("listening",resolve));
  const {ticket}=realtime.issue({uid:"alice",sessionId:"project",key:"alice:project"});const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}/api/sally/realtime?ticket=${ticket}`);
  let frame=false,ack=false;
  try{
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(Error("realtime timeout")),2000);
      ws.on("message",(data,isBinary)=>{
        if(isBinary){frame=true;assert(data.length>4);if(ack){clearTimeout(timeout);resolve();}return;}
        const message=JSON.parse(String(data));
        if(message.type==="ready")ws.send(JSON.stringify({type:"input",sequence:7,events:[{kind:"click",x:10,y:20}]}));
        if(message.type==="input-ack"){ack=true;if(frame){clearTimeout(timeout);resolve();}}
      });
      ws.on("error",reject);
    });
    assert.equal(frame,true);assert.equal(ack,true);assert.equal(inputs,1);
  }finally{ws.close();await new Promise(resolve=>ws.once("close",resolve));await realtime.close();await new Promise(resolve=>server.close(resolve));}
  assert(stopped>=1);
});
