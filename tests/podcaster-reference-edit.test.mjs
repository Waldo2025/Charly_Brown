import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {sourceFunctions} from './helpers/snoopy-source.mjs';
import {captureReferenceEdit,selectEditedReference,referenceList,REFERENCE_FIELDS} from '../public/podcaster/podcaster-reference-edit-state.js';
const ref = name => ({name,storagePath:`refs/${name}.png`,downloadUrl:`https://example.test/${name}.png`,mimeType:'image/png',updatedAt:'2026-09-11T10:00:00Z'});
const session = () => ({id:'s',activeThreadId:'v1',script:{rows:[{id:'r'},{id:'other'}]},rowReferenceImageMap:{r:ref('one')},rowReferenceImageListMap:{r:[ref('one'),ref('two')],other:[ref('other')]},rowReferenceModeByRowId:{r:'image'},threads:[{id:'v1',script:{rows:[{id:'r'},{id:'other'}]}}],dialogueVideoMap:{r:{storagePath:'video.mp4'}},podcastVideoConfig:{cursorMs:4500},dialogueAudioMap:{r:{storagePath:'voice.wav'}}});
const capture = (s,index=1,id='job') => ({...captureReferenceEdit(s,'r',index,id),ownerUid:'u'});
test('replaces exactly the selected reference, preserves order, original and playback objects',()=>{
 const s=session(), c=capture(s), out=selectEditedReference(s,c,ref('edited'));
 assert.equal(out.status,'applied');
 assert.deepEqual(referenceList(out.session,'r').map(r=>r.name),['one','edited']);
 assert.equal(out.session.rowReferenceImageMap.r.name,'one');
 assert.equal(out.record.referenceEditHistory[0].name,'two');
 assert.equal(out.session.dialogueVideoMap,s.dialogueVideoMap); assert.equal(out.session.dialogueAudioMap,s.dialogueAudioMap);assert.equal(out.session.podcastVideoConfig,s.podcastVideoConfig);
 assert.equal(referenceList(s,'r')[1].name,'two');
 assert.equal(selectEditedReference(out.session,c,ref('edited')).unchanged,true);
});
test('updates primary reference and thread snapshot together',()=>{
 const s=session(), out=selectEditedReference(s,capture(s,0),ref('edited'));
 assert.equal(out.session.rowReferenceImageMap.r.name,'edited');
 assert.equal(out.session.threads[0].rowReferenceImageMap.r.name,'edited');
});
test('late results reject replacement, deletion, same resource with newer revision, wrong session and removed version',()=>{
 for(const mutate of [s=>s.rowReferenceImageListMap.r[1]=ref('later'),s=>s.rowReferenceImageListMap.r.splice(1),s=>s.rowReferenceImageListMap.r[1].referenceRevision='later',s=>s.script.rows=[],s=>s.id='other',s=>{s.activeThreadId='v2';s.threads=[];},s=>s.rowReferenceModeByRowId.r='video']) {
 const s=session(),c=capture(s);mutate(s);assert.equal(selectEditedReference(s,c,ref('edited')).status,'conflict'); }
});
test('reordering during generation locates the original by identity',()=>{
 const s=session(),c=capture(s);s.rowReferenceImageListMap.r.reverse();
 const out=selectEditedReference(s,c,ref('edited'));assert.equal(referenceList(out.session,'r')[0].name,'edited');
});
test('finishing in an inactive version leaves the active version unchanged',()=>{
 const s=session(),c=capture(s);s.threads[0]={...structuredClone(s),id:'v1',threads:[]};s.activeThreadId='v2';s.rowReferenceImageListMap={r:[ref('active')]};
 const out=selectEditedReference(s,c,ref('edited'));assert.equal(out.status,'applied');assert.equal(out.session.rowReferenceImageListMap.r[0].name,'active');assert.equal(out.session.threads[0].rowReferenceImageListMap.r[1].name,'edited');
});
test('restoring an original preserves history and does not reopen an old job',()=>{
 let s=session(); const c=capture(s,0);s=selectEditedReference(s,c,ref('edited')).session;
 const current=s.rowReferenceImageMap.r;const restored=selectEditedReference(s,capture(s,0,'restore'),current.referenceEditHistory[0]);
 assert.equal(restored.record.name,'one');assert.equal(restored.record.referenceEditHistory.at(-1).name,'edited');assert.equal(selectEditedReference(restored.session,c,ref('edited')).status,'conflict');
});
test('history stores durable references without inline image copies',()=>{
 const s=session(),out=selectEditedReference(s,capture(s),ref('edited'),{...ref('two'),dataUrl:'data:image/png;base64,huge'});
 assert.equal(out.record.referenceEditHistory[0].dataUrl,undefined);
 assert.throws(()=>selectEditedReference(s,capture(s),{}),/guardado/);
});
test('version switches and serialization preserve references and edit metadata',()=>{
 const context=vm.createContext({window:{},Date,Math});vm.runInContext(readFileSync('public/podcaster/podcaster-threads.js','utf8'),context);
 const s=selectEditedReference(session(),capture(session()),ref('edited')).session;
 context.window.PodcasterThreads.createNewThread(s);assert.deepEqual(Object.keys(s.rowReferenceImageMap),[]);
 context.window.PodcasterThreads.switchThread(s,'v1');assert.equal(s.rowReferenceImageListMap.r[1].referenceEditId,'job');assert.equal(s.rowReferenceImageListMap.r[1].referenceEditHistory[0].name,'two');
});
const source=sourceFunctions(new URL('../public/podcaster/podcaster.js',import.meta.url),['applyEditedSceneReference']);
function harness({fail=false,mutateAfterUpload=null,cloud=session()}={}) {
 const state={sessions:[session()]};let writes=0,uploads=0,refreshes=0;const calls=[];
 const ctx=vm.createContext({state,selectEditedReference,REFERENCE_FIELDS,resolveCurrentUid:()=> 'u',nowIso:()=> '2026-09-11T11:00:00Z',doc:()=>({}),firestoreDb:{},serverTimestamp:()=>0,
 uploadReferenceImageToStorage:async(_,opts)=>{uploads++;calls.push(opts);mutateAfterUpload?.(state.sessions[0]);return ref('uploaded');},
 runTransaction:async(_,fn)=>fn({get:async()=>({exists:()=>true,data:()=>({ownerId:'u',session:cloud})}),update:(_,patch)=>{if(fail)throw Error('write failed');writes++;for(const [key,value]of Object.entries(patch)){if(key.startsWith('session.'))cloud[key.slice(8)]=value;}}}),
 upsertSessionById:(id,fn,opts)=>{assert.equal(opts.invalidateRuntimeCache,false);state.sessions=state.sessions.map(s=>s.id===id?fn(s):s);return state.sessions.find(s=>s.id===id);},
 flushSessionLocalPersistNow:async id=>assert.equal(id,'s'),getActiveSession:()=>state.sessions[0],syncPodcastStudioInspector:()=>refreshes++});
 vm.runInContext(source,ctx);
 return {ctx,state,calls,get uploads(){return uploads;},get writes(){return writes;},get refreshes(){return refreshes;},setFail:v=>fail=v};
}
const draft=()=>({context:capture(session()),original:ref('two'),source:'data:image/png;base64,a',result:{dataUrl:'data:image/png;base64,b'}});
test('save failure keeps old selection and retry reuses the uploaded result',async()=>{
 const h=harness({fail:true}),d=draft();await assert.rejects(()=>h.ctx.applyEditedSceneReference(d),/write failed/);assert.equal(h.state.sessions[0].rowReferenceImageListMap.r[1].name,'two');assert.equal(h.uploads,1);
 h.setFail(false);const out=await h.ctx.applyEditedSceneReference(d);assert.equal(out.status,'applied');assert.equal(h.uploads,1);assert.equal(h.writes,1);assert.equal(h.refreshes,1);assert.equal(h.calls[0].sessionId,'s');
});
test('selection changed while uploading prevents cloud write',async()=>{
 const h=harness({mutateAfterUpload:s=>s.rowReferenceImageListMap.r[1]=ref('later')});assert.equal((await h.ctx.applyEditedSceneReference(draft())).status,'conflict');assert.equal(h.writes,0);
});
test('cloud conflict preserves the generated image and local previous selection',async()=>{
 const cloud=session();cloud.rowReferenceImageListMap.r[1]=ref('cloud-later');const h=harness({cloud}),d=draft();assert.equal((await h.ctx.applyEditedSceneReference(d)).status,'conflict');assert.ok(d.resource);assert.equal(h.writes,0);assert.equal(h.state.sessions[0].rowReferenceImageListMap.r[1].name,'two');
});
test('changed account cannot upload or commit an earlier draft',async()=>{
 const h=harness(),d=draft();d.context.ownerUid='someone-else';await assert.rejects(()=>h.ctx.applyEditedSceneReference(d),/cuenta/);assert.equal(h.uploads,0);assert.equal(h.writes,0);
});
test('legacy cloud paths and missing version IDs match their hydrated local reference',()=>{
 const cloud=session();delete cloud.activeThreadId;delete cloud.threads;
 cloud.rowReferenceImageListMap.r[1]={...ref('two'),storagePath:'refs/two.png',downloadUrl:'https://firebasestorage.googleapis.com/v0/b/test.bucket/o/refs%2Ftwo.png?alt=media&token=old'};
 const local=structuredClone(cloud);local.activeThreadId='v1';local.threads=[{id:'v1',script:local.script}];local.rowReferenceImageListMap.r[1].storagePath='gs://test.bucket/refs/two.png';local.rowReferenceImageListMap.r[1].downloadUrl=local.rowReferenceImageListMap.r[1].downloadUrl.replace('old','new');
 const out=selectEditedReference(cloud,capture(local),ref('edited'));assert.equal(out.status,'applied');assert.equal(out.session.activeThreadId,'v1');assert.equal(out.session.threads[0].rowReferenceImageListMap.r[1].name,'edited');
});
test('the first original remains recoverable after more than 20 edits',()=>{
 let s=session();for(let i=0;i<25;i++)s=selectEditedReference(s,capture(s,0,`job-${i}`),ref(`edited-${i}`)).session;
 assert.equal(s.rowReferenceImageMap.r.referenceEditHistory.length,20);assert.equal(s.rowReferenceImageMap.r.referenceEditHistory[0].name,'one');
});
test('cloud serialization isolates version references and preserves legacy references',async()=>{
 const {buildCloudSessionPayload}=await import('../public/podcaster/podcaster-session-payload.js');
 const s=selectEditedReference(session(),capture(session()),ref('edited')).session;
 s.threads.push({id:'v2',script:{rows:[{id:'other'}]}});
 const deps={nowIso:()=> '2026-09-11T11:00:00Z',...Object.fromEntries(REFERENCE_FIELDS.map(k=>['get'+k[0].toUpperCase()+k.slice(1),s=>s[k]||{}]))};
 const saved=buildCloudSessionPayload(s,{},[],deps);
 assert.equal(saved.threads[0].rowReferenceImageListMap.r[1].referenceEditHistory[0].name,'two');
 assert.equal(saved.threads[1].rowReferenceImageListMap.other[0].name,'other');
 assert.equal(saved.threads[1].rowReferenceImageListMap.r,undefined);
});
test('a reused cache key cannot disguise a newer file or selection',()=>{
 for(const mutate of [r=>r.storagePath='refs/later.png',r=>r.updatedAt='2026-09-11T12:00:00Z']){
 const s=session();s.rowReferenceImageListMap.r[1].localMediaCacheKey='reused';const c=capture(s);mutate(s.rowReferenceImageListMap.r[1]);assert.equal(selectEditedReference(s,c,ref('edited')).status,'conflict');}
});
test('the real reference normalizer preserves history, revisions and physical dimensions',async()=>{
 const {createPodcasterMediaRuntimeApi}=await import('../public/podcaster/podcaster-media-runtime.js');
 const api=createPodcasterMediaRuntimeApi({nowIso:()=> '2026-09-11T12:00:00Z'});
 const selected=selectEditedReference(session(),capture(session()),{...ref('edited'),width:2048,height:1152}).record;
 const normalized=api.buildImageReferenceRecordFromMedia(selected);
 assert.equal(normalized.referenceRevision,'job');assert.equal(normalized.referenceEditHistory[0].name,'two');assert.equal(normalized.width,2048);assert.equal(normalized.height,1152);
});
