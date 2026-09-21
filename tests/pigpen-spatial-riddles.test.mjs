import test from 'node:test';import assert from 'node:assert/strict';
import {fixedInteraction,contentDocument} from '../public/js/pigpen-fixed-content.mjs';
import {experience} from '../public/js/escape-room-experience.mjs';
import {coordinateRiddleIssues} from '../public/js/pigpen-mechanic-coherence.mjs';
function question(){return {tipo_interaccion:'respuesta_coordenadas',interaction_data:fixedInteraction('respuesta_coordenadas',experience,0),reto:'Start at (2,2). The first sign instructs you to go one cell left. The next sign instructs you to go one cell up. Where do you finish?',pista:'Follow each sign in order; x increases right and y increases down.'};}
test('Coordinates use a two-dimensional map and labels are not supplied by the model',()=>{
 const q=question();assert.equal(q.interaction_data.options.length,9);
 assert.equal(new Set(q.interaction_data.options.map(o=>o.x)).size,3);assert.equal(new Set(q.interaction_data.options.map(o=>o.y)).size,3);
 assert.ok(contentDocument(q.interaction_data).fields.every(f=>f.path[0]!=='options'));
 assert.deepEqual(coordinateRiddleIssues(q),[]);
 assert.equal(experience.evaluate(q.tipo_interaccion,q.interaction_data,{t:['cell0']}),'correct');
});
test('Screenshot regression: supplied destination, mismatched labels and a row of choices are rejected',()=>{
 const q=question();q.interaction_data.options=q.interaction_data.options.slice(0,4).map((o,i)=>({...o,x:i+1,y:1,label:i===1?'Zone A (1,2)':o.label}));
 q.reto='Keep distance at Zone A (1,2), then use both hands at (2,1), and make eye contact at Checkpoint C (1,1). Which cell corresponds to Checkpoint C?';
 const issues=coordinateRiddleIssues(q);
 assert.ok(issues.some(x=>x.includes('filas y columnas')));assert.ok(issues.some(x=>x.includes('contradice')));assert.ok(issues.some(x=>x.includes('revela')));
});
test('Hidden solution in hints and instructions is rejected, while starting coordinates are allowed',()=>{
 for(const field of ['pista','extra_hint','retroalimentacion_incorrecta']){const q=question();q[field]='Go to (1,1).';assert.ok(coordinateRiddleIssues(q).some(x=>x.includes('revela')));}
 const q=question();q.interaction_data.instructions='Choose the final location (1,1).';assert.ok(coordinateRiddleIssues(q).some(x=>x.includes('instrucciones revelan')));
 assert.deepEqual(coordinateRiddleIssues(question()),[]);
});

test('Coordinate deductions by row and column do not require movement keywords',()=>{
 const q=question();
 q.reto='The row number is the difference between three and two. The column number is the quotient of four divided by four. Which cell satisfies both conditions?';
 q.interaction_data.instructions='Select the intersection of the deduced row and column.';
 assert.deepEqual(coordinateRiddleIssues(q),[]);
 assert.equal(experience.evaluate(q.tipo_interaccion,q.interaction_data,{t:['cell0']}),'correct');
});
