import test from "node:test";
import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { SCIENCE_TOPIC_CATALOG, createCurriculumRegistry, applyCurriculumProfile } from "../public/js/science-curriculum-profiles.mjs";
import { calculateScienceSimulatorMeasurement as measure, calculateScienceSimulatorObjectiveProgress as progress, resolveScienceSimulatorModel, SCIENCE_SIMULATOR_MODELS } from "../public/js/science-simulator-runtime.mjs";
import { modelDiagramMarkup } from "../public/js/science-model-diagrams.mjs";
import { validateGeneratedSimulator } from "../public/js/science-model-generated-runtime.mjs";

const registry=createCurriculumRegistry(SCIENCE_TOPIC_CATALOG);
const defaults=profile=>Object.fromEntries(profile.simulatorProfile.controls.map(control=>[control.id,control.value]));
const profileFor=topic=>[...registry.values()].find(profile=>profile.topic===topic);
const close=(actual,expected,tolerance=1e-9)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);

test("all 180 topics resolve to registered models; fresh math topics never use the legacy linear fallback",()=>{
  assert.equal(registry.size,180);
  for(const profile of registry.values()){
    const activity=applyCurriculumProfile({title:profile.topic},profile);
    assert.equal(resolveScienceSimulatorModel(activity),profile.simulatorProfile.modelId,profile.id);
    assert.ok(SCIENCE_SIMULATOR_MODELS.includes(activity.simulator.modelId));
    if(profile.subject==="math")assert.notEqual(activity.simulator.modelId,"math",profile.id);
  }
});
for(const profile of registry.values())test(`${profile.id}: default and every control boundary produce finite measurements and valid diagrams`,()=>{
  const values=defaults(profile),configurations=[values,...profile.simulatorProfile.controls.flatMap(control=>[{...values,[control.id]:control.min},{...values,[control.id]:control.max}])];
  for(const input of configurations){
    const measurement=measure(profile.simulatorProfile.modelId,input);
    assert.ok(Number.isFinite(measurement.value),JSON.stringify(input));
    assert.doesNotMatch(modelDiagramMarkup(measurement),/NaN|Infinity/);
    assert.equal(typeof measurement.formula,"string");
  }
});
test("solution model retains concentration and saturation instead of becoming pressure",()=>{
  assert.equal(resolveScienceSimulatorModel({simulator:{modelId:"solution"}}),"solution");
  close(measure("solution",{soluteMoles:.5,solutionVolume:1}).value,.5);
  close(measure("solution",{temperature:25,soluteMass:35,solventVolume:100}).saturation,100);
});
test("projectile model keeps velocity, gravity and trajectory measurements physically coupled",()=>{
  const defaultProjectile=measure("projectile",{angle:45,initialVelocity:20,gravity:9.8});
  close(defaultProjectile.value,20**2/9.8);
  close(defaultProjectile.flightTime,2*20*Math.sin(Math.PI/4)/9.8);
  close(defaultProjectile.maxHeight,20**2*.5/(2*9.8));
  assert.ok(measure("projectile",{angle:45,initialVelocity:20,gravity:4}).value>defaultProjectile.value);
  assert.ok(measure("projectile",{angle:45,initialVelocity:30,gravity:9.8}).flightTime>defaultProjectile.flightTime);
  close(measure("projectile",{angle:45,power:20,gravity:9.8}).value,defaultProjectile.value);
});
test("periodic metadata separates display rows from physical periods and metallic character",()=>{
  for(const z of [58,71,90,103]){const m=measure("periodic-properties",{atomicNumber:z});assert.equal(m.period,z<90?6:7);assert.equal(m.group,"bloque f");assert.equal(m.metallicCharacter,100);}
  assert.equal(measure("periodic",{atomicNumber:14}).metallicCharacter,50);
});
test("energy, mechanics, buoyancy and circuits use their own quantitative laws",()=>{
  close(measure("physics-kinetic",{mass:2,velocity:3}).value,9);
  close(measure("physics-power",{work:1000,duration:5}).value,200);
  close(measure("physics-spring",{springConstant:20,extension:.5}).value,-10);
  close(measure("physics-circular",{mass:2,speed:3,radius:2}).value,9);
  const floating=measure("physics-buoyancy",{fluidDensity:1000,objectDensity:700,volume:.01,gravity:10});close(floating.value,70);close(floating.submergedFraction,.7);close(floating.netForce,0);
  const series=measure("physics-circuit",{voltage:12,r1:10,r2:20,parallel:0}),parallel=measure("physics-circuit",{voltage:12,r1:10,r2:20,parallel:1});close(series.value,.4);close(parallel.value,1.8);close(parallel.i1+parallel.i2,parallel.value);
});
test("distance counts a reversal while displacement can be zero",()=>{
  const m=measure("physics-motion",{velocity:10,acceleration:-2,time:10,initialPosition:0,quantity:2});close(m.displacement,0);close(m.distance,50);
});
test("math exact arithmetic, proportions, systems, geometry and statistics",()=>{
  close(measure("math-order",{a:2,b:3,c:4,group:0}).value,14);
  close(measure("math-order",{a:2,b:3,c:4,group:1}).value,20);
  close(measure("math-fractions",{a:1,b:2,c:1,d:3,operation:0}).value,5/6);
  close(measure("math-proportionality",{k:12,x:3,inverse:1}).value,4);
  close(measure("math-equation",{a:2,b:3,c:11}).value,4);
  const system=measure("math-system",{a:1,b:1,c:5,d:1,e:-1,f:1});close(system.value,3);close(system.y,2);
  close(measure("math-pythagoras",{a:3,b:4}).value,5);
  close(measure("math-volume",{width:3,height:4,depth:5}).value,60);
  close(measure("math-statistics",{a:1,b:2,c:3,d:4,e:10,statistic:0}).value,4);
  close(measure("math-probability",{favorable:3,total:6}).value,.5);
});
test("undefined configurations are explicit and cannot satisfy an objective",()=>{
  for(const [model,values] of [["math-integers",{a:3,b:0,operation:3}],["math-probability",{favorable:8,total:6}],["math-triangle",{a:100,b:100}],["math-system",{a:1,b:1,c:1,d:2,e:2,f:2}]]){
    const m=measure(model,values);assert.equal(m.valid,false,model);assert.equal(progress({targets:[{metric:"value",value:0}],measurement:m}).reached,false);
  }
  assert.equal(progress({targets:[{metric:"nonexistent",value:0}],measurement:{}}).reached,false);
});
test("strong acid dilution, base and neutralization obey concentration and electroneutrality",()=>{
  close(measure("acid-base",{hydrogenConcentration:.01,volume:1}).pH,2);
  close(measure("acid-base",{hydrogenConcentration:.01,volume:2}).pH,2+Math.log10(2));
  close(measure("acid-base",{hydroxideConcentration:.01,volume:1}).pH,12);
  close(measure("acid-base",{acidMoles:50,baseMoles:50,totalVolume:1}).pH,7);
  close(measure("acid-base",{acidMoles:60,baseMoles:50,totalVolume:1}).pH,2,1e-8);
  close(measure("acid-base",{acidMoles:50,baseMoles:60,totalVolume:1}).pH,12,1e-8);
});
test("reaction progress stays within percent bounds and Arrhenius uses absolute temperature",()=>{
  close(measure("reaction-stoichiometry",{reactantA:100,reactantB:100}).reactionProgress,100);
  close(measure("reaction-kinetics",{temperature:298,activationEnergy:55}).relativeRate,1);
  close(measure("reaction-kinetics",{temperature:350,activationEnergy:55}).relativeRate,Math.exp(55000/8.314462618*(1/298-1/350)),1e-9);
});
test("chemical equation and balancing profiles use different contracts",()=>{
  const equation=measure("reaction-equation",{coefficientA:2,coefficientB:1,coefficientC:2});
  assert.equal(equation.ratio,"2:1:2");
  assert.equal(equation.balanceError,undefined);
  assert.equal(measure("reaction-balancing",{coefficientA:2,coefficientB:1,coefficientC:2}).balanceError,0);
  assert.ok(measure("reaction-balancing",{coefficientA:1,coefficientB:1,coefficientC:1}).balanceError>0);
});
test("genetics base composition controls affect reported accuracy",()=>{
  const balanced=measure("genetics-expression",{adenine:50,cytosine:50,mutationRate:0,sequenceLength:60});
  const unbalanced=measure("genetics-expression",{adenine:80,cytosine:50,mutationRate:0,sequenceLength:60});
  assert.ok(balanced.geneticAccuracy>unbalanced.geneticAccuracy);
  assert.equal(balanced.geneticAccuracy,100);
});
test("inheritance reports expected counts, dominance selection and four final meiotic cells",()=>{
  const dominant=measure("cell-division",{parentA:1,parentB:1,dominance:1,offspring:16});close(dominant.value,75);close(dominant.AA,.25);close(dominant.aa,.25);
  close(measure("cell-division",{parentA:1,parentB:1,dominance:0,offspring:16}).value,25);
  assert.equal(measure("cell-division",{phase:8,crossingOver:50,checkpoint:100,segregation:100}).gametes,4);
  assert.equal(measure("cell-division",{phase:4,replication:0,checkpoint:100,spindle:100}).effectivePhase,0);
});
test("threshold objectives accept values beyond the threshold, not only a narrow equality band",()=>{
  assert.equal(progress({targets:[{metric:"value",value:80,operator:"gte"}],measurement:{value:95}}).reached,true);
  assert.equal(progress({targets:[{metric:"value",value:20,operator:"lte"}],measurement:{value:5}}).reached,true);
});
test("generated simulator validates approval and immutable HTML digest before execution",async()=>{
  const html="<!doctype html><h1>Scientific model</h1>",generated={candidateId:"candidate-1",reviewStatus:"approved",html,htmlHash:createHash("sha256").update(html).digest("hex")};
  assert.equal(await validateGeneratedSimulator(generated,webcrypto),generated);
  await assert.rejects(validateGeneratedSimulator({...generated,reviewStatus:"pending"},webcrypto));
  await assert.rejects(validateGeneratedSimulator({...generated,html:html+"<script>changed()</script>"},webcrypto));
});
