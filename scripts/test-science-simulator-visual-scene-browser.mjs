import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const [runtime, phaser, styles] = await Promise.all([
  readFile(new URL("../public/js/science-simulator-runtime.mjs", import.meta.url), "utf8"),
  readFile(new URL("../public/vendor/phaser/phaser.esm.min.js", import.meta.url), "utf8"),
  readFile(new URL("../public/science-assessment-export.css", import.meta.url), "utf8")
]);
const background = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#062634"/><stop offset="1" stop-color="#0c5260"/></linearGradient></defs><rect width="1600" height="900" fill="url(#g)"/><path d="M0 600h1600v300H0z" fill="#183640"/><path d="M120 610h1360" stroke="#67eff3" stroke-width="12" opacity=".7"/><g fill="#8cd6da" opacity=".16"><circle cx="260" cy="220" r="130"/><circle cx="1320" cy="170" r="180"/></g></svg>`;
const car = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="260"><path d="M55 150 105 72h230l75 78 46 16v48H35v-45z" fill="#32dce5" stroke="#e8ffff" stroke-width="8"/><path d="m140 82-31 66h122V82zM247 82v66h132l-58-66z" fill="#092b39"/><circle cx="125" cy="215" r="36" fill="#07131f" stroke="#aafaff" stroke-width="10"/><circle cx="370" cy="215" r="36" fill="#07131f" stroke="#aafaff" stroke-width="10"/></svg>`;
const decorativeArrow = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><path d="M220 60 130 8v30H12v44h118v30z" fill="#9bd52d"/></svg>`;
const activity = { title:"Laboratorio MRU",subject:"physics",topic:"Movimiento rectilíneo uniforme",visualStyle:"rive-tokyo-tech",simulationType:"friction",mission:"Observa un movimiento constante.",scientificPrinciple:"La velocidad permanece constante.",controls:[{id:"force",label:"Fuerza",min:0,max:100,step:1,value:50,unit:"N"},{id:"friction",label:"Fricción",min:0,max:100,step:1,value:50,unit:"N"},{id:"mass",label:"Masa",min:1,max:20,step:1,value:10,unit:"kg"}],simulator:{modelId:"friction",formula:"a=(F-Fr)/m",objectiveEnabled:false},visualScene:{version:1,status:"ready",background:{imageSrc:"/background.svg",alt:"Laboratorio tecnológico con pista horizontal"},layers:[{id:"vehicle",label:"Vehículo experimental",role:"primary",imageSrc:"/car.svg",motionPreset:"translate-x",driver:"control:force",anchor:{x:.16,y:.54},depth:4,scale:.2,visible:true},{id:"decorative-arrow",label:"Flecha verde",role:"supporting",imageSrc:"/arrow.svg",motionPreset:"pulse",driver:"time",anchor:{x:.3,y:.54},depth:5,scale:.18,visible:true}],generationWarnings:[]}};
activity.controls=[{id:"velocity",label:"Velocidad",min:0,max:40,step:1,value:23,unit:"m/s"},{id:"mass",label:"Masa",min:1,max:25,step:1,value:6,unit:"kg"},{id:"force",label:"Fuerza",min:-100,max:100,step:5,value:20,unit:"N"}];
activity.simulator={modelId:"friction",formula:"a = Δv/Δt",objectiveEnabled:true,objective:"Ajusta la fuerza para conservar velocidad constante: aceleración = 0 m/s².",objectiveStrategy:"all",objectiveTargets:[{metric:"acceleration",value:0,tolerance:.01}]};
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><main id="mount" style="width:100%;min-height:100vh"></main><script type="module">window.SCIENCE_SIMULATOR_PHASER_URL="/phaser.mjs";const {createScienceSimulator}=await import("/runtime.mjs");window.controller=await createScienceSimulator("#mount",${JSON.stringify(activity)});</script></body></html>`;
const server = createServer((request,response)=>{const routes={"/runtime.mjs":["text/javascript",runtime],"/phaser.mjs":["text/javascript",phaser],"/styles.css":["text/css",styles],"/background.svg":["image/svg+xml",background],"/car.svg":["image/svg+xml",car],"/arrow.svg":["image/svg+xml",decorativeArrow]};const item=routes[request.url];response.writeHead(200,{"content-type":`${item?.[0]||"text/html"}; charset=utf-8`});response.end(item?.[1]||html)});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
page.on("pageerror",error=>errors.push(error.message));page.on("console",message=>{if(message.type()==="error")errors.push(message.text())});
try{
  await page.goto(origin,{waitUntil:"networkidle"});
  await page.locator(".science-phaser-simulator.has-generated-scene").waitFor();
  const initialProgress=await page.locator(".science-sim-objective progress").getAttribute("value");
  assert.equal(Math.round(Number(initialProgress)),80);
  await page.evaluate(()=>window.controller.setParam("force",0));
  const reached=JSON.parse(await page.evaluate(()=>window.render_game_to_text()));
  assert.equal(reached.objectiveReached,true);
  assert.equal(Number(await page.locator(".science-sim-objective progress").getAttribute("value")),100);
  assert.match(await page.locator("[data-objective-status]").textContent(),/Objetivo alcanzado/);
  await page.evaluate(()=>window.controller.setParam("force",20));
  await page.locator('[data-action="run"]').click();
  const before=JSON.parse(await page.evaluate(()=>window.render_game_to_text()));
  await page.evaluate(()=>window.advanceTime(1600));
  const after=JSON.parse(await page.evaluate(()=>window.render_game_to_text()));
  assert.equal(after.visualScene.status,"ready");
  assert.equal(after.visualScene.layers[0].label,"Vehículo experimental");
  assert.equal(after.visualScene.layers.length,1,"MRU/MRUA debe omitir capas secundarias como flechas decorativas");
  assert.equal(before.visualScene.layers[0].x,after.visualScene.layers[0].x);
  assert.equal(before.visualScene.layers[0].progress,after.visualScene.layers[0].progress);
  assert.equal(after.visualScene.motionIndicators.length,3);
  assert.notEqual(before.visualScene.motionIndicators[0].x,after.visualScene.motionIndicators[0].x);
  assert.ok(after.visualScene.motionIndicators.every(indicator=>indicator.direction===1));
  assert.equal(after.visualScene.backgroundLayout.loop,true);
  assert.equal(after.visualScene.backgroundLayout.motion.directionLabel,"right-to-left");
  assert.notEqual(before.visualScene.backgroundLayout.motion.offset,after.visualScene.backgroundLayout.motion.offset);
  await page.evaluate(()=>{window.controller.reset();window.controller.setParam("force",0);window.controller.run();window.advanceTime(1000)});
  const slowState=JSON.parse(await page.evaluate(()=>window.render_game_to_text()));
  await page.evaluate(()=>{window.controller.reset();window.controller.setParam("force",100);window.controller.run();window.advanceTime(1000)});
  const fastState=JSON.parse(await page.evaluate(()=>window.render_game_to_text()));
  assert.equal(fastState.visualScene.layers[0].x,slowState.visualScene.layers[0].x,"El objeto debe permanecer estable mientras se desplaza el fondo");
  assert.ok(fastState.motion.velocity>slowState.motion.velocity,`La fuerza debe aumentar la velocidad integrada: ${slowState.motion.velocity} -> ${fastState.motion.velocity}`);
  assert.ok(fastState.visualScene.backgroundLayout.motion.speed>slowState.visualScene.backgroundLayout.motion.speed,`El fondo debe responder a la velocidad: ${slowState.visualScene.backgroundLayout.motion.speed} -> ${fastState.visualScene.backgroundLayout.motion.speed}`);
  assert.notEqual(fastState.visualScene.backgroundLayout.motion.offset,slowState.visualScene.backgroundLayout.motion.offset,"La aceleración debe cambiar el recorrido del fondo");
  await page.screenshot({path:"/tmp/science-gemini-scene-desktop.png",fullPage:true});
  for(const viewportSize of [{width:1100,height:900},{width:920,height:900},{width:899,height:900},{width:760,height:900}]){
    await page.setViewportSize(viewportSize);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const responsiveLayout=await page.locator(".science-sim-viewport").evaluate(node=>{const viewport=node.getBoundingClientRect(),canvas=node.querySelector("canvas")?.getBoundingClientRect();return{viewport:{width:viewport.width,height:viewport.height},canvas:canvas?{width:canvas.width,height:canvas.height}:null}});
    assert.ok(Math.abs(responsiveLayout.viewport.width/responsiveLayout.viewport.height-16/9)<.02,`El viewport debe conservar 16:9 a ${viewportSize.width}px`);
    assert.ok(responsiveLayout.canvas&&Math.abs(responsiveLayout.canvas.width-responsiveLayout.viewport.width)<=2,`El canvas debe ocupar el ancho a ${viewportSize.width}px`);
    assert.ok(Math.abs(responsiveLayout.canvas.height-responsiveLayout.viewport.height)<=2,`El canvas debe ocupar la altura a ${viewportSize.width}px`);
    const responsiveState=JSON.parse(await page.evaluate(()=>window.render_game_to_text()));
    assert.ok(Math.abs(responsiveState.visualScene.backgroundLayout.width-responsiveLayout.viewport.width)<=2,`El fondo debe seguir el ancho a ${viewportSize.width}px`);
  }
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(250);
  const portrait=JSON.parse(await page.evaluate(()=>window.render_game_to_text()));
  const portraitCanvas=await page.locator(".science-sim-viewport canvas").evaluate(node=>({width:node.clientWidth,height:node.clientHeight}));
  assert.equal(portrait.visualScene.backgroundLayout.fit,"width");
  assert.ok(Math.abs(portrait.visualScene.backgroundLayout.ratio-16/9)<.01);
  assert.ok(Math.abs(portrait.visualScene.backgroundLayout.width-portraitCanvas.width)<=2,`${portrait.visualScene.backgroundLayout.width} != ${portraitCanvas.width}`);
  assert.ok(portrait.visualScene.layers[0].width<=portraitCanvas.width&&portrait.visualScene.layers[0].height<=portraitCanvas.height);
  const portraitLayer=portrait.visualScene.layers[0];
  assert.ok(portraitLayer.x-portraitLayer.width/2>=-1&&portraitLayer.x+portraitLayer.width/2<=portraitCanvas.width+1);
  assert.ok(portraitLayer.y-portraitLayer.height/2>=-1&&portraitLayer.y+portraitLayer.height/2<=portraitCanvas.height+1);
  await page.screenshot({path:"/tmp/science-gemini-scene-mobile.png",fullPage:true});
  assert.equal(errors.length,0,errors.join("\n"));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
