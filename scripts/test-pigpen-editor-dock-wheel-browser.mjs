import assert from "node:assert/strict";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const css = await readFile(new URL("../public/PigPenCreator.css", import.meta.url), "utf8");
const fields = Array.from({ length: 30 }, (_, index) => (
  `<label class="er-field"><span>Field ${index + 1}</span><textarea rows="4">Editable content</textarea></label>`
)).join("");
const html = `<!doctype html>
<html><head><style>${css}</style></head><body>
  <main class="er-page">
    <div class="er-studio-shell" style="display:grid;min-height:900px">
      <section id="erMissionWorkspacePanel" class="er-card er-mission-workspace-panel er-editor-dock">
        <div class="er-card-header er-editor-dock-header"><h2>Room editor</h2></div>
        <div id="missionEditorList" class="er-mission-list">
          <details class="er-mission-card" open>
            <summary class="er-mission-head">Selected room</summary>
            <div class="er-mission-body">${fields}</div>
          </details>
        </div>
      </section>
    </div>
  </main>
</body></html>`;

const server = http.createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
  await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: "domcontentloaded" });

  const list = page.locator("#missionEditorList");
  const dimensions = await list.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight
  }));
  assert.ok(dimensions.scrollHeight > dimensions.clientHeight, "El formulario debe crear recorrido vertical real.");

  const body = page.locator(".er-mission-body");
  const box = await body.boundingBox();
  assert.ok(box, "El cuerpo de edición debe estar visible.");
  await page.mouse.move(box.x + 24, box.y + 96);
  await page.mouse.wheel(0, 520);
  await page.waitForTimeout(100);

  assert.ok(await list.evaluate((element) => element.scrollTop) > 0, "La rueda debe desplazar el panel sin clic previo.");
  console.log("PigPen editor dock mouse wheel OK.");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
