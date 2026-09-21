import assert from "node:assert/strict";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const css = await readFile(new URL("../public/PigPenCreator.css", import.meta.url), "utf8");
const html = `<!doctype html>
<html><head><style>${css}</style></head><body>
  <main class="er-page" style="--er-summary-height:48px">
    <section class="er-workspace er-studio-shell" id="erStudioWorkspace">
      <aside class="er-sessions-panel" id="sessions">Sessions</aside>
      <div class="er-main-column" id="mainColumn">
        <section class="er-card er-output-card" style="height:650px">Preview</section>
      </div>
      <section class="er-card er-missions-card er-mission-workspace-panel er-editor-dock er-panel-shell" id="erMissionWorkspacePanel">
        <div id="erMissionWorkspaceResizeHandle" class="er-mission-workspace-resizer"></div>
        <div class="er-card-header er-editor-dock-header er-panel-toolbar" id="editorHeader"><div class="er-editor-dock-meta"><button class="er-studio-icon-button">Regenerate</button><button class="er-studio-icon-button">Close</button></div></div>
        <div class="er-mission-list er-panel-scroll"><div class="er-question-body">
          <label class="er-field"><span>Workspace field</span><input id="workspaceInput"></label>
          <section class="er-type-panel er-question-section-card er-question-config-panel" id="questionConfig"><h5 class="er-label er-question-section-title">Configuración de la pregunta</h5><div class="er-question-grid" id="questionGrid"><label>One<input></label><label>Two<input></label></div></section>
          <section class="er-type-panel er-question-section-card er-question-answer-panel" id="questionAnswers"><h5 class="er-label er-question-section-title">Configuración de las respuestas</h5></section>
          <section class="er-type-panel er-question-section-card er-question-feedback-panel" id="questionFeedback"><h5 class="er-label er-question-section-title">Configuración del feedback</h5></section>
          <section class="er-preview-panel er-question-preview-panel" id="questionImage"><h5 class="er-label er-question-section-title">Imagen de la pregunta</h5><div class="er-question-image-editor"><div class="er-preview-poster er-question-image-preview" id="questionImagePreview"></div><label class="er-field"><span>Prompt de la imagen</span><textarea></textarea></label><div class="er-question-image-actions" id="questionImageActions"><button class="er-button">Sustituir imagen</button><button class="er-button">Regenerar con este prompt</button></div></div></section>
        </div></div>
      </section>
      <aside class="er-inspector-panel er-studio-dock er-panel-shell is-open" id="erInspectorPanel"><div class="er-inspector-tabs er-panel-toolbar" id="inspectorToolbar"><button class="er-inspector-tab is-active" aria-selected="true">Temas</button><button class="er-inspector-tab">Contenido</button><button class="er-inspector-tab">Salas</button></div><div class="er-inspector-body er-panel-scroll"><label class="er-field"><span>Inspector field</span><input id="inspectorInput"></label></div></aside>
      <aside class="er-brief-panel er-studio-dock is-open" id="briefCollapse"><form class="er-card er-form-card er-panel-shell" id="escapeRoomForm"><div class="er-actions er-brief-actions er-panel-toolbar" id="briefToolbar">${Array.from({ length: 5 }, (_, index) => `<button class="er-button er-studio-icon-button" aria-label="Action ${index + 1}">${index + 1}</button>`).join("")}</div><div class="er-form-compact-grid er-brief-form-grid er-panel-scroll"><div class="er-card-header er-form-header-compact er-panel-content-heading"><div><div class="er-card-kicker">Brief</div><h2>Configuración base</h2></div></div><label class="er-field"><span>Brief field</span><input id="briefInput"></label></div><div class="er-brief-footer"><button class="er-button er-brief-generate-button">Generar</button></div></form></aside>
    </section>
  </main>
</body></html>`;

const server = http.createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: "domcontentloaded" });

  const boxes = await page.evaluate(() => Object.fromEntries([
    "mainColumn",
    "erMissionWorkspacePanel",
    "erInspectorPanel",
    "briefCollapse"
  ].map((id) => {
    const rect = document.getElementById(id).getBoundingClientRect();
    return [id, { top: rect.top, left: rect.left, right: rect.right, width: rect.width }];
  })));

  assert.ok(boxes.mainColumn.top < 300, "Abrir el editor no debe enviar el preview a una segunda fila.");
  assert.ok(boxes.erInspectorPanel.top < 300, "El panel de Salas/Contenido debe permanecer visible.");
  assert.ok(boxes.briefCollapse.top < 300, "El panel Brief debe permanecer visible.");
  assert.ok(
    boxes.erMissionWorkspacePanel.left > boxes.mainColumn.left,
    "El editor debe dejar visible una franja del preview a su izquierda."
  );
  assert.equal(
    Math.round(boxes.erMissionWorkspacePanel.right),
    Math.round(boxes.mainColumn.right),
    "El editor debe quedar acoplado al borde derecho del preview."
  );
  assert.equal(Math.round(boxes.erMissionWorkspacePanel.width), 360, "El editor debe iniciar con un ancho compacto de 360 px.");
  const toolbarHeights = await page.evaluate(() => ["briefToolbar", "inspectorToolbar", "editorHeader"].map((id) => Math.round(document.getElementById(id).getBoundingClientRect().height)));
  assert.deepEqual(toolbarHeights, [44, 44, 44], "Los tres paneles deben usar una barra superior compacta de 44 px.");
  const panelColors = await page.evaluate(() => ["escapeRoomForm", "erInspectorPanel", "erMissionWorkspacePanel"].map((id) => getComputedStyle(document.getElementById(id)).backgroundColor));
  assert.equal(new Set(panelColors).size, 1, "Los tres paneles deben compartir la misma superficie base.");
  const controlStyles = await page.evaluate(() => ["briefInput", "inspectorInput", "workspaceInput"].map((id) => {
    const element = document.getElementById(id);
    const style = getComputedStyle(element);
    return { height: Math.round(element.getBoundingClientRect().height), radius: style.borderRadius, background: style.backgroundColor, fontSize: style.fontSize };
  }));
  assert.deepEqual(controlStyles.map(({ height }) => height), [34, 34, 34], "Los campos de los tres paneles deben medir 34 px.");
  assert.equal(new Set(controlStyles.map(({ radius }) => radius)).size, 1, "Los campos deben compartir el mismo radio.");
  assert.equal(new Set(controlStyles.map(({ background }) => background)).size, 1, "Los campos deben compartir la misma superficie.");
  assert.equal(new Set(controlStyles.map(({ fontSize }) => fontSize)).size, 1, "Los campos deben compartir la misma escala tipográfica.");

  await page.locator("#erStudioWorkspace").evaluate((element) => element.style.setProperty("--er-mission-workspace-width", "240px"));
  const compactState = await page.evaluate(() => ({
    width: document.getElementById("erMissionWorkspacePanel").getBoundingClientRect().width,
    columns: getComputedStyle(document.getElementById("questionGrid")).gridTemplateColumns
  }));
  assert.equal(Math.round(compactState.width), 240, "El editor debe aceptar el ancho mínimo de 240 px.");
  assert.equal(compactState.columns.trim().split(/\s+/).length, 1, "Los campos deben cambiar a una columna al estrechar el editor.");
  const sectionState = await page.evaluate(() => ["questionConfig", "questionAnswers", "questionFeedback"].map((id) => {
    const element = document.getElementById(id);
    return { top: element.getBoundingClientRect().top, background: getComputedStyle(element).backgroundColor };
  }));
  assert.ok(sectionState[0].top < sectionState[1].top && sectionState[1].top < sectionState[2].top, "Las cards deben aparecer en el orden configuración, respuestas y feedback.");
  assert.equal(new Set(sectionState.map(({ background }) => background)).size, 1, "Las cards de configuración, respuestas y feedback deben compartir una superficie neutral.");
  const imageEditorState = await page.evaluate(() => ({
    actionColumns: getComputedStyle(document.getElementById("questionImageActions")).gridTemplateColumns,
    previewRatio: getComputedStyle(document.getElementById("questionImagePreview")).aspectRatio,
    followsFeedback: document.getElementById("questionImage").getBoundingClientRect().top > document.getElementById("questionFeedback").getBoundingClientRect().top
  }));
  assert.equal(imageEditorState.actionColumns.trim().split(/\s+/).length, 1, "Las acciones de imagen deben apilarse cuando el editor mide 240 px.");
  assert.equal(imageEditorState.previewRatio, "16 / 9", "La imagen debe conservar una vista previa panorámica estable.");
  assert.equal(imageEditorState.followsFeedback, true, "La card de imagen debe aparecer después de la configuración del feedback.");

  await page.locator("#workspaceInput").click();
  assert.notEqual(await page.locator("#workspaceInput").evaluate((element) => getComputedStyle(element).boxShadow), "none", "Los campos deben mostrar un focus ring visible.");

  await page.locator("#erStudioWorkspace").evaluate((element) => {
    element.style.setProperty("--er-brief-width", "200px");
    element.style.setProperty("--er-brief-track", "200px");
    element.style.setProperty("--er-inspector-width", "200px");
    element.style.setProperty("--er-inspector-track", "200px");
  });
  const narrowPanels = await page.evaluate(() => ["briefCollapse", "erInspectorPanel"].map((id) => {
    const element = document.getElementById(id);
    return { width: Math.round(element.getBoundingClientRect().width), overflows: element.scrollWidth > element.clientWidth + 1 };
  }));
  assert.deepEqual(narrowPanels.map(({ width }) => width), [200, 200], "Brief e inspector deben aceptar su ancho mínimo de 200 px.");
  assert.equal(narrowPanels.some(({ overflows }) => overflows), false, "Los paneles estrechos no deben provocar overflow horizontal.");

  console.log("PigPen editor dock shared-row layout OK.");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
