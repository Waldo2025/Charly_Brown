import assert from "node:assert/strict";
import { chromium } from "playwright";
import { buildPreviewDocument } from "../public/js/escape-room-package-builder.mjs";

const project = {
  idioma: "es-419",
  modo_presentacion: "salas",
  titulo: "Navegación editorial",
  introduccion: "Prueba de selección directa.",
  instrucciones: "Revisa las preguntas.",
  conclusion: "Fin.",
  clave_final: "CLAVE",
  misiones: [
    {
      id: "room-1",
      titulo: "Sala uno",
      historia: "Historia uno",
      contexto: "Expediente uno",
      contexto_requerido: true,
      reto: "Reto uno",
      bloqueada_inicial: false,
      preguntas: [{
        id: "question-1",
        titulo: "Pregunta inicial",
        reto: "Primera pregunta",
        tipo_interaccion: "texto",
        subtipo_respuesta: "palabra",
        respuesta_correcta: "uno"
      }]
    },
    {
      id: "room-2",
      titulo: "Sala dos",
      historia: "Historia dos",
      contexto: "Expediente dos",
      contexto_requerido: true,
      reto: "Reto dos",
      bloqueada_inicial: true,
      preguntas: [
        {
          id: "question-2a",
          titulo: "Pregunta intermedia",
          reto: "Segunda pregunta",
          tipo_interaccion: "texto",
          subtipo_respuesta: "palabra",
          respuesta_correcta: "dos"
        },
        {
          id: "question-2b",
          titulo: "Pregunta seleccionada",
          reto: "Esta es la pregunta que debe verse.",
          tipo_interaccion: "texto",
          subtipo_respuesta: "palabra",
          respuesta_correcta: "tres"
        }
      ]
    }
  ]
};

const preview = buildPreviewDocument(project, { editorialReview: true });
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 900, height: 540 } });
  await page.setContent('<iframe id="preview" sandbox="allow-scripts allow-forms" style="width:100%;height:500px"></iframe>');
  await page.evaluate((documentHtml) => {
    document.getElementById("preview").srcdoc = documentHtml;
  }, preview);

  const frame = page.frameLocator("#preview");
  await frame.locator("[data-gallery-screen='intro'].is-active").waitFor();
  await page.evaluate(() => {
    document.getElementById("preview").contentWindow.postMessage({
      type: "pigpen-preview-navigate",
      missionId: "room-2",
      questionId: "question-2b"
    }, "*");
  });

  const selectedCard = frame.locator('[data-question-key="room-2::question-2b"]');
  await selectedCard.waitFor({ state: "visible" });
  assert.equal(await frame.locator("[data-gallery-screen='mission']").getAttribute("class"), "gallery-screen is-active");
  assert.equal(await frame.locator(".mission-title").innerText(), "Sala dos");
  assert.equal(await selectedCard.locator(".question-title").innerText(), "Pregunta seleccionada");
  assert.equal(await selectedCard.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < node.ownerDocument.documentElement.clientHeight;
  }), true, "La tarjeta seleccionada debe quedar dentro del viewport del preview.");
  assert.equal(JSON.parse(await frame.locator("body").evaluate(() => window.render_game_to_text())).started, false);
} finally {
  await browser.close();
}

console.log("PigPen preview question navigation browser OK.");
