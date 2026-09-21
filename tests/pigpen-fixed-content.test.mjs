import * as pedagogy from '../public/js/pigpen-pedagogy.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
import * as fixed from '../public/js/pigpen-fixed-content.mjs';
import {experience} from '../public/js/escape-room-experience.mjs';
import {experienceContractSchema} from '../public/js/escape-room-experience-authoring.mjs';
import {CLOSED_ANSWER_SUBTYPES} from '../public/js/escape-room-question-policy.mjs';
const source=readFileSync(new URL('../public/js/PigPenCreator.js',import.meta.url),'utf8');
const ctx=vm.createContext({...pedagogy,...fixed,experience,experienceContractSchema,CLOSED_ANSWER_SUBTYPES,structuredClone});
for(const [a,b] of [['function buildQuestionsResponseSchema(','function buildQuestionOutputShape('],['function buildObjectiveRoomFillResponseSchema(','function objectivePlanContractIssues(']])vm.runInContext(source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a))),ctx);
const response=(doc)=>doc.fields.map(f=>`<<<FIELD ${f.id}>>>\nTexto ${f.id}: "comillas", backslash \\ y\nsalto real.\n<<<END>>>`).join('\n');
function setup(types){const template={question_plans:types.map((interaction,i)=>({plan_id:'p'+i,interaction,difficulty:'desafiante'}))};const schema={type:'object',properties:{plans:ctx.buildObjectiveRoomFillResponseSchema(template),...ctx.buildRoomBundleResponseSchema(types.length,3).properties},required:['plans','mission']};return {template,schema};}
for(const {id} of experience.definitions)test(id+': complete local topology precedes generation; AI only changes text',()=>{
 const {template,schema}=setup([id]);const doc=ctx.buildFixedRoomContent(schema,template);
 const before=structuredClone(doc.template.plans.p0.interaction_data);
 assert.ok(doc.fields.length);assert.ok(doc.fields.every(f=>!['id','allowed','solutions','rules','connections','value','x','y','goal','maximum','minimum'].some(k=>f.path.includes(k))));
 const result=ctx.materializeFixedRoomContent(doc,response(doc),schema,template);
 assert.equal(ctx.validateFixedObjectiveFill(result,schema).length,0);
 const after=result.plans.p0.interaction_data;
 for(const key of ['solutions','rules','connections','minimum','maximum','goal'])assert.deepEqual(after[key],before[key]);
 assert.deepEqual(experience.authoringIssues(id,after),[]);
 assert.equal(experience.evaluate(id,after,experience.solutionState(after.solutions[0])),'correct');
 assert.equal(result.mission.preguntas[0]._plan_id,'p0');
});
test('Missing, duplicate, unknown, truncated and injected structures never partially mutate a template',()=>{
 const doc=fixed.contentDocument({message:fixed.CONTENT_SLOT,solution:{id:'a'},number:3});const before=JSON.stringify(doc);
 const good=response(doc);
 for(const bad of ['',good+good,good.replace('f00001','f90000'),good.replace('<<<END>>>',''),'{"solution":"b"}',good+'{}'])assert.throws(()=>fixed.fillContentDocument(doc,bad));
 assert.equal(JSON.stringify(doc),before);
 const result=fixed.fillContentDocument(doc,good);assert.equal(result.solution.id,'a');assert.equal(result.number,3);assert.match(result.message,/"comillas"/);
});
test('Classic slots retain fixed options, mappings and question IDs',()=>{
 for(const type of experience.classics.map(x=>x[0])){
  const {template,schema}=setup([type]);const doc=ctx.buildFixedRoomContent(schema,template);
  const result=ctx.materializeFixedRoomContent(doc,response(doc),schema,template);
  assert.equal(ctx.validateFixedObjectiveFill(result,schema).length,0,type);
  if(['opcion_multiple','multimedia'].includes(type)){assert.equal(result.mission.preguntas[0].opciones.length,4);assert.equal(result.mission.preguntas[0].respuesta_correcta,result.mission.preguntas[0].opciones[0]);}
 }
});
test('Text-only request does not invoke JSON parser or add another provider call',async()=>{
 let calls=0;const c=vm.createContext({TEXT_MODEL_DEFAULT:'test',buildGeminiApiUrl:x=>x,
 authFetchJson:async(u,o)=>{calls++;assert.equal(o.body.singleAttempt,true);assert.equal(o.body.generationProfile,'pigpen-fixed-content');assert.deepEqual(Object.keys(o.body.payload),['contents']);assert.doesNotMatch(o.body.payload.contents[0].parts[0].text,/Responde únicamente con JSON válido/);return {candidates:[{content:{parts:[{text:'<<<FIELD f00001>>>\n"Texto"\n<<<END>>>'}]}}]};},
 extractGeminiText:r=>r.candidates[0].content.parts[0].text,extractJsonFromGeminiResponse:()=>{throw Error('JSON parser must not run');}});
 const start=source.indexOf('async function requestQualityJson(');vm.runInContext(source.slice(start,source.indexOf('function extractGeminiText(',start)),c);
 assert.match(await c.requestQualityJson('fields',{},0.3,{singleAttempt:true,textOnly:true}),/"Texto"/);assert.equal(calls,1);
});
test('Copies of public content and private evidence are derived locally, not requested twice',()=>{
 const {template,schema}=setup(['seleccion_multiple']);const doc=ctx.buildFixedRoomContent(schema,template);
 for(const field of ['evidence','instruction_outline','hint_strategy','feedback_strategy'])assert.ok(!doc.fields.some(f=>f.path.at(-1)===field));
 assert.ok(!doc.fields.some(f=>f.path.join('.')==='mission.preguntas.p0.reto'));
 const result=ctx.materializeFixedRoomContent(doc,response(doc),schema,template);
 assert.ok(result.mission.preguntas[0].reto.includes(result.plans.p0.application));
 for(const fact of result.plans.p0.case_data)assert.ok(result.mission.preguntas[0].reto.includes(fact));
 assert.equal(result.plans.p0.evidence,result.plans.p0.reasoning_evidence);
});
test('Fixed foundation uses the same text channel and retains requested room count',async()=>{
 const a=source.indexOf('function buildObjectiveFoundationResponseSchema('),b=source.indexOf('function buildObjectiveRoomFillPrompt(',a);
 vm.runInContext(source.slice(a,b),ctx);
 const start=source.indexOf('async function requestFixedFoundationContent(');vm.runInContext(source.slice(start,source.indexOf('async function compileObjectiveBlueprintFromTemplate(',start)),ctx);
 let calls=0;Object.assign(ctx,{buildObjectiveFoundationPrompt:()=>'<OUTPUT_FORMAT>{"old":"shape"}</OUTPUT_FORMAT>Devuelve únicamente JSON.',requestQualityJson:async(prompt,c,t,opts)=>{
  calls++;assert.equal(opts.textOnly,true);assert.equal(opts.singleAttempt,true);assert.doesNotMatch(prompt,/OUTPUT_FORMAT|Devuelve únicamente JSON/);
  const fields=[...prompt.matchAll(/^(f\d+) = (.+)$/gm)];
  assert.ok(fields.every(m=>!m[2].startsWith('rooms.')),'global request must not ask for any room fields');
  return fields.map(m=>`<<<FIELD ${m[1]}>>>\nContenido para ${m[2]}\n<<<END>>>`).join('\n');
 }});
 const result=await ctx.requestFixedFoundationContent({},null,2);
 assert.equal(calls,1);assert.equal(result.rooms.length,2);assert.equal(result.rooms[0].room_number,1);assert.equal(result.rooms[1].room_number,2);
});
test('One to eight rooms do not enlarge the global text request or create phantom fields',async()=>{
 let calls=0;const fieldCounts=[];
 ctx.requestQualityJson=async(prompt,c,t,opts)=>{
  calls++;assert.equal(opts.singleAttempt,true);
  const fields=[...prompt.matchAll(/^(f\d+) = (.+)$/gm)];fieldCounts.push(fields.length);
  assert.ok(fields.every(m=>!m[2].startsWith('rooms.')));
  return fields.map(m=>`<<<FIELD ${m[1]}>>>\nGlobal content for ${m[2]}\n<<<END>>>`).join('\n');
 };
 for(let count=1;count<=8;count++){
  const result=await ctx.requestFixedFoundationContent({},null,count);
  assert.equal(result.rooms.length,count);
  assert.equal(result.rooms[count-1].room_number,count);
  assert.equal(result.rooms[0].learning_focus,'','room text is reserved locally until its own call');
 }
 assert.equal(calls,8);assert.equal(new Set(fieldCounts).size,1);
});
test('Current room context and question text are filled together in the same local document',()=>{
 const {template,schema}=setup(['seleccion_multiple','completar_patron']);
 schema.properties.room_context=structuredClone(ctx.buildObjectiveFoundationResponseSchema(4).properties.rooms.items);
 schema.properties.room_context.properties.room_number={type:'integer',enum:[3]};schema.required.push('room_context');
 const doc=ctx.buildFixedRoomContent(schema,template);
 assert.equal(doc.template.room_context.room_number,3);
 assert.ok(doc.fields.some(f=>f.path.join('.')==='room_context.learning_focus'));
 assert.ok(doc.fields.some(f=>f.path.join('.')==='plans.p0.knowledge'));
 assert.ok(doc.fields.every(f=>f.path[0]!=='rooms'));
 const filled=ctx.materializeFixedRoomContent(doc,response(doc),schema,template);
 assert.equal(filled.room_context.room_number,3);
 assert.ok(filled.room_context.learning_focus);
 assert.equal(filled.mission.preguntas.length,2);
 assert.equal(ctx.validateFixedObjectiveFill(filled,schema).length,0);
});

test('Foundation 429 reports the initial stage without claiming completed rooms or retrying',async()=>{
 const previous=ctx.requestQualityJson;
 let calls=0;
 const failure=Object.assign(new Error('provider failure'),{status:429,detail:{requestId:'original-request'}});
 ctx.isGeminiQuotaExhausted=e=>e.status===429;
 ctx.requestQualityJson=async()=>{calls++;throw failure;};
 try {
  await assert.rejects(ctx.requestFixedFoundationContent({},null,2),error=>{
   assert.equal(error,failure);
   assert.match(error.message,/solicitud inicial/);
   assert.match(error.message,/no llegó a generar salas/);
   assert.doesNotMatch(error.message,/salas terminadas se conservaron/i);
   assert.equal(error.detail.requestId,'original-request');
   return true;
  });
  assert.equal(calls,1);
 } finally {ctx.requestQualityJson=previous;}
});
