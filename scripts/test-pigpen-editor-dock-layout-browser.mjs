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
      <section class="er-card er-missions-card er-mission-workspace-panel er-editor-dock" id="erMissionWorkspacePanel">
        <div class="er-editor-dock-header">Question editor</div>
        <div class="er-mission-list">Question fields</div>
      </section>
      <aside class="er-inspector-panel er-studio-dock is-open" id="erInspectorPanel">Rooms and content</aside>
      <aside class="er-brief-panel er-studio-dock is-open" id="briefCollapse">Brief</aside>
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

  console.log("PigPen editor dock shared-row layout OK.");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
