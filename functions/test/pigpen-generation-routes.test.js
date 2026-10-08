const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {registerGenerationRoutes}=require('../src/pigpen-generation-routes.js');
test('authenticated REST and MCP share the same coordinator and identity',async()=>{
  const calls=[],app=express(); app.use(express.json());
  const coordinator={
    start:async(uid,input)=>{calls.push({uid,input});return {runId:'run',status:'running'};},
    status:async(uid,id)=>({uid,runId:id,status:'running'}),
    control:async(uid,id,action)=>({uid,runId:id,action}),
    store:{owned:async()=>({data:{}})}
  };
  registerGenerationRoutes(app,{coordinator,authenticate:async req=>{if(req.headers.authorization!=='Bearer test-only')throw Object.assign(Error('Unauthorized'),{status:401});return {uid:'owner'};}});
  app.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.message}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const headers={'Content-Type':'application/json',Authorization:'Bearer test-only',Accept:'application/json, text/event-stream'};
  try{
    assert.equal((await fetch(base+'/api/pigpen/generation/run')).status,401);
    const input={sessionId:'session',topicId:'topic',config:{tema:'Geometría'},idempotencyKey:'test'};
    const response=await fetch(base+'/api/pigpen/generation',{method:'POST',headers,body:JSON.stringify({...input,mode:'objective'})});
    assert.equal(response.status,202);assert.equal((await response.json()).runId,'run');
    async function rpc(method,params){
      const response=await fetch(base+'/api/pigpen/mcp',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
      assert.equal(response.status,200);
      const body=await response.text();return JSON.parse(body.startsWith('event:')?body.split('\n').find(line=>line.startsWith('data:')).slice(5):body);
    }
    const listed=await rpc('tools/list',{});assert.equal(listed.result.tools.length,6);
    const result=await rpc('tools/call',{name:'generate_escape_room',arguments:input});
    assert.equal(JSON.parse(result.result.content[0].text).runId,'run');
    assert.deepEqual(calls.map(c=>[c.uid,c.input.mode]),[['owner','objective'],['owner','full']]);
    const cancelled=await rpc('tools/call',{name:'cancel_generation',arguments:{runId:'run'}});
    assert.equal(JSON.parse(cancelled.result.content[0].text).action,'cancel');
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
