import assert from "node:assert/strict";
import { chromium } from "playwright";
import { buildPreviewDocument } from "../public/js/escape-room-package-builder.mjs";

const project = {
  idioma: "es-419",
  modo_presentacion: "salas",
  titulo: "Prueba final",
  introduccion: "Introducción",
  instrucciones: "Instrucciones",
  conclusion: "Final",
  clave_final: "CLAVE",
  misiones: [{
    id: "mission-1",
    titulo: "Sala 1",
    historia: "Historia",
    contexto: "Contexto",
    contexto_requerido: false,
    reto: "Reto",
    bloqueada_inicial: false,
    preguntas: [{
      id: "question-1",
      titulo: "Pregunta",
      reto: "Escribe sol",
      tipo_interaccion: "texto",
      subtipo_respuesta: "palabra",
      respuesta_correcta: "sol",
      respuestas_aceptadas: ["sol"],
      retroalimentacion_correcta: "Correcto",
      retroalimentacion_incorrecta: "Incorrecto"
    }]
  }]
};

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 800 } });
  await page.setContent(buildPreviewDocument(project, { editorialReview: true }), { waitUntil: "load" });
  const editorial = page.locator("[data-editorial-autofill]");
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (await page.locator("#finalPasscodeTiles .final-passcode-tile").count()) break;
    await editorial.click();
    const current = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    if (current.roomUnlock?.phase === "feedback") await page.locator("[data-room-unlock-continue]").waitFor();
    await page.waitForTimeout(30);
  }
  const tiles = page.locator("#finalPasscodeTiles .final-passcode-tile");
  assert.equal(await tiles.count(), 5);
  const initialOrder = (await tiles.allTextContents()).join("");
  assert.notEqual(initialOrder, "CLAVE", "La clave no debe comenzar ordenada.");
  assert.equal(await tiles.first().evaluate((tile) => getComputedStyle(tile).minHeight), "48px");
  assert.equal(await page.locator("#btnMoveFinalPasscodeLeft, #btnMoveFinalPasscodeRight").count(), 0);

  const sourceBox = await tiles.first().boundingBox();
  const targetBox = await tiles.last().boundingBox();
  assert.ok(sourceBox && targetBox);
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width * .8, targetBox.y + targetBox.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(50);
  assert.notEqual((await tiles.allTextContents()).join(""), initialOrder, "Arrastrar una ficha debe cambiar el orden.");

  const keyboardOrder = (await tiles.allTextContents()).join("");
  await tiles.first().focus();
  await page.keyboard.press("ArrowRight");
  assert.notEqual((await tiles.allTextContents()).join(""), keyboardOrder, "Las flechas del teclado deben conservarse como alternativa accesible.");

  for (let attempt = 0; attempt < 2 && (await tiles.allTextContents()).join("") !== "CLAVE"; attempt += 1) {
    await editorial.click();
  }
  assert.equal((await tiles.allTextContents()).join(""), "CLAVE");
  await editorial.click();
  await page.waitForTimeout(2200);
  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(state.masterSolved, true);
  assert.equal(state.finished, true);
  assert.equal(await page.locator("#victoryContainer").isVisible(), true);
} finally {
  await browser.close();
}

console.log("PigPen final passcode browser OK.");
