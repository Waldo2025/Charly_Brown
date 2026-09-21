import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/js/PigPenCreator.js',import.meta.url),'utf8');
const ctx=vm.createContext({structuredClone});
vm.runInContext(source.slice(source.indexOf('function normalizeCombinedRoomResponse('),source.indexOf('function objectivePlanContractIssues(')),ctx);
const ids=['r2_p2','r2_p3','r2_p4','r2_reserve'];
const slot={type:'object',properties:{evidence:{type:'string',minLength:1},reasoning_evidence:{type:'string',minLength:1}},required:['evidence','reasoning_evidence']};
const schema={type:'object',properties:{plans:{type:'object',properties:Object.fromEntries(ids.map(id=>[id,slot])),required:ids}},required:['plans']};
test('Recovers omitted evidence for all reported slots from existing private reasoning without mutating input',()=>{
 const raw={plans:Object.fromEntries(ids.map(id=>[id,{reasoning_evidence:'The observed sequence identifies the missed step.'}]))};
 assert.equal(ctx.validateFixedObjectiveFill(raw,schema).length,4);
 const fixed=ctx.normalizeCombinedRoomResponse(raw,schema);
 assert.equal(ctx.validateFixedObjectiveFill(fixed,schema).length,0);
 for(const id of ids){assert.equal(fixed.plans[id].evidence,raw.plans[id].reasoning_evidence);assert.equal(Object.hasOwn(raw.plans[id],'evidence'),false);}
});
test('Preserves provided evidence; missing or invalid source remains rejected',()=>{
 for(const reasoning_evidence of ['',null,[],undefined]){
  const fixed=ctx.normalizeCombinedRoomResponse({plans:{r2_p2:{reasoning_evidence}}},schema);
  assert.equal(Object.hasOwn(fixed.plans.r2_p2,'evidence'),false);
  assert.ok(ctx.validateFixedObjectiveFill(fixed,schema).length);
 }
 for(const evidence of ['Original observation','',null]){
  assert.equal(ctx.normalizeCombinedRoomResponse({plans:{r2_p2:{evidence,reasoning_evidence:'Other rationale'}}},schema).plans.r2_p2.evidence,evidence);
 }
 assert.match(ctx.buildCombinedRoomFieldRequirements(schema),/evidence.*reasoning_evidence/);
});
