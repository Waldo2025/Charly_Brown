import assert from "node:assert/strict";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
const {createSallyBrownController}=createRequire(import.meta.url)("../backend/sally/controller.js");
const visited=[],writes=[];
const names=["Introducción","Libro Digital","Descargables","Experiencias audiovisuales","Tema 1","Estación 1.1","Estación 1.1.1"];
const server=createServer((req,res)=>{
  const u=new URL(req.url,"http://fixture");res.setHeader("Content-Type","text/html; charset=utf-8");
  if(req.method!=="GET")writes.push(req.url);
  if(u.pathname.startsWith("/mod/"))return res.end(`<main><h1>${u.searchParams.get("id")}</h1><p>Contenido de la estación ${u.searchParams.get("id")}</p></main>`);
  const section=Number(u.searchParams.get("section")||0);visited.push(section);
  const link=n=>`<a href="/course/view.php?id=85&section=${n}&onetopic_showall=0">${names[n]}</a>`;
  const children=section===4?`<ul class="format_onetopic-subtabs"><li>${link(5)}</li></ul>`:section===5?`<ul class="format_onetopic-subtabs"><li>${link(6)}</li></ul>`:"";
  res.end(`<body class="format-onetopic course-85"><h1>Curso por pestañas</h1><ul class="format_onetopic-tabs">${names.slice(0,5).map((_,i)=>`<li>${link(i)}${i===4?children:""}</li>`).join("")}</ul><div data-for="section" id="section-${section}" data-id="${100+section}" data-number="${section}"><h3 data-for="section_title">${names[section]}</h3><div class="summary"><p>Redacción de ${names[section]}</p></div><ul><li data-for="cmitem" class="modtype_page" data-id="${section+1}"><a href="/mod/page/view.php?id=${section+1}">Recurso ${section+1}</a></li></ul></div></body>`);
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const base="http://127.0.0.1:"+server.address().port,directory=await mkdtemp(path.join(tmpdir(),"sally-tabs-")),events=[];
const actor={uid:"fixture"};const controller=createSallyBrownController({getPath:()=>directory,sendEvent:e=>events.push(e)});
try{
  await controller.start({url:base+"/course/view.php?id=85",courseView:"model"},actor);
  const inventory=await controller.inspect({courseView:"model"},actor);
  assert.equal(inventory.format.id,"onetopic");assert.equal(inventory.tabCoverage.discovered,7);assert.equal(inventory.tabCoverage.read,7);
  assert.equal(inventory.sections.length,7);assert.equal(inventory.pages.length,7);assert.equal(inventory.coverage.complete,true);
  assert.ok(inventory.sections.every(s=>s.modules.length===1),"Nested activity wrappers must not duplicate modules");
  assert.match(inventory.sections.find(s=>s.title==="Libro Digital").summaryText,/Redacción/);
  assert.ok(visited.includes(6));assert.equal(writes.length,0);
  assert.ok(events.some(e=>e.type==="status"&&e.payload.message?.includes("Estación 1.1.1")));
  visited.length=0;const focused=await controller.inspect({courseView:"model",scope:"Tema 1"},actor);
  assert.deepEqual(focused.sections.map(section=>section.title),["Tema 1","Estación 1.1","Estación 1.1.1"]);
  assert.deepEqual(focused.pages.map(page=>new URL(page.url).searchParams.get("id")),["5","6","7"]);
  assert.equal(visited.includes(1)||visited.includes(2)||visited.includes(3),false,"Scoped analysis must not traverse unrelated tabs");
  console.log("PASS: seven tabs including recursively discovered subtabs, complete resources, format detection, summaries, deduplication, no writes.");
}finally{await controller.close({},actor);await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
