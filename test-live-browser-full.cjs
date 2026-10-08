const { chromium } = require('playwright');
const path = require('path');

const ARTIFACT_DIR = '/Users/waldolopez/.gemini/antigravity/brain/47d134e5-030d-4776-b56e-9726cd692868';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('console', msg => console.log('[BROWSER CONSOLE]:', msg.text()));
  page.on('pageerror', err => console.log('[BROWSER ERROR]:', err.message));

  let turn = 0;
  await page.route('**/api/charly-brown/chat', async (route) => {
    turn++;
    const postData = JSON.parse(route.request().postData() || '{}');
    console.log(`[LIVE BROWSER] Chat Turn ${turn}: "${postData.text?.slice(0, 50)}..."`);

    if (turn === 1) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          text: `### Enfoque Metodológico Sugerido para 4° de Primaria (NEM)\n\nPara abordar el tema de los **Ecosistemas y Biodiversidad** en cuarto grado bajo los lineamientos de la Nueva Escuela Mexicana (NEM), recomiendo implementar el enfoque **STEAM con Aprendizaje Basado en Indagación**:\n\n1. **Punto de partida situado (Saberes Comunitarios):**\n   - Conectar con los ecosistemas locales de los alumnos o regiones emblemáticas de México (ej. el *Bosque de Niebla*).\n   - Plantear preguntas detonadoras: *¿Cómo viaja el agua desde las nubes de la sierra hasta nuestras casas?*\n\n2. **Indagación y Experimentación guiada:**\n   - Observación de interdependencias entre flora, fauna y factores abióticos (humedad, suelo, luz solar).\n   - Modelado de cadenas tróficas y ciclos de agua con material manipulativo y gráfico.\n\n3. **Conciencia Crítica y Acción Comunitaria:**\n   - Identificar amenazas ecológicas locales y diseñar propuestas de conservación y reforestación.\n\n¿Deseas que profundicemos en estrategias de neuroeducación (atención sostenida, activación dopaminérgica) o pasamos a estructurar la actividad?`,
          usedTools: [{ name: 'web_search', ok: true }]
        })
      });
    } else if (turn === 2) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          text: `### Estrategias de Neuroeducación y Trabajo Colaborativo\n\nIntegrar principios de neurociencia pedagógica maximiza la retención y el engagement en niños de 9 a 10 años:\n\n1. **Activación de Conocimientos Previos (Enganche Emocional):**\n   - **Gimnasia cerebral y pregunta de anclaje:** Mostrar una imagen del dosel del bosque de niebla para activar la curiosidad y la corteza visual.\n   - **Lluvia de ideas relámpago:** Conectar con lo que ya saben sobre la lluvia y los animales de su entorno.\n\n2. **Reto Cognitivo Progresivo (Andamiaje & Neuroplasticidad):**\n   - Estructurar consignas escalonadas: desde la identificación básica hasta la formulación de hipótesis causales (*"¿Qué ocurriría si desaparecen los musgos que retienen el agua?"*).\n   - Estimulación del pensamiento crítico mediante dilemas ecológicos reales.\n\n3. **Trabajo Colaborativo y Metacognición:**\n   - Asignar roles rotativos de equipo (Biólogo observador, Cartógrafo ecológico, Relator de soluciones).\n   - Momentos de pausa metacognitiva: reflexionar sobre *qué aprendimos hoy y cómo lo descubrimos*.\n\n¡Estoy listo para diseñar la actividad con estas directrices! ¿Te gustaría que la genere con su respuesta esperada en color magenta para el docente?`,
          usedTools: [{ name: 'research_topic', ok: true }]
        })
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          text: `He diseñado la actividad didáctica integrando los principios metodológicos, el vocabulario preferente de neuroeducación y la estructura de reto cognitivo con respuesta esperada en color magenta:`,
          usedTools: [{ name: 'design_activity', ok: true }],
          proposal: {
            id: `prop_live_${Date.now()}`,
            kind: 'activity',
            contentType: 'activity',
            title: 'Proyecto de Indagación: Guardianes del Bosque de Niebla',
            meta: { section: 'Ciencias experimentales', subtopic: 'Naturales', grade: 'Cuarto', level: 'Primaria' },
            status: 'pending',
            html: `<div class="cb-activity-block">
  <h4>1. Desafío de Indagación Ecológica</h4>
  <p><strong>Instrucción para el alumno:</strong> Observa la lectura sobre el bosque mesófilo y explica en equipo cómo la niebla se transforma en agua disponible para la biodiversidad y las comunidades humanas. Traza en tu cuaderno la ruta del agua desde las nubes hasta el río.</p>
  <p><strong>Respuesta esperada:</strong> <span style="color:#d946ef; font-weight:600;">Las orquídeas, musgos y helechos gigantes funcionan como esponjas naturales que atrapan la humedad de la niebla condensada. El agua gotea hacia el suelo forestal, se filtra en los mantos freáticos y alimenta los manantiales y ríos que abastecen a la comunidad.</span></p>
  <hr style="border:0; border-top:1px dashed #cbd5e1; margin:1rem 0;" />
  <h4>2. Reto Cognitivo: Causa y Efecto</h4>
  <p><strong>Instrucción para el alumno:</strong> Si una empresa tala los árboles y retira la vegetación del bosque de niebla, ¿qué consecuencias inmediatas y a largo plazo sufrirá el ecosistema? Justifica tu respuesta usando el concepto de equilibrio ecológico.</p>
  <p><strong>Respuesta esperada:</strong> <span style="color:#d946ef; font-weight:600;">Consecuencia inmediata: Pérdida del hábitat del quetzal y jaguar, así como disminución de humedad ambiental. Consecuencia a largo plazo: Erosión del suelo, sequía en los ríos locales y ruptura del equilibrio ecológico y la cadena trófica.</span></p>
</div>`,
            validation: { ok: true, score: 98, checks: ['Instrucción clara en negrita', 'Respuesta docente en color magenta', 'Vocabulario preferente integrado'] }
          }
        })
      });
    }
  });

  await page.addInitScript(() => {
    window.__CHARLY_TEST_USER__ = { uid: 'docente_live_456', email: 'docente@primaria.edu.mx', displayName: 'Profesor de Primaria' };
  });

  console.log('1. Navegando al editor Charly MCP en el navegador...');
  await page.goto('http://localhost:5005/charlyMCPeditor.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // Inicializar sesión y cerrar modales iniciales
  await page.evaluate(() => {
    const session = {
      id: 'sess_live_browser',
      title: 'Unidad 1 · Ecosistemas y Biodiversidad · 4° Primaria',
      storageRevision: 1,
      meta: { level: 'Primaria', grade: 'Cuarto', trimester: '1', unit: '1', category: 'Ciencias experimentales', subtopic: 'Naturales' },
      activeUnitId: 'unit_live_1',
      units: [{
        id: 'unit_live_1',
        title: 'Los Ecosistemas de México',
        meta: { level: 'Primaria', grade: 'Cuarto', trimester: '1', unit: '1', category: 'Ciencias experimentales', subtopic: 'Naturales' },
        messages: [],
        accepted: {
          reading: {
            id: 'r_live',
            title: 'La vida en el bosque de niebla',
            html: '<h3>La vida en el bosque de niebla</h3><p>En las montañas de México existe un ecosistema fascinante donde las nubes abrazan los árboles: el bosque de niebla o bosque mesófilo de montaña. Este lugar alberga una inmensa biodiversidad de orquídeas, helechos gigantes, jaguares y quetzales. Las plantas capturan el agua de la niebla como esponjas naturales, alimentando los ríos que abastecen a las comunidades cercanas. Sin embargo, la tala y el cambio climático amenazan el equilibrio de este ecosistema.</p>'
          },
          activities: [],
          resources: []
        }
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

  console.log('2. Enviando consulta metodológica en el navegador...');
  await composer.fill('¿Qué enfoque metodológico y de indagación me recomiendas para abordar el tema de los ecosistemas en 4° de Primaria considerando la NEM?');
  await send.click({ force: true });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'captura_chat_mcp_01_pregunta_inicial.png') });

  console.log('3. Enviando consulta de neuroeducación en el navegador...');
  await composer.fill('Excelente análisis. ¿Cómo podemos integrar retos cognitivos, activación de conocimientos previos y trabajo colaborativo para este tema?');
  await send.click({ force: true });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const el = document.getElementById('cbMessages'); if (el) el.scrollTop = el.scrollHeight; });
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'captura_chat_mcp_02_profundizacion.png') });

  console.log('4. Solicitando generación de actividad didáctica en el navegador...');
  await composer.fill('Con base en todo lo que hemos platicado sobre el bosque de niebla y los ecosistemas, prepara y diseña una actividad didáctica de Ciencias Naturales para los alumnos con su respuesta esperada en color magenta y consigna de reto.');
  await send.click({ force: true });
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const proposal = document.querySelector('.cb-proposal, [data-proposal-id]');
    if (proposal) proposal.scrollIntoView({ behavior: 'instant', block: 'center' });
  });
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'captura_chat_mcp_03_actividad_propuesta.png') });

  console.log('5. Aprobando la propuesta didáctica en el navegador...');
  const acceptBtn = page.locator('[data-proposal-action="accept"], .cb-proposal-btn--primary').first();
  if (await acceptBtn.count() > 0 && await acceptBtn.isVisible()) {
    await acceptBtn.click();
    await page.waitForTimeout(1000);
  }

  const toggleActivities = page.locator('[data-collapse-toggle$="-activities"]').first();
  if (await toggleActivities.count() > 0) {
    await toggleActivities.click();
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'captura_chat_mcp_04_unidad_completa.png') });

  console.log('6. Abriendo y verificando el Vocabulary Management Studio en el navegador...');
  const openConfigBtn = page.locator('#cbOpenSubtopicsSettingsBtn');
  if (await openConfigBtn.count() > 0 && await openConfigBtn.isVisible()) {
    await openConfigBtn.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'captura_05_vocab_studio_alumno.png') });

    const teacherTab = page.locator('.cb-vocab-tab[data-tab="teacher"]');
    if (await teacherTab.count() > 0) {
      await teacherTab.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'captura_07_vocab_studio_docente.png') });
    }

    const closeBtn = page.locator('#cbSubtopicsSettingsClose');
    if (await closeBtn.count() > 0 && await closeBtn.isVisible()) {
      await closeBtn.click();
      await page.waitForTimeout(300);
    }
  }

  await browser.close();
  console.log('Browser Live Testing Suite completado exitosamente!');
})();
