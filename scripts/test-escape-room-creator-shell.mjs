import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/PigPenCreator.html",
  "utf8"
);

const css = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/PigPenCreator.css",
  "utf8"
);

const js = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/js/PigPenCreator.js",
  "utf8"
);

assert.match(
  html,
  /class="er-brief-panel er-studio-dock is-open" id="briefCollapse"/,
  "El brief debe vivir en el dock derecho sin perder su ID histórico."
);

assert.match(
  html,
  /id="erBriefResizeHandle"[^>]*role="separator"[^>]*aria-valuemin="280"[^>]*aria-valuemax="560"[^>]*aria-valuenow="340"/,
  "El brief debe exponer un separador de resize accesible."
);

assert.match(
  html,
  /id="erInspectorPanel"[\s\S]*data-er-inspector-tab="content"[\s\S]*data-er-inspector-tab="rooms"/,
  "El subpanel debe ofrecer las pestañas Contenido y Salas."
);
assert.doesNotMatch(
  html.match(/id="erInspectorPanel"[\s\S]*?<div class="er-inspector-tabs"/)?.[0] || "",
  />Proyecto<|<h2>Contenido<\/h2>/,
  "El subpanel no debe desperdiciar una cabecera con Proyecto y Contenido."
);

assert.match(
  html,
  /id="btnNewSession" class="er-button er-button-compact er-new-session-button"[\s\S]*?<span>Nueva sesión<\/span>/,
  "Nueva sesión debe volver al botón textual claro de ancho completo."
);
assert.doesNotMatch(
  html.match(/<aside class="er-sessions-panel"[\s\S]*?<div class="er-session-current">/)?.[0] || "",
  />Sesiones<|>Mis sesiones</,
  "El panel de sesiones no debe conservar los dos títulos redundantes."
);

assert.match(
  html,
  /id="erMissionWorkspacePanel"[\s\S]*id="missionEditorList"/,
  "El editor de una sala debe abrirse como panel del workspace central."
);
assert.ok(
  html.indexOf('id="erMissionWorkspacePanel"') < html.indexOf('class="er-card er-output-card"'),
  "La sala seleccionada debe renderizarse arriba del bloque Preview/JSON."
);
assert.doesNotMatch(html, /data-er-tab="mission"/, "La sala no debe incrustarse como pestaña dentro del preview.");

assert.match(
  html,
  /id="preguntasPorSalaInput"/,
  "El creador debe permitir definir cuántas preguntas internas se generan por sala."
);

assert.match(
  html,
  /id="modoPresentacionSelect"[\s\S]*value="salas"[\s\S]*value="menu_secciones"/,
  "El brief debe permitir elegir entre el recorrido por salas y el menú por secciones."
);

for (const fieldId of [
  "generalTitleInput",
  "generalSubtitleInput",
  "generalIntroductionInput",
  "generalInstructionsInput",
  "generalConclusionInput"
]) {
  assert.match(
    html,
    new RegExp(`id="${fieldId}"[\\s\\S]*?data-project-field=`),
    `El editor general debe registrar el campo ${fieldId}.`
  );
}

assert.match(
  css,
  /@media \(min-width: 1024px\)[\s\S]*grid-template-columns:[\s\S]*var\(--er-sessions-width\)[\s\S]*var\(--er-inspector-track\)[\s\S]*var\(--er-brief-track\)/,
  "El workspace debe distribuir sesiones, canvas, subpanel y brief en escritorio."
);
assert.ok(
  html.indexOf('class="er-card er-summary-card"') < html.indexOf('id="erStudioWorkspace"'),
  "La barra principal debe quedar fuera y encima del workspace multipanel."
);
assert.match(
  css,
  /\.er-summary-card\s*\{[\s\S]*position:\s*sticky[\s\S]*top:\s*var\(--cb-header-height[\s\S]*width:\s*100%/,
  "La barra principal debe flotar arriba y ocupar todo el ancho disponible."
);
assert.match(
  css,
  /top:\s*calc\(var\(--cb-header-height, 64px\) \+ var\(--er-summary-height\)\)[\s\S]*height:\s*calc\(100vh - var\(--cb-header-height, 64px\) - var\(--er-summary-height\)\)/,
  "Los paneles de escritorio deben comenzar debajo de la barra principal."
);
assert.match(
  css,
  /\.er-studio-shell > \.er-inspector-panel\s*\{\s*grid-column:\s*3[\s\S]*\.er-studio-shell > \.er-brief-panel\s*\{\s*grid-column:\s*4/,
  "El brief debe conservar su cuarta columna aunque el subpanel esté cerrado."
);
assert.doesNotMatch(
  html,
  /data-studio-panel-close|fa-xmark/,
  "Brief y subpanel no deben mostrar botones X; se controlan exclusivamente desde el header."
);
assert.doesNotMatch(
  js,
  /panelCloseButtons|data\.studioPanelClose/,
  "El creador no debe registrar listeners redundantes para cierres X inexistentes."
);
assert.match(
  html,
  /er-panel-icon-button[^\"]*"[^>]*data-studio-panel-toggle="inspector"[^>]*data-er-tooltip="Abrir panel de contenido"[\s\S]*er-panel-icon-button[^\"]*"[^>]*data-studio-panel-toggle="brief"[^>]*data-er-tooltip="Abrir brief"/,
  "Los toggles de panel deben ser iconos con tooltips accesibles."
);
assert.doesNotMatch(
  html.match(/<div class="er-summary-actions">[\s\S]*?<button type="button" id="btnModelConfig"/)?.[0] || "",
  /<span>Contenido<\/span>|<span>Brief<\/span>/,
  "Los toggles de panel no deben mostrar texto visible."
);
for (const commandId of [
  "btnModelConfig",
  "btnExportar",
  "btnSugerirObjetivo",
  "btnGenerar",
  "btnLimpiar",
  "btnCopiarJson",
  "btnRepairEscapeRoom",
  "btnPreviewAutofill",
  "btnPreviewTheme",
  "btnAddMission"
]) {
  const commandMarkup = html.match(new RegExp(`<button[^>]*id="${commandId}"[^>]*>[\\s\\S]*?<\\/button>`))?.[0] || "";
  assert.match(commandMarkup, /class="[^"]*er-studio-icon-button/, `${commandId} debe usar el comando icónico unificado.`);
  assert.match(commandMarkup, /data-er-tooltip="[^"]+"/, `${commandId} debe mostrar su nombre en un tooltip.`);
  assert.match(commandMarkup, /aria-label="[^"]+"/, `${commandId} debe conservar un nombre accesible.`);
  const visibleCommandMarkup = commandMarkup.replace(/<span[^>]*class="[^"]*visually-hidden[^"]*"[^>]*>[\s\S]*?<\/span>/g, "");
  assert.doesNotMatch(visibleCommandMarkup, /<span\b/, `${commandId} no debe mostrar texto visible.`);
}
assert.match(
  html,
  /data-er-inspector-tab="content"[^>]*>Contenido general<\/button>[\s\S]*data-er-inspector-tab="rooms"[^>]*>Salas<\/button>/,
  "Las pestañas Contenido general y Salas deben volver a mostrar texto."
);
assert.match(
  css,
  /\.er-panel-icon-button,[\s\S]*\.er-studio-icon-button\s*\{[\s\S]*border:\s*0 !important[\s\S]*background:\s*transparent !important/,
  "Todos los comandos del estudio deben compartir el estilo sin borde ni fondo."
);
assert.match(
  css,
  /\[data-er-tooltip\]::after\s*\{[\s\S]*content:\s*attr\(data-er-tooltip\)[\s\S]*opacity:\s*0[\s\S]*\[data-er-tooltip\]:hover::after/,
  "Los nombres deben aparecer como tooltip al hacer hover."
);

assert.match(
  css,
  /@media \(max-width: 1023px\)[\s\S]*\.er-studio-shell > \.er-studio-dock[\s\S]*position:\s*fixed[\s\S]*transform:\s*translateX\(105%\)/,
  "Los paneles derechos deben convertirse en drawers adaptativos."
);

assert.match(
  js,
  /PROJECT_STORAGE_KEY/,
  "El creador debe persistir el proyecto editable en localStorage."
);

assert.match(
  js,
  /data-question-card|renderQuestionCard\(/,
  "El creador debe renderizar y editar todas las preguntas internas de cada sala."
);
assert.match(
  js,
  /er-icon-button er-studio-icon-button[^>]*data-question-action="regenerate-question"[^>]*data-er-tooltip="Regenerar pregunta"/,
  "Las acciones dinámicas de preguntas deben usar el mismo comando icónico y tooltip."
);
assert.match(
  js,
  /er-button er-studio-icon-button[^>]*data-action="add-question"[^>]*data-er-tooltip="Añadir pregunta"/,
  "Las acciones dinámicas de salas deben usar el mismo comando icónico y tooltip."
);
assert.match(
  js,
  /fieldPath === "respuesta_correcta"[\s\S]*question\.respuesta_correcta = nextCorrect[\s\S]*question\.respuestas_aceptadas = replacePrimaryAcceptedAnswer\([\s\S]*previousCorrect[\s\S]*nextCorrect/,
  "Editar la respuesta correcta debe sincronizar la configuración usada por preview y export."
);
assert.match(
  js,
  /fieldPath === "respuestas_aceptadas"[\s\S]*question\.respuesta_correcta = acceptedAnswers\[0\] \|\| ""[\s\S]*scheduleOutputRefresh\(\)/,
  "Editar las respuestas aceptadas debe mantener una respuesta canónica coherente."
);

assert.match(
  js,
  /function handlePresentationModeChange\(\)[\s\S]*modo_presentacion:\s*nextMode[\s\S]*remapGenericMissionPresentation/,
  "Cambiar de formato debe actualizar la presentación sin reconstruir el contenido de las actividades."
);

for (const behavior of [
  "mountStudioPanels",
  "wireBriefResizer",
  "syncStudioPanels",
  "setInspectorTab",
  "selectMissionById",
  "selectQuestionById",
  "toggleMissionQuestions",
  "wireMissionNavigatorEvents"
]) {
  assert.match(js, new RegExp(`function ${behavior}\\(`), `Debe implementarse ${behavior}.`);
}

assert.match(
  js,
  /BRIEF_WIDTH_STORAGE_KEY[\s\S]*ArrowLeft[\s\S]*ArrowRight[\s\S]*dblclick/,
  "El resize debe persistirse y admitir teclado y doble clic."
);

assert.match(
  js,
  /function renderMissionNavigator\(\)[\s\S]*data-mission-expand[\s\S]*data-question-select/,
  "Cada sala debe desplegar su lista navegable de preguntas."
);

assert.match(
  js,
  /selectedQuestionIndex >= 0[\s\S]*renderQuestionCard\(selectedIndex, selectedQuestionIndex/,
  "Seleccionar una pregunta debe renderizar únicamente su editor en el workspace."
);

assert.match(css, /\.er-new-session-button\s*\{[\s\S]*width:\s*100%[\s\S]*background:\s*#eef5ff/, "Nueva sesión debe ser claro y ocupar todo el panel.");
assert.match(
  css,
  /\.er-session-list\s*\{[\s\S]*height:\s*100%[\s\S]*min-height:\s*0[\s\S]*flex:\s*1 1 100%[\s\S]*overflow-x:\s*hidden[\s\S]*border:\s*0[\s\S]*box-shadow:\s*none/,
  "La lista de sesiones debe llenar la altura disponible sin dibujar un recuadro ni scrollbar horizontal."
);
assert.match(
  css,
  /\.er-studio-shell > \.er-sessions-panel\s*\{[\s\S]*border:\s*0[\s\S]*box-shadow:\s*none/,
  "El panel completo de sesiones no debe mostrar una caja exterior."
);
assert.match(
  css,
  /\.er-studio-shell \.er-output-card\s*\{[\s\S]*width:\s*100%[\s\S]*padding:\s*0[\s\S]*border-radius:\s*0/,
  "La card del preview debe ocupar todo el ancho sin padding ni esquinas redondeadas."
);
assert.match(
  css,
  /\.er-studio-shell \.er-preview-frame-wrap\s*\{[\s\S]*width:\s*100%[\s\S]*height:\s*calc\(100vh[\s\S]*padding:\s*0[\s\S]*border-radius:\s*0/,
  "El contenedor del preview debe usar toda la altura disponible y quedar edge-to-edge."
);
assert.match(
  css,
  /\.er-studio-shell \.er-preview-frame\s*\{[\s\S]*width:\s*100%[\s\S]*height:\s*100%[\s\S]*padding:\s*0[\s\S]*border-radius:\s*0/,
  "El iframe del preview debe llenar su contenedor sin espacios laterales."
);
assert.match(
  css,
  /\.er-studio-shell > \.er-main-column\s*\{\s*padding:\s*0;\s*\}/,
  "La columna principal debe terminar con un override sin padding en todos los breakpoints."
);
const objectiveBlockIndex = html.indexOf('<div class="er-field er-field-objective">');
const objectiveSuggestionIndex = html.indexOf('id="btnSugerirObjetivo"', objectiveBlockIndex);
const objectiveInputIndex = html.indexOf('id="objetivoInput"', objectiveBlockIndex);
assert.ok(
  objectiveBlockIndex >= 0 && objectiveSuggestionIndex > objectiveBlockIndex && objectiveInputIndex > objectiveSuggestionIndex,
  "Sugerir objetivo debe mostrarse dentro del bloque y arriba del campo Objetivo final."
);
assert.match(css, /\.er-mission-nav-questions\s*\{[\s\S]*grid-column:\s*1 \/ -1/, "Las preguntas desplegadas deben quedar anidadas bajo su sala.");

assert.match(
  js,
  /activeDrawer[\s\S]*studioBackdrop[\s\S]*event\.key === "Escape"/,
  "Los drawers deben ser exclusivos, cerrarse con backdrop y responder a Escape."
);

const sessionRenderer = js.match(/function renderSessionList\(\) \{([\s\S]*?)\n\}/)?.[1] || "";
assert.match(sessionRenderer, /er-session-title-button[\s\S]*data-session-menu-toggle/, "Cada sesión debe mostrar título directo y menú de tres puntos.");
assert.doesNotMatch(sessionRenderer, /er-session-open|er-session-item-meta|>Activa</, "La fila no debe renderizar Abrir, metadata ni el badge Activa.");

assert.match(
  js,
  /function buildMenuSectionsPrompt\([\s\S]*"modo_presentacion": "menu_secciones"[\s\S]*"instrucciones"/,
  "La generación del menú debe solicitar el modo y las instrucciones editables."
);

assert.match(
  css,
  /\.er-general-content-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
  "El editor general debe usar una grilla responsive integrada al diseño actual."
);

console.log("PigPenCreator shell OK.");
