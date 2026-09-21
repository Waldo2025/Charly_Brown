import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { buildMoodleAnswerKeyHtml } from '../public/js/escape-room-answer-export.mjs';
const source = fs.readFileSync('public/js/PigPenCreator.js', 'utf8');
const helper = source.slice(source.indexOf('async function copyExportedTopicAnswers('), source.indexOf('async function buildAndDownloadExportPackage('));
let copied = '';
const context = vm.createContext({ console: { warn() {} }, buildMoodleAnswerKeyHtml,
  writeHtmlToClipboard: async html => { copied = html; } });
vm.runInContext(helper, context);
const project = { titulo: 'Exported chapter', idioma: 'en', misiones: [{ preguntas: [{ respuesta_correcta: 'SOL' }] }] };
assert.equal((await context.copyExportedTopicAnswers(project, { academicNumber: 4 })).warning, false);
assert.match(copied, /Chapter 4/);
assert.match(copied, /Exported chapter/);
context.writeHtmlToClipboard = async () => { throw new Error('NotAllowedError'); };
assert.equal((await context.copyExportedTopicAnswers(project)).warning, true);
assert.equal((await context.copyExportedTopicAnswers({ misiones: [] })).warning, true);
assert.match(source, /anchor\.click\(\);[\s\S]*await copyExportedTopicAnswers\(originalProject, exportedTopic\)[\s\S]*editorialFileName = await downloadEditorialWorkbook/);
console.log('PASS ZIP answer copy: exported snapshot only, localized chapter, clipboard failure does not abort XLSX');
