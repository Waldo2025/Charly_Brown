import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { buildEditorialWorkbook, readEditorialWorkbook, previewEditorialImport } from '../public/js/escape-room-editorial-workbook.mjs';
import { normalizeQuestion, validateQuestionAnswer } from '../public/js/escape-room-creator-model.mjs';
import { closeGeneratedAnswer, questionInteractionIssues } from '../public/js/escape-room-question-policy.mjs';
import { buildPreviewDocument, buildEscapeRoomPackage } from '../public/js/escape-room-package-builder.mjs';
import { buildMoodleAnswerKeyHtml } from '../public/js/escape-room-answer-export.mjs';
const raw = { id:'bank', titulo:'Completa la lectura', reto:'', tipo_interaccion:'completar_espacio',
  texto_con_hueco:'El ___ ilumina la Tierra. La ___ refleja su luz. Otro ___ aparece en el dibujo.',
  parejas:[{izquierda:'1',derecha:'Sol'},{izquierda:'2',derecha:'Luna'},{izquierda:'3',derecha:'Sol'}], opciones:['Nube'] };
const question = normalizeQuestion(closeGeneratedAnswer(raw, 'completar_espacio', true));
assert.equal(question.interaction_contract_version,2);
assert.equal(questionInteractionIssues(question).length,0);
assert.equal(validateQuestionAnswer(question,['Sol','Luna','Sol']),true);
assert.equal(validateQuestionAnswer(question,['Luna','Sol','Sol']),false);
assert.ok(questionInteractionIssues({...question,parejas:[]}).length);
assert.ok(questionInteractionIssues({...question,texto_con_hueco:'Sin huecos'}).length);
assert.ok(questionInteractionIssues({...question,parejas:[{izquierda:'2',derecha:'Sol'}]}).length);
const legacy = normalizeQuestion({...raw,interaction_contract_version:1,parejas:[],texto_con_hueco:'El ___ brilla.',respuesta_correcta:'Sol'});
assert.equal(validateQuestionAnswer(legacy,'Sol'),true);
const single=normalizeQuestion({...question,id:'single',texto_con_hueco:'La ___ refleja la luz.',parejas:[{izquierda:'1',derecha:'Luna'}],opciones:['Nube']});
assert.equal(questionInteractionIssues(single,{generated:true}).length,0);
assert.ok(questionInteractionIssues({...single,opciones:[]},{generated:true}).length);
const base={titulo:'Word bank QA',idioma:'es-419',clave_final:'LUZ',misiones:[{id:'room',titulo:'La luz',contexto:'El Sol emite luz y la Luna la refleja.',preguntas:[question,{...legacy,id:'legacy'},single]}]};
assert.match(buildMoodleAnswerKeyHtml({topics:[{project:base}]}).html,/Luna/);
const require=createRequire(import.meta.url), XLSX=require('../public/vendor/xlsx/xlsx.full.min.js');
const topics=[{id:'topic',academicNumber:1,project:base}];
const workbook=buildEditorialWorkbook(XLSX,{sessionId:'session',topics});
const pairRows=XLSX.utils.sheet_to_json(workbook.Sheets.Textos,{header:1});
assert.ok(pairRows.some(row=>row.includes('Luna')));
const editorial=readEditorialWorkbook(XLSX,XLSX.write(workbook,{type:'array',bookType:'xlsx'}));
assert.deepEqual(previewEditorialImport(editorial,{sessionId:'session',topics}).errors,[]);
const answerRow=pairRows.findIndex(row=>row[4]==='Luna');
workbook.Sheets.Textos[XLSX.utils.encode_cell({r:answerRow,c:4})].v='satélite';
const corrected=previewEditorialImport(readEditorialWorkbook(XLSX,XLSX.write(workbook,{type:'array',bookType:'xlsx'})),{sessionId:'session',topics});
assert.deepEqual(corrected.errors,[]);
assert.equal(corrected.nextTopics[0].project.misiones[0].preguntas[0].parejas[1].derecha,'satélite');
assert.equal(corrected.nextTopics[0].project.misiones[0].preguntas[0].interaction_contract_version,2);
const source=readFileSync('public/js/PigPenCreator.js','utf8');
const start=source.indexOf('function updateQuestionField('),end=source.indexOf('\nfunction ',start+1);
const editing=structuredClone(question), editor=vm.createContext({getQuestionAt:()=>editing,scheduleOutputRefresh:()=>{}});
vm.runInContext(source.slice(start,end),editor);
editor.updateQuestionField(0,0,'word_bank_answers','Sol\nLuna\nSol');
assert.equal(editing.parejas.length,3);
assert.equal(editing.parejas[2].izquierda,'3');
editor.updateQuestionField(0,0,'word_bank_distractors','Nube\nMar');
assert.equal(editing.opciones.length,2);
const browser=await chromium.launch();
try {
 for(const mode of ['salas','menu_secciones']) for(const width of [1280,390]) for(const output of ['preview','zip']) {
  const project={...base,modo_presentacion:mode};
  const page=await browser.newPage({viewport:{width,height:900},hasTouch:width===390});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  if(output==='preview') await page.setContent(buildPreviewDocument(project));
  else {
   const pkg=buildEscapeRoomPackage(project), zip=new JSZip();
   Object.entries(pkg.files).forEach(([path,data])=>zip.file(path,data));
   zip.file('logo.png',readFileSync('public/pigpen.png'));
   const archive=await JSZip.loadAsync(await zip.generateAsync({type:'nodebuffer'}));
   await page.route('http://wordbank.test/**',async route=>{
    const path=new URL(route.request().url()).pathname.slice(1)||'index.html',file=archive.file(path);
    await route.fulfill({status:file?200:404,contentType:path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.html')?'text/html':'application/octet-stream',body:file?await file.async('nodebuffer'):''});
   });
   await page.goto('http://wordbank.test/index.html');
  }
  await page.locator('[data-game-start]').click();
  if(mode==='menu_secciones')await page.locator('[data-menu-mission="room"]').click();
  await page.locator('[data-briefing-ack="room"]').click();
  const card=page.locator('[data-question-key="room::bank"]');
  assert.equal(await card.locator('input').count(),0);
  assert.equal(await card.locator('.word-bank-slot').count(),3);
  assert.equal(await card.locator('.drag-match-tile').count(),4);
  assert.equal(await page.locator('.fill-blank-input').count(),1);
  const passage=await card.locator('.word-bank-passage').boundingBox(),tray=await card.locator('.drag-match-tray').boundingBox();
  assert.ok(tray.y>=passage.y+passage.height);
  await card.screenshot({path:`/tmp/pigpen-wordbank-${width}-${mode}-${output}.png`});
  await card.locator('[data-drag-tile-index="3"]').click();
  await card.locator('[data-drag-target-index="0"]').click();
  await card.locator('[data-question-verify]').click();
  await card.locator('[data-drag-tile-index="3"]').waitFor({state:'visible'});
  assert.ok(!(await card.getAttribute('class')).includes('is-complete'));
  // Click/touch alternative and keyboard; use the identical word's other token.
  for(const [tile,target] of [[2,0],[1,1],[0,2]]) {
   const token=card.locator(`[data-drag-tile-index="${tile}"]`);
   const slot=card.locator(`[data-drag-target-index="${target}"]`);
   if(width===1280 && target===0) {
    await token.scrollIntoViewIfNeeded();
    const from=await token.boundingBox(),to=await slot.boundingBox();
    await page.mouse.move(from.x+from.width/2,from.y+from.height/2);
    await page.mouse.down();await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:12});await page.mouse.up();
   } else {
    await token.focus();await page.keyboard.press('Enter');
    await slot.focus();await page.keyboard.press('Enter');
   }
   assert.match(await slot.textContent(), /Sol|Luna/);
   if(output==='zip' && width===1280 && target===0) {
    await page.reload();
    await card.locator('[data-drag-target-index="0"]').waitFor({state:'visible'});
    assert.match(await card.locator('[data-drag-target-index="0"]').textContent(),/Sol/);
   }
  }
  await card.locator('[data-question-verify]').click();
  assert.ok((await card.getAttribute('class')).includes('is-complete'));
  const singleCard=page.locator('[data-question-key="room::single"]');
  assert.equal(await singleCard.locator('.word-bank-slot').count(),1);
  assert.equal(await singleCard.locator('.drag-match-tile').count(),2);
  await singleCard.locator('[data-drag-tile-index="0"]').focus();await page.keyboard.press('Enter');
  await singleCard.locator('[data-drag-target-index="0"]').focus();await page.keyboard.press('Enter');
  await singleCard.locator('[data-question-verify]').click();
  assert.ok((await singleCard.getAttribute('class')).includes('is-complete'));
  assert.equal(errors.length,0,errors.join('\n'));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.close();console.log(`PASS word bank ${mode} ${width} ${output}`);
 }
} finally {await browser.close();}
