import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import diagnostics from '../functions/src/vertex-diagnostics.js';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/js/PigPenCreator.js',import.meta.url),'utf8');
function fn(name,next){const start=source.indexOf('async function '+name+'(');return source.slice(start,source.indexOf('\n'+next,start));}
const request=fn('requestQualityJson','function extractGeminiText(');
test('Single-attempt generation never retries quota, timeout, schema rejection or malformed JSON',async()=>{
 for(const mode of ['429','timeout','schema','network','json','success']){
  let calls=0,repairs=0;const context=vm.createContext({TEXT_MODEL_DEFAULT:'test',buildGeminiApiUrl:x=>x,
   authFetchJson:async(url,options)=>{calls++;assert.equal(options.body.singleAttempt,true);if(mode==='network')throw new TypeError('Failed to fetch');if(mode!=='success'&&mode!=='json')throw Object.assign(Error(mode),{status:mode==='429'?429:400});return {};},
   extractJsonFromGeminiResponse:()=>{if(mode==='json')throw Error('invalid json');return {mission:{}};},
   repairQualityJsonSyntax:()=>{repairs++;},isGeminiUpstreamTimeout:e=>e.message==='timeout',isGeminiInvalidArgument:()=>true,isGeminiQuotaExhausted:e=>e.status===429});
  vm.runInContext(request,context);
  if(mode==='success')await context.requestQualityJson('',{},0,{singleAttempt:true});else await assert.rejects(context.requestQualityJson('',{},0,{singleAttempt:true}));
  assert.equal(calls,1);assert.equal(repairs,0);
 }
});
test('Compilation finishes and checkpoints each room before the next call, then resumes only pending rooms',async()=>{
 const events=[],storage=new Map();let failRoom=1;
 const base={project_copy:{},final_unlock:{code:'SOL'},rooms:Array.from({length:3},(_,i)=>({title:'Room '+i,narrative_beat:{next_state:'next'},question_plans:[]}))};
 const templates=base.rooms.map((_,i)=>({question_plans:[{plan_id:'p'+i,interaction:'texto'}],reserve_opportunity:{plan_id:'reserve'+i}}));
 const schema={type:'object',properties:{},required:[]};
 const ctx=vm.createContext({PEDAGOGY_VERSION:1,pedagogicalRoomIssues:()=>[],coordinateRiddleIssues:()=>[],expressionRiddleIssues:()=>[],TEXT_MODEL_DEFAULT:'test',OBJECTIVE_ROOM_GENERATION_CONTRACT_VERSION:1,structuredClone,
  localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>{storage.set(k,v);events.push('save:'+JSON.parse(v).nextRoom);},removeItem:k=>storage.delete(k)},
  objectiveCheckpointStore:{load:async k=>JSON.parse(storage.get(k)||'null'),save:async(k,v)=>{storage.set(k,JSON.stringify(v));events.push('save:'+v.nextRoom);},remove:async k=>storage.delete(k)},
  buildObjectiveBlueprintKey:()=> 'same',buildDeterministicQuestionPlanTemplate:()=>templates,setStatus:()=>{},
  requestFixedFoundationContent:async()=>{events.push('global');return structuredClone(base);},
  buildFixedRoomContent:()=>({fields:[],template:{room_context:{narrative_beat:{}}}}),buildFixedRoomTextPrompt:(c,s,f,r)=>r.title,materializeFixedRoomContent:(d,r)=>r,
  buildObjectiveFoundationPrompt:()=> 'foundation',buildObjectiveFoundationResponseSchema:()=>({properties:{rooms:{items:{type:"object",properties:{},required:[]}}}}),
  unwrapObjectiveBriefPayload:x=>x,normalizeObjectiveBrief:structuredClone,normalizeTextList:x=>x,
  normalizeObjectiveUnlockFragment:x=>x,normalizeThematicFinalWord:x=>x,partitionThematicFinalWord:()=>['S','O','L'],objectiveFeedbackContainsNumericUnlock:()=>false,
  buildObjectiveRoomFillResponseSchema:()=>schema,buildRoomBundleResponseSchema:()=>({properties:{mission:schema}}),getRequiredBriefingEvidenceCount:()=>3,
  buildFilteredRoomSchema:x=>x,buildFilteredRoomPrompt:(c,s,f,r)=>r.title,hydrateFilteredRoomResponse:x=>x,
  buildObjectiveRoomFillPrompt:(c,s,f,r)=>r.title,buildRoomBundlePrompt:()=>'',buildFixedObjectiveFillShape:x=>x,
  requestQualityJson:async(prompt,c,t,opts)=>{assert.equal(opts.singleAttempt,true);if(prompt==='foundation'){events.push('global');return structuredClone(base);}const index=Number(prompt.match(/Room (\d)/)[1]);events.push('request:'+index);if(index===failRoom)throw Object.assign(Error('429'),{status:429});return {plans:{['p'+index]:{},['reserve'+index]:{}},mission:{index,preguntas:[{}]}};},
  normalizeCombinedRoomResponse:x=>x,buildCombinedRoomFieldRequirements:()=>"",validateFixedObjectiveFill:()=>[],requestFixedObjectiveRoomFill:async(p,c,t,r)=>r,mergeFilledQuestionPlanWithTemplate:(p,t)=>({...t,...p}),findRepeatedQuestionPlans:()=>[],
  objectiveFeedbackContainsFragment:()=>true,materializeObjectiveBlueprintMechanics:structuredClone,
  requestGeneratedRoomBundle:async(c,i,opts)=>{assert.ok(opts.suppliedResponse);await Promise.resolve();events.push('validate:'+i);return opts.suppliedResponse.mission;},
  setObjectiveGeneratedRoom:(b,i,m)=>{events.push('complete:'+i);b.rooms[i].generated_room={mission:m};},experience:{config:x=>x},rewardEngine:{buildPlan:()=>({})}
 });
 vm.runInContext(fn('compileObjectiveBlueprintFromTemplate','async function generateEnrichedObjectiveBrief('),ctx);
 await assert.rejects(ctx.compileObjectiveBlueprintFromTemplate({misiones:3},{}),/429/);
 assert.deepEqual(events,['global','save:0','request:0','validate:0','complete:0','save:1','request:1']);
 events.length=0;failRoom=-1;const result=await ctx.compileObjectiveBlueprintFromTemplate({misiones:3},{});
 assert.deepEqual(events,['save:1','request:1','validate:1','complete:1','save:2','request:2','validate:2','complete:2','save:3']);
 assert.equal(result.materialization_report.completedRooms,3);assert.equal(result.rooms[0].generated_room.mission.index,0);assert.equal(storage.size,0);
});
test('Server honors singleAttempt without compatibility or image fallback calls',async()=>{
 const server=readFileSync(new URL('../functions/src/index.js',import.meta.url),'utf8');
 const route=server.slice(server.indexOf('geminiApp.post("/api/gemini/generate"'),server.indexOf('\nregisterSupportGraphicUploadRoute(geminiApp)'));
 for(const status of [400,429]){
  let handler,calls=0;const ctx=vm.createContext({vertexFailureDiagnostic:diagnostics.vertexFailureDiagnostic,GEMINI_PROVIDER_TIMEOUT_MS:105000,PIGPEN_CONTENT_TIMEOUT_MS:480000,Buffer,GEMINI_PROXY_PAYLOAD_LIMIT_BYTES:100000,geminiApp:{post:(p,h)=>{handler=h;}},asyncRoute:x=>x,resolveAuthContext:async()=>{},createVertexClient:()=>({}),buildVertexGenerateRequest:x=>x,generateGeminiContentWithDeadline:async()=>{calls++;throw Object.assign(Error('provider'),{status});},isVertexInvalidArgument:()=>status===400});
  vm.runInContext(route,ctx);const req={body:{model:'gemini-3.1-flash-image',payload:{},singleAttempt:true}};const res={set:()=>{},status:()=>res,json:x=>x};
  if(status===400)await assert.rejects(handler(req,res));else assert.equal((await handler(req,res)).error,'gemini_quota_exhausted');assert.equal(calls,1);
 }
});


test('Combined room sends only contents on its first and only provider request',async()=>{
 let calls=0;const context=vm.createContext({TEXT_MODEL_DEFAULT:'test',buildGeminiApiUrl:x=>x,
  authFetchJson:async(url,options)=>{calls++;assert.deepEqual(Object.keys(options.body.payload),['contents']);assert.equal(options.body.singleAttempt,true);assert.match(options.body.payload.contents[0].parts[0].text,/JSON válido/);assert.match(options.body.payload.contents[0].parts[0].text,/ROOM_CONTENT/);return {};},
  extractJsonFromGeminiResponse:()=>({plans:{},mission:{}})});
 vm.runInContext(request,context);await context.requestQualityJson('ROOM_CONTENT',{},0.32,{responseJsonSchema:{type:'object'},singleAttempt:true,minimalPayload:true});assert.equal(calls,1);
 const start=source.indexOf('function validateFixedObjectiveFill('),end=source.indexOf('\nfunction objectivePlanContractIssues(',start);
 vm.runInContext(source.slice(start,end),context);
 const schema={type:'object',properties:{mission:{type:'object',properties:{preguntas:{type:'array',minItems:4,items:{type:'string'}}},required:['preguntas']}},required:['mission']};
 assert.ok(context.validateFixedObjectiveFill({mission:{preguntas:[]}},schema).length);
 assert.equal(context.validateFixedObjectiveFill({mission:{preguntas:['a','b','c','d']}},schema).length,0);
});


test('Combined response normalizes transport without inventing reasoning or accepting contradictory aliases',()=>{
 const start=source.indexOf('function normalizeCombinedRoomResponse('),end=source.indexOf('function objectivePlanContractIssues(',start);
 const ctx=vm.createContext({structuredClone});vm.runInContext(source.slice(start,end),ctx);
 const planSchema={type:'object',properties:{reasoning_steps:{type:'array',minItems:3,items:{type:'string'}},mechanic_contract:{type:'object',properties:{kind:{type:'string'},claimed_value:{type:'string'}},required:['kind','claimed_value']}},required:['reasoning_steps','mechanic_contract']};
 const schema={type:'object',properties:{plans:{type:'object',properties:{r1_p4:planSchema},required:['r1_p4']},mission:{type:'object',properties:{contexto:{type:'string'}},required:['contexto']}},required:['plans','mission']};
 const raw={plans:{r1_p4:{reasoning_steps:['1. Interpret evidence.\n2. Compare conditions.\n3. Deduce result.'],mechanic_contract:{kind:'none',claimed_value:null}}},mission:{context:'Briefing'}};
 const fixed=ctx.normalizeCombinedRoomResponse(raw,schema);assert.equal(ctx.validateFixedObjectiveFill(fixed,schema).length,0);assert.equal(raw.mission.context,'Briefing');assert.equal(raw.plans.r1_p4.mechanic_contract.claimed_value,null);
 raw.plans.r1_p4.reasoning_steps=['One step.'];const incomplete=ctx.normalizeCombinedRoomResponse(raw,schema);assert.match(ctx.validateFixedObjectiveFill(incomplete,schema).join(' '),/se recibieron 1/);
 raw.plans.r1_p4.mechanic_contract={kind:'cipher_assertion',claimed_value:false};assert.equal(ctx.normalizeCombinedRoomResponse(raw,schema).plans.r1_p4.mechanic_contract.claimed_value,'false');
 raw.mission.contexto='Different';assert.ok(ctx.validateFixedObjectiveFill(ctx.normalizeCombinedRoomResponse(raw,schema),schema).length);
 assert.match(ctx.buildCombinedRoomFieldRequirements(schema),/al menos 3 pasos/);
});

test('Fixed text falls back once on 429, preserves payload, and reuses successful model for next room',async()=>{
 const calls=[];let active=0,maxActive=0;
 const c=vm.createContext({TEXT_MODEL_DEFAULT:'gemini-2.5-flash',setStatus:()=>{},buildGeminiApiUrl:x=>x,isGeminiQuotaExhausted:e=>e.status===429,isGeminiUpstreamTimeout:()=>false,
  authFetchJson:async(u,o)=>{active++;maxActive=Math.max(maxActive,active);calls.push(o.body);await Promise.resolve();active--;if(calls.length===1)throw Object.assign(Error('quota'),{status:429});return {};},extractGeminiText:()=> 'filled'});
 vm.runInContext(request,c);const data={modelo:'gemini-2.5-flash'};
 assert.equal(await c.requestQualityJson('same fields',data,0.3,{singleAttempt:true,textOnly:true}),'filled');
 assert.deepEqual(calls.map(x=>x.model),['gemini-2.5-flash','gemini-3.5-flash-lite']);
 assert.deepEqual(calls[0].payload,calls[1].payload);assert.equal(maxActive,1);
 await c.requestQualityJson('next room',data,0.3,{singleAttempt:true,textOnly:true});
 assert.equal(calls[2].model,'gemini-3.5-flash-lite');assert.ok(calls.every(x=>x.singleAttempt));
});
test('Fixed text stops after two quota failures; other errors never switch models',async()=>{
 for(const status of [429,400,403,503]){
  const models=[];const c=vm.createContext({TEXT_MODEL_DEFAULT:'gemini-2.5-flash-lite',setStatus:()=>{},buildGeminiApiUrl:x=>x,isGeminiQuotaExhausted:e=>e.status===429,isGeminiUpstreamTimeout:()=>false,
   authFetchJson:async(u,o)=>{models.push(o.body.model);throw Object.assign(Error('provider'),{status});}});
  vm.runInContext(request,c);
  await assert.rejects(c.requestQualityJson('text',{},0.3,{singleAttempt:true,textOnly:true}),e=>{assert.equal(e.status,status);if(status===429){assert.equal(e.modelFallbackUsed,true);assert.match(e.message,/dos intentos/);}return true;});
  assert.deepEqual(models,status===429?['gemini-2.5-flash-lite','gemini-3.6-flash']:['gemini-2.5-flash-lite']);
 }
});

test('A response missing 98 fields is rejected before success; complete alternate response is accepted',async()=>{
 const {contentDocument,CONTENT_SLOT,fillContentDocument}=await import('../public/js/pigpen-fixed-content.mjs');
 const doc=contentDocument({texts:Array(100).fill(CONTENT_SLOT)});
 const blocks=fields=>fields.map(f=>`<<<FIELD ${f.id}>>>\nText ${f.id}\n<<<END>>>`).join('\n');
 const calls=[];const data={modelo:'gemini-3.5-flash-lite'};
 const c=vm.createContext({TEXT_MODEL_DEFAULT:data.modelo,fillContentDocument,setStatus:()=>{},buildGeminiApiUrl:x=>x,isGeminiQuotaExhausted:e=>e.status===429,isGeminiUpstreamTimeout:()=>false,
  authFetchJson:async(u,o)=>{calls.push(o.body);return {text:blocks(calls.length===1?doc.fields.slice(0,2):doc.fields)};},extractGeminiText:r=>r.text});
 vm.runInContext(request,c);
 const result=await c.requestQualityJson('all fields',data,0.3,{singleAttempt:true,textOnly:true,expectedContent:doc});
 assert.deepEqual(calls.map(x=>x.model),['gemini-3.5-flash-lite','gemini-3.6-flash']);
 assert.equal(fillContentDocument(doc,result).texts.length,100);
 assert.equal(data._quotaFallbackModel,'gemini-3.6-flash');
 assert.equal(doc.template.texts[0],'[[f00001]]');
});
test('Quota followed by incomplete content stops at two calls and never records a successful fallback',async()=>{
 const {contentDocument,CONTENT_SLOT,fillContentDocument}=await import('../public/js/pigpen-fixed-content.mjs');
 const doc=contentDocument({a:CONTENT_SLOT,b:CONTENT_SLOT});
 for(const first of ['quota','incomplete','max_tokens']){
  let calls=0;const data={modelo:'gemini-3.6-flash'};
  const c=vm.createContext({TEXT_MODEL_DEFAULT:data.modelo,fillContentDocument,setStatus:()=>{},buildGeminiApiUrl:x=>x,isGeminiQuotaExhausted:e=>e.status===429,isGeminiUpstreamTimeout:()=>false,
   authFetchJson:async()=>{calls++;if(calls===1&&first==='quota')throw Object.assign(Error('quota'),{status:429});return {candidates:[{finishReason:first==='max_tokens'?'MAX_TOKENS':'STOP'}]};},extractGeminiText:()=> '<<<FIELD f00001>>>\nOnly one\n<<<END>>>'});
  vm.runInContext(request,c);
  await assert.rejects(c.requestQualityJson('fields',data,0.3,{singleAttempt:true,textOnly:true,expectedContent:doc}),/dos intentos/);
  assert.equal(calls,2);assert.equal(data._quotaFallbackModel,undefined);
 }
});
