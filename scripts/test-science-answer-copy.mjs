import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildScienceAnswerKeyHtml, scienceQuestionAnswers, scienceQuestionScore } from "../public/js/science-answer-export.mjs";

const htmlSource = await readFile(new URL("../public/scienceActivities.html", import.meta.url), "utf8");
const appSource = await readFile(new URL("../public/js/scienceActivities.js", import.meta.url), "utf8");
const moduleSource = await readFile(new URL("../public/js/science-answer-export.mjs", import.meta.url), "utf8");

assert.match(htmlSource, /class="sa-stage-toolbar"[\s\S]*id="copyScienceAnswersBtn"/);
assert.match(appSource, /import \{ copyScienceAnswers \} from "\.\/science-answer-export\.mjs"/);
assert.match(appSource, /copyScienceAnswersBtn[\s\S]*copyScienceAnswers\(state\.activity\)/);
assert.match(moduleSource, /"text\/html": new Blob/);
assert.match(moduleSource, /event\.clipboardData\.setData\("text\/html", markup\)/);
assert.match(moduleSource, /event\.clipboardData\.setData\("text\/plain", markup\)/);

assert.deepEqual(scienceQuestionAnswers({ type: "multiple", options: ["A", "B", "C"], correctAnswers: [0, 2] }), ["A", "C"]);
assert.deepEqual(scienceQuestionAnswers({ type: "matching", pairs: [["Sol", "Estrella"], ["Tierra", "Planeta"]] }), ["Sol → Estrella", "Tierra → Planeta"]);
assert.deepEqual(scienceQuestionAnswers({ type: "timeline-order", events: [{ id: "b", title: "Después" }, { id: "a", title: "Antes" }], correctOrder: ["a", "b"] }), ["Antes → Después"]);

const result = buildScienceAnswerKeyHtml({
  title: "Energía & movimiento",
  subject: "physics",
  topic: "Fuerzas",
  questionsPerLevel: 2,
  assessments: [
    { type: "multiple", prompt: "¿Cuál es la unidad?", options: ["N", "J", "W"], correct: 0, levelIndex: 0, points: 175 },
    { type: "numeric-answer", prompt: "Calcula la fuerza.", correctValue: 12, unit: "N", levelIndex: 0, points: 325 },
    { type: "sequence-order", prompt: "Ordena el análisis.", correctOrder: ["Observar", "Calcular", "Concluir"], levelIndex: 1, points: 500 }
  ]
});

assert.equal(result.questionCount, 3);
assert.equal(result.levelCount, 2);
assert.match(result.html, /Energía &amp; movimiento/);
assert.match(result.html, /Respuesta correcta/);
assert.match(result.html, />N<\/p>/);
assert.match(result.html, /12 N/);
assert.match(result.html, /Observar → Calcular → Concluir/);
assert.match(result.html, /style="[^"]+"/);
assert.match(result.html, /Valor de la pregunta: 175 puntos/);
assert.match(result.html, /Valor de la pregunta: 325 puntos/);
assert.match(result.html, /Valor de la pregunta: 500 puntos/);
assert.match(result.html, /Puntaje máximo de la actividad: 1,000 puntos/);
assert.match(result.html, /Total asignado entre las preguntas: 1,000 puntos/);
assert.doesNotMatch(result.html, /<style|<script/i);
assert.deepEqual(scienceQuestionScore({ points: 175 }), { base: 175, maximum: 175 });
assert.deepEqual(scienceQuestionScore({ points: 500 }), { base: 500, maximum: 500 });
assert.equal(result.configuredTotal, 1000);
assert.equal(result.activityMaximum, 1000);

console.log("Science Activities answer copy OK.");
