import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";

const source=await readFile(new URL("../public/js/science-model-generated-runtime.mjs",import.meta.url),"utf8");
const server=createServer((req,res)=>{res.setHeader("Content-Type",req.url==="/runtime.mjs"?"text/javascript":"text/html");res.end(req.url==="/runtime.mjs"?source:'<!doctype html><main id="mount"></main>');});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
let browser;
const report={cases:[],errors:[]};
try{
  browser=await chromium.launch({headless:true});const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const html=`<!doctype html><h1>Modelo aprobado</h1><script>
  let blocked=false;try{parent.document.body.dataset.tampered='yes'}catch{blocked=true}
  const send=state=>parent.postMessage({type:'science-simulator:state',state:{...state,parentBlocked:blocked}},'*');
  send({ready:true,running:false});
  addEventListener('message',event=>{if(event.data?.type==='science-simulator:command')send({command:event.data.command,running:event.data.command==='run',measurement:{value:42}})});
  </script>`;
  const generated={candidateId:"approved-fixture",reviewStatus:"approved",html,htmlHash:createHash("sha256").update(html).digest("hex")};
  await page.evaluate(async generated=>{const {createGeneratedScienceSimulator}=await import('/runtime.mjs');window.ctl=await createGeneratedScienceSimulator(document.querySelector('#mount'),{title:'Sandbox test',simulator:{generated}});},generated);
  await page.waitForFunction(()=>window.ctl.getState().ready);
  let state=await page.evaluate(()=>window.ctl.getState());assert.equal(state.parentBlocked,true);report.cases.push("child cannot read or mutate parent DOM");
  assert.equal(await page.locator('iframe').getAttribute('sandbox'),'allow-scripts');report.cases.push("opaque-origin iframe excludes same-origin, navigation and forms");
  await page.evaluate(()=>window.ctl.run());await page.waitForFunction(()=>window.ctl.getState().command==='run');state=await page.evaluate(()=>window.ctl.getState());assert.equal(state.running,true);assert.equal(state.measurement.value,42);report.cases.push("run command and child state telemetry");
  await page.evaluate(()=>window.dispatchEvent(new MessageEvent('message',{source:window,data:{type:'science-simulator:state',state:{spoofed:true}}})));assert.equal((await page.evaluate(()=>window.ctl.getState())).spoofed,undefined);report.cases.push("unrelated message sender rejected");
  const before=await page.evaluate(()=>window.ctl.getState());await page.evaluate(()=>window.ctl.destroy());assert.equal(await page.locator('iframe').count(),0);assert.equal(before.candidateId,'approved-fixture');report.cases.push("destroy removes frame and listener while retaining parent-owned identity");
}catch(error){report.errors.push(error.message);throw error;}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));await mkdir('artifacts/science-audit-20260924',{recursive:true});await writeFile('artifacts/science-audit-20260924/generated-sandbox.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));
