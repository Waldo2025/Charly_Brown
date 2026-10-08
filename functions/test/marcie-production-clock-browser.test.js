const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
test('production modal shows a live clock below percent and preserves wall time after reopening', async () => {
  const editor = fs.readFileSync(path.join(root, 'public/MarcieBlogEditor/js/editor-app.js'), 'utf8');
  const markup = editor.match(/<div class="automation-agent-progress-meta">[^\n]+\n\s*<div class="automation-agent-elapsed">[^\n]+/)[0].replace('${currentProgress}', '8');
  const clock = fs.readFileSync(path.join(root, 'public/MarcieBlogEditor/js/services/marcie-production-clock.js'), 'utf8').replaceAll('export function', 'function');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.clock.install({ time: new Date('2026-09-24T12:00:00Z') });
    await page.setContent(`<main>${markup}</main>`);
    await page.addStyleTag({ content: fs.readFileSync(path.join(root, 'public/MarcieBlogEditor/css/MarcieBlogEditor.css'), 'utf8') });
    await page.addScriptTag({ content: clock });
    await page.evaluate(() => { window.automation = { status: 'running', startedAt: new Date().toISOString() }; window.stopClock = mountProductionClock(document, () => window.automation); });
    assert.equal(await page.locator('[role="timer"]').textContent(), '00:00:00');
    await page.clock.fastForward(65000);
    assert.equal(await page.locator('[role="timer"]').textContent(), '00:01:05');
    const percent = await page.locator('.automation-agent-progress-meta').boundingBox();
    const timer = await page.locator('.automation-agent-elapsed').boundingBox();
    assert.ok(timer.y >= percent.y + percent.height);
    await page.evaluate(() => { stopClock(); automation.status = 'retrying'; });
    await page.clock.fastForward(5000);
    await page.evaluate(() => { window.stopClock = mountProductionClock(document, () => automation); });
    assert.equal(await page.locator('[role="timer"]').textContent(), '00:01:10');
    await page.evaluate(() => { automation.status = 'completed'; automation.completedAt = new Date().toISOString(); });
    await page.clock.fastForward(60000);
    assert.equal(await page.locator('[role="timer"]').textContent(), '00:01:10');
  } finally { await browser.close(); }
});
