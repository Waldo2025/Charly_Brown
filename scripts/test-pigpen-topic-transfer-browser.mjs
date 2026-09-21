import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const source=fs.readFileSync('public/js/PigPenCreator.js','utf8');
const html=fs.readFileSync('public/PigPenCreator.html','utf8');
const modal=html.slice(html.indexOf('    <div class="modal fade er-transfer-modal"'),html.indexOf('    <script type="module" src="js/PigPenCreator.js'));
function extract(name) {
  const start=source.search(new RegExp(`^(?:async )?function ${name}\\(`,'m'));
  assert.ok(start>=0,name);
  const rest=source.slice(start); const end=rest.slice(1).search(/^(?:async )?function /m);
  return rest.slice(0,end+1);
}
const functions=['normalizeString','getTopicTitle','sortTopics','buildTopicSummary','renderTopicList','normalizeSessionNameSearch',
  'renderTopicTransferDestinations','openTopicTransfer','submitTopicTransfer'].filter(n=>n!=='normalizeString').map(extract).join('\n');
const browser=await chromium.launch();
try {
  for (const width of [1280,390]) {
    const page=await browser.newPage({viewport:{width,height:900}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('http://localhost:9355/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<meta charset="UTF-8"><body class="er-shell"><main class="er-page"><div id="workspace" style="width:340px;max-width:100%;background:white;padding:12px"><div id="topics"></div><div id="empty"></div></div></main>${modal}</body>`}));
    await page.goto('http://localhost:9355/');
    await page.addStyleTag({content:fs.readFileSync('public/vendor/bootstrap/bootstrap.min.css','utf8')});
    await page.addStyleTag({content:fs.readFileSync('public/PigPenCreator.css','utf8')});
    await page.addScriptTag({content:fs.readFileSync('public/vendor/bootstrap/bootstrap.bundle.min.js','utf8')});
    await page.evaluate(async ({functions,policy})=>{
      Object.assign(globalThis,await import('data:text/javascript,'+encodeURIComponent(policy)));
      Object.assign(globalThis,{topicTransferUi:null,saveFailure:false,transfers:[],
        state:{currentUser:{uid:'owner'},activeSessionId:'source',activeTopicId:'a',activeSessionMeta:{title:'Origen',status:'draft'},saveState:'saved',
          sessions:[{id:'source',title:'Origen',status:'draft'},{id:'destination',title:'Inglés de Segundo',status:'draft'},{id:'published',title:'No disponible',status:'published'}],
          topics:[{id:'a',academicNumber:1,title:'First English escape room',project:{titulo:'First English escape room',trimestre:'1',materia:'Inglés',grado:'Segundo'}},
            {id:'b',academicNumber:1,title:'Another escape room',project:{titulo:'Another escape room',trimestre:'1',materia:'Inglés',grado:'Segundo'}},
            {id:'c',academicNumber:2,title:'Segundo trimestre',project:{titulo:'Segundo trimestre',trimestre:'2',materia:'Español',grado:'Primero'}}]},
        elements:{topicList:document.querySelector('#topics'),topicEmpty:document.querySelector('#empty'),studioWorkspace:document.querySelector('#workspace')},
        SESSION_TITLE_DEFAULT:'Sesión',normalizeString:(v,f='')=>typeof v==='string'&&v.trim()?v.trim():f,
        escapeHtml:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
        escapeHtmlAttr:s=>String(s).replaceAll('"','&quot;'),isGenerationBusy:()=>Boolean(topicTransferUi?.busy),isPublishedSession:()=>state.activeSessionMeta.status==='published',
        flushPendingTopicSave:async()=>{state.saveState=saveFailure?'error':'saved';state.sessionSaveQueued=false;},persistActiveSession:async()=>{state.saveState=saveFailure?'error':'saved';},
        loadSessionsFromFirebase:async()=>{},syncActionButtons:()=>{},
        getTopicTransferService:()=>({completed:async()=>null,transfer:async args=>{transfers.push(args);await new Promise(r=>setTimeout(r,150));return {destinationId:args.destinationId,topicId:args.operationId};}})
      });
      (0,eval)(functions);
      renderTopicList();
      document.querySelector('#topics').addEventListener('click',e=>{
        const button=e.target.closest('[data-topic-transfer]');
        if(button){button.closest('details').open=false;openTopicTransfer(button.dataset.transferTopicId,button.dataset.topicTransfer);}
      });
      document.querySelector('#erTopicTransferForm').addEventListener('submit',submitTopicTransfer);
      document.querySelector('#erTransferSearch').addEventListener('input',renderTopicTransferDestinations);
      document.querySelector('#erTopicTransferModal').addEventListener('hide.bs.modal',e=>{if(topicTransferUi?.busy)e.preventDefault();});
    },{functions,policy:fs.readFileSync('public/js/pigpen-topic-transfer.mjs','utf8')});
    assert.deepEqual(await page.locator('.er-topic-trimester').allTextContents(),['Trimestre 1','Trimestre 2']);
    for (const selector of ['.er-topic-button.is-active .er-topic-title','.er-topic-button:not(.is-active) .er-topic-title']) {
      const title=page.locator(selector).first();
      for(const action of ['normal','hover','focus']) {
        if(action==='hover')await title.hover();
        if(action==='focus')await title.locator('..').locator('..').focus();
        const color=await title.evaluate(el=>getComputedStyle(el).color);
        assert.equal(color,'rgb(20, 32, 51)','Title uses dark studio text in every state');
      }
    }
    await page.locator('.er-topic-actions summary').first().focus();
    await page.keyboard.press('Enter');
    await page.locator('[data-topic-transfer="move"]').first().click();
    await page.locator('#erTopicTransferModal').waitFor({state:'visible'});
    assert.match(await page.locator('#erTransferSummary').textContent(),/Trimestre 1/);
    assert.equal(await page.locator('#erTransferDestination option').count(),2,'Only other draft sessions');
    assert.ok(await page.locator('#erTransferOpenDestination').isHidden());
    await page.locator('#erTransferSearch').fill('Segundo');
    await page.selectOption('#erTransferDestination','destination');
    await page.evaluate(()=>{saveFailure=true;state.sessionSaveQueued=true;});
    await page.locator('#erTransferSubmit').click();
    await page.waitForFunction(()=>document.querySelector('#erTransferStatus').textContent.includes('No se guardaron'));
    assert.equal(await page.evaluate(()=>transfers.length),0,'Failed save blocks transfer');
    await page.evaluate(()=>{saveFailure=false;state.sessionSaveQueued=true;});
    await page.locator('#erTransferSubmit').click();
    await page.waitForFunction(()=>Boolean(topicTransferUi.result));
    assert.equal(await page.evaluate(()=>transfers.length),1);
    assert.ok(await page.locator('#erTransferSubmit').isDisabled(),'Successful operation cannot double-submit');
    assert.ok(await page.locator('#erTransferOpenDestination').isVisible());
    const box=await page.locator('.modal-content').boundingBox();
    assert.ok(box.x>=0&&box.x+box.width<=width+1,'Compact modal fits viewport');
    await page.screenshot({path:`/tmp/pigpen-topic-transfer-${width}.png`});
    assert.deepEqual(errors,[]);
    console.log(`PASS: transfer browser ${width}px: grouping, contrast, keyboard, destination filtering, failed save and retry`);
    await page.close();
  }
} finally {await browser.close();}
