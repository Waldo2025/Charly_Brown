import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {sourceFunctions} from './helpers/snoopy-source.mjs';
const app=new URL('../public/podcaster/podcaster.js',import.meta.url);
for(const rate of [0.5,1.25,2]) test(`track-only voice restores physical duration before interaction (${rate}x)`,()=>{
 const segment={rowId:'r',audioSrc:'voice.wav',startMs:1000,durationMs:12000/rate,trimInMs:0,trimOutMs:12000};
 const c=vm.createContext({getPodcastVideoConfig:()=>({geminiDialogueTrack:{segments:[segment]}}),normalizeGeminiDialogueTrack:t=>t,normalizePersistedMediaReference:u=>({downloadUrl:u}),getSessionRows:()=>[{id:'r',playbackRate:rate}],nowIso:()=>new Date().toISOString()});
 vm.runInContext(sourceFunctions(app,['resolveFallbackDialogueAudioForRow']),c);
 assert.equal(c.resolveFallbackDialogueAudioForRow({},'r').durationSec,12);
});
test('metadata refreshes existing geometry even when saved timing is already reconciled',()=>{
 const session={id:'s',podcastVideoConfig:{}};let geometry=0;
 const c=vm.createContext({getActiveSession:()=>session,normalizeGeminiDialogueTrack:t=>t,reconcileGeminiDialogueTrackWithRuntime:()=>({changed:false}),upsertPodcastVideoConfig:fn=>fn({}),podcasterTimelineUiApi:{syncTimelineGeminiSegmentDragPreview:()=>geometry++},syncOnScreenTextClipsWithGeminiTrack:()=>false});
 vm.runInContext(sourceFunctions(app,['syncGeminiDialogueTrackWithRuntime']),c);
 assert.equal(c.syncGeminiDialogueTrackWithRuntime({render:false}),false);
 assert.equal(geometry,1);
});
test('moving a sped-up voice changes position without rewriting physical trims',()=>{
 const source=readFileSync(new URL('../public/podcaster/podcaster-timeline-interaction.js',import.meta.url),'utf8');
 const start=source.indexOf('      const patchByRowId = new Map(snapshot.map');
 const end=source.indexOf('      upsertPodcastVideoConfig',start);
 const segment={rowId:'r',startMs:1000,durationMs:6000,trimInMs:1000,trimOutMs:13000};
 const c=vm.createContext({snapshot:[segment],baseTrack:{segments:[segment]},targetDelta:500,dragStepMs:1,STUDIO_TIMELINE_MIN_CLIP_MS:500,snapTimelineMsWithStep:n=>n});
 const [moved]=vm.runInContext(source.slice(start,end)+'\nnextSegments',c);
 assert.equal(moved.startMs,1500);assert.equal(moved.durationMs,6000);assert.equal(moved.trimOutMs,13000);assert.equal(moved.trimInMs,1000);
});
