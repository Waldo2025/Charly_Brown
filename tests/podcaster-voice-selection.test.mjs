import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { sourceFunctions } from './helpers/snoopy-source.mjs';
const appSource = sourceFunctions(new URL('../public/podcaster/podcaster.js',import.meta.url), [
  'readConfiguredVoiceName','normalizeLiveVoiceName','getDefaultSpeakerVoiceMap','buildSpeakerVoiceMap','getSpeakerVoiceMap',
  'resolveSpeakerVoiceName','normalizeVoiceNameSource','normalizeRowVoiceConfig','resolveConfiguredSpeakerVoiceForGeneration',
  'normalizeSpeechLocale','getSpeechLocaleProfile','getSessionSpeechLocale','resolveSpeechGenerationConfig'
]);
function setup(session, staleVoice='Aoede') {
  const context=vm.createContext({GEMINI_LIVE_VOICE_OPTIONS:['Kore','Orus','Aoede','Algenib','Puck'],DEFAULT_SPEAKER_VOICE_MAP:{Narrador:'Algenib','Host A':'Aoede','Host B':'Orus'},
    DEFAULT_SPEECH_LOCALE:'es-MX',GEMINI_TTS_LANGUAGE_CATALOG:[
      {locale:'es-MX',languageCode:'es',label:'Español (México)',instruction:'México'},
      {locale:'es-ES',languageCode:'es',label:'Español (España)',instruction:'España'},
      {locale:'es-419',languageCode:'es',label:'Español neutral',instruction:'Neutral'},
      {locale:'en',languageCode:'en',label:'Inglés'}
    ],
    window:{},resolveGeminiLiveVoice:()=> 'Aoede',getActiveSession:()=>session,
    findSessionRowById:(s,id)=>s.script.rows.find(r=>r.id===id),
    collectGlobalSpeakerDraft:()=>({voiceMap:{Narrador:staleVoice}}),readRowVoiceDraftValue:()=>'',
    normalizePodcasterSceneTextFields:r=>r});
  vm.runInContext(appSource,context);
  return context;
}
const row={id:'r',speaker:'Narrador',voiceName:'Kore',voiceNameSource:'host',text:'Hola.'};
test('single regeneration preserves the saved narrator voice despite stale global controls',()=>{
  const session={id:'s',speakerVoiceMap:{Narrador:'Kore'},script:{rows:[row]}};
  const c=setup(session,'Algenib');
  assert.equal(c.resolveConfiguredSpeakerVoiceForGeneration(row,session),'Kore');
  assert.equal(c.resolveConfiguredSpeakerVoiceForGeneration('r',session),'Kore');
});
test('creative narrator voice survives reload without an explicit speaker map',()=>{
  const session={id:'s',creativeVideoConfig:{globalVoiceName:'Kore'},script:{rows:[row]}};
  const c=setup(session);
  assert.equal(c.resolveConfiguredSpeakerVoiceForGeneration(row,session),'Kore');
  assert.equal(c.normalizeRowVoiceConfig({...row,voiceName:''},session).voiceName,'Kore');
});
test('an inherited row follows its configured speaker instead of its old materialized voice',()=>{
  const session={id:'s',speakerVoiceMap:{Narrador:'Orus'},script:{rows:[row]}};
  const c=setup(session);
  assert.equal(c.normalizeRowVoiceConfig(row,session).voiceName,'Orus');
});
test('an explicit scene override survives changes to the narrator and empty overrides inherit',()=>{
  const session={id:'s',speakerVoiceMap:{Narrador:'Kore'},script:{rows:[row]}};const c=setup(session);
  assert.equal(c.resolveConfiguredSpeakerVoiceForGeneration({...row,voiceName:'Puck',voiceNameSource:'row'},session),'Puck');
  for(const voiceName of ['', 'invalid']) {
    const candidate={...row,voiceName,voiceNameSource:'row'};
    assert.equal(c.resolveConfiguredSpeakerVoiceForGeneration(candidate,session),'Kore');
    assert.equal(c.normalizeRowVoiceConfig(candidate,session).voiceName,'Kore');
  }
});
test('multiple speakers keep distinct voices and a new saved selection takes precedence',()=>{
  const session={id:'s',speakerVoiceMap:{'Host A':'Puck','Host B':'Orus'},script:{rows:[]}};const c=setup(session);
  assert.equal(c.resolveConfiguredSpeakerVoiceForGeneration({speaker:'Host A'},session),'Puck');
  assert.equal(c.resolveConfiguredSpeakerVoiceForGeneration({speaker:'Host B'},session),'Orus');
  session.speakerVoiceMap['Host A']='Kore';
  assert.equal(c.resolveConfiguredSpeakerVoiceForGeneration({speaker:'Host A'},session),'Kore');
});

test('speech generation keeps the selected regional locale and inherited voice',()=>{
  const session={id:'s',speechLocale:'es-ES',speakerVoiceMap:{Narrador:'Kore'},script:{rows:[row]}};
  const c=setup(session);
  assert.deepEqual(
    JSON.parse(JSON.stringify(c.resolveSpeechGenerationConfig(row,session))),
    {voiceName:'Kore',voiceSource:'host',speechLocale:'es-ES',providerLanguageCode:'es',localeInstruction:'España'}
  );
  assert.equal(c.normalizeSpeechLocale('es'),'es-MX');
});

test('batch and individual generation send the same configured voice to the audio API',async()=>{
  const rows=[row,{id:'second',speaker:'Host B',voiceName:'Puck',voiceNameSource:'row',text:'Adiós.'}];
  const session={id:'s',speechLocale:'es-MX',speakerVoiceMap:{Narrador:'Kore','Host B':'Orus'},script:{rows}};
  const c=setup(session,'Algenib');const requests=[];
  Object.assign(c, {dialogueAudioGenerationPending:new Set(),computeDurationSpeedMultiplier:()=>1,
    authFetchJson:async(_,request)=>{const body=JSON.parse(request.body);requests.push(body);return {ok:true,dialogueAudio:{rowId:body.rowId,voiceName:body.voiceName,downloadUrl:'voice.wav'}};},
    waitForPodcasterJob:async result=>result,preloadAllDialogueAudios:async()=>{},console:{error(){}}});
  Object.assign(c.window, {getActiveSession:()=>session,getSessionRows:s=>s.script.rows,
    flushScriptEditorVoiceDraftsToSession:()=>false,resolveConfiguredSpeakerVoiceForGeneration:c.resolveConfiguredSpeakerVoiceForGeneration,
    resolveSpeechGenerationConfig:(target,current)=>({voiceName:c.resolveConfiguredSpeakerVoiceForGeneration(target,current),speechLocale:current.speechLocale}),
    PodcasterSceneMedia:{capture:(s,id)=>({sessionId:s.id,rowId:id,threadId:''}),apply:async(_,clip)=>({status:'applied',clip})},
    buildTargetSpeechLine:r=>r.text,resolveDialogueAudioForRow:()=>null,resolveSceneNumberByRowId:()=>1,
    resolveSpeakerDisplayName:s=>s,setGenerationStatus(){},syncGeminiDialogueTrackWithRuntime(){},
    refreshRuntimeFeatureCapabilities:async()=>{},runtimeFeatureState:{},hasStoredMediaSource:clip=>Boolean(clip?.downloadUrl)});
  vm.runInContext(sourceFunctions(new URL('../public/podcaster/podcaster-audioGemini-timeline.js',import.meta.url),[
    'normalizeDialogueAudioRecord','generateDialogueAudioForRow','getRegenerableGeminiAudioRows','regenerateAllGeminiDialogueAudios'
  ]),c);
  c.podcasterGenerationShared={generateDialogueAudioForRow:c.generateDialogueAudioForRow};
  const batch=await c.regenerateAllGeminiDialogueAudios(session);
  assert.equal(batch.generated,2);
  await c.generateDialogueAudioForRow('r',{regenerate:true});
  await c.generateDialogueAudioForRow('second',{regenerate:true});
  assert.deepEqual(requests.map(({rowId,voiceName,speechLocale})=>({rowId,voiceName,speechLocale})),[
    {rowId:'r',voiceName:'Kore',speechLocale:'es-MX'},{rowId:'second',voiceName:'Puck',speechLocale:'es-MX'},
    {rowId:'r',voiceName:'Kore',speechLocale:'es-MX'},{rowId:'second',voiceName:'Puck',speechLocale:'es-MX'}
  ]);
});

test('empty or invalid row controls cannot flush a default voice into the session',()=>{
  const session={id:'s',script:{rows:[row]}};const c=setup(session);
  c.document={querySelectorAll:()=>[{value:'',dataset:{rowId:'r',voiceSource:'row'}},{value:'invalid',dataset:{rowId:'r',voiceSource:'row'}}]};
  c.upsertActiveSession=()=>{throw new Error('invalid control overwrote saved voice');};
  vm.runInContext(sourceFunctions(new URL('../public/podcaster/podcaster.js',import.meta.url),['flushScriptEditorVoiceDraftsToSession']),c);
  assert.equal(c.flushScriptEditorVoiceDraftsToSession(),false);
});
