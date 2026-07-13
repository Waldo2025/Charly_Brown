import assert from "node:assert/strict";
import fs from "node:fs";

const version = JSON.parse(
  fs.readFileSync("/Users/waldolopez/Documents/CharlyBrown/public/version.json", "utf8")
);
const peppermintHtml = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/PeppermintPattyAnalizer.html",
  "utf8"
);
const peppermintCss = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf.css",
  "utf8"
);

assert.match(version.version, /^1\.0\.10\.\d+$/);
assert.equal(version.cache_version, version.build);
const changelog = Array.isArray(version.changelog) ? version.changelog : [];
const releaseNotes = Array.isArray(version.releaseNotes) ? version.releaseNotes : [];
const notes = [...changelog, ...releaseNotes];
assert.doesNotMatch(peppermintHtml, /analizar-pdf-job-meta-shell/);
assert.doesNotMatch(peppermintHtml, /id="analizarPdfJobMeta"/);
assert.match(peppermintHtml, /<section class="analizar-pdf-hero">[\s\S]*id="analizarPdfEditorialPanel"[\s\S]*<\/section>\s*<section class="analizar-pdf-workspace">/);
assert.match(peppermintCss, /\.analizar-pdf-hero\s*\{[\s\S]*position:\s*sticky/);
assert.ok(
  String(changelog[0] || "").includes("Peppermint Patty")
    && String(changelog[0] || "").includes("analizar-pdf-meta-value")
    && String(changelog[0] || "").includes("fallback por texto")
    && String(changelog[0] || "").includes("swatches no neutros")
    && String(changelog[0] || "").includes("Black/Paper"),
  "La nota más reciente debe reflejar color de meta-value por texto y swatch no neutro."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("Propuestas de redacción")
    && String(note || "").includes("presupuesto Gemini propio")
    && String(note || "").includes("oculta")
    && String(note || "").includes("rail")),
  "Las release notes deben conservar presupuesto propio de redacción."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("swatch IDML")
    && String(note || "").includes("textos")
    && String(note || "").includes("reporte por página")
    && String(note || "").includes("solucionario")),
  "Las release notes deben conservar color de swatch en textos del reporte por página."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("Propuestas de redacción")
    && String(note || "").includes("Gemini")
    && String(note || "").includes("reporte por página")
    && String(note || "").includes("rail")
    && String(note || "").includes("códigos de complementos")),
  "Las release notes deben conservar Propuestas de redacción con Gemini."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("colorea")
    && String(note || "").includes("reporte por página")
    && String(note || "").includes("swatch real")
    && String(note || "").includes("swatchInventory")),
  "Las release notes deben conservar el color de swatch en valores del reporte."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("retira")
    && String(note || "").includes("Ver página IDML")
    && String(note || "").includes("Ver reporte")
    && String(note || "").includes("carpeta Links")),
  "Las release notes deben conservar que se retiró la vista IDML fallida y carpeta Links."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("analizarPdfMappingsModal")
    && String(note || "").includes("más ancho")
    && String(note || "").includes("mapeos de estilos")),
  "Las release notes deben conservar el modal de mapeos más ancho."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("swatchInventory")
    && String(note || "").includes("name/swatchName")
    && String(note || "").includes("colores")
    && String(note || "").includes("rail")),
  "Las release notes deben conservar la persistencia de colores del rail."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("badges de Anexo")
    && String(note || "").includes("Anexo PaT1")
    && String(note || "").includes("tooltip")),
  "Las release notes deben conservar el badge de anexo con código y tooltip."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("cada ficha editorial")
    && String(note || "").includes("revisions")
    && String(note || "").includes("documento principal ligero")
    && String(note || "").includes("Firestore")),
  "Las release notes deben conservar el guardado de fichas editoriales en subcolección."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("X-Local-Analysis-Context")
    && String(note || "").includes("HTTP 431/CORS falso")
    && String(note || "").includes("Analizar todas las fichas")
    && String(note || "").includes("códigos mínimos")
    && String(note || "").includes("recortables")),
  "Las release notes deben conservar el fix de X-Local-Analysis-Context demasiado grande."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("X-Local-Analysis-Context")
    && String(note || "").includes("CORS")
    && String(note || "").includes("Analizar todas las fichas")
    && String(note || "").includes("recortables")
    && String(note || "").includes("backend")),
  "Las release notes deben conservar el fix CORS de X-Local-Analysis-Context."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("rail")
    && String(note || "").includes("reporte por página")
    && String(note || "").includes("Firestore")
    && String(note || "").includes("resultados laterales")
    && String(note || "").includes("caché local")),
  "Las release notes deben conservar la persistencia remota del rail/reporte."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("contexto local mínimo")
    && String(note || "").includes("recortables ya analizados")
    && String(note || "").includes("origen PaT1")
    && String(note || "").includes("destino REC")
    && String(note || "").includes("Firestore")),
  "Las release notes deben conservar el fix del contexto local para match origen-destino."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("reordena el hero")
    && String(note || "").includes("Crear fichas base")
    && String(note || "").includes("Crear nueva ficha editorial")
    && String(note || "").includes("análisis rápido")
    && String(note || "").includes("Analizar todas las fichas")),
  "Las release notes deben conservar el reordenamiento de botones del hero."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("anexos digitales")
    && String(note || "").includes("08_01_COMPETENCIA")
    && String(note || "").includes("badges de Anexo")
    && String(note || "").includes("tooltip")),
  "Las release notes deben conservar el fix de anexos falsos y badges de anexo."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("modal")
    && String(note || "").includes("rail")
    && String(note || "").includes("mostrar u ocultar")
    && String(note || "").includes("categoría")
    && String(note || "").includes("persistidas")),
  "Las release notes deben conservar el modal de filtros del rail."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("video legacy")
    && String(note || "").includes("kind/visualKind")
    && String(note || "").includes("Video")
    && String(note || "").includes("kind=video")),
  "Las release notes deben conservar el fix de videos legacy en el rail."
);
assert.match(peppermintCss, /\.analizar-pdf-rail-filter-modal/);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("badges de video")
    && String(note || "").includes("Video")
    && String(note || "").includes("tooltip")
    && String(note || "").includes("hover")),
  "Las release notes deben conservar el ajuste de badges de video en el rail."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("badges")
    && String(note || "").includes("Rec.")
    && String(note || "").includes("sin negritas")),
  "Las release notes deben conservar el ajuste visual de badges del rail."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("Muuri")
    && String(note || "").includes("rail")
    && String(note || "").includes("masonry")
    && String(note || "").includes("responsive")
    && String(note || "").includes("fallback CSS")),
  "Las release notes deben conservar la integración de Muuri en el rail."
);
assert.match(peppermintHtml, /data-cache-src="vendor\/muuri\/muuri\.min\.js"/);
assert.match(peppermintCss, /\.is-muuri-rail-grid/);
assert.match(peppermintCss, /\.analizar-pdf-rail-badge\s*\{[\s\S]*font-weight:\s*400/);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("un solo botón")
    && String(note || "").includes("rail")
    && String(note || "").includes("expandir")
    && String(note || "").includes("contraer")),
  "Las release notes deben conservar el botón único para expandir/contraer el rail."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("ficha editorial")
    && String(note || "").includes("grilla de 7 columnas")
    && String(note || "").includes("metadatos editoriales")),
  "Las release notes deben conservar la grilla compacta de la ficha editorial."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("modal Crear fichas base")
    && String(note || "").includes("altura")
    && String(note || "").includes("ficha editorial")),
  "Las release notes deben conservar el ajuste de campos del modal Crear fichas base."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("controles")
    && String(note || "").includes("rail")
    && String(note || "").includes("expandir")
    && String(note || "").includes("contraer")),
  "Las release notes deben conservar los controles de expandir/contraer del rail."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("spinner editorial")
    && String(note || "").includes("ficha activa")
    && String(note || "").includes("etapa del proceso")
    && String(note || "").includes("integración de resultados")),
  "Las release notes deben conservar los mensajes personalizados del spinner editorial."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("rail")
    && String(note || "").includes("ficha editorial")
    && String(note || "").includes("summaries")
    && String(note || "").includes("columnas")),
  "Las release notes deben conservar el ajuste del rail."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("crear plantillas desde todas las fichas")
    && String(note || "").includes("grupo existente")
    && String(note || "").includes("eliminar grupos")
    && String(note || "").includes("todas sus plantillas")),
  "Las release notes deben conservar el fix de grupos de plantillas."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("Proyecto")
    && String(note || "").includes("plantillas masivas")
    && String(note || "").includes("Campo formativo")
    && String(note || "").includes("campo_formativo")),
  "Las release notes deben conservar el fix de Proyecto y Campo formativo."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("ancho del hero")
    && String(note || "").includes("workspace")
    && String(note || "").includes("pantallas grandes")),
  "Las release notes deben conservar el hero más ancho."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("modal global")
    && String(note || "").includes("fichas base")
    && String(note || "").includes("unidades por trimestre")
    && String(note || "").includes("optgroup")),
  "Las release notes deben conservar el modal de fichas base y optgroups."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("ficha editorial")
    && String(note || "").includes("hero flotante")
    && String(note || "").includes("bloque visible de logs")),
  "Las release notes deben conservar el hero flotante sin logs visibles."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("opciones de Unidad")
    && String(note || "").includes("editor de plantillas")
    && String(note || "").includes("ficha editorial")),
  "Las release notes deben conservar la paridad de opciones de Unidad."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("modal de configuraciones")
    && String(note || "").includes("grupos")
    && String(note || "").includes("lista de plantillas")
    && String(note || "").includes("editor de mapeo")),
  "Las release notes deben conservar la separación del modal de configuraciones."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("plantillas default")
    && String(note || "").includes("frontend")
    && String(note || "").includes("backend local")
    && String(note || "").includes("reiniciado")),
  "Las release notes deben conservar el filtro frontend de plantillas default legacy."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("plantillas default")
    && String(note || "").includes("documentos legacy")
    && String(note || "").includes("archivos IDML reales")),
  "Las release notes deben conservar la eliminación backend de plantillas default."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("Guardar")
    && String(note || "").includes("hero")
    && String(note || "").includes("análisis rápido")
    && String(note || "").includes("Analizar todas las fichas")
    && String(note || "").includes("plantillas desde todas las fichas")
    && String(note || "").includes("grupo arrastrable")),
  "Las release notes deben conservar grupos del hero y creación masiva de plantillas."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("análisis rápido")
    && String(note || "").includes("reportes y rail")
    && String(note || "").includes("análisis completo")
    && String(note || "").includes("estilos de párrafo y carácter")
    && String(note || "").includes("filas N/D")),
  "Las release notes deben conservar el fix de render quickAnalysis y filas duplicadas."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("análisis rápido")
    && String(note || "").includes("fichas IDML")
    && String(note || "").includes("metadata antigua")
    && String(note || "").includes("PDF")
    && String(note || "").includes("errores 400")),
  "Las release notes deben conservar el fix de análisis rápido con metadata legacy."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("Recortables destino")
    && String(note || "").includes("al final")
    && String(note || "").includes("badges verdes")
    && String(note || "").includes("codigo origen-destino")
    && String(note || "").includes("sin exigir pagina origen")),
  "Las release notes deben conservar el fix de Recortables destino por código."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("copia local IDML")
    && String(note || "").includes("plantillas")
    && String(note || "").includes("análisis rápido")
    && String(note || "").includes("cache-busters")
    && String(note || "").includes("fichas base")),
  "Las release notes deben conservar el fix de herramientas IDML y fichas base."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("agrupa")
    && String(note || "").includes("botones del hero")
    && String(note || "").includes("configuracion/herramientas")
    && String(note || "").includes("analisis completo")
    && String(note || "").includes("ficha editorial")),
  "Las release notes deben conservar la agrupación nueva del hero."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("plantilla")
    && String(note || "").includes("análisis rápido")
    && String(note || "").includes("ortotipográfico")
    && String(note || "").includes("sin sustituirlo")),
  "Las release notes deben conservar los botones de plantilla y análisis rápido."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("spinner")
    && String(note || "").includes("Analizar todo")
    && String(note || "").includes("IndexedDB")
    && String(note || "").includes("accesos rápidos")),
  "Las release notes deben conservar el spinner de cola y la rehidratación del rail."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("metadata ligera")
    && String(note || "").includes("Firestore")
    && String(note || "").includes("resultados pesados")
    && String(note || "").includes("1 MiB")),
  "Las release notes deben conservar el guardado metadata-only del analizador."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("renderers legacy")
    && String(note || "").includes("helpers desconectados")
    && String(note || "").includes("duplicaciones")
    && String(note || "").includes("rutas obsoletas")),
  "Las release notes deben conservar la limpieza de código obsoleto."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("color de unidad")
    && String(note || "").includes("grupos del rail")
    && String(note || "").includes("colapso obsoleto por ficha")
    && String(note || "").includes("otras fichas editoriales")),
  "Las release notes deben conservar que el rail restaura color y no sustituye otras fichas."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("todos los complementos")
    && String(note || "").includes("anexos")
    && String(note || "").includes("recortables multiples")
    && String(note || "").includes("misma paginacion")),
  "Las release notes deben conservar que el rail muestra todos los complementos por página."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("upsert/normalizacion")
    && String(note || "").includes("Analizar todo")
    && String(note || "").includes("snapshots planos")
    && String(note || "").includes("polling")),
  "Las release notes deben conservar que Analizar todo ya no sustituye fichas durante el polling."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("un solo archivo vigente")
    && String(note || "").includes("reemplaza el anterior")
    && String(note || "").includes("L2 a Proyecto")
    && String(note || "").includes("L6 a Unidad 3")),
  "Las release notes deben conservar el contrato de un archivo vigente por ficha."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("PeppermintPattyAnalizer.html")
    && String(note || "").includes("analizarPdfJobMeta")
    && String(note || "").includes("fichas pendientes")
    && String(note || "").includes("errores")),
  "Las release notes deben conservar la restauración del bloque visible analizarPdfJobMeta."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("cada render")
    && String(note || "").includes("unidades normales")
    && String(note || "").includes("IDML local")
    && String(note || "").includes("estado real de la sesión")),
  "Las release notes deben conservar el aviso derivado del estado real en cada render."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("Analizar todo")
    && String(note || "").includes("unidades normales")
    && String(note || "").includes("nodo vivo")
    && String(note || "").includes("referencias DOM obsoletas")),
  "Las release notes deben conservar el fix del nodo vivo de estado tras renderAll."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("Analizar todo")
    && String(note || "").includes("unidades normales")
    && String(note || "").includes("IDML local")
    && String(note || "").includes("repintar el panel")),
  "Las release notes deben conservar la persistencia del aviso de fichas sin IDML local tras renderAll."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("Analizar todo")
    && String(note || "").includes("unidades normales")
    && String(note || "").includes("IDML local")
    && String(note || "").includes("volver a seleccionarse")),
  "Las release notes deben conservar el aviso de fichas sin IDML local en Analizar todo."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("sourceAssetPath")
    && String(note || "").includes("unidades normales")
    && String(note || "").includes("Analizar todo")
    && String(note || "").includes("Proyecto/Recortables")),
  "Las release notes deben conservar el fix de rutas sourceAssetPath obsoletas en unidades normales."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("archivo activo")
    && String(note || "").includes("Recortables destino")
    && String(note || "").includes("Proyecto")),
  "Las release notes deben conservar el fix de prioridad del archivo activo en reportes."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("Recortables destino")
    && String(note || "").includes("reporte especializado")
    && String(note || "").includes("origen-destino")
    && String(note || "").includes("N/D")),
  "Las release notes deben conservar el fix del reporte especializado de Recortables destino."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("sourceAssetPath")
    && String(note || "").includes("recortable destino")
    && String(note || "").includes("antes de la unidad origen")
    && String(note || "").includes("frontend")),
  "Las release notes deben conservar el fix de rehidratación de sourceAssetPath para recortable destino."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("Recortables destino")
    && String(note || "").includes("ya analizada")
    && String(note || "").includes("blob local")
    && String(note || "").includes("unidad origen")),
  "Las release notes deben conservar el fix de destino Recortables ya analizado sin blob local."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("metadata local obsoleta")
    && String(note || "").includes("blob")
    && String(note || "").includes("Recortables")
    && String(note || "").includes("unidad origen")),
  "Las release notes deben conservar el fix de limpieza de metadata local obsoleta."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("recortable destino")
    && String(note || "").includes("unidad origen")
    && String(note || "").includes("bloquea la fuente")
    && String(note || "").includes("IDML local")),
  "Las release notes deben conservar el fix de orden y validación del recortable destino."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("IDML REC")
    && String(note || "").includes("unidades normales")
    && String(note || "").includes("asignación automática")
    && String(note || "").includes("fichas Recortables")
    && String(note || "").includes("destino")),
  "Las release notes deben conservar el fix de asignación automática de recortables destino."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("update-banner global")
    && String(note || "").includes("cache-version-loader")
    && String(note || "").includes("chromeLayout")
    && String(note || "").includes("Actualizar ahora")),
  "Las release notes deben conservar el fix del botón Actualizar ahora en Peppermint Patty."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Peppermint Patty")
    && String(note || "").includes("fichas editoriales")
    && String(note || "").includes("entradas IDML obsoletas")
    && String(note || "").includes("Analizar todas")
    && String(note || "").includes("orden de formulario")),
  "Las release notes deben conservar el fix de asignación de IDML seleccionados a fichas obsoletas."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Podcaster")
    && String(note || "").includes("audios Gemini")
    && String(note || "").includes("videos VEO")
    && String(note || "").includes("playhead")
    && String(note || "").includes("src")),
  "Las release notes deben conservar el fix de cache de Gemini/VEO al mover el playhead."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Podcaster")
    && String(note || "").includes("addStylizedTextBtn")
    && String(note || "").includes("DOMContentLoaded")
    && String(note || "").includes("texto estilizado")
    && String(note || "").includes("PodcasterUI")),
  "Las release notes deben conservar el fix del modal de texto estilizado."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Podcaster")
    && String(note || "").includes("audio de fondo")
    && String(note || "").includes("playhead")
    && String(note || "").includes("backgroundSourceKey")
    && String(note || "").includes("Audio/blob")),
  "Las release notes deben conservar el fix de cache del audio de fondo al mover el playhead."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Podcaster")
    && String(note || "").includes("guarda sesiones")
    && String(note || "").includes("Firebase")
    && String(note || "").includes("snoopy-export")
    && String(note || "").includes("401")),
  "Las release notes deben conservar el fix de guardado directo sin 401 remoto."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Podcaster")
    && String(note || "").includes("editor Snoopy")
    && String(note || "").includes("timeline detenido")
    && String(note || "").includes("montageActive")
    && String(note || "").includes("reproducción automática")),
  "Las release notes deben conservar el fix de apertura del editor Snoopy sin autoplay."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Podcaster")
    && String(note || "").includes("posición manual")
    && String(note || "").includes("manualStartMs")
    && String(note || "").includes("reordenar escenas")),
  "Las release notes deben conservar el fix de posición manual Gemini al reordenar."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Podcaster")
    && String(note || "").includes("audio Gemini")
    && String(note || "").includes("offsets finales")
    && String(note || "").includes("fondo de color")
    && String(note || "").includes("biblioteca pública")),
  "Las release notes deben conservar el fix de sincronía texto/audio en export MP4."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Podcaster")
    && String(note || "").includes("montageExportIncludeLogo")
    && String(note || "").includes("includeLogo:false")
    && String(note || "").includes("brandOverlay")),
  "Las release notes deben conservar el fix del toggle de logo en export MP4."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Podcaster")
    && String(note || "").includes("openSceneVideoSelectorModal")
    && String(note || "").includes("PodcasterMediaReplacement")
    && String(note || "").includes("DOMContentLoaded")),
  "Las release notes deben conservar el fix del API runtime de media replacement."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Podcaster")
    && String(note || "").includes("música")
    && String(note || "").includes("same-origin")
    && String(note || "").includes("snoopy-export")),
  "Las release notes deben conservar el fix de rutas de música por same-origin."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Podcaster")
    && String(note || "").includes("No modificar guión")
    && String(note || "").includes("Guion")
    && String(note || "").includes("Elemento visual")),
  "Las release notes deben conservar el modo No modificar guión para tablas pegadas."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Podcaster")
    && String(note || "").includes("els.scriptModelSelect")
    && String(note || "").includes("runtime")
    && String(note || "").includes("podcaster-script-generator")),
  "Las release notes deben conservar el fix de DOM/state runtime en podcaster-script-generator."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Podcaster")
    && String(note || "").includes("chat/status/logger")
    && String(note || "").includes("runtime")
    && String(note || "").includes("división de escenas")),
  "Las release notes deben conservar el fix de callbacks runtime en podcaster-script-generator."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Podcaster")
    && String(note || "").includes("getActiveSession")
    && String(note || "").includes("runtime")
    && String(note || "").includes("división de escenas")),
  "Las release notes deben conservar el fix de getActiveSession en podcaster-script-generator."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Podcaster")
    && String(note || "").includes("3")
    && String(note || "").includes("referencias")
    && String(note || "").includes("Veo")
    && String(note || "").includes("2 imágenes")),
  "Las release notes deben conservar el fix del límite de referencias de Veo."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Podcaster")
    && String(note || "").includes("audio Gemini")
    && String(note || "").includes("karaoke")
    && String(note || "").includes("playbackRate")
    && String(note || "").includes("FFmpeg")),
  "Las release notes deben conservar el fix de sincronía Gemini/karaoke en export MP4."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Podcaster")
    && String(note || "").includes("texto en pantalla")
    && String(note || "").includes("1920x1080")
    && String(note || "").includes("fondo de color")
    && String(note || "").includes("base negra")),
  "Las release notes deben conservar el fix del export MP4 con texto y fondos de color."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Podcaster")
    && String(note || "").includes("audio Gemini")
    && String(note || "").includes("reproducir el timeline")),
  "Las release notes deben conservar el fix del texto en pantalla con velocidad de audio Gemini."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Podcaster")
    && String(note || "").includes("mapas del timeline")
    && String(note || "").includes("fondos de color")),
  "Las release notes deben conservar la rehidratación profunda del timeline de Podcaster."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Home")
    && String(note || "").includes("panelMusicConfig")
    && String(note || "").includes("audio de fondo")),
  "Las release notes deben conservar la carga del audio de fondo de Podcaster en Home."
);
assert.ok(
  notes.some((note) => String(note || "").includes("raster")
    && String(note || "").includes("frontend")
    && String(note || "").includes("karaoke")),
  "Las release notes deben conservar el fix de raster/frontend/karaoke."
);
assert.ok(
  notes.some((note) => String(note || "").includes("same-origin")),
  "Las release notes deben conservar el fix de same-origin."
);
assert.ok(
  notes.some((note) => String(note || "").includes("job_not_found")),
  "Las release notes deben conservar el fix de retry tolerante para job_not_found."
);

console.log("public version.json bumped OK.");
