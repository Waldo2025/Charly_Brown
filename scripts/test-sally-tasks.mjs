import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
const root=path.resolve('public');
const server=createServer(async(req,res)=>{try{const file=path.join(root,new URL(req.url,'http://local').pathname);res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.route('**/js/SallyBrownEditor.js',r=>r.fulfill({body:''}));await page.route('**/js/sidebar.js',r=>r.fulfill({body:''}));
 await page.goto(`http://127.0.0.1:${server.address().port}/SallyBrownEditor.html`);
 await page.evaluate(async()=>{
	  const el=id=>document.getElementById(id);el('sallyAccessGate').remove();el('sallyApp').hidden=false;el('sallyResultsPanel').hidden=false;el('sallyEndpoints').hidden=false;
  const {installTasks}=await import('/js/sally-tasks.js');
  window.calls=[];window.historyWrites=[];window.fail=false;window.hold=false;
  window.taskData={id:'t1',title:'Nota docente',status:'draft',messages:[],plan:[],artifacts:[],attachments:[]};
  window.mockState={activeId:'project',conversationId:'c1',user:{uid:'alice'},chatThread:'unified',workflowBusy:false,agentAvailable:true,history:[],attachments:[],conversations:{open(){},stash(){}},remote:{async taskRequest(p,b){calls.push({p,b});if(p.startsWith('?'))return {tasks:[taskData]};if(p.endsWith('/messages')){if(window.hold)await new Promise(r=>window.release=r);if(window.fail)throw Error('Error de guardado');taskData.messages.push({id:b.id,text:b.text,role:'user',createdAt:new Date().toISOString()});taskData.attachments=structuredClone(b.attachments);return structuredClone(taskData);}return structuredClone(taskData);}}};
  window.ui=installTasks({state:mockState,el,toast:t=>window.lastToast=t,templates:()=>[{id:'tpl',name:'Nota del maestro',version:2,html:'<aside style="padding:12px;color:#345">{{texto}}</aside>'}],uploadFiles:async()=>{},saveContext:async()=>{},record:async entry=>{if(window.hold)await new Promise(r=>window.release=r);if(window.fail)throw Error('Error de guardado');historyWrites.push(entry);return {...entry,id:'context1'};}});
  await ui.refresh();
 });
 await page.fill('#sallyTargetCourse','https://aprende.asc.education/course/view.php?id=496');await page.check('#sallyNoModel');
	 await page.fill('#sallyBrief','Analiza las notas existentes');await page.evaluate(()=>ui.send());await page.waitForFunction(()=>document.getElementById('sallyBrief').value==='');assert.match(await page.locator('#sallyTaskHistory').innerText(),/Analiza las notas existentes/);
	 await page.evaluate(()=>ui.activity('Leyendo pestaña Chapter 5…'));assert.match(await page.locator('.sally-agent-message--activity').innerText(),/Leyendo pestaña Chapter 5/);assert.equal(await page.locator('.sally-agent-message--activity').getAttribute('aria-busy'),'true');assert.equal(await page.locator('.sally-agent-activity__dots i').count(),3);await page.evaluate(()=>ui.activity(''));assert.equal(await page.locator('.sally-agent-message--activity').count(),0);
	 await page.fill('#sallyBrief','Mensaje optimista');await page.evaluate(()=>{window.hold=true;window.pendingSend=ui.send();});await page.waitForFunction(()=>document.getElementById('sallyBrief').value===''&&document.getElementById('sallyTaskHistory').innerText.includes('Mensaje optimista'));assert.equal(await page.locator('.sally-agent-message.is-pending').getAttribute('aria-busy'),'true');await page.evaluate(()=>{window.hold=false;window.release();});await page.evaluate(()=>window.pendingSend);await page.waitForFunction(()=>!document.querySelector('.sally-agent-message.is-pending'));
	 assert.equal(await page.locator('.sally-agent-message--user p').first().evaluate(node=>getComputedStyle(node).color),'rgb(250, 250, 250)');
	 assert.equal(await page.locator('#sallyBuildPlan').evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(24, 24, 27)');
	 assert.equal(await page.locator('.sally-chat-composer').evaluate(node=>getComputedStyle(node).position),'relative');
	 assert.ok(await page.evaluate(()=>{const pane=document.getElementById('sallyBriefPane').getBoundingClientRect(),composer=document.querySelector('.sally-chat-composer').getBoundingClientRect();return pane.bottom-composer.bottom<=14;}),'Composer stays at the bottom of the chat pane');
	 for(const width of [300,370,520]){await page.evaluate(value=>document.documentElement.style.setProperty('--sally-right',value+'px'),width);assert.ok(await page.evaluate(()=>{const pane=document.getElementById('sallyBriefPane').getBoundingClientRect(),composer=document.querySelector('.sally-chat-composer').getBoundingClientRect();return composer.top>=pane.top&&composer.bottom<=pane.bottom&&composer.left>=pane.left&&composer.right<=pane.right;}),`Composer remains inside the resized ${width}px panel`);}
	 await page.setViewportSize({width:1440,height:520});assert.ok(await page.evaluate(()=>{const pane=document.getElementById('sallyBriefPane').getBoundingClientRect(),composer=document.querySelector('.sally-chat-composer').getBoundingClientRect();return composer.top>=pane.top&&composer.bottom<=pane.bottom;}),'Composer remains visible in a short viewport');await page.setViewportSize({width:1440,height:1000});
 await page.fill('#sallyBrief','No perder este mensaje');await page.evaluate(()=>window.fail=true);await page.evaluate(()=>ui.send().catch(e=>window.lastToast=e.message));await page.waitForFunction(()=>window.lastToast==='Error de guardado');assert.equal(await page.inputValue('#sallyBrief'),'No perder este mensaje');await page.evaluate(()=>window.fail=false);
 await page.click('#sallyTaskAdd');await page.getByRole('button',{name:'Nota del maestro',exact:true}).click();assert.equal(await page.locator('#sallyTaskTemplatePreview').evaluate(node=>node.tagName),'DIV');assert.equal(await page.evaluate(()=>document.getElementById('sallyTaskTemplatePreview').shadowRoot.querySelector('script')),null);await page.click('#sallyTaskAttachTemplate');assert.match(await page.locator('#sallyTaskTags').innerText(),/Nota del maestro/);
 await page.evaluate(()=>ui.send());await page.waitForFunction(()=>document.getElementById('sallyBrief').value==='');assert.equal(await page.evaluate(()=>taskData.attachments[0].version),2);
	 await page.evaluate(()=>document.getElementById('sallyResultsPanel').hidden=true);await page.screenshot({path:'artifacts/sally-task-panel-desktop.png'});await page.locator('#sallyConversationMenu').evaluate(node=>node.open=true);await page.screenshot({path:'artifacts/sally-chat-menu-desktop.png'});await page.locator('#sallyConversationMenu').evaluate(node=>node.open=false);await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.getElementById('sallyBriefPane').classList.add('is-open'));await page.screenshot({path:'artifacts/sally-task-panel-mobile.png'});
 await page.evaluate(async()=>{mockState.conversationId='c2';taskData.messages=[];await ui.refresh();});assert.equal(await page.locator('#sallyTaskHistory').innerText(),'');
 await page.evaluate(()=>ui.dispose());console.log('PASS: unified MCP composer, failed saves, versioned template chips and conversation isolation.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
