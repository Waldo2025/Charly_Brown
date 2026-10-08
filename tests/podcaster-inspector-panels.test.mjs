import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const htmlSource = readFileSync(new URL("public/podcaster.html", root), "utf8");
const cssSource = readFileSync(new URL("public/podcaster.css", root), "utf8");
const appSource = readFileSync(new URL("public/podcaster/podcaster.js", root), "utf8");
const layersSource = readFileSync(new URL("public/podcaster/podcaster-scene-image-layers.js", root), "utf8");
const layersCssSource = readFileSync(new URL("public/podcaster/css/podcaster-scene-image-layers.css", root), "utf8");

const PANELS = [
  { id: "reference", body: "podcastStudioInspectorReference" },
  { id: "script", body: "podcastStudioInspectorRowEditor" },
  { id: "layers", body: "podcastStudioInspectorLayers" }
];

function inspectorAsideMarkup() {
  const start = htmlSource.indexOf('<aside id="podcastStudioInspector"');
  assert.ok(start > -1, "El inspector del estudio debe existir en podcaster.html.");
  const end = htmlSource.indexOf("</aside>", start);
  assert.ok(end > start, "El aside del inspector debe cerrar.");
  return htmlSource.slice(start, end);
}

test("inspector is split into collapsible reference, guion and layers panels", () => {
  const markup = inspectorAsideMarkup();
  for (const panel of PANELS) {
    assert.match(
      markup,
      new RegExp(`<section class="inspector-panel" data-inspector-panel="${panel.id}">`),
      `Falta la sección colapsable "${panel.id}".`
    );
    assert.match(
      markup,
      new RegExp(`class="inspector-panel-head"[^>]*aria-controls="${panel.body}"`),
      `El encabezado de "${panel.id}" debe controlar ${panel.body}.`
    );
    assert.match(
      markup,
      new RegExp(`id="${panel.body}" class="inspector-panel-body`),
      `${panel.body} debe ser el cuerpo del panel "${panel.id}".`
    );
  }
});

test("collapsed panels are hidden and the chevron rotates", () => {
  assert.match(cssSource, /\.inspector-panel-body\[hidden\]\s*\{[\s\S]*?display:\s*none;/m);
  assert.match(cssSource, /\.inspector-panel\.is-collapsed \.inspector-panel-chevron\s*\{[\s\S]*?transform:\s*rotate\(-90deg\);/m);
});

test("inspector panels keep their collapsed state between sessions", () => {
  assert.match(appSource, /const PODCAST_STUDIO_INSPECTOR_PANELS_KEY = "cb_podcast_studio_inspector_panels_v1";/);
  assert.match(appSource, /function setPodcastStudioInspectorPanelCollapsed\(panelId = "", collapsed = false\) \{/);
  assert.match(appSource, /window\.localStorage\.setItem\(PODCAST_STUDIO_INSPECTOR_PANELS_KEY, JSON\.stringify\(states\)\);/);
  assert.match(appSource, /function setupPodcastStudioInspectorPanels\(\) \{[\s\S]*?readPodcastStudioInspectorPanelStates\(\);/);
  assert.match(appSource, /setupPodcastStudioInspectorResize\(\);\s*\n\s*setupPodcastStudioInspectorPanels\(\);/);
});

test("inspector sync renders the reference and layers panels for the active scene", () => {
  assert.match(appSource, /function buildInspectorReferenceRowMarkup\(session, row, index = -1\) \{\s*\n\s*return requirePodcasterScriptEditorRuntime\(\)\.buildInspectorReferenceRowMarkup\(session, row, index\);/);
  assert.match(appSource, /els\.podcastStudioInspectorReference\.innerHTML = activeRow\s*\n\s*\? buildInspectorReferenceRowMarkup\(activeSession, activeRow, activeRowIndex\)/);
  assert.match(appSource, /els\.podcastStudioInspectorLayers\.innerHTML = activeRow\s*\n\s*\? buildInspectorSceneLayersMarkup\(activeSession, activeRow\)/);
  assert.match(appSource, /void hydrateAuthorizedReferenceImages\(els\.podcastStudioInspectorReference\);/);
  assert.match(
    appSource,
    /data-action="timeline-open-scene-image-layers" data-row-id="\$\{escapeHtml\(rowId\)\}"/,
    "El panel de capas debe abrir el editor de capas de la escena activa."
  );
});

test("inspector panels only rewrite their DOM when the scene content actually changed", () => {
  assert.match(
    appSource,
    /const layersSignature = buildInspectorSceneLayersSignature\(activeSession, activeRow\);\s*\n\s*if \(forceRender \|\| layersSignature !== podcastStudioInspectorLayersSignature/,
    "El panel de capas debe re-renderizar sólo cuando cambia la firma de la escena."
  );
  assert.match(
    appSource,
    /if \(forceRender \|\| referenceSignature !== podcastStudioInspectorReferenceSignature/,
    "El panel de referencia debe re-renderizar sólo cuando cambia la firma."
  );
  const pendingImageSelector = "img[data-reference-image-src]:not([data-reference-image-state='ready'])";
  assert.ok(
    appSource.includes(pendingImageSelector),
    "La hidratación de imágenes debe omitirse cuando ya están resueltas (evita recargar en cada sync)."
  );
  const referenceBlock = appSource.slice(
    appSource.indexOf("if (els.podcastStudioInspectorReference) {"),
    appSource.indexOf("if (els.podcastStudioInspectorLayers) {")
  );
  assert.match(
    referenceBlock,
    /if \(referenceRebuilt \|\| pendingReferenceImage\) \{\s*\n\s*void hydrateAuthorizedReferenceImages\(els\.podcastStudioInspectorReference\);/,
    "Dentro del panel de referencia la hidratación debe estar condicionada, no correr en cada sync."
  );
});

test("reference panel reuses the inspector click delegation without re-render churn", () => {
  assert.match(appSource, /els\.podcastStudioInspectorReference\.addEventListener\("click", async \(event\) => \{\s*\n\s*await handleStudioInspectorPanelClick\(event\);/);
  assert.match(appSource, /async function handleStudioInspectorPanelClick\(event\) \{/);
  assert.match(appSource, /const referenceSignature = buildInspectorReferenceSignature\(activeSession, activeRow, panelCopy\);/);
  assert.match(appSource, /if \(forceRender \|\| referenceSignature !== podcastStudioInspectorReferenceSignature/);
});

test("saving scene layers refreshes the inspector layers panel", () => {
  assert.match(layersSource, /window\.PodcasterUI\?\.syncPodcastStudioInspector\?\.\(updated, \{ forceRender: true \}\);/);
  assert.match(appSource, /syncPodcastStudioInspector: \(session = null, options = \{\}\) => syncPodcastStudioInspector\(session, options\),/);
});

test("the layer tool rail docks inside the layers panel, not on the inspector edge", () => {
  assert.match(
    layersSource,
    /const panel = document\.querySelector\('#podcastStudioInspector \.inspector-panel\[data-inspector-panel="layers"\]'\);/,
    "La barra de capas debe buscarse dentro del panel 'Capas de escena'."
  );
  assert.match(layersSource, /rail\.className = "scene-image-layers-rail is-panel";/);
  assert.match(layersSource, /panel\.append\(rail\);/);
  assert.doesNotMatch(
    layersSource,
    /rail\.className = "scene-image-layers-rail is-inspector";/,
    "Ya no puede colgarse del aside: se solapaba con las herramientas del visor."
  );
  assert.match(layersCssSource, /\.inspector-panel\[data-inspector-panel="layers"\]\.has-scene-layer-rail\{padding-inline-end:44px\}/);
  assert.match(layersCssSource, /\.scene-image-layers-rail\.is-panel\{right:0;top:0;bottom:0;/);
  assert.match(layersCssSource, /\.inspector-panel\[data-inspector-panel="layers"\]\.is-collapsed \.scene-image-layers-rail\.is-panel\{display:none\}/);
});

test("the layers card is as tall as its tool rail so no button hides behind a scroll", () => {
  const railStart = layersSource.indexOf("const RAIL_HTML = `");
  assert.ok(railStart > -1, "Debe existir la plantilla RAIL_HTML.");
  const railMarkup = layersSource.slice(railStart, layersSource.indexOf("`;", railStart));
  const buttons = (railMarkup.match(/scene-image-layers-rail-btn/g) || []).length;
  const separators = (railMarkup.match(/scene-image-layers-rail-sep/g) || []).length;
  // Botones de 28px + separadores de 1px + huecos de 6px + 24px de relleno vertical.
  const railHeight = buttons * 28 + separators * 1 + (buttons + separators - 1) * 6 + 24;
  assert.match(
    layersCssSource,
    new RegExp(`\\.inspector-panel\\[data-inspector-panel="layers"\\]\\{--layers-rail-height:${railHeight}px\\}`),
    `El panel debe reservar los ${railHeight}px que mide la barra (${buttons} botones + ${separators} separadores).`
  );
  assert.match(
    layersCssSource,
    /\.inspector-panel\[data-inspector-panel="layers"\]\.has-scene-layer-rail:not\(\.is-collapsed\)\{min-height:calc\(var\(--layers-rail-height\) \+ 1px\);grid-template-rows:auto minmax\(0,1fr\)\}/,
    "Sólo el panel abierto se estira; colapsado vuelve a su altura natural."
  );
  assert.match(layersCssSource, /\.inspector-panel\[data-inspector-panel="layers"\] \.inspector-layers-card\{min-height:0;grid-template-rows:minmax\(0,1fr\) auto\}/);
  assert.match(layersCssSource, /\.inspector-panel\[data-inspector-panel="layers"\] \.inspector-layers-list\{min-height:0;overflow-y:auto;scrollbar-width:none;-ms-overflow-style:none\}/);
  assert.match(layersCssSource, /\.scene-image-layers-rail\.is-panel\{scrollbar-width:none;-ms-overflow-style:none\}/);
  assert.match(layersCssSource, /\.scene-image-layers-rail\.is-panel::-webkit-scrollbar\{width:0;height:0\}/);
});

test("the inspector edge rail copies the active clip menu instead of redeclaring its tools", () => {
  const asideEnd = htmlSource.indexOf("</aside>", htmlSource.indexOf('<aside id="podcastStudioInspector"'));
  const railStart = htmlSource.indexOf('<nav id="podcastInspectorSceneToolbar" class="podcast-inspector-scene-toolbar"');
  assert.ok(asideEnd > -1 && railStart > asideEnd, "La barra de escena debe ir FUERA del aside, a su derecha, para no pintarse sobre el panel.");
  // Columna propia del grid: 52px de pista con 42px de barra alineada al borde, así
  // quedan 10px de separación aunque #podcastVideoShell fuerza gap:0 !important.
  assert.match(cssSource, /\.podcast-studio-layout\s*\{[^}]*?grid-template-columns:\s*minmax\(0, 1fr\) clamp\([^;]*\) 52px;/m);
  assert.match(cssSource, /\.podcast-inspector-scene-toolbar\s*\{[\s\S]*?justify-self:\s*end;[\s\S]*?width:\s*42px;/m);
  assert.doesNotMatch(cssSource, /\.podcast-inspector-scene-toolbar\s*\{[^}]*position:\s*absolute;/m);
  assert.doesNotMatch(cssSource, /has-scene-tools-rail/);
  // Iconos apretados y scroll sin barra visible.
  assert.match(cssSource, /\.podcast-inspector-scene-toolbar\s*\{[^}]*?align-self:\s*stretch;[^}]*?gap:\s*2px;[^}]*?scrollbar-width:\s*none;/m);
  assert.match(cssSource, /\.podcast-inspector-scene-toolbar::-webkit-scrollbar\s*\{\s*width:\s*0;\s*height:\s*0;\s*\}/m);
  assert.match(cssSource, /\.podcast-inspector-scene-toolbar \.row-icon-btn\s*\{[\s\S]*?width:\s*24px;[\s\S]*?height:\s*24px;/m);
  assert.match(cssSource, /\.podcast-studio-layout\.is-inspector-collapsed \.podcast-inspector-scene-toolbar\s*\{\s*display:\s*none;/m);
  assert.match(appSource, /function syncInspectorSceneToolbarRail\(activeRowId = ""\) \{/);
  assert.match(appSource, /const signature = menuSource \? `\$\{rowId\}::\$\{menuSource\.innerHTML\}` : "";/);
  assert.match(appSource, /if \(group\.dataset\.signature === signature\) return;/);
  assert.match(appSource, /syncInspectorSceneToolbarRail\(String\(activeRow\?\.id \|\| ""\)\.trim\(\)\);/);
  assert.match(appSource, /document\.querySelector\(selector\)\?\.click\?\.\(\);/);
});

test("the rail's copied clip-menu buttons are served by the timeline click delegate", () => {
  assert.match(
    appSource,
    /setupPodcastInspectorSceneToolbar\(handlePodcastTimelineClick\);/,
    "La barra debe recibir el delegado del timeline; sin él los botones copiados no hacen nada."
  );
  assert.doesNotMatch(
    appSource,
    /setupPodcastInspectorSceneToolbar\(\);/,
    "Ya no puede montarse sin el delegado (init la llamaba así y dejaba la barra muerta)."
  );
  assert.match(appSource, /function setupPodcastInspectorSceneToolbar\(onSceneActionClick = null\) \{/);
  assert.match(appSource, /rail\.dataset\.clickDelegateBound !== "true"/);
  assert.match(appSource, /rail\.addEventListener\("click", onSceneActionClick\);/);
});
