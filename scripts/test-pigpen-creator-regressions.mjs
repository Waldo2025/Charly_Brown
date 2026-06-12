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
  source,
  /import \{ authFetchJson,\s*buildApiUrl,\s*hasAvailableApiBase \} from "\.\/api-client\.js";/,
  "PigPenCreator debe importar buildApiUrl y hasAvailableApiBase para descargar assets remotos vía backend."
);

assert.match(
  source,
  /function resolveRemoteAssetDownloadUrl\(rawUrl = ""\) \{[\s\S]*buildApiUrl\(`\/api\/assets\/proxy-media\?url=\$\{encodeURIComponent\(parsed\.toString\(\)\)\}`\)/,
  "PigPenCreator debe enrutar Firebase Storage por proxy-media en local y producción."
);

assert.match(
  source,
  /const finalUrl = resolveRemoteAssetDownloadUrl\(url\);[\s\S]*await fetch\(finalUrl,\s*\{\s*mode:\s*"cors"\s*\}\)/,
  "La descarga binaria debe usar la URL resuelta por el proxy."
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

const loadSessionMatch = source.match(/async function loadSessionIntoEditor\(session\) \{([\s\S]*?)\n\}/);
assert.ok(loadSessionMatch, "Debe existir la función loadSessionIntoEditor.");
const loadSessionBody = loadSessionMatch[1];
assert.ok(
  loadSessionBody.indexOf('resetEditorState({ preserveForm: false });') >= 0,
  "Cargar una sesión debe reiniciar el formulario antes de hidratarlo."
);
assert.ok(
  loadSessionBody.indexOf('resetEditorState({ preserveForm: false });') < loadSessionBody.indexOf("applyFormState({ ...buildAcademicFormState(session.project), ...(session.formState || {}) });"),
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
assert.match(
  renderSessionListBody,
  /state\.activeSessionMeta\?\.title\s*\|\|\s*SESSION_TITLE_DEFAULT/,
  "La sesión activa debe mostrar el título persistido de forma simple."
);
assert.doesNotMatch(
  renderSessionListBody,
  /deriveSessionTitle\(\)\s*\|\|\s*state\.activeSessionMeta\?\.title/,
  "La cabecera de la sesión activa no debe priorizar el formulario actual sobre el título guardado."
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
  /estacion:\s*unidadTemaModo === "Secundaria" \? \(document\.getElementById\("estacionSelect"\)\?\.value \|\| "Primera estación"\) : ""/,
  "Secundaria debe persistir la estación seleccionada."
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

console.log("PigPenCreator regressions OK.");
