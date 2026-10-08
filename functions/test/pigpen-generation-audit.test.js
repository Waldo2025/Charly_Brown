const test=require('node:test'),assert=require('node:assert/strict');
const {learnerQuestion,independentFindings}=require('../src/pigpen-generation-audit.js');
test('blind review hides private keys and rejects swapped blanks despite model approval',()=>{
 const q={tipo_interaccion:'completar_espacio',texto_con_hueco:'Rectas ___ y una ___',parejas:[{izquierda:'1',derecha:'proporción'},{izquierda:'2',derecha:'paralelas'}],respuesta_correcta:'private',retroalimentacion_correcta:'key'};
 const visible=learnerQuestion(q,0);assert.equal(visible.respuesta_correcta,undefined);assert.equal(visible.parejas,undefined);assert.equal(visible.retroalimentacion_correcta,undefined);
 const issues=independentFindings({preguntas:[q]},[{questionIndex:0,values:['paralelas','proporción'],evidence:'Las rectas son paralelas; se plantea una proporción.'}]);assert.equal(issues.length,1);assert.equal(issues[0].questionIndex,0);
});
test('independent sequence solution must match the configured correct order',()=>{
 const q={tipo_interaccion:'ordenar_secuencia',elementos:['Calcular','Identificar','Plantear']};
 assert.equal(independentFindings({preguntas:[q]},[{questionIndex:0,values:['Identificar','Plantear','Calcular'],evidence:'Primero se identifican datos, después se plantea y resuelve.'}]).length,1);
 assert.throws(()=>independentFindings({preguntas:[q]},[]),/omitió/);
});
