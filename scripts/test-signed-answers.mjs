import assert from "node:assert/strict";

import {
  normalizeAcceptedAnswers,
  normalizeAcceptedAnswersForSubtype,
  normalizePlayerAnswer,
  getQuestionAcceptedAnswers,
  validateQuestionAnswer,
  normalizeEscapeRoomProject
} from "../public/js/escape-room-creator-model.mjs";

// Test 1: Number subtype with negative integers
const qNegative = {
  tipo_interaccion: "texto",
  subtipo_respuesta: "numero",
  respuesta_correcta: "-3",
  respuestas_aceptadas: ["-3"]
};

const accepted = getQuestionAcceptedAnswers(qNegative);
console.log("Accepted answers for -3:", accepted);
assert.deepEqual(accepted, ["-3"], "Debe aceptar '-3' como respuesta válida.");

assert.equal(validateQuestionAnswer(qNegative, "-3"), true, "Respuesta del jugador '-3' debe ser CORRECTA.");
assert.equal(validateQuestionAnswer(qNegative, " -3 "), true, "Respuesta con espacios ' -3 ' debe ser CORRECTA.");
assert.equal(validateQuestionAnswer(qNegative, "3"), false, "Respuesta del jugador '3' debe ser INCORRECTA cuando la respuesta es -3.");
assert.equal(validateQuestionAnswer(qNegative, "+3"), false, "Respuesta del jugador '+3' debe ser INCORRECTA cuando la respuesta es -3.");

// Test 2: Number subtype with decimals and signs
const qDecimal = {
  tipo_interaccion: "texto",
  subtipo_respuesta: "numero",
  respuesta_correcta: "-3.5",
  respuestas_aceptadas: ["-3.5", "-3,5"]
};

assert.equal(validateQuestionAnswer(qDecimal, "-3.5"), true, "'-3.5' debe ser correcta.");
assert.equal(validateQuestionAnswer(qDecimal, "-3,5"), true, "'-3,5' con coma decimal debe ser correcta.");
assert.equal(validateQuestionAnswer(qDecimal, "3.5"), false, "'3.5' debe ser incorrecta para -3.5.");

// Test 3: Project normalization preserves -3
const project = normalizeEscapeRoomProject({
  misiones: [{
    titulo: "Sala 1",
    preguntas: [{
      tipo_interaccion: "texto",
      subtipo_respuesta: "numero",
      respuesta_correcta: "-3",
      respuestas_aceptadas: ["-3"]
    }]
  }]
});

const normalizedQuestion = project.misiones[0].preguntas[0];
console.log("Normalized question:", normalizedQuestion.respuesta_correcta, normalizedQuestion.respuestas_aceptadas);
assert.equal(normalizedQuestion.respuesta_correcta, "-3");
assert.deepEqual(normalizedQuestion.respuestas_aceptadas, ["-3"]);
assert.equal(validateQuestionAnswer(normalizedQuestion, "-3"), true);
assert.equal(validateQuestionAnswer(normalizedQuestion, "3"), false);

// Test 4: Positive number with +
const qPositive = {
  tipo_interaccion: "texto",
  subtipo_respuesta: "numero",
  respuesta_correcta: "15"
};
assert.equal(validateQuestionAnswer(qPositive, "15"), true);
assert.equal(validateQuestionAnswer(qPositive, "+15"), true);
assert.equal(validateQuestionAnswer(qPositive, "-15"), false);

// Test 5: Short code with math signs
const qFormula = {
  tipo_interaccion: "texto",
  subtipo_respuesta: "codigo_corto",
  respuesta_correcta: "x-3"
};
assert.equal(validateQuestionAnswer(qFormula, "x-3"), true);
assert.equal(validateQuestionAnswer(qFormula, "X-3"), true);
assert.equal(validateQuestionAnswer(qFormula, "x+3"), false);

console.log("All signed answers tests PASSED successfully!");
