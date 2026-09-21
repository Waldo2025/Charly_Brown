import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const html = readFileSync('public/PigPenCreator.html', 'utf8');
const css = [
  'vendor/bootstrap/bootstrap.min.css',
  'vendor/fontawesome/all.min.css',
  'PigPenCreator.css'
].map(file => readFileSync(`public/${file}`, 'utf8')).join('\n');
const start = html.indexOf('<form id="escapeRoomForm"');
const end = html.indexOf('</form>', start) + '</form>'.length;
const form = html.slice(start, end);

assert.ok(start >= 0 && end > start);
assert.equal((form.match(/class="er-brief-section"/g) || []).length, 4);
for (const heading of ['Objetivo', 'Datos académicos', 'Estructura', 'Experiencia']) {
  assert.match(form, new RegExp(`>${heading}<`));
}
assert.doesNotMatch(form, /objectivePlanStatus|erDurationHelp|dificultadHelp/);

const browser = await chromium.launch();
try {
  for (const width of [560, 320]) {
    const page = await browser.newPage({ viewport: { width: width + 24, height: 900 } });
    await page.setContent(`<style>${css}</style><main class="er-studio-shell"><aside class="er-brief-panel" style="width:${width}px;container-type:inline-size">${form}</aside></main>`);
    const sections = page.locator('.er-brief-section');
    assert.equal(await sections.count(), 4);
    const gridColumns = await page.locator('.er-brief-section-grid').first().evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
    assert.equal(gridColumns, width <= 399 ? 1 : 2);
    const bounds = await page.locator('#escapeRoomForm').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.width <= width + 1);
    await page.screenshot({ path: `/tmp/pigpen-brief-form-${width}.png`, fullPage: true });
    await page.close();
  }
} finally {
  await browser.close();
}

console.log('Brief form: four compact responsive sections passed.');
