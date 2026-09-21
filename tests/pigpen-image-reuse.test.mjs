import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../public/js/PigPenCreator.js', import.meta.url), 'utf8');
function extract(name) {
  const start = source.search(new RegExp(`^function ${name}\\(`, 'm'));
  assert.ok(start >= 0, `${name} must exist`);
  const tail = source.slice(start);
  const end = tail.slice(1).search(/\n(?:async )?function /);
  return end < 0 ? tail : tail.slice(0, end + 1);
}

test('reutiliza solamente imágenes con identificadores estables coincidentes', () => {
  const context = vm.createContext({ normalizeString: (value, fallback = '') => String(value || fallback) });
  vm.runInContext(extract('preserveExistingProjectImages'), context);
  const next = {
    backgroundImage: '',
    misiones: [{ id: 'r1', imagen: '', preguntas: [{ id: 'q1', imagen: '' }, { id: 'q-new', imagen: '' }] }]
  };
  const previous = {
    backgroundImage: 'https://example.test/cover.webp',
    misiones: [{ id: 'r1', imagen: 'https://example.test/room.webp', preguntas: [
      { id: 'q1', imagen: 'https://example.test/q1.webp' },
      { id: 'q-old', imagen: 'https://example.test/old.webp' }
    ] }]
  };
  context.next = next;
  context.previous = previous;
  vm.runInContext('preserveExistingProjectImages(next, previous)', context);
  assert.equal(next.backgroundImage, previous.backgroundImage);
  assert.equal(next.misiones[0].imagen, previous.misiones[0].imagen);
  assert.equal(next.misiones[0].preguntas[0].imagen, previous.misiones[0].preguntas[0].imagen);
  assert.equal(next.misiones[0].preguntas[1].imagen, '');
});

test('la regeneración explícita puede forzar imágenes de sala', () => {
  assert.match(source, /forceMissionImages: options\.forceMissionImages === true/);
  assert.match(source, /regenerateMissionImageOnly[\s\S]*forceMissionImages: true/);
  assert.match(source, /selectQuestionImageIndexes[\s\S]*requiresImage && !normalizeString/);
});
