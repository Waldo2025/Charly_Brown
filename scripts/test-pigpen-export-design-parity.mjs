import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { chromium } from 'playwright';
import { buildEscapeRoomPackage, buildPreviewDocument } from '../public/js/escape-room-package-builder.mjs';

const image = `data:image/png;base64,${readFileSync('public/pigpen.png').toString('base64')}`;
const project = {
  titulo: 'Export design verification', idioma: 'en-US', clave_final: 'SOL',
  introduccion: 'Explore the biomes.', instrucciones: 'Complete the challenges.',
  misiones: [{ id: 'room', titulo: 'Climate expedition', release: 'SALA 01',
    historia: 'Inspect the records.', contexto: 'Deserts have low precipitation.',
    reto: 'Classify the observations.', datos_clave: ['Low precipitation', 'Dense canopy'],
    imagen: image, bloqueada_inicial: false,
    preguntas: [
      { id: 'choice', titulo: 'Select the biome', reto: 'Which biome has low precipitation?', tipo_interaccion: 'opcion_multiple', opciones: ['Desert', 'Forest', 'Grassland', 'Tundra'], respuesta_correcta: 'Desert' },
      { id: 'match', titulo: 'Match the records', reto: 'Match each observation.', tipo_interaccion: 'relacion_columnas', parejas: [{ izquierda: 'Dry', derecha: 'Desert' }, { izquierda: 'Canopy', derecha: 'Forest' }] },
      { id: 'drag', titulo: 'Drag each biome', reto: 'Pair the records.', tipo_interaccion: 'drag_drop', parejas: [{ izquierda: 'Dry', derecha: 'Desert' }, { izquierda: 'Canopy', derecha: 'Forest' }] }
    ] }]
};
const browser = await chromium.launch();
try {
  for (const mode of ['salas', 'menu_secciones']) {
    const data = { ...project, modo_presentacion: mode };
    const pkg = buildEscapeRoomPackage(data);
    const preview = buildPreviewDocument(data);
    const previewCss = preview.match(/<style>([\s\S]*?)<\/style>/)[1];
    const expectedExportCss = previewCss.replace(/url\("data:image\/svg\+xml,([^\"]+)"\)/g, (_, encoded) => {
      const entry = Object.entries(pkg.files).find(([path, content]) => path.endsWith('.svg') && content === decodeURIComponent(encoded));
      assert.ok(entry, 'Every preview icon must have an identical packaged SVG');
      return `url("${entry[0].replace(/^assets\//, '')}")`;
    });
    assert.equal(expectedExportCss, pkg.files['assets/game.css'], 'Only icon paths may differ from preview');
    for (const [path, content] of Object.entries(pkg.files)) {
      if (/\.(css|js|html|json)$/.test(path)) assert.doesNotMatch(content, /data:image\/|blob:/i, `${path} contains unpackaged images`);
    }
    const zip = new JSZip();
    for (const [path, content] of Object.entries(pkg.files)) {
      if (typeof content === 'string' && content.startsWith('data:')) zip.file(path, content.split(',')[1], { base64: true });
      else zip.file(path, content);
    }
    zip.file('logo.png', readFileSync('public/pigpen.png'));
    const archive = await JSZip.loadAsync(await zip.generateAsync({ type: 'nodebuffer' }));
    for (const width of [1280, 820, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('http://export.test/**', async route => {
        const path = new URL(route.request().url()).pathname.slice(1) || 'index.html';
        const file = archive.file(path);
        if (!file) { errors.push(`Missing ZIP resource: ${path}`); return route.fulfill({ status: 404, body: '' }); }
        const type = path.endsWith('.svg') ? 'image/svg+xml' : path.endsWith('.css') ? 'text/css' : path.endsWith('.js') ? 'text/javascript' : path.endsWith('.png') ? 'image/png' : path.endsWith('.html') ? 'text/html' : 'application/octet-stream';
        await route.fulfill({ contentType: type, body: await file.async('nodebuffer') });
      });
      await page.goto('http://export.test/index.html');
      await page.locator('[data-game-start]').click();
      if (mode === 'menu_secciones') await page.locator('[data-menu-mission="room"]').click();
      const heading = page.locator('.investigation-board-title').first();
      await heading.waitFor({ state: 'visible' });
      const title = await heading.boundingBox();
      const label = await page.locator('.investigation-board-head > .label').first().boundingBox();
      assert.ok(title.x >= label.x + label.width);
      assert.equal(await page.locator('.investigation-evidence-heading').first().evaluate(el => getComputedStyle(el).marginBottom), '12px');
      await page.locator('[data-briefing-ack="room"]').click();
      const layout = await page.locator('.mission-layout').boundingBox();
      const status = await page.locator('#roomStatusBox').boundingBox();
      assert.ok(status.y >= layout.y + layout.height);
      assert.ok(Math.abs(status.x - layout.x) < 1);
      const colors = await page.locator('[data-question-choice]').evaluateAll(els => els.map(el => getComputedStyle(el).color));
      assert.equal(new Set(colors).size, 4);
      const hoverColors = [];
      for (const choice of await page.locator('[data-question-choice]').all()) {
        await choice.hover();
        await page.waitForTimeout(180);
        hoverColors.push(await choice.evaluate(el => getComputedStyle(el).backgroundColor));
      }
      assert.equal(new Set(hoverColors).size, 4);
      const matchingColors = await page.locator('.match-row-grid').first().evaluate(el => [...el.children].map(node => getComputedStyle(node).backgroundColor));
      assert.notEqual(matchingColors[0], matchingColors[1]);
      assert.ok(await page.locator('.drag-match-help').evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 18));
      assert.ok(await page.locator('#roomStatusBox').evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 18));
      const choiceSize = await page.locator('[data-question-choice]').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
      assert.ok(Math.abs(choiceSize - (Math.min(22, Math.max(18, width * .016)) - 4 / 3)) < .01);
      assert.equal(await page.locator('.question-head .label').first().evaluate(el => getComputedStyle(el).textAlign), 'right');
      assert.equal(await page.locator('.question-title').first().evaluate(el => getComputedStyle(el).marginBottom), '12px');
      const failures = await page.evaluate(() => [...document.querySelectorAll('.status-box')].filter(el => {
        const s = getComputedStyle(el);
        return s.backgroundColor !== 'rgba(0, 0, 0, 0)' || s.borderTopWidth !== '0px';
      }).length);
      assert.equal(failures, 0);
      assert.equal(await page.locator('body').evaluate(el => [...el.querySelectorAll('*')].filter(node => Number(getComputedStyle(node).fontWeight) > 400).length), 0);
      assert.equal(await page.locator('.game-header .game-logo-brand').count(), 1);
      assert.ok(await page.locator('.game-header').evaluate(header => {
        const bar = header.getBoundingClientRect();
        return [...header.querySelectorAll('button')].every(button => {
          const box = button.getBoundingClientRect();
          if (!box.width || !box.height || getComputedStyle(button).visibility === 'hidden') return true;
          return box.top >= bar.top + 8 && box.bottom <= bar.bottom - 8;
        });
      }), 'Toolbar buttons need vertical space inside the header');
      if (mode === 'salas') {
        const prev = await page.locator('[data-gallery-prev]').boundingBox();
        const logo = await page.locator('.game-logo-brand').boundingBox();
        assert.ok(logo.x >= prev.x + prev.width);
      }
      const feedback = page.locator('[data-question-status="room::choice"]');
      const infoIcon = await feedback.evaluate(el => getComputedStyle(el, '::before').maskImage);
      assert.notEqual(infoIcon, 'none');
      await page.locator('[data-question-choice]').nth(1).click();
      await page.locator('[data-question-key="room::choice"] [data-question-verify]').click();
      assert.ok(await feedback.evaluate(el => el.classList.contains('is-bad')));
      const errorIcon = await feedback.evaluate(el => getComputedStyle(el, '::before').maskImage);
      assert.notEqual(errorIcon, infoIcon);
      await page.locator('[data-question-choice]').first().click();
      await page.locator('[data-question-key="room::choice"] [data-question-verify]').click();
      const successIcon = await feedback.evaluate(el => getComputedStyle(el, '::before').maskImage);
      assert.notEqual(successIcon, infoIcon);
      assert.notEqual(successIcon, errorIcon);
      assert.equal(await feedback.getAttribute('role'), 'status');
      assert.equal(await page.locator('[data-question-key="room::choice"]').evaluate(el => el.classList.contains('is-complete')), true);
      assert.equal(await page.locator('.mission-panel').evaluateAll(els => els.filter(el => {
        const s = getComputedStyle(el);
        return s.borderLeftWidth !== s.borderRightWidth || /inset 5px/.test(s.boxShadow);
      }).length), 0);
      await page.waitForLoadState('networkidle');
      assert.equal(await page.locator('img').evaluateAll(images => images.filter(img => !img.complete || img.naturalWidth === 0).length), 0, 'All rendered ZIP images must decode');
      await page.screenshot({ path: `/tmp/pigpen-export-design-${mode}-${width}.png` });
      assert.deepEqual(errors, []);
      console.log(`ZIP browser OK: ${mode}, ${width}px`);
      await page.close();
    }
  }
} finally { await browser.close(); }
