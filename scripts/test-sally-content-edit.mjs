import assert from "node:assert/strict";
import {createServer} from "node:http";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const {createSallyBrownController}=require("../backend/sally/controller.js");
const {cleanMoodleHtml}=require("../backend/sally/html-policy.js");
let html="<p>Anterior</p>",visible="1",writes=0;
const escape=text=>text.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll('"',"&quot;");
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,"http://localhost");res.setHeader("Content-Type","text/html; charset=utf-8");
  if(req.method==="POST"){let data="";for await(const chunk of req)data+=chunk;const form=new URLSearchParams(data);html=form.get("content");visible=form.get("visible");writes++;res.writeHead(302,{Location:"/course/view.php?id=49"});return res.end();}
  if(url.pathname==="/course/modedit.php"){
    const id=url.searchParams.get("update");return res.end(`<form method="post"><input name="course" value="${id==="8"?"99":"49"}"><input name="modulename" value="${id==="9"?"quiz":"page"}"><textarea style="display:none" name="content">${escape(html)}</textarea><select name="visible"><option value="0" ${visible==="0"?"selected":""}>Oculto</option><option value="1" ${visible==="1"?"selected":""}>Visible</option></select><input type="submit" name="submitbutton" value="Guardar"></form>`);
  }
  res.end('<main><h1>Curso</h1><div class="course-section"><h2>Sección</h2></div></main>');
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const base="http://127.0.0.1:"+server.address().port,directory=await mkdtemp(path.join(tmpdir(),"sally-edit-test-"));
const actor={uid:"alice",idToken:"fixture"},controller=createSallyBrownController({getPath:()=>directory,sendEvent:()=>{},reauthorize:async()=>actor});
const clean=cleanMoodleHtml('<div style="color:#123;padding:10px;background-image:url(https://bad.test/x)" onclick="bad()">Correcto<script>bad()</script></div>');
assert.match(clean,/color:#123/);assert.match(clean,/padding:10px/);assert.doesNotMatch(clean,/script|onclick|url\(/);
const operation=id=>[{id:crypto.randomUUID(),type:"create_or_update_resource",target:base+"/course/view.php?id=49",payload:{moduleId:id,html:clean,mode:"append",visibility:"hidden"}}];
try{
  await controller.start({url:base+"/course/view.php?id=85",modelUrl:base+"/course/view.php?id=85",targetUrl:base+"/course/view.php?id=49"},actor);
  const plan=operation("7");
  const {checkpoints}=await controller.checkpoint({plan,targetUrl:base+"/course/view.php?id=49"},actor);
  assert.equal(checkpoints[0].html,"<p>Anterior</p>");assert.equal(checkpoints[0].reversible,true);assert.equal(writes,0);
  plan[0].payload.expectedHash=checkpoints[0].hash;
  await controller.approve({plan},actor);const result=await controller.execute({plan,targetUrl:base+"/course/view.php?id=49"},actor);
  assert.equal(result.state,"completed");assert.equal(visible,"0");assert.match(html,/Anterior/);assert.match(html,/Correcto/);assert.match(html,/color:#123/);assert.equal(writes,1);
  for(const id of ["8","9"]){const invalid=operation(id);await controller.approve({plan:invalid},actor);await assert.rejects(()=>controller.execute({plan:invalid,targetUrl:base+"/course/view.php?id=49"},actor),/no pertenece|Solo se admite/);}
  assert.equal(writes,1,"Wrong course and unsupported module must never be saved");
  const rollback=operation("7");rollback[0].payload={moduleId:"7",mode:"replace",html:checkpoints[0].html,visibility:"visible",expectedHash:result.results[0].result.afterHash};
  html+="<p>Cambio posterior</p>";
  await controller.approve({plan:rollback},actor);
  await assert.rejects(()=>controller.execute({plan:rollback},actor),/cambió|respaldo/);assert.equal(writes,1);
  html=result.results[0].result.afterHtml;
  await controller.approve({plan:rollback},actor);await controller.execute({plan:rollback},actor);
  assert.equal(html,"<p>Anterior</p>");assert.equal(visible,"1");assert.equal(writes,2);
  const modelPlan=operation("7");modelPlan[0].target=base+"/course/view.php?foo=1&id=85";
  await controller.approve({plan:modelPlan},actor);await assert.rejects(()=>controller.execute({plan:modelPlan,targetUrl:modelPlan[0].target},actor),/modelo/);
  console.log("PASS: inline styles sanitized/preserved, appended content verified, hidden Moodle visibility verified, other course and quizzes denied.");
}finally{await controller.close({},actor);await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
