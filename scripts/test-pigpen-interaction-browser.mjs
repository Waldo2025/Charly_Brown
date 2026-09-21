import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { buildPreviewDocument } from '../public/js/escape-room-package-builder.mjs';
const project = { idioma:'es-419', modo_presentacion:'menu_secciones', titulo:'Prueba de tipos', clave_final:'SOL', misiones:[{id:'room',titulo:'Sala',contexto:'Observa la imagen y completa la frase.', preguntas:[
  {id:'visual',titulo:'Multimedia',reto:'Selecciona el color.',tipo_interaccion:'multimedia',interaction_contract_version:1,subtipo_respuesta:'frase_corta',opciones:['Rojo','Azul','Verde','Amarillo'],respuesta_correcta:'Rojo',media:{tipo:'imagen',url:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="50" height="50"%3E%3Crect width="50" height="50" fill="red"/%3E%3C/svg%3E'}},
  {id:'blank',titulo:'Completar',reto:'Completa la frase.',tipo_interaccion:'completar_espacio',interaction_contract_version:1,subtipo_respuesta:'palabra',texto_con_hueco:'El ___ ilumina la Tierra.',respuesta_correcta:'Sol'}
]}]};
const browser = await chromium.launch({headless:true});
try {
 for(const width of [1280,390]) {
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.setContent(buildPreviewDocument(project,{editorialReview:true}));
  await page.locator('[data-game-start]').click();
  await page.locator('[data-menu-mission="room"]').click();
  await page.locator('[data-briefing-ack="room"]').click();
  const visual=page.locator('[data-question-key="room::visual"]');
  assert.equal(await visual.locator('[data-question-choice]').count(),4);
  assert.equal(await visual.locator('[data-question-answer]').count(),0);
  const blank=page.locator('.fill-blank-input');
  await blank.fill('Luna');
  await page.locator('[data-question-key="room::blank"] [data-question-verify]').click();
  assert.equal(await blank.getAttribute('aria-invalid'),'true');
  await blank.fill('Sol');
  await page.locator('.fill-blank-sentence').screenshot({path:`/tmp/pigpen-blank-${width}.png`});
  assert.ok(await blank.evaluate(el=>el.getBoundingClientRect().right<=innerWidth));
  await page.close();
 }
 console.log('Interaction browser OK');
} finally {await browser.close();}
