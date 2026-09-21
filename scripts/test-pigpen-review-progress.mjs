import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { buildPreviewDocument, buildEscapeRoomPackage } from '../public/js/escape-room-package-builder.mjs';

const browser = await chromium.launch();
try {
 for (const mode of ['salas','menu_secciones']) for (const width of [1280,390]) {
  const context = await browser.newContext({viewport:{width,height:900}});
  const page = await context.newPage(), errors=[];
  page.on('pageerror', e=>errors.push(e.message));
  let project = {titulo:'Same title',idioma:'en-US',clave_final:'SOL',modo_presentacion:mode,
   misiones:[{id:'room',titulo:'Room',contexto_requerido:false,preguntas:[1,2,3].map(i=>({id:'q'+i,tipo_interaccion:'texto',reto:'Identify '+i,respuesta_correcta:'Sun',respuestas_aceptadas:['Sun']}))}]};
  let identity = JSON.stringify(['user','session-a','topic']);
  await page.route('http://progress.test/**',route=>route.fulfill(new URL(route.request().url()).pathname.endsWith('.png')
    ? {contentType:'image/png',body:readFileSync('public/pigpen.png')}
    : {contentType:'text/html',body:buildPreviewDocument(project,{editorialReview:true,progressIdentity:identity})}));
  const key=()=> 'PigPenCreator.reviewProgress.v1.'+encodeURIComponent(identity);
  const stored=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key());
  await page.goto('http://progress.test');
  await page.locator('[data-game-start]').click();
  if(mode==='menu_secciones')await page.locator('[data-menu-mission="room"]').click();
  for(const id of ['q1','q2']) {
   const card=page.locator(`[data-question-key="room::${id}"]`);
   await card.locator('input').fill('Sun');
   await card.locator('[data-question-verify]').click();
  }
  const before=await stored();
  assert.equal(before.completedQuestions.length,2);
  project.titulo='Renamed';project.misiones[0].titulo='New room title';project.theme='ocean';
  await page.reload();
  let after=await stored();
  assert.equal(after.completedQuestions.length,2);assert.equal(after.currentMissionId,'room');
  assert.equal(after.endAtMs,before.endAtMs);assert.equal(after.isStarted,true);
  project.misiones[0].preguntas[0].respuesta_correcta='Moon';
  project.misiones[0].preguntas[0].respuestas_aceptadas=['Moon'];
  await page.reload();after=await stored();
  assert.deepEqual(after.completedQuestions,['room::q2']);assert.equal(after.questionAnswers['room::q1'],undefined);
  assert.equal(after.questionAnswers['room::q2'],'Sun');
  project.misiones[0].preguntas[1].content_revision=1;
  await page.reload();assert.deepEqual((await stored()).completedQuestions,[]);
  project.misiones[0].preguntas.splice(0,1);
  project.misiones[0].preguntas.push({id:'new',tipo_interaccion:'texto',respuesta_correcta:'Star'});
  await page.reload();after=await stored();
  assert.equal(after.questionSignatures['room::q1'],undefined);assert.ok(after.questionSignatures['room::new']);
  const originalIdentity=identity;
  identity=JSON.stringify(['user','session-b','topic']);await page.reload();
  assert.equal((await stored())?.isStarted || false,false);
  identity=originalIdentity;await page.reload();assert.equal((await stored()).isStarted,true);
  await page.locator('[data-question-key="room::q2"]').waitFor({state:'visible'});
  await page.locator('[data-question-key="room::q2"]').scrollIntoViewIfNeeded();
  await page.screenshot({path:`/tmp/pigpen-progress-${mode}-${width}.png`});
  // Expiry stays absolute even while the editor is closed.
  await page.addInitScript(k=>{if(!localStorage.getItem('expire-next'))return;localStorage.removeItem('expire-next');const p=JSON.parse(localStorage.getItem(k));p.endAtMs=Date.now()-1000;localStorage.setItem(k,JSON.stringify(p));},key());
  await page.evaluate(()=>localStorage.setItem('expire-next','1'));
  await page.reload();await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  assert.equal((await stored()).isFinished,true);
  // A reset writes a clean state and must not resurrect an old legacy save.
  await page.locator('[data-game-reset]').first().evaluate(el=>el.click());
  await page.reload();assert.equal((await stored())?.isStarted || false,false);
  const zip=buildEscapeRoomPackage(project);
  assert.match(zip.files['assets/game.js'],/const REVIEW_PROGRESS_ID = ""/);
  assert.deepEqual(errors,[]);
  await context.close();console.log(`PASS review progress ${mode} ${width}`);
 }
 const context=await browser.newContext(),page=await context.newPage();
 const project={titulo:'Legacy unique',clave_final:'SOL',misiones:[{id:'r',preguntas:[{id:'q',respuesta_correcta:'sun'}]}]};
 let identity='';
 await page.route('http://legacy.test/**',route=>route.fulfill({contentType:'text/html',body:buildPreviewDocument(project,{progressIdentity:identity})}));
 await page.goto('http://legacy.test');await page.locator('[data-game-start]').click();
 identity='legacy-session-topic';await page.reload();
 const key='PigPenCreator.reviewProgress.v1.'+encodeURIComponent(identity);
 assert.equal(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).isStarted,key),true);
 await page.locator('[data-game-reset]').first().evaluate(el=>el.click());await page.reload();
 assert.equal(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).isStarted,key),false);
 await context.close();console.log('PASS exact legacy recovery and reset without resurrection');
} finally {await browser.close();}
