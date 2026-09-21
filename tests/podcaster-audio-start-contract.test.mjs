import { reconcileGeminiVoiceSource } from '../public/podcaster/podcaster-montage-audio-timing.js';
import assert from 'node:assert/strict';
import test from 'node:test';
globalThis.window ??= {location:{origin:'https://example.test',href:'https://example.test'}};
globalThis.HTMLMediaElement ??= {HAVE_CURRENT_DATA:2,HAVE_METADATA:1,HAVE_ENOUGH_DATA:4};
const {PodcasterPlaybackController:Controller}=await import('../public/podcaster/podcaster-playback-controller.js');
class Audio extends EventTarget {
 constructor(){super();this.tagName='AUDIO';this.dataset={initialized:'true'};this.currentTime=0;this.duration=10;this.readyState=4;this.paused=true;this.playbackRate=1;this.volume=1;this.playCount=0;}
 play(){this.playCount++;this.paused=false;return this.startPromise || Promise.resolve();}
 pause(){this.paused=true;}
}
function setup(start=1000,rate=1){
 const audio=new Audio(),c=new Controller();const clip={downloadUrl:'test.wav',durationSec:10};
 c.state.session={id:'s'};c.state.isPlaying=true;
 const segment={rowId:'r',startMs:start,durationMs:2000/rate,trimInMs:500,trimOutMs:2500};
 c.deps={getPodcastVideoConfig:()=>({geminiDialogueTrack:{enabled:true,segments:[segment]}}),buildTimelineRuntimeEntries:()=>[{rowId:'r',startMs:0,endMs:20000}],resolveDialogueAudioForRow:()=>clip,resolveDialogueAudioPlaybackRate:()=>rate,resolveRowAudioDurationMs:()=>10000,resolveTimelineClipMix:()=>({voiceVolume:1})};
 c.dialoguePlayers.r=audio;c.dialogueAudioSourceKeys.r=c.resolveAudioSourceKey(clip);c.syncBackgroundMusic=async()=>{};c.prepareDialogueRow=async()=>({ready:true,player:audio});c.seekTo=(a,t)=>{a.currentTime=t;};
 return {c,audio,segment};
}
for(const start of [0,1,731,1000,9531]) test(`audio starts exactly at authored ${start} ms and stops at its trim`,async()=>{
 const {c,audio,segment}=setup(start);
 await c.syncAudio(start-1,1);assert.equal(audio.playCount,0);
 await c.syncAudio(start,1);assert.equal(audio.playCount,1);assert.equal(audio.currentTime,.5);
 await c.syncAudio(start+1999,1);assert.equal(audio.paused,false);
 await c.syncAudio(start+2000,1);assert.equal(audio.paused,true);
 assert.equal(c.normalizeRuntimeDialogueSegments([segment],[{rowId:'r',startMs:0}])[0].startMs,start);
});
test('syncAudio awaits the actual play promise and ignores stale starts after Pause',async()=>{
 const {c,audio}=setup();let resolve;audio.startPromise=new Promise(r=>{resolve=r;});let done=false;
 const pending=c.syncAudio(1000,1).then(()=>{done=true;});
 await new Promise(r=>setTimeout(r,0));assert.equal(done,false);assert.equal(audio.playCount,1);
 c.state.isPlaying=false;resolve();await pending;assert.equal(audio.paused,true);
});
test('slow canplay stays pending and buffering controls when it may start',async()=>{
 const {c,audio}=setup();audio.readyState=0;
 const pending=c.syncAudio(1000,1);await Promise.resolve();c.state.isBuffering=true;
 audio.readyState=4;audio.dispatchEvent(new Event('canplay'));await pending;assert.equal(audio.playCount,0);
 await c.syncAudio(1000,1,{allowDuringBufferRecovery:true});assert.equal(audio.playCount,1);
});
test('decode errors propagate instead of advancing a silent montage',async()=>{
 const {c,audio}=setup();audio.readyState=0;const pending=c.syncAudio(1000,1);
 audio.dispatchEvent(new Event('error'));await assert.rejects(pending,/cargar el audio/);
});
for(const rate of [.5,1,1.25,2,10]) test(`source trims remain exact at rate ${rate}`,()=>{
 const {c,segment}=setup(731,rate);assert.equal(c.resolveSegmentTimelineDurationMs(segment,rate),2000/rate);
 assert.equal(c.resolveSegmentSourceOffsetSec(731+500,731,500,rate),(.5+rate*.5));
 assert.equal(c.nextDialogueStartBetween(730,750),731);assert.equal(c.nextDialogueStartBetween(731,750),null);
});

test('a finished voice is not rewound or restarted by a late playback tick', async () => {
 const {c,audio}=setup(1000);
 await c.syncAudio(1000,1);
 audio.ended=true; audio.paused=true; audio.currentTime=2.5;
 await c.syncAudio(2700,1);
 assert.equal(audio.playCount,1);
 assert.equal(audio.currentTime,2.5);
 c.state.forceStageMediaSync=true;
 audio.ended=false;
 await c.syncAudio(1000,1);
 assert.equal(audio.playCount,2);
 assert.equal(audio.currentTime,.5);
});

test('setting an audible voice volume reactivates a stored disabled track even at the same percentage',async()=>{
 const vm=await import('node:vm');const {sourceFunctions}=await import('./helpers/snoopy-source.mjs');
 const segment={rowId:'r',startMs:1590,trimInMs:731,trimOutMs:2040,durationMs:1309};
 let config={geminiDialogueTrack:{enabled:false,volumePct:100,segments:[segment]}};
 const session={id:'s'};
 const context=vm.createContext({getActiveSession:()=>session,toFiniteNumber:(v,f)=>Number.isFinite(Number(v))?Number(v):f,
 upsertPodcastVideoConfig:fn=>{config=fn(config);},window:{normalizeGeminiDialogueTrack:t=>t},nowIso:()=> 'now',
 invalidateStudioRuntimeCache(){},renderPodcastVideoTimeline(){},playbackController:{sync(){}},getPodcastVideoConfig:()=>config,setGenerationStatus(){}});
 vm.runInContext(sourceFunctions(new URL('../public/podcaster/podcaster.js',import.meta.url),['setGeminiDialogueTrackVolumePct']),context);
 assert.equal(context.setGeminiDialogueTrackVolumePct(100),true);
 assert.equal(config.geminiDialogueTrack.enabled,true);
 assert.deepEqual(config.geminiDialogueTrack.segments,[segment]);
 assert.equal(context.setGeminiDialogueTrackVolumePct(100),false);
});

test('confirming voice volume alone does not reposition audio or unify scene speeds',async()=>{
 const vm=await import('node:vm');const {sourceFunctions}=await import('./helpers/snoopy-source.mjs');
 const context=vm.createContext({geminiTrackVolumeModalState:{volumePct:100,playbackRate:1,initialPlaybackRate:1,alignment:'left'},
 setGeminiDialogueTrackVolumePct:()=>true,applyGeminiTrackSpeedToAllScenes:()=>{throw new Error('unrequested speed change');},
 getActiveSession:()=>({id:'s'}),getPodcastVideoConfig:()=>({geminiDialogueTrack:{alignment:'left'}}),
 upsertPodcastVideoConfig:()=>{throw new Error('unrequested config change');},syncGeminiDialogueTrackWithRuntime:()=>{throw new Error('unrequested timeline reset');},setGeminiTrackVolumeModalOpen(){}});
 vm.runInContext(sourceFunctions(new URL('../public/podcaster/podcaster.js',import.meta.url),['applyGeminiTrackVolumeModal']),context);
 assert.equal(await context.applyGeminiTrackVolumeModal(),true);
});

test('recovering stored voices enables an empty placeholder but preserves an explicitly disabled populated track',async()=>{
 const vm=await import('node:vm');const {sourceFunctions}=await import('./helpers/snoopy-source.mjs');
 const entry={rowId:'r',audioSrc:'voice.wav',startMs:731,endMs:8731,effectiveDurationMs:8000,clip:{trimOutMs:8000}};
 const context=vm.createContext({reconcileGeminiVoiceSource,resolveDialogueAudioPlaybackRate:()=>1,getActiveSession:()=>({id:'s'}),getPodcastVideoConfig:()=>({}),buildTimelineRuntimeEntries:()=>[entry],STUDIO_TIMELINE_MIN_CLIP_MS:500,
 toFiniteNumber:(v,f)=>Number.isFinite(Number(v))?Number(v):f,
 normalizeGeminiDialogueTrackSegment:s=>s,resolveRowAudioDurationMs:()=>2000,resolveAutomaticGeminiSceneOffsetMs:()=>0,
 resolveGeminiSegmentDurationWithinScene:(_,duration)=>duration,clampGeminiSegmentStartToTimeline:(_,__,start)=>start,
 resolveDialogueAudioForRow:()=>({}),window:{},nowIso:()=> 'now'});
 vm.runInContext(sourceFunctions(new URL('../public/podcaster/podcaster.js',import.meta.url),['normalizeGeminiDialogueTrack','reconcileGeminiDialogueTrackWithRuntime']),context);
 const recovered=context.reconcileGeminiDialogueTrackWithRuntime({id:'s'},{enabled:false,segments:[]});
 assert.equal(recovered.track.enabled,true);assert.equal(recovered.track.segments[0].startMs,731);
 const explicitlyDisabled={...recovered.track,enabled:false};
 assert.equal(context.reconcileGeminiDialogueTrackWithRuntime({id:'s'},explicitlyDisabled).track.enabled,false);
});


test('a pending decode seek is not replaced on every clock tick',async()=>{
 const {c,audio}=setup(1000);
 await c.syncAudio(1000,1);
 audio.seeking=true;
 await c.syncAudio(1800,1);
 assert.equal(audio.currentTime,.5);
 audio.seeking=false;
 await c.syncAudio(1800,1);
 assert.equal(audio.currentTime,1.3);
 c.state.forceStageMediaSync=true;
 audio.seeking=true;
 await c.syncAudio(1000,1);
 assert.equal(audio.currentTime,.5,'an explicit seek supersedes a pending seek');
});

test('a slow scene update cannot make the same tick rewind an already advancing voice',async()=>{
 const {c,audio}=setup(1000);
 await c.syncAudio(1000,1);
 c.state.currentMs=1500;audio.currentTime=1;
 c.ensureDialogueReadyAtMs=async()=>true;
 c.getEntryAtMs=()=>null;
 c.syncVideo=async()=>{audio.currentTime=2.2;};
 c.syncOverlay=c.syncStylizedText=c.syncOverlayCards=()=>{};
 const positions=[];c.seekTo=(a,t)=>{positions.push(t);a.currentTime=t;};
 await c.tick(1500);
 assert.deepEqual(positions,[]);
 assert.equal(audio.currentTime,2.2);
});


test('loading a normalized empty session stub cannot disable or reposition saved Gemini voices',async()=>{
 const vm=await import('node:vm');const {sourceFunctions}=await import('./helpers/snoopy-source.mjs');
 const context=vm.createContext({isPlainRecord:v=>v&&typeof v==='object'&&!Array.isArray(v)});
 vm.runInContext(sourceFunctions(new URL('../public/podcaster/podcaster-session-store.js',import.meta.url),['mergeArrayByPresence','mergeGeminiDialogueTrackForLoad']),context);
 const saved={enabled:true,updatedAt:'2026-09-10T21:49:36.769Z',volumePct:76,segments:[{rowId:'r',startMs:1590,trimInMs:731,trimOutMs:2040}]};
 const loaded=context.mergeGeminiDialogueTrackForLoad(saved,{enabled:false,updatedAt:'',volumePct:100,segments:[],excludedRowIds:[]});
 assert.equal(loaded.enabled,true);assert.equal(loaded.volumePct,76);assert.equal(loaded.updatedAt,saved.updatedAt);assert.deepEqual(loaded.segments,saved.segments);
 assert.equal(context.mergeGeminiDialogueTrackForLoad(saved,{...saved,enabled:false}).enabled,false);
 assert.equal(context.mergeGeminiDialogueTrackForLoad(saved,{enabled:false,segments:[],excludedRowIds:['r']}).enabled,false);
});


test('audio drift uses the live clock when rendering blocks the painted playhead',async()=>{
 const {c,audio,segment}=setup(0);
 segment.durationMs=10000;segment.trimInMs=0;segment.trimOutMs=10000;
 await c.syncAudio(1000,1);
 audio.currentTime=3;
 c.playbackClockSample={timelineMs:1000,wallTime:performance.now()-2000,loopId:c.activeLoopId};
 const seeks=[];c.seekTo=(a,t)=>{seeks.push(t);a.currentTime=t;};
 await c.syncAudio(1000,1,{followClock:true});
 assert.deepEqual(seeks,[],'UI latency must not rewind an advancing voice');
 c.state.forceStageMediaSync=true;
 await c.syncAudio(1000,1,{followClock:true});
 assert.deepEqual(seeks,[1],'an explicit seek still uses its exact requested time');
});

test('another tick cannot skip the first word while play is still pending',async()=>{
 const {c,audio}=setup(1000);
 let resolve;audio.startPromise=new Promise(r=>{resolve=r;});
 const pending=c.syncAudio(1000,1);await new Promise(r=>setTimeout(r,0));
 assert.equal(audio.currentTime,.5);
 await c.syncAudio(1800,1);
 assert.equal(audio.currentTime,.5);
 resolve();await pending;
});


test('a prepared voice boundary does not seek continuous music to the old boundary time',async()=>{
 const {c,audio}=setup(1000);
 c.syncBackgroundMusic=async()=>{throw new Error('prepared voice must not reposition music');};
 await c.startMediaAtBoundary(1000,{prepared:true});
 assert.equal(audio.playCount,1);assert.equal(c.state.isPlaying,true);
});


test('buffer recovery freezes the live clock instead of rewinding music to the last painted time',()=>{
 const {c}=setup(1000);
 c.state.currentMs=1000;
 c.playbackClockSample={timelineMs:1000,wallTime:performance.now()-1100,loopId:c.activeLoopId};
 const video={readyState:2,paused:false,ended:false,hidden:false,dataset:{}};
 c.getActiveStageVideoEl=()=>video;c.getEntryAtMs=()=>null;c.pauseMediaForStageBuffering=()=>{};
 c.scheduleStageBufferRecovery(video);
 clearTimeout(c.stageBufferRecoveryTimer);c.stageBufferRecoveryTimer=null;
 assert.ok(c.state.currentMs>=2100&&c.state.currentMs<2200);
 assert.equal(c.stageBufferStartMs,c.state.currentMs);
 assert.equal(c.state.isBuffering,true);
});
