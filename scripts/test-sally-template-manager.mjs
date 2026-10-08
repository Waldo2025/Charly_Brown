import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {chromium} from "playwright";
const root=path.resolve("public");
const server=createServer(async(req,res)=>{try{const file=path.join(root,new URL(req.url,"http://localhost").pathname);res.setHeader("Content-Type",/\.m?js$/.test(file)?"text/javascript":file.endsWith(".css")?"text/css":"text/html");res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.route("**/js/SallyBrownEditor.js",r=>r.fulfill({body:""}));await page.route("**/js/sidebar.js",r=>r.fulfill({body:""}));
 await page.goto(`http://127.0.0.1:${server.address().port}/SallyBrownEditor.html`);
 await page.evaluate(async()=>{
   document.getElementById("sallyAccessGate").remove();document.getElementById("sallyApp").hidden=false;
   const {installTemplateManager}=await import("/js/sally-template-manager.js");window.rows=[{id:"shared",name:"Nota del maestro",html:'<aside style="border-left:4px solid #4c66a3;padding:18px;background:#f3f5fa"><h3>Nota del maestro</h3><p>{{contenido}}</p></aside>',version:1,ownerId:"bob",archived:false}];
   window.writes=0;let next;
   installTemplateManager({state:{user:{uid:"alice"},history:[]},el:id=>document.getElementById(id),toast:()=>{},apply:async t=>{window.applied=t;},prepare:async()=>{window.writes++;},store:{watch(fn){next=fn;fn(rows);return()=>{};},async save(t){if(window.failSave)throw Error("No se pudo guardar");const id=t.id||"mine";const old=rows.find(r=>r.id===id);if(old&&old.ownerId!=="alice")throw Error("No autorizado");const row={...t,id,ownerId:"alice",version:(old?.version||0)+1};rows=rows.filter(r=>r.id!==id).concat(row);next(rows);return id;}}});
 });
 assert.equal(await page.locator("#sallyBriefPane #sallyTemplatesPanel").count(),0);
 assert.equal(await page.locator(".sally-topbar #sallyOpenTemplates").count(),1);
 await page.click("#sallyOpenTemplates");assert.equal(await page.locator("#sallyTemplateModal").isVisible(),true);
 await page.selectOption("#sallyTemplateList","shared");assert.equal(await page.locator("#sallySaveTemplate").isDisabled(),true);
 assert.equal(await page.locator("#sallyUseTemplate").count(),0);assert.equal(await page.locator("#sallyPrepareTemplate").count(),0);assert.equal(await page.evaluate(()=>writes),0);
 await page.fill("#sallyTemplateName","Nota personalizada");await page.fill("#sallyTemplateHtml",'<div style="color:#234;padding:20px;background:#f1f4fb;border-left:4px solid #456"><h3>Nota docente</h3><p>{{contenido}}</p></div><script>parent.injected=true</script>');
 await page.click("#sallyCopyTemplate");await page.waitForFunction(()=>rows.some(t=>t.id==="mine"));assert.equal(await page.evaluate(()=>rows.find(t=>t.id==="shared").name),"Nota del maestro");assert.doesNotMatch(await page.evaluate(()=>rows.find(t=>t.id==="mine").html),/<script>/);assert.equal(await page.locator("#sallySaveTemplate").isEnabled(),true);
 assert.equal(await page.locator("#sallyTemplatePreview").evaluate(node=>node.tagName),"DIV");assert.equal(await page.evaluate(()=>document.getElementById("sallyTemplatePreview").shadowRoot.querySelector("script")),null);assert.equal(await page.evaluate(()=>window.injected),undefined);
 assert.match(await page.evaluate(()=>rows.find(t=>t.id==="mine").html),/style=/);assert.equal(await page.locator("#sallyTemplateValues").isVisible(),false);
 await page.locator(".sally-template-fields textarea").fill("Revisa los objetivos antes de iniciar la actividad.");
 await page.screenshot({path:"artifacts/sally-template-manager-desktop.png"});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:"artifacts/sally-template-manager-mobile.png"});assert.equal(await page.locator("#sallyTemplateModal").evaluate(n=>n.scrollWidth<=n.clientWidth),true);
 await page.keyboard.press("Escape");assert.equal(await page.locator("#sallyTemplateModal").isVisible(),false);assert.equal(await page.locator("#sallyOpenTemplates").evaluate(n=>n===document.activeElement),true);
 console.log("PASS: modal relocation, global list, owner/copy controls, safe preview, non-mutating application, full HTML, responsive layout and Escape focus return.");
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
