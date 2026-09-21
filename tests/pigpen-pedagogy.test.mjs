import test from 'node:test';import assert from 'node:assert/strict';
import {composePedagogicalRoom,pedagogicalRoomIssues} from '../public/js/pigpen-pedagogy.mjs';
function fixture(){return {plans:{p:{plan_id:'p',knowledge:'A position meets a stated distance rule when it lies inside the allowed interval.',teaching_example:'For a practice rule from three to four metres, a position at 3.5 metres meets the rule.',case_data:['In this fictional checkpoint, the permitted distance is 1.5 to 2 metres.','The passenger stands two metres from the counter.'],application:'Does this position satisfy the displayed rule?',answer_target:'The position meets the distance requirement.'}},mission:{contexto:'Read the terminal briefing.',datos_clave:['Compare the rule and observation.'],preguntas:[{reto:'Does this position satisfy the displayed rule?',pista:'Compare the measurement with the limits.'}]}};}
test('Airport failure reproduces: private evidence and case data do not count as student-visible support',()=>{
 const c=fixture(),issues=pedagogicalRoomIssues(c.mission,[c.plans.p]);
 assert.ok(issues.some(x=>x.includes('briefing visible')));assert.ok(issues.some(x=>x.includes('plan privado')));
 c.mission.evidence_expected=c.plans.p.knowledge;assert.ok(pedagogicalRoomIssues(c.mission,[c.plans.p]).length);
});
test('Assembly places teaching and a different example in briefing and exact local rule in public case',()=>{
 const c=fixture();const fixed=composePedagogicalRoom(c,[{plan_id:'p'}]);
 assert.deepEqual(pedagogicalRoomIssues(fixed.mission,[fixed.plans.p]),[]);
 assert.ok(!fixed.mission.contexto.includes(c.plans.p.answer_target));
 assert.ok(!fixed.mission.contexto.includes(c.plans.p.case_data[0]));
 assert.ok(fixed.mission.preguntas[0].reto.includes('fictional checkpoint'));
 assert.equal(c.mission.contexto,'Read the terminal briefing.');
});
test('Truncation after generation is caught at final mission validation',()=>{
 const fixed=composePedagogicalRoom(fixture(),[{plan_id:'p'}]);fixed.mission.contexto='Only a narrative introduction.';
 assert.ok(pedagogicalRoomIssues(fixed.mission,[fixed.plans.p]).length);
});
test('Twenty questions keep all necessary explanations without repeating all explanations in key facts',()=>{
 const c={plans:{},mission:{contexto:'Read.',datos_clave:[],preguntas:[]}},slots=[];
 for(let i=0;i<20;i++){const id='p'+i;slots.push({plan_id:id});c.plans[id]={plan_id:id,knowledge:`Necessary principle ${i}.`,teaching_example:`Different worked example ${i}.`,case_data:[`Observed case ${i}.`],application:`Solve case ${i}.`};c.mission.preguntas.push({});}
 const result=composePedagogicalRoom(c,slots);assert.equal(result.mission.datos_clave.length,0);assert.ok(result.mission.contexto.includes('Necessary principle 19.'));assert.deepEqual(pedagogicalRoomIssues(result.mission,Object.values(result.plans)),[]);
});
test('Answer-selecting hints and solved analogies are rejected without forbidding comparison hints',()=>{
 const c=fixture();c.plans.p.interaction_data={targets:[{id:'t',label:'Genuine smile'},{id:'u',label:'Eye contact'}],options:[{id:'a',label:'Eye wrinkles'},{id:'b',label:'Attention and respect'}],solutions:[{answers:[{target:'t',options:['a']},{target:'u',options:['b']}]}]};
 let result=composePedagogicalRoom(c,[{plan_id:'p'}]);result.mission.preguntas[0].pista='Select eye wrinkles and attention and respect.';
 assert.ok(pedagogicalRoomIssues(result.mission,[result.plans.p]).some(x=>x.includes('ayuda')));
 result.mission.preguntas[0].pista='Compare each observation with the definitions in the briefing.';
 assert.deepEqual(pedagogicalRoomIssues(result.mission,[result.plans.p]),[]);
 result.plans.p.application='Genuine smile corresponds to eye wrinkles. Eye contact corresponds to attention and respect.';
 assert.ok(pedagogicalRoomIssues(result.mission,[result.plans.p]).some(x=>x.includes('correspondencias resueltas')));
});
test('A teaching example cannot reuse evaluated case facts and CASE_DATA cannot be the complete answer',()=>{
 const c=fixture();c.plans.p.teaching_example=c.plans.p.case_data[0];c.plans.p.case_data.push(c.plans.p.answer_target);
 const result=composePedagogicalRoom(c,[{plan_id:'p'}]);const issues=pedagogicalRoomIssues(result.mission,[result.plans.p]);assert.ok(issues.some(x=>x.includes('reutiliza')));assert.ok(issues.some(x=>x.includes('respuesta privada')));
});
