import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const [runtime, phaser, styles] = await Promise.all([
  readFile(new URL("../public/js/science-simulator-runtime.mjs", import.meta.url), "utf8"),
  readFile(new URL("../public/vendor/phaser/phaser.esm.min.js", import.meta.url), "utf8"),
  readFile(new URL("../public/science-assessment-export.css", import.meta.url), "utf8")
]);
const activity = {
  title: "Adición y sustracción: simulador interactivo", subject: "math", topic: "Adición y sustracción",
  visualStyle: "rive-tokyo-tech", simulationType: "addition-subtraction", mission: "Representa operaciones con enteros.",
  controls: [
    { id: "operandA", label: "Primer número", min: -20, max: 20, step: 1, value: 5 },
    { id: "operator", label: "Operación", min: -1, max: 1, step: 2, value: 1, controlType: "segmented", options: [{ value: 1, label: "+" }, { value: -1, label: "−" }] },
    { id: "operandB", label: "Segundo número", min: -20, max: 20, step: 1, value: -3 }
  ],
  simulator: { modelId: "addition-subtraction", formula: "a ± b = resultado", objectiveEnabled: false },
  visualScene: { version: 1, status: "fallback", background: { alt: "Tablero matemático exacto" }, layers: [], generationWarnings: [] }
};
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><style>html,body,#mount{min-height:100%;margin:0}#mount{height:900px}</style></head><body><main id="mount"></main><script type="module">window.SCIENCE_SIMULATOR_PHASER_URL="/phaser.mjs";const {createScienceSimulator}=await import("/runtime.mjs");window.controller=await createScienceSimulator("#mount",${JSON.stringify(activity)});</script></body></html>`;
const server = createServer((request, response) => {
  const routes = { "/runtime.mjs": ["text/javascript", runtime], "/phaser.mjs": ["text/javascript", phaser], "/styles.css": ["text/css", styles] };
  const route = routes[request.url];
  response.writeHead(200, { "content-type": `${route?.[0] || "text/html"}; charset=utf-8` });
  response.end(route?.[1] || html);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: "networkidle" });
  assert.equal(await page.locator('.science-sim-segmented[role="radiogroup"]').getAttribute("aria-label"), "Operación");
  assert.equal(await page.locator('[data-sim-param="operator"]:checked').getAttribute("value"), "1");
  await page.locator('.science-sim-segmented label').filter({ has: page.locator('[data-sim-param="operator"][value="-1"]') }).click();
  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(state.measurement.result, 8);
  assert.equal(state.measurement.signedDelta, 3);
  assert.equal(state.measurement.formula, "5 − (−3) = 8");
  assert.match(await page.locator("[data-formula]").textContent(), /5 − \(−3\) = 8/);
  assert.equal(await page.locator("[data-reading]").textContent(), "8");
  await page.locator('[data-sim-param="operator"][value="1"]').focus();
  await page.keyboard.press("Space");
  assert.equal(JSON.parse(await page.evaluate(() => window.render_game_to_text())).measurement.result, 2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  const bounds = await page.locator(".science-sim-viewport").boundingBox();
  assert.ok(bounds.width > 300 && bounds.height > 190, JSON.stringify(bounds));
  assert.ok(bounds.width / bounds.height > 1.05 && bounds.width / bounds.height < 2, JSON.stringify(bounds));
  assert.equal(errors.length, 0, errors.join("\n"));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
