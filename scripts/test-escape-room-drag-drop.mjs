import assert from "node:assert/strict";
import http from "node:http";

import { chromium } from "playwright";

import { normalizeEscapeRoomProject } from "../public/js/escape-room-creator-model.mjs";
import { buildEscapeRoomPackage, buildPreviewDocument } from "../public/js/escape-room-package-builder.mjs";

const project = {
  modo_presentacion: "menu_secciones",
  titulo: "Encaja las pistas",
  introduccion: "Prueba la nueva mecánica.",
  instrucciones: "Inicia y encaja cada ficha con su destino.",
  conclusion: "La clave final es DND.",
  duracion_minutos: 5,
  misiones: [{
    id: "actividad-drag",
    titulo: "Laboratorio de parejas",
    preguntas: [{
      id: "pregunta-drag",
      titulo: "Conceptos y definiciones",
      reto: "Encaja cada concepto con su definición.",
      tipo_interaccion: "drag_drop",
      parejas: [
        { izquierda: "Fotosíntesis", derecha: "Convierte luz en energía" },
        { izquierda: "Gravedad", derecha: "Atrae los cuerpos" },
        { izquierda: "Evaporación", derecha: "Pasa de líquido a gas" }
      ],
      pista: "Relaciona cada proceso con su efecto.",
      retroalimentacion_correcta: "¡Laboratorio resuelto!",
      retroalimentacion_incorrecta: "Revisa las fichas que regresaron."
    }]
  }]
};

const normalized = normalizeEscapeRoomProject(project);
const question = normalized.misiones[0].preguntas[0];
assert.equal(question.tipo_interaccion, "drag_drop", "El modelo debe conservar el tipo drag_drop.");
assert.equal(question.parejas.length, 3, "El modelo debe conservar las parejas de drag & drop.");

const pkg = buildEscapeRoomPackage(project);
const manifest = JSON.parse(pkg.files["assets/escape-room.json"]);
assert.equal(manifest.misiones[0].preguntas[0].tipo_interaccion, "drag_drop", "El ZIP debe conservar drag_drop en el manifiesto.");
assert.match(pkg.files["assets/game.js"], /function renderMissionDragDropBlock\(/, "El ZIP debe incluir el renderer de drag & drop.");
assert.match(pkg.files["assets/game.js"], /setPointerCapture/, "El ZIP debe usar Pointer Events con captura.");
assert.match(pkg.files["assets/game.css"], /\.drag-match-targets/, "El ZIP debe incluir estilos responsive del tablero.");

const html = buildPreviewDocument(project, { editorialReview: true });
const server = http.createServer((_request, response) => {
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.end(html);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));

try {
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await page.locator("[data-game-start]").click();
  await page.locator("[data-menu-mission='actividad-drag']").click();

  assert.equal(await page.locator("[data-drag-tile]").count(), 3, "La bandeja debe mostrar tres fichas.");
  assert.equal(await page.locator("[data-drag-target]").count(), 3, "Debe mostrar tres destinos.");
  assert.equal(
    await page.locator(".drag-match-targets").evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").length),
    1,
    "Los destinos deben apilarse en móvil."
  );

  await page.locator('[data-drag-tile-index="0"]').click();
  await page.locator('[data-drag-target-index="1"]').click();
  await page.locator('[data-drag-tile-index="1"]').click();
  await page.locator('[data-drag-target-index="0"]').click();
  const tileBox = await page.locator('[data-drag-tile-index="2"]').boundingBox();
  const targetBox = await page.locator('[data-drag-target-index="2"]').boundingBox();
  assert.ok(tileBox && targetBox, "La ficha y el destino deben tener geometría interactiva.");
  await page.mouse.move(tileBox.x + tileBox.width / 2, tileBox.y + tileBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 8 });
  await page.mouse.up();
  const placedState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(Number(placedState.currentActivity.questions[0].dragAssignments["2"]), 2, "El arrastre real debe colocar la ficha en el destino.");
  await page.locator("[data-question-verify]").click();
  await page.waitForFunction(() => document.querySelector('[data-drag-target-index="2"]')?.disabled === true);

  assert.equal(await page.locator('[data-drag-target-index="2"]').isDisabled(), true, "Una pareja correcta debe quedar bloqueada.");
  assert.equal(await page.locator("[data-drag-tile]").count(), 2, "Las fichas incorrectas deben volver a la bandeja.");
  if (process.env.PIGPEN_DRAG_DROP_SCREENSHOT) {
    await page.screenshot({ path: process.env.PIGPEN_DRAG_DROP_SCREENSHOT, fullPage: true });
  }
  const savedBeforeReload = await page.evaluate(() => Object.entries(localStorage).find(([key]) => key.includes(".v3.menu_secciones."))?.[1] || "");
  assert.match(savedBeforeReload, /"questionDragLocked":\{"actividad-drag::pregunta-drag":\{"2":true\}\}/, "La pareja correcta debe guardarse antes de recargar.");

  await page.reload({ waitUntil: "domcontentloaded" });
  const restoredDragState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(restoredDragState.currentActivity.questions[0].dragLocked["2"], true, "El estado textual debe restaurar la pareja bloqueada.");
  const restoredTargetMarkup = await page.locator('[data-drag-target-index="2"]').evaluate((node) => node.outerHTML);
  assert.match(restoredTargetMarkup, /disabled/, "La pareja bloqueada debe persistir tras recargar.");

  await page.locator('[data-drag-tile-index="0"]').focus();
  await page.keyboard.press("Enter");
  await page.locator('[data-drag-target-index="0"]').focus();
  await page.keyboard.press("Enter");
  await page.locator('[data-drag-tile-index="1"]').focus();
  await page.keyboard.press("Enter");
  await page.locator('[data-drag-target-index="1"]').focus();
  await page.keyboard.press("Enter");
  await page.locator("[data-question-verify]").click();

  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(state.progress.completed, 1, "Completar las parejas debe completar la actividad.");
  assert.equal(state.currentActivity.questions[0].completed, true, "La salida textual debe exponer la pregunta completada.");
  const stored = await page.evaluate(() => Object.entries(localStorage).find(([key]) => key.includes(".v3.menu_secciones."))?.[1] || "");
  assert.match(stored, /questionDragMatches/, "El progreso persistido debe incluir las asignaciones drag & drop.");
  assert.deepEqual(pageErrors, [], "El runtime no debe producir errores de página.");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

console.log("escape room drag & drop OK.");
