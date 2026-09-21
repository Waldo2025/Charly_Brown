import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { chromium } from 'playwright';
const source=readFileSync('public/js/PigPenCreator.js','utf8');
function extract(name){const start=source.indexOf(`function ${name}(`),end=source.indexOf('\nfunction ',start+1);const asyncEnd=source.indexOf('\nasync function ',start+1);return source.slice(start,Math.min(...[end,asyncEnd].filter(n=>n>=0)));}
const topic={id:'same-id',topicId:'same-id',sessionId:'other-session',title:'Solo este tema',sessionTitle:'Origen',academicNumber:2,trimestre:'1'};
const elements={topicList:{innerHTML:''},topicEmpty:{classList:{toggle(){}}}};
const ctx=vm.createContext({elements,structuralView:{enabled:false},state:{topics:[topic],activeSessionId:'active-session',activeTopicId:'same-id',sessions:[{id:'other-session',status:'draft'}]},
 sortTopics:v=>v,topicAcademic:v=>v,getTopicTitle:v=>v.title,escapeHtml:v=>String(v??''),escapeHtmlAttr:v=>String(v??''),
 isPublishedSession:()=>false,selectedStructuralGroup:()=>({topics:[topic]}),topicReferenceKey:(s,t)=>s+'/'+t});
vm.runInContext(extract('renderTopicList')+'\n'+extract('renderStructuralTopics'),ctx);
const listenerStart=source.indexOf('elements.topicList?.addEventListener("click", (event) => {');
const listenerEnd=source.indexOf('\n});',listenerStart)+4;
const listener=source.slice(listenerStart,listenerEnd);
const browser=await chromium.launch();
try {
 for(const structural of [false,true])for(const width of [1280,390]) {
  ctx.structuralView.enabled=structural;ctx.renderTopicList();
  const page=await browser.newPage({viewport:{width,height:800}});
  await page.setContent(`<style>${readFileSync('public/PigPenCreator.css','utf8')}</style><div id="topics">${elements.topicList.innerHTML}</div>`);
  await page.evaluate(code=>{window.elements={topicList:document.querySelector('#topics')};window.deleteCalls=[];window.deleteTopicFromMenu=(s,t)=>deleteCalls.push([s,t]);(0,eval)(code);},listener);
  await page.locator('summary').focus();await page.keyboard.press('Enter');
  const button=page.getByRole('button',{name:'Eliminar tema'});assert.equal(await button.isVisible(),true);
  await button.focus();await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(()=>deleteCalls),[[structural?'other-session':'active-session','same-id']]);
  await page.close();console.log(`PASS delete menu ${structural?'structural':'normal'} ${width}: keyboard and exact session/topic`);
 }
} finally {await browser.close();}
