import test from 'node:test';
import assert from 'node:assert/strict';
import {experience as E,createExperienceEngine} from '../public/js/escape-room-experience.mjs';
import {createRewardEngine} from '../public/js/escape-room-rewards.mjs';
import {normalizeEscapeRoomProject,validateQuestionAnswer} from '../public/js/escape-room-creator-model.mjs';
import {buildInteractionPlan} from '../public/js/escape-room-interaction-plan.mjs';
import {buildEscapeRoomPackage,buildPreviewDocument} from '../public/js/escape-room-package-builder.mjs';
import {contractFor,questionFor,projectFor} from './fixtures/pigpen-experience.mjs';
const R=createRewardEngine(E);
for(const d of E.definitions)test(d.id+': validate, render, normalize and reject wrong answer',()=>{
 const c=contractFor(d.id),a=E.solutionState(c.solutions[0]);
 assert.deepEqual(E.structuralIssues(d.id,c),[]);
 assert.equal(E.evaluate(d.id,c,a),'correct');
 assert.notEqual(E.evaluate(d.id,c,{}),'correct');
 assert.equal(E.evaluate(d.id,c,{...a,unknown:['a']}),'incorrect');
 const q=normalizeEscapeRoomProject(projectFor([d.id])).misiones[0].preguntas[0];
 assert.equal(q.tipo_interaccion,d.id);assert.deepEqual(q.interaction_data,c);assert.equal(validateQuestionAnswer(q,a),true);
 assert.match(E.render(d.id,c,{},'m1::q0'),/data-exp-action/);
 assert.doesNotMatch(E.render(d.id,c,{},'m1::q0'),/type="text"/);
});
test('classics default and only allowed types including drag-only repetition',()=>{
 assert.equal(E.config().question_types.length,8);
 assert.equal(E.config().primary_reward,'letras');assert.deepEqual(E.config().extras,[]);
 assert.deepEqual(buildInteractionPlan(2,4,'test',['drag_drop']),Array.from({length:2},()=>Array(4).fill('drag_drop')));
 const types=['seleccion_multiple','corregir_error'];assert.ok(buildInteractionPlan(3,7,'test',types).flat().every(t=>types.includes(t)));
 assert.throws(()=>buildInteractionPlan(2,4,'test',[]));
});
test('sets reject extra choices, accept shuffled order and explicit alternatives',()=>{
 const c=contractFor('seleccion_multiple');assert.equal(E.evaluate('seleccion_multiple',c,{t:['c','a']}),'correct');assert.equal(E.evaluate('seleccion_multiple',c,{t:['a','b','c']}),'incorrect');
 c.solutions.push({answers:[{target:'t',options:['b']}]});assert.equal(E.evaluate('seleccion_multiple',c,{t:['b']}),'correct');
});
test('expressions evaluated without code execution, commutative solutions accepted',()=>{
 const c=contractFor('construir_expresion');assert.equal(E.evaluate('construir_expresion',c,{t:['c','b','a']}),'correct');assert.equal(E.evaluate('construir_expresion',c,{t:['a','b','a']}),'incorrect');assert.equal(E.evaluate('construir_expresion',c,{t:['a','b']}),'unanswered');
 c.options[0].label='alert(1)';assert.ok(E.structuralIssues('construir_expresion',c).length);
});
test('malformed imported contracts do not throw',()=>{for(const c of [null,{}, {version:1,options:[null,null],targets:[{}]}, {...contractFor('seleccion_multiple'),solutions:[null]}])assert.ok(E.structuralIssues('seleccion_multiple',c).length);});
test('perfect-room extras are idempotent, errors and assistance disqualify',()=>{
 const cfg=E.config({extras:['pista','coleccionable']});const m=projectFor().misiones[0],p=E.metrics();
 E.recordAttempt(p,'m1::q0','unanswered');assert.equal(p.attempts['m1::q0'],undefined);E.recordAttempt(p,'m1::q0','correct');assert.equal(E.award(p,m,cfg).perfect,true);E.award(p,m,cfg);assert.equal(p.inventory.pista,1);
 for(const mode of ['wrong','hint']){const q=E.metrics();if(mode==='wrong')E.recordAttempt(q,'m1::q0','incorrect');else q.assisted['m1::q0']=true;E.recordAttempt(q,'m1::q0','correct');assert.equal(E.award(q,m,cfg).perfect,false);assert.deepEqual(q.inventory,{});}
});
for(const reward of E.rewards)test(reward.id+': reward and offline package round trip',()=>{
 const p=projectFor(['seleccion_multiple'],reward.id);if(reward.id==='imagen')p.experience_config.reward_image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6G1sAAAAASUVORK5CYII=';p.reward_plan=R.buildPlan(p.experience_config,p.clave_final,[{id:'m1',titulo:'Sala 1',fragment:'SOL'}]);
 assert.deepEqual(R.issues(p.reward_plan),[]);const norm=normalizeEscapeRoomProject(p);assert.deepEqual(norm.reward_plan,p.reward_plan);
 const pack=buildEscapeRoomPackage(p);assert.ok(Object.keys(pack.files).length);const html=buildPreviewDocument(p);assert.match(html,/createExperienceEngine/);assert.match(html,/createRewardEngine/);
 const final={puzzle_version:1,placements:[0],order:[0],choice:'SOL',sequence:p.reward_plan.rooms.flatMap(r=>r.pattern),positions:{0:'S',1:'O',2:'L'}};
 assert.equal(R.evaluateFinal(p.reward_plan,final),true);assert.equal(R.evaluateFinal(p.reward_plan,{}),false);
});
test('pure runtime factory has no module dependencies',()=>{const embedded=Function('return ('+createExperienceEngine.toString()+')()')();assert.equal(embedded.definitions.length,19);});

test('XLSX edit and import retains structured answers and rewards for all registered types',async()=>{
 const {createRequire}=await import('node:module');const require=createRequire(import.meta.url);const XLSX=require('../public/vendor/xlsx/xlsx.full.min.js');
 const {buildEditorialWorkbook,readEditorialWorkbook,previewEditorialImport}=await import('../public/js/escape-room-editorial-workbook.mjs');
 const project=projectFor(E.definitions.map(d=>d.id),'simbolos',['pista']);project.reward_plan=R.bindPlan(null,project);
 const topics=[{id:'topic',academicNumber:1,title:'Tema',formState:{},project}];
 const workbook=buildEditorialWorkbook(XLSX,{sessionId:'s',sessionTitle:'Sesión',topics});
 const sheet=workbook.Sheets.Textos,range=XLSX.utils.decode_range(sheet['!ref']);let edits=0;
 for(let row=2;row<=range.e.r;row++)if(sheet['D'+(row+1)]?.v==='Ficha 1'){sheet['E'+(row+1)]={t:'s',v:'A corregida'};edits++;}
 const doc=readEditorialWorkbook(XLSX,XLSX.write(workbook,{type:'array',bookType:'xlsx'}));const preview=previewEditorialImport(doc,{sessionId:'s',topics});
 // Expression numeric tokens must remain numeric; only edit the non-mathematical instruction in a second workbook if labels differ.
 if(!edits){assert.fail('No editorial option rows found');}
 assert.ok(preview.errors.length > 0); // Numeric-expression edits must be rejected, never silently accepted.
 const safe=buildEditorialWorkbook(XLSX,{sessionId:'s',sessionTitle:'Sesión',topics}),texts=safe.Sheets.Textos;
 for(let row=2;row<=XLSX.utils.decode_range(texts['!ref']).e.r;row++)if(texts['D'+(row+1)]?.v==='Instrucciones del ejercicio')texts['E'+(row+1)]={t:'s',v:'Lee el caso y selecciona las fichas.'};
 const result=previewEditorialImport(readEditorialWorkbook(XLSX,XLSX.write(safe,{type:'array',bookType:'xlsx'})),{sessionId:'s',topics});
 assert.deepEqual(result.errors,[]);assert.deepEqual(result.conflicts,[]);assert.equal(result.changes.length,19);
 assert.deepEqual(result.nextTopics[0].project.reward_plan,project.reward_plan);
 for(const q of result.nextTopics[0].project.misiones[0].preguntas){assert.equal(q.interaction_data.instructions,'Lee el caso y selecciona las fichas.');assert.equal(E.evaluate(q.tipo_interaccion,q.interaction_data,E.solutionState(q.interaction_data.solutions[0])),'correct');}
});

test('malformed connections, missing rules and unsafe expression solutions are rejected',()=>{
 for(const change of [{connections:[null]},{rules:null},{solutions:[{answers:[null]}]}])assert.ok(E.structuralIssues('resolver_restricciones',{...contractFor('resolver_restricciones'),...change}).length);
 const expression=contractFor('construir_expresion');expression.solutions[0].answers[0].options=['a','b'];assert.ok(E.structuralIssues('construir_expresion',expression).length);
 const p=R.bindPlan(null,projectFor(['seleccion_multiple'],'imagen'));assert.equal(R.evaluateFinal(p,{order:[],choice:'SOL'}),false);
});

test('Objective schema includes new contracts and materialization preserves immutable solutions',async()=>{
 const vm=await import('node:vm');const {readFile}=await import('node:fs/promises');const {experienceContractSchema}=await import('../public/js/escape-room-experience-authoring.mjs');
 const source=await readFile(new URL('../public/js/PigPenCreator.js',import.meta.url),'utf8');
 function extract(name){const start=source.search(new RegExp(`^(?:async )?function ${name}\\(`,'m'));assert.ok(start>=0);const rest=source.slice(start);const end=rest.slice(1).search(/^(?:async )?function /m);return rest.slice(0,end+1);}
 const context=vm.createContext({experience:E,experienceContractSchema});vm.runInContext(['buildObjectiveRoomFillResponseSchema','applyQuestionPlanAnswerContract','generatedQuestionPlanIssues'].map(extract).join('\n'),context);
 const slots=E.definitions.map((d,i)=>({plan_id:'r1_p'+i,interaction:d.id}));const schema=context.buildObjectiveRoomFillResponseSchema({question_plans:slots});
 for(const slot of slots){assert.ok(schema.properties[slot.plan_id].required.includes('interaction_data'));const plan={...slot,interaction_data:contractFor(slot.interaction)};const q=context.applyQuestionPlanAnswerContract(questionFor(slot.interaction),plan,slot.interaction);assert.deepEqual(q.interaction_data,plan.interaction_data);assert.notEqual(q.interaction_data,plan.interaction_data);assert.equal(context.generatedQuestionPlanIssues(q,plan,slot.interaction).length,0);}
});

test('Multiselect generation requires visible plausible distractor slots and rejects all-correct banks',async()=>{
 const {experienceContractSchema,experienceAuthoringInstruction}=await import('../public/js/escape-room-experience-authoring.mjs');
 const c=contractFor('seleccion_multiple');assert.deepEqual(E.authoringIssues('seleccion_multiple',c),[]);
 assert.equal(experienceContractSchema('seleccion_multiple').properties.options.minItems,4);assert.match(experienceAuthoringInstruction('seleccion_multiple'),/2 distractores plausibles/);
 const short=structuredClone(c);short.options=short.options.filter(o=>['a','c'].includes(o.id));assert.ok(E.authoringIssues('seleccion_multiple',short).length);assert.deepEqual(E.structuralIssues('seleccion_multiple',short),[],'Legacy questions remain playable until regenerated');
 const all=structuredClone(c);all.solutions[0].answers[0].options=all.options.map(o=>o.id);assert.match(E.authoringIssues('seleccion_multiple',all).join(' '),/distractores/);
 const hidden=structuredClone(c);hidden.targets[0].allowed=['a','c'];assert.deepEqual(E.authoringIssues('seleccion_multiple',hidden),[]);
 assert.equal(E.evaluate('seleccion_multiple',c,{t:['a','c','d']}),'incorrect');assert.equal(E.evaluate('seleccion_multiple',c,{t:['a','c']}),'correct');
});


test('Pattern generation requires two visible distractors per blank',async()=>{
 const {experienceContractSchema}=await import('../public/js/escape-room-experience-authoring.mjs');
 const c=contractFor('completar_patron');assert.deepEqual(E.authoringIssues('completar_patron',c),[]);
 assert.equal(experienceContractSchema('completar_patron').properties.options.minItems,3);
 for(const allowed of [['a'],['a','b']]){const hidden=structuredClone(c);hidden.targets[0].allowed=allowed;assert.match(E.authoringIssues('completar_patron',hidden).join(' '),/distractores/);assert.deepEqual(E.structuralIssues('completar_patron',hidden),[]);}
 const alternative=structuredClone(c);alternative.solutions.push({answers:[{target:'t',options:['b']}]});assert.match(E.authoringIssues('completar_patron',alternative).join(' '),/distractores/);
 const duplicate=structuredClone(c);duplicate.options[2].label=duplicate.options[1].label;assert.ok(E.authoringIssues('completar_patron',duplicate).length);
});


test('Saved multiselect with correct-only allowed still displays and accepts all bank options',()=>{
 const c=contractFor('seleccion_multiple');c.targets[0].allowed=['a','c'];const original=JSON.stringify(c);
 const html=E.render('seleccion_multiple',c,{},'q','es');
 for(const id of ['a','b','c','d'])assert.ok(html.includes('data-exp-option="'+id+'"'));
 let state={};for(const id of ['a','c','d'])state=E.act('seleccion_multiple',c,state,'t',id,'toggle');
 assert.deepEqual(state.t,['a','c','d']);assert.equal(E.evaluate('seleccion_multiple',c,state),'incorrect');
 state=E.act('seleccion_multiple',c,state,'t','d','toggle');assert.equal(E.evaluate('seleccion_multiple',c,state),'correct');assert.equal(JSON.stringify(c),original);
 const pattern=contractFor('completar_patron');pattern.targets[0].allowed=['a','b'];assert.equal(E.render('completar_patron',pattern,{},'q','es').includes('data-exp-option="c"'),false);
});


test('Normalization recovers existing distractors without inventing options or changing solutions',()=>{
 for(const type of ['seleccion_multiple','completar_patron']){
  const c=contractFor(type);c.targets[0].allowed=type==='seleccion_multiple'?['a','c']:['a'];const original=JSON.stringify(c);
  const fixed=E.normalizeContract(c,type);assert.deepEqual(E.authoringIssues(type,fixed),[]);assert.deepEqual(fixed.options,c.options);assert.deepEqual(fixed.solutions,c.solutions);assert.equal(JSON.stringify(c),original);
 }
 const c=contractFor('completar_patron');c.options=c.options.slice(0,2);c.targets[0].allowed=['a'];assert.ok(E.authoringIssues('completar_patron',E.normalizeContract(c,'completar_patron')).length);
});

test('Invalid immutable question plan stops before a Gemini room request',async()=>{
 const vm=await import('node:vm');const {readFile}=await import('node:fs/promises');const source=await readFile(new URL('../public/js/PigPenCreator.js',import.meta.url),'utf8');
 const start=source.indexOf('async function requestGeneratedRoomBundle('),end=source.indexOf('async function runWithConcurrency(',start);
 const c=contractFor('seleccion_multiple');c.options=c.options.filter(o=>['a','c'].includes(o.id));let requests=0;
 const ctx=vm.createContext({experience:E,getObjectiveRoomContract:()=>({question_plans:[{plan_id:'r1_p4',interaction:'seleccion_multiple',interaction_data:c}]}),requestQualityJson:()=>{requests++;throw Error('Unexpected API call');}});
 vm.runInContext(source.slice(start,end),ctx);await assert.rejects(ctx.requestGeneratedRoomBundle({},0),/necesita regenerarse/);assert.equal(requests,0);
});
