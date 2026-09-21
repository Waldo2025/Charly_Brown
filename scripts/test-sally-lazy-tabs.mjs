import assert from "node:assert/strict";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {chromium} from "playwright";
const {collectTabbedCourse}=createRequire(import.meta.url)("../backend/sally/course-reader.js");
const section=n=>`<div class="course-section" data-sectionid="${n}"><h3>Sección ${n}</h3><div class="activity-item"><a href="/mod/page/view.php?id=${n}">Página ${n}</a></div></div>`;
const server=createServer((req,res)=>{
  res.setHeader("Content-Type","text/html; charset=utf-8");
  if(req.url.startsWith("/fragment"))return setTimeout(()=>res.end(req.url.includes("child")?section(3):`<div role="tablist"><button role="tab" id="child" aria-controls="pchild">Subpestaña dinámica</button></div><div role="tabpanel" id="pchild"></div>${section(1)}`),150);
  res.end(`<body class="format-onetopic course-86"><h1>Lazy course</h1><div role="tablist"><button role="tab" id="first" aria-controls="pfirst">Primera pestaña</button><button role="tab" id="second" aria-controls="psecond">Segunda pestaña</button><a class="disabled" aria-disabled="true">Restringida</a></div><div role="tabpanel" id="pfirst" hidden></div><div role="tabpanel" id="psecond" hidden>${section(2)}</div><script>
  first.onclick=async()=>{pfirst.hidden=false;psecond.hidden=true;pfirst.innerHTML=await(await fetch('/fragment')).text();child.onclick=async()=>{pchild.innerHTML=await(await fetch('/fragment?child')).text();};};
  second.onclick=()=>{pfirst.hidden=true;psecond.hidden=false;};
  </script></body>`);
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));const browser=await chromium.launch();
try{
  const page=await browser.newPage();const url="http://127.0.0.1:"+server.address().port+"/course/view.php?id=86";await page.goto(url);
  const result=await collectTabbedCourse(page,url);
  assert.equal(result.sections.length,3,JSON.stringify({tabs:result.tabs,warnings:result.warnings}));assert.equal(result.tabs.find(t=>t.title==="Subpestaña dinámica").status,"read");
  assert.equal(result.tabs.find(t=>t.title==="Subpestaña dinámica").parentKey,"control:first");
  assert.equal(result.tabCoverage.complete,false);assert.ok(result.warnings.some(w=>w.code==="tab-restricted"));
  console.log("PASS: async button tabs, parent reactivation, nested content, restricted tabs mark incomplete coverage.");
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
