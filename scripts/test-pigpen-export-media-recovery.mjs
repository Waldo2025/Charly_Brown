import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { questionInteractionIssues } from '../public/js/escape-room-question-policy.mjs';

const source = readFileSync(new URL('../public/js/PigPenCreator.js', import.meta.url), 'utf8');
const select = source.slice(source.indexOf('function selectQuestionImageIndexes('), source.indexOf('async function generateMissionImages('));
const recovery = source.slice(source.indexOf('async function ensureExportQuestionMedia('), source.indexOf('async function buildAndDownloadExportPackage('));
const question = (extra = {}) => ({ interaction_contract_version: 1, tipo_interaccion: 'multimedia', opciones: ['A', 'B', 'C', 'D'], respuesta_correcta: 'A', media: { tipo: 'imagen', url: '' }, ...extra });
const calls = [];
let active = 0;
let saves = 0;
const context = vm.createContext({
  state: { project: { misiones: [{ preguntas: [question(), question(), question({ media: { tipo: 'imagen', url: 'existing.png' } }), question({ interaction_contract_version: 0 })] }] } },
  questionInteractionIssues,
  normalizeString: value => String(value || '').trim(),
  getFormData: () => ({}),
  updateZipExportProgress: () => {},
  renderMissionEditor: () => {},
  renderOutputsNow: () => {},
  scheduleSessionSave: () => saves++,
  generateMissionImages: async (project, _context, _progress, options) => {
    assert.equal(active++, 0, 'Media recovery must be sequential');
    calls.push(options);
    await Promise.resolve();
    project.misiones[options.questionScope.missionIndex].preguntas[options.questionScope.questionIndex].media.url = 'generated.png';
    active--;
    return { generated: 1 };
  }
});
vm.runInContext(select + recovery, context);
assert.deepEqual([...context.selectQuestionImageIndexes(context.state.project.misiones[0])], [0, 1]);
await context.ensureExportQuestionMedia();
assert.equal(calls.length, 2);
assert.equal(saves, 2);
assert.ok(calls.every(call => call.includeMissionImage === false && call.forceQuestionImages));
await context.ensureExportQuestionMedia();
assert.equal(calls.length, 2, 'Existing assets and legacy questions are untouched');
context.state.project.misiones[0].preguntas = [question({ media: { tipo: 'audio', url: '' } })];
await assert.rejects(context.ensureExportQuestionMedia(), /Sala 1 · Pregunta 1: añade el recurso de audio/);
assert.equal(calls.length, 2);
context.state.project.misiones[0].preguntas = [question()];
context.generateMissionImages = async () => ({ generated: 0, error: new Error('quota') });
await assert.rejects(context.ensureExportQuestionMedia(), /Sala 1 · Pregunta 1:.*quota/);
console.log('Export media recovery: selection, sequential repair, persistence, legacy, audio and failure checks passed.');
