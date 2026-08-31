import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const hudCss = await readFile(new URL("../public/science-hud-themes.css", import.meta.url), "utf8");
const source = await readFile(new URL("../public/js/scienceActivities.js", import.meta.url), "utf8");
const exportLayoutCss = source.match(/const EXPORTED_LAYOUT_CSS = `([\s\S]*?)`;\n\nfunction buildExportStartGate/)?.[1] || "";
const responsiveIntroductionRuntime = source.match(/function installResponsiveIntroductionLayout\(frame, layer\) \{[\s\S]*?\n\}\n\nfunction difficultyExampleMarkup/)?.[0]
  .replace(/\n\nfunction difficultyExampleMarkup[\s\S]*$/, "") || "";
const portraitSvg = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="1000"><rect width="600" height="1000" fill="#62d8cf"/><circle cx="300" cy="170" r="110" fill="#ffd166"/><rect x="120" y="330" width="360" height="560" rx="70" fill="#24314f"/></svg>');

test("mobile preview keeps the complete level illustration and restores vertical scrolling", () => {
  assert.match(hudCss, /Mobile briefing: preserve the complete generated illustration/);
  assert.match(hudCss, /\.sa-assessment-layer\.sa-briefing-layer\s*\{[\s\S]*?overflow-y:auto\s*!important/);
  assert.match(hudCss, /\.science-micro-visual[\s\S]*?height:clamp\(300px,125cqi,680px\)\s*!important/);
  assert.match(hudCss, /:is\(\.sa-level-hero,\.science-level-hero\)[\s\S]*?object-fit:contain\s*!important/);
});

test("narrow introduction keeps its generated briefing and cards in normal flow", () => {
  assert.match(hudCss, /Introduction flow: generated objectives/);
  assert.match(hudCss, /@container science-question-header \(max-width:820px\)/);
  assert.match(hudCss, /science-rive-briefing-screen\.science-micro-mission[\s\S]*?display:flex!important;[\s\S]*?flex-direction:column!important/);
  assert.match(hudCss, /science-experience-carousel-track[\s\S]*?height:auto!important;[\s\S]*?min-height:0!important/);
  assert.match(hudCss, /science-rive-briefing-screen \.science-micro-concepts[\s\S]*?grid-template-columns:minmax\(0,1fr\)!important/);
  assert.match(responsiveIntroductionRuntime, /ResizeObserver/);
  assert.match(source, /installResponsiveIntroductionLayout\(frame, layer\);/);
});

test("ZIP export ships the same mobile image and document-scroll fix", () => {
  assert.match(source, /body\[data-science-export\][\s\S]*?overflow-y:auto!important[\s\S]*?touch-action:pan-y!important/);
  assert.match(source, /height:min\(72svh,133vw\)!important/);
  assert.match(source, /object-fit:contain!important/);
  assert.match(source, /padding-bottom:max\(28px,env\(safe-area-inset-bottom\)\)!important/);
  assert.match(source, /science-hud-themes\.css\?v=20260815-mobile-header-v17/g);
});

test("mobile portrait places progress above the challenge heading and removes example bold", async () => {
  assert.match(hudCss, /\.science-micro-example :is\(strong,\.science-micro-example-guidance\)[\s\S]*?font-weight:400\s*!important/);
  assert.match(hudCss, /@container sa-briefing-frame \(max-width:820px\)/);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${hudCss}</style><section class="sa-game-frame" data-visual-style="rive-tokyo-tech"><article class="science-structured-game is-rive-numeric-console"><header class="science-structured-question-header"><div class="science-rive-challenge-heading"><div><small>Reto STEM</small><h2>Calcula el resultado</h2></div></div><div class="science-rive-challenge-progress"><i></i><i></i><i></i></div></header></article><div class="science-micro-example"><span><small>Ejemplo</small><strong>Texto principal sin negrita</strong><p class="science-micro-example-guidance">Guía del ejemplo sin negrita</p></span></div></section>`);
  const layout = await page.evaluate(() => {
    const header = document.querySelector(".science-structured-question-header");
    const progress = document.querySelector(".science-rive-challenge-progress").getBoundingClientRect();
    const heading = document.querySelector(".science-rive-challenge-heading").getBoundingClientRect();
    return {
      columns: getComputedStyle(header).gridTemplateColumns.split(" ").length,
      progressAboveHeading: progress.top < heading.top,
      exampleWeight: getComputedStyle(document.querySelector(".science-micro-example strong")).fontWeight,
      guidanceWeight: getComputedStyle(document.querySelector(".science-micro-example-guidance")).fontWeight
    };
  });
  assert.equal(layout.columns, 1);
  assert.equal(layout.progressAboveHeading, true);
  assert.equal(layout.exampleWeight, "400");
  assert.equal(layout.guidanceWeight, "400");
  await browser.close();
});

test("long objective does not overlap the introduction content in a narrow preview", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 680, height: 820 } });
  const objective = "En un simulador de gestión de una feria escolar, el estudiante coordina el puesto de repostería y la logística de entregas en dron del grupo. Para evitar pérdidas monetarias y desvíos de trayectos, identifica la adición y sustracción en números positivos y negativos, analiza el fondo de caja y toma decisiones con la evidencia recabada. ".repeat(2);
  const briefing = `<article class="science-rive-briefing-screen science-micro-mission"><div class="science-micro-visual"><img class="science-level-hero" src="${portraitSvg}" alt="Escena completa"></div><div class="science-micro-content"><section class="science-experience-briefing"><div class="science-experience-carousel-track"><article><small>Objetivo del juego</small><p>${objective}</p></article></div><div class="science-experience-carousel-controls"><button>‹</button><span>1 de 2</span><button>›</button></div></section><h2>Calcular el saldo final combinando ingresos y egresos.</h2><div class="science-micro-concepts"><div class="science-micro-concept"><span>01</span><p><strong>Suma algebraica</strong>Combinación de números positivos y negativos.</p></div><div class="science-micro-concept"><span>02</span><p><strong>Valor absoluto</strong>Distancia desde cero.</p></div></div><div class="science-micro-example">Ejemplo aplicado</div></div></article>`;

  const conflictingLayout = `.science-micro-mission{display:grid!important;grid-template-columns:1fr!important;grid-template-rows:1fr!important}.science-micro-visual,.science-micro-content{grid-column:1!important;grid-row:1!important;width:100%!important;height:620px!important}`;
  await page.setContent(`<style>${hudCss}</style><style>${conflictingLayout}</style><section class="sa-game-frame" data-visual-style="rive-tokyo-tech" style="position:relative;width:100%;height:720px;container-name:sa-briefing-frame;container-type:inline-size;overflow:hidden"><div class="sa-assessment-layer sa-briefing-layer" style="position:absolute;inset:0">${briefing}</div></section>`);
  await page.addScriptTag({ content: `${responsiveIntroductionRuntime}\nwindow.__installResponsiveIntroductionLayout = installResponsiveIntroductionLayout;` });
  await page.evaluate(() => window.__installResponsiveIntroductionLayout(document.querySelector(".sa-game-frame"), document.querySelector(".sa-briefing-layer")));
  await page.waitForTimeout(50);
  const layout = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
    const visual = rect(".science-micro-visual");
    const briefingBox = rect(".science-experience-briefing");
    const title = rect(".science-micro-content > h2");
    const concepts = rect(".science-micro-concepts");
    return {
      visualBottom: visual.bottom,
      briefingTop: briefingBox.top,
      briefingBottom: briefingBox.bottom,
      titleTop: title.top,
      titleBottom: title.bottom,
      conceptsTop: concepts.top,
      conceptColumns: getComputedStyle(document.querySelector(".science-micro-concepts")).gridTemplateColumns.split(" ").length,
      scrollable: document.querySelector(".sa-briefing-layer").scrollHeight > document.querySelector(".sa-briefing-layer").clientHeight
    };
  });
  assert.ok(layout.briefingTop >= layout.visualBottom - 1);
  assert.ok(layout.titleTop >= layout.briefingBottom - 1);
  assert.ok(layout.conceptsTop >= layout.titleBottom - 1);
  assert.equal(layout.conceptColumns, 1);
  assert.equal(layout.scrollable, true);
  await browser.close();
});

test("mobile browser can see the full portrait hero and scroll preview/export", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const briefing = `<article class="science-rive-briefing-screen science-micro-mission"><div class="science-micro-visual"><img class="science-level-hero" src="${portraitSvg}" alt="Escena completa"><div class="science-micro-level"><span>Etapa 1</span><strong>Encuadre móvil</strong></div></div><div class="science-micro-content"><h2>Misión</h2><div style="height:900px">Contenido desplazable</div></div></article>`;

  await page.setContent(`<style>${hudCss}</style><section class="sa-game-frame" data-visual-style="rive-tokyo-tech" style="position:relative;width:390px;height:620px;container-type:inline-size;overflow:hidden"><div class="sa-assessment-layer sa-briefing-layer" style="position:absolute;inset:0">${briefing}</div></section>`);
  const preview = await page.evaluate(() => {
    const layer = document.querySelector(".sa-briefing-layer");
    const visual = document.querySelector(".science-micro-visual");
    const image = document.querySelector(".science-level-hero");
    layer.scrollTop = 160;
    return { overflowY: getComputedStyle(layer).overflowY, scrollTop: layer.scrollTop, visualHeight: visual.getBoundingClientRect().height, objectFit: getComputedStyle(image).objectFit };
  });
  assert.equal(preview.objectFit, "contain");
  assert.equal(preview.overflowY, "auto");
  assert.ok(preview.visualHeight >= 300);
  assert.ok(preview.scrollTop > 0);

  await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${hudCss}\n${exportLayoutCss}</style></head><body data-science-export data-export-started="true"><main class="game-shell"><section class="game-frame"><div id="scienceGameMount" class="science-assessment-host" data-visual-style="rive-tokyo-tech">${briefing}</div></section></main></body></html>`);
  const exported = await page.evaluate(() => {
    const image = document.querySelector(".science-level-hero");
    window.scrollTo(0, 180);
    return { objectFit: getComputedStyle(image).objectFit, scrollY: window.scrollY, scrollHeight: document.documentElement.scrollHeight, viewport: innerHeight };
  });
  assert.equal(exported.objectFit, "contain");
  assert.ok(exported.scrollHeight > exported.viewport);
  assert.ok(exported.scrollY > 0);
  await browser.close();
});
