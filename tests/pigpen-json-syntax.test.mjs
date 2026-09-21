import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
import {repairJsonCommas} from '../public/js/pigpen-json-syntax.mjs';
test('Missing and trailing commas are repaired without changing authored values',()=>{
 const long='Observation '.repeat(5500);
 const raw='{"plans":{"r1_p1":{"evidence":'+JSON.stringify(long)+' "answer_target":"GESTURE"}},"mission":{"preguntas":[{"id":"a"} {"id":"b"},]},}';
 assert.throws(()=>JSON.parse(raw));
 assert.deepEqual(repairJsonCommas(raw),{plans:{r1_p1:{evidence:long,answer_target:'GESTURE'}},mission:{preguntas:[{id:'a'},{id:'b'}]}});
 assert.deepEqual(repairJsonCommas('{"text":"a, } \\"quoted\\"", "list":[1 2,3,]}'),{text:'a, } "quoted"',list:[1,2,3]});
});
test('Truncation, missing values and ambiguous quotes are never fabricated',()=>{
 for(const raw of ['{"a":"unfinished','{"a":1','{"a":}','{"a":"say "hello""}','{"a":undefined}','{} {}'])assert.throws(()=>repairJsonCommas(raw),raw);
});
test('Creator recovers locally and explicitly rejects MAX_TOKENS',()=>{
 const src=readFileSync(new URL('../public/js/PigPenCreator.js',import.meta.url),'utf8');
 const a=src.indexOf('function extractGeneratedJson('),b=src.indexOf('async function repairGeneratedEscapeRoomJson(',a);
 const c=src.indexOf('function extractJsonFromGeminiResponse('),d=src.indexOf('function extractGeminiImageData(',c);
 const context=vm.createContext({repairJsonCommas,extractGeminiText:r=>r.text});vm.runInContext(src.slice(a,b)+src.slice(c,d),context);
 assert.equal(context.extractJsonFromGeminiResponse({text:'{"a":1 "b":2}'}).b,2);
 assert.throws(()=>context.extractJsonFromGeminiResponse({text:'{"a":1}',candidates:[{finishReason:'MAX_TOKENS'}]}),e=>e.code==='gemini_output_truncated');
});
