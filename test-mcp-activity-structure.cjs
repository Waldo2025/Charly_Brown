const { chromium } = require('playwright');
const path = require('path');

const ARTIFACT_DIR = '/Users/waldolopez/.gemini/antigravity/brain/47d134e5-030d-4776-b56e-9726cd692868';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const canonicalActivityHtml = `<div class="activity">
  <p><strong>Observa el esquema del ciclo hidrológico en el bosque mesófilo y explica en equipo el proceso de condensación de la niebla.</strong></p>
  <ol class="steps steps-numbered">
    <li>
      Identifica en la lectura qué plantas funcionan como captadoras naturales de humedad y regístralas en tu libreta.
      <div class="answer"><span style="color:magenta;">Respuesta: Los musgos, orquídeas y helechos gigantes que retienen las gotas de agua microscópicas.</span></div>
    </li>
    <li>
      Formula una hipótesis sobre lo que ocurriría con los manantiales de la comunidad si se reduce la cobertura vegetal en la sierra.
      <div class="answer"><span style="color:magenta;">Respuesta: La captación de agua disminuiría significativamente, provocando estiaje en los ríos y sequía en los pozos comunitarios.</span></div>
    </li>
  </ol>
</div>`;

  await page.route('**/api/charly-brown/chat', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        text: 'He diseñado la actividad de Ciencias Naturales aplicando estrictamente el contrato editorial: bloque `<div class="activity">`, consigna imperativa en negritas, pasos numerados `<ol class="steps steps-numbered">` y respuestas en color magenta.',
        usedTools: [{ name: 'design_activity', ok: true }],
        proposal: {
          id: `prop_struct_${Date.now()}`,
          kind: 'activity',
          contentType: 'activity',
          title: 'Ciencias experimentales · Ecosistemas y Biodiversidad',
          meta: { section: 'Ciencias experimentales', subtopic: 'Naturales', grade: 'Cuarto', level: 'Primaria' },
          status: 'pending',
          html: canonicalActivityHtml,
          validation: { ok: true, score: 100 }
        }
      })
    });
  });

  await page.addInitScript(() => {
    window.__CHARLY_TEST_USER__ = { uid: 'docente_eval_789', email: 'eval@primaria.edu.mx', displayName: 'Profesor Titular' };
  });

  await page.goto('http://localhost:5005/charlyMCPeditor.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  await page.evaluate(() => {
    const session = {
      id: 'sess_eval_struct',
      title: 'Unidad 1 · Ciencias Naturales · 4° Primaria',
      storageRevision: 1,
      meta: { level: 'Primaria', grade: 'Cuarto', trimester: '1', unit: '1', category: 'Ciencias experimentales', subtopic: 'Naturales' },
      activeUnitId: 'unit_eval_1',
      units: [{
        id: 'unit_eval_1',
        title: 'Los Ecosistemas y su Equilibrio',
        meta: { level: 'Primaria', grade: 'Cuarto', trimester: '1', unit: '1', category: 'Ciencias experimentales', subtopic: 'Naturales' },
        messages: [],
        accepted: { reading: { id: 'r1', title: 'El bosque de niebla', html: '<p>Texto...</p>' }, activities: [], resources: [] }
      }],
      proposals: []
    };
    if (window.__cbStore) window.__cbStore.setSession(session);
    const modal = document.getElementById('cbUnitDataModal');
    if (modal) { modal.hidden = true; modal.setAttribute('aria-hidden', 'true'); }
    document.querySelectorAll('.cb-modal-backdrop').forEach(b => { if (b.closest('#cbUnitDataModal')) b.style.display = 'none'; });
  });
  await page.waitForTimeout(500);

  const composer = page.locator('#cbComposerInput');
  const send = page.locator('.cb-send-button');

  await composer.fill('Genera la actividad de Ciencias Naturales para esta unidad con su estructura canónica completa.');
  await send.click({ force: true });
  await page.waitForTimeout(2000);

  await page.evaluate(() => {
    const proposal = document.querySelector('.cb-proposal, [data-proposal-id]');
    if (proposal) proposal.scrollIntoView({ behavior: 'instant', block: 'center' });
  });
  await page.waitForTimeout(300);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'captura_mcp_actividad_estructura_comparativa.png') });
  console.log('Captura guardada: captura_mcp_actividad_estructura_comparativa.png');

  await browser.close();
})();
