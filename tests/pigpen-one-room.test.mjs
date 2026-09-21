import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
import {experience} from '../public/js/escape-room-experience.mjs';
import {buildInteractionPlan} from '../public/js/escape-room-interaction-plan.mjs';
const source=readFileSync(new URL('../public/js/PigPenCreator.js',import.meta.url),'utf8');
test('One-room template stays one room with every allowed question type',()=>{
 const start=source.indexOf('function buildDeterministicQuestionPlanTemplate(');const end=source.indexOf('\nfunction ',start+1);
 const ctx=vm.createContext({experience,buildInteractionPlan,ESCAPE_ROOM_INTERACTION_CATALOG:experience.types,getQuestionDifficulty:()=>({pedagogical_role:'interpretation',difficulty:'desafiante',difficulty_policy_version:3}),getQuestionTimeBudgetSeconds:()=>90});vm.runInContext(source.slice(start,end),ctx);
 for(const type of experience.types)for(const preguntasPorSala of [1,4]){
  const plan=ctx.buildDeterministicQuestionPlanTemplate({misiones:1,preguntasPorSala,experience_config:{question_types:[type]}});
  assert.equal(plan.length,1);assert.equal(plan[0].question_plans.length,preguntasPorSala);
 }
});
test('Form, modal and generation do not impose a two-room minimum',()=>{
 assert.doesNotMatch(source,/Math.max\(2, Math.min\(8|misiones < 2|entre 2 y 8/);
 const modal=readFileSync(new URL('../public/js/pigpen-experience-modal.mjs',import.meta.url),'utf8');
 assert.match(modal,/min="1" max="8"/);assert.doesNotMatch(modal,/s.rooms<2/);
 const html=readFileSync(new URL('../public/PigPenCreator.html',import.meta.url),'utf8');assert.match(html,/id="numMisionesInput" value="4" min="1"/);
});
