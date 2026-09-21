import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../public/js/PigPenCreator.js',import.meta.url),'utf8');const ctx=vm.createContext({structuredClone});const a=src.indexOf('function normalizeCombinedRoomResponse('),b=src.indexOf('function objectivePlanContractIssues(',a);vm.runInContext(src.slice(a,b),ctx);
const schema={properties:{plans:{properties:{p:{properties:{reasoning_steps:{minItems:2}}}}}}};
test('Rules aliases normalize in both private plan and playable mission without mutating source',()=>{
 const raw={plans:{p:{interaction_data:{rules:[{type:'before',a:'a',b:'b',value:0},{type:'different',kind:'different'}]}}},mission:{preguntas:[{interaction_data:{rules:[{type:'at',a:'a',value:0}]}}]}};
 const c=ctx.normalizeCombinedRoomResponse(raw,schema);assert.equal(c.plans.p.interaction_data.rules[0].kind,'before');assert.equal('type' in c.plans.p.interaction_data.rules[1],false);assert.equal(c.mission.preguntas[0].interaction_data.rules[0].kind,'at');assert.equal(raw.plans.p.interaction_data.rules[0].type,'before');
 const conflict=ctx.normalizeCombinedRoomResponse({plans:{p:{interaction_data:{rules:[{type:'before',kind:'after'}]}}}},schema);assert.equal(conflict.plans.p.interaction_data.rules[0].type,'before');
});
test('Separates explicit inline numbered steps; does not invent a second reasoning step',()=>{
 const normalize=steps=>ctx.normalizeCombinedRoomResponse({plans:{p:{reasoning_steps:steps}}},schema).plans.p.reasoning_steps;
 assert.equal(normalize(['1. Compare the logs. 2. Deduce the missing action.']).length,2);
 for(const steps of [['Compare the logs.'],['Measure 1.5 meters and then 2.5 meters.'],['1. Compare. 3. Skip a step.']])assert.equal(normalize(steps).length,1);
 assert.ok(ctx.validateFixedObjectiveFill(normalize(['One actual step.']),{type:'array',minItems:2,items:{type:'string'}}).length);
});
