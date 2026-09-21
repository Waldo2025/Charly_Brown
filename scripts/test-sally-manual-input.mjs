import assert from "node:assert/strict";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
const {createSallyBrownController}=createRequire(import.meta.url)("../backend/sally/controller.js");
let value="";
const server=createServer((req,res)=>{
  if(req.url.startsWith("/value?")){value=new URL(req.url,"http://test").searchParams.get("text");return res.end("ok");}
  res.setHeader("Content-Type","text/html");res.end('<input style="position:absolute;left:0;top:0;width:200px;height:40px" oninput="fetch(\'/value?text=\'+encodeURIComponent(this.value))"><main style="height:3000px">Fixture</main>');
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const dir=await mkdtemp(path.join(tmpdir(),"sally-manual-"));const actor={uid:"fixture"},events=[];
const controller=createSallyBrownController({getPath:()=>dir,sendEvent:e=>events.push(e)});
try{
  await controller.start({url:"http://127.0.0.1:"+server.address().port},actor);
  const started=performance.now();
  const result=await controller.input({kind:"batch",events:[{kind:"click",x:20,y:20},{kind:"text",text:"Texto anterior"},{kind:"key",key:"Control+a"},{kind:"text",text:"Texto correcto"}]},actor);
  assert.ok(result.image);assert.ok(result.capturedAt);assert.equal(value,"Texto correcto");
  assert.equal(events.filter(e=>e.type==="snapshot"&&e.payload.reason==="manual-input").length,1);
  await assert.rejects(()=>controller.input({kind:"batch",events:[{kind:"text",text:"no"},{kind:"evaluate"}]},actor),/no permitido/);
  assert.equal(value,"Texto correcto");
  console.log(`PASS: ordered click/text/shortcut batch, one response frame, invalid batch rejected before typing; local batch ${Math.round(performance.now()-started)} ms.`);
}finally{await controller.close({},actor);await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
