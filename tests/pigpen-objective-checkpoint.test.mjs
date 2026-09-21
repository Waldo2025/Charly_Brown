import test from 'node:test';import assert from 'node:assert/strict';
import {createObjectiveCheckpointStore} from '../public/js/pigpen-objective-checkpoint.mjs';
test('Checkpoint fallback preserves next room and round trips the draft',async()=>{
 const map=new Map();const store=createObjectiveCheckpointStore({localStorage:{getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}});
 const draft={nextRoom:2,foundation:{rooms:[{id:1},{id:2}]}};await store.save('test',draft);assert.deepEqual(await store.load('test'),draft);await store.remove('test');assert.equal(await store.load('test'),null);
});
test('Unavailable durable storage fails instead of pretending the room was saved',async()=>{
 const store=createObjectiveCheckpointStore({localStorage:{getItem:()=>'{bad json',setItem:()=>{throw Error('quota');}}});assert.equal(await store.load('test'),null);await assert.rejects(store.save('test',{}),/quota/);
});
