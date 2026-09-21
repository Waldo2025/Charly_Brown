import test from 'node:test';
import assert from 'node:assert/strict';
import {experience as E} from '../public/js/escape-room-experience.mjs';
import {contractFor} from './fixtures/pigpen-experience.mjs';
test('Identical labels in independent answer/justification or correction banks are valid',()=>{
 for(const id of ['respuesta_justificacion','corregir_error']){
  const c=contractFor(id);c.options=[{id:'a',label:'Shared phrase'},{id:'b',label:'Alternative'},{id:'c',label:'Shared phrase'},{id:'d',label:'Another alternative'}];
  c.targets[0].allowed=['a','b'];c.targets[1].allowed=['c','d'];c.solutions[0].answers[1].options=['c'];
  assert.deepEqual(E.authoringIssues(id,c),[]);assert.equal(E.evaluate(id,c,E.solutionState(c.solutions[0])),'correct');
  assert.deepEqual(E.normalizeContract(c,id),c);
  c.targets[0].allowed=['a','b','c'];
  assert.match(E.authoringIssues(id,c).join(' '),/Shared phrase.*a, c/);
 }
});
test('Repeated text fragments and coordinate labels remain distinguishable by displayed position',()=>{
 for(const id of ['marcar_evidencia','respuesta_coordenadas']){
  const c=contractFor(id);c.options[1].label=c.options[0].label;
  assert.deepEqual(E.authoringIssues(id,c),[]);
  const html=E.render(id,c,{},'question','es');
  if(id==='marcar_evidencia'){assert.match(html,/1\. A/);assert.match(html,/2\. A/);}
  else {assert.match(html,/A \(1, 1\)/);assert.match(html,/A \(2, 1\)/);}
 }
});
test('Indistinguishable alternatives in a shared bank stay rejected',()=>{
 for(const id of ['predecir_resultado','seleccionar_contraejemplo','seleccion_multiple','comparar_atributos']){
  const c=contractFor(id);c.options[1].label=c.options[0].label;
  assert.match(E.authoringIssues(id,c).join(' '),/indistinguibles/);
 }
});
test('comparar_atributos requires every column/option and row/target to have selections', () => {
  const c = contractFor('comparar_atributos');
  assert.deepEqual(E.authoringIssues('comparar_atributos', c), []);

  const withOrphanOption = JSON.parse(JSON.stringify(c));
  withOrphanOption.options.push({ id: 'd', label: 'Feature D', value: 4, x: 4, y: 1 });
  assert.match(E.authoringIssues('comparar_atributos', withOrphanOption).join(' '), /toda columna o propiedad debe estar seleccionada/);

  const withEmptyTarget = JSON.parse(JSON.stringify(c));
  withEmptyTarget.solutions[0].answers[0].options = [];
  assert.match(E.authoringIssues('comparar_atributos', withEmptyTarget).join(' '), /cada elemento o fila debe tener al menos un atributo/);
});
