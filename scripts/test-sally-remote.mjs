import assert from "node:assert/strict";
import {createRemoteBrowser} from "../public/js/sally-remote.js";
const originalFetch=globalThis.fetch,originalDocument=globalThis.document;
const originalWindow=globalThis.window;
globalThis.document={hidden:true};globalThis.window={location:{hostname:"127.0.0.1"}};
const calls=[];let user={getIdToken:async()=>"verified-token"},concurrent=0,maxConcurrent=0;
globalThis.fetch=async(url,options)=>{
  calls.push({url,options});concurrent++;maxConcurrent=Math.max(maxConcurrent,concurrent);
  await new Promise(resolve=>setTimeout(resolve,5));concurrent--;
  return new Response(JSON.stringify({automationAvailable:true}),{status:200});
};
const events=[];
const remote=createRemoteBrowser({getUser:()=>user,onEvent:event=>events.push(event),baseUrl:"https://server.test"});
try{
  assert.equal((await remote.availability()).automationAvailable,true);
  await assert.rejects(()=>remote.invoke("start"),/sesión/);
  remote.setSession("destination-project");
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.match(calls[1].url,/events\?after=0&heartbeat=1$/,"Hidden tabs must keep the server session alive without screenshots");
  await Promise.all([remote.invoke("input",{kind:"text",text:"a"}),remote.invoke("input",{kind:"text",text:"b"})]);
  assert.equal(maxConcurrent,1);
  assert.equal(calls[2].url,"https://server.test/api/sally/destination-project/command");
  assert.equal(calls[2].options.headers.Authorization,"Bearer verified-token");
  assert.deepEqual(JSON.parse(calls[2].options.body).payload,{kind:"batch",events:[{kind:"text",text:"ab"}]});
  const before=calls.length;
  await Promise.all(Array.from({length:50},()=>remote.invoke("input",{kind:"scroll",deltaY:10,deltaX:0})));
  assert.equal(calls.length-before,1,"A burst of 50 wheel events uses one authenticated request, not 50 screenshots/round trips");
  assert.deepEqual(JSON.parse(calls.at(-1).options.body).payload.events,[{kind:"scroll",deltaX:0,deltaY:500}]);
  const ordered=[{kind:"text",text:"antes"},{kind:"click",x:12,y:34},{kind:"text",text:"después"},{kind:"key",key:"Control+a"}];
  await Promise.all(ordered.map(event=>remote.invoke("input",event)));
  assert.deepEqual(JSON.parse(calls.at(-1).options.body).payload.events,ordered,"Coalescing must not move text across clicks or shortcuts");
  globalThis.fetch=async()=>new Response(JSON.stringify({error:"El curso requiere iniciar sesión en Moodle."}),{status:400});
  await assert.rejects(()=>remote.invoke("inspect"),/El curso requiere/);
  assert.deepEqual(events.find(event=>event.type==="command-error")?.payload,{command:"inspect",status:400,message:"El curso requiere iniciar sesión en Moodle."});
  const staleEvents=[];let ticketCalls=0;
  globalThis.fetch=async url=>{
    if(String(url).endsWith('/realtime-ticket')){ticketCalls++;return new Response(JSON.stringify({error:'Abre primero el navegador Moodle.'}),{status:409});}
    if(String(url).includes('/events?'))return new Response(JSON.stringify({connected:false,events:[],snapshot:null}),{status:200});
    return new Response(JSON.stringify({}),{status:200});
  };
  const staleRemote=createRemoteBrowser({getUser:()=>user,onEvent:event=>staleEvents.push(event),baseUrl:"https://server.test"});staleRemote.setSession("stale-project");await staleRemote.invoke("start",{url:"https://aprende.asc.education/"});await new Promise(resolve=>setTimeout(resolve,2200));assert.equal(ticketCalls,1,"A missing browser session must not retry realtime tickets forever");assert.equal(staleEvents.find(event=>event.type==="realtime-state")?.payload.state,"waiting");staleRemote.dispose();
  user=null;await assert.rejects(()=>remote.invoke("inspect"),/Inicia sesión/);
  console.log("PASS: remote transport authenticates, routes session commands and preserves typing order.");
 user={getIdToken:async()=>"verified-token"};const localCalls=[];globalThis.fetch=async(url)=>{localCalls.push(url);return new Response(JSON.stringify({automationAvailable:true,agentAvailable:true}),{status:200});};
 const localRemote=createRemoteBrowser({getUser:()=>user,onEvent:()=>{}});await localRemote.availability();assert.equal(localCalls[0],"http://127.0.0.1:8791/api/sally/availability");localRemote.dispose();
}finally{remote.dispose();globalThis.fetch=originalFetch;globalThis.document=originalDocument;globalThis.window=originalWindow;}
