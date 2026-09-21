import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { buildPreviewDocument, buildEscapeRoomPackage } from '../public/js/escape-room-package-builder.mjs';
const project = { titulo: 'Floating control', clave_final: 'SOL', misiones: [{ id: 'room', titulo: 'Room', contexto: 'Read this', preguntas: [{ id: 'q', titulo: 'Question', reto: 'Write sol', tipo_interaccion: 'texto', subtipo_respuesta: 'palabra', respuesta_correcta: 'sol' }] }] };
assert.ok(!buildEscapeRoomPackage(project).files['index.html'].includes('data-editorial-autofill'), 'Editorial control must stay out of student ZIP');
const browser = await chromium.launch();
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 850 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent(buildPreviewDocument(project, { editorialReview: true }));
    const fab = page.locator('[data-editorial-autofill]');
    await fab.waitFor({ state: 'visible' });
    assert.equal(await fab.textContent(), '');
    const style = await fab.evaluate(el => { const s = getComputedStyle(el); return [s.width, s.height, s.borderRadius]; });
    assert.deepEqual(style, ['52px', '52px', '50%']);
    const initialIcon = await fab.innerHTML();
    const box = await fab.boundingBox();
    await page.mouse.move(box.x + 26, box.y + 26);
    await page.mouse.down();
    await page.mouse.move(90, 150, { steps: 12 });
    await page.mouse.up();
    assert.equal(await fab.getAttribute('data-editorial-action'), 'start', 'Dragging must not start the game');
    const moved = await fab.boundingBox();
    assert.ok(Math.abs(moved.x - 64) < 2 && Math.abs(moved.y - 124) < 2);
    await fab.click();
    assert.equal(await fab.getAttribute('data-editorial-action'), 'autofill');
    const fillIcon = await fab.innerHTML();
    assert.notEqual(fillIcon, initialIcon);
    await fab.click();
    assert.equal(await fab.getAttribute('data-editorial-action'), 'verify');
    assert.notEqual(await fab.innerHTML(), fillIcon);
    await fab.focus();
    await page.keyboard.press('Alt+ArrowRight');
    assert.ok(Math.abs((await fab.boundingBox()).x - moved.x - 20) < 2);
    assert.equal(await fab.getAttribute('data-editorial-action'), 'verify');
    await page.keyboard.press('Enter');
    assert.ok(await page.locator('.question-card.is-complete, .room-unlock-transition, #finalPasscodeTiles').count(), 'Keyboard activation must validate and advance');
    assert.equal(await fab.textContent(), '');
    await page.setViewportSize({ width: 320, height: 400 });
    const resized = await fab.boundingBox();
    assert.ok(resized.x >= 0 && resized.x + resized.width <= 320 && resized.y + resized.height <= 400);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `/tmp/pigpen-editorial-fab-${width}.png` });
    console.log('Editorial FAB OK:', width);
    await page.close();
  }
} finally { await browser.close(); }
