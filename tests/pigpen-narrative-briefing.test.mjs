import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
import {composePedagogicalRoom,pedagogicalRoomIssues,BRIEFING_NARRATIVE_INSTRUCTION} from '../public/js/pigpen-pedagogy.mjs';
test('A shared teaching scene stays connected, appears once and retains all case support',()=>{
 const knowledge='La guardia señala el cartel: en este puesto ficticio se permite entrar cuando la distancia está entre dos y tres metros.';
 const teaching_example='En su registro, una visitante que se detuvo a dos metros y medio recibió permiso; estaba dentro del intervalo.';
 const plans=Object.fromEntries([1,2].map(i=>['p'+i,{plan_id:'p'+i,knowledge,teaching_example,case_data:[`El registro actual del viajero ${i} muestra una distancia de ${i+3} metros.`],application:`Decide si puede pasar el viajero ${i}.`}]));
 const input={plans,mission:{contexto:'La puerta se cierra. Una guardia desliza un registro bajo el cristal.',datos_clave:['Compara cada distancia con ambos límites.'],preguntas:[{},{}]}};
 const result=composePedagogicalRoom(input,[{plan_id:'p1'},{plan_id:'p2'}]);
 assert.ok(result.mission.contexto.includes(knowledge+' '+teaching_example));
 assert.equal(result.mission.contexto.split(knowledge).length,2);
 assert.deepEqual(result.mission.datos_clave,input.mission.datos_clave);
 assert.deepEqual(pedagogicalRoomIssues(result.mission,Object.values(result.plans)),[]);
 assert.match(BRIEFING_NARRATIVE_INSTRUCTION,/narrativa elegida/);
 assert.match(BRIEFING_NARRATIVE_INSTRUCTION,/nunca modifica una regla curricular/);
});
test('Final room materialization does not expand five reminders into the entire lesson again',()=>{
 const src=readFileSync(new URL('../public/js/PigPenCreator.js',import.meta.url),'utf8');
 const a=src.indexOf('  const materializedEvidence = [...new Map(evidence.map'),b=src.indexOf('  return normalizeMission({',a);
 for(const count of [1,5]){
  const context=vm.createContext({evidence:Array.from({length:count},(_,i)=>'Reminder '+i),fallbackEvidence:Array.from({length:43},(_,i)=>'Lesson '+i),requiredEvidenceCount:5,normalizeObjectiveFixedText:x=>x,copy:{context:'Fallback'}});
  vm.runInContext(src.slice(a,b)+';globalThis.result=materializedEvidence;',context);
  assert.equal(context.result.length,5);
  assert.equal(context.result[0],'Reminder 0');
  if(count===5)assert.ok(context.result.every(x=>x.startsWith('Reminder')));
 }
});
test('Author experience and custom narrative take priority over prior example settings',async()=>{
 const {selectedExperienceInstruction}=await import('../public/js/pigpen-pedagogy.mjs');
 const text=selectedExperienceInstruction({narrativa:'Aventura espacial',ritmo:'progresivo',dificultad:'desafiante',pistas:'escasas',experience_config:{primary_reward:'imagen',extras:['comprobacion']}});
 for(const selected of ['Aventura espacial','progresivo','desafiante','escasas','imagen','comprobacion'])assert.ok(text.includes(selected));
 const custom=selectedExperienceInstruction({narrativaBase:'otro',narrativa:'Old airport',narrativaPersonalizada:'Una expedición submarina musical'});
 assert.ok(custom.includes('Una expedición submarina musical'));assert.ok(!custom.includes('Old airport'));
 assert.match(text,/adapta la ambientación a la selección actual/);
});

test('Narrative instructions contain no preset settings or documentary examples, while preserving user choices',async()=>{
 const {selectedExperienceInstruction}=await import('../public/js/pigpen-pedagogy.mjs');
 const neutral=selectedExperienceInstruction({})+'\n'+BRIEFING_NARRATIVE_INSTRUCTION;
 assert.doesNotMatch(neutral,/detectiv|aeropuert|airport|terminal|registro de una nave|exploradora|mensaje de un aliado/i);
 assert.match(neutral,/tipo de pregunta determina la interacción, no la ambientación/);
 assert.match(neutral,/sin imponer tensión ni urgencia/);
 const chosen='Un registro de seguridad en un aeropuerto';
 assert.ok(selectedExperienceInstruction({narrativa:chosen}).includes(chosen),'user-authored settings are not censored');
 const source=readFileSync(new URL('../public/js/PigPenCreator.js',import.meta.url),'utf8');
 assert.ok(!source.includes("del tipo 'fuente: observación o valor'"));
});
