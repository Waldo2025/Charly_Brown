import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import {webcrypto} from "node:crypto";
const files=new Map();
const context=vm.createContext({crypto:webcrypto,Blob,Date,Map,Set,console,TextEncoder,TextDecoder,
  ref:(_storage,path)=>({fullPath:path}),
  uploadBytes:async(reference,blob)=>files.set(reference.fullPath,await blob.text()),
  getBytes:async reference=>new TextEncoder().encode(files.get(reference.fullPath)),
  listAll:async reference=>({items:[...files.keys()].filter(key=>key.startsWith(reference.fullPath+"/")).map(fullPath=>({fullPath}))}),
});
vm.runInContext((await readFile(new URL("../public/js/sally-history.js",import.meta.url),"utf8")).replace(/^import[^\n]+\n/,"").replaceAll("export ",""),context);
const first=await context.appendHistory({},"alice","project",{role:"assistant",kind:"analysis",text:"Reporte completo uno",inventoryPath:"run-one.json"});
const second=await context.appendHistory({},"alice","project",{role:"assistant",kind:"analysis",text:"Reporte completo dos",inventoryPath:"run-two.json"});
assert.notEqual(first.path,second.path);assert.equal(files.size,2);
const history=await context.loadHistory({},{id:"project",ownerId:"alice"});
assert.equal(history.length,2);assert.ok(history.some(entry=>entry.text==="Reporte completo uno"));assert.ok(history.some(entry=>entry.text==="Reporte completo dos"));
assert.equal((await context.loadHistory({},{id:"another",ownerId:"alice"})).length,0);
const complete="Respuesta íntegra ".repeat(10000);
await context.appendHistory({},"alice","project",{role:"assistant",thread:"model",text:complete});
await context.appendHistory({},"alice","project",{role:"assistant",thread:"target",text:"Destino independiente",questions:["Pregunta guardada"]});
const restored=await context.loadHistory({},{id:"project",ownerId:"alice"});
assert.equal(restored.find(entry=>entry.thread==="model").text,complete);
assert.equal(restored.find(entry=>entry.thread==="target").questions[0],"Pregunta guardada");
console.log("PASS: repeated reports use immutable files, reload preserves both reports, separate sessions stay isolated.");
