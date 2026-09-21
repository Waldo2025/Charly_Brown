import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {sourceFunctions} from './helpers/snoopy-source.mjs';
const code=sourceFunctions(new URL('../public/podcaster/podcaster.js',import.meta.url),['scheduleGeminiAudioMetadataSync']);
function setup(){
 let session={id:'s',activeThreadId:'v'};let calls=0;const tasks=new Map();let seq=0;
 const c=vm.createContext({geminiMetadataSyncState:{timer:null,key:''},getActiveSession:()=>session,podcastVideoState:{},invalidateStudioRuntimeCache(){},syncGeminiDialogueTrackWithRuntime:()=>calls++,setTimeout:fn=>{tasks.set(++seq,fn);return seq;},clearTimeout:id=>tasks.delete(id)});
 vm.runInContext(code,c);return {c,tasks,session,run(){const [id,fn]=tasks.entries().next().value;tasks.delete(id);fn();},count:()=>calls,change:()=>session={id:'other'}};
}
test('many completed audio metadata loads produce a single deferred reconciliation',()=>{const f=setup();for(let i=0;i<28;i++)f.c.scheduleGeminiAudioMetadataSync(f.session);assert.equal(f.count(),0);assert.equal(f.tasks.size,1);f.run();assert.equal(f.count(),1);});
test('metadata does not modify geometry during a drag and flushes after release',()=>{const f=setup();f.c.podcastVideoState.timelineDrag={};f.c.scheduleGeminiAudioMetadataSync(f.session);f.run();assert.equal(f.count(),0);f.c.podcastVideoState.timelineDrag=null;f.run();assert.equal(f.count(),1);});
test('late metadata from a previous session is discarded',()=>{const f=setup();f.c.scheduleGeminiAudioMetadataSync(f.session);f.change();f.run();assert.equal(f.count(),0);f.c.scheduleGeminiAudioMetadataSync(f.session);assert.equal(f.tasks.size,0);});
