import assert from "node:assert/strict";
import http from "node:http";
import { chromium } from "playwright";
import {
  buildEscapeRoomPackage,
  buildPreviewDocument
} from "../public/js/escape-room-package-builder.mjs";

const project = {
  idioma: "en-US",
  modo_presentacion: "salas",
  titulo: "Briefing start regression",
  introduccion: "Inspect the first room before starting the clock.",
  instrucciones: "Read the briefing and begin.",
  conclusion: "System stopped.",
  clave_final: "STOP7",
  duracion_minutos: 5,
  misiones: [{
    id: "room-1",
    titulo: "Room one",
    historia: "The investigation starts here.",
    contexto: "The NOVA protocol uses the keyword Earth.",
    datos_clave: ["Earth is the protocol keyword."],
    bloqueada_inicial: false,
    preguntas: [{
      id: "question-1",
      titulo: "Protocol keyword",
      reto: "What is the protocol keyword?",
      tipo_interaccion: "texto",
      subtipo_respuesta: "palabra",
      respuesta_correcta: "Earth",
      respuestas_aceptadas: ["Earth"],
      pista: "Find the named keyword in the briefing."
    }]
  }]
};

const escapePackage = buildEscapeRoomPackage(project);
const cases = [
  {
    name: "preview",
    files: { "/": buildPreviewDocument(project, { editorialReview: true }) }
  },
  {
    name: "export",
    files: {
      "/": escapePackage.files["index.html"],
      "/index.html": escapePackage.files["index.html"],
      "/assets/game.js": escapePackage.files["assets/game.js"],
      "/assets/game.css": escapePackage.files["assets/game.css"]
    }
  }
];

const browser = await chromium.launch({ headless: true });

try {
  for (const testCase of cases) {
    const server = http.createServer((request, response) => {
      const path = new URL(request.url || "/", "http://127.0.0.1").pathname;
      const body = testCase.files[path];
      if (body == null) {
        response.writeHead(204).end();
        return;
      }
      const contentType = path.endsWith(".js")
        ? "text/javascript; charset=utf-8"
        : path.endsWith(".css")
          ? "text/css; charset=utf-8"
          : "text/html; charset=utf-8";
      response.writeHead(200, { "content-type": contentType });
      response.end(body);
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    try {
      await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: "domcontentloaded" });
      await page.locator("[data-gallery-next]").click();

      let runtimeState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
      assert.equal(runtimeState.started, false, `${testCase.name}: consultar la sala no debe iniciar todavía el reloj.`);
      assert.equal(await page.locator("[data-question-card]").count(), 0, `${testCase.name}: las actividades deben esperar la lectura.`);

      await page.locator("[data-briefing-ack='room-1']").click();
      runtimeState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));

      assert.equal(runtimeState.started, true, `${testCase.name}: confirmar el expediente debe iniciar la partida.`);
      assert.equal(runtimeState.currentActivity.briefingRead, true, `${testCase.name}: la lectura debe quedar registrada.`);
      assert.equal(await page.locator("[data-question-card]").count(), 1, `${testCase.name}: la actividad debe mostrarse inmediatamente.`);
      assert.deepEqual(errors, [], `${testCase.name}: no debe producir errores de consola.`);
    } finally {
      await page.close();
      await new Promise((resolve) => server.close(resolve));
    }
  }

  console.log("Escape room briefing start preview/export OK.");
} finally {
  await browser.close();
}
