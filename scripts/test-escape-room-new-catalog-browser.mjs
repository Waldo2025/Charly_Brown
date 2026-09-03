import assert from "node:assert/strict";
import http from "node:http";
import { chromium } from "playwright";
import { buildPreviewDocument } from "../public/js/escape-room-package-builder.mjs";

const project = {
  idioma: "en-US",
  modo_presentacion: "menu_secciones",
  titulo: "New catalog browser",
  introduccion: "Complete the activity.",
  instrucciones: "Use every control.",
  conclusion: "The mission is complete.",
  clave_final: "HALT77",
  duracion_minutos: 5,
  misiones: [{
    id: "catalog-room",
    titulo: "Catalog room",
    contexto: "The NOVA protocol organizes an Earth systems investigation. Alpha begins the sequence, Beta connects the observations, and Gamma closes the analysis. The protocol is inactive when the safety statement is false. Earth is the keyword used for the family metaphor activity.",
    datos_clave: ["Alpha comes first.", "Gamma closes the sequence.", "Earth is the keyword."],
    preguntas: [
      { id: "boolean", titulo: "Boolean", reto: "Choose false.", pista: "Añade una pista útil, pero no obvia.", tipo_interaccion: "verdadero_falso", respuesta_correcta: false },
      { id: "sequence", titulo: "Sequence", reto: "Order the phases.", tipo_interaccion: "ordenar_secuencia", elementos: ["Alpha", "Beta", "Gamma"] },
      { id: "blank", titulo: "Blank", reto: "Complete the protocol.", tipo_interaccion: "completar_espacio", texto_con_hueco: "Protocol ___ is active.", respuesta_correcta: "NOVA", respuestas_aceptadas: ["NOVA"] },
      { id: "word", titulo: "Earth family", reto: "Reconnect the Earth family metaphors by linking images and natural elements with their appropriate kinship titles. Responde con una sola palabra.", tipo_interaccion: "texto", subtipo_respuesta: "palabra", respuesta_correcta: "Earth" }
    ]
  }]
};

const document = buildPreviewDocument(project, { editorialReview: true });
const server = http.createServer((request, response) => {
  if (new URL(request.url || "/", "http://127.0.0.1").pathname === "/logo.png") {
    response.writeHead(204).end();
    return;
  }
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.end(document);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const consoleErrors = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  assert.equal(await page.locator(".final-code-reveal").isVisible(), false, "La clave no debe verse antes de completar la actividad.");
  await page.locator("[data-game-start]").click();
  await page.locator("[data-menu-mission='catalog-room']").click();

  assert.equal(await page.locator("[data-briefing-board='catalog-room']").count(), 1, "El tablero debe aparecer antes de las preguntas.");
  assert.match(await page.locator("[data-briefing-board='catalog-room']").innerText(), /Investigation board/);
  assert.equal(await page.locator("[data-question-card]").count(), 0, "Las preguntas deben esperar a que se lea el expediente.");
  if (process.env.PIGPEN_BRIEFING_SCREENSHOT) {
    await page.screenshot({ path: process.env.PIGPEN_BRIEFING_SCREENSHOT, fullPage: true });
  }
  await page.locator("[data-briefing-ack='catalog-room']").click();
  assert.equal(await page.locator("[data-question-card]").count(), 4, "Las preguntas deben aparecer después de confirmar la lectura.");

  assert.equal(await page.locator("[data-question-boolean]").count(), 2, "Verdadero/Falso debe renderizar dos controles semánticos.");
  const booleanCard = page.locator("[data-question-key='catalog-room::boolean']");
  await booleanCard.locator("[data-question-hint]").click();
  assert.match(await booleanCard.locator("[data-question-hint-box]").innerText(), /^Check the subject and action/);
  assert.doesNotMatch(await booleanCard.locator("[data-question-hint-box]").innerText(), /pista|añade|read the prompt carefully/i);
  assert.equal(await page.locator("[data-sequence-item]").count(), 3, "La secuencia debe renderizar sus tres elementos.");
  assert.ok(await page.locator("[data-sequence-move]").first().evaluate((button) => button.getBoundingClientRect().height >= 44), "Los controles de secuencia deben medir al menos 44 px.");
  assert.equal(await page.locator(".fill-blank-input").count(), 1, "Completar espacio debe renderizar la entrada dentro de la frase.");
  const wordPrompt = await page.locator("[data-question-key='catalog-room::word'] .question-story").innerText();
  assert.match(wordPrompt, /Answer with one word\.$/);
  assert.doesNotMatch(wordPrompt, /Responde con una sola palabra/i);

  await page.locator('[data-sequence-move][data-sequence-position="0"][data-sequence-delta="1"]').click();
  const movedOrder = JSON.parse(await page.evaluate(() => window.render_game_to_text())).currentActivity.questions.find((question) => question.id === "sequence").sequenceOrder;
  await page.reload({ waitUntil: "domcontentloaded" });
  const restoredOrder = JSON.parse(await page.evaluate(() => window.render_game_to_text())).currentActivity.questions.find((question) => question.id === "sequence").sequenceOrder;
  assert.deepEqual(restoredOrder, movedOrder, "El orden parcial debe persistir al recargar.");
  assert.equal(await page.locator("[data-briefing-ack='catalog-room']").count(), 0, "La lectura del expediente debe persistir al recargar.");
  assert.equal(await page.locator(".briefing-review").count(), 1, "El expediente debe quedar disponible para volver a consultarlo.");

  await page.locator("[data-editorial-autofill]").click();
  await page.locator("[data-editorial-autofill]").click();
  let state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(state.progress.completed, 1, "El autofill y la verificación deben completar los tres tipos nuevos.");

  await page.locator("[data-menu-next]").click();
  assert.equal(await page.locator(".final-code-reveal").isVisible(), true, "La clave debe mostrarse en el panel final.");
  assert.match(await page.locator(".final-code-reveal").innerText(), /HALT77/);
  await page.locator("#masterPasscodeInput").fill("HALT77");
  await page.locator("#btnVerifyMasterPasscode").click();
  await page.waitForTimeout(2100);
  state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(state.finished, true, "La clave correcta debe finalizar la partida.");
  assert.equal(state.masterSolved, true, "La clave correcta debe desactivar el sistema.");
  assert.deepEqual(consoleErrors, [], `No debe haber errores de consola: ${consoleErrors.join(" | ")}`);
  console.log("Escape room new catalog browser OK.");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
