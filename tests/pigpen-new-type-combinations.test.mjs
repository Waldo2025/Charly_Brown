import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
import {experience as E} from '../public/js/escape-room-experience.mjs';
import {buildInteractionPlan} from '../public/js/escape-room-interaction-plan.mjs';
import {experienceContractSchema} from '../public/js/escape-room-experience-authoring.mjs';
import {contractFor} from './fixtures/pigpen-experience.mjs';
const source=readFileSync(new URL('../public/js/PigPenCreator.js',import.meta.url),'utf8');
const section=(name,next)=>source.slice(source.indexOf('function '+name+'('),source.indexOf('\nfunction '+next+'(',source.indexOf('function '+name+'(')));
const ctx=vm.createContext({experience:E,experienceContractSchema});
vm.runInContext(section('buildObjectiveRoomFillResponseSchema','buildFixedObjectiveFillShape')+section('validateFixedObjectiveFill','objectivePlanContractIssues'),ctx);
test('Case metadata permits one complete observation or six and grouped distractor explanations',()=>{
 const schema=ctx.buildObjectiveRoomFillResponseSchema({question_plans:[{plan_id:'p',interaction:'opcion_multiple',difficulty:'desafiante',difficulty_policy_version:3}]});const props=schema.properties.p.properties;
 for(const count of [1,2,4,6])assert.equal(ctx.validateFixedObjectiveFill(Array.from({length:count},(_,i)=>'Complete observation '+i),props.case_data).length,0);
 assert.equal(ctx.validateFixedObjectiveFill(['Misread gesture','Ignore local convention'],props.distractor_errors).length,0);
 assert.ok(ctx.validateFixedObjectiveFill([],props.case_data).length);assert.ok(ctx.validateFixedObjectiveFill([''],props.case_data).length);
});
test('Every one of the 262143 nonempty selections of new question types produces only allowed questions',()=>{
 const types=E.definitions.map(d=>d.id);
 for(let mask=1;mask<2**types.length;mask++){
  const selected=types.filter((_,i)=>mask&(1<<i));const allowed=E.config({question_types:selected}).question_types;
  const plan=buildInteractionPlan(2,2,'Body Language',allowed);
  assert.equal(plan.length,2);assert.ok(plan.every(room=>room.length===2&&room.every(type=>selected.includes(type))));
 }
});
test('Every ordered pair of new types remains independent with all reward configurations',()=>{
 const types=E.definitions.map(d=>d.id);
 for(const a of types)for(const b of types){
  const ca=contractFor(a),cb=contractFor(b),sa=E.solutionState(ca.solutions[0]),sb=E.solutionState(cb.solutions[0]);
  assert.equal(E.evaluate(a,ca,sa),'correct');assert.equal(E.evaluate(b,cb,sb),'correct');
  assert.ok(E.render(a,ca,{},'r::a','en-US').includes('r::a'));assert.ok(E.render(b,cb,{},'r::b','en-US').includes('r::b'));
  for(const reward of E.rewards)for(let mask=0;mask<32;mask++){
   const extras=E.extras.filter((_,i)=>mask&(1<<i)).map(x=>x.id);const cfg=E.config({question_types:[a,b],primary_reward:reward.id,extras});
   assert.equal(cfg.primary_reward,reward.id);assert.deepEqual(cfg.extras,extras);
  }
 }
});


test('All new types can mix with each classic type without changing requested room size',()=>{
 for(const newType of E.definitions.map(d=>d.id))for(const classic of E.classics){
  const id=Array.isArray(classic)?classic[0]:classic.id;
  const allowed=[newType,id];const plan=buildInteractionPlan(4,4,'Body Language',allowed);
  assert.equal(plan.length,4);assert.ok(plan.every(room=>room.length===4&&room.every(t=>allowed.includes(t))));
 }
});


test('Every slot-based new type recovers bank alternatives hidden by a correct-only allowed filter',()=>{
 for(const {id,family} of E.definitions){if(family!=='slots')continue;const c=contractFor(id);for(const t of c.targets)t.allowed=c.solutions[0].answers.find(a=>a.target===t.id).options.slice();
  const fixed=E.normalizeContract(c,id);assert.deepEqual(E.authoringIssues(id,fixed),[],id);assert.deepEqual(fixed.options,c.options);assert.deepEqual(fixed.solutions,c.solutions);assert.equal(E.evaluate(id,fixed,E.solutionState(fixed.solutions[0])),'correct');
 }
});
