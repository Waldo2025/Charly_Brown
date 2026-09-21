import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { questionInteractionIssues } from '../public/js/escape-room-question-policy.mjs';

const source = fs.readFileSync(new URL('../public/js/PigPenCreator.js', import.meta.url), 'utf8');
const implementation = source.slice(source.indexOf('async function analyzeAndRepairGeneratedRoom('), source.indexOf('async function runWithConcurrency('));
const valid = { tipo_interaccion: 'multimedia', interaction_contract_version: 1, opciones: ['Desert', 'Forest', 'Tundra', 'Grassland'], respuesta_correcta: 'Desert' };
const good = { ...valid, titulo: 'Keep this question' };
const invalid = { ...valid, opciones: ['Desert', 'Desert'] };
const room = q => ({ mission: { titulo: 'Keep this room', preguntas: [good, q] } });
function harness(replies, { canonical = false, transport = false, mechanic = false } = {}) {
  const calls = [];
  const context = vm.createContext({
    requestQualityJson: async prompt => {
      calls.push(prompt);
      if (transport) throw Object.assign(new Error('gemini_quota_exhausted'), { status: 429 });
      assert.ok(replies.length, 'Unexpected Gemini request');
      return structuredClone(replies.shift());
    },
    pickMissionFromGeminiPayload: r => r.mission,
    normalizeString: (s, fallback) => typeof s === 'string' ? s.trim() : fallback,
    getObjectiveRoomContract: () => ({ question_plans: [{}, { answer_target: canonical ? 'Arid desert' : 'Desert' }] }),
    updatePreviewGenerationProgress: () => {},
    buildRoomBundlePrompt: () => 'Generate room',
    buildRoomBundleResponseSchema: () => ({}),
    getRequiredBriefingEvidenceCount: () => 4,
    questionInteractionIssues,
    normalizeRoomBundleTransport: r => r,
    normalizeGeneratedRoomBundle: r => {
      if (mechanic) {
        const issues = planContext.generatedQuestionPlanIssues(r.mission.preguntas[1], mechanicPlan, 'texto');
        if (issues.length) throw Object.assign(new Error(issues.join(' · ')), {questionIndexes:[1]});
      }
      if (canonical) {
        const q = { ...r.mission.preguntas[1], respuesta_correcta: 'Arid desert' };
        const issues = questionInteractionIssues(q);
        if (issues.length) throw Object.assign(new Error(issues.join(' · ')), { questionIndexes: [1] });
      }
      return r.mission;
    },
    findRepeatedQuestionPlans: () => [],
    isGeminiQuotaExhausted: e => e.status === 429,
    isGeminiUpstreamTimeout: () => false
  });
  vm.runInContext(implementation, context);
  return { calls, run: () => context.requestGeneratedRoomBundle({ preguntasPorSala: 2 }, 3, { roomInteractionPlan: ['multimedia', 'multimedia'] }) };
}
const diagnostic = { cause: 'Invalid options', corrections: [{ questionIndex: 1, instruction: 'Use four distinct options with literal answer' }] };
const fixed = room(valid);
fixed.mission.titulo = 'Must not replace room';
fixed.mission.preguntas[0] = { ...good, titulo: 'Must not replace good question' };
let h = harness([room(invalid), diagnostic, fixed]);
const result = await h.run();
assert.equal(h.calls.length, 3);
assert.match(h.calls[1], /Analiza el fallo/);
assert.match(h.calls[2], /Aplica el diagnóstico/);
assert.equal(result.titulo, 'Keep this room');
assert.equal(result.preguntas[0].titulo, good.titulo);
assert.equal(result.preguntas[1].opciones.length, 4);

h = harness([room(valid)]);
await h.run();
assert.equal(h.calls.length, 1, 'Valid rooms require no diagnosis');

const canonicalFixed = { ...valid, opciones: ['Arid desert', 'Forest', 'Tundra', 'Grassland'], respuesta_correcta: 'Arid desert' };
h = harness([room(valid), diagnostic, room(canonicalFixed)], { canonical: true });
await h.run();
assert.match(h.calls[1], /Arid desert/, 'Diagnosis receives approved answer target');

h = harness([room(invalid), diagnostic, room(invalid), diagnostic, room(invalid)]);
await assert.rejects(h.run(), error => {
  assert.equal(error.generatedMission.preguntas[1].opciones.length, 2);
  return /Multimedia/.test(error.message);
});
assert.equal(h.calls.length, 5, 'At most two diagnosis/correction rounds');

h = harness([], { transport: true });
await assert.rejects(h.run(), /quota/);
assert.equal(h.calls.length, 1, 'Transport failures are handled by requestQualityJson, not content diagnosis');
console.log('PASS: diagnosis before correction, scoped preservation, canonical mismatch, bounded retries and quota separation.');

const planContext = vm.createContext({
 normalizeString: (s, fallback) => String(s || fallback),
 normalizeObjectiveFixedText: s => String(s || '').toLowerCase().trim()
});
vm.runInContext(source.slice(source.indexOf('function generatedQuestionPlanIssues('), source.indexOf('\nfunction materializeGeneratedQuestionTemplate(')), planContext);
const mechanicPlan = {mechanic_contract:{kind:'anagram',solution:'ORION',scrambled:'N-O-R-I-O'}};
const puzzle = {...valid,titulo:'Constellation',reto:'Identify the constellation using the briefing.',pista:'Review the clues.',retroalimentacion_correcta:'Correct.',retroalimentacion_incorrecta:'Try again.',respuesta_correcta:'ORION',opciones:['ORION','LYRA','DRACO','LEO']};
const missing = planContext.generatedQuestionPlanIssues(puzzle,mechanicPlan,'texto');
assert.match(missing.join(' '),/N-O-R-I-O/);
assert.equal(planContext.generatedQuestionPlanIssues({...puzzle,pista:'N-O-R-I-O'},mechanicPlan,'texto').length,1);
const repairedPuzzle = {...puzzle,reto:puzzle.reto+' Letters: N-O-R-I-O.'};
assert.equal(planContext.generatedQuestionPlanIssues(repairedPuzzle,mechanicPlan,'texto').length,0);
assert.equal(planContext.generatedQuestionPlanIssues({...puzzle,reto:'Decode P S J P O.'},{mechanic_contract:{kind:'cipher',solution:'ORION',ciphertext:'PSJPO'}},'texto').length,0);
h = harness([room(puzzle),{cause:'Incomplete riddle',corrections:[{questionIndex:1,instruction:'Review the wording'}]},room(repairedPuzzle)],{mechanic:true});
const repairedRoom = await h.run();
assert.match(h.calls[2],/VALIDACIÓN LOCAL OBLIGATORIA:.*N-O-R-I-O/,'Exact clue survives an incomplete Gemini diagnosis');
assert.equal(repairedRoom.preguntas[0].titulo,good.titulo);
assert.equal(repairedRoom.preguntas[1].respuesta_correcta,'ORION');
assert.match(source,/required_visible_clue/);
console.log('PASS: literal clue required in reto, hint-only rejection, cipher formatting, scoped repair despite incomplete diagnosis.');
