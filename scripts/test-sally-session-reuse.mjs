import assert from "node:assert/strict";
import {createServer} from "node:http";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {createRequire} from "node:module";
const {createSallyBrownController}=createRequire(import.meta.url)("../backend/sally/controller.js");
const server=createServer((req,res)=>{
  if(req.url==="/login")res.setHeader("Set-Cookie","MoodleSession=fixture; HttpOnly; Path=/; SameSite=Lax");
  res.setHeader("Content-Type","text/html");
  const authenticated=req.headers.cookie?.includes("MoodleSession=fixture");
  res.end(`<main><h1>${authenticated?"Autenticado":"Sin sesión"}</h1><div class="course-section"><h2>Sección</h2></div></main>`);
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const base="http://127.0.0.1:"+server.address().port;
const directory=await mkdtemp(path.join(tmpdir(),"sally-cookie-test-"));
const firstProfile=path.join(directory,"profile-one"),secondProfile=path.join(directory,"profile-two"),sharedAuth=path.join(directory,"shared-auth");
const events=[],actor={uid:"alice"};
const controller=createSallyBrownController({getPath:kind=>kind==="userData"?firstProfile:kind==="authState"?sharedAuth:directory,sendEvent:event=>events.push(event)});
try{
  await controller.start({url:base+"/login"},actor);
  await controller.start({url:base+"/course/view.php?id=49",courseView:"target"},actor);
  const inventory=await controller.inspect({courseView:"target",url:base+"/course/view.php?id=49"},actor);
  assert.equal(inventory.title,"Autenticado","Repeated start must preserve session-only cookies and browser context");
  await controller.start({url:base+"/course/view.php?id=85",courseView:"model"},actor);
  assert.equal((await controller.inspect({courseView:"model"},actor)).title,"Autenticado");
  await controller.close({},actor);
  const reopened=createSallyBrownController({getPath:kind=>kind==="userData"?secondProfile:kind==="authState"?sharedAuth:directory,sendEvent:event=>events.push(event)});
  try{const reopenedUrl=base+"/course/view.php?id=49";await reopened.start({url:reopenedUrl,targetUrl:reopenedUrl,courseView:"target"},actor);assert.equal((await reopened.inspect({courseView:"target",url:reopenedUrl},actor)).title,"Autenticado","A new project and browser process must restore the shared Moodle cookie");}
  finally{await reopened.close({},actor);}
  console.log("PASS: Moodle session cookie survives repeated open, browser restart and project switching.");
}finally{await controller.close({},actor);await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
