import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {experience as E} from '../public/js/escape-room-experience.mjs';
import {fixedInteraction} from '../public/js/pigpen-fixed-content.mjs';
import {createRewardEngine} from '../public/js/escape-room-rewards.mjs';
import {userStatus} from '../public/js/pigpen-user-status.mjs';
import {buildEscapeRoomPackage} from '../public/js/escape-room-package-builder.mjs';
import {projectFor} from './fixtures/pigpen-experience.mjs';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6G1sAAAAASUVORK5CYII=';
const R=createRewardEngine(E);
test('Diagram nodes reflect selection, replacement, deselection and restored state',()=>{
 const c=fixedInteraction('completar_diagrama',E);c.targets.forEach((t,i)=>t.label='Node '+i);c.options.forEach((o,i)=>o.label='Answer '+i);
 let s=E.act('completar_diagrama',c,{},'t','a','toggle');
 let html=E.render('completar_diagrama',c,s,'test','en');assert.match(html,/is-filled[^]*Answer 0/);
 s=E.act('completar_diagrama',c,s,'t','b','toggle');html=E.render('completar_diagrama',c,JSON.parse(JSON.stringify(s)),'test','en');assert.match(html,/is-filled[^]*Answer 1/);
 s=E.act('completar_diagrama',c,s,'t','b','toggle');assert.doesNotMatch(E.render('completar_diagrama',c,s,'test','en'),/exp-diagram-node is-filled/);
 assert.doesNotMatch(E.render('completar_diagrama',c,{},'test','en'),/exp-diagram-node is-filled/);
});
test('Coordinates show axes and valid start without giving the goal',()=>{
 const c=fixedInteraction('respuesta_coordenadas',E);const html=E.render('respuesta_coordenadas',c,{},'q','en');
 assert.match(html,/scope="col"/);assert.match(html,/scope="row"/);assert.match(html,/The cell marked “Start” shows where to begin/);assert.match(html,/aria-label="E \(2, 2\), Start"/);assert.match(html,/exp-start-indicator[^>]*>Start<\/span>/);
 c.start_option='missing';assert.ok(E.structuralIssues('respuesta_coordenadas',c).length);
 delete c.start_option;assert.deepEqual(E.structuralIssues('respuesta_coordenadas',c),[]);
});
for(const count of [1,2,3,4,5,6,7,8])test('Image reward covers the whole illustration exactly once: '+count+' rooms',()=>{
 const code='ABCDEFGH'.slice(0,count),rooms=[...code].map((fragment,i)=>({id:'m'+i,titulo:'Room '+i,fragment}));
 const p=R.buildPlan({primary_reward:'imagen',reward_image:png},code,rooms);assert.deepEqual(R.issues(p),[]);
 assert.ok(Math.abs(p.rooms.reduce((area,r)=>area+r.crop.width*r.crop.height,0)-1)<1e-8);
 p.rooms.forEach(r=>{assert.ok(r.puzzle_path.includes('C'));assert.ok(Math.abs(r.crop.width*r.crop.height-1/count)<1e-8);});
 assert.doesNotMatch(R.finalHTML(p,{},'en'),/data-reward-action="piece"/);
 assert.equal(R.evaluateFinal(p,{puzzle_version:1,placements:p.rooms.map((_,i)=>i)}),true);
});
test('Missing image stays pending, while a real image is included in offline export',()=>{
 const p=projectFor(['seleccion_multiple'],'imagen');p.reward_plan=R.bindPlan(null,p);
 assert.equal(p.reward_plan.image,'');assert.throws(()=>buildEscapeRoomPackage(p),/imagen/);
 p.experience_config.reward_image=png;p.reward_plan=R.buildPlan(p.experience_config,p.clave_final,[{id:'m1',titulo:'Room',fragment:p.clave_final}]);
 const pack=buildEscapeRoomPackage(p);assert.ok(Object.keys(pack.files).some(k=>k.includes('reward-image')));
});
test('Statuses provide plain language and separate technical details without editing objective',()=>{
 for(const m of ['HTTP 429','Failed to fetch','timeout','Faltan 98 campos','Revisión pedagógica: r1_p3','No se pudo guardar','Falta imagen']){const s=userStatus(m,'error');assert.notEqual(s.message,m);assert.equal(s.detail,m);}
 const html=readFileSync(new URL('../public/PigPenCreator.html',import.meta.url),'utf8');assert.equal((html.match(/id="erStatusBanner"/g)||[]).length,1);assert.ok(html.indexOf('id="erStatusBanner"')>html.indexOf('id="objetivoInput"'));assert.ok(!html.includes('id="objectiveEnrichmentLoader"'));
});

test('Reward illustration is generated once, stored, and reused without regenerating rooms',async()=>{
 const vm=await import('node:vm');const source=readFileSync(new URL('../public/js/PigPenCreator.js',import.meta.url),'utf8');const a=source.indexOf('async function ensureRewardImage('),b=source.indexOf('async function retryRewardImage(',a);
 const p=projectFor(['seleccion_multiple'],'imagen');p.reward_plan=R.bindPlan(null,p);let calls=0,saves=0;
 const ctx=vm.createContext({state:{project:p},rewardEngine:R,setStatus:()=>{},buildVisualDirection:()=>({line:'Chosen style'}),selectedExperienceInstruction:()=> 'Chosen narrative',generateValidatedImage:async()=>{calls++;return png;},storeGeneratedImage:async()=> 'https://example.com/reward.webp',resolveGeneratedImageStorageContext:async()=>({}),renderPreview:()=>{},scheduleSessionSave:()=>saves++,Image:class{set src(v){this.naturalWidth=1600;this.naturalHeight=900;this.onload();}}});
 vm.runInContext(source.slice(a,b),ctx);await ctx.ensureRewardImage(p,{});await ctx.ensureRewardImage(p,{});
 assert.equal(calls,1);assert.equal(saves,1);assert.equal(p.reward_plan.image,'https://example.com/reward.webp');assert.equal(p.reward_plan.image_aspect,16/9);
});
test('Failed illustration leaves existing question content intact and allows image-only retry',async()=>{
 const vm=await import('node:vm');const source=readFileSync(new URL('../public/js/PigPenCreator.js',import.meta.url),'utf8');const a=source.indexOf('async function ensureRewardImage('),b=source.indexOf('async function retryRewardImage(',a);
 const p=projectFor(['seleccion_multiple'],'imagen'),before=JSON.stringify(p.misiones);let calls=0;
 const ctx=vm.createContext({state:{project:p},rewardEngine:R,setStatus:()=>{},buildVisualDirection:()=>({line:'style'}),selectedExperienceInstruction:()=>'',generateValidatedImage:async()=>{calls++;throw Error('image timeout');}});
 vm.runInContext(source.slice(a,b),ctx);await assert.rejects(ctx.ensureRewardImage(p,{}),/timeout/);assert.equal(JSON.stringify(p.misiones),before);assert.equal(p.reward_plan.image,'');assert.equal(calls,1);
});
