import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync('public/js/PigPenCreator.js', 'utf8');
function extract(name) {
  const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
  const rest = source.slice(start);
  return rest.slice(0, rest.slice(1).search(/^(?:async )?function /m) + 1);
}
let sent;
const context = vm.createContext({ console,
  normalizeString: (value, fallback = '') => String(value || '').trim() || fallback,
  buildVisualDirection: () => ({ temaResumen: 'Biomas', line: 'Ilustración' }),
  buildCoverImagePromptSeed: () => 'Una expedición', updatePreviewGenerationProgress() {},
  generateValidatedImage: async prompt => { sent = prompt; return 'image'; }
});
vm.runInContext(['buildCoverVisualPrompt', 'generateCoverImage'].map(extract).join('\n'), context);
await context.generateCoverImage({ titulo: 'Biomas', backgroundImageAlt: 'EXPEDICIÓN «BIOMAS»', backgroundImagePrompt: 'Un bosque' }, {});
assert.match(sent, /TEXTO VISIBLE OBLIGATORIO/);
assert.ok(sent.includes('EXPEDICIÓN «BIOMAS»'));
assert.ok(sent.includes('Un bosque'));
assert.doesNotMatch(sent, /Sin texto legible/);
await context.generateCoverImage({ backgroundImageAlt: '   ' }, {});
assert.match(sent, /Sin texto legible/);
assert.doesNotMatch(sent, /TEXTO VISIBLE OBLIGATORIO/);
console.log('PASS cover text reaches image request literally; empty field retains no-text cover');
