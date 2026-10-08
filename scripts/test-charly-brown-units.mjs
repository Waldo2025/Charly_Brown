import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createEmptySession, createStore, normalizeSession } from "../public/charly-brown/state.js";
import { collectSessionBibliography } from "../public/charly-brown/bibliography.js";
import { getNextWorkflowStep, markActivitySection, normalizeUnitWorkflow, setWorkflowActivitySections } from "../public/charly-brown/workflow.js";
import { filterSessionsByAcademicMeta, getAcademicFilterOptions } from "../public/charly-brown/session-sidebar.js";
import { AUTOMATED_RESOURCE_SELECTIONS, buildAutomatedActivityQueue, getNextAutomatedUnitValue, pickExactReadingForMeta } from "../public/charly-brown/unit-automation.js";
import { buildActivityContractPrompt, validateActivityHtml } from "../public/charly-brown/unit-contracts.js";
import { normalizeActivitySubtopicTitle } from "../public/charly-brown/activity-label.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));

test("el título del colapsable contiene únicamente el subtema", () => {
  assert.equal(normalizeActivitySubtopicTitle("actividades generadas * Todos * ComprensionLectora"), "ComprensionLectora");
  assert.equal(normalizeActivitySubtopicTitle("Actividades generadas · Lenguaje y comunicación · TrazosDeLetras · más difícil"), "TrazosDeLetras");
});

test("una sesión nueva comienza sin unidades ni contenido", () => {
  const session = createEmptySession();
  assert.equal(session.units.length, 0);
  assert.equal(session.activeUnitId, "");
  assert.equal(session.accepted.activities.length, 0);
  assert.equal(session.meta.model, "gemini-3.8-flash");
  assert.equal(normalizeSession({ academicMeta: { model: "gemini-2.5-flash" } }).meta.model, "gemini-3.8-flash");
});

test("la lista de libros no requiere un índice compuesto de Firestore", () => {
  const source = fs.readFileSync(path.join(dirname, "../public/charly-brown/sessions-store.js"), "utf8");
  assert.match(source, /getDocs\(baseQuery\)/);
  assert.doesNotMatch(source, /orderBy\("updatedAt"/);
  assert.doesNotMatch(source, /listSessions orderBy fallback/);
});

test("la unidad automatizada elige lectura exacta y respeta el orden curricular", () => {
  const meta = { level: "Primaria", grade: "Segundo", trimester: "2", unit: "3" };
  const readings = [
    { id: "wrong-unit", meta: { nivel: "Primaria", grado: "Segundo", trimestre: "2", unidad: "2" } },
    { id: "exact", meta: { nivel: "primaria", grado: "2", trimestre: "Trimestre 2", unidad: "Unidad 3" } }
  ];
  assert.equal(pickExactReadingForMeta(readings, meta)?.id, "exact");
  assert.equal(getNextAutomatedUnitValue([{ meta: { unit: "1" } }, { meta: { unit: "3" } }]), "2");

  const queue = buildAutomatedActivityQueue([
    { category: "Lenguaje y comunicación", items: [
      { subtopic: "TrazosDeLetras", fields: { T: "Trazo" } },
      { subtopic: "ComprensionLectora", fields: { AE: "Comprende" } }
    ] },
    { category: "Matemáticas", items: [{ subtopic: "Matematicas", fields: { C: "Números" } }] }
  ]);
  assert.deepEqual(queue.map((item) => item.subtopic), ["TrazosDeLetras", "ComprensionLectora", "Matematicas"]);
  assert.match(queue[0].section, /Trazos de letras/);
  assert.match(queue[0].agentInstructions, /cuatro ejercicios progresivos/i);
  assert.match(queue[1].description, /Comprende/);
  const firstUnitQueue = buildAutomatedActivityQueue([{ category: "Matemáticas", items: [{ subtopic: "Matematicas", fields: { C: "Números" } }] }], { unit: "1" });
  assert.equal(firstUnitQueue[0].category, "Proyectos");
  assert.equal(firstUnitQueue[1].category, "Matemáticas");
});

test("Trazos de letras conserva las cuatro actividades del generador original", () => {
  const prompt = buildActivityContractPrompt({
    grade: "Primero",
    category: "Lenguaje y comunicación",
    subtopic: "TrazosDeLetras"
  });
  assert.match(prompt, /exactamente cuatro actividades/i);
  assert.match(prompt, /direccionalidad/i);
  assert.match(prompt, /repetición o completado en renglón/i);
  assert.match(prompt, /otra frase breve/i);
  assert.match(prompt, /No uses <ol>, <ul>, <li>/i);

  const activity = (instruction, model) => `<div class="activity"><p><strong>${instruction}</strong> [IC T. IND]</p><div class="trace-model">${model}</div><div class="answer"><span style="color:magenta;">Respuesta: ${model}</span></div></div>`;
  const valid = [
    activity("Traza la letra siguiendo las flechas.", "M m"),
    activity("Repite la letra en el renglón.", "m m m m"),
    activity("Lee y traza la frase corta.", "Mi mamá me mima."),
    activity("Lee y copia la segunda frase.", "Memo ama a Mimi.")
  ].join("");
  assert.equal(validateActivityHtml(valid, { subtopic: "TrazosDeLetras" }).ok, true);
  assert.equal(validateActivityHtml(valid.replace(/<div class="activity">[\s\S]*?<\/div><\/div>$/, ""), { subtopic: "TrazosDeLetras" }).ok, false);
  assert.equal(validateActivityHtml(valid.replace('<div class="trace-model">M m</div>', '<ol class="steps"><li>M m</li></ol>'), { subtopic: "TrazosDeLetras" }).ok, false);
});

test("el editor de secuencia permite crear subtemas y relacionarlos con una sección", () => {
  const html = fs.readFileSync(path.join(dirname, "../public/charlyMCPeditor.html"), "utf8");
  const main = fs.readFileSync(path.join(dirname, "../public/charly-brown/main.js"), "utf8");
  assert.match(html, /id="cbSyaSectionCreate"/);
  assert.match(html, /id="cbSyaSectionName"[^>]*required/);
  assert.match(html, /id="cbSyaSectionCategory"[^>]*required/);
  assert.match(main, /SYA_SUBTOPIC_META_KEY = "__subtopics"/);
  assert.match(main, /populateSyaCategorySelect\(category\)/);
});

test("el estado del chat muestra Respondiendo", () => {
  const controller = fs.readFileSync(path.join(dirname, "../public/charly-brown/chat-controller.js"), "utf8");
  assert.match(controller, /const label = "Respondiendo"/);
});

test("el botón de notas del maestro delega la creación al MCP", () => {
  const html = fs.readFileSync(path.join(dirname, "../public/charlyMCPeditor.html"), "utf8");
  const main = fs.readFileSync(path.join(dirname, "../public/charly-brown/main.js"), "utf8");
  const acceptedPanel = fs.readFileSync(path.join(dirname, "../public/charly-brown/accepted-panel.js"), "utf8");
  const chatHeader = html.match(/<header class="cb-chat-header">([\s\S]*?)<\/header>/)?.[1] || "";
  assert.doesNotMatch(chatHeader, /aria-label="Crear notas del maestro"/);
  assert.doesNotMatch(chatHeader, /data-chat-action="teacher-notes"/);
  assert.match(html, /id="cbGenerateGlobalNotesBtn"[^>]*aria-label="Crear notas del maestro"/);
  assert.match(acceptedPanel, /globalBtn\.onclick = \(\) => onGenerateGlobalNotes\?\.\(\)/);
  assert.match(main, /Usa create_teacher_notes para crear y guardar las notas del maestro/);
  assert.doesNotMatch(main, /import \{ generateTeacherNotes \}/);
});

test("regenerar un subtema muestra un spinner dentro de la tarjeta aprobada", () => {
  const main = fs.readFileSync(path.join(dirname, "../public/charly-brown/main.js"), "utf8");
  const css = fs.readFileSync(path.join(dirname, "../public/charly-brown/charly-brown.css"), "utf8");
  const block = main.slice(main.indexOf("async function regenerateActivity"), main.indexOf("async function regenerateResource"));
  assert.match(block, /setActivityRegenerationBusy\(activityId, true\)/);
  assert.match(block, /buildActivityRegenerationSession\(session, activity\)/);
  assert.match(block, /session: regenerationSession/);
  assert.match(block, /isTracingLetters[\s\S]*exactamente cuatro actividades/);
  assert.match(block, /normalizedSection\.includes\("trazosdeletras"\) \? "TrazosDeLetras"/);
  assert.match(block, /finally\s*\{[\s\S]*setActivityRegenerationBusy\(activityId, false\)/);
  assert.match(block, /body\.insertAdjacentHTML\("afterbegin"/);
  assert.match(block, /class="cb-approved-card-spinner"/);
  assert.match(css, /\.cb-approved-card-spinner\s*\{[\s\S]*?position: absolute;[\s\S]*?display: flex;/);
  assert.match(css, /\.cb-approved-card\.is-regenerating \.cb-approved-card-body\s*\{[\s\S]*?display: block;/);
});

test("el footer del chat permite cambiar el modelo de Gemini", () => {
  const html = fs.readFileSync(path.join(dirname, "../public/charlyMCPeditor.html"), "utf8");
  const main = fs.readFileSync(path.join(dirname, "../public/charly-brown/main.js"), "utf8");
  assert.match(html, /id="cbComposerModelBtn"/);
  assert.match(html, /id="cbComposerModelMenu"[^>]*role="menu"/);
  assert.match(html, /id="cbComposerModelLabel">Gemini 3\.8 Flash/);
  assert.doesNotMatch(html, /id="cbModelSelect"/);
  assert.match(main, /data-composer-model/);
  assert.match(main, /store\.updateMeta\(\{ model \}\)/);
});

test("las respuestas del agente muestran especificaciones en un modal", () => {
  const html = fs.readFileSync(path.join(dirname, "../public/charlyMCPeditor.html"), "utf8");
  const main = fs.readFileSync(path.join(dirname, "../public/charly-brown/main.js"), "utf8");
  const controller = fs.readFileSync(path.join(dirname, "../public/charly-brown/chat-controller.js"), "utf8");
  const styles = fs.readFileSync(path.join(dirname, "../public/charly-brown/charly-brown.css"), "utf8");
  assert.match(html, /id="cbSpecificationsModal"/);
  assert.match(html, /id="cbSpecificationsModalBody"/);
  assert.match(controller, /data-message-specifications/);
  assert.match(controller, /message\?\.specifications \|\| ""/);
  assert.match(controller, /action: "easier"[\s\S]*?icon: "fas fa-arrow-down-short-wide"/);
  assert.match(controller, /action: "harder"[\s\S]*?icon: "fas fa-arrow-up-short-wide"/);
  assert.match(controller, /action: "regenerate"[\s\S]*?label: "Regenerar la actividad"[\s\S]*?icon: "fas fa-rotate-right"/);
  assert.match(controller, /querySelector\('\[data-proposal-action="easier"\] i'\)/);
  assert.match(controller, /insertAdjacentHTML\("beforebegin", renderProposalToolbarButton\(\{ action: "regenerate"/);
  assert.match(controller, /easierIcon\.className = "fas fa-arrow-down-short-wide"/);
  assert.match(controller, /harderIcon\.className = "fas fa-arrow-up-short-wide"/);
  assert.match(main, /await import\(`\.\/chat-controller\.js\?v=\$\{chatControllerVersion\}`\)/);
  assert.match(main, /action === "regenerate"[\s\S]*?handleRegenerateProposal\(proposal\)/);
  assert.match(main, /Usa design_activity para regenerar una sola propuesta/);
  assert.match(main, /Vuelve a leer completa la lectura narrativa aprobada/);
  assert.match(html, /<script type="module" data-cache-src="js\/sidebar\.js"><\/script>/);
  assert.doesNotMatch(html, /sidebar\.js\?v=/);
  assert.match(styles, /\.cb-proposal-actions\s*\{[\s\S]*?display:\s*flex;[\s\S]*?margin:\s*12px auto 0;/);
});

test("el botón de nueva unidad es la primera acción del panel aprobado", () => {
  const html = fs.readFileSync(path.join(dirname, "../public/charlyMCPeditor.html"), "utf8");
  const actions = html.match(/<div class="cb-panel-head-actions">([\s\S]*?)<\/div>/)?.[1] || "";
  assert.ok(actions.indexOf('id="cbNewUnitBtn"') < actions.indexOf('id="cbEditAcademicDataBtn"'));
});

test("el panel aprobado permite copiar actividades y exportar formatos editoriales", () => {
  const html = fs.readFileSync(path.join(dirname, "../public/charlyMCPeditor.html"), "utf8");
  const acceptedPanel = fs.readFileSync(path.join(dirname, "../public/charly-brown/accepted-panel.js"), "utf8");
  const exportService = fs.readFileSync(path.join(dirname, "../public/charly-brown/export-service.js"), "utf8");
  assert.match(acceptedPanel, /copyContentForWord/);
  assert.match(acceptedPanel, /data-content-command="edit"/);
  assert.match(acceptedPanel, /ClipboardItem/);
  assert.match(html, /id="cbOpenExportBtn"/);
  assert.match(html, /id="cbExportModal"/);
  assert.match(html, /data-export-format="docx"/);
  assert.match(html, /data-export-format="pdf"/);
  assert.match(html, /data-export-format="idml"/);
  assert.match(exportService, /\/api\/charly-brown\/export/);
  assert.match(exportService, /documentKind: "teacher-notes"/);
  assert.match(html, /notas del maestro se descargarán como archivos separados/);
});

test("Libro nuevo se persiste solo después de aceptar los datos académicos", () => {
  const html = fs.readFileSync(path.join(dirname, "../public/charlyMCPeditor.html"), "utf8");
  const main = fs.readFileSync(path.join(dirname, "../public/charly-brown/main.js"), "utf8");
  const createBlock = main.slice(main.indexOf("async function createNewSession"), main.indexOf("async function openNewUnitModal"));
  assert.match(html, /id="cbUnitDataModalCancel"/);
  assert.match(createBlock, /openUnitDataModal\(\{[\s\S]*mode: "new-session"/);
  assert.ok(createBlock.indexOf("saveSession(next, { create: true })") > createBlock.indexOf("onSave: async"));
  assert.doesNotMatch(createBlock, /store\.setSession\(next\)[\s\S]*openUnitDataModal/);
  assert.match(createBlock, /createInitialUnitForNewBook\(saved\)/);
  const initializationBlock = main.slice(main.indexOf("async function createInitialUnitForNewBook"), main.indexOf("async function openNewUnitModal"));
  assert.match(initializationBlock, /unit: "1"/);
  assert.match(initializationBlock, /pickExactReadingForMeta\(readings, targetMeta\)/);
  assert.match(initializationBlock, /store\.createUnit\(\{/);
  assert.match(initializationBlock, /reading: reading \? toAcceptedReading\(reading\) : null/);
});

test("la lectura inicial puede cambiarse o eliminarse desde la unidad", () => {
  const main = fs.readFileSync(path.join(dirname, "../public/charly-brown/main.js"), "utf8");
  const acceptedPanel = fs.readFileSync(path.join(dirname, "../public/charly-brown/accepted-panel.js"), "utf8");
  assert.match(acceptedPanel, /data-reading-panel-action="open" aria-label="Cambiar lectura"/);
  assert.match(acceptedPanel, /data-reading-panel-action="remove" aria-label="Eliminar lectura"/);
  assert.match(main, /onRemoveReading: removeReading/);
  const removeBlock = main.slice(main.indexOf("function removeReading"), main.indexOf("function toAcceptedReading"));
  assert.match(removeBlock, /store\.useReading\(null\)/);
  assert.match(removeBlock, /Después podrás elegir otra lectura/);
});

test("la automatización exige y utiliza la unidad seleccionada", () => {
  const main = fs.readFileSync(path.join(dirname, "../public/charly-brown/main.js"), "utf8");
  const css = fs.readFileSync(path.join(dirname, "../public/charly-brown/charly-brown.css"), "utf8");
  const block = main.slice(main.indexOf("async function createAutomatedUnit"), main.indexOf("function syncAutomatedUnitButton"));
  assert.match(block, /find\(\(item\) => item\.id === session\.activeUnitId\)/);
  assert.match(block, /store\.useReading\(acceptedReading\)/);
  assert.doesNotMatch(block, /store\.createUnit\(/);
  assert.deepEqual(AUTOMATED_RESOURCE_SELECTIONS, { fichas: false, anexos: false, recortables: false, videos: false });
  assert.match(block, /startProduction\(session\.id, selectedUnit\.id\)/);
  assert.match(block, /producción especializada con Gemini Image no está habilitada/i);
  assert.doesNotMatch(block, /Flujo heredado/);
  assert.doesNotMatch(block, /generateAutomatedActivity/);
  assert.doesNotMatch(block, /store\.acceptResources/);
  assert.doesNotMatch(block, /resourceSelections: \{\}/);
  const generator = fs.readFileSync(path.join(dirname, "../public/charly-brown/unit-generator.js"), "utf8");
  for (const type of ["ficha", "anexo", "recortable", "video"]) {
    assert.match(generator, new RegExp(`data-resource-type=\\"${type}\\"`));
  }
  assert.match(generator, /missingResources: missing/);
  assert.match(generator, /Cada Ficha debe usar internamente la misma estructura HTML de una activity/);
  assert.match(generator, /validateWorksheetResourceStructure/);
  assert.match(css, /\.cb-collapsible\s*\{[\s\S]*?border: none;/);
  assert.match(css, /\.cb-unit-panel-wrap\.is-active > \.cb-unit-group\s*\{[\s\S]*?border: 1px solid/);
});

test("los subtemas aprobados son colapsables, sin borde y con hover", () => {
  const acceptedPanel = fs.readFileSync(path.join(dirname, "../public/charly-brown/accepted-panel.js"), "utf8");
  const css = fs.readFileSync(path.join(dirname, "../public/charly-brown/charly-brown.css"), "utf8");
  assert.match(acceptedPanel, /data-approved-card-toggle/);
  assert.match(acceptedPanel, /data-card-collapsed/);
  assert.match(acceptedPanel, /getActivityToggleLabel\(activity, projectMode, unitSection\)/);
  assert.match(acceptedPanel, /candidates\.map\(normalizeActivitySubtopicTitle\)\.find\(Boolean\)/);
  assert.match(acceptedPanel, /resource\.title \|\| resource\.code \|\| resource\.context/);
  assert.match(acceptedPanel, /title: "Recursos"/);
  assert.doesNotMatch(acceptedPanel, /resources-fichas/);
  assert.match(css, /\.cb-approved-card,[\s\S]*?border: none !important/);
  assert.match(css, /\.cb-approved-card:hover[\s\S]*?background: #f1f3f6/);
  assert.match(css, /\.cb-collapsible:hover > \.cb-collapsible-head/);
});

test("la selección de sección expande todos sus subtemas y conserva sus recursos", () => {
  const main = fs.readFileSync(path.join(dirname, "../public/charly-brown/main.js"), "utf8");
  const html = fs.readFileSync(path.join(dirname, "../public/charlyMCPeditor.html"), "utf8");
  const workflow = normalizeUnitWorkflow({
    activitySections: [{
      section: "Lenguaje y comunicación",
      sectionId: "language-communication",
      category: "Lenguaje y comunicación",
      subtopic: "ComprensionLectora",
      resourceSelections: { fichas: true, anexos: false, recortables: true, videos: false },
      resourcesConfigured: true
    }]
  });
  assert.equal(workflow.activitySections[0].subtopic, "ComprensionLectora");
  assert.deepEqual(workflow.activitySections[0].resourceSelections, { fichas: true, anexos: false, recortables: true, videos: false });
  assert.equal(workflow.activitySections[0].resourcesConfigured, true);
  const expanded = setWorkflowActivitySections({}, [
    { ...workflow.activitySections[0], subtopic: "ComprensionLectora" },
    { ...workflow.activitySections[0], subtopic: "ExpresionOral" }
  ]);
  assert.deepEqual(expanded.activitySections.map((item) => item.subtopic), ["ComprensionLectora", "ExpresionOral"]);
  const marked = markActivitySection(expanded, "Lenguaje y comunicación · Comprensión lectora", "approved", "activity-1", "language-communication", "ComprensionLectora");
  assert.deepEqual(marked.activitySections.map((item) => item.status), ["approved", "pending"]);
  assert.match(html, /continúa sin recurso/);
  assert.doesNotMatch(main, /Selecciona al menos un recurso para crear junto con la actividad/);
  assert.match(html, /Elegir secciones/);
  assert.doesNotMatch(main, /data-activity-section-subtopic/);
  assert.match(main, /getActivitySectionSubtopics\(section\)\.map\(\(subtopic\)/);
  assert.match(main, /configureActivitySectionResources\(input\.value\)/);
  assert.match(main, /renderActivitySectionResourceBadges\(selectedItem\?\.resourceSelections\)/);
  assert.match(main, /data-resource-badge="\$\{key\}"/);
  const css = fs.readFileSync(path.join(dirname, "../public/charly-brown/charly-brown.css"), "utf8");
  for (const resource of ["fichas", "anexos", "recortables", "videos"]) {
    assert.match(css, new RegExp(`data-resource-badge=\\"${resource}\\"`));
  }
  assert.match(main, /resourceTypes=\$\{JSON\.stringify\(resourceTypes\)\}/);
  assert.match(main, /bloques separados para aprobarlos independientemente/);
  assert.match(main, /stripResourceBlocks\(proposal\.html\)/);
});

test("el panel aprobado se limita al viewport y los controles de libros son ligeros", () => {
  const main = fs.readFileSync(path.join(dirname, "../public/charly-brown/main.js"), "utf8");
  const css = fs.readFileSync(path.join(dirname, "../public/charly-brown/charly-brown.css"), "utf8");
  assert.match(css, /grid-template-columns: var\(--cb-sessions-width\) minmax\(0, 1fr\) var\(--cb-accepted-width\)/);
  assert.match(main, /getAcceptedPanelMaximumWidth/);
  assert.match(main, /shell\.clientWidth - horizontalPadding - getSessionsPanelWidth\(\) - MIN_CHAT_WIDTH/);
  assert.match(css, /#cbNewSessionBtn\s*\{[\s\S]*?border: none;[\s\S]*?font-weight: 400;/);
  assert.match(css, /#cbSessionFilterBtn\s*\{[\s\S]*?background: transparent;/);
  assert.match(css, /#cbSessionFilterBtn:hover\s*\{[\s\S]*?border-color: var\(--cb-unit-line\)/);
});

test("el chat evita el límite de tiempo del proxy de Firebase Hosting", () => {
  const client = fs.readFileSync(path.join(dirname, "../public/charly-brown/gemini-client.js"), "utf8");
  assert.match(client, /buildGeminiApiUrl\("\/api\/charly-brown\/chat"\)/);
  assert.match(client, /buildGeminiApiUrl\("\/api\/gemini\/generate"\)/);
  assert.match(client, /buildGeminiApiUrl\("\/api\/charly-brown\/models"\)/);
  assert.doesNotMatch(client, /buildApiUrlPreferRemote\("\/api\/charly-brown\/chat"\)/);
  assert.doesNotMatch(client, /buildApiUrlPreferRemote\("\/api\/gemini\//);
});

test("filtra libros por datos académicos sin modificar la colección", () => {
  const sessions = [
    { id: "s1", meta: { level: "Primaria", grade: "Tercero", trimester: "2", category: "Matemáticas" } },
    { id: "s2", meta: { level: "Primaria", grade: "Cuarto", trimester: "1", category: "Ciencias" } },
    { id: "s3", meta: { level: "Secundaria", grade: "Primero", trimester: "2", category: "Matemáticas" } }
  ];
  const filtered = filterSessionsByAcademicMeta(sessions, { level: "primaria", trimester: "2" });
  assert.deepEqual(filtered.map((session) => session.id), ["s1"]);
  assert.equal(sessions.length, 3);
  assert.deepEqual(getAcademicFilterOptions(sessions).grade, ["Cuarto", "Primero", "Tercero"]);
});

test("cada unidad conserva mensajes y aprobados independientes", () => {
  const store = createStore(createEmptySession({ id: "session" }));
  const first = store.createUnit({ unit: "1" });
  store.addMessage({ role: "user", text: "mensaje uno" });
  store.acceptActivity({ title: "Actividad uno", html: "<div class=\"activity\"></div>" });
  const second = store.createUnit({ unit: "2" });
  store.addMessage({ role: "user", text: "mensaje dos" });
  assert.equal(store.getState().session.messages[0].text, "mensaje dos");
  assert.equal(store.getState().session.accepted.activities.length, 0);
  store.selectUnit(first.id);
  assert.equal(store.getState().session.messages[0].text, "mensaje uno");
  assert.equal(store.getState().session.accepted.activities[0].title, "Actividad uno");
  assert.notEqual(first.id, second.id);
});

test("los datos académicos generales se sincronizan sin cambiar el número de las unidades", () => {
  const store = createStore(createEmptySession({ id: "session" }));
  const first = store.createUnit({ unit: "1" });
  const second = store.createUnit({ unit: "2" });
  store.updateMeta({ level: "Secundaria", grade: "Primero", trimester: "3" });
  const session = store.getState().session;
  assert.equal(session.academicMeta.grade, "Primero");
  assert.deepEqual(session.units.map((unit) => unit.meta.grade), ["Primero", "Primero"]);
  assert.deepEqual(session.units.map((unit) => unit.meta.unit), ["1", "2"]);
  assert.deepEqual(session.units.map((unit) => unit.id), [first.id, second.id]);
});

test("editar una pregunta conserva su identidad y actualiza el contexto", () => {
  const store = createStore(createEmptySession({ id: "session" }));
  store.createUnit({ unit: "1" });
  store.addMessage({ id: "question-1", role: "user", text: "Pregunta original" });
  store.updateMessage("question-1", { text: "Pregunta corregida" });
  const message = store.getState().session.messages[0];
  assert.equal(message.id, "question-1");
  assert.equal(message.text, "Pregunta corregida");
  assert.ok(message.editedAt);
});

test("la edición de preguntas se reenvía con Enter y no muestra botones", () => {
  const controller = fs.readFileSync(path.join(dirname, "../public/charly-brown/chat-controller.js"), "utf8");
  assert.match(controller, /editor\.form\?\.requestSubmit\(\)/);
  assert.match(controller, /event\.key === "Enter" && !event\.shiftKey/);
  assert.match(controller, /rows="4" wrap="soft" aria-label="Editar pregunta"/);
  assert.doesNotMatch(controller, /aria-label="Guardar y enviar pregunta"/);
  assert.doesNotMatch(controller, /aria-label="Cancelar edición"/);
});

test("aprobar una propuesta dirigida no reemplaza otros recursos", () => {
  const store = createStore(createEmptySession({ id: "session" }));
  const unit = store.createUnit({ unit: "4" });
  store.acceptActivity({ id: "existing", title: "Existente", html: "<p>Uno</p>" });
  const revision = store.getState().session.units[0].revision;
  const proposal = { id: "p1", createdBy: "charly-mcp", targetUnitId: unit.id, baseRevision: revision, action: "create", contentType: "activity", title: "Nueva", html: "<p>Dos</p>" };
  store.addProposal(proposal);
  const outcome = store.applyContentProposal({ ...proposal, baseRevision: revision });
  assert.equal(outcome.ok, true);
  assert.deepEqual(store.getState().session.accepted.activities.map((item) => item.title), ["Existente", "Nueva"]);
});

test("una nota del maestro creada desde texto se aprueba y se puede editar sin actividad aprobada", () => {
  const store = createStore(createEmptySession({ id: "session" }));
  const unit = store.createUnit({ unit: "4" });
  const create = {
    id: "source-note-create", targetUnitId: unit.id, baseRevision: store.getState().session.units[0].revision,
    action: "create", contentType: "teacher-note", title: "Explorar el agua", subtopic: "El agua",
    html: "<h3>Explorar el agua</h3><p>Invite al grupo a observar.</p>",
    artifact: { noteMode: "source", sourceKind: "activity" }
  };
  store.addProposal(create);
  assert.equal(store.applyContentProposal(create).ok, true);
  const note = store.getState().session.accepted.teacherNotes[0];
  assert.equal(note.mode, "source");
  assert.equal(note.activityId, "");
  assert.equal(note.subtopic, "El agua");
  const update = {
    ...create, id: "source-note-update", action: "update", targetContentId: note.id,
    baseRevision: store.getState().session.units[0].revision,
    html: "<h3>Explorar el agua</h3><p>Guíe una conversación.</p>"
  };
  store.addProposal(update);
  assert.equal(store.applyContentProposal(update).ok, true);
  assert.equal(store.getState().session.accepted.teacherNotes.length, 1);
  assert.match(store.getState().session.accepted.teacherNotes[0].html, /Guíe una conversación/);
});

test("aprobar una actividad conserva el contrato que usarán los especialistas", () => {
  const store = createStore(createEmptySession({ id: "session" }));
  const unit = store.createUnit({ unit: "5" });
  const specification = {
    type: "annex", code: "Anexo 5a", mechanic: "comparar escenas", useInstruction: "Analiza el Anexo 5a.",
    studentAction: "Compara y explica.", requiredElements: ["río limpio", "río contaminado"],
    visualBrief: "Dos escenas editoriales comparables del mismo río.", expectedProduct: "Comparación oral argumentada.",
    placement: { mode: "consult-alongside-activity", baseProvidedBy: "resource", zoneDescription: "Durante el segundo paso." }
  };
  const proposal = {
    id: "planned-activity", targetUnitId: unit.id, baseRevision: store.getState().session.units[0].revision,
    action: "create", contentType: "activity", title: "Compara el río", html: "<div class=\"activity\"></div>",
    artifact: { resourceSpecifications: [specification] }
  };
  store.addProposal(proposal);
  assert.equal(store.applyContentProposal(proposal).ok, true);
  const accepted = store.getState().session.accepted.activities.find((activity) => activity.title === "Compara el río");
  assert.deepEqual(accepted?.resourceSpecifications, [specification]);
});

test("el navegador no reescribe la unidad mientras los workers guardan checkpoints", () => {
  const main = fs.readFileSync(path.join(dirname, "../public/charly-brown/main.js"), "utf8");
  assert.match(main, /activeUnit\?\.automation\?\.status === "running"/);
  assert.match(main, /unitAutomationRun\?\.persistentId/);
  assert.match(main, /Autoguardado aplazado: la producción posee la unidad activa/);
});

test("una pestaña obsoleta no puede sobrescribir recursos creados por los especialistas", () => {
  const storage = fs.readFileSync(path.join(dirname, "../public/charly-brown/sessions-store.js"), "utf8");
  const main = fs.readFileSync(path.join(dirname, "../public/charly-brown/main.js"), "utf8");
  assert.match(storage, /serverRev !== clientRev/);
  assert.match(storage, /conflict\.code = "REVISION_CONFLICT"/);
  assert.doesNotMatch(storage, /Math\.max\(serverRev, clientRev\) \+ 1/);
  assert.match(main, /stale session write prevented/);
  assert.match(main, /La sesión se actualizó con la versión más reciente del servidor/);
});

test("el guardado compacta alias, artefactos duplicados y SVG heredados", () => {
  const storage = fs.readFileSync(path.join(dirname, "../public/charly-brown/sessions-store.js"), "utf8");
  const state = fs.readFileSync(path.join(dirname, "../public/charly-brown/state.js"), "utf8");
  assert.match(storage, /reading: null/);
  assert.match(storage, /delete artifact\.assets/);
  assert.match(storage, /delete artifact\.resourceSpecifications/);
  assert.match(storage, /<svg\\b\[\\s\\S\]\*\?<\\\/svg>/);
  assert.match(state, /raw\.reading \|\| raw\.accepted\?\.reading/);
  assert.match(state, /raw\.sya \|\| raw\.accepted\?\.sya/);
});

test("migra la raíz heredada sin perder conversación", () => {
  const session = normalizeSession({ id: "old", meta: { unit: "5" }, messages: [{ role: "user", text: "conservar" }], accepted: { activities: [{ id: "a", html: "<p>A</p>" }] } });
  assert.equal(session.units.length, 1);
  assert.equal(session.messages[0].text, "conservar");
  assert.equal(session.accepted.activities[0].id, "a");
});

test("lectura, sinónimos y comprensión actualizan un solo recurso", () => {
  const store = createStore(createEmptySession({ id: "session" }));
  const unit = store.createUnit({ unit: "1", readingMode: "chat" });
  let revision = store.getState().session.units[0].revision;
  const stages = [
    { id: "p-reading", readingStage: "reading", action: "create", html: "<h2>El agua</h2><p>Texto.</p>" },
    { id: "p-synonyms", readingStage: "synonyms", action: "update", html: "<table><tr><td>agua</td><td>líquido</td></tr></table>" },
    { id: "p-questions", readingStage: "comprehension", action: "update", html: "<ol><li>¿Qué ocurre?</li></ol>" }
  ];
  stages.forEach((stage) => {
    const proposal = { ...stage, targetUnitId: unit.id, targetContentId: store.getState().session.accepted.reading?.id || "", baseRevision: revision, contentType: "reading", title: "El agua" };
    store.addProposal(proposal);
    assert.equal(store.applyContentProposal(proposal).ok, true);
    revision = store.getState().session.units[0].revision;
  });
  const session = store.getState().session;
  assert.equal(session.accepted.reading.title, "El agua");
  assert.match(session.accepted.reading.sections.synonymsHtml, /table/);
  assert.match(session.accepted.reading.sections.questionsHtml, /ol/);
  assert.equal(getNextWorkflowStep(session.units[0].workflow).kind, "activity-selection");
});

test("selección múltiple conserva orden y actividad aprobada", () => {
  const store = createStore(createEmptySession({ id: "session" }));
  store.createUnit({ unit: "2", readingMode: "none" });
  store.setActivitySections([
    { sectionId: "experimental-sciences", section: "Ciencias experimentales", description: "Indagación." },
    { sectionId: "mathematics", section: "Matemáticas", description: "Problemas." }
  ]);
  const first = getNextWorkflowStep(store.getState().session.units[0].workflow);
  assert.equal(first.section, "Ciencias experimentales");
  assert.equal(first.sectionId, "experimental-sciences");
  store.acceptActivity({ id: "science", sectionId: "experimental-sciences", section: "Ciencias y laboratorio", html: "<div class=\"activity\"></div>" });
  assert.equal(getNextWorkflowStep(store.getState().session.units[0].workflow).section, "Matemáticas");
  assert.equal(store.getState().session.accepted.activities[0].sectionId, "experimental-sciences");
});

test("bibliografía agrupa contenido aprobado y deduplica DOI", () => {
  const session = normalizeSession({
    id: "sources", schemaVersion: 3, activeUnitId: "u1", academicMeta: {},
    units: [{ id: "u1", title: "Unidad 1", meta: { unit: "1" }, accepted: {
      activities: [{ id: "a1", citations: [{ title: "Artículo", authors: ["López, W."], year: 2024, doi: "10.1000/test", url: "https://doi.org/10.1000/test" }] }],
      resources: [{ id: "r1", activityId: "a1", citations: [{ title: "Artículo", authors: ["López, W."], year: 2024, doi: "10.1000/test", url: "https://doi.org/10.1000/test" }] }]
    }}]
  });
  const bibliography = collectSessionBibliography(session);
  assert.equal(bibliography.length, 1);
  assert.match(bibliography[0].apa, /López/);
  assert.equal(bibliography[0].links.length, 2);
});

test("las unidades muestran acciones para editar y eliminar sin perder la unidad vecina", () => {
  const html = fs.readFileSync(path.join(dirname, "../public/charlyMCPeditor.html"), "utf8");
  const acceptedPanel = fs.readFileSync(path.join(dirname, "../public/charly-brown/accepted-panel.js"), "utf8");
  const css = fs.readFileSync(path.join(dirname, "../public/charly-brown/charly-brown.css"), "utf8");
  assert.match(html, /<p class="cb-panel-kicker">Actividades aprobadas<\/p>/);
  assert.match(acceptedPanel, /class="cb-unit-header-actions"/);
  assert.match(acceptedPanel, /data-unit-action="edit"/);
  assert.match(acceptedPanel, /data-unit-action="remove"/);
  assert.match(acceptedPanel, /actions: `<div class="cb-unit-header-actions"/);
  assert.match(css, /\.cb-unit-panel-wrap:hover \.cb-unit-header-actions/);

  const store = createStore(createEmptySession({ id: "session" }));
  const first = store.createUnit({ unit: "1", title: "Inicial" });
  const second = store.createUnit({ unit: "2", title: "Siguiente" });
  assert.equal(store.updateUnit(first.id, { unit: "3", title: "Editada" }), true);
  assert.equal(store.getState().session.units[0].title, "Editada");
  assert.equal(store.getState().session.units[0].meta.unit, "3");
  assert.equal(store.removeUnit(second.id), true);
  assert.equal(store.getState().session.activeUnitId, first.id);
});

test("la automatización usa toda la secuencia y deja secciones y subtemas contraídos", () => {
  const main = fs.readFileSync(path.join(dirname, "../public/charly-brown/main.js"), "utf8");
  const sya = fs.readFileSync(path.join(dirname, "../public/charly-brown/sya-service.js"), "utf8");
  const acceptedPanel = fs.readFileSync(path.join(dirname, "../public/charly-brown/accepted-panel.js"), "utf8");
  assert.match(main, /getCompleteSyaGroupedByCategory/);
  assert.match(main, /buildAutomatedActivityQueue\(groups, \{ unit \}\)/);
  assert.match(main, /startProduction\(session\.id, selectedUnit\.id\)/);
  assert.doesNotMatch(main, /function generateAutomatedActivity/);
  assert.match(sya, /export function getCompleteSyaGroupedByCategory/);
  assert.match(sya, /fields\.T \|\| fallbackFields\.T/);
  assert.match(acceptedPanel, /openByDefault = false/);
  assert.match(acceptedPanel, /getCollapsedState\(`approved-card-\$\{collapseKey\}`, true\)/);
});

test("el modal de lecturas carga y separa todas las lecturas ASC y nuevas", () => {
  const main = fs.readFileSync(path.join(dirname, "../public/charly-brown/main.js"), "utf8");
  const service = fs.readFileSync(path.join(dirname, "../public/charly-brown/reading-service.js"), "utf8");
  const openBlock = main.slice(main.indexOf("async function openReadingsModal"), main.indexOf("function closeReadingsModal"));
  assert.match(openBlock, /limit: 0, includeAll: true/);
  assert.match(main, /id: "lecturasASC", label: "Lecturas ASC"/);
  assert.match(main, /id: "lecturasNuevas", label: "Lecturas nuevas"/);
  assert.match(main, /data-reading-ref=/);
  assert.match(service, /Number\(limit\) > 0 \? ranked\.slice/);
  assert.match(service, /normalizeKey\(item\.collection\)/);
});

test("editar comprensión conserva nivel taxonómico, criterio y respuesta", () => {
  const main = fs.readFileSync(path.join(dirname, "../public/charly-brown/main.js"), "utf8");
  const css = fs.readFileSync(path.join(dirname, "../public/charly-brown/charly-brown.css"), "utf8");
  assert.match(main, /data-question-field="nivel"/);
  assert.match(main, /data-question-field="criterio"/);
  assert.match(main, /data-question-field="respuesta"/);
  assert.match(main, /parseReadingQuestionsEditorHtml\(nextHtml\)/);
  assert.match(main, /next\.sections\.questions = questions/);
  assert.match(main, /next\.questions = questions/);
  assert.match(css, /\.cb-collapsible-toggle\s*\{[\s\S]*?background: #f0f9ff;/);
});

test("el editor enriquecido tiene scroll vertical y encabezado modal compacto", () => {
  const html = fs.readFileSync(path.join(dirname, "../public/charlyMCPeditor.html"), "utf8");
  const css = fs.readFileSync(path.join(dirname, "../public/charly-brown/charly-brown.css"), "utf8");
  assert.doesNotMatch(html, /id="cbSyaModalSubtitle"/);
  assert.match(css, /\.cb-rich-text-field \.trumbowyg-editor,[\s\S]*?overflow-y: auto !important;/);
  assert.match(css, /\.cb-rich-text-field \.trumbowyg-editor-box\s*\{[\s\S]*?overflow: hidden;/);
  assert.match(css, /\.cb-modal-header h2\s*\{[\s\S]*?font-size: 16px;[\s\S]*?font-weight: 400;/);
});

test("las acciones de unidad usan color y el modal S&A no tiene kicker ni toolbar", () => {
  const html = fs.readFileSync(path.join(dirname, "../public/charlyMCPeditor.html"), "utf8");
  const css = fs.readFileSync(path.join(dirname, "../public/charly-brown/charly-brown.css"), "utf8");
  assert.doesNotMatch(html, /id="cbSyaModalKicker"/);
  assert.doesNotMatch(html, /class="cb-sya-toolbar"/);
  assert.match(css, /\[data-unit-action="edit"\]\s*\{[\s\S]*?background: #0284c7;[\s\S]*?color: #fff;/);
  assert.match(css, /\[data-unit-action="remove"\]\s*\{[\s\S]*?background: #dc2626;[\s\S]*?color: #fff;/);
  assert.match(css, /\.cb-modal--rich-editor #cbSyaSectionCreate\s*\{[\s\S]*?display: none;/);
});

test("las acciones colapsables son transparentes y se ocultan al contraer", () => {
  const css = fs.readFileSync(path.join(dirname, "../public/charly-brown/charly-brown.css"), "utf8");
  assert.match(css, /\.cb-collapsible-actions\s*\{[\s\S]*?background: transparent !important;/);
  assert.match(css, /\.cb-collapsible\[data-collapsed="true"\] > \.cb-collapsible-head > \.cb-collapsible-actions\s*\{[\s\S]*?display: none;/);
});

test("las lecturas recuperan y muestran un título aunque el campo principal esté vacío", () => {
  const service = fs.readFileSync(path.join(dirname, "../public/charly-brown/reading-service.js"), "utf8");
  const acceptedPanel = fs.readFileSync(path.join(dirname, "../public/charly-brown/accepted-panel.js"), "utf8");
  assert.match(service, /row\.tituloLectura/);
  assert.match(service, /row\.rawData\?\.campos\?\.titulo/);
  assert.match(service, /extractReadingTitleFromHtml/);
  assert.match(service, /inferReadingTitleFromText/);
  assert.match(acceptedPanel, /renderReadingContentTitle\(reading\.title, readingHtml\)/);
  assert.match(acceptedPanel, /class="cb-reading-content-title"/);
  assert.match(acceptedPanel, /inferReadingContentTitle/);
});

test("la selección de secciones conserva el orden de los clics y lo numera", () => {
  const main = fs.readFileSync(path.join(dirname, "../public/charly-brown/main.js"), "utf8");
  const css = fs.readFileSync(path.join(dirname, "../public/charly-brown/charly-brown.css"), "utf8");
  assert.match(main, /if \(input\.checked\) await configureActivitySectionResources\(input\.value\)/);
  assert.match(main, /pendingActivitySections\.push\(\.\.\.subtopics\.map/);
  assert.match(main, /class="cb-activity-section-order"/);
  assert.match(main, /aria-label="Orden \$\{order\}"/);
  assert.match(main, /const selected = refreshPendingActivitySections\(\)/);
  assert.match(css, /\.cb-activity-section-order\s*\{[\s\S]*?border-radius: 50%;/);
  assert.match(css, /\.cb-reading-content-title\s*\{[\s\S]*?font-size: 15px;[\s\S]*?font-weight: 500;/);
});

test("el header usa solo la automatización para generar actividades", () => {
  const html = fs.readFileSync(path.join(dirname, "../public/charlyMCPeditor.html"), "utf8");
  const main = fs.readFileSync(path.join(dirname, "../public/charly-brown/main.js"), "utf8");
  assert.match(html, /id="cbAutomateUnitBtn"/);
  assert.doesNotMatch(html, /title="Generar actividades"/);
  assert.doesNotMatch(html, /data-chat-action="activities"/);
  assert.doesNotMatch(main, /const generateBtn = document\.querySelector\('\[data-chat-action="activities"\]'\)/);
});

test("las acciones del panel tienen colores semánticos y el header de libros es compacto", () => {
  const html = fs.readFileSync(path.join(dirname, "../public/charlyMCPeditor.html"), "utf8");
  const css = fs.readFileSync(path.join(dirname, "../public/charly-brown/charly-brown.css"), "utf8");
  assert.match(html, /id="cbGenerateGlobalNotesBtn"[\s\S]*?<span>NM<\/span>/);
  assert.match(css, /\.cb-panel-head\.cb-panel-head--sessions\s*\{[\s\S]*?min-height: 42px;[\s\S]*?padding: 5px 8px;/);
  assert.match(css, /#cbNewUnitBtn\s*\{[\s\S]*?--cb-action-color: #059669;/);
  assert.match(css, /#cbEditAcademicDataBtn\s*\{[\s\S]*?--cb-action-color: #7c3aed;/);
  assert.match(css, /#cbOpenReadingsBtn\s*\{[\s\S]*?--cb-action-color: #d97706;/);
  assert.match(css, /#cbOpenSyaBtn\s*\{[\s\S]*?--cb-action-color: #0284c7;/);
  assert.match(css, /#cbGenerateGlobalNotesBtn\s*\{[\s\S]*?--cb-action-color: #db2777;/);
});

test("la automatización es una acción limpia con indicador circular en el icono", () => {
  const css = fs.readFileSync(path.join(dirname, "../public/charly-brown/charly-brown.css"), "utf8");
  assert.match(css, /\.cb-automation-button\s*\{[\s\S]*?border: 0;[\s\S]*?background: transparent;/);
  assert.match(css, /\.cb-automation-button::after\s*\{[\s\S]*?width: 22px;[\s\S]*?border-radius: 50%;[\s\S]*?animation: cb-specifications-pointer 7s ease-out infinite;/);
  assert.match(css, /\.cb-automation-button:hover,[\s\S]*?background: var\(--cb-unit-accent\);/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*?\.cb-automation-button::after/);
});

test("la automatización utiliza el nuevo modal de progreso con escenario de agentes y card compacta", () => {
  const html = fs.readFileSync(path.join(dirname, "../public/charlyMCPeditor.html"), "utf8");
  const accepted = fs.readFileSync(path.join(dirname, "../public/charly-brown/accepted-panel.js"), "utf8");
  const prodClient = fs.readFileSync(path.join(dirname, "../public/charly-brown/production-client.js"), "utf8");
  const main = fs.readFileSync(path.join(dirname, "../public/charly-brown/main.js"), "utf8");
  const css = fs.readFileSync(path.join(dirname, "../public/charly-brown/charly-brown.css"), "utf8");

  // 1. Modal en HTML
  assert.match(html, /id="cbProductionProgressModal"/);
  assert.match(html, /id="cbProductionProgress"/);

  // 2. Card compacta en accepted-panel.js
  assert.match(accepted, /class="cb-automation-spinner-panel cb-compact-automation-card"/);
  assert.match(accepted, /id="cbOpenProductionModalBtn"/);
  assert.match(accepted, /cb:open-production-modal/);

  // 3. Portadas de agentes en STAGE_META
  assert.match(prodClient, /agentePrimero\.png/);
  assert.match(prodClient, /agenteSegundo\.png/);
  assert.match(prodClient, /agenteTercero\.png/);
  assert.match(prodClient, /agenteCuarto\.png/);
  assert.match(prodClient, /agenteQuinto\.png/);
  assert.match(prodClient, /agentesexto\.png/);
  assert.match(prodClient, /cb-solo-agent-stage/);
  assert.match(prodClient, /cb-solo-celebration-stage/);

  // 4. Control del modal en main.js
  assert.match(main, /function openProductionProgressModal\(\)/);
  assert.match(main, /function closeProductionProgressModal\(\)/);
  assert.match(main, /bindProductionProgressModalControls/);

  // 5. Estilos en CSS
  assert.match(css, /\.cb-compact-automation-card/);
  assert.match(css, /\.cb-modal-panel--production/);
  assert.match(css, /\.cb-solo-agent-stage/);
  assert.match(css, /\.cb-solo-celebration-stage/);
});
