import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { applyCurriculumProfile, createCurriculumRegistry, resolveCurriculumProfile } from "../public/js/science-curriculum-profiles.mjs";

const [runtime, phaser, previewStyles, exportStyles, bundle] = await Promise.all([
  readFile(new URL("../public/js/science-simulator-runtime.mjs", import.meta.url), "utf8"),
  readFile(new URL("../public/vendor/phaser/phaser.esm.min.js", import.meta.url), "utf8"),
  readFile(new URL("../public/scienceActivities.css", import.meta.url), "utf8"),
  readFile(new URL("../public/science-assessment-export.css", import.meta.url), "utf8"),
  readFile(new URL("../public/js/export-bundles/science-simulator-export.bundle.js", import.meta.url), "utf8")
]);
const profile = resolveCurriculumProfile(createCurriculumRegistry({ math: ["Factorización"] }), "math", "Factorización");
const activity = applyCurriculumProfile({ title: "Factorización con rectángulos", subject: "math", topic: "Factorización", gameMode: "simulator", visualStyle: "rive-tokyo-tech", simulator: {}, visualScene: { status: "fallback", background: {}, layers: [], generationWarnings: [] } }, profile);
const previewHtml = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/preview.css"><style>html,body{margin:0;background:#07131f}.sa-page{display:block!important;width:100%!important;max-width:none!important}.sa-game-frame{width:100%!important;max-width:none!important}#mount{width:100%;min-height:900px}</style></head><body><main class="sa-page"><section class="sa-game-frame"><div id="mount"></div></section></main><script type="module">window.SCIENCE_SIMULATOR_PHASER_URL="/phaser.mjs";const {createScienceSimulator}=await import("/runtime.mjs");window.createScienceSimulator=createScienceSimulator;window.controller=await createScienceSimulator("#mount",${JSON.stringify(activity)});</script></body></html>`;
const exportHtml = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/export.css"><style>html,body,.game-shell,.game-frame,#scienceGameMount{margin:0;width:100%;min-height:900px}</style></head><body data-science-export><main class="game-shell"><section class="game-frame"><div id="scienceGameMount"></div></section></main><script>window.SCIENCE_ACTIVITY=${JSON.stringify(activity)}</script><script src="/bundle.js"></script></body></html>`;
const server = createServer((request, response) => { const routes = { "/runtime.mjs": ["text/javascript", runtime], "/phaser.mjs": ["text/javascript", phaser], "/preview.css": ["text/css", previewStyles], "/export.css": ["text/css", exportStyles], "/bundle.js": ["text/javascript", bundle] }; const item = routes[request.url]; response.writeHead(200, { "content-type": `${item?.[0] || "text/html"}; charset=utf-8` }); response.end(item?.[1] || (request.url === "/export" ? exportHtml : previewHtml)); });
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true });

async function verify(url, label) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  const errors = [];page.on("pageerror", error => errors.push(error.message));page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  try {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.locator(".science-factor-board").waitFor();
    assert.equal(await page.locator(".science-factor-box").count(), 1, `${label}: debe mostrar la caja 2×2`);
    assert.equal(await page.locator(".science-factor-cell").count(), 4);
    assert.match(await page.locator(".science-factor-equation strong").textContent(), /x² \+ 5x \+ 6/);
    assert.equal(await page.locator(".science-sim-objective progress").getAttribute("value"), "100", `${label}: explorar muestra identidad verificada`);
    await page.locator('[data-sim-param="factorMode"][value="1"]').click();
    assert.equal(await page.locator(".science-factor-tray").isVisible(), true);
    assert.equal(await page.locator(".science-sim-objective progress").getAttribute("value"), "0");
    const hiddenState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    assert.equal(hiddenState.challenge.trinomial, "x² + 5x + 6");
    assert.equal(JSON.stringify(hiddenState).includes("(x + 2)"), false, `${label}: el texto accesible no debe revelar factores ocultos`);
    await page.locator("[data-factor-assist]").click();
    await page.locator("[data-factor-assist]").click();
    assert.equal(JSON.parse(await page.evaluate(() => window.render_game_to_text())).challenge.middleTermSeparated, true);
    await page.locator('[data-factor-tile="x2"]').dragTo(page.locator('[data-factor-cell="br"]'));
    assert.match(await page.locator(".science-factor-feedback").textContent(), /no corresponde/i);
    assert.equal(JSON.parse(await page.evaluate(() => window.render_game_to_text())).challenge.placedRegions.length, 0);
    await page.locator('[data-factor-tile="x2"]').focus();await page.keyboard.press("Enter");
    await page.locator('[data-factor-cell="tl"]').focus();await page.keyboard.press("Enter");
    assert.deepEqual(JSON.parse(await page.evaluate(() => window.render_game_to_text())).challenge.placedRegions, ["tl"]);
    for (let step = 0; step < 3; step++) await page.locator("[data-factor-assist]").click();
    await page.locator("[data-factor-select-a]").selectOption({ label: "(x + 3)" });
    await page.locator("[data-factor-select-b]").selectOption({ label: "(x + 2)" });
    await page.locator('[data-action="run"]').click();
    assert.equal(await page.locator(".science-sim-objective progress").getAttribute("value"), "100");
    assert.match(await page.locator("[data-objective-status]").textContent(), /Construcción verificada/);
    const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    assert.equal(state.challenge.reached, true);
    assert.equal(state.challenge.placedRegions.length, 4);
    if (label === "Preview") {
      const saved = await page.evaluate(() => JSON.parse(JSON.stringify(window.controller.getState().values._factorization)));
      assert.equal(saved.progress, 100);
      assert.equal(saved.completed, true);
      assert.equal(saved.currentStep, 8);
    }
    assert.equal(errors.length, 0, `${label}: ${errors.join("\n")}`);
    await page.setViewportSize({ width: 390, height: 844 });await page.waitForTimeout(80);
    const cells = await page.locator(".science-factor-cell").evaluateAll(nodes => nodes.map(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })));
    assert.ok(cells.every(cell => cell.width >= 44 && cell.height >= 44), `${label}: las regiones deben conservar áreas táctiles`);
  } finally { await page.close(); }
}

try { const base = `http://127.0.0.1:${server.address().port}`;await verify(base, "Preview");await verify(`${base}/export`, "ZIP"); } finally { await browser.close();await new Promise(resolve => server.close(resolve)); }
