import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const GENERAR_LECTURA_INGESTA_PATH = new URL("./generarLectura-iaIngesta.js", import.meta.url);
const GENERAR_UNIDAD_PATH = new URL("./generarUnidad.js", import.meta.url);
const GENERAR_LECTURA_HTML_PATH = new URL("../generarLectura.html", import.meta.url);

test("ingesta prompt keeps resource continuations inside the previous activity", async () => {
  const source = await readFile(GENERAR_LECTURA_INGESTA_PATH, "utf8");
  assert.match(
    source,
    /Si una línea empieza con "Además," o "También,"[\s\S]*debe quedar unida al mismo párrafo principal de la actividad anterior/i
  );
});

test("imported text rewrite prompt preserves continuation resource lines inside the same activity", async () => {
  const source = await readFile(GENERAR_UNIDAD_PATH, "utf8");
  assert.match(
    source,
    /Si una línea comienza con "Además," o "También,"[\s\S]*debe permanecer dentro de la MISMA actividad anterior/i
  );
});

test("imported text without a real heading falls back to 'Falta título'", async () => {
  const source = await readFile(GENERAR_UNIDAD_PATH, "utf8");
  assert.match(source, /const importedHasOwnHeading = !!importedTextPayload && _unidadImportedPayloadHasOwnHeading\(importedTextPayload\);/);
  assert.match(source, /: "Falta título"\)/);
  assert.match(source, /if \(importedTextPayload\) \{\s*tituloCreativoLimpioBase = tituloRenderSubtema;/);
});

test("imported html normalization preserves numbering in activity lead and suppresses imported objective subtitle", async () => {
  const source = await readFile(GENERAR_UNIDAD_PATH, "utf8");
  assert.match(source, /function _unidadNormalizeImportedAscHtml\(/);
  assert.match(source, /const targetText = `\$\{index \+ 1\}\. \$\{cleanText\}`;/);
  assert.match(source, /\$\{importedTextPayload \? "" : `<h5 style="color:#666;font-weight:normal;">\$\{objetivoT\}<\/h5>`\}/);
});

test("ingesta stores exact raw html separately from optional structured analysis", async () => {
  const source = await readFile(GENERAR_LECTURA_INGESTA_PATH, "utf8");
  assert.match(source, /const rawHtmlExact = txtIngesta\.innerHTML\.trim\(\) \|\| "";/);
  assert.match(source, /rawHtmlExact,\s*plainText,/);
  assert.match(source, /rawHtmlExact:\s*item\.rawHtmlExact \|\| ""/);
  assert.match(source, /structuredHtml:\s*item\.structuredHtml \|\| ""/);
});

test("imported alumno rendering prioritizes rawHtmlExact and teacher notes use a dedicated imported-document path", async () => {
  const source = await readFile(GENERAR_UNIDAD_PATH, "utf8");
  assert.match(source, /const rawHtmlExact = String\(runtimePayload\.rawHtmlExact \|\| ""\)\.trim\(\);/);
  assert.match(source, /rawHtmlExact,\s*structuredHtml,\s*originalHtml,\s*plainText,/);
  assert.match(source, /function _unidadRenderImportedAlumnoHtmlSmart\(/);
  assert.match(source, /function _unidadRenderImportedAlumnoHtmlExact\(/);
  assert.match(source, /extraerActividades\(raw\)/);
  assert.match(source, /looksLikeMultipleActivities/);
  assert.match(source, /return _unidadConvertImportedTextToAscHtml\(raw, options\);/);
  assert.match(source, /importedTextPayload\.rawHtmlExact[\s\S]*\|\|\s*importedTextPayload\.structuredHtml[\s\S]*\|\|\s*importedTextPayload\.originalHtml/);
  assert.match(source, /htmlAlumno = _unidadRenderImportedAlumnoHtmlSmart\(importedSource, \{/);
  assert.match(source, /function _unidadGenerarNotasMaestroDesdeDocumentoImportado\(/);
  assert.match(source, /importedTextPayload\s*\?\s*await _unidadGenerarNotasMaestroDesdeDocumentoImportado\(/);
});

test("teacher notes fallback cleans duplicated resource continuation from lead text", async () => {
  const source = await readFile(GENERAR_UNIDAD_PATH, "utf8");
  assert.match(source, /function _unidadCleanTeacherLeadForNotes\(/);
  assert.match(source, /Además\|Ademas\|También\|Tambien/);
  assert.match(source, /function _unidadNormalizeTeacherParagraphText\(/);
  assert.match(source, /replace\(\/\\\.\\s\*\(\?:Recortable\|Anexo\|Ficha\|Video\)\\s\*,\/gi, "\. "\)/);
});

test("ingesta modal keeps internal scroll enabled on ingesta body", async () => {
  const source = await readFile(GENERAR_LECTURA_HTML_PATH, "utf8");
  assert.match(source, /#modalIngestaMasivaIA \.ingesta-body\s*\{[\s\S]*overflow-y:\s*auto;/i);
  assert.match(source, /#modalIngestaMasivaIA \.modal-lecturas-contenido\.ingesta-panel\s*\{[\s\S]*height:\s*min\(84vh,\s*760px\);/i);
});

test("proyectos UI supports dynamic multi-subtopic rows with add and drag controls", async () => {
  const source = await readFile(GENERAR_UNIDAD_PATH, "utf8");
  assert.match(source, /window\.__unidadProyectoSubtemasConfig = window\.__unidadProyectoSubtemasConfig \|\| \{\};/);
  assert.match(source, /function _unidadRenderProyectoSubtemaRows\(/);
  assert.match(source, /id="btn-agregar-subtema-Proyectos"/);
  assert.match(source, /setAttribute\("draggable", "true"\)/);
  assert.match(source, /name = `generar_proyecto_subtema_\$\{row\.rowId\}`/);
  assert.match(source, /name = `num_proyecto_\$\{row\.rowId\}`/);
  assert.doesNotMatch(source, /String\(subtema \|\| ""\)\.trim\(\) !== "Proyectos"/);
});

test("proyectos generation no longer consumes only the first subtopic and passes an ordered list to the prompt", async () => {
  const source = await readFile(GENERAR_UNIDAD_PATH, "utf8");
  assert.doesNotMatch(source, /const subtema = subtemasDeCategoria\[0\];/);
  assert.match(source, /const projectRows = _unidadGetOrderedProjectRows\(\)[\s\S]*filter\(\(row\) => subtemasDeCategoria\.includes\(row\.subtema\)\)/);
  assert.match(source, /if \(!projectRows\.length\) \{/);
  assert.match(source, /subtemasOrdenados:\s*projectRows\.map\(\(row\) => row\.subtema\)/);
  assert.match(source, /window\.construirPromptProyecto = function \([\s\S]*subtemasOrdenados/);
});

test("ingesta sidebar uses live project rows instead of a static legacy map", async () => {
  const source = await readFile(GENERAR_LECTURA_INGESTA_PATH, "utf8");
  assert.match(source, /window\.__unidadIngestaProyectoRowIdsPorCategoria = window\.__unidadIngestaProyectoRowIdsPorCategoria \|\| \{\};/);
  assert.match(source, /Object\.entries\(window\.categoriaPorSubtema \|\| \{\}\)/);
  assert.match(source, /const projectRows = Array\.isArray\(window\.__unidadProyectoSubtemasConfig\?\.rows\)/);
  assert.match(source, /data-project-row-id="\$\{sub\.rowId \|\| ""\}"/);
  assert.match(source, /input\[name="generar_proyecto_subtema_\$\{item\.projectRowId\}"\]/);
});

test("proyectos generation combines imported payloads, obtains objectives dynamically, propagates resources, and cleans Proyectos keys if inactive", async () => {
  const source = await readFile(GENERAR_UNIDAD_PATH, "utf8");
  // 1. Combining imported text payloads
  assert.match(source, /let importedTextPayloadProyecto = null;/);
  assert.match(source, /combinedStructuredHtmls\.push\(wrapHtml\(p\.structuredHtml, title, p\)\)/);
  // 2. Fetching objectives dynamically
  assert.match(source, /_unidadGetSyAValueForSubtema\(subtema, "T"\)/);
  // 3. Registering resources under all active subthemes
  assert.match(source, /for \(const row of projectRows\)/);
  assert.match(source, /const rowSub = row\.subtema;/);
  assert.match(source, /window\.recursosGeneradosSubtemas\[rowSub\]/);
  // 4. Cleaning up Proyectos sequence keys if not active
  assert.match(source, /const containsProyectos = projectRows\.some\(row => row\.subtema === "Proyectos"\);/);
  assert.match(source, /delete secuenciaActual\["Proyectos_T"\];/);
});
