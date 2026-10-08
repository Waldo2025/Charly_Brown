import { createScienceIllustratedScene } from "../public/js/science-scene-art-direction.mjs";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname, join } from "node:path";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { build } from "esbuild";
import { SCIENCE_TOPIC_CATALOG, createCurriculumRegistry, applyCurriculumProfile } from "../public/js/science-curriculum-profiles.mjs";

const illustrated=process.env.SCIENCE_AUDIT_ILLUSTRATED==="1";
const output=resolve(illustrated?"artifacts/science-illustrated-audit-20260924":"artifacts/science-audit-20260924");
await mkdir(join(output,"screenshots"),{recursive:true});
const profiles=[...createCurriculumRegistry(SCIENCE_TOPIC_CATALOG).values()].filter(p=>!process.env.SCIENCE_AUDIT_FILTER||new RegExp(process.env.SCIENCE_AUDIT_FILTER).test(p.id)).slice(0,Number(process.env.SCIENCE_AUDIT_LIMIT)||Infinity);
const bundle=await build({stdin:{contents:'export * from "./public/js/science-simulator-runtime.mjs";',resolveDir:process.cwd(),sourcefile:"audit-entry.mjs"},bundle:true,format:"esm",platform:"browser",write:false});
const exportSource=bundle.outputFiles[0].text;
const root=resolve("public"),mime={".mjs":"text/javascript",".js":"text/javascript",".css":"text/css",".webp":"image/webp",".svg":"image/svg+xml",".woff2":"font/woff2"};
const html=mode=>`<!doctype html><html lang="es"><meta charset="UTF-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/science-hud-themes.css"><link rel="stylesheet" href="/${mode==="export"?"science-assessment-export.css":"scienceActivities.css"}"><style>body{margin:0;background:#07131f}.audit-shell{display:block!important;width:100vw!important;max-width:none!important;margin:0!important;padding:0!important;height:100vh!important;min-height:100vh!important}.audit-shell .sa-game-frame{width:100%;height:100vh;min-height:100vh;margin:0;box-sizing:border-box}#mount{width:100%;min-height:620px}.science-sim-viewport{min-height:340px!important}</style><main class="audit-shell sa-page game-shell"><section class="sa-game-frame game-frame"><div id="mount" class="sa-game-mount"></div></section></main><script type="module">import {createScienceSimulator} from '${mode==="export"?"/js/audit-export.mjs":"/js/science-simulator-runtime.mjs"}';window.make=createScienceSimulator;window.ready=true;</script></html>`;
const server=createServer(async(req,res)=>{try{
  const pathname=new URL(req.url,"http://localhost").pathname;
  if(pathname==="/preview"||pathname==="/export"){res.setHeader("Content-Type","text/html");return res.end(html(pathname.slice(1)));}
  if(pathname==="/js/audit-export.mjs"){res.setHeader("Content-Type","text/javascript");return res.end(exportSource);}
  if(pathname==="/missing-scientific-image.webp"){res.writeHead(404);return res.end("intentional missing fixture");}
  const file=resolve(root,"."+pathname);if(!file.startsWith(root+"/"))throw Error("path");
  res.setHeader("Content-Type",mime[extname(file)]||"application/octet-stream");res.end(await readFile(file));
}catch{res.writeHead(404);res.end("not found");}});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const svg=source=>"data:image/svg+xml;base64,"+Buffer.from(source).toString("base64");
const background=svg('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#153c50"/><path d="M0 700H1600" stroke="#7fbccf" stroke-width="8"/></svg>');
const object=svg('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect x="10" y="20" width="180" height="65" rx="20" fill="#64d6cd"/></svg>');
const keyboardOnly=process.env.SCIENCE_AUDIT_KEYBOARD_ONLY==="1";
const captureOnly=process.env.SCIENCE_AUDIT_CAPTURE_ONLY==="1"||keyboardOnly;
const audit={startedAt:new Date().toISOString(),coverage:{profiles:profiles.length,viewports:[{name:"desktop",width:1280,height:900},{name:"mobile",width:390,height:844}],assets:captureOnly?["none"]:["none","ready","missing"],surfaces:captureOnly?["preview"]:["preview","export-module-bundle"],exportNote:"Source runtime compiled in-memory with esbuild plus export stylesheet. Final editor ZIP packaging and deployment are separate integration checks."},checks:[],failures:[],pageErrors:[],screenshots:[],sourceHashes:{}};
for(const name of ["science-simulator-runtime.mjs","science-model-math.mjs","science-model-physics.mjs","science-model-biology.mjs"])audit.sourceHashes[name]=createHash("sha256").update(await readFile(join(root,"js",name))).digest("hex");
let browser;
try{
  browser=await chromium.launch({headless:true});
  await Promise.all((captureOnly?["preview"]:["preview","export"]).flatMap(surface=>audit.coverage.viewports.map(async viewport=>{
      const page=await browser.newPage({viewport:{width:viewport.width,height:viewport.height},reducedMotion:"reduce"});
      let current="";
      page.on("pageerror",error=>audit.pageErrors.push({case:current,error:error.message}));
      await page.goto(`${base}/${surface}`);await page.waitForFunction(()=>window.ready);
      // Canvas mode avoids a browser-wide WebGL-context quota during thousands
      // of intentional mount/destroy cycles; Phaser still performs real drawing.
      await page.evaluate(async()=>{const p=await import('/vendor/phaser/phaser.esm.min.js');window.__SCIENCE_EXPORT_PHASER__={...(p.default||p),AUTO:(p.default||p).CANVAS};});
      for(const asset of audit.coverage.assets){
        for(const profile of profiles){
          current=`${surface}/${viewport.name}/${asset}/${profile.id}`;
          const activity=applyCurriculumProfile({title:profile.topic,subject:profile.subject,topic:profile.topic,visualStyle:"rive-tokyo-tech",gameMode:"simulator"},profile);
          if(illustrated)activity.visualScene=createScienceIllustratedScene(activity);
          if(asset!=="none"&&!illustrated)activity.visualScene={status:"ready",background:{imageSrc:asset==="ready"?background:`${base}/missing-scientific-image.webp`,prompt:"La recta numérica completa y el vector de desplazamiento se dibujan con geometría exacta",alt:"Fondo de auditoría"},layers:[{id:"fixture",label:"Objeto de auditoría",role:"primary",motionPreset:"translate-x",driver:"time",imageSrc:asset==="ready"?object:`${base}/missing-scientific-image.webp`,anchor:{x:.3,y:.6},scale:.2}],generationWarnings:[]};
          if(illustrated&&asset!=="none"){
            activity.visualScene.background.imageSrc=asset==="ready"?background:`${base}/missing-scientific-image.webp`;
            activity.visualScene.layers.forEach(layer=>layer.imageSrc=asset==="ready"?object:`${base}/missing-scientific-image.webp`);
          }
          try{
            const check=await page.evaluate(async activity=>{
              window.controller?.destroy();
              window.controller=await window.make(document.querySelector('#mount'),activity);
              await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
              const ctl=window.controller,initial=ctl.getState();
              if(!Number.isFinite(ctl.getMeasurement()?.value))throw Error('Non-finite initial measurement');
              const canvas=document.querySelector('canvas');
              if(!canvas||canvas.width<2||canvas.height<2)throw Error('Missing or zero-size canvas');
              if(!document.querySelector('[data-reading]')?.textContent?.trim())throw Error('Missing telemetry');
              let changed=0;
              for(const c of activity.controls){if(c.editable===false)continue;for(const next of [c.min,c.max]){ctl.setParam(c.id,next);const m=ctl.getMeasurement();if(!Number.isFinite(m?.value))throw Error(`Non-finite after ${c.id}=${next}`);changed++;}}
              ctl.reset();ctl.run();window.advanceTime?.(500);ctl.pause();
              const paused=JSON.stringify(ctl.getState().motion);window.advanceTime?.(500);
              if(JSON.stringify(ctl.getState().motion)!==paused)throw Error('Motion advanced while paused');
              ctl.reset();
              const state=ctl.getState();
              if(state.running)throw Error('Reset must stop execution');
              const svg=document.querySelector('[data-scientific-diagram]');
              if(activity.visualScene?.version===2){
                if(!document.querySelector('.is-illustrated-realism'))throw Error('Missing illustrated layout');
                const pose=JSON.parse(window.render_game_to_text()).visualScene;
                if(pose.backgroundLayout&&(pose.backgroundLayout.fit!=='cover'||pose.backgroundLayout.width+1<canvas.width/window.devicePixelRatio||pose.backgroundLayout.height+1<canvas.height/window.devicePixelRatio))throw Error('Background does not cover');
                const apparatus=document.querySelector('[data-illustrated-apparatus]');
                if(apparatus&&/NaN|Infinity/.test(apparatus.innerHTML))throw Error('Invalid apparatus');
                const bounds=document.querySelector('.science-sim-viewport').getBoundingClientRect();
                if(bounds.height<395)throw Error('Illustrated scene too small');
              }
              if(svg&&/NaN|Infinity/.test(svg.innerHTML))throw Error('Invalid diagram coordinates');
              const periodic=document.querySelector('.science-periodic-table');
              if(periodic&&periodic.closest('[aria-hidden="true"]'))throw Error('Periodic table hidden from accessibility tree');
              if(periodic){
                const scroller=periodic.querySelector('[role="region"]');
                if(!scroller||scroller.tabIndex!==0||!periodic.textContent.includes('Desliza'))throw Error('Missing accessible scroll region/hint');
                ctl.setParam('atomicNumber',6);
                const carbon=periodic.querySelector('[data-atomic-number="6"]').getBoundingClientRect(),box=scroller.getBoundingClientRect();
                if(carbon.left<box.left-2||carbon.right>box.right+2||carbon.top<box.top-2||carbon.bottom>box.bottom+2)throw Error('Selected carbon outside scroll viewport');
                const button=periodic.querySelector('[data-atomic-number="58"]');button.click();if(ctl.getMeasurement().period!==6)throw Error('Wrong periodic period');ctl.reset();}
              const rect=document.querySelector('.science-sim-viewport').getBoundingClientRect();
              if(rect.width<100||rect.height<100)throw Error('Collapsed scientific viewport');
              return {model:state.modelId,initialMeasurement:initial.measurement,value:state.measurement.value,changedControls:changed,diagram:Boolean(svg),viewport:{width:Math.round(rect.width),height:Math.round(rect.height)},overflow:document.documentElement.scrollWidth>innerWidth+2};
            },activity);
            const run=page.locator('[data-action="run"]');
            await run.scrollIntoViewIfNeeded();
            const actionBounds=await run.boundingBox();
            if(!actionBounds||actionBounds.width<30||actionBounds.height<20||actionBounds.y<0||actionBounds.y>=viewport.height)throw Error('Run control cannot be brought into the visible viewport');
            await run.click();
            await page.locator('[data-action="pause"]').click();
            await page.locator('[data-action="reset"]').click();
            const realControls=await page.locator('.science-sim-controls').evaluate(node=>({count:node.querySelectorAll('input,select').length,width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height}));
            if(realControls.width<100||realControls.height<20||!realControls.count)throw Error('Missing or collapsed user controls');
            if(keyboardOnly){
              if(activity.simulator.modelId==='quadratic-factorization-rectangle')await page.evaluate(()=>window.controller.setParam('factorMode',0));
              const field=page.locator('.science-sim-controls input[type="range"]:visible:not(:disabled),.science-sim-controls select:visible:not(:disabled)').first();
              await field.scrollIntoViewIfNeeded();await field.focus();
              const controlId=await field.getAttribute('data-sim-param');
              const fieldType=await field.evaluate(node=>node.tagName.toLowerCase());
              const before=await page.evaluate(id=>window.controller.getState().values[id],controlId);
              await field.press(fieldType==='select'?'ArrowDown':'ArrowRight');
              const after=await page.evaluate(id=>window.controller.getState().values[id],controlId);
              const definition=activity.controls.find(control=>control.id===controlId);
              if(before!==definition?.max&&after===before)throw Error(`Keyboard did not update ${controlId}`);
              const focused=await field.evaluate(node=>node===document.activeElement);if(!focused)throw Error('Control loses keyboard focus');
              await run.focus();await run.press('Enter');
              if(activity.simulator.modelId!=='quadratic-factorization-rectangle'&&!await page.evaluate(()=>{const state=window.controller.getState();return state.running||state.motion?.complete;}))throw Error('Enter did not start simulation');
              await page.locator('[data-action="pause"]').focus();await page.locator('[data-action="pause"]').press('Enter');
              await page.locator('[data-action="reset"]').focus();await page.locator('[data-action="reset"]').press('Enter');
              check.keyboard={controlId,before,after,focused,enter:true};
            }
            audit.checks.push({case:current,...check,actionBounds,controls:realControls});
            // Capture every profile in both viewports on the preview surface;
            // other permutations retain structured measurements and failures.
            if(surface==="preview"&&asset==="none"&&!keyboardOnly){
              const file=`screenshots/${viewport.name}-${profile.id.replaceAll(":","-")}.png`;
              const controlFile=file.replace('.png','-controls.png');
              await page.screenshot({path:join(output,controlFile),fullPage:true});
              await page.locator('.science-sim-header').scrollIntoViewIfNeeded();
              await page.screenshot({path:join(output,file),fullPage:true});audit.screenshots.push({case:current,file,controlsFile:controlFile});
            }
          }catch(error){audit.failures.push({case:current,error:error.message});if(audit.failures.length<=3){console.log(current,error.message);await page.screenshot({path:join(output,`failure-${audit.failures.length}.png`),fullPage:true});}}
          if(audit.checks.length>0&&audit.checks.length%60===0)console.log(`${audit.checks.length} cases passed; ${audit.failures.length} failures`);
        }
      }
      await page.close();
  })));
}finally{
  await browser?.close();await new Promise(resolve=>server.close(resolve));
  audit.completedAt=new Date().toISOString();
  const grouped=new Map();for(const check of audit.checks){const suffix=check.case.split('/').slice(1).join('/');const existing=grouped.get(suffix);if(existing&&Math.abs(existing.value-check.value)>1e-9)audit.failures.push({case:check.case,error:"Preview/export measurement mismatch"});else grouped.set(suffix,check);}
  await writeFile(join(output,process.env.SCIENCE_AUDIT_FILTER?"targeted-final-audit.json":process.env.SCIENCE_AUDIT_LIMIT?"debug-audit.json":keyboardOnly?"keyboard-audit.json":captureOnly?"visual-review.json":"audit.json"),JSON.stringify(audit,null,2));
}
console.log(JSON.stringify({cases:audit.checks.length,failures:audit.failures.length,pageErrors:audit.pageErrors.length,screenshots:audit.screenshots.length,output},null,2));
assert.equal(audit.failures.length,0,JSON.stringify(audit.failures.slice(0,8)));
assert.equal(audit.pageErrors.length,0,JSON.stringify(audit.pageErrors.slice(0,8)));
