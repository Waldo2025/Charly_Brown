import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const users=new Map(),markers=new Set();let fail=false;
const library=uid=>{if(!users.has(uid))users.set(uid,new Map());return users.get(uid);};
const fixture=async({method,uid,value,revision})=>{
 if(fail&&method==='save')throw Error('Escritura rechazada');
 const db=library(uid);
 if(method==='initialize'){if(!markers.has(uid)){value.forEach(p=>db.set(p.id,{...p,revision:1,seeded:true}));markers.add(uid);}return;}
 if(method==='load')return [...db.values()];
 if(method==='save'){if((db.get(value.id)?.revision||0)!==revision)throw Error('El preset cambió en otro dispositivo.');const saved={...value,revision:revision+1,seeded:false};db.set(value.id,saved);return saved;}
 if(method==='remove'){assert.equal(db.get(value)?.revision,revision);db.delete(value);}
};
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.exposeFunction('fixture',fixture);
 await page.route('http://localhost:41000/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/'){await route.fulfill({contentType:'text/html',body:'<!doctype html><link rel="stylesheet" href="/vendor/bootstrap/bootstrap.min.css"><link rel="stylesheet" href="/PigPenCreator.css"><button id="open">Configurar</button><script src="/vendor/bootstrap/bootstrap.bundle.min.js"></script>'});return;}
  try{const body=process.env.PIGPEN_PRESET_BASE_URL?await (await fetch(process.env.PIGPEN_PRESET_BASE_URL+path)).text():await readFile(new URL('../public'+path,import.meta.url),'utf8');await route.fulfill({contentType:path.endsWith('.css')?'text/css':'text/javascript',body});}catch{await route.fulfill({status:404,body:''});}
 });
 const boot=async()=>{
  await page.goto('http://localhost:41000/');
  await page.evaluate(async()=>{
   const {createPresetStore}=await import('/js/pigpen-experience-presets.mjs');const {mountExperienceModal}=await import('/js/pigpen-experience-modal.mjs');
   window.store=createPresetStore({adapter:{initialize:(uid,value)=>fixture({method:'initialize',uid,value}),load:uid=>fixture({method:'load',uid}),save:(uid,value,revision)=>fixture({method:'save',uid,value,revision}),remove:(uid,value,revision)=>fixture({method:'remove',uid,value,revision})}});
   store.setUser('teacher');await store.load();window.applied=null;window.config={question_types:['marcar_evidencia','texto'],primary_reward:'imagen',extras:['pista','coleccionable'],reward_image:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=',reward_image_alt:'Recompensa',reward_image_aspect:1.5};
   window.modal=mountExperienceModal({presetStore:store,getConfig:()=>config,getStructure:()=>({rooms:6,questionsPerRoom:7}),onSave:(config,structure)=>{window.applied={config,structure};}});document.querySelector('#open').onclick=()=>void modal.open();
  });
  await page.click('#open');await page.waitForSelector('#erExperienceModal.show');await page.waitForFunction(()=>!store.state().busy);
 };
 await boot();await page.fill('[data-experience-preset-name]','Mi ciencias');await page.click('[data-experience-save-preset]');await page.waitForFunction(()=>document.querySelector('[data-experience-preset-status]').textContent.includes('Preset guardado'));assert.equal(library('teacher').size,5);
 await page.click('#erExperienceModal .modal-header [data-bs-dismiss]');await page.waitForSelector('#erExperienceModal.show',{state:'hidden'});await boot();
 const badge=page.locator('[data-preset-id]').filter({has:page.locator('.er-preset-badge-name',{hasText:'Mi ciencias'})});await badge.click();assert.equal(await page.inputValue('[data-experience-rooms]'),'6');assert.equal(await page.inputValue('[data-experience-question-count]'),'7');assert.equal(await page.isChecked('input[value="marcar_evidencia"]'),true);assert.equal(await page.isChecked('input[value="coleccionable"]'),true);assert.equal(await page.locator('[data-experience-image-preview]').getAttribute('src'),await page.evaluate(()=>config.reward_image));assert.equal(await page.evaluate(()=>applied),null);
 await page.click('[data-experience-save]');await page.waitForSelector('#erExperienceModal.show',{state:'hidden'});const applied=await page.evaluate(()=>applied);assert.equal(applied.config.reward_image_alt,'Recompensa');assert.equal(applied.config.reward_image_aspect,1.5);assert.deepEqual(applied.structure,{rooms:6,questionsPerRoom:7});
 await page.click('#open');await page.waitForFunction(()=>!store.state().busy);await page.click('[data-preset-delete="preset_classic"]');await page.waitForFunction(()=>!store.state().presets.some(p=>p.id==='preset_classic'));await page.click('[data-experience-refresh-presets]');await page.waitForFunction(()=>!store.state().busy);assert.equal(await page.locator('[data-preset-id="preset_classic"]').count(),0);
 fail=true;await page.fill('[data-experience-preset-name]','Borrador');await page.click('[data-experience-save-preset]');await page.waitForFunction(()=>document.querySelector('[data-experience-preset-status]').textContent.includes('Escritura rechazada'));assert.equal(await page.inputValue('[data-experience-preset-name]'),'Borrador');assert.equal(await page.evaluate(()=>store.state().draft.name),'Borrador');fail=false;
 await page.evaluate(()=>store.setUser('other'));await page.waitForSelector('#erExperienceModal.show',{state:'hidden'});assert.equal(await page.locator('[data-preset-id]').count(),0);assert.equal(await page.evaluate(()=>store.state().draft),null);
 assert.deepEqual(errors,[]);if(process.env.PIGPEN_PRESET_BASE_URL)await writeFile('/tmp/charly-pigpen-presets-browser-verification.json',JSON.stringify({passed:true,url:process.env.PIGPEN_PRESET_BASE_URL,date:new Date().toISOString()}));console.log('PigPen modal browser: save, reload, full image/config, apply, delete, draft error and account switch OK.');
}finally{await browser.close();}
