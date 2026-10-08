const test=require('node:test'),assert=require('node:assert/strict');
const {configuration,validatePlan,initialTasks}=require('../src/science-production-policy.js');
const {lockArtDirection,assembleSimulatorScene,verifySimulatorAssetManifest,buildSimulatorAssetPrompt}=require('../src/science-production-art.js');
const {prepareActivityTemplate,listScienceTopics}=require('../src/science-production-templates.js');
const {createScienceWorkers,verifySceneIntegration}=require('../src/science-production-workers.js');
const {invokeScienceAgent}=require('../src/science-mcp.js');
async function sceneRun(subject='physics',topic='MRUA',simulatorMode='curated'){
  const settings={subject,topic,gameMode:'simulator',trimester:'Trimestre 1',simulatorMode};
  if(simulatorMode==='approved')settings.modelId=`generated-${'a'.repeat(64)}`;
  const activity=await prepareActivityTemplate(settings),config=configuration(settings,activity);
  const plan=validatePlan({title:topic,objective:`Explorar ${topic}`,levels:[],visuals:[],artDirection:{familyId:'hacked'}},config);
  return {id:'run-art',ownerId:'owner',revision:1,activity,config,plan};
}
function assetsFor(run,art){return run.plan.visuals.map(item=>({role:item.role,imageUrl:`https://example.test/${item.id}.png`,storagePath:`scienceActivities/${run.ownerId}/${run.id}/${item.id}.png`,analysisVersion:2,sourceTaskId:item.id,provenance:{runId:run.id,artDirectionVersion:2,referenceHash:art.referenceHash,promptHash:'prompt'}}));}
test('every curated topic has required visual assets and a locked art-direction before image jobs',async()=>{
  const topics=await listScienceTopics();assert.equal(topics.length,180);
  for(const entry of topics){const run=await sceneRun(entry.subject,entry.topic),tasks=initialTasks(run);
    assert.equal(run.plan.artDirection.style,'illustrated-realism');assert.notEqual(run.plan.artDirection.familyId,'hacked');
    assert.equal(run.plan.visuals.filter(v=>v.role==='background').length,1,entry.topic);
    assert.equal(run.plan.visuals.filter(v=>v.role==='primary').length,run.plan.artDirection.representation==='object'?1:0,entry.topic);
    for(const task of tasks.filter(t=>t.stage==='image'))assert.deepEqual(task.dependencies,['art-direction']);
    assert.ok(tasks.find(t=>t.stage==='validate').dependencies.includes('art-direction'));
  }
});
test('new and approved sandbox models keep art direction and background without unused primary',async()=>{
  for(const mode of ['new','approved']){const run=await sceneRun('physics','MRUA',mode);assert.equal(run.plan.artDirection.representation,'code');assert.deepEqual(run.plan.visuals.map(v=>v.role),['background']);if(mode==='new')assert.deepEqual(initialTasks(run).find(t=>t.stage==='candidate').dependencies,['art-direction']);}
});
test('projectile art direction uses a launch field instead of a generic laboratory',async()=>{
  const run=await sceneRun('physics','Proyectiles');
  assert.equal(run.plan.artDirection.familyId,'projectile');
  assert.match(run.plan.artDirection.environment,/tiro parabólico|zona amplia de caída/i);
  assert.doesNotMatch(run.plan.artDirection.environment,/laboratorio|mesa de experimentación/i);
  assert.match(run.plan.artDirection.backgroundPrompt,/plataforma de lanzamiento|arco de vuelo/i);
});
test('art specialist cannot change catalog camera, hero or layout',async()=>{
  const run=await sceneRun(),reference=run.plan.artDirection,art=lockArtDirection(reference,{hero:'robot',camera:'vista cenital',layout:{scale:10},compositionNotes:'Mantener las ruedas apoyadas.'});
  assert.equal(art.hero,reference.hero);assert.equal(art.camera,reference.camera);assert.deepEqual(art.layout,reference.layout);
  const prompt=buildSimulatorAssetPrompt(run,{role:'background'},art);assert.match(prompt,/NO debe contener protagonista/);assert.ok(prompt.includes(reference.environment));assert.ok(prompt.includes(reference.lighting));
  assert.deepEqual(await invokeScienceAgent({stage:'art-direction',execute:async()=>({ok:true})}),{ok:true});
});
test('scene remains incomplete with missing hero, old asset or wrong direction provenance',async()=>{
  const run=await sceneRun(),art=lockArtDirection(run.plan.artDirection),images=assetsFor(run,art);
  assert.throws(()=>verifySimulatorAssetManifest(run,images.slice(0,1),art));
  assert.throws(()=>verifySimulatorAssetManifest(run,images.map(i=>({...i,analysisVersion:1})),art));
  assert.throws(()=>verifySimulatorAssetManifest(run,images.map(i=>({...i,provenance:{...i.provenance,referenceHash:'other'}})),art));
  assert.throws(()=>assembleSimulatorScene(run,images,art,{valid:false,version:2,referenceHash:art.referenceHash}));
});
test('assembled scene preserves scientific bindings, desktop/mobile placement and verified provenance',async()=>{
  const run=await sceneRun(),art=lockArtDirection(run.plan.artDirection),images=assetsFor(run,art),integration={valid:true,version:2,referenceHash:art.referenceHash};
  const scene=assembleSimulatorScene(run,images,art,integration);assert.equal(scene.version,2);assert.equal(scene.status,'ready');assert.equal(scene.layers[0].motionPreset,art.motion.preset);assert.equal(scene.layers[0].driver,art.motion.driver);assert.deepEqual(scene.layers[0].anchor,art.layout.anchor);assert.deepEqual(scene.layers[0].mobileAnchor,art.layout.mobileAnchor);assert.equal(scene.layers[0].mobileScale,art.layout.mobileScale);assert.equal(scene.provenance.runId,run.id);assert.equal(scene.provenance.integration.valid,true);
});
test('integration QA observes separately downloaded assets and their actual composition, rejecting mismatch',async()=>{
  const sharp=require('sharp'),run=await sceneRun(),art=lockArtDirection(run.plan.artDirection),images=assetsFor(run,art);
  const background=await sharp({create:{width:960,height:540,channels:4,background:'#ddeeff'}}).png().toBuffer(),primary=await sharp({create:{width:256,height:80,channels:4,background:'#334466'}}).png().toBuffer();let inspected=[];
  const client={models:{generateContent:async request=>{inspected=request.contents[0].parts;return {candidates:[{content:{parts:[{text:JSON.stringify({valid:false,issue:'El tren flota y la iluminación es opuesta'})}]}}]};}}};
  await assert.rejects(verifySceneIntegration({client,bucket:{file:path=>({download:async()=>[path.includes('primary')?primary:background]})},run,images,art,signal:new AbortController().signal}),/integración visual/);
  assert.equal(inspected.filter(p=>p.inlineData).length,3);assert.match(inspected[0].text,/composición real/);assert.match(inspected[0].text,/duplicación/);
});
test('image agent honors locked simulator art prompts and emits provenance only after visual QA',async()=>{
  const sharp=require('sharp'),run=await sceneRun(),art=lockArtDirection(run.plan.artDirection),data=await sharp({create:{width:1600,height:900,channels:3,background:'#ddeeff'}}).png().toBuffer();let calls=0,generationPrompt='',saved=false;
  const client={models:{generateContent:async request=>{
    calls++;
    if(calls===1){generationPrompt=request.contents[0].parts[0].text;return {candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:data.toString('base64')}}]}}]};}
    return {candidates:[{content:{parts:[{text:'{"valid":true,"issue":""}'}]}}]};
  }}};
  const worker=createScienceWorkers({bucket:{name:'test',file:()=>({save:async()=>{saved=true;}})},client});
  const asset=await worker(run,{id:'scene-background',token:'attempt',stage:'image',input:run.plan.visuals[0]},{'art-direction':art});
  assert.equal(saved,true);assert.equal(asset.analysisVersion,2);assert.equal(asset.provenance.referenceHash,art.referenceHash);assert.equal(asset.provenance.runId,run.id);assert.ok(generationPrompt.includes(art.backgroundPrompt));assert.match(generationPrompt,/realismo ilustrado comercial/);
});
test('an already transparent hero is accepted without requiring a chroma background',async()=>{
  const sharp=require('sharp'),run=await sceneRun(),art=lockArtDirection(run.plan.artDirection),object=await sharp({create:{width:80,height:30,channels:4,background:'#224466'}}).png().toBuffer();
  const image=await sharp({create:{width:900,height:900,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:object,left:300,top:435}]).png().toBuffer();let calls=0;
  const client={models:{generateContent:async()=>({candidates:[{content:{parts:++calls===1?[{inlineData:{mimeType:'image/png',data:image.toString('base64')}}]:[{text:'{"valid":true}'}]}}]})}};
  const worker=createScienceWorkers({client,bucket:{name:'test',file:()=>({save:async()=>{}})}});
  const asset=await worker(run,{id:'scene-primary',token:'a',stage:'image',input:run.plan.visuals.find(i=>i.role==='primary')},{'art-direction':art});assert.equal(asset.role,'primary');assert.equal(asset.analysisVersion,2);
});
test('an empty art-specialist response cannot unlock downstream image tasks',async()=>{
  const worker=createScienceWorkers({client:{models:{generateContent:async()=>({candidates:[{content:{parts:[{text:'{}'}]}}]})}}});
  await assert.rejects(worker(await sceneRun(),{stage:'art-direction'}),{status:422});
});
