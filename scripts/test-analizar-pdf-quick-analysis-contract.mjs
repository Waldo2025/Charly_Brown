import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../public/analizarPDF/analizar-pdf-app.js", import.meta.url), "utf8");
const resultsSource = readFileSync(new URL("../public/analizarPDF/analizar-pdf-results.js", import.meta.url), "utf8");
const storeSource = readFileSync(new URL("../public/analizarPDF/analizar-pdf-session-store.js", import.meta.url), "utf8");
const logicSource = readFileSync(new URL("../public/analizarPDF/analizar-pdf-session-logic.js", import.meta.url), "utf8");
const htmlSource = readFileSync(new URL("../public/PeppermintPattyAnalizer.html", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../public/analizarPDF/analizar-pdf.css", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("../public/analizarPDF/analizar-pdf-api.js", import.meta.url), "utf8");
const serverSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
const backendSessionSource = readFileSync(new URL("../backend/analizar-pdf.js", import.meta.url), "utf8");
const extractSelectOptions = (source, selectId) => {
  const match = source.match(new RegExp(`<select id="${selectId}"[\\s\\S]*?<\\/select>`));
  assert.ok(match, `Debe existir el select ${selectId}.`);
  return Array.from(match[0].matchAll(/<option value="([^"]*)">/g), (optionMatch) => optionMatch[1]);
};

assert.match(htmlSource, /id="analizarPdfCreateTemplateFromFileBtn"/, "El hero debe incluir botón para crear plantilla desde archivo.");
assert.match(htmlSource, /id="analizarPdfCreateTemplatesFromAllBtn"/, "El hero debe incluir botón para crear plantillas desde todas las fichas.");
assert.match(htmlSource, /id="analizarPdfQuickAnalyzeAllBtn"/, "El hero debe incluir botón de análisis rápido.");
assert.match(htmlSource, /id="analizarPdfCreateDefaultRevisionsBtn"/, "El hero debe incluir botón para crear fichas base.");
assert.match(htmlSource, /id="analizarPdfDefaultRevisionsModal"/, "Crear fichas base debe abrir un modal de configuración global.");
assert.match(htmlSource, /id="analizarPdfDefaultSourceTypeInput"[\s\S]*<option value="idml">IDML<\/option>/, "El modal de fichas base debe usar Formato IDML por default.");
assert.match(htmlSource, /id="analizarPdfDefaultBookTypeInput"/, "El modal de fichas base debe pedir Tipo.");
assert.match(htmlSource, /id="analizarPdfDefaultNivelInput"/, "El modal de fichas base debe pedir Nivel.");
assert.match(htmlSource, /id="analizarPdfDefaultGradoInput"/, "El modal de fichas base debe pedir Grado.");
assert.match(htmlSource, /id="analizarPdfDefaultTrimestreInput"/, "El modal de fichas base debe pedir Trimestre.");
assert.match(htmlSource, /id="analizarPdfDefaultEdicionNumeroInput"/, "El modal de fichas base debe pedir Edición.");
assert.match(htmlSource, /id="analizarPdfDefaultRevisionNumeroInput"/, "El modal de fichas base debe pedir Revisión.");
assert.doesNotMatch(htmlSource, /analizar-pdf-job-meta-shell/, "El bloque visible de logs no debe renderizarse en el analizador.");
assert.doesNotMatch(htmlSource, /id="analizarPdfJobMeta"/, "El log visible analizarPdfJobMeta debe quedar removido del DOM.");
assert.match(htmlSource, /<section class="analizar-pdf-hero">[\s\S]*id="analizarPdfEditorialPanel"[\s\S]*<\/section>\s*<section class="analizar-pdf-workspace">/, "La ficha editorial debe vivir dentro del hero antes del workspace.");
assert.match(cssSource, /\.analizar-pdf-hero\s*\{[\s\S]*position:\s*sticky/, "El hero debe quedar flotante/sticky en el top.");
assert.match(htmlSource, /id="analizarPdfMappingGroupsList"/, "El modal de configuraciones debe incluir lista de grupos de plantillas.");
assert.match(htmlSource, /id="analizarPdfCreateMappingGroupBtn"/, "El modal de configuraciones debe permitir crear grupos de plantillas.");
assert.match(htmlSource, /id="analizarPdfDeleteMappingGroupBtn"/, "El modal de configuraciones debe permitir eliminar grupos de plantillas.");
assert.match(htmlSource, /class="analizar-pdf-template-list-panel"/, "El modal debe separar la lista de plantillas del panel de grupos.");
assert.match(htmlSource, /id="analizarPdfSelectedMappingGroupLabel"/, "La lista de plantillas debe indicar el grupo seleccionado.");
assert.match(htmlSource, /id="analizarPdfMappingEditorEmpty"/, "El editor debe mostrar placeholder hasta seleccionar plantilla.");
assert.deepEqual(
  extractSelectOptions(htmlSource, "analizarPdfMappingUnidadInput"),
  extractSelectOptions(htmlSource, "analizarPdfUnidadInput"),
  "Las opciones de unidad del mapeo deben ser iguales a las de la ficha editorial.",
);
const heroActionsMatch = htmlSource.match(
  /<div class="analizar-pdf-composer-actions analizar-pdf-hero-actions">([\s\S]*?)<\/div>\s*<\/div>\s*<\/header>/,
);
assert.ok(heroActionsMatch, "El hero debe conservar el contenedor de acciones.");
const heroActionGroups = Array.from(
  heroActionsMatch[1].matchAll(/<div class="analizar-pdf-hero-action-group"[^>]*>([\s\S]*?)<\/div>/g),
).map((match) => Array.from(match[1].matchAll(/id="([^"]+)"/g), (idMatch) => idMatch[1]));
assert.deepEqual(
  heroActionGroups,
  [
    ["analizarPdfMappingsBtn"],
    ["analizarPdfCreateTemplateFromFileBtn", "analizarPdfCreateTemplatesFromAllBtn"],
    ["analizarPdfCreateDefaultRevisionsBtn", "analizarPdfAddRevisionBtn"],
    ["analizarPdfQuickAnalyzeAllBtn", "analizarPdfAnalyzeAllBtn"],
    ["analizarPdfSaveBtn"],
  ],
  "Los botones del hero deben mantener grupos y orden DOM accesible.",
);
assert.doesNotMatch(appSource, /analizar-pdf-[\w-]+\.js\?v=2026-1\.0\.10\.422/, "analizar-pdf-app.js no debe importar módulos internos con cache-buster viejo.");

assert.match(apiSource, /createAnalizarPdfIdmlTemplateFromFile/, "El cliente API debe exponer creación de plantilla IDML.");
assert.match(apiSource, /runAnalizarPdfQuickOrthotypography/, "El cliente API debe exponer análisis rápido ortotipográfico.");
assert.match(apiSource, /postAnalizarPdfIdmlTool/, "El cliente API debe reutilizar upload/stored-source para herramientas IDML.");
assert.match(apiSource, /X-Local-Analysis-Context/, "El cliente debe enviar contexto local mínimo de análisis al encolar jobs.");
assert.match(apiSource, /LOCAL_ANALYSIS_CONTEXT_HEADER_MAX_LENGTH\s*=\s*6000/, "El cliente debe limitar el tamaño del contexto local para evitar HTTP 431 en análisis por lote.");
assert.match(apiSource, /contexto local omitido: excede el límite seguro de header/, "El cliente debe omitir contexto local demasiado grande en vez de cortar el análisis.");
assert.match(appSource, /handleCreateTemplatesFromAll/, "El frontend debe implementar creación masiva de plantillas.");
assert.match(appSource, /function buildLocalAnalysisContextForJob/, "El frontend debe construir contexto local mínimo para recortables/anexos ya analizados.");
assert.match(appSource, /compactResolvedDestinations/, "El contexto local debe compactar destinos resueltos antes de enviarlos por header.");
assert.match(appSource, /originCodes,\s*\n\s*destinationCodes,\s*\n\s*resolvedDestinations,/, "El contexto local solo debe enviar claves mínimas de recortables por página.");
assert.doesNotMatch(appSource, /resolvedLinks:\s*Array\.isArray\(summary\.resolvedLinks\)/, "El contexto local no debe enviar resolvedLinks completos por header.");
assert.doesNotMatch(appSource, /pendingDestinations:\s*Array\.isArray\(summary\.pendingDestinations\)/, "El contexto local no debe enviar pendingDestinations completos por header.");
assert.doesNotMatch(appSource, /codeTitles:\s*summary\.codeTitles/, "El contexto local no debe enviar codeTitles completos por header.");
assert.match(appSource, /localAnalysisContext,\s*\n\s*\}/, "El contexto local debe adjuntarse tanto a upload como a stored-source.");
assert.match(appSource, /session = await persistActiveSession\(\[\]\)/, "Crear plantillas desde todas debe sincronizar primero la ficha activa del formulario.");
assert.match(appSource, /function buildEditorialProcessLabel/, "El spinner editorial debe construir mensajes personalizados por ficha y etapa.");
assert.match(appSource, /getPollingStageLabel/, "El polling debe mostrar la etapa actual del proceso en el spinner editorial.");
assert.match(appSource, /Procesando estructura, estilos y hallazgos/, "El spinner debe indicar cuando el análisis procesa estructura, estilos y hallazgos.");
assert.match(appSource, /Guardando copia local del IDML|Usando copia guardada del IDML/, "El spinner debe indicar si usa copia local o guardada del IDML.");
assert.match(appSource, /buildTemplateCreationTargets:resolved/, "La creación masiva debe registrar targets y omitidos para diagnosticar fichas no detectadas.");
assert.match(appSource, /resolveDefaultRevisionUnitCountByTrimester[\s\S]*trimestre 2[\s\S]*return 6[\s\S]*trimestre 1[\s\S]*trimestre 3[\s\S]*return 7/, "Las fichas base deben calcular unidades por trimestre: T1/T3=7, T2=6.");
assert.match(appSource, /openDefaultRevisionsModal/, "El botón de fichas base debe abrir modal previo.");
assert.match(appSource, /handleCreateDefaultRevisions\(collectDefaultRevisionsConfigFromDom\(\)\)/, "La confirmación del modal debe crear fichas base con datos globales.");
assert.match(appSource, /draft\.sourceType = "idml"/, "Crear fichas base debe dejar la sesión en formato IDML.");
assert.match(appSource, /<optgroup label=/, "El selector de plantillas por ficha debe agrupar opciones con optgroup.");
assert.match(appSource, /createTemplateMappingForRevisionFile/, "La creación de plantilla individual y masiva debe compartir helper.");
assert.match(appSource, /buildTemplateGroupTitle/, "La creación masiva debe crear un grupo de plantillas.");
assert.match(appSource, /getOrCreateMappingGroup\(buildTemplateGroupTitle\(session\)\)/, "La creación masiva debe reutilizar el grupo de plantillas existente en vez de duplicarlo.");
assert.match(appSource, /findExistingTemplateMappingForRevision/, "La creación masiva debe actualizar plantillas existentes por ficha dentro del mismo grupo.");
assert.match(appSource, /removeMappingGroupFromStorage/, "El modal debe poder eliminar grupos de plantillas.");
assert.match(appSource, /deleteAnalizarPdfStyleMapping\(mapping\.id\)/, "Eliminar un grupo debe borrar todas las plantillas dentro del grupo.");
assert.match(appSource, /Esta acción no se puede deshacer/, "Eliminar un grupo debe pedir confirmación destructiva explícita.");
assert.match(appSource, /data-mapping-group-id/, "El modal debe renderizar destinos de grupo para drag/drop.");
assert.match(appSource, /application\/x-analizar-pdf-mapping-id/, "Las plantillas deben poder arrastrarse hacia grupos.");
assert.match(appSource, /activeMappingGroupId/, "El modal debe conservar el grupo seleccionado separado de la plantilla activa.");
assert.match(appSource, /getMappingsForActiveGroup/, "La lista de plantillas debe filtrarse por grupo seleccionado.");
assert.match(appSource, /analizar-pdf-mapping-editor[^"]*is-empty|classList\.toggle\("is-empty"/, "El editor no debe mostrar mapeo hasta seleccionar una plantilla.");
assert.match(appSource, /LEGACY_DEFAULT_MAPPING_IDS/, "El modal debe reconocer plantillas default legacy para no renderizarlas.");
assert.match(appSource, /function isLegacyDefaultStyleMapping/, "El frontend debe filtrar plantillas default legacy por id/slug/título.");
assert.match(appSource, /legacyMappings[\s\S]*deleteAnalizarPdfStyleMapping/, "El frontend debe intentar borrar plantillas default legacy que aún vengan del backend.");
assert.match(backendSessionSource, /groupId:\s*clampText\(source\.groupId/, "El backend debe persistir groupId de plantillas.");
assert.match(backendSessionSource, /groupTitle:\s*clampText\(source\.groupTitle/, "El backend debe persistir groupTitle de plantillas.");
assert.match(serverSource, /\/api\/analizar-pdf\/idml-template-from-file/, "El backend debe exponer endpoint de plantilla desde IDML.");
assert.match(serverSource, /\/api\/analizar-pdf\/quick-orthotypography/, "El backend debe exponer endpoint de análisis rápido.");
assert.match(serverSource, /parseAnalizarPdfLocalAnalysisContextHeader/, "El backend debe parsear el contexto local de análisis enviado por el navegador.");
assert.match(serverSource, /mergeAnalizarPdfLocalAnalysisContext/, "El backend debe fusionar contexto local mínimo antes de ejecutar el job.");
assert.match(serverSource, /analyze\.local-context\.merged/, "El backend debe registrar cuando un job usa contexto local enriquecido.");
assert.match(serverSource, /const isIdmlFile =[\s\S]*?\.idml/, "El backend debe inferir IDML por nombre/ruta si sourceType legacy viene como PDF.");
assert.match(backendSessionSource, /const inferredSourceType =[\s\S]*?\.idml/, "La sanitización backend debe conservar IDML por extensión aunque falte sourceType.");
assert.match(appSource, /function isIdmlFileEntry/, "El frontend debe inferir fichas IDML por nombre/ruta.");
assert.match(appSource, /const hasIdmlFile =[\s\S]*?isIdmlFileEntry/, "El análisis rápido no debe depender solo de session.sourceType.");

assert.match(storeSource, /function normalizeQuickAnalysis/, "El session-store debe normalizar quickAnalysis.");
assert.match(storeSource, /redactionIssues:\s*Array\.isArray\(source\.redactionIssues\)/, "El session-store debe conservar redactionIssues.");
assert.match(storeSource, /redactionIssueCount/, "El session-store debe conservar el conteo de propuestas de redacción.");
assert.match(storeSource, /quickAnalysis:\s*normalizeQuickAnalysis\(source\.quickAnalysis\)/, "El session-store debe conservar quickAnalysis localmente.");
assert.match(storeSource, /const sourceType = source\.sourceType === "idml" \|\| \/.+?idml/, "El session-store debe inferir sourceType IDML por nombre/ruta.");
assert.match(storeSource, /quickAnalysis:\s*null/, "El payload remoto debe retirar quickAnalysis para no inflar Firestore.");
assert.match(logicSource, /hasRenderableQuickAnalysis/, "El merge renderizable debe conservar entradas con solo quickAnalysis.");
assert.match(logicSource, /!hasRenderableAnalysis\(entry\) && !hasRenderableQuickAnalysis\(entry\)/, "quickAnalysis no debe descartarse por faltar result completo.");

assert.match(appSource, /localFile\.quickAnalysis/, "La restauración local debe mezclar quickAnalysis por fileId.");
assert.match(appSource, /quickAnalysis:\s*entry\.quickAnalysis \|\| null/, "buildRenderableSession debe exponer quickAnalysis por archivo.");
assert.match(appSource, /railTitle:\s*buildEditorialRailTitle\(session, revisionEntry\)/, "El rail debe usar datos de ficha editorial como título visible.");
assert.doesNotMatch(
  appSource,
  /targetFile\.result\s*=\s*quickAnalysis/,
  "El análisis rápido no debe escribirse en file.result.",
);

assert.match(resultsSource, /getRailDisplayTitle/, "El renderer del rail debe resolver un título editorial separado del nombre de archivo.");
assert.match(resultsSource, /railTooltip/, "El nombre real del archivo debe quedar disponible como tooltip del rail.");
assert.match(resultsSource, /data-action="toggle-rail-groups"/, "El rail debe incluir un único botón para expandir o contraer todos los grupos.");
assert.match(resultsSource, /data-action="toggle-rail-nonempty-groups"/, "El rail debe incluir un botón para abrir solo grupos con cambios o errores.");
assert.match(resultsSource, /\{ id: "redaction", label: "Propuestas de redacción" \}/, "El filtro del rail debe incluir Propuestas de redacción.");
assert.match(resultsSource, /function getRedactionAnchorId/, "El renderer debe crear anchors propios para propuestas de redacción.");
assert.match(resultsSource, /pagesWithRedactionIssues/, "El rail debe agrupar páginas con propuestas de redacción.");
assert.match(resultsSource, /renderRedactionSuggestionList/, "El reporte por página debe renderizar propuestas de redacción separadas.");
assert.match(resultsSource, /page\?\.redactionIssues/, "La sección de propuestas solo debe mostrarse cuando haya redactionIssues.");
assert.doesNotMatch(resultsSource, /data-action="expand-rail-groups"/, "El rail no debe usar un botón separado para expandir todos los grupos.");
assert.doesNotMatch(resultsSource, /data-action="collapse-rail-groups"/, "El rail no debe usar un botón separado para contraer todos los grupos.");
assert.match(resultsSource, /groups\.some\(\(details\) => details\.open !== true\)/, "El toggle debe expandir si hay grupos cerrados y contraer si todos están abiertos.");
assert.match(resultsSource, /railOpenStateByKey\.set\(groupKey, shouldOpen\)/, "Expandir/contraer todo debe persistir el estado de cada grupo del rail.");
assert.match(resultsSource, /const hasLinks = Boolean\(details\.querySelector/, "Abrir solo hallazgos debe detectar grupos con accesos reales.");
assert.match(resultsSource, /kind === "recortable" && extractRecortableCodeKeys/, "El match global por codigo solo debe pintar verdes recortables, no anexos/fichas/videos.");
assert.match(resultsSource, /\^\(\?:anexos\?\|fichas\?\|videos\?\)\\b/, "Anexo PaT1 no debe alimentar el set global de match de recortables.");
assert.doesNotMatch(resultsSource, /<summary><span>Paginación<\/span>/, "El rail no debe ocupar espacio con fila de Paginación.");
assert.doesNotMatch(resultsSource, /<summary><span>Corrección selectiva<\/span>/, "El rail no debe ocupar espacio con fila de Corrección selectiva.");
assert.match(resultsSource, /renderQuickAnalysisReports/, "El renderer debe pintar un reporte rápido independiente.");
assert.match(resultsSource, /renderQuickAnalysisRailGroup/, "El rail debe incluir grupo separado para análisis rápido.");
assert.match(resultsSource, /paragraphText/, "El reporte rápido debe mostrar el párrafo completo del hallazgo.");
assert.match(resultsSource, /groupedByText/, "El reporte por página debe agrupar alias por texto para no duplicar párrafo/carácter.");
assert.match(resultsSource, /styleSummary/, "La fila agrupada debe mostrar estilos de párrafo/carácter asociados al mismo texto.");
assert.match(resultsSource, /if \(!cleanValue \|\| cleanValue === "N\/D"\) return;/, "Las filas configuradas sin texto o N/D no deben renderizarse.");
assert.match(resultsSource, /function collectSwatchesForAliasValue/, "El renderer debe cruzar alias mapeados con swatches del texto IDML.");
assert.match(resultsSource, /function collectSwatchesForTextValue/, "El renderer debe resolver swatches por texto aunque el mapeo de estilo no coincida exacto.");
assert.match(resultsSource, /function isNeutralSwatchName/, "El renderer debe distinguir swatches neutros como Black/Paper.");
assert.match(resultsSource, /function resolveSwatchHex/, "El renderer debe resolver swatches contra swatchInventory.");
assert.match(resultsSource, /function getPageBodyLineStyle/, "El renderer debe calcular estilo visual para textos del reporte por página.");
assert.match(resultsSource, /resolveSwatchHex\(line\?\.session \|\| null, line\?\.swatches \|\| \[\]\)/, "Los textos del reporte por página deben usar el color del swatch del IDML.");
assert.match(resultsSource, /withLineSession\(line, options\?\.session \|\| null\)/, "Las líneas del reporte deben recibir la sesión para resolver swatchInventory.");
assert.match(resultsSource, /-webkit-text-fill-color:\$\{escapeHtmlAttr\(row\.swatchHex\)\}/, "Los valores del reporte deben aplicar también -webkit-text-fill-color del swatch.");
assert.match(cssSource, /analizar-pdf-ortho-rail-body[\s\S]*column-width:\s*190px/, "El rail debe reacomodar grupos con columnas tipo masonry al redimensionarse.");
assert.match(cssSource, /analizar-pdf-ortho-rail-group[\s\S]*break-inside:\s*avoid/, "Los grupos del rail no deben partirse ni encimarse al expandirse.");
assert.match(cssSource, /analizar-pdf-ortho-file-group[\s\S]*columns:\s*148px/, "Los summaries internos del rail deben fluir en columnas al ampliar el panel.");
assert.match(cssSource, /analizar-pdf-default-revisions-grid input,[\s\S]*analizar-pdf-default-revisions-grid select[\s\S]*height:\s*42px/, "Los campos del modal Crear fichas base deben usar la misma altura que la ficha editorial.");
assert.match(cssSource, /#analizarPdfMappingsModal \.analizar-pdf-modal-card\s*\{[\s\S]*width:\s*min\(1680px,\s*96vw\)/, "El modal de mapeos debe ser más ancho que el modal general.");
assert.match(cssSource, /analizar-pdf-biblio-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(7,\s*minmax\(92px,\s*1fr\)\)/, "La ficha editorial debe usar una grilla compacta de 7 columnas.");
assert.match(cssSource, /label\[for="analizarPdfBookTypeInput"\][\s\S]*order:\s*1/, "La ficha editorial debe ordenar Tipo como primer campo visual.");
assert.match(cssSource, /label\[for="analizarPdfFileInput"\][\s\S]*order:\s*12[\s\S]*grid-column:\s*span 2/, "El campo Archivo debe moverse después de metadatos y ocupar dos columnas.");

console.log("Analizar PDF quick analysis contract OK.");
