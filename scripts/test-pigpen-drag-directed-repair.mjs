import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { normalizePairList, normalizeString } from '../public/js/escape-room-creator-model.mjs';

const source = fs.readFileSync(new URL('../public/js/PigPenCreator.js', import.meta.url), 'utf8');
const pairs = ['oak', 'fern', 'moss', 'pine', 'cedar', 'birch'].map((word, index) => ({ izquierda: `Case ${index}`, derecha: word, pista: '' }));
const texts = { reto: 'Classify the samples.', pista: 'Use the observed traits.', retroalimentacion_correcta: 'Samples classified.', retroalimentacion_incorrecta: 'Compare the traits again.' };
async function run(question, responses) {
  const calls = [];
  const context = vm.createContext({
    normalizePairList, normalizeString,
    normalizeObjectiveFixedText: v => String(v || '').trim().toLowerCase(),
    resolvePromptLanguageDirective: () => ({ directive: 'English' }),
    QUESTION_DIVERSITY_INSTRUCTION: 'Distinct cases', buildDifficultyInstruction: () => 'Apply evidence',
    requestQualityJson: async (prompt, form, temperature, options) => {
      calls.push({ prompt, schema: options.responseJsonSchema });
      if (!responses.length) throw Error('Unexpected extra request');
      return responses.shift();
    }
  });
  vm.runInContext(source.slice(source.indexOf('function parseQuestionPlanPairStatements('), source.indexOf('function materializeGeneratedQuestionTemplate(')), context);
  vm.runInContext(source.slice(source.indexOf('async function repairGeneratedDragQuestion('), source.indexOf('async function requestGeneratedRoomBundle(')), context);
  const result = await context.repairGeneratedDragQuestion(question, { formData: { idioma: 'en' }, mission: {}, missionIndex: 1, questionIndex: 2 });
  return { result: JSON.parse(JSON.stringify(result)), calls };
}

// Six valid correspondences survive a missing feedback; second request is text-only.
let test = await run({}, [
  { ...texts, retroalimentacion_incorrecta: '', ...Object.fromEntries(pairs.map((p, i) => [`pair_${i + 1}`, p])) },
  { retroalimentacion_incorrecta: texts.retroalimentacion_incorrecta }
]);
assert.deepEqual(test.result.parejas, pairs);
assert.deepEqual(Array.from(test.calls[1].schema.required), ['retroalimentacion_incorrecta']);

// Keep two existing pairs, keep one good new pair, repair only the duplicated slot.
test = await run({ ...texts, parejas: pairs.slice(0, 2), plan_id: 'preserve-me' }, [
  { reto: 'Compare six samples.', pair_3: pairs[2], pair_4: pairs[3], pair_5: pairs[4], pair_6: pairs[1] },
  { reto: 'Compare six samples.', pair_6: pairs[5] }
]);
assert.deepEqual(test.result.parejas, pairs);
assert.equal(test.result.plan_id, 'preserve-me');
assert.deepEqual(Array.from(test.calls[0].schema.required), ['reto', 'pair_3', 'pair_4', 'pair_5', 'pair_6']);
assert.deepEqual(Array.from(test.calls[1].schema.required), ['reto', 'pair_6']);
assert.match(test.calls[1].prompt, /repite destino o ficha/);
assert.match(test.calls[1].prompt, /izquierda es el destino visible; derecha es la ficha/);

await assert.rejects(run({ ...texts, parejas: pairs.slice(0, 2) }, [{}, {}]), /falta izquierda o derecha/);
assert.equal((await run({ ...texts, parejas: pairs }, [])).calls.length, 0);
console.log('PASS: partial repairs converge; no discarded valid pairs, filler, duplicate endpoints or extra retries.');
