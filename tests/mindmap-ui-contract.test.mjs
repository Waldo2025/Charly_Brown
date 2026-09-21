import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../public/MindmapCreator.html", import.meta.url), "utf8");
const js = await readFile(new URL("../public/js/MindmapCreator.js", import.meta.url), "utf8");
const batchJs = await readFile(new URL("../public/js/mindmapBatchStickers.js", import.meta.url), "utf8");
const apiClientJs = await readFile(new URL("../public/js/api-client.js", import.meta.url), "utf8");
const promptTranslationJs = await readFile(new URL("../public/js/mindmapPromptTranslation.mjs", import.meta.url), "utf8");
const css = await readFile(new URL("../public/MindmapCreator.css", import.meta.url), "utf8");
const themeManagerJs = await readFile(new URL("../public/js/themeManager.js", import.meta.url), "utf8");
const firestoreRules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");

test("el header ya no contiene el boton duplicado de mapas guardados", () => {
  const header = html.match(/<header class="mc-header">([\s\S]*?)<\/header>/)?.[1] || "";
  assert.doesNotMatch(header, /mcBtnSavedMindmaps/);
  assert.doesNotMatch(header, /mcBtnNuevoMindmap/);
  assert.doesNotMatch(header, /mcBtnGeminiAssist/);
});

test("estudio, biblioteca y generador comparten el drawer mediante pestañas", () => {
  assert.match(html, /data-mc-sticker-tab="studio"/);
  assert.match(html, /data-mc-sticker-tab="library"/);
  assert.match(html, /data-mc-sticker-tab="create"/);
  assert.match(html, /id="mcStickerStudioPanel"/);
  assert.match(html, /id="mcStickerCreatePanel"/);
  assert.match(js, /stickerStudioPanel\.appendChild\(sidebarPanel\)/);
  assert.match(js, /stickerCreatePanel\.appendChild\(batchStickersModal\)/);
});

test("los accesos redundantes se integran en las acciones del footer", () => {
  assert.doesNotMatch(html, /id="mcBtnBatchStickers"/);
  assert.doesNotMatch(html, /id="mcBtnStickerDrawer"/);
  assert.match(html, /id="mcBtnOpenStudioDrawer"/);
  const footer = html.match(/<div class="mc-footer-controls">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/)?.[1] || "";
  assert.match(footer, /class="mc-footer-actions"/);
  assert.match(footer, /id="mcBtnGenerar"/);
  assert.match(footer, /id="mcBtnQuickLayout"/);
  assert.match(footer, /id="mcBtnOpenStudioDrawer"/);
  assert.doesNotMatch(html, /class="mc-floating-actions"/);
  assert.equal((html.match(/id="mcBtnGenerar"/g) || []).length, 1);
  assert.match(js, /abrirDrawerStickers\("", "studio"\)/);
});

test("el asistente de lectura forma parte del alta academica", () => {
  const createModal = html.match(/<div id="mcModalSave"[\s\S]*?<div id="mcModalCommunityMindmaps"/)?.[0] || "";
  assert.match(createModal, /<section id="mcModalGemini"/);
  assert.match(createModal, /id="mcGeminiFullText"/);
  assert.match(createModal, /id="mcExecuteGeminiBtn"/);
  assert.doesNotMatch(html, /id="mcCloseGeminiModal"/);
  assert.match(js, /lecturaPendienteNuevoMindmap = \{/);
  assert.match(js, /textoParte1: iniciarVacio \? lecturaNueva\.parte1/);
  assert.match(js, /limpiarLienzoParaNuevoMindmap\(lecturaNueva\)/);
});

test("la lista conserva y expone el MindMap activo", () => {
  assert.match(js, /function establecerMindmapActivo\(id, nombre = "", esPropio = true\)/);
  assert.match(js, /itemSession\.dataset\.mindmapId = id/);
  assert.match(js, /itemSession\.setAttribute\("aria-current", "true"\)/);
  assert.match(js, /mc-sessions-item__active-indicator/);
  assert.match(js, /establecerMindmapActivo\(savedDoc\.id, nombre\)/);
  assert.match(js, /establecerMindmapActivo\(savedDoc\.id, nombre\)[\s\S]*?guardarDraftLocalStorage\(\)/);
  assert.match(js, /await cargarMindmapsGuardados\(\)/);
});

test("el titulo y las listas usan la sesion activa y un menu de tres puntos", () => {
  assert.match(js, /headerTitleEl\.textContent = mindmapActualNombre \|\| "MindMaps Creator"/);
  assert.match(js, /fa-ellipsis-vertical/);
  assert.match(js, /data-action="duplicate"/);
  assert.match(js, /data-action="edit"/);
  assert.match(js, /<span>Editar<\/span>/);
  assert.doesNotMatch(js, /data-action="rename"/);
  assert.match(js, /data-action="delete"/);
  assert.match(js, /cardDrawer\.appendChild\(crearBotonMenuMindmap\(id, data\)\)/);
  assert.match(js, /itemSession\.appendChild\(crearBotonMenuMindmap\(id, data\)\)/);
});

test("el drawer se redimensiona desde su borde izquierdo y conserva el borde derecho", () => {
  assert.match(html, /id="mcDrawerStickersResizer"/);
  assert.match(css, /\.mc-drawer\s*\{[\s\S]*?right:\s*0;/);
  assert.match(css, /\.mc-drawer-resizer\s*\{[\s\S]*?left:\s*-5px;/);
  assert.match(js, /drawerStartWidth \+ drawerStartX - event\.clientX/);
  assert.match(js, /mc_sticker_drawer_width/);
  assert.match(css, /\.mc-page-shell\.mc-tools-open\s*\{[\s\S]*?right:\s*var\(--mc-tools-width/);
  assert.match(js, /function sincronizarEspacioDrawerStickers\(\)/);
  assert.match(js, /pageShell\?\.classList\.toggle\("mc-tools-open", isOpen\)/);
  assert.match(js, /zoomScale <= 1\.0 && !drawerStickers\?\.classList\.contains\("is-open"\)/);
});

test("la biblioteca ya no muestra el generador individual", () => {
  assert.doesNotMatch(html, /id="mcBtnGenStickerGemini"/);
});

test("crear y editar usan el modal de datos academicos persistido en Firestore", () => {
  assert.match(html, /id="mcAcademicLevel"/);
  assert.match(html, /id="mcAcademicGrade"/);
  assert.match(html, /id="mcAcademicTrimester"/);
  assert.match(html, /id="mcAcademicUnit"/);
  assert.match(html, /Unidad 10/);
  assert.match(js, /abrirModalDatosAcademicos\("edit", \{ id, data \}\)/);
  assert.match(js, /abrirModalDatosAcademicos\("new"\)/);
  assert.match(js, /\.\.\.camposAcademicosFirestore\(academic\)/);
  assert.match(js, /const iniciarVacio = mode === "new"/);
  assert.match(js, /contenido: items/);
});

test("se pueden consultar MindMaps de otros usuarios sin habilitar su edicion", () => {
  assert.match(html, /id="mcBtnCommunityMindmaps"/);
  assert.match(html, /id="mcCommunityUserSelect"/);
  assert.match(js, /collection\(firestore, "users"\)/);
  assert.match(js, /where\("uid", "==", uid\)/);
  assert.match(js, /establecerMindmapActivo\(mapDoc\.id, data\.nombre \|\| "MindMap", false\)/);
  assert.match(js, /mindmapActualId && !mindmapActualEsPropio/);
  assert.match(firestoreRules, /match \/mindmaps\/\{docId\}[\s\S]*?allow read: if isSignedIn\(\);/);
});

test("la lista recupera documentos sin fecha de creacion y las actualizaciones preservan campos", () => {
  assert.doesNotMatch(js, /orderBy\("creado", "desc"\)/);
  assert.match(js, /const docsOrdenados = \[\.\.\.snap\.docs\]\.sort/);
  assert.match(js, /dataB\.actualizado \|\| dataB\.creado/);
  assert.match(js, /\}\), \{ merge: true \}\);/);
  assert.match(js, /\}\), \{ merge: true \}\);[\s\S]*?await cargarMindmapsGuardados\(\)/);
});

test("al abrir un MindMap se realinean las palabras con las filas actuales", () => {
  const restaurar = js.match(/function restaurarMindmap\(data\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(restaurar, /renderizarBloquesSvg\(\);/);
  assert.match(restaurar, /recalcularPosicionPalabrasCanvas\(null, false\);/);
  assert.ok(
    restaurar.indexOf("renderizarBloquesSvg();") <
      restaurar.indexOf("recalcularPosicionPalabrasCanvas(null, false);")
  );
  assert.doesNotMatch(
    js.match(/export function recalcularPosicionPalabrasCanvas[\s\S]*?\n\}/)?.[0] || "",
    /Math\.round\(stickerSize \* 0\.28\)/
  );
});

test("las palabras se contienen dentro del ancho final de su bloque", () => {
  assert.match(js, /function ajustarAnchoElementoAlBloque\(el, bloque, margen = 5\)/);
  assert.match(js, /function limitarXAlBloque\(posX, anchoElemento, bloque, margen = 5\)/);
  const recalculo = js.match(/export function recalcularPosicionPalabrasCanvas[\s\S]*?\n\}/)?.[0] || "";
  assert.match(recalculo, /const elementWidth = ajustarAnchoElementoAlBloque\(el, b\);/);
  assert.match(recalculo, /wordX = limitarXAlBloque\(wordX, elementWidth, b\);/);
});

test("el guardado limpia undefined y reduce el borrador si localStorage excede su cuota", () => {
  assert.match(js, /limpiarDatosFirestore\(\{/);
  assert.equal((js.match(/(?:setDoc|addDoc)\([\s\S]{0,100}?limpiarDatosFirestore\(\{/g) || []).length, 4);
  assert.match(js, /err\?\.name === "QuotaExceededError"/);
  assert.match(js, /\^\(data:\|blob:\)/);
  assert.match(js, /contenidoOptimizado: true/);
});

test("los stickers generados se guardan y restauran con URL persistente", () => {
  assert.match(batchJs, /import \{ ref, uploadString, getDownloadURL \}/);
  assert.match(batchJs, /await uploadString\(refImg, currentDataUrl, "data_url"\);[\s\S]*?const persistentUrl = await getDownloadURL\(refImg\);/);
  assert.match(batchJs, /stickerCache\.set\(cleanNombre, persistentUrl\);/);
  assert.match(batchJs, /onStickerGuardado\(cleanNombre, persistentUrl, palabra\);/);
  assert.match(js, /async function rehidratarStickersPersistidos\(\)/);
  assert.match(js, /normalizarFuenteImagenPersistente\(el\.src\)/);
  assert.match(js, /void rehidratarStickersPersistidos\(\);/);
  assert.equal((js.match(/src: el\.tagName === "IMG" \? normalizarFuenteImagenPersistente\(el\.src\) : null/g) || []).length, 2);
  assert.match(js, /const canvasSinContenido = !canvas\?\.querySelector\("\.sticker, \.draggable-text"\);/);
  assert.match(js, /activeData\.contenido\.length > 0[\s\S]*?restaurarMindmap\(activeData\);/);
  assert.match(js, /localStorage\.removeItem\(MC_STORAGE_DRAFT_KEY\);[\s\S]*?contenido: contenidoLigero/);
});

test("dos stickers se revisan por separado antes de combinarlos y sustituir la palabra", () => {
  for (const id of ["mcBtnToggleComposite", "mcCompositeBuilder", "mcCompositeTarget", "mcCompositePartA", "mcCompositePartB", "mcCompositePreviewA", "mcCompositePreviewB", "mcCompositeGenerateA", "mcCompositeGenerateB", "mcBatchBtnCompose"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /id="mcBtnToggleComposite"[^>]*aria-controls="mcCompositeBuilder"[^>]*aria-expanded="false"/);
  assert.match(html, /id="mcCompositeBuilder"[^>]*class="mc-composite-builder hidden"[^>]*aria-hidden="true"/);
  assert.match(batchJs, /function alternarCompositorStickers\(\)[\s\S]*?if \(abrir\) abrirModal\(\);/);
  assert.match(batchJs, /btnToggleComposite\?\.addEventListener\("click", alternarCompositorStickers\)/);
  assert.match(css, /\.mc-composite-builder__grid\s*\{[\s\S]*?grid-template-columns:/);
  assert.match(css, /\.mc-composite-previews\s*\{[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(batchJs, /export async function combinarDosStickers\(dataUrlA, dataUrlB, size = 1024\)/);
  assert.match(batchJs, /async function generarParteCompuesta\(partKey\)/);
  assert.match(batchJs, /compositeDataUrlA = dataUrl/);
  assert.match(batchJs, /compositeDataUrlB = dataUrl/);
  assert.match(batchJs, /async function guardarStickerCompuesto\(\)/);
  assert.match(batchJs, /await combinarDosStickers\(compositeDataUrlA, compositeDataUrlB\)/);
  assert.match(batchJs, /uploadString\(refImg, compositeDataUrl, "data_url"\)/);
  assert.match(batchJs, /onStickerGuardado\(cleanNombre, refreshedUrl, palabraFinal\)/);
  assert.match(batchJs, /btnCompose\?\.addEventListener\("click", guardarStickerCompuesto\)/);
  assert.match(js, /el\.src = persistentUrl;[\s\S]*?reemplazarElementoConSticker\(el, persistentUrl, cleanNombre\)/);
});

test("la palabra puede generarse como sticker tipografico", () => {
  assert.match(html, /id="mcBatchWordAsText"/);
  assert.match(html, /for="mcBatchWordAsText"[^>]*title="Crear la palabra como texto dibujado"/);
  assert.match(css, /\.mc-batch-text-mode:has\(input:checked\)\s*\{[\s\S]*?color:\s*#db2777;/);
  assert.match(batchJs, /const comoTexto = Boolean\(opciones\.comoTexto\);/);
  assert.match(batchJs, /un sticker tipográfico que muestre únicamente la palabra exacta/);
  assert.match(batchJs, /TEXTO OBLIGATORIO: escribir exactamente/);
  assert.match(batchJs, /export function crearStickerTextoDataUrl\(palabra, size = 1024\)/);
  assert.match(batchJs, /ctx\.strokeText\(texto, size \/ 2, size \/ 2, maxWidth\)/);
  assert.match(batchJs, /wordAsTextInput\?\.checked[\s\S]*?crearStickerTextoDataUrl\(palabra\)[\s\S]*?: await generateGeminiImage/);
  assert.match(batchJs, /wordAsTextInput\?\.addEventListener\("change", \(\) => actualizarPromptActualEnPantalla\(\)\)/);
});

test("los controles usan iconos, divisores y color semantico centralizado", () => {
  assert.match(css, /--mc-icon-button-size:\s*2\.125rem;/);
  assert.match(css, /\.mc-btn\s*\{[\s\S]*?width:\s*var\(--mc-icon-button-size\);[\s\S]*?border:\s*0;[\s\S]*?background-color:\s*transparent !important;/);
  assert.match(css, /\.mc-btn > span:not\(\.sr-only\)\s*\{[\s\S]*?display:\s*none;/);
  assert.match(css, /\.mc-control-divider\s*\{/);
  assert.match(css, /\.mc-drawer-fab--generate\s*\{[\s\S]*?background:\s*transparent;[\s\S]*?color:\s*#db2777;/);
  assert.match(js, /mc-session-file-icon--blue/);
  assert.match(js, /mc-session-file-icon--magenta/);
});

test("la reproduccion aparece a la izquierda de la barra de zoom", () => {
  const footer = html.match(/<div class="mc-viewport-footer">([\s\S]*?)<!-- Resizer Derecho -->/)?.[1] || "";
  assert.match(footer, /mc-footer-controls/);
  assert.ok(footer.indexOf("mc-playback-dock") < footer.indexOf("mc-floating-toolbar"));
  assert.equal((html.match(/class="mc-playback-dock"/g) || []).length, 1);
});

test("los parametros de distribucion viven en un panel flotante compacto", () => {
  assert.match(html, /id="mcBtnQuickLayout"/);
  assert.doesNotMatch(html, /id="mcBtnAlinearPalabras"/);
  assert.match(html, /id="mcQuickLayoutPanel"[\s\S]*?class="mc-param-grid mt-2"/);
  assert.match(html, /id="mcQuickLayoutPanel"[\s\S]*?id="mcGlobalStickerSlider"/);
  assert.equal((html.match(/id="mcStepXIzq"/g) || []).length, 1);
  assert.equal((html.match(/id="mcStickerSizeGlobal"/g) || []).length, 1);
  const layoutPanel = html.match(/<aside id="mcQuickLayoutPanel"[\s\S]*?<\/aside>/)?.[0] || "";
  for (const id of ["mcStepXIzq", "mcNivelesYIzq", "mcAmpYIzq", "mcStepXDer", "mcNivelesYDer", "mcAmpYDer"]) {
    assert.match(layoutPanel, new RegExp(`type="range" id="${id}"`));
    assert.match(layoutPanel, new RegExp(`output id="${id}Val" for="${id}"`));
  }
  assert.match(css, /\.mc-param-slider > input\[type="range"\][\s\S]*?accent-color:\s*var\(--mc-accent\);/);
  assert.match(js, /actualizarSalida\(stepXIzqEl, "mcStepXIzqVal", "px"\)/);
  assert.match(js, /function alternarPanelDistribucion\(\)/);
  assert.match(js, /quickLayoutButton\?\.setAttribute\("aria-expanded"/);
});

test("los switches muestran rojo apagado y verde encendido incluso deshabilitados", () => {
  assert.match(css, /\.mc-toggle-row input\[type="checkbox"\]\s*\{[\s\S]*?-webkit-appearance:\s*none;[\s\S]*?background-color:\s*var\(--mc-destructive\);/);
  assert.match(css, /\.mc-toggle-row input\[type="checkbox"\]:checked\s*\{[\s\S]*?background-color:\s*var\(--mc-success\);/);
  assert.match(css, /\.mc-toggle-row input\[type="checkbox"\]:disabled\s*\{[\s\S]*?opacity:\s*1;/);
  assert.match(themeManagerJs, /input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):not\(\[type="range"\]\):not\(\[type="color"\]\)/);
  assert.doesNotMatch(themeManagerJs, /Uniformidad de iconos en paginas con tema dinamico/);
  assert.doesNotMatch(themeManagerJs, /:where\(\s*button,\s*\.btn,\s*\.theme-btn/);
  assert.doesNotMatch(themeManagerJs, /\) :where\(button, \.btn, \.btn-secondary, \.btn-primary, \.btn-analisis\)/);
});

test("el modal permite exportar PSD con capas nombradas", () => {
  assert.match(html, /name="mcExportFormat" value="png" checked/);
  assert.match(html, /name="mcExportFormat" value="psd"/);
  assert.match(html, /PSD por capas/);
  assert.match(html, /vendor\/ag-psd\/ag-psd\.bundle\.js/);
  assert.match(js, /exportarMindmapPsd\(\{/);
  assert.match(js, /formato === "png"/);
});

test("la distribución permite separar niveles, expandir filas y mover todo el contenido", () => {
  const layoutPanel = html.match(/<aside id="mcQuickLayoutPanel"[\s\S]*?<\/aside>/)?.[0] || "";
  assert.match(layoutPanel, /id="mcAmpYIzq"[^>]*max="78"/);
  assert.match(layoutPanel, /id="mcAmpYDer"[^>]*max="78"/);
  assert.match(layoutPanel, /id="mcRowGapY"[^>]*min="-20"[^>]*max="24"/);
  assert.match(layoutPanel, /id="mcOffsetY"[^>]*min="-80"[^>]*max="80"/);
  assert.match(layoutPanel, /id="mcBtnResetLayout"/);
  assert.match(js, /const rowCenterY = b\.y \+ \(b\.height \/ 2\) \+ offsetY \+ \(\(b\.row - 2\) \* rowGapY\);/);
  assert.match(js, /const elementHeight = el\.offsetHeight \|\| globalStickerSize;/);
  assert.match(js, /\(\(factorY - 0\.5\) \* elementAmpY\) - \(elementHeight \/ 2\)/);
  assert.match(js, /const MAX_AMPLITUD_VERTICAL = 78;/);
  assert.match(js, /const MARGEN_VERTICAL_FILA = 2;/);
  assert.match(js, /Math\.min\(MAX_AMPLITUD_VERTICAL, safeValue\)/);
  assert.doesNotMatch(js, /function maxSeparacionHorizontalBloque/);
  assert.match(layoutPanel, /id="mcStepXIzq"[^>]*min="0"[^>]*max="250"/);
  assert.match(layoutPanel, /id="mcStepXDer"[^>]*min="0"[^>]*max="250"/);
  assert.match(js, /function obtenerSeparacionHorizontal\(control\)/);
  assert.match(js, /const stepXEfectivo = numWords > 1 \? Math\.max\(0, userStepX\) : 0;/);
  assert.doesNotMatch(js, /Math\.min\(userStepX, maxStepX\)/);
  assert.doesNotMatch(js, /factorUsuario = userStepX \/ 75/);
  assert.match(js, /function aplicarAjusteDistribucion\(filtroPagina = null\)/);
  assert.match(js, /rowGapY: rowGapYEl\?\.value \|\| "0"/);
  assert.match(js, /offsetY: offsetYEl\?\.value \|\| "0"/);
});

test("crear stickers faltantes se activa desde la pestana Crear", () => {
  const createPanel = html.match(/<section id="mcStickerCreatePanel"([\s\S]*?)<\/section>/)?.[1] || "";
  assert.match(createPanel, /^\s*class="mc-sticker-tab-panel mc-create-panel hidden" role="tabpanel">\s*<div class="mc-modal__header mc-batch-header">/);
  assert.match(createPanel, /id="mcBtnBatchStickersPanel"/);
  assert.match(createPanel, /Crear stickers faltantes/);
  assert.ok(createPanel.indexOf("mc-batch-header") < createPanel.indexOf("mcBtnBatchStickersPanel"));
  assert.match(createPanel, /class="mc-batch-progress-meta"[\s\S]*?id="mcBatchProgressText"[\s\S]*?id="mcBatchRemainingBadge"/);
  assert.match(createPanel, /class="mc-batch-progress-track"[\s\S]*?id="mcBatchProgressBar"/);
  assert.equal((html.match(/id="mcBatchTitle"/g) || []).length, 1);
  assert.match(js, /stickerCreatePanel\.appendChild\(batchStickersModal\)/);
});

test("las acciones de Crear quedan alineadas al extremo derecho", () => {
  assert.match(css, /\.mc-batch-header__actions\s*\{[\s\S]*?grid-column:\s*2;/);
  assert.match(css, /\.mc-batch-header__actions\s*\{[\s\S]*?justify-self:\s*end;/);
  assert.match(css, /\.mc-batch-header__actions\s*\{[\s\S]*?margin-left:\s*auto;/);
});

test("al sustituir una palabra el sticker conserva su centro visual", () => {
  assert.match(js, /const centeredLeft = sourceLeft \+ \(\(sourceWidth - preferredSize\) \/ 2\);/);
  assert.match(js, /const centeredTop = sourceTop \+ \(\(sourceHeight - preferredSize\) \/ 2\);/);
  assert.match(js, /img\.style\.top = `\$\{centeredTop\}px`;/);
  assert.match(js, /img\.style\.left = `\$\{centeredLeft\}px`;/);
  assert.doesNotMatch(js, /img\.style\.(?:top|left) = (?:el|targetEl)\.style\.(?:top|left)/);
});

test("los encabezados principales comparten una escala compacta", () => {
  assert.match(css, /\.mc-header__title\s*\{[\s\S]*?font-size:\s*0\.8125rem;/);
  assert.match(css, /\.mc-panel-title\s*\{[\s\S]*?font-size:\s*0\.8125rem;/);
  assert.match(css, /\.mc-drawer__header h2\s*\{[\s\S]*?font-size:\s*0\.8125rem;/);
  assert.match(css, /\.mc-modal__header h3\s*\{[\s\S]*?font-size:\s*0\.8125rem;/);
});

test("el drawer usa tabs iconograficos accesibles", () => {
  for (const tab of ["studio", "library", "create"]) {
    const button = html.match(new RegExp(`<button[^>]*data-mc-sticker-tab="${tab}"[\\s\\S]*?<\\/button>`))?.[0] || "";
    assert.match(button, /title="[^"]+"/);
    assert.match(button, /aria-label="[^"]+"/);
    assert.match(button, /class="sr-only"/);
  }
  assert.match(css, /\.mc-sticker-tabs\s*\{[\s\S]*?position:\s*sticky;/);
  assert.match(css, /\.mc-sticker-tab\.is-active::after/);
});

test("Estudio usa secciones planas y lectura responsiva al drawer", () => {
  const studioSource = html.match(/<aside class="mc-sidebar-panel[\s\S]*?<\/aside>/)?.[0] || "";
  assert.match(studioSource, /class="mc-studio-section"/);
  assert.match(studioSource, /class="mc-reading-grid"/);
  assert.match(studioSource, /class="mc-template-grid"/);
  assert.doesNotMatch(studioSource, /class="mc-card"/);
  assert.match(css, /#mcDrawerStickers\s*\{[\s\S]*?container-type:\s*inline-size;/);
  assert.match(css, /@container \(min-width:\s*560px\)[\s\S]*?\.mc-reading-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2/);
});

test("Biblioteca y Crear reutilizan controles compactos sin texto en comandos", () => {
  assert.match(html, /class="mc-search-field"[\s\S]*?id="mcStickerSearch"/);
  assert.match(html, /for="mcUploadStickerInput"[^>]*aria-label="Subir PNG"/);
  assert.match(html, /id="mcBtnStickerView"[^>]*aria-haspopup="menu"/);
  for (const view of ["small", "medium", "large", "list"]) {
    assert.match(html, new RegExp(`data-sticker-view="${view}"`));
  }
  assert.match(css, /\.mc-sticker-grid\[data-view="list"\]\s*\{[\s\S]*?repeat\(auto-fit,\s*minmax\(110px,\s*1fr\)\)/);
  assert.match(css, /\.mc-sticker-grid\[data-view="list"\] \.mc-sticker-item img\s*\{[\s\S]*?display:\s*none;/);
  assert.match(html, /class="mc-btn mc-create-launcher"/);
  const batchButton = html.match(/<button[^>]*id="mcBtnBatchStickersPanel"[\s\S]*?<\/button>/)?.[0] || "";
  assert.match(batchButton, /aria-label="Crear stickers faltantes"/);
  assert.match(batchButton, /<span>Crear stickers faltantes<\/span>/);
  assert.match(html, /id="mcBatchBtnCrear"[^>]*class="mc-btn mc-batch-primary-action"[^>]*aria-label="Crear sticker"/);
  assert.match(batchJs, /if \(btnCrear\) \{\s*btnCrear\.classList\.remove\("hidden"\);\s*btnCrear\.disabled = true;/);
  assert.match(css, /\.mc-batch-preview__image\s*\{[\s\S]*?width:\s*176px;[\s\S]*?height:\s*176px;/);
  assert.match(html, /id="mcBatchPromptInput"[\s\S]*?class="mc-batch-preview__image"/);
  assert.match(html, /class="mc-batch-preview__image"[\s\S]*?class="mc-batch-preview-actions"[\s\S]*?id="mcBatchBtnCrear"[\s\S]*?id="mcBatchBtnRehacer"[\s\S]*?id="mcBatchBtnAceptar"/);
  const batchFooter = html.match(/<div class="mc-modal__footer mc-batch-footer">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/)?.[1] || "";
  assert.doesNotMatch(batchFooter, /mcBatchBtnCrear|mcBatchBtnRehacer|mcBatchBtnAceptar/);
  assert.match(css, /\.mc-batch-preview\s*\{[\s\S]*?flex-direction:\s*column;[\s\S]*?align-items:\s*center;/);
  assert.match(css, /\.mc-batch-preview-actions\s*\{[\s\S]*?justify-content:\s*center;/);
  assert.match(css, /\.mc-batch-footer\s*\{[\s\S]*?position:\s*sticky;[\s\S]*?justify-content:\s*space-between;/);
  assert.match(css, /\.mc-batch-preview__image #mcBatchPlaceholderText\s*\{[\s\S]*?display:\s*none;/);
  assert.match(batchJs, /placeholderIcon\.className = "mc-batch-preview__spinner"/);
  assert.match(css, /\.mc-batch-preview__image \.mc-batch-preview__spinner\s*\{[\s\S]*?border-top-color:\s*var\(--mc-accent\);[\s\S]*?animation:\s*mcBatchSpinner/);
  assert.match(html, /id="mcBatchPromptInput"[^>]*class="mc-textarea mc-batch-prompt text-xs"/);
  assert.match(css, /\.mc-batch-prompt\s*\{[\s\S]*?max-height:\s*16rem;[\s\S]*?resize:\s*none;/);
  assert.match(batchJs, /function ajustarAlturaPrompt\(\)[\s\S]*?promptInput\.scrollHeight/);
  assert.match(batchJs, /promptInput\?\.addEventListener\("input", \(\) => \{[\s\S]*?ajustarAlturaPrompt\(\);/);
  assert.match(batchJs, /function detenerGeneracion\(\)[\s\S]*?generationVersion\+\+;[\s\S]*?actualizarUIProgreso\(\);[\s\S]*?manualWordInput\?\.focus\(\);/);
  assert.match(batchJs, /btnCancelar\?\.addEventListener\("click", detenerGeneracion\)/);
  assert.match(batchJs, /requestVersion !== generationVersion/);
  assert.match(batchJs, /if \(btnCancelar\) btnCancelar\.disabled = false;/);
  assert.match(batchJs, /prepVersion !== generationVersion/);
  assert.doesNotMatch(html, /class="text-\[11px\] text-slate-500 leading-tight"/);
  assert.match(html, /id="mcBtnBatchStickersFooter"[^>]*data-mc-start-batch/);
  assert.match(html, /id="mcBtnBatchStickersFooter"[\s\S]*?fa-wand-magic-sparkles/);
  assert.match(html, /id="mcBtnGenerar"[\s\S]*?fa-arrows-rotate/);
  assert.equal((html.match(/data-mc-start-batch/g) || []).length, 2);
  assert.match(batchJs, /querySelectorAll\("\[data-mc-start-batch\]"\)/);
  assert.match(batchJs, /async function iniciarBatch\(\)[\s\S]*?abrirModal\(\);[\s\S]*?await asegurarIndiceStickers\(\)/);
  assert.match(css, /\.mc-drawer \.mc-modal-backdrop\.is-open\s*\{[\s\S]*?display:\s*block;/);
  assert.match(css, /\.mc-batch-preview\s*\{/);
  assert.match(css, /\.mc-batch-footer\s*\{/);
  for (const id of ["mcBatchBtnConfig", "mcBatchBtnCancelar", "mcBatchBtnOmitir", "mcBatchBtnCrear", "mcBatchBtnAceptar"]) {
    const button = html.match(new RegExp(`<button[^>]*id="${id}"[^>]*>`))?.[0] || "";
    assert.match(button, /title="[^"]+"/);
    assert.match(button, /aria-label="[^"]+"/);
  }
});

test("todos los stickers faltantes pueden generarse y aceptarse en secuencia", () => {
  assert.match(html, /id="mcBatchBtnCrearTodas"[^>]*title="Crear y aceptar todos los stickers faltantes"[^>]*aria-label="Crear y aceptar todos los stickers faltantes"/);
  assert.match(batchJs, /async function crearYAceptarTodas\(\)[\s\S]*?while \(!abortRequested && currentIndex < queue\.length\)/);
  assert.match(batchJs, /const generado = await generarStickerActual\(\);[\s\S]*?const guardado = await aceptarYGuardarActual\(\);/);
  assert.match(batchJs, /btnCrearTodas\?\.addEventListener\("click", \(\) => \{[\s\S]*?detenerGeneracion\(\)[\s\S]*?crearYAceptarTodas\(\)/);
  assert.match(batchJs, /isAutoCreating = false;[\s\S]*?actualizarEstadoCrearTodas\(\);/);
  assert.match(batchJs, /btnCrearTodas\.disabled = isGenerating && !isAutoCreating/);
  assert.match(batchJs, /"fas fa-stop mc-icon--rose"/);
});

test("Mindmap carga estilos desde el primer render y reintenta Gemini con otro modelo", () => {
  for (const stylesheet of ["tailwind-lite.css", "sidebar.css", "header.css", "MindmapCreator.css"]) {
    const source = stylesheet === "MindmapCreator.css" ? "MindmapCreator.css\\?ui=20260919-switch-v3" : stylesheet.replace(".", "\\.");
    assert.match(html, new RegExp(`href="${source}"\\s+data-cache-href="${source}"`));
  }
  assert.match(js, /GEMINI_IMAGE_MODEL_FALLBACK = "gemini-3-pro-image"/);
  assert.match(js, /const modelPlan = \[model, alternateModel, model, alternateModel\]/);
  assert.match(js, /singleAttempt:\s*true/);
  assert.match(js, /await esperarReintentoGemini\(delayMs, shouldAbort\)/);
  assert.match(batchJs, /onRetry: \(\{ reason, attempt, totalAttempts, delayMs, switchedModel \}\)/);
  assert.match(batchJs, /shouldAbort: \(\) => abortRequested \|\| requestVersion !== generationVersion/);
  assert.match(apiClientJs, /isGeminiQuotaExhausted = response\.status === 429/);
  assert.match(js, /GEMINI_IMAGE_MIN_INTERVAL_MS = 10000/);
  assert.match(js, /async function reservarTurnoGeminiImage[\s\S]*?geminiImageNextRequestAt - Date\.now\(\)/);
  assert.match(js, /reason:\s*"pacing"/);
  assert.match(js, /geminiImageNextRequestAt = Date\.now\(\) \+ GEMINI_IMAGE_MIN_INTERVAL_MS/);
  assert.match(js, /baseDelay \* \(2 \*\* retryIndex\)[\s\S]*?32000/);
  assert.match(batchJs, /Pausa de seguridad: siguiente generación en \$\{seconds\}s/);
  assert.match(html, /id="mcBatchTranslatePrompt"/);
  assert.match(html, /for="mcBatchTranslatePrompt"[^>]*>Traducir prompt<\/label>/);
  assert.match(js, /const TranslatorApi = globalThis\.Translator/);
  assert.match(js, /TranslatorApi\.availability\(options\)/);
  assert.match(js, /TranslatorApi\.create\(options\)/);
  assert.match(js, /translator\.translate\(sourcePrompt\)/);
  assert.match(js, /traducirPromptConfiguradoLocal\(sourcePrompt\)/);
  assert.doesNotMatch(js, /Translate the following image-generation prompt/);
  assert.match(batchJs, /STORAGE_KEY_TRADUCIR_PROMPT/);
  assert.match(promptTranslationJs, /export function traducirPromptConfiguradoLocal\(prompt\)/);
  assert.match(batchJs, /async function traducirPromptVisible\(promptOriginal, palabra\)/);
  assert.match(batchJs, /promptInput\.dataset\.language = "en"/);
  assert.match(batchJs, /configTranslateInput\.checked[\s\S]*?actualizarPromptActualEnPantalla/);
});
