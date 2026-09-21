import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
const root=path.resolve("public");
const server=createServer(async(req,res)=>{
  const file=path.join(root,new URL(req.url,"http://localhost").pathname);
  try {const data=await readFile(file);res.setHeader("Content-Type",/\.m?js$/.test(file)?"text/javascript":file.endsWith(".css")?"text/css":file.endsWith(".html")?"text/html":"application/octet-stream");res.end(data);}
  catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const browser=await chromium.launch();
try{
  for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
    const page=await browser.newPage({viewport});
    await page.route("**/js/SallyBrownEditor.js",route=>route.fulfill({body:"",contentType:"text/javascript"}));
    await page.route("**/js/sidebar.js",route=>route.fulfill({body:"",contentType:"text/javascript"}));
    await page.goto("http://127.0.0.1:"+server.address().port+"/SallyBrownEditor.html");
    await page.evaluate(()=>{
      document.getElementById("sallyAccessGate").remove();
      document.getElementById("sallyApp").hidden=false;
      document.getElementById("sallyDesktopOnlyNotice").hidden=true;
    });
    assert.equal(await page.locator("#sallyMoodleUrl").isVisible(),false);
    assert.equal(await page.locator("#sallyBrowserLoading").isVisible(),false);
    assert.equal(await page.locator(".sally-workspace").evaluate(n=>n.scrollWidth>n.clientWidth),false);
    assert.match(await page.locator(".sally-brand h1").evaluate(n=>getComputedStyle(n).fontFamily),/Inter/);
    await page.screenshot({path:"artifacts/sally-redesign-"+viewport.width+".png"});
    if(viewport.width===1440){
      const template=await page.evaluate(async()=>{
        const {fillTemplate,contentMatches}=await import("/js/sally-template.js");
        let missing=false;try{fillTemplate("<p>{{falta}}</p>",{});}catch{missing=true;}
        return {html:fillTemplate('<div style="color:#123;padding:12px">{{contenido}}</div>',{contenido:'Texto <script>no ejecutar</script>'}),missing,matches:contentMatches([{courseView:"model",pages:[{title:"Guía",text:"Objetivos del docente"}]}],"docente").length};
      });
      assert.match(template.html,/style=/);assert.doesNotMatch(template.html,/<script>/);assert.equal(template.missing,true);assert.equal(template.matches,1);
      await page.evaluate(async()=>{
        const image=document.getElementById("sallyBrowserImage");
        image.src="data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="900"><rect width="1440" height="900" fill="white"/><text x="100" y="150">Curso modelo</text></svg>');
        image.hidden=false;document.getElementById("sallyEmptyBrowser").hidden=true;
        await image.decode();
        const {bindSelection}=await import("/js/sally-selection.js");
        bindSelection({state:{courseView:"target"},invoke:async(command,payload)=>{window.testRegion=payload.region;return {text:"Contenido marcado",url:"https://moodle.test/mod/page/view.php?id=1"};},toast:()=>{},save:async()=>{},changed:()=>{}});
      });
      await page.click("#sallyPencil");
      const r=await page.locator("#sallyBrowserImage").boundingBox();
      await page.mouse.move(r.x+r.width*.2,r.y+r.height*.2);await page.mouse.down();
      await page.mouse.move(r.x+r.width*.6,r.y+r.height*.5);await page.mouse.up();
      const region=await page.evaluate(()=>window.testRegion);
      assert.ok(Math.abs(region.x-.2)<.01);assert.ok(Math.abs(region.width-.4)<.01);
      assert.equal(await page.locator("#sallySelectionContext").isVisible(),true);
      const controllerSource=(await readFile(path.join(root,"js/SallyBrownEditor.js"),"utf8")).replace(/^import .*;\n/gm,"").split("let authResolved = false;")[0];
      await page.evaluate(async source=>{
        Object.assign(window,await import("/js/sally-conversations.js"),await import("/js/sally-conversation-ui.js"));
        const stub=`const getDefaultFirebaseApp=()=>({}),getAuth=()=>({}),getFirestore=()=>({}),getStorage=()=>({}),doc=()=>({}),arrayUnion=x=>[x],updateDoc=async()=>{},rememberSession=()=>{},loadHistory=async()=>[],sanitizeTextInput=x=>x;const appendHistory=async(_s,_u,_id,entry)=>({...entry,id:crypto.randomUUID(),createdAt:new Date().toISOString()});`;
        (0,eval)(stub+source+`;state.user={uid:'fixture'};state.activeId='fixture';state.conversationId='legacy-model';state.conversations=installConversations({state,el,record:recordConversation,readJson:async()=>({}),toast,render:renderChatScope});window.sallyTest={state,selectChat,recordConversation,applySnapshot,renderConversation};`);
      },controllerSource);
      await page.evaluate(async()=>{
        const {state,recordConversation,selectChat}=window.sallyTest;
        document.getElementById("sallyBrief").value="Borrador modelo";
        await recordConversation({role:"assistant",thread:"model",text:"MODELO "+"texto completo ".repeat(1000)});
        await recordConversation({role:"assistant",thread:"target",conversationId:"legacy-target",text:"RESPUESTA DESTINO",questions:["Pregunta completa guardada"]});
        await selectChat("target");document.getElementById("sallyBrief").value="Borrador destino";
      });
      assert.match(await page.locator("#sallyConversation").innerText(),/RESPUESTA DESTINO/);
      assert.doesNotMatch(await page.locator("#sallyConversation").innerText(),/MODELO/);
      assert.equal(await page.locator("#sallySourceCourse").isVisible(),false);
      await page.evaluate(()=>window.sallyTest.selectChat("model"));
      assert.equal(await page.locator("#sallyBrief").inputValue(),"Borrador modelo");
      assert.ok((await page.locator("#sallyConversation").innerText()).length>14000);
      assert.doesNotMatch(await page.locator("#sallyConversation").innerText(),/RESPUESTA DESTINO/);
      page.once("dialog",dialog=>dialog.accept("1"));
      await page.click('#sallyConversation button[title="Compartir referencia con otra conversación"]');
      await page.waitForFunction(()=>window.sallyTest.state.chatThread==="target");
      assert.match(await page.locator("#sallyConversation").innerText(),/MODELO/);
      assert.equal(await page.locator("#sallyBrief").inputValue(),"Borrador destino");
      await page.locator("#sallyBriefPane").evaluate(node=>node.scrollTop=0);
      await page.screenshot({path:"artifacts/sally-chat-tabs-1440.png"});
      await page.evaluate(()=>{
        const image=document.getElementById("sallyBrowserImage").src;
        window.sallyTest.applySnapshot({image,title:"Fotograma reciente",capturedAt:2000,reason:"manual-input"});
        window.sallyTest.applySnapshot({image,title:"Fotograma antiguo",capturedAt:1000,reason:"manual-input"});
      });
      assert.equal(await page.locator("#sallyBrowserTitle").textContent(),"Fotograma reciente");
      await page.evaluate(()=>window.sallyTest.recordConversation({role:"assistant",thread:"target",text:"Última respuesta completa"}));
      const entries=page.locator("#sallyConversation > details");
      assert.equal(await entries.count(),3);
      assert.match(await entries.first().textContent(),/Última respuesta completa/);
      assert.equal(await entries.first().evaluate(n=>n.open),true);
      assert.equal(await entries.nth(1).evaluate(n=>n.open),false);
      await entries.nth(1).locator(":scope > summary").focus();await page.keyboard.press("Enter");
      assert.equal(await entries.nth(1).evaluate(n=>n.open),true);
      await page.evaluate(()=>window.sallyTest.renderConversation());
      assert.equal(await entries.nth(1).evaluate(n=>n.open),true,"User-expanded messages survive rerender");
      assert.ok((await entries.nth(1).locator(".sally-history-text").textContent()).length>14000,"Collapsing must not truncate the response");
      await entries.nth(1).locator(":scope > summary").click();
      await page.evaluate(()=>window.sallyTest.renderConversation());
      assert.equal(await entries.nth(1).evaluate(n=>n.open),false);
      await entries.first().scrollIntoViewIfNeeded();
      await page.screenshot({path:"artifacts/sally-history-collapsible-desktop.png"});
      await page.setViewportSize({width:390,height:844});
      await page.locator("#sallyBriefPane").evaluate(n=>n.classList.add("is-open"));
      await entries.first().scrollIntoViewIfNeeded();
      assert.equal(await entries.first().evaluate(n=>n.scrollWidth>n.clientWidth),false);
      await page.screenshot({path:"artifacts/sally-history-collapsible-mobile.png"});
    }
    await page.close();
  }
  console.log("Sally: clear canvas, responsive layout, typography and region mapping passed.");
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
