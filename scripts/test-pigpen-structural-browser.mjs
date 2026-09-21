import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { buildStructuralGroups } from '../public/js/pigpen-structural-view.mjs';

const sessions=[
  {id:'one',title:'Original session A',topicSummaries:[{id:'same',title:'English first',academicNumber:1,materia:'Inglés',nivel:'Secundaria',grado:'Primero',trimestre:'2'}]},
  {id:'two',title:'Original session B',topicSummaries:[{id:'same',title:'English second',academicNumber:1,materia:'INGLES',nivel:'secundaria',grado:'Segundo',trimestre:'1'},
    {id:'third',title:'Spanish activity',academicNumber:2,materia:'Español',nivel:'Primaria',grado:'Segundo',trimestre:'1'}]},
  {id:'unknown',title:'Without metadata',topicSummaries:[{id:'u',academicNumber:1,title:'Unknown'}]}
];
const groups=buildStructuralGroups(sessions);
assert.equal(groups.length,4);
assert.deepEqual(groups.find(g=>g.title.includes('Inglés')).topics.map(t=>t.sessionId),['one']);
assert.equal(groups.find(g=>g.grado==='Segundo'&&g.nivel==='secundaria').topics[0].sessionId,'two');
assert.equal(buildStructuralGroups(sessions,{materia:'Inglés',nivel:'Primaria'}).length,0);
assert.equal(buildStructuralGroups(sessions,{},'session B').flatMap(g=>g.topics).length,2);
assert.equal(buildStructuralGroups(sessions,{},'english second')[0].topics[0].sessionId,'two');
assert.ok(groups.some(g=>g.title==='Sin nivel · Sin materia · Sin grado'));
const merged=buildStructuralGroups([sessions[0],{id:'another',title:'Another session',topicSummaries:[
  {...sessions[0].topicSummaries[0],materia:'INGLES',nivel:'secundaria',trimestre:'1'}]}]);
assert.equal(merged.length,1);
assert.deepEqual(merged[0].topics.map(t=>t.sessionId),['another','one']);
assert.equal(new Set(merged[0].topics.map(t=>t.referenceKey)).size,2);
const source=fs.readFileSync('public/js/PigPenCreator.js','utf8');
function extract(name){const start=source.search(new RegExp(`^(?:async )?function ${name}\\(`,'m'));assert.ok(start>=0,name);const rest=source.slice(start);return rest.slice(0,rest.slice(1).search(/^(?:async )?function /m)+1);}
const names=['getStructuralGroups','selectedStructuralGroup','syncStructuralViewControls','renderStructuralTopics','renderStructuralPanels',
  'readStructuralViewPreference','toggleStructuralView','normalizeSessionThemeNumber','normalizeSessionTrimesterFilter','getCurrentSessionTopicFilters','confirmRealSessionAction'];
const browser=await chromium.launch();
try {
  for(const width of [1280,390]){
    const page=await browser.newPage({viewport:{width,height:900}});
    await page.route('http://localhost:9356/**',async route=>{
      const path=new URL(route.request().url()).pathname;
      if(path.endsWith('.mjs'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(`public/js/${path.split('/').pop()}`,'utf8')});
      return route.fulfill({contentType:'text/html; charset=utf-8',body:`<body class="er-shell"><main class="er-page"><button id="btnStructuralView" class="er-studio-icon-button" aria-label="Vista estructural" aria-pressed="false">⇄</button><p id="erRealSessionScope" class="er-real-session-scope" hidden></p><h3 id="erSessionsViewHeading" class="er-sessions-view-heading">Sesiones</h3><div id="filters"><input id="search"></div><div id="loading"></div><div id="empty"></div><div id="filteredEmpty"></div><span id="count"></span><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px"><div id="sessions"></div><div id="topics"></div></div><div id="topicEmpty"></div><p id="warning" class="er-empty-inline">No se pudieron verificar todos los temas.</p></main></body>`});
    });
    await page.goto('http://localhost:9356/');
    await page.addStyleTag({content:fs.readFileSync('public/PigPenCreator.css','utf8')});
    await page.evaluate(async({code,sessions})=>{
      Object.assign(globalThis,await import('/pigpen-structural-view.mjs'),await import('/pigpen-topic-transfer.mjs'));
      Object.assign(globalThis,{state:{sessions,topics:[sessions[0].topicSummaries[0]],activeSessionId:'one',activeTopicId:'same',activeSessionMeta:{title:'Original session A'},sessionNameFilter:'normal search',sessionIndexFailures:['unknown']},
        structuralView:{enabled:false,search:'',groupKey:'',navigationBusy:false},
        elements:{sessionList:document.querySelector('#sessions'),topicList:document.querySelector('#topics'),topicEmpty:document.querySelector('#topicEmpty'),sessionNameFilter:document.querySelector('#search'),sessionFilters:document.querySelector('#filters'),sessionsLoading:document.querySelector('#loading'),sessionsEmpty:document.querySelector('#empty'),sessionsFilteredEmpty:document.querySelector('#filteredEmpty'),sessionsCount:document.querySelector('#count')},
        normalizeSheetGrade:v=>v,escapeHtml:s=>String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),escapeHtmlAttr:s=>String(s||'').replaceAll('"','&quot;'),
        isGenerationBusy:()=>false,SESSION_TITLE_DEFAULT:'Sesión',
        renderSessionList:()=>{syncStructuralViewControls();if(structuralView.enabled)renderStructuralPanels();else{elements.sessionList.textContent=state.sessions.map(s=>s.title).join(' / ');elements.sessionNameFilter.value=state.sessionNameFilter;}},
        renderTopicList:()=>{if(structuralView.enabled)renderStructuralTopics();}
      });
      (0,eval)(code);
      document.querySelector('#btnStructuralView').onclick=toggleStructuralView;
      document.querySelector('#search').oninput=e=>{structuralView.search=e.target.value;renderSessionList();};
      renderSessionList();
    },{code:names.map(extract).join('\n'),sessions});
    await page.locator('#btnStructuralView').focus();await page.keyboard.press('Enter');
    assert.equal(await page.locator('#btnStructuralView').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#erSessionsViewHeading').textContent(),'Materia y grado');
    const titles=await page.locator('[data-structural-group] .er-session-title-text').allTextContents();
    assert.ok(titles.includes('Inglés · Primero'));
    assert.ok(titles.every(title=>! /primaria|secundaria|Sin nivel/i.test(title)));
    assert.equal(await page.locator('[data-structural-group]').count(),4);
    assert.deepEqual(await page.locator('[data-structural-topic].er-topic-button').evaluateAll(els=>els.map(el=>el.dataset.structuralSession)),['one']);
    assert.deepEqual(await page.locator('.er-topic-trimester').allTextContents(),['Trimestre 2']);
    assert.match(await page.locator('#erRealSessionScope').textContent(),/Original session A/);
    assert.equal(await page.locator('#erRealSessionScope').isVisible(),false);
    assert.equal(await page.locator('[data-session-action="delete"]').count(),0);
    await page.locator('#search').fill('English second');
    assert.equal(await page.locator('.er-topic-button').count(),1);
    assert.equal(await page.locator('.er-topic-button').getAttribute('data-structural-session'),'two');
    await page.locator('#btnStructuralView').click();
    assert.equal(await page.locator('#search').inputValue(),'normal search');
    await page.locator('#btnStructuralView').click();
    assert.equal(await page.locator('#search').inputValue(),'English second');
    assert.ok(await page.locator('#warning').isVisible());
    await page.screenshot({path:`/tmp/pigpen-structural-${width}.png`});
    assert.equal(await page.locator('.er-topic-title').evaluate(el=>getComputedStyle(el).color),'rgb(20, 32, 51)');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
    assert.equal(await page.evaluate(()=>localStorage.getItem('PigPenCreator.structuralView.v1')),'true');
    await page.reload();
    await page.evaluate(code=>(0,eval)(code),extract('readStructuralViewPreference'));
    assert.equal(await page.evaluate(()=>readStructuralViewPreference()),true);
    await page.evaluate(code=>{
      Object.assign(globalThis,{structuralView:{enabled:readStructuralViewPreference()},state:{},isGenerationBusy:()=>false,renderSessionList:()=>{},renderTopicList:()=>{}});
      (0,eval)(code);toggleStructuralView();
    },extract('toggleStructuralView'));
    await page.reload();
    await page.evaluate(code=>(0,eval)(code),extract('readStructuralViewPreference'));
    assert.equal(await page.evaluate(()=>readStructuralViewPreference()),false);
    console.log(`PASS structural preference survives reload in both modes ${width}px`);
    await page.close();console.log(`PASS structural browser ${width}px: groups, order, search isolation, source labels, keyboard and contrast`);
  }
}finally{await browser.close();}
