import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const assetNames = ["sun", "grass", "grasshopper", "frog", "snake", "hawk"];
const [runtime, phaser, styles, background, ...assets] = await Promise.all([
  readFile(new URL("../public/js/science-simulator-runtime.mjs", import.meta.url), "utf8"),
  readFile(new URL("../public/vendor/phaser/phaser.esm.min.js", import.meta.url), "utf8"),
  readFile(new URL("../public/science-assessment-export.css", import.meta.url), "utf8"),
  readFile(new URL("../public/assets/simulator-fallbacks/ecosystem-energy-prairie-v2.webp", import.meta.url)),
  ...assetNames.map((name) => readFile(new URL(`../public/assets/simulator-fallbacks/ecosystem-energy-${name}.webp`, import.meta.url)))
]);

const layerDefinitions = [
  ["sun", "Sol · fuente de energía", "energy-source", 0, .09, .13, .12],
  ["grass", "Pasto · productor", "producer", 1, .13, .68, .17],
  ["grasshopper", "Saltamontes · consumidor primario", "primary-consumer", 2, .31, .68, .15],
  ["frog", "Rana · consumidor secundario", "secondary-consumer", 3, .49, .68, .15],
  ["snake", "Serpiente · consumidor terciario", "tertiary-consumer", 4, .67, .68, .17],
  ["hawk", "Halcón · depredador superior", "apex-predator", 5, .85, .23, .18]
];
const activity = {
  title: "Transformación de la energía en los ecosistemas: simulador interactivo",
  subject: "biology",
  topic: "Transformación de la energía en los ecosistemas",
  visualStyle: "rive-bio-pulse",
  simulationType: "ecosystem-dynamics",
  controls: [
    { id: "solarEnergy", label: "Energía solar disponible", min: 1000, max: 20000, step: 500, value: 10000, unit: "kJ" },
    { id: "producerCapture", label: "Captura de productores", min: 1, max: 10, step: 1, value: 5, unit: "%" },
    { id: "trophicLevels", label: "Niveles tróficos", min: 2, max: 5, step: 1, value: 3, unit: "" },
    { id: "transferEfficiency", label: "Eficiencia de transferencia", min: 5, max: 20, step: 1, value: 10, unit: "%" }
  ],
  simulator: { modelId: "ecosystem-dynamics", sceneVariant: "ecosystem-energy-flow", formula: "Eₙ₊₁ = Eₙ·eficiencia", objectiveEnabled: false },
  visualScene: {
    status: "ready",
    background: { imageSrc: "/ecosystem-energy-prairie-v2.webp", alt: "Pradera abierta" },
    layers: layerDefinitions.map(([name, label, role, trophicLevel, x, y, scale], index) => ({
      id: `ecosystem-${name}`, label, role, trophicLevel, imageSrc: `/ecosystem-energy-${name}.webp`, motionPreset: name === "grasshopper" ? "vibrate" : "pulse", driver: trophicLevel === 0 ? "control:solarEnergy" : trophicLevel === 1 ? "control:producerCapture" : "measurement:energyFlow", anchor: { x, y }, depth: index + 4, scale, visible: true
    }))
  }
};
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><main id="mount"></main><script type="module">window.SCIENCE_SIMULATOR_PHASER_URL="/phaser.mjs";const {createScienceSimulator}=await import("/runtime.mjs");window.activity=${JSON.stringify(activity)};window.createSimulator=async visualScene=>{window.controller?.destroy?.();window.controller=await createScienceSimulator("#mount",{...window.activity,visualScene});return window.controller};await window.createSimulator(window.activity.visualScene);</script></body></html>`;
const routes = {
  "/runtime.mjs": ["text/javascript", runtime],
  "/phaser.mjs": ["text/javascript", phaser],
  "/styles.css": ["text/css", styles],
  "/ecosystem-energy-prairie-v2.webp": ["image/webp", background]
};
assetNames.forEach((name, index) => { routes[`/ecosystem-energy-${name}.webp`] = ["image/webp", assets[index]]; });
const server = createServer((request, response) => {
  const route = routes[request.url];
  response.writeHead(200, { "content-type": route?.[0] || "text/html" });
  response.end(route?.[1] || html);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: "networkidle" });
  await page.locator(".science-phaser-simulator.has-generated-scene").waitFor();
  const initial = await state();
  assert.equal(initial.visualScene.layers.length, 6);
  assert.deepEqual(initial.visualScene.layers.filter((layer) => layer.visible).map((layer) => layer.trophicLevel), [0, 1, 2, 3]);
  assert.equal(initial.visualScene.motionIndicators.length, 3);
  assert.ok(initial.visualScene.motionIndicators.slice(1).every((item) => item.direction === "prey-to-predator"));
  assert.ok(initial.visualScene.backgroundLayout?.width > 0);
  assert.equal(initial.visualScene.pixelRatio, 2);
  assert.ok(initial.visualScene.layers.every((layer) => layer.labelResolution === 2));
  assert.ok(initial.visualScene.layers.every((layer) => layer.labelRenderer === "dom"));
  assert.equal(await page.locator(".science-sim-ecosystem-label").count(), 6);
  assert.ok(await page.locator(".science-sim-ecosystem-label").evaluateAll((labels) => labels.every((label) => getComputedStyle(label).color === "rgb(255, 255, 255)" && getComputedStyle(label).webkitTextFillColor === "rgb(255, 255, 255)")));
  for (const level of [2, 3, 4, 5]) {
    await page.evaluate((value) => window.controller.setParam("trophicLevels", value), level);
    const current = await state();
    assert.deepEqual(current.visualScene.layers.filter((layer) => layer.visible).map((layer) => layer.trophicLevel), Array.from({ length: level + 1 }, (_, index) => index));
    assert.equal(current.visualScene.motionIndicators.length, level, `Deben existir ${level} transferencias visibles`);
  }
  const beforeEnergy = await state();
  await page.evaluate(() => { window.controller.setParam("producerCapture", 9); window.controller.setParam("transferEfficiency", 20); window.controller.run(); window.advanceTime(1200); });
  const afterEnergy = await state();
  assert.notEqual(afterEnergy.measurement.finalEnergy, beforeEnergy.measurement.finalEnergy);
  assert.notDeepEqual(afterEnergy.visualScene.motionIndicators, beforeEnergy.visualScene.motionIndicators);
  assert.ok(afterEnergy.visualScene.layers.every((layer) => layer.label.includes(" · ")));
  const terrestrial = afterEnergy.visualScene.layers.filter((layer) => [1, 2, 3, 4].includes(layer.trophicLevel));
  assert.ok(Math.max(...terrestrial.map((layer) => layer.y))-Math.min(...terrestrial.map((layer) => layer.y)) <= 8, "La cadena terrestre debe permanecer horizontal sobre la pradera");
  await page.evaluate(() => window.controller.pause());
  await page.waitForTimeout(50);
  await page.locator(".science-sim-viewport").screenshot({ path: "/tmp/science-ecosystem-energy-raster-chain-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  const mobile = await state();
  const mobileBounds = await page.evaluate(() => ({ innerWidth, mount: document.querySelector("#mount").getBoundingClientRect().width, simulator: document.querySelector(".science-phaser-simulator").getBoundingClientRect().width, viewport: document.querySelector(".science-sim-viewport").getBoundingClientRect().width }));
  assert.ok(mobile.visualScene.layers.filter((layer) => layer.visible).every((layer) => layer.x >= 0 && layer.x <= 390 && layer.y >= 0 && layer.y <= 844), JSON.stringify({ mobileBounds, layers: mobile.visualScene.layers.map(({ id, x, y }) => ({ id, x, y })) }));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(async () => window.createSimulator(window.activity.visualScene));
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).visualScene.layers.length === 6);
  const reducedBefore = await state();
  await page.evaluate(() => { window.controller.run(); window.advanceTime(1200); });
  const reducedAfter = await state();
  assert.deepEqual(reducedAfter.visualScene.layers.map(({ x, y }) => ({ x, y })), reducedBefore.visualScene.layers.map(({ x, y }) => ({ x, y })));
  await page.locator(".science-sim-viewport").screenshot({ path: "/tmp/science-ecosystem-energy-raster-chain.png" });
  const overlaySource = runtime.match(/export function drawEcosystemEnergyOverlay[\s\S]*?\n\}/)?.[0] || "";
  assert.doesNotMatch(overlaySource, /strokeCircle|strokeEllipse|fillEllipse/);
  assert.equal(errors.length, 0, errors.join("\n"));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
