import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {resolveGeminiAudioTimelineDurationMs} from '../public/podcaster/podcaster-montage-audio-timing.js';
const source = readFileSync(new URL('../public/podcaster/podcaster-timeline-ui.js',import.meta.url),'utf8');
test('audio chip duration helper is initialized before lightweight alignment can run',()=>{
 const helperIndex=source.indexOf('const resolveMontageAudioChipDurationMs =');
 const alignmentIndex=source.indexOf('const syncMontageAudioSubtrackAlignment =');
 const lightweightCallIndex=source.indexOf('syncMontageAudioSubtrackAlignment();',alignmentIndex);
 assert.ok(helperIndex>0);
 assert.ok(helperIndex<alignmentIndex);
 assert.ok(alignmentIndex<lightweightCallIndex);
});
// Execute the real geometry blocks from full rendering and post-render alignment.
const blocks = [...source.matchAll(/const audioDurationMs = Math\.max\(0, Math\.round\(Number\(resolveRowAudioDurationMs\?\.[\s\S]*?const (?:baseWidthPx|widthPx) = [^;]+;/g)].map(m=>m[0]);
assert.equal(blocks.length,2);
const helper = source.slice(source.indexOf('  function resolveGeminiSegmentVisibleDurationMs('), source.indexOf('  function renderPodcastVideoTimeline('));
blocks.push(source.match(/const visibleDurationMs = resolveGeminiSegmentVisibleDurationMs\(segment, activeSession\);[\s\S]*?const widthPx = [^;]+;/)[0]);
for (const rate of [0.5,1,1.25,2]) for (const trimmed of [false,true]) {
 test(`render and post-drop alignment match drag geometry at ${rate}x (trimmed=${trimmed})`,()=>{
  const segment={rowId:'voice',startMs:23000,trimInMs:trimmed?1000:0,trimOutMs:trimmed?9000:12000,durationMs:(trimmed?8000:12000)/rate};
  const duration=resolveGeminiAudioTimelineDurationMs({...segment,sourceDurationMs:12000,playbackRate:rate});
  for (const block of blocks) {
   const context=vm.createContext({segment,rowId:'voice',activeSession:{},timelineClip:{durationMs:8000},
    resolveRowAudioDurationMs:()=>12000/rate,
    resolveGeminiAudioTimelineDurationMs, resolveDialogueAudioPlaybackRate:()=>rate,
    resolveMontageAudioChipDurationMs:()=>8000,minAudioLoopPx:10,timelineMsToPx:ms=>ms/10});
   const width=vm.runInContext(helper+'\n'+block+'\n typeof baseWidthPx !== "undefined" ? baseWidthPx : widthPx;',context);
   assert.equal(width,duration/10-4);
  }
 });
}
