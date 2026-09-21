import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildDifficultyInstruction, buildLanguageLearningInstruction } from '../public/js/escape-room-difficulty-policy.mjs';
import { answerDisclosureIssues, matchingPromptIssues, questionInteractionIssues, closeGeneratedAnswer } from '../public/js/escape-room-question-policy.mjs';
import { inferRequiredObjectiveMechanic, materializeObjectiveBlueprintMechanics, objectiveAnswerTargetsEquivalent, shiftCipherText } from '../public/js/escape-room-mechanics.mjs';
const source=readFileSync('public/js/PigPenCreator.js','utf8');
function extract(name) {const start=source.search(new RegExp(`^(?:async )?function ${name}\\(`,'m'));const rest=source.slice(start);return rest.slice(0,rest.slice(1).search(/^(?:async )?function /m)+1);}
const normalize=(value='')=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
for(const materia of ['Inglés','Matemáticas','Ciencias','Historia'])for(const idioma of ['en-US','es-419']) {
 const prompt=buildDifficultyInstruction({materia,idioma,nivel:'Secundaria',grado:'Segundo',dificultad:'desafiante'});
 assert.match(prompt,/TODAS las preguntas deben ser ACERTIJOS CURRICULARES/);
 assert.match(prompt,/dos operaciones/);assert.match(prompt,/tres operaciones/);
 assert.equal(prompt.includes('PERFIL LINGÜÍSTICO:'),idioma==='en-US');
}
assert.equal(buildLanguageLearningInstruction({idioma:'es-419',trimestre:'B1'}),'');
const screenshot={tipo_interaccion:'texto',respuesta_correcta:'ORION CONSTELLATION',reto:'The sensor shows scrambled characters N-O-R-I, to be submitted as the full designation ORION CONSTELLATION. What is the full name?'};
assert.equal(answerDisclosureIssues(screenshot).length,2);
assert.equal(questionInteractionIssues(screenshot).length,0,'Legacy data is not rejected on read');
assert.ok(questionInteractionIssues(screenshot,{generated:true}).length);
assert.ok(answerDisclosureIssues({tipo_interaccion:'texto',respuesta_correcta:'42',reto:'La respuesta es 42. Escribe el resultado.'}).length);
assert.equal(answerDisclosureIssues({tipo_interaccion:'opcion_multiple',respuesta_correcta:'Desert',reto:'Desert and forest sites have different rainfall. Which site meets both conditions?',opciones:['Desert','Forest']}).length,0);
assert.equal(answerDisclosureIssues({tipo_interaccion:'texto',respuesta_correcta:'ORION',reto:'Use the sky map to identify the hunter. Unscramble I-R-O-N-O.'}).length,0);
const ctx=vm.createContext({normalizeString:(v,f='')=>String(v ?? f).trim(),normalizeObjectiveFixedText:normalize,
 normalizePairList:v=>v,normalizeTextList:v=>v,normalizeQuestionTransportFields:q=>structuredClone(q),
 closeGeneratedAnswer,questionInteractionIssues,answerDisclosureIssues,matchingPromptIssues,
 inferRequiredObjectiveMechanic,objectiveAnswerTargetsEquivalent,shiftCipherText,
 getGeneratedRoomTemplateCopy:()=>({}),structuredClone});
vm.runInContext(['parseQuestionPlanPairStatements','generatedQuestionPlanIssues','materializeGeneratedQuestionTemplate','buildObjectiveRoomFillResponseSchema','buildFixedObjectiveFillShape','validateFixedObjectiveFill','objectivePlanContractIssues','requestFixedObjectiveRoomFill'].map(extract).join('\n'),ctx);
const plan={plan_id:'r1_p1',answer_target:'12',difficulty_policy_version:3};
const q={_plan_id:'r1_p1',titulo:'Balance the supplies',reto:'Three teams need four packs each. How many packs are needed?',pista:'Count equal groups.',retroalimentacion_correcta:'Correct.',retroalimentacion_incorrecta:'Check both quantities.',respuesta_correcta:'12',respuestas_aceptadas:['12'],opciones:['12','7','3','4'],parejas:[],elementos:[]};
assert.equal(ctx.materializeGeneratedQuestionTemplate(q,plan,'opcion_multiple').respuesta_correcta,'12');
assert.throws(()=>ctx.materializeGeneratedQuestionTemplate({...q,respuesta_correcta:'7'},plan,'opcion_multiple'),/no coincide/);
assert.throws(()=>ctx.materializeGeneratedQuestionTemplate({...q,opciones:['12']},plan,'opcion_multiple'),/cuatro opciones/);
assert.throws(()=>ctx.materializeGeneratedQuestionTemplate({...q,pista:''},plan,'opcion_multiple'),/Falta/);
assert.throws(()=>ctx.materializeGeneratedQuestionTemplate({...q,_plan_id:'other'},plan,'opcion_multiple'),/identificador/);
assert.equal(q.respuesta_correcta,'12');assert.equal(q.opciones.length,4,'No mutation');
const bankPlan={...plan,answer_target:'1 → Sun | 2 → Moon'};
assert.equal(ctx.generatedQuestionPlanIssues({...q,parejas:[{izquierda:'1',derecha:'Sun'},{izquierda:'2',derecha:'Moon'}]},bankPlan,'completar_espacio').length,0);
assert.ok(ctx.generatedQuestionPlanIssues({...q,parejas:[{izquierda:'1',derecha:'Moon'}]},bankPlan,'completar_espacio').length);
const dragSlot={plan_id:'r1_p1',interaction:'drag_drop'};
const dragPlan={answer_target:'Earth → GEOCENTRIC | Sun → HELIOCENTRISM',application:'Classify each model using the root evidence.',case_data:['The records describe two centers.'],mechanic_contract:{kind:'none'}};
assert.match(ctx.objectivePlanContractIssues(dragPlan,dragSlot).join(' '),/exactamente 6/);
const sixDrag={...dragPlan,answer_target:'Earth → GEOCENTRIC | Sun → HELIOCENTRISM | Moon → SELENOCENTRIC | Mars → AREOCENTRIC | Stars → ASTROCENTRIC | Galaxy → GALACTOCENTRIC'};
assert.equal(ctx.objectivePlanContractIssues(sixDrag,dragSlot).length,0);
assert.match(ctx.objectivePlanContractIssues({...sixDrag,mechanic_contract:{kind:'cipher'}},dragSlot).join(' '),/kind="none"/);
const cipherSlot={plan_id:'r4_p1',interaction:'texto'};
const cipherPlan={answer_target:'MILKY WAY',application:'Decode NJMLZ XBZ by reversing the transmission shift.',case_data:['The transmitted text is NJMLZ XBZ.'],cognitive_operation:'Caesar cipher decode',mechanic_contract:{kind:'cipher',solution:'MILKY WAY',ciphertext:'NJMLZ XBZ',shift:1,alphabet:'ABCDEFGHIJKLMNOPQRSTUVWXYZ'}};
assert.equal(ctx.objectivePlanContractIssues(cipherPlan,cipherSlot).length,0);
assert.match(ctx.objectivePlanContractIssues({...cipherPlan,mechanic_contract:{...cipherPlan.mechanic_contract,shift:-1}},cipherSlot).join(' '),/incompatibles/);
const anagramPlan={answer_target:'ORION',application:'Unscramble N-O-R-I-O.',case_data:['The console shows N-O-R-I-O.'],cognitive_operation:'Unscramble letters',mechanic_contract:{kind:'anagram',solution:'ORION',scrambled:'NORIO',shift:0,alphabet:'ABCDEFGHIJKLMNOPQRSTUVWXYZ'}};
assert.equal(ctx.objectivePlanContractIssues(anagramPlan,{plan_id:'r2_p1',interaction:'texto'}).length,0);
assert.match(ctx.objectivePlanContractIssues({...anagramPlan,mechanic_contract:{...anagramPlan.mechanic_contract,scrambled:'NOOIR'}},{plan_id:'r2_p1',interaction:'texto'}).join(' '),/literalmente/);
const materialized=materializeObjectiveBlueprintMechanics({rooms:[{question_plans:[cipherPlan,anagramPlan,{...sixDrag,interaction:'drag_drop',mechanic_contract:{kind:'cipher',solution:sixDrag.answer_target,shift:1}}]}]});
assert.equal(materialized.rooms[0].question_plans[0].mechanic_contract.ciphertext,'NJMLZ XBZ');
assert.equal(materialized.rooms[0].question_plans[1].mechanic_contract.scrambled,'NORIO');
assert.equal(materialized.rooms[0].question_plans[2].mechanic_contract.kind,'none');
const template={question_plans:[{...plan,interaction:'texto',difficulty:'desafiante',pedagogical_role:'transfer'}]};
const shape=ctx.buildFixedObjectiveFillShape(ctx.buildObjectiveRoomFillResponseSchema(template));
const slot=shape.r1_p1;
for(const field of ['knowledge','evidence','application','answer_target','reasoning_evidence','cognitive_operation','instruction_outline','hint_strategy','feedback_strategy'])slot[field]='Relevant curricular content';
slot.answer_target='12';slot.application='Compare both observations and determine the number.';slot.reasoning_steps=['Compare quantities','Apply the constraint'];
let calls=0;ctx.requestQualityJson=async()=>{calls++;return calls===1?{r1_p1:{...slot,application:'The answer is 12. Enter the number.'}}:shape;};
await ctx.requestFixedObjectiveRoomFill('prompt',{},template);assert.equal(calls,2,'Reject leaked solution before accepting blueprint');
assert.match(source,/type === "drag_drop" \? 6 : 2/);
assert.ok(questionInteractionIssues({tipo_interaccion:'drag_drop',interaction_contract_version:1,parejas:Array.from({length:4},(_,i)=>({izquierda:`D${i}`,derecha:`F${i}`}))},{generated:true}).some(issue=>/exactamente 6/.test(issue)));
assert.equal(questionInteractionIssues({tipo_interaccion:'drag_drop',interaction_contract_version:1,parejas:Array.from({length:6},(_,i)=>({izquierda:`D${i}`,derecha:`F${i}`}))},{generated:true}).length,0);
assert.doesNotMatch(source,/<option value="frase_libre"/);
assert.match(source,/Formato retirado · Regenerar pregunta/);
assert.doesNotMatch(extract('materializeGeneratedQuestionTemplate'),/result\.respuesta_correcta\s*=\s*interaction|copy.alternative|mergeGeneratedQuestionPairs/);
assert.match(extract('repairQuestionInteraction'),/buildDifficultyInstruction\(formData\)/);
assert.match(extract('buildQuestionRegenerationPrompt'),/BRIEFING BLOQUEADO/);
console.log('PASS puzzle contract: cross-subject demand, B1 only for English, screenshot rejection, valid candidates, fixed solution/slots, no fabricated distractors, blueprint repair, retired free response');
