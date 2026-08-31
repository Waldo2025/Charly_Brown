import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  normalizeProcedureSequence,
  procedureStepText
} from "../public/js/science-assessment-normalization.mjs";

test("extrae el texto de los formatos de objeto enviados por Gemini", () => {
  assert.equal(procedureStepText({ step: 1, description: "Observar la muestra" }), "Observar la muestra");
  assert.equal(procedureStepText({ text: "Registrar resultados", order: 3 }), "Registrar resultados");
  assert.equal(procedureStepText({ action: "Comparar células" }), "Comparar células");
  assert.equal(procedureStepText("[object Object]"), "");
});

test("convierte pasos con IDs y el orden correcto a etiquetas legibles", () => {
  const result = normalizeProcedureSequence([
    { id: "record", label: "Registrar resultados" },
    { id: "observe", label: "Observar la muestra" },
    { id: "compare", action: "Comparar las evidencias" }
  ], ["observe", "compare", "record"]);
  assert.deepEqual(result.steps, ["Registrar resultados", "Observar la muestra", "Comparar las evidencias"]);
  assert.deepEqual(result.correctOrder, ["Observar la muestra", "Comparar las evidencias", "Registrar resultados"]);
  assert.doesNotMatch(JSON.stringify(result), /\[object Object\]/);
});

test("preview y editor reutilizan la normalización defensiva", async () => {
  const editor = await readFile(new URL("../public/js/scienceActivities.js", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../public/js/science-game-runtime.mjs", import.meta.url), "utf8");
  assert.match(editor, /normalizeProcedureSequence\(assessment\.steps, assessment\.correctOrder\)/);
  assert.match(editor, /procedureSequence\.steps\.join\("\\n"\)/);
  assert.match(editor, /const hasUsableProcedure = normalized\.type !== "sequence-order"/);
  assert.match(runtime, /normalizeProcedureSequence\(question\.steps, question\.correctOrder\)/);
});
