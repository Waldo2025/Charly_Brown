import assert from "node:assert/strict";
import { buildEscapeRoomPackage, buildGameHtml } from "../public/js/escape-room-package-builder.mjs";
import { getGameMessages } from "../public/js/escape-room-game-i18n.mjs";

function project(locale, mode) {
  return {
    idioma: locale,
    modo_presentacion: mode,
    titulo: "Prueba",
    subtitulo: "Subtítulo",
    introduccion: "Introducción",
    instrucciones: "Instrucciones",
    conclusion: "Final",
    clave_final: "CLAVE",
    misiones: [{
      id: "mission-1",
      titulo: "Sala 1",
      historia: "Historia",
      contexto: "Contexto suficiente",
      reto: "Reto",
      preguntas: [{ id: "question-1", titulo: "Pregunta", reto: "Responde", tipo_interaccion: "texto", subtipo_respuesta: "palabra", respuesta_correcta: "sol", respuestas_aceptadas: ["sol"], retroalimentacion_correcta: "Correcto", retroalimentacion_incorrecta: "Incorrecto" }]
    }]
  };
}

function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}

for (const locale of ["es-419", "es-ES", "en-US", "en-GB", "fr-FR", "pt-BR"]) {
  const messages = getGameMessages(locale);
  assert.ok(messages.finalCodePuzzleInstruction, `${locale} debe traducir la instrucción final.`);
  for (const mode of ["salas", "menu_secciones"]) {
    const html = buildGameHtml(project(locale, mode));
    assert.match(html, /id="finalPasscodeTiles"/);
    assert.ok(html.includes(escapeHtml(messages.finalCodePuzzleInstruction)));
    assert.doesNotMatch(html, /btnMoveFinalPasscode|final-passcode-controls/);
    assert.doesNotMatch(messages.finalCodePuzzleInstruction, /botones de movimiento|move buttons|boutons de déplacement|botões de movimento/i);
    assert.doesNotMatch(html, /final-code-reveal|masterPasscodeInput/);
    assert.doesNotMatch(html, />\s*Clave final:\s*CLAVE\s*</i);
  }
}

const pkg = buildEscapeRoomPackage(project("es-419", "salas"));
assert.match(pkg.files["assets/game.js"], /ESCAPE_ROOM_PROGRESS_VERSION = 5/);
assert.match(pkg.files["assets/game.js"], /buildInitialFinalPasscodeOrder/);
assert.match(pkg.files["assets/game.js"], /wireFinalPasscodePuzzle/);
assert.match(pkg.files["assets/game.js"], /finishFinalPasscodeDrag/);
assert.match(pkg.files["assets/game.js"], /pointerdown/);
assert.match(pkg.files["assets/game.css"], /\.final-passcode-tile/);
assert.match(pkg.files["assets/game.css"], /\.final-passcode-tile\.is-drop-target/);
assert.match(pkg.files["index.html"], /id="finalPasscodeTiles"/);
assert.doesNotMatch(pkg.files["index.html"], /btnMoveFinalPasscode|Move left|Move right/);
assert.doesNotMatch(pkg.files["index.html"], /final-code-reveal|masterPasscodeInput/);

console.log("PigPen final passcode puzzle OK.");
