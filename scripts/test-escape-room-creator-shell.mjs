import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/PigPenCreator.html",
  "utf8"
);

const css = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/PigPenCreator.css",
  "utf8"
);

const js = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/js/PigPenCreator.js",
  "utf8"
);

assert.match(
  html,
  /id="briefCollapse"/,
  "El creador debe incluir un panel plegable para el brief de autoría."
);

assert.match(
  html,
  /id="missionEditorList"/,
  "El creador debe incluir el estudio editable de misiones."
);

assert.match(
  html,
  /id="preguntasPorSalaInput"/,
  "El creador debe permitir definir cuántas preguntas internas se generan por sala."
);

assert.match(
  html,
  /vendor\/bootstrap\/bootstrap\.bundle\.min\.js/,
  "El creador debe cargar Bootstrap local para collapse y estados UI."
);

assert.match(
  css,
  /\.er-workspace\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  "El workspace debe renderizarse como una sola columna."
);

assert.match(
  js,
  /PROJECT_STORAGE_KEY/,
  "El creador debe persistir el proyecto editable en localStorage."
);

assert.match(
  js,
  /data-question-card|renderQuestionCard\(/,
  "El creador debe renderizar y editar todas las preguntas internas de cada sala."
);

console.log("PigPenCreator shell OK.");
