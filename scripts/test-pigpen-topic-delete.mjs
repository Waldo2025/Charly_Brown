import assert from 'node:assert/strict';
import { deleteTopicOnly } from '../public/js/pigpen-topic-delete.mjs';
import { readFileSync } from 'node:fs';
const parent={id:'session',path:'escapeRoom/session'};
const ref=id=>({id,path:`escapeRoom/session/topics/${id}`});
function harness(status='draft',ownerId='owner') {
 const data=new Map([[parent.path,{ownerId,status,activeTopicId:'a',topicSummaries:[{id:'a'},{id:'b'}],project:{title:'a'}}],
 [ref('a').path,{title:'a',project:{title:'a'},unknown:'keep'}],[ref('b').path,{title:'b',project:{title:'b'},unknown:'keep'}]]);
 const writes=[];
 const args={uid:'owner',topicId:'a',sessionRef:parent,topicRefs:[ref('a'),ref('b')],summarize:t=>({id:t.id,title:t.title}),timestamp:()=>1,schemaVersion:2,
 run:async fn=>{const pending=[];const result=await fn({get:async r=>({id:r.id,ref:r,exists:()=>data.has(r.path),data:()=>structuredClone(data.get(r.path))}),
 delete:r=>pending.push(['delete',r]),update:(r,p)=>pending.push(['update',r,p])});
 for(const [op,r,p] of pending){writes.push([op,r.path]);if(op==='delete')data.delete(r.path);else data.set(r.path,{...data.get(r.path),...p});}return result;}};
 return {data,args,writes};
}
let h=harness();const untouched=structuredClone(h.data.get(ref('b').path));
await deleteTopicOnly(h.args);
assert.equal(h.data.has(parent.path),true);assert.equal(h.data.has(ref('a').path),false);
assert.deepEqual(h.data.get(ref('b').path),untouched);assert.equal(h.data.get(parent.path).activeTopicId,'b');
assert.deepEqual(h.writes.filter(([op])=>op==='delete'),[['delete',ref('a').path]]);
await deleteTopicOnly({...h.args,topicId:'b',topicRefs:[ref('b')]});
assert.equal(h.data.get(parent.path).topicCount,0);assert.equal(h.data.get(parent.path).project,null);assert.deepEqual(h.data.get(parent.path).formState,{});
for (const legacyData of [{project:{title:'Legacy'}},{formState:{tema:'1'}}]) {
 h=harness();h.data.delete(ref('a').path);h.data.delete(ref('b').path);
 h.data.set(parent.path,{ownerId:'owner',status:'draft',...legacyData});
 await deleteTopicOnly({...h.args,topicId:'legacy',topicRefs:[]});
 assert.equal(h.data.has(parent.path),true);assert.equal(h.data.get(parent.path).project,null);
 assert.deepEqual(h.data.get(parent.path).formState,{});assert.equal(h.writes.some(([op])=>op==='delete'),false);
}
for(const [status,owner] of [['published','owner'],['draft','someone-else']]) {
 h=harness(status,owner);await assert.rejects(deleteTopicOnly(h.args));assert.equal(h.writes.length,0);
}
h=harness();await assert.rejects(deleteTopicOnly({...h.args,topicId:'missing'}));assert.equal(h.writes.length,0);
h=harness();h.data.get(parent.path).topicSummaries.push({id:'new'});
await assert.rejects(deleteTopicOnly(h.args),/cambió/);assert.equal(h.writes.length,0);
const source=readFileSync('public/js/PigPenCreator.js','utf8');
const start=source.indexOf('async function deleteTopicFromMenu('),end=source.indexOf('async function deleteSessionById(',start);
const handler=source.slice(start,end);
assert.doesNotMatch(handler,/deleteSessionById\(|deleteDoc\(/);assert.match(handler,/window.confirm/);assert.match(handler,/topicDeleteBusy/);
assert.match(handler,/flushStructuralEdits/);assert.match(handler,/updateParent:false/);
assert.equal((source.match(/data-delete-topic="\$\{/g)||[]).length,2);
console.log('PASS delete topic: exact document only, parent retained when empty, other content unchanged, permissions, missing topic, concurrent index, normal/structural menu wiring');
