import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const hudCss = await readFile(new URL("../public/science-hud-themes.css", import.meta.url), "utf8");
const activityCss = await readFile(new URL("../public/scienceActivities.css", import.meta.url), "utf8");
const source = await readFile(new URL("../public/js/scienceActivities.js", import.meta.url), "utf8");
const runtimeSource = await readFile(new URL("../public/js/science-game-runtime.mjs", import.meta.url), "utf8");
const exportLayoutCss = source.match(/const EXPORTED_LAYOUT_CSS = `([\s\S]*?)`;\n\nfunction buildExportStartGate/)?.[1] || "";
const markup = `<section class="science-rive-answer-deck" data-question-type="image-multiple"><header class="science-question-stage-header"><div><small>IMAGEN SEÑALADA</small><strong>Nivel 1 · Pregunta 1</strong></div><span>1/10</span><h2>¿Qué elemento señala la flecha?</h2><p>Observa la representación científica y localiza la punta.</p><p class="science-question-observation-guide"><strong>Cómo analizar:</strong> compara la forma y ubicación.</p><figure class="science-image-question"><div style="height:240px"></div></figure></header></section>`;

async function paragraphVisibility(page) {
  return page.locator(".science-question-stage-header > p").evaluateAll((paragraphs) => paragraphs.map((paragraph) => ({
    display: getComputedStyle(paragraph).display,
    height: paragraph.getBoundingClientRect().height,
    text: paragraph.textContent.trim()
  })));
}

test("preview y ZIP conservan contexto y guía de análisis en móvil", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${hudCss}</style><main class="sa-game-frame" data-visual-style="rive-arcade-matsuri">${markup}</main>`);
  let paragraphs = await paragraphVisibility(page);
  assert.equal(paragraphs.length, 2);
  assert.ok(paragraphs.every(({ display, height }) => display !== "none" && height > 0));
  assert.match(paragraphs[1].text, /Cómo analizar:/);

  await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${hudCss}\n${exportLayoutCss}</style><body data-science-export data-export-started="true"><main id="scienceGameMount" class="science-assessment-host" data-visual-style="rive-arcade-matsuri">${markup}</main></body>`);
  paragraphs = await paragraphVisibility(page);
  assert.ok(paragraphs.every(({ display, height }) => display !== "none" && height > 0));
  await browser.close();
});

test("cada pregunta Rive vuelve al inicio visible antes de mostrarse", () => {
  assert.match(runtimeSource, /const resetQuestionStageScroll = \(\) => \{/);
  assert.match(runtimeSource, /this\.mount\.scrollTop = 0/);
  assert.match(runtimeSource, /panel\.scrollTop = 0/);
  assert.match(runtimeSource, /requestAnimationFrame\(\(\) => \{\s*resetQuestionStageScroll\(\)/);
});

test("una pregunta visual alta conserva el header dentro del origen desplazable", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.setContent(`
    <style>${activityCss}\n${hudCss}</style>
    <main class="sa-page">
      <section class="sa-game-frame" data-visual-style="rive-arcade-matsuri" style="height:520px">
        <div class="sa-game-mount is-rive-game-runtime is-rive-question">
          <section class="science-rive-answer-deck is-rive-only" data-question-type="image-multiple">
            <header class="science-question-stage-header">
              <div><small>IMAGEN SEÑALADA</small><strong>Nivel 1 · Pregunta 1</strong></div><span>1/10</span>
              <h2>¿Qué estructura señala la flecha?</h2>
              <p>Contexto completo de la práctica de laboratorio.</p>
              <p class="science-question-observation-guide">Cómo analizar: compara forma y ubicación.</p>
              <figure class="science-image-question"><div style="height:680px"></div></figure>
            </header>
            <div class="science-rive-answer-list"><button style="height:140px">Respuesta</button></div>
          </section>
        </div>
      </section>
    </main>`);
  const geometry = await page.locator(".science-rive-answer-deck").evaluate((deck) => {
    const header = deck.querySelector(".science-question-stage-header");
    const deckRect = deck.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    return {
      alignContent: getComputedStyle(deck).alignContent,
      scrollTop: deck.scrollTop,
      scrollable: deck.scrollHeight > deck.clientHeight,
      headerStartsInside: headerRect.top >= deckRect.top
    };
  });
  assert.equal(geometry.alignContent, "safe center");
  assert.equal(geometry.scrollTop, 0);
  assert.equal(geometry.scrollable, true);
  assert.equal(geometry.headerStartsInside, true);
  await browser.close();
});
