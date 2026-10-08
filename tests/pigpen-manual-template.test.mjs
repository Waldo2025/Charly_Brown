import test from 'node:test';
import assert from 'node:assert/strict';
import { buildManualTemplatePlan, buildManualTemplateQuestion, buildManualTemplateQuestions, buildManualTemplateInteractionData } from '../public/js/pigpen-manual-template.mjs';
import { experience } from '../public/js/escape-room-experience.mjs';
import { questionInteractionIssues } from '../public/js/escape-room-question-policy.mjs';
import { getAuthoringLabels } from '../public/js/escape-room-game-i18n.mjs';
import { isSingleWordAnswer } from '../public/js/escape-room-creator-model.mjs';

const CLASSICS = ['texto', 'opcion_multiple', 'relacion_columnas', 'drag_drop', 'multimedia', 'verdadero_falso', 'ordenar_secuencia', 'completar_espacio'];

test('Template structure comes from the brief and never asks a model',async()=>{
  const original=globalThis.fetch;globalThis.fetch=()=>{throw new Error('manual template must not call any API');};
  try{
    const plan=buildManualTemplatePlan({rooms:3,questionsPerRoom:2,questionTypes:['opcion_multiple','clasificar_grupos','texto','relacion_columnas','completar_espacio','ordenar_secuencia'],seed:'seed-1'});
    assert.equal(plan.length,3);assert.deepEqual(plan.map(room=>room.length),[2,2,2]);
    assert.ok(plan.flat().every(type=>['opcion_multiple','clasificar_grupos','texto','relacion_columnas','completar_espacio','ordenar_secuencia'].includes(type)));
    assert.deepEqual(buildManualTemplatePlan({rooms:1,questionsPerRoom:1,questionTypes:[]}),buildManualTemplatePlan({rooms:1,questionsPerRoom:1,questionTypes:['texto']}));
    assert.deepEqual(buildManualTemplatePlan({rooms:2,questionsPerRoom:3,questionTypes:['texto'],seed:'a'}),buildManualTemplatePlan({rooms:2,questionsPerRoom:3,questionTypes:['texto'],seed:'a'}),'seeded plan is reproducible');
  }finally{globalThis.fetch=original;}
});

for(const type of CLASSICS)test(`Hand-authored ${type} is ready for text only`,()=>{
  const question=buildManualTemplateQuestion({roomIndex:0,questionIndex:0,type,locale:'es-419'});
  assert.equal(question.tipo_interaccion,type);
  assert.equal(question.reto,'','the teacher writes the challenge');
  assert.deepEqual(questionInteractionIssues(question),[],'no structural blocker for authored content');
});

test('Text answers stay within the one-word rule and options carry a literal solution',()=>{
  const texto=buildManualTemplateQuestion({type:'texto',locale:'fr-FR'});
  assert.ok(isSingleWordAnswer(texto.respuesta_correcta),texto.respuesta_correcta);
  const choice=buildManualTemplateQuestion({type:'opcion_multiple',locale:'en-US'});
  assert.equal(choice.opciones.length,4);
  assert.equal(choice.respuesta_correcta,choice.opciones[0]);
  assert.deepEqual(new Set(choice.opciones).size,4);
});

test('Column matching and fill-blank carry the distractors their v2 contract requires',()=>{
  const matching=buildManualTemplateQuestion({type:'relacion_columnas',locale:'es-419'});
  assert.equal(matching.interaction_contract_version,2);
  assert.equal(matching.parejas.length,3);
  assert.deepEqual(matching.opciones.length,2);
  const fill=buildManualTemplateQuestion({type:'completar_espacio',locale:'es-419'});
  assert.equal(fill.texto_con_hueco.match(/___/g).length,1);
  assert.equal(fill.parejas.length,1);
  assert.equal(fill.parejas[0].izquierda,'1');
  assert.equal(fill.opciones.length,1);
});

for(const definition of experience.definitions)test(`${definition.id}: fixed topology is editable and playable without generation`,()=>{
  const contract=buildManualTemplateInteractionData(definition.id,'es-419',7);
  assert.deepEqual(experience.structuralIssues(definition.id,contract),[]);
  assert.equal(experience.evaluate(definition.id,contract,experience.solutionState(contract.solutions[0])),'correct');
  assert.ok(questionInteractionIssues(buildManualTemplateQuestion({type:definition.id,locale:'es-419'})).length===0);
  if(['expression','coordinates'].includes(definition.family))assert.ok(contract.options.every(option=>!String(option.label).includes('Ficha')),'numeric banks keep their fixed labels');
  else assert.equal(contract.options[0].label,'Ficha 1');
});

test('Markers follow the language chosen in the brief',()=>{
  const byLocale={ 'es-419':'Opción','es-ES':'Opción','en-US':'Option','en-GB':'Option','fr-FR':'Option','pt-BR':'Opção' };
  for(const [locale,expected] of Object.entries(byLocale)){
    assert.equal(getAuthoringLabels(locale).option,expected);
    assert.equal(buildManualTemplateQuestion({type:'opcion_multiple',locale}).opciones[0],`${expected} 1`);
  }
  assert.equal(buildManualTemplateQuestions({roomIndex:1,types:['texto','opcion_multiple'],locale:'pt-BR'})[1].opciones[3],'Opção 4');
});
