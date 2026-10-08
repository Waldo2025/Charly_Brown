const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const { chromium } = require('../functions/node_modules/playwright');
const { renderVideo } = require('../functions/src/charly-resources/contracts');
const table = renderVideo([{ startSeconds: 0, endSeconds: 8, script: 'Observa las plantas del jardín.', sceneDescription: 'Patio escolar con plantas.', inSceneText: 'Mi jardín', transition: 'Corte', visual: 'Plano general del jardín.' }]);
const paths = new Set(['/public/charly-brown/resource-review-modal.js', '/public/charly-brown/video-script-copy.js', '/public/charly-brown/production-client.js', '/public/podcaster/podcaster-video-table-mapping.js', '/public/charly-brown/charly-brown.css']);
const server = http.createServer((req, res) => {
  if (req.url === '/public/js/api-client.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end('export const buildGeminiApiUrl = value => value;'); }
  if (paths.has(req.url)) { res.setHeader('Content-Type', req.url.endsWith('.css') ? 'text/css' : 'text/javascript'); return res.end(fs.readFileSync(`.${req.url}`)); }
  if (req.url !== '/') { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html><html lang="es"><meta charset="UTF-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/public/charly-brown/charly-brown.css"><body class="cb-unit-body"><main><section id="progress"></section><article class="cb-approved-card"><h2>Guion de video</h2><div class="cb-approved-html">${table}</div></article></main><script type="module">
    import { openResourceReview } from '/public/charly-brown/resource-review-modal.js';
    window.openReview = openResourceReview;
    import { installScriptCopyButtons } from '/public/charly-brown/video-script-copy.js';
    import { renderProductionProgress } from '/public/charly-brown/production-client.js';
    window.copyDenied = true;
    Object.defineProperty(navigator, 'clipboard', { value: { write: async items => { if(window.copyDenied) throw Error('Denied'); window.copied = await items[0].getType('text/plain').then(blob => blob.text()); } } });
    installScriptCopyButtons(document);
    renderProductionProgress(document.querySelector('#progress'), {status:'needs_attention', tasks:[{stage:'activity',status:'completed'},{stage:'annex',status:'completed'},{stage:'cutout',status:'failed',error:'Recurso pendiente de reintento.'}]}, action => window.lastAction=action);
    window.ready = true;
  </script></html>`);
});
(async () => {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const browser = await chromium.launch({ headless: true, ...(process.env.CHARLY_BROWSER_CHANNEL ? { channel: process.env.CHARLY_BROWSER_CHANNEL } : {}) }).catch(() => chromium.launch({ headless: true, channel: 'chrome' }));
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 720 } });
    await page.route('https://www.gstatic.com/**', route => route.fulfill({ contentType: 'text/javascript', body: 'export const getAuth=()=>({currentUser:null});' }));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => window.ready);
    const copy = page.locator('[data-copy-video-script]'); await copy.click();
    assert.equal(await copy.textContent(), 'No se pudo copiar');
    await page.evaluate(() => { window.copyDenied = false; }); await copy.click();
    await page.waitForFunction(() => window.copied);
    assert.match(await page.evaluate(() => window.copied), /Escena\tTiempo\tGuion/);
    assert.equal(await copy.textContent(), 'Tabla copiada para Snoopy');
    await page.getByRole('button', { name: 'Reintentar pendientes' }).click();
    assert.equal(await page.evaluate(() => window.lastAction), 'resume');
    await page.getByRole('button', { name: 'Completar con los cambios actuales' }).click();
    assert.equal(await page.evaluate(() => window.lastAction), 'restart');
    fs.mkdirSync('test-artifacts/charly-specialists', { recursive: true });
    await page.screenshot({ path: 'test-artifacts/charly-specialists/editor-components.png', fullPage: true });
    await page.setViewportSize({ width: 360, height: 740 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.evaluate(() => window.openReview({ title: 'Ficha de refuerzo', html: '<h3>Ordena la historia</h3><p>Escribe qué ocurrió primero.</p>', onApprove: async () => { throw Error('No se guardó'); }, onRegenerate: async () => { window.regenerated = true; } }));
    await page.getByRole('button', { name: 'Aprobar y pasar al panel' }).click();
    assert.equal(await page.getByRole('dialog').isVisible(), true);
    assert.match(await page.getByRole('status').last().textContent(), /No se guardó/);
    await page.getByRole('button', { name: 'Regenerar', exact: true }).click();
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.equal(await page.evaluate(() => window.regenerated), true);
    await page.evaluate(() => window.openReview({ title: 'Guion de video', html: document.querySelector('table').outerHTML, onApprove: async () => { window.approved = true; } }));
    assert.equal(await page.getByRole('dialog').getByRole('button', { name: 'Copiar tabla del guion' }).count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByRole('button', { name: 'Aprobar y pasar al panel' }).click();
    assert.equal(await page.evaluate(() => window.approved), true);
    assert.equal(await page.getByRole('dialog').count(), 0);
    await page.evaluate(() => window.openReview({ title: 'Anexo aprobado', html: '<img alt="Ilustración" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=">', approved: true, onSave: async html => { window.savedImage = html; }, onEdit: () => { window.editing = true; } }));
    assert.equal(await page.getByRole('button', { name: 'Editar imagen: reemplazar' }).count(), 1);
    await page.getByRole('button', { name: 'Girar imagen' }).click();
    assert.match(await page.evaluate(() => window.savedImage), /data:image\/jpeg;base64/);
    await page.getByRole('button', { name: 'Editar contenido' }).click();
    assert.equal(await page.evaluate(() => window.editing), true);
    console.log('PASS: modal approval error retained, approval success closes, regenerate, approved editing, script copy, mobile containment.');
    console.log('PASS: copy success/failure, real TSV payload, retry action, mobile table containment.');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
