import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { initializeApp, deleteApp } from 'firebase/app';
import * as sdk from 'firebase/firestore';
import * as policy from '../public/js/pigpen-topic-transfer.mjs';
import * as structural from '../public/js/pigpen-structural-view.mjs';

assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/, 'Emulator only');
const app=initializeApp({projectId:'demo-pigpen-transfer',apiKey:'demo'},'structural');
const db=sdk.getFirestore(app);
sdk.connectFirestoreEmulator(db,'127.0.0.1',8185,{mockUserToken:{sub:'owner',user_id:'owner'}});
const prefix=crypto.randomUUID();
const source=fs.readFileSync('public/js/PigPenCreator.js','utf8');
function extract(name){const start=source.search(new RegExp(`^(?:async )?function ${name}\\(`,'m'));assert.ok(start>=0,name);const rest=source.slice(start);return rest.slice(0,rest.slice(1).search(/^(?:async )?function /m)+1);}
const names=['normalizeTopicNumber','getCurrentAcademicNumber','getTopicTitle','sortTopics','buildTopicSummary','buildTopicPayload','buildSessionPayload',
  'updateSessionTopicIndex','syncLocalSessionIndex','createTopicDocument','ensureActiveTopic','persistActiveSession',
  'normalizeSessionThemeNumber','normalizeSessionTrimesterFilter','getCurrentSessionTopicFilters','loadSessionIntoEditor','loadTopicIntoEditor',
  'flushStructuralEdits','toggleStructuralView','openStructuralTopic','confirmRealSessionAction'];
const context=vm.createContext({...sdk,...policy,...structural,db,structuredClone,console});
vm.runInContext(`
var writes=0,flushes=0,migrations=0,lastConfirmation='',denySave=false;
var state={sessions:[],topics:[],activeSessionId:'',activeTopicId:'',activeSessionMeta:null,expandedMissionIds:new Set(),saveState:'saved',currentUser:{uid:'owner'},sessionThemeFilter:'',sessionNameFilter:'',sessionIndexFailures:[]};
var structuralView={enabled:true,search:'',groupKey:'',navigationBusy:false};
var elements={studioWorkspace:{inert:false}};
var SESSION_TITLE_DEFAULT='Session',SESSION_SCHEMA_VERSION=3,ESCAPE_ROOM_COLLECTION='escapeRoom',TOPICS_SUBCOLLECTION='topics';
var normalizeString=(v,f='')=>typeof v==='string'&&v.trim()?v.trim():f;
var sortSessions=x=>x,withDefaultRoutes=x=>x,normalizeSessionTitle=(t,p)=>t||p?.titulo||'Session';
var renderSessionList=()=>{},renderTopicList=()=>{},closeSessionMenu=()=>{},setActiveSessionStorage=()=>{},syncActionButtons=()=>{},setInspectorTab=()=>{};
var resetEditorState=()=>{state.project=null;};
var applyFormState=()=>{},buildAcademicFormState=()=>({}),syncPresentationModeUi=()=>{},restorePreviewTheme=()=>{},renderMissionEditor=()=>{},renderOutputsNow=()=>{},setActiveTab=()=>{};
var setRemoteSaveState=s=>{state.saveState=s;},setStatus=s=>{state.message=s;};
var isGenerationBusy=()=>structuralView.navigationBusy,isPublishedSession=()=>state.activeSessionMeta?.status==='published';
var window={confirm:message=>{lastConfirmation=message;return false;}};
var migrateLegacySessionTopic=async()=>{migrations++;throw Error('Navigation tried to migrate');};
var materializeProjectForExport=()=>structuredClone(state.project),uploadProjectImagesToFirebaseStorage=async()=>{},ensureActiveRemoteSession=async()=>state.activeSessionId;
var serializeFormState=()=>state.topics.find(t=>t.id===state.activeTopicId)?.formState||{},getSessionAcademicMetadata=()=>({}),deriveSessionTitle=()=>state.activeSessionMeta.title;
var flushPendingTopicSave=async()=>{flushes++;if(denySave){state.saveState='error';return;}await persistActiveSession();state.sessionSaveQueued=false;};
`,context);
context.fetchSessionTopics=async id=>(await sdk.getDocs(sdk.collection(db,'escapeRoom',id,'topics'))).docs.map(doc=>({...doc.data(),id:doc.id}));
// Convert only cross-realm plain objects; retain SDK timestamps/transforms.
const sdkData=value=>Array.isArray(value)?Array.from(value,sdkData):value?.constructor?.name==='Object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,sdkData(item)])):value;
context.updateDoc=async(ref,data,...rest)=>{context.writes++;return sdk.updateDoc(ref,sdkData(data),...rest);};
context.setDoc=async(ref,data,...rest)=>{context.writes++;return sdk.setDoc(ref,sdkData(data),...rest);};
context.addDoc=async(ref,data,...rest)=>{context.writes++;return sdk.addDoc(ref,sdkData(data),...rest);};
vm.runInContext(names.map(extract).join('\n'),context);
const sessions=['a','b','legacy','published'].map(id=>({id:prefix+id,ownerId:'owner',title:id,status:id==='published'?'published':'draft',activeTopicId:'same'}));
try {
  for(const session of sessions){
    const payload={...session,project:{titulo:session.title},formState:{unidadTemaSelect:'1',materiaSelect:'Inglés',nivelSelect:'Secundaria',gradoSelect:'Segundo',trimestreSelect:'1'}};
    delete payload.id;
    await sdk.setDoc(sdk.doc(db,'escapeRoom',session.id),payload);
    if(session.title!=='legacy')await sdk.setDoc(sdk.doc(db,'escapeRoom',session.id,'topics','same'),{academicNumber:1,title:session.title,project:{titulo:session.title},formState:payload.formState});
    Object.assign(session,payload);
  }
  context.state.sessions=sessions;
  await context.openStructuralTopic(sessions[0].id,'same');
  assert.equal(context.state.project.titulo,'a');
  for(let i=0;i<4;i++)context.toggleStructuralView();
  await context.openStructuralTopic(sessions[1].id,'same');
  assert.equal(context.state.project.titulo,'b');
  assert.equal(context.state.activeSessionId,sessions[1].id);
  assert.equal(context.writes,0);assert.equal(context.flushes,0);
  await context.openStructuralTopic(sessions[2].id,'legacy');
  assert.equal(context.state.legacyTopicPending,true);
  assert.equal((await sdk.getDocs(sdk.collection(db,'escapeRoom',sessions[2].id,'topics'))).size,0);
  assert.equal(context.migrations,0);assert.equal(context.writes,0);
  context.state.project.titulo='Legacy edited';
  await context.persistActiveSession();
  assert.equal((await sdk.getDocs(sdk.collection(db,'escapeRoom',sessions[2].id,'topics'))).size,1);
  assert.equal(context.state.topics.some(t=>t.id==='legacy'),false);
  await context.openStructuralTopic(sessions[1].id,'same');
  context.state.project.titulo='Edited in original B';
  await context.persistActiveSession();
  assert.equal((await sdk.getDoc(sdk.doc(db,'escapeRoom',sessions[1].id,'topics','same'))).data().project.titulo,'Edited in original B');
  assert.equal((await sdk.getDoc(sdk.doc(db,'escapeRoom',sessions[0].id,'topics','same'))).data().project.titulo,'a');
  context.state.sessionSaveQueued=true;context.denySave=true;
  assert.equal(await context.openStructuralTopic(sessions[0].id,'same'),false);
  assert.equal(context.state.activeSessionId,sessions[1].id,'Failed save keeps editor identity');
  context.denySave=false;context.state.sessionSaveQueued=false;context.state.saveState='saved';
  const writes=context.writes;
  await context.openStructuralTopic(sessions[3].id,'same');
  assert.equal(context.writes,writes,'Published navigation has no writes');
  assert.equal(context.confirmRealSessionAction('Publicar'),false);
  assert.match(context.lastConfirmation,/Sesión real: published/);
  assert.match(context.lastConfirmation,/1 temas/);
  const snapshots=await Promise.all(sessions.map(s=>sdk.getDoc(sdk.doc(db,'escapeRoom',s.id))));
  assert.equal(snapshots[0].data().activeTopicId,'same');
  console.log('PASS: emulator structural navigation is read-only; composite IDs, legacy edit-on-demand, real-source save, failed save and scope confirmation.');
} finally {await sdk.terminate(db);await deleteApp(app);}
