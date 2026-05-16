import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const GENERAR_UNIDAD_PATH = new URL("./generarUnidad.js", import.meta.url);

test("declares recursoRefuerzo before promptExtraSections uses it", async () => {
  const source = await readFile(GENERAR_UNIDAD_PATH, "utf8");
  const recursoRefuerzoIndex = source.indexOf("const recursoRefuerzo =");
  const promptExtraSectionsIndex = source.indexOf("const promptExtraSections =");

  assert.notEqual(recursoRefuerzoIndex, -1, "Expected recursoRefuerzo declaration");
  assert.notEqual(promptExtraSectionsIndex, -1, "Expected promptExtraSections declaration");
  assert.ok(
    recursoRefuerzoIndex < promptExtraSectionsIndex,
    "recursoRefuerzo must be declared before promptExtraSections to avoid TDZ ReferenceError"
  );
});

test("teacher notes prompt asks Gemini to create distinct ampliacion and refuerzo activities", async () => {
  const source = await readFile(GENERAR_UNIDAD_PATH, "utf8");

  assert.doesNotMatch(
    source,
    /NO inventes una actividad nueva: parte de la base obligatoria indicada arriba y conviértela en ampliación\./,
    "Ampliacion prompt should no longer force reusing the same general activity"
  );
  assert.match(
    source,
    /Primero analiza las actividades generales y, a partir de ese análisis, propón una actividad NUEVA de ampliación/i,
    "Prompt should require analyzing general activities before proposing ampliacion"
  );
  assert.match(
    source,
    /Debe relacionarse con el mismo tema, pero NO repetir ni parafrasear la actividad general/i,
    "Prompt should forbid repeating the general activity in ampliacion/refuerzo"
  );
});

test("teacher notes fallback no longer repeats the literal lead of the general activity in ampliacion", async () => {
  const source = await readFile(GENERAR_UNIDAD_PATH, "utf8");

  assert.doesNotMatch(
    source,
    /Tome como ampliación la actividad real/,
    "Fallback should not restate the literal general activity as ampliacion"
  );
  assert.match(
    source,
    /Proponga una actividad adicional de ampliación/i,
    "Fallback should build ampliacion as an additional activity"
  );
  assert.match(
    source,
    /Proponga una actividad adicional de refuerzo/i,
    "Fallback should build refuerzo as an additional activity"
  );
});

test("teacher notes add a final adaptation paragraph for diverse learning and accessibility needs", async () => {
  const source = await readFile(GENERAR_UNIDAD_PATH, "utf8");

  assert.match(
    source,
    /Atención a la diversidad y accesibilidad/i,
    "Teacher notes should include a dedicated final adaptation section"
  );
  assert.match(
    source,
    /tdah|hiperactividad|toc|ceguera|sordera/i,
    "Adaptation guidance should mention concrete examples of diverse learning and accessibility needs"
  );
});
