import test from 'node:test';
import assert from 'node:assert/strict';
import {experience as E,createExperienceEngine} from '../public/js/escape-room-experience.mjs';
import {contractFor} from './fixtures/pigpen-experience.mjs';
import {experienceEditorFields,updateExperienceEditor} from '../public/js/escape-room-experience-authoring.mjs';
const type='construir_solucion';
test('pieces update, replace, deselect, recover and require the whole combination',()=>{
 const c=contractFor(type);let state={};
 assert.equal(E.evaluate(type,c,state),'unanswered');
 state=E.act(type,c,state,'t','a','toggle');
 assert.match(E.render(type,c,state,'room::q'),/aria-live="polite"><span>1\. Parte 0: Pieza 0/);
 state=E.act(type,c,state,'t','d','toggle');assert.deepEqual(state.t,['d']);
 state=E.act(type,c,state,'t','d','toggle');assert.deepEqual(state.t,[]);
 state=E.solutionState(c.solutions[0]);
 assert.equal(E.evaluate(type,c,JSON.parse(JSON.stringify(state))),'correct');
 assert.equal(E.evaluate(type,c,{...state,v:['f']}),'incorrect');
 assert.match(E.render(type,c,{},'room::q'),/Parte 0: —/);
});
test('explicit complete alternatives work without accepting mixed solutions, including offline engine',()=>{
 const c=contractFor(type);
 c.solutions.push({answers:[{target:'t',options:['d']},{target:'u',options:['e']},{target:'v',options:['f']}]});
 const offline=Function('return ('+createExperienceEngine.toString()+')()')();
 for(const engine of [E,offline]){
  assert.equal(engine.evaluate(type,c,{t:['d'],u:['e'],v:['f']}),'correct');
  assert.equal(engine.evaluate(type,c,{t:['a'],u:['e'],v:['f']}),'incorrect');
 }
 const q={tipo_interaccion:type,interaction_data:c};
 assert.ok(experienceEditorFields(q).some(f=>f.path==='solutions.1.answers.2.options'));
 updateExperienceEditor(q,'options.0.label','New message piece');assert.equal(c.options[0].label,'New message piece');
});
test('distractors are required in each visible bank',()=>{
 const c=contractFor(type);c.targets[0].allowed=['a'];assert.ok(E.authoringIssues(type,c).length);
 assert.deepEqual(E.config({question_types:[type]}).question_types,[type]);
});
