import {experience} from '../public/js/escape-room-experience.mjs';
import {experienceContractSchema} from '../public/js/escape-room-experience-authoring.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source=readFileSync('public/js/PigPenCreator.js','utf8');
const types=['texto','opcion_multiple','multimedia','verdadero_falso','relacion_columnas','drag_drop','ordenar_secuencia','completar_espacio'];
function extract(name) {
 const start=source.search(new RegExp(`^(?:async )?function ${name}\\(`,'m'));
 const rest=source.slice(start);return rest.slice(0,rest.slice(1).search(/^(?:async )?function /m)+1);
}
const ctx=vm.createContext({experience,experienceContractSchema,ESCAPE_ROOM_INTERACTION_CATALOG:types,CLOSED_ANSWER_SUBTYPES:['palabra','frase_corta','letra','numero','codigo'],
 normalizeString:(v,f='')=>String(v || f)});
vm.runInContext(['buildQuestionsResponseSchema','buildQuestionOutputShape','validateFixedObjectiveFill','requestFixedSingleQuestion','getQuestionRegenerationPlan'].map(extract).join('\n'),ctx);
for(const type of types) {
 const question=ctx.buildQuestionOutputShape(type,false,'r1_p1');let calls=0;
 ctx.requestQualityJson=async()=>{calls++;return {question};};
 assert.equal((await ctx.requestFixedSingleQuestion('prompt',{},type)).question,question);
 assert.equal(calls,1);
 ctx.requestQualityJson=async(prompt)=>{
  calls++;
  if(calls===2){const bad={...question};delete bad.pista;return {question:bad};}
  assert.match(prompt,/question.pista/);return {question};
 };
 await ctx.requestFixedSingleQuestion('prompt',{},type);assert.equal(calls,3);
 ctx.requestQualityJson=async()=>({question:{titulo:'incomplete'}});
 await assert.rejects(ctx.requestFixedSingleQuestion('prompt',{},type),/plantilla/);
}
const original={pedagogical_role:'synthesis',difficulty:'desafiante',difficulty_policy_version:2};
assert.equal(ctx.getQuestionRegenerationPlan({question_plans:[original],reserve_opportunity:{...original,pedagogical_role:'transfer'}},0,'texto'),original);
assert.equal(ctx.getQuestionRegenerationPlan({question_plans:[original],reserve_opportunity:{...original,difficulty_policy_version:1}},0,'texto'),original);
const regeneration=extract('regenerateQuestionContent');
assert.ok(regeneration.indexOf('if (mediaIssues.length) throw') < regeneration.indexOf('state.project = regeneratedProject'));
assert.match(regeneration,/preguntas\[qIndex\] = question/);
assert.match(regeneration,/content_revision/);
console.log('PASS fixed regeneration: eight templates, one call when valid, targeted field repair, failure without replacement, no weaker closing reserve');
