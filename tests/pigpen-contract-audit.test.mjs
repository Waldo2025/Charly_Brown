import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {experience as E,createExperienceEngine} from '../public/js/escape-room-experience.mjs';
import {experienceContractSchema,experienceAuthoringInstruction,experienceEditorFields,updateExperienceEditor} from '../public/js/escape-room-experience-authoring.mjs';
import {contractFor,questionFor} from './fixtures/pigpen-experience.mjs';
const src=readFileSync(new URL('../public/js/PigPenCreator.js',import.meta.url),'utf8');
const ctx=vm.createContext({});const start=src.indexOf('function validateFixedObjectiveFill(');vm.runInContext(src.slice(start,src.indexOf('function objectivePlanContractIssues(',start)),ctx);
const validate=ctx.validateFixedObjectiveFill;
const offline=vm.runInNewContext('('+createExperienceEngine.toString()+')()');
function minimal(value,schema){
 if(schema.type==='object')return Object.fromEntries((schema.required||[]).map(k=>[k,minimal(value[k],schema.properties[k])]));
 if(schema.type==='array')return value.map(x=>minimal(x,schema.items));return value;
}
function play(type,c,engine=E){
 let state={};const family=engine.get(type).family;
 for(const a of c.solutions[0].answers)for(const option of a.options)state=engine.act(type,c,state,a.target,option,['expression','balance'].includes(family)?'append':'toggle');
 if(['attributes','balance'].includes(family))state=engine.act(type,c,state,'','','mark');
 return state;
}
for(const {id,family} of E.definitions){
 test(id+': schema, minimal contract, actual actions, offline runtime and editor agree',()=>{
  const c=contractFor(id),schema=experienceContractSchema(id);
  assert.equal(validate(c,schema).length,0,id);
  const compact=minimal(c,schema);assert.equal(validate(compact,schema).length,0);
  const fixed=E.normalizeContract(compact,id);assert.deepEqual(E.authoringIssues(id,fixed),[]);
  assert.equal(E.evaluate(id,fixed,play(id,fixed)),'correct');
  assert.equal(offline.evaluate(id,fixed,play(id,fixed,offline)),'correct');
  assert.equal(E.evaluate(id,fixed,{}),'unanswered');
  const html=E.render(id,fixed,{},'audit-'+id,'en');assert.match(html,/data-exp-action=/);assert.doesNotMatch(html,/undefined|NaN/);
  const q=questionFor(id);for(const field of experienceEditorFields(q)){
   updateExperienceEditor(q,field.path,field.value);
  }
  assert.equal(E.evaluate(id,q.interaction_data,play(id,q.interaction_data)),'correct');
  assert.match(experienceAuthoringInstruction(id),/interaction_data/);
 });
 test(id+': missing required fields and broken references fail before rendering',()=>{
  const c=contractFor(id),schema=experienceContractSchema(id);
  for(const k of schema.required){const broken=structuredClone(c);delete broken[k];assert.ok(validate(broken,schema).length,k);}
  for(const section of ['options','targets'])for(const k of schema.properties[section].items.required){const broken=structuredClone(c);delete broken[section][0][k];assert.ok(validate(broken,schema).length,section+'.'+k);}
  for(const mutate of [x=>x.options[1].id=x.options[0].id,x=>x.targets[0].allowed=['missing'],x=>x.solutions[0].answers[0].options=['missing'],x=>x.solutions[0].answers=[]]){
   const broken=structuredClone(c);mutate(broken);assert.ok(E.structuralIssues(id,broken).length);assert.equal(E.evaluate(id,broken,{}),'invalid');
  }
 });
}
test('Previously accepted but unplayable solutions are rejected',()=>{
 const cases=[
 ['seleccion_multiple',c=>c.minimum=3],['marcar_evidencia',c=>c.minimum=3],
 ['balancear_cantidades',c=>c.maximum=1],['construir_expresion',c=>c.maximum=2],
 ['matriz_deduccion',c=>c.solutions[0].answers[1].options=['a']],
 ['resolver_restricciones',c=>c.rules.push({kind:'not_at',a:'a',b:'',value:999})]
 ];
 for(const [id,mutate] of cases){const c=contractFor(id);mutate(c);assert.ok(E.structuralIssues(id,c).length,id);}
});
test('Type-specific authoring checks prevent hidden answers, overlap, duplicate scale and non-minimal data',()=>{
 const cases=[
 ['predecir_resultado',c=>c.targets[0].allowed=['a']],['seleccionar_contraejemplo',c=>c.targets[0].allowed=['a']],
 ['ubicar_escala',c=>c.options[1].value=c.options[0].value],
 ['completar_diagrama',c=>{c.targets[1].x=c.targets[0].x;c.targets[1].y=c.targets[0].y;}],
 ['respuesta_coordenadas',c=>c.options[2].y=2],
 ['informacion_suficiente',c=>c.solutions.push({answers:[{target:'t',options:['a']}]})]
 ];
 for(const [id,mutate] of cases){const c=contractFor(id);mutate(c);assert.ok(E.authoringIssues(id,c).length,id);}
});
test('Restriction alternatives may be valid in different complete arrangements',()=>{
 const c=contractFor('resolver_restricciones');c.rules=[{kind:'different',a:'',b:'',value:0}];
 c.solutions=c.options.flatMap(a=>c.options.filter(b=>a.id!==b.id).map(b=>({answers:[{target:'t',options:[a.id]},{target:'u',options:[b.id]}]})));
 assert.deepEqual(E.authoringIssues('resolver_restricciones',c),[]);
 for(const solution of c.solutions)assert.equal(E.evaluate('resolver_restricciones',c,E.solutionState(solution)),'correct');
});

test('All new plan schemas accept only active mechanics and usable numeric example defaults',()=>{
 const context=vm.createContext({experience:E,experienceContractSchema});
 const a=src.indexOf('function buildObjectiveRoomFillResponseSchema('),b=src.indexOf('// Transport aliases',a);
 vm.runInContext(src.slice(a,b),context);
 for(const {id} of E.definitions){
  const schema=context.buildObjectiveRoomFillResponseSchema({question_plans:[{plan_id:'p',interaction:id,difficulty:'desafiante',difficulty_policy_version:3}]});
  const mechanic=schema.properties.p.properties.mechanic_contract;
  assert.equal(validate({kind:'none'},mechanic).length,0,id);
  assert.ok(validate({kind:'cipher'},mechanic).length,id);
  const shape=context.buildFixedObjectiveFillShape(experienceContractSchema(id));
  assert.equal(shape.minimum,1);assert.equal(shape.maximum,12);
  assert.equal(shape.targets.length,E.requirements(id).targetMin);
 }
});

test('Malformed contracts never crash the validator for any new type',()=>{
 for(const {id} of E.definitions)for(const field of ['options','targets','solutions','rules','connections','instructions','extra_hint'])for(const value of [null,0,'',{},[null]]){
  const c=contractFor(id);c[field]=value;
  assert.doesNotThrow(()=>E.authoringIssues(id,c),id+'.'+field);
  assert.ok(E.authoringIssues(id,c).length,id+'.'+field);
 }
});

test('Optional fields are validated when present and numeric limits are enforced',()=>{
 const schema=experienceContractSchema('predecir_resultado');
 for(const mutate of [c=>c.options[0].x='wrong',c=>c.targets[0].allowed='a',c=>c.maximum=0,c=>c.goal=Infinity]){
  const c=contractFor('predecir_resultado');mutate(c);assert.ok(validate(c,schema).length);
 }
});
