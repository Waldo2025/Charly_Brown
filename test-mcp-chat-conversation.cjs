const { chromium } = require('playwright');
const path = require('path');

const ARTIFACT_DIR = '/Users/waldolopez/.gemini/antigravity/brain/47d134e5-030d-4776-b56e-9726cd692868';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('console', msg => console.log('[PAGE LOG]:', msg.text()));
  page.on('pageerror', err => console.log('[PAGE ERROR]:', err.message));

  let turnCount = 0;

  // Intercept backend chat calls with pedagogical responses and MCP tool proposals
  await page.route('**/api/charly-brown/chat', async (route) => {
    turnCount++;
    const postData = JSON.parse(route.request().postData() || '{}');
    console.log(`[ROUTE INTERCEPT] Turn ${turnCount}: User asked -> "${postData.text?.slice(0, 60)}..."`);

    let responseData = {};

    if (turnCount === 1) {
      const assistantText = `### Enfoque Metodológico Sugerido para 4° de Primaria (NEM)

Para abordar el tema de los **Ecosistemas y Biodiversidad** en cuarto grado bajo los lineamientos de la Nueva Escuela Mexicana (NEM), recomiendo implementar el enfoque **STEAM con Aprendizaje Basado en Indagación**.

1. **Punto de partida situado (Saberes Comunitarios):**
   - Conectar con los ecosistemas locales de los alumnos o regiones emblemáticas de México (ej. el *Bosque de Niebla*).
   - Plantear preguntas detonadoras: *¿Cómo viaja el agua desde las nubes de la sierra hasta nuestras casas?*

2. **Indagación y Experimentación guiada:**
   - Observación de interdependencias entre flora, fauna y factores abióticos (humedad, suelo, luz solar).
   - Modelado de cadenas tróficas y ciclos de agua con material manipulativo y gráfico.

3. **Conciencia Crítica y Acción Comunitaria:**
   - Identificar amenazas ecológicas locales y diseñar propuestas de conservación y reforestación.

¿Deseas que profundicemos en estrategias de neuroeducación (atención sostenida, activación dopaminérgica) o pasamos a estructurar la actividad?`;

      responseData = {
        ok: true,
        text: assistantText,
        specifications: '',
        usedTools: [{ name: 'web_search', ok: true }]
      };
    } else if (turnCount === 2) {
      const assistantText = `### Estrategias de Neuroeducación y Trabajo Colaborativo

Integrar principios de neurociencia pedagógica maximiza la retención y el engagement en niños de 9 a 10 años:

1. **Activación de Conocimientos Previos (Enganche Emocional):**
   - **Gimnasia cerebral y pregunta de anclaje:** Mostrar una imagen del dosel del bosque de niebla para activar la curiosidad y la corteza visual.
   - **Lluvia de ideas relámpago:** Conectar con lo que ya saben sobre la lluvia y los animales de su entorno.

2. **Reto Cognitivo Progresivo (Andamiaje & Neuroplasticidad):**
   - Estructurar consignas escalonadas: desde la identificación básica hasta la formulación de hipótesis causales (*"¿Qué ocurriría si desaparecen los musgos que retienen el agua?"*).
   - Estimulación del pensamiento crítico mediante dilemas ecológicos reales.

3. **Trabajo Colaborativo y Metacognición:**
   - Asignar roles rotativos de equipo (Biólogo observador, Cartógrafo ecológico, Relator de soluciones).
   - Momentos de pausa metacognitiva: reflexionar sobre *qué aprendimos hoy y cómo lo descubrimos*.

¡Estoy listo para diseñar la actividad con estas directrices! ¿Te gustaría que la genere con su respuesta esperada en color magenta para el docente?`;

      responseData = {
        ok: true,
        text: assistantText,
        specifications: '',
        usedTools: [{ name: 'research_topic', ok: true }]
      };
    } else {
      // Turn 3: Generación de Actividad con MCP Tool design_activity
      const assistantText = `He diseñado la actividad didáctica integrando los principios metodológicos, el vocabulario preferente de neuroeducación y la estructura de reto cognitivo con respuesta esperada en color magenta:`;

      const proposalId = `prop_act_${Date.now()}`;
      const activityProposal = {
        id: proposalId,
        kind: 'activity',
        contentType: 'activity',
        title: 'Proyecto de Indagación: Guardianes del Bosque de Niebla',
        meta: {
          section: 'Ciencias experimentales',
          subtopic: 'Naturales',
          grade: 'Cuarto',
          level: 'Primaria'
        },
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
      };

      responseData = {
        ok: true,
        text: assistantText,
        specifications: '',
        usedTools: [{ name: 'design_activity', ok: true }],
        proposal: activityProposal
      };
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(responseData)
    });
  });

  // Mock authenticated user
  await page.addInitScript(() => {
    window.__CHARLY_TEST_USER__ = {
      uid: 'test_docente_mexico_123',
      email: 'docente@charlybrown.edu.mx',
      displayName: 'Maestro de Primaria'
    };
  });

  console.log('Navigating to Charly MCP Editor...');
  await page.goto('http://localhost:5005/charlyMCPeditor.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // Set active session in store and close any overlay modal
  await page.evaluate(() => {
    const session = {
      id: 'sess_demo_chat',
      title: 'Unidad 1 · Ecosistemas y Biodiversidad · 4° Primaria',
      storageRevision: 1,
      meta: { level: 'Primaria', grade: 'Cuarto', trimester: '1', unit: '1', category: 'Ciencias experimentales', subtopic: 'Naturales' },
      activeUnitId: 'unit_chat_1',
      units: [{
        id: 'unit_chat_1',
        title: 'Los Ecosistemas de México',
        meta: { level: 'Primaria', grade: 'Cuarto', trimester: '1', unit: '1', category: 'Ciencias experimentales', subtopic: 'Naturales' },
        messages: [],
        accepted: {
          reading: {
            id: 'read_1',
            title: 'La vida en el bosque de niebla',
            html: '<h3>La vida en el bosque de niebla</h3><p>En las montañas de México existe un ecosistema fascinante donde las nubes abrazan los árboles: el bosque de niebla o bosque mesófilo de montaña. Este lugar alberga una inmensa biodiversidad de orquídeas, helechos gigantes, jaguares y quetzales. Las plantas capturan el agua de la niebla como esponjas naturales, alimentando los ríos que abastecen a las comunidades cercanas. Sin embargo, la tala y el cambio climático amenazan el equilibrio de este ecosistema.</p>'
          },
          activities: [],
          resources: []
        }
      }],
      proposals: []
    };
    if (window.__cbStore) {
      window.__cbStore.setSession(session);
    }
    const modal = document.getElementById('cbUnitDataModal');
    if (modal) {
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
    }
    const backdrops = document.querySelectorAll('.cb-modal-backdrop, [data-modal-close="unit-data"]');
    backdrops.forEach(b => {
      if (b.closest('#cbUnitDataModal')) {
        b.style.display = 'none';
      }
    });
  });
  await page.waitForTimeout(500);

  const composerInput = page.locator('#cbComposerInput');
  const sendBtn = page.locator('.cb-send-button');

  // --- INTERACCIÓN 1: Pregunta Pedagógica Inicial ---
  console.log('Enviando Pregunta 1...');
  const pregunta1 = '¿Qué enfoque metodológico y de indagación me recomiendas para abordar el tema de los ecosistemas en 4° de Primaria considerando la NEM?';
  await composerInput.fill(pregunta1);
  await sendBtn.click({ force: true });
  await page.waitForTimeout(1500);

  // Captura 1: Pregunta 1 y Respuesta
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'captura_chat_mcp_01_pregunta_inicial.png') });
  console.log('Captura 1 guardada: captura_chat_mcp_01_pregunta_inicial.png');

  // --- INTERACCIÓN 2: Profundización Pedagógica & Neuroeducación ---
  console.log('Enviando Pregunta 2...');
  const pregunta2 = 'Excelente análisis. ¿Cómo podemos integrar retos cognitivos, activación de conocimientos previos y trabajo colaborativo para este tema?';
  await composerInput.fill(pregunta2);
  await sendBtn.click({ force: true });
  await page.waitForTimeout(1500);

  // Scroll to make question 2 and response prominent
  await page.evaluate(() => {
    const el = document.getElementById('cbMessages');
    if (el) el.scrollTop = el.scrollHeight;
  });
  await page.waitForTimeout(300);

  // Captura 2: Pregunta 2 y Respuesta
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'captura_chat_mcp_02_profundizacion.png') });
  console.log('Captura 2 guardada: captura_chat_mcp_02_profundizacion.png');

  // --- INTERACCIÓN 3: Creación de Actividad Basada en la Conversación ---
  console.log('Enviando Petición 3: Crear Actividad...');
  const pregunta3 = 'Con base en todo lo que hemos platicado sobre el bosque de niebla y los ecosistemas, prepara y diseña una actividad didáctica de Ciencias Naturales para los alumnos con su respuesta esperada en color magenta y consigna de reto.';
  await composerInput.fill(pregunta3);
  await sendBtn.click({ force: true });
  await page.waitForTimeout(2000);

  // Scroll to make proposal card visible
  await page.evaluate(() => {
    const proposal = document.querySelector('.cb-proposal, [data-proposal-id]');
    if (proposal) proposal.scrollIntoView({ behavior: 'instant', block: 'center' });
  });
  await page.waitForTimeout(300);

  // Captura 3: Propuesta de Actividad en el Chat
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'captura_chat_mcp_03_actividad_propuesta.png') });
  console.log('Captura 3 guardada: captura_chat_mcp_03_actividad_propuesta.png');

  // Aceptar propuesta e integrarla a la unidad
  const acceptBtn = page.locator('[data-proposal-action="accept"], .cb-proposal-btn--primary, button:has-text("Aceptar actividades"), button:has-text("Aceptar proyecto")').first();
  if (await acceptBtn.count() > 0 && await acceptBtn.isVisible()) {
    console.log('Haciendo clic en Aceptar propuesta de actividades...');
    await acceptBtn.click();
    await page.waitForTimeout(1000);
  }

  // Expand accepted activities in the right panel
  const toggleActivities = page.locator('[data-collapse-toggle$="-activities"]').first();
  if (await toggleActivities.count() > 0) {
    console.log('Expandiendo acordeón de Actividades en el panel derecho...');
    await toggleActivities.click();
    await page.waitForTimeout(500);
  }

  // Captura 4: Vista Final del Chat y Panel de Actividades Aprobadas
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'captura_chat_mcp_04_unidad_completa.png') });
  console.log('Captura 4 guardada: captura_chat_mcp_04_unidad_completa.png');

  await browser.close();
  console.log('Chat MCP test suite completed successfully!');
})();
