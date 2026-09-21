import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../functions/src/index.js',import.meta.url),'utf8');
const a=src.indexOf('const GEMINI_PROVIDER_TIMEOUT_MS'),b=src.indexOf('registerGeminiJobRoutes',a);
function clockContext(){let now=0,id=0;const timers=new Map();const ctx=vm.createContext({setTimeout:(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id;},clearTimeout:i=>timers.delete(i)});vm.runInContext(src.slice(a,b),ctx);return {ctx,advance:ms=>{now+=ms;for(const [i,t] of timers)if(t.at<=now){timers.delete(i);t.fn();}},timers};}
test('A room completing after 105 seconds succeeds within its 480 second budget without another call',async()=>{
 const {ctx,advance,timers}=clockContext();let resolve,calls=0;const client={models:{generateContent:()=>{calls++;return new Promise(r=>{resolve=r;});}}};
 const result=ctx.generateGeminiContentWithDeadline(client,{},480000);
 advance(120000);resolve({text:'complete'});assert.deepEqual(await result,{text:'complete'});assert.equal(calls,1);assert.equal(timers.size,0);
});
test('Standard and extended deadlines reject at their limits and clear timers',async()=>{
 for(const duration of [105000,480000]){
  const {ctx,advance,timers}=clockContext();let calls=0;
  const result=ctx.generateGeminiContentWithDeadline({models:{generateContent:()=>{calls++;return new Promise(()=>{});}}},{},duration);
  const rejected=assert.rejects(result,e=>e.code==='gemini_upstream_timeout'&&e.status===503);
  advance(duration);await rejected;assert.equal(calls,1);assert.equal(timers.size,0);
 }
});
test('Only explicit fixed-content single-attempt requests get the extended deadline',async()=>{
 const start=src.indexOf('geminiApp.post("/api/gemini/generate"'),end=src.indexOf('\nregisterSupportGraphicUploadRoute(geminiApp)',start);
 for(const [body,expected] of [[{},105000],[{generationProfile:'pigpen-fixed-content'},105000],[{singleAttempt:true},105000],[{singleAttempt:true,generationProfile:'pigpen-fixed-content'},480000]]){
  let handler,received,calls=0;const ctx=vm.createContext({Buffer,GEMINI_PROXY_PAYLOAD_LIMIT_BYTES:100000,GEMINI_PROVIDER_TIMEOUT_MS:105000,PIGPEN_CONTENT_TIMEOUT_MS:480000,geminiApp:{post:(p,h)=>{handler=h;}},asyncRoute:x=>x,resolveAuthContext:async()=>{},createVertexClient:()=>({}),buildVertexGenerateRequest:x=>x,generateGeminiContentWithDeadline:async(c,r,t)=>{calls++;received=t;return {text:'ok'};}});
  vm.runInContext(src.slice(start,end),ctx);const res={status:()=>res,json:x=>x};await handler({body},res);assert.equal(received,expected);assert.equal(calls,1);
 }
});
