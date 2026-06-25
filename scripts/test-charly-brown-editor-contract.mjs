import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = "/Users/waldolopez/Documents/CharlyBrown";
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("charly-brown.html is wired as a first-class page", () => {
  const html = read("public/charly-brown.html");
  const chrome = read("public/js/chromeLayout.js");

  assert.match(html, /<body[^>]*data-page="charly-brown\.html"/i);
  assert.match(html, /charly-brown\/charly-brown\.css/);
  assert.match(html, /charly-brown\/main\.js/);
  assert.match(html, /js\/chromeLayout\.js/);
  assert.match(html, /js\/sidebar\.js/);
  assert.match(html, /id="cbModelSelect"/);
  assert.match(html, /id="cbLevelSelect"/);
  assert.match(html, /id="cbCategorySelect"/);
  assert.match(html, /id="cbSubtopicSelect"/);
  assert.match(html, /id="cbComposer"/);
  assert.match(html, /gemini-3\.5-flash/);
  assert.match(html, /gemini-3\.1-pro-preview/);
  assert.match(html, /gemini-2\.5-pro/);
  assert.match(html, /id="cbToggleAcceptedBtn"/);
  assert.match(html, /id="cbAcceptedResizeHandle"/);
  assert.match(html, /aria-label="Datos de la unidad"/);
  assert.doesNotMatch(html, /data-chat-action="reading"/);
  assert.doesNotMatch(html, /data-chat-action="select-reading"/);
  assert.doesNotMatch(html, /data-chat-action="sya"/);
  assert.doesNotMatch(html, />Generar lectura</);
  assert.doesNotMatch(html, />Elegir lectura</);
  assert.doesNotMatch(html, />Revisar secuencia</);
  assert.match(chrome, /'charly-brown\.html':\s*\{\s*title:\s*'Charly Brown'/);
  assert.match(chrome, /href:\s*'charly-brown\.html'[\s\S]*label:\s*'Charly Brown'/);
});

test("charly brown implementation is split into focused modules", () => {
  const moduleDir = path.join(root, "public/charly-brown");
  const expected = [
    "main.js",
    "state.js",
    "sessions-store.js",
    "gemini-client.js",
    "reading-service.js",
    "unit-contracts.js",
    "sya-service.js",
    "chat-controller.js",
    "unit-generator.js",
    "teacher-notes-generator.js",
    "accepted-panel.js",
    "session-sidebar.js",
    "user-intent.js",
    "ui-components.js"
  ];

  for (const file of expected) {
    const fullPath = path.join(moduleDir, file);
    assert.ok(fs.existsSync(fullPath), `${file} debe existir`);
    const source = fs.readFileSync(fullPath, "utf8");
    assert.match(source, /\bexport\s+(function|const|class|async function)\b/, `${file} debe exportar funciones nombradas`);
  }

  const main = read("public/charly-brown/main.js");
  assert.doesNotMatch(main, /getFirestore|collection\(|generateContent|gemini\/generate/);
  assert.match(main, /renderCategoryAndSubtopicControls/);
  assert.match(main, /renderGradeOptions/);
  assert.match(main, /syncMetaForLevelAndGrade/);
  assert.match(main, /syncCategorySubtopicForGrade/);
  assert.match(main, /ALL_OPTION/);
  assert.match(main, /ensureSyaReadyForGeneration/);
  assert.match(main, /bindSyaEditingControls/);
  assert.match(main, /editSyaForCurrentSession/);
  assert.match(main, /restoreOriginalSyaForCurrentSession/);
  assert.match(main, /buildSyaContextKey/);
  assert.match(main, /handleRefineProposal/);
  assert.match(main, /updateProjectModeUi/);
});

test("reading service reuses existing lectura collections", () => {
  const source = read("public/charly-brown/reading-service.js");
  const html = read("public/charly-brown.html");
  const main = read("public/charly-brown/main.js");
  const panel = read("public/charly-brown/accepted-panel.js");
  const sya = read("public/charly-brown/sya-service.js");

  assert.match(source, /lecturasNuevas/);
  assert.match(source, /lecturasASC/);
  assert.match(source, /sharedWith/);
  assert.match(source, /estatusLectura/);
  assert.match(source, /publicar/);
  assert.match(source, /allowGlobal:\s*true/);
  assert.match(source, /sharedWithUids/);
  assert.match(source, /addDoc\(collection\(db,\s*"lecturasNuevas"\)/);
  assert.match(main, /listReadingsForUnit/);
  assert.match(main, /scheduleReadingsReload/);
  assert.match(main, /scheduleSyaReload/);
  assert.match(main, /loadReadingsForCurrentSession/);
  assert.match(main, /sections:\s*reading\.sections/);
  assert.match(main, /\["level", "grade", "trimester", "unit", "edition", "category", "subtopic"\]\.includes\(key\)/);
  assert.match(source, /filterReadingsForMeta/);
  assert.match(source, /gradeTrimester/);
  assert.match(source, /gradeOnly/);
  assert.match(source, /normalizeGrade/);
  assert.match(source, /sameGrade/);
  assert.match(source, /normalizeQuestions/);
  assert.match(source, /preguntasHTML/);
  assert.match(source, /preguntasVistaGuardadasHTML/);
  assert.match(source, /splitReadingSections/);
  assert.match(source, /extractNarrativeHtml/);
  assert.match(source, /resolveReadingSynonyms/);
  assert.match(panel, /data-reading-panel-action="refresh"/);
  assert.match(panel, /Preguntas de comprensión/);
  assert.match(panel, /cb-reading-questions/);
  assert.match(panel, /Tabla de sinónimos/);
  assert.match(panel, /data-collapse-toggle/);
  assert.match(panel, /cb-collapsible/);
  assert.match(panel, /data-sya-action="edit"/);
  assert.match(panel, /data-sya-action="restore"/);
  assert.match(panel, /Proyectos aprobados|Notas del proyecto/);
  assert.match(sya, /getFocusedSya/);
  assert.match(sya, /getSyaGroupedByCategory/);
  assert.match(sya, /filterCategoriesBySelection/);
  assert.match(sya, /hasAllSelection/);
  assert.match(sya, /aliases\.add\("Lectura"\)/);
  assert.match(sya, /normalizeSyaLookupKey/);
  assert.match(main, /saveGeneratedReading/);
});

test("unit contracts validate activity structure and expose primary categories", async () => {
  const mod = await import(pathToFileURL(path.join(root, "public/charly-brown/unit-contracts.js")));

  assert.deepEqual(mod.DIFFICULTY_LEVELS.map((x) => x.id), ["easy", "normal", "challenging", "expert"]);
  assert.equal(mod.ALL_OPTION, "Todos");
  assert.equal(mod.getProjectMethodology("1"), "ABP");
  assert.equal(mod.getProjectMethodology("2"), "STEAM");
  assert.equal(mod.getProjectMethodology("3"), "AS");
  assert.deepEqual(mod.getProjectPhases("2"), [
    "Fase 1 Análisis del contexto y diagnóstico",
    "Fase 2 Diseño del proyecto e indagación",
    "Fase 3 Organización de la información",
    "Fase 4 Presentación de resultados",
    "Fase 5 Reflexión y evaluación"
  ]);
  assert.equal(mod.isProjectSelection({ category: "Proyectos", subtopic: "Todos" }), true);
  assert.equal(mod.isProjectSelection({ category: "Todos", subtopic: "Proyectos" }), true);
  for (const category of [
    "Proyectos",
    "Lenguaje y comunicación",
    "Ciencias experimentales",
    "Ciencias sociales",
    "Formación socioemocional",
    "Matemáticas"
  ]) {
    assert.ok(mod.PRIMARY_CATEGORIES[category], `${category} debe estar disponible`);
  }
  assert.ok(mod.PRIMARY_CATEGORIES["Proyectos"].includes("Proyectos"));
  assert.deepEqual(mod.getGradesForLevel("Preescolar"), ["Primero", "Segundo", "Tercero"]);
  assert.deepEqual(mod.getGradesForLevel("Primaria"), ["Primero", "Segundo", "Tercero", "Cuarto", "Quinto", "Sexto"]);
  assert.deepEqual(mod.getGradesForLevel("Secundaria"), ["Primero", "Segundo", "Tercero"]);

  const valid = `<div class="activity"><p><strong>Lee con atención el texto.</strong> Subraya una evidencia importante. [IC T. IND]</p><ol class="steps steps-numbered"><li>Responde con una evidencia.<div class="answer"><span style="color:mediumvioletred;">Respuesta: evidencia clara.</span></div></li></ol></div>`;
  const invalid = `<div class="activity"><p><strong>Lee.</strong></p></div>`;
  const invalidVerb = `<div class="activity"><p><strong>Instrucción principal.</strong> Haz algo después. [IC T. IND]</p><ol class="steps steps-numbered"><li>Paso<div class="answer"><span style="color:mediumvioletred;">Respuesta: algo.</span></div></li></ol></div>`;

  assert.equal(mod.validateActivityHtml(valid).ok, true);
  assert.equal(mod.validateActivityHtml(invalid).ok, false);
  assert.equal(mod.validateActivityHtml(invalidVerb).ok, false);
  assert.match(mod.ACTIVITY_HTML_CONTRACT, /<strong>Lee con atención el texto\.<\/strong> Subraya/);
  assert.match(mod.buildActivityContractPrompt({ grade: "Tercero" }), /verbo en imperativo/i);
  assert.match(mod.buildActivityContractPrompt({ grade: "Tercero" }), /fuera del <strong>/i);
  assert.match(mod.buildActivityContractPrompt({ grade: "Tercero", category: "Matemáticas", subtopic: "Matematicas" }), /Categoría objetivo: Matemáticas/);
  assert.match(mod.buildActivityContractPrompt({ grade: "Tercero", category: "Matemáticas", subtopic: "Matematicas" }), /Subtema objetivo: Matematicas/);
  assert.match(mod.buildActivityContractPrompt({ grade: "Tercero", category: "Todos", subtopic: "Todos" }), /todas las categorías visibles/i);
  assert.match(mod.buildActivityContractPrompt({ grade: "Tercero", category: "Proyectos", subtopic: "Proyectos" }), /proyecto trimestral por fases/i);
});

test("teacher-notes-generator builds prompts from approved activities and full context", async () => {
  const mod = await import(pathToFileURL(path.join(root, "public/charly-brown/teacher-notes-generator.js")));
  const activity = `<div class="activity"><p><strong>Compara la lectura.</strong> [IC T. IND]</p><ol class="steps steps-numbered"><li>Escribe una diferencia.<div class="answer"><span style="color:mediumvioletred;">Respuesta: diferencia basada en el texto.</span></div></li></ol></div>`;
  const context = {
    session: { mode: "Maestro", grade: "Tercero", trimester: "2", unit: "3", edition: "Primaria en Forma 10rev" },
    reading: { title: "El bosque vivo", html: "<p>Lectura sobre ecosistemas.</p>" },
    sya: { Naturales_T: "Ecosistemas", Naturales_AE: "Reconoce relaciones entre seres vivos." },
    syaOriginal: { Naturales_T: "Entorno", Naturales_AE: "Observa el entorno." },
    preferences: ["Evitar preguntas genéricas.", "Usar cierre verificable."]
  };

  const one = mod.buildTeacherNotesPrompt({ activities: [activity], context, mode: "single" });
  assert.match(one, /El bosque vivo/);
  assert.match(one, /Ecosistemas/);
  assert.match(one, /secuencia editada por el usuario/i);
  assert.match(one, /Evitar preguntas genéricas/);
  assert.match(one, /Actividad de ampliación/);
  assert.match(one, /Neurología aplicada/);

  const global = mod.buildTeacherNotesPrompt({ activities: [activity, activity], context, mode: "global" });
  assert.match(global, /todas las actividades aprobadas/i);
});

test("gemini client uses backend proxy and never direct Gemini endpoint", () => {
  const source = read("public/charly-brown/gemini-client.js");
  const main = read("public/charly-brown/main.js");
  assert.match(source, /\/api\/gemini\/generate/);
  assert.match(source, /\/api\/gemini\/models/);
  assert.match(source, /GEMINI_MODEL_OPTIONS/);
  assert.match(source, /gemini-3\.5-flash/);
  assert.match(source, /gemini-3\.1-pro-preview/);
  assert.match(source, /gemini-3-pro-preview/);
  assert.match(source, /isRetryableModelError/);
  assert.match(main, /listGeminiModels/);
  assert.match(main, /renderGeminiModelOptions/);
  assert.doesNotMatch(source, /generativelanguage\.googleapis\.com/);
});

test("free chat preserves conversation and does not always generate activities", () => {
  const main = read("public/charly-brown/main.js");
  const generator = read("public/charly-brown/unit-generator.js");

  assert.doesNotMatch(main, /handleAction\("activities",\s*text\)/);
  assert.doesNotMatch(main, /Te leo y mantengo el hilo/);
  assert.match(main, /routeUserIntent/);
  assert.match(main, /handleFreeChat/);
  assert.match(main, /resolveLocalChatResponse/);
  assert.match(generator, /buildChatPrompt/);
  assert.match(generator, /generateChatReply/);
});

test("sya and right panel render as editor UI instead of duplicated json", () => {
  const main = read("public/charly-brown/main.js");
  const panel = read("public/charly-brown/accepted-panel.js");
  const css = read("public/charly-brown/charly-brown.css");
  const generator = read("public/charly-brown/unit-generator.js");
  const state = read("public/charly-brown/state.js");

  assert.match(main, /flashWorkingStatus/);
  assert.doesNotMatch(main, /ya estaba añadida\. No la dupliqué/);
  assert.doesNotMatch(main, /conservé tu versión editada/i);
  assert.doesNotMatch(panel, /JSON\.stringify\(accepted\.sya/);
  assert.match(panel, /renderSyaSummary/);
  assert.match(panel, /cb-sya-focus/);
  assert.match(panel, /Aprendizaje esperado/);
  assert.match(panel, /cb-reading-dock/);
  assert.match(panel, /Todas las categorías|Lecturas|data-collapse-shell/);
  assert.match(generator, /Secuencia y alcance del subtema actual/);
  assert.match(generator, /Antes de diseñar las activities/);
  assert.match(generator, /Si Categoría o Subtema está en "Todos"/);
  assert.match(generator, /buildSyaPromptBlock/);
  assert.match(generator, /Reglas obligatorias para proyecto/);
  assert.match(generator, /proyecto trimestral con metodología/);
  assert.match(state, /syaOriginal/);
  assert.match(state, /syaContextKey/);
  assert.match(css, /--cb-accepted-width/);
  assert.match(css, /cb-accepted-resize-handle/);
  assert.match(css, /is-accepted-hidden/);
  assert.match(css, /position:\s*fixed;/);
  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto/);
  assert.match(css, /cb-collapsible/);
  assert.match(css, /cb-synonyms-table/);
});

test("difficulty refinement keeps the same topic and raises challenge intentionally", () => {
  const source = read("public/charly-brown/unit-generator.js");
  const main = read("public/charly-brown/main.js");

  assert.match(source, /buildRefineActivitiesPrompt/);
  assert.match(source, /NO es crear una unidad nueva/i);
  assert.match(source, /más difícil sin cambiar el tema/i);
  assert.match(source, /distractores plausibles/i);
  assert.match(source, /opciones múltiples/i);
  assert.match(source, /Secuencia y alcance del subtema actual/);
  assert.match(main, /handleRefineProposal/);
  assert.match(main, /m[aá]s difícil sin cambiar el tema/i);
});

test("user intent routes free conversation separately from generation commands", async () => {
  const mod = await import(pathToFileURL(path.join(root, "public/charly-brown/user-intent.js")));

  assert.equal(mod.routeUserIntent("¿Qué lectura tengo seleccionada?"), "chat");
  assert.equal(mod.routeUserIntent("No me gustó la segunda, explícamela"), "chat");
  assert.equal(mod.routeUserIntent("Genera actividades para esta lectura"), "activities");
  assert.equal(mod.routeUserIntent("Crear notas del maestro con lo aprobado"), "teacher-notes");
  assert.equal(mod.routeUserIntent("Busca una lectura para esta unidad"), "select-reading");
});

test("reading service normalizes grade words and numbers consistently", async () => {
  const source = read("public/charly-brown/reading-service.js");
  assert.match(source, /primero/);
  assert.match(source, /tercero/);
  assert.match(source, /sexto/);
  assert.match(source, /extractLeadingNumber/);
});

function test(name, fn) {
  Promise.resolve()
    .then(fn)
    .then(() => console.log(`ok - ${name}`))
    .catch((error) => {
      console.error(`not ok - ${name}`);
      console.error(error);
      process.exitCode = 1;
    });
}
