import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {sourceFunctions} from './helpers/snoopy-source.mjs';
const runtime=sourceFunctions(new URL('../public/podcaster/podcaster-timeline-model.js',import.meta.url),['buildTimelineRuntimeEntries']);
const reorder=sourceFunctions(new URL('../public/podcaster/podcaster.js',import.meta.url),['buildReorderedGeminiDialogueTrack']);
function setup(){
 const c=vm.createContext({window:{state:{activeSessionId:'s'}},getPodcastVideoConfig:s=>s.podcastVideoConfig,normalizePodcastVideoConfig:x=>x,getSessionRows:s=>s.script.rows,
 buildAugmentedTimelineRuntimeEntries:(_,o)=>Object.values(o.clipMap).map(clip=>({rowId:clip.rowId,clip,startMs:clip.startMs,endMs:clip.startMs+8000,effectiveDurationMs:8000,baseDurationMs:8000})),
 resolveDialogueVideoPhysicalDurationMs:()=>8000,resolveDialogueVideoForRow:()=>null,resolvePrimaryDialogueVideoSegment:()=>null,resolveStorageVideoUrl:()=>'',resolveDialogueAudioForRow:()=>null,resolveStorageAudioUrl:()=>'',resolveRowAudioDurationMs:()=>4000,resolveSpeakerDisplayName:x=>x,STUDIO_TIMELINE_MIN_CLIP_MS:500,
 normalizeGeminiDialogueTrack:x=>x,resolveGeminiSegmentRelativeOffsetMs:s=>s.startMs-s.anchorStartMs,resolveAutomaticGeminiSceneOffsetMs:()=>0,resolveGeminiSegmentDurationWithinScene:(_,d)=>d,clampGeminiSegmentStartToTimeline:(_,__,start)=>Math.max(0,start),normalizeGeminiDialogueTrackSegment:s=>s,nowIso:()=> 'new',resolveDialogueAudioPlaybackRate:()=>2});
 vm.runInContext(runtime+'\n'+reorder,c);return c;
}
const make=start=>({id:'s',updatedAt:'same',script:{rows:[{id:'a'},{id:'b'}]},podcastVideoConfig:{timelineClipsByRowId:{a:{rowId:'a',startMs:0},b:{rowId:'b',startMs:start}},geminiDialogueTrack:{enabled:true,updatedAt:'same',segments:[{rowId:'b',startMs:16000,anchorStartMs:16000,durationMs:4000,trimInMs:1000,trimOutMs:9000}]}}});
test('reordered snapshot with unchanged timestamps cannot reuse old video positions',()=>{const c=setup();c.buildTimelineRuntimeEntries(make(16000));const next=make(8000);assert.equal(c.buildTimelineRuntimeEntries(next)[1].startMs,8000);assert.equal(c.buildTimelineRuntimeEntries(next),c.buildTimelineRuntimeEntries(next));});
test('voice moves to the new video on the first reorder and preserves source trims',()=>{const c=setup(),before=make(16000),after=make(8000);const result=c.buildReorderedGeminiDialogueTrack(before,after);const audio=result.track.segments[0];assert.equal(audio.startMs,8000);assert.equal(audio.trimOutMs,9000);after.podcastVideoConfig.geminiDialogueTrack=result.track;const again=c.buildReorderedGeminiDialogueTrack(after,after);assert.equal(again.changed,false);});
