import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolveFillBlankSegments } from "../public/js/science-game-runtime.mjs";

test("conserva un hueco escrito dentro de la frase", () => {
  assert.deepEqual(resolveFillBlankSegments({
    segments: ["La fuerza neta es ", "___", " Newtons."]
  }), ["La fuerza neta es ", "___", " Newtons."]);
});

test("separa un hueco incrustado aunque llegue en un solo segmento", () => {
  assert.deepEqual(resolveFillBlankSegments({
    segments: ["La fuerza neta es ___ Newtons."]
  }), ["La fuerza neta es ", "___", " Newtons."]);
});

test("convierte marcadores [blank] heredados sin duplicar el campo", () => {
  const segments = resolveFillBlankSegments({
    prompt: "El desplazamiento es de [blank] octavos de segundo."
  });
  assert.deepEqual(segments, ["El desplazamiento es de ", "___", " octavos de segundo."]);
  assert.doesNotMatch(segments.join(""), /blank/i);
  assert.equal(segments.filter((segment) => segment === "___").length, 1);
});

test("convierte [blank] aunque venga dentro de segments", () => {
  assert.deepEqual(resolveFillBlankSegments({
    segments: ["La respuesta es [blank]."]
  }), ["La respuesta es ", "___", "."]);
});

test("repara la pregunta incompleta cuando Gemini sólo devuelve la instrucción", () => {
  const prompt = "Completa la oración sobre el grupo funcional que representan los juncos dentro del humedal digital.";
  const expected = ["El grupo funcional que representan los juncos dentro del humedal digital es ", "___", "."];
  assert.deepEqual(resolveFillBlankSegments({ prompt, accepted: ["productores"] }), expected);
  assert.deepEqual(resolveFillBlankSegments({
    prompt,
    accepted: ["productores"],
    segments: [`${prompt}: `, "___", "."]
  }), expected);
});

test("una línea larga o marcadores repetidos producen una sola caja", () => {
  for (const segments of [
    ["La estructura celular es el ______."],
    ["La estructura celular es el ", "___", "___", "."]
  ]) {
    const resolved = resolveFillBlankSegments({ segments });
    assert.equal(resolved.filter((segment) => segment === "___").length, 1);
  }
});

test("completar espacio no repite la pregunta dentro del header", async () => {
  const [runtime, activities] = await Promise.all([
    readFile(new URL("../public/js/science-game-runtime.mjs", import.meta.url), "utf8"),
    readFile(new URL("../public/js/scienceActivities.js", import.meta.url), "utf8")
  ]);
  assert.match(runtime, /const structuredHeaderPrompt = question\.type === "fill-blank"\s*\? ""/);
  assert.match(runtime, /science-structured-question-copy[\s\S]*?\$\{structuredHeaderPrompt\}/);
  assert.match(activities, /let retainedBlank = false;[\s\S]*?if \(retainedBlank\) return false/);
  assert.match(activities, /expectedType === "fill-blank" && !hasAuthoredFillBlankExpression\(assessment\)/);
  assert.match(activities, /repairGeneratedAssessmentShape\(source, expectedType\)/);
  assert.match(activities, /segments debe contener una oración completa/);
});

test("una pregunta heredada infiere el hueco antes de la unidad", () => {
  const segments = resolveFillBlankSegments({
    prompt: "Si aplicas 40 N de empuje contra 40 N de fricción, ¿cuál es la fuerza neta resultante en Newtons?",
    context: "Un contexto largo que no debe reemplazar la expresión.",
    segments: ["Un contexto largo que no debe reemplazar la expresión. ", "___"]
  });
  assert.equal(segments.filter((segment) => segment === "___").length, 1);
  assert.equal(segments.at(-1), " Newtons.");
  assert.doesNotMatch(segments.join(""), /contexto largo/i);
});

test("el CSS limita tipografía y mantiene las acciones en flujo", async () => {
  const [pageCss, exportCss] = await Promise.all([
    readFile(new URL("../public/scienceActivities.css", import.meta.url), "utf8"),
    readFile(new URL("../public/science-assessment-export.css", import.meta.url), "utf8")
  ]);
  for (const css of [pageCss, exportCss]) {
    assert.match(css, /\.science-structured-game\.is-fill-blank>footer\{position:relative!important/);
    assert.match(css, /font-size:clamp\(1rem,1\.55vw,1\.38rem\)!important/);
    assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  }
});
