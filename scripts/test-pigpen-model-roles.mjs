import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { chromium } from 'playwright';

const source = readFileSync('public/js/PigPenCreator.js', 'utf8');
function extract(name) {
  const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
  assert.ok(start >= 0, `${name} must exist`);
  const tail = source.slice(start);
  const end = tail.slice(1).search(/\n(?:async )?function /);
  return end < 0 ? tail : tail.slice(0, end + 1);
}

const requests = [];
const context = vm.createContext({
  TEXT_MODEL_DEFAULT: 'gemini-2.5-flash',
  normalizeString: (value, fallback = '') => String(value || fallback),
  buildDeterministicQuestionPlanTemplate: () => [],
  setStatus: () => {},
  buildObjectiveFoundationPrompt: () => 'foundation',
  buildObjectiveFoundationResponseSchema: () => ({}),
  unwrapObjectiveBriefPayload: value => value,
  resolvePromptLanguageDirective: () => ({ directive: 'Spanish' }),
  requestQualityJson: async (_prompt, data) => { requests.push(data.modelo); throw new Error('request captured'); }
});
vm.runInContext(extract('compileObjectiveBlueprintFromTemplate') + extract('requestThematicObjectiveUnlockWord'), context);
await assert.rejects(context.compileObjectiveBlueprintFromTemplate({
  contentModel: 'gemini-content',
  modelo: 'gemini-legacy-room',
  modeloObjetivo: 'gemini-legacy-objective'
}), /request captured/);
assert.deepEqual(requests, ['gemini-content']);

const html = readFileSync('public/PigPenCreator.html', 'utf8');
const modal = html.slice(html.indexOf('    <div class="modal fade" id="modelConfigModal"'), html.indexOf('    <div class="modal fade" id="previewThemeModal"'));
assert.doesNotMatch(modal, /id="modeloSelect"/);
assert.match(modal, /Contenido, objetivo y acertijos/);
assert.match(modal, /id="objetivoModeloSelect"[\s\S]*id="imagenModeloSelect"/);
assert.match(source, /image\|imagen\|omni\|interactions\?/);
assert.match(source, /methods\.length[\s\S]*FALLBACK_TEXT_MODELS\.includes\(id\)/);
assert.match(source, /function sanitizeRestoredModelSelections[\s\S]*pendingContent[\s\S]*TEXT_MODEL_DEFAULT/);
assert.match(source, /restoreFormState\(\);\s*sanitizeRestoredModelSelections\(\);/);

const compatibility = vm.createContext({
  FALLBACK_TEXT_MODELS: ['gemini-2.5-flash'],
  normalizeGeminiCatalogModelId: value => String(value || '').replace(/^models\//, ''),
  geminiCatalogMethods: model => (model.supportedGenerationMethods || []).map(method => method.toLowerCase())
});
vm.runInContext(extract('isGeminiTextContentModel') + extract('supportsGeminiContentGeneration'), compatibility);
assert.equal(compatibility.isGeminiTextContentModel('gemini-omni-1.1-flash-preview'), false);
assert.equal(compatibility.supportsGeminiContentGeneration({
  name: 'gemini-omni-1.1-flash-preview',
  supportedGenerationMethods: ['generateContent']
}), false);
assert.equal(compatibility.supportsGeminiContentGeneration({
  name: 'gemini-2.5-flash',
  supportedGenerationMethods: ['generateContent']
}), true);

const css = ['vendor/bootstrap/bootstrap.min.css', 'PigPenCreator.css'].map(file => readFileSync(`public/${file}`, 'utf8')).join('\n');
const browser = await chromium.launch();
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 850 } });
    await page.setContent(`<style>${css}</style>${modal}`);
    await page.evaluate(() => {
      const element = document.querySelector('#modelConfigModal');
      element.classList.add('show');
      element.style.display = 'block';
    });
    const cards = page.locator('.er-model-role-card');
    assert.equal(await cards.count(), 2);
    const first = await cards.nth(0).boundingBox();
    const second = await cards.nth(1).boundingBox();
    assert.ok(width > 440 ? Math.abs(first.y - second.y) < 1 : second.y > first.y);
    const bounds = await page.locator('.modal-content').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
    await page.close();
  }
} finally {
  await browser.close();
}

console.log('Model roles: one compatible content model, one image model and responsive layout passed.');
