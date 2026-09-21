import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
const root=path.resolve('public');
const server=createServer(async(req,res)=>{try{const file=path.join(root,new URL(req.url,'http://local').pathname);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.route('**/js/SallyBrownEditor.js',r=>r.fulfill({body:''}));await page.route('**/js/sidebar.js',r=>r.fulfill({body:''}));
 await page.goto(`http://127.0.0.1:${server.address().port}/SallyBrownEditor.html`);
 await page.evaluate(async()=>{
  const el=id=>document.getElementById(id);el('sallyAccessGate').remove();el('sallyApp').hidden=false;el('sallyResultsPanel').hidden=false;
  const {installTasks}=await import('/js/sally-tasks.js');
  window.calls=[];window.historyWrites=[];window.fail=false;window.hold=false;
  window.taskData={id:'t1',title:'Nota docente',status:'draft',messages:[],plan:[],artifacts:[],attachments:[]};
  window.mockState={activeId:'project',conversationId:'c1',user:{uid:'alice'},chatThread:'target',agentAvailable:true,history:[],attachments:[],conversations:{open(){},stash(){}},remote:{async taskRequest(p,b){calls.push({p,b});if(p.startsWith('?'))return {tasks:[taskData]};if(p.endsWith('/messages')){if(window.hold)await new Promise(r=>window.release=r);if(window.fail)throw Error('Error de guardado');taskData.messages.push({id:b.id,text:b.text,role:'user',createdAt:new Date().toISOString()});taskData.attachments=structuredClone(b.attachments);return structuredClone(taskData);}return structuredClone(taskData);}}};
  window.ui=installTasks({state:mockState,el,toast:t=>window.lastToast=t,templates:()=>[{id:'tpl',name:'Nota del maestro',version:2,html:'<aside style="padding:12px;color:#345">{{texto}}</aside>'}],uploadFiles:async()=>{},saveContext:async()=>{},record:async entry=>{if(window.hold)await new Promise(r=>window.release=r);if(window.fail)throw Error('Error de guardado');historyWrites.push(entry);return {...entry,id:'context1'};}});
  await ui.refresh();
 });
 await page.fill('#sallyBrief','Contexto guardado');await page.evaluate(()=>ui.sendContext());assert.equal(await page.inputValue('#sallyBrief'),'');
 await page.fill('#sallyBrief','Conservar si falla');await page.evaluate(()=>{window.fail=true;return ui.sendContext().catch(()=>{});});assert.equal(await page.inputValue('#sallyBrief'),'Conservar si falla');
 await page.evaluate(()=>{window.fail=false;window.hold=true;void ui.sendContext();});await page.waitForFunction(()=>Boolean(window.release));await page.fill('#sallyBrief','Nuevo texto mientras guarda');await page.evaluate(()=>{release();window.hold=false;});await page.waitForFunction(()=>!mockState.workflowBusy);assert.equal(await page.inputValue('#sallyBrief'),'Nuevo texto mientras guarda');
 await page.selectOption('#sallyTaskSelect','t1');await page.waitForFunction(()=>!document.getElementById('sallyTaskSend').disabled);
 await page.fill('#sallyTaskMessage','Analiza las notas existentes');await page.click('#sallyTaskSend');await page.waitForFunction(()=>document.getElementById('sallyTaskMessage').value==='');assert.match(await page.locator('#sallyTaskHistory').innerText(),/Analiza las notas existentes/);
 await page.fill('#sallyTaskMessage','No perder este mensaje');await page.evaluate(()=>window.fail=true);await page.click('#sallyTaskSend');await page.waitForFunction(()=>window.lastToast==='Error de guardado');assert.equal(await page.inputValue('#sallyTaskMessage'),'No perder este mensaje');await page.evaluate(()=>window.fail=false);
 await page.click('#sallyTaskAdd');await page.getByRole('button',{name:'Nota del maestro',exact:true}).click();assert.equal(await page.getAttribute('#sallyTaskTemplatePreview','sandbox'),'');await page.click('#sallyTaskAttachTemplate');assert.match(await page.locator('#sallyTaskTags').innerText(),/Nota del maestro/);
 await page.click('#sallyTaskSend');await page.waitForFunction(()=>document.getElementById('sallyTaskMessage').value==='');assert.equal(await page.evaluate(()=>taskData.attachments[0].version),2);
 await page.evaluate(async()=>{mockState.conversationId='c2';await ui.refresh();});assert.equal(await page.inputValue('#sallyTaskMessage'),'');assert.equal(await page.locator('#sallyTaskHistory').innerText(),'');
 await page.screenshot({path:'artifacts/sally-task-panel-desktop.png'});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/sally-task-panel-mobile.png'});
 await page.evaluate(()=>ui.dispose());console.log('PASS: context/task composer acknowledgement, failed saves, concurrent typing, versioned template chips and conversation isolation.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
