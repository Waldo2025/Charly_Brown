import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {chromium} from "playwright";
const root=path.resolve("public");
const server=createServer(async(req,res)=>{try{const file=path.join(root,new URL(req.url,"http://localhost").pathname);res.setHeader("Content-Type",file.endsWith(".js")?"text/javascript":file.endsWith(".css")?"text/css":"text/html");res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.route("**/js/SallyBrownEditor.js",r=>r.fulfill({body:""}));await page.route("**/js/sidebar.js",r=>r.fulfill({body:""}));
 await page.goto(`http://127.0.0.1:${server.address().port}/SallyBrownEditor.html`);
 await page.evaluate(async()=>{
   document.getElementById("sallyAccessGate").remove();document.getElementById("sallyApp").hidden=false;document.getElementById("sallyResultsPanel").hidden=false;document.getElementById("sallyCurrentResults").hidden=true;
   window.views=await import("/js/sally-result-view.js");
   window.fixture={title:"Español 1, Bloque 1",url:"https://moodle.test/course/view.php?id=855",format:"Temas por pestañas",coverage:{complete:false},warnings:[{message:"Una subpestaña requiere revisión."}],tabs:[{title:"Introducción"},{title:"Libro digital",level:1}],sections:[{title:"Introducción",modules:[{title:"Tutorial de navegación",type:"page",url:"https://moodle.test/mod/page/view.php?id=1",text:"Contenido completo del tutorial."},{title:"Guía docente",type:"resource",url:"javascript:alert(1)",html:'<p>Texto seguro</p><script>window.injected=true</script>'}]}]};
   views.renderResult(document.getElementById("sallyResultDetail"),{kind:"analysis",text:"### Reporte del análisis\n\nEl curso organiza sus contenidos en **pestañas temáticas**."},fixture);
 });
 const result=page.locator("#sallyResultDetail");
 assert.equal(await result.locator("h4").first().textContent(),"Reporte del análisis");
 assert.equal(await result.locator("strong").first().textContent(),"pestañas temáticas");
 assert.doesNotMatch(await result.textContent(),/"sections"\s*:|"modules"\s*:|"coverage"\s*:/);
 assert.match(await result.textContent(),/Parcial/);assert.equal(await result.locator('a[href^="javascript:"]').count(),0);
 const section=result.locator("details").filter({has:page.locator("summary",{hasText:"Introducción · 2 recursos"})}).first();
 await section.locator(":scope > summary").focus();await page.keyboard.press("Enter");assert.equal(await section.evaluate(n=>n.open),true);
 assert.match(await result.textContent(),/Tutorial de navegación/);assert.equal(await page.evaluate(()=>window.injected),undefined);
 await page.screenshot({path:"artifacts/sally-friendly-results-desktop.png"});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:"artifacts/sally-friendly-results-mobile.png"});
 assert.equal(await result.evaluate(n=>n.scrollWidth<=n.clientWidth),true);
 await page.evaluate(()=>views.renderResult(document.getElementById("sallyResultDetail"),{kind:"plan",text:"Cambios propuestos",plan:[]},[{type:"create_or_update_resource",intent:"Actualizar guía docente",payload:{sectionTitle:"Introducción",visibility:"hidden",mode:"replace",html:'<p>Texto docente <strong>íntegro</strong></p>'}}]));
 assert.match(await result.textContent(),/Oculto a estudiantes/);assert.match(await result.textContent(),/Texto docente íntegro/);assert.doesNotMatch(await result.textContent(),/<p>|"payload"/);
 await page.evaluate(()=>views.renderChanges(document.getElementById("sallyChanges"),[{kind:"checkpoint",createdAt:"2026-09-08",text:"Respaldo guardado",checkpoints:[{moduleId:"10",reversible:true,visible:"0",html:"<p>Texto anterior completo</p>"}]},{kind:"execution",createdAt:"2026-09-08",text:"Cambio completado",result:{state:"completed",results:[{status:"completed",result:{action:"updated",verified:true,afterVisible:"0",afterHtml:"<p>Texto nuevo completo</p>",afterHash:"HASH_INTERNO"}}]}}]));
 const changes=await page.locator("#sallyChanges").textContent();assert.match(changes,/Resultado verificado/);assert.match(changes,/Texto anterior completo/);assert.match(changes,/Texto nuevo completo/);assert.doesNotMatch(changes,/HASH_INTERNO|"results"/);
 console.log("PASS: human-readable inventories/plans/backups/results, safe links and inert content, complete text, keyboard expansion, desktop/mobile layout.");
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
