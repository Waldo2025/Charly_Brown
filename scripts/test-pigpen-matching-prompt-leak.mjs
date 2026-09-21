import assert from 'node:assert/strict';
import fs from 'node:fs';
import { questionInteractionIssues, DRAG_DROP_AUTHORING_TEMPLATE } from '../public/js/escape-room-question-policy.mjs';
assert.match(DRAG_DROP_AUTHORING_TEMPLATE, /application, case_data e instruction_outline/);
assert.match(DRAG_DROP_AUTHORING_TEMPLATE, /no solicites otra llamada|ni solicites otra llamada/);
const source = fs.readFileSync('public/js/PigPenCreator.js', 'utf8');
assert.match(source, /function buildUnifiedContentGenerationContract\([\s\S]*?QUESTION_BRIEF_GROUNDING/);
assert.match(source, /<OBJECTIVE>Rellena únicamente[\s\S]*?QUESTION_AUTHORING_TEMPLATES/);
const base = { tipo_interaccion: 'drag_drop', interaction_contract_version: 1,
  parejas: [{ izquierda: 'Bag Pen Slot', derecha: 'MARKER' }, { izquierda: 'Wall Base Rest', derecha: 'ROLLER' },
    { izquierda: 'Flat Folder', derecha: 'STENCIL' }, { izquierda: 'Front Pocket', derecha: 'STICKER' },
    { izquierda: 'Main Sleeve', derecha: 'POSTER' }, { izquierda: 'Side Loop', derecha: 'BRUSH' }] };
const check = reto => questionInteractionIssues({ ...base, reto }, { generated: true });
assert.ok(check('Organize the kit: place MARKER into the Bag Pen Slot, and ROLLER into the Wall Base Rest.').length);
assert.ok(check('Coloca MARKER en Bag Pen Slot.').length);
assert.equal(check('Which storage location suits each tool? Use the dimensions and handling requirements described on the inventory cards.').length, 0);
assert.equal(check('Tools: MARKER, ROLLER. Destinations: Bag Pen Slot, Wall Base Rest. Where should each tool go?').length, 0);
assert.equal(questionInteractionIssues({ ...base, reto: 'place MARKER into Bag Pen Slot' }).length, 0);
assert.ok(questionInteractionIssues({ ...base, pista: 'MARKER goes into Bag Pen Slot' }, { generated: true }).length);
assert.equal(questionInteractionIssues({ ...base, retroalimentacion_correcta: 'MARKER goes into Bag Pen Slot' }, { generated: true }).length, 0);
console.log('PASS matching leak: English/Spanish mappings rejected; context, separate inventories and legacy preserved');
