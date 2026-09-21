import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../public/podcaster/podcaster-audio-output.js', import.meta.url), 'utf8');
function setup(saved = null) {
  const stored = new Map(saved ? [['snoopy.audioOutput', JSON.stringify(saved)]] : []);
  const c = vm.createContext({ window: {}, localStorage: { getItem:k=>stored.get(k), setItem:(k,v)=>stored.set(k,v) },
    document: {getElementById:()=>null, querySelectorAll:()=>[], documentElement:{}},
    navigator:{mediaDevices:{}}, HTMLMediaElement:{prototype:{setSinkId(){}}},
    MutationObserver:class {observe(){}}, WeakRef, DOMException, console });
  vm.runInContext(source,c);
  return {router:c.window.SnoopyAudioOutput,stored};
}
function player() {
  return {sinkId:'', plays:0, pauses:0, async setSinkId(id){this.sinkId=id;}, play(){this.plays++;return Promise.resolve();},pause(){this.pauses++;}};
}
test('saved speaker is applied before a detached player starts',async()=>{
 const {router}=setup({id:'speakers',label:'Integrados'});const p=player();router.register(p);await p.play();assert.equal(p.sinkId,'speakers');assert.equal(p.plays,1);
});
test('changing output routes every player and audio context and persists locally',async()=>{
 const {router,stored}=setup();const a=player(),b=player();const ctx={state:'suspended',setSinkId:async function(id){this.sinkId=id;},resume:async function(){this.state='running';}};
 router.register(a);router.register(b);router.register(ctx);await router.apply({deviceId:'speakers',label:'Integrados'});await ctx.resume();
 assert.equal(a.sinkId,'speakers');assert.equal(b.sinkId,'speakers');assert.equal(ctx.sinkId,'speakers');assert.equal(JSON.parse(stored.get('snoopy.audioOutput')).id,'speakers');
 await router.apply({deviceId:''});assert.equal(a.sinkId,'');
});
test('failed explicit output prevents playback through the default',async()=>{
 const {router}=setup({id:'missing'});const p=player();p.setSinkId=async()=>{throw new Error('missing');};router.register(p);await assert.rejects(p.play());assert.equal(p.plays,0);assert.ok(p.pauses>0);
});
test('pause while routing cannot restart the player',async()=>{
 const {router}=setup({id:'speakers'});const p=player();let finish;p.setSinkId=()=>new Promise(resolve=>{finish=resolve;});router.register(p);const pending=p.play();await new Promise(resolve=>setImmediate(resolve));p.pause();finish();await assert.rejects(pending,{name:'AbortError'});assert.equal(p.plays,0);
});
test('repeated registration does not wrap twice or reload a media source',async()=>{
 const {router}=setup();const p=player();p.src='cached:voice';let switches=0;p.setSinkId=async()=>{switches++;};router.register(p);const play=p.play;router.register(p);assert.equal(p.play,play);await p.play();await p.play();assert.equal(switches,1);assert.equal(p.src,'cached:voice');
});
