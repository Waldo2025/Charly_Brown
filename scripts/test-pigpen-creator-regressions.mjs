import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/PigPenCreator.html",
  "utf8"
);
const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/js/PigPenCreator.js",
  "utf8"
);
const styles = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/PigPenCreator.css",
  "utf8"
);

assert.match(
  html,
  /id="trimestreSelect"/,
  "El brief debe incluir un selector de trimestre."
);

assert.match(
  html,
  /id="materiaSelect"/,
  "El brief debe incluir un selector de materia."
);

assert.match(
  html,
  /id="unidadTemaLabel"[\s\S]*id="unidadTemaSelect"[\s\S]*<option value="1">1<\/option>/,
  "El brief debe incluir un selector adaptativo para unidad o tema."
);

assert.match(
  html,
  /id="estacionField"[\s\S]*id="estacionSelect"/,
  "El brief debe incluir un selector de estación para secundaria."
);

assert.match(
  html,
  /<form id="escapeRoomForm"[^>]*\bnovalidate\b/,
  "La validación nativa no debe bloquear silenciosamente el flujo controlado de generación."
);

assert.match(
  source,
  /elements\.form\.addEventListener\("submit", async \(event\) => \{[\s\S]*event\.preventDefault\(\)[\s\S]*elements\.btnGenerar\.classList\.add\("is-generating"\)[\s\S]*authFetchJson\(buildVeoApiUrl\("\/api\/gemini\/generate"\)[\s\S]*elements\.btnGenerar\.classList\.remove\("is-generating"\)/,
  "El submit debe entrar al generador, mostrar actividad y limpiar su estado al finalizar."
);

assert.match(styles, /--er-font-display:\s*var\(--er-font-sans\)/, "Todos los títulos del Creator deben usar la misma familia tipográfica del sitio.");
assert.match(styles, /\.er-summary-card,[\s\S]*\.er-summary-main\s*\{\s*padding:\s*0;/, "El header del Creator no debe conservar padding interno.");
assert.match(styles, /margin-left:\s*var\(--cb-sidebar-collapsed-width, 64px\);[\s\S]*width:\s*calc\(100% - var\(--cb-sidebar-collapsed-width, 64px\)\);/, "El Creator debe comenzar junto al sidebar sin conservar el margen izquierdo adicional.");
assert.match(styles, /\.er-summary-stats\s*\{[\s\S]*margin-left:\s*16px;/, "La separación izquierda del header debe pertenecer al bloque de estadísticas.");
assert.match(styles, /\.er-studio-shell > \.er-sessions-panel\s*\{[\s\S]*padding:\s*18px 12px 22px 0;/, "El panel de sesiones no debe conservar padding izquierdo.");
assert.doesNotMatch(html, /Sesión activa|Sin sesión activa|id="erSaveState"/, "La lista no debe reservar espacio para el resumen redundante de sesión activa.");
assert.match(styles, /--er-brief-width:\s*340px[\s\S]*--er-inspector-width:\s*220px/, "Los paneles derechos deben iniciar con anchos más compactos.");
assert.match(source, /const BRIEF_WIDTH_DEFAULT = 340;[\s\S]*const BRIEF_WIDTH_MIN = 280;[\s\S]*const BRIEF_WIDTH_MAX = 560;/, "El resizer debe usar los nuevos límites compactos del Brief.");

assert.match(
  source,
  /import \{[^}]*authFetchJson[^}]*buildApiUrl[^}]*hasAvailableApiBase[^}]*\} from "\.\/api-client\.js";/,
  "PigPenCreator debe importar buildApiUrl y hasAvailableApiBase para descargar assets remotos vía backend."
);

assert.match(
  source,
  /modoPresentacionSelect:\s*document\.getElementById\("modoPresentacionSelect"\)/,
  "El creador debe registrar el selector de formato con el id compartido por Home y las sesiones."
);

assert.match(
  source,
  /modoPresentacion:\s*normalizePresentationMode\(elements\.modoPresentacionSelect\?\.value\s*\|\|\s*PRESENTATION_MODE_ROOMS\)/,
  "El formulario debe serializar el formato de presentación canónico."
);

assert.match(
  source,
  /modo_presentacion:\s*normalizePresentationMode\(formData\.modoPresentacion\s*\|\|\s*state\.project\.modo_presentacion\)/,
  "La materialización debe conservar el formato en preview, guardado, publicación y ZIP."
);

assert.match(
  source,
  /elements\.generalContentInputs\.forEach\([\s\S]*updateGeneralProjectField/,
  "El contenido general editable debe sincronizar cada cambio con el proyecto."
);

assert.match(
  source,
  /elements\.typeSummary\.textContent\s*=\s*terms\.formatLabel/,
  "El resumen del creador debe mostrar el formato seleccionado."
);

assert.match(
  source,
  /function prepareGeneratedProjectForPresentation\([\s\S]*modo_presentacion:\s*mode[\s\S]*usesMismatchedFallback\s*\?\s*""\s*:\s*currentInstructions/,
  "El JSON crudo de la IA debe adoptar el modo solicitado y descartar fallbacks de instrucciones incompatibles."
);

const preparedProjectIndex = source.indexOf("const parsed = prepareGeneratedProjectForPresentation(");
const generatedValidationIndex = source.indexOf("const initialValidation = validateProjectSetup(parsed);", preparedProjectIndex);
assert.ok(preparedProjectIndex >= 0, "La generación debe preparar el proyecto crudo antes de normalizarlo.");
assert.ok(
  generatedValidationIndex > preparedProjectIndex,
  "El modo solicitado debe imponerse antes de la primera validación y normalización del JSON generado."
);

const fitGeneratedProjectIndex = source.indexOf("const alignment = repairGeneratedProject(initialValidation.project, formData);", generatedValidationIndex);
const alignedValidationIndex = source.indexOf("const alignedValidation = validateProjectSetup(alignment.project);", fitGeneratedProjectIndex);
const acceptAlignedProjectIndex = source.indexOf("const project = applyAcademicMissionPalettes({\n      ...alignedValidation.project", alignedValidationIndex);
assert.ok(fitGeneratedProjectIndex > generatedValidationIndex, "La respuesta debe repararse y ajustarse a los conteos solicitados.");
assert.ok(
  alignedValidationIndex > fitGeneratedProjectIndex && acceptAlignedProjectIndex > alignedValidationIndex,
  "El proyecto reparado debe revalidarse antes de aceptarse como proyecto generado."
);
assert.match(
  source.slice(alignedValidationIndex, acceptAlignedProjectIndex),
  /if \(alignedValidation\.issues\.length\)[\s\S]*console\.error\("\[PigPenCreator\] La respuesta siguió inválida después de repararla:"[\s\S]*state\.isGenerating\s*=\s*false[\s\S]*return;/,
  "Un fallo estructural residual debe registrarse antes de detener la generación."
);
assert.doesNotMatch(
  source.slice(source.indexOf('elements.form.addEventListener("submit"'), source.indexOf('elements.btnAddMission.addEventListener')),
  /state\.project\s*=\s*null/,
  "Una generación fallida no debe borrar el proyecto que ya estaba abierto."
);

const initialValidationBranch = source.slice(generatedValidationIndex, fitGeneratedProjectIndex);
assert.doesNotMatch(
  initialValidationBranch,
  /console\.(?:warn|error)/,
  "Una respuesta IA corregible no debe ensuciar la consola antes de la reparación automática."
);
assert.match(
  source,
  /function repairGeneratedQuestion\([\s\S]*tipo_interaccion === "opcion_multiple"[\s\S]*tipo_interaccion === "relacion_columnas"[\s\S]*subtipo_respuesta === "frase_libre"[\s\S]*tipo_interaccion === "multimedia"/,
  "La reparación automática debe cubrir todos los tipos interactivos antes de crear el preview."
);
assert.match(
  source,
  /const rawText = \(generated\?\.candidates\?\.\[0\]\?\.content\?\.parts \|\| \[\]\)[\s\S]*\.map\(\(part\)[\s\S]*\.join\(""\)/,
  "La generación debe reconstruir JSON aunque Gemini lo distribuya en varias partes de texto."
);

assert.match(
  source,
  /function resolveRemoteAssetDownloadUrl\(rawUrl = ""\) \{[\s\S]*buildApiUrl\(`\/api\/assets\/proxy-media\?url=\$\{encodeURIComponent\(parsed\.toString\(\)\)\}`\)/,
  "PigPenCreator debe enrutar Firebase Storage por proxy-media en local y producción."
);

assert.match(
  source,
  /const finalUrl = isRemoteUrl\(rawUrl\)\s*\? resolveRemoteAssetDownloadUrl\(rawUrl\)[\s\S]*await fetch\(finalUrl,\s*\{\s*mode:\s*"cors"\s*\}\)/,
  "La descarga binaria debe usar el proxy solo para recursos remotos."
);

assert.match(
  source,
  /const elements\s*=\s*\{[\s\S]*?\bpublishToggle:\s*document\.getElementById\("publishToggle"\)/,
  "El editor debe registrar el switch de publicación en el mapa de elementos."
);

assert.match(
  source,
  /function syncAcademicFields\(\)/,
  "El creador debe sincronizar los campos académicos dependientes del nivel."
);

assert.match(
  source,
  /function buildAcademicPreviewTheme\(formData = \{\}\) \{[\s\S]*resolveRoomColorPalette\(\{ index: 0, formData \}\)[\s\S]*baseColor = mixHex\(palette\.themeColor, palette\.levelColor, 0\.34\)[\s\S]*backgroundColor: palette\.themeColor[\s\S]*buttonColor: palette\.themeColor[\s\S]*accentColor: palette\.levelColor/,
  "La paleta inicial debe usar el tema o unidad como fondo y combinarlo con el color de la estación."
);

assert.match(source, /const IMAGE_MODEL = "gemini-3-pro-image";/, "Las imágenes del escape room deben usar el modelo profesional de Gemini para instrucciones complejas.");
assert.match(source, /function buildImageTextPolicyLine\([\s\S]*if \(!allowOptionalText \|\| isStrict\)[\s\S]*REGLA NO NEGOCIABLE:[\s\S]*No dibujes letras, palabras, números, rótulos, nombres, coordenadas/, "El modo estricto debe prohibir texto legible en imágenes funcionales.");
assert.match(source, /TEXTO MÍNIMO EN IMAGEN:[\s\S]*Máximo dos etiquetas, de una o dos palabras cada una;[\s\S]*ortografía exacta y clara/, "El modo normal debe limitar las etiquetas visuales y solicitar ortografía correcta.");
assert.match(source, /No muestres códigos hexadecimales, nombres de colores, muestras de paleta ni anotaciones técnicas de color\./, "La generación estricta debe impedir códigos y leyendas de paleta dentro de la imagen.");
assert.match(source, /Los colores sirven únicamente para la composición: no escribas códigos hexadecimales, nombres de colores, muestras de paleta ni anotaciones técnicas de color\./, "La generación visual normal debe impedir que la paleta de la interfaz aparezca escrita en la imagen.");
assert.doesNotMatch(source, /Paleta obligatoria de \$\{terms\.itemSingular\}: color de nivel \$\{palette\.levelColor\}/, "Las imágenes no deben recibir colores académicos obligatorios de sala.");
assert.doesNotMatch(source, /Nivel de color principal de \$\{terms\.itemSingular\}: \$\{palette\.levelColor\}/, "La regeneración no debe forzar la paleta académica en los prompts visuales.");
assert.match(source, /responseModalities: \["IMAGE"\],[\s\S]*imageConfig: \{ aspectRatio, imageSize \}/, "La generación de imágenes debe solicitar solo salida visual.");
assert.match(source, /generateGeminiImage\(prompt, \{ aspectRatio = "16:9", imageSize = "2K"/, "Las imágenes del escape room deben solicitar salida 2K.");

assert.match(
  source,
  /function createProjectFromForm\([\s\S]*const academicTheme = buildAcademicPreviewTheme\(formData\);[\s\S]*themeConfig: academicTheme/,
  "La creación manual debe iniciar el escape room con la paleta académica."
);

assert.match(
  source,
  /const academicTheme = buildAcademicPreviewTheme\(formData\);[\s\S]*const project = applyAcademicMissionPalettes\(\{[\s\S]*themeConfig: academicTheme[\s\S]*\}, formData\);[\s\S]*state\.project = project;[\s\S]*applyPreviewTheme\(academicTheme, \{ persist: true, syncProject: true, refresh: false \}\);/,
  "La generación IA debe aplicar y persistir la paleta académica antes de mostrar el preview."
);

assert.match(
  source,
  /function applyAcademicMissionPalettes\([\s\S]*misiones:\s*missions\.map\(\(mission, index\)[\s\S]*paleta_academica:\s*buildMissionAcademicPalette\(index, formData\)/,
  "Cada sala debe persistir simultáneamente su color de estación y de tema/unidad para preview y exportación."
);

assert.match(
  source,
  /const resolvedPalette = Object\.fromEntries\([\s\S]*normalizeHexColor\(theme\[key\], fallback\)[\s\S]*\.\.\.resolvedPalette/,
  "La normalización del tema debe conservar los colores semánticos válidos de tema y estación."
);

const loadSessionMatch = source.match(/async function loadSessionIntoEditor\(session\) \{([\s\S]*?)\n\}/);
assert.ok(loadSessionMatch, "Debe existir la función loadSessionIntoEditor.");
const loadSessionBody = loadSessionMatch[1];
assert.ok(
  loadSessionBody.indexOf("fetchSessionTopics(session.id)") >= 0,
  "Cargar una sesión debe recuperar sus temas antes de hidratar el editor."
);
const loadTopicMatch = source.match(/async function loadTopicIntoEditor\(topic,[\s\S]*?\{([\s\S]*?)\n\}/);
assert.ok(loadTopicMatch, "Debe existir la hidratación independiente de temas.");
const loadTopicBody = loadTopicMatch[1];
assert.ok(
  loadTopicBody.indexOf('resetEditorState({ preserveForm: false });') < loadTopicBody.indexOf("applyFormState({ ...buildAcademicFormState(topic.project), ...(topic.formState || {}) });"),
  "La limpieza base del formulario debe ocurrir antes de aplicar el estado remoto."
);

assert.match(
  source,
  /elements\.btnExportar\.disabled\s*=\s*state\.isLoading\s*\|\|\s*!hasData\s*\|\|\s*state\.isGenerating;/,
  "Exportar debe quedar deshabilitado mientras el creador sigue generando recursos."
);

assert.match(
  source,
  /elements\.publishToggle\.disabled\s*=\s*state\.isLoading\s*\|\|\s*!canPublish;/,
  "El switch de publicación debe depender del estado actual del editor."
);

assert.match(
  source,
  /elements\.publishToggle\??\.addEventListener\("change",\s*handlePublishToggleChange\);/,
  "El switch de publicación debe ejecutar una acción real."
);

assert.match(
  source,
  /await updateActiveSessionMetadata\(\{\s*status:\s*nextPublished\s*\?\s*"published"\s*:\s*"draft"\s*\}\);/,
  "El switch debe permitir publicar y despublicar."
);

assert.match(
  source,
  /const normalizedProject = project === undefined \? \(state\.project \? materializeProjectForExport\(\) : null\) : \(project \|\| null\);/,
  "Crear una sesión nueva debe resolver project nulo sin heredar el proyecto activo."
);

assert.match(
  source,
  /formState:\s*formState === undefined \? serializeFormState\(\) : \(formState \|\| null\)/,
  "Crear una sesión nueva debe poder persistir formState nulo sin heredar el formulario activo."
);

assert.match(
  source,
  /project:\s*normalizedProject/,
  "Crear una sesión nueva debe reutilizar el proyecto normalizado al persistir."
);

assert.match(
  source,
  /function createRemoteSession[\s\S]*reloadEditor = true[\s\S]*if \(reloadEditor\) \{[\s\S]*loadSessionsFromFirebase[\s\S]*\} else \{[\s\S]*state\.activeSessionId = docRef\.id/,
  "El autoguardado debe poder activar la primera sesión remota sin rehidratar ni cerrar la sala seleccionada."
);
assert.match(
  source,
  /ensureActiveRemoteSession[\s\S]*createRemoteSession\(\{[\s\S]*reloadEditor: false/,
  "La creación automática de sesión debe preservar el proyecto y la selección actuales."
);
assert.match(
  source,
  /function scheduleSessionSave\(\)[\s\S]*if \(state\.isGenerating\)[\s\S]*state\.sessionSaveQueued = true[\s\S]*if \(state\.sessionSaveInFlight\)[\s\S]*persistActiveSession\(\)\.finally/,
  "El autoguardado debe esperar a que termine la generación y evitar persistencias concurrentes."
);
assert.match(
  source,
  /const isLocalOrigin = \["localhost", "127\.0\.0\.1", "::1"\][\s\S]*uploadImageToBackendForFallback/,
  "En local, las imágenes deben usar el backend antes de intentar una subida directa bloqueada por CORS."
);

const deriveSessionTitleMatch = source.match(/function deriveSessionTitle\(\) \{([\s\S]*?)\n\}/);
assert.ok(deriveSessionTitleMatch, "Debe existir la función deriveSessionTitle.");
const deriveSessionTitleBody = deriveSessionTitleMatch[1];
assert.doesNotMatch(
  deriveSessionTitleBody,
  /temaInput|objetivoInput/,
  "El nombre de la sesión no debe derivarse del tema curricular ni del objetivo."
);

const renderSessionListMatch = source.match(/function renderSessionList\(\) \{([\s\S]*?)\n\}/);
assert.ok(renderSessionListMatch, "Debe existir la función renderSessionList.");
const renderSessionListBody = renderSessionListMatch[1];
assert.doesNotMatch(
  renderSessionListBody,
  /activeSessionName|Sin sesión activa/,
  "La lista no debe renderizar una cabecera redundante para la sesión activa."
);
assert.match(
  renderSessionListBody,
  /er-session-title-button[\s\S]*data-session-action="open"[\s\S]*data-session-menu-toggle/,
  "La sesión debe abrirse desde el título y reservar los tres puntos para acciones secundarias."
);
assert.doesNotMatch(
  renderSessionListBody,
  /er-session-open|er-session-item-meta|<span class="er-badge">Activa<\/span>/,
  "La lista compacta no debe conservar el botón Abrir, metadata ni el badge Activa."
);

assert.match(
  source,
  /function renderMissionNavigator\(\)[\s\S]*data-mission-select[\s\S]*ensureSortable\(\)/,
  "La navegación lateral debe seleccionar y conservar el reordenamiento de salas."
);
assert.match(
  source,
  /function repairEscapeRoomRuntime\(\)[\s\S]*repairMissionAnswers\(mission, missionIndex\)[\s\S]*validateProjectSetup\(repairedProject\)[\s\S]*renderOutputsNow\(\)[\s\S]*setActiveTab\("preview"\)/,
  "Reparar debe corregir preguntas y respuestas, validar el proyecto y reconstruir preview, JSON y export."
);
assert.match(
  source,
  /function renderMissionEditor\(\)[\s\S]*getSelectedMissionIndex\(\)[\s\S]*filter\(\(\{ mission \}\) => mission\.id === state\.selectedMissionId\)/,
  "El workspace central debe renderizar únicamente la sala seleccionada por ID."
);
assert.match(
  source,
  /function deleteMission\(index\)[\s\S]*fallbackMission[\s\S]*state\.selectedMissionId = fallbackMission\?\.id \|\| null/,
  "Al eliminar la sala seleccionada debe elegirse una vecina o cerrar el panel si ya no hay salas."
);
assert.match(
  source,
  /function addMission\(\)[\s\S]*state\.selectedMissionId = state\.project\.misiones\.at\(-1\)\?\.id[\s\S]*renderMissionEditor\(\)/,
  "Añadir una sala debe seleccionarla y abrir su editor automáticamente."
);
assert.match(
  source,
  /function selectMissionById\(missionId[\s\S]*const shouldHide = state\.selectedMissionId === missionId[\s\S]*state\.selectedMissionId = shouldHide \? null : missionId/,
  "Seleccionar la misma sala debe alternar entre mostrar y ocultar su panel."
);
assert.match(
  source,
  /function selectQuestionById\(missionId, questionId[\s\S]*state\.selectedMissionId = missionId[\s\S]*state\.selectedQuestionId = questionId[\s\S]*renderMissionEditor\(\)/,
  "Seleccionar una pregunta debe mantener su sala y abrir el editor granular."
);
assert.match(
  source,
  /const selectedQuestionIndex[\s\S]*if \(selectedQuestionIndex >= 0\)[\s\S]*renderQuestionCard\(selectedIndex, selectedQuestionIndex[\s\S]*return;/,
  "El editor granular debe detener el render de la sala completa después de mostrar la pregunta elegida."
);
assert.match(
  source,
  /function renderMissionNavigator\(\)[\s\S]*state\.expandedMissionIds\.has\(mission\.id\)[\s\S]*data-question-select/,
  "La lista debe conservar acordeones de sala y exponer sus preguntas como controles seleccionables."
);
assert.doesNotMatch(
  source,
  /elements\.outputCard\.append\(elements\.missionWorkspacePanel\)/,
  "El editor de sala no debe montarse dentro del bloque Preview/JSON."
);

assert.match(
  styles,
  /\.er-mission-actions\s*\{[\s\S]*?flex-direction:\s*row;[\s\S]*?flex-wrap:\s*nowrap;[\s\S]*?min-width:\s*max-content;/,
  "Las acciones de sala deben permanecer alineadas horizontalmente sin envolver iconos."
);

const briefHeaderIndex = html.indexOf("er-form-header-compact");
const briefActionsIndex = html.indexOf("er-actions er-brief-actions");
const briefFieldsIndex = html.indexOf("er-form-compact-grid er-brief-form-grid");
assert.ok(
  briefActionsIndex >= 0 && briefActionsIndex < briefHeaderIndex && briefHeaderIndex < briefFieldsIndex,
  "Las acciones del brief deben estar arriba del título y de los campos."
);
assert.match(
  styles,
  /\.er-brief-panel > \.er-form-card\s*\{[\s\S]*?grid-template-rows:\s*auto auto minmax\(0, 1fr\) auto;/,
  "El grid del brief debe reservar la segunda fila para las acciones superiores."
);
assert.match(
  styles,
  /\.er-brief-actions \.er-studio-icon-button:hover,[\s\S]*?\.er-brief-actions \.er-studio-icon-button:focus-visible\s*\{[\s\S]*?transform:\s*scale\(1\.18\);/,
  "Los botones superiores del brief deben crecer suavemente en hover y foco."
);

assert.match(
  source,
  /await createRemoteSession\(\{\s*title:\s*SESSION_TITLE_DEFAULT,\s*project:\s*null,\s*formState:\s*null,\s*activate:\s*true\s*\}\);/,
  "Crear una sesión nueva debe iniciar con un nombre simple y vacío."
);

assert.match(
  source,
  /trimestre:\s*document\.getElementById\("trimestreSelect"\)\?\.value\s*\|\|\s*"1"/,
  "El formulario debe exportar el trimestre."
);

assert.match(
  source,
  /materia:\s*document\.getElementById\("materiaSelect"\)\?\.value\s*\|\|\s*"Español"/,
  "El formulario debe exportar la materia."
);

assert.match(
  source,
  /unidad:\s*unidadTemaModo === "Primaria" \? unidadTemaValor : ""/,
  "Primaria debe persistir el valor en unidad."
);

assert.match(
  source,
  /temaSecundaria:\s*unidadTemaModo === "Secundaria" \? unidadTemaValor : ""/,
  "Secundaria debe capturar el valor del campo adaptativo como tema."
);

assert.match(
  source,
  /tema:\s*temaLines\.join\(" \/ "\)/,
  "El tema curricular debe seguir saliendo del textarea principal."
);

assert.match(
  source,
  /estacion:\s*unidadTemaModo === "Secundaria" \? \(document\.getElementById\("estacionSelect"\)\?\.value \|\| "Todas"\) : ""/,
  "Secundaria debe persistir la estación seleccionada y conservar el valor Todas como fallback."
);

assert.match(
  source,
  /const remoteAssetStats = await downloadRemoteAssets\(projectClone,\s*remoteFiles,\s*mediaFolder\);/,
  "El export debe capturar el resultado de la descarga de assets remotos."
);

assert.match(
  source,
  /return \{\s*downloaded,\s*failed\s*\};/,
  "La descarga de assets remotos debe devolver estadísticas para degradar con seguridad ante CORS."
);

assert.match(
  source,
  /Paquete ZIP generado con recursos remotos omitidos por CORS:/,
  "El export debe avisar cuando algunos assets remotos no pudieron embebirse por CORS."
);

assert.match(
  source,
  /function updateQuestionField\([\s\S]*fieldPath === "respuesta_correcta"[\s\S]*replacePrimaryAcceptedAnswer\([\s\S]*scheduleOutputRefresh\(\)/,
  "Editar la respuesta correcta debe sustituir el token anterior y refrescar preview, JSON y sesión."
);

assert.match(
  source,
  /function updateQuestionOptionValue\([\s\S]*question\._correctOptionIndex === optionIndex[\s\S]*question\.respuesta_correcta = value[\s\S]*scheduleOutputRefresh\(\)/,
  "Editar la opción seleccionada como correcta debe sincronizar su valor evaluable."
);

assert.match(
  source,
  /function updateQuestionPairValue\([\s\S]*question\.parejas\[pairIndex\]\[side\] = value;[\s\S]*scheduleOutputRefresh\(\)/,
  "Editar cualquier lado de una relación debe refrescar preview y exportación."
);

assert.match(
  source,
  /function scheduleOutputRefresh\(\)[\s\S]*updateSummaryStats\(\);[\s\S]*renderJsonPreview\(\);[\s\S]*renderPreview\(\);[\s\S]*scheduleSessionSave\(\);/,
  "Toda edición de pregunta debe converger en preview, JSON exportable y guardado de sesión."
);

assert.match(source, /function readPigPenZip\(file\)[\s\S]*findEscapeRoomManifestPath/, "La importación debe requerir el manifiesto editable de PigPen.");
assert.match(source, /function importZipAsNewSession\(file\)[\s\S]*createRemoteSession\([\s\S]*reloadEditor:\s*false/, "Importar un ZIP debe crear una sesión nueva sin sobrescribir la activa.");
assert.match(source, /restorePigPenArchiveAssets/, "La importación debe restaurar medios del paquete a URLs editables.");
assert.match(
  source,
  /function fetchBinaryAsset\(url\)[\s\S]*isRemoteUrl\(rawUrl\)[\s\S]*new URL\(rawUrl, window\.location\.href\)/,
  "El export debe descargar logo.png localmente en vez de enviarlo al proxy remoto."
);
assert.match(source, /remoteFiles\["logo\.png"\]/, "El ZIP debe incluir el logo que usa index.html.");

console.log("PigPenCreator regressions OK.");
