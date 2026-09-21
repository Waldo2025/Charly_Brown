import test from 'node:test';import assert from 'node:assert/strict';
import {fixedInteraction,contentDocument} from '../public/js/pigpen-fixed-content.mjs';
import {experience as E} from '../public/js/escape-room-experience.mjs';
import {expressionRiddleIssues} from '../public/js/pigpen-mechanic-coherence.mjs';
test('Generated expression banks require at least two operations across 128 seeds',()=>{
 const goals=new Set();
 for(let seed=0;seed<128;seed++){
  const c=fixedInteraction('construir_expresion',E,seed);goals.add(c.goal);
  assert.equal(c.options.length,8);assert.equal(new Set(c.options.map(o=>o.label)).size,8);
  assert.equal(c.maximum,5);assert.deepEqual(E.authoringIssues('construir_expresion',c),[]);
  assert.equal(E.evaluate('construir_expresion',c,E.solutionState(c.solutions[0])),'correct');
  const nums=c.options.filter(o=>/^\d+$/.test(o.label)),ops=c.options.filter(o=>!/^\d+$/.test(o.label));
  for(const a of nums){assert.notEqual(E.evaluate('construir_expresion',c,{t:[a.id]}),'correct');for(const b of nums)for(const op of ops)assert.notEqual(E.evaluate('construir_expresion',c,{t:[a.id,op.id,b.id]}),'correct');}
  assert.ok(contentDocument(c).fields.every(f=>!f.path.includes('options')));
 }
 assert.ok(goals.size>10);
});
test('Solved expression cannot be dictated by question, instructions or hint',()=>{
 const c=fixedInteraction('construir_expresion',E,1),expression=c.solutions[0].answers[0].options.map(id=>c.options.find(o=>o.id===id).label).join(' ');
 for(const field of ['reto','pista','extra_hint','retroalimentacion_incorrecta']){
  const q={tipo_interaccion:'construir_expresion',interaction_data:c,[field]:'Build '+expression+'.'};
  assert.ok(expressionRiddleIssues(q).some(issue=>issue.includes(field)));
 }
 const q={tipo_interaccion:'construir_expresion',interaction_data:{...c,instructions:'Build '+expression},reto:'Find a way to satisfy the conditions.'};assert.ok(expressionRiddleIssues(q).length);
 assert.deepEqual(expressionRiddleIssues({tipo_interaccion:'construir_expresion',interaction_data:c,reto:'Find an expression that satisfies the conditions.',retroalimentacion_correcta:expression}),[]);
});
