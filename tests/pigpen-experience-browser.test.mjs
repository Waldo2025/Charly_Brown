import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {experience as E} from '../public/js/escape-room-experience.mjs';
import {createRewardEngine} from '../public/js/escape-room-rewards.mjs';
import {buildPreviewDocument} from '../public/js/escape-room-package-builder.mjs';
import {projectFor} from './fixtures/pigpen-experience.mjs';
const R=createRewardEngine(E);
test('All 18 interactions playable by clicking, perfect reward and six final challenges',async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  for(const [i,d] of E.definitions.entries()) {
   const page=await browser.newPage({viewport:{width:i%2?390:1000,height:850}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(5000);
   const primary=E.rewards[i%E.rewards.length].id,p=projectFor([d.id],primary,['pista','coleccionable']);p.modo_presentacion='salas';if(primary==='imagen')p.experience_config.reward_image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6G1sAAAAASUVORK5CYII=';if(d.id==='respuesta_coordenadas')p.misiones[0].preguntas[0].interaction_data.start_option='b';p.reward_plan=R.bindPlan(null,p);
   await page.setContent(buildPreviewDocument(p),{waitUntil:'load'});
   await page.locator('[data-game-start]:visible').first().click();
   if(!await page.locator('[data-exp-board]:visible').count()) await page.locator('[data-gallery-next]:visible').first().click();
   if(d.id==='respuesta_coordenadas'){const start=page.locator('.exp-start-indicator:visible');await start.waitFor();assert.equal(await start.innerText(),'Inicio');assert.match(await page.locator('.exp-coordinate-cell.is-start:visible').getAttribute('aria-label'),/B \(2, 1\), Inicio/);}
   const q=p.misiones[0].preguntas[0];
   await page.locator('[data-question-verify]:visible').click();
   for(const answer of q.interaction_data.solutions[0].answers)for(const id of answer.options)await page.locator(`[data-exp-target="${answer.target}"][data-exp-option="${id}"]:visible`).click();
   await page.locator('[data-question-verify]:visible').click();
   await page.locator('[data-room-unlock-continue]:visible').click();
   const inventory=page.locator('#expInventory');assert.equal(await inventory.isVisible(),true,d.id+' final inventory');await inventory.locator('summary').click();assert.match(await inventory.innerText(),/Sala perfecta/);
   if(primary==='letras'){
    const order=await page.locator('[data-final-passcode-token]').allTextContents();
    for(let x=0;x<3;x++){const chars=await page.locator('[data-final-passcode-token]').allTextContents();const j=chars.indexOf('SOL'[x]);if(j!==x){await page.locator('[data-final-passcode-token]').nth(j).focus();for(let k=j;k>x;k--)await page.keyboard.press('ArrowLeft');}}
   }else if(primary==='imagen')for(let x=0;x<p.reward_plan.rooms.length;x++){await page.locator(`[data-reward-action="select"][data-reward-value="${x}"]`).click();await page.locator(`[data-reward-action="place"][data-reward-value="${x}"]`).click();}
   else if(primary==='patron')for(const sym of p.reward_plan.rooms.flatMap(r=>r.pattern))await page.locator(`[data-reward-action="symbol"][data-reward-value="${sym}"]`).click();
   else for(let x=0;x<3;x++)await page.locator(`[data-reward-position="${x}"]`).selectOption('SOL'[x]);
   await page.locator('#btnVerifyMasterPasscode').click();
   await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).masterSolved);assert.equal(JSON.parse(await page.evaluate(()=>window.render_game_to_text())).masterSolved,true,d.id+' final');assert.deepEqual(errors,[],d.id);
   if(i===0)await page.screenshot({path:'/private/tmp/pigpen-experience-final.png'});
   await page.close();
  }
 }finally{await browser.close();}
});

test('Configuration modal defaults, validation, persistence and explicit confirmation',async()=>{
 const {readFile}=await import('node:fs/promises');const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://pigpen.test/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(path==='/')return route.fulfill({contentType:'text/html',body:'<body class="cb-main-layout er-shell"><link rel="stylesheet" href="/vendor/bootstrap/bootstrap.min.css"><link rel="stylesheet" href="/PigPenCreator.css"><script src="/vendor/bootstrap/bootstrap.bundle.min.js"></script>'});
   return route.fulfill({contentType:path.endsWith('.css')?'text/css':'text/javascript',body:await readFile(new URL('../public'+path,import.meta.url),'utf8')});
  });
  await page.goto('http://pigpen.test');
  await page.evaluate(async()=>{const {mountExperienceModal}=await import('/js/pigpen-experience-modal.mjs');window.events=[];window.config={};window.modal=mountExperienceModal({presetStore:{subscribe:fn=>fn({uid:'teacher',presets:[],busy:false,ready:true,source:'cloud'}),load:async()=>{},saveDraft:()=>{}},getConfig:()=>window.config,onSave:c=>{window.config=c;window.events.push('save');}});window.modal.open().then(ok=>window.events.push(ok?'continue':'cancel'));});
  await page.locator('#erExperienceModal.show').waitFor();
  assert.equal(await page.locator('input[name="classic"]:checked').count(),8);assert.equal(await page.locator('input[name^="new_"]:checked').count(),0);assert.equal(await page.locator('input[value="letras"]').isChecked(),true);
  await page.locator('[data-experience-none="classic"]').click();assert.equal(await page.locator('[data-experience-save]').isDisabled(),true);
  await page.locator('input[value="matriz_deduccion"]').check();await page.locator('input[value="simbolos"]').check();await page.locator('input[value="pista"]').check();
  assert.deepEqual(await page.evaluate(()=>window.events),[]);
  await page.locator('[data-experience-save]').click();await page.locator('#erExperienceModal').waitFor({state:'hidden'});
  assert.deepEqual(await page.evaluate(()=>window.events),['save','continue']);
  await page.evaluate(()=>{window.modal.open().then(ok=>window.events.push(ok?'continue':'cancel'));});await page.locator('#erExperienceModal.show').waitFor();assert.equal(await page.locator('input[value="matriz_deduccion"]').isChecked(),true);
  await page.waitForTimeout(350);
  assert.ok(await page.locator('[data-experience-save]').evaluate(el=>el.getBoundingClientRect().height)<=32);
  for(const [bg,fg] of [['#f8fafc','#172033'],['#18202c','#eef3fc']]) {
   await page.evaluate(([bg,fg])=>{document.documentElement.style.setProperty('--app-bg-color',bg);document.documentElement.style.setProperty('--app-text-color',fg);},[bg,fg]);
   await page.waitForTimeout(50);
   const colors=await page.locator('.er-experience-modal').evaluate(el=>({bg:getComputedStyle(el).backgroundColor,fg:getComputedStyle(el).color}));
   assert.equal(colors.bg,bg==='#f8fafc'?'rgb(248, 250, 252)':'rgb(24, 32, 44)');
   assert.equal(colors.fg,fg==='#172033'?'rgb(23, 32, 51)':'rgb(238, 243, 252)');
   await page.screenshot({path:bg==='#f8fafc'?'/private/tmp/pigpen-experience-modal-light.png':'/private/tmp/pigpen-experience-modal.png'});
  }
  await page.locator('.modal-header [data-bs-dismiss]').click();await page.locator('#erExperienceModal').waitFor({state:'hidden'});assert.deepEqual(await page.evaluate(()=>window.events),['save','continue','cancel']);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('Rewards and selected answers survive reload; consuming a hint prevents a perfect second room',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();page.setDefaultTimeout(5000);const p=projectFor(['predecir_resultado'],'simbolos',['pista']);p.modo_presentacion='salas';p.misiones.push({...structuredClone(p.misiones[0]),id:'m2',titulo:'Sala 2',bloqueada_inicial:true});p.reward_plan=R.bindPlan(null,p);
  await page.route('http://progress.test/**',route=>route.fulfill({contentType:'text/html',body:buildPreviewDocument(p)}));await page.goto('http://progress.test');
  await page.locator('[data-game-start]:visible').click();if(!await page.locator('[data-exp-board]:visible').count())await page.locator('[data-gallery-next]:visible').click();
  await page.locator('[data-exp-option="a"]:visible').click();await page.reload();assert.equal(await page.locator('[data-exp-option="a"]:visible').getAttribute('aria-pressed'),'true');
  await page.locator('[data-question-verify]:visible').click();await page.locator('[data-room-unlock-continue]').click();
  const bonus=page.locator('[data-exp-bonus="pista"]:visible');assert.match(await bonus.getAttribute('aria-label'),/\(1\)/);await page.reload();assert.equal(await bonus.isEnabled(),true);await bonus.click();assert.equal(await bonus.count(),0);assert.match(await page.locator('#experienceBonusDialog [data-exp-bonus-status]:visible').innerText(),/Contrasta las propiedades antes de decidir/);await page.locator('#experienceBonusDialog [data-bonus-close]').click();
  await page.locator('[data-exp-option="a"]:visible').click();await page.locator('[data-question-verify]:visible').click();await page.locator('[data-room-unlock-continue]').click();
  await page.locator('#expInventory summary').click();
  const cards=page.locator('#expInventory article');assert.equal(await cards.count(),2);assert.match(await cards.nth(0).innerText(),/Sala perfecta/);assert.doesNotMatch(await cards.nth(1).innerText(),/Sala perfecta/);
  await page.reload();await page.locator('#expInventory summary').click();assert.equal(await page.locator('#expInventory article').count(),2);
 }finally{await browser.close();}
});

test('Last answer feedback remains visible for three seconds before the room reward',async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  for(const mode of ['salas','menu']) {
   const page=await browser.newPage();page.setDefaultTimeout(6000);
   const p=projectFor(['predecir_resultado'],'simbolos');p.modo_presentacion=mode;p.reward_plan=R.bindPlan(null,p);p.misiones[0].preguntas[0].retroalimentacion_correcta='La evidencia confirma tu predicción.';
   await page.setContent(buildPreviewDocument(p),{waitUntil:'load'});
   await page.locator('[data-game-start]:visible').first().click();
   if(!await page.locator('[data-exp-board]:visible').count()) {
    if(mode==='menu')await page.locator('[data-menu-mission="m1"]').click();
    else await page.locator('[data-gallery-next]:visible').click();
   }
   await page.locator('[data-exp-option="a"]:visible').click();
   const start=Date.now();await page.locator('[data-question-verify]:visible').click();
   const feedback=page.locator('[data-question-status]:visible');assert.match(await feedback.innerText(),/La evidencia confirma/);
   assert.equal(await page.locator('[data-room-unlock-continue]').count(),0);
   await page.waitForTimeout(2400);assert.equal(await feedback.isVisible(),true);assert.equal(await page.locator('[data-room-unlock-continue]').count(),0);
   await page.locator('[data-room-unlock-continue]').waitFor({state:'visible'});assert.ok(Date.now()-start>=2900);await page.close();
  }
 }finally{await browser.close();}
});

test('Editorial Autofill simulates perfect rooms and unlocks bonuses; exported game has no Autofill',async()=>{
 const {buildEscapeRoomPackage}=await import('../public/js/escape-room-package-builder.mjs');
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();page.setDefaultTimeout(6000);
  const p=projectFor(['predecir_resultado','respuesta_justificacion'],'simbolos',E.extras.map(e=>e.id));p.modo_presentacion='salas';p.misiones.push({...structuredClone(p.misiones[0]),id:'m2',titulo:'Sala 2',bloqueada_inicial:true});p.reward_plan=R.bindPlan(null,p);
  await page.setContent(buildPreviewDocument(p,{editorialReview:true}));
  await page.locator('[data-game-start]:visible').first().click();if(!await page.locator('[data-exp-board]:visible').count())await page.locator('[data-gallery-next]:visible').click();
  // Previous failed attempt and hint must not prevent a simulated clean review.
  await page.locator('[data-exp-key="m1::q0"][data-exp-option="b"]:visible').click();
  await page.locator('[data-question-verify="m1::q0"]').click();
  await page.locator('[data-question-hint="m1::q0"]').click();await page.locator('[data-hint-close]').click();
  const autofill=page.locator('[data-editorial-autofill]');await autofill.click();await autofill.click();
  await page.locator('[data-room-unlock-continue]').click();
  for(const kind of ['descarte','comprobacion','pista']){const button=page.locator(`[data-exp-bonus="${kind}"]:visible`).first();assert.equal(await button.isEnabled(),kind!=='comprobacion');assert.match(await button.getAttribute('aria-label'),/\(1\)/);}
  await page.locator('#expInventory summary').click();assert.match(await page.locator('#expInventory').innerText(),/Sala perfecta/);assert.equal(await page.locator('[data-reward-accessory]').count(),1);
  const pack=buildEscapeRoomPackage(p);
  assert.doesNotMatch(pack.files['index.html'],/data-editorial-autofill|__ESCAPE_ROOM_EDITORIAL_REVIEW__/);
  await page.setContent(buildPreviewDocument(p));assert.equal(await page.locator('[data-editorial-autofill]').count(),0);
 }finally{await browser.close();}
});

test('Partial check ignores empty drag targets and reports the selected assignment without filling answers',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const tileIndex of [0,1]){
   const page=await browser.newPage({viewport:{width:tileIndex===0?390:1100,height:850}});page.setDefaultTimeout(6500);
   const p=projectFor(['predecir_resultado'],'simbolos',['comprobacion']);p.modo_presentacion='salas';
   p.misiones.push({...structuredClone(p.misiones[0]),id:'m2',titulo:'Sala 2',bloqueada_inicial:true,preguntas:[{id:'drag',titulo:'Relaciona',reto:'Relaciona cada número con su nombre.',tipo_interaccion:'drag_drop',interaction_contract_version:1,parejas:['uno','dos','tres','cuatro','cinco','seis'].map((v,i)=>({izquierda:String(i+1),derecha:v,pista:''})),opciones:[],pista:'Compara los números',retroalimentacion_correcta:'Correcto',retroalimentacion_incorrecta:'Revisa'}]});p.reward_plan=R.bindPlan(null,p);
   await page.setContent(buildPreviewDocument(p,{editorialReview:true}));
   const autofill=page.locator('[data-editorial-autofill]');for(let i=0;i<3;i++)await autofill.click();await page.locator('[data-room-unlock-continue]').click();
   const bonus=page.locator('[data-exp-bonus="comprobacion"]');
   const hint=page.locator('[data-question-hint="m2::drag"]');assert.equal(await hint.innerText(),'');assert.ok(await hint.getAttribute('aria-label'));assert.equal(await hint.locator('svg').count(),1);
   const hintRect=await hint.boundingBox(),bonusRect=await bonus.boundingBox();assert.ok(bonusRect.x>hintRect.x);assert.ok(Math.abs(hintRect.y-bonusRect.y)<3);assert.equal(await bonus.evaluate(el=>el.closest('.question-actions')!==null),true);
   const status=page.locator('[data-exp-bonus-status="m2::drag"]');
   assert.equal(await bonus.isDisabled(),true);await bonus.evaluate(el=>el.click());assert.equal(await page.locator('[data-exp-part]').count(),0);assert.match(await bonus.getAttribute('aria-label'),/\(1\)/);
   await page.locator(`[data-drag-tile-index="${tileIndex}"]`).click();await page.locator('[data-drag-target-index="0"]').click();
   assert.equal(await bonus.isEnabled(),true);assert.equal(await bonus.locator('svg').count(),1);assert.equal(await bonus.evaluate(el=>getComputedStyle(el).borderRadius),'50%');assert.equal(await bonus.evaluate(el=>el.getBoundingClientRect().width),44);await bonus.scrollIntoViewIfNeeded();await page.screenshot({path:tileIndex===0?'/private/tmp/pigpen-help-row-mobile.png':'/private/tmp/pigpen-help-row.png'});await bonus.click();assert.equal(await page.locator('[data-exp-part]').count(),1);await page.locator('[data-exp-part="0"]').click();
   assert.match(await status.innerText(),tileIndex===0?/1: Correcto/:/1: Revisa esta parte/);assert.match(await status.innerText(),/Se ha usado 1 comodín/);assert.equal(await bonus.count(),0);
   const game=JSON.parse(await page.evaluate(()=>window.render_game_to_text()));assert.deepEqual(game.currentActivity.questions[0].dragAssignments,{'0':tileIndex});await page.close();
  }
 }finally{await browser.close();}
});

test('Hint opens in a themed dialog, closes with button or Escape and returns focus',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const width of [390,1100]){
   const page=await browser.newPage({viewport:{width,height:850}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
   const p=projectFor(['predecir_resultado']);p.modo_presentacion='salas';p.misiones[0].preguntas[0].pista='Compara las evidencias.\nNo ignores <los datos>.';
   await page.setContent(buildPreviewDocument(p));await page.locator('[data-game-start]:visible').click();if(!await page.locator('[data-exp-board]:visible').count())await page.locator('[data-gallery-next]:visible').click();
   const hint=page.locator('[data-question-hint="m1::q0"]');await hint.click();
   const dialog=page.locator('#questionHintDialog');assert.equal(await dialog.isVisible(),true);assert.equal(await dialog.evaluate(el=>el.matches(':modal')),true);assert.equal(await page.locator('.hint-box').count(),0);
   assert.equal(await page.locator('#questionHintText').innerText(),p.misiones[0].preguntas[0].pista);assert.ok((await dialog.boundingBox()).width<=width-32);
   await page.screenshot({path:width===390?'/private/tmp/pigpen-hint-modal-mobile.png':'/private/tmp/pigpen-hint-modal.png'});
   await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),false);assert.equal(await hint.evaluate(el=>el===document.activeElement),true);
   await hint.click();await page.locator('[data-hint-close]').click();assert.equal(await dialog.isVisible(),false);assert.equal(await hint.evaluate(el=>el===document.activeElement),true);assert.deepEqual(errors,[]);await page.close();
  }
 }finally{await browser.close();}
});

test('Selected multiselect and pattern options remain readable on dark and light panels',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const type of ['seleccion_multiple','completar_patron']){
  const page=await browser.newPage({viewport:{width:900,height:850}});const p=projectFor([type]);p.modo_presentacion='salas';if(type==='seleccion_multiple')p.misiones[0].preguntas[0].interaction_data.targets[0].allowed=['a','c'];
  await page.setContent(buildPreviewDocument(p));await page.locator('[data-game-start]:visible').click();if(!await page.locator('[data-exp-board]:visible').count())await page.locator('[data-gallery-next]:visible').click();
  assert.equal(await page.locator('[data-exp-option]').count(),type==='seleccion_multiple'?4:3);
  await page.locator('[data-exp-option="a"]').click();
  for(const [bg,fg] of [['#20312e','#ecf2ef'],['#ffffff','#172033']]){
   await page.evaluate(([bg,fg])=>{document.documentElement.style.setProperty('--panel',bg);document.documentElement.style.setProperty('--text',fg);},[bg,fg]);
   const ratio=await page.locator('[data-exp-option="a"]').evaluate(el=>{
    const style=getComputedStyle(el);const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');
    const lum=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);const rgb=[...ctx.getImageData(0,0,1,1).data].slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
    const a=lum(style.color),b=lum(style.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
   });assert.ok(ratio>=4.5,'Selected option contrast: '+ratio);
   await page.screenshot({path:'/private/tmp/pigpen-'+type+(bg==='#ffffff'?'-light.png':'-dark.png')});
  }
  if(type==='seleccion_multiple'){
   await page.locator('[data-exp-option="d"]').click();assert.equal(await page.locator('[data-exp-option="d"]').getAttribute('aria-pressed'),'true');
   await page.locator('[data-exp-option="c"]').click();await page.locator('[data-question-verify]:visible').click();assert.equal(await page.locator('[data-room-unlock-continue]').count(),0);
   await page.locator('[data-exp-option="d"]').click();await page.locator('[data-question-verify]:visible').click();await page.locator('[data-room-unlock-continue]').waitFor({state:'visible'});
  }
  else{
   await page.locator('[data-exp-option="b"]').click();assert.equal(await page.locator('[data-exp-option="a"]').getAttribute('aria-pressed'),'false');
   await page.locator('[data-question-verify]:visible').click();assert.equal(await page.locator('[data-room-unlock-continue]').count(),0);
   await page.locator('[data-exp-option="a"]').click();await page.locator('[data-question-verify]:visible').click();
   await page.locator('[data-room-unlock-continue]').waitFor({state:'visible'});
  }
  await page.close();
  }
 }finally{await browser.close();}
});
