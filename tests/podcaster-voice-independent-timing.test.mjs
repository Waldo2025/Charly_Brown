import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { sourceFunctions } from './helpers/snoopy-source.mjs';
import mediaState from '../public/podcaster/podcaster-media-state.js';
import { reconcileGeminiVoiceSource, resolveGeminiAudioTimelineDurationMs } from '../public/podcaster/podcaster-montage-audio-timing.js';
globalThis.window ??= { location: { origin: 'https://example.test', href: 'https://example.test' } };
globalThis.HTMLMediaElement ??= { HAVE_CURRENT_DATA: 2, HAVE_METADATA: 1, HAVE_ENOUGH_DATA: 4 };
const { PodcasterPlaybackController: Controller } = await import('../public/podcaster/podcaster-playback-controller.js');
const app = new URL('../public/podcaster/podcaster.js', import.meta.url);
function fixture(rate = 1.15, startMs = 15900) {
  const media = { downloadUrl:'new.wav', durationSec:9.24 };
  const entry = { rowId:'r', audioSrc:media.downloadUrl, startMs:16000, endMs:24000, effectiveDurationMs:8000, clip:{ trimOutMs:8000 } };
  const context = vm.createContext({
    getPodcastVideoConfig:()=>({}), buildTimelineRuntimeEntries:()=>[entry], STUDIO_TIMELINE_MIN_CLIP_MS:500,
    resolveRowAudioDurationMs:()=>9240/rate, resolveDialogueAudioPlaybackRate:()=>rate,
    resolveDialogueAudioForRow:()=>media, resolveAutomaticGeminiSceneOffsetMs:()=>0,
    clampGeminiSegmentStartToTimeline:(_,__,start)=>start, normalizeGeminiDialogueTrackSegment:s=>mediaState.normalizeDialogueSegment(s),
    normalizeGeminiDialogueTrack:t=>({...t,segments:t.segments||[]}), nowIso:()=> 'now',
    reconcileGeminiVoiceSource, podcasterMediaState:mediaState, window:{}
  });
  vm.runInContext(sourceFunctions(app,['buildGeminiDialogueTimelineTrack','reconcileGeminiDialogueTrackWithRuntime']),context);
  return {context, entry, media, segment:{rowId:'r',audioSrc:'old.wav',startMs,anchorStartMs:16000,trimInMs:0,trimOutMs:8000,durationMs:8000,endMs:startMs+8000,manualStartMs:true}};
}
for (const rate of [.5,1,1.15,1.3,2,10]) test(`building a voice at ${rate}x keeps all source samples past the 8-second video`,()=>{
  const {context}=fixture(rate);
  const segment=context.buildGeminiDialogueTimelineTrack({id:'s'}).segments[0];
  assert.equal(segment.trimOutMs,9240);
  assert.equal(segment.durationMs,Math.round(9240/rate));
  assert.equal(segment.durationMode,'source');
  assert.equal(new Controller().resolveSegmentTimelineDurationMs(segment,rate),Math.round(9240/rate));
});
for (const start of [731,15900,28000,120000]) test(`refreshing/regenerating voice at ${start}ms preserves placement and plays its full source`,()=>{
  const {context,segment}=fixture(1.15,start);
  const result=context.reconcileGeminiDialogueTrackWithRuntime({id:'s'},{enabled:true,segments:[segment]},{preserveStartMs:true});
  const actual=result.track.segments[0];
  assert.equal(actual.startMs,start);
  assert.equal(actual.trimOutMs,9240);
  assert.equal(actual.durationMs,8035);
  assert.equal(actual.endMs,start+8035);
  const repeated=context.reconcileGeminiDialogueTrackWithRuntime({id:'s'},result.track,{preserveStartMs:true});
  assert.equal(repeated.changed,false);
});
test('legacy source windows update without depending on scene duration or a special timestamp',()=>{
  const {context,segment,entry,media}=fixture(1.3);
  segment.audioSrc=media.downloadUrl; entry.effectiveDurationMs=3000;
  const actual=context.reconcileGeminiDialogueTrackWithRuntime({id:'s'},{enabled:true,segments:[segment]}).track.segments[0];
  assert.equal(actual.trimOutMs,9240); assert.equal(actual.durationMs,7108);
});
test('explicit trims survive metadata, speed changes and regeneration',()=>{
  for(const segment of [
    {startMs:731,anchorStartMs:16000,trimInMs:500,trimOutMs:2500,durationMs:2000},
    {startMs:731,anchorStartMs:16000,trimInMs:0,trimOutMs:2000,durationMs:2000,durationMode:'trim'},
    {startMs:731,trimInMs:0,trimOutMs:2000,durationMs:2000}
  ]) {
    const actual=reconcileGeminiVoiceSource({segment,sourceDurationMs:9240,playbackRate:2});
    assert.equal(actual.trimInMs,segment.trimInMs);assert.equal(actual.trimOutMs,segment.trimOutMs);
    assert.equal(actual.durationMs,1000);assert.equal(actual.startMs,731);
  }
});
test('a shifted 12-second voice continues through other scenes, a gap, and overlapping voice',async()=>{
  const c=new Controller(); c.state.session={id:'s'};c.state.isPlaying=true;
  const segments=[{rowId:'r',startMs:731,trimInMs:0,trimOutMs:12000,durationMs:12000},{rowId:'next',startMs:8000,trimInMs:0,trimOutMs:9000,durationMs:9000}];
  const media={r:{downloadUrl:'voice.wav'},next:{downloadUrl:'next.wav'}};
  c.deps={getPodcastVideoConfig:()=>({geminiDialogueTrack:{enabled:true,segments}}),buildTimelineRuntimeEntries:()=>[{rowId:'r',startMs:24000,endMs:32000},{rowId:'next',startMs:0,endMs:8000}],resolveDialogueAudioForRow:(_,r)=>media[r],resolveDialogueAudioPlaybackRate:()=>1};
  c.syncBackgroundMusic=async()=>{};c.prepareDialogueRow=async()=>({ready:true});c.seekTo=(a,t)=>a.currentTime=t;
  for(const r of ['r','next']) {c.dialoguePlayers[r]={tagName:'AUDIO',dataset:{initialized:'false'},currentTime:0,readyState:4,paused:true,playbackRate:1,pause(){this.paused=true;},async play(){this.paused=false;}}; c.dialogueAudioSourceKeys[r]=c.resolveAudioSourceKey(media[r]);}
  for(const ms of [731,7999,8000,12000,12730]) {await c.syncAudio(ms,1);assert.equal(c.dialoguePlayers.r.paused,false);}
  assert.equal(c.dialoguePlayers.next.paused,false);
  await c.syncAudio(12731,1);assert.equal(c.dialoguePlayers.r.paused,true);assert.equal(c.dialoguePlayers.next.paused,false);
});
test('total timeline duration includes voice beyond the last video and respects its trim/rate',()=>{
  const segment={rowId:'r',startMs:20000,trimInMs:1000,trimOutMs:11000,durationMs:10000};
  const context=vm.createContext({buildTimelineRuntimeEntries:()=>[{endMs:8000}],ensureTimelineClipsByRowId:()=>({}),getTimelineClipEndMs:()=>8000,
    getPodcastVideoConfig:()=>({geminiDialogueTrack:{enabled:true,segments:[segment]}}),normalizeGeminiDialogueTrack:t=>t,getActiveSession:()=>({}),
    window:{resolveDialogueAudioPlaybackRate:()=>2},resolveRowAudioDurationMs:()=>6000,resolveGeminiAudioTimelineDurationMs,
    getOnScreenTextTimelineMaxEndMs:()=>0,STUDIO_TIMELINE_MIN_CLIP_MS:500});
  vm.runInContext(sourceFunctions(new URL('../public/podcaster/podcaster-timeline-model.js',import.meta.url),['getTimelineTotalDurationMs']),context);
  assert.equal(context.getTimelineTotalDurationMs({id:'s'}),25000);
});

test('refreshing timing snapshots preserves players and clock without preparing all media again',()=>{
  const c=new Controller();const original={id:'s'}; c.state.session=original;c.state.currentMs=12400;c.state.isPlaying=true;
  const player={};c.dialoguePlayers.r=player;
  c.buildSessionSyncSignature=(_,cfg)=>JSON.stringify(cfg);
  c.prepareSessionMedia=()=>{throw new Error('unrequested media preparation');};
  c.deps={getTimelineTotalDurationMs:()=>30000};
  const next={id:'s'};c.sync(next,{geminiDialogueTrack:{segments:[{startMs:20000}]}},{prepareMedia:false});
  assert.equal(c.state.session,next);assert.equal(c.state.currentMs,12400);assert.equal(c.state.isPlaying,true);assert.equal(c.dialoguePlayers.r,player);
});

test('metadata arrival updates voice geometry without selection, dragging, or media preparation',()=>{
  let session={id:'s',podcastVideoConfig:{geminiDialogueTrack:{segments:[]}}};const calls=[];
  const controller={sync:(s,c,o)=>calls.push({s,c,o})};
  const geometry=[];
  const track={enabled:true,segments:[{rowId:'r',startMs:15900,trimOutMs:9240}]};
  const context=vm.createContext({getActiveSession:()=>session,getPodcastVideoConfig:s=>s.podcastVideoConfig,
    normalizeGeminiDialogueTrack:t=>t,reconcileGeminiDialogueTrackWithRuntime:()=>({changed:true,track}),
    upsertPodcastVideoConfig:fn=>{session={...session,podcastVideoConfig:fn(session.podcastVideoConfig)};},
    playbackController:controller,exportPreviewController:controller,syncOnScreenTextClipsWithGeminiTrack:()=>false,
    podcasterTimelineUiApi:{syncTimelineGeminiSegmentDragPreview:s=>geometry.push(s)},
    scheduleSessionLocalPersist:()=>{},renderPodcastVideoTimeline:()=>{},syncPodcastStudioInspector:()=>{}});
  vm.runInContext(sourceFunctions(app,['syncGeminiDialogueTrackWithRuntime']),context);
  assert.equal(context.syncGeminiDialogueTrackWithRuntime({render:false}),true);
  assert.equal(geometry.length,1);assert.equal(geometry[0],session);
  assert.equal(calls.length,2);for(const call of calls){assert.equal(call.s,session);assert.equal(call.c.geminiDialogueTrack,track);assert.equal(call.o.prepareMedia,false);}
});

test('normalization and reload preserve imported source trims without a scene anchor',()=>{
  const first=mediaState.normalizeDialogueSegment({rowId:'r',audioSrc:'voice.wav',startMs:731,trimInMs:0,trimOutMs:2000,durationMs:2000});
  const restored=mediaState.normalizeDialogueSegment(JSON.parse(JSON.stringify(first)));
  assert.equal(restored.durationMode,'trim');
  const actual=reconcileGeminiVoiceSource({segment:restored,sourceDurationMs:9240,playbackRate:1});
  assert.equal(actual.trimOutMs,2000);assert.equal(actual.durationMs,2000);
});
