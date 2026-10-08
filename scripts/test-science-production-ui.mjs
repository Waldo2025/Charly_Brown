import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

test('review blocks unsaved approval, starts approved revision, retries and applies completion', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('http://science.test/**', async (route) => {
      const name = new URL(route.request().url()).pathname;
      if (name.endsWith('.mjs')) return route.fulfill({ contentType: 'text/javascript', body: await readFile(new URL(`../public/js/${name.slice(1)}`, import.meta.url), 'utf8') });
      const html = await readFile(new URL('../public/scienceActivities.html', import.meta.url), 'utf8');
      return route.fulfill({ contentType: 'text/html', body: '<meta charset="utf-8">' + html.match(/<dialog id="scienceProductionDialog"[\s\S]*?<\/dialog>/)[0] + html.match(/<section id="scienceProductionProgress"[\s\S]*?<\/section>/)[0] });
    });
    await page.goto('http://science.test/');
    await page.evaluate(async () => {
      const { mountScienceProductionUI } = await import('/science-production-ui.mjs');
      window.calls = []; window.applied = 0;
      window.run = { id: 'r1', revision: 1, status: 'awaiting_approval', plan: { title: 'MRUA', objective: 'Aceleración', instructions: 'Crear dos niveles', levels: [], visuals: [] }, tasks: [] };
      const result = () => ({ run: structuredClone(window.run) });
      const client = {
        plan: async () => result(), list: async () => ({ runs: [window.run] }), get: async () => result(),
        approve: async (id, revision) => { window.calls.push(['approve', revision]); window.run.status = 'approved'; return result(); },
        start: async (id, revision) => { window.calls.push(['start', revision]); window.run.status = 'running'; return result(); },
        revise: async (id, revision, plan) => { window.run.plan = plan; window.run.revision++; return result(); },
        retry: async (id, taskId) => { window.calls.push(['retry', taskId]); return result(); }
      };
      window.controller = mountScienceProductionUI({ client, onResult: async () => { window.applied++; return true; } });
      await window.controller.create({}, {});
    });
    await page.addStyleTag({ content: await readFile(new URL('../public/scienceActivities.css', import.meta.url), 'utf8') });
    if (process.env.SCIENCE_SCREENSHOT) {
      await page.screenshot({ path: process.env.SCIENCE_SCREENSHOT, fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: process.env.SCIENCE_SCREENSHOT.replace('.png', '-mobile.png'), fullPage: true });
      assert.equal(await page.evaluate(() => document.querySelector('dialog').scrollWidth <= document.querySelector('dialog').clientWidth), true);
      await page.setViewportSize({ width: 1280, height: 720 });
    }
    await page.locator('[data-production="title"]').fill('Nueva aceleración');
    await page.locator('[data-production="approve"]').click();
    await page.waitForFunction(() => document.querySelector('[data-production="error"]').textContent.includes('Guarda'));
    assert.deepEqual(await page.evaluate(() => window.calls), []);
    await page.locator('[data-production="revise"]').click();
    await page.waitForFunction(() => document.querySelector('[data-production="status"]').textContent.includes('Revisión 2'));
    await page.locator('[data-production="approve"]').click();
    await page.waitForFunction(() => window.calls.length === 2);
    assert.deepEqual(await page.evaluate(() => window.calls), [['approve', 2], ['start', 2]]);
    assert.equal(await page.locator('#scienceProductionDialog').evaluate(dialog => dialog.open), false);
    assert.equal(await page.locator('#scienceProductionProgress').isVisible(), true);
    await page.locator('[data-progress="plan"]').click();
    assert.equal(await page.locator('#scienceProductionDialog').evaluate(dialog => dialog.open), true);
    await page.evaluate(() => { window.run.status = 'needs_attention'; window.run.tasks = [{ id: 'image', agent: 'Imágenes', status: 'failed', error: '<img src=x onerror=alert(1)>' }]; });
    await page.evaluate(() => { window.run.previewActivity = { title: 'Borrador parcial', mission: 'Observar aceleración', assessments: [{ prompt: '¿Qué cambia?', options: ['Velocidad', 'Masa'] }] }; });
    await page.locator('[data-production="refresh"]').click();
    await page.getByRole('button', { name: 'Vista previa parcial' }).click();
    assert.match(await page.locator('[data-production="partial"]').textContent(), /Borrador parcial/);
    assert.equal(await page.evaluate(() => window.applied), 0);
    await page.getByRole('button', { name: 'Reintentar' }).click();
    assert.deepEqual((await page.evaluate(() => window.calls)).at(-1), ['retry', 'image']);
    assert.equal(await page.locator('[data-production="tasks"] img').count(), 0);
    await page.evaluate(() => { window.run.status = 'completed'; window.run.result = { generation: { complete: true } }; });
    await page.locator('[data-production="refresh"]').click();
    await page.waitForFunction(() => window.applied === 1);
    await page.locator('[data-production="refresh"]').click();
    assert.equal(await page.evaluate(() => window.applied), 1);
  } finally { await browser.close(); }
});
