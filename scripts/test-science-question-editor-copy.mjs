import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../public/js/scienceActivities.js", import.meta.url), "utf8");
const styles = await readFile(new URL("../public/scienceActivities.css", import.meta.url), "utf8");

test("el panel de preguntas expone todo el texto mostrado bajo el encabezado", () => {
  assert.match(source, /function buildAssessmentLearningCopyEditor\(assessment = \{\}\)/);
  assert.match(source, /Texto mostrado debajo de la pregunta/);
  for (const id of ["assessmentContext", "assessmentObservationGuide", "assessmentGiven", "assessmentGoal"]) {
    assert.match(source, new RegExp(`id="${id}"`));
    assert.match(source, new RegExp(`event\\.target\\.id === "${id}"`));
  }
  assert.match(source, /const questionCopyEditor = STRUCTURED_ASSESSMENT_TYPES\.has\(assessment\.type\)[\s\S]*?buildAssessmentLearningCopyEditor\(assessment\)/);
  assert.match(source, /<label class="sa-field"><span>Pregunta<\/span>[\s\S]*?\$\{questionCopyEditor\}[\s\S]*?\$\{answerEditor\}/);
});

test("cambiar el tipo de pregunta conserva contexto, guía, datos y objetivo", () => {
  assert.match(source, /const preservedLearningCopy = \{[\s\S]*?context:[\s\S]*?observationGuide:[\s\S]*?given:[\s\S]*?goal:/);
  assert.match(source, /\{ \.\.\.preservedLearningCopy,\s*type,/);
});

test("el bloque compartido tiene una superficie visible en el inspector", () => {
  assert.match(styles, /\.sa-question-copy-editor\{display:grid/);
  assert.match(styles, /\.sa-inspector-subheading\{/);
});
