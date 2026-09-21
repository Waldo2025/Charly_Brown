import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { chromium } from 'playwright';
import * as topicPolicy from '../public/js/pigpen-topic-transfer.mjs';

const source = fs.readFileSync('public/js/PigPenCreator.js', 'utf8');
function extract(name) {
  const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
  assert.ok(start >= 0, name);
  const rest = source.slice(start);
  const end = rest.slice(1).search(/^(?:async )?function /m);
  return end < 0 ? rest : rest.slice(0, end + 1);
}
const names = ['normalizeTopicNumber', 'getCurrentAcademicNumber', 'getTopicTitle', 'sortTopics', 'buildTopicSummary',
  'buildTopicPayload', 'updateSessionTopicIndex', 'syncLocalSessionIndex', 'rebuildSessionTopicIndexes', 'retrySessionTopicIndexes',
  'createTopicDocument', 'normalizeSessionThemeNumber', 'getSessionThemeFilterValues',
  'getSessionAcademicFilterValue', 'normalizeSessionTrimesterFilter', 'normalizeSessionNameSearch',
  'getFilteredSessions', 'getCurrentSessionTopicFilters', 'loadSessionIntoEditor', 'buildInheritedTopicFormState', 'createNewTopicFromDialog', 'runWithConcurrency'];
const implementation = names.map(extract).join('\n');
const setup = `
var state = { sessions: [], topics: [], activeTopicId: '', activeSessionId: '', activeSessionMeta: {status:'draft'}, sessionIndexFailures: [], sessionThemeFilter: '', currentUser:{uid:'test'} };
var structuralView = {enabled:false};
var syncStructuralViewControls = () => {};
var records = {}, writes = [], notices = [], renderCount = 0, selected = '', counter = 1;
var elements = {newTopicNumber:{value:'2'}, newTopicError:{textContent:''}, btnAddTopic:null};
var SESSION_SCHEMA_VERSION = 2, SESSION_TITLE_DEFAULT = 'Session', ESCAPE_ROOM_COLLECTION='sessions', TOPICS_SUBCOLLECTION='topics', db={};
var normalizeString = (v,f='') => typeof v === 'string' && v.trim() ? v.trim() : f;
var withDefaultRoutes = p => p;
var serverTimestamp = () => 1;
var doc = (...args) => args.slice(1).join('/');
var collection = doc;
var updateDoc = async (path, patch) => writes.push({path,patch});
var addDoc = async (path, payload) => {const id='topic-'+(++counter); (records[path.split('/')[1]] ||= []).push({id,...payload}); return {id};};
var fetchSessionTopics = async id => structuredClone(records[id] || []);
var renderSessionList = () => {renderCount++;};
var renderTopicList = () => {};
var getSessionAcademicMetadata = () => ({nivel:'Primaria',grado:'Primero',trimestre:'1',materia:'Español'});
var serializeFormState = () => ({nivelSelect:'Primaria',gradoSelect:'Primero',trimestreSelect:'1',materiaSelect:'Español',unidadTemaSelect:'1'});
var closeSessionMenu = () => {};
var flushPendingTopicSave = async () => {};
var setActiveSessionStorage = () => {};
var setRemoteSaveState = () => {};
var setStatus = text => notices.push(text);
var resetEditorState = () => {};
var getNewTopicModal = () => ({hide(){}});
var setInspectorTab = () => {};
var openStudioPanel = () => {};
var getNewTopicAcademicLabel = () => 'Tema';
var window = {setTimeout(){}};
var document = {getElementById(){return null;}};
var loadTopicIntoEditor = async topic => {state.activeTopicId=topic.id;selected=topic.id;await updateSessionTopicIndex(state.activeSessionId);};
var migrateLegacySessionTopic = async session => ({id:'legacy',academicNumber:1,project:session.project,formState:session.formState});
`;
const context = vm.createContext({structuredClone, console, ...topicPolicy});
vm.runInContext(setup + implementation, context);
const session = {id:'s',title:'Biomes',activeTopicId:'one',nivel:'Primaria',grado:'Primero',trimestre:'1',materia:'Español',tema:'1',topicCount:1,topicSummaries:[{id:'one',academicNumber:1}]};
const original = {id:'one',academicNumber:1,project:{titulo:'Original',misiones:[{id:'keep'}]},formState:{unidadTemaSelect:'1'}};
context.state.sessions=[structuredClone(session)];
context.records.s=[structuredClone(original)];
await context.loadSessionIntoEditor(session);
for (const number of [2,3]) {
  context.elements.newTopicNumber.value=String(number);
  await context.createNewTopicFromDialog({preventDefault(){}});
  assert.deepEqual(context.state.topics.find(topic=>topic.id==='one').project, original.project);
  const topic=context.state.topics.find(t=>t.academicNumber===number);
  assert.equal(topic.formState.nivelSelect,'Primaria');
  assert.equal(topic.formState.materiaSelect,'Español');
  assert.equal(topic.formState.unidadTemaSelect,String(number));
  for (let filter=1;filter<=number;filter++) {
    context.state.sessionThemeFilter=String(filter);
    assert.equal(context.getFilteredSessions(context.state.sessions).length,1);
  }
}
context.state.sessionThemeFilter='1';
context.state.sessionLevelFilter='Primaria'; context.state.sessionGradoFilter='Primero';
context.state.sessionSubjectFilter='Español';context.state.sessionTrimesterFilter='1';
assert.equal(context.getFilteredSessions(context.state.sessions).length,1);
context.state.sessionSubjectFilter='Inglés';
assert.equal(context.getFilteredSessions(context.state.sessions).length,0);
context.state.sessionSubjectFilter='Español';
await context.loadSessionIntoEditor({...session,activeTopicId:'topic-3'});
assert.equal(context.selected,'one','Filtered theme wins over last active');
context.state.sessionThemeFilter='';
await context.loadSessionIntoEditor({...session,activeTopicId:'topic-3'});
assert.equal(context.selected,'topic-3');
const rebuilt = await context.rebuildSessionTopicIndexes([{...session,topicSummaries:[{academicNumber:2}]}]);
assert.deepEqual(Array.from(context.getSessionThemeFilterValues(rebuilt.sessions[0])).sort(),['1','2','3']);
const snapshot=structuredClone(context.state.sessions);
let active=0,maximum=0;
context.fetchSessionTopics=async id=>{active++;maximum=Math.max(maximum,active);await new Promise(r=>setTimeout(r,5));active--;if(id==='fail')throw Error('offline');return [original];};
const pending=context.rebuildSessionTopicIndexes(['a','b','c','d','fail'].map(id=>({...session,id})));
assert.deepEqual(structuredClone(context.state.sessions),snapshot,'No partial publication');
const recovered=await pending;
assert.equal(maximum,3);
assert.deepEqual(Array.from(recovered.failures),['fail']);
assert.equal(recovered.sessions[4].topicSummaries[0].academicNumber,1,'Failed read preserves known index');
context.fetchSessionTopics=async()=>[];
const legacy=await context.rebuildSessionTopicIndexes([{id:'old',tema:'2'}]);
assert.deepEqual(Array.from(context.getSessionThemeFilterValues(legacy.sessions[0])),['2']);
context.state.activeSessionMeta={status:'published'};
const count=context.writes.length;
await context.updateSessionTopicIndex('s');
assert.equal(context.writes.length,count,'Published session is never rewritten by index sync');
context.fetchSessionTopics=async()=>[original,{id:'two',academicNumber:2}];
context.state.activeSessionId='';
context.state.sessionIndexFailures=['s'];
context.state.sessionThemeFilter='2';
await context.retrySessionTopicIndexes();
assert.equal(context.state.sessionIndexFailures.length,0);
assert.equal(context.state.sessionThemeFilter,'2','Retry preserves filters');
assert.equal(context.getFilteredSessions(context.state.sessions).length,1);
console.log('Session index unit tests OK');

// Browser uses the production list renderer and topic creation/loading functions;
// Firebase is replaced by the deterministic in-memory store above.
const browser=await chromium.launch();
try {
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.setContent('<select id="filter"><option value="">All</option><option>1</option><option>2</option><option>3</option></select><button id="add">Add topic</button><div id="list"></div><div id="loading"></div><div id="empty"></div>');
  await page.addStyleTag({content:fs.readFileSync('public/PigPenCreator.css','utf8')});
  await page.evaluate(async ({setup,implementation,renderer,session,original,policy})=>{
    Object.assign(globalThis, await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(policy)));
    // Save real DOM globals before installing the test doubles.
    globalThis.realDocument=document;
    (0,eval)(setup.replace('var window = {setTimeout(){}};', '').replace('var document = {getElementById(){return null;}};', '')+implementation);
    Object.assign(elements,{sessionList:document.querySelector('#list'),sessionsLoading:document.querySelector('#loading'),sessionsEmpty:document.querySelector('#empty')});
    Object.assign(globalThis,{syncSessionSubjectFilterOptions(){},syncSessionThemeFilterOptions(){},syncSessionLevelFilterOptions(){},syncSessionGradoFilterOptions(){},escapeHtml:s=>String(s),escapeHtmlAttr:s=>String(s)});
    (0,eval)(renderer);
    state.sessions=[session]; records.s=[original];
    document.querySelector('#add').onclick=async()=>{elements.newTopicNumber.value=String(state.topics.length+1);await createNewTopicFromDialog({preventDefault(){}});};
    document.querySelector('#filter').onchange=e=>{state.sessionThemeFilter=e.target.value;renderSessionList();};
    document.querySelector('#list').onclick=async e=>{if(e.target.closest('[data-session-action="open"]'))await loadSessionIntoEditor(state.sessions[0]);};
    return loadSessionIntoEditor(session);
  },{setup,implementation,renderer:extract('renderSessionList'),session,original,policy:fs.readFileSync('public/js/pigpen-topic-transfer.mjs','utf8')});
  await page.click('#add');
  await page.waitForFunction(()=>state.topics.length===2);
  await page.click('#add');
  await page.waitForFunction(()=>state.topics.length===3);
  for(const value of ['1','2','3']) {
    await page.selectOption('#filter',value);
    assert.equal(await page.locator('.er-session-item').count(),1);
    await page.locator('[data-session-action="open"]').click();
    await page.waitForFunction(v=>String(state.topics.find(t=>t.id===selected)?.academicNumber)===v,value);
  }
  assert.match(await page.locator('.er-session-item-meta').textContent(),/Temas 1, 2, 3/);
  assert.equal(await page.locator('.er-session-item-meta').evaluate(el=>getComputedStyle(el).whiteSpace),'normal');
  await page.evaluate(async()=>{state.sessions=(await rebuildSessionTopicIndexes([{...state.sessions[0],topicSummaries:[{academicNumber:3}]}])).sessions;renderSessionList();});
  await page.selectOption('#filter','1');
  assert.equal(await page.locator('.er-session-item').count(),1);
  console.log('Session topic browser flow OK: create, filter, open, rebuild and compact display');
} finally {await browser.close();}
