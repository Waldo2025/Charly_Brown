import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { applyCurriculumProfile, createCurriculumRegistry, resolveCurriculumProfile } from "../public/js/science-curriculum-profiles.mjs";

const [runtime, phaser, styles, editorStyles, observatoryBackground] = await Promise.all([
  readFile(new URL("../public/js/science-simulator-runtime.mjs", import.meta.url), "utf8"),
  readFile(new URL("../public/vendor/phaser/phaser.esm.min.js", import.meta.url), "utf8"),
  readFile(new URL("../public/science-assessment-export.css", import.meta.url), "utf8"),
  readFile(new URL("../public/scienceActivities.css", import.meta.url), "utf8"),
  readFile(new URL("../public/assets/simulator-fallbacks/number-line-observatory-v1.webp", import.meta.url))
]);

const legacyBackground = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#17214c"/><path d="M80 450h1440" stroke="#fff" stroke-width="16"/><path d="M800 400v100" stroke="#fff" stroke-width="12"/></svg>`;
const legacyArrow = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160"><path d="M300 80 180 10v40H20v60h160v40z" fill="#ffd43b"/></svg>`;
const numberLineProfile = resolveCurriculumProfile(createCurriculumRegistry({ math: ["La recta numérica"] }), "math", "La recta numérica");
const activity = applyCurriculumProfile({
  title: "Recta numérica",
  subject: "math",
  topic: "La recta numérica",
  visualStyle: "rive-tokyo-tech",
  simulationType: "number-line",
  controls: [
    { id: "startNumerator", label: "Valor inicial", min: -20, max: 20, step: 1, value: 0 },
    { id: "movementNumerator", label: "Desplazamiento", min: -20, max: 20, step: 1, value: 4 },
    { id: "comparisonNumerator", label: "Comparación", min: -20, max: 20, step: 1, value: 8 },
    { id: "denominator", label: "Subdivisiones por unidad", min: 1, max: 10, step: 1, value: 2 }
  ],
  simulator: { modelId: "number-line", formula: "posición final = inicio + desplazamiento" },
  visualScene: {
    status: "ready",
    background: { imageSrc: "/legacy-background.svg", prompt: "Recta horizontal generada dentro del fondo", alt: "Fondo antiguo con una recta" },
    layers: [{ id: "legacy-vector", label: "Vector de desplazamiento", role: "primary", imageSrc: "/legacy-arrow.svg", motionPreset: "translate-x", driver: "time", anchor: { x: .5, y: .5 }, visible: true }],
    generationWarnings: [
      "Vector de desplazamiento: Control visual rechazó la imagen: contiene una flecha",
      "Indicador de desplazamiento: Control visual rechazó la imagen: El objeto es un elemento de interfaz (HUD) y no un objeto físico completo."
    ]
  }
}, numberLineProfile);
activity.controls.find((control) => control.id === "startNumerator").value = 0;
activity.controls.find((control) => control.id === "movementNumerator").value = 4;
activity.controls.find((control) => control.id === "comparisonNumerator").value = 8;

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/editor-styles.css"><style>html,body{margin:0;min-height:100%;background:#07131f}.sa-page{display:block!important;width:100%!important;max-width:none!important}.sa-game-frame{width:100%!important;max-width:none!important}#mount{width:100%;min-height:760px}</style></head><body><main class="sa-page"><div class="sa-game-frame"><main id="mount"></main></div></main><script type="module">window.SCIENCE_SIMULATOR_PHASER_URL="/phaser.mjs";const {createScienceSimulator}=await import("/runtime.mjs");window.createScienceSimulator=createScienceSimulator;window.controller=await createScienceSimulator("#mount",${JSON.stringify(activity)});</script></body></html>`;
const server = createServer((request, response) => {
  const routes = {
    "/runtime.mjs": ["text/javascript", runtime],
    "/phaser.mjs": ["text/javascript", phaser],
    "/styles.css": ["text/css", styles],
    "/editor-styles.css": ["text/css", editorStyles],
    "/number-line-observatory-v1.webp": ["image/webp", observatoryBackground],
    "/legacy-background.svg": ["image/svg+xml", legacyBackground],
    "/legacy-arrow.svg": ["image/svg+xml", legacyArrow]
  };
  const item = routes[request.url];
  response.writeHead(200, { "content-type": `${item?.[0] || "text/html"}; charset=utf-8` });
  response.end(item?.[1] || html);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 960, height: 760 }, deviceScaleFactor: 2 });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

try {
  await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: "networkidle" });
  await page.locator(".science-phaser-simulator").waitFor();
  const initial = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(initial.visualScene.backgroundLayout, null, "Un fondo heredado con recta incrustada debe ignorarse");
  assert.deepEqual(initial.visualScene.layers, [], "El runtime no debe cargar flechas ni objetos generados para la recta");
  assert.equal(initial.visualScene.warnings.length, 0);
  assert.equal(initial.motion.currentPosition, 0);
  assert.equal(initial.motion.totalJumps, 4);
  assert.equal(initial.measurement.comparison, 8);
  assert.equal(initial.measurement.finalPosition, 4);
  assert.equal(activity.simulator.objectiveEnabled, true, "El perfil real debe mostrar RETO OPCIONAL en el preview");
  assert.equal(activity.simulator.objectiveTargetMetric, "comparison");
  assert.equal(await page.locator(".science-sim-objective").isVisible(), true);
  assert.equal(await page.locator(".science-sim-objective progress").getAttribute("value"), "50");
  assert.match(await page.locator("[data-objective-status]").textContent(), /50% de aproximación/);
  await page.evaluate(() => window.controller.setParam("comparisonNumerator", 4));
  assert.equal(await page.locator(".science-sim-objective progress").getAttribute("value"), "100");
  assert.match(await page.locator("[data-objective-status]").textContent(), /Objetivo alcanzado/);
  await page.evaluate(() => window.controller.setParam("comparisonNumerator", 8));
  assert.equal(initial.measurement.fractionMode, false);
  assert.equal(await page.locator('[data-sim-control="denominator"]').isHidden(), true);
  assert.equal(await page.locator('[data-sim-param="numberMode"]').count(), 2);
  assert.equal(await page.locator('[data-sim-param="motionSpeed"]').inputValue(), "0.5");
  const controlOrder = await page.locator('.science-sim-control').evaluateAll((nodes) => nodes.map((node) => node.dataset.simControl));
  assert.equal(controlOrder.at(-1), "motionSpeed", "La velocidad de reproducción debe ser el último control");
  assert.match(await page.locator('[data-sim-control="motionSpeed"]').textContent(), /Velocidad de reproducción/);
  const segmentedStyle = await page.locator('.science-sim-segmented').evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    return { width: bounds.width, height: bounds.height, role: node.getAttribute('role'), radios: node.querySelectorAll('input[type="radio"]').length };
  });
  assert.equal(segmentedStyle.role, "radiogroup");
  assert.equal(segmentedStyle.radios, 2);
  assert.ok(segmentedStyle.width <= 242 && segmentedStyle.height <= 40, `El switch debe ser compacto: ${JSON.stringify(segmentedStyle)}`);
  assert.equal(await page.locator('.science-phaser-simulator').getAttribute('data-simulator-model'), "number-line");
  assert.equal(await page.evaluate(() => window.devicePixelRatio), 2);
  assert.equal(await page.locator('.science-number-line-vector').count(), 1, "La recta debe renderizarse como SVG vectorial independiente de la densidad de píxeles");
  const previewVectorStyle = await page.locator('.science-number-line-vector').evaluate((node) => {
    const style = getComputedStyle(node);
    return { position: style.position, width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height, opacity: style.opacity, visibility: style.visibility };
  });
  assert.equal(previewVectorStyle.position, "absolute", "El CSS del preview debe posicionar la recta sin depender del CSS del ZIP");
  assert.ok(previewVectorStyle.width > 300 && previewVectorStyle.height > 200, `La recta del preview debe cubrir el viewport: ${JSON.stringify(previewVectorStyle)}`);
  assert.equal(previewVectorStyle.opacity, "1");
  assert.equal(previewVectorStyle.visibility, "visible");
  assert.equal(await page.locator('.science-number-line-vector').evaluate((node) => node.style.zIndex), "5", "La recta debe conservar su capa aunque el CSS externo esté desactualizado");
  assert.equal(await page.locator('[data-marker-body="current"]').count(), 1, "El objeto móvil debe conservar un cuerpo visible de alto contraste");
  assert.equal(await page.locator('.science-number-line-vector').getAttribute('shape-rendering'), "geometricPrecision");
  assert.ok(await page.locator('.science-number-line-vector [vector-effect="non-scaling-stroke"]').count() > 3, "La escala, marcas y contornos deben conservar trazos vectoriales nítidos");
  const desktopColumns = await page.locator('.science-sim-controls').evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(/\s+/).filter(Boolean).length);
  assert.equal(desktopColumns, 2, "La cuadrícula debe usar dos columnas en tablets y paneles medianos");
  const compactActions = await page.locator('.science-sim-actions').evaluate((node) => ({
    columns: getComputedStyle(node).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
    width: node.getBoundingClientRect().width,
    buttonWidths: [...node.querySelectorAll('button')].map((button) => button.getBoundingClientRect().width)
  }));
  assert.equal(compactActions.columns, 3, "Las acciones pueden compartir fila en tablets");
  await page.setViewportSize({ width: 520, height: 900 });
  await page.waitForTimeout(80);
  const phoneLayout = await page.evaluate(() => {
    const header = document.querySelector('.science-sim-header');
    const heading = header.firstElementChild.getBoundingClientRect();
    const status = header.querySelector('.science-sim-status').getBoundingClientRect();
    const controls = document.querySelector('.science-sim-controls');
    const actions = document.querySelector('.science-sim-actions');
    const actionsBounds = actions.getBoundingClientRect();
    return {
      headerDisplay: getComputedStyle(header).display,
      headerStacked: status.top >= heading.bottom - 2,
      controlColumns: getComputedStyle(controls).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
      actionColumns: getComputedStyle(actions).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
      actionsWidth: actionsBounds.width,
      buttonWidths: [...actions.querySelectorAll('button')].map((button) => button.getBoundingClientRect().width)
    };
  });
  assert.equal(phoneLayout.headerDisplay, "grid");
  assert.equal(phoneLayout.headerStacked, true, "El estado debe bajar bajo el título en teléfono");
  assert.equal(phoneLayout.controlColumns, 1, "Los controles deben formar una columna en teléfono");
  assert.equal(phoneLayout.actionColumns, 1, "Las acciones deben formar una columna en teléfono");
  assert.ok(phoneLayout.buttonWidths.every((width) => width >= phoneLayout.actionsWidth - 2), "Cada acción debe ocupar todo el ancho en teléfono");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(80);
  const laptopColumns = await page.locator('.science-sim-controls').evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(/\s+/).filter(Boolean).length);
  assert.equal(laptopColumns, 6, "La cuadrícula debe mostrar seis controles por fila en laptops y pantallas grandes");
  await page.evaluate(() => window.controller.setParam("numberMode", 1));
  const laptopControlRows = await page.locator('.science-sim-control:not([hidden])').evaluateAll((nodes) => new Set(nodes.map((node) => Math.round(node.getBoundingClientRect().top))).size);
  assert.equal(laptopControlRows, 1, "Los seis controles visibles del modo fracciones deben permanecer en una sola fila");
  await page.locator('.science-phaser-simulator').screenshot({ path: "/tmp/science-number-line-six-columns.png" });
  await page.evaluate(() => window.controller.setParam("numberMode", 0));
  await page.setViewportSize({ width: 960, height: 760 });
  await page.waitForTimeout(80);
  assert.equal(initial.running, false);

  const visualThemes = [...runtime.matchAll(/^\s*"([^"]+)":\{bg:"([^"]+)",bg2:"[^"]+",panel:"([^"]+)",accent:"([^"]+)",secondary:"[^"]+",text:"([^"]+)"/gm)]
    .map(([, visualStyle, bg, panel, accent, text]) => ({ visualStyle, bg, panel, accent, text }));
  assert.equal(visualThemes.length, 17, "La prueba de contraste debe cubrir todos los estilos visuales del simulador");
  const contrastSamples = await page.evaluate((visualThemes) => {
    const normalizeColor = (value) => {
      const probe = document.createElement("i");
      probe.style.color = value;
      document.body.append(probe);
      const normalized = getComputedStyle(probe).color;
      probe.remove();
      return normalized;
    };
    const results = [];
    const root = document.querySelector(".science-phaser-simulator");
    for (const theme of visualThemes) {
      root.dataset.visualStyle = theme.visualStyle;
      root.style.setProperty("--sim-bg", theme.bg);
      root.style.setProperty("--sim-panel", theme.panel);
      root.style.setProperty("--sim-accent", theme.accent);
      root.style.setProperty("--sim-text", theme.text);
      const title = root.querySelector(".science-sim-control > span > b");
      const output = root.querySelector(".science-sim-control output");
      const inactiveOption = root.querySelector('.science-sim-segmented input:not(:checked) + span');
      const activeOption = root.querySelector('.science-sim-segmented input:checked + span');
      const titleStyle = getComputedStyle(title);
      const outputStyle = getComputedStyle(output);
      const inactiveStyle = getComputedStyle(inactiveOption);
      const activeStyle = getComputedStyle(activeOption);
      results.push({
        visualStyle: theme.visualStyle,
        expectedText: normalizeColor(getComputedStyle(root).getPropertyValue("--sim-text")),
        expectedAccent: normalizeColor(getComputedStyle(root).getPropertyValue("--sim-accent")),
        expectedActiveText: normalizeColor(getComputedStyle(root).getPropertyValue("--sim-bg")),
        title: titleStyle.color,
        titleFill: titleStyle.getPropertyValue("-webkit-text-fill-color"),
        output: outputStyle.color,
        outputFill: outputStyle.getPropertyValue("-webkit-text-fill-color"),
        inactive: inactiveStyle.color,
        inactiveFill: inactiveStyle.getPropertyValue("-webkit-text-fill-color"),
        active: activeStyle.color,
        activeFill: activeStyle.getPropertyValue("-webkit-text-fill-color")
      });
    }
    return results;
  }, visualThemes);
  for (const sample of contrastSamples) {
    assert.equal(sample.title, sample.expectedText, `${sample.visualStyle}: el título debe usar el texto legible del tema`);
    assert.equal(sample.titleFill, sample.expectedText, `${sample.visualStyle}: WebKit no debe oscurecer el título`);
    assert.equal(sample.output, sample.expectedAccent, `${sample.visualStyle}: el valor debe usar el acento del tema`);
    assert.equal(sample.outputFill, sample.expectedAccent, `${sample.visualStyle}: WebKit no debe oscurecer el valor`);
    assert.equal(sample.inactive, sample.expectedText, `${sample.visualStyle}: la opción inactiva debe seguir siendo legible`);
    assert.equal(sample.inactiveFill, sample.expectedText, `${sample.visualStyle}: WebKit no debe ocultar la opción inactiva`);
    assert.equal(sample.active, sample.expectedActiveText, `${sample.visualStyle}: la opción activa debe contrastar sobre el gradiente`);
    assert.equal(sample.activeFill, sample.expectedActiveText, `${sample.visualStyle}: WebKit no debe alterar la opción activa`);
  }

  const backgroundActivity = structuredClone(activity);
  backgroundActivity.visualScene.background = {
    imageSrc: "/number-line-observatory-v1.webp",
    prompt: "Observatorio despejado: la recta numérica completa y el vector de desplazamiento se dibujan con geometría exacta en el simulador.",
    alt: "Observatorio científico nocturno"
  };
  await page.evaluate(async (nextActivity) => {
    const mount = document.createElement("div");
    mount.id = "background-mount";
    mount.style.cssText = "width:960px;min-height:760px";
    document.body.append(mount);
    window.backgroundController = await window.createScienceSimulator(mount, nextActivity);
  }, backgroundActivity);
  await page.waitForFunction(() => {
    const state = JSON.parse(window.render_game_to_text());
    return state.visualScene.backgroundLayout?.width > 0;
  });
  const withBackground = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(withBackground.visualScene.background, "Observatorio científico nocturno");
  assert.ok(withBackground.visualScene.backgroundLayout.width > 0);
  assert.ok(Math.abs(withBackground.visualScene.backgroundLayout.ratio - 16 / 9) < .02);
  assert.equal(withBackground.visualScene.layers.length, 0, "El fondo no debe convertir la geometría matemática en una imagen");
  await page.locator("#background-mount .science-phaser-simulator").screenshot({ path: "/tmp/science-number-line-background.png" });
  await page.evaluate(() => { window.backgroundController.destroy(); document.querySelector("#background-mount")?.remove(); });

  await page.evaluate(() => { window.controller.run(); window.advanceTime(800); });
  const middle = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(middle.running, true);
  assert.equal(middle.motion.completedJumps, 1);
  assert.ok(middle.motion.currentPosition >= 1 && middle.motion.currentPosition < 2, `El segundo salto debe estar en curso; posición obtenida: ${middle.motion.currentPosition}`);

  await page.evaluate(() => window.advanceTime(2400));
  const completed = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(completed.running, false);
  assert.equal(completed.motion.currentPosition, 4);
  assert.equal(completed.motion.completedJumps, 4);
  assert.equal(completed.motion.complete, true);
  assert.match(await page.locator(".science-sim-status span").textContent(), /Movimiento completado/);

  await page.evaluate(() => window.advanceTime(8000));
  const stopped = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(stopped.motion.currentPosition, 4, "El marcador no debe reiniciarse ni entrar en loop");
  assert.equal(stopped.motion.progress, 1);

  await page.evaluate(() => window.controller.setParam("startNumerator", -1));
  const configured = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(configured.running, false);
  assert.equal(configured.motion.currentPosition, -1, "El valor inicial -1 debe caer exactamente en -1, no en -1/2");
  assert.equal(configured.measurement.finalPosition, 3);
  await page.evaluate(() => window.controller.setParam("numberMode", 1));
  const fractional = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(fractional.measurement.start, -.5);
  assert.equal(fractional.measurement.movement, 2);
  assert.equal(fractional.measurement.finalPosition, 1.5);
  assert.equal(fractional.measurement.comparison, 4);
  assert.equal(fractional.measurement.formula, "-1/2 + 4/2 = 3/2");
  assert.equal(fractional.motion.jumpSize, .5);
  assert.equal(fractional.motion.totalJumps, 4);
  assert.equal(await page.locator('[data-sim-control="denominator"]').isVisible(), true);
  assert.match(await page.locator('[data-sim-control-label="startNumerator"]').textContent(), /Numerador inicial/);
  await page.evaluate(() => { window.controller.run(); window.advanceTime(3200); });
  const fractionalCompleted = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(fractionalCompleted.motion.completedJumps, 4);
  assert.equal(fractionalCompleted.motion.currentPosition, 1.5);
  await page.evaluate(() => { window.controller.setParam("motionSpeed", 2); window.controller.run(); window.advanceTime(800); });
  const fastCompleted = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(fastCompleted.motion.complete, true, "A 2× el recorrido debe completarse en 800 ms");
  await page.evaluate(() => { window.controller.setParam("motionSpeed", .25); window.controller.run(); window.advanceTime(800); });
  const slowProgress = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(slowProgress.motion.complete, false);
  assert.ok(slowProgress.motion.progress >= .12 && slowProgress.motion.progress < .14, `A 0.25× debe avanzar cerca de 12.5%; progreso: ${slowProgress.motion.progress}`);
  const slowVisualSync = await page.locator('.science-number-line-vector').evaluate((svg) => {
    const path = svg.querySelector('[data-layer="jumps"]');
    const marker = svg.querySelector('[data-marker="current"]');
    const endpoint = path.getPointAtLength(path.getTotalLength());
    return { deltaX: Math.abs(endpoint.x - Number(marker.getAttribute('cx'))), deltaY: Math.abs(endpoint.y - Number(marker.getAttribute('cy'))) };
  });
  assert.ok(slowVisualSync.deltaX < .75 && slowVisualSync.deltaY < .75, `A 0.25× la bola debe permanecer sobre el extremo de la trayectoria: ${JSON.stringify(slowVisualSync)}`);
  await page.screenshot({ path: "/tmp/science-number-line-fractions.png", fullPage: true });
  await page.evaluate(() => window.controller.setParam("numberMode", 0));
  const integerAgain = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(integerAgain.measurement.start, -1);
  assert.equal(integerAgain.measurement.finalPosition, 3);
  assert.equal(await page.locator('[data-sim-control="denominator"]').isHidden(), true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(120);
  const mobileVectorFit = await page.locator('.science-sim-viewport').evaluate((viewport) => {
    const svg = viewport.querySelector('.science-number-line-vector');
    const viewportBounds = viewport.getBoundingClientRect();
    const svgBounds = svg.getBoundingClientRect();
    return { widthDelta: Math.abs(viewportBounds.width - svgBounds.width), heightDelta: Math.abs(viewportBounds.height - svgBounds.height) };
  });
  assert.ok(mobileVectorFit.widthDelta <= 2.1 && mobileVectorFit.heightDelta <= 2.1, `La capa vectorial debe cubrir el área interior del viewport móvil sin escalarse fuera de cuadro: ${JSON.stringify(mobileVectorFit)}`);
  await page.locator('.science-phaser-simulator').screenshot({ path: "/tmp/science-number-line-vector-mobile.png" });
  assert.equal(errors.length, 0, errors.join("\n"));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
