import * as pedagogy from '../public/js/pigpen-pedagogy.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {experience} from '../public/js/escape-room-experience.mjs';
import {experienceContractSchema,experienceAuthoringInstruction} from '../public/js/escape-room-experience-authoring.mjs';
import {CLOSED_ANSWER_SUBTYPES} from '../public/js/escape-room-question-policy.mjs';
import {contractFor} from './fixtures/pigpen-experience.mjs';
const src=readFileSync(new URL('../public/js/PigPenCreator.js',import.meta.url),'utf8');
const ctx=vm.createContext({...pedagogy,experience,experienceContractSchema,CLOSED_ANSWER_SUBTYPES,structuredClone});
for(const [start,end] of [['function buildQuestionsResponseSchema(', 'function buildQuestionOutputShape('],['function buildObjectiveRoomFillResponseSchema(', 'function objectivePlanContractIssues(']])vm.runInContext(src.slice(src.indexOf(start),src.indexOf(end,src.indexOf(start))),ctx);
function project(value,schema){
 if(schema.type==='object')return Object.fromEntries(schema.required.map(k=>[k,project(value[k],schema.properties[k])]));
 if(schema.type==='array')return value.map(v=>project(v,schema.items));return value;
}
function setup(types){
 const template={question_plans:types.map((interaction,i)=>({plan_id:'p'+i,interaction,difficulty:'desafiante'}))};
 const full={type:'object',properties:{plans:ctx.buildObjectiveRoomFillResponseSchema(template),...ctx.buildRoomBundleResponseSchema(types.length,3).properties},required:['plans','mission']};
 return {template,full,wire:ctx.buildFilteredRoomSchema(full,template)};
}
for(const {id} of experience.definitions)test(id+' filtered transport roundtrips into a playable full contract',()=>{
 const {template,full,wire}=setup([id]);
 const payload=ctx.buildFixedObjectiveFillShape(wire);
 payload.plans.p0.interaction_data=project(contractFor(id),wire.properties.plans.properties.p0.properties.interaction_data);
 payload.plans.p0.case_data=['Observed case'];payload.plans.p0.teaching_example='Different example';
 assert.equal(ctx.validateFixedObjectiveFill(payload,wire).length,0);
 const restored=ctx.hydrateFilteredRoomResponse(payload,full,template);
 assert.equal(ctx.validateFixedObjectiveFill(restored,full).length,0);
 const c=restored.plans.p0.interaction_data;
 assert.deepEqual(experience.authoringIssues(id,c),[]);
 assert.equal(experience.evaluate(id,c,experience.solutionState(c.solutions[0])),'correct');
 assert.equal(restored.mission.preguntas[0]._plan_id,'p0');
 assert.equal('mechanic_contract' in payload.plans.p0,false);
 assert.equal('solution_pairs' in payload.plans.p0,false);
 assert.equal('respuesta_correcta' in payload.mission.preguntas.p0,false);
 assert.equal('interaction_data' in payload.mission.preguntas.p0,false);
 delete payload.plans.p0.interaction_data.solutions;
 assert.ok(ctx.validateFixedObjectiveFill(payload,wire).length,'missing active solution must fail');
});
test('Two selected types have distinct schemas and no unused geometry or rules',()=>{
 const {wire}=setup(['seleccion_multiple','completar_patron']);
 const plans=wire.properties.plans.properties;
 assert.equal(Object.keys(plans).length,2);
 for(const p of Object.values(plans)){
  assert.equal('rules' in p.properties.interaction_data.properties,false);
  assert.equal('x' in p.properties.interaction_data.properties.options.items.properties,false);
  assert.equal('value' in p.properties.interaction_data.properties.options.items.properties,false);
 }
 assert.equal('minimum' in plans.p0.properties.interaction_data.properties,true);
 assert.equal('minimum' in plans.p1.properties.interaction_data.properties,false);
 assert.equal('allowed' in plans.p1.properties.interaction_data.properties.targets.items.properties,true);
});
test('Classic options and pair answers survive hydration; invalid fields are rejected',()=>{
 const {template,full,wire}=setup(['opcion_multiple','drag_drop','completar_espacio','ordenar_secuencia','texto','multimedia','relacion_columnas','verdadero_falso']);
 const payload=ctx.buildFixedObjectiveFillShape(wire);
 payload.mission.preguntas.p0.opciones=['correct','wrong'];
 payload.plans.p1.solution_pairs=Array.from({length:6},(_,i)=>({izquierda:'L'+i,derecha:'R'+i}));
 const restored=ctx.hydrateFilteredRoomResponse(payload,full,template);
 assert.equal(restored.mission.preguntas[1].parejas.length,6);
 assert.equal(restored.mission.preguntas[0].opciones[1],'wrong');
 assert.equal(restored.mission.preguntas[5].requiere_imagen,true);
 payload.mission.preguntas.p4.opciones=['unexpected'];
 assert.ok(ctx.validateFixedObjectiveFill(payload,wire).some(x=>x.includes('campo no permitido')));
});
test('Every pair of new types retains its own active contract',()=>{
 for(const a of experience.definitions)for(const b of experience.definitions){
  const {template,full,wire}=setup([a.id,b.id]);
  const payload=ctx.buildFixedObjectiveFillShape(wire);
  for(const [index,id] of [a.id,b.id].entries()){
   payload.plans['p'+index].case_data=['Observed case'];payload.plans['p'+index].teaching_example='Different example';
   payload.plans['p'+index].interaction_data=project(contractFor(id),wire.properties.plans.properties['p'+index].properties.interaction_data);
  }
  assert.equal(ctx.validateFixedObjectiveFill(payload,wire).length,0,a.id+' / '+b.id);
  const restored=ctx.hydrateFilteredRoomResponse(payload,full,template);
  assert.equal(ctx.validateFixedObjectiveFill(restored,full).length,0);
  for(const [index,id] of [a.id,b.id].entries())assert.deepEqual(experience.authoringIssues(id,restored.plans['p'+index].interaction_data),[]);
 }
});
test('Prompt has one selected schema and includes neither the full catalog nor inactive defaults',()=>{
 Object.assign(ctx,{
  QUESTION_BRIEF_GROUNDING:'grounding',QUESTION_DIVERSITY_INSTRUCTION:'diversity',buildDifficultyInstruction:()=>'',
  resolvePromptLanguageDirective:()=>({directive:'English'}),getQuestionTimeBudgetSeconds:()=>120,
  getObjectiveConfigurationContract:()=>({}),buildVisualDirection:()=>({line:'natural'}),
  buildQuestionAuthoringTemplate:()=>{throw Error('Unselected classic template requested');},experienceAuthoringInstruction
 });
 const {template,wire}=setup(['seleccion_multiple','completar_patron']);
 const prompt=ctx.buildFilteredRoomPrompt({},null,{rooms:[]},{room_number:1},template,wire);
 assert.equal((prompt.match(/ESQUEMA ÚNICO:/g)||[]).length,1);
 assert.doesNotMatch(prompt,/OUTPUT_FORMAT|FORMA JSON OBLIGATORIA|x=y=value=0|TIPO NUEVO resolver_restricciones/);
 assert.equal((prompt.match(/TIPO NUEVO seleccion_multiple/g)||[]).length,1);
 assert.equal((prompt.match(/TIPO NUEVO completar_patron/g)||[]).length,1);
});
