import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const styles = await readFile(new URL("../public/scienceActivities.css", import.meta.url), "utf8");
const variables = `
  <fieldset class="sa-simulator-visual-choices" id="simulatorVisualChoiceFields">
    <legend>Escena y variables del simulador</legend>
    <section class="sa-simulator-variable-section">
      <header><div><span>Variables del tema</span><small>Relación: a = Δv/Δt</small></div><output>3 variables</output></header>
      <div class="sa-simulator-variable-choices">
        ${["Velocidad", "Masa", "Fuerza"].map((label, index) => `<label class="sa-simulator-variable-card"><span><b>${label}</b><em>0–40</em></span><span class="sa-simulator-variable-input"><input type="number" value="${index + 5}"><i>${index === 0 ? "m/s" : index === 1 ? "kg" : "N"}</i></span><small>Modifica el comportamiento.</small></label>`).join("")}
      </div>
    </section>
    <label class="sa-field sa-simulator-custom-choice" data-custom-scene hidden><span>Describe tu escenario</span><input value="Autopista junto al mar"></label>
  </fieldset>`;
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/styles.css"></head><body class="sa-shell" data-sa-theme="dark"><main class="sa-page"><div style="width:min(580px,calc(100vw - 32px));margin:20px">${variables}</div><div class="sa-session-setup-modal" style="position:static;display:block;background:none"><div style="width:min(580px,calc(100vw - 32px));margin:20px">${variables}</div></div></main></body></html>`;
const server = createServer((request, response) => {
  response.writeHead(200, { "content-type": `${request.url === "/styles.css" ? "text/css" : "text/html"}; charset=utf-8` });
  response.end(request.url === "/styles.css" ? styles : html);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 760, height: 900 } });
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: "networkidle" });
  const dark = await page.locator(".sa-page>div:first-child .sa-simulator-visual-choices").evaluate((node) => {
    const card = node.querySelector(".sa-simulator-variable-card");
    const input = node.querySelector("input");
    return { field: getComputedStyle(node).backgroundColor, card: getComputedStyle(card).backgroundColor, input: getComputedStyle(input).backgroundColor, text: getComputedStyle(input).color };
  });
  assert.notEqual(dark.card, "rgb(255, 255, 255)");
  assert.notEqual(dark.input, "rgb(255, 255, 255)");
  assert.notEqual(dark.text, "rgb(23, 36, 58)");
  const customField = page.locator(".sa-page>div:first-child [data-custom-scene]");
  assert.equal(await customField.evaluate((node) => getComputedStyle(node).display), "none");
  await customField.evaluate((node) => { node.hidden = false; });
  assert.notEqual(await customField.evaluate((node) => getComputedStyle(node).display), "none");
  const modal = await page.locator(".sa-session-setup-modal .sa-simulator-visual-choices").evaluate((node) => ({ cardToken: getComputedStyle(node).getPropertyValue("--sim-choice-card").trim(), input: getComputedStyle(node.querySelector("input")).backgroundColor }));
  assert.equal(modal.cardToken, "#fff");
  assert.equal(modal.input, "rgb(255, 255, 255)");
  await page.setViewportSize({ width: 360, height: 900 });
  const columns = await page.locator(".sa-page>div:first-child .sa-simulator-variable-choices").evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").length);
  assert.equal(columns, 1);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
