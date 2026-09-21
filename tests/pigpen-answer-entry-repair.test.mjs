import test from 'node:test';
import assert from 'node:assert/strict';
import { repairAnswerEntryInstruction, answerDisclosureIssues } from '../public/js/escape-room-question-policy.mjs';

function duplicateDragDropIssues(plan = {}, slot = {}) {
  const items = (Array.isArray(plan.solution_pairs) ? plan.solution_pairs : [])
    .filter(pair => String(pair?.izquierda || '').trim() && String(pair?.derecha || '').trim());
  const left = items.map(pair => String(pair.izquierda).toLocaleLowerCase().trim());
  const right = items.map(pair => String(pair.derecha).toLocaleLowerCase().trim());
  const findDuplicates = (values = []) => {
    const seen = new Set();
    const dupes = new Set();
    values.forEach((value) => {
      if (!value) return;
      if (seen.has(value)) dupes.add(value);
      seen.add(value);
    });
    return [...dupes];
  };
  const leftDuplicates = findDuplicates(left);
  const rightDuplicates = findDuplicates(right);
  if (items.length !== 6 || leftDuplicates.length || rightDuplicates.length) {
    return [`${slot.plan_id}: cada destino y cada ficha deben ser completos y distintos. Destinos repetidos: ${JSON.stringify(leftDuplicates)}; respuestas repetidas: ${JSON.stringify(rightDuplicates)}. Conserva las relaciones válidas y sustituye las repetidas por relaciones curriculares específicas, no por copias numeradas.`];
  }
  return [];
}

function dragDropPairRepairContext(plan = {}, slot = {}) {
  if ((slot.interaction || '').toLowerCase() !== 'drag_drop') return null;
  const token = value => String(value || '').toLocaleLowerCase().trim();
  const rawPairs = Array.isArray(plan.solution_pairs) ? plan.solution_pairs : [];
  const left = rawPairs.map(pair => token(pair?.izquierda));
  const right = rawPairs.map(pair => token(pair?.derecha));
  const byValue = (values = []) => {
    const byKey = {};
    values.forEach((value, index) => {
      if (!value) return;
      (byKey[value] ||= []).push(index);
    });
    return {
      values: Object.entries(byKey).filter(([, indexes]) => indexes.length > 1).map(([value]) => value),
      indices: Object.entries(byKey).filter(([, indexes]) => indexes.length > 1).flatMap(([, indexes]) => indexes)
    };
  };
  const leftDup = byValue(left);
  const rightDup = byValue(right);
  const invalid = rawPairs
    .map((pair, index) => (token(pair?.izquierda) && token(pair?.derecha) ? -1 : index))
    .filter(index => index >= 0);
  const conflict = [...invalid, ...leftDup.indices, ...rightDup.indices];
  return {
    validPairs: rawPairs.filter((pair, index) => !conflict.includes(index)),
    leftDuplicates: leftDup.values,
    rightDuplicates: rightDup.values,
    duplicateOrInvalidIndices: [...new Set(conflict)],
    hasPairPayloadIssue: !!(invalid.length || leftDup.values.length || rightDup.values.length)
  };
}

async function loadRequestFixedRoomFill() {
  const {readFileSync} = await import('node:fs');
  const {default:vm} = await import('node:vm');
  const source = readFileSync(new URL('../public/js/PigPenCreator.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function requestFixedObjectiveRoomFill(');
  const end = source.indexOf('\nasync function ', start + 1);
  const factory = () => {
    const ctx = {
      buildObjectiveRoomFillResponseSchema: () => ({ properties: { r4_p1: {} }, required: ['r4_p1'] }),
      validateFixedObjectiveFill: () => [],
      normalizeQuestionPlanSolutionPairs: () => [],
      normalizePairList: value => Array.isArray(value) ? value : [],
      answerDisclosureIssues: () => [],
      matchingPromptIssues: () => [],
      repairAnswerEntryInstruction: value => value,
      objectivePlanContractIssues: duplicateDragDropIssues,
      buildDragDropPairRepairContext: dragDropPairRepairContext,
      experience: { get: () => null },
      normalizeObjectiveQuestionPlan: value => value,
      setStatus: () => {}
    };
    vm.runInContext(source.slice(start, end), vm.createContext(ctx));
    return ctx;
  };
  return { factory, vm };
}

test('Repairs literal answer-entry instruction while preserving the incomplete word and question', () => {
  const reto = "The screen displays '_ESTURE'. Which word describes a movement used to communicate? Type the complete word GESTURE.";
  assert.equal(answerDisclosureIssues({tipo_interaccion:'texto', respuesta_correcta:'GESTURE', reto}).length, 1);
  const fixed = repairAnswerEntryInstruction(reto, ['GESTURE']);
  assert.equal(fixed, "The screen displays '_ESTURE'. Which word describes a movement used to communicate? Type the answer you deduced.");
  assert.equal(answerDisclosureIssues({tipo_interaccion:'texto', respuesta_correcta:'GESTURE', reto:fixed}).length, 0);
  assert.equal(repairAnswerEntryInstruction(fixed, ['GESTURE']), fixed);
});

test('Repairs Spanish and quoted terminal directives but preserves candidates and factual evidence', () => {
  assert.equal(repairAnswerEntryInstruction('Escribe la palabra «GESTO».', ['GESTO']), 'Escribe la palabra «GESTO».');
  assert.equal(repairAnswerEntryInstruction('Escribe la palabra "GESTO".', ['GESTO']), 'Escribe la respuesta que dedujiste.');
  for (const text of ['Write GESTURE or POSTURE depending on the clue.', 'The correct answer is GESTURE.', 'A gesture is a movement. Which example meets the rule?', 'Type the complete English vocabulary word.']) {
    assert.equal(repairAnswerEntryInstruction(text, ['GESTURE']), text);
  }
  assert.ok(answerDisclosureIssues({tipo_interaccion:'texto',respuesta_correcta:'GESTURE',reto:repairAnswerEntryInstruction('The correct answer is GESTURE.', ['GESTURE'])}).length);
});

test('requestFixedObjectiveRoomFill mantiene campos y repara pares duplicados en segunda pasada', async () => {
  const {factory} = await loadRequestFixedRoomFill();
  const ctx = factory();
  let requestCount = 0;
  ctx.requestQualityJson = async (_prompt, _context, _temperature, options) => {
    requestCount += 1;
    if (options?.responseJsonSchema?.properties?.r4_p1?.properties?.solution_pairs) {
      return {
        r4_p1: {
          solution_pairs: [
            { izquierda: 'religious power', derecha: 'sacred order' },
            { izquierda: 'civic power', derecha: 'municipal authority' },
            { izquierda: 'family status', derecha: 'household role' },
            { izquierda: 'civic institution', derecha: 'governance structure' },
            { izquierda: 'social order', derecha: 'legal hierarchy' },
            { izquierda: 'kinship tie', derecha: 'blood line' }
          ]
        }
      };
    }
    if (requestCount === 1) {
      return {
        r4_p1: {
          knowledge: 'Poderes y relaciones históricas',
          case_data: ['La moneda sagrada se asigna a un rango ceremonial.', 'El registro civil usa estatus familiar para la elegibilidad.'],
          application: 'Relaciona poder y rol en esta cultura de ejemplo.',
          instruction_outline: 'Revisa cada ficha y ubícala con su destino.',
          hint_strategy: 'Busca el criterio de función pública.',
          answer_target: 'religious power → sacred order | civic power → municipal authority | family status → household role | civic institution → governance structure | social order → legal hierarchy | kinship tie → blood line',
          reasoning_steps: ['Detecta el criterio', 'Asigna la ficha', 'Verifica unicidad'],
          evidence: 'Historia comparada',
          reasoning_evidence: 'Texto curricular permite deducir',
          cognitive_operation: 'análisis',
          transfer_delta: 'Aplicación en otro contexto',
          feedback_strategy: 'Contrasta alternativas',
          distractor_errors: ['Sin confundir conceptos'],
          mechanic_contract: { kind: 'none', solution: '', ciphertext: '', computed_value: '', claimed_value: '', expected_boolean: false, scrambled: '', shift: 0, alphabet: '', ordering_rule: '', items: [] },
          solution_pairs: [
            { izquierda: 'religious power', derecha: 'sacred order' },
            { izquierda: 'civic power', derecha: 'sacred order' },
            { izquierda: 'family status', derecha: 'household role' },
            { izquierda: 'religious power', derecha: 'temple authority' },
            { izquierda: 'civic institution', derecha: 'governance structure' },
            { izquierda: 'social order', derecha: 'legal hierarchy' }
          ]
        }
      };
    }
    return {
      r4_p1: {
        knowledge: 'Poderes y relaciones históricas',
        case_data: ['La moneda sagrada se asigna a un rango ceremonial.', 'El registro civil usa estatus familiar para la elegibilidad.'],
        application: 'Relaciona poder y rol en esta cultura de ejemplo.',
        instruction_outline: 'Revisa cada ficha y ubícala con su destino.',
        hint_strategy: 'Busca el criterio de función pública.',
        answer_target: 'religious power → sacred order | civic power → municipal authority | family status → household role | civic institution → governance structure | social order → legal hierarchy | kinship tie → blood line',
        reasoning_steps: ['Detecta el criterio', 'Asigna la ficha', 'Verifica unicidad'],
        evidence: 'Historia comparada',
        reasoning_evidence: 'Texto curricular permite deducir',
        cognitive_operation: 'análisis',
        transfer_delta: 'Aplicación en otro contexto',
        feedback_strategy: 'Contrasta alternativas',
        distractor_errors: ['Sin confundir conceptos'],
        mechanic_contract: { kind: 'none', solution: '', ciphertext: '', computed_value: '', claimed_value: '', expected_boolean: false, scrambled: '', shift: 0, alphabet: '', ordering_rule: '', items: [] }
      }
    };
  };
  const result = await ctx.requestFixedObjectiveRoomFill('',{}, {question_plans:[{plan_id:'r4_p1',interaction:'drag_drop',difficulty_policy_version:1}]}, null);
  assert.equal(result.r4_p1.knowledge, 'Poderes y relaciones históricas');
  assert.equal(result.r4_p1.case_data[0], 'La moneda sagrada se asigna a un rango ceremonial.');
  assert.equal(result.r4_p1.answer_target, 'religious power → sacred order | civic power → municipal authority | family status → household role | civic institution → governance structure | social order → legal hierarchy | kinship tie → blood line');
  assert.equal(result.r4_p1.solution_pairs.length, 6);
});

test('requestFixedObjectiveRoomFill conserva texto privado con pares incompletos duplicados', async () => {
  const {factory} = await loadRequestFixedRoomFill();
  const ctx = factory();
  let step = 0;
  ctx.requestQualityJson = async (_prompt, _context, _temperature, options) => {
    if (options?.responseJsonSchema?.properties?.r4_p1?.properties?.solution_pairs) {
      step += 1;
      return {
        r4_p1: {
          solution_pairs: step === 1
            ? [
              { izquierda: 'religious power', derecha: '' },
              { izquierda: 'civic power', derecha: 'municipal authority' },
              { izquierda: 'family status', derecha: 'household role' },
              { izquierda: 'civic power', derecha: 'temple authority' },
              { izquierda: '', derecha: 'kinship lineage' },
              { izquierda: 'social order', derecha: 'legal hierarchy' }
            ]
            : [
              { izquierda: 'religious power', derecha: 'sacred order' },
              { izquierda: 'civic power', derecha: 'municipal authority' },
              { izquierda: 'family status', derecha: 'household role' },
              { izquierda: 'civic institution', derecha: 'governance structure' },
              { izquierda: 'social order', derecha: 'legal hierarchy' },
              { izquierda: 'kinship tie', derecha: 'blood line' }
            ]
        }
      };
    }
    return {
      r4_p1: {
        knowledge: 'Poderes y relaciones históricas',
        case_data: ['La moneda sagrada se asigna a un rango ceremonial.', 'El registro civil usa estatus familiar para la elegibilidad.'],
        application: 'Relaciona poder y rol en esta cultura de ejemplo.',
        instruction_outline: 'Revisa cada ficha y ubícala con su destino.',
        hint_strategy: 'Busca el criterio de función pública.',
        answer_target: 'religious power → sacred order | civic power → municipal authority | family status → household role | civic institution → governance structure | social order → legal hierarchy | kinship tie → blood line',
        reasoning_steps: ['Detecta el criterio', 'Asigna la ficha', 'Verifica unicidad'],
        evidence: 'Historia comparada',
        reasoning_evidence: 'Texto curricular permite deducir',
        cognitive_operation: 'análisis',
        transfer_delta: 'Aplicación en otro contexto',
        feedback_strategy: 'Contrasta alternativas',
        distractor_errors: ['Sin confundir conceptos'],
        mechanic_contract: { kind: 'none', solution: '', ciphertext: '', computed_value: '', claimed_value: '', expected_boolean: false, scrambled: '', shift: 0, alphabet: '', ordering_rule: '', items: [] },
        solution_pairs: [
          { izquierda: 'religious power', derecha: '' },
          { izquierda: 'civic power', derecha: 'municipal authority' },
          { izquierda: 'family status', derecha: 'household role' },
          { izquierda: 'civic power', derecha: 'temple authority' },
          { izquierda: '', derecha: 'kinship lineage' },
          { izquierda: 'social order', derecha: 'legal hierarchy' }
        ]
      }
    };
  };
  const result = await ctx.requestFixedObjectiveRoomFill('',{}, {question_plans:[{plan_id:'r4_p1',interaction:'drag_drop',difficulty_policy_version:1}]}, null);
  assert.equal(result.r4_p1.case_data.length, 2);
  assert.equal(result.r4_p1.application, 'Relaciona poder y rol en esta cultura de ejemplo.');
  assert.equal(result.r4_p1.solution_pairs.map(pair => pair.izquierda).filter(Boolean).length, 6);
});

test('requestFixedObjectiveRoomFill falla tras reparaciones de pares sin corregir', async () => {
  const {factory} = await loadRequestFixedRoomFill();
  const ctx = factory();
  ctx.requestQualityJson = async (_prompt, _context, _temperature, options) => {
    const invalid = {
      r4_p1: {
        solution_pairs: [
          { izquierda: 'religious power', derecha: 'sacred order' },
          { izquierda: 'civic power', derecha: 'sacred order' },
          { izquierda: 'family status', derecha: 'household role' },
          { izquierda: 'religious power', derecha: 'temple authority' },
          { izquierda: 'family status', derecha: 'kinship lineage' },
          { izquierda: 'social order', derecha: 'legal hierarchy' }
        ]
      }
    };
    if (options?.responseJsonSchema?.properties?.r4_p1?.properties?.solution_pairs) return invalid;
    return {
      r4_p1: {
        knowledge: 'Poderes y relaciones históricas',
        case_data: ['La moneda sagrada se asigna a un rango ceremonial.', 'El registro civil usa estatus familiar para la elegibilidad.'],
        application: 'Relaciona poder y rol en esta cultura de ejemplo.',
        instruction_outline: 'Revisa cada ficha y ubícala con su destino.',
        hint_strategy: 'Busca el criterio de función pública.',
        answer_target: 'religious power → sacred order | civic power → municipal authority | family status → household role | civic institution → governance structure | social order → legal hierarchy | kinship tie → blood line',
        reasoning_steps: ['Detecta el criterio', 'Asigna la ficha', 'Verifica unicidad'],
        evidence: 'Historia comparada',
        reasoning_evidence: 'Texto curricular permite deducir',
        cognitive_operation: 'análisis',
        transfer_delta: 'Aplicación en otro contexto',
        feedback_strategy: 'Contrasta alternativas',
        distractor_errors: ['Sin confundir conceptos'],
        mechanic_contract: { kind: 'none', solution: '', ciphertext: '', computed_value: '', claimed_value: '', expected_boolean: false, scrambled: '', shift: 0, alphabet: '', ordering_rule: '', items: [] }
      }
    };
  };

  await assert.rejects(
    () => ctx.requestFixedObjectiveRoomFill('',{}, {question_plans:[{plan_id:'r4_p1',interaction:'drag_drop',difficulty_policy_version:1}]}, null),
    error => /No se pudieron completar los campos fijos/.test(error.message)
      && /Destinos repetidos/.test(error.message)
  );
});
