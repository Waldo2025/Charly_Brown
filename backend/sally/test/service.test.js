const {test}=require("node:test");
const assert=require("node:assert/strict");
const {createService}=require("../server.js");
const {createNetworkPolicy,permittedProfile}=require("../policy.js");
test("Network and approval fail closed",async()=>{
  const allowed=createNetworkPolicy(["https://aprende.asc.education"],async()=>[{address:"8.8.8.8"}]);
  assert.equal(await allowed("https://aprende.asc.education/course/view.php?id=49"),true);
  assert.equal(await allowed("http://169.254.169.254/"),false);
  assert.equal(await allowed("https://evil.test/"),false);
  assert.equal(await createNetworkPolicy(["https://aprende.asc.education"],async()=>[{address:"127.0.0.1"}])("https://aprende.asc.education/"),false);
  for(const profile of [{role:"pending"},{approved:true},{role:"editor",status:"blocked"},{role:"editor",approved:false}])assert.equal(permittedProfile(profile,{role:"admin",approved:true}),false);
  assert.equal(permittedProfile({role:"teacher",approved:true},{}),true);
  assert.equal(permittedProfile({role:"teacher"},{}),true);
});
test("HTTP authentication, session isolation, screenshots and constrained commands",async()=>{
  let blocked=false,release;const profilePaths=[],temporaryPaths=[],resizes=[];
  const service=createService({
    verifyToken:async token=>{if(!["alice","bob","pending"].includes(token))throw Error();return {uid:token};},
    getProfile:async uid=>({role:uid==="pending"?"pending":"teacher",approved:true}),
    getSession:async id=>id==="course"?{ownerId:"alice",collaborators:[]}:null,
    networkPolicy:async url=>new URL(url).origin==="https://aprende.asc.education",
    makeController:({sendEvent,getPath})=>{profilePaths.push(getPath("userData"));temporaryPaths.push(getPath("temp"));return {
      start:async()=>{sendEvent({type:"snapshot",payload:{image:"data:image/jpeg;base64,test"}});return {ok:true};},
      resize:async payload=>{resizes.push(payload.viewport);return {viewport:payload.viewport};},
      inspect:async()=>{blocked=true;await new Promise(resolve=>release=resolve);return {sections:[]};},
      control:async()=>({state:"paused"}),approve:async()=>({planHash:"test"}),close:async()=>({})
    }}
  });
  const listener=service.app.listen(0,"127.0.0.1");await new Promise(resolve=>listener.once("listening",resolve));
  const base="http://127.0.0.1:"+listener.address().port;
  const call=(path,token,body)=>fetch(base+"/api/sally"+path,{method:body?"POST":"GET",headers:{...(token?{Authorization:"Bearer "+token}:{}),"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
  const command=(name,payload={})=>call("/course/command","alice",{command:name,payload});
  try{
    const health=await (await fetch(base+"/health")).json();assert.equal(health.agentAvailable,false);
    for(const origin of ["http://127.0.0.1:5010","http://localhost:5010","https://charly-brown.web.app"]){
      const preflight=await fetch(base+"/api/sally/availability",{method:"OPTIONS",headers:{Origin:origin,"Access-Control-Request-Method":"GET","Access-Control-Request-Headers":"authorization"}});
      assert.equal(preflight.status,204);assert.equal(preflight.headers.get("access-control-allow-origin"),origin);
      const unauthenticated=await fetch(base+"/api/sally/availability",{headers:{Origin:origin}});
      assert.equal(unauthenticated.status,401);assert.equal(unauthenticated.headers.get("access-control-allow-origin"),origin);
    }
    const forbidden=await fetch(base+"/api/sally/availability",{method:"OPTIONS",headers:{Origin:"https://untrusted.test"}});
    assert.equal(forbidden.status,403);assert.equal(forbidden.headers.get("access-control-allow-origin"),null);
    assert.equal((await call("/availability")).status,401);
    assert.equal((await call("/availability","pending")).status,403);
    assert.equal((await call("/availability","alice")).status,200);
    assert.equal((await call("/course/events","bob")).status,403);
    assert.equal((await command("evaluate",{script:"process.env"})).status,400);
    assert.equal((await command("start",{url:"https://evil.test"})).status,403);
    assert.equal((await command("start",{url:"https://aprende.asc.education/course/view.php?id=49"})).status,200);
    assert.equal((await command("resize",{viewport:{width:980,height:1120}})).status,200);
    assert.equal((await (await call("/course/events","alice")).json()).snapshot.image,"data:image/jpeg;base64,test");
    const preparedResponse=await call("/course/imports/prepare","alice",{defaultCourse:"CURSO-01",rows:[{username:"ana",firstname:"Ana",lastname:"Paz",email:"ana@example.com",password:"Temporal-123"}]});
    assert.equal(preparedResponse.status,200);
    const prepared=await preparedResponse.json();
    assert.equal(JSON.stringify(prepared).includes("Temporal-123"),false);
    assert.equal((await call(`/course/imports/${prepared.id}/cancel`,"alice",{})).status,200);
    assert.equal((await call(`/course/imports/${prepared.id}/execute`,"alice",{hash:prepared.hash})).status,410);
    const heartbeat=await (await call("/course/events?heartbeat=1","alice")).json();
    assert.equal(heartbeat.connected,true);assert.equal(heartbeat.snapshot,null);assert.deepEqual(heartbeat.events,[]);
    assert.equal((await command("approve",{plan:[{payload:{localPath:"/etc/passwd"}}]})).status,400);
    assert.equal((await command("approve",{plan:[{payload:{assets:[{url:"https://storage.googleapis.com/private"}]}}]})).status,400);
    const running=command("inspect");
    while(!blocked)await new Promise(resolve=>setTimeout(resolve,5));
    const deferred=await (await command("resize",{viewport:{width:720,height:640}})).json();assert.equal(deferred.deferred,true);assert.deepEqual(deferred.viewport,{width:720,height:640});
    assert.equal((await command("start",{url:"https://aprende.asc.education/"})).status,409);
    assert.equal((await command("control",{action:"pause"})).status,200);
    assert.equal((await command("approve",{plan:[]})).status,409);
    release();assert.equal((await running).status,200);for(let i=0;i<20&&!resizes.some(viewport=>viewport.width===720);i++)await new Promise(resolve=>setTimeout(resolve,5));assert.ok(resizes.some(viewport=>viewport.width===720&&viewport.height===640),"The last resize requested while busy is applied after the operation");
    assert.equal((await command("close")).status,200);
    assert.equal((await command("start",{url:"https://aprende.asc.education/course/view.php?id=49"})).status,200);
    assert.equal(profilePaths.length,2);assert.equal(profilePaths[0],profilePaths[1],"Moodle profile survives browser recreation");assert.notEqual(temporaryPaths[0],temporaryPaths[1]);
  }finally{release?.();await service.close();await new Promise(resolve=>listener.close(resolve));}
});
