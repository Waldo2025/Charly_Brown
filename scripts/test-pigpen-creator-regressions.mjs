import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../", import.meta.url);
const html = fs.readFileSync(
  new URL("public/PigPenCreator.html", root),
  "utf8"
);
const source = fs.readFileSync(
  new URL("public/js/PigPenCreator.js", root),
  "utf8"
);
const creatorModelSource = fs.readFileSync(
  new URL("public/js/escape-room-creator-model.mjs", root),
  "utf8"
);
const styles = fs.readFileSync(
  new URL("public/PigPenCreator.css", root),
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

assert.match(html, /id="nivelSelect"[\s\S]*<option value="Secundaria" selected>/, "El Brief debe iniciar en Secundaria.");
assert.match(html, /id="numMisionesInput" value="4"/, "El Brief debe iniciar con 4 salas.");
assert.match(html, /id="preguntasPorSalaInput" value="4"/, "El Brief debe iniciar con 4 preguntas por sala.");
assert.match(html, /id="duracionInput"[^>]*step="0\.5"[^>]*value="12"/, "El Brief debe iniciar con 12 minutos y admitir medios minutos.");
assert.match(
  source,
  /function buildInheritedSessionFormState\(\)[\s\S]*serializeFormState\(\)[\s\S]*PigPenSheetsImport\?\.getLastFormState[\s\S]*inherited\.temaInput = "";[\s\S]*inherited\.objetivoInput = "";[\s\S]*return inherited;/,
  "Una sesión nueva debe heredar la última configuración sin copiar tema ni objetivo."
);
assert.match(
  source,
  /async function createBlankSession\([^)]*\)[\s\S]*const inheritedFormState = buildInheritedSessionFormState\(\);[\s\S]*formState: inheritedFormState/,
  "Nueva sesión debe guardar la configuración heredada en su formState."
);

assert.match(
  html,
  /<form id="escapeRoomForm"[^>]*\bnovalidate\b/,
  "La validación nativa no debe bloquear silenciosamente el flujo controlado de generación."
);

assert.match(
  source,
  /elements\.form\.addEventListener\("submit", async \(event\) => \{[\s\S]*event\.preventDefault\(\)[\s\S]*elements\.btnGenerar\.classList\.add\("is-generating"\)[\s\S]*requestFoundationProject\(formData\)[\s\S]*requestGeneratedQuestionsProject\(formData, foundation, terms\)[\s\S]*elements\.btnGenerar\.classList\.remove\("is-generating"\)/,
  "El submit debe entrar al generador, mostrar actividad y limpiar su estado al finalizar."
);
assert.match(
  source,
  /async function requestGeneratedQuestionsProject[\s\S]*authFetchJson\(buildGeminiApiUrl\("\/api\/gemini\/generate"\)/,
  "La segunda etapa debe solicitar a Gemini el JSON de preguntas."
);
assert.equal((html.match(/id="btnGenerar"/g) || []).length, 1, "El botón superior original debe conservar su ID único.");
assert.equal((html.match(/id="btnGenerarBottom"/g) || []).length, 1, "El botón inferior debe tener un ID propio y único.");
assert.match(
  html,
  /<div class="er-actions er-brief-actions er-panel-toolbar">[\s\S]*?<button type="submit" id="btnGenerar" class="er-button er-studio-icon-button"/,
  "El botón original btnGenerar debe permanecer en las acciones superiores del Brief."
);
assert.match(
  html,
  /<div class="er-brief-footer">[\s\S]*id="loadingIndicator"[\s\S]*<button type="submit" id="btnGenerarBottom"[^>]*>[\s\S]*Generar escape room[\s\S]*<\/button>[\s\S]*<\/div>/,
  "El segundo botón debe estar al fondo del Brief, debajo del indicador de carga."
);
assert.match(
  styles,
  /\.er-studio-shell #escapeRoomForm \.er-brief-generate-button\s*\{[\s\S]*?min-height:\s*38px;[\s\S]*?background:\s*var\(--er-panel-primary\);/,
  "El botón inferior debe usar el mismo azul funcional del sistema shadcn."
);
assert.match(styles, /\.er-brief-generate-button::before\s*\{\s*display:\s*none;/, "El CTA no debe conservar el barrido decorativo del estilo anterior.");
assert.match(
  styles,
  /\.er-page \.er-brief-footer \.er-brief-generate-button > :where\(i, span\)\s*\{[\s\S]*?color:\s*#ffffff !important;/,
  "El texto y el icono del botón inferior deben vencer la regla cromática global del formulario."
);
assert.match(
  html,
  /id="estiloImagenSelect"[\s\S]*?<option value="otro">✏️ Otro estilo\.\.\.<\/option>[\s\S]*?id="estiloImagenCustomField"[\s\S]*?id="estiloImagenCustomInput"/,
  "El selector visual debe ofrecer Otro y mostrar un campo para describir el estilo personalizado."
);
assert.match(
  source,
  /function syncImageStyleCustomField\(\)[\s\S]*elements\.estiloImagenSelect\?\.value === "otro"[\s\S]*elements\.estiloImagenCustomField\?\.classList\.toggle\("hidden", !isCustom\)[\s\S]*elements\.estiloImagenCustomInput\.required = Boolean\(isCustom\)/,
  "El campo de estilo personalizado debe mostrarse y ser obligatorio únicamente al elegir Otro."
);
assert.match(
  source,
  /const estiloImagenBase = String\(elements\.estiloImagenSelect\?\.value \|\| ""\)\.trim\(\);[\s\S]*const estiloImagenPersonalizado = String\(elements\.estiloImagenCustomInput\?\.value \|\| ""\)\.trim\(\);[\s\S]*const estiloImagen = estiloImagenBase === "otro" \? estiloImagenPersonalizado : estiloImagenBase;/,
  "La generación debe utilizar literalmente la descripción del estilo personalizado."
);
assert.match(
  styles,
  /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.er-brief-generate-button::before\s*\{\s*display:\s*none;/,
  "La animación de brillo debe desactivarse cuando el usuario solicita movimiento reducido."
);
assert.match(
  source,
  /btnGenerarBottom:\s*document\.getElementById\("btnGenerarBottom"\)[\s\S]*elements\.btnGenerarBottom\.disabled = state\.isLoading;[\s\S]*elements\.btnGenerarBottom\?\.classList\.add\("is-generating"\)[\s\S]*elements\.btnGenerarBottom\?\.classList\.remove\("is-generating"\)/,
  "Ambos botones deben compartir el submit y sincronizar sus estados de carga."
);

assert.match(styles, /--er-font-display:\s*var\(--er-font-sans\)/, "Todos los títulos del Creator deben usar la misma familia tipográfica del sitio.");
assert.match(styles, /\.er-summary-card,[\s\S]*\.er-summary-main\s*\{\s*padding:\s*0;/, "El header del Creator no debe conservar padding interno.");
assert.match(styles, /margin-left:\s*var\(--cb-sidebar-collapsed-width, 64px\);[\s\S]*width:\s*calc\(100% - var\(--cb-sidebar-collapsed-width, 64px\)\);/, "El Creator debe comenzar junto al sidebar sin conservar el margen izquierdo adicional.");
assert.match(styles, /\.er-summary-stats\s*\{[\s\S]*margin-left:\s*16px;/, "La separación izquierda del header debe pertenecer al bloque de estadísticas.");
assert.match(styles, /\.er-studio-shell > \.er-sessions-panel\s*\{[\s\S]*padding:\s*16px 10px 18px;[\s\S]*background:\s*#f8fafc;/, "El panel de sesiones debe conservar el rail compacto de estilo shadcn.");
assert.match(html, /id="btnNewSession"[\s\S]*fa-pen-to-square[\s\S]*Nueva sesión[\s\S]*id="erSessionsCount"[\s\S]*fa-plus[\s\S]*id="erSessionFilters"/, "El rail debe reunir la acción, el contador y el icono más en una sola fila compacta antes de los filtros.");
assert.doesNotMatch(html, /class="er-sessions-heading"/, "El rail compacto no debe reservar una fila independiente para el título Sesiones.");
assert.match(styles, /\.er-session-item\.is-active\s*\{[\s\S]*background:\s*#e9eef5;/, "La sesión activa debe usar una superficie tenue en vez de un acento dominante.");
assert.doesNotMatch(html, /Sesión activa|Sin sesión activa|id="erSaveState"/, "La lista no debe reservar espacio para el resumen redundante de sesión activa.");
assert.match(styles, /--er-brief-width:\s*340px[\s\S]*--er-inspector-width:\s*220px/, "Los paneles derechos deben iniciar con anchos más compactos.");
assert.match(source, /const BRIEF_WIDTH_DEFAULT = 340;[\s\S]*const BRIEF_WIDTH_MIN = 200;[\s\S]*const BRIEF_WIDTH_MAX = 560;/, "El Brief debe poder reducirse hasta 200 px sin alterar su ancho inicial.");

assert.match(
  source,
  /import \{[^}]*authFetchJson[^}]*buildApiUrl[^}]*buildGeminiApiUrl[^}]*hasAvailableApiBase[^}]*\} from "\.\/api-client\.js\?v=20260902-gemini-direct";/,
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
  /function prepareGeneratedProjectForPresentation\([\s\S]*modo_presentacion:\s*mode/,
  "El JSON crudo de la IA debe adoptar el modo solicitado sin reescribir sus instrucciones."
);

const preparedProjectIndex = source.indexOf("const parsed = prepareGeneratedProjectForPresentation(");
const normalizedProjectIndex = source.indexOf("const structurallyNormalized = normalizeEscapeRoomProject(parsed);", preparedProjectIndex);
const generatedValidationIndex = source.indexOf("const initialValidation = validateProjectSetup(projectCandidate);", normalizedProjectIndex);
assert.ok(preparedProjectIndex >= 0, "La generación debe preparar el proyecto crudo antes de normalizarlo.");
assert.ok(
  normalizedProjectIndex > preparedProjectIndex && generatedValidationIndex > normalizedProjectIndex,
  "El modo solicitado debe imponerse antes de la normalización técnica y la validación del JSON generado."
);

const qualityGateIndex = source.indexOf("const qualityResult = await runContentQualityGate(projectCandidate", generatedValidationIndex);
const finalQualityValidationIndex = source.indexOf("const finalQualityValidation = validateProjectSetup(qualityResult.project);", qualityGateIndex);
const stripCoverageIndex = source.indexOf("const approvedProject = stripTemporaryCoverageAnchors(qualityResult.project);", finalQualityValidationIndex);
const acceptQualityProjectIndex = source.indexOf("const project = applyAcademicMissionPalettes({\n      ...approvedProject", stripCoverageIndex);
assert.ok(
  qualityGateIndex > generatedValidationIndex
    && finalQualityValidationIndex > qualityGateIndex
    && stripCoverageIndex > finalQualityValidationIndex
    && acceptQualityProjectIndex > finalQualityValidationIndex,
  "El proyecto debe aprobar la auditoría textual, revalidarse y adoptarse sin una normalización editorial posterior."
);
assert.doesNotMatch(
  source,
  /repairGeneratedProject|fitProjectToConfiguredCounts|alignGeneratedQuestionsToInteractionPlan/,
  "El cliente no debe completar, reordenar ni reescribir localmente la salida de Gemini."
);
assert.doesNotMatch(
  creatorModelSource,
  /buildSingleWordChallenge|normalizeConcreteQuestionHint|buildConcreteQuestionHint|applyFeedbackAuditFallbacks/,
  "El modelo normalizador no debe conservar redactores locales de retos, pistas o feedback."
);
assert.match(
  source,
  /function buildQuestionsFromBriefingsPrompt[\s\S]*SEGUNDA ETAPA:[\s\S]*PROYECTO BASE BLOQUEADO/,
  "La segunda etapa debe trabajar sobre la base bloqueada sin repetir una plantilla editorial completa."
);
assert.doesNotMatch(
  source.slice(source.indexOf("function buildQuestionsFromBriefingsPrompt"), source.indexOf("async function requestQualityJson")),
  /buildPrompt\(data\)/,
  "El prompt de preguntas no debe incrustar de nuevo el prompt completo con ejemplos lingüísticos que contaminen la salida."
);
assert.doesNotMatch(
  source,
  /function buildRoomsPrompt|function buildMenuSectionsPrompt|function buildPrompt\(/,
  "Los constructores monolíticos antiguos con ejemplos editoriales no deben permanecer disponibles."
);
assert.match(
  source,
  /async function requestGeneratedQuestionsProject[\s\S]*getGeneratedStructureIssues\(mergedProject, formData\)[\s\S]*contentAttempt === 0[\s\S]*después de dos intentos/,
  "Una estructura incompleta debe reintentarse con Gemini y nunca rellenarse localmente."
);
assert.match(
  source.slice(qualityGateIndex, acceptQualityProjectIndex),
  /additionalAudit:\s*\(candidate\)\s*=>\s*auditGeneratedProjectStructure\(candidate, formData\)[\s\S]*auditInteractionPlan\(qualityResult\.project, formData\.interactionPlan\)/,
  "La auditoría debe reparar y volver a validar el plan exacto de interacciones antes de aceptar el proyecto."
);
assert.match(
  source,
  /function buildEditorialRepairPermissions[\s\S]*field === "tipo_interaccion"[\s\S]*interactionFields/,
  "El parche editorial debe poder cambiar el tipo y su contrato solo en preguntas señaladas por el plan."
);
assert.match(
  source,
  /function buildFoundationPrompt[\s\S]*Objetivo final y especificaciones editoriales obligatorias del usuario:[\s\S]*data\.objetivo/,
  "Los briefings deben incorporar el objetivo detallado del usuario antes de generar preguntas."
);
assert.match(
  source,
  /function buildFoundationResponseSchema[\s\S]*minItems:\s*safeMissionCount[\s\S]*maxItems:\s*safeMissionCount[\s\S]*minItems:\s*safeEvidenceCount/,
  "La base narrativa debe exigir exactamente la cantidad de briefings y evidencias configurada."
);
assert.match(
  source,
  /function getFoundationStructureIssues[\s\S]*valor vacío[\s\S]*datos_clave[\s\S]*async function requestFoundationProject[\s\S]*attempt < 2[\s\S]*responseJsonSchema[\s\S]*getFoundationStructureIssues[\s\S]*Reintentando con Gemini/,
  "La creación de briefings debe rechazar textos vacíos o estructura incompleta y reintentar con Gemini."
);
assert.match(
  source,
  /const foundation = await requestFoundationProject\(formData\);/,
  "El submit debe validar la base narrativa antes de crear las preguntas."
);
assert.doesNotMatch(
  source.slice(source.indexOf("function buildFoundationPrompt"), source.indexOf("function buildQuestionsFromBriefingsPrompt")),
  /"misiones":\[\]/,
  "El prompt de briefings no debe mostrar una lista vacía que contradiga la cantidad solicitada."
);
assert.match(
  source,
  /function filterUnsupportedAiAuditIssues[\s\S]*referencesLegacyMaster[\s\S]*hasRealAcceptedAnswerDuplicates/,
  "La auditoría debe descartar falsos positivos sobre respuestas legacy y comprobar duplicados reales."
);
assert.match(
  source,
  /const briefingFields = new Set\([\s\S]*"contexto"[\s\S]*if \(briefingFields\.has\(field\)\)[\s\S]*add\(missions, roomIndex, \[field\]\)/,
  "Una incidencia de contexto vinculada a una pregunta debe autorizar únicamente el campo del briefing de su sala."
);
assert.match(
  source,
  /async function repairContentFromAudit[\s\S]*const modelPatchIssues = patchIssues[\s\S]*applyEditorialRepairPatch\(project, patch, modelPatchIssues\)/,
  "Todas las pistas y textos señalados deben corregirse mediante el parche JSON de Gemini."
);
assert.match(
  source,
  /function assertEditorialRepairStructure[\s\S]*requiredProjectFields[\s\S]*requiredMissionFields[\s\S]*requiredQuestionFields[\s\S]*conservar exactamente[\s\S]*async function repairContentFromAudit[\s\S]*parche JSON pequeño[\s\S]*applyEditorialRepairPatch\(project, patch, modelPatchIssues\)[\s\S]*assertEditorialRepairStructure\(project, completeProject\)/,
  "La corrección editorial debe aplicar un parche y validar que la estructura original permanezca completa."
);
assert.match(
  source,
  /function buildEditorialRepairPermissions[\s\S]*function applyEditorialRepairPatch[\s\S]*structuredClone\(sourceProject\)[\s\S]*permitted\.has\(field\)[\s\S]*globalChanges[\s\S]*roomIndex[\s\S]*questionIndex[\s\S]*No incluyas IDs, releases, rutas, URLs ni imágenes/,
  "Gemini debe devolver solo cambios localizados y PigPen debe aplicar exclusivamente campos autorizados por la incidencia."
);
assert.match(source, /if \(patch\?\.project \|\| Array\.isArray\(patch\?\.misiones\)\)[\s\S]*proyecto completo en vez de un parche editorial localizado/, "La auditoría debe rechazar respuestas que intenten reemplazar el proyecto completo.");
assert.match(source, /function buildContentAuditPayload[\s\S]*opciones: type === "opcion_multiple"[\s\S]*elementos: type === "ordenar_secuencia"[\s\S]*texto_con_hueco: type === "completar_espacio"/, "La auditoría debe recibir solamente las estructuras activas de cada pregunta.");
assert.doesNotMatch(
  source.slice(source.indexOf("async function repairContentFromAudit"), source.indexOf("async function runContentQualityGate")),
  /responseJsonSchema/,
  "La reparación no debe reenviar el esquema completo junto con todo el proyecto y el reporte editorial, porque Vertex rechaza esa combinación."
);
assert.match(
  source.slice(source.indexOf("const generationRequest ="), source.indexOf("let generated;", source.indexOf("const generationRequest ="))),
  /responseJsonSchema:\s*buildEscapeRoomResponseSchema\(formData\.misiones, formData\.preguntasPorSala\)/,
  "La creación de preguntas también debe exigir el esquema completo del escape room."
);
assert.doesNotMatch(
  source.slice(source.indexOf("function buildEscapeRoomResponseSchema"), source.indexOf("function extractGeneratedJson")),
  /anyOf/,
  "El esquema de salida no debe usar la unión string|boolean que Vertex rechaza en este payload complejo."
);
assert.doesNotMatch(
  source.slice(source.indexOf("preguntas: {", source.indexOf("function buildEscapeRoomResponseSchema")), source.indexOf("desbloquea: stringArray", source.indexOf("function buildEscapeRoomResponseSchema"))),
  /minItems|maxItems/,
  "El esquema no debe combinar límites exactos de salas con límites anidados de preguntas porque Vertex responde INVALID_ARGUMENT."
);
assert.doesNotMatch(
  source.slice(source.indexOf('elements.form.addEventListener("submit"'), source.indexOf('elements.btnAddMission.addEventListener')),
  /state\.project\s*=\s*null/,
  "Una generación fallida no debe borrar el proyecto que ya estaba abierto."
);

assert.doesNotMatch(
  source,
  /function repairGeneratedQuestion|function repairQuestionAnswers|function repairMissionAnswers/,
  "El cliente no debe contener reparadores locales que redacten preguntas o respuestas."
);
assert.match(
  source,
  /const rawText = extractGeminiText\(generated\)/,
  "La generación debe reconstruir JSON aunque Gemini lo distribuya en varias partes de texto."
);

assert.match(
  source,
  /function isFirebaseStorageDownloadUrl\(value = ""\) \{[\s\S]*host === "firebasestorage\.googleapis\.com"/,
  "PigPenCreator debe reconocer download URLs de Firebase Storage para descargarlas directamente."
);

assert.match(
  source,
  /const candidates = isRemote && isFirebaseStorageDownloadUrl\(rawUrl\)[\s\S]*\? \[rawUrl, resolvedUrl\][\s\S]*await fetch\(candidateUrl, \{ mode: "cors" \}\)/,
  "La descarga binaria debe intentar Firebase directamente antes del proxy de respaldo."
);

assert.doesNotMatch(html, /allow="fullscreen"[^>]*\ballowfullscreen\b/i, "El iframe no debe declarar dos políticas fullscreen contradictorias.");

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

assert.match(source, /const IMAGE_MODEL_DEFAULT = "gemini-3\.1-flash-image";/, "Las imágenes deben usar Flash Image como valor predeterminado para reducir latencia y consumo.");
assert.match(source, /async function generateGeminiImage\([\s\S]*model = IMAGE_MODEL_DEFAULT[\s\S]*model: imageModel/, "La generación debe respetar el modelo de imagen configurado y conservar un fallback válido.");
assert.match(source, /buildRoomVisualPrompt[\s\S]*model: context\?\.modeloImagen[\s\S]*buildQuestionVisualPrompt[\s\S]*model: context\?\.modeloImagen/, "Las imágenes de salas y preguntas deben usar el modelo seleccionado en el brief.");
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
  /elements\.btnExportar\.disabled\s*=\s*state\.isLoading\s*\|\|\s*!hasData\s*\|\|\s*state\.isGenerating\s*\|\|\s*state\.isExporting;/,
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
  /er-session-open|<span class="er-badge">Activa<\/span>/,
  "La lista compacta no debe conservar el botón Abrir ni el badge Activa."
);
assert.match(
  renderSessionListBody,
  /trimester \? `T\$\{trimester\}`[\s\S]*theme \? `Tema \$\{theme\}`[\s\S]*er-session-item-meta/,
  "La lista debe mostrar metadatos académicos compactos con trimestre y número de tema."
);

assert.match(
  source,
  /function renderMissionNavigator\(\)[\s\S]*data-mission-select[\s\S]*ensureSortable\(\)/,
  "La navegación lateral debe seleccionar y conservar el reordenamiento de salas."
);
assert.match(
  source,
  /async function repairEscapeRoomRuntime\(\)[\s\S]*const materialized = materializeProjectForExport\(\)[\s\S]*validateProjectSetup\(materialized\)[\s\S]*runContentQualityGate\(materialized, formData[\s\S]*state\.project = quality\.project[\s\S]*renderOutputsNow\(\)[\s\S]*setActiveTab\("preview"\)/,
  "Reparar debe auditar el JSON existente y adoptar únicamente el proyecto resultante de los parches de Gemini."
);
assert.match(
  source,
  /async function repairEscapeRoomRuntime\(\)[\s\S]*analyzeBriefingsBeforeRepair\(materialized[\s\S]*preflightIssues:\s*\[[\s\S]*briefingAnalysis\.issues[\s\S]*structuralValidationMessagesToAuditIssues\(validation\.issues\)[\s\S]*briefingAnalysis/,
  "Reparar debe analizar primero cada briefing y entregar ese análisis a la corrección de preguntas."
);
assert.match(
  source,
  /async function repairContentFromAudit[\s\S]*Antes de corregir una pregunta[\s\S]*ANÁLISIS PREVIO DE BRIEFINGS/,
  "Gemini debe consultar el análisis previo del briefing antes de corregir campos defectuosos o repetidos."
);
assert.doesNotMatch(
  source,
  /async function repairContentFromAudit[\s\S]*collectFullQuestionRepairTargets|async function repairContentFromAudit[\s\S]*regenerateQuestionsFromAudit/,
  "La auditoría de creación no debe regenerar preguntas completas; solo debe actualizar campos mediante parches."
);
assert.match(
  source,
  /function getRequiredBriefingEvidenceCount[\s\S]*Math\.max\(3,[\s\S]*buildFoundationPrompt[\s\S]*uno diferente para sustentar cada pregunta posterior/,
  "El briefing debe solicitar como mínimo una evidencia diferente por cada pregunta configurada."
);
assert.doesNotMatch(html, /id="preguntasPorSalaInput"[^>]*max=/, "El usuario no debe tener un máximo artificial de preguntas por sala.");
assert.doesNotMatch(html, /id="duracionInput"[^>]*readonly/, "La duración debe permitir edición manual.");
assert.match(html, /id="duracionInput"[^>]*data-duration-mode="auto"/, "La duración debe iniciar en modo automático.");
assert.match(source, /formState\.__durationMode[\s\S]*durationInput\?\.dataset\.durationMode === "manual"/, "El modo manual de duración debe persistirse con la sesión.");
assert.match(source, /function setEstimatedDurationInput\([^)]*force = false[\s\S]*input\.dataset\.durationMode === "manual"[\s\S]*const usesManualDuration[\s\S]*estimatedDuration = usesManualDuration/, "El cálculo automático no debe sobrescribir una duración editada manualmente.");
assert.match(
  source,
  /function calculateEstimatedDurationMinutes[\s\S]*rooms \+ \(questions \* 0\.5\)[\s\S]*function calculateProjectEstimatedDuration[\s\S]*mission\.preguntas\.length/,
  "La duración debe sumar treinta segundos por pregunta y un minuto de lectura por sala."
);
assert.match(
  source,
  /function getRequiredBriefingWordRange[\s\S]*evidenceCount \* 35[\s\S]*evidenceCount \* 55/,
  "La extensión del briefing debe crecer con la cantidad de preguntas."
);

const submitStart = source.indexOf('elements.form.addEventListener("submit"');
const foundationIndex = source.indexOf("requestFoundationProject(formData)", submitStart);
const questionsIndex = source.indexOf("requestGeneratedQuestionsProject(formData, foundation, terms)", foundationIndex);
const firstImageIndex = source.indexOf("generateCoverImage(project, formData)", questionsIndex);
assert.ok(
  foundationIndex > submitStart && questionsIndex > foundationIndex && qualityGateIndex > questionsIndex && firstImageIndex > qualityGateIndex,
  "La creación debe generar briefings, preguntas y auditoría textual antes de solicitar imágenes."
);
assert.match(
  source,
  /async function generateValidatedImage\(prompt, imageOptions\) \{\s*const image = await generateGeminiImage\(prompt, imageOptions\);\s*return optimizeGeneratedImageForProject\(image\);\s*\}/,
  "PigPen debe conservar y optimizar la imagen generada sin descartarla por el texto que contenga."
);
assert.doesNotMatch(source, /auditGeneratedImage|prepareImageForVisualAudit|Imagen descartada por contener una respuesta escrita/);
assert.match(source, /function removeQuestionImage[\s\S]*question\.imagen = "";[\s\S]*question\.media = \{ \.\.\.question\.media, url: "" \}/);
assert.match(source, /data-question-action="delete-question-image"[\s\S]*Eliminar imagen/);
assert.match(source, /questionAction === "delete-question-image"[\s\S]*removeQuestionImage\(missionIndex, questionIndex\)/);
assert.match(
  source,
  /function buildRoomBundleRetryInstruction[\s\S]*retroalimentacion_incorrecta[\s\S]*No incluyas fragmentos de la clave final/,
  "El reintento de una sala debe corregir explícitamente feedbacks que revelan respuestas y fragmentos privados."
);
assert.match(
  source,
  /async function requestGeneratedRoomBundle[\s\S]*maximumAttempts = 3[\s\S]*buildRoomBundleRetryInstruction\(retryIssues, attempt, rejectedMission\)[\s\S]*validateGeneratedRoomContent[\s\S]*return mission/,
  "Cada sala debe reintentarse con las incidencias del validador y aprobar de nuevo antes de incorporarse al borrador."
);
assert.match(
  source,
  /maximumPublicationPasses = 3[\s\S]*auditGeneratedDraftForPublication\(generationDraft, formData\)[\s\S]*repairPrivateDraftFromPublicationIssues/,
  "La creación completa debe estabilizar automáticamente los defectos editoriales antes de publicar."
);
assert.match(source, /function selectQuestionImageIndexes\(mission = \{\}\)[\s\S]*requiere_imagen === true[\s\S]*requires_image === true[\s\S]*map\(\(\{ index \}\) => index\)/, "Deben generarse imágenes para todas las preguntas que Gemini marque como visuales.");
assert.doesNotMatch(source, /MAX_QUESTION_IMAGES_PER_MISSION|maxImages =|slice\(0, Math\.max\(0, maxImages\)\)/, "Las imágenes funcionales de preguntas no deben tener un límite por sala.");
assert.match(source, /Cada \$\{terms\.itemSingular\} tendrá una imagen de briefing obligatoria:[\s\S]*imagen_prompt[\s\S]*imagen_alt[\s\S]*No hay límite de preguntas con imagen/, "Los prompts deben separar la imagen obligatoria del briefing del análisis visual ilimitado de preguntas.");
assert.match(source, /function getFoundationStructureIssues[\s\S]*"imagen_prompt", "imagen_alt"[\s\S]*valor vacío/, "La base debe rechazar briefings sin descripción visual generada por Gemini.");
assert.doesNotMatch(source, /`Imagen de la \$\{terms\.itemSingular\}|`Imagen de la pregunta \$\{questionIndex \+ 1\}/, "El cliente no debe inventar textos alternativos después de generar las imágenes.");
assert.match(
  source,
  /async function runContentQualityGate[\s\S]*maxAuditAttempts = allowRepair \? 3 : 1[\s\S]*attempt >= maxAuditAttempts - 1[\s\S]*Estabilizando las correcciones[\s\S]*repairContentFromAudit/,
  "La auditoría textual debe permitir una estabilización dirigida y detenerse si la tercera revisión vuelve a fallar."
);
assert.match(
  source,
  /async function runContentQualityGate[\s\S]*candidate = await repairContentFromAudit\(candidate, issues, formData, briefingAnalysis\);/,
  "La auditoría debe continuar directamente con el parche JSON localizado, sin una reescritura local posterior."
);
assert.match(
  source,
  /async function requestQualityJson[\s\S]*catch \(parseError\)[\s\S]*repairQualityJsonSyntax\(malformed, formData, \{ responseJsonSchema \}\)/,
  "La auditoría y reparación deben recuperar respuestas JSON mal cerradas sin repetir el esquema estructurado grande."
);
assert.match(
  source,
  /async function repairQualityJsonSyntax[\s\S]*attempt < 2[\s\S]*responseMimeType: "application\/json"[\s\S]*responseJsonSchema[\s\S]*temperature: 0[\s\S]*pendingText = repairedText/,
  "La recuperación de JSON debe conservar el esquema y reintentar una salida reparada que siga siendo inválida."
);
assert.match(
  source,
  /async function repairContentFromAudit[\s\S]*Si una incidencia indica que la pista revela una respuesta[\s\S]*Si una incidencia afecta reto en una pregunta verdadero_falso/,
  "Gemini debe recibir reglas explícitas para corregir pistas y verdadero/falso dentro del parche JSON."
);
assert.doesNotMatch(
  source,
  /const seenLeft = new Set\(\)[\s\S]*seenRight\.has\(right\)/,
  "El cliente no debe eliminar ni reconstruir parejas localmente."
);
assert.doesNotMatch(
  source,
  /repaired\.subtipo_respuesta === "palabra"[\s\S]*\? "numero"[\s\S]*: "codigo_corto"/,
  "El cliente no debe decidir localmente un nuevo subtipo editorial durante la auditoría."
);
assert.match(
  source,
  /function assertBriefingCoverageAnchors[\s\S]*new Set\(anchors\.map[\s\S]*Gemini debe asignar una evidencia diferente/,
  "La generación debe validar, sin completar localmente, metadatos temporales de cobertura diferentes por pregunta."
);
assert.match(
  source,
  /function buildQuestionsFromBriefingsPrompt[\s\S]*Cada pregunta debe incluir temporalmente _coverage_anchor[\s\S]*function buildEscapeRoomResponseSchema[\s\S]*_coverage_anchor: stringField[\s\S]*"imagen", "_coverage_anchor"/,
  "El prompt y el esquema estructurado deben exigir a Gemini el campo temporal _coverage_anchor."
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
  /function selectQuestionById\(missionId, questionId[\s\S]*const shouldHide = state\.selectedMissionId === missionId && state\.selectedQuestionId === questionId[\s\S]*state\.selectedMissionId = shouldHide \? null : missionId[\s\S]*state\.selectedQuestionId = shouldHide \? null : questionId[\s\S]*renderMissionEditor\(\)/,
  "Seleccionar una pregunta debe abrir su editor y volver a cerrarlo al repetir la selección."
);
assert.match(
  source,
  /selectedQuestionIndex >= 0[\s\S]*Challenge de la sala[\s\S]*data-field="reto" data-index="\$\{selectedIndex\}"[\s\S]*renderQuestionCard/,
  "La vista enfocada de una pregunta debe permitir editar también el Challenge de la sala que ve el jugador."
);
assert.match(
  source,
  /Enunciado de la pregunta[\s\S]*data-question-field="reto"/,
  "El editor debe distinguir el Challenge de la sala del enunciado individual de cada pregunta."
);
assert.match(
  source,
  /function selectQuestionById\(missionId, questionId[\s\S]*setActiveTab\("preview"\)[\s\S]*focusSelectedQuestionInPreview/,
  "Seleccionar una pregunta debe abrir y sincronizar directamente el preview."
);
assert.match(
  source,
  /class="er-mission-nav-question er-mission-nav-briefing[\s\S]*data-mission-briefing=[\s\S]*<strong>Briefing<\/strong>/,
  "Cada lista de preguntas debe comenzar con un acceso directo al briefing de la sala."
);
assert.match(
  source,
  /function selectMissionBriefingById\(missionId\)[\s\S]*selectMissionById\(missionId, \{ focusEditor: false \}\)[\s\S]*setActiveTab\("preview"\)[\s\S]*focusSelectedBriefingInPreview[\s\S]*data-field="contexto"[\s\S]*scrollIntoView[\s\S]*focus/,
  "El acceso al briefing debe abrir la sala, sincronizar el preview, desplazarse al contexto y enfocarlo."
);
assert.match(
  source,
  /function focusSelectedBriefingInPreview\(\)[\s\S]*type:\s*"pigpen-preview-navigate"[\s\S]*target:\s*"briefing"[\s\S]*missionId/,
  "PigPen debe enviar al preview una navegación específica hacia el briefing seleccionado."
);
assert.match(
  source,
  /const briefingButton = event\.target\.closest\("\[data-mission-briefing\]"\)[\s\S]*selectMissionBriefingById\(briefingButton\.dataset\.missionBriefing\)/,
  "El navegador de salas debe conectar el botón de briefing con su editor."
);
assert.match(
  source,
  /<summary class="er-question-summary">[\s\S]*<div class="er-question-summary-main">\s*<h4 class="er-label">Pregunta \$\{questionIndex \+ 1\}<\/h4>\s*<\/div>\s*<div class="er-question-summary-actions">/,
  "El resumen debe mostrar únicamente Pregunta N antes del menú contextual."
);
assert.match(styles, /\.er-page \.er-label\s*\{[^}]*font-size:\s*calc\(0\.6rem \+ 2px\);[^}]*\}/, "El estilo er-label debe aumentar dos píxeles respecto del tamaño compacto anterior.");
assert.doesNotMatch(source.slice(source.indexOf("function renderQuestionCard"), source.indexOf("function getSelectedMissionIndex")), /escapeHtml\(questionTitle\)/, "El resumen no debe repetir el enunciado editable como título.");
assert.doesNotMatch(source.slice(source.indexOf("function renderQuestionCard"), source.indexOf("function getSelectedMissionIndex")), /<p>/, "El resumen de pregunta no debe mostrar un párrafo secundario.");
assert.doesNotMatch(styles, /\.er-question-summary-main p\s*\{/, "No deben quedar estilos huérfanos del párrafo eliminado.");
const questionCardSource = source.slice(source.indexOf("function renderQuestionCard"), source.indexOf("function getSelectedMissionIndex"));
const questionConfigSectionIndex = questionCardSource.indexOf("er-question-config-panel");
const questionAnswerSectionIndex = questionCardSource.indexOf("er-question-answer-panel");
const questionFeedbackSectionIndex = questionCardSource.indexOf("er-question-feedback-panel");
const questionPreviewSectionIndex = questionCardSource.indexOf("er-question-preview-panel");
assert.ok(
  questionConfigSectionIndex >= 0
    && questionConfigSectionIndex < questionAnswerSectionIndex
    && questionAnswerSectionIndex < questionFeedbackSectionIndex
    && questionFeedbackSectionIndex < questionPreviewSectionIndex,
  "Cada pregunta debe ordenar configuración, respuestas, feedback y vista rápida en cards separadas."
);
const questionConfigSectionSource = questionCardSource.slice(questionConfigSectionIndex, questionAnswerSectionIndex);
const questionPreviewSectionSource = questionCardSource.slice(questionPreviewSectionIndex);
assert.match(questionConfigSectionSource, /data-question-field="titulo"[\s\S]*data-question-field="reto"[\s\S]*data-question-field="media\.tipo"/, "La card de configuración debe reunir el contenido y la media específica de la interacción.");
assert.doesNotMatch(questionConfigSectionSource, /data-question-field="imagen(?:_prompt|_alt)?"/, "La imagen de apoyo no debe duplicarse dentro de la configuración general.");
assert.match(questionCardSource.slice(questionAnswerSectionIndex, questionFeedbackSectionIndex), /Respuesta correcta[\s\S]*Respuestas aceptadas[\s\S]*Opciones[\s\S]*Secuencia correcta[\s\S]*Frase con espacio[\s\S]*Parejas/, "La card de respuestas debe reunir todas las variantes de validación.");
assert.match(questionCardSource.slice(questionFeedbackSectionIndex, questionPreviewSectionIndex), /retroalimentacion_correcta[\s\S]*retroalimentacion_incorrecta/, "La card de feedback debe contener únicamente los mensajes de resultado.");
assert.match(questionPreviewSectionSource, /Imagen de la pregunta[\s\S]*getQuestionPreviewMedia\(question\)[\s\S]*data-question-field="imagen_prompt"[\s\S]*data-question-field="imagen_alt"[\s\S]*Sustituir imagen[\s\S]*Regenerar con este prompt/, "La card visual debe concentrar la vista previa, el prompt, el texto alternativo y las acciones de imagen.");
assert.doesNotMatch(questionPreviewSectionSource, /er-preview-badges|getQuestionTypeLabel|<strong>Respuesta:<\/strong>|escapeHtml\(question\.reto\)/, "La card visual no debe mostrar badges, el enunciado ni la respuesta.");
const questionPreviewMediaSource = source.slice(source.indexOf("function getQuestionPreviewMedia"), source.indexOf("function renderFinalKeyEditorCard"));
assert.doesNotMatch(questionPreviewMediaSource, /question\.media/, "La vista previa de imagen no debe mezclar audio, video ni otros recursos multimedia.");
assert.match(styles, /\.er-question-image-preview\s*\{[\s\S]*aspect-ratio:\s*16 \/ 9;[\s\S]*\.er-question-image-actions\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/, "El editor de imagen debe mantener una vista previa proporcional y acciones claras.");
assert.doesNotMatch(questionCardSource, /er-question-type-panel/, "No debe conservarse el panel monolítico anterior.");
assert.match(styles, /\.er-question-section-title\s*\{[\s\S]*border-bottom:[\s\S]*#erMissionWorkspacePanel :where\(\.er-question-answer-panel, \.er-question-feedback-panel\)\s*\{[\s\S]*background:\s*var\(--er-panel-surface\) !important;/, "Las cards de configuración, respuestas y feedback deben compartir una superficie neutral.");
assert.doesNotMatch(source, /class="er-question-summary-header"|class="er-question-index"/, "El resumen de pregunta no debe conservar badges ni contenedores redundantes.");
assert.match(
  source,
  /class="er-question-summary-actions"[\s\S]*data-question-actions-toggle[\s\S]*fa-ellipsis-vertical[\s\S]*class="er-question-actions-menu hidden"[\s\S]*Regenerar pregunta[\s\S]*Eliminar pregunta/,
  "Las acciones generales de pregunta deben agruparse bajo el menú de tres puntos verticales."
);
assert.match(
  styles,
  /\.er-question-accordion > summary\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) auto;[\s\S]*\.er-question-summary-actions\s*\{[\s\S]*align-self:\s*start/,
  "La tarjeta debe alinear el contenido principal a la izquierda y el menú a la derecha."
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
assert.match(
  source,
  /class="er-mission-nav-question-delete[\s\S]*data-question-nav-action="delete-question"[\s\S]*aria-label="Eliminar pregunta \$\{questionIndex \+ 1\} y sus respuestas"/,
  "Cada pregunta del navegador de salas debe ofrecer una acción visible para eliminarla junto con sus respuestas."
);
assert.match(
  source,
  /function removeQuestion\(missionIndex, questionIndex\)[\s\S]*window\.confirm[\s\S]*removeQuestionAtIndex[\s\S]*scheduleOutputRefresh\(\)[\s\S]*Pregunta eliminada/,
  "La eliminación debe confirmarse, retirar la pregunta completa y persistir la actualización."
);
assert.doesNotMatch(
  source,
  /function resolveRepairCorrectOptionIndex|function repairQuestionAnswers/,
  "La auditoría no debe recalcular ni restaurar respuestas de opción múltiple localmente."
);
assert.doesNotMatch(
  source,
  /applyAuditedFeedbackFallbacks\(completeProject/,
  "La auditoría debe corregir el feedback señalado mediante el parche, sin reemplazarlo por un mensaje genérico."
);
assert.match(
  styles,
  /\.er-mission-nav-question-row\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) 24px[\s\S]*\.er-mission-nav-question-delete/,
  "La lista rápida debe reservar una columna visible para eliminar preguntas."
);
assert.match(
  styles,
  /\.er-studio-shell > \.er-mission-workspace-panel\s*\{[\s\S]*container:\s*er-mission-workspace \/ inline-size;[\s\S]*border-radius:\s*10px 0 0 10px[\s\S]*\.er-mission-workspace-panel \.er-editor-dock-header\s*\{[\s\S]*min-height:\s*44px/,
  "El workspace contextual debe usar el drawer compacto y plano de la variante shadcn."
);
assert.doesNotMatch(html, /id="erStudio(?:Kicker|Title)"/, "La cabecera no debe repetir el título de la sala o pregunta mostrado dentro del editor.");
assert.match(html, /id="erMissionWorkspacePanel"[^>]*aria-label="Editor de sala o pregunta"[^>]*tabindex="-1"/, "El panel debe conservar un nombre accesible aunque no muestre un título duplicado.");
assert.doesNotMatch(source, /syncMissionWorkspaceHeading|studioKicker|studioTitle/, "El cliente no debe reconstruir un encabezado que ya no existe.");
assert.match(styles, /--er-mission-workspace-width:\s*360px[\s\S]*width:\s*min\(var\(--er-mission-workspace-width\), calc\(100% - 20px\)\)/, "El workspace debe iniciar más compacto y respetar su ancho redimensionable.");
assert.match(source, /const MISSION_WORKSPACE_WIDTH_DEFAULT = 360;[\s\S]*const MISSION_WORKSPACE_WIDTH_MIN = 240;[\s\S]*const MISSION_WORKSPACE_WIDTH_MAX = 560;[\s\S]*function applyMissionWorkspaceWidth[\s\S]*--er-mission-workspace-width[\s\S]*wireMissionWorkspaceResizer/, "El workspace debe redimensionarse y persistir sus límites.");
assert.match(
  styles,
  /\.er-mission-workspace-panel :where\([\s\S]*\.er-field input[\s\S]*border-radius:\s*6px[\s\S]*\.er-mission-workspace-panel \.er-question-accordion/,
  "Los campos y preguntas del workspace deben compartir controles compactos y bordes neutros."
);
assert.doesNotMatch(
  source,
  /elements\.outputCard\.append\(elements\.missionWorkspacePanel\)/,
  "El editor de sala no debe montarse dentro del bloque Preview/JSON."
);

assert.match(
  source,
  /class="er-mission-actions"[\s\S]*data-mission-actions-toggle[\s\S]*fa-ellipsis-vertical[\s\S]*role="menu"[\s\S]*Sustituir imagen[\s\S]*Regenerar \$\{terms\.itemSingular\}[\s\S]*Eliminar \$\{terms\.itemSingular\}/,
  "Las acciones de sala deben agruparse bajo un único menú de tres puntos verticales."
);
assert.doesNotMatch(source, /class="er-mission-badges"/, "El encabezado de sala no debe repetir metadatos mediante badges.");
assert.doesNotMatch(styles, /\.er-mission-badges\s*\{/, "No deben quedar estilos huérfanos del bloque de badges eliminado.");
assert.match(styles, /\.er-mission-actions-menu,\s*\.er-question-actions-menu\s*\{[\s\S]*position:\s*absolute;[\s\S]*width:\s*190px;[\s\S]*\.er-mission-actions-menu button\.is-danger/, "Los menús de acciones deben usar una superficie compacta y distinguir la acción destructiva.");
assert.match(styles, /\.er-question-accordion:has\(\.er-question-actions-toggle\[aria-expanded="true"\]\)\s*\{[\s\S]*overflow:\s*visible;/, "El acordeón debe permitir que el menú abierto se muestre completo.");
assert.match(source, /function toggleEditorActionsMenu[\s\S]*aria-expanded[\s\S]*function wireMissionEditorEvents[\s\S]*data-mission-actions-toggle[\s\S]*data-question-actions-toggle[\s\S]*ArrowDown[\s\S]*Escape/, "Los menús de sala y pregunta deben compartir apertura, cierre y navegación por teclado.");

const briefHeaderIndex = html.indexOf("er-form-header-compact");
const briefActionsIndex = html.indexOf("er-actions er-brief-actions");
const briefFieldsIndex = html.indexOf("er-form-compact-grid er-brief-form-grid");
assert.ok(
  briefActionsIndex >= 0 && briefActionsIndex < briefFieldsIndex && briefFieldsIndex < briefHeaderIndex,
  "El brief debe mostrar una toolbar única y colocar su título dentro del contenido desplazable."
);
assert.match(
  styles,
  /\.er-brief-panel > \.er-form-card\s*\{[\s\S]*?grid-template-rows:\s*auto minmax\(0, 1fr\) auto;/,
  "El brief debe reservar filas para toolbar, contenido desplazable y CTA."
);
assert.doesNotMatch(styles, /transform:\s*scale\(1\.18\)/, "Los controles shadcn no deben cambiar de tamaño en hover o foco.");
for (const panelId of ["escapeRoomForm", "erMissionWorkspacePanel", "erInspectorPanel"]) {
  const panelTag = html.match(new RegExp(`<[^>]+id="${panelId}"[^>]*>`))?.[0] || "";
  assert.match(panelTag, /class="[^"]*er-panel-shell[^"]*"/, `${panelId} debe usar la primitiva de shell compartida.`);
}
assert.match(styles, /--er-panel-surface:\s*#ffffff;[\s\S]*--er-panel-primary:\s*#2563eb;[\s\S]*--er-panel-radius-sm:\s*6px;[\s\S]*--er-panel-toolbar-height:\s*44px;[\s\S]*--er-panel-control-height:\s*34px;/, "El estudio debe centralizar los tokens visuales de sus tres paneles.");

assert.match(
  source,
  /const inheritedFormState = buildInheritedSessionFormState\(\);[\s\S]*await createRemoteSession\(\{\s*title:\s*SESSION_TITLE_DEFAULT,\s*project:\s*null,\s*formState:\s*inheritedFormState,\s*activate:\s*true\s*\}\);/,
  "Crear una sesión nueva debe iniciar con nombre simple, contenido vacío y la última configuración del Brief."
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
  /const remoteAssetStats = await downloadRemoteAssets\(projectClone,\s*remoteFiles,\s*mediaFolder,\s*\{/,
  "El export debe capturar el resultado de la descarga de assets remotos."
);

assert.match(
  source,
  /failedSources:\s*\[\][\s\S]*return stats;/,
  "La descarga de assets remotos debe devolver estadísticas para degradar con seguridad ante CORS."
);

assert.match(
  source,
  /resources no pudieron optimizarse o descargarse|recursos no pudieron optimizarse o descargarse/,
  "El export debe avisar cuando algunos assets remotos no pudieron embebirse por CORS."
);

assert.match(source, /const packagedAssets = new Map\(\);/, "El export debe deduplicar recursos repetidos.");
assert.match(source, /assertExportPackageHasNoEmbeddedImages\(pkg\.files\);/, "El export debe bloquear base64 o blob residual antes de crear el ZIP.");

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

assert.doesNotMatch(
  source,
  /function questionHintContainsForbiddenAnswer|function buildAnswerSafeQuestionHint|function applyTargetedHintSafetyPatches|function normalizeQuestionHint/,
  "No deben quedar generadores locales de pistas capaces de sustituir el texto de Gemini."
);
assert.match(
  source,
  /function createQuestionDraft[\s\S]*reto:\s*partial\.reto \|\| ""[\s\S]*opciones:\s*provided\("opciones", \[\]\)[\s\S]*function createMissionDraft[\s\S]*historia:\s*partial\.historia \|\| ""[\s\S]*contexto:\s*partial\.contexto \|\| ""/,
  "Incluso los borradores manuales deben iniciar vacíos en vez de introducir texto editorial local."
);

assert.match(
  source,
  /isGeneratingImagesInBackground:\s*false[\s\S]*const blocksPreview = state\.isGenerating && !state\.isGeneratingImagesInBackground[\s\S]*state\.isGeneratingImagesInBackground = true/,
  "La generación automática de imágenes no debe dejar el overlay bloqueando el preview ya generado."
);
assert.doesNotMatch(
  source.slice(
    source.indexOf("const imageStats = await generateMissionImages(project, formData"),
    source.indexOf("const totalImages = imageStats.total + 1", source.indexOf("const imageStats = await generateMissionImages(project, formData"))
  ),
  /renderMissionEditor\(\)|renderOutputsNow\(\)/,
  "El avance de cada imagen no debe reconstruir repetidamente todo el editor y el iframe del juego."
);
assert.match(
  source,
  /const coverImage = await generateCoverImage\(project, formData\)[\s\S]*const imageStats = await generateMissionImages\(project, formData[\s\S]*const totalImages = imageStats\.total \+ 1[\s\S]*state\.isGeneratingImagesInBackground = false/,
  "La creación debe esperar portada, briefings y preguntas antes de marcar como terminada la fase de imágenes."
);
const completedImageGenerationSource = source.slice(
  source.indexOf("const totalImages = imageStats.total + 1", source.indexOf("const imageStats = await generateMissionImages(project, formData")),
  source.indexOf("} catch (imageError)", source.indexOf("const imageStats = await generateMissionImages(project, formData"))
);
assert.match(
  completedImageGenerationSource,
  /state\.isGeneratingImagesInBackground = false;[\s\S]*renderOutputsNow\(\);[\s\S]*setStatus\("", "info"\);[\s\S]*scheduleSessionSave\(\);/,
  "Al finalizar todas las imágenes, el banner de estado debe cerrarse inmediatamente."
);
assert.doesNotMatch(
  completedImageGenerationSource,
  /setStatus\(\s*`Escape room terminado:/,
  "El fin exitoso de las imágenes no debe dejar un banner permanente."
);
const generationSubmitStart = source.indexOf('elements.form.addEventListener("submit"');
const generationSubmitEnd = source.indexOf(
  'elements.btnAddMission.addEventListener("click"',
  generationSubmitStart
);
const generationSubmitSource = source.slice(generationSubmitStart, generationSubmitEnd);
assert.doesNotMatch(
  generationSubmitSource,
  /\(async \(\) => \{[\s\S]*generateMissionImages/,
  "La fase de imágenes no debe quedar desacoplada del submit como una promesa sin esperar."
);
assert.match(
  source,
  /catch \(imageError\)[\s\S]*fase de imágenes se interrumpió[\s\S]*setStatus\(state\.generationNote, "bad"\)[\s\S]*scheduleSessionSave\(\)/,
  "Una interrupción inesperada de imágenes debe conservar el contenido y mostrar un error visible."
);
assert.match(
  styles,
  /\.er-status-banner\s*\{[\s\S]*position:\s*fixed;[\s\S]*z-index:\s*2200;[\s\S]*width:\s*min\(560px, calc\(100vw - 48px\)\);/,
  "Los mensajes de progreso deben permanecer visibles sobre el estudio mientras la operación está activa."
);

assert.match(source, /function readPigPenZip\(file\)[\s\S]*findEscapeRoomManifestPath/, "La importación debe requerir el manifiesto editable de PigPen.");
assert.match(source, /function importZipAsNewSession\(file\)[\s\S]*createRemoteSession\([\s\S]*reloadEditor:\s*false/, "Importar un ZIP debe crear una sesión nueva sin sobrescribir la activa.");
assert.match(source, /restorePigPenArchiveAssets/, "La importación debe restaurar medios del paquete a URLs editables.");
assert.match(
  source,
  /function fetchBinaryAsset\(url\)[\s\S]*isRemoteUrl\(rawUrl\)[\s\S]*new URL\(rawUrl, window\.location\.href\)/,
  "El export debe descargar logo.png localmente en vez de enviarlo al proxy remoto."
);
assert.match(
  source,
  /function deriveFirebaseStoragePathFromUrl\(value = ""\)[\s\S]*host === "storage\.googleapis\.com"[\s\S]*parts\.shift\(\);[\s\S]*return decodeStorageObjectPath\(parts\.join\("\/"\)\)/,
  "El export debe derivar storagePath desde URLs firmadas de storage.googleapis.com para evitar CORS."
);
assert.match(
  source,
  /function resolveRemoteAssetDownloadUrl\(rawUrl = ""\)[\s\S]*const storagePath = deriveFirebaseStoragePathFromUrl\(parsed\.toString\(\)\);[\s\S]*\/api\/assets\/proxy-media\?storagePath=\$\{encodeURIComponent\(storagePath\)\}/,
  "El export debe preferir proxy-media con storagePath para recursos de Firebase Storage."
);
assert.match(
  source,
  /const candidates = isRemote && isFirebaseStorageDownloadUrl\(rawUrl\)[\s\S]*\? \[resolvedUrl, rawUrl\]/,
  "El export debe intentar primero el proxy antes del fetch directo a Firebase Storage."
);
assert.match(
  source,
  /isAssetProxyUrl\(candidateUrl\)[\s\S]*await authFetch\(candidateUrl\)[\s\S]*await fetch\(candidateUrl, \{ mode: "cors" \}\)/,
  "El proxy de assets debe descargarse con authFetch para enviar el token Firebase."
);
assert.match(source, /remoteFiles\["logo\.png"\]/, "El ZIP debe incluir el logo que usa index.html.");

assert.match(
  html,
  /<aside class="er-sessions-panel" aria-label="Sesiones de Escape Room">[\s\S]*id="erSessionsResizeHandle"[\s\S]*role="separator"[\s\S]*aria-orientation="vertical"/,
  "El panel de sesiones debe incluir un separador accesible para redimensionarlo."
);
assert.match(
  html,
  /id="erSessionFilters"[\s\S]*id="erSessionTrimesterFilter"[\s\S]*id="erSessionSubjectFilter"[\s\S]*id="erSessionThemeFilter"[\s\S]*id="erSessionFiltersModal"[\s\S]*id="erSessionTrimesterFilterModal"[\s\S]*id="erSessionSubjectFilterModal"[\s\S]*id="erSessionThemeFilterModal"/,
  "Trimestre, materia y tema deben estar disponibles en los filtros rápidos y en el modal."
);
assert.match(
  source,
  /function getFilteredSessions\(sessions = \[\]\)[\s\S]*sessionTrimester === trimester[\s\S]*sessionSubject === subject[\s\S]*sessionThemes\.includes\(theme\)/,
  "Los filtros de sesión deben combinar trimestre, materia y tema."
);
assert.match(
  source,
  /function getSessionThemeFilterValues\(session = \{\}\)[\s\S]*topicSummaries[\s\S]*academicNumber[\s\S]*formState\?\.unidadTemaSelect/,
  "El filtro de tema debe usar Tema 1, Tema 2, etc. y soportar sesiones antiguas."
);
assert.match(source, />Tema \$\{escapeHtml\(theme\)\}<\/option>/, "Las opciones deben mostrarse como Tema 1, Tema 2, etc.");
assert.match(
  source,
  /SESSIONS_WIDTH_STORAGE_KEY[\s\S]*function applySessionsWidth\([\s\S]*--er-sessions-width[\s\S]*localStorage\.setItem\(SESSIONS_WIDTH_STORAGE_KEY/,
  "El ancho del panel de sesiones debe persistirse."
);
assert.match(
  source,
  /const SESSIONS_WIDTH_DEFAULT = 340;[\s\S]*const SESSIONS_WIDTH_MIN = 200;[\s\S]*const SESSIONS_WIDTH_MAX = 560;/,
  "El panel de sesiones debe poder reducirse hasta 200 px sin alterar su ancho inicial."
);
assert.match(
  html,
  /id="erSessionsResizeHandle"[^>]*aria-valuemin="200"[^>]*aria-valuemax="560"[^>]*aria-valuenow="340"/,
  "El separador de sesiones debe anunciar los mismos límites que aplica el runtime."
);
assert.match(
  styles,
  /\.er-session-filters\s*\{[\s\S]*display:\s*flex;[\s\S]*align-items:\s*center;/,
  "Los filtros rápidos deben mantenerse en la misma fila."
);

console.log("PigPenCreator regressions OK.");
