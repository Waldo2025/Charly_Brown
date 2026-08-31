import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { applyCurriculumProfile, createCurriculumRegistry, resolveCurriculumProfile } from "../public/js/science-curriculum-profiles.mjs";

const ecosystemAssetNames = ["sun", "grass", "grasshopper", "frog", "snake", "hawk"];
const [bundle, styles, ecosystemBackground, ...ecosystemAssets] = await Promise.all([
  readFile(new URL("../public/js/export-bundles/science-simulator-export.bundle.js", import.meta.url), "utf8"),
  readFile(new URL("../public/science-assessment-export.css", import.meta.url), "utf8"),
  readFile(new URL("../public/assets/simulator-fallbacks/ecosystem-energy-prairie-v2.webp", import.meta.url)),
  ...ecosystemAssetNames.map((name) => readFile(new URL(`../public/assets/simulator-fallbacks/ecosystem-energy-${name}.webp`, import.meta.url)))
]);
const background = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#123547"/><path d="M0 620h1600v280H0z" fill="#263d45"/><path d="M0 675h1600" stroke="#d9f6f4" stroke-width="16" stroke-dasharray="80 45"/></svg>`;
const vehicle = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="220"><path d="M30 150 100 65h270l100 85v45H30z" fill="#56e0d0"/><circle cx="135" cy="190" r="28"/><circle cx="380" cy="190" r="28"/></svg>`;
const svgDataUrl = (source) => `data:image/svg+xml;base64,${Buffer.from(source).toString("base64")}`;
const webpDataUrl = (source) => `data:image/webp;base64,${source.toString("base64")}`;
const activityFor = ({ embedded = false } = {}) => ({
  title: "MRUA exportado", subject: "physics", topic: "Movimiento rectilíneo uniformemente acelerado (MRUA)",
  visualStyle: "rive-tokyo-tech", gameMode: "simulator", simulationType: "friction",
  mission: "Observa el movimiento.", controls: [
    { id: "velocity", label: "Velocidad", min: 0, max: 40, step: 1, value: 12, unit: "m/s" },
    { id: "mass", label: "Masa", min: 1, max: 25, step: 1, value: 5, unit: "kg" },
    { id: "force", label: "Fuerza", min: -100, max: 100, step: 5, value: 20, unit: "N" }
  ],
  simulator: { modelId: "friction", formula: "a = Δv/Δt", objectiveEnabled: false, loopDistance: 100 },
  visualScene: { version: 1, status: "ready", background: { [embedded ? "dataUrl" : "imageSrc"]: embedded ? svgDataUrl(background) : "/background.svg", alt: "Pista recta" }, layers: [
    { id: "train", label: "Tren bala", role: "primary", [embedded ? "dataUrl" : "imageSrc"]: embedded ? svgDataUrl(vehicle) : "/vehicle.svg", motionPreset: "translate-x", driver: "control:velocity", anchor: { x: .28, y: .68 }, depth: 4, scale: .24, visible: true }
  ], generationWarnings: [] }
});
const numberLineProfile = resolveCurriculumProfile(createCurriculumRegistry({ math: ["La recta numérica"] }), "math", "La recta numérica");
const numberLineActivityFor = ({ embedded = false } = {}) => applyCurriculumProfile({
  title: "Recta numérica exportada", subject: "math", topic: "La recta numérica",
  visualStyle: "rive-tokyo-tech", gameMode: "simulator", simulationType: "number-line",
  controls: [
    { id: "startNumerator", label: "Valor inicial", min: -20, max: 20, step: 1, value: 0 },
    { id: "movementNumerator", label: "Desplazamiento", min: -20, max: 20, step: 1, value: 4 },
    { id: "comparisonNumerator", label: "Punto de comparación", min: -20, max: 20, step: 1, value: 8 },
    { id: "denominator", label: "Subdivisiones por unidad", min: 1, max: 10, step: 1, value: 2 }
  ],
  simulator: { modelId: "number-line" },
  visualScene: { version: 1, status: "ready", background: {
    [embedded ? "dataUrl" : "imageSrc"]: embedded ? svgDataUrl(background) : "/background.svg",
    prompt: "La recta numérica completa y el vector de desplazamiento se dibujan con geometría exacta en el simulador.",
    alt: "Fondo científico"
  }, layers: [], generationWarnings: [] }
}, numberLineProfile);
const ecosystemActivity = {
  title: "Cadena alimentaria exportada", subject: "biology", topic: "Transformación de la energía en los ecosistemas",
  visualStyle: "rive-bio-pulse", gameMode: "simulator", simulationType: "ecosystem-dynamics",
  controls: [
    { id: "solarEnergy", label: "Energía solar disponible", min: 1000, max: 20000, step: 500, value: 10000, unit: "kJ" },
    { id: "producerCapture", label: "Captura de productores", min: 1, max: 10, step: 1, value: 5, unit: "%" },
    { id: "trophicLevels", label: "Niveles tróficos", min: 2, max: 5, step: 1, value: 3, unit: "" },
    { id: "transferEfficiency", label: "Eficiencia de transferencia", min: 5, max: 20, step: 1, value: 10, unit: "%" }
  ],
  simulator: { modelId: "ecosystem-dynamics", sceneVariant: "ecosystem-energy-flow", formula: "Eₙ₊₁ = Eₙ·eficiencia", objectiveEnabled: false },
  visualScene: { version: 1, status: "ready", background: { dataUrl: webpDataUrl(ecosystemBackground), alt: "Pradera realista" }, layers: [
    ["sun", "Sol · fuente de energía", "energy-source", 0, .09, .13, .12],
    ["grass", "Pasto · productor", "producer", 1, .13, .68, .17],
    ["grasshopper", "Saltamontes · consumidor primario", "primary-consumer", 2, .31, .68, .15],
    ["frog", "Rana · consumidor secundario", "secondary-consumer", 3, .49, .68, .15],
    ["snake", "Serpiente · consumidor terciario", "tertiary-consumer", 4, .67, .68, .17],
    ["hawk", "Halcón · depredador superior", "apex-predator", 5, .85, .23, .18]
  ].map(([name, label, role, trophicLevel, x, y, scale], index) => ({ id: `ecosystem-${name}`, label, role, trophicLevel, dataUrl: webpDataUrl(ecosystemAssets[index]), motionPreset: name === "grasshopper" ? "vibrate" : "pulse", driver: trophicLevel === 0 ? "control:solarEnergy" : trophicLevel === 1 ? "control:producerCapture" : "measurement:energyFlow", anchor: { x, y }, depth: index + 4, scale, visible: true })), generationWarnings: [] }
};
const htmlFor = (activity, relative = false) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="${relative ? "styles.css" : "/styles.css"}"><style>html,body{margin:0;min-height:100%}body{min-height:100vh}.game-shell,.game-frame,#scienceGameMount{min-height:100vh}</style></head><body data-science-export data-export-started="true" data-export-style="${activity.visualStyle}"><main class="game-shell sa-page"><section class="game-frame sa-game-frame" data-visual-style="${activity.visualStyle}"><div id="scienceGameMount" class="sa-game-mount"></div></section></main><script>window.SCIENCE_ACTIVITY=${JSON.stringify(activity).replace(/</g, "\\u003c")}</script><script src="${relative ? "bundle.js" : "/bundle.js"}"></script></body></html>`;
const html = htmlFor(activityFor());
const numberLineHtml = htmlFor(numberLineActivityFor());
const server = createServer((request, response) => {
  const routes = { "/bundle.js": ["text/javascript", bundle], "/styles.css": ["text/css", styles], "/background.svg": ["image/svg+xml", background], "/vehicle.svg": ["image/svg+xml", vehicle] };
  const item = routes[request.url];
  response.writeHead(200, { "content-type": `${item?.[0] || "text/html"}; charset=utf-8` });
  response.end(item?.[1] || (request.url === "/number-line" ? numberLineHtml : html));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true });
const temporaryDirectory = await mkdtemp(join(tmpdir(), "science-simulator-export-"));
const execFileAsync = promisify(execFile);
await mkdir(temporaryDirectory, { recursive: true });
await Promise.all([
  writeFile(join(temporaryDirectory, "index.html"), htmlFor(activityFor({ embedded: true }), true)),
  writeFile(join(temporaryDirectory, "bundle.js"), bundle),
  writeFile(join(temporaryDirectory, "styles.css"), styles),
  writeFile(join(temporaryDirectory, "background.svg"), background),
  writeFile(join(temporaryDirectory, "vehicle.svg"), vehicle)
  ,writeFile(join(temporaryDirectory, "number-line.html"), htmlFor(numberLineActivityFor({ embedded: true }), true))
  ,writeFile(join(temporaryDirectory, "ecosystem.html"), htmlFor(ecosystemActivity, true))
]);
const ecosystemPackageDirectory = join(temporaryDirectory, "ecosystem-package");
const ecosystemExtractedDirectory = join(temporaryDirectory, "ecosystem-extracted");
await mkdir(join(ecosystemPackageDirectory, "assets", "simulator"), { recursive: true });
await mkdir(join(ecosystemPackageDirectory, "data"), { recursive: true });
const ecosystemManifest = structuredClone(ecosystemActivity);
ecosystemManifest.visualScene.background = { imageSrc: "assets/simulator/background.webp", alt: "Pradera realista" };
ecosystemManifest.visualScene.layers = ecosystemManifest.visualScene.layers.map((layer, index) => ({ ...layer, dataUrl: "", imageSrc: `assets/simulator/layer-${index + 1}.webp` }));
await Promise.all([
  writeFile(join(ecosystemPackageDirectory, "index.html"), htmlFor(ecosystemActivity, true)),
  writeFile(join(ecosystemPackageDirectory, "bundle.js"), bundle),
  writeFile(join(ecosystemPackageDirectory, "styles.css"), styles),
  writeFile(join(ecosystemPackageDirectory, "data", "activity.json"), JSON.stringify(ecosystemManifest, null, 2)),
  writeFile(join(ecosystemPackageDirectory, "assets", "simulator", "background.webp"), ecosystemBackground),
  ...ecosystemAssets.map((asset, index) => writeFile(join(ecosystemPackageDirectory, "assets", "simulator", `layer-${index + 1}.webp`), asset))
]);
const ecosystemZipPath = join(temporaryDirectory, "ecosystem-offline.zip");
await execFileAsync("zip", ["-qr", ecosystemZipPath, "."], { cwd: ecosystemPackageDirectory });
await execFileAsync("unzip", ["-q", ecosystemZipPath, "-d", ecosystemExtractedDirectory]);
await Promise.all(ecosystemAssetNames.map((_, index) => access(join(ecosystemExtractedDirectory, "assets", "simulator", `layer-${index + 1}.webp`))));

async function verifySimulator(url, label) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  try {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.locator(".science-phaser-simulator.has-generated-scene").waitFor();
    await page.waitForFunction(() => {
      try { return JSON.parse(window.render_game_to_text?.() || "{}").visualScene?.layers?.length > 0; }
      catch { return false; }
    });
    await page.evaluate(() => document.querySelector('[data-action="run"]')?.click());
    const before = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    await page.evaluate(() => window.advanceTime(1800));
    const after = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    assert.equal(after.visualScene.layers[0].x, before.visualScene.layers[0].x, `${label}: el objeto debe quedar fijo en el ZIP`);
    assert.equal(after.visualScene.layers[0].progress, before.visualScene.layers[0].progress, `${label}: el objeto no debe recorrer la pista en el ZIP`);
    assert.equal(after.visualScene.backgroundLayout.loop, true, `${label}: el fondo debe repetirse`);
    assert.equal(after.visualScene.backgroundLayout.motion.source, "integrated-distance");
    assert.equal(after.visualScene.backgroundLayout.motion.directionLabel, "right-to-left");
    assert.notEqual(after.visualScene.backgroundLayout.motion.offset, before.visualScene.backgroundLayout.motion.offset, `${label}: el fondo debe desplazarse`);
    assert.ok(after.motion.velocity > before.motion.velocity, `${label}: MRUA debe acumular velocidad`);
    assert.equal(errors.length, 0, `${label}: ${errors.join("\n")}`);
  } finally {
    await page.close();
  }
}

async function verifyNumberLineSimulator(url, label) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  try {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.locator(".science-number-line-vector").waitFor();
    const controlOrder = await page.locator(".science-sim-control").evaluateAll((nodes) => nodes.map((node) => node.dataset.simControl));
    assert.equal(controlOrder.at(-1), "motionSpeed", `${label}: velocidad debe quedar al final`);
    assert.match(await page.locator('[data-sim-control="motionSpeed"]').textContent(), /Velocidad de reproducción/);
    assert.equal(await page.locator(".science-sim-objective progress").getAttribute("value"), "50", `${label}: 4 respecto de 8 debe mostrar 50%`);
    assert.match(await page.locator("[data-objective-status]").textContent(), /50% de aproximación/);
    const marker = await page.locator('[data-marker="current"]').evaluate((node) => {
      const bounds = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const svg = node.closest("svg");
      const svgBounds = svg?.getBoundingClientRect();
      return { width: bounds.width, height: bounds.height, opacity: style.opacity, visibility: style.visibility, markup: node.outerHTML, namespace: node.namespaceURI, parent: node.parentElement?.tagName, grandparent: node.parentElement?.parentElement?.tagName, svgWidth: svgBounds?.width, svgHeight: svgBounds?.height, viewBox: svg?.getAttribute("viewBox") };
    });
    assert.ok(marker.width > 10 && marker.height > 10, `${label}: el marcador debe conservar tamaño visible: ${JSON.stringify(marker)}`);
    assert.equal(marker.opacity, "1");
    assert.equal(marker.visibility, "visible");
    assert.equal(await page.locator('[data-marker-body="current"]').count(), 1, `${label}: el elemento móvil debe incluir su cuerpo visible`);
    const motion = await page.evaluate(() => {
      window.__numberLineMarker = document.querySelector('[data-marker="current"]');
      const before = Number(window.__numberLineMarker.getAttribute("cx"));
      document.querySelector('[data-action="run"]')?.click();
      window.advanceTime(800);
      const current = document.querySelector('[data-marker="current"]');
      return { sameNode: current === window.__numberLineMarker, before, after: Number(current.getAttribute("cx")), connected: current.isConnected };
    });
    assert.equal(motion.sameNode, true, `${label}: el objeto móvil no debe destruirse durante la animación`);
    assert.equal(motion.connected, true);
    assert.notEqual(motion.after, motion.before, `${label}: el objeto debe desplazarse sobre la recta`);
    const wideLayout = await page.evaluate(() => {
      const viewport = document.querySelector(".science-sim-viewport")?.getBoundingClientRect();
      const telemetry = document.querySelector(".science-sim-telemetry")?.getBoundingClientRect();
      return viewport && telemetry ? {
        viewport: { width: viewport.width, right: viewport.right },
        telemetry: { width: telemetry.width, left: telemetry.left },
      } : null;
    });
    assert.ok(wideLayout, `${label}: debe existir la composición amplia`);
    assert.ok(wideLayout.telemetry.left >= wideLayout.viewport.right - 2, `${label}: el panel amplio debe conservar dos columnas`);
    assert.ok(wideLayout.viewport.width > wideLayout.telemetry.width, `${label}: el visor debe tener prioridad en pantallas amplias`);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => {
      const mount = document.querySelector("#scienceGameMount");
      if (mount) {
        mount.style.width = "840px";
        mount.style.marginInline = "auto";
      }
    });
    await page.waitForTimeout(100);
    const portraitLayout = await page.evaluate(() => {
      const grid = document.querySelector(".science-sim-grid")?.getBoundingClientRect();
      const viewport = document.querySelector(".science-sim-viewport")?.getBoundingClientRect();
      const telemetry = document.querySelector(".science-sim-telemetry")?.getBoundingClientRect();
      return grid && viewport && telemetry ? {
        grid: { width: grid.width },
        viewport: { width: viewport.width, bottom: viewport.bottom },
        telemetry: { width: telemetry.width, top: telemetry.top },
      } : null;
    });
    assert.ok(portraitLayout, `${label}: debe conservarse la cuadrícula del simulador`);
    assert.ok(portraitLayout.viewport.width >= portraitLayout.grid.width - 2, `${label}: el viewport debe ocupar todo el ancho en vertical: ${JSON.stringify(portraitLayout)}`);
    assert.ok(portraitLayout.telemetry.width >= portraitLayout.grid.width - 2, `${label}: la medición debe ocupar toda la segunda fila`);
    assert.ok(portraitLayout.telemetry.top >= portraitLayout.viewport.bottom - 2, `${label}: la medición debe quedar debajo del viewport`);
    const narrowControls = await page.evaluate(() => {
      const controls = document.querySelector(".science-sim-controls");
      const cards = [...document.querySelectorAll(".science-sim-control:not([hidden])")];
      const actions = document.querySelector(".science-sim-actions");
      const buttons = [...actions.querySelectorAll("button")];
      const controlsBounds = controls.getBoundingClientRect();
      const actionsBounds = actions.getBoundingClientRect();
      return {
        columns: getComputedStyle(controls).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
        cardWidths: cards.map((card) => card.getBoundingClientRect().width),
        controlsWidth: controlsBounds.width,
        actionColumns: getComputedStyle(actions).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
        buttonWidths: buttons.map((button) => button.getBoundingClientRect().width),
        actionsWidth: actionsBounds.width,
      };
    });
    assert.equal(narrowControls.columns, 2, `${label}: las cards deben formar dos columnas en tablet`);
    assert.equal(narrowControls.actionColumns, 3, `${label}: las acciones deben aprovechar la fila en tablet`);
    await page.evaluate(() => {
      const mount = document.querySelector("#scienceGameMount");
      if (mount) mount.style.width = "520px";
    });
    await page.waitForTimeout(100);
    const phoneControls = await page.evaluate(() => {
      const header = document.querySelector(".science-sim-header");
      const heading = header.firstElementChild.getBoundingClientRect();
      const status = header.querySelector(".science-sim-status").getBoundingClientRect();
      const controls = document.querySelector(".science-sim-controls");
      const cards = [...document.querySelectorAll(".science-sim-control:not([hidden])")];
      const actions = document.querySelector(".science-sim-actions");
      const buttons = [...actions.querySelectorAll("button")];
      const controlsBounds = controls.getBoundingClientRect();
      const actionsBounds = actions.getBoundingClientRect();
      return {
        headerDisplay: getComputedStyle(header).display,
        headerStacked: status.top >= heading.bottom - 2,
        columns: getComputedStyle(controls).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
        cardWidths: cards.map((card) => card.getBoundingClientRect().width),
        controlsWidth: controlsBounds.width,
        actionColumns: getComputedStyle(actions).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
        buttonWidths: buttons.map((button) => button.getBoundingClientRect().width),
        actionsWidth: actionsBounds.width,
      };
    });
    assert.equal(phoneControls.headerDisplay, "grid", `${label}: el encabezado debe usar grid en teléfono`);
    assert.equal(phoneControls.headerStacked, true, `${label}: el estado debe bajar bajo el título`);
    assert.equal(phoneControls.columns, 1, `${label}: las cards deben formar una columna en teléfono`);
    assert.ok(phoneControls.cardWidths.every((width) => width >= phoneControls.controlsWidth - 2), `${label}: cada card debe ocupar el ancho completo`);
    assert.equal(phoneControls.actionColumns, 1, `${label}: las acciones deben formar una columna en teléfono`);
    assert.ok(phoneControls.buttonWidths.every((width) => width >= phoneControls.actionsWidth - 2), `${label}: cada botón debe ocupar el ancho completo`);
    if (label === "Recta HTTP") await page.locator(".science-phaser-simulator").screenshot({ path: "/tmp/science-number-line-export-fixed.png" });
    assert.equal(errors.length, 0, `${label}: ${errors.join("\n")}`);
  } finally {
    await page.close();
  }
}

async function verifyEcosystemSimulator(url, label) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  try {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text?.() || "{}").visualScene?.layers?.length === 6);
    const initial = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    assert.deepEqual(initial.visualScene.layers.filter((layer) => layer.visible).map((layer) => layer.trophicLevel), [0, 1, 2, 3], `${label}: nivel inicial`);
    await page.evaluate(() => { const input = document.querySelector('[data-sim-param="trophicLevels"]'); input.value = "5"; input.dispatchEvent(new Event("input", { bubbles: true })); });
    const complete = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    assert.deepEqual(complete.visualScene.layers.filter((layer) => layer.visible).map((layer) => layer.trophicLevel), [0, 1, 2, 3, 4, 5], `${label}: cadena completa`);
    assert.equal(complete.visualScene.motionIndicators.length, 5);
    assert.ok(complete.visualScene.motionIndicators.slice(1).every((indicator) => indicator.direction === "prey-to-predator"));
    const terrestrial = complete.visualScene.layers.filter((layer) => [1, 2, 3, 4].includes(layer.trophicLevel));
    assert.ok(Math.max(...terrestrial.map((layer) => layer.y))-Math.min(...terrestrial.map((layer) => layer.y)) <= 8, `${label}: cadena horizontal`);
    assert.ok(await page.locator(".science-sim-ecosystem-label").evaluateAll((labels) => labels.every((node) => getComputedStyle(node).color === "rgb(255, 255, 255)" && getComputedStyle(node).webkitTextFillColor === "rgb(255, 255, 255)")), `${label}: etiquetas blancas`);
    assert.equal(errors.length, 0, `${label}: ${errors.join("\n")}`);
  } finally {
    await page.close();
  }
}

try {
  await verifySimulator(`http://127.0.0.1:${server.address().port}`, "HTTP");
  await verifySimulator(pathToFileURL(join(temporaryDirectory, "index.html")).href, "file://");
  await verifyNumberLineSimulator(`http://127.0.0.1:${server.address().port}/number-line`, "Recta HTTP");
  await verifyNumberLineSimulator(pathToFileURL(join(temporaryDirectory, "number-line.html")).href, "Recta file://");
  await verifyEcosystemSimulator(pathToFileURL(join(ecosystemExtractedDirectory, "index.html")).href, "Ecosistema ZIP file://");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(temporaryDirectory, { recursive: true, force: true });
}
