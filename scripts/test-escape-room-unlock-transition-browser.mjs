import assert from "node:assert/strict";
import http from "node:http";
import { chromium } from "playwright";
import { buildEscapeRoomPackage, buildPreviewDocument } from "../public/js/escape-room-package-builder.mjs";

const project = {
  idioma: "en-US",
  modo_presentacion: "salas",
  titulo: "Unlock transition test",
  introduccion: "Recover both code letters.",
  instrucciones: "Complete each room.",
  conclusion: "System restored.",
  clave_final: "ABCD",
  duracion_minutos: 5,
  misiones: [1, 2, 3, 4].map((number) => ({
    id: `room-${number}`,
    titulo: `Room ${number}`,
    historia: `Story ${number}`,
    contexto: `Briefing ${number}`,
    contexto_requerido: false,
    reto: `Challenge ${number}`,
    retroalimentacion_correcta: `Room ${number} secured.`,
    preguntas: [{
      id: `question-${number}`,
      titulo: `Question ${number}`,
      reto: `Write answer ${number}.`,
      tipo_interaccion: "texto",
      subtipo_respuesta: "palabra",
      respuesta_correcta: `answer${number}`,
      respuestas_aceptadas: [`answer${number}`]
    }]
  }))
};

const pkg = buildEscapeRoomPackage(project);
assert.match(pkg.files["assets/game.js"], /roomUnlockTransition/);
assert.match(pkg.files["assets/game.js"], /5000 - elapsed/);
assert.match(pkg.files["assets/game.css"], /\.room-unlock-transition/);

const browser = await chromium.launch({ headless: true });
try {
  const previewPage = await browser.newPage();
  await previewPage.setContent(buildPreviewDocument(project, { editorialReview: true }), { waitUntil: "load" });
  const editorialButton = previewPage.locator("[data-editorial-autofill]");
  await editorialButton.click();
  await editorialButton.click();
  await editorialButton.click();
  await previewPage.locator(".room-unlock-transition").waitFor();
  assert.equal(await previewPage.locator(".room-unlock-letter").textContent(), "A");
  assert.equal(await editorialButton.getAttribute("aria-label"), "Skip wait and continue");
  await editorialButton.click();
  const skippedState = JSON.parse(await previewPage.evaluate(() => window.render_game_to_text()));
  assert.equal(skippedState.roomUnlock, undefined);
  assert.equal(skippedState.currentActivity.id, "room-2");
  await previewPage.close();

  const files = {
    "/": pkg.files["index.html"],
    "/index.html": pkg.files["index.html"],
    "/assets/game.js": pkg.files["assets/game.js"],
    "/assets/game.css": pkg.files["assets/game.css"]
  };
  const server = http.createServer((request, response) => {
    const path = new URL(request.url || "/", "http://127.0.0.1").pathname;
    const body = files[path];
    if (body == null) return response.writeHead(204).end();
    const type = path.endsWith(".js") ? "text/javascript" : path.endsWith(".css") ? "text/css" : "text/html";
    response.writeHead(200, { "content-type": `${type}; charset=utf-8` });
    response.end(body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: "domcontentloaded" });
    await page.locator("[data-game-start]").click();
    await page.locator('[data-question-answer="room-1::question-1"]').fill("answer1");
    await page.locator('[data-question-verify="room-1::question-1"]').click();
    await page.locator(".room-unlock-transition").waitFor();
    assert.equal(await page.locator(".room-unlock-letter").textContent(), "A");
    assert.equal(await page.locator("[data-room-unlock-continue]").getAttribute("aria-label"), "Skip wait and continue");
    await page.waitForTimeout(5200);
    const advancedState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    assert.equal(advancedState.roomUnlock, undefined);
    assert.equal(advancedState.currentActivity.id, "room-2");

    for (const [roomNumber, expectedLetter] of [[2, "B"], [3, "C"], [4, "D"]]) {
      await page.locator(`[data-question-answer="room-${roomNumber}::question-${roomNumber}"]`).fill(`answer${roomNumber}`);
      await page.locator(`[data-question-verify="room-${roomNumber}::question-${roomNumber}"]`).click();
      assert.equal(await page.locator(".room-unlock-letter").textContent(), expectedLetter);
      await page.locator("[data-room-unlock-continue]").click();
    }
    await page.locator("#finalPasscodeTiles .final-passcode-tile").first().waitFor();
    assert.equal(await page.locator("#finalPasscodeTiles .final-passcode-tile").count(), 4);
    await page.close();
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
} finally {
  await browser.close();
}

console.log("Escape room unlock transition browser OK.");
