import test from 'node:test';
import assert from 'node:assert/strict';
import { SCIENCE_TOPIC_CATALOG, createCurriculumRegistry, applyCurriculumProfile } from '../public/js/science-curriculum-profiles.mjs';
import { createScienceIllustratedScene } from '../public/js/science-scene-art-direction.mjs';
import { normalizeScienceSimulatorVisualScene, calculateScienceSimulatorMeasurement } from '../public/js/science-simulator-runtime.mjs';
import { illustratedLayerTransform, illustratedApparatusMarkup } from '../public/js/science-model-illustrated-scene.mjs';
for(const profile of createCurriculumRegistry(SCIENCE_TOPIC_CATALOG).values())test(`v2 contract ${profile.id}`,()=>{
 const activity=applyCurriculumProfile({subject:profile.subject,topic:profile.topic,title:profile.topic},profile);
 activity.visualScene=createScienceIllustratedScene(activity);
 const scene=normalizeScienceSimulatorVisualScene(activity),v=Object.fromEntries(activity.controls.map(c=>[c.id,c.value])),m=calculateScienceSimulatorMeasurement(activity.simulator.modelId,v);
 assert.equal(scene.version,2);assert.equal(scene.style,'illustrated-realism');assert.ok(scene.background.source);assert.ok(Number.isFinite(m.value));
 for(const layer of scene.layers)for(const width of [340,1100]){
   const pose=illustratedLayerTransform({model:activity.simulator.modelId,layer,measurement:m,values:v,time:1500,width,height:400});
   for(const key of ['x','y','rotation','alpha','scale'])assert.ok(Number.isFinite(pose[key]),key);
 }
 assert.doesNotMatch(illustratedApparatusMarkup(activity.simulator.modelId,m,v),/NaN|Infinity/);
});
test('v1 remains opt-in and retains desktop anchors',()=>{
 const scene=normalizeScienceSimulatorVisualScene({visualScene:{version:1,layers:[{id:'old',anchor:{x:.2,y:.3},scale:.2,imageSrc:'old.png'}]}});
 assert.equal(scene.version,1);assert.deepEqual(scene.layers[0].anchor,{x:.2,y:.3});assert.equal(scene.layers[0].source,'old.png');
});
test('buoyancy responds to measured submerged fraction, independent of loop time',()=>{
 const args={model:'physics-buoyancy',layer:{anchor:{x:.5,y:.5},scale:.3},width:800,height:500};
 const shallow=illustratedLayerTransform({...args,measurement:{submergedFraction:.2,netForce:0},time:0});
 const deep=illustratedLayerTransform({...args,measurement:{submergedFraction:.8,netForce:0},time:1000});
 assert.ok(deep.y>shallow.y);assert.equal(deep.semantic,'equilibrium-submersion');
});
