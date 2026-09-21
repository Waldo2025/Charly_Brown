import assert from "node:assert/strict";
import { collectCourseInventories, isAnalysisOnly } from "../public/js/sally-workflow.js";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const calls=[];
const inventory={sections:[{title:"Destino",modules:[]}]};
const result=await collectCourseInventories({
  modelUrl:"",targetUrl:"https://example.test/course/view.php?id=49",views:["target"],available:true,
  open:async view=>calls.push(view),inspect:async payload=>{calls.push(payload);return inventory;},progress:()=>{}
});
assert.equal(result.target,inventory);
assert.equal(calls[0],"target");
assert.equal(calls[1].courseView,"target");
assert.equal(isAnalysisOnly("analizar el curso destino"),true);
assert.equal(isAnalysisOnly("analizar destino y modificar su texto"),false);
await assert.rejects(()=>collectCourseInventories({available:false}),/servidor/);
await assert.rejects(()=>collectCourseInventories({
  available:true,views:["target"],targetUrl:"https://example.test/course/view.php?id=49",
  open:async()=>{},inspect:async()=>({sections:[]}),progress:()=>{}
}),/Inicia sesión/);

const server=createServer((req,res)=>{
  const url=new URL(req.url,"http://localhost");
  res.setHeader("Content-Type","text/html; charset=utf-8");
  if(url.pathname.startsWith("/mod/")){
    if(url.searchParams.get("id")==="2"){res.statusCode=403;return res.end("Forbidden");}
    return res.end('<div id="content"><p>Recurso sin etiqueta main</p><form><input type="hidden" name="sesskey" value="private-fixture"></form><a href="/x?sesskey=private-fixture"></a></div>');
  }
  if(url.searchParams.get("id")==="99") return res.end('<form action="/login/index.php"><input name="password" type="password"></form>');
  const name=url.searchParams.get("id")==="49"?"Destino":"Modelo";
  res.end('<main id="region-main"><h1>'+name+'</h1><ul><li class="section" data-sectionid="1"><h3>'+name+' sección</h3><div class="activity-item"><a href="/mod/page/view.php?id=1">Página</a></div><div class="activity-item"><a href="/mod/page/view.php?id=2">Restringida</a></div></li></ul></main>');
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const base="http://127.0.0.1:"+server.address().port;
const temp=await mkdtemp(path.join(tmpdir(),"sally-analysis-test-"));
const require=createRequire(new URL("../backend/sally/controller.js",import.meta.url));
const mod={exports:{}};
const source=await readFile(new URL("../backend/sally/controller.js",import.meta.url),"utf8");
const context=vm.createContext({
  module:mod,exports:mod.exports,require:name=>name==="electron"?{app:{getPath:()=>temp}}:require(name),
  URL,Buffer,fetch,setInterval,clearInterval,console
});
vm.runInContext(source,context);
const events=[];
const controller=mod.exports.createSallyBrownController({sendEvent:event=>events.push(event),getPath:()=>temp});
const actor={uid:"test-user",role:"editor",email:"test@example.test"};
try {
  await controller.start({url:base+"/course/view.php?id=85",modelUrl:base+"/course/view.php?id=85",targetUrl:base+"/course/view.php?id=49"},actor);
  const inspected=await controller.inspect({courseView:"target",url:base+"/course/view.php?id=49"},actor);
  assert.equal(inspected.title,"Destino");
  assert.equal(inspected.courseView,"target");
  assert.equal(inspected.sections[0].title,"Destino sección");
  assert.equal(inspected.pages[0].text,"Recurso sin etiqueta main");
  assert.doesNotMatch(inspected.pages[0].html,/private-fixture|<form|<input/);
  assert.equal(inspected.coverage.complete,false);
  assert.equal(inspected.warnings.length,1);
  await controller.control({action:"cancel"},actor);
  assert.equal((await controller.inspect({courseView:"target",url:base+"/course/view.php?id=49"},actor)).pages.length,1,"A new analysis must reset the prior cancellation");
  assert.ok(events.some(event=>event.type==="snapshot"&&event.payload.url.includes("/mod/page/view.php")),"Reader page must be streamed");
  assert.ok(events.some(event=>event.type==="inventory"&&event.payload.inProgress),"Inventory must be delivered before completion");
  await assert.rejects(()=>controller.inspect({courseView:"target",url:base+"/course/view.php?id=99"},actor),/Inicia sesión/);
  console.log("Passed: destination analysis reads destination, requires login, blocks empty inventory and works without model.");
} finally {
  await controller.close({},actor);
  await new Promise(resolve=>server.close(resolve));
  await rm(temp,{recursive:true,force:true});
}
