import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';

test('Experience modal presets: list badges, apply preset, save new preset, and delete preset', async () => {
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage({viewport: {width: 600, height: 900}});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await page.route('http://localhost:41111/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/') return route.fulfill({
        contentType: 'text/html',
        body: '<body class="cb-main-layout er-shell"><link rel="stylesheet" href="/vendor/bootstrap/bootstrap.min.css"><link rel="stylesheet" href="/PigPenCreator.css"><script src="/vendor/bootstrap/bootstrap.bundle.min.js"></script>'
      });
      return route.fulfill({
        contentType: path.endsWith('.css') ? 'text/css' : 'text/javascript',
        body: await readFile(new URL('../public' + path, import.meta.url), 'utf8')
      });
    });

    await page.goto('http://localhost:41111');

    await page.evaluate(async () => {
      const {mountExperienceModal} = await import('/js/pigpen-experience-modal.mjs');
      const {createPresetStore} = await import('/js/pigpen-experience-presets.mjs');
      const records=new Map();let initialized=false;
      window.presetStore=createPresetStore({adapter:{initialize:async(uid,defaults)=>{if(!initialized){defaults.forEach(p=>records.set(p.id,{...p,revision:1,seeded:true}));initialized=true;}},load:async()=>[...records.values()],save:async(uid,p,revision)=>{const result={...p,revision:revision+1,seeded:false};records.set(p.id,result);return result;},remove:async(uid,id)=>{records.delete(id);}}});
      presetStore.setUser('teacher');await presetStore.load();
      window.config = {};
      window.savedConfig = null;
      window.savedStructure = null;
      window.modal = mountExperienceModal({
        presetStore,
        getConfig: () => window.config,
        onSave: (c, s) => { window.savedConfig = c; window.savedStructure = s; }
      });
      window.modal.open();
    });

    await page.locator('#erExperienceModal.show').waitFor();
    await page.waitForFunction(()=>!presetStore.state().busy);

    const badges = page.locator('.er-experience-presets-list .er-preset-badge');
    const initialBadgeCount = await badges.count();
    assert.ok(initialBadgeCount >= 4, 'Should have at least 4 default presets');

    const firstBadge = badges.first();
    assert.match(await firstBadge.innerText(), /Clásico/);
    assert.ok(await firstBadge.evaluate(el => el.classList.contains('is-active')));

    const logicBadge = page.locator('.er-preset-badge:has-text("Lógica y deducción")');
    await logicBadge.click();

    assert.equal(await page.locator('input[value="matriz_deduccion"]').isChecked(), true);
    assert.equal(await page.locator('input[value="simbolos"]').isChecked(), true);
    assert.equal(await page.locator('input[value="pista"]').isChecked(), true);
    assert.ok(await logicBadge.evaluate(el => el.classList.contains('is-active')));

    const nameInput = page.locator('[data-experience-preset-name]');
    await nameInput.fill('Mi Desafío');
    await page.locator('[data-experience-save-preset]').click();

    const customBadge = page.locator('.er-preset-badge:has-text("Mi Desafío")');
    await customBadge.waitFor();
    assert.ok(await customBadge.evaluate(el => el.classList.contains('is-active')));
    assert.equal(await badges.count(), initialBadgeCount + 1);

    const deleteBtn = customBadge.locator('[data-preset-delete]');
    await deleteBtn.click();

    await customBadge.waitFor({state:'hidden'});
    assert.equal(await customBadge.count(), 0);
    assert.equal(await badges.count(), initialBadgeCount);

    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
